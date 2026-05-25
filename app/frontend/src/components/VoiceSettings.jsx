/**
 * VoiceSettings — STT config + Supertonic TTS preferences.
 */
import { useEffect, useState } from 'react';
import { Check, Loader2, CheckCircle2, XCircle } from 'lucide-react';
import AudioDevicesSettings from './AudioDevicesSettings';

const VOICES = [
  { id: 'M1', label: 'M1 — Male 1' },
  { id: 'M2', label: 'M2 — Male 2' },
  { id: 'M3', label: 'M3 — Male 3' },
  { id: 'M4', label: 'M4 — Male 4' },
  { id: 'M5', label: 'M5 — Male 5' },
  { id: 'F1', label: 'F1 — Female 1' },
  { id: 'F2', label: 'F2 — Female 2' },
  { id: 'F3', label: 'F3 — Female 3' },
  { id: 'F4', label: 'F4 — Female 4' },
  { id: 'F5', label: 'F5 — Female 5' },
];

export default function VoiceSettings({ backendUrl }) {
  const [cfg, setCfg]       = useState(null);
  const [draft, setDraft]   = useState(null);
  const [saving, setSaving] = useState(false);
  const [err, setErr]       = useState('');
  const [saved, setSaved]   = useState(false);
  const [health, setHealth] = useState(null);

  useEffect(() => {
    fetch(`${backendUrl}/api/voice/config`)
      .then((r) => r.json())
      .then((c) => { setCfg(c); setDraft(structuredClone(c)); })
      .catch((e) => setErr(e.message));

    fetch(`${backendUrl}/api/voice/health`)
      .then((r) => r.json())
      .then(setHealth)
      .catch(() => setHealth({ stt: false, tts: false }));
  }, [backendUrl]);

  if (!draft) return <div className="vs-loading">Loading…</div>;

  const setTts = (k, v) => setDraft({ ...draft, tts: { ...draft.tts, [k]: v } });

  const save = async () => {
    setSaving(true); setErr(''); setSaved(false);
    try {
      const res = await fetch(`${backendUrl}/api/voice/config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(draft),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      setCfg(data); setDraft(structuredClone(data));
      setSaved(true); setTimeout(() => setSaved(false), 1500);
    } catch (e) {
      setErr(e.message);
    } finally { setSaving(false); }
  };

  const dirty = JSON.stringify(cfg) !== JSON.stringify(draft);

  return (
    <div className="vs-root">
      <AudioDevicesSettings />

      <div style={{ height: 1, background: 'rgba(255,255,255,0.06)', margin: '10px 0' }} />

      {/* Service status */}
      <div className="vs-section-title">Service Status</div>
      <div style={{ display: 'flex', gap: 10, marginBottom: 4 }}>
        <StatusPill label="STT (Whisper)" ok={health?.stt} />
        <StatusPill label="TTS (Supertonic)" ok={health?.tts} />
      </div>
      {(!health?.stt || !health?.tts) && (
        <div style={{ fontSize: 11, color: '#fbbf24', padding: '6px 10px', borderRadius: 7, background: 'rgba(251,191,36,0.06)', border: '1px solid rgba(251,191,36,0.15)' }}>
          {!health?.tts && (
            <div>⚠️ <strong>Supertonic TTS</strong> is not running — using browser TTS as fallback. Go to <strong>Voice Setup</strong> to install and start it.</div>
          )}
          {!health?.stt && (
            <div>⚠️ <strong>STT (Whisper)</strong> is not running. Go to <strong>Voice Setup</strong> to install and start it.</div>
          )}
        </div>
      )}

      <div style={{ height: 1, background: 'rgba(255,255,255,0.06)', margin: '10px 0' }} />

      {/* Supertonic TTS settings */}
      <div className="vs-section-title">Supertonic TTS</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div className="vs-field">
          <div className="vs-field-label">Voice</div>
          <select value={draft.tts?.voice || 'M1'} onChange={(e) => setTts('voice', e.target.value)}>
            {VOICES.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}
          </select>
        </div>

        <div className="vs-row">
          <div className="vs-field">
            <div className="vs-field-label">Speed (0.7 – 2.0)</div>
            <input
              type="number" step="0.05" min="0.7" max="2.0"
              value={draft.tts?.speed ?? 1.05}
              onChange={(e) => setTts('speed', Number(e.target.value) || 1.05)}
            />
          </div>
          <div className="vs-field">
            <div className="vs-field-label">Language</div>
            <select value={draft.tts?.lang || 'en'} onChange={(e) => setTts('lang', e.target.value)}>
              {[
                ['en','English'],['ko','Korean'],['ja','Japanese'],['fr','French'],
                ['de','German'],['es','Spanish'],['pt','Portuguese'],['it','Italian'],
                ['ru','Russian'],['zh','Chinese'],['ar','Arabic'],['hi','Hindi'],
                ['na','Auto-detect'],
              ].map(([code, label]) => (
                <option key={code} value={code}>{label} ({code})</option>
              ))}
            </select>
          </div>
        </div>

        <TestTTSButton backendUrl={backendUrl} voice={draft.tts?.voice} speed={draft.tts?.speed} lang={draft.tts?.lang} />
      </div>

      {err && <div className="vs-error">{err}</div>}

      <div className="vs-actions">
        <button
          type="button"
          className={`vs-save ${dirty ? '' : 'vs-save-disabled'}`}
          disabled={!dirty || saving}
          onClick={save}
        >
          {saving ? <Loader2 size={12} className="vs-spin" /> : saved ? <Check size={12} /> : null}
          {saved ? 'Saved' : saving ? 'Saving…' : 'Save'}
        </button>
      </div>

      <style>{`
        .vs-root { display: flex; flex-direction: column; gap: 14px; }
        .vs-section-title { font-size: 10px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; color: #5e6370; }
        .vs-field { display: flex; flex-direction: column; gap: 4px; }
        .vs-field-label { font-size: 10px; font-weight: 600; color: #7a7f8a; }
        .vs-field input, .vs-field select {
          height: 30px; padding: 0 10px; border-radius: 7px; font-size: 12px;
          color: #e2e8f0; background: rgba(0,0,0,0.3);
          border: 1px solid rgba(255,255,255,0.06); outline: none; transition: border-color .12s;
        }
        .vs-field input:focus, .vs-field select:focus { border-color: rgba(6,182,212,0.4); }
        .vs-row { display: flex; gap: 8px; }
        .vs-row > * { flex: 1; }
        .vs-error { font-size: 11px; color: #f87171; padding: 8px 10px; border-radius: 7px;
                    background: rgba(248,113,113,0.08); border: 1px solid rgba(248,113,113,0.2); }
        .vs-actions { display: flex; justify-content: flex-end; }
        .vs-save { display: inline-flex; align-items: center; gap: 6px; height: 30px; padding: 0 14px;
                   border-radius: 7px; background: rgba(6,182,212,0.15); color: #67e8f9;
                   border: 1px solid rgba(6,182,212,0.3); cursor: pointer; font-size: 11px; font-weight: 600; }
        .vs-save:hover:not(:disabled) { background: rgba(6,182,212,0.25); }
        .vs-save-disabled, .vs-save:disabled { opacity: .4; cursor: not-allowed; }
        .vs-spin { animation: vs-spin 1s linear infinite; }
        @keyframes vs-spin { to { transform: rotate(360deg); } }
        .vs-loading { font-size: 11px; color: #5e6370; padding: 12px; }
      `}</style>
    </div>
  );
}

function StatusPill({ label, ok }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 6,
      padding: '4px 10px', borderRadius: 6, fontSize: 11,
      background: ok ? 'rgba(52,211,153,0.08)' : 'rgba(255,255,255,0.04)',
      border: `1px solid ${ok ? 'rgba(52,211,153,0.2)' : 'rgba(255,255,255,0.07)'}`,
      color: ok ? '#34d399' : '#5e6370',
    }}>
      {ok
        ? <CheckCircle2 size={12} style={{ color: '#34d399' }} />
        : <XCircle size={12} style={{ color: '#5e6370' }} />}
      {label}
    </div>
  );
}

function TestTTSButton({ backendUrl, voice, speed, lang }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr]   = useState('');

  const test = async () => {
    setBusy(true); setErr('');
    try {
      const res = await fetch(`${backendUrl}/api/voice/speak`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: 'Voice test, sir. Supertonic TTS is working.',
          voice: voice || 'M1',
          speed: speed || 1.05,
          lang:  lang  || 'en',
        }),
      });
      if (!res.ok) {
        const e = await res.text().catch(() => '');
        throw new Error(`HTTP ${res.status}: ${e.slice(0, 200)}`);
      }
      const blob = await res.blob();
      const audio = new Audio(URL.createObjectURL(blob));
      await audio.play();
    } catch (e) {
      setErr(e.message);
    } finally { setBusy(false); }
  };

  return (
    <div>
      <button
        type="button"
        onClick={test}
        disabled={busy}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          height: 30, padding: '0 14px', borderRadius: 7,
          background: 'rgba(34,211,238,0.15)', color: '#67e8f9',
          border: '1px solid rgba(34,211,238,0.3)', cursor: busy ? 'not-allowed' : 'pointer',
          fontSize: 11, fontWeight: 600, opacity: busy ? 0.6 : 1,
        }}
      >
        {busy ? <Loader2 size={11} className="vs-spin" /> : null}
        {busy ? 'Synthesizing…' : 'Test voice'}
      </button>
      {err && <div style={{ marginTop: 6, fontSize: 10, color: '#f87171' }}>{err}</div>}
    </div>
  );
}
