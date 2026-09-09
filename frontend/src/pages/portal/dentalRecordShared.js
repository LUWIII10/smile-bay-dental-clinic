// Shared between PatientDentalRecords.jsx (patient's own read-only view) and
// PatientRecords.jsx (staff view, editable for dentists) — the tooth-chart
// vocabulary and formatting helpers are identical in both; only the
// surrounding page chrome and edit affordances differ.

// Tooth condition -> { StatusBadge tone, display label }. Kept separate from
// StatusBadge's own STATUS_TONE map (appointment/verification statuses) —
// these are a different vocabulary entirely.
export const CONDITION_META = {
  healthy: { tone: 'green', label: 'Healthy' },
  decayed: { tone: 'red', label: 'Decayed' },
  filled: { tone: 'blue', label: 'Filled' },
  missing: { tone: 'gray', label: 'Missing' },
  crowned: { tone: 'indigo', label: 'Crowned' },
  root_canal: { tone: 'amber', label: 'Root Canal' },
  extracted: { tone: 'gray', label: 'Extracted' },
  impacted: { tone: 'red', label: 'Impacted' },
  other: { tone: 'gray', label: 'Other' },
};

// treatment_plans.status isn't in StatusBadge's own tone map (that one's
// scoped to appointment statuses), so it needs its own explicit tone here —
// treatment_plan_items.status (pending/completed/cancelled) already matches
// StatusBadge's defaults and needs no override.
export const PLAN_STATUS_TONE = { planned: 'blue', in_progress: 'amber', completed: 'gray', cancelled: 'red' };

// Universal Numbering System: 1-16 is the upper arch (right to left), 17-32
// continues into the lower arch (left to right) — so tooth 16 and tooth 17
// are adjacent (both upper-left/lower-left), same for 1 and 32 (both on the
// right). Rendering the lower row in descending order (32..17) keeps those
// pairs stacked directly on top of each other, same as a real chart.
export const UPPER_ARCH = Array.from({ length: 16 }, (_, i) => i + 1);
export const LOWER_ARCH = Array.from({ length: 16 }, (_, i) => 32 - i);

export function formatRecordDate(dateStr) {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// Same date, split into the 3 stacked parts the patient-facing history
// timeline renders (MON / DD / YYYY).
export function formatRecordDateParts(dateStr) {
  if (!dateStr) return { month: '', day: '', year: '' };
  const d = new Date(dateStr);
  return {
    month: d.toLocaleDateString('en-US', { month: 'short' }).toUpperCase(),
    day: d.toLocaleDateString('en-US', { day: 'numeric' }),
    year: d.toLocaleDateString('en-US', { year: 'numeric' }),
  };
}

// Best-effort client-side grouping of a treatment_history row's free-text
// procedure_name into one of 4 display buckets, for the patient-facing
// history list/filter — treatment_history has no category column of its
// own (a dentist just types procedure_name), so this is cosmetic only.
// Order matters: checked most-specific-first, so e.g. "Veneers (Fitting &
// Consultation)" lands under Treatment rather than Consultation despite
// the word "Consultation" appearing right in the title. Anything matching
// none of the keyword sets defaults to Consultation (checkups/evaluations
// tend to have short, generic names with no procedure-specific keyword).
const HISTORY_CATEGORY_RULES = [
  {
    key: 'treatment', label: 'Treatment', tone: 'indigo',
    match: /veneer|filling|extraction|crown|denture|implant|whitening|root canal|brace|retainer|gum|tmj|aligner/i,
  },
  {
    key: 'diagnostic', label: 'Diagnostic', tone: 'blue',
    match: /x-?ray|panoramic|scan|imaging/i,
  },
  {
    key: 'procedure', label: 'Procedure', tone: 'green',
    match: /clean|prophylaxis|polish|scaling|sedation/i,
  },
];

export function classifyHistoryCategory(procedureName) {
  const rule = HISTORY_CATEGORY_RULES.find((r) => r.match.test(String(procedureName || '')));
  return rule || { key: 'consultation', label: 'Consultation', tone: 'amber' };
}

export const HISTORY_CATEGORY_OPTIONS = [
  { key: 'all', label: 'All Records' },
  { key: 'treatment', label: 'Treatment' },
  { key: 'procedure', label: 'Procedure' },
  { key: 'diagnostic', label: 'Diagnostic' },
  { key: 'consultation', label: 'Consultation' },
];
