/**
 * VoiceControls — minimal floating control dock for Voice Mode.
 * TTS toggle · Mic mute · Fullscreen · Settings
 * + inline mic level meter with state label underneath.
 */
import { useState, useEffect } from 'react';
import { Mic, MicOff, Volume2, VolumeX, Settings, Maximize2, Minimize2, Captions, CaptionsOff } from 'lucide-react';
import useModeStore from '../stores/modeStore';
import SettingsModal from './SettingsModal';

export default function VoiceControls({ backendUrl, amplitude = 0, showMeter = false, statusLabel = '', subtitlesOn = true, onToggleSubtitles }) {
  const muted       = useModeStore((s) => s.muted);
  const ttsEnabled  = useModeStore((s) => s.ttsEnabled ?? true);
  const toggleMute  = useModeStore((s) => s.toggleMute);
  const toggleTts   = useModeStore((s) => s.toggleTts);

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const handleChange = async () => {
      const fs = !!document.fullscreenElement;
      setIsFullscreen(fs);
      if (fs && navigator.keyboard?.lock) {
        try { await navigator.keyboard.lock(['Escape']); } catch {}
      } else if (!fs && navigator.keyboard?.unlock) {
        try { navigator.keyboard.unlock(); } catch {}
      }
    };
    document.addEventListener('fullscreenchange', handleChange);
    return () => document.removeEventListener('fullscreenchange', handleChange);
  }, []);

  const toggleFullscreen = async () => {
    try {
      if (!document.fullscreenElement) await document.documentElement.requestFullscreen();
      else await document.exitFullscreen();
    } catch {}
  };

  const pct = Math.min(100, Math.round((amplitude || 0) * 100));

  return (
    <>
      <div className="vm-controls-wrap">
        <div className="vm-controls">
          {/* TTS output toggle */}
          <ControlBtn
            label={ttsEnabled ? 'Mute voice output' : 'Unmute voice output'}
            active={ttsEnabled}
            primary={ttsEnabled}
            onClick={toggleTts}
            icon={ttsEnabled ? <Volume2 size={16} /> : <VolumeX size={16} />}
          />

          {/* Mic mute toggle */}
          <ControlBtn
            label={muted ? 'Unmute mic' : 'Mute mic'}
            active={!muted}
            onClick={toggleMute}
            icon={muted ? <MicOff size={18} /> : <Mic size={18} />}
          />

          {/* Subtitles toggle — next to mic */}
          <ControlBtn
            label={subtitlesOn ? 'Hide subtitles' : 'Show subtitles'}
            active={subtitlesOn}
            onClick={onToggleSubtitles}
            icon={subtitlesOn ? <Captions size={15} /> : <CaptionsOff size={15} />}
          />

          <ControlBtn
            label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
            active={isFullscreen}
            onClick={toggleFullscreen}
            icon={isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
          />

          <ControlBtn
            label="Settings"
            onClick={() => setSettingsOpen(true)}
            icon={<Settings size={16} />}
          />
        </div>

        {/* Mic meter + state label — below the buttons */}
        {showMeter && (
          <div className="vm-meter-row">
            <span className="vm-meter-bar">
              <span className="vm-mic-fill" style={{ width: `${pct}%` }} />
            </span>
            {statusLabel && (
              <span className="vm-meter-label">{statusLabel}</span>
            )}
          </div>
        )}
      </div>

      <SettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        backendUrl={backendUrl}
      />
    </>
  );
}

function ControlBtn({ icon, label, onClick, active, primary, disabled }) {
  const cls =
    'vm-ctrl-btn' +
    (primary ? ' vm-ctrl-btn-primary' : '') +
    (active && !primary ? ' vm-ctrl-btn-active' : '') +
    (disabled ? ' vm-ctrl-btn-disabled' : '');
  return (
    <button type="button" className={cls} onClick={onClick} disabled={disabled} title={label} aria-label={label}>
      {icon}
    </button>
  );
}
