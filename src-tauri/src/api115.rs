//! 115 网盘 Web API 封装。
//!
//! 走的是网页端扫码登录 + Cookie 认证（UID / CID / SEID / KID），
//! 不使用开放平台 OAuth，普通账号即可登录。
//!
//! 所有请求都在 Rust 侧发出，因此不受 WebView 的 CORS 限制；
//! Cookie 由本模块自行管理与持久化，不写系统 Cookie 存储。

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use base64::Engine;
use serde::{Deserialize, Serialize};
use serde_json::Value;

const UA: &str = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 \
                  (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const REFERER: &str = "https://115.com/";

const QR_TOKEN: &str = "https://qrcodeapi.115.com/api/1.0/web/1.0/token";
const QR_IMAGE: &str = "https://qrcodeapi.115.com/api/1.0/web/1.0/qrcode";
const QR_STATUS: &str = "https://qrcodeapi.115.com/get/status/";
const WEBAPI: &str = "https://webapi.115.com";

/// 参与认证的 Cookie 键，其余（统计类）忽略
const AUTH_KEYS: [&str; 4] = ["UID", "CID", "SEID", "KID"];

pub struct AppState {
    pub data_dir: PathBuf,
    pub session: Mutex<Option<Session>>,
    pub user: Mutex<Option<UserProfile>>,
}

#[derive(Clone, Serialize, Deserialize, Default)]
pub struct Session {
    pub cookies: HashMap<String, String>,
}

#[derive(Clone, Serialize, Deserialize, Default)]
pub struct UserProfile {
    pub user_id: Option<i64>,
    pub user_name: Option<String>,
    pub is_vip: bool,
    pub space_total: Option<String>,
    pub space_used: Option<String>,
    pub space_remain: Option<String>,
    pub space_total_bytes: u64,
    pub space_used_bytes: u64,
}

#[derive(Serialize)]
pub struct QrInfo {
    pub uid: String,
    pub time: u64,
    pub sign: String,
    /// data:image/png;base64,... —— 前端直接放进 <img>
    pub image: String,
}

#[derive(Serialize)]
pub struct PollResult {
    /// 0 等待扫码 / 1 已扫码待确认 / 2 登录成功 / -1 已过期
    pub status: i32,
    pub message: String,
    pub logged_in: bool,
}

#[derive(Serialize)]
pub struct AuthStatus {
    pub logged_in: bool,
    pub user: Option<UserProfile>,
}

#[derive(Serialize)]
pub struct FileEntry {
    pub id: String,
    /// 文件夹的 cid；文件为空
    pub cid: String,
    pub name: String,
    pub is_dir: bool,
    pub size: u64,
    pub size_text: String,
    pub modified: i64,
    pub pick_code: String,
    pub sha1: String,
    /// 文件分类：0 未知 / 1 文档 / 2 图片 / 3 音频 / 4 视频 / 5 压缩包
    pub category: String,
}

#[derive(Serialize)]
pub struct FilePage {
    pub cid: String,
    pub total: u64,
    pub entries: Vec<FileEntry>,
}

fn client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .user_agent(UA)
        .timeout(std::time::Duration::from_secs(25))
        .build()
        .map_err(|e| format!("无法创建 HTTP 客户端: {e}"))
}

fn cookie_header(session: &Session) -> String {
    session
        .cookies
        .iter()
        .map(|(k, v)| format!("{k}={v}"))
        .collect::<Vec<_>>()
        .join("; ")
}

/// 从 Set-Cookie 头里抽取登录态，兼容一个响应下发多条 Cookie 的情况
fn extract_auth_cookies(headers: &reqwest::header::HeaderMap) -> HashMap<String, String> {
    let mut out = HashMap::new();
    for value in headers.get_all(reqwest::header::SET_COOKIE).iter() {
        let Ok(raw) = value.to_str() else { continue };
        for part in raw.split(',') {
            let pair = part.split(';').next().unwrap_or("").trim();
            let Some((k, v)) = pair.split_once('=') else { continue };
            let key = k.trim();
            if AUTH_KEYS.contains(&key) && !v.trim().is_empty() {
                out.insert(key.to_string(), v.trim().to_string());
            }
        }
    }
    out
}

