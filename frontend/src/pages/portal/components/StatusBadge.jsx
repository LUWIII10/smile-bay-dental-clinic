// Pill-shaped status badge — the one semantic-color mapping shared by every
// appointment/verification list across all four dashboards.
const STATUS_TONE = {
  confirmed: 'green',
  completed: 'green',
  active: 'green',
  pending: 'amber',
  'pending verification': 'amber',
  cancelled: 'red',
  'in-progress': 'blue',
  'in progress': 'blue',
};

function StatusBadge({ status, tone }) {
  const resolvedTone = tone || STATUS_TONE[String(status).toLowerCase()] || 'blue';
  return <span className={`status-badge status-badge--${resolvedTone}`}>{status}</span>;
}

export default StatusBadge;
