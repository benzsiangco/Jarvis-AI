/**
 * useUpdater — checks for app updates via Tauri's updater plugin.
 * Only runs inside the packaged Tauri app (not in browser/dev).
 */
import { useState, useEffect, useCallback } from 'react';

export default function useUpdater() {
  const [status, setStatus] = useState('idle'); // idle | checking | available | downloading | ready | error | uptodate
  const [version, setVersion] = useState(null);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState(null);
  const [update, setUpdate] = useState(null);

  const isTauri = typeof window !== 'undefined' && !!window.__TAURI_INTERNALS__;

  const check = useCallback(async () => {
    if (!isTauri) return;
    setStatus('checking');
    setError(null);
    try {
      const { check: checkUpdate } = await import('@tauri-apps/plugin-updater');
      const u = await checkUpdate();
      if (u?.available) {
        setUpdate(u);
        setVersion(u.version);
        setStatus('available');
      } else {
        setStatus('uptodate');
        setTimeout(() => setStatus('idle'), 3000);
      }
    } catch (e) {
      setError(e.message || 'Update check failed');
      setStatus('error');
    }
  }, [isTauri]);

  const install = useCallback(async () => {
    if (!update) return;
    setStatus('downloading');
    setProgress(0);
    try {
      await update.downloadAndInstall((event) => {
        if (event.event === 'Started') {
          setProgress(0);
        } else if (event.event === 'Progress') {
          const pct = event.data.contentLength
            ? Math.round((event.data.chunkLength / event.data.contentLength) * 100)
            : 0;
          setProgress((p) => Math.min(100, p + pct));
        } else if (event.event === 'Finished') {
          setProgress(100);
          setStatus('ready');
        }
      });
    } catch (e) {
      setError(e.message || 'Download failed');
      setStatus('error');
    }
  }, [update]);

  const relaunch = useCallback(async () => {
    if (!isTauri) return;
    try {
      const { relaunch: doRelaunch } = await import('@tauri-apps/plugin-process');
      await doRelaunch();
    } catch {}
  }, [isTauri]);

  // Auto-check on startup after 3s delay
  useEffect(() => {
    if (!isTauri) return;
    const t = setTimeout(check, 3000);
    return () => clearTimeout(t);
  }, [check, isTauri]);

  return { status, version, progress, error, check, install, relaunch };
}
