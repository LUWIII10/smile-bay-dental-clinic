// Dentists' photo lives on dentist_profiles.photo_path (already rendered on
// the public booking/appointment screens); every other role has no
// equivalent column there, so they get users.avatar_path instead. Shared by
// PortalLayout (sidebar/topbar) and MyProfile (the upload form's preview).
export function getAvatarUrl(user) {
  if (!user) return null;
  return user.role === 'dentist' ? user.dentist_profile?.photo_path || null : user.avatar_path || null;
}
