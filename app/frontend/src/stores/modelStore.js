import { create } from 'zustand';
import { emitThinking } from './thinkingStore';

const LS = (key, fallback) => {
  try { const v = localStorage.getItem(key); return v !== null ? v : fallback; } catch { return fallback; }
};
const LSN = (key, fallback) => {
  try { const v = localStorage.getItem(key); return v !== null ? Number(v) || fallback : fallback; } catch { return fallback; }
};
const LSB = (key, fallback) => {
  try { const v = localStorage.getItem(key); return v !== null ? v === 'true' : fallback; } catch { return fallback; }
};
const LSJ = (key, fallback) => {
  try { const v = localStorage.getItem(key); return v !== null ? JSON.parse(v) : fallback; } catch { return fallback; }
};

const recentModelsFallback = [];
const recentModelsRaw = LSJ('jarvis:recentModels', recentModelsFallback);
const recentModels = Array.isArray(recentModelsRaw) ? recentModelsRaw : [];

const useModelStore = create((set, get) => ({
  models: [],
  activeModel: null,
  backendConnected: false,
  serverStatus: 'offline',
  serverInfo: null,
  loadProgress: '',
  loadStages: [],
  loadPercent: 0,
  lastHealthCheck: null,
  errorMessage: '',
  llamaStats: { tokensPerSecond: 0, totalTokens: 0, contextUsed: 0, contextSize: 4096, slotsIdle: 0, slotsProcessing: 0 },
  memoryEstimate: null,
  recentModels,
  providers: [],
  activeProviderId: null,
  activeProviderModel: null,

  gpuLayers: LSN('jarvis:gpuLayers', 0),
  ctxSize: LSN('jarvis:ctxSize', 4096),
  threads: LSN('jarvis:threads', 0),
  batchSize: LSN('jarvis:batchSize', 512),
  flashAttn: LSB('jarvis:flashAttn', false),
  mlock: LSB('jarvis:mlock', false),
  kvCacheOffload: LSB('jarvis:kvCacheOffload', true),
  mmap: LSB('jarvis:mmap', true),
  concurrentGens: LSN('jarvis:concurrentGens', 1),

  // Speculative decoding (drafting). draftModel='' = disabled.
  draftModel:     LS('jarvis:draftModel', ''),
  draftGpuLayers: LSN('jarvis:draftGpuLayers', 0),
  draftMax:       LSN('jarvis:draftMax', 8),
  draftMin:       LSN('jarvis:draftMin', 1),
  draftPMin:      LSN('jarvis:draftPMin', 0.5),

  appliedSettings: null,
  isReloading: false,
  stoppedByUser: false,

  setModels: (models) => set({ models }),
  setActiveModel: (model) => set({ activeModel: model }),
  setServerStatus: (status) => set({ serverStatus: normalizeStatus(status) }),
  setServerInfo: (info) => set({ serverInfo: info }),
  setLoadProgress: (msg) => set({ loadProgress: msg }),
  setLoadStages: (stages) => set({ loadStages: stages }),
  setErrorMessage: (msg) => set({ errorMessage: msg }),
  setMemoryEstimate: (est) => set({ memoryEstimate: est }),

  setGpuLayers: (val) => {
    const n = Number(val) || 0;
    localStorage.setItem('jarvis:gpuLayers', String(n));
    set({ gpuLayers: n });
  },
  setCtxSize: (val) => {
    const n = Number(val) || 4096;
    localStorage.setItem('jarvis:ctxSize', String(n));
    set({ ctxSize: n });
  },
  setThreads: (val) => {
    const n = Math.max(0, Number(val) || 0);
    localStorage.setItem('jarvis:threads', String(n));
    set({ threads: n });
  },
  setBatchSize: (val) => {
    const n = Number(val) || 512;
    localStorage.setItem('jarvis:batchSize', String(n));
    set({ batchSize: n });
  },
  setFlashAttn: (val) => {
    localStorage.setItem('jarvis:flashAttn', String(!!val));
    set({ flashAttn: !!val });
  },
  setMlock: (val) => {
    localStorage.setItem('jarvis:mlock', String(!!val));
    set({ mlock: !!val });
  },
  setKvCacheOffload: (val) => {
    localStorage.setItem('jarvis:kvCacheOffload', String(!!val));
    set({ kvCacheOffload: !!val });
  },
  setMmap: (val) => {
    localStorage.setItem('jarvis:mmap', String(!!val));
    set({ mmap: !!val });
  },
  setConcurrentGens: (val) => {
    const n = Math.max(1, Number(val) || 1);
    localStorage.setItem('jarvis:concurrentGens', String(n));
    set({ concurrentGens: n });
  },

  setDraftModel: (val) => {
    const s = String(val || '');
    localStorage.setItem('jarvis:draftModel', s);
    set({ draftModel: s });
  },
  setDraftGpuLayers: (val) => {
    const n = Math.max(0, Number(val) || 0);
    localStorage.setItem('jarvis:draftGpuLayers', String(n));
    set({ draftGpuLayers: n });
  },
  setDraftMax: (val) => {
    const n = Math.max(1, Math.min(64, Number(val) || 8));
    localStorage.setItem('jarvis:draftMax', String(n));
    set({ draftMax: n });
  },
  setDraftMin: (val) => {
    const n = Math.max(0, Math.min(64, Number(val) || 1));
    localStorage.setItem('jarvis:draftMin', String(n));
    set({ draftMin: n });
  },
  setDraftPMin: (val) => {
    const n = Math.max(0, Math.min(1, Number(val) || 0));
    localStorage.setItem('jarvis:draftPMin', String(n));
    set({ draftPMin: n });
  },

  addRecentModel: (modelPath) => {
    const { recentModels } = get();
    const label = getModelLabel(modelPath);
    const updated = [label, ...recentModels.filter((m) => m !== label)].slice(0, 10);
    localStorage.setItem('jarvis:recentModels', JSON.stringify(updated));
    set({ recentModels: updated });
  },

  fetchMemoryEstimate: async (backendUrl, modelSizeMB, gpuLayers, ctxSize) => {
    try {
      const res = await fetch(`${backendUrl}/api/models/memory-estimate?modelSizeMB=${modelSizeMB || 0}&gpuLayers=${gpuLayers || 0}&ctxSize=${ctxSize || 4096}`);
      if (res.ok) {
        const data = await res.json();
        set({ memoryEstimate: data });
      }
    } catch {}
  },

  fetchLlamaStats: async (backendUrl) => {
    try {
      const res = await fetch(`${backendUrl}/api/models/stats`);
      if (res.ok) {
        const data = await res.json();
        set({ llamaStats: data });
      }
    } catch {}
  },

  fetchModels: async (backendUrl) => {
    try {
      emitThinking({ type: 'tool_execution', message: 'Checking local GGUF models' });
      const res = await fetch(`${backendUrl}/api/models`);
      const data = await res.json();
      const status = normalizeStatus(data.serverStatus || data.status);
      const state = get();
      // Use backend's active provider — don't fall back to stale in-memory state
      const backendProviderId = data.activeProviderId ?? null;
      const backendProviderModel = data.activeProviderModel ?? null;
      const hasProvider = !!(backendProviderId && backendProviderModel);
      const newActiveModel = data.currentModel
        ? data.currentModel
        : hasProvider
          ? `provider:${backendProviderId}:${backendProviderModel}`
          : null;
      set({
        models: data.models || [],
        serverStatus: status,
        serverInfo: {
          backend: data.backend,
          multimodal: !!data.multimodal,
        },
        ...(data.appliedSettings ? { appliedSettings: data.appliedSettings } : {}),
        activeModel: newActiveModel,
        ...(status === 'ready' ? { loadProgress: '', errorMessage: '' } : {}),
        providers: data.providers || [],
        // Always trust the backend's active provider — never fall back to stale
        // in-memory state. If the backend says null, the provider was removed.
        activeProviderId: data.activeProviderId ?? null,
        activeProviderModel: data.activeProviderModel ?? null,
      });
      if (status === 'ready') {
        get().fetchMemoryEstimate(backendUrl);
      }
    } catch {
      set({ models: [] });
      emitThinking({ type: 'done', message: 'Model scan failed' });
    }
  },

  loadModel: async (backendUrl, modelPath) => {
    const { gpuLayers, ctxSize, threads, batchSize, flashAttn, mlock, kvCacheOffload, mmap, concurrentGens, draftModel, draftGpuLayers, draftMax, draftMin, draftPMin } = get();
    set({
      stoppedByUser: false,
      serverStatus: 'starting',
      loadProgress: 'Initializing llama.cpp runtime...',
      loadStages: ['Initializing llama.cpp runtime...'],
      loadPercent: 0,
      errorMessage: '',
    });
    emitThinking({ type: 'model_generation', message: `Loading ${getModelLabel(modelPath)}` });

    // Poll backend logs to extract real llama.cpp loading progress.
    // llama.cpp emits lines like "llama_model_load_internal: ... 42%"
    let pollInterval = null;
    let lastLogTs = 0;

    const pollLogs = async () => {
      try {
        const res = await fetch(`${backendUrl}/api/models/logs?limit=40&since=${lastLogTs}`);
        if (!res.ok) return;
        const data = await res.json();
        const logs = data.logs || [];
        if (!logs.length) return;
        lastLogTs = logs[logs.length - 1]?.ts || lastLogTs;

        let pct = null;
        let stage = null;
        for (const log of logs) {
          const t = log.text || '';
          const pctMatch = t.match(/(\d{1,3})%/);
          if (pctMatch) pct = Math.min(99, parseInt(pctMatch[1], 10));
          if (/llama_model_loader|loading model|load tensors/i.test(t))  stage = 'Loading model weights...';
          if (/llama_kv_cache|kv cache/i.test(t))                        stage = 'Allocating KV cache...';
          if (/llama_new_context|context.*model/i.test(t))               stage = 'Building context...';
          if (/apply.*lora|lora/i.test(t))                               stage = 'Applying LoRA...';
          if (/slot.*initialized|server.*listening/i.test(t))            stage = 'Finalizing...';
        }

        const update = {};
        if (pct !== null) update.loadPercent = pct;
        if (stage) {
          update.loadProgress = stage;
          const s = get().loadStages;
          if (!s.includes(stage)) update.loadStages = [...s, stage];
        }
        if (Object.keys(update).length) set(update);
      } catch {}
    };

    pollInterval = setInterval(pollLogs, 600);

    try {
      const res = await fetch(`${backendUrl}/api/models/load`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: modelPath, gpuLayers, ctxSize, threads, batchSize, flashAttn, mlock, kvCacheOffload, mmap, concurrentGens, draftModel, draftGpuLayers, draftMax, draftMin, draftPMin }),
      });
      const data = await res.json();
      clearInterval(pollInterval);
      if (data.superseded) return;
      if (data.error) {
        set({ serverStatus: 'error', errorMessage: data.error, loadProgress: '', loadPercent: 0 });
        emitThinking({ type: 'done', message: `Model load failed: ${data.error}` });
      } else if (data.ready) {
        set({
          serverStatus: 'ready',
          activeModel: modelPath,
          serverInfo: {
            backend: data.backend,
            multimodal: !!data.multimodal,
          },
          loadProgress: '',
          loadStages: ['Runtime ready.'],
          loadPercent: 100,
          appliedSettings: data.appliedSettings,
          llamaStats: { ...get().llamaStats, contextSize: data.ctxSize ?? ctxSize },
        });
        get().addRecentModel(modelPath);
        get().fetchMemoryEstimate(backendUrl);
        emitThinking({ type: 'done', message: `Model ready: ${getModelLabel(modelPath)}` });
      } else if (data.status === 'error') {
        set({ serverStatus: 'error', errorMessage: data.error || 'Runtime failed', loadProgress: '', loadPercent: 0, activeModel: null });
      } else {
        set({ serverStatus: 'loading', activeModel: modelPath, loadProgress: 'Waiting for model initialization...' });
      }
    } catch (err) {
      clearInterval(pollInterval);
      set({ serverStatus: 'error', errorMessage: err.message, loadProgress: '', loadPercent: 0 });
    }
  },

  checkHealth: async (backendUrl) => {
    if (get().stoppedByUser) return;
    try {
      const res = await fetch(`${backendUrl}/api/models/status`);
      const data = await res.json();
      const now = Date.now();
      const current = get();
      let status = normalizeStatus(data.status);
      if (data.connected) status = 'ready';
      if ((current.serverStatus === 'starting' || current.serverStatus === 'loading') && status === 'offline') {
        status = 'starting';
      }
      // If a provider is active AND llama is offline, stay ready
      // (provider handles inference, llama isn't needed)
      // But only if the backend still reports an active provider.
      const backendHasProvider = !!(data.activeProviderId);
      if (backendHasProvider && status === 'offline') {
        set({ lastHealthCheck: now });
        return;
      }
      set({
        serverStatus: status,
        lastHealthCheck: now,
        serverInfo: {
          backend: data.backend,
          multimodal: !!data.multimodal,
        },
        ...(data.appliedSettings ? { appliedSettings: data.appliedSettings } : {}),
        ...(data.currentModel ? { activeModel: data.currentModel } : {}),
        ...(status === 'ready' ? { loadProgress: '', errorMessage: '' } : {}),
        // Sync provider state from status endpoint if available
        ...(('activeProviderId' in data) ? {
          activeProviderId: data.activeProviderId ?? null,
          activeProviderModel: data.activeProviderModel ?? null,
        } : {}),
      });
      if (status === 'ready') {
        get().fetchLlamaStats(backendUrl);
        get().fetchMemoryEstimate(backendUrl);
      }
    } catch {
      // Don't flip to offline if the backend itself reports an active provider
      if (!get().activeProviderId) {
        set({ serverStatus: 'offline', lastHealthCheck: Date.now() });
      }
    }
  },

  selectProviderModel: async (backendUrl, providerId, modelId) => {
    try {
      const res = await fetch(`${backendUrl}/api/providers/active`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ providerId, modelId }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      set({
        activeProviderId: providerId,
        activeProviderModel: modelId,
        serverStatus: 'ready',
        activeModel: `provider:${providerId}:${modelId}`,
        loadProgress: '',
        errorMessage: '',
      });
      return true;
    } catch (err) {
      set({ errorMessage: err.message });
      return false;
    }
  },

  clearProviderModel: async (backendUrl) => {
    try {
      await fetch(`${backendUrl}/api/providers/active`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ providerId: null, modelId: null }),
      });
    } catch {}
    set({ activeProviderId: null, activeProviderModel: null });
  },

  stopModel: async (backendUrl) => {
    set({ stoppedByUser: true, serverStatus: 'offline', activeModel: null, loadProgress: '', loadStages: [], errorMessage: '', memoryEstimate: null });
    try {
      await fetch(`${backendUrl}/api/models/stop`, { method: 'POST', signal: AbortSignal.timeout(6000) });
    } catch {}
  },

  setAppliedSettings: (settings) => set({ appliedSettings: settings }),

  fetchAppliedSettings: async (backendUrl) => {
    try {
      const res = await fetch(`${backendUrl}/api/models/applied-settings`);
      if (res.ok) {
        const data = await res.json();
        set({
          appliedSettings: data.settings,
          serverInfo: {
            backend: data.backend,
            multimodal: !!data.multimodal,
          },
          ...(data.currentModel ? { activeModel: data.currentModel } : {}),
          serverStatus: normalizeStatus(data.serverStatus),
        });
      }
    } catch {}
  },

  reloadModel: async (backendUrl) => {
    const { gpuLayers, ctxSize, threads, batchSize, flashAttn, mlock, kvCacheOffload, mmap, concurrentGens, draftModel, draftGpuLayers, draftMax, draftMin, draftPMin } = get();
    set({ isReloading: true, loadProgress: 'Restarting runtime...', loadStages: ['Restarting runtime...'] });
    emitThinking({ type: 'model_generation', message: 'Reloading runtime settings' });
    try {
      const res = await fetch(`${backendUrl}/api/models/reload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gpuLayers, ctxSize, threads, batchSize, flashAttn, mlock, kvCacheOffload, mmap, concurrentGens, draftModel, draftGpuLayers, draftMax, draftMin, draftPMin }),
      });
      const data = await res.json();
      if (data.superseded) { set({ isReloading: false }); return; }
      if (data.error) {
        set({ isReloading: false, serverStatus: 'error', errorMessage: data.error, loadProgress: '' });
      } else if (data.ready) {
        set({
          isReloading: false, stoppedByUser: false,
          appliedSettings: data.appliedSettings, serverStatus: 'ready',
          serverInfo: {
            backend: data.backend,
            multimodal: !!data.multimodal,
          },
          activeModel: data.currentModel || get().activeModel,
          loadProgress: '', loadStages: ['Runtime ready.'],
          llamaStats: { ...get().llamaStats, contextSize: data.ctxSize ?? ctxSize },
        });
        get().fetchMemoryEstimate(backendUrl);
      } else if (data.status === 'error') {
        set({ isReloading: false, serverStatus: 'error', errorMessage: data.error || 'Runtime failed', loadProgress: '' });
      } else {
        set({ isReloading: false, serverStatus: 'starting', loadProgress: 'Waiting for runtime...' });
      }
    } catch (err) {
      set({ isReloading: false, serverStatus: 'error', errorMessage: err.message, loadProgress: '' });
    }
  },
}));

function getModelLabel(modelPath) {
  return typeof modelPath === 'string'
    ? modelPath.replace('.gguf', '').split(/[\\/]/).pop()
    : modelPath?.name || 'model';
}

function normalizeStatus(status) {
  if (status === 'running' || status === 'ready') return 'ready';
  if (status === 'starting') return 'starting';
  if (status === 'loading') return 'loading';
  if (status === 'error') return 'error';
  return 'offline';
}

export default useModelStore;
