import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  getPatientAppointments,
  cancelAppointment,
  getFollowUpRecommendations,
  acceptProposedPediatricDate,
  requestDifferentPediatricDate,
} from '../../api/appointments';
import StatusBadge from './components/StatusBadge';
import Modal from './components/Modal';
import DataTable from './components/DataTable';
import AvailableSlotPicker from './components/AvailableSlotPicker';
import { PlusIcon, CalendarPlusIcon, CheckCircleIcon, CalendarIcon, UserIcon, ToothIcon, FileIcon, AlertIcon } from './icons';
import { classifyHistoryCategory } from './dentalRecordShared';
import { formatDateLong, formatDateShort, formatTime12h, toLocalDate } from './dateTimeUtils';
import PageHeader from './components/PageHeader';
import { showSuccessToast } from '../../utils/toast';
import './dashboards.css';
import './Appointments.css';
import './DentalRecords.css';
import './BookAppointment.css';

// Same 8-10s background-refresh pattern as DentistSchedule/HmoVerificationQueue/
// PediatricQueue — this page didn't have it yet (it was left on the blank-slate
// PlainBadge/unstyled treatment), so status changes like an HMO approval
// wouldn't show up here without a manual refresh. Added as part of this pass
// since the target design explicitly requires it to keep working.
const POLL_INTERVAL_MS = 9000;

const UPCOMING_STATUSES = ['confirmed', 'pending_verification'];
const PAST_STATUSES = ['completed', 'no_show'];
const CANCELLED_STATUSES = ['cancelled', 'rejected'];

// Status alone was never enough for "Upcoming" — a confirmed/pending
// appointment whose date has already passed (the dentist just hasn't
// marked it completed or no-show yet) isn't upcoming anymore, and staying
// silent about that in the meantime is exactly the kind of gap that looks
// bad under scrutiny. Falls into "Past" instead until staff resolves its
// real status, same date-aware rule PatientAppointmentController::summary()
// already applies server-side for the dashboard's own upcoming count.
const TABS = [
  {
    key: 'upcoming',
    label: 'Upcoming',
    matches: (a, today) => UPCOMING_STATUSES.includes(a.status) && toLocalDate(a.appointment_date) >= today,
    empty: 'No upcoming visits scheduled.',
  },
  {
    key: 'past',
    label: 'Past / Completed',
    matches: (a, today) =>
      PAST_STATUSES.includes(a.status) ||
      (UPCOMING_STATUSES.includes(a.status) && toLocalDate(a.appointment_date) < today),
    empty: 'No past visits yet.',
  },
  {
    key: 'cancelled',
    label: 'Cancelled / Rejected',
    matches: (a) => CANCELLED_STATUSES.includes(a.status),
    empty: 'Nothing cancelled or rejected — good news.',
  },
];

const CANCELLABLE_STATUSES = ['confirmed', 'pending_verification'];
const REASON_VISIBLE_STATUSES = ['cancelled', 'rejected'];

// Mirrors PatientAppointmentController::cancel()'s own "isUpcoming" check
// server-side — a confirmed/pending appointment whose date has already
// passed gets rejected there ("Only an upcoming confirmed or pending
// appointment can be cancelled"), so the button shouldn't even show for
// one, now that a stale one can appear here (under Past) instead of
// silently sitting in Upcoming.
function isCancellable(appointment) {
  if (!CANCELLABLE_STATUSES.includes(appointment.status)) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return toLocalDate(appointment.appointment_date) >= today;
}

