/**
 * SkillsToolsTab — tabs: Skills | Custom Tools | Built-in Tools
 * + Export / Import JSON for skills & custom tools
 */
import { useRef, useState } from 'react';
import {
  Plus, Trash2, Pencil, Check, X, Zap, BookOpen,
  ToggleLeft, ToggleRight, Terminal, ChevronDown, ChevronRight,
  Download, Upload, FileText, Search, FolderOpen, FileDiff, Shield,
} from 'lucide-react';
import useSkillsStore from '../stores/skillsStore';

/* ── Built-in tool catalog ── */
const BUILTIN_TOOLS = [
  { name: 'readFile',    icon: FileText,   color: '#60a5fa', desc: 'Read a file from the workspace', args: 'path: string' },
  { name: 'writeFile',   icon: FileText,   color: '#4ade80', desc: 'Write or create a file',          args: 'path, content: string' },
  { name: 'patchFile',   icon: FileDiff,   color: '#f59e0b', desc: 'Apply a unified diff patch',      args: 'path, diff: string' },
  { name: 'searchCode',  icon: Search,     color: '#a78bfa', desc: 'Ripgrep search across workspace', args: 'query, path?: string' },
  { name: 'listFiles',   icon: FolderOpen, color: '#34d399', desc: 'List directory contents',         args: 'path: string' },
  { name: 'runTerminal', icon: Terminal,   color: '#f87171', desc: 'Execute a shell command',         args: 'command: string' },
];

const TABS = ['Skills', 'Custom Tools', 'Built-in'];

/* ── Shared styles ── */
const S = {
  section: { marginBottom: 18, padding: '14px 16px', borderRadius: 10, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' },
  label: { fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.07em', color: '#7c6df0' },
  addBtn: { display: 'flex', alignItems: 'center', gap: 5, padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: 600, background: 'rgba(124,109,240,0.12)', color: '#c4b5fd', border: '1px solid rgba(124,109,240,0.2)', cursor: 'pointer' },
  ghostBtn: { display: 'flex', alignItems: 'center', gap: 5, padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: 600, background: 'rgba(255,255,255,0.04)', color: '#52546a', border: '1px solid rgba(255,255,255,0.07)', cursor: 'pointer' },
  saveBtn: { display: 'flex', alignItems: 'center', gap: 4, padding: '5px 12px', borderRadius: 6, fontSize: 11, fontWeight: 600, background: 'rgba(74,222,128,0.12)', color: '#4ade80', border: '1px solid rgba(74,222,128,0.2)', cursor: 'pointer' },
  cancelBtn: { display: 'flex', alignItems: 'center', gap: 4, padding: '5px 12px', borderRadius: 6, fontSize: 11, fontWeight: 600, background: 'rgba(255,255,255,0.04)', color: '#52546a', border: '1px solid rgba(255,255,255,0.06)', cursor: 'pointer' },
  input: { width: '100%', borderRadius: 7, border: '1px solid rgba(255,255,255,0.08)', background: '#07070a', color: '#e4e4ea', fontSize: 12, padding: '7px 10px', outline: 'none', resize: 'vertical', boxSizing: 'border-box' },
  smallInput: { borderRadius: 7, border: '1px solid rgba(255,255,255,0.08)', background: '#07070a', color: '#e4e4ea', fontSize: 12, padding: '5px 9px', outline: 'none', boxSizing: 'border-box' },
  iconBtn: { display: 'flex', alignItems: 'center', justifyContent: 'center', width: 26, height: 26, borderRadius: 6, background: 'transparent', border: 'none', cursor: 'pointer' },
};

/* ═══════════════════════════════════════════════════════ */
export default function SkillsToolsTab() {
  const [tab, setTab] = useState('Skills');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Tab bar + Import/Export */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '10px 20px 0', borderBottom: '1px solid rgba(255,255,255,0.05)', flexShrink: 0 }}>
        {TABS.map((t) => (
          <button key={t} onClick={() => setTab(t)} style={{
            padding: '6px 14px', borderRadius: '8px 8px 0 0', fontSize: 12, fontWeight: 600, border: 'none',
            background: tab === t ? 'rgba(124,109,240,0.15)' : 'transparent',
            color: tab === t ? '#c4b5fd' : '#52546a',
            borderBottom: tab === t ? '2px solid #7c6df0' : '2px solid transparent',
            cursor: 'pointer', transition: 'all .15s',
          }}>{t}</button>
        ))}
        <div style={{ flex: 1 }} />
        <ImportExportBar />
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '18px 20px' }}>
        {tab === 'Skills'       && <SkillsSection />}
        {tab === 'Custom Tools' && <CustomToolsSection />}
        {tab === 'Built-in'     && <BuiltinSection />}
      </div>
    </div>
  );
}

