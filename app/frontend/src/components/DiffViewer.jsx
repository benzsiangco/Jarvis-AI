import { useState } from 'react';
import { DiffEditor } from '@monaco-editor/react';
import {
  CheckCircle2, XCircle, FileDiff, FileText, Check,
} from 'lucide-react';
import useDiffStore from '../stores/diffStore';

/**
 * DiffViewer — Real inline/side-by-side diff viewer powered by Monaco.
 * Shows changed files, addition/deletion counts, and accept/reject actions.
 */
export default function DiffViewer() {
  const diffs = useDiffStore((s) => s.diffs);
  const reviewPath = useDiffStore((s) => s.reviewPath);
  const reviewOpen = useDiffStore((s) => s.reviewOpen);
  const openReview = useDiffStore((s) => s.openReview);
  const acceptDiff = useDiffStore((s) => s.acceptDiff);
  const rejectDiff = useDiffStore((s) => s.rejectDiff);
  const acceptAll = useDiffStore((s) => s.acceptAll);

  const [viewMode, setViewMode] = useState('inline'); // 'inline' | 'side'
  const changedFiles = Object.values(diffs);
  const activeDiff = reviewPath ? diffs[reviewPath] : null;

  if (!reviewOpen || changedFiles.length === 0) return null;

  return (
    <div className="diff-viewer">
      <div className="workspace-change-list" aria-label="Changed files">
        {changedFiles.map((d) => (
          <button
            key={d.path}
            onClick={() => openReview(d.path)}
            className={`workspace-change-row ${d.path === reviewPath ? 'workspace-change-row-active' : ''}`}
          >
            <FileText size={13} className={d.deletions > d.additions ? 'workspace-change-icon-del' : 'workspace-change-icon-add'} />
            <span className="workspace-change-path">{d.path}</span>
            <DiffBadge additions={d.additions} deletions={d.deletions} small />
          </button>
        ))}
      </div>

      <div className="diff-content">
        {activeDiff ? (
          <div className="workspace-diff-card">
            <div className="diff-path-bar">
              <div className="diff-header-left">
                <FileDiff size={13} className="text-[var(--color-accent)]" />
                <span className="diff-path-text">{activeDiff.path}</span>
              </div>
              <DiffBadge additions={activeDiff.additions} deletions={activeDiff.deletions} />
              <div className="diff-actions">
                <button
                  onClick={() => setViewMode(viewMode === 'inline' ? 'side' : 'inline')}
                  className="diff-mode-toggle"
                  title={viewMode === 'inline' ? 'Side-by-side' : 'Inline'}
                >
                  {viewMode === 'inline' ? 'Inline' : 'Side'}
                </button>
                <button onClick={acceptAll} className="diff-accept-all" title="Accept all changes">
                  <Check size={12} />
                  All
                </button>
                <button onClick={() => acceptDiff(activeDiff.path)} className="diff-action-accept" title="Accept changes">
                  <CheckCircle2 size={13} />
                </button>
                <button onClick={() => rejectDiff(activeDiff.path)} className="diff-action-reject" title="Reject changes">
                  <XCircle size={13} />
                </button>
              </div>
            </div>

            <div className="diff-editor-container">
              <DiffEditor
                original={activeDiff.original}
                modified={activeDiff.modified}
                language={activeDiff.language}
                theme="vs-dark"
                options={{
                  readOnly: true,
                  renderSideBySide: viewMode === 'side',
                  fontSize: 12,
                  fontFamily: "'JetBrains Mono', monospace",
                  minimap: { enabled: false },
                  scrollBeyondLastLine: false,
                  lineNumbers: 'on',
                  renderLineHighlight: 'none',
                  renderIndicators: true,
                  originalEditable: false,
                  padding: { top: 8, bottom: 8 },
                  scrollbar: {
                    verticalScrollbarSize: 6,
                    horizontalScrollbarSize: 6,
                  },
                }}
              />
            </div>
          </div>
        ) : (
          <div className="diff-empty">
            <FileDiff size={24} className="text-[var(--color-text-muted)]" />
            <p>Select a file to view changes</p>
          </div>
        )}
      </div>
    </div>
  );
}

/** Compact +N -N badge */
export function DiffBadge({ additions, deletions, small }) {
  if (additions === 0 && deletions === 0) return null;
  const cls = small ? 'diff-badge diff-badge-sm' : 'diff-badge';
  return (
    <span className={cls}>
      {additions > 0 && <span className="diff-badge-add">+{additions}</span>}
      {deletions > 0 && <span className="diff-badge-del">-{deletions}</span>}
    </span>
  );
}

/** Inline diff hunk display (for chat messages) */
export function InlineDiffBlock({ original, modified, language }) {
  const origLines = (original || '').split('\n');
  const modLines = (modified || '').split('\n');

  // Build simple line diff
  const lines = [];
  const max = Math.max(origLines.length, modLines.length);
  let lineNum = 0;

  for (let i = 0; i < max; i++) {
    const o = i < origLines.length ? origLines[i] : undefined;
    const m = i < modLines.length ? modLines[i] : undefined;

    if (o !== undefined && m !== undefined && o === m) {
      lineNum++;
      lines.push({ type: 'equal', content: o, num: lineNum });
    } else {
      if (o !== undefined) {
        lineNum++;
        lines.push({ type: 'del', content: o, num: lineNum });
      }
      if (m !== undefined) {
        lineNum++;
        lines.push({ type: 'add', content: m, num: lineNum });
      }
    }
  }

  const additions = lines.filter((l) => l.type === 'add').length;
  const deletions = lines.filter((l) => l.type === 'del').length;

  return (
    <div className="inline-diff-block">
      <div className="inline-diff-header">
        <FileDiff size={12} />
        <span className="inline-diff-lang">{language || 'text'}</span>
        <DiffBadge additions={additions} deletions={deletions} small />
      </div>
      <div className="inline-diff-body">
        {lines.slice(0, 60).map((line, i) => (
          <div key={i} className={`inline-diff-line inline-diff-${line.type}`}>
            <span className="inline-diff-gutter">
              {line.type === 'add' ? '+' : line.type === 'del' ? '-' : ' '}
            </span>
            <span className="inline-diff-num">{line.num}</span>
            <span className="inline-diff-text">{line.content}</span>
          </div>
        ))}
        {lines.length > 60 && (
          <div className="inline-diff-line inline-diff-equal">
            <span className="inline-diff-gutter"> </span>
            <span className="inline-diff-num">…</span>
            <span className="inline-diff-text text-[var(--color-text-muted)]">
              {lines.length - 60} more lines
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
