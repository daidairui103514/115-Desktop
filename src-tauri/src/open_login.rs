//! 115 开放平台设备码登录（OAuth 2.0 + PKCE）。
//!
//! 流程：
//! 1. `GET /open/authDeviceCode` 带上 client_id 与 PKCE challenge，拿到 uid/time/sign
//! 2. 前端把二维码内容渲染成图，用户用手机 115 App 扫
//! 3. `GET qrcodeapi.115.com/get/status/` 轮询扫码状态
//! 4. 确认后用 code_verifier 调 `POST /open/deviceCodeToToken` 换取 token
//!
//! AppID 由用户在设置里自行填写，代码不内置任何人的凭证。
//! 开放平台文档：https://www.yuque.com/115yun/open

use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

use base64::Engine;
use serde::Serialize;
use serde_json::Value;
use sha2::{Digest, Sha256};

use crate::api115::{client, net_err, AppState};
use crate::settings;

const PASSPORT: &str = "https://passportapi.115.com";
const QRCODE: &str = "https://qrcodeapi.115.com";
/// 115PRO 等成熟客户端都用这个 UA，比对普通 Chrome 更不容易被当成异常客户端
const UA: &str = "Mozilla/5.0 115Browser/35.6.0.0";

static VERIFIER: Mutex<Option<String>> = Mutex::new(None);

#[derive(Serialize)]
pub struct DeviceCodeInfo {
    pub uid: String,
    pub time: u64,
    pub sign: String,
    /// 二维码里要承载的文本，前端渲染成图
    pub content: String,
}

#[derive(Serialize)]
pub struct LoginPoll {
    /// 0 等待扫码 / 1 已扫码待确认 / 2 成功 / -1 已过期
    pub status: i32,
    pub message: String,
    pub logged_in: bool,
}

fn b64url(data: &[u8]) -> String {
    base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(data)
}

fn now_nanos() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0)
}

/// PKCE：verifier 43~128 位，challenge = base64url(sha256(verifier))
fn pkce_pair() -> (String, String) {
    let mut hasher = Sha256::new();
    hasher.update(now_nanos().to_string().as_bytes());
    hasher.update(std::process::id().to_string().as_bytes());
    hasher.update(format!("{:?}", std::thread::current().id()).as_bytes());
    let verifier = b64url(&hasher.finalize());

    let challenge = b64url(&Sha256::digest(verifier.as_bytes()));
    (verifier, challenge)
}

#[tauri::command]
pub async fn device_login_start(
    state: tauri::State<'_, AppState>,
) -> Result<DeviceCodeInfo, String> {
    let settings = settings::load(&state.data_dir);
    let client_id = settings.open_client_id.trim().to_string();
    if client_id.is_empty() {
        return Err("请先在「设置」里填写 115 开放平台的 AppID".into());
    }

    let (verifier, challenge) = pkce_pair();
    if let Ok(mut guard) = VERIFIER.lock() {
        *guard = Some(verifier);
    }

    let http = client()?;
    let resp = http
        .get(format!("{PASSPORT}/open/authDeviceCode"))
        .query(&[
            ("client_id", client_id.as_str()),
            ("code_challenge", challenge.as_str()),
            ("code_challenge_method", "sha256"),
        ])
        .header(reqwest::header::USER_AGENT, UA)
        .send()
        .await
        .map_err(|e| net_err("申请设备码失败", e))?;

    let body: Value = resp
        .json()
        .await
        .map_err(|e| format!("设备码响应解析失败: {e}"))?;

    if body.get("state").and_then(Value::as_bool) == Some(false) {
        return Err(format!(
            "申请设备码被拒绝：{}（code {}）",
            body.get("message").and_then(Value::as_str).unwrap_or("未知"),
            body.get("code").and_then(Value::as_i64).unwrap_or(0)
        ));
    }

    let data = body
        .get("data")
        .ok_or_else(|| format!("设备码响应缺少 data：{body}"))?;

    let uid = data
        .get("uid")
        .and_then(Value::as_str)
        .or_else(|| data.get("code_id").and_then(Value::as_str))
        .unwrap_or("")
        .to_string();

    let time = data
        .get("time")
        .and_then(Value::as_u64)
        .or_else(|| data.get("time").and_then(Value::as_str).and_then(|s| s.parse().ok()))
        .unwrap_or(0);

    let sign = data
        .get("sign")
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_string();

    let content = data
        .get("qrcode")
        .and_then(Value::as_str)
        .or_else(|| data.get("qrcode_content").and_then(Value::as_str))
        .or_else(|| data.get("qrcode_url").and_then(Value::as_str))
        .unwrap_or("")
        .to_string();

    if uid.is_empty() || sign.is_empty() {
        return Err(format!("设备码参数不完整：{data}"));
    }

    Ok(DeviceCodeInfo {
        uid,
        time,
        sign,
        content,
    })
}

