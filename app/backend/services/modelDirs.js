/**
 * modelDirs — manages the list of "linked" external folders that the user
 * has pointed at as additional sources of .gguf models.
 *
 * Persisted in app-settings.json under `linkedModelDirs: string[]`.
 */
import { access } from 'fs/promises';
import { readSettings, updateSettings } from './settingsStore.js';

async function dirExists(path) {
  try { await access(path); return true; } catch { return false; }
}

/** Returns the array of linked model dirs (validated to exist). */
export async function getLinkedModelDirs() {
  const settings = await readSettings();
  const raw = Array.isArray(settings.linkedModelDirs) ? settings.linkedModelDirs : [];
  const valid = [];
  for (const dir of raw) {
    if (typeof dir !== 'string' || !dir.trim()) continue;
    if (await dirExists(dir)) valid.push(dir);
  }
  return valid;
}

/** Returns the raw list (including unreachable paths) for UI display. */
export async function getRawLinkedModelDirs() {
  const settings = await readSettings();
  return Array.isArray(settings.linkedModelDirs) ? settings.linkedModelDirs : [];
}

export async function addLinkedModelDir(dir) {
  if (typeof dir !== 'string' || !dir.trim()) throw new Error('dir required');
  if (!(await dirExists(dir))) throw new Error('Directory does not exist');
  const settings = await readSettings();
  const list = Array.isArray(settings.linkedModelDirs) ? settings.linkedModelDirs : [];
  if (!list.includes(dir)) list.push(dir);
  await updateSettings({ linkedModelDirs: list });
  return list;
}

export async function removeLinkedModelDir(dir) {
  const settings = await readSettings();
  const list = Array.isArray(settings.linkedModelDirs) ? settings.linkedModelDirs : [];
  const updated = list.filter((d) => d !== dir);
  await updateSettings({ linkedModelDirs: updated });
  return updated;
}
