import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import Avatar from './Avatar';
import { UserIcon, LogoutIcon } from '../icons';
import { NAV_CONFIG, ROLE_LABELS } from '../navConfig';

// Same portal + fixed-position + outside-click/scroll/resize dismiss
// pattern as NotificationBell.jsx, right next to it in the topbar. Reads
// "My Profile" 's own path out of NAV_CONFIG instead of hardcoding a
// per-role map, so this stays correct automatically if a role's profile
// route ever moves — and just omits the link for a role that has none yet
// (admin, currently) rather than pointing at a page that doesn't exist.
function AvatarMenu({ user, role, onLogout }) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState(null);
  const triggerRef = useRef(null);
  const dropdownRef = useRef(null);

  const profilePath = (NAV_CONFIG[role] || []).find((item) => item.label === 'My Profile')?.path;

  const openMenu = () => {
    const rect = triggerRef.current.getBoundingClientRect();
    setPosition({ top: rect.bottom + 10, right: window.innerWidth - rect.right });
    setOpen(true);
  };

  useEffect(() => {
    if (!open) return undefined;

    const handleClickOutside = (e) => {
      if (
        triggerRef.current && !triggerRef.current.contains(e.target) &&
        dropdownRef.current && !dropdownRef.current.contains(e.target)
      ) {
        setOpen(false);
      }
    };
    const handleDismiss = () => setOpen(false);

    document.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('scroll', handleDismiss, true);
    window.addEventListener('resize', handleDismiss);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('scroll', handleDismiss, true);
      window.removeEventListener('resize', handleDismiss);
    };
  }, [open]);

  return (
    <div className="avatar-menu">
      <button
        ref={triggerRef}
        type="button"
        className="avatar-menu-trigger"
        aria-label="Account menu"
        aria-expanded={open}
        onClick={() => (open ? setOpen(false) : openMenu())}
      >
        <Avatar user={user} small />
      </button>

      {open && position && createPortal(
        <div ref={dropdownRef} className="avatar-menu-panel" style={{ top: position.top, right: position.right }}>
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
