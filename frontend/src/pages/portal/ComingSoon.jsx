import { useLocation } from 'react-router-dom';
import { NAV_CONFIG } from './navConfig';
import { useAuth } from '../../context/AuthContext';
import './dashboards.css';

// Placeholder for the nav destinations this pass doesn't build content for
// (only the four dashboards were in scope). Keeps every sidebar link
// genuinely navigable instead of a dead link while those pages are pending.
function ComingSoon() {
  const { role } = useAuth();
  const location = useLocation();
  const item = (NAV_CONFIG[role] || []).find((entry) => entry.path === location.pathname);

  return (
    <div className="section-card">
      <h3 className="section-card-title" style={{ marginBottom: 8 }}>
        {item ? item.label : 'Coming Soon'}
      </h3>
      <p style={{ margin: 0, color: 'var(--portal-muted)', fontSize: '0.85rem' }}>
        This section is not built yet — only the role dashboards were in scope for this pass.
      </p>
    </div>
  );
}

export default ComingSoon;
