import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import {
  searchPatientRecords,
  getPatientRecord,
  getAppointmentsByDate,
  addClinicalNote,
  setToothCondition,
  createTreatmentPlan,
  updateTreatmentPlanStatus,
  updateTreatmentPlanItemStatus,
  addTreatmentHistory,
} from '../../api/patientRecords';
import { completeAppointment, backfillTreatmentRecord } from '../../api/appointments';
import DataTable from './components/DataTable';
import Pagination from './components/Pagination';
import Skeleton from './components/Skeleton';
import StatusBadge from './components/StatusBadge';
import Modal from './components/Modal';
import PageHeader from './components/PageHeader';
import PrintLetterhead from './components/PrintLetterhead';
import {
  CONDITION_META,
  PLAN_STATUS_TONE,
  UPPER_ARCH,
  LOWER_ARCH,
  TOOTH_TYPE,
  TOOTH_SHAPE_PATHS,
  formatRecordDate as formatDate,
} from './dentalRecordShared';
import { SearchIcon, FileIcon, ClockIcon, UserIcon, ShieldIcon, PrinterIcon, DownloadIcon, AlertIcon, SyringeIcon, ToothIcon, MailIcon, CalendarIcon, UsersIcon } from './icons';
import { formatDateLong, formatTime12h } from './dateTimeUtils';
import { showSuccessToast, showErrorToast } from '../../utils/toast';
import PrintFooter from './components/PrintFooter';
import './dashboards.css';
import './Appointments.css';
import './DentalRecords.css';
import './components/PrintLetterhead.css';

const SEARCH_DEBOUNCE_MS = 400;
const VISIT_NOTES_MIN_LENGTH = 20;
// complete()'s notes column caps at 1000 — storeClinicalNote() allows up to
// 5000 (same as the "+ Add Note" textarea). A note longer than this is
// valid everywhere else on this page but can't be forwarded to complete()
// as-is; checked client-side so it's caught with a specific message instead
// of a 422. Known constraint, not something this pass reconciles.
const VISIT_NOTES_MAX_LENGTH = 1000;
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

function formatStatusLabel(status) {
  return String(status).replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());
}

// Real age from a real date of birth — not stored anywhere, computed once
// for the printed header/Section 1. Subtracts a year if this year's
// birthday hasn't happened yet.
function calculateAge(dateOfBirth) {
  if (!dateOfBirth) return null;
  const dob = new Date(dateOfBirth);
  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  const monthDiff = today.getMonth() - dob.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dob.getDate())) age -= 1;
  return age;
}

// medical_conditions is the registration wizard's checklist (Pregnant,
// Breastfeeding, Smoking/Vape, Alcohol Use, Drug Use, among the medical
// categories) — a JSON array of the exact option strings checked, nothing
// more granular than "checked or not". Pulled out here rather than
// invented: no field anywhere records a smoking/drinking *frequency*, so
// the printed report says only what was actually reported, not a level of
// detail ("social", "occasional") this app never collected.
function hasConditionFlag(patient, ...labels) {
  const list = patient?.medical_conditions || [];
  return labels.some((label) => list.includes(label));
}

function pregnancyStatusLabel(patient) {
  if (patient.sex === 'male') return 'Not applicable';
  if (hasConditionFlag(patient, 'Pregnant')) return 'Pregnant';
  if (hasConditionFlag(patient, 'Breastfeeding')) return 'Breastfeeding';
  return 'Not pregnant';
}

// Cross-references a charted tooth against this patient's own treatment
// history (already loaded, same data the Treatment History section
// lists) for the most recent procedure recorded against that exact tooth
// number — tooth_conditions itself has no treatment/procedure column of
// its own, so this is the only honest source for that column rather than
// a blank or invented value.
function lastProcedureForTooth(treatmentHistory, toothNumber) {
  const match = (treatmentHistory || [])
    .filter((h) => h.tooth_number === toothNumber)
    .sort((a, b) => (a.performed_at < b.performed_at ? 1 : -1))[0];
  return match ? match.procedure_name : null;
}

// Rolling last-12-months window, same defaulting pattern as Reports.jsx's
// defaultRange() — a starting point the two print date inputs then edit
// freely. Filtering happens entirely client-side against data already
// loaded by getPatientRecord(); changing these never refetches anything.
function defaultPrintRange() {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  from.setFullYear(from.getFullYear() - 1);
  const toIso = (d) => d.toISOString().slice(0, 10);
  return { date_from: toIso(from), date_to: toIso(now) };
}

// complete()'s exact notes rule (min 20, max 1000), checked ahead of time so
// a note that fails it is caught with a specific message on submit rather
// than a 422 from the network. Doesn't gate the button — see submitVisit.
function checkNoteLengthForCompletion(note) {
  const length = note.trim().length;
  if (length < VISIT_NOTES_MIN_LENGTH) {
    return `The clinical note for this visit is too short to record — ${length}/${VISIT_NOTES_MIN_LENGTH} characters.`;
  }
  if (length > VISIT_NOTES_MAX_LENGTH) {
    return `The clinical note for this visit is too long to record — shorten it to ${VISIT_NOTES_MAX_LENGTH.toLocaleString()} characters or fewer. It is currently ${length.toLocaleString()}.`;
  }
  return null;
}

