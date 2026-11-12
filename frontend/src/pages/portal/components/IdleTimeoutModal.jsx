import Modal from './Modal';
import { ClockIcon } from '../icons';

// Shown by PortalLayout.jsx via useIdleTimeout — the countdown is owned by
// that hook, this just renders it.
function IdleTimeoutModal({ open, secondsLeft, onStay, onLogout }) {
  return (
    <Modal open={open} onClose={onStay} title="Still There?" icon={ClockIcon} tone="amber" closeOnBackdrop={false}>
      <p>
        You&apos;ve been inactive for a while. For your account&apos;s security, you&apos;ll be logged out
        automatically if no action is taken.
      </p>
      <div className="idle-countdown-row">
        <span className="idle-countdown-number">{secondsLeft}</span>
        <span className="idle-countdown-label">seconds remaining</span>
      </div>
      <div className="modal-actions">
        <button type="button" className="dash-btn dash-btn--outline-danger" onClick={onLogout}>
          Log Out Now
        </button>
        <button type="button" className="dash-btn" onClick={onStay}>
          Stay Logged In
        </button>
      </div>
    </Modal>
  );
}

export default IdleTimeoutModal;
