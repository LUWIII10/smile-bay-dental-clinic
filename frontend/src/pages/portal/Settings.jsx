import { useCallback, useEffect, useState } from 'react';
import {
  getClinicSettings,
  updateClinicInfo,
  updateSchedule,
  createService,
  updateService,
  toggleServiceActive,
  createHmoProvider,
  updateHmoProvider,
  toggleHmoProviderActive,
  getClosureDaySummary,
  addClinicClosure,
  getClosureConflicts,
  deleteClinicClosure,
} from '../../api/clinicSettings';
import { rescheduleAppointmentAsStaff } from '../../api/appointments';
import DataTable from './components/DataTable';
import Skeleton from './components/Skeleton';
import StatusBadge from './components/StatusBadge';
import Modal from './components/Modal';
import PageHeader from './components/PageHeader';
import RescheduleModal from './components/RescheduleModal';
import { SettingsIcon, BuildingIcon, ClockIcon, ToothIcon, ShieldIcon, CalendarXIcon, TrashIcon } from './icons';
import { showSuccessToast, showErrorToast, confirmAction } from '../../utils/toast';
import { resolvePhotoUrl } from './avatarUtils';
import { formatDateLong, formatTime12h } from './dateTimeUtils';
import './dashboards.css';
import './Appointments.css';
import './Settings.css';

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const SERVICE_CATEGORIES = ['General Dentistry', 'Cosmetic Dentistry', 'Orthodontics', 'Specialist Services'];
const EMPTY_SERVICE_FORM = { name: '', category: SERVICE_CATEGORIES[0], duration_minutes: 30, description: '', is_patient_bookable: true, is_pediatric: false };
const MONTH_LABELS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const WEEKDAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function thisMonthKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

// Mirrors MyAvailability.jsx's own nextDayOffForDayOfWeek() — soonest
// upcoming closure that falls on this weekday, plus how many total, or null.
// clinic_closures is already filtered to today-and-later by the backend
// (ClinicClosureService::upcoming()).
function nextClosureForDayOfWeek(dayOfWeek, closures) {
  const matches = closures
    .filter((c) => new Date(`${c.date}T00:00:00`).getDay() === dayOfWeek)
    .sort((a, b) => a.date.localeCompare(b.date));

  return matches.length > 0 ? { date: matches[0].date, count: matches.length } : null;
}

