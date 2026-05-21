import { readdir, stat, access } from 'fs/promises';
import { join, resolve, dirname, basename } from 'path';
import { spawn, execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { runtimeStats } from './chat.js';
import { listModelsFromDirectory, collectGgufEntries } from '../services/modelCatalog.js';
import { mkdirSync, existsSync } from 'fs';
import { getProjectRoot } from '../utils/root.js';
import { listProviders } from '../services/providerService.js';
import {
  getLinkedModelDirs,
  getRawLinkedModelDirs,
  addLinkedModelDir,
  removeLinkedModelDir,
} from '../services/modelDirs.js';
import { readSettings, updateSettings } from '../services/settingsStore.js';

const DEFAULT_RUNTIME_SETTINGS = Object.freeze({
  gpuLayers: parseInt(process.env.JARVIS_GPU_LAYERS || '0', 10),
  ctxSize: parseInt(process.env.JARVIS_CTX_SIZE || '4096', 10),  // 4096 default
  threads: parseInt(process.env.JARVIS_THREADS || '0', 10),
  batchSize: parseInt(process.env.JARVIS_BATCH_SIZE || '512', 10),
  flashAttn: process.env.JARVIS_FLASH_ATTN === '1' || process.env.JARVIS_FLASH_ATTN === 'true',
  mlock: process.env.JARVIS_MLOCK === '1' || process.env.JARVIS_MLOCK === 'true',
  kvCacheOffload: process.env.JARVIS_KV_CACHE_OFFLOAD !== '0',
  mmap: process.env.JARVIS_MMAP !== '0',
  concurrentGens: parseInt(process.env.JARVIS_CONCURRENT_GENS || '1', 10),
  port: parseInt(process.env.JARVIS_PORT || '6969', 10),
  draftModel: '',
  draftGpuLayers: parseInt(process.env.JARVIS_DRAFT_GPU_LAYERS || '0', 10),
  draftMax: parseInt(process.env.JARVIS_DRAFT_MAX || '8', 10),
  draftMin: parseInt(process.env.JARVIS_DRAFT_MIN || '1', 10),
  draftPMin: parseFloat(process.env.JARVIS_DRAFT_P_MIN || '0.5'),
});

let currentCtxSize = DEFAULT_RUNTIME_SETTINGS.ctxSize;

// ── Persist last loaded model so it survives restarts ────────────────────────
async function saveLastModel(model, settings) {
  try {
    await updateSettings({ lastModel: model || null, lastModelSettings: settings || null });
  } catch {}
}

async function loadLastModel() {
  try {
    const s = await readSettings();
    return { model: s.lastModel || null, settings: s.lastModelSettings || null };
  } catch { return { model: null, settings: null }; }
}

// Auto-restore on startup (after a short delay so the server is ready)
setTimeout(async () => {
  try {
    const { model, settings: savedSettings } = await loadLastModel();
    if (!model || stoppedByUser) return;
    const modelPath = await resolveModelPath(MODELS_DIR, model);
    if (!modelPath) return;
    const settings = normalizeRuntimeSettings(savedSettings || {}, DEFAULT_RUNTIME_SETTINGS);
    pushLog('info', `[auto-restore] Reloading last model: ${model}`);
    const backend = await detectLlamaBackend();
    killLlama(settings.port);
    await waitForPortFree(settings.port);
    const args = buildLlamaArgs({ modelPath, mmprojPath: null, draftPath: null, settings, backend });
    const launchId = ++activeLaunchId;
    llamaProcess = spawn(LLAMA_BIN, args, { stdio: 'pipe', windowsHide: true });
    currentModel = basename(modelPath);
    serverStatus = 'starting';
    currentArgs = args;
    llamaProcess.stdout?.on('data', (d) => pushLog('info', d.toString()));
    llamaProcess.stderr?.on('data', (d) => pushLog('info', d.toString()));
    llamaProcess.on('error', (err) => {
      if (launchId !== activeLaunchId) return;
      pushLog('error', `auto-restore spawn error: ${err.message}`);
      serverStatus = 'error'; llamaProcess = null;
    });
    llamaProcess.on('close', (code) => {
      if (launchId !== activeLaunchId) return;
      pushLog('info', `auto-restore: llama-server exited ${code}`);
      serverStatus = 'stopped'; currentModel = null; llamaProcess = null;
    });
    const ok = await waitForLlama(settings.port, 60000);
    if (launchId !== activeLaunchId) return;
    if (ok) {
      serverStatus = 'running';
      appliedSettings = { ...settings };
      currentCtxSize = settings.ctxSize;
      runtimeStats.contextSize = settings.ctxSize;
      pushLog('info', `[auto-restore] ${model} ready`);
    } else {
      serverStatus = 'error';
      pushLog('error', `[auto-restore] ${model} failed to start`);
    }
  } catch (e) {
    pushLog('error', `[auto-restore] failed: ${e.message}`);
  }
}, 2000);

// Writable user dir (models, runtime configs)
const ROOT = getProjectRoot();
const MODELS_DIR = join(ROOT, 'models');
// Bundled binaries (llama.cpp). In packaged builds these live alongside the
// Electron app's resources, NOT in the user's data dir. JARVIS_BIN_ROOT
// points at the install dir; falls back to JARVIS_ROOT in dev.
const BIN_ROOT = process.env.JARVIS_BIN_ROOT || ROOT;
const LLAMA_DIR  = join(BIN_ROOT, 'llama-cpp');
const IS_WIN     = process.platform === 'win32';
const LLAMA_BIN  = join(LLAMA_DIR, IS_WIN ? 'llama-server.exe' : 'llama-server');
const LLAMA_URL = process.env.LLAMA_URL || 'http://127.0.0.1:6969';

let llamaProcess = null;
let currentModel = null;
let currentDraft = null;     // basename of active draft model (or null)
let serverStatus = 'stopped'; // stopped | starting | running | error
let stoppedByUser = false;    // ← guard: prevents health checks from reviving a user-stopped server
let appliedSettings = { ...DEFAULT_RUNTIME_SETTINGS };
let currentMmproj = null;
let activeLaunchId = 0;

/* ── Server log ring buffer (last 500 lines) ── */
const MAX_LOGS = 500;
const serverLogs = [];  // { ts, level, text }
let currentArgs = null; // last launch args for display

// ── Startup cleanup: kill any stale llama-server from a previous session ──
// Runs after killPort is defined (see below). Prevents "Port still in use" errors.

function pushLog(level, text) {
  const lines = text.split('\n').filter(Boolean);
  for (const line of lines) {
    serverLogs.push({ ts: Date.now(), level, text: line });
  }
  if (serverLogs.length > MAX_LOGS) serverLogs.splice(0, serverLogs.length - MAX_LOGS);
}

function normalizeRuntimeSettings(input = {}, prev = DEFAULT_RUNTIME_SETTINGS) {
  return {
    gpuLayers: clampNumber(input.gpuLayers, prev.gpuLayers, 0, 999),
    ctxSize: clampNumber(input.ctxSize, prev.ctxSize, 512, 1048576),
    threads: clampNumber(input.threads, prev.threads, 0, 256),
    batchSize: clampNumber(input.batchSize, prev.batchSize, 1, 1048576),
    flashAttn: input.flashAttn !== undefined ? !!input.flashAttn : prev.flashAttn,
    mlock: input.mlock !== undefined ? !!input.mlock : prev.mlock,
    kvCacheOffload: input.kvCacheOffload !== undefined ? !!input.kvCacheOffload : prev.kvCacheOffload,
    mmap: input.mmap !== undefined ? !!input.mmap : prev.mmap,
    concurrentGens: clampNumber(input.concurrentGens, prev.concurrentGens, 1, 256),
    port: clampNumber(input.port, prev.port, 1, 65535),
    draftModel:     typeof input.draftModel === 'string' ? input.draftModel : (prev.draftModel || ''),
    draftGpuLayers: clampNumber(input.draftGpuLayers, prev.draftGpuLayers, 0, 999),
    draftMax:       clampNumber(input.draftMax, prev.draftMax, 1, 64),
    draftMin:       clampNumber(input.draftMin, prev.draftMin, 0, 64),
    draftPMin:      clampFloat(input.draftPMin, prev.draftPMin, 0, 1),
  };
}

function clampFloat(value, fallback, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function clampNumber(value, fallback, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(n)));
}

