import api from '../api';

// Every role, no role: gate on the backend — scoped to the authenticated
// user inside the controller. Returns the 20 most recent + the true unread
// count (not just unread among the 20 returned).
export async function getNotifications() {
  const response = await api.get('/api/notifications');
  return response.data;
}

export async function markNotificationRead(id) {
  await api.get('/sanctum/csrf-cookie');
  const response = await api.patch(`/api/notifications/${id}/read`);
  return response.data;
}

export async function markAllNotificationsRead() {
  await api.get('/sanctum/csrf-cookie');
  const response = await api.post('/api/notifications/read-all');
  return response.data;
}
