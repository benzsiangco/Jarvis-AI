import { readdir, mkdir, stat, copyFile, unlink, rm, readFile, writeFile, rename } from 'fs/promises';
import { join, resolve, dirname, basename } from 'path';
import { fileURLToPath } from 'url';
import { createWriteStream, existsSync, mkdirSync, readFileSync } from 'fs';
import { spawn, execSync } from 'child_process';
import { getProjectRoot } from '../utils/root.js';

const ROOT = getProjectRoot();
const RUNTIME_DIR = join(ROOT, 'runtime');
const LLAMA_DIR = join(ROOT, 'llama-cpp');
const METADATA_FILE = join(RUNTIME_DIR, 'metadata.json');
const GITHUB_API = 'https://api.github.com/repos/ggml-org/llama.cpp/releases?per_page=10';

const BACKEND_MAP = {
  vulkan: { label: 'Vulkan', assetMatch: /win-vulkan-x64/, ext: 'zip' },
  cpu:    { label: 'CPU',    assetMatch: /win-cpu-x64/, ext: 'zip' },
  cuda:   { label: 'CUDA',   assetMatch: /win-cuda-12\./, ext: 'zip' },
};

const downloads = new Map();
let downloadIdCounter = 0;

function runtimeDir(backend, version) {
  return join(RUNTIME_DIR, 'versions', `${backend}-${version}`);
}

/* ── Load / save metadata ── */
async function loadMetadata() {
  try {
    const raw = await readFile(METADATA_FILE, 'utf8');
    return JSON.parse(raw);
  } catch {
    return { installed: [], active: null };
  }
}

async function saveMetadata(meta) {
  if (!existsSync(RUNTIME_DIR)) mkdirSync(RUNTIME_DIR, { recursive: true });
  await writeFile(METADATA_FILE, JSON.stringify(meta, null, 2));
}

