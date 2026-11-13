// Normalizes a proper-noun-like field (a name, an address line, a
// nationality, an employer) typed in any case — ALL CAPS, all lowercase, or
// inconsistent — into Title Case, the same way the clinic's own paper forms
// and records are written. Deliberately NOT applied to free-text/sentence
// fields (allergies, medical notes, reason for visit) — title-casing a
// sentence reads as wrong, not formal.
//
// Handles the patterns a real Filipino name/address commonly hits:
// - Jr./Sr. suffixes keep their period and short capitalized form.
// - Roman-numeral suffixes (II, III, IV) stay fully uppercase.
// - Hyphenated and apostrophe'd name parts (Garcia-Santos, O'Brien) get
//   each segment capitalized on its own, not just the first letter of the
//   whole word.
// Does not special-case lowercase name particles (de, dela, van, von) —
// keeping every word capitalized is the simpler, more predictable rule,
// and matches how this clinic's own staff-facing screens already render
// names (plain Title Case, no particle exceptions).
const ROMAN_NUMERAL_SUFFIX = /^(ii|iii|iv|v|vi|vii|viii|ix|x)$/i;
const JR_SR_SUFFIX = /^(jr|sr)\.?$/i;

function capitalizeSegment(segment) {
  if (!segment) return segment;
  return segment.charAt(0).toUpperCase() + segment.slice(1);
}

function capitalizeWord(word) {
  if (ROMAN_NUMERAL_SUFFIX.test(word)) return word.toUpperCase();
  if (JR_SR_SUFFIX.test(word)) return `${capitalizeSegment(word.replace(/\./g, ''))}.`;

  return word
    .split('-')
    .map((part) => part.split("'").map(capitalizeSegment).join("'"))
    .join('-');
}

export function toTitleCase(value) {
  if (!value) return value;

  return value
    .trim()
    .toLowerCase()
    .split(' ')
    .filter(Boolean)
    .map(capitalizeWord)
    .join(' ');
}
