import { useState, useRef, useEffect } from 'react';
import { Trash2, ChevronDown, Plus, TerminalSquare } from 'lucide-react';
import useTerminalStore from '../stores/terminalStore';
import useFileStore from '../stores/fileStore';

function promptLabel(path) {
  const name = path ? path.split(/[/\\]/).pop() : 'local';
  return `PS ${name}>`;
}

export default function TerminalPanel({ backendUrl }) {
  const { lines, isRunning, runCommand, clearLines } = useTerminalStore();
  const workspacePath = useFileStore((s) => s.workspacePath);
  const [input, setInput] = useState('');
  const [history, setHistory] = useState([]);
  const [historyIdx, setHistoryIdx] = useState(-1);
  const scrollRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [lines, input]);

  const submit = (cmd) => {
    const trimmed = cmd.trim();
    if (!trimmed || isRunning) return;
    setHistory((h) => [trimmed, ...h].slice(0, 50));
    setHistoryIdx(-1);
    setInput('');
    runCommand(backendUrl, trimmed, workspacePath || undefined);
  };

  const handleChange = (e) => {
    setInput(e.target.value);
    setHistoryIdx(-1);
  };

  const handleKey = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      submit(input);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (history.length === 0) return;
      const nextIdx = historyIdx < history.length - 1 ? historyIdx + 1 : historyIdx;
      setHistoryIdx(nextIdx);
      setInput(history[nextIdx] || '');
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (historyIdx <= 0) {
        setHistoryIdx(-1);
        setInput('');
      } else {
        const nextIdx = historyIdx - 1;
        setHistoryIdx(nextIdx);
        setInput(history[nextIdx] || '');
      }
    } else if (e.key === 'l' && e.ctrlKey) {
      e.preventDefault();
      clearLines();
    }
  };

  const prompt = promptLabel(workspacePath);

  return (
    <div
      className="flex flex-col h-full"
      onClick={() => inputRef.current?.focus()}
      onFocus={() => {}}
      tabIndex={-1}
      style={{ background: '#0a0c0f', outline: 'none' }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 10px', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
        <div className="terminal-shell-row" style={{ padding: 0 }}>
          <TerminalSquare size={12} />
          <span>powershell</span>
          <ChevronDown size={11} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <button title="New terminal"
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 24, height: 24, borderRadius: 5, color: '#52546a', transition: 'all .12s' }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; e.currentTarget.style.color = '#8b8d99'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#52546a'; }}
          >
            <Plus size={12} />
          </button>
          <button onClick={clearLines} title="Clear"
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 24, height: 24, borderRadius: 5, color: '#52546a', transition: 'all .12s' }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; e.currentTarget.style.color = '#8b8d99'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#52546a'; }}
          >
            <Trash2 size={12} />
          </button>
        </div>
      </div>

      {/* Output area */}
      <div
        ref={scrollRef}
        style={{ flex: 1, overflowY: 'auto', padding: '8px 14px 0', fontFamily: 'var(--font-mono)', fontSize: 11.5, lineHeight: 1.6 }}
      >
        {lines.length === 0 && !isRunning && (
          <div style={{ color: '#52546a', marginBottom: 4 }}>
            PowerShell {workspacePath || 'C:\\'}
            <span style={{ display: 'block', color: '#3a3c4e', fontSize: 10, marginTop: 2 }}>
              Type commands below. Use ↑↓ for history, Ctrl+L to clear.
            </span>
          </div>
        )}

        {lines.map((line, i) => (
          <div key={i} style={{
            color: line.type === 'input' ? '#c8cad4' : line.type === 'error' ? '#f87171' : '#8b8d99',
            lineHeight: 1.6, whiteSpace: 'pre-wrap', wordBreak: 'break-all',
          }}>
            {line.type === 'input' ? (
              <><span style={{ color: '#7c6df0' }}>{prompt}</span> {line.content}</>
            ) : line.content}
          </div>
        ))}

        {isRunning && (
          <div style={{ color: '#52546a', animation: 'blink .8s step-end infinite' }}>▋</div>
        )}
      </div>

      {/* Input row — always at bottom */}
      <div style={{ display: 'flex', alignItems: 'center', padding: '4px 14px 10px', fontFamily: 'var(--font-mono)', fontSize: 11.5 }}>
        <span style={{ color: '#7c6df0', flexShrink: 0, marginRight: 6 }}>{prompt}</span>
        <input
          ref={inputRef}
          value={input}
          onChange={handleChange}
          onKeyDown={handleKey}
          disabled={isRunning}
          autoFocus
          spellCheck={false}
          autoComplete="off"
          style={{
            flex: 1, background: 'transparent', border: 'none', outline: 'none',
            color: '#e2e4ea', fontFamily: 'inherit', fontSize: 'inherit',
            caretColor: '#7c6df0', padding: 0, margin: 0,
          }}
        />
      </div>
    </div>
  );
}
