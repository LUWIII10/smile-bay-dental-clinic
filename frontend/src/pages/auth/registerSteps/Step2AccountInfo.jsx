import { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import api from '../../../api';
import FormField from './FormField';
import { MailIcon, LockIcon, LocationIcon, UserIcon, PeopleIcon, PhoneIcon } from './icons';
import { passwordChecklist, EMAIL_REGEX, isMinor as computeIsMinor } from './validation';
import { useDebounce } from '../../../hooks/useDebounce';

const CHECKLIST_ITEMS = [
  { key: 'length', label: 'Minimum 8 characters' },
  { key: 'upper', label: 'One uppercase letter' },
  { key: 'number', label: 'One number' },
  { key: 'special', label: 'One special character' },
];

const EMAIL_TAKEN_ERROR = 'This email is already registered. Try signing in instead.';
const EMAIL_CHECKING_HINT = 'Checking availability…';
const EMAIL_AVAILABLE_SUCCESS = 'This email is available.';
const EMAIL_CHECK_DEBOUNCE_MS = 500;

function Step2AccountInfo({ values, onChange, errors, onFieldError, emailStatus, setEmailStatus }) {
  const pw = passwordChecklist(values.password);
  const isMinor = computeIsMinor(values.date_of_birth);
  const trimmedEmail = values.email.trim();
  const debouncedEmail = useDebounce(trimmedEmail, EMAIL_CHECK_DEBOUNCE_MS);

  // Cancels a stale in-flight request when a newer one starts, so a slow
  // response for an email the user already changed can never land after —
  // and overwrite — a more recent result.
  const abortControllerRef = useRef(null);
  // Skips re-hitting the server for a value it has already resolved (e.g.
  // the debounced check firing right after onBlur already checked it).
  const lastCheckedEmailRef = useRef('');

  const checkEmailAvailability = async (email) => {
    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setEmailStatus('checking');
    try {
      const response = await api.get('/api/check-email', {
        params: { email },
        signal: controller.signal,
      });
      lastCheckedEmailRef.current = email;
      setEmailStatus(response.data.available ? 'available' : 'taken');
      onFieldError('email', response.data.available ? undefined : EMAIL_TAKEN_ERROR);
    } catch (err) {
      if (err.code === 'ERR_CANCELED' || err.name === 'CanceledError') return;
      // Availability check is a UX convenience only — server-side
      // unique:users,email on submit remains the authoritative check, so a
      // failed lookup here never blocks the user; just drop back to idle.
      setEmailStatus('idle');
    }
  };

  // Primary trigger: fires ~500ms after the user stops typing a
  // syntactically valid email — never on every keystroke.
  useEffect(() => {
    if (!debouncedEmail || !EMAIL_REGEX.test(debouncedEmail)) return;
    if (debouncedEmail === lastCheckedEmailRef.current) return;
    checkEmailAvailability(debouncedEmail);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedEmail]);

  // Cancel any in-flight check if the user navigates away from this step
  // (or the wizard) before it resolves.
  useEffect(() => () => abortControllerRef.current?.abort(), []);

  const handleEmailChange = (name, value) => {
    onChange(name, value);
    if (emailStatus !== 'idle') setEmailStatus('idle');
  };

  // Secondary trigger: if the user tabs away before the debounce timer
  // elapses, check immediately instead of making them wait out the delay.
  const handleEmailBlur = () => {
    if (!trimmedEmail || !EMAIL_REGEX.test(trimmedEmail)) return;
    if (trimmedEmail === lastCheckedEmailRef.current) return;
    checkEmailAvailability(trimmedEmail);
  };

  // A confirmed "taken" result gets a richer message with a link straight
  // to sign-in — everywhere else errors.email is just plain text (required,
  // invalid format, or a backend-mapped error after a failed submit).
  const emailError =
    emailStatus === 'taken' ? (
      <>
        This email is already registered.{' '}
        <Link to="/login">Try signing in instead.</Link>
      </>
    ) : (
      errors.email
    );

  return (
    <div className="login-field-grid">
      <FormField
        label="Email Address"
        name="email"
        type="email"
        fullWidth
        value={values.email}
        onChange={handleEmailChange}
        onBlur={handleEmailBlur}
        error={emailError}
        success={emailStatus === 'available' ? EMAIL_AVAILABLE_SUCCESS : ''}
        hint={emailStatus === 'checking' ? EMAIL_CHECKING_HINT : ''}
        loading={emailStatus === 'checking'}
        icon={<MailIcon />}
        placeholder="Enter your email address"
        autoComplete="email"
        required
      />

      <FormField
        label="Password"
        name="password"
        type="password"
        value={values.password}
        onChange={onChange}
        error={errors.password}
        icon={<LockIcon />}
        placeholder="Create a password"
        autoComplete="new-password"
        required
      />

      <FormField
        label="Confirm Password"
        name="password_confirmation"
        type="password"
        value={values.password_confirmation}
        onChange={onChange}
        error={errors.password_confirmation}
        icon={<LockIcon />}
        placeholder="Re-enter your password"
        autoComplete="new-password"
        required
      />

      <ul className="login-password-checklist login-field-grid-full">
        {CHECKLIST_ITEMS.map((item) => (
          <li key={item.key} className={pw[item.key] ? 'met' : ''}>
            {pw[item.key] ? '✓' : '•'} {item.label}
          </li>
        ))}
      </ul>

      <FormField
        label="Complete Address"
        name="complete_address"
        fullWidth
        value={values.complete_address}
        onChange={onChange}
        error={errors.complete_address}
        icon={<LocationIcon />}
        placeholder="House/Unit No., Street, Barangay, City, Province"
        autoComplete="street-address"
        required
      />

      <FormField
        label="Emergency Contact Full Name"
        name="emergency_contact_name"
        fullWidth
        value={values.emergency_contact_name}
        onChange={onChange}
        error={errors.emergency_contact_name}
        icon={<UserIcon />}
        placeholder="Enter their full name"
        required
      />

      <FormField
        label="Relationship"
        name="emergency_contact_relationship"
        value={values.emergency_contact_relationship}
        onChange={onChange}
        error={errors.emergency_contact_relationship}
        icon={<PeopleIcon />}
        placeholder="e.g. Spouse, Parent"
        required
      />

      <FormField
        label="Emergency Contact Number"
        name="emergency_contact_number"
        type="tel"
        value={values.emergency_contact_number}
        onChange={onChange}
        error={errors.emergency_contact_number}
        icon={<PhoneIcon />}
        placeholder="09XXXXXXXXX"
        required
      />

      {isMinor && (
        <>
          <p className="login-step-note login-field-grid-full">
            Since the patient is under 18, please also provide a parent or guardian's details.
          </p>

          <FormField
            label="Parent / Guardian Full Name"
            name="guardian_name"
            fullWidth
            value={values.guardian_name}
            onChange={onChange}
            error={errors.guardian_name}
            icon={<UserIcon />}
            placeholder="Enter their full name"
          />

          <FormField
            label="Relationship to Patient"
            name="guardian_relationship"
            value={values.guardian_relationship}
            onChange={onChange}
            error={errors.guardian_relationship}
            icon={<PeopleIcon />}
            placeholder="e.g. Mother, Father"
          />

          <FormField
            label="Guardian Contact Number"
            name="guardian_contact_number"
            type="tel"
            value={values.guardian_contact_number}
            onChange={onChange}
            error={errors.guardian_contact_number}
            icon={<PhoneIcon />}
            placeholder="09XXXXXXXXX"
          />
        </>
      )}
    </div>
  );
}

export default Step2AccountInfo;
