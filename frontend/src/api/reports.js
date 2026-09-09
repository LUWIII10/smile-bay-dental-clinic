import api from '../api';

export async function getReportsOverview({ date_from, date_to } = {}) {
  const params = Object.fromEntries(Object.entries({ date_from, date_to }).filter(([, v]) => v));
  const response = await api.get('/api/admin/reports/overview', { params });
  return response.data.data;
}
