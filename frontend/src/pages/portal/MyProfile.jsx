import { useCallback, useEffect, useRef, useState } from 'react';
import api from '../../api';
import { useAuth } from '../../context/AuthContext';
import { getMyProfile, updateMyProfile, changeMyPassword, uploadMyAvatar, removeMyAvatar } from '../../api/profile';
import { passwordChecklist } from '../auth/registerSteps/validation';
import { getAvatarUrl } from './avatarUtils';
import Skeleton from './components/Skeleton';
import PageHeader from './components/PageHeader';
import {
  UserIcon, ShieldIcon, MailIcon, PhoneIcon, CameraIcon, LockIcon, MapPinIcon, UsersIcon,
  AlertIcon, SyringeIcon, FileIcon, BuildingIcon, ToothIcon, ClockIcon,
} from './icons';
import './dashboards.css';
import './MyProfile.css';

function getInitials(name) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] || '';
  const last = parts.length > 1 ? parts[parts.length - 1][0] : '';
  return (first + last).toUpperCase();
}

const CHECKLIST_ITEMS = [
  { key: 'length', label: 'Minimum 8 characters' },
  { key: 'upper', label: 'One uppercase letter' },
  { key: 'number', label: 'One number' },
  { key: 'special', label: 'One special character' },
];

const ROLE_LABELS = { patient: 'Patient', dentist: 'Dentist', dental_assistant: 'Dental Assistant' };
const ROLE_TONE = { patient: 'blue', dentist: 'indigo', dental_assistant: 'teal' };

function CheckIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

// icon/tone are optional — every field on this page now passes them
// (color-coded, same pattern already shipped on Patient Records/HMO
// Queue), kept optional only so the component doesn't force every future
// caller to supply one.
function Field({ label, children, full, icon: Icon, tone }) {
  const body = (
    <>
      <label className="profile-field-label">{label}</label>
      {children}
    </>
  );
  return (
    <div className={`profile-field${full ? ' profile-field-full' : ''}`}>
      {Icon ? (
        <div className="profile-field-icon-row">
          <span className={`profile-field-icon profile-field-icon--${tone || 'blue'}`}><Icon /></span>
          <div className="profile-field-icon-body">{body}</div>
        </div>
      ) : body}
    </div>
  );
}

