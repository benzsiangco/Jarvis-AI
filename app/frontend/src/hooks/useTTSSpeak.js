/**
 * useTTSSpeak — speak completed assistant messages via the backend.
 *
 *   const { error, playing, level, testTone } = useTTSSpeak({
 *     backendUrl, enabled, text, isStreaming, muted, outputDeviceId,
 *   });
 *
 *  - level    : 0..1 RMS of current playback (for the output visualizer)
 *  - error    : last TTS HTTP/runtime error (surfaced in the UI)
 *  - playing  : audio currently rendering
 *  - testTone : async () => Promise<void> — plays the last response again,
 *               or a short beep if there's nothing to replay. Useful as
 *               "Test output" button that doubles as a sanity check.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

export default function useTTSSpeak({
  backendUrl,
  enabled,
  text,
  isStreaming,
  muted,
  outputDeviceId = '',
}) {
  const audioRef        = useRef(null);
  const lastSpokenRef   = useRef('');
  const lastAudioUrlRef = useRef('');
  const abortRef        = useRef(null);
  const wasStreamingRef = useRef(false);

  const ctxRef        = useRef(null);
  const analyserRef   = useRef(null);
  const sourceNodeRef = useRef(null);
  const dataRef       = useRef(null);
  const rafRef        = useRef(0);

  const [error,   setError]   = useState('');
  const [playing, setPlaying] = useState(false);
  const [level,   setLevel]   = useState(0);

  // Keep latest output device ID without re-creating callbacks
  const sinkRef = useRef(outputDeviceId);
  useEffect(() => {
    sinkRef.current = outputDeviceId;
    if (audioRef.current?.setSinkId && outputDeviceId !== undefined) {
      audioRef.current.setSinkId(outputDeviceId || '').catch(() => {});
    }
  }, [outputDeviceId]);

  const stopVisualizer = () => {
    cancelAnimationFrame(rafRef.current);
    rafRef.current = 0;
    setLevel(0);
    try { sourceNodeRef.current?.disconnect?.(); } catch {}
    sourceNodeRef.current = null;
  };

  const tickLevel = () => {
    const a = analyserRef.current;
    const d = dataRef.current;
    if (!a || !d) return;
    a.getByteTimeDomainData(d);
    let sum = 0;
    for (let i = 0; i < d.length; i++) {
      const v = (d[i] - 128) / 128;
      sum += v * v;
    }
    const rms = Math.sqrt(sum / d.length);
    setLevel(Math.min(1, Math.pow(rms * 2.4, 0.85)));
    rafRef.current = requestAnimationFrame(tickLevel);
  };

  const playUrl = useCallback(async (url) => {
    setError('');

    // Stop any previous playback
    try { audioRef.current?.pause?.(); } catch {}

    const audio = new Audio(url);
    audioRef.current = audio;

    // Apply selected output device if supported
    if (audio.setSinkId && sinkRef.current) {
      try { await audio.setSinkId(sinkRef.current); }
      catch (e) { setError(`output device unavailable: ${e.message}`); }
    }

    audio.onplay   = () => setPlaying(true);
    audio.onended  = () => { setPlaying(false); URL.revokeObjectURL(url); };
    audio.onpause  = () => setPlaying(false);
    audio.onerror  = (e) => {
      setPlaying(false);
      setError(`audio playback error: ${audio.error?.message || 'unknown'}`);
      URL.revokeObjectURL(url);
    };

    try {
      await audio.play();
    } catch (e) {
      const msg = String(e?.message || '');
      if (msg.includes('aborted') || msg.includes('interrupted')) return; // normal when superseded
      setError(`autoplay blocked — ${msg}. Interact with the page first.`);
    }
  }, []);

  const fetchAndPlay = useCallback(async (textToSpeak) => {
    abortRef.current?.abort?.();
    const ac = new AbortController();
    abortRef.current = ac;
    setError('');

    // Find out which provider is active so we can fall back to browser TTS.
    let providerCfg = null;
    try {
      const r = await fetch(`${backendUrl}/api/voice/config`, { signal: ac.signal });
      if (r.ok) providerCfg = await r.json();
    } catch (e) {
      if (ac.signal.aborted || e?.name === 'AbortError') return;
    }

    if (providerCfg?.provider === 'browser') {
      return speakBrowser(stripMarkdownForSpeech(textToSpeak), providerCfg.browser, setError, setPlaying, setLevel);
    }

    let res;
    try {
      res = await fetch(`${backendUrl}/api/voice/speak`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: stripMarkdownForSpeech(textToSpeak) }),
        signal: ac.signal,
      });
    } catch (e) {
      const msg = String(e?.message || '');
      if (ac.signal.aborted || e?.name === 'AbortError' || msg.includes('aborted')) return;
      setError(`tts request failed: ${msg}`);
      return;
    }
    if (!res.ok) {
      // 503 from Edge TTS — auto-fallback to browser TTS
      if (res.status === 503) {
        return speakBrowser(stripMarkdownForSpeech(textToSpeak), providerCfg?.browser, setError, setPlaying, setLevel);
      }
      const errText = await res.text().catch(() => '');
      setError(`tts ${res.status}: ${truncate(errText, 200)}`);
      return;
    }
    const blob = await res.blob().catch(() => null);
    if (ac.signal.aborted || !blob) return;
    if (lastAudioUrlRef.current) URL.revokeObjectURL(lastAudioUrlRef.current);
    const url = URL.createObjectURL(blob);
    lastAudioUrlRef.current = url;
    await playUrl(url);
  }, [backendUrl, playUrl]);

  // Auto-speak when streaming completes.
  // We track text via ref so the effect doesn't re-fire for streaming token
  // updates — only the streaming→idle transition should trigger TTS.
  const textRef = useRef(text);
  useEffect(() => { textRef.current = text; }, [text]);

  useEffect(() => {
    const justFinished = wasStreamingRef.current && !isStreaming;
    wasStreamingRef.current = isStreaming;
    if (!justFinished || !enabled || muted) return;
    setTimeout(() => {
      const clean = (textRef.current || '').trim();
      if (!clean) return;
      lastSpokenRef.current = clean;
      fetchAndPlay(clean);
    }, 80);
  }, [enabled, isStreaming, muted, fetchAndPlay]);

  // Mute pauses playback and aborts any in-flight TTS request
  useEffect(() => {
    if (muted) {
      try { audioRef.current?.pause?.(); } catch {}
      try { abortRef.current?.abort?.(); } catch {}
      stopVisualizer();
    }
  }, [muted]);

  useEffect(() => () => {
    try { audioRef.current?.pause?.(); } catch {}
    try { abortRef.current?.abort?.(); } catch {}
    if (lastAudioUrlRef.current) URL.revokeObjectURL(lastAudioUrlRef.current);
    stopVisualizer();
  }, []);

  /** Replay last response, or play a short beep if no response yet. */
  const testTone = useCallback(async () => {
    if (lastAudioUrlRef.current) {
      await playUrl(lastAudioUrlRef.current);
      return;
    }
    // Fall back: synthesize a 0.4s 440Hz sine via WebAudio
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      const ctx = ctxRef.current || new Ctx();
      ctxRef.current = ctx;
      if (ctx.state === 'suspended') await ctx.resume().catch(() => {});
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = 440;
      gain.gain.value = 0.18;
      osc.connect(gain).connect(ctx.destination);
      osc.start();
      setPlaying(true); setLevel(0.6);
      setTimeout(() => { osc.stop(); setPlaying(false); setLevel(0); }, 400);
    } catch (e) {
      setError(`test tone failed: ${e.message}`);
    }
  }, [playUrl]);

  return { error, playing, level, testTone, speak: fetchAndPlay };
}

