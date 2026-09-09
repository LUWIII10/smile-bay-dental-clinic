import { useEffect, useRef, useState } from 'react';
import Modal from './Modal';
import {
  searchPatients,
  registerWalkInPatient,
  assignWalkIn,
  getDentists,
  getAvailableSlots,
} from '../../../api/appointments';
import api from '../../../api';
import { formatDateLong, formatTime12h } from '../dateTimeUtils';
import styles from './WalkInBookingModal.module.css';

const SEARCH_DEBOUNCE_MS = 300;
const STEP_LABELS = ['Patient', 'Service', 'Dentist', 'Date & Time'];
const SERVICE_CATEGORIES = ['General Dentistry', 'Cosmetic Dentistry', 'Orthodontics', 'Specialist Services'];

const EMPTY_NEW_PATIENT_FORM = {
  first_name: '',
  middle_name: '',
  last_name: '',
  date_of_birth: '',
  sex: '',
  mobile_number: '',
  email: '',
  patient_type: 'cash',
  hmo_provider_id: '',
  hmo_number: '',
  hmo_company_name: '',
};

function todayDateKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Two entry points, one modal:
 *  - Entry Point 1 ("+ Book Walk-In Patient" header button): selectedSlotData
 *    is null -> full 4-step wizard (Patient, Service, Dentist, Date & Time),
 *    Steps 2-4 backed by the same getServices/getDentists/getAvailableSlots
 *    endpoints the patient-facing booking wizard uses, so "real open slots"
 *    means the exact same AppointmentSlotService math, not a re-derivation.
 *  - Entry Point 2 (row-level "Assign Walk-In" on a cancelled row):
 *    selectedSlotData carries that row's service/dentist/date/time — those
 *    are locked read-only (re-assigning the identical freed slot, not a
 *    fresh booking), so staff only ever complete patient selection.
 *
 * Either way, POST /api/staff/appointments/walk-in re-validates the slot is
 * still actually free server-side (AppointmentSlotService::isSlotAvailable)
 * before creating anything — never trust that it's still open just because
 * it looked open when this modal opened.
 *
 * Patient selection (Step 1, both entry points) also covers the "this
 * person has no Smile Bay record at all" case — a genuine first-time
 * walk-in, or a patient who'll never self-register through the online
 * portal (e.g. someone unfamiliar with the online flow). "+ Register a new
 * patient" switches to a short front-desk form (POST /api/staff/patients,
 * registerWalkInPatient()) that creates the account pre-verified, no OTP —
 * the staff member looking at this patient in person is a stronger identity
 * check than an email round-trip. Email is optional there too: without one,
 * the backend synthesizes a placeholder from the mobile number, since
 * users.email can't be null — that account just can't be self-serviced by
 * the patient later, which is the correct outcome for that persona.
 */
