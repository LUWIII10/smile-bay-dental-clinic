import { createPortal } from 'react-dom';
import { MoreIcon } from '../icons';
import { useDropdownPosition } from '../../../hooks/useDropdownPosition';

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
  const { open, setOpen, position, triggerRef, dropdownRef, toggle } = useDropdownPosition();

  const visibleItems = items.filter(Boolean);

  if (visibleItems.length === 0) return null;

  return (
    <div className="action-menu">
      <button
        ref={triggerRef}
        type="button"
        className="action-menu-trigger"
        onClick={toggle}
        aria-label="More actions"
        aria-expanded={open}
      >
        <MoreIcon />
      </button>
      {open && position && createPortal(
        <div
          ref={dropdownRef}
          className="action-menu-dropdown"
          style={{ top: position.top, left: position.left, right: position.right }}
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
