/**
 * ImageCarousel — full carousel layout for image search results.
 * Large main image + thumbnail strip. No grid.
 */
import { useState, useCallback, useEffect, useRef } from 'react';
import { X, Download, ExternalLink, ChevronLeft, ChevronRight, Loader2, Maximize2 } from 'lucide-react';
import useChatStore from '../stores/chatStore';

function proxyUrl(url, backendUrl) {
  if (!url) return '';
  return `${backendUrl}/api/proxy-image?url=${encodeURIComponent(url)}`;
}

export default function ImageCarousel({ images, query }) {
  const backendUrl = useChatStore((s) => s.backendUrl) || 'http://localhost:6767';
  const [current, setCurrent] = useState(0);
  const [lightbox, setLightbox] = useState(false);
  const [mainLoading, setMainLoading] = useState(true);
  const [lightboxLoading, setLightboxLoading] = useState(false);
  const [failedUrls, setFailedUrls] = useState(new Set());
  const thumbsRef = useRef(null);

  const visible = images.filter((img) => !failedUrls.has(img.url));
  const total = visible.length;
  const img = visible[current] || null;

  // Scroll active thumb into view
  useEffect(() => {
    if (!thumbsRef.current) return;
    const active = thumbsRef.current.querySelector('.ic-thumb-active');
    if (active) active.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
  }, [current]);

  const go = useCallback((idx) => {
    const next = ((idx % total) + total) % total;
    setCurrent(next);
    setMainLoading(true);
  }, [total]);

  const prev = useCallback(() => go(current - 1), [current, go]);
  const next = useCallback(() => go(current + 1), [current, go]);

  const handleKey = useCallback((e) => {
    if (e.key === 'ArrowLeft') prev();
    if (e.key === 'ArrowRight') next();
    if (e.key === 'Escape') setLightbox(false);
  }, [prev, next]);

  useEffect(() => {
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [handleKey]);

  const handleImgError = (url) => setFailedUrls((s) => new Set([...s, url]));

  const openSource = (url) => {
    if (window.electronAPI?.openPath) window.electronAPI.openPath(url).catch(() => {});
    else window.open(url, '_blank', 'noopener,noreferrer');
  };

  if (!total || !img) return null;

  return (
    <>
      <div className="ic-root">
        {/* Header */}
        <div className="ic-header">
          <span className="ic-title">Images · "{query}"</span>
          <span className="ic-count">{current + 1} / {total}</span>
        </div>

        {/* Main image stage */}
        <div className="ic-stage">
          {/* Prev */}
          {total > 1 && (
            <button className="ic-nav ic-nav-prev" onClick={prev} title="Previous">
              <ChevronLeft size={20} />
            </button>
          )}

          {/* Image */}
          <div className="ic-img-wrap" onClick={() => { setLightbox(true); setLightboxLoading(true); }}>
            {mainLoading && (
              <div className="ic-spinner">
                <Loader2 size={24} className="ic-spin" />
              </div>
            )}
            <img
              key={img.url}
              src={proxyUrl(img.url, backendUrl)}
              alt={img.title || query}
              className="ic-main-img"
              style={{ opacity: mainLoading ? 0 : 1 }}
              onLoad={() => setMainLoading(false)}
              onError={(e) => {
                if (!e.target.dataset.fb) {
                  e.target.dataset.fb = '1';
                  e.target.src = proxyUrl(img.thumb || img.url, backendUrl);
                } else if (e.target.dataset.fb === '1') {
                  e.target.dataset.fb = '2';
                  e.target.src = img.url;
                } else {
                  setMainLoading(false);
                  handleImgError(img.url);
                }
              }}
            />
            <div className="ic-zoom-hint">
              <Maximize2 size={14} /> Click to enlarge
            </div>
          </div>

          {/* Next */}
          {total > 1 && (
            <button className="ic-nav ic-nav-next" onClick={next} title="Next">
              <ChevronRight size={20} />
            </button>
          )}
        </div>

        {/* Caption + actions */}
        <div className="ic-caption">
          <span className="ic-caption-title" title={img.title}>{img.title || query}</span>
          <div className="ic-caption-actions">
            {img.source && (
              <button className="ic-action-btn" onClick={() => openSource(img.source)} title="Open source">
                <ExternalLink size={12} />
              </button>
            )}
            <button className="ic-action-btn" onClick={() => openSource(proxyUrl(img.url, backendUrl))} title="Download">
              <Download size={12} />
            </button>
          </div>
        </div>

        {/* Thumbnail strip */}
        {total > 1 && (
          <div className="ic-thumbs" ref={thumbsRef}>
            {visible.map((t, i) => (
              <button
                key={t.url}
                className={`ic-thumb ${i === current ? 'ic-thumb-active' : ''}`}
                onClick={() => go(i)}
                title={t.title || query}
              >
                <img
                  src={proxyUrl(t.thumb || t.url, backendUrl)}
                  alt={t.title || query}
                  className="ic-thumb-img"
                  onError={(e) => {
                    if (!e.target.dataset.fb) { e.target.dataset.fb = '1'; e.target.src = t.url; }
                    else handleImgError(t.url);
                  }}
                  loading="lazy"
                />
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Lightbox */}
      {lightbox && img && (
        <div className="ic-lightbox" onClick={() => setLightbox(false)}>
          <div className="ic-lightbox-inner" onClick={(e) => e.stopPropagation()}>
            <div className="ic-lightbox-bar">
              <span className="ic-lightbox-title">{img.title || query}</span>
              <div style={{ display: 'flex', gap: 6 }}>
                {img.source && (
                  <button className="ic-lb-btn" onClick={() => openSource(img.source)} title="Open source">
                    <ExternalLink size={13} />
                  </button>
                )}
                <button className="ic-lb-btn" onClick={() => openSource(proxyUrl(img.url, backendUrl))} title="Download">
                  <Download size={13} />
                </button>
                <button className="ic-lb-btn ic-lb-close" onClick={() => setLightbox(false)}>
                  <X size={13} />
                </button>
              </div>
            </div>

            <div className="ic-lightbox-img-wrap">
              {lightboxLoading && (
                <div className="ic-spinner">
                  <Loader2 size={32} className="ic-spin" style={{ color: '#22d3ee' }} />
                </div>
              )}
              <img
                key={`lb-${img.url}`}
                src={proxyUrl(img.url, backendUrl)}
                alt={img.title || query}
                className="ic-lightbox-img"
                style={{ opacity: lightboxLoading ? 0 : 1 }}
                onLoad={() => setLightboxLoading(false)}
                onError={(e) => {
                  if (!e.target.dataset.fb) { e.target.dataset.fb = '1'; e.target.src = img.url; }
                  else { setLightboxLoading(false); setLightbox(false); }
                }}
              />
            </div>

            {total > 1 && (
              <>
                <button className="ic-lb-nav ic-lb-prev" onClick={(e) => { e.stopPropagation(); prev(); setLightboxLoading(true); }}>
                  <ChevronLeft size={22} />
                </button>
                <button className="ic-lb-nav ic-lb-next" onClick={(e) => { e.stopPropagation(); next(); setLightboxLoading(true); }}>
                  <ChevronRight size={22} />
                </button>
              </>
            )}

            <div className="ic-lightbox-footer">
              <span>{current + 1} / {total}</span>
              {img.source && (
                <button className="ic-lb-source" onClick={() => openSource(img.source)}>
                  {(() => { try { return new URL(img.source).hostname; } catch { return img.source.slice(0, 30); } })()}
                </button>
              )}
              {img.width && img.height && <span>{img.width}×{img.height}</span>}
            </div>
          </div>
        </div>
      )}

      <style>{`
        .ic-root {
          display: flex; flex-direction: column; gap: 8px;
          background: rgba(255,255,255,0.02);
          border: 1px solid rgba(255,255,255,0.07);
          border-radius: 12px; overflow: hidden;
          max-width: 520px;
        }
        .ic-header {
          display: flex; justify-content: space-between; align-items: center;
          padding: 8px 12px 0;
          font-size: 11px; color: #5e6370;
        }
        .ic-title { font-weight: 600; color: #94a3b8; }
        .ic-count { font-variant-numeric: tabular-nums; }

        /* Stage */
        .ic-stage {
          position: relative; display: flex; align-items: center;
          background: #0a0b0f; min-height: 260px; max-height: 340px;
          overflow: hidden;
        }
        .ic-img-wrap {
          flex: 1; display: flex; align-items: center; justify-content: center;
          cursor: zoom-in; position: relative; min-height: 260px; max-height: 340px;
          overflow: hidden;
        }
        .ic-main-img {
          max-width: 100%; max-height: 340px; width: auto; height: auto;
          object-fit: contain; display: block; transition: opacity .2s;
        }
        .ic-zoom-hint {
          position: absolute; bottom: 8px; right: 10px;
          display: flex; align-items: center; gap: 4px;
          font-size: 10px; color: rgba(255,255,255,0.3);
          pointer-events: none;
        }
        .ic-spinner {
          position: absolute; inset: 0; display: flex;
          align-items: center; justify-content: center;
          background: rgba(0,0,0,0.4);
        }
        .ic-spin { animation: ic-spin 1s linear infinite; }
        @keyframes ic-spin { to { transform: rotate(360deg); } }

        /* Nav arrows */
        .ic-nav {
          position: absolute; top: 50%; transform: translateY(-50%);
          z-index: 2; width: 32px; height: 32px; border-radius: 50%;
          background: rgba(0,0,0,0.55); border: 1px solid rgba(255,255,255,0.1);
          color: #e2e8f0; cursor: pointer; display: flex; align-items: center; justify-content: center;
          transition: background .15s;
        }
        .ic-nav:hover { background: rgba(6,182,212,0.25); border-color: rgba(6,182,212,0.4); }
        .ic-nav-prev { left: 8px; }
        .ic-nav-next { right: 8px; }

        /* Caption */
        .ic-caption {
          display: flex; align-items: center; justify-content: space-between;
          padding: 4px 12px; gap: 8px;
        }
        .ic-caption-title {
          font-size: 11px; color: #94a3b8; flex: 1; min-width: 0;
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        }
        .ic-caption-actions { display: flex; gap: 4px; flex-shrink: 0; }
        .ic-action-btn {
          width: 24px; height: 24px; border-radius: 6px;
          background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.08);
          color: #5e6370; cursor: pointer; display: flex; align-items: center; justify-content: center;
          transition: all .12s;
        }
        .ic-action-btn:hover { background: rgba(6,182,212,0.15); color: #67e8f9; border-color: rgba(6,182,212,0.3); }

        /* Thumbnail strip */
        .ic-thumbs {
          display: flex; gap: 4px; overflow-x: auto; padding: 0 10px 10px;
          scrollbar-width: thin; scrollbar-color: rgba(255,255,255,0.1) transparent;
        }
        .ic-thumbs::-webkit-scrollbar { height: 3px; }
        .ic-thumbs::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 2px; }
        .ic-thumb {
          flex-shrink: 0; width: 52px; height: 40px; border-radius: 6px; overflow: hidden;
          border: 2px solid transparent; cursor: pointer; padding: 0;
          transition: border-color .12s, opacity .12s;
          opacity: 0.55;
        }
        .ic-thumb:hover { opacity: 0.85; }
        .ic-thumb-active { border-color: #22d3ee; opacity: 1; }
        .ic-thumb-img { width: 100%; height: 100%; object-fit: cover; display: block; }

        /* Lightbox */
        .ic-lightbox {
          position: fixed; inset: 0; z-index: 9999;
          background: rgba(0,0,0,0.92); display: flex;
          align-items: center; justify-content: center;
          backdrop-filter: blur(8px);
        }
        .ic-lightbox-inner {
          position: relative; display: flex; flex-direction: column;
          max-width: min(90vw, 1000px); max-height: 90vh;
          background: #0d0e14; border-radius: 14px; overflow: hidden;
          border: 1px solid rgba(255,255,255,0.1);
        }
        .ic-lightbox-bar {
          display: flex; align-items: center; justify-content: space-between;
          padding: 10px 14px; border-bottom: 1px solid rgba(255,255,255,0.06);
          gap: 12px;
        }
        .ic-lightbox-title {
          font-size: 12px; color: #94a3b8; flex: 1; min-width: 0;
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        }
        .ic-lightbox-img-wrap {
          position: relative; flex: 1; display: flex;
          align-items: center; justify-content: center;
          min-height: 300px; max-height: calc(90vh - 100px);
          overflow: hidden; background: #080910;
        }
        .ic-lightbox-img {
          max-width: 100%; max-height: calc(90vh - 100px);
          object-fit: contain; display: block; transition: opacity .2s;
        }
        .ic-lb-btn {
          width: 28px; height: 28px; border-radius: 7px;
          background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.1);
          color: #94a3b8; cursor: pointer; display: flex; align-items: center; justify-content: center;
          transition: all .12s;
        }
        .ic-lb-btn:hover { background: rgba(6,182,212,0.15); color: #67e8f9; }
        .ic-lb-close:hover { background: rgba(248,113,113,0.15); color: #f87171; }
        .ic-lb-nav {
          position: absolute; top: 50%; transform: translateY(-50%);
          z-index: 2; width: 40px; height: 40px; border-radius: 50%;
          background: rgba(0,0,0,0.6); border: 1px solid rgba(255,255,255,0.12);
          color: #e2e8f0; cursor: pointer; display: flex; align-items: center; justify-content: center;
          transition: background .15s;
        }
        .ic-lb-nav:hover { background: rgba(6,182,212,0.3); }
        .ic-lb-prev { left: 12px; }
        .ic-lb-next { right: 12px; }
        .ic-lightbox-footer {
          display: flex; align-items: center; gap: 12px;
          padding: 8px 14px; border-top: 1px solid rgba(255,255,255,0.06);
          font-size: 11px; color: #5e6370;
        }
        .ic-lb-source {
          background: none; border: none; cursor: pointer;
          color: #67e8f9; font-size: 11px; padding: 0;
          text-decoration: underline; text-underline-offset: 2px;
        }
        .ic-lb-source:hover { color: #22d3ee; }
      `}</style>
    </>
  );
}