fn human_size(bytes: u64) -> String {
    const UNITS: [&str; 5] = ["B", "KB", "MB", "GB", "TB"];
    if bytes == 0 {
        return "—".into();
    }
    let mut value = bytes as f64;
    let mut idx = 0;
    while value >= 1024.0 && idx < UNITS.len() - 1 {
        value /= 1024.0;
        idx += 1;
    }
    if idx == 0 || value >= 100.0 {
        format!("{value:.0} {}", UNITS[idx])
    } else {
        format!("{value:.1} {}", UNITS[idx])
    }
}

fn session_path(data_dir: &Path) -> PathBuf {
    data_dir.join("session.json")
}

fn persist_session(data_dir: &Path, session: &Session) {
    if let Ok(text) = serde_json::to_string_pretty(session) {
        let _ = std::fs::write(session_path(data_dir), text);
    }
}

fn read_session(data_dir: &Path) -> Option<Session> {
    let text = std::fs::read_to_string(session_path(data_dir)).ok()?;
    serde_json::from_str::<Session>(&text).ok()
}

fn clear_session(data_dir: &Path) {
    let _ = std::fs::remove_file(session_path(data_dir));
}

// ── 命令 ────────────────────────────────────────────────

#[tauri::command]
pub async fn qr_start() -> Result<QrInfo, String> {
    let http = client()?;
    let resp = http
        .get(QR_TOKEN)
        .header(reqwest::header::REFERER, REFERER)
        .send()
        .await
        .map_err(|e| format!("获取二维码失败: {e}"))?;

    let body: Value = resp.json().await.map_err(|e| format!("解析响应失败: {e}"))?;
    if body.get("state").and_then(Value::as_i64) != Some(1) {
        return Err(format!(
            "获取二维码被拒绝: {}",
            body.get("message").and_then(Value::as_str).unwrap_or("未知错误")
        ));
    }

    let data = body.get("data").ok_or("响应缺少 data")?;
    let uid = data.get("uid").and_then(Value::as_str).unwrap_or("").to_string();
    let sign = data.get("sign").and_then(Value::as_str).unwrap_or("").to_string();
    let time = data.get("time").and_then(Value::as_u64).unwrap_or(0);

    if uid.is_empty() || sign.is_empty() {
        return Err("二维码参数不完整".into());
    }

    // 官方二维码图片
    let img_resp = http
        .get(QR_IMAGE)
        .query(&[("uid", uid.as_str())])
        .header(reqwest::header::REFERER, REFERER)
        .send()
        .await
        .map_err(|e| format!("下载二维码图片失败: {e}"))?;

    let bytes = img_resp.bytes().await.map_err(|e| format!("读取二维码失败: {e}"))?;
    let b64 = base64::engine::general_purpose::STANDARD.encode(&bytes);

    Ok(QrInfo {
        uid,
        time,
        sign,
        image: format!("data:image/png;base64,{b64}"),
    })
}

