import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useSimulatedLoad } from '../../hooks/useSimulatedLoad';
import DashGreeting from './components/DashGreeting';
import StatCard from './components/StatCard';
import StatusBadge from './components/StatusBadge';
import Skeleton from './components/Skeleton';
import { CalendarIcon, ClockIcon, CheckCircleIcon, CalendarPlusIcon } from './icons';
import { PATIENT_MOCK } from './mockData';
import './dashboards.css';

function PatientDashboard() {
  const { user } = useAuth();
  const loading = useSimulatedLoad();
  const firstName = user?.name?.split(' ')[0] || 'there';
  const { nextAppointment, stats, activity } = PATIENT_MOCK;

  return (
    <div>
      <DashGreeting firstName={firstName} />

      <div className="section-card">
        <div className="section-card-header">
          <h3 className="section-card-title">Next Appointment</h3>
        </div>

        {loading ? (
          <Skeleton variant="block" height="120px" />
        ) : nextAppointment ? (
          <div className="next-appt-card">
            <div className="next-appt-date">
              <span className="next-appt-day">{nextAppointment.date.split(' ')[1]?.replace(',', '')}</span>
              <span className="next-appt-month">{nextAppointment.date.split(' ')[0]}</span>
            </div>
            <div className="next-appt-details">
              <span className="next-appt-time">
                <ClockIcon /> {nextAppointment.time}
              </span>
              <span className="next-appt-service">{nextAppointment.service}</span>
              <span className="next-appt-dentist">with {nextAppointment.dentist}</span>
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
            <StatCard label="Total Visits" value={stats.totalVisits} icon={CheckCircleIcon} tint="blue" />
            <StatCard label="Upcoming Appointments" value={stats.upcoming} icon={CalendarIcon} tint="green" />
            <StatCard label="Last Visit Date" value={stats.lastVisit} icon={ClockIcon} tint="amber" />
          </>
        )}
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
                  <span className="activity-item-date">{entry.date}</span>
                </div>
                <StatusBadge status={entry.status} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export default PatientDashboard;
