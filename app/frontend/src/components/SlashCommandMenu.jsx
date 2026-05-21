/**
 * ComposerOverlay — slash commands (/) and @ file mentions
 * cursorPos is passed in from Composer (updated synchronously on each keystroke)
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  BookOpen, Zap, Check, X, Terminal,
  ChevronRight, FileText, Folder, Search,
} from 'lucide-react';
import useSkillsStore from '../stores/skillsStore';
import useFileStore from '../stores/fileStore';

/* ── Slash commands ── */
const SLASH_CMDS = [
  { id: 'skillcreator', label: '/skillcreator', icon: BookOpen, color: '#a78bfa', desc: 'Create a reusable prompt skill' },
  { id: 'toolcreator',  label: '/toolcreator',  icon: Zap,      color: '#f59e0b', desc: 'Create a custom shell tool'    },
];

/* ── Flatten workspace tree ── */
function flattenTree(node, out = []) {
  if (!node) return out;
  if (node.type === 'file' || node.type === 'directory') {
    out.push({ name: node.name, path: node.path, type: node.type });
  }
  if (node.children) node.children.forEach((c) => flattenTree(c, out));
  return out;
}

const EXT_COLOR = {
  js:'#f7df1e', jsx:'#61dafb', ts:'#3178c6', tsx:'#61dafb',
  json:'#4ade80', md:'#e2e8f0', css:'#38bdf8', html:'#f97316',
  py:'#3b82f6', sh:'#a3e635',
};
function MentionIcon({ item }) {
  if (item.type === 'directory') {
    return <Folder size={12} style={{ color: '#f59e0b', flexShrink: 0 }} />;
  }
  const name = item.name || '';
  const ext = name.slice(name.lastIndexOf('.') + 1).toLowerCase();
  return <FileText size={12} style={{ color: EXT_COLOR[ext] || '#52546a', flexShrink: 0 }} />;
}

function trimWorkspacePath(filePath, workspacePath) {
  if (!workspacePath || !filePath?.startsWith(workspacePath)) return filePath;
  return filePath.slice(workspacePath.length).replace(/^[\\/]/, '');
}

/* ── Detect @query at cursorPos ── */
function getAtInfo(value, cursorPos) {
  const before = value.slice(0, cursorPos);
  const m = before.match(/@([\w./\-\\]*)$/);
  if (!m) return null;
  return { query: m[1], start: cursorPos - m[0].length, end: cursorPos };
}

/* ── Detect /command at cursorPos ── */
function getSlashInfo(value, cursorPos) {
  const before = value.slice(0, cursorPos);
  const m = before.match(/(^|\s)(\/\w*)$/);
  if (!m) return null;
  const slash = m[2];
  return { query: slash, start: before.lastIndexOf(slash), end: cursorPos };
}

