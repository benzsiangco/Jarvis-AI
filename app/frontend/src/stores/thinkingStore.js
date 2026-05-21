import { create } from 'zustand';

/**
 * thinkingStore — real-time AI reasoning feed.
 * Events stream in from backend SSE; each has a type, message, optional reasoning.
 */

const ACTIVE_TYPES = new Set([
  'analyzing', 'inspecting', 'searching', 'planning',
  'editing', 'validating', 'running_command',
  'reading_file', 'writing_file', 'diff_generation',
  'model_generation', 'tool_execution', 'awaiting_approval',
  'thoughts',
]);

// Map event types → panel status bucket
const STATUS_MAP = {
  analyzing:         'analyzing',
  inspecting:        'inspecting',
  reading_file:      'inspecting',
  searching:         'searching',
  planning:          'planning',
  planning_patch:    'planning',
  editing:           'editing',
  diff_generation:   'editing',
  writing_file:      'editing',
  validating:        'validating',
  running_command:   'running',
  tool_execution:    'running',
  awaiting_approval: 'approval',
  model_generation:  'thinking',
  thoughts:          'thinking',
  done:              'idle',
};


const useThinkingStore = create((set, get) => ({
  events: [],      // full event log
  status: 'idle',  // current coarse status
  isOpen: true,    // panel open/collapsed
  round: 0,        // current agent tool round

  setOpen: (isOpen) => set({ isOpen }),

  clear: () => set({ events: [], status: 'idle', round: 0 }),

  bumpRound: () => set((s) => ({ round: s.round + 1 })),

  emit: (event) =>
    set((state) => {
      const ts = event.ts ?? Date.now();

      // Upsert "thoughts" events on the current round so the panel shows
      // a single growing chain-of-thought instead of one row per chunk.
      if (event.type === 'thoughts') {
        const events = [...state.events];
        const idx = events.findLastIndex(
          (e) => e.type === 'thoughts' && e.round === state.round,
        );
        if (idx >= 0) {
          events[idx] = { ...events[idx], reasoning: event.reasoning, message: event.message || events[idx].message };
        } else {
          const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
          events.push({ id, ts, round: state.round, ...event });
        }
        return { events: events.slice(-120), status: 'thinking' };
      }

      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const next = { id, ts, round: state.round, ...event };

      const status =
        next.type === 'done'
          ? 'idle'
          : STATUS_MAP[next.type] ?? state.status;

      // Keep last 120 events max
      const events = [...state.events.slice(-119), next];

      return { events, status };
    }),
}));

/** Called from anywhere (stores, chatStore) to emit a thinking event */
export function emitThinking(event) {
  useThinkingStore.getState().emit(event);
}

/** Called when agent starts a new tool round */
export function bumpThinkingRound() {
  useThinkingStore.getState().bumpRound();
}

export default useThinkingStore;
