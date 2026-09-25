// Inline SVGs matching the same stroke style already established in
// registerSteps/icons.jsx (24 viewBox, strokeWidth 2, fill none, currentColor)
// so the portal shares one visual icon language with the auth pages instead
// of pulling in a separate icon font/library.

const base = {
  width: 20,
  height: 20,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
};

export const DashboardIcon = () => (
  <svg {...base}>
    <rect x="3" y="3" width="7" height="9" rx="1.5" />
    <rect x="14" y="3" width="7" height="5" rx="1.5" />
    <rect x="14" y="12" width="7" height="9" rx="1.5" />
    <rect x="3" y="16" width="7" height="5" rx="1.5" />
  </svg>
);

export const CalendarIcon = () => (
  <svg {...base}>
    <rect x="3" y="4" width="18" height="18" rx="2" />
    <line x1="16" y1="2" x2="16" y2="6" />
    <line x1="8" y1="2" x2="8" y2="6" />
    <line x1="3" y1="10" x2="21" y2="10" />
  </svg>
);

export const PlusIcon = () => (
  <svg {...base}>
    <line x1="12" y1="5" x2="12" y2="19" />
    <line x1="5" y1="12" x2="19" y2="12" />
  </svg>
);

export const CalendarPlusIcon = () => (
  <svg {...base}>
    <rect x="3" y="4" width="18" height="18" rx="2" />
    <line x1="16" y1="2" x2="16" y2="6" />
    <line x1="8" y1="2" x2="8" y2="6" />
    <line x1="3" y1="10" x2="21" y2="10" />
    <line x1="12" y1="14" x2="12" y2="19" />
    <line x1="9.5" y1="16.5" x2="14.5" y2="16.5" />
  </svg>
);

export const FileIcon = () => (
  <svg {...base}>
    <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8Z" />
    <path d="M14 3v5h5" />
    <line x1="9" y1="13" x2="15" y2="13" />
    <line x1="9" y1="17" x2="15" y2="17" />
  </svg>
);

export const MailIcon = () => (
  <svg {...base}>
    <rect x="3" y="5" width="18" height="14" rx="2" />
    <path d="m3 7 9 6 9-6" />
  </svg>
);

export const PrinterIcon = () => (
  <svg {...base}>
    <path d="M6 9V3h12v6" />
    <rect x="4" y="9" width="16" height="8" rx="2" />
    <path d="M6 17v4h12v-4" />
  </svg>
);

export const ActivityIcon = () => (
  <svg {...base}>
    <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
  </svg>
);

export const BuildingIcon = () => (
  <svg {...base}>
    <rect x="3" y="4" width="18" height="17" rx="2" />
    <path d="M9 21V12h6v9" />
    <path d="M8 8h.01M12 8h.01M16 8h.01" />
  </svg>
);

export const DownloadIcon = () => (
  <svg {...base}>
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="7 10 12 15 17 10" />
    <line x1="12" y1="15" x2="12" y2="3" />
  </svg>
);

export const UserIcon = () => (
  <svg {...base}>
    <circle cx="12" cy="8" r="4" />
    <path d="M4 21c0-4.4 3.6-8 8-8s8 3.6 8 8" />
  </svg>
);

export const UsersIcon = () => (
  <svg {...base}>
    <circle cx="9" cy="8" r="3" />
    <path d="M2 21c0-3.3 3.1-6 7-6s7 2.7 7 6" />
    <circle cx="17" cy="7" r="2.5" />
    <path d="M15.5 13.2c2.6.6 4.5 2.4 4.5 4.8" />
  </svg>
);

export const ShieldIcon = () => (
  <svg {...base}>
    <path d="M12 3 4 6v6c0 5 3.4 8.7 8 9 4.6-.3 8-4 8-9V6l-8-3Z" />
    <path d="m9 12 2 2 4-4" />
  </svg>
);

export const ChartIcon = () => (
  <svg {...base}>
    <line x1="4" y1="20" x2="20" y2="20" />
    <rect x="6" y="12" width="3" height="8" />
    <rect x="13.5" y="7" width="3" height="13" />
  </svg>
);

export const SettingsIcon = () => (
  <svg {...base}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06A2 2 0 1 1 7.04 4.3l.06.06A1.65 1.65 0 0 0 8.92 4.6 1.65 1.65 0 0 0 10 3.09V3a2 2 0 0 1 4 0v.09A1.65 1.65 0 0 0 15 4.6a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
  </svg>
);

export const BellIcon = () => (
  <svg {...base}>
    <path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
    <path d="M13.7 21a2 2 0 0 1-3.4 0" />
  </svg>
);

