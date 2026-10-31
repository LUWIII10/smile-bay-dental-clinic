import { useEffect, useState } from 'react';
import Modal from './Modal';
import { getAvailableSlots, rescheduleAppointment } from '../../../api/appointments';
import { formatTime12h } from '../dateTimeUtils';
import DateRangePicker from './DateRangePicker';
import '../BookAppointment.css';

function todayDateKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Dentist's own schedule by default — the appointment's own dentist/service
// never change here, only the date/time, so this reuses the exact same
// getAvailableSlots grid the patient booking wizard and staff walk-in modal
// use (real AppointmentSlotService math), just with dentist/service fixed
// instead of pickable. `rescheduleFn` is swappable (defaults to the
// dentist-only API) so staff's clinic-wide "Move to Next Open Slot" action
// (AllAppointments.jsx) can reuse this same modal with its own staff-wide
// endpoint — every other existing caller is unaffected.
//
// `needsConfirmation` (default true, matching the default rescheduleFn)
// controls whether this is a proposal the patient must confirm before it's
// final, or an instant apply. The dentist's own "Reschedule" isn't usually
// urgent, so the patient gets a say; staff's "Move to Next Open Slot" is for
// a running-late patient the SAME day, so it stays instant — AllAppointments
// passes needsConfirmation={false} alongside its own rescheduleFn.
function RescheduleModal({
  open, onClose, appointment, onSuccess, rescheduleFn = rescheduleAppointment, needsConfirmation = true,
}) {
  const [date, setDate] = useState(todayDateKey());
  const [timeSlots, setTimeSlots] = useState([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [time, setTime] = useState('');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open || !appointment) return;
    setDate(appointment.appointment_date.slice(0, 10));
    setTime('');
    setReason('');
    setError('');
    setSubmitting(false);
  }, [open, appointment]);

  useEffect(() => {
    if (!open || !appointment || !date) return;
    (async () => {
      setLoadingSlots(true);
      setTime('');
      try {
        const result = await getAvailableSlots(appointment.dentist_id, appointment.service_id, date);
        setTimeSlots(result.slots || []);
      } catch {
        setTimeSlots([]);
      } finally {
        setLoadingSlots(false);
      }
    })();
  }, [open, appointment, date]);

  if (!appointment) return null;

  const patientName = `${appointment.patient?.first_name || ''} ${appointment.patient?.last_name || ''}`.trim();

  const handleSubmit = async () => {
    if (!time) return;
    setSubmitting(true);
    setError('');
    try {
      if (needsConfirmation) {
        await rescheduleFn(appointment.id, date, time, reason.trim() || undefined);
      } else {
        await rescheduleFn(appointment.id, date, time);
      }
      onSuccess();
    } catch (err) {
      setError(err.response?.data?.message || 'Could not reschedule this appointment.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={needsConfirmation ? 'Propose a New Time' : 'Reschedule Appointment'}>
      <p style={{ margin: '0 0 16px', fontSize: '0.85rem', color: 'var(--portal-muted)' }}>
        {patientName} &middot; {appointment.service?.name}
      </p>
      {needsConfirmation && (
        <p style={{ margin: '-8px 0 16px', fontSize: '0.8rem', color: 'var(--portal-muted)' }}>
          This won&rsquo;t apply right away — the patient will need to confirm it first.
        </p>
      )}

      <label className="modal-field-label">New Date</label>
      <DateRangePicker
        mode="single"
        value={date}
        onChange={setDate}
        minDate={todayDateKey()}
        placeholder="Pick a date"
      />

      <label className="modal-field-label" style={{ marginTop: 14, display: 'block' }}>New Time</label>
      {loadingSlots ? (
        <p style={{ fontSize: '0.85rem', color: 'var(--portal-muted)' }}>Loading open slots…</p>
      ) : timeSlots.length === 0 ? (
        <p style={{ fontSize: '0.85rem', color: 'var(--portal-muted)' }}>No open slots for this date.</p>
      ) : (
        <div className="slots-grid">
          {timeSlots.map((t) => (
            <button
              key={t}
              type="button"
              className={`slot-card${t === time ? ' slot-card--selected' : ''}`}
              onClick={() => setTime(t)}
            >
              {formatTime12h(t)}
            </button>
          ))}
        </div>
      )}

      {needsConfirmation && (
        <>
          <label className="modal-field-label" htmlFor="reschedule-reason" style={{ marginTop: 14, display: 'block' }}>
            Reason <span style={{ fontWeight: 400, color: 'var(--portal-muted)' }}>(optional, shown to the patient)</span>
          </label>
          <textarea
            id="reschedule-reason"
            className="form-input"
            rows={2}
            maxLength={1000}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Need to move this — I have a half-day training that morning."
          />
        </>
      )}

      {error && (
        <p style={{ margin: '12px 0 0', fontSize: '0.82rem', color: 'var(--portal-red-text)' }}>{error}</p>
      )}

      <div className="modal-actions">
        <button type="button" className="dash-btn dash-btn--outline" onClick={onClose}>
          Cancel
        </button>
        <button type="button" className="dash-btn" disabled={!time || submitting} onClick={handleSubmit}>
          {submitting ? 'Saving…' : needsConfirmation ? 'Send for Confirmation' : 'Confirm Reschedule'}
        </button>
      </div>
    </Modal>
  );
}

export default RescheduleModal;
