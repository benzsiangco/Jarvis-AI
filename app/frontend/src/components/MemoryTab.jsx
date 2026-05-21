/**
 * MemoryTab — view, add, edit and delete JARVIS long-term memories.
 *
 * Displayed as a markdown-style list (like a personal profile file).
 * Each memory is a single fact. The user can add new ones manually,
 * edit inline, or delete. JARVIS also writes here via rememberFact tool.
 */
import { useEffect, useState, useRef } from 'react';
import { Plus, Trash2, Pencil, Check, X, Brain, RefreshCw, AlertCircle } from 'lucide-react';

const TAG_COLORS = {
  name:        { bg: 'rgba(34,211,238,0.1)',  border: 'rgba(34,211,238,0.3)',  text: '#67e8f9' },
  address:     { bg: 'rgba(167,139,250,0.1)', border: 'rgba(167,139,250,0.3)', text: '#c4b5fd' },
  preference:  { bg: 'rgba(74,222,128,0.1)',  border: 'rgba(74,222,128,0.3)',  text: '#86efac' },
  project:     { bg: 'rgba(251,191,36,0.1)',  border: 'rgba(251,191,36,0.3)',  text: '#fde68a' },
  schedule:    { bg: 'rgba(249,115,22,0.1)',  border: 'rgba(249,115,22,0.3)',  text: '#fdba74' },
  default:     { bg: 'rgba(255,255,255,0.05)', border: 'rgba(255,255,255,0.1)', text: '#9ca3af' },
};

function tagStyle(tag) {
  return TAG_COLORS[tag?.toLowerCase()] || TAG_COLORS.default;
}

function formatDate(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function MemoryTab({ backendUrl }) {
  const [memories, setMemories] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState('');
  const [editId, setEditId]     = useState(null);
  const [editText, setEditText] = useState('');
  const [editTags, setEditTags] = useState('');
  const [addMode, setAddMode]   = useState(false);
  const [newText, setNewText]   = useState('');
  const [newTags, setNewTags]   = useState('');
  const [saving, setSaving]     = useState(false);
  const newInputRef = useRef(null);

  const load = async () => {
    setLoading(true); setError('');
    try {
      const r = await fetch(`${backendUrl}/api/memory`);
      const d = await r.json();
      setMemories((d.memories || []).slice().reverse()); // newest first
    } catch (e) {
      setError(e.message);
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [backendUrl]);

  useEffect(() => {
    if (addMode) setTimeout(() => newInputRef.current?.focus(), 50);
  }, [addMode]);

  const save = async (content, tags, id) => {
    if (!content.trim()) return;
    setSaving(true);
    try {
      const tagArr = tags.split(',').map((t) => t.trim().toLowerCase()).filter(Boolean);
      await fetch(`${backendUrl}/api/memory`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, content: content.trim(), tags: tagArr }),
      });
      await load();
      setEditId(null); setAddMode(false); setNewText(''); setNewTags('');
    } catch (e) { setError(e.message); }
    finally { setSaving(false); }
  };

  const del = async (id) => {
    try {
      await fetch(`${backendUrl}/api/memory/${id}`, { method: 'DELETE' });
      setMemories((m) => m.filter((x) => x.id !== id));
    } catch (e) { setError(e.message); }
  };

  const clearAll = async () => {
    if (!window.confirm('Clear all memories? This cannot be undone.')) return;
    try {
      await fetch(`${backendUrl}/api/memory`, { method: 'DELETE' });
      setMemories([]);
    } catch (e) { setError(e.message); }
  };

  const startEdit = (m) => {
    setEditId(m.id);
    setEditText(m.content);
    setEditTags((m.tags || []).join(', '));
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 0 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <Brain size={14} style={{ color: '#22d3ee' }} />
        <div>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#c8cad4' }}>JARVIS Memory</div>
          <div style={{ fontSize: 10, color: '#52546a', marginTop: 1 }}>
            Facts JARVIS knows about you. Injected into every conversation.
          </div>
        </div>
        <div style={{ flex: 1 }} />
        <button onClick={load} title="Refresh" style={iconBtn}>
          <RefreshCw size={12} />
        </button>
        {memories.length > 0 && (
          <button onClick={clearAll} title="Clear all" style={{ ...iconBtn, color: '#f87171' }}>
            <Trash2 size={12} />
          </button>
        )}
        <button
          onClick={() => { setAddMode(true); setEditId(null); }}
          style={{
            display: 'flex', alignItems: 'center', gap: 5,
            height: 28, padding: '0 10px', borderRadius: 7,
            background: 'rgba(34,211,238,0.1)', color: '#67e8f9',
            border: '1px solid rgba(34,211,238,0.2)',
            cursor: 'pointer', fontSize: 11, fontWeight: 600,
          }}
        >
          <Plus size={12} /> Add memory
        </button>
      </div>

      {error && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8,
          padding: '7px 10px', borderRadius: 7, fontSize: 11,
          background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.2)',
          color: '#fca5a5',
        }}>
          <AlertCircle size={12} /> {error}
        </div>
      )}

      {/* Add new memory form */}
      {addMode && (
        <div style={cardStyle}>
          <div style={{ fontSize: 9, fontWeight: 700, color: '#5e6370', letterSpacing: '.06em', textTransform: 'uppercase', marginBottom: 6 }}>
            New memory
          </div>
          <textarea
            ref={newInputRef}
            value={newText}
            onChange={(e) => setNewText(e.target.value)}
            placeholder="e.g. User's name is Benz Siangco"
            rows={2}
            style={textareaStyle}
            onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) save(newText, newTags); }}
          />
          <input
            value={newTags}
            onChange={(e) => setNewTags(e.target.value)}
            placeholder="Tags (comma-separated): name, address, preference..."
            style={{ ...inputStyle, marginTop: 6 }}
          />
          <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
            <button onClick={() => save(newText, newTags)} disabled={saving || !newText.trim()} style={saveBtn}>
              {saving ? 'Saving…' : <><Check size={11} /> Save</>}
            </button>
            <button onClick={() => { setAddMode(false); setNewText(''); setNewTags(''); }} style={cancelBtn}>
              <X size={11} /> Cancel
            </button>
          </div>
        </div>
      )}

      {/* Memory list — markdown-style */}
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
        {loading ? (
          <div style={{ padding: '24px 0', textAlign: 'center', color: '#52546a', fontSize: 12 }}>Loading…</div>
        ) : memories.length === 0 ? (
          <div style={{ padding: '32px 0', textAlign: 'center' }}>
            <Brain size={28} style={{ margin: '0 auto 10px', opacity: 0.2, display: 'block' }} />
            <div style={{ fontSize: 12, color: '#52546a', fontWeight: 500 }}>No memories yet</div>
            <div style={{ fontSize: 10, color: '#3a3c4e', marginTop: 4 }}>
              Tell JARVIS "remember my name is ..." or add one above.
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {memories.map((m) => (
              <div key={m.id} style={cardStyle}>
                {editId === m.id ? (
                  <>
                    <textarea
                      value={editText}
                      onChange={(e) => setEditText(e.target.value)}
                      rows={2}
                      style={textareaStyle}
                      autoFocus
                    />
                    <input
                      value={editTags}
                      onChange={(e) => setEditTags(e.target.value)}
                      placeholder="Tags: name, address, preference..."
                      style={{ ...inputStyle, marginTop: 6 }}
                    />
                    <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                      <button onClick={() => save(editText, editTags, m.id)} disabled={saving} style={saveBtn}>
                        {saving ? 'Saving…' : <><Check size={11} /> Save</>}
                      </button>
                      <button onClick={() => setEditId(null)} style={cancelBtn}>
                        <X size={11} /> Cancel
                      </button>
                    </div>
                  </>
                ) : (
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                    {/* Markdown bullet */}
                    <span style={{ color: '#22d3ee', fontSize: 14, lineHeight: '20px', flexShrink: 0 }}>—</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, color: '#d4d8e0', lineHeight: 1.5 }}>{m.content}</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 5, flexWrap: 'wrap' }}>
                        {(m.tags || []).map((tag) => {
                          const s = tagStyle(tag);
                          return (
                            <span key={tag} style={{
                              padding: '1px 6px', borderRadius: 4, fontSize: 9, fontWeight: 600,
                              background: s.bg, border: `1px solid ${s.border}`, color: s.text,
                              letterSpacing: '.04em',
                            }}>
                              {tag}
                            </span>
                          );
                        })}
                        {m.ts && (
                          <span style={{ fontSize: 9, color: '#3a3c4e', marginLeft: 'auto' }}>
                            {formatDate(m.ts)}
                          </span>
                        )}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                      <button onClick={() => startEdit(m)} style={iconBtn} title="Edit">
                        <Pencil size={11} />
                      </button>
                      <button onClick={() => del(m.id)} style={{ ...iconBtn, color: '#f87171' }} title="Delete">
                        <Trash2 size={11} />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Footer count */}
      {memories.length > 0 && (
        <div style={{ paddingTop: 8, fontSize: 9.5, color: '#3a3c4e', textAlign: 'right' }}>
          {memories.length} memor{memories.length !== 1 ? 'ies' : 'y'} stored
        </div>
      )}
    </div>
  );
}

