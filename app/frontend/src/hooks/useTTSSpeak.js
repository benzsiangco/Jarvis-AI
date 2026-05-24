/**
 * useTTSSpeak — speak completed assistant messages via Supertonic TTS.
 *
 *   const { error, playing, speak } = useTTSSpeak({
 *     backendUrl, enabled, text, isStreaming, muted, outputDeviceId,
 *   });
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

  const speak = useCallback(async (textToSpeak) => {
    abortRef.current?.abort?.();
    const ac = new AbortController();
    abortRef.current = ac;
    setError('');

    try {
      const res = await fetch(`${backendUrl}/api/voice/speak`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: stripMarkdown(textToSpeak) }),
        signal: ac.signal,
      });
      if (!res.ok) {
        const err = await res.text().catch(() => '');
        setError(`TTS ${res.status}: ${err.slice(0, 200)}`);
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
      audio.onerror = () => { setPlaying(false); URL.revokeObjectURL(url); };

      await audio.play().catch((e) => {
        if (!String(e?.message).includes('aborted')) setError(`Playback: ${e.message}`);
      });
    } catch (e) {
      if (!ac.signal.aborted && e?.name !== 'AbortError') {
        setError(`TTS: ${e.message}`);
      }
    }
  }, [backendUrl]);

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
