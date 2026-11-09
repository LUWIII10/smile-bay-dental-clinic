import { useEffect, useState } from 'react';
import Modal from './Modal';
import { rescheduleAppointment } from '../../../api/appointments';
import AvailableSlotPicker from './AvailableSlotPicker';
// AvailableSlotPicker renders .calendar-cell/.slot-card/etc. but doesn't
// import their CSS itself (every existing caller — PediatricQueue.jsx,
// PatientAppointments.jsx, HmoVerificationQueue.jsx — already has its own
// BookAppointment.css import); AllAppointments.jsx/DentistSchedule.jsx/
// Settings.jsx (this modal's own callers) don't, so it's imported here
// instead, same as this file already did for its own pre-AvailableSlotPicker
// markup.
import '../BookAppointment.css';

function todayDateKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Dentist's own schedule by default — the appointment's own dentist/service
// never change here, only the date/time, so this reuses the exact same
// color-coded calendar + Morning/Afternoon slots Book Appointment itself
// uses (via AvailableSlotPicker — real AppointmentSlotService math), just
// with dentist/service fixed instead of pickable. Previously this rendered
// its own plain date field + flat time-button list reading straight
// getAvailableSlots(), a second, visually different picker reading the same
// data — AvailableSlotPicker replaces both pieces at once, so a slot shown
// here can never look open/full differently than the real booking calendar
// does. `rescheduleFn` is swappable (defaults to the dentist-only API) so
// staff's clinic-wide "Move to Another Schedule" action (AllAppointments.jsx)
// and the Clinic Closures reschedule-first flow (Settings.jsx) can reuse
// this same modal with their own staff-wide endpoint — every other existing
// caller is unaffected.
//
// `needsConfirmation` (default true, matching the default rescheduleFn)
// controls whether this is a proposal the patient must confirm before it's
// final, or an instant apply. The dentist's own "Reschedule" isn't usually
// urgent, so the patient gets a say; staff's direct-reschedule actions are
// for a same-day, time-critical move, so they stay instant — callers pass
// needsConfirmation={false} alongside their own rescheduleFn.
function RescheduleModal({
  open, onClose, appointment, onSuccess, rescheduleFn = rescheduleAppointment, needsConfirmation = true,
}) {
  const [date, setDate] = useState(todayDateKey());
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

  if (!appointment) return null;

  const patientName = `${appointment.patient?.first_name || ''} ${appointment.patient?.last_name || ''}`.trim()
    || appointment.patient_name;

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
        {patientName} &middot; {appointment.service?.name || appointment.service_name}
      </p>
      {needsConfirmation && (
        <p style={{ margin: '-8px 0 16px', fontSize: '0.8rem', color: 'var(--portal-muted)' }}>
          This won&rsquo;t apply right away — the patient will need to confirm it first.
        </p>
      )}

      <AvailableSlotPicker
        dentistId={appointment.dentist_id}
        serviceId={appointment.service_id}
        date={date}
        onDateChange={setDate}
        time={time}
        onTimeChange={setTime}
        disableToday={false}
        compact
      />

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
