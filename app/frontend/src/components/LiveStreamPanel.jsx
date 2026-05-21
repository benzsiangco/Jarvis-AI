/**
 * LiveStreamPanel — real-time token stream viewer
 *
 * Shows every token as it arrives from llama.cpp + all reasoning events
 * in a floating, draggable panel. Toggle via the toolbar button.
 */
import { useEffect, useRef, useState, useCallback } from 'react';
import {
  Cpu, X, Minimize2, Maximize2, Activity,
  ChevronRight, Trash2, WifiOff, Zap,
} from 'lucide-react';
import useChatStore from '../stores/chatStore';
import useThinkingStore from '../stores/thinkingStore';
import useModelStore from '../stores/modelStore';

/* ── Token rate tracker ───────────────────────────────────────────────────── */
function useTokenRate(isStreaming) {
  const [rate, setRate] = useState(0);
  const countRef  = useRef(0);
  const timerRef  = useRef(null);

  useEffect(() => {
    if (!isStreaming) { setRate(0); countRef.current = 0; return; }
    timerRef.current = setInterval(() => {
      setRate(countRef.current);
      countRef.current = 0;
    }, 1000);
    return () => clearInterval(timerRef.current);
  }, [isStreaming]);

  const tick = useCallback(() => { countRef.current++; }, []);
  return { rate, tick };
}

