import { Link } from 'react-router-dom';

// White card, muted label, large navy number, optional icon in a tinted
// circle — the one stat-card pattern reused across all four dashboards.
// Optional `to` renders the card as a nav Link instead of a plain div (e.g.
// Admin/Assistant's "Pending Verifications" card jumping straight to the
// HMO queue) — every other card omits `to` and keeps its original
// non-interactive div output unchanged.
function StatCard({ label, value, subtitle, icon: Icon, tint = 'blue', highlight = false, to, state }) {
  const className = `stat-card${highlight ? ' stat-card--highlight' : ''}${to ? ' stat-card--clickable' : ''}`;
  const Wrapper = to ? Link : 'div';
  // state only ever paired with `to` (e.g. Restricted Accounts handing
  // User Management its starting filters) — passed straight through to
  // Link, read on the other end via useLocation().state same as every
  // other nav-with-context handoff in the app (DentistSchedule.jsx etc.).
  const wrapperProps = to ? { to, ...(state ? { state } : {}) } : {};

  return (
    <Wrapper className={className} {...wrapperProps}>
      <div className="stat-card-text">
        <span className="stat-card-label">{label}</span>
        <span className="stat-card-value">{value}</span>
        {subtitle && <span className={`stat-card-subtitle stat-card-subtitle--${tint}`}>{subtitle}</span>}
      </div>
      {Icon && (
        <span className={`stat-card-icon stat-card-icon--${tint}`}>
          <Icon />
        </span>
      )}
    </Wrapper>
  );
}

export default StatCard;
