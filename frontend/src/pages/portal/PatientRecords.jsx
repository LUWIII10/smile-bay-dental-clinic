import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import {
  searchPatientRecords,
  getPatientRecord,
  addClinicalNote,
  setToothCondition,
  createTreatmentPlan,
  updateTreatmentPlanStatus,
  updateTreatmentPlanItemStatus,
  addTreatmentHistory,
} from '../../api/patientRecords';
import DataTable from './components/DataTable';
import Pagination from './components/Pagination';
import Skeleton from './components/Skeleton';
import StatusBadge from './components/StatusBadge';
import Modal from './components/Modal';
import { CONDITION_META, PLAN_STATUS_TONE, UPPER_ARCH, LOWER_ARCH, formatRecordDate as formatDate } from './dentalRecordShared';
import { SearchIcon, FileIcon, ClockIcon, UserIcon, ShieldIcon, PrinterIcon } from './icons';
import { showSuccessToast, showErrorToast } from '../../utils/toast';
import './dashboards.css';
import './Appointments.css';
import './DentalRecords.css';

const SEARCH_DEBOUNCE_MS = 400;
const CONDITION_OPTIONS = Object.entries(CONDITION_META).map(([value, meta]) => ({ value, label: meta.label }));
const EMPTY_ITEM = { procedure_name: '', tooth_number: '', notes: '' };
const SEX_LABELS = { male: 'Male', female: 'Female' };

function getInitials(name) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] || '';
  const last = parts.length > 1 ? parts[parts.length - 1][0] : '';
  return (first + last).toUpperCase();
}

