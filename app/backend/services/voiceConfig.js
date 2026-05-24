/**
 * voiceConfig — STT settings + Supertonic TTS preferences.
 * Persisted in app-settings.json under the `voice` key.
 */
import { readSettings, updateSettings } from './settingsStore.js';

const DEFAULT = Object.freeze({
  // STT
  sttEnabled: true,

  // Supertonic TTS preferences
  tts: {
    voice: 'M1',   // M1-M5 (male), F1-F5 (female)
    speed: 1.05,
    lang:  'en',
  },
});

export async function getVoiceConfig() {
  const all = await readSettings();
  const v = all.voice || {};
  return {
    sttEnabled: v.sttEnabled !== false,
    tts: { ...DEFAULT.tts, ...(v.tts || {}) },
  };
}

export async function getVoiceConfigPublic() {
  return getVoiceConfig();
}

export async function setVoiceConfig(patch = {}) {
  const all = await readSettings();
  const current = all.voice || {};
  const next = {
    sttEnabled: patch.sttEnabled !== undefined ? !!patch.sttEnabled : (current.sttEnabled !== false),
    tts: {
      ...DEFAULT.tts,
      ...(current.tts || {}),
      ...(patch.tts || {}),
    },
  };
  await updateSettings({ voice: next });
  return getVoiceConfigPublic();
}
