import { useState } from 'react';
import {
  Bot, User, Copy, Check, Loader2, Zap,
  FileDiff, Wrench, Terminal, Search, FileText, FolderOpen, CheckSquare,
  ClipboardList,
} from 'lucide-react';
import useChatStore from '../stores/chatStore';
import useThinkingStore from '../stores/thinkingStore';
import MarkdownRenderer, { sanitizeToolCalls } from './MarkdownRenderer';

const TOOL_ICON_MAP = {
  runTerminal: Terminal,
  readFile: FileText,
  writeFile: FileText,
  patchFile: FileDiff,
  searchCode: Search,
  listFiles: FolderOpen,
  openFolder: FolderOpen,
};

export function MessageBlock({ message, isStreaming }) {
  const isUser = message.role === 'user';
  const [copied, setCopied] = useState(false);
  const [copyMode, setCopyMode] = useState(null); // null | 'md' | 'plain'
  const thinkingEvents = useThinkingStore((s) => s.events);
  const thinkingStatus = useThinkingStore((s) => s.status);
  const isStreamingStore = useChatStore((s) => s.isStreaming);
  const streamStartedAt = useChatStore((s) => s.streamStartedAt);
  const currentToolEvent = isStreamingStore
    ? thinkingEvents.find((e) => e.type === 'tool_execution' && e.ts >= streamStartedAt)
    : null;
  const isTooling = Boolean(currentToolEvent) && thinkingStatus === 'running';

  const handleCopy = (mode = 'plain') => {
    const raw = sanitizeToolCalls(message.content || '');
    let text = raw;
    if (mode === 'plain') {
      text = raw
        .replace(/```[\s\S]*?```/g, (m) => m.replace(/```\w*\n?/, '').replace(/```$/, '').trim())
        .replace(/`([^`]+)`/g, '$1')
        .replace(/\*\*([^*]+)\*\*/g, '$1')
        .replace(/\*([^*]+)\*/g, '$1')
        .replace(/^#{1,6}\s+/gm, '')
        .replace(/^\s*[-*+]\s+/gm, '• ')
        .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
        .trim();
    }
    navigator.clipboard.writeText(text);
    setCopied(true);
    setCopyMode(mode);
    setTimeout(() => { setCopied(false); setCopyMode(null); }, 1500);
  };

  return (
    <article className={`group flex gap-3 ${isUser ? 'justify-end' : ''}`}>
      {!isUser && <Avatar icon={<Bot size={14} />} />}
      <div className={`min-w-0 ${isUser ? 'max-w-[78%]' : 'flex-1'}`}>
        <div className={`mb-1 flex items-center gap-2 ${isUser ? 'justify-end' : ''}`}>
          <span className="text-[11px] font-medium text-[var(--color-text-muted)]">
            {isUser ? 'You' : 'JARVIS'}
          </span>
          {message.content && !isStreaming && !isUser && (
            <div className="opacity-0 transition-opacity group-hover:opacity-100 flex items-center gap-1">
              <button
                onClick={() => handleCopy('plain')}
                className="msg-copy-btn"
                title="Copy as plain text"
              >
                {copied && copyMode === 'plain' ? <Check size={11} /> : <Copy size={11} />}
              </button>
              <button
                onClick={() => handleCopy('md')}
                className="msg-copy-btn msg-copy-md"
                title="Copy as Markdown"
              >
                {copied && copyMode === 'md' ? <Check size={11} /> : <ClipboardList size={11} />}
              </button>
            </div>
          )}
          {message.content && !isStreaming && isUser && (
            <button
              onClick={() => handleCopy('plain')}
              className="opacity-0 transition-opacity group-hover:opacity-100 text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
            >
              {copied ? <Check size={12} /> : <Copy size={12} />}
            </button>
          )}
        </div>

        {!isUser && message.toolResults?.length > 0 && (
          <div className="mb-2 space-y-1">
            {message.toolResults.map((tr, i) => (
              <ToolResultBlock key={i} tool={tr.tool} result={tr.result} summary={tr.summary} />
            ))}
          </div>
        )}

        <div className={isUser ? 'user-message' : 'assistant-message'}>
          {isUser ? (
            <UserMessageContent message={message} />
          ) : (
            <div className="markdown-body">
              {message.content ? (
                <MarkdownRenderer content={message.content} />
              ) : isStreaming && message.toolResults?.length > 0 ? (
                <p className="text-[11px] text-[var(--color-text-muted)] italic">Applying changes...</p>
              ) : isStreaming && !isTooling ? (
                <ThinkingIndicator />
              ) : null}
              {isStreaming && <ToolCallBadge />}
              {isStreaming && !isTooling && message.content && <StreamingCursor />}
            </div>
          )}
        </div>
      </div>
      {isUser && <Avatar icon={<User size={14} />} user />}
    </article>
  );
}

function UserMessageContent({ message }) {
  const attachments = message.attachments || [];
  return (
    <div className="space-y-3">
      {attachments.length > 0 && (
        <div className="sent-attachment-grid">
          {attachments.map((attachment) => (
            <SentAttachmentPreview key={attachment.id || attachment.name} attachment={attachment} />
          ))}
        </div>
      )}
      {message.content && <p className="whitespace-pre-wrap">{stripAttachmentText(message.content)}</p>}
    </div>
  );
}

function SentAttachmentPreview({ attachment }) {
  const sizeLabel = attachment.size < 1024
    ? `${attachment.size}B`
    : `${(attachment.size / 1024).toFixed(1)}KB`;

  if (attachment.isImage && attachment.preview) {
    return (
      <figure className="sent-attachment sent-attachment-image">
        <img src={attachment.preview} alt={attachment.name} />
        <figcaption>
          <span>{attachment.name}</span>
          <small>{sizeLabel}</small>
        </figcaption>
      </figure>
    );
  }

  return (
    <div className="sent-attachment sent-attachment-file">
      <FileText size={15} />
      <span className="min-w-0">
        <span>{attachment.name}</span>
        <small>{sizeLabel}</small>
      </span>
    </div>
  );
}

function stripAttachmentText(content) {
  return String(content || '')
    .replace(/\*\*Attached image:[\s\S]*?\)\s*/g, '')
    .replace(/\*\*Attached file:[\s\S]*?```\s*/g, '')
    .trim();
}

