import { useEffect, useState } from 'react';
import Modal from './Modal';
import { getAvailableSlots, rescheduleAppointment } from '../../../api/appointments';
import { formatTime12h } from '../dateTimeUtils';
import '../BookAppointment.css';

function todayDateKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Dentist-only — the appointment's own dentist/service never change here,
// only the date/time, so this reuses the exact same getAvailableSlots grid
// the patient booking wizard and staff walk-in modal use (real
// AppointmentSlotService math), just with dentist/service fixed instead of
// pickable.
function RescheduleModal({ open, onClose, appointment, onSuccess }) {
  const [date, setDate] = useState(todayDateKey());
  const [timeSlots, setTimeSlots] = useState([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [time, setTime] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open || !appointment) return;
    setDate(appointment.appointment_date.slice(0, 10));
    setTime('');
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
      await rescheduleAppointment(appointment.id, date, time);
      onSuccess();
    } catch (err) {
      setError(err.response?.data?.message || 'Could not reschedule this appointment.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Reschedule Appointment">
      <p style={{ margin: '0 0 16px', fontSize: '0.85rem', color: 'var(--portal-muted)' }}>
        {patientName} &middot; {appointment.service?.name}
      </p>

      <label className="modal-field-label">New Date</label>
      <input
        type="date"
        className="form-input"
        value={date}
        min={todayDateKey()}
        onChange={(e) => setDate(e.target.value)}
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

      {error && (
        <p style={{ margin: '12px 0 0', fontSize: '0.82rem', color: 'var(--portal-red-text)' }}>{error}</p>
      )}

      <div className="modal-actions">
        <button type="button" className="dash-btn dash-btn--outline" onClick={onClose}>
          Cancel
        </button>
        <button type="button" className="dash-btn" disabled={!time || submitting} onClick={handleSubmit}>
          {submitting ? 'Saving…' : 'Confirm Reschedule'}
        </button>
      </div>
    </Modal>
  );
}

export default RescheduleModal;
