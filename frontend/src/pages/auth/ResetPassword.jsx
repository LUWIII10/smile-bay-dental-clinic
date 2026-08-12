import { useEffect, useState } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import BrandLogo from '../../components/common/BrandLogo';
import dentalChairBg from '../../assets/images/dentalchairbackground.jpg';
import { passwordChecklist } from './registerSteps/validation';
import '../Login.css';
import './VerifyOtp.css';

const CHECKLIST_ITEMS = [
  { key: 'length', label: 'Minimum 8 characters' },
  { key: 'upper', label: 'One uppercase letter' },
  { key: 'number', label: 'One number' },
  { key: 'special', label: 'One special character' },
];

function ResetPassword() {
  const location = useLocation();
  const navigate = useNavigate();
  const { resetPassword } = useAuth();

  const email = location.state?.email || '';
  const otp = location.state?.otp || '';

  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [passwordConfirmation, setPasswordConfirmation] = useState('');
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  // Can't be here without having just verified an OTP for a specific email —
  // same guard pattern as VerifyOtp.jsx redirecting when its ?email= is missing.
  useEffect(() => {
    if (!email || !otp) {
      navigate('/forgot-password', { replace: true });
    }
  }, [email, otp, navigate]);

  const pw = passwordChecklist(password);
  const passwordValid = pw.length && pw.upper && pw.number && pw.special;

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!passwordValid) {
      setError('Password does not meet the requirements below.');
      return;
    }
    if (password !== passwordConfirmation) {
      setError('Passwords do not match.');
      return;
    }

    setError('');
    setSubmitting(true);
    const result = await resetPassword(email, otp, password, passwordConfirmation);
    setSubmitting(false);

    if (result.success) {
      setDone(true);
      setTimeout(() => navigate('/login?reset=1', { replace: true }), 1400);
    } else {
      setError(result.message || 'Could not reset your password. Please try again.');
    }
  };

  return (
    <div className="login-page" style={{ backgroundImage: `url(${dentalChairBg})` }}>
      <div className="login-overlay" />

      <div className="login-card">
        <BrandLogo variant="blue" size="md" className="login-card-brand" />
        <h1 className="login-heading">Set New Password</h1>
        <p className="login-subheading">Choose a new password for your Smile Bay account.</p>

        {done ? (
          <div className="verify-otp-success">
            <span className="verify-otp-success-icon">✓</span>
            Password reset successfully. Redirecting to sign in…
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            {error && (
              <div className="login-error">
                {error}
                {error.toLowerCase().includes('expired') && (
                  <>
                    {' '}
                    <Link to="/forgot-password">Request a new code</Link>
                  </>
                )}
              </div>
            )}

            <label className="login-label" htmlFor="password">New Password</label>
            <div className="login-input-wrap">
              <span className="login-input-icon" aria-hidden="true">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="11" width="18" height="11" rx="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
              </span>
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Create a new password"
                autoComplete="new-password"
                required
              />
              <button
                type="button"
                className="login-eye-toggle"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M17.94 17.94A10.94 10.94 0 0 1 12 20c-7 0-11-8-11-8a18.5 18.5 0 0 1 5.06-5.94M9.9 4.24A10.94 10.94 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                    <line x1="1" y1="1" x2="23" y2="23" />
                  </svg>
                ) : (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8Z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                )}
              </button>
            </div>

            <ul className="login-password-checklist">
              {CHECKLIST_ITEMS.map((item) => (
                <li key={item.key} className={pw[item.key] ? 'met' : ''}>
                  {pw[item.key] ? '✓' : '•'} {item.label}
                </li>
              ))}
            </ul>

            <label className="login-label" htmlFor="password_confirmation">Confirm New Password</label>
            <div className="login-input-wrap">
              <span className="login-input-icon" aria-hidden="true">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="11" width="18" height="11" rx="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
              </span>
              <input
                id="password_confirmation"
                type={showConfirmation ? 'text' : 'password'}
                value={passwordConfirmation}
                onChange={(e) => setPasswordConfirmation(e.target.value)}
                placeholder="Re-enter your new password"
                autoComplete="new-password"
                required
              />
              <button
                type="button"
                className="login-eye-toggle"
                onClick={() => setShowConfirmation((v) => !v)}
                aria-label={showConfirmation ? 'Hide password' : 'Show password'}
              >
                {showConfirmation ? (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M17.94 17.94A10.94 10.94 0 0 1 12 20c-7 0-11-8-11-8a18.5 18.5 0 0 1 5.06-5.94M9.9 4.24A10.94 10.94 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                    <line x1="1" y1="1" x2="23" y2="23" />
                  </svg>
                ) : (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8Z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                )}
              </button>
            </div>

            <button type="submit" className="login-button" disabled={submitting}>
              {submitting ? 'Resetting…' : 'Reset Password'}
            </button>
          </form>
        )}

        {!done && (
          <p className="login-signup">
            <Link to="/login">Back to Sign In</Link>
          </p>
        )}
      </div>
    </div>
  );
}

export default ResetPassword;