function settingsForClient(settings) {
  const { port, ...rest } = settings || {};
  return rest;
}

async function detectLlamaBackend() {
  const candidates = [
    { name: 'vulkan', file: join(LLAMA_DIR, IS_WIN ? 'ggml-vulkan.dll' : 'libggml-vulkan.so') },
    { name: 'cuda', file: join(LLAMA_DIR, IS_WIN ? 'ggml-cuda.dll' : 'libggml-cuda.so') },
    { name: 'hip', file: join(LLAMA_DIR, IS_WIN ? 'ggml-hip.dll' : 'libggml-hip.so') },
    { name: 'metal', file: join(LLAMA_DIR, 'libggml-metal.dylib') },
  ];
  for (const candidate of candidates) {
    try {
      await access(candidate.file);
      return candidate.name;
    } catch {}
  }
  return 'cpu';
}

function buildLlamaArgs({ modelPath, mmprojPath, draftPath, settings, backend }) {
  const args = [
    '-m', modelPath,
    '--host', '127.0.0.1',
    '--port', String(settings.port),
    '--ctx-size', String(settings.ctxSize),
    '-ngl', String(settings.gpuLayers),
    '--no-warmup',          // skip warmup — faster startup
    '--log-disable',        // suppress verbose logs — less noise
  ];
  if (backend === 'vulkan') args.push('--fit', 'off');
  if (mmprojPath) args.push('--mmproj', mmprojPath);
  if (settings.threads > 0) args.push('--threads', String(settings.threads));
  if (settings.batchSize > 0) args.push('-b', String(settings.batchSize));
  args.push('--flash-attn', settings.flashAttn ? 'on' : 'off');
  if (settings.mlock) args.push('--mlock');
  if (!settings.kvCacheOffload) args.push('--no-kv-offload');
  if (!settings.mmap) args.push('--no-mmap');
  if (settings.concurrentGens > 1) {
    args.push('-np', String(settings.concurrentGens));
    args.push('--cont-batching');
  }
  // Speculative decoding
  if (draftPath) {
    args.push('--spec-type', 'draft-simple');
    args.push('-md', draftPath);
    args.push('-ngld', String(settings.draftGpuLayers || 0));
    args.push('--spec-draft-n-max', String(settings.draftMax || 8));
    args.push('--spec-draft-n-min', String(settings.draftMin || 1));
    args.push('--spec-draft-p-min', String(settings.draftPMin ?? 0.5));
  }
  return args;
}