function MyProfile() {
  const { role, refreshUser } = useAuth();
  const isPatient = role === 'patient';
  const isDentist = role === 'dentist';

  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [saveSuccess, setSaveSuccess] = useState('');

  const [hmoProviders, setHmoProviders] = useState([]);
  const [providersError, setProvidersError] = useState(false);

  const [pwForm, setPwForm] = useState({ current_password: '', password: '', password_confirmation: '' });
  const [pwSaving, setPwSaving] = useState(false);
  const [pwError, setPwError] = useState('');
  const [pwSuccess, setPwSuccess] = useState('');

  const [avatarSaving, setAvatarSaving] = useState(false);
  const [avatarError, setAvatarError] = useState('');
  const avatarInputRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const data = await getMyProfile();
      setProfile(data);
      setForm({
        name: data.name || '',
        mobile_number: data.mobile_number || '',
        first_name: data.patient?.first_name || '',
        middle_name: data.patient?.middle_name || '',
        last_name: data.patient?.last_name || '',
        complete_address: data.patient?.address_line || '',
        emergency_contact_name: data.patient?.emergency_contact_name || '',
        emergency_contact_relationship: data.patient?.emergency_contact_relationship || '',
        emergency_contact_number: data.patient?.emergency_contact_number || '',
        allergies: data.patient?.allergies || '',
        current_medications: data.patient?.current_medications || '',
        medical_conditions_notes: data.patient?.medical_conditions_other || '',
        patient_type: data.patient?.patient_type || 'cash',
        hmo_provider_id: data.patient?.hmo_provider_id ? String(data.patient.hmo_provider_id) : '',
        hmo_number: data.patient?.hmo_number || '',
        hmo_company_name: data.patient?.hmo_company_name || '',
        specialization: data.dentist_profile?.specialization || '',
        years_experience: data.dentist_profile?.years_experience ?? '',
        bio: data.dentist_profile?.bio || '',
      });
    } catch {
      setLoadError('Could not load your profile. Please refresh the page.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Same public, admin-managed active-providers list the registration
  // wizard's StepPatientCategory uses — only fetched for patients, since
  // it's only ever shown in the Patient Type / Coverage section below.
  useEffect(() => {
    if (!isPatient) return;
    let cancelled = false;

    api.get('/api/hmo-providers')
      .then((response) => {
        if (!cancelled) setHmoProviders(response.data.data);
      })
      .catch(() => {
        if (!cancelled) setProvidersError(true);
      });

    return () => {
      cancelled = true;
    };
  }, [isPatient]);

  const set = (field, value) => setForm((prev) => ({ ...prev, [field]: value }));

  const handleSave = async (e) => {
    e.preventDefault();
    setSaveError('');
    setSaveSuccess('');
    setSaving(true);

    const payload = { mobile_number: form.mobile_number.trim() };

    if (isPatient) {
      Object.assign(payload, {
        first_name: form.first_name.trim(),
        middle_name: form.middle_name.trim() || null,
        last_name: form.last_name.trim(),
        complete_address: form.complete_address.trim(),
        emergency_contact_name: form.emergency_contact_name.trim(),
        emergency_contact_relationship: form.emergency_contact_relationship.trim(),
        emergency_contact_number: form.emergency_contact_number.trim(),
        allergies: form.allergies.trim() || null,
        current_medications: form.current_medications.trim() || null,
        medical_conditions_notes: form.medical_conditions_notes.trim() || null,
        patient_type: form.patient_type,
        hmo_provider_id: form.patient_type === 'hmo' ? form.hmo_provider_id || null : null,
        hmo_number: form.patient_type === 'hmo' ? form.hmo_number.trim() || null : null,
        hmo_company_name: form.patient_type === 'hmo' ? form.hmo_company_name.trim() || null : null,
      });
    } else {
      payload.name = form.name.trim();
      if (isDentist) {
        Object.assign(payload, {
          specialization: form.specialization.trim() || null,
          years_experience: form.years_experience === '' ? null : Number(form.years_experience),
          bio: form.bio.trim() || null,
        });
      }
    }

    try {
      const updated = await updateMyProfile(payload);
      setProfile(updated);
      setSaveSuccess('Your profile has been updated.');
      await refreshUser();
    } catch (err) {
      setSaveError(err.response?.data?.message || 'Could not save your changes. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleAvatarChange = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setAvatarError('');
    setAvatarSaving(true);
    try {
      const updated = await uploadMyAvatar(file);
      setProfile(updated);
      await refreshUser();
    } catch (err) {
      setAvatarError(err.response?.data?.message || 'Could not upload your photo. Please try again.');
    } finally {
      setAvatarSaving(false);
    }
  };

  const handleRemoveAvatar = async () => {
    setAvatarError('');
    setAvatarSaving(true);
    try {
      const updated = await removeMyAvatar();
      setProfile(updated);
      await refreshUser();
    } catch (err) {
      setAvatarError(err.response?.data?.message || 'Could not remove your photo. Please try again.');
    } finally {
      setAvatarSaving(false);
    }
  };

  const pw = passwordChecklist(pwForm.password);
  const pwValid = pw.length && pw.upper && pw.number && pw.special;

  const handleChangePassword = async (e) => {
    e.preventDefault();
    setPwError('');
    setPwSuccess('');

    if (!pwValid) {
      setPwError('Password does not meet the requirements below.');
      return;
    }
    if (pwForm.password !== pwForm.password_confirmation) {
      setPwError('Passwords do not match.');
      return;
    }

    setPwSaving(true);
    try {
      await changeMyPassword(pwForm.current_password, pwForm.password, pwForm.password_confirmation);
      setPwSuccess('Your password has been changed.');
      setPwForm({ current_password: '', password: '', password_confirmation: '' });
    } catch (err) {
      setPwError(err.response?.data?.message || 'Could not change your password. Please try again.');
    } finally {
      setPwSaving(false);
    }
  };

  if (loading) {
    return (
      <div>
        <PageHeader icon={UserIcon} title="My Profile" />
        <Skeleton variant="block" height="300px" />
      </div>
    );
  }

  if (loadError) {
    return (
      <div>
        <PageHeader icon={UserIcon} title="My Profile" />
        <div className="dash-empty"><span className="dash-empty-title">{loadError}</span></div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader icon={UserIcon} title="My Profile" subtitle="View and update your Smile Bay account details." />

      <div className="section-card">
        {avatarError && <div className="profile-alert profile-alert--error">{avatarError}</div>}

        <div className="profile-hero">
          <div className="profile-hero-left">
            <span className="profile-hero-avatar">
              {getAvatarUrl(profile) ? (
                <img src={getAvatarUrl(profile)} alt="" />
              ) : (
                <span>{getInitials(profile.name)}</span>
              )}
            </span>
            <div>
              <div className="profile-hero-name">{profile.name}</div>
              <div className="profile-hero-meta">
                <span className={`profile-hero-pill profile-hero-pill--${ROLE_TONE[role] || 'blue'}`}>
                  {ROLE_LABELS[role] || role}
                </span>
              </div>
              <div className="profile-hero-email">{profile.email}</div>
            </div>
          </div>
          <div className="profile-hero-actions">
            <div className="dash-btn-row">
              <button
                type="button"
                className="dash-btn dash-btn--outline"
                disabled={avatarSaving}
                onClick={() => avatarInputRef.current?.click()}
              >
                <CameraIcon /> {avatarSaving ? 'Saving…' : 'Change Photo'}
              </button>
              {getAvatarUrl(profile) && (
                <button
                  type="button"
                  className="dash-btn dash-btn--outline"
                  disabled={avatarSaving}
                  onClick={handleRemoveAvatar}
                >
                  Remove
                </button>
              )}
            </div>
            <p className="profile-hero-hint">JPG, PNG, or WEBP. Max 4MB.</p>
            <input
              ref={avatarInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              hidden
              onChange={handleAvatarChange}
            />
          </div>
        </div>
      </div>

      <form onSubmit={handleSave}>
        <div className="section-card">
          <div className="section-card-header">
            <div className="section-card-heading">
              <span className="section-card-icon"><UserIcon /></span>
              <h3 className="section-card-title">Account Information</h3>
            </div>
          </div>

          {saveError && <div className="profile-alert profile-alert--error">{saveError}</div>}
          {saveSuccess && <div className="profile-alert profile-alert--success">{saveSuccess}</div>}

          <div className="profile-grid">
            <Field label="Email Address" icon={MailIcon} tone="blue">
              <input className="form-input" value={profile.email} disabled />
            </Field>
            <Field label="Mobile Number" icon={PhoneIcon} tone="teal">
              <input
                className="form-input"
                value={form.mobile_number}
                onChange={(e) => set('mobile_number', e.target.value)}
                placeholder="09XXXXXXXXX"
              />
            </Field>

            {isPatient ? (
              <>
                <Field label="First Name" icon={UserIcon} tone="navy">
                  <input className="form-input" value={form.first_name} onChange={(e) => set('first_name', e.target.value)} />
                </Field>
                <Field label="Middle Name" icon={UserIcon} tone="navy">
                  <input className="form-input" value={form.middle_name} onChange={(e) => set('middle_name', e.target.value)} />
                </Field>
                <Field label="Last Name" icon={UserIcon} tone="navy">
                  <input className="form-input" value={form.last_name} onChange={(e) => set('last_name', e.target.value)} />
                </Field>
                <Field label="Patient No." icon={FileIcon} tone="slate">
                  <input className="form-input" value={profile.patient?.patient_number || ''} disabled />
                </Field>
              </>
            ) : (
              <Field label="Full Name" icon={UserIcon} tone="navy">
                <input className="form-input" value={form.name} onChange={(e) => set('name', e.target.value)} />
              </Field>
            )}
          </div>
        </div>

        {isPatient && (
          <>
            <div className="section-card">
              <div className="section-card-header">
                <div className="section-card-heading">
                  <span className="section-card-icon section-card-icon--teal"><MapPinIcon /></span>
                  <h3 className="section-card-title">Address &amp; Emergency Contact</h3>
                </div>
              </div>
              <div className="profile-grid">
                <Field label="Complete Address" full icon={MapPinIcon} tone="slate">
                  <input
                    className="form-input"
                    value={form.complete_address}
                    onChange={(e) => set('complete_address', e.target.value)}
                  />
                </Field>
                <Field label="Emergency Contact Name" icon={UsersIcon} tone="indigo">
                  <input
                    className="form-input"
                    value={form.emergency_contact_name}
                    onChange={(e) => set('emergency_contact_name', e.target.value)}
                  />
                </Field>
                <Field label="Relationship" icon={UsersIcon} tone="indigo">
                  <input
                    className="form-input"
                    value={form.emergency_contact_relationship}
                    onChange={(e) => set('emergency_contact_relationship', e.target.value)}
                  />
                </Field>
                <Field label="Emergency Contact Number" icon={PhoneIcon} tone="teal">
                  <input
                    className="form-input"
                    value={form.emergency_contact_number}
                    onChange={(e) => set('emergency_contact_number', e.target.value)}
                  />
                </Field>
              </div>
            </div>

            <div className="section-card">
              <div className="section-card-header">
                <div className="section-card-heading">
                  <span className="section-card-icon section-card-icon--red"><SyringeIcon /></span>
                  <h3 className="section-card-title">Medical Information</h3>
                </div>
              </div>
              <div className="profile-grid">
                <Field label="Allergies" full icon={AlertIcon} tone="red">
                  <textarea className="form-textarea" value={form.allergies} onChange={(e) => set('allergies', e.target.value)} placeholder="Leave blank if none" />
                </Field>
                <Field label="Current Medications" full icon={SyringeIcon} tone="indigo">
                  <textarea className="form-textarea" value={form.current_medications} onChange={(e) => set('current_medications', e.target.value)} placeholder="Leave blank if none" />
                </Field>
                <Field label="Relevant Medical Conditions" full icon={FileIcon} tone="slate">
                  <textarea className="form-textarea" value={form.medical_conditions_notes} onChange={(e) => set('medical_conditions_notes', e.target.value)} placeholder="Leave blank if none" />
                </Field>
              </div>
            </div>

            <div className="section-card">
              <div className="section-card-header">
                <div className="section-card-heading">
                  <span className="section-card-icon"><ShieldIcon /></span>
                  <h3 className="section-card-title">Patient Type / Coverage</h3>
                </div>
              </div>
              <p className="section-card-subtitle" style={{ margin: '-8px 0 14px' }}>
                Switch between Cash and HMO any time — e.g. you just got HMO coverage, or your coverage ended. This only
                affects appointments you book from now on; past visits keep the payment method they were booked under.
              </p>
              <div className="profile-grid">
                <Field label="Patient Type" icon={ShieldIcon} tone="blue">
                  <select className="form-select" value={form.patient_type} onChange={(e) => set('patient_type', e.target.value)}>
                    <option value="cash">Cash Patient</option>
                    <option value="hmo">HMO Covered Patient</option>
                  </select>
                </Field>

                {form.patient_type === 'hmo' && (
                  <>
                    <Field label="HMO Provider" icon={ShieldIcon} tone="teal">
                      <select
                        className="form-select"
                        value={form.hmo_provider_id}
                        onChange={(e) => set('hmo_provider_id', e.target.value)}
                      >
                        <option value="">Select HMO Provider</option>
                        {hmoProviders.map((provider) => (
                          <option key={provider.id} value={String(provider.id)}>{provider.name}</option>
                        ))}
                      </select>
                      {providersError && (
                        <span style={{ display: 'block', marginTop: 6, fontSize: '0.82rem', color: 'var(--portal-red-text)' }}>
                          Could not load HMO providers. Please refresh the page.
                        </span>
                      )}
                    </Field>
                    <Field label="HMO Card / Member ID Number" icon={FileIcon} tone="slate">
                      <input
                        className="form-input"
                        value={form.hmo_number}
                        onChange={(e) => set('hmo_number', e.target.value)}
                        placeholder="Enter your HMO card / member ID number"
                      />
                    </Field>
                    <Field label="Company Name / Employer" icon={BuildingIcon} tone="navy">
                      <input
                        className="form-input"
                        value={form.hmo_company_name}
                        onChange={(e) => set('hmo_company_name', e.target.value)}
                        placeholder="Enter your company name or employer"
                      />
                    </Field>
                  </>
                )}
              </div>

              {/* Read-only — staff fill this in after calling the provider to
                  verify coverage (StaffVerificationController::proposeNewDate()/
                  updateHmoInfo()), not something the patient edits here. Only
                  shown once something has actually been recorded. */}
              {form.patient_type === 'hmo' && profile?.patient?.hmo_coverage_notes && (
                <div className="hmo-coverage-box">
                  <div className="hmo-coverage-box-header">
                    <ShieldIcon />
                    <span>Your Verified Coverage</span>
                  </div>
                  <p className="hmo-coverage-box-text">{profile.patient.hmo_coverage_notes}</p>
                  {profile.patient.hmo_coverage_verified_at && (
                    <div className="hmo-coverage-box-time">
                      Last verified {new Date(profile.patient.hmo_coverage_verified_at).toLocaleDateString('en-US', {
                        month: 'short', day: 'numeric', year: 'numeric',
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          </>
        )}

        {isDentist && (
          <div className="section-card">
            <div className="section-card-header">
              <div className="section-card-heading">
                <span className="section-card-icon"><ToothIcon /></span>
                <h3 className="section-card-title">Professional Information</h3>
              </div>
            </div>
            <div className="profile-grid">
              <Field label="Specialization" icon={ToothIcon} tone="blue">
                <input className="form-input" value={form.specialization} onChange={(e) => set('specialization', e.target.value)} placeholder="e.g. Pediatric Dentistry" />
              </Field>
              <Field label="Years of Experience" icon={ClockIcon} tone="amber">
                <input
                  className="form-input"
                  type="number"
                  min="0"
                  max="80"
                  value={form.years_experience}
                  onChange={(e) => set('years_experience', e.target.value)}
                />
              </Field>
              <Field label="Bio" full icon={FileIcon} tone="slate">
                <textarea className="form-textarea" value={form.bio} onChange={(e) => set('bio', e.target.value)} placeholder="Shown on the clinic's dentist listing" />
              </Field>
            </div>
          </div>
        )}

        <div className="profile-save-row">
          <button type="submit" className="dash-btn" disabled={saving}>
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </form>

      <form onSubmit={handleChangePassword}>
        <div className="section-card">
          <div className="section-card-header">
            <div className="section-card-heading">
              <span className="section-card-icon section-card-icon--indigo"><LockIcon /></span>
              <h3 className="section-card-title">Change Password</h3>
            </div>
          </div>

          {pwError && <div className="profile-alert profile-alert--error">{pwError}</div>}
          {pwSuccess && <div className="profile-alert profile-alert--success">{pwSuccess}</div>}

          <div className="profile-grid">
            <Field label="Current Password" full icon={LockIcon} tone="indigo">
              <input
                className="form-input"
                type="password"
                value={pwForm.current_password}
                onChange={(e) => setPwForm((p) => ({ ...p, current_password: e.target.value }))}
                autoComplete="current-password"
              />
            </Field>
            <Field label="New Password" icon={LockIcon} tone="indigo">
              <input
                className="form-input"
                type="password"
                value={pwForm.password}
                onChange={(e) => setPwForm((p) => ({ ...p, password: e.target.value }))}
                autoComplete="new-password"
              />
            </Field>
            <Field label="Confirm New Password" icon={LockIcon} tone="indigo">
              <input
                className="form-input"
                type="password"
                value={pwForm.password_confirmation}
                onChange={(e) => setPwForm((p) => ({ ...p, password_confirmation: e.target.value }))}
                autoComplete="new-password"
              />
            </Field>

            <div className="profile-pw-checklist profile-field-full">
              {CHECKLIST_ITEMS.map((item) => (
                <span key={item.key} className={`profile-pw-chip${pw[item.key] ? ' profile-pw-chip--met' : ''}`}>
                  {pw[item.key] && <CheckIcon />} {item.label}
                </span>
              ))}
            </div>
          </div>

          <div className="profile-save-row">
            <button type="submit" className="dash-btn" disabled={pwSaving}>
              {pwSaving ? 'Updating…' : 'Update Password'}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}

export default MyProfile;
