import { create } from 'zustand';

const useWorkspaceStore = create((set, get) => ({
  workspaces: [],
  activeWorkspaceId: null,
  isLoading: false,
  backendUrl: '',

  /** Bootstrap: fetch all workspaces + restore active IDs from backend */
  hydrate: async (backendUrl) => {
    set({ backendUrl, isLoading: true });
    try {
      const res = await fetch(`${backendUrl}/api/state`);
      if (!res.ok) return;
      const data = await res.json();
      set({
        workspaces: Array.isArray(data.workspaces) ? data.workspaces : [],
        activeWorkspaceId: data.activeWorkspaceId || null,
        isLoading: false,
      });
      return data;
    } catch {
      set({ isLoading: false });
      return null;
    }
  },

  /** Get the currently active workspace object */
  getActiveWorkspace: () => {
    const { workspaces, activeWorkspaceId } = get();
    return workspaces.find((w) => w.id === activeWorkspaceId) || null;
  },

  /** Add a workspace for a folder path. Deduplicates by path. */
  addWorkspace: async (folderPath) => {
    const { backendUrl, workspaces } = get();
    if (!backendUrl || !folderPath) return null;

    try {
      const res = await fetch(`${backendUrl}/api/state/workspaces`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: folderPath }),
      });
      const data = await res.json();

      // data is either an existing workspace or { workspace, session }
      const workspace = data.workspace || data;
      const wsId = workspace.id;

      // Update local state
      const existing = workspaces.find((w) => w.id === wsId);
      set({
        workspaces: existing
          ? workspaces.map((w) => (w.id === wsId ? workspace : w))
          : [...workspaces, workspace],
        activeWorkspaceId: wsId,
      });

      return { workspace, session: data.session };
    } catch (err) {
      console.error('[WorkspaceStore] addWorkspace error:', err);
      return null;
    }
  },

  /** Switch active workspace */
  switchWorkspace: async (workspaceId) => {
    const { backendUrl } = get();
    set({ activeWorkspaceId: workspaceId });
    try {
      await fetch(`${backendUrl}/api/state/active`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ activeWorkspaceId: workspaceId }),
      });
    } catch {}
  },

  /** Remove a workspace */
  removeWorkspace: async (workspaceId) => {
    const { backendUrl, workspaces, activeWorkspaceId } = get();
    try {
      await fetch(`${backendUrl}/api/state/workspaces/${workspaceId}`, { method: 'DELETE' });
      const remaining = workspaces.filter((w) => w.id !== workspaceId);
      set({
        workspaces: remaining,
        activeWorkspaceId: activeWorkspaceId === workspaceId
          ? (remaining[0]?.id || null)
          : activeWorkspaceId,
      });
    } catch (err) {
      console.error('[WorkspaceStore] removeWorkspace error:', err);
    }
  },

  /** Rename a workspace */
  renameWorkspace: async (workspaceId, name) => {
    const { backendUrl } = get();
    try {
      await fetch(`${backendUrl}/api/state/workspaces/${workspaceId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      set((s) => ({
        workspaces: s.workspaces.map((w) => (w.id === workspaceId ? { ...w, name } : w)),
      }));
    } catch {}
  },
}));

export default useWorkspaceStore;