function logSettings(settings) {
  pushLog('info', `Applying ctx-size: ${settings.ctxSize}`);
  pushLog('info', `Applying gpu-layers: ${settings.gpuLayers}`);
  pushLog('info', `Applying threads: ${settings.threads}`);
  pushLog('info', `Applying batch-size: ${settings.batchSize}`);
  pushLog('info', `Applying flash-attn: ${settings.flashAttn ? 'on' : 'off'}`);
  pushLog('info', `Applying mlock: ${settings.mlock ? 'on' : 'off'}`);
  pushLog('info', `Applying kv-cache-offload: ${settings.kvCacheOffload ? 'on' : 'off'}`);
  pushLog('info', `Applying mmap: ${settings.mmap ? 'on' : 'off'}`);
  pushLog('info', `Applying concurrent-gens: ${settings.concurrentGens}`);
}

export async function modelsRoute(req, url) {
  const path = url.pathname;
  const method = req.method;

  // GET /api/models — list GGUF files + provider models
  if (path === '/api/models' && method === 'GET') {
    const [models, providerData] = await Promise.all([
      listModels(),
      listProviders().catch(() => ({ providers: [], activeProviderId: null, activeModel: null })),
    ]);
    await refreshLlamaStatus();
    const backend = await detectLlamaBackend();
    if (serverStatus === 'running' && !currentModel && models.length > 0) {
      currentModel = models[0].filename;
    }
    return Response.json({
      models,
      currentModel,
      currentDraft,
      serverStatus,
      modelsDir: MODELS_DIR,
      backend,
      multimodal: !!currentMmproj,
      drafting: !!currentDraft,
      appliedSettings: settingsForClient(appliedSettings),
      currentArgs,
      providers: providerData.providers,
      activeProviderId: providerData.activeProviderId,
      activeProviderModel: providerData.activeModel,
    });
  }

  // GET /api/models/status — llama-server health
  if (path === '/api/models/status' && method === 'GET') {
    const alive = await refreshLlamaStatus();
    const backend = await detectLlamaBackend();
    return Response.json({
      connected: alive,
      status: serverStatus,
      currentModel,
      currentDraft,
      modelsDir: MODELS_DIR,
      backend,
      multimodal: !!currentMmproj,
      drafting: !!currentDraft,
      appliedSettings: settingsForClient(appliedSettings),
      currentArgs,
    });
  }

  // POST /api/models/load — start llama-server with a model
  if (path === '/api/models/load' && method === 'POST') {
    const body = await req.json();
    const { model } = body;
    const settings = normalizeRuntimeSettings(body, appliedSettings);
    if (!model) return Response.json({ error: 'model filename required' }, { status: 400 });

    // ← Clear the user-stop guard when a new load is requested
    stoppedByUser = false;

    // Resolve model path (handle subdirectories via recursive scan)
    const modelPath = await resolveModelPath(MODELS_DIR, model);
    if (!modelPath) {
      return Response.json({ error: `Model not found: ${model}` }, { status: 404 });
    }

    const backend = await detectLlamaBackend();
    pushLog('info', `Detected llama.cpp backend: ${backend}`);
    pushLog('info', 'Restarting runtime...');
    logSettings(settings);

    if (settings.gpuLayers > 0 && backend === 'cpu') {
      const msg = 'GPU layers requested, but this llama.cpp build only has CPU backend support';
      pushLog('error', msg);
      return Response.json({ error: msg }, { status: 500 });
    }

    // Kill existing server and wait for port to be free
    killLlama(settings.port);
    const portFree = await waitForPortFree(settings.port);
    if (!portFree) {
      pushLog('error', `Port ${settings.port} still in use after kill — cannot start runtime`);
      return Response.json({ error: `Port ${settings.port} is still in use. Kill the process holding it and try again.` }, { status: 500 });
    }

    // Auto-detect companion mmproj (recursive scan for subdirectory models)
    let mainModel = modelPath;
    let mmprojArg = null;
    try {
      const modelIsMmproj = /mmproj|vision|multimodal/i.test(model);
      const stripName = (name) => name
        .replace(/\.gguf$/i, '')
        .replace(/^mmproj[-_]/i, '')
        .replace(/[-_.](?:it|mmproj|vision|multimodal|vl)[-_.][^.]+$/i, '')
        .toLowerCase();
      const core = stripName(model);
      const allGgufEntries = await collectAllGgufEntries();
      const allGguf = allGgufEntries.filter((e) => basename(e.path) !== model);
      for (const entry of allGguf) {
        const f = basename(entry.path);
        const fCore = stripName(f);
        if (fCore !== core) continue;
        if (/mmproj|vision|multimodal/i.test(f)) mmprojArg = entry.path;
        else if (modelIsMmproj) mmprojArg = modelPath;
      }
      // If user clicked the mmproj file, use the found main model as -m
      if (modelIsMmproj && mmprojArg === modelPath) {
        for (const entry of allGguf) {
          const f = basename(entry.path);
          if (!/mmproj|vision|multimodal/i.test(f)) {
            const fCore = stripName(f);
            if (fCore === core) { mainModel = entry.path; break; }
          }
        }
      }
    } catch {}

    // Auto-increase ctx size for multimodal models (vision needs ~8K+ context)
    if (mmprojArg && settings.ctxSize < 8192) {
      pushLog('info', `Multimodal model detected — increasing ctx-size from ${settings.ctxSize} to 8192`);
      settings.ctxSize = 8192;
    }

    // Resolve draft model path if drafting is enabled
    let draftPath = null;
    if (settings.draftModel) {
      draftPath = await resolveModelPath(MODELS_DIR, settings.draftModel);
      if (!draftPath) {
        pushLog('warn', `Draft model not found: ${settings.draftModel} — drafting disabled`);
      } else {
        pushLog('info', `Drafting with ${basename(draftPath)} (max=${settings.draftMax}, min=${settings.draftMin}, p=${settings.draftPMin})`);
      }
    }

    const args = buildLlamaArgs({ modelPath: mainModel, mmprojPath: mmprojArg, draftPath, settings, backend });
    pushLog('info', 'Launching llama-server...');
    if (backend === 'vulkan') pushLog('info', 'Disabling llama.cpp auto-fit for Vulkan to avoid known scheduler assertion');

    try {
      let spawnError = null;
      const launchId = ++activeLaunchId;
      llamaProcess = spawn(LLAMA_BIN, args, { stdio: 'pipe', windowsHide: true });
      currentModel = basename(mainModel);
      currentMmproj = mmprojArg || null;
      currentDraft = draftPath ? basename(draftPath) : null;
      serverStatus = 'starting';
      currentArgs = args;

      // Capture stdout / stderr into the log buffer
      let recentStderr = '';
      llamaProcess.stdout?.on('data', (d) => pushLog('info', d.toString()));
      llamaProcess.stderr?.on('data', (d) => {
        const s = d.toString();
        pushLog('info', s);
        recentStderr += s;
        if (recentStderr.length > 5000) recentStderr = recentStderr.slice(-2000);
      });

      llamaProcess.on('error', (err) => {
        if (launchId !== activeLaunchId) return;
        spawnError = err.message;
        pushLog('error', `spawn error: ${err.message}`);
        console.error('[llama-server] spawn error:', err.message);
        serverStatus = 'error';
        llamaProcess = null;
      });

      const exitInfo = { code: null, signal: null };
      llamaProcess.on('close', (code, signal) => {
        if (launchId !== activeLaunchId) return;
        exitInfo.code = code;
        exitInfo.signal = signal;
        pushLog('info', `llama-server exited with code ${code} signal ${signal}`);
        console.log('[llama-server] exited with code', code, 'signal', signal);
        if (!spawnError) serverStatus = 'stopped';
        currentModel = null;
        llamaProcess = null;
      });

      // Wait for llama-server to be ready
      const healthOk = await waitForLlama(settings.port, 30000);

      // If another load/reload superseded this one, don't touch state
      if (launchId !== activeLaunchId) {
        return Response.json({ success: false, superseded: true, status: serverStatus });
      }

      let ready = healthOk && llamaProcess !== null;

      // Build a descriptive error from the exit info
      let loadError = spawnError;
      if (!ready && !loadError && exitInfo.code !== null) {
        const tail = recentStderr.split('\n').filter(Boolean).slice(-5).join(' | ');
        if (exitInfo.code === null && exitInfo.signal) {
          loadError = `llama-server was killed (signal ${exitInfo.signal})`;
        } else if (exitInfo.code !== 0) {
          loadError = `llama-server exited with code ${exitInfo.code}${tail ? ': ' + tail : ''}`;
        } else if (healthOk) {
          loadError = 'Port may still be in use — another process is holding it';
        } else {
          loadError = tail ? `llama-server exited unexpectedly: ${tail}` : 'llama-server exited unexpectedly';
        }
      }
      if (!ready && !loadError && healthOk) {
        loadError = 'Port may still be in use — another process is holding it';
      }

      if (ready) {
        serverStatus = 'running';
        appliedSettings = { ...settings };
        currentCtxSize = settings.ctxSize;
        runtimeStats.contextSize = settings.ctxSize;
        pushLog('info', 'Runtime ready');
        await saveLastModel(currentModel, settings);
      } else if (loadError) {
        serverStatus = 'error';
        pushLog('error', `llama-server load failed: ${loadError}`);
      } else {
        serverStatus = 'starting';
      }

      return Response.json({
        success: true,
        model,
        status: serverStatus,
        ready,
        error: loadError,
        multimodal: !!mmprojArg,
        backend,
        ctxSize: currentCtxSize,
        appliedSettings: settingsForClient(appliedSettings),
        args,
      });
    } catch (err) {
      serverStatus = 'error';
      return Response.json({ error: err.message }, { status: 500 });
    }
  }

  // GET /api/models/stats — token/context usage
  if (path === '/api/models/stats' && method === 'GET') {
    return Response.json({
      tokensPerSecond: runtimeStats.tokensPerSecond,
      totalTokens: runtimeStats.totalTokens,
      contextUsed: runtimeStats.contextUsed,
      contextSize: currentCtxSize,
    });
  }

  // GET /api/models/logs — return captured llama-server log lines
  if (path === '/api/models/logs' && method === 'GET') {
    const since = Number(url.searchParams.get('since') || 0);
    const limit = Math.min(Number(url.searchParams.get('limit') || 200), 500);
    const filtered = since ? serverLogs.filter((l) => l.ts > since) : serverLogs.slice(-limit);
    const backend = await detectLlamaBackend();
    return Response.json({
      logs: filtered,
      total: serverLogs.length,
      model: currentModel,
      status: serverStatus,
      backend,
      args: currentArgs,
    });
  }

  // POST /api/models/stop — kill llama-server
  if (path === '/api/models/stop' && method === 'POST') {
    stoppedByUser = true;
    killLlama();
    await saveLastModel(null, null); // clear saved model — user explicitly stopped
    // Wait up to 4s for the process to actually die
    let waited = 0;
    while (llamaProcess && waited < 4000) {
      await new Promise((r) => setTimeout(r, 200));
      waited += 200;
    }
    return Response.json({ success: true, status: serverStatus });
  }

  // POST /api/models/reload — restart llama-server with new settings
  if (path === '/api/models/reload' && method === 'POST') {
    const body = await req.json();
    const settings = normalizeRuntimeSettings({ ...body, port: body.port ?? appliedSettings.port }, appliedSettings);

    if (!currentModel) {
      return Response.json({ error: 'No model loaded. Load a model first.' }, { status: 400 });
    }

    const modelName = currentModel;
    const modelPath = await resolveModelPath(MODELS_DIR, modelName) || join(MODELS_DIR, modelName);
    const mmprojPath = currentMmproj;

    const backend = await detectLlamaBackend();
    pushLog('info', `Detected llama.cpp backend: ${backend}`);
    pushLog('info', 'Restarting runtime...');
    logSettings(settings);

    if (settings.gpuLayers > 0 && backend === 'cpu') {
      const msg = 'GPU layers requested, but this llama.cpp build only has CPU backend support';
      pushLog('error', msg);
      return Response.json({ error: msg }, { status: 500 });
    }

    // Clear the user-stop guard — user is explicitly reloading
    stoppedByUser = false;

    // Kill existing server
    killLlama(settings.port);
    const portFree = await waitForPortFree(settings.port);
    if (!portFree) {
      pushLog('error', `Port ${settings.port} still in use after kill — cannot restart runtime`);
      return Response.json({ error: `Port ${settings.port} is still in use. Kill the process holding it and try again.` }, { status: 500 });
    }

    // Restore model name (killLlama nullifies it)
    currentModel = modelName;
    currentMmproj = mmprojPath;

    // Auto-increase ctx size for multimodal models
    if (mmprojPath && settings.ctxSize < 8192) {
      pushLog('info', `Multimodal model detected — increasing ctx-size from ${settings.ctxSize} to 8192`);
      settings.ctxSize = 8192;
    }

    // Resolve draft model path if drafting is enabled
    let draftPath = null;
    if (settings.draftModel) {
      draftPath = await resolveModelPath(MODELS_DIR, settings.draftModel);
      if (!draftPath) {
        pushLog('warn', `Draft model not found: ${settings.draftModel} — drafting disabled`);
      } else {
        pushLog('info', `Drafting with ${basename(draftPath)} (max=${settings.draftMax}, min=${settings.draftMin}, p=${settings.draftPMin})`);
      }
    }
    currentDraft = draftPath ? basename(draftPath) : null;

    const args = buildLlamaArgs({ modelPath, mmprojPath, draftPath, settings, backend });

    pushLog('info', 'Launching llama-server...');
    if (backend === 'vulkan') pushLog('info', 'Disabling llama.cpp auto-fit for Vulkan to avoid known scheduler assertion');

    try {
      let spawnError = null;
      let recentStderr = '';
      const launchId = ++activeLaunchId;
      llamaProcess = spawn(LLAMA_BIN, args, { stdio: 'pipe', windowsHide: true });
      serverStatus = 'starting';
      currentArgs = args;

      llamaProcess.stdout?.on('data', (d) => pushLog('info', d.toString()));
      llamaProcess.stderr?.on('data', (d) => {
        const s = d.toString();
        pushLog('info', s);
        recentStderr += s;
        if (recentStderr.length > 5000) recentStderr = recentStderr.slice(-2000);
      });

      llamaProcess.on('error', (err) => {
        if (launchId !== activeLaunchId) return;
        spawnError = err.message;
        pushLog('error', `spawn error: ${err.message}`);
        serverStatus = 'error';
        llamaProcess = null;
      });

      const exitInfo = { code: null, signal: null };
      llamaProcess.on('close', (code, signal) => {
        if (launchId !== activeLaunchId) return;
        exitInfo.code = code;
        exitInfo.signal = signal;
        pushLog('info', `llama-server exited with code ${code} signal ${signal}`);
        if (!spawnError) serverStatus = 'stopped';
        currentModel = null;
        llamaProcess = null;
      });

      const healthOk = await waitForLlama(settings.port, 30000);

      // If another load/reload superseded this one, don't touch state
      if (launchId !== activeLaunchId) {
        return Response.json({ success: false, superseded: true, status: serverStatus });
      }

      let ready = healthOk && llamaProcess !== null;

      let loadError = spawnError;
      if (!ready && !loadError && exitInfo.code !== null) {
        const tail = recentStderr.split('\n').filter(Boolean).slice(-5).join(' | ');
        if (exitInfo.code === null && exitInfo.signal) {
          loadError = `llama-server was killed (signal ${exitInfo.signal})`;
        } else if (exitInfo.code !== 0) {
          loadError = `llama-server exited with code ${exitInfo.code}${tail ? ': ' + tail : ''}`;
        } else if (healthOk) {
          loadError = 'Port may still be in use — another process is holding it';
        } else {
          loadError = tail ? `llama-server exited unexpectedly: ${tail}` : 'llama-server exited unexpectedly';
        }
      }
      if (!ready && !loadError && healthOk) {
        loadError = 'Port may still be in use — another process is holding it';
      }

      if (ready) {
        serverStatus = 'running';
        appliedSettings = { ...settings };
        currentCtxSize = settings.ctxSize;
        runtimeStats.contextSize = settings.ctxSize;
        pushLog('info', 'Runtime ready');
        await saveLastModel(currentModel, settings);
      } else if (loadError) {
        serverStatus = 'error';
        pushLog('error', `llama-server reload failed: ${loadError}`);
      } else {
        serverStatus = 'starting';
      }

      return Response.json({
        success: true,
        ready,
        status: serverStatus,
        currentModel,
        error: loadError,
        backend,
        appliedSettings: settingsForClient(appliedSettings),
        ctxSize: currentCtxSize,
        args,
      });
    } catch (err) {
      serverStatus = 'error';
      pushLog('error', `Reload failed: ${err.message}`);
      return Response.json({ error: err.message }, { status: 500 });
    }
  }

  // GET /api/models/applied-settings — currently active runtime settings
  if (path === '/api/models/applied-settings' && method === 'GET') {
    const backend = await detectLlamaBackend();
    return Response.json({
      settings: settingsForClient(appliedSettings),
      currentModel,
      currentDraft,
      serverStatus,
      backend,
      multimodal: !!currentMmproj,
      drafting: !!currentDraft,
      args: currentArgs,
    });
  }

  // GET /api/models/memory-estimate — estimated VRAM/RAM usage
  if (path === '/api/models/memory-estimate' && method === 'GET') {
    const modelSizeMB = Number(url.searchParams.get('modelSizeMB') || 0);
    const gpuLayers = Number(url.searchParams.get('gpuLayers') || appliedSettings.gpuLayers);
    const ctxSize = Number(url.searchParams.get('ctxSize') || appliedSettings.ctxSize);
    const totalLayers = Number(url.searchParams.get('totalLayers') || 80);

    // Estimate VRAM: model weights on GPU + KV cache (fp16 ~2 bytes per param per layer)
    const modelVRAM = modelSizeMB * Math.min(1, gpuLayers / Math.max(1, totalLayers));
    const kvCachePerTokenMB = 0.002; // ~2MB per 1K context for typical 7B model
    const kvCacheMB = ctxSize * kvCachePerTokenMB * 2; // x2 for key + value
    const vramEstimate = Math.round((modelVRAM + kvCacheMB * Math.min(1, gpuLayers / Math.max(1, totalLayers))) * 10) / 10;
    const ramEstimate = Math.round(Math.max(0, modelSizeMB - modelVRAM + kvCacheMB * (1 - Math.min(1, gpuLayers / Math.max(1, totalLayers))) + modelSizeMB * 0.05) * 10) / 10;
    const totalEstimate = Math.round((vramEstimate + ramEstimate) * 10) / 10;

    return Response.json({
      vramGB: vramEstimate / 1024,
      ramGB: ramEstimate / 1024,
      totalGB: totalEstimate / 1024,
      vramMB: vramEstimate,
      ramMB: ramEstimate,
      totalMB: totalEstimate,
    });
  }

  // GET /api/models/dirs — list linked external folders
  if (path === '/api/models/dirs' && method === 'GET') {
    const dirs = await getRawLinkedModelDirs();
    return Response.json({ defaultDir: MODELS_DIR, linkedDirs: dirs });
  }

  // POST /api/models/dirs — link a new external folder
  if (path === '/api/models/dirs' && method === 'POST') {
    try {
      const body = await req.json();
      const dir = body?.dir;
      if (!dir) return Response.json({ error: 'dir required' }, { status: 400 });
      const linked = await addLinkedModelDir(dir);
      return Response.json({ success: true, linkedDirs: linked });
    } catch (e) {
      return Response.json({ error: e.message }, { status: 400 });
    }
  }

  // DELETE /api/models/dirs — unlink an external folder
  if (path === '/api/models/dirs' && method === 'DELETE') {
    try {
      const body = await req.json();
      const dir = body?.dir;
      if (!dir) return Response.json({ error: 'dir required' }, { status: 400 });
      const linked = await removeLinkedModelDir(dir);
      return Response.json({ success: true, linkedDirs: linked });
    } catch (e) {
      return Response.json({ error: e.message }, { status: 400 });
    }
  }

  return Response.json({ error: 'Unknown models endpoint' }, { status: 404 });
}

