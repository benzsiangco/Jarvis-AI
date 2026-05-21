import { useState, useEffect, useRef } from 'react';
import {
  ChevronDown, ChevronRight,
  ScanSearch, FileText, Search, Wand2, Terminal,
  ShieldAlert, CheckCircle2, Cpu, GitBranch, Zap,
  FileDiff, Eye, Loader2, Bot, Network,
} from 'lucide-react';
import useThinkingStore from '../stores/thinkingStore';
import useChatStore from '../stores/chatStore';
import useSubAgentStore from '../stores/subAgentStore';
import MarkdownRenderer from './MarkdownRenderer';

/* ── Icon registry ──────────────────────────────────────────────────────────── */
const ICONS = {
  analyzing:         ScanSearch,
  inspecting:        Eye,
  reading_file:      FileText,
  writing_file:      FileDiff,
  searching:         Search,
  planning:          GitBranch,
  planning_patch:    GitBranch,
  editing:           Wand2,
  diff_generation:   FileDiff,
  validating:        Zap,
  running_command:   Terminal,
  tool_execution:    Terminal,
  model_generation:  Cpu,
  awaiting_approval: ShieldAlert,
  thoughts:          Cpu,
  done:              CheckCircle2,
};

/* ── Status label + dot color ───────────────────────────────────────────────── */
const STATUS_CFG = {
  idle:       { label: 'done',      color: 'text-[var(--color-text-muted)]' },
  analyzing:  { label: 'analyzing', color: 'text-blue-400' },
  inspecting: { label: 'reading',   color: 'text-sky-400' },
  searching:  { label: 'searching', color: 'text-violet-400' },
  planning:   { label: 'planning',  color: 'text-amber-400' },
  editing:    { label: 'editing',   color: 'text-emerald-400' },
  validating: { label: 'checking',  color: 'text-teal-400' },
  running:    { label: 'running',   color: 'text-orange-400' },
  thinking:   { label: 'thinking',  color: 'text-blue-400' },
  approval:   { label: 'approval',  color: 'text-amber-400' },
};

/* ── Icon color per event type ──────────────────────────────────────────────── */
const ICON_COLOR = {
  analyzing:         'text-blue-400/70',
  inspecting:        'text-sky-400/70',
  reading_file:      'text-sky-400/70',
  writing_file:      'text-emerald-400/70',
  searching:         'text-violet-400/70',
  planning:          'text-amber-400/70',
  planning_patch:    'text-amber-400/70',
  editing:           'text-emerald-400/70',
  diff_generation:   'text-emerald-400/70',
  validating:        'text-teal-400/70',
  running_command:   'text-orange-400/70',
  tool_execution:    'text-orange-400/70',
  model_generation:  'text-blue-400/70',
  awaiting_approval: 'text-amber-400',
  done:              'text-emerald-500/80',
};

