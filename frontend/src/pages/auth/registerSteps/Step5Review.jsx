const SEX_LABELS = { male: 'Male', female: 'Female' };
const PATIENT_TYPE_LABELS = { cash: 'Cash Patient', hmo: 'HMO Covered Patient' };

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
  const hasMedicalInfo = values.allergies || values.current_medications || values.medical_conditions_notes;

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

      <h3 className="login-review-group-title">Account Information</h3>
      <ReviewRow label="Email Address" value={values.email} />
      <ReviewRow label="Complete Address" value={values.complete_address} />
      <ReviewRow label="Emergency Contact" value={values.emergency_contact_name} />
      <ReviewRow label="Relationship" value={values.emergency_contact_relationship} />
      <ReviewRow label="Emergency Contact Number" value={values.emergency_contact_number} />

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
          <ReviewRow label="Allergies" value={values.allergies} />
          <ReviewRow label="Current Medications" value={values.current_medications} />
          <ReviewRow label="Medical Conditions" value={values.medical_conditions_notes} />
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
