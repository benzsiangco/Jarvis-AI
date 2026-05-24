/**
 * useVoiceSetup — tracks voice dependency installation via SSE.
 * Supports per-package progress: speed, ETA, bytes downloaded.
 */
import { useState, useEffect, useRef, useCallback } from 'react';

export const PACKAGES_META = [
  { name: 'faster-whisper',    label: 'faster-whisper (STT engine)',  size: '~50 MB',  size_mb: 50  },
  { name: 'fastapi',           label: 'FastAPI (web server)',          size: '~5 MB',   size_mb: 5   },
  { name: 'uvicorn[standard]', label: 'Uvicorn (ASGI server)',         size: '~3 MB',   size_mb: 3   },
  { name: 'python-multipart',  label: 'python-multipart (upload)',     size: '~1 MB',   size_mb: 1   },
  { name: 'supertonic[serve]', label: 'Supertonic TTS (on-device)',    size: '~120 MB', size_mb: 120 },
];

function makePackages(selected = null) {
  return PACKAGES_META.map((p) => ({
    ...p,
    selected: selected ? selected.includes(p.name) : true,
    status: 'pending',   // pending | installing | done | error | skipped
    error: null,
    downloaded: 0,
    total: p.size_mb * 1024 * 1024,
    percent: 0,
    speed: 0,            // bytes/s
    eta: 0,              // seconds
    elapsed: 0,
  }));
}

export default function useVoiceSetup(backendUrl) {
  const [status, setStatus]     = useState('idle');
  const [packages, setPackages] = useState(makePackages());
  const [log, setLog]           = useState([]);
  const esRef = useRef(null);

  const updatePkg = useCallback((name, patch) => {
    setPackages((prev) => prev.map((p) => p.name === name ? { ...p, ...patch } : p));
  }, []);

  const connect = useCallback(() => {
    if (esRef.current) { esRef.current.close(); esRef.current = null; }
    const es = new EventSource(`${backendUrl}/api/voice/setup`);
    esRef.current = es;

    es.onmessage = (e) => {
      let evt;
      try { evt = JSON.parse(e.data); } catch { return; }

      switch (evt.event) {
        case 'state':
          setStatus(evt.status);
          break;
        case 'start':
          setStatus('installing');
          break;
        case 'needs_install':
          setPackages((prev) => prev.map((p) => ({
            ...p,
            status: evt.packages.includes(p.name) ? 'pending' : 'done',
          })));
          break;
        case 'all_installed':
          setPackages((prev) => prev.map((p) => ({ ...p, status: 'done' })));
          break;
        case 'installing':
          updatePkg(evt.name, { status: 'installing', percent: 0, speed: 0, eta: 0 });
          break;
        case 'progress':
          updatePkg(evt.name, {
            status: 'installing',
            downloaded: evt.downloaded || 0,
            total: evt.total || 0,
            percent: evt.percent || 0,
            speed: evt.speed || 0,
            eta: evt.eta || 0,
          });
          break;
        case 'installed':
          updatePkg(evt.name, { status: 'done', percent: 100, speed: 0, eta: 0, elapsed: evt.elapsed || 0 });
          break;
        case 'error':
          if (evt.name) updatePkg(evt.name, { status: 'error', error: evt.message });
          setStatus('error');
          setLog((l) => [...l.slice(-29), `✗ ${evt.name || 'error'}: ${evt.message}`]);
          break;
        case 'failed':
          setStatus('error');
          setLog((l) => [...l.slice(-29), `✗ Failed: ${evt.message}`]);
          break;
        case 'launching':
          setLog((l) => [...l.slice(-29), '→ Starting voice sidecar…']);
          break;
        case 'ready':
          setStatus('done');
          setPackages((prev) => prev.map((p) => ({ ...p, status: p.status === 'pending' ? 'skipped' : p.status === 'installing' ? 'done' : p.status })));
          break;
        case 'log':
          setLog((l) => [...l.slice(-29), evt.message]);
          break;
        default:
          break;
      }
    };

    es.onerror = () => {
      setTimeout(() => { if (esRef.current === es) connect(); }, 3000);
    };
  }, [backendUrl, updatePkg]);

  useEffect(() => {
    connect();
    return () => { esRef.current?.close(); esRef.current = null; };
  }, [connect]);

  const startInstall = useCallback(async (selectedNames = null) => {
    try { await fetch(`${backendUrl}/api/voice/setup/reset`, { method: 'POST' }); } catch {}
    setStatus('installing');
    setPackages(makePackages(selectedNames));
    setLog([]);
    try {
      const body = selectedNames ? { packages: selectedNames } : {};
      const res = await fetch(`${backendUrl}/api/voice/setup/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setStatus('error');
        setLog([data.error || `HTTP ${res.status}`]);
      } else if (data.python) {
        setLog([`Using ${data.python}`]);
      }
    } catch (e) {
      setStatus('error');
      setLog([`Failed to start: ${e.message}`]);
    }
  }, [backendUrl]);

  const retry = useCallback(async () => {
    try { await fetch(`${backendUrl}/api/voice/setup/reset`, { method: 'POST' }); } catch {}
    setStatus('idle');
    setPackages(makePackages());
    setLog([]);
  }, [backendUrl]);

  const toggleSelect = useCallback((name) => {
    setPackages((prev) => prev.map((p) => p.name === name ? { ...p, selected: !p.selected } : p));
  }, []);

  return { status, packages, log, startInstall, retry, toggleSelect };
}
