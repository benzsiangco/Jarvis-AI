import { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Search, X, FolderPlus, HardDrive, Loader2, Cpu, Clock, Layers, Globe, Cloud, RefreshCw, Server, Plus, CheckCircle } from 'lucide-react';
import useModelStore from '../stores/modelStore';
import useProviderStore from '../stores/providerStore';
import ModelCard from './ModelCard';
import RuntimeSettings from './RuntimeSettings';
import ProviderManagerModal from './ProviderManagerModal';
import { formatModelSize } from './ModelCard';

const PROVIDER_TYPE_META = {
  'openai':        { label: 'OpenAI',     color: '#22d3ee', icon: Cloud },
  'openai-compat': { label: 'Compatible', color: '#a78bfa', icon: Server },
  'ollama':        { label: 'Ollama',     color: '#fbbf24', icon: HardDrive },
  'anthropic':     { label: 'Anthropic',  color: '#f472b6', icon: Cloud },
};

export default function ModelSelectorModal({ open, onClose, backendUrl }) {
  const {
    models, activeModel, serverStatus, loadModel, stopModel,
    appliedSettings, llamaStats, errorMessage, loadProgress, loadStages,
  } = useModelStore();

  const [search, setSearch] = useState('');
  const [tab, setTab] = useState('models');
  const [loadingModel, setLoadingModel] = useState(null);
  const [modelList, setModelList] = useState([]);
  const [modelsDir, setModelsDir] = useState('');
  const [error, setError] = useState('');
  const [logs, setLogs] = useState([]);
  const ref = useRef(null);
  const searchRef = useRef(null);
  const recentModels = useModelStore((s) => s.recentModels);

  // Fetch models when open
  const fetchAll = useCallback(async () => {
    try {
      const res = await fetch(`${backendUrl}/api/models`);
      const data = await res.json();
      setModelList(data.models || []);
      setModelsDir(data.modelsDir || '');
    } catch {}
  }, [backendUrl]);

  useEffect(() => {
    if (!open) return;
    fetchAll();
    setSearch('');
  }, [open, fetchAll]);

  // Fetch logs for loading animation
  useEffect(() => {
    if (!open || (serverStatus !== 'starting' && serverStatus !== 'loading')) {
      if (serverStatus === 'ready') {
        // Fetch one final time for complete logs
        fetch(`${backendUrl}/api/models/logs?limit=30`).then(r => r.json()).then(d => {
          if (d.logs) setLogs(d.logs.slice(-15));
        }).catch(() => {});
      }
      return;
    }
    const id = setInterval(async () => {
      try {
        const res = await fetch(`${backendUrl}/api/models/logs?limit=15`);
        const data = await res.json();
        if (data.logs?.length) setLogs(data.logs);
      } catch {}
    }, 1200);
    return () => clearInterval(id);
  }, [open, backendUrl, serverStatus]);

  // Esc to close
  useEffect(() => {
    if (!open) return;
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onClose]);

  // Focus search
  useEffect(() => {
    if (open && searchRef.current) setTimeout(() => searchRef.current?.focus(), 200);
  }, [open, tab]);

  // Lock scroll + handle outside click (native, avoids React synthetic propagation issues)
  useEffect(() => {
    if (!open) return;
    const html = document.documentElement;
    const body = document.body;
    const prevHtmlOverflow = html.style.overflow;
    const prevBodyOverflow = body.style.overflow;
    html.style.overflow = 'hidden';
    body.style.overflow = 'hidden';
    const mousedownHandler = (e) => {
      if (!ref.current) return;
      if (ref.current.contains(e.target)) return;
      // Don't close if the click is inside another modal stacked on top.
      if (e.target.closest?.('.pm-backdrop, .vm-root, [data-modal="true"]')) return;
      onClose();
    };
    const wheelHandler = (e) => {
      if (!ref.current) return;
      if (ref.current.contains(e.target)) return;
      if (e.target.closest?.('.pm-backdrop, .vm-root, [data-modal="true"]')) return;
      e.preventDefault();
    };
    document.addEventListener('mousedown', mousedownHandler);
    document.addEventListener('wheel', wheelHandler, { passive: false });
    return () => {
      html.style.overflow = prevHtmlOverflow;
      body.style.overflow = prevBodyOverflow;
      document.removeEventListener('mousedown', mousedownHandler);
      document.removeEventListener('wheel', wheelHandler);
    };
  }, [open, onClose]);

  if (!open) return null;

  const filtered = search
    ? modelList.filter(m => (m.name || m.filename).toLowerCase().includes(search.toLowerCase()))
    : modelList;

  const isStarting = serverStatus === 'starting' || serverStatus === 'loading';
  const isReady = serverStatus === 'ready';
  const isError = serverStatus === 'error';

  const handleLoad = async (model) => {
    setLoadingModel(model.filename);
    setError('');
    setLogs([]);
    try {
      await loadModel(backendUrl, model.filename);
      const state = useModelStore.getState();
      if (state.errorMessage) setError(state.errorMessage);
      // Switch to loading tab to show progress
      setTab('loading');
    } catch (err) {
      setError(`Failed: ${err.message}`);
    } finally {
      setLoadingModel(null);
    }
  };

  const handleStop = async () => {
    await stopModel(backendUrl);
    setLogs([]);
    setTimeout(() => fetchAll(), 500);
  };

  const handleBrowse = async () => {
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

  const openModelsFolder = () => window.electronAPI?.openPath?.(modelsDir);

  const statusColor = isReady ? '#22d3ee' : isStarting ? '#fbbf24' : isError ? '#f87171' : '#5e6370';
  const statusLabel = isReady ? 'Ready' : isStarting ? loadProgress || 'Starting...' : isError ? 'Error' : 'Offline';

  return createPortal((
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(0,0,0,0.6)',
      backdropFilter: 'blur(8px)',
      animation: 'ms-fade-in .2s ease-out',
      overscrollBehavior: 'contain',
    }}>
      <div ref={ref} style={{
        width: 680, maxWidth: '90vw',
        height: '80vh', maxHeight: 800,
        display: 'flex', flexDirection: 'column',
        borderRadius: 16, overflow: 'hidden',
        background: 'linear-gradient(180deg, #0d1117 0%, #0a0a0f 100%)',
        border: '1px solid rgba(255,255,255,0.06)',
        boxShadow: '0 32px 80px rgba(0,0,0,0.7), 0 0 0 1px rgba(6,182,212,0.04)',
        animation: 'ms-slide-up .25s cubic-bezier(0.16,1,0.3,1)',
      }}>
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0,
          padding: '14px 18px',
          borderBottom: '1px solid rgba(255,255,255,0.04)',
          background: 'rgba(0,0,0,0.2)',
        }}>
          <Cpu size={16} style={{ color: '#22d3ee' }} />
          <span style={{ fontSize: 13, fontWeight: 700, color: '#e2e8f0', letterSpacing: '.02em' }}>
            Model Loader
          </span>
          <span style={{ fontSize: 9, color: '#5e6370', fontFamily: 'var(--font-mono)' }}>
            v1.0
          </span>

          <div style={{ flex: 1 }} />

          {/* Tab buttons */}
          <div style={{ display: 'flex', gap: 3 }}>
            {[
              { id: 'models', label: 'Local' },
              { id: 'providers', label: 'Providers' },
              { id: 'settings', label: 'Settings' },
              { id: 'loading', label: 'Runtime', show: isStarting || isReady },
            ].filter(t => t.show !== false).map(({ id, label }) => (
              <button key={id} onClick={() => setTab(id)}
                style={{
                  padding: '5px 12px', borderRadius: 7, fontSize: 11, fontWeight: 600,
                  background: tab === id ? 'rgba(6,182,212,0.1)' : 'transparent',
                  color: tab === id ? '#22d3ee' : '#5e6370',
                  border: tab === id ? '1px solid rgba(6,182,212,0.15)' : '1px solid transparent',
                  transition: 'all .12s',
                }}
                onMouseEnter={e => { if (tab !== id) { e.currentTarget.style.color = '#8b8d99'; e.currentTarget.style.background = 'rgba(255,255,255,0.03)'; }}}
                onMouseLeave={e => { if (tab !== id) { e.currentTarget.style.color = '#5e6370'; e.currentTarget.style.background = 'transparent'; }}}
              >
                {label}
              </button>
            ))}
          </div>

          <button onClick={onClose}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: 28, height: 28, borderRadius: 8,
              color: '#5e6370', transition: 'all .12s', border: 'none',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.07)'; e.currentTarget.style.color = '#e2e8f0'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#5e6370'; }}
          >
            <X size={15} />
          </button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
          {/* Runtime info bar */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0,
            padding: '8px 18px',
            background: isStarting ? 'rgba(251,191,36,0.04)' : isReady ? 'rgba(6,182,212,0.04)' : 'transparent',
            borderBottom: '1px solid rgba(255,255,255,0.03)',
          }}>
            <span style={{
              width: 7, height: 7, borderRadius: '50%', flexShrink: 0,
              background: statusColor,
              boxShadow: isStarting ? `0 0 8px ${statusColor}` : 'none',
              animation: isStarting ? 'ms-pulse 1.2s ease-in-out infinite' : 'none',
            }} />
            <span style={{ fontSize: 11, color: statusColor, fontWeight: 600, flexShrink: 0 }}>
              {statusLabel}
            </span>
            {activeModel && (
              <span style={{ fontSize: 10, color: '#5e6370', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {activeModel.replace('.gguf', '')}
              </span>
            )}
            {isReady && appliedSettings && (
              <span style={{ fontSize: 10, color: '#5e6370', fontFamily: 'var(--font-mono)', marginLeft: 'auto' }}>
                ctx {appliedSettings.ctxSize?.toLocaleString()} · gpu {appliedSettings.gpuLayers}
              </span>
            )}
            {isStarting && (
              <span style={{ marginLeft: 'auto', fontSize: 10, color: '#5e6370', fontFamily: 'var(--font-mono)' }}>
                {loadProgress}
              </span>
            )}
          </div>

          {/* Tab content */}
          <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', overflowX: 'hidden' }}>
            <div style={{ padding: '14px 18px' }}>
            {tab === 'models' && (
              <ModelsTab
                search={search} onSearchChange={setSearch}
                filtered={filtered} modelList={modelList}
                activeModel={activeModel} serverStatus={serverStatus}
                loadingModel={loadingModel} onLoad={handleLoad}
                onStop={handleStop} onBrowse={handleBrowse}
                onOpenFolder={openModelsFolder}
                modelsDir={modelsDir}
                error={error || errorMessage}
                appliedCtx={appliedSettings?.ctxSize}
                llamaStats={llamaStats}
                isStarting={isStarting}
                isReady={isReady}
                recentModels={recentModels}
                searchRef={searchRef}
              />
            )}
            {tab === 'providers' && (
              <ProvidersTab
                backendUrl={backendUrl}
                onClose={onClose}
              />
            )}
            {tab === 'settings' && (
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#5e6370', letterSpacing: '.06em', textTransform: 'uppercase', marginBottom: 14 }}>
                  Runtime Settings
                </div>
                <RuntimeSettings backendUrl={backendUrl} />
              </div>
            )}
            {tab === 'loading' && (
              <LoadingTab
                isStarting={isStarting}
                isReady={isReady}
                isError={isError}
                loadStages={loadStages}
                loadProgress={loadProgress}
                logs={logs}
                errorMessage={errorMessage}
                activeModel={activeModel}
                appliedSettings={appliedSettings}
                backendUrl={backendUrl}
              />
            )}
            </div>
          </div>

        </div>
      </div>

      <style>{`
        @keyframes ms-fade-in { from { opacity: 0; } to { opacity: 1; } }
        @keyframes ms-slide-up { from { opacity: 0; transform: translateY(16px) scale(.98); } to { opacity: 1; transform: translateY(0) scale(1); } }
        @keyframes ms-spin { to { transform: rotate(360deg); } }
        @keyframes ms-pulse { 0%,100% { opacity: 1; } 50% { opacity: .4; } }
        @keyframes ms-shimmer { 0% { transform: translateX(-100%); } 100% { transform: translateX(300%); } }
      `}</style>
    </div>
  ), document.body);
}

