import { API_BASE_URL } from '../../api';

// ProfileController::uploadAvatar() stores a site-relative path
// ("/storage/avatars/...") on purpose, so it isn't baked to one
// environment's origin — correct on Railway, where the frontend and
// backend share one origin, but on Hostinger's split-domain setup the
// page itself is served from smile-baydentalclinic.online while the file
// actually lives on api.smile-baydentalclinic.online, so a bare relative
// path 404s. Prepending the same API origin api.js's axios instance
// already uses fixes both: it's a no-op on Railway (API_BASE_URL is just
// window.location.origin there) and resolves correctly on Hostinger. A
// seeded photo can already be a full external URL (e.g. the pediatric
// dentist's Unsplash photo) — left untouched, only a relative path gets
// prefixed. Used for both users.avatar_path and dentist_profiles.photo_path
// wherever either is rendered directly (BookAppointment, BookFollowUp,
// AppointmentDetailModal), not just through getAvatarUrl below.
export function resolvePhotoUrl(path) {
  if (!path) return null;
  return path.startsWith('/') ? `${API_BASE_URL}${path}` : path;
}

// Dentists' photo lives on dentist_profiles.photo_path (already rendered on
// the public booking/appointment screens); every other role has no
// equivalent column there, so they get users.avatar_path instead. Shared by
// PortalLayout (sidebar/topbar) and MyProfile (the upload form's preview).
export function getAvatarUrl(user) {
  if (!user) return null;
  const path = user.role === 'dentist' ? user.dentist_profile?.photo_path || null : user.avatar_path || null;
  return resolvePhotoUrl(path);
}
