/**
 * useContinuousListen — VAD-driven hands-free voice loop.
 *
 *   const { listening, error } = useContinuousListen({
 *     enabled,            // bool — master gate (Jarvis activated + not streaming)
 *     backendUrl,
 *     onTranscript,       // (text) => void — called per detected utterance
 *     onAmplitude,        // (0..1)  => void — optional, for the reactor pulse
 *   });
 *
 * How it works:
 *  - One mic stream + one AnalyserNode are kept alive while `enabled`.
 *  - RMS is sampled every animation frame.
 *  - When RMS rises above SPEECH threshold for SPEECH_FRAMES frames, we
 *    arm a MediaRecorder.
 *  - When RMS stays below SILENCE threshold for SILENCE_MS, we stop the
 *    recorder, ship the blob, and re-arm.
 *  - Any clip shorter than MIN_CLIP_MS is discarded as background noise.
 *
 * Heavy ML work (Whisper) happens server-side; this hook is pure glue.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

const SPEECH_THRESHOLD  = 0.07;
const SILENCE_THRESHOLD = 0.04;
const SPEECH_FRAMES     = 8;
const SILENCE_MS        = 1000;
const MIN_CLIP_MS       = 800;    // raised: clips shorter than 800ms are almost always noise
const MAX_CLIP_MS       = 30_000;
const NOISE_FLOOR_MS    = 1500;
const NOISE_MARGIN      = 0.04;

export default function useContinuousListen({
  enabled,
  backendUrl,
  onTranscript,
  onAmplitude,
  inputDeviceId = '',
} = {}) {
  const [listening, setListening] = useState(false);
  const [error, setError]         = useState('');

  // Mic + audio graph
  const streamRef   = useRef(null);
  const ctxRef      = useRef(null);
  const analyserRef = useRef(null);
  const dataRef     = useRef(null);
  const rafRef      = useRef(0);

  // Recorder + utterance state
  const recRef        = useRef(null);
  const chunksRef     = useRef([]);
  const speakingRef   = useRef(false);
  const speechFramesRef = useRef(0);
  const silenceSinceRef = useRef(0);
  const startedAtRef    = useRef(0);

  const enabledRef     = useRef(false);
  const deviceIdRef    = useRef('');
  const transcriptRef  = useRef(onTranscript);
  const amplitudeRef   = useRef(onAmplitude);
  useEffect(() => { transcriptRef.current = onTranscript; }, [onTranscript]);
  useEffect(() => { amplitudeRef.current  = onAmplitude;  }, [onAmplitude]);
  useEffect(() => { deviceIdRef.current   = inputDeviceId; }, [inputDeviceId]);

  const stopAll = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    rafRef.current = 0;

    try { recRef.current?.stop?.(); } catch {}
    recRef.current   = null;
    chunksRef.current = [];

    try { streamRef.current?.getTracks?.().forEach((t) => t.stop()); } catch {}
    streamRef.current = null;

    try { ctxRef.current?.close?.(); } catch {}
    ctxRef.current      = null;
    analyserRef.current = null;
    dataRef.current     = null;

    speakingRef.current = false;
    speechFramesRef.current = 0;
    silenceSinceRef.current = 0;
    noiseFloorRef.current   = 0;
    noiseSamplesRef.current = [];
    noiseStartRef.current   = 0;
    setListening(false);
  }, []);

  // Send the recorded blob to the backend, then re-arm
  const finalizeUtterance = useCallback(async () => {
    const rec = recRef.current;
    if (!rec || rec.state === 'inactive') return;

    const stopped = new Promise((resolve) => { rec.onstop = () => resolve(); });
    try { rec.stop(); } catch {}
    await stopped;

    const duration = Date.now() - startedAtRef.current;
    const blob = new Blob(chunksRef.current, { type: rec.mimeType || 'audio/webm' });
    chunksRef.current = [];

    // Re-arm a fresh recorder so we keep listening immediately
    armRecorder();

    if (duration < MIN_CLIP_MS || !blob.size) return; // noise — ignore

    try {
      const fd = new FormData();
      fd.append('file', blob, 'utterance.webm');
      const res  = await fetch(`${backendUrl}/api/voice/transcribe`, { method: 'POST', body: fd });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      const text = (data?.text || '').trim();
      if (text && transcriptRef.current) transcriptRef.current(text);
    } catch (e) {
      setError(e?.message || 'Transcription failed');
    }
  }, [backendUrl]);

  // Build a fresh MediaRecorder against the existing stream
  const armRecorder = useCallback(() => {
    const stream = streamRef.current;
    if (!stream || !enabledRef.current) return;
    const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
      ? 'audio/webm;codecs=opus'
      : 'audio/webm';
    const rec = new MediaRecorder(stream, { mimeType: mime });
    rec.ondataavailable = (e) => { if (e.data?.size) chunksRef.current.push(e.data); };
    recRef.current = rec;
    chunksRef.current = [];
    speakingRef.current = false;
    speechFramesRef.current = 0;
    silenceSinceRef.current = 0;
  }, []);

  // Start mic + analyser. Sample RMS each frame; trigger VAD transitions.
  const start = useCallback(async () => {
    setError('');
    if (streamRef.current) return true;
    if (typeof window === 'undefined' || !navigator?.mediaDevices?.getUserMedia) {
      setError('Microphone not available');
      return false;
    }
    try {
      const constraints = {
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          ...(deviceIdRef.current ? { deviceId: { exact: deviceIdRef.current } } : {}),
        },
      };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      const Ctx = window.AudioContext || window.webkitAudioContext;
      const ctx = new Ctx();
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      analyser.smoothingTimeConstant = 0.6;
      const source = ctx.createMediaStreamSource(stream);
      source.connect(analyser);

      streamRef.current   = stream;
      ctxRef.current      = ctx;
      analyserRef.current = analyser;
      dataRef.current     = new Uint8Array(analyser.fftSize);

      armRecorder();
      setListening(true);
      tick();
      return true;
    } catch (e) {
      stopAll();
      setError(e?.message || 'Microphone permission denied');
      return false;
    }
  }, [armRecorder, stopAll]);

  const noiseFloorRef    = useRef(0);
  const noiseSamplesRef  = useRef([]);
  const noiseStartRef    = useRef(0);

  function tick() {
    const analyser = analyserRef.current;
    const data     = dataRef.current;
    if (!analyser || !data || !enabledRef.current) return;

    analyser.getByteTimeDomainData(data);
    let sum = 0;
    for (let i = 0; i < data.length; i++) {
      const v = (data[i] - 128) / 128;
      sum += v * v;
    }
    const rms = Math.sqrt(sum / data.length);
    if (amplitudeRef.current) amplitudeRef.current(Math.min(1, Math.pow(rms * 2.4, 0.85)));

    // Calibrate noise floor while not speaking — rolling 1.5s median of quiet samples.
    if (!speakingRef.current) {
      noiseSamplesRef.current.push(rms);
      if (noiseSamplesRef.current.length > 90) noiseSamplesRef.current.shift(); // ~1.5s @ 60fps
      if (!noiseStartRef.current) noiseStartRef.current = Date.now();
      // Use the 75th percentile so brief louder bumps don't poison the floor
      // but ambient hum is still represented.
      if (Date.now() - noiseStartRef.current >= NOISE_FLOOR_MS) {
        const sorted = [...noiseSamplesRef.current].sort((a, b) => a - b);
        const idx = Math.floor(sorted.length * 0.75);
        noiseFloorRef.current = sorted[idx] || 0;
      }
    }

    // Effective trigger = max(absolute threshold, noise_floor + margin).
    // This means in a quiet room you still need 0.10 RMS to trigger,
    // but in a noisy room the bar lifts to (ambient + 0.05) so the AC/fan
    // can't kick the recorder.
    const dynamicThreshold = Math.max(SPEECH_THRESHOLD, noiseFloorRef.current + NOISE_MARGIN);
    const dynamicSilence   = Math.max(SILENCE_THRESHOLD, noiseFloorRef.current + NOISE_MARGIN * 0.5);

    const rec = recRef.current;
    if (rec) {
      if (!speakingRef.current) {
        // Watching for speech onset
        if (rms > dynamicThreshold) {
          speechFramesRef.current += 1;
          if (speechFramesRef.current >= SPEECH_FRAMES && rec.state === 'inactive') {
            try { rec.start(); } catch {}
            speakingRef.current  = true;
            startedAtRef.current = Date.now();
            silenceSinceRef.current = 0;
          }
        } else {
          speechFramesRef.current = Math.max(0, speechFramesRef.current - 1);
        }
      } else {
        // Already speaking — watch for silence
        if (rms < dynamicSilence) {
          if (!silenceSinceRef.current) silenceSinceRef.current = Date.now();
          else if (Date.now() - silenceSinceRef.current >= SILENCE_MS) {
            speakingRef.current = false;
            speechFramesRef.current = 0;
            silenceSinceRef.current = 0;
            finalizeUtterance();
          }
        } else {
          silenceSinceRef.current = 0;
          // Hard cap on overly long clips
          if (Date.now() - startedAtRef.current > MAX_CLIP_MS) {
            speakingRef.current = false;
            finalizeUtterance();
          }
        }
      }
    }

    rafRef.current = requestAnimationFrame(tick);
  }

  useEffect(() => {
    enabledRef.current = !!enabled;
    if (enabled) start();
    else stopAll();
    return stopAll;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, inputDeviceId]);

  return { listening, error };
}
