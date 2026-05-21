import { create } from 'zustand';

const useRuntimeStore = create((set, get) => ({
  available: [],
  installed: [],
  currentVersion: null,
  activeDownload: null,
  loading: false,
  error: null,

  fetchRuntimes: async (backendUrl) => {
    set({ loading: true, error: null });
    try {
      const res = await fetch(`${backendUrl}/api/runtimes`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      set({
        available: data.available || [],
        installed: data.installed || [],
        currentVersion: data.current,
        loading: false,
      });
    } catch {
      set({ loading: false });
    }
  },

  startDownload: async (backendUrl, backend) => {
    set({ error: null });
    try {
      const res = await fetch(`${backendUrl}/api/runtimes/download`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ backend }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);

      const dl = {
        id: data.downloadId,
        backend,
        status: 'queued',
        progress: 0,
        downloaded: 0,
        total: data.total || 0,
        speed: 0,
        eta: 0,
        stage: 'Queued',
        error: null,
      };
      set({ activeDownload: dl });
      get().pollDownload(backendUrl, data.downloadId);
      return dl;
    } catch (err) {
      set({ error: err.message });
      return null;
    }
  },

  pollDownload: (backendUrl, downloadId) => {
    const poll = async () => {
      const state = get();
      if (!state.activeDownload || state.activeDownload.id !== downloadId) return;
      if (state.activeDownload.status === 'done' || state.activeDownload.status === 'error' || state.activeDownload.status === 'cancelled') {
        get().fetchRuntimes(backendUrl);
        return;
      }

      try {
        const res = await fetch(`${backendUrl}/api/runtimes/download/${downloadId}`);
        if (!res.ok) throw new Error('Download not found');
        const data = await res.json();
        set({
          activeDownload: {
            id: data.id,
            backend: data.backend,
            status: data.status,
            progress: data.progress,
            downloaded: data.downloaded,
            total: data.total,
            speed: data.speed,
            eta: data.eta,
            stage: data.stage,
            error: data.error,
          },
        });

        if (data.status === 'done' || data.status === 'error' || data.status === 'cancelled') {
          get().fetchRuntimes(backendUrl);
          return;
        }
      } catch (err) {
        set({ error: err.message });
        return;
      }

      setTimeout(poll, 500);
    };
    setTimeout(poll, 500);
  },

  cancelDownload: async (backendUrl) => {
    try {
      await fetch(`${backendUrl}/api/runtimes/cancel`, { method: 'POST' });
      set({ activeDownload: null });
    } catch {}
  },

  activateRuntime: async (backendUrl, runtimeId) => {
    set({ error: null });
    try {
      const res = await fetch(`${backendUrl}/api/runtimes/${runtimeId}/activate`, { method: 'POST' });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      await get().fetchRuntimes(backendUrl);
      return true;
    } catch (err) {
      set({ error: err.message });
      return false;
    }
  },

  removeRuntime: async (backendUrl, runtimeId) => {
    set({ error: null });
    try {
      const res = await fetch(`${backendUrl}/api/runtimes/${runtimeId}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      await get().fetchRuntimes(backendUrl);
      return true;
    } catch (err) {
      set({ error: err.message });
      return false;
    }
  },

  clearError: () => set({ error: null }),
}));

export default useRuntimeStore;
