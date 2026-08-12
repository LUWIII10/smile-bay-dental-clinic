import FormField from './FormField';

function Step4MedicalInfo({ values, onChange, errors }) {
  return (
    <>
      <p className="login-step-note">
        Optional — helps our dental team prepare for your visit. You can also add or update this later in your
        profile.
      </p>

      <FormField
        label="Allergies"
        name="allergies"
        type="textarea"
        rows={2}
        value={values.allergies}
        onChange={onChange}
        error={errors.allergies}
        placeholder="e.g. Penicillin, Latex — leave blank if none"
      />

      <FormField
        label="Current Medications"
        name="current_medications"
        type="textarea"
        rows={2}
        value={values.current_medications}
        onChange={onChange}
        error={errors.current_medications}
        placeholder="Leave blank if none"
      />

      <FormField
        label="Relevant Medical Conditions"
        name="medical_conditions_notes"
        type="textarea"
        rows={2}
        value={values.medical_conditions_notes}
        onChange={onChange}
        error={errors.medical_conditions_notes}
        placeholder="e.g. Diabetes, Hypertension — leave blank if none"
      />
    </>
  );
}

export default Step4MedicalInfo;
