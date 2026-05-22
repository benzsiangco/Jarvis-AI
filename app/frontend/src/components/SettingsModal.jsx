import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  X, FileText, Wand2, Mic, Brain, Sparkles,
  RefreshCw, Info, Download, CheckCircle2,
  AlertCircle, Loader2, Settings as SettingsIcon,
} from 'lucide-react';
import SystemPromptTab from './SystemPromptTab';
import SkillsToolsTab from './SkillsToolsTab';
import VoiceSettings from './VoiceSettings';
import MemoryTab from './MemoryTab';
import SelfImprovementTab from './SelfImprovementTab';
import useUpdater from '../hooks/useUpdater';

const VERSION = '1.0.0';

const TABS = [
  { id: 'prompt',  icon: FileText,   label: 'Prompt',       desc: 'System instructions & persona' },
  { id: 'skills',  icon: Wand2,      label: 'Skills & Tools', desc: 'Custom tools and commands' },
  { id: 'memory',  icon: Brain,      label: 'Memory',       desc: 'Long-term facts JARVIS knows' },
  { id: 'improve', icon: Sparkles,   label: 'Improve',      desc: 'Self-improvement analysis' },
  { id: 'voice',   icon: Mic,        label: 'Voice',        desc: 'STT / TTS configuration' },
  { id: 'update',  icon: RefreshCw,  label: 'Updates',      desc: 'Check for new versions' },
  { id: 'about',   icon: Info,       label: 'About',        desc: 'Version and credits' },
];

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

  const current = TABS.find((t) => t.id === tab);

  return createPortal((
    <div className="settings-overlay">
      <div ref={ref} className="settings-modal">

        {/* ── Sidebar ── */}
        <aside className="settings-sidebar">
          <div className="settings-sidebar-header">
            <SettingsIcon size={14} style={{ color: '#22d3ee' }} />
            <span>Settings</span>
          </div>

          <nav className="settings-nav">
            {TABS.map(({ id, icon: Icon, label }) => (
              <button
                key={id}
                className={`settings-nav-item ${tab === id ? 'settings-nav-active' : ''}`}
                onClick={() => setTab(id)}
              >
                <Icon size={13} className="settings-nav-icon" />
                <span>{label}</span>
              </button>
            ))}
          </nav>

          <div className="settings-sidebar-footer">
            <span>JARVIS AI v{VERSION}</span>
          </div>
        </aside>

        {/* ── Content ── */}
        <div className="settings-content">
          {/* Content header */}
          <div className="settings-content-header">
            <div>
              <div className="settings-content-title">{current?.label}</div>
              <div className="settings-content-desc">{current?.desc}</div>
            </div>
            <button className="settings-close" onClick={onClose}>
              <X size={14} />
            </button>
          </div>

          {/* Tab body */}
          <div className="settings-body">
            {tab === 'prompt'  && <SystemPromptTab backendUrl={backendUrl} />}
            {tab === 'skills'  && <SkillsToolsTab />}
            {tab === 'memory'  && <MemoryTab backendUrl={backendUrl} />}
            {tab === 'improve' && <SelfImprovementTab backendUrl={backendUrl} />}
            {tab === 'voice'   && <VoiceSettings backendUrl={backendUrl} />}
            {tab === 'update'  && <UpdateTab />}
            {tab === 'about'   && <AboutTab />}
          </div>
        </div>
      </div>
    </div>
  ), document.body);
}

