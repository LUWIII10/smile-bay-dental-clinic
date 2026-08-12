import { useState } from 'react';
import { EyeIcon } from './icons';

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
}) {
  const [showPassword, setShowPassword] = useState(false);
  const isPassword = type === 'password';
  const wrapperClassName = `login-field${fullWidth ? ' login-field-grid-full' : ''}`;
  const inputWrapClassName = `login-input-wrap${error ? ' login-input-wrap--error' : ''}`;
  const handleInputChange = (e) => {
    onChange(name, transform ? transform(e.target.value) : e.target.value);
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
            onBlur={onBlur}
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
