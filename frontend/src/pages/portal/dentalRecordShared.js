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

// Universal Numbering System position -> anatomical tooth type. Doesn't
// exist as clinical data anywhere (no column, no table) — purely a display
// concern for choosing which of the 4 shapes the tooth-chart redesign draws
// at each position. Supplied by the clinic's own domain knowledge, not
// derived from anything else in this codebase.
export const TOOTH_TYPE = {
  1: 'molar', 2: 'molar', 3: 'molar',
  4: 'premolar', 5: 'premolar',
  6: 'canine',
  7: 'incisor', 8: 'incisor', 9: 'incisor', 10: 'incisor',
  11: 'canine',
  12: 'premolar', 13: 'premolar',
  14: 'molar', 15: 'molar', 16: 'molar',
  17: 'molar', 18: 'molar', 19: 'molar',
  20: 'premolar', 21: 'premolar',
  22: 'canine',
  23: 'incisor', 24: 'incisor', 25: 'incisor', 26: 'incisor',
  27: 'canine',
  28: 'premolar', 29: 'premolar',
  30: 'molar', 31: 'molar', 32: 'molar',
};

// One `d` string per tooth type, viewBox "0 0 24 32", crown-up/root-down
// (the lower arch's natural orientation — the upper arch flips this with a
// CSS transform on the wrapping <svg>, not a second path). Geometry is
// authored once here; PatientRecords.jsx renders it inline inside every
// button's own <svg><path>, not via <use>/<symbol> — CSS descendant
// selectors like `.tooth--green .tooth-shape-svg path` cannot reach into
// <use>-generated content in any browser (it's not exposed to author
// selectors, per spec), so that structure could never carry per-instance
// colour. A real <path> per instance is what makes those selectors work.
//
// Each path's own X-axis bounding box originally only spanned 8-14 of the
// viewBox's 24 units of width (33%-58%) while Y was already well filled
// (70%-95%) — a lot of dead horizontal margin, which read as "renders far
// too small" independent of the colour bug. Every path below has been
// linearly rescaled on X only (Y unchanged) so all four now span the same
// 2-22 range (20/24 = 83% of the width), consistent with each other.
//
// The Y axis is deliberately NOT equalised the same way. Canine reaches
// 95% of the viewBox height, incisor 86%, premolar 70%, molar 73% — canine
// has the longest root of any human tooth, premolars and molars genuinely
// shorter, and the shared viewBox is sized to the canine's reach. That
// unevenness is the anatomically correct relationship between these four
// tooth types, not a leftover defect. Do not rescale Y to make every shape
// fill its own box top-to-bottom — that would make all four the same
// height and the chart would stop telling the truth about the dentition.
export const TOOTH_SHAPE_PATHS = {
  incisor: 'M2,2 Q2,1 4.5,1 L19.5,1 Q22,1 22,2 L22,11 Q22,13 12,13 Q2,13 2,11 Z M5.75,13 L18.25,13 L12,28.5 Z',
  canine: 'M2,3 Q2,1 6,1 L18,1 Q22,1 22,3 L22,7 Q22,9 18,11 L12,15 L6,11 Q2,9 2,7 Z M8,15 L16,15 L12,31.5 Z',
  premolar: 'M2,2 Q2,1 4,1 L20,1 Q22,1 22,2 L22,9 Q22,10.5 17,10 Q14,12 12,10 Q10,12 7,10 Q2,10.5 2,9 Z M5,12 L10,12 L7.6,23.5 Z M14,12 L19,12 L16.4,23.5 Z',
  molar: 'M2,2 Q2,1 3.43,1 L20.57,1 Q22,1 22,2 L22,8 Q22,9.5 18.43,9 Q16.29,10.5 14.14,9 Q12,10.5 9.86,9 Q7.71,10.5 5.57,9 Q2,9.5 2,8 Z M3.43,11 L7.71,11 L6,22.5 Z M9.86,11 L14.14,11 L12,24.5 Z M16.29,11 L20.57,11 L18.86,22.5 Z',
};

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
