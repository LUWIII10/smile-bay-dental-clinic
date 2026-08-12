import { useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import BrandLogo from '../../components/common/BrandLogo';
import { NAV_CONFIG, ROLE_LABELS } from './navConfig';
import { ICONS, BellIcon, LogoutIcon, MenuIcon, CloseIcon } from './icons';
import './portalTokens.css';
import './PortalLayout.css';

function getInitials(name) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] || '';
  const last = parts.length > 1 ? parts[parts.length - 1][0] : '';
  return (first + last).toUpperCase();
}

function PortalLayout() {
  const { user, role, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [drawerOpen, setDrawerOpen] = useState(false);

  const navItems = NAV_CONFIG[role] || [];
  const activeItem = navItems.find((item) => item.path === location.pathname);
  const pageTitle = activeItem ? activeItem.label : 'Dashboard';

  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  const closeDrawer = () => setDrawerOpen(false);

  return (
    <div className="portal-shell">
      <aside className={`portal-sidebar${drawerOpen ? ' portal-sidebar--open' : ''}`}>
        <div className="portal-sidebar-header">
          <BrandLogo variant="blue" size="sm" />
        </div>

        <nav className="portal-nav">
          {navItems.map((item) => {
            const Icon = ICONS[item.icon];
            return (
              <NavLink
                key={item.path}
                to={item.path}
                onClick={closeDrawer}
                title={item.label}
                data-label={item.label}
                className={({ isActive }) => `portal-nav-item${isActive ? ' portal-nav-item--active' : ''}`}
              >
                <span className="portal-nav-icon">{Icon && <Icon />}</span>
                <span className="portal-nav-label">{item.label}</span>
              </NavLink>
            );
          })}
        </nav>

        <div className="portal-sidebar-footer">
          <div className="portal-user-summary">
            <span className="portal-avatar">{getInitials(user?.name)}</span>
            <span className="portal-user-info">
              <span className="portal-user-name">{user?.name}</span>
              <span className="portal-user-role">{ROLE_LABELS[role] || role}</span>
            </span>
          </div>
          <button type="button" className="portal-logout" onClick={handleLogout}>
            <LogoutIcon />
            <span className="portal-nav-label">Log Out</span>
          </button>
        </div>
      </aside>

      {drawerOpen && <div className="portal-backdrop" onClick={closeDrawer} />}

      <div className="portal-main">
        <header className="portal-topbar">
          <div className="portal-topbar-left">
            <button
              type="button"
              className="portal-hamburger"
              onClick={() => setDrawerOpen((v) => !v)}
              aria-label="Toggle navigation menu"
            >
              {drawerOpen ? <CloseIcon /> : <MenuIcon />}
            </button>
            <h1 className="portal-page-title">{pageTitle}</h1>
          </div>

          <div className="portal-topbar-right">
            <button type="button" className="portal-bell" aria-label="Notifications">
              <BellIcon />
              <span className="portal-bell-dot" />
            </button>
            <span className="portal-avatar portal-avatar--sm">{getInitials(user?.name)}</span>
          </div>
        </header>

        <main className="portal-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

export default PortalLayout;
