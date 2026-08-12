// Placeholder data only — mirrors the same "UI first, wire to the real API
// later" approach the legacy dashboards were built with. No appointments/
// dental-records endpoints are consumed here yet; swapping these constants
// for real `api.get(...)` calls is the next step, not part of this pass.

export const PATIENT_MOCK = {
  nextAppointment: {
    date: 'August 14, 2026',
    time: '10:30 AM',
    dentist: 'Dr. Ramirez',
    service: 'Routine Cleaning',
    status: 'Confirmed',
  },
  stats: {
    totalVisits: 12,
    upcoming: 1,
    lastVisit: 'July 2, 2026',
  },
  activity: [
    { id: 1, date: 'Jul 2, 2026', description: 'Routine Cleaning with Dr. Ramirez', status: 'Completed' },
    { id: 2, date: 'Apr 18, 2026', description: 'Tooth Extraction with Dr. Castro', status: 'Completed' },
    { id: 3, date: 'Feb 5, 2026', description: 'Cavity Filling with Dr. Ramirez', status: 'Completed' },
    { id: 4, date: 'Jan 9, 2026', description: 'Consultation with Dr. Castro', status: 'Cancelled' },
  ],
};

export const DENTIST_MOCK = {
  stats: {
    today: 6,
    thisWeek: 24,
    patientsThisMonth: 58,
  },
  timeline: [
    { id: 1, time: '9:00 AM', patient: 'Juan Dela Cruz', service: 'Routine Cleaning', patientType: 'Cash' },
    { id: 2, time: '9:45 AM', patient: 'Maria Santos', service: 'Cavity Filling', patientType: 'Medicard' },
    { id: 3, time: '10:30 AM', patient: 'Claude Tester', service: 'Consultation', patientType: 'Cash' },
    { id: 4, time: '1:00 PM', patient: 'Pedro Reyes', service: 'Root Canal', patientType: 'Flexicare' },
    { id: 5, time: '2:30 PM', patient: 'Ana Lopez', service: 'Tooth Extraction', patientType: 'Medicard' },
  ],
  upcoming: [
    { id: 1, date: 'Aug 11, 2026', patient: 'Liza Cruz', service: 'Routine Cleaning', status: 'Confirmed' },
    { id: 2, date: 'Aug 11, 2026', patient: 'Mark Villanueva', service: 'Braces Adjustment', status: 'Confirmed' },
    { id: 3, date: 'Aug 12, 2026', patient: 'Ella Gomez', service: 'Cavity Filling', status: 'Pending' },
  ],
};

export const ASSISTANT_MOCK = {
  pendingVerifications: 4,
  stats: {
    today: 15,
    pendingVerifications: 4,
    confirmedToday: 11,
  },
  appointments: [
    { id: 1, time: '9:00 AM', patient: 'Juan Dela Cruz', service: 'Routine Cleaning', status: 'Confirmed' },
    { id: 2, time: '9:45 AM', patient: 'Maria Santos', service: 'Cavity Filling', status: 'Pending' },
    { id: 3, time: '10:30 AM', patient: 'Claude Tester', service: 'Consultation', status: 'Confirmed' },
    { id: 4, time: '11:15 AM', patient: 'Pedro Reyes', service: 'Root Canal', status: 'Pending' },
    { id: 5, time: '1:00 PM', patient: 'Ana Lopez', service: 'Tooth Extraction', status: 'Confirmed' },
  ],
};

export const ADMIN_MOCK = {
  stats: {
    totalPatients: 342,
    appointmentsThisMonth: 128,
    activeUsers: 18,
    pendingVerifications: 4,
  },
  appointmentsOverTime: {
    labels: ['Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug'],
    data: [64, 72, 80, 75, 91, 104, 128],
  },
  appointmentsByStatus: {
    labels: ['Confirmed', 'Pending HMO', 'Completed', 'Cancelled'],
    data: [48, 12, 60, 8],
  },
  activity: [
    { id: 1, timestamp: 'Today, 9:12 AM', description: 'New patient registered — Claude Tester' },
    { id: 2, timestamp: 'Today, 8:47 AM', description: 'Appointment confirmed — Juan Dela Cruz, Routine Cleaning' },
    { id: 3, timestamp: 'Yesterday, 4:30 PM', description: 'HMO verification approved — Maria Santos (Medicard)' },
    { id: 4, timestamp: 'Yesterday, 2:05 PM', description: 'Dental record updated — Pedro Reyes' },
    { id: 5, timestamp: 'Aug 8, 2026', description: 'Appointment cancelled — Ella Gomez' },
  ],
};
