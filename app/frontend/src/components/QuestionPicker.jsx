/**
 * QuestionPicker — shown when JARVIS calls askQuestion.
 * Always shows clickable option buttons (when real options exist) AND
 * a free-text input so the user can type a custom answer at any time.
 */
import { useState } from 'react';
import useChatStore from '../stores/chatStore';
import useWorkspaceStore from '../stores/workspaceStore';
import usePermissionStore from '../stores/permissionStore';

const PLACEHOLDER_OPTS = new Set(['a', 'b', 'c', 'd', 'e', 'option1', 'option2', 'option3']);

function isPlaceholder(opts) {
  if (!opts || opts.length === 0) return true;
  return opts.every((o) => PLACEHOLDER_OPTS.has(String(o).toLowerCase().trim()));
}

export default function QuestionPicker({ backendUrl }) {
  const pendingQuestion      = useChatStore((s) => s.pendingQuestion);
  const clearPendingQuestion = useChatStore((s) => s.clearPendingQuestion);
  const sendMessage          = useChatStore((s) => s.sendMessage);
  const permissionMode       = usePermissionStore((s) => s.mode);
  const [freeText, setFreeText] = useState('');

  if (!pendingQuestion) return null;

  const { question, options = [] } = pendingQuestion;
  // Filter out placeholder-only options — show real ones as buttons
  const realOptions = isPlaceholder(options) ? [] : options;

  const choose = (answer) => {
    if (!answer.trim()) return;
    clearPendingQuestion();
    setFreeText('');
    const ws = useWorkspaceStore.getState().getActiveWorkspace?.();
    sendMessage(answer.trim(), backendUrl, {
      workspacePath: ws?.path || '',
      permissionMode,
    }).catch(() => {});
  };

  return (
    <div style={{
      margin: '8px 0', padding: '12px 14px', borderRadius: 10,
      background: 'rgba(6,182,212,0.06)', border: '1px solid rgba(6,182,212,0.18)',
    }}>
      {/* Question text */}
      <div style={{ fontSize: 13, fontWeight: 600, color: '#e2e8f0', marginBottom: 10 }}>
        {question}
      </div>

      {/* Option buttons — always shown when real options exist */}
      {realOptions.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, marginBottom: 10 }}>
          {realOptions.map((opt, i) => (
            <button
              key={i}
              onClick={() => choose(opt)}
              style={{
                padding: '6px 14px', borderRadius: 7, fontSize: 12, fontWeight: 600,
                background: 'rgba(6,182,212,0.12)', color: '#67e8f9',
                border: '1px solid rgba(6,182,212,0.25)', cursor: 'pointer',
                transition: 'all .12s',
              }}
              onMouseEnter={e => e.currentTarget.style.background = 'rgba(6,182,212,0.22)'}
              onMouseLeave={e => e.currentTarget.style.background = 'rgba(6,182,212,0.12)'}
            >
              {opt}
            </button>
          ))}
        </div>
      )}

      {/* Free-text input — always shown so user can type a custom answer */}
      <div style={{ display: 'flex', gap: 8 }}>
        <input
          autoFocus={realOptions.length === 0}
          value={freeText}
          onChange={(e) => setFreeText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') choose(freeText); }}
          placeholder={realOptions.length > 0 ? 'Or type a custom answer…' : 'Type your answer…'}
          style={{
            flex: 1, height: 32, padding: '0 10px', borderRadius: 7,
            background: 'rgba(0,0,0,0.3)', color: '#e2e8f0',
            border: '1px solid rgba(6,182,212,0.25)', outline: 'none', fontSize: 12,
          }}
        />
        <button
          onClick={() => choose(freeText)}
          disabled={!freeText.trim()}
          style={{
            height: 32, padding: '0 14px', borderRadius: 7, fontSize: 12, fontWeight: 600,
            background: freeText.trim() ? 'rgba(6,182,212,0.22)' : 'rgba(6,182,212,0.08)',
            color: freeText.trim() ? '#67e8f9' : 'rgba(103,232,249,0.4)',
            border: '1px solid rgba(6,182,212,0.25)', cursor: freeText.trim() ? 'pointer' : 'default',
            transition: 'all .12s',
          }}
        >
          Send
        </button>
      </div>
    </div>
  );
}
