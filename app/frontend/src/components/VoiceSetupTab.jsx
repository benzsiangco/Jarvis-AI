/**
 * VoiceSetupTab — installs Python voice dependencies in-app.
 * No terminal popup. Progress streamed via SSE from /api/voice/setup.
 */
import { CheckCircle2, XCircle, Loader2, Download, RefreshCw, Package, AlertCircle } from 'lucide-react';
import useVoiceSetup from '../hooks/useVoiceSetup';

export default function VoiceSetupTab({ backendUrl }) {
  const { status, packages, log, startInstall, retry } = useVoiceSetup(backendUrl);

  const doneCount = packages.filter((p) => p.status === 'done').length;
  const total     = packages.length;
  const progress  = total > 0 ? Math.round((doneCount / total) * 100) : 0;

  return (
    <div className="vst-root">
      {/* Header card */}
      <div className="vst-status-card">
        <StatusIcon status={status} />
        <div className="vst-status-text">
          <div className="vst-status-label">{labelFor(status, doneCount, total)}</div>
          <div className="vst-status-sub">{subFor(status)}</div>
        </div>
      </div>

      {/* Progress bar */}
      {(status === 'installing') && (
        <div className="vst-progress-track">
          <div className="vst-progress-fill" style={{ width: `${progress}%` }} />
        </div>
      )}

      {/* Package list */}
      <div className="vst-pkg-list">
        {packages.map((pkg) => (
          <div key={pkg.name} className={`vst-pkg-row ${pkg.status}`}>
            <PkgIcon status={pkg.status} />
            <div className="vst-pkg-info">
              <span className="vst-pkg-label">{pkg.label}</span>
              <span className="vst-pkg-size">{pkg.size}</span>
            </div>
            <span className={`vst-pkg-badge ${pkg.status}`}>{badgeText(pkg.status)}</span>
            {pkg.error && (
              <div className="vst-pkg-error">{pkg.error}</div>
            )}
          </div>
        ))}
      </div>

      {/* Log output */}
      {log.length > 0 && (
        <div className="vst-log">
          {log.map((line, i) => (
            <div key={i} className="vst-log-line">{line}</div>
          ))}
        </div>
      )}

      {/* Actions */}
      <div className="vst-actions">
        {(status === 'idle') && (
          <button className="vst-btn vst-btn-primary" onClick={startInstall}>
            <Download size={13} /> Install Voice Dependencies
          </button>
        )}
        {status === 'installing' && (
          <button className="vst-btn vst-btn-disabled" disabled>
            <Loader2 size={13} className="vst-spin" /> Installing…
          </button>
        )}
        {status === 'done' && (
          <div className="vst-done-msg">
            <CheckCircle2 size={14} style={{ color: '#34d399' }} />
            All dependencies installed. Voice is ready.
          </div>
        )}
        {status === 'error' && (
          <button className="vst-btn vst-btn-warn" onClick={retry}>
            <RefreshCw size={13} /> Retry
          </button>
        )}
      </div>

      {/* Python hint */}
      {(status === 'idle' || status === 'error') && (
        <div className="vst-hint">
          <AlertCircle size={11} />
          Requires <strong>Python 3.9+</strong> installed on your system.
          Download from <a href="https://python.org" target="_blank" rel="noreferrer" className="vst-link">python.org</a>
        </div>
      )}

      <style>{`
        .vst-root { display: flex; flex-direction: column; gap: 14px; }

        .vst-status-card {
          display: flex; align-items: center; gap: 14px;
          padding: 14px 16px; border-radius: 10px;
          background: rgba(255,255,255,0.03);
          border: 1px solid rgba(255,255,255,0.07);
        }
        .vst-status-text { display: flex; flex-direction: column; gap: 3px; }
        .vst-status-label { font-size: 13px; font-weight: 600; color: #e2e8f0; }
        .vst-status-sub   { font-size: 11px; color: #5e6370; }

        .vst-progress-track {
          height: 4px; border-radius: 2px;
          background: rgba(255,255,255,0.06); overflow: hidden;
        }
        .vst-progress-fill {
          height: 100%; border-radius: 2px;
          background: linear-gradient(90deg, #06b6d4, #22d3ee);
          transition: width 0.4s ease;
        }

        .vst-pkg-list { display: flex; flex-direction: column; gap: 6px; }
        .vst-pkg-row {
          display: flex; align-items: center; gap: 10px;
          padding: 8px 12px; border-radius: 8px;
          background: rgba(255,255,255,0.02);
          border: 1px solid rgba(255,255,255,0.05);
          flex-wrap: wrap;
        }
        .vst-pkg-row.installing { border-color: rgba(34,211,238,0.2); background: rgba(34,211,238,0.04); }
        .vst-pkg-row.done       { border-color: rgba(52,211,153,0.15); background: rgba(52,211,153,0.03); }
        .vst-pkg-row.error      { border-color: rgba(248,113,113,0.2); background: rgba(248,113,113,0.04); }

        .vst-pkg-info { display: flex; flex-direction: column; gap: 1px; flex: 1; min-width: 0; }
        .vst-pkg-label { font-size: 12px; color: #cbd5e1; font-weight: 500; }
        .vst-pkg-size  { font-size: 10px; color: #4a5060; }
        .vst-pkg-error { width: 100%; font-size: 10px; color: #f87171; padding-top: 2px; }

        .vst-pkg-badge {
          font-size: 9px; font-weight: 700; padding: 2px 7px; border-radius: 4px;
          text-transform: uppercase; letter-spacing: .05em; flex-shrink: 0;
        }
        .vst-pkg-badge.pending    { background: rgba(255,255,255,0.05); color: #5e6370; border: 1px solid rgba(255,255,255,0.08); }
        .vst-pkg-badge.installing { background: rgba(34,211,238,0.12); color: #22d3ee; border: 1px solid rgba(34,211,238,0.25); }
        .vst-pkg-badge.done       { background: rgba(52,211,153,0.12); color: #34d399; border: 1px solid rgba(52,211,153,0.25); }
        .vst-pkg-badge.error      { background: rgba(248,113,113,0.12); color: #f87171; border: 1px solid rgba(248,113,113,0.25); }

        .vst-log {
          padding: 8px 12px; border-radius: 8px; max-height: 100px; overflow-y: auto;
          background: rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.05);
        }
        .vst-log-line { font-size: 10px; color: #4a5060; font-family: monospace; line-height: 1.6; }

        .vst-actions { display: flex; align-items: center; gap: 10px; }
        .vst-btn {
          display: inline-flex; align-items: center; gap: 7px;
          height: 32px; padding: 0 16px; border-radius: 8px;
          font-size: 12px; font-weight: 600; cursor: pointer; border: 1px solid;
          transition: all .15s;
        }
        .vst-btn-primary {
          background: rgba(6,182,212,0.15); color: #67e8f9;
          border-color: rgba(6,182,212,0.3);
        }
        .vst-btn-primary:hover { background: rgba(6,182,212,0.25); }
        .vst-btn-warn {
          background: rgba(251,191,36,0.1); color: #fbbf24;
          border-color: rgba(251,191,36,0.25);
        }
        .vst-btn-warn:hover { background: rgba(251,191,36,0.18); }
        .vst-btn-disabled {
          background: rgba(255,255,255,0.04); color: #5e6370;
          border-color: rgba(255,255,255,0.08); cursor: not-allowed;
        }
        .vst-done-msg {
          display: flex; align-items: center; gap: 7px;
          font-size: 12px; color: #34d399;
        }
        .vst-hint {
          display: flex; align-items: center; gap: 6px;
          font-size: 11px; color: #4a5060; line-height: 1.5;
        }
        .vst-link { color: #67e8f9; text-decoration: none; }
        .vst-link:hover { text-decoration: underline; }
        .vst-spin { animation: vst-spin 1s linear infinite; }
        @keyframes vst-spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}

function StatusIcon({ status }) {
  if (status === 'done')
    return <CheckCircle2 size={28} style={{ color: '#34d399', flexShrink: 0 }} />;
  if (status === 'error')
    return <XCircle size={28} style={{ color: '#f87171', flexShrink: 0 }} />;
  if (status === 'installing')
    return <Loader2 size={28} style={{ color: '#22d3ee', flexShrink: 0 }} className="vst-spin" />;
  return <Package size={28} style={{ color: '#5e6370', flexShrink: 0 }} />;
}

function PkgIcon({ status }) {
  if (status === 'done')      return <CheckCircle2 size={14} style={{ color: '#34d399', flexShrink: 0 }} />;
  if (status === 'error')     return <XCircle size={14} style={{ color: '#f87171', flexShrink: 0 }} />;
  if (status === 'installing') return <Loader2 size={14} style={{ color: '#22d3ee', flexShrink: 0 }} className="vst-spin" />;
  return <div style={{ width: 14, height: 14, borderRadius: '50%', border: '1.5px solid #3a3c4e', flexShrink: 0 }} />;
}

function badgeText(status) {
  switch (status) {
    case 'pending':    return 'Pending';
    case 'installing': return 'Installing';
    case 'done':       return 'Done';
    case 'error':      return 'Error';
    default:           return status;
  }
}

function labelFor(status, done, total) {
  switch (status) {
    case 'idle':       return 'Voice Dependencies';
    case 'installing': return `Installing… (${done}/${total})`;
    case 'done':       return 'All dependencies installed';
    case 'error':      return 'Installation failed';
    default:           return 'Voice Dependencies';
  }
}

function subFor(status) {
  switch (status) {
    case 'idle':       return 'Install Python packages required for local STT and TTS.';
    case 'installing': return 'Downloading and installing packages. This may take a few minutes.';
    case 'done':       return 'faster-whisper, FastAPI, edge-tts and all dependencies are ready.';
    case 'error':      return 'One or more packages failed to install. Check the log below.';
    default:           return '';
  }
}
