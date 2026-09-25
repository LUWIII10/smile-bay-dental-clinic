import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getDentistSchedule, cancelAppointmentAsDentist } from '../../api/appointments';
import StatCard from './components/StatCard';
import StatusBadge from './components/StatusBadge';
import Skeleton from './components/Skeleton';
import RescheduleModal from './components/RescheduleModal';
import RejectionModal from './components/RejectionModal';
import PageHeader from './components/PageHeader';
import { CalendarIcon, CheckCircleIcon, ClockIcon, MoreIcon, CalendarXIcon, SwapIcon, FileIcon, AlertIcon, ShieldIcon } from './icons';
import { formatTime12h, toLocalDate } from './dateTimeUtils';
import './dashboards.css';
import './DentistSchedule.css';

const POLL_INTERVAL_MS = 9000;

function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function getInitials(name) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] || '';
  const last = parts.length > 1 ? parts[parts.length - 1][0] : '';
  return (first + last).toUpperCase();
}

// "Today, August 18, 2026" for today's group; every other date drops the
// "Today" prefix and shows the weekday instead, so a dentist scrolling past
// today can still tell which day of the week each group is.
function dayHeading(dateStr, today) {
  const d = toLocalDate(dateStr);
  if (dateStr === today) {
    return `Today, ${d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}`;
  }
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
}

// variant: 'danger' tints the collapsed row for the Needs Update tab (a
// confirmed visit whose date already passed) — omitted everywhere else,
// same default look as before this prop existed.
function ScheduleRow({ appointment, expanded, onToggle, completingId, onComplete, onReschedule, onCancel, onAddRecord, variant }) {
  const patientName = `${appointment.patient.first_name} ${appointment.patient.last_name}`.trim();
  const isCash = appointment.patient_type_snapshot === 'cash';
  const canAct = appointment.status === 'confirmed';
  const isCompleted = appointment.status === 'completed';
  // Completed rows also expand — the only action they offer is a jump to
  // writing that visit's dental record.
  const canExpand = canAct || isCompleted;
  const [timeValue, timePeriod] = formatTime12h(appointment.appointment_time).split(' ');

  return (
    <div
      className={`schedule-row${variant === 'danger' ? ' schedule-row--danger' : ''}${expanded ? ' schedule-row--expanded' : ''}`}
    >
      <button type="button" className="schedule-row-main" onClick={() => canExpand && onToggle(appointment.id)}>
        <span className="schedule-row-time">
          <span className="schedule-row-time-value">{timeValue}</span>
          <span className="schedule-row-time-period">{timePeriod}</span>
        </span>
        <span className="schedule-row-avatar">{getInitials(patientName)}</span>
        <span className="schedule-row-text">
          <span className="schedule-row-name">{patientName}</span>
          <span className="schedule-row-meta">{appointment.service.name} &middot; {isCash ? 'Cash' : 'HMO'}</span>
        </span>
        <StatusBadge status={appointment.status} />
        {canExpand && (
          <span
            className="schedule-row-more"
            role="button"
            tabIndex={-1}
            aria-label="Show actions"
          >
            <MoreIcon />
          </span>
        )}
      </button>

      {expanded && canAct && (
        <div className="schedule-row-actions">
          <button
            type="button"
            className="schedule-action-btn schedule-action-btn--green"
            disabled={completingId === appointment.id}
            onClick={() => onComplete(appointment)}
          >
            <CheckCircleIcon /> {completingId === appointment.id ? 'Saving…' : 'Complete'}
          </button>
          <button type="button" className="schedule-action-btn schedule-action-btn--amber" onClick={() => onReschedule(appointment)}>
            <SwapIcon /> Reschedule
          </button>
          <button type="button" className="schedule-action-btn schedule-action-btn--red" onClick={() => onCancel(appointment)}>
            <CalendarXIcon /> Cancel
          </button>
        </div>
      )}

      {expanded && isCompleted && (
        <div className="schedule-row-actions">
          <button
            type="button"
            className="schedule-action-btn schedule-action-btn--green"
            onClick={() => onAddRecord(appointment)}
          >
            <FileIcon /> Add Visit Record
          </button>
        </div>
      )}
    </div>
  );
}

