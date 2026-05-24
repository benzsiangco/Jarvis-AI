/**
 * Voice routes — STT (Whisper) + TTS (Supertonic).
 *
 *   /api/voice/health      → liveness check
 *   /api/voice/config      → GET/POST current config
 *   /api/voice/transcribe  → multipart audio in, { text } out  (Whisper STT)
 *   /api/voice/speak       → JSON {text, voice?, speed?}, audio/wav out (Supertonic TTS)
 *   /api/voice/setup*      → install Python deps via SSE
 *
 * STT: Python sidecar (faster-whisper) on 127.0.0.1:6970
 * TTS: Supertonic serve on 127.0.0.1:7788  (pip install 'supertonic[serve]')
 */
import {
  getVoiceConfig,
  getVoiceConfigPublic,
  setVoiceConfig,
} from '../services/voiceConfig.js';
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const STT_URL        = process.env.JARVIS_VOICE_URL    || 'http://127.0.0.1:6970';
const SUPERTONIC_URL = process.env.JARVIS_TTS_URL      || 'http://127.0.0.1:7788';

// ── Voice setup state ─────────────────────────────────────────────────────────
let setupState = 'idle'; // idle | installing | done | error
let setupClients = new Set(); // SSE response controllers

function broadcastSetup(event) {
  const line = `data: ${JSON.stringify(event)}\n\n`;
  const encoded = new TextEncoder().encode(line);
  for (const ctrl of [...setupClients]) {
    try { ctrl.enqueue(encoded); } catch { setupClients.delete(ctrl); }
  }
}

