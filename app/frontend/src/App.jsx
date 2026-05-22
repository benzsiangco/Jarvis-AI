import { useState, useEffect, useRef } from 'react';
import TitleBar from './components/TitleBar';
import Sidebar from './components/Sidebar';
import EditorPanel from './components/EditorPanel';
import ChatPanel from './components/ChatPanel';
import TerminalPanel from './components/TerminalPanel';
import StatusBar from './components/StatusBar';
import DiffViewer from './components/DiffViewer';
import ThinkingPanel from './components/ThinkingPanel';
import Composer from './components/Composer';
import WelcomeScreen from './components/WelcomeScreen';
import VoiceMode from './components/VoiceMode';
import ModeSwitcher from './components/ModeSwitcher';
import SubAgentsPanel from './components/SubAgentsPanel';
import useLayoutStore from './stores/layoutStore';
import useModelStore from './stores/modelStore';
import useChatStore from './stores/chatStore';
import useFileStore from './stores/fileStore';
import useEditorStore from './stores/editorStore';
import useWorkspaceStore from './stores/workspaceStore';
import useSessionStore from './stores/sessionStore';
import useDiffStore from './stores/diffStore';
import useSkillsStore from './stores/skillsStore';
import useModeStore from './stores/modeStore';
import UpdateBanner from './components/UpdateBanner';

const BACKEND_URL = 'http://localhost:6767';

