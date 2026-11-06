import api from '../api';
import { downloadFile } from '../utils/downloadFile';

export async function getBackupOverview() {
  const response = await api.get('/api/admin/backups');
  return response.data.data; // { settings, history, staleness }
}

export async function updateBackupFrequency(frequency) {
  await api.get('/sanctum/csrf-cookie');
  const response = await api.put('/api/admin/backups/settings', { frequency });
  return response.data.data;
}

// Runs the dump synchronously on the backend (BackupController::store()) —
// the request stays open until it finishes, same as any other "generate a
// document now" action in this app (e.g. downloadPatientRecordPdf()).
export async function triggerManualBackup() {
  await api.get('/sanctum/csrf-cookie');
  const response = await api.post('/api/admin/backups');
  return response.data; // { data: backup, history }
}

export async function downloadBackup(backupId, filename) {
  await downloadFile(`/api/admin/backups/${backupId}/download`, {}, filename || 'backup.sql');
}

export async function deleteBackup(backupId) {
  await api.get('/sanctum/csrf-cookie');
  const response = await api.delete(`/api/admin/backups/${backupId}`);
  return response.data.data;
}
