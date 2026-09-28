import { useState } from 'react';
import { createPortal } from 'react-dom';
import { useDropdownPosition } from '../../../hooks/useDropdownPosition';
import { CalendarIcon } from '../icons';
import {
  PRESETS, todayISO, parseISO, daysInMonth, firstWeekdayOfMonth,
  formatRangeLabel, formatSingleLabel,
} from './dateRangeUtils';
import './DateRangePicker.css';

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function ChevronDownIcon({ open }) {
  return (
    <svg
      width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
      style={{ transform: `rotate(${open ? 180 : 0}deg)`, transition: 'transform 0.15s ease', flexShrink: 0 }}
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

function ChevronLeftIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
      <polyline points="15 18 9 12 15 6" />
    </svg>
  );
}

function ChevronRightIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}

// Replaces a pair of native <input type="date"> (or a single one) with one
// field showing the whole selection ("Sep 25 – Sep 28, 2026"), a calendar
// for picking it, and — range mode only — quick presets. Approved design:
// https://claude.ai/artifact/KvAXC7uKknN98KaqTc3az8
//
// mode="range": value = { from, to } (YYYY-MM-DD), onChange({ from, to }) —
// fires only on Apply/preset click, never mid-selection.
// mode="single": value = 'YYYY-MM-DD' | '', onChange(iso) — fires
// immediately on a day click (one date is a complete, unambiguous pick;
// there's nothing for a second click to disambiguate the way a range's
// start/end does, so no Apply step).
function DateRangePicker({ mode = 'range', value, onChange, placeholder = 'Pick a date' }) {
  const { open, setOpen, position, triggerRef, dropdownRef, toggle } = useDropdownPosition();

  const initialAnchor = mode === 'range' ? (value?.to || todayISO()) : (value || todayISO());
  const anchor = parseISO(initialAnchor);
  const [viewYear, setViewYear] = useState(anchor.year);
  const [viewMonth, setViewMonth] = useState(anchor.month);
  const [pendingFrom, setPendingFrom] = useState(null);
  const [pendingTo, setPendingTo] = useState(null);

  const resetPending = () => {
    setPendingFrom(null);
    setPendingTo(null);
  };

  const openPicker = () => {
    const a = parseISO(mode === 'range' ? (value?.to || todayISO()) : (value || todayISO()));
    setViewYear(a.year);
    setViewMonth(a.month);
    resetPending();
    toggle();
  };

  const closeAndReset = () => {
    resetPending();
    setOpen(false);
  };

  const goPrevMonth = () => {
    if (viewMonth === 0) {
      setViewYear((y) => y - 1);
      setViewMonth(11);
    } else {
      setViewMonth((m) => m - 1);
    }
  };
  const goNextMonth = () => {
    if (viewMonth === 11) {
      setViewYear((y) => y + 1);
      setViewMonth(0);
    } else {
      setViewMonth((m) => m + 1);
    }
  };

  const pickDay = (iso) => {
    if (mode === 'single') {
      onChange(iso);
      setOpen(false);
      return;
    }
    if (pendingFrom == null || pendingTo != null) {
      setPendingFrom(iso);
      setPendingTo(null);
    } else if (iso < pendingFrom) {
      setPendingFrom(iso);
      setPendingTo(null);
    } else {
      setPendingTo(iso);
    }
  };

  const applyPreset = (preset) => {
    onChange(preset.range());
    setOpen(false);
  };

  const applyRange = () => {
    if (pendingFrom == null || pendingTo == null) return;
    onChange({ from: pendingFrom, to: pendingTo });
    resetPending();
    setOpen(false);
  };

  // --- Calendar cells for the currently-viewed month ---
  const total = daysInMonth(viewYear, viewMonth);
  const firstWeekday = firstWeekdayOfMonth(viewYear, viewMonth);

  const appliedFrom = mode === 'range' ? value?.from : value;
  const appliedTo = mode === 'range' ? value?.to : value;
  const selFrom = pendingFrom ?? appliedFrom ?? null;
  const selTo = mode === 'single' ? selFrom : (pendingTo ?? (pendingFrom != null ? null : appliedTo ?? null));

  const cells = [];
  for (let i = 0; i < firstWeekday; i += 1) cells.push(null);
  for (let day = 1; day <= total; day += 1) {
    const iso = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    cells.push({ day, iso });
  }

  const showResetLink = mode === 'range' && pendingFrom != null;

  let statusText;
  let statusClass;
  let applyDisabled = false;
  if (mode === 'range') {
    if (pendingFrom != null && pendingTo == null) {
      statusText = `Start: ${formatRangeLabel(pendingFrom, pendingFrom)} — now click an end date`;
      statusClass = 'drp-status--pending';
      applyDisabled = true;
    } else if (pendingFrom != null && pendingTo != null) {
      statusText = `${formatRangeLabel(pendingFrom, pendingTo)} selected`;
      statusClass = 'drp-status--confirmed';
    } else {
      statusText = appliedFrom && appliedTo ? formatRangeLabel(appliedFrom, appliedTo) : 'Select a date range';
      statusClass = 'drp-status--applied';
    }
  }

  const triggerLabel = mode === 'range'
    ? (value?.from && value?.to ? formatRangeLabel(value.from, value.to) : 'Select dates')
    : (formatSingleLabel(value) || placeholder);

  return (
    <div className="drp-wrap">
      <button
        ref={triggerRef}
        type="button"
        className={`dash-btn dash-btn--outline drp-trigger${open ? ' drp-trigger--open' : ''}`}
        onClick={openPicker}
      >
        <CalendarIcon />
        {triggerLabel}
        <ChevronDownIcon open={open} />
      </button>

      {open && position && createPortal(
        <div ref={dropdownRef} className="drp-panel" style={{ top: position.top, left: position.left, right: position.right }}>
          <div className="drp-panel-body">
            {mode === 'range' && (
              <div className="drp-presets">
                {PRESETS.map((preset) => (
                  <button
                    key={preset.key}
                    type="button"
                    className="drp-preset-item"
                    onClick={() => applyPreset(preset)}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            )}

            <div className="drp-calendar">
              <div className="drp-calendar-nav">
                <button type="button" className="drp-nav-btn" onClick={goPrevMonth} aria-label="Previous month">
                  <ChevronLeftIcon />
                </button>
                <span className="drp-month-label">{MONTHS[viewMonth]} {viewYear}</span>
                <button type="button" className="drp-nav-btn" onClick={goNextMonth} aria-label="Next month">
                  <ChevronRightIcon />
                </button>
              </div>

              <div className="drp-weekday-row">
                {WEEKDAYS.map((w, i) => (
                  // eslint-disable-next-line react/no-array-index-key
                  <span key={i} className="drp-weekday">{w}</span>
                ))}
              </div>

              <div className="drp-day-grid">
                {cells.map((cell, i) => {
                  if (!cell) return <div key={`empty-${i}`} className="drp-day-cell" />; // eslint-disable-line react/no-array-index-key
                  const { day, iso } = cell;
                  const inRange = selFrom != null && selTo != null && iso >= selFrom && iso <= selTo;
                  const isStart = iso === selFrom;
                  const isEnd = selTo != null && iso === selTo;
                  const isToday = iso === todayISO();
                  const wrapClass = inRange
                    ? `drp-day-cell drp-day-cell--inrange${isStart ? ' drp-day-cell--range-start' : ''}${isEnd ? ' drp-day-cell--range-end' : ''}`
                    : 'drp-day-cell';
                  const bubbleClass = [
                    'drp-day-bubble',
                    (isStart || isEnd) ? 'drp-day-bubble--edge' : (inRange ? 'drp-day-bubble--inrange' : ''),
                    isToday && !isStart && !isEnd ? 'drp-day-bubble--today' : '',
                  ].filter(Boolean).join(' ');
                  return (
                    <div key={iso} className={wrapClass}>
                      <button type="button" className={bubbleClass} onClick={() => pickDay(iso)}>
                        {day}
                      </button>
                    </div>
                  );
                })}
              </div>

              {mode === 'range' ? (
                <div className="drp-footer">
                  <div className="drp-footer-status">
                    <span className={`drp-status ${statusClass}`}>
                      {statusClass === 'drp-status--confirmed' && <span className="drp-status-check">&#10003;</span>}
                      {statusText}
                    </span>
                    {showResetLink && (
                      <button type="button" className="drp-reset-link" onClick={resetPending}>
                        Start over
                      </button>
                    )}
                  </div>
                  <div className="drp-footer-actions">
                    <button type="button" className="drp-cancel-btn" onClick={closeAndReset}>Cancel</button>
                    <button type="button" className="drp-apply-btn" disabled={applyDisabled} onClick={applyRange}>
                      Apply
                    </button>
                  </div>
                </div>
              ) : (
                <div className="drp-footer drp-footer--single">
                  <button
                    type="button"
                    className="drp-preset-item drp-preset-item--today"
                    onClick={() => pickDay(todayISO())}
                  >
                    Today
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}

export default DateRangePicker;
