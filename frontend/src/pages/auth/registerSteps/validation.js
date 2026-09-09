const MOBILE_REGEX = /^(09\d{9}|\+639\d{9})$/;
export const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_REGEX = /^[0-9+\-\s]{7,20}$/;
const NAME_REGEX = /^[a-zA-ZÀ-ſ .'-]{1,100}$/;


// Whole-years-only age check (no need-for-precision here — this only
// gates whether the guardian section shows up, not anything server-side
// enforces). Returns false for an empty/invalid date rather than
// throwing, since this runs on every keystroke of Step 1 before the field
// is necessarily valid yet.
export function isMinor(dateOfBirth) {
  if (!dateOfBirth) return false;
  const dob = new Date(dateOfBirth);
  if (Number.isNaN(dob.getTime())) return false;

  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  const hasHadBirthdayThisYear =
    today.getMonth() > dob.getMonth() || (today.getMonth() === dob.getMonth() && today.getDate() >= dob.getDate());
  if (!hasHadBirthdayThisYear) age -= 1;

  return age < 18;
}

export function passwordChecklist(password) {
  return {
    length: password.length >= 8,
    upper: /[A-Z]/.test(password),
    number: /\d/.test(password),
    special: /[^A-Za-z0-9]/.test(password),
  };
}

// Which step owns each backend field — used to jump back to the right
// step and show the message there when the server rejects a field.
export const STEP_OF_FIELD = {
  first_name: 1,
  middle_name: 1,
  last_name: 1,
  date_of_birth: 1,
  sex: 1,
  mobile_number: 1,
  civil_status: 1,
  nationality: 1,
  religion: 1,
  occupation: 1,
  email: 2,
  password: 2,
  password_confirmation: 2,
  complete_address: 2,
  emergency_contact_name: 2,
  emergency_contact_relationship: 2,
  emergency_contact_number: 2,
  guardian_name: 2,
  guardian_relationship: 2,
  guardian_contact_number: 2,
  patient_type: 3,
  hmo_provider_id: 3,
  hmo_number: 3,
  hmo_company_name: 3,
  allergies: 4,
  current_medications: 4,
  medical_conditions_notes: 4,
  blood_type: 4,
  medical_conditions: 4,
  previous_surgeries: 4,
  last_physical_exam: 4,
  physician_name_specialty: 4,
  last_dental_visit: 5,
  last_dental_treatment: 5,
  brushing_frequency: 5,
  dental_procedures_history: 5,
  current_dental_symptoms: 5,
  visit_reason: 5,
  agree_terms: 6,
};

export function validateStep1(values) {
  const errors = {};

  if (!values.first_name.trim()) errors.first_name = 'First name is required.';
  else if (!NAME_REGEX.test(values.first_name.trim())) errors.first_name = 'Enter a valid first name.';

  if (values.middle_name.trim() && !NAME_REGEX.test(values.middle_name.trim())) {
    errors.middle_name = 'Enter a valid middle name.';
  }

  if (!values.last_name.trim()) errors.last_name = 'Last name is required.';
  else if (!NAME_REGEX.test(values.last_name.trim())) errors.last_name = 'Enter a valid last name.';

  if (!values.date_of_birth) {
    errors.date_of_birth = 'Date of birth is required.';
  } else if (new Date(values.date_of_birth) >= new Date(new Date().toDateString())) {
    errors.date_of_birth = 'Date of birth must be in the past.';
  }

  if (!values.sex) errors.sex = 'Please select sex.';

  if (!values.mobile_number.trim()) {
    errors.mobile_number = 'Mobile number is required.';
  } else if (!MOBILE_REGEX.test(values.mobile_number.trim())) {
    errors.mobile_number = 'Enter a valid Philippine mobile number (e.g. 09171234567).';
  }

  return errors;
}

export function validateStep2(values, context = {}) {
  const errors = {};

  // A confirmed "taken" result blocks Next — it's a known real conflict.
  // A pending/failed check does NOT block: the check is a UX convenience,
  // not the source of truth, and the user must never be stuck waiting on
  // it. The backend's unique:users,email rule is the authoritative check
  // on final submit regardless.
  if (!values.email.trim()) {
    errors.email = 'Email address is required.';
  } else if (!EMAIL_REGEX.test(values.email.trim())) {
    errors.email = 'Enter a valid email address.';
  } else if (context.emailStatus === 'taken') {
    // Step2AccountInfo overrides this with a richer message (incl. a link
    // to /login) when it renders the field — this plain-string version is
    // the fallback used everywhere else errors.email might surface (e.g.
    // the STEP_OF_FIELD jump-back path after a failed submit).
    errors.email = 'This email is already registered. Try signing in instead.';
  }

  const pw = passwordChecklist(values.password);
  if (!values.password) {
    errors.password = 'Password is required.';
  } else if (!pw.length || !pw.upper || !pw.number || !pw.special) {
    errors.password = 'Password does not meet the requirements below.';
  }

  if (!values.password_confirmation) {
    errors.password_confirmation = 'Please confirm your password.';
  } else if (values.password !== values.password_confirmation) {
    errors.password_confirmation = 'Passwords do not match.';
  }

  if (!values.complete_address.trim()) errors.complete_address = 'Complete address is required.';

  if (!values.emergency_contact_name.trim()) {
    errors.emergency_contact_name = 'Emergency contact name is required.';
  }
  if (!values.emergency_contact_relationship.trim()) {
    errors.emergency_contact_relationship = 'Relationship is required.';
  }
  if (!values.emergency_contact_number.trim()) {
    errors.emergency_contact_number = 'Emergency contact number is required.';
  } else if (!PHONE_REGEX.test(values.emergency_contact_number.trim())) {
    errors.emergency_contact_number = 'Enter a valid contact number.';
  }

  // patients.guardian_* columns were added "conditionally required for
  // minors, enforced at app layer" (see the patients table migration) —
  // this is that enforcement; the backend itself leaves them nullable
  // since re-deriving "is this patient a minor" from date_of_birth
  // server-side isn't worth it for what's ultimately a front-desk
  // follow-up, not a security boundary.
  if (isMinor(values.date_of_birth)) {
    if (!values.guardian_name.trim()) errors.guardian_name = "Parent/guardian's name is required for a minor patient.";
    if (!values.guardian_relationship.trim()) errors.guardian_relationship = 'Relationship to patient is required.';
    if (!values.guardian_contact_number.trim()) {
      errors.guardian_contact_number = "Parent/guardian's contact number is required.";
    } else if (!PHONE_REGEX.test(values.guardian_contact_number.trim())) {
      errors.guardian_contact_number = 'Enter a valid contact number.';
    }
  }

  return errors;
}

export function validateStep3(values) {
  const errors = {};

  if (!values.patient_type) {
    errors.patient_type = 'Please select a patient category.';
    return errors;
  }

  if (values.patient_type === 'hmo') {
    if (!values.hmo_provider_id) {
      errors.hmo_provider_id = 'Please select a valid HMO provider.';
    }
    if (!values.hmo_number.trim()) errors.hmo_number = 'HMO card / member ID number is required.';
    if (!values.hmo_company_name.trim()) errors.hmo_company_name = 'Company name / employer is required.';
  }

  return errors;
}

// Step 4 (medical info) is entirely optional — nothing to validate.
export function validateStep4() {
  return {};
}

// Step 5 (dental history) is entirely optional — nothing to validate.
export function validateStep5() {
  return {};
}

export function validateStep6(values) {
  const errors = {};
  if (!values.agree_terms) errors.agree_terms = 'Please accept the Terms & Conditions to continue.';
  return errors;
}
