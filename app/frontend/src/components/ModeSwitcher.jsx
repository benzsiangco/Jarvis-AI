/**
 * ModeSwitcher — floating pill that switches between Chat / Voice / Agent.
 *
 * Lives at the top-center of the workspace and stays out of the way.
 * Switching is instant; underlying chat / editor / terminal stores
 * are not touched, so returning to a mode restores its UI exactly.
 */
import { MessageSquare, Mic } from 'lucide-react';
import useModeStore from '../stores/modeStore';

const MODES = [
  { id: 'voice', label: 'Jarvis', icon: Mic },
  { id: 'chat',  label: 'Chat',   icon: MessageSquare },
];

export default function ModeSwitcher({ variant = 'floating' }) {
  const currentMode = useModeStore((s) => s.currentMode);
  const setMode     = useModeStore((s) => s.setMode);

  return (
    <div className={`mode-switcher mode-switcher-${variant}`}>
      {MODES.map((m) => {
        const Icon = m.icon;
        const active = currentMode === m.id;
        return (
          <button
            key={m.id}
            type="button"
            onClick={() => setMode(m.id)}
            className={`mode-switcher-btn ${active ? 'mode-switcher-btn-active' : ''}`}
            title={`${m.label} mode`}
            aria-pressed={active}
          >
            <Icon size={12} />
            <span>{m.label}</span>
          </button>
        );
      })}
    </div>
  );
}
