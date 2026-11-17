import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import {
  getServices,
  getDentists,
  getAvailableSlots,
  getDayAvailability,
  resolveDentist,
  createAppointment,
  getPatientDashboardSummary,
  getLatestMedicalRecord,
} from '../../api/appointments';
import { getDependents } from '../../api/dependents';
import Modal from './components/Modal';
import ServiceSelector from './components/ServiceSelector';
import MedicalRecordStep, {
  emptyMedicalRecordForm,
  prefillMedicalRecordForm,
  isMedicalRecordComplete,
  MEDICAL_RECORD_QUESTIONS,
  PREGNANCY_QUESTION,
} from './components/MedicalRecordStep';
import { CheckCircleIcon, AlertIcon, ShieldIcon, UserIcon, UsersIcon, CashIcon, CalendarIcon, SunIcon, SunsetIcon } from './icons';
import { formatDateLong, formatTime12h } from './dateTimeUtils';
import { KNOWN_DENTIST_PHOTOS, KNOWN_DENTIST_CREDENTIALS } from './dentistPhotos';
import { resolvePhotoUrl } from './avatarUtils';
import './dashboards.css';
import './BookAppointment.css';

// Reordered per the panel-requested revision: Date & Time now comes before
// Doctor (the aggregated "any dentist" slot grid decides what's even worth
// offering, before narrowing to who's free then), and Additional Info
// (free-text notes) was replaced outright by the structured Medical Record
// step — notes is still nullable server-side so old rows/clients aren't
// broken, but this wizard no longer sends it.
const STEPS = ['Patient', 'Service', 'Date & Time', 'Doctor', 'Medical Record', 'Payment', 'Summary'];
const RELATIONSHIP_LABELS = { son: 'Son', daughter: 'Daughter', ward: 'Ward' };
const WEEKDAY_LABELS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const MONTH_LABELS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

// Day-level availability status -> what the calendar legend calls it.
// Missing/unfetched days default to 'unavailable' (fail closed, not open).
const DAY_STATUS_LABELS = {
  available: 'Available',
  limited: 'Limited Slots',
  full: 'Fully Booked',
  unavailable: 'Unavailable',
};

// Hover-tooltip text for a calendar day — the real open-slot count the
// backend already computes (AppointmentSlotService::getDayAvailabilitySummary()),
// so a patient can see roughly how much room is left without clicking in.
// isPast is figured out client-side from the date itself (the server's
// 'unavailable' doesn't distinguish past vs. not-working-this-day); reason
// comes straight from the server for a future unavailable day — 'day_off'
// vs 'closed' (the clinic itself, e.g. every Sunday). A day_off names WHO's
// off rather than a blanket "clinic closed," which would be misleading on,
// say, a Tuesday where the one dentist who does this service is off but the
// clinic itself is open: offDentistNames is the "Any Available Doctor"
// union's own list of who's off (one entry when a single dentist is
// selected would instead come through dentistName); dentistName is the
// already-selected single dentist's name, used when offDentistNames isn't
// available (a specific dentist, not "any," was already chosen).
function slotTooltipText(status, count, isPast, reason, offDentistNames, dentistName) {
  if (status === 'full') return 'Fully booked';
  if (status === 'limited') return `${count} slot${count === 1 ? '' : 's'} left`;
  if (status === 'available') return `${count} slots open`;
  if (isPast) return 'Already passed';
  if (reason !== 'day_off') return 'Clinic closed';
  if (offDentistNames?.length) {
    return `${offDentistNames.join(', ')} ${offDentistNames.length === 1 ? 'is' : 'are'} off`;
  }
  return dentistName ? `${dentistName} is off` : "Doctor's day off";
}

// A freshly-booked appointment can be pending_verification for three
// distinct reasons (see AppointmentController::store()) — the modal used to
// hardcode the HMO-worded message for all of them, which was wrong for a
// pediatric booking with no HMO involved at all. Mirrors Service::isPediatric()
// (name-based, not a schema flag) so this stays in sync with the backend
// without needing a new field on the service payload.
const PENDING_MESSAGES = {
  pediatric_cash:
    'Your appointment is pending confirmation from our Pediatric Dentistry specialist. We’ll email you once it’s confirmed.',
  pediatric_hmo:
    'Your appointment is pending confirmation from our Pediatric Dentistry specialist, followed by HMO coverage verification. We’ll email you at each step.',
  hmo:
    'Your appointment is pending verification. Our staff will review your HMO details and confirm your appointment — we’ll email you once it’s reviewed.',
  // ClinicalSafetyService flagged a conflict between a Medical Record
  // answer and the chosen service (e.g. pregnancy + an X-ray) — needs the
  // assigned dentist's own clinical sign-off, separate from HMO coverage.
  medical_review:
    'Your appointment needs a dentist\'s review of the health information you provided before it\'s confirmed. We\'ll email you once it\'s reviewed.',
};

function isPediatricService(service) {
  return !!service?.name?.includes('Pediatric');
}

function toDateKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function toMonthKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function startOfDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function BookAppointment() {
  const { user, refreshUser } = useAuth();
  const navigate = useNavigate();

  const [step, setStep] = useState(1);

  const [dentists, setDentists] = useState([]);
  const [loadingDentists, setLoadingDentists] = useState(false);
  const [dentistsError, setDentistsError] = useState('');

  const [services, setServices] = useState([]);
  const [loadingReference, setLoadingReference] = useState(true);
  const [referenceError, setReferenceError] = useState('');

  // Step 1 (Patient) — who this booking is for. null means "myself", the
  // default. Adding a dependent only happens on My Dependents (not part
  // of this flow) — this step only ever picks among ones that already
  // exist on the account.
  const [dependents, setDependents] = useState([]);
  const [selectedDependentId, setSelectedDependentId] = useState(null);

  const [selectedDentistId, setSelectedDentistId] = useState(null);
  const [selectedServiceId, setSelectedServiceId] = useState(null);
  const [medicalRecordForm, setMedicalRecordForm] = useState(() => emptyMedicalRecordForm());
  const [medicalRecordPrefilled, setMedicalRecordPrefilled] = useState(false);
  const [selectedDate, setSelectedDate] = useState(null);
  const [selectedTime, setSelectedTime] = useState(null);
  const [calendarMonth, setCalendarMonth] = useState(() => startOfDay(new Date()));

  const [slots, setSlots] = useState([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [slotsError, setSlotsError] = useState('');
  // Resolving "Any Available Doctor" now happens at the Doctor step (3)
  // instead of mid-slot-click — date & time are already fixed by the time
  // a doctor is chosen, so there's no stale-time-reset race left to guard
  // against the way the old order needed to.
  const [resolvingDentist, setResolvingDentist] = useState(false);
  const [resolveError, setResolveError] = useState('');
  // True when the Doctor step's date+time-filtered fetch comes back empty —
  // the slot the patient picked in step 2 got taken by someone else before
  // they reached step 3. Shown as a message with a way back to Date & Time,
  // per the panel's explicit requirement, instead of a dead-end empty grid.
  const [noDentistAvailable, setNoDentistAvailable] = useState(false);

  // 'YYYY-MM-DD' -> 'available'|'limited'|'full'|'unavailable', for every
  // day in calendarMonth — what colors the calendar cells.
  const [dayAvailability, setDayAvailability] = useState({});
  const [loadingDayAvailability, setLoadingDayAvailability] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [result, setResult] = useState(null); // { tone, appointment } once booked

  // Repeat-booking nudge: cash patients auto-confirm instantly with no
  // down payment, so nothing stops someone from booking several times and
  // no-showing all but one — this doesn't block a second booking (a patient
  // can legitimately have more than one upcoming visit, e.g. a follow-up),
  // it just makes them explicitly confirm they mean to when they already
  // have something scheduled, instead of it happening silently.
  const [nextAppointment, setNextAppointment] = useState(null);
  const [showDuplicateWarning, setShowDuplicateWarning] = useState(false);

  // 3-strike cancellation policy (CancellationPolicyService, backend) —
  // 'restricted' blocks this whole page (checked below, past the loading/
  // error guards); 'warning' just informs, doesn't block anything yet.
  const [cancellationPolicy, setCancellationPolicy] = useState(null);

  // Two more anti-abuse guardrails, independent of the cancellation policy
  // above — see Patient::reachedDailyBookingLimit()/
  // reachedUpcomingAppointmentLimit() (backend) for what each counts.
  // Checked the same way cancellationPolicy is: block the whole page below
  // once either limit is reached, warn one booking before that.
  const [bookingLimits, setBookingLimits] = useState(null);

  const patientType = user?.patient?.patient_type;
  // hmoProvider is only present now that AuthController::me() eager-loads
  // it — falls back to the free-text "Other" company name a patient could
  // have entered at registration instead of picking from the dropdown.
  const hmoProviderName = user?.patient?.hmo_provider?.name || user?.patient?.hmo_company_name;
  // Mirrors AppointmentController::store()'s own check — a patient whose
  // linked HMO provider was deactivated by the clinic (Settings > HMO
  // Providers) keeps full account access and can still browse every step
  // of this wizard, but can't submit a new booking under that provider
  // until they switch to Cash in My Profile or the clinic reactivates it.
  // Only true when hmo_provider is an actual linked record (not a patient
  // who wrote a free-text company name only) that's specifically inactive.
  const hmoProviderInactive = patientType === 'hmo'
    && !!user?.patient?.hmo_provider
    && user.patient.hmo_provider.is_active === false;
  const selectedDependent = useMemo(
    () => dependents.find((d) => d.id === selectedDependentId) || null,
    [dependents, selectedDependentId]
  );
  // Decides whether the Medical Record step's pregnancy question shows at
  // all — never shown (and never required) for a male subject, matching
  // the backend's own nullable validation for this one answer. Reads the
  // SELECTED DEPENDENT's own sex when booking for one, not the logged-in
  // patient's.
  const isFemale = selectedDependent ? selectedDependent.sex === 'female' : user?.patient?.sex === 'female';

  // AuthContext only fetches /api/auth/me once, on the app's initial
  // mount — navigating here later via the sidebar (no full page reload)
  // would otherwise keep showing whatever hmo_provider.is_active value
  // was true back when this tab first logged in, even if admin disables
  // the provider in a different tab/session afterward. Refetching here,
  // every time this page is opened, is what makes hmoProviderInactive
  // above actually reflect the current state instead of a stale one.
  useEffect(() => {
    refreshUser();
  }, [refreshUser]);

  // Step 1's own card grid — "myself" plus every dependent already added
  // on My Dependents (never fetched/created from this flow itself).
  useEffect(() => {
    getDependents().then(setDependents).catch(() => setDependents([]));
  }, []);

  // Prefill for the Medical Record step — the booking SUBJECT's (self, or
  // the selected dependent's) own last visit's answers, or an empty form
  // if nobody's ever completed one yet (MedicalRecordController::latest()).
  // Re-fires when the dependent selection changes (step 1, always before
  // step 5 is reached) — isFemale itself isn't in the dependency array,
  // same reasoning as before: it's already known the moment this fires.
  useEffect(() => {
    getLatestMedicalRecord(selectedDependentId)
      .then((latest) => {
        setMedicalRecordForm(prefillMedicalRecordForm(latest, isFemale));
        setMedicalRecordPrefilled(!!latest);
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDependentId]);

  useEffect(() => {
    // Best-effort — a failed fetch here just means the duplicate-booking
    // warning never fires, not a blocked booking. Never surfaced as a
    // page-level error. cancellationPolicy is the one exception: if it
    // fails to load, restriction can't be checked, so this page
    // conservatively assumes NOT restricted rather than silently letting a
    // restricted patient through — same fail-open posture as the rest of
    // this fetch, restriction enforcement is re-checked server-side anyway.
    getPatientDashboardSummary()
      .then((summary) => {
        setNextAppointment(summary?.nextAppointment || null);
        setCancellationPolicy(summary?.cancellationPolicy || null);
        setBookingLimits(summary?.bookingLimits || null);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    (async () => {
      setLoadingReference(true);
      setReferenceError('');
      try {
        const serviceList = await getServices(true);
        setServices(serviceList);
      } catch {
        setReferenceError('Could not load services. Please refresh the page.');
      } finally {
        setLoadingReference(false);
      }
    })();
  }, []);

  const selectedDentist = useMemo(
    () => dentists.find((d) => d.id === selectedDentistId) || null,
    [dentists, selectedDentistId]
  );
  const selectedService = useMemo(
    () => services.find((s) => s.id === selectedServiceId) || null,
    [services, selectedServiceId]
  );

  // Date & Time (step 2) comes before a doctor is picked now — no
  // selectedDentistId exists yet, so this always asks for the union of
  // every dentist credentialed for the service ('any', same aggregate
  // AppointmentSlotService::getAvailableSlotsAnyDentist() the old "Any
  // Available Doctor" card already used). The per-dentist "worse hours,
  // switch to this alternate" suggestion no longer applies here — there's
  // no single selected dentist left to compare against, since the Doctor
  // step below only ever offers dentists already confirmed free at this
  // exact date+time.
  useEffect(() => {
    if (!selectedDate || !selectedServiceId) {
      setSlots([]);
      return;
    }

    (async () => {
      setLoadingSlots(true);
      setSlotsError('');
      setSelectedTime(null);
      try {
        const result = await getAvailableSlots('any', selectedServiceId, selectedDate);
        setSlots(result.slots);
      } catch {
        setSlotsError('Could not load available times for that date. Please try another date.');
      } finally {
        setLoadingSlots(false);
      }
    })();
  }, [selectedDate, selectedServiceId]);

  useEffect(() => {
    if (!selectedServiceId) {
      setDayAvailability({});
      return;
    }

    (async () => {
      setLoadingDayAvailability(true);
      try {
        const data = await getDayAvailability('any', selectedServiceId, toMonthKey(calendarMonth));
        setDayAvailability(data);
      } catch {
        // Calendar cells just fall back to 'unavailable' (fail closed) via
        // DAY_STATUS_LABELS/dayAvailability[key] lookups below — no separate
        // error banner needed for a coloring layer that isn't the primary flow.
        setDayAvailability({});
      } finally {
        setLoadingDayAvailability(false);
      }
    })();
  }, [selectedServiceId, calendarMonth]);

  // Doctor step (3) is now filtered by the exact date+time already chosen
  // in step 2 — DentistController::index()'s own date/time params mean
  // only dentists actually free then come back, not every dentist merely
  // credentialed for the service. Re-fires if the patient goes back and
  // changes the date/time, same as it used to re-fire on service change.
  useEffect(() => {
    setSelectedDentistId(null);
    setNoDentistAvailable(false);

    if (!selectedServiceId || !selectedDate || !selectedTime) {
      setDentists([]);
      return;
    }

    (async () => {
      setLoadingDentists(true);
      setDentistsError('');
      try {
        const dentistList = await getDentists(selectedServiceId, selectedDate, selectedTime);
        setDentists(dentistList);
        if (dentistList.length === 0) {
          // The slot the patient picked in step 2 got taken by someone else
          // before they reached this step — nothing to show here, so send
          // them back to re-pick instead of a dead-end empty grid.
          setNoDentistAvailable(true);
        } else if (dentistList.length === 1) {
          // Only one dentist is ever credentialed for a specialist service
          // like Pediatric Dentistry — "Any Available Doctor" would just be
          // a second way to pick the same one person, so skip the redundant
          // choice and go straight to them.
          setSelectedDentistId(dentistList[0].id);
        }
      } catch {
        setDentistsError('Could not load doctors for this time. Please try again.');
      } finally {
        setLoadingDentists(false);
      }
    })();
  }, [selectedServiceId, selectedDate, selectedTime]);

  // "Any Available Doctor" is now chosen directly on the Doctor step (date
  // & time are already fixed by then) — resolves to a real dentist
  // (load-balanced across whoever's actually free at this exact slot) and
  // sets selectedDentistId to that real id, so every step after this one
  // proceeds completely unchanged, as an ordinary single-dentist booking.
  const handleSelectDentist = async (dentistIdOrAny) => {
    if (dentistIdOrAny !== 'any') {
      setSelectedDentistId(dentistIdOrAny);
      return;
    }

    setResolvingDentist(true);
    setResolveError('');
    try {
      const dentist = await resolveDentist(selectedServiceId, selectedDate, selectedTime);
      setSelectedDentistId(dentist.id);
    } catch (err) {
      setResolveError(err.response?.data?.message || 'That time is no longer available with any doctor. Please go back and choose another.');
    } finally {
      setResolvingDentist(false);
    }
  };

  // Summary step's own read-back of what was answered — labels only the
  // questions actually marked Yes, same list ClinicalSafetyService would
  // flag badges for on the staff side.
  const medicalRecordFlags = useMemo(() => {
    const all = isFemale ? [...MEDICAL_RECORD_QUESTIONS, PREGNANCY_QUESTION] : MEDICAL_RECORD_QUESTIONS;
    return all.filter((q) => medicalRecordForm[q.key] === true).map((q) => q.label);
  }, [medicalRecordForm, isFemale]);

  // Client-side mirror of ClinicalSafetyService::conflictReasons() — a
  // preview only, so the Summary step can set expectations before
  // submitting; AppointmentController::store() re-runs the real check
  // server-side regardless of what this computes.
  const willNeedMedicalReview = useMemo(() => {
    if (!selectedService) return false;
    const mr = medicalRecordForm;
    if (mr.pregnant_or_breastfeeding && (selectedService.involves_xray || selectedService.involves_sedation)) return true;
    if (mr.bleeding_disorder && selectedService.is_surgical) return true;
    if (mr.heart_condition && selectedService.involves_sedation) return true;
    if (mr.asthma && selectedService.involves_sedation) return true;
    return false;
  }, [selectedService, medicalRecordForm]);

  const canGoNext = {
    1: true,
    2: !!selectedServiceId && !(isPediatricService(selectedService) && patientType === 'hmo'),
    3: !!selectedDate && !!selectedTime,
    4: !!selectedDentistId && !resolvingDentist,
    5: isMedicalRecordComplete(medicalRecordForm, isFemale),
    6: true,
    7: false,
  }[step];

  const goNext = () => setStep((s) => Math.min(s + 1, STEPS.length));
  const goBack = () => setStep((s) => Math.max(s - 1, 1));

  const handleConfirm = async () => {
    setSubmitting(true);
    setSubmitError('');
    try {
      const response = await createAppointment({
        dentistId: selectedDentistId,
        serviceId: selectedServiceId,
        date: selectedDate,
        time: selectedTime,
        medicalRecord: medicalRecordForm,
        dependentId: selectedDependentId,
      });
      const isConfirmed = response.data.status === 'confirmed';
      const isPediatric = isPediatricService(selectedService);

      setResult({
        tone: isConfirmed ? 'success' : 'warning',
        // Only meaningful when tone is 'warning' — which of the four
        // pending_verification reasons applies, so the modal can show the
        // right copy instead of always assuming HMO. Same priority order as
        // AppointmentController::store()'s own notification branches.
        pendingReason: isConfirmed ? null
          : isPediatric ? (patientType === 'hmo' ? 'pediatric_hmo' : 'pediatric_cash')
          : response.data.medical_review_required ? 'medical_review'
          : 'hmo',
        appointment: response.data,
      });
    } catch (err) {
      if (err.response?.status === 409) {
        setSubmitError(err.response.data.message);
        // The slot grid the patient saw is now stale — send them back to
        // Date & Time (now step 3) to re-pick, and clear the doctor choice
        // too since it was filtered against the time that's no longer
        // actually free.
        setSelectedTime(null);
        setSelectedDentistId(null);
        setStep(3);
        if (selectedDate) {
          try {
            const refreshed = await getAvailableSlots('any', selectedServiceId, selectedDate);
            setSlots(refreshed.slots);
          } catch {
            // Slot list just won't refresh — the inline error still explains what happened.
          }
        }
      } else {
        setSubmitError(err.response?.data?.message || 'Something went wrong. Please try again.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const closeResultModal = () => {
    setResult(null);
    navigate('/patient/dashboard');
  };

  // ---- Calendar grid for calendarMonth ----
  const calendarCells = useMemo(() => {
    const year = calendarMonth.getFullYear();
    const month = calendarMonth.getMonth();
    const firstOfMonth = new Date(year, month, 1);
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const leadingBlanks = firstOfMonth.getDay();

    const cells = Array.from({ length: leadingBlanks }, () => null);
    for (let day = 1; day <= daysInMonth; day++) {
      cells.push(new Date(year, month, day));
    }
    return cells;
  }, [calendarMonth]);

  const today = startOfDay(new Date());
  const todayKey = toDateKey(today);
  const isPrevDisabled =
    calendarMonth.getFullYear() === today.getFullYear() && calendarMonth.getMonth() === today.getMonth();

  // Every returned slot is already genuinely bookable (the aggregate 'any'
  // API never returns taken/past ones) — plain display grouping. No
  // "selected dentist has worse hours" suggestion here anymore: that was
  // specific to a single already-chosen dentist, which no longer exists at
  // this step.
  const groupedSlots = useMemo(() => {
    const rows = slots.map((t) => ({ time: t, bookable: true }));

    return {
      morning: rows.filter((r) => Number(r.time.split(':')[0]) < 12),
      afternoon: rows.filter((r) => Number(r.time.split(':')[0]) >= 12),
    };
  }, [slots]);

  const renderSlotCard = ({ time, bookable }) => {
    const isSelected = time === selectedTime;
    return (
      <button
        key={time}
        type="button"
        disabled={!bookable}
        className={`slot-card${isSelected ? ' slot-card--selected' : ''}${!bookable ? ' slot-card--disabled' : ''}`}
        onClick={() => {
          if (!bookable) return;
          setSelectedTime(time);
        }}
      >
        {formatTime12h(time)}
      </button>
    );
  };

  if (loadingReference) {
    return (
      <div className="section-card">
        <p>Loading…</p>
      </div>
    );
  }

  if (referenceError) {
    return (
      <div className="section-card">
        <div className="dash-empty">
          <span className="dash-empty-title">{referenceError}</span>
        </div>
      </div>
    );
  }

  if (cancellationPolicy?.restricted) {
    return (
      <div className="section-card">
        <div className="dash-empty">
          <AlertIcon />
          <span className="dash-empty-title">New Bookings Restricted</span>
          <p style={{ margin: 0, fontSize: '0.82rem' }}>
            This account has had repeated cancelled or missed appointments, so new self-service bookings are
            currently restricted. Please contact the clinic directly to book an appointment.
          </p>
        </div>
      </div>
    );
  }

  // Checked in the same order as AppointmentController::store()'s own
  // server-side check, so the message a patient sees here always matches
  // the one they'd get if they somehow bypassed this and submitted anyway.
  // Deliberately non-blocking at the page level (unlike cancellationPolicy
  // ?.restricted above) — a patient hitting either limit can still browse
  // every step (services, doctors, real open slots) to plan ahead; only
  // the final submit is actually disabled, via bookingLimitBlocked below.
  const bookingLimitBlocked = bookingLimits && (
    bookingLimits.dailyCount >= bookingLimits.dailyLimit || bookingLimits.upcomingCount >= bookingLimits.upcomingLimit
  );
  const bookingLimitBanner = !bookingLimits ? null
    : bookingLimits.dailyCount >= bookingLimits.dailyLimit ? {
      title: 'Daily Booking Limit Reached',
      text: `You've already booked ${bookingLimits.dailyLimit} appointments today. You can still look around below, but a new booking can't be submitted until tomorrow — or contact the clinic directly if this is urgent.`,
    }
    : bookingLimits.upcomingCount >= bookingLimits.upcomingLimit ? {
      title: 'Too Many Upcoming Appointments',
      text: `You currently have ${bookingLimits.upcomingLimit} upcoming appointments already scheduled. You can still look around below, but a new booking can't be submitted until one is completed or cancelled — or contact the clinic directly if this is urgent.`,
    }
    : null;

  return (
    <div>
      <div className="section-card">
        <div className="wizard-steps">
          {STEPS.map((label, i) => {
            const num = i + 1;
            const state = num < step ? 'complete' : num === step ? 'active' : '';
            return (
              <div key={label} style={{ display: 'contents' }}>
                <div className={`wizard-step${state ? ` wizard-step--${state}` : ''}`}>
                  <span className="wizard-step-circle">
                    {num < step ? (
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                    ) : num}
                  </span>
                  <span className="wizard-step-label">{label}</span>
                </div>
                {num < STEPS.length && <div className={`wizard-step-line${num < step ? ' wizard-step-line--done' : ''}`} />}
              </div>
            );
          })}
        </div>
        <p className="wizard-mobile-step-label">Step {step} of {STEPS.length}: {STEPS[step - 1]}</p>

        {bookingLimitBanner && (
          <div className="suggestion-banner" style={{ marginBottom: 16 }}>
            <span className="suggestion-banner-icon"><AlertIcon /></span>
            <div className="suggestion-banner-text">
              <p className="suggestion-banner-title">{bookingLimitBanner.title}</p>
              <p className="suggestion-banner-subtitle">{bookingLimitBanner.text}</p>
            </div>
          </div>
        )}

        {/* ---- Step 1: Patient — who this booking is for. Adding a
             dependent is deliberately NOT reachable from here (only My
             Dependents) — this step only ever picks among ones that
             already exist. ---- */}
        {step === 1 && (
          <>
            <h3 className="wizard-step-heading">Who is this appointment for?</h3>
            <p className="wizard-step-subtitle">Choose yourself or one of your registered dependents.</p>

            <div className="who-grid">
              <div
                className={`who-card${!selectedDependentId ? ' who-card--selected' : ''}`}
                onClick={() => setSelectedDependentId(null)}
              >
                {!selectedDependentId && <span className="who-check"><CheckCircleIcon /></span>}
                <span className="who-avatar who-avatar--self"><UserIcon /></span>
                <h4 className="who-name">Myself</h4>
                <span className="who-sub">{user?.name}</span>
              </div>

              {dependents.map((dep) => {
                const isSelected = selectedDependentId === dep.id;
                return (
                  <div
                    key={dep.id}
                    className={`who-card${isSelected ? ' who-card--selected' : ''}`}
                    onClick={() => setSelectedDependentId(dep.id)}
                  >
                    {isSelected && <span className="who-check"><CheckCircleIcon /></span>}
                    <span className={`who-avatar${dep.sex === 'female' ? ' who-avatar--girl' : ' who-avatar--boy'}`}>
                      {dep.first_name[0]}{dep.last_name[0]}
                    </span>
                    <h4 className="who-name">{dep.full_name}</h4>
                    <span className="who-sub">{RELATIONSHIP_LABELS[dep.relationship_to_parent] || dep.relationship_to_parent} · {dep.age} {dep.age === 1 ? 'yr' : 'yrs'} old</span>
                  </div>
                );
              })}
            </div>

            <p className="who-manage-link">
              <AlertIcon /> Don&rsquo;t see your child here? <Link to="/patient/dependents">Add them on My Dependents</Link> first — not part of this booking flow.
            </p>

            {selectedDependent && (
              <div className="suggestion-banner" style={{ marginTop: 12 }}>
                <span className="suggestion-banner-icon"><AlertIcon /></span>
                <div className="suggestion-banner-text">
                  <p className="suggestion-banner-title">Booking for a minor</p>
                  <p className="suggestion-banner-subtitle">
                    Every later step uses {selectedDependent.full_name}&rsquo;s own info — their own Medical Record
                    and dental history, not yours. You&rsquo;ll give consent on their behalf at the Medical Record step.
                  </p>
                </div>
              </div>
            )}
          </>
        )}

        {/* ---- Step 2: Service ---- */}
        {step === 2 && (
          <>
            <h3 className="section-card-title" style={{ marginBottom: 14 }}>Choose a Service</h3>
            <ServiceSelector
              services={services}
              selectedServiceId={selectedServiceId}
              onSelect={setSelectedServiceId}
            />
            <div className="service-step-notice">
              <span className="service-step-notice-icon" aria-hidden="true">
                <AlertIcon />
              </span>
              <div className="service-step-notice-text">
                <p className="service-step-notice-title">This books your initial consultation</p>
                <p className="service-step-notice-subtitle">
                  The dentist will assess your concern during this visit. If a specific procedure is needed, our
                  staff will schedule a separate follow-up appointment for it.
                </p>
              </div>
            </div>

            {/* General HMO disclaimer — shown the moment the patient lands
                on this step, independent of which service/date they end up
                picking, so they know upfront that an HMO booking isn't
                instantly confirmed. The Date & Time step's own banner below
                (patientType === 'hmo' && selectedDate === todayKey) is the
                sharper, same-day-specific version of this same fact. */}
            {/* Takes priority over the general "needs verification" banner
                below — no point telling a patient about staff verification
                when they can't even submit yet. AppointmentController::
                store() enforces this same block server-side regardless of
                this banner. */}
            {hmoProviderInactive && (
              <div className="suggestion-banner suggestion-banner--danger" style={{ marginTop: 12 }}>
                <span className="suggestion-banner-icon"><ShieldIcon /></span>
                <div className="suggestion-banner-text">
                  <p className="suggestion-banner-title">Your HMO — {hmoProviderName} — is currently disabled by the clinic</p>
                  <p className="suggestion-banner-subtitle">
                    Smile Bay Dental Clinic isn't accepting {hmoProviderName} coverage for new bookings right now.
                    You can still view your existing appointments and records as usual. To book a new appointment,
                    switch your payment type to Cash in My Profile, or contact the clinic to ask about{' '}
                    {hmoProviderName}'s status.
                  </p>
                </div>
              </div>
            )}

            {patientType === 'hmo' && !hmoProviderInactive && (
              <div className="suggestion-banner" style={{ marginTop: 12 }}>
                <span className="suggestion-banner-icon"><ShieldIcon /></span>
                <div className="suggestion-banner-text">
                  <p className="suggestion-banner-title">HMO bookings need staff verification</p>
                  <p className="suggestion-banner-subtitle">
                    Your appointment won't be confirmed right away — our staff reviews your HMO coverage first.
                    We'll notify you once it's approved.
                  </p>
                </div>
              </div>
            )}

            {cancellationPolicy?.warning && (
              <div className="suggestion-banner" style={{ marginTop: 12 }}>
                <span className="suggestion-banner-icon"><AlertIcon /></span>
                <div className="suggestion-banner-text">
                  <p className="suggestion-banner-title">
                    You've had {cancellationPolicy.cancellation_count} cancelled or missed appointment{cancellationPolicy.cancellation_count === 1 ? '' : 's'}
                  </p>
                  <p className="suggestion-banner-subtitle">
                    Reaching {cancellationPolicy.restriction_threshold} will restrict new bookings on this account. Please only
                    book if you're sure you can make it.
                  </p>
                </div>
              </div>
            )}

            {bookingLimits && bookingLimits.dailyCount === bookingLimits.dailyLimit - 1 && (
              <div className="suggestion-banner" style={{ marginTop: 12 }}>
                <span className="suggestion-banner-icon"><AlertIcon /></span>
                <div className="suggestion-banner-text">
                  <p className="suggestion-banner-title">
                    You've booked {bookingLimits.dailyCount} of {bookingLimits.dailyLimit} appointments allowed today
                  </p>
                  <p className="suggestion-banner-subtitle">
                    One more booking today will reach your daily limit — it resets tomorrow.
                  </p>
                </div>
              </div>
            )}

            {bookingLimits && bookingLimits.upcomingCount === bookingLimits.upcomingLimit - 1 && (
              <div className="suggestion-banner" style={{ marginTop: 12 }}>
                <span className="suggestion-banner-icon"><AlertIcon /></span>
                <div className="suggestion-banner-text">
                  <p className="suggestion-banner-title">
                    You have {bookingLimits.upcomingCount} of {bookingLimits.upcomingLimit} upcoming appointments allowed at once
                  </p>
                  <p className="suggestion-banner-subtitle">
                    One more booking will reach that limit — it frees up once an appointment is completed or cancelled.
                  </p>
                </div>
              </div>
            )}

            {/* Dra. Suchelle (the only pediatric dentist — see the Doctor
                step's single-dentist handling) accepts Cash only, no HMO.
                Surfaced the moment the service is picked, not several
                steps later at Payment/Doctor, so an HMO patient isn't led
                through Additional Info first only to hit a dead end.
                AppointmentController::store() enforces this same rule
                server-side regardless of this banner. */}
            {isPediatricService(selectedService) && patientType === 'hmo' && (
              <div className="suggestion-banner suggestion-banner--danger" style={{ marginTop: 12 }}>
                <span className="suggestion-banner-icon"><ShieldIcon /></span>
                <div className="suggestion-banner-text">
                  <p className="suggestion-banner-title">Pediatric Dentistry accepts Cash patients only</p>
                  <p className="suggestion-banner-subtitle">
                    Dr. Suchelle Ann del Castillo-Pascual, our pediatric dentist, does not accept HMO coverage.
                    Please choose a different service, or contact the clinic directly to arrange a Cash visit.
                  </p>
                </div>
              </div>
            )}
          </>
        )}

        {/* ---- Step 2: Date & Time — moved ahead of Doctor. No specific
             dentist is chosen yet, so this always reads the union of every
             dentist credentialed for the service (AppointmentSlotService::
             getAvailableSlotsAnyDentist()/getDayAvailabilitySummaryAnyDentist(),
             the same aggregate the old "Any Available Doctor" card used) —
             a date/time is offered if AT LEAST ONE of them is free then. ---- */}
        {step === 3 && (
          <>
            <h3 className="wizard-step-heading">Pick a Date &amp; Time</h3>
            <p className="wizard-step-subtitle">Day colors reflect real-time availability across every doctor for this service.</p>

            <div className="datetime-layout">
              <div className="calendar-panel">
                <div className="panel-label">
                  <span className="panel-label-icon"><CalendarIcon /></span>
                  <span className="panel-label-text">Select a Date</span>
                </div>

                {loadingDayAvailability ? (
                  <p className="booking-empty-note">Loading…</p>
                ) : (
                  <>
                    <div className="calendar-header">
                      <button
                        type="button"
                        className="calendar-nav-btn"
                        disabled={isPrevDisabled}
                        onClick={() => setCalendarMonth((m) => new Date(m.getFullYear(), m.getMonth() - 1, 1))}
                        aria-label="Previous month"
                      >
                        &#8249;
                      </button>
                      <span className="calendar-month-label">
                        {MONTH_LABELS[calendarMonth.getMonth()]} {calendarMonth.getFullYear()}
                      </span>
                      <button
                        type="button"
                        className="calendar-nav-btn"
                        onClick={() => setCalendarMonth((m) => new Date(m.getFullYear(), m.getMonth() + 1, 1))}
                        aria-label="Next month"
                      >
                        &#8250;
                      </button>
                    </div>

                    <div className="calendar-grid">
                      {WEEKDAY_LABELS.map((wd) => (
                        <span key={wd} className="calendar-weekday">{wd}</span>
                      ))}
                      {calendarCells.map((date, i) => {
                        if (!date) return <span key={`blank-${i}`} className="calendar-cell calendar-cell--blank" />;

                        const key = toDateKey(date);
                        const info = dayAvailability[key] || { status: 'unavailable', count: 0, reason: null, dentists: null };
                        const { status, count, reason, dentists: offDentistNames } = info;
                        const isSelected = key === selectedDate;
                        const isPast = date < today;
                        const tipTone = status === 'unavailable' ? '' : ` calendar-cell-tip--${status}`;

                        return (
                          <button
                            key={key}
                            type="button"
                            className={`calendar-cell calendar-cell--${status}${isSelected ? ' calendar-cell--selected' : ''}`}
                            disabled={status === 'unavailable'}
                            onClick={() => setSelectedDate(key)}
                          >
                            {date.getDate()}
                            <span className={`calendar-cell-tip${tipTone}`}>
                              {slotTooltipText(status, count, isPast, reason, offDentistNames, null)}
                            </span>
                          </button>
                        );
                      })}
                    </div>

                    <div className="calendar-legend">
                      {Object.entries(DAY_STATUS_LABELS).map(([status, label]) => (
                        <span key={status} className={`calendar-legend-item calendar-legend-item--${status}`}>
                          {label}
                        </span>
                      ))}
                    </div>
                    <p className="calendar-legend-hint">
                      <AlertIcon /> Hover any date above to see its exact slot count.
                    </p>
                  </>
                )}
              </div>

              <div className="slots-panel">
                {!selectedDate ? (
                  <p className="booking-empty-note">Select a date to see available times.</p>
                ) : (
                  <>
                    <div className="slots-date-row">
                      <span className="slots-date-icon"><CalendarIcon /></span>
                      <div>
                        <p className="slots-panel-label">Available times for</p>
                        <h4 className="slots-panel-date">{formatDateLong(selectedDate)}</h4>
                      </div>
                    </div>

                    {/* Soft warning, not a block — an HMO booking still goes
                        through AppointmentController::store() normally and
                        lands in pending_verification same as any other date.
                        This just sets expectations: staff may not get to
                        verify coverage before a same-day appointment time
                        arrives. Cash has no verification step, so it's
                        irrelevant there. */}
                    {patientType === 'hmo' && selectedDate === todayKey && (
                      <div className="suggestion-banner">
                        <span className="suggestion-banner-icon"><AlertIcon /></span>
                        <div className="suggestion-banner-text">
                          <p className="suggestion-banner-title">This is a same-day request</p>
                          <p className="suggestion-banner-subtitle">
                            Our staff may not have enough time to verify your HMO coverage before your appointment
                            time. You can still book — if we can't verify in time, we'll contact you to confirm or
                            reschedule.
                          </p>
                        </div>
                      </div>
                    )}

                    {!loadingSlots && !slotsError && slots.length > 0 && !selectedTime && (
                      <p className="wizard-step-subtitle">Please select a time slot to continue</p>
                    )}

                    {loadingSlots ? (
                      <p className="booking-empty-note">Loading…</p>
                    ) : slotsError ? (
                      <p className="booking-empty-note">{slotsError}</p>
                    ) : slots.length === 0 ? (
                      <p className="booking-empty-note">No available times on {formatDateLong(selectedDate)}. Please choose another date.</p>
                    ) : (
                      <>
                        {groupedSlots.morning.length > 0 && (
                          <div className="slots-group">
                            <div className="slots-group-label">
                              <span className="slots-group-icon slots-group-icon--morning"><SunIcon /></span>
                              <span className="slots-group-text">Morning</span>
                            </div>
                            <div className="slots-grid">{groupedSlots.morning.map(renderSlotCard)}</div>
                          </div>
                        )}
                        {groupedSlots.afternoon.length > 0 && (
                          <div className="slots-group">
                            <div className="slots-group-label">
                              <span className="slots-group-icon slots-group-icon--afternoon"><SunsetIcon /></span>
                              <span className="slots-group-text">Afternoon</span>
                            </div>
                            <div className="slots-grid">{groupedSlots.afternoon.map(renderSlotCard)}</div>
                          </div>
                        )}
                        <p className="slots-tz-note">All times shown in Philippine Standard Time (PHT).</p>
                      </>
                    )}
                  </>
                )}
              </div>
            </div>
          </>
        )}

        {/* ---- Step 3: Doctor — now filtered by the exact date+time already
             chosen in step 2 (DentistController::index()'s date/time
             params), so every card here is already confirmed free then;
             no more "Off Today" hint, which would be comparing against the
             wrong date now that a date is already picked. ---- */}
        {step === 4 && (
          <>
            <h3 className="wizard-step-heading">Choose a Doctor</h3>
            <p className="wizard-step-subtitle">
              {selectedService
                ? `Dentists free for ${selectedService.name} on ${formatDateLong(selectedDate)} at ${formatTime12h(selectedTime)}`
                : 'Select the dentist for your visit'}
              {dentists.length > 1
                ? ' — or let us match you with whoever\'s available, useful if this is your first visit and you don\'t know our dentists yet.'
                : ''}
            </p>
            {loadingDentists ? (
              <p>Loading…</p>
            ) : dentistsError ? (
              <div className="dash-empty">
                <span className="dash-empty-title">{dentistsError}</span>
              </div>
            ) : noDentistAvailable ? (
              <div className="dash-empty">
                <AlertIcon />
                <span className="dash-empty-title">That time was just taken</span>
                <p style={{ margin: 0, fontSize: '0.82rem' }}>
                  Nobody credentialed for this service is free at {formatTime12h(selectedTime)} on{' '}
                  {formatDateLong(selectedDate)} anymore — someone else booked it first. Please go back and choose
                  another time.
                </p>
                <button type="button" className="dash-btn" style={{ marginTop: 12 }} onClick={() => setStep(3)}>
                  Back to Date &amp; Time
                </button>
              </div>
            ) : (
              <div className="doctor-grid">
                {/* Only meaningful when there's an actual choice to make —
                    a specialist service with exactly one credentialed
                    dentist (e.g. Pediatric Dentistry) has nobody else "any"
                    could resolve to, so the card is skipped and that one
                    dentist is auto-selected above instead. */}
                {dentists.length > 1 && (
                  <div
                    className={`doctor-card doctor-card--any${resolvingDentist ? ' doctor-card--selected' : ''}`}
                    onClick={() => handleSelectDentist('any')}
                  >
                    <span className="doctor-card-photo doctor-card-photo--any">
                      <UsersIcon />
                    </span>
                    <h4 className="doctor-card-name">Any Available Doctor</h4>
                    <span className="doctor-card-specialty">
                      {resolvingDentist ? 'Finding an available doctor…' : "We'll assign whoever's free at your chosen time"}
                    </span>
                  </div>
                )}

                {dentists.map((dentist) => {
                  const photo = resolvePhotoUrl(dentist.photo_path) || KNOWN_DENTIST_PHOTOS[dentist.name];
                  const credentials = dentist.bio || KNOWN_DENTIST_CREDENTIALS[dentist.name];
                  const isSelected = dentist.id === selectedDentistId;
                  return (
                    <div
                      key={dentist.id}
                      className={`doctor-card${isSelected ? ' doctor-card--selected' : ''}`}
                      onClick={() => handleSelectDentist(dentist.id)}
                    >
                      {isSelected && (
                        <span className="doctor-card-check" aria-hidden="true">
                          <CheckCircleIcon />
                        </span>
                      )}
                      <span className="doctor-card-photo">
                        {photo ? <img src={photo} alt={dentist.name} /> : <UserIcon />}
                      </span>
                      <h4 className="doctor-card-name">{dentist.name}</h4>
                      <span className="doctor-card-specialty">{dentist.specialization || 'General Dentistry'}</span>
                      {credentials && <p className="doctor-card-credentials">{credentials}</p>}
                    </div>
                  );
                })}
              </div>
            )}
            {resolveError && <p className="booking-empty-note">{resolveError}</p>}

            {/* Dra. Suchelle has no fixed weekly schedule — she's on-call
                and personally reviews every pediatric request (see
                AppointmentSlotService::operatingHoursFor()'s is_on_call
                bypass). */}
            {isPediatricService(selectedService) && (
              <div className="suggestion-banner" style={{ marginTop: 12 }}>
                <span className="suggestion-banner-icon"><AlertIcon /></span>
                <div className="suggestion-banner-text">
                  <p className="suggestion-banner-title">Dr. Suchelle is on-call, not tied to fixed daily hours</p>
                  <p className="suggestion-banner-subtitle">
                    She reviews and personally confirms every pediatric booking herself.
                  </p>
                </div>
              </div>
            )}
          </>
        )}

        {/* ---- Step 5: Medical Record (new) — prefilled from the patient's
             (or selected dependent's) last visit (see the fetch-on-mount
             effect above), re-answered fresh every booking so it's never
             stale by the time a dentist actually needs it. ---- */}
        {step === 5 && (
          <MedicalRecordStep
            form={medicalRecordForm}
            onChange={setMedicalRecordForm}
            isFemale={isFemale}
            prefilled={medicalRecordPrefilled}
          />
        )}

        {/* ---- Step 6: Payment (read-only) ---- */}
        {step === 6 && (
          <>
            <h3 className="wizard-step-heading">Payment Method</h3>
            <p className="wizard-step-subtitle">This is set on your account and can’t be changed here.</p>
            <div className="payment-card">
              <span className="payment-card-icon">
                {patientType === 'hmo' ? <ShieldIcon /> : <CashIcon />}
              </span>
              <div>
                <h4 className="payment-card-title">
                  {patientType === 'hmo' ? `HMO${hmoProviderName ? ` — ${hmoProviderName}` : ''}` : 'Cash'}
                </h4>
                <p className="payment-card-note">
                  {patientType === 'hmo'
                    ? 'Your appointment will require staff verification of your HMO coverage before it’s confirmed.'
                    : 'Your appointment will be confirmed instantly upon booking.'}
                </p>
                {patientType !== 'hmo' && (
                  <p className="payment-card-subnote">
                    <AlertIcon />
                    Payment is collected in person at the clinic after your procedure — this system does not
                    process payments online.
                  </p>
                )}
                {isPediatricService(selectedService) && (
                  <p className="payment-card-subnote">
                    <AlertIcon />
                    This booking will also need confirmation from our Pediatric Dentistry specialist first.
                  </p>
                )}
                {hmoProviderInactive && (
                  <p className="payment-card-subnote">
                    <AlertIcon />
                    {hmoProviderName} is currently disabled by the clinic — switch to Cash in My Profile to book.
                  </p>
                )}
              </div>
            </div>
          </>
        )}

        {/* ---- Step 7: Summary ---- */}
        {step === 7 && (
          <>
            <h3 className="wizard-step-heading">Review &amp; Confirm</h3>
            <p className="wizard-step-subtitle">Please check your appointment details before confirming.</p>
            <div className="summary-card">
              <div className="summary-row">
                <span className="summary-label">Patient</span>
                <span className="summary-value">
                  {selectedDependent ? `${selectedDependent.full_name} (${RELATIONSHIP_LABELS[selectedDependent.relationship_to_parent] || selectedDependent.relationship_to_parent})` : 'Myself'}
                </span>
              </div>
              <div className="summary-row">
                <span className="summary-label">Doctor</span>
                <span className="summary-value">{selectedDentist?.name}</span>
              </div>
              <div className="summary-row">
                <span className="summary-label">Service</span>
                <span className="summary-value">{selectedService?.name} ({selectedService?.duration_minutes} min)</span>
              </div>
              <div className="summary-row">
                <span className="summary-label">Payment Method</span>
                <span className="summary-value">
                  {patientType === 'hmo' ? `HMO${hmoProviderName ? ` — ${hmoProviderName}` : ''}` : 'Cash'}
                </span>
              </div>
              <div className="summary-row">
                <span className="summary-label">Date</span>
                <span className="summary-value">{formatDateLong(selectedDate)}</span>
              </div>
              <div className="summary-row">
                <span className="summary-label">Time</span>
                <span className="summary-value">{formatTime12h(selectedTime)}</span>
              </div>
            </div>

            <div className="summary-card" style={{ marginTop: 12 }}>
              <div className="summary-row" style={{ borderBottom: 'none' }}>
                <span className="summary-label">Medical Record</span>
                <span className="summary-value">
                  {medicalRecordFlags.length > 0 ? medicalRecordFlags.join(', ') : 'No health concerns declared'}
                </span>
              </div>
            </div>

            <p className="summary-note">Please arrive a few minutes before your scheduled time.</p>

            {/* Client-side preview only — ClinicalSafetyService on the
                backend is the authoritative check, run again at submit
                time. This just sets expectations before they click
                Confirm, same spirit as the HMO/pediatric banners below. */}
            {willNeedMedicalReview && (
              <div className="suggestion-banner suggestion-banner--danger" style={{ marginTop: 12 }}>
                <span className="suggestion-banner-icon"><ShieldIcon /></span>
                <div className="suggestion-banner-text">
                  <p className="suggestion-banner-title">This will need a dentist's review first</p>
                  <p className="suggestion-banner-subtitle">
                    Something in your Medical Record answers needs your dentist's clinical sign-off for{' '}
                    {selectedService?.name} specifically. You can still submit — we'll email you once it's reviewed.
                  </p>
                </div>
              </div>
            )}

            {hmoProviderInactive && (
              <div className="suggestion-banner suggestion-banner--danger" style={{ marginTop: 12 }}>
                <span className="suggestion-banner-icon"><ShieldIcon /></span>
                <div className="suggestion-banner-text">
                  <p className="suggestion-banner-title">Can't confirm — {hmoProviderName} is disabled by the clinic</p>
                  <p className="suggestion-banner-subtitle">
                    Switch your payment type to Cash in My Profile to book this appointment, or contact the clinic
                    to ask about {hmoProviderName}'s status.
                  </p>
                </div>
              </div>
            )}

            <div className="suggestion-banner" style={{ marginTop: 12 }}>
              <span className="suggestion-banner-icon"><AlertIcon /></span>
              <div className="suggestion-banner-text">
                <p className="suggestion-banner-title">Avoid cancelling once confirmed</p>
                <p className="suggestion-banner-subtitle">
                  Repeated cancellations or missed visits can restrict new bookings on your account after{' '}
                  {cancellationPolicy?.restriction_threshold ?? 3} strikes.
                </p>
              </div>
            </div>

            {submitError && (
              <div className="dash-empty" style={{ marginTop: 12 }}>
                <span className="dash-empty-title">{submitError}</span>
              </div>
            )}
          </>
        )}

        <div className="wizard-nav">
          {step > 1 && (
            <button
              type="button"
              className="dash-btn dash-btn--outline wizard-nav-back"
              onClick={goBack}
              disabled={submitting}
            >
              Back
            </button>
          )}

          {step < STEPS.length ? (
            <button type="button" className="dash-btn" onClick={goNext} disabled={!canGoNext}>
              Next
            </button>
          ) : (
            <button
              type="button"
              className="dash-btn"
              onClick={() => (nextAppointment ? setShowDuplicateWarning(true) : handleConfirm())}
              disabled={submitting || bookingLimitBlocked || hmoProviderInactive}
              title={hmoProviderInactive ? `${hmoProviderName} is disabled by the clinic` : bookingLimitBlocked ? bookingLimitBanner?.title : undefined}
            >
              {submitting ? 'Booking…' : 'Confirm Booking'}
            </button>
          )}
        </div>
      </div>

      <Modal open={showDuplicateWarning} onClose={() => setShowDuplicateWarning(false)}>
        <div className="modal-feedback">
          <span className="modal-feedback-icon modal-feedback-icon--warning">
            <AlertIcon />
          </span>
          <h3 className="modal-feedback-title">You Already Have an Upcoming Appointment</h3>
          <p className="modal-feedback-text">Do you still want to book this one too?</p>

          {nextAppointment && (
            <div className="modal-feedback-details">
              <strong>Service:</strong> {nextAppointment.service?.name}<br />
              {nextAppointment.dentist?.name && <><strong>Doctor:</strong> {nextAppointment.dentist.name}<br /></>}
              <strong>Date:</strong> {formatDateLong(nextAppointment.appointment_date)}<br />
              <strong>Time:</strong> {formatTime12h(nextAppointment.appointment_time)}
            </div>
          )}

          <div className="modal-actions" style={{ width: '100%' }}>
            <button
              type="button"
              className="dash-btn dash-btn--outline"
              style={{ flex: 1 }}
              onClick={() => setShowDuplicateWarning(false)}
            >
              Cancel
            </button>
            <button
              type="button"
              className="dash-btn"
              style={{ flex: 1 }}
              onClick={() => {
                setShowDuplicateWarning(false);
                handleConfirm();
              }}
            >
              Yes, Book Anyway
            </button>
          </div>
        </div>
      </Modal>

      <Modal open={!!result} onClose={closeResultModal} closeOnBackdrop={false}>
        {result && (
          <div className="modal-feedback">
            <span className={`modal-feedback-icon modal-feedback-icon--${result.tone}`}>
              {result.tone === 'success' ? <CheckCircleIcon /> : <AlertIcon />}
            </span>
            <h3 className="modal-feedback-title">
              {result.tone === 'success' ? 'Appointment Confirmed!' : 'Booking Request Submitted'}
            </h3>
            <p className="modal-feedback-text">
              {result.tone === 'success'
                ? 'Your appointment is confirmed. We look forward to seeing you.'
                : PENDING_MESSAGES[result.pendingReason]}
            </p>
            <div className="modal-feedback-details">
              {selectedDependent && <><strong>Patient:</strong> {selectedDependent.full_name}<br /></>}
              <strong>Doctor:</strong> {selectedDentist?.name}<br />
              <strong>Service:</strong> {selectedService?.name}<br />
              <strong>Date:</strong> {formatDateLong(selectedDate)}<br />
              <strong>Time:</strong> {formatTime12h(selectedTime)}
            </div>
            <div className="modal-actions" style={{ width: '100%' }}>
              <button type="button" className="dash-btn" style={{ width: '100%' }} onClick={closeResultModal}>
                Done
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

export default BookAppointment;
