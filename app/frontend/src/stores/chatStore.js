import { create } from 'zustand';
import { emitThinking, bumpThinkingRound } from './thinkingStore';
import useThinkingStore from './thinkingStore';
import useTerminalStore from './terminalStore';
import useLayoutStore from './layoutStore';
import useSessionStore from './sessionStore';
import useWorkspaceStore from './workspaceStore';
import useEditorStore from './editorStore';
import useFileStore from './fileStore';
import useLiveEditStore from './liveEditStore';
import useModelStore from './modelStore';
import useSubAgentStore from './subAgentStore';

const useChatStore = create((set, get) => ({
  messages: [],
  isStreaming: false,
  streamBuffer: '',
  streamStartedAt: 0,
  backendUrl: '',
  abortController: null,

  pendingApproval: null,

  thinkingMode: (() => { try { return localStorage.getItem('jarvis:thinkingMode') === 'true'; } catch { return false; } })(),

  addMessage: (message) =>
    set((state) => ({
      messages: [...state.messages, { id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, timestamp: Date.now(), ...message }],
    })),

  setThinkingMode: (val) => {
    localStorage.setItem('jarvis:thinkingMode', String(!!val));
    set({ thinkingMode: !!val });
  },

  updateLastAssistant: (content) =>
    set((state) => {
      const msgs = [...state.messages];
      const lastIdx = msgs.findLastIndex((m) => m.role === 'assistant');
      if (lastIdx >= 0) msgs[lastIdx] = { ...msgs[lastIdx], content };
      return { messages: msgs };
    }),

  setStreaming: (val) => set({ isStreaming: val }),

  appendToStream: (token) =>
    set((state) => {
      const msgs = [...state.messages];
      const lastIdx = msgs.findLastIndex((m) => m.role === 'assistant');
      if (lastIdx >= 0) {
        msgs[lastIdx] = { ...msgs[lastIdx], content: msgs[lastIdx].content + token };
      }
      return { messages: msgs };
    }),

  /** Load messages for a specific session from the backend */
  loadSession: async (backendUrl, sessionId) => {
    set({ backendUrl });
    if (!sessionId) {
      set({ messages: [], pendingApproval: null, abortController: null, isStreaming: false });
      return;
    }
    try {
      const res = await fetch(`${backendUrl}/api/state/sessions/${sessionId}/messages`);
      if (!res.ok) return;
      const messages = await res.json();
      set({
        messages: Array.isArray(messages) ? messages : [],
        pendingApproval: null,
        abortController: null,
        isStreaming: false,
      });
    } catch {
      set({ messages: [] });
    }
  },

  /** Legacy hydrate — now delegates to loadSession with active session */
  hydrate: async (backendUrl) => {
    set({ backendUrl });
    try {
      const res = await fetch(`${backendUrl}/api/state`);
      if (!res.ok) return;
      const data = await res.json();
      set({
        messages: Array.isArray(data.messages) ? data.messages : [],
        pendingApproval: null,
        abortController: null,
        isStreaming: false,
      });
    } catch {}
  },

  /** Persist current messages to the active session */
  persist: async () => {
    const { backendUrl, messages } = get();
    const sessionId = useSessionStore.getState().activeSessionId;
    if (!backendUrl || !sessionId) return;
    try {
      await fetch(`${backendUrl}/api/state/sessions/${sessionId}/messages`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages }),
      });
    } catch {}
  },

  /** Clear messages and persist the empty active session */
  clearMessages: async (backendUrl) => {
    useThinkingStore.getState().clear();
    const ac = get().abortController;
    if (ac) { try { ac.abort(); } catch {} }
    if (backendUrl) set({ backendUrl });
    set({ messages: [], streamBuffer: '', pendingApproval: null, abortController: null, isStreaming: false });

    const effectiveBackendUrl = backendUrl || get().backendUrl;
    const sessionId = useSessionStore.getState().activeSessionId;
    if (!effectiveBackendUrl || !sessionId) return;

    try {
      await fetch(`${effectiveBackendUrl}/api/state/sessions/${sessionId}/messages`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: [] }),
      });
    } catch {}
  },

  /** Clear messages in memory only — does NOT persist to backend.
   *  Used when switching to a new empty session so we don't overwrite
   *  the previous session's messages with the new session's empty state. */
  clearMessagesLocal: () => {
    useThinkingStore.getState().clear();
    set({ messages: [], streamBuffer: '', pendingApproval: null, pendingQuestion: null, isStreaming: false });
  },

  stopGeneration: () => {
    const { abortController } = get();
    if (abortController) {
      abortController.abort();
    }
    // Always force-reset streaming state — abortController may be null
    // if stop is clicked before fetch starts (between sync lock and fetch)
    set({ isStreaming: false, abortController: null });
    emitThinking({ type: 'done', message: 'Generation stopped by user' });
  },

  setPendingApproval: (approval) => set({ pendingApproval: approval }),
  clearPendingApproval: () => set({ pendingApproval: null }),
  clearPendingQuestion: () => set({ pendingQuestion: null }),

  sendMessage: async (content, backendUrl, { workspacePath = '', permissionMode = 'ask', attachments = [], supportsImages = false } = {}) => {
    // Guard: don't send if already streaming
    if (get().isStreaming) return;
    // Immediate synchronous lock — set isStreaming BEFORE any async operation
    set({ isStreaming: true });

    const { messages } = get();
    useLayoutStore.getState().showWorkspace();

    // Guard: verify model is available before sending. If a provider is active,
    // we don't need a local llama.cpp model — the request will route through
    // the provider on the backend.
    const modelState = useModelStore.getState();
    const modelStatus = modelState.serverStatus;
    const hasProvider = !!(modelState.activeProviderId && modelState.activeProviderModel);
    if (modelStatus !== 'ready' && !hasProvider) {
      const msg = modelStatus === 'starting' || modelStatus === 'loading'
        ? 'Model is still loading — please wait a moment and try again.'
        : 'No model loaded. Open the Models panel and either load a local GGUF or pick a model from a Provider (LM Studio, Ollama, OpenAI, etc.).';
      get().appendToStream(`\n\nError: ${msg}`);
      emitThinking({ type: 'done', message: msg });
      set({ isStreaming: false });
      return;
    }

    const sessionId = await ensureActiveSession(backendUrl, content);
    if (!sessionId) {
      get().appendToStream('\n\nError: Open a workspace before starting a chat.');
      emitThinking({ type: 'done', message: 'No workspace selected' });
      set({ isStreaming: false });
      return;
    }

    const displayAttachments = attachments.map(sanitizeAttachmentForState);
    const userMsg = { role: 'user', content, attachments: displayAttachments };
    const assistantMsg = { role: 'assistant', content: '' };

    const streamStartedAt = Date.now();
    set((state) => ({
      backendUrl,
      messages: [
        ...state.messages,
        { id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, timestamp: Date.now(), ...userMsg },
        { id: `${Date.now() + 1}-${Math.random().toString(36).slice(2, 6)}`, timestamp: Date.now(), ...assistantMsg },
      ],
      streamStartedAt,
      pendingApproval: null,
    }));
    // Clear thinking events from the previous response
    useThinkingStore.getState().clear();

    // Auto-title the session after first user message
    if (sessionId && messages.length === 0) {
      useSessionStore.getState().autoTitle(sessionId, [{ role: 'user', content }]);
    }

    try {
      const history = messages.map((m) => ({ role: m.role, content: m.content }));
      history.push({ role: 'user', content: buildModelContent(content, attachments) });

      const controller = new AbortController();
      set({ abortController: controller });

      const res = await fetch(`${backendUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: history, workspacePath, permissionMode, supportsImages, thinkingMode: get().thinkingMode }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const errBody = await res.text().catch(() => '');
        throw new Error(errBody || `HTTP ${res.status}`);
      }

      const reader = res.body.getReader();

      const decoder = new TextDecoder();
      let buffer = '';
      // Local llama.cpp can be very slow on CPU — use 10 min timeout for both
      const hasProvider = !!useModelStore.getState().activeProviderId;
      const readTimeoutMs = hasProvider ? 300_000 : 600_000; // 10 min for local CPU models

      while (true) {
        let chunk;
        try {
          chunk = await readWithTimeout(reader, readTimeoutMs, controller.signal);
        } catch (e) {
          // User-initiated stop — propagate original error so outer catch
          // can detect AbortError and show "Stopped" instead of "Connection lost"
          if (e.name === 'AbortError' || controller.signal.aborted) throw e;
          if (e.message?.includes('timed out')) {
            // Don't blame llama.cpp if a provider is in use
            const hasProv = !!(useModelStore.getState().activeProviderId);
            if (hasProv) {
              throw new Error('The provider took too long to respond (5 min). Try again, switch models, or check the provider URL.');
            }
            // Check if the local backend is alive before blaming the model
            const alive = await fetch(`${backendUrl}/api/models/status`).then(r => r.json()).then(d => d.connected).catch(() => false);
            if (alive) throw new Error('Stream timed out after 2 minutes - the AI may still be thinking');
            throw new Error('The AI backend is not responding. Load a model from the Models panel first.');
          }
          // Connection drop — only blame local llama.cpp when no provider is active
          const hasProv = !!(useModelStore.getState().activeProviderId);
          if (hasProv) {
            throw new Error('Provider connection dropped. The provider closed the stream unexpectedly. Try again, or check the provider\'s URL/API key/availability.');
          }
          let connected = false, modelLoaded = false;
          try {
            const h = await fetch(`${backendUrl}/api/models/status`).then(r => r.json());
            connected = h.connected;
            modelLoaded = h.status === 'running';
          } catch {}
          if (!connected) throw new Error('No model connected. Open the Models panel and either load a local GGUF or pick a Provider model (LM Studio, Ollama, OpenAI, Claude).');
          if (!modelLoaded) throw new Error('Connection lost — the local model may have crashed. Reload it from the Models panel, or switch to a Provider.');
          throw new Error('Connection lost');
        }
        const { done, value } = chunk;
        if (done) {
          // Flush any remaining buffer data before exiting
          const events = parseSSEBuffer(buffer, true);
          for (const { event, data } of events.parsed) {
            handleSSEEvent(event, data, get, set);
          }
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        const events = parseSSEBuffer(buffer);
        buffer = events.remainder;

        for (const { event, data } of events.parsed) {
          handleSSEEvent(event, data, get, set);
        }
      }
      // Stream finished naturally — mark reasoning as done
      emitThinking({ type: 'done', message: 'Done' });
    } catch (err) {
      if (err.name === 'AbortError' || /cancel|cancelled|abort|aborted/i.test(err.message || '')) {
        emitThinking({ type: 'done', message: 'Stopped' });
        return;
      }
      get().appendToStream(`\n\nError: ${err.message}`);
      emitThinking({ type: 'done', message: `Error: ${err.message}` });
    } finally {
      set({ isStreaming: false, abortController: null });
      await get().persist();
    }
  },
}));

// ── SSE Event Handlers ────────────────────────────────────────────────────────

function handleSSEEvent(event, data, get, set) {
  if (event === 'done') return;

  try {
    const parsed = typeof data === 'string' ? JSON.parse(data) : data;

    switch (event) {
      case 'error': {
        // Backend explicitly signaled a provider/model error. Surface it
        // through the thinking panel so the user sees a clear failure state.
        const msg = parsed?.message || 'Generation failed';
        emitThinking({ type: 'done', message: msg });
        break;
      }

      case 'subagent_start': {
        useSubAgentStore.getState().start(parsed);
        useLayoutStore.getState().showWorkspace();
        useLayoutStore.getState().setRightPanelTab('subagents');
        break;
      }
      case 'subagent_update': {
        useSubAgentStore.getState().update(parsed);
        break;
      }
      case 'subagent_done': {
        useSubAgentStore.getState().done(parsed);
        break;
      }
      case 'subagent_error': {
        useSubAgentStore.getState().error(parsed);
        break;
      }

      case 'thinking': {
        const t = parsed.thinking;
        if (!t) break;
        // Internal round-bump signal — not displayed
        if (t.type === '_round') { bumpThinkingRound(); break; }
        if (handleTerminalEvent(t, set)) break;
        if (handleFileEditEvent(t)) break;
        emitThinking(t);
        break;
      }

      case 'tool_result': {
        const { tool, result, round } = parsed;
        const toolMsg = formatToolResult(tool, result, round);
        upsertToolResult(set, {
          tool,
          result,
          round,
          status: result?.success === false ? 'failed' : 'complete',
          summary: toolMsg,
        });
        emitThinking({ type: 'tool_execution', message: toolMsg });

        // askQuestion — surface a choice picker in the UI
        if (tool === 'askQuestion' && result?.result?.pending) {
          set({ pendingQuestion: { ...result.result, round } });
        }

        // Live file editing: auto-open files in the editor
        if (result?.success && (tool === 'readFile' || tool === 'writeFile' || tool === 'patchFile')) {
          const filePath = result?.result?.path;
          if (filePath) {
            const name = filePath.split(/[/\\]/).pop();
            const ext = name.split('.').pop();
            openFileInEditor(filePath, name, ext);
            // Auto-switch to editor tab for write/patch (show what was created)
            if (tool === 'writeFile' || tool === 'patchFile') {
              useLayoutStore.getState().showWorkspace();
              useLayoutStore.getState().setRightPanelTab('editor');
              // Refresh the file tree and highlight the written file
              useFileStore.getState().onFileWritten(filePath);
            }
          }
        }

        // Refresh file tree after terminal commands that modify the filesystem
        if (result?.success && tool === 'runTerminal') {
          const cmd = (result?.result?.command || '').toLowerCase().trim();
          const isFileOp = /\b(del|rm|rmdir|mkdir|md|rd|move|mv|cp|copy|rename|ren|touch|echo\s.*>|tee\s|git\s+(add|rm|mv|checkout|reset|clean))\b/.test(cmd);
          if (isFileOp) {
            const { backendUrl: bUrl, workspacePath: wsPath } = useFileStore.getState();
            if (bUrl && wsPath) {
              setTimeout(() => useFileStore.getState().fetchTree(bUrl, wsPath).catch(() => {}), 400);
            }
          }
        }
        break;
      }

      case 'tool_approval': {
        const { tool, args, round } = parsed;
        set({ pendingApproval: { tool, args, round } });
        emitThinking({ type: 'awaiting_approval', message: `Approve ${tool}?` });
        break;
      }

      case 'data':
      default: {
        if (parsed.thinking) {
          emitThinking(parsed.thinking);
          return;
        }
        const token = parsed.choices?.[0]?.delta?.content || '';
        if (token) get().appendToStream(token);
        break;
      }
    }
  } catch {
    // Skip malformed events
  }
}

// ── Stream Read Timeout ────────────────────────────────────────────────────────

async function readWithTimeout(reader, timeoutMs, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new DOMException('Aborted', 'AbortError'));
    const timer = setTimeout(() => {
      reject(new Error('Stream read timed out'));
    }, timeoutMs);
    const onAbort = () => {
      clearTimeout(timer);
      reader.cancel().catch(() => {});
      reject(new DOMException('Aborted', 'AbortError'));
    };
    signal?.addEventListener('abort', onAbort, { once: true });
    reader.read().then(
      result => {
        clearTimeout(timer);
        signal?.removeEventListener('abort', onAbort);
        resolve(result);
      },
      err => {
        clearTimeout(timer);
        signal?.removeEventListener('abort', onAbort);
        reject(err);
      }
    );
  });
}

// ── SSE Buffer Parser ─────────────────────────────────────────────────────────

function handleTerminalEvent(event, set) {
  if (event.type === 'terminal_start') {
    useLayoutStore.getState().showTerminalPanel();
    useTerminalStore.getState().startToolCommand({
      command: event.command,
      cwd: event.cwd,
    });
    upsertToolResult(set, {
      tool: 'runTerminal',
      status: 'running',
      summary: `Running terminal: ${event.command}`,
      result: {
        success: null,
        result: { command: event.command, cwd: event.cwd },
      },
    });
    emitThinking({ type: 'running_command', message: `Running ${event.command}` });
    return true;
  }

  if (event.type === 'terminal_output') {
    useTerminalStore.getState().appendToolOutput(event.content || event.message || '');
    return true;
  }

  if (event.type === 'terminal_exit') {
    useTerminalStore.getState().finishToolCommand({
      exitCode: event.exitCode,
      command: event.command,
    });
    upsertToolResult(set, {
      tool: 'runTerminal',
      status: event.exitCode === 0 ? 'complete' : 'failed',
      summary: `Terminal finished: ${event.command} (exit ${event.exitCode})`,
      result: {
        success: event.exitCode === 0,
        result: { command: event.command, exitCode: event.exitCode },
      },
    });
    return true;
  }

  return false;
}

function handleFileEditEvent(event) {
  if (event.type === 'file_edit_start') {
    useLiveEditStore.getState().startEdit({
      path: event.path,
      content: event.content || '',
      language: event.language,
      editType: event.editType || 'write',
    });
    // Auto-switch to editor tab
    useLayoutStore.getState().showWorkspace();
    useLayoutStore.getState().setRightPanelTab('editor');
    emitThinking({ type: 'editing', message: `Writing ${(event.path || '').split(/[/\\]/).pop()}...` });
    return true;
  }

  if (event.type === 'file_edit_done') {
    // Animation continues on frontend — no-op here
    return true;
  }

  return false;
}

function upsertToolResult(set, entry) {
  set((state) => {
    const msgs = [...state.messages];
    const lastIdx = msgs.findLastIndex((m) => m.role === 'assistant');
    if (lastIdx < 0) return { messages: msgs };

    const current = msgs[lastIdx];
    const toolResults = [...(current.toolResults || [])];
    const entryCommand = entry.result?.result?.command;
    const matchIdx = toolResults.findIndex((item) => {
      const itemCommand = item.result?.result?.command;
      return item.tool === entry.tool && entry.tool === 'runTerminal' && itemCommand && itemCommand === entryCommand;
    });

    if (matchIdx >= 0) toolResults[matchIdx] = { ...toolResults[matchIdx], ...entry };
    else toolResults.push(entry);

    msgs[lastIdx] = { ...current, toolResults };
    return { messages: msgs };
  });
}

function parseSSEBuffer(buffer, isFinal = false) {
  const parsed = [];
  const blocks = buffer.split('\n\n');
  const remainder = isFinal ? '' : (blocks.pop() ?? '');

  for (const block of blocks) {
    if (!block.trim()) continue;
    let event = 'data';
    let data = '';
    for (const line of block.split('\n')) {
      if (line.startsWith('event: ')) event = line.slice(7).trim();
      else if (line.startsWith('data: ')) data = line.slice(6).trim();
    }
    if (data) parsed.push({ event, data });
  }

  // If final, also try to parse any trailing partial block
  if (isFinal && remainder.trim()) {
    let event = 'data';
    let data = '';
    for (const line of remainder.split('\n')) {
      if (line.startsWith('event: ')) event = line.slice(7).trim();
      else if (line.startsWith('data: ')) data = line.slice(6).trim();
    }
    if (data) parsed.push({ event, data });
  }

  return { parsed, remainder: isFinal ? '' : remainder };
}

// ── Formatting ────────────────────────────────────────────────────────────────

/** Open a file in the editor after it's been written/patched */
async function openFileInEditor(filePath, name, ext) {
  try {
    const backendUrl = useChatStore.getState().backendUrl;
    const res = await fetch(`${backendUrl}/api/files/read?path=${encodeURIComponent(filePath)}`);
    if (!res.ok) return;
    const data = await res.json();
    const langMap = { js: 'javascript', ts: 'typescript', jsx: 'javascript', tsx: 'typescript', py: 'python', rs: 'rust', go: 'go', json: 'json', md: 'markdown', html: 'html', css: 'css', yaml: 'yaml', yml: 'yaml', sql: 'sql', sh: 'shell', bash: 'shell' };
    useEditorStore.getState().openFile({
      path: filePath,
      name,
      content: data.content || '',
      language: langMap[ext] || 'plaintext',
    });
    // Make sure the workspace pane is visible to show the file
    useLayoutStore.getState().showWorkspace();
  } catch {}
}

function formatToolResult(tool, result, round) {
  if (!result.success) return `${tool} failed: ${result.error}`;
  switch (tool) {
    case 'readFile':    return `Read ${result.result?.path || 'file'} (${result.result?.size || 0}B)`;
    case 'writeFile':   return `Wrote ${result.result?.path || 'file'}`;
    case 'patchFile':   return `Patched ${result.result?.path || 'file'} (${result.result?.linesChanged || 0} lines)`;
    case 'searchCode':  return `Found ${result.result?.results?.length || 0} matches for "${result.result?.query}"`;
    case 'listFiles':   return `Listed ${result.result?.items?.length || 0} items in ${result.result?.path || '.'}`;
    case 'runTerminal': return `Ran: ${result.result?.command} (exit ${result.result?.exitCode})`;
    case 'openFolder':  return `Opened ${result.result?.path}`;
    case 'spawnAgent':  return `Sub-agent: ${(result.result?.answer || '').slice(0, 80)}${(result.result?.answer || '').length > 80 ? '…' : ''}`;
    default:            return `${tool} → ${result.success ? 'ok' : 'failed'}`;
  }
}

export default useChatStore;

function sanitizeAttachmentForState(attachment) {
  return {
    id: attachment.id,
    name: attachment.name,
    ext: attachment.ext,
    size: attachment.size,
    type: attachment.type,
    isImage: attachment.isImage,
    preview: attachment.preview,
    content: attachment.isImage ? attachment.content : undefined,
  };
}

async function ensureActiveSession(backendUrl, content) {
  const sessionStore = useSessionStore.getState();
  if (sessionStore.activeSessionId) return sessionStore.activeSessionId;

  const workspaceId = useWorkspaceStore.getState().activeWorkspaceId;
  const title = content?.trim()
    ? content.trim().split(/\s+/).slice(0, 7).join(' ')
    : 'New session';

  // If there's an active workspace, create a backend-persisted session
  if (workspaceId) {
    const session = await sessionStore.createSession(workspaceId, title);
    return session?.id || null;
  }

  // No workspace — create a local-only session ID
  const localId = `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  sessionStore.setActiveSessionId(localId);
  return localId;
}

function buildModelContent(content, attachments) {
  const textParts = attachments
    .filter((attachment) => !attachment.isImage && attachment.content)
    .map((attachment) => {
      const ext = attachment.ext || 'text';
      return `Attached file: ${attachment.name}\n\`\`\`${ext}\n${attachment.content}\n\`\`\``;
    });

  const imageParts = attachments
    .filter((attachment) => attachment.isImage)
    .map((attachment) => ({
      type: 'image_url',
      image_url: { url: attachment.content || attachment.preview },
    }));

  const text = [...textParts, content].filter(Boolean).join('\n\n');
  if (!imageParts.length) return text;

  return [
    { type: 'text', text: text || 'Please inspect the attached image.' },
    ...imageParts,
  ];
}
