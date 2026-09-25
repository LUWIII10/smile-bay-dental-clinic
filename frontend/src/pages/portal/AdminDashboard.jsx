import { useCallback, useEffect, useState } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js';
import { Line, Doughnut } from 'react-chartjs-2';
import { useAuth } from '../../context/AuthContext';
import { getStaffDashboardSummary, getRecentActivity } from '../../api/appointments';
import { getReportsOverview } from '../../api/reports';
import DashGreeting from './components/DashGreeting';
import { greetingName } from './greetingName';
import StatCard from './components/StatCard';
import Skeleton from './components/Skeleton';
import DataTable from './components/DataTable';
import StatusBadge from './components/StatusBadge';
import { UsersIcon, CalendarIcon, UserIcon, ShieldIcon, CheckCircleIcon, ActivityIcon, TrendingUpIcon, ChartIcon } from './icons';
import './dashboards.css';
import './Appointments.css';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, ArcElement, Title, Tooltip, Legend, Filler);

// Explicit rather than relying on Chart.js's own defaults — same values as
// Reports.jsx's charts, so the entrance feels consistent across both pages.
const CHART_ANIMATION = { duration: 900, easing: 'easeOutQuart' };

const LINE_OPTIONS = {
  responsive: true,
  maintainAspectRatio: false,
  animation: CHART_ANIMATION,
  plugins: { legend: { display: false } },
  scales: {
    x: { grid: { display: false }, ticks: { color: '#64748b', font: { family: 'Poppins', size: 11 } } },
    y: {
      beginAtZero: true,
      grid: { color: '#e2e8f0' },
      ticks: { color: '#64748b', font: { family: 'Poppins', size: 11 } },
    },
  },
};

const DOUGHNUT_OPTIONS = {
  responsive: true,
  maintainAspectRatio: false,
  // animateScale is off by default for a doughnut/pie in Chart.js — without
  // it, only the slices' rotation animates in, the ring stays full-size the
  // whole time. Both on together is what actually reads as "the pie chart
  // grows in" rather than just a quick sweep.
  animation: { ...CHART_ANIMATION, animateRotate: true, animateScale: true },
  plugins: {
    legend: {
      position: 'bottom',
      labels: { color: '#334155', font: { family: 'Poppins', size: 11 }, padding: 14, boxWidth: 10 },
    },
  },
};

// M/D formatting for the line-chart x-axis labels — the backend sends
// plain YYYY-MM-DD dates (ReportsController::overview()'s by_day rows).
function formatDayLabel(dateStr) {
  const [, month, day] = dateStr.split('-');
  return `${Number(month)}/${Number(day)}`;
}

function getInitials(name) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] || '';
  const last = parts.length > 1 ? parts[parts.length - 1][0] : '';
  return (first + last).toUpperCase();
}

// Recent Activity, one column per field — DashboardController::
// recentActivity() sends these alongside its old pre-built `description`
// sentence (kept, unused here) specifically so this table can be reverted
// to the old <ul> sentence list in one line without a backend change.
const ACTIVITY_COLUMNS = [
  {
    key: 'patient',
    label: 'Patient',
    render: (row) => (
      <span className="cell-person">
        <span className="cell-avatar">{getInitials(row.patient_name)}</span>
        <span className="cell-person-name">{row.patient_name}</span>
      </span>
    ),
  },
  { key: 'service', label: 'Service', render: (row) => row.service_name, noWrap: true },
  { key: 'status', label: 'Status', render: (row) => <StatusBadge status={row.status} /> },
  { key: 'changed_by', label: 'Changed By', render: (row) => row.changed_by },
  { key: 'timestamp', label: 'When', render: (row) => row.timestamp },
];

