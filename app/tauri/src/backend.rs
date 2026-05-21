//! Backend sidecar lifecycle.
//!
//! Launches the Bun-compiled `server.exe` (registered in tauri.conf.json
//! under `bundle.externalBin`) and wires its stdout/stderr to our log so
//! the Tauri shell behaves the same as the Electron version.

use std::path::PathBuf;
use std::sync::Mutex;

use tauri::path::BaseDirectory;
use tauri::AppHandle;
use tauri::Manager;
use tauri_plugin_shell::process::CommandChild;
use tauri_plugin_shell::ShellExt;

const BACKEND_PORT: u16 = 6767;

static SIDECAR: Mutex<Option<CommandChild>> = Mutex::new(None);

pub fn start(app: &AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    let user_data: PathBuf = app
        .path()
        .app_data_dir()
        .unwrap_or_else(|_| std::env::temp_dir().join("jarvis"));
    let _ = std::fs::create_dir_all(&user_data);
    for sub in ["models", "data", "runtime"] {
        let _ = std::fs::create_dir_all(user_data.join(sub));
    }

    // Bundled binaries (llama.cpp) live in the `resources/` subdirectory
    // next to the installed exe.
    // Tauri's BaseDirectory::Resource can resolve incorrectly on some installs,
    // so we derive the path from the exe location which is always reliable.
    let res_root: PathBuf = std::env::current_exe()
        .ok()
        .and_then(|p| p.parent().map(|d| d.join("resources")))
        .unwrap_or_else(|| {
            // Last-resort: try Tauri's resolver
            app.path()
                .resolve(".", BaseDirectory::Resource)
                .unwrap_or_default()
        });

    let settings_path = user_data.join("app-settings.json");
    let db_path = user_data.join("data").join("jarvis.sqlite");

    let cmd = app
        .shell()
        .sidecar("server")?
        .env("PORT", BACKEND_PORT.to_string())
        .env("NODE_ENV", "production")
        .env("JARVIS_ROOT", user_data.to_string_lossy().to_string())
        .env("JARVIS_BIN_ROOT", res_root.to_string_lossy().to_string())
        .env(
            "JARVIS_SETTINGS_PATH",
            settings_path.to_string_lossy().to_string(),
        )
        .env("JARVIS_DB_PATH", db_path.to_string_lossy().to_string());

    let (mut rx, child) = cmd.spawn()?;
    *SIDECAR.lock().unwrap() = Some(child);

    // Drain stdout/stderr so the sidecar doesn't block on a full pipe.
    tauri::async_runtime::spawn(async move {
        while let Some(event) = rx.recv().await {
            match event {
                tauri_plugin_shell::process::CommandEvent::Stdout(line) => {
                    if let Ok(s) = std::str::from_utf8(&line) {
                        eprintln!("[backend] {}", s.trim_end());
                    }
                }
                tauri_plugin_shell::process::CommandEvent::Stderr(line) => {
                    if let Ok(s) = std::str::from_utf8(&line) {
                        eprintln!("[backend] {}", s.trim_end());
                    }
                }
                tauri_plugin_shell::process::CommandEvent::Terminated(payload) => {
                    eprintln!("[backend] exited ({:?})", payload.code);
                    break;
                }
                _ => {}
            }
        }
    });

    Ok(())
}

pub fn stop() {
    if let Ok(mut guard) = SIDECAR.lock() {
        if let Some(child) = guard.take() {
            let _ = child.kill();
        }
    }
}

pub fn port() -> u16 {
    BACKEND_PORT
}
