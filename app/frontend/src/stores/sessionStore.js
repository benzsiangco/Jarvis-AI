import { create } from 'zustand';
import useChatStore from './chatStore';

const useSessionStore = create((set, get) => ({
  sessions: [],             // sessions for the current active workspace
  activeSessionId: null,
  backendUrl: '',

  /** Hydrate sessions for a workspace. Called when workspace switches. */
  hydrate: async (backendUrl, workspaceId, initialSessionId) => {
    set({ backendUrl });
    if (!workspaceId) {
      set({ sessions: [], activeSessionId: null });
      return;
    }
    try {
      const res = await fetch(`${backendUrl}/api/state/workspaces/${workspaceId}/sessions`);
      if (!res.ok) return;
      const sessions = await res.json();
      const activeSessionId = initialSessionId
        || sessions.find((s) => s.id === get().activeSessionId)?.id
        || sessions[0]?.id
        || null;
      set({ sessions, activeSessionId });
    } catch {
      set({ sessions: [], activeSessionId: null });
    }
  },

  /** Create a new session in the current workspace */
  createSession: async (workspaceId, title) => {
    const { backendUrl, sessions } = get();
    if (!backendUrl || !workspaceId) return null;
    try {
      // Persist current session messages BEFORE switching to the new session
      await useChatStore.getState().persist();

      const res = await fetch(`${backendUrl}/api/state/workspaces/${workspaceId}/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: title || 'New session' }),
      });
      const session = await res.json();
      set({ sessions: [session, ...sessions], activeSessionId: session.id });
      // Persist active session
      await persistActiveSession(backendUrl, session.id);
      // Clear chat messages for the new empty session
      useChatStore.getState().clearMessagesLocal();
      return session;
    } catch (err) {
      console.error('[SessionStore] createSession error:', err);
      return null;
    }
  },

  /** Switch active session */
  switchSession: async (sessionId) => {
    const { backendUrl } = get();
    set({ activeSessionId: sessionId });
    await persistActiveSession(backendUrl, sessionId);
    // Load the messages for the newly selected session
    await useChatStore.getState().loadSession(backendUrl, sessionId);
  },

  /** Remove a session */
  removeSession: async (sessionId) => {
    const { backendUrl, sessions, activeSessionId } = get();
    try {
      const res = await fetch(`${backendUrl}/api/state/sessions/${sessionId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(`Delete failed: HTTP ${res.status}`);

      const remaining = sessions.filter((s) => s.id !== sessionId);
      const nextActiveSessionId = activeSessionId === sessionId
        ? (remaining[0]?.id || null)
        : activeSessionId;

      set({
        sessions: remaining,
        activeSessionId: nextActiveSessionId,
      });

      if (activeSessionId === sessionId) {
        await persistActiveSession(backendUrl, nextActiveSessionId);
      }

      return { ok: true, activeSessionId: nextActiveSessionId };
    } catch (err) {
      console.error('[SessionStore] removeSession error:', err);
      return { ok: false, error: err.message };
    }
  },

  /** Rename a session */
  renameSession: async (sessionId, title) => {
    const { backendUrl } = get();
    try {
      await fetch(`${backendUrl}/api/state/sessions/${sessionId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title }),
      });
      set((s) => ({
        sessions: s.sessions.map((sess) =>
          sess.id === sessionId ? { ...sess, title } : sess
        ),
      }));
    } catch {}
  },

  /** Auto-title a session based on the first user message */
  autoTitle: async (sessionId, messages) => {
    const firstUser = messages.find((m) => m.role === 'user')?.content?.trim();
    if (!firstUser) return;
    const title = firstUser.split(/\s+/).slice(0, 7).join(' ');
    await get().renameSession(sessionId, title);
  },

  /** Set the active session ID directly (used during hydration) */
  setActiveSessionId: (id) => set({ activeSessionId: id }),
}));

async function persistActiveSession(backendUrl, sessionId) {
  if (!backendUrl) return;
  try {
    await fetch(`${backendUrl}/api/state/active`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ activeSessionId: sessionId }),
    });
  } catch {}
}

export default useSessionStore;
