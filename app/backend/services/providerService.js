/**
 * Provider Service — manages OpenAI-compatible and Ollama backends.
 *
 * Supports:
 *   - openai     : OpenAI, Groq, Together, Mistral, DeepSeek, etc.
 *   - openai-compat : LM Studio, vLLM, llama.cpp, anything that exposes /v1/chat/completions
 *   - ollama     : native Ollama API
 *   - anthropic  : Claude API (uses x-api-key auth)
 *
 * Each provider is stored with: id, name, type, apiBase, apiKey, models, enabled.
 */
import { readFile, writeFile, mkdir } from 'fs/promises';
import { join, dirname } from 'path';
import { existsSync, mkdirSync } from 'fs';
import { getProjectRoot } from '../utils/root.js';

const ROOT = getProjectRoot();
const PROVIDERS_FILE = join(ROOT, 'runtime', 'providers.json');

const FETCH_TIMEOUT_MS = 12_000;
const STREAM_TIMEOUT_MS = 5 * 60_000;

/* ─── Storage ─────────────────────────────────────────────────────────────── */

async function loadProviders() {
  try {
    const raw = await readFile(PROVIDERS_FILE, 'utf8');
    const data = JSON.parse(raw);
    if (!Array.isArray(data.providers)) data.providers = [];
    return data;
  } catch {
    return { providers: [], activeProviderId: null, activeModel: null };
  }
}

async function saveProviders(data) {
  const dir = dirname(PROVIDERS_FILE);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  await writeFile(PROVIDERS_FILE, JSON.stringify(data, null, 2));
}

/* ─── Helpers ─────────────────────────────────────────────────────────────── */

function trimSlash(s) {
  return String(s || '').replace(/\/+$/, '');
}

/** Build auth headers for a provider, supporting OpenAI Bearer + Anthropic x-api-key. */
function buildHeaders(provider, extra = {}) {
  const headers = { 'Content-Type': 'application/json', ...extra };
  if (!provider.apiKey) return headers;

  if (provider.type === 'anthropic') {
    headers['x-api-key'] = provider.apiKey;
    headers['anthropic-version'] = '2023-06-01';
  } else {
    headers['Authorization'] = `Bearer ${provider.apiKey}`;
  }
  return headers;
}

/** Strip API key and return public-safe shape. */
function safeProvider(p) {
  return {
    id: p.id,
    name: p.name,
    type: p.type,
    apiBase: p.apiBase,
    models: p.models || [],
    enabled: p.enabled !== false,
    hasApiKey: !!p.apiKey,
    lastTested: p.lastTested || null,
    lastTestStatus: p.lastTestStatus || null,
  };
}

/* ─── CRUD ────────────────────────────────────────────────────────────────── */

export async function listProviders() {
  const data = await loadProviders();
  return {
    providers: data.providers.map(safeProvider),
    activeProviderId: data.activeProviderId,
    activeModel: data.activeModel,
  };
}

