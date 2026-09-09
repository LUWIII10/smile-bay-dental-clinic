import Modal from './Modal';

// Shared reject-with-reason dialog — originally built inline for the
// Pediatric Queue, extracted here so the Staff HMO Queue (and any future
// reject-style action) gets the exact same look/behavior instead of a
// second hand-copied modal. Reuses Modal (white card) + .form-textarea
// (explicit light background/dark text — see dashboards.css, fixed for
// readability against the app's global color-scheme: light dark default)
// so contrast is inherited correctly rather than redefined here.
function RejectionModal({
  open,
  onClose,
  title = 'Reject Appointment',
  message = "Optionally let the patient know why this couldn't be confirmed.",
  reason,
  onReasonChange,
  onConfirm,
  confirming = false,
  confirmLabel = 'Reject Appointment',
  cancelLabel = 'Cancel',
}) {
  return (
    <Modal open={open} onClose={onClose} title={title}>
      <p style={{ margin: '0 0 12px', fontSize: '0.85rem', color: 'var(--portal-muted)' }}>{message}</p>
      <textarea
        className="form-textarea"
        placeholder="Reason (optional)"
        value={reason}
        onChange={(e) => onReasonChange(e.target.value)}
      />
      <div className="modal-actions">
        <button type="button" className="dash-btn dash-btn--outline" onClick={onClose}>
          {cancelLabel}
        </button>
        <button type="button" className="dash-btn dash-btn--danger" disabled={confirming} onClick={onConfirm}>
          {confirming ? 'Rejecting…' : confirmLabel}
        </button>
      </div>
    </Modal>
  );
}

export default RejectionModal;