function ModelsTab({
  search, onSearchChange, filtered, modelList,
  activeModel, serverStatus, loadingModel, onLoad, onStop,
  onBrowse, onOpenFolder, modelsDir, error, appliedCtx,
  llamaStats, isStarting, isReady, recentModels, searchRef,
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Search */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '0 12px', height: 38, borderRadius: 10,
        background: 'rgba(0,0,0,0.3)',
        border: '1px solid rgba(255,255,255,0.06)',
        transition: 'border-color .15s',
      }}
        onMouseEnter={e => e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'}
        onMouseLeave={e => e.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)'}
      >
        <Search size={14} style={{ color: '#5e6370', flexShrink: 0 }} />
        <input
          ref={searchRef}
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search models..."
          style={{
            flex: 1, height: '100%', border: 'none', background: 'transparent',
            color: '#d4d8e0', fontSize: 12, outline: 'none',
          }}
        />
        {modelList.length > 0 && (
          <span style={{ fontSize: 10, color: '#5e6370', fontFamily: 'var(--font-mono)' }}>
            {filtered.length}/{modelList.length}
          </span>
        )}
      </div>

      {/* Recent models */}
      {recentModels?.length > 0 && search === '' && (
        <div>
          <div style={{
            fontSize: 9, fontWeight: 700, letterSpacing: '.08em',
            textTransform: 'uppercase', color: '#5e6370', marginBottom: 6,
            display: 'flex', alignItems: 'center', gap: 5,
          }}>
            <Clock size={10} /> Recent
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {recentModels.slice(0, 5).map((name) => {
              const active = activeModel?.includes(name);
              return (
                <button key={name}
                  onClick={() => {
                    const m = modelList.find(m => (m.name || m.filename).includes(name));
                    if (m) onLoad(m);
                  }}
                  style={{
                    padding: '4px 10px', borderRadius: 7, fontSize: 10, fontWeight: 600,
                    background: active ? 'rgba(6,182,212,0.1)' : 'rgba(255,255,255,0.03)',
                    color: active ? '#22d3ee' : '#7a7f8a',
                    border: active ? '1px solid rgba(6,182,212,0.2)' : '1px solid rgba(255,255,255,0.05)',
                    transition: 'all .12s', cursor: 'pointer',
                  }}
                  onMouseEnter={e => { if (!active) { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; e.currentTarget.style.color = '#c8ccd6'; }}}
                  onMouseLeave={e => { if (!active) { e.currentTarget.style.background = 'rgba(255,255,255,0.03)'; e.currentTarget.style.color = '#7a7f8a'; }}}
                >
                  {name}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div style={{
          padding: '8px 12px', borderRadius: 8, fontSize: 11,
          background: 'rgba(248,113,113,0.06)', border: '1px solid rgba(248,113,113,0.15)',
          color: '#f87171',
        }}>
          {error}
        </div>
      )}

      {/* Browse + count */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <button onClick={onBrowse}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            height: 32, padding: '0 14px', borderRadius: 8, fontSize: 11, fontWeight: 600,
            background: 'rgba(6,182,212,0.08)', color: '#67e8f9',
            border: '1px solid rgba(6,182,212,0.15)',
            transition: 'all .12s', cursor: 'pointer',
          }}
          onMouseEnter={e => e.currentTarget.style.background = 'rgba(6,182,212,0.16)'}
          onMouseLeave={e => e.currentTarget.style.background = 'rgba(6,182,212,0.08)'}
        >
          <FolderPlus size={12} /> Browse GGUF
        </button>
        {modelsDir && (
          <button onClick={onOpenFolder} title="Open models folder"
            style={{
              height: 32, width: 32, borderRadius: 8, display: 'flex',
              alignItems: 'center', justifyContent: 'center',
              background: 'rgba(255,255,255,0.03)', color: '#5e6370',
              border: '1px solid rgba(255,255,255,0.06)', cursor: 'pointer',
            }}
            onMouseEnter={e => { e.currentTarget.style.color = '#c8ccd6'; e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; }}
            onMouseLeave={e => { e.currentTarget.style.color = '#5e6370'; e.currentTarget.style.background = 'rgba(255,255,255,0.03)'; }}
          >
            <HardDrive size={13} />
          </button>
        )}
        <span style={{ marginLeft: 'auto', fontSize: 9, color: '#5e6370', fontFamily: 'var(--font-mono)' }}>
          {modelList.length} model{modelList.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Models list */}
      {filtered.length === 0 ? (
        <div style={{
          padding: '40px 0', textAlign: 'center', color: '#5e6370',
        }}>
          <Cpu size={28} style={{ margin: '0 auto 10px', opacity: 0.3 }} />
          <div style={{ fontSize: 12, fontWeight: 500 }}>No models found</div>
          {search && <div style={{ fontSize: 10, marginTop: 4 }}>Try a different search</div>}
          {!search && (
            <div style={{ fontSize: 10, marginTop: 4 }}>Place .gguf files in the models folder</div>
          )}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {filtered.map((model) => {
            const loading = loadingModel === model.filename;
            const active = activeModel === model.filename;
            return (
              <ModelCard
                key={model.filename}
                model={model}
                isActive={active}
                isLoading={loading}
                onLoad={onLoad}
                onStop={onStop}
                serverStatus={serverStatus}
                appliedCtx={appliedCtx}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

function LoadingTab({
  isStarting, isReady, isError, loadStages, loadProgress,
  logs, errorMessage, activeModel, appliedSettings, backendUrl,
}) {
  const icon = useRef(null);
  const loading = isStarting;
  const stages = [
    'Initializing llama.cpp runtime...',
    'Allocating model weights...',
    'Allocating KV cache...',
    'Applying GPU offload...',
    'Runtime ready.',
  ];

  const currentStageIdx = stages.findIndex(s => loadStages?.includes(s));

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', gap: 20, padding: '20px 0',
      minHeight: 300,
    }}>
      {/* Animated icon */}
      <div ref={icon} style={{
        width: 56, height: 56, borderRadius: '50%',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: loading
          ? 'linear-gradient(135deg, rgba(6,182,212,0.15), rgba(6,182,212,0.05))'
          : isReady
            ? 'linear-gradient(135deg, rgba(6,182,212,0.12), rgba(6,182,212,0.04))'
            : 'rgba(255,255,255,0.03)',
        border: loading
          ? '2px solid rgba(6,182,212,0.3)'
          : isReady
            ? '2px solid rgba(6,182,212,0.2)'
            : '2px solid rgba(255,255,255,0.06)',
        boxShadow: loading
          ? '0 0 24px rgba(6,182,212,0.15), 0 0 0 1px rgba(6,182,212,0.05) inset'
          : isReady
            ? '0 0 16px rgba(6,182,212,0.1)'
            : 'none',
        animation: loading ? 'ms-pulse 1.6s ease-in-out infinite' : 'none',
      }}>
        {loading ? (
          <Loader2 size={24} style={{ color: '#22d3ee', animation: 'ms-spin 1.2s linear infinite' }} />
        ) : isReady ? (
          <span style={{ color: '#22d3ee', fontSize: 24 }}>✓</span>
        ) : (
          <Cpu size={24} style={{ color: '#5e6370' }} />
        )}
      </div>

      {/* Loading stages */}
      <div style={{ width: '100%', maxWidth: 420 }}>
        {stages.map((stage, i) => {
          const done = currentStageIdx > i || (isReady && i === stages.length - 1);
          const current = currentStageIdx === i && loading;
          return (
            <div key={stage} style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '7px 12px', borderRadius: 8,
              background: current ? 'rgba(6,182,212,0.04)' : 'transparent',
              transition: 'all .3s',
            }}>
              <span style={{
                width: 16, height: 16, borderRadius: '50%', flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: done ? 'rgba(6,182,212,0.15)' : current ? 'rgba(251,191,36,0.12)' : 'rgba(255,255,255,0.04)',
                color: done ? '#22d3ee' : current ? '#fbbf24' : '#5e6370',
                fontSize: 8, fontWeight: 700,
              }}>
                {done ? '✓' : current ? '●' : i + 1}
              </span>
              <span style={{
                fontSize: 11,
                color: done ? '#c8ccd6' : current ? '#e2e8f0' : '#5e6370',
                fontWeight: current ? 600 : 400,
                transition: 'all .3s',
              }}>
                {stage}
              </span>
              {current && (
                <span style={{ marginLeft: 'auto' }}>
                  <span style={{
                    display: 'inline-block', width: 48, height: 3, borderRadius: 2,
                    background: 'rgba(255,255,255,0.06)', overflow: 'hidden',
                  }}>
                    <span style={{
                      display: 'block', width: '40%', height: '100%',
                      borderRadius: 2, background: 'rgba(6,182,212,0.5)',
                      animation: 'ms-shimmer 1.2s ease-in-out infinite',
                    }} />
                  </span>
                </span>
              )}
            </div>
          );
        })}
      </div>

      {/* Runtime logs */}
      {logs.length > 0 && (
        <div style={{
          width: '100%', maxWidth: 420, maxHeight: 140, overflowY: 'auto',
          padding: '8px 10px', borderRadius: 8,
          background: 'rgba(0,0,0,0.3)',
          border: '1px solid rgba(255,255,255,0.04)',
          fontFamily: 'var(--font-mono)', fontSize: 9.5, lineHeight: 1.6,
        }}>
          {logs.map((log, i) => (
            <div key={i} style={{
              color: log.level === 'error' ? '#f87171' : '#5e6370',
              whiteSpace: 'pre-wrap', wordBreak: 'break-all',
            }}>
              <span style={{ color: '#3a3c4e' }}>
                {new Date(log.ts).toLocaleTimeString('en', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              </span>
              {' '}{log.text}
            </div>
          ))}
        </div>
      )}

      {/* Error */}
      {isError && errorMessage && (
        <div style={{
          padding: '8px 14px', borderRadius: 8, fontSize: 11, maxWidth: 420,
          background: 'rgba(248,113,113,0.06)', border: '1px solid rgba(248,113,113,0.15)',
          color: '#f87171',
        }}>
          {errorMessage}
        </div>
      )}

      {/* Ready state */}
      {isReady && (
        <div style={{
          textAlign: 'center', maxWidth: 420,
        }}>
          <div style={{ fontSize: 12, color: '#22d3ee', fontWeight: 600, marginBottom: 4 }}>
            Runtime ready
          </div>
          {activeModel && (
            <div style={{ fontSize: 10, color: '#5e6370' }}>
              {activeModel.replace('.gguf', '')}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ─── Providers Tab — pick a remote model from configured providers ─── */
function ProvidersTab({ backendUrl, onClose }) {
  const {
    providers, activeProviderId, activeModel, loading,
    fetchProviders, fetchModels,
  } = useProviderStore();
  const selectProviderModel = useModelStore((s) => s.selectProviderModel);
  const clearProviderModel = useModelStore((s) => s.clearProviderModel);

  const [search, setSearch] = useState('');
  const [refreshingId, setRefreshingId] = useState(null);
  const [selectingKey, setSelectingKey] = useState(null);
  const [managerOpen, setManagerOpen] = useState(false);

  useEffect(() => {
    fetchProviders(backendUrl);
  }, [backendUrl, fetchProviders]);

  const handleRefresh = async (id) => {
    setRefreshingId(id);
    await fetchModels(backendUrl, id);
    setRefreshingId(null);
  };

  const handleSelect = async (providerId, modelId) => {
    const key = `${providerId}:${modelId}`;
    setSelectingKey(key);
    await selectProviderModel(backendUrl, providerId, modelId);
    await fetchProviders(backendUrl);
    setSelectingKey(null);
    onClose?.();
  };

  const handleDisconnect = async () => {
    setSelectingKey('disconnect');
    await clearProviderModel(backendUrl);
    await fetchProviders(backendUrl);
    setSelectingKey(null);
  };

  // Flatten provider+model pairs and apply search
  const q = search.trim().toLowerCase();
  const visibleProviders = providers
    .map((p) => {
      const filtered = !q
        ? p.models
        : p.models.filter((m) =>
            (m.name || '').toLowerCase().includes(q) ||
            (m.id || '').toLowerCase().includes(q) ||
            p.name.toLowerCase().includes(q)
          );
      return { ...p, _filtered: filtered };
    })
    .filter((p) => !q || p._filtered.length > 0 || p.name.toLowerCase().includes(q));

  const totalModels = providers.reduce((sum, p) => sum + (p.models?.length || 0), 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Search + manage button */}
      <div style={{ display: 'flex', gap: 8 }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8, flex: 1,
          padding: '0 12px', height: 38, borderRadius: 10,
          background: 'rgba(0,0,0,0.3)',
          border: '1px solid rgba(255,255,255,0.06)',
        }}>
          <Search size={14} style={{ color: '#5e6370', flexShrink: 0 }} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search provider models..."
            style={{
              flex: 1, height: '100%', border: 'none', background: 'transparent',
              color: '#d4d8e0', fontSize: 12, outline: 'none',
            }}
          />
          {totalModels > 0 && (
            <span style={{ fontSize: 10, color: '#5e6370', fontFamily: 'var(--font-mono)' }}>
              {totalModels}
            </span>
          )}
        </div>
        <button onClick={() => setManagerOpen(true)} style={{
          display: 'flex', alignItems: 'center', gap: 6, height: 38, padding: '0 14px',
          borderRadius: 10, fontSize: 11, fontWeight: 600,
          background: 'rgba(6,182,212,0.08)', color: '#67e8f9',
          border: '1px solid rgba(6,182,212,0.15)', cursor: 'pointer',
        }}>
          <Plus size={12} /> Manage
        </button>
      </div>

      {/* Active banner */}
      {activeProviderId && activeModel && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '8px 13px', borderRadius: 8,
          background: 'rgba(6,182,212,0.06)',
          border: '1px solid rgba(6,182,212,0.15)',
          fontSize: 11.5,
        }}>
          <CheckCircle size={13} style={{ color: '#22d3ee' }} />
          <span style={{ color: '#5e6370' }}>Connected to</span>
          <strong style={{ color: '#22d3ee' }}>
            {providers.find((p) => p.id === activeProviderId)?.name}
          </strong>
          <span style={{ color: '#6b7280', fontFamily: 'var(--font-mono)', fontSize: 10.5 }}>
            {activeModel}
          </span>
          <span style={{ flex: 1 }} />
          <button onClick={handleDisconnect} disabled={selectingKey === 'disconnect'} style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            padding: '3px 8px', borderRadius: 5, fontSize: 10, fontWeight: 600,
            background: 'rgba(248,113,113,0.08)', color: '#f87171',
            border: '1px solid rgba(248,113,113,0.14)', cursor: 'pointer',
          }}>
            {selectingKey === 'disconnect' ? <Loader2 size={10} style={{ animation: 'ms-spin .8s linear infinite' }} /> : <X size={10} />}
            Disconnect
          </button>
        </div>
      )}

      {/* Empty state */}
      {!loading && providers.length === 0 && (
        <div style={{
          padding: '40px 16px', textAlign: 'center',
          border: '1px dashed rgba(255,255,255,0.08)', borderRadius: 12,
        }}>
          <Globe size={28} style={{ margin: '0 auto 8px', color: '#3a3c4e' }} />
          <div style={{ fontSize: 12, fontWeight: 600, color: '#c8cad4', marginBottom: 4 }}>
            No providers configured
          </div>
          <div style={{ fontSize: 11, color: '#5e6370', maxWidth: 320, margin: '0 auto 12px' }}>
            Connect to OpenAI, LM Studio, Ollama, Anthropic, and more to use hosted or remote models.
          </div>
          <button onClick={() => setManagerOpen(true)} style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '7px 14px', borderRadius: 8, fontSize: 11.5, fontWeight: 600,
            background: 'rgba(6,182,212,0.1)', color: '#22d3ee',
            border: '1px solid rgba(6,182,212,0.2)', cursor: 'pointer',
          }}>
            <Plus size={12} /> Add Provider
          </button>
        </div>
      )}

      {/* Loading */}
      {loading && providers.length === 0 && (
        <div style={{ padding: '40px 0', textAlign: 'center', color: '#5e6370' }}>
          <Loader2 size={22} style={{ animation: 'ms-spin .8s linear infinite', margin: '0 auto 8px' }} />
          <div style={{ fontSize: 11 }}>Loading providers…</div>
        </div>
      )}

      {/* Provider list */}
      {visibleProviders.map((p) => {
        const meta = PROVIDER_TYPE_META[p.type] || PROVIDER_TYPE_META['openai-compat'];
        const Icon = meta.icon;
        const isActiveProv = p.id === activeProviderId;
        const refreshing = refreshingId === p.id;

        return (
          <div key={p.id} style={{
            borderRadius: 10, overflow: 'hidden',
            border: isActiveProv ? '1px solid rgba(6,182,212,0.22)' : '1px solid rgba(255,255,255,0.05)',
            background: isActiveProv ? 'rgba(6,182,212,0.025)' : 'rgba(255,255,255,0.012)',
          }}>
            {/* Provider header */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 9,
              padding: '8px 12px',
              borderBottom: '1px solid rgba(255,255,255,0.04)',
              background: 'rgba(0,0,0,0.18)',
            }}>
              <div style={{
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                width: 24, height: 24, borderRadius: 6,
                color: meta.color, background: `${meta.color}14`,
              }}>
                <Icon size={12} />
              </div>
              <span style={{ fontSize: 12, fontWeight: 650, color: isActiveProv ? '#22d3ee' : '#c8cad4' }}>
                {p.name}
              </span>
              <span style={{
                padding: '1px 6px', borderRadius: 4, fontSize: 9, fontWeight: 700,
                letterSpacing: '.04em', textTransform: 'uppercase',
                color: meta.color, background: `${meta.color}14`,
                border: `1px solid ${meta.color}26`,
              }}>
                {meta.label}
              </span>
              <span style={{ flex: 1 }} />
              <span style={{ fontSize: 10, color: '#5e6370' }}>
                {p._filtered.length}/{p.models.length} model{p.models.length === 1 ? '' : 's'}
              </span>
              <button onClick={() => handleRefresh(p.id)} disabled={refreshing} style={{
                display: 'inline-flex', alignItems: 'center', gap: 4,
                padding: '3px 8px', borderRadius: 5, fontSize: 9.5, fontWeight: 600,
                background: 'rgba(6,182,212,0.06)', color: '#22d3ee',
                border: '1px solid rgba(6,182,212,0.12)', cursor: 'pointer',
              }}>
                {refreshing ? <Loader2 size={10} style={{ animation: 'ms-spin .8s linear infinite' }} /> : <RefreshCw size={10} />}
                Refresh
              </button>
            </div>

            {/* Models */}
            {p._filtered.length === 0 ? (
              <div style={{
                padding: '14px', fontSize: 11.5, color: '#5e6370', textAlign: 'center',
              }}>
                {p.models.length === 0
                  ? <>Click <strong style={{ color: '#22d3ee' }}>Refresh</strong> to fetch models.</>
                  : <>No models match "{search}".</>}
              </div>
            ) : (
              <div style={{ maxHeight: 320, overflowY: 'auto' }}>
                {p._filtered.map((m) => {
                  const key = `${p.id}:${m.id}`;
                  const isSel = isActiveProv && activeModel === m.id;
                  const isSelecting = selectingKey === key;
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => handleSelect(p.id, m.id)}
                      disabled={isSelecting}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 10, width: '100%',
                        padding: '8px 14px',
                        cursor: isSelecting ? 'wait' : 'pointer',
                        background: isSel ? 'rgba(6,182,212,0.05)' : 'transparent',
                        borderLeft: isSel ? '2px solid #22d3ee' : '2px solid transparent',
                        border: 0, textAlign: 'left',
                        transition: 'background .12s',
                      }}
                      onMouseEnter={(e) => { if (!isSel && !isSelecting) e.currentTarget.style.background = 'rgba(255,255,255,0.025)'; }}
                      onMouseLeave={(e) => { if (!isSel && !isSelecting) e.currentTarget.style.background = 'transparent'; }}
                    >
                      <span style={{
                        width: 5, height: 5, borderRadius: '50%', flexShrink: 0,
                        background: isSel ? '#22d3ee' : 'rgba(255,255,255,0.12)',
                        boxShadow: isSel ? '0 0 6px rgba(34,211,238,0.6)' : 'none',
                      }} />
                      <span style={{
                        fontSize: 12, color: isSel ? '#22d3ee' : '#a0a2ae',
                        fontWeight: isSel ? 600 : 400, flex: 1, minWidth: 0,
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}>
                        {m.name}
                      </span>
                      {m.meta && (
                        <span style={{
                          fontSize: 10, color: '#5e6370', fontFamily: 'var(--font-mono)',
                          padding: '1px 5px', borderRadius: 3, background: 'rgba(255,255,255,0.03)',
                        }}>
                          {m.meta}
                        </span>
                      )}
                      {m.ownedBy && (
                        <span style={{ fontSize: 9.5, color: '#5e6370', textTransform: 'lowercase' }}>
                          {m.ownedBy}
                        </span>
                      )}
                      {isSel && (
                        <span style={{ fontSize: 9.5, color: '#4ade80', fontWeight: 600 }}>Active</span>
                      )}
                      {isSelecting && (
                        <Loader2 size={10} style={{ animation: 'ms-spin .8s linear infinite', color: '#22d3ee' }} />
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}

      <ProviderManagerModal
        open={managerOpen}
        onClose={() => { setManagerOpen(false); fetchProviders(backendUrl); }}
        backendUrl={backendUrl}
      />
    </div>
  );
}