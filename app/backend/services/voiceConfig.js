/**
 * voiceConfig — provider settings for STT + TTS.
 *
 * Persisted in app-settings.json under the `voice` key.
 */
import { readSettings, updateSettings } from './settingsStore.js';

const DEFAULT = Object.freeze({
  provider: 'local',
  fish: {
    apiKey:     '',
    ttsModel:   's2-pro',
    ttsVoiceId: '',
    ttsFormat:  'mp3',
    language:   null,
    speed:      1.0,
    volume:     0,
  },
  local: {
    engine:        'piper',
    piperVoice:    '',
    neuttsVoice:   '',
    neuttsBackbone:'neuphonic/neutts-nano-q4-gguf',
    edgeVoice:     'en-GB-RyanNeural',
    edgeRate:      '+0%',
    edgePitch:     '+0Hz',
    edgeVolume:    '+0%',
    speed:         1.0,
  },
  browser: {
    voice:  '',
    rate:   1.0,
    pitch:  1.0,
    volume: 1.0,
  },
});

export async function getVoiceConfig() {
  const all = await readSettings();
  const v = all.voice || {};
  return {
    provider: ['fish', 'browser', 'local'].includes(v.provider) ? v.provider : 'local',
    fish:    { ...DEFAULT.fish,    ...(v.fish    || {}) },
    local:   { ...DEFAULT.local,   ...(v.local   || {}) },
    browser: { ...DEFAULT.browser, ...(v.browser || {}) },
  };
}

/** Public-safe view (no API key). For UI display. */
export async function getVoiceConfigPublic() {
  const cfg = await getVoiceConfig();
  return {
    provider: cfg.provider,
    fish: {
      ...cfg.fish,
      apiKey: cfg.fish.apiKey ? '****' + cfg.fish.apiKey.slice(-4) : '',
      hasApiKey: !!cfg.fish.apiKey,
    },
    local:   { ...cfg.local },
    browser: { ...cfg.browser },
  };
}

export async function setVoiceConfig(patch = {}) {
  const all = await readSettings();
  const current = all.voice || {};
  const next = {
    provider: ['fish', 'browser', 'local'].includes(patch.provider)
      ? patch.provider
      : (current.provider || DEFAULT.provider),
    fish: {
      ...DEFAULT.fish,
      ...(current.fish || {}),
      ...(patch.fish || {}),
    },
    local: {
      ...DEFAULT.local,
      ...(current.local || {}),
      ...(patch.local || {}),
    },
    browser: {
      ...DEFAULT.browser,
      ...(current.browser || {}),
      ...(patch.browser || {}),
    },
  };
  // Don't overwrite an existing key with an empty one — UI sends '' when unchanged.
  if (patch.fish && typeof patch.fish.apiKey === 'string' && patch.fish.apiKey === '') {
    next.fish.apiKey = (current.fish?.apiKey) || '';
  }
  await updateSettings({ voice: next });
  return getVoiceConfigPublic();
}
