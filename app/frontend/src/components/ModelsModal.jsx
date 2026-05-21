import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertCircle, CheckCircle, Cpu, FolderOpen, FolderPlus, HardDrive,
  Loader2, RefreshCw, Play, StopCircle, X, Sliders, ScrollText,
  Terminal, ChevronDown, Info, Wand2, FileText,
  Globe, Cloud, Server, Plus,
} from 'lucide-react';
import useModelStore from '../stores/modelStore';
import useProviderStore from '../stores/providerStore';
import SkillsToolsTab from './SkillsToolsTab';
import SystemPromptTab from './SystemPromptTab';
import ProviderManagerModal from './ProviderManagerModal';

const PROVIDER_TYPE_META = {
  'openai':        { label: 'OpenAI',     color: '#22d3ee', icon: Cloud },
  'openai-compat': { label: 'Compatible', color: '#a78bfa', icon: Server },
  'ollama':        { label: 'Ollama',     color: '#fbbf24', icon: HardDrive },
  'anthropic':     { label: 'Anthropic',  color: '#f472b6', icon: Cloud },
};

/* ── Modal Shell ── */
export function ModelsModal({ open, onClose, backendUrl, defaultTab = 'models' }) {
  const [tab, setTab] = useState(defaultTab);

  // Sync tab when modal reopens with a different target
  useEffect(() => { if (open) setTab(defaultTab); }, [open, defaultTab]);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (!ref.current) return;
      if (ref.current.contains(e.target)) return;
      // Don't close if the click is inside another modal stacked on top
      // (e.g. ProviderManagerModal opened from the Providers tab).
      if (e.target.closest?.('.pm-backdrop, .vm-root, [data-modal="true"]')) return;
      onClose();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div ref={ref} style={{
        width: 600, height: '72vh', display: 'flex', flexDirection: 'column',
        borderRadius: 14, overflow: 'hidden',
        background: '#0f1018',
        border: '1px solid rgba(255,255,255,0.07)',
        boxShadow: '0 32px 80px rgba(0,0,0,0.7), 0 0 0 1px rgba(124,109,240,0.08)',
      }}>
        {/* Modal header */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12,
          padding: '14px 18px', borderBottom: '1px solid rgba(255,255,255,0.05)',
          background: '#0c0c14',
        }}>
          {/* Tabs */}
          <div style={{ display: 'flex', gap: 4, flex: 1 }}>
            {[
              { id: 'models',   icon: Cpu,        label: 'Models'   },
              { id: 'settings', icon: Sliders,     label: 'Settings' },
              { id: 'prompt',   icon: FileText,    label: 'Prompt'   },
              { id: 'skills',   icon: Wand2,       label: 'Skills'   },
              { id: 'logs',     icon: ScrollText,  label: 'Logs'     },
            ].map(({ id, icon: Icon, label }) => (
              <button key={id} onClick={() => setTab(id)} style={{
                display: 'flex', alignItems: 'center', gap: 7,
                padding: '6px 14px', borderRadius: 8,
                fontSize: 12, fontWeight: 600,
                background: tab === id ? 'rgba(124,109,240,0.15)' : 'transparent',
                color: tab === id ? '#c4b5fd' : '#52546a',
                border: tab === id ? '1px solid rgba(124,109,240,0.2)' : '1px solid transparent',
                transition: 'all .15s',
              }}
              onMouseEnter={e => { if (tab !== id) { e.currentTarget.style.color = '#8b8d99'; e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; }}}
              onMouseLeave={e => { if (tab !== id) { e.currentTarget.style.color = '#52546a'; e.currentTarget.style.background = 'transparent'; }}}
              >
                <Icon size={13} /> {label}
              </button>
            ))}
          </div>

          {/* Close */}
          <button onClick={onClose} style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: 28, height: 28, borderRadius: 8,
            background: 'transparent', color: '#52546a',
            border: 'none', transition: 'all .15s',
          }}
          onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.07)'; e.currentTarget.style.color = '#e2e4ea'; }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#52546a'; }}
          >
            <X size={15} />
          </button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
          {tab === 'models'   && <ModelsContent    backendUrl={backendUrl} />}
          {tab === 'settings' && <SettingsContent  backendUrl={backendUrl} />}
          {tab === 'prompt'   && <SystemPromptTab  backendUrl={backendUrl} />}
          {tab === 'skills'   && <SkillsToolsTab />}
          {tab === 'logs'     && <LogsContent      backendUrl={backendUrl} />}
        </div>
      </div>
    </div>
  );
}

