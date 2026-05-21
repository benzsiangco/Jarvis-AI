import { useEffect, useRef, useState } from 'react';
import { GitBranch, Terminal, PanelRight, PanelLeft, AlertCircle, Loader2, Circle, Gauge, Zap, XCircle, Activity, Cpu, Server, Globe } from 'lucide-react';
import useModelStore from '../stores/modelStore';
import useLayoutStore from '../stores/layoutStore';
import useEditorStore from '../stores/editorStore';
import useChatStore from '../stores/chatStore';
import useWorkspaceStore from '../stores/workspaceStore';
import { getModelCapabilities, getModelName } from '../services/modelCapabilities';
import useRuntimeStore from '../stores/runtimeStore';

export default function StatusBar({ backendUrl }) {
  const serverStatus = useModelStore((s) => s.serverStatus);
  const activeModel  = useModelStore((s) => s.activeModel);
  const loadProgress = useModelStore((s) => s.loadProgress);
  const llamaStats   = useModelStore((s) => s.llamaStats);
  const appliedSettings = useModelStore((s) => s.appliedSettings);
  const fetchStats   = useModelStore((s) => s.fetchLlamaStats);
  const isStreaming  = useChatStore((s) => s.isStreaming);
  const toggleTerminal  = useLayoutStore((s) => s.toggleTerminal);
  const toggleWorkspace = useLayoutStore((s) => s.toggleWorkspace);
  const toggleSidebar   = useLayoutStore((s) => s.toggleSidebar);
  const activeFile = useEditorStore((s) => {
    const idx = s.activeFileIdx;
    return idx >= 0 ? s.openFiles[idx] : null;
  });
  const workspaceName = useWorkspaceStore((s) => {
    const ws = s.workspaces?.find((w) => w.id === s.activeWorkspaceId);
    return ws?.name || ws?.path?.split(/[/\\]/).pop() || 'No workspace';
  });

  const serverInfo = useModelStore((s) => s.serverInfo);
  const models = useModelStore((s) => s.models);
  const fetchRuntimes = useRuntimeStore((s) => s.fetchRuntimes);
  const installed = useRuntimeStore((s) => s.installed);
  const currentVersion = useRuntimeStore((s) => s.currentVersion);
  const backendConnected = useModelStore((s) => s.backendConnected);
  const activeRt = installed.find((r) => r.active);
  const activeProviderId = useModelStore((s) => s.activeProviderId);
  const activeProviderModel = useModelStore((s) => s.activeProviderModel);
  const providers = useModelStore((s) => s.providers);
  const activeProvider = providers.find((p) => p.id === activeProviderId);
  const modelName = getModelName(activeModel);
  const modelCaps = getModelCapabilities(activeModel, serverInfo, models);

  // Fetch runtime info on mount so StatusBar shows active runtime immediately
  useEffect(() => {
    if (backendUrl && backendConnected) fetchRuntimes(backendUrl);
  }, [backendUrl, backendConnected, fetchRuntimes]);

  // Live stats poll: 2s normally, 500ms while streaming
  const intervalMs = isStreaming ? 600 : 2500;
  const intervalRef = useRef(null);
  useEffect(() => {
    if (!backendUrl || serverStatus !== 'ready') return;
    clearInterval(intervalRef.current);
    intervalRef.current = setInterval(() => fetchStats(backendUrl), intervalMs);
    return () => clearInterval(intervalRef.current);
  }, [backendUrl, serverStatus, intervalMs, fetchStats]);

  // Real context size: prefer llama.cpp's runtime stats (probed from /props),
  // fall back to user-set ctxSize. The two can differ when the model has a
  // smaller native context than what the user requested.
  const effectiveCtx = llamaStats?.contextSize || appliedSettings?.ctxSize || 0;
  const ctxUsed      = llamaStats?.contextUsed  || 0;
  const tps          = llamaStats?.tokensPerSecond || 0;
  const showStats    = serverStatus === 'ready';

  return (
    <div
      className="status-bar-root flex items-center justify-between h-[26px] px-2 text-[10.5px] select-none"
      style={{ background:'#080a0d', borderTop:'1px solid rgba(255,255,255,0.04)', flexShrink:0 }}
    >
      {/* Left */}
      <div className="flex items-center gap-1 min-w-0">
        <button
          onClick={toggleSidebar}
          className="status-branch"
          title="Toggle sidebar"
        >
          <PanelLeft size={11} />
        </button>

        <div style={{ width:1, height:12, background:'rgba(255,255,255,0.06)', flexShrink:0 }} />

        {/* Git branch */}
        <span className="status-branch" title="Current git branch">
          <GitBranch size={10} />
          <span>main</span>
        </span>

        <div style={{ width:1, height:12, background:'rgba(255,255,255,0.06)', flexShrink:0 }} />

        {/* Error / warning counts */}
        <span className="status-branch" title="Errors: 0">
          <XCircle size={10} style={{ color:'rgba(248,113,113,0.7)' }} />
          <span>0</span>
        </span>
        <span className="status-branch" title="Warnings: 0">
          <AlertCircle size={10} style={{ color:'rgba(251,191,36,0.7)' }} />
          <span>0</span>
        </span>

        <div style={{ width:1, height:12, background:'rgba(255,255,255,0.06)', flexShrink:0 }} />

        {/* Model status */}
        <StatusIndicator status={serverStatus} modelName={modelName} loadProgress={loadProgress} activeModel={activeModel} />

        {/* Loading progress bar — animated shimmer while model is starting/loading */}
        {(serverStatus === 'starting' || serverStatus === 'loading') && (
          <span className="status-loading-bar" style={{ display:'inline-flex', alignItems:'center', gap:5, marginLeft:2 }}>
            <span style={{
              display:'inline-block', width:48, height:3, borderRadius:2,
              background:'rgba(255,255,255,0.06)', overflow:'hidden', verticalAlign:'middle',
            }}>
              <span style={{
                display:'block', width:'40%', height:'100%',
                borderRadius:2, background:'rgba(96,165,250,0.6)',
                animation:'sb-shimmer 1.2s ease-in-out infinite',
              }} />
            </span>
          </span>
        )}

        {/* Live stats — always visible when model is ready */}
        {showStats && (
          <>
            <div style={{ width:1, height:12, background:'rgba(255,255,255,0.06)', flexShrink:0 }} />

            {/* GPU layers */}
            {appliedSettings?.gpuLayers > 0 && (
              <span className="status-branch" title={`GPU offload: ${appliedSettings.gpuLayers} layers`} style={{ fontFamily: 'var(--font-mono)', color:'#52546a' }}>
                <Cpu size={9} style={{ color:'rgba(6,182,212,0.6)' }} />
                gpu {appliedSettings.gpuLayers}
              </span>
            )}

            {/* Capability badges */}
            <span className="status-branch" style={{ gap: 3 }}>
              {modelCaps?.thinking && <CapDot label="T" color="#a78bfa" title="Thinking / reasoning model" />}
              {modelCaps?.image && <CapDot label="V" color="#34d399" title="Vision / multimodal model" />}
              {modelCaps?.coding && <CapDot label="C" color="#22d3ee" title="Coding-optimised model" />}
            </span>

            <div style={{ width:1, height:12, background:'rgba(255,255,255,0.06)', flexShrink:0 }} />

            {/* tok/s — speed gauge + number */}
            <SpeedGauge tps={tps} isStreaming={isStreaming} />

            <div style={{ width:1, height:12, background:'rgba(255,255,255,0.06)', flexShrink:0 }} />

            {/* Context usage bar */}
            <ContextBar used={ctxUsed} total={effectiveCtx} batchSize={appliedSettings?.batchSize} threads={appliedSettings?.threads} />
          </>
        )}
      </div>

      {/* Right */}
      <div className="flex items-center gap-1">
        {activeFile && (
          <>
            <span className="status-branch" title={`Language: ${activeFile.language}`}>{activeFile.language}</span>
            <div style={{ width:1, height:12, background:'rgba(255,255,255,0.06)', flexShrink:0 }} />
          </>
        )}
        <button onClick={toggleTerminal} className="status-branch" title="Toggle terminal panel">
          <Terminal size={10} />
          <span>Terminal</span>
        </button>
        <button onClick={toggleWorkspace} className="status-branch" title="Toggle workspace panel">
          <PanelRight size={10} />
          <span>Workspace</span>
        </button>
        <div style={{ width:1, height:12, background:'rgba(255,255,255,0.06)', flexShrink:0 }} />
        <span className="status-branch" title={`Active workspace: ${workspaceName}`} style={{ maxWidth: 160, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
          {workspaceName}
        </span>

        {!backendConnected && (
          <>
            <div style={{ width:1, height:12, background:'rgba(255,255,255,0.06)', flexShrink:0 }} />
            <span className="status-branch" title="Waiting for Jarvis backend on localhost:6767" style={{ color: '#fbbf24', fontFamily: 'var(--font-mono)' }}>
              <Loader2 size={9} style={{ animation: 'sb-pulse 1.2s ease-in-out infinite', color: '#fbbf24' }} />
              Connecting...
            </span>
          </>
        )}
        {(activeRt || currentVersion || activeProvider) && backendConnected && (
          <>
            <div style={{ width:1, height:12, background:'rgba(255,255,255,0.06)', flexShrink:0 }} />
            {activeProvider ? (
              <span
                className="status-branch"
                title={`Provider: ${activeProvider.name}\nModel: ${activeProviderModel}`}
                style={{ color: '#34d399', fontFamily: 'var(--font-mono)' }}
              >
                <Globe size={9} style={{ color: 'rgba(52,211,153,0.6)' }} />
                {activeProvider.name} · {activeProviderModel}
              </span>
            ) : (
              <span
                className="status-branch"
                title={`llama.cpp runtime\nBackend: ${activeRt?.backend ?? currentVersion?.backend}\nBuild: b${activeRt?.version ?? currentVersion?.build}`}
                style={{ color: '#22d3ee', fontFamily: 'var(--font-mono)' }}
              >
                <Server size={9} style={{ color: 'rgba(6,182,212,0.6)' }} />
                {activeRt ? `${activeRt.backend} b${activeRt.version}` : `${currentVersion.backend} b${currentVersion.build}`}
              </span>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/* ── Context usage bar ── */
function ContextBar({ used, total, batchSize, threads }) {
  const pct = total > 0 ? Math.min(1, used / total) : 0;
  const label = total > 0 ? `ctx ${used.toLocaleString()}/${total.toLocaleString()}` : `ctx ${total.toLocaleString()}`;
  const barColor = pct > 0.85 ? '#f87171' : pct > 0.65 ? '#fbbf24' : '#4ade80';
  const pctLabel = total > 0 ? ` (${Math.round(pct * 100)}%)` : '';
  const extraLines = [
    batchSize ? `Batch size: ${batchSize}` : null,
    threads   ? `Threads: ${threads}`     : null,
  ].filter(Boolean).join('\n');
  const tooltip = `Context window\nUsed: ${used.toLocaleString()} tokens\nTotal: ${total.toLocaleString()} tokens${pctLabel}${extraLines ? '\n' + extraLines : ''}`;

  return (
    <span className="status-branch" title={tooltip} style={{ fontFamily: 'var(--font-mono)', gap: 6 }}>
      <Gauge size={9} style={{ color: total > 0 ? barColor : '#52546a' }} />
      <span style={{ color: '#52546a' }}>{label}</span>
      <span style={{
        display: 'inline-block', width: 48, height: 4, borderRadius: 2,
        background: 'rgba(255,255,255,0.06)', overflow: 'hidden', verticalAlign: 'middle',
      }}>
        <span style={{
          display: 'block', width: `${pct * 100}%`, height: '100%',
          background: barColor, borderRadius: 2, transition: 'width .4s, background .3s',
        }} />
      </span>
    </span>
  );
}

function StatusIndicator({ status, modelName, loadProgress, activeModel }) {
  const fullName = activeModel || modelName || '';
  const tooltips = {
    ready:    `Model ready\n${fullName}`,
    loading:  `Loading model…\n${loadProgress || fullName}`,
    starting: `Starting runtime…\n${loadProgress || ''}`,
    error:    `Runtime error\n${loadProgress || ''}`,
    offline:  'No model loaded',
  };
  const cfgs = {
    ready:    { dot:'#22d3ee', icon:<Zap size={9} style={{color:'rgba(6,182,212,0.8)'}} />, text: modelName ? shortName(modelName) : 'Ready', color:'#22d3ee' },
    loading:  { dot:'#60a5fa', icon:<Loader2 size={9} className="animate-spin" style={{color:'#60a5fa'}} />, text: loadProgress || `Loading ${modelName||'...'}`, color:'#60a5fa' },
    starting: { dot:'#fbbf24', icon:<Loader2 size={9} className="animate-spin" style={{color:'#fbbf24'}} />, text: loadProgress || 'Starting...', color:'#fbbf24' },
    error:    { dot:'#f87171', icon:<AlertCircle size={9} style={{color:'#f87171'}} />, text:'Error', color:'#f87171' },
    offline:  { dot:'#52546a', icon:<Circle size={9} style={{color:'#52546a'}} />, text:'No model', color:'#52546a' },
  };
  const c = cfgs[status] || cfgs.offline;
  return (
    <span className="status-branch" title={tooltips[status] || tooltips.offline} style={{ color: c.color }}>
      <span style={{
        width:5, height:5, borderRadius:'50%', background: c.dot,
        display:'inline-block', flexShrink:0,
        animation: (status === 'starting' || status === 'loading') ? 'sb-pulse 1.2s ease-in-out infinite' : 'none',
      }} />
      {c.icon}
      <span style={{ maxWidth:160, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{c.text}</span>
      <style>{`@keyframes sb-pulse { 0%,100%{opacity:1}50%{opacity:.4} } @keyframes sb-shimmer { 0%{transform:translateX(-100%)} 100%{transform:translateX(300%)} }`}</style>
    </span>
  );
}

function shortName(name) {
  const n = name.replace(/\.gguf$/i,'');
  const m = n.match(/^(.*?)[-_]((?:IQ|Q)\d(?:_[A-Z0-9]+)*)$/i);
  return m ? `${m[1]} · ${m[2].toUpperCase()}` : n;
}

/* ── Speed gauge — visual t/s meter ── */
function SpeedGauge({ tps, isStreaming }) {
  if (!isStreaming || tps <= 0) {
    return <span className="status-branch" title="Inference speed — idle" style={{ fontFamily: 'var(--font-mono)', color: '#52546a' }}>ready</span>;
  }

  const MAX_REF = 50;
  const pct = Math.min(1, tps / MAX_REF);
  const color = tps > 30 ? '#22d3ee' : tps > 15 ? '#4ade80' : tps > 5 ? '#fbbf24' : '#f87171';
  const quality = tps > 30 ? 'Fast' : tps > 15 ? 'Good' : tps > 5 ? 'Slow' : 'Very slow';

  return (
    <span className="status-branch" title={`Inference speed: ${tps.toFixed(1)} tok/s\n${quality} (ref: ${MAX_REF} t/s max)`} style={{ fontFamily: 'var(--font-mono)', gap: 6 }}>
      <Activity size={9} style={{ color }} />
      <span style={{ color, fontWeight: 600, minWidth: 52, textAlign: 'right' }}>
        {tps.toFixed(1)} t/s
      </span>
      <span style={{
        display: 'inline-block', width: 40, height: 4, borderRadius: 2,
        background: 'rgba(255,255,255,0.06)', overflow: 'hidden', verticalAlign: 'middle',
      }}>
        <span style={{
          display: 'block', width: `${pct * 100}%`, height: '100%',
          background: color, borderRadius: 2,
          transition: 'width .25s, background .3s',
          boxShadow: `0 0 6px ${color}44`,
        }} />
      </span>
    </span>
  );
}

function CapDot({ label, color, title }) {
  return (
    <span
      title={title}
      style={{
        padding: '0 4px', borderRadius: 3,
        background: `${color}18`,
        color, fontSize: 8, fontWeight: 700,
        lineHeight: '14px', cursor: 'default',
      }}
    >
      {label}
    </span>
  );
}
