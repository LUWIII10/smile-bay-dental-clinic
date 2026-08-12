import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import Swal from 'sweetalert2';
import { useAuth } from '../../../context/AuthContext';
import BrandLogo from '../../../components/common/BrandLogo';
import dentalChairBg from '../../../assets/images/dentalchairbackground.jpg';
import StepProgress from './StepProgress';
import Step1PersonalInfo from './Step1PersonalInfo';
import Step2AccountInfo from './Step2AccountInfo';
import StepPatientCategory from './StepPatientCategory';
import Step4MedicalInfo from './Step4MedicalInfo';
import Step5Review from './Step5Review';
import {
  validateStep1,
  validateStep2,
  validateStep3,
  validateStep4,
  validateStep5,
  STEP_OF_FIELD,
  ALLOWED_HMO_PROVIDERS,
} from './validation';
import '../../Login.css';

const TOTAL_STEPS = 5;
const STEP_TITLES = ['Personal Info', 'Account Info', 'Patient Category', 'Medical Information', 'Review & Confirm'];
const STEP_VALIDATORS = [validateStep1, validateStep2, validateStep3, validateStep4, validateStep5];
const STEP_COMPONENTS = [Step1PersonalInfo, Step2AccountInfo, StepPatientCategory, Step4MedicalInfo, Step5Review];

const INITIAL_VALUES = {
  first_name: '',
  middle_name: '',
  last_name: '',
  date_of_birth: '',
  sex: '',
  mobile_number: '',
  email: '',
  password: '',
  password_confirmation: '',
  complete_address: '',
  emergency_contact_name: '',
  emergency_contact_relationship: '',
  emergency_contact_number: '',
  patient_type: '',
  hmo_provider_id: '',
  hmo_provider_name: '',
  hmo_number: '',
  hmo_company_name: '',
  allergies: '',
  current_medications: '',
  medical_conditions_notes: '',
  agree_terms: false,
};

function RegisterWizard() {
  const [step, setStep] = useState(1);
  const [values, setValues] = useState(INITIAL_VALUES);
  const [errors, setErrors] = useState({});
  const [topError, setTopError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [emailStatus, setEmailStatus] = useState('idle');
  const { register } = useAuth();
  const navigate = useNavigate();

  const handleChange = (name, value) => {
    setValues((prev) => ({ ...prev, [name]: value }));
    setErrors((prev) => (prev[name] ? { ...prev, [name]: undefined } : prev));
  };

  // Lets a step component surface an inline field error (e.g. on blur)
  // without running a full step validation pass.
  const handleFieldError = (name, message) => {
    setErrors((prev) => ({ ...prev, [name]: message || undefined }));
  };

  const handleNext = () => {
    const stepErrors = STEP_VALIDATORS[step - 1](values, { emailStatus });

    if (step === 3 && values.patient_type === 'hmo' && !ALLOWED_HMO_PROVIDERS.includes(values.hmo_provider_name)) {
      Swal.fire({
        toast: true,
        position: 'top-end',
        icon: 'warning',
        title: 'Unsupported HMO Provider',
        text: 'Smile Bay Dental Clinic currently accepts Medicard and Flexicare HMO coverage only.',
        showConfirmButton: false,
        timer: 3500,
        timerProgressBar: true,
      });
    }

    if (Object.keys(stepErrors).length > 0) {
      setErrors(stepErrors);
      return;
    }
    setErrors({});
    setTopError('');
    setStep((s) => Math.min(s + 1, TOTAL_STEPS));
  };

  const handleBack = () => {
    setErrors({});
    setTopError('');
    setStep((s) => Math.max(s - 1, 1));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    const stepErrors = validateStep5(values);
    if (Object.keys(stepErrors).length > 0) {
      setErrors(stepErrors);
      return;
    }

    setErrors({});
    setTopError('');
    setSubmitting(true);
    const result = await register({
      first_name: values.first_name.trim(),
      middle_name: values.middle_name.trim() || null,
      last_name: values.last_name.trim(),
      date_of_birth: values.date_of_birth,
      sex: values.sex,
      mobile_number: values.mobile_number.trim(),
      email: values.email.trim(),
      password: values.password,
      password_confirmation: values.password_confirmation,
      complete_address: values.complete_address.trim(),
      emergency_contact_name: values.emergency_contact_name.trim(),
      emergency_contact_relationship: values.emergency_contact_relationship.trim(),
      emergency_contact_number: values.emergency_contact_number.trim(),
      patient_type: values.patient_type,
      hmo_provider_id: values.patient_type === 'hmo' ? Number(values.hmo_provider_id) : null,
      hmo_number: values.patient_type === 'hmo' ? values.hmo_number.trim() : null,
      hmo_company_name: values.patient_type === 'hmo' ? values.hmo_company_name.trim() : null,
      allergies: values.allergies.trim() || null,
      current_medications: values.current_medications.trim() || null,
      medical_conditions_notes: values.medical_conditions_notes.trim() || null,
      agree_terms: values.agree_terms,
    });
    setSubmitting(false);

    if (result.success) {
      // register() intentionally does not authenticate the user — the account
      // stays pending until the OTP screen verifies the email address.
      navigate(`/verify-email?email=${encodeURIComponent(values.email.trim())}`, {
        state: { retryAfter: result.retryAfter },
      });
      return;
    }

    if (result.errors) {
      const mapped = {};
      Object.keys(result.errors).forEach((field) => {
        mapped[field] = result.errors[field][0];
      });
      setErrors(mapped);
      const failedField = Object.keys(mapped).find((field) => field in STEP_OF_FIELD);
      if (failedField) setStep(STEP_OF_FIELD[failedField]);
      setTopError(mapped[failedField] || result.message);
    } else {
      setTopError(result.message || 'Registration failed. Please try again.');
    }
  };

  const StepComponent = STEP_COMPONENTS[step - 1];

  return (
    <div className="login-page" style={{ backgroundImage: `url(${dentalChairBg})` }}>
      <div className="login-overlay" />

      <div className="login-card login-card--wizard">
        <div className="login-card-header">
          <BrandLogo variant="blue" size="md" className="login-card-brand" />
          <h1 className="login-heading">Create Your Smile Bay Account</h1>
          <p className="login-subheading">Register to book appointments and manage your dental records.</p>

          <StepProgress currentStep={step} totalSteps={TOTAL_STEPS} />

          {topError && <div className="login-error">{topError}</div>}
        </div>

        <form onSubmit={handleSubmit} noValidate className="login-wizard-form">
          <div className="login-step-content form-content-scrollable" key={step}>
            <h2 className="login-step-heading">{STEP_TITLES[step - 1]}</h2>

            <StepComponent
              values={values}
              onChange={handleChange}
              errors={errors}
              onFieldError={handleFieldError}
              emailStatus={emailStatus}
              setEmailStatus={setEmailStatus}
            />
          </div>

          <div className="login-step-nav">
            {step > 1 && (
              <button type="button" className="login-step-back" onClick={handleBack} disabled={submitting}>
                Back
              </button>
            )}

            {step < TOTAL_STEPS && (
              <button type="button" className="login-step-next" onClick={handleNext}>
                Next
              </button>
            )}

            {step === TOTAL_STEPS && (
              <button type="submit" className="login-button" disabled={submitting}>
                {submitting ? 'Creating Account…' : 'Create Account'}
              </button>
            )}
          </div>
        </form>

        <p className="login-signup">
          Already have an account? <Link to="/login">Sign In</Link>
        </p>
      </div>
    </div>
  );
}

export default RegisterWizard;
