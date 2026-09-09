// Single source of truth for per-role sidebar navigation, page titles, and
// where each role lands after login. Keeping this data-driven (rather than
// hardcoding nav markup per role) means PortalLayout stays one component
// for all four roles.

export const ROLE_LABELS = {
  patient: 'Patient',
  dentist: 'Dentist',
  dental_assistant: 'Dental Assistant',
  admin: 'Administrator',
};

export const ROLE_DASHBOARD_PATH = {
  patient: '/patient/dashboard',
  dentist: '/dentist/dashboard',
  dental_assistant: '/assistant/dashboard',
  admin: '/admin/dashboard',
};

export const NAV_CONFIG = {
  patient: [
    { label: 'Dashboard', path: '/patient/dashboard', icon: 'dashboard' },
    { label: 'Book Appointment', path: '/patient/book-appointment', icon: 'calendarPlus' },
    { label: 'My Appointments', path: '/patient/appointments', icon: 'calendar' },
    { label: 'My Dental Records', path: '/patient/dental-records', icon: 'tooth' },
    { label: 'My Profile', path: '/patient/profile', icon: 'user' },
  ],
  dentist: [
    { label: 'Dashboard', path: '/dentist/dashboard', icon: 'dashboard' },
    { label: 'My Schedule', path: '/dentist/schedule', icon: 'calendar' },
    { label: 'My Availability', path: '/dentist/availability', icon: 'calendarPlus' },
    { label: 'Pediatric Queue', path: '/dentist/pediatric-queue', icon: 'shield' },
    { label: 'Patient Records', path: '/dentist/patient-records', icon: 'file' },
    { label: 'My Profile', path: '/dentist/profile', icon: 'user' },
  ],
  dental_assistant: [
    { label: 'Dashboard', path: '/assistant/dashboard', icon: 'dashboard' },
    { label: 'Appointments', path: '/assistant/appointments', icon: 'calendar' },
    { label: 'HMO Verification', path: '/assistant/hmo-verification', icon: 'shield' },
    { label: 'Patient Records', path: '/assistant/patient-records', icon: 'file' },
    { label: 'My Profile', path: '/assistant/profile', icon: 'user' },
  ],
  admin: [
    { label: 'Dashboard', path: '/admin/dashboard', icon: 'dashboard' },
    { label: 'Appointments', path: '/admin/appointments', icon: 'calendar' },
    { label: 'HMO Verification', path: '/admin/hmo-verification', icon: 'shield' },
    { label: 'Patient Records', path: '/admin/patient-records', icon: 'file' },
    { label: 'User Management', path: '/admin/users', icon: 'users' },
    { label: 'Reports', path: '/admin/reports', icon: 'chart' },
    { label: 'Settings', path: '/admin/settings', icon: 'settings' },
  ],
};
