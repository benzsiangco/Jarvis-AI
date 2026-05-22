import { useState } from 'react';
import { Cpu, Globe, HardDrive, ArrowRight, BookOpen, Zap, Sparkles, Github, ChevronRight, Brain, Terminal, Mic } from 'lucide-react';

const VERSION = '1.0.0';

const STEPS = [
  {
    icon: Cpu, color: '#22d3ee', bg: 'rgba(6,182,212,0.08)',
    title: '1. Choose Your Model Source',
    desc: 'Use local GGUF models with llama.cpp, or connect to external providers.',
    options: [
      {
        icon: HardDrive, label: 'Local GGUF Models',
        desc: 'Download Gemma 4, Nemotron, Llama, or any GGUF file and load it directly. Fully offline.',
        action: 'Open Models panel → load a .gguf file',
      },
      {
        icon: Globe, label: 'Cloud Providers',
        desc: 'Connect to OpenAI, Anthropic Claude, Groq, or any OpenAI-compatible endpoint.',
        action: 'Open Providers panel → Add Provider',
      },
      {
        icon: Cpu, label: 'LM Studio / Ollama',
        desc: 'Connect to a local LM Studio or Ollama server running on your machine.',
        action: 'Providers → Add Provider → enter local URL (e.g. http://localhost:1234/v1)',
      },
    ],
  },
  {
    icon: Brain, color: '#a78bfa', bg: 'rgba(167,139,250,0.08)',
    title: '2. What JARVIS Can Do',
    desc: 'JARVIS is an agentic AI — it uses tools to take real actions in your workspace.',
    options: [
      {
        icon: Terminal, label: 'Full Workspace Access',
        desc: 'Read, write, patch files. Run terminal commands. Search code with ripgrep.',
        action: 'Just ask — "create a React component" or "fix the bug in app.js"',
      },
      {
        icon: Globe, label: 'Web Search & Images',
        desc: 'Search the internet, fetch pages, find images, play YouTube videos inline.',
        action: 'Ask "show me images of cats" or "search for latest Node.js news"',
      },
      {
        icon: Brain, label: 'Long-Term Memory',
        desc: 'JARVIS remembers facts about you across sessions. Tell it your name, preferences, projects.',
        action: 'Say "remember my name is..." or check the Memory tab in Settings',
      },
    ],
  },
  {
    icon: Zap, color: '#4ade80', bg: 'rgba(74,222,128,0.08)',
    title: '3. Start Using JARVIS',
    desc: 'Open a workspace and start chatting. JARVIS has full access to your environment.',
    options: [
      {
        icon: HardDrive, label: 'Open a Workspace',
        desc: 'Select any folder — JARVIS can read, write, and run commands inside it.',
        action: 'Click the folder icon in the sidebar or drag a folder in',
      },
      {
        icon: Mic, label: 'Voice Mode',
        desc: 'Hands-free coding with Edge TTS (free, no key) or Fish Audio voice cloning.',
        action: 'Click the microphone icon in the top bar to activate Voice Mode',
      },
      {
        icon: Sparkles, label: 'Prompt Queue',
        desc: 'Queue multiple prompts while JARVIS is busy — they run automatically in order.',
        action: 'Just keep typing while JARVIS is responding — prompts queue automatically',
      },
    ],
  },
];

