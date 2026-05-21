import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X, Loader2, Info, AlertTriangle } from 'lucide-react';
import useModelStore from '../stores/modelStore';
import { formatModelSize } from './ModelCard';

export default function ModelSettingsModal({ open, onClose, backendUrl, model, onLoadComplete }) {
  const ref = useRef(null);
  const {
    gpuLayers, ctxSize, threads, batchSize, flashAttn, mlock,
    kvCacheOffload, mmap, concurrentGens,
    setGpuLayers, setCtxSize, setThreads, setBatchSize,
    setFlashAttn, setMlock, setKvCacheOffload, setMmap, setConcurrentGens,
    draftModel, draftGpuLayers, draftMax, draftMin, draftPMin,
    setDraftModel, setDraftGpuLayers, setDraftMax, setDraftMin, setDraftPMin,
    loadModel, serverStatus, memoryEstimate, fetchMemoryEstimate, errorMessage,
    models,
  } = useModelStore();

  const [remember, setRemember] = useState(true);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open || !model) return;
    fetchMemoryEstimate(backendUrl, model.sizeMB, gpuLayers, ctxSize);
  }, [open, model?.filename]);

  useEffect(() => {
    if (!open && ref.current) {
      setLoading(false);
      setError('');
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const html = document.documentElement;
    const body = document.body;
    const prevH = html.style.overflow;
    const prevB = body.style.overflow;
    html.style.overflow = 'hidden';
    body.style.overflow = 'hidden';
    const clickHandler = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose(); };
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

  const meta = parseModelMeta(model);

  const handleLoad = async () => {
    setLoading(true);
    setError('');
    try {
      await loadModel(backendUrl, model.filename);
      const state = useModelStore.getState();
      if (state.errorMessage) {
        setError(state.errorMessage);
      } else {
        onLoadComplete?.();
        onClose();
      }
    } catch (err) {
      setError(`Failed: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const mem = memoryEstimate || {};
  const memWarn = mem.totalGB > 12;

  return createPortal((
    <div style={{
      position: 'fixed', inset: 0, zIndex: 10000,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(0,0,0,0.65)',
      backdropFilter: 'blur(8px)',
      animation: 'ms-fade-in .18s ease-out',
      overscrollBehavior: 'contain',
    }}>
      <div ref={ref} style={{
        width: 520, maxWidth: '92vw',
        maxHeight: '85vh',
        display: 'flex', flexDirection: 'column',
        borderRadius: 16,
        background: '#0d1117',
        border: '1px solid rgba(255,255,255,0.06)',
        boxShadow: '0 40px 96px rgba(0,0,0,0.7), 0 0 0 1px rgba(6,182,212,0.04)',
        animation: 'ms-slide-up .2s cubic-bezier(0.16,1,0.3,1)',
        overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{
          padding: '18px 20px 14px',
          borderBottom: '1px solid rgba(255,255,255,0.04)',
        }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: '#e2e8f0', marginBottom: 2 }}>
                {meta.title}
              </div>
              {meta.quant && (
                <span style={{
                  padding: '2px 7px', borderRadius: 5, fontSize: 10, fontWeight: 600,
                  background: 'rgba(255,255,255,0.04)', color: '#6b7280',
                  border: '1px solid rgba(255,255,255,0.06)',
                  fontFamily: 'var(--font-mono)',
                }}>
                  {meta.quant}
                </span>
              )}
            </div>
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

          {/* Memory estimate */}
          <div style={{
            display: 'flex', gap: 16, marginTop: 10,
            padding: '10px 14px', borderRadius: 10,
            background: 'rgba(0,0,0,0.3)',
            border: memWarn ? '1px solid rgba(251,191,36,0.15)' : '1px solid rgba(255,255,255,0.04)',
          }}>
            <MemItem label="GPU" value={mem.vramGB != null ? `${mem.vramGB.toFixed(2)} GB` : '—'} />
            <div style={{ width: 1, background: 'rgba(255,255,255,0.06)' }} />
            <MemItem label="RAM" value={mem.ramGB != null ? `${mem.ramGB.toFixed(2)} GB` : '—'} />
            <div style={{ width: 1, background: 'rgba(255,255,255,0.06)' }} />
            <MemItem label="Total" value={mem.totalGB != null ? `${mem.totalGB.toFixed(2)} GB` : '—'} accent />
            <div style={{ flex: 1 }} />
            {memWarn && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: '#fbbf24' }}>
                <AlertTriangle size={12} /> High usage
              </div>
            )}
          </div>
        </div>

        {/* Scrollable content */}
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '16px 20px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>

            {/* Context Length slider */}
            <SettingRow label="Context Length" value={`${ctxSize.toLocaleString()}`}>
              <Slider value={ctxSize} min={512} max={65536} step={512}
                onChange={setCtxSize}
                format={v => v.toLocaleString()} />
            </SettingRow>

            {/* GPU Offload slider */}
            <SettingRow label="GPU Offload" value={`${gpuLayers} layers`}>
              <Slider value={gpuLayers} min={0} max={80} step={1}
                onChange={setGpuLayers}
                warn={gpuLayers > 0 && (mem.vramGB || 0) > 8}
                warnMsg="May exceed available GPU memory" />
            </SettingRow>

            {/* CPU Thread Pool */}
            <SettingRow label="CPU Thread Pool" value={`${threads || 'Auto'}`}>
              <Slider value={threads} min={0} max={32} step={1}
                onChange={setThreads}
                format={v => v === 0 ? 'Auto' : String(v)} />
            </SettingRow>

            {/* Separator */}
            <div style={{ height: 1, background: 'rgba(255,255,255,0.04)', margin: '8px 0' }} />

            {/* Batch Size */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 0' }}>
              <Label>Evaluation Batch Size</Label>
              <select value={batchSize} onChange={e => setBatchSize(Number(e.target.value))}
                style={{
                  background: 'rgba(0,0,0,0.4)', color: '#d4d8e0',
                  border: '1px solid rgba(255,255,255,0.08)', borderRadius: 6,
                  padding: '4px 10px', fontSize: 12, fontFamily: 'var(--font-mono)',
                  outline: 'none', cursor: 'pointer',
                }}>
                {[64, 128, 256, 512, 1024, 2048, 4096].map(v => (
                  <option key={v} value={v}>{v}</option>
                ))}
              </select>
            </div>

            {/* Concurrent Predictions */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 0' }}>
              <Label>Max Concurrent Predictions</Label>
              <select value={concurrentGens} onChange={e => setConcurrentGens(Number(e.target.value))}
                style={{
                  background: 'rgba(0,0,0,0.4)', color: '#d4d8e0',
                  border: '1px solid rgba(255,255,255,0.08)', borderRadius: 6,
                  padding: '4px 10px', fontSize: 12, fontFamily: 'var(--font-mono)',
                  outline: 'none', cursor: 'pointer',
                }}>
                {[1, 2, 3, 4, 5, 6, 7, 8].map(v => (
                  <option key={v} value={v}>{v}</option>
                ))}
              </select>
            </div>

            {/* Separator */}
            <div style={{ height: 1, background: 'rgba(255,255,255,0.04)', margin: '8px 0' }} />

            {/* Toggles */}
            <TogRow label="Flash Attention" value={flashAttn} onChange={setFlashAttn} info="Accelerates attention computation" />
            <TogRow label="MLock" value={mlock} onChange={setMlock} info="Prevents memory from being swapped" />
            <TogRow label="MMap" value={mmap} onChange={setMmap} info="Memory-maps model file for faster loading" />
            <TogRow label="KV Cache Offload" value={kvCacheOffload} onChange={setKvCacheOffload} info="Offloads KV cache to system RAM" />

            {/* Separator */}
            <div style={{ height: 1, background: 'rgba(255,255,255,0.04)', margin: '8px 0' }} />

            {/* Speculative Decoding (Drafting) */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 0' }}>
              <div>
                <Label>Draft Model (Speculative)</Label>
                <div style={{ fontSize: 9.5, color: '#5e6370', marginTop: 1 }}>
                  Small model that proposes tokens for the main model to verify. 1.5–3× speedup.
                </div>
              </div>
              <select
                value={draftModel}
                onChange={(e) => setDraftModel(e.target.value)}
                style={{
                  background: 'rgba(0,0,0,0.4)', color: '#d4d8e0',
                  border: '1px solid rgba(255,255,255,0.08)', borderRadius: 6,
                  padding: '4px 10px', fontSize: 11, fontFamily: 'var(--font-mono)',
                  outline: 'none', cursor: 'pointer', minWidth: 200, maxWidth: 240,
                }}
              >
                <option value="">(disabled)</option>
                {(models || [])
                  .filter((m) => m.filename && m.filename !== model?.filename && !m.mmproj)
                  .map((m) => (
                    <option key={m.filename} value={m.filename}>
                      {(m.name || m.filename).replace(/\.gguf$/i, '')} · {m.sizeMB} MB
                    </option>
                  ))}
              </select>
            </div>

            {draftModel && (
              <div style={{
                display: 'flex', flexDirection: 'column', gap: 4,
                padding: '8px 12px', marginTop: 4, borderRadius: 8,
                background: 'rgba(34,211,238,0.04)',
                border: '1px solid rgba(34,211,238,0.12)',
              }}>
                <SettingRow label="Draft GPU Offload" value={`${draftGpuLayers} layers`}>
                  <Slider value={draftGpuLayers} min={0} max={80} step={1} onChange={setDraftGpuLayers} />
                </SettingRow>
                <SettingRow label="Draft Max Tokens" value={draftMax}>
                  <Slider value={draftMax} min={1} max={32} step={1} onChange={setDraftMax} />
                </SettingRow>
                <SettingRow label="Draft Min Tokens" value={draftMin}>
                  <Slider value={draftMin} min={0} max={8} step={1} onChange={setDraftMin} />
                </SettingRow>
                <SettingRow label="Min Probability" value={draftPMin.toFixed(2)}>
                  <Slider value={draftPMin} min={0} max={1} step={0.05}
                    onChange={(v) => setDraftPMin(Number(v))} />
                </SettingRow>
              </div>
            )}

            {/* Advanced toggle */}
            <button onClick={() => setShowAdvanced(!showAdvanced)}
              style={{
                display: 'flex', alignItems: 'center', gap: 4, marginTop: 4,
                padding: '6px 0', fontSize: 10.5, fontWeight: 600, color: '#5e6370',
                background: 'none', border: 'none', cursor: 'pointer',
                transition: 'color .12s',
              }}
              onMouseEnter={e => e.currentTarget.style.color = '#8b8d99'}
              onMouseLeave={e => e.currentTarget.style.color = '#5e6370'}
            >
              <span style={{
                display: 'inline-block', transition: 'transform .15s',
                transform: showAdvanced ? 'rotate(90deg)' : 'rotate(0deg)',
              }}>▸</span>
              {showAdvanced ? 'Hide Advanced' : 'Show Advanced'}
            </button>

            {showAdvanced && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <AdvancedRow label="Seed" defaultValue="-1" />
                <AdvancedRow label="RoPE Frequency Base" defaultValue="10000.0" />
                <AdvancedRow label="RoPE Frequency Scale" defaultValue="1.0" />
              </div>
            )}

          </div>
        </div>

        {/* Error */}
        {error && (
          <div style={{
            margin: '0 20px 8px',
            padding: '8px 12px', borderRadius: 8, fontSize: 11,
            background: 'rgba(248,113,113,0.06)', border: '1px solid rgba(248,113,113,0.15)',
            color: '#f87171',
          }}>
            {error}
          </div>
        )}

        {/* Bottom actions */}
        <div style={{
          padding: '14px 20px',
          borderTop: '1px solid rgba(255,255,255,0.04)',
          display: 'flex', alignItems: 'center', gap: 12,
          background: 'rgba(0,0,0,0.2)',
        }}>
          <label style={{
            display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer',
            fontSize: 11, color: '#5e6370',
          }}>
            <input type="checkbox" checked={remember} onChange={e => setRemember(e.target.checked)}
              style={{ accentColor: '#22d3ee' }} />
            Remember settings
          </label>

          <div style={{ flex: 1 }} />

          <button onClick={onClose}
            style={{
              height: 34, padding: '0 18px', borderRadius: 8, fontSize: 12, fontWeight: 600,
              background: 'rgba(255,255,255,0.04)', color: '#8b8d99',
              border: '1px solid rgba(255,255,255,0.08)', cursor: 'pointer',
              transition: 'all .12s',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.08)'; e.currentTarget.style.color = '#e2e8f0'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; e.currentTarget.style.color = '#8b8d99'; }}
          >
            Cancel
          </button>

          <button onClick={handleLoad} disabled={loading || serverStatus === 'starting' || serverStatus === 'loading'}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              height: 34, padding: '0 20px', borderRadius: 8, fontSize: 12, fontWeight: 700,
              border: 'none',
              background: loading
                ? 'rgba(6,182,212,0.15)'
                : 'linear-gradient(135deg, rgba(6,182,212,0.3), rgba(6,182,212,0.18))',
              color: '#22d3ee',
              boxShadow: loading ? 'none' : '0 0 20px rgba(6,182,212,0.12), inset 0 1px 0 rgba(255,255,255,0.08)',
              opacity: (loading || serverStatus === 'starting' || serverStatus === 'loading') ? 0.5 : 1,
              cursor: (loading || serverStatus === 'starting' || serverStatus === 'loading') ? 'not-allowed' : 'pointer',
              transition: 'all .12s',
            }}
            onMouseEnter={e => {
              if (!loading) e.currentTarget.style.background = 'linear-gradient(135deg, rgba(6,182,212,0.4), rgba(6,182,212,0.25))';
            }}
            onMouseLeave={e => {
              if (!loading) e.currentTarget.style.background = 'linear-gradient(135deg, rgba(6,182,212,0.3), rgba(6,182,212,0.18))';
            }}
          >
            {loading ? <><Loader2 size={12} style={{ animation: 'ms-spin .8s linear infinite' }} /> Loading...</>
              : <>Load Model <span style={{ fontSize: 10, opacity: 0.5, marginLeft: 2 }}>⌘⏎</span></>}
          </button>
        </div>
      </div>

      <style>{`
        @keyframes ms-fade-in { from { opacity: 0; } to { opacity: 1; } }
        @keyframes ms-slide-up { from { opacity: 0; transform: translateY(16px) scale(.98); } to { opacity: 1; transform: translateY(0) scale(1); } }
        @keyframes ms-spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  ), document.body);
}

/* ── Sub-components ── */

function Slider({ value, min, max, step, onChange, format, warn, warnMsg }) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div style={{ flex: 1, maxWidth: 240 }}>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(Number(e.target.value))}
        style={{ width: '100%', height: 4, borderRadius: 2, appearance: 'none', outline: 'none', cursor: 'pointer' }}
      />
      {warn && warnMsg && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 3, marginTop: 3, fontSize: 9.5, color: '#fbbf24' }}>
          <AlertTriangle size={10} /> {warnMsg}
        </div>
      )}
      <style>{`
        input[type="range"]::-webkit-slider-runnable-track {
          height: 4px; border-radius: 2px;
          background: linear-gradient(to right, rgba(6,182,212,0.6) ${pct}%, rgba(255,255,255,0.06) ${pct}%);
        }
        input[type="range"]::-webkit-slider-thumb {
          appearance: none; width: 14px; height: 14px; border-radius: 50%;
          background: #22d3ee; margin-top: -5px;
          box-shadow: 0 0 8px rgba(6,182,212,0.4);
          border: 2px solid #0d1117;
        }
        input[type="range"]::-moz-range-track {
          height: 4px; border-radius: 2px;
          background: rgba(255,255,255,0.06);
        }
        input[type="range"]::-moz-range-progress {
          height: 4px; border-radius: 2px;
          background: rgba(6,182,212,0.6);
        }
        input[type="range"]::-moz-range-thumb {
          width: 14px; height: 14px; border-radius: 50%;
          background: #22d3ee; border: 2px solid #0d1117;
          box-shadow: 0 0 8px rgba(6,182,212,0.4);
        }
      `}</style>
    </div>
  );
}

