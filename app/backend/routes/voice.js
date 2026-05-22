/**
 * Voice routes — STT + TTS with two interchangeable backends.
 *
 *   /api/voice/health      → liveness for the active provider
 *   /api/voice/config      → GET/POST current config (provider + fish creds)
 *   /api/voice/transcribe  → multipart audio in, { text } out
 *   /api/voice/speak       → JSON {text}, audio/* out (TTS, fish-only)
 *
 * Local backend:
 *   Python sidecar on 127.0.0.1:6970 (Whisper STT only).
 *
 * Fish Audio backend:
 *   Cloud API at https://api.fish.audio (STT + TTS + voice cloning).
 *   Docs: https://docs.fish.audio
 */
import {
  getVoiceConfig,
  getVoiceConfigPublic,
  setVoiceConfig,
} from '../services/voiceConfig.js';
import { spawn } from 'child_process';
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const LOCAL_URL = process.env.JARVIS_VOICE_URL || 'http://127.0.0.1:6970';
const FISH_URL  = process.env.FISH_AUDIO_URL   || 'https://api.fish.audio';

// ── Voice setup state ─────────────────────────────────────────────────────────
let setupState = 'idle'; // idle | installing | done | error
let setupClients = new Set(); // SSE response controllers

function broadcastSetup(event) {
  const line = `data: ${JSON.stringify(event)}\n\n`;
  for (const ctrl of setupClients) {
    try { ctrl.enqueue(new TextEncoder().encode(line)); } catch {}
  }
}

