import drRamirezPhoto from '../../assets/images/dr-ramirez.jpg';
import drCastroPhoto from '../../assets/images/dr-castro.jpg';

// Stopgap until dentist_profiles.photo_path has a real upload flow behind
// it (nothing currently populates or serves that column for Ramirez/Castro
// — the pediatric account does have a real seeded photo_path, which always
// wins since API-provided values take precedence) — same two photo files
// the landing page's "Meet Our Dentists" section already uses, matched by
// name. Shared between BookAppointment (doctor-selection step) and My
// Appointments (appointment card avatar) — both need the same dentist ->
// photo lookup.
export const KNOWN_DENTIST_PHOTOS = {
  'Dr. Richelle Ramirez': drRamirezPhoto,
  'Dr. Rizael Castro': drCastroPhoto,
};

// Same stopgap pattern, for the "degree + licensed-since" credentials line
// on the doctor-selection cards — matches the landing page's hardcoded
// DENTISTS array verbatim (not fabricated). Dr. Castro's dentist_profiles.bio
// already has equivalent real text seeded in the DB, so the API-provided
// bio wins there and this fallback never fires for him; Dr. Ramirez's bio
// is null in the DB despite the landing page having copy for her, so this
// fills the gap. The Pediatric Dentistry account has neither a DB bio nor
// a landing-page entry — no fallback exists for her, and the credentials
// line is simply omitted rather than invented.
export const KNOWN_DENTIST_CREDENTIALS = {
  'Dr. Richelle Ramirez': 'Doctor of Dental Medicine, University of the Philippines - Manila. Licensed to practice since June 2014.',
  'Dr. Rizael Castro': 'Doctor of Dental Medicine, University of the Philippines - Manila. Licensed to practice since December 2013.',
};
