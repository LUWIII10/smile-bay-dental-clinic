import { useCallback, useEffect, useMemo, useState } from 'react';
import { getDentistSchedule, completeAppointment, cancelAppointmentAsDentist } from '../../api/appointments';
import StatCard from './components/StatCard';
import StatusBadge from './components/StatusBadge';
import Skeleton from './components/Skeleton';
import RescheduleModal from './components/RescheduleModal';
import RejectionModal from './components/RejectionModal';
import { CalendarIcon, CheckCircleIcon, ClockIcon, MoreIcon, CalendarXIcon, SwapIcon } from './icons';
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

function ScheduleRow({ appointment, expanded, onToggle, completingId, onComplete, onReschedule, onCancel }) {
  const patientName = `${appointment.patient.first_name} ${appointment.patient.last_name}`.trim();
  const isCash = appointment.patient_type_snapshot === 'cash';
  const canAct = appointment.status === 'confirmed';
  const [timeValue, timePeriod] = formatTime12h(appointment.appointment_time).split(' ');

  return (
    <div className={`schedule-row${expanded ? ' schedule-row--expanded' : ''}`}>
      <button type="button" className="schedule-row-main" onClick={() => canAct && onToggle(appointment.id)}>
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
        {canAct && (
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
    </div>
  );
}

function DentistSchedule() {
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [completingId, setCompletingId] = useState(null);
  const [expandedId, setExpandedId] = useState(null);

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

  const handleComplete = async (appointment) => {
    setCompletingId(appointment.id);
    try {
      await completeAppointment(appointment.id);
      setExpandedId(null);
      setAppointments((prev) => prev.map((a) => (a.id === appointment.id ? { ...a, status: 'completed' } : a)));
    } catch (err) {
      setError(err.response?.data?.message || 'Could not mark this appointment as completed.');
    } finally {
      setCompletingId(null);
    }
  };

  const openCancel = (appointment) => {
    setError('');
    setCancelReason('');
    setCancelTarget(appointment);
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
      remaining: appointments.filter((a) => a.status === 'confirmed').length,
    };
  }, [appointments]);

  // API already returns these ascending, but re-sort defensively after a
  // status update above swaps an item in place.
  const sortedAppointments = [...appointments].sort((a, b) => {
    const dateCompare = toLocalDate(a.appointment_date) - toLocalDate(b.appointment_date);
    if (dateCompare !== 0) return dateCompare;
    return a.appointment_time.localeCompare(b.appointment_time);
  });

  const groups = useMemo(() => {
    const byDate = new Map();
    sortedAppointments.forEach((a) => {
      const key = a.appointment_date.slice(0, 10);
      if (!byDate.has(key)) byDate.set(key, []);
      byDate.get(key).push(a);
    });
    return Array.from(byDate.entries());
  }, [sortedAppointments]);

  const today = todayKey();

  return (
    <div>
      <div className="section-card-header appt-page-header">
        <div>
          <h1 className="appt-page-title">My Schedule</h1>
          <p className="appt-page-subtitle">View and manage your assigned appointments.</p>
        </div>
      </div>

      <div className="stat-grid">
        {loading ? (
          <Skeleton variant="stat-card" count={3} />
        ) : (
          <>
            <StatCard label="Appointments Today" value={stats.today} icon={CalendarIcon} tint="blue" />
            <StatCard label="Completed Today" value={stats.completedToday} icon={CheckCircleIcon} tint="green" />
            <StatCard label="Upcoming Confirmed" value={stats.remaining} icon={ClockIcon} tint="amber" />
          </>
        )}
      </div>

      {error && <div className="profile-alert profile-alert--error">{error}</div>}

      {loading ? (
        <Skeleton variant="block" height="120px" count={3} />
      ) : groups.length === 0 ? (
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
                completingId={completingId}
                onComplete={handleComplete}
                onReschedule={setRescheduleTarget}
                onCancel={openCancel}
              />
            ))}
          </div>
        ))
      )}

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
