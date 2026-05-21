/**
 * SelfImprovementTab — JARVIS analyzes its own conversations and proposes
 * improvements to its instructions, skills, and memory.
 *
 * Workflow:
 *   1. User clicks "Run Analysis"
 *   2. Backend gathers recent conversations + current state
 *   3. Model analyzes and returns proposals
 *   4. User reviews and applies each proposal individually
 *   5. History of past runs is shown below
 */
import { useEffect, useRef, useState } from 'react';
import { Sparkles, CheckCircle, XCircle, Brain, Wand2, FileText, Clock, Star, Loader2, AlertCircle, ChevronDown, ChevronRight } from 'lucide-react';

function ScoreBadge({ score }) {
  const color = score >= 8 ? '#4ade80' : score >= 5 ? '#fbbf24' : '#f87171';
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 3,
      padding: '2px 7px', borderRadius: 5, fontSize: 10, fontWeight: 700,
      background: `${color}18`, border: `1px solid ${color}44`, color,
    }}>
      <Star size={9} /> {score}/10
    </span>
  );
}

function ProposalCard({ icon: Icon, title, content, onApply, applied, color = '#22d3ee' }) {
  return (
    <div style={{
      padding: '10px 12px', borderRadius: 9,
      background: 'rgba(255,255,255,0.02)',
      border: `1px solid ${applied ? 'rgba(74,222,128,0.3)' : 'rgba(255,255,255,0.06)'}`,
      transition: 'border-color .15s',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 6 }}>
        <Icon size={12} style={{ color }} />
        <span style={{ fontSize: 11, fontWeight: 600, color: '#c8cad4' }}>{title}</span>
        <div style={{ flex: 1 }} />
        {applied ? (
          <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: '#4ade80' }}>
            <CheckCircle size={11} /> Applied
          </span>
        ) : (
          <button onClick={onApply} style={{
            display: 'flex', alignItems: 'center', gap: 4,
            height: 24, padding: '0 9px', borderRadius: 5,
            background: `${color}18`, color,
            border: `1px solid ${color}33`,
            cursor: 'pointer', fontSize: 10, fontWeight: 600,
          }}>
            Apply
          </button>
        )}
      </div>
      <pre style={{
        margin: 0, fontSize: 11, color: '#9ca3af', lineHeight: 1.6,
        whiteSpace: 'pre-wrap', wordBreak: 'break-word',
        fontFamily: 'var(--font-mono)',
      }}>
        {content}
      </pre>
    </div>
  );
}

