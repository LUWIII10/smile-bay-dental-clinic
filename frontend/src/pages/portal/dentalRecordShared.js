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
// concern for choosing which of the 8 shapes the tooth chart draws at each
// position. Supplied by the clinic's own domain knowledge, not derived
// from anything else in this codebase.
export const TOOTH_TYPE = {
  1: 'thirdMolar', 2: 'secondMolar', 3: 'firstMolar',
  4: 'secondPremolar', 5: 'firstPremolar',
  6: 'canine',
  7: 'lateralIncisor', 8: 'centralIncisor', 9: 'centralIncisor', 10: 'lateralIncisor',
  11: 'canine',
  12: 'firstPremolar', 13: 'secondPremolar',
  14: 'firstMolar', 15: 'secondMolar', 16: 'thirdMolar',
  17: 'thirdMolar', 18: 'secondMolar', 19: 'firstMolar',
  20: 'secondPremolar', 21: 'firstPremolar',
  22: 'canine',
  23: 'lateralIncisor', 24: 'centralIncisor', 25: 'centralIncisor', 26: 'lateralIncisor',
  27: 'canine',
  28: 'firstPremolar', 29: 'secondPremolar',
  30: 'firstMolar', 31: 'secondMolar', 32: 'thirdMolar',
};

// One `d` string per tooth type, viewBox "0 0 24 36" (grown from "0 0 24
// 32" — the canine's root needs more vertical room than the old 4-shape
// set allowed), crown-up/root-down (the lower arch's natural orientation —
// the upper arch flips this with a CSS transform on the wrapping <svg>,
// not a second path). Geometry is authored once here; PatientRecords.jsx
// renders it inline inside every button's own <svg><path>, not via
// <use>/<symbol> — CSS descendant selectors like `.tooth--green
// .tooth-shape-svg path` cannot reach into <use>-generated content in any
// browser (it's not exposed to author selectors, per spec), so that
// structure could never carry per-instance colour. A real <path> per
// instance is what makes those selectors work.
//
// Root count and length are what distinguish these eight, and they are
// NOT equalised to fill the viewBox evenly — that unevenness is
// deliberate and anatomically correct, not a defect a future pass should
// "fix". Bounding boxes (viewBox units, of 24 wide x 36 tall):
//   centralIncisor  9.6  x 30.1  (40%  x 84%)
//   lateralIncisor  7.4  x 28.5  (31%  x 79%)
//   canine          9.8  x 31.9  (41%  x 89%) - tallest: one long root,
//                                                genuinely the longest
//                                                root in the human mouth
//   firstPremolar   11.0 x 25.1  (46%  x 70%) - two separated roots
//   secondPremolar  11.0 x 28.7  (46%  x 80%) - one root
//   firstMolar      16.8 x 25.4  (70%  x 71%) - three roots
//   secondMolar     15.6 x 23.8  (65%  x 66%) - three roots, converged
//   thirdMolar      13.2 x 20.4  (55%  x 57%) - shortest: short fused
//                                                roots
// Do not rescale any of these to make every shape fill its own box the
// same amount top-to-bottom or side-to-side — that would erase the exact
// distinctions (root count, root length, crown width) this shape set
// exists to show.
export const TOOTH_SHAPE_PATHS = {
  centralIncisor: 'M7.2,2.6 Q7.2,1.7 8.2,1.7 L15.8,1.7 Q16.8,1.7 16.8,2.6 L16.6,10.6 Q16.4,13 15.2,13.9 L14.5,25.5 Q14.1,31.8 12,31.8 Q9.9,31.8 9.5,25.5 L8.8,13.9 Q7.6,13 7.4,10.6 Z',
  lateralIncisor: 'M8.3,2.8 Q8.3,1.9 9.2,1.9 L14.8,1.9 Q15.7,1.9 15.7,2.8 L15.5,10.4 Q15.3,12.8 14.3,13.6 L13.7,24.6 Q13.4,30.4 12,30.4 Q10.6,30.4 10.3,24.6 L9.7,13.6 Q8.7,12.8 8.5,10.4 Z',
  canine: 'M12,1.5 Q13.3,1.5 14.3,3.6 L16,7 Q16.9,8.6 16.7,11 Q16.5,13.2 15.3,14.1 L14.6,26.6 Q14.2,33.4 12,33.4 Q9.8,33.4 9.4,26.6 L8.7,14.1 Q7.5,13.2 7.3,11 Q7.1,8.6 8,7 L9.7,3.6 Q10.7,1.5 12,1.5 Z',
  firstPremolar: 'M6.8,6 Q6.5,3.2 8.5,2.7 Q10.2,2.3 11,4.2 Q11.5,5.3 12,5.3 Q12.5,5.3 13,4.2 Q13.8,2.3 15.5,2.7 Q17.5,3.2 17.2,6 L17,10.8 Q16.8,13 15.7,13.9 L15.2,18 Q14.9,27.4 13.9,27.4 Q13,27.4 12.8,18.4 L12.3,16.8 L11.7,16.8 L11.2,18.4 Q11,27.4 10.1,27.4 Q9.1,27.4 8.8,18 L8.3,13.9 Q7.2,13 7,10.8 Z',
  secondPremolar: 'M6.8,6 Q6.5,3.2 8.5,2.7 Q10.2,2.3 11,4.2 Q11.5,5.3 12,5.3 Q12.5,5.3 13,4.2 Q13.8,2.3 15.5,2.7 Q17.5,3.2 17.2,6 L17,10.8 Q16.8,13 15.7,13.9 L14.8,25.8 Q14.4,31 12,31 Q9.6,31 9.2,25.8 L8.3,13.9 Q7.2,13 7,10.8 Z',
  firstMolar: 'M4,7 Q3.6,3.6 5.8,2.9 Q7.4,2.4 8.3,4.1 Q9,5.3 9.7,5.3 Q10.5,5.3 11.2,4.1 Q11.6,3.4 12,3.4 Q12.4,3.4 12.8,4.1 Q13.5,5.3 14.3,5.3 Q15,5.3 15.7,4.1 Q16.6,2.4 18.2,2.9 Q20.4,3.6 20,7 L19.8,11 Q19.6,13.2 18.5,14.1 L18.1,19.4 Q17.9,27 17,27 Q16.2,27 16,19.6 L15.6,15.8 L13.4,15.8 L13.1,19.8 Q12.9,27.8 12,27.8 Q11.1,27.8 10.9,19.8 L10.6,15.8 L8.4,15.8 L8,19.6 Q7.8,27 7,27 Q6.1,27 5.9,19.4 L5.5,14.1 Q4.4,13.2 4.2,11 Z',
  secondMolar: 'M4.6,7.2 Q4.2,3.8 6.3,3.1 Q7.8,2.6 8.6,4.3 Q9.3,5.4 10,5.4 Q10.7,5.4 11.3,4.3 Q11.7,3.7 12,3.7 Q12.3,3.7 12.7,4.3 Q13.3,5.4 14,5.4 Q14.7,5.4 15.4,4.3 Q16.2,2.6 17.7,3.1 Q19.8,3.8 19.4,7.2 L19.2,11 Q19,13.1 18,14 L17.6,18.8 Q17.4,25.8 16.6,25.8 Q15.8,25.8 15.6,19 L15.3,15.6 L13.3,15.6 L13.1,19.2 Q12.9,26.4 12,26.4 Q11.1,26.4 10.9,19.2 L10.7,15.6 L8.7,15.6 L8.4,19 Q8.2,25.8 7.4,25.8 Q6.6,25.8 6.4,18.8 L6,14 Q5,13.1 4.8,11 Z',
  thirdMolar: 'M5.8,7.6 Q5.4,4.4 7.4,3.7 Q8.8,3.2 9.6,4.8 Q10.2,5.8 10.8,5.8 Q11.4,5.8 12,4.9 Q12.6,5.8 13.2,5.8 Q13.8,5.8 14.4,4.8 Q15.2,3.2 16.6,3.7 Q18.6,4.4 18.2,7.6 L18,11 Q17.8,13 16.8,13.9 L16,19.8 Q15.6,23.6 14.2,23.6 Q13.2,23.6 12.9,19 L12.6,16.6 L11.4,16.6 L11.1,19 Q10.8,23.6 9.8,23.6 Q8.4,23.6 8,19.8 L7.2,13.9 Q6.2,13 6,11 Z',
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