/* ═══════════════════════════════════════════════════ */
export default function ComposerOverlay({ value, cursorPos, onChange, onDismiss }) {
  const [activeCmd, setActiveCmd] = useState(null);
  const [selIdx, setSelIdx] = useState(0);

  const tree = useFileStore((s) => s.tree);
  const workspacePath = useFileStore((s) => s.workspacePath);
  const allMentions = useMemo(() => flattenTree(tree), [tree]);

  /* Active detection */
  const atInfo    = activeCmd ? null : getAtInfo(value, cursorPos);
  const slashInfo = activeCmd ? null : (atInfo ? null : getSlashInfo(value, cursorPos));

  const filteredMentions = useMemo(() => {
    if (!atInfo) return [];
    const q = atInfo.query.toLowerCase();
    return allMentions
      .filter((item) => item.name.toLowerCase().includes(q) || item.path.toLowerCase().includes(q))
      .slice(0, 12);
  }, [atInfo, allMentions]);

  const filteredCmds = useMemo(() => {
    if (!slashInfo) return [];
    const q = slashInfo.query.slice(1).toLowerCase();
    return SLASH_CMDS.filter((c) => c.id.startsWith(q));
  }, [slashInfo]);

  const isOpen = !!atInfo || !!slashInfo || !!activeCmd;

  /* Reset selection when list changes */
  useEffect(() => setSelIdx(0), [filteredMentions.length, filteredCmds.length]);

  /* Keyboard nav via capture on document */
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e) => {
      const list = atInfo ? filteredMentions : filteredCmds;
      if (e.key === 'ArrowDown') { e.preventDefault(); e.stopPropagation(); setSelIdx((i) => Math.min(i + 1, list.length - 1)); }
      if (e.key === 'ArrowUp')   { e.preventDefault(); e.stopPropagation(); setSelIdx((i) => Math.max(i - 1, 0)); }
      if (e.key === 'Escape')    { e.preventDefault(); e.stopPropagation(); dismiss(); }
      if (e.key === 'Enter' && !e.shiftKey && !activeCmd) {
        if (atInfo && filteredMentions[selIdx]) { e.preventDefault(); e.stopPropagation(); selectMention(filteredMentions[selIdx]); }
        if (slashInfo && filteredCmds[selIdx])  { e.preventDefault(); e.stopPropagation(); selectCmd(filteredCmds[selIdx]); }
      }
    };
    window.addEventListener('keydown', handler, true);
    return () => window.removeEventListener('keydown', handler, true);
  });  // intentionally no deps — always fresh closures

  const dismiss = () => { setActiveCmd(null); onDismiss?.(); };

  const selectMention = (item) => {
    if (!atInfo) return;
    const before = value.slice(0, atInfo.start);
    const after  = value.slice(atInfo.end);
    onChange(before + `@[${item.name}]` + ' ' + after);
  };

  const selectCmd = (cmd) => {
    setActiveCmd(cmd.id);
    if (slashInfo) onChange(value.slice(0, slashInfo.start) + value.slice(slashInfo.end));
  };

  if (!isOpen) return null;

  return (
    <div style={{ position: 'absolute', bottom: '100%', left: 0, right: 0, zIndex: 300, padding: '0 0 6px', pointerEvents: 'auto' }}>
      {atInfo && !activeCmd && (
        <MentionPicker items={filteredMentions} query={atInfo.query} workspacePath={workspacePath} selIdx={selIdx} setSelIdx={setSelIdx} onSelect={selectMention} onDismiss={dismiss} />
      )}
      {slashInfo && !activeCmd && (
        <SlashPicker cmds={filteredCmds} selIdx={selIdx} setSelIdx={setSelIdx} onSelect={selectCmd} onDismiss={dismiss} />
      )}
      {activeCmd === 'skillcreator' && <SkillCreatorForm onDone={dismiss} />}
      {activeCmd === 'toolcreator'  && <ToolCreatorForm  onDone={dismiss} />}
    </div>
  );
}