#[tauri::command]
pub async fn device_login_poll(
    uid: String,
    time: u64,
    sign: String,
    state: tauri::State<'_, AppState>,
) -> Result<LoginPoll, String> {
    let http = client()?;
    let time_s = time.to_string();

    let resp = http
        .get(format!("{QRCODE}/get/status/"))
        .query(&[
            ("uid", uid.as_str()),
            ("time", time_s.as_str()),
            ("sign", sign.as_str()),
        ])
        .header(reqwest::header::USER_AGENT, UA)
        .header(reqwest::header::REFERER, "https://115.com/")
        .send()
        .await
        .map_err(|e| net_err("查询扫码状态失败", e))?;

    let body: Value = resp
        .json()
        .await
        .map_err(|e| format!("状态响应解析失败: {e}"))?;

    let status = body
        .pointer("/data/status")
        .and_then(Value::as_i64)
        .unwrap_or(0) as i32;
    let message = body
        .pointer("/data/msg")
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_string();

    if status != 2 {
        return Ok(LoginPoll {
            status,
            message,
            logged_in: false,
        });
    }

    // 已确认授权，用 verifier 换 token
    let verifier = VERIFIER
        .lock()
        .ok()
        .and_then(|guard| guard.clone())
        .ok_or("缺少 code_verifier，请重新获取二维码")?;

    let settings = settings::load(&state.data_dir);
    let client_id = settings.open_client_id.trim().to_string();

    let token_resp = http
        .post(format!("{PASSPORT}/open/deviceCodeToToken"))
        .form(&[
            ("client_id", client_id.as_str()),
            ("code_verifier", verifier.as_str()),
            ("uid", uid.as_str()),
            ("time", time_s.as_str()),
            ("sign", sign.as_str()),
        ])
        .header(reqwest::header::USER_AGENT, UA)
        .send()
        .await
        .map_err(|e| net_err("换取令牌失败", e))?;

    let token_body: Value = token_resp
        .json()
        .await
        .map_err(|e| format!("令牌响应解析失败: {e}"))?;

    if token_body.get("state").and_then(Value::as_bool) == Some(false) {
        return Err(format!(
            "换取令牌失败：{}（code {}）",
            token_body
                .get("message")
                .and_then(Value::as_str)
                .unwrap_or("未知"),
            token_body.get("code").and_then(Value::as_i64).unwrap_or(0)
        ));
    }

    let data = token_body
        .get("data")
        .ok_or_else(|| format!("令牌响应缺少 data：{token_body}"))?;

    let access = data
        .get("access_token")
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_string();
    let refresh = data
        .get("refresh_token")
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_string();
    let expires_in = data
        .get("expires_in")
        .and_then(Value::as_u64)
        .unwrap_or(7200);

    if access.is_empty() {
        return Err(format!("令牌响应里没有 access_token：{data}"));
    }

    let tokens = crate::api115::TokenSet {
        access_token: access,
        refresh_token: refresh,
        expires_at: (now_nanos() / 1_000_000) as i64 + (expires_in as i64) * 1000,
    };

    let text = serde_json::to_string_pretty(&tokens).map_err(|e| e.to_string())?;
    std::fs::write(state.data_dir.join("session.json"), text)
        .map_err(|e| format!("保存令牌失败: {e}"))?;

    if let Ok(mut guard) = state.tokens.lock() {
        *guard = Some(tokens);
    }

    Ok(LoginPoll {
        status: 2,
        message: "登录成功".into(),
        logged_in: true,
    })
}
