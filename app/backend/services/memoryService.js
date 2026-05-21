/**
 * memoryService — JARVIS long-term memory.
 *
 * Stores user-supplied facts (name, preferences, ongoing projects, etc.)
 * keyed by id, persisted in app-settings.json under `memories`. Each
 * memory is a {id, content, tags, ts} record.
 *
 * Surfaced into every chat turn via getMemoryContext(), so JARVIS can
 * recall the user's name, preferences, and prior decisions without the
 * user having to repeat themselves.
 */
import { randomUUID } from 'crypto';
import { readSettings, updateSettings } from './settingsStore.js';

const MAX_MEMORIES       = 200;
const MAX_CONTEXT_LENGTH = 2500;  // chars injected per system prompt
const MAX_CONTENT_LENGTH = 1000;  // per-memory cap

/** Read the raw list directly from disk (bypasses cache). */
async function readList() {
  const all = await readSettings();
  return Array.isArray(all.memories) ? [...all.memories] : [];
}

export async function getAllMemories() {
  return readList();
}

/**
 * Store a new memory. Returns the saved record.
 * If `id` matches an existing memory it is updated; otherwise a new one is created.
 */
export async function saveMemory({ id, content, tags } = {}) {
  if (typeof content !== 'string' || !content.trim()) {
    throw new Error('content required');
  }
  const trimmed = content.trim().slice(0, MAX_CONTENT_LENGTH);
  const cleanTags = Array.isArray(tags)
    ? tags.map((t) => String(t).trim().toLowerCase()).filter(Boolean).slice(0, 8)
    : [];

  // Use updateSettings with a function so the read + mutate + write
  // all happen atomically inside the write queue.
  let record;
  await updateSettings((current) => {
    const list = Array.isArray(current.memories) ? [...current.memories] : [];

    if (id) {
      const idx = list.findIndex((m) => m.id === id);
      if (idx >= 0) {
        record = { ...list[idx], content: trimmed, tags: cleanTags, ts: Date.now() };
        list[idx] = record;
      }
    }
    if (!record) {
      record = { id: id || randomUUID(), content: trimmed, tags: cleanTags, ts: Date.now() };
      list.push(record);
    }

    // Cap total — drop oldest first
    while (list.length > MAX_MEMORIES) list.shift();

    return { memories: list };
  });

  return record;
}

/** Delete by id. Returns true if removed. */
export async function deleteMemory(id) {
  if (!id) return false;
  let removed = false;
  await updateSettings((current) => {
    const list = Array.isArray(current.memories) ? [...current.memories] : [];
    const idx = list.findIndex((m) => m.id === id);
    if (idx >= 0) { list.splice(idx, 1); removed = true; }
    return { memories: list };
  });
  return removed;
}

/** Wipe everything. */
export async function clearMemories() {
  await updateSettings(() => ({ memories: [] }));
}

/**
 * Build a compact text block for injection into the JARVIS system prompt.
 * Returns '' when no memories exist.
 */
export async function getMemoryContext() {
  const list = await readList();
  if (!list.length) return '';

  // Newest first so the most recent facts dominate when truncated.
  const sorted = [...list].sort((a, b) => (b.ts || 0) - (a.ts || 0));

  const lines = [];
  let total = 0;
  for (const m of sorted) {
    const line = `- ${m.content}`;
    if (total + line.length > MAX_CONTEXT_LENGTH) break;
    lines.push(line);
    total += line.length + 1;
  }
  if (!lines.length) return '';

  return [
    '=== MEMORY (things you know about the user) ===',
    'Use these naturally — do NOT recite them back unless asked.',
    ...lines,
  ].join('\n');
}

/** Search memories by substring or tag. Returns up to `limit` matches. */
export async function searchMemories(query, limit = 20) {
  const list = await readList();
  const q = String(query || '').toLowerCase().trim();
  if (!q) return list.slice(-limit).reverse();
  return list
    .filter((m) =>
      m.content.toLowerCase().includes(q) ||
      (m.tags || []).some((t) => t.includes(q))
    )
    .sort((a, b) => (b.ts || 0) - (a.ts || 0))
    .slice(0, limit);
}
