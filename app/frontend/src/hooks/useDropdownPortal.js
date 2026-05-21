/**
 * useDropdownPortal — measures a trigger element and returns the
 * pixel-perfect position for a portal-rendered dropdown.
 *
 * Portals bypass ALL parent overflow:hidden / z-index stacking contexts,
 * so dropdowns always float above everything correctly.
 */
import { useState, useEffect, useRef, useCallback } from 'react';

export default function useDropdownPortal() {
  const triggerRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos]   = useState({ top: 0, left: 0, width: 0 });

  /** Measure trigger and compute popup position */
  const measure = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setPos({
      top:   r.bottom + window.scrollY + 6,   // 6px gap below trigger
      left:  r.right  + window.scrollX,       // right-align by default
      width: r.width,
      triggerBottom: r.bottom,
      triggerLeft:   r.left,
      triggerRight:  r.right,
      viewportH:     window.innerHeight,
    });
  }, []);

  const toggle = useCallback(() => {
    setOpen((v) => {
      if (!v) measure(); // measure before opening
      return !v;
    });
  }, [measure]);

  // Close on outside click — use bubble phase so option onClick fires first
  useEffect(() => {
    if (!open) return;
    const handle = (e) => {
      if (!triggerRef.current?.contains(e.target)) setOpen(false);
    };
    // Use bubble phase (false) so click events on dropdown items fire first
    document.addEventListener('click', handle, false);
    return () => document.removeEventListener('click', handle, false);
  }, [open]);

  // Close on scroll / resize to prevent stale positions
  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [open]);

  return { triggerRef, open, toggle, close: () => setOpen(false), pos };
}
