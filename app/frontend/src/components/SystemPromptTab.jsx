import { useEffect, useState } from 'react';
import { RotateCcw, Save, AlertCircle, ChevronDown, ChevronRight } from 'lucide-react';

const DEFAULT_PERSONA = `You are J.A.R.V.I.S. — Just A Rather Very Intelligent System. You are the user's personal AI assistant. Address them as "sir".

PERSONA
- British wit. Calm, dry, unflappable.
- Loyal, direct, proactive. No filler, no padding.
- Concise: brevity > completeness for casual chat.

RESPONSE LENGTH
- Greetings ("hi", "hello", "good morning") → ONE short line. e.g. "Good morning, sir." Do not elaborate.
- Simple factual questions → one sentence answer.
- Tool-using tasks → call the tool first, then a brief one-line confirmation.
- Long technical explanations only when explicitly asked.

DO NOT
- Pre-think out loud unless the user asked you to reason.
- List options, caveats, or "let me know if..." footers on simple replies.
- Use phrases like "Certainly!", "Great question!", "As an AI...", "I'd be happy to help".
- Apologise unnecessarily.
- Say "I don't have access to real-time information" — you have runTerminal. Use it.

WHEN TO USE TOOLS
- ANY request that involves files, the workspace, the terminal, the web, or memory → call the matching tool BEFORE responding.
- For time/date: {"tool":"runTerminal","args":{"command":"date"}}
- For opening apps (Windows): {"tool":"runTerminal","args":{"command":"start notepad.exe"}}
- For closing apps: {"tool":"runTerminal","args":{"command":"taskkill /IM notepad.exe /F"}}
- NEVER say "I don't have access" — you have runTerminal. Use it.

EXAMPLES
User: "hi"           → "Good evening, sir."
User: "what's 2+2?"  → "Four, sir."
User: "what time is it" → call runTerminal with "date", then report the result.
User: "remember my name is Benz" → call rememberFact, then "Noted, sir."
User: "thanks"       → "Of course, sir."`;

