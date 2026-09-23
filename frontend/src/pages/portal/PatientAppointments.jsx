import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { getPatientAppointments, cancelAppointment, getFollowUpRecommendations } from '../../api/appointments';
import StatusBadge from './components/StatusBadge';
import Modal from './components/Modal';
import DataTable from './components/DataTable';
import { PlusIcon, CalendarPlusIcon } from './icons';
import { formatDateLong, formatDateShort, formatTime12h, toLocalDate } from './dateTimeUtils';
import './dashboards.css';
import './Appointments.css';

// Same 8-10s background-refresh pattern as DentistSchedule/HmoVerificationQueue/
// PediatricQueue — this page didn't have it yet (it was left on the blank-slate
// PlainBadge/unstyled treatment), so status changes like an HMO approval
// wouldn't show up here without a manual refresh. Added as part of this pass
// since the target design explicitly requires it to keep working.
const POLL_INTERVAL_MS = 9000;

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

function PatientAppointments() {
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('upcoming');

  const [cancelTarget, setCancelTarget] = useState(null);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState('');

  const [followUpRecommendations, setFollowUpRecommendations] = useState([]);

  useEffect(() => {
    getFollowUpRecommendations().then(setFollowUpRecommendations).catch(() => {});
  }, []);

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

  // One column set for all three tabs — Details/Actions just render
  // differently (or blank) per row's own status, rather than branching the
  // column definitions themselves per tab. Reuses the exact same
  // .cell-appointment/.cell-dentist-name/.cell-service classes AllAppointments.jsx
  // already established, and the same .appt-hmo-status/.appt-reason-note
  // boxes this page's own card layout used before — same content, table shape.
  const columns = [
    {
      key: 'appointment',
      label: 'Appointment',
      minWidth: '15%',
      minWidthPx: '120px',
      render: (row) => (
        <span className="cell-appointment">
          <span className="cell-appointment-date">{formatDateShort(row.appointment_date)}</span>
          <span className="cell-appointment-time">{formatTime12h(row.appointment_time)}</span>
        </span>
      ),
    },
    {
      key: 'service',
      label: 'Service',
      minWidth: '19%',
      minWidthPx: '160px',
      clampLines: 2,
      render: (row) => <span className="cell-service" title={row.service?.name}>{row.service?.name}</span>,
    },
    {
      key: 'dentist',
      label: 'Doctor',
      minWidth: '15%',
      minWidthPx: '140px',
      render: (row) => {
        const name = row.dentist?.name || 'Unassigned';
        return <span className="cell-dentist-name" title={name}>{name}</span>;
      },
    },
    {
      key: 'status',
      label: 'Status',
      minWidth: '11%',
      minWidthPx: '110px',
      align: 'center',
      render: (row) => <StatusBadge status={row.status} />,
    },
    {
      key: 'details',
      label: 'Details',
      minWidth: '26%',
      minWidthPx: '190px',
      render: (row) => {
        if (row.status === 'pending_verification' && row.hmo_status_label) {
          return (
            <div className="appt-hmo-status" style={{ margin: 0 }}>
              <span className="appt-hmo-status-label">{row.hmo_status_label}</span>
              {row.hmo_status_note && <span className="appt-hmo-status-note">{row.hmo_status_note}</span>}
              {row.hmo_status_updated_at && (
                <span className="appt-hmo-status-time">
                  Updated {new Date(row.hmo_status_updated_at).toLocaleString('en-US', {
                    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
                  })}
                </span>
              )}
            </div>
          );
        }
        if (REASON_VISIBLE_STATUSES.includes(row.status) && row.cancellation_reason) {
          return <p className="appt-reason-note" style={{ margin: 0 }}>{row.cancellation_reason}</p>;
        }
        return <span style={{ color: 'var(--portal-muted)' }}>—</span>;
      },
    },
    {
      key: 'actions',
      label: '',
      minWidth: '14%',
      minWidthPx: '140px',
      align: 'right',
      render: (row) =>
        CANCELLABLE_STATUSES.includes(row.status) ? (
          <button type="button" className="dash-btn dash-btn--danger row-btn" onClick={() => openCancel(row)}>
            Cancel
          </button>
        ) : null,
    },
  ];

  return (
    <div>
      <div className="section-card-header appt-page-header" style={{ marginBottom: 24 }}>
        <div>
          <h1 className="appt-page-title">My Appointments</h1>
          <p className="appt-page-subtitle">View and manage your upcoming, past, and cancelled visits.</p>
        </div>
        <div className="appt-page-actions">
          <Link to="/patient/book-appointment" className="dash-btn">
            <PlusIcon /> Book Appointment
          </Link>
          {followUpRecommendations.length > 0 && (
            <Link to="/patient/book-follow-up" className="dash-btn appt-followup-btn">
              <CalendarPlusIcon /> Book a Follow-up
              <span className="appt-followup-badge">{followUpRecommendations.length}</span>
            </Link>
          )}
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
          <div className="appt-master-table">
            <DataTable columns={columns} rows={currentRows} emptyMessage={currentTab.empty} />
          </div>
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
