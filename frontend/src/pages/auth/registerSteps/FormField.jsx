import { useState } from 'react';
import { EyeIcon } from './icons';
import { toTitleCase } from '../../../utils/textCase';

// Shared controlled field used by every step: label + icon + input, or a
// textarea variant. Renders the same login-input-wrap/login-label/login-label
// markup pattern everywhere instead of it being retyped per field.
function FormField({
  label,
  name,
  type = 'text',
  value,
  onChange,
  onBlur,
  transform,
  error,
  success,
  hint,
  loading,
  icon,
  placeholder,
  autoComplete,
  required,
  options,
  rows,
  max,
  maxLength,
  fullWidth,
  // Opt-in for a proper-noun-like field (a name, an address line, an
  // employer) — corrects whatever case the patient typed in (ALL CAPS, all
  // lowercase, mixed) to Title Case once they leave the field, same as the
  // clinic's own paper forms/records read. Every existing caller omits it
  // and keeps today's exact as-typed value — only the fields that are
  // actually names/places opt in, never a free-text/sentence field.
  titleCase,
}) {
  const [showPassword, setShowPassword] = useState(false);
  const isPassword = type === 'password';
  const wrapperClassName = `login-field${fullWidth ? ' login-field-grid-full' : ''}`;
  const inputWrapClassName = `login-input-wrap${error ? ' login-input-wrap--error' : ''}`;
  const handleInputChange = (e) => {
    onChange(name, transform ? transform(e.target.value) : e.target.value);
  };
  const handleBlur = (e) => {
    if (titleCase) onChange(name, toTitleCase(e.target.value));
    onBlur?.(e);
  };

  if (type === 'textarea') {
    return (
      <div className={wrapperClassName}>
        <label className="login-label" htmlFor={name}>{label}</label>
        <textarea
          id={name}
          className="login-textarea"
          rows={rows || 2}
          value={value}
          onChange={(e) => onChange(name, e.target.value)}
          placeholder={placeholder}
        />
        {error && <span className="login-field-error">{error}</span>}
      </div>
    );
  }

  return (
    <div className={wrapperClassName}>
      <label className="login-label" htmlFor={name}>{label}</label>
      <div className={inputWrapClassName}>
        {icon && <span className="login-input-icon" aria-hidden="true">{icon}</span>}

        {type === 'select' ? (
          <select id={name} value={value} onChange={(e) => onChange(name, e.target.value)} onBlur={onBlur} required={required}>
            <option value="">{placeholder || 'Select'}</option>
            {options.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        ) : (
          <input
            id={name}
            type={isPassword ? (showPassword ? 'text' : 'password') : type}
            value={value}
            onChange={handleInputChange}
            onBlur={handleBlur}
            placeholder={placeholder}
            autoComplete={autoComplete}
            required={required}
            max={max}
            maxLength={maxLength}
          />
        )}

        {isPassword && (
          <button
            type="button"
            className="login-eye-toggle"
            onClick={() => setShowPassword((v) => !v)}
            aria-label={showPassword ? 'Hide password' : 'Show password'}
          >
            <EyeIcon open={showPassword} />
          </button>
        )}

        {loading && !isPassword && <span className="login-input-spinner" aria-hidden="true" />}
      </div>
      {error ? (
        <span className="login-field-error">{error}</span>
      ) : success ? (
        <span className="login-field-success">✓ {success}</span>
      ) : (
        hint && <span className="login-field-hint">{hint}</span>
      )}
    </div>
  );
}

export default FormField;
