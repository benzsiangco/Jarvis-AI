/**
 * AudioDevicesSettings — mic + speaker pickers with a live level meter.
 *
 * Why not roll into VoiceSettings: keep this self-contained so it can also
 * sit inside future Voice Mode "device check" overlays.
 *
 * Mic level test:
 *   Opens the selected mic, runs an analyser, draws a 24-bar VU meter at
 *   60fps. Updates instantly when the user changes the device. If the level
 *   stays at 0 while you talk, the mic isn't being picked up.
 */
import { useEffect, useRef, useState } from 'react';
import { Mic, Volume2, RefreshCw, AlertCircle } from 'lucide-react';
import useAudioDevicesStore from '../stores/audioDevicesStore';

export default function AudioDevicesSettings() {
  const inputDeviceId    = useAudioDevicesStore((s) => s.inputDeviceId);
  const outputDeviceId   = useAudioDevicesStore((s) => s.outputDeviceId);
  const setInputDevice   = useAudioDevicesStore((s) => s.setInputDevice);
  const setOutputDevice  = useAudioDevicesStore((s) => s.setOutputDevice);

  const [inputs,  setInputs]  = useState([]);
  const [outputs, setOutputs] = useState([]);
  const [permError, setPermError] = useState('');
  const [permGranted, setPermGranted] = useState(false);

  const enumerate = async () => {
    try {
      const list = await navigator.mediaDevices.enumerateDevices();
      setInputs(list.filter((d) => d.kind === 'audioinput'));
      setOutputs(list.filter((d) => d.kind === 'audiooutput'));
      // Labels are only populated after permission grant — detect that.
      setPermGranted(list.some((d) => d.kind === 'audioinput' && !!d.label));
    } catch (e) {
      setPermError(e?.message || 'Failed to enumerate devices');
    }
  };

  useEffect(() => {
    enumerate();
    const onChange = () => enumerate();
    navigator.mediaDevices?.addEventListener?.('devicechange', onChange);
    return () => navigator.mediaDevices?.removeEventListener?.('devicechange', onChange);
  }, []);

  const requestPermission = async () => {
    setPermError('');
    try {
      const s = await navigator.mediaDevices.getUserMedia({ audio: true });
      // Releasing immediately — we just needed it to expose labels.
      s.getTracks().forEach((t) => t.stop());
      await enumerate();
    } catch (e) {
      setPermError(`Microphone permission denied: ${e?.message || 'unknown error'}`);
    }
  };

  return (
    <div className="ads-root">
      <div className="ads-section-title">Microphone</div>
      <select
        value={inputDeviceId || ''}
        onChange={(e) => setInputDevice(e.target.value)}
        className="ads-select"
      >
        <option value="">System default</option>
        {inputs.map((d) => (
          <option key={d.deviceId} value={d.deviceId}>
            {d.label || `Microphone ${d.deviceId.slice(0, 8)}`}
          </option>
        ))}
      </select>

      <MicLevelMeter deviceId={inputDeviceId} />

      <div className="ads-section-title" style={{ marginTop: 14 }}>Speaker</div>
      {typeof HTMLMediaElement.prototype.setSinkId !== 'function' ? (
        <div className="ads-warn">
          <AlertCircle size={11} />
          This browser/webview doesn't support output device selection.
          Audio will play through the system default.
        </div>
      ) : (
        <select
          value={outputDeviceId || ''}
          onChange={(e) => setOutputDevice(e.target.value)}
          className="ads-select"
        >
          <option value="">System default</option>
          {outputs.map((d) => (
            <option key={d.deviceId} value={d.deviceId}>
              {d.label || `Speaker ${d.deviceId.slice(0, 8)}`}
            </option>
          ))}
        </select>
      )}

      {!permGranted && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10 }}>
          <button onClick={requestPermission} className="ads-btn">
            <Mic size={11} /> Grant microphone access
          </button>
          <span style={{ fontSize: 10, color: '#5e6370' }}>
            Required to see device names + run the level test.
          </span>
        </div>
      )}

      {permError && (
        <div className="ads-error">
          <AlertCircle size={11} /> {permError}
        </div>
      )}

      <button onClick={enumerate} className="ads-refresh">
        <RefreshCw size={10} /> Refresh device list
      </button>

      <style>{`
        .ads-root { display: flex; flex-direction: column; gap: 8px; }
        .ads-section-title {
          font-size: 10px; font-weight: 700; letter-spacing: .08em;
          text-transform: uppercase; color: #5e6370;
        }
        .ads-select {
          height: 30px; padding: 0 10px; border-radius: 7px; font-size: 12px;
          color: #e2e8f0; background: rgba(0,0,0,0.3);
          border: 1px solid rgba(255,255,255,0.06); outline: none; transition: border-color .12s;
        }
        .ads-select:focus { border-color: rgba(6,182,212,0.4); }
        .ads-btn {
          display: inline-flex; align-items: center; gap: 5px;
          height: 26px; padding: 0 10px; border-radius: 6;
          background: rgba(34,211,238,0.12); color: #67e8f9;
          border: 1px solid rgba(34,211,238,0.25);
          cursor: pointer; font-size: 11px; font-weight: 600;
        }
        .ads-btn:hover { background: rgba(34,211,238,0.22); }
        .ads-refresh {
          align-self: flex-start; display: inline-flex; align-items: center; gap: 5px;
          margin-top: 6px; padding: 4px 8px; border-radius: 5px;
          background: rgba(255,255,255,0.03); color: #8b8d99;
          border: 1px solid rgba(255,255,255,0.06);
          cursor: pointer; font-size: 10px; font-weight: 500;
        }
        .ads-refresh:hover { background: rgba(255,255,255,0.06); color: #e2e8f0; }
        .ads-warn {
          display: inline-flex; align-items: center; gap: 6px;
          padding: 6px 10px; border-radius: 6px;
          background: rgba(251,191,36,0.06); color: #fbbf24;
          border: 1px solid rgba(251,191,36,0.18);
          font-size: 11px;
        }
        .ads-error {
          display: inline-flex; align-items: center; gap: 6px;
          padding: 6px 10px; border-radius: 6px;
          background: rgba(248,113,113,0.08); color: #fca5a5;
          border: 1px solid rgba(248,113,113,0.2);
          font-size: 11px;
        }
      `}</style>
    </div>
  );
}