export const LogoutIcon = () => (
  <svg {...base}>
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
    <polyline points="16 17 21 12 16 7" />
    <line x1="21" y1="12" x2="9" y2="12" />
  </svg>
);

export const MenuIcon = () => (
  <svg {...base}>
    <line x1="4" y1="7" x2="20" y2="7" />
    <line x1="4" y1="12" x2="20" y2="12" />
    <line x1="4" y1="17" x2="20" y2="17" />
  </svg>
);

export const CloseIcon = () => (
  <svg {...base}>
    <line x1="6" y1="6" x2="18" y2="18" />
    <line x1="18" y1="6" x2="6" y2="18" />
  </svg>
);

export const SearchIcon = () => (
  <svg {...base}>
    <circle cx="11" cy="11" r="7" />
    <line x1="21" y1="21" x2="16.65" y2="16.65" />
  </svg>
);

export const ClockIcon = () => (
  <svg {...base}>
    <circle cx="12" cy="12" r="9" />
    <polyline points="12 7 12 12 15.5 14" />
  </svg>
);

export const CheckCircleIcon = () => (
  <svg {...base}>
    <circle cx="12" cy="12" r="9" />
    <polyline points="8.5 12.5 11 15 15.5 9.5" />
  </svg>
);

export const XCircleIcon = () => (
  <svg {...base}>
    <circle cx="12" cy="12" r="9" />
    <line x1="9.5" y1="9.5" x2="14.5" y2="14.5" />
    <line x1="14.5" y1="9.5" x2="9.5" y2="14.5" />
  </svg>
);

export const CashIcon = () => (
  <svg {...base}>
    <rect x="2" y="6" width="20" height="12" rx="2" />
    <circle cx="12" cy="12" r="3" />
    <line x1="6" y1="9" x2="6" y2="9.01" />
    <line x1="18" y1="15" x2="18" y2="15.01" />
  </svg>
);

export const EyeIcon = () => (
  <svg {...base}>
    <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7Z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);

export const MoreIcon = () => (
  <svg {...base}>
    <circle cx="12" cy="5" r="1.5" fill="currentColor" stroke="none" />
    <circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none" />
    <circle cx="12" cy="19" r="1.5" fill="currentColor" stroke="none" />
  </svg>
);

export const AlertIcon = () => (
  <svg {...base}>
    <path d="M12 3 2 20h20L12 3Z" />
    <line x1="12" y1="10" x2="12" y2="14" />
    <line x1="12" y1="17" x2="12" y2="17.01" />
  </svg>
);

export const TrendingUpIcon = () => (
  <svg {...base}>
    <polyline points="3 17 9 11 13 15 21 6" />
    <polyline points="15 6 21 6 21 12" />
  </svg>
);

export const SunIcon = () => (
  <svg {...base}>
    <circle cx="12" cy="12" r="4" />
    <line x1="12" y1="2" x2="12" y2="4" />
    <line x1="12" y1="20" x2="12" y2="22" />
    <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
    <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
    <line x1="2" y1="12" x2="4" y2="12" />
    <line x1="20" y1="12" x2="22" y2="12" />
    <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
    <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
  </svg>
);

export const SunsetIcon = () => (
  <svg {...base}>
    <path d="M17 18a5 5 0 0 0-10 0" />
    <line x1="12" y1="9" x2="12" y2="2" />
    <line x1="4.22" y1="10.22" x2="5.64" y2="11.64" />
    <line x1="1" y1="18" x2="3" y2="18" />
    <line x1="21" y1="18" x2="23" y2="18" />
    <line x1="18.36" y1="11.64" x2="19.78" y2="10.22" />
    <line x1="9" y1="6" x2="15" y2="6" />
  </svg>
);

// ---- Service-selection icons (Book Appointment, Step 1) ----
// Matched to services by keyword, not a hardcoded per-service map — see
// SERVICE_ICON_MATCHERS in ServiceSelector.jsx — so a renamed or newly
// added service still gets a sensible icon without a code change here.

export const ToothIcon = () => (
  <svg {...base}>
    <path d="M12 21c-1.1 0-1.5-2.2-2-4.5-.2-1-.5-2-1-2s-.6 1.3-1 2.7C7.5 19 7 21 6 21c-1.4 0-2-2.7-2.3-5C3.3 13.5 3 10.8 3 8.5 3 5.5 5 3 8 3c1 0 1.7.6 2 .6s1-.6 2-.6c3 0 5 2.5 5 5.5 0 2.3-.3 5-.7 7.5-.3 2.3-.9 5-2.3 5Z" />
  </svg>
);

