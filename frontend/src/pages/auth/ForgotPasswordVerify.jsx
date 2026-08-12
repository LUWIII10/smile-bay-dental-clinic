import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams, useLocation, Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import BrandLogo from '../../components/common/BrandLogo';
import dentalChairBg from '../../assets/images/dentalchairbackground.jpg';
import OtpDigitInput from './OtpDigitInput';
import '../Login.css';
import './VerifyOtp.css';

const CODE_LENGTH = 6;
const DEFAULT_COOLDOWN = 60;

function ForgotPasswordVerify() {
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { verifyResetOtp, forgotPassword } = useAuth();

  const email = searchParams.get('email') || '';

  const [digits, setDigits] = useState(Array(CODE_LENGTH).fill(''));
  const [error, setError] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [resending, setResending] = useState(false);
  const [resendMessage, setResendMessage] = useState('');
  const [cooldown, setCooldown] = useState(location.state?.retryAfter ?? DEFAULT_COOLDOWN);
  const digitInputRef = useRef(null);

  useEffect(() => {
    if (!email) {
      navigate('/forgot-password', { replace: true });
    }
  }, [email, navigate]);

  useEffect(() => {
    if (cooldown <= 0) return undefined;
    const timer = setInterval(() => setCooldown((c) => Math.max(c - 1, 0)), 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  const formatCooldown = (seconds) => {
    const m = Math.floor(seconds / 60).toString().padStart(2, '0');
    const s = Math.floor(seconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  const handleVerify = async (e) => {
    e.preventDefault();
    const code = digits.join('');
    if (code.length !== CODE_LENGTH) {
      setError('Please enter the complete 6-digit code.');
      return;
    }

    setError('');
    setVerifying(true);
    const result = await verifyResetOtp(email, code);
    setVerifying(false);

    if (result.success) {
      // Carries the already-verified email+code forward so the final step
      // re-submits them alongside the new password in one call, instead of
      // needing a separate reset-token/session concept.
      navigate('/reset-password', { state: { email, otp: code } });
    } else {
      setError(result.message || 'Invalid verification code.');
      setDigits(Array(CODE_LENGTH).fill(''));
      digitInputRef.current?.focusFirst();
    }
  };

  const handleResend = async () => {
    if (cooldown > 0 || resending) return;
    setResendMessage('');
    setError('');
    setResending(true);
    const result = await forgotPassword(email);
    setResending(false);

    if (result.success) {
      setResendMessage('A new code has been sent to your email.');
      setCooldown(result.retryAfter || DEFAULT_COOLDOWN);
      setDigits(Array(CODE_LENGTH).fill(''));
      digitInputRef.current?.focusFirst();
    } else {
      setError(result.message || 'Could not resend the code. Please try again.');
      if (result.retryAfter) setCooldown(result.retryAfter);
    }
  };

  return (
    <div className="login-page" style={{ backgroundImage: `url(${dentalChairBg})` }}>
      <div className="login-overlay" />

      <div className="login-card verify-otp-card">
        <BrandLogo variant="blue" size="md" className="login-card-brand" />
        <h1 className="login-heading">Enter Verification Code</h1>
        <p className="login-subheading">
          We've sent a 6-digit code to<br />
          <strong>{email}</strong>
        </p>

        <form onSubmit={handleVerify}>
          {error && <div className="login-error">{error}</div>}

          <OtpDigitInput ref={digitInputRef} length={CODE_LENGTH} digits={digits} onChange={setDigits} />

          <button type="submit" className="login-button" disabled={verifying}>
            {verifying ? 'Verifying…' : 'Verify Code'}
          </button>
        </form>

        <div className="verify-otp-resend">
          {resendMessage && <p className="verify-otp-resend-message">{resendMessage}</p>}
          <p>
            Didn't receive the code?{' '}
            {cooldown > 0 ? (
              <span className="verify-otp-cooldown">Resend code in {formatCooldown(cooldown)}</span>
            ) : (
              <button type="button" className="verify-otp-resend-link" onClick={handleResend} disabled={resending}>
                {resending ? 'Sending…' : 'Resend Code'}
              </button>
            )}
          </p>
        </div>

        <p className="login-signup">
          <Link to="/login">Back to Sign In</Link>
        </p>
      </div>
    </div>
  );
}

export default ForgotPasswordVerify;
