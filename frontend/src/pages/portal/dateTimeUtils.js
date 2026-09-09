// Shared date/time formatting for every appointment-scheduling screen.
//
// appointment_date comes back from the API as a full ISO timestamp at UTC
// midnight (e.g. "2026-08-19T00:00:00.000000Z") because of the model's
// 'date' cast — it's a calendar date, not a moment in time. Parsing that
// naively with `new Date(iso)` and formatting in the viewer's local
// timezone can shift the displayed day backward in any timezone behind
// UTC. Slicing the Y-M-D out first and building the Date from local
// components (not parsing a UTC string) avoids that entirely, regardless
// of what timezone the browser is in.

export function toLocalDate(dateInput) {
  const [y, m, d] = dateInput.slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function formatDateShort(dateInput) {
  return toLocalDate(dateInput).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  });
}

export function formatDateLong(dateInput) {
  return toLocalDate(dateInput).toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });
}

// appointment_time is a plain "HH:MM:SS" (or "HH:MM") string — no timezone
// concerns, just 24h -> 12h formatting.
export function formatTime12h(time24) {
  const [h, m] = time24.split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM';
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(m).padStart(2, '0')} ${period}`;
}
