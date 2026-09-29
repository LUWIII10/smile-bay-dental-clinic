import { useCallback, useEffect, useRef, useState } from 'react';
import api from '../../api';
import {
  getHmoQueue, verifyHmoAppointment, sendHmoStatusUpdate, updatePatientHmoInfo,
  getServices, getDentists, getStaffEditAvailableSlots, proposeHmoNewDate,
} from '../../api/appointments';
import StatusBadge from './components/StatusBadge';
import RejectionModal from './components/RejectionModal';
import Modal from './components/Modal';
import Skeleton from './components/Skeleton';
import PageHeader from './components/PageHeader';
import AvailableSlotPicker from './components/AvailableSlotPicker';
import { ShieldIcon, CheckCircleIcon, MailIcon, CalendarIcon, AlertIcon } from './icons';
import { formatDateLong, formatTime12h, toLocalDate } from './dateTimeUtils';
import { showSuccessToast } from '../../utils/toast';
import './dashboards.css';
import './Appointments.css';
import './BookAppointment.css';

function todayDateKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

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

// HMO verification routinely takes days — a booking whose requested date
// has already passed by the time staff get to it isn't an edge case, it's
// routine. Confirming onto a date that's already gone would just quietly
// produce a doomed-to-no-show appointment, so the plain "Approve" action
// becomes "Approve & Reschedule" (opens the propose-new-date modal instead
// of confirming outright) whenever this is true — matches the exact same
// server-side guard StaffVerificationController::verify() enforces.
function isOverdue(appointment) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return toLocalDate(appointment.appointment_date) < today;
}

