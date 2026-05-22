/**
 * ImageCarousel — renders a grid/carousel of image search results.
 * Images are loaded directly from source URLs (no local saving).
 * Features: preview lightbox, download, source link, carousel navigation.
 */
import { useState, useCallback } from 'react';
import { X, Download, ExternalLink, ChevronLeft, ChevronRight, ZoomIn } from 'lucide-react';

export default function ImageCarousel({ images, query }) {
  const [lightbox, setLightbox] = useState(null); // index of open image
  const [failedUrls, setFailedUrls] = useState(new Set());

  const visible = images.filter((img) => !failedUrls.has(img.url));

  const openLightbox = (i) => setLightbox(i);
  const closeLightbox = () => setLightbox(null);
  const prev = () => setLightbox((i) => (i > 0 ? i - 1 : visible.length - 1));
  const next = () => setLightbox((i) => (i < visible.length - 1 ? i + 1 : 0));

  const handleKeyDown = useCallback((e) => {
    if (lightbox === null) return;
    if (e.key === 'ArrowLeft') prev();
    if (e.key === 'ArrowRight') next();
    if (e.key === 'Escape') closeLightbox();
  }, [lightbox]);

  const handleImgError = (url) => {
    setFailedUrls((s) => new Set([...s, url]));
  };

  const download = (img) => {
    const a = document.createElement('a');
    a.href = img.url;
    a.download = img.title || 'image';
    a.target = '_blank';
    a.click();
  };

  if (!visible.length) return null;

  const current = lightbox !== null ? visible[lightbox] : null;

  return (
    <div className="img-carousel" onKeyDown={handleKeyDown} tabIndex={-1}>
      {/* Header */}
      <div className="img-carousel-header">
        <span className="img-carousel-title">
          Images for "{query}"
        </span>
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
              src={img.thumb || img.url}
              alt={img.title || query}
              className="img-carousel-thumb"
              onError={() => handleImgError(img.url)}
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
                  onClick={() => window.open(current.source, '_blank')}
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
              <img
                src={current.url}
                alt={current.title || query}
                className="img-lightbox-img"
                onError={() => { handleImgError(current.url); closeLightbox(); }}
              />
            </div>

            {/* Nav */}
            {visible.length > 1 && (
              <>
                <button className="img-lightbox-nav img-lightbox-nav-prev" onClick={prev}>
                  <ChevronLeft size={20} />
                </button>
                <button className="img-lightbox-nav img-lightbox-nav-next" onClick={next}>
                  <ChevronRight size={20} />
                </button>
              </>
            )}

            {/* Counter + source */}
            <div className="img-lightbox-footer">
              <span>{lightbox + 1} / {visible.length}</span>
              {current.source && (
                <a
                  href={current.source}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="img-lightbox-source"
                  onClick={(e) => e.stopPropagation()}
                >
                  {new URL(current.source).hostname}
                </a>
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
