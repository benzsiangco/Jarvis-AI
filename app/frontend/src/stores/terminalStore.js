import { create } from 'zustand';
import usePermissionStore, { getCommandRisk } from './permissionStore';
import { emitThinking } from './thinkingStore';

const useTerminalStore = create((set, get) => ({
  lines: [],
  isRunning: false,
  currentCommand: '',

  addLine: (line) =>
    set((state) => ({
      lines: [...state.lines.slice(-500), line], // cap at 500 lines
    })),

  clearLines: () => set({ lines: [] }),

  setRunning: (val) => set({ isRunning: val }),

  startToolCommand: ({ command, cwd }) => {
    set({ isRunning: true, currentCommand: command });
    get().addLine({
      type: 'input',
      content: cwd ? `$ ${command}  # cwd: ${cwd}` : `$ ${command}`,
      ts: Date.now(),
    });
  },

  appendToolOutput: (chunk) => {
    const text = String(chunk || '').replace(/\r/g, '');
    for (const line of text.split('\n')) {
      if (line.trim()) {
        get().addLine({ type: 'output', content: line, ts: Date.now() });
      }
    }
  },

  finishToolCommand: ({ exitCode, command }) => {
    get().addLine({ type: 'output', content: `[exit code: ${exitCode}]`, ts: Date.now() });
    set({ isRunning: false, currentCommand: '' });
    emitThinking({ type: 'done', message: `Command finished: ${command}` });
  },

  runCommand: async (backendUrl, command, cwd) => {
    const risk = getCommandRisk(command);
    emitThinking({ type: 'running_command', message: `Preparing command: ${command}` });
    const approved = usePermissionStore.getState().requestApproval({
      action: 'run terminal command',
      detail: cwd ? `${command}\n\ncwd: ${cwd}` : command,
      risk,
    });
    if (!approved) {
      get().addLine({ type: 'error', content: `[blocked by permissions] ${command}`, ts: Date.now() });
      emitThinking({ type: 'done', message: `Command blocked: ${command}` });
      return;
    }

    set({ isRunning: true, currentCommand: command });
    get().addLine({ type: 'input', content: `$ ${command}`, ts: Date.now() });
    emitThinking({ type: 'running_command', message: `Running ${command}` });

    try {
      const res = await fetch(`${backendUrl}/api/terminal/exec`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command, cwd }),
      });

      const reader = res.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const text = decoder.decode(value, { stream: true });
        const lines = text.split('\n');
        for (const line of lines) {
          if (line.trim()) {
            get().addLine({ type: 'output', content: line, ts: Date.now() });
            emitThinking({ type: 'running_command', message: trimOutput(line) });
          }
        }
      }
    } catch (err) {
      get().addLine({ type: 'error', content: err.message, ts: Date.now() });
      emitThinking({ type: 'done', message: `Command failed: ${err.message}` });
    } finally {
      set({ isRunning: false });
      emitThinking({ type: 'done', message: `Command finished: ${command}` });
    }
  },
}));

export default useTerminalStore;

function trimOutput(line) {
  const text = line.trim();
  return text.length > 120 ? `${text.slice(0, 117)}...` : text;
}
