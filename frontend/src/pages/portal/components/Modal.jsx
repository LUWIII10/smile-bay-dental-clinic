import { useEffect } from 'react';
import { CloseIcon } from '../icons';

// Standardized modal wrapper — confirmations and action dialogs across the
// portal (booking result, reschedule, cancel-reason, HMO reject-reason,
// etc.) all render their own content as children; this only owns the
// overlay/card/close mechanics so every dialog in the app looks and
// behaves the same way.
// size is optional ('lg' widens the card for content-heavy dialogs like the
// appointment detail view) — every existing caller omits it and keeps
// today's 440px width unchanged.
function Modal({ open, onClose, title, children, closeOnBackdrop = true, size }) {
  // Esc closes, and body scroll is locked while any modal is open.
  useEffect(() => {
    if (!open) return undefined;

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose?.();
    };
    document.addEventListener('keydown', handleKeyDown);
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="modal-backdrop" onClick={closeOnBackdrop ? onClose : undefined}>
      <div
        className={`modal-card${size === 'lg' ? ' modal-card--lg' : ''}`}
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        {(title || onClose) && (
          <div className="modal-header">
            {title && <h3 className="modal-title">{title}</h3>}
            {onClose && (
              <button type="button" className="modal-close" onClick={onClose} aria-label="Close">
                <CloseIcon />
              </button>
            )}
          </div>
        )}
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}

export default Modal;