function SettingRow({ label, value, children }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '8px 0', gap: 12,
    }}>
      <div>
        <div style={{ fontSize: 12, fontWeight: 600, color: '#d4d8e0', marginBottom: 1 }}>{label}</div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        {children}
        <span style={{ fontSize: 11, fontWeight: 600, color: '#22d3ee', fontFamily: 'var(--font-mono)', minWidth: 48, textAlign: 'right' }}>
          {value}
        </span>
      </div>
    </div>
  );
}

function Label({ children }) {
  return <span style={{ fontSize: 12, fontWeight: 600, color: '#d4d8e0' }}>{children}</span>;
}

function TogRow({ label, value, onChange, info }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '6px 0',
    }}>
      <div>
        <div style={{ fontSize: 12, fontWeight: 600, color: '#d4d8e0' }}>{label}</div>
        {info && <div style={{ fontSize: 9.5, color: '#5e6370', marginTop: 1 }}>{info}</div>}
      </div>
      <button onClick={() => onChange(!value)}
        style={{
          position: 'relative', width: 36, height: 20, borderRadius: 10,
          border: 'none', cursor: 'pointer', flexShrink: 0,
          background: value ? 'rgba(6,182,212,0.3)' : 'rgba(255,255,255,0.08)',
          transition: 'background .15s',
        }}
        onMouseEnter={e => { if (!value) e.currentTarget.style.background = 'rgba(255,255,255,0.12)'; }}
        onMouseLeave={e => { if (!value) e.currentTarget.style.background = 'rgba(255,255,255,0.08)'; }}
      >
        <span style={{
          position: 'absolute', top: 2, left: value ? 18 : 2,
          width: 16, height: 16, borderRadius: '50%',
          background: value ? '#22d3ee' : '#5e6370',
          boxShadow: value ? '0 0 8px rgba(6,182,212,0.4)' : 'none',
          transition: 'all .15s',
        }} />
      </button>
    </div>
  );
}