function PatientRecords() {
  const { role } = useAuth();
  const location = useLocation();
  // Set when the dentist arrives here via "Add Visit Record" on their
  // schedule — the completed appointment to open a note against.
  const incoming = location.state || {};
  const isDentist = role === 'dentist';
  // Assistants get a read-only, front-desk-appropriate slice of the record —
  // no tooth chart (nothing to chart from a coordination role), no
  // treatment plans or clinical notes (dentist's clinical judgment, not
  // reception's). Dentist and Admin views are untouched below.
  const isAssistantView = role === 'dental_assistant';

  // ---- List state ----
  const [patients, setPatients] = useState([]);
  const [meta, setMeta] = useState(null);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(10);
  const debounceRef = useRef(null);

  // ---- Detail state ----
  const [selectedPatientId, setSelectedPatientId] = useState(incoming.patientId ?? null);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState('');
  const [selectedTooth, setSelectedTooth] = useState(null);
  const [toothForm, setToothForm] = useState({ condition: 'healthy', notes: '' });
  const [savingTooth, setSavingTooth] = useState(false);

  // ---- Modals (dentist-only actions) ----
  const [noteModalOpen, setNoteModalOpen] = useState(false);
  const [noteText, setNoteText] = useState('');
  const [savingNote, setSavingNote] = useState(false);
  // When arriving from the schedule's "Add Visit Record", the clinical note
  // is tied to that completed appointment (appointment_id on storeClinicalNote).
  const [linkedAppointmentId, setLinkedAppointmentId] = useState(incoming.appointmentId ?? null);
  const [linkedVisitLabel, setLinkedVisitLabel] = useState(incoming.visitLabel ?? '');

  const [planModalOpen, setPlanModalOpen] = useState(false);
  const [planForm, setPlanForm] = useState({ title: '', description: '', target_date: '', items: [{ ...EMPTY_ITEM }] });
  const [savingPlan, setSavingPlan] = useState(false);

  const [historyModalOpen, setHistoryModalOpen] = useState(false);
  const [historyForm, setHistoryForm] = useState({ procedure_name: '', tooth_number: '', performed_at: '', notes: '' });
  const [savingHistory, setSavingHistory] = useState(false);

  useEffect(() => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setSearch(searchInput.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(debounceRef.current);
  }, [searchInput]);

  useEffect(() => {
    setPage(1);
  }, [search, perPage]);

  const loadList = useCallback(async () => {
    setListLoading(true);
    setListError('');
    try {
      const result = await searchPatientRecords({ search, page, per_page: perPage });
      setPatients(result.data);
      setMeta({
        current_page: result.current_page,
        last_page: result.last_page,
        per_page: result.per_page,
        total: result.total,
        from: result.from,
        to: result.to,
      });
    } catch {
      setListError('Could not load patients. Please refresh the page.');
    } finally {
      setListLoading(false);
    }
  }, [search, page, perPage]);

  useEffect(() => {
    if (!selectedPatientId) loadList();
  }, [loadList, selectedPatientId]);

  const loadDetail = useCallback(async (patientId) => {
    setDetailLoading(true);
    setDetailError('');
    try {
      setDetail(await getPatientRecord(patientId));
    } catch {
      setDetailError("Could not load this patient's record.");
    } finally {
      setDetailLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedPatientId) {
      setSelectedTooth(null);
      loadDetail(selectedPatientId);
    }
  }, [selectedPatientId, loadDetail]);

  // Arrived from the schedule's "Add Visit Record" — open the note modal
  // straight away so the dentist lands on writing the visit up. Runs once.
  useEffect(() => {
    if (incoming.appointmentId && incoming.patientId) {
      setNoteModalOpen(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // A visit link only makes sense for the patient we were sent to; picking
  // any other patient (or going back to the list) clears it.
  const openPatient = (id) => {
    setLinkedAppointmentId(null);
    setLinkedVisitLabel('');
    setSelectedPatientId(id);
  };
  const backToList = () => {
    setLinkedAppointmentId(null);
    setLinkedVisitLabel('');
    setSelectedPatientId(null);
    setDetail(null);
  };

  // ---- Tooth chart ----
  const conditionByTooth = {};
  (detail?.dental_record?.tooth_conditions || []).forEach((tc) => {
    conditionByTooth[tc.tooth_number] = tc;
  });
  const getToothInfo = (n) => conditionByTooth[n] || { tooth_number: n, condition: 'healthy', notes: null, updated_by: null };

  const selectTooth = (n) => {
    setSelectedTooth((prev) => (prev === n ? null : n));
    const info = getToothInfo(n);
    setToothForm({ condition: info.condition, notes: info.notes || '' });
  };

  const saveTooth = async () => {
    setSavingTooth(true);
    try {
      await setToothCondition(selectedPatientId, selectedTooth, toothForm.condition, toothForm.notes);
      await loadDetail(selectedPatientId);
      showSuccessToast('Tooth condition saved.');
    } catch {
      showErrorToast("Could not save this tooth's condition.");
    } finally {
      setSavingTooth(false);
    }
  };

  const renderArch = (numbers) => (
    <div className="tooth-row">
      {numbers.map((n) => {
        const info = getToothInfo(n);
        const condMeta = CONDITION_META[info.condition] || CONDITION_META.other;
        return (
          <button
            type="button"
            key={n}
            className={`tooth tooth--${condMeta.tone}${selectedTooth === n ? ' tooth--selected' : ''}`}
            onClick={() => selectTooth(n)}
            title={`Tooth #${n} — ${condMeta.label}`}
          >
            {n}
          </button>
        );
      })}
    </div>
  );

  // ---- Clinical note ----
  const submitNote = async () => {
    setSavingNote(true);
    try {
      await addClinicalNote(selectedPatientId, noteText.trim(), linkedAppointmentId);
      setNoteText('');
      setNoteModalOpen(false);
      setLinkedAppointmentId(null);
      setLinkedVisitLabel('');
      await loadDetail(selectedPatientId);
      showSuccessToast('Clinical note added.');
    } catch {
      showErrorToast('Could not save this note.');
    } finally {
      setSavingNote(false);
    }
  };

  // ---- Treatment plan ----
  const updatePlanItem = (index, field, value) => {
    setPlanForm((prev) => {
      const items = [...prev.items];
      items[index] = { ...items[index], [field]: value };
      return { ...prev, items };
    });
  };
  const addPlanItemRow = () => setPlanForm((prev) => ({ ...prev, items: [...prev.items, { ...EMPTY_ITEM }] }));
  const removePlanItemRow = (index) =>
    setPlanForm((prev) => ({ ...prev, items: prev.items.filter((_, i) => i !== index) }));

  const submitPlan = async () => {
    setSavingPlan(true);
    try {
      const items = planForm.items
        .filter((it) => it.procedure_name.trim())
        .map((it) => ({
          procedure_name: it.procedure_name.trim(),
          tooth_number: it.tooth_number ? Number(it.tooth_number) : null,
          notes: it.notes.trim() || null,
        }));
      await createTreatmentPlan(selectedPatientId, {
        title: planForm.title.trim(),
        description: planForm.description.trim(),
        target_date: planForm.target_date,
        items,
      });
      setPlanForm({ title: '', description: '', target_date: '', items: [{ ...EMPTY_ITEM }] });
      setPlanModalOpen(false);
      await loadDetail(selectedPatientId);
      showSuccessToast('Treatment plan created.');
    } catch {
      showErrorToast('Could not create this treatment plan.');
    } finally {
      setSavingPlan(false);
    }
  };

  const togglePlanItemStatus = async (item) => {
    const next = item.status === 'completed' ? 'pending' : 'completed';
    try {
      await updateTreatmentPlanItemStatus(item.id, next);
      await loadDetail(selectedPatientId);
      showSuccessToast('Item updated.');
    } catch {
      showErrorToast('Could not update this item.');
    }
  };

  const changePlanStatus = async (plan, status) => {
    try {
      await updateTreatmentPlanStatus(plan.id, status);
      await loadDetail(selectedPatientId);
      showSuccessToast('Plan status updated.');
    } catch {
      showErrorToast('Could not update this plan.');
    }
  };

  // ---- Treatment history ----
  const submitHistory = async () => {
    setSavingHistory(true);
    try {
      await addTreatmentHistory(selectedPatientId, {
        procedure_name: historyForm.procedure_name.trim(),
        tooth_number: historyForm.tooth_number ? Number(historyForm.tooth_number) : null,
        performed_at: historyForm.performed_at || null,
        notes: historyForm.notes.trim() || null,
      });
      setHistoryForm({ procedure_name: '', tooth_number: '', performed_at: '', notes: '' });
      setHistoryModalOpen(false);
      await loadDetail(selectedPatientId);
      showSuccessToast('Procedure logged.');
    } catch {
      showErrorToast('Could not log this procedure.');
    } finally {
      setSavingHistory(false);
    }
  };

  const columns = [
    {
      key: 'patient',
      label: 'Patient',
      minWidth: '28%',
      render: (row) => {
        const name = `${row.first_name} ${row.last_name}`.trim();
        return (
          <span className="cell-person">
            <span className="cell-avatar">{getInitials(name)}</span>
            <span className="cell-person-text">
              <span className="cell-person-name" title={name}>{name}</span>
              <span className="cell-person-sub">{row.patient_number}</span>
            </span>
          </span>
        );
      },
    },
    {
      key: 'contact',
      label: 'Contact',
      minWidth: '30%',
      render: (row) => (
        <span className="cell-person-text">
          <span className="cell-person-name">{row.user?.email}</span>
          {row.user?.mobile_number && <span className="cell-person-sub">{row.user.mobile_number}</span>}
        </span>
      ),
    },
    {
      key: 'type',
      label: 'Category',
      minWidth: '14%',
      align: 'center',
      render: (row) => (
        <StatusBadge status={row.patient_type === 'cash' ? 'Cash' : 'HMO'} tone={row.patient_type === 'cash' ? 'green' : 'amber'} />
      ),
    },
    {
      key: 'actions',
      label: '',
      minWidth: '14%',
      align: 'right',
      render: (row) => (
        <button type="button" className="dash-btn dash-btn--outline" onClick={() => openPatient(row.id)}>
          View Record
        </button>
      ),
    },
  ];

  if (selectedPatientId) {
    const patient = detail?.patient;
    const record = detail?.dental_record;
    const selectedInfo = selectedTooth ? getToothInfo(selectedTooth) : null;

    return (
      <div>
        <div className="section-card-header appt-page-header">
          <button type="button" className="dash-btn dash-btn--outline" onClick={backToList}>
            &larr; Back to Patient Records
          </button>
        </div>

        {detailLoading ? (
          <Skeleton variant="block" height="400px" />
        ) : detailError ? (
          <div className="dash-empty">
            <span className="dash-empty-title">{detailError}</span>
          </div>
        ) : patient && record ? (
          <>
            <div className="section-card">
              <div className="section-card-header">
                <h3 className="section-card-title">
                  <span className="section-card-title-with-icon">
                    <span className="section-card-title-icon"><UserIcon /></span> Patient Information
                  </span>
                </h3>
              </div>
              <div className="record-info-card">
                <div className="record-info-item">
                  <span className="record-info-label">Full Name</span>
                  <span className="record-info-value">{patient.first_name} {patient.middle_name} {patient.last_name}</span>
                </div>
                <div className="record-info-item">
                  <span className="record-info-label">Patient No.</span>
                  <span className="record-info-value">{patient.patient_number}</span>
                </div>
                <div className="record-info-item">
                  <span className="record-info-label">Date of Birth</span>
                  <span className="record-info-value">{patient.date_of_birth ? formatDate(patient.date_of_birth) : '—'}</span>
                </div>
                <div className="record-info-item">
                  <span className="record-info-label">Sex</span>
                  <span className="record-info-value">{SEX_LABELS[patient.sex] || patient.sex || '—'}</span>
                </div>
                <div className="record-info-item">
                  <span className="record-info-label">Email</span>
                  <span className="record-info-value">{patient.user?.email}</span>
                </div>
                <div className="record-info-item">
                  <span className="record-info-label">Mobile</span>
                  <span className="record-info-value">{patient.user?.mobile_number || '—'}</span>
                </div>
                <div className="record-info-item record-info-item--full">
                  <span className="record-info-label">Complete Address</span>
                  <span className="record-info-value">{patient.address_line || '—'}</span>
                </div>
                <div className="record-info-item">
                  <span className="record-info-label">Emergency Contact</span>
                  <span className="record-info-value">
                    {patient.emergency_contact_name || '—'}
                    {patient.emergency_contact_relationship ? ` (${patient.emergency_contact_relationship})` : ''}
                  </span>
                </div>
                <div className="record-info-item">
                  <span className="record-info-label">Emergency Contact No.</span>
                  <span className="record-info-value">{patient.emergency_contact_number || '—'}</span>
                </div>
                <div className="record-info-item">
                  <span className="record-info-label">Patient Category</span>
                  <span className="record-info-value">
                    <StatusBadge
                      status={patient.patient_type === 'cash' ? 'Cash' : 'HMO'}
                      tone={patient.patient_type === 'cash' ? 'green' : 'amber'}
                      icon={patient.patient_type === 'cash' ? undefined : ShieldIcon}
                    />
                  </span>
                </div>
                {patient.patient_type === 'hmo' && (
                  <div className="record-info-item">
                    <span className="record-info-label">HMO Coverage</span>
                    <span className="record-info-value">
                      {patient.hmo_provider?.name || patient.hmo_company_name || 'Not on file'}
                      {patient.hmo_number ? ` (#${patient.hmo_number})` : ''}
                    </span>
                  </div>
                )}
                <div className="record-info-item">
                  <span className="record-info-label">Record No.</span>
                  <span className="record-info-value">{record.record_number}</span>
                </div>
                <div className="record-info-item">
                  <span className="record-info-label">Primary Dentist</span>
                  <span className="record-info-value">{record.primary_dentist?.name || 'Not yet assigned'}</span>
                </div>
              </div>
            </div>

            {(patient.allergies || patient.current_medications || patient.medical_conditions_other || patient.previous_surgeries) && (
              <div className="section-card">
                <div className="section-card-header">
                  <h3 className="section-card-title">Medical History <span className="section-card-title-note">(from registration)</span></h3>
                </div>
                <div className="record-info-card">
                  {patient.allergies && (
                    <div className="record-info-item record-info-item--full">
                      <span className="record-info-label">Allergies</span>
                      <span className="record-info-value">{patient.allergies}</span>
                    </div>
                  )}
                  {patient.current_medications && (
                    <div className="record-info-item record-info-item--full">
                      <span className="record-info-label">Current Medications</span>
                      <span className="record-info-value">{patient.current_medications}</span>
                    </div>
                  )}
                  {patient.medical_conditions_other && (
                    <div className="record-info-item record-info-item--full">
                      <span className="record-info-label">Medical Conditions</span>
                      <span className="record-info-value">{patient.medical_conditions_other}</span>
                    </div>
                  )}
                  {patient.previous_surgeries && (
                    <div className="record-info-item record-info-item--full">
                      <span className="record-info-label">Previous Surgeries</span>
                      <span className="record-info-value">{patient.previous_surgeries}</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {!isAssistantView && (
              <div className="section-card">
                <div className="section-card-header">
                  <h3 className="section-card-title">Tooth Chart</h3>
                </div>
                <p className="tooth-chart-note">
                  Universal Numbering System (1–32). Tap a tooth to {isDentist ? 'view or update its condition' : 'see details'}.
                </p>

                <div className="tooth-chart">
                  {renderArch(UPPER_ARCH)}
                  {renderArch(LOWER_ARCH)}
                </div>

                <div className="tooth-legend">
                  {Object.entries(CONDITION_META).map(([key, condMeta]) => (
                    <span key={key} className="tooth-legend-item">
                      <span className={`tooth-legend-dot tooth-legend-dot--${condMeta.tone}`} />
                      {condMeta.label}
                    </span>
                  ))}
                </div>

                {selectedInfo && (
                  <div className="tooth-detail-panel">
                    <div className="tooth-detail-header">
                      <span className="tooth-detail-title">Tooth #{selectedTooth}</span>
                      {!isDentist && (
                        <StatusBadge
                          status={CONDITION_META[selectedInfo.condition]?.label}
                          tone={CONDITION_META[selectedInfo.condition]?.tone}
                        />
                      )}
                    </div>

                    {isDentist ? (
                      <div className="tooth-edit-form">
                        <select
                          className="form-select"
                          value={toothForm.condition}
                          onChange={(e) => setToothForm((p) => ({ ...p, condition: e.target.value }))}
                        >
                          {CONDITION_OPTIONS.map((opt) => (
                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                          ))}
                        </select>
                        <textarea
                          className="form-textarea"
                          placeholder="Notes (optional)"
                          value={toothForm.notes}
                          onChange={(e) => setToothForm((p) => ({ ...p, notes: e.target.value }))}
                        />
                        <button type="button" className="dash-btn" disabled={savingTooth} onClick={saveTooth}>
                          {savingTooth ? 'Saving…' : 'Save Tooth Condition'}
                        </button>
                      </div>
                    ) : (
                      <p className="tooth-detail-notes">{selectedInfo.notes || 'No notes on file for this tooth.'}</p>
                    )}
                    {selectedInfo.updated_by && (
                      <span className="tooth-detail-meta">Last updated by {selectedInfo.updated_by.name}</span>
                    )}
                  </div>
                )}
              </div>
            )}

            {!isAssistantView && (
              <div className="section-card">
                <div className="section-card-header">
                  <h3 className="section-card-title">Treatment Plans</h3>
                  {isDentist && (
                    <button type="button" className="dash-btn dash-btn--outline" onClick={() => setPlanModalOpen(true)}>
                      + New Plan
                    </button>
                  )}
                </div>
                {record.treatment_plans.length === 0 ? (
                  <div className="dash-empty">
                    <FileIcon />
                    <span className="dash-empty-title">No treatment plans yet</span>
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
                          {isDentist ? (
                            <select
                              className="form-select plan-status-select"
                              value={plan.status}
                              onChange={(e) => changePlanStatus(plan, e.target.value)}
                            >
                              <option value="planned">Planned</option>
                              <option value="in_progress">In Progress</option>
                              <option value="completed">Completed</option>
                              <option value="cancelled">Cancelled</option>
                            </select>
                          ) : (
                            <StatusBadge status={plan.status} tone={PLAN_STATUS_TONE[plan.status]} />
                          )}
                        </div>
                        {plan.description && <p className="plan-card-desc">{plan.description}</p>}
                        {plan.target_date && <span className="plan-card-target">Target: {formatDate(plan.target_date)}</span>}
                        {plan.items.length > 0 && (
                          <ul className="plan-item-list">
                            {plan.items.map((item) => (
                              <li key={item.id} className="plan-item">
                                <span className="plan-item-name">
                                  {item.procedure_name}
                                  {item.tooth_number ? ` — Tooth #${item.tooth_number}` : ''}
                                </span>
                                {isDentist ? (
                                  <button type="button" className="plan-item-toggle" onClick={() => togglePlanItemStatus(item)}>
                                    <StatusBadge status={item.status} />
                                  </button>
                                ) : (
                                  <StatusBadge status={item.status} />
                                )}
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div className="section-card">
              <div className="section-card-header">
                <h3 className="section-card-title">{isAssistantView ? 'Dental Treatment History' : 'Treatment History'}</h3>
                <div className="history-header-actions">
                  {isAssistantView && record.treatment_history.length > 0 && (
                    <button type="button" className="dash-btn dash-btn--outline" onClick={() => window.print()}>
                      <PrinterIcon /> Print History
                    </button>
                  )}
                  {isDentist && (
                    <button type="button" className="dash-btn dash-btn--outline" onClick={() => setHistoryModalOpen(true)}>
                      + Log Procedure
                    </button>
                  )}
                </div>
              </div>
              {record.treatment_history.length === 0 ? (
                <div className="dash-empty">
                  <ClockIcon />
                  <span className="dash-empty-title">No completed procedures yet</span>
                </div>
              ) : isAssistantView ? (
                <div className="history-timeline">
                  {record.treatment_history.map((h, i) => (
                    <div key={h.id} className="timeline-entry">
                      <span className={`timeline-dot${i === 0 ? ' timeline-dot--active' : ''}`} />
                      <div className="timeline-card">
                        <span className="timeline-card-title">
                          {h.procedure_name}
                          {h.tooth_number ? ` — Tooth #${h.tooth_number}` : ''}
                        </span>
                        <span className="timeline-card-meta">
                          {h.performed_by?.name || 'Dentist'} &middot; {formatDate(h.performed_at)}
                        </span>
                        {h.notes && <p className="timeline-card-notes">{h.notes}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <ul className="history-list">
                  {record.treatment_history.map((h) => (
                    <li key={h.id} className="history-item">
                      <span className="history-dot" />
                      <div className="history-item-text">
                        <span className="history-item-title">
                          {h.procedure_name}
                          {h.tooth_number ? ` — Tooth #${h.tooth_number}` : ''}
                        </span>
                        <span className="history-item-meta">
                          {formatDate(h.performed_at)}{h.performed_by ? ` · ${h.performed_by.name}` : ''}
                        </span>
                        {h.notes && <span className="history-item-notes">{h.notes}</span>}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {!isAssistantView && (
              <div className="section-card">
                <div className="section-card-header">
                  <h3 className="section-card-title">Clinical Notes</h3>
                  {isDentist && (
                    <button type="button" className="dash-btn dash-btn--outline" onClick={() => setNoteModalOpen(true)}>
                      + Add Note
                    </button>
                  )}
                </div>
                {record.clinical_notes.length === 0 ? (
                  <div className="dash-empty">
                    <FileIcon />
                    <span className="dash-empty-title">No clinical notes yet</span>
                  </div>
                ) : (
                  <ul className="notes-list">
                    {record.clinical_notes.map((note) => (
                      <li key={note.id} className="note-item">
                        <p className="note-item-text">{note.note}</p>
                        <span className="note-item-meta">{note.dentist?.name || 'Dentist'} · {formatDate(note.created_at)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </>
        ) : null}

        {isDentist && (
          <>
            <Modal open={noteModalOpen} onClose={() => setNoteModalOpen(false)} title="Add Clinical Note">
              {linkedAppointmentId && (
                <p style={{ margin: '0 0 10px', fontSize: '0.82rem', color: 'var(--portal-muted)' }}>
                  Linked to the completed visit{linkedVisitLabel ? ` on ${linkedVisitLabel}` : ''}.
                </p>
              )}
              <label className="modal-field-label">Note</label>
              <textarea
                className="form-textarea"
                placeholder="Write the clinical note…"
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
              />
              <div className="modal-actions">
                <button type="button" className="dash-btn dash-btn--outline" onClick={() => setNoteModalOpen(false)}>
                  Cancel
                </button>
                <button type="button" className="dash-btn" disabled={savingNote || !noteText.trim()} onClick={submitNote}>
                  {savingNote ? 'Saving…' : 'Save Note'}
                </button>
              </div>
            </Modal>

            <Modal open={planModalOpen} onClose={() => setPlanModalOpen(false)} title="New Treatment Plan" size="lg">
              <label className="modal-field-label">Title</label>
              <input
                className="form-input"
                value={planForm.title}
                onChange={(e) => setPlanForm((p) => ({ ...p, title: e.target.value }))}
                placeholder="e.g. Restorative Plan - Q1 2026"
              />

              <label className="modal-field-label">Description</label>
              <textarea
                className="form-textarea"
                value={planForm.description}
                onChange={(e) => setPlanForm((p) => ({ ...p, description: e.target.value }))}
                placeholder="Optional"
              />

              <label className="modal-field-label">Target Date</label>
              <input
                type="date"
                className="form-input"
                value={planForm.target_date}
                onChange={(e) => setPlanForm((p) => ({ ...p, target_date: e.target.value }))}
              />

              <label className="modal-field-label">Items</label>
              {planForm.items.map((item, i) => (
                <div key={i} className="plan-item-form-row">
                  <input
                    className="form-input"
                    placeholder="Procedure"
                    value={item.procedure_name}
                    onChange={(e) => updatePlanItem(i, 'procedure_name', e.target.value)}
                  />
                  <input
                    className="form-input plan-item-form-tooth"
                    type="number"
                    min="1"
                    max="32"
                    placeholder="Tooth #"
                    value={item.tooth_number}
                    onChange={(e) => updatePlanItem(i, 'tooth_number', e.target.value)}
                  />
                  {planForm.items.length > 1 && (
                    <button type="button" className="row-action-icon" onClick={() => removePlanItemRow(i)} aria-label="Remove item">
                      &times;
                    </button>
                  )}
                </div>
              ))}
              <button type="button" className="dash-btn dash-btn--outline plan-item-add-btn" onClick={addPlanItemRow}>
                + Add Item
              </button>

              <div className="modal-actions">
                <button type="button" className="dash-btn dash-btn--outline" onClick={() => setPlanModalOpen(false)}>
                  Cancel
                </button>
                <button type="button" className="dash-btn" disabled={savingPlan || !planForm.title.trim()} onClick={submitPlan}>
                  {savingPlan ? 'Saving…' : 'Create Plan'}
                </button>
              </div>
            </Modal>

            <Modal open={historyModalOpen} onClose={() => setHistoryModalOpen(false)} title="Log Completed Procedure">
              <label className="modal-field-label">Procedure</label>
              <input
                className="form-input"
                value={historyForm.procedure_name}
                onChange={(e) => setHistoryForm((p) => ({ ...p, procedure_name: e.target.value }))}
                placeholder="e.g. Composite Filling"
              />

              <label className="modal-field-label">Tooth Number</label>
              <input
                className="form-input"
                type="number"
                min="1"
                max="32"
                value={historyForm.tooth_number}
                onChange={(e) => setHistoryForm((p) => ({ ...p, tooth_number: e.target.value }))}
                placeholder="Optional"
              />

              <label className="modal-field-label">Date Performed</label>
              <input
                className="form-input"
                type="date"
                value={historyForm.performed_at}
                onChange={(e) => setHistoryForm((p) => ({ ...p, performed_at: e.target.value }))}
              />

              <label className="modal-field-label">Notes</label>
              <textarea
                className="form-textarea"
                value={historyForm.notes}
                onChange={(e) => setHistoryForm((p) => ({ ...p, notes: e.target.value }))}
                placeholder="Optional"
              />

              <div className="modal-actions">
                <button type="button" className="dash-btn dash-btn--outline" onClick={() => setHistoryModalOpen(false)}>
                  Cancel
                </button>
                <button
                  type="button"
                  className="dash-btn"
                  disabled={savingHistory || !historyForm.procedure_name.trim()}
                  onClick={submitHistory}
                >
                  {savingHistory ? 'Saving…' : 'Log Procedure'}
                </button>
              </div>
            </Modal>
          </>
        )}
      </div>
    );
  }

  return (
    <div>
      <div className="section-card-header appt-page-header">
        <div>
          <h1 className="appt-page-title">Patient Records</h1>
          <p className="appt-page-subtitle">
            {isDentist ? 'Search patients to view or update their dental records.' : 'Search patients to view their dental records.'}
          </p>
        </div>
      </div>

      <div className="section-card">
        <div className="appt-toolbar">
          <div className="filter-field filter-field--grow">
            <div className="filter-search">
              <SearchIcon />
              <input
                type="text"
                className="form-input"
                placeholder="Search by name, patient no., or email…"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
              />
            </div>
          </div>
        </div>

        {listLoading ? (
          <Skeleton variant="row" count={6} />
        ) : listError ? (
          <div className="dash-empty">
            <span className="dash-empty-title">{listError}</span>
          </div>
        ) : (
          <div className="appt-master-table">
            <DataTable columns={columns} rows={patients} emptyMessage="No patients match this search." />
            <Pagination meta={meta} onPageChange={setPage} onPerPageChange={(n) => { setPerPage(n); setPage(1); }} itemLabel="patient" />
          </div>
        )}
      </div>
    </div>
  );
}

export default PatientRecords;
