/**
 * SubAgentsPanel — live view of all spawned sub-agents.
 *
 * Shows each sub-agent as an expandable card with:
 *   - Task description
 *   - Live status (running / done / error)
 *   - Step-by-step tool call log
 *   - Final answer
 *
 * Mirrors the Claude / Codex sub-agent panel experience.
 */
import { useState } from 'react';
import {
  Bot, ChevronDown, ChevronRight, CheckCircle2, AlertCircle,
  Loader2, Terminal, FileText, Search, Globe, Trash2, Zap,
} from 'lucide-react';
import useSubAgentStore from '../stores/subAgentStore';

const TOOL_ICON = {
  runTerminal:    Terminal,
  readFile:       FileText,
  writeFile:      FileText,
  patchFile:      FileText,
  searchCode:     Search,
  listFiles:      Search,
  searchInternet: Globe,
};

export default function SubAgentsPanel() {
  const agents = useSubAgentStore((s) => s.agents);
  const clear  = useSubAgentStore((s) => s.clear);

  if (!agents.length) {
    return (
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        justifyContent: 'center', height: '100%', gap: 10,
        color: '#52546a', padding: 24,
      }}>
        <Bot size={28} style={{ opacity: 0.3 }} />
        <div style={{ fontSize: 12, fontWeight: 600, color: '#5e6370' }}>No sub-agents yet</div>
        <div style={{ fontSize: 11, color: '#3a3c4e', textAlign: 'center', maxWidth: 240 }}>
          Sub-agents appear here when the AI delegates tasks using the <code style={{ color: '#7c6df0' }}>spawnAgent</code> tool.
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '8px 14px', borderBottom: '1px solid rgba(255,255,255,0.04)',
        background: 'rgba(0,0,0,0.2)', flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <Bot size={13} style={{ color: '#7c6df0' }} />
          <span style={{ fontSize: 11, fontWeight: 700, color: '#c8cad4', letterSpacing: '.04em' }}>
            Sub-Agents
          </span>
          <span style={{
            padding: '1px 6px', borderRadius: 999, fontSize: 9, fontWeight: 700,
            background: 'rgba(124,109,240,0.15)', color: '#a78bfa',
          }}>
            {agents.length}
          </span>
        </div>
        <button
          onClick={clear}
          title="Clear all"
          style={{
            display: 'flex', alignItems: 'center', gap: 4,
            padding: '3px 8px', borderRadius: 5, fontSize: 10,
            background: 'rgba(255,255,255,0.03)', color: '#52546a',
            border: '1px solid rgba(255,255,255,0.05)', cursor: 'pointer',
          }}
          onMouseEnter={e => { e.currentTarget.style.color = '#f87171'; }}
          onMouseLeave={e => { e.currentTarget.style.color = '#52546a'; }}
        >
          <Trash2 size={10} /> Clear
        </button>
      </div>

      {/* Agent list */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {[...agents].reverse().map((agent) => (
          <AgentCard key={agent.id} agent={agent} />
        ))}
      </div>
    </div>
  );
}