/* ── Import / Export bar ── */
function ImportExportBar() {
  const { skills, tools, addSkill, addTool } = useSkillsStore();
  const importRef = useRef(null);
  const [toast, setToast] = useState('');

  const notify = (msg) => { setToast(msg); setTimeout(() => setToast(''), 2500); };

  const handleExport = () => {
    const data = JSON.stringify({ version: 1, skills, tools }, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'jarvis-skills-tools.json'; a.click();
    URL.revokeObjectURL(url);
    notify('Exported!');
  };

  const handleImport = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const parsed = JSON.parse(ev.target.result);
        let sc = 0, tc = 0;
        (parsed.skills || []).forEach((s) => { addSkill(s); sc++; });
        (parsed.tools  || []).forEach((t) => { addTool(t);  tc++; });
        notify(`Imported ${sc} skills, ${tc} tools`);
      } catch { notify('Invalid JSON file'); }
    };
    reader.readAsText(file);
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, paddingBottom: 8 }}>
      {toast && (
        <span style={{ fontSize: 10, color: '#4ade80', fontWeight: 600, marginRight: 4 }}>✓ {toast}</span>
      )}
      <button style={S.ghostBtn} onClick={handleExport} title="Export all skills & tools as JSON">
        <Download size={11} /> Export
      </button>
      <button style={S.ghostBtn} onClick={() => importRef.current?.click()} title="Import skills & tools from JSON">
        <Upload size={11} /> Import
      </button>
      <input ref={importRef} type="file" accept=".json" style={{ display: 'none' }} onChange={handleImport} />
    </div>
  );
}

/* ── Skills Section ── */
function SkillsSection() {
  const { skills, addSkill, updateSkill, removeSkill } = useSkillsStore();
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState(null);

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <BookOpen size={13} style={{ color: '#7c6df0' }} />
          <span style={S.label}>Skills</span>
          <span style={{ fontSize: 10, color: '#52546a' }}>({skills.length}) — reusable prompt templates</span>
        </div>
        <button style={S.addBtn} onClick={() => { setCreating(true); setEditingId(null); }}>
          <Plus size={11} /> New skill
        </button>
      </div>

      {creating && (
        <SkillForm onSave={(d) => { addSkill(d); setCreating(false); }} onCancel={() => setCreating(false)} />
      )}

      {skills.length === 0 && !creating && (
        <EmptyHint text="No skills yet — create one to inject reusable prompts into any chat." />
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {skills.map((skill) => (
          editingId === skill.id
            ? <SkillForm key={skill.id} initial={skill}
                onSave={(d) => { updateSkill(skill.id, d); setEditingId(null); }}
                onCancel={() => setEditingId(null)} />
            : <SkillCard key={skill.id} skill={skill}
                onEdit={() => { setEditingId(skill.id); setCreating(false); }}
                onDelete={() => removeSkill(skill.id)} />
        ))}
      </div>
    </div>
  );
}

function SkillForm({ initial = {}, onSave, onCancel }) {
  const [name, setName] = useState(initial.name || '');
  const [description, setDescription] = useState(initial.description || '');
  const [prompt, setPrompt] = useState(initial.prompt || '');
  const valid = name.trim() && prompt.trim();

  return (
    <div style={{ marginBottom: 10, padding: '12px 14px', borderRadius: 9, background: 'rgba(124,109,240,0.06)', border: '1px solid rgba(124,109,240,0.18)' }}>
      <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Skill name" style={{ ...S.smallInput, flex: 1 }} />
        <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Short description" style={{ ...S.smallInput, flex: 1.5 }} />
      </div>
      <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)}
        placeholder="Prompt — use {{selection}} for selected code, {{file}} for current file..."
        rows={4} style={{ ...S.input, marginBottom: 10 }} />
      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
        <button style={S.cancelBtn} onClick={onCancel}><X size={11} /> Cancel</button>
        <button style={{ ...S.saveBtn, opacity: valid ? 1 : 0.4 }} disabled={!valid}
          onClick={() => onSave({ name: name.trim(), description: description.trim(), prompt: prompt.trim() })}>
          <Check size={11} /> Save
        </button>
      </div>
    </div>
  );
}