// The "Add Closure Date" modal's own calendar — deliberately a separate,
// simpler component from AvailableSlotPicker (used by the reschedule flow
// below): there's no single dentist/service here, so it colors by whether
// a date already has appointments, not by slot capacity.
function ClosureDatePicker({ value, onChange, month, onMonthChange, daySummary }) {
  const [year, m] = month.split('-').map(Number);
  const daysInMonth = new Date(year, m, 0).getDate();
  const leadingBlanks = new Date(year, m - 1, 1).getDay();
  const today = todayKey();
  const isCurrentMonth = month === thisMonthKey();

  const cells = [];
  for (let i = 0; i < leadingBlanks; i += 1) cells.push(null);
  for (let day = 1; day <= daysInMonth; day += 1) cells.push(day);

  const goPrev = () => {
    const prev = m === 1 ? `${year - 1}-12` : `${year}-${String(m - 1).padStart(2, '0')}`;
    onMonthChange(prev);
  };
  const goNext = () => {
    const next = m === 12 ? `${year + 1}-01` : `${year}-${String(m + 1).padStart(2, '0')}`;
    onMonthChange(next);
  };

  return (
    <div className="closure-picker-pane">
      <div className="closure-cal-nav-row">
        <button type="button" className="calendar-nav-btn" disabled={isCurrentMonth} onClick={goPrev} aria-label="Previous month">
          &#8249;
        </button>
        <span className="calendar-month-label">{MONTH_LABELS[m - 1]} {year}</span>
        <button type="button" className="calendar-nav-btn" onClick={goNext} aria-label="Next month">
          &#8250;
        </button>
      </div>

      <div className="calendar-grid">
        {WEEKDAY_LABELS.map((wd, i) => (
          // eslint-disable-next-line react/no-array-index-key
          <span key={i} className="calendar-weekday">{wd}</span>
        ))}
        {cells.map((day, i) => {
          if (!day) return <span key={`blank-${i}`} className="calendar-cell calendar-cell--blank" />; // eslint-disable-line react/no-array-index-key

          const key = `${year}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
          const isPast = key < today;
          const info = daySummary[key];
          const closed = info?.closed || false;
          const count = info?.appointment_count || 0;
          const isSelected = key === value;

          let statusClass = 'calendar-cell--none';
          let tip = 'No appointments';
          if (isPast) {
            statusClass = 'calendar-cell--unavailable';
            tip = null;
          } else if (closed) {
            statusClass = 'calendar-cell--day-closed';
            tip = 'Already closed';
          } else if (count > 0) {
            statusClass = 'calendar-cell--busy';
            tip = `${count} appointment${count === 1 ? '' : 's'} booked`;
          }

          return (
            <button
              key={key}
              type="button"
              className={`calendar-cell ${statusClass}${isSelected ? ' calendar-cell--selected' : ''}`}
              disabled={isPast || closed}
              onClick={() => onChange(key)}
            >
              {day}
              {tip && <span className="calendar-cell-tip">{tip}</span>}
            </button>
          );
        })}
      </div>

      <div className="calendar-legend">
        <span className="calendar-legend-item calendar-legend-item--none">No appointments</span>
        <span className="calendar-legend-item calendar-legend-item--busy">Has appointments</span>
        <span className="calendar-legend-item calendar-legend-item--day-closed">Already closed</span>
      </div>
    </div>
  );
}

// Same .toggle-switch markup/CSS as MyAvailability.jsx's own ToggleSwitch —
// no shared component exists yet for it, so this is a second small copy
// rather than reaching across pages for one pill switch.
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
// Existing StatusBadge tones only (portalTokens.css) — no new colors, just
// spreading the 4 categories across the palette so the column reads at a
// glance instead of as a wall of identical plain text.
const CATEGORY_TONE = {
  'General Dentistry': 'blue',
  'Cosmetic Dentistry': 'indigo',
  'Orthodontics': 'green',
  'Specialist Services': 'amber',
};
function getInitials(name) {
  const parts = String(name || '').trim().split(/\s+/);
  const first = parts[0]?.[0] || '';
  const last = parts.length > 1 ? parts[parts.length - 1][0] : '';
  return (first + last).toUpperCase() || '?';
}

function Field({ label, children, full }) {
  return (
    <div className={`profile-field${full ? ' profile-field-full' : ''}`}>
      <label className="profile-field-label">{label}</label>
      {children}
    </div>
  );
}

function Settings() {
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const [infoForm, setInfoForm] = useState(null);
  const [savingInfo, setSavingInfo] = useState(false);
  const [infoMessage, setInfoMessage] = useState({ type: '', text: '' });

  const [days, setDays] = useState(null);
  const [savingSchedule, setSavingSchedule] = useState(false);
  const [scheduleMessage, setScheduleMessage] = useState({ type: '', text: '' });

  const [serviceModalOpen, setServiceModalOpen] = useState(false);
  const [editingService, setEditingService] = useState(null);
  const [serviceForm, setServiceForm] = useState(EMPTY_SERVICE_FORM);
  const [savingService, setSavingService] = useState(false);
  const [serviceError, setServiceError] = useState('');

  const [hmoModalOpen, setHmoModalOpen] = useState(false);
  const [editingHmoProvider, setEditingHmoProvider] = useState(null);
  // logo: the File the admin just picked (null = keep whatever's already
  // saved, on an edit). logoPreview: what the modal actually shows — the
  // provider's existing logo_path when editing, replaced by a local
  // object URL the moment a new file is chosen; revoked on cleanup below
  // so choosing several files in a row doesn't leak blob URLs.
  const [hmoForm, setHmoForm] = useState({ name: '', logo: null, logoPreview: '' });
  const [savingHmoProvider, setSavingHmoProvider] = useState(false);
  const [hmoError, setHmoError] = useState('');

  const [closureModalOpen, setClosureModalOpen] = useState(false);
  const [closureDate, setClosureDate] = useState('');
  const [closureReason, setClosureReason] = useState('');
  const [closureMonth, setClosureMonth] = useState(thisMonthKey());
  const [closureDaySummary, setClosureDaySummary] = useState({});
  const [savingClosure, setSavingClosure] = useState(false);
  const [closureError, setClosureError] = useState('');
  const [deletingClosureId, setDeletingClosureId] = useState(null);

  // Set once a closure attempt comes back with conflicts — { date, reason }
  // resubmitted as-is (store endpoint re-checks fresh every time) once every
  // conflict below has been individually rescheduled away.
  const [pendingClosure, setPendingClosure] = useState(null);
  const [conflictAppointments, setConflictAppointments] = useState([]);
  const [originalConflictCount, setOriginalConflictCount] = useState(0);
  const [closingClinic, setClosingClinic] = useState(false);
  const [reschedTarget, setReschedTarget] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const data = await getClinicSettings();
      setSettings(data);
      setInfoForm({
        clinic_name: data.clinic_info.clinic_name || '',
        tagline: data.clinic_info.tagline || '',
        address: data.clinic_info.address || '',
        contact_number: data.clinic_info.contact_number || '',
        contact_email: data.clinic_info.contact_email || '',
      });
      setDays(
        data.schedules.map((s) => ({
          day_of_week: s.day_of_week,
          is_open: s.is_open,
          open_time: s.open_time ? s.open_time.slice(0, 5) : '09:00',
          close_time: s.close_time ? s.close_time.slice(0, 5) : '18:00',
        }))
      );
    } catch {
      setLoadError('Could not load clinic settings. Please refresh the page.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const saveInfo = async (e) => {
    e.preventDefault();
    setSavingInfo(true);
    setInfoMessage({ type: '', text: '' });
    try {
      const updated = await updateClinicInfo(infoForm);
      setSettings((prev) => ({ ...prev, clinic_info: updated }));
      setInfoMessage({ type: 'success', text: 'Clinic information saved.' });
    } catch (err) {
      setInfoMessage({ type: 'error', text: err.response?.data?.message || 'Could not save clinic information.' });
    } finally {
      setSavingInfo(false);
    }
  };

  const updateDay = (index, field, value) => {
    setDays((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  };

  const saveSchedule = async (e) => {
    e.preventDefault();
    setSavingSchedule(true);
    setScheduleMessage({ type: '', text: '' });
    try {
      const updated = await updateSchedule(days);
      setSettings((prev) => ({ ...prev, schedules: updated }));
      setScheduleMessage({ type: 'success', text: 'Operating hours saved.' });
    } catch (err) {
      setScheduleMessage({ type: 'error', text: err.response?.data?.message || 'Could not save operating hours.' });
    } finally {
      setSavingSchedule(false);
    }
  };

  useEffect(() => {
    if (!closureModalOpen) return;
    getClosureDaySummary(closureMonth).then(setClosureDaySummary).catch(() => setClosureDaySummary({}));
  }, [closureModalOpen, closureMonth]);

  const openClosureModal = () => {
    setClosureDate('');
    setClosureReason('');
    setClosureError('');
    setClosureMonth(thisMonthKey());
    setClosureModalOpen(true);
  };

  const submitClosure = async () => {
    if (!closureDate) return;
    setSavingClosure(true);
    setClosureError('');
    try {
      const result = await addClinicClosure({ date: closureDate, reason: closureReason.trim() || null });
      if (result.conflicts) {
        setPendingClosure({ date: closureDate, reason: closureReason.trim() || null });
        setConflictAppointments(result.conflicting_appointments);
        setOriginalConflictCount(result.conflicting_appointments.length);
        setClosureModalOpen(false);
      } else {
        setClosureModalOpen(false);
        setSettings((prev) => ({ ...prev, clinic_closures: result.closures }));
        showSuccessToast(`${formatDateLong(closureDate)} marked as closed.`);
      }
    } catch (err) {
      setClosureError(err.response?.data?.message || 'Could not save this closure.');
    } finally {
      setSavingClosure(false);
    }
  };

  const refreshConflicts = async () => {
    if (!pendingClosure) return;
    try {
      const list = await getClosureConflicts(pendingClosure.date);
      setConflictAppointments(list);
    } catch {
      // Non-fatal — the list just stays as it was; "Close Clinic" re-checks
      // fresh from the server regardless.
    }
  };

  const handleConflictRescheduled = () => {
    setReschedTarget(null);
    refreshConflicts();
    showSuccessToast('Appointment moved — the patient has been notified.');
  };

  const confirmCloseClinic = async () => {
    if (!pendingClosure) return;
    setClosingClinic(true);
    try {
      const result = await addClinicClosure(pendingClosure);
      if (result.conflicts) {
        setConflictAppointments(result.conflicting_appointments);
        showErrorToast('Some appointments still need to be rescheduled first.');
      } else {
        const closedDate = pendingClosure.date;
        setPendingClosure(null);
        setConflictAppointments([]);
        setSettings((prev) => ({ ...prev, clinic_closures: result.closures }));
        showSuccessToast(`${formatDateLong(closedDate)} marked as closed.`);
      }
    } catch (err) {
      showErrorToast(err.response?.data?.message || 'Could not close the clinic for this date.');
    } finally {
      setClosingClinic(false);
    }
  };

  const cancelPendingClosure = () => {
    setPendingClosure(null);
    setConflictAppointments([]);
  };

  const handleDeleteClosure = async (closure) => {
    const confirmed = await confirmAction({
      title: 'Remove this closure?',
      text: `${formatDateLong(closure.date)} will be bookable again.`,
      confirmButtonText: 'Remove',
      confirmButtonColor: '#b42318',
    });
    if (!confirmed) return;

    setDeletingClosureId(closure.id);
    try {
      const updated = await deleteClinicClosure(closure.id);
      setSettings((prev) => ({ ...prev, clinic_closures: updated }));
      showSuccessToast('Closure removed.');
    } catch (err) {
      showErrorToast(err.response?.data?.message || 'Could not remove this closure.');
    } finally {
      setDeletingClosureId(null);
    }
  };

  const openAddService = () => {
    setEditingService(null);
    setServiceForm(EMPTY_SERVICE_FORM);
    setServiceError('');
    setServiceModalOpen(true);
  };

  const openEditService = (service) => {
    setEditingService(service);
    setServiceForm({
      name: service.name,
      category: service.category || SERVICE_CATEGORIES[0],
      duration_minutes: service.duration_minutes,
      description: service.description || '',
      is_patient_bookable: service.is_patient_bookable ?? true,
      is_pediatric: service.is_pediatric ?? false,
    });
    setServiceError('');
    setServiceModalOpen(true);
  };

  const submitService = async () => {
    setSavingService(true);
    setServiceError('');
    try {
      const payload = {
        name: serviceForm.name.trim(),
        category: serviceForm.category,
        duration_minutes: Number(serviceForm.duration_minutes),
        description: serviceForm.description.trim() || null,
        is_patient_bookable: serviceForm.is_patient_bookable,
        is_pediatric: serviceForm.is_pediatric,
      };
      if (editingService) {
        await updateService(editingService.id, payload);
      } else {
        await createService(payload);
      }
      setServiceModalOpen(false);
      load();
    } catch (err) {
      setServiceError(err.response?.data?.message || 'Could not save this service.');
    } finally {
      setSavingService(false);
    }
  };

  const handleToggleActive = async (service) => {
    const isDeactivating = service.is_active;
    // Same confirm-before-toggle pattern as User Management's own
    // Deactivate/Reactivate button (UserManagement.jsx) — an inactive
    // service drops out of every patient-facing and staff booking list
    // (ServiceController::index() only ever returns is_active rows), so
    // this is a real, system-wide effect worth a confirmation, not a
    // reversible-in-place edit like the fields above it.
    const confirmed = await confirmAction({
      title: isDeactivating ? 'Deactivate this service?' : 'Reactivate this service?',
      text: isDeactivating
        ? `"${service.name}" will disappear from the booking wizard and walk-in booking until it's reactivated.`
        : `"${service.name}" will become bookable again across the system.`,
      confirmButtonText: isDeactivating ? 'Deactivate' : 'Reactivate',
      confirmButtonColor: isDeactivating ? '#b42318' : '#2952e3',
    });
    if (!confirmed) return;

    try {
      await toggleServiceActive(service.id);
      load();
      showSuccessToast('Service updated.');
    } catch (err) {
      showErrorToast(err.response?.data?.message || 'Could not update this service.');
    }
  };

  const openAddHmoProvider = () => {
    setEditingHmoProvider(null);
    setHmoForm({ name: '', logo: null, logoPreview: '', removeLogo: false });
    setHmoError('');
    setHmoModalOpen(true);
  };

  const openEditHmoProvider = (provider) => {
    setEditingHmoProvider(provider);
    setHmoForm({ name: provider.name, logo: null, logoPreview: resolvePhotoUrl(provider.logo_path) || '', removeLogo: false });
    setHmoError('');
    setHmoModalOpen(true);
  };

  const pickHmoLogo = (file) => {
    if (!file) return;
    setHmoForm((p) => {
      if (p.logoPreview?.startsWith('blob:')) URL.revokeObjectURL(p.logoPreview);
      // A freshly-picked file supersedes any pending removal from this same
      // modal session.
      return { ...p, logo: file, logoPreview: URL.createObjectURL(file), removeLogo: false };
    });
  };

  // Only reachable when the provider has a real stored logo_path (gated in
  // the JSX below).
  const removeHmoLogo = () => {
    setHmoForm((p) => {
      if (p.logoPreview?.startsWith('blob:')) URL.revokeObjectURL(p.logoPreview);
      return { ...p, logo: null, logoPreview: '', removeLogo: true };
    });
  };

  const submitHmoProvider = async () => {
    setSavingHmoProvider(true);
    setHmoError('');
    try {
      const payload = { name: hmoForm.name.trim(), logo: hmoForm.logo, removeLogo: hmoForm.removeLogo };
      if (editingHmoProvider) {
        await updateHmoProvider(editingHmoProvider.id, payload);
      } else {
        await createHmoProvider(payload);
      }
      setHmoModalOpen(false);
      load();
      showSuccessToast(editingHmoProvider ? 'HMO provider updated.' : 'HMO provider added.');
    } catch (err) {
      setHmoError(err.response?.data?.message || 'Could not save this HMO provider.');
    } finally {
      setSavingHmoProvider(false);
    }
  };

  const handleToggleHmoProviderActive = async (provider) => {
    const isDeactivating = provider.is_active;
    // Same reasoning as handleToggleActive above — HmoProviderController::
    // index() (the registration wizard, My Profile, and the walk-in
    // booking modal all call it) only ever returns is_active rows, so
    // deactivating one really does remove it everywhere at once.
    const confirmed = await confirmAction({
      title: isDeactivating ? 'Deactivate this HMO provider?' : 'Reactivate this HMO provider?',
      text: isDeactivating
        ? `"${provider.name}" will disappear from patient registration, My Profile, and walk-in booking until it's reactivated.`
        : `"${provider.name}" will become selectable again across the system.`,
      confirmButtonText: isDeactivating ? 'Deactivate' : 'Reactivate',
      confirmButtonColor: isDeactivating ? '#b42318' : '#2952e3',
    });
    if (!confirmed) return;

    try {
      await toggleHmoProviderActive(provider.id);
      load();
      showSuccessToast('HMO provider updated.');
    } catch (err) {
      showErrorToast(err.response?.data?.message || 'Could not update this HMO provider.');
    }
  };

  const serviceColumns = [
    { key: 'name', label: 'Service', minWidth: '22%', render: (row) => row.name },
    {
      key: 'category',
      label: 'Category',
      minWidth: '16%',
      render: (row) => row.category ? <StatusBadge status={row.category} tone={CATEGORY_TONE[row.category] || 'gray'} /> : '—',
    },
    { key: 'duration', label: 'Duration', minWidth: '12%', render: (row) => `${row.duration_minutes} min` },
    {
      key: 'type',
      label: 'Type',
      minWidth: '12%',
      align: 'center',
      // Same 👶 convention already used for pediatric indicators elsewhere
      // (StatusBadge's pediatric_review_required/pediatric_confirmed_
      // pending_hmo labels) — this is the one place an admin can actually
      // see which services carry the real booking-rule consequences
      // (HMO block, same-day block, pediatric review queue) the toggle
      // above sets.
      render: (row) => (row.is_pediatric ? <StatusBadge status="👶 Pediatric" tone="amber" /> : <span style={{ color: 'var(--portal-muted)' }}>—</span>),
    },
    {
      key: 'bookable',
      label: 'Bookable Online',
      minWidth: '14%',
      align: 'center',
      render: (row) => <StatusBadge status={row.is_patient_bookable ? 'Yes' : 'No'} tone={row.is_patient_bookable ? 'blue' : 'gray'} />,
    },
    {
      key: 'status',
      label: 'Status',
      minWidth: '12%',
      align: 'center',
      render: (row) => <StatusBadge status={row.is_active ? 'Active' : 'Inactive'} tone={row.is_active ? 'green' : 'gray'} />,
    },
    {
      key: 'actions',
      label: '',
      minWidth: '24%',
      align: 'right',
      render: (row) => (
        <div className="row-actions">
          <button type="button" className="dash-btn dash-btn--outline row-btn" onClick={() => openEditService(row)}>Edit</button>
          {/* Same color convention as User Management's own Deactivate/
              Activate button (UserManagement.jsx) — danger-red to
              deactivate, solid blue to reactivate — reused here rather
              than inventing a third color pairing. */}
          <button
            type="button"
            className={`dash-btn row-btn${row.is_active ? ' dash-btn--danger' : ''}`}
            onClick={() => handleToggleActive(row)}
          >
            {row.is_active ? 'Deactivate' : 'Activate'}
          </button>
        </div>
      ),
    },
  ];

  const hmoProviderColumns = [
    {
      key: 'name',
      label: 'HMO Provider',
      minWidth: '46%',
      render: (row) => {
        const logo = resolvePhotoUrl(row.logo_path);
        return (
          <span className="cell-person">
            {logo ? (
              <span className="hmo-provider-logo"><img src={logo} alt={`${row.name} logo`} /></span>
            ) : (
              <span className="cell-avatar">{getInitials(row.name)}</span>
            )}
            <span className="cell-person-name">{row.name}</span>
          </span>
        );
      },
    },
    {
      key: 'status',
      label: 'Status',
      minWidth: '20%',
      align: 'center',
      render: (row) => <StatusBadge status={row.is_active ? 'Active' : 'Inactive'} tone={row.is_active ? 'green' : 'gray'} />,
    },
    {
      key: 'actions',
      label: '',
      minWidth: '30%',
      align: 'right',
      render: (row) => (
        <div className="row-actions">
          <button type="button" className="dash-btn dash-btn--outline row-btn" onClick={() => openEditHmoProvider(row)}>Edit</button>
          <button
            type="button"
            className={`dash-btn row-btn${row.is_active ? ' dash-btn--danger' : ''}`}
            onClick={() => handleToggleHmoProviderActive(row)}
          >
            {row.is_active ? 'Deactivate' : 'Activate'}
          </button>
        </div>
      ),
    },
  ];

  if (loading) {
    return (
      <div>
        <PageHeader icon={SettingsIcon} title="Settings" />
        <Skeleton variant="block" height="300px" />
      </div>
    );
  }

  if (loadError) {
    return (
      <div>
        <PageHeader icon={SettingsIcon} title="Settings" />
        <div className="dash-empty"><span className="dash-empty-title">{loadError}</span></div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        icon={SettingsIcon}
        title="Settings"
        subtitle="Clinic profile, operating hours, the service catalog, and HMO providers."
      />

      <form onSubmit={saveInfo}>
        <div className="section-card">
          <div className="section-card-header">
            <div className="section-card-heading">
              <span className="section-card-icon"><BuildingIcon /></span>
              <div>
                <h3 className="section-card-title">Clinic Information</h3>
                <p className="section-card-subtitle">Shown on the public site, emails, and printed reports</p>
              </div>
            </div>
          </div>
          {infoMessage.text && (
            <div className={`profile-alert profile-alert--${infoMessage.type}`}>{infoMessage.text}</div>
          )}
          <div className="profile-grid">
            <Field label="Clinic Name">
              <input className="form-input" value={infoForm.clinic_name} onChange={(e) => setInfoForm((p) => ({ ...p, clinic_name: e.target.value }))} />
            </Field>
            <Field label="Tagline">
              <input className="form-input" value={infoForm.tagline} onChange={(e) => setInfoForm((p) => ({ ...p, tagline: e.target.value }))} />
            </Field>
            <Field label="Address" full>
              <input className="form-input" value={infoForm.address} onChange={(e) => setInfoForm((p) => ({ ...p, address: e.target.value }))} />
            </Field>
            <Field label="Contact Number">
              <input className="form-input" value={infoForm.contact_number} onChange={(e) => setInfoForm((p) => ({ ...p, contact_number: e.target.value }))} />
            </Field>
            <Field label="Contact Email">
              <input className="form-input" type="email" value={infoForm.contact_email} onChange={(e) => setInfoForm((p) => ({ ...p, contact_email: e.target.value }))} />
            </Field>
          </div>
          <div className="profile-save-row">
            <button type="submit" className="dash-btn" disabled={savingInfo}>{savingInfo ? 'Saving…' : 'Save Clinic Info'}</button>
          </div>
        </div>
      </form>

      <form onSubmit={saveSchedule}>
        <div className="section-card">
          <div className="section-card-header">
            <div className="section-card-heading">
              <span className="section-card-icon"><ClockIcon /></span>
              <div>
                <h3 className="section-card-title">Operating Hours</h3>
                <p className="section-card-subtitle">Controls which time slots patients can book</p>
              </div>
            </div>
          </div>
          {scheduleMessage.text && (
            <div className={`profile-alert profile-alert--${scheduleMessage.type}`}>{scheduleMessage.text}</div>
          )}
          <div className="schedule-list">
            {days.map((day, i) => {
              const closureNote = nextClosureForDayOfWeek(day.day_of_week, settings.clinic_closures || []);
              return (
                <div key={day.day_of_week} className="hours-row-group">
                  <div className={`hours-row${day.is_open ? '' : ' hours-row--closed'}`}>
                    <label className="schedule-day-toggle">
                      <input type="checkbox" checked={day.is_open} onChange={(e) => updateDay(i, 'is_open', e.target.checked)} />
                      {DAY_NAMES[day.day_of_week]}
                    </label>
                    {day.is_open ? (
                      <div className="schedule-time-inputs">
                        <input type="time" className="form-input" value={day.open_time} onChange={(e) => updateDay(i, 'open_time', e.target.value)} />
                        <span>to</span>
                        <input type="time" className="form-input" value={day.close_time} onChange={(e) => updateDay(i, 'close_time', e.target.value)} />
                      </div>
                    ) : (
                      <span className="schedule-closed-label">Closed</span>
                    )}
                  </div>
                  {closureNote && (
                    <p className="hours-exception-note">
                      📅 Regular schedule — but closed on {formatDateLong(closureNote.date)}
                      {closureNote.count > 1 ? ` (+${closureNote.count - 1} more upcoming)` : ''}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
          <div className="profile-save-row">
            <button type="submit" className="dash-btn" disabled={savingSchedule}>{savingSchedule ? 'Saving…' : 'Save Hours'}</button>
          </div>
        </div>
      </form>

      <div className="section-card">
        <div className="section-card-header">
          <div className="section-card-heading">
            <span className="section-card-icon"><CalendarXIcon /></span>
            <div>
              <h3 className="section-card-title">Clinic Closures</h3>
              <p className="section-card-subtitle">One-off dates the clinic is closed — holidays, staff events — without changing the weekly schedule above</p>
            </div>
          </div>
          <button type="button" className="dash-btn dash-btn--outline" onClick={openClosureModal}>+ Add Closure Date</button>
        </div>
        {(settings.clinic_closures || []).length === 0 ? (
          <p className="booking-empty-note">No upcoming closures.</p>
        ) : (
          (settings.clinic_closures || []).map((closure) => (
            <div key={closure.id} className="dayoff-row">
              <span className="dayoff-icon"><CalendarXIcon /></span>
              <div className="dayoff-info">
                <span className="dayoff-date">{formatDateLong(closure.date)}</span>
                {closure.reason && <span className="dayoff-reason">{closure.reason}</span>}
              </div>
              <button
                type="button"
                className="dayoff-delete"
                disabled={deletingClosureId === closure.id}
                onClick={() => handleDeleteClosure(closure)}
                aria-label="Remove closure"
              >
                <TrashIcon />
              </button>
            </div>
          ))
        )}
      </div>

      <Modal open={closureModalOpen} onClose={() => setClosureModalOpen(false)} title="Add Closure Date">
        {closureError && <div className="profile-alert profile-alert--error">{closureError}</div>}

        <label className="modal-field-label">Date</label>
        <ClosureDatePicker
          value={closureDate}
          onChange={setClosureDate}
          month={closureMonth}
          onMonthChange={setClosureMonth}
          daySummary={closureDaySummary}
        />

        <label className="modal-field-label" style={{ marginTop: 14, display: 'block' }}>
          Reason <span style={{ fontWeight: 400, color: 'var(--portal-muted)' }}>(optional)</span>
        </label>
        <input
          className="form-input"
          value={closureReason}
          onChange={(e) => setClosureReason(e.target.value)}
          placeholder="e.g. Staff training, holiday"
        />

        <div className="modal-actions">
          <button type="button" className="dash-btn dash-btn--outline" onClick={() => setClosureModalOpen(false)}>Cancel</button>
          <button type="button" className="dash-btn" disabled={!closureDate || savingClosure} onClick={submitClosure}>
            {savingClosure ? 'Checking…' : 'Add Closure'}
          </button>
        </div>
      </Modal>

      <Modal open={!!pendingClosure} onClose={cancelPendingClosure} title="Reschedule affected patients first">
        {pendingClosure && (
          <>
            <p style={{ margin: '0 0 12px', fontSize: '0.85rem', color: 'var(--portal-muted)' }}>
              {formatDateLong(pendingClosure.date)} has {originalConflictCount} appointment{originalConflictCount === 1 ? '' : 's'} booked.
              Move each one to a new date before the clinic can be closed — the patient is emailed and notified automatically.
            </p>
            <span className={`progress-pill${conflictAppointments.length === 0 ? ' progress-pill--done' : ''}`}>
              {conflictAppointments.length === 0 ? '✓' : '⏳'} {originalConflictCount - conflictAppointments.length} of {originalConflictCount} rescheduled
            </span>
            <ul className="conflict-list" style={{ marginTop: 12 }}>
              {conflictAppointments.map((c) => (
                <li key={c.id} className="conflict-list-item">
                  <div className="conflict-list-text">
                    <span className="conflict-list-date">{c.patient_name} — {c.service_name}, {c.dentist_name}</span>
                    <span className="conflict-list-meta">{formatDateLong(c.appointment_date)} · {formatTime12h(c.appointment_time)}</span>
                  </div>
                  <button type="button" className="dash-btn dash-btn--outline row-btn" onClick={() => setReschedTarget(c)}>
                    Reschedule
                  </button>
                </li>
              ))}
            </ul>
            <div className="modal-actions">
              <button type="button" className="dash-btn dash-btn--outline" onClick={cancelPendingClosure}>Cancel</button>
              <button
                type="button"
                className="dash-btn dash-btn--danger"
                disabled={conflictAppointments.length > 0 || closingClinic}
                onClick={confirmCloseClinic}
              >
                {closingClinic ? 'Closing…' : conflictAppointments.length > 0 ? `Close Clinic (${conflictAppointments.length} left)` : 'Close Clinic'}
              </button>
            </div>
          </>
        )}
      </Modal>

      <RescheduleModal
        open={!!reschedTarget}
        onClose={() => setReschedTarget(null)}
        appointment={reschedTarget}
        rescheduleFn={rescheduleAppointmentAsStaff}
        needsConfirmation={false}
        onSuccess={handleConflictRescheduled}
      />

      <div className="section-card">
        <div className="section-card-header">
          <div className="section-card-heading">
            <span className="section-card-icon"><ToothIcon /></span>
            <div>
              <h3 className="section-card-title">Services</h3>
              <p className="section-card-subtitle">The catalog patients pick from when booking</p>
            </div>
          </div>
          <button type="button" className="dash-btn" onClick={openAddService}>+ Add Service</button>
        </div>
        <DataTable columns={serviceColumns} rows={settings.services} emptyMessage="No services yet." />
      </div>

      <Modal open={serviceModalOpen} onClose={() => setServiceModalOpen(false)} title={editingService ? 'Edit Service' : 'Add Service'}>
        {serviceError && <div className="profile-alert profile-alert--error">{serviceError}</div>}

        <label className="modal-field-label">Service Name</label>
        <input className="form-input" value={serviceForm.name} onChange={(e) => setServiceForm((p) => ({ ...p, name: e.target.value }))} />

        <label className="modal-field-label">Category</label>
        <select className="form-select" value={serviceForm.category} onChange={(e) => setServiceForm((p) => ({ ...p, category: e.target.value }))}>
          {SERVICE_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>

        <label className="modal-field-label">Duration (minutes)</label>
        <input
          className="form-input"
          type="number"
          min="5"
          max="480"
          value={serviceForm.duration_minutes}
          onChange={(e) => setServiceForm((p) => ({ ...p, duration_minutes: e.target.value }))}
        />

        <label className="modal-field-label">Description</label>
        <textarea className="form-textarea" value={serviceForm.description} onChange={(e) => setServiceForm((p) => ({ ...p, description: e.target.value }))} placeholder="Optional" />

        <div className="service-bookable-field">
          <div>
            <span className="service-bookable-field-title">Available for Online Booking</span>
            <p className="service-bookable-field-desc">
              When on, patients see this in their own Book Appointment wizard. Off keeps it staff/walk-in only.
            </p>
          </div>
          <ToggleSwitch
            checked={serviceForm.is_patient_bookable}
            onChange={(v) => setServiceForm((p) => ({ ...p, is_patient_bookable: v }))}
            label="Available for online booking"
          />
        </div>

        {/* Drives real booking rules (AppointmentController::store()): blocks
            HMO for this service, blocks same-day booking, and forces every
            booking through the pediatric dentist's own review queue
            regardless of payment type. Amber-tinted, not the same plain
            canvas background as the toggle above, since this one carries
            real consequences rather than just a display preference. */}
        <div className="service-bookable-field service-bookable-field--pediatric">
          <div>
            <span className="service-bookable-field-title">Pediatric Service</span>
            <p className="service-bookable-field-desc">
              Blocks HMO booking for this service and routes every booking through the pediatric dentist's own review queue.
            </p>
          </div>
          <ToggleSwitch
            checked={serviceForm.is_pediatric}
            onChange={(v) => setServiceForm((p) => ({ ...p, is_pediatric: v }))}
            label="Pediatric service"
          />
        </div>

        <div className="modal-actions">
          <button type="button" className="dash-btn dash-btn--outline" onClick={() => setServiceModalOpen(false)}>Cancel</button>
          <button type="button" className="dash-btn" disabled={savingService || !serviceForm.name.trim()} onClick={submitService}>
            {savingService ? 'Saving…' : editingService ? 'Save Changes' : 'Add Service'}
          </button>
        </div>
      </Modal>

      <div className="section-card">
        <div className="section-card-header">
          <div className="section-card-heading">
            <span className="section-card-icon"><ShieldIcon /></span>
            <div>
              <h3 className="section-card-title">HMO Providers</h3>
              <p className="section-card-subtitle">Only active providers appear in the patient registration form&rsquo;s HMO dropdown</p>
            </div>
          </div>
          <button type="button" className="dash-btn" onClick={openAddHmoProvider}>+ Add HMO Provider</button>
        </div>
        <DataTable columns={hmoProviderColumns} rows={settings.hmo_providers} emptyMessage="No HMO providers yet." />
      </div>

      <Modal
        open={hmoModalOpen}
        onClose={() => setHmoModalOpen(false)}
        title={editingHmoProvider ? 'Edit HMO Provider' : 'Add HMO Provider'}
      >
        {hmoError && <div className="profile-alert profile-alert--error">{hmoError}</div>}

        <label className="modal-field-label">Provider Name</label>
        <input
          className="form-input"
          value={hmoForm.name}
          onChange={(e) => setHmoForm((p) => ({ ...p, name: e.target.value }))}
          placeholder="e.g. Maxicare"
        />

        <label className="modal-field-label">Logo (optional)</label>
        <div className="hmo-logo-picker">
          {hmoForm.logoPreview ? (
            <span className="hmo-logo-picker-preview"><img src={hmoForm.logoPreview} alt="Logo preview" /></span>
          ) : (
            <span className="hmo-logo-picker-preview hmo-logo-picker-preview--empty">{getInitials(hmoForm.name)}</span>
          )}
          <label className="dash-btn dash-btn--outline hmo-logo-picker-btn">
            {hmoForm.logoPreview ? 'Change Logo' : 'Upload Logo'}
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={(e) => pickHmoLogo(e.target.files?.[0])}
              hidden
            />
          </label>
          {/* Only shown once there's a real stored logo_path to clear. */}
          {editingHmoProvider?.logo_path && hmoForm.logoPreview && (
            <button type="button" className="dash-btn dash-btn--danger hmo-logo-picker-btn" onClick={removeHmoLogo}>
              Remove Logo
            </button>
          )}
        </div>
        <p className="hmo-logo-picker-hint">PNG, JPG, or WEBP — shown next to the provider&rsquo;s name wherever it appears in Settings. Leave blank to keep the initials badge.</p>

        <div className="modal-actions">
          <button type="button" className="dash-btn dash-btn--outline" onClick={() => setHmoModalOpen(false)}>Cancel</button>
          <button type="button" className="dash-btn" disabled={savingHmoProvider || !hmoForm.name.trim()} onClick={submitHmoProvider}>
            {savingHmoProvider ? 'Saving…' : editingHmoProvider ? 'Save Changes' : 'Add Provider'}
          </button>
        </div>
      </Modal>
    </div>
  );
}

export default Settings;
