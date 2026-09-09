import FormField from './FormField';
import CheckboxGroup from './CheckboxGroup';
import { DropletIcon, CalendarIcon, UserIcon } from './icons';

// Matches the clinic's paper intake form's "Medical Conditions" checklist
// verbatim (category + examples in parentheses, same as the paper form).
const MEDICAL_CONDITION_OPTIONS = [
  'Cardiovascular (Hypertension, Stroke)',
  'Endocrine (Diabetes, Thyroid, Kidney)',
  'Musculoskeletal (Arthritis, Osteoporosis)',
  'Respiratory (Rhinitis, Asthma, Tuberculosis)',
  'Gastrointestinal (GERD, IBS, Ulcer)',
  'Eyes (Glaucoma, Cataract, Impaired Vision)',
  'Ears (Impaired Hearing)',
  'Mental Health (Anxiety, Depression, BPD, ED)',
  'Sexual Health (HIV/AIDS Positive, STD)',
  'Blood Disorders (Anemia, Abnormal Bleeding)',
  'Cancer (History, Undergoing Treatment)',
  'Pregnant',
  'Breastfeeding',
  'Birth Control',
  'Smoking/Vape',
  'Alcohol Use',
  'Drug Use',
];

const BLOOD_TYPE_OPTIONS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'].map((v) => ({ value: v, label: v }));

function Step4MedicalInfo({ values, onChange, errors }) {
  return (
    <>
      <p className="login-step-note">
        Optional — helps our dental team prepare for your visit. You can also add or update this later in your
        profile.
      </p>

      <CheckboxGroup
        label="Medical Conditions (check all that apply)"
        name="medical_conditions"
        options={MEDICAL_CONDITION_OPTIONS}
        values={values}
        onChange={onChange}
      />

      <div className="login-field-grid">
        <FormField
          label="Blood Type"
          name="blood_type"
          type="select"
          value={values.blood_type}
          onChange={onChange}
          error={errors.blood_type}
          icon={<DropletIcon />}
          options={BLOOD_TYPE_OPTIONS}
          placeholder="Select blood type"
        />

        <FormField
          label="Last Physical Examination"
          name="last_physical_exam"
          value={values.last_physical_exam}
          onChange={onChange}
          error={errors.last_physical_exam}
          icon={<CalendarIcon />}
          placeholder="e.g. 6 months ago"
        />

        <FormField
          label="Doctor's Name &amp; Specialty"
          name="physician_name_specialty"
          fullWidth
          value={values.physician_name_specialty}
          onChange={onChange}
          error={errors.physician_name_specialty}
          icon={<UserIcon />}
          placeholder="Optional"
        />
      </div>

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
        label="Current / Maintenance Medications"
        name="current_medications"
        type="textarea"
        rows={2}
        value={values.current_medications}
        onChange={onChange}
        error={errors.current_medications}
        placeholder="Leave blank if none"
      />

      <FormField
        label="Relevant Medical Conditions (other notes)"
        name="medical_conditions_notes"
        type="textarea"
        rows={2}
        value={values.medical_conditions_notes}
        onChange={onChange}
        error={errors.medical_conditions_notes}
        placeholder="Anything not covered above — leave blank if none"
      />

      <FormField
        label="Previous Surgeries"
        name="previous_surgeries"
        type="textarea"
        rows={2}
        value={values.previous_surgeries}
        onChange={onChange}
        error={errors.previous_surgeries}
        placeholder="Leave blank if none"
      />
    </>
  );
}

export default Step4MedicalInfo;
