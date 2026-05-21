/**
 * VoiceToolCalls — minimal, glanceable tool-call feed for Voice Mode.
 *
 * Reads tool results off the latest assistant message in the shared chat
 * store and renders them as compact glass cards that match the voice
 * aesthetic. Click a card to expand its preview output.
 */
import { useState } from 'react';
import {
  Wrench, Terminal, FileText, Search, FolderOpen, Globe, FileDiff,
  Loader2, CheckCircle2, AlertCircle, ChevronDown, ChevronRight,
} from 'lucide-react';
import useChatStore from '../stores/chatStore';

const TOOL_ICON = {
  runTerminal:    Terminal,
  readFile:       FileText,
  writeFile:      FileText,
  patchFile:      FileDiff,
  searchCode:     Search,
  listFiles:      FolderOpen,
  searchInternet: Globe,
};

const TOOL_LABEL = {
  runTerminal:    'Terminal',
  readFile:       'Read file',
  writeFile:      'Write file',
  patchFile:      'Patch file',
  searchCode:     'Search code',
  listFiles:      'List files',
  searchInternet: 'Web search',
};

export default function VoiceToolCalls() {
  const messages = useChatStore((s) => s.messages);

  // Pull tool results from the latest assistant message
  const lastAssistant = [...messages].reverse().find((m) => m.role === 'assistant');
  const toolResults = lastAssistant?.toolResults || [];

  if (!toolResults.length) return null;

  return (
    <div className="vm-tools" role="region" aria-label="Tool calls">
      <div className="vm-tools-header">
        <Wrench size={11} />
        <span>Tools</span>
        <span className="vm-tools-count">{toolResults.length}</span>
      </div>
      <div className="vm-tools-list">
        {toolResults.map((tr, i) => (
          <ToolCallCard key={i} entry={tr} />
        ))}
      </div>
    </div>
  );
}

function ToolCallCard({ entry }) {
  const { tool, result, summary, status } = entry;
  const Icon = TOOL_ICON[tool] || Wrench;
  const label = TOOL_LABEL[tool] || tool;

  const isRunning  = status === 'running' || result?.success === null;
  const isFailed   = status === 'failed' || result?.success === false;
  const isComplete = !isRunning && !isFailed;

  const [expanded, setExpanded] = useState(false);
  const preview = getPreview(tool, result);

  const stateClass = isRunning ? 'vm-tool-running'
    : isFailed ? 'vm-tool-failed'
    : 'vm-tool-complete';

  return (
    <div className={`vm-tool-card ${stateClass}`}>
      <button
        type="button"
        className="vm-tool-row"
        onClick={() => preview && setExpanded((v) => !v)}
        disabled={!preview}
      >
        <span className="vm-tool-icon">
          {isRunning
            ? <Loader2 size={11} className="animate-spin" />
            : isFailed
              ? <AlertCircle size={11} />
              : <Icon size={11} />}
        </span>
        <span className="vm-tool-label">{label}</span>
        <span className="vm-tool-summary">{summary || formatSummary(tool, result)}</span>
        {isComplete && <CheckCircle2 size={10} className="vm-tool-check" />}
        {preview && (
          <span className="vm-tool-toggle">
            {expanded ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
          </span>
        )}
      </button>

      {expanded && preview && (
        <div className="vm-tool-preview">{preview}</div>
      )}
    </div>
  );
}

/* ── Summary fallbacks (when chatStore didn't pre-render one) ─────────────── */
function formatSummary(tool, result) {
  if (!result?.success) return result?.error || 'Failed';
  const r = result.result || {};
  switch (tool) {
    case 'runTerminal':    return r.command ? `${r.command} (exit ${r.exitCode ?? 0})` : 'Command';
    case 'readFile':       return shortPath(r.path);
    case 'writeFile':      return shortPath(r.path);
    case 'patchFile':      return `${shortPath(r.path)} · ${r.linesChanged ?? 0} lines`;
    case 'searchCode':     return `"${r.query || ''}" · ${r.results?.length ?? 0} matches`;
    case 'listFiles':      return `${shortPath(r.path)} · ${r.items?.length ?? 0} items`;
    case 'searchInternet': return `"${r.query || ''}" · ${r.results?.length ?? 0} results`;
    default:               return tool;
  }
}

function shortPath(p) {
  if (!p) return '';
  return p.split(/[\\/]/).pop() || p;
}

/* ── Preview blocks per tool ──────────────────────────────────────────────── */
function getPreview(tool, result) {
  const r = result?.result;
  if (!r) return null;

  switch (tool) {
    case 'runTerminal': {
      const out = (r.output ?? r.stdout ?? '').trim();
      if (!out) return <span className="vm-tool-empty">(no output)</span>;
      const lines = out.split('\n');
      return (
        <pre className="vm-tool-pre">
{lines.slice(0, 24).join('\n')}
{lines.length > 24 && <span className="vm-tool-more">{`\n... ${lines.length - 24} more lines`}</span>}
        </pre>
      );
    }

    case 'readFile': {
      if (!r.content) return null;
      const lines = r.content.split('\n');
      return (
        <pre className="vm-tool-pre">
{lines.slice(0, 14).join('\n')}
{lines.length > 14 && <span className="vm-tool-more">{`\n... ${lines.length - 14} more lines`}</span>}
        </pre>
      );
    }

    case 'searchCode': {
      const matches = r.results || [];
      if (!matches.length) return null;
      return (
        <ul className="vm-tool-list-items">
          {matches.slice(0, 8).map((m, i) => (
            <li key={i}>
              <code>{shortPath(m.path)}:{m.line}</code> — {(m.text || '').trim().slice(0, 80)}
            </li>
          ))}
          {matches.length > 8 && <li className="vm-tool-more">... {matches.length - 8} more</li>}
        </ul>
      );
    }

    case 'listFiles': {
      const items = r.items || [];
      if (!items.length) return null;
      return (
        <ul className="vm-tool-list-items">
          {items.slice(0, 12).map((item, i) => (
            <li key={i}><code>{item.name || item}</code></li>
          ))}
          {items.length > 12 && <li className="vm-tool-more">... {items.length - 12} more</li>}
        </ul>
      );
    }

    case 'searchInternet': {
      const items = r.results || [];
      if (!items.length) return null;
      return (
        <ul className="vm-tool-list-items">
          {items.slice(0, 5).map((m, i) => (
            <li key={i}><strong>{m.title}</strong> — {(m.snippet || '').slice(0, 100)}</li>
          ))}
        </ul>
      );
    }

    default:
      return null;
  }
}