export default function WelcomeScreen({ onDismiss }) {
  const [step, setStep] = useState(0);
  const s = STEPS[step];

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 99999,
      background: '#07080d',
      display: 'flex', flexDirection: 'column',
      overflow: 'auto',
    }}>
      {/* Top bar */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '14px 24px', borderBottom: '1px solid rgba(255,255,255,0.04)',
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {/* JARVIS logo */}
          <div style={{
            width: 34, height: 34, borderRadius: 9,
            background: 'linear-gradient(135deg, #0891b2 0%, #06b6d4 50%, #22d3ee 100%)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 0 16px rgba(34,211,238,0.3)',
          }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="3" fill="white" opacity="0.9"/>
              <circle cx="12" cy="12" r="7" stroke="white" strokeWidth="1.5" opacity="0.5"/>
              <circle cx="12" cy="12" r="11" stroke="white" strokeWidth="1" opacity="0.2"/>
              <line x1="12" y1="1" x2="12" y2="5" stroke="white" strokeWidth="1.5" opacity="0.7"/>
              <line x1="12" y1="19" x2="12" y2="23" stroke="white" strokeWidth="1.5" opacity="0.7"/>
              <line x1="1" y1="12" x2="5" y2="12" stroke="white" strokeWidth="1.5" opacity="0.7"/>
              <line x1="19" y1="12" x2="23" y2="12" stroke="white" strokeWidth="1.5" opacity="0.7"/>
            </svg>
          </div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#e2e4ea', lineHeight: 1.2 }}>JARVIS AI</div>
            <div style={{ fontSize: 10, color: '#3a3c4e', lineHeight: 1.2 }}>v{VERSION}</div>
          </div>
        </div>
        <button onClick={onDismiss} style={{
          padding: '6px 14px', borderRadius: 7, fontSize: 11, fontWeight: 600,
          background: 'rgba(255,255,255,0.04)', color: '#5e6370',
          border: '1px solid rgba(255,255,255,0.06)', cursor: 'pointer',
          transition: 'color .12s',
        }}
        onMouseEnter={e => e.currentTarget.style.color = '#e2e4ea'}
        onMouseLeave={e => e.currentTarget.style.color = '#5e6370'}
        >Skip</button>
      </div>

      {/* Body */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '32px 20px' }}>
        <div style={{ maxWidth: 660, width: '100%' }}>

          {/* Hero */}
          <div style={{ textAlign: 'center', marginBottom: 28 }}>
            <div style={{
              width: 72, height: 72, borderRadius: 18, margin: '0 auto 14px',
              background: 'linear-gradient(135deg, rgba(6,182,212,0.12), rgba(167,139,250,0.12))',
              border: '1px solid rgba(34,211,238,0.12)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 0 40px rgba(34,211,238,0.08)',
            }}>
              <svg width="36" height="36" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="3" fill="#22d3ee" opacity="0.9"/>
                <circle cx="12" cy="12" r="7" stroke="#22d3ee" strokeWidth="1.5" opacity="0.4"/>
                <circle cx="12" cy="12" r="11" stroke="#22d3ee" strokeWidth="1" opacity="0.15"/>
                <line x1="12" y1="1" x2="12" y2="5" stroke="#22d3ee" strokeWidth="1.5" opacity="0.6"/>
                <line x1="12" y1="19" x2="12" y2="23" stroke="#22d3ee" strokeWidth="1.5" opacity="0.6"/>
                <line x1="1" y1="12" x2="5" y2="12" stroke="#22d3ee" strokeWidth="1.5" opacity="0.6"/>
                <line x1="19" y1="12" x2="23" y2="12" stroke="#22d3ee" strokeWidth="1.5" opacity="0.6"/>
              </svg>
            </div>
            <h1 style={{ fontSize: 24, fontWeight: 700, color: '#e2e4ea', margin: '0 0 6px', letterSpacing: '-0.02em' }}>
              Welcome to JARVIS AI
            </h1>
            <p style={{ fontSize: 12.5, color: '#5e6370', margin: 0, maxWidth: 420, marginLeft: 'auto', marginRight: 'auto', lineHeight: 1.6 }}>
              Your local AI coding assistant. Offline-first, agentic, and fully in your control.
            </p>
          </div>

          {/* Step dots */}
          <div style={{ display: 'flex', justifyContent: 'center', gap: 7, marginBottom: 20 }}>
            {STEPS.map((_, i) => (
              <button key={i} onClick={() => setStep(i)} style={{
                width: i === step ? 24 : 7, height: 7, borderRadius: 4,
                background: i === step ? s.color : 'rgba(255,255,255,0.07)',
                border: 'none', cursor: 'pointer', transition: 'all .2s',
              }} />
            ))}
          </div>

          {/* Step header */}
          <div style={{
            padding: '16px 20px', borderRadius: 11, marginBottom: 12,
            background: s.bg, border: `1px solid ${s.color}18`,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <s.icon size={18} style={{ color: s.color, flexShrink: 0 }} />
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#e2e4ea' }}>{s.title}</div>
                <div style={{ fontSize: 11.5, color: '#5e6370', marginTop: 2 }}>{s.desc}</div>
              </div>
            </div>
          </div>

          {/* Options */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
            {s.options.map((opt, i) => (
              <div key={i} style={{
                display: 'flex', gap: 13, padding: '13px 16px',
                borderRadius: 9, background: 'rgba(255,255,255,0.02)',
                border: '1px solid rgba(255,255,255,0.04)',
                transition: 'border-color .12s',
              }}
              onMouseEnter={e => e.currentTarget.style.borderColor = 'rgba(255,255,255,0.07)'}
              onMouseLeave={e => e.currentTarget.style.borderColor = 'rgba(255,255,255,0.04)'}
              >
                <opt.icon size={15} style={{ color: s.color, flexShrink: 0, marginTop: 2 }} />
                <div>
                  <div style={{ fontSize: 12.5, fontWeight: 600, color: '#c8cad4' }}>{opt.label}</div>
                  <div style={{ fontSize: 11, color: '#5e6370', marginTop: 3, lineHeight: 1.5 }}>{opt.desc}</div>
                  <div style={{
                    marginTop: 5, fontSize: 10, color: '#3a3c4e',
                    fontFamily: 'monospace',
                    display: 'flex', alignItems: 'center', gap: 4,
                  }}>
                    <ChevronRight size={9} /> {opt.action}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Navigation */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 24 }}>
            <button onClick={() => setStep(Math.max(0, step - 1))} disabled={step === 0}
              style={{
                padding: '7px 16px', borderRadius: 7, fontSize: 11.5, fontWeight: 600,
                background: 'rgba(255,255,255,0.03)', color: step === 0 ? '#2a2c3a' : '#5e6370',
                border: '1px solid rgba(255,255,255,0.05)', cursor: step === 0 ? 'default' : 'pointer',
              }}>← Back</button>

            <div style={{ display: 'flex', gap: 7 }}>
              <button onClick={onDismiss} style={{
                padding: '7px 14px', borderRadius: 7, fontSize: 11.5,
                background: 'transparent', color: '#3a3c4e', border: 'none', cursor: 'pointer',
              }}>Dismiss</button>

              {step < STEPS.length - 1 ? (
                <button onClick={() => setStep(step + 1)} style={{
                  display: 'flex', alignItems: 'center', gap: 5,
                  padding: '7px 16px', borderRadius: 7, fontSize: 11.5, fontWeight: 600,
                  background: 'rgba(6,182,212,0.1)', color: '#22d3ee',
                  border: '1px solid rgba(6,182,212,0.15)', cursor: 'pointer',
                }}>Next <ArrowRight size={12} /></button>
              ) : (
                <button onClick={onDismiss} style={{
                  display: 'flex', alignItems: 'center', gap: 5,
                  padding: '7px 16px', borderRadius: 7, fontSize: 11.5, fontWeight: 600,
                  background: 'rgba(74,222,128,0.1)', color: '#4ade80',
                  border: '1px solid rgba(74,222,128,0.15)', cursor: 'pointer',
                }}>Get Started <Zap size={12} /></button>
              )}
            </div>
          </div>

          {/* Footer */}
          <div style={{ marginTop: 24, textAlign: 'center' }}>
            <p style={{ fontSize: 10, color: '#2a2c3a', margin: 0 }}>
              JARVIS AI v{VERSION} · Built by Benz Siangco · Powered by llama.cpp
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
