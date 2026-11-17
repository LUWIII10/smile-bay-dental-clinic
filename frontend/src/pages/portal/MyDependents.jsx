import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  getDependents, createDependent, updateDependent, deleteDependent,
  uploadDependentPhoto, removeDependentPhoto,
} from '../../api/dependents';
import { getPublicHmoProviders } from '../../api/public';
import { resolvePhotoUrl } from './avatarUtils';
import PageHeader from './components/PageHeader';
import Modal from './components/Modal';
import { UsersIcon, ToothIcon, PlusIcon, EditIcon, TrashIcon, AlertIcon, ShieldIcon, CashIcon, CheckCircleIcon, CameraIcon } from './icons';
import './dashboards.css';
import './MyDependents.css';

const RELATIONSHIP_LABELS = { son: 'Son', daughter: 'Daughter', ward: 'Ward' };

// Same checklists/options as the registration wizard's own Step4MedicalInfo
// / Step5DentalHistory / StepPatientCategory (registerSteps/) — a dependent
// gets the same clinical intake a self-registering adult patient gives for
// themselves, just filled in by the parent. Kept inline here the same way
// those step files keep their own option lists locally, rather than a
// shared constants module neither side otherwise needs.
const MEDICAL_CONDITION_OPTIONS = [
  'Cardiovascular (Hypertension, Stroke)',
  'Endocrine (Diabetes, Thyroid, Kidney)',
  'Musculoskeletal (Arthritis, Osteoporosis)',
  'Respiratory (Rhinitis, Asthma, Tuberculosis)',
  'Gastrointestinal (GERD, IBS, Ulcer)',
  'Eyes (Glaucoma, Cataract, Impaired Vision)',
  'Ears (Impaired Hearing)',
  'Mental Health (Anxiety, Depression, BPD, ED)',
  'Sexual Health (HIV/AIDS Positive, STD)',
  'Blood Disorders (Anemia, Abnormal Bleeding)',
  'Cancer (History, Undergoing Treatment)',
  'Pregnant',
  'Breastfeeding',
  'Birth Control',
  'Smoking/Vape',
  'Alcohol Use',
  'Drug Use',
];
// These three only ever apply to a female patient — same rule the
// Medical Record step's own pregnancy question already follows.
const FEMALE_ONLY_CONDITIONS = ['Pregnant', 'Breastfeeding', 'Birth Control'];

const BLOOD_TYPE_OPTIONS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];

const PROCEDURE_OPTIONS = [
  'Braces',
  'Extraction/Oral Surgery',
  'Gum Treatment',
  'Denture/Fixed Bridges/Crown',
  'TMJ Therapy, Bite Adjustment, Dental Appliances',
];

const SYMPTOM_OPTIONS = [
  'Pain',
  'Swelling',
  'Bleeding Gums',
  'Loose or moving tooth',
  'Clicking/Locking of the Jaw',
  'Grinding/Clenching',
  'Difficulty in Mouth Opening',
  'Bad Breath',
];

const BRUSHING_OPTIONS = [
  { value: 'once_daily', label: 'Once a day' },
  { value: 'twice_daily', label: 'Twice a day' },
  { value: 'three_or_more', label: 'Three or more times a day' },
  { value: 'rarely', label: 'Rarely' },
];

const STEP_LABELS = ['Basic Info', 'Payment & Coverage', 'Medical Info', 'Dental History', 'Review'];

function emptyForm() {
  return {
    photo_path: null,
    first_name: '', middle_name: '', last_name: '', date_of_birth: '', sex: 'male', relationship_to_parent: 'son',
    patient_type: 'cash', hmo_provider_id: '', hmo_number: '', hmo_company_name: '',
    allergies: '', current_medications: '', medical_conditions_notes: '', blood_type: '', medical_conditions: [],
    previous_surgeries: '', last_physical_exam: '', physician_name_specialty: '',
    last_dental_visit: '', last_dental_treatment: '', brushing_frequency: '', dental_procedures_history: [], current_dental_symptoms: [], visit_reason: '',
  };
}

