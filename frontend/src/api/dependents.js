import api from '../api';

// "My Dependents" — a parent patient's minor children, managed through
// their own account (DependentController, backend). Each dependent is a
// real patient record under the hood (no login of its own), so its own
// appointments/dental-record reuse the same shapes as the patient's own.

export async function getDependents() {
  const response = await api.get('/api/patient/dependents');
  return response.data.data;
}

export async function createDependent({ firstName, middleName, lastName, dateOfBirth, sex, relationshipToParent }) {
  await api.get('/sanctum/csrf-cookie');
  const response = await api.post('/api/patient/dependents', {
    first_name: firstName,
    middle_name: middleName || null,
    last_name: lastName,
    date_of_birth: dateOfBirth,
    sex,
    relationship_to_parent: relationshipToParent,
  });
  return response.data.data;
}

export async function updateDependent(dependentId, { firstName, middleName, lastName, dateOfBirth, sex, relationshipToParent }) {
  await api.get('/sanctum/csrf-cookie');
  const response = await api.put(`/api/patient/dependents/${dependentId}`, {
    first_name: firstName,
    middle_name: middleName || null,
    last_name: lastName,
    date_of_birth: dateOfBirth,
    sex,
    relationship_to_parent: relationshipToParent,
  });
  return response.data.data;
}

export async function deleteDependent(dependentId) {
  await api.get('/sanctum/csrf-cookie');
  const response = await api.delete(`/api/patient/dependents/${dependentId}`);
  return response.data;
}

// Same shape PatientDentalRecordController::show() returns for the
// patient's own "My Dental Records" page — just scoped to this dependent.
export async function getDependentDentalRecord(dependentId) {
  const response = await api.get(`/api/patient/dependents/${dependentId}/dental-record`);
  return response.data.data;
}
