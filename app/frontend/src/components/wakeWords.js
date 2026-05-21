/**
 * Wake-word matcher for Jarvis voice activation.
 *
 * The user can wake Jarvis by saying any phrase containing "jarvis" plus an
 * optional summons. We're permissive on purpose — Whisper produces varied
 * transcriptions of casual speech, so a strict regex would miss too much.
 *
 * matchWakeWord(text) returns:
 *   - 'wake'    : the phrase asks Jarvis to wake up / come online
 *   - 'address' : the phrase just addresses him by name (also activates)
 *   - null      : no wake intent detected
 */

const NAME_RE = /\bj[ae]rvis\b/i; // tolerate Whisper's "jervis"

const WAKE_HINTS = [
  /wake\s*up/i,
  /\bare\s+you\s+there\b/i,
  /\bare\s+you\s+(?:awake|online|here|ready|listening|with\s+me)\b/i,
  /\bcan\s+you\s+hear\s+me\b/i,
  /\bcome\s+(?:on|back|online)\b/i,
  /\bboot\s+up\b/i,
  /\bturn\s+on\b/i,
  /\bhello\s+there\b/i,
  /\bgood\s+(?:morning|afternoon|evening|day)\b/i,
  /\b(?:hey|yo|hi|hello)\b/i,
];

const SLEEP_HINTS = [
  /\bgo\s+to\s+sleep\b/i,
  /\bstand\s+down\b/i,
  /\bshut\s+down\b/i,
  /\bpower\s+down\b/i,
  /\bgo\s+offline\b/i,
  /\bthat'?s\s+all\b/i,
  /\bgoodbye\b/i,
  /\bnever\s+mind\b/i,
];

/**
 * Returns 'wake' | 'address' | null.
 * Only matches when the user mentions Jarvis by name — this avoids
 * accidental activations from random conversation.
 */
export function matchWakeWord(text) {
  const t = (text || '').trim();
  if (!t) return null;
  if (!NAME_RE.test(t)) return null;
  if (WAKE_HINTS.some((re) => re.test(t))) return 'wake';
  return 'address';
}

/** Returns true if the user is asking Jarvis to go offline. */
export function matchSleepWord(text) {
  const t = (text || '').trim();
  if (!t) return false;
  if (!NAME_RE.test(t)) return false;
  return SLEEP_HINTS.some((re) => re.test(t));
}

/** Strip the "Jarvis ..." preamble so the actual question is sent to the model. */
export function stripWakePrefix(text) {
  return (text || '')
    .replace(/^[\s,.!?-]*j[ae]rvis[\s,.!?-]+/i, '')
    .replace(/^(?:wake\s+up|are\s+you\s+there|hello|hi|hey|yo)[\s,.!?]*/i, '')
    .trim();
}
