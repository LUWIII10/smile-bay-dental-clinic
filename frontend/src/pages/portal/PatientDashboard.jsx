import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { getPatientDashboardSummary } from '../../api/appointments';
import DashGreeting from './components/DashGreeting';
import { greetingName } from './greetingName';
import StatCard from './components/StatCard';
import StatusBadge from './components/StatusBadge';
import Skeleton from './components/Skeleton';
import { CalendarIcon, ClockIcon, CheckCircleIcon, CalendarPlusIcon, XCircleIcon, AlertIcon } from './icons';
import { formatDateLong, formatTime12h, toLocalDate } from './dateTimeUtils';
import './dashboards.css';

const MONTH_ABBR = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

// Icon + tint for the Recent Activity feed's left-hand circle, keyed by the
// appointment_status_log row's raw new_status value. Falls back to a
// neutral gray + AlertIcon (the closest generic icon already in icons.jsx —
// there's no dedicated dot/info icon) for any status this mapping doesn't
// explicitly name, so an unexpected value never renders blank.
const ACTIVITY_ICON = {
  confirmed: { Icon: CheckCircleIcon, tone: 'green' },
  completed: { Icon: CheckCircleIcon, tone: 'green' },
  pending_verification: { Icon: ClockIcon, tone: 'amber' },
  rejected: { Icon: XCircleIcon, tone: 'red' },
  cancelled: { Icon: XCircleIcon, tone: 'red' },
};

function activityIconFor(status) {
  return ACTIVITY_ICON[status] || { Icon: AlertIcon, tone: 'gray' };
}

function PatientDashboard() {
  const { user } = useAuth();
  const firstName = greetingName(user);

  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await getPatientDashboardSummary();
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

  const nextAppointment = summary?.nextAppointment;
  const stats = summary?.stats;
  const activity = summary?.recentActivity ?? [];
  const nextDate = nextAppointment ? toLocalDate(nextAppointment.appointment_date) : null;

  return (
    <div>
      <DashGreeting firstName={firstName} />

      <div className="section-card">
        <div className="section-card-header">
          <h3 className="section-card-title">Next Appointment</h3>
        </div>

        {loading ? (
          <Skeleton variant="block" height="120px" />
        ) : error ? (
          <div className="dash-empty">
            <span className="dash-empty-title">{error}</span>
          </div>
        ) : nextAppointment ? (
          <div className="next-appt-card">
            <div className="next-appt-date">
              <span className="next-appt-day">{nextDate.getDate()}</span>
              <span className="next-appt-month">{MONTH_ABBR[nextDate.getMonth()]}</span>
            </div>
            <div className="next-appt-details">
              <span className="next-appt-time">
                <ClockIcon /> {formatDateLong(nextAppointment.appointment_date)} at {formatTime12h(nextAppointment.appointment_time)}
              </span>
              <span className="next-appt-service">{nextAppointment.service?.name}</span>
              <span className="next-appt-dentist">with {nextAppointment.dentist?.name || 'Unassigned'}</span>
            </div>
            <StatusBadge status={nextAppointment.status} />
          </div>
        ) : (
          <div className="dash-empty">
            <CalendarPlusIcon />
            <span className="dash-empty-title">No upcoming appointments</span>
            <p style={{ margin: 0, fontSize: '0.82rem' }}>Book your next visit with Smile Bay in just a few clicks.</p>
            <Link to="/patient/book-appointment" className="dash-btn">
              Book an Appointment
            </Link>
          </div>
        )}
      </div>

      <div className="stat-grid">
        {loading ? (
          <Skeleton variant="stat-card" count={3} />
        ) : (
          <>
            <StatCard label="Total Visits" value={stats?.totalVisits ?? 0} icon={CheckCircleIcon} tint="blue" />
            <StatCard label="Upcoming Appointments" value={stats?.upcoming ?? 0} icon={CalendarIcon} tint="green" />
            <StatCard label="Last Visit Date" value={stats?.lastVisitDate || '—'} icon={ClockIcon} tint="amber" />
          </>
        )}
      </div>

      <div className="section-card">
        <div className="section-card-header">
          <div>
            <h3 className="section-card-title">Recent activity</h3>
            <p className="section-card-subtitle">Your last few appointment updates</p>
          </div>
        </div>

        {loading ? (
          <Skeleton variant="row" count={4} />
        ) : activity.length === 0 ? (
          <div className="dash-empty">
            <span className="dash-empty-title">No activity yet.</span>
          </div>
        ) : (
          <ul className="activity-list">
            {activity.map((entry) => {
              const { Icon, tone } = activityIconFor(entry.status);
              return (
                <li key={entry.id} className="activity-item">
                  <span className={`activity-item-icon activity-item-icon--${tone}`}>
                    <Icon />
                  </span>
                  <div className="activity-item-text">
                    <div className="activity-item-header">
                      <span className="activity-item-name">{entry.serviceName}</span>
                      <StatusBadge status={entry.status} />
                    </div>
                    {entry.note && <span className="activity-item-note">{entry.note}</span>}
                  </div>
                  <span className="activity-item-date">{entry.timestamp}</span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

export default PatientDashboard;
