import { useState } from 'react';
import { Cpu, Globe, HardDrive, ArrowRight, BookOpen, Zap, Sparkles, Github, ChevronRight } from 'lucide-react';

const GITHUB_ALPHA = 'https://github.com/anomalco/opencode';

const STEPS = [
  {
    icon: Cpu, color: '#22d3ee', bg: 'rgba(6,182,212,0.08)',
    title: '1. Choose Your Model Source',
    desc: 'Use local GGUF models with llama.cpp, or connect to external providers.',
    options: [
      {
        icon: HardDrive, label: 'Local GGUF Models',
        desc: 'Download Gemma 4, Nemotron, Llama, or any GGUF file and load it directly.',
        action: 'Browse or drop .gguf files into the Models panel',
      },
      {
        icon: Globe, label: 'API Providers',
        desc: 'Connect to OpenAI, Groq, or any OpenAI-compatible endpoint.',
        action: 'Add a provider in the Providers panel',
      },
      {
        icon: Cpu, label: 'LM Studio / Ollama',
        desc: 'Connect to a local LM Studio or Ollama server running on your machine.',
        action: 'Add a provider with the local server URL (e.g. http://localhost:1234/v1)',
      },
    ],
  },
  {
    icon: HardDrive, color: '#a78bfa', bg: 'rgba(167,139,250,0.08)',
    title: '2. Get a Model',
    desc: 'GGUF models run fully offline. Download one and place it in the models/ folder.',
    options: [
      {
        icon: Github, label: 'Hugging Face',
        desc: 'Find thousands of GGUF models — Gemma, Llama, Mistral, DeepSeek, and more.',
        action: 'Search huggingface.co/models for GGUF files',
      },
      {
        icon: Sparkles, label: 'Recommended: Gemma 4',
        desc: 'Google\'s latest 9B model with 128K context. Fast on consumer GPUs.',
        action: 'Look for Gemma-4-9b-it GGUF (Q4_K_M is a good balance)',
      },
      {
        icon: BookOpen, label: 'Quantization Matters',
        desc: 'Q4_K_M = good quality/speed. Q8_0 = best quality. Q2_K = fastest, smaller.',
        action: 'Higher quant = smarter but slower. Choose based on your RAM/VRAM.',
      },
    ],
  },
  {
    icon: Zap, color: '#4ade80', bg: 'rgba(74,222,128,0.08)',
    title: '3. Start Coding',
    desc: 'Open a workspace folder and start chatting with your model.',
    options: [
      {
        icon: BookOpen, label: 'Open a Workspace',
        desc: 'Select any folder — your AI agent can read, write, and run commands in it.',
        action: 'Use the folder icon in the sidebar or File > Open Workspace',
      },
      {
        icon: Cpu, label: 'Agentic Tools',
        desc: 'Your AI can read files, edit code, run terminal commands, search code, and more.',
        action: 'Just ask it to do something — it has full access to your workspace',
      },
      {
        icon: Github, label: 'LM Studio Proxy',
        desc: 'Running LM Studio? Add it as a provider and use any model served there.',
        action: 'Providers panel > Add Provider > LM Studio preset',
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
        padding: '16px 24px', borderBottom: '1px solid rgba(255,255,255,0.04)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 32, height: 32, borderRadius: 8,
            background: 'linear-gradient(135deg, #22d3ee, #0891b2)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Zap size={16} style={{ color: '#fff' }} />
          </div>
          <span style={{ fontSize: 15, fontWeight: 700, color: '#e2e4ea' }}>Jarvis AI</span>
          <span style={{
            padding: '2px 8px', borderRadius: 4, fontSize: 10, fontWeight: 700,
            background: 'rgba(251,191,36,0.1)', color: '#fbbf24',
            border: '1px solid rgba(251,191,36,0.12)',
          }}>Alpha</span>
        </div>
        <button onClick={onDismiss} style={{
          padding: '7px 16px', borderRadius: 8, fontSize: 12, fontWeight: 600,
          background: 'rgba(255,255,255,0.04)', color: '#7a7f8a',
          border: '1px solid rgba(255,255,255,0.06)', cursor: 'pointer',
        }}
        onMouseEnter={e => e.currentTarget.style.color = '#e2e4ea'}
        onMouseLeave={e => e.currentTarget.style.color = '#7a7f8a'}
        >Skip guide</button>
      </div>

      {/* Body */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px 20px' }}>
        <div style={{ maxWidth: 680, width: '100%' }}>
          {/* Title */}
          <div style={{ textAlign: 'center', marginBottom: 32 }}>
            <div style={{
              width: 64, height: 64, borderRadius: 16, margin: '0 auto 16px',
              background: 'linear-gradient(135deg, rgba(6,182,212,0.15), rgba(167,139,250,0.15))',
              border: '1px solid rgba(255,255,255,0.04)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Zap size={28} style={{ color: '#22d3ee' }} />
            </div>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: '#e2e4ea', margin: '0 0 8px' }}>
              Welcome to Jarvis AI
            </h1>
            <p style={{ fontSize: 13, color: '#5e6370', margin: 0, maxWidth: 460, marginLeft: 'auto', marginRight: 'auto' }}>
              Offline-first AI coding IDE. Your code never leaves your machine.
            </p>
          </div>

          {/* Step indicator */}
          <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginBottom: 24 }}>
            {STEPS.map((_, i) => (
              <button key={i} onClick={() => setStep(i)} style={{
                width: i === step ? 28 : 8, height: 8, borderRadius: 4,
                background: i === step ? s.color : 'rgba(255,255,255,0.08)',
                border: 'none', cursor: 'pointer', transition: 'all .2s',
              }} />
            ))}
          </div>

          {/* Step header */}
          <div style={{
            padding: '20px 24px', borderRadius: 12, marginBottom: 16,
            background: s.bg, border: `1px solid ${s.color}15`,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <s.icon size={20} style={{ color: s.color }} />
              <div>
                <div style={{ fontSize: 15, fontWeight: 700, color: '#e2e4ea' }}>{s.title}</div>
                <div style={{ fontSize: 12, color: '#5e6370', marginTop: 2 }}>{s.desc}</div>
              </div>
            </div>
          </div>

          {/* Step options */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {s.options.map((opt, i) => (
              <div key={i} style={{
                display: 'flex', gap: 14, padding: '14px 18px',
                borderRadius: 10, background: 'rgba(255,255,255,0.02)',
                border: '1px solid rgba(255,255,255,0.04)',
              }}>
                <opt.icon size={16} style={{ color: s.color, flexShrink: 0, marginTop: 1 }} />
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#c8cad4' }}>{opt.label}</div>
                  <div style={{ fontSize: 11, color: '#5e6370', marginTop: 3 }}>{opt.desc}</div>
                  <div style={{
                    marginTop: 6, fontSize: 10, color: '#3a3c4e',
                    fontFamily: 'monospace',
                    display: 'flex', alignItems: 'center', gap: 4,
                  }}>
                    <ChevronRight size={10} /> {opt.action}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Navigation */}
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 28 }}>
            <button onClick={() => setStep(Math.max(0, step - 1))} disabled={step === 0}
              style={{
                padding: '8px 18px', borderRadius: 8, fontSize: 12, fontWeight: 600,
                background: 'rgba(255,255,255,0.04)', color: step === 0 ? '#3a3c4e' : '#7a7f8a',
                border: '1px solid rgba(255,255,255,0.06)', cursor: step === 0 ? 'default' : 'pointer',
              }}>Previous</button>

            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={onDismiss} style={{
                padding: '8px 18px', borderRadius: 8, fontSize: 12,
                background: 'transparent', color: '#5e6370', border: 'none', cursor: 'pointer',
              }}>Dismiss</button>

              {step < STEPS.length - 1 ? (
                <button onClick={() => setStep(step + 1)} style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '8px 18px', borderRadius: 8, fontSize: 12, fontWeight: 600,
                  background: 'rgba(6,182,212,0.12)', color: '#22d3ee',
                  border: '1px solid rgba(6,182,212,0.15)', cursor: 'pointer',
                }}>Next <ArrowRight size={13} /></button>
              ) : (
                <button onClick={onDismiss} style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '8px 18px', borderRadius: 8, fontSize: 12, fontWeight: 600,
                  background: 'rgba(74,222,128,0.12)', color: '#4ade80',
                  border: '1px solid rgba(74,222,128,0.15)', cursor: 'pointer',
                }}>Get Started <Zap size={13} /></button>
              )}
            </div>
          </div>

          {/* Footer */}
          <div style={{ marginTop: 32, textAlign: 'center' }}>
            <p style={{ fontSize: 10, color: '#3a3c4e' }}>
              Built by Benz Siangco · Powered by llama.cpp · Gemma 4 GGUF
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
