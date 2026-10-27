import { useCallback, useEffect, useState } from 'react';
import { getMyDentalRecord } from '../../api/dentalRecords';
import StatusBadge from './components/StatusBadge';
import Modal from './components/Modal';
import Skeleton from './components/Skeleton';
import PageHeader from './components/PageHeader';
import FilterDropdown from './components/FilterDropdown';
import { FileIcon, ClockIcon, UserIcon, CheckCircleIcon, CalendarIcon, ToothIcon, ShieldIcon } from './icons';
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
  const [record, setRecord] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [visibleHistoryCount, setVisibleHistoryCount] = useState(HISTORY_PAGE_SIZE);
  const [detailItem, setDetailItem] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setRecord(await getMyDentalRecord());
    } catch {
      setError('Could not load your dental records. Please refresh the page.');
    } finally {
      setLoading(false);
    }
  }, []);

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

  return (
    <div>
      <PageHeader
        icon={ToothIcon}
        title="My Dental Records"
        subtitle="Your dental treatment history and clinical records from Smile Bay."
      />

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
                      <li key={h.id} className="record-history-row">
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
