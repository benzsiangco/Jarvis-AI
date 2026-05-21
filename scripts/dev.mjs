/**
 * npm run dev — one command to launch Jarvis AI as a desktop app.
 *
 * Starts backend + frontend (Vite HMR), then opens the native window.
 * Uses the compiled release exe — no Rust recompile needed.
 *
 * The window loads from the bundled assets (not Vite), so you won't
 * get hot-reload in the native window. For hot-reload, open
 * http://localhost:5173 in a browser alongside the native window.
 *
 * Auto-detects MSVC Build Tools on Windows.
 */
import { spawn } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { createConnection } from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT      = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const BACKEND   = path.join(ROOT, 'app', 'backend');
const FRONTEND  = path.join(ROOT, 'app', 'frontend');
const TAURI_DIR = path.join(ROOT, 'app', 'tauri');
const VOICE_DIR = path.join(ROOT, 'app', 'voice');
const IS_WIN    = process.platform === 'win32';

// Prefer the release build exe; fall back to installed location
const EXE_CANDIDATES = [
  path.join(TAURI_DIR, 'target', 'release', 'jarvis.exe'),
  'C:\\Users\\Yasuo\\AppData\\Local\\Jarvis AI\\jarvis.exe',
  path.join(process.env.LOCALAPPDATA || '', 'Jarvis AI', 'jarvis.exe'),
];

function findExe() {
  return EXE_CANDIDATES.find(p => existsSync(p)) || null;
}

/* ── MSVC env ────────────────────────────────────────────────────────── */
function findMsvc() {
  const roots = [
    'C:\\BuildTools\\VC\\Tools\\MSVC',
    'C:\\Program Files\\Microsoft Visual Studio\\2022\\BuildTools\\VC\\Tools\\MSVC',
    'C:\\Program Files (x86)\\Microsoft Visual Studio\\2022\\BuildTools\\VC\\Tools\\MSVC',
    'C:\\Program Files\\Microsoft Visual Studio\\2022\\Community\\VC\\Tools\\MSVC',
  ];
  for (const r of roots) {
    if (!existsSync(r)) continue;
    const v = readdirSync(r).sort().reverse()[0];
    if (v) return { root: r, version: v };
  }
  return null;
}
function findSdkVer() {
  const base = 'C:\\Program Files (x86)\\Windows Kits\\10\\bin';
  if (!existsSync(base)) return null;
  return readdirSync(base).filter(v => /^\d/.test(v)).sort().reverse()[0] || null;
}
function setMsvcEnv() {
  const msvc = findMsvc();
  const sdk  = findSdkVer();
  if (!msvc) { console.warn('[dev] MSVC not found — Rust may fail to compile.'); return; }
  const msvcBin = `${msvc.root}\\${msvc.version}\\bin\\Hostx64\\x64`;
  const sdkBin  = sdk ? `C:\\Program Files (x86)\\Windows Kits\\10\\bin\\${sdk}\\x64` : '';
  process.env.PATH = [msvcBin, sdkBin, process.env.PATH].filter(Boolean).join(path.delimiter);
  if (sdk) {
    const lib = `C:\\Program Files (x86)\\Windows Kits\\10\\Lib\\${sdk}`;
    const inc = `C:\\Program Files (x86)\\Windows Kits\\10\\Include\\${sdk}`;
    process.env.LIB     = [`${msvc.root}\\${msvc.version}\\lib\\x64`, `${lib}\\um\\x64`, `${lib}\\ucrt\\x64`].join(path.delimiter);
    process.env.INCLUDE = [`${msvc.root}\\${msvc.version}\\include`, `${inc}\\ucrt`, `${inc}\\um`, `${inc}\\shared`].join(path.delimiter);
  }
  console.log(`[dev] MSVC ${msvc.version}  SDK ${sdk || 'n/a'}`);
}

/* ── Process helpers ─────────────────────────────────────────────────── */
const children = [];

function bg(label, cmd, args, cwd, color, extraEnv = {}) {
  const c = { cyan:'\x1b[36m', magenta:'\x1b[35m', yellow:'\x1b[33m', green:'\x1b[32m' }[color] || '';
  const R = '\x1b[0m';
  const p = spawn(cmd, args, {
    cwd,
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: IS_WIN,
    env: { ...process.env, ...extraEnv },
  });
  p.stdout.on('data', d => d.toString().split('\n').filter(Boolean).forEach(l => process.stdout.write(`${c}[${label}]${R} ${l}\n`)));
  p.stderr.on('data', d => d.toString().split('\n').filter(Boolean).forEach(l => process.stderr.write(`${c}[${label}]${R} ${l}\n`)));
  p.on('error', e => console.error(`[${label}] error: ${e.message}`));
  children.push(p);
  return p;
}

