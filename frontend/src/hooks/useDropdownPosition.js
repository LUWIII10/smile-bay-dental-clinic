import { useEffect, useLayoutEffect, useRef, useState } from 'react';

// Shared by every dropdown/panel rendered via a portal into document.body
// straight off a trigger button (NotificationBell, AvatarMenu, ActionMenu) —
// position is computed from the trigger's own bounding rect as
// `position: fixed` coordinates, so it always renders relative to the
// viewport, never clipped by an ancestor's overflow (a <td>, a
// horizontal-scroll table wrapper, .portal-content).
//
// Right-anchors to the trigger by default (matches how each of these used
// to be positioned with plain `right: 0`), then — once the dropdown has
// actually rendered and its real width is known — nudges it back on-screen
// if that pushed its LEFT edge past the viewport's own edge. Real phone
// testing surfaced this for the notification panel specifically (a 360px-
// wide list right-anchored under a bell that isn't flush against the
// screen's true right edge, on a ~390px-wide phone), but the fix is
// deliberately generic — it re-measures the dropdown's actual rendered
// width rather than assuming one, so it holds for any dropdown width,
// trigger position, or screen size, not just the one case that was seen.
const MARGIN = 12;

export function useDropdownPosition() {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState(null);
  const triggerRef = useRef(null);
  const dropdownRef = useRef(null);
  // The trigger's own on-screen position when the dropdown opened — a
  // window scroll only means "the dropdown is now stale, dismiss it" when
  // the trigger has actually moved. A trigger that sits in a sticky topbar
  // (NotificationBell, AvatarMenu) never moves on a page scroll, so without
  // this check every scroll of the page itself — not just the dropdown's
  // own list reaching its scroll boundary — closed the panel for no reason.
  const triggerRectRef = useRef(null);
  // Whether this open session has already run its one-time edge correction
  // below. Without this, a subpixel measurement (the corrected rect still
  // reading a hair past MARGIN, e.g. from a border or a mobile browser's own
  // rounding) kept constructing a brand-new `position` object every pass —
  // a new object is never === the old one, so React never bailed out, and
  // the effect re-ran forever. On a phone, that pegged the main thread hard
  // enough for Safari to treat the tab as hung and kill it (reported as the
  // calendar filter going black and closing the whole app) — invisible on
  // desktop, which never hit the oscillation in the first place. A real fix
  // for the oscillation would mean knowing its exact cause on a device this
  // can't be tested on; not re-measuring after the first correction removes
  // the infinite-loop possibility outright, with no change in behavior for
  // the normal (non-oscillating) case this effect was written for.
  const correctedRef = useRef(false);

  const openMenu = () => {
    const rect = triggerRef.current.getBoundingClientRect();
    triggerRectRef.current = rect;
    correctedRef.current = false;
    setPosition({ top: rect.bottom + 10, right: Math.max(MARGIN, window.innerWidth - rect.right) });
    setOpen(true);
  };

  const toggle = () => (open ? setOpen(false) : openMenu());

  // Runs after the dropdown has actually painted, so its bounding rect
  // reflects real (possibly content-driven, e.g. ActionMenu's) width —
  // corrects left-edge overflow the first render couldn't have known
  // about, then settles once corrected (the second pass finds nothing left
  // to fix).
  useLayoutEffect(() => {
    if (!open || !dropdownRef.current || correctedRef.current) return;
    const rect = dropdownRef.current.getBoundingClientRect();
    correctedRef.current = true;
    if (rect.left < MARGIN) {
      setPosition((p) => (p ? { top: p.top, left: MARGIN } : p));
    } else if (rect.right > window.innerWidth - MARGIN) {
      setPosition((p) => (p ? { ...p, right: MARGIN } : p));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, position]);

  useEffect(() => {
    if (!open) return undefined;

    const handleClickOutside = (e) => {
      if (
        triggerRef.current && !triggerRef.current.contains(e.target) &&
        dropdownRef.current && !dropdownRef.current.contains(e.target)
      ) {
        setOpen(false);
      }
    };
    const handleDismiss = () => setOpen(false);
    // 'scroll' doesn't bubble, so capture (true) is the only way to hear it
    // fire on a descendant at all — but that means it also fires for
    // scrolling the dropdown's OWN internal list (e.g. a long notification
    // list with its own scrollbar), which isn't "the page moved under a
    // fixed-position dropdown" at all and shouldn't dismiss it. Skip when
    // the scroll originated inside the dropdown itself.
    const handleScroll = (e) => {
      if (dropdownRef.current && dropdownRef.current.contains(e.target)) return;
      if (triggerRef.current && triggerRectRef.current) {
        const rect = triggerRef.current.getBoundingClientRect();
        const prev = triggerRectRef.current;
        if (Math.abs(rect.top - prev.top) < 1 && Math.abs(rect.right - prev.right) < 1) return;
      }
      setOpen(false);
    };

    document.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('scroll', handleScroll, true);
    window.addEventListener('resize', handleDismiss);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('scroll', handleScroll, true);
      window.removeEventListener('resize', handleDismiss);
    };
  }, [open]);

  return { open, setOpen, position, triggerRef, dropdownRef, openMenu, toggle };
}
