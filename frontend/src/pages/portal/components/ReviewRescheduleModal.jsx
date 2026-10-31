import { useEffect, useState } from 'react';
import Modal from './Modal';
import { reviewRescheduleRequest } from '../../../api/appointments';
import { formatDateLong, formatTime12h } from '../dateTimeUtils';
import { CalendarIcon, CheckCircleIcon } from '../icons';

// Staff decides on a patient's countered reschedule date
// (AllAppointments.jsx's "Review Requested Date" action, appointment.
// patient_requested_date/time/_new_date_at). Approve commits the patient's
// requested date as the real appointment_date/time; Decline clears only the
// request, leaving the dentist's original proposal (dentist_proposed_new_date_at)
// in place so the patient lands back on "Respond" to it.
function ReviewRescheduleModal({ open, onClose, appointment, onSuccess }) {
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setNote('');
    setError('');
    setSubmitting(false);
  }, [open, appointment]);

  if (!appointment) return null;

  const patientName = `${appointment.patient?.first_name || ''} ${appointment.patient?.last_name || ''}`.trim();

  const handleDecide = async (action) => {
    setSubmitting(true);
    setError('');
    try {
      await reviewRescheduleRequest(appointment.id, action, note.trim() || undefined);
      onSuccess();
    } catch (err) {
      setError(err.response?.data?.message || 'Could not record this decision.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Review Requested Date" icon={CalendarIcon} tone="blue">
      <p style={{ margin: '0 0 14px', fontSize: '0.85rem', color: 'var(--portal-muted)' }}>
        {patientName} &middot; {appointment.service?.name}
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 9, marginBottom: 14 }}>
        <div style={{ background: 'var(--portal-canvas)', border: '1px solid var(--portal-border-light)', borderRadius: 9, padding: 11 }}>
          <span style={{ display: 'block', fontSize: '0.62rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--portal-muted)', marginBottom: 4 }}>
            Dentist Proposed
          </span>
          <span style={{ fontWeight: 700, fontSize: '0.86rem', color: 'var(--portal-navy)' }}>
            {formatDateLong(appointment.appointment_date)} &middot; {formatTime12h(appointment.appointment_time)}
          </span>
        </div>
        <div style={{ background: 'var(--portal-blue-bg)', border: '1px solid var(--portal-blue-border)', borderRadius: 9, padding: 11 }}>
          <span style={{ display: 'block', fontSize: '0.62rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--portal-blue-text)', marginBottom: 4 }}>
            Patient Requested
          </span>
          <span style={{ fontWeight: 700, fontSize: '0.86rem', color: 'var(--portal-navy)' }}>
            {formatDateLong(appointment.patient_requested_date)} &middot; {formatTime12h(appointment.patient_requested_time)}
          </span>
        </div>
      </div>

      <label className="modal-field-label" htmlFor="review-reschedule-note">
        Note <span style={{ fontWeight: 400, color: 'var(--portal-muted)' }}>(optional, shown to the patient if declined)</span>
      </label>
      <textarea
        id="review-reschedule-note"
        className="form-textarea"
        rows={2}
        maxLength={1000}
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="e.g. Dr. Ramirez already has a procedure booked that afternoon."
      />

      {error && (
        <p style={{ margin: '10px 0 0', fontSize: '0.82rem', color: 'var(--portal-red-text)' }}>{error}</p>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 9, marginTop: 16 }}>
        <button
          type="button"
          className="dash-btn dash-btn--success"
          disabled={submitting}
          onClick={() => handleDecide('approve')}
        >
          <CheckCircleIcon /> {submitting ? 'Saving…' : `Approve ${formatDateLong(appointment.patient_requested_date)}, ${formatTime12h(appointment.patient_requested_time)}`}
        </button>
        <button
          type="button"
          className="dash-btn dash-btn--outline-danger"
          disabled={submitting}
          onClick={() => handleDecide('decline')}
        >
          Decline — Ask Patient to Pick Again
        </button>
      </div>
    </Modal>
  );
}

export default ReviewRescheduleModal;
