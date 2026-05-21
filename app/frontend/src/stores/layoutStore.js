import { create } from 'zustand';

const useLayoutStore = create((set) => ({
  sidebarWidth:    260,
  rightPanelWidth: 400,
  showSidebar:    true,
  showRightPanel: true,
  activePanel:    'explorer',
  rightPanelTab:  'terminal', // terminal | editor | diff | problems

  setSidebarWidth:    (w) => set((s) => ({ sidebarWidth:    clamp(resolveNext(w, s.sidebarWidth),    220, 480) })),
  setRightPanelWidth: (w) => set((s) => ({ rightPanelWidth: clamp(resolveNext(w, s.rightPanelWidth), 300, 700) })),

  toggleSidebar:      () => set((s) => ({ showSidebar:    !s.showSidebar })),
  toggleRightPanel:   () => set((s) => ({ showRightPanel: !s.showRightPanel })),
  // Aliases used by StatusBar
  toggleWorkspace:    () => set((s) => ({ showRightPanel: !s.showRightPanel })),
  toggleTerminal:     () => set((s) => ({
    showRightPanel: s.rightPanelTab === 'terminal' ? !s.showRightPanel : true,
    rightPanelTab:  'terminal',
  })),

  // Called by chatStore to ensure workspace/terminal panels are visible
  showWorkspace:      () => set({ showRightPanel: true }),
  showTerminalPanel:  () => set({ showRightPanel: true, rightPanelTab: 'terminal' }),

  setActivePanel:    (panel) => set({ activePanel:    panel }),
  setRightPanelTab:  (tab)   => set({ rightPanelTab:  tab }),
}));

function resolveNext(value, current) {
  return typeof value === 'function' ? value(current) : value;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export default useLayoutStore;