export default function SystemPromptTab({ backendUrl }) {
  const [persona, setPersona]           = useState('');
  const [instructions, setInstructions] = useState('');
  const [personaStatus, setPersonaStatus]   = useState('idle');
  const [instrStatus, setInstrStatus]       = useState('idle');
  const [errorMsg, setErrorMsg]         = useState('');
  const [loading, setLoading]           = useState(true);
  const [personaOpen, setPersonaOpen]   = useState(false);

  useEffect(() => {
    if (!backendUrl) { setLoading(false); return; }
    setLoading(true);
    Promise.all([
      fetch(`${backendUrl}/api/settings/system-prompt`, { signal: AbortSignal.timeout(8000) })
        .then((r) => r.json()).then((d) => d.instructions || '').catch(() => ''),
      fetch(`${backendUrl}/api/settings/persona`, { signal: AbortSignal.timeout(8000) })
        .then((r) => r.json()).then((d) => d.persona || '').catch(() => ''),
    ]).then(([instr, pers]) => {
      setInstructions(instr);
      setPersona(pers);
      setLoading(false);
    });
  }, [backendUrl]);

  const savePersona = async () => {
    setPersonaStatus('saving'); setErrorMsg('');
    try {
      const res = await fetch(`${backendUrl}/api/settings/persona`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ persona }),
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) throw new Error(`POST ${res.status}`);
      setPersonaStatus('saved');
      setTimeout(() => setPersonaStatus('idle'), 2000);
    } catch (err) {
      setPersonaStatus('error'); setErrorMsg(`Save failed: ${err.message}`);
    }
  };

  const resetPersona = async () => {
    setPersona('');
    setPersonaStatus('saving'); setErrorMsg('');
    try {
      await fetch(`${backendUrl}/api/settings/persona`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ persona: '' }),
        signal: AbortSignal.timeout(8000),
      });
      setPersonaStatus('saved');
      setTimeout(() => setPersonaStatus('idle'), 2000);
    } catch (err) {
      setPersonaStatus('error'); setErrorMsg(`Reset failed: ${err.message}`);
    }
  };

  const saveInstructions = async () => {
    setInstrStatus('saving'); setErrorMsg('');
    try {
      const res = await fetch(`${backendUrl}/api/settings/system-prompt`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ instructions }),
        signal: AbortSignal.timeout(8000),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || `POST ${res.status}`);
      setInstrStatus('saved');
      setTimeout(() => setInstrStatus('idle'), 2000);
    } catch (err) {
      setInstrStatus('error'); setErrorMsg(`Save failed: ${err.message}`);
    }
  };

  if (loading) return <div style={{ padding: 20, fontSize: 12, color: '#52546a' }}>Loading…</div>;

  return (
    <div style={{ padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: 16, height: '100%' }}>
      {errorMsg && (
        <div style={{
          padding: '8px 12px', borderRadius: 8,
          background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)',
          display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: '#fca5a5',
        }}>
          <AlertCircle size={13} /> {errorMsg}
        </div>
      )}

      {/* ── JARVIS Persona ── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <button
          onClick={() => setPersonaOpen(!personaOpen)}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            background: 'none', border: 'none', cursor: 'pointer', padding: 0, textAlign: 'left',
          }}
        >
          {personaOpen ? <ChevronDown size={13} style={{ color: '#5e6370' }} /> : <ChevronRight size={13} style={{ color: '#5e6370' }} />}
          <div>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#c8cad4' }}>JARVIS Persona</div>
            <div style={{ fontSize: 10, color: '#52546a', marginTop: 1 }}>
              {persona.trim() ? 'Custom persona active' : 'Using built-in JARVIS persona'} · Click to {personaOpen ? 'collapse' : 'edit'}
            </div>
          </div>
          <div style={{ flex: 1 }} />
          {personaStatus === 'saving' && <span style={{ fontSize: 10, color: '#fbbf24' }}>Saving…</span>}
          {personaStatus === 'saved'  && <span style={{ fontSize: 10, color: '#4ade80' }}>Saved</span>}
        </button>

        {personaOpen && (
          <>
            <div style={{
              padding: '8px 12px', borderRadius: 8,
              background: 'rgba(167,139,250,0.06)', border: '1px solid rgba(167,139,250,0.12)',
              fontSize: 10.5, color: '#9898b4', lineHeight: 1.5,
            }}>
              Edit the full JARVIS persona here. Leave blank to use the built-in default. Changes take effect on the next message.
            </div>
            <textarea
              value={persona || DEFAULT_PERSONA}
              onChange={(e) => setPersona(e.target.value === DEFAULT_PERSONA ? '' : e.target.value)}
              spellCheck={false}
              style={{
                width: '100%', height: 280, resize: 'vertical',
                padding: '12px 14px', borderRadius: 9,
                background: '#07070a', color: '#c8cad4',
                border: '1px solid rgba(255,255,255,0.07)',
                fontSize: 11, fontFamily: 'SFMono-Regular, Consolas, monospace',
                lineHeight: 1.6, outline: 'none', boxSizing: 'border-box',
              }}
            />
            <div style={{ display: 'flex', gap: 6 }}>
              <button onClick={savePersona} disabled={personaStatus === 'saving'} style={saveBtn}>
                <Save size={11} /> {personaStatus === 'saving' ? 'Saving…' : 'Save Persona'}
              </button>
              <button onClick={resetPersona} style={clearBtn} title="Reset to built-in JARVIS persona">
                <RotateCcw size={11} /> Reset to default
              </button>
            </div>
          </>
        )}
      </div>

      <div style={{ height: 1, background: 'rgba(255,255,255,0.05)' }} />

      {/* ── Additional Instructions ── */}
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, gap: 8, minHeight: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#c8cad4' }}>Additional Instructions</div>
            <div style={{ fontSize: 10, color: '#52546a', marginTop: 1 }}>
              Stacks on top of the persona. Project-specific rules, preferences, etc.
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            {instrStatus === 'saving' && <span style={{ fontSize: 10, color: '#fbbf24' }}>Saving…</span>}
            {instrStatus === 'saved'  && <span style={{ fontSize: 10, color: '#4ade80' }}>Saved</span>}
            <button onClick={() => { setInstructions(''); saveInstructions(); }} style={clearBtn}>
              <RotateCcw size={11} /> Clear
            </button>
            <button onClick={saveInstructions} disabled={instrStatus === 'saving'} style={saveBtn}>
              <Save size={11} /> Save
            </button>
          </div>
        </div>

        <div style={{
          padding: '8px 12px', borderRadius: 8,
          background: 'rgba(124,109,240,0.06)', border: '1px solid rgba(124,109,240,0.12)',
          fontSize: 10.5, color: '#9898b4', lineHeight: 1.5,
        }}>
          The persona and tool definitions are always included. Your instructions below are <strong style={{ color: '#c4b5fd' }}>added on top</strong>.
        </div>

        <textarea
          value={instructions}
          onChange={(e) => { setInstructions(e.target.value); setErrorMsg(''); }}
          placeholder="Add project-specific rules here...

Example:
- Prefer TypeScript over JavaScript.
- Use `fs/promises` not `fs`.
- For our Tauri project, default to Bun for backend tasks."
          spellCheck={false}
          style={{
            flex: 1, width: '100%', minHeight: 120, resize: 'none',
            padding: '12px 14px', borderRadius: 9,
            background: '#07070a', color: '#c8cad4',
            border: '1px solid rgba(255,255,255,0.07)',
            fontSize: 12, fontFamily: 'SFMono-Regular, Consolas, monospace',
            lineHeight: 1.6, outline: 'none', boxSizing: 'border-box',
          }}
        />

        <div style={{ fontSize: 9, color: '#52546a', display: 'flex', gap: 16 }}>
          <span>{instructions.split('\n').length} lines</span>
          <span>{instructions.length} chars</span>
          {instructions && <span style={{ color: '#4ade80' }}>Active</span>}
          {!instructions && <span>Empty — persona only</span>}
        </div>
      </div>
    </div>
  );
}

const saveBtn = {
  display: 'flex', alignItems: 'center', gap: 5,
  height: 30, padding: '0 14px', borderRadius: 7,
  fontSize: 11, fontWeight: 600,
  background: 'rgba(124,109,240,0.14)', color: '#c4b5fd',
  border: '1px solid rgba(124,109,240,0.2)', cursor: 'pointer',
};

const clearBtn = {
  display: 'flex', alignItems: 'center', gap: 5,
  height: 30, padding: '0 12px', borderRadius: 7,
  fontSize: 11, fontWeight: 500,
  background: 'rgba(255,255,255,0.04)', color: '#8b8d99',
  border: '1px solid rgba(255,255,255,0.07)', cursor: 'pointer',
};
