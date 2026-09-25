import { useEffect, useState } from 'react';
import Modal from './Modal';
import StatusBadge from './StatusBadge';
import Skeleton from './Skeleton';
import { getAppointmentDetail, getServices, enableFollowUp } from '../../../api/appointments';
import { formatDateLong, formatTime12h } from '../dateTimeUtils';
import { KNOWN_DENTIST_PHOTOS } from '../dentistPhotos';
import { CalendarPlusIcon, CheckCircleIcon } from '../icons';

function getInitials(name) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] || '';
  const last = parts.length > 1 ? parts[parts.length - 1][0] : '';
  return (first + last).toUpperCase();
}

// Row-level "view details" (the eye icon) — read-only, backed by
// StaffAppointmentController::show(), which eager-loads the full
// AppointmentStatusLog trail so staff can see exactly how an appointment
// got to its current status without digging through the DB. Widened via
// Modal's size="lg" — the default 440px card was too narrow for a genuine
// two-column layout plus a dentist photo.
function AppointmentDetailModal({ appointmentId, onClose }) {
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [services, setServices] = useState([]);
  const [selectedServiceId, setSelectedServiceId] = useState('');
  const [enabling, setEnabling] = useState(false);
  const [enableError, setEnableError] = useState('');

  useEffect(() => {
    if (!appointmentId) return;
    setLoading(true);
    setError('');
    setDetail(null);
    setEnableError('');
    getAppointmentDetail(appointmentId)
      .then((data) => {
        setDetail(data);
        setSelectedServiceId(data.recommended_follow_up_service?.id ?? '');
      })
      .catch(() => setError('Could not load this appointment.'))
      .finally(() => setLoading(false));
  }, [appointmentId]);

  // Full staff-facing catalog (not the patient-trimmed is_patient_bookable
  // list) — only fetched once a completed appointment is open, since that's
  // the only state "Enable Follow-up" is ever shown in.
  useEffect(() => {
    if (detail?.status !== 'completed' || services.length > 0) return;
    getServices().then(setServices).catch(() => {});
  }, [detail?.status, services.length]);

  const handleEnableFollowUp = async () => {
    if (!selectedServiceId) return;
    setEnabling(true);
    setEnableError('');
    try {
      const response = await enableFollowUp(appointmentId, selectedServiceId);
      setDetail((prev) => ({ ...prev, ...response.data }));
    } catch (err) {
      setEnableError(err.response?.data?.message || 'Could not enable this follow-up. Please try again.');
    } finally {
      setEnabling(false);
    }
  };

  const isHmo = detail?.patient_type_snapshot === 'hmo';
  const hmoProviderName = detail?.patient?.hmo_provider?.name || detail?.patient?.hmo_company_name;
  const dentistName = detail?.dentist?.name || 'Unassigned';
  const dentistPhoto = detail?.dentist?.dentist_profile?.photo_path || KNOWN_DENTIST_PHOTOS[dentistName];

  return (
    <Modal open={!!appointmentId} onClose={onClose} title={appointmentId ? `Appointment #${appointmentId}` : ''} size="lg">
      {loading ? (
        <Skeleton variant="block" height="160px" />
      ) : error ? (
        <div className="dash-empty">
          <span className="dash-empty-title">{error}</span>
        </div>
      ) : detail ? (
        <div>
          <div className="detail-top">
            <div className="cell-person">
              <span className="detail-dentist-photo">
                {dentistPhoto ? <img src={dentistPhoto} alt={dentistName} /> : getInitials(dentistName)}
              </span>
              <span className="cell-person-text">
                <span className="cell-person-name">{dentistName}</span>
                <span className="cell-person-sub">Dentist</span>
              </span>
            </div>
            <StatusBadge status={detail.status} />
          </div>

          <div className="detail-grid">
            <div className="detail-field">
              <span className="detail-label">Patient</span>
              <span className="detail-value">{detail.patient.first_name} {detail.patient.last_name}</span>
            </div>
            {detail.patient.patient_number && (
              <div className="detail-field">
                <span className="detail-label">Patient No.</span>
                <span className="detail-value">{detail.patient.patient_number}</span>
              </div>
            )}
            <div className="detail-field">
              <span className="detail-label">Email</span>
              <span className="detail-value">{detail.patient.user?.email}</span>
            </div>
            {detail.patient.user?.mobile_number && (
              <div className="detail-field">
                <span className="detail-label">Phone</span>
                <span className="detail-value">{detail.patient.user.mobile_number}</span>
              </div>
            )}
            <div className="detail-field">
              <span className="detail-label">Date</span>
              <span className="detail-value">{formatDateLong(detail.appointment_date)}</span>
            </div>
            <div className="detail-field">
              <span className="detail-label">Time</span>
              <span className="detail-value">{formatTime12h(detail.appointment_time)}</span>
            </div>
            <div className="detail-field">
              <span className="detail-label">Service</span>
              <span className="detail-value">
                {detail.service?.name}
                {detail.service?.duration_minutes ? ` (${detail.service.duration_minutes} min)` : ''}
              </span>
            </div>
            <div className="detail-field">
              <span className="detail-label">Payment</span>
              <span className="detail-value">{isHmo ? 'HMO' : 'Cash'}</span>
            </div>
            {isHmo && (
              <div className="detail-field">
                <span className="detail-label">HMO Provider</span>
                <span className="detail-value">
                  {hmoProviderName || 'Not on file'}{detail.patient.hmo_number ? ` (#${detail.patient.hmo_number})` : ''}
                </span>
              </div>
            )}
            {detail.verified_by && (
              <div className="detail-field">
                <span className="detail-label">HMO Verified By</span>
                <span className="detail-value">{detail.verified_by.name}</span>
              </div>
            )}
            {detail.pediatric_confirmed_by && (
              <div className="detail-field">
                <span className="detail-label">Pediatric Verified By</span>
                <span className="detail-value">{detail.pediatric_confirmed_by.name}</span>
              </div>
            )}
            {detail.patient_notes && (
              <div className="detail-field detail-field--full">
                <span className="detail-label">Additional Information</span>
                <span className="detail-value">{detail.patient_notes}</span>
              </div>
            )}
            {detail.cancellation_reason && (
              <div className="detail-field detail-field--full">
                <span className="detail-label">Notes</span>
                <span className="detail-value">{detail.cancellation_reason}</span>
              </div>
            )}
          </div>

          {detail.status === 'completed' && (
            <div className="detail-followup-section">
              <div className="detail-followup-header">
                <CalendarPlusIcon />
                <span>Follow-up</span>
              </div>

              {detail.recommended_follow_up_service && (
                <div className={`detail-followup-status${detail.follow_up_fulfilled_at ? ' detail-followup-status--fulfilled' : ' detail-followup-status--open'}`}>
                  <CheckCircleIcon />
                  {detail.follow_up_fulfilled_at ? (
                    <span>Fulfilled — {detail.recommended_follow_up_service.name}, already booked.</span>
                  ) : (
                    <span>
                      Enabled — {detail.recommended_follow_up_service.name}
                      {detail.follow_up_recommended_by ? ` · by ${detail.follow_up_recommended_by.name}` : ''} · not yet booked
                    </span>
                  )}
                </div>
              )}

              <p className="detail-followup-note">
                Select the procedure this patient can now self-book as a follow-up, per the dentist's assessment.
              </p>

              <div className="detail-followup-controls">
                <select
                  className="form-select"
                  value={selectedServiceId}
                  onChange={(e) => setSelectedServiceId(e.target.value)}
                  disabled={enabling}
                >
                  <option value="">Select a procedure…</option>
                  {services.map((service) => (
                    <option key={service.id} value={service.id}>
                      {service.name} ({service.duration_minutes} min)
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="dash-btn"
                  onClick={handleEnableFollowUp}
                  disabled={enabling || !selectedServiceId}
                >
                  {enabling ? 'Enabling…' : 'Enable Follow-up'}
                </button>
              </div>

              {enableError && <p className="detail-followup-error">{enableError}</p>}
            </div>
          )}

          <h4 className="detail-history-title">Status History</h4>
          <ul className="detail-history-list">
            {detail.status_logs && detail.status_logs.length > 0 ? (
              detail.status_logs.map((log) => (
                <li key={log.id} className="detail-history-item">
                  <span className="detail-history-dot" />
                  <div>
                    <div className="detail-history-line">
                      {log.old_status ? `${log.old_status.replace(/_/g, ' ')} → ` : 'Created as '}
                      {log.new_status.replace(/_/g, ' ')}
                      {log.changed_by ? ` — ${log.changed_by.name}` : ''}
                    </div>
                    <div className="detail-history-meta">
                      {new Date(log.created_at).toLocaleString('en-US', {
                        month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
                      })}
                      {log.note ? ` · ${log.note}` : ''}
                    </div>
                  </div>
                </li>
              ))
            ) : (
              <li className="detail-history-item">
                <span className="detail-history-meta">No history recorded.</span>
              </li>
            )}
          </ul>
        </div>
      ) : null}
    </Modal>
  );
}

export default AppointmentDetailModal;