export default function App() {
  const [backendUrl, setBackendUrl] = useState(BACKEND_URL);
  const [connected, setConnected] = useState(false);
  const [showWelcome, setShowWelcome] = useState(
    () => !localStorage.getItem('jarvis_welcome_seen')
  );

  const {
    sidebarWidth, rightPanelWidth, showSidebar, showRightPanel,
    setSidebarWidth, setRightPanelWidth, rightPanelTab, setRightPanelTab,
  } = useLayoutStore();

  const checkHealth = useModelStore((s) => s.checkHealth);
  const fetchModels = useModelStore((s) => s.fetchModels);
  const hydrateWorkspaces = useWorkspaceStore((s) => s.hydrate);
  const hydrateSessions = useSessionStore((s) => s.hydrate);
  const loadSession = useChatStore((s) => s.loadSession);
  const hydrateFiles = useFileStore((s) => s.hydrateFromWorkspace);
  const customTools = useSkillsStore((s) => s.tools);
  const diffs = useDiffStore((s) => s.diffs);
  const reviewOpen = useDiffStore((s) => s.reviewOpen);

  const diffCount = Object.keys(diffs).length;
  const isStreaming = useChatStore((s) => s.isStreaming);

  const currentMode = useModeStore((s) => s.currentMode);
  const inVoiceMode = currentMode === 'voice';

  const dismissWelcome = () => {
    setShowWelcome(false);
    localStorage.setItem('jarvis_welcome_seen', '1');
  };

  // Sync custom tools to backend
  useEffect(() => {
    if (!connected) return;
    fetch(`${backendUrl}/api/skills/tools`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tools: customTools.filter((t) => t.enabled !== false) }),
    }).catch(() => {});
  }, [connected, backendUrl, customTools]);

  // When we first connect, reset server status so health check takes over
  const prevConnected = useRef(false);
  useEffect(() => {
    if (connected && !prevConnected.current) {
      useModelStore.getState().setServerStatus('offline');
    }
    prevConnected.current = connected;
  }, [connected]);

  // Auto-connect with retry — runs every 3s regardless of current state
  // so a backend restart is detected and reconnected automatically.
  const connectedRef = useRef(connected);
  useEffect(() => { connectedRef.current = connected; }, [connected]);

  useEffect(() => {
    let cancelled = false;
    const tryConnect = async () => {
      try {
        const res = await fetch(`${BACKEND_URL}/api/health`, { signal: AbortSignal.timeout(3000) });
        if (cancelled) return;
        if (res.ok) {
          setBackendUrl(BACKEND_URL);
          setConnected(true);
          useModelStore.setState({ backendConnected: true });
        } else {
          setConnected(false);
          useModelStore.setState({ backendConnected: false });
        }
      } catch {
        if (cancelled) return;
        setConnected(false);
        useModelStore.setState({ backendConnected: false });
      }
    };
    tryConnect();
    const interval = setInterval(tryConnect, 3000);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  // Boot once connected
  useEffect(() => {
    if (!connected) return;
    async function boot() {
      const data = await hydrateWorkspaces(backendUrl);

      // ── First-install: no workspace exists yet ──────────────────────────
      // Auto-create a default "Home" workspace so sessions work immediately
      // without requiring the user to open a folder first.
      let activeData = data;
      if (!data?.activeWorkspaceId && (!data?.workspaces || data.workspaces.length === 0)) {
        try {
          const res = await fetch(`${backendUrl}/api/state/workspaces`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path: '__default__', name: 'Home' }),
          });
          if (res.ok) {
            const created = await res.json();
            const wsId = created.workspace?.id || created.id;
            const sessId = created.session?.id || null;
            useWorkspaceStore.setState({
              workspaces: [created.workspace || created],
              activeWorkspaceId: wsId,
            });
            await hydrateSessions(backendUrl, wsId, sessId);
            if (sessId) await loadSession(backendUrl, sessId);
            checkHealth(backendUrl);
            fetchModels(backendUrl);
            useModelStore.getState().fetchAppliedSettings(backendUrl).catch(() => {});
            const fetchStats = () => useModelStore.getState().fetchLlamaStats(backendUrl);
            const interval = setInterval(() => { checkHealth(backendUrl); fetchStats(); }, 5000);
            return () => clearInterval(interval);
          }
        } catch {}
      }
      // ── Normal boot ─────────────────────────────────────────────────────

      const workspace = activeData?.workspace;
      if (workspace?.path) {
        hydrateFiles(backendUrl, workspace);
        useFileStore.getState().fetchTree(backendUrl, workspace.path).catch(() => {});
      }
      if (activeData?.activeWorkspaceId) {
        await hydrateSessions(backendUrl, activeData.activeWorkspaceId, activeData.activeSessionId);
      }
      const activeSessionId = activeData?.activeSessionId
        || useSessionStore.getState().activeSessionId;
      if (activeSessionId) {
        await loadSession(backendUrl, activeSessionId);
      }
    }
    boot();
    checkHealth(backendUrl);
    fetchModels(backendUrl);
    // Fetch applied settings so status bar shows correct ctx size on startup
    useModelStore.getState().fetchAppliedSettings(backendUrl).catch(() => {});
    const fetchStats = () => useModelStore.getState().fetchLlamaStats(backendUrl);
    const interval = setInterval(() => { checkHealth(backendUrl); fetchStats(); }, 5000);
    return () => clearInterval(interval);
  }, [connected, backendUrl, checkHealth, fetchModels, hydrateWorkspaces, hydrateSessions, loadSession, hydrateFiles]);

  return (
    <div className="app-root">
      {showWelcome && <WelcomeScreen onDismiss={dismissWelcome} />}
      <TitleBar backendUrl={backendUrl} />

      <div className="app-main">
        {/* Left Sidebar */}
        {showSidebar && (
          <>
            <aside style={{ width: sidebarWidth, minWidth: 220 }} className="app-sidebar flex-shrink-0 h-full">
              <Sidebar backendUrl={backendUrl} />
            </aside>
            <ResizeHandle
              direction="horizontal"
              className="app-sidebar-handle"
              onResize={(delta) => setSidebarWidth((w) => Math.max(180, w + delta))}
            />
          </>
        )}

        {/* Center: Chat (primary) + Composer */}
        <main className="app-center">
          {/* Floating mode switcher — Chat / Voice / Agent */}
          <div className="app-mode-switcher-host">
            <ModeSwitcher variant="floating" />
          </div>

          <div className="app-chat-area">
            <ChatPanel backendUrl={backendUrl} />
          </div>
          <div className="app-composer-area">
            <ThinkingPanel />
            <Composer backendUrl={backendUrl} />
          </div>
        </main>

        {/* Right Panel: Workspace | Terminal | Changes */}
        {showRightPanel && (
          <>
            <ResizeHandle
              direction="horizontal"
              className="app-right-handle"
              onResize={(delta) => setRightPanelWidth((w) => Math.max(300, w - delta))}
            />
            <aside style={{ width: rightPanelWidth, minWidth: 300 }} className="app-right-panel flex-shrink-0 h-full">
              <RightPanel
                backendUrl={backendUrl}
                tab={rightPanelTab}
                onTabChange={setRightPanelTab}
                diffCount={diffCount}
                reviewOpen={reviewOpen}
              />
            </aside>
          </>
        )}
      </div>

      <StatusBar backendUrl={backendUrl} />
      <UpdateBanner />

      {/* Voice Mode — fullscreen immersive overlay. Mounted only when active
          so the underlying chat workspace state is preserved exactly. */}
      {inVoiceMode && <VoiceMode backendUrl={backendUrl} />}
    </div>
  );
}

