import { useCallback, useEffect, useRef, useState } from 'react';

const ACTIVITY_EVENTS = ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart', 'click'];

// 15 minutes of inactivity overall: the warning fires at the 14-minute mark
// and counts down 60 seconds, so it auto-logs-out at 15 minutes if ignored —
// the same timing real patient-record/EHR portals use for screens that can
// show health data.
const WARNING_AFTER_MS = 14 * 60 * 1000;
const COUNTDOWN_SECONDS = 60;

// Watches for mouse/keyboard/touch/scroll activity anywhere in the portal
// and calls onTimeout() once the user has been idle for the full window.
// Mounted once in PortalLayout.jsx so it covers every authenticated page.
export function useIdleTimeout(onTimeout) {
  const [showWarning, setShowWarning] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(COUNTDOWN_SECONDS);
  const warningTimer = useRef(null);
  const countdownTimer = useRef(null);
  const onTimeoutRef = useRef(onTimeout);
  onTimeoutRef.current = onTimeout;

  const clearTimers = useCallback(() => {
    clearTimeout(warningTimer.current);
    clearInterval(countdownTimer.current);
  }, []);

  const startCountdown = useCallback(() => {
    setShowWarning(true);
    setSecondsLeft(COUNTDOWN_SECONDS);
    countdownTimer.current = setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          clearInterval(countdownTimer.current);
          onTimeoutRef.current();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, []);

  const resetTimer = useCallback(() => {
    clearTimers();
    setShowWarning(false);
    warningTimer.current = setTimeout(startCountdown, WARNING_AFTER_MS);
  }, [clearTimers, startCountdown]);

  useEffect(() => {
    resetTimer();

    // Ignore activity while the warning is showing — only the modal's own
    // "Stay Logged In" button should dismiss it, otherwise a stray mouse
    // twitch while the user has stepped away would silently reset the
    // clock and the warning would never get a chance to act.
    const handleActivity = () => {
      setShowWarning((isShowing) => {
        if (!isShowing) resetTimer();
        return isShowing;
      });
    };

    ACTIVITY_EVENTS.forEach((evt) => window.addEventListener(evt, handleActivity));
    return () => {
      ACTIVITY_EVENTS.forEach((evt) => window.removeEventListener(evt, handleActivity));
      clearTimers();
    };
  }, [resetTimer, clearTimers]);

  const stayLoggedIn = useCallback(() => resetTimer(), [resetTimer]);

  const logoutNow = useCallback(() => {
    clearTimers();
    setShowWarning(false);
    onTimeoutRef.current();
  }, [clearTimers]);

  return { showWarning, secondsLeft, stayLoggedIn, logoutNow };
}