export async function addProvider({ name, type, apiBase, apiKey }) {
  if (!name?.trim()) throw new Error('Name is required');
  if (!apiBase?.trim()) throw new Error('API base URL is required');
  if (!isValidType(type)) throw new Error(`Unknown provider type: ${type}`);

  const data = await loadProviders();
  const id = `prov-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const provider = {
    id,
    name: name.trim(),
    type,
    apiBase: trimSlash(apiBase),
    apiKey: apiKey || '',
    models: [],
    enabled: true,
  };
  data.providers.push(provider);
  await saveProviders(data);
  return safeProvider(provider);
}

export async function updateProvider(id, updates) {
  const data = await loadProviders();
  const p = data.providers.find((x) => x.id === id);
  if (!p) throw new Error('Provider not found');

  if (updates.name !== undefined)    p.name    = String(updates.name).trim();
  if (updates.type !== undefined && isValidType(updates.type)) p.type = updates.type;
  if (updates.apiBase !== undefined) p.apiBase = trimSlash(updates.apiBase);
  if (updates.apiKey !== undefined && updates.apiKey !== '') p.apiKey = updates.apiKey;
  if (updates.enabled !== undefined) p.enabled = !!updates.enabled;

  await saveProviders(data);
  return safeProvider(p);
}

export async function deleteProvider(id) {
  const data = await loadProviders();
  data.providers = data.providers.filter((p) => p.id !== id);
  if (data.activeProviderId === id) {
    data.activeProviderId = null;
    data.activeModel = null;
  }
  await saveProviders(data);
  return { success: true };
}

/* ─── Active selection ────────────────────────────────────────────────────── */

export async function setActiveProvider(providerId, modelId) {
  const data = await loadProviders();
  if (providerId) {
    const exists = data.providers.find((p) => p.id === providerId);
    if (!exists) throw new Error('Provider not found');
  }
  data.activeProviderId = providerId || null;
  data.activeModel = modelId || null;
  await saveProviders(data);
  return { activeProviderId: data.activeProviderId, activeModel: data.activeModel };
}

export async function getActiveProvider() {
  const data = await loadProviders();
  if (!data.activeProviderId) return null;
  const p = data.providers.find((x) => x.id === data.activeProviderId);
  if (!p) return null;
  return { ...p, activeModel: data.activeModel };
}

/* ─── Model discovery ─────────────────────────────────────────────────────── */

export async function fetchProviderModels(providerId) {
  const data = await loadProviders();
  const p = data.providers.find((x) => x.id === providerId);
  if (!p) throw new Error('Provider not found');

  const models = await listModelsForProvider(p);
  p.models = models;
  await saveProviders(data);
  return models;
}

async function listModelsForProvider(p) {
  const base = trimSlash(p.apiBase);
  const signal = AbortSignal.timeout(FETCH_TIMEOUT_MS);

  // Wrap fetch with a clearer message for connection refused / DNS failures.
  // These are the most common errors when a local gateway isn't running yet.
  const friendlyFetch = async (url, init) => {
    try {
      return await fetch(url, init);
    } catch (err) {
      const msg = String(err?.message || err);
      // Local URL + connect failure → suggest starting the gateway
      const isLocal = /127\.0\.0\.1|localhost|::1/.test(url);
      if (isLocal && /(ECONNREFUSED|connect|fetch failed|Failed to fetch)/i.test(msg)) {
        throw new Error(`Cannot reach ${url} — is the local server running on that port?`);
      }
      if (/(ENOTFOUND|getaddrinfo)/i.test(msg)) {
        throw new Error(`Cannot resolve host. Check the API base URL.`);
      }
      if (/timeout|aborted/i.test(msg)) {
        throw new Error(`Connection timed out. The server may be slow to respond or unreachable.`);
      }
      throw new Error(msg);
    }
  };

  if (p.type === 'ollama') {
    const res = await friendlyFetch(`${base}/api/tags`, { signal, headers: buildHeaders(p) });
    if (!res.ok) throw new Error(`Ollama HTTP ${res.status}: ${(await res.text()).slice(0, 160)}`);
    const json = await res.json();
    return (json.models || []).map((m) => ({
      id: m.name,
      name: m.name,
      ownedBy: 'ollama',
      meta: m.size ? `${(m.size / 1e9).toFixed(1)} GB` : '',
    }));
  }

  if (p.type === 'anthropic') {
    return [
      { id: 'claude-opus-4-5',   name: 'Claude Opus 4.5',   ownedBy: 'anthropic' },
      { id: 'claude-sonnet-4-5', name: 'Claude Sonnet 4.5', ownedBy: 'anthropic' },
      { id: 'claude-haiku-4-5',  name: 'Claude Haiku 4.5',  ownedBy: 'anthropic' },
      { id: 'claude-sonnet-4',   name: 'Claude Sonnet 4',   ownedBy: 'anthropic' },
      { id: 'claude-haiku-4',    name: 'Claude Haiku 4',    ownedBy: 'anthropic' },
    ];
  }

  // openai or openai-compat: try /models
  const url = `${base}/models`;
  const res = await friendlyFetch(url, { signal, headers: buildHeaders(p) });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 160)}`);
  }
  const json = await res.json();
  const list = json.data || json.models || [];
  return list.map((m) => ({
    id: m.id || m.name,
    name: m.id || m.name,
    ownedBy: m.owned_by || m.publisher || '',
    meta: m.context_length ? `${m.context_length} ctx` : '',
  }));
}

/* ─── Connection test ─────────────────────────────────────────────────────── */

export async function testProvider(id) {
  const data = await loadProviders();
  const p = data.providers.find((x) => x.id === id);
  if (!p) throw new Error('Provider not found');

  const startedAt = Date.now();
  let success = false;
  let modelCount = 0;
  let error = null;

  try {
    const models = await listModelsForProvider(p);
    success = true;
    modelCount = models.length;
    p.models = models;
  } catch (err) {
    error = err.message;
  }

  p.lastTested = Date.now();
  p.lastTestStatus = success ? 'ok' : 'failed';
  await saveProviders(data);

  if (!success) throw new Error(error);
  return { success: true, modelCount, latencyMs: Date.now() - startedAt };
}

