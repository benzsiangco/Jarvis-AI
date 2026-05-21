import { useState } from 'react';
import { ChevronDown, ChevronRight, Folder, FolderOpen, MessageSquare, Plus, X } from 'lucide-react';
import useFileStore from '../stores/fileStore';
import useChatStore from '../stores/chatStore';
import useWorkspaceStore from '../stores/workspaceStore';
import useSessionStore from '../stores/sessionStore';

export function NewThreadButton({ backendUrl }) {
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId);
  const createSession = useSessionStore((s) => s.createSession);

  const handleNewThread = async () => {
    // createSession persists the current session's messages first,
    // then clears local state — do NOT call clearMessages here.
    if (activeWorkspaceId) await createSession(activeWorkspaceId, 'New session');
  };

  return (
    <div className="border-b border-[var(--color-border-default)] px-3.5 py-3">
      <button
        onClick={handleNewThread}
        className="flex w-full items-center justify-center gap-2 rounded-lg bg-[var(--color-accent)] px-3 py-2.5 text-[12px] font-semibold text-[var(--color-bg-primary)] shadow-sm transition-colors hover:bg-[var(--color-accent-hover)]"
      >
        <Plus size={14} />
        New thread
      </button>
    </div>
  );
}

export default function WorkspaceTree({ backendUrl }) {
  const workspaces = useWorkspaceStore((s) => s.workspaces);
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId);
  const switchWorkspace = useWorkspaceStore((s) => s.switchWorkspace);
  const removeWorkspace = useWorkspaceStore((s) => s.removeWorkspace);
  const addWorkspace = useWorkspaceStore((s) => s.addWorkspace);
  const sessions = useSessionStore((s) => s.sessions);
  const activeSessionId = useSessionStore((s) => s.activeSessionId);
  const switchSession = useSessionStore((s) => s.switchSession);
  const removeSession = useSessionStore((s) => s.removeSession);
  const hydrateSessions = useSessionStore((s) => s.hydrate);
  const loadSession = useChatStore((s) => s.loadSession);
  const isStreaming = useChatStore((s) => s.isStreaming);
  const setWorkspacePath = useFileStore((s) => s.setWorkspacePath);
  const fetchTree = useFileStore((s) => s.fetchTree);
  const [collapsed, setCollapsed] = useState({});

  const toggleCollapse = (id) => setCollapsed((s) => ({ ...s, [id]: !s[id] }));

  const handleSwitchWorkspace = async (ws) => {
    await switchWorkspace(ws.id);
    setWorkspacePath(ws.path);
    fetchTree(backendUrl, ws.path).catch(() => {});
    await hydrateSessions(backendUrl, ws.id);
    const firstSession = useSessionStore.getState().activeSessionId;
    if (firstSession) await loadSession(backendUrl, firstSession);
  };

  const handleRemoveSession = async (event, sessionId) => {
    event.stopPropagation();
    const wasActive = sessionId === useSessionStore.getState().activeSessionId;
    const result = await removeSession(sessionId);
    if (!result?.ok) {
      alert(result?.error || 'Failed to delete session.');
      return;
    }
    if (!wasActive) return;
    const nextSessionId = useSessionStore.getState().activeSessionId;
    if (nextSessionId) await loadSession(backendUrl, nextSessionId);
    else useChatStore.getState().clearMessages(backendUrl);
  };

  const handleAddWorkspace = async () => {
    const selectedPath = await pickWorkspacePath();
    if (!selectedPath) return;
    const result = await addWorkspace(selectedPath);
    if (!result?.workspace) return;
    setWorkspacePath(result.workspace.path);
    fetchTree(backendUrl, result.workspace.path).catch(() => {});
    await hydrateSessions(backendUrl, result.workspace.id);
    if (result.session) {
      await switchSession(result.session.id);
      useChatStore.getState().clearMessages(backendUrl);
    }
  };

  if (!workspaces.length) {
    return <EmptyProjects onAddWorkspace={handleAddWorkspace} />;
  }

  return (
    <div className="overflow-y-auto border-b border-[var(--color-border-default)]" style={{ maxHeight: '40%' }}>
      <div className="flex items-center justify-between px-3 py-2">
        <div className="text-[11px] font-semibold uppercase tracking-widest text-[var(--color-text-muted)]">Projects</div>
        <button onClick={handleAddWorkspace} className="rounded p-1.5 text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-secondary)]" title="Add workspace">
          <Plus size={14} />
        </button>
      </div>

      <div className="space-y-0.5 px-2 pb-2">
        {workspaces.map((ws) => {
          const isActive = ws.id === activeWorkspaceId;
          const isCollapsed = collapsed[ws.id];
          const wsSessions = isActive ? sessions : [];

          return (
            <div key={ws.id}>
              <WorkspaceRow
                ws={ws}
                isActive={isActive}
                isCollapsed={isCollapsed}
                onClick={() => (isActive ? toggleCollapse(ws.id) : handleSwitchWorkspace(ws))}
                onRemove={(event) => {
                  event.stopPropagation();
                  if (confirm('Remove this workspace? Sessions will be deleted.')) removeWorkspace(ws.id);
                }}
              />
              {isActive && !isCollapsed && (
                <SessionList
                  sessions={wsSessions}
                  activeSessionId={activeSessionId}
                  isStreaming={isStreaming}
                  onSwitchSession={async (session) => {
                    await switchSession(session.id);
                    await loadSession(backendUrl, session.id);
                  }}
                  onRemoveSession={handleRemoveSession}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function EmptyProjects({ onAddWorkspace }) {
  return (
    <div className="border-b border-[var(--color-border-default)] px-3 py-3">
      <div className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-[var(--color-text-muted)]">Projects</div>
      <button onClick={onAddWorkspace} className="w-full rounded-lg border border-dashed border-[var(--color-border-default)] bg-[var(--color-bg-tertiary)] px-3 py-3 text-[12px] text-[var(--color-text-secondary)] transition-colors hover:border-[var(--color-accent)] hover:bg-[var(--color-bg-hover)]">
        <FolderOpen size={14} className="mr-2 inline text-[var(--color-text-muted)]" />
        Open workspace folder
      </button>
    </div>
  );
}

function WorkspaceRow({ ws, isActive, isCollapsed, onClick, onRemove }) {
  return (
    <button onClick={onClick} className={`group flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left transition-colors ${isActive ? 'bg-[var(--color-bg-active)] text-[var(--color-text-primary)]' : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)]'}`}>
      {isActive && !isCollapsed
        ? <ChevronDown size={12} className="flex-shrink-0 text-[var(--color-text-muted)]" />
        : <ChevronRight size={12} className="flex-shrink-0 text-[var(--color-text-muted)]" />}
      <Folder size={15} className={`flex-shrink-0 ${isActive ? 'text-[var(--color-accent)]' : 'text-[var(--color-text-muted)]'}`} />
      <span className="min-w-0 flex-1 truncate text-[13px] font-medium">{ws.name}</span>
      <button onClick={onRemove} className="hidden rounded p-0.5 text-[var(--color-text-muted)] transition-colors hover:text-red-400 group-hover:flex" title="Remove workspace">
        <X size={11} />
      </button>
    </button>
  );
}

function SessionList({ sessions, activeSessionId, isStreaming, onSwitchSession, onRemoveSession }) {
  if (!sessions.length) {
    return <div className="px-2 py-1 text-[10px] text-[var(--color-text-muted)]">No sessions</div>;
  }
  return (
    <div className="ml-3 mt-0.5 space-y-0.5">
      {sessions.map((session) => {
        const isActive = session.id === activeSessionId;
        return (
          <button key={session.id} onClick={() => onSwitchSession(session)} className={`group flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left transition-colors ${isActive ? 'bg-[var(--color-accent-dim)] text-[var(--color-text-primary)]' : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)]'}`}>
            <MessageSquare size={13} className={`flex-shrink-0 ${isActive ? 'text-[var(--color-accent)]' : 'text-[var(--color-text-muted)]'}`} />
            <span className="min-w-0 flex-1 truncate text-[12px]">{session.title}</span>
            {isActive && isStreaming && <span className="h-1.5 w-1.5 flex-shrink-0 animate-pulse rounded-full bg-[var(--color-accent)]" />}
            <button onClick={(event) => onRemoveSession(event, session.id)} className="hidden rounded p-0.5 text-[var(--color-text-muted)] transition-colors hover:text-red-400 group-hover:flex" title="Delete session">
              <X size={10} />
            </button>
          </button>
        );
      })}
    </div>
  );
}

async function pickWorkspacePath() {
  try {
    return window.electronAPI?.pickFolder
      ? await window.electronAPI.pickFolder()
      : prompt('Enter workspace path:');
  } catch {
    return null;
  }
}
