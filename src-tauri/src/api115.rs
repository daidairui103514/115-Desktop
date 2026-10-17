//! 115 网盘接口封装。
//!
//! 支持两种凭证：
//! 1. **开放平台 Token**（`access_token` / `refresh_token`）—— 走 `proapi.115.com`，
//!    适合已有授权令牌的场景（例如从 OpenList 复制）。
//! 2. **网页版 Cookie**（扫码登录得到 UID/CID/SEID/KID）—— 走 `webapi.115.com`。
//!
//! 所有请求都在 Rust 侧发出，不受 WebView 的 CORS 限制；
//! 凭证由本模块自行管理并持久化到程序目录，不写系统 Cookie 存储。

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

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
const PROAPI: &str = "https://proapi.115.com";
const PASSPORT: &str = "https://passportapi.115.com";

const AUTH_KEYS: [&str; 4] = ["UID", "CID", "SEID", "KID"];

// ── 状态 ────────────────────────────────────────────────

pub struct AppState {
    pub data_dir: PathBuf,
    pub credential: Mutex<Option<Credential>>,
    pub user: Mutex<Option<UserProfile>>,
}

#[derive(Clone, Serialize, Deserialize)]
pub enum Credential {
    /// 扫码得到的网页 Cookie
    Cookie(HashMap<String, String>),
    /// 开放平台令牌
    Token(TokenSet),
}

#[derive(Clone, Serialize, Deserialize, Default)]
pub struct TokenSet {
    pub access_token: String,
    pub refresh_token: String,
    /// unix 毫秒
    pub expires_at: i64,
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
    /// 当前凭证来源：cookie / token
    pub login_method: String,
}

#[derive(Serialize)]
pub struct QrInfo {
    pub uid: String,
    pub time: u64,
    pub sign: String,
    /// data:image/png;base64,...
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
    /// 0 未知 / 1 文档 / 2 图片 / 3 音频 / 4 视频 / 5 压缩包
    pub category: String,
}

#[derive(Serialize)]
pub struct FilePage {
    pub cid: String,
    pub total: u64,
    pub entries: Vec<FileEntry>,
}

// ── 工具 ────────────────────────────────────────────────

fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

fn client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .user_agent(UA)
        .timeout(std::time::Duration::from_secs(25))
        .build()
        .map_err(|e| format!("无法创建 HTTP 客户端: {e}"))
}

