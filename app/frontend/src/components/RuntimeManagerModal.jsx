import { useState, useEffect, useRef } from 'react';
import {
  Cpu, Zap, ArrowDown, CheckCircle, X, AlertCircle, Loader2,
  Trash2, RefreshCw, Download, HardDrive, Clock,
  Activity, Server, Layers, Wifi,
} from 'lucide-react';
import useRuntimeStore from '../stores/runtimeStore';
import useModelStore from '../stores/modelStore';

const BACKEND_ICONS = { vulkan: Zap, cpu: Cpu, cuda: Cpu };
const BACKEND_LABELS = { vulkan: 'Vulkan', cpu: 'CPU', cuda: 'CUDA' };

export default function RuntimeManagerModal({ open, onClose, backendUrl }) {
  const [tab, setTab] = useState('available');
  const ref = useRef(null);

  const {
    available, installed, currentVersion, activeDownload, loading, error,
    fetchRuntimes, startDownload, cancelDownload, activateRuntime, removeRuntime, clearError,
  } = useRuntimeStore();

  useEffect(() => {
    if (!open) return;
    fetchRuntimes(backendUrl);
  }, [open, backendUrl, fetchRuntimes]);

  useEffect(() => {
    if (!open) return;
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose(); };
    const keyHandler = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('mousedown', handler);
    document.addEventListener('keydown', keyHandler);
    return () => { document.removeEventListener('mousedown', handler); document.removeEventListener('keydown', keyHandler); };
  }, [open, onClose]);

  const backendConnected = useModelStore((s) => s.backendConnected);
  const activeRt = installed.find((r) => r.active);
  const dl = activeDownload;

  if (!open) return null;

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(6px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div ref={ref} style={{
        width: 720, height: '80vh', display: 'flex', flexDirection: 'column',
        borderRadius: 16, overflow: 'hidden',
        background: '#0b0c13',
        border: '1px solid rgba(255,255,255,0.06)',
        boxShadow: '0 32px 80px rgba(0,0,0,0.7), 0 0 0 1px rgba(6,182,212,0.06)',
      }}>
        {/* Header */}
        <div style={{
          padding: '14px 20px', borderBottom: '1px solid rgba(255,255,255,0.05)',
          background: '#0a0b12',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ display: 'flex', gap: 4, flex: 1 }}>
              {[
                { id: 'available', icon: Download, label: 'Available' },
                { id: 'installed', icon: HardDrive, label: 'Installed' },
              ].map(({ id, icon: Icon, label }) => (
                <button key={id} onClick={() => setTab(id)} style={{
                  display: 'flex', alignItems: 'center', gap: 7,
                  padding: '8px 16px', borderRadius: 8, fontSize: 12, fontWeight: 600,
                  background: tab === id ? 'rgba(6,182,212,0.12)' : 'transparent',
                  color: tab === id ? '#22d3ee' : '#52546a',
                  border: tab === id ? '1px solid rgba(6,182,212,0.18)' : '1px solid transparent',
                  transition: 'all .15s',
                }}
                onMouseEnter={e => { if (tab !== id) { e.currentTarget.style.color = '#8b8d99'; e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; }}}
                onMouseLeave={e => { if (tab !== id) { e.currentTarget.style.color = '#52546a'; e.currentTarget.style.background = 'transparent'; }}}
                >
                  <Icon size={14} /> {label}
                </button>
              ))}
            </div>
            <button onClick={onClose} style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: 30, height: 30, borderRadius: 8,
              background: 'transparent', color: '#52546a', border: 'none', transition: 'all .15s',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.07)'; e.currentTarget.style.color = '#e2e4ea'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#52546a'; }}
            >
              <X size={16} />
            </button>
          </div>

          {/* Active runtime banner */}
          {activeRt && (
            <div style={{
              marginTop: 10, padding: '8px 14px', borderRadius: 8,
              background: 'rgba(6,182,212,0.06)', border: '1px solid rgba(6,182,212,0.12)',
              display: 'flex', alignItems: 'center', gap: 10, fontSize: 12,
            }}>
              <Server size={14} style={{ color: '#22d3ee', flexShrink: 0 }} />
              <span style={{ color: '#7a7f8a' }}>Active Runtime:</span>
              <strong style={{ color: '#22d3ee' }}>
                {BACKEND_LABELS[activeRt.backend] || activeRt.backend} llama.cpp
              </strong>
              <span style={{ color: '#5e6370', fontFamily: 'monospace' }}>v{activeRt.version}</span>
              {currentVersion && (
                <span style={{ color: '#5e6370' }}>
                  · <Layers size={11} style={{ verticalAlign: 'middle' }} />{' '}
                  Current build: b{currentVersion.build}
                </span>
              )}
            </div>
          )}

          {/* No active runtime hint */}
          {!activeRt && installed.length > 0 && (
            <div style={{
              marginTop: 10, padding: '8px 14px', borderRadius: 8,
              background: 'rgba(251,191,36,0.06)', border: '1px solid rgba(251,191,36,0.12)',
              display: 'flex', alignItems: 'center', gap: 8, fontSize: 12,
            }}>
              <AlertCircle size={13} style={{ color: '#fbbf24', flexShrink: 0 }} />
              <span style={{ color: '#d8c885' }}>
                No runtime activated — go to <strong>Installed</strong> tab and click Activate on a runtime.
              </span>
            </div>
          )}
        </div>

        {/* Download progress banner */}
        {dl && (dl.status === 'downloading' || dl.status === 'extracting' || dl.status === 'installing' || dl.status === 'queued') && (
          <div style={{
            padding: '12px 20px', borderBottom: '1px solid rgba(6,182,212,0.08)',
            background: 'rgba(6,182,212,0.04)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
              <Loader2 size={14} style={{ animation: 'rm-spin .8s linear infinite', color: '#22d3ee' }} />
              <span style={{ fontSize: 12, fontWeight: 600, color: '#22d3ee' }}>
                {dl.stage} {dl.backend} runtime...
              </span>
              <span style={{ flex: 1 }} />
              <span style={{ fontSize: 11, color: '#5e6370', fontFamily: 'monospace' }}>
                {dl.speed > 0 ? `${(dl.speed / 1024 / 1024).toFixed(1)} MB/s` : ''}
              </span>
              {dl.status === 'downloading' && (
                <button onClick={() => cancelDownload(backendUrl)} style={{
                  padding: '3px 10px', borderRadius: 5, fontSize: 10, fontWeight: 600,
                  background: 'rgba(248,113,113,0.1)', color: '#f87171',
                  border: '1px solid rgba(248,113,113,0.2)', cursor: 'pointer',
                }}>Cancel</button>
              )}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ flex: 1, height: 6, borderRadius: 3, background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
                <div style={{
                  width: `${(dl.progress * 100).toFixed(1)}%`, height: '100%',
                  background: 'linear-gradient(90deg, #0891b2, #22d3ee)',
                  borderRadius: 3, transition: 'width .3s',
                }} />
              </div>
              <span style={{ fontSize: 11, color: '#5e6370', fontFamily: 'monospace', whiteSpace: 'nowrap' }}>
                {formatBytes(dl.downloaded)} / {formatBytes(dl.total)}
              </span>
              {dl.eta > 0 && dl.status === 'downloading' && (
                <span style={{ fontSize: 11, color: '#5e6370', fontFamily: 'monospace', whiteSpace: 'nowrap' }}>
                  ETA: {formatEta(dl.eta)}
                </span>
              )}
            </div>
          </div>
        )}

        {/* Error banner */}
        {(error) && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '10px 20px', borderBottom: '1px solid rgba(248,113,113,0.12)',
            background: 'rgba(248,113,113,0.05)', fontSize: 12, color: '#f87171',
          }}>
            <AlertCircle size={14} style={{ flexShrink: 0 }} />
            <span style={{ flex: 1 }}>{error}</span>
            <button onClick={clearError} style={{ background: 'none', border: 'none', color: '#f87171', cursor: 'pointer' }}><X size={14} /></button>
          </div>
        )}

        {/* Body */}
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '18px 20px' }}>
          {!backendConnected ? (
            <div style={{ padding: '60px 0', textAlign: 'center', color: '#5e6370' }}>
              <Wifi size={28} style={{ margin: '0 auto 12px', opacity: 0.3 }} />
              <div style={{ fontSize: 13 }}>Connecting to backend...</div>
              <div style={{ fontSize: 10, marginTop: 4 }}>Waiting for backend to respond</div>
            </div>
          ) : loading && available.length === 0 ? (
            <div style={{ padding: '60px 0', textAlign: 'center', color: '#5e6370' }}>
              <Loader2 size={28} style={{ margin: '0 auto 12px', animation: 'rm-spin .8s linear infinite' }} />
              <div style={{ fontSize: 13 }}>Fetching available runtimes...</div>
            </div>
          ) : tab === 'available' ? (
            <AvailableTab
              available={available}
              installed={installed}
              activeRuntimeId={activeRt?.id}
              backendUrl={backendUrl}
              startDownload={startDownload}
              activateRuntime={activateRuntime}
              dl={dl}
            />
          ) : (
            <InstalledTab
              installed={installed}
              activeRuntimeId={activeRt?.id}
              backendUrl={backendUrl}
              activateRuntime={activateRuntime}
              removeRuntime={removeRuntime}
            />
          )}
        </div>
      </div>
      <style>{`@keyframes rm-spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

/* ── Available Tab ── */
function AvailableTab({ available, installed, activeRuntimeId, backendUrl, startDownload, activateRuntime, dl }) {
  const backends = ['vulkan', 'cpu', 'cuda'];

  return (
    <div>
      <div style={{ marginBottom: 14, fontSize: 12, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: '#5e6370' }}>
        Runtime Packages
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {backends.map((backend) => {
          const entry = available.find((a) => a.backend === backend);
          if (!entry) return null;
          const Icon = BACKEND_ICONS[backend] || Cpu;
          const installedEntry = installed.find((i) => i.backend === backend);
          const isActive = activeRuntimeId === entry.id;
          const isInstalled = !!installedEntry;
          const isActiveOther = installedEntry && !isActive;
          const isDownloading = dl?.backend === backend && (dl.status === 'downloading' || dl.status === 'extracting' || dl.status === 'installing' || dl.status === 'queued');

          return (
            <div key={backend} style={{
              display: 'flex', alignItems: 'center', gap: 16,
              padding: '16px 18px', borderRadius: 12,
              background: isActive ? 'rgba(6,182,212,0.04)' : 'rgba(255,255,255,0.02)',
              border: isActive ? '1px solid rgba(6,182,212,0.15)' : '1px solid rgba(255,255,255,0.05)',
              transition: 'all .15s',
            }}>
              <div style={{
                width: 42, height: 42, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: isActive ? 'rgba(6,182,212,0.12)' : 'rgba(255,255,255,0.04)',
              }}>
                <Icon size={18} style={{ color: isActive ? '#22d3ee' : '#5e6370' }} />
              </div>

              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 14, fontWeight: 600, color: isActive ? '#22d3ee' : '#c8cad4' }}>
                    {entry.label}
                  </span>
                  {isActive && (
                    <span style={{
                      padding: '2px 8px', borderRadius: 4, fontSize: 10, fontWeight: 700,
                      background: 'rgba(6,182,212,0.12)', color: '#22d3ee',
                      border: '1px solid rgba(6,182,212,0.15)',
                    }}>Active</span>
                  )}
                  {entry.prerelease && (
                    <span style={{
                      padding: '2px 8px', borderRadius: 4, fontSize: 10, fontWeight: 700,
                      background: 'rgba(251,191,36,0.1)', color: '#fbbf24',
                      border: '1px solid rgba(251,191,36,0.15)',
                    }}>Pre-release</span>
                  )}
                </div>
                <div style={{ marginTop: 5, display: 'flex', alignItems: 'center', gap: 14, fontSize: 11, color: '#5e6370' }}>
                  <span>Version <strong style={{ color: '#7a7f8a' }}>{entry.version}</strong></span>
                  <span>Size <strong style={{ color: '#7a7f8a' }}>{formatBytes(entry.size)}</strong></span>
                  <span>Published <strong style={{ color: '#7a7f8a' }}>{new Date(entry.published).toLocaleDateString()}</strong></span>
                  {entry.installed && installedEntry?.version !== entry.version && (
                    <span style={{ color: '#fbbf24', fontWeight: 600 }}>Update available</span>
                  )}
                  {entry.installed && installedEntry?.version === entry.version && (
                    <span style={{ color: '#4ade80', fontWeight: 600 }}>Installed</span>
                  )}
                </div>
              </div>

              <div style={{ display: 'flex', gap: 8 }}>
                {isDownloading ? (
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    padding: '6px 14px', borderRadius: 7, fontSize: 11,
                    background: 'rgba(6,182,212,0.1)', color: '#22d3ee',
                    border: '1px solid rgba(6,182,212,0.15)',
                  }}>
                    <Loader2 size={11} style={{ animation: 'rm-spin .8s linear infinite' }} />
                    {dl.stage}
                  </div>
                ) : isActive ? (
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    padding: '6px 14px', borderRadius: 7, fontSize: 11,
                    background: 'rgba(74,222,128,0.08)', color: '#4ade80',
                    border: '1px solid rgba(74,222,128,0.12)',
                  }}>
                    <CheckCircle size={12} /> Active
                  </div>
                ) : isActiveOther ? (
                  <button onClick={() => activateRuntime(backendUrl, installedEntry.id)} style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    height: 34, padding: '0 14px', borderRadius: 7,
                    fontSize: 11, fontWeight: 600, cursor: 'pointer',
                    background: 'rgba(6,182,212,0.08)', color: '#22d3ee',
                    border: '1px solid rgba(6,182,212,0.12)', transition: 'all .15s',
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = 'rgba(6,182,212,0.18)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'rgba(6,182,212,0.08)'}
                  >
                    <Activity size={11} /> Switch
                  </button>
                ) : (
                  <button onClick={() => startDownload(backendUrl, backend)} disabled={!!dl} style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    height: 34, padding: '0 14px', borderRadius: 7,
                    fontSize: 11, fontWeight: 600,
                    cursor: dl ? 'not-allowed' : 'pointer',
                    background: 'rgba(6,182,212,0.1)', color: '#22d3ee',
                    border: '1px solid rgba(6,182,212,0.15)', transition: 'all .15s',
                    opacity: dl ? 0.4 : 1,
                  }}
                  onMouseEnter={e => { if (!dl) e.currentTarget.style.background = 'rgba(6,182,212,0.2)'; }}
                  onMouseLeave={e => { if (!dl) e.currentTarget.style.background = 'rgba(6,182,212,0.1)'; }}
                  >
                    {entry.installed && installedEntry?.version !== entry.version ? (
                      <><RefreshCw size={11} /> Update</>
                    ) : (
                      <><ArrowDown size={11} /> {formatBytes(entry.size)}</>
                    )}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* What's new */}
      {available.length > 0 && (
        <div style={{ marginTop: 20, padding: '12px 16px', borderRadius: 10, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
            <Clock size={12} style={{ color: '#5e6370' }} />
            <span style={{ fontSize: 11, fontWeight: 700, color: '#5e6370', textTransform: 'uppercase', letterSpacing: '.06em' }}>
              Latest Changes — {available[0]?.version}
            </span>
          </div>
          <pre style={{ fontSize: 11, color: '#7a7f8a', lineHeight: 1.5, whiteSpace: 'pre-wrap', fontFamily: 'monospace', margin: 0 }}>
            {available[0]?.changelog?.slice(0, 400) || 'No changelog available'}
          </pre>
        </div>
      )}
    </div>
  );
}

/* ── Installed Tab ── */
function InstalledTab({ installed, activeRuntimeId, backendUrl, activateRuntime, removeRuntime }) {
  if (installed.length === 0) {
    return (
      <div style={{ padding: '60px 0', textAlign: 'center' }}>
        <HardDrive size={32} style={{ margin: '0 auto 12px', color: '#5e6370', opacity: 0.4 }} />
        <div style={{ fontSize: 13, color: '#5e6370' }}>No runtimes installed</div>
        <div style={{ marginTop: 6, fontSize: 12, color: '#3a3c4e' }}>Go to the Available tab to download a runtime</div>
      </div>
    );
  }

  return (
    <div>
      <div style={{ marginBottom: 14, fontSize: 12, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: '#5e6370' }}>
        Installed Runtimes ({installed.length})
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {installed.map((r) => {
          const isActive = r.id === activeRuntimeId;
          const isCurrentBuild = r.currentBuild;
          const Icon = BACKEND_ICONS[r.backend] || Cpu;
          return (
            <div key={r.id} style={{
              display: 'flex', alignItems: 'center', gap: 14,
              padding: '14px 18px', borderRadius: 10,
              background: isActive ? 'rgba(6,182,212,0.04)' : 'rgba(255,255,255,0.02)',
              border: isActive ? '1px solid rgba(6,182,212,0.15)' : '1px solid rgba(255,255,255,0.04)',
            }}>
              <Icon size={16} style={{ color: isActive ? '#22d3ee' : '#5e6370' }} />
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: isActive ? '#22d3ee' : '#c8cad4' }}>{r.label}</span>
                  {isActive && (
                    <span style={{
                      padding: '2px 8px', borderRadius: 4, fontSize: 10, fontWeight: 700,
                      background: 'rgba(6,182,212,0.12)', color: '#22d3ee',
                    }}>Active</span>
                  )}
                  {isCurrentBuild && (
                    <span style={{
                      padding: '2px 8px', borderRadius: 4, fontSize: 10, fontWeight: 700,
                      background: 'rgba(74,222,128,0.1)', color: '#4ade80',
                      border: '1px solid rgba(74,222,128,0.12)',
                    }}>Current Build</span>
                  )}
                </div>
                <div style={{ marginTop: 4, display: 'flex', gap: 14, fontSize: 11, color: '#5e6370' }}>
                  <span>Version <strong style={{ color: '#7a7f8a' }}>{r.version}</strong></span>
                  <span>Size <strong style={{ color: '#7a7f8a' }}>{r.size > 0 ? formatBytes(r.size) : '—'}</strong></span>
                  {isCurrentBuild ? (
                    <span style={{ color: '#52546a' }}>Detected from <strong style={{ color: '#7a7f8a' }}>llama-cpp/</strong></span>
                  ) : (
                    <span>Installed <strong style={{ color: '#7a7f8a' }}>{new Date(r.installedAt).toLocaleDateString()}</strong></span>
                  )}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                {!isActive && !isCurrentBuild && (
                  <button onClick={() => activateRuntime(backendUrl, r.id)} style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    height: 32, padding: '0 14px', borderRadius: 7,
                    fontSize: 11, fontWeight: 600, cursor: 'pointer',
                    background: 'rgba(6,182,212,0.08)', color: '#22d3ee',
                    border: '1px solid rgba(6,182,212,0.12)', transition: 'all .15s',
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = 'rgba(6,182,212,0.18)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'rgba(6,182,212,0.08)'}
                  >
                    <Activity size={10} /> Activate
                  </button>
                )}
                {!isCurrentBuild && (
                  <button onClick={() => removeRuntime(backendUrl, r.id)} style={{
                    display: 'flex', alignItems: 'center', gap: 5,
                    height: 32, padding: '0 14px', borderRadius: 7,
                    fontSize: 11, fontWeight: 600, cursor: 'pointer',
                    background: 'rgba(248,113,113,0.07)', color: '#f87171',
                    border: '1px solid rgba(248,113,113,0.1)', transition: 'all .15s',
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = 'rgba(248,113,113,0.15)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'rgba(248,113,113,0.07)'}
                  >
                    <Trash2 size={10} /> Remove
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Storage summary */}
      <div style={{ marginTop: 18, padding: '12px 16px', borderRadius: 10, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#5e6370' }}>
          <HardDrive size={14} />
          <span>Total storage used: <strong style={{ color: '#7a7f8a' }}>{formatBytes(installed.reduce((s, r) => s + r.size, 0))}</strong></span>
        </div>
      </div>
    </div>
  );
}

/* ── Helpers ── */
function formatBytes(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0)} ${units[i]}`;
}

function formatEta(seconds) {
  if (seconds < 60) return `${Math.ceil(seconds)}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${Math.ceil(seconds % 60)}s`;
  return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
}
