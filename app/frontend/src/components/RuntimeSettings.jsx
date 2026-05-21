import { RefreshCw, Loader2, Gauge, Cpu, Database, Zap, Layers, Cog, AlertTriangle, Info } from 'lucide-react';
import useModelStore from '../stores/modelStore';

export default function RuntimeSettings({ backendUrl, compact = false }) {
  const {
    gpuLayers, ctxSize, threads, batchSize, flashAttn, mlock,
    kvCacheOffload, mmap, concurrentGens,
    setGpuLayers, setCtxSize, setThreads, setBatchSize, setFlashAttn, setMlock,
    setKvCacheOffload, setMmap, setConcurrentGens,
    activeModel, llamaStats, appliedSettings, isReloading,
    reloadModel, fetchAppliedSettings, serverStatus, memoryEstimate,
  } = useModelStore();

  const controlsDisabled = isReloading || serverStatus === 'starting' || serverStatus === 'loading';
  const hasModel = !!activeModel;

  const isDirty = appliedSettings && (
    appliedSettings.gpuLayers !== gpuLayers ||
    appliedSettings.ctxSize !== ctxSize ||
    appliedSettings.threads !== threads ||
    appliedSettings.batchSize !== batchSize ||
    appliedSettings.flashAttn !== flashAttn ||
    appliedSettings.mlock !== mlock ||
    appliedSettings.kvCacheOffload !== kvCacheOffload ||
    appliedSettings.mmap !== mmap ||
    appliedSettings.concurrentGens !== concurrentGens
  );

  const canReload = hasModel && !!isDirty && !isReloading && serverStatus === 'ready';

  const inputBase = {
    height: 32, borderRadius: 8,
    border: '1px solid rgba(255,255,255,0.07)',
    background: 'rgba(0,0,0,0.3)',
    color: '#d4d8e0',
    fontSize: 12,
    padding: '0 10px',
    outline: 'none',
    transition: 'border-color .15s',
  };

  return (
    <div>
      {/* Memory estimate banner */}
      {memoryEstimate && (
        <div style={{
          marginBottom: 14, padding: '10px 14px', borderRadius: 10,
          background: 'linear-gradient(135deg, rgba(6,182,212,0.06), rgba(6,182,212,0.02))',
          border: '1px solid rgba(6,182,212,0.12)',
          display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap',
        }}>
          <Database size={14} style={{ color: '#22d3ee', flexShrink: 0 }} />
          <div style={{ display: 'flex', gap: 14, fontSize: 11, fontFamily: 'var(--font-mono)', color: '#7a7f8a' }}>
            <span>GPU: <strong style={{ color: '#22d3ee' }}>{memoryEstimate.vramGB?.toFixed(1)} GB</strong></span>
            <span>RAM: <strong style={{ color: '#67e8f9' }}>{memoryEstimate.ramGB?.toFixed(1)} GB</strong></span>
            <span>Total: <strong style={{ color: '#e2e8f0' }}>{memoryEstimate.totalGB?.toFixed(1)} GB</strong></span>
          </div>
          <Info size={10} style={{ color: '#5e6370', marginLeft: 'auto' }} />
        </div>
      )}

      {/* Runtime status summary */}
      <div style={{
        marginBottom: 14, padding: '10px 14px', borderRadius: 10,
        background: 'rgba(255,255,255,0.02)',
        border: '1px solid rgba(255,255,255,0.06)',
        display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#7a7f8a' }}>
          <Gauge size={12} style={{ color: '#5e6370' }} />
          {appliedSettings ? (
            <span>
              ctx <strong style={{ color: '#c8ccd6' }}>{appliedSettings.ctxSize?.toLocaleString()}</strong>
              {' · '}gpu <strong style={{ color: '#c8ccd6' }}>{appliedSettings.gpuLayers}</strong>
              {' · '}{appliedSettings.flashAttn && <span style={{ color: '#22d3ee' }}>flash-attn </span>}
            </span>
          ) : (
            <span>No runtime applied</span>
          )}
        </div>
        {isDirty && (
          <span style={{
            padding: '2px 8px', borderRadius: 6, fontSize: 9, fontWeight: 700,
            background: 'rgba(251,191,36,0.1)', color: '#fbbf24',
            border: '1px solid rgba(251,191,36,0.18)',
            display: 'flex', alignItems: 'center', gap: 4,
          }}>
            <AlertTriangle size={9} /> Restart required
          </span>
        )}
      </div>

      {/* Settings grid */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <SectionHeader icon={Cpu} label="Performance" />

        <SettingRow label="Context Size" desc="Max tokens per conversation" icon={Gauge}>
          <select value={ctxSize} disabled={controlsDisabled}
            onChange={e => setCtxSize(Number(e.target.value))}
            style={{ ...inputBase, width: 130, cursor: 'pointer' }}
          >
            {[2048, 4096, 8192, 16384, 32768, 65536, 131072].map(n => (
              <option key={n} value={n}>{n.toLocaleString()}</option>
            ))}
          </select>
        </SettingRow>

        <SettingRow label="GPU Layers" desc="Offload to GPU (0 = CPU only)">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input type="range" min={0} max={100} value={gpuLayers}
              disabled={controlsDisabled}
              onChange={e => setGpuLayers(Number(e.target.value))}
              style={{ width: 80, accentColor: '#22d3ee' }}
            />
            <input type="number" min={0} max={100} value={gpuLayers}
              disabled={controlsDisabled}
              onChange={e => setGpuLayers(Number(e.target.value) || 0)}
              style={{ ...inputBase, width: 56, textAlign: 'center' }}
            />
          </div>
        </SettingRow>

        <SettingRow label="CPU Threads" desc="Processing threads (0 = auto)">
          <input type="number" min={0} max={64} value={threads}
            disabled={controlsDisabled}
            onChange={e => setThreads(Number(e.target.value))}
            style={{ ...inputBase, width: 64, textAlign: 'center' }}
          />
        </SettingRow>

        <SettingRow label="Batch Size" desc="Prompt processing batch">
          <select value={batchSize} disabled={controlsDisabled}
            onChange={e => setBatchSize(Number(e.target.value))}
            style={{ ...inputBase, width: 100, cursor: 'pointer' }}
          >
            {[128, 256, 512, 1024, 2048, 4096].map(n => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        </SettingRow>

        <SettingRow label="Concurrent Generations" desc="Parallel request slots">
          <select value={concurrentGens} disabled={controlsDisabled}
            onChange={e => setConcurrentGens(Number(e.target.value))}
            style={{ ...inputBase, width: 80, cursor: 'pointer' }}
          >
            {[1, 2, 3, 4, 6, 8].map(n => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        </SettingRow>

        <SectionHeader icon={Zap} label="Advanced" />

        <TogRow label="Flash Attention" desc="Reduces memory usage" value={flashAttn} onChange={setFlashAttn} disabled={controlsDisabled} />
        <TogRow label="MLock" desc="Lock model in RAM" value={mlock} onChange={setMlock} disabled={controlsDisabled} />
        <TogRow label="KV Cache Offload" desc="Offload KV cache to GPU" value={kvCacheOffload} onChange={setKvCacheOffload} disabled={controlsDisabled} />
        <TogRow label="MMap" desc="Memory-map model file" value={mmap} onChange={setMmap} disabled={controlsDisabled} />
      </div>

      {/* Apply button */}
      {hasModel && (
        <div style={{
          marginTop: 16, padding: '10px 14px', borderRadius: 10,
          background: isDirty ? 'rgba(251,191,36,0.04)' : 'transparent',
          border: isDirty ? '1px solid rgba(251,191,36,0.1)' : '1px solid transparent',
          display: 'flex', alignItems: 'center', gap: 12,
        }}>
          <button
            onClick={() => reloadModel(backendUrl)}
            disabled={!canReload}
            style={{
              display: 'flex', alignItems: 'center', gap: 7, flexShrink: 0,
              height: 34, padding: '0 18px', borderRadius: 8, fontSize: 12, fontWeight: 600,
              background: canReload ? 'linear-gradient(135deg, rgba(6,182,212,0.18), rgba(6,182,212,0.1))' : 'rgba(255,255,255,0.04)',
              color: canReload ? '#67e8f9' : '#52546a',
              border: canReload ? '1px solid rgba(6,182,212,0.2)' : '1px solid rgba(255,255,255,0.06)',
              cursor: canReload ? 'pointer' : 'not-allowed',
              transition: 'all .15s',
            }}
            onMouseEnter={e => { if (canReload) e.currentTarget.style.background = 'linear-gradient(135deg, rgba(6,182,212,0.28), rgba(6,182,212,0.18))'; }}
            onMouseLeave={e => { if (canReload) e.currentTarget.style.background = 'linear-gradient(135deg, rgba(6,182,212,0.18), rgba(6,182,212,0.1))'; }}
          >
            {isReloading ? (
              <><Loader2 size={11} style={{ animation: 'ms-spin .8s linear infinite' }} /> Reloading...</>
            ) : (
              <><RefreshCw size={11} /> Apply & Reload</>
            )}
          </button>
          {isDirty && !isReloading && (
            <span style={{ fontSize: 10, color: '#fbbf24' }}>
              Settings changed — restart required
            </span>
          )}
        </div>
      )}
    </div>
  );
}

function SectionHeader({ icon: Icon, label }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 6,
      padding: '14px 0 6px', marginTop: 4,
      fontSize: 10, fontWeight: 700, letterSpacing: '.06em',
      textTransform: 'uppercase', color: '#5e6370',
      borderBottom: '1px solid rgba(255,255,255,0.04)',
    }}>
      {Icon && <Icon size={12} />}
      {label}
    </div>
  );
}

function SettingRow({ label, desc, icon: Icon, children }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '8px 0', minHeight: 40,
      borderBottom: '1px solid rgba(255,255,255,0.02)',
    }}>
      <div>
        <div style={{ fontSize: 12, color: '#c8ccd6', fontWeight: 500, display: 'flex', alignItems: 'center', gap: 6 }}>
          {Icon && <Icon size={11} style={{ color: '#5e6370' }} />}
          {label}
        </div>
        {desc && <div style={{ fontSize: 10, color: '#5e6370', marginTop: 1 }}>{desc}</div>}
      </div>
      {children}
    </div>
  );
}

function TogRow({ label, desc, value, onChange, disabled }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '8px 0', minHeight: 40,
      borderBottom: '1px solid rgba(255,255,255,0.02)',
    }}>
      <div>
        <div style={{ fontSize: 12, color: '#c8ccd6', fontWeight: 500 }}>{label}</div>
        {desc && <div style={{ fontSize: 10, color: '#5e6370', marginTop: 1 }}>{desc}</div>}
      </div>
      <CyanToggle value={value} onChange={onChange} disabled={disabled} />
    </div>
  );
}

function CyanToggle({ value, onChange, disabled = false }) {
  return (
    <div
      onClick={() => { if (!disabled) onChange(!value); }}
      style={{
        width: 36, height: 20, borderRadius: 12, flexShrink: 0,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.55 : 1,
        background: value ? 'rgba(6,182,212,0.4)' : 'rgba(255,255,255,0.08)',
        position: 'relative', transition: 'background .15s',
      }}
    >
      <div style={{
        width: 16, height: 16, borderRadius: '50%',
        background: value ? '#22d3ee' : '#5e6370',
        boxShadow: value ? '0 0 8px rgba(6,182,212,0.3)' : 'none',
        position: 'absolute', top: 2, left: value ? 18 : 2,
        transition: 'left .15s, background .15s',
      }} />
    </div>
  );
}