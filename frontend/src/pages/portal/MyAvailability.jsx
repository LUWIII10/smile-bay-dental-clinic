import { useCallback, useEffect, useState } from 'react';
import {
  getDentistAvailability,
  getDentistMonthSummary,
  updateDentistWeeklyHours,
  addDentistDayOff,
  deleteDentistDayOff,
  addDentistSpecialWorkingDay,
  deleteDentistSpecialWorkingDay,
  addDentistServiceLimit,
  deleteDentistServiceLimit,
} from '../../api/appointments';
import Modal from './components/Modal';
import PageHeader from './components/PageHeader';
import RescheduleModal from './components/RescheduleModal';
import StatusBadge from './components/StatusBadge';
import { CalendarXIcon, CalendarPlusIcon, TrashIcon, ClockIcon, AlertIcon, ToothIcon } from './icons';
import { formatDateLong, formatTime12h } from './dateTimeUtils';
import { classifyHistoryCategory } from './dentalRecordShared';
import './dashboards.css';
import './Appointments.css';
import './BookAppointment.css';
import './MyAvailability.css';

const DAY_NAMES = { 1: 'Monday', 2: 'Tuesday', 3: 'Wednesday', 4: 'Thursday', 5: 'Friday', 6: 'Saturday' };
const EDITABLE_DAYS = [1, 2, 3, 4, 5, 6];
const WEEKDAY_LABELS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const MONTH_LABELS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const DAY_STATUS_LABELS = { available: 'Available', limited: 'Limited Slots', full: 'Fully Booked', unavailable: 'Unavailable' };

// Same Treatment/Diagnostic/Procedure/Consultation taxonomy Treatment
// History already groups by (classifyHistoryCategory in dentalRecordShared)
// — reused here to group the service-limit picker's chips, so a dentist
// sees the same categories everywhere instead of a flat alphabetical list.
const CATEGORY_ORDER = [
  { key: 'procedure', label: 'Procedure', dotClass: 'avail-chip-dot--procedure' },
  { key: 'consultation', label: 'Consultation', dotClass: 'avail-chip-dot--consultation' },
  { key: 'diagnostic', label: 'Diagnostic', dotClass: 'avail-chip-dot--diagnostic' },
  { key: 'treatment', label: 'Treatment', dotClass: 'avail-chip-dot--treatment' },
];

function startOfDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function toDateKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// dayOffs is already filtered to today-and-later by the backend (see
// DentistAvailabilityService::forDentist()) — no need to filter past dates
// again here. Returns the soonest upcoming day-off that falls on this
// weekday, plus how many total (for "+N more"), or null if none.
function nextDayOffForDayOfWeek(dayOfWeek, dayOffs) {
  const matches = dayOffs
    .filter((d) => new Date(`${d.date}T00:00:00`).getDay() === dayOfWeek)
    .sort((a, b) => a.date.localeCompare(b.date));

  return matches.length > 0 ? { date: matches[0].date, count: matches.length } : null;
}

function ToggleSwitch({ checked, onChange, label }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      className={`toggle-switch${checked ? ' toggle-switch--on' : ''}`}
      onClick={() => onChange(!checked)}
    />
  );
}

function ConflictModal({ open, onClose, onConfirm, confirming, conflicts }) {
  return (
    <Modal open={open} onClose={onClose} title="These appointments are already booked">
      <p style={{ margin: '0 0 12px', fontSize: '0.85rem', color: 'var(--portal-muted)' }}>
        This change would move the affected time outside your available hours, but the appointments below are
        already booked. They will NOT be cancelled — only future slot availability changes.
      </p>
      <ul className="conflict-list">
        {conflicts.map((c) => (
          <li key={c.id} className="conflict-list-item">
            <span className="conflict-list-date">{formatDateLong(c.date)}</span>
            <span className="conflict-list-meta">
              {formatTime12h(c.time)} — {c.patient_name}
              {c.service_name ? ` (${c.service_name})` : ''}
            </span>
          </li>
        ))}
      </ul>
      <div className="modal-actions">
        <button type="button" className="dash-btn dash-btn--outline" onClick={onClose}>
          Cancel
        </button>
        <button type="button" className="dash-btn dash-btn--danger" disabled={confirming} onClick={onConfirm}>
          {confirming ? 'Saving…' : 'Save Anyway'}
        </button>
      </div>
    </Modal>
  );
}

function MyAvailability() {
  const [weeklyHours, setWeeklyHours] = useState([]);
  const [dayOffs, setDayOffs] = useState([]);
  const [isOnCall, setIsOnCall] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState('');
  const [saveError, setSaveError] = useState('');

  const [dayOffFormOpen, setDayOffFormOpen] = useState(false);
  const [dayOffDate, setDayOffDate] = useState('');
  const [dayOffReason, setDayOffReason] = useState('');
  const [addingDayOff, setAddingDayOff] = useState(false);
  const [dayOffFormError, setDayOffFormError] = useState('');
  const [deletingId, setDeletingId] = useState(null);

  // Special Working Days — the inverse of Upcoming days off: a dentist's
  // own opt-in to a date Settings > Special Opening Dates already opened
  // clinic-wide. specialWorkingDays is this dentist's own list;
  // availableSpecialDates is what the "Add Special Working Day" picker
  // offers — clinic-opened dates not yet opted into, never a free-form
  // calendar (a dentist can only opt into a date the clinic actually
  // opened).
  const [specialWorkingDays, setSpecialWorkingDays] = useState([]);
  const [availableSpecialDates, setAvailableSpecialDates] = useState([]);
  const [specialDayFormOpen, setSpecialDayFormOpen] = useState(false);
  const [selectedSpecialDate, setSelectedSpecialDate] = useState('');
  const [specialStartTime, setSpecialStartTime] = useState('');
  const [specialEndTime, setSpecialEndTime] = useState('');
  const [addingSpecialDay, setAddingSpecialDay] = useState(false);
  const [specialDayFormError, setSpecialDayFormError] = useState('');
  const [deletingSpecialId, setDeletingSpecialId] = useState(null);

  // Service Limits — optional, per-date restriction to a subset of the
  // services this dentist is credentialed for. credentialedServices is
  // every active service they're linked to at all (what the chip picker
  // offers); serviceLimits is their own saved per-date restrictions.
  const [credentialedServices, setCredentialedServices] = useState([]);
  const [serviceLimits, setServiceLimits] = useState([]);
  const [limitFormOpen, setLimitFormOpen] = useState(false);
  const [limitDate, setLimitDate] = useState('');
  const [limitServiceIds, setLimitServiceIds] = useState([]);
  const [limitFormError, setLimitFormError] = useState('');
  const [addingLimit, setAddingLimit] = useState(false);
  const [deletingLimitId, setDeletingLimitId] = useState(null);
  // The "+ Limit a Day" calendar — same Available/Limited/Fully Booked/
  // Unavailable look and data shape as the patient booking calendar, just
  // scoped to this dentist's own general day fullness (see
  // DentistAvailabilityController::monthSummary()).
  const [limitCalendarMonth, setLimitCalendarMonth] = useState(() => startOfDay(new Date()));
  const [limitMonthSummary, setLimitMonthSummary] = useState({});
  const [loadingLimitMonthSummary, setLoadingLimitMonthSummary] = useState(false);
  // No "save anyway" here — unlike every other conflict on this page, this
  // one only ever clears by the dentist actually proposing a new time for
  // each conflicting appointment (see the explicit requirement this
  // feature shipped with: an already-booked patient's visit is never
  // quietly left stranded against a restriction that contradicts it).
  // { date, serviceIds, conflicts } while open; conflicts shrinks as each
  // one gets a reschedule proposed, and an empty list auto-retries the save.
  const [limitConflict, setLimitConflict] = useState(null);
  const [rescheduleTarget, setRescheduleTarget] = useState(null);

  // type: 'weekly_hours' | 'day_off'. payload carries exactly what was
  // already conflict-checked, so "Save anyway" resubmits the identical
  // request with confirm=true rather than re-reading possibly-changed state.
  const [conflictModal, setConflictModal] = useState(null);
  const [confirming, setConfirming] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await getDentistAvailability();
      setWeeklyHours(data.weekly_hours);
      setDayOffs(data.day_offs);
      setIsOnCall(!!data.is_on_call);
      setSpecialWorkingDays(data.special_working_days || []);
      setAvailableSpecialDates(data.available_special_dates || []);
      setServiceLimits(data.service_limits || []);
      setCredentialedServices(data.credentialed_services || []);
    } catch {
      setError('Could not load your availability. Please refresh the page.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!limitFormOpen) return;
    const monthKey = `${limitCalendarMonth.getFullYear()}-${String(limitCalendarMonth.getMonth() + 1).padStart(2, '0')}`;
    setLoadingLimitMonthSummary(true);
    getDentistMonthSummary(monthKey)
      .then(setLimitMonthSummary)
      .catch(() => setLimitMonthSummary({}))
      .finally(() => setLoadingLimitMonthSummary(false));
  }, [limitFormOpen, limitCalendarMonth]);

  const updateDay = (dayOfWeek, patch) => {
    setSaveMessage('');
    setWeeklyHours((prev) => prev.map((row) => (row.day_of_week === dayOfWeek ? { ...row, ...patch } : row)));
  };

  const handleSaveWeeklyHours = async (confirm = false) => {
    setSaving(true);
    setSaveError('');
    if (!confirm) setSaveMessage('');
    try {
      const response = await updateDentistWeeklyHours(weeklyHours, confirm);
      if (response.conflicts) {
        setConflictModal({ type: 'weekly_hours', conflicts: response.conflicting_appointments });
      } else {
        setWeeklyHours(response.data.weekly_hours);
        setDayOffs(response.data.day_offs);
        setSaveMessage('Weekly hours saved.');
        setConflictModal(null);
      }
    } catch (err) {
      setSaveError(err.response?.data?.message || 'Could not save your weekly hours.');
    } finally {
      setSaving(false);
      setConfirming(false);
    }
  };

  const openDayOffForm = () => {
    setDayOffFormError('');
    setDayOffDate('');
    setDayOffReason('');
    setDayOffFormOpen(true);
  };

  const handleAddDayOff = async (confirm = false) => {
    if (!confirm && !dayOffDate) {
      setDayOffFormError('Please pick a date.');
      return;
    }
    setAddingDayOff(true);
    setDayOffFormError('');
    try {
      const response = await addDentistDayOff({ date: dayOffDate, reason: dayOffReason }, confirm);
      if (response.conflicts) {
        setDayOffFormOpen(false);
        setConflictModal({ type: 'day_off', conflicts: response.conflicting_appointments });
      } else {
        setDayOffs(response.data.day_offs);
        setDayOffFormOpen(false);
        setConflictModal(null);
      }
    } catch (err) {
      setDayOffFormError(err.response?.data?.message || 'Could not add this day off.');
    } finally {
      setAddingDayOff(false);
      setConfirming(false);
    }
  };

  const handleConfirmConflict = () => {
    setConfirming(true);
    if (conflictModal.type === 'weekly_hours') {
      handleSaveWeeklyHours(true);
    } else {
      handleAddDayOff(true);
    }
  };

  const handleDeleteDayOff = async (id) => {
    setDeletingId(id);
    try {
      const response = await deleteDentistDayOff(id);
      setDayOffs(response.data.day_offs);
    } catch {
      setError('Could not remove that day off. Please try again.');
    } finally {
      setDeletingId(null);
    }
  };

  const openSpecialDayForm = () => {
    setSpecialDayFormError('');
    const first = availableSpecialDates[0];
    setSelectedSpecialDate(first?.date || '');
    setSpecialStartTime(first?.open_time || '');
    setSpecialEndTime(first?.close_time || '');
    setSpecialDayFormOpen(true);
  };

  // Picking a different date from the list re-defaults the time fields to
  // that date's own clinic hours — the dentist can still adjust from there.
  const handleSpecialDateChange = (date) => {
    setSelectedSpecialDate(date);
    const match = availableSpecialDates.find((d) => d.date === date);
    setSpecialStartTime(match?.open_time || '');
    setSpecialEndTime(match?.close_time || '');
  };

  const handleAddSpecialDay = async () => {
    if (!selectedSpecialDate || !specialStartTime || !specialEndTime) {
      setSpecialDayFormError('Please pick a date and both times.');
      return;
    }
    setAddingSpecialDay(true);
    setSpecialDayFormError('');
    try {
      const response = await addDentistSpecialWorkingDay({
        date: selectedSpecialDate,
        startTime: specialStartTime,
        endTime: specialEndTime,
      });
      setSpecialWorkingDays(response.data.special_working_days);
      setAvailableSpecialDates(response.data.available_special_dates);
      setSpecialDayFormOpen(false);
    } catch (err) {
      setSpecialDayFormError(err.response?.data?.message || 'Could not add this special working day.');
    } finally {
      setAddingSpecialDay(false);
    }
  };

  const handleDeleteSpecialDay = async (id) => {
    setDeletingSpecialId(id);
    try {
      const response = await deleteDentistSpecialWorkingDay(id);
      setSpecialWorkingDays(response.data.special_working_days);
      setAvailableSpecialDates(response.data.available_special_dates);
    } catch {
      setError('Could not remove that special working day. Please try again.');
    } finally {
      setDeletingSpecialId(null);
    }
  };

  const openLimitForm = () => {
    setLimitFormError('');
    setLimitDate('');
    setLimitServiceIds([]);
    setLimitCalendarMonth(startOfDay(new Date()));
    setLimitFormOpen(true);
  };

  const toggleLimitService = (id) => {
    setLimitServiceIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const submitServiceLimit = async (date, serviceIds) => {
    setAddingLimit(true);
    try {
      const response = await addDentistServiceLimit(date, serviceIds);
      if (response.conflicts) {
        setLimitFormOpen(false);
        setLimitConflict({ date, serviceIds, conflicts: response.conflicting_appointments });
        return true;
      }
      setServiceLimits(response.data.service_limits);
      setLimitFormOpen(false);
      setLimitConflict(null);
      return true;
    } catch (err) {
      setLimitFormError(err.response?.data?.message || 'Could not save this limit.');
      return false;
    } finally {
      setAddingLimit(false);
    }
  };

  const handleAddServiceLimit = () => {
    if (!limitDate) {
      setLimitFormError('Please pick a date.');
      return;
    }
    if (limitServiceIds.length === 0) {
      setLimitFormError('Pick at least one service — to block the whole day instead, use "Add day off" above.');
      return;
    }
    setLimitFormError('');
    submitServiceLimit(limitDate, limitServiceIds);
  };

  const handleDeleteServiceLimit = async (id) => {
    setDeletingLimitId(id);
    try {
      const response = await deleteDentistServiceLimit(id);
      setServiceLimits(response.data.service_limits);
    } catch {
      setError('Could not remove that limit. Please try again.');
    } finally {
      setDeletingLimitId(null);
    }
  };

  // RescheduleModal's onSuccess — this one conflicting appointment has been
  // proposed a new time and is no longer on $limitConflict.date for its old
  // service, so it's dropped from the list here (it no longer needs to be
  // shown). An empty list means every conflict is resolved: automatically
  // retry the original save, which now finds nothing in the way.
  const handleConflictRescheduled = () => {
    if (!limitConflict || !rescheduleTarget) return;
    const remaining = limitConflict.conflicts.filter((c) => c.id !== rescheduleTarget.id);
    setRescheduleTarget(null);

    if (remaining.length === 0) {
      setLimitConflict(null);
      submitServiceLimit(limitConflict.date, limitConflict.serviceIds);
    } else {
      setLimitConflict({ ...limitConflict, conflicts: remaining });
    }
  };

  if (loading) {
    return (
      <div className="section-card">
        <p className="booking-empty-note">Loading…</p>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        icon={ClockIcon}
        title="My Availability"
        subtitle="Set your regular weekly hours and mark specific days off."
      />

      {error && (
        <div className="dash-empty" style={{ marginBottom: 16 }}>
          <span className="dash-empty-title">{error}</span>
        </div>
      )}

      {isOnCall && (
        <div className="queue-card-overdue-note" style={{ marginBottom: 16 }}>
          <AlertIcon /> You're on an on-call basis, so the weekly toggles below don't control your actual bookings —
          patients can still request any clinic-open day. You confirm, reject, or reschedule each request yourself
          from your Pediatric Queue instead. Use "Add a day off" below if you need to block a specific date.
        </div>
      )}

      <div className="section-card">
        <h3 className="section-card-title" style={{ marginBottom: 16 }}>Weekly hours</h3>

        {EDITABLE_DAYS.map((day) => {
          const row = weeklyHours.find((r) => r.day_of_week === day);
          if (!row) return null;
          const exception = nextDayOffForDayOfWeek(day, dayOffs);
          return (
            <div key={day} className="avail-day-group">
              <div className="avail-day-row">
                <span className="avail-day-name">{DAY_NAMES[day]}</span>
                <ToggleSwitch
                  checked={row.is_active}
                  label={`${DAY_NAMES[day]} active`}
                  onChange={(checked) =>
                    updateDay(day, checked ? { is_active: true, start_time: row.start_time || '09:00', end_time: row.end_time || '18:00' } : { is_active: false })
                  }
                />
                {row.is_active ? (
                  <div className="avail-time-inputs">
                    <input
                      type="time"
                      className="form-input avail-time-input"
                      value={row.start_time || ''}
                      onChange={(e) => updateDay(day, { start_time: e.target.value })}
                    />
                    <span className="avail-time-sep">to</span>
                    <input
                      type="time"
                      className="form-input avail-time-input"
                      value={row.end_time || ''}
                      onChange={(e) => updateDay(day, { end_time: e.target.value })}
                    />
                  </div>
                ) : (
                  <span className="avail-not-working">Not working this day</span>
                )}
              </div>
              {exception && (
                <div className="avail-day-exception-note">
                  <CalendarXIcon />
                  <span>
                    Regular schedule — but off on {formatDateLong(exception.date)}
                    {exception.count > 1 ? ` (+${exception.count - 1} more)` : ''}
                  </span>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="section-card">
        <div className="section-card-header">
          <h3 className="section-card-title">Upcoming days off</h3>
          <button type="button" className="dash-btn dash-btn--outline" onClick={openDayOffForm}>
            + Add day off
          </button>
        </div>

        {dayOffs.length === 0 ? (
          <p className="booking-empty-note">No upcoming days off.</p>
        ) : (
          dayOffs.map((d) => (
            <div key={d.id} className="dayoff-row">
              <span className="dayoff-icon"><CalendarXIcon /></span>
              <div className="dayoff-info">
                <span className="dayoff-date">{formatDateLong(d.date)}</span>
                {d.reason && <span className="dayoff-reason">{d.reason}</span>}
              </div>
              <button
                type="button"
                className="dayoff-delete"
                disabled={deletingId === d.id}
                onClick={() => handleDeleteDayOff(d.id)}
                aria-label={`Remove day off on ${d.date}`}
              >
                <TrashIcon />
              </button>
            </div>
          ))
        )}
      </div>

      <div className="section-card">
        <div className="section-card-header">
          <h3 className="section-card-title">Special Working Days</h3>
          <button
            type="button"
            className="dash-btn dash-btn--outline"
            onClick={openSpecialDayForm}
            disabled={availableSpecialDates.length === 0}
          >
            + Add Special Working Day
          </button>
        </div>
        <p className="section-card-subtitle" style={{ marginTop: -10, marginBottom: 14 }}>
          Dates the clinic has opened outside its regular weekly schedule (e.g. one extra Sunday) — you still need
          to opt into each one yourself before you're bookable on it.
        </p>

        {specialWorkingDays.length === 0 ? (
          <p className="booking-empty-note">
            {availableSpecialDates.length === 0
              ? 'No special opening dates from the clinic right now.'
              : 'No special working days added yet.'}
          </p>
        ) : (
          specialWorkingDays.map((s) => (
            <div key={s.id} className="dayoff-row">
              <span className="dayoff-icon"><CalendarPlusIcon /></span>
              <div className="dayoff-info">
                <span className="dayoff-date">
                  {formatDateLong(s.date)} &middot; {formatTime12h(s.start_time)} &ndash; {formatTime12h(s.end_time)}
                </span>
              </div>
              <button
                type="button"
                className="dayoff-delete"
                disabled={deletingSpecialId === s.id}
                onClick={() => handleDeleteSpecialDay(s.id)}
                aria-label={`Remove special working day on ${s.date}`}
              >
                <TrashIcon />
              </button>
            </div>
          ))
        )}
      </div>

      <div className="section-card">
        <div className="section-card-header">
          <h3 className="section-card-title">Service Limits</h3>
          <button type="button" className="dash-btn dash-btn--outline" onClick={openLimitForm}>
            + Limit a Day
          </button>
        </div>
        <p className="section-card-subtitle" style={{ marginTop: -10, marginBottom: 14 }}>
          Restrict yourself to specific procedures on a specific date — e.g. only cleanings today. Leave this
          empty and nothing changes: every service you're credentialed for stays bookable, every day, as usual.
        </p>

        {serviceLimits.length === 0 ? (
          <p className="booking-empty-note">No limits set for any upcoming day.</p>
        ) : (
          serviceLimits.map((l) => (
            <div key={l.id} className="dayoff-row">
              <span className="dayoff-icon"><ToothIcon /></span>
              <div className="dayoff-info">
                <span className="dayoff-date">{formatDateLong(l.date)}</span>
                <span className="dayoff-reason" style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 2 }}>
                  {l.services.map((s) => {
                    const category = classifyHistoryCategory(s.name);
                    return <StatusBadge key={s.id} status={s.name} tone={category.tone} />;
                  })}
                </span>
              </div>
              <button
                type="button"
                className="dayoff-delete"
                disabled={deletingLimitId === l.id}
                onClick={() => handleDeleteServiceLimit(l.id)}
                aria-label={`Remove service limit on ${l.date}`}
              >
                <TrashIcon />
              </button>
            </div>
          ))
        )}
      </div>

      <div className="avail-save-bar">
        {saveError && <span className="avail-save-error">{saveError}</span>}
        {saveMessage && <span className="avail-save-success">{saveMessage}</span>}
        <button type="button" className="dash-btn" disabled={saving} onClick={() => handleSaveWeeklyHours(false)}>
          {saving ? 'Saving…' : 'Save changes'}
        </button>
      </div>

      <Modal open={dayOffFormOpen} onClose={() => setDayOffFormOpen(false)} title="Add a day off">
        <div className="form-field">
          <label className="form-label" htmlFor="dayoff-date">Date</label>
          <input
            id="dayoff-date"
            type="date"
            className="form-input"
            min={new Date().toISOString().slice(0, 10)}
            value={dayOffDate}
            onChange={(e) => setDayOffDate(e.target.value)}
          />
        </div>
        <div className="form-field" style={{ marginTop: 12 }}>
          <label className="form-label" htmlFor="dayoff-reason">Reason (optional)</label>
          <input
            id="dayoff-reason"
            type="text"
            className="form-input"
            placeholder="e.g. Conference, personal day"
            value={dayOffReason}
            onChange={(e) => setDayOffReason(e.target.value)}
          />
        </div>
        {dayOffFormError && (
          <p style={{ margin: '10px 0 0', fontSize: '0.82rem', color: 'var(--portal-red-text)' }}>{dayOffFormError}</p>
        )}
        <div className="modal-actions">
          <button type="button" className="dash-btn dash-btn--outline" onClick={() => setDayOffFormOpen(false)}>
            Cancel
          </button>
          <button type="button" className="dash-btn" disabled={addingDayOff} onClick={() => handleAddDayOff(false)}>
            {addingDayOff ? 'Adding…' : 'Add day off'}
          </button>
        </div>
      </Modal>

      <Modal open={specialDayFormOpen} onClose={() => setSpecialDayFormOpen(false)} title="Add Special Working Day">
        <div className="form-field">
          <label className="form-label" htmlFor="special-date">Date</label>
          <select
            id="special-date"
            className="form-input"
            value={selectedSpecialDate}
            onChange={(e) => handleSpecialDateChange(e.target.value)}
          >
            {availableSpecialDates.map((d) => (
              <option key={d.date} value={d.date}>
                {formatDateLong(d.date)} ({formatTime12h(d.open_time)}–{formatTime12h(d.close_time)}){d.reason ? ` — ${d.reason}` : ''}
              </option>
            ))}
          </select>
        </div>
        <div className="form-field" style={{ marginTop: 12 }}>
          <label className="form-label">Your hours for this date</label>
          <div className="avail-time-inputs">
            <input
              type="time"
              className="form-input avail-time-input"
              value={specialStartTime}
              onChange={(e) => setSpecialStartTime(e.target.value)}
            />
            <span className="avail-time-sep">to</span>
            <input
              type="time"
              className="form-input avail-time-input"
              value={specialEndTime}
              onChange={(e) => setSpecialEndTime(e.target.value)}
            />
          </div>
        </div>
        {specialDayFormError && (
          <p style={{ margin: '10px 0 0', fontSize: '0.82rem', color: 'var(--portal-red-text)' }}>{specialDayFormError}</p>
        )}
        <div className="modal-actions">
          <button type="button" className="dash-btn dash-btn--outline" onClick={() => setSpecialDayFormOpen(false)}>
            Cancel
          </button>
          <button type="button" className="dash-btn" disabled={addingSpecialDay} onClick={handleAddSpecialDay}>
            {addingSpecialDay ? 'Adding…' : 'Add Special Working Day'}
          </button>
        </div>
      </Modal>

      <ConflictModal
        open={!!conflictModal}
        onClose={() => setConflictModal(null)}
        onConfirm={handleConfirmConflict}
        confirming={confirming}
        conflicts={conflictModal?.conflicts || []}
      />

      <Modal open={limitFormOpen} onClose={() => setLimitFormOpen(false)} title="Limit a Day's Services" size="lg">
        <div className="avail-limit-layout">
          <div>
            <label className="form-label" style={{ display: 'block', marginBottom: 10 }}>Date</label>
            <div className="avail-limit-calendar">
            <div className="avail-limit-calendar-inner">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <button
                  type="button"
                  className="calendar-nav-btn"
                  disabled={limitCalendarMonth.getFullYear() === startOfDay(new Date()).getFullYear() && limitCalendarMonth.getMonth() === startOfDay(new Date()).getMonth()}
                  onClick={() => setLimitCalendarMonth((m) => new Date(m.getFullYear(), m.getMonth() - 1, 1))}
                  aria-label="Previous month"
                >
                  &#8249;
                </button>
                <span className="calendar-month-label">{MONTH_LABELS[limitCalendarMonth.getMonth()]} {limitCalendarMonth.getFullYear()}</span>
                <button
                  type="button"
                  className="calendar-nav-btn"
                  onClick={() => setLimitCalendarMonth((m) => new Date(m.getFullYear(), m.getMonth() + 1, 1))}
                  aria-label="Next month"
                >
                  &#8250;
                </button>
              </div>

              {loadingLimitMonthSummary ? (
                <p className="booking-empty-note">Loading…</p>
              ) : (
                <>
                  <div className="calendar-grid">
                    {WEEKDAY_LABELS.map((wd) => (
                      <span key={wd} className="calendar-weekday">{wd}</span>
                    ))}
                    {(() => {
                      const year = limitCalendarMonth.getFullYear();
                      const month = limitCalendarMonth.getMonth();
                      const firstOfMonth = new Date(year, month, 1);
                      const daysInMonth = new Date(year, month + 1, 0).getDate();
                      const today = startOfDay(new Date());
                      const cells = Array.from({ length: firstOfMonth.getDay() }, () => null);
                      for (let day = 1; day <= daysInMonth; day++) cells.push(new Date(year, month, day));

                      return cells.map((cellDate, i) => {
                        if (!cellDate) return <span key={`blank-${i}`} className="calendar-cell calendar-cell--blank" />; // eslint-disable-line react/no-array-index-key

                        const key = toDateKey(cellDate);
                        const isPast = cellDate < today;
                        const info = limitMonthSummary[key] || { status: 'unavailable', count: 0 };
                        const status = isPast ? 'unavailable' : info.status;
                        const isSelected = key === limitDate;
                        const tipTone = status === 'unavailable' ? '' : ` calendar-cell-tip--${status}`;
                        const tip = isPast ? 'Already passed' : status === 'full' ? 'Fully booked'
                          : status === 'limited' ? `${info.count} slot${info.count === 1 ? '' : 's'} left`
                          : status === 'available' ? `${info.count} slots open` : 'Not working this day';

                        return (
                          <button
                            key={key}
                            type="button"
                            className={`calendar-cell calendar-cell--${status}${isSelected ? ' calendar-cell--selected' : ''}`}
                            disabled={status === 'unavailable'}
                            onClick={() => setLimitDate(key)}
                          >
                            {cellDate.getDate()}
                            <span className={`calendar-cell-tip${tipTone}`}>{tip}</span>
                          </button>
                        );
                      });
                    })()}
                  </div>
                  <div className="calendar-legend">
                    {Object.entries(DAY_STATUS_LABELS).map(([status, label]) => (
                      <span key={status} className={`calendar-legend-item calendar-legend-item--${status}`}>{label}</span>
                    ))}
                  </div>
                </>
              )}
            </div>
            </div>
          </div>

          <div className="avail-limit-services-col">
            <label className="form-label" style={{ display: 'block', marginBottom: 10 }}>
              Which procedures do you want to offer{limitDate ? ` on ${formatDateLong(limitDate)}` : ' this day'}?
            </label>
            {CATEGORY_ORDER.map(({ key, label, dotClass }) => {
              const inCategory = credentialedServices.filter((s) => classifyHistoryCategory(s.name).key === key);
              if (inCategory.length === 0) return null;
              return (
                <div key={key} className="avail-svc-group">
                  <span className="avail-svc-group-label">
                    <span className={`avail-chip-dot ${dotClass}`} />
                    {label}
                  </span>
                  <div className="avail-svc-grid">
                    {inCategory.map((s) => {
                      const checked = limitServiceIds.includes(s.id);
                      return (
                        <button
                          key={s.id}
                          type="button"
                          className={`avail-svc-card${checked ? ' avail-svc-card--checked' : ''}`}
                          onClick={() => toggleLimitService(s.id)}
                          title={s.name}
                        >
                          <span className="avail-svc-check">{checked && '✓'}</span>
                          <span className="avail-svc-name">{s.name}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
            <p className="avail-chip-helper">
              Unchecked procedures are still bookable with another credentialed dentist, or with you on a
              different day — this only narrows your own slate for this one date.
            </p>
          </div>
        </div>
        {limitFormError && (
          <p style={{ margin: '10px 0 0', fontSize: '0.82rem', color: 'var(--portal-red-text)' }}>{limitFormError}</p>
        )}
        <div className="modal-actions">
          <button type="button" className="dash-btn dash-btn--outline" onClick={() => setLimitFormOpen(false)}>
            Cancel
          </button>
          <button type="button" className="dash-btn" disabled={addingLimit} onClick={handleAddServiceLimit}>
            {addingLimit ? 'Saving…' : 'Save Limit'}
          </button>
        </div>
      </Modal>

      <Modal
        open={!!limitConflict}
        onClose={() => setLimitConflict(null)}
        title="This Limit Conflicts With Existing Bookings"
      >
        <p style={{ margin: '0 0 14px', fontSize: '0.85rem', color: 'var(--portal-muted)' }}>
          {limitConflict && formatDateLong(limitConflict.date)} already has these appointments for services
          you're about to exclude. Propose a new time for each one — the limit saves automatically once every
          conflict below is resolved.
        </p>
        <ul className="conflict-list">
          {(limitConflict?.conflicts || []).map((c) => (
            <li key={c.id} className="conflict-list-item avail-conflict-item">
              <div>
                <span className="conflict-list-date">{formatTime12h(c.time)} — {c.patient_name}</span>
                <span className="conflict-list-meta">{c.service_name}</span>
              </div>
              <button type="button" className="dash-btn dash-btn--outline" onClick={() => setRescheduleTarget(c)}>
                Propose New Time
              </button>
            </li>
          ))}
        </ul>
        <div className="modal-actions">
          <button type="button" className="dash-btn dash-btn--outline" onClick={() => setLimitConflict(null)}>
            Cancel
          </button>
        </div>
      </Modal>

      <RescheduleModal
        open={!!rescheduleTarget}
        onClose={() => setRescheduleTarget(null)}
        appointment={rescheduleTarget}
        onSuccess={handleConflictRescheduled}
      />
    </div>
  );
}

export default MyAvailability;