#[tauri::command]
pub async fn qr_poll(
    uid: String,
    time: u64,
    sign: String,
    state: tauri::State<'_, AppState>,
) -> Result<PollResult, String> {
    let http = client()?;
    let resp = http
        .get(QR_STATUS)
        .query(&[
            ("uid", uid.as_str()),
            ("time", &time.to_string()),
            ("sign", sign.as_str()),
        ])
        .header(reqwest::header::REFERER, REFERER)
        .send()
        .await
        .map_err(|e| format!("轮询失败: {e}"))?;

    let headers = resp.headers().clone();
    let body: Value = resp.json().await.map_err(|e| format!("解析轮询响应失败: {e}"))?;

    let data = body.get("data");
    let status = data
        .and_then(|d| d.get("status"))
        .and_then(Value::as_i64)
        .unwrap_or(-1) as i32;
    let message = data
        .and_then(|d| d.get("msg"))
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_string();

    if status != 2 {
        return Ok(PollResult {
            status,
            message,
            logged_in: false,
        });
    }

    let cookies = extract_auth_cookies(&headers);
    if cookies.is_empty() {
        return Err("扫码已确认，但没有拿到登录凭证，请重试".into());
    }

    let session = Session { cookies };
    persist_session(&state.data_dir, &session);

    if let Ok(mut guard) = state.session.lock() {
        *guard = Some(session.clone());
    }

    // 顺手拉一次用户信息，失败不影响登录
    if let Ok(profile) = fetch_profile(&http, &session).await {
        if let Ok(mut guard) = state.user.lock() {
            *guard = Some(profile);
        }
    }

    Ok(PollResult {
        status: 2,
        message: "登录成功".into(),
        logged_in: true,
    })
}

#[tauri::command]
pub async fn auth_status(state: tauri::State<'_, AppState>) -> Result<AuthStatus, String> {
    let session = state
        .session
        .lock()
        .ok()
        .and_then(|g| g.clone())
        .or_else(|| read_session(&state.data_dir));

    let Some(session) = session else {
        return Ok(AuthStatus {
            logged_in: false,
            user: None,
        });
    };

    // 用一次真实请求验证 Cookie 是否还有效
    let http = client()?;
    let ok = match http
        .get(format!("{WEBAPI}/files"))
        .query(&[
            ("aid", "1"),
            ("cid", "0"),
            ("limit", "1"),
            ("show_dir", "1"),
            ("format", "json"),
        ])
        .header(reqwest::header::COOKIE, cookie_header(&session))
        .header(reqwest::header::REFERER, REFERER)
        .send()
        .await
    {
        Ok(resp) => match resp.json::<Value>().await {
            Ok(body) => body.get("state").and_then(Value::as_bool).unwrap_or(false),
            Err(_) => false,
        },
        Err(_) => false,
    };

    if !ok {
        clear_session(&state.data_dir);
        if let Ok(mut guard) = state.session.lock() {
            *guard = None;
        }
        return Ok(AuthStatus {
            logged_in: false,
            user: None,
        });
    }

    if let Ok(mut guard) = state.session.lock() {
        *guard = Some(session.clone());
    }

    let profile = fetch_profile(&http, &session).await.ok();
    if let Some(p) = &profile {
        if let Ok(mut guard) = state.user.lock() {
            *guard = Some(p.clone());
        }
    }

    Ok(AuthStatus {
        logged_in: true,
        user: profile,
    })
}

#[tauri::command]
pub async fn logout(state: tauri::State<'_, AppState>) -> Result<(), String> {
    clear_session(&state.data_dir);
    if let Ok(mut guard) = state.session.lock() {
        *guard = None;
    }
    if let Ok(mut guard) = state.user.lock() {
        *guard = None;
    }
    Ok(())
}

