/**
 * build-icons — sync the brand mark across all icon targets.
 *
 * Source of truth:
 *   <repo>/favicon.ico   (user-supplied multi-resolution Windows ICO)
 *
 * Outputs:
 *   public/favicon.ico            web favicon (copy of source)
 *   public/logo.png               256px PNG used by in-app <img> tags
 *   public/logo-core.png          192px transparent core for the reactor
 *   ../electron/icon.ico          Windows app icon (copy of source)
 *   ../electron/icon.png          512px PNG fallback for Linux/macOS
 *
 * Run after replacing the source ICO:  npm run build:icons
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT      = path.resolve(__dirname, '..');
const REPO_ROOT = path.resolve(ROOT, '..', '..');

const SRC_ICO = path.join(REPO_ROOT, 'favicon.ico');

const PUBLIC_FAVICON   = path.join(ROOT, 'public', 'favicon.ico');
const PUBLIC_LOGO_PNG  = path.join(ROOT, 'public', 'logo.png');
const PUBLIC_CORE_PNG  = path.join(ROOT, 'public', 'logo-core.png');
const ELECTRON_ICO     = path.resolve(ROOT, '..', 'electron', 'icon.ico');
const ELECTRON_PNG     = path.resolve(ROOT, '..', 'electron', 'icon.png');

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);

/**
 * Extract the largest frame from a Windows ICO and return it as a PNG buffer.
 * Modern ICOs at 256×256 store frames as PNG, which we forward directly.
 * Smaller frames may be raw BMP DIBs — those are reconstructed into a BMP
 * file and passed to sharp.
 */
async function icoToLargestPng(buffer) {
  if (buffer.readUInt16LE(0) !== 0 || buffer.readUInt16LE(2) !== 1) {
    throw new Error('Not an ICO file (bad header)');
  }
  const count = buffer.readUInt16LE(4);
  if (!count) throw new Error('ICO contains zero images');

  let best = null;
  for (let i = 0; i < count; i++) {
    const off = 6 + i * 16;
    const w   = buffer.readUInt8(off)     || 256;
    const h   = buffer.readUInt8(off + 1) || 256;
    const sz  = buffer.readUInt32LE(off + 8);
    const pos = buffer.readUInt32LE(off + 12);
    if (!best || w * h > best.w * best.h) best = { w, h, sz, pos };
  }

  const slice = buffer.subarray(best.pos, best.pos + best.sz);
  if (slice.subarray(0, 8).equals(PNG_MAGIC)) {
    return slice; // already PNG
  }

  // BMP DIB — wrap with a BITMAPFILEHEADER and decode through sharp.
  const fileHeader = Buffer.alloc(14);
  fileHeader.write('BM', 0, 'ascii');
  fileHeader.writeUInt32LE(slice.length + 14, 2);
  fileHeader.writeUInt32LE(0, 6);
  // Pixel-data offset = 14 (file header) + DIB header size
  const dibSize = slice.readUInt32LE(0);
  fileHeader.writeUInt32LE(14 + dibSize, 10);
  const bmp = Buffer.concat([fileHeader, slice]);
  return sharp(bmp).png().toBuffer();
}

async function rasterize(pngBuffer, size) {
  return sharp(pngBuffer)
    .resize(size, size, {
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 },
      kernel: 'lanczos3',
    })
    .png()
    .toBuffer();
}

async function main() {
  const icoBuffer = await fs.readFile(SRC_ICO);
  console.log(`[icons] source: ${path.relative(REPO_ROOT, SRC_ICO)} (${(icoBuffer.length / 1024).toFixed(1)} KB)`);

  const masterPng = await icoToLargestPng(icoBuffer);
  console.log(`[icons] extracted master PNG (${(masterPng.length / 1024).toFixed(1)} KB)`);

  const png256 = await rasterize(masterPng, 256);
  const png192 = await rasterize(masterPng, 192);
  const png512 = await rasterize(masterPng, 512);

  await fs.writeFile(PUBLIC_FAVICON,  icoBuffer);
  await fs.writeFile(PUBLIC_LOGO_PNG, png256);
  await fs.writeFile(PUBLIC_CORE_PNG, png192);
  console.log('[icons] wrote', path.relative(ROOT, PUBLIC_FAVICON));
  console.log('[icons] wrote', path.relative(ROOT, PUBLIC_LOGO_PNG));
  console.log('[icons] wrote', path.relative(ROOT, PUBLIC_CORE_PNG));

  await fs.mkdir(path.dirname(ELECTRON_ICO), { recursive: true });
  await fs.writeFile(ELECTRON_ICO, icoBuffer);
  await fs.writeFile(ELECTRON_PNG, png512);
  console.log('[icons] wrote', path.relative(ROOT, ELECTRON_ICO));
  console.log('[icons] wrote', path.relative(ROOT, ELECTRON_PNG));
}

main().catch((err) => {
  console.error('[icons] failed:', err);
  process.exit(1);
});
