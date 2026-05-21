import { create } from 'zustand';
import usePermissionStore from './permissionStore';
import { emitThinking } from './thinkingStore';

const useFileStore = create((set, get) => ({
  tree: null,
  workspacePath: '',
  backendUrl: '',
  isLoading: false,
  expandedPaths: new Set(),
  // Map of filePath → timestamp of last write/patch (for highlight)
  recentlyModified: new Map(),

  /** Hydrate workspace path from the active workspace */
  hydrateFromWorkspace: (backendUrl, workspace) => {
    set({ backendUrl });
    if (!workspace?.path) {
      set({ workspacePath: '', tree: null, expandedPaths: new Set() });
      return;
    }
    const path = workspace.path;
    set({
      workspacePath: path,
      tree: path ? undefined : null,
      expandedPaths: path ? new Set([path]) : new Set(),
    });
  },

  /** Legacy hydrate — fetches workspace path from state endpoint */
  hydrate: async (backendUrl) => {
    set({ backendUrl });
    try {
      const res = await fetch(`${backendUrl}/api/state`);
      if (!res.ok) return;
      const data = await res.json();
      const workspacePath = data.workspace?.path || '';
      set({
        workspacePath,
        tree: workspacePath ? undefined : null,
        expandedPaths: workspacePath ? new Set([workspacePath]) : new Set(),
      });
    } catch {}
  },

  setWorkspacePath: (path) => {
    set({
      workspacePath: path,
      tree: path ? undefined : null,
      expandedPaths: path ? new Set([path]) : new Set(),
    });
  },

  toggleExpanded: (path) =>
    set((state) => {
      const next = new Set(state.expandedPaths);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return { expandedPaths: next };
    }),

  fetchTree: async (backendUrl, dirPath) => {
    set({ isLoading: true });
    emitThinking({ type: 'searching', message: `Scanning workspace ${dirPath}` });
    try {
      const res = await fetch(`${backendUrl}/api/files/tree?path=${encodeURIComponent(dirPath)}`);
      const data = await res.json();
      set({ backendUrl, tree: data, workspacePath: dirPath, isLoading: false, expandedPaths: new Set([dirPath]) });
      emitThinking({ type: 'done', message: `Workspace loaded: ${data.name}` });
    } catch (err) {
      set({ isLoading: false });
      emitThinking({ type: 'done', message: 'Workspace scan failed' });
      throw err;
    }
  },

  /**
   * Called when the AI writes or patches a file.
   * Re-fetches the tree and marks the file as recently modified for highlighting.
   */
  onFileWritten: async (filePath) => {
    const { backendUrl, workspacePath, expandedPaths } = get();
    if (!backendUrl || !workspacePath) return;

    // Mark as recently modified — highlight fades after 4s
    set((state) => {
      const next = new Map(state.recentlyModified);
      next.set(filePath, Date.now());
      return { recentlyModified: next };
    });
    setTimeout(() => {
      set((state) => {
        const next = new Map(state.recentlyModified);
        next.delete(filePath);
        return { recentlyModified: next };
      });
    }, 4000);

    // Re-fetch the tree silently (no loading spinner)
    try {
      const res = await fetch(`${backendUrl}/api/files/tree?path=${encodeURIComponent(workspacePath)}`);
      const data = await res.json();

      // Auto-expand the parent folder of the written file
      const parentPath = getParentPath(filePath);
      const nextExpanded = new Set(expandedPaths);
      if (parentPath && parentPath !== workspacePath) nextExpanded.add(parentPath);
      // Also expand grandparent if nested
      const grandParent = getParentPath(parentPath);
      if (grandParent && grandParent !== workspacePath) nextExpanded.add(grandParent);

      set({ tree: data, expandedPaths: nextExpanded });
    } catch {}
  },

  readFile: async (backendUrl, filePath) => {
    emitThinking({ type: 'reading_file', message: `Reading ${filePath}` });
    const res = await fetch(`${backendUrl}/api/files/read?path=${encodeURIComponent(filePath)}`);
    const data = await res.json();
    emitThinking({ type: 'done', message: data.error ? `Read failed: ${filePath}` : `Read complete: ${filePath}` });
    return data;
  },

  saveFile: async (backendUrl, filePath, content) => {
    emitThinking({ type: 'planning_patch', message: `Preparing write for ${filePath}` });
    const approved = usePermissionStore.getState().requestApproval({
      action: 'save file',
      detail: filePath,
      risk: 'write',
    });
    if (!approved) return { error: 'Save canceled by permission policy' };

    const res = await fetch(`${backendUrl}/api/files/write`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: filePath, content }),
    });
    const data = await res.json();
    emitThinking({ type: 'done', message: data.error ? `Write failed: ${filePath}` : `Wrote ${filePath}` });
    return data;
  },

  createFile: async (backendUrl, filePath, content = '') => {
    emitThinking({ type: 'planning_patch', message: `Preparing new file ${filePath}` });
    const approved = usePermissionStore.getState().requestApproval({
      action: 'create file',
      detail: filePath,
      risk: 'write',
    });
    if (!approved) return { error: 'Create canceled by permission policy' };

    const res = await fetch(`${backendUrl}/api/files/write`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: filePath, content }),
    });
    const data = await res.json();
    emitThinking({ type: 'done', message: data.error ? `Create failed: ${filePath}` : `Created ${filePath}` });
    return data;
  },
}));

function getParentPath(filePath) {
  if (!filePath) return '';
  const normalized = filePath.replace(/\\/g, '/');
  const idx = normalized.lastIndexOf('/');
  if (idx <= 0) return '';
  const parent = filePath.slice(0, idx);
  return parent;
}

export default useFileStore;
