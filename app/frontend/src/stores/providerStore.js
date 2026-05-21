import { create } from 'zustand';

const useProviderStore = create((set, get) => ({
  providers: [],
  activeProviderId: null,
  activeModel: null,
  loading: false,
  error: null,

  fetchProviders: async (backendUrl) => {
    set({ loading: true, error: null });
    try {
      const res = await fetch(`${backendUrl}/api/providers`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      set({
        providers: data.providers || [],
        activeProviderId: data.activeProviderId || null,
        activeModel: data.activeModel || null,
        loading: false,
      });
    } catch (err) {
      set({ error: err.message, loading: false });
    }
  },

  addProvider: async (backendUrl, { name, type, apiBase, apiKey }) => {
    set({ error: null });
    try {
      const res = await fetch(`${backendUrl}/api/providers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, type, apiBase, apiKey }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      await get().fetchProviders(backendUrl);
      return data;
    } catch (err) {
      set({ error: err.message });
      return null;
    }
  },

  updateProvider: async (backendUrl, id, updates) => {
    set({ error: null });
    try {
      const res = await fetch(`${backendUrl}/api/providers/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      await get().fetchProviders(backendUrl);
      return data;
    } catch (err) {
      set({ error: err.message });
      return null;
    }
  },

  deleteProvider: async (backendUrl, id) => {
    set({ error: null });
    try {
      const res = await fetch(`${backendUrl}/api/providers/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      await get().fetchProviders(backendUrl);
      return true;
    } catch (err) {
      set({ error: err.message });
      return false;
    }
  },

  setActiveProvider: async (backendUrl, providerId, modelId) => {
    set({ error: null, activeProviderId: providerId, activeModel: modelId });
    try {
      const res = await fetch(`${backendUrl}/api/providers/active`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ providerId, modelId }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      return true;
    } catch (err) {
      set({ error: err.message });
      return false;
    }
  },

  fetchModels: async (backendUrl, providerId) => {
    // Don't set global error for fetch failures — show per-card status instead
    try {
      const res = await fetch(`${backendUrl}/api/providers/${providerId}/fetch-models`, { method: 'POST' });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      await get().fetchProviders(backendUrl);
      return data.models;
    } catch (err) {
      // Silently fail — the card will show "Click Refresh to fetch models"
      await get().fetchProviders(backendUrl).catch(() => {});
      return [];
    }
  },

  testProvider: async (backendUrl, providerId) => {
    // Don't set global error for test failures — show per-card offline badge instead
    try {
      const res = await fetch(`${backendUrl}/api/providers/${providerId}/test`, { method: 'POST' });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      await get().fetchProviders(backendUrl);
      return data;
    } catch (err) {
      // Refresh so lastTestStatus updates to 'failed' → shows offline badge on card
      await get().fetchProviders(backendUrl).catch(() => {});
      return null;
    }
  },

  /** Test a provider before saving — validates URL/key combo with the live API. */
  testDraft: async (backendUrl, draft) => {
    set({ error: null });
    try {
      const res = await fetch(`${backendUrl}/api/providers/test-draft`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(draft),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      return data;
    } catch (err) {
      set({ error: err.message });
      return null;
    }
  },

  clearError: () => set({ error: null }),
}));

export default useProviderStore;