// A confirmed/pending appointment whose date has already passed (falls
// under Past — see TABS above) isn't genuinely "Confirmed" anymore in any
// meaningful sense — that badge reads as "this is still coming up," which
// is no longer true. It's also not safe to silently relabel as Completed
// or No-show: only the dentist actually knows what happened at the visit,
// and inventing that here would be guessing, not reporting. So the status
// value itself stays exactly what's in the database (untouched — a
// dentist/staff view still needs the real value to resolve it), and only
// the PATIENT-facing badge swaps to an honest "still needs staff to
// resolve it" label instead of the misleading original one.
function isOverdueUnresolved(appointment) {
  if (!UPCOMING_STATUSES.includes(appointment.status)) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return toLocalDate(appointment.appointment_date) < today;
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

  // A pediatric appointment the dentist moved to a new date
  // (dentist_proposed_new_date_at set) — the patient needs to Accept it or
  // counter with a different one. requestingDifferent toggles the same
  // modal from "Accept / Request a Different Date" into the date/time form.
  const [proposalTarget, setProposalTarget] = useState(null);
  const [requestingDifferent, setRequestingDifferent] = useState(false);
  const [newDate, setNewDate] = useState('');
  const [newTime, setNewTime] = useState('');
  const [respondError, setRespondError] = useState('');
  const [responding, setResponding] = useState(false);

  // "What was actually done" for a completed visit, without leaving this
  // page — same treatment_history row My Dental Records' own Treatment
  // Details modal already reads (getPatientAppointments() now eager-loads
  // it), just reachable from here too.
  const [treatmentDetail, setTreatmentDetail] = useState(null);

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
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const result = {};
    for (const tab of TABS) {
      const rows = appointments.filter((a) => tab.matches(a, today));
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

  const openProposal = (appointment) => {
    setRespondError('');
    setRequestingDifferent(false);
    setNewDate('');
    setNewTime('');
    setProposalTarget(appointment);
  };

  const handleAcceptProposedDate = async () => {
    if (!proposalTarget) return;
    setResponding(true);
    setRespondError('');
    try {
      const response = await acceptProposedPediatricDate(proposalTarget.id);
      setAppointments((prev) => prev.map((a) => (a.id === proposalTarget.id ? response.data : a)));
      setProposalTarget(null);
      showSuccessToast('Date confirmed.');
    } catch (err) {
      setRespondError(err.response?.data?.message || 'Could not confirm this date.');
    } finally {
      setResponding(false);
    }
  };

  const handleRequestDifferentDate = async () => {
    if (!proposalTarget) return;
    if (!newDate || !newTime) {
      setRespondError('Please pick both a date and a time.');
      return;
    }
    setResponding(true);
    setRespondError('');
    try {
      const response = await requestDifferentPediatricDate(proposalTarget.id, newDate, newTime);
      setAppointments((prev) => prev.map((a) => (a.id === proposalTarget.id ? response.data : a)));
      setProposalTarget(null);
      showSuccessToast('New date sent for review.');
    } catch (err) {
      setRespondError(err.response?.data?.message || 'Could not send this date.');
    } finally {
      setResponding(false);
    }
  };

  const currentTab = TABS.find((t) => t.key === activeTab);
  const currentRows = grouped[activeTab] || [];

  // Details only ever has real content for a pending-HMO row with a staff
  // status update, or a cancelled/rejected row with a reason on file — most
  // rows (confirmed, completed, no-show) have nothing to put there. Rather
  // than reserve width for a column that's "—" almost every time, it only
  // appears at all when at least one row in the CURRENT tab actually has
  // something to show; Service/Doctor (populated on every row) reclaim its
  // width the rest of the time.
  const hasDetailsContent = (row) =>
    !!row.dentist_proposed_new_date_at ||
    (row.status === 'pending_verification' && !!row.hmo_status_label) ||
    (REASON_VISIBLE_STATUSES.includes(row.status) && !!row.cancellation_reason);
  const showDetails = currentRows.some(hasDetailsContent);

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
      minWidth: '14%',
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
      minWidth: showDetails ? '24%' : '34%',
      minWidthPx: '170px',
      clampLines: 2,
      render: (row) => <span className="cell-service" title={row.service?.name}>{row.service?.name}</span>,
    },
    {
      key: 'dentist',
      label: 'Doctor',
      minWidth: showDetails ? '20%' : '28%',
      minWidthPx: '170px',
      render: (row) => {
        const name = row.dentist?.name || 'Unassigned';
        return <span className="cell-dentist-name" title={name}>{name}</span>;
      },
    },
    {
      key: 'status',
      label: 'Status',
      minWidth: '10%',
      minWidthPx: '100px',
      align: 'center',
      render: (row) =>
        isOverdueUnresolved(row) ? (
          <StatusBadge status="Awaiting Update" tone="amber" />
        ) : (
          <StatusBadge status={row.status} />
        ),
    },
    ...(showDetails ? [{
      key: 'details',
      label: 'Details',
      minWidth: '18%',
      minWidthPx: '150px',
      render: (row) => {
        if (row.dentist_proposed_new_date_at) {
          return (
            <div className="appt-hmo-status" style={{ margin: 0 }}>
              <span className="appt-hmo-status-label">New date proposed</span>
              <span className="appt-hmo-status-note">
                {row.dentist?.name || 'Your dentist'} moved this visit to {formatDateLong(row.appointment_date)} —
                please respond.
              </span>
            </div>
          );
        }
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
    }] : []),
    {
      key: 'actions',
      label: '',
      minWidth: '14%',
      minWidthPx: '140px',
      align: 'right',
      render: (row) => {
        if (row.dentist_proposed_new_date_at) {
          return (
            <button type="button" className="dash-btn dash-btn--amber row-btn" onClick={() => openProposal(row)}>
              Respond
            </button>
          );
        }
        if (isCancellable(row)) {
          return (
            <button type="button" className="dash-btn dash-btn--danger row-btn" onClick={() => openCancel(row)}>
              Cancel
            </button>
          );
        }
        if (row.status === 'completed') {
          return (
            <button
              type="button"
              className="dash-btn dash-btn--outline row-btn"
              onClick={() => setTreatmentDetail(
                row.treatment_history_entry || {
                  missingRecord: true,
                  service_name: row.service?.name,
                  dentist_name: row.dentist?.name,
                  appointment_date: row.appointment_date,
                }
              )}
            >
              View Treatment
            </button>
          );
        }
        return null;
      },
    },
  ];

  return (
    <div>
      <PageHeader
        icon={CalendarIcon}
        title="My Appointments"
        subtitle="View and manage your upcoming, past, and cancelled visits."
      >
        <Link to="/patient/book-appointment" className="dash-btn">
          <PlusIcon /> Book Appointment
        </Link>
        {followUpRecommendations.length > 0 && (
          <Link to="/patient/book-follow-up" className="dash-btn appt-followup-btn">
            <CalendarPlusIcon /> Book a Follow-up
            <span className="appt-followup-badge">{followUpRecommendations.length}</span>
          </Link>
        )}
      </PageHeader>

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

      {/* Same "Treatment Details" modal as My Dental Records' own Treatment
          History section — same content, same look, reachable from here too. */}
      <Modal open={!!treatmentDetail} onClose={() => setTreatmentDetail(null)} title="Treatment Details">
        {treatmentDetail && treatmentDetail.missingRecord && (
          // A visit marked completed before per-visit records were required,
          // or one the dentist hasn't logged notes for yet — never invent
          // what was done, just say plainly that nothing was recorded.
          <div className="dash-empty">
            <FileIcon />
            <span className="dash-empty-title">No detailed record on file</span>
            <p className="dash-empty-desc">
              {formatDateShort(treatmentDetail.appointment_date)}
              {treatmentDetail.service_name ? ` — ${treatmentDetail.service_name}` : ''}
              {treatmentDetail.dentist_name ? ` with ${treatmentDetail.dentist_name}` : ''} was marked completed,
              but no procedure notes were saved for this visit. Contact the clinic if you'd like this added to
              your record.
            </p>
          </div>
        )}
        {treatmentDetail && !treatmentDetail.missingRecord && (
          <div className="record-history-detail">
            <div className="record-history-detail-badges">
              <StatusBadge
                status={classifyHistoryCategory(treatmentDetail.procedure_name).label}
                tone={classifyHistoryCategory(treatmentDetail.procedure_name).tone}
              />
              <StatusBadge status="Completed" tone="green" icon={CheckCircleIcon} />
            </div>
            <h4 className="record-history-detail-title">{treatmentDetail.procedure_name}</h4>
            <div className="record-history-detail-grid">
              <div className="record-info-item">
                <span className="record-info-label"><CalendarIcon /> Date Performed</span>
                <span className="record-info-value">{formatDateShort(treatmentDetail.performed_at)}</span>
              </div>
              <div className="record-info-item">
                <span className="record-info-label"><UserIcon /> Attending Dentist</span>
                <span className="record-info-value">{treatmentDetail.performed_by?.name || 'Dentist'}</span>
              </div>
              {treatmentDetail.tooth_number && (
                <div className="record-info-item">
                  <span className="record-info-label"><ToothIcon /> Tooth Number</span>
                  <span className="record-info-value">#{treatmentDetail.tooth_number}</span>
                </div>
              )}
            </div>
            <div className="record-history-detail-notes">
              <span className="record-info-label">Clinical Notes</span>
              <p className="record-history-detail-notes-text">
                {treatmentDetail.notes || 'No additional notes were recorded for this visit.'}
              </p>
            </div>
          </div>
        )}
      </Modal>

      {/* Dr. Suchelle (or whichever pediatric dentist) moved this visit to a
          new date because the original one passed with no decision — the
          patient either accepts it or counters with a date of their own,
          which goes back to the dentist for confirmation again. */}
      <Modal
        open={!!proposalTarget}
        onClose={() => setProposalTarget(null)}
        title="New Date Proposed"
      >
        {proposalTarget && (
          <>
            <div className="queue-card-overdue-note">
              <AlertIcon /> {proposalTarget.dentist?.name || 'Your dentist'} couldn't confirm your original date in
              time, so they've proposed a new one below. You can accept it or request a different date.
            </div>
            <p style={{ margin: '0 0 14px', fontSize: '0.85rem', color: 'var(--portal-slate)' }}>
              <strong>{formatDateLong(proposalTarget.appointment_date)}</strong> at{' '}
              <strong>{formatTime12h(proposalTarget.appointment_time)}</strong>
              {proposalTarget.service?.name ? ` — ${proposalTarget.service.name}` : ''}
            </p>

            {!requestingDifferent ? (
              <>
                {respondError && (
                  <p style={{ margin: '0 0 10px', fontSize: '0.82rem', color: 'var(--portal-red-text)' }}>{respondError}</p>
                )}
                <div className="modal-actions">
                  <button
                    type="button"
                    className="dash-btn dash-btn--outline"
                    disabled={responding}
                    onClick={() => setRequestingDifferent(true)}
                  >
                    Request a Different Date
                  </button>
                  <button type="button" className="dash-btn" disabled={responding} onClick={handleAcceptProposedDate}>
                    {responding ? 'Confirming…' : 'Accept This Date'}
                  </button>
                </div>
              </>
            ) : (
              <>
                <AvailableSlotPicker
                  dentistId={proposalTarget.dentist_id}
                  serviceId={proposalTarget.service_id}
                  date={newDate}
                  onDateChange={setNewDate}
                  time={newTime}
                  onTimeChange={setNewTime}
                  compact
                />
                {respondError && (
                  <p style={{ margin: '10px 0 0', fontSize: '0.82rem', color: 'var(--portal-red-text)' }}>{respondError}</p>
                )}
                <div className="modal-actions">
                  <button
                    type="button"
                    className="dash-btn dash-btn--outline"
                    disabled={responding}
                    onClick={() => setRequestingDifferent(false)}
                  >
                    Back
                  </button>
                  <button type="button" className="dash-btn" disabled={responding || !newTime} onClick={handleRequestDifferentDate}>
                    {responding ? 'Sending…' : 'Send Request'}
                  </button>
                </div>
              </>
            )}
          </>
        )}
      </Modal>
    </div>
  );
}

export default PatientAppointments;