function HistoryItem({ run }) {
  const [open, setOpen] = useState(false);
  const d = new Date(run.ts);
  const dateStr = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + ' ' +
    d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });

  return (
    <div style={{
      borderRadius: 8, overflow: 'hidden',
      border: '1px solid rgba(255,255,255,0.05)',
      background: 'rgba(0,0,0,0.2)',
    }}>
      <button
        onClick={() => setOpen(!open)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 8,
          padding: '8px 12px', background: 'transparent', border: 'none',
          cursor: 'pointer', textAlign: 'left',
        }}
      >
        {open ? <ChevronDown size={11} style={{ color: '#5e6370' }} /> : <ChevronRight size={11} style={{ color: '#5e6370' }} />}
        <span style={{ fontSize: 11, color: '#c8cad4', flex: 1 }}>{run.summary || 'Analysis run'}</span>
        {run.score && <ScoreBadge score={run.score} />}
        <span style={{ fontSize: 9.5, color: '#5e6370', display: 'flex', alignItems: 'center', gap: 3 }}>
          <Clock size={9} /> {dateStr}
        </span>
      </button>
      {open && (
        <div style={{ padding: '0 12px 10px', borderTop: '1px solid rgba(255,255,255,0.04)' }}>
          {run.instructionPatch && (
            <div style={{ marginTop: 8 }}>
              <div style={{ fontSize: 9, fontWeight: 700, color: '#5e6370', letterSpacing: '.06em', textTransform: 'uppercase', marginBottom: 4 }}>Instruction patch</div>
              <pre style={{ margin: 0, fontSize: 10.5, color: '#9ca3af', whiteSpace: 'pre-wrap', fontFamily: 'var(--font-mono)' }}>{run.instructionPatch}</pre>
            </div>
          )}
          {run.newMemories?.length > 0 && (
            <div style={{ marginTop: 8 }}>
              <div style={{ fontSize: 9, fontWeight: 700, color: '#5e6370', letterSpacing: '.06em', textTransform: 'uppercase', marginBottom: 4 }}>New memories ({run.newMemories.length})</div>
              {run.newMemories.map((m, i) => (
                <div key={i} style={{ fontSize: 10.5, color: '#9ca3af', marginBottom: 2 }}>— {m.content}</div>
              ))}
            </div>
          )}
          {run.newSkills?.length > 0 && (
            <div style={{ marginTop: 8 }}>
              <div style={{ fontSize: 9, fontWeight: 700, color: '#5e6370', letterSpacing: '.06em', textTransform: 'uppercase', marginBottom: 4 }}>Proposed skills ({run.newSkills.length})</div>
              {run.newSkills.map((s, i) => (
                <div key={i} style={{ fontSize: 10.5, color: '#9ca3af', marginBottom: 2 }}>— {s.name}: <code style={{ color: '#c4b5fd' }}>{s.command}</code></div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function SelfImprovementTab({ backendUrl }) {
  const [running, setRunning]     = useState(false);
  const [status, setStatus]       = useState('');
  const [error, setError]         = useState('');
  const [analysis, setAnalysis]   = useState(null);
  const [history, setHistory]     = useState([]);
  const [applied, setApplied]     = useState({});
  const abortRef = useRef(null);

  const loadHistory = async () => {
    try {
      const r = await fetch(`${backendUrl}/api/improve/history`);
      const d = await r.json();
      setHistory(d.history || []);
    } catch {}
  };

  useEffect(() => { loadHistory(); }, [backendUrl]);

  const runAnalysis = async () => {
    setRunning(true); setError(''); setStatus('Starting…'); setAnalysis(null); setApplied({});
    abortRef.current = new AbortController();

    try {
      const res = await fetch(`${backendUrl}/api/improve/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ backendUrl }),
        signal: abortRef.current.signal,
      });

      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop();
        for (const line of lines) {
          if (line.startsWith('event: ')) {
            // handled by next data line
          } else if (line.startsWith('data: ')) {
            try {
              const payload = JSON.parse(line.slice(6));
              if (payload.message) setStatus(payload.message);
              if (payload.summary) { setAnalysis(payload); setStatus('Analysis complete'); }
              if (payload.run)     { setAnalysis(payload.run); setStatus('Done'); loadHistory(); }
              if (payload.message && line.includes('"error"')) setError(payload.message);
            } catch {}
          }
        }
      }
    } catch (e) {
      if (e?.name !== 'AbortError') setError(e.message);
    } finally {
      setRunning(false);
    }
  };

  const applyChange = async (type, data, key) => {
    try {
      const r = await fetch(`${backendUrl}/api/improve/apply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, data }),
      });
      if (!r.ok) throw new Error((await r.json()).error);
      setApplied((a) => ({ ...a, [key]: true }));
    } catch (e) {
      setError(`Apply failed: ${e.message}`);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 12 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <Sparkles size={14} style={{ color: '#a78bfa', marginTop: 1 }} />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#c8cad4' }}>Self-Improvement</div>
          <div style={{ fontSize: 10, color: '#52546a', marginTop: 1, lineHeight: 1.4 }}>
            JARVIS analyzes recent conversations and proposes improvements to its instructions, skills, and memory. You review and apply each change.
          </div>
        </div>
        <button
          onClick={running ? () => abortRef.current?.abort() : runAnalysis}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            height: 30, padding: '0 14px', borderRadius: 7,
            background: running ? 'rgba(248,113,113,0.1)' : 'rgba(167,139,250,0.12)',
            color: running ? '#f87171' : '#c4b5fd',
            border: running ? '1px solid rgba(248,113,113,0.25)' : '1px solid rgba(167,139,250,0.25)',
            cursor: 'pointer', fontSize: 11, fontWeight: 600,
            flexShrink: 0,
          }}
        >
          {running
            ? <><XCircle size={12} /> Cancel</>
            : <><Sparkles size={12} /> Run Analysis</>}
        </button>
      </div>

      {/* Status */}
      {(running || status) && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '8px 12px', borderRadius: 8,
          background: 'rgba(167,139,250,0.06)',
          border: '1px solid rgba(167,139,250,0.15)',
          fontSize: 11, color: '#c4b5fd',
        }}>
          {running && <Loader2 size={12} style={{ animation: 'spin 1s linear infinite', flexShrink: 0 }} />}
          {status}
        </div>
      )}

      {error && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '8px 12px', borderRadius: 8, fontSize: 11,
          background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.2)',
          color: '#fca5a5',
        }}>
          <AlertCircle size={12} /> {error}
        </div>
      )}

      {/* Analysis results */}
      {analysis && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: '#c8cad4' }}>Analysis Results</span>
            {analysis.score && <ScoreBadge score={analysis.score} />}
          </div>
          {analysis.summary && (
            <div style={{ fontSize: 11, color: '#9ca3af', fontStyle: 'italic', padding: '6px 10px', borderRadius: 7, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
              "{analysis.summary}"
            </div>
          )}

          {analysis.instructionPatch && (
            <ProposalCard
              icon={FileText}
              title="Instruction improvement"
              content={analysis.instructionPatch}
              color="#22d3ee"
              applied={!!applied['instructions']}
              onApply={() => applyChange('instructions', { patch: analysis.instructionPatch }, 'instructions')}
            />
          )}

          {(analysis.newSkills || []).map((skill, i) => (
            <ProposalCard
              key={i}
              icon={Wand2}
              title={`New skill: ${skill.name}`}
              content={`${skill.description}\n\nCommand: ${skill.command}`}
              color="#fbbf24"
              applied={!!applied[`skill_${i}`]}
              onApply={() => applyChange('skill', skill, `skill_${i}`)}
            />
          ))}

          {(analysis.newMemories || []).length > 0 && (
            <div style={{
              padding: '8px 12px', borderRadius: 9,
              background: 'rgba(74,222,128,0.04)',
              border: '1px solid rgba(74,222,128,0.2)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                <Brain size={12} style={{ color: '#4ade80' }} />
                <span style={{ fontSize: 11, fontWeight: 600, color: '#c8cad4' }}>
                  {analysis.newMemories.length} memor{analysis.newMemories.length !== 1 ? 'ies' : 'y'} auto-saved
                </span>
                <CheckCircle size={11} style={{ color: '#4ade80', marginLeft: 4 }} />
              </div>
              {analysis.newMemories.map((m, i) => (
                <div key={i} style={{ fontSize: 11, color: '#9ca3af', marginBottom: 2 }}>— {m.content}</div>
              ))}
            </div>
          )}

          {!analysis.instructionPatch && !(analysis.newSkills?.length) && !(analysis.newMemories?.length) && (
            <div style={{ fontSize: 11, color: '#52546a', textAlign: 'center', padding: '12px 0' }}>
              No improvements needed — JARVIS is performing well.
            </div>
          )}
        </div>
      )}

      {/* History */}
      {history.length > 0 && (
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
          <div style={{ fontSize: 9, fontWeight: 700, color: '#5e6370', letterSpacing: '.06em', textTransform: 'uppercase', marginBottom: 8 }}>
            Past runs ({history.length})
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {history.map((run, i) => <HistoryItem key={i} run={run} />)}
          </div>
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
