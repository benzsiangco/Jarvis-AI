/**
 * VoiceMode — fullscreen immersive voice assistant page.
 *
 * Activation model (simplified):
 *   - Reactor click while inactive → activate (no greeting, just powers on)
 *   - Reactor click while active + idle → deactivate (no shutdown phrase)
 *   - Reactor click while streaming → stop generation, stay active
 *   - Sending a chat message while inactive → auto-activates
 *   - Wake word ("Jarvis ...") → auto-activates
 *   - ESC → interrupts current generation (stays active)
 *
 * No hardcoded greetings or shutdown phrases — Jarvis speaks through the
 * model only. The reactor is a power switch, not a personality trigger.
 */
import { useEffect, useRef, useState } from 'react';
import useModeStore from '../stores/modeStore';
import useChatStore from '../stores/chatStore';
import useThinkingStore from '../stores/thinkingStore';
import useWorkspaceStore from '../stores/workspaceStore';
import usePermissionStore from '../stores/permissionStore';
import useAudioDevicesStore from '../stores/audioDevicesStore';
import useContinuousListen from '../hooks/useContinuousListen';
import useTTSSpeak from '../hooks/useTTSSpeak';
import { matchWakeWord, matchSleepWord, stripWakePrefix } from './wakeWords';
import ArcReactor from './ArcReactor';
import VoiceControls from './VoiceControls';
import ModeSwitcher from './ModeSwitcher';
import ThinkingPanel from './ThinkingPanel';
import VoiceToolCalls from './VoiceToolCalls';
import VoiceSubAgents from './VoiceSubAgents';
import MarkdownRenderer from './MarkdownRenderer';
import { ThinkingIndicator } from './ChatMessage';

const SUBTITLE_KEY = 'jarvis:voiceSubtitles';
const ACTIVE_KEY   = 'jarvis:voiceActive';

