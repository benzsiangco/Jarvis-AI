import { resolve, dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { homedir } from 'os';

let _root = null;

export function setProjectRoot(p) {
  _root = p;
}

export function getProjectRoot() {
  if (_root) return _root;
  const env = process.env.JARVIS_ROOT;
  if (env) return env;

  // When running as a compiled Bun binary, import.meta.url may not resolve
  // to a real path. Fall back to a safe user data directory.
  try {
    const __dirname = dirname(fileURLToPath(import.meta.url));
    const candidate = resolve(__dirname, '../../..');
    // Sanity check: must not be a root path like \ or /
    if (candidate && candidate.length > 3 && candidate !== '\\' && candidate !== '/') {
      return candidate;
    }
  } catch {}

  // Safe fallback: use OS user data dir
  return join(homedir(), 'AppData', 'Roaming', 'jarvis-ai');
}
