import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { MoreIcon } from '../icons';

// Row-level "..." overflow menu — items is an array of
// { label, onClick, danger? } | falsy (falsy entries are dropped, so a
// caller can conditionally include an item with `status === 'cancelled' &&
// {...}` without a stray `false` rendering). Renders nothing if every item
// was filtered out, rather than an empty trigger button with no menu.
//
// The dropdown itself is rendered via a portal into document.body, not as a
// normal absolutely-positioned child of .action-menu. It used to be
// `position: absolute` inside the table cell — but a `<td>` in a narrow
// column has `overflow` constraints (and so do its ancestors: the table
// wrapper's horizontal scroll area, .portal-content, .portal-shell), and an
// absolutely-positioned element does NOT escape an ancestor's overflow
// clipping just by being absolute — only escaping the DOM subtree (via a
// portal) does. Position is computed from the trigger button's own
// bounding rect and applied as `position: fixed` coordinates, so the menu
// always renders relative to the viewport, never clipped by anything it
// used to be nested inside.
function ActionMenu({ items }) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState(null);
  const triggerRef = useRef(null);
  const dropdownRef = useRef(null);

  const visibleItems = items.filter(Boolean);

  const openMenu = () => {
    const rect = triggerRef.current.getBoundingClientRect();
    // Right edge of the dropdown lines up with the right edge of the
    // trigger — same visual anchor as the old `right: 0` (relative)
    // positioning, just expressed as a distance from the viewport's right
    // edge so it doesn't require knowing the dropdown's own width upfront.
    setPosition({
      top: rect.bottom + 6,
      right: window.innerWidth - rect.right,
    });
    setOpen(true);
  };

  useEffect(() => {
    if (!open) return undefined;

    const handleClickOutside = (e) => {
      if (
        triggerRef.current && !triggerRef.current.contains(e.target) &&
        dropdownRef.current && !dropdownRef.current.contains(e.target)
      ) {
        setOpen(false);
      }
    };
    // Scrolling (the table's own horizontal scroll, or the page) would
    // leave a `position: fixed` menu visually detached from its trigger —
    // closing on scroll/resize is simpler and safer than live-repositioning
    // it, and matches how most dropdown/select UIs already behave.
    const handleDismiss = () => setOpen(false);

    document.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('scroll', handleDismiss, true);
    window.addEventListener('resize', handleDismiss);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('scroll', handleDismiss, true);
      window.removeEventListener('resize', handleDismiss);
    };
  }, [open]);

  if (visibleItems.length === 0) return null;

  return (
    <div className="action-menu">
      <button
        ref={triggerRef}
        type="button"
        className="action-menu-trigger"
        onClick={() => (open ? setOpen(false) : openMenu())}
        aria-label="More actions"
        aria-expanded={open}
      >
        <MoreIcon />
      </button>
      {open && position && createPortal(
        <div
          ref={dropdownRef}
          className="action-menu-dropdown"
          style={{ top: position.top, right: position.right }}
        >
          {visibleItems.map((item) => (
            <button
              key={item.label}
              type="button"
              className={`action-menu-item${item.danger ? ' action-menu-item--danger' : ''}`}
              onClick={() => {
                setOpen(false);
                item.onClick();
              }}
            >
              {item.label}
            </button>
          ))}
        </div>,
        document.body
      )}
    </div>
  );
}

export default ActionMenu;
