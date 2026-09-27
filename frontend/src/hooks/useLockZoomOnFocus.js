import { useEffect } from 'react';

const DEFAULT_CONTENT = 'width=device-width, initial-scale=1.0';
const LOCKED_CONTENT = 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no';
const FIELD_TAGS = ['INPUT', 'SELECT', 'TEXTAREA'];

// Real phone testing (Chrome on iOS) traced a persistent bug back to the
// browser itself, not this app's CSS: focusing a text field on the
// Register wizard specifically zoomed the whole page in far enough that
// the field being typed into scrolled off screen — reproducible even
// after two separate, verified-correct CSS fixes (16px input font-size,
// then the wizard card's own width/overflow handling), and confirmed by
// the user to still happen with the latest deploy genuinely live. Rather
// than keep guessing at which specific style is still triggering
// WebKit's zoom-on-focus heuristic, this removes the trigger at its
// source: while any text field anywhere in the app has focus, the
// viewport is locked to 1x (maximum-scale=1, user-scalable=no) so
// nothing CAN zoom it, regardless of cause — restored back to the normal,
// freely-pinch-zoomable viewport the instant focus leaves the field, so
// zoom still works everywhere else exactly as before. Applied app-wide
// (mounted once from App.jsx) rather than only on the auth pages, since
// the same class of bug could just as easily resurface on any other
// mobile form later.
export function useLockZoomOnFocus() {
  useEffect(() => {
    const viewport = document.querySelector('meta[name="viewport"]');
    if (!viewport) return undefined;

    const isFormField = (el) => el instanceof Element && FIELD_TAGS.includes(el.tagName);

    const handleFocusIn = (e) => {
      if (isFormField(e.target)) viewport.setAttribute('content', LOCKED_CONTENT);
    };
    const handleFocusOut = (e) => {
      if (isFormField(e.target)) viewport.setAttribute('content', DEFAULT_CONTENT);
    };

    document.addEventListener('focusin', handleFocusIn);
    document.addEventListener('focusout', handleFocusOut);
    return () => {
      document.removeEventListener('focusin', handleFocusIn);
      document.removeEventListener('focusout', handleFocusOut);
      viewport.setAttribute('content', DEFAULT_CONTENT);
    };
  }, []);
}