/* ── Kill llama-server ── */
function killLlama(port) {
  // Kill by PID — only kill the child process, NOT its parent (Bun)
  if (llamaProcess && llamaProcess.pid) {
    try {
      if (IS_WIN) {
        execSync(`taskkill /F /T /PID ${llamaProcess.pid}`, { stdio: 'pipe', timeout: 5000 });
      } else {
        try { process.kill(-llamaProcess.pid, 'SIGKILL'); } catch {}
        try { llamaProcess.kill('SIGTERM'); } catch {}
      }
    } catch (e) {
      console.error('[killLlama] PID kill failed:', e.message);
    }
  }
  // Fallback: kill ANY process holding the target port
  killPort(port ?? appliedSettings.port);
  llamaProcess = null;
  currentModel = null;
  currentDraft = null;
  serverStatus = 'stopped';
}

/** Kill any process listening on a given port using netstat/Findstr */
function killPort(port) {
  try {
    if (IS_WIN) {
      // Use netstat to find ALL PIDs on this port (any state: LISTENING, TIME_WAIT, etc.)
      const ns = execSync('netstat -ano', { encoding: 'utf8', timeout: 4000 });
      const killed = new Set();
      for (const line of ns.split('\n')) {
        const m = line.match(new RegExp(`[.:]${port}\\s+.*?\\s+(\\d+)\\s*$`));
        if (!m) continue;
        const pid = m[1].trim();
        if (!pid || !/^\d+$/.test(pid)) continue;
        if (Number(pid) === process.pid) continue;
        if (killed.has(pid)) continue;
        killed.add(pid);
        try {
          execSync(`taskkill /F /T /PID ${pid}`, { stdio: 'pipe', timeout: 5000 });
          pushLog('info', `Killed stale process ${pid} on port ${port}`);
        } catch {}
      }
    } else {
      execSync(`lsof -ti:${port} | grep -v ${process.pid} | xargs kill -9 2>/dev/null`, { stdio: 'ignore', timeout: 3000 });
    }
  } catch (e) {
    console.error(`[killPort] port ${port}:`, e.message);
  }
}

