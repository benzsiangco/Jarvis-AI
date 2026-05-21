import { useState } from 'react';
import { CheckCircle2, Circle, Trash2, ChevronDown, ListTodo, Zap, AlertCircle, ArrowRight } from 'lucide-react';
import useTodoStore from '../stores/todoStore';

const PRIORITY_COLORS = {
  high:   { bg: 'rgba(248,113,113,0.12)', color: '#f87171' },
  medium: { bg: 'rgba(251,191,36,0.12)',  color: '#fbbf24' },
  low:    { bg: 'rgba(52,211,153,0.12)',  color: '#34d399' },
};

const PRIORITY_ICONS = {
  high:   AlertCircle,
  medium: Zap,
  low:    ArrowRight,
};

export default function TodoList() {
  const items = useTodoStore((s) => s.items);
  const toggleItem = useTodoStore((s) => s.toggleItem);
  const removeItem = useTodoStore((s) => s.removeItem);
  const clearCompleted = useTodoStore((s) => s.clearCompleted);
  const [collapsed, setCollapsed] = useState(false);

  const active = items.filter((i) => i.status !== 'completed');
  const completed = items.filter((i) => i.status === 'completed');

  if (items.length === 0) return null;

  return (
    <div style={{
      borderRadius: 10,
      background: 'rgba(139,92,246,0.03)',
      border: '1px solid rgba(139,92,246,0.08)',
      fontSize: 11, color: '#8b8d99', marginBottom: 6,
    }}>
      {/* Header */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        style={{
          display: 'flex', alignItems: 'center', gap: 6,
          width: '100%', padding: '7px 10px',
          background: 'transparent', border: 'none', cursor: 'pointer',
          color: '#a5b4fc', fontWeight: 600, fontSize: 10,
        }}
      >
        <ListTodo size={12} />
        <span>Tasks</span>
        <span style={{
          marginLeft: 2, padding: '0 6px', borderRadius: 6,
          background: 'rgba(139,92,246,0.12)', color: '#a5b4fc',
          fontSize: 9, lineHeight: '16px',
        }}>
          {active.length}
        </span>
        <span style={{ marginLeft: 'auto', opacity: 0.4 }}>
          <ChevronDown size={11} style={{ transform: collapsed ? 'rotate(-90deg)' : undefined, transition: 'transform .15s' }} />
        </span>
      </button>

      {!collapsed && (
        <>
          {/* Active items */}
          {active.map((item) => {
            const pc = PRIORITY_COLORS[item.priority] || PRIORITY_COLORS.medium;
            const PI = PRIORITY_ICONS[item.priority] || PRIORITY_ICONS.medium;
            return (
              <div key={item.id} style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '4px 10px 4px 8px',
              }}>
                <button
                  onClick={() => toggleItem(item.id)}
                  style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', color: '#52546a' }}
                >
                  <Circle size={12} />
                </button>
                <span style={{ flex: 1, color: '#c8ccd6', lineHeight: 1.5, minWidth: 0 }}>{item.content}</span>
                <span style={{
                  display: 'flex', alignItems: 'center', gap: 3,
                  padding: '0 5px', borderRadius: 4,
                  background: pc.bg, color: pc.color, fontSize: 9, fontWeight: 600,
                  lineHeight: '16px', flexShrink: 0,
                }}>
                  <PI size={9} />
                  {item.priority}
                </span>
                <button
                  onClick={() => removeItem(item.id)}
                  style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', color: '#3a3c4e', opacity: 0.5 }}
                  title="Remove"
                >
                  <Trash2 size={11} />
                </button>
              </div>
            );
          })}

          {/* Completed items */}
          {completed.length > 0 && (
            <>
              <div style={{ height: 1, background: 'rgba(255,255,255,0.03)', margin: '2px 10px' }} />
              {completed.map((item) => (
                <div key={item.id} style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '3px 10px 3px 8px', opacity: 0.45,
                }}>
                  <button
                    onClick={() => toggleItem(item.id)}
                    style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', color: '#34d399' }}
                  >
                    <CheckCircle2 size={12} />
                  </button>
                  <span style={{ flex: 1, color: '#6b7280', textDecoration: 'line-through', lineHeight: 1.5, minWidth: 0 }}>{item.content}</span>
                </div>
              ))}
            </>
          )}

          {/* Footer */}
          {completed.length > 0 && (
            <button
              onClick={clearCompleted}
              style={{
                display: 'flex', alignItems: 'center', gap: 4,
                width: '100%', padding: '5px 10px 7px',
                background: 'transparent', border: 'none', cursor: 'pointer',
                color: '#52546a', fontSize: 9, justifyContent: 'center',
              }}
            >
              <Trash2 size={9} />
              Clear completed
            </button>
          )}
        </>
      )}
    </div>
  );
}
