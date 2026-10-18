//! 音乐元数据（网易云）。
//!
//! 实测 `music.163.com/api/search/get` 国内直连可用，不需要代理。
//! 只取专辑封面，用于音乐文件的封面墙。

use std::time::Duration;

use base64::Engine;
use serde_json::Value;
use sha1::{Digest, Sha1};

use crate::api115::AppState;

const SEARCH: &str = "https://music.163.com/api/search/get";
const UA: &str = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 \
                  (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

fn client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .user_agent(UA)
        .timeout(Duration::from_secs(20))
        .build()
        .map_err(|e| e.to_string())
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

async fn search(http: &reqwest::Client, keyword: &str) -> Result<Value, String> {
    let resp = http
        .get(SEARCH)
        .query(&[
            ("s", keyword.to_string()),
            ("type", "1".to_string()),
            ("offset", "0".to_string()),
            ("limit", "5".to_string()),
        ])
        .header(reqwest::header::REFERER, "https://music.163.com/")
        .send()
        .await
        .map_err(|e| format!("网易云搜索失败: {e}"))?;

    resp.json().await.map_err(|e| format!("网易云响应解析失败: {e}"))
}

#[tauri::command]
pub async fn music_search(
    query: String,
    state: tauri::State<'_, AppState>,
) -> Result<Vec<Value>, String> {
    let _ = &state;
    let http = client()?;
    let body = search(&http, query.trim()).await?;

    Ok(body
        .pointer("/result/songs")
        .and_then(Value::as_array)
        .map(|songs| {
            songs
                .iter()
                .map(|song| {
                    let album = song.get("album");
                    let cover = album
                        .and_then(|a| a.get("picUrl"))
                        .and_then(Value::as_str)
                        .or_else(|| album.and_then(|a| a.get("img1v1Url")).and_then(Value::as_str))
                        .unwrap_or("");
                    serde_json::json!({
                        "id": song.get("id").and_then(Value::as_i64).unwrap_or(0),
                        "name": song.get("name").and_then(Value::as_str).unwrap_or(""),
                        "artist": song
                            .get("artists")
                            .and_then(Value::as_array)
                            .and_then(|list| list.first())
                            .and_then(|a| a.get("name"))
                            .and_then(Value::as_str)
                            .unwrap_or(""),
                        "album": album
                            .and_then(|a| a.get("name"))
                            .and_then(Value::as_str)
                            .unwrap_or(""),
                        "cover": cover,
                    })
                })
                .collect()
        })
        .unwrap_or_default())
}

/// 取专辑封面并缓存，返回 data URL
#[tauri::command]
pub async fn music_poster(
    query: String,
    state: tauri::State<'_, AppState>,
) -> Result<String, String> {
    let keyword = query.trim();
    if keyword.is_empty() {
        return Ok(String::new());
    }

    let cache_dir = state.data_dir.join("posters");
    std::fs::create_dir_all(&cache_dir).ok();
    let cache_file = cache_dir.join(format!("music-{}.jpg", hash_name(keyword)));

    if cache_file.exists() {
        if let Ok(bytes) = std::fs::read(&cache_file) {
            if !bytes.is_empty() {
                return Ok(data_url(&bytes));
            }
        }
    }

    let http = client()?;
    let body = search(&http, keyword).await?;

    let cover = body
        .pointer("/result/songs")
        .and_then(Value::as_array)
        .and_then(|songs| songs.first())
        .and_then(|song| song.get("album"))
        .and_then(|album| {
            album
                .get("picUrl")
                .and_then(Value::as_str)
                .or_else(|| album.get("img1v1Url").and_then(Value::as_str))
        })
        .unwrap_or("")
        .to_string();

    if cover.is_empty() {
        return Ok(String::new());
    }

    let resp = http
        .get(&cover)
        .header(reqwest::header::REFERER, "https://music.163.com/")
        .send()
        .await
        .map_err(|e| format!("下载封面失败: {e}"))?;

    let bytes = resp.bytes().await.map_err(|e| format!("读取封面失败: {e}"))?;
    if bytes.is_empty() {
        return Ok(String::new());
    }

    let _ = std::fs::write(&cache_file, &bytes);
    Ok(data_url(&bytes))
}