function MemItem({ label, value, accent }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: 9, color: '#5e6370', fontWeight: 600, marginBottom: 1 }}>{label}</div>
      <div style={{
        fontSize: 12, fontWeight: 700, fontFamily: 'var(--font-mono)',
        color: accent ? '#22d3ee' : '#c8ccd6',
      }}>
        {value}
      </div>
    </div>
  );
}

function AdvancedRow({ label, defaultValue }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 0' }}>
      <span style={{ fontSize: 11, color: '#7a7f8a' }}>{label}</span>
      <input defaultValue={defaultValue}
        style={{
          width: 120, padding: '4px 8px', borderRadius: 6, fontSize: 11,
          fontFamily: 'var(--font-mono)', textAlign: 'right',
          background: 'rgba(0,0,0,0.3)', color: '#c8ccd6',
          border: '1px solid rgba(255,255,255,0.06)',
          outline: 'none',
        }} />
    </div>
  );
}

function parseModelMeta(model) {
  const raw = model.name || model.filename?.replace(/\.gguf$/i, '') || 'Model';
  const quantMatch = raw.match(/(?:^|[-_])((?:IQ|Q)\d(?:_[A-Z0-9]+)*)$/i);
  const quant = quantMatch?.[1]?.toUpperCase() || '';
  const title = quant ? raw.replace(new RegExp(`[-_]${quant}$`, 'i'), '') : raw;
  return { title, quant, sizeMB: model.sizeMB };
}
