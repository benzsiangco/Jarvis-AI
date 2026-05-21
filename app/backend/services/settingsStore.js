/**
 * settingsStore — single writer for app-settings.json.
 *
 * All modules that read/write app-settings.json MUST go through here.
 * A write queue serialises all writes so concurrent saves never clobber each other.
 *
 * updateSettings(patch)  — merge a plain object patch
 * updateSettings(fn)     — fn(current) → patch, read+mutate+write atomically
 */
import { readFile, writeFile, mkdir } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

// ── Resolve settings file path ────────────────────────────────────────────────
// JARVIS_SETTINGS_PATH is set by the Tauri sidecar launcher (backend.rs).
// Fallback: resolve relative to this file (works in dev / bun run).
function resolveSettingsPath() {
  if (process.env.JARVIS_SETTINGS_PATH) {
    return process.env.JARVIS_SETTINGS_PATH;
  }
  try {
    // Works in dev (source) mode
    const dir = dirname(dirname(fileURLToPath(import.meta.url)));
    return join(dir, 'app-settings.json');
  } catch {
    return join(process.cwd(), 'app-settings.json');
  }
}

export const SETTINGS_FILE = resolveSettingsPath();

// ── Write queue ───────────────────────────────────────────────────────────────
// We keep a simple mutex: one write at a time, errors don't break the chain.
let _busy = false;
const _queue = [];

function drainQueue() {
  if (_busy || _queue.length === 0) return;
  _busy = true;
  const { fn, resolve, reject } = _queue.shift();
  fn()
    .then(resolve, reject)
    .finally(() => {
      _busy = false;
      drainQueue();
    });
}

function enqueue(fn) {
  return new Promise((resolve, reject) => {
    _queue.push({ fn, resolve, reject });
    drainQueue();
  });
}

// ── Public API ────────────────────────────────────────────────────────────────

/** Read the full settings object fresh from disk. */
export async function readSettings() {
  try {
    const raw = await readFile(SETTINGS_FILE, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

/**
 * Atomically update settings and persist.
 *
 * @param {object|function} patchOrFn
 *   - object : keys to merge (pass `undefined` value to delete a key)
 *   - function: receives current settings object, returns patch object
 */
export function updateSettings(patchOrFn) {
  return enqueue(async () => {
    // Read fresh inside the lock
    let current = {};
    try {
      const raw = await readFile(SETTINGS_FILE, 'utf-8');
      current = JSON.parse(raw);
    } catch {}

    const patch = typeof patchOrFn === 'function' ? patchOrFn(current) : patchOrFn;

    const updated = { ...current };
    for (const [k, v] of Object.entries(patch)) {
      if (v === undefined) {
        delete updated[k];
      } else {
        updated[k] = v;
      }
    }

    const dir = dirname(SETTINGS_FILE);
    try { await mkdir(dir, { recursive: true }); } catch {}
    await writeFile(SETTINGS_FILE, JSON.stringify(updated, null, 2), 'utf-8');
  });
}
