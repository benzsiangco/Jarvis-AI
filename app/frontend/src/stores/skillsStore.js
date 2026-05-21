/**
 * Skills & Tools Store
 * Skills  = saved prompt templates injected into the chat on demand
 * Tools   = custom shell commands JARVIS can describe and call via runTerminal
 */
import { create } from 'zustand';

const STORAGE_KEY = 'jarvis:skills-tools';

function load() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); } catch { return {}; }
}
function save(state) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ skills: state.skills, tools: state.tools }));
}

const useSkillsStore = create((set, get) => ({
  // ── Skills ─────────────────────────────────────────────────────────────────
  skills: load().skills || [],

  addSkill: (skill) => {
    const next = [...get().skills, { id: crypto.randomUUID(), ...skill, createdAt: Date.now() }];
    set({ skills: next });
    save({ ...get(), skills: next });
  },

  updateSkill: (id, patch) => {
    const next = get().skills.map((s) => (s.id === id ? { ...s, ...patch } : s));
    set({ skills: next });
    save({ ...get(), skills: next });
  },

  removeSkill: (id) => {
    const next = get().skills.filter((s) => s.id !== id);
    set({ skills: next });
    save({ ...get(), skills: next });
  },

  // ── Custom Tools ───────────────────────────────────────────────────────────
  tools: load().tools || [],

  addTool: (tool) => {
    const next = [...get().tools, { id: crypto.randomUUID(), enabled: true, ...tool, createdAt: Date.now() }];
    set({ tools: next });
    save({ ...get(), tools: next });
  },

  updateTool: (id, patch) => {
    const next = get().tools.map((t) => (t.id === id ? { ...t, ...patch } : t));
    set({ tools: next });
    save({ ...get(), tools: next });
  },

  removeTool: (id) => {
    const next = get().tools.filter((t) => t.id !== id);
    set({ tools: next });
    save({ ...get(), tools: next });
  },

  toggleTool: (id) => {
    const next = get().tools.map((t) => (t.id === id ? { ...t, enabled: !t.enabled } : t));
    set({ tools: next });
    save({ ...get(), tools: next });
  },
}));

export default useSkillsStore;
