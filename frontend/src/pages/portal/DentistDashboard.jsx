import { useAuth } from '../../context/AuthContext';
import { useSimulatedLoad } from '../../hooks/useSimulatedLoad';
import DashGreeting from './components/DashGreeting';
import StatCard from './components/StatCard';
import StatusBadge from './components/StatusBadge';
import DataTable from './components/DataTable';
import Skeleton from './components/Skeleton';
import { CalendarIcon, ClockIcon, UsersIcon } from './icons';
import { DENTIST_MOCK } from './mockData';
import './dashboards.css';

// Cash vs. HMO provider — same tone mapping used anywhere a patient's
// payment type shows up, kept local since only the dentist dashboard
// surfaces it today.
const PATIENT_TYPE_TONE = {
  Cash: 'green',
  Medicard: 'amber',
  Flexicare: 'blue',
};

const TODAY_COLUMNS = [
  { key: 'time', label: 'Time' },
  { key: 'patient', label: 'Patient' },
  { key: 'service', label: 'Service' },
  {
    key: 'patientType',
    label: 'Patient Type',
    render: (row) => <StatusBadge status={row.patientType} tone={PATIENT_TYPE_TONE[row.patientType]} />,
  },
];

const UPCOMING_COLUMNS = [
  { key: 'date', label: 'Date' },
  { key: 'patient', label: 'Patient' },
  { key: 'service', label: 'Service' },
  { key: 'status', label: 'Status', render: (row) => <StatusBadge status={row.status} /> },
];

function DentistDashboard() {
  const { user } = useAuth();
  const loading = useSimulatedLoad();
  const firstName = user?.name?.split(' ')[0] || 'Doctor';
  const { stats, timeline, upcoming } = DENTIST_MOCK;

  return (
    <div>
      <DashGreeting firstName={firstName} />

      <div className="stat-grid">
        {loading ? (
          <Skeleton variant="stat-card" count={3} />
        ) : (
          <>
            <StatCard label="Appointments Today" value={stats.today} icon={CalendarIcon} tint="blue" />
            <StatCard label="Appointments This Week" value={stats.thisWeek} icon={ClockIcon} tint="green" />
            <StatCard label="Patients Seen This Month" value={stats.patientsThisMonth} icon={UsersIcon} tint="amber" />
          </>
        )}
      </div>

      <div className="section-card">
        <div className="section-card-header">
          <h3 className="section-card-title">Today's Schedule</h3>
        </div>

        {loading ? (
          <Skeleton variant="row" count={4} />
        ) : (
          <DataTable columns={TODAY_COLUMNS} rows={timeline} emptyMessage="No appointments scheduled today" />
        )}
      </div>

      <div className="section-card">
        <div className="section-card-header">
          <h3 className="section-card-title">Upcoming Appointments</h3>
        </div>

        {loading ? <Skeleton variant="row" count={3} /> : <DataTable columns={UPCOMING_COLUMNS} rows={upcoming} />}
      </div>
    </div>
  );
}

export default DentistDashboard;
