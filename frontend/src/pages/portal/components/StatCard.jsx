// White card, muted label, large navy number, optional icon in a tinted
// circle — the one stat-card pattern reused across all four dashboards.
function StatCard({ label, value, icon: Icon, tint = 'blue', highlight = false }) {
  return (
    <div className={`stat-card${highlight ? ' stat-card--highlight' : ''}`}>
      <div className="stat-card-text">
        <span className="stat-card-label">{label}</span>
        <span className="stat-card-value">{value}</span>
      </div>
      {Icon && (
        <span className={`stat-card-icon stat-card-icon--${tint}`}>
          <Icon />
        </span>
      )}
    </div>
  );
}

export default StatCard;
