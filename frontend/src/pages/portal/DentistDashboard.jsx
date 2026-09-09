import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { getDentistDashboardSummary } from '../../api/appointments';
import DashGreeting from './components/DashGreeting';
import StatCard from './components/StatCard';
import StatusBadge from './components/StatusBadge';
import DataTable from './components/DataTable';
import Skeleton from './components/Skeleton';
import { CalendarIcon, ClockIcon, UsersIcon } from './icons';
import { formatDateShort, formatTime12h } from './dateTimeUtils';
import './dashboards.css';

// Cash vs. HMO — the only patient-type distinction the data model actually
// carries (patient_type_snapshot). No specific-provider ("Medicard",
// "Flexicare") badge here since Patient has no hmoProvider() relation wired
// up yet — see StaffVerificationController's own note on this.
function patientTypeBadge(row) {
  const isCash = row.patient_type_snapshot === 'cash';
  return <StatusBadge status={isCash ? 'Cash' : 'HMO'} tone={isCash ? 'green' : 'amber'} />;
}

const TODAY_COLUMNS = [
  { key: 'time', label: 'Time', render: (row) => formatTime12h(row.appointment_time) },
  { key: 'patient', label: 'Patient', render: (row) => `${row.patient.first_name} ${row.patient.last_name}` },
  { key: 'service', label: 'Service', render: (row) => row.service.name },
  { key: 'patientType', label: 'Patient Type', render: patientTypeBadge },
];

const UPCOMING_COLUMNS = [
  { key: 'date', label: 'Date', render: (row) => formatDateShort(row.appointment_date) },
  { key: 'patient', label: 'Patient', render: (row) => `${row.patient.first_name} ${row.patient.last_name}` },
  { key: 'service', label: 'Service', render: (row) => row.service.name },
  { key: 'status', label: 'Status', render: (row) => <StatusBadge status={row.status} /> },
];

function DentistDashboard() {
  const { user } = useAuth();
  const firstName = user?.name?.split(' ')[0] || 'Doctor';

  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await getDentistDashboardSummary();
      setSummary(data);
    } catch {
      setError('Could not load your dashboard. Please refresh the page.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div>
      <DashGreeting firstName={firstName} />

      <div className="stat-grid">
        {loading ? (
          <Skeleton variant="stat-card" count={3} />
        ) : (
          <>
            <StatCard label="Appointments Today" value={summary?.stats.today ?? 0} icon={CalendarIcon} tint="blue" />
            <StatCard label="Appointments This Week" value={summary?.stats.thisWeek ?? 0} icon={ClockIcon} tint="green" />
            <StatCard label="Patients Seen This Month" value={summary?.stats.patientsThisMonth ?? 0} icon={UsersIcon} tint="amber" />
          </>
        )}
      </div>

      <div className="section-card">
        <div className="section-card-header">
          <h3 className="section-card-title">Today's Schedule</h3>
        </div>

        {loading ? (
          <Skeleton variant="row" count={4} />
        ) : error ? (
          <div className="dash-empty">
            <span className="dash-empty-title">{error}</span>
          </div>
        ) : (
          <DataTable columns={TODAY_COLUMNS} rows={summary?.todaysSchedule} emptyMessage="No appointments scheduled today" />
        )}
      </div>

      <div className="section-card">
        <div className="section-card-header">
          <h3 className="section-card-title">Upcoming Appointments</h3>
        </div>

        {loading ? (
          <Skeleton variant="row" count={3} />
        ) : !error ? (
          <DataTable columns={UPCOMING_COLUMNS} rows={summary?.upcoming} emptyMessage="No upcoming appointments." />
        ) : null}
      </div>
    </div>
  );
}

export default DentistDashboard;
