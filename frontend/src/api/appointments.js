import api from '../api';

// Thin request wrappers for the appointment-scheduling module. Kept as
// plain functions (not a Context, unlike auth) since nothing here is
// cross-cutting app state — each page just needs to fetch/submit its own
// data. CSRF cookie + error normalization follow the same pattern as
// AuthContext.jsx.

export async function getServices() {
  const response = await api.get('/api/services');
  return response.data.data;
}

// serviceId is optional — when given, only dentists credentialed for that
// service come back (e.g. only the pediatric dentist for the pediatric
// service). Omit it for the full unfiltered list.
export async function getDentists(serviceId) {
  const response = await api.get('/api/dentists', {
    params: serviceId ? { service_id: serviceId } : {},
  });
  return response.data.data;
}

export async function getAvailableSlots(dentistId, serviceId, date) {
  const response = await api.get('/api/schedules/available-slots', {
    params: { dentist_id: dentistId, service_id: serviceId, date },
  });
  return response.data.data;
}

// month: 'YYYY-MM'. Returns { 'YYYY-MM-DD': 'available'|'limited'|'full'|'unavailable', ... }
// for every day in that month — what the calendar colors each cell by.
export async function getDayAvailability(dentistId, serviceId, month) {
  const response = await api.get('/api/schedules/day-availability', {
    params: { dentist_id: dentistId, service_id: serviceId, month },
  });
  return response.data.data;
}

export async function createAppointment({ dentistId, serviceId, date, time }) {
  await api.get('/sanctum/csrf-cookie');
  const response = await api.post('/api/appointments', {
    dentist_id: dentistId,
    service_id: serviceId,
    appointment_date: date,
    appointment_time: time,
  });
  return response.data;
}

export async function getPatientAppointments() {
  const response = await api.get('/api/patient/appointments');
  return response.data.data;
}

export async function cancelAppointment(appointmentId, reason) {
  await api.get('/sanctum/csrf-cookie');
  const response = await api.patch(`/api/patient/appointments/${appointmentId}/cancel`, { reason });
  return response.data;
}

export async function getDentistSchedule() {
  const response = await api.get('/api/dentist/schedule');
  return response.data.data;
}

export async function getDentistDashboardSummary() {
  const response = await api.get('/api/dentist/dashboard-summary');
  return response.data.data;
}

export async function getCompletedPatients() {
  const response = await api.get('/api/dentist/completed-patients');
  return response.data.data;
}

export async function completeAppointment(appointmentId, { procedureName, toothNumber, performedAt, notes }) {
  await api.get('/sanctum/csrf-cookie');
  const response = await api.patch(`/api/appointments/${appointmentId}/complete`, {
    procedure_name: procedureName,
    tooth_number: toothNumber || null,
    performed_at: performedAt,
    notes,
  });
  return response.data;
}

export async function rescheduleAppointment(appointmentId, date, time) {
  await api.get('/sanctum/csrf-cookie');
  const response = await api.patch(`/api/appointments/${appointmentId}/reschedule`, {
    appointment_date: date,
    appointment_time: time,
  });
  return response.data;
}

export async function cancelAppointmentAsDentist(appointmentId, reason) {
  await api.get('/sanctum/csrf-cookie');
  const response = await api.patch(`/api/appointments/${appointmentId}/cancel`, { reason });
  return response.data;
}

export async function getDentistAvailability() {
  const response = await api.get('/api/dentist/availability');
  return response.data.data;
}

// confirm=true forces the save through even if the backend reports
// conflicting appointments — the first call always omits it so the caller
// can show the warning; passing hours unchanged with confirm=true resubmits
// the exact same payload that was already conflict-checked.
export async function updateDentistWeeklyHours(hours, confirm = false) {
  await api.get('/sanctum/csrf-cookie');
  const response = await api.put('/api/dentist/availability/weekly-hours', { hours, confirm });
  return response.data;
}

export async function addDentistDayOff({ date, reason }, confirm = false) {
  await api.get('/sanctum/csrf-cookie');
  const response = await api.post('/api/dentist/availability/day-off', { date, reason, confirm });
  return response.data;
}