function AdminDashboard() {
  const { user } = useAuth();
  const firstName = greetingName(user);

  const [summary, setSummary] = useState(null);
  const [reportsOverview, setReportsOverview] = useState(null);
  const [activity, setActivity] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [summaryData, overviewData, activityData] = await Promise.all([
        getStaffDashboardSummary(),
        getReportsOverview(),
        getRecentActivity(),
      ]);
      setSummary(summaryData);
      setReportsOverview(overviewData);
      setActivity(activityData);
    } catch {
      setError('Could not load the dashboard. Please refresh the page.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const byDay = reportsOverview?.by_day ?? [];
  const totals = reportsOverview?.totals;

  const lineData = {
    labels: byDay.map((row) => formatDayLabel(row.date)),
    datasets: [
      {
        label: 'Appointments',
        data: byDay.map((row) => row.count),
        borderColor: '#2952e3',
        backgroundColor: 'rgba(41, 82, 227, 0.1)',
        pointBackgroundColor: '#2952e3',
        tension: 0.35,
        fill: true,
      },
    ],
  };

  const doughnutData = {
    labels: ['Confirmed', 'Pending Verification', 'Completed', 'Cancelled/Rejected'],
    datasets: [
      {
        data: totals
          ? [totals.confirmed, totals.pending_verification, totals.completed, totals.cancelled + totals.rejected]
          : [0, 0, 0, 0],
        backgroundColor: ['#15803d', '#b45309', '#1d4ed8', '#b42318'],
        borderWidth: 0,
      },
    ],
  };

  return (
    <div>
      <DashGreeting firstName={firstName} />

      {error ? (
        <div className="dash-empty">
          <span className="dash-empty-title">{error}</span>
        </div>
      ) : (
        <>
          <div className="stat-grid stat-grid--4">
            {loading ? (
              <Skeleton variant="stat-card" count={4} />
            ) : (
              <>
                <StatCard label="Appointments Today" value={summary?.today ?? 0} icon={CalendarIcon} tint="blue" />
                <StatCard
                  label="Pending Verifications"
                  value={summary?.pendingVerifications ?? 0}
                  icon={ShieldIcon}
                  tint="red"
                  to="/admin/hmo-verification"
                />
                <StatCard label="Confirmed Today" value={summary?.confirmedToday ?? 0} icon={UsersIcon} tint="green" />
                <StatCard label="Completed This Week" value={summary?.completedThisWeek ?? 0} icon={CheckCircleIcon} tint="amber" />
              </>
            )}
          </div>

          <div className="stat-grid stat-grid--2">
            {loading ? (
              <Skeleton variant="stat-card" count={2} />
            ) : (
              <>
                <StatCard label="Total Patients" value={summary?.totalPatients ?? 0} icon={UsersIcon} tint="blue" />
                <StatCard label="Active Users" value={summary?.activeUsers ?? 0} icon={UserIcon} tint="amber" />
              </>
            )}
          </div>

          <div className="chart-grid">
            <div className="section-card">
              <div className="section-card-header">
                <div className="section-card-heading">
                  <span className="section-card-icon"><TrendingUpIcon /></span>
                  <h3 className="section-card-title">Appointments Over Time</h3>
                </div>
              </div>
              {loading ? (
                <Skeleton variant="block" />
              ) : (
                <div className="chart-container">
                  <Line data={lineData} options={LINE_OPTIONS} />
                </div>
              )}
            </div>

            <div className="section-card">
              <div className="section-card-header">
                <div className="section-card-heading">
                  <span className="section-card-icon"><ChartIcon /></span>
                  <h3 className="section-card-title">Appointment Breakdown</h3>
                </div>
              </div>
              {loading ? (
                <Skeleton variant="block" />
              ) : (
                <div className="chart-container">
                  <Doughnut data={doughnutData} options={DOUGHNUT_OPTIONS} />
                </div>
              )}
            </div>
          </div>

          <div className="section-card">
            <div className="section-card-header">
              <div className="section-card-heading">
                <span className="section-card-icon"><ActivityIcon /></span>
                <h3 className="section-card-title">Recent Activity</h3>
              </div>
            </div>

            {loading ? (
              <Skeleton variant="row" count={4} />
            ) : (
              <DataTable columns={ACTIVITY_COLUMNS} rows={activity} emptyMessage="No activity yet." />
            )}
          </div>
        </>
      )}
    </div>
  );
}

export default AdminDashboard;