function SkillCard({ skill, onEdit, onDelete }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div style={{ borderRadius: 8, border: '1px solid rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.02)', overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px' }}>
        <ChevronToggle expanded={expanded} onToggle={() => setExpanded((v) => !v)} />
        <BookOpen size={11} style={{ color: '#7c6df0', flexShrink: 0 }} />
        <span style={{ flex: 1, fontSize: 12, fontWeight: 550, color: '#c8cad4', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{skill.name}</span>
        {skill.description && <span style={{ fontSize: 10, color: '#52546a', maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{skill.description}</span>}
        <IconBtn icon={<Pencil size={11} />} onClick={onEdit} hoverColor="#e2e4ea" />
        <IconBtn icon={<Trash2 size={11} />} onClick={onDelete} hoverColor="#f87171" />
      </div>
      {expanded && (
        <div style={{ padding: '8px 12px 10px 32px', borderTop: '1px solid rgba(255,255,255,0.04)' }}>
          <pre style={{ margin: 0, padding: '8px 10px', borderRadius: 6, background: '#07070a', fontSize: 11, color: '#9898a6', whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontFamily: 'monospace', lineHeight: 1.6 }}>
            {skill.prompt}
          </pre>
        </div>
      )}
    </div>
  );
}

/* ── Custom Tools Section ── */
function CustomToolsSection() {
  const { tools, addTool, updateTool, removeTool, toggleTool } = useSkillsStore();
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState(null);

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <Zap size={13} style={{ color: '#7c6df0' }} />
          <span style={S.label}>Custom Tools</span>
          <span style={{ fontSize: 10, color: '#52546a' }}>({tools.length}) — shell commands JARVIS can call</span>
        </div>
        <button style={S.addBtn} onClick={() => { setCreating(true); setEditingId(null); }}>
          <Plus size={11} /> New tool
        </button>
      </div>

      <div style={{ marginBottom: 10, padding: '8px 10px', borderRadius: 7, background: 'rgba(96,165,250,0.06)', border: '1px solid rgba(96,165,250,0.12)', fontSize: 10, color: '#60a5fa', lineHeight: 1.6 }}>
        Tools are injected into JARVIS's system prompt. Use{' '}
        <code style={{ background: 'rgba(255,255,255,0.06)', padding: '1px 4px', borderRadius: 3 }}>{'{{args}}'}</code>
        {' '}for dynamic arguments. Toggle to enable/disable without deleting.
      </div>

      {creating && (
        <ToolForm onSave={(d) => { addTool(d); setCreating(false); }} onCancel={() => setCreating(false)} />
      )}

      {tools.length === 0 && !creating && (
        <EmptyHint text="No custom tools yet — add shell commands for JARVIS to call." />
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {tools.map((tool) => (
          editingId === tool.id
            ? <ToolForm key={tool.id} initial={tool}
                onSave={(d) => { updateTool(tool.id, d); setEditingId(null); }}
                onCancel={() => setEditingId(null)} />
            : <ToolCard key={tool.id} tool={tool}
                onEdit={() => { setEditingId(tool.id); setCreating(false); }}
                onDelete={() => removeTool(tool.id)}
                onToggle={() => toggleTool(tool.id)} />
        ))}
      </div>
    </div>
  );
}

function ToolForm({ initial = {}, onSave, onCancel }) {
  const [name, setName] = useState(initial.name || '');
  const [description, setDescription] = useState(initial.description || '');
  const [command, setCommand] = useState(initial.command || '');
  const valid = name.trim() && command.trim();

  return (
    <div style={{ marginBottom: 10, padding: '12px 14px', borderRadius: 9, background: 'rgba(124,109,240,0.06)', border: '1px solid rgba(124,109,240,0.18)' }}>
      <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Tool name (e.g. runTests)" style={{ ...S.smallInput, flex: 1 }} />
        <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Description shown to model" style={{ ...S.smallInput, flex: 2 }} />
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <Terminal size={12} style={{ color: '#52546a', flexShrink: 0 }} />
        <input value={command} onChange={(e) => setCommand(e.target.value)} placeholder="npm test -- {{args}}" style={{ ...S.smallInput, flex: 1 }} />
      </div>
      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
        <button style={S.cancelBtn} onClick={onCancel}><X size={11} /> Cancel</button>
        <button style={{ ...S.saveBtn, opacity: valid ? 1 : 0.4 }} disabled={!valid}
          onClick={() => onSave({ name: name.trim(), description: description.trim(), command: command.trim() })}>
          <Check size={11} /> Save
        </button>
      </div>
    </div>
  );
}

function ToolCard({ tool, onEdit, onDelete, onToggle }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div style={{ borderRadius: 8, overflow: 'hidden', border: `1px solid ${tool.enabled ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.03)'}`, background: tool.enabled ? 'rgba(255,255,255,0.02)' : 'rgba(255,255,255,0.01)', opacity: tool.enabled ? 1 : 0.55, transition: 'all .15s' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px' }}>
        <ChevronToggle expanded={expanded} onToggle={() => setExpanded((v) => !v)} />
        <Zap size={11} style={{ color: tool.enabled ? '#7c6df0' : '#3a3c4e', flexShrink: 0 }} />
        <span style={{ flex: 1, fontSize: 12, fontWeight: 550, color: '#c8cad4', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{tool.name}</span>
        {tool.description && <span style={{ fontSize: 10, color: '#52546a', maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{tool.description}</span>}
        <button onClick={onToggle} title={tool.enabled ? 'Disable' : 'Enable'}
          style={{ ...S.iconBtn, color: tool.enabled ? '#7c6df0' : '#3a3c4e' }}
          onMouseEnter={(e) => e.currentTarget.style.color = '#a898d0'}
          onMouseLeave={(e) => e.currentTarget.style.color = tool.enabled ? '#7c6df0' : '#3a3c4e'}>
          {tool.enabled ? <ToggleRight size={15} /> : <ToggleLeft size={15} />}
        </button>
        <IconBtn icon={<Pencil size={11} />} onClick={onEdit} hoverColor="#e2e4ea" />
        <IconBtn icon={<Trash2 size={11} />} onClick={onDelete} hoverColor="#f87171" />
      </div>
      {expanded && (
        <div style={{ padding: '8px 12px 10px 32px', borderTop: '1px solid rgba(255,255,255,0.04)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Terminal size={11} style={{ color: '#52546a', flexShrink: 0 }} />
            <code style={{ flex: 1, padding: '6px 10px', borderRadius: 6, background: '#07070a', fontSize: 11, color: '#9898a6', fontFamily: 'monospace', wordBreak: 'break-all' }}>
              {tool.command}
            </code>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Built-in Tools Section ── */
function BuiltinSection() {
  const [expanded, setExpanded] = useState(null);

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 12 }}>
        <Shield size={13} style={{ color: '#7c6df0' }} />
        <span style={S.label}>Built-in Tools</span>
        <span style={{ fontSize: 10, color: '#52546a' }}>({BUILTIN_TOOLS.length}) — always available to JARVIS</span>
      </div>

      <div style={{ marginBottom: 14, padding: '8px 10px', borderRadius: 7, background: 'rgba(74,222,128,0.05)', border: '1px solid rgba(74,222,128,0.12)', fontSize: 10, color: '#4ade80', lineHeight: 1.6 }}>
        These tools are hardcoded into JARVIS's agent loop and are always active. They cannot be disabled here.
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {BUILTIN_TOOLS.map((tool) => {
          const Icon = tool.icon;
          const isOpen = expanded === tool.name;
          return (
            <div key={tool.name} style={{ borderRadius: 8, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.02)' }}>
              <button onClick={() => setExpanded(isOpen ? null : tool.name)}
                style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}>
                <ChevronToggle expanded={isOpen} onToggle={() => {}} />
                <div style={{ width: 26, height: 26, borderRadius: 7, display: 'flex', alignItems: 'center', justifyContent: 'center', background: `${tool.color}18`, border: `1px solid ${tool.color}30`, flexShrink: 0 }}>
                  <Icon size={12} style={{ color: tool.color }} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: '#c8cad4', fontFamily: 'monospace' }}>{tool.name}</div>
                  <div style={{ fontSize: 10, color: '#52546a', marginTop: 1 }}>{tool.desc}</div>
                </div>
                <span style={{ padding: '2px 7px', borderRadius: 4, fontSize: 9, fontWeight: 700, background: 'rgba(74,222,128,0.08)', color: '#4ade80', border: '1px solid rgba(74,222,128,0.15)', flexShrink: 0 }}>ACTIVE</span>
              </button>
              {isOpen && (
                <div style={{ padding: '8px 14px 10px 54px', borderTop: '1px solid rgba(255,255,255,0.04)' }}>
                  <div style={{ fontSize: 10, color: '#52546a', marginBottom: 4 }}>Arguments</div>
                  <code style={{ fontSize: 11, color: '#a898d0', fontFamily: 'monospace', background: 'rgba(124,109,240,0.08)', padding: '4px 8px', borderRadius: 5, display: 'inline-block' }}>
                    {`{ ${tool.args} }`}
                  </code>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ── Shared micro-components ── */
function ChevronToggle({ expanded, onToggle }) {
  return (
    <button onClick={onToggle} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#52546a', padding: 0, display: 'flex', flexShrink: 0 }}>
      {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
    </button>
  );
}

function IconBtn({ icon, onClick, hoverColor }) {
  return (
    <button style={{ ...S.iconBtn, color: '#52546a' }} onClick={onClick}
      onMouseEnter={(e) => e.currentTarget.style.color = hoverColor}
      onMouseLeave={(e) => e.currentTarget.style.color = '#52546a'}>
      {icon}
    </button>
  );
}

function EmptyHint({ text }) {
  return <div style={{ padding: '24px 0', textAlign: 'center', fontSize: 11, color: '#52546a' }}>{text}</div>;
}
