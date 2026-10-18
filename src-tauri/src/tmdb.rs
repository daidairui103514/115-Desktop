//! TMDb 元数据与海报。
//!
//! 115 开放平台不返回视频封面，海报只能靠外部元数据源。
//! 豆瓣没有公开 API，这里用 TMDb。
//!
//! 两个现实约束：
//! 1. `api.themoviedb.org` / `image.tmdb.org` 在国内直连不通，必须走代理
//! 2. 用户不一定一直开着代理，所以海报**下载后存本地**，下次直接读缓存

use std::time::Duration;

use serde::Serialize;
use serde_json::Value;
use sha1::{Digest, Sha1};

use crate::api115::AppState;
use crate::settings;

const API: &str = "https://api.themoviedb.org/3";
const IMG_BASE: &str = "https://image.tmdb.org/t/p/w342";
const UA: &str = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 \
                  (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

#[derive(Serialize)]
pub struct TmdbHit {
    pub id: i64,
    pub title: String,
    pub year: String,
    pub poster: String,
    pub overview: String,
    pub media_type: String,
}

fn build_client(proxy: &str) -> Result<reqwest::Client, String> {
    let mut builder = reqwest::Client::builder()
        .user_agent(UA)
        .timeout(Duration::from_secs(30));
    if !proxy.trim().is_empty() {
        if let Ok(p) = reqwest::Proxy::all(proxy.trim()) {
            builder = builder.proxy(p);
        }
    }
    builder.build().map_err(|e| e.to_string())
}

fn hash_name(name: &str) -> String {
    let mut hasher = Sha1::new();
    hasher.update(name.as_bytes());
    hex::encode(hasher.finalize())
}

fn data_url(bytes: &[u8]) -> String {
    let b64 = base64::engine::general_purpose::STANDARD.encode(bytes);
    format!("data:image/jpeg;base64,{b64}")
}

async fn search_once(
    client: &reqwest::Client,
    key: &str,
    keyword: &str,
) -> Result<Vec<TmdbHit>, String> {
    let resp = client
        .get(format!("{API}/search/multi"))
        .query(&[
            ("api_key", key.to_string()),
            ("language", "zh-CN".to_string()),
            ("include_adult", "false".to_string()),
            ("query", keyword.to_string()),
        ])
        .send()
        .await
        .map_err(|e| format!("TMDb 请求失败（检查代理）: {e}"))?;

    let body: Value = resp
        .json()
        .await
        .map_err(|e| format!("TMDb 响应解析失败: {e}"))?;

    if let Some(status) = body.get("status_message").and_then(Value::as_str) {
        return Err(format!("TMDb: {status}"));
    }

    Ok(body
        .get("results")
        .and_then(Value::as_array)
        .map(|items| {
            items
                .iter()
                .filter(|item| {
                    item.get("media_type")
                        .and_then(Value::as_str)
                        .map(|t| t != "person")
                        .unwrap_or(false)
                })
                .take(8)
                .map(|item| {
                    let poster_path = item.get("poster_path").and_then(Value::as_str).unwrap_or("");
                    let title = item
                        .get("title")
                        .and_then(Value::as_str)
                        .or_else(|| item.get("name").and_then(Value::as_str))
                        .unwrap_or("")
                        .to_string();
                    let date = item
                        .get("release_date")
                        .and_then(Value::as_str)
                        .or_else(|| item.get("first_air_date").and_then(Value::as_str))
                        .unwrap_or("");

                    TmdbHit {
                        id: item.get("id").and_then(Value::as_i64).unwrap_or(0),
                        title,
                        year: date.chars().take(4).collect(),
                        poster: if poster_path.is_empty() {
                            String::new()
                        } else {
                            format!("{IMG_BASE}{poster_path}")
                        },
                        overview: item
                            .get("overview")
                            .and_then(Value::as_str)
                            .unwrap_or("")
                            .chars()
                            .take(140)
                            .collect(),
                        media_type: item
                            .get("media_type")
                            .and_then(Value::as_str)
                            .unwrap_or("")
                            .to_string(),
                    }
                })
                .collect::<Vec<_>>()
        })
        .unwrap_or_default())
}

#[tauri::command]
pub async fn tmdb_search(
    query: String,
    state: tauri::State<'_, AppState>,
) -> Result<Vec<TmdbHit>, String> {
    let settings = settings::load(&state.data_dir);
    let key = settings.tmdb_key.trim().to_string();
    if key.is_empty() {
        return Err("还没填 TMDb API Key，去「设置」里填一下".into());
    }
    if query.trim().is_empty() {
        return Ok(Vec::new());
    }

    let client = build_client(&settings.proxy)?;
    search_once(&client, &key, query.trim()).await
}

/// 取海报：命中本地缓存直接返回，否则搜索 + 下载 + 落盘，返回 data URL。
/// 这样代理关掉之后依然能显示之前抓过的海报。
#[tauri::command]
pub async fn tmdb_poster(
    query: String,
    state: tauri::State<'_, AppState>,
) -> Result<String, String> {
    let keyword = query.trim();
    if keyword.is_empty() {
        return Ok(String::new());
    }

    let cache_dir = state.data_dir.join("posters");
    std::fs::create_dir_all(&cache_dir).ok();
    let cache_file = cache_dir.join(format!("{}.jpg", hash_name(keyword)));

    if cache_file.exists() {
        if let Ok(bytes) = std::fs::read(&cache_file) {
            if !bytes.is_empty() {
                return Ok(data_url(&bytes));
            }
        }
    }

    let settings = settings::load(&state.data_dir);
    let key = settings.tmdb_key.trim().to_string();
    if key.is_empty() {
        return Err("还没填 TMDb API Key，去「设置」里填一下".into());
    }

    let client = build_client(&settings.proxy)?;
    let hits = search_once(&client, &key, keyword).await?;
    let Some(poster) = hits.iter().find(|hit| !hit.poster.is_empty()) else {
        return Ok(String::new());
    };

    let resp = client
        .get(&poster.poster)
        .send()
        .await
        .map_err(|e| format!("下载海报失败（检查代理）: {e}"))?;

    let bytes = resp
        .bytes()
        .await
        .map_err(|e| format!("读取海报失败: {e}"))?;

    if bytes.is_empty() {
        return Ok(String::new());
    }

    let _ = std::fs::write(&cache_file, &bytes);
    Ok(data_url(&bytes))
}

#[tauri::command]
pub fn tmdb_status(state: tauri::State<'_, AppState>) -> (bool, usize) {
    let settings = settings::load(&state.data_dir);
    let enabled = !settings.tmdb_key.trim().is_empty();
    let cached = std::fs::read_dir(state.data_dir.join("posters"))
        .map(|dir| dir.flatten().count())
        .unwrap_or(0);
    (enabled, cached)
}

#[tauri::command]
pub fn clear_poster_cache(state: tauri::State<'_, AppState>) -> Result<usize, String> {
    let dir = state.data_dir.join("posters");
    let mut removed = 0;
    if let Ok(entries) = std::fs::read_dir(&dir) {
        for entry in entries.flatten() {
            if std::fs::remove_file(entry.path()).is_ok() {
                removed += 1;
            }
        }
    }
    Ok(removed)
}