function PatientRecords() {
  const { role } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  // Set when the dentist arrives here from DentistSchedule.jsx — either
  // mode: 'completing' (Complete button, still-confirmed appointment) or
  // mode: 'addRecord' (the old "Add Visit Record", already-completed
  // appointment). Kept as an explicit flag rather than inferred from status,
  // since status can change mid-session.
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
  // "Who's scheduled on this date" print — separate from the search/page
  // state above: while a date is picked, the table shows appointments for
  // that date instead of the patient directory (see filteredByDate below),
  // and clearing it goes back to normal without losing whatever search/page
  // was active before.
  const [dateFilter, setDateFilter] = useState('');
  const [dateAppointments, setDateAppointments] = useState([]);
  const [dateLoading, setDateLoading] = useState(false);
  const [dateError, setDateError] = useState('');

  // ---- Detail state ----
  const [selectedPatientId, setSelectedPatientId] = useState(incoming.patientId ?? null);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState('');
  const [selectedTooth, setSelectedTooth] = useState(null);
  const [toothForm, setToothForm] = useState({ condition: 'healthy', notes: '' });
  const [savingTooth, setSavingTooth] = useState(false);
  // Print-only date filter — scopes Treatment History (by performed_at) and
  // Clinical Notes (by created_at) in the printed report. Patient info and
  // the tooth chart are current-state, not dated, and always print in full
  // regardless of this range; see the printed report for the reasoning on
  // why Treatment Plans also isn't filtered by it.
  const [printRange, setPrintRange] = useState(defaultPrintRange());

  // ---- Completing a visit (arrived via DentistSchedule's Complete button) ----
  // Only ever true while still viewing the same patient this completing
  // session is for — switching patients or going back to the list hides the
  // banner/bar even though location.state itself hasn't changed.
  // appointmentStatus is a point-in-time snapshot taken when the dentist
  // clicked Complete; complete() itself is still the authoritative guard.
  const isCompletingVisit =
    isDentist &&
    incoming.mode === 'completing' &&
    incoming.appointmentStatus === 'confirmed' &&
    !!incoming.appointmentId &&
    selectedPatientId === incoming.patientId;
  // Same arrival shape as isCompletingVisit, for a visit that's already
  // 'completed' but has no treatment_history row — DentistSchedule.jsx's
  // "Needs Treatment Record" section. Reuses the exact same write-a-note-
  // then-submit UI below; only the submitted status action and wording
  // differ (see isVisitFlow, submitVisit).
  const isBackfillingVisit =
    isDentist &&
    incoming.mode === 'backfilling' &&
    incoming.appointmentStatus === 'completed' &&
    !!incoming.appointmentId &&
    selectedPatientId === incoming.patientId;
  const isVisitFlow = isCompletingVisit || isBackfillingVisit;
  // No tooth_number or notes field here — the tooth chart and Clinical
  // Notes sections above are the source of truth for both; duplicating them
  // on the bar contradicted them on the same screen. tooth_number always
  // sends null (the chart has no appointment link, so there's nothing
  // honest to send); notes comes from the most recent clinical_notes row
  // scoped to this appointment (see noteForVisit below).
  const [visitForm, setVisitForm] = useState({
    procedure_name: incoming.serviceName || '',
    performed_at: incoming.appointmentDate || '',
  });
  const [visitErrors, setVisitErrors] = useState({});
  const [visitFormError, setVisitFormError] = useState('');
  const [savingVisit, setSavingVisit] = useState(false);

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

  useEffect(() => {
    if (!dateFilter) {
      setDateAppointments([]);
      setDateError('');
      return;
    }
    let cancelled = false;
    setDateLoading(true);
    setDateError('');
    getAppointmentsByDate(dateFilter)
      .then((data) => { if (!cancelled) setDateAppointments(data); })
      .catch(() => { if (!cancelled) setDateError('Could not load appointments for this date.'); })
      .finally(() => { if (!cancelled) setDateLoading(false); });
    return () => { cancelled = true; };
  }, [dateFilter]);

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

  // Arrived from the schedule's "Add Visit Record" (an already-completed
  // appointment) — open the note modal straight away so the dentist lands
  // on writing the visit up. Explicitly NOT for mode: 'completing' — that
  // flow uses the inline form on the completion bar instead, not this
  // modal. Runs once.
  useEffect(() => {
    if (incoming.mode === 'addRecord' && incoming.appointmentId && incoming.patientId) {
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
    } catch (err) {
      showErrorToast(err.response?.data?.message || "Could not save this tooth's condition.");
    } finally {
      setSavingTooth(false);
    }
  };

  // isUpper only decides two visual things: which side of the shape the
  // number sits on, and whether the shape gets flipped. Nothing about
  // selectTooth/getToothInfo/click handling changes with it.
  //
  // The <svg><path> here is inline per button, not a <use> referencing a
  // shared <defs> — a CSS descendant selector like `.tooth--green
  // .tooth-shape-svg path` cannot match anything inside <use>-generated
  // content in any browser (that content isn't exposed to author selectors
  // at all, per spec), so the tone-tinting rules already in DentalRecords
  // .css never had a real target before. A real, per-instance <path> is
  // what makes them work. width/height are set explicitly alongside
  // viewBox so nothing depends on <use>'s default-sizing behaviour either.
  const renderTooth = (n, isUpper) => {
    const info = getToothInfo(n);
    const condMeta = CONDITION_META[info.condition] || CONDITION_META.other;
    const type = TOOTH_TYPE[n];
    // Only 6 tone families cover 9 conditions (decayed/impacted share red,
    // missing/extracted share gray) — disambiguated by stroke pattern and
    // fill opacity instead of a new colour.
    const dashed = info.condition === 'impacted' || info.condition === 'extracted';
    const reduced = info.condition === 'missing' || info.condition === 'extracted';
    // The number stays a literal text node inside the button (not a
    // ::before, not only the title attr) so it's part of the button's
    // accessible name exactly as it is today.
    const numberEl = <span className="tooth-number">{n}</span>;
    const shapeEl = (
      <span className="tooth-shape" aria-hidden="true">
        <svg
          className={`tooth-shape-svg${isUpper ? ' tooth-shape-svg--flip' : ''}`}
          viewBox="0 0 24 36"
          width="34"
          height="45"
          focusable="false"
        >
          <path d={TOOTH_SHAPE_PATHS[type]} />
        </svg>
      </span>
    );
    return (
      <button
        type="button"
        key={n}
        className={`tooth tooth--${condMeta.tone}${dashed ? ' tooth--dashed' : ''}${reduced ? ' tooth--reduced-opacity' : ''}${selectedTooth === n ? ' tooth--selected' : ''}`}
        onClick={() => selectTooth(n)}
        title={`Tooth #${n} — ${condMeta.label}`}
      >
        {isUpper ? numberEl : shapeEl}
        {isUpper ? shapeEl : numberEl}
      </button>
    );
  };

  const renderArch = (numbers, isUpper) => (
    <div className="tooth-row">{numbers.map((n) => renderTooth(n, isUpper))}</div>
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
    } catch (err) {
      showErrorToast(err.response?.data?.message || 'Could not save this note.');
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
    } catch (err) {
      showErrorToast(err.response?.data?.message || 'Could not create this treatment plan.');
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
    } catch (err) {
      showErrorToast(err.response?.data?.message || 'Could not log this procedure.');
    } finally {
      setSavingHistory(false);
    }
  };

  // ---- Completing a visit ----
  // Only the two fields with no equivalent section on this page — the
  // Clinical Notes section above is the source of truth for notes, the
  // tooth chart for tooth data. Same validation CompleteAppointmentModal.jsx
  // already has for these two (that file is unused but left in place, not
  // extended or imported from here).
  const validateVisitForm = () => {
    const next = {};
    if (!visitForm.procedure_name.trim()) next.procedure_name = 'Enter the procedure that was performed.';
    if (!visitForm.performed_at) next.performed_at = 'Enter the date this was performed.';
    return next;
  };

  // noteForVisit is the most recent clinical_notes row scoped to this
  // appointment (record.clinical_notes arrives newest-first — see Phase 1).
  // Its presence gates the button where it's rendered; its length is
  // checked here, on submit, so a note that's too short or too long is
  // caught with a specific message instead of a 422 from complete().
  // tooth_number always sends null — the tooth chart has no appointment
  // link, so there's nothing honest to send.
  const submitVisit = async (noteForVisit) => {
    const clientErrors = validateVisitForm();
    const noteIssue = noteForVisit ? checkNoteLengthForCompletion(noteForVisit.note) : null;
    if (noteIssue) clientErrors.notes = noteIssue;
    if (Object.keys(clientErrors).length > 0) {
      setVisitErrors(clientErrors);
      return;
    }

    setSavingVisit(true);
    setVisitFormError('');
    setVisitErrors({});
    try {
      const payload = {
        procedureName: visitForm.procedure_name.trim(),
        toothNumber: null,
        performedAt: visitForm.performed_at,
        notes: noteForVisit.note.trim(),
      };
      if (isBackfillingVisit) {
        await backfillTreatmentRecord(incoming.appointmentId, payload);
        showSuccessToast('Treatment record added.');
      } else {
        await completeAppointment(incoming.appointmentId, payload);
        showSuccessToast('Appointment completed.');
      }
      // Stay right here on this patient's now-updated record (fresh
      // treatment history, the note just written) instead of bouncing back
      // to My Schedule — that was the old behavior, but a dentist who just
      // finished writing up a visit is far more likely to want to glance at
      // the record they just updated than return to the schedule list.
      // Clearing location.state (not just navigating) is what actually
      // turns off isCompletingVisit/isBackfillingVisit — incoming reads
      // straight from it on every render, and it wouldn't otherwise change
      // just because the appointment's own status did.
      await loadDetail(selectedPatientId);
      navigate(location.pathname, { replace: true, state: {} });
    } catch (err) {
      const serverErrors = err.response?.data?.errors;
      if (serverErrors) {
        setVisitErrors(
          Object.fromEntries(Object.entries(serverErrors).map(([field, messages]) => [field, messages[0]]))
        );
      }
      setVisitFormError(
        err.response?.data?.message ||
          (isBackfillingVisit ? 'Could not add this treatment record.' : 'Could not complete this appointment.')
      );
    } finally {
      setSavingVisit(false);
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

  // "Who's scheduled on this date" table — appointment-centric (one row per
  // appointment, not per patient), separate from `columns` above since the
  // row shape is completely different (Appointment, not Patient).
  const dateColumns = [
    {
      key: 'patient',
      label: 'Patient',
      minWidth: '22%',
      render: (row) => {
        const name = `${row.patient?.first_name || ''} ${row.patient?.last_name || ''}`.trim();
        return (
          <span className="cell-person">
            <span className="cell-avatar">{getInitials(name)}</span>
            <span className="cell-person-text">
              <span className="cell-person-name" title={name}>{name}</span>
              <span className="cell-person-sub">{row.patient?.patient_number}</span>
            </span>
          </span>
        );
      },
    },
    {
      key: 'time',
      label: 'Time',
      minWidth: '14%',
      render: (row) => formatTime12h(row.appointment_time),
    },
    {
      key: 'service',
      label: 'Service',
      minWidth: '28%',
      clampLines: 2,
      render: (row) => row.service?.name,
    },
    {
      key: 'dentist',
      label: 'Dentist',
      minWidth: '22%',
      render: (row) => row.dentist?.name || 'Unassigned',
    },
    {
      key: 'actions',
      label: '',
      minWidth: '14%',
      align: 'right',
      render: (row) => (
        <button type="button" className="dash-btn dash-btn--outline" onClick={() => openPatient(row.patient.id)}>
          View Record
        </button>
      ),
    },
  ];

  if (selectedPatientId) {
    const patient = detail?.patient;
    const record = detail?.dental_record;
    const selectedInfo = selectedTooth ? getToothInfo(selectedTooth) : null;

    // Only the two categories Phase 1 confirmed can be reliably scoped by
    // appointment_id — tooth conditions and treatment plans have no
    // appointment link and were deliberately dropped from this count rather
    // than show a number that might be wrong.
    const historyForVisit = isVisitFlow
      ? (record?.treatment_history || []).filter((h) => h.appointment_id === incoming.appointmentId)
      : [];
    const notesForVisit = isVisitFlow
      ? (record?.clinical_notes || []).filter((n) => n.appointment_id === incoming.appointmentId)
      : [];
    // record.clinical_notes arrives newest-first (PatientRecordController::
    // show()'s orderByDesc('created_at')), so notesForVisit[0] is the most
    // recent note for this appointment — the one that stands as the visit
    // record if the dentist wrote more than one. Its presence, not its
    // content, gates the Complete button; length is checked on submit.
    const noteForVisit = notesForVisit[0] || null;
    const patientFullName = patient ? `${patient.first_name} ${patient.last_name}`.trim() : '';

    // Print-only date filter — performed_at is a plain DATE column (no time
    // component, so a direct string compare against the Y-m-d range bounds
    // is exact); created_at is a full timestamp, hence the slice. Treatment
    // plans and the tooth chart are deliberately not filtered — see the
    // printed report itself for why.
    const printHistory = (record?.treatment_history || []).filter(
      (h) => h.performed_at >= printRange.date_from && h.performed_at <= printRange.date_to
    );
    const printNotes = (record?.clinical_notes || []).filter(
      (n) => n.created_at.slice(0, 10) >= printRange.date_from && n.created_at.slice(0, 10) <= printRange.date_to
    );

    // Pregnant/Breastfeeding/Smoking/Alcohol already get their own rows in
    // Medical & Dental History below — excluded here so they aren't also
    // sitting inside this general list, redundant with their own row right
    // next to it.
    const BROKEN_OUT_CONDITIONS = ['Pregnant', 'Breastfeeding', 'Smoking/Vape', 'Alcohol Use'];
    const medicalConditionsSummary = (() => {
      const parts = (patient?.medical_conditions || []).filter((c) => !BROKEN_OUT_CONDITIONS.includes(c));
      if (patient?.medical_conditions_other) parts.push(patient.medical_conditions_other);
      return parts.length > 0 ? parts.join('; ') : 'None';
    })();
    const dentalConcernsSummary = (() => {
      const parts = [...(patient?.current_dental_symptoms || [])];
      if (patient?.visit_reason) parts.push(patient.visit_reason);
      return parts.length > 0 ? parts.join('; ') : 'None reported';
    })();

    return (
      <div>
        <div className="section-card-header appt-page-header">
          <button type="button" className="dash-btn dash-btn--outline" onClick={backToList}>
            &larr; Back to Patient Records
          </button>
          {/* Visible to all three roles that can reach this page at all —
              dentist, dental_assistant, admin. Printing a record someone is
              already allowed to view isn't a clinical-editing action, so
              it isn't gated by isDentist/isAssistantView the way the
              on-screen edit affordances below are. */}
          {patient && record && (
            <div className="record-print-controls">
              <input
                type="date"
                className="form-input"
                value={printRange.date_from}
                onChange={(e) => setPrintRange((p) => ({ ...p, date_from: e.target.value }))}
              />
              <span className="filter-date-range-sep" aria-hidden="true" />
              <input
                type="date"
                className="form-input"
                value={printRange.date_to}
                onChange={(e) => setPrintRange((p) => ({ ...p, date_to: e.target.value }))}
              />
              <button type="button" className="dash-btn dash-btn--outline" onClick={() => window.print()}>
                <PrinterIcon /> Print Record
              </button>
            </div>
          )}
        </div>

        {detailLoading ? (
          <Skeleton variant="block" height="400px" />
        ) : detailError ? (
          <div className="dash-empty">
            <span className="dash-empty-title">{detailError}</span>
          </div>
        ) : patient && record ? (
          <>
            {isVisitFlow && (
              <div className="completing-banner">
                <span className="completing-banner-icon"><FileIcon /></span>
                <div className="completing-banner-text">
                  <span className="completing-banner-title">
                    {isBackfillingVisit ? 'Adding a missing treatment record' : "Recording today's visit"}
                  </span>
                  <span className="completing-banner-desc">
                    {patientFullName} &middot; {incoming.serviceName} &middot; {incoming.visitLabel}
                  </span>
                </div>
                <span className="completing-banner-hint">
                  {isBackfillingVisit ? 'Fill in the record below, then save' : 'Fill in the record below, then complete'}
                </span>
              </div>
            )}

          {/* Print-only — the entire formal report. Built directly from
              patient/record/printRange, independent of isDentist/
              isAssistantView: unlike the interactive on-screen sections
              below (which hide the tooth chart, treatment plans and
              clinical notes from dental_assistant), a printed record is
              informational output any of the three roles that can open
              this page should be able to produce in full — the same
              reasoning behind moving the print button out of a
              dentist-only section in the first place. Supersedes the old
              .record-print-header/.record-print-tooth-summary entirely;
              .record-detail-print itself is hidden in print now
              (DentalRecords.css) since every part of it has an equivalent
              here. */}
          <div className="record-print-formal">
            {/* Shared with Reports.jsx and the Patient Records list's own
                appointments-by-date print — one letterhead component
                instead of each print surface keeping its own near-
                duplicate copy. Also resolves the old "no tagline" gap
                noted here before: PrintLetterhead hardcodes it the same
                way it already hardcodes the address/phone/email below,
                for the same reason (ClinicInfo, which holds the editable
                tagline, sits behind an admin-only endpoint this
                dentist/dental_assistant-reachable page can't call). */}
            <PrintLetterhead
              title="Patient Dental Record"
              metaRows={[
                { icon: UserIcon, label: 'Patient No.', value: patient.patient_number },
                {
                  icon: CalendarIcon,
                  label: 'Date Printed',
                  value: new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }),
                },
              ]}
            />

            <p className="record-print-formal-meta">
              Treatment History &amp; Clinical Notes below cover {formatDate(printRange.date_from)} – {formatDate(printRange.date_to)}. Patient information and the dental chart are current as of the print date, in full, regardless of that range.
            </p>

            <div className="record-print-section">
              <div className="record-print-section-header">
                <span className="record-print-section-icon"><UserIcon /></span>
                <h3 className="record-print-section-title">Patient Information</h3>
              </div>
              <div className="record-print-grid">
                <div className="record-print-grid-col">
                  <div className="record-print-grid-item"><span>Patient Name</span><span>{patient.first_name} {patient.middle_name} {patient.last_name}</span></div>
                  <div className="record-print-grid-item"><span>Patient No.</span><span>{patient.patient_number}</span></div>
                  <div className="record-print-grid-item"><span>Date of Birth</span><span>{patient.date_of_birth ? formatDate(patient.date_of_birth) : '—'}</span></div>
                  <div className="record-print-grid-item"><span>Age</span><span>{calculateAge(patient.date_of_birth) ?? '—'}</span></div>
                  <div className="record-print-grid-item"><span>Sex</span><span>{SEX_LABELS[patient.sex] || patient.sex || '—'}</span></div>
                </div>
                <div className="record-print-grid-col">
                  <div className="record-print-grid-item"><span>Contact Number</span><span>{patient.user?.mobile_number || '—'}</span></div>
                  <div className="record-print-grid-item"><span>Email</span><span>{patient.user?.email || '—'}</span></div>
                  <div className="record-print-grid-item"><span>Address</span><span>{patient.address_line || '—'}</span></div>
                  <div className="record-print-grid-item">
                    <span>Emergency Contact</span>
                    <span>
                      {patient.emergency_contact_name || '—'}
                      {patient.emergency_contact_relationship ? ` (${patient.emergency_contact_relationship})` : ''}
                    </span>
                  </div>
                  <div className="record-print-grid-item"><span>Emergency Contact No.</span><span>{patient.emergency_contact_number || '—'}</span></div>
                  <div className="record-print-grid-item">
                    <span>Patient Category</span>
                    <span>
                      {patient.patient_type === 'cash' ? 'Cash' : 'HMO'}
                      {patient.patient_type === 'hmo' && (patient.hmo_provider?.name || patient.hmo_company_name)
                        ? ` — ${patient.hmo_provider?.name || patient.hmo_company_name}${patient.hmo_number ? ` (#${patient.hmo_number})` : ''}`
                        : ''}
                    </span>
                  </div>
                  <div className="record-print-grid-item"><span>Primary Dentist</span><span>{record.primary_dentist?.name || 'Not yet assigned'}</span></div>
                </div>
              </div>
            </div>

            <div className="record-print-section">
              <div className="record-print-section-header">
                <span className="record-print-section-icon"><SyringeIcon /></span>
                <h3 className="record-print-section-title">Medical &amp; Dental History</h3>
              </div>
              <div className="record-print-grid">
                <div className="record-print-grid-col">
                  <div className="record-print-grid-item"><span>Allergies</span><span>{patient.allergies || 'None known'}</span></div>
                  <div className="record-print-grid-item"><span>Current Medications</span><span>{patient.current_medications || 'None'}</span></div>
                  <div className="record-print-grid-item"><span>Medical Conditions</span><span>{medicalConditionsSummary}</span></div>
                  <div className="record-print-grid-item"><span>Previous Surgeries / Hospitalization</span><span>{patient.previous_surgeries || 'None'}</span></div>
                  <div className="record-print-grid-item"><span>Pregnancy Status</span><span>{pregnancyStatusLabel(patient)}</span></div>
                </div>
                {/* Smoking/Alcohol here can only ever say whether the
                    registration checklist had that box ticked — not a
                    level of detail ("social", "occasional") this app
                    never collected. See hasConditionFlag's own comment. */}
                <div className="record-print-grid-col">
                  <div className="record-print-grid-item"><span>Smoking History</span><span>{hasConditionFlag(patient, 'Smoking/Vape') ? 'Smoker' : 'Non-smoker'}</span></div>
                  <div className="record-print-grid-item"><span>Alcohol History</span><span>{hasConditionFlag(patient, 'Alcohol Use') ? 'Reported' : 'None reported'}</span></div>
                  <div className="record-print-grid-item"><span>Previous Dental Treatment</span><span>{patient.last_dental_treatment || 'None on file'}</span></div>
                  <div className="record-print-grid-item"><span>Last Dental Visit</span><span>{patient.last_dental_visit || 'Not on file'}</span></div>
                  <div className="record-print-grid-item"><span>Dental Concerns</span><span>{dentalConcernsSummary}</span></div>
                </div>
              </div>
            </div>

            {/* Never date-filtered. tooth_conditions is current-state (one
                row per tooth, overwritten in place by setToothCondition),
                not a log of dated events — a "chart as of August" reading
                is meaningless when the table only ever stores each
                tooth's latest condition. Treatment / Procedure has no
                column of its own on tooth_conditions — it's derived via
                lastProcedureForTooth, cross-referencing this same
                patient's own treatment history by tooth number, rather
                than left blank or invented. */}
            <div className="record-print-section">
              <div className="record-print-section-header">
                <span className="record-print-section-icon"><ToothIcon /></span>
                <h3 className="record-print-section-title">Dental Chart Summary</h3>
              </div>
              {record.tooth_conditions.length === 0 ? (
                <p className="record-print-empty">No tooth conditions charted yet.</p>
              ) : (
                <table className="record-print-table">
                  <thead>
                    <tr><th>Tooth No.</th><th>Condition</th><th>Treatment / Procedure</th><th>Notes</th><th>Last Updated By</th></tr>
                  </thead>
                  <tbody>
                    {record.tooth_conditions.map((tc) => (
                      <tr key={tc.tooth_number}>
                        <td>{tc.tooth_number}</td>
                        <td>{CONDITION_META[tc.condition]?.label || tc.condition}</td>
                        <td>{lastProcedureForTooth(record.treatment_history, tc.tooth_number) || '—'}</td>
                        <td>{tc.notes || '—'}</td>
                        <td>{tc.updated_by?.name || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {/* Also not date-filtered. target_date is a future target for
                finishing the plan, not when the plan itself was authored
                or worked on — filtering "plans active in this period"
                against a single future date doesn't cleanly match either
                a created-in-period or completed-in-period reading (a plan
                made in January targeting December belongs to neither
                month). Printed in full rather than guess. */}
            <div className="record-print-section">
              <div className="record-print-section-header">
                <span className="record-print-section-icon"><FileIcon /></span>
                <h3 className="record-print-section-title">Treatment Plans</h3>
              </div>
              {record.treatment_plans.length === 0 ? (
                <p className="record-print-empty">No treatment plans on file.</p>
              ) : (
                <table className="record-print-table">
                  <thead>
                    <tr><th>Plan Title</th><th>Dentist</th><th>Status</th><th>Target Date</th><th>Planned Procedures / Items</th></tr>
                  </thead>
                  <tbody>
                    {record.treatment_plans.map((plan) => (
                      <tr key={plan.id}>
                        <td>{plan.title}</td>
                        <td>{plan.dentist?.name || '—'}</td>
                        <td>{formatStatusLabel(plan.status)}</td>
                        <td>{plan.target_date ? formatDate(plan.target_date) : '—'}</td>
                        <td>
                          {plan.items.length > 0
                            ? plan.items.map((it) => `${it.procedure_name}${it.tooth_number ? ` (Tooth #${it.tooth_number})` : ''}`).join('; ')
                            : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            <div className="record-print-section">
              <div className="record-print-section-header">
                <span className="record-print-section-icon"><ClockIcon /></span>
                <h3 className="record-print-section-title">Treatment History</h3>
              </div>
              {printHistory.length === 0 ? (
                <p className="record-print-empty">No entries in the selected period.</p>
              ) : (
                <table className="record-print-table">
                  <thead>
                    <tr><th>Date</th><th>Tooth / Area</th><th>Procedure</th><th>Dentist</th><th>Notes</th></tr>
                  </thead>
                  <tbody>
                    {printHistory.map((h) => (
                      <tr key={h.id}>
                        <td>{formatDate(h.performed_at)}</td>
                        <td>{h.tooth_number || '—'}</td>
                        <td>{h.procedure_name}</td>
                        <td>{h.performed_by?.name || '—'}</td>
                        <td>{h.notes || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            <div className="record-print-section">
              <div className="record-print-section-header">
                <span className="record-print-section-icon"><MailIcon /></span>
                <h3 className="record-print-section-title">Clinical Notes</h3>
              </div>
              {printNotes.length === 0 ? (
                <p className="record-print-empty">No entries in the selected period.</p>
              ) : (
                <table className="record-print-table">
                  <thead>
                    <tr><th>Date</th><th>Dentist</th><th>Note</th></tr>
                  </thead>
                  <tbody>
                    {printNotes.map((note) => (
                      <tr key={note.id}>
                        <td>{formatDate(note.created_at)}</td>
                        <td>{note.dentist?.name || '—'}</td>
                        <td>{note.note}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {/* Blank signature lines — a real consent/verification block
                is meant to be filled in by hand after printing, so there's
                no data to bind here; that's the point of this section. */}
            <div className="record-print-section">
              <div className="record-print-section-header">
                <span className="record-print-section-icon"><ShieldIcon /></span>
                <h3 className="record-print-section-title">Consent &amp; Record Verification</h3>
              </div>
              <p className="record-print-consent-text">
                I certify that the information in this record is accurate to the best of my knowledge and consent to its use for dental care at Smile Bay Dental Clinic.
              </p>
              <div className="record-print-signature-row">
                <div className="record-print-signature-block">
                  <span className="record-print-signature-line" />
                  <span className="record-print-signature-label">Patient / Guardian Signature</span>
                </div>
                <div className="record-print-signature-block">
                  <span className="record-print-signature-line" />
                  <span className="record-print-signature-label">Dentist Signature</span>
                </div>
              </div>
              <div className="record-print-signature-row">
                <div className="record-print-signature-block">
                  <span className="record-print-signature-line" />
                  <span className="record-print-signature-label">Date</span>
                </div>
                <div className="record-print-signature-block">
                  <span className="record-print-signature-line" />
                  <span className="record-print-signature-label">Record Verified By</span>
                </div>
              </div>
            </div>

            {/* Repeats on every printed page — see the verification report
                for why this stays a single line with no page number. */}
            <div className="record-print-footer">
              <span>Smile Bay Dental Clinic · Patient Dental Record · Confidential Medical Record</span>
            </div>
          </div>

          <div className="record-detail-print">
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
                  {renderArch(UPPER_ARCH, true)}
                  {renderArch(LOWER_ARCH, false)}
                </div>

                <div className="tooth-legend">
                  {/* A flex child with its own full-row basis, not a sibling
                      before .tooth-legend — keeps this heading inside the one
                      element the print stylesheet already hides, so nothing
                      there needs to change to also hide this. */}
                  <p className="tooth-legend-heading">Condition key</p>
                  {Object.entries(CONDITION_META).map(([key, condMeta]) => {
                    const dashed = key === 'impacted' || key === 'extracted';
                    const reduced = key === 'missing' || key === 'extracted';
                    return (
                      <span
                        key={key}
                        className={`tooth-legend-item tooth--${condMeta.tone}${dashed ? ' tooth--dashed' : ''}${reduced ? ' tooth--reduced-opacity' : ''}`}
                      >
                        <svg className="tooth-legend-swatch tooth-shape-svg" viewBox="0 0 24 36" width="20" height="30" aria-hidden="true" focusable="false">
                          <path d={TOOTH_SHAPE_PATHS.centralIncisor} />
                        </svg>
                        {condMeta.label}
                      </span>
                    );
                  })}
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
                          maxLength={1000}
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
          </div>

          {isVisitFlow && (
            <div className="section-card completion-bar">
              {noteForVisit ? (
                <>
                  <div className="section-card-header">
                    <h3 className="section-card-title">Recorded for this visit</h3>
                  </div>
                  <div className="completion-bar-badges">
                    {historyForVisit.length > 0 && (
                      <StatusBadge
                        status={`${historyForVisit.length} procedure${historyForVisit.length === 1 ? '' : 's'} logged`}
                        tone="green"
                      />
                    )}
                    <StatusBadge
                      status={`${notesForVisit.length} clinical note${notesForVisit.length === 1 ? '' : 's'} added`}
                      tone="green"
                    />
                  </div>
                </>
              ) : (
                <div className="priority-card completion-bar-warning">
                  <span className="priority-card-icon"><AlertIcon /></span>
                  <div className="priority-card-text">
                    <span className="priority-card-title">
                      {isBackfillingVisit ? 'Add a clinical note before saving' : 'Add a clinical note before completing'}
                    </span>
                    <span className="priority-card-desc">
                      {isBackfillingVisit
                        ? "This visit needs a clinical note in the patient's chart before a treatment record can be saved for it."
                        : "This visit needs a clinical note in the patient's chart before it can be marked complete."}
                      {' '}Write what was done in the Clinical Notes section above.
                    </span>
                  </div>
                </div>
              )}

              <label className="modal-field-label" htmlFor="visit-procedure-name">Procedure performed</label>
              <input
                id="visit-procedure-name"
                className="form-input"
                value={visitForm.procedure_name}
                onChange={(e) => setVisitForm((p) => ({ ...p, procedure_name: e.target.value }))}
                maxLength={255}
              />
              {visitErrors.procedure_name && <span className="modal-field-error">{visitErrors.procedure_name}</span>}

              <label className="modal-field-label" htmlFor="visit-performed-at">Date performed</label>
              <input
                id="visit-performed-at"
                className="form-input"
                type="date"
                value={visitForm.performed_at}
                onChange={(e) => setVisitForm((p) => ({ ...p, performed_at: e.target.value }))}
              />
              {visitErrors.performed_at && <span className="modal-field-error">{visitErrors.performed_at}</span>}

              {visitErrors.notes && <div className="profile-alert profile-alert--error" style={{ marginTop: 14 }}>{visitErrors.notes}</div>}
              {visitFormError && <div className="profile-alert profile-alert--error" style={{ marginTop: 14 }}>{visitFormError}</div>}

              <div className="modal-actions">
                {!noteForVisit && (
                  <span className="completion-bar-disabled-reason">Add a clinical note above to enable this.</span>
                )}
                <button
                  type="button"
                  className="dash-btn"
                  disabled={savingVisit || !noteForVisit}
                  onClick={() => submitVisit(noteForVisit)}
                >
                  {isBackfillingVisit
                    ? (savingVisit ? 'Saving…' : 'Save treatment record')
                    : (savingVisit ? 'Completing…' : 'Complete appointment')}
                </button>
              </div>
            </div>
          )}
          </>
        ) : null}

        {isDentist && (
          <>
            <Modal open={noteModalOpen} onClose={() => setNoteModalOpen(false)} title="Add Clinical Note">
              {linkedAppointmentId && (
                <p style={{ margin: '0 0 10px', fontSize: '0.82rem', color: 'var(--portal-muted)' }}>
                  Linked to this visit{linkedVisitLabel ? ` on ${linkedVisitLabel}` : ''}.
                </p>
              )}
              <label className="modal-field-label">Note</label>
              <textarea
                className="form-textarea"
                placeholder="Write the clinical note…"
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                maxLength={5000}
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
                maxLength={255}
              />

              <label className="modal-field-label">Description</label>
              <textarea
                className="form-textarea"
                value={planForm.description}
                onChange={(e) => setPlanForm((p) => ({ ...p, description: e.target.value }))}
                placeholder="Optional"
                maxLength={2000}
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
                    maxLength={255}
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
                maxLength={255}
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
                maxLength={1000}
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
      <PageHeader
        icon={FileIcon}
        title="Patient Records"
        subtitle={isDentist ? 'Search patients to view or update their dental records.' : 'Search patients to view their dental records.'}
      />

      <div className="section-card patient-records-onscreen">
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

          <div className="filter-field">
            <input
              type="date"
              className="form-input"
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
            />
          </div>

          <button
            type="button"
            className="dash-btn dash-btn--outline"
            disabled={!dateFilter || dateLoading || dateAppointments.length === 0}
            onClick={() => window.print()}
          >
            <PrinterIcon /> Print
          </button>

          {/* Same window.print() as Print above — the browser's own print
              dialog is the app's one PDF path (its "Save as PDF" destination),
              so no separate export/download plumbing exists to call here.
              Kept as its own button, per the approved mockup, since Print
              and "Download PDF" read as distinct intents even though they
              share a mechanism. */}
          <button
            type="button"
            className="dash-btn"
            disabled={!dateFilter || dateLoading || dateAppointments.length === 0}
            onClick={() => window.print()}
          >
            <DownloadIcon /> Download PDF
          </button>
        </div>

        {dateFilter ? (
          <p className="patient-records-date-note">
            <AlertIcon />
            Showing only patients with an appointment on <strong>{formatDateLong(dateFilter)}</strong>
            {!dateLoading && ` — ${dateAppointments.length} found`}. Clear the date to see everyone again.
            <button type="button" className="completed-today-link" onClick={() => setDateFilter('')}>
              Clear
            </button>
          </p>
        ) : (
          <p className="patient-records-date-note">
            <AlertIcon />
            Pick a date above to enable Print and Download PDF for that day&rsquo;s appointments.
          </p>
        )}

        {dateFilter ? (
          dateLoading ? (
            <Skeleton variant="row" count={4} />
          ) : dateError ? (
            <div className="dash-empty"><span className="dash-empty-title">{dateError}</span></div>
          ) : (
            <div className="appt-master-table">
              <DataTable columns={dateColumns} rows={dateAppointments} emptyMessage="No appointments on this date." />
            </div>
          )
        ) : listLoading ? (
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

      {/* Screen-hidden, print-only — only meaningful with a date picked, so
          the Print button above stays disabled otherwise. Same
          PrintLetterhead/PrintFooter pair Reports.jsx and this page's own
          record print use, applied here too per the approved format. */}
      {dateFilter && dateAppointments.length > 0 && (
        <div className="patient-records-print">
          <PrintLetterhead
            title="Patient Appointments Report"
            metaRows={[
              { icon: CalendarIcon, label: 'Date', value: formatDateLong(dateFilter) },
              {
                icon: ClockIcon,
                label: 'Generated',
                value: new Date().toLocaleString('en-US', {
                  month: 'long', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
                }),
              },
              { icon: UsersIcon, label: 'Total Patients', value: String(dateAppointments.length) },
            ]}
          />
          <table className="patient-records-print-table">
            <thead>
              <tr>
                <th>Patient</th>
                <th>Patient No.</th>
                <th>Time</th>
                <th>Service</th>
                <th>Dentist</th>
              </tr>
            </thead>
            <tbody>
              {dateAppointments.map((row) => (
                <tr key={row.id}>
                  <td>{`${row.patient?.first_name || ''} ${row.patient?.last_name || ''}`.trim()}</td>
                  <td>{row.patient?.patient_number}</td>
                  <td>{formatTime12h(row.appointment_time)}</td>
                  <td>{row.service?.name}</td>
                  <td>{row.dentist?.name || 'Unassigned'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <PrintFooter />
        </div>
      )}
    </div>
  );
}

export default PatientRecords;
