import api from '../api';

export async function getClinicSettings() {
  const response = await api.get('/api/admin/settings');
  return response.data.data; // { clinic_info, schedules, services, hmo_providers }
}

export async function updateClinicInfo(payload) {
  await api.get('/sanctum/csrf-cookie');
  const response = await api.put('/api/admin/settings/clinic-info', payload);
  return response.data.data;
}

export async function updateSchedule(days) {
  await api.get('/sanctum/csrf-cookie');
  const response = await api.put('/api/admin/settings/schedule', { days });
  return response.data.data;
}

export async function createService(payload) {
  await api.get('/sanctum/csrf-cookie');
  const response = await api.post('/api/admin/settings/services', payload);
  return response.data.data;
}

export async function updateService(serviceId, payload) {
  await api.get('/sanctum/csrf-cookie');
  const response = await api.patch(`/api/admin/settings/services/${serviceId}`, payload);
  return response.data.data;
}

export async function toggleServiceActive(serviceId) {
  await api.get('/sanctum/csrf-cookie');
  const response = await api.patch(`/api/admin/settings/services/${serviceId}/toggle-active`);
  return response.data.data;
}

// payload.logo, when present, is a File from the modal's file input — sent
// as multipart so the backend can store it (ClinicSettingsController::
// storeHmoProvider()); a plain JSON body otherwise. Sending FormData either
// way (even with no file appended) works too, but this skips the encoding
// entirely for the common no-logo case.
function hmoProviderFormData({ name, logo }) {
  const formData = new FormData();
  formData.append('name', name);
  if (logo) formData.append('logo', logo);
  return formData;
}

export async function createHmoProvider(payload) {
  await api.get('/sanctum/csrf-cookie');
  const body = payload.logo ? hmoProviderFormData(payload) : { name: payload.name };
  const response = await api.post('/api/admin/settings/hmo-providers', body);
  return response.data.data;
}

export async function updateHmoProvider(hmoProviderId, payload) {
  await api.get('/sanctum/csrf-cookie');
  if (payload.logo) {
    // PHP never parses a multipart body on PATCH — Laravel's documented
    // workaround is a POST carrying _method=PATCH, to the same URL
    // (same pattern the framework expects for any file-upload update).
    const formData = hmoProviderFormData(payload);
    formData.append('_method', 'PATCH');
    const response = await api.post(`/api/admin/settings/hmo-providers/${hmoProviderId}`, formData);
    return response.data.data;
  }
  // No file either way here — removeLogo is a plain boolean flag, no need
  // for the multipart/_method=PATCH workaround above.
  const response = await api.patch(`/api/admin/settings/hmo-providers/${hmoProviderId}`, {
    name: payload.name,
    remove_logo: payload.removeLogo || undefined,
  });
  return response.data.data;
}

export async function toggleHmoProviderActive(hmoProviderId) {
  await api.get('/sanctum/csrf-cookie');
  const response = await api.patch(`/api/admin/settings/hmo-providers/${hmoProviderId}/toggle-active`);
  return response.data.data;
}

// A true hard delete — only succeeds when no patient is registered under
// this provider (ClinicSettingsController::destroyHmoProvider() returns 409
// otherwise). Settings.jsx disables the Remove button up front using each
// provider's patients_count, so this call is really only reachable for a
// provider that's genuinely unused.
export async function deleteHmoProvider(hmoProviderId) {
  await api.get('/sanctum/csrf-cookie');
  const response = await api.delete(`/api/admin/settings/hmo-providers/${hmoProviderId}`);
  return response.data.data;
}

// month: 'YYYY-MM'. Returns { 'YYYY-MM-DD': { appointment_count, closed } }
// for every day in that month — what the "Add Closure Date" calendar colors
// each cell by. Not per-dentist/service slot availability (there's no
// single dentist here, it's clinic-wide) — just whether that date already
// has bookings, so the admin can see upfront which dates will trigger the
// reschedule-first flow.
export async function getClosureDaySummary(month) {
  const response = await api.get('/api/admin/settings/clinic-closures/day-summary', { params: { month } });
  return response.data.data;
}

// Returns { conflicts: boolean, conflicting_appointments?: [...], closures?: [...] }.
// conflicts: true means nothing was saved — conflicting_appointments is the
// list for the "Reschedule affected patients first" modal. Calling this
// again (same date/reason) after each one is individually rescheduled is
// what actually creates the closure once the list comes back empty.
export async function addClinicClosure({ date, reason }) {
  await api.get('/sanctum/csrf-cookie');
  const response = await api.post('/api/admin/settings/clinic-closures', { date, reason: reason || null });
  return response.data;
}

// Read-only — refreshes the conflict list after a row gets rescheduled,
// without the create-when-empty side effect addClinicClosure() has.
export async function getClosureConflicts(date) {
  const response = await api.get('/api/admin/settings/clinic-closures/conflicts', { params: { date } });
  return response.data.data;
}

export async function deleteClinicClosure(closureId) {
  await api.get('/sanctum/csrf-cookie');
  const response = await api.delete(`/api/admin/settings/clinic-closures/${closureId}`);
  return response.data.data;
}

// The inverse of addClinicClosure() above — opens one specific date
// OUTSIDE the regular weekly Operating Hours (e.g. a single extra Sunday)
// instead of closing a normally-open one. No conflict check needed:
// opening a date can never strand an existing appointment.
export async function addSpecialHour({ date, openTime, closeTime, reason }) {
  await api.get('/sanctum/csrf-cookie');
  const response = await api.post('/api/admin/settings/special-hours', {
    date, open_time: openTime, close_time: closeTime, reason: reason || null,
  });
  return response.data.data;
}

export async function deleteSpecialHour(specialHourId) {
  await api.get('/sanctum/csrf-cookie');
  const response = await api.delete(`/api/admin/settings/special-hours/${specialHourId}`);
  return response.data.data;
}