function ToolResultBlock({ tool, result, summary }) {
  // Auto-expand terminal results so output is visible immediately
  const [expanded, setExpanded] = useState(tool === 'runTerminal');
  const running = result?.success === null;
  const success = result?.success !== false;
  const Icon = TOOL_ICON_MAP[tool] || Wrench;
  const preview = getToolPreview(tool, result);

  // For runTerminal, enrich the summary with the first line of output
  let displaySummary = summary;
  if (tool === 'runTerminal' && result?.result?.output) {
    const firstLine = result.result.output.trim().split('\n')[0];
    if (firstLine) displaySummary = `${summary} → ${firstLine.slice(0, 40)}`;
  }

  return (
    <div style={{
      borderRadius: 8,
      border: `1px solid ${running ? 'rgba(96,165,250,0.2)' : success ? 'rgba(255,255,255,0.06)' : 'rgba(248,113,113,0.2)'}`,
      background: running ? 'rgba(96,165,250,0.05)' : success ? 'rgba(255,255,255,0.02)' : 'rgba(248,113,113,0.05)',
      fontSize: 11,
      overflow: 'hidden',
    }}>
      <div style={{ display:'flex', alignItems:'flex-start', gap:7, padding:'7px 10px' }}>
        {running
          ? <Loader2 size={11} style={{ marginTop:1, flexShrink:0, color:'#60a5fa', animation:'spin 1s linear infinite' }} />
          : <Icon size={11} style={{ marginTop:1, flexShrink:0, opacity:.6, color: success ? '#8b8d99' : '#f87171' }} />}
        <span style={{ flex:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', color: success ? '#8b8d99' : '#f87171' }}>
          {displaySummary}
        </span>
        {preview && (
          <button
            onClick={() => setExpanded((v) => !v)}
            style={{ flexShrink:0, fontSize:10, fontWeight:500, color:'#52546a', transition:'color .1s' }}
            onMouseEnter={e => e.currentTarget.style.color='#8b8d99'}
            onMouseLeave={e => e.currentTarget.style.color='#52546a'}
          >
            {expanded ? 'hide' : 'show details'}
          </button>
        )}
      </div>
      {expanded && preview && (
        <div style={{ borderTop:'1px solid rgba(255,255,255,0.04)', padding:'8px 10px' }}>
          {preview}
        </div>
      )}
    </div>
  );
}

function getToolPreview(tool, result) {
  if (!result?.result) return null;
  const r = result.result;

  switch (tool) {
    case 'readFile': {
      const content = r.content;
      if (!content) return null;
      const lines = content.split('\n');
      const total = lines.length;
      const maxPreview = 10;
      const previewLines = lines.slice(0, maxPreview);
      return (
        <div>
          <pre className="max-h-32 overflow-auto rounded bg-[var(--color-bg-primary)] p-2 text-[11px] leading-relaxed text-[var(--color-text-secondary)] font-mono">
            {previewLines.join('\n')}
            {total > maxPreview && <span className="block pt-1 text-[10px] opacity-50">... {total - maxPreview} more lines</span>}
          </pre>
        </div>
      );
    }
    case 'writeFile':
    case 'patchFile': {
      return (
        <div className="flex items-center gap-2 text-[11px] text-emerald-400">
          <CheckSquare size={12} />
          <span>{r.path || 'file'} — {r.linesChanged ? `${r.linesChanged} lines changed` : 'written successfully'}</span>
        </div>
      );
    }
    case 'runTerminal': {
      // Backend returns { output, exitCode, command } — not stdout/stderr
      const cmd = r.command || '';
      const output = (r.output ?? r.stdout ?? '').trim();
      const stderr = (r.stderr ?? '').trim();
      const combined = [output, stderr].filter(Boolean).join('\n');
      const hasOutput = combined.length > 0;
      const lines = combined.split('\n');
      return (
        <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
          {cmd && (
            <div style={{ display:'flex', alignItems:'center', gap:6 }}>
              <Terminal size={11} style={{ flexShrink:0, color:'#52546a' }} />
              <code style={{ flex:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', fontFamily:'var(--font-mono)', fontSize:11, color:'#8b8d99' }}>
                {cmd}
              </code>
            </div>
          )}
          {hasOutput ? (
            <pre style={{ maxHeight:192, overflowY:'auto', borderRadius:6, background:'rgba(0,0,0,0.3)', padding:'8px 10px', fontFamily:'var(--font-mono)', fontSize:11, lineHeight:1.6, color:'#c8cad4', whiteSpace:'pre-wrap', wordBreak:'break-all' }}>
              {lines.slice(0, 30).join('\n')}
              {lines.length > 30 && <span style={{ display:'block', paddingTop:4, fontSize:10, opacity:.5 }}>... {lines.length - 30} more lines</span>}
            </pre>
          ) : (
            <div style={{ fontSize:11, color:'#52546a', fontStyle:'italic' }}>(no output)</div>
          )}
        </div>
      );
    }
    case 'searchCode': {
      const results = r.results || [];
      if (!results.length) return null;
      return (
        <div className="space-y-1">
          {results.slice(0, 8).map((m, i) => (
            <div key={i} className="flex gap-2 text-[11px]">
              <span className="flex-shrink-0 text-[var(--color-text-muted)]">{m.path}:{m.line}</span>
              <span className="truncate text-[var(--color-text-secondary)]">{m.text}</span>
            </div>
          ))}
          {results.length > 8 && <div className="text-[10px] text-[var(--color-text-muted)]">... {results.length - 8} more results</div>}
        </div>
      );
    }
    case 'listFiles': {
      const items = r.items || [];
      if (!items.length) return <div className="text-[11px] text-[var(--color-text-muted)]">(empty directory)</div>;
      return (
        <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-[11px]">
          {items.slice(0, 25).map((item, i) => (
            <div key={i} className="contents">
              <span className={`font-mono ${item.type === 'directory' ? 'text-blue-400' : 'text-[var(--color-text-muted)]'}`}>
                {item.type === 'directory' ? '📁' : '📄'}
              </span>
              <span className="truncate text-[var(--color-text-secondary)]">{item.name}</span>
            </div>
          ))}
          {items.length > 25 && <span className="col-span-2 text-[10px] text-[var(--color-text-muted)]">... {items.length - 25} more</span>}
        </div>
      );
    }
    case 'openFolder':
      return <div className="text-[11px] text-[var(--color-text-secondary)]">Opened: {r.path}</div>;
    default:
      return null;
  }
}

function ToolCallBadge() {
  const events = useThinkingStore((s) => s.events);
  const status = useThinkingStore((s) => s.status);
  const isStreaming = useChatStore((s) => s.isStreaming);
  const streamStartedAt = useChatStore((s) => s.streamStartedAt);

  if (!isStreaming || status !== 'running') return null;

  const latest = events
    .filter((e) => e.type === 'tool_execution' && e.ts >= streamStartedAt)
    .slice(-1)[0];

  if (!latest) return null;

  const raw = latest.message || '';
  const toolNameMatch = raw.match(/\b(runTerminal|readFile|writeFile|patchFile|searchCode|listFiles|openFolder)\b/);
  const toolName = toolNameMatch?.[1] ?? null;
  const Icon = toolName ? (TOOL_ICON_MAP[toolName] || Zap) : Zap;

  return (
    <div className="tool-call-badge">
      <span className="tool-call-badge-spinner">
        <Loader2 size={11} className="animate-spin" />
      </span>
      <Icon size={11} className="tool-call-badge-icon" />
      <span className="tool-call-badge-label">
        {toolName ? (
          <>Running <code className="tool-call-badge-name">{toolName}</code></>
        ) : (
          'Calling tool'
        )}
      </span>
      <span className="tool-call-badge-dots">
        <span /><span /><span />
      </span>
    </div>
  );
}

function Avatar({ icon, user }) {
  return (
    <div className={`mt-5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full border ${
      user
        ? 'border-[var(--color-border-bright)] bg-[var(--color-bg-active)]'
        : 'border-[var(--color-border-default)] bg-[var(--color-bg-secondary)]'
    }`}>
      {icon}
    </div>
  );
}

export function StatusDot({ status }) {
  const color = {
    ready: 'bg-emerald-500',
    loading: 'bg-blue-500 animate-pulse',
    starting: 'bg-amber-500 animate-pulse',
    error: 'bg-red-500',
    offline: 'bg-zinc-500',
  }[status] || 'bg-zinc-500';
  return <span className={`h-2 w-2 rounded-full ${color}`} />;
}

function StreamingCursor() {
  return <span className="ml-1 inline-block h-4 w-1.5 translate-y-0.5 rounded-sm bg-[var(--color-accent)] animate-blink" />;
}

/* ── Thinking indicator — shimmer + dots while waiting for first token ── */
export function ThinkingIndicator({ label = 'Thinking' }) {
  return (
    <span className="thinking-indicator">
      <span className="thinking-shimmer">{label}</span>
      <span className="thinking-dots">
        <span className="thinking-dot" />
        <span className="thinking-dot" />
        <span className="thinking-dot" />
      </span>
    </span>
  );
}
