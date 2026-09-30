import api from '../api';

// sort is optional — 'cancellations_desc' backs the patient-only
// Cancellations column's sort control; omitted (or any other value) keeps
// the default alphabetical-by-name order. dormant is a separate, orthogonal
// flag (not another `status` value) — see UserManagementController::index()'s
// own comment on why "Review N Patients" isn't just another status option.
export async function searchUsers({ search = '', role = '', status = '', sort = '', dormant = false, page = 1, per_page = 10 } = {}) {
  const params = Object.fromEntries(
    Object.entries({ search, role, status, sort, dormant: dormant ? 1 : '', page, per_page }).filter(([, v]) => v !== '' && v != null)
  );
  const response = await api.get('/api/admin/users', { params });
  return response.data;
}

// Backs the "N patients haven't visited in over 12 months" suggestion
// banner — same dormant criteria searchUsers({ dormant: true }) itself
// filters by, see UserManagementController::applyDormantScope().
export async function getDormantPatientCount() {
  const response = await api.get('/api/admin/users/dormant-count');
  return response.data.count;
}

export async function createStaffUser({ name, email, mobile_number, role }) {
  await api.get('/sanctum/csrf-cookie');
  const response = await api.post('/api/admin/users', { name, email, mobile_number, role });
  return response.data; // { data: user, temporary_password }
}

export async function updateUser(userId, payload) {
  await api.get('/sanctum/csrf-cookie');
  const response = await api.patch(`/api/admin/users/${userId}`, payload);
  return response.data.data;
}

export async function setUserStatus(userId, status) {
  await api.get('/sanctum/csrf-cookie');
  const response = await api.patch(`/api/admin/users/${userId}/status`, { status });
  return response.data.data;
}

// Lifts the automatic 3-strike booking restriction (CancellationPolicyService)
// — the only way it's ever removed. Separate from setUserStatus() above:
// this only affects self-service booking eligibility, never login access.
export async function unrestrictBooking(userId) {
  await api.get('/sanctum/csrf-cookie');
  const response = await api.patch(`/api/admin/users/${userId}/unrestrict-booking`);
  return response.data.data;
}

// Archiving is always a deliberate admin action — reason is optional, kept
// only for admin's own future reference (shown on the Archived filter).
export async function archivePatient(userId, reason) {
  await api.get('/sanctum/csrf-cookie');
  const response = await api.patch(`/api/admin/users/${userId}/archive`, { reason: reason || null });
  return response.data.data;
}

// No confirmation needed on the frontend for this one — nothing risky to
// weigh, it only ever moves a patient back into the default list. The same
// thing also happens automatically the moment they book a new appointment.
export async function restorePatient(userId) {
  await api.get('/sanctum/csrf-cookie');
  const response = await api.patch(`/api/admin/users/${userId}/restore`);
  return response.data.data;
}

// Fallback for when the account holder can't get in any other way (e.g. a
// staff account's one-time temporary password was lost before it was ever
// copied down). Same response shape as createStaffUser() — { data,
// temporary_password } — shown once via the same credentials modal.
export async function resetUserPassword(userId) {
  await api.get('/sanctum/csrf-cookie');
  const response = await api.patch(`/api/admin/users/${userId}/reset-password`);
  return response.data;
}
