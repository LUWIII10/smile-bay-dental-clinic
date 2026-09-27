import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import Avatar from './Avatar';
import { UserIcon, LogoutIcon } from '../icons';
import { NAV_CONFIG, ROLE_LABELS } from '../navConfig';
import { useDropdownPosition } from '../../../hooks/useDropdownPosition';

// Same portal + fixed-position + outside-click/scroll/resize dismiss
// pattern as NotificationBell.jsx, right next to it in the topbar. Reads
// "My Profile" 's own path out of NAV_CONFIG instead of hardcoding a
// per-role map, so this stays correct automatically if a role's profile
// route ever moves — and just omits the link for a role that has none yet
// (admin, currently) rather than pointing at a page that doesn't exist.
function AvatarMenu({ user, role, onLogout }) {
  const { open, setOpen, position, triggerRef, dropdownRef, toggle } = useDropdownPosition();

  const profilePath = (NAV_CONFIG[role] || []).find((item) => item.label === 'My Profile')?.path;

  return (
    <div className="avatar-menu">
      <button
        ref={triggerRef}
        type="button"
        className="avatar-menu-trigger"
        aria-label="Account menu"
        aria-expanded={open}
        onClick={toggle}
      >
        <Avatar user={user} small />
      </button>

      {open && position && createPortal(
        <div
          ref={dropdownRef}
          className="avatar-menu-panel"
          style={{ top: position.top, left: position.left, right: position.right }}
        >
          <div className="avatar-menu-header">
            <Avatar user={user} />
            <span className="portal-user-info">
              <span className="portal-user-name">{user?.name}</span>
              <span className="portal-user-role">{ROLE_LABELS[role] || role}</span>
            </span>
          </div>

          {profilePath && (
            <Link to={profilePath} className="avatar-menu-item" onClick={() => setOpen(false)}>
              <UserIcon /> My Profile
            </Link>
          )}

          <button
            type="button"
            className="avatar-menu-item avatar-menu-item--danger"
            onClick={() => {
              setOpen(false);
              onLogout();
            }}
          >
            <LogoutIcon /> Log Out
          </button>
        </div>,
        document.body
      )}
    </div>
  );
}

export default AvatarMenu;
