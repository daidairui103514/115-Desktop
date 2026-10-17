//! 115 开放平台接口封装。
//!
//! 只做令牌登录（`access_token` + `refresh_token`），走 `proapi.115.com`。
//! 所有请求都在 Rust 侧发出，不受 WebView 的 CORS 限制；
//! 令牌保存在程序目录的 `session.json`，不写系统凭据存储。

use std::error::Error as StdError;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use serde_json::Value;

const UA: &str = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 \
                  (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const PROAPI: &str = "https://proapi.115.com";
const PASSPORT: &str = "https://passportapi.115.com";

pub struct AppState {
    pub data_dir: PathBuf,
    pub tokens: Mutex<Option<TokenSet>>,
    pub user: Mutex<Option<UserProfile>>,
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

/// 把 reqwest 的错误拆到底层，方便定位是 DNS、TLS 还是代理的问题
fn net_err(prefix: &str, err: reqwest::Error) -> String {
    let mut msg = format!("{prefix}: {err}");
    if err.is_timeout() {
        msg.push_str("\n（请求超时）");
    } else if err.is_connect() {
        msg.push_str("\n（无法建立连接，请检查网络或代理设置）");
    }

    let mut source = StdError::source(&err);
    let mut depth = 0;
    while let Some(cause) = source {
        msg.push_str(&format!("\n  → {cause}"));
        source = cause.source();
        depth += 1;
        if depth >= 3 {
            break;
        }
    }
    msg
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

fn token_path(data_dir: &Path) -> PathBuf {
    data_dir.join("session.json")
}

fn persist(data_dir: &Path, tokens: &TokenSet) {
    if let Ok(text) = serde_json::to_string_pretty(tokens) {
        let _ = std::fs::write(token_path(data_dir), text);
    }
}

fn read_tokens(data_dir: &Path) -> Option<TokenSet> {
    let text = std::fs::read_to_string(token_path(data_dir)).ok()?;
    serde_json::from_str::<TokenSet>(&text).ok()
}

fn clear_tokens(data_dir: &Path) {
    let _ = std::fs::remove_file(token_path(data_dir));
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

// ── 令牌 ────────────────────────────────────────────────

/// access_token 过期前 60 秒自动刷新。
/// ⚠️ 115 的 refresh_token 每次刷新都会轮换，刷新后必须立刻落盘。
async fn ensure_access(data_dir: &Path, tokens: &mut TokenSet) -> Result<(), String> {
    if tokens.expires_at > now_ms() + 60_000 {
        return Ok(());
    }
    if tokens.refresh_token.is_empty() {
        return Err("访问令牌已过期，且没有填写刷新令牌".into());
    }

    let http = client()?;
    let resp = http
        .post(format!("{PASSPORT}/open/refreshToken"))
        .form(&[("refresh_token", tokens.refresh_token.as_str())])
        .send()
        .await
        .map_err(|e| net_err("刷新令牌失败", e))?;

    let body: Value = resp
        .json()
        .await
        .map_err(|e| format!("刷新响应解析失败: {e}"))?;

    if !is_ok(&body) {
        return Err(format!(
            "刷新令牌失败：{}（刷新令牌可能已失效，需要重新授权）",
            err_message(&body, "未知错误")
        ));
    }

    let data = body.get("data").ok_or("刷新响应缺少 data")?;
    let access = data
        .get("access_token")
        .and_then(Value::as_str)
        .ok_or("刷新响应缺少 access_token")?;

    tokens.access_token = access.to_string();
    if let Some(next) = data.get("refresh_token").and_then(Value::as_str) {
        if !next.is_empty() {
            tokens.refresh_token = next.to_string();
        }
    }
    let expires_in = data.get("expires_in").and_then(Value::as_u64).unwrap_or(7200);
    tokens.expires_at = now_ms() + expires_in as i64 * 1000;

    // 轮换后的新 refresh_token 必须马上写回
    persist(data_dir, tokens);
    Ok(())
}

// ── 命令 ────────────────────────────────────────────────

#[tauri::command]
pub async fn login_with_token(
    access: String,
    refresh: String,
    state: tauri::State<'_, AppState>,
) -> Result<UserProfile, String> {
    let access = access.trim().to_string();
    if access.is_empty() {
        return Err("请填写访问令牌".into());
    }

    let mut tokens = TokenSet {
        access_token: access,
        refresh_token: refresh.trim().to_string(),
        expires_at: now_ms() + 7200_000,
    };

    let profile = fetch_profile(&state.data_dir, &mut tokens).await?;

    persist(&state.data_dir, &tokens);
    if let Ok(mut guard) = state.tokens.lock() {
        *guard = Some(tokens);
    }
    if let Ok(mut guard) = state.user.lock() {
        *guard = Some(profile.clone());
    }

    Ok(profile)
}

#[tauri::command]
pub async fn auth_status(state: tauri::State<'_, AppState>) -> Result<AuthStatus, String> {
    let stored = state
        .tokens
        .lock()
        .ok()
        .and_then(|g| g.clone())
        .or_else(|| read_tokens(&state.data_dir));

    let Some(mut tokens) = stored else {
        return Ok(AuthStatus {
            logged_in: false,
            user: None,
        });
    };

    match fetch_profile(&state.data_dir, &mut tokens).await {
        Ok(profile) => {
            if let Ok(mut guard) = state.tokens.lock() {
                *guard = Some(tokens);
            }
            if let Ok(mut guard) = state.user.lock() {
                *guard = Some(profile.clone());
            }
            Ok(AuthStatus {
                logged_in: true,
                user: Some(profile),
            })
        }
        Err(reason) => {
            // 令牌彻底失效才清空；网络问题不应把用户登出
            if reason.contains("令牌") {
                clear_tokens(&state.data_dir);
                if let Ok(mut guard) = state.tokens.lock() {
                    *guard = None;
                }
            }
            Ok(AuthStatus {
                logged_in: false,
                user: None,
            })
        }
    }
}

#[tauri::command]
pub async fn logout(state: tauri::State<'_, AppState>) -> Result<(), String> {
    clear_tokens(&state.data_dir);
    if let Ok(mut guard) = state.tokens.lock() {
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
    let mut tokens = state
        .tokens
        .lock()
        .ok()
        .and_then(|g| g.clone())
        .ok_or("尚未登录")?;

    ensure_access(&state.data_dir, &mut tokens).await?;

    let http = client()?;
    let limit = limit.clamp(1, 100);

    let resp = http
        .get(format!("{PROAPI}/open/ufile/files"))
        .query(&[
            ("cid", cid.as_str()),
            ("offset", &offset.to_string()),
            ("limit", &limit.to_string()),
            ("show_dir", "1"),
        ])
        .header(
            reqwest::header::AUTHORIZATION,
            format!("Bearer {}", tokens.access_token),
        )
        .send()
        .await
        .map_err(|e| net_err("请求文件列表失败", e))?;

    let body: Value = resp
        .json()
        .await
        .map_err(|e| format!("解析文件列表失败: {e}"))?;

    if !is_ok(&body) {
        return Err(format!(
            "读取目录失败：{}",
            err_message(&body, "令牌可能已失效")
        ));
    }

    if let Ok(mut guard) = state.tokens.lock() {
        *guard = Some(tokens);
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
        cid,
        total,
        entries,
    })
}

fn map_entry(item: &Value) -> FileEntry {
    let name = item.get("n").and_then(Value::as_str).unwrap_or("").to_string();
    let fid = item.get("fid").and_then(Value::as_str).unwrap_or("");
    let is_dir = fid.is_empty();
    let size = item
        .get("s")
        .and_then(|v| v.as_u64().or_else(|| v.as_str().and_then(|s| s.parse().ok())))
        .unwrap_or(0);
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
        modified: item
            .get("t")
            .and_then(|v| v.as_i64().or_else(|| v.as_str().and_then(|s| s.parse().ok())))
            .unwrap_or(0),
        pick_code: item.get("pc").and_then(Value::as_str).unwrap_or("").to_string(),
        sha1: item.get("sha").and_then(Value::as_str).unwrap_or("").to_string(),
        category: item
            .get("c")
            .map(|v| v.as_str().map(str::to_string).unwrap_or_else(|| v.to_string()))
            .unwrap_or_default(),
    }
}

// ── 用户信息 ────────────────────────────────────────────

async fn fetch_profile(
    data_dir: &Path,
    tokens: &mut TokenSet,
) -> Result<UserProfile, String> {
    ensure_access(data_dir, tokens).await?;

    let http = client()?;
    let resp = http
        .get(format!("{PROAPI}/open/user/info"))
        .header(
            reqwest::header::AUTHORIZATION,
            format!("Bearer {}", tokens.access_token),
        )
        .send()
        .await
        .map_err(|e| net_err("获取用户信息失败", e))?;

    let body: Value = resp
        .json()
        .await
        .map_err(|e| format!("解析用户信息失败: {e}"))?;

    if !is_ok(&body) {
        return Err(format!(
            "令牌无效：{}",
            err_message(&body, "请确认访问令牌是否正确")
        ));
    }

    let data = body.get("data").unwrap_or(&body);
    let space = data.get("rt_space_info");

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
        user_id: data.get("user_id").and_then(|v| {
            v.as_i64()
                .or_else(|| v.as_str().and_then(|s| s.parse().ok()))
        }),
        user_name: data
            .get("user_name")
            .and_then(Value::as_str)
            .map(str::to_string),
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
        let tokens = read_tokens(&data_dir);
        Self {
            data_dir,
            tokens: Mutex::new(tokens),
            user: Mutex::new(None),
        }
    }
}
