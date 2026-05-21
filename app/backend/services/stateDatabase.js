import { Database } from 'bun:sqlite';
import { mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const BACKEND_DIR = dirname(dirname(fileURLToPath(import.meta.url)));
const DB_PATH = process.env.JARVIS_DB_PATH || join(BACKEND_DIR, 'data', 'jarvis.sqlite');

mkdirSync(dirname(DB_PATH), { recursive: true });

const db = new Database(DB_PATH);
db.run('PRAGMA journal_mode = WAL');

// ── Schema ────────────────────────────────────────────────────────────────────

db.run(`
  CREATE TABLE IF NOT EXISTS workspaces (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    path TEXT NOT NULL UNIQUE,
    created_at INTEGER NOT NULL,
    last_opened_at INTEGER NOT NULL,
    settings TEXT DEFAULT '{}'
  )
`);

db.run(`
  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL,
    title TEXT NOT NULL DEFAULT 'New session',
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
  )
`);

db.run(`
  CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    role TEXT NOT NULL,
    content TEXT NOT NULL DEFAULT '',
    timestamp INTEGER NOT NULL,
    tool_results TEXT,
    attachments TEXT,
    FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
  )
`);

// Add attachments column if missing (migration for existing DBs)
try { db.run('ALTER TABLE messages ADD COLUMN attachments TEXT'); } catch {}

db.run(`
  CREATE TABLE IF NOT EXISTS app_state (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at INTEGER NOT NULL
  )
`);

// Indexes for performance
db.run('CREATE INDEX IF NOT EXISTS idx_sessions_workspace ON sessions(workspace_id)');
db.run('CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id)');

// ── Prepared statements ───────────────────────────────────────────────────────

const stmts = {
  // app_state
  getState: db.query('SELECT value FROM app_state WHERE key = ?'),
  upsertState: db.query(`
    INSERT INTO app_state (key, value, updated_at) VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
  `),

  // workspaces
  allWorkspaces: db.query('SELECT * FROM workspaces ORDER BY last_opened_at DESC'),
  getWorkspace: db.query('SELECT * FROM workspaces WHERE id = ?'),
  getWorkspaceByPath: db.query('SELECT * FROM workspaces WHERE path = ?'),
  insertWorkspace: db.query(`
    INSERT INTO workspaces (id, name, path, created_at, last_opened_at, settings)
    VALUES (?, ?, ?, ?, ?, ?)
  `),
  updateWorkspaceOpened: db.query('UPDATE workspaces SET last_opened_at = ? WHERE id = ?'),
  updateWorkspaceName: db.query('UPDATE workspaces SET name = ? WHERE id = ?'),
  updateWorkspaceSettings: db.query('UPDATE workspaces SET settings = ? WHERE id = ?'),
  deleteWorkspace: db.query('DELETE FROM workspaces WHERE id = ?'),

  // sessions
  sessionsByWorkspace: db.query('SELECT * FROM sessions WHERE workspace_id = ? ORDER BY updated_at DESC'),
  getSession: db.query('SELECT * FROM sessions WHERE id = ?'),
  insertSession: db.query(`
    INSERT INTO sessions (id, workspace_id, title, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?)
  `),
  updateSessionTitle: db.query('UPDATE sessions SET title = ?, updated_at = ? WHERE id = ?'),
  updateSessionTimestamp: db.query('UPDATE sessions SET updated_at = ? WHERE id = ?'),
  deleteSession: db.query('DELETE FROM sessions WHERE id = ?'),
  deleteSessionsByWorkspace: db.query('DELETE FROM sessions WHERE workspace_id = ?'),

  // messages
  messagesBySession: db.query('SELECT * FROM messages WHERE session_id = ? ORDER BY timestamp ASC'),
  insertMessage: db.query(`
    INSERT INTO messages (id, session_id, role, content, timestamp, tool_results, attachments)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `),
  deleteMessagesBySession: db.query('DELETE FROM messages WHERE session_id = ?'),
};

// ── Workspace operations ──────────────────────────────────────────────────────

export function listWorkspaces() {
  return stmts.allWorkspaces.all().map(parseWorkspaceRow);
}

export function getWorkspace(id) {
  const row = stmts.getWorkspace.get(id);
  return row ? parseWorkspaceRow(row) : null;
}

export function getWorkspaceByPath(path) {
  const row = stmts.getWorkspaceByPath.get(path);
  return row ? parseWorkspaceRow(row) : null;
}

export function createWorkspace({ id, name, path }) {
  const now = Date.now();
  stmts.insertWorkspace.run(id, name, path, now, now, '{}');
  return { id, name, path, createdAt: now, lastOpenedAt: now, settings: {} };
}

export function touchWorkspace(id) {
  stmts.updateWorkspaceOpened.run(Date.now(), id);
}

export function renameWorkspace(id, name) {
  stmts.updateWorkspaceName.run(name, id);
}

export function updateWorkspaceSettings(id, settings) {
  stmts.updateWorkspaceSettings.run(JSON.stringify(settings), id);
}

export function removeWorkspace(id) {
  stmts.deleteSessionsByWorkspace.run(id);
  stmts.deleteWorkspace.run(id);
}

// ── Session operations ────────────────────────────────────────────────────────

export function listSessions(workspaceId) {
  return stmts.sessionsByWorkspace.all(workspaceId).map(parseSessionRow);
}

export function getSession(id) {
  const row = stmts.getSession.get(id);
  return row ? parseSessionRow(row) : null;
}

export function createSession({ id, workspaceId, title }) {
  const now = Date.now();
  stmts.insertSession.run(id, workspaceId, title || 'New session', now, now);
  return { id, workspaceId, title: title || 'New session', createdAt: now, updatedAt: now };
}

export function updateSessionTitle(id, title) {
  stmts.updateSessionTitle.run(title, Date.now(), id);
}

export function removeSession(id) {
  stmts.deleteMessagesBySession.run(id);
  stmts.deleteSession.run(id);
}

// ── Message operations ────────────────────────────────────────────────────────

export function getMessages(sessionId) {
  return stmts.messagesBySession.all(sessionId).map(parseMessageRow);
}

export function saveMessages(sessionId, messages) {
  const tx = db.transaction(() => {
    stmts.deleteMessagesBySession.run(sessionId);
    for (const msg of messages) {
      stmts.insertMessage.run(
        msg.id || genId(),
        sessionId,
        msg.role,
        msg.content || '',
        msg.timestamp || Date.now(),
        msg.toolResults ? JSON.stringify(msg.toolResults) : null,
        msg.attachments ? JSON.stringify(msg.attachments) : null,
      );
    }
    stmts.updateSessionTimestamp.run(Date.now(), sessionId);
  });
  tx();
}

// ── App-level state (active workspace, session, preferences) ──────────────────

export function getActiveIds() {
  return {
    activeWorkspaceId: readJson('activeWorkspaceId', null),
    activeSessionId: readJson('activeSessionId', null),
  };
}

export function setActiveIds({ activeWorkspaceId, activeSessionId }) {
  if (activeWorkspaceId !== undefined) writeJson('activeWorkspaceId', activeWorkspaceId);
  if (activeSessionId !== undefined) writeJson('activeSessionId', activeSessionId);
}

export function getPreferences() {
  return readJson('preferences', {});
}

export function setPreferences(prefs) {
  writeJson('preferences', prefs);
}

// ── Legacy compat: getAppState for old hydration ──────────────────────────────

export function getAppState() {
  const { activeWorkspaceId, activeSessionId } = getActiveIds();
  const workspaces = listWorkspaces();
  const workspace = activeWorkspaceId ? getWorkspace(activeWorkspaceId) : null;
  const sessions = workspace ? listSessions(workspace.id) : [];
  const messages = activeSessionId ? getMessages(activeSessionId) : [];

  return {
    activeWorkspaceId,
    activeSessionId,
    workspaces,
    workspace,
    sessions,
    messages,
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function readJson(key, fallback) {
  const row = stmts.getState.get(key);
  if (!row?.value) return fallback;
  try { return JSON.parse(row.value); } catch { return fallback; }
}

function writeJson(key, value) {
  stmts.upsertState.run(key, JSON.stringify(value), Date.now());
}

function parseWorkspaceRow(row) {
  return {
    id: row.id,
    name: row.name,
    path: row.path,
    createdAt: row.created_at,
    lastOpenedAt: row.last_opened_at,
    settings: tryParse(row.settings, {}),
  };
}

function parseSessionRow(row) {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    title: row.title,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function parseMessageRow(row) {
  return {
    id: row.id,
    sessionId: row.session_id,
    role: row.role,
    content: row.content,
    timestamp: row.timestamp,
    toolResults: tryParse(row.tool_results, undefined),
    attachments: tryParse(row.attachments, undefined),
  };
}

function tryParse(json, fallback) {
  if (!json) return fallback;
  try { return JSON.parse(json); } catch { return fallback; }
}

function genId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