/* ── Main component ──────────────────────────────────────────────────────── */
export default function LiveStreamPanel({ open, onClose }) {
  const messages    = useChatStore((s) => s.messages);
  const isStreaming = useChatStore((s) => s.isStreaming);
  const events      = useThinkingStore((s) => s.events);
  const serverStatus = useModelStore((s) => s.serverStatus);
  const activeModel  = useModelStore((s) => s.activeModel);

  const [tab,       setTab]     = useState('stream');   // 'stream' | 'events'
  const [minimized, setMinimized] = useState(false);
  const [tokenCount, setTokenCount] = useState(0);
  const [totalChars, setTotalChars] = useState(0);

  const streamRef = useRef(null);
  const eventsRef = useRef(null);
  const prevContentRef = useRef('');
  const { rate, tick } = useTokenRate(isStreaming);

  /* Get the live assistant message content */
  const lastAssistant = [...messages].reverse().find((m) => m.role === 'assistant');
  const liveContent   = lastAssistant?.content || '';

  /* Count new tokens whenever content grows */
  useEffect(() => {
    const prev = prevContentRef.current;
    if (liveContent.length > prev.length) {
      const newChars = liveContent.length - prev.length;
      // rough token count: ~4 chars per token
      const newTokens = Math.ceil(newChars / 4);
      for (let i = 0; i < newTokens; i++) tick();
      setTokenCount((c) => c + newTokens);
      setTotalChars(liveContent.length);
    }
    prevContentRef.current = liveContent;
  }, [liveContent, tick]);

  /* Reset counters on new stream */
  useEffect(() => {
    if (isStreaming) { setTokenCount(0); setTotalChars(0); }
  }, [isStreaming]);

  /* Auto-scroll stream tab */
  useEffect(() => {
    if (tab === 'stream' && streamRef.current) {
      streamRef.current.scrollTop = streamRef.current.scrollHeight;
    }
  }, [liveContent, tab]);

  /* Auto-scroll events tab */
  useEffect(() => {
    if (tab === 'events' && eventsRef.current) {
      eventsRef.current.scrollTop = eventsRef.current.scrollHeight;
    }
  }, [events.length, tab]);

  if (!open) return null;

  const visibleEvents = events.filter((e) => e.type !== '_round').slice(-60);
  const modelLabel = activeModel
    ? activeModel.replace('.gguf', '').split(/[/\\]/).pop()
    : 'No model';

  return (
    <div style={{
      position: 'fixed', bottom: 80, right: 20, zIndex: 8888,
      width: minimized ? 260 : 460,
      maxHeight: minimized ? 'auto' : '60vh',
      display: 'flex', flexDirection: 'column',
      borderRadius: 14,
      background: 'rgba(10,10,16,0.97)',
      border: '1px solid rgba(255,255,255,0.08)',
      boxShadow: '0 24px 60px rgba(0,0,0,0.6), 0 0 0 1px rgba(124,109,240,0.06)',
      backdropFilter: 'blur(12px)',
      overflow: 'hidden',
      fontFamily: 'var(--font-mono, monospace)',
    }}>
      {/* ── Header ── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '9px 12px',
        background: 'rgba(255,255,255,0.03)',
        borderBottom: minimized ? 'none' : '1px solid rgba(255,255,255,0.05)',
        flexShrink: 0,
      }}>
        {/* Status dot */}
        <span style={{
          width: 7, height: 7, borderRadius: '50%', flexShrink: 0,
          background: isStreaming ? '#7c6df0' : (serverStatus === 'ready' ? '#4ade80' : '#52546a'),
          animation: isStreaming ? 'ls-pulse 1s ease-in-out infinite' : 'none',
        }} />

        {/* Title + model */}
        <span style={{ fontSize: 11, fontWeight: 700, color: '#e2e4ea', flex: 1 }}>
          Live Stream
        </span>
        <span style={{ fontSize: 10, color: '#52546a', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {modelLabel}
        </span>

        {/* Stats */}
        {isStreaming && !minimized && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 10, color: '#7c6df0' }}>
            <Activity size={10} />
            <span>{rate} tok/s</span>
          </div>
        )}

        {/* Controls */}
        <div style={{ display: 'flex', gap: 3 }}>
          <HeaderBtn icon={minimized ? Maximize2 : Minimize2} onClick={() => setMinimized((v) => !v)} title={minimized ? 'Expand' : 'Minimize'} />
          <HeaderBtn icon={X} onClick={onClose} title="Close" danger />
        </div>
      </div>

      {!minimized && (
        <>
          {/* ── Tabs ── */}
          <div style={{
            display: 'flex', gap: 2, padding: '6px 10px',
            borderBottom: '1px solid rgba(255,255,255,0.05)',
            flexShrink: 0,
          }}>
            {[
              { id: 'stream', label: 'Token stream' },
              { id: 'events', label: `Events (${visibleEvents.length})` },
            ].map(({ id, label }) => (
              <button key={id} onClick={() => setTab(id)} style={{
                padding: '3px 10px', borderRadius: 6, fontSize: 10, fontWeight: 600,
                background: tab === id ? 'rgba(124,109,240,0.18)' : 'transparent',
                color: tab === id ? '#c4b5fd' : '#52546a',
                border: tab === id ? '1px solid rgba(124,109,240,0.2)' : '1px solid transparent',
                transition: 'all .12s',
              }}>
                {label}
              </button>
            ))}
            <div style={{ flex: 1 }} />
            {/* Stats bar */}
            {(tokenCount > 0 || totalChars > 0) && (
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 10, color: '#52546a' }}>
                <span style={{ color: '#7c6df0' }}>~{tokenCount} tok</span>
                <span>{totalChars} chars</span>
              </div>
            )}
          </div>

          {/* ── Body ── */}
          <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>

            {/* Token stream tab */}
            {tab === 'stream' && (
              <div ref={streamRef} style={{
                height: '100%', overflowY: 'auto', padding: '12px 14px',
                scrollbarWidth: 'thin', scrollbarColor: 'rgba(255,255,255,0.06) transparent',
              }}>
                {!liveContent && !isStreaming ? (
                  <EmptyHint
                    icon={serverStatus === 'ready' ? Cpu : WifiOff}
                    text={serverStatus === 'ready' ? 'Send a message to see the live token stream.' : 'Load a model to begin.'}
                  />
                ) : (
                  <LiveText text={liveContent} streaming={isStreaming} />
                )}
              </div>
            )}

            {/* Events tab */}
            {tab === 'events' && (
              <div ref={eventsRef} style={{
                height: '100%', overflowY: 'auto', padding: '8px 10px',
                scrollbarWidth: 'thin', scrollbarColor: 'rgba(255,255,255,0.06) transparent',
              }}>
                {visibleEvents.length === 0 ? (
                  <EmptyHint icon={Zap} text="Reasoning events will appear here during generation." />
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    {visibleEvents.map((ev) => (
                      <EventLine key={ev.id} ev={ev} />
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ── Footer bar ── */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '6px 12px',
            borderTop: '1px solid rgba(255,255,255,0.04)',
            fontSize: 10, color: '#52546a', flexShrink: 0,
          }}>
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              padding: '2px 7px', borderRadius: 4,
              background: isStreaming ? 'rgba(124,109,240,0.12)' : 'rgba(255,255,255,0.04)',
              color: isStreaming ? '#7c6df0' : '#52546a',
              border: isStreaming ? '1px solid rgba(124,109,240,0.2)' : '1px solid transparent',
              fontWeight: 600,
            }}>
              {isStreaming ? '⬤ streaming' : serverStatus === 'ready' ? '● ready' : '○ idle'}
            </span>
            <span style={{ flex: 1 }} />
            {isStreaming && <span style={{ color: '#7c6df0' }}>{rate} tok/s</span>}
            <span>{serverStatus}</span>
          </div>
        </>
      )}

      <style>{`
        @keyframes ls-pulse { 0%,100%{opacity:1} 50%{opacity:.4} }
        @keyframes ls-blink  { 0%,100%{opacity:1} 50%{opacity:0} }
      `}</style>
    </div>
  );
}

