/**
 * JARVIS Public API — OpenAI-Compatible
 *
 * External apps (openclaw, opencode, curl, etc.) can use this as a drop-in
 * OpenAI-compatible endpoint.
 *
 * Base URL:  http://localhost:6767/v1
 *
 * Endpoints:
 *   GET  /v1/models                  → list available GGUF models
 *   POST /v1/chat/completions        → OpenAI-style chat (streaming + non-streaming)
 *   GET  /v1/health                  → service health check
 *   POST /v1/models/load             → load a model into llama.cpp
 *   POST /v1/models/stop             → stop the running model
 */

const LLAMA_URL = process.env.LLAMA_URL || 'http://127.0.0.1:6969';

/* ── Main route handler ────────────────────────────────────────────────────── */

export async function apiRoute(req, url) {
  const path   = url.pathname;
  const method = req.method;

  // GET /v1/health
  if (path === '/v1/health' && method === 'GET') {
    return handleHealth();
  }

  // GET /v1/models
  if (path === '/v1/models' && method === 'GET') {
    return handleListModels();
  }

  // POST /v1/chat/completions
  if (path === '/v1/chat/completions' && method === 'POST') {
    return handleChatCompletions(req);
  }

  // POST /v1/models/load
  if (path === '/v1/models/load' && method === 'POST') {
    return handleModelLoad(req);
  }

  // POST /v1/models/stop
  if (path === '/v1/models/stop' && method === 'POST') {
    return handleModelStop();
  }

  return Response.json({ error: 'Not found', hint: 'Available: GET /v1/models, POST /v1/chat/completions, GET /v1/health' }, { status: 404 });
}

/* ── GET /v1/health ─────────────────────────────────────────────────────────── */

async function handleHealth() {
  let llamaOk = false;
  let llamaModel = null;
  try {
    const res  = await fetch(`${LLAMA_URL}/health`, { signal: AbortSignal.timeout(2000) });
    llamaOk = res.ok;
    // Try to get the active model name from /props (llama.cpp extension)
    const props = await fetch(`${LLAMA_URL}/props`, { signal: AbortSignal.timeout(1000) }).catch(() => null);
    if (props?.ok) {
      const data = await props.json().catch(() => ({}));
      llamaModel = data?.default_generation_settings?.model || null;
    }
  } catch {}

  return Response.json({
    status: llamaOk ? 'ok' : 'unavailable',
    llama: { connected: llamaOk, model: llamaModel, url: LLAMA_URL },
    service: 'JARVIS',
    version: '1.0.0',
  });
}

/* ── GET /v1/models ─────────────────────────────────────────────────────────── */

async function handleListModels() {
  // Forward to JARVIS model list
  try {
    const res  = await fetch('http://localhost:6767/api/models');
    const data = await res.json();
    const models = (data.models || []).map((m) => ({
      id: m.filename,
      object: 'model',
      created: Math.floor(Date.now() / 1000),
      owned_by: 'jarvis-local',
      meta: {
        name: m.name,
        sizeMB: m.sizeMB,
        active: m.filename === data.currentModel,
      },
    }));

    return Response.json({ object: 'list', data: models });
  } catch (err) {
    return Response.json({ error: 'Failed to list models', detail: err.message }, { status: 502 });
  }
}

/* ── POST /v1/chat/completions ───────────────────────────────────────────────── */

async function handleChatCompletions(req) {
  let body;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const {
    messages,
    model,
    temperature    = 0.7,
    max_tokens     = 2048,
    stream         = false,
    stop,
    top_p,
    frequency_penalty,
    presence_penalty,
  } = body;

  if (!messages?.length) {
    return Response.json({ error: 'messages array is required' }, { status: 400 });
  }

  // Build the llama.cpp request payload (OpenAI-compatible)
  const llamaPayload = {
    messages,
    temperature,
    max_tokens,
    stream,
    ...(stop            ? { stop }            : {}),
    ...(top_p           ? { top_p }           : {}),
    ...(frequency_penalty ? { frequency_penalty } : {}),
    ...(presence_penalty  ? { presence_penalty }  : {}),
  };

  let llamaRes;
  try {
    llamaRes = await fetch(`${LLAMA_URL}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(llamaPayload),
      signal: AbortSignal.timeout(stream ? 120_000 : 60_000),
    });
  } catch (err) {
    return Response.json({
      error: {
        message: 'llama.cpp is not reachable. Load a model via POST /v1/models/load first.',
        type: 'service_unavailable',
        detail: err.message,
      },
    }, { status: 503 });
  }

  if (!llamaRes.ok) {
    const errText = await llamaRes.text().catch(() => 'unknown');
    return Response.json({
      error: { message: `llama.cpp error: ${errText}`, type: 'backend_error' },
    }, { status: llamaRes.status });
  }

  // Streaming — pipe llama.cpp SSE directly back to the caller
  if (stream) {
    return new Response(llamaRes.body, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection':    'keep-alive',
        'X-Powered-By':  'JARVIS',
      },
    });
  }

  // Non-streaming — return the JSON response directly
  const data = await llamaRes.json();

  // Normalise the response to always include model field
  return Response.json({
    ...data,
    model: data.model || model || 'jarvis-local',
  });
}

/* ── POST /v1/models/load ────────────────────────────────────────────────────── */

async function handleModelLoad(req) {
  let body;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const {
    model,
    gpu_layers,
    ctx_size,
    threads,
    batch_size,
    flash_attn,
    mlock,
  } = body;
  if (!model) {
    return Response.json({ error: 'model filename is required, e.g. { "model": "gemma-4b-Q4.gguf" }' }, { status: 400 });
  }

  try {
    const res  = await fetch('http://localhost:6767/api/models/load', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        model,
        ...(gpu_layers !== undefined ? { gpuLayers: gpu_layers } : {}),
        ...(ctx_size !== undefined ? { ctxSize: ctx_size } : {}),
        ...(threads !== undefined ? { threads } : {}),
        ...(batch_size !== undefined ? { batchSize: batch_size } : {}),
        ...(flash_attn !== undefined ? { flashAttn: flash_attn } : {}),
        ...(mlock !== undefined ? { mlock } : {}),
      }),
      signal:  AbortSignal.timeout(30_000),
    });
    const data = await res.json();
    if (data.error) return Response.json({ error: data.error }, { status: 500 });
    return Response.json({
      ok:     true,
      model:  data.model,
      status: data.status,
      ready:  data.ready,
    });
  } catch (err) {
    return Response.json({ error: `Failed to load model: ${err.message}` }, { status: 500 });
  }
}

/* ── POST /v1/models/stop ────────────────────────────────────────────────────── */

async function handleModelStop() {
  try {
    await fetch('http://localhost:6767/api/models/stop', { method: 'POST', signal: AbortSignal.timeout(5000) });
    return Response.json({ ok: true, status: 'stopped' });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}