/** Strip markdown-only artifacts that don't read well aloud. */
function stripMarkdownForSpeech(s) {
  return s
    .replace(/```[\s\S]*?```/g, ' (code block) ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/^\s*[#>*-]+\s+/gm, '')
    .replace(/\n{2,}/g, '. ')
    .trim();
}

function truncate(s, n) { return (s || '').length > n ? s.slice(0, n) + '…' : s; }

/**
 * speakBrowser — use the OS speech synthesis API.
 * Free, offline, no setup. Voice quality varies by OS (best is macOS).
 */
function speakBrowser(text, cfg, setError, setPlaying, setLevel) {
  return new Promise((resolve) => {
    if (!('speechSynthesis' in window)) {
      setError('browser TTS not available in this environment');
      return resolve();
    }
    try { window.speechSynthesis.cancel(); } catch {}

    const u = new SpeechSynthesisUtterance(text);
    u.rate   = Number(cfg?.rate)   || 1.0;
    u.pitch  = Number(cfg?.pitch)  || 1.0;
    u.volume = Number(cfg?.volume) || 1.0;

    const voices = window.speechSynthesis.getVoices();
    if (cfg?.voice) {
      const match = voices.find((v) => v.name === cfg.voice);
      if (match) u.voice = match;
    }

    u.onstart = () => { setPlaying(true);  setLevel(0.6); };
    u.onend   = () => { setPlaying(false); setLevel(0); resolve(); };
    u.onerror = (e) => { setPlaying(false); setLevel(0); setError(`browser tts: ${e.error || 'failed'}`); resolve(); };

    try { window.speechSynthesis.speak(u); }
    catch (e) { setError(`browser tts: ${e.message}`); resolve(); }
  });
}
