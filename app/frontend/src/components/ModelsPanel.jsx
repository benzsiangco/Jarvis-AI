import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertCircle, CheckCircle, Cpu, FolderOpen, FolderPlus, HardDrive,
  Loader2, RefreshCw, Play, StopCircle,
} from 'lucide-react';
import useModelStore from '../stores/modelStore';

const C = {
  bg: { background: '#0c0c12' },
  header: { padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.04)' },
  row: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' },
  label: { fontSize: '11px', color: '#5e5e6e', fontWeight: 500, userSelect: 'none' as const },
  input: { height: 30, borderRadius: 8, border: '1px solid rgba(255,255,255,0.06)', background: '#07070a', color: '#e4e4ea', fontSize: '12px', outline: 'none', transition: 'border-color .15s' },
  btn: { height: 32, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontSize: '11px', fontWeight: 600, cursor: 'pointer', transition: 'all .15s', border: 'none' },
  tag: { display: 'inline-flex', padding: '2px 8px', borderRadius: 4, fontSize: '10px', fontWeight: 600 },
};

export default function ModelsPanel({ backendUrl }) {
  const {
    activeModel, serverStatus, setActiveModel, setServerStatus, gpuLayers, ctxSize,
    setGpuLayers, setCtxSize, threads, setThreads, batchSize, setBatchSize,
    flashAttn, setFlashAttn, mlock, setMlock, appliedSettings, isReloading,
    reloadModel, loadModel, fetchAppliedSettings, loadProgress,
  } = useModelStore();
  const [modelList, setModelList] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isCopying, setIsCopying] = useState(false);
  const [loadingModel, setLoadingModel] = useState(null);
  const [modelsDir, setModelsDir] = useState('');
  const [error, setError] = useState('');
  const [copyStatus, setCopyStatus] = useState('');
  const fileInputRef = useRef(null);

  const backendConnected = useModelStore((s) => s.backendConnected);

  const fetchModels = useCallback(async () => {
    if (!backendConnected) { setModelList([]); return; }
    setIsLoading(true); setError('');
    try {
      const res = await fetch(`${backendUrl}/api/models`);
      const data = await res.json();
      setModelList(data.models || []); setModelsDir(data.modelsDir || '');
      if (data.currentModel) setActiveModel(data.currentModel);
      setServerStatus(data.serverStatus || 'stopped');
    } catch { setError('Cannot reach backend'); }
    finally { setIsLoading(false); }
  }, [backendConnected, backendUrl, setActiveModel, setServerStatus]);

  useEffect(() => {
    fetchModels();
    fetchAppliedSettings(backendUrl);
    const i = setInterval(fetchModels, 5000);
    return () => clearInterval(i);
  }, [backendUrl, fetchAppliedSettings, fetchModels]);

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
    setError(''); setServerStatus('offline'); setActiveModel(null);
    fetch(`${backendUrl}/api/models/stop`, { method: 'POST' }).catch(() => {});
    setTimeout(() => fetchModels(), 1000);
  };

  const handleBrowse = async () => {
    if (window.electronAPI?.pickModel) {
      const srcPath = await window.electronAPI.pickModel();
      if (!srcPath) return;
      const filename = srcPath.split(/[/\\]/).pop();
      setIsCopying(true); setCopyStatus(`Copying ${filename}...`); setError('');
      try {
        await window.electronAPI.copyModel(srcPath);
        setCopyStatus(`${filename} added`); await fetchModels();
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
      const res = await fetch(`${backendUrl}/api/models/upload`, { method: 'POST', body: formData });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setCopyStatus(`${data.filename} added (${data.sizeMB} MB)`); await fetchModels();
      setTimeout(() => setCopyStatus(''), 4000);
    } catch (err) { setError(`Upload failed: ${err.message}`); setCopyStatus(''); }
    finally { setIsCopying(false); }
  };

  const openModelsFolder = () => window.electronAPI?.openPath?.(modelsDir);
  const isActive = serverStatus === 'ready' || serverStatus === 'starting' || serverStatus === 'loading';
  const controlsDisabled = isReloading || serverStatus === 'starting' || serverStatus === 'loading';
  const isDirty = appliedSettings && (
    appliedSettings.gpuLayers !== gpuLayers ||
    appliedSettings.ctxSize !== ctxSize ||
    appliedSettings.threads !== threads ||
    appliedSettings.batchSize !== batchSize ||
    appliedSettings.flashAttn !== flashAttn ||
    appliedSettings.mlock !== mlock
  );
  const canReload = isActive && !isReloading && activeModel;
  const statusColors = { ready: '#4ade80', starting: '#fbbf24', loading: '#7aa2f7', offline: '#5e5e6e', error: '#f87171' };
  const sColor = statusColors[serverStatus] || '#5e5e6e';

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: '#0c0c12' }}>
      <input ref={fileInputRef} type="file" accept=".gguf" style={{ display: 'none' }} onChange={handleFileInputChange} />

      {/* Header row */}
      <div style={C.header}>
        <div style={C.row}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Cpu size={16} style={{ color: '#5e5e6e' }} />
            <div>
              <div style={{ fontSize: '13px', fontWeight: 600, color: '#e4e4ea' }}>Models</div>
              <div style={{ fontSize: '10px', color: '#5e5e6e', marginTop: 1 }}>llama.cpp GGUF runtime</div>
            </div>
          </div>
          <button onClick={fetchModels} style={{ ...C.btn, width: 30, height: 30, background: 'transparent', color: '#5e5e6e' }}
            onMouseEnter={e => e.currentTarget.style.color = '#e4e4ea'}
            onMouseLeave={e => e.currentTarget.style.color = '#5e5e6e'}>
            <RefreshCw size={13} style={isLoading ? { animation: 'spin .8s linear infinite' } : {}} />
          </button>
        </div>
      </div>

      {/* Server status */}
      <div style={C.header}>
        <div style={C.row}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: sColor, flexShrink: 0, animation: serverStatus === 'starting' || serverStatus === 'loading' ? 'pulse 1.2s ease-in-out infinite' : 'none' }} />
            <div>
              <span style={{ fontSize: '12px', fontWeight: 600, color: sColor }}>{statusLabels[serverStatus] || 'Offline'}</span>
              {activeModel && <span style={{ marginLeft: 8, fontSize: '11px', color: '#5e5e6e' }}>{activeModel}</span>}
            </div>
          </div>
          {isActive && (
            <button onClick={handleStop} style={{ ...C.btn, height: 28, padding: '0 10px', background: 'rgba(248,113,113,0.1)', color: '#f87171', border: '1px solid rgba(248,113,113,0.15)' }}
              onMouseEnter={e => e.currentTarget.style.background = 'rgba(248,113,113,0.18)'}
              onMouseLeave={e => e.currentTarget.style.background = 'rgba(248,113,113,0.1)'}>
              <StopCircle size={11} /> Stop
            </button>
          )}
        </div>
      </div>

      {/* Runtime settings row */}
      <div style={C.header}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: '#e4e4ea' }}>Runtime settings</span>
          {appliedSettings && isDirty && (
            <span style={{
              padding: '1px 6px', borderRadius: 4, fontSize: 9, fontWeight: 700,
              background: 'rgba(251,191,36,0.1)', color: '#fbbf24',
              border: '1px solid rgba(251,191,36,0.15)', whiteSpace: 'nowrap',
            }}>
              Restart required
            </span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
            <span style={C.label}>GPU layers</span>
            <input type="number" min={0} max={100} value={gpuLayers} disabled={controlsDisabled} onChange={e => setGpuLayers(Number(e.target.value) || 0)}
              style={{ ...C.input, width: 64, padding: '0 10px', textAlign: 'right' }}
              onFocus={e => e.currentTarget.style.borderColor = 'rgba(130,100,220,0.3)'}
              onBlur={e => e.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)'} />
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
            <span style={C.label}>Context</span>
            <select value={ctxSize} disabled={controlsDisabled} onChange={e => setCtxSize(Number(e.target.value))}
              style={{ ...C.input, width: 90, padding: '0 8px', cursor: 'pointer' }}>
              {[2048, 4096, 8192, 16384].map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
            <span style={C.label}>Threads</span>
            <input type="number" min={0} max={64} value={threads} disabled={controlsDisabled} onChange={e => setThreads(Number(e.target.value))}
              style={{ ...C.input, width: 56, padding: '0 8px', textAlign: 'right' }}
              onFocus={e => e.currentTarget.style.borderColor = 'rgba(130,100,220,0.3)'}
              onBlur={e => e.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)'} />
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
            <span style={C.label}>Batch</span>
            <select value={batchSize} disabled={controlsDisabled} onChange={e => setBatchSize(Number(e.target.value))}
              style={{ ...C.input, width: 80, padding: '0 8px', cursor: 'pointer' }}>
              {[128, 256, 512, 1024, 2048].map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
          <ToggleSetting label="Flash attn" value={flashAttn} onChange={setFlashAttn} disabled={controlsDisabled} />
          <ToggleSetting label="MLock" value={mlock} onChange={setMlock} disabled={controlsDisabled} />
        </div>
        <RuntimeSettingsSummary
          applied={appliedSettings}
          pending={{ gpuLayers, ctxSize, threads, batchSize, flashAttn, mlock }}
          isDirty={!!isDirty}
        />
      </div>

      {/* Apply button row */}
      {appliedSettings && isDirty && (
        <div style={{
          padding: '6px 16px 8px', display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <button onClick={() => reloadModel(backendUrl)} disabled={!canReload}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              height: 28, padding: '0 12px', borderRadius: 7, fontSize: 11, fontWeight: 600,
              background: canReload ? 'rgba(124,109,240,0.14)' : 'rgba(255,255,255,0.04)',
              color: canReload ? '#c4b5fd' : '#52546a',
              border: canReload ? '1px solid rgba(124,109,240,0.2)' : '1px solid rgba(255,255,255,0.06)',
              cursor: canReload ? 'pointer' : 'not-allowed',
              transition: 'all .15s',
            }}
            onMouseEnter={e => { if (canReload) e.currentTarget.style.background = 'rgba(124,109,240,0.24)'; }}
            onMouseLeave={e => { if (canReload) e.currentTarget.style.background = 'rgba(124,109,240,0.14)'; }}
          >
            {isReloading ? (
              <><Loader2 size={10} style={{ animation: 'spin .8s linear infinite' }} /> Reloading...</>
            ) : (
              <><RefreshCw size={10} /> Apply & Reload Runtime</>
            )}
          </button>
          <span style={{ fontSize: 10, color: '#5e5e6e' }}>
            {isReloading ? (loadProgress || 'Restarting runtime...') : 'Reload runtime to apply pending settings'}
          </span>
        </div>
      )}

      {/* Error / status */}
      {error && <div style={{ ...C.header, borderBottom: '1px solid rgba(248,113,113,0.15)', background: 'rgba(248,113,113,0.04)' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: '11px', color: '#f87171' }}>
          <AlertCircle size={12} style={{ marginTop: 2, flexShrink: 0 }} />
          <span>{error}</span>
        </div>
      </div>}
      {copyStatus && <div style={{ ...C.header, borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '11px', color: '#9898a6' }}>
          {isCopying ? <Loader2 size={11} style={{ animation: 'spin .8s linear infinite' }} /> : <CheckCircle size={11} style={{ color: '#4ade80' }} />}
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{copyStatus}</span>
        </div>
      </div>}

      {/* Browse + models list */}
      <div style={{ minHeight: 0, flex: 1, overflowY: 'auto' }}>
        <div style={{ padding: '10px 16px 12px' }}>

          {/* Browse button */}
          <button onClick={handleBrowse} disabled={isCopying}
            style={{ ...C.btn, width: '100%', height: 34, marginBottom: 14, background: 'rgba(130,100,220,0.12)', color: '#c8c0e0' }}
            onMouseEnter={e => { if (!isCopying) e.currentTarget.style.background = 'rgba(130,100,220,0.2)'; }}
            onMouseLeave={e => { if (!isCopying) e.currentTarget.style.background = 'rgba(130,100,220,0.12)'; }}>
            {isCopying ? <Loader2 size={13} style={{ animation: 'spin .8s linear infinite' }} /> : <FolderPlus size={13} />}
            Browse GGUF
          </button>

          {/* Model count */}
          <div style={{ marginBottom: 10, fontSize: '10px', fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase', color: '#5e5e6e' }}>
            GGUF Models ({modelList.length})
          </div>

          {/* Model list or empty */}
          {modelList.length === 0 ? (
            <div style={{ padding: '32px 0', textAlign: 'center' }}>
              <HardDrive size={24} style={{ margin: '0 auto 12px', color: '#5e5e6e', opacity: 0.4 }} />
              <div style={{ fontSize: '12px', color: '#5e5e6e' }}>No GGUF models found</div>
              <div style={{ marginTop: 4, fontSize: '11px', color: '#484854' }}>Place .gguf files in the models folder</div>
              {modelsDir && <div style={{ marginTop: 12, fontSize: '9px', color: '#484854', wordBreak: 'break-all' }}>{modelsDir}</div>}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {modelList.map((model) => {
                const loading = loadingModel === model.filename;
                const active = activeModel === model.filename;
                const canLoad = serverStatus !== 'starting' && serverStatus !== 'loading';
                const meta = parseModelMeta(model);
                return (
                  <div key={model.filename}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 12,
                      padding: '10px 12px', borderRadius: 8,
                      background: active ? 'rgba(74,222,128,0.04)' : 'transparent',
                      border: active ? '1px solid rgba(74,222,128,0.12)' : '1px solid transparent',
                      transition: 'all .12s',
                    }}
                    onMouseEnter={e => { if (!active) { e.currentTarget.style.background = 'rgba(255,255,255,0.02)'; }}}
                    onMouseLeave={e => { if (!active) { e.currentTarget.style.background = 'transparent'; }}}>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        {active && <CheckCircle size={12} style={{ color: '#4ade80', flexShrink: 0 }} />}
                        <span style={{ fontSize: '12px', fontWeight: 550, color: '#e4e4ea', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{meta.title}</span>
                      </div>
                      <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 8 }}>
                        {meta.quant && <span style={{ ...C.tag, background: 'rgba(255,255,255,0.04)', color: '#5e5e6e', border: '1px solid rgba(255,255,255,0.04)' }}>{meta.quant}</span>}
                        {meta.mmproj
                          ? <span style={{ ...C.tag, background: 'rgba(130,100,220,0.1)', color: '#a898d0', border: '1px solid rgba(130,100,220,0.12)' }}>Vision</span>
                          : <span style={{ ...C.tag, background: 'rgba(74,222,128,0.06)', color: '#4ade80', border: '1px solid rgba(74,222,128,0.08)' }}>Text</span>}
                        <span style={{ fontSize: '10px', color: '#5e5e6e' }}>{formatModelSize(model.sizeMB)}</span>
                      </div>
                    </div>
                    <button onClick={() => handleLoad(model)} disabled={loading || !canLoad || active}
                      style={{
                        ...C.btn, height: 30, padding: '0 10px',
                        background: active ? 'rgba(74,222,128,0.1)' : 'rgba(130,100,220,0.12)',
                        color: active ? '#4ade80' : '#c8c0e0',
                        opacity: (!canLoad || active) && !loading ? 0.4 : 1,
                        cursor: (!canLoad || active) && !loading ? 'not-allowed' : 'pointer',
                      }}
                      onMouseEnter={e => { if (!active && canLoad && !loading) e.currentTarget.style.background = 'rgba(130,100,220,0.22)'; }}
                      onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'rgba(130,100,220,0.12)'; }}>
                      {loading ? <><Loader2 size={10} style={{ animation: 'spin .8s linear infinite' }} /> Loading</>
                        : active ? 'Active'
                        : <><Play size={10} fill="currentColor" /> Load</>}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
          {modelsDir && <div style={{ marginTop: 12, fontSize: '9px', color: '#484854', wordBreak: 'break-all' }}>{modelsDir}</div>}
        </div>
      </div>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}@keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}`}</style>
    </div>
  );
}

const statusLabels = { ready: 'Ready', starting: 'Starting', loading: 'Loading', offline: 'Offline', error: 'Error' };

function parseModelMeta(model) {
  const raw = model.name || model.filename?.replace(/\.gguf$/i, '') || 'Model';
  const quant = raw.match(/(?:^|[-_])((?:IQ|Q)\d(?:_[A-Z0-9]+)*)$/i)?.[1]?.toUpperCase() || '';
  const title = quant ? raw.replace(new RegExp(`[-_]${quant}$`, 'i'), '') : raw;
  const lower = raw.toLowerCase();
  return { title, quant, mmproj: lower.includes('mmproj') || lower.includes('vision') || lower.includes('vl') };
}

function formatModelSize(sizeMB) {
  if (!Number.isFinite(sizeMB)) return 'Unknown';
  return sizeMB >= 1024 ? `${(sizeMB / 1024).toFixed(1)} GB` : `${sizeMB} MB`;
}

function RuntimeSettingsSummary({ applied, pending, isDirty }) {
  const appliedText = applied
    ? formatRuntimeSettings(applied)
    : 'No verified runtime settings yet';
  const pendingText = formatRuntimeSettings(pending);

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '1fr',
      gap: 5,
      marginTop: 10,
      borderTop: '1px solid rgba(255,255,255,0.04)',
      paddingTop: 9,
      fontSize: 10,
    }}>
      <div style={{ display: 'flex', gap: 8, minWidth: 0 }}>
        <span style={{ width: 54, color: '#4ade80', fontWeight: 700 }}>Applied</span>
        <span style={{ color: '#77778a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{appliedText}</span>
      </div>
      <div style={{ display: 'flex', gap: 8, minWidth: 0 }}>
        <span style={{ width: 54, color: isDirty ? '#fbbf24' : '#5e5e6e', fontWeight: 700 }}>Pending</span>
        <span style={{ color: isDirty ? '#d8c885' : '#77778a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{pendingText}</span>
      </div>
    </div>
  );
}

function formatRuntimeSettings(settings) {
  if (!settings) return '';
  return [
    `ctx ${settings.ctxSize}`,
    `gpu ${settings.gpuLayers}`,
    `threads ${settings.threads}`,
    `batch ${settings.batchSize}`,
    `flash ${settings.flashAttn ? 'on' : 'off'}`,
    `mlock ${settings.mlock ? 'on' : 'off'}`,
  ].join(' · ');
}

function ToggleSetting({ label, value, onChange, disabled = false }) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: disabled ? 'not-allowed' : 'pointer', userSelect: 'none', opacity: disabled ? 0.55 : 1 }}>
      <div
        onClick={() => { if (!disabled) onChange(!value); }}
        style={{
          width: 30, height: 16, borderRadius: 10,
          background: value ? 'rgba(130,100,220,0.5)' : 'rgba(255,255,255,0.08)',
          position: 'relative', transition: 'background .15s', flexShrink: 0,
        }}
      >
        <div style={{
          width: 12, height: 12, borderRadius: '50%',
          background: value ? '#c4b5fd' : '#5e5e6e',
          position: 'absolute', top: 2, left: value ? 16 : 2,
          transition: 'left .15s, background .15s',
        }} />
      </div>
      <span style={{ fontSize: '10px', color: '#5e5e6e', fontWeight: 500 }}>{label}</span>
    </label>
  );
}
