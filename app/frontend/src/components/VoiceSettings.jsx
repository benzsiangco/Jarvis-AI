/**
 * VoiceSettings — provider picker + Fish Audio credentials.
 * Mounted inside SettingsModal.
 */
import { useEffect, useState } from 'react';
import { Check, Loader2, ExternalLink } from 'lucide-react';
import AudioDevicesSettings from './AudioDevicesSettings';

export default function VoiceSettings({ backendUrl }) {
  const [cfg, setCfg]       = useState(null);
  const [draft, setDraft]   = useState(null);
  const [saving, setSaving] = useState(false);
  const [err, setErr]       = useState('');
  const [saved, setSaved]   = useState(false);

  useEffect(() => {
    fetch(`${backendUrl}/api/voice/config`)
      .then((r) => r.json())
      .then((c) => { setCfg(c); setDraft(structuredClone(c)); })
      .catch((e) => setErr(e.message));
  }, [backendUrl]);

  if (!draft) return <div className="vs-loading">Loading…</div>;

  const setProvider = (p) => setDraft({ ...draft, provider: p });
  const setFish = (k, v) => setDraft({ ...draft, fish: { ...draft.fish, [k]: v } });

  const save = async () => {
    setSaving(true); setErr(''); setSaved(false);
    try {
      // Send all three sub-trees so engine/voice changes persist.
      const payload = {
        provider: draft.provider,
        fish:    { ...draft.fish },
        local:   { ...(draft.local   || {}) },
        browser: { ...(draft.browser || {}) },
      };
      // Don't transmit the masked key back as-is; send '' to leave it untouched.
      if (draft.fish.apiKey?.startsWith('****')) payload.fish.apiKey = '';
      const res = await fetch(`${backendUrl}/api/voice/config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
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

      <div className="vs-section-title">STT / TTS Provider</div>
      <div className="vs-providers">
        <ProviderCard
          id="local"
          active={draft.provider === 'local'}
          onClick={() => setProvider('local')}
          title="Local (Whisper + Piper)"
          desc="Offline STT + TTS. Runs via Python sidecar. Free."
        />
        <ProviderCard
          id="browser"
          active={draft.provider === 'browser'}
          onClick={() => setProvider('browser')}
          title="Browser TTS"
          desc="Free, offline. Uses the OS voice."
        />
        <ProviderCard
          id="fish"
          active={draft.provider === 'fish'}
          onClick={() => setProvider('fish')}
          title="Fish Audio"
          desc="Cloud STT + TTS with voice cloning. Requires API key + credits."
        />
      </div>

      {draft.provider === 'local' && (
        <LocalSettings
          backendUrl={backendUrl}
          draft={draft.local || {}}
          setLocal={(k, v) => setDraft({ ...draft, local: { ...(draft.local || {}), [k]: v } })}
        />
      )}

      {draft.provider === 'browser' && (
        <BrowserSettings draft={draft.browser} setBrowser={(k, v) => setDraft({ ...draft, browser: { ...draft.browser, [k]: v } })} />
      )}

      {draft.provider === 'fish' && (
        <div className="vs-fish">
          <div className="vs-section-title">Fish Audio</div>
          <Field
            label="API Key"
            type="password"
            value={draft.fish.apiKey}
            onChange={(v) => setFish('apiKey', v)}
            placeholder={cfg?.fish?.hasApiKey ? '(saved — leave blank to keep)' : 'fk-...'}
            hint={
              <a href="https://fish.audio/app/api-keys/" target="_blank" rel="noreferrer" className="vs-link">
                Get a key <ExternalLink size={10} />
              </a>
            }
          />
          <div className="vs-row">
            <SelectField
              label="TTS Model"
              value={draft.fish.ttsModel}
              onChange={(v) => setFish('ttsModel', v)}
              options={[
                { value: 's2-pro', label: 'S2-Pro (recommended)' },
                { value: 's1',     label: 'S1' },
              ]}
            />
            <SelectField
              label="Format"
              value={draft.fish.ttsFormat}
              onChange={(v) => setFish('ttsFormat', v)}
              options={[
                { value: 'mp3',  label: 'MP3' },
                { value: 'wav',  label: 'WAV' },
                { value: 'opus', label: 'Opus' },
              ]}
            />
          </div>
          <Field
            label="Voice / Reference ID"
            value={draft.fish.ttsVoiceId}
            onChange={(v) => setFish('ttsVoiceId', v)}
            placeholder="(optional) model-id from your Fish library"
          />
          <div className="vs-row">
            <Field
              label="Speed"
              type="number"
              step="0.05"
              min="0.5"
              max="2.0"
              value={draft.fish.speed}
              onChange={(v) => setFish('speed', Number(v) || 1.0)}
            />
            <Field
              label="Volume (dB)"
              type="number"
              step="1"
              value={draft.fish.volume}
              onChange={(v) => setFish('volume', Number(v) || 0)}
            />
            <Field
              label="ASR Language"
              value={draft.fish.language ?? ''}
              onChange={(v) => setFish('language', v.trim() || null)}
              placeholder="auto"
            />
          </div>
        </div>
      )}

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
        .vs-providers { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; }
        .vs-card { padding: 10px 12px; border-radius: 10px; background: rgba(255,255,255,0.03);
                   border: 1px solid rgba(255,255,255,0.06); cursor: pointer; transition: all .15s; text-align: left; }
        .vs-card:hover { background: rgba(255,255,255,0.06); }
        .vs-card.active { background: rgba(6,182,212,0.08); border-color: rgba(6,182,212,0.3); }
        .vs-card-title { font-size: 12px; font-weight: 600; color: #e2e8f0; }
        .vs-card-desc  { font-size: 10px; color: #5e6370; margin-top: 4px; line-height: 1.4; }
        .vs-fish { display: flex; flex-direction: column; gap: 10px; padding-top: 4px; }
        .vs-row { display: flex; gap: 8px; }
        .vs-row > * { flex: 1; }
        .vs-field { display: flex; flex-direction: column; gap: 4px; }
        .vs-field-label { font-size: 10px; font-weight: 600; color: #7a7f8a; }
        .vs-field input, .vs-field select {
          height: 30px; padding: 0 10px; border-radius: 7px; font-size: 12px;
          color: #e2e8f0; background: rgba(0,0,0,0.3);
          border: 1px solid rgba(255,255,255,0.06); outline: none; transition: border-color .12s;
        }
        .vs-field input:focus, .vs-field select:focus { border-color: rgba(6,182,212,0.4); }
        .vs-field-hint { font-size: 10px; color: #5e6370; display: inline-flex; align-items: center; gap: 3px; }
        .vs-link { color: #67e8f9; text-decoration: none; display: inline-flex; align-items: center; gap: 3px; }
        .vs-link:hover { text-decoration: underline; }
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

function ProviderCard({ active, onClick, title, desc }) {
  return (
    <button type="button" onClick={onClick} className={`vs-card ${active ? 'active' : ''}`}>
      <div className="vs-card-title">{title}</div>
      <div className="vs-card-desc">{desc}</div>
    </button>
  );
}

function Field({ label, hint, ...inputProps }) {
  return (
    <div className="vs-field">
      <div className="vs-field-label">
        {label}
        {hint && <span className="vs-field-hint">  {hint}</span>}
      </div>
      <input {...inputProps} value={inputProps.value ?? ''} onChange={(e) => inputProps.onChange?.(e.target.value)} />
    </div>
  );
}

function SelectField({ label, value, onChange, options }) {
  return (
    <div className="vs-field">
      <div className="vs-field-label">{label}</div>
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
}

function LocalSettings({ backendUrl, draft, setLocal }) {
  const engine = draft?.engine || 'piper';
  const [piperVoices, setPiperVoices]   = useState([]);
  const [neuttsVoices, setNeuttsVoices] = useState([]);
  const [edgeVoices, setEdgeVoices]     = useState([]);
  const [piperDefault, setPiperDefault] = useState('');
  const [neuttsDef, setNeuttsDef]       = useState('');
  const [edgeDef, setEdgeDef]           = useState('');
  const [busy, setBusy]                 = useState(false);
  const [testErr, setTestErr]           = useState('');

  useEffect(() => {
    fetch(`${backendUrl}/api/voice/voices?engine=piper`)
      .then((r) => r.json())
      .then((d) => { setPiperVoices(d?.voices || []); setPiperDefault(d?.default || ''); })
      .catch(() => {});
    fetch(`${backendUrl}/api/voice/voices?engine=neutts`)
      .then((r) => r.json())
      .then((d) => { setNeuttsVoices(d?.voices || []); setNeuttsDef(d?.default || ''); })
      .catch(() => {});
    fetch(`${backendUrl}/api/voice/voices?engine=edge`)
      .then((r) => r.json())
      .then((d) => { setEdgeVoices(d?.voices || []); setEdgeDef(d?.default || ''); })
      .catch(() => {});
  }, [backendUrl]);

  const test = async () => {
    setBusy(true); setTestErr('');
    try {
      const res = await fetch(`${backendUrl}/api/voice/speak`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ text: 'Voice test, sir. Audio output is working.' }),
      });
      if (!res.ok) {
        const err = await res.text().catch(() => '');
        throw new Error(`HTTP ${res.status}: ${err.slice(0, 200)}`);
      }
      const blob = await res.blob();
      const a = new Audio(URL.createObjectURL(blob));
      await a.play();
    } catch (e) {
      setTestErr(e.message);
    } finally { setBusy(false); }
  };

  return (
    <div className="vs-fish">
      <div className="vs-section-title">Local Engine</div>
      <div className="vs-providers" style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
        <ProviderCard
          id="piper"
          active={engine === 'piper'}
          onClick={() => setLocal('engine', 'piper')}
          title="Piper"
          desc="Offline. Fast (~5x realtime). Pre-built voices, 60MB."
        />
        <ProviderCard
          id="edge"
          active={engine === 'edge'}
          onClick={() => setLocal('engine', 'edge')}
          title="Edge TTS"
          desc="Online. Free. Microsoft neural voices, very natural."
        />
        <ProviderCard
          id="neutts"
          active={engine === 'neutts'}
          onClick={() => setLocal('engine', 'neutts')}
          title="NeuTTS Nano"
          desc="Offline. Voice cloning. Slower (~0.5x realtime)."
        />
      </div>

      {engine === 'piper' && (
        <div className="vs-field">
          <div className="vs-field-label">
            Piper voice ({piperVoices.length} installed)
            {piperVoices.length === 0 && (
              <span className="vs-field-hint" style={{ color: '#fbbf24', marginLeft: 8 }}>
                Run: python app/voice/fetch_voices.py
              </span>
            )}
          </div>
          <select value={draft?.piperVoice || ''} onChange={(e) => setLocal('piperVoice', e.target.value)}>
            <option value="">Default ({piperDefault || 'sidecar default'})</option>
            {piperVoices.map((v) => (
              <option key={v.id} value={v.id}>{v.id} ({v.size_mb} MB)</option>
            ))}
          </select>
        </div>
      )}

      {engine === 'neutts' && (
        <>
          <div className="vs-field">
            <div className="vs-field-label">
              Reference voice ({neuttsVoices.length} samples in app/voice/samples/)
            </div>
            <select value={draft?.neuttsVoice || ''} onChange={(e) => setLocal('neuttsVoice', e.target.value)}>
              <option value="">Default ({neuttsDef || 'dave'})</option>
              {neuttsVoices.map((v) => (
                <option key={v.id} value={v.id}>{v.id} ({v.size_mb} MB)</option>
              ))}
            </select>
          </div>
          <SelectField
            label="Backbone"
            value={draft?.neuttsBackbone || 'neuphonic/neutts-nano-q4-gguf'}
            onChange={(v) => setLocal('neuttsBackbone', v)}
            options={[
              { value: 'neuphonic/neutts-nano-q4-gguf', label: 'Nano Q4 (fastest, ~150MB)' },
              { value: 'neuphonic/neutts-nano-q8-gguf', label: 'Nano Q8 (better quality)'   },
              { value: 'neuphonic/neutts-air-q4-gguf',  label: 'Air Q4 (largest, slower)'   },
            ]}
          />
          <span style={{ fontSize: 10, color: '#5e6370' }}>
            First run downloads ~150–800MB. Add custom references by dropping <code>name.wav</code> + <code>name.txt</code> into <code>app/voice/samples/</code>.
          </span>
        </>
      )}

      {engine === 'edge' && (
        <>
          <div className="vs-field">
            <div className="vs-field-label">
              Edge voice ({edgeVoices.length} curated)
            </div>
            <select value={draft?.edgeVoice || ''} onChange={(e) => setLocal('edgeVoice', e.target.value)}>
              <option value="">Default ({edgeDef || 'en-GB-RyanNeural'})</option>
              {edgeVoices.map((v) => (
                <option key={v.id} value={v.id}>{v.label || v.id}</option>
              ))}
            </select>
          </div>
          <div className="vs-row">
            <Field label="Rate (e.g. +10%)"   value={draft?.edgeRate   || '+0%'}
              onChange={(v) => setLocal('edgeRate',   v)} />
            <Field label="Pitch (e.g. +2Hz)"  value={draft?.edgePitch  || '+0Hz'}
              onChange={(v) => setLocal('edgePitch',  v)} />
            <Field label="Volume (e.g. -5%)"  value={draft?.edgeVolume || '+0%'}
              onChange={(v) => setLocal('edgeVolume', v)} />
          </div>
          <span style={{ fontSize: 10, color: '#5e6370' }}>
            Online. Uses Microsoft's free Edge TTS streaming endpoint — no API key required. ~1-2s latency. For more voices, run <code>edge-tts --list-voices</code>.
          </span>
        </>
      )}

      {engine === 'piper' && (
        <div className="vs-row">
          <Field label="Speed" type="number" step="0.05" min="0.5" max="2.0"
            value={draft?.speed ?? 1.0} onChange={(v) => setLocal('speed', Number(v) || 1.0)} />
        </div>
      )}

      {testErr && <div className="vs-error">{testErr}</div>}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <button type="button" className="vs-save" onClick={test} disabled={busy} style={{ background: 'rgba(34,211,238,0.15)', color: '#67e8f9', borderColor: 'rgba(34,211,238,0.3)' }}>
          {busy ? 'Synthesizing…' : 'Test voice'}
        </button>
        {engine === 'piper' && (
          <span style={{ fontSize: 10, color: '#5e6370' }}>
            More: <code style={{ color: '#c4b5fd' }}>python app/voice/fetch_voices.py en_GB-northern_english_male</code>
          </span>
        )}
      </div>
    </div>
  );
}

function BrowserSettings({ draft, setBrowser }) {
  const [voices, setVoices] = useState([]);

  useEffect(() => {
    const refresh = () => {
      try { setVoices(window.speechSynthesis?.getVoices?.() || []); } catch {}
    };
    refresh();
    window.speechSynthesis?.addEventListener?.('voiceschanged', refresh);
    return () => window.speechSynthesis?.removeEventListener?.('voiceschanged', refresh);
  }, []);

  const test = () => {
    try { window.speechSynthesis?.cancel?.(); } catch {}
    const u = new SpeechSynthesisUtterance('Voice test, sir. Audio output is working.');
    u.rate   = Number(draft?.rate)   || 1.0;
    u.pitch  = Number(draft?.pitch)  || 1.0;
    u.volume = Number(draft?.volume) || 1.0;
    if (draft?.voice) {
      const m = voices.find((v) => v.name === draft.voice);
      if (m) u.voice = m;
    }
    window.speechSynthesis?.speak?.(u);
  };

  return (
    <div className="vs-fish">
      <div className="vs-section-title">Browser TTS</div>
      <div className="vs-field">
        <div className="vs-field-label">Voice ({voices.length} available)</div>
        <select value={draft?.voice || ''} onChange={(e) => setBrowser('voice', e.target.value)}>
          <option value="">System default</option>
          {voices.map((v) => (
            <option key={v.name} value={v.name}>
              {v.name}{v.lang ? ` (${v.lang})` : ''}{v.default ? ' — default' : ''}
            </option>
          ))}
        </select>
      </div>
      <div className="vs-row">
        <Field label="Rate"   type="number" step="0.1" min="0.1" max="10"
          value={draft?.rate ?? 1.0}   onChange={(v) => setBrowser('rate',   Number(v) || 1.0)} />
        <Field label="Pitch"  type="number" step="0.1" min="0"   max="2"
          value={draft?.pitch ?? 1.0}  onChange={(v) => setBrowser('pitch',  Number(v) || 1.0)} />
        <Field label="Volume" type="number" step="0.1" min="0"   max="1"
          value={draft?.volume ?? 1.0} onChange={(v) => setBrowser('volume', Number(v) || 1.0)} />
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button type="button" className="vs-save" onClick={test} style={{ background: 'rgba(167,139,250,0.15)', color: '#c4b5fd', borderColor: 'rgba(167,139,250,0.3)' }}>
          Test voice
        </button>
        <span style={{ fontSize: 10, color: '#5e6370', alignSelf: 'center' }}>
          Voice list comes from Windows. Add more in Windows Settings → Time & Language → Speech.
        </span>
      </div>
    </div>
  );
}
