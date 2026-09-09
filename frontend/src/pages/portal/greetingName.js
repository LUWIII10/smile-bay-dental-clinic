// Display name for the dashboard greeting ("Good morning, {name}").
// Presentation only — never reads from or writes to how names are stored.
//
//   dentist            -> "Dr. Rizael"  (strip a leading Dr./Doctor token
//                          from users.name, take the next word, re-prefix)
//   everyone else       -> "Christian"  (patients: patient.first_name;
//                          otherwise the first word of users.name)
//   no name available   -> "Doctor" for dentists, "there" for the rest
//
// All results are title-cased for display (e.g. "louie" -> "Louie",
// "MUNDOY" -> "Mundoy"); the underlying record is untouched.

const LEADING_TITLE = /^(dr\.?|doctor)$/i;

function titleCase(word) {
  return (word || '').replace(/\p{L}+/gu, (run) => run.charAt(0).toUpperCase() + run.slice(1).toLowerCase());
}

export function greetingName(user) {
  const fullName = (user?.name || '').trim();

  if (user?.role === 'dentist') {
    const parts = fullName.split(/\s+/).filter(Boolean);
    if (parts.length && LEADING_TITLE.test(parts[0])) parts.shift();
    const first = (parts[0] || '').replace(/,+$/, ''); // drop trailing comma from e.g. "Santos, DMD"
    return first ? `Dr. ${titleCase(first)}` : 'Doctor';
  }

  const patientFirst = (user?.patient?.first_name || '').trim().split(/\s+/)[0];
  if (patientFirst) return titleCase(patientFirst);

  const firstWord = fullName.split(/\s+/)[0];
  if (firstWord) return titleCase(firstWord);

  return 'there';
}