/** Wait until a port is free, checking up to `maxWait` ms */
// ── Startup cleanup: kill any stale llama-server from a previous crash ──
// killPort is now defined above, so this runs safely.
setTimeout(() => {
  try { killPort(DEFAULT_RUNTIME_SETTINGS.port); } catch {}
}, 800);

function waitForPortFree(port, maxWait = 15000) {
  const start = Date.now();
  return new Promise((resolve) => {
    const check = async () => {
      if (Date.now() - start > maxWait) {
        // Last-ditch: try killing again before giving up
        killPort(port);
        return resolve(false);
      }

      // Check: verify no process is bound to the port
      let portFree = false;
      if (IS_WIN) {
        try {
          const out = execSync(`netstat -ano | findstr ":${port} "`, { encoding: 'utf8', timeout: 2000 });
          // Only consider it occupied if there's a LISTENING or ESTABLISHED line
          portFree = !out.split('\n').some(l => /LISTENING|ESTABLISHED/.test(l) && l.includes(`:${port} `));
        } catch {
          portFree = true; // findstr returns exit 1 when no match = port is free
        }
      } else {
        try { execSync(`lsof -i:${port}`, { stdio: 'ignore', timeout: 2000 }); } catch { portFree = true; }
      }

      if (!portFree) return setTimeout(check, 600);

      // Double-check: try connecting — if it fails, port is truly free
      try {
        await fetch(`http://127.0.0.1:${port}/health`, { signal: AbortSignal.timeout(800) });
        return setTimeout(check, 600); // still responding
      } catch {
        return resolve(true);
      }
    };
    setTimeout(check, 400);
  });
}

