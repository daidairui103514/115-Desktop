//! 外部播放器。
//!
//! 115 的 HLS 转码流依赖云端处理，未转码的文件（mkv/avi/iso）在 WebView 里播不了。
//! 参考 v1.5.7 的思路：直接交给本地播放器。地址用本地代理，
//! 代理会补上 115 要求的 UA。

use std::path::Path;
use std::process::Command;

use serde::Serialize;

#[derive(Serialize, Clone)]
pub struct PlayerInfo {
    pub name: String,
    pub path: String,
}

/// 常见播放器的安装位置
const CANDIDATES: &[(&str, &str)] = &[
    ("PotPlayer", r"C:\Program Files\DAUM\PotPlayer\PotPlayerMini64.exe"),
    ("PotPlayer", r"C:\Program Files (x86)\DAUM\PotPlayer\PotPlayerMini.exe"),
    ("PotPlayer", r"C:\Program Files\DAUM\PotPlayer64\PotPlayerMini64.exe"),
    ("PotPlayer", r"D:\Program Files\DAUM\PotPlayer\PotPlayerMini64.exe"),
    ("VLC", r"C:\Program Files\VideoLAN\VLC\vlc.exe"),
    ("VLC", r"C:\Program Files (x86)\VideoLAN\VLC\vlc.exe"),
    ("mpv", r"C:\Program Files\mpv\mpv.exe"),
    ("mpv", r"C:\mpv\mpv.exe"),
];

fn find_in_path(exe: &str) -> Option<String> {
    let path = std::env::var("PATH").ok()?;
    for dir in path.split(';') {
        if dir.trim().is_empty() {
            continue;
        }
        let candidate = Path::new(dir).join(exe);
        if candidate.exists() {
            return Some(candidate.display().to_string());
        }
    }
    None
}

pub fn detect() -> Vec<PlayerInfo> {
    let mut found: Vec<PlayerInfo> = Vec::new();

    for (name, path) in CANDIDATES {
        if Path::new(path).exists() && !found.iter().any(|p| p.path == *path) {
            found.push(PlayerInfo {
                name: name.to_string(),
                path: path.to_string(),
            });
        }
    }

    for exe in ["mpv.exe", "vlc.exe", "PotPlayerMini64.exe"] {
        if let Some(path) = find_in_path(exe) {
            if !found.iter().any(|p| p.path == path) {
                let name = if exe.starts_with("mpv") {
                    "mpv"
                } else if exe.starts_with("vlc") {
                    "VLC"
                } else {
                    "PotPlayer"
                };
                found.push(PlayerInfo {
                    name: name.to_string(),
                    path,
                });
            }
        }
    }

    found
}

#[tauri::command]
pub fn detect_players() -> Vec<PlayerInfo> {
    detect()
}

/// 用指定播放器打开代理地址。player_path 为空时自动挑第一个可用的。
#[tauri::command]
pub fn play_external(
    pc: String,
    name: String,
    player_path: Option<String>,
) -> Result<String, String> {
    let base = crate::stream::base_url();
    if base.is_empty() {
        return Err("本地代理还没启动，请重启程序".into());
    }

    let ext = name
        .rsplit_once('.')
        .map(|(_, e)| e.to_string())
        .unwrap_or_else(|| "mp4".to_string());
    let url = format!("{base}/s/{pc}.{ext}");

    let chosen = match player_path.filter(|p| !p.trim().is_empty()) {
        Some(p) => p,
        None => detect()
            .first()
            .map(|p| p.path.clone())
            .ok_or("没找到本地播放器（PotPlayer / VLC / mpv 任装一个即可）")?,
    };

    let mut command = Command::new(&chosen);
    command.arg(&url);

    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x0800_0000);
    }

    command
        .spawn()
        .map_err(|e| format!("启动播放器失败: {e}"))?;

    Ok(chosen)
}
