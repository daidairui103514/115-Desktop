//! 文件下载：拿到直链后用同一个 UA 流式拉取到本地，
//! 过程中通过事件把进度推给前端。
//!
//! 115 的直链与申请时的 User-Agent 绑定，所以下载必须复用 api115 里的 UA。

use std::path::{Path, PathBuf};
use std::time::{Duration, Instant};

use futures_util::StreamExt;
use serde::Serialize;
use tauri::Emitter;
use tokio::io::AsyncWriteExt;

use crate::api115::{api_post, client, net_err, AppState};

const UA: &str = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 \
                  (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

#[derive(Clone, Serialize)]
pub struct DownloadProgress {
    pub id: String,
    pub name: String,
    pub downloaded: u64,
    pub total: u64,
    pub done: bool,
    pub error: String,
}

/// 把文件名里的 Windows 非法字符替换掉
fn safe_name(name: &str) -> String {
    let cleaned: String = name
        .chars()
        .map(|c| match c {
            '\\' | '/' | ':' | '*' | '?' | '"' | '<' | '>' | '|' => '_',
            c if (c as u32) < 32 => '_',
            c => c,
        })
        .collect();
    let trimmed = cleaned.trim().trim_matches('.');
    if trimmed.is_empty() {
        "未命名文件".to_string()
    } else {
        trimmed.to_string()
    }
}

/// 目录不存在就创建，并把默认下载目录定在程序目录下的 downloads
fn ensure_dir(raw: &str) -> Result<PathBuf, String> {
    let dir = if raw.trim().is_empty() {
        std::env::current_exe()
            .ok()
            .and_then(|exe| exe.parent().map(|p| p.join("downloads")))
            .unwrap_or_else(|| PathBuf::from("downloads"))
    } else {
        PathBuf::from(raw)
    };

    std::fs::create_dir_all(&dir).map_err(|e| format!("无法创建目录 {}: {e}", dir.display()))?;
    Ok(dir)
}

#[tauri::command]
pub async fn download_file(
    app: tauri::AppHandle,
    pc: String,
    name: String,
    save_dir: String,
    state: tauri::State<'_, AppState>,
) -> Result<String, String> {
    let id = pc.clone();
    let safe = safe_name(&name);
    let dir = ensure_dir(&save_dir)?;
    let target = dir.join(&safe);

    let emit = |progress: DownloadProgress| {
        let _ = app.emit("download:progress", progress);
    };

    // 1. 取直链（同一个 UA）
    let data = api_post(&state, "/open/ufile/downurl", vec![("pick_code", pc.clone())]).await?;
    let url = data
        .as_object()
        .and_then(|m| m.values().next())
        .and_then(|v| v.get("url"))
        .and_then(|u| u.get("url").and_then(serde_json::Value::as_str).or_else(|| u.as_str()))
        .unwrap_or("")
        .to_string();

    if url.is_empty() {
        return Err("没有拿到下载地址".into());
    }

    // 2. 流式下载
    let http = client()?;
    let resp = http
        .get(&url)
        .header(reqwest::header::USER_AGENT, UA)
        .send()
        .await
        .map_err(|e| net_err("下载请求失败", e))?;

    if !resp.status().is_success() {
        return Err(format!("下载失败 HTTP {}", resp.status()));
    }

    let total = resp.content_length().unwrap_or(0);
    let mut file = tokio::fs::File::create(&target)
        .await
        .map_err(|e| format!("无法写入文件: {e}"))?;

    let mut stream = resp.bytes_stream();
    let mut downloaded: u64 = 0;
    let mut last_emit = Instant::now();

    emit(DownloadProgress {
        id: id.clone(),
        name: safe.clone(),
        downloaded: 0,
        total,
        done: false,
        error: String::new(),
    });

    while let Some(chunk) = stream.next().await {
        let chunk = match chunk {
            Ok(c) => c,
            Err(e) => {
                emit(DownloadProgress {
                    id: id.clone(),
                    name: safe.clone(),
                    downloaded,
                    total,
                    done: false,
                    error: e.to_string(),
                });
                return Err(format!("下载中断: {e}"));
            }
        };

        file.write_all(&chunk)
            .await
            .map_err(|e| format!("写入失败: {e}"))?;
        downloaded += chunk.len() as u64;

        if last_emit.elapsed() > Duration::from_millis(200) {
            emit(DownloadProgress {
                id: id.clone(),
                name: safe.clone(),
                downloaded,
                total,
                done: false,
                error: String::new(),
            });
            last_emit = Instant::now();
        }
    }

    let _ = file.flush().await;

    emit(DownloadProgress {
        id,
        name: safe.clone(),
        downloaded,
        total: total.max(downloaded),
        done: true,
        error: String::new(),
    });

    Ok(target.display().to_string())
}

/// 让前端拿到默认下载目录，便于在界面上展示
#[tauri::command]
pub fn default_download_dir() -> String {
    ensure_dir("")
        .map(|p| p.display().to_string())
        .unwrap_or_default()
}

/// 打开下载目录
#[tauri::command]
pub fn open_download_dir(app: tauri::AppHandle) -> Result<(), String> {
    let dir = ensure_dir("")?;
    use tauri_plugin_opener::OpenerExt;
    app.opener()
        .open_path(dir.display().to_string(), None::<&str>)
        .map_err(|e| format!("打开目录失败: {e}"))
}

/// 提前判断文件是否已存在，避免覆盖
#[tauri::command]
pub fn file_exists(path: String) -> bool {
    Path::new(&path).exists()
}

// ── IDM 多线程下载 ──────────────────────────────────────

fn find_idman() -> Option<String> {
    const CANDIDATES: [&str; 4] = [
        r"C:/Program Files (x86)/Internet Download Manager/IDMan.exe",
        r"C:/Program Files/Internet Download Manager/IDMan.exe",
        r"D:/Program Files (x86)/Internet Download Manager/IDMan.exe",
        r"D:/Program Files/Internet Download Manager/IDMan.exe",
    ];
    for path in CANDIDATES {
        if Path::new(path).exists() {
            return Some(path.to_string());
        }
    }
    None
}

/// 交给 IDM 下载。地址用本地代理，代理负责补上 115 要求的 UA，
/// 这样 IDM 的多线程、断点续传、分段请求都能正常工作。
#[tauri::command]
pub fn download_with_idm(pc: String, name: String) -> Result<String, String> {
    let base = crate::stream::base_url();
    if base.is_empty() {
        return Err("本地代理还没启动，请重启程序".into());
    }

    let ext = name
        .rsplit_once('.')
        .map(|(_, e)| e.to_string())
        .unwrap_or_else(|| "bin".to_string());
    let url = format!("{base}/s/{pc}.{ext}");

    let idman = find_idman().ok_or("没找到 IDMan.exe，请确认 IDM 已正确安装")?;

    let mut command = std::process::Command::new(&idman);
    command.arg("/d").arg(&url).arg("/n").arg("/f").arg(&name);

    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x0800_0000);
    }

    command
        .spawn()
        .map_err(|e| format!("启动 IDM 失败: {e}"))?;

    Ok(url)
}

#[tauri::command]
pub fn idm_available() -> bool {
    find_idman().is_some()
}
