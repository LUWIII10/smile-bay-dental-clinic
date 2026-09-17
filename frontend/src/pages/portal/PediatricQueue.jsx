import { useCallback, useEffect, useRef, useState } from 'react';
import { getPediatricQueue, verifyPediatricAppointment } from '../../api/appointments';
import StatusBadge from './components/StatusBadge';
import RejectionModal from './components/RejectionModal';
import Skeleton from './components/Skeleton';
import { BabyIcon, CheckCircleIcon } from './icons';
import { formatDateLong, formatTime12h } from './dateTimeUtils';
import { showSuccessToast } from '../../utils/toast';
import './dashboards.css';
import './Appointments.css';

const POLL_INTERVAL_MS = 9000;

function formatSubmitted(isoTimestamp) {
  return new Date(isoTimestamp).toLocaleString('en-US', {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  });
}

function QueueCard({ appointment, actingId, onApprove, onReject }) {
  const isCash = appointment.patient_type_snapshot === 'cash';
  const isActing = actingId === appointment.id;

  return (
    <div className="queue-card">
      <div className="queue-card-header">
        <span className="queue-card-patient">
          {appointment.patient?.first_name} {appointment.patient?.last_name}
        </span>
        <div className="queue-card-badges">
          <StatusBadge status={isCash ? 'Cash' : 'HMO'} tone={isCash ? 'blue' : 'gray'} />
          <span className="queue-card-submitted">Submitted {formatSubmitted(appointment.created_at)}</span>
        </div>
      </div>

      <div className="queue-card-grid">
        <div>
          <span className="queue-card-field-label">Service</span>
          <span className="queue-card-field-value">{appointment.service?.name}</span>
        </div>
        <div>
          <span className="queue-card-field-label">Requested</span>
          <span className="queue-card-field-value">
            {formatDateLong(appointment.appointment_date)} &middot; {formatTime12h(appointment.appointment_time)}
          </span>
        </div>
      </div>

      <div className="queue-card-actions">
        <button type="button" className="dash-btn" disabled={isActing} onClick={() => onApprove(appointment)}>
          <CheckCircleIcon /> {isActing ? 'Saving…' : 'Approve'}
        </button>
        <button type="button" className="dash-btn dash-btn--outline" disabled={isActing} onClick={() => onReject(appointment)}>
          Reject
        </button>
      </div>
    </div>
  );
}

// The pediatric dentist's own review queue — appointments assigned to them
// that are pending_verification and haven't been pediatric-confirmed yet.
// role:dentist is shared by every dentist account, but the backend scopes
// strictly to dentist_id = auth user, so a non-pediatric dentist just sees
// an empty queue here (nothing pediatric is ever assigned to them).
function PediatricQueue() {
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actingId, setActingId] = useState(null);
  const [rejectTarget, setRejectTarget] = useState(null);
  const [rejectReason, setRejectReason] = useState('');
  const [actionError, setActionError] = useState('');

  // Guards a silent background poll from clobbering state after the
  // component has already unmounted (navigated away mid-request).
  const mountedRef = useRef(true);

  const load = useCallback(async ({ silent = false } = {}) => {
    if (!silent) {
      setLoading(true);
      setError('');
    }
    try {
      const data = await getPediatricQueue();
      if (mountedRef.current) setAppointments(data);
    } catch {
      if (!silent && mountedRef.current) setError('Could not load the pediatric queue. Please refresh the page.');
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

  const handleApprove = async (appointment) => {
    setActingId(appointment.id);
    setActionError('');
    try {
      await verifyPediatricAppointment(appointment.id, 'approve');
      setAppointments((prev) => prev.filter((a) => a.id !== appointment.id));
      showSuccessToast('Appointment approved.');
    } catch (err) {
      setActionError(err.response?.data?.message || 'Could not approve this appointment.');
    } finally {
      setActingId(null);
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
      await verifyPediatricAppointment(rejectTarget.id, 'reject', rejectReason);
      setAppointments((prev) => prev.filter((a) => a.id !== rejectTarget.id));
      setRejectTarget(null);
      showSuccessToast('Appointment rejected.');
    } catch (err) {
      setActionError(err.response?.data?.message || 'Could not reject this appointment.');
    } finally {
      setActingId(null);
    }
  };

  return (
    <div>
      <div className="section-card-header appt-page-header">
        <div>
          <h1 className="appt-page-title">Pediatric Slot Review Queue</h1>
          <p className="appt-page-subtitle">Pediatric bookings assigned to you awaiting your review before HMO verification.</p>
        </div>
      </div>

      {actionError && <div className="profile-alert profile-alert--error">{actionError}</div>}

      {loading ? (
        <Skeleton variant="block" height="150px" count={3} />
      ) : error ? (
        <div className="dash-empty">
          <span className="dash-empty-title">{error}</span>
        </div>
      ) : appointments.length === 0 ? (
        <div className="dash-empty">
          <BabyIcon />
          <span className="dash-empty-title">No pediatric bookings awaiting your review</span>
          <p className="dash-empty-desc">New pediatric appointments assigned to you will show up here as soon as they're submitted.</p>
        </div>
      ) : (
        appointments.map((appointment) => (
          <QueueCard
            key={appointment.id}
            appointment={appointment}
            actingId={actingId}
            onApprove={handleApprove}
            onReject={openReject}
          />
        ))
      )}

      <RejectionModal
        open={!!rejectTarget}
        onClose={() => setRejectTarget(null)}
        title="Reject Pediatric Booking"
        message="Optionally let the patient know why this slot couldn't be confirmed."
        reason={rejectReason}
        onReasonChange={setRejectReason}
        onConfirm={handleReject}
        confirming={actingId === rejectTarget?.id}
        confirmLabel="Reject Booking"
      />
    </div>
  );
}

export default PediatricQueue;
