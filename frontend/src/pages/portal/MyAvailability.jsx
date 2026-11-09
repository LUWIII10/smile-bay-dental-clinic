import { useCallback, useEffect, useState } from 'react';
import {
  getDentistAvailability,
  updateDentistWeeklyHours,
  addDentistDayOff,
  deleteDentistDayOff,
  addDentistSpecialWorkingDay,
  deleteDentistSpecialWorkingDay,
} from '../../api/appointments';
import Modal from './components/Modal';
import PageHeader from './components/PageHeader';
import { CalendarXIcon, CalendarPlusIcon, TrashIcon, ClockIcon, AlertIcon } from './icons';
import { formatDateLong, formatTime12h } from './dateTimeUtils';
import './dashboards.css';
import './Appointments.css';
import './MyAvailability.css';

const DAY_NAMES = { 1: 'Monday', 2: 'Tuesday', 3: 'Wednesday', 4: 'Thursday', 5: 'Friday', 6: 'Saturday' };
const EDITABLE_DAYS = [1, 2, 3, 4, 5, 6];

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
    } catch {
      setError('Could not load your availability. Please refresh the page.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

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
    </div>
  );
}

export default MyAvailability;
