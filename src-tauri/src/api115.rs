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
    /// 文件夹的 cid（开放平台里就是它的 fid）；文件为其父目录
    pub cid: String,
    pub name: String,
    pub is_dir: bool,
    /// folder / video / image / audio / archive / subtitle / iso / document
    pub kind: String,
    pub size: u64,
    pub size_text: String,
    pub modified: i64,
    pub pick_code: String,
    pub sha1: String,
    pub thumb: String,
    pub starred: bool,
    pub duration: String,
    pub resolution: String,
}

#[derive(Serialize)]
pub struct OfflineTask {
    pub info_hash: String,
    pub name: String,
    pub size_text: String,
    pub percent: i64,
    /// -1 失败 / 0 分配中 / 1 下载中 / 2 成功
    pub status: i64,
    pub add_time: i64,
}

#[derive(Serialize)]
pub struct FilePage {
    pub cid: String,
    pub total: u64,
    pub entries: Vec<FileEntry>,
}

#[derive(Serialize)]
pub struct OpResult {
    pub ok: u64,
    pub fail: u64,
    pub message: String,
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

// ── 限流与通用调用 ──────────────────────────────────────

/// 115 有账号级频率限制，超了返回 770004。全局串行，间隔 1.1 秒。
async fn throttle() {
    use std::sync::Mutex as StdMutex;
    use std::time::{Duration, Instant};

    static LAST: StdMutex<Option<Instant>> = StdMutex::new(None);
    const GAP: Duration = Duration::from_millis(1100);

    let wait = {
        let mut guard = match LAST.lock() {
            Ok(g) => g,
            Err(p) => p.into_inner(),
        };
        let now = Instant::now();
        let wait = match *guard {
            Some(last) if now.duration_since(last) < GAP => GAP - now.duration_since(last),
            _ => Duration::ZERO,
        };
        *guard = Some(now + wait);
        wait
    };

    if !wait.is_zero() {
        tokio::time::sleep(wait).await;
    }
}

async fn api_get(
    state: &tauri::State<'_, AppState>,
    path: &str,
    query: Vec<(&str, String)>,
) -> Result<Value, String> {
    let mut tokens = state
        .tokens
        .lock()
        .ok()
        .and_then(|g| g.clone())
        .ok_or("尚未登录")?;
    ensure_access(&state.data_dir, &mut tokens).await?;

    throttle().await;
    let http = client()?;
    let resp = http
        .get(format!("{PROAPI}{path}"))
        .query(&query)
        .header(
            reqwest::header::AUTHORIZATION,
            format!("Bearer {}", tokens.access_token),
        )
        .send()
        .await
        .map_err(|e| net_err("请求失败", e))?;

    let body: Value = resp.json().await.map_err(|e| format!("解析响应失败: {e}"))?;
    if let Ok(mut guard) = state.tokens.lock() {
        *guard = Some(tokens);
    }
    if !is_ok(&body) {
        return Err(err_message(&body, "请求失败"));
    }
    Ok(body.get("data").cloned().unwrap_or(Value::Null))
}

async fn api_post(
    state: &tauri::State<'_, AppState>,
    path: &str,
    form: Vec<(&str, String)>,
) -> Result<Value, String> {
    let mut tokens = state
        .tokens
        .lock()
        .ok()
        .and_then(|g| g.clone())
        .ok_or("尚未登录")?;
    ensure_access(&state.data_dir, &mut tokens).await?;

    throttle().await;
    let http = client()?;
    let resp = http
        .post(format!("{PROAPI}{path}"))
        .form(&form)
        .header(
            reqwest::header::AUTHORIZATION,
            format!("Bearer {}", tokens.access_token),
        )
        .send()
        .await
        .map_err(|e| net_err("请求失败", e))?;

    let body: Value = resp.json().await.map_err(|e| format!("解析响应失败: {e}"))?;
    if let Ok(mut guard) = state.tokens.lock() {
        *guard = Some(tokens);
    }
    if !is_ok(&body) {
        return Err(err_message(&body, "请求失败"));
    }
    Ok(body.get("data").cloned().unwrap_or(Value::Null))
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
    mode: String,
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
    let limit = limit.clamp(1, 115);
    let offset_s = offset.to_string();
    let limit_s = limit.to_string();

    let mut query: Vec<(&str, String)> = vec![
        ("cid", cid.clone()),
        ("offset", offset_s),
        ("limit", limit_s),
        ("show_dir", "1".to_string()),
    ];
    match mode.as_str() {
        "starred" => query.push(("star", "1".into())),
        "recent" => {
            query.push(("o", "user_ptime".into()));
            query.push(("asc", "0".into()));
        }
        _ => {}
    }

    let resp = http
        .get(format!("{PROAPI}/open/ufile/files"))
        .query(&query)
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

    // 开放平台的 GetFilesResp 把 []File 内嵌在 Resp 里，
    // 因此 data 直接是数组，count 在顶层。
    let total = body
        .get("count")
        .and_then(Value::as_u64)
        .or_else(|| body.get("data").and_then(|d| d.get("count")).and_then(Value::as_u64))
        .unwrap_or(0);

    let entries = body
        .get("data")
        .and_then(|d| {
            d.as_array()
                .cloned()
                .or_else(|| d.get("data").and_then(Value::as_array).cloned())
        })
        .map(|arr| arr.iter().map(map_entry).collect())
        .unwrap_or_default();

    Ok(FilePage {
        cid,
        total,
        entries,
    })
}

#[tauri::command]
pub async fn offline_tasks(
    page: u64,
    state: tauri::State<'_, AppState>,
) -> Result<Vec<OfflineTask>, String> {
    let mut tokens = state
        .tokens
        .lock()
        .ok()
        .and_then(|g| g.clone())
        .ok_or("尚未登录")?;
    ensure_access(&state.data_dir, &mut tokens).await?;

    let http = client()?;
    let resp = http
        .get(format!("{PROAPI}/open/offline/get_task_list"))
        .query(&[("page", page.to_string())])
        .header(
            reqwest::header::AUTHORIZATION,
            format!("Bearer {}", tokens.access_token),
        )
        .send()
        .await
        .map_err(|e| net_err("获取离线任务失败", e))?;

    let body: Value = resp
        .json()
        .await
        .map_err(|e| format!("解析离线任务失败: {e}"))?;

    if !is_ok(&body) {
        return Err(format!(
            "获取离线任务失败：{}",
            err_message(&body, "未知错误")
        ));
    }

    if let Ok(mut guard) = state.tokens.lock() {
        *guard = Some(tokens);
    }

    let tasks = body
        .get("data")
        .and_then(|d| d.get("tasks"))
        .and_then(Value::as_array)
        .or_else(|| body.get("tasks").and_then(Value::as_array))
        .map(|arr| {
            arr.iter()
                .map(|t| {
                    let s = |k: &str| t.get(k).and_then(Value::as_str).unwrap_or("").to_string();
                    let n = |k: &str| {
                        t.get(k)
                            .and_then(|v| v.as_i64().or_else(|| v.as_str().and_then(|x| x.parse().ok())))
                            .unwrap_or(0)
                    };
                    let size = n("size") as u64;
                    OfflineTask {
                        info_hash: s("info_hash"),
                        name: s("name"),
                        size_text: human_size(size),
                        percent: n("percentDone"),
                        status: n("status"),
                        add_time: n("add_time"),
                    }
                })
                .collect()
        })
        .unwrap_or_default();

    Ok(tasks)
}

fn kind_of(is_dir: bool, isv: u64, ext: &str) -> String {
    if is_dir {
        return "folder".into();
    }
    match ext.to_lowercase().as_str() {
        "mkv" | "mp4" | "avi" | "mov" | "ts" | "m2ts" | "wmv" | "flv" | "rmvb" | "rm" => "video",
        "jpg" | "jpeg" | "png" | "gif" | "webp" | "bmp" | "heic" => "image",
        "mp3" | "flac" | "wav" | "m4a" | "aac" | "ape" | "ogg" => "audio",
        "zip" | "rar" | "7z" | "tar" | "gz" | "bz2" => "archive",
        "ass" | "srt" | "ssa" | "vtt" | "sub" => "subtitle",
        "iso" => "iso",
        _ => {
            if isv == 1 {
                "video"
            } else {
                "document"
            }
        }
    }
    .into()
}

fn format_duration(seconds: u64) -> String {
    if seconds == 0 {
        return String::new();
    }
    let h = seconds / 3600;
    let m = (seconds % 3600) / 60;
    let s = seconds % 60;
    if h > 0 {
        format!("{h}:{m:02}:{s:02}")
    } else {
        format!("{m}:{s:02}")
    }
}

fn resolution_label(def: u64) -> String {
    match def {
        1 => "标清",
        2 => "高清",
        3 => "超清",
        4 => "1080P",
        5 => "4K",
        100 => "原画",
        _ => "",
    }
    .into()
}

fn map_entry(item: &Value) -> FileEntry {
    let s = |k: &str| item.get(k).and_then(Value::as_str).unwrap_or("").to_string();
    let n = |k: &str| {
        item.get(k)
            .and_then(|v| v.as_u64().or_else(|| v.as_str().and_then(|x| x.parse().ok())))
            .unwrap_or(0)
    };

    let fid = s("fid");
    let pid = s("pid");
    let fc = s("fc");
    let is_dir = fc == "0";
    let name = s("fn");
    let size = n("fs");
    let ext = s("ico");
    let isv = n("isv");

    FileEntry {
        id: fid.clone(),
        cid: if is_dir { fid } else { pid },
        name,
        is_dir,
        kind: kind_of(is_dir, isv, &ext),
        size,
        size_text: human_size(size),
        modified: n("upt") as i64,
        pick_code: s("pc"),
        sha1: s("sha1"),
        thumb: s("thumb"),
        starred: s("ism") == "1",
        duration: format_duration(n("play_long")),
        resolution: resolution_label(n("def")),
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

// ── 命令：文件操作 ──────────────────────────────────────

#[tauri::command]
pub async fn rename_file(
    fid: String,
    name: String,
    state: tauri::State<'_, AppState>,
) -> Result<(), String> {
    api_post(
        &state,
        "/open/ufile/update",
        vec![("file_id", fid), ("file_name", name)],
    )
    .await
    .map(|_| ())
}

#[tauri::command]
pub async fn delete_files(
    fids: Vec<String>,
    state: tauri::State<'_, AppState>,
) -> Result<OpResult, String> {
    let mut ok = 0u64;
    let mut fail = 0u64;
    let mut first_err = String::new();

    for fid in &fids {
        match api_post(&state, "/open/ufile/delete", vec![("file_ids", fid.clone())]).await {
            Ok(_) => ok += 1,
            Err(e) => {
                fail += 1;
                if first_err.is_empty() {
                    first_err = e;
                }
            }
        }
        tokio::time::sleep(std::time::Duration::from_millis(150)).await;
    }

    Ok(OpResult {
        ok,
        fail,
        message: first_err,
    })
}

#[tauri::command]
pub async fn move_files(
    fids: Vec<String>,
    to_cid: String,
    state: tauri::State<'_, AppState>,
) -> Result<OpResult, String> {
    let mut ok = 0u64;
    let mut fail = 0u64;
    let mut first_err = String::new();

    for fid in &fids {
        match api_post(
            &state,
            "/open/ufile/move",
            vec![("file_ids", fid.clone()), ("to_cid", to_cid.clone())],
        )
        .await
        {
            Ok(_) => ok += 1,
            Err(e) => {
                fail += 1;
                if first_err.is_empty() {
                    first_err = e;
                }
            }
        }
        tokio::time::sleep(std::time::Duration::from_millis(150)).await;
    }

    Ok(OpResult {
        ok,
        fail,
        message: first_err,
    })
}

#[tauri::command]
pub async fn copy_files(
    fids: Vec<String>,
    to_cid: String,
    state: tauri::State<'_, AppState>,
) -> Result<OpResult, String> {
    let mut ok = 0u64;
    let mut fail = 0u64;
    let mut first_err = String::new();

    for fid in &fids {
        match api_post(
            &state,
            "/open/ufile/copy",
            vec![("pid", to_cid.clone()), ("file_id", fid.clone())],
        )
        .await
        {
            Ok(_) => ok += 1,
            Err(e) => {
                fail += 1;
                if first_err.is_empty() {
                    first_err = e;
                }
            }
        }
        tokio::time::sleep(std::time::Duration::from_millis(150)).await;
    }

    Ok(OpResult {
        ok,
        fail,
        message: first_err,
    })
}

#[tauri::command]
pub async fn create_folder(
    pid: String,
    name: String,
    state: tauri::State<'_, AppState>,
) -> Result<(), String> {
    api_post(
        &state,
        "/open/folder/add",
        vec![("pid", pid), ("file_name", name)],
    )
    .await
    .map(|_| ())
}

#[tauri::command]
pub async fn search_files(
    keyword: String,
    state: tauri::State<'_, AppState>,
) -> Result<Vec<FileEntry>, String> {
    let data = api_get(
        &state,
        "/open/ufile/search",
        vec![
            ("search_value", keyword),
            ("limit", "100".into()),
            ("offset", "0".into()),
        ],
    )
    .await?;

    let arr = data
        .as_array()
        .cloned()
        .or_else(|| data.get("data").and_then(Value::as_array).cloned())
        .unwrap_or_default();

    Ok(arr.iter().map(map_entry).collect())
}

/// 取下载直链。注意：115 的直链与申请时的 User-Agent 绑定。
#[tauri::command]
pub async fn download_url(
    pc: String,
    state: tauri::State<'_, AppState>,
) -> Result<String, String> {
    let data = api_post(&state, "/open/ufile/downurl", vec![("pick_code", pc)]).await?;

    let url = data
        .as_object()
        .and_then(|m| m.values().next())
        .and_then(|v| v.get("url"))
        .and_then(|u| {
            u.get("url")
                .and_then(Value::as_str)
                .or_else(|| u.as_str())
        })
        .unwrap_or("")
        .to_string();

    if url.is_empty() {
        return Err("没有拿到下载地址".into());
    }
    Ok(url)
}

/// 取 115 官方播放流（m3u8，按画质从高到低）
#[tauri::command]
pub async fn video_play_url(
    pc: String,
    state: tauri::State<'_, AppState>,
) -> Result<String, String> {
    let data = api_get(&state, "/open/video/play", vec![("pick_code", pc)]).await?;

    let url = data
        .get("video_url")
        .and_then(Value::as_array)
        .and_then(|arr| arr.first())
        .and_then(|v| v.get("url"))
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_string();

    if url.is_empty() {
        return Err("该文件需要先在 115 云端转码，或暂不支持在线播放".into());
    }
    Ok(url)
}

// ── 命令：回收站 ────────────────────────────────────────

#[derive(Serialize)]
pub struct RecycleItem {
    pub id: String,
    pub name: String,
    pub size_text: String,
    pub is_dir: bool,
    pub delete_time: i64,
}

#[tauri::command]
pub async fn recycle_list(
    state: tauri::State<'_, AppState>,
) -> Result<Vec<RecycleItem>, String> {
    let data = api_get(
        &state,
        "/open/rb/list",
        vec![("limit", "100".into()), ("offset", "0".into())],
    )
    .await?;

    let arr = data
        .as_array()
        .cloned()
        .or_else(|| data.get("data").and_then(Value::as_array).cloned())
        .unwrap_or_default();

    Ok(arr
        .iter()
        .map(|item| {
            // 开放平台各版本回收站字段命名不统一，这里按优先级逐个尝试
            let pick_str = |keys: &[&str]| -> String {
                for key in keys {
                    if let Some(value) = item.get(*key) {
                        if let Some(text) = value.as_str() {
                            if !text.is_empty() {
                                return text.to_string();
                            }
                        }
                        if let Some(num) = value.as_i64() {
                            return num.to_string();
                        }
                    }
                }
                String::new()
            };
            let pick_num = |keys: &[&str]| -> u64 {
                for key in keys {
                    if let Some(value) = item.get(*key) {
                        if let Some(num) = value.as_u64() {
                            return num;
                        }
                        if let Some(num) = value.as_str().and_then(|text| text.parse().ok()) {
                            return num;
                        }
                    }
                }
                0
            };

            let type_flag = pick_str(&["type", "isdir"]);
            let is_dir = type_flag == "0" || type_flag == "true" || pick_num(&["isdir"]) == 1;

            RecycleItem {
                id: pick_str(&["id", "tid", "file_id", "fid"]),
                name: pick_str(&["file_name", "name", "n", "fn"]),
                size_text: human_size(pick_num(&["file_size", "size", "fs", "s"])),
                is_dir,
                delete_time: pick_num(&["delete_time", "dtime", "t", "rtime"]) as i64,
            }
        })
        .collect())
}

#[tauri::command]
pub async fn recycle_revert(
    tid: String,
    state: tauri::State<'_, AppState>,
) -> Result<(), String> {
    api_post(&state, "/open/rb/revert", vec![("tid", tid)])
        .await
        .map(|_| ())
}

#[tauri::command]
pub async fn recycle_clear(state: tauri::State<'_, AppState>) -> Result<(), String> {
    api_post(&state, "/open/rb/del", vec![]).await.map(|_| ())
}

// ── 命令：离线下载 ──────────────────────────────────────

#[tauri::command]
pub async fn offline_add(
    urls: String,
    state: tauri::State<'_, AppState>,
) -> Result<(), String> {
    api_post(&state, "/open/offline/add_task_urls", vec![("urls", urls)])
        .await
        .map(|_| ())
}

#[tauri::command]
pub async fn offline_delete(
    hash: String,
    state: tauri::State<'_, AppState>,
) -> Result<(), String> {
    api_post(
        &state,
        "/open/offline/del_task",
        vec![("info_hash", hash), ("del_source_file", "0".into())],
    )
    .await
    .map(|_| ())
}

#[tauri::command]
pub async fn offline_clear(state: tauri::State<'_, AppState>) -> Result<(), String> {
    api_post(&state, "/open/offline/clear_task", vec![("flag", "1".into())])
        .await
        .map(|_| ())
}
