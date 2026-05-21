/**
 * PromptQueue — compact queue strip above the composer.
 * Shows queued prompts with status, edit, cancel, retry.
 */
import { useState } from 'react';
import { X, RotateCcw, Clock, Loader2, CheckCircle2, AlertCircle, Edit3, Check } from 'lucide-react';
import usePromptQueueStore from '../stores/promptQueueStore';

const STATUS_CFG = {
  queued:        { icon: Clock,        color: '#5e6370',  label: 'queued' },
  processing:    { icon: Loader2,      color: '#22d3ee',  label: 'processing', spin: true },
  waiting_tools: { icon: Loader2,      color: '#a78bfa',  label: 'tools', spin: true },
  completed:     { icon: CheckCircle2, color: '#34d399',  label: 'done' },
  cancelled:     { icon: X,            color: '#52546a',  label: 'cancelled' },
  failed:        { icon: AlertCircle,  color: '#f87171',  label: 'failed' },
};

export default function PromptQueue({ onRetry }) {
  const queue = usePromptQueueStore((s) => s.queue);
  const cancel = usePromptQueueStore((s) => s.cancel);
  const edit = usePromptQueueStore((s) => s.edit);
  const remove = usePromptQueueStore((s) => s.remove);
  const clearCompleted = usePromptQueueStore((s) => s.clearCompleted);

  // Only show items that are relevant
  const visible = queue.filter((i) =>
    i.status === 'queued' || i.status === 'processing' || i.status === 'waiting_tools' || i.status === 'failed'
  );

  if (!visible.length) return null;

  return (
    <div className="pq-root">
      <div className="pq-header">
        <span className="pq-title">Queue</span>
        <span className="pq-count">{visible.length}</span>
        <button className="pq-clear" onClick={clearCompleted} title="Clear completed">
          clear done
        </button>
      </div>
      <div className="pq-list">
        {visible.map((item) => (
          <QueueItem
            key={item.id}
            item={item}
            onCancel={() => cancel(item.id)}
            onRemove={() => remove(item.id)}
            onEdit={(text) => edit(item.id, text)}
            onRetry={() => onRetry?.(item)}
          />
        ))}
      </div>
    </div>
  );
}

function QueueItem({ item, onCancel, onRemove, onEdit, onRetry }) {
  const [editing, setEditing] = useState(false);
  const [editVal, setEditVal] = useState(item.content);
  const cfg = STATUS_CFG[item.status] || STATUS_CFG.queued;
  const Icon = cfg.icon;
  const isActive = item.status === 'processing' || item.status === 'waiting_tools';
  const isFailed = item.status === 'failed';
  const isQueued = item.status === 'queued';

  const saveEdit = () => {
    if (editVal.trim()) onEdit(editVal.trim());
    setEditing(false);
  };

  return (
    <div className={`pq-item ${isActive ? 'pq-item-active' : ''} ${isFailed ? 'pq-item-failed' : ''}`}>
      <span className="pq-item-icon" style={{ color: cfg.color }}>
        <Icon size={10} className={cfg.spin ? 'animate-spin' : ''} />
      </span>

      {editing ? (
        <input
          className="pq-edit-input"
          value={editVal}
          onChange={(e) => setEditVal(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') saveEdit();
            if (e.key === 'Escape') setEditing(false);
          }}
          autoFocus
        />
      ) : (
        <span className="pq-item-text">{item.content}</span>
      )}

      <div className="pq-item-actions">
        {editing ? (
          <button className="pq-action" onClick={saveEdit} title="Save">
            <Check size={9} />
          </button>
        ) : (
          <>
            {isQueued && (
              <button className="pq-action" onClick={() => { setEditVal(item.content); setEditing(true); }} title="Edit">
                <Edit3 size={9} />
              </button>
            )}
            {isFailed && (
              <button className="pq-action pq-action-retry" onClick={onRetry} title="Retry">
                <RotateCcw size={9} />
              </button>
            )}
            {isQueued && (
              <button className="pq-action pq-action-cancel" onClick={onCancel} title="Cancel">
                <X size={9} />
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