/* ── Live token text ─────────────────────────────────────────────────────── */
function LiveText({ text, streaming }) {
  /* Split into words/chunks so each arriving token animates in */
  const words = text.split(/(\s+)/);

  return (
    <p style={{
      margin: 0, fontSize: 11.5, lineHeight: 1.75,
      color: '#c8cad4', whiteSpace: 'pre-wrap', wordBreak: 'break-word',
      letterSpacing: 0,
    }}>
      {words.map((word, i) => (
        <span key={i} style={{ opacity: 1 }}>{word}</span>
      ))}
      {streaming && (
        <span style={{
          display: 'inline-block', width: 2, height: '1em',
          background: '#7c6df0', marginLeft: 2, verticalAlign: 'text-bottom',
          animation: 'ls-blink 0.8s step-end infinite',
          borderRadius: 1,
        }} />
      )}
    </p>
  );
}

/* ── Single event line ───────────────────────────────────────────────────── */
const EVENT_COLORS = {
  analyzing:         '#60a5fa',
  inspecting:        '#38bdf8',
  reading_file:      '#38bdf8',
  writing_file:      '#34d399',
  searching:         '#a78bfa',
  planning:          '#fbbf24',
  planning_patch:    '#fbbf24',
  editing:           '#34d399',
  diff_generation:   '#34d399',
  validating:        '#2dd4bf',
  running_command:   '#f97316',
  tool_execution:    '#f97316',
  model_generation:  '#818cf8',
  awaiting_approval: '#fbbf24',
  done:              '#4ade80',
};

function EventLine({ ev }) {
  const color = EVENT_COLORS[ev.type] || '#52546a';
  const elapsed = Math.max(0, Math.floor((Date.now() - ev.ts) / 1000));
  const elLabel = elapsed < 1 ? 'now' : `${elapsed}s ago`;

  return (
    <div style={{
      display: 'flex', alignItems: 'baseline', gap: 8,
      padding: '3px 4px', borderRadius: 5,
      fontSize: 10.5,
    }}>
      <ChevronRight size={9} style={{ color, flexShrink: 0, marginTop: 2 }} />
      <span style={{
        fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em',
        color, flexShrink: 0, minWidth: 72,
      }}>
        {ev.type.replace(/_/g, ' ')}
      </span>
      <span style={{ flex: 1, color: '#9898a6', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {ev.message}
      </span>
      <span style={{ fontSize: 9, color: '#3a3c4e', flexShrink: 0 }}>{elLabel}</span>
    </div>
  );
}

/* ── Empty hint ──────────────────────────────────────────────────────────── */
function EmptyHint({ icon: Icon, text }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      height: '100%', gap: 10, padding: '24px 0',
      opacity: 0.5,
    }}>
      <Icon size={20} style={{ color: '#52546a' }} />
      <span style={{ fontSize: 11, color: '#52546a', textAlign: 'center', maxWidth: 200 }}>{text}</span>
    </div>
  );
}

/* ── Small header button ─────────────────────────────────────────────────── */
function HeaderBtn({ icon: Icon, onClick, title, danger = false }) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      onClick={onClick}
      title={title}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        width: 22, height: 22, borderRadius: 5, border: 'none',
        background: hovered ? (danger ? 'rgba(248,113,113,0.18)' : 'rgba(255,255,255,0.08)') : 'transparent',
        color: hovered ? (danger ? '#f87171' : '#e2e4ea') : '#52546a',
        transition: 'all .12s',
      }}
    >
      <Icon size={11} />
    </button>
  );
}