/* ── Helpers ── */

// Ensure models directory exists
if (!existsSync(MODELS_DIR)) {
  mkdirSync(MODELS_DIR, { recursive: true });
}

async function listModels() {
  const linked = await getLinkedModelDirs();
  const dirs = [MODELS_DIR, ...linked];
  const all = [];
  const seen = new Set();
  for (const dir of dirs) {
    try {
      const models = await listModelsFromDirectory(dir);
      for (const m of models) {
        // Dedupe by absolute path so the same file doesn't appear twice
        // (e.g. if a linked dir overlaps with the default models dir).
        const key = m.path || m.filename;
        if (seen.has(key)) continue;
        seen.add(key);
        all.push({ ...m, sourceDir: dir });
      }
    } catch {}
  }
  all.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  return all;
}

/** Find a model file by basename, scanning the default + all linked dirs. */
async function resolveModelPath(modelsDir, filename) {
  const linked = await getLinkedModelDirs();
  const dirs = [modelsDir, ...linked];
  for (const dir of dirs) {
    const direct = join(dir, filename);
    try { await stat(direct); return direct; } catch {}
    const all = await collectGgufEntries(dir).catch(() => []);
    for (const entry of all) {
      if (basename(entry.path) === filename) return entry.path;
    }
  }
  return null;
}

