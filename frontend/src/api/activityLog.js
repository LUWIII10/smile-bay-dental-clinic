import api from '../api';

// Admin-only "Activity Log" — ActivityLogController::index()'s own filters
// (role/action/search/date range), paginated the same shape every other
// admin list page already uses (UserManagementController, AllAppointments).
export async function getActivityLog({ role, action, search, dateFrom, dateTo, page, perPage } = {}) {
  const response = await api.get('/api/admin/activity-log', {
    params: {
      role: role || undefined,
      action: action || undefined,
      search: search || undefined,
      date_from: dateFrom || undefined,
      date_to: dateTo || undefined,
      page: page || undefined,
      per_page: perPage || undefined,
    },
  });
  return response.data;
}
