import { useEffect, useMemo, useState } from 'react';
import { getAvailableSlots, getDayAvailability } from '../../../api/appointments';
import { formatDateLong, formatTime12h } from '../dateTimeUtils';

const WEEKDAY_LABELS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const MONTH_LABELS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const DAY_STATUS_LABELS = {
  available: 'Available',
  limited: 'Limited Slots',
  full: 'Fully Booked',
  unavailable: 'Unavailable',
};

function toDateKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function startOfDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

// Shared by the pediatric dentist's own reschedule form (PediatricQueue.jsx)
// and the patient's "Request a Different Date" counter-offer
// (PatientAppointments.jsx) — same real calendar + slots-grid the patient
// booking wizard's own "Pick a Date & Time" step already uses (getDayAvailability
// for the color-coded month grid, getAvailableSlots for the chosen day's real
// open times), replacing what used to be a native <input type="date"> and a
// blind time input on both sides. The server still re-checks availability on
// submit either way — this is a convenience, not a replacement for that.
//
// Same-day is always disabled here regardless of what the fetched day status
// says — reschedule/counter-propose both require appointment_date after:today
// server-side (PediatricVerificationController::proposeNewDate(),
// PatientAppointmentController::requestDifferentDate()), and
// getDayAvailabilitySummary() doesn't know about that rule, only about slot
// capacity.
//
// compact: true stacks the calendar above the slots (the patient's narrow
// modal) instead of side-by-side (the wider Pediatric Queue card) — a plain
// inline flex direction, not a viewport media query, since a component
// sitting inside a ~440px modal can't rely on the browser window itself
// being narrow.
function AvailableSlotPicker({ dentistId, serviceId, date, onDateChange, time, onTimeChange, compact }) {
  const [calendarMonth, setCalendarMonth] = useState(() => startOfDay(new Date()));
  const [dayAvailability, setDayAvailability] = useState({});
  const [slots, setSlots] = useState([]);
  const [loadingSlots, setLoadingSlots] = useState(false);

  useEffect(() => {
    if (!dentistId || !serviceId) return;
    const monthKey = `${calendarMonth.getFullYear()}-${String(calendarMonth.getMonth() + 1).padStart(2, '0')}`;
    getDayAvailability(dentistId, serviceId, monthKey)
      .then(setDayAvailability)
      .catch(() => setDayAvailability({}));
  }, [dentistId, serviceId, calendarMonth]);

  useEffect(() => {
    if (!date) {
      setSlots([]);
      return undefined;
    }
    let cancelled = false;
    setLoadingSlots(true);
    onTimeChange('');
    getAvailableSlots(dentistId, serviceId, date)
      .then((result) => { if (!cancelled) setSlots(result.slots || []); })
      .catch(() => { if (!cancelled) setSlots([]); })
      .finally(() => { if (!cancelled) setLoadingSlots(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, dentistId, serviceId]);

  const calendarCells = useMemo(() => {
    const year = calendarMonth.getFullYear();
    const month = calendarMonth.getMonth();
    const firstOfMonth = new Date(year, month, 1);
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const leadingBlanks = firstOfMonth.getDay();

    const cells = Array.from({ length: leadingBlanks }, () => null);
    for (let day = 1; day <= daysInMonth; day++) {
      cells.push(new Date(year, month, day));
    }
    return cells;
  }, [calendarMonth]);

  const today = startOfDay(new Date());
  const isPrevDisabled = calendarMonth.getFullYear() === today.getFullYear() && calendarMonth.getMonth() === today.getMonth();

  return (
    <div style={{ display: 'flex', flexDirection: compact ? 'column' : 'row', gap: 16, alignItems: 'flex-start' }}>
      <div style={{ width: compact ? '100%' : undefined, flex: compact ? 'none' : 1, padding: 14, background: 'var(--portal-canvas)', border: '1px solid var(--portal-border-light)', borderRadius: 14, boxSizing: 'border-box' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <button
            type="button"
            className="calendar-nav-btn"
            disabled={isPrevDisabled}
            onClick={() => setCalendarMonth((m) => new Date(m.getFullYear(), m.getMonth() - 1, 1))}
            aria-label="Previous month"
          >
            &#8249;
          </button>
          <span className="calendar-month-label">{MONTH_LABELS[calendarMonth.getMonth()]} {calendarMonth.getFullYear()}</span>
          <button
            type="button"
            className="calendar-nav-btn"
            onClick={() => setCalendarMonth((m) => new Date(m.getFullYear(), m.getMonth() + 1, 1))}
            aria-label="Next month"
          >
            &#8250;
          </button>
        </div>

        <div className="calendar-grid">
          {WEEKDAY_LABELS.map((wd) => (
            <span key={wd} className="calendar-weekday">{wd}</span>
          ))}
          {calendarCells.map((d, i) => {
            if (!d) return <span key={`blank-${i}`} className="calendar-cell calendar-cell--blank" />;

            const key = toDateKey(d);
            // Same-day is never bookable for a pediatric reschedule/counter —
            // forced unavailable here regardless of the fetched status, which
            // only reflects slot capacity, not this rule.
            const status = d.getTime() <= today.getTime() ? 'unavailable' : (dayAvailability[key] || 'unavailable');
            const isSelected = key === date;

            return (
              <button
                key={key}
                type="button"
                className={`calendar-cell calendar-cell--${status}${isSelected ? ' calendar-cell--selected' : ''}`}
                disabled={status === 'unavailable'}
                onClick={() => onDateChange(key)}
                title={DAY_STATUS_LABELS[status]}
              >
                {d.getDate()}
              </button>
            );
          })}
        </div>

        <div className="calendar-legend">
          {Object.entries(DAY_STATUS_LABELS).map(([status, label]) => (
            <span key={status} className="calendar-legend-item">
              <span className={`calendar-legend-dot calendar-legend-dot--${status}`} aria-hidden="true" />
              {label}
            </span>
          ))}
        </div>
      </div>

      <div style={{ width: compact ? '100%' : undefined, flex: compact ? 'none' : 1, padding: 14, background: 'var(--portal-canvas)', border: '1px solid var(--portal-border-light)', borderRadius: 14, boxSizing: 'border-box' }}>
        {!date ? (
          <p className="booking-empty-note" style={{ padding: 0, textAlign: 'left' }}>Pick a date to see open times.</p>
        ) : (
          <>
            <p style={{ margin: '0 0 2px', fontSize: '0.72rem', color: 'var(--portal-muted)' }}>Available times for</p>
            <h4 style={{ margin: '0 0 10px', fontSize: '0.95rem', fontWeight: 700, color: 'var(--portal-navy)' }}>{formatDateLong(date)}</h4>
            {loadingSlots ? (
              <p className="booking-empty-note" style={{ padding: 0, textAlign: 'left' }}>Loading…</p>
            ) : slots.length === 0 ? (
              <p className="booking-empty-note" style={{ padding: 0, textAlign: 'left' }}>No open slots for this date.</p>
            ) : (
              <div className="slots-grid">
                {slots.map((t) => (
                  <button
                    key={t}
                    type="button"
                    className={`slot-card${t === time ? ' slot-card--selected' : ''}`}
                    onClick={() => onTimeChange(t)}
                  >
                    {formatTime12h(t)}
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default AvailableSlotPicker;