/* ── Models Content ── */
function ModelsContent({ backendUrl }) {
  const {
    activeModel, serverStatus, setActiveModel, setServerStatus, setServerInfo,
    gpuLayers, ctxSize, setGpuLayers, setCtxSize, stopModel, loadModel,
    errorMessage,
  } = useModelStore();
  const [modelList,    setModelList]    = useState([]);
  const [isLoading,    setIsLoading]    = useState(false);
  const [isCopying,    setIsCopying]    = useState(false);
  const [loadingModel, setLoadingModel] = useState(null);
  const [modelsDir,    setModelsDir]    = useState('');
  const [error,        setError]        = useState('');
  const [copyStatus,   setCopyStatus]   = useState('');
  const fileInputRef = useRef(null);

  const fetchModels = useCallback(async () => {
    setIsLoading(true); setError('');
    try {
      const res  = await fetch(`${backendUrl}/api/models`);
      const data = await res.json();
      setModelList(data.models || []);
      setModelsDir(data.modelsDir || '');
      if (data.currentModel) setActiveModel(data.currentModel);
      setServerStatus(data.serverStatus || 'stopped');
    } catch { setError('Cannot reach backend'); }
    finally { setIsLoading(false); }
  }, [backendUrl, setActiveModel, setServerStatus]);

  useEffect(() => {
    fetchModels();
    const i = setInterval(fetchModels, 5000);
    return () => clearInterval(i);
  }, [fetchModels]);

  const handleLoad = async (model) => {
    setLoadingModel(model.filename); setError('');
    try {
      await loadModel(backendUrl, model.filename);
      const state = useModelStore.getState();
      if (state.errorMessage) setError(state.errorMessage);
    } catch (err) { setError(`Failed to load: ${err.message}`); }
    finally { setLoadingModel(null); }
  };

  const handleStop = async () => {
    setError('');
    await stopModel(backendUrl);
    setTimeout(() => fetchModels(), 500);
  };

  const handleBrowse = async () => {
    if (window.electronAPI?.pickModel) {
      const srcPath = await window.electronAPI.pickModel();
      if (!srcPath) return;
      const filename = srcPath.split(/[/\\]/).pop();
      setIsCopying(true); setCopyStatus(`Copying ${filename}...`); setError('');
      try {
        await window.electronAPI.copyModel(srcPath);
        setCopyStatus(`${filename} added`);
        await fetchModels();
        setTimeout(() => setCopyStatus(''), 3000);
      } catch (err) { setError(`Copy failed: ${err.message}`); setCopyStatus(''); }
      finally { setIsCopying(false); }
      return;
    }
    fileInputRef.current?.click();
  };

  const handleFileInputChange = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return; event.target.value = '';
    setIsCopying(true); setCopyStatus(`Uploading ${file.name}...`); setError('');
    try {
      const formData = new FormData(); formData.append('model', file);
      const res  = await fetch(`${backendUrl}/api/models/upload`, { method: 'POST', body: formData });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setCopyStatus(`${data.filename} added (${data.sizeMB} MB)`);
      await fetchModels();
      setTimeout(() => setCopyStatus(''), 4000);
    } catch (err) { setError(`Upload failed: ${err.message}`); setCopyStatus(''); }
    finally { setIsCopying(false); }
  };

  const openModelsFolder = () => window.electronAPI?.openPath?.(modelsDir);

  const isActive = serverStatus === 'ready' || serverStatus === 'starting' || serverStatus === 'loading';
  const statusColors = { ready: '#4ade80', starting: '#fbbf24', loading: '#7aa2f7', offline: '#5e5e6e', error: '#f87171' };
  const sColor = statusColors[serverStatus] || '#5e5e6e';

  return (
    <div style={{ padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
      <input ref={fileInputRef} type="file" accept=".gguf" style={{ display: 'none' }} onChange={handleFileInputChange} />

      {/* Status row */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '10px 14px', borderRadius: 10,
        background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{
            width: 9, height: 9, borderRadius: '50%', background: sColor,
            flexShrink: 0,
            animation: (serverStatus === 'starting' || serverStatus === 'loading') ? 'mp-pulse 1.2s ease-in-out infinite' : 'none',
          }} />
          <div>
            <span style={{ fontSize: 13, fontWeight: 600, color: sColor }}>
              {{ ready:'Ready', starting:'Starting', loading:'Loading', offline:'Offline', error:'Error' }[serverStatus] || 'Offline'}
            </span>
            {activeModel && (
              <span style={{ marginLeft: 8, fontSize: 11, color: '#52546a' }}>{activeModel}</span>
            )}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {isActive && (
            <button onClick={handleStop} style={{
              display: 'flex', alignItems: 'center', gap: 5,
              padding: '5px 10px', borderRadius: 7, fontSize: 11, fontWeight: 600,
              background: 'rgba(248,113,113,0.1)', color: '#f87171',
              border: '1px solid rgba(248,113,113,0.2)', transition: 'all .15s',
            }}
            onMouseEnter={e => e.currentTarget.style.background = 'rgba(248,113,113,0.2)'}
            onMouseLeave={e => e.currentTarget.style.background = 'rgba(248,113,113,0.1)'}
            >
              <StopCircle size={11} /> Stop
            </button>
          )}
          <button onClick={fetchModels} style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: 28, height: 28, borderRadius: 7,
            background: 'transparent', color: '#52546a', border: 'none', transition: 'all .15s',
          }}
          onMouseEnter={e => { e.currentTarget.style.color = '#e2e4ea'; e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; }}
          onMouseLeave={e => { e.currentTarget.style.color = '#52546a'; e.currentTarget.style.background = 'transparent'; }}
          >
            <RefreshCw size={13} style={isLoading ? { animation: 'mp-spin .8s linear infinite' } : {}} />
          </button>
        </div>
      </div>

      {/* Runtime settings — with clear note about reload required */}
      <div style={{
        display: 'flex', flexDirection: 'column', gap: 10,
        padding: '12px 14px', borderRadius: 10,
        background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: '#7c6df0', textTransform: 'uppercase', letterSpacing: '.06em' }}>Launch settings</span>
          <span style={{ fontSize: 10, color: '#52546a' }}>applied on next Load</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 11, color: '#52546a', fontWeight: 500 }}>GPU layers</span>
            <input type="number" min={0} max={100} value={gpuLayers}
              onChange={e => setGpuLayers(Number(e.target.value) || 0)}
              style={{
                width: 64, height: 28, borderRadius: 7, textAlign: 'right',
                border: '1px solid rgba(255,255,255,0.07)', background: '#07070a',
                color: '#e4e4ea', fontSize: 12, padding: '0 10px', outline: 'none',
              }}
            />
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 11, color: '#52546a', fontWeight: 500 }}>Context</span>
            <select value={ctxSize} onChange={e => setCtxSize(Number(e.target.value))}
              style={{
                width: 90, height: 28, borderRadius: 7,
                border: '1px solid rgba(255,255,255,0.07)', background: '#07070a',
                color: '#e4e4ea', fontSize: 12, padding: '0 8px', outline: 'none',
              }}
            >
              {[2048, 4096, 8192, 16384, 32768].map(n => <option key={n} value={n}>{n.toLocaleString()}</option>)}
            </select>
          </label>
        </div>
        {activeModel && (
          <div style={{ fontSize: 10, color: '#52546a', display: 'flex', alignItems: 'center', gap: 5 }}>
            <Info size={9} />
            Reload <strong style={{ color: '#7c6df0' }}>{activeModel.replace('.gguf','')}</strong> to apply new settings
          </div>
        )}
      </div>

      {/* Error / copy status */}
      {(error || errorMessage) && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '8px 14px', borderRadius: 8, fontSize: 12,
          background: 'rgba(248,113,113,0.07)', border: '1px solid rgba(248,113,113,0.18)',
          color: '#f87171',
        }}>
          <AlertCircle size={12} style={{ flexShrink: 0 }} /> {error || errorMessage}
        </div>
      )}
      {copyStatus && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '8px 14px', borderRadius: 8, fontSize: 12,
          background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)',
          color: '#9898a6',
        }}>
          {isCopying ? <Loader2 size={11} style={{ animation: 'mp-spin .8s linear infinite' }} /> : <CheckCircle size={11} style={{ color: '#4ade80' }} />}
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{copyStatus}</span>
        </div>
      )}

      {/* Browse buttons */}
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={handleBrowse} disabled={isCopying} style={{
          flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
          height: 36, borderRadius: 9, fontSize: 12, fontWeight: 600,
          background: 'rgba(124,109,240,0.14)', color: '#c4b5fd',
          border: '1px solid rgba(124,109,240,0.2)', transition: 'all .15s',
          opacity: isCopying ? 0.5 : 1,
        }}
        onMouseEnter={e => { if (!isCopying) e.currentTarget.style.background = 'rgba(124,109,240,0.24)'; }}
        onMouseLeave={e => { if (!isCopying) e.currentTarget.style.background = 'rgba(124,109,240,0.14)'; }}
        >
          {isCopying ? <Loader2 size={13} style={{ animation: 'mp-spin .8s linear infinite' }} /> : <FolderPlus size={13} />}
          Browse GGUF
        </button>
        {modelsDir && (
          <button onClick={openModelsFolder} title="Open models folder" style={{
            width: 36, height: 36, borderRadius: 9,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'rgba(255,255,255,0.04)', color: '#52546a',
            border: '1px solid rgba(255,255,255,0.07)', transition: 'all .15s',
          }}
          onMouseEnter={e => { e.currentTarget.style.color = '#e2e4ea'; e.currentTarget.style.background = 'rgba(255,255,255,0.08)'; }}
          onMouseLeave={e => { e.currentTarget.style.color = '#52546a'; e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; }}
          >
            <FolderOpen size={13} />
          </button>
        )}
      </div>

      {/* Models list */}
      <div>
        <div style={{ marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
          <HardDrive size={11} style={{ color: '#7c6df0' }} />
          <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: '#52546a' }}>
            Local GGUF Models ({modelList.length})
          </span>
        </div>
        {modelList.length === 0 ? (
          <div style={{ padding: '28px 0', textAlign: 'center' }}>
            <HardDrive size={24} style={{ margin: '0 auto 10px', color: '#52546a', opacity: 0.4 }} />
            <div style={{ fontSize: 12, color: '#52546a' }}>No GGUF models found</div>
            <div style={{ marginTop: 4, fontSize: 11, color: '#3a3c4e' }}>Place .gguf files in the models folder</div>
            {modelsDir && <div style={{ marginTop: 12, fontSize: 9, color: '#3a3c4e', wordBreak: 'break-all' }}>{modelsDir}</div>}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {modelList.map((model) => {
              const loading = loadingModel === model.filename;
              const active  = activeModel === model.filename;
              const canLoad = serverStatus !== 'starting' && serverStatus !== 'loading';
              const meta    = parseModelMeta(model);
              return (
                <div key={model.filename} style={{
                  borderRadius: 10, overflow: 'hidden', transition: 'all .12s',
                  background: active ? 'rgba(74,222,128,0.04)' : 'rgba(255,255,255,0.02)',
                  border: active ? '1px solid rgba(74,222,128,0.15)' : loading ? '1px solid rgba(124,109,240,0.25)' : '1px solid rgba(255,255,255,0.05)',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px' }}>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        {active && <CheckCircle size={12} style={{ color: '#4ade80', flexShrink: 0 }} />}
                        <span style={{ fontSize: 12, fontWeight: 550, color: '#e4e4ea', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {meta.title}
                        </span>
                      </div>
                      <div style={{ marginTop: 5, display: 'flex', alignItems: 'center', gap: 6 }}>
                        {meta.quant && <span style={{ padding: '1px 6px', borderRadius: 4, fontSize: 10, fontWeight: 600, background: 'rgba(255,255,255,0.04)', color: '#5e5e6e', border: '1px solid rgba(255,255,255,0.05)' }}>{meta.quant}</span>}
                        {meta.mmproj
                          ? <span style={{ padding: '1px 6px', borderRadius: 4, fontSize: 10, fontWeight: 600, background: 'rgba(124,109,240,0.1)', color: '#a898d0', border: '1px solid rgba(124,109,240,0.15)' }}>Vision</span>
                          : <span style={{ padding: '1px 6px', borderRadius: 4, fontSize: 10, fontWeight: 600, background: 'rgba(74,222,128,0.06)', color: '#4ade80', border: '1px solid rgba(74,222,128,0.1)' }}>Text</span>
                        }
                        <span style={{ fontSize: 10, color: '#52546a' }}>{formatModelSize(model.sizeMB)}</span>
                      </div>
                    </div>
                    <button onClick={() => handleLoad(model)} disabled={loading || !canLoad || active} style={{
                      display: 'flex', alignItems: 'center', gap: 5,
                      height: 30, padding: '0 12px', borderRadius: 7,
                      fontSize: 11, fontWeight: 600, border: 'none',
                      background: active ? 'rgba(74,222,128,0.12)' : 'rgba(124,109,240,0.14)',
                      color: active ? '#4ade80' : '#c4b5fd',
                      opacity: (!canLoad || active) && !loading ? 0.4 : 1,
                      cursor: (!canLoad || active) && !loading ? 'not-allowed' : 'pointer',
                      transition: 'all .15s',
                    }}>
                      {loading ? <><Loader2 size={10} style={{ animation: 'mp-spin .8s linear infinite' }} /> Loading</>
                        : active ? 'Active'
                        : <><Play size={10} fill="currentColor" /> Load</>}
                    </button>
                  </div>
                  {/* Real-time progress bar — only shown while this model is loading */}
                  {loading && <ModelLoadProgress />}
                </div>
              );
            })}
          </div>
        )}
        {modelsDir && <div style={{ marginTop: 10, fontSize: 9, color: '#3a3c4e', wordBreak: 'break-all' }}>{modelsDir}</div>}
      </div>

      {/* Provider models — separate section */}
      <ProviderModelsSection backendUrl={backendUrl} />

      <style>{`
        @keyframes mp-spin { to { transform: rotate(360deg); } }
        @keyframes mp-pulse { 0%,100% { opacity:1; } 50% { opacity:.4; } }
        @keyframes mp-bar-shimmer { 0% { transform: translateX(-100%); } 100% { transform: translateX(300%); } }
      `}</style>
    </div>
  );
}

/* ── Provider Models Section ── */
function ProviderModelsSection({ backendUrl }) {
  const {
    providers, activeProviderId, activeModel: activeProvModel, loading,
    fetchProviders, fetchModels,
  } = useProviderStore();
  const selectProviderModel = useModelStore((s) => s.selectProviderModel);
  const clearProviderModel  = useModelStore((s) => s.clearProviderModel);

  const [refreshingId, setRefreshingId] = useState(null);
  const [selectingKey, setSelectingKey] = useState(null);
  const [managerOpen, setManagerOpen]   = useState(false);

  useEffect(() => { fetchProviders(backendUrl); }, [backendUrl, fetchProviders]);

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
  };

  const handleDisconnect = async () => {
    setSelectingKey('disconnect');
    await clearProviderModel(backendUrl);
    await fetchProviders(backendUrl);
    setSelectingKey(null);
  };

  const totalModels = providers.reduce((s, p) => s + (p.models?.length || 0), 0);

  return (
    <div style={{ marginTop: 4 }}>
      {/* Header */}
      <div style={{
        marginBottom: 8, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Globe size={11} style={{ color: '#22d3ee' }} />
          <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: '#52546a' }}>
            Provider Models {totalModels > 0 && `(${totalModels})`}
          </span>
        </div>
        <button onClick={() => setManagerOpen(true)} style={{
          display: 'inline-flex', alignItems: 'center', gap: 5,
          padding: '4px 10px', borderRadius: 6, fontSize: 10.5, fontWeight: 600,
          background: 'rgba(6,182,212,0.08)', color: '#22d3ee',
          border: '1px solid rgba(6,182,212,0.15)', cursor: 'pointer', transition: 'all .12s',
        }}
        onMouseEnter={e => e.currentTarget.style.background = 'rgba(6,182,212,0.18)'}
        onMouseLeave={e => e.currentTarget.style.background = 'rgba(6,182,212,0.08)'}
        >
          <Plus size={11} /> Manage Providers
        </button>
      </div>

      {/* Active banner */}
      {activeProviderId && activeProvModel && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10,
          padding: '8px 12px', borderRadius: 9,
          background: 'rgba(6,182,212,0.06)',
          border: '1px solid rgba(6,182,212,0.16)',
          fontSize: 11.5,
        }}>
          <CheckCircle size={12} style={{ color: '#22d3ee', flexShrink: 0 }} />
          <span style={{ color: '#5e6370' }}>Connected to</span>
          <strong style={{ color: '#22d3ee' }}>
            {providers.find((p) => p.id === activeProviderId)?.name || 'Provider'}
          </strong>
          <span style={{ color: '#6b7280', fontFamily: 'var(--font-mono)', fontSize: 10.5,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, minWidth: 0 }}>
            {activeProvModel}
          </span>
          <button onClick={handleDisconnect} disabled={selectingKey === 'disconnect'} style={{
            display: 'inline-flex', alignItems: 'center', gap: 4, flexShrink: 0,
            padding: '3px 8px', borderRadius: 5, fontSize: 10, fontWeight: 600,
            background: 'rgba(248,113,113,0.08)', color: '#f87171',
            border: '1px solid rgba(248,113,113,0.14)', cursor: 'pointer',
          }}>
            {selectingKey === 'disconnect' ? <Loader2 size={10} style={{ animation: 'mp-spin .8s linear infinite' }} /> : <X size={10} />}
            Disconnect
          </button>
        </div>
      )}

      {/* Empty state */}
      {!loading && providers.length === 0 && (
        <div style={{
          padding: '20px 14px', textAlign: 'center',
          border: '1px dashed rgba(255,255,255,0.08)', borderRadius: 10,
        }}>
          <Globe size={20} style={{ margin: '0 auto 6px', color: '#3a3c4e' }} />
          <div style={{ fontSize: 11.5, color: '#5e6370', marginBottom: 4 }}>
            No providers configured
          </div>
          <div style={{ fontSize: 10.5, color: '#3a3c4e', maxWidth: 320, margin: '0 auto 10px' }}>
            Connect to LM Studio, Ollama, OpenAI, Anthropic, and more to use API or remote models.
          </div>
          <button onClick={() => setManagerOpen(true)} style={{
            display: 'inline-flex', alignItems: 'center', gap: 5,
            padding: '5px 12px', borderRadius: 7, fontSize: 11, fontWeight: 600,
            background: 'rgba(6,182,212,0.1)', color: '#22d3ee',
            border: '1px solid rgba(6,182,212,0.2)', cursor: 'pointer',
          }}>
            <Plus size={11} /> Add Provider
          </button>
        </div>
      )}

      {/* Provider cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {providers.map((p) => {
          const meta = PROVIDER_TYPE_META[p.type] || PROVIDER_TYPE_META['openai-compat'];
          const Icon = meta.icon;
          const isActiveProv = p.id === activeProviderId;
          const refreshing = refreshingId === p.id;

          return (
            <div key={p.id} style={{
              borderRadius: 10, overflow: 'hidden',
              border: isActiveProv ? '1px solid rgba(6,182,212,0.22)' : '1px solid rgba(255,255,255,0.05)',
              background: isActiveProv ? 'rgba(6,182,212,0.02)' : 'rgba(255,255,255,0.012)',
            }}>
              {/* Provider header */}
              <div style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '7px 12px',
                borderBottom: '1px solid rgba(255,255,255,0.04)',
                background: 'rgba(0,0,0,0.18)',
              }}>
                <div style={{
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  width: 22, height: 22, borderRadius: 6,
                  color: meta.color, background: `${meta.color}14`,
                }}>
                  <Icon size={11} />
                </div>
                <span style={{ fontSize: 11.5, fontWeight: 650, color: isActiveProv ? '#22d3ee' : '#c8cad4' }}>
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
                  {p.models?.length || 0} model{(p.models?.length || 0) === 1 ? '' : 's'}
                </span>
                <button onClick={() => handleRefresh(p.id)} disabled={refreshing} style={{
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                  padding: '3px 7px', borderRadius: 5, fontSize: 9.5, fontWeight: 600,
                  background: 'rgba(6,182,212,0.06)', color: '#22d3ee',
                  border: '1px solid rgba(6,182,212,0.12)', cursor: 'pointer',
                }}>
                  {refreshing
                    ? <Loader2 size={9} style={{ animation: 'mp-spin .8s linear infinite' }} />
                    : <RefreshCw size={9} />}
                  Refresh
                </button>
              </div>

              {/* Models */}
              {(!p.models || p.models.length === 0) ? (
                <div style={{
                  padding: '12px 14px', fontSize: 11, color: '#5e6370', textAlign: 'center',
                }}>
                  Click <strong style={{ color: '#22d3ee' }}>Refresh</strong> to fetch models.
                </div>
              ) : (
                <div style={{ maxHeight: 240, overflowY: 'auto' }}>
                  {p.models.map((m) => {
                    const key = `${p.id}:${m.id}`;
                    const isSel = isActiveProv && activeProvModel === m.id;
                    const isSelecting = selectingKey === key;
                    return (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => handleSelect(p.id, m.id)}
                        disabled={isSelecting}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 9, width: '100%',
                          padding: '7px 14px',
                          cursor: isSelecting ? 'wait' : 'pointer',
                          background: isSel ? 'rgba(6,182,212,0.04)' : 'transparent',
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
                          fontSize: 11.5, color: isSel ? '#22d3ee' : '#a0a2ae',
                          fontWeight: isSel ? 600 : 400, flex: 1, minWidth: 0,
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        }}>
                          {m.name}
                        </span>
                        {m.meta && (
                          <span style={{
                            fontSize: 9.5, color: '#5e6370', fontFamily: 'var(--font-mono)',
                            padding: '1px 5px', borderRadius: 3, background: 'rgba(255,255,255,0.03)',
                          }}>
                            {m.meta}
                          </span>
                        )}
                        {m.ownedBy && (
                          <span style={{ fontSize: 9, color: '#5e6370', textTransform: 'lowercase' }}>
                            {m.ownedBy}
                          </span>
                        )}
                        {isSel && (
                          <span style={{ fontSize: 9.5, color: '#4ade80', fontWeight: 600 }}>Active</span>
                        )}
                        {isSelecting && !isSel && (
                          <Loader2 size={9} style={{ animation: 'mp-spin .8s linear infinite', color: '#22d3ee' }} />
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <ProviderManagerModal
        open={managerOpen}
        onClose={() => { setManagerOpen(false); fetchProviders(backendUrl); }}
        backendUrl={backendUrl}
      />
    </div>
  );
}

/* ── Settings Content ── */
function SettingsContent({ backendUrl }) {
  const {
    gpuLayers, ctxSize, threads, batchSize, flashAttn, mlock,
    setGpuLayers, setCtxSize, setThreads, setBatchSize, setFlashAttn, setMlock,
    activeModel, llamaStats, appliedSettings, isReloading,
    reloadModel, fetchAppliedSettings, serverStatus,
  } = useModelStore();
  const [saved, setSaved] = useState(false);

  useEffect(() => { fetchAppliedSettings(backendUrl); }, [backendUrl, fetchAppliedSettings]);

  const reloading = isReloading;
  const controlsDisabled = reloading || serverStatus === 'starting' || serverStatus === 'loading';

  // Compute dirty state: pending differs from applied
  const isDirty = appliedSettings && (
    appliedSettings.gpuLayers !== gpuLayers ||
    appliedSettings.ctxSize !== ctxSize ||
    appliedSettings.threads !== threads ||
    appliedSettings.batchSize !== batchSize ||
    appliedSettings.flashAttn !== flashAttn ||
    appliedSettings.mlock !== mlock
  );

  // Currently-applied values (from backend)
  const appliedCtx = appliedSettings?.ctxSize;
  const appliedGpu = appliedSettings?.gpuLayers;
  const appliedThreads = appliedSettings?.threads;
  const appliedBatch = appliedSettings?.batchSize;
  const appliedFlash = appliedSettings?.flashAttn;
  const appliedMlock = appliedSettings?.mlock;
  const hasModel = !!activeModel;

  const canReload = hasModel && !!isDirty && !reloading && serverStatus === 'ready';

  const row = (label, desc, control) => (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
      <div>
        <div style={{ fontSize: 13, color: '#c8cad4', fontWeight: 500 }}>{label}</div>
        {desc && <div style={{ fontSize: 10, color: '#52546a', marginTop: 2 }}>{desc}</div>}
      </div>
      {control}
    </div>
  );

  const inputStyle = {
    height: 30, borderRadius: 7, border: '1px solid rgba(255,255,255,0.07)',
    background: '#07070a', color: '#e4e4ea', fontSize: 12, padding: '0 10px', outline: 'none',
  };

  const handleChange = (fn) => (e) => {
    fn(e.target.value);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div style={{ padding: '18px 20px' }}>

      {/* Applied values banner */}
      <div style={{
        marginBottom: 16, padding: '10px 14px', borderRadius: 9,
        background: 'rgba(124,109,240,0.07)', border: '1px solid rgba(124,109,240,0.14)',
        display: 'flex', gap: 16, alignItems: 'center',
      }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: '#7c6df0', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 4 }}>
            {hasModel ? 'Currently applied' : 'Runtime status'}
          </div>
          {hasModel && appliedSettings ? (
            <div style={{ display: 'flex', gap: 16, fontSize: 11, color: '#9898a6', flexWrap: 'wrap' }}>
              <span>ctx: <strong style={{ color: '#c4b5fd' }}>{appliedCtx?.toLocaleString()}</strong></span>
              <span>gpu: <strong style={{ color: '#c4b5fd' }}>{appliedGpu}</strong> layers</span>
              {appliedThreads > 0 && <span>threads: <strong style={{ color: '#c4b5fd' }}>{appliedThreads}</strong></span>}
              {appliedFlash && <span style={{ color: '#7c6df0', fontSize: 10 }}>flash-attn</span>}
              {appliedMlock && <span style={{ color: '#7c6df0', fontSize: 10 }}>mlock</span>}
            </div>
          ) : (
            <span style={{ fontSize: 11, color: '#52546a' }}>{hasModel ? 'Waiting for backend-applied runtime settings' : 'No model loaded'}</span>
          )}
          {/* Restart required badge */}
          {hasModel && isDirty && (
            <span style={{
              marginLeft: 10, padding: '1px 8px', borderRadius: 5, fontSize: 10, fontWeight: 700,
              background: 'rgba(251,191,36,0.12)', color: '#fbbf24',
              border: '1px solid rgba(251,191,36,0.2)',
            }}>
              Restart required
            </span>
          )}
        </div>
        {saved && <span style={{ fontSize: 10, color: '#4ade80', fontWeight: 600 }}>✓ Saved</span>}
      </div>

      {hasModel && (
        <div style={{ marginBottom: 16, display: 'grid', gap: 5, fontSize: 10 }}>
          <RuntimeLine label="Applied" tone="applied" value={appliedSettings ? formatRuntimeSettings(appliedSettings) : 'Not verified by backend'} />
          <RuntimeLine label="Pending" tone={isDirty ? 'pending' : 'muted'} value={formatRuntimeSettings({ gpuLayers, ctxSize, threads, batchSize, flashAttn, mlock })} />
        </div>
      )}

      {/* Apply & Reload button */}
      {hasModel && (
        <div style={{
          marginBottom: 16, padding: '10px 14px', borderRadius: 9,
          background: isDirty ? 'rgba(251,191,36,0.05)' : 'transparent',
          border: isDirty ? '1px solid rgba(251,191,36,0.12)' : '1px solid transparent',
          display: 'flex', alignItems: 'center', gap: 12,
        }}>
          <button
            onClick={() => reloadModel(backendUrl)}
            disabled={!canReload}
            style={{
              display: 'flex', alignItems: 'center', gap: 7, flexShrink: 0,
              height: 34, padding: '0 16px', borderRadius: 8, fontSize: 12, fontWeight: 600,
              background: canReload ? 'rgba(124,109,240,0.14)' : 'rgba(255,255,255,0.04)',
              color: canReload ? '#c4b5fd' : '#52546a',
              border: canReload ? '1px solid rgba(124,109,240,0.2)' : '1px solid rgba(255,255,255,0.06)',
              cursor: canReload ? 'pointer' : 'not-allowed',
              transition: 'all .15s',
            }}
            onMouseEnter={e => { if (canReload) { e.currentTarget.style.background = 'rgba(124,109,240,0.24)'; }}}
            onMouseLeave={e => { if (canReload) { e.currentTarget.style.background = 'rgba(124,109,240,0.14)'; }}}
          >
            {reloading ? (
              <><Loader2 size={11} style={{ animation: 'mp-spin .8s linear infinite' }} /> Reloading...</>
            ) : (
              <><RefreshCw size={11} /> Apply & Reload Runtime</>
            )}
          </button>
          {isDirty && !reloading && (
            <span style={{ fontSize: 10, color: '#fbbf24' }}>
              Settings changed — restart runtime to apply
            </span>
          )}
        </div>
      )}

      <div style={{ marginBottom: 14, fontSize: 10, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: '#52546a' }}>
        Runtime Settings
      </div>
      {row('GPU Layers', 'Layers to offload to GPU (0 = CPU only)', (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <input type="number" min={0} max={100} value={gpuLayers} disabled={controlsDisabled}
            onChange={handleChange((v) => setGpuLayers(Number(v) || 0))}
            style={{ ...inputStyle, width: 64, textAlign: 'right' }}
          />
          {appliedSettings && appliedGpu !== gpuLayers && (
            <span style={{ fontSize: 9, color: '#52546a' }}>(now: {appliedGpu})</span>
          )}
        </div>
      ))}
      {row('Context Size', 'Max tokens per conversation window', (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <select value={ctxSize} disabled={controlsDisabled} onChange={handleChange((v) => setCtxSize(Number(v)))}
            style={{ ...inputStyle, width: 110 }}
          >
            {[2048, 4096, 8192, 16384, 32768].map(n => (
              <option key={n} value={n}>{n.toLocaleString()} tokens</option>
            ))}
          </select>
          {appliedSettings && appliedCtx !== ctxSize && (
            <span style={{ fontSize: 9, color: '#52546a' }}>(now: {appliedCtx?.toLocaleString()})</span>
          )}
        </div>
      ))}
      {row('Threads', 'CPU threads (0 = auto)', (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <input type="number" min={0} max={64} value={threads} disabled={controlsDisabled}
            onChange={handleChange((v) => setThreads(Number(v)))}
            style={{ ...inputStyle, width: 64, textAlign: 'right' }}
          />
          {appliedSettings && appliedThreads !== threads && (
            <span style={{ fontSize: 9, color: '#52546a' }}>(now: {appliedThreads})</span>
          )}
        </div>
      ))}
      {row('Batch Size', 'Prompt processing batch size', (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <select value={batchSize} disabled={controlsDisabled} onChange={handleChange((v) => setBatchSize(Number(v)))}
            style={{ ...inputStyle, width: 100 }}
          >
            {[128, 256, 512, 1024, 2048].map(n => <option key={n} value={n}>{n}</option>)}
          </select>
          {appliedSettings && appliedBatch !== batchSize && (
            <span style={{ fontSize: 9, color: '#52546a' }}>(now: {appliedBatch})</span>
          )}
        </div>
      ))}
      {row('Flash Attention', 'Reduces memory usage (requires model support)', (
        <ToggleSwitch value={flashAttn} onChange={setFlashAttn} disabled={controlsDisabled} />
      ))}
      {row('MLock', 'Lock model in RAM — prevents swapping', (
        <ToggleSwitch value={mlock} onChange={setMlock} disabled={controlsDisabled} />
      ))}

      <div style={{ marginTop: 22, marginBottom: 14, fontSize: 10, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: '#52546a' }}>
        Backend
      </div>
      {row('Endpoint', 'JARVIS backend server URL', <span style={{ fontSize: 11, color: '#52546a', fontFamily: 'monospace' }}>{backendUrl}</span>)}
      {row('llama.cpp', 'Local inference server', <span style={{ fontSize: 11, color: '#52546a', fontFamily: 'monospace' }}>localhost:6969</span>)}

      <div style={{ marginTop: 22, padding: '12px 14px', borderRadius: 10, background: 'rgba(124,109,240,0.06)', border: '1px solid rgba(124,109,240,0.12)' }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: '#c4b5fd', marginBottom: 4 }}>JARVIS — Local AI IDE</div>
        <div style={{ fontSize: 10, color: '#52546a' }}>Powered by llama.cpp · Gemma GGUF runtime</div>
        <div style={{ marginTop: 6, fontSize: 9, color: '#3a3c4e' }}>Public API: {backendUrl}/v1/chat/completions</div>
      </div>
    </div>
  );
}

/* ── Logs Content ── */
function LogsContent({ backendUrl }) {
  const [logs, setLogs]       = useState([]);
  const [args, setArgs]       = useState(null);
  const [status, setStatus]   = useState('');
  const [model, setModel]     = useState('');
  const [autoScroll, setAutoScroll] = useState(true);
  const [filter, setFilter]   = useState('');
  const bottomRef = useRef(null);
  const sinceRef  = useRef(0);

  const fetchLogs = useCallback(async () => {
    try {
      const url = sinceRef.current
        ? `${backendUrl}/api/models/logs?since=${sinceRef.current}`
        : `${backendUrl}/api/models/logs?limit=200`;
      const res  = await fetch(url);
      const data = await res.json();
      if (data.logs?.length) {
        setLogs((prev) => {
          const merged = [...prev, ...data.logs];
          // Update since to latest ts
          sinceRef.current = data.logs[data.logs.length - 1].ts;
          return merged.slice(-500);
        });
      }
      if (data.args) setArgs(data.args);
      if (data.status) setStatus(data.status);
      if (data.model)  setModel(data.model);
    } catch {}
  }, [backendUrl]);

  // Initial load + poll every 1.5s
  useEffect(() => {
    sinceRef.current = 0;
    setLogs([]);
    fetchLogs();
    const id = setInterval(fetchLogs, 1500);
    return () => clearInterval(id);
  }, [fetchLogs]);

  // Auto-scroll
  useEffect(() => {
    if (autoScroll) bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [logs.length, autoScroll]);

  const visibleLogs = filter
    ? logs.filter((l) => l.text.toLowerCase().includes(filter.toLowerCase()))
    : logs;

  const levelColor = (level) => level === 'error' ? '#f87171' : '#9898a6';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>

      {/* Toolbar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '8px 14px', borderBottom: '1px solid rgba(255,255,255,0.05)',
        flexShrink: 0,
      }}>
        {/* Status badge */}
        <span style={{
          padding: '2px 8px', borderRadius: 5, fontSize: 10, fontWeight: 700,
          background: status === 'running' ? 'rgba(74,222,128,0.1)' : 'rgba(255,255,255,0.05)',
          color: status === 'running' ? '#4ade80' : '#52546a',
          border: status === 'running' ? '1px solid rgba(74,222,128,0.2)' : '1px solid rgba(255,255,255,0.05)',
          textTransform: 'uppercase', letterSpacing: '.06em',
        }}>
          {status || 'idle'}
        </span>
        {model && <span style={{ fontSize: 10, color: '#52546a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{model}</span>}
        <div style={{ flex: 1 }} />
        {/* Filter input */}
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter..."
          style={{
            height: 24, borderRadius: 6, fontSize: 10,
            border: '1px solid rgba(255,255,255,0.07)', background: '#07070a',
            color: '#e4e4ea', padding: '0 8px', outline: 'none', width: 90,
          }}
        />
        <button
          onClick={() => setAutoScroll((v) => !v)}
          title={autoScroll ? 'Pause auto-scroll' : 'Resume auto-scroll'}
          style={{
            fontSize: 10, padding: '2px 8px', borderRadius: 5,
            background: autoScroll ? 'rgba(124,109,240,0.14)' : 'rgba(255,255,255,0.05)',
            color: autoScroll ? '#c4b5fd' : '#52546a',
            border: autoScroll ? '1px solid rgba(124,109,240,0.2)' : '1px solid rgba(255,255,255,0.06)',
          }}
        >
          {autoScroll ? 'Auto ↓' : 'Paused'}
        </button>
        <button onClick={() => { setLogs([]); sinceRef.current = 0; fetchLogs(); }} style={{
          fontSize: 10, padding: '2px 8px', borderRadius: 5,
          background: 'rgba(255,255,255,0.04)', color: '#52546a',
          border: '1px solid rgba(255,255,255,0.06)',
        }}>Clear</button>
      </div>

      {/* Launch args */}
      {args && (
        <details style={{ padding: '6px 14px', borderBottom: '1px solid rgba(255,255,255,0.04)', flexShrink: 0 }}>
          <summary style={{ fontSize: 10, color: '#52546a', cursor: 'pointer', userSelect: 'none' }}>
            Launch args ({args.length})
          </summary>
          <pre style={{
            marginTop: 6, padding: '6px 8px', borderRadius: 6,
            background: '#07070a', fontSize: 9.5, color: '#7c6df0',
            whiteSpace: 'pre-wrap', wordBreak: 'break-all',
            fontFamily: 'monospace', lineHeight: 1.6,
          }}>
            {args.join(' ')}
          </pre>
        </details>
      )}

      {/* Log lines */}
      <div style={{
        flex: 1, overflowY: 'auto', padding: '8px 14px',
        fontFamily: 'monospace', fontSize: 10.5, lineHeight: 1.7,
        scrollbarWidth: 'thin', scrollbarColor: 'rgba(255,255,255,0.06) transparent',
      }}>
        {visibleLogs.length === 0 ? (
          <div style={{ padding: '40px 0', textAlign: 'center', color: '#52546a', fontSize: 11 }}>
            <Terminal size={22} style={{ margin: '0 auto 10px', opacity: 0.4 }} />
            <div>No logs yet — load a model to see llama.cpp output</div>
          </div>
        ) : (
          visibleLogs.map((log, i) => (
            <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'baseline' }}>
              <span style={{ color: '#3a3c4e', fontSize: 9, flexShrink: 0, minWidth: 48, textAlign: 'right' }}>
                {new Date(log.ts).toLocaleTimeString('en', { hour12: false, hour:'2-digit', minute:'2-digit', second:'2-digit' })}
              </span>
              <span style={{ color: levelColor(log.level), whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                {log.text}
              </span>
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}

/* helpers */
function parseModelMeta(model) {
  const raw   = model.name || model.filename?.replace(/\.gguf$/i, '') || 'Model';
  const quant = raw.match(/(?:^|[-_])((?:IQ|Q)\d(?:_[A-Z0-9]+)*)$/i)?.[1]?.toUpperCase() || '';
  const title = quant ? raw.replace(new RegExp(`[-_]${quant}$`, 'i'), '') : raw;
  const lower = raw.toLowerCase();
  return { title, quant, mmproj: lower.includes('mmproj') || lower.includes('vision') || lower.includes('vl') };
}
function formatModelSize(sizeMB) {
  if (!Number.isFinite(sizeMB)) return 'Unknown';
  return sizeMB >= 1024 ? `${(sizeMB / 1024).toFixed(1)} GB` : `${sizeMB} MB`;
}

/* ── Model Load Progress Bar ── */
function ModelLoadProgress() {
  const loadProgress = useModelStore((s) => s.loadProgress);
  const loadPercent  = useModelStore((s) => s.loadPercent) || 0;
  const serverStatus = useModelStore((s) => s.serverStatus);

  // Determine bar color and whether to show shimmer (indeterminate) vs filled
  const hasRealPct = loadPercent > 0;
  const barColor = serverStatus === 'error' ? '#f87171' : '#7c6df0';
  const glowColor = serverStatus === 'error' ? 'rgba(248,113,113,0.4)' : 'rgba(124,109,240,0.5)';

  return (
    <div style={{
      padding: '8px 14px 10px',
      borderTop: '1px solid rgba(255,255,255,0.04)',
      background: 'rgba(124,109,240,0.03)',
    }}>
      {/* Stage label + percentage */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 6,
      }}>
        <span style={{
          fontSize: 10.5, color: '#8b8d99', fontWeight: 500,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          maxWidth: '80%',
        }}>
          {loadProgress || 'Loading...'}
        </span>
        {hasRealPct && (
          <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: barColor, fontWeight: 700, flexShrink: 0 }}>
            {loadPercent}%
          </span>
        )}
      </div>

      {/* Progress bar track */}
      <div style={{
        height: 4, borderRadius: 999,
        background: 'rgba(255,255,255,0.06)',
        overflow: 'hidden',
        position: 'relative',
      }}>
        {hasRealPct ? (
          /* Determinate fill */
          <div style={{
            height: '100%',
            width: `${loadPercent}%`,
            borderRadius: 999,
            background: `linear-gradient(90deg, ${barColor}, ${barColor}cc)`,
            boxShadow: `0 0 8px ${glowColor}`,
            transition: 'width 0.4s ease-out',
          }} />
        ) : (
          /* Indeterminate shimmer */
          <div style={{
            position: 'absolute', inset: 0,
            background: `linear-gradient(90deg, transparent 0%, ${barColor} 40%, ${barColor}cc 60%, transparent 100%)`,
            animation: 'mp-bar-shimmer 1.4s ease-in-out infinite',
          }} />
        )}
      </div>
    </div>
  );
}

function RuntimeLine({ label, value, tone }) {
  const color = tone === 'applied' ? '#4ade80' : tone === 'pending' ? '#fbbf24' : '#5e5e6e';
  return (
    <div style={{ display: 'flex', gap: 8, minWidth: 0 }}>
      <span style={{ width: 54, color, fontWeight: 700 }}>{label}</span>
      <span style={{ color: tone === 'pending' ? '#d8c885' : '#77778a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value}</span>
    </div>
  );
}

function formatRuntimeSettings(settings) {
  return [
    `ctx ${settings.ctxSize}`,
    `gpu ${settings.gpuLayers}`,
    `threads ${settings.threads}`,
    `batch ${settings.batchSize}`,
    `flash ${settings.flashAttn ? 'on' : 'off'}`,
    `mlock ${settings.mlock ? 'on' : 'off'}`,
  ].join(' · ');
}

function ToggleSwitch({ value, onChange, disabled = false }) {
  return (
    <div
      onClick={() => { if (!disabled) onChange(!value); }}
      style={{
        width: 34, height: 18, borderRadius: 12, flexShrink: 0, cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.55 : 1,
        background: value ? 'rgba(130,100,220,0.5)' : 'rgba(255,255,255,0.08)',
        position: 'relative', transition: 'background .15s',
      }}
    >
      <div style={{
        width: 14, height: 14, borderRadius: '50%',
        background: value ? '#c4b5fd' : '#5e5e6e',
        position: 'absolute', top: 2, left: value ? 18 : 2,
        transition: 'left .15s, background .15s',
      }} />
    </div>
  );
}
