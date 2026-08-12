import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useSimulatedLoad } from '../../hooks/useSimulatedLoad';
import DashGreeting from './components/DashGreeting';
import StatCard from './components/StatCard';
import StatusBadge from './components/StatusBadge';
import DataTable from './components/DataTable';
import Skeleton from './components/Skeleton';
import { CalendarIcon, ShieldIcon, CheckCircleIcon, AlertIcon } from './icons';
import { ASSISTANT_MOCK } from './mockData';
import './dashboards.css';

const APPOINTMENT_COLUMNS = [
  { key: 'time', label: 'Time' },
  { key: 'patient', label: 'Patient' },
  { key: 'service', label: 'Service' },
  { key: 'status', label: 'Status', render: (row) => <StatusBadge status={row.status} /> },
];

function AssistantDashboard() {
  const { user } = useAuth();
  const loading = useSimulatedLoad();
  const firstName = user?.name?.split(' ')[0] || 'there';
  const { pendingVerifications, stats, appointments } = ASSISTANT_MOCK;

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

      <div className="stat-grid">
        {loading ? (
          <Skeleton variant="stat-card" count={3} />
        ) : (
          <>
            <StatCard label="Appointments Today" value={stats.today} icon={CalendarIcon} tint="blue" />
            <StatCard
              label="Pending Verifications"
              value={stats.pendingVerifications}
              icon={ShieldIcon}
              tint="amber"
              highlight
            />
            <StatCard label="Confirmed Today" value={stats.confirmedToday} icon={CheckCircleIcon} tint="green" />
          </>
        )}
      </div>

      <div className="section-card">
        <div className="section-card-header">
          <h3 className="section-card-title">Today's Appointments</h3>
        </div>

        {loading ? (
          <Skeleton variant="row" count={4} />
        ) : (
          <DataTable columns={APPOINTMENT_COLUMNS} rows={appointments} />
        )}
      </div>
    </div>
  );
}

export default AssistantDashboard;