#[tauri::command]
pub async fn list_files(
    cid: String,
    offset: u64,
    limit: u64,
    state: tauri::State<'_, AppState>,
) -> Result<FilePage, String> {
    let session = state
        .session
        .lock()
        .ok()
        .and_then(|g| g.clone())
        .ok_or("尚未登录")?;

    let http = client()?;
    let resp = http
        .get(format!("{WEBAPI}/files"))
        .query(&[
            ("aid", "1"),
            ("cid", cid.as_str()),
            ("o", "user_ptime"),
            ("asc", "0"),
            ("offset", &offset.to_string()),
            ("show_dir", "1"),
            ("limit", &limit.to_string()),
            ("snap", "0"),
            ("natsort", "1"),
            ("format", "json"),
        ])
        .header(reqwest::header::COOKIE, cookie_header(&session))
        .header(reqwest::header::REFERER, REFERER)
        .send()
        .await
        .map_err(|e| format!("请求文件列表失败: {e}"))?;

    let body: Value = resp.json().await.map_err(|e| format!("解析文件列表失败: {e}"))?;

    if body.get("state").and_then(Value::as_bool) != Some(true) {
        // 有些版本 state 返回 1
        if body.get("state").and_then(Value::as_i64) != Some(1) {
            let msg = body
                .get("message")
                .and_then(Value::as_str)
                .unwrap_or("登录状态可能已失效");
            return Err(msg.to_string());
        }
    }

    let total = body.get("count").and_then(Value::as_u64).unwrap_or(0);
    let entries = body
        .get("data")
        .and_then(Value::as_array)
        .map(|arr| arr.iter().map(map_entry).collect())
        .unwrap_or_default();

    Ok(FilePage {
        cid,
        total,
        entries,
    })
}

fn map_entry(item: &Value) -> FileEntry {
    let name = item.get("n").and_then(Value::as_str).unwrap_or("").to_string();
    let fid = item.get("fid").and_then(Value::as_str).unwrap_or("");
    let is_dir = fid.is_empty();
    let size = item.get("s").and_then(Value::as_u64).unwrap_or(0);
    let cid = item.get("cid").and_then(Value::as_str).unwrap_or("").to_string();

    FileEntry {
        id: if is_dir {
            format!("d-{cid}")
        } else {
            format!("f-{fid}")
        },
        cid: if is_dir { cid } else { String::new() },
        name,
        is_dir,
        size,
        size_text: human_size(size),
        modified: item.get("t").and_then(Value::as_i64).unwrap_or(0),
        pick_code: item.get("pc").and_then(Value::as_str).unwrap_or("").to_string(),
        sha1: item.get("sha").and_then(Value::as_str).unwrap_or("").to_string(),
        category: item
            .get("c")
            .map(|v| v.as_str().map(str::to_string).unwrap_or_else(|| v.to_string()))
            .unwrap_or_default(),
    }
}

async fn fetch_profile(http: &reqwest::Client, session: &Session) -> Result<UserProfile, String> {
    let resp = http
        .get(format!("{WEBAPI}/?ct=ajax&ac=nav"))
        .header(reqwest::header::COOKIE, cookie_header(session))
        .header(reqwest::header::REFERER, REFERER)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    let body: Value = resp.json().await.map_err(|e| e.to_string())?;
    let data = body.get("data").ok_or("无用户数据")?;

    let space = data.get("space_info");
    let pick = |key: &str| -> Option<String> {
        space
            .and_then(|s| s.get(key))
            .and_then(|v| v.get("size_format"))
            .and_then(Value::as_str)
            .map(str::to_string)
    };
    let pick_bytes = |key: &str| -> u64 {
        space
            .and_then(|s| s.get(key))
            .and_then(|v| v.get("size"))
            .and_then(|v| {
                v.as_u64()
                    .or_else(|| v.as_str().and_then(|s| s.parse::<u64>().ok()))
            })
            .unwrap_or(0)
    };

    Ok(UserProfile {
        user_id: data.get("user_id").and_then(Value::as_i64),
        user_name: data.get("user_name").and_then(Value::as_str).map(str::to_string),
        is_vip: data.get("is_vip").and_then(Value::as_bool).unwrap_or(false),
        space_total: pick("all_total"),
        space_used: pick("all_use"),
        space_remain: pick("all_remain"),
        space_total_bytes: pick_bytes("all_total"),
        space_used_bytes: pick_bytes("all_use"),
    })
}

impl AppState {
    pub fn new(data_dir: PathBuf) -> Self {
        let session = read_session(&data_dir);
        Self {
            data_dir,
            session: Mutex::new(session),
            user: Mutex::new(None),
        }
    }
}
