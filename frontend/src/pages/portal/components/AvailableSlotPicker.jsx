import { useEffect, useState } from 'react';
import { getAvailableSlots } from '../../../api/appointments';
import { formatDateLong, formatTime12h } from '../dateTimeUtils';

// Shared by the pediatric dentist's own reschedule form (PediatricQueue.jsx)
// and the patient's "Request a Different Date" counter-offer
// (PatientAppointments.jsx) — both used to be a blind date + time input,
// so either side could type something already taken and only find out
// after submitting. Picking a date here calls the same
// /schedules/available-slots endpoint the booking wizard and the
// general-dentist RescheduleModal already use, and shows real open times
// as clickable pills instead. The server still re-checks availability on
// submit either way — this is a convenience, not a replacement for that.
function AvailableSlotPicker({ dentistId, serviceId, date, onDateChange, time, onTimeChange, idPrefix }) {
  const [slots, setSlots] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!date) {
      setSlots([]);
      return undefined;
    }
    let cancelled = false;
    setLoading(true);
    onTimeChange('');
    getAvailableSlots(dentistId, serviceId, date)
      .then((result) => { if (!cancelled) setSlots(result.slots || []); })
      .catch(() => { if (!cancelled) setSlots([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, dentistId, serviceId]);

  return (
    <div className="queue-card-propose-row" style={{ alignItems: 'flex-start' }}>
      <div className="form-field">
        <label className="form-label" htmlFor={`${idPrefix}-date`}>New date</label>
        <input
          id={`${idPrefix}-date`}
          type="date"
          className="form-input"
          min={new Date(Date.now() + 86400000).toISOString().slice(0, 10)}
          value={date}
          onChange={(e) => onDateChange(e.target.value)}
        />
      </div>
      <div style={{ flex: 2, minWidth: 220 }}>
        <label className="form-label" style={{ display: 'block', marginBottom: 6 }}>
          Available times{date ? ` for ${formatDateLong(date)}` : ''}
        </label>
        {!date ? (
          <p className="booking-empty-note" style={{ padding: 0, textAlign: 'left' }}>Pick a date to see open times.</p>
        ) : loading ? (
          <p className="booking-empty-note" style={{ padding: 0, textAlign: 'left' }}>Loading…</p>
        ) : slots.length === 0 ? (
          <p className="booking-empty-note" style={{ padding: 0, textAlign: 'left' }}>No open slots for this date.</p>
        ) : (
          <div className="slots-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
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
      </div>
    </div>
  );
}

export default AvailableSlotPicker;
