import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import {
  getServices,
  getDentists,
  getAvailableSlots,
  getDayAvailability,
  resolveDentist,
  createAppointment,
  getPatientDashboardSummary,
} from '../../api/appointments';
import Modal from './components/Modal';
import ServiceSelector from './components/ServiceSelector';
import StatusBadge from './components/StatusBadge';
import { CheckCircleIcon, AlertIcon, ShieldIcon, UserIcon, UsersIcon, CashIcon, SwapIcon, CalendarIcon, SunIcon, SunsetIcon } from './icons';
import { formatDateLong, formatTime12h } from './dateTimeUtils';
import { KNOWN_DENTIST_PHOTOS, KNOWN_DENTIST_CREDENTIALS } from './dentistPhotos';
import { resolvePhotoUrl } from './avatarUtils';
import './dashboards.css';
import './BookAppointment.css';

const STEPS = ['Service', 'Additional Info', 'Doctor', 'Payment', 'Date & Time', 'Summary'];
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

  const [selectedDentistId, setSelectedDentistId] = useState(null);
  const [selectedServiceId, setSelectedServiceId] = useState(null);
  const [notes, setNotes] = useState('');
  const [selectedDate, setSelectedDate] = useState(null);
  const [selectedTime, setSelectedTime] = useState(null);
  const [calendarMonth, setCalendarMonth] = useState(() => startOfDay(new Date()));

  const [slots, setSlots] = useState([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [slotsError, setSlotsError] = useState('');
  const [resolvingDentist, setResolvingDentist] = useState(false);
  const [resolveError, setResolveError] = useState('');
  // Set right before an "Any Available Doctor" resolution replaces
  // selectedDentistId with the real, resolved id — tells the slots-fetch
  // effect below (which normally treats any selectedDentistId change as "a
  // different dentist was picked, clear the stale time choice") to keep the
  // time the patient just confirmed instead of wiping it out from under them.
  const skipTimeResetRef = useRef(false);
  // Smart doctor-switch suggestion for the currently selected date, or null
  // when the selected dentist has nothing meaningfully worse than an
  // eligible alternate — see AppointmentSlotService::findSwitchSuggestion().
  const [suggestion, setSuggestion] = useState(null);

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

  // Doctor step is now second and depends on which service was picked first
  // — only dentists credentialed for that service come back (e.g. only the
  // pediatric dentist for the pediatric service). A previously-picked
  // dentist is cleared whenever the service changes, since they may not be
  // credentialed for the new one.
  useEffect(() => {
    setSelectedDentistId(null);

    if (!selectedServiceId) {
      setDentists([]);
      return;
    }

    (async () => {
      setLoadingDentists(true);
      setDentistsError('');
      try {
        const dentistList = await getDentists(selectedServiceId);
        setDentists(dentistList);
        // Only one dentist is ever credentialed for a specialist service
        // like Pediatric Dentistry (DentistController::index() already
        // filters to exactly that) — "Any Available Doctor" would just be
        // a second way to pick the same one person, so skip the redundant
        // choice and go straight to them.
        if (dentistList.length === 1) {
          setSelectedDentistId(dentistList[0].id);
        }
      } catch {
        setDentistsError('Could not load doctors for this service. Please try again.');
      } finally {
        setLoadingDentists(false);
      }
    })();
  }, [selectedServiceId]);

  const selectedDentist = useMemo(
    () => dentists.find((d) => d.id === selectedDentistId) || null,
    [dentists, selectedDentistId]
  );
  const selectedService = useMemo(
    () => services.find((s) => s.id === selectedServiceId) || null,
    [services, selectedServiceId]
  );

  useEffect(() => {
    if (!selectedDate || !selectedDentistId || !selectedServiceId) {
      setSlots([]);
      setSuggestion(null);
      return;
    }

    const skipTimeReset = skipTimeResetRef.current;
    skipTimeResetRef.current = false;

    (async () => {
      setLoadingSlots(true);
      setSlotsError('');
      if (!skipTimeReset) setSelectedTime(null);
      try {
        const result = await getAvailableSlots(selectedDentistId, selectedServiceId, selectedDate);
        setSlots(result.slots);
        setSuggestion(result.suggestion || null);
      } catch {
        setSlotsError('Could not load available times for that date. Please try another date.');
        setSuggestion(null);
      } finally {
        setLoadingSlots(false);
      }
    })();
  }, [selectedDate, selectedDentistId, selectedServiceId]);

  // "Any Available Doctor" resolution — called instead of setSelectedTime()
  // directly when selectedDentistId is still the 'any' sentinel. Resolves
  // to a real dentist (load-balanced across whoever's actually free at this
  // exact slot) and swaps selectedDentistId over to that real id, so every
  // step after this one (Payment, Summary, Confirm) proceeds completely
  // unchanged, as an ordinary single-dentist booking.
  const handleAnyDoctorSlotClick = async (time) => {
    setResolvingDentist(true);
    setResolveError('');
    try {
      const dentist = await resolveDentist(selectedServiceId, selectedDate, time);
      skipTimeResetRef.current = true;
      setSelectedDentistId(dentist.id);
      setSelectedTime(time);
    } catch (err) {
      setResolveError(err.response?.data?.message || 'That time is no longer available with any doctor. Please choose another.');
      try {
        const refreshed = await getAvailableSlots('any', selectedServiceId, selectedDate);
        setSlots(refreshed.slots);
      } catch {
        // Slot list just won't refresh — the inline error still explains what happened.
      }
    } finally {
      setResolvingDentist(false);
    }
  };

  // Banner's "Switch to Dr. Y" — just reassigns the selected dentist while
  // staying on step 4; the effect above re-fetches slots (and clears
  // selectedTime, which already happens on every dentist change, so a time
  // that isn't valid for the new dentist is never silently carried over).
  const handleSwitchDentist = () => {
    if (!suggestion) return;
    setSelectedDentistId(suggestion.alternate_dentist_id);
  };

  useEffect(() => {
    if (!selectedDentistId || !selectedServiceId) {
      setDayAvailability({});
      return;
    }

    (async () => {
      setLoadingDayAvailability(true);
      try {
        const data = await getDayAvailability(selectedDentistId, selectedServiceId, toMonthKey(calendarMonth));
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
  }, [selectedDentistId, selectedServiceId, calendarMonth]);

  const canGoNext = {
    1: !!selectedServiceId && !(isPediatricService(selectedService) && patientType === 'hmo'),
    2: true,
    3: !!selectedDentistId,
    4: true,
    5: !!selectedDate && !!selectedTime,
    6: false,
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
        notes,
        date: selectedDate,
        time: selectedTime,
      });
      const isConfirmed = response.data.status === 'confirmed';
      const isPediatric = isPediatricService(selectedService);

      setResult({
        tone: isConfirmed ? 'success' : 'warning',
        // Only meaningful when tone is 'warning' — which of the three
        // pending_verification reasons applies, so the modal can show the
        // right copy instead of always assuming HMO.
        pendingReason: isConfirmed ? null : isPediatric ? (patientType === 'hmo' ? 'pediatric_hmo' : 'pediatric_cash') : 'hmo',
        appointment: response.data,
      });
    } catch (err) {
      if (err.response?.status === 409) {
        setSubmitError(err.response.data.message);
        // The slot grid the patient saw is now stale — refresh it and send
        // them back to re-pick rather than letting them resubmit blindly.
        setSelectedTime(null);
        setStep(5);
        if (selectedDate) {
          try {
            const refreshed = await getAvailableSlots(selectedDentistId, selectedServiceId, selectedDate);
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

  // Without a suggestion, every returned slot is already genuinely bookable
  // (the API never returns taken/past ones) — plain display grouping. With
  // one, suggestion.full_range_slots spans the full gap between the
  // selected dentist and the better-available alternate, so times outside
  // the selected dentist's own hours still render (as disabled) instead of
  // silently vanishing, per the "show what you're missing" design.
  const groupedSlots = useMemo(() => {
    const bookableSet = new Set(slots);
    const displayTimes = suggestion ? suggestion.full_range_slots : slots;
    const rows = displayTimes.map((t) => ({ time: t, bookable: bookableSet.has(t) }));

    return {
      morning: rows.filter((r) => Number(r.time.split(':')[0]) < 12),
      afternoon: rows.filter((r) => Number(r.time.split(':')[0]) >= 12),
    };
  }, [slots, suggestion]);

  // A group's header goes into the muted-red "reduced" state only when the
  // selected dentist has zero real slots in it AND there's a suggestion
  // worth explaining why (otherwise a plain empty group just doesn't render
  // at all, same as before this feature).
  const isGroupReduced = (rows) => !!suggestion && rows.length > 0 && !rows.some((r) => r.bookable);

  const renderSlotCard = ({ time, bookable }) => {
    const isSelected = time === selectedTime;
    return (
      <button
        key={time}
        type="button"
        disabled={!bookable || resolvingDentist}
        className={`slot-card${isSelected ? ' slot-card--selected' : ''}${!bookable ? ' slot-card--disabled' : ''}`}
        onClick={() => {
          if (!bookable) return;
          if (selectedDentistId === 'any') {
            handleAnyDoctorSlotClick(time);
          } else {
            setSelectedTime(time);
          }
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

        {/* ---- Step 1: Service ---- */}
        {step === 1 && (
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

        {/* ---- Step 2: Additional Information — free-text notes describing
             the patient's concern/symptoms, optional. Helps the dentist
             prepare for the initial assessment, especially now that the
             patient-facing service list (is_patient_bookable) is
             deliberately generalized (e.g. "Tooth Extraction" no longer
             distinguishes simple vs. surgical at booking time) — but not
             every patient has more to add beyond the service they already
             picked, so this no longer blocks the wizard. ---- */}
        {step === 2 && (
          <>
            <h3 className="wizard-step-heading">Additional Information</h3>
            <p className="wizard-step-subtitle">
              Tell us more about your concern so the dentist can prepare for your visit (optional).
            </p>
            <textarea
              className="form-textarea"
              rows={5}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Please provide additional details about your appointment… (optional)"
              maxLength={1000}
            />
          </>
        )}

        {/* ---- Step 3: Doctor — fetched filtered by the service just chosen,
             so e.g. the pediatric service only ever offers the pediatric
             dentist, never Ramirez/Castro. ---- */}
        {step === 3 && (
          <>
            <h3 className="wizard-step-heading">Choose a Doctor</h3>
            <p className="wizard-step-subtitle">
              {selectedService ? `Dentists available for ${selectedService.name}` : 'Select the dentist for your visit'}
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
            ) : (
              <div className="doctor-grid">
                {/* Only meaningful when there's an actual choice to make —
                    a specialist service with exactly one credentialed
                    dentist (e.g. Pediatric Dentistry) has nobody else "any"
                    could resolve to, so the card is skipped and that one
                    dentist is auto-selected above instead. */}
                {dentists.length > 1 && (
                  <div
                    className={`doctor-card doctor-card--any${selectedDentistId === 'any' ? ' doctor-card--selected' : ''}`}
                    onClick={() => setSelectedDentistId('any')}
                  >
                    {selectedDentistId === 'any' && (
                      <span className="doctor-card-check" aria-hidden="true">
                        <CheckCircleIcon />
                      </span>
                    )}
                    <span className="doctor-card-photo doctor-card-photo--any">
                      <UsersIcon />
                    </span>
                    <h4 className="doctor-card-name">Any Available Doctor</h4>
                    <span className="doctor-card-specialty">We'll assign whoever's free at your chosen time</span>
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
                      onClick={() => setSelectedDentistId(dentist.id)}
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
                      {/* Informational only, never disables the card — this
                          is TODAY's duty status specifically (the Doctor
                          step comes before Date & Time, so there's no
                          chosen date yet to check against). A dentist off
                          today may still be exactly right for a later date;
                          the Date & Time calendar is what actually enforces
                          this once a real date is picked. */}
                      {dentist.on_duty_today === false && (
                        <StatusBadge status="Off Today" tone="amber" />
                      )}
                      {credentials && <p className="doctor-card-credentials">{credentials}</p>}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Dra. Suchelle has no fixed weekly schedule — she's on-call
                and personally reviews every pediatric request (see
                AppointmentSlotService::operatingHoursFor()'s is_on_call
                bypass). Surfaced here, next to her "Off Today" hint (which
                is informational only and never blocks a booking), so that
                hint doesn't read as "she's unavailable" before the patient
                even reaches Date & Time. */}
            {isPediatricService(selectedService) && (
              <div className="suggestion-banner" style={{ marginTop: 12 }}>
                <span className="suggestion-banner-icon"><AlertIcon /></span>
                <div className="suggestion-banner-text">
                  <p className="suggestion-banner-title">Dr. Suchelle is on-call, not tied to fixed daily hours</p>
                  <p className="suggestion-banner-subtitle">
                    The "Off Today" hint above is informational only — it won't stop you from requesting any day
                    ahead. She reviews and personally confirms every pediatric booking herself.
                  </p>
                </div>
              </div>
            )}
          </>
        )}

        {/* ---- Step 4: Payment (read-only) ---- */}
        {step === 4 && (
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

        {/* ---- Step 5: Calendar & time slots ---- */}
        {step === 5 && (
          <>
            <h3 className="wizard-step-heading">Pick a Date & Time</h3>
            <p className="wizard-step-subtitle">Day colors reflect real-time availability for this doctor and service.</p>

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
                              {slotTooltipText(status, count, isPast, reason, offDentistNames, selectedDentist?.name)}
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
                      <p className="wizard-step-subtitle">
                        {selectedDentistId === 'any'
                          ? "Please select a time slot to continue — we'll assign the doctor for you"
                          : 'Please select a time slot to continue'}
                      </p>
                    )}

                    {resolvingDentist && <p className="booking-empty-note">Finding an available doctor…</p>}
                    {resolveError && <p className="booking-empty-note">{resolveError}</p>}

                    {loadingSlots ? (
                      <p className="booking-empty-note">Loading…</p>
                    ) : slotsError ? (
                      <p className="booking-empty-note">{slotsError}</p>
                    ) : slots.length === 0 && !suggestion ? (
                      <p className="booking-empty-note">No available times on {formatDateLong(selectedDate)}. Please choose another date.</p>
                    ) : (
                      <>
                        {suggestion && (
                          <div className="suggestion-banner">
                            <span className="suggestion-banner-icon"><AlertIcon /></span>
                            <div className="suggestion-banner-text">
                              <p className="suggestion-banner-title">
                                {selectedDentist?.name} is unavailable
                                {suggestion.reason === 'reduced'
                                  ? ` after ${formatTime12h(suggestion.unavailable_after)} on this date`
                                  : ' on this date'}
                              </p>
                              <p className="suggestion-banner-subtitle">
                                {suggestion.alternate_dentist_name} is available at your requested time
                              </p>
                            </div>
                            <button type="button" className="suggestion-banner-btn" onClick={handleSwitchDentist}>
                              <SwapIcon /> Switch to {suggestion.alternate_dentist_name}
                            </button>
                          </div>
                        )}

                        {groupedSlots.morning.length > 0 && (
                          <div className="slots-group">
                            <div className="slots-group-label">
                              <span className="slots-group-icon slots-group-icon--morning"><SunIcon /></span>
                              <span className={`slots-group-text${isGroupReduced(groupedSlots.morning) ? ' slots-group-text--reduced' : ''}`}>
                                Morning
                              </span>
                            </div>
                            <div className="slots-grid">{groupedSlots.morning.map(renderSlotCard)}</div>
                          </div>
                        )}
                        {groupedSlots.afternoon.length > 0 && (
                          <div className="slots-group">
                            <div className="slots-group-label">
                              <span className="slots-group-icon slots-group-icon--afternoon"><SunsetIcon /></span>
                              <span className={`slots-group-text${isGroupReduced(groupedSlots.afternoon) ? ' slots-group-text--reduced' : ''}`}>
                                Afternoon
                              </span>
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

        {/* ---- Step 6: Summary ---- */}
        {step === 6 && (
          <>
            <h3 className="wizard-step-heading">Review &amp; Confirm</h3>
            <p className="wizard-step-subtitle">Please check your appointment details before confirming.</p>
            <div className="summary-card">
              <div className="summary-row">
                <span className="summary-label">Doctor</span>
                <span className="summary-value">{selectedDentist?.name}</span>
              </div>
              <div className="summary-row">
                <span className="summary-label">Service</span>
                <span className="summary-value">{selectedService?.name} ({selectedService?.duration_minutes} min)</span>
              </div>
              <div className="summary-row">
                <span className="summary-label">Additional Information</span>
                <span className="summary-value">{notes.trim() || 'None provided'}</span>
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

            <p className="summary-note">Please arrive a few minutes before your scheduled time.</p>

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
