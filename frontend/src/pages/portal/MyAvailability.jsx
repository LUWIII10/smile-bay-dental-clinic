import { useCallback, useEffect, useState } from 'react';
import {
  getDentistAvailability,
  updateDentistWeeklyHours,
  addDentistDayOff,
  deleteDentistDayOff,
} from '../../api/appointments';
import Modal from './components/Modal';
import PageHeader from './components/PageHeader';
import { CalendarXIcon, TrashIcon, ClockIcon } from './icons';
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
          {confirming ? 'Saving…' : 'Save anyway — I understand these appointments are already booked and will remain as-is'}
        </button>
      </div>
    </Modal>
  );
}

function MyAvailability() {
  const [weeklyHours, setWeeklyHours] = useState([]);
  const [dayOffs, setDayOffs] = useState([]);
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
