import { forwardRef, useImperativeHandle, useRef } from 'react';

// The 6-box digit grid shared by both the email-verification screen
// (VerifyOtp.jsx) and the password-reset flow — auto-advance, backspace-back,
// and paste-to-fill all live here once instead of being duplicated per screen.
// Controlled from the parent: `digits`/`onChange` own the state, this
// component only owns the input-handling mechanics. Exposes `focusFirst()`
// via ref so a parent can refocus box 1 after clearing on error/resend,
// same as the original single-screen implementation did.
const OtpDigitInput = forwardRef(function OtpDigitInput({ length = 6, digits, onChange, autoFocus = true }, ref) {
  const inputRefs = useRef([]);

  useImperativeHandle(ref, () => ({
    focusFirst: () => inputRefs.current[0]?.focus(),
  }));

  const handleDigitChange = (index, rawValue) => {
    const value = rawValue.replace(/\D/g, '');
    if (!value) {
      const next = [...digits];
      next[index] = '';
      onChange(next);
      return;
    }

    const next = [...digits];
    next[index] = value[value.length - 1];
    onChange(next);

    if (index < length - 1) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (index, e) => {
    if (e.key === 'Backspace' && !digits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handlePaste = (e) => {
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, length);
    if (!pasted) return;
    e.preventDefault();
    const next = Array(length).fill('');
    pasted.split('').forEach((char, i) => {
      next[i] = char;
    });
    onChange(next);
    inputRefs.current[Math.min(pasted.length, length - 1)]?.focus();
  };

  return (
    <div className="verify-otp-digits" onPaste={handlePaste}>
      {digits.map((digit, index) => (
        <input
          key={index}
          ref={(el) => {
            inputRefs.current[index] = el;
          }}
          type="text"
          inputMode="numeric"
          maxLength={1}
          className="verify-otp-digit"
          value={digit}
          onChange={(e) => handleDigitChange(index, e.target.value)}
          onKeyDown={(e) => handleKeyDown(index, e)}
          autoFocus={autoFocus && index === 0}
        />
      ))}
    </div>
  );
});

export default OtpDigitInput;