function formFromDependent(dep) {
  return {
    photo_path: dep.photo_path || null,
    first_name: dep.first_name, middle_name: dep.middle_name || '', last_name: dep.last_name,
    date_of_birth: dep.date_of_birth, sex: dep.sex, relationship_to_parent: dep.relationship_to_parent,
    patient_type: dep.patient_type || 'cash',
    hmo_provider_id: dep.hmo_provider_id ? String(dep.hmo_provider_id) : '',
    hmo_number: dep.hmo_number || '', hmo_company_name: dep.hmo_company_name || '',
    allergies: dep.allergies || '', current_medications: dep.current_medications || '',
    medical_conditions_notes: dep.medical_conditions_notes || '', blood_type: dep.blood_type || '',
    medical_conditions: dep.medical_conditions || [],
    previous_surgeries: dep.previous_surgeries || '', last_physical_exam: dep.last_physical_exam || '',
    physician_name_specialty: dep.physician_name_specialty || '',
    last_dental_visit: dep.last_dental_visit || '', last_dental_treatment: dep.last_dental_treatment || '',
    brushing_frequency: dep.brushing_frequency || '',
    dental_procedures_history: dep.dental_procedures_history || [], current_dental_symptoms: dep.current_dental_symptoms || [],
    visit_reason: dep.visit_reason || '',
  };
}

