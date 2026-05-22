/**
 * ImageCarousel — renders a grid/carousel of image search results.
 * Images are proxied through the backend to avoid CORS/hotlink blocking.
 */
import { useState, useCallback, useEffect } from 'react';
import { X, Download, ExternalLink, ChevronLeft, ChevronRight, ZoomIn, Loader2 } from 'lucide-react';
import useChatStore from '../stores/chatStore';

// Proxy image through backend to avoid CORS/hotlink blocking
function proxyUrl(url, backendUrl) {
  if (!url) return '';
  return `${backendUrl}/api/proxy-image?url=${encodeURIComponent(url)}`;
}

export default function ImageCarousel({ images, query }) {
  const backendUrl = useChatStore((s) => s.backendUrl) || 'http://localhost:6767';
  const [lightbox, setLightbox] = useState(null);
  const [failedUrls, setFailedUrls] = useState(new Set());
  const [loadingLightbox, setLoadingLightbox] = useState(false);

  const visible = images.filter((img) => !failedUrls.has(img.url));

  const openLightbox = (i) => { setLightbox(i); setLoadingLightbox(true); };
  const closeLightbox = () => { setLightbox(null); setLoadingLightbox(false); };
  const prev = () => { setLightbox((i) => (i > 0 ? i - 1 : visible.length - 1)); setLoadingLightbox(true); };
  const next = () => { setLightbox((i) => (i < visible.length - 1 ? i + 1 : 0)); setLoadingLightbox(true); };

  const handleKeyDown = useCallback((e) => {
    if (lightbox === null) return;
    if (e.key === 'ArrowLeft') prev();
    if (e.key === 'ArrowRight') next();
    if (e.key === 'Escape') closeLightbox();
  }, [lightbox]);

  useEffect(() => {
    if (lightbox !== null) {
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }
  }, [lightbox, handleKeyDown]);

  const handleImgError = (url) => {
    setFailedUrls((s) => new Set([...s, url]));
  };

  const openSource = (url) => {
    if (window.electronAPI?.openPath) {
      window.electronAPI.openPath(url).catch(() => {});
    } else {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  };

  const download = (img) => {
    // Open the proxied URL in browser for download
    openSource(proxyUrl(img.url, backendUrl));
  };

  if (!visible.length) return null;

  const current = lightbox !== null ? visible[lightbox] : null;

  return (
    <div className="img-carousel">
      {/* Header */}
      <div className="img-carousel-header">
        <span className="img-carousel-title">Images for "{query}"</span>
        <span className="img-carousel-count">{visible.length} results</span>
      </div>

      {/* Grid */}
      <div className="img-carousel-grid">
        {visible.map((img, i) => (
          <div
            key={img.url}
            className="img-carousel-item"
            onClick={() => openLightbox(i)}
            title={img.title}
          >
            <img
              src={proxyUrl(img.thumb || img.url, backendUrl)}
              alt={img.title || query}
              className="img-carousel-thumb"
              onError={(e) => {
                // Fallback: try direct URL
                if (!e.target.dataset.fallback) {
                  e.target.dataset.fallback = '1';
                  e.target.src = img.thumb || img.url;
                } else {
                  handleImgError(img.url);
                }
              }}
              loading="lazy"
            />
            <div className="img-carousel-item-overlay">
              <ZoomIn size={16} />
            </div>
          </div>
        ))}
      </div>

      {/* Lightbox */}
      {current && (
        <div className="img-lightbox" onClick={closeLightbox}>
          <div className="img-lightbox-inner" onClick={(e) => e.stopPropagation()}>
            {/* Controls */}
            <div className="img-lightbox-bar">
              <span className="img-lightbox-title">{current.title || query}</span>
              <div className="img-lightbox-actions">
                <button
                  className="img-lightbox-btn"
                  onClick={() => openSource(current.source)}
                  title="Open source page"
                >
                  <ExternalLink size={14} />
                </button>
                <button
                  className="img-lightbox-btn"
                  onClick={() => download(current)}
                  title="Download image"
                >
                  <Download size={14} />
                </button>
                <button
                  className="img-lightbox-btn img-lightbox-close"
                  onClick={closeLightbox}
                  title="Close"
                >
                  <X size={14} />
                </button>
              </div>
            </div>

            {/* Image */}
            <div className="img-lightbox-img-wrap">
              {loadingLightbox && (
                <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Loader2 size={28} style={{ color: '#22d3ee', opacity: 0.6 }} className="animate-spin" />
                </div>
              )}
              <img
                key={current.url}
                src={proxyUrl(current.url, backendUrl)}
                alt={current.title || query}
                className="img-lightbox-img"
                style={{ opacity: loadingLightbox ? 0 : 1, transition: 'opacity .2s' }}
                onLoad={() => setLoadingLightbox(false)}
                onError={(e) => {
                  // Fallback: try thumb, then direct URL
                  if (!e.target.dataset.fallback) {
                    e.target.dataset.fallback = '1';
                    e.target.src = proxyUrl(current.thumb || current.url, backendUrl);
                  } else if (e.target.dataset.fallback === '1') {
                    e.target.dataset.fallback = '2';
                    e.target.src = current.url; // direct as last resort
                  } else {
                    setLoadingLightbox(false);
                    handleImgError(current.url);
                    closeLightbox();
                  }
                }}
              />
            </div>

            {/* Nav */}
            {visible.length > 1 && (
              <>
                <button className="img-lightbox-nav img-lightbox-nav-prev" onClick={(e) => { e.stopPropagation(); prev(); }}>
                  <ChevronLeft size={20} />
                </button>
                <button className="img-lightbox-nav img-lightbox-nav-next" onClick={(e) => { e.stopPropagation(); next(); }}>
                  <ChevronRight size={20} />
                </button>
              </>
            )}

            {/* Footer */}
            <div className="img-lightbox-footer">
              <span>{lightbox + 1} / {visible.length}</span>
              {current.source && (
                <button
                  className="img-lightbox-source"
                  onClick={(e) => { e.stopPropagation(); openSource(current.source); }}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                >
                  {(() => { try { return new URL(current.source).hostname; } catch { return current.source.slice(0, 30); } })()}
                </button>
              )}
              {current.width && current.height && (
                <span className="img-lightbox-dims">{current.width}×{current.height}</span>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