export default function VoiceMode({ backendUrl }) {
  const amplitude    = useModeStore((s) => s.amplitude);
  const setReactor   = useModeStore((s) => s.setReactorState);
  const muted        = useModeStore((s) => s.muted);
  const setAmplitude = useModeStore((s) => s.setAmplitude);

  const messages       = useChatStore((s) => s.messages);
  const isStreaming    = useChatStore((s) => s.isStreaming);
  const stopGeneration = useChatStore((s) => s.stopGeneration);
  const sendMessage    = useChatStore((s) => s.sendMessage);
  const permissionMode = usePermissionStore((s) => s.mode);

  const [jarvisActive, setJarvisActive] = useState(false);

  const activate   = () => setJarvisActive(true);
  const deactivate = () => { stopGeneration(); setJarvisActive(false); setReactor('idle'); };

  // Always start inactive on mount
  useEffect(() => {
    setJarvisActive(false);
    try { localStorage.removeItem(ACTIVE_KEY); } catch {}
    setReactor('idle');
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Last raw transcript for diagnostic display
  const [lastHeard, setLastHeard] = useState({ text: '', ts: 0, accepted: false });

  const sendToChat = (text) => {
    const ws = useWorkspaceStore.getState().getActiveWorkspace?.();
    sendMessage(text, backendUrl, { workspacePath: ws?.path || '', permissionMode }).catch(() => {});
  };

  const dispatchTranscript = (text) => {
    if (!text) return;
    setLastHeard({ text, ts: Date.now(), accepted: jarvisActive || !!matchWakeWord(text) });

    if (jarvisActive && matchSleepWord(text)) { deactivate(); return; }

    if (!jarvisActive) {
      const intent = matchWakeWord(text);
      if (!intent) return;
      setJarvisActive(true);
      const remainder = stripWakePrefix(text);
      if (remainder && remainder.length > 2) setTimeout(() => sendToChat(remainder), 100);
      return;
    }

    sendToChat(text);
  };

  const { listening: vadListening } = useContinuousListen({
    enabled: !muted && !isStreaming,
    backendUrl,
    inputDeviceId: useAudioDevicesStore((s) => s.inputDeviceId),
    onAmplitude: setAmplitude,
    onTranscript: dispatchTranscript,
  });

  // Reactor state
  useEffect(() => {
    if (!jarvisActive) { setReactor('idle'); return; }
    if (isStreaming)       setReactor('thinking');
    else if (vadListening) setReactor('listening');
    else                   setReactor('speaking');
  }, [jarvisActive, isStreaming, vadListening, setReactor]);

  // ESC interrupts generation
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== 'Escape' || !isStreaming) return;
      e.preventDefault(); e.stopPropagation();
      if (typeof e.stopImmediatePropagation === 'function') e.stopImmediatePropagation();
      stopGeneration();
    };
    window.addEventListener('keydown', onKey, { capture: true });
    return () => window.removeEventListener('keydown', onKey, { capture: true });
  }, [isStreaming, stopGeneration]);

  // Auto-activate when a chat message starts streaming while inactive
  useEffect(() => {
    if (jarvisActive || !isStreaming) return;
    setJarvisActive(true);
  }, [isStreaming, jarvisActive]);

  // Reactor click
  const handleReactorClick = () => {
    if (!jarvisActive) { activate(); return; }
    if (isStreaming)   { stopGeneration(); return; }
    deactivate();
  };

  // Latest assistant message
  const lastAssistant = [...messages].reverse().find((m) => m.role === 'assistant');
  const currentResponse = typeof lastAssistant?.content === 'string' ? lastAssistant.content : '';

  // TTS — speaks completed responses via Supertonic
  const tts = useTTSSpeak({
    backendUrl,
    enabled: jarvisActive,
    text: currentResponse,
    isStreaming,
    muted: false,
    outputDeviceId: useAudioDevicesStore((s) => s.outputDeviceId),
  });

  // Reactor visual state
  const thinkingStatus = useThinkingStore((s) => s.status);
  const isExecuting = isStreaming && (thinkingStatus === 'running' || thinkingStatus === 'editing' || thinkingStatus === 'inspecting' || thinkingStatus === 'searching');
  const isThinking  = isStreaming && (thinkingStatus === 'thinking' || thinkingStatus === 'planning' || thinkingStatus === 'analyzing');
  const isError     = !!tts.error;

  const isActive    = jarvisActive || isStreaming;
  const isSpeaking  = jarvisActive && isStreaming && currentResponse.length > 0 && !isExecuting && !isThinking;
  const isListening = vadListening && !isStreaming;
  const isLoading   = isStreaming && !currentResponse && !isExecuting && !isThinking;

  const statusLabel = !jarvisActive
    ? 'Standby'
    : muted
      ? 'Mic muted'
      : isStreaming
        ? (isSpeaking ? 'Speaking' : 'Thinking')
        : vadListening
          ? 'Listening'
          : 'Online';

  // Subtitle toggle
  const [subtitlesOn, setSubtitlesOn] = useState(() => {
    try { return localStorage.getItem(SUBTITLE_KEY) !== '0'; } catch { return true; }
  });
  const toggleSubtitles = () => {
    setSubtitlesOn((v) => {
      const next = !v;
      try { localStorage.setItem(SUBTITLE_KEY, next ? '1' : '0'); } catch {}
      return next;
    });
  };

  return (
    <div className="vm-root" role="region" aria-label="Jarvis mode">
      <div className="vm-bg" />
      <div className="vm-vignette" />

      <div className="vm-top">
        <ModeSwitcher variant="floating" />
      </div>

      {isStreaming && (
        <div className="vm-reasoning">
          <ThinkingPanel compact />
        </div>
      )}

      <div className="vm-tools-host">
        <VoiceToolCalls />
        <VoiceSubAgents />
      </div>

      {/* Reactor */}
      <div className="vm-stage">
        <ArcReactor
          isActive={isActive}
          isSpeaking={isSpeaking}
          isListening={isListening}
          isLoading={isLoading}
          isThinking={isThinking}
          isExecuting={isExecuting}
          isError={isError}
          volume={amplitude}
          onClick={handleReactorClick}
        />
      </div>

      {/* Status pill + response — compact, no greeting text */}
      <div className="vm-info">
        {tts.error && (
          <div style={{
            padding: '5px 10px', marginBottom: 6, borderRadius: 8,
            background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.2)',
            color: '#fca5a5', fontSize: 10, fontFamily: 'var(--font-mono)',
            maxWidth: 500, textAlign: 'center',
          }}>
            TTS: {tts.error}
          </div>
        )}

        {subtitlesOn && jarvisActive && (currentResponse || isLoading) && (
          <div className="vm-response">
            <div className="vm-response-inner">
              {currentResponse ? (
                <>
                  <MarkdownRenderer content={currentResponse} compact />
                  {isStreaming && <span className="vm-response-cursor" />}
                </>
              ) : isLoading ? (
                <ThinkingIndicator label="Thinking" />
              ) : null}
            </div>
          </div>
        )}

        {/* Last heard transcript — diagnostic */}
        {lastHeard.text && !currentResponse && !isLoading && (Date.now() - lastHeard.ts < 6000) && (
          <div className="vm-last-heard" title="Most recent transcription">
            <span className={`vm-last-heard-tag ${lastHeard.accepted ? 'accepted' : 'ignored'}`}>
              {lastHeard.accepted ? 'HEARD' : 'IGNORED'}
            </span>
            <span className="vm-last-heard-text">"{lastHeard.text}"</span>
          </div>
        )}
      </div>

      <div className="vm-bottom">
        <VoiceControls
          backendUrl={backendUrl}
          amplitude={amplitude}
          showMeter={jarvisActive && !isStreaming && !muted}
          statusLabel={statusLabel}
          subtitlesOn={subtitlesOn}
          onToggleSubtitles={toggleSubtitles}
        />
      </div>
    </div>
  );
}
