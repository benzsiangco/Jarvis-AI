//! Tauri commands mirroring the Electron preload IPC surface.
//!
//! The frontend's `window.electronAPI.*` calls all map 1:1 to the commands
//! below. A small JS shim (preload-shim.js) re-exposes them under the
//! original `electronAPI` name so the React code does not need to change.

use std::path::{Path, PathBuf};

use serde::Serialize;
use tauri::{AppHandle, Manager, Runtime, WebviewWindow};
use tauri_plugin_dialog::DialogExt;

use crate::backend;

/* ── Window controls ─────────────────────────────────────────────────── */

fn main_window<R: Runtime>(app: &AppHandle<R>) -> Option<WebviewWindow<R>> {
    app.get_webview_window("main")
}

#[tauri::command]
pub fn window_minimize<R: Runtime>(app: AppHandle<R>) {
    if let Some(w) = main_window(&app) {
        let _ = w.minimize();
    }
}

#[tauri::command]
pub fn window_maximize<R: Runtime>(app: AppHandle<R>) {
    if let Some(w) = main_window(&app) {
        if w.is_maximized().unwrap_or(false) {
            let _ = w.unmaximize();
        } else {
            let _ = w.maximize();
        }
    }
}

#[tauri::command]
pub fn window_close<R: Runtime>(app: AppHandle<R>) {
    if let Some(w) = main_window(&app) {
        let _ = w.close();
    }
}

#[tauri::command]
pub fn window_is_maximized<R: Runtime>(app: AppHandle<R>) -> bool {
    main_window(&app)
        .and_then(|w| w.is_maximized().ok())
        .unwrap_or(false)
}

/* ── Config ──────────────────────────────────────────────────────────── */

#[derive(Serialize)]
pub struct AppConfig {
    #[serde(rename = "backendPort")]
    pub backend_port: u16,
    #[serde(rename = "llamaPort")]
    pub llama_port: u16,
    #[serde(rename = "modelsPath")]
    pub models_path: String,
    #[serde(rename = "isDev")]
    pub is_dev: bool,
}

#[tauri::command]
pub fn config_get<R: Runtime>(app: AppHandle<R>) -> AppConfig {
    let user_data = app
        .path()
        .app_data_dir()
        .unwrap_or_else(|_| std::env::temp_dir().join("jarvis"));
    let models_path = user_data.join("models");
    AppConfig {
        backend_port: backend::port(),
        llama_port: 6969,
        models_path: models_path.to_string_lossy().to_string(),
        is_dev: cfg!(debug_assertions),
    }
}

/* ── Shell ───────────────────────────────────────────────────────────── */

#[tauri::command]
pub fn shell_open_path<R: Runtime>(app: AppHandle<R>, path: String) -> Result<(), String> {
    use tauri_plugin_opener::OpenerExt;
    app.opener()
        .open_path(path, None::<&str>)
        .map_err(|e| e.to_string())
}

/* ── Dialogs ─────────────────────────────────────────────────────────── */

fn ask_path<R: Runtime, F>(app: &AppHandle<R>, build: F) -> Option<PathBuf>
where
    F: FnOnce(tauri_plugin_dialog::FileDialogBuilder<R>) -> Option<tauri_plugin_dialog::FilePath>,
{
    let builder = app.dialog().file();
    build(builder).and_then(|fp| fp.into_path().ok())
}

#[tauri::command]
pub async fn dialog_pick_folder<R: Runtime>(app: AppHandle<R>) -> Option<String> {
    let path = ask_path(&app, |b| b.blocking_pick_folder());
    path.map(|p| p.to_string_lossy().to_string())
}

#[tauri::command]
pub async fn dialog_pick_model<R: Runtime>(app: AppHandle<R>) -> Option<String> {
    let path = ask_path(&app, |b| {
        b.add_filter("GGUF Models", &["gguf"]).blocking_pick_file()
    });
    path.map(|p| p.to_string_lossy().to_string())
}

#[tauri::command]
pub async fn dialog_pick_model_folder<R: Runtime>(app: AppHandle<R>) -> Option<String> {
    let path = ask_path(&app, |b| b.blocking_pick_folder());
    path.map(|p| p.to_string_lossy().to_string())
}

/* ── Model copy helpers ──────────────────────────────────────────────── */

#[derive(Serialize)]
pub struct CopiedModel {
    pub filename: String,
    #[serde(rename = "destPath")]
    pub dest_path: String,
}

#[derive(Serialize)]
pub struct CopiedModelFolder {
    pub copied: Vec<CopiedModel>,
    pub count: usize,
}

fn ensure_models_dir<R: Runtime>(app: &AppHandle<R>) -> std::io::Result<PathBuf> {
    let dir = app
        .path()
        .app_data_dir()
        .unwrap_or_else(|_| std::env::temp_dir().join("jarvis"))
        .join("models");
    std::fs::create_dir_all(&dir)?;
    Ok(dir)
}

#[tauri::command]
pub async fn dialog_copy_model<R: Runtime>(
    app: AppHandle<R>,
    src_path: String,
) -> Result<CopiedModel, String> {
    let dir = ensure_models_dir(&app).map_err(|e| e.to_string())?;
    let src = PathBuf::from(&src_path);
    let filename = src
        .file_name()
        .ok_or_else(|| "Invalid source path".to_string())?
        .to_string_lossy()
        .to_string();
    let dest = dir.join(&filename);
    std::fs::copy(&src, &dest).map_err(|e| e.to_string())?;
    Ok(CopiedModel {
        filename,
        dest_path: dest.to_string_lossy().to_string(),
    })
}

#[tauri::command]
pub async fn dialog_copy_model_folder<R: Runtime>(
    app: AppHandle<R>,
    src_dir: String,
) -> Result<CopiedModelFolder, String> {
    let dir = ensure_models_dir(&app).map_err(|e| e.to_string())?;
    let src = PathBuf::from(&src_dir);
    if !src.is_dir() {
        return Err("Source is not a directory".into());
    }

    let mut copied: Vec<CopiedModel> = Vec::new();
    let mut seen: std::collections::HashSet<String> = std::collections::HashSet::new();

    for entry in walkdir::WalkDir::new(&src).into_iter().filter_map(|e| e.ok()) {
        if !entry.file_type().is_file() {
            continue;
        }
        let path = entry.path();
        let lower = path
            .extension()
            .and_then(|s| s.to_str())
            .map(|s| s.to_ascii_lowercase());
        if lower.as_deref() != Some("gguf") {
            continue;
        }
        let original = path
            .file_name()
            .and_then(|s| s.to_str())
            .unwrap_or("model.gguf")
            .to_string();
        let unique = if seen.contains(&original) {
            let stem = Path::new(&original)
                .file_stem()
                .and_then(|s| s.to_str())
                .unwrap_or("model");
            format!(
                "{}_{}.gguf",
                stem,
                std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .map(|d| d.as_millis())
                    .unwrap_or(0)
            )
        } else {
            original.clone()
        };
        seen.insert(original);

        let dest = dir.join(&unique);
        if let Err(e) = std::fs::copy(path, &dest) {
            return Err(format!("Copy failed: {}", e));
        }
        copied.push(CopiedModel {
            filename: unique,
            dest_path: dest.to_string_lossy().to_string(),
        });
    }

    let count = copied.len();
    Ok(CopiedModelFolder { copied, count })
}
