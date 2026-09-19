import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getCompletedPatients } from '../../api/appointments';
import Skeleton from './components/Skeleton';
import { CheckCircleIcon } from './icons';
import { toLocalDate } from './dateTimeUtils';
import './dashboards.css';

const MONTH_ABBR = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

// Source is treatment_history where performed_by = this dentist — what was
// actually done, not what was booked (appointments where status=completed
// would miss anything logged through Patient Records' own "+ Log
// Procedure", and would show the booked service rather than the real
// procedure name). Rows with no appointment_id — all 7 that predate this
// feature, and anything logged the Patient Records way going forward — are
// not treated any differently; they simply have performed_by, same as every
// other row, so they belong on this list exactly the same as the rest.
function CompletedPatients() {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await getCompletedPatients();
      setEntries(data);
    } catch {
      setError('Could not load your completed patients. Please refresh the page.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const distinctPatientCount = new Set(entries.map((e) => e.dental_record?.patient?.id).filter(Boolean)).size;

  return (
    <div>
      <div className="section-card-header appt-page-header">
        <div>
          <h1 className="appt-page-title">Completed patients</h1>
          <p className="appt-page-subtitle">
            {loading
              ? 'Loading…'
              : `${entries.length} procedure${entries.length === 1 ? '' : 's'} across ${distinctPatientCount} patient${distinctPatientCount === 1 ? '' : 's'}.`}
          </p>
        </div>
      </div>

      {loading ? (
        <Skeleton variant="block" height="90px" count={4} />
      ) : error ? (
        <div className="dash-empty">
          <span className="dash-empty-title">{error}</span>
        </div>
      ) : entries.length === 0 ? (
        <div className="dash-empty">
          <CheckCircleIcon />
          <span className="dash-empty-title">No procedures recorded yet</span>
          <p style={{ margin: 0, fontSize: '0.82rem' }}>
            Completed appointments will appear here once you record what was done.
          </p>
        </div>
      ) : (
        entries.map((entry) => {
          const d = toLocalDate(entry.performed_at);
          const patient = entry.dental_record?.patient;
          const patientName = patient ? `${patient.first_name} ${patient.last_name}`.trim() : 'Unknown patient';

          return (
            <div key={entry.id} className="appt-card">
              <span className="appt-card-date-chip appt-card-date-chip--green">
                <span className="appt-card-date-day">{d.getDate()}</span>
                <span className="appt-card-date-month">{MONTH_ABBR[d.getMonth()]}</span>
              </span>
              <div className="appt-card-body">
                <div className="appt-card-top">
                  <span className="appt-card-title">{patientName}</span>
                  {patient && (
                    <Link
                      to="/dentist/patient-records"
                      state={{ patientId: patient.id }}
                      className="dash-btn dash-btn--outline row-btn"
                    >
                      View record
                    </Link>
                  )}
                </div>
                <span className="appt-card-meta">
                  <span>
                    {entry.procedure_name}
                    {entry.tooth_number ? ` — Tooth #${entry.tooth_number}` : ''}
                  </span>
                </span>
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}

export default CompletedPatients;