/** Collect all .gguf entries across the default + linked dirs (recursive). */
async function collectAllGgufEntries() {
  const linked = await getLinkedModelDirs();
  const dirs = [MODELS_DIR, ...linked];
  const out = [];
  const seen = new Set();
  for (const dir of dirs) {
    const entries = await collectGgufEntries(dir).catch(() => []);
    for (const e of entries) {
      if (seen.has(e.path)) continue;
      seen.add(e.path);
      out.push(e);
    }
  }
  return out;
}

async function checkLlama() {
  try {
    const res = await fetch(`${LLAMA_URL}/health`, { signal: AbortSignal.timeout(2000) });
    return res.ok;
  } catch {
    return false;
  }
}

async function refreshLlamaStatus() {
  // If user explicitly stopped the server, never mark it as running again
  if (stoppedByUser && !llamaProcess) {
    serverStatus = 'stopped';
    currentModel = null;
    return false;
  }
  const alive = await checkLlama();
  serverStatus = alive ? 'running' : (llamaProcess ? 'starting' : 'stopped');
  if (!alive && !llamaProcess) currentModel = null;
  // Probe llama-server for the *actual* context size + last usage data.
  // This is the source of truth — user-set ctxSize is just the request,
  // llama may downsize if the model has a smaller native context.
  if (alive) probeLlamaProps().catch(() => {});
  return alive;
}