fn cookie_header(cookies: &HashMap<String, String>) -> String {
    cookies
        .iter()
        .map(|(k, v)| format!("{k}={v}"))
        .collect::<Vec<_>>()
        .join("; ")
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

fn credential_path(data_dir: &Path) -> PathBuf {
    data_dir.join("session.json")
}

fn persist(data_dir: &Path, credential: &Credential) {
    if let Ok(text) = serde_json::to_string_pretty(credential) {
        let _ = std::fs::write(credential_path(data_dir), text);
    }
}

fn read_credential(data_dir: &Path) -> Option<Credential> {
    let text = std::fs::read_to_string(credential_path(data_dir)).ok()?;
    serde_json::from_str::<Credential>(&text).ok()
}

fn clear_credential(data_dir: &Path) {
    let _ = std::fs::remove_file(credential_path(data_dir));
}

fn take_credential(state: &tauri::State<'_, AppState>) -> Option<Credential> {
    state.credential.lock().ok().and_then(|g| g.clone())
}

fn store_credential(state: &tauri::State<'_, AppState>, credential: Credential) {
    persist(&state.data_dir, &credential);
    if let Ok(mut guard) = state.credential.lock() {
        *guard = Some(credential);
    }
}

fn err_message(body: &Value, fallback: &str) -> String {
    body.get("message")
        .and_then(Value::as_str)
        .filter(|s| !s.is_empty())
        .unwrap_or(fallback)
        .to_string()
}

fn is_ok(body: &Value) -> bool {
    match body.get("state") {
        Some(Value::Bool(v)) => *v,
        Some(Value::Number(n)) => n.as_i64() == Some(1),
        _ => body
            .get("code")
            .and_then(Value::as_i64)
            .map(|c| c == 0 || c == 200)
            .unwrap_or(false),
    }
}

// ── 令牌管理 ────────────────────────────────────────────

/// access_token 过期前 60 秒自动刷新；refresh_token 每次刷新都会轮换，必须立刻落盘。
async fn ensure_access(http: &reqwest::Client, tokens: &mut TokenSet) -> Result<(), String> {
    if tokens.expires_at > now_ms() + 60_000 {
        return Ok(());
    }
    if tokens.refresh_token.is_empty() {
        return Err("access_token 已过期，且没有填写 refresh_token".into());
    }

    let resp = http
        .post(format!("{PASSPORT}/open/refreshToken"))
        .form(&[("refresh_token", tokens.refresh_token.as_str())])
        .send()
        .await
        .map_err(|e| format!("刷新令牌请求失败: {e}"))?;

    let body: Value = resp.json().await.map_err(|e| format!("刷新响应解析失败: {e}"))?;
    if !is_ok(&body) {
        return Err(err_message(&body, "refresh_token 已失效，需要重新授权"));
    }

    let data = body.get("data").ok_or("刷新响应缺少 data")?;
    let access = data
        .get("access_token")
        .and_then(Value::as_str)
        .ok_or("刷新响应缺少 access_token")?;

    tokens.access_token = access.to_string();
    if let Some(next_refresh) = data.get("refresh_token").and_then(Value::as_str) {
        if !next_refresh.is_empty() {
            tokens.refresh_token = next_refresh.to_string();
        }
    }
    let expires_in = data.get("expires_in").and_then(Value::as_u64).unwrap_or(7200);
    tokens.expires_at = now_ms() + expires_in as i64 * 1000;

    Ok(())
}

// ── 命令：登录 ──────────────────────────────────────────

#[tauri::command]
pub async fn login_with_token(
    access: String,
    refresh: String,
    state: tauri::State<'_, AppState>,
) -> Result<UserProfile, String> {
    let access = access.trim().to_string();
    if access.is_empty() {
        return Err("请填写 access_token".into());
    }

    let tokens = TokenSet {
        access_token: access,
        refresh_token: refresh.trim().to_string(),
        expires_at: now_ms() + 7200_000,
    };

    let http = client()?;
    let mut probe = tokens.clone();
    let profile = fetch_pro_profile(&http, &mut probe).await?;

    store_credential(&state, Credential::Token(probe));
    if let Ok(mut guard) = state.user.lock() {
        *guard = Some(profile.clone());
    }

    Ok(profile)
}

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
    if !is_ok(&body) {
        return Err(err_message(&body, "获取二维码被拒绝"));
    }

    let data = body.get("data").ok_or("响应缺少 data")?;
    let uid = data.get("uid").and_then(Value::as_str).unwrap_or("").to_string();
    let sign = data.get("sign").and_then(Value::as_str).unwrap_or("").to_string();
    let time = data.get("time").and_then(Value::as_u64).unwrap_or(0);

    if uid.is_empty() || sign.is_empty() {
        return Err("二维码参数不完整".into());
    }

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

    store_credential(&state, Credential::Cookie(cookies.clone()));

    let mut profile = fetch_web_profile(&http, &cookies).await.unwrap_or_default();
    profile.login_method = "cookie".into();
    if let Ok(mut guard) = state.user.lock() {
        *guard = Some(profile);
    }

    Ok(PollResult {
        status: 2,
        message: "登录成功".into(),
        logged_in: true,
    })
}