/* ── Mention Picker ── */
function MentionPicker({ items, query, workspacePath, selIdx, setSelIdx, onSelect, onDismiss }) {
  const refs = useRef([]);
  useEffect(() => refs.current[selIdx]?.scrollIntoView({ block: 'nearest' }), [selIdx]);

  return (
    <div style={{ borderRadius: 10, overflow: 'hidden', background: '#13141a', border: '1px solid rgba(255,255,255,0.1)', boxShadow: '0 -12px 40px rgba(0,0,0,0.6)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '6px 12px', borderBottom: '1px solid rgba(255,255,255,0.05)', background: 'rgba(96,165,250,0.06)' }}>
        <Search size={10} style={{ color: '#60a5fa' }} />
        <span style={{ fontSize: 10, fontWeight: 700, color: '#60a5fa', textTransform: 'uppercase', letterSpacing: '.07em' }}>Mention file</span>
        {query && <code style={{ fontSize: 10, color: '#52546a' }}>@{query}</code>}
        <span style={{ marginLeft: 'auto', fontSize: 9, color: '#3a3c4e' }}>↑↓ · ↵ select · Esc</span>
      </div>
      <div style={{ maxHeight: 220, overflowY: 'auto' }}>
        {items.length === 0
          ? <div style={{ padding: '14px', fontSize: 11, color: '#52546a', textAlign: 'center' }}>{query ? `No paths matching "${query}"` : 'No files or folders in workspace'}</div>
          : items.map((item, i) => (
            <button key={item.path} ref={(el) => (refs.current[i] = el)} onMouseDown={(e) => { e.preventDefault(); onSelect(item); }}
              onMouseEnter={() => setSelIdx(i)}
              style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px', background: i === selIdx ? 'rgba(96,165,250,0.1)' : 'none', border: 'none', cursor: 'pointer', textAlign: 'left', borderLeft: `2px solid ${i === selIdx ? '#60a5fa' : 'transparent'}` }}>
              <MentionIcon item={item} />
              <span style={{ fontSize: 12, color: i === selIdx ? '#e2e4ea' : '#c8cad4', fontWeight: i === selIdx ? 600 : 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</span>
              <span style={{ fontSize: 10, color: '#3a3c4e', marginLeft: 'auto', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 220, direction: 'rtl', flexShrink: 0 }}>{item.type === 'directory' ? 'folder' : 'file'}</span>
            </button>
          ))
        }
      </div>
    </div>
  );
}

/* ── Slash Picker ── */
function SlashPicker({ cmds, selIdx, setSelIdx, onSelect, onDismiss }) {
  return (
    <div style={{ borderRadius: 10, overflow: 'hidden', background: '#13141a', border: '1px solid rgba(255,255,255,0.1)', boxShadow: '0 -12px 40px rgba(0,0,0,0.6)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '6px 12px', borderBottom: '1px solid rgba(255,255,255,0.05)', background: 'rgba(124,109,240,0.06)' }}>
        <span style={{ fontSize: 10, fontWeight: 700, color: '#7c6df0', textTransform: 'uppercase', letterSpacing: '.07em' }}>Commands</span>
        <span style={{ marginLeft: 'auto', fontSize: 9, color: '#3a3c4e' }}>↑↓ · ↵ select · Esc</span>
      </div>
      {cmds.length === 0 && <div style={{ padding: '12px 14px', fontSize: 11, color: '#52546a' }}>No matching commands</div>}
      {cmds.map((cmd, i) => {
        const Icon = cmd.icon;
        return (
          <button key={cmd.id} onMouseDown={(e) => { e.preventDefault(); onSelect(cmd); }} onMouseEnter={() => setSelIdx(i)}
            style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '9px 14px', background: i === selIdx ? 'rgba(124,109,240,0.1)' : 'none', border: 'none', cursor: 'pointer', textAlign: 'left', borderLeft: `2px solid ${i === selIdx ? '#7c6df0' : 'transparent'}` }}>
            <div style={{ width: 26, height: 26, borderRadius: 7, display: 'flex', alignItems: 'center', justifyContent: 'center', background: `${cmd.color}18`, border: `1px solid ${cmd.color}28`, flexShrink: 0 }}>
              <Icon size={12} style={{ color: cmd.color }} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#c4b5fd', fontFamily: 'monospace' }}>{cmd.label}</div>
              <div style={{ fontSize: 10, color: '#52546a', marginTop: 1 }}>{cmd.desc}</div>
            </div>
            <ChevronRight size={12} style={{ color: '#52546a' }} />
          </button>
        );
      })}
    </div>
  );
}

/* ── Skill Creator ── */
function SkillCreatorForm({ onDone }) {
  const addSkill = useSkillsStore((s) => s.addSkill);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [prompt, setPrompt] = useState('');
  const [saved, setSaved] = useState(false);
  const ref = useRef(null);
  useEffect(() => ref.current?.focus(), []);

  const valid = name.trim() && prompt.trim();
  const save = () => {
    if (!valid) return;
    addSkill({ name: name.trim(), description: description.trim(), prompt: prompt.trim() });
    setSaved(true); setTimeout(onDone, 900);
  };

  return (
    <FormShell icon={<BookOpen size={13} style={{ color: '#a78bfa' }} />} title="Create Skill"
      subtitle="Saved as a reusable prompt template" accent="#a78bfa" onDismiss={onDone} saved={saved}>
      <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
        <input ref={ref} value={name} onChange={(e) => setName(e.target.value)} placeholder="Skill name *" style={{ ...IS, flex: 1 }} onKeyDown={(e) => e.stopPropagation()} />
        <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Short description" style={{ ...IS, flex: 1.5 }} onKeyDown={(e) => e.stopPropagation()} />
      </div>
      <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)}
        placeholder="Prompt — use {{selection}} for code, {{file}} for current file..."
        rows={3} style={{ ...IS, resize: 'vertical', width: '100%', boxSizing: 'border-box', marginBottom: 10 }}
        onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) save(); e.stopPropagation(); }} />
      <SaveRow valid={valid} onSave={save} onCancel={onDone} hint="⌘↵ to save" />
    </FormShell>
  );
}

