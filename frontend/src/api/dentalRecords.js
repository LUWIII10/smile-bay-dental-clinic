import api from '../api';

// The logged-in patient's own dental_records row (tooth chart, clinical
// notes, treatment plans/items, treatment history) — lazily provisioned
// server-side on first call if one doesn't exist yet.
export async function getMyDentalRecord() {
  const response = await api.get('/api/patient/dental-record');
  return response.data.data;
}
