import { useEffect, useState } from 'react';
import Modal from './Modal';
import { formatDateLong, formatTime12h } from '../dateTimeUtils';
import { completeAppointment, getServices } from '../../../api/appointments';

const NOTES_MIN_LENGTH = 20;

// Kept in sync with Appointment::FOLLOW_UP_WINDOWS — purely a display label
// shown to the patient next to a follow-up recommendation, never used in
// any scheduling/availability check.
const FOLLOW_UP_WINDOWS = ['1-2 weeks', '1 month', '3 months', '6 months'];

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

  // Optional — lets the dentist flag a follow-up right here, while the
  // visit is still fresh, instead of staff having to infer one from the
  // notes later. This does NOT open it for the patient on its own: it only
  // pre-fills what staff see on "Enable Follow-up" (AppointmentDetailModal),
  // who still review and activate it themselves, same as before this existed.
  const [suggestFollowUp, setSuggestFollowUp] = useState(false);
  const [followUpServiceId, setFollowUpServiceId] = useState('');
  const [followUpWindow, setFollowUpWindow] = useState('');
  const [services, setServices] = useState([]);

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
    setSuggestFollowUp(false);
    setFollowUpServiceId('');
    setFollowUpWindow('');
  }, [open, appointment]);

  // Same full staff-facing catalog AppointmentDetailModal's own "Enable
  // Follow-up" picker uses — fetched lazily, once, only once the toggle is
  // actually switched on.
  useEffect(() => {
    if (!suggestFollowUp || services.length > 0) return;
    getServices().then(setServices).catch(() => {});
  }, [suggestFollowUp, services.length]);

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
        recommendFollowUpServiceId: suggestFollowUp && followUpServiceId ? Number(followUpServiceId) : null,
        recommendFollowUpWindow: suggestFollowUp ? followUpWindow : null,
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

      <div style={{ marginTop: 16, padding: '12px 14px', background: 'var(--portal-canvas)', border: '1px dashed var(--portal-border)', borderRadius: 'var(--portal-radius-sm)' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: '0.85rem', fontWeight: 700, color: 'var(--portal-navy)', cursor: 'pointer' }}>
          <input type="checkbox" checked={suggestFollowUp} onChange={(e) => setSuggestFollowUp(e.target.checked)} />
          Recommend a follow-up for this patient?
        </label>
        <p style={{ margin: '6px 0 0', fontSize: '0.76rem', color: 'var(--portal-muted)', lineHeight: 1.5 }}>
          This pre-fills staff&rsquo;s own &ldquo;Enable Follow-up&rdquo; step — they still review and activate it before the patient sees it.
        </p>

        {suggestFollowUp && (
          <>
            <label className="modal-field-label" htmlFor="followup-service" style={{ marginTop: 12 }}>Procedure</label>
            <select
              id="followup-service"
              className="form-select"
              value={followUpServiceId}
              onChange={(e) => setFollowUpServiceId(e.target.value)}
            >
              <option value="">Select a procedure…</option>
              {services.map((service) => (
                <option key={service.id} value={service.id}>
                  {service.name} ({service.duration_minutes} min)
                </option>
              ))}
            </select>

            <label className="modal-field-label">Recommended within <span style={{ fontWeight: 400, color: 'var(--portal-muted)', textTransform: 'none' }}>(optional)</span></label>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {FOLLOW_UP_WINDOWS.map((window) => {
                const selected = followUpWindow === window;
                return (
                  <button
                    key={window}
                    type="button"
                    style={{
                      padding: '5px 12px', fontSize: '0.74rem', fontWeight: 600, borderRadius: 999, cursor: 'pointer',
                      border: `1.5px solid ${selected ? 'var(--portal-green-border)' : 'var(--portal-border)'}`,
                      background: selected ? 'var(--portal-green-bg)' : '#fff',
                      color: selected ? 'var(--portal-green-text)' : 'var(--portal-muted)',
                    }}
                    onClick={() => setFollowUpWindow(selected ? '' : window)}
                  >
                    {window}
                  </button>
                );
              })}
            </div>
          </>
        )}
      </div>

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
