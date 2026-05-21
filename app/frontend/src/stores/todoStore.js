import { create } from 'zustand';

const useTodoStore = create((set) => ({
  items: [],

  addItem: (content, priority = 'medium') =>
    set((s) => ({
      items: [...s.items, { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), content, status: 'pending', priority }],
    })),

  updateItem: (id, updates) =>
    set((s) => ({
      items: s.items.map((i) => (i.id === id ? { ...i, ...updates } : i)),
    })),

  removeItem: (id) =>
    set((s) => ({
      items: s.items.filter((i) => i.id !== id),
    })),

  setItems: (items) =>
    set({ items }),

  toggleItem: (id) =>
    set((s) => ({
      items: s.items.map((i) =>
        i.id === id
          ? { ...i, status: i.status === 'completed' ? 'pending' : 'completed' }
          : i
      ),
    })),

  clearCompleted: () =>
    set((s) => ({
      items: s.items.filter((i) => i.status !== 'completed'),
    })),
}));

export default useTodoStore;
