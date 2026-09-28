import api from '../api';
import { downloadFile } from '../utils/downloadFile';

// Staff-facing "Patient Records" — search/list is shared by
// dentist/dental_assistant/admin; every write action below is dentist-only
// (enforced server-side by routes/api.php's role:dentist group).

export async function searchPatientRecords({ search = '', page = 1, per_page = 10 } = {}) {
  const params = Object.fromEntries(Object.entries({ search, page, per_page }).filter(([, v]) => v !== '' && v != null));
  const response = await api.get('/api/patient-records', { params });
  return response.data;
}

export async function getPatientRecord(patientId) {
  const response = await api.get(`/api/patient-records/${patientId}`);
  return response.data.data;
}

// Every non-cancelled appointment on one specific date, across all
// patients — powers the "print who's scheduled this day" report. Read-only,
// no CSRF cookie needed (matches searchPatientRecords/getPatientRecord above).
export async function getAppointmentsByDate(date) {
  const response = await api.get('/api/patient-records/by-date', { params: { date } });
  return response.data.data;
}

export async function downloadAppointmentsByDatePdf(date) {
  await downloadFile('/api/patient-records/by-date/pdf', { date }, `patient-appointments-${date}.pdf`);
}

export async function downloadPatientRecordPdf(patientId, { date_from, date_to } = {}) {
  const params = Object.fromEntries(Object.entries({ date_from, date_to }).filter(([, v]) => v));
  await downloadFile(`/api/patient-records/${patientId}/pdf`, params, 'dental-record.pdf');
}

export async function addClinicalNote(patientId, note, appointmentId = null) {
  await api.get('/sanctum/csrf-cookie');
  const response = await api.post(`/api/patient-records/${patientId}/clinical-notes`, {
    note,
    appointment_id: appointmentId,
  });
  return response.data.data;
}

export async function setToothCondition(patientId, toothNumber, condition, notes = '') {
  await api.get('/sanctum/csrf-cookie');
  const response = await api.put(`/api/patient-records/${patientId}/tooth-conditions/${toothNumber}`, {
    condition,
    notes: notes || null,
  });
  return response.data.data;
}

export async function createTreatmentPlan(patientId, { title, description, target_date, items }) {
  await api.get('/sanctum/csrf-cookie');
  const response = await api.post(`/api/patient-records/${patientId}/treatment-plans`, {
    title,
    description: description || null,
    target_date: target_date || null,
    items: items || [],
  });
  return response.data.data;
}

export async function updateTreatmentPlanStatus(planId, status) {
  await api.get('/sanctum/csrf-cookie');
  const response = await api.patch(`/api/treatment-plans/${planId}/status`, { status });
  return response.data.data;
}

export async function updateTreatmentPlanItemStatus(itemId, status) {
  await api.get('/sanctum/csrf-cookie');
  const response = await api.patch(`/api/treatment-plan-items/${itemId}`, { status });
  return response.data.data;
}

export async function addTreatmentHistory(patientId, { procedure_name, tooth_number, performed_at, notes }) {
  await api.get('/sanctum/csrf-cookie');
  const response = await api.post(`/api/patient-records/${patientId}/treatment-history`, {
    procedure_name,
    tooth_number: tooth_number || null,
    performed_at: performed_at || null,
    notes: notes || null,
  });
  return response.data.data;
}

export async function setPrimaryDentist(patientId, dentistId) {
  await api.get('/sanctum/csrf-cookie');
  const response = await api.patch(`/api/patient-records/${patientId}/primary-dentist`, { dentist_id: dentistId });
  return response.data.data;
}
