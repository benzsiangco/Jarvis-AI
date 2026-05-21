import { useState, useRef, useCallback, useEffect } from 'react';
import { Send, Square, Paperclip, Loader2, ChevronDown, Shield, ShieldCheck, ShieldOff, GitCompare, FileDiff, XSquare, CheckSquare, ShieldAlert, Cpu, Brain } from 'lucide-react';
import useChatStore from '../stores/chatStore';
import useModelStore from '../stores/modelStore';
import useEditorStore from '../stores/editorStore';
import usePermissionStore from '../stores/permissionStore';
import useFileStore from '../stores/fileStore';
import useDiffStore from '../stores/diffStore';
import usePromptQueueStore from '../stores/promptQueueStore';
import AttachedFileChip from './AttachedFileChip';
import useDropdownPortal from '../hooks/useDropdownPortal';
import DropdownPortal from './DropdownPortal';
import useFileDrop from '../hooks/useFileDrop';
import ModelBrowserModal from './ModelBrowserModal';
import TodoList from './TodoList';
import PromptQueue from './PromptQueue';
import { getModelCapabilities, getModelName } from '../services/modelCapabilities';

export default function Composer({ backendUrl }) {
  const { sendMessage, stopGeneration, clearPendingApproval } = useChatStore();
  const messages = useChatStore((s) => s.messages);
  const isStreaming = useChatStore((s) => s.isStreaming);
  const pendingApproval = useChatStore((s) => s.pendingApproval);
  const thinkingMode = useChatStore((s) => s.thinkingMode);
  const setThinkingMode = useChatStore((s) => s.setThinkingMode);
  const serverStatus = useModelStore((s) => s.serverStatus);
  const activeModel = useModelStore((s) => s.activeModel);
  const appliedSettings = useModelStore((s) => s.appliedSettings);
  const llamaStats = useModelStore((s) => s.llamaStats);
  const mode = usePermissionStore((s) => s.mode);
  const workspacePath = useFileStore((s) => s.workspacePath);
  const openFiles = useEditorStore((s) => s.openFiles);
  const serverInfo = useModelStore((s) => s.serverInfo);
  const models = useModelStore((s) => s.models);
  const modelCapabilities = getModelCapabilities(activeModel, serverInfo, models);
  const modelName = getModelName(activeModel);
  const [input, setInput] = useState('');
  const [historyIndex, setHistoryIndex] = useState(null);
  const [historyDraft, setHistoryDraft] = useState('');
  const [showReview, setShowReview] = useState(false);
  const [cursorPos, setCursorPos] = useState(0);
  const [modelModalOpen, setModelModalOpen] = useState(false);
  const inputRef = useRef(null);
  const queueEnqueue = usePromptQueueStore((s) => s.enqueue);
  const queueDequeue = usePromptQueueStore((s) => s.dequeue);
  const queueSetStatus = usePromptQueueStore((s) => s.setStatus);
  const queueItems = usePromptQueueStore((s) => s.queue);
  const {
    attachments, isDragging, dragHandlers, fileInputRef,
    openPicker, removeFile, clearAll, onFileInputChange,
  } = useFileDrop();

  // Auto-drain queue when model becomes free
  useEffect(() => {
    if (isStreaming) return;
    const next = queueDequeue();
    if (!next) return;
    queueSetStatus(next.id, 'processing');
    const opts = next.opts || {};
    sendMessage(next.content, backendUrl, {
      workspacePath: opts.workspacePath || workspacePath,
      permissionMode: opts.permissionMode || mode,
      attachments: next.attachments || [],
      supportsImages: opts.supportsImages || false,
    }).finally(() => {
      queueSetStatus(next.id, 'completed');
    });
  }, [isStreaming]); // eslint-disable-line

  const pendingDiffs = openFiles.filter((file) => file.isDirty);
  const hasPendingDiffs = pendingDiffs.length > 0;

  const handleSend = useCallback((text = input) => {
    const content = text.trim();
    if (!content && attachments.length === 0) return;
    const chatState = useChatStore.getState();
    const modelState = useModelStore.getState();

    // If model is busy, queue the prompt instead of dropping it
    if (chatState.isStreaming) {
      queueEnqueue(content, attachments.map(a => ({ ...a })), {
        workspacePath, permissionMode: mode,
        supportsImages: modelCapabilities?.image,
      });
      setInput('');
      setHistoryIndex(null);
      setHistoryDraft('');
      clearAll();
      return;
    }

    if (modelState.serverStatus !== 'ready') return;
    const hasImages = attachments.some((a) => a.isImage);
    const supportsImages = modelCapabilities?.image;
    if (hasImages && !supportsImages) {
      const imageNames = attachments.filter((a) => a.isImage).map((a) => a.name).join(', ');
      const nonImageAttachments = attachments.filter((a) => !a.isImage);
      setInput('');
      setHistoryIndex(null);
      setHistoryDraft('');
      clearAll();
      sendMessage(
        `${content}\n\n[Image(s) not sent — "${imageNames}" — current model does not support image input.]`.trim(),
        backendUrl,
        { workspacePath, permissionMode: mode, attachments: nonImageAttachments, supportsImages: false }
      );
      return;
    }
    setInput('');
    setHistoryIndex(null);
    setHistoryDraft('');
    const sentAttachments = attachments;
    clearAll();
    sendMessage(content, backendUrl, { workspacePath, permissionMode: mode, attachments: sentAttachments, supportsImages: modelCapabilities?.image });
  }, [input, backendUrl, mode, workspacePath, modelCapabilities, attachments, sendMessage, clearAll, queueEnqueue]);

  const handleKeyDown = (e) => {
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      if (handlePromptHistoryKey(e)) return;
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handlePromptHistoryKey = (e) => {
    // Build deduplicated history newest-first from user messages
    const seen = new Set();
    const prompts = [];
    const userMsgs = messages.filter((m) => m.role === 'user' && typeof m.content === 'string' && m.content.trim());
    for (let i = userMsgs.length - 1; i >= 0; i--) {
      const c = userMsgs[i].content.trim();
      if (!seen.has(c)) { seen.add(c); prompts.push(c); }
    }
    if (!prompts.length) return false;

    const target = e.currentTarget;
    const val = target.value;
    const selStart = target.selectionStart ?? 0;
    const beforeCursor = val.slice(0, selStart);
    const afterCursor = val.slice(selStart);
    const onFirstLine = !beforeCursor.includes('\n');
    const onLastLine = !afterCursor.includes('\n');

    if (e.key === 'ArrowUp' && onFirstLine) {
      e.preventDefault();
      // Save draft on first press
      if (historyIndex === null) setHistoryDraft(val);
      const nextIndex = historyIndex === null ? 0 : Math.min(historyIndex + 1, prompts.length - 1);
      setHistoryIndex(nextIndex);
      const newVal = prompts[nextIndex];
      setInput(newVal);
      requestAnimationFrame(() => {
        if (inputRef.current) {
          inputRef.current.selectionStart = 0;
          inputRef.current.selectionEnd = 0;
        }
      });
      return true;
    }

    if (e.key === 'ArrowDown' && historyIndex !== null && onLastLine) {
      e.preventDefault();
      if (historyIndex === 0) {
        // Back to draft
        setHistoryIndex(null);
        const draft = historyDraft;
        setInput(draft);
        requestAnimationFrame(() => {
          if (inputRef.current) {
            inputRef.current.selectionStart = draft.length;
            inputRef.current.selectionEnd = draft.length;
          }
        });
      } else {
        const nextIndex = historyIndex - 1;
        setHistoryIndex(nextIndex);
        const newVal = prompts[nextIndex];
        setInput(newVal);
        requestAnimationFrame(() => {
          if (inputRef.current) {
            inputRef.current.selectionStart = newVal.length;
            inputRef.current.selectionEnd = newVal.length;
          }
        });
      }
      return true;
    }

    return false;
  };

  // Reset history index when user manually edits
  const handleChange = (e) => {
    if (historyIndex !== null) setHistoryIndex(null);
    setInput(e.target.value);
    setCursorPos(e.target.selectionStart ?? e.target.value.length);
  };

  const canSend = serverStatus === 'ready' && (input.trim() || attachments.length > 0);
  const pendingQueueCount = queueItems.filter((i) => i.status === 'queued').length;

  return (
    <div className="composer-root pointer-events-none">
      <div className="composer-inner pointer-events-auto">
        {/* Todo list */}
        <TodoList />

        {/* Prompt queue strip */}
        <PromptQueue onRetry={(item) => {
          usePromptQueueStore.getState().remove(item.id);
          handleSend(item.content);
        }} />

        {/* Approval banner */}
        {pendingApproval && (
          <div className="mb-2">
            <ApprovalBanner approval={pendingApproval} onDismiss={clearPendingApproval} backendUrl={backendUrl} />
          </div>
        )}

        {/* Pending diffs */}
        {hasPendingDiffs && (
          <ComposerMeta pendingDiffs={pendingDiffs} showReview={showReview} onToggleReview={() => setShowReview((v) => !v)} />
        )}
        {hasPendingDiffs && showReview && <ReviewChangeList pendingDiffs={pendingDiffs} />}

        {/* Drag-drop overlay */}
        <div className="composer-card" {...dragHandlers}>
          {isDragging && (
            <div className="composer-drop-overlay">
              <Paperclip size={22} />
              <span>Drop files to attach</span>
            </div>
          )}

          {/* Attached files strip */}
          {attachments.length > 0 && (
            <div className="attach-strip">
              {attachments.map((a) => (
                <AttachedFileChip key={a.id} attachment={a} onRemove={removeFile} imageBlocked={a.isImage && !modelCapabilities?.image} />
              ))}
            </div>
          )}

          {/* Textarea */}
          <MentionInput
            inputRef={inputRef}
            value={input}
            onChange={handleChange}
            onKeyUp={(e) => setCursorPos(e.target.selectionStart ?? 0)}
            onClick={(e) => setCursorPos(e.target.selectionStart ?? 0)}
            onKeyDown={handleKeyDown}
            placeholder={isDragging ? '' : getPlaceholder(serverStatus)}
            disabled={serverStatus !== 'ready'}
          />

          {/* Bottom controls */}
          <div className="composer-controls">
            <div className="composer-controls-left">
              <button className="composer-btn composer-btn-attach" type="button" onClick={openPicker} title="Add context">
                <Paperclip size={12} />
                <span>Add context</span>
              </button>
              <PermissionSelect />
              <button className="composer-btn" type="button"
                onClick={() => setThinkingMode(!thinkingMode)}
                title={thinkingMode ? 'Deep thinking ON — model reasons step by step' : 'Deep thinking OFF'}
                style={{
                  display: 'flex', alignItems: 'center', gap: 5, height: 26, padding: '0 8px',
                  borderRadius: 6, fontSize: 10, fontWeight: 600,
                  border: thinkingMode ? '1px solid rgba(167,139,250,0.2)' : '1px solid rgba(255,255,255,0.06)',
                  background: thinkingMode ? 'rgba(167,139,250,0.1)' : 'rgba(255,255,255,0.03)',
                  color: thinkingMode ? '#a78bfa' : '#5e6370',
                  cursor: 'pointer', transition: 'all .12s',
                }}
              >
                <Brain size={12} />
                <span>Think</span>
              </button>
            </div>
            <div className="composer-controls-right">
              <button className="composer-btn" type="button" onClick={() => setModelModalOpen(true)} title="Select model">
                <Cpu size={12} style={{ color: serverStatus === 'ready' ? '#22d3ee' : undefined }} />
                <span className="truncate max-w-[100px]">{modelName || (serverStatus === 'ready' ? 'Model ready' : 'No model')}</span>
                <ChevronDown size={11} />
              </button>
              <button
                type="button"
                onClick={isStreaming ? stopGeneration : () => handleSend()}
                disabled={isStreaming ? false : !canSend}
                className="composer-send-btn"
                title={isStreaming ? 'Stop' : (pendingQueueCount > 0 ? `Queue (${pendingQueueCount} waiting)` : 'Send')}
              >
                {isStreaming ? <Square size={12} fill="currentColor" /> : <Send size={13} />}
                {!isStreaming && pendingQueueCount > 0 && (
                  <span className="composer-queue-badge">{pendingQueueCount}</span>
                )}
              </button>
            </div>
          </div>

          <input ref={fileInputRef} type="file" multiple className="sr-only" onChange={onFileInputChange} accept="image/*,text/*,.js,.jsx,.ts,.tsx,.py,.json,.yaml,.yml,.md,.sql,.go,.rs,.java,.rb,.php,.c,.cpp,.cs,.html,.css,.sh" />
        </div>
      </div>

      <ModelBrowserModal open={modelModalOpen} onClose={() => setModelModalOpen(false)} backendUrl={backendUrl} />
    </div>
  );
}

/* ── Existing Sub-components ── */

function MentionInput({ inputRef, value, onChange, onKeyUp, onClick, onKeyDown, placeholder, disabled }) {
  return (
    <div className="composer-input-shell">
      <div className="composer-highlight" aria-hidden="true">
        {renderMentionHighlights(value)}
      </div>
      <textarea
        ref={inputRef}
        value={value}
        onChange={onChange}
        onKeyUp={onKeyUp}
        onClick={onClick}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        disabled={disabled}
        rows={3}
        className="composer-textarea"
      />
    </div>
  );
}

function renderMentionHighlights(value) {
  if (!value) return null;
  const parts = [];
  const mentionRegex = /@\[([^\]\n]+)\]/g;
  let lastIndex = 0, match;
  while ((match = mentionRegex.exec(value)) !== null) {
    if (match.index > lastIndex) parts.push(value.slice(lastIndex, match.index));
    parts.push(<span key={`mention-${match.index}`} className="composer-mention-token">@<span className="composer-mention-hidden">[</span>{match[1]}<span className="composer-mention-hidden">]</span></span>);
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < value.length) parts.push(value.slice(lastIndex));
  return parts;
}

