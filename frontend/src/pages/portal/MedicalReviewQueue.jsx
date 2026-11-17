import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { getMedicalReviewQueue, decideMedicalReview } from '../../api/appointments';
import { MEDICAL_RECORD_QUESTIONS, PREGNANCY_QUESTION } from './components/MedicalRecordStep';
import Modal from './components/Modal';
import StatusBadge from './components/StatusBadge';
import Skeleton from './components/Skeleton';
import PageHeader from './components/PageHeader';
import { AlertIcon, SearchIcon, CheckCircleIcon, XCircleIcon, CloseIcon } from './icons';
import { formatDateLong, formatTime12h } from './dateTimeUtils';
import { showSuccessToast } from '../../utils/toast';
import './dashboards.css';
import './MedicalReviewQueue.css';

const POLL_INTERVAL_MS = 9000;

// decide()'s four action values — label/description shown in the decision
// modal, exactly what each one tells the patient (see
// MedicalReviewController::decide()'s own $patientMessages map).
const DECLINE_REASONS = [
  {
    value: 'suggest_alternative',
    label: 'Suggest a different procedure',
    desc: "Tells the patient to contact the clinic or book a different service instead.",
  },
  {
    value: 'reschedule_later',
    label: 'Recommend rescheduling for later',
    desc: 'Tells the patient to book again once their condition has changed.',
  },
  {
    value: 'decline',
    label: 'Decline',
    desc: 'Tells the patient to contact the clinic directly — no specific next step suggested.',
  },
];

function formatSubmitted(isoTimestamp) {
  return new Date(isoTimestamp).toLocaleString('en-US', {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  });
}

function getInitials(name) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] || '';
  const last = parts.length > 1 ? parts[parts.length - 1][0] : '';
  return (first + last).toUpperCase();
}

// Which Medical Record questions this booking answered "Yes" to — same
// question list every other Medical Record display (booking wizard, staff
// Patient Records, the appointment quick-check panel) reads from.
function flaggedLabels(record) {
  if (!record) return [];
  return [...MEDICAL_RECORD_QUESTIONS, PREGNANCY_QUESTION]
    .filter((q) => record[q.key] === true)
    .map((q) => q.label);
}

function QueueCard({ appointment, actingId, onApprove, onDecide, isDentist }) {
  const isCash = appointment.patient_type_snapshot === 'cash';
  const isActing = actingId === appointment.id;
  const patientName = `${appointment.patient?.first_name || ''} ${appointment.patient?.last_name || ''}`.trim();
  const reasons = appointment.conflict_reasons || [];
  // Severity is cosmetic only (which accent color the card gets) — a
  // pregnancy/bleeding-disorder conflict reads as more urgent than an
  // asthma/heart-condition + sedation one, but a dentist still reviews
  // every card the same way regardless of this stripe's color.
  const isHighSeverity = reasons.some((r) => r.includes('pregnant') || r.includes('bleeding disorder'));

  return (
    <div className={`mrq-card${isHighSeverity ? '' : ' mrq-card--amber'}`}>
      <div className="mrq-card-top">
        <div className="mrq-identity">
          <span className="mrq-avatar">{getInitials(patientName)}</span>
          <div>
            <div className="mrq-patient-name">{patientName}</div>
            <div className="mrq-patient-sub">
              {appointment.service?.name}
              {appointment.service?.duration_minutes ? ` · ${appointment.service.duration_minutes} min` : ''}
            </div>
          </div>
        </div>
        <div className="mrq-right-meta">
          <StatusBadge status={isCash ? 'Cash' : 'HMO'} tone={isCash ? 'blue' : 'gray'} />
          <div className="mrq-submitted">Submitted {formatSubmitted(appointment.created_at)}</div>
        </div>
      </div>

      {reasons.map((reason) => (
        <div key={reason} className="mrq-conflict">
          <AlertIcon />
          <span>{reason}</span>
        </div>
      ))}

      <div className="mrq-grid">
        {!isDentist && (
          <div>
            <span className="mrq-field-label">Assigned Dentist</span>
            <span className="mrq-field-value">{appointment.dentist?.name || 'Unassigned'}</span>
          </div>
        )}
        <div>
          <span className="mrq-field-label">Requested</span>
          <span className="mrq-field-value">
            {formatDateLong(appointment.appointment_date)} &middot; {formatTime12h(appointment.appointment_time)}
          </span>
        </div>
        <div>
          <span className="mrq-field-label">Flagged in Medical Record</span>
          <div className="mrq-chip-row">
            {flaggedLabels(appointment.medical_record).map((label) => (
              <span key={label} className="mrq-chip mrq-chip--red">{label}</span>
            ))}
          </div>
        </div>
      </div>

      {isDentist ? (
        <div className="mrq-actions">
          <button type="button" className="mrq-btn mrq-btn--approve" disabled={isActing} onClick={() => onApprove(appointment)}>
            <CheckCircleIcon /> {isActing ? 'Saving…' : 'Approve'}
          </button>
          <button type="button" className="mrq-btn mrq-btn--decline" disabled={isActing} onClick={() => onDecide(appointment)}>
            Can&rsquo;t Confirm
          </button>
        </div>
      ) : (
        <p className="mrq-footnote mrq-footnote--waiting">
          Waiting on {appointment.dentist?.name || 'the assigned dentist'}&rsquo;s own clinical review — view only here.
        </p>
      )}

      {isDentist && !isCash && (
        <p className="mrq-footnote">
          Approving moves this to HMO coverage verification next (not straight to confirmed) — it&rsquo;s still an HMO booking.
        </p>
      )}
    </div>
  );
}

