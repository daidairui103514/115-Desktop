//! Bangumi 番组计划元数据。
//!
//! 动画类资源 TMDb 经常搜不到（尤其是新番、国漫），Bangumi 的中文条目更全。
//! 接口直连国内不稳定，统一走设置里的代理。

use std::time::Duration;

use base64::Engine;
use serde_json::Value;
use sha1::{Digest, Sha1};

use crate::api115::AppState;
use crate::settings;

const API: &str = "https://api.bgm.tv";
/// Bangumi 要求 UA 带项目标识
const UA: &str = "115Desktop/0.1 (https://github.com/daidairui103514/115-Desktop)";

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

/// 搜索条目，返回 (中文名, 原名, 海报地址, 简介)
async fn search(client: &reqwest::Client, keyword: &str) -> Result<Value, String> {
    let resp = client
        .get(format!("{API}/search/subject/{}", urlencoding::encode(keyword)))
        .query(&[("type", "2"), ("responseGroup", "large")])
        .send()
        .await
        .map_err(|e| format!("Bangumi 请求失败（检查代理）: {e}"))?;

    let body: Value = resp
        .json()
        .await
        .map_err(|e| format!("Bangumi 响应解析失败: {e}"))?;

    Ok(body)
}

#[tauri::command]
pub async fn bangumi_search(
    query: String,
    state: tauri::State<'_, AppState>,
) -> Result<Vec<Value>, String> {
    let settings = settings::load(&state.data_dir);
    let client = build_client(&settings.proxy)?;
    let body = search(&client, query.trim()).await?;

    Ok(body
        .get("list")
        .and_then(Value::as_array)
        .map(|items| {
            items
                .iter()
                .take(8)
                .map(|item| {
                    serde_json::json!({
                        "id": item.get("id").and_then(Value::as_i64).unwrap_or(0),
                        "name": item.get("name").and_then(Value::as_str).unwrap_or(""),
                        "name_cn": item.get("name_cn").and_then(Value::as_str).unwrap_or(""),
                        "poster": item.pointer("/images/large").and_then(Value::as_str).unwrap_or(""),
                        "summary": item.get("summary").and_then(Value::as_str).unwrap_or(""),
                    })
                })
                .collect()
        })
        .unwrap_or_default())
}

/// 取海报并缓存到本地，返回 data URL
#[tauri::command]
pub async fn bangumi_poster(
    query: String,
    state: tauri::State<'_, AppState>,
) -> Result<String, String> {
    let keyword = query.trim();
    if keyword.is_empty() {
        return Ok(String::new());
    }

    let cache_dir = state.data_dir.join("posters");
    std::fs::create_dir_all(&cache_dir).ok();
    let cache_file = cache_dir.join(format!("bgm-{}.jpg", hash_name(keyword)));

    if cache_file.exists() {
        if let Ok(bytes) = std::fs::read(&cache_file) {
            if !bytes.is_empty() {
                return Ok(data_url(&bytes));
            }
        }
    }

    let settings = settings::load(&state.data_dir);
    let client = build_client(&settings.proxy)?;
    let body = search(&client, keyword).await?;

    let poster = body
        .get("list")
        .and_then(Value::as_array)
        .and_then(|items| items.first())
        .and_then(|item| item.pointer("/images/large"))
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_string();

    if poster.is_empty() {
        return Ok(String::new());
    }

    let resp = client
        .get(&poster)
        .send()
        .await
        .map_err(|e| format!("下载 Bangumi 海报失败: {e}"))?;

    let bytes = resp.bytes().await.map_err(|e| format!("读取海报失败: {e}"))?;
    if bytes.is_empty() {
        return Ok(String::new());
    }

    let _ = std::fs::write(&cache_file, &bytes);
    Ok(data_url(&bytes))
}
