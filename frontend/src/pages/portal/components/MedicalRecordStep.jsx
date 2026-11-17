import { AlertIcon } from '../icons';
import './MedicalRecordStep.css';

// Mirrors AppointmentMedicalRecord::QUESTIONS (backend) — same keys, same
// order, so the payload this builds maps straight onto the validation rules
// in StoreAppointmentRequest with no translation layer.
export const MEDICAL_RECORD_QUESTIONS = [
  { key: 'high_blood_pressure', label: 'High blood pressure (hypertension)' },
  { key: 'diabetes', label: 'Diabetes' },
  { key: 'heart_condition', label: 'Heart condition' },
  { key: 'asthma', label: 'Asthma or breathing problems' },
  { key: 'bleeding_disorder', label: 'Bleeding disorder' },
  { key: 'allergies', label: 'Allergies (medications, food, latex)' },
  { key: 'taking_medications', label: 'Currently taking medications' },
  { key: 'recent_surgery', label: 'Recent surgery or hospitalization' },
];

export const PREGNANCY_QUESTION = { key: 'pregnant_or_breastfeeding', label: 'Pregnant or breastfeeding' };

export function emptyMedicalRecordForm() {
  const form = { other_concerns: '', consent_given: false };
  MEDICAL_RECORD_QUESTIONS.forEach((q) => {
    form[q.key] = null;
    form[`${q.key}_notes`] = '';
  });
  form[PREGNANCY_QUESTION.key] = null;
  form[`${PREGNANCY_QUESTION.key}_notes`] = '';
  return form;
}

// Builds a fresh form from the patient's own last visit (or null — a
// brand-new patient, or one who's never booked under this flow yet) so
// they only have to correct what's actually changed, not retype everything.
// isFemale decides whether the pregnancy answer carries over too — a male
// patient's form never has one regardless of what an old record contains.
export function prefillMedicalRecordForm(lastRecord, isFemale) {
  const form = emptyMedicalRecordForm();
  if (!lastRecord) return form;

  MEDICAL_RECORD_QUESTIONS.forEach((q) => {
    form[q.key] = lastRecord[q.key] ?? null;
    form[`${q.key}_notes`] = lastRecord[`${q.key}_notes`] || '';
  });
  if (isFemale) {
    form[PREGNANCY_QUESTION.key] = lastRecord[PREGNANCY_QUESTION.key] ?? null;
    form[`${PREGNANCY_QUESTION.key}_notes`] = lastRecord[`${PREGNANCY_QUESTION.key}_notes`] || '';
  }
  form.other_concerns = '';
  form.consent_given = false;
  return form;
}

export function isMedicalRecordComplete(form, isFemale) {
  const allAnswered = MEDICAL_RECORD_QUESTIONS.every((q) => form[q.key] === true || form[q.key] === false);
  const pregnancyAnswered = !isFemale || form[PREGNANCY_QUESTION.key] === true || form[PREGNANCY_QUESTION.key] === false;
  return allAnswered && pregnancyAnswered && form.consent_given === true;
}

function QuestionRow({ question, form, onAnswer, onSpecify }) {
  const value = form[question.key];
  const specify = form[`${question.key}_notes`];
  return (
    <div className="mr-row">
      <div className="mr-row-top">
        <span className="mr-row-label">{question.label}</span>
        <div className="mr-toggle" role="group" aria-label={question.label}>
          <button
            type="button"
            className={value === true ? 'mr-toggle-btn mr-toggle-btn--yes-active' : 'mr-toggle-btn'}
            onClick={() => onAnswer(question.key, true)}
          >
            Yes
          </button>
          <button
            type="button"
            className={value === false ? 'mr-toggle-btn mr-toggle-btn--no-active' : 'mr-toggle-btn'}
            onClick={() => onAnswer(question.key, false)}
          >
            No
          </button>
        </div>
      </div>
      {value === true && (
        <input
          type="text"
          className="form-input mr-specify-input"
          placeholder="Please specify"
          value={specify}
          onChange={(e) => onSpecify(question.key, e.target.value)}
          maxLength={500}
        />
      )}
    </div>
  );
}

/**
 * Shared Yes/No Medical Record step — used by both booking wizards
 * (BookAppointment.jsx, BookFollowUp.jsx) and, with consentLabel overridden,
 * the dental assistant's walk-in modal. `form` is the exact shape
 * AppointmentController::store() validates under `medical_record.*` — pass
 * it straight through to createAppointment()'s medicalRecord param with no
 * reshaping.
 */
function MedicalRecordStep({
  form,
  onChange,
  isFemale,
  prefilled,
  consentLabel,
  heading = 'Medical Record',
  subtitle = "Please update your health information for this visit. This helps the dentist provide safe treatment.",
}) {
  const setAnswer = (key, value) => onChange({ ...form, [key]: value });
  const setSpecify = (key, text) => onChange({ ...form, [`${key}_notes`]: text });

  return (
    <div className="mr-step">
      <h3 className="wizard-step-heading">{heading}</h3>
      <p className="wizard-step-subtitle">{subtitle}</p>

      {prefilled && (
        <div className="mr-prefill-note">
          <AlertIcon />
          Filled in from your last visit — please correct anything that's changed.
        </div>
      )}

      {MEDICAL_RECORD_QUESTIONS.map((q) => (
        <QuestionRow key={q.key} question={q} form={form} onAnswer={setAnswer} onSpecify={setSpecify} />
      ))}

      {isFemale && (
        <QuestionRow question={PREGNANCY_QUESTION} form={form} onAnswer={setAnswer} onSpecify={setSpecify} />
      )}

      <label className="mr-other-label" htmlFor="mr-other-concerns">Other health concerns (optional)</label>
      <textarea
        id="mr-other-concerns"
        className="form-textarea"
        rows={3}
        maxLength={1000}
        placeholder="Anything else the dentist should know?"
        value={form.other_concerns}
        onChange={(e) => onChange({ ...form, other_concerns: e.target.value })}
      />

      <label className="mr-consent-box">
        <input
          type="checkbox"
          checked={form.consent_given}
          onChange={(e) => onChange({ ...form, consent_given: e.target.checked })}
        />
        <span>
          {consentLabel || (
            <>
              I confirm that the information above is true and complete, and I consent to its use by Smile Bay
              Dental Clinic for my dental care, in accordance with the Data Privacy Act of 2012.
            </>
          )}
        </span>
      </label>
    </div>
  );
}

export default MedicalRecordStep;