#[tauri::command]
pub async fn auth_status(state: tauri::State<'_, AppState>) -> Result<AuthStatus, String> {
    let credential = take_credential(&state).or_else(|| read_credential(&state.data_dir));

    let Some(mut credential) = credential else {
        return Ok(AuthStatus {
            logged_in: false,
            user: None,
        });
    };

    let http = client()?;
    let profile = match &mut credential {
        Credential::Token(tokens) => match fetch_pro_profile(&http, tokens).await {
            Ok(mut p) => {
                p.login_method = "token".into();
                store_credential(&state, Credential::Token(tokens.clone()));
                Some(p)
            }
            Err(_) => None,
        },
        Credential::Cookie(cookies) => match fetch_web_profile(&http, cookies).await {
            Ok(mut p) => {
                p.login_method = "cookie".into();
                Some(p)
            }
            Err(_) => None,
        },
    };

    let Some(profile) = profile else {
        clear_credential(&state.data_dir);
        if let Ok(mut guard) = state.credential.lock() {
            *guard = None;
        }
        return Ok(AuthStatus {
            logged_in: false,
            user: None,
        });
    };

    if let Ok(mut guard) = state.user.lock() {
        *guard = Some(profile.clone());
    }

    Ok(AuthStatus {
        logged_in: true,
        user: Some(profile),
    })
}

#[tauri::command]
pub async fn logout(state: tauri::State<'_, AppState>) -> Result<(), String> {
    clear_credential(&state.data_dir);
    if let Ok(mut guard) = state.credential.lock() {
        *guard = None;
    }
    if let Ok(mut guard) = state.user.lock() {
        *guard = None;
    }
    Ok(())
}

// ── 命令：文件 ──────────────────────────────────────────

#[tauri::command]
pub async fn list_files(
    cid: String,
    offset: u64,
    limit: u64,
    state: tauri::State<'_, AppState>,
) -> Result<FilePage, String> {
    let mut credential = take_credential(&state).ok_or("尚未登录")?;
    let http = client()?;

    let page = match &mut credential {
        Credential::Token(tokens) => {
            ensure_access(&http, tokens).await?;
            let page = list_pro(&http, tokens, &cid, offset, limit).await?;
            store_credential(&state, Credential::Token(tokens.clone()));
            page
        }
        Credential::Cookie(cookies) => list_web(&http, cookies, &cid, offset, limit).await?,
    };

    Ok(page)
}

async fn list_pro(
    http: &reqwest::Client,
    tokens: &TokenSet,
    cid: &str,
    offset: u64,
    limit: u64,
) -> Result<FilePage, String> {
    let resp = http
        .get(format!("{PROAPI}/open/ufile/files"))
        .query(&[
            ("cid", cid),
            ("offset", &offset.to_string()),
            ("limit", &limit.to_string()),
            ("show_dir", "1"),
        ])
        .header(reqwest::header::AUTHORIZATION, format!("Bearer {}", tokens.access_token))
        .send()
        .await
        .map_err(|e| format!("请求文件列表失败: {e}"))?;

    let body: Value = resp.json().await.map_err(|e| format!("解析文件列表失败: {e}"))?;
    if !is_ok(&body) {
        return Err(err_message(&body, "读取目录失败"));
    }

    let payload = body.get("data").unwrap_or(&body);
    let total = payload.get("count").and_then(Value::as_u64).unwrap_or(0);
    let entries = payload
        .get("data")
        .and_then(Value::as_array)
        .or_else(|| payload.as_array())
        .map(|arr| arr.iter().map(map_entry).collect())
        .unwrap_or_default();

    Ok(FilePage {
        cid: cid.to_string(),
        total,
        entries,
    })
}

