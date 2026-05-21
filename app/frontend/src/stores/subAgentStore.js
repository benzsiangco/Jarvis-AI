/**
 * Sub-Agent Store
 *
 * Tracks all sub-agents spawned in the current session.
 * Each agent has: id, task, status, steps[], answer
 */
import { create } from 'zustand';

const useSubAgentStore = create((set, get) => ({
  agents: [],   // { id, task, context, status, steps, answer, startedAt, endedAt }

  start: ({ id, task, context }) =>
    set((s) => ({
      agents: [
        ...s.agents,
        { id, task, context, status: 'running', steps: [], answer: null, startedAt: Date.now(), endedAt: null },
      ],
    })),

  update: ({ id, step, tool, args, status, output }) =>
    set((s) => ({
      agents: s.agents.map((a) => {
        if (a.id !== id) return a;
        const steps = [...a.steps];
        const idx = steps.findIndex((st) => st.step === step);
        const entry = { step, tool, args, status, output };
        if (idx >= 0) steps[idx] = entry;
        else steps.push(entry);
        return { ...a, steps };
      }),
    })),

  done: ({ id, answer, steps }) =>
    set((s) => ({
      agents: s.agents.map((a) =>
        a.id === id
          ? { ...a, status: 'done', answer, steps: steps || a.steps, endedAt: Date.now() }
          : a
      ),
    })),

  error: ({ id, error }) =>
    set((s) => ({
      agents: s.agents.map((a) =>
        a.id === id ? { ...a, status: 'error', answer: error, endedAt: Date.now() } : a
      ),
    })),

  clear: () => set({ agents: [] }),

  get activeCount() { return get().agents.filter((a) => a.status === 'running').length; },
}));

export default useSubAgentStore;
