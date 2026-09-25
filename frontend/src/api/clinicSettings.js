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
  const response = await api.patch(`/api/admin/settings/hmo-providers/${hmoProviderId}`, { name: payload.name });
  return response.data.data;
}

export async function toggleHmoProviderActive(hmoProviderId) {
  await api.get('/sanctum/csrf-cookie');
  const response = await api.patch(`/api/admin/settings/hmo-providers/${hmoProviderId}/toggle-active`);
  return response.data.data;
}
