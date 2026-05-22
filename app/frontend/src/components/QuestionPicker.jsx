/**
 * QuestionPicker — professional question UI for JARVIS askQuestion tool.
 */
import { useState } from 'react';
import { Send, HelpCircle } from 'lucide-react';
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
  const [freeText, setFreeText]   = useState('');
  const [selected, setSelected]   = useState(null);

  if (!pendingQuestion) return null;

  const { question, options = [] } = pendingQuestion;
  const realOptions = isPlaceholder(options) ? [] : options;

  const choose = (answer) => {
    if (!answer.trim()) return;
    clearPendingQuestion();
    setFreeText('');
    setSelected(null);
    const ws = useWorkspaceStore.getState().getActiveWorkspace?.();
    sendMessage(answer.trim(), backendUrl, {
      workspacePath: ws?.path || '',
      permissionMode,
    }).catch(() => {});
  };

  return (
    <div className="qp-root">
      {/* Header */}
      <div className="qp-header">
        <div className="qp-icon">
          <HelpCircle size={14} style={{ color: '#22d3ee' }} />
        </div>
        <span className="qp-label">JARVIS needs your input</span>
      </div>

      {/* Question */}
      <div className="qp-question">{question}</div>

      {/* Option buttons */}
      {realOptions.length > 0 && (
        <div className="qp-options">
          {realOptions.map((opt, i) => (
            <button
              key={i}
              className={`qp-option ${selected === i ? 'qp-option-selected' : ''}`}
              onClick={() => { setSelected(i); choose(opt); }}
            >
              <span className="qp-option-letter">{String.fromCharCode(65 + i)}</span>
              <span className="qp-option-text">{opt}</span>
            </button>
          ))}
        </div>
      )}

      {/* Divider if both options and free text */}
      {realOptions.length > 0 && (
        <div className="qp-divider">
          <span>or type a custom answer</span>
        </div>
      )}

      {/* Free text input */}
      <div className="qp-input-row">
        <input
          autoFocus={realOptions.length === 0}
          value={freeText}
          onChange={(e) => setFreeText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && freeText.trim()) choose(freeText); }}
          placeholder={realOptions.length > 0 ? 'Custom answer…' : 'Type your answer…'}
          className="qp-input"
        />
        <button
          onClick={() => choose(freeText)}
          disabled={!freeText.trim()}
          className={`qp-send ${freeText.trim() ? 'qp-send-active' : ''}`}
        >
          <Send size={13} />
        </button>
      </div>
    </div>
  );
}