function WalkInBookingModal({ open, onClose, selectedSlotData, services, onSuccess }) {
  const isPrefilled = !!selectedSlotData;

  const [step, setStep] = useState(1);

  const [patientQuery, setPatientQuery] = useState('');
  const [patientResults, setPatientResults] = useState([]);
  const [searchingPatients, setSearchingPatients] = useState(false);
  const [selectedPatient, setSelectedPatient] = useState(null);

  // Step 1 has two sub-views: searching for an existing patient (default),
  // or registering one on the spot when nothing turns up — a first-time
  // walk-in, or a patient (e.g. elderly, unfamiliar with the online
  // registration flow) who'll never self-register through the portal.
  const [addingNewPatient, setAddingNewPatient] = useState(false);
  const [newPatientForm, setNewPatientForm] = useState(EMPTY_NEW_PATIENT_FORM);
  const [hmoProviders, setHmoProviders] = useState([]);
  const [savingNewPatient, setSavingNewPatient] = useState(false);
  const [newPatientError, setNewPatientError] = useState('');
  const [newPatientNotice, setNewPatientNotice] = useState('');

  const [serviceId, setServiceId] = useState('');
  const [dentistOptions, setDentistOptions] = useState([]);
  const [loadingDentists, setLoadingDentists] = useState(false);
  const [dentistId, setDentistId] = useState('');

  const [date, setDate] = useState(todayDateKey());
  const [timeSlots, setTimeSlots] = useState([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [time, setTime] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const patientDebounceRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    setStep(1);
    setPatientQuery('');
    setPatientResults([]);
    setSelectedPatient(null);
    setError('');
    setSubmitting(false);
    setAddingNewPatient(false);
    setNewPatientForm(EMPTY_NEW_PATIENT_FORM);
    setNewPatientError('');
    setNewPatientNotice('');

    if (selectedSlotData) {
      setServiceId(String(selectedSlotData.service_id));
      setDentistId(String(selectedSlotData.dentist_id));
      setDate(selectedSlotData.appointment_date);
      setTime(selectedSlotData.appointment_time);
    } else {
      setServiceId('');
      setDentistId('');
      setDentistOptions([]);
      setDate(todayDateKey());
      setTime('');
      setTimeSlots([]);
    }
  }, [open, selectedSlotData]);

  useEffect(() => {
    clearTimeout(patientDebounceRef.current);
    if (patientQuery.trim().length < 2) {
      setPatientResults([]);
      return undefined;
    }
    patientDebounceRef.current = setTimeout(async () => {
      setSearchingPatients(true);
      try {
        setPatientResults(await searchPatients(patientQuery.trim()));
      } catch {
        setPatientResults([]);
      } finally {
        setSearchingPatients(false);
      }
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(patientDebounceRef.current);
  }, [patientQuery]);

  // Only needed once the staff member actually opens the new-patient form,
  // and only matters for the HMO branch of it — no point fetching this on
  // every modal open.
  useEffect(() => {
    if (!addingNewPatient || hmoProviders.length > 0) return;
    api.get('/api/hmo-providers').then((response) => {
      setHmoProviders(response.data.data);
    }).catch(() => {
      // Left empty — the HMO provider select just shows no options, same
      // graceful-degradation as every other reference-data fetch here.
    });
  }, [addingNewPatient, hmoProviders.length]);

  // Step 3 data source — dentists credentialed for the chosen service.
  // Skipped entirely in prefilled mode (dentist is already fixed).
  useEffect(() => {
    if (!open || isPrefilled || !serviceId) return;
    (async () => {
      setLoadingDentists(true);
      setDentistId('');
      try {
        setDentistOptions(await getDentists(serviceId));
      } catch {
        setDentistOptions([]);
      } finally {
        setLoadingDentists(false);
      }
    })();
  }, [open, isPrefilled, serviceId]);

  // Step 4 data source — real available slots for dentist+service+date.
  useEffect(() => {
    if (!open || isPrefilled || !dentistId || !serviceId || !date) return;
    (async () => {
      setLoadingSlots(true);
      setTime('');
      try {
        const result = await getAvailableSlots(dentistId, serviceId, date);
        setTimeSlots(result.slots || []);
      } catch {
        setTimeSlots([]);
      } finally {
        setLoadingSlots(false);
      }
    })();
  }, [open, isPrefilled, dentistId, serviceId, date]);

  const canSubmit = !!(selectedPatient && serviceId && dentistId && date && time);

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setError('');
    try {
      await assignWalkIn({ patientId: selectedPatient.id, dentistId, serviceId, date, time });
      onSuccess();
    } catch (err) {
      setError(err.response?.data?.message || 'Could not book this walk-in appointment.');
    } finally {
      setSubmitting(false);
    }
  };

  const canSubmitNewPatient = !!(
    newPatientForm.first_name.trim() &&
    newPatientForm.last_name.trim() &&
    newPatientForm.date_of_birth &&
    newPatientForm.sex &&
    newPatientForm.mobile_number.trim() &&
    (newPatientForm.patient_type === 'cash' ||
      (newPatientForm.hmo_provider_id && newPatientForm.hmo_number.trim() && newPatientForm.hmo_company_name.trim()))
  );

  const submitNewPatient = async () => {
    if (!canSubmitNewPatient) return;
    setSavingNewPatient(true);
    setNewPatientError('');
    try {
      const payload = {
        first_name: newPatientForm.first_name.trim(),
        middle_name: newPatientForm.middle_name.trim() || null,
        last_name: newPatientForm.last_name.trim(),
        date_of_birth: newPatientForm.date_of_birth,
        sex: newPatientForm.sex,
        mobile_number: newPatientForm.mobile_number.trim(),
        email: newPatientForm.email.trim() || null,
        patient_type: newPatientForm.patient_type,
        hmo_provider_id: newPatientForm.patient_type === 'hmo' ? newPatientForm.hmo_provider_id : null,
        hmo_number: newPatientForm.patient_type === 'hmo' ? newPatientForm.hmo_number.trim() : null,
        hmo_company_name: newPatientForm.patient_type === 'hmo' ? newPatientForm.hmo_company_name.trim() : null,
      };
      const created = await registerWalkInPatient(payload);
      setSelectedPatient(created);
      setAddingNewPatient(false);
      setNewPatientForm(EMPTY_NEW_PATIENT_FORM);
      // Only worth surfacing when there's no real email on file — that
      // placeholder address is the one thing about this new account that
      // isn't obvious from the "selected patient" summary alone.
      if (!payload.email) {
        setNewPatientNotice(`Account created — no email on file, so this patient can't sign in to the portal themselves (${created.user.email}).`);
      }
    } catch (err) {
      setNewPatientError(err.response?.data?.message || 'Could not register this patient.');
    } finally {
      setSavingNewPatient(false);
    }
  };

  const canGoNext =
    (step === 1 && !!selectedPatient) ||
    (step === 2 && !!serviceId) ||
    (step === 3 && !!dentistId);

  const patientPicker = selectedPatient ? (
    <>
      <div className={styles.selectedPatient}>
        <span>{selectedPatient.first_name} {selectedPatient.last_name} ({selectedPatient.user?.email})</span>
        <button
          type="button"
          className={styles.linkBtn}
          onClick={() => { setSelectedPatient(null); setNewPatientNotice(''); }}
        >
          Change
        </button>
      </div>
      {newPatientNotice && <div className={styles.hint}>{newPatientNotice}</div>}
    </>
  ) : addingNewPatient ? (
    <>
      <div className={styles.formGrid}>
        <input
          type="text"
          className={styles.input}
          placeholder="First name"
          value={newPatientForm.first_name}
          onChange={(e) => setNewPatientForm((p) => ({ ...p, first_name: e.target.value }))}
        />
        <input
          type="text"
          className={styles.input}
          placeholder="Middle name (optional)"
          value={newPatientForm.middle_name}
          onChange={(e) => setNewPatientForm((p) => ({ ...p, middle_name: e.target.value }))}
        />
        <input
          type="text"
          className={`${styles.input} ${styles.formGridFull}`}
          placeholder="Last name"
          value={newPatientForm.last_name}
          onChange={(e) => setNewPatientForm((p) => ({ ...p, last_name: e.target.value }))}
        />
        <input
          type="date"
          className={styles.input}
          max={todayDateKey()}
          value={newPatientForm.date_of_birth}
          onChange={(e) => setNewPatientForm((p) => ({ ...p, date_of_birth: e.target.value }))}
        />
        <select
          className={styles.input}
          value={newPatientForm.sex}
          onChange={(e) => setNewPatientForm((p) => ({ ...p, sex: e.target.value }))}
        >
          <option value="">Sex</option>
          <option value="male">Male</option>
          <option value="female">Female</option>
        </select>
        <input
          type="tel"
          className={styles.input}
          placeholder="Mobile number (09XXXXXXXXX)"
          value={newPatientForm.mobile_number}
          onChange={(e) => setNewPatientForm((p) => ({ ...p, mobile_number: e.target.value.replace(/\D/g, '').slice(0, 11) }))}
        />
        <input
          type="email"
          className={styles.input}
          placeholder="Email (optional)"
          value={newPatientForm.email}
          onChange={(e) => setNewPatientForm((p) => ({ ...p, email: e.target.value }))}
        />
      </div>
      <div className={styles.hint}>
        No email? Leave it blank — this patient just won't be able to sign in to the portal themselves; staff can still book for them anytime.
      </div>

      <select
        className={styles.input}
        value={newPatientForm.patient_type}
        onChange={(e) => setNewPatientForm((p) => ({ ...p, patient_type: e.target.value }))}
      >
        <option value="cash">Cash Patient</option>
        <option value="hmo">HMO Covered Patient</option>
      </select>

      {newPatientForm.patient_type === 'hmo' && (
        <div className={styles.formGrid}>
          <select
            className={`${styles.input} ${styles.formGridFull}`}
            value={newPatientForm.hmo_provider_id}
            onChange={(e) => setNewPatientForm((p) => ({ ...p, hmo_provider_id: e.target.value }))}
          >
            <option value="">Select HMO Provider</option>
            {hmoProviders.map((provider) => (
              <option key={provider.id} value={provider.id}>{provider.name}</option>
            ))}
          </select>
          <input
            type="text"
            className={styles.input}
            placeholder="HMO card / member ID"
            value={newPatientForm.hmo_number}
            onChange={(e) => setNewPatientForm((p) => ({ ...p, hmo_number: e.target.value }))}
          />
          <input
            type="text"
            className={styles.input}
            placeholder="Company name / employer"
            value={newPatientForm.hmo_company_name}
            onChange={(e) => setNewPatientForm((p) => ({ ...p, hmo_company_name: e.target.value }))}
          />
        </div>
      )}

      {newPatientError && <div className={styles.errorNote}>{newPatientError}</div>}

      <div className={styles.footer} style={{ marginTop: 4 }}>
        <button type="button" className={styles.secondaryBtn} onClick={() => setAddingNewPatient(false)}>
          Back to Search
        </button>
        <div className={styles.footerSpacer} />
        <button
          type="button"
          className={styles.primaryBtn}
          disabled={!canSubmitNewPatient || savingNewPatient}
          onClick={submitNewPatient}
        >
          {savingNewPatient ? 'Registering…' : 'Register Patient'}
        </button>
      </div>
    </>
  ) : (
    <>
      <input
        type="text"
        className={styles.input}
        placeholder="Search by patient name or email…"
        value={patientQuery}
        onChange={(e) => setPatientQuery(e.target.value)}
      />
      {patientQuery.trim().length >= 2 && (
        <div className={styles.resultsList}>
          {searchingPatients ? (
            <div className={styles.resultRow}>Searching…</div>
          ) : patientResults.length === 0 ? (
            <div className={styles.resultRow}>No matching patients.</div>
          ) : (
            patientResults.map((p) => (
              <button
                key={p.id}
                type="button"
                className={styles.resultRow}
                onClick={() => { setSelectedPatient(p); setPatientQuery(''); setPatientResults([]); }}
              >
                <span className={styles.resultName}>{p.first_name} {p.last_name}</span>
                <span className={styles.resultMeta}>{p.user?.email} &middot; {p.patient_type === 'cash' ? 'Cash' : 'HMO'}</span>
              </button>
            ))
          )}
        </div>
      )}
      <button type="button" className={styles.linkBtn} onClick={() => setAddingNewPatient(true)}>
        + No record yet? Register a new patient
      </button>
    </>
  );

  return (
    <Modal open={open} onClose={onClose} title={isPrefilled ? 'Assign Walk-In' : 'Book Walk-In Patient'}>
      {isPrefilled ? (
        <div className={styles.stepBody}>
          <div className={styles.summaryCard}>
            <div><strong>Service:</strong> {selectedSlotData.service_name}</div>
            <div><strong>Dentist:</strong> {selectedSlotData.dentist_name}</div>
            <div>
              <strong>Date &amp; Time:</strong> {formatDateLong(selectedSlotData.appointment_date)} at{' '}
              {formatTime12h(selectedSlotData.appointment_time)}
            </div>
          </div>
          <div className={styles.fieldLabel}>Patient</div>
          {patientPicker}
        </div>
      ) : (
        <>
          <div className={styles.stepper}>
            {STEP_LABELS.map((label, idx) => {
              const num = idx + 1;
              const cls = num === step ? styles.stepDotActive : num < step ? styles.stepDotDone : styles.stepDot;
              return (
                <div key={label} className={cls}>
                  <span className={styles.stepNum}>{num}</span>
                  <span className={styles.stepLabel}>{label}</span>
                </div>
              );
            })}
          </div>

          {step === 1 && <div className={styles.stepBody}>{patientPicker}</div>}

          {step === 2 && (
            <div className={styles.stepBody}>
              {SERVICE_CATEGORIES.map((cat) => {
                const inCat = services.filter((s) => s.category === cat);
                if (inCat.length === 0) return null;
                return (
                  <div key={cat} className={styles.serviceGroup}>
                    <div className={styles.serviceGroupLabel}>{cat}</div>
                    <div className={styles.serviceGrid}>
                      {inCat.map((s) => (
                        <button
                          key={s.id}
                          type="button"
                          className={String(s.id) === serviceId ? styles.serviceCardSelected : styles.serviceCard}
                          onClick={() => setServiceId(String(s.id))}
                        >
                          {s.name}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {step === 3 && (
            <div className={styles.stepBody}>
              {loadingDentists ? (
                <div className={styles.hint}>Loading dentists…</div>
              ) : dentistOptions.length === 0 ? (
                <div className={styles.hint}>No dentists are credentialed for this service.</div>
              ) : (
                <div className={styles.dentistList}>
                  {dentistOptions.map((d) => (
                    <button
                      key={d.id}
                      type="button"
                      className={String(d.id) === dentistId ? styles.dentistCardSelected : styles.dentistCard}
                      onClick={() => setDentistId(String(d.id))}
                    >
                      {d.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {step === 4 && (
            <div className={styles.stepBody}>
              <input
                type="date"
                className={styles.input}
                value={date}
                min={todayDateKey()}
                onChange={(e) => setDate(e.target.value)}
              />
              {loadingSlots ? (
                <div className={styles.hint}>Loading open slots…</div>
              ) : timeSlots.length === 0 ? (
                <div className={styles.hint}>No open slots for this date.</div>
              ) : (
                <div className={styles.slotGrid}>
                  {timeSlots.map((t) => (
                    <button
                      key={t}
                      type="button"
                      className={t === time ? styles.slotBtnSelected : styles.slotBtn}
                      onClick={() => setTime(t)}
                    >
                      {formatTime12h(t)}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}

      {error && <div className={styles.errorNote}>{error}</div>}

      {/* The new-patient form (inside patientPicker) has its own Back to
          Search / Register Patient footer — this one would just duplicate
          it (and "Next" would be permanently disabled anyway, since
          selectedPatient is null while it's open). */}
      {!addingNewPatient && (
        <div className={styles.footer}>
          {!isPrefilled && step > 1 ? (
            <button type="button" className={styles.secondaryBtn} onClick={() => setStep(step - 1)}>
              Back
            </button>
          ) : (
            <button type="button" className={styles.secondaryBtn} onClick={onClose}>
              Cancel
            </button>
          )}
          <div className={styles.footerSpacer} />
          {!isPrefilled && step < 4 ? (
            <button type="button" className={styles.primaryBtn} disabled={!canGoNext} onClick={() => setStep(step + 1)}>
              Next
            </button>
          ) : (
            <button type="button" className={styles.primaryBtn} disabled={!canSubmit || submitting} onClick={handleSubmit}>
              {submitting ? 'Booking…' : 'Book Walk-In'}
            </button>
          )}
        </div>
      )}
    </Modal>
  );
}

export default WalkInBookingModal;
