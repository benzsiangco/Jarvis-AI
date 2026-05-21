import { create } from 'zustand';
import { emitThinking } from './thinkingStore';

const DESTRUCTIVE_PATTERN = /\b(rm|del|erase|rmdir|remove-item|git\s+reset|git\s+clean|format)\b/i;
const WRITE_PATTERN = /\b(>|>>|out-file|set-content|add-content|new-item|mkdir|copy|move|mv|ren|rename|npm\s+i|npm\s+install|bun\s+add|bun\s+install)\b/i;

const usePermissionStore = create((set, get) => ({
  mode: 'ask',
  lastDecision: null,

  setMode: (mode) => set({ mode }),

  requestApproval: ({ action, detail, risk = 'write' }) => {
    const mode = get().mode;
    if (mode === 'full') return true;

    const isDestructive = risk === 'destructive';
    if (mode === 'workspace' && !isDestructive) return true;

    emitThinking({
      type: 'awaiting_approval',
      message: `Awaiting approval to ${action}`,
      detail,
    });

    const message = [
      `Allow ${action}?`,
      detail,
      isDestructive ? 'This may delete or overwrite local data.' : null,
    ].filter(Boolean).join('\n\n');

    const approved = window.confirm(message);
    set({ lastDecision: { action, detail, approved, ts: Date.now() } });
    emitThinking({
      type: approved ? 'tool_execution' : 'done',
      message: approved ? `Approved: ${action}` : `Blocked: ${action}`,
    });
    return approved;
  },
}));

export function getCommandRisk(command) {
  if (DESTRUCTIVE_PATTERN.test(command)) return 'destructive';
  if (WRITE_PATTERN.test(command)) return 'write';
  return 'safe';
}

export default usePermissionStore;
