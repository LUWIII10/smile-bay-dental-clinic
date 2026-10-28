import api from '../api';

// Both reachable before login — the landing page's own data, not tied to
// any authenticated session. No csrf-cookie needed (plain GETs).

export async function getPublicClinicInfo() {
  const response = await api.get('/api/clinic-info');
  return response.data.data;
}

export async function getPublicDentists() {
  const response = await api.get('/api/dentists/public');
  return response.data.data;
}
