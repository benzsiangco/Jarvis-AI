import { create } from 'zustand';

const useEditorStore = create((set, get) => ({
  openFiles: [],
  activeFileIdx: -1,

  openFile: (file) => {
    const { openFiles } = get();
    const existingIdx = openFiles.findIndex((f) => f.path === file.path);

    if (existingIdx >= 0) {
      // Update content if provided, keep original
      set((state) => {
        const files = [...state.openFiles];
        if (file.content !== undefined && files[existingIdx].content !== file.content) {
          files[existingIdx] = { ...files[existingIdx], content: file.content };
        }
        return { openFiles: files, activeFileIdx: existingIdx };
      });
      return;
    }

    set((state) => ({
      openFiles: [
        ...state.openFiles,
        {
          ...file,
          isDirty: false,
          // Track original content for diff generation
          originalContent: file.content || '',
        },
      ],
      activeFileIdx: state.openFiles.length,
    }));
  },

  closeFile: (idx) =>
    set((state) => {
      const newFiles = state.openFiles.filter((_, i) => i !== idx);
      let newIdx = state.activeFileIdx;
      if (newIdx >= newFiles.length) newIdx = newFiles.length - 1;
      if (idx < state.activeFileIdx) newIdx = state.activeFileIdx - 1;
      return { openFiles: newFiles, activeFileIdx: newIdx };
    }),

  setActiveFile: (idx) => set({ activeFileIdx: idx }),

  updateFileContent: (idx, content) =>
    set((state) => {
      const files = [...state.openFiles];
      files[idx] = { ...files[idx], content, isDirty: true };
      return { openFiles: files };
    }),

  markSaved: (idx) =>
    set((state) => {
      const files = [...state.openFiles];
      // After save, update original content to current (no more dirty diff)
      files[idx] = {
        ...files[idx],
        isDirty: false,
        originalContent: files[idx].content,
      };
      return { openFiles: files };
    }),

  getActiveFile: () => {
    const { openFiles, activeFileIdx } = get();
    return activeFileIdx >= 0 ? openFiles[activeFileIdx] : null;
  },

  /** Get diff info for a file */
  getFileDiff: (idx) => {
    const file = get().openFiles[idx];
    if (!file || !file.isDirty) return null;
    return {
      path: file.path,
      name: file.name,
      original: file.originalContent || '',
      modified: file.content,
      language: file.language,
    };
  },

  /** Get all dirty files with their diffs */
  getDirtyDiffs: () => {
    return get().openFiles
      .filter((f) => f.isDirty)
      .map((f) => ({
        path: f.path,
        name: f.name,
        original: f.originalContent || '',
        modified: f.content,
        language: f.language,
      }));
  },
}));

export default useEditorStore;
