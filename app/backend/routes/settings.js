import { readSettings, updateSettings } from '../services/settingsStore.js';

export async function getSystemInstructions() {
  const data = await readSettings();
  return data.systemInstructions || '';
}

export async function saveSystemInstructions(text) {
  await updateSettings({ systemInstructions: text });
}

export async function getPersonaOverride() {
  const data = await readSettings();
  return typeof data.personaOverride === 'string' ? data.personaOverride : null;
}

export async function savePersonaOverride(text) {
  if (text && text.trim()) {
    await updateSettings({ personaOverride: text.trim() });
  } else {
    // Remove the key by setting it to undefined — updateSettings spreads the patch,
    // so we pass a full replacement via a custom delete path.
    await updateSettings({ personaOverride: undefined });
  }
}
