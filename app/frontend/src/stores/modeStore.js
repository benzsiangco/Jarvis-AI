/**
 * App-mode + Voice Reactor Store
 *
 * Owns:
 *  - currentMode: 'voice' | 'chat'   (top-level workspace mode)
 *  - reactorState: 'idle' | 'listening' | 'thinking' | 'speaking' | 'offline'
 *  - amplitude:    0..1   (audio-reactive scale, fed by Web Audio API hook)
 *  - micEnabled:   boolean
 *  - muted:        boolean
 *
 * Switching modes never destroys other UI state — chat/editor/terminal
 * stores stay untouched, so returning to chat mode restores the workspace
 * exactly as it was.
 */
import { create } from 'zustand';

const MODE_KEY = 'jarvis:appMode';

function loadMode() {
  try {
    const v = localStorage.getItem(MODE_KEY);
    // Always start in chat mode — voice mode requires explicit activation
    return v === 'chat' ? 'chat' : 'chat';
  } catch {
    return 'chat';
  }
}

const useModeStore = create((set) => ({
  currentMode:  loadMode(),
  reactorState: 'idle',
  amplitude:    0,
  micEnabled:   false,
  muted:        false,   // mic mute (pauses listening)
  ttsEnabled:   true,    // TTS output enabled (separate from mic mute)

  setMode: (mode) => {
    if (mode !== 'chat' && mode !== 'voice') return;
    try { localStorage.setItem(MODE_KEY, mode); } catch {}
    set({ currentMode: mode });
  },

  setReactorState: (state) => {
    const valid = ['idle', 'listening', 'thinking', 'speaking', 'offline'];
    if (!valid.includes(state)) return;
    set({ reactorState: state });
  },

  setAmplitude: (a) => set({ amplitude: Math.max(0, Math.min(1, Number(a) || 0)) }),

  setMicEnabled: (v) => set({ micEnabled: !!v }),
  setMuted:      (v) => set({ muted:      !!v }),
  setTtsEnabled: (v) => set({ ttsEnabled: !!v }),

  toggleMute:    () => set((s) => ({ muted:      !s.muted })),
  toggleTts:     () => set((s) => ({ ttsEnabled: !s.ttsEnabled })),
  toggleMic:     () => set((s) => ({ micEnabled: !s.micEnabled })),
}));

export default useModeStore;
