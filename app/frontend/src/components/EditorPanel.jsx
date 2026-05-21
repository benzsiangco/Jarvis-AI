import { useState, useEffect, useRef } from 'react';
import Editor, { DiffEditor } from '@monaco-editor/react';
import useEditorStore from '../stores/editorStore';
import useFileStore from '../stores/fileStore';
import useDiffStore from '../stores/diffStore';
import useLiveEditStore from '../stores/liveEditStore';
import { X, Circle, GitCompare, FilePenLine, SkipForward } from 'lucide-react';

export default function EditorPanel({ backendUrl }) {
  const { openFiles, activeFileIdx, setActiveFile, closeFile, updateFileContent, markSaved } = useEditorStore();
  const saveFile = useFileStore((s) => s.saveFile);
  const activeFile = activeFileIdx >= 0 ? openFiles[activeFileIdx] : null;
  const [diffMode, setDiffMode] = useState(false);

  // Live edit state
  const liveEdit = useLiveEditStore();
  const liveEditorRef = useRef(null);

  // Auto-scroll live editor to the bottom as content grows
  useEffect(() => {
    if (liveEdit.isEditing && liveEditorRef.current) {
      const editor = liveEditorRef.current;
      const model = editor.getModel();
      if (model) {
        const lineCount = model.getLineCount();
        editor.revealLine(lineCount);
      }
    }
  }, [liveEdit.visibleContent, liveEdit.isEditing]);

  const handleSave = async () => {
    if (!activeFile) return;
    try {
      const result = await saveFile(backendUrl, activeFile.path, activeFile.content);
      if (result?.error) throw new Error(result.error);
      markSaved(activeFileIdx);
    } catch (err) {
      console.error('Save failed:', err);
    }
  };

  const handleEditorMount = (editor, monaco) => {
    editor.addAction({
      id: 'save-file',
      label: 'Save File',
      keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS],
      run: handleSave,
    });
  };

  const handleLiveEditorMount = (editor) => {
    liveEditorRef.current = editor;
  };

  // Compute diff stats for active file
  const activeDiffStats = activeFile?.isDirty
    ? computeQuickStats(activeFile.originalContent || '', activeFile.content)
    : null;

  // If a live edit is in progress, show the live editor
  if (liveEdit.isEditing) {
    return <LiveEditView liveEdit={liveEdit} onMount={handleLiveEditorMount} />;
  }

  return (
    <div className="flex flex-col h-full bg-[var(--color-bg-secondary)]">
      {/* Tab Bar */}
      {openFiles.length > 0 && (
        <div className="flex items-center bg-[var(--color-bg-primary)] border-b border-[var(--color-border-default)] overflow-x-auto">
          {openFiles.map((file, idx) => {
            const isActive = idx === activeFileIdx;
            const fileStats = file.isDirty
              ? computeQuickStats(file.originalContent || '', file.content)
              : null;

            return (
              <div
                key={file.path}
                onClick={() => setActiveFile(idx)}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs cursor-pointer border-r border-[var(--color-border-subtle)] transition-colors group min-w-0 ${
                  isActive
                    ? 'bg-[var(--color-bg-secondary)] text-[var(--color-text-primary)] border-t-2 border-t-[var(--color-accent)]'
                    : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-tertiary)]'
                }`}
              >
                {file.isDirty && <Circle size={6} className="text-[var(--color-warning)] fill-current flex-shrink-0" />}
                <span className="truncate max-w-[120px]">{file.name}</span>
                {fileStats && (
                  <span className="flex items-center gap-1 text-[9px] font-mono flex-shrink-0">
                    <span className="text-emerald-400">+{fileStats.add}</span>
                    <span className="text-red-400">-{fileStats.del}</span>
                  </span>
                )}
                <button
                  onClick={(e) => { e.stopPropagation(); closeFile(idx); }}
                  className="ml-1 p-0.5 rounded opacity-0 group-hover:opacity-100 hover:bg-[var(--color-bg-hover)] transition-all flex-shrink-0"
                >
                  <X size={10} />
                </button>
              </div>
            );
          })}

          {/* Diff toggle button */}
          {activeFile?.isDirty && (
            <button
              onClick={() => setDiffMode(!diffMode)}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-medium transition-colors flex-shrink-0 ${
                diffMode
                  ? 'text-[var(--color-accent)] bg-[var(--color-accent-dim)]'
                  : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]'
              }`}
              title="Toggle diff view"
            >
              <GitCompare size={12} />
              {diffMode ? 'Code' : 'Diff'}
            </button>
          )}
        </div>
      )}

      {/* Editor */}
      <div className="flex-1 min-h-0">
        {activeFile ? (
          diffMode && activeFile.isDirty ? (
            <DiffEditor
              original={activeFile.originalContent || ''}
              modified={activeFile.content}
              language={activeFile.language || 'plaintext'}
              theme="vs-dark"
              options={{
                readOnly: true,
                renderSideBySide: false,
                fontSize: 13,
                fontFamily: "'JetBrains Mono', monospace",
                minimap: { enabled: false },
                scrollBeyondLastLine: false,
                lineNumbers: 'on',
                renderIndicators: true,
                padding: { top: 12, bottom: 12 },
                scrollbar: { verticalScrollbarSize: 6, horizontalScrollbarSize: 6 },
              }}
            />
          ) : (
            <Editor
              theme="vs-dark"
              language={activeFile.language || 'plaintext'}
              value={activeFile.content}
              onChange={(val) => updateFileContent(activeFileIdx, val || '')}
              onMount={handleEditorMount}
              options={{
                fontSize: 13,
                fontFamily: "'JetBrains Mono', monospace",
                minimap: { enabled: false },
                scrollBeyondLastLine: false,
                padding: { top: 12, bottom: 12 },
                lineNumbers: 'on',
                renderLineHighlight: 'line',
                cursorBlinking: 'smooth',
                smoothScrolling: true,
                bracketPairColorization: { enabled: true },
                wordWrap: 'off',
                tabSize: 2,
              }}
            />
          )
        ) : (
          <WelcomeScreen />
        )}
      </div>

      {/* Change summary bar */}
      {activeFile?.isDirty && activeDiffStats && (
        <div className="flex items-center justify-between px-3 py-1.5 border-t border-[var(--color-border-default)] bg-[var(--color-bg-primary)] text-[10px]">
          <div className="flex items-center gap-3 text-[var(--color-text-muted)]">
            <span className="font-medium">Unsaved changes</span>
            <span className="text-emerald-400 font-mono">+{activeDiffStats.add}</span>
            <span className="text-red-400 font-mono">-{activeDiffStats.del}</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setDiffMode(!diffMode)}
              className="flex items-center gap-1 px-2 py-0.5 rounded text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)] transition-colors"
            >
              <GitCompare size={10} />
              {diffMode ? 'Editor' : 'View diff'}
            </button>
            <button
              onClick={handleSave}
              className="flex items-center gap-1 px-2 py-0.5 rounded bg-[var(--color-accent-dim)] text-[var(--color-accent)] hover:bg-[var(--color-accent)] hover:text-[var(--color-bg-primary)] transition-colors font-medium"
            >
              Save
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Live Edit View ─────────────────────────────────────────────────────── */

function LiveEditView({ liveEdit, onMount }) {
  const lineCount = (liveEdit.visibleContent || '').split('\n').length;
  const totalLines = (liveEdit.fullContent || '').split('\n').length;
  const progress = liveEdit.fullContent.length > 0
    ? Math.round((liveEdit.visibleContent.length / liveEdit.fullContent.length) * 100)
    : 0;

  return (
    <div className="flex flex-col h-full" style={{ background: '#0a0c0f' }}>
      {/* Live edit header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '8px 14px',
        background: 'rgba(124,109,240,0.06)',
        borderBottom: '1px solid rgba(124,109,240,0.15)',
      }}>
        <div style={{
          width: 8, height: 8, borderRadius: '50%',
          background: liveEdit.isComplete ? '#4ade80' : '#7c6df0',
          animation: liveEdit.isComplete ? 'none' : 'le-pulse 1s ease-in-out infinite',
          flexShrink: 0,
        }} />
        <FilePenLine size={13} style={{ color: '#c4b5fd', flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#e2e4ea', display: 'flex', alignItems: 'center', gap: 6 }}>
            <span className="truncate">{liveEdit.fileName}</span>
            <span style={{
              fontSize: 9, padding: '1px 6px', borderRadius: 4, fontWeight: 600,
              background: liveEdit.editType === 'patch' ? 'rgba(251,191,36,0.15)' : 'rgba(124,109,240,0.15)',
              color: liveEdit.editType === 'patch' ? '#fbbf24' : '#c4b5fd',
              textTransform: 'uppercase', letterSpacing: '.04em',
            }}>
              {liveEdit.editType === 'patch' ? 'patching' : 'writing'}
            </span>
          </div>
          <div style={{ fontSize: 10, color: '#52546a', marginTop: 1 }}>
            {liveEdit.isComplete
              ? `Done — ${totalLines} lines written`
              : `Line ${lineCount} of ${totalLines} · ${progress}%`
            }
          </div>
        </div>

        {/* Skip button */}
        {!liveEdit.isComplete && (
          <button
            onClick={() => liveEdit.skipAnimation()}
            title="Skip animation"
            style={{
              display: 'flex', alignItems: 'center', gap: 4,
              padding: '3px 8px', borderRadius: 5,
              fontSize: 10, fontWeight: 600,
              background: 'rgba(255,255,255,0.06)',
              color: '#8b8d99', border: 'none',
              transition: 'all .12s',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.1)'; e.currentTarget.style.color = '#e2e4ea'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; e.currentTarget.style.color = '#8b8d99'; }}
          >
            <SkipForward size={10} />
            Skip
          </button>
        )}
      </div>

      {/* Progress bar */}
      <div style={{ height: 2, background: 'rgba(255,255,255,0.04)' }}>
        <div style={{
          height: '100%',
          width: `${progress}%`,
          background: liveEdit.isComplete
            ? 'linear-gradient(90deg, #4ade80, #34d399)'
            : 'linear-gradient(90deg, #7c6df0, #a78bfa)',
          transition: 'width 0.1s linear',
        }} />
      </div>

      {/* Monaco editor showing streaming content */}
      <div className="flex-1 min-h-0">
        <Editor
          theme="vs-dark"
          language={liveEdit.language}
          value={liveEdit.visibleContent}
          onMount={onMount}
          options={{
            readOnly: true,
            fontSize: 13,
            fontFamily: "'JetBrains Mono', monospace",
            minimap: { enabled: false },
            scrollBeyondLastLine: false,
            padding: { top: 12, bottom: 12 },
            lineNumbers: 'on',
            renderLineHighlight: 'none',
            cursorStyle: 'line',
            smoothScrolling: true,
            wordWrap: 'off',
            tabSize: 2,
            scrollbar: { verticalScrollbarSize: 6, horizontalScrollbarSize: 6 },
          }}
        />
      </div>

      <style>{`
        @keyframes le-pulse { 0%,100%{opacity:1} 50%{opacity:.3} }
      `}</style>
    </div>
  );
}

function WelcomeScreen() {
  return (
    <div className="flex h-full items-center justify-center bg-[var(--color-bg-primary)] p-8">
      <div className="max-w-[260px] text-center">
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6 }}>No file open</div>
        <p style={{ fontSize: 11.5, color: 'var(--text-muted)', opacity: .5, lineHeight: 1.6 }}>
          Click a file in the sidebar to open it here.
        </p>
      </div>
    </div>
  );
}

/** Quick line-count diff stats */
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
