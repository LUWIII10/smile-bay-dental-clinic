import api from '../api';

// sort is optional — 'cancellations_desc' backs the patient-only
// Cancellations column's sort control; omitted (or any other value) keeps
// the default alphabetical-by-name order.
export async function searchUsers({ search = '', role = '', status = '', sort = '', page = 1, per_page = 10 } = {}) {
  const params = Object.fromEntries(
    Object.entries({ search, role, status, sort, page, per_page }).filter(([, v]) => v !== '' && v != null)
  );
  const response = await api.get('/api/admin/users', { params });
  return response.data;
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