async fn list_web(
    http: &reqwest::Client,
    cookies: &HashMap<String, String>,
    cid: &str,
    offset: u64,
    limit: u64,
) -> Result<FilePage, String> {
    let resp = http
        .get(format!("{WEBAPI}/files"))
        .query(&[
            ("aid", "1"),
            ("cid", cid),
            ("o", "user_ptime"),
            ("asc", "0"),
            ("offset", &offset.to_string()),
            ("show_dir", "1"),
            ("limit", &limit.to_string()),
            ("snap", "0"),
            ("natsort", "1"),
            ("format", "json"),
        ])
        .header(reqwest::header::COOKIE, cookie_header(cookies))
        .header(reqwest::header::REFERER, REFERER)
        .send()
        .await
        .map_err(|e| format!("请求文件列表失败: {e}"))?;

    let body: Value = resp.json().await.map_err(|e| format!("解析文件列表失败: {e}"))?;
    if !is_ok(&body) {
        return Err(err_message(&body, "登录状态可能已失效"));
    }

    let total = body.get("count").and_then(Value::as_u64).unwrap_or(0);
    let entries = body
        .get("data")
        .and_then(Value::as_array)
        .map(|arr| arr.iter().map(map_entry).collect())
        .unwrap_or_default();

    Ok(FilePage {
        cid: cid.to_string(),
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

// ── 用户信息 ────────────────────────────────────────────

fn space_of(space: Option<&Value>) -> (Option<String>, Option<String>, Option<String>, u64, u64) {
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

    (
        pick("all_total"),
        pick("all_use"),
        pick("all_remain"),
        pick_bytes("all_total"),
        pick_bytes("all_use"),
    )
}

async fn fetch_pro_profile(
    http: &reqwest::Client,
    tokens: &mut TokenSet,
) -> Result<UserProfile, String> {
    ensure_access(http, tokens).await?;

    let resp = http
        .get(format!("{PROAPI}/open/user/info"))
        .header(reqwest::header::AUTHORIZATION, format!("Bearer {}", tokens.access_token))
        .send()
        .await
        .map_err(|e| format!("获取用户信息失败: {e}"))?;

    let body: Value = resp.json().await.map_err(|e| format!("解析用户信息失败: {e}"))?;
    if !is_ok(&body) {
        return Err(err_message(&body, "令牌无效或已过期"));
    }

    let data = body.get("data").unwrap_or(&body);
    let (total, used, remain, total_bytes, used_bytes) = space_of(data.get("rt_space_info"));

    Ok(UserProfile {
        user_id: data
            .get("user_id")
            .and_then(|v| v.as_i64().or_else(|| v.as_str().and_then(|s| s.parse().ok()))),
        user_name: data.get("user_name").and_then(Value::as_str).map(str::to_string),
        is_vip: data.get("is_vip").and_then(Value::as_bool).unwrap_or(false),
        space_total: total,
        space_used: used,
        space_remain: remain,
        space_total_bytes: total_bytes,
        space_used_bytes: used_bytes,
        login_method: "token".into(),
    })
}

async fn fetch_web_profile(
    http: &reqwest::Client,
    cookies: &HashMap<String, String>,
) -> Result<UserProfile, String> {
    let resp = http
        .get(format!("{WEBAPI}/?ct=ajax&ac=nav"))
        .header(reqwest::header::COOKIE, cookie_header(cookies))
        .header(reqwest::header::REFERER, REFERER)
        .send()
        .await
        .map_err(|e| format!("获取用户信息失败: {e}"))?;

    let body: Value = resp.json().await.map_err(|e| format!("解析用户信息失败: {e}"))?;
    let data = body.get("data").ok_or("登录状态已失效")?;
    let (total, used, remain, total_bytes, used_bytes) = space_of(data.get("space_info"));

    Ok(UserProfile {
        user_id: data
            .get("user_id")
            .and_then(|v| v.as_i64().or_else(|| v.as_str().and_then(|s| s.parse().ok()))),
        user_name: data.get("user_name").and_then(Value::as_str).map(str::to_string),
        is_vip: data.get("is_vip").and_then(Value::as_bool).unwrap_or(false),
        space_total: total,
        space_used: used,
        space_remain: remain,
        space_total_bytes: total_bytes,
        space_used_bytes: used_bytes,
        login_method: "cookie".into(),
    })
}

impl AppState {
    pub fn new(data_dir: PathBuf) -> Self {
        let credential = read_credential(&data_dir);
        Self {
            data_dir,
            credential: Mutex::new(credential),
            user: Mutex::new(None),
        }
    }
}
