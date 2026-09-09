import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { getStaffDashboardSummary, getAllAppointments, getHmoQueue } from '../../api/appointments';
import DashGreeting from './components/DashGreeting';
import { greetingName } from './greetingName';
import StatCard from './components/StatCard';
import StatusBadge from './components/StatusBadge';
import DataTable from './components/DataTable';
import Skeleton from './components/Skeleton';
import { CalendarIcon, ShieldIcon, CheckCircleIcon, AlertIcon } from './icons';
import { formatTime12h, toLocalDate } from './dateTimeUtils';
import './dashboards.css';
import './Appointments.css';

const APPOINTMENT_COLUMNS = [
  { key: 'time', label: 'Time', render: (row) => formatTime12h(row.appointment_time) },
  { key: 'patient', label: 'Patient', render: (row) => `${row.patient?.first_name} ${row.patient?.last_name}` },
  { key: 'service', label: 'Service', render: (row) => row.service?.name },
  { key: 'status', label: 'Status', render: (row) => <StatusBadge status={row.status} /> },
];

// Priority is purely date-driven: an HMO booking sitting in the queue for
// today's visit is far more urgent than one still weeks out, even though
// both are equally "pending" — the queue itself has no separate urgency
// field to read.
function taskPriority(appointmentDate, todayDate) {
  const daysOut = Math.round((toLocalDate(appointmentDate) - todayDate) / 86400000);
  if (daysOut <= 0) return { label: 'high', tone: 'red' };
  if (daysOut <= 7) return { label: 'medium', tone: 'amber' };
  return { label: 'low', tone: 'blue' };
}

function buildTaskColumns(todayDate) {
  return [
    { key: 'time', label: 'Time', render: (row) => formatTime12h(row.appointment_time) },
    {
      key: 'task',
      label: 'Task',
      render: (row) => (
        <span className="cell-person-text">
          <span className="cell-person-name">
            Verify HMO — {row.patient?.first_name} {row.patient?.last_name}
          </span>
          <span className="cell-person-sub">{row.service?.name}</span>
        </span>
      ),
    },
    {
      key: 'priority',
      label: 'Priority',
      render: (row) => {
        const p = taskPriority(row.appointment_date, todayDate);
        return <StatusBadge status={p.label} tone={p.tone} />;
      },
    },
    { key: 'status', label: 'Status', render: () => <StatusBadge status="pending_verification" /> },
    {
      key: 'action',
      label: '',
      render: () => (
        <Link to="/assistant/hmo-verification" className="dash-btn dash-btn--outline row-btn">
          Review
        </Link>
      ),
    },
  ];
}

function AssistantDashboard() {
  const { user } = useAuth();
  const firstName = greetingName(user);

  const [summary, setSummary] = useState(null);
  const [todayAppointments, setTodayAppointments] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const todayDate = new Date();
  todayDate.setHours(0, 0, 0, 0);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const today = new Date();
      const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
      const [summaryData, appointmentsData, hmoQueue] = await Promise.all([
        getStaffDashboardSummary(),
        getAllAppointments({ date_from: todayKey, date_to: todayKey }),
        getHmoQueue(),
      ]);
      setSummary(summaryData);
      setTodayAppointments(appointmentsData.data);
      setTasks(
        [...hmoQueue].sort(
          (a, b) => a.appointment_date.localeCompare(b.appointment_date) || a.appointment_time.localeCompare(b.appointment_time)
        )
      );
    } catch {
      setError('Could not load the dashboard. Please refresh the page.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const pendingVerifications = summary?.pendingVerifications ?? 0;
  const taskColumns = buildTaskColumns(todayDate);

  return (
    <div>
      <DashGreeting firstName={firstName} />

      {!loading && pendingVerifications > 0 && (
        <div className="priority-card">
          <span className="priority-card-icon">
            <AlertIcon />
          </span>
          <div className="priority-card-text">
            <span className="priority-card-title">Pending HMO Verifications</span>
            <span className="priority-card-desc">
              {pendingVerifications} appointment{pendingVerifications === 1 ? '' : 's'} waiting on HMO coverage
              verification before they can be confirmed.
            </span>
          </div>
          <Link to="/assistant/hmo-verification" className="dash-btn dash-btn--amber">
            Review
          </Link>
        </div>
      )}

      <div className="stat-grid stat-grid--4">
        {loading ? (
          <Skeleton variant="stat-card" count={4} />
        ) : (
          <>
            <StatCard label="Appointments Today" value={summary?.today ?? 0} icon={CalendarIcon} tint="blue" />
            <StatCard
              label="Pending Verifications"
              value={pendingVerifications}
              icon={ShieldIcon}
              tint="amber"
              highlight
              to="/assistant/hmo-verification"
            />
            <StatCard label="Confirmed Today" value={summary?.confirmedToday ?? 0} icon={CheckCircleIcon} tint="green" />
            <StatCard label="Completed This Week" value={summary?.completedThisWeek ?? 0} icon={CheckCircleIcon} tint="blue" />
          </>
        )}
      </div>

      <div className="section-card">
        <div className="section-card-header">
          <h3 className="section-card-title">Today's Tasks</h3>
        </div>

        {loading ? (
          <Skeleton variant="row" count={4} />
        ) : error ? (
          <div className="dash-empty">
            <span className="dash-empty-title">{error}</span>
          </div>
        ) : (
          <DataTable
            columns={taskColumns}
            rows={tasks}
            emptyMessage="Nothing pending — the HMO verification queue is clear."
          />
        )}
      </div>

      <div className="section-card">
        <div className="section-card-header">
          <h3 className="section-card-title">Today's Appointments</h3>
        </div>

        {loading ? (
          <Skeleton variant="row" count={4} />
        ) : error ? (
          <div className="dash-empty">
            <span className="dash-empty-title">{error}</span>
          </div>
        ) : (
          <DataTable columns={APPOINTMENT_COLUMNS} rows={todayAppointments} emptyMessage="No appointments scheduled today." />
        )}
      </div>
    </div>
  );
}

export default AssistantDashboard;
