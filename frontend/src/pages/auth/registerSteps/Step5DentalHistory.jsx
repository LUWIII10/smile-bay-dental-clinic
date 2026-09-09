import FormField from './FormField';
import CheckboxGroup from './CheckboxGroup';
import { CalendarIcon, ToothIcon } from './icons';

// Matches the clinic's paper intake form's "Dental History" section
// verbatim — same two checklists (past procedures, current symptoms) plus
// the free-text "reason for today's visit" question.
const PROCEDURE_OPTIONS = [
  'Braces',
  'Extraction/Oral Surgery',
  'Gum Treatment',
  'Denture/Fixed Bridges/Crown',
  'TMJ Therapy, Bite Adjustment, Dental Appliances',
];

const SYMPTOM_OPTIONS = [
  'Pain',
  'Swelling',
  'Bleeding Gums',
  'Loose or moving tooth',
  'Clicking/Locking of the Jaw',
  'Grinding/Clenching',
  'Difficulty in Mouth Opening',
  'Bad Breath',
];

const BRUSHING_OPTIONS = [
  { value: 'once_daily', label: 'Once a day' },
  { value: 'twice_daily', label: 'Twice a day' },
  { value: 'three_or_more', label: 'Three or more times a day' },
  { value: 'rarely', label: 'Rarely' },
];

function Step5DentalHistory({ values, onChange, errors }) {
  return (
    <>
      <p className="login-step-note">
        Optional — helps our dental team prepare for your visit. You can also add or update this later in your
        profile.
      </p>

      <div className="login-field-grid">
        <FormField
          label="Last Dental Visit"
          name="last_dental_visit"
          value={values.last_dental_visit}
          onChange={onChange}
          error={errors.last_dental_visit}
          icon={<CalendarIcon />}
          placeholder="e.g. 1 year ago"
        />

        <FormField
          label="Last Dental Treatment"
          name="last_dental_treatment"
          value={values.last_dental_treatment}
          onChange={onChange}
          error={errors.last_dental_treatment}
          icon={<ToothIcon />}
          placeholder="e.g. Tooth filling"
        />

        <FormField
          label="How Often Do You Brush?"
          name="brushing_frequency"
          type="select"
          fullWidth
          value={values.brushing_frequency}
          onChange={onChange}
          error={errors.brushing_frequency}
          icon={<ToothIcon />}
          options={BRUSHING_OPTIONS}
          placeholder="Select an option"
        />
      </div>

      <CheckboxGroup
        label="Did you have any of the following?"
        name="dental_procedures_history"
        options={PROCEDURE_OPTIONS}
        values={values}
        onChange={onChange}
      />

      <CheckboxGroup
        label="Are you currently experiencing any of the following?"
        name="current_dental_symptoms"
        options={SYMPTOM_OPTIONS}
        values={values}
        onChange={onChange}
      />

      <FormField
        label="What is your reason for today's dental visit?"
        name="visit_reason"
        type="textarea"
        rows={2}
        value={values.visit_reason}
        onChange={onChange}
        error={errors.visit_reason}
        placeholder="Optional"
      />
    </>
  );
}

export default Step5DentalHistory;