/* ── Mic level meter ───────────────────────────────────────────────────── */

function MicLevelMeter({ deviceId }) {
  const canvasRef  = useRef(null);
  const streamRef  = useRef(null);
  const ctxRef     = useRef(null);
  const analyserRef = useRef(null);
  const dataRef    = useRef(null);
  const rafRef     = useRef(0);

  const [level, setLevel] = useState(0);
  const [peak,  setPeak]  = useState(0);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    const stop = () => {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
      try { streamRef.current?.getTracks?.().forEach((t) => t.stop()); } catch {}
      try { ctxRef.current?.close?.(); } catch {}
      streamRef.current = null;
      ctxRef.current = null;
      analyserRef.current = null;
      dataRef.current = null;
    };
    stop();
    setError('');

    (async () => {
      try {
        const constraints = {
          audio: deviceId ? { deviceId: { exact: deviceId } } : true,
        };
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }

        const Ctx = window.AudioContext || window.webkitAudioContext;
        const ctx = new Ctx();
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 1024;
        analyser.smoothingTimeConstant = 0.5;
        const source = ctx.createMediaStreamSource(stream);
        source.connect(analyser);

        streamRef.current = stream;
        ctxRef.current = ctx;
        analyserRef.current = analyser;
        dataRef.current = new Uint8Array(analyser.fftSize);

        let peakHold = 0;
        let peakDecay = 0;
        const tick = () => {
          const a = analyserRef.current;
          const d = dataRef.current;
          if (!a || !d) return;
          a.getByteTimeDomainData(d);

          // RMS over the time-domain buffer
          let sum = 0;
          for (let i = 0; i < d.length; i++) {
            const v = (d[i] - 128) / 128;
            sum += v * v;
          }
          const rms = Math.sqrt(sum / d.length);
          const shaped = Math.min(1, Math.pow(rms * 2.4, 0.85));

          if (shaped > peakHold) { peakHold = shaped; peakDecay = 0; }
          else { peakDecay += 0.012; peakHold = Math.max(0, peakHold - peakDecay); }

          setLevel(shaped);
          setPeak(peakHold);

          drawBars(canvasRef.current, shaped, peakHold);
          rafRef.current = requestAnimationFrame(tick);
        };
        tick();
      } catch (e) {
        if (!cancelled) setError(e?.message || 'mic open failed');
      }
    })();

    return () => { cancelled = true; stop(); };
  }, [deviceId]);

  return (
    <div className="ads-meter">
      <canvas ref={canvasRef} width={460} height={28} className="ads-meter-canvas" />
      <div className="ads-meter-row">
        <span className="ads-meter-label">
          {error
            ? <span style={{ color: '#fca5a5' }}>Error: {error}</span>
            : level < 0.005
              ? 'Silent — not picking up audio'
              : level < 0.04
                ? 'Quiet'
                : level < 0.15
                  ? 'Speaking detected'
                  : 'Loud'}
        </span>
        <span className="ads-meter-value">{Math.round(level * 100)}%</span>
      </div>
      <style>{`
        .ads-meter { display: flex; flex-direction: column; gap: 4px; margin-top: 6px; }
        .ads-meter-canvas {
          width: 100%; height: 28px; border-radius: 6px;
          background: rgba(0,0,0,0.4); border: 1px solid rgba(255,255,255,0.06);
        }
        .ads-meter-row {
          display: flex; align-items: center; justify-content: space-between;
          font-size: 10px; font-family: var(--font-mono); color: #8b8d99;
        }
        .ads-meter-value { color: #67e8f9; font-weight: 600; }
      `}</style>
    </div>
  );
}

function drawBars(canvas, level, peak) {
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);

  const bars = 24;
  const gap = 2;
  const bw = (w - gap * (bars - 1)) / bars;
  const litCount = Math.round(level * bars);
  const peakIdx  = Math.round(peak * bars);

  for (let i = 0; i < bars; i++) {
    const x = i * (bw + gap);
    const lit = i < litCount;
    const isPeak = i === peakIdx - 1 && peakIdx > 0;
    // gradient: cyan → green → amber → red
    let color;
    if (i < bars * 0.6)       color = lit ? '#22d3ee' : 'rgba(34,211,238,0.15)';
    else if (i < bars * 0.85) color = lit ? '#4ade80' : 'rgba(74,222,128,0.15)';
    else                      color = lit ? '#f87171' : 'rgba(248,113,113,0.15)';
    if (isPeak) color = '#fef9c3';
    ctx.fillStyle = color;
    ctx.fillRect(x, 0, bw, h);
  }
}
