/**
 * promptQueueStore — prompt queue for JARVIS.
 * Queues prompts while model is busy, persists across refresh.
 */
import { create } from 'zustand';

function genId() {
  return `q-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function loadPersisted() {
  try {
    const raw = localStorage.getItem('jarvis:promptQueue');
    if (!raw) return [];
    const items = JSON.parse(raw);
    // On reload, reset processing/waiting states back to queued
    return items
      .filter((i) => i.status !== 'completed' && i.status !== 'cancelled')
      .map((i) => ({
        ...i,
        status: i.status === 'processing' || i.status === 'waiting_tools' ? 'queued' : i.status,
      }));
  } catch { return []; }
}

function savePersisted(items) {
  try {
    localStorage.setItem('jarvis:promptQueue', JSON.stringify(
      items.filter((i) => i.status !== 'completed' && i.status !== 'cancelled').slice(-20)
    ));
  } catch {}
}

const usePromptQueueStore = create((set, get) => ({
  queue: loadPersisted(),

  enqueue: (content, attachments = [], opts = {}) => {
    const item = {
      id: genId(),
      content,
      attachments,
      opts,
      status: 'queued', // queued | processing | waiting_tools | completed | cancelled | failed
      createdAt: Date.now(),
      startedAt: null,
      completedAt: null,
      error: null,
    };
    set((s) => {
      const queue = [...s.queue, item];
      savePersisted(queue);
      return { queue };
    });
    return item.id;
  },

  dequeue: () => {
    const { queue } = get();
    const next = queue.find((i) => i.status === 'queued');
    return next || null;
  },

  setStatus: (id, status, extra = {}) => {
    set((s) => {
      const queue = s.queue.map((i) =>
        i.id === id
          ? {
              ...i, status, ...extra,
              startedAt: status === 'processing' ? (i.startedAt || Date.now()) : i.startedAt,
              completedAt: (status === 'completed' || status === 'cancelled' || status === 'failed') ? Date.now() : i.completedAt,
            }
          : i
      );
      savePersisted(queue);
      return { queue };
    });
  },

  edit: (id, content) => {
    set((s) => {
      const queue = s.queue.map((i) =>
        i.id === id && i.status === 'queued' ? { ...i, content } : i
      );
      savePersisted(queue);
      return { queue };
    });
  },

  cancel: (id) => {
    set((s) => {
      const queue = s.queue.map((i) =>
        i.id === id && (i.status === 'queued') ? { ...i, status: 'cancelled', completedAt: Date.now() } : i
      );
      savePersisted(queue);
      return { queue };
    });
  },

  remove: (id) => {
    set((s) => {
      const queue = s.queue.filter((i) => i.id !== id);
      savePersisted(queue);
      return { queue };
    });
  },

  clearCompleted: () => {
    set((s) => {
      const queue = s.queue.filter((i) => i.status !== 'completed' && i.status !== 'cancelled');
      savePersisted(queue);
      return { queue };
    });
  },

  // Counts
  get pendingCount() {
    return get().queue.filter((i) => i.status === 'queued').length;
  },
  get processingItem() {
    return get().queue.find((i) => i.status === 'processing' || i.status === 'waiting_tools') || null;
  },
}));

export default usePromptQueueStore;
