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

export async function createHmoProvider(payload) {
  await api.get('/sanctum/csrf-cookie');
  const response = await api.post('/api/admin/settings/hmo-providers', payload);
  return response.data.data;
}

export async function updateHmoProvider(hmoProviderId, payload) {
  await api.get('/sanctum/csrf-cookie');
  const response = await api.patch(`/api/admin/settings/hmo-providers/${hmoProviderId}`, payload);
  return response.data.data;
}

export async function toggleHmoProviderActive(hmoProviderId) {
  await api.get('/sanctum/csrf-cookie');
  const response = await api.patch(`/api/admin/settings/hmo-providers/${hmoProviderId}/toggle-active`);
  return response.data.data;
}
