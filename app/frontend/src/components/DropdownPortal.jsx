/**
 * DropdownPortal — renders children into document.body at the given position.
 *
 * This bypasses ALL parent overflow:hidden / z-index stacking contexts,
 * allowing dropdowns to float freely above any container.
 */
import { createPortal } from 'react-dom';

/**
 * @param {object} props
 * @param {boolean}  props.open     - Whether the dropdown is visible
 * @param {object}   props.pos      - Position from useDropdownPortal
 * @param {number}   [props.minW]   - Minimum width in px
 * @param {number}   [props.maxW]   - Maximum width in px (default 320)
 * @param {'right'|'left'} [props.align] - Alignment relative to trigger (default 'right')
 * @param {React.ReactNode} props.children
 */
export default function DropdownPortal({ open, pos, minW, maxW = 320, align = 'right', children }) {
  if (!open) return null;

  const { top, triggerLeft, triggerRight, viewportH } = pos;

  // Right-align: popup right edge = trigger right edge
  // Left-align:  popup left edge  = trigger left edge
  const leftPx = align === 'left' ? triggerLeft : triggerRight - Math.min(maxW, Math.max(minW ?? 200, 200));

  // Flip up if not enough room below (need at least 180px)
  const spaceBelow = viewportH - (pos.triggerBottom ?? 0);
  const flipUp     = spaceBelow < 180;

  const style = {
    position: 'fixed',          // fixed so it won't scroll with page
    zIndex: 9999,
    left: Math.max(8, leftPx),  // clamp to 8px from left edge
    top: flipUp ? undefined : top - window.scrollY,
    bottom: flipUp ? viewportH - (pos.triggerBottom ?? 0) + 6 : undefined,
    minWidth: minW ?? 200,
    maxWidth: maxW,
    width: 'max-content',
  };

  return createPortal(
    <div className="dropdown-portal" style={style}>
      {children}
    </div>,
    document.body,
  );
}
