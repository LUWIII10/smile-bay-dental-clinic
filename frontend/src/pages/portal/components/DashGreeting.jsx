import { ToothIcon } from '../icons';

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

function formatToday() {
  return new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

function DashGreeting({ firstName }) {
  return (
    <div className="dash-greeting">
      <span className="dash-greeting-decoration" aria-hidden="true">
        <ToothIcon />
      </span>
      <h2>{getGreeting()}, {firstName}</h2>
      <p>{formatToday()}</p>
    </div>
  );
}

export default DashGreeting;
