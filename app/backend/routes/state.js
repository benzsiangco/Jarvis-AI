import {
  listWorkspaces, getWorkspace, getWorkspaceByPath, createWorkspace,
  touchWorkspace, renameWorkspace, removeWorkspace, updateWorkspaceSettings,
  listSessions, getSession, createSession, updateSessionTitle, removeSession,
  getMessages, saveMessages,
  getActiveIds, setActiveIds,
  getAppState,
} from '../services/stateDatabase.js';

function genId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export async function stateRoute(req, url) {
  const path = url.pathname;
  const method = req.method;

  // ── Full state hydration (GET /api/state) ─────────────────────────────────
  if (path === '/api/state' && method === 'GET') {
    return Response.json(getAppState());
  }

  // ── Active IDs ────────────────────────────────────────────────────────────
  if (path === '/api/state/active') {
    if (method === 'GET') return Response.json(getActiveIds());
    if (method === 'PUT') {
      const body = await req.json().catch(() => ({}));
      setActiveIds(body);
      return Response.json({ ok: true });
    }
  }

  // ── Workspaces ────────────────────────────────────────────────────────────
  if (path === '/api/state/workspaces' && method === 'GET') {
    return Response.json(listWorkspaces());
  }

  if (path === '/api/state/workspaces' && method === 'POST') {
    const body = await req.json().catch(() => ({}));
    if (!body.path) return Response.json({ error: 'path required' }, { status: 400 });

    // Check if workspace already exists at this path
    const existing = getWorkspaceByPath(body.path);
    if (existing) {
      touchWorkspace(existing.id);
      setActiveIds({ activeWorkspaceId: existing.id });
      return Response.json(existing);
    }

    const name = body.name || body.path.split(/[\\/]/).filter(Boolean).pop() || 'Workspace';
    const workspace = createWorkspace({ id: genId(), name, path: body.path });
    setActiveIds({ activeWorkspaceId: workspace.id });

    // Auto-create first session
    const session = createSession({ id: genId(), workspaceId: workspace.id, title: 'New session' });
    setActiveIds({ activeSessionId: session.id });

    return Response.json({ workspace, session });
  }

  // Single workspace operations: /api/state/workspaces/:id
  const wsMatch = path.match(/^\/api\/state\/workspaces\/([^/]+)$/);
  if (wsMatch) {
    const wsId = wsMatch[1];
    if (method === 'GET') {
      const ws = getWorkspace(wsId);
      return ws ? Response.json(ws) : Response.json({ error: 'not found' }, { status: 404 });
    }
    if (method === 'PUT') {
      const body = await req.json().catch(() => ({}));
      if (body.name) renameWorkspace(wsId, body.name);
      if (body.settings) updateWorkspaceSettings(wsId, body.settings);
      touchWorkspace(wsId);
      return Response.json({ ok: true });
    }
    if (method === 'DELETE') {
      removeWorkspace(wsId);
      // If deleting the active workspace, clear active IDs
      const active = getActiveIds();
      if (active.activeWorkspaceId === wsId) {
        const remaining = listWorkspaces();
        setActiveIds({
          activeWorkspaceId: remaining[0]?.id || null,
          activeSessionId: null,
        });
      }
      return Response.json({ ok: true });
    }
  }

  // ── Sessions ──────────────────────────────────────────────────────────────
  // /api/state/workspaces/:id/sessions
  const sessListMatch = path.match(/^\/api\/state\/workspaces\/([^/]+)\/sessions$/);
  if (sessListMatch) {
    const wsId = sessListMatch[1];
    if (method === 'GET') return Response.json(listSessions(wsId));
    if (method === 'POST') {
      const body = await req.json().catch(() => ({}));
      const session = createSession({
        id: genId(),
        workspaceId: wsId,
        title: body.title || 'New session',
      });
      setActiveIds({ activeSessionId: session.id });
      touchWorkspace(wsId);
      return Response.json(session);
    }
  }

  // /api/state/sessions/:id
  const sessMatch = path.match(/^\/api\/state\/sessions\/([^/]+)$/);
  if (sessMatch) {
    const sessId = sessMatch[1];
    if (method === 'GET') {
      const session = getSession(sessId);
      if (!session) return Response.json({ error: 'not found' }, { status: 404 });
      const messages = getMessages(sessId);
      return Response.json({ ...session, messages });
    }
    if (method === 'PUT') {
      const body = await req.json().catch(() => ({}));
      if (body.title) updateSessionTitle(sessId, body.title);
      return Response.json({ ok: true });
    }
    if (method === 'DELETE') {
      const session = getSession(sessId);
      removeSession(sessId);
      const active = getActiveIds();
      if (active.activeSessionId === sessId) {
        const remaining = session?.workspaceId ? listSessions(session.workspaceId) : [];
        setActiveIds({ activeSessionId: remaining[0]?.id || null });
      }
      return Response.json({ ok: true });
    }
  }

  // ── Messages ──────────────────────────────────────────────────────────────
  // /api/state/sessions/:id/messages
  const msgMatch = path.match(/^\/api\/state\/sessions\/([^/]+)\/messages$/);
  if (msgMatch) {
    const sessId = msgMatch[1];
    if (method === 'GET') return Response.json(getMessages(sessId));
    if (method === 'PUT') {
      const body = await req.json().catch(() => ({}));
      if (Array.isArray(body.messages)) saveMessages(sessId, body.messages);
      return Response.json({ ok: true });
    }
  }

  // ── Legacy compat: PUT /api/state/chat & /api/state/workspace ─────────────
  if (path === '/api/state/chat' && (method === 'PUT' || method === 'POST')) {
    const body = await req.json().catch(() => ({}));
    const active = getActiveIds();
    if (active.activeSessionId && Array.isArray(body.messages)) {
      saveMessages(active.activeSessionId, body.messages);
    }
    return Response.json({ ok: true });
  }

  if (path === '/api/state/workspace' && (method === 'PUT' || method === 'POST')) {
    const body = await req.json().catch(() => ({}));
    if (body.workspacePath) {
      const existing = getWorkspaceByPath(body.workspacePath);
      if (existing) {
        touchWorkspace(existing.id);
        setActiveIds({ activeWorkspaceId: existing.id });
      }
    }
    return Response.json({ ok: true });
  }

  return Response.json({ error: 'Not found' }, { status: 404 });
}
