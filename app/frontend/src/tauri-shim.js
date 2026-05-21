/**
 * Tauri ↔ Electron compat shim.
 *
 * Re-exposes window.electronAPI on top of Tauri commands so the existing
 * React code (TitleBar, Sidebar, ModelsModal, etc.) keeps working without
 * any per-component changes.
 *
 * Loaded only when running inside Tauri. Detection is via `window.__TAURI__`
 * or `window.__TAURI_INTERNALS__` — both are injected by Tauri's webview
 * before user JS executes.
 */

function isTauri() {
  if (typeof window === 'undefined') return false;
  return Boolean(window.__TAURI__ || window.__TAURI_INTERNALS__);
}

async function tauriInvoke(cmd, args) {
  // Lazy-import so non-Tauri builds don't pull in @tauri-apps/api at all.
  const mod = await import('@tauri-apps/api/core');
  return mod.invoke(cmd, args);
}

if (isTauri() && !window.electronAPI) {
  window.electronAPI = {
    minimize:        () => tauriInvoke('window_minimize'),
    maximize:        () => tauriInvoke('window_maximize'),
    close:           () => tauriInvoke('window_close'),
    isMaximized:     () => tauriInvoke('window_is_maximized'),
    getConfig:       () => tauriInvoke('config_get'),
    openPath:        (path) => tauriInvoke('shell_open_path', { path }),
    pickFolder:      () => tauriInvoke('dialog_pick_folder'),
    pickModel:       () => tauriInvoke('dialog_pick_model'),
    pickModelFolder: () => tauriInvoke('dialog_pick_model_folder'),
    copyModel:       (srcPath) => tauriInvoke('dialog_copy_model', { srcPath }),
    copyModelFolder: (srcDir)  => tauriInvoke('dialog_copy_model_folder', { srcDir }),
  };
}

export {};
