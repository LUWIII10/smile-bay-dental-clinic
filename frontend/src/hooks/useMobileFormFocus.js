import { useEffect } from 'react';

const DEFAULT_CONTENT = 'width=device-width, initial-scale=1.0';
const LOCKED_CONTENT = 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no';
const FIELD_TAGS = ['INPUT', 'SELECT', 'TEXTAREA'];

// Two real phone bugs (Chrome/Brave/Safari on iOS), fixed together here
// since they're two sides of the same "focusing a field on a small
// screen" problem:
//
// 1. Focusing a text field zoomed the whole page in far enough to hide
//    the field being typed into — reproducible even after two separate,
//    verified-correct CSS fixes (16px input font-size, then the wizard
//    card's own width/overflow handling), so rather than keep guessing
//    at which specific style still triggers WebKit's zoom-on-focus
//    heuristic, this removes the trigger itself: while any text field
//    anywhere in the app has focus, the viewport is locked to 1x
//    (maximum-scale=1, user-scalable=no) so nothing CAN zoom it — restored
//    the instant focus leaves, so pinch-zoom still works normally the
//    rest of the time.
// 2. With the zoom gone, the NEXT real issue real testing found: the
//    on-screen keyboard alone covers roughly half the screen, and
//    nothing was scrolling the focused field above it — a field lower in
//    a multi-field step (Middle Name, Last Name, Date of Birth…) could
//    still end up hidden behind the keyboard even though the page itself
//    was no longer zoomed. scrollIntoView on focus, after a short delay
//    for the keyboard's own show animation to finish resizing the
//    visual viewport, keeps whichever field is actually being typed into
//    centered and visible.
//
// Applied app-wide (mounted once from App.jsx) rather than only on the
// auth pages, since the same class of bug could just as easily resurface
// on any other mobile form later.
export function useMobileFormFocus() {
  useEffect(() => {
    const viewport = document.querySelector('meta[name="viewport"]');

    const isFormField = (el) => el instanceof Element && FIELD_TAGS.includes(el.tagName);

    const handleFocusIn = (e) => {
      if (!isFormField(e.target)) return;
      viewport?.setAttribute('content', LOCKED_CONTENT);
      const target = e.target;
      setTimeout(() => {
        target.scrollIntoView({ block: 'center', behavior: 'smooth' });
      }, 300);
    };
    const handleFocusOut = (e) => {
      if (isFormField(e.target)) viewport?.setAttribute('content', DEFAULT_CONTENT);
    };

    document.addEventListener('focusin', handleFocusIn);
    document.addEventListener('focusout', handleFocusOut);
    return () => {
      document.removeEventListener('focusin', handleFocusIn);
      document.removeEventListener('focusout', handleFocusOut);
      viewport?.setAttribute('content', DEFAULT_CONTENT);
    };
  }, []);
}
