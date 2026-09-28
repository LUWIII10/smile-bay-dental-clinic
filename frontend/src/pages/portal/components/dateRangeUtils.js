// Pure date-math for DateRangePicker — plain calendar dates (YYYY-MM-DD),
// no timezone parsing involved anywhere (unlike dateTimeUtils.js's
// toLocalDate, which exists specifically to correct for API timestamps).
// Everything here builds/reads local Date components directly.

function pad(n) {
  return String(n).padStart(2, '0');
}

export function toISO(year, month, day) {
  return `${year}-${pad(month + 1)}-${pad(day)}`;
}

export function todayISO() {
  const d = new Date();
  return toISO(d.getFullYear(), d.getMonth(), d.getDate());
}

export function parseISO(iso) {
  const [year, month, day] = iso.split('-').map(Number);
  return { year, month: month - 1, day };
}

export function daysInMonth(year, month) {
  return new Date(year, month + 1, 0).getDate();
}

export function firstWeekdayOfMonth(year, month) {
  return new Date(year, month, 1).getDay();
}

export function addDays(iso, delta) {
  const { year, month, day } = parseISO(iso);
  const d = new Date(year, month, day + delta);
  return toISO(d.getFullYear(), d.getMonth(), d.getDate());
}

export function startOfMonthISO(year, month) {
  return toISO(year, month, 1);
}

export function endOfMonthISO(year, month) {
  return toISO(year, month, daysInMonth(year, month));
}

export function formatShort(iso) {
  const { year, month, day } = parseISO(iso);
  return new Date(year, month, day).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function formatRangeLabel(from, to) {
  if (!from || !to) return 'Select dates';
  const { year } = parseISO(to);
  if (from === to) return `${formatShort(from)}, ${year}`;
  return `${formatShort(from)} – ${formatShort(to)}, ${year}`;
}

export function formatSingleLabel(iso) {
  if (!iso) return null;
  const { year } = parseISO(iso);
  return `${formatShort(iso)}, ${year}`;
}

// This Month/This Year are calendar-aligned (1st through last day) —
// This Month reproduces exactly what Reports.jsx's own defaultRange()
// already loads on a fresh page visit. Last 7/30 Days and Last 3 Months
// are rolling windows ending today instead — same convention virtually
// every analytics dashboard's date picker uses (Google Analytics, Stripe,
// etc.): calendar-aligned for "this", rolling for "last N".
export const PRESETS = [
  { key: 'today', label: 'Today', range: () => ({ from: todayISO(), to: todayISO() }) },
  { key: 'last7', label: 'Last 7 Days', range: () => ({ from: addDays(todayISO(), -6), to: todayISO() }) },
  {
    key: 'thisMonth',
    label: 'This Month',
    range: () => {
      const d = new Date();
      return { from: startOfMonthISO(d.getFullYear(), d.getMonth()), to: endOfMonthISO(d.getFullYear(), d.getMonth()) };
    },
  },
  { key: 'last30', label: 'Last 30 Days', range: () => ({ from: addDays(todayISO(), -29), to: todayISO() }) },
  { key: 'last3months', label: 'Last 3 Months', range: () => ({ from: addDays(todayISO(), -89), to: todayISO() }) },
  {
    key: 'thisYear',
    label: 'This Year',
    range: () => {
      const y = new Date().getFullYear();
      return { from: toISO(y, 0, 1), to: toISO(y, 11, 31) };
    },
  },
];