// Mirrors the backend's own date_of_birth rule (DependentController::
// fieldRules()) so the wizard can warn before submitting instead of only
// after a 422 comes back.
function ageFromDob(dob) {
  if (!dob) return null;
  const birth = new Date(dob);
  if (Number.isNaN(birth.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return age;
}

function toggleInArray(arr, value) {
  return arr.includes(value) ? arr.filter((v) => v !== value) : [...arr, value];
}

function ChipGroup({ label, options, selected, onToggle }) {
  return (
    <div className="chip-group">
      <p className="chip-group-label">{label}</p>
      <div className="chip-grid">
        {options.map((opt) => (
          <button
            type="button"
            key={opt}
            className={`chip${selected.includes(opt) ? ' chip--checked' : ''}`}
            onClick={() => onToggle(opt)}
          >
            {opt}
          </button>
        ))}
      </div>
    </div>
  );
}

function MyDependents() {
  const [dependents, setDependents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [hmoProviders, setHmoProviders] = useState([]);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [wizardStep, setWizardStep] = useState(1);
  const [form, setForm] = useState(emptyForm());
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  const [removing, setRemoving] = useState(null);
  const [removeError, setRemoveError] = useState('');
  const [deleting, setDeleting] = useState(false);

  const photoInputRef = useRef(null);
  const [photoSaving, setPhotoSaving] = useState(false);
  const [photoError, setPhotoError] = useState('');

  const load = () => {
    setLoading(true);
    setError('');
    getDependents()
      .then(setDependents)
      .catch(() => setError('Could not load your dependents. Please refresh the page.'))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);
  useEffect(() => {
    getPublicHmoProviders().then(setHmoProviders).catch(() => setHmoProviders([]));
  }, []);

  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }));
  const toggleArrayField = (key, value) => setForm((f) => ({ ...f, [key]: toggleInArray(f[key], value) }));

  const openAdd = () => {
    setEditingId(null);
    setForm(emptyForm());
    setWizardStep(1);
    setSaveError('');
    setModalOpen(true);
  };

  const openEdit = (dep) => {
    setEditingId(dep.id);
    setForm(formFromDependent(dep));
    setWizardStep(1);
    setSaveError('');
    setModalOpen(true);
  };

  // Only possible once the dependent already has an id (editing, not the
  // initial Add) — same reason MyProfile's own avatar upload is a separate
  // action from saving the rest of the profile form, not part of one
  // combined submit.
  const handlePhotoChange = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !editingId) return;

    setPhotoError('');
    setPhotoSaving(true);
    try {
      const updated = await uploadDependentPhoto(editingId, file);
      set('photo_path', updated.photo_path);
      setDependents((prev) => prev.map((d) => (d.id === editingId ? updated : d)));
    } catch (err) {
      setPhotoError(err.response?.data?.message || 'Could not upload this photo. Please try again.');
    } finally {
      setPhotoSaving(false);
    }
  };

  const handleRemovePhoto = async () => {
    if (!editingId) return;
    setPhotoError('');
    setPhotoSaving(true);
    try {
      const updated = await removeDependentPhoto(editingId);
      set('photo_path', null);
      setDependents((prev) => prev.map((d) => (d.id === editingId ? updated : d)));
    } catch (err) {
      setPhotoError(err.response?.data?.message || 'Could not remove this photo. Please try again.');
    } finally {
      setPhotoSaving(false);
    }
  };

  // Switching to Male clears conditions that only ever apply to a female
  // patient — same rule the Medical Record step's own pregnancy question
  // already follows, kept consistent here instead of just hiding stale
  // selections the parent can no longer see or uncheck.
  const onSexChange = (value) => {
    setForm((f) => ({
      ...f,
      sex: value,
      medical_conditions: value === 'male' ? f.medical_conditions.filter((c) => !FEMALE_ONLY_CONDITIONS.includes(c)) : f.medical_conditions,
    }));
  };

  const age = ageFromDob(form.date_of_birth);
  const isIneligible = age !== null && age >= 18;

  const step1Valid = form.first_name.trim() && form.last_name.trim() && form.date_of_birth && age !== null && !isIneligible;
  const step2Valid = form.patient_type === 'cash'
    || (form.hmo_provider_id && form.hmo_number.trim() && form.hmo_company_name.trim());
  const canAdvance = { 1: step1Valid, 2: step2Valid, 3: true, 4: true, 5: true }[wizardStep];

  const visibleConditionOptions = useMemo(
    () => MEDICAL_CONDITION_OPTIONS.filter((opt) => form.sex === 'female' || !FEMALE_ONLY_CONDITIONS.includes(opt)),
    [form.sex]
  );

  const goNext = () => setWizardStep((s) => Math.min(5, s + 1));
  const goBack = () => setWizardStep((s) => Math.max(1, s - 1));

  const handleSave = async () => {
    setSaving(true);
    setSaveError('');
    try {
      if (editingId) {
        await updateDependent(editingId, form);
      } else {
        await createDependent(form);
      }
      setModalOpen(false);
      load();
    } catch (err) {
      setSaveError(err.response?.data?.message || 'Could not save this dependent. Please check the fields and try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    setRemoveError('');
    try {
      await deleteDependent(removing.id);
      setRemoving(null);
      load();
    } catch (err) {
      setRemoveError(err.response?.data?.message || 'Could not remove this dependent.');
    } finally {
      setDeleting(false);
    }
  };

  const selectedHmoProviderName = hmoProviders.find((p) => String(p.id) === String(form.hmo_provider_id))?.name;

  return (
    <div>
      <PageHeader icon={UsersIcon} title="My Dependents" subtitle="Manage your minor children's profiles — book and view their records without a separate account for them.">
        <button type="button" className="dash-btn" onClick={openAdd}>
          <PlusIcon /> Add Dependent
        </button>
      </PageHeader>

      <div className="section-card">
        {loading ? (
          <p>Loading…</p>
        ) : error ? (
          <div className="dash-empty">
            <span className="dash-empty-title">{error}</span>
          </div>
        ) : dependents.length === 0 ? (
          <div className="dash-empty">
            <UsersIcon />
            <span className="dash-empty-title">No dependents yet</span>
            <p className="dash-empty-desc">Add a minor child here to book and view their appointments and dental records from your own account.</p>
            <button type="button" className="dash-btn" style={{ marginTop: 12 }} onClick={openAdd}>
              <PlusIcon /> Add Dependent
            </button>
          </div>
        ) : (
          <>
            <div className="dep-grid">
              {dependents.map((dep) => (
                <div className="dep-card" key={dep.id}>
                  <div className="dep-card-top">
                    <span className={`dep-avatar${dep.sex === 'female' ? ' dep-avatar--girl' : ' dep-avatar--boy'}`}>
                      {resolvePhotoUrl(dep.photo_path) ? <img src={resolvePhotoUrl(dep.photo_path)} alt="" /> : `${dep.first_name[0]}${dep.last_name[0]}`}
                    </span>
                    <div>
                      <p className="dep-name">{dep.full_name}</p>
                      <p className="dep-meta">{RELATIONSHIP_LABELS[dep.relationship_to_parent] || dep.relationship_to_parent} · {dep.age} {dep.age === 1 ? 'yr' : 'yrs'} old</p>
                    </div>
                  </div>
                  <div className="dep-card-badges">
                    <span className={`dep-badge${dep.sex === 'female' ? ' dep-badge--girl' : ''}`}>
                      {RELATIONSHIP_LABELS[dep.relationship_to_parent] || dep.relationship_to_parent}
                    </span>
                    <span className={`dep-badge${dep.patient_type === 'hmo' ? ' dep-badge--hmo' : ' dep-badge--cash'}`}>
                      {dep.patient_type === 'hmo' ? (dep.hmo_provider_name || 'HMO') : 'Cash'}
                    </span>
                  </div>
                  <div className="dep-card-foot">
                    <div className="dep-card-foot-row">
                      <Link className="dash-btn dash-btn--sm" to={`/patient/dental-records?dependent=${dep.id}`}>
                        <ToothIcon /> View Dental Record
                      </Link>
                    </div>
                    <div className="dep-card-foot-row">
                      <button type="button" className="dash-btn dash-btn--success dash-btn--sm" onClick={() => openEdit(dep)}>
                        <EditIcon /> Edit
                      </button>
                      <button type="button" className="dash-btn dash-btn--danger dash-btn--sm" onClick={() => { setRemoving(dep); setRemoveError(''); }}>
                        <TrashIcon /> Remove
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="note-strip">
              <AlertIcon />
              <div>A dependent has no login of their own. Their appointments and dental records are saved under their own name, but you manage everything through your account.</div>
            </div>
          </>
        )}
      </div>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editingId ? 'Edit Dependent' : 'Add a Dependent'} icon={UsersIcon} tone="indigo" size="lg">
        <div className="wizard-stepper">
          {STEP_LABELS.map((label, i) => {
            const n = i + 1;
            const cls = n < wizardStep ? 'done' : n === wizardStep ? 'active' : '';
            return (
              <div key={label} style={{ display: 'contents' }}>
                <div className={`wizard-stepper-step${cls ? ` wizard-stepper-step--${cls}` : ''}`} onClick={() => setWizardStep(n)}>
                  <span className="wizard-stepper-circle">{n < wizardStep ? <CheckCircleIcon /> : n}</span>
                  <span className="wizard-stepper-label">{label}</span>
                </div>
                {n < STEP_LABELS.length && <div className={`wizard-stepper-line${n < wizardStep ? ' wizard-stepper-line--done' : ''}`} />}
              </div>
            );
          })}
        </div>

        {wizardStep === 1 && (
          <>
            {editingId ? (
              <div className="dep-photo-row">
                <span className="dep-photo-preview">
                  {resolvePhotoUrl(form.photo_path) ? (
                    <img src={resolvePhotoUrl(form.photo_path)} alt="" />
                  ) : (
                    <span>{(form.first_name[0] || '') + (form.last_name[0] || '')}</span>
                  )}
                </span>
                <div>
                  <div className="dep-photo-actions">
                    <button type="button" className="dash-btn dash-btn--outline dash-btn--sm" disabled={photoSaving} onClick={() => photoInputRef.current?.click()}>
                      <CameraIcon /> {photoSaving ? 'Saving…' : 'Change Photo'}
                    </button>
                    {form.photo_path && (
                      <button type="button" className="dash-btn dash-btn--outline dash-btn--sm" disabled={photoSaving} onClick={handleRemovePhoto}>
                        Remove
                      </button>
                    )}
                  </div>
                  <p className="dep-photo-hint">JPG, PNG, or WEBP. Max 4MB.</p>
                  {photoError && <p className="dep-form-error">{photoError}</p>}
                  <input ref={photoInputRef} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={handlePhotoChange} />
                </div>
              </div>
            ) : (
              <p className="dep-step-note">You can add this dependent's photo after saving.</p>
            )}

            <div className="dep-form-two">
              <div className="dep-field"><label>First Name</label><input className="form-input" value={form.first_name} onChange={(e) => set('first_name', e.target.value)} /></div>
              <div className="dep-field"><label>Last Name</label><input className="form-input" value={form.last_name} onChange={(e) => set('last_name', e.target.value)} /></div>
            </div>
            <div className="dep-field"><label>Middle Name (optional)</label><input className="form-input" value={form.middle_name} onChange={(e) => set('middle_name', e.target.value)} /></div>
            <div className="dep-form-two">
              <div className="dep-field">
                <label>Date of Birth</label>
                <input type="date" className="form-input" value={form.date_of_birth} max={new Date().toISOString().slice(0, 10)} onChange={(e) => set('date_of_birth', e.target.value)} />
                {age !== null && (
                  <span className={`age-pill${isIneligible ? ' age-pill--warn' : ''}`}>
                    {age} {age === 1 ? 'year' : 'years'} old — {isIneligible ? 'not eligible (18 or older)' : 'eligible'}
                  </span>
                )}
              </div>
              <div className="dep-field">
                <label>Sex</label>
                <select className="form-select" value={form.sex} onChange={(e) => onSexChange(e.target.value)}>
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                </select>
              </div>
            </div>
            <div className="dep-field">
              <label>Relationship to You</label>
              <select className="form-select" value={form.relationship_to_parent} onChange={(e) => set('relationship_to_parent', e.target.value)}>
                <option value="son">Son</option>
                <option value="daughter">Daughter</option>
                <option value="ward">Ward</option>
              </select>
            </div>
          </>
        )}

        {wizardStep === 2 && (
          <>
            <p className="dep-step-note">Choose how this dependent's visits will be paid for — their own HMO card number goes here if it's different from yours.</p>
            <div className="dep-pay-grid">
              <button type="button" className={`dep-pay-option${form.patient_type === 'cash' ? ' dep-pay-option--selected' : ''}`} onClick={() => set('patient_type', 'cash')}>
                <span className="dep-pay-icon"><CashIcon /></span>
                <span className="dep-pay-label">Cash Patient</span>
                <span className="dep-pay-desc">Pay directly for each visit. Appointments are confirmed instantly.</span>
              </button>
              <button type="button" className={`dep-pay-option${form.patient_type === 'hmo' ? ' dep-pay-option--selected' : ''}`} onClick={() => set('patient_type', 'hmo')}>
                <span className="dep-pay-icon"><ShieldIcon /></span>
                <span className="dep-pay-label">HMO Covered</span>
                <span className="dep-pay-desc">Covered by an HMO plan. Appointments need staff verification first.</span>
              </button>
            </div>

            {form.patient_type === 'hmo' && (
              <div className="dep-hmo-fields">
                <div className="dep-hmo-note">
                  <AlertIcon /> A dependent's HMO card is usually its own member number, even under the same company plan as yours.
                </div>
                <div className="dep-field"><label>HMO Provider</label>
                  <select className="form-select" value={form.hmo_provider_id} onChange={(e) => set('hmo_provider_id', e.target.value)}>
                    <option value="">Select HMO Provider</option>
                    {hmoProviders.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
                <div className="dep-form-two">
                  <div className="dep-field"><label>HMO Card / Member ID Number</label><input className="form-input" value={form.hmo_number} onChange={(e) => set('hmo_number', e.target.value)} placeholder="Dependent's own card number" /></div>
                  <div className="dep-field"><label>Company Name / Employer</label><input className="form-input" value={form.hmo_company_name} onChange={(e) => set('hmo_company_name', e.target.value)} /></div>
                </div>
              </div>
            )}
          </>
        )}

        {wizardStep === 3 && (
          <>
            <p className="dep-step-note">Optional — helps our dental team prepare for this dependent's visit.</p>
            <ChipGroup
              label="Medical Conditions (check all that apply)"
              options={visibleConditionOptions}
              selected={form.medical_conditions}
              onToggle={(opt) => toggleArrayField('medical_conditions', opt)}
            />
            <div className="dep-form-two">
              <div className="dep-field"><label>Blood Type</label>
                <select className="form-select" value={form.blood_type} onChange={(e) => set('blood_type', e.target.value)}>
                  <option value="">Select blood type</option>
                  {BLOOD_TYPE_OPTIONS.map((bt) => <option key={bt} value={bt}>{bt}</option>)}
                </select>
              </div>
              <div className="dep-field"><label>Last Physical Examination</label><input className="form-input" value={form.last_physical_exam} onChange={(e) => set('last_physical_exam', e.target.value)} placeholder="e.g. 6 months ago" /></div>
            </div>
            <div className="dep-field"><label>Doctor's Name &amp; Specialty</label><input className="form-input" value={form.physician_name_specialty} onChange={(e) => set('physician_name_specialty', e.target.value)} placeholder="Optional" /></div>
            <div className="dep-field"><label>Allergies</label><textarea className="dep-textarea" rows={2} value={form.allergies} onChange={(e) => set('allergies', e.target.value)} placeholder="e.g. Penicillin, Latex — leave blank if none" /></div>
            <div className="dep-field"><label>Current / Maintenance Medications</label><textarea className="dep-textarea" rows={2} value={form.current_medications} onChange={(e) => set('current_medications', e.target.value)} placeholder="Leave blank if none" /></div>
            <div className="dep-field"><label>Relevant Medical Conditions (other notes)</label><textarea className="dep-textarea" rows={2} value={form.medical_conditions_notes} onChange={(e) => set('medical_conditions_notes', e.target.value)} placeholder="Anything not covered above" /></div>
            <div className="dep-field"><label>Previous Surgeries</label><textarea className="dep-textarea" rows={2} value={form.previous_surgeries} onChange={(e) => set('previous_surgeries', e.target.value)} placeholder="Leave blank if none" /></div>
          </>
        )}

        {wizardStep === 4 && (
          <>
            <p className="dep-step-note">Optional — helps our dental team prepare for this dependent's visit.</p>
            <div className="dep-form-two">
              <div className="dep-field"><label>Last Dental Visit</label><input className="form-input" value={form.last_dental_visit} onChange={(e) => set('last_dental_visit', e.target.value)} placeholder="e.g. 1 year ago" /></div>
              <div className="dep-field"><label>Last Dental Treatment</label><input className="form-input" value={form.last_dental_treatment} onChange={(e) => set('last_dental_treatment', e.target.value)} placeholder="e.g. Tooth filling" /></div>
            </div>
            <div className="dep-field"><label>How Often Do They Brush?</label>
              <select className="form-select" value={form.brushing_frequency} onChange={(e) => set('brushing_frequency', e.target.value)}>
                <option value="">Select an option</option>
                {BRUSHING_OPTIONS.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
              </select>
            </div>
            <ChipGroup label="Did they have any of the following?" options={PROCEDURE_OPTIONS} selected={form.dental_procedures_history} onToggle={(opt) => toggleArrayField('dental_procedures_history', opt)} />
            <ChipGroup label="Are they currently experiencing any of the following?" options={SYMPTOM_OPTIONS} selected={form.current_dental_symptoms} onToggle={(opt) => toggleArrayField('current_dental_symptoms', opt)} />
            <div className="dep-field"><label>Reason for Today's Dental Visit</label><textarea className="dep-textarea" rows={2} value={form.visit_reason} onChange={(e) => set('visit_reason', e.target.value)} placeholder="Optional" /></div>
          </>
        )}

        {wizardStep === 5 && (
          <>
            <p className="dep-step-note">Review before saving — you can go back to any step above to edit.</p>
            <div className="dep-review-section">
              <h4>Basic Info</h4>
              <div className="dep-review-row"><span>Name</span><span>{[form.first_name, form.middle_name, form.last_name].filter(Boolean).join(' ')}</span></div>
              <div className="dep-review-row"><span>Date of Birth</span><span>{form.date_of_birth || '—'} {age !== null ? `(${age} yrs)` : ''}</span></div>
              <div className="dep-review-row"><span>Sex</span><span>{form.sex === 'female' ? 'Female' : 'Male'}</span></div>
              <div className="dep-review-row"><span>Relationship</span><span>{RELATIONSHIP_LABELS[form.relationship_to_parent]}</span></div>
            </div>
            <div className="dep-review-section">
              <h4>Payment &amp; Coverage</h4>
              <div className="dep-review-row"><span>Payment Type</span><span>{form.patient_type === 'hmo' ? 'HMO' : 'Cash'}</span></div>
              {form.patient_type === 'hmo' && (
                <>
                  <div className="dep-review-row"><span>HMO Provider</span><span>{selectedHmoProviderName || '—'}</span></div>
                  <div className="dep-review-row"><span>Card / Member ID</span><span>{form.hmo_number || '—'}</span></div>
                </>
              )}
            </div>
            <div className="dep-review-section">
              <h4>Medical Information</h4>
              <div className="dep-review-row"><span>Conditions Declared</span><span>{form.medical_conditions.length ? form.medical_conditions.join(', ') : <em className="dep-review-empty">None declared</em>}</span></div>
              <div className="dep-review-row"><span>Allergies</span><span>{form.allergies || <em className="dep-review-empty">None declared</em>}</span></div>
            </div>
            <div className="dep-review-section">
              <h4>Dental History</h4>
              <div className="dep-review-row"><span>Current Symptoms</span><span>{form.current_dental_symptoms.length ? form.current_dental_symptoms.join(', ') : <em className="dep-review-empty">None declared</em>}</span></div>
              <div className="dep-review-row"><span>Past Procedures</span><span>{form.dental_procedures_history.length ? form.dental_procedures_history.join(', ') : <em className="dep-review-empty">None declared</em>}</span></div>
            </div>
          </>
        )}

        {saveError && <p className="dep-form-error">{saveError}</p>}

        <div className="dep-modal-actions">
          {wizardStep > 1 ? (
            <button type="button" className="dash-btn dash-btn--outline" onClick={goBack} disabled={saving}>Back</button>
          ) : (
            <button type="button" className="dash-btn dash-btn--outline" onClick={() => setModalOpen(false)} disabled={saving}>Cancel</button>
          )}
          {wizardStep < 5 ? (
            <button type="button" className="dash-btn" onClick={goNext} disabled={!canAdvance}>Next</button>
          ) : (
            <button type="button" className="dash-btn" onClick={handleSave} disabled={saving}>
              {saving ? 'Saving…' : 'Save Dependent'}
            </button>
          )}
        </div>
      </Modal>

      <Modal open={!!removing} onClose={() => setRemoving(null)} title="Remove Dependent?" icon={AlertIcon} tone="danger">
        {removing && (
          <>
            <p className="dep-modal-sub">
              Remove <strong>{removing.full_name}</strong> from your account? This can't be undone.
            </p>
            {removeError && <p className="dep-form-error">{removeError}</p>}
            <div className="dep-modal-actions">
              <button type="button" className="dash-btn dash-btn--outline" onClick={() => setRemoving(null)} disabled={deleting}>Cancel</button>
              <button type="button" className="dash-btn dash-btn--danger" onClick={handleDelete} disabled={deleting}>
                {deleting ? 'Removing…' : 'Remove'}
              </button>
            </div>
          </>
        )}
      </Modal>
    </div>
  );
}

export default MyDependents;