/* ── Fetch available runtimes from GitHub ── */
export async function fetchAvailableRuntimes() {
  try {
    const res = await fetch(GITHUB_API, {
      headers: { 'User-Agent': 'JarvisAI/1.0', Accept: 'application/vnd.github.v3+json' },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) throw new Error(`GitHub API returned ${res.status}`);
    const releases = await res.json();
    if (!Array.isArray(releases)) return [];

    const meta = await loadMetadata();
    const entries = [];

    for (const release of releases) {
      const version = release.tag_name.replace(/^b/i, 'b');
      const published = release.published_at;
      const prerelease = release.prerelease;
      const body = (release.body || '').slice(0, 300);

      if (!release.assets) continue;

      for (const [backend, cfg] of Object.entries(BACKEND_MAP)) {
        const asset = release.assets.find((a) => cfg.assetMatch.test(a.name));
        if (!asset) continue;

        const id = `${backend}-${version}`;
        const installed = meta.installed.find((r) => r.id === id);
        const installedSize = installed
          ? await getInstalledSize(runtimeDir(backend, version))
          : 0;

        entries.push({
          id,
          backend,
          version,
          label: `${cfg.label} llama.cpp`,
          published,
          prerelease,
          changelog: body,
          size: asset.size,
          downloadUrl: asset.browser_download_url,
          installed: !!installed,
          installedSize,
          active: meta.active === id,
          installDir: installed ? runtimeDir(backend, version) : null,
        });
      }
    }
    return entries;
  } catch (err) {
    console.error('[runtimeManager] fetchAvailableRuntimes:', err.message);
    return [];
  }
}

/* ── Get installed runtimes ── */
export async function getInstalledRuntimes() {
  const meta = await loadMetadata();
  const result = [];
  for (const inst of meta.installed) {
    const dir = runtimeDir(inst.backend, inst.version);
    const size = await getInstalledSize(dir);
    result.push({
      id: inst.id,
      backend: inst.backend,
      version: inst.version,
      installedAt: inst.installedAt,
      size,
      active: meta.active === inst.id,
      dir,
      label: `${BACKEND_MAP[inst.backend]?.label || inst.backend} llama.cpp`,
    });
  }
  return result;
}

/* ── Start a runtime download ── */
export async function startDownload(backend) {
  const id = `dl-${++downloadIdCounter}`;
  const dl = { id, backend, status: 'queued', progress: 0, downloaded: 0, total: 0, speed: 0, eta: 0, stage: 'Queued', error: null, cancel: false };
  downloads.set(id, dl);

  process.nextTick(() => doDownload(dl));
  return id;
}

export function getDownload(id) {
  return downloads.get(id) || null;
}

/* ── Internal download logic ── */
async function doDownload(dl) {
  try {
    const available = await fetchAvailableRuntimes();
    const entry = available.find((e) => e.backend === dl.backend && !e.installed);
    if (!entry) {
      const existing = available.find((e) => e.backend === dl.backend && e.installed);
      if (existing) {
        dl.status = 'done';
        dl.stage = 'Already installed';
        dl.progress = 1;
        return;
      }
      dl.status = 'error';
      dl.error = `No ${dl.backend} runtime available for download`;
      return;
    }

    const dlDir = runtimeDir(entry.backend, entry.version);
    const tmpDir = join(RUNTIME_DIR, '.tmp', dl.id);
    const zipPath = join(tmpDir, 'runtime.zip');

    if (!existsSync(tmpDir)) mkdirSync(tmpDir, { recursive: true });

    dl.stage = 'Downloading';
    dl.status = 'downloading';
    dl.total = entry.size;

    const res = await fetch(entry.downloadUrl, { signal: AbortSignal.timeout(600000) });
    if (!res.ok) throw new Error(`Download failed: HTTP ${res.status}`);
    const reader = res.body.getReader();
    const writer = createWriteStream(zipPath);
    let downloaded = 0;
    const startTime = Date.now();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (dl.cancel) { writer.close(); throw new Error('Download cancelled'); }
      writer.write(Buffer.from(value));
      downloaded += value.length;
      dl.downloaded = downloaded;
      dl.progress = Math.min(0.99, downloaded / entry.size);

      const elapsed = (Date.now() - startTime) / 1000;
      dl.speed = elapsed > 0 ? downloaded / elapsed : 0;
      dl.eta = dl.speed > 0 ? (entry.size - downloaded) / dl.speed : 0;
    }
    writer.close();

    dl.stage = 'Extracting';
    dl.status = 'extracting';
    await extractZip(zipPath, tmpDir);

    dl.stage = 'Installing';
    dl.status = 'installing';
    if (!existsSync(dlDir)) mkdirSync(dlDir, { recursive: true });
    const extractedItems = await readdir(tmpDir);
    for (const item of extractedItems) {
      if (item === 'runtime.zip') continue;
      const src = join(tmpDir, item);
      const dst = join(dlDir, item);
      try { await rename(src, dst); } catch { await copyDir(src, dst); }
    }

    await rm(tmpDir, { recursive: true, force: true });

    const meta = await loadMetadata();
    const existingIdx = meta.installed.findIndex((r) => r.id === entry.id);
    const record = { id: entry.id, backend: entry.backend, version: entry.version, installedAt: new Date().toISOString() };
    if (existingIdx >= 0) meta.installed[existingIdx] = record;
    else meta.installed.push(record);
    await saveMetadata(meta);

    dl.status = 'done';
    dl.stage = 'Installed';
    dl.progress = 1;
  } catch (err) {
    if (err.message === 'Download cancelled') {
      dl.status = 'cancelled';
      dl.stage = 'Cancelled';
    } else {
      dl.status = 'error';
      dl.error = err.message;
      dl.stage = 'Error';
    }
  }
}

