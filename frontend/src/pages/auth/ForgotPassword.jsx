import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import BrandLogo from '../../components/common/BrandLogo';
import dentalChairBg from '../../assets/images/dentalchairbackground.jpg';
import '../Login.css';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const { forgotPassword } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();

    const trimmed = email.trim();
    if (!trimmed || !EMAIL_REGEX.test(trimmed)) {
      setError('Enter a valid email address.');
      return;
    }

    setError('');
    setSubmitting(true);
    // Backend always responds success-shaped here, regardless of whether the
    // email matches an account — deliberate, so this screen never leaks
    // which emails are registered. A network/validation failure is the only
    // way result.success is false.
    const result = await forgotPassword(trimmed);
    setSubmitting(false);

    if (result.success) {
      navigate(`/forgot-password/verify?email=${encodeURIComponent(trimmed)}`, {
        state: { retryAfter: result.retryAfter },
      });
    } else {
      setError(result.message || 'Something went wrong. Please try again.');
    }
  };

  return (
    <div className="login-page" style={{ backgroundImage: `url(${dentalChairBg})` }}>
      <div className="login-overlay" />

      <div className="login-card">
        <BrandLogo variant="blue" size="md" className="login-card-brand" />
        <h1 className="login-heading">Forgot Password?</h1>
        <p className="login-subheading">
          Enter your email address and we'll send you a verification code to reset your password.
        </p>

        {error && <div className="login-error">{error}</div>}

        <form onSubmit={handleSubmit}>
          <label className="login-label" htmlFor="email">Email Address</label>
          <div className="login-input-wrap">
            <span className="login-input-icon" aria-hidden="true">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="2" y="4" width="20" height="16" rx="2" />
                <path d="m22 6-10 7L2 6" />
              </svg>
            </span>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Enter your email address"
              required
            />
          </div>

          <button type="submit" className="login-button" disabled={submitting}>
            {submitting ? 'Sending…' : 'Send Verification Code'}
          </button>
        </form>

        <p className="login-signup">
          <Link to="/login">Back to Sign In</Link>
        </p>
      </div>
    </div>
  );
}

export default ForgotPassword;
