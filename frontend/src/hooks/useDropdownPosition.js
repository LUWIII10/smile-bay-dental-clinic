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

  const openMenu = () => {
    const rect = triggerRef.current.getBoundingClientRect();
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
    if (!open || !dropdownRef.current) return;
    const rect = dropdownRef.current.getBoundingClientRect();
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

    document.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('scroll', handleDismiss, true);
    window.addEventListener('resize', handleDismiss);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('scroll', handleDismiss, true);
      window.removeEventListener('resize', handleDismiss);
    };
  }, [open]);

  return { open, setOpen, position, triggerRef, dropdownRef, openMenu, toggle };
}
