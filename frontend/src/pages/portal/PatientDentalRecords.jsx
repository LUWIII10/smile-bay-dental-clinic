import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { getMyDentalRecord } from '../../api/dentalRecords';
import { getMedicalRecordHistory } from '../../api/appointments';
import { getDependents, getDependentDentalRecord } from '../../api/dependents';
import { MEDICAL_RECORD_QUESTIONS, PREGNANCY_QUESTION } from './components/MedicalRecordStep';
import StatusBadge from './components/StatusBadge';
import Modal from './components/Modal';
import Skeleton from './components/Skeleton';
import PageHeader from './components/PageHeader';
import FilterDropdown from './components/FilterDropdown';
import { FileIcon, ClockIcon, UserIcon, CheckCircleIcon, CalendarIcon, ToothIcon, ShieldIcon } from './icons';

// Same question list every other Medical Record display reads from (the
// booking wizard, staff Patient Records, the appointment quick-check panel).
function flaggedLabels(record) {
  return [...MEDICAL_RECORD_QUESTIONS, PREGNANCY_QUESTION]
    .filter((q) => record[q.key] === true)
    .map((q) => q.label);
}

// Same rotate-on-open chevron as PatientRecords.jsx's own (duplicated, not
// imported — a four-line pure component, same convention as this file's
// other small per-file helpers).
function ChevronDownIcon({ open }) {
  return (
    <svg
      width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6"
      style={{ transform: `rotate(${open ? 180 : 0}deg)`, transition: 'transform 0.15s ease', flexShrink: 0 }}
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}
import {
  PLAN_STATUS_TONE,
  HISTORY_CATEGORY_OPTIONS,
  classifyHistoryCategory,
  formatRecordDate as formatDate,
  formatRecordDateParts,
} from './dentalRecordShared';
import './dashboards.css';
import './Appointments.css';
import './DentalRecords.css';

const HISTORY_PAGE_SIZE = 5;

// Dot colors mirror HISTORY_CATEGORY_RULES' own tone mapping in
// dentalRecordShared.js (treatment=indigo, diagnostic=blue, procedure=
// green, consultation=amber), kept here rather than exported from there
// since this is a hex literal for FilterDropdown, not a reusable tone name.
const HISTORY_CATEGORY_DOT = {
  all: '#94a3b8',
  treatment: '#4338ca',
  diagnostic: '#2952e3',
  procedure: '#15803d',
  consultation: '#b45309',
};

function PatientDentalRecords() {
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const dependentId = searchParams.get('dependent') ? Number(searchParams.get('dependent')) : null;

  const [dependents, setDependents] = useState([]);
  useEffect(() => {
    getDependents().then(setDependents).catch(() => setDependents([]));
  }, []);

  const viewingDependent = dependents.find((d) => d.id === dependentId) || null;
  const switchTo = (id) => {
    if (id) setSearchParams({ dependent: String(id) });
    else setSearchParams({});
  };

  const [record, setRecord] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [visibleHistoryCount, setVisibleHistoryCount] = useState(HISTORY_PAGE_SIZE);
  const [detailItem, setDetailItem] = useState(null);
  // "View Treatment" on My Appointments (a completed visit with a real
  // treatment_history row) sends the patient here with this id instead of
  // showing its own separate copy of the same detail — this is what opens
  // the matching row's modal and gives it a brief highlight so it's
  // findable on arrival instead of buried in the paginated list.
  const [highlightedId, setHighlightedId] = useState(null);
  const rowRefs = useRef({});

  // Medical Record History — separate fetch, separate loading state: this
  // patient may have dental records with no medical record history yet
  // (registered before this feature shipped), and either section should
  // render independently of the other finishing first.
  const [medicalRecords, setMedicalRecords] = useState([]);
  const [medicalRecordsLoading, setMedicalRecordsLoading] = useState(true);
  const [expandedMedicalRecordIds, setExpandedMedicalRecordIds] = useState([]);
  const toggleMedicalRecordExpanded = (id) =>
    setExpandedMedicalRecordIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  const isMedicalRecordOpen = (rec, index) => {
    const toggled = expandedMedicalRecordIds.includes(rec.id);
    const defaultOpen = index === 0;
    return toggled ? !defaultOpen : defaultOpen;
  };

  useEffect(() => {
    setMedicalRecordsLoading(true);
    getMedicalRecordHistory(dependentId)
      .then(setMedicalRecords)
      .catch(() => setMedicalRecords([]))
      .finally(() => setMedicalRecordsLoading(false));
  }, [dependentId]);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setRecord(dependentId ? await getDependentDentalRecord(dependentId) : await getMyDentalRecord());
    } catch {
      setError(dependentId ? 'Could not load this dependent\'s dental records.' : 'Could not load your dental records. Please refresh the page.');
    } finally {
      setLoading(false);
    }
  }, [dependentId]);

  useEffect(() => {
    load();
  }, [load]);

  const history = record?.treatment_history || [];
  const filteredHistory = categoryFilter === 'all'
    ? history
    : history.filter((h) => classifyHistoryCategory(h.procedure_name).key === categoryFilter);

  const visibleHistory = filteredHistory.slice(0, visibleHistoryCount);
  const hasMoreHistory = visibleHistoryCount < filteredHistory.length;

  const handleCategoryChange = (key) => {
    setCategoryFilter(key);
    setVisibleHistoryCount(HISTORY_PAGE_SIZE);
  };

  // Deep-link from My Appointments' "View Treatment" — expand pagination far
  // enough to include the target row, open its detail modal, and flag it to
  // highlight. Guarded on location.state so this only ever fires once per
  // navigation, not on every unrelated re-render (history is a fresh array
  // reference each render).
  useEffect(() => {
    const targetId = location.state?.openHistoryId;
    if (!targetId || history.length === 0) return;

    const index = history.findIndex((h) => h.id === targetId);
    if (index === -1) return;

    if (index >= visibleHistoryCount) {
      setVisibleHistoryCount(index + 1);
    }
    setDetailItem(history[index]);
    setHighlightedId(targetId);

    // Consumes the nav state so refreshing or navigating back here again
    // doesn't re-trigger the same auto-open.
    navigate(location.pathname, { replace: true, state: {} });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [history, location.state]);

  useEffect(() => {
    if (!highlightedId) return undefined;
    rowRefs.current[highlightedId]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    const timer = setTimeout(() => setHighlightedId(null), 2500);
    return () => clearTimeout(timer);
  }, [highlightedId]);

  return (
    <div>
      <PageHeader
        icon={ToothIcon}
        title="My Dental Records"
        subtitle="Full treatment history and medical record — for you and your dependents."
      />

      {dependents.length > 0 && (
        <div className="dentalrec-switcher">
          <button type="button" className={`dentalrec-switcher-pill${!dependentId ? ' active' : ''}`} onClick={() => switchTo(null)}>
            <span className="dentalrec-switcher-avatar" style={{ background: 'var(--portal-blue)' }}><UserIcon /></span>
            Myself
          </button>
          {dependents.map((dep) => (
            <button
              type="button"
              key={dep.id}
              className={`dentalrec-switcher-pill${dependentId === dep.id ? ' active' : ''}`}
              onClick={() => switchTo(dep.id)}
            >
              <span
                className="dentalrec-switcher-avatar"
                style={{ background: dep.sex === 'female' ? 'linear-gradient(135deg, #f472b6, #be185d)' : 'linear-gradient(135deg, #60a5fa, var(--portal-blue))' }}
              >
                {dep.first_name[0]}{dep.last_name[0]}
              </span>
              {dep.full_name}
            </button>
          ))}
        </div>
      )}

      {viewingDependent && (
        <div className="dentalrec-viewing-banner">
          <ShieldIcon />
          Viewing <strong>{viewingDependent.full_name}'s</strong> records — their own history, separate from yours.
        </div>
      )}

      {loading ? (
        <Skeleton variant="block" height="400px" />
      ) : error ? (
        <div className="dash-empty">
          <span className="dash-empty-title">{error}</span>
        </div>
      ) : (
        <>
          <div className="record-summary-card">
            <div className="record-info-card">
              <div className="record-info-item">
                <span className="record-info-label">Patient No.</span>
                <span className="record-info-value">{record.patient?.patient_number}</span>
              </div>
              <div className="record-info-item">
                <span className="record-info-label">First Record Date</span>
                <span className="record-info-value">{formatDate(record.opened_at)}</span>
              </div>
              <div className="record-info-item">
                <span className="record-info-label">Primary Dentist</span>
                <span className="record-info-value">{record.primary_dentist?.name || 'Not yet assigned'}</span>
              </div>
            </div>
          </div>

          <div className="section-card">
            <div className="section-card-header">
              <h3 className="section-card-title">Treatment Plans</h3>
            </div>
            {record.treatment_plans.length === 0 ? (
              <div className="dash-empty">
                <FileIcon />
                <span className="dash-empty-title">No treatment plans yet</span>
                <p className="dash-empty-desc">Your dentist will add a plan here after your first evaluation.</p>
              </div>
            ) : (
              <div className="plan-list">
                {record.treatment_plans.map((plan) => (
                  <div key={plan.id} className="plan-card">
                    <div className="plan-card-header">
                      <div>
                        <span className="plan-card-title">{plan.title}</span>
                        {plan.dentist && <span className="plan-card-dentist">with {plan.dentist.name}</span>}
                      </div>
                      <StatusBadge status={plan.status} tone={PLAN_STATUS_TONE[plan.status]} />
                    </div>
                    {plan.description && <p className="plan-card-desc">{plan.description}</p>}
                    {plan.target_date && (
                      <span className="plan-card-target">Target: {formatDate(plan.target_date)}</span>
                    )}
                    {plan.items.length > 0 && (
                      <ul className="plan-item-list">
                        {plan.items.map((item) => (
                          <li key={item.id} className="plan-item">
                            <span className="plan-item-name">
                              {item.procedure_name}
                              {item.tooth_number ? ` — Tooth #${item.tooth_number}` : ''}
                            </span>
                            <StatusBadge status={item.status} />
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="section-card">
            <div className="section-card-header">
              <div>
                <h3 className="section-card-title">Treatment History</h3>
                <p className="section-card-subtitle">A chronological list of your treatments and procedures.</p>
              </div>
              <FilterDropdown
                icon={<FileIcon />}
                options={HISTORY_CATEGORY_OPTIONS.map((opt) => ({ value: opt.key, label: opt.label, dot: HISTORY_CATEGORY_DOT[opt.key] }))}
                value={categoryFilter}
                onChange={handleCategoryChange}
              />
            </div>

            {history.length === 0 ? (
              <div className="dash-empty">
                <ClockIcon />
                <span className="dash-empty-title">No completed procedures yet</span>
              </div>
            ) : filteredHistory.length === 0 ? (
              <div className="dash-empty">
                <ClockIcon />
                <span className="dash-empty-title">No records in this category</span>
              </div>
            ) : (
              <>
                <ul className="record-history-list">
                  {visibleHistory.map((h) => {
                    const category = classifyHistoryCategory(h.procedure_name);
                    const dateParts = formatRecordDateParts(h.performed_at);
                    return (
                      <li
                        key={h.id}
                        ref={(el) => { rowRefs.current[h.id] = el; }}
                        className={`record-history-row${highlightedId === h.id ? ' record-history-row--highlighted' : ''}`}
                      >
                        <div className="record-history-date">
                          <span className="record-history-date-month">{dateParts.month}</span>
                          <span className="record-history-date-day">{dateParts.day}</span>
                          <span className="record-history-date-year">{dateParts.year}</span>
                        </div>
                        <span className="record-history-dot" />
                        <div className="record-history-body">
                          <StatusBadge status={category.label} tone={category.tone} />
                          <span className="record-history-title">
                            {h.procedure_name}
                            {h.tooth_number ? ` — Tooth #${h.tooth_number}` : ''}
                          </span>
                        </div>
                        <div className="record-history-meta">
                          <span className="record-history-dentist">
                            <UserIcon />
                            {h.performed_by?.name || 'Dentist'}
                          </span>
                          <StatusBadge status="Completed" tone="green" icon={CheckCircleIcon} />
                          <button
                            type="button"
                            className="dash-btn dash-btn--outline row-btn"
                            onClick={() => setDetailItem(h)}
                          >
                            View Details
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ul>

                {hasMoreHistory && (
                  <div className="record-history-load-more">
                    <button
                      type="button"
                      className="dash-btn dash-btn--outline"
                      onClick={() => setVisibleHistoryCount((c) => c + HISTORY_PAGE_SIZE)}
                    >
                      Load More Records
                    </button>
                  </div>
                )}
              </>
            )}
          </div>

          <div className="section-card">
            <div className="section-card-header">
              <div>
                <h3 className="section-card-title">Medical Record History</h3>
                <p className="section-card-subtitle">What you told us before each visit, and when — kept so your care team has your full history, not just your latest answers.</p>
              </div>
            </div>

            {medicalRecordsLoading ? (
              <Skeleton variant="block" height="120px" />
            ) : medicalRecords.length === 0 ? (
              <div className="dash-empty">
                <ShieldIcon />
                <span className="dash-empty-title">No medical record on file yet</span>
                <p className="dash-empty-desc">This fills in the next time you book an appointment.</p>
              </div>
            ) : (
              <div className="medrec-timeline">
                {medicalRecords.map((rec, index) => {
                  const open = isMedicalRecordOpen(rec, index);
                  const flags = flaggedLabels(rec);
                  return (
                    <div key={rec.id} className={`medrec-timeline-item${open ? ' medrec-timeline-item--open' : ''}`}>
                      <button type="button" className="medrec-timeline-top" onClick={() => toggleMedicalRecordExpanded(rec.id)}>
                        <span>
                          <span className="medrec-timeline-date">
                            {formatDate(rec.created_at)}{index === 0 && <span className="medrec-latest-chip">MOST RECENT</span>}
                          </span>
                          <span className="medrec-timeline-service">{rec.appointment?.service?.name || 'Visit'}</span>
                        </span>
                        <span className="medrec-timeline-right">
                          <span className="medrec-timeline-flags">
                            {flags.length > 0 ? flags.map((label) => (
                              <span key={label} className="medrec-flag-badge">{label}</span>
                            )) : <span className="medrec-flag-badge medrec-flag-badge--none">None declared</span>}
                          </span>
                          <ChevronDownIcon open={open} />
                        </span>
                      </button>
                      {open && (
                        <div className="medrec-timeline-body">
                          <div className="medrec-qa-grid">
                            {[...MEDICAL_RECORD_QUESTIONS, ...(rec.pregnant_or_breastfeeding !== null ? [PREGNANCY_QUESTION] : [])].map(({ key, label }) => (
                              <div key={key} className="medrec-qa-row">
                                <span className="medrec-qa-label">{label}</span>
                                <span className={`medrec-qa-answer${rec[key] ? ' medrec-qa-answer--yes' : ' medrec-qa-answer--no'}`}>
                                  {rec[key] ? 'Yes' : 'No'}
                                </span>
                                {rec[key] && rec[`${key}_notes`] && (
                                  <span className="medrec-qa-note">&#8618; {rec[`${key}_notes`]}</span>
                                )}
                              </div>
                            ))}
                          </div>
                          <div className="medrec-timeline-footer">
                            <span>Other concerns: {rec.other_concerns || 'None declared'}</span>
                            <span>
                              {rec.consent_given && rec.consent_at
                                ? `Consent given ${new Date(rec.consent_at).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })}`
                                : 'Consent not on file'}
                            </span>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="profile-alert profile-alert--info">
            <ShieldIcon />
            <span>Detailed clinical notes and tooth-by-tooth chart annotations are visible only to your dentist, dental assistant, and clinic admin — for the privacy of your medical record.</span>
          </div>
        </>
      )}

      <Modal open={!!detailItem} onClose={() => setDetailItem(null)} bare>
        {detailItem && (
          <div className="record-history-detail">
            <div className={`record-history-detail-banner record-history-detail-banner--${classifyHistoryCategory(detailItem.procedure_name).tone}`}>
              <span className="record-history-detail-banner-icon"><ToothIcon /></span>
              <div>
                <span className="record-history-detail-banner-badge">{classifyHistoryCategory(detailItem.procedure_name).label}</span>
                <h4 className="record-history-detail-banner-title">{detailItem.procedure_name}</h4>
              </div>
            </div>
            <div className="record-history-detail-complete">
              <CheckCircleIcon />
              Procedure Completed
            </div>
            <div className="record-history-detail-fields">
              <div className="record-history-detail-field">
                <span className="record-field-icon record-field-icon--blue"><CalendarIcon /></span>
                <div className="record-info-item">
                  <span className="record-info-label">Date Performed</span>
                  <span className="record-info-value">{formatDate(detailItem.performed_at)}</span>
                </div>
              </div>
              <div className="record-history-detail-field">
                <span className="record-field-icon record-field-icon--navy"><UserIcon /></span>
                <div className="record-info-item">
                  <span className="record-info-label">Attending Dentist</span>
                  <span className="record-info-value">{detailItem.performed_by?.name || 'Dentist'}</span>
                </div>
              </div>
              {detailItem.tooth_number && (
                <div className="record-history-detail-field record-history-detail-field--full">
                  <span className="record-field-icon record-field-icon--teal"><ToothIcon /></span>
                  <div className="record-info-item">
                    <span className="record-info-label">Tooth Number</span>
                    <span className="record-info-value">#{detailItem.tooth_number}</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

export default PatientDentalRecords;
