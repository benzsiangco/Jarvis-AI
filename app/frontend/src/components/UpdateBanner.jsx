/**
 * UpdateBanner — compact update notification integrated into the status bar area.
 * Shows as a subtle pill when an update is available, expands on click.
 */
import { useState } from 'react';
import { Download, RefreshCw, CheckCircle2, AlertCircle, X, Loader2 } from 'lucide-react';
import useUpdater from '../hooks/useUpdater';

export default function UpdateBanner() {
  const { status, version, progress, error, check, install, relaunch } = useUpdater();
  const [dismissed, setDismissed] = useState(false);
  const [expanded, setExpanded] = useState(false);

  if (dismissed || status === 'idle' || status === 'uptodate') return null;

  return (
    <div className={`update-banner ${expanded ? 'update-banner-expanded' : ''}`}>
      {/* Collapsed pill */}
      {!expanded && (
        <button className="update-pill" onClick={() => setExpanded(true)}>
          {status === 'checking' && <Loader2 size={10} className="animate-spin" />}
          {status === 'available' && <Download size={10} />}
          {status === 'downloading' && <Loader2 size={10} className="animate-spin" />}
          {status === 'ready' && <CheckCircle2 size={10} style={{ color: '#34d399' }} />}
          {status === 'error' && <AlertCircle size={10} style={{ color: '#f87171' }} />}
          <span>
            {status === 'checking' && 'Checking for updates…'}
            {status === 'available' && `Update v${version} available`}
            {status === 'downloading' && `Downloading… ${progress}%`}
            {status === 'ready' && 'Ready to install'}
            {status === 'error' && 'Update failed'}
          </span>
        </button>
      )}

      {/* Expanded panel */}
      {expanded && (
        <div className="update-panel">
          <div className="update-panel-header">
            <span className="update-panel-title">
              {status === 'available' && `Update v${version} available`}
              {status === 'downloading' && 'Downloading update…'}
              {status === 'ready' && 'Update ready to install'}
              {status === 'error' && 'Update failed'}
              {status === 'checking' && 'Checking for updates…'}
            </span>
            <button className="update-close" onClick={() => { setExpanded(false); if (status === 'error' || status === 'available') setDismissed(true); }}>
              <X size={11} />
            </button>
          </div>

          {status === 'error' && (
            <p className="update-error">{error}</p>
          )}

          {status === 'downloading' && (
            <div className="update-progress-wrap">
              <div className="update-progress-bar" style={{ width: `${progress}%` }} />
              <span className="update-progress-label">{progress}%</span>
            </div>
          )}

          <div className="update-actions">
            {status === 'available' && (
              <>
                <button className="update-btn update-btn-primary" onClick={install}>
                  <Download size={11} /> Download & Install
                </button>
                <button className="update-btn" onClick={() => { setExpanded(false); setDismissed(true); }}>
                  Later
                </button>
              </>
            )}
            {status === 'ready' && (
              <button className="update-btn update-btn-primary" onClick={relaunch}>
                <RefreshCw size={11} /> Restart to apply
              </button>
            )}
            {status === 'error' && (
              <button className="update-btn" onClick={() => { check(); setExpanded(false); }}>
                <RefreshCw size={11} /> Retry
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
