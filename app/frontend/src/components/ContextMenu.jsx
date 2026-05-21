import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

export default function ContextMenu({ x, y, items, onClose }) {
  const ref = useRef(null);

  useEffect(() => {
    const close = (e) => {
      if (ref.current && !ref.current.contains(e.target)) onClose();
    };
    const key = (e) => {
      if (e.key === 'Escape') onClose();
    };
    requestAnimationFrame(() => {
      document.addEventListener('mousedown', close);
      document.addEventListener('keydown', key);
    });
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', key);
    };
  }, [onClose]);

  const menuW = 180;
  const menuH = items.length * 36 + 8;
  const adjX = Math.max(8, Math.min(x, window.innerWidth - menuW - 8));
  const adjY = Math.max(8, Math.min(y, window.innerHeight - menuH - 8));

  return createPortal(
    <div
      ref={ref}
      className="context-menu"
      style={{
        position: 'fixed', left: adjX, top: adjY, zIndex: 99999, minWidth: menuW,
      }}
    >
      <div className="dd-menu">
        {items.map((item, i) =>
          item.separator ? (
            <div key={i} style={{ height: 1, background: 'rgba(255,255,255,0.06)', margin: '4px 0' }} />
          ) : (
            <button
              key={i}
              className="dd-row"
              onClick={() => { item.onClick(); onClose(); }}
            >
              {item.icon && <span className="dd-row-icon">{item.icon}</span>}
              <span className="dd-row-label">{item.label}</span>
            </button>
          )
        )}
      </div>
    </div>,
    document.body
  );
}