// The assigned dentist's own clinical-safety review queue — every dentist
// account can reach this (unlike Pediatric Queue, which only makes sense
// for the one pediatric dentist), since ClinicalSafetyService can flag any
// dentist's own booking. The backend already scopes strictly to
// dentist_id = auth user, so a dentist with nothing flagged just sees an
// empty queue.
function MedicalReviewQueue() {
  const { role } = useAuth();
  const isDentist = role === 'dentist';
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actingId, setActingId] = useState(null);
  const [actionError, setActionError] = useState('');

  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');

  const [decideTarget, setDecideTarget] = useState(null);
  const [decideAction, setDecideAction] = useState(DECLINE_REASONS[0].value);
  const [decideNotes, setDecideNotes] = useState('');
  const [deciding, setDeciding] = useState(false);

  const mountedRef = useRef(true);

  const load = useCallback(async ({ silent = false } = {}) => {
    if (!silent) {
      setLoading(true);
      setError('');
    }
    try {
      const data = await getMedicalReviewQueue();
      if (mountedRef.current) setAppointments(data);
    } catch {
      if (!silent && mountedRef.current) setError('Could not load the clinical review queue. Please refresh the page.');
    } finally {
      if (!silent && mountedRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    load();
    const interval = setInterval(() => load({ silent: true }), POLL_INTERVAL_MS);
    return () => {
      mountedRef.current = false;
      clearInterval(interval);
    };
  }, [load]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return appointments.filter((a) => {
      const name = `${a.patient?.first_name || ''} ${a.patient?.last_name || ''}`.toLowerCase();
      const matchesSearch = !query || name.includes(query);
      const matchesType = typeFilter === 'all' || a.patient_type_snapshot === typeFilter;
      return matchesSearch && matchesType;
    });
  }, [appointments, search, typeFilter]);

  const handleApprove = async (appointment) => {
    setActingId(appointment.id);
    setActionError('');
    try {
      await decideMedicalReview(appointment.id, 'approve');
      setAppointments((prev) => prev.filter((a) => a.id !== appointment.id));
      showSuccessToast('Booking cleared.');
    } catch (err) {
      setActionError(err.response?.data?.message || 'Could not approve this appointment.');
    } finally {
      setActingId(null);
    }
  };

  const openDecide = (appointment) => {
    setActionError('');
    setDecideAction(DECLINE_REASONS[0].value);
    setDecideNotes('');
    setDecideTarget(appointment);
  };

  const submitDecide = async () => {
    if (!decideTarget) return;
    setActingId(decideTarget.id);
    setDeciding(true);
    setActionError('');
    try {
      await decideMedicalReview(decideTarget.id, decideAction, decideNotes.trim());
      setAppointments((prev) => prev.filter((a) => a.id !== decideTarget.id));
      setDecideTarget(null);
      showSuccessToast('Patient notified.');
    } catch (err) {
      setActionError(err.response?.data?.message || 'Could not send this decision.');
    } finally {
      setDeciding(false);
      setActingId(null);
    }
  };

  return (
    <div>
      <PageHeader
        icon={AlertIcon}
        title="Clinical Review Queue"
        subtitle={
          isDentist
            ? "Bookings flagged for a health-information conflict with the service — only you can clear these."
            : "Bookings flagged for a health-information conflict with the service, across every dentist — view only; each dentist clears their own."
        }
      >
        <span className="mrq-count-pill"><b>{loading ? '…' : filtered.length}</b> awaiting review</span>
      </PageHeader>

      {actionError && <div className="profile-alert profile-alert--error">{actionError}</div>}

      {!loading && !error && appointments.length > 0 && (
        <div className="mrq-toolbar">
          <div className="mrq-search">
            <SearchIcon />
            <input
              type="text"
              placeholder="Search by patient name…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {search && (
              <button type="button" className="mrq-search-clear" onClick={() => setSearch('')} aria-label="Clear search">
                <CloseIcon />
              </button>
            )}
          </div>
          <div className="mrq-type-filter">
            {[
              { value: 'all', label: 'All' },
              { value: 'cash', label: 'Cash' },
              { value: 'hmo', label: 'HMO' },
            ].map((opt) => (
              <button
                key={opt.value}
                type="button"
                className={`mrq-type-btn${typeFilter === opt.value ? ' mrq-type-btn--active' : ''}`}
                onClick={() => setTypeFilter(opt.value)}
              >
                {opt.value !== 'all' && <span className="mrq-type-dot" />}
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {loading ? (
        <Skeleton variant="block" height="180px" count={2} />
      ) : error ? (
        <div className="dash-empty">
          <span className="dash-empty-title">{error}</span>
        </div>
      ) : appointments.length === 0 ? (
        <div className="mrq-empty">
          <AlertIcon />
          <span className="mrq-empty-title">No bookings awaiting your review</span>
          <p className="mrq-empty-desc">New flagged bookings assigned to you will show up here as soon as they're submitted.</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="mrq-empty">
          <SearchIcon />
          <span className="mrq-empty-title">No matches</span>
          <p className="mrq-empty-desc">Try a different name or switch the filter back to &ldquo;All&rdquo;.</p>
        </div>
      ) : (
        filtered.map((appointment) => (
          <QueueCard
            key={appointment.id}
            appointment={appointment}
            actingId={actingId}
            onApprove={handleApprove}
            onDecide={openDecide}
            isDentist={isDentist}
          />
        ))
      )}

      <Modal open={!!decideTarget} onClose={() => setDecideTarget(null)} title="Can't Confirm" icon={XCircleIcon} tone="danger">
        {decideTarget && (
          <>
            <p className="mrq-modal-sub">
              {decideTarget.patient?.first_name} {decideTarget.patient?.last_name} &middot; {decideTarget.service?.name},{' '}
              {formatDateLong(decideTarget.appointment_date)}. Pick what you want to tell the patient — this won&rsquo;t be
              confirmed as requested.
            </p>

            {DECLINE_REASONS.map((reason) => (
              <label
                key={reason.value}
                className={`mrq-reason-option${decideAction === reason.value ? ' mrq-reason-option--selected' : ''}`}
              >
                <input
                  type="radio"
                  name="decide-reason"
                  checked={decideAction === reason.value}
                  onChange={() => setDecideAction(reason.value)}
                />
                <span>
                  <span className="mrq-reason-label">{reason.label}</span>
                  <span className="mrq-reason-desc">{reason.desc}</span>
                </span>
              </label>
            ))}

            <label className="modal-field-label" style={{ marginTop: 12, display: 'block' }}>
              Notes <span style={{ fontWeight: 400, color: 'var(--portal-muted)' }}>(optional, kept internally)</span>
            </label>
            <textarea
              className="form-textarea"
              placeholder="e.g. Safe to proceed once no longer pregnant/breastfeeding."
              value={decideNotes}
              onChange={(e) => setDecideNotes(e.target.value)}
              maxLength={1000}
            />

            {actionError && <p className="mrq-modal-error">{actionError}</p>}

            <div className="modal-actions">
              <button type="button" className="dash-btn dash-btn--outline" onClick={() => setDecideTarget(null)}>
                Cancel
              </button>
              <button type="button" className="dash-btn dash-btn--danger" disabled={deciding} onClick={submitDecide}>
                {deciding ? 'Sending…' : 'Send to Patient'}
              </button>
            </div>
          </>
        )}
      </Modal>
    </div>
  );
}

export default MedicalReviewQueue;
