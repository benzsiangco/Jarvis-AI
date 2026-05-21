import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

let _root = null;

export function setProjectRoot(p) {
  _root = p;
}

export function getProjectRoot() {
  if (_root) return _root;
  const env = process.env.JARVIS_ROOT;
  if (env) return env;
  const __dirname = dirname(fileURLToPath(import.meta.url));
  return resolve(__dirname, '../../..');
}