function AgentCard({ agent }) {
  const [expanded, setExpanded] = useState(agent.status === 'running');
  const isRunning = agent.status === 'running';
  const isError   = agent.status === 'error';
  const isDone    = agent.status === 'done';

  const elapsed = agent.endedAt
    ? ((agent.endedAt - agent.startedAt) / 1000).toFixed(1) + 's'
    : null;

  const borderColor = isRunning ? 'rgba(124,109,240,0.3)'
    : isError ? 'rgba(248,113,113,0.25)'
    : 'rgba(74,222,128,0.2)';

  const bgColor = isRunning ? 'rgba(124,109,240,0.04)'
    : isError ? 'rgba(248,113,113,0.04)'
    : 'rgba(74,222,128,0.03)';

  return (
    <div style={{
      borderRadius: 10, overflow: 'hidden',
      border: `1px solid ${borderColor}`,
      background: bgColor,
    }}>
      {/* Card header */}
      <button
        type="button"
        onClick={() => setExpanded(v => !v)}
        style={{
          display: 'flex', alignItems: 'flex-start', gap: 8, width: '100%',
          padding: '9px 12px', background: 'transparent', border: 0,
          cursor: 'pointer', textAlign: 'left',
        }}
      >
        {/* Status icon */}
        <span style={{ marginTop: 1, flexShrink: 0 }}>
          {isRunning ? (
            <Loader2 size={13} style={{ color: '#a78bfa', animation: 'spin 1s linear infinite' }} />
          ) : isError ? (
            <AlertCircle size={13} style={{ color: '#f87171' }} />
          ) : (
            <CheckCircle2 size={13} style={{ color: '#4ade80' }} />
          )}
        </span>

        {/* Task */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: 11.5, fontWeight: 600,
            color: isRunning ? '#c4b5fd' : isError ? '#f87171' : '#c8cad4',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {agent.task}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 3 }}>
            <span style={{
              fontSize: 9, fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase',
              color: isRunning ? '#a78bfa' : isError ? '#f87171' : '#4ade80',
            }}>
              {isRunning ? 'Running' : isError ? 'Error' : 'Done'}
            </span>
            <span style={{ fontSize: 9, color: '#52546a', fontFamily: 'var(--font-mono)' }}>
              {agent.id}
            </span>
            {elapsed && (
              <span style={{ fontSize: 9, color: '#52546a' }}>{elapsed}</span>
            )}
            <span style={{ fontSize: 9, color: '#52546a' }}>
              {agent.steps.length} step{agent.steps.length !== 1 ? 's' : ''}
            </span>
          </div>
        </div>

        {/* Expand toggle */}
        <span style={{ color: '#52546a', flexShrink: 0, marginTop: 1 }}>
          {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        </span>
      </button>

      {/* Expanded content */}
      {expanded && (
        <div style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}>
          {/* Steps */}
          {agent.steps.length > 0 && (
            <div style={{ padding: '6px 12px', display: 'flex', flexDirection: 'column', gap: 4 }}>
              {agent.steps.map((step) => (
                <StepRow key={step.step} step={step} />
              ))}
            </div>
          )}

          {/* Final answer */}
          {agent.answer && (
            <div style={{
              margin: '0 12px 10px',
              padding: '8px 10px', borderRadius: 7,
              background: isError ? 'rgba(248,113,113,0.06)' : 'rgba(74,222,128,0.05)',
              border: `1px solid ${isError ? 'rgba(248,113,113,0.15)' : 'rgba(74,222,128,0.12)'}`,
            }}>
              <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase',
                color: isError ? '#f87171' : '#4ade80', marginBottom: 5 }}>
                {isError ? 'Error' : 'Answer'}
              </div>
              <div style={{
                fontSize: 11.5, color: 'rgba(226,232,240,0.88)', lineHeight: 1.6,
                whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                maxHeight: 200, overflowY: 'auto',
              }}>
                {agent.answer}
              </div>
            </div>
          )}

          {/* Running indicator */}
          {isRunning && !agent.answer && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '6px 12px 10px', fontSize: 11, color: '#a78bfa',
            }}>
              <Loader2 size={10} style={{ animation: 'spin 1s linear infinite' }} />
              Working…
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function StepRow({ step }) {
  const [open, setOpen] = useState(false);
  const Icon = TOOL_ICON[step.tool] || Zap;
  const isRunning = step.status === 'running';
  const isFailed  = step.status === 'failed';

  return (
    <div style={{
      borderRadius: 6, overflow: 'hidden',
      border: '1px solid rgba(255,255,255,0.04)',
      background: 'rgba(255,255,255,0.015)',
    }}>
      <button
        type="button"
        onClick={() => step.output && setOpen(v => !v)}
        style={{
          display: 'flex', alignItems: 'center', gap: 7, width: '100%',
          padding: '5px 8px', background: 'transparent', border: 0,
          cursor: step.output ? 'pointer' : 'default', textAlign: 'left',
        }}
      >
        <span style={{ flexShrink: 0 }}>
          {isRunning
            ? <Loader2 size={10} style={{ color: '#60a5fa', animation: 'spin 1s linear infinite' }} />
            : isFailed
              ? <AlertCircle size={10} style={{ color: '#f87171' }} />
              : <Icon size={10} style={{ color: '#52546a' }} />}
        </span>
        <span style={{ fontSize: 10, fontWeight: 600, color: '#8b8d99', flexShrink: 0 }}>
          {step.tool}
        </span>
        <span style={{
          fontSize: 10, color: '#52546a', fontFamily: 'var(--font-mono)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1,
        }}>
          {Object.values(step.args || {}).join(', ').slice(0, 60)}
        </span>
        {step.output && (
          <span style={{ color: '#52546a', flexShrink: 0 }}>
            {open ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
          </span>
        )}
      </button>

      {open && step.output && (
        <div style={{
          borderTop: '1px solid rgba(255,255,255,0.04)',
          padding: '6px 8px',
          maxHeight: 140, overflowY: 'auto',
        }}>
          <pre style={{
            margin: 0, fontSize: 10, lineHeight: 1.5,
            color: 'rgba(200,202,212,0.85)',
            fontFamily: 'var(--font-mono)',
            whiteSpace: 'pre-wrap', wordBreak: 'break-all',
          }}>
            {step.output.slice(0, 800)}
            {step.output.length > 800 && <span style={{ color: '#52546a' }}>{`\n… ${step.output.length - 800} more chars`}</span>}
          </pre>
        </div>
      )}
    </div>
  );
}
