/**
 * useVoiceReactor — Web Audio API integration scaffold
 *
 * Wires a microphone stream into a real-time amplitude meter that drives
 * the reactor's `speaking` / `listening` animations. Designed as the seam
 * for a future full voice pipeline (STT → LLM → TTS).
 *
 *   const { start, stop } = useVoiceReactor({ enabled, source });
 *
 *   - enabled : boolean — gate analysis without tearing down the stream.
 *   - source  : 'mic' | 'tts' — which input feeds amplitude.
 *               'tts' is a no-op stub until a TTS pipeline is wired.
 *
 * Updates `useModeStore.amplitude` 60× / sec when active.
 * Releases all media + audio resources on unmount or stop().
 */
import { useEffect, useRef, useCallback } from 'react';
import useModeStore from '../stores/modeStore';

export default function useVoiceReactor({ enabled = false, source = 'mic' } = {}) {
  const ctxRef       = useRef(null);
  const analyserRef  = useRef(null);
  const streamRef    = useRef(null);
  const rafRef       = useRef(0);
  const dataRef      = useRef(null);

  const stop = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    rafRef.current = 0;

    try { streamRef.current?.getTracks?.().forEach((t) => t.stop()); } catch {}
    streamRef.current = null;

    try { ctxRef.current?.close?.(); } catch {}
    ctxRef.current = null;
    analyserRef.current = null;
    dataRef.current = null;

    useModeStore.getState().setAmplitude(0);
  }, []);

  const start = useCallback(async () => {
    if (typeof window === 'undefined' || !navigator?.mediaDevices?.getUserMedia) return false;
    if (source !== 'mic') return false;
    if (streamRef.current) return true;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      const Ctx = window.AudioContext || window.webkitAudioContext;
      const ctx = new Ctx();
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      analyser.smoothingTimeConstant = 0.7;

      const sourceNode = ctx.createMediaStreamSource(stream);
      sourceNode.connect(analyser);

      streamRef.current   = stream;
      ctxRef.current      = ctx;
      analyserRef.current = analyser;
      dataRef.current     = new Uint8Array(analyser.fftSize);

      tick();
      return true;
    } catch {
      stop();
      return false;
    }
  }, [source, stop]);

  function tick() {
    const analyser = analyserRef.current;
    const data     = dataRef.current;
    if (!analyser || !data) return;

    analyser.getByteTimeDomainData(data);

    // RMS over the time-domain buffer → 0..1 amplitude
    let sum = 0;
    for (let i = 0; i < data.length; i++) {
      const v = (data[i] - 128) / 128;
      sum += v * v;
    }
    const rms = Math.sqrt(sum / data.length);
    // Light shaping so quiet speech still pulses
    const shaped = Math.min(1, Math.pow(rms * 2.4, 0.85));

    useModeStore.getState().setAmplitude(shaped);
    rafRef.current = requestAnimationFrame(tick);
  }

  useEffect(() => {
    if (enabled) start();
    else stop();
    return stop;
  }, [enabled, start, stop]);

  return { start, stop };
}
