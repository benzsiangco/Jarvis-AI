import { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Search, X, Cpu, Loader2, Clock, FolderPlus, HardDrive, FileText, Copy, Check, Terminal, Wifi } from 'lucide-react';
import useModelStore from '../stores/modelStore';
import ModelCard from './ModelCard';
import ModelSettingsModal from './ModelSettingsModal';

export default function ModelBrowserModal({ open, onClose, backendUrl }) {
  const ref = useRef(null);
  const searchRef = useRef(null);
  const logsRef = useRef(null);

  const [search, setSearch] = useState('');
  const [modelList, setModelList] = useState([]);
  const [modelsDir, setModelsDir] = useState('');
  const [settingsModel, setSettingsModel] = useState(null);
  const [loadingModel, setLoadingModel] = useState(null);
  const [error, setError] = useState('');
  const [logs, setLogs] = useState([]);
  const [logsExpanded, setLogsExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const settingsModelRef = useRef(null);
  const [importingFolder, setImportingFolder] = useState(false);
  const [linkedDirs, setLinkedDirs] = useState([]);
  useEffect(() => { settingsModelRef.current = settingsModel; }, [settingsModel]);

  const {
    models, activeModel, serverStatus, loadProgress, loadStages, errorMessage,
    recentModels, stopModel,
  } = useModelStore();

  const fetchAll = useCallback(async () => {
    try {
      const res = await fetch(`${backendUrl}/api/models`);
      const data = await res.json();
      setModelList(data.models || []);
      setModelsDir(data.modelsDir || '');
    } catch {}
    try {
      const res = await fetch(`${backendUrl}/api/models/dirs`);
      const data = await res.json();
      setLinkedDirs(Array.isArray(data?.linkedDirs) ? data.linkedDirs : []);
    } catch {}
  }, [backendUrl]);

  useEffect(() => {
    if (!open) return;
    fetchAll();
    setSearch('');
    setSettingsModel(null);
    setLogs([]);
    setLogsExpanded(false);
  }, [open, fetchAll]);

  // Poll logs
  useEffect(() => {
    if (!open) return;
    let lastTs = 0;
    const poll = async () => {
      try {
        const res = await fetch(`${backendUrl}/api/models/logs?since=${lastTs}&limit=200`);
        if (res.ok) {
          const data = await res.json();
          if (data.logs?.length) {
            setLogs((prev) => [...prev, ...data.logs]);
            lastTs = data.logs[data.logs.length - 1].ts;
          }
        }
      } catch {}
    };
    poll();
    const id = setInterval(poll, 1200);
    return () => clearInterval(id);
  }, [open, backendUrl]);

  useEffect(() => {
    if (logsExpanded && logsRef.current) logsRef.current.scrollTop = logsRef.current.scrollHeight;
  }, [logs, logsExpanded]);

  const copyLogs = async () => {
    const text = logs.map((l) => `[${l.level}] ${l.text}`).join('\n');
    try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch {}
  };

  useEffect(() => {
    if (open && searchRef.current) setTimeout(() => searchRef.current?.focus(), 200);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const html = document.documentElement;
    const body = document.body;
    const prevH = html.style.overflow;
    const prevB = body.style.overflow;
    html.style.overflow = 'hidden';
    body.style.overflow = 'hidden';
    const clickHandler = (e) => { if (ref.current && !ref.current.contains(e.target) && !settingsModelRef.current) onClose(); };
    const keyHandler = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('mousedown', clickHandler);
    document.addEventListener('keydown', keyHandler);
    return () => {
      html.style.overflow = prevH;
      body.style.overflow = prevB;
      document.removeEventListener('mousedown', clickHandler);
      document.removeEventListener('keydown', keyHandler);
    };
  }, [open, onClose]);

  if (!open) return null;

  const filtered = search
    ? modelList.filter(m => (m.name || m.filename).toLowerCase().includes(search.toLowerCase()))
    : modelList;

  const isStarting = serverStatus === 'starting' || serverStatus === 'loading';
  const isReady = serverStatus === 'ready';

  const handleLoad = (model) => {
    setSettingsModel(model);
  };

  const handleSettingsClose = () => {
    setSettingsModel(null);
  };

  const handleStop = async () => {
    setLoadingModel(null);
    await stopModel(backendUrl);
    setTimeout(() => fetchAll(), 500);
  };

  const handleBrowseFile = async () => {
    if (window.electronAPI?.pickModel) {
      const srcPath = await window.electronAPI.pickModel();
      if (!srcPath) return;
      try {
        await window.electronAPI.copyModel(srcPath);
        await fetchAll();
      } catch (err) { setError(`Copy failed: ${err.message}`); }
      return;
    }
  };

  const handleBrowseFolder = async () => {
    if ((window.electronAPI?.pickModelFolder || window.electronAPI?.pickFolder) && window.electronAPI?.copyModelFolder) {
      const srcDir = window.electronAPI?.pickModelFolder
        ? await window.electronAPI.pickModelFolder()
        : await window.electronAPI.pickFolder();
      if (!srcDir) return;
      setImportingFolder(true);
      setError('');
      try {
        const result = await window.electronAPI.copyModelFolder(srcDir);
        if (!result?.count) {
          setError('No .gguf files found in the selected folder.');
          return;
        }
        await fetchAll();
      } catch (err) {
        setError(`Folder import failed: ${err.message}`);
      } finally {
        setImportingFolder(false);
      }
    }
  };

  const handleLinkFolder = async () => {
    const picker = window.electronAPI?.pickModelFolder || window.electronAPI?.pickFolder;
    if (!picker) return;
    let srcDir;
    try { srcDir = await picker(); } catch { return; }
    if (!srcDir) return;
    setError('');
    try {
      const res = await fetch(`${backendUrl}/api/models/dirs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dir: srcDir }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Link failed');
      await fetchAll();
    } catch (err) {
      setError(`Link failed: ${err.message}`);
    }
  };

  const handleUnlinkFolder = async (dir) => {
    try {
      const res = await fetch(`${backendUrl}/api/models/dirs`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dir }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Unlink failed');
      await fetchAll();
    } catch (err) {
      setError(`Unlink failed: ${err.message}`);
    }
  };

  const openFolder = () => window.electronAPI?.openPath?.(modelsDir);
  const activeEntry = modelList.find((model) => (model.primaryFilename || model.filename) === activeModel);

  return createPortal((
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(0,0,0,0.6)',
      backdropFilter: 'blur(6px)',
      animation: 'ms-fade-in .15s ease-out',
      overscrollBehavior: 'contain',
    }}>
      <div ref={ref} style={{
        width: 600, maxWidth: '92vw',
        height: '75vh', maxHeight: 720,
        display: 'flex', flexDirection: 'column',
        borderRadius: 16,
        background: 'linear-gradient(180deg, #0d1117 0%, #0a0a0f 100%)',
        border: '1px solid rgba(255,255,255,0.06)',
        boxShadow: '0 32px 80px rgba(0,0,0,0.7), 0 0 0 1px rgba(6,182,212,0.03)',
        animation: 'ms-slide-up .2s cubic-bezier(0.16,1,0.3,1)',
        overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{
          padding: '14px 18px 0',
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <Cpu size={15} style={{ color: '#22d3ee', flexShrink: 0 }} />
          <span style={{ fontSize: 13, fontWeight: 700, color: '#e2e8f0' }}>Models</span>
          <div style={{ flex: 1 }} />
          <button onClick={onClose}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: 28, height: 28, borderRadius: 8,
              color: '#5e6370', border: 'none', cursor: 'pointer',
              transition: 'all .12s',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.07)'; e.currentTarget.style.color = '#e2e8f0'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#5e6370'; }}
          >
            <X size={15} />
          </button>
        </div>

        {/* Search bar */}
        <div style={{ padding: '10px 18px 8px' }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '0 12px', height: 36, borderRadius: 10,
            background: 'rgba(0,0,0,0.3)',
            border: '1px solid rgba(255,255,255,0.06)',
            transition: 'border-color .15s',
          }}
            onMouseEnter={e => e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'}
            onMouseLeave={e => e.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)'}
          >
            <Search size={13} style={{ color: '#5e6370', flexShrink: 0 }} />
            <input ref={searchRef} value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search models..."
              style={{
                flex: 1, height: '100%', border: 'none', background: 'transparent',
                color: '#d4d8e0', fontSize: 12, outline: 'none',
              }} />
            {modelList.length > 0 && (
              <span style={{ fontSize: 9.5, color: '#5e6370', fontFamily: 'var(--font-mono)' }}>
                {filtered.length}/{modelList.length}
              </span>
            )}
          </div>
        </div>

        {/* Content */}
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '0 18px 8px' }}>
          {/* Loading overlay */}
          {isStarting && (
            <div style={{
              padding: '10px 12px', marginBottom: 10, borderRadius: 10,
              background: 'rgba(6,182,212,0.04)',
              border: '1px solid rgba(6,182,212,0.12)',
              display: 'flex', alignItems: 'center', gap: 10,
            }}>
              <Loader2 size={14} style={{ color: '#22d3ee', animation: 'ms-spin .8s linear infinite', flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: '#22d3ee' }}>{loadProgress || 'Loading...'}</div>
                {loadStages?.length > 0 && (
                  <div style={{ fontSize: 9, color: '#5e6370', marginTop: 2 }}>
                    {loadStages[loadStages.length - 1]}
                  </div>
                )}
              </div>
              <button onClick={handleStop}
                style={{
                  height: 26, padding: '0 10px', borderRadius: 6, fontSize: 10, fontWeight: 600,
                  background: 'rgba(248,113,113,0.1)', color: '#f87171',
                  border: '1px solid rgba(248,113,113,0.15)', cursor: 'pointer',
                }}>
                Cancel
              </button>
            </div>
          )}

          {/* Currently loaded model */}
          {activeModel && isReady && (
            <div style={{
              marginBottom: 10, padding: '12px 14px', borderRadius: 10,
              background: 'rgba(6,182,212,0.04)',
              border: '1px solid rgba(6,182,212,0.12)',
            }}>
              <div style={{ fontSize: 9, fontWeight: 700, color: '#22d3ee', letterSpacing: '.06em', textTransform: 'uppercase', marginBottom: 6 }}>
                Loaded Model
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{
                  width: 6, height: 6, borderRadius: '50%',
                  background: '#22d3ee', boxShadow: '0 0 6px rgba(6,182,212,0.5)', flexShrink: 0,
                }} />
                <span style={{ fontSize: 12, fontWeight: 600, color: '#e2e8f0', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {activeEntry?.name || activeModel.replace('.gguf', '')}
                </span>
                <button onClick={handleStop}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 4, height: 26,
                    padding: '0 10px', borderRadius: 6, fontSize: 10, fontWeight: 600,
                    background: 'rgba(248,113,113,0.08)', color: '#f87171',
                    border: '1px solid rgba(248,113,113,0.15)', cursor: 'pointer',
                  }}>
                  Eject
                </button>
              </div>
            </div>
          )}

          {/* Error */}
          {(error || errorMessage) && (
            <div style={{
              marginBottom: 10, padding: '8px 12px', borderRadius: 8, fontSize: 11,
              background: 'rgba(248,113,113,0.06)', border: '1px solid rgba(248,113,113,0.15)',
              color: '#f87171',
            }}>
              {error || errorMessage}
            </div>
          )}

          {/* Recent models */}
          {recentModels?.length > 0 && search === '' && (
            <div style={{ marginBottom: 10 }}>
              <div style={{
                fontSize: 9, fontWeight: 700, color: '#5e6370',
                letterSpacing: '.06em', textTransform: 'uppercase', marginBottom: 6,
                display: 'flex', alignItems: 'center', gap: 4,
              }}>
                <Clock size={10} /> Recent
              </div>
              <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                {recentModels.slice(0, 5).map((name) => (
                  <button key={name}
                    onClick={() => {
                      const m = modelList.find(m => (m.name || m.filename).includes(name));
                      if (m) handleLoad(m);
                    }}
                    style={{
                      padding: '4px 9px', borderRadius: 6, fontSize: 10, fontWeight: 600,
                      background: activeModel?.includes(name) ? 'rgba(6,182,212,0.1)' : 'rgba(255,255,255,0.03)',
                      color: activeModel?.includes(name) ? '#22d3ee' : '#7a7f8a',
                      border: activeModel?.includes(name) ? '1px solid rgba(6,182,212,0.2)' : '1px solid rgba(255,255,255,0.05)',
                      cursor: 'pointer', transition: 'all .12s',
                    }}
                    onMouseEnter={e => { if (!activeModel?.includes(name)) { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; e.currentTarget.style.color = '#c8ccd6'; }}}
                    onMouseLeave={e => { if (!activeModel?.includes(name)) { e.currentTarget.style.background = 'rgba(255,255,255,0.03)'; e.currentTarget.style.color = '#7a7f8a'; }}}
                  >
                    {name}
                  </button>
                ))}
              </div>
            </div>
          )}

            {/* Model count + browse */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6,
              fontSize: 9, fontWeight: 700, color: '#5e6370',
              letterSpacing: '.06em', textTransform: 'uppercase',
            }}>
              <span>Available Models ({modelList.length})</span>
              <div style={{ flex: 1 }} />
              <button onClick={handleLinkFolder}
                title="Link an external folder (scanned in place — no copy)"
                style={{
                  display: 'flex', alignItems: 'center', gap: 4, height: 24,
                  padding: '0 8px', borderRadius: 5, fontSize: 9, fontWeight: 600,
                  background: 'rgba(167,139,250,0.08)', color: '#c4b5fd',
                  border: '1px solid rgba(167,139,250,0.18)',
                  cursor: 'pointer', transition: 'all .12s',
                }}
                onMouseEnter={e => e.currentTarget.style.background = 'rgba(167,139,250,0.18)'}
                onMouseLeave={e => e.currentTarget.style.background = 'rgba(167,139,250,0.08)'}
              >
                <FolderPlus size={10} /> Link Folder
              </button>
              <button onClick={handleBrowseFolder} disabled={importingFolder}
                style={{
                  display: 'flex', alignItems: 'center', gap: 4, height: 24,
                  padding: '0 8px', borderRadius: 5, fontSize: 9, fontWeight: 600,
                  background: importingFolder ? 'rgba(6,182,212,0.04)' : 'rgba(6,182,212,0.08)',
                  color: importingFolder ? '#5e6370' : '#67e8f9',
                  border: importingFolder ? '1px solid rgba(255,255,255,0.04)' : '1px solid rgba(6,182,212,0.12)',
                  cursor: importingFolder ? 'wait' : 'pointer',
                  transition: 'all .12s', opacity: importingFolder ? 0.6 : 1,
                }}
                onMouseEnter={e => { if (!importingFolder) e.currentTarget.style.background = 'rgba(6,182,212,0.18)'; }}
                onMouseLeave={e => { if (!importingFolder) e.currentTarget.style.background = 'rgba(6,182,212,0.08)'; }}
              >
                {importingFolder ? <><Loader2 size={10} style={{ animation: 'ms-spin .8s linear infinite' }} /> Importing...</> : <><FolderPlus size={10} /> Import Folder</>}
              </button>
              <button onClick={handleBrowseFile}
                style={{
                  display: 'flex', alignItems: 'center', gap: 4, height: 24,
                  padding: '0 8px', borderRadius: 5, fontSize: 9, fontWeight: 600,
                  background: 'rgba(255,255,255,0.03)', color: '#c8ccd6',
                  border: '1px solid rgba(255,255,255,0.06)', cursor: 'pointer',
                  transition: 'all .12s',
                }}
                onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.08)'}
                onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.03)'}
              >
                <FileText size={10} /> Import File
              </button>
            {modelsDir && (
              <button onClick={openFolder} title="Open models folder"
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  width: 24, height: 24, borderRadius: 5,
                  background: 'rgba(255,255,255,0.03)', color: '#5e6370',
                  border: '1px solid rgba(255,255,255,0.06)', cursor: 'pointer',
                }}
                onMouseEnter={e => { e.currentTarget.style.color = '#c8ccd6'; e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; }}
                onMouseLeave={e => { e.currentTarget.style.color = '#5e6370'; e.currentTarget.style.background = 'rgba(255,255,255,0.03)'; }}
              >
                <HardDrive size={11} />
              </button>
            )}
          </div>

          {/* Linked external folders */}
          {linkedDirs.length > 0 && (
            <div style={{
              display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 8,
            }}>
              {linkedDirs.map((dir) => (
                <div key={dir}
                  title={dir}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 5,
                    padding: '3px 4px 3px 8px', borderRadius: 6,
                    background: 'rgba(167,139,250,0.06)',
                    border: '1px solid rgba(167,139,250,0.18)',
                    fontSize: 9.5, fontFamily: 'var(--font-mono)', color: '#c4b5fd',
                    maxWidth: '100%',
                  }}
                >
                  <FolderPlus size={9} style={{ flexShrink: 0 }} />
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 280 }}>
                    {dir}
                  </span>
                  <button
                    onClick={() => handleUnlinkFolder(dir)}
                    title="Unlink"
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      width: 16, height: 16, borderRadius: 4,
                      background: 'transparent', color: '#a78bfa',
                      border: 'none', cursor: 'pointer',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.background = 'rgba(248,113,113,0.18)'; e.currentTarget.style.color = '#f87171'; }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#a78bfa'; }}
                  >
                    <X size={10} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Model list */}
          {!useModelStore.getState().backendConnected && modelList.length === 0 ? (
            <div style={{ padding: '40px 0', textAlign: 'center', color: '#5e6370' }}>
              <Wifi size={28} style={{ margin: '0 auto 10px', opacity: 0.3 }} />
              <div style={{ fontSize: 12, fontWeight: 500 }}>Connecting...</div>
              <div style={{ fontSize: 10, marginTop: 4 }}>Waiting for backend to respond</div>
            </div>
          ) : filtered.length === 0 ? (
            <div style={{ padding: '40px 0', textAlign: 'center', color: '#5e6370' }}>
              <Cpu size={28} style={{ margin: '0 auto 10px', opacity: 0.3 }} />
              <div style={{ fontSize: 12, fontWeight: 500 }}>No models found</div>
              {search && <div style={{ fontSize: 10, marginTop: 4 }}>Try a different search</div>}
              {!search && <div style={{ fontSize: 10, marginTop: 4 }}>Import a model folder or place .gguf files in the models folder</div>}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {filtered.map((model) => {
                const active = activeModel === model.filename;
                return (
                  <ModelCard
                    key={model.filename}
                    model={model}
                    isActive={active}
                    isLoading={loadingModel === model.filename}
                    onLoad={handleLoad}
                    onStop={handleStop}
                    serverStatus={serverStatus}
                  />
                );
              })}
            </div>
          )}

          {/* Logs */}
          <div style={{ marginTop: 8, borderTop: logs.length > 0 ? '1px solid rgba(255,255,255,0.04)' : 'none' }}>
            <button onClick={() => setLogsExpanded(!logsExpanded)}
              style={{
                display: 'flex', alignItems: 'center', gap: 6, width: '100%',
                padding: '7px 0', background: 'transparent', border: 'none',
                cursor: logs.length > 0 ? 'pointer' : 'default', color: '#5e6370', fontSize: 10,
                fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase',
              }}
            >
              <Terminal size={11} />
              <span>Server Logs</span>
              <span style={{
                padding: '0 5px', borderRadius: 4, background: 'rgba(255,255,255,0.04)',
                fontSize: 9, fontFamily: 'var(--font-mono)',
              }}>
                {logs.length}
              </span>
              <div style={{ flex: 1 }} />
              {logs.length > 0 && (
                <button onClick={(e) => { e.stopPropagation(); copyLogs(); }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 4, height: 22,
                    padding: '0 7px', borderRadius: 5, fontSize: 9, fontWeight: 600,
                    background: copied ? 'rgba(52,211,153,0.1)' : 'rgba(255,255,255,0.03)',
                    color: copied ? '#34d399' : '#5e6370',
                    border: copied ? '1px solid rgba(52,211,153,0.2)' : '1px solid rgba(255,255,255,0.06)',
                    cursor: 'pointer', transition: 'all .12s',
                  }}
                  onMouseEnter={e => { if (!copied) { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; e.currentTarget.style.color = '#c8ccd6'; }}}
                  onMouseLeave={e => { if (!copied) { e.currentTarget.style.background = 'rgba(255,255,255,0.03)'; e.currentTarget.style.color = '#5e6370'; }}}
                >
                  {copied ? <Check size={10} /> : <Copy size={10} />}
                  {copied ? 'Copied' : 'Copy'}
                </button>
              )}
            </button>

            {logsExpanded && logs.length > 0 && (
              <div ref={logsRef} style={{
                maxHeight: 200, overflowY: 'auto',
                padding: '6px 10px', borderRadius: 8,
                background: 'rgba(0,0,0,0.3)',
                fontFamily: 'var(--font-mono)', fontSize: 9.5, lineHeight: 1.7,
              }}>
                {logs.map((l, i) => (
                  <div key={i} style={{
                    color: l.level === 'error' ? '#f87171' : l.level === 'warn' ? '#fbbf24' : '#6b7280',
                    whiteSpace: 'pre-wrap', wordBreak: 'break-all',
                  }}>
                    {l.text}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Settings modal (opened when clicking Load) */}
      <ModelSettingsModal
        open={!!settingsModel}
        onClose={handleSettingsClose}
        backendUrl={backendUrl}
        model={settingsModel}
        onLoadComplete={() => { fetchAll(); setSettingsModel(null); }}
      />

      <style>{`
        @keyframes ms-fade-in { from { opacity: 0; } to { opacity: 1; } }
        @keyframes ms-slide-up { from { opacity: 0; transform: translateY(16px) scale(.98); } to { opacity: 1; transform: translateY(0) scale(1); } }
        @keyframes ms-spin { to { transform: rotate(360deg); } }
        @keyframes ms-pulse { 0%,100% { opacity: 1; } 50% { opacity: .4; } }
      `}</style>
    </div>
  ), document.body);
}
