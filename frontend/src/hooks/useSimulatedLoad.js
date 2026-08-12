import { useEffect, useState } from 'react';

// Stands in for a real `await api.get(...)` while dashboards are still on
// mock data — gives the Skeleton placeholders something real to show
// instead of content just appearing instantly. Swap out for a real loading
// flag once each dashboard is wired to its API endpoint.
export function useSimulatedLoad(delayMs = 500) {
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => setLoading(false), delayMs);
    return () => clearTimeout(timer);
  }, [delayMs]);

  return loading;
}