let lastProbeAt = 0;
async function probeLlamaProps() {
  // Throttle to once every 4s
  const now = Date.now();
  if (now - lastProbeAt < 4000) return;
  lastProbeAt = now;
  try {
    const res = await fetch(`${LLAMA_URL}/props`, { signal: AbortSignal.timeout(2000) });
    if (!res.ok) return;
    const data = await res.json();
    // llama.cpp /props returns { default_generation_settings, total_slots, ... }
    // The real context window:
    const ctx =
      data?.default_generation_settings?.n_ctx ??
      data?.n_ctx ??
      data?.total_n_ctx ??
      null;
    if (ctx && ctx > 0) {
      currentCtxSize = ctx;
      runtimeStats.contextSize = ctx;
    }
    // Last request token usage (gives us contextUsed)
    const used =
      data?.default_generation_settings?.n_predict ??
      data?.last_n_predict ??
      null;
    // Better: pull from the per-slot info if available
    if (Array.isArray(data?.slots) && data.slots.length > 0) {
      // Sum of prompt + tokens generated on the most-recently-used slot
      const slot = data.slots[0];
      const prompt = slot?.n_prompt_tokens || slot?.prompt_tokens || 0;
      const decoded = slot?.n_decoded || slot?.tokens_evaluated || 0;
      const total = prompt + decoded;
      if (total > 0) runtimeStats.contextUsed = total;
    }
  } catch {}
}

function waitForLlama(port, timeout) {
  return new Promise((resolve) => {
    const start = Date.now();
    const check = async () => {
      try {
        const res = await fetch(`http://127.0.0.1:${port}/health`, { signal: AbortSignal.timeout(1000) });
        if (res.ok) return resolve(true);
      } catch {}
      if (Date.now() - start > timeout) return resolve(false);
      setTimeout(check, 1000);
    };
    check();
  });
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