/* ── Update Tab ─────────────────────────────────────────────────────────────── */
function UpdateTab() {
  const { status, version, progress, error, check, install, relaunch } = useUpdater();

  return (
    <div className="settings-section">
      <div className="settings-section-title">Software Updates</div>

      <div className="update-status-card">
        <div className="update-status-icon">
          {status === 'idle' || status === 'uptodate' ? (
            <CheckCircle2 size={28} style={{ color: '#34d399' }} />
          ) : status === 'available' ? (
            <Download size={28} style={{ color: '#22d3ee' }} />
          ) : status === 'checking' || status === 'downloading' ? (
            <Loader2 size={28} style={{ color: '#22d3ee' }} className="animate-spin" />
          ) : status === 'ready' ? (
            <CheckCircle2 size={28} style={{ color: '#4ade80' }} />
          ) : (
            <AlertCircle size={28} style={{ color: '#f87171' }} />
          )}
        </div>
        <div className="update-status-text">
          <div className="update-status-label">
            {status === 'idle' && 'Up to date'}
            {status === 'uptodate' && 'Up to date'}
            {status === 'checking' && 'Checking for updates…'}
            {status === 'available' && `Update available — v${version}`}
            {status === 'downloading' && `Downloading… ${progress}%`}
            {status === 'ready' && 'Update downloaded — restart to apply'}
            {status === 'error' && 'Update check failed'}
          </div>
          <div className="update-status-sub" style={{ color: status === 'error' ? '#f87171' : undefined }}>
            {(status === 'idle' || status === 'uptodate') && `JARVIS AI v${VERSION} is the latest version`}
            {status === 'available' && 'A new version is ready to download and install'}
            {status === 'error' && (error || 'Could not reach update server')}
          </div>
        </div>
      </div>

      {status === 'error' && error?.includes('public') && (
        <div style={{ marginTop: 8, padding: '8px 12px', borderRadius: 8, background: 'rgba(251,191,36,0.06)', border: '1px solid rgba(251,191,36,0.15)', fontSize: 11, color: '#fbbf24', lineHeight: 1.6 }}>
          💡 To enable auto-updates: go to <strong>github.com/benzsiangco/Jarvis-AI</strong> → Settings → Change visibility → <strong>Make public</strong>
        </div>
      )}

      {status === 'downloading' && (
        <div className="update-progress-wrap" style={{ margin: '12px 0' }}>
          <div className="update-progress-bar" style={{ width: `${progress}%` }} />
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
        {(status === 'idle' || status === 'uptodate' || status === 'error') && (
          <button className="settings-btn settings-btn-primary" onClick={check}>
            <RefreshCw size={12} /> Check for Updates
          </button>
        )}
        {status === 'available' && (
          <button className="settings-btn settings-btn-primary" onClick={install}>
            <Download size={12} /> Download & Install
          </button>
        )}
        {status === 'ready' && (
          <button className="settings-btn settings-btn-primary" onClick={relaunch}>
            <RefreshCw size={12} /> Restart Now
          </button>
        )}
      </div>

      <div className="settings-divider" />
      <div className="settings-section-title">Release Channel</div>
      <div className="settings-info-row">
        <span>Channel</span>
        <span className="settings-info-value">Stable</span>
      </div>
      <div className="settings-info-row">
        <span>Current version</span>
        <span className="settings-info-value">v{VERSION}</span>
      </div>
      <div className="settings-info-row">
        <span>Update source</span>
        <a
          href="https://github.com/benzsiangco/Jarvis-AI/releases"
          target="_blank"
          rel="noopener noreferrer"
          className="settings-info-link"
        >
          GitHub Releases ↗
        </a>
      </div>
    </div>
  );
}

/* ── About Tab ──────────────────────────────────────────────────────────────── */
function AboutTab() {
  return (
    <div className="settings-section">
      {/* Logo + name */}
      <div className="about-hero">
        <div className="about-logo">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="3" fill="#22d3ee" opacity="0.9"/>
            <circle cx="12" cy="12" r="7" stroke="#22d3ee" strokeWidth="1.5" opacity="0.4"/>
            <circle cx="12" cy="12" r="11" stroke="#22d3ee" strokeWidth="1" opacity="0.15"/>
            <line x1="12" y1="1" x2="12" y2="5" stroke="#22d3ee" strokeWidth="1.5" opacity="0.6"/>
            <line x1="12" y1="19" x2="12" y2="23" stroke="#22d3ee" strokeWidth="1.5" opacity="0.6"/>
            <line x1="1" y1="12" x2="5" y2="12" stroke="#22d3ee" strokeWidth="1.5" opacity="0.6"/>
            <line x1="19" y1="12" x2="23" y2="12" stroke="#22d3ee" strokeWidth="1.5" opacity="0.6"/>
          </svg>
        </div>
        <div>
          <div className="about-name">JARVIS AI</div>
          <div className="about-tagline">Just A Rather Very Intelligent System</div>
        </div>
      </div>

      <div className="settings-divider" />

      <div className="settings-section-title">Version Info</div>
      <div className="settings-info-row"><span>Version</span><span className="settings-info-value">v{VERSION}</span></div>
      <div className="settings-info-row"><span>Build</span><span className="settings-info-value">Stable</span></div>
      <div className="settings-info-row"><span>Platform</span><span className="settings-info-value">Windows x64 (Tauri v2)</span></div>

      <div className="settings-divider" />

      <div className="settings-section-title">Stack</div>
      {[
        ['Desktop shell', 'Tauri v2 (Rust)'],
        ['Frontend', 'React 19 + Vite + Tailwind CSS v4'],
        ['Editor', 'Monaco Editor'],
        ['Backend', 'Bun'],
        ['AI Runtime', 'llama.cpp'],
        ['State', 'Zustand'],
        ['Search', 'ripgrep'],
      ].map(([k, v]) => (
        <div key={k} className="settings-info-row">
          <span>{k}</span>
          <span className="settings-info-value">{v}</span>
        </div>
      ))}

      <div className="settings-divider" />

      <div className="settings-section-title">Links</div>
      {[
        ['GitHub', 'https://github.com/benzsiangco/Jarvis-AI'],
        ['Releases', 'https://github.com/benzsiangco/Jarvis-AI/releases'],
        ['Issues', 'https://github.com/benzsiangco/Jarvis-AI/issues'],
      ].map(([label, url]) => (
        <div key={label} className="settings-info-row">
          <span>{label}</span>
          <a href={url} target="_blank" rel="noopener noreferrer" className="settings-info-link">
            {url.replace('https://', '')} ↗
          </a>
        </div>
      ))}

      <div className="settings-divider" />
      <div style={{ fontSize: 11, color: '#3a3c4e', textAlign: 'center', paddingTop: 4 }}>
        Built by Benz Siangco · MIT License · © 2026
      </div>
    </div>
  );
}