function resetSetup() {
  setupState = 'idle';
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
    // Check STT sidecar
    let sttOk = false;
    try {
      const r = await fetch(`${STT_URL}/health`, { signal: AbortSignal.timeout(2000) });
      sttOk = r.ok;
    } catch {}
    // Check Supertonic TTS
    let ttsOk = false;
    try {
      const r = await fetch(`${SUPERTONIC_URL}/health`, { signal: AbortSignal.timeout(2000) });
      ttsOk = r.ok;
    } catch {}
    return Response.json({ ok: sttOk || ttsOk, stt: sttOk, tts: ttsOk });
  }

  // ── Voice Setup SSE stream ────────────────────────────────────────────────
  if (path === '/api/voice/setup' && method === 'GET') {
    let ctrl;
    const stream = new ReadableStream({
      start(c) {
        ctrl = c;
        setupClients.add(ctrl);
        // Send current state immediately so UI syncs on connect
        try {
          ctrl.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({ event: 'state', status: setupState })}\n\n`));
        } catch {}
      },
      cancel() { setupClients.delete(ctrl); },
    });
    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*',
      },
    });
  }

  // ── Voice Setup reset (allow retry) ──────────────────────────────────────
  if (path === '/api/voice/setup/reset' && method === 'POST') {
    resetSetup();
    broadcastSetup({ event: 'state', status: 'idle' });
    return Response.json({ ok: true });
  }

  // ── Voice Setup trigger ───────────────────────────────────────────────────
  if (path === '/api/voice/setup/start' && method === 'POST') {
    // Allow restart if previous attempt errored or is stale
    if (setupState === 'installing') {
      return Response.json({ ok: false, error: 'Already installing' }, { status: 409 });
    }

    // Optional: specific packages to install (array of names)
    let selectedPackages = [];
    try {
      const body = await req.json().catch(() => ({}));
      selectedPackages = Array.isArray(body.packages) ? body.packages : [];
    } catch {}

    setupState = 'installing';
    broadcastSetup({ event: 'state', status: 'installing' });

    // Find launch.py — packaged path first, then dev path
    const resRoot = process.env.JARVIS_BIN_ROOT || '';
    const devRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'voice');
    const candidates = [
      resRoot ? join(resRoot, 'voice', 'launch.py') : null,
      join(devRoot, 'launch.py'),
    ].filter(Boolean);
    const launchPy = candidates.find(existsSync);

    if (!launchPy) {
      setupState = 'error';
      broadcastSetup({ event: 'error', name: 'launch', message: 'launch.py not found. Voice scripts may not be bundled.' });
      broadcastSetup({ event: 'state', status: 'error' });
      return Response.json({ ok: false, error: 'launch.py not found' }, { status: 500 });
    }

    // Try python commands in order
    const pythonCmds = ['python', 'python3', 'py'];
    let proc = null;
    let usedPy = null;

    const spawnArgs = [launchPy, ...selectedPackages];

    for (const py of pythonCmds) {
      try {
        proc = Bun.spawn([py, ...spawnArgs], {
          env: {
            ...process.env,
            JARVIS_VOICE_PORT: '6970',
            JARVIS_WHISPER_MODEL: 'base.en',
            JARVIS_WHISPER_DEVICE: 'cpu',
            JARVIS_WHISPER_COMPUTE: 'int8',
            // Force pip to use UTF-8 output
            PYTHONIOENCODING: 'utf-8',
            PYTHONUNBUFFERED: '1',
          },
          stdout: 'pipe',
          stderr: 'pipe',
          stdin: null,
          windowsHide: true,
        });
        usedPy = py;
        break;
      } catch {}
    }

    if (!proc) {
      setupState = 'error';
      broadcastSetup({ event: 'error', name: 'python', message: 'Python not found. Please install Python 3.9+ from python.org and try again.' });
      broadcastSetup({ event: 'state', status: 'error' });
      return Response.json({ ok: false, error: 'Python not found' }, { status: 500 });
    }

    broadcastSetup({ event: 'log', message: `Using ${usedPy} → ${launchPy}` });

    // Read stdout line by line using Bun's async iterator
    (async () => {
      try {
        const reader = proc.stdout;
        let buf = '';
        for await (const chunk of reader) {
          buf += new TextDecoder().decode(chunk);
          const lines = buf.split('\n');
          buf = lines.pop() ?? '';
          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;
            try {
              const evt = JSON.parse(trimmed);
              broadcastSetup(evt);
              if (evt.event === 'ready' || evt.event === 'all_installed') {
                setupState = 'done';
                broadcastSetup({ event: 'state', status: 'done' });
              } else if (evt.event === 'failed' || evt.event === 'error') {
                setupState = 'error';
                broadcastSetup({ event: 'state', status: 'error' });
              }
            } catch {
              broadcastSetup({ event: 'log', message: trimmed.slice(0, 200) });
            }
          }
        }
        if (buf.trim()) {
          try { broadcastSetup(JSON.parse(buf.trim())); }
          catch { broadcastSetup({ event: 'log', message: buf.trim().slice(0, 200) }); }
        }
      } catch (e) {
        broadcastSetup({ event: 'log', message: `stdout error: ${e.message}` });
      }
    })();

    // Read stderr
    (async () => {
      try {
        for await (const chunk of proc.stderr) {
          const msg = new TextDecoder().decode(chunk).trim();
          if (msg) broadcastSetup({ event: 'log', message: msg.slice(0, 200) });
        }
      } catch {}
    })();

    // Watch for process exit
    proc.exited.then((code) => {
      if (setupState === 'installing') {
        setupState = code === 0 ? 'done' : 'error';
        if (setupState === 'error') {
          broadcastSetup({ event: 'error', name: 'process', message: `Process exited with code ${code}` });
        }
        // Reset Supertonic auto-start flag so it retries after install
        if (setupState === 'done') supertonicStarted = false;
        broadcastSetup({ event: 'state', status: setupState });
      }
    }).catch(() => {});

    return Response.json({ ok: true, python: usedPy, script: launchPy });
  }

  // ── Transcribe (Whisper STT) ─────────────────────────────────────────
  if (path === '/api/voice/transcribe' && method === 'POST') {
    return transcribeLocal(req);
  }

  // ── Speak (Supertonic TTS) ───────────────────────────────────────────
  if (path === '/api/voice/speak' && method === 'POST') {
    return speakSupertonic(req);
  }

  return Response.json({ error: 'Unknown voice endpoint' }, { status: 404 });
}

/* ── Whisper STT sidecar ─────────────────────────────────────────────── */

async function transcribeLocal(req) {
  try {
    const upstream = await fetch(`${STT_URL}/transcribe`, {
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
    return Response.json({ error: `STT sidecar unreachable: ${e.message}` }, { status: 503 });
  }
}

/* ── Supertonic TTS ──────────────────────────────────────────────────── */

// Track if we've already tried to auto-start Supertonic
let supertonicStarted = false;

async function ensureSupertonic() {
  // Already reachable
  try {
    const r = await fetch(`${SUPERTONIC_URL}/health`, { signal: AbortSignal.timeout(1500) });
    if (r.ok) return true;
  } catch {}

  if (supertonicStarted) return false; // already tried, don't spam
  supertonicStarted = true;

  // Try to start supertonic serve
  const pythonCmds = ['python', 'python3', 'py'];
  for (const py of pythonCmds) {
    try {
      Bun.spawn([py, '-m', 'supertonic', 'serve', '--host', '127.0.0.1', '--port', '7788'], {
        stdout: 'ignore',
        stderr: 'ignore',
        stdin: null,
        windowsHide: true,
      });
      // Give it 3s to start
      await new Promise((r) => setTimeout(r, 3000));
      const check = await fetch(`${SUPERTONIC_URL}/health`, { signal: AbortSignal.timeout(2000) }).catch(() => null);
      if (check?.ok) return true;
      break;
    } catch {}
  }
  return false;
}

async function speakSupertonic(req) {
  let body;
  try { body = await req.json(); }
  catch { return Response.json({ error: 'invalid JSON body' }, { status: 400 }); }

  const text  = (body.text  || '').toString().trim();
  const voice = body.voice  || 'M1';
  const speed = Number(body.speed) || 1.05;
  const lang  = body.lang   || 'en';

  if (!text) return Response.json({ error: 'text required' }, { status: 400 });

  // Auto-start Supertonic if not running
  const ready = await ensureSupertonic();
  if (!ready) {
    return Response.json({
      error: 'Supertonic TTS is not running. Go to Settings → Voice Setup and install voice dependencies first.',
    }, { status: 503 });
  }

  try {
    const res = await fetch(`${SUPERTONIC_URL}/v1/audio/speech`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ input: text, voice, speed, response_format: 'wav' }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) {
      const err = await res.text().catch(() => '');
      return Response.json({ error: `Supertonic TTS ${res.status}: ${err.slice(0, 200)}` }, { status: res.status });
    }
    return new Response(res.body, {
      status: 200,
      headers: { 'Content-Type': 'audio/wav' },
    });
  } catch (e) {
    supertonicStarted = false; // allow retry next time
    return Response.json({ error: `Supertonic TTS unreachable: ${e.message}` }, { status: 503 });
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
