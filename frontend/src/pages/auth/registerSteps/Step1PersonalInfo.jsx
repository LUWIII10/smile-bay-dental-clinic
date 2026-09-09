import FormField from './FormField';
import { UserIcon, PhoneIcon, CalendarIcon, PeopleIcon, BriefcaseIcon } from './icons';

const SEX_OPTIONS = [
  { value: 'male', label: 'Male' },
  { value: 'female', label: 'Female' },
];

const CIVIL_STATUS_OPTIONS = [
  { value: 'single', label: 'Single' },
  { value: 'married', label: 'Married' },
  { value: 'widowed', label: 'Widowed' },
  { value: 'separated', label: 'Separated' },
];

function Step1PersonalInfo({ values, onChange, errors, onFieldError }) {
  const handleMobileBlur = () => {
    if (values.mobile_number && values.mobile_number.length < 11) {
      onFieldError('mobile_number', 'Mobile number must be 11 digits (e.g. 09171234567).');
    }
  };

  return (
    <div className="login-field-grid">
      <FormField
        label="First Name"
        name="first_name"
        value={values.first_name}
        onChange={onChange}
        error={errors.first_name}
        icon={<UserIcon />}
        placeholder="Enter your first name"
        autoComplete="given-name"
        required
      />

      <FormField
        label="Middle Name"
        name="middle_name"
        value={values.middle_name}
        onChange={onChange}
        error={errors.middle_name}
        icon={<UserIcon />}
        placeholder="Optional"
        autoComplete="additional-name"
      />

      <FormField
        label="Last Name"
        name="last_name"
        value={values.last_name}
        onChange={onChange}
        error={errors.last_name}
        icon={<UserIcon />}
        placeholder="Enter your last name"
        autoComplete="family-name"
        required
      />

      <FormField
        label="Date of Birth"
        name="date_of_birth"
        type="date"
        value={values.date_of_birth}
        onChange={onChange}
        error={errors.date_of_birth}
        icon={<CalendarIcon />}
        max={new Date().toISOString().split('T')[0]}
        required
      />

      <FormField
        label="Sex"
        name="sex"
        type="select"
        value={values.sex}
        onChange={onChange}
        error={errors.sex}
        icon={<UserIcon />}
        options={SEX_OPTIONS}
        required
      />

      <FormField
        label="Mobile Number"
        name="mobile_number"
        type="tel"
        value={values.mobile_number}
        onChange={onChange}
        onBlur={handleMobileBlur}
        transform={(v) => v.replace(/\D/g, '').slice(0, 11)}
        maxLength={11}
        error={errors.mobile_number}
        icon={<PhoneIcon />}
        placeholder="09XXXXXXXXX"
        autoComplete="tel"
        required
      />

      <FormField
        label="Civil Status"
        name="civil_status"
        type="select"
        value={values.civil_status}
        onChange={onChange}
        error={errors.civil_status}
        icon={<PeopleIcon />}
        options={CIVIL_STATUS_OPTIONS}
        placeholder="Select civil status"
      />

      <FormField
        label="Nationality"
        name="nationality"
        value={values.nationality}
        onChange={onChange}
        error={errors.nationality}
        icon={<UserIcon />}
        placeholder="e.g. Filipino"
        autoComplete="off"
      />

      <FormField
        label="Religion"
        name="religion"
        value={values.religion}
        onChange={onChange}
        error={errors.religion}
        icon={<UserIcon />}
        placeholder="Optional"
      />

      <FormField
        label="Occupation"
        name="occupation"
        value={values.occupation}
        onChange={onChange}
        error={errors.occupation}
        icon={<BriefcaseIcon />}
        placeholder="Optional"
      />
    </div>
  );
}

export default Step1PersonalInfo;