/* ── Styles ── */
const cardStyle = {
  padding: '10px 12px', borderRadius: 9,
  background: 'rgba(255,255,255,0.02)',
  border: '1px solid rgba(255,255,255,0.05)',
  transition: 'border-color .12s',
};

const textareaStyle = {
  width: '100%', resize: 'none', padding: '8px 10px', borderRadius: 7,
  background: 'rgba(0,0,0,0.3)', color: '#d4d8e0',
  border: '1px solid rgba(255,255,255,0.07)', outline: 'none',
  fontSize: 12, fontFamily: 'inherit', lineHeight: 1.5,
  boxSizing: 'border-box',
};

const inputStyle = {
  width: '100%', height: 28, padding: '0 10px', borderRadius: 7,
  background: 'rgba(0,0,0,0.3)', color: '#d4d8e0',
  border: '1px solid rgba(255,255,255,0.07)', outline: 'none',
  fontSize: 11, fontFamily: 'inherit', boxSizing: 'border-box',
};

const saveBtn = {
  display: 'inline-flex', alignItems: 'center', gap: 4,
  height: 26, padding: '0 10px', borderRadius: 6,
  background: 'rgba(34,211,238,0.12)', color: '#67e8f9',
  border: '1px solid rgba(34,211,238,0.2)',
  cursor: 'pointer', fontSize: 11, fontWeight: 600,
};

const cancelBtn = {
  display: 'inline-flex', alignItems: 'center', gap: 4,
  height: 26, padding: '0 10px', borderRadius: 6,
  background: 'rgba(255,255,255,0.04)', color: '#8b8d99',
  border: '1px solid rgba(255,255,255,0.07)',
  cursor: 'pointer', fontSize: 11,
};

const iconBtn = {
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  width: 26, height: 26, borderRadius: 6,
  background: 'transparent', color: '#5e6370',
  border: '1px solid rgba(255,255,255,0.06)', cursor: 'pointer',
};
