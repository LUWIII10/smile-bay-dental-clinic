import { useCallback, useEffect, useRef, useState } from 'react';
import api from '../../api';
import { getHmoQueue, verifyHmoAppointment, sendHmoStatusUpdate, updatePatientHmoInfo } from '../../api/appointments';
import StatusBadge from './components/StatusBadge';
import RejectionModal from './components/RejectionModal';
import Modal from './components/Modal';
import Skeleton from './components/Skeleton';
import PageHeader from './components/PageHeader';
import { ShieldIcon, CheckCircleIcon, MailIcon } from './icons';
import { formatDateLong, formatTime12h } from './dateTimeUtils';
import { showSuccessToast } from '../../utils/toast';
import './dashboards.css';
import './Appointments.css';

// Matches StaffVerificationController::sendStatusUpdate()'s own guard —
// checked client-side too so the button can honestly disable itself
// instead of letting staff click it and get a 422 back.
const WALKIN_EMAIL_SUFFIX = '@walkin.smilebay.local';

// Kept in sync with StaffVerificationController::HMO_STATUS_LABELS — the
// server validates against this exact same list, so a value that isn't
// here would just come back as a 422 anyway.
const HMO_STATUS_LABELS = [
  'Ongoing Verification',
  'Awaiting HMO Response',
  'Documents Under Review',
  'Additional Information Needed',
  'Finalizing Approval',
];

const POLL_INTERVAL_MS = 9000;

function formatSubmitted(isoTimestamp) {
  return new Date(isoTimestamp).toLocaleString('en-US', {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  });
}

function QueueCard({ appointment, actingId, sendingId, onApprove, onReject, onSendUpdate, onEditHmoInfo }) {
  const isPediatricApproved = appointment.service?.name?.includes('Pediatric') && appointment.pediatric_confirmed_at;
  const hmoProviderName = appointment.patient?.hmo_provider?.name || appointment.patient?.hmo_company_name || 'HMO';
  const isActing = actingId === appointment.id;
  const isSending = sendingId === appointment.id;
  const patientEmail = appointment.patient?.user?.email || '';
  const hasNoEmailOnFile = patientEmail.endsWith(WALKIN_EMAIL_SUFFIX);

  return (
    <div className="queue-card">
      <div className="queue-card-header">
        <span className="queue-card-patient">
          {appointment.patient?.first_name} {appointment.patient?.last_name}
        </span>
        <div className="queue-card-badges">
          {isPediatricApproved && <StatusBadge status="pediatric_confirmed_pending_hmo" />}
          <StatusBadge status="pending_verification" />
          <span className="queue-card-submitted">Submitted {formatSubmitted(appointment.created_at)}</span>
        </div>
      </div>

      <div className="queue-card-grid">
        <div>
          <span className="queue-card-field-label">Service</span>
          <span className="queue-card-field-value">{appointment.service?.name}</span>
        </div>
        <div>
          <span className="queue-card-field-label">Assigned Dentist</span>
          <span className="queue-card-field-value">{appointment.dentist?.name || 'Unassigned'}</span>
        </div>
        <div>
          <span className="queue-card-field-label">Requested</span>
          <span className="queue-card-field-value">
            {formatDateLong(appointment.appointment_date)} &middot; {formatTime12h(appointment.appointment_time)}
          </span>
        </div>
        <div>
          <span className="queue-card-field-label">HMO Provider</span>
          <span className="queue-card-field-value">{hmoProviderName}</span>
        </div>
        <div>
          <span className="queue-card-field-label">Card Number</span>
          <span className="queue-card-field-value">{appointment.patient?.hmo_number || 'Not on file'}</span>
        </div>
      </div>

      <div className="queue-card-actions">
        <button type="button" className="dash-btn" disabled={isActing} onClick={() => onApprove(appointment)}>
          <CheckCircleIcon /> {isActing ? 'Saving…' : 'Approve'}
        </button>
        <button type="button" className="dash-btn dash-btn--outline" disabled={isActing} onClick={() => onReject(appointment)}>
          Reject
        </button>
        <button type="button" className="dash-btn dash-btn--outline" disabled={isActing} onClick={() => onEditHmoInfo(appointment)}>
          Edit HMO Info
        </button>
        <button
          type="button"
          className="dash-btn dash-btn--outline"
          disabled={isSending || hasNoEmailOnFile}
          title={hasNoEmailOnFile ? 'No email on file for this patient' : 'Email the patient that their HMO verification is still in progress'}
          onClick={() => onSendUpdate(appointment)}
        >
          <MailIcon /> {isSending ? 'Sending…' : 'Send Status Update'}
        </button>
      </div>
    </div>
  );
}