export async function voiceRoute(req, url) {
  const path   = url.pathname;
  const method = req.method;

  // ── Config ────────────────────────────────────────────────────────────
  if (path === '/api/voice/config' && method === 'GET') {
    return Response.json(await getVoiceConfigPublic());
  }
  if (path === '/api/voice/config' && method === 'POST') {
    try {
      const body = await req.json();
      return Response.json(await setVoiceConfig(body));
    } catch (e) {
      return Response.json({ error: e.message }, { status: 400 });
    }
  }

  // ── Health ────────────────────────────────────────────────────────────
  if (path === '/api/voice/health' && method === 'GET') {
    const cfg = await getVoiceConfig();
    if (cfg.provider === 'fish') {
      return Response.json({
        ok:       !!cfg.fish.apiKey,
        provider: 'fish',
        model:    cfg.fish.ttsModel,
        ready:    !!cfg.fish.apiKey,
        error:    cfg.fish.apiKey ? null : 'Fish Audio API key missing',
      });
    }
    // Edge TTS is online-only but doesn't need a local sidecar
    if (cfg.provider === 'local' && (cfg.local?.engine || 'piper').toLowerCase() === 'edge') {
      return Response.json({ ok: true, provider: 'local', engine: 'edge', ready: true });
    }
    // Browser TTS is always ready
    if (cfg.provider === 'browser') {
      return Response.json({ ok: true, provider: 'browser', ready: true });
    }
    try {
      const res = await fetch(`${LOCAL_URL}/health`, { signal: AbortSignal.timeout(2000) });
      const data = res.ok ? await res.json().catch(() => ({})) : {};
      return Response.json({ ...data, provider: 'local' });
    } catch (e) {
      return Response.json({ ok: false, provider: 'local', error: e.message });
    }
  }

  // ── Voice Setup SSE stream ────────────────────────────────────────────────
  if (path === '/api/voice/setup' && method === 'GET') {
    let ctrl;
    const stream = new ReadableStream({
      start(c) { ctrl = c; },
      cancel() { setupClients.delete(ctrl); },
    });
    setupClients.add(ctrl);
    ctrl.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({ event: 'state', status: setupState })}\n\n`));
    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*',
      },
    });
  }

  // ── Voice Setup trigger ───────────────────────────────────────────────────
  if (path === '/api/voice/setup/start' && method === 'POST') {
    if (setupState === 'installing') {
      return Response.json({ ok: false, error: 'Already installing' }, { status: 409 });
    }
    setupState = 'installing';
    broadcastSetup({ event: 'state', status: 'installing' });

    const resRoot = process.env.JARVIS_BIN_ROOT || '';
    const devRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'voice');
    const candidates = [
      join(resRoot, 'voice', 'launch.py'),
      join(devRoot, 'launch.py'),
    ];
    const launchPy = candidates.find(existsSync);

    if (!launchPy) {
      setupState = 'error';
      broadcastSetup({ event: 'error', name: 'launch', message: 'launch.py not found' });
      broadcastSetup({ event: 'state', status: 'error' });
      return Response.json({ ok: false, error: 'launch.py not found' }, { status: 500 });
    }

    const pythonCmds = ['python3', 'python', 'py'];
    let proc = null;
    for (const py of pythonCmds) {
      try {
        proc = spawn(py, [launchPy], {
          env: { ...process.env, JARVIS_VOICE_PORT: '6970', JARVIS_WHISPER_MODEL: 'base.en', JARVIS_WHISPER_DEVICE: 'cpu', JARVIS_WHISPER_COMPUTE: 'int8' },
          stdio: ['ignore', 'pipe', 'pipe'],
        });
        break;
      } catch {}
    }

    if (!proc) {
      setupState = 'error';
      broadcastSetup({ event: 'error', name: 'python', message: 'Python not found. Install Python 3.9+ and try again.' });
      broadcastSetup({ event: 'state', status: 'error' });
      return Response.json({ ok: false, error: 'Python not found' }, { status: 500 });
    }

    let buf = '';
    proc.stdout.on('data', (chunk) => {
      buf += chunk.toString();
      const lines = buf.split('\n');
      buf = lines.pop();
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          const evt = JSON.parse(trimmed);
          broadcastSetup(evt);
          if (evt.event === 'ready') {
            setupState = 'done';
            broadcastSetup({ event: 'state', status: 'done' });
          } else if (evt.event === 'failed' || evt.event === 'error') {
            setupState = 'error';
            broadcastSetup({ event: 'state', status: 'error' });
          }
        } catch {}
      }
    });
    proc.stderr.on('data', (chunk) => {
      const msg = chunk.toString().trim();
      if (msg) broadcastSetup({ event: 'log', message: msg });
    });
    proc.on('close', (code) => {
      if (setupState === 'installing') {
        setupState = code === 0 ? 'done' : 'error';
        broadcastSetup({ event: 'state', status: setupState });
      }
    });

    return Response.json({ ok: true });
  }

  // ── Transcribe ───────────────────────────────────────────────────────
  if (path === '/api/voice/transcribe' && method === 'POST') {
    const cfg = await getVoiceConfig();
    return cfg.provider === 'fish'
      ? transcribeFish(req, cfg)
      : transcribeLocal(req);
  }

  // ── Speak — routed to provider's TTS engine ──────────────────────────
  if (path === '/api/voice/speak' && method === 'POST') {
    const cfg = await getVoiceConfig();
    if (cfg.provider === 'browser') {
      return Response.json(
        { error: 'browser TTS handled by client', provider: 'browser' },
        { status: 409 }, // 409: client should retry locally
      );
    }
    if (cfg.provider === 'local') {
      // Edge TTS: handle directly in backend without Python sidecar
      if ((cfg.local?.engine || 'piper').toLowerCase() === 'edge') {
        return speakEdgeDirect(req, cfg);
      }
      return speakLocal(req);
    }
    if (cfg.provider !== 'fish') {
      return Response.json(
        { error: 'TTS provider not configured.' },
        { status: 400 },
      );
    }
    return speakFish(req, cfg);
  }

  // ── Voices — list available voices for the active local engine ──────
  if (path === '/api/voice/voices' && method === 'GET') {
    const engine = url.searchParams.get('engine') || '';
    try {
      const qs = engine ? `?engine=${encodeURIComponent(engine)}` : '';
      const res = await fetch(`${LOCAL_URL}/voices${qs}`, { signal: AbortSignal.timeout(2000) });
      if (!res.ok) return Response.json({ voices: [], default: '' });
      return new Response(await res.text(), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    } catch {
      return Response.json({ voices: [], default: '' });
    }
  }

  return Response.json({ error: 'Unknown voice endpoint' }, { status: 404 });
}

/* ── Edge TTS — via edge-tts-node package ────────────────────────────── */

async function speakEdgeDirect(req, cfg) {
  let body;
  try { body = await req.json(); }
  catch { return Response.json({ error: 'invalid JSON body' }, { status: 400 }); }

  const text = (body.text || '').toString().trim();
  if (!text) return Response.json({ error: 'text required' }, { status: 400 });

  const voice  = cfg.local?.edgeVoice  || 'en-GB-RyanNeural';
  const rate   = cfg.local?.edgeRate   || '+0%';
  const pitch  = cfg.local?.edgePitch  || '+0Hz';

  try {
    const { EdgeTTS } = await import('edge-tts-node');
    const tts = new EdgeTTS();
    const chunks = [];

    await tts.synthesize(text, voice, {
      rate,
      pitch,
      onData: (chunk) => { if (chunk) chunks.push(chunk); },
    });

    if (!chunks.length) throw new Error('No audio data received');
    const audio = Buffer.concat(chunks);

    return new Response(audio, {
      status: 200,
      headers: { 'Content-Type': 'audio/mpeg' },
    });
  } catch (e) {
    // Fallback to manual WebSocket implementation
    try {
      const audio = await synthesizeViaWebSocket(text, voice, rate, pitch, cfg.local?.edgeVolume || '+0%');
      return new Response(audio, { status: 200, headers: { 'Content-Type': 'audio/mpeg' } });
    } catch (wsErr) {
      return Response.json({ error: `Edge TTS failed: ${e.message} | WS: ${wsErr.message}` }, { status: 503 });
    }
  }
}

function escapeXml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Synthesize speech using Microsoft Edge TTS.
 * Uses the same WebSocket protocol as the edge-tts Python package.
 * Falls back to a chunked HTTP approach if WebSocket fails.
 */
async function synthesizeEdgeTTS(text, voice, rate, pitch, volume) {
  // Try WebSocket first (works in dev and most packaged builds)
  try {
    return await synthesizeViaWebSocket(text, voice, rate, pitch, volume);
  } catch (wsErr) {
    // WebSocket failed — try the HTTP token approach
    try {
      return await synthesizeViaHttp(text, voice, rate, pitch, volume);
    } catch (httpErr) {
      throw new Error(`WebSocket: ${wsErr.message} | HTTP: ${httpErr.message}`);
    }
  }
}

async function synthesizeViaWebSocket(text, voice, rate, pitch, volume) {
  const TRUSTED_CLIENT_TOKEN = '6A5AA1D4EAFF4E9FB37E23D68491D6F4';
  const WSS_URL = `wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1?TrustedClientToken=${TRUSTED_CLIENT_TOKEN}`;

  const requestId = crypto.randomUUID().replace(/-/g, '');
  const timestamp = new Date().toISOString();

  const configMsg =
    `X-Timestamp:${timestamp}\r\n` +
    `Content-Type:application/json; charset=utf-8\r\n` +
    `Path:speech.config\r\n\r\n` +
    JSON.stringify({
      context: {
        synthesis: {
          audio: {
            metadataoptions: { sentenceBoundaryEnabled: false, wordBoundaryEnabled: false },
            outputFormat: 'audio-24khz-48kbitrate-mono-mp3',
          },
        },
      },
    });

  const ssml =
    `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='en-US'>` +
    `<voice name='${voice}'>` +
    `<prosody rate='${rate}' pitch='${pitch}' volume='${volume}'>` +
    escapeXml(text) +
    `</prosody></voice></speak>`;

  const ssmlMsg =
    `X-RequestId:${requestId}\r\n` +
    `Content-Type:application/ssml+xml\r\n` +
    `X-Timestamp:${timestamp}Z\r\n` +
    `Path:ssml\r\n\r\n` +
    ssml;

  return new Promise((resolve, reject) => {
    let ws;
    try { ws = new WebSocket(WSS_URL); }
    catch (e) { return reject(new Error(`WS init: ${e.message}`)); }

    const audioChunks = [];
    const timeout = setTimeout(() => {
      try { ws.close(); } catch {}
      reject(new Error('timeout after 20s'));
    }, 20000);

    ws.onopen = () => {
      try { ws.send(configMsg); ws.send(ssmlMsg); }
      catch (e) { clearTimeout(timeout); reject(new Error(`send: ${e.message}`)); }
    };

    ws.onmessage = async (event) => {
      const data = event.data;
      if (typeof data === 'string') {
        if (data.includes('Path:turn.end')) {
          clearTimeout(timeout);
          try { ws.close(); } catch {}
          if (!audioChunks.length) { reject(new Error('no audio received')); return; }
          resolve(mergeChunks(audioChunks));
        }
      } else {
        const buf = await toBuf(data);
        if (!buf) return;
        const audio = extractAudio(buf);
        if (audio) audioChunks.push(audio);
      }
    };

    ws.onerror = (e) => { clearTimeout(timeout); reject(new Error(e.message || 'WS error')); };
    ws.onclose = (e) => {
      clearTimeout(timeout);
      if (audioChunks.length) resolve(mergeChunks(audioChunks));
      else if (e.code !== 1000 && e.code !== 1001) reject(new Error(`WS closed: ${e.code}`));
    };
  });
}

/**
 * HTTP fallback: use the Azure Cognitive Services TTS REST endpoint.
 * Requires a free Azure subscription key — but we use the public
 * edge-tts token endpoint that doesn't need a key.
 */
async function synthesizeViaHttp(text, voice, rate, pitch, volume) {
  // Get a short-lived auth token from the edge-tts token endpoint
  const tokenRes = await fetch(
    'https://azure.microsoft.com/en-us/products/cognitive-services/text-to-speech/',
    { signal: AbortSignal.timeout(5000) }
  ).catch(() => null);

  // Use the public endpoint that edge-tts uses — no auth needed
  const ssml =
    `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='en-US'>` +
    `<voice name='${voice}'>` +
    `<prosody rate='${rate}' pitch='${pitch}' volume='${volume}'>` +
    escapeXml(text) +
    `</prosody></voice></speak>`;

  const res = await fetch('https://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/ssml+xml',
      'X-Microsoft-OutputFormat': 'audio-24khz-48kbitrate-mono-mp3',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'TrustedClientToken': '6A5AA1D4EAFF4E9FB37E23D68491D6F4',
    },
    body: ssml,
    signal: AbortSignal.timeout(20000),
  });

  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const buf = await res.arrayBuffer();
  return new Uint8Array(buf);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function toBuf(data) {
  try {
    if (typeof Blob !== 'undefined' && data instanceof Blob) return new Uint8Array(await data.arrayBuffer());
    if (data instanceof ArrayBuffer) return new Uint8Array(data);
    if (data instanceof Uint8Array) return data;
    if (data?.buffer instanceof ArrayBuffer) return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
    return new Uint8Array(await new Blob([data]).arrayBuffer());
  } catch { return null; }
}

function extractAudio(buf) {
  // Method 1: scan for "Path:audio\r\n\r\n" separator
  const sep = new TextEncoder().encode('Path:audio\r\n\r\n');
  for (let i = 0; i <= buf.length - sep.length; i++) {
    let match = true;
    for (let j = 0; j < sep.length; j++) {
      if (buf[i + j] !== sep[j]) { match = false; break; }
    }
    if (match) return buf.slice(i + sep.length);
  }
  // Method 2: 2-byte big-endian header length prefix
  if (buf.length > 2) {
    const headerLen = (buf[0] << 8) | buf[1];
    if (headerLen > 0 && headerLen + 2 < buf.length) {
      const headerText = new TextDecoder().decode(buf.slice(2, 2 + headerLen));
      if (headerText.includes('Path:audio')) return buf.slice(2 + headerLen);
    }
  }
  return null;
}

function mergeChunks(chunks) {
  const total = chunks.reduce((s, c) => s + c.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) { out.set(c, offset); offset += c.length; }
  return out;
}

/* ── Local sidecar (Whisper + Piper) ─────────────────────────────────── */

async function transcribeLocal(req) {
  try {
    const upstream = await fetch(`${LOCAL_URL}/transcribe`, {
      method:  'POST',
      body:    req.body,
      headers: passThroughHeaders(req.headers),
      signal:  AbortSignal.timeout(120_000),
      duplex:  'half',
    });
    const text = await upstream.text();
    return new Response(text, {
      status:  upstream.status,
      headers: { 'Content-Type': upstream.headers.get('content-type') || 'application/json' },
    });
  } catch (e) {
    return Response.json(
      { error: `voice sidecar unreachable: ${e.message}` },
      { status: 503 },
    );
  }
}

async function speakLocal(req) {
  let body;
  try { body = await req.json(); }
  catch { return Response.json({ error: 'invalid JSON body' }, { status: 400 }); }

  const cfg = await getVoiceConfig();
  const engine = (cfg.local?.engine || 'piper').toLowerCase();

  const payload = {
    text:   (body.text || '').toString(),
    engine,
    speed:  Number(cfg.local?.speed) || 1.0,
  };
  if (engine === 'neutts') {
    payload.voice    = cfg.local?.neuttsVoice    || undefined;
    payload.backbone = cfg.local?.neuttsBackbone || undefined;
  } else if (engine === 'edge') {
    payload.voice  = cfg.local?.edgeVoice  || undefined;
    payload.rate   = cfg.local?.edgeRate   || undefined;
    payload.pitch  = cfg.local?.edgePitch  || undefined;
    payload.volume = cfg.local?.edgeVolume || undefined;
  } else {
    payload.voice = cfg.local?.piperVoice || undefined;
  }
  if (!payload.text.trim()) {
    return Response.json({ error: 'text required' }, { status: 400 });
  }

  // Edge TTS is online (~1-2s typical), NeuTTS slow on CPU, Piper instant.
  const timeoutMs = engine === 'neutts' ? 300_000
                  : engine === 'edge'  ? 30_000
                  : 120_000;

  try {
    const upstream = await fetch(`${LOCAL_URL}/speak`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!upstream.ok) {
      const errText = await upstream.text().catch(() => '');
      return Response.json(
        { error: `${engine} tts ${upstream.status}: ${errText}` },
        { status: upstream.status },
      );
    }
    return new Response(upstream.body, {
      status: 200,
      headers: { 'Content-Type': upstream.headers.get('content-type') || 'audio/wav' },
    });
  } catch (e) {
    return Response.json(
      { error: `voice sidecar unreachable: ${e.message}` },
      { status: 503 },
    );
  }
}

/* ── Fish Audio (cloud) ──────────────────────────────────────────────── */

async function transcribeFish(req, cfg) {
  if (!cfg.fish.apiKey) {
    return Response.json({ error: 'Fish Audio API key not configured' }, { status: 400 });
  }
  // Pull the uploaded audio out of the incoming multipart form
  let blob;
  try {
    const form = await req.formData();
    const file = form.get('file');
    if (!file || typeof file === 'string') throw new Error('no audio file');
    blob = file;
  } catch (e) {
    return Response.json({ error: `bad audio upload: ${e.message}` }, { status: 400 });
  }

  // Forward as multipart/form-data → Fish /v1/asr
  const upstream = new FormData();
  upstream.append('audio', blob, blob.name || 'audio.webm');
  if (cfg.fish.language) upstream.append('language', cfg.fish.language);
  upstream.append('ignore_timestamps', 'true');

  try {
    const res = await fetch(`${FISH_URL}/v1/asr`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${cfg.fish.apiKey}` },
      body: upstream,
      signal: AbortSignal.timeout(120_000),
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      return Response.json(
        { error: `fish.audio asr ${res.status}: ${errText}` },
        { status: res.status },
      );
    }
    const data = await res.json();
    return Response.json({ text: (data.text || '').trim(), provider: 'fish' });
  } catch (e) {
    return Response.json({ error: `fish.audio unreachable: ${e.message}` }, { status: 503 });
  }
}