/* ── Activate a runtime ── */
export async function activateRuntime(runtimeId) {
  const meta = await loadMetadata();
  const inst = meta.installed.find((r) => r.id === runtimeId);
  if (!inst) throw new Error(`Runtime not installed: ${runtimeId}`);

  const srcDir = runtimeDir(inst.backend, inst.version);
  if (!existsSync(srcDir)) throw new Error(`Runtime directory not found: ${srcDir}`);

  const srcFiles = await readdir(srcDir);
  for (const file of srcFiles) {
    const src = join(srcDir, file);
    const dst = join(LLAMA_DIR, file);
    try {
      const s = await stat(src);
      if (s.isFile()) await copyFile(src, dst);
    } catch {}
  }

  meta.active = runtimeId;
  await saveMetadata(meta);
  return { success: true, runtimeId };
}

/* ── Remove a runtime ── */
export async function removeRuntime(runtimeId) {
  const meta = await loadMetadata();
  const idx = meta.installed.findIndex((r) => r.id === runtimeId);
  if (idx < 0) throw new Error(`Runtime not found: ${runtimeId}`);

  const inst = meta.installed[idx];
  const dir = runtimeDir(inst.backend, inst.version);
  await rm(dir, { recursive: true, force: true });

  meta.installed.splice(idx, 1);
  if (meta.active === runtimeId) meta.active = null;
  await saveMetadata(meta);
  return { success: true };
}

/* ── Cancel a download ── */
export function cancelDownload(downloadId) {
  const dl = downloads.get(downloadId);
  if (!dl) return false;
  dl.cancel = true;
  return true;
}

/* ── Get current llama.cpp version + detected backend ── */
export function getCurrentVersion() {
  try {
    // spawnSync is safer than execSync in compiled Bun binaries
    const { spawnSync } = require('child_process');
    const result = spawnSync(join(LLAMA_DIR, 'llama-server.exe'), ['--version'], {
      encoding: 'utf8', timeout: 5000, stdio: ['ignore', 'pipe', 'pipe'],
    });
    const out = (result.stdout || '') + (result.stderr || '');
    const m = out.match(/version:\s*(\d+)\s*\(([^)]+)\)/);
    if (!m) return null;
    let backend = 'cpu';
    try {
      const files = readdirSync(LLAMA_DIR);
      if (files.some((f) => /^vulkan-1\.dll$/i.test(f))) backend = 'vulkan';
      else if (files.some((f) => /cublas64_/i.test(f))) backend = 'cuda';
    } catch {}
    return { build: m[1], commit: m[2], backend };
  } catch {
    return null;
  }
}

/* ── Cancel an active download ── */
export function cancelActiveDownload() {
  for (const [id, dl] of downloads) {
    if (dl.status === 'downloading' || dl.status === 'extracting' || dl.status === 'installing') {
      dl.cancel = true;
      return id;
    }
  }
  return null;
}

/* ── Helpers ── */
async function getInstalledSize(dir) {
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    let total = 0;
    for (const entry of entries) {
      if (entry.isDirectory()) total += await getInstalledSize(join(dir, entry.name));
      else total += (await stat(join(dir, entry.name))).size;
    }
    return total;
  } catch { return 0; }
}

async function copyDir(src, dst) {
  const entries = await readdir(src, { withFileTypes: true });
  if (!existsSync(dst)) mkdirSync(dst, { recursive: true });
  for (const entry of entries) {
    const s = join(src, entry.name);
    const d = join(dst, entry.name);
    if (entry.isDirectory()) await copyDir(s, d);
    else await copyFile(s, d);
  }
}

async function extractZip(zipPath, dest) {
  return new Promise((resolve, reject) => {
    const proc = spawn('powershell', [
      '-NoProfile', '-Command',
      `Expand-Archive -Path "${zipPath}" -DestinationPath "${dest}" -Force`,
    ], { stdio: 'pipe', timeout: 120000, windowsHide: true });
    let err = '';
    proc.stderr.on('data', (d) => { err += d.toString(); });
    proc.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`Extract failed (exit ${code}): ${err.slice(0, 200)}`));
    });
    proc.on('error', reject);
  });
}
