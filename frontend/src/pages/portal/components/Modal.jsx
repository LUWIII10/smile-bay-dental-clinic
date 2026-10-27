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
// icon/tone are likewise optional — a colored icon chip next to the title
// (tone picks red/gray/indigo), meant to visually continue whichever
// colored button opened this dialog instead of resetting to a plain title.
// Every existing caller omits both and renders exactly as before.
// bare drops the bordered header bar entirely (no title/icon support in
// that mode) in favor of a close button floating over the content itself —
// for a dialog whose own content supplies a full-bleed header (the
// Treatment Details modal's colored banner). Every existing caller omits
// it and keeps the normal bar, even the few that already pass no title.
function Modal({ open, onClose, title, icon: Icon, tone, children, closeOnBackdrop = true, size, bare = false }) {
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
        {bare
          ? onClose && (
            <button type="button" className="modal-close modal-close--floating" onClick={onClose} aria-label="Close">
              <CloseIcon />
            </button>
          )
          : (title || onClose) && (
            <div className="modal-header">
              <div className="modal-header-main">
                {Icon && <span className={`modal-icon modal-icon--${tone || 'neutral'}`}><Icon /></span>}
                {title && <h3 className="modal-title">{title}</h3>}
              </div>
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
