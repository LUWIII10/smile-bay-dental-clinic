import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getPediatricQueue, verifyPediatricAppointment, proposePediatricNewDate } from '../../api/appointments';
import StatusBadge from './components/StatusBadge';
import RejectionModal from './components/RejectionModal';
import Skeleton from './components/Skeleton';
import PageHeader from './components/PageHeader';
import AvailableSlotPicker from './components/AvailableSlotPicker';
import { BabyIcon, CheckCircleIcon, AlertIcon, SwapIcon } from './icons';
import { formatDateLong, formatTime12h, toLocalDate } from './dateTimeUtils';
import { showSuccessToast } from '../../utils/toast';
import './dashboards.css';
import './Appointments.css';
import './BookAppointment.css';

const POLL_INTERVAL_MS = 9000;

function formatSubmitted(isoTimestamp) {
  return new Date(isoTimestamp).toLocaleString('en-US', {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  });
}

// Real open-slot picker for a pediatric reschedule — same getAvailableSlots()
// call and .slots-grid/.slot-card markup the patient booking wizard and the
// general-dentist RescheduleModal already use, so the dentist sees her own
// actual availability instead of guessing a date/time blind and finding out
// only after submitting that it's already taken. Shared by QueueCard (an
// optional, toggled reschedule) and OverdueQueueCard (always shown, no
// Cancel — there's nothing to go back to once a slot's date has passed).
// onSend still gets its own server-side isSlotAvailable() re-check in
// proposeNewDate() — this is a convenience, not a replacement for that guard.
function ReschedulePicker({ appointment, actingId, onSend, onCancel }) {
  const isActing = actingId === appointment.id;
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [error, setError] = useState('');

  const handleSend = async () => {
    if (!date || !time) {
      setError('Please pick a date and an available time.');
      return;
    }
    setError('');
    const result = await onSend(appointment, date, time);
    if (result?.error) setError(result.error);
  };

  return (
    <>
      <AvailableSlotPicker
        dentistId={appointment.dentist_id}
        serviceId={appointment.service_id}
        date={date}
        onDateChange={setDate}
        time={time}
        onTimeChange={setTime}
      />
      <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
        <button type="button" className="dash-btn" disabled={!time || isActing} onClick={handleSend}>
          {isActing ? 'Sending…' : 'Send New Date'}
        </button>
        {onCancel && (
          <button type="button" className="dash-btn dash-btn--outline" disabled={isActing} onClick={onCancel}>
            Cancel
          </button>
        )}
      </div>
      {error && <p className="queue-card-propose-error">{error}</p>}
    </>
  );
}

// onPropose reuses the exact same PediatricVerificationController::
// proposeNewDate() call the overdue flow already uses below — nothing on
// the backend requires the original date to have passed first, so a
// dentist who checks her own real-world availability right away (instead
// of waiting for the date to lapse) can reschedule a fresh request the
// same way, still landing on the patient's side as something they accept
// or counter, not an auto-applied change.
function QueueCard({ appointment, actingId, onApprove, onReject, onPropose }) {
  const isCash = appointment.patient_type_snapshot === 'cash';
  const isActing = actingId === appointment.id;
  const [rescheduling, setRescheduling] = useState(false);

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

      {!rescheduling ? (
        <div className="queue-card-actions">
          <button type="button" className="dash-btn" disabled={isActing} onClick={() => onApprove(appointment)}>
            <CheckCircleIcon /> {isActing ? 'Saving…' : 'Approve'}
          </button>
          <button
            type="button"
            className="dash-btn dash-btn--outline"
            disabled={isActing}
            onClick={() => setRescheduling(true)}
          >
            <SwapIcon /> Reschedule
          </button>
          <button type="button" className="dash-btn dash-btn--danger" disabled={isActing} onClick={() => onReject(appointment)}>
            Reject
          </button>
        </div>
      ) : (
        <ReschedulePicker
          appointment={appointment}
          actingId={actingId}
          onSend={onPropose}
          onCancel={() => setRescheduling(false)}
        />
      )}
    </div>
  );
}

