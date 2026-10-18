//! 应用设置。
//!
//! 存放在程序目录下的 `data/settings.json`，跟便携版一起走。
//! 目前只有三项：TMDb 密钥、代理地址、默认下载目录。

use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

#[derive(Clone, Serialize, Deserialize)]
pub struct Settings {
    /// TMDb v3 API Key，留空则海报功能关闭
    pub tmdb_key: String,
    /// 访问 TMDb 用的代理，国内直连不通
    pub proxy: String,
    /// 默认下载目录，留空则用程序目录下的 downloads
    pub download_dir: String,
    /// 内置 M3U8 播放器画质偏好
    pub preferred_quality: String,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            tmdb_key: String::new(),
            proxy: "http://127.0.0.1:10808".into(),
            download_dir: String::new(),
            preferred_quality: "auto".into(),
        }
    }
}

pub fn settings_path(data_dir: &Path) -> PathBuf {
    data_dir.join("settings.json")
}

pub fn load(data_dir: &Path) -> Settings {
    let path = settings_path(data_dir);
    match std::fs::read_to_string(&path) {
        Ok(text) => serde_json::from_str::<Settings>(&text).unwrap_or_default(),
        Err(_) => Settings::default(),
    }
}

pub fn save(data_dir: &Path, settings: &Settings) -> Result<(), String> {
    let text = serde_json::to_string_pretty(settings).map_err(|e| e.to_string())?;
    std::fs::write(settings_path(data_dir), text).map_err(|e| format!("写入设置失败: {e}"))
}

/// 代理地址：设置页填的优先，其次系统环境变量
pub fn proxy_url(data_dir: &Path) -> String {
    let settings = load(data_dir);
    if !settings.proxy.trim().is_empty() {
        return settings.proxy.trim().to_string();
    }
    std::env::var("HTTPS_PROXY")
        .or_else(|_| std::env::var("https_proxy"))
        .unwrap_or_else(|_| "http://127.0.0.1:10808".to_string())
}

#[tauri::command]
pub fn get_settings(state: tauri::State<'_, crate::api115::AppState>) -> Settings {
    load(&state.data_dir)
}

#[tauri::command]
pub fn save_settings(
    settings: Settings,
    state: tauri::State<'_, crate::api115::AppState>,
) -> Result<(), String> {
    save(&state.data_dir, &settings)
}