function QueueCard({ appointment, actingId, sendingId, onApprove, onReject, onSendUpdate, onEditHmoInfo, onProposeNewDate }) {
  const isPediatricApproved = appointment.service?.name?.includes('Pediatric') && appointment.pediatric_confirmed_at;
  const hmoProviderName = appointment.patient?.hmo_provider?.name || appointment.patient?.hmo_company_name || 'HMO';
  const isActing = actingId === appointment.id;
  const isSending = sendingId === appointment.id;
  const patientEmail = appointment.patient?.user?.email || '';
  const hasNoEmailOnFile = patientEmail.endsWith(WALKIN_EMAIL_SUFFIX);
  const overdue = isOverdue(appointment);

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

      {overdue && (
        <div className="queue-card-overdue-note">
          <AlertIcon /> Requested date already passed — reschedule needed before approving
        </div>
      )}

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
          <span className={`queue-card-field-value${overdue ? ' queue-card-field-value--overdue' : ''}`}>
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
        {overdue ? (
          <button type="button" className="dash-btn" disabled={isActing} onClick={() => onProposeNewDate(appointment)}>
            <CalendarIcon /> Approve &amp; Reschedule
          </button>
        ) : (
          <button type="button" className="dash-btn" disabled={isActing} onClick={() => onApprove(appointment)}>
            <CheckCircleIcon /> {isActing ? 'Saving…' : 'Approve'}
          </button>
        )}
        <button type="button" className="dash-btn dash-btn--outline" disabled={isActing} onClick={() => onReject(appointment)}>
          Reject
        </button>
        <button type="button" className="dash-btn dash-btn--outline" disabled={isActing} onClick={() => onEditHmoInfo(appointment)}>
          Edit Info
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
  const [editForm, setEditForm] = useState({
    hmoProviderId: '', hmoNumber: '', hmoCompanyName: '',
    serviceId: '', dentistId: '', appointmentDate: '', appointmentTime: '',
    hmoCoverageNotes: '',
  });
  const [savingEdit, setSavingEdit] = useState(false);
  const [editError, setEditError] = useState('');

  // "Approve & Reschedule" — verifies coverage AND proposes a new date in
  // one action, for a booking whose requested date already passed
  // (StaffVerificationController::proposeNewDate()). Separate state/modal
  // from Edit Info above since this is a decision (verify + move the date),
  // not a correction.
  const [proposeTarget, setProposeTarget] = useState(null);
  const [proposeDate, setProposeDate] = useState('');
  const [proposeTime, setProposeTime] = useState('');
  const [proposeReason, setProposeReason] = useState('');
  const [proposeCoverageNotes, setProposeCoverageNotes] = useState('');
  const [proposing, setProposing] = useState(false);
  const [proposeError, setProposeError] = useState('');

  // Full staff-facing catalog (not the patient-bookable-only subset the
  // booking wizard uses) — staff can reassign to anything the clinic
  // offers, minus pediatric (blocked below, same as the backend guard —
  // this queue is HMO-only and the pediatric dentist accepts Cash only).
  const [services, setServices] = useState([]);
  const [editDentists, setEditDentists] = useState([]);
  const [loadingEditDentists, setLoadingEditDentists] = useState(false);
  const [editSlots, setEditSlots] = useState([]);
  const [loadingEditSlots, setLoadingEditSlots] = useState(false);

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

  useEffect(() => {
    getServices()
      .then((list) => { if (mountedRef.current) setServices(list.filter((s) => !s.is_pediatric)); })
      .catch(() => {});
  }, []);

  // Dentist list follows the picked service, same rule the booking wizard
  // enforces (only dentists credentialed for that service). Keeps the
  // already-assigned dentist selected if they're still valid for the
  // (possibly unchanged) service — only clears it when the service
  // actually changed to one they're not credentialed for, so opening the
  // modal doesn't blank out a perfectly correct existing assignment.
  useEffect(() => {
    if (!editTarget || !editForm.serviceId) {
      setEditDentists([]);
      return undefined;
    }
    let cancelled = false;
    (async () => {
      setLoadingEditDentists(true);
      try {
        const list = await getDentists(editForm.serviceId);
        if (cancelled) return;
        setEditDentists(list);
        setEditForm((prev) => {
          const stillValid = list.some((d) => String(d.id) === String(prev.dentistId));
          if (stillValid) return prev;
          return { ...prev, dentistId: list.length === 1 ? String(list[0].id) : '', appointmentTime: '' };
        });
      } catch {
        if (!cancelled) setEditDentists([]);
      } finally {
        if (!cancelled) setLoadingEditDentists(false);
      }
    })();
    return () => { cancelled = true; };
  }, [editTarget, editForm.serviceId]);

  // Real slot-grid math (AppointmentSlotService), same as the patient
  // booking wizard and RescheduleModal — this appointment's own current
  // slot is excluded from "occupied" server-side, so it shows up here as
  // pickable instead of the grid looking like nothing is free.
  useEffect(() => {
    if (!editTarget || !editForm.serviceId || !editForm.dentistId || !editForm.appointmentDate) {
      setEditSlots([]);
      return undefined;
    }
    let cancelled = false;
    (async () => {
      setLoadingEditSlots(true);
      try {
        const result = await getStaffEditAvailableSlots(editTarget.id, editForm.dentistId, editForm.serviceId, editForm.appointmentDate);
        if (!cancelled) setEditSlots(result.slots || []);
      } catch {
        if (!cancelled) setEditSlots([]);
      } finally {
        if (!cancelled) setLoadingEditSlots(false);
      }
    })();
    return () => { cancelled = true; };
  }, [editTarget, editForm.serviceId, editForm.dentistId, editForm.appointmentDate]);

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
    setEditDentists([]);
    setEditSlots([]);
    setEditForm({
      hmoProviderId: appointment.patient?.hmo_provider_id ? String(appointment.patient.hmo_provider_id) : '',
      hmoNumber: appointment.patient?.hmo_number || '',
      hmoCompanyName: appointment.patient?.hmo_company_name || '',
      serviceId: appointment.service_id ? String(appointment.service_id) : '',
      dentistId: appointment.dentist_id ? String(appointment.dentist_id) : '',
      appointmentDate: appointment.appointment_date.slice(0, 10),
      appointmentTime: appointment.appointment_time.slice(0, 5),
      hmoCoverageNotes: appointment.patient?.hmo_coverage_notes || '',
    });
    setEditTarget(appointment);
  };

  const handleEditServiceChange = (serviceId) => {
    setEditForm((prev) => ({ ...prev, serviceId, dentistId: '', appointmentTime: '' }));
  };

  const handleEditDentistChange = (dentistId) => {
    setEditForm((prev) => ({ ...prev, dentistId, appointmentTime: '' }));
  };

  const handleEditDateChange = (appointmentDate) => {
    setEditForm((prev) => ({ ...prev, appointmentDate, appointmentTime: '' }));
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
      showSuccessToast('Booking details updated.');
    } catch (err) {
      setEditError(err.response?.data?.message || 'Could not update this booking.');
    } finally {
      setSavingEdit(false);
    }
  };

  const openProposeNewDate = (appointment) => {
    setProposeError('');
    setProposeDate('');
    setProposeTime('');
    setProposeReason('');
    setProposeCoverageNotes(appointment.patient?.hmo_coverage_notes || '');
    setProposeTarget(appointment);
  };

  const handleProposeNewDate = async () => {
    if (!proposeTarget) return;
    if (!proposeDate || !proposeTime) {
      setProposeError('Please pick a date and an available time.');
      return;
    }
    setProposing(true);
    setProposeError('');
    try {
      const result = await proposeHmoNewDate(proposeTarget.id, {
        appointmentDate: proposeDate,
        appointmentTime: proposeTime,
        reason: proposeReason.trim() || null,
        hmoCoverageNotes: proposeCoverageNotes.trim() || null,
      });
      setAppointments((prev) => prev.map((a) => (a.id === proposeTarget.id ? result.data : a)));
      setProposeTarget(null);
      showSuccessToast('Coverage verified — new date sent to the patient.');
    } catch (err) {
      setProposeError(err.response?.data?.message || 'Could not send this date.');
    } finally {
      setProposing(false);
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
            onProposeNewDate={openProposeNewDate}
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

      <Modal open={!!editTarget} onClose={() => setEditTarget(null)} title="Edit Booking Info">
        <p style={{ margin: '0 0 12px', fontSize: '0.85rem', color: 'var(--portal-muted)' }}>
          {editTarget && (
            <>
              Corrects anything on {editTarget.patient?.first_name} {editTarget.patient?.last_name}&rsquo;s booking —
              service, dentist, date/time, or HMO info — useful if something was mistyped or miscommunicated at
              booking, before you call the provider to verify coverage.
            </>
          )}
        </p>

        <label className="modal-field-label">Service</label>
        <select
          className="form-select"
          value={editForm.serviceId}
          onChange={(e) => handleEditServiceChange(e.target.value)}
        >
          <option value="">Select a service…</option>
          {services.map((service) => (
            <option key={service.id} value={service.id}>{service.name}</option>
          ))}
        </select>

        <label className="modal-field-label">Assigned Dentist</label>
        <select
          className="form-select"
          value={editForm.dentistId}
          disabled={!editForm.serviceId || loadingEditDentists}
          onChange={(e) => handleEditDentistChange(e.target.value)}
        >
          <option value="">
            {loadingEditDentists ? 'Loading dentists…' : 'Select a dentist…'}
          </option>
          {editDentists.map((dentist) => (
            <option key={dentist.id} value={dentist.id}>{dentist.name}</option>
          ))}
        </select>

        <label className="modal-field-label">Date</label>
        <input
          type="date"
          className="form-input"
          value={editForm.appointmentDate}
          min={todayDateKey()}
          onChange={(e) => handleEditDateChange(e.target.value)}
        />

        <label className="modal-field-label" style={{ marginTop: 14, display: 'block' }}>Time</label>
        {!editForm.dentistId ? (
          <p style={{ fontSize: '0.85rem', color: 'var(--portal-muted)' }}>Pick a service and dentist first.</p>
        ) : loadingEditSlots ? (
          <p style={{ fontSize: '0.85rem', color: 'var(--portal-muted)' }}>Loading open slots…</p>
        ) : editSlots.length === 0 ? (
          <p style={{ fontSize: '0.85rem', color: 'var(--portal-muted)' }}>No open slots for this date.</p>
        ) : (
          <div className="slots-grid">
            {editSlots.map((t) => (
              <button
                key={t}
                type="button"
                className={`slot-card${t === editForm.appointmentTime ? ' slot-card--selected' : ''}`}
                onClick={() => setEditForm((p) => ({ ...p, appointmentTime: t }))}
              >
                {formatTime12h(t)}
              </button>
            ))}
          </div>
        )}

        <label className="modal-field-label" style={{ marginTop: 14, display: 'block' }}>HMO Provider</label>
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

        <label className="modal-field-label">
          Coverage Details <span style={{ fontWeight: 400, color: 'var(--portal-muted)' }}>(optional — saved to the patient's account)</span>
        </label>
        <textarea
          className="form-textarea"
          placeholder="e.g. 2 tooth extractions/year, 1 cleaning every 6 months, up to ₱5,000 crown allowance — as told by the provider."
          value={editForm.hmoCoverageNotes}
          onChange={(e) => setEditForm((p) => ({ ...p, hmoCoverageNotes: e.target.value }))}
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
            disabled={
              savingEdit || !editForm.hmoProviderId || !editForm.hmoNumber.trim()
              || !editForm.serviceId || !editForm.dentistId || !editForm.appointmentDate || !editForm.appointmentTime
            }
            onClick={handleSaveHmoInfo}
          >
            {savingEdit ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </Modal>

      {/* Approving this doubles as verifying HMO coverage — the appointment
          stays pending_verification, now awaiting the PATIENT's own date
          confirmation (see StaffVerificationController::proposeNewDate())
          instead of confirming outright, since the requested date already
          passed. */}
      <Modal open={!!proposeTarget} onClose={() => setProposeTarget(null)} title="Approve & Reschedule">
        {proposeTarget && (
          <>
            <div className="profile-alert profile-alert--success" style={{ marginBottom: 18, display: 'flex', gap: 10, alignItems: 'flex-start' }}>
              <CheckCircleIcon />
              <span>
                Approving marks {proposeTarget.patient?.first_name}&rsquo;s HMO coverage as verified. Their original
                date already passed, so pick a new one below — it&rsquo;ll be sent to the patient to confirm, no
                further HMO verification needed.
              </span>
            </div>

            <AvailableSlotPicker
              dentistId={proposeTarget.dentist_id}
              serviceId={proposeTarget.service_id}
              date={proposeDate}
              onDateChange={setProposeDate}
              time={proposeTime}
              onTimeChange={setProposeTime}
              compact
            />

            <label className="modal-field-label" style={{ marginTop: 14, display: 'block' }}>
              Note to Patient <span style={{ fontWeight: 400, color: 'var(--portal-muted)' }}>(optional)</span>
            </label>
            <textarea
              className="form-textarea"
              placeholder="e.g. Sorry for the delay verifying your coverage — here's the next open slot."
              value={proposeReason}
              onChange={(e) => setProposeReason(e.target.value)}
            />

            <div style={{ height: 1, background: 'var(--portal-border-light)', margin: '18px 0' }} />

            <label className="modal-field-label" style={{ display: 'block' }}>
              Coverage Details <span style={{ fontWeight: 400, color: 'var(--portal-muted)' }}>(optional — saved to the patient's account)</span>
            </label>
            <textarea
              className="form-textarea"
              placeholder="e.g. 2 tooth extractions/year, 1 cleaning every 6 months, up to ₱5,000 crown allowance — as told by the provider."
              value={proposeCoverageNotes}
              onChange={(e) => setProposeCoverageNotes(e.target.value)}
            />

            {proposeError && (
              <p style={{ margin: '10px 0 0', fontSize: '0.82rem', color: 'var(--portal-red-text)' }}>{proposeError}</p>
            )}

            <div className="modal-actions">
              <button type="button" className="dash-btn dash-btn--outline" onClick={() => setProposeTarget(null)}>
                Cancel
              </button>
              <button type="button" className="dash-btn" disabled={proposing || !proposeTime} onClick={handleProposeNewDate}>
                {proposing ? 'Sending…' : 'Send New Date to Patient'}
              </button>
            </div>
          </>
        )}
      </Modal>
    </div>
  );
}

export default HmoVerificationQueue;
