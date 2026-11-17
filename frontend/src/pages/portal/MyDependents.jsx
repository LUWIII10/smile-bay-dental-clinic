import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getDependents, createDependent, updateDependent, deleteDependent } from '../../api/dependents';
import PageHeader from './components/PageHeader';
import Modal from './components/Modal';
import { UsersIcon, ToothIcon, PlusIcon, EditIcon, TrashIcon, AlertIcon } from './icons';
import './dashboards.css';
import './MyDependents.css';

const RELATIONSHIP_LABELS = { son: 'Son', daughter: 'Daughter', ward: 'Ward' };

function emptyForm() {
  return { first_name: '', middle_name: '', last_name: '', date_of_birth: '', sex: 'male', relationship_to_parent: 'son' };
}

// Mirrors the backend's own date_of_birth rule (DependentController::
// fieldRules()) so the modal can warn before submitting instead of only
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

function MyDependents() {
  const [dependents, setDependents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm());
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  const [removing, setRemoving] = useState(null); // dependent being confirmed for removal
  const [removeError, setRemoveError] = useState('');
  const [deleting, setDeleting] = useState(false);

  const load = () => {
    setLoading(true);
    setError('');
    getDependents()
      .then(setDependents)
      .catch(() => setError('Could not load your dependents. Please refresh the page.'))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const openAdd = () => {
    setEditingId(null);
    setForm(emptyForm());
    setSaveError('');
    setModalOpen(true);
  };

  const openEdit = (dep) => {
    setEditingId(dep.id);
    setForm({
      first_name: dep.first_name,
      middle_name: dep.middle_name || '',
      last_name: dep.last_name,
      date_of_birth: dep.date_of_birth,
      sex: dep.sex,
      relationship_to_parent: dep.relationship_to_parent,
    });
    setSaveError('');
    setModalOpen(true);
  };

  const age = ageFromDob(form.date_of_birth);
  const isIneligible = age !== null && age >= 18;
  const canSave = form.first_name.trim() && form.last_name.trim() && form.date_of_birth && age !== null && !isIneligible;

  const handleSave = async () => {
    setSaving(true);
    setSaveError('');
    try {
      const payload = {
        firstName: form.first_name.trim(),
        middleName: form.middle_name.trim(),
        lastName: form.last_name.trim(),
        dateOfBirth: form.date_of_birth,
        sex: form.sex,
        relationshipToParent: form.relationship_to_parent,
      };
      if (editingId) {
        await updateDependent(editingId, payload);
      } else {
        await createDependent(payload);
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
                      {dep.first_name[0]}{dep.last_name[0]}
                    </span>
                    <div>
                      <p className="dep-name">{dep.full_name}</p>
                      <p className="dep-meta">{RELATIONSHIP_LABELS[dep.relationship_to_parent] || dep.relationship_to_parent} · {dep.age} {dep.age === 1 ? 'yr' : 'yrs'} old</p>
                    </div>
                  </div>
                  <span className={`dep-badge${dep.sex === 'female' ? ' dep-badge--girl' : ''}`}>
                    {RELATIONSHIP_LABELS[dep.relationship_to_parent] || dep.relationship_to_parent}
                  </span>
                  <div className="dep-card-foot">
                    <Link className="dash-btn dash-btn--outline dash-btn--sm" style={{ flex: 1 }} to={`/patient/dental-records?dependent=${dep.id}`}>
                      <ToothIcon /> View Dental Record
                    </Link>
                    <button type="button" className="icon-btn" title="Edit" onClick={() => openEdit(dep)}>
                      <EditIcon />
                    </button>
                    <button type="button" className="icon-btn icon-btn--danger" title="Remove" onClick={() => { setRemoving(dep); setRemoveError(''); }}>
                      <TrashIcon />
                    </button>
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

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editingId ? 'Edit Dependent' : 'Add a Dependent'} icon={UsersIcon} tone="indigo">
        <p className="dep-modal-sub">For your minor children only. They'll appear wherever you book or view records for them.</p>

        <div className="dep-form-two">
          <div className="dep-field">
            <label>First Name</label>
            <input className="form-input" value={form.first_name} onChange={(e) => setForm((f) => ({ ...f, first_name: e.target.value }))} />
          </div>
          <div className="dep-field">
            <label>Last Name</label>
            <input className="form-input" value={form.last_name} onChange={(e) => setForm((f) => ({ ...f, last_name: e.target.value }))} />
          </div>
        </div>
        <div className="dep-field">
          <label>Middle Name (optional)</label>
          <input className="form-input" value={form.middle_name} onChange={(e) => setForm((f) => ({ ...f, middle_name: e.target.value }))} />
        </div>
        <div className="dep-form-two">
          <div className="dep-field">
            <label>Date of Birth</label>
            <input type="date" className="form-input" value={form.date_of_birth} max={new Date().toISOString().slice(0, 10)} onChange={(e) => setForm((f) => ({ ...f, date_of_birth: e.target.value }))} />
            {age !== null && (
              <span className={`age-pill${isIneligible ? ' age-pill--warn' : ''}`}>
                {age} {age === 1 ? 'year' : 'years'} old — {isIneligible ? 'not eligible (18 or older)' : 'eligible'}
              </span>
            )}
          </div>
          <div className="dep-field">
            <label>Sex</label>
            <select className="form-select" value={form.sex} onChange={(e) => setForm((f) => ({ ...f, sex: e.target.value }))}>
              <option value="male">Male</option>
              <option value="female">Female</option>
            </select>
          </div>
        </div>
        <div className="dep-field">
          <label>Relationship to You</label>
          <select className="form-select" value={form.relationship_to_parent} onChange={(e) => setForm((f) => ({ ...f, relationship_to_parent: e.target.value }))}>
            <option value="son">Son</option>
            <option value="daughter">Daughter</option>
            <option value="ward">Ward</option>
          </select>
        </div>

        {saveError && <p className="dep-form-error">{saveError}</p>}

        <div className="dep-modal-actions">
          <button type="button" className="dash-btn dash-btn--outline" onClick={() => setModalOpen(false)} disabled={saving}>Cancel</button>
          <button type="button" className="dash-btn" onClick={handleSave} disabled={!canSave || saving}>
            {saving ? 'Saving…' : 'Save Dependent'}
          </button>
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
