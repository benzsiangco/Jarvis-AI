/**
 * useVoiceSetup — tracks voice dependency installation via SSE.
 *
 * status: 'idle' | 'checking' | 'installing' | 'done' | 'error'
 * packages: [{ name, label, size, status: 'pending'|'installing'|'done'|'error', error? }]
 */
import { useState, useEffect, useRef, useCallback } from 'react';

const PACKAGES_META = [
  { name: 'faster-whisper',    label: 'faster-whisper (STT engine)', size: '~50MB' },
  { name: 'fastapi',           label: 'FastAPI (web server)',         size: '~5MB'  },
  { name: 'uvicorn[standard]', label: 'Uvicorn (ASGI server)',        size: '~3MB'  },
  { name: 'python-multipart',  label: 'python-multipart (upload)',    size: '~1MB'  },
  { name: 'edge-tts',          label: 'edge-tts (TTS engine)',        size: '~2MB'  },
];

function makePackages() {
  return PACKAGES_META.map((p) => ({ ...p, status: 'pending', error: null }));
}

export default function useVoiceSetup(backendUrl) {
  const [status, setStatus]   = useState('idle');
  const [packages, setPackages] = useState(makePackages());
  const [log, setLog]         = useState([]);
  const esRef = useRef(null);

  const updatePkg = useCallback((name, patch) => {
    setPackages((prev) =>
      prev.map((p) => (p.name === name ? { ...p, ...patch } : p))
    );
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
          setPackages(makePackages());
          break;
        case 'needs_install':
          // Mark only the ones that need installing as pending, rest as done
          setPackages((prev) =>
            prev.map((p) => ({
              ...p,
              status: evt.packages.includes(p.name) ? 'pending' : 'done',
            }))
          );
          break;
        case 'all_installed':
          setPackages((prev) => prev.map((p) => ({ ...p, status: 'done' })));
          break;
        case 'installing':
          updatePkg(evt.name, { status: 'installing' });
          break;
        case 'installed':
          updatePkg(evt.name, { status: 'done' });
          break;
        case 'error':
          updatePkg(evt.name, { status: 'error', error: evt.message });
          setStatus('error');
          break;
        case 'failed':
          setStatus('error');
          setLog((l) => [...l, `Failed: ${evt.message}`]);
          break;
        case 'launching':
          setLog((l) => [...l, 'Starting voice sidecar…']);
          break;
        case 'ready':
          setStatus('done');
          setPackages((prev) => prev.map((p) => ({ ...p, status: 'done' })));
          break;
        case 'log':
          setLog((l) => [...l.slice(-19), evt.message]);
          break;
        default:
          break;
      }
    };

    es.onerror = () => {
      // SSE disconnected — reconnect after 3s if still installing
      setTimeout(() => {
        if (esRef.current === es) connect();
      }, 3000);
    };
  }, [backendUrl, updatePkg]);

  useEffect(() => {
    connect();
    return () => { esRef.current?.close(); esRef.current = null; };
  }, [connect]);

  const startInstall = useCallback(async () => {
    // Reset server state first so we don't get 409 on retry
    try { await fetch(`${backendUrl}/api/voice/setup/reset`, { method: 'POST' }); } catch {}
    setStatus('installing');
    setPackages(makePackages());
    setLog([]);
    try {
      const res = await fetch(`${backendUrl}/api/voice/setup/start`, { method: 'POST' });
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

  return { status, packages, log, startInstall, retry };
}
