import { chatRoute, chatApproveRoute } from './routes/chat.js';
import { filesRoute } from './routes/files.js';
import { terminalRoute } from './routes/terminal.js';
import { modelsRoute } from './routes/models.js';
import { searchRoute } from './routes/search.js';
import { uploadRoute } from './routes/upload.js';
import { toolsRoute } from './routes/tools.js';
import { stateRoute } from './routes/state.js';
import { apiRoute } from './routes/api.js';
import { skillsRoute } from './routes/skills.js';
import { runtimeRoute } from './routes/runtime.js';
import { providersRoute } from './routes/providers.js';
import { voiceRoute } from './routes/voice.js';
import { memoryRoute } from './routes/memory.js';
import { improveRoute } from './routes/improve.js';
import { todosRoute } from './routes/todos.js';
import { getSystemInstructions, saveSystemInstructions, getPersonaOverride, savePersonaOverride } from './routes/settings.js';
import { setProjectRoot, getProjectRoot } from './utils/root.js';

const PORT = parseInt(process.env.PORT || '6767');

// Ensure JARVIS_ROOT is set for all modules
if (!process.env.JARVIS_ROOT) {
  setProjectRoot(getProjectRoot());
}

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function cors(response) {
  for (const [k, v] of Object.entries(CORS_HEADERS)) {
    response.headers.set(k, v);
  }
  return response;
}

const server = Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);
    const path = url.pathname;

    // CORS preflight
    if (req.method === 'OPTIONS') {
      return cors(new Response(null, { status: 204 }));
    }

    try {
      let response;

      if (path === '/api/health') {
        response = Response.json(await getHealth());
      } else if (path.startsWith('/api/state')) {
        response = await stateRoute(req, url);
      } else if (path === '/api/chat/approve') {
        response = await chatApproveRoute(req);
      } else if (path.startsWith('/api/chat')) {
        response = await chatRoute(req);
      } else if (path === '/api/models/upload') {
        response = await uploadRoute(req, url);
      } else if (path.startsWith('/api/files')) {
        response = await filesRoute(req, url);
      } else if (path.startsWith('/api/terminal')) {
        response = await terminalRoute(req);
      } else if (path.startsWith('/api/models')) {
        response = await modelsRoute(req, url);
      } else if (path.startsWith('/api/runtimes')) {
        response = await runtimeRoute(req, url);
      } else if (path.startsWith('/api/providers')) {
        response = await providersRoute(req, url);
      } else if (path.startsWith('/api/voice')) {
        response = await voiceRoute(req, url);
      } else if (path.startsWith('/api/memory')) {
        response = await memoryRoute(req, url);
      } else if (path.startsWith('/api/improve')) {
        response = await improveRoute(req, url);
      } else if (path.startsWith('/api/todos')) {
        response = await todosRoute(req, url);
      } else if (path.startsWith('/api/search')) {
        response = await searchRoute(req, url);
      } else if (path.startsWith('/api/skills')) {
        response = await skillsRoute(req, url);
      } else if (path === '/api/settings/system-prompt') {
        if (req.method === 'GET') {
          const instructions = await getSystemInstructions();
          response = Response.json({ instructions });
        } else if (req.method === 'POST') {
          try {
            const body = await req.json();
            const text = (body.instructions || '').trim();
            await saveSystemInstructions(text);
            response = Response.json({ ok: true, length: text.length, instructions: text });
          } catch (err) {
            response = Response.json({ ok: false, error: err.message }, { status: 500 });
          }
        }
      } else if (path === '/api/settings/persona') {
        if (req.method === 'GET') {
          const persona = await getPersonaOverride();
          response = Response.json({ persona });
        } else if (req.method === 'POST') {
          try {
            const body = await req.json();
            await savePersonaOverride(body.persona || '');
            response = Response.json({ ok: true });
          } catch (err) {
            response = Response.json({ ok: false, error: err.message }, { status: 500 });
          }
        }
      } else if (path.startsWith('/api/tools')) {
        response = await toolsRoute(req);
      } else if (path === '/api/proxy-image') {
        // Image proxy — fetches external images server-side to bypass CORS/hotlink
        const imgUrl = url.searchParams.get('url');
        if (!imgUrl || !imgUrl.startsWith('http')) {
          response = Response.json({ error: 'url required' }, { status: 400 });
        } else {
          try {
            const imgRes = await fetch(imgUrl, {
              headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Referer': new URL(imgUrl).origin,
                'Accept': 'image/webp,image/apng,image/*,*/*;q=0.8',
              },
              signal: AbortSignal.timeout(15000),
            });
            if (!imgRes.ok) throw new Error(`HTTP ${imgRes.status}`);
            const contentType = imgRes.headers.get('content-type') || 'image/jpeg';
            const buf = await imgRes.arrayBuffer();
            response = new Response(buf, {
              status: 200,
              headers: {
                'Content-Type': contentType,
                'Cache-Control': 'public, max-age=3600',
                'Content-Length': String(buf.byteLength),
              },
            });
          } catch (e) {
            response = Response.json({ error: `Proxy failed: ${e.message}` }, { status: 502 });
          }
        }
      } else if (path.startsWith('/v1')) {
        // Public OpenAI-compatible API — for openclaw, opencode, etc.
        response = await apiRoute(req, url);
      } else {
        response = Response.json({ error: 'Not found' }, { status: 404 });
      }

      return cors(response);
    } catch (err) {
      console.error('[Server Error]', err);
      return cors(Response.json({ error: err.message }, { status: 500 }));
    }
  },
});

async function getHealth() {
  let llamaConnected = false;
  try {
    const res = await fetch('http://localhost:6969/health', { signal: AbortSignal.timeout(2000) });
    llamaConnected = res.ok;
  } catch {}
  return { status: 'ok', llamaConnected, port: PORT, uptime: process.uptime() };
}

console.log(`[JARVIS Backend] Running on http://localhost:${PORT}`);

// Prevent unhandled promise rejections from crashing the server
process.on('unhandledRejection', (reason) => {
  console.error('[JARVIS] Unhandled rejection (non-fatal):', reason?.message || reason);
});
process.on('uncaughtException', (err) => {
  console.error('[JARVIS] Uncaught exception (non-fatal):', err?.message || err);
});
