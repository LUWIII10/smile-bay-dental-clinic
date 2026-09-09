import { useEffect, useState } from 'react';
import api from '../../../api';
import FormField from './FormField';
import { CashIcon, ShieldIcon, CardIcon, BuildingIcon } from './icons';

function StepPatientCategory({ values, onChange, errors }) {
  const [hmoProviders, setHmoProviders] = useState([]);
  const [providersError, setProvidersError] = useState(false);

  useEffect(() => {
    let cancelled = false;

    api
      .get('/api/hmo-providers')
      .then((response) => {
        if (!cancelled) setHmoProviders(response.data.data);
      })
      .catch(() => {
        if (!cancelled) setProvidersError(true);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // GET /api/hmo-providers already only returns is_active rows — the admin
  // manages that list from Settings, so whatever's active there is exactly
  // what should be selectable here. No separate name allowlist anymore.
  const providerOptions = hmoProviders.map((provider) => ({ value: String(provider.id), label: provider.name }));

  // FormField's generic select only reports (name, id) — also stash the
  // provider's display name so Step5Review can show it without needing to
  // re-fetch or thread the provider list through another prop.
  const handleProviderChange = (name, value) => {
    onChange(name, value);
    const selected = hmoProviders.find((provider) => String(provider.id) === value);
    onChange('hmo_provider_name', selected ? selected.name : '');
  };

  return (
    <div>
      <p className="login-step-note">
        Choose how you'll be paying for your dental visits. This helps our staff prepare your appointments correctly.
      </p>

      <div className="patient-type-grid">
        <button
          type="button"
          className={`patient-type-option${values.patient_type === 'cash' ? ' selected' : ''}`}
          onClick={() => onChange('patient_type', 'cash')}
        >
          <span className="patient-type-icon"><CashIcon /></span>
          <span className="patient-type-label">Cash Patient</span>
          <span className="patient-type-desc">Pay directly for each visit. Appointments are confirmed instantly.</span>
        </button>

        <button
          type="button"
          className={`patient-type-option${values.patient_type === 'hmo' ? ' selected' : ''}`}
          onClick={() => onChange('patient_type', 'hmo')}
        >
          <span className="patient-type-icon"><ShieldIcon /></span>
          <span className="patient-type-label">HMO Covered Patient</span>
          <span className="patient-type-desc">Covered by an HMO plan. Appointments need staff verification first.</span>
        </button>
      </div>
      {errors.patient_type && <span className="login-field-error">{errors.patient_type}</span>}

      {values.patient_type === 'hmo' && (
        <div className="login-field-grid patient-type-hmo-fields">
          <FormField
            label="HMO Provider"
            name="hmo_provider_id"
            type="select"
            fullWidth
            value={values.hmo_provider_id}
            onChange={handleProviderChange}
            error={errors.hmo_provider_id || (providersError ? 'Could not load HMO providers. Please refresh the page.' : '')}
            icon={<ShieldIcon />}
            options={providerOptions}
            placeholder="Select HMO Provider"
            required
          />

          <FormField
            label="HMO Card / Member ID Number"
            name="hmo_number"
            fullWidth
            value={values.hmo_number}
            onChange={onChange}
            error={errors.hmo_number}
            icon={<CardIcon />}
            placeholder="Enter your HMO card / member ID number"
            required
          />

          <FormField
            label="Company Name / Employer"
            name="hmo_company_name"
            fullWidth
            value={values.hmo_company_name}
            onChange={onChange}
            error={errors.hmo_company_name}
            icon={<BuildingIcon />}
            placeholder="Enter your company name or employer"
            required
          />
        </div>
      )}
    </div>
  );
}

export default StepPatientCategory;
