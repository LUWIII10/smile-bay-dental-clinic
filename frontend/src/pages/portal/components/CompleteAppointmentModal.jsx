import { useEffect, useState } from 'react';
import Modal from './Modal';
import { formatDateLong, formatTime12h } from '../dateTimeUtils';
import { completeAppointment } from '../../../api/appointments';

const NOTES_MIN_LENGTH = 20;

// The only path to completing an appointment now runs through this form —
// no skip, no dismiss-into-completion (Cancel writes nothing and leaves the
// appointment confirmed, matching DentistSchedule's existing cancel/
// reschedule pattern). Deliberately its own component rather than an
// extraction of PatientRecords.jsx's "Log Completed Procedure" modal: the
// two now do genuinely different jobs — pre-filled fields, a required
// minimum-length note, inline field errors, and a submit that completes the
// appointment in the same request are all real differences, not cosmetic
// ones. Reuses the same Modal wrapper and form-input/form-textarea/
// modal-field-label/modal-actions classes so it still looks identical to
// every other modal in the portal.
function CompleteAppointmentModal({ open, appointment, onClose, onCompleted }) {
  const [procedureName, setProcedureName] = useState('');
  const [toothNumber, setToothNumber] = useState('');
  const [performedAt, setPerformedAt] = useState('');
  const [notes, setNotes] = useState('');
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  // Re-seed the form from the appointment being completed every time the
  // modal opens — not on every appointment prop change, so switching which
  // row's Complete button was clicked always starts from that row's own
  // booked service/date, never a previous row's edited values.
  useEffect(() => {
    if (!open || !appointment) return;
    setProcedureName(appointment.service?.name || '');
    setToothNumber('');
    setPerformedAt(appointment.appointment_date?.slice(0, 10) || '');
    setNotes('');
    setErrors({});
    setFormError('');
  }, [open, appointment]);

  if (!appointment) return null;

  const patientName = `${appointment.patient?.first_name || ''} ${appointment.patient?.last_name || ''}`.trim();

  const validate = () => {
    const next = {};
    if (!procedureName.trim()) next.procedure_name = 'Enter the procedure that was performed.';
    if (!performedAt) next.performed_at = 'Enter the date this was performed.';
    if (toothNumber && (Number(toothNumber) < 1 || Number(toothNumber) > 32)) {
      next.tooth_number = 'Tooth number must be between 1 and 32.';
    }
    if (notes.trim().length < NOTES_MIN_LENGTH) {
      next.notes = `At least ${NOTES_MIN_LENGTH} characters — ${notes.trim().length}/${NOTES_MIN_LENGTH} so far.`;
    }
    return next;
  };

  const handleSubmit = async () => {
    const clientErrors = validate();
    if (Object.keys(clientErrors).length > 0) {
      setErrors(clientErrors);
      return;
    }

    setSaving(true);
    setFormError('');
    setErrors({});
    try {
      const response = await completeAppointment(appointment.id, {
        procedureName: procedureName.trim(),
        toothNumber: toothNumber ? Number(toothNumber) : null,
        performedAt,
        notes: notes.trim(),
      });
      onCompleted(response.data);
    } catch (err) {
      const serverErrors = err.response?.data?.errors;
      if (serverErrors) {
        setErrors(
          Object.fromEntries(Object.entries(serverErrors).map(([field, messages]) => [field, messages[0]]))
        );
      }
      setFormError(err.response?.data?.message || 'Could not save this record. The appointment has not been completed.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Record the procedure">
      <p style={{ margin: '0 0 4px', fontSize: '0.85rem', fontWeight: 600, color: 'var(--portal-navy)' }}>
        {patientName}
      </p>
      <p style={{ margin: '0 0 14px', fontSize: '0.78rem', color: 'var(--portal-muted)' }}>
        {formatDateLong(appointment.appointment_date)} &middot; {formatTime12h(appointment.appointment_time)}
      </p>
      <p style={{ margin: '0 0 16px', fontSize: '0.78rem', color: 'var(--portal-muted)', lineHeight: 1.5 }}>
        This goes into the patient's dental record. The appointment is marked complete once saved.
      </p>

      <label className="modal-field-label" htmlFor="procedure-name">Procedure performed</label>
      <input
        id="procedure-name"
        className="form-input"
        value={procedureName}
        onChange={(e) => setProcedureName(e.target.value)}
        maxLength={255}
      />
      {errors.procedure_name && <span className="modal-field-error">{errors.procedure_name}</span>}

      <label className="modal-field-label" htmlFor="tooth-number">Tooth number</label>
      <input
        id="tooth-number"
        className="form-input"
        type="number"
        min="1"
        max="32"
        value={toothNumber}
        onChange={(e) => setToothNumber(e.target.value)}
        placeholder="Optional"
      />
      {errors.tooth_number && <span className="modal-field-error">{errors.tooth_number}</span>}

      <label className="modal-field-label" htmlFor="performed-at">Date performed</label>
      <input
        id="performed-at"
        className="form-input"
        type="date"
        value={performedAt}
        onChange={(e) => setPerformedAt(e.target.value)}
      />
      {errors.performed_at && <span className="modal-field-error">{errors.performed_at}</span>}

      <label className="modal-field-label" htmlFor="procedure-notes">Clinical notes</label>
      <textarea
        id="procedure-notes"
        className="form-textarea"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        maxLength={1000}
      />
      <span className="modal-field-hint">
        What was done, findings, materials used, anything the next dentist needs to know. Minimum {NOTES_MIN_LENGTH} characters.
      </span>
      {errors.notes && <span className="modal-field-error">{errors.notes}</span>}

      {formError && <div className="profile-alert profile-alert--error" style={{ marginTop: 14 }}>{formError}</div>}

      <div className="modal-actions">
        <button type="button" className="dash-btn dash-btn--outline" onClick={onClose} disabled={saving}>
          Cancel
        </button>
        <button type="button" className="dash-btn" onClick={handleSubmit} disabled={saving}>
          {saving ? 'Saving…' : 'Save & complete'}
        </button>
      </div>
    </Modal>
  );
}

export default CompleteAppointmentModal;
