import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import {
  getFollowUpRecommendations,
  getAvailableSlots,
  getDayAvailability,
  createAppointment,
  getPatientDashboardSummary,
} from '../../api/appointments';
import Modal from './components/Modal';
import { CheckCircleIcon, AlertIcon, ShieldIcon, CashIcon, CalendarPlusIcon, ClockIcon } from './icons';
import { formatDateLong, formatTime12h } from './dateTimeUtils';
import { KNOWN_DENTIST_PHOTOS } from './dentistPhotos';
import './dashboards.css';
import './BookAppointment.css';

// No separate service- or doctor-selection step — the procedure and doctor
// are both fixed by the recommendation (Step 1 shows, never picks, either):
// whoever saw this patient and flagged the follow-up is who it's booked
// with, same as walking back into the same dentist's room for a planned
// next step, not a fresh doctor search.
const STEPS = ['Your Procedure', 'Additional Info', 'Payment', 'Date & Time', 'Summary'];
const WEEKDAY_LABELS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const MONTH_LABELS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const DAY_STATUS_LABELS = {
  available: 'Available',
  limited: 'Limited Slots',
  full: 'Fully Booked',
  unavailable: 'Unavailable',
};

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

function BookFollowUp() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [step, setStep] = useState(1);

  const [recommendations, setRecommendations] = useState([]);
  const [loadingReference, setLoadingReference] = useState(true);
  const [referenceError, setReferenceError] = useState('');
  const [selectedRecommendationId, setSelectedRecommendationId] = useState(null);

  const [notes, setNotes] = useState('');
  const [selectedDate, setSelectedDate] = useState(null);
  const [selectedTime, setSelectedTime] = useState(null);
  const [calendarMonth, setCalendarMonth] = useState(() => startOfDay(new Date()));

  const [slots, setSlots] = useState([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [slotsError, setSlotsError] = useState('');

  const [dayAvailability, setDayAvailability] = useState({});
  const [loadingDayAvailability, setLoadingDayAvailability] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [result, setResult] = useState(null);

  // Same repeat-booking nudge as BookAppointment.jsx — see its own comment
  // for why (cash auto-confirms with no down payment, so nothing else stops
  // spam/no-show bookings). Still relevant here: a follow-up can be enabled
  // more than once over time, same as any other appointment.
  const [nextAppointment, setNextAppointment] = useState(null);
  const [showDuplicateWarning, setShowDuplicateWarning] = useState(false);

  // 3-strike cancellation policy — same as BookAppointment.jsx. A follow-up
  // is still a self-service booking through the same endpoint, so it's
  // blocked the same way.
  const [cancellationPolicy, setCancellationPolicy] = useState(null);

  const patientType = user?.patient?.patient_type;
  const hmoProviderName = user?.patient?.hmo_provider?.name || user?.patient?.hmo_company_name;

  useEffect(() => {
    getPatientDashboardSummary()
      .then((summary) => {
        setNextAppointment(summary?.nextAppointment || null);
        setCancellationPolicy(summary?.cancellationPolicy || null);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    (async () => {
      setLoadingReference(true);
      setReferenceError('');
      try {
        const list = await getFollowUpRecommendations();
        setRecommendations(list);
        // Only one recommendation is the common case — pre-select it so
        // Step 1 can render as a locked confirmation instead of a picker.
        if (list.length === 1) setSelectedRecommendationId(list[0].id);
      } catch {
        setReferenceError('Could not load your follow-up recommendations. Please refresh the page.');
      } finally {
        setLoadingReference(false);
      }
    })();
  }, []);

  const selectedRecommendation = useMemo(
    () => recommendations.find((r) => r.id === selectedRecommendationId) || null,
    [recommendations, selectedRecommendationId]
  );
  const selectedService = selectedRecommendation?.recommended_follow_up_service || null;
  const selectedServiceId = selectedService?.id || null;
  // Fixed to whoever recommended this follow-up — see the note on STEPS
  // above. Comes straight off the recommendation, never a separate pick.
  const selectedDentist = selectedRecommendation?.dentist || null;
  const selectedDentistId = selectedDentist?.id || null;

  useEffect(() => {
    if (!selectedDate || !selectedDentistId || !selectedServiceId) {
      setSlots([]);
      return;
    }

    (async () => {
      setLoadingSlots(true);
      setSlotsError('');
      setSelectedTime(null);
      try {
        // .suggestion (an alternate-dentist offer) is deliberately ignored
        // here — the dentist is fixed to whoever recommended this
        // follow-up, never switchable, so there's nothing to offer an
        // alternate for.
        const result = await getAvailableSlots(selectedDentistId, selectedServiceId, selectedDate);
        setSlots(result.slots);
      } catch {
        setSlotsError('Could not load available times for that date. Please try another date.');
      } finally {
        setLoadingSlots(false);
      }
    })();
  }, [selectedDate, selectedDentistId, selectedServiceId]);

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
        setDayAvailability({});
      } finally {
        setLoadingDayAvailability(false);
      }
    })();
  }, [selectedDentistId, selectedServiceId, calendarMonth]);

  const canGoNext = {
    1: !!selectedRecommendationId,
    2: !!notes.trim(),
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
        notes,
        date: selectedDate,
        time: selectedTime,
        fulfillsAppointmentId: selectedRecommendationId,
      });
      const isConfirmed = response.data.status === 'confirmed';
      const isPediatric = isPediatricService(selectedService);

      setResult({
        tone: isConfirmed ? 'success' : 'warning',
        pendingReason: isConfirmed ? null : isPediatric ? (patientType === 'hmo' ? 'pediatric_hmo' : 'pediatric_cash') : 'hmo',
        appointment: response.data,
      });
    } catch (err) {
      if (err.response?.status === 409) {
        setSubmitError(err.response.data.message);
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
      } else if (err.response?.status === 422 && err.response.data?.errors?.fulfills_appointment_id) {
        // The recommendation was consumed elsewhere (e.g. staff booked it by
        // phone) since this page loaded — send them back to My Appointments
        // rather than letting them retry into the same dead end.
        setSubmitError(err.response.data.errors.fulfills_appointment_id[0]);
      } else {
        setSubmitError(err.response?.data?.message || 'Something went wrong. Please try again.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const closeResultModal = () => {
    setResult(null);
    navigate('/patient/appointments');
  };

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

  if (cancellationPolicy?.restricted) {
    return (
      <div className="section-card">
        <div className="dash-empty">
          <AlertIcon />
          <span className="dash-empty-title">New Bookings Restricted</span>
          <p style={{ margin: 0, fontSize: '0.82rem' }}>
            This account has had repeated cancelled appointments, so new self-service bookings are currently
            restricted. Please contact the clinic directly to book an appointment.
          </p>
        </div>
      </div>
    );
  }

  if (recommendations.length === 0) {
    return (
      <div className="section-card">
        <div className="dash-empty">
          <CalendarPlusIcon />
          <span className="dash-empty-title">No follow-up available right now</span>
          <p style={{ margin: 0, fontSize: '0.82rem' }}>
            Your dental assistant enables this after your dentist recommends a specific procedure.
          </p>
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

        {/* ---- Step 1: Your Procedure — locked to whichever recommendation
             staff enabled (Appointments.css's own .service-card look, but
             not clickable-to-change when there's only one). More than one
             open recommendation: patient picks which to book now, same
             card style, genuinely selectable. ---- */}
        {step === 1 && (
          <>
            <h3 className="wizard-step-heading">Your Follow-up Procedure</h3>
            <p className="wizard-step-subtitle">
              {recommendations.length === 1
                ? 'Recommended by your dentist after a recent visit.'
                : 'You have more than one follow-up available — choose which to book now.'}
            </p>

            <div className="followup-recommend-list">
              {recommendations.map((rec) => {
                const isSelected = rec.id === selectedRecommendationId;
                return (
                  <div
                    key={rec.id}
                    className={`followup-recommend-card${isSelected ? ' followup-recommend-card--selected' : ''}`}
                    onClick={() => setSelectedRecommendationId(rec.id)}
                  >
                    <span className="followup-recommend-icon" aria-hidden="true">
                      <CalendarPlusIcon />
                    </span>
                    <div className="followup-recommend-text">
                      <span className="followup-recommend-name">{rec.recommended_follow_up_service.name}</span>
                      <span className="followup-recommend-meta">
                        <ClockIcon /> {rec.recommended_follow_up_service.duration_minutes} minutes
                        {rec.dentist?.name ? ` · after your visit with ${rec.dentist.name}` : ''}
                      </span>
                    </div>
                    {isSelected && (
                      <span className="followup-recommend-check" aria-hidden="true">
                        <CheckCircleIcon />
                      </span>
                    )}
                  </div>
                );
              })}
            </div>

            {selectedDentist && (
              <div className="followup-doctor-note">
                <span className="followup-doctor-photo">
                  {(selectedDentist.photo_path || KNOWN_DENTIST_PHOTOS[selectedDentist.name])
                    ? <img src={selectedDentist.photo_path || KNOWN_DENTIST_PHOTOS[selectedDentist.name]} alt={selectedDentist.name} />
                    : selectedDentist.name?.[0]}
                </span>
                <span>
                  Booked with <strong>{selectedDentist.name}</strong> — the dentist who recommended this follow-up.
                </span>
              </div>
            )}

            <p className="booking-empty-note" style={{ textAlign: 'left', padding: '10px 2px' }}>
              This was enabled by our staff based on your dentist's assessment — the procedure and doctor can't be
              changed here. Contact the clinic if this isn't right.
            </p>

            {cancellationPolicy?.warning && (
              <div className="suggestion-banner" style={{ marginTop: 12 }}>
                <span className="suggestion-banner-icon"><AlertIcon /></span>
                <div className="suggestion-banner-text">
                  <p className="suggestion-banner-title">You've had {cancellationPolicy.cancellation_count} cancelled appointments</p>
                  <p className="suggestion-banner-subtitle">
                    Reaching {cancellationPolicy.restriction_threshold} will restrict new bookings on this account. Please only
                    book if you're sure you can make it.
                  </p>
                </div>
              </div>
            )}
          </>
        )}

        {/* ---- Step 2: Additional Information ---- */}
        {step === 2 && (
          <>
            <h3 className="wizard-step-heading">Additional Information</h3>
            <p className="wizard-step-subtitle">
              Tell us more so the dentist can prepare for your follow-up visit.
            </p>
            <textarea
              className="form-textarea"
              rows={5}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Please provide additional details about your appointment…"
              maxLength={1000}
              required
            />
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

        {/* ---- Step 4: Calendar & time slots — the real, duration-aware
             slot grid, identical to the regular booking wizard: picking
             10:00 AM for a 60-minute procedure reserves 10:00-11:00 in
             full, same guarantee as any other appointment. ---- */}
        {step === 4 && (
          <>
            <h3 className="wizard-step-heading">Pick a Date &amp; Time</h3>
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
                    ) : slots.length === 0 ? (
                      <p className="booking-empty-note">No available times on {formatDateLong(selectedDate)}. Please choose another date.</p>
                    ) : (
                      <>
                        {groupedSlots.morning.length > 0 && (
                          <div className="slots-group">
                            <p className="slots-group-label">Morning</p>
                            <div className="slots-grid">{groupedSlots.morning.map(renderSlotCard)}</div>
                          </div>
                        )}
                        {groupedSlots.afternoon.length > 0 && (
                          <div className="slots-group">
                            <p className="slots-group-label">Afternoon</p>
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
                <span className="summary-label">Procedure</span>
                <span className="summary-value">{selectedService?.name} ({selectedService?.duration_minutes} min)</span>
              </div>
              <div className="summary-row">
                <span className="summary-label">Additional Information</span>
                <span className="summary-value">{notes}</span>
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
              Picking this time reserves the full {selectedService?.duration_minutes}-minute window — same guarantee
              as any other appointment. Need to reschedule or cancel? You can do so anytime from My Appointments.
            </p>

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
              disabled={submitting}
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
              {result.tone === 'success' ? 'Follow-up Confirmed!' : 'Booking Request Submitted'}
            </h3>
            <p className="modal-feedback-text">
              {result.tone === 'success'
                ? 'Your follow-up appointment is confirmed. We look forward to seeing you.'
                : PENDING_MESSAGES[result.pendingReason]}
            </p>
            <div className="modal-feedback-details">
              <strong>Doctor:</strong> {selectedDentist?.name}<br />
              <strong>Procedure:</strong> {selectedService?.name}<br />
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

export default BookFollowUp;
