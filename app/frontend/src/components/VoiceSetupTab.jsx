/**
 * VoiceSetupTab — installs Python voice dependencies.
 * Matches Runtime Manager UI: speed, ETA, bytes, cancel, selectable packages.
 */
import { useState } from 'react';
import {
  CheckCircle, XCircle, Loader2, Download, RefreshCw,
  Package, AlertCircle, X, Activity, Clock, Zap,
} from 'lucide-react';
import useVoiceSetup from '../hooks/useVoiceSetup';

function fmtBytes(b) {
  if (!b || b === 0) return '0 B';
  const u = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(b) / Math.log(1024));
  return `${(b / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0)} ${u[i]}`;
}

function fmtEta(s) {
  if (!s || s <= 0) return '';
  if (s < 60) return `${Math.ceil(s)}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m ${Math.ceil(s % 60)}s`;
  return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
}

function fmtSpeed(bps) {
  if (!bps || bps <= 0) return '';
  return `${fmtBytes(bps)}/s`;
}

export default function VoiceSetupTab({ backendUrl }) {
  const { status, packages, log, startInstall, retry, toggleSelect } = useVoiceSetup(backendUrl);
  const [showLog, setShowLog] = useState(false);

  const doneCount    = packages.filter((p) => p.status === 'done').length;
  const total        = packages.length;
  const selectedPkgs = packages.filter((p) => p.selected);
  const isIdle       = status === 'idle';
  const isInstalling = status === 'installing';
  const isDone       = status === 'done';
  const isError      = status === 'error';

  // Active download (currently installing package)
  const activePkg = packages.find((p) => p.status === 'installing');

  const handleInstall = () => {
    const names = selectedPkgs.map((p) => p.name);
    startInstall(names.length === total ? null : names);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* ── Active download banner (like Runtime Manager) ── */}
      {isInstalling && activePkg && (
        <div style={{
          padding: '12px 16px',
          borderRadius: 10,
          background: 'rgba(6,182,212,0.04)',
          border: '1px solid rgba(6,182,212,0.12)',
        }}>
          {/* Top row: label + speed + cancel */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
            <Loader2 size={14} style={{ color: '#22d3ee', animation: 'vs-spin .8s linear infinite', flexShrink: 0 }} />
            <span style={{ fontSize: 12, fontWeight: 600, color: '#22d3ee', flex: 1 }}>
              Installing {activePkg.label}…
            </span>
            {activePkg.speed > 0 && (
              <span style={{ fontSize: 11, color: '#5e6370', fontFamily: 'monospace' }}>
                {fmtSpeed(activePkg.speed)}
              </span>
            )}
            <button
              onClick={retry}
              style={{
                padding: '3px 10px', borderRadius: 5, fontSize: 10, fontWeight: 600,
                background: 'rgba(248,113,113,0.1)', color: '#f87171',
                border: '1px solid rgba(248,113,113,0.2)', cursor: 'pointer',
              }}
            >
              Cancel
            </button>
          </div>

          {/* Progress bar + bytes + ETA */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ flex: 1, height: 6, borderRadius: 3, background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
              <div style={{
                width: `${activePkg.percent || 0}%`, height: '100%',
                background: 'linear-gradient(90deg, #0891b2, #22d3ee)',
                borderRadius: 3, transition: 'width .3s',
              }} />
            </div>
            <span style={{ fontSize: 11, color: '#5e6370', fontFamily: 'monospace', whiteSpace: 'nowrap' }}>
              {fmtBytes(activePkg.downloaded)} / {fmtBytes(activePkg.total)}
            </span>
            {activePkg.eta > 0 && (
              <span style={{ fontSize: 11, color: '#5e6370', fontFamily: 'monospace', whiteSpace: 'nowrap' }}>
                ETA {fmtEta(activePkg.eta)}
              </span>
            )}
          </div>

          {/* Overall progress */}
          <div style={{ marginTop: 8, fontSize: 11, color: '#4a5060' }}>
            Package {doneCount + 1} of {total} · {doneCount} completed
          </div>
        </div>
      )}

      {/* ── Done banner ── */}
      {isDone && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '12px 16px', borderRadius: 10,
          background: 'rgba(52,211,153,0.05)',
          border: '1px solid rgba(52,211,153,0.15)',
        }}>
          <CheckCircle size={18} style={{ color: '#34d399', flexShrink: 0 }} />
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#34d399' }}>All dependencies installed</div>
            <div style={{ fontSize: 11, color: '#5e6370', marginTop: 2 }}>faster-whisper, FastAPI, edge-tts and all packages are ready.</div>
          </div>
        </div>
      )}

      {/* ── Error banner ── */}
      {isError && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '12px 16px', borderRadius: 10,
          background: 'rgba(248,113,113,0.05)',
          border: '1px solid rgba(248,113,113,0.15)',
        }}>
          <XCircle size={18} style={{ color: '#f87171', flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#f87171' }}>Installation failed</div>
            <div style={{ fontSize: 11, color: '#5e6370', marginTop: 2 }}>Check the log below for details.</div>
          </div>
          <button onClick={retry} style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '5px 12px', borderRadius: 7, fontSize: 11, fontWeight: 600,
            background: 'rgba(248,113,113,0.1)', color: '#f87171',
            border: '1px solid rgba(248,113,113,0.2)', cursor: 'pointer',
          }}>
            <RefreshCw size={11} /> Reset
          </button>
        </div>
      )}

      {/* ── Package list ── */}
      <div>
        <div style={{
          fontSize: 11, fontWeight: 700, letterSpacing: '.06em',
          textTransform: 'uppercase', color: '#5e6370', marginBottom: 10,
        }}>
          Packages {isIdle && <span style={{ color: '#3a3c4e', fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>— click to select/deselect</span>}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {packages.map((pkg) => {
            const isActive = pkg.status === 'installing';
            const isDonePkg = pkg.status === 'done';
            const isErrPkg = pkg.status === 'error';

            return (
              <div
                key={pkg.name}
                onClick={() => isIdle && toggleSelect(pkg.name)}
                style={{
                  display: 'flex', flexDirection: 'column', gap: 6,
                  padding: '12px 14px', borderRadius: 10,
                  background: isActive ? 'rgba(6,182,212,0.04)'
                    : isDonePkg ? 'rgba(52,211,153,0.03)'
                    : isErrPkg ? 'rgba(248,113,113,0.04)'
                    : pkg.selected ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.01)',
                  border: isActive ? '1px solid rgba(6,182,212,0.2)'
                    : isDonePkg ? '1px solid rgba(52,211,153,0.12)'
                    : isErrPkg ? '1px solid rgba(248,113,113,0.2)'
                    : pkg.selected ? '1px solid rgba(255,255,255,0.07)' : '1px solid rgba(255,255,255,0.03)',
                  cursor: isIdle ? 'pointer' : 'default',
                  transition: 'all .12s',
                }}
              >
                {/* Row: icon + info + badge */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  {/* Selection circle / status icon */}
                  <div style={{ flexShrink: 0, width: 18, height: 18, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {isDonePkg ? (
                      <CheckCircle size={16} style={{ color: '#34d399' }} />
                    ) : isErrPkg ? (
                      <XCircle size={16} style={{ color: '#f87171' }} />
                    ) : isActive ? (
                      <Loader2 size={16} style={{ color: '#22d3ee', animation: 'vs-spin .8s linear infinite' }} />
                    ) : (
                      <div style={{
                        width: 14, height: 14, borderRadius: '50%',
                        border: `2px solid ${pkg.selected ? '#22d3ee' : '#3a3c4e'}`,
                        background: pkg.selected ? 'rgba(34,211,238,0.15)' : 'transparent',
                        transition: 'all .12s',
                      }} />
                    )}
                  </div>

                  {/* Label + size */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: isDonePkg ? '#94a3b8' : '#cbd5e1' }}>
                      {pkg.label}
                    </div>
                    <div style={{ fontSize: 10, color: '#4a5060', marginTop: 1 }}>
                      {pkg.size}
                      {pkg.elapsed > 0 && isDonePkg && (
                        <span style={{ marginLeft: 8, color: '#34d399' }}>✓ {pkg.elapsed}s</span>
                      )}
                    </div>
                  </div>

                  {/* Status badge */}
                  <StatusBadge status={pkg.status} selected={pkg.selected} />
                </div>

                {/* Per-package progress bar (only when installing) */}
                {isActive && pkg.total > 0 && (
                  <div style={{ paddingLeft: 28 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                      <div style={{ flex: 1, height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
                        <div style={{
                          width: `${pkg.percent || 0}%`, height: '100%',
                          background: 'linear-gradient(90deg, #0891b2, #22d3ee)',
                          borderRadius: 2, transition: 'width .3s',
                        }} />
                      </div>
                      <span style={{ fontSize: 10, color: '#5e6370', fontFamily: 'monospace', whiteSpace: 'nowrap' }}>
                        {pkg.percent || 0}%
                      </span>
                    </div>
                    <div style={{ display: 'flex', gap: 14, fontSize: 10, color: '#4a5060', fontFamily: 'monospace' }}>
                      <span>{fmtBytes(pkg.downloaded)} / {fmtBytes(pkg.total)}</span>
                      {pkg.speed > 0 && <span style={{ color: '#22d3ee' }}>{fmtSpeed(pkg.speed)}</span>}
                      {pkg.eta > 0 && <span>ETA {fmtEta(pkg.eta)}</span>}
                    </div>
                  </div>
                )}

                {/* Error message */}
                {isErrPkg && pkg.error && (
                  <div style={{ paddingLeft: 28, fontSize: 10, color: '#f87171' }}>{pkg.error}</div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Action buttons ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        {isIdle && (
          <button
            onClick={handleInstall}
            disabled={selectedPkgs.length === 0}
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              height: 36, padding: '0 20px', borderRadius: 9,
              fontSize: 12, fontWeight: 700, cursor: selectedPkgs.length === 0 ? 'not-allowed' : 'pointer',
              background: selectedPkgs.length === 0 ? 'rgba(255,255,255,0.04)' : 'rgba(6,182,212,0.15)',
              color: selectedPkgs.length === 0 ? '#3a3c4e' : '#67e8f9',
              border: selectedPkgs.length === 0 ? '1px solid rgba(255,255,255,0.06)' : '1px solid rgba(6,182,212,0.3)',
              transition: 'all .15s',
            }}
          >
            <Download size={13} />
            Install {selectedPkgs.length < total ? `${selectedPkgs.length} Selected` : 'All'} Packages
          </button>
        )}

        {isInstalling && (
          <button
            onClick={retry}
            style={{
              display: 'flex', alignItems: 'center', gap: 7,
              height: 36, padding: '0 18px', borderRadius: 9,
              fontSize: 12, fontWeight: 600, cursor: 'pointer',
              background: 'rgba(248,113,113,0.1)', color: '#f87171',
              border: '1px solid rgba(248,113,113,0.2)',
            }}
          >
            <X size={12} /> Cancel Installation
          </button>
        )}

        {isDone && (
          <button
            onClick={retry}
            style={{
              display: 'flex', alignItems: 'center', gap: 7,
              height: 36, padding: '0 18px', borderRadius: 9,
              fontSize: 12, fontWeight: 600, cursor: 'pointer',
              background: 'rgba(255,255,255,0.04)', color: '#5e6370',
              border: '1px solid rgba(255,255,255,0.07)',
            }}
          >
            <RefreshCw size={12} /> Reinstall
          </button>
        )}

        {isError && (
          <button
            onClick={handleInstall}
            style={{
              display: 'flex', alignItems: 'center', gap: 7,
              height: 36, padding: '0 18px', borderRadius: 9,
              fontSize: 12, fontWeight: 700, cursor: 'pointer',
              background: 'rgba(6,182,212,0.15)', color: '#67e8f9',
              border: '1px solid rgba(6,182,212,0.3)',
            }}
          >
            <RefreshCw size={12} /> Retry Install
          </button>
        )}

        {/* Log toggle */}
        {log.length > 0 && (
          <button
            onClick={() => setShowLog((v) => !v)}
            style={{
              marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6,
              height: 28, padding: '0 12px', borderRadius: 7,
              fontSize: 10, fontWeight: 600, cursor: 'pointer',
              background: 'rgba(255,255,255,0.04)', color: '#5e6370',
              border: '1px solid rgba(255,255,255,0.06)',
            }}
          >
            {showLog ? 'Hide Log' : 'Show Log'}
          </button>
        )}
      </div>

      {/* ── Log output ── */}
      {showLog && log.length > 0 && (
        <div style={{
          padding: '10px 12px', borderRadius: 8, maxHeight: 140, overflowY: 'auto',
          background: 'rgba(0,0,0,0.35)', border: '1px solid rgba(255,255,255,0.05)',
        }}>
          {log.map((line, i) => (
            <div key={i} style={{ fontSize: 10, color: '#4a5060', fontFamily: 'monospace', lineHeight: 1.7 }}>
              {line}
            </div>
          ))}
        </div>
      )}

      {/* ── Python requirement hint ── */}
      {(isIdle || isError) && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 7,
          fontSize: 11, color: '#4a5060', lineHeight: 1.5,
        }}>
          <AlertCircle size={11} style={{ flexShrink: 0 }} />
          Requires <strong style={{ color: '#7a7f8a' }}>Python 3.9+</strong> installed on your system.
          Download from{' '}
          <a
            href="https://python.org"
            target="_blank"
            rel="noreferrer"
            style={{ color: '#67e8f9', textDecoration: 'none' }}
            onClick={(e) => {
              e.preventDefault();
              if (window.electronAPI?.openPath) window.electronAPI.openPath('https://python.org');
              else window.open('https://python.org', '_blank');
            }}
          >
            python.org
          </a>
        </div>
      )}

      <style>{`
        @keyframes vs-spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}

function StatusBadge({ status, selected }) {
  const cfg = {
    pending:    { bg: selected ? 'rgba(34,211,238,0.08)' : 'rgba(255,255,255,0.04)', color: selected ? '#22d3ee' : '#3a3c4e', border: selected ? 'rgba(34,211,238,0.2)' : 'rgba(255,255,255,0.06)', label: selected ? 'Selected' : 'Skipped' },
    installing: { bg: 'rgba(34,211,238,0.1)',   color: '#22d3ee', border: 'rgba(34,211,238,0.25)', label: 'Installing' },
    done:       { bg: 'rgba(52,211,153,0.1)',   color: '#34d399', border: 'rgba(52,211,153,0.2)',  label: 'Done' },
    error:      { bg: 'rgba(248,113,113,0.1)',  color: '#f87171', border: 'rgba(248,113,113,0.2)', label: 'Error' },
    skipped:    { bg: 'rgba(255,255,255,0.04)', color: '#3a3c4e', border: 'rgba(255,255,255,0.06)', label: 'Skipped' },
  };
  const c = cfg[status] || cfg.pending;
  return (
    <span style={{
      fontSize: 9, fontWeight: 700, padding: '2px 8px', borderRadius: 4,
      textTransform: 'uppercase', letterSpacing: '.05em', flexShrink: 0,
      background: c.bg, color: c.color, border: `1px solid ${c.border}`,
    }}>
      {c.label}
    </span>
  );
}
