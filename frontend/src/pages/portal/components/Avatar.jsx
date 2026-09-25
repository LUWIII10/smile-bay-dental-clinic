import { getAvatarUrl } from '../avatarUtils';

// Extracted from PortalLayout.jsx so AvatarMenu.jsx (the topbar's clickable
// version) can render the exact same avatar the sidebar footer already
// does, instead of duplicating the photo/initials fallback logic.
function getInitials(name) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] || '';
  const last = parts.length > 1 ? parts[parts.length - 1][0] : '';
  return (first + last).toUpperCase();
}

function Avatar({ user, small }) {
  const photoUrl = getAvatarUrl(user);
  return (
    <span className={`portal-avatar${small ? ' portal-avatar--sm' : ''}`}>
      {photoUrl ? <img src={photoUrl} alt="" className="portal-avatar-img" /> : getInitials(user?.name)}
    </span>
  );
}

export default Avatar;
