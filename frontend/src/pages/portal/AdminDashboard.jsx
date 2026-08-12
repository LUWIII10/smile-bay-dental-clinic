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
import { useSimulatedLoad } from '../../hooks/useSimulatedLoad';
import DashGreeting from './components/DashGreeting';
import StatCard from './components/StatCard';
import Skeleton from './components/Skeleton';
import { UsersIcon, CalendarIcon, UserIcon, ShieldIcon } from './icons';
import { ADMIN_MOCK } from './mockData';
import './dashboards.css';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, ArcElement, Title, Tooltip, Legend, Filler);

const LINE_OPTIONS = {
  responsive: true,
  maintainAspectRatio: false,
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
  plugins: {
    legend: {
      position: 'bottom',
      labels: { color: '#334155', font: { family: 'Poppins', size: 11 }, padding: 14, boxWidth: 10 },
    },
  },
};

function AdminDashboard() {
  const { user } = useAuth();
  const loading = useSimulatedLoad();
  const firstName = user?.name?.split(' ')[0] || 'Admin';
  const { stats, appointmentsOverTime, appointmentsByStatus, activity } = ADMIN_MOCK;

  const lineData = {
    labels: appointmentsOverTime.labels,
    datasets: [
      {
        label: 'Appointments',
        data: appointmentsOverTime.data,
        borderColor: '#2952e3',
        backgroundColor: 'rgba(41, 82, 227, 0.1)',
        pointBackgroundColor: '#2952e3',
        tension: 0.35,
        fill: true,
      },
    ],
  };

  const doughnutData = {
    labels: appointmentsByStatus.labels,
    datasets: [
      {
        data: appointmentsByStatus.data,
        backgroundColor: ['#15803d', '#b45309', '#1d4ed8', '#b42318'],
        borderWidth: 0,
      },
    ],
  };

  return (
    <div>
      <DashGreeting firstName={firstName} />

      <div className="stat-grid stat-grid--4">
        {loading ? (
          <Skeleton variant="stat-card" count={4} />
        ) : (
          <>
            <StatCard label="Total Patients" value={stats.totalPatients} icon={UsersIcon} tint="blue" />
            <StatCard label="Appointments This Month" value={stats.appointmentsThisMonth} icon={CalendarIcon} tint="green" />
            <StatCard label="Active Users" value={stats.activeUsers} icon={UserIcon} tint="amber" />
            <StatCard label="Pending Verifications" value={stats.pendingVerifications} icon={ShieldIcon} tint="red" />
          </>
        )}
      </div>

      <div className="chart-grid">
        <div className="section-card">
          <div className="section-card-header">
            <h3 className="section-card-title">Appointments Over Time</h3>
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
            <h3 className="section-card-title">Appointment Breakdown</h3>
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
          <h3 className="section-card-title">Recent Activity</h3>
        </div>

        {loading ? (
          <Skeleton variant="row" count={4} />
        ) : (
          <ul className="activity-list">
            {activity.map((entry) => (
              <li key={entry.id} className="activity-item">
                <div className="activity-item-text">
                  <span className="activity-item-desc">{entry.description}</span>
                </div>
                <span className="activity-item-date">{entry.timestamp}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export default AdminDashboard;