function ComposerMeta({ pendingDiffs, showReview, onToggleReview }) {
  const diffs = pendingDiffs.map((f) => ({ ...f, ...computeQuickStats(f.originalContent || '', f.content) }));
  const totalAdd = diffs.reduce((s, d) => s + d.add, 0);
  const totalDel = diffs.reduce((s, d) => s + d.del, 0);
  return (
    <div className="composer-meta">
      <div className="flex min-w-0 items-center gap-3">
        <GitCompare size={13} className="flex-shrink-0 text-[var(--color-accent)]" />
        <span className="truncate">{pendingDiffs.length} file{pendingDiffs.length !== 1 ? 's' : ''} changed</span>
        <span className="flex items-center gap-1.5 text-[10px] font-mono flex-shrink-0">
          <span className="text-emerald-400">+{totalAdd}</span>
          <span className="text-red-400">-{totalDel}</span>
        </span>
      </div>
      <button className="composer-review-btn" type="button" aria-expanded={showReview} onClick={onToggleReview}>
        {showReview ? 'Hide review' : 'Review changes'}
      </button>
    </div>
  );
}

function ReviewChangeList({ pendingDiffs }) {
  const openReview = useDiffStore((s) => s.openReview);
  const recordDiff = useDiffStore((s) => s.recordDiff);
  return (
    <div className="composer-review-list">
      {pendingDiffs.map((file) => {
        const stats = computeQuickStats(file.originalContent || '', file.content);
        return (
          <button key={file.path} className="composer-review-card" onClick={() => { recordDiff(file.path, file.originalContent || '', file.content, file.language); openReview(file.path); }}>
            <FileDiff size={11} className="flex-shrink-0 text-[var(--color-text-muted)]" />
            <code className="truncate flex-1" title={file.path}>{file.name}</code>
            <span className="flex items-center gap-1 text-[9px] font-mono flex-shrink-0">
              <span className="text-emerald-400">+{stats.add}</span>
              <span className="text-red-400">-{stats.del}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

function ApprovalBanner({ approval, onDismiss, backendUrl }) {
  const [sending, setSending] = useState(false);
  const handleApprove = async () => { setSending(true); try { await fetch(`${backendUrl}/api/chat/approve`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ round: approval.round, approved: true }) }); } catch {} onDismiss(); };
  const handleDeny = async () => { setSending(true); try { await fetch(`${backendUrl}/api/chat/approve`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ round: approval.round, approved: false }) }); } catch {} onDismiss(); };
  const toolLabel = approval.args?.path || approval.args?.command || approval.tool;
  return (
    <div className="approval-banner">
      <ShieldAlert size={16} className="flex-shrink-0 text-amber-400" />
      <div className="min-w-0 flex-1">
        <div className="approval-banner-title">Approve tool execution?</div>
        <div className="approval-banner-detail">{toolLabel}</div>
      </div>
      <div className="flex gap-2">
        <button onClick={handleDeny} disabled={sending} className="approval-btn approval-btn-deny">
          {sending ? <Loader2 size={12} className="animate-spin" /> : <XSquare size={12} />}
          Deny
        </button>
        <button onClick={handleApprove} disabled={sending} className="approval-btn approval-btn-approve">
          {sending ? <Loader2 size={12} className="animate-spin" /> : <CheckSquare size={12} />}
          Approve
        </button>
      </div>
    </div>
  );
}