// A request whose original date has already passed with no approve/reject
// decision — same card shell as QueueCard, but the actions are replaced
// with a "propose a new date" form instead of Approve/Reject (there's
// nothing left to approve: that slot is gone). Submitting sets
// dentist_proposed_new_date_at server-side, which is what puts this back
// in front of the PATIENT for their own Accept/Request Different Date call.
function OverdueQueueCard({ appointment, actingId, onPropose }) {
  return (
    <div className="queue-card queue-card--overdue">
      <div className="queue-card-header">
        <span className="queue-card-patient">
          {appointment.patient?.first_name} {appointment.patient?.last_name}
        </span>
        <StatusBadge status="Overdue — no response" tone="amber" />
      </div>

      <div className="queue-card-grid">
        <div>
          <span className="queue-card-field-label">Service</span>
          <span className="queue-card-field-value">{appointment.service?.name}</span>
        </div>
        <div>
          <span className="queue-card-field-label">Originally requested</span>
          <span className="queue-card-field-value">
            {formatDateLong(appointment.appointment_date)} &middot; {formatTime12h(appointment.appointment_time)}
          </span>
        </div>
      </div>

      <div className="queue-card-overdue-note">
        <AlertIcon /> That date has passed without a decision. Propose a new date below — the patient will be asked to confirm it.
      </div>

      <ReschedulePicker appointment={appointment} actingId={actingId} onSend={onPropose} />
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
  const [activeTab, setActiveTab] = useState('awaiting');

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

  // Split client-side from one list, same pattern DentistSchedule/
  // PatientAppointments already use for their own today/overdue tabs —
  // no separate endpoint needed, appointment_date is already in the payload.
  const { awaiting, needsNewDate } = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const awaiting = [];
    const needsNewDate = [];
    for (const a of appointments) {
      (toLocalDate(a.appointment_date) < today ? needsNewDate : awaiting).push(a);
    }
    return { awaiting, needsNewDate };
  }, [appointments]);

  const handlePropose = async (appointment, date, time) => {
    setActingId(appointment.id);
    try {
      await proposePediatricNewDate(appointment.id, date, time);
      setAppointments((prev) => prev.filter((a) => a.id !== appointment.id));
      showSuccessToast('New date sent to the patient for confirmation.');
      return {};
    } catch (err) {
      return { error: err.response?.data?.message || 'Could not send this new date.' };
    } finally {
      setActingId(null);
    }
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
      <PageHeader
        icon={BabyIcon}
        title="Pediatric Slot Review Queue"
        subtitle="Pediatric bookings assigned to you awaiting your review before HMO verification."
      />

      {actionError && <div className="profile-alert profile-alert--error">{actionError}</div>}

      <div className="portal-tabs">
        <button
          type="button"
          className={`portal-tab${activeTab === 'awaiting' ? ' portal-tab--active' : ''}`}
          onClick={() => setActiveTab('awaiting')}
        >
          Awaiting Confirmation
          <span className="portal-tab-count">{loading ? '…' : awaiting.length}</span>
        </button>
        <button
          type="button"
          className={`portal-tab${activeTab === 'needsNewDate' ? ' portal-tab--active' : ''}`}
          onClick={() => setActiveTab('needsNewDate')}
        >
          Needs New Date
          <span className="portal-tab-count">{loading ? '…' : needsNewDate.length}</span>
        </button>
      </div>

      {loading ? (
        <Skeleton variant="block" height="150px" count={3} />
      ) : error ? (
        <div className="dash-empty">
          <span className="dash-empty-title">{error}</span>
        </div>
      ) : activeTab === 'awaiting' ? (
        awaiting.length === 0 ? (
          <div className="dash-empty">
            <BabyIcon />
            <span className="dash-empty-title">No pediatric bookings awaiting your review</span>
            <p className="dash-empty-desc">New pediatric appointments assigned to you will show up here as soon as they're submitted.</p>
          </div>
        ) : (
          awaiting.map((appointment) => (
            <QueueCard
              key={appointment.id}
              appointment={appointment}
              actingId={actingId}
              onApprove={handleApprove}
              onReject={openReject}
              onPropose={handlePropose}
            />
          ))
        )
      ) : needsNewDate.length === 0 ? (
        <div className="dash-empty">
          <BabyIcon />
          <span className="dash-empty-title">Nothing overdue</span>
          <p className="dash-empty-desc">Every pending request still has time left before its date — nothing needs a new one yet.</p>
        </div>
      ) : (
        needsNewDate.map((appointment) => (
          <OverdueQueueCard
            key={appointment.id}
            appointment={appointment}
            actingId={actingId}
            onPropose={handlePropose}
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
