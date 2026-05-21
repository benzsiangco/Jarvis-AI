import { useEffect, useState, useRef } from 'react';
import {
  Settings, X, Cpu, Globe,
  ChevronDown, ChevronRight, File, Folder,
  FilePlus, FolderOpen, Plus, MessageSquare,
  History,
} from 'lucide-react';
import useFileStore from '../stores/fileStore';
import useEditorStore from '../stores/editorStore';
import useWorkspaceStore from '../stores/workspaceStore';
import useSessionStore from '../stores/sessionStore';
import useChatStore from '../stores/chatStore';
import SettingsModal from './SettingsModal';
import RuntimeManagerModal from './RuntimeManagerModal';
import ProviderManagerModal from './ProviderManagerModal';

export default function Sidebar({ backendUrl }) {
  const [modalType, setModalType] = useState(null);

  const handleNavClick = (id) => {
    setModalType(id);
  };

  return (
    <>
      <div className="flex h-full flex-col" style={{ background:'#0f1014', borderRight:'1px solid rgba(255,255,255,0.04)' }}>
        {/* New session button */}
        <div style={{ padding:'10px', borderBottom:'1px solid rgba(255,255,255,0.04)' }}>
          <NewSessionButton backendUrl={backendUrl} />
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden" style={{ padding:'4px 0' }}>
          <ChatHistorySection backendUrl={backendUrl} />
          <FilesSection backendUrl={backendUrl} />
        </div>

        {/* Bottom nav */}
        <div style={{ borderTop:'1px solid rgba(255,255,255,0.04)', padding:'4px 6px', display:'flex', flexDirection:'column', gap:2 }}>
          <button onClick={() => handleNavClick('provider')} className="sidebar-nav-item">
            <Globe size={14} style={{ flexShrink:0 }} />
            <span>Providers</span>
          </button>
          <button onClick={() => handleNavClick('runtime')} className="sidebar-nav-item">
            <Cpu size={14} style={{ flexShrink:0 }} />
            <span>Runtime</span>
          </button>
          <button onClick={() => handleNavClick('settings')} className="sidebar-nav-item">
            <Settings size={14} style={{ flexShrink:0 }} />
            <span>Settings</span>
          </button>
        </div>

      </div>

      <ProviderManagerModal
        open={modalType === 'provider'}
        onClose={() => setModalType(null)}
        backendUrl={backendUrl}
      />
      <RuntimeManagerModal
        open={modalType === 'runtime'}
        onClose={() => setModalType(null)}
        backendUrl={backendUrl}
      />
      <SettingsModal
        open={modalType === 'settings'}
        onClose={() => setModalType(null)}
        backendUrl={backendUrl}
      />
    </>
  );
}

/* ── New Session Button ── */
function NewSessionButton({ backendUrl }) {
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId);
  const createSession = useSessionStore((s) => s.createSession);

  const handleNew = async () => {
    // createSession persists the current session's messages first,
    // then clears local state — do NOT call clearMessages here or it
    // will wipe the current session's data before it's saved.
    if (activeWorkspaceId) await createSession(activeWorkspaceId, 'New session');
  };

  return (
    <button
      onClick={handleNew}
      style={{ display:'flex', width:'100%', alignItems:'center', justifyContent:'center', gap:7, borderRadius:8, background:'rgba(255,255,255,0.06)', border:'1px solid rgba(255,255,255,0.08)', padding:'8px 12px', fontSize:12, fontWeight:650, color:'#c8cad4', transition:'all .12s' }}
      onMouseEnter={e => { e.currentTarget.style.background='rgba(255,255,255,0.09)'; e.currentTarget.style.color='#e2e4ea'; }}
      onMouseLeave={e => { e.currentTarget.style.background='rgba(255,255,255,0.06)'; e.currentTarget.style.color='#c8cad4'; }}
    >
      <Plus size={14} />
      New session
    </button>
  );
}

