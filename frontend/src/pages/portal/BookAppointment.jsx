import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import {
  getServices,
  getDentists,
  getAvailableSlots,
  getDayAvailability,
  createAppointment,
} from '../../api/appointments';
import Modal from './components/Modal';
import ServiceSelector from './components/ServiceSelector';
import { CheckCircleIcon, AlertIcon, ShieldIcon, UserIcon, CashIcon, SwapIcon } from './icons';
import { formatDateLong, formatTime12h } from './dateTimeUtils';
import { KNOWN_DENTIST_PHOTOS, KNOWN_DENTIST_CREDENTIALS } from './dentistPhotos';
import './dashboards.css';
import './BookAppointment.css';

const STEPS = ['Service', 'Doctor', 'Payment', 'Date & Time', 'Summary'];
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
  const { user } = useAuth();
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
  const [selectedDate, setSelectedDate] = useState(null);
  const [selectedTime, setSelectedTime] = useState(null);
  const [calendarMonth, setCalendarMonth] = useState(() => startOfDay(new Date()));

  const [slots, setSlots] = useState([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [slotsError, setSlotsError] = useState('');
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

  const patientType = user?.patient?.patient_type;
  // hmoProvider is only present now that AuthController::me() eager-loads
  // it — falls back to the free-text "Other" company name a patient could
  // have entered at registration instead of picking from the dropdown.
  const hmoProviderName = user?.patient?.hmo_provider?.name || user?.patient?.hmo_company_name;

  useEffect(() => {
    (async () => {
      setLoadingReference(true);
      setReferenceError('');
      try {
        const serviceList = await getServices();
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

    (async () => {
      setLoadingSlots(true);
      setSlotsError('');
      setSelectedTime(null);
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
    1: !!selectedServiceId,
    2: !!selectedDentistId,
    3: true,
    4: !!selectedDate && !!selectedTime,
    5: false,
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
        setStep(4);
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
        disabled={!bookable}
        className={`slot-card${isSelected ? ' slot-card--selected' : ''}${!bookable ? ' slot-card--disabled' : ''}`}
        onClick={() => bookable && setSelectedTime(time)}
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
                  <span className="wizard-step-circle">{num < step ? '✓' : num}</span>
                  <span className="wizard-step-label">{label}</span>
                </div>
                {num < STEPS.length && <div className="wizard-step-line" />}
              </div>
            );
          })}
        </div>

        {/* ---- Step 1: Service ---- */}
        {step === 1 && (
          <>
            <h3 className="section-card-title" style={{ marginBottom: 14 }}>Choose a Service</h3>
            <ServiceSelector
              services={services}
              selectedServiceId={selectedServiceId}
              onSelect={setSelectedServiceId}
            />
          </>
        )}

        {/* ---- Step 2: Doctor — fetched filtered by the service just chosen,
             so e.g. the pediatric service only ever offers the pediatric
             dentist, never Ramirez/Castro. ---- */}
        {step === 2 && (
          <>
            <h3 className="wizard-step-heading">Choose a Doctor</h3>
            <p className="wizard-step-subtitle">
              {selectedService ? `Dentists available for ${selectedService.name}` : 'Select the dentist for your visit'}
            </p>
            {loadingDentists ? (
              <p>Loading…</p>
            ) : dentistsError ? (
              <div className="dash-empty">
                <span className="dash-empty-title">{dentistsError}</span>
              </div>
            ) : dentists.length === 0 ? (
              <p className="booking-empty-note">No dentists are available for this service right now.</p>
            ) : (
              <div className="doctor-grid">
                {dentists.map((dentist) => {
                  const photo = dentist.photo_path || KNOWN_DENTIST_PHOTOS[dentist.name];
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
                      {credentials && <p className="doctor-card-credentials">{credentials}</p>}
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}

        {/* ---- Step 3: Payment (read-only) ---- */}
        {step === 3 && (
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
                {isPediatricService(selectedService) && (
                  <p className="payment-card-subnote">
                    <AlertIcon />
                    This booking will also need confirmation from our Pediatric Dentistry specialist first.
                  </p>
                )}
              </div>
            </div>
          </>
        )}

        {/* ---- Step 4: Calendar & time slots ---- */}
        {step === 4 && (
          <>
            <h3 className="wizard-step-heading">Pick a Date & Time</h3>
            <p className="wizard-step-subtitle">Day colors reflect real-time availability for this doctor and service.</p>

            <div className="datetime-layout">
              <div className="calendar-panel">
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
                        const status = dayAvailability[key] || 'unavailable';
                        const isSelected = key === selectedDate;

                        return (
                          <button
                            key={key}
                            type="button"
                            className={`calendar-cell calendar-cell--${status}${isSelected ? ' calendar-cell--selected' : ''}`}
                            disabled={status === 'unavailable'}
                            onClick={() => setSelectedDate(key)}
                            title={DAY_STATUS_LABELS[status]}
                          >
                            {date.getDate()}
                          </button>
                        );
                      })}
                    </div>

                    <div className="calendar-legend">
                      {Object.entries(DAY_STATUS_LABELS).map(([status, label]) => (
                        <span key={status} className="calendar-legend-item">
                          <span className={`calendar-legend-dot calendar-legend-dot--${status}`} aria-hidden="true" />
                          {label}
                        </span>
                      ))}
                    </div>
                  </>
                )}
              </div>

              <div className="slots-panel">
                {!selectedDate ? (
                  <p className="booking-empty-note">Select a date to see available times.</p>
                ) : (
                  <>
                    <p className="slots-panel-label">Available times for</p>
                    <h4 className="slots-panel-date">{formatDateLong(selectedDate)}</h4>

                    {!loadingSlots && !slotsError && slots.length > 0 && !selectedTime && (
                      <p className="wizard-step-subtitle">Please select a time slot to continue</p>
                    )}

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
                            <p className={`slots-group-label${isGroupReduced(groupedSlots.morning) ? ' slots-group-label--reduced' : ''}`}>
                              Morning
                            </p>
                            <div className="slots-grid">{groupedSlots.morning.map(renderSlotCard)}</div>
                          </div>
                        )}
                        {groupedSlots.afternoon.length > 0 && (
                          <div className="slots-group">
                            <p className={`slots-group-label${isGroupReduced(groupedSlots.afternoon) ? ' slots-group-label--reduced' : ''}`}>
                              Afternoon
                            </p>
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

        {/* ---- Step 5: Summary ---- */}
        {step === 5 && (
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

            <p className="summary-note">
              Please arrive a few minutes before your scheduled time. Need to reschedule or cancel? You can do so
              anytime from My Appointments, or by contacting the clinic directly.
            </p>

            {submitError && (
              <div className="dash-empty" style={{ marginTop: 12 }}>
                <span className="dash-empty-title">{submitError}</span>
              </div>
            )}
          </>
        )}

        <div className="wizard-nav">
          {step > 1 ? (
            <button type="button" className="dash-btn dash-btn--outline" onClick={goBack} disabled={submitting}>
              Back
            </button>
          ) : <span />}

          {step < STEPS.length ? (
            <button type="button" className="dash-btn" onClick={goNext} disabled={!canGoNext}>
              Next
            </button>
          ) : (
            <button type="button" className="dash-btn" onClick={handleConfirm} disabled={submitting}>
              {submitting ? 'Booking…' : 'Confirm Booking'}
            </button>
          )}
        </div>
      </div>

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
