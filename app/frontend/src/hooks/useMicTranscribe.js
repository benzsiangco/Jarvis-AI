/**
 * useMicTranscribe — record from the user's mic and POST the audio blob
 * to the backend /api/voice/transcribe endpoint.
 *
 * Uses the selected input device from audioDevicesStore if set.
 */
import { useCallback, useRef, useState } from 'react';
import useAudioDevicesStore from '../stores/audioDevicesStore';

export default function useMicTranscribe({ backendUrl, onTranscript } = {}) {
  const [recording, setRecording] = useState(false);
  const [busy, setBusy]           = useState(false);
  const [error, setError]         = useState('');

  const recRef     = useRef(null);
  const streamRef  = useRef(null);
  const chunksRef  = useRef([]);

  const cleanup = () => {
    try { streamRef.current?.getTracks?.().forEach((t) => t.stop()); } catch {}
    streamRef.current = null;
    recRef.current    = null;
    chunksRef.current = [];
  };

  const start = useCallback(async () => {
    setError('');
    if (recording || busy) return false;
    if (!navigator?.mediaDevices?.getUserMedia) {
      setError('Microphone not available in this environment');
      return false;
    }
    try {
      const inputDeviceId = useAudioDevicesStore.getState().inputDeviceId;
      const audioConstraints = inputDeviceId
        ? { deviceId: { exact: inputDeviceId }, echoCancellation: true, noiseSuppression: true }
        : { echoCancellation: true, noiseSuppression: true };
      const stream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints });
      const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : 'audio/webm';
      const rec = new MediaRecorder(stream, { mimeType: mime });

      streamRef.current = stream;
      recRef.current    = rec;
      chunksRef.current = [];

      rec.ondataavailable = (e) => { if (e.data?.size) chunksRef.current.push(e.data); };
      rec.start();
      setRecording(true);
      return true;
    } catch (e) {
      cleanup();
      setError(e?.message || 'Microphone permission denied');
      return false;
    }
  }, [recording, busy]);

  const stop = useCallback(async () => {
    const rec = recRef.current;
    if (!rec) { setRecording(false); return null; }

    const done = new Promise((resolve) => {
      rec.onstop = () => resolve();
    });
    try { rec.stop(); } catch {}
    await done;
    setRecording(false);

    const blob = new Blob(chunksRef.current, { type: rec.mimeType || 'audio/webm' });
    cleanup();
    if (!blob.size) return null;

    setBusy(true);
    try {
      const fd = new FormData();
      fd.append('file', blob, 'audio.webm');
      const res = await fetch(`${backendUrl}/api/voice/transcribe`, { method: 'POST', body: fd });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      const text = (data?.text || '').trim();
      if (text && onTranscript) onTranscript(text);
      return text;
    } catch (e) {
      setError(e?.message || 'Transcription failed');
      return null;
    } finally {
      setBusy(false);
    }
  }, [backendUrl, onTranscript]);

  const toggle = useCallback(() => (recording ? stop() : start()), [recording, start, stop]);

  return { recording, busy, error, start, stop, toggle };
}