/* ── Tool Creator ── */
function ToolCreatorForm({ onDone }) {
  const addTool = useSkillsStore((s) => s.addTool);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [command, setCommand] = useState('');
  const [saved, setSaved] = useState(false);
  const ref = useRef(null);
  useEffect(() => ref.current?.focus(), []);

  const valid = name.trim() && command.trim();
  const save = () => {
    if (!valid) return;
    addTool({ name: name.trim(), description: description.trim(), command: command.trim() });
    setSaved(true); setTimeout(onDone, 900);
  };

  return (
    <FormShell icon={<Zap size={13} style={{ color: '#f59e0b' }} />} title="Create Tool"
      subtitle="Injected into JARVIS's system prompt as a callable command" accent="#f59e0b" onDismiss={onDone} saved={saved}>
      <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
        <input ref={ref} value={name} onChange={(e) => setName(e.target.value)} placeholder="Tool name *" style={{ ...IS, flex: 1 }} onKeyDown={(e) => e.stopPropagation()} />
        <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Description (shown to model)" style={{ ...IS, flex: 2 }} onKeyDown={(e) => e.stopPropagation()} />
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <Terminal size={12} style={{ color: '#52546a', flexShrink: 0 }} />
        <input value={command} onChange={(e) => setCommand(e.target.value)} placeholder="npm test -- {{args}}" style={{ ...IS, flex: 1 }}
          onKeyDown={(e) => { if (e.key === 'Enter') save(); e.stopPropagation(); }} />
      </div>
      <SaveRow valid={valid} onSave={save} onCancel={onDone} hint="↵ to save" />
    </FormShell>
  );
}

/* ── Shared shell ── */
function FormShell({ icon, title, subtitle, accent, onDismiss, saved, children }) {
  return (
    <div style={{ borderRadius: 12, overflow: 'hidden', background: '#13141a', border: `1px solid ${accent}35`, boxShadow: `0 -12px 40px rgba(0,0,0,0.65)` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderBottom: '1px solid rgba(255,255,255,0.05)', background: `${accent}08` }}>
        <div style={{ width: 28, height: 28, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', background: `${accent}18`, border: `1px solid ${accent}28` }}>{icon}</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#e2e4ea' }}>{title}</div>
          <div style={{ fontSize: 10, color: '#52546a', marginTop: 1 }}>{subtitle}</div>
        </div>
        {saved
          ? <span style={{ fontSize: 11, fontWeight: 600, color: '#4ade80', display: 'flex', alignItems: 'center', gap: 4 }}><Check size={12} /> Saved!</span>
          : <button onClick={onDismiss} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#52546a', display: 'flex', padding: 4 }}
              onMouseEnter={(e) => e.currentTarget.style.color = '#e2e4ea'}
              onMouseLeave={(e) => e.currentTarget.style.color = '#52546a'}><X size={13} /></button>
        }
      </div>
      <div style={{ padding: '12px 14px 14px' }}>{children}</div>
    </div>
  );
}

function SaveRow({ valid, onSave, onCancel, hint }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 6 }}>
      {hint && <span style={{ fontSize: 10, color: '#3a3c4e', marginRight: 'auto' }}>{hint}</span>}
      <button onClick={onCancel} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '5px 12px', borderRadius: 6, fontSize: 11, fontWeight: 600, background: 'rgba(255,255,255,0.04)', color: '#52546a', border: '1px solid rgba(255,255,255,0.06)', cursor: 'pointer' }}>
        <X size={11} /> Cancel
      </button>
      <button onClick={onSave} disabled={!valid} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '5px 14px', borderRadius: 6, fontSize: 11, fontWeight: 600, background: valid ? 'rgba(74,222,128,0.14)' : 'rgba(255,255,255,0.04)', color: valid ? '#4ade80' : '#3a3c4e', border: `1px solid ${valid ? 'rgba(74,222,128,0.25)' : 'rgba(255,255,255,0.06)'}`, cursor: valid ? 'pointer' : 'not-allowed', transition: 'all .15s' }}>
        <Check size={11} /> Save
      </button>
    </div>
  );
}

const IS = { borderRadius: 7, border: '1px solid rgba(255,255,255,0.08)', background: '#07070a', color: '#e4e4ea', fontSize: 12, padding: '6px 10px', outline: 'none' };
