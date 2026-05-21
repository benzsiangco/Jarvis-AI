/**
 * start-servers.mjs — called by Tauri's beforeDevCommand.
 *
 * Starts backend (bun) + frontend (vite) as background processes,
 * then exits so Tauri can continue. The child processes keep running
 * until the Tauri window is closed (Tauri kills the process group).
 */
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createConnection } from 'node:net';

const ROOT     = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BACKEND  = path.join(ROOT, 'app', 'backend');
const FRONTEND = path.join(ROOT, 'app', 'frontend');
const IS_WIN   = process.platform === 'win32';

function bg(cmd, args, cwd) {
  const p = spawn(cmd, args, {
    cwd,
    stdio: 'inherit',
    shell: IS_WIN,
    detached: false,
    env: process.env,
  });
  p.on('error', (e) => console.error(`[${cmd}] ${e.message}`));
  return p;
}

function waitForPort(port, ms = 60_000) {
  return new Promise((resolve, reject) => {
    const t0 = Date.now();
    const try_ = () => {
      const s = createConnection(port, '127.0.0.1');
      s.once('connect', () => { s.destroy(); resolve(); });
      s.once('error',   () => {
        s.destroy();
        if (Date.now() - t0 > ms) return reject(new Error(`port ${port} timeout`));
        setTimeout(try_, 400);
      });
    };
    try_();
  });
}

console.log('[jarvis] Starting backend...');
bg('bun', ['run', 'server.js'], BACKEND);

console.log('[jarvis] Starting frontend...');
bg('npm', ['run', 'dev'], FRONTEND);

console.log('[jarvis] Waiting for Vite on :5173...');
await waitForPort(5173);
console.log('[jarvis] Frontend ready.');
