mod api115;

use std::path::PathBuf;
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, TrayIconBuilder, TrayIconEvent},
    Manager, WebviewUrl, WebviewWindowBuilder,
};

/// 运行时数据统一放在可执行文件同级的 `data` 目录。
///
/// WebView2 默认会把缓存写入 `%LOCALAPPDATA%\<exe名>\EBWebView`，
/// 这里在初始化之前设置官方支持的环境变量把它指到程序目录，
/// 保证整个目录可整体拷贝、整体删除，不在系统盘留残留。
fn portable_data_dir() -> PathBuf {
    std::env::current_exe()
        .ok()
        .and_then(|exe| exe.parent().map(|dir| dir.join("data")))
        .unwrap_or_else(|| PathBuf::from("data"))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let data_dir = portable_data_dir();
    let _ = std::fs::create_dir_all(&data_dir);

    // 必须在 WebView2 初始化之前设置
    std::env::set_var("WEBVIEW2_USER_DATA_FOLDER", &data_dir);

    tauri::Builder::default()
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_opener::init())
        .manage(api115::AppState::new(data_dir.clone()))
        .invoke_handler(tauri::generate_handler![
            api115::login_with_token,
            api115::qr_start,
            api115::qr_poll,
            api115::auth_status,
            api115::list_files,
            api115::logout,
        ])
        .setup(move |app| {
            // 无边框但**不透明**：Windows 上透明窗口会带来白屏、无阴影、
            // 缩放闪烁等一系列问题，视觉上的圆角不值得这个代价。
            let window = WebviewWindowBuilder::new(
                app,
                "main",
                WebviewUrl::App("index.html".into()),
            )
            .title("115 Desktop")
            .inner_size(1280.0, 840.0)
            .min_inner_size(1000.0, 620.0)
            .decorations(false)
            .transparent(false)
            .shadow(true)
            .center()
            .build()?;

            let _ = window.set_focus();

            build_tray(app)?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

/// 系统托盘：右键（或点击）弹出菜单，可显示主窗口或退出。
fn build_tray(app: &tauri::App) -> tauri::Result<()> {
    let show_item = MenuItem::with_id(app, "show", "显示主窗口", true, None::<&str>)?;
    let quit_item = MenuItem::with_id(app, "quit", "退出 115 Desktop", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&show_item, &quit_item])?;

    let mut builder = TrayIconBuilder::with_id("main-tray")
        .menu(&menu)
        .tooltip("115 Desktop")
        .on_menu_event(|app, event| match event.id.as_ref() {
            "show" => focus_main(app),
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::DoubleClick {
                button: MouseButton::Left,
                ..
            } = event
            {
                focus_main(tray.app_handle());
            }
        });

    if let Some(icon) = app.default_window_icon() {
        builder = builder.icon(icon.clone());
    }

    builder.build(app)?;
    Ok(())
}

fn focus_main(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}