function killAll() { children.forEach(p => { try { p.kill(); } catch {} }); }
process.on('SIGINT',  () => { killAll(); process.exit(0); });
process.on('SIGTERM', () => { killAll(); process.exit(0); });

function waitForPort(port, ms = 90_000) {
  return new Promise((resolve, reject) => {
    const t0 = Date.now();
    const hosts = ['127.0.0.1', '::1', 'localhost'];
    let idx = 0;
    const try_ = () => {
      const host = hosts[idx % hosts.length];
      idx++;
      const s = createConnection(port, host);
      s.once('connect', () => { s.destroy(); resolve(); });
      s.once('error',   () => {
        s.destroy();
        if (Date.now() - t0 > ms) return reject(new Error(`port ${port} timeout`));
        setTimeout(try_, 300);
      });
    };
    try_();
  });
}

/* ── Main ────────────────────────────────────────────────────────────── */
console.log('\n  ╔══════════════════════════════╗');
console.log('  ║   JARVIS AI  —  Dev Mode     ║');
console.log('  ╚══════════════════════════════╝\n');

if (IS_WIN) setMsvcEnv();

// Voice sidecar (Python · Whisper STT + TTS). Auto-restarts on crash.
function startVoiceSidecar() {
  const py = IS_WIN ? 'python' : 'python3';
  console.log('[dev] Starting voice sidecar (Whisper + TTS)...');

  let restarts = 0;
  const MAX_RESTARTS = 5;

  function launch() {
    const p = bg('VOICE', py, ['sidecar.py'], VOICE_DIR, 'yellow');
    p.on('exit', (code) => {
      if (code === 0) return; // clean exit, don't restart
      restarts++;
      if (restarts > MAX_RESTARTS) {
        console.warn(`[dev] Voice sidecar crashed ${restarts} times — giving up. STT/TTS unavailable.`);
        return;
      }
      const delay = Math.min(2000 * restarts, 10000);
      console.warn(`[dev] Voice sidecar exited (code ${code}). Restarting in ${delay}ms... (${restarts}/${MAX_RESTARTS})`);
      setTimeout(launch, delay);
    });
  }
  launch();
}
startVoiceSidecar();

// When using the compiled exe, it bundles its own backend — don't start a
// separate dev backend or it will conflict on port 6767.
const exe = findExe();

if (exe) {
  // Fast path: compiled exe handles its own backend.
  // Only start Vite for hot-reload in the browser.
  console.log('[dev] Starting frontend (http://localhost:5173 for hot-reload)...');
  bg('FRONTEND', 'npm', ['run', 'dev'], FRONTEND, 'magenta');

  console.log('[dev] Waiting for Vite on :5173...');
  try { await waitForPort(5173); } catch {
    console.error('[dev] Vite did not start in time.'); killAll(); process.exit(1);
  }

  console.log('[dev] Launching native window...');
  console.log('[dev] Tip: open http://localhost:5173 in a browser for hot-reload.\n');

  const jarvis = spawn(exe, [], {
    cwd: path.dirname(exe),
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: false,
    env: process.env,
  });
  const c = '\x1b[32m', R = '\x1b[0m';
  jarvis.stdout.on('data', d => d.toString().split('\n').filter(Boolean).forEach(l => process.stdout.write(`${c}[JARVIS]${R} ${l}\n`)));
  jarvis.stderr.on('data', d => d.toString().split('\n').filter(Boolean).forEach(l => process.stderr.write(`${c}[JARVIS]${R} ${l}\n`)));
  children.push(jarvis);
  jarvis.on('exit', code => {
    console.log('\n[dev] Window closed — shutting down...');
    killAll();
    process.exit(code ?? 0);
  });

} else {
  // Slow path: no exe yet — start everything manually and use tauri dev.
  console.log('[dev] Starting backend...');
  bg('BACKEND', 'bun', ['run', 'server.js'], BACKEND, 'cyan');

  console.log('[dev] Starting frontend...');
  bg('FRONTEND', 'npm', ['run', 'dev'], FRONTEND, 'magenta');

  console.log('[dev] No compiled exe found. Running tauri dev (compiles Rust ~2 min first time)...\n');
  console.log('[dev] Tip: run `npm run build` once to get the fast path next time.\n');

  await waitForPort(5173).catch(() => {});

  const tauri = bg('TAURI', 'npx', ['tauri', 'dev'], TAURI_DIR, 'yellow');
  tauri.on('exit', code => {
    console.log('\n[dev] Window closed — shutting down...');
    killAll();
    process.exit(code ?? 0);
  });
}
