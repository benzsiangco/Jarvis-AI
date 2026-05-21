import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X, Settings as SettingsIcon, FileText, Wand2, Mic, Brain, Sparkles } from 'lucide-react';
import SystemPromptTab from './SystemPromptTab';
import SkillsToolsTab from './SkillsToolsTab';
import VoiceSettings from './VoiceSettings';
import MemoryTab from './MemoryTab';
import SelfImprovementTab from './SelfImprovementTab';

export default function SettingsModal({ open, onClose, backendUrl }) {
  const [tab, setTab] = useState('prompt');
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const html = document.documentElement;
    const body = document.body;
    const prevH = html.style.overflow;
    const prevB = body.style.overflow;
    html.style.overflow = 'hidden';
    body.style.overflow = 'hidden';
    const clickHandler = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose(); };
    const keyHandler = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('mousedown', clickHandler);
    document.addEventListener('keydown', keyHandler);
    return () => {
      html.style.overflow = prevH;
      body.style.overflow = prevB;
      document.removeEventListener('mousedown', clickHandler);
      document.removeEventListener('keydown', keyHandler);
    };
  }, [open, onClose]);

  if (!open) return null;

  return createPortal((
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(0,0,0,0.6)',
      backdropFilter: 'blur(6px)',
      animation: 'ms-fade-in .15s ease-out',
      overscrollBehavior: 'contain',
    }}>
      <div ref={ref} style={{
        width: 560, maxWidth: '92vw',
        height: '70vh', maxHeight: 680,
        display: 'flex', flexDirection: 'column',
        borderRadius: 16,
        background: 'linear-gradient(180deg, #0d1117 0%, #0a0a0f 100%)',
        border: '1px solid rgba(255,255,255,0.06)',
        boxShadow: '0 32px 80px rgba(0,0,0,0.7)',
        animation: 'ms-slide-up .2s cubic-bezier(0.16,1,0.3,1)',
        overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '14px 18px',
          borderBottom: '1px solid rgba(255,255,255,0.04)',
          background: 'rgba(0,0,0,0.2)',
        }}>
          <SettingsIcon size={15} style={{ color: '#22d3ee' }} />
          <span style={{ fontSize: 13, fontWeight: 700, color: '#e2e8f0' }}>Settings</span>

          <div style={{ flex: 1 }} />

          {/* Tabs */}
          <div style={{ display: 'flex', gap: 3 }}>
            {[
              { id: 'prompt',  icon: FileText,  label: 'Prompt' },
              { id: 'skills',  icon: Wand2,     label: 'Skills & Tools' },
              { id: 'memory',  icon: Brain,      label: 'Memory' },
              { id: 'improve', icon: Sparkles,   label: 'Improve' },
              { id: 'voice',   icon: Mic,        label: 'Voice' },
            ].map(({ id, icon: Icon, label }) => (
              <button key={id} onClick={() => setTab(id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 5,
                  padding: '5px 11px', borderRadius: 7, fontSize: 11, fontWeight: 600,
                  background: tab === id ? 'rgba(6,182,212,0.1)' : 'transparent',
                  color: tab === id ? '#22d3ee' : '#5e6370',
                  border: tab === id ? '1px solid rgba(6,182,212,0.15)' : '1px solid transparent',
                  transition: 'all .12s', cursor: 'pointer',
                }}
                onMouseEnter={e => { if (tab !== id) { e.currentTarget.style.color = '#8b8d99'; e.currentTarget.style.background = 'rgba(255,255,255,0.03)'; }}}
                onMouseLeave={e => { if (tab !== id) { e.currentTarget.style.color = '#5e6370'; e.currentTarget.style.background = 'transparent'; }}}
              >
                <Icon size={12} /> {label}
              </button>
            ))}
          </div>

          <button onClick={onClose}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: 28, height: 28, borderRadius: 8,
              color: '#5e6370', border: 'none', cursor: 'pointer',
              transition: 'all .12s',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.07)'; e.currentTarget.style.color = '#e2e8f0'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#5e6370'; }}
          >
            <X size={15} />
          </button>
        </div>

        {/* Content */}
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '18px' }}>
          {tab === 'prompt'  && <SystemPromptTab backendUrl={backendUrl} />}
          {tab === 'skills'  && <SkillsToolsTab />}
          {tab === 'memory'  && <MemoryTab backendUrl={backendUrl} />}
          {tab === 'improve' && <SelfImprovementTab backendUrl={backendUrl} />}
          {tab === 'voice'   && <VoiceSettings backendUrl={backendUrl} />}
        </div>
      </div>

      <style>{`
        @keyframes ms-fade-in { from { opacity: 0; } to { opacity: 1; } }
        @keyframes ms-slide-up { from { opacity: 0; transform: translateY(16px) scale(.98); } to { opacity: 1; transform: translateY(0) scale(1); } }
      `}</style>
    </div>
  ), document.body);
}
