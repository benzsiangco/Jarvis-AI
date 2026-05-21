import { open, readdir, stat } from 'fs/promises';
import { basename, join } from 'path';

const GGUF_MAGIC = 0x46554747;
const GGUF_STRING = 8;
const GGUF_ARRAY = 9;
const INTERESTING_KEYS = new Set([
  'general.name',
  'general.architecture',
  'general.type',
  'general.basename',
  'general.description',
  'general.file_type',
  'tokenizer.ggml.model',
]);

const TYPE_SIZES = {
  0: 1,
  1: 1,
  2: 2,
  3: 2,
  4: 4,
  5: 4,
  6: 4,
  7: 1,
  10: 8,
  11: 8,
  12: 8,
};

export async function listModelsFromDirectory(modelsDir) {
  try {
    const entries = await collectGgufEntries(modelsDir);
    const fileModels = [];
    const seen = new Set();

    for (const entry of entries) {
      const filename = basename(entry.path);
      if (seen.has(filename)) continue;
      seen.add(filename);
      try {
        const info = await stat(entry.path);
        const metadata = await readGgufMetadata(entry.path);
        fileModels.push(buildFileModel({ filename, path: entry.path, size: info.size, metadata }));
      } catch {}
    }

    return groupRelatedModels(fileModels);
  } catch (e) {
    console.error('[modelCatalog] error:', e.message);
    return [];
  }
}

export async function collectGgufEntries(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await collectGgufEntries(fullPath));
      continue;
    }
    if (entry.isFile() && entry.name.toLowerCase().endsWith('.gguf')) {
      files.push({ path: fullPath });
    }
  }
  return files;
}

function buildFileModel({ filename, path, size, metadata }) {
  const rawName = filename.replace(/\.gguf$/i, '');
  const metaName = firstString(metadata, ['general.name', 'tokenizer.ggml.model']);
  const architecture = firstString(metadata, ['general.architecture']);
  const quant = extractQuant(rawName);
  const isProjector = isMmprojFile(filename, metadata);
  return {
    id: filename,
    kind: 'file',
    name: metaName || rawName,
    filename,
    primaryFilename: filename,
    path,
    size,
    sizeMB: Math.round(size / 1024 / 1024),
    architecture: architecture || inferArchitecture(rawName),
    quant,
    multimodal: isProjector,
    mmproj: isProjector,
  };
}

function groupRelatedModels(files) {
  const groups = new Map();
  for (const file of files) {
    const key = buildGroupKey(file);
    const group = groups.get(key) || { key, files: [] };
    group.files.push(file);
    groups.set(key, group);
  }

  const models = [];
  for (const group of groups.values()) {
    const base = group.files.find((file) => !file.mmproj) || group.files[0];
    const projectors = group.files.filter((file) => file.mmproj);
    const totalSize = group.files.reduce((sum, file) => sum + file.size, 0);
    const multimodal = projectors.length > 0 && !!group.files.find((file) => !file.mmproj);

    models.push({
      ...base,
      kind: group.files.length > 1 ? 'group' : 'file',
      name: cleanDisplayName(base.name || base.filename),
      filename: base.filename,
      primaryFilename: base.filename,
      size: totalSize,
      sizeMB: Math.round(totalSize / 1024 / 1024),
      multimodal,
      mmproj: multimodal,
      mmprojFilename: projectors[0]?.filename || null,
      files: group.files.map((file) => ({
        filename: file.filename,
        size: file.size,
        sizeMB: file.sizeMB,
        role: file.mmproj ? 'projector' : 'model',
      })),
      fileCount: group.files.length,
    });
  }

  models.sort((a, b) => a.name.localeCompare(b.name));
  return models;
}

function buildGroupKey(file) {
  const stem = (file.filename || file.name || '')
    .toLowerCase()
    .replace(/\.gguf$/i, '')
    .replace(/^mmproj[-_]?/i, '')
    .replace(/(?:[-_.](?:iq|q)\d(?:[-_.][a-z0-9]+)*)$/i, '');
  const parts = stem.split(/[-_.]+/).filter(Boolean);
  const kept = parts.filter((part) => {
    if (['mmproj', 'vision', 'multimodal', 'vl', 'it', 'instruct', 'chat', 'bf16', 'f16', 'f32', 'fp16', 'fp32'].includes(part)) return false;
    return true;
  });
  return kept.join('-');
}

