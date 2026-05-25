/**
 * useTTSSpeak — speak via Supertonic TTS with browser TTS fallback.
 * Falls back to browser speech synthesis if Supertonic is unavailable (503).
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
  const abortRef        = useRef(null);
  const wasStreamingRef = useRef(false);
  const textRef         = useRef(text);

  const [error,   setError]   = useState('');
  const [playing, setPlaying] = useState(false);

  const sinkRef = useRef(outputDeviceId);
  useEffect(() => {
    sinkRef.current = outputDeviceId;
    if (audioRef.current?.setSinkId && outputDeviceId !== undefined) {
      audioRef.current.setSinkId(outputDeviceId || '').catch(() => {});
    }
  }, [outputDeviceId]);

  useEffect(() => { textRef.current = text; }, [text]);

  // Browser TTS fallback
  const speakBrowser = useCallback((textToSpeak) => {
    if (!('speechSynthesis' in window)) return;
    try { window.speechSynthesis.cancel(); } catch {}
    const u = new SpeechSynthesisUtterance(textToSpeak);
    u.rate = 1.0; u.pitch = 1.0; u.volume = 1.0;
    u.onstart = () => setPlaying(true);
    u.onend   = () => { setPlaying(false); setError(''); };
    u.onerror = () => setPlaying(false);
    try { window.speechSynthesis.speak(u); } catch {}
  }, []);

  const speak = useCallback(async (textToSpeak) => {
    abortRef.current?.abort?.();
    const ac = new AbortController();
    abortRef.current = ac;
    setError('');

    const clean = stripMarkdown(textToSpeak);

    try {
      const res = await fetch(`${backendUrl}/api/voice/speak`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: clean }),
        signal: ac.signal,
      });

      // 503 = Supertonic not running → fall back to browser TTS silently
      if (res.status === 503) {
        speakBrowser(clean);
        return;
      }

      if (!res.ok) {
        const err = await res.text().catch(() => '');
        // Don't show error for 503 — browser fallback handles it
        if (res.status !== 503) setError(`TTS ${res.status}: ${err.slice(0, 120)}`);
        speakBrowser(clean);
        return;
      }

      const blob = await res.blob();
      if (ac.signal.aborted || !blob) return;

      try { audioRef.current?.pause?.(); } catch {}
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audioRef.current = audio;

      if (audio.setSinkId && sinkRef.current) {
        try { await audio.setSinkId(sinkRef.current); } catch {}
      }

      audio.onplay  = () => setPlaying(true);
      audio.onended = () => { setPlaying(false); URL.revokeObjectURL(url); };
      audio.onpause = () => setPlaying(false);
      audio.onerror = () => { setPlaying(false); URL.revokeObjectURL(url); speakBrowser(clean); };

      await audio.play().catch((e) => {
        if (!String(e?.message).includes('aborted')) speakBrowser(clean);
      });
    } catch (e) {
      if (!ac.signal.aborted && e?.name !== 'AbortError') {
        // Network error — fall back to browser TTS
        speakBrowser(clean);
      }
    }
  }, [backendUrl, speakBrowser]);

  // Auto-speak when streaming finishes
  useEffect(() => {
    const justFinished = wasStreamingRef.current && !isStreaming;
    wasStreamingRef.current = isStreaming;
    if (!justFinished || !enabled || muted) return;
    setTimeout(() => {
      const clean = (textRef.current || '').trim();
      if (clean) speak(clean);
    }, 80);
  }, [enabled, isStreaming, muted, speak]);

  // Mute stops playback
  useEffect(() => {
    if (muted) {
      try { audioRef.current?.pause?.(); } catch {}
      try { abortRef.current?.abort?.(); } catch {}
      try { window.speechSynthesis?.cancel?.(); } catch {}
    }
  }, [muted]);

  useEffect(() => () => {
    try { audioRef.current?.pause?.(); } catch {}
    try { abortRef.current?.abort?.(); } catch {}
  }, []);

  return { error, playing, speak };
}

function stripMarkdown(s) {
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
