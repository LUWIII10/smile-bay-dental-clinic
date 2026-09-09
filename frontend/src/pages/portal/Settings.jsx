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
} from '../../api/clinicSettings';
import DataTable from './components/DataTable';
import Skeleton from './components/Skeleton';
import StatusBadge from './components/StatusBadge';
import Modal from './components/Modal';
import { showSuccessToast, showErrorToast } from '../../utils/toast';
import './dashboards.css';
import './Appointments.css';
import './Settings.css';

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const SERVICE_CATEGORIES = ['General Dentistry', 'Cosmetic Dentistry', 'Orthodontics', 'Specialist Services'];
const EMPTY_SERVICE_FORM = { name: '', category: SERVICE_CATEGORIES[0], duration_minutes: 30, description: '' };

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
  const [hmoForm, setHmoForm] = useState({ name: '' });
  const [savingHmoProvider, setSavingHmoProvider] = useState(false);
  const [hmoError, setHmoError] = useState('');

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
    setHmoForm({ name: '' });
    setHmoError('');
    setHmoModalOpen(true);
  };

  const openEditHmoProvider = (provider) => {
    setEditingHmoProvider(provider);
    setHmoForm({ name: provider.name });
    setHmoError('');
    setHmoModalOpen(true);
  };

  const submitHmoProvider = async () => {
    setSavingHmoProvider(true);
    setHmoError('');
    try {
      const payload = { name: hmoForm.name.trim() };
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
    try {
      await toggleHmoProviderActive(provider.id);
      load();
      showSuccessToast('HMO provider updated.');
    } catch (err) {
      showErrorToast(err.response?.data?.message || 'Could not update this HMO provider.');
    }
  };

  const serviceColumns = [
    { key: 'name', label: 'Service', minWidth: '30%', render: (row) => row.name },
    { key: 'category', label: 'Category', minWidth: '20%', render: (row) => row.category || '—' },
    { key: 'duration', label: 'Duration', minWidth: '14%', render: (row) => `${row.duration_minutes} min` },
    {
      key: 'status',
      label: 'Status',
      minWidth: '14%',
      align: 'center',
      render: (row) => <StatusBadge status={row.is_active ? 'Active' : 'Inactive'} tone={row.is_active ? 'green' : 'gray'} />,
    },
    {
      key: 'actions',
      label: '',
      minWidth: '22%',
      align: 'right',
      render: (row) => (
        <div className="row-actions">
          <button type="button" className="dash-btn dash-btn--outline row-btn" onClick={() => openEditService(row)}>Edit</button>
          <button type="button" className="dash-btn dash-btn--outline row-btn" onClick={() => handleToggleActive(row)}>
            {row.is_active ? 'Deactivate' : 'Activate'}
          </button>
        </div>
      ),
    },
  ];

  const hmoProviderColumns = [
    { key: 'name', label: 'HMO Provider', minWidth: '50%', render: (row) => row.name },
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
          <button type="button" className="dash-btn dash-btn--outline row-btn" onClick={() => handleToggleHmoProviderActive(row)}>
            {row.is_active ? 'Deactivate' : 'Activate'}
          </button>
        </div>
      ),
    },
  ];

  if (loading) {
    return (
      <div>
        <div className="section-card-header appt-page-header">
          <h1 className="appt-page-title">Settings</h1>
        </div>
        <Skeleton variant="block" height="300px" />
      </div>
    );
  }

  if (loadError) {
    return (
      <div>
        <div className="section-card-header appt-page-header">
          <h1 className="appt-page-title">Settings</h1>
        </div>
        <div className="dash-empty"><span className="dash-empty-title">{loadError}</span></div>
      </div>
    );
  }

  return (
    <div>
      <div className="section-card-header appt-page-header">
        <div>
          <h1 className="appt-page-title">Settings</h1>
          <p className="appt-page-subtitle">Clinic profile, operating hours, the service catalog, and HMO providers.</p>
        </div>
      </div>

      <form onSubmit={saveInfo}>
        <div className="section-card">
          <div className="section-card-header">
            <h3 className="section-card-title">Clinic Information</h3>
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
            <h3 className="section-card-title">Operating Hours</h3>
          </div>
          {scheduleMessage.text && (
            <div className={`profile-alert profile-alert--${scheduleMessage.type}`}>{scheduleMessage.text}</div>
          )}
          <div className="schedule-list">
            {days.map((day, i) => (
              <div key={day.day_of_week} className="schedule-row">
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
            ))}
          </div>
          <div className="profile-save-row">
            <button type="submit" className="dash-btn" disabled={savingSchedule}>{savingSchedule ? 'Saving…' : 'Save Hours'}</button>
          </div>
        </div>
      </form>

      <div className="section-card">
        <div className="section-card-header">
          <h3 className="section-card-title">Services</h3>
          <button type="button" className="dash-btn dash-btn--outline" onClick={openAddService}>+ Add Service</button>
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

        <div className="modal-actions">
          <button type="button" className="dash-btn dash-btn--outline" onClick={() => setServiceModalOpen(false)}>Cancel</button>
          <button type="button" className="dash-btn" disabled={savingService || !serviceForm.name.trim()} onClick={submitService}>
            {savingService ? 'Saving…' : editingService ? 'Save Changes' : 'Add Service'}
          </button>
        </div>
      </Modal>

      <div className="section-card">
        <div className="section-card-header">
          <h3 className="section-card-title">HMO Providers</h3>
          <button type="button" className="dash-btn dash-btn--outline" onClick={openAddHmoProvider}>+ Add HMO Provider</button>
        </div>
        <p className="appt-page-subtitle" style={{ marginBottom: 16 }}>
          Only active providers appear in the patient registration form's HMO dropdown.
        </p>
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
          onChange={(e) => setHmoForm({ name: e.target.value })}
          placeholder="e.g. Maxicare"
        />

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