export const SparkleIcon = () => (
  <svg {...base}>
    <path d="M12 3l1.8 5.4L19 10l-5.2 1.6L12 17l-1.8-5.4L5 10l5.2-1.6L12 3Z" />
  </svg>
);

export const BracesIcon = () => (
  <svg {...base}>
    <path d="M4 8c2 4 3 6 8 6s6-2 8-6" />
    <circle cx="7" cy="10" r="1.3" fill="currentColor" stroke="none" />
    <circle cx="12" cy="14" r="1.3" fill="currentColor" stroke="none" />
    <circle cx="17" cy="10" r="1.3" fill="currentColor" stroke="none" />
  </svg>
);

export const SyringeIcon = () => (
  <svg {...base}>
    <line x1="18" y1="2" x2="22" y2="6" />
    <line x1="17" y1="7" x2="21" y2="3" />
    <path d="M17 7 7 17l-1 4 4-1L20 10Z" />
    <line x1="12" y1="6" x2="15" y2="9" />
    <line x1="9" y1="9" x2="12" y2="12" />
  </svg>
);

export const BabyIcon = () => (
  <svg {...base}>
    <circle cx="12" cy="8" r="4" />
    <path d="M9 8.5c.5 1 1.5 1.5 3 1.5s2.5-.5 3-1.5" />
    <path d="M6 21c0-4 2.5-6 6-6s6 2 6 6" />
  </svg>
);

export const SmileIcon = () => (
  <svg {...base}>
    <circle cx="12" cy="12" r="9" />
    <path d="M8 14c1 1.5 2.5 2 4 2s3-.5 4-2" />
    <line x1="9" y1="9" x2="9.01" y2="9" />
    <line x1="15" y1="9" x2="15.01" y2="9" />
  </svg>
);

// Same tooth outline as ToothIcon, plus the small filled sparkle accent
// SparkleIcon already draws — composited rather than a new drawn shape, so
// it reads as "gentle/special tooth care" without resorting to a face
// (BabyIcon reads as an emoji next to the rest of this stroke-icon set).
export const PediatricToothIcon = () => (
  <svg {...base}>
    <path d="M12 21c-1.1 0-1.5-2.2-2-4.5-.2-1-.5-2-1-2s-.6 1.3-1 2.7C7.5 19 7 21 6 21c-1.4 0-2-2.7-2.3-5C3.3 13.5 3 10.8 3 8.5 3 5.5 5 3 8 3c1 0 1.7.6 2 .6s1-.6 2-.6c3 0 5 2.5 5 5.5 0 2.3-.3 5-.7 7.5-.3 2.3-.9 5-2.3 5Z" />
    <path d="M18 2.2l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7.7-2Z" fill="currentColor" stroke="none" />
  </svg>
);

// ---- My Availability icons ----

export const TrashIcon = () => (
  <svg {...base}>
    <polyline points="3 6 5 6 21 6" />
    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    <line x1="10" y1="11" x2="10" y2="17" />
    <line x1="14" y1="11" x2="14" y2="17" />
  </svg>
);

export const CalendarXIcon = () => (
  <svg {...base}>
    <rect x="3" y="4" width="18" height="18" rx="2" />
    <line x1="16" y1="2" x2="16" y2="6" />
    <line x1="8" y1="2" x2="8" y2="6" />
    <line x1="3" y1="10" x2="21" y2="10" />
    <line x1="9.5" y1="14.5" x2="14.5" y2="19.5" />
    <line x1="14.5" y1="14.5" x2="9.5" y2="19.5" />
  </svg>
);

// ---- Booking wizard: doctor-switch suggestion ----

export const SwapIcon = () => (
  <svg {...base}>
    <polyline points="17 3 21 7 17 11" />
    <path d="M21 7H9a4 4 0 0 0-4 4v1" />
    <polyline points="7 21 3 17 7 13" />
    <path d="M3 17h12a4 4 0 0 0 4-4v-1" />
  </svg>
);

// ---- Printed letterhead: clinic contact details ----

export const MapPinIcon = () => (
  <svg {...base}>
    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0Z" />
    <circle cx="12" cy="10" r="3" />
  </svg>
);

export const PhoneIcon = () => (
  <svg {...base}>
    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.362 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.338 1.85.573 2.81.7A2 2 0 0 1 22 16.92Z" />
  </svg>
);

export const ICONS = {
  dashboard: DashboardIcon,
  calendar: CalendarIcon,
  calendarPlus: CalendarPlusIcon,
  file: FileIcon,
  tooth: ToothIcon,
  user: UserIcon,
  users: UsersIcon,
  shield: ShieldIcon,
  chart: ChartIcon,
  settings: SettingsIcon,
  checkCircle: CheckCircleIcon,
};
