//! Jarvis AI — Tauri shell.
//!
//! Mirrors the Electron preload's IPC surface so the React frontend stays
//! identical. Every `window.electronAPI.*` call shipped with this app is
//! re-exposed via a tiny shim injected on window load.

mod backend;
mod commands;

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(|app| {
            // Spawn the backend sidecar (Bun-compiled server.exe).
            backend::start(&app.handle())?;
            Ok(())
        })
        .on_window_event(|_window, event| {
            // Stop sidecar when the main window is closing.
            if let tauri::WindowEvent::Destroyed = event {
                backend::stop();
            }
        })
        .invoke_handler(tauri::generate_handler![
            commands::window_minimize,
            commands::window_maximize,
            commands::window_close,
            commands::window_is_maximized,
            commands::config_get,
            commands::shell_open_path,
            commands::dialog_pick_folder,
            commands::dialog_pick_model,
            commands::dialog_pick_model_folder,
            commands::dialog_copy_model,
            commands::dialog_copy_model_folder,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Tauri application");
}
