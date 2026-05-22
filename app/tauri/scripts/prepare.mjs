/**
 * Prepare Tauri build inputs:
 *   1. Detect host target triple via `rustc -vV`
 *   2. Copy the Bun-compiled server.exe → binaries/server-<triple>.exe
 *   3. Mirror llama-cpp/ into the bundle resources via tauri.conf.json
 *      (handled by `bundle.resources` patching here so we keep ONE source
 *      of truth: the repo-root /llama-cpp folder.)
 *
 * Run before `tauri build`.
 */
import { execSync } from 'node:child_process';
import { promises as fs } from 'node:fs';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TAURI_DIR = path.resolve(__dirname, '..');
const REPO_ROOT = path.resolve(TAURI_DIR, '..', '..');

const BINARIES_DIR = path.join(TAURI_DIR, 'binaries');
const RES_DIR = path.join(TAURI_DIR, 'resources');
const SRC_BACKEND = path.join(REPO_ROOT, 'dist', 'backend', 'server.exe');
const SRC_LLAMA = path.join(REPO_ROOT, 'llama-cpp');
const CONF_PATH = path.join(TAURI_DIR, 'tauri.conf.json');

function rustHostTriple() {
  // Use the project-level toolchain (rust-toolchain.toml) so the triple
  // matches whatever Tauri will actually compile with — even if the user
  // has a different default toolchain installed system-wide.
  const out = execSync('rustc -vV', { encoding: 'utf8', cwd: TAURI_DIR });
  const m = out.match(/host:\s*(.+)/);
  if (!m) throw new Error('Could not determine rustc host triple');
  return m[1].trim();
}

async function copyDir(src, dest) {
  await fs.mkdir(dest, { recursive: true });
  const entries = await fs.readdir(src, { withFileTypes: true });
  for (const entry of entries) {
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) await copyDir(s, d);
    else await fs.copyFile(s, d);
  }
}

async function main() {
  const triple = rustHostTriple();
  console.log(`[tauri-prep] host triple: ${triple}`);

  // 0. Kill any running Jarvis AI instances so DLLs aren't locked during install
  if (triple.includes('windows')) {
    try {
      execSync('taskkill /F /IM jarvis.exe /T 2>nul', { stdio: 'pipe' });
      console.log('[tauri-prep] killed running jarvis.exe');
    } catch {}
    try {
      execSync('taskkill /F /IM server.exe /T 2>nul', { stdio: 'pipe' });
      console.log('[tauri-prep] killed running server.exe');
    } catch {}
  }

  // 1. Sidecar binary
  if (!existsSync(SRC_BACKEND)) {
    throw new Error(`Backend not found at ${SRC_BACKEND}. Run "npm run build:backend" first.`);
  }
  await fs.mkdir(BINARIES_DIR, { recursive: true });
  const isWin = triple.includes('windows');
  const binDest = path.join(BINARIES_DIR, `server-${triple}${isWin ? '.exe' : ''}`);
  await fs.copyFile(SRC_BACKEND, binDest);
  console.log(`[tauri-prep] copied sidecar → ${path.relative(TAURI_DIR, binDest)}`);

  // 1b. Embed the asInvoker manifest into the sidecar so Windows SmartScreen
  //     knows it doesn't need elevation and won't prompt the user.
  if (isWin) {
    const manifestSrc = path.join(REPO_ROOT, 'app', 'backend', 'server.manifest');
    if (existsSync(manifestSrc)) {
      // mt.exe ships with the Windows SDK (MSVC Build Tools).
      const mtCandidates = [
        'C:\\Program Files (x86)\\Windows Kits\\10\\bin\\10.0.22621.0\\x64\\mt.exe',
        'C:\\Program Files (x86)\\Windows Kits\\10\\bin\\x64\\mt.exe',
      ];
      const mt = mtCandidates.find(existsSync);
      if (mt) {
        try {
          execSync(`"${mt}" -nologo -manifest "${manifestSrc}" -outputresource:"${binDest}";#1`, {
            stdio: 'pipe',
          });
          console.log('[tauri-prep] embedded asInvoker manifest into sidecar');
        } catch (e) {
          console.warn('[tauri-prep] manifest embed failed (non-fatal):', e.message?.slice(0, 120));
        }
      } else {
        console.warn('[tauri-prep] mt.exe not found — skipping manifest embed');
      }
    }
  }

  // 2. llama-cpp resources
  if (existsSync(SRC_LLAMA)) {
    const llamaDest = path.join(RES_DIR, 'llama-cpp');
    if (existsSync(llamaDest)) {
      await fs.rm(llamaDest, { recursive: true, force: true });
    }
    await copyDir(SRC_LLAMA, llamaDest);
    console.log(`[tauri-prep] copied llama-cpp → ${path.relative(TAURI_DIR, llamaDest)}`);
  } else {
    console.warn(`[tauri-prep] llama-cpp not found at ${SRC_LLAMA} — skipping`);
  }

  // 3. Voice sidecar scripts
  const SRC_VOICE = path.join(REPO_ROOT, 'app', 'voice');
  const VOICE_DEST = path.join(RES_DIR, 'voice');
  if (existsSync(SRC_VOICE)) {
    if (existsSync(VOICE_DEST)) {
      await fs.rm(VOICE_DEST, { recursive: true, force: true });
    }
    await fs.mkdir(VOICE_DEST, { recursive: true });
    // Copy only the Python scripts (not large binary files)
    const voiceFiles = ['sidecar.py', 'launch.py', 'requirements.txt'];
    for (const f of voiceFiles) {
      const src = path.join(SRC_VOICE, f);
      if (existsSync(src)) {
        await fs.copyFile(src, path.join(VOICE_DEST, f));
      }
    }
    console.log(`[tauri-prep] copied voice scripts → ${path.relative(TAURI_DIR, VOICE_DEST)}`);
  }

  // 4. Patch tauri.conf.json's bundle.resources
  const conf = JSON.parse(await fs.readFile(CONF_PATH, 'utf8'));
  conf.bundle = conf.bundle || {};
  conf.bundle.resources = ['resources/llama-cpp/**/*', 'resources/voice/**/*'];
  await fs.writeFile(CONF_PATH, JSON.stringify(conf, null, 2));
  console.log('[tauri-prep] patched tauri.conf.json bundle.resources');
}

main().catch((err) => {
  console.error('[tauri-prep] failed:', err);
  process.exit(1);
});
