// Pill-shaped status badge — the one semantic-color mapping shared by every
// appointment/verification list across all four dashboards.
//
// "completed" went gray for a while (bg-slate-100/text-slate-700) to keep
// green reserved for "confirmed/upcoming" only, then back to green by
// explicit request — a finished visit reads as a positive/successful
// outcome, same as the modal's own hardcoded green "Completed" badge
// already did. Changes every "Completed" entry across the portal at once,
// since it's the one shared mapping.
const STATUS_TONE = {
  confirmed: 'green',
  active: 'green',
  pending: 'amber',
  'pending verification': 'amber',
  pending_verification: 'amber',
  completed: 'green',
  cancelled: 'red',
  rejected: 'red',
  no_show: 'red',
  'in-progress': 'blue',
  'in progress': 'blue',
  // Pediatric workflow queue indicators — not appointment.status values
  // themselves (that stays 'pending_verification' for both), these are
  // synthetic keys the not-yet-built Pediatric Queue / Staff HMO Queue
  // screens can pass once they exist, to show which stage a pediatric
  // booking is sitting at.
  pediatric_review_required: 'amber',
  pediatric_confirmed_pending_hmo: 'blue',
  // HMO Verification Queue (StaffVerificationController::proposeNewDate())
  // and My Appointments — an appointment.status still reads
  // pending_verification here too, but verified_at IS already set: coverage
  // cleared, only the date needs the patient's own confirmation.
  hmo_awaiting_date_confirmation: 'blue',
};

// Full-phrase overrides for the two composite pediatric labels above —
// the generic "replace underscores with spaces" transform below only
// handles single-word-ish statuses like "pending_verification", not a
// whole custom sentence with an emoji.
//
// pending_verification -> "Pending" (not the generic-transform's "pending
// verification") matches the label the status filter dropdown already
// uses (AllAppointments.jsx's STATUS_OPTIONS) — the two were inconsistent
// before, and "Pending Verification" was also the single widest label any
// status badge ever needed to render, forcing every table's Status column
// wider than every other status actually requires.
const CUSTOM_LABELS = {
  pending_verification: 'Pending',
  pediatric_review_required: '👶 Pediatric Slot Review Required',
  pediatric_confirmed_pending_hmo: '👶 Pediatric Slot Confirmed — Pending HMO Verification',
  hmo_awaiting_date_confirmation: 'Coverage Verified — Awaiting Your Date',
};

// icon is optional (a component reference, e.g. CheckCircleIcon) — every
// existing caller omits it and renders exactly as before; only All
// Appointments' pills opt into the icon+pill treatment.
// className is likewise optional and purely additive — every existing
// caller omits it and gets the exact same two classes as before; it exists
// for the rare longer-than-usual label (e.g. "Restricted Account" in
// UserManagement.jsx) that needs to wrap instead of forcing its column
// wide enough to hold it on one line.
function StatusBadge({ status, tone, icon: Icon, className }) {
  const key = String(status).toLowerCase();
  const resolvedTone = tone || STATUS_TONE[key] || 'blue';
  const label = CUSTOM_LABELS[key] || String(status).replace(/_/g, ' ');
  return (
    <span className={`status-badge status-badge--${resolvedTone}${className ? ` ${className}` : ''}`}>
      {Icon && <span className="status-badge-icon"><Icon /></span>}
      {label}
    </span>
  );
}

export default StatusBadge;