const PERMISSION_OPTIONS = [
  { value: 'ask', label: 'Ask first', icon: Shield, desc: 'Confirm before file writes' },
  { value: 'workspace', label: 'Workspace', icon: ShieldCheck, desc: 'Auto-approve workspace ops' },
  { value: 'full', label: 'Full access', icon: ShieldOff, desc: 'Auto-approve all operations' },
];

function PermissionSelect() {
  const mode = usePermissionStore((s) => s.mode);
  const setMode = usePermissionStore((s) => s.setMode);
  const { triggerRef, open, toggle, close, pos } = useDropdownPortal();
  const current = PERMISSION_OPTIONS.find((o) => o.value === mode) ?? PERMISSION_OPTIONS[0];
  const Icon = current.icon;
  return (
    <>
      <button ref={triggerRef} type="button" onClick={toggle} className={`composer-btn ${open ? 'composer-btn-active' : ''}`} title={`Permission: ${current.label}`}>
        <Icon size={13} /><span>{current.label}</span>
        <ChevronDown size={11} style={{ transform: open ? 'rotate(180deg)' : undefined, transition: 'transform 150ms' }} />
      </button>
      <DropdownPortal open={open} pos={pos} minW={220} maxW={260} align="left">
        <div className="dd-menu">
          <div className="dd-header">Permission mode</div>
          {PERMISSION_OPTIONS.map((opt) => {
            const OptionIcon = opt.icon;
            const active = mode === opt.value;
            return (
              <button key={opt.value} className={`dd-row ${active ? 'dd-row-active' : ''}`} onClick={() => { setMode(opt.value); close(); }}>
                <OptionIcon size={13} className="dd-row-icon" />
                <div className="dd-row-body">
                  <span className="dd-row-label">{opt.label}</span>
                  <span className="dd-row-desc">{opt.desc}</span>
                </div>
                {active && <span className="dd-check">✓</span>}
              </button>
            );
          })}
        </div>
      </DropdownPortal>
    </>
  );
}

/* ── Helpers ── */

function getPlaceholder(status) {
  if (status === 'offline') return 'Model offline — open Models to load one...';
  if (status === 'starting' || status === 'loading') return 'Model is loading...';
  if (status === 'error') return 'Model error — check Models panel...';
  return 'Ask anything about your code...';
}

function computeQuickStats(original, modified) {
  const a = (original || '').split('\n');
  const b = (modified || '').split('\n');
  let add = 0, del = 0;
  const max = Math.max(a.length, b.length);
  for (let i = 0; i < max; i++) {
    if (i >= a.length) { add++; continue; }
    if (i >= b.length) { del++; continue; }
    if (a[i] !== b[i]) { add++; del++; }
  }
  return { add, del };
}