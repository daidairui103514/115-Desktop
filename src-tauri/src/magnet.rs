//! 磁力链接信息解析（whatslink.info）。
//!
//! 实测国内直连可用，不需要代理。
//! 返回种子名称、大小、文件数，以及视频截图（可当封面用）。

use std::time::Duration;

use serde_json::Value;

const API: &str = "https://whatslink.info/api/v1/link";

#[tauri::command]
pub async fn magnet_info(url: String) -> Result<Value, String> {
    let trimmed = url.trim();
    if !trimmed.starts_with("magnet:") {
        return Err("请填写以 magnet: 开头的磁力链接".into());
    }

    let http = reqwest::Client::builder()
        .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64)")
        .timeout(Duration::from_secs(25))
        .build()
        .map_err(|e| e.to_string())?;

    let resp = http
        .get(API)
        .query(&[("url", trimmed.to_string())])
        .send()
        .await
        .map_err(|e| format!("查询磁力信息失败: {e}"))?;

    let body: Value = resp
        .json()
        .await
        .map_err(|e| format!("磁力信息解析失败: {e}"))?;

    if let Some(err) = body.get("error").and_then(Value::as_str) {
        if !err.is_empty() {
            return Err(format!("解析失败：{err}"));
        }
    }

    Ok(body)
}