/* ── Right Panel ── */
function RightPanel({ backendUrl, tab, onTabChange, diffCount }) {
  const reviewOpen = useDiffStore((s) => s.reviewOpen);

  const tabs = [
    { id: 'terminal',   label: 'Terminal' },
    { id: 'editor',     label: 'Editor' },
    { id: 'subagents',  label: 'Agents' },
    { id: 'diff',       label: `Changes${diffCount > 0 ? ` (${diffCount})` : ''}`, disabled: diffCount === 0 && !reviewOpen },
    { id: 'problems',   label: 'Problems' },
  ];

  return (
    <div className="rp-root">
      <div className="rp-tabs">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => onTabChange(t.id)}
            disabled={t.disabled}
            className={`rp-tab ${tab === t.id ? 'rp-tab-active' : ''} ${t.disabled ? 'rp-tab-disabled' : ''}`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="rp-content">
        {tab === 'terminal'  && <TerminalPanel backendUrl={backendUrl} />}
        {tab === 'editor'    && <EditorPanel  backendUrl={backendUrl} />}
        {tab === 'subagents' && <SubAgentsPanel />}
        {tab === 'diff'      && <DiffViewer />}
        {tab === 'problems'  && <ProblemsPanel />}
      </div>
    </div>
  );
}

/* ── Problems Panel ── */
function ProblemsPanel() {
  return (
    <div className="rp-empty-state">
      <span className="rp-empty-icon">✓</span>
      <span className="rp-empty-text">No problems detected</span>
    </div>
  );
}

/* ── Resize Handle ── */
function ResizeHandle({ direction, onResize, className = '' }) {
  const [isDragging, setDragging] = useState(false);
  const onResizeRef = useRef(onResize);
  const lastPositionRef = useRef(0);

  useEffect(() => {
    onResizeRef.current = onResize;
  }, [onResize]);

  useEffect(() => {
    if (!isDragging) return;

    const handleMove = (e) => {
      const position = direction === 'horizontal' ? e.clientX : e.clientY;
      const delta = position - lastPositionRef.current;
      lastPositionRef.current = position;
      onResizeRef.current(delta);
    };
    const handleUp = () => setDragging(false);

    document.addEventListener('mousemove', handleMove);
    document.addEventListener('mouseup', handleUp);
    document.body.style.cursor = direction === 'horizontal' ? 'col-resize' : 'row-resize';
    document.body.style.userSelect = 'none';

    return () => {
      document.removeEventListener('mousemove', handleMove);
      document.removeEventListener('mouseup', handleUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [direction, isDragging]);

  const isH = direction === 'horizontal';
  return (
    <div
      onMouseDown={(e) => {
        lastPositionRef.current = direction === 'horizontal' ? e.clientX : e.clientY;
        setDragging(true);
      }}
      style={{
        flexShrink: 0,
        background: isDragging ? 'rgba(124,109,240,0.5)' : 'transparent',
        transition: 'background .1s',
        cursor: isH ? 'col-resize' : 'row-resize',
        width: isH ? 4 : undefined,
        height: isH ? undefined : 4,
      }}
      className={className}
      onMouseEnter={e => { if (!isDragging) e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; }}
      onMouseLeave={e => { if (!isDragging) e.currentTarget.style.background = 'transparent'; }}
    />
  );
}
