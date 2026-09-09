import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { getPatientAppointments, cancelAppointment } from '../../api/appointments';
import StatusBadge from './components/StatusBadge';
import Modal from './components/Modal';
import { UserIcon, ClockIcon } from './icons';
import { formatDateLong, formatTime12h, toLocalDate } from './dateTimeUtils';
import './dashboards.css';
import './Appointments.css';

// Same 8-10s background-refresh pattern as DentistSchedule/HmoVerificationQueue/
// PediatricQueue — this page didn't have it yet (it was left on the blank-slate
// PlainBadge/unstyled treatment), so status changes like an HMO approval
// wouldn't show up here without a manual refresh. Added as part of this pass
// since the target design explicitly requires it to keep working.
const POLL_INTERVAL_MS = 9000;

const MONTH_ABBR = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

// Date-chip tint per status — spec calls out blue (confirmed/upcoming) and
// amber (pending) explicitly; gray/red extend the same established
// StatusBadge color mapping to the Past/Cancelled tabs' chips so they don't
// clash with a red or gray badge sitting right next to a blue/amber chip.
const CHIP_TONE = {
  confirmed: 'blue',
  pending_verification: 'amber',
  completed: 'gray',
  no_show: 'gray',
  cancelled: 'red',
  rejected: 'red',
};

const TABS = [
  {
    key: 'upcoming',
    label: 'Upcoming',
    statuses: ['confirmed', 'pending_verification'],
    empty: 'No upcoming visits scheduled.',
    emptyCta: true,
  },
  {
    key: 'past',
    label: 'Past / Completed',
    statuses: ['completed', 'no_show'],
    empty: 'No past visits yet.',
  },
  {
    key: 'cancelled',
    label: 'Cancelled / Rejected',
    statuses: ['cancelled', 'rejected'],
    empty: 'Nothing cancelled or rejected — good news.',
  },
];

const CANCELLABLE_STATUSES = ['confirmed', 'pending_verification'];
const REASON_VISIBLE_STATUSES = ['cancelled', 'rejected'];