/** Test a draft provider without persisting it — used by "Test before save". */
export async function testProviderDraft({ type, apiBase, apiKey }) {
  if (!isValidType(type)) throw new Error(`Unknown provider type: ${type}`);
  if (!apiBase?.trim()) throw new Error('API base URL is required');

  const draft = { type, apiBase: trimSlash(apiBase), apiKey: apiKey || '' };
  const startedAt = Date.now();
  const models = await listModelsForProvider(draft);
  return { success: true, modelCount: models.length, latencyMs: Date.now() - startedAt, sampleModels: models.slice(0, 5) };
}

/* ─── Streaming chat ──────────────────────────────────────────────────────── */

export async function streamProviderChat(provider, messages, options, onToken, onDone, onError) {
  const { temperature, max_tokens } = options || {};
  const base = trimSlash(provider.apiBase);

  try {
    if (provider.type === 'ollama') {
      await streamOllama({ provider, base, messages, temperature, max_tokens, onToken, onDone, onError });
    } else if (provider.type === 'anthropic') {
      await streamAnthropic({ provider, base, messages, temperature, max_tokens, onToken, onDone, onError });
    } else {
      // openai or openai-compat
      await streamOpenAI({ provider, base, messages, temperature, max_tokens, onToken, onDone, onError });
    }
  } catch (err) {
    onError(err.message || String(err));
  }
}

async function streamOpenAI({ provider, base, messages, temperature, max_tokens, onToken, onDone, onError }) {
  const body = {
    model: provider.activeModel,
    messages,
    stream: true,
    temperature: temperature ?? 0.7,
    max_tokens: max_tokens ?? 4096,
  };

  const res = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    headers: buildHeaders(provider),
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(STREAM_TIMEOUT_MS),
  });
  if (!res.ok) {
    onError(`API ${res.status}: ${(await res.text()).slice(0, 200)}`);
    return;
  }

  await readSSE(res, (json) => {
    const delta = json.choices?.[0]?.delta?.content;
    if (delta) onToken(delta);
  });
  onDone();
}

async function streamOllama({ provider, base, messages, temperature, max_tokens, onToken, onDone, onError }) {
  const body = {
    model: provider.activeModel,
    messages,
    stream: true,
    options: { temperature: temperature ?? 0.7, num_predict: max_tokens ?? 4096 },
  };

  const res = await fetch(`${base}/api/chat`, {
    method: 'POST',
    headers: buildHeaders(provider),
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(STREAM_TIMEOUT_MS),
  });
  if (!res.ok) {
    onError(`Ollama ${res.status}: ${(await res.text()).slice(0, 200)}`);
    return;
  }

  // Ollama streams NDJSON, not SSE
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let finished = false;

  while (!finished) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    for (const line of lines) {
      const s = line.trim();
      if (!s) continue;
      try {
        const json = JSON.parse(s);
        const delta = json.message?.content;
        if (delta) onToken(delta);
        if (json.done) { finished = true; break; }
      } catch {}
    }
  }
  onDone();
}

async function streamAnthropic({ provider, base, messages, temperature, max_tokens, onToken, onDone, onError }) {
  // Anthropic Messages API expects: system separate from messages, and a different
  // content shape. We translate from OpenAI-style `messages` → Anthropic shape.
  const sysMessages = messages.filter((m) => m.role === 'system');
  const convo = messages.filter((m) => m.role !== 'system');
  const system = sysMessages.map((m) => textOf(m.content)).filter(Boolean).join('\n\n');

  const body = {
    model: provider.activeModel,
    messages: convo.map((m) => ({ role: m.role, content: textOf(m.content) })),
    max_tokens: max_tokens ?? 4096,
    temperature: temperature ?? 0.7,
    stream: true,
    ...(system ? { system } : {}),
  };

  const res = await fetch(`${base}/messages`, {
    method: 'POST',
    headers: buildHeaders(provider),
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(STREAM_TIMEOUT_MS),
  });
  if (!res.ok) {
    onError(`Anthropic ${res.status}: ${(await res.text()).slice(0, 200)}`);
    return;
  }

  await readSSE(res, (json) => {
    if (json.type === 'content_block_delta' && json.delta?.text) {
      onToken(json.delta.text);
    }
  });
  onDone();
}

/** Read an SSE stream and dispatch each parsed JSON payload to handler. */
async function readSSE(res, onJson) {
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      const s = line.trim();
      if (!s || !s.startsWith('data:')) continue;
      const payload = s.slice(5).trim();
      if (payload === '[DONE]') return;
      try { onJson(JSON.parse(payload)); } catch {}
    }
  }
}

function textOf(content) {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content.map((p) => p?.type === 'text' ? p.text : '').join('');
  }
  return String(content || '');
}

/* ─── Validation ──────────────────────────────────────────────────────────── */

const VALID_TYPES = new Set(['openai', 'openai-compat', 'ollama', 'anthropic']);
function isValidType(t) { return VALID_TYPES.has(t); }