function DentistSchedule() {
  const navigate = useNavigate();
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expandedId, setExpandedId] = useState(null);
  // Today first — a dentist opening this page wants to see today's own
  // visits immediately, not scroll past however many Needs Update rows
  // happen to exist (the whole reason this page moved to tabs).
  const [activeTab, setActiveTab] = useState('today');

  const [rescheduleTarget, setRescheduleTarget] = useState(null);

  const [cancelTarget, setCancelTarget] = useState(null);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelling, setCancelling] = useState(false);

  const loadSchedule = useCallback(async ({ silent = false } = {}) => {
    if (!silent) {
      setLoading(true);
      setError('');
    }
    try {
      const data = await getDentistSchedule();
      setAppointments(data);
    } catch {
      if (!silent) setError('Could not load your schedule. Please refresh the page.');
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSchedule();
    const interval = setInterval(() => loadSchedule({ silent: true }), POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [loadSchedule]);

  // Completing no longer happens here at all — it takes the dentist into
  // Patient Records, where the tooth chart, clinical notes, treatment plans
  // and treatment history for this patient already live, to fill in what
  // was actually done before completing. mode: 'completing' tells
  // PatientRecords.jsx which of its two arrival behaviours applies (see its
  // isCompletingVisit) rather than it having to infer that from status,
  // which could change mid-session.
  const handleComplete = (appointment) => {
    navigate('/dentist/patient-records', {
      state: {
        patientId: appointment.patient.id,
        appointmentId: appointment.id,
        visitLabel: `${appointment.appointment_date.slice(0, 10)} at ${formatTime12h(appointment.appointment_time)}`,
        serviceName: appointment.service.name,
        appointmentDate: appointment.appointment_date.slice(0, 10),
        appointmentStatus: appointment.status,
        mode: 'completing',
      },
    });
  };

  // For a completed visit that never got a treatment_history row — writes
  // real notes retroactively, same Patient Records screen as handleComplete
  // above, just a different arrival mode since status is already
  // 'completed' and nothing about it changes here.
  const handleBackfill = (appointment) => {
    navigate('/dentist/patient-records', {
      state: {
        patientId: appointment.patient.id,
        appointmentId: appointment.id,
        visitLabel: `${appointment.appointment_date.slice(0, 10)} at ${formatTime12h(appointment.appointment_time)}`,
        serviceName: appointment.service.name,
        appointmentDate: appointment.appointment_date.slice(0, 10),
        appointmentStatus: appointment.status,
        mode: 'backfilling',
      },
    });
  };

  const openCancel = (appointment) => {
    setError('');
    setCancelReason('');
    setCancelTarget(appointment);
  };

  // Jump to writing an already-completed visit's dental record — the old
  // "Add Visit Record" behaviour, unchanged. mode: 'addRecord' is what tells
  // PatientRecords.jsx to auto-open its "Add Clinical Note" modal like it
  // always has; it's the explicit counterpart to mode: 'completing' above.
  const handleAddRecord = (appointment) => {
    navigate('/dentist/patient-records', {
      state: {
        patientId: appointment.patient.id,
        appointmentId: appointment.id,
        visitLabel: `${appointment.appointment_date.slice(0, 10)} at ${formatTime12h(appointment.appointment_time)}`,
        mode: 'addRecord',
      },
    });
  };

  const handleCancel = async () => {
    if (!cancelTarget) return;
    setCancelling(true);
    try {
      await cancelAppointmentAsDentist(cancelTarget.id, cancelReason);
      setExpandedId(null);
      setCancelTarget(null);
      loadSchedule();
    } catch (err) {
      setError(err.response?.data?.message || 'Could not cancel this appointment.');
    } finally {
      setCancelling(false);
    }
  };

  const stats = useMemo(() => {
    const today = todayKey();
    return {
      today: appointments.filter((a) => a.appointment_date.slice(0, 10) === today).length,
      completedToday: appointments.filter(
        (a) => a.appointment_date.slice(0, 10) === today && a.status === 'completed'
      ).length,
      remaining: appointments.filter((a) => a.status === 'confirmed' && a.appointment_date.slice(0, 10) >= today).length,
      overdue: appointments.filter((a) => a.status === 'confirmed' && a.appointment_date.slice(0, 10) < today).length,
    };
  }, [appointments]);

  // API already returns these ascending, but re-sort defensively after a
  // status update above swaps an item in place. Completed rows are excluded
  // here — they move into the Completed Today section below instead of
  // staying mixed into the dated list (the API only ever returns a
  // completed row when it's dated today, so "completed" and "completed
  // today" are the same set here).
  const today = todayKey();

  const sortedAppointments = [...appointments]
    .filter((a) => a.status === 'confirmed')
    .sort((a, b) => {
      const dateCompare = toLocalDate(a.appointment_date) - toLocalDate(b.appointment_date);
      if (dateCompare !== 0) return dateCompare;
      return a.appointment_time.localeCompare(b.appointment_time);
    });

  // A confirmed visit whose date already passed without being completed —
  // the index() query now includes these (it used to cut off at today),
  // so they need their own "still needs a real outcome" tab instead of
  // silently sorting into the upcoming list as if nothing were wrong.
  const overdueAppointments = sortedAppointments.filter((a) => a.appointment_date.slice(0, 10) < today);
  const upcomingAppointments = sortedAppointments.filter((a) => a.appointment_date.slice(0, 10) >= today);

  // Today and Upcoming are now separate tabs (see TABS below) — today's own
  // confirmed visits shouldn't also repeat inside the Upcoming tab's dated
  // groups, so this splits the >= today set the two tabs actually draw from.
  const todayAppointments = upcomingAppointments.filter((a) => a.appointment_date.slice(0, 10) === today);
  const futureAppointments = upcomingAppointments.filter((a) => a.appointment_date.slice(0, 10) > today);

  const groups = useMemo(() => {
    const byDate = new Map();
    futureAppointments.forEach((a) => {
      const key = a.appointment_date.slice(0, 10);
      if (!byDate.has(key)) byDate.set(key, []);
      byDate.get(key).push(a);
    });
    return Array.from(byDate.entries());
  }, [futureAppointments]);

  // Explicitly date-scoped now — index() also returns completed rows from
  // any date that are still missing a treatment_history row (see
  // missingRecordAppointments below), so "status === 'completed'" alone no
  // longer means "completed today" the way the API's old date-bounded query
  // guaranteed.
  const completedToday = useMemo(
    () =>
      [...appointments]
        .filter((a) => a.status === 'completed' && a.appointment_date.slice(0, 10) === today)
        .sort((a, b) => a.appointment_time.localeCompare(b.appointment_time)),
    [appointments, today]
  );

  // A visit marked completed (any date other than today — today's own gets
  // caught by the section above instead) that still has no treatment_history
  // row — the dentist needs to write up what was actually done before a
  // patient's "View Treatment" ever shows anything for it.
  const missingRecordAppointments = useMemo(
    () =>
      [...appointments]
        .filter((a) => a.status === 'completed' && !a.treatmentHistoryEntry && a.appointment_date.slice(0, 10) !== today)
        .sort((a, b) => toLocalDate(b.appointment_date) - toLocalDate(a.appointment_date)),
    [appointments, today]
  );

  // Read-only heads-up — index() now includes this dentist's own HMO
  // bookings still awaiting staff's coverage check. Nothing here is
  // clickable: it becomes a normal actionable confirmed row (in the dated
  // list below) the moment HMO Verification Queue approves it.
  const pendingVerificationAppointments = useMemo(
    () =>
      [...appointments]
        .filter((a) => a.status === 'pending_verification')
        .sort((a, b) => {
          const dateCompare = toLocalDate(a.appointment_date) - toLocalDate(b.appointment_date);
          if (dateCompare !== 0) return dateCompare;
          return a.appointment_time.localeCompare(b.appointment_time);
        }),
    [appointments]
  );

  // Same .portal-tabs pattern PatientAppointments.jsx already uses — counts
  // read from the lists computed above, so a tab's badge and its own
  // content can never drift apart. Unlike that page, each tab here renders
  // through different markup (ScheduleRow vs. the info-row layout), so
  // there's no single shared "rows" renderer — activeTab just picks which
  // block below is shown.
  const TABS = [
    { key: 'today', label: 'Today', count: todayAppointments.length },
    { key: 'completedToday', label: 'Completed Today', count: completedToday.length },
    { key: 'upcoming', label: 'Upcoming', count: futureAppointments.length },
    { key: 'needsUpdate', label: 'Needs Update', count: overdueAppointments.length },
    { key: 'needsRecord', label: 'Needs Treatment Record', count: missingRecordAppointments.length },
    { key: 'awaitingHmo', label: 'Awaiting HMO Verification', count: pendingVerificationAppointments.length },
  ];

  return (
    <div>
      <PageHeader icon={ClockIcon} title="My Schedule" subtitle="View and manage your assigned appointments." />

      <div className={`stat-grid${!loading && stats.overdue > 0 ? ' stat-grid--4' : ''}`}>
        {loading ? (
          <Skeleton variant="stat-card" count={3} />
        ) : (
          <>
            <StatCard label="Appointments Today" value={stats.today} icon={CalendarIcon} tint="blue" />
            <StatCard label="Completed Today" value={stats.completedToday} icon={CheckCircleIcon} tint="green" />
            <StatCard label="Upcoming Confirmed" value={stats.remaining} icon={ClockIcon} tint="amber" />
            {stats.overdue > 0 && (
              <StatCard label="Needs Update" value={stats.overdue} icon={AlertIcon} tint="red" />
            )}
          </>
        )}
      </div>

      {error && <div className="profile-alert profile-alert--error">{error}</div>}

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
              <span className="portal-tab-count">{loading ? '…' : tab.count}</span>
            </button>
          ))}
        </div>

        {loading ? (
          <Skeleton variant="row" count={4} />
        ) : (
          <>
            {activeTab === 'today' && (
              todayAppointments.length === 0 ? (
                <div className="dash-empty">
                  <CalendarIcon />
                  <span className="dash-empty-title">No appointments scheduled today.</span>
                </div>
              ) : (
                todayAppointments.map((appointment) => (
                  <ScheduleRow
                    key={appointment.id}
                    appointment={appointment}
                    expanded={expandedId === appointment.id}
                    onToggle={(id) => setExpandedId((prev) => (prev === id ? null : id))}
                    onComplete={handleComplete}
                    onReschedule={setRescheduleTarget}
                    onCancel={openCancel}
                    onAddRecord={handleAddRecord}
                  />
                ))
              )
            )}

            {activeTab === 'completedToday' && (
              completedToday.length === 0 ? (
                <div className="dash-empty">
                  <CheckCircleIcon />
                  <span className="dash-empty-title">No visits completed yet today.</span>
                </div>
              ) : (
                completedToday.map((appointment) => {
                  const patientName = `${appointment.patient.first_name} ${appointment.patient.last_name}`.trim();
                  const entry = appointment.treatmentHistoryEntry;
                  return (
                    <div key={appointment.id} className="completed-today-row">
                      <span className="activity-item-icon activity-item-icon--green">
                        <CheckCircleIcon />
                      </span>
                      <div className="completed-today-text">
                        <span className="completed-today-name">
                          {patientName}
                          {entry?.procedure_name ? ` — ${entry.procedure_name}` : ''}
                        </span>
                        {entry?.notes && <span className="completed-today-notes">{entry.notes}</span>}
                        <button type="button" className="completed-today-link" onClick={() => handleAddRecord(appointment)}>
                          <FileIcon /> Add Visit Record
                        </button>
                      </div>
                      <span className="completed-today-time">{formatTime12h(appointment.appointment_time)}</span>
                    </div>
                  );
                })
              )
            )}

            {activeTab === 'upcoming' && (
              groups.length === 0 ? (
                <div className="dash-empty">
                  <CalendarIcon />
                  <span className="dash-empty-title">No upcoming appointments on your schedule.</span>
                </div>
              ) : (
                groups.map(([dateKey, rows]) => (
                  <div key={dateKey}>
                    <h3 className="schedule-day-heading">{dayHeading(dateKey, today)}</h3>
                    {rows.map((appointment) => (
                      <ScheduleRow
                        key={appointment.id}
                        appointment={appointment}
                        expanded={expandedId === appointment.id}
                        onToggle={(id) => setExpandedId((prev) => (prev === id ? null : id))}
                        onComplete={handleComplete}
                        onReschedule={setRescheduleTarget}
                        onCancel={openCancel}
                        onAddRecord={handleAddRecord}
                      />
                    ))}
                  </div>
                ))
              )
            )}

            {activeTab === 'needsUpdate' && (
              overdueAppointments.length === 0 ? (
                <div className="dash-empty">
                  <CheckCircleIcon />
                  <span className="dash-empty-title">Nothing needs an update — every confirmed visit is up to date.</span>
                </div>
              ) : (
                <>
                  <p className="schedule-overdue-hint">
                    These were confirmed but their date has passed without a recorded outcome. Complete each one with
                    what actually happened, or cancel it if it never happened.
                  </p>
                  {overdueAppointments.map((appointment) => (
                    <ScheduleRow
                      key={appointment.id}
                      appointment={appointment}
                      variant="danger"
                      expanded={expandedId === appointment.id}
                      onToggle={(id) => setExpandedId((prev) => (prev === id ? null : id))}
                      onComplete={handleComplete}
                      onReschedule={setRescheduleTarget}
                      onCancel={openCancel}
                      onAddRecord={handleAddRecord}
                    />
                  ))}
                </>
              )
            )}

            {activeTab === 'needsRecord' && (
              missingRecordAppointments.length === 0 ? (
                <div className="dash-empty">
                  <CheckCircleIcon />
                  <span className="dash-empty-title">Nothing missing — every completed visit has a treatment record on file.</span>
                </div>
              ) : (
                <>
                  <p className="schedule-overdue-hint">
                    These visits were marked completed but have no procedure notes on file — write up what was actually
                    done so the patient's own record shows it correctly.
                  </p>
                  {missingRecordAppointments.map((appointment) => {
                    const patientName = `${appointment.patient.first_name} ${appointment.patient.last_name}`.trim();
                    return (
                      <div key={appointment.id} className="completed-today-row">
                        <span className="activity-item-icon activity-item-icon--amber">
                          <FileIcon />
                        </span>
                        <div className="completed-today-text">
                          <span className="completed-today-name">
                            {patientName} — {appointment.service.name}
                          </span>
                          <span className="completed-today-notes">
                            {toLocalDate(appointment.appointment_date).toLocaleDateString('en-US', {
                              month: 'long', day: 'numeric', year: 'numeric',
                            })}
                          </span>
                          <button type="button" className="completed-today-link" onClick={() => handleBackfill(appointment)}>
                            <FileIcon /> Add Treatment Record
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </>
              )
            )}

            {activeTab === 'awaitingHmo' && (
              pendingVerificationAppointments.length === 0 ? (
                <div className="dash-empty">
                  <ShieldIcon />
                  <span className="dash-empty-title">Nothing awaiting HMO verification right now.</span>
                </div>
              ) : (
                <>
                  <p className="schedule-overdue-hint">
                    Booked with you, but still pending — dental assistant/admin staff need to confirm the patient's HMO
                    coverage for the specific procedure before this becomes a confirmed visit on your schedule.
                  </p>
                  {pendingVerificationAppointments.map((appointment) => {
                    const patientName = `${appointment.patient.first_name} ${appointment.patient.last_name}`.trim();
                    return (
                      <div key={appointment.id} className="completed-today-row">
                        <span className="activity-item-icon activity-item-icon--amber">
                          <ShieldIcon />
                        </span>
                        <div className="completed-today-text">
                          <span className="completed-today-name">
                            {patientName} — {appointment.service.name}
                          </span>
                          <span className="completed-today-notes">
                            {toLocalDate(appointment.appointment_date).toLocaleDateString('en-US', {
                              month: 'long', day: 'numeric', year: 'numeric',
                            })} &middot; {formatTime12h(appointment.appointment_time)}
                          </span>
                          <span className="completed-today-notes">
                            {appointment.hmo_status_label || 'Pending — for HMO verification'}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </>
              )
            )}
          </>
        )}
      </div>

      <RescheduleModal
        open={!!rescheduleTarget}
        onClose={() => setRescheduleTarget(null)}
        appointment={rescheduleTarget}
        onSuccess={() => {
          setRescheduleTarget(null);
          setExpandedId(null);
          loadSchedule();
        }}
      />

      <RejectionModal
        open={!!cancelTarget}
        onClose={() => setCancelTarget(null)}
        title="Cancel Appointment"
        message={
          cancelTarget
            ? `${cancelTarget.patient.first_name} ${cancelTarget.patient.last_name} — ${formatTime12h(cancelTarget.appointment_time)}. The patient will be notified by email.`
            : ''
        }
        reason={cancelReason}
        onReasonChange={setCancelReason}
        onConfirm={handleCancel}
        confirming={cancelling}
        confirmLabel="Confirm Cancellation"
        cancelLabel="Keep Appointment"
      />
    </div>
  );
}

export default DentistSchedule;