function AppointmentCard({ appointment, onCancelClick }) {
  const [reasonOpen, setReasonOpen] = useState(false);
  const dentistName = appointment.dentist?.name || 'Unassigned';
  const isCancellable = CANCELLABLE_STATUSES.includes(appointment.status);
  const hasReason = REASON_VISIBLE_STATUSES.includes(appointment.status) && !!appointment.cancellation_reason;
  const date = toLocalDate(appointment.appointment_date);
  const chipTone = CHIP_TONE[appointment.status] || 'blue';

  return (
    <div className="appt-card">
      <div className={`appt-card-date-chip appt-card-date-chip--${chipTone}`}>
        <span className="appt-card-date-day">{date.getDate()}</span>
        <span className="appt-card-date-month">{MONTH_ABBR[date.getMonth()]}</span>
      </div>

      <div className="appt-card-body">
        <div className="appt-card-top">
          <span className="appt-card-title">{appointment.service?.name}</span>
          <StatusBadge status={appointment.status} />
        </div>

        <div className="appt-card-meta">
          <span><UserIcon /> {dentistName}</span>
          <span><ClockIcon /> {formatDateLong(appointment.appointment_date)} at {formatTime12h(appointment.appointment_time)}</span>
        </div>

        {appointment.status === 'pending_verification' && appointment.hmo_status_label && (
          <div className="appt-hmo-status">
            <span className="appt-hmo-status-label">{appointment.hmo_status_label}</span>
            {appointment.hmo_status_note && <span className="appt-hmo-status-note">{appointment.hmo_status_note}</span>}
            {appointment.hmo_status_updated_at && (
              <span className="appt-hmo-status-time">
                Updated {new Date(appointment.hmo_status_updated_at).toLocaleString('en-US', {
                  month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
                })}
              </span>
            )}
          </div>
        )}

        {hasReason && (
          <>
            <button type="button" className="appt-reason-toggle" onClick={() => setReasonOpen((v) => !v)}>
              {reasonOpen ? 'Hide reason' : 'View reason'}
            </button>
            {reasonOpen && <p className="appt-reason-note">{appointment.cancellation_reason}</p>}
          </>
        )}

        {isCancellable && (
          <div className="appt-card-actions">
            <button type="button" className="dash-btn dash-btn--outline" onClick={() => onCancelClick(appointment)}>
              Cancel Appointment
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function PatientAppointments() {
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('upcoming');

  const [cancelTarget, setCancelTarget] = useState(null);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState('');

  // silent=true (the periodic poll) never touches loading/error state, so a
  // background refetch can't flash the skeleton or bump a stale error away —
  // matches the same pattern already used by DentistSchedule/HmoVerificationQueue/
  // PediatricQueue, so an HMO/pediatric approval or rejection shows up here
  // without the patient needing to manually refresh.
  const load = useCallback(async ({ silent = false } = {}) => {
    if (!silent) {
      setLoading(true);
      setError('');
    }
    try {
      const data = await getPatientAppointments();
      setAppointments(data);
    } catch {
      if (!silent) setError('Could not load your appointments. Please refresh the page.');
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const interval = setInterval(() => load({ silent: true }), POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [load]);

  const grouped = useMemo(() => {
    const result = {};
    for (const tab of TABS) {
      const rows = appointments.filter((a) => tab.statuses.includes(a.status));
      // Upcoming: soonest first. Past/Cancelled: most recent first.
      rows.sort((a, b) => {
        const diff = toLocalDate(a.appointment_date) - toLocalDate(b.appointment_date) || a.appointment_time.localeCompare(b.appointment_time);
        return tab.key === 'upcoming' ? diff : -diff;
      });
      result[tab.key] = rows;
    }
    return result;
  }, [appointments]);

  const openCancel = (appointment) => {
    setCancelError('');
    setCancelReason('');
    setCancelTarget(appointment);
  };

  const handleCancel = async () => {
    if (!cancelTarget) return;
    setCancelling(true);
    setCancelError('');
    try {
      await cancelAppointment(cancelTarget.id, cancelReason);
      setAppointments((prev) =>
        prev.map((a) => (a.id === cancelTarget.id ? { ...a, status: 'cancelled', cancellation_reason: cancelReason || null } : a))
      );
      setCancelTarget(null);
    } catch (err) {
      setCancelError(err.response?.data?.message || 'Could not cancel this appointment.');
    } finally {
      setCancelling(false);
    }
  };

  const currentTab = TABS.find((t) => t.key === activeTab);
  const currentRows = grouped[activeTab] || [];

  return (
    <div>
      <div className="section-card-header" style={{ marginBottom: 24 }}>
        <div>
          <h1 className="appt-page-title">My Appointments</h1>
          <p className="appt-page-subtitle">View and manage your upcoming, past, and cancelled visits.</p>
        </div>
      </div>

      <div className="section-card">
        <div className="portal-tabs">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              className={`portal-tab${tab.key === activeTab ? ' portal-tab--active' : ''}`}
              onClick={() => setActiveTab(tab.key)}
            >
              {tab.label}
              <span className="portal-tab-count">{loading ? '…' : (grouped[tab.key]?.length ?? 0)}</span>
            </button>
          ))}
        </div>

        {loading ? (
          <p className="booking-empty-note">Loading…</p>
        ) : error ? (
          <div className="dash-empty">
            <span className="dash-empty-title">{error}</span>
          </div>
        ) : currentRows.length === 0 ? (
          <div className="dash-empty">
            <span className="dash-empty-title">{currentTab.empty}</span>
            {currentTab.emptyCta && (
              <Link to="/patient/book-appointment" className="dash-btn">Book Your Next Visit</Link>
            )}
          </div>
        ) : (
          currentRows.map((appointment) => (
            <AppointmentCard key={appointment.id} appointment={appointment} onCancelClick={openCancel} />
          ))
        )}
      </div>

      <Modal open={!!cancelTarget} onClose={() => setCancelTarget(null)} title="Cancel Appointment">
        <p style={{ margin: '0 0 12px', fontSize: '0.85rem', color: 'var(--portal-muted)' }}>
          {cancelTarget && (
            <>
              Cancel your {formatDateLong(cancelTarget.appointment_date)} at {formatTime12h(cancelTarget.appointment_time)} visit
              {cancelTarget.dentist?.name ? ` with ${cancelTarget.dentist.name}` : ''}? This can't be undone — you'll need to book
              again if you change your mind.
            </>
          )}
        </p>
        <textarea
          className="form-textarea"
          placeholder="Reason (optional)"
          value={cancelReason}
          onChange={(e) => setCancelReason(e.target.value)}
        />
        {cancelError && (
          <p style={{ margin: '10px 0 0', fontSize: '0.82rem', color: 'var(--portal-red-text)' }}>{cancelError}</p>
        )}
        <div className="modal-actions">
          <button type="button" className="dash-btn dash-btn--outline" onClick={() => setCancelTarget(null)}>
            Keep Appointment
          </button>
          <button type="button" className="dash-btn dash-btn--danger" disabled={cancelling} onClick={handleCancel}>
            {cancelling ? 'Cancelling…' : 'Cancel Appointment'}
          </button>
        </div>
      </Modal>
    </div>
  );
}

export default PatientAppointments;