// The staff-side HMO coverage-verification queue — every non-pediatric HMO
// booking still pending_verification, plus pediatric+HMO bookings, but only
// once the pediatric dentist has already cleared them
// (pediatric_confirmed_at IS NOT NULL). That split is enforced entirely on
// the backend (StaffVerificationController::index()) — this page just
// renders whatever it's handed.
function HmoVerificationQueue() {
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actingId, setActingId] = useState(null);
  const [sendingId, setSendingId] = useState(null);
  const [rejectTarget, setRejectTarget] = useState(null);
  const [rejectReason, setRejectReason] = useState('');
  const [actionError, setActionError] = useState('');

  const [statusUpdateTarget, setStatusUpdateTarget] = useState(null);
  const [statusLabel, setStatusLabel] = useState(HMO_STATUS_LABELS[0]);
  const [statusNote, setStatusNote] = useState('');
  const [statusUpdateError, setStatusUpdateError] = useState('');

  // Same public, admin-managed active-providers list MyProfile.jsx's own
  // HMO section already fetches the same way — only active providers are
  // ever selectable here either, for the same reason.
  const [hmoProviders, setHmoProviders] = useState([]);
  const [editTarget, setEditTarget] = useState(null);
  const [editForm, setEditForm] = useState({ hmoProviderId: '', hmoNumber: '', hmoCompanyName: '' });
  const [savingEdit, setSavingEdit] = useState(false);
  const [editError, setEditError] = useState('');

  const mountedRef = useRef(true);

  const load = useCallback(async ({ silent = false } = {}) => {
    if (!silent) {
      setLoading(true);
      setError('');
    }
    try {
      const data = await getHmoQueue();
      if (mountedRef.current) setAppointments(data);
    } catch {
      if (!silent && mountedRef.current) setError('Could not load the HMO verification queue. Please refresh the page.');
    } finally {
      if (!silent && mountedRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    load();

    const interval = setInterval(() => load({ silent: true }), POLL_INTERVAL_MS);
    return () => {
      mountedRef.current = false;
      clearInterval(interval);
    };
  }, [load]);

  useEffect(() => {
    api.get('/api/hmo-providers')
      .then((response) => { if (mountedRef.current) setHmoProviders(response.data.data); })
      .catch(() => {});
  }, []);

  const handleApprove = async (appointment) => {
    setActingId(appointment.id);
    setActionError('');
    try {
      await verifyHmoAppointment(appointment.id, 'approve');
      setAppointments((prev) => prev.filter((a) => a.id !== appointment.id));
      showSuccessToast('Appointment approved.');
    } catch (err) {
      setActionError(err.response?.data?.message || 'Could not approve this appointment.');
    } finally {
      setActingId(null);
    }
  };

  const openStatusUpdate = (appointment) => {
    setStatusUpdateError('');
    setStatusLabel(HMO_STATUS_LABELS[0]);
    setStatusNote('');
    setStatusUpdateTarget(appointment);
  };

  const handleSendUpdate = async () => {
    if (!statusUpdateTarget) return;
    setSendingId(statusUpdateTarget.id);
    setStatusUpdateError('');
    try {
      await sendHmoStatusUpdate(statusUpdateTarget.id, statusLabel, statusNote.trim() || null);
      setStatusUpdateTarget(null);
      showSuccessToast('Status update sent to the patient.');
    } catch (err) {
      setStatusUpdateError(err.response?.data?.message || 'Could not send this status update.');
    } finally {
      setSendingId(null);
    }
  };

  const openReject = (appointment) => {
    setActionError('');
    setRejectReason('');
    setRejectTarget(appointment);
  };

  const handleReject = async () => {
    if (!rejectTarget) return;
    setActingId(rejectTarget.id);
    setActionError('');
    try {
      await verifyHmoAppointment(rejectTarget.id, 'reject', rejectReason);
      setAppointments((prev) => prev.filter((a) => a.id !== rejectTarget.id));
      setRejectTarget(null);
      showSuccessToast('Appointment rejected.');
    } catch (err) {
      setActionError(err.response?.data?.message || 'Could not reject this appointment.');
    } finally {
      setActingId(null);
    }
  };

  const openEditHmoInfo = (appointment) => {
    setEditError('');
    setEditForm({
      hmoProviderId: appointment.patient?.hmo_provider_id ? String(appointment.patient.hmo_provider_id) : '',
      hmoNumber: appointment.patient?.hmo_number || '',
      hmoCompanyName: appointment.patient?.hmo_company_name || '',
    });
    setEditTarget(appointment);
  };

  const handleSaveHmoInfo = async () => {
    if (!editTarget) return;
    setSavingEdit(true);
    setEditError('');
    try {
      const result = await updatePatientHmoInfo(editTarget.id, editForm);
      // Merge the corrected patient info straight back into this one card
      // (the response already carries it) instead of waiting for the next
      // silent poll — same instant-feedback expectation Approve/Reject
      // already give by removing the card immediately.
      setAppointments((prev) => prev.map((a) => (a.id === editTarget.id ? result.data : a)));
      setEditTarget(null);
      showSuccessToast('HMO details updated.');
    } catch (err) {
      setEditError(err.response?.data?.message || 'Could not update these HMO details.');
    } finally {
      setSavingEdit(false);
    }
  };

  return (
    <div>
      <PageHeader
        icon={ShieldIcon}
        title="HMO Verification Queue"
        subtitle="HMO bookings awaiting coverage verification before they're confirmed."
      />

      {actionError && <div className="profile-alert profile-alert--error">{actionError}</div>}

      {loading ? (
        <Skeleton variant="block" height="150px" count={3} />
      ) : error ? (
        <div className="dash-empty">
          <span className="dash-empty-title">{error}</span>
        </div>
      ) : appointments.length === 0 ? (
        <div className="dash-empty">
          <ShieldIcon />
          <span className="dash-empty-title">No HMO bookings awaiting verification</span>
          <p className="dash-empty-desc">New HMO appointments will show up here as soon as they're submitted.</p>
        </div>
      ) : (
        appointments.map((appointment) => (
          <QueueCard
            key={appointment.id}
            appointment={appointment}
            actingId={actingId}
            sendingId={sendingId}
            onApprove={handleApprove}
            onReject={openReject}
            onSendUpdate={openStatusUpdate}
            onEditHmoInfo={openEditHmoInfo}
          />
        ))
      )}

      <RejectionModal
        open={!!rejectTarget}
        onClose={() => setRejectTarget(null)}
        title="Reject HMO Booking"
        message="Optionally let the patient know why their HMO coverage couldn't be verified."
        reason={rejectReason}
        onReasonChange={setRejectReason}
        onConfirm={handleReject}
        confirming={actingId === rejectTarget?.id}
        confirmLabel="Reject Booking"
      />

      <Modal open={!!statusUpdateTarget} onClose={() => setStatusUpdateTarget(null)} title="Send Status Update">
        <p style={{ margin: '0 0 12px', fontSize: '0.85rem', color: 'var(--portal-muted)' }}>
          {statusUpdateTarget && (
            <>
              {statusUpdateTarget.patient?.first_name} {statusUpdateTarget.patient?.last_name} will get an email and a
              portal notification with the status you pick below — it also shows on their My Appointments page.
            </>
          )}
        </p>

        <label className="modal-field-label">Status</label>
        <select className="form-select" value={statusLabel} onChange={(e) => setStatusLabel(e.target.value)}>
          {HMO_STATUS_LABELS.map((label) => (
            <option key={label} value={label}>{label}</option>
          ))}
        </select>

        <label className="modal-field-label">Notes (optional)</label>
        <textarea
          className="form-textarea"
          placeholder="e.g. Waiting on confirmation from Medicard, usually takes 2-3 business days."
          value={statusNote}
          onChange={(e) => setStatusNote(e.target.value)}
        />

        {statusUpdateError && (
          <p style={{ margin: '10px 0 0', fontSize: '0.82rem', color: 'var(--portal-red-text)' }}>{statusUpdateError}</p>
        )}

        <div className="modal-actions">
          <button type="button" className="dash-btn dash-btn--outline" onClick={() => setStatusUpdateTarget(null)}>
            Cancel
          </button>
          <button
            type="button"
            className="dash-btn"
            disabled={sendingId === statusUpdateTarget?.id}
            onClick={handleSendUpdate}
          >
            {sendingId === statusUpdateTarget?.id ? 'Sending…' : 'Send Update'}
          </button>
        </div>
      </Modal>

      <Modal open={!!editTarget} onClose={() => setEditTarget(null)} title="Edit HMO Details">
        <p style={{ margin: '0 0 12px', fontSize: '0.85rem', color: 'var(--portal-muted)' }}>
          {editTarget && (
            <>
              Corrects {editTarget.patient?.first_name} {editTarget.patient?.last_name}&rsquo;s own HMO info on file —
              useful if it was mistyped at booking, before you call the provider to verify coverage.
            </>
          )}
        </p>

        <label className="modal-field-label">HMO Provider</label>
        <select
          className="form-select"
          value={editForm.hmoProviderId}
          onChange={(e) => setEditForm((p) => ({ ...p, hmoProviderId: e.target.value }))}
        >
          <option value="">Select a provider…</option>
          {hmoProviders.map((provider) => (
            <option key={provider.id} value={provider.id}>{provider.name}</option>
          ))}
        </select>

        <label className="modal-field-label">Card Number</label>
        <input
          className="form-input"
          value={editForm.hmoNumber}
          onChange={(e) => setEditForm((p) => ({ ...p, hmoNumber: e.target.value }))}
        />

        <label className="modal-field-label">Company Name (optional)</label>
        <input
          className="form-input"
          value={editForm.hmoCompanyName}
          onChange={(e) => setEditForm((p) => ({ ...p, hmoCompanyName: e.target.value }))}
        />

        {editError && (
          <p style={{ margin: '10px 0 0', fontSize: '0.82rem', color: 'var(--portal-red-text)' }}>{editError}</p>
        )}

        <div className="modal-actions">
          <button type="button" className="dash-btn dash-btn--outline" onClick={() => setEditTarget(null)}>
            Cancel
          </button>
          <button
            type="button"
            className="dash-btn"
            disabled={savingEdit || !editForm.hmoProviderId || !editForm.hmoNumber.trim()}
            onClick={handleSaveHmoInfo}
          >
            {savingEdit ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </Modal>
    </div>
  );
}

export default HmoVerificationQueue;
