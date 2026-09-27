import { useEffect, useRef, useState } from 'react';

// Counts a set of numeric targets up from 0 once `trigger` becomes truthy
// (e.g. once a page's data has finished loading) — used so Dashboard/Reports
// stat-card figures visibly count up instead of just appearing already at
// their final value. Re-runs whenever `trigger` changes identity, so a
// Reports date-range reload replays the count-up too.
export function useCountUp(targets, trigger, duration = 800) {
  const targetsRef = useRef(targets);
  targetsRef.current = targets;
  const [values, setValues] = useState(targets);
  const frameRef = useRef(null);

  useEffect(() => {
    if (!trigger) return undefined;
    const finalTargets = targetsRef.current;
    cancelAnimationFrame(frameRef.current);
    const start = performance.now();

    const tick = (now) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - (1 - t) ** 3;
      const next = {};
      Object.keys(finalTargets).forEach((key) => {
        next[key] = Math.round((finalTargets[key] || 0) * eased);
      });
      setValues(next);
      if (t < 1) frameRef.current = requestAnimationFrame(tick);
    };
    frameRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameRef.current);
  }, [trigger, duration]);

  return values;
}

// Flips true one frame after `trigger` becomes truthy, so a CSS transition
// from a "hidden" starting style has a chance to actually paint before it
// flips to the "visible" end style (flipping both in the same tick means
// the browser never renders the starting state, so nothing would animate).
export function useEntranceReady(trigger) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!trigger) {
      setReady(false);
      return undefined;
    }
    const id = setTimeout(() => setReady(true), 50);
    return () => clearTimeout(id);
  }, [trigger]);

  return ready;
}
