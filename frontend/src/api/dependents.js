import api from '../api';

// "My Dependents" — a parent patient's minor children, managed through
// their own account (DependentController, backend). Each dependent is a
// real patient record under the hood (no login of its own), so its own
// appointments/dental-record reuse the same shapes as the patient's own.
// Add/Edit collects the same full clinical intake registration does for
// an adult patient (payment & HMO coverage, medical history, dental
// history) — see MyDependents.jsx's own wizard.

export async function getDependents() {
  const response = await api.get('/api/patient/dependents');
  return response.data.data;
}

// Shared by createDependent/updateDependent below — both send the exact
// same full-intake shape (DependentController::fieldRules()).
function toPayload(form) {
  return {
    first_name: form.first_name,
    middle_name: form.middle_name || null,
    last_name: form.last_name,
    date_of_birth: form.date_of_birth,
    sex: form.sex,
    relationship_to_parent: form.relationship_to_parent,
    patient_type: form.patient_type,
    hmo_provider_id: form.patient_type === 'hmo' ? form.hmo_provider_id : null,
    hmo_number: form.patient_type === 'hmo' ? form.hmo_number : null,
    hmo_company_name: form.patient_type === 'hmo' ? form.hmo_company_name : null,
    allergies: form.allergies || null,
    current_medications: form.current_medications || null,
    medical_conditions_notes: form.medical_conditions_notes || null,
    blood_type: form.blood_type || null,
    medical_conditions: form.medical_conditions || [],
    previous_surgeries: form.previous_surgeries || null,
    last_physical_exam: form.last_physical_exam || null,
    physician_name_specialty: form.physician_name_specialty || null,
    last_dental_visit: form.last_dental_visit || null,
    last_dental_treatment: form.last_dental_treatment || null,
    brushing_frequency: form.brushing_frequency || null,
    dental_procedures_history: form.dental_procedures_history || [],
    current_dental_symptoms: form.current_dental_symptoms || [],
    visit_reason: form.visit_reason || null,
  };
}

export async function createDependent(form) {
  await api.get('/sanctum/csrf-cookie');
  const response = await api.post('/api/patient/dependents', toPayload(form));
  return response.data.data;
}

export async function updateDependent(dependentId, form) {
  await api.get('/sanctum/csrf-cookie');
  const response = await api.put(`/api/patient/dependents/${dependentId}`, toPayload(form));
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
