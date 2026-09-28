import api from '../api';
import { downloadFile } from '../utils/downloadFile';

export async function getReportsOverview({ date_from, date_to } = {}) {
  const params = Object.fromEntries(Object.entries({ date_from, date_to }).filter(([, v]) => v));
  const response = await api.get('/api/admin/reports/overview', { params });
  return response.data.data;
}

export async function downloadReportsPdf({ date_from, date_to } = {}) {
  const params = Object.fromEntries(Object.entries({ date_from, date_to }).filter(([, v]) => v));
  await downloadFile('/api/admin/reports/overview/pdf', params, 'clinic-operations-report.pdf');
}