async function speakFish(req, cfg) {
  if (!cfg.fish.apiKey) {
    return Response.json({ error: 'Fish Audio API key not configured' }, { status: 400 });
  }
  let body;
  try { body = await req.json(); }
  catch { return Response.json({ error: 'invalid JSON body' }, { status: 400 }); }

  const text = (body.text || '').toString().trim();
  if (!text) return Response.json({ error: 'text required' }, { status: 400 });

  const payload = {
    text,
    format:     cfg.fish.ttsFormat || 'mp3',
    latency:    'balanced',
    chunk_length: 200,
    prosody: {
      speed:  Number(cfg.fish.speed)  || 1.0,
      volume: Number(cfg.fish.volume) || 0,
      normalize_loudness: true,
    },
  };
  if (cfg.fish.ttsVoiceId) payload.reference_id = cfg.fish.ttsVoiceId;

  try {
    const res = await fetch(`${FISH_URL}/v1/tts`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${cfg.fish.apiKey}`,
        'Content-Type': 'application/json',
        model: cfg.fish.ttsModel || 's2-pro',
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(120_000),
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      return Response.json(
        { error: `fish.audio tts ${res.status}: ${errText}` },
        { status: res.status },
      );
    }
    // Stream the audio back to the client unchanged
    return new Response(res.body, {
      status: 200,
      headers: { 'Content-Type': mimeFor(payload.format) },
    });
  } catch (e) {
    return Response.json({ error: `fish.audio unreachable: ${e.message}` }, { status: 503 });
  }
}

function mimeFor(format) {
  switch ((format || 'mp3').toLowerCase()) {
    case 'wav':  return 'audio/wav';
    case 'pcm':  return 'audio/L16';
    case 'opus': return 'audio/opus';
    case 'mp3':
    default:     return 'audio/mpeg';
  }
}

function passThroughHeaders(headers) {
  const out = {};
  const ct = headers.get('content-type');
  if (ct) out['content-type'] = ct;
  const cl = headers.get('content-length');
  if (cl) out['content-length'] = cl;
  return out;
}
