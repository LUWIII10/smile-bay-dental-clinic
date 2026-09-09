const SEX_LABELS = { male: 'Male', female: 'Female' };
const PATIENT_TYPE_LABELS = { cash: 'Cash Patient', hmo: 'HMO Covered Patient' };
const CIVIL_STATUS_LABELS = { single: 'Single', married: 'Married', widowed: 'Widowed', separated: 'Separated' };
const BRUSHING_LABELS = {
  once_daily: 'Once a day',
  twice_daily: 'Twice a day',
  three_or_more: 'Three or more times a day',
  rarely: 'Rarely',
};

function ReviewRow({ label, value }) {
  if (!value) return null;
  return (
    <div className="login-review-row">
      <span className="login-review-label">{label}</span>
      <span className="login-review-value">{value}</span>
    </div>
  );
}

function Step5Review({ values, onChange, errors }) {
  const hasMedicalInfo =
    values.allergies ||
    values.current_medications ||
    values.medical_conditions_notes ||
    values.blood_type ||
    values.medical_conditions.length > 0 ||
    values.previous_surgeries ||
    values.last_physical_exam ||
    values.physician_name_specialty;

  const hasDentalHistory =
    values.last_dental_visit ||
    values.last_dental_treatment ||
    values.brushing_frequency ||
    values.dental_procedures_history.length > 0 ||
    values.current_dental_symptoms.length > 0 ||
    values.visit_reason;

  return (
    <>
      <h3 className="login-review-group-title">Personal Information</h3>
      <ReviewRow
        label="Full Name"
        value={[values.first_name, values.middle_name, values.last_name].filter(Boolean).join(' ')}
      />
      <ReviewRow label="Date of Birth" value={values.date_of_birth} />
      <ReviewRow label="Sex" value={SEX_LABELS[values.sex] || values.sex} />
      <ReviewRow label="Mobile Number" value={values.mobile_number} />
      <ReviewRow label="Civil Status" value={CIVIL_STATUS_LABELS[values.civil_status] || values.civil_status} />
      <ReviewRow label="Nationality" value={values.nationality} />
      <ReviewRow label="Religion" value={values.religion} />
      <ReviewRow label="Occupation" value={values.occupation} />

      <h3 className="login-review-group-title">Account Information</h3>
      <ReviewRow label="Email Address" value={values.email} />
      <ReviewRow label="Complete Address" value={values.complete_address} />
      <ReviewRow label="Emergency Contact" value={values.emergency_contact_name} />
      <ReviewRow label="Relationship" value={values.emergency_contact_relationship} />
      <ReviewRow label="Emergency Contact Number" value={values.emergency_contact_number} />
      <ReviewRow label="Parent / Guardian" value={values.guardian_name} />
      <ReviewRow label="Guardian Relationship" value={values.guardian_relationship} />
      <ReviewRow label="Guardian Contact Number" value={values.guardian_contact_number} />

      <h3 className="login-review-group-title">Patient Category</h3>
      <ReviewRow label="Category" value={PATIENT_TYPE_LABELS[values.patient_type] || values.patient_type} />
      {values.patient_type === 'hmo' && (
        <>
          <ReviewRow label="HMO Provider" value={values.hmo_provider_name} />
          <ReviewRow label="HMO Card / Member ID" value={values.hmo_number} />
          <ReviewRow label="Company Name / Employer" value={values.hmo_company_name} />
        </>
      )}

      {hasMedicalInfo && (
        <>
          <h3 className="login-review-group-title">Medical Information</h3>
          <ReviewRow label="Blood Type" value={values.blood_type} />
          <ReviewRow label="Medical Conditions" value={values.medical_conditions.join(', ')} />
          <ReviewRow label="Allergies" value={values.allergies} />
          <ReviewRow label="Current / Maintenance Medications" value={values.current_medications} />
          <ReviewRow label="Other Notes" value={values.medical_conditions_notes} />
          <ReviewRow label="Previous Surgeries" value={values.previous_surgeries} />
          <ReviewRow label="Last Physical Examination" value={values.last_physical_exam} />
          <ReviewRow label="Doctor's Name & Specialty" value={values.physician_name_specialty} />
        </>
      )}

      {hasDentalHistory && (
        <>
          <h3 className="login-review-group-title">Dental History</h3>
          <ReviewRow label="Last Dental Visit" value={values.last_dental_visit} />
          <ReviewRow label="Last Dental Treatment" value={values.last_dental_treatment} />
          <ReviewRow label="Brushing Frequency" value={BRUSHING_LABELS[values.brushing_frequency] || values.brushing_frequency} />
          <ReviewRow label="Previous Procedures" value={values.dental_procedures_history.join(', ')} />
          <ReviewRow label="Current Symptoms" value={values.current_dental_symptoms.join(', ')} />
          <ReviewRow label="Reason for Visit" value={values.visit_reason} />
        </>
      )}

      <div className="login-row">
        <label className="login-remember" htmlFor="agree_terms">
          <input
            id="agree_terms"
            type="checkbox"
            checked={values.agree_terms}
            onChange={(e) => onChange('agree_terms', e.target.checked)}
          />
          I agree to Smile Bay Dental Clinic's Terms &amp; Conditions and Privacy Policy.
        </label>
      </div>
      {errors.agree_terms && <span className="login-field-error">{errors.agree_terms}</span>}
    </>
  );
}

export default Step5Review;
