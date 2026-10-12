import { createPortal } from 'react-dom';
import { useDropdownPosition } from '../../../hooks/useDropdownPosition';

// Replaces a plain native <select> filter with a portal-rendered popover —
// same mechanics as ActionMenu/NotificationBell/DateRangePicker
// (useDropdownPosition + createPortal into document.body, so it isn't
// clipped by an ancestor's overflow). Options may carry a `dot` color (a
// small colored circle, e.g. matching the row/pill colors it filters by) —
// omit it for a plain text row.
function ChevronDownIcon({ open }) {
  return (
    <svg
      width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6"
      style={{ transform: `rotate(${open ? 180 : 0}deg)`, transition: 'transform 0.15s ease', flexShrink: 0 }}
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

// className is optional and purely additive (e.g. "filter-dd-wrap--block" to
// fill a modal form field's width) — every existing toolbar caller omits it
// and keeps today's inline, content-sized trigger unchanged.
// disabled is likewise optional — mirrors a native <select disabled>, for a
// field that depends on another one being picked first (e.g. HMO Queue's
// Assigned Dentist, which needs a Service first).
function FilterDropdown({ icon, options, value, onChange, className, disabled }) {
  const { open, setOpen, position, triggerRef, dropdownRef, toggle } = useDropdownPosition();
  const selected = options.find((o) => o.value === value) || options[0];

  return (
    <div className={`filter-dd-wrap${className ? ` ${className}` : ''}`}>
      <button
        ref={triggerRef}
        type="button"
        className={`filter-dd-trigger${open ? ' filter-dd-trigger--open' : ''}`}
        onClick={toggle}
        disabled={disabled}
        aria-expanded={open}
      >
        {icon && <span className="filter-dd-icon">{icon}</span>}
        <span className="filter-dd-label">{selected.label}</span>
        <ChevronDownIcon open={open} />
      </button>
      {open && position && createPortal(
        <div
          ref={dropdownRef}
          className="filter-dd-panel"
          style={{ top: position.top, left: position.left, right: position.right }}
        >
          {options.map((opt) => (
            <button
              key={opt.value}
              type="button"
              className={`filter-dd-item${opt.value === value ? ' filter-dd-item--active' : ''}`}
              onClick={() => { onChange(opt.value); setOpen(false); }}
            >
              {opt.dot && <span className="filter-dd-dot" style={{ background: opt.dot }} />}
              <span>{opt.label}</span>
              {opt.value === value && <span className="filter-dd-check"><CheckIcon /></span>}
            </button>
          ))}
        </div>,
        document.body
      )}
    </div>
  );
}

export default FilterDropdown;
