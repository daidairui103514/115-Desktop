//! 视频缩略图。
//!
//! 参考 v1.5.7 的 `VideoThumbnailService`：它用 mpv 截图，这里用系统里的
//! ffmpeg 抽一帧。115 不提供视频封面，TMDb 也搜不到自制视频时，
//! 这条路至少能让海报墙不是一片空白。
//!
//! 直链与 UA 绑定，所以 ffmpeg 必须带上同一个 UA 去取。

use std::path::{Path, PathBuf};
use std::process::Command;

use base64::Engine;
use sha1::{Digest, Sha1};

use crate::api115::{api_post, AppState};

const UA: &str = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 \
                  (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

fn find_ffmpeg() -> Option<String> {
    if let Ok(path) = std::env::var("PATH") {
        for dir in path.split(';') {
            if dir.trim().is_empty() {
                continue;
            }
            let candidate = Path::new(dir).join("ffmpeg.exe");
            if candidate.exists() {
                return Some(candidate.display().to_string());
            }
        }
    }
    let known = [
        r"C:\ffmpeg\bin\ffmpeg.exe",
        r"D:\ffmpeg\bin\ffmpeg.exe",
        r"C:\Program Files\ffmpeg\bin\ffmpeg.exe",
    ];
    for path in known {
        if Path::new(path).exists() {
            return Some(path.to_string());
        }
    }
    None
}

#[tauri::command]
pub fn ffmpeg_available() -> bool {
    find_ffmpeg().is_some()
}

/// 抽一帧当封面。结果缓存在 data/thumbs/<sha1(pc)>.jpg，返回 data URL。
#[tauri::command]
pub async fn extract_thumb(
    pc: String,
    seconds: u64,
    state: tauri::State<'_, AppState>,
) -> Result<String, String> {
    let cache_dir = state.data_dir.join("thumbs");
    std::fs::create_dir_all(&cache_dir).ok();

    let mut hasher = Sha1::new();
    hasher.update(pc.as_bytes());
    let cache_file = cache_dir.join(format!("{}.jpg", hex::encode(hasher.finalize())));

    if cache_file.exists() {
        if let Ok(bytes) = std::fs::read(&cache_file) {
            if !bytes.is_empty() {
                return Ok(to_data_url(&bytes));
            }
        }
    }

    let ffmpeg = find_ffmpeg().ok_or("系统里没有 ffmpeg，装一个才能生成视频缩略图")?;

    // 取直链
    let data = api_post(&state, "/open/ufile/downurl", vec![("pick_code", pc.clone())]).await?;
    let direct = data
        .as_object()
        .and_then(|m| m.values().next())
        .and_then(|v| v.get("url"))
        .and_then(|u| {
            u.get("url")
                .and_then(|x| x.as_str())
                .or_else(|| u.as_str())
        })
        .unwrap_or("")
        .to_string();

    if direct.is_empty() {
        return Err("没有拿到直链".into());
    }

    let tmp = cache_dir.join(format!("{}.tmp.jpg", std::process::id()));

    // 依次试几个时间点：指定位置 → 10 秒 → 开头
    let attempts = [seconds.max(5), 10, 0];
    let mut last_error = String::new();

    for at in attempts {
        let status = Command::new(&ffmpeg)
            .args([
                "-user_agent",
                UA,
                "-ss",
                &at.to_string(),
                "-i",
                &direct,
                "-frames:v",
                "1",
                "-vf",
                "scale=480:-1",
                "-q:v",
                "5",
                "-y",
            ])
            .arg(&tmp)
            .status()
            .map_err(|e| format!("调用 ffmpeg 失败: {e}"))?;

        if status.success() && tmp.exists() {
            if let Ok(bytes) = std::fs::read(&tmp) {
                if bytes.len() > 1024 {
                    let _ = std::fs::write(&cache_file, &bytes);
                    let _ = std::fs::remove_file(&tmp);
                    return Ok(to_data_url(&bytes));
                }
            }
        }
        last_error = format!("ffmpeg 在 {at} 秒处没有取到画面");
        let _ = std::fs::remove_file(&tmp);
    }

    Err(last_error)
}

fn to_data_url(bytes: &[u8]) -> String {
    let b64 = base64::engine::general_purpose::STANDARD.encode(bytes);
    format!("data:image/jpeg;base64,{b64}")
}

#[tauri::command]
pub fn clear_thumb_cache(state: tauri::State<'_, AppState>) -> Result<usize, String> {
    let dir: PathBuf = state.data_dir.join("thumbs");
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