/* ── Chat History Section ── */
function ChatHistorySection({ backendUrl }) {
  const sessions = useSessionStore((s) => s.sessions);
  const activeSessionId = useSessionStore((s) => s.activeSessionId);
  const switchSession = useSessionStore((s) => s.switchSession);
  const removeSession = useSessionStore((s) => s.removeSession);
  const renameSession = useSessionStore((s) => s.renameSession);
  const loadSession = useChatStore((s) => s.loadSession);
  const isStreaming = useChatStore((s) => s.isStreaming);
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId);

  const [renamingId, setRenamingId] = useState(null);

  const handleSwitch = async (session) => {
    await switchSession(session.id);
    await loadSession(backendUrl, session.id);
  };

  const handleRemove = async (e, sessionId) => {
    e.stopPropagation();
    const wasActive = sessionId === useSessionStore.getState().activeSessionId;
    const result = await removeSession(sessionId);
    if (!result?.ok) return;
    if (!wasActive) return;
    const next = useSessionStore.getState().activeSessionId;
    if (next) await loadSession(backendUrl, next);
    else useChatStore.getState().clearMessages(backendUrl);
  };

  if (!activeWorkspaceId) {
    return (
      <div style={{ padding:'24px 16px', textAlign:'center', color:'#52546a', fontSize:11.5 }}>
        Open a project to start chatting.
      </div>
    );
  }

  return (
    <div style={{ padding:'8px 0 4px' }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'2px 12px 6px' }}>
        <span style={{ fontSize:10, fontWeight:700, letterSpacing:'.07em', textTransform:'uppercase', color:'#52546a' }}>Chat History</span>
        <History size={12} style={{ color:'#52546a' }} />
      </div>
      <div style={{ padding:'0 6px' }}>
        {sessions.length === 0 ? (
          <div style={{ padding:'6px 12px', fontSize:11, color:'#52546a' }}>No sessions yet</div>
        ) : (
          sessions.map((session) => {
            const active = session.id === activeSessionId;
            const isRenaming = session.id === renamingId;
            return (
              <div
                key={session.id}
                role="button"
                tabIndex={0}
                onClick={() => { if (!isRenaming) handleSwitch(session); }}
                onKeyDown={(e) => {
                  if ((e.key === 'Enter' || e.key === ' ') && !isRenaming) { e.preventDefault(); handleSwitch(session); }
                }}
                onContextMenu={(e) => {
                  e.preventDefault();
                  setRenamingId(session.id);
                }}
                className={`session-row ${active ? 'session-row-active' : ''}`}
              >
                <MessageSquare size={12} style={{ flexShrink:0, color: active ? '#7c6df0' : '#52546a', marginTop:1 }} />
                {isRenaming ? (
                  <RenameInput
                    value={session.title}
                    onSave={async (title) => {
                      if (title?.trim()) await renameSession(session.id, title.trim());
                      setRenamingId(null);
                    }}
                    onCancel={() => setRenamingId(null)}
                  />
                ) : (
                  <span className="session-title">{session.title}</span>
                )}
                {active && isStreaming && <span style={{ width:5, height:5, borderRadius:'50%', background:'#7c6df0', flexShrink:0, animation:'tp-live-dot 1.1s ease-in-out infinite' }} />}
                <span className="session-actions">
                  <button onClick={(e) => handleRemove(e, session.id)} style={{ padding:'1px 3px', borderRadius:3, color:'#52546a', transition:'color .12s' }} onMouseEnter={e=>e.currentTarget.style.color='#f87171'} onMouseLeave={e=>e.currentTarget.style.color='#52546a'}>
                    <X size={10} />
                  </button>
                </span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

/* ── Inline Rename Input ── */
function RenameInput({ value, onSave, onCancel }) {
  const [text, setText] = useState(value);
  const ref = useRef(null);

  useEffect(() => { ref.current?.focus(); ref.current?.select(); }, []);

  const submit = () => {
    const trimmed = text.trim();
    if (trimmed && trimmed !== value) onSave(trimmed);
    else onCancel();
  };

  return (
    <input
      ref={ref}
      value={text}
      onChange={(e) => setText(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') submit();
        if (e.key === 'Escape') onCancel();
        e.stopPropagation();
      }}
      onBlur={submit}
      onClick={(e) => e.stopPropagation()}
      style={{
        flex:1, minWidth:0, fontSize:12, lineHeight:1.35,
        background:'rgba(124,109,240,0.12)', border:'1px solid rgba(124,109,240,0.3)',
        borderRadius:4, padding:'1px 4px', color:'#e2e4ea', outline:'none',
      }}
    />
  );
}

/* ── Files Section ── */
function FilesSection({ backendUrl }) {
  const { tree, fetchTree, expandedPaths, toggleExpanded, workspacePath, createFile, recentlyModified } = useFileStore();
  const addWorkspace = useWorkspaceStore((s) => s.addWorkspace);
  const setWorkspacePath = useFileStore((s) => s.setWorkspacePath);
  const openFile = useEditorStore((s) => s.openFile);
  const readFile = useFileStore((s) => s.readFile);

  useEffect(() => {
    if (!tree && workspacePath) fetchTree(backendUrl, workspacePath);
  }, [backendUrl, fetchTree, tree, workspacePath]);

  const handleOpenFolder = async () => {
    let path = null;
    try {
      path = window.electronAPI?.pickFolder
        ? await window.electronAPI.pickFolder()
        : prompt('Enter workspace path:');
    } catch {}
    if (!path) return;
    const result = await addWorkspace(path);
    if (result?.workspace) {
      setWorkspacePath(result.workspace.path);
      await fetchTree(backendUrl, result.workspace.path);
    }
  };

  const handleCreateFile = async () => {
    if (!workspacePath) { await handleOpenFolder(); return; }
    const name = prompt('New file name:');
    if (!name?.trim()) return;
    const filePath = joinPath(workspacePath, name.trim());
    const result = await createFile(backendUrl, filePath, '');
    if (result.error) { alert(result.error); return; }
    await fetchTree(backendUrl, workspacePath);
    openFile({ path: filePath, name: name.trim().split(/[\\/]/).pop(), content: '', language: detectLang(name) });
  };

  const handleOpenFile = async (node) => {
    if (node.type === 'directory') { toggleExpanded(node.path); return; }
    try {
      const data = await readFile(backendUrl, node.path);
      openFile({ path: node.path, name: node.name, content: data.content || '', language: detectLang(node.name) });
    } catch {}
  };

  return (
    <div style={{ borderTop:'1px solid rgba(255,255,255,0.04)', paddingTop:8 }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'0 12px 6px' }}>
        <span style={{ fontSize:10, fontWeight:700, letterSpacing:'.07em', textTransform:'uppercase', color:'#52546a' }}>Files</span>
        <div style={{ display:'flex', gap:3 }}>
          <button onClick={handleOpenFolder} className="explorer-action" title="Open folder"><FolderOpen size={12} /></button>
          <button onClick={handleCreateFile} className="explorer-action" title="New file"><FilePlus size={12} /></button>
        </div>
      </div>

      {workspacePath && (
        <div style={{ padding:'0 12px 6px', fontSize:10, color:'#52546a', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
          {workspacePath}
        </div>
      )}

      {!workspacePath && (
        <div style={{ padding:'0 8px 6px' }}>
          <button onClick={handleOpenFolder} style={{ width:'100%', borderRadius:7, border:'1px solid rgba(255,255,255,0.06)', background:'rgba(255,255,255,0.02)', padding:'7px 10px', fontSize:11.5, color:'#52546a', textAlign:'center', transition:'all .12s' }}>
            Select workspace folder
          </button>
        </div>
      )}

      <div style={{ padding:'0 6px', maxHeight:260, overflowY:'auto' }}>
        {tree?.children ? (
          tree.children.map((node) => (
            <TreeNode
              key={node.path}
              node={node}
              depth={0}
              expandedPaths={expandedPaths}
              recentlyModified={recentlyModified}
              onOpen={handleOpenFile}
            />
          ))
        ) : (
          <div style={{ padding:'6px 12px', fontSize:11.5, color:'#52546a' }}>Select a folder to load files.</div>
        )}
      </div>
    </div>
  );
}

function TreeNode({ node, depth, expandedPaths, recentlyModified, onOpen }) {
  const isDir = node.type === 'directory';
  const isExpanded = expandedPaths.has(node.path);
  const isModified = !isDir && recentlyModified?.has(node.path);

  return (
    <div>
      <button
        onClick={() => onOpen(node)}
        className="file-tree-row"
        style={{
          paddingLeft: depth * 12 + 8,
          ...(isModified ? {
            background: 'rgba(124,109,240,0.13)',
            borderLeft: '2px solid rgba(124,109,240,0.7)',
            animation: 'file-highlight-fade 4s ease-out forwards',
          } : {}),
        }}
      >
        {isDir
          ? isExpanded ? <ChevronDown size={11} style={{ flexShrink:0, color:'#52546a' }} /> : <ChevronRight size={11} style={{ flexShrink:0, color:'#52546a' }} />
          : <span style={{ width:11, flexShrink:0 }} />
        }
        {isDir
          ? <Folder size={13} style={{ flexShrink:0, color:'#7c6df0' }} />
          : <File size={13} style={{ flexShrink:0, color: isModified ? '#a78bfa' : '#52546a' }} />
        }
        <span style={{
          overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap',
          color: isModified ? '#c4b5fd' : undefined,
          fontWeight: isModified ? 600 : undefined,
        }}>
          {node.name}
        </span>
        {isModified && (
          <span style={{
            marginLeft: 'auto',
            fontSize: 9,
            fontWeight: 700,
            color: '#7c6df0',
            background: 'rgba(124,109,240,0.18)',
            borderRadius: 3,
            padding: '1px 4px',
            flexShrink: 0,
          }}>
            edited
          </span>
        )}
      </button>
      {isDir && isExpanded && node.children?.map((child) => (
        <TreeNode
          key={child.path}
          node={child}
          depth={depth + 1}
          expandedPaths={expandedPaths}
          recentlyModified={recentlyModified}
          onOpen={onOpen}
        />
      ))}
    </div>
  );
}

/* helpers */
function detectLang(filename) {
  const ext = filename.split('.').pop()?.toLowerCase();
  const map = { js:'javascript', jsx:'javascript', ts:'typescript', tsx:'typescript', py:'python', rs:'rust', go:'go', java:'java', c:'c', cpp:'cpp', html:'html', css:'css', json:'json', md:'markdown', yaml:'yaml', yml:'yaml', sh:'shell', sql:'sql' };
  return map[ext] || 'plaintext';
}
function joinPath(root, child) {
  const slash = root.includes('\\') ? '\\' : '/';
  return `${root.replace(/[\\/]+$/, '')}${slash}${child.replace(/^[\\/]+/, '')}`;
}
