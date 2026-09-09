// Toggles membership of `optionValue` in an array-valued field (e.g.
// medical_conditions) — shared by every checklist in the intake form
// (medical conditions, dental procedures history, current symptoms) so the
// same array-toggle logic isn't retyped per checklist.
function CheckboxGroup({ label, name, options, values, onChange }) {
  const selected = values[name] || [];

  const toggle = (optionValue) => {
    const next = selected.includes(optionValue)
      ? selected.filter((v) => v !== optionValue)
      : [...selected, optionValue];
    onChange(name, next);
  };

  return (
    <div className="login-field login-field-grid-full">
      <label className="login-label">{label}</label>
      <div className="login-checkbox-grid">
        {options.map((option) => (
          <label key={option} className="login-checkbox-item">
            <input
              type="checkbox"
              checked={selected.includes(option)}
              onChange={() => toggle(option)}
            />
            {option}
          </label>
        ))}
      </div>
    </div>
  );
}

export default CheckboxGroup;