function cleanDisplayName(name) {
  return (name || 'Model')
    .replace(/^mmproj[-_]?/i, '')
    .replace(/\.gguf$/i, '')
    .trim();
}

function extractQuant(name) {
  const match = (name || '').match(/(?:^|[-_])((?:IQ|Q)\d(?:_[A-Z0-9]+)*)$/i);
  return match?.[1]?.toUpperCase() || '';
}

function inferArchitecture(name) {
  const lower = (name || '').toLowerCase();
  if (lower.includes('gemma')) return 'Gemma';
  if (lower.includes('nemotron')) return 'Nemotron';
  if (lower.includes('llama')) return 'LLaMA';
  return '';
}

function isMmprojFile(filename, metadata) {
  const lower = filename.toLowerCase();
  if (lower.includes('mmproj')) return true;
  const projectorKey = Object.keys(metadata || {}).find((key) => /mmproj|vision|projector|clip/i.test(key));
  return !!projectorKey;
}

function firstString(metadata, keys) {
  for (const key of keys) {
    const value = metadata?.[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}

async function readGgufMetadata(filePath) {
  let handle;
  try {
    handle = await open(filePath, 'r');
    const headerBuffer = Buffer.alloc(8 * 1024 * 1024);
    const { bytesRead } = await handle.read(headerBuffer, 0, headerBuffer.length, 0);
    const buffer = headerBuffer.subarray(0, bytesRead);
    return parseGgufMetadataBuffer(buffer);
  } catch {
    return {};
  } finally {
    await handle?.close().catch(() => {});
  }
}

function parseGgufMetadataBuffer(buffer) {
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  let offset = 0;
  if (view.getUint32(offset, true) !== GGUF_MAGIC) return {};
  offset += 4;
  const version = view.getUint32(offset, true);
  offset += 4;

  if (version < 2 || version > 3) return {};

  offset += 8; // tensor count
  const metadataCount = Number(view.getBigUint64(offset, true));
  offset += 8;

  const metadata = {};
  for (let i = 0; i < metadataCount; i++) {
    const keyValue = readString(buffer, view, offset);
    if (!keyValue) break;
    offset = keyValue.offset;
    const type = view.getUint32(offset, true);
    offset += 4;
    const parsed = readValue(buffer, view, offset, type);
    if (!parsed) break;
    offset = parsed.offset;
    if (INTERESTING_KEYS.has(keyValue.value)) metadata[keyValue.value] = parsed.value;
  }
  return metadata;
}

function readValue(buffer, view, offset, type) {
  if (type === GGUF_STRING) return readString(buffer, view, offset);
  if (type === GGUF_ARRAY) {
    const elementType = view.getUint32(offset, true);
    offset += 4;
    const count = Number(view.getBigUint64(offset, true));
    offset += 8;
    for (let i = 0; i < count; i++) {
      const item = readValue(buffer, view, offset, elementType);
      if (!item) return null;
      offset = item.offset;
    }
    return { value: null, offset };
  }
  const size = TYPE_SIZES[type];
  if (!size || offset + size > buffer.length) return null;
  switch (type) {
    case 0: return { value: view.getUint8(offset), offset: offset + 1 };
    case 1: return { value: view.getInt8(offset), offset: offset + 1 };
    case 2: return { value: view.getUint16(offset, true), offset: offset + 2 };
    case 3: return { value: view.getInt16(offset, true), offset: offset + 2 };
    case 4: return { value: view.getUint32(offset, true), offset: offset + 4 };
    case 5: return { value: view.getInt32(offset, true), offset: offset + 4 };
    case 6: return { value: view.getFloat32(offset, true), offset: offset + 4 };
    case 7: return { value: !!view.getUint8(offset), offset: offset + 1 };
    case 10: return { value: Number(view.getBigUint64(offset, true)), offset: offset + 8 };
    case 11: return { value: Number(view.getBigInt64(offset, true)), offset: offset + 8 };
    case 12: return { value: view.getFloat64(offset, true), offset: offset + 8 };
    default: return null;
  }
}

function readString(buffer, view, offset) {
  if (offset + 8 > buffer.length) return null;
  const len = Number(view.getBigUint64(offset, true));
  offset += 8;
  if (offset + len > buffer.length) return null;
  return {
    value: buffer.subarray(offset, offset + len).toString('utf8'),
    offset: offset + len,
  };
}