/* ── Component ──────────────────────────────────────────────────────────────── */
export default function ThinkingPanel({ compact = false }) {
  const events   = useThinkingStore((s) => s.events);
  const status   = useThinkingStore((s) => s.status);
  const isOpen   = useThinkingStore((s) => s.isOpen);
  const setOpen  = useThinkingStore((s) => s.setOpen);
  const isStreaming = useChatStore((s) => s.isStreaming);
  const agents   = useSubAgentStore((s) => s.agents);
  const bottomRef = useRef(null);

  const activeAgents = agents.filter((a) => a.status === 'running');

  // isActive = AI is currently running AND not idle
  const isActive = isStreaming && status !== 'idle';

  // Auto-collapse 1.4 s after stream finishes
  useEffect(() => {
    if (!isStreaming && events.length > 0) {
      const t = setTimeout(() => setOpen(false), 1400);
      return () => clearTimeout(t);
    }
  }, [isStreaming, events.length, setOpen]);

  // Re-open panel when a new stream begins
  useEffect(() => {
    if (isStreaming) setOpen(true);
  }, [isStreaming, setOpen]);

  // Auto-scroll to latest event while panel is open
  useEffect(() => {
    if (isOpen) bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [events.length, isOpen]);

  if (!events.length && !activeAgents.length) return null;

  // Show max 30 events; skip internal round-bump events from display
  const visibleEvents = events
    .filter((e) => e.type !== '_round')
    .slice(-30);

  const cfg = STATUS_CFG[status] ?? STATUS_CFG.idle;

  // Collapsed preview: last meaningful (non-done) message
  const previewEvent = [...visibleEvents].reverse().find((e) => e.type !== 'done');

  return (
    <div className={`tp-root ${compact ? 'tp-compact' : ''}`}>
      {/* ── Header toggle ── */}
      <button className="tp-header" onClick={() => setOpen(!isOpen)}>
        <span className="tp-chevron">
          {isOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        </span>
        <span className="tp-label">Reasoning</span>

        {/* Live status pill */}
        <span className={`tp-pill ${isActive ? 'tp-pill-active' : 'tp-pill-idle'}`}>
          {isActive && <span className="tp-live-dot" />}
          <span className={cfg.color}>{cfg.label}</span>
        </span>

        {/* Active subagent count badge */}
        {activeAgents.length > 0 && (
          <span className="tp-agent-badge">
            <Network size={9} />
            {activeAgents.length} agent{activeAgents.length !== 1 ? 's' : ''}
          </span>
        )}

        {/* Collapsed preview */}
        {!isOpen && previewEvent && (
          <span className="tp-collapsed-preview">{previewEvent.message}</span>
        )}
      </button>

      {/* ── Active subagent rows — always visible when agents running ── */}
      {activeAgents.length > 0 && (
        <div className="tp-agents-strip">
          {activeAgents.map((agent) => (
            <SubAgentRow key={agent.id} agent={agent} />
          ))}
        </div>
      )}

      {/* ── Event feed ── */}
      {isOpen && (
        <div className="tp-feed">
          {visibleEvents.map((ev, i) => {
            const isLast  = i === visibleEvents.length - 1;
            const Icon    = ICONS[ev.type] ?? ScanSearch;
            const iconCls = ICON_COLOR[ev.type] ?? 'text-[var(--color-text-muted)]';
            const isLive  = isLast && isActive;
            const isDone  = ev.type === 'done';

            return (
              <EventRow
                key={ev.id}
                ev={ev}
                i={i}
                total={visibleEvents.length}
                Icon={Icon}
                iconCls={iconCls}
                isLive={isLive}
                isDone={isDone}
              />
            );
          })}
          <div ref={bottomRef} />
        </div>
      )}
    </div>
  );
}

/* ── Inline subagent row ─────────────────────────────────────────────────────── */
function SubAgentRow({ agent }) {
  const lastStep = agent.steps[agent.steps.length - 1];
  const action = lastStep
    ? `${lastStep.tool} → ${Object.values(lastStep.args || {}).join(', ').slice(0, 40)}`
    : 'initializing…';

  return (
    <div className="tp-agent-row">
      <Loader2 size={9} className="animate-spin tp-agent-icon" />
      <span className="tp-agent-name">
        {agentLabel(agent.task)}
      </span>
      <span className="tp-agent-sep">→</span>
      <span className="tp-agent-action">{action}</span>
      <StageElapsed ts={agent.startedAt} live />
    </div>
  );
}

function agentLabel(task) {
  const t = (task || '').toLowerCase();
  if (/plan|analyz|architect/.test(t)) return 'Planner Agent';
  if (/search|find|look/.test(t)) return 'Search Agent';
  if (/refactor|clean|improve/.test(t)) return 'Refactor Agent';
  if (/review|check|audit/.test(t)) return 'Review Agent';
  if (/code|implement|write/.test(t)) return 'Code Agent';
  if (/tool|run|exec/.test(t)) return 'Tool Agent';
  return 'Sub-Agent';
}

/* ── Single event row ───────────────────────────────────────────────────────── */
function EventRow({ ev, i, total, Icon, iconCls, isLive, isDone }) {
  const [thoughtsOpen, setThoughtsOpen] = useState(true);
  const hasThoughts = Boolean(ev.reasoning);

  return (
    <div className={`tp-row tp-row-enter ${isLive ? 'tp-row-live' : ''} ${isDone ? 'tp-row-done' : ''}`}>
      {/* Left: connector line + icon */}
      <div className="tp-track">
        {i < total - 1 && <span className="tp-line" />}
        <span className={`tp-icon ${iconCls}`}>
          {/* Spinner on active row — real visual indicator AI is working */}
          {isLive
            ? <Loader2 size={11} className="animate-spin" />
            : <Icon size={11} />
          }
        </span>
      </div>

      {/* Right: message + elapsed + optional thoughts */}
      <div className="tp-content">
        <div className="tp-msg-row">
          <span className="tp-msg">{ev.message}</span>
          <StageElapsed ts={ev.ts} live={isLive} />
          {hasThoughts && (
            <button
              className="tp-thoughts-toggle"
              onClick={() => setThoughtsOpen((v) => !v)}
              title={thoughtsOpen ? 'Collapse thoughts' : 'Expand thoughts'}
            >
              {thoughtsOpen ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
            </button>
          )}
        </div>

        {/* Collapsible thoughts — only rendered when ev.reasoning exists */}
        {hasThoughts && thoughtsOpen && (
          <ThoughtsBlock text={ev.reasoning} live={isLive} />
        )}
      </div>
    </div>
  );
}

/* ── Thoughts block — rendered as markdown ──────────────────────────────────── */
function ThoughtsBlock({ text, live }) {
  const ref = useRef(null);

  useEffect(() => {
    if (live && ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [text, live]);

  return (
    <div ref={ref} className={`tp-thoughts ${live ? 'tp-thoughts-live' : ''}`}>
      <MarkdownRenderer content={text} compact />
      {live && text && <span className="tp-thoughts-cursor" />}
    </div>
  );
}

/* ── Per-stage elapsed timer ────────────────────────────────────────────────── */
function StageElapsed({ ts, live }) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!live) {
      setElapsed(Math.floor((Date.now() - ts) / 1000));
      return;
    }
    setElapsed(Math.floor((Date.now() - ts) / 1000));
    const id = setInterval(() => {
      setElapsed(Math.floor((Date.now() - ts) / 1000));
    }, 1000);
    return () => clearInterval(id);
  }, [live, ts]);

  const label = elapsed < 1 ? '<1s' : `${elapsed}s`;
  return <time className="tp-time">{label}</time>;
}