export async function deleteDentistDayOff(dayOffId) {
  await api.get('/sanctum/csrf-cookie');
  const response = await api.delete(`/api/dentist/availability/day-off/${dayOffId}`);
  return response.data;
}

export async function getPediatricQueue() {
  const response = await api.get('/api/pediatric/queue');
  return response.data.data;
}

export async function verifyPediatricAppointment(appointmentId, action, reason) {
  await api.get('/sanctum/csrf-cookie');
  const response = await api.patch(`/api/pediatric/appointments/${appointmentId}/verify`, {
    action,
    reason,
  });
  return response.data;
}

export async function getHmoQueue() {
  const response = await api.get('/api/staff/verification-queue');
  return response.data.data;
}

export async function verifyHmoAppointment(appointmentId, action, reason) {
  await api.get('/sanctum/csrf-cookie');
  const response = await api.patch(`/api/staff/appointments/${appointmentId}/verify`, {
    action,
    reason,
  });
  return response.data;
}

// On-demand "still being verified" update — email + in-app notification,
// and persisted onto the appointment itself (hmo_status_label/_note) so the
// patient's own "My Appointments" page reflects it too, not just a one-time
// push. Only valid while the appointment is still pending_verification
// (server-side guarded); lets staff reassure a patient without waiting for
// an approve/reject decision to actually happen.
export async function sendHmoStatusUpdate(appointmentId, statusLabel, note) {
  await api.get('/sanctum/csrf-cookie');
  const response = await api.post(`/api/staff/appointments/${appointmentId}/notify-status`, {
    status_label: statusLabel,
    note,
  });
  return response.data;
}

// filters: { status, dentist_id, payment_type, date_from, date_to, search,
// sort, per_page, page } — all optional, undefined/empty values are dropped
// rather than sent as empty-string query params (avoids the backend
// treating "" as a real filter). Returns the full Laravel paginator shape
// ({ data, current_page, last_page, per_page, total, from, to, ... }), not
// just the row array — the pagination controls need those meta fields.
export async function getAllAppointments(filters = {}) {
  const params = Object.fromEntries(Object.entries(filters).filter(([, v]) => v !== '' && v != null));
  const response = await api.get('/api/staff/appointments', { params });
  return response.data;
}

// Month-scoped Total/Confirmed/Pending/Cancelled counts (+ percentages) for
// the All Appointments page header's stat-card row.
export async function getAppointmentStats() {
  const response = await api.get('/api/staff/appointments/stats');
  return response.data.data;
}

export async function getAppointmentDetail(appointmentId) {
  const response = await api.get(`/api/staff/appointments/${appointmentId}`);
  return response.data.data;
}

export async function cancelAppointmentAsStaff(appointmentId, reason) {
  await api.get('/sanctum/csrf-cookie');
  const response = await api.patch(`/api/staff/appointments/${appointmentId}/cancel`, { reason });
  return response.data;
}

export async function searchPatients(query) {
  const response = await api.get('/api/staff/patients/search', { params: { q: query } });
  return response.data.data;
}

// Front-desk registration for a walk-in with no existing Smile Bay account —
// email is optional (the backend synthesizes one from the mobile number
// when omitted, e.g. for a patient who won't self-serve the portal).
export async function registerWalkInPatient(payload) {
  await api.get('/sanctum/csrf-cookie');
  const response = await api.post('/api/staff/patients', payload);
  return response.data.data;
}

export async function assignWalkIn({ patientId, dentistId, serviceId, date, time }) {
  await api.get('/sanctum/csrf-cookie');
  const response = await api.post('/api/staff/appointments/walk-in', {
    patient_id: patientId,
    dentist_id: dentistId,
    service_id: serviceId,
    appointment_date: date,
    appointment_time: time,
  });
  return response.data;
}

export async function getStaffDashboardSummary() {
  const response = await api.get('/api/staff/dashboard-summary');
  return response.data.data;
}

export async function getRecentActivity() {
  const response = await api.get('/api/staff/recent-activity');
  return response.data.data;
}

export async function getPatientDashboardSummary() {
  const response = await api.get('/api/patient/dashboard-summary');
  return response.data.data;
}
