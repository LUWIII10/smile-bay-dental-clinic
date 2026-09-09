import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { searchUsers, createStaffUser, updateUser, setUserStatus } from '../../api/userManagement';
import DataTable from './components/DataTable';
import Pagination from './components/Pagination';
import Skeleton from './components/Skeleton';
import StatusBadge from './components/StatusBadge';
import Modal from './components/Modal';
import { SearchIcon } from './icons';
import { showSuccessToast, showErrorToast, confirmAction } from '../../utils/toast';
import './dashboards.css';
import './Appointments.css';
import './UserManagement.css';

const SEARCH_DEBOUNCE_MS = 400;

const ROLE_LABELS = { patient: 'Patient', dentist: 'Dentist', dental_assistant: 'Dental Assistant', admin: 'Administrator' };
const ROLE_TONE = { patient: 'blue', dentist: 'green', dental_assistant: 'indigo', admin: 'amber' };
const STAFF_ROLES = ['dentist', 'dental_assistant', 'admin'];

const EMPTY_CREATE_FORM = { name: '', email: '', mobile_number: '', role: 'dentist' };
const EMPTY_EDIT_FORM = { name: '', email: '', mobile_number: '', role: '' };

function getInitials(name) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] || '';
  const last = parts.length > 1 ? parts[parts.length - 1][0] : '';
  return (first + last).toUpperCase();
}

function UserManagement() {
  const { user: currentUser } = useAuth();

  const [users, setUsers] = useState([]);
  const [meta, setMeta] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(10);
  const debounceRef = useRef(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState(EMPTY_CREATE_FORM);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');

  const [credentialsResult, setCredentialsResult] = useState(null); // { user, temporary_password }

  const [editUser, setEditUser] = useState(null);
  const [editForm, setEditForm] = useState(EMPTY_EDIT_FORM);
  const [editing, setEditing] = useState(false);
  const [editError, setEditError] = useState('');

  useEffect(() => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setSearch(searchInput.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(debounceRef.current);
  }, [searchInput]);

  useEffect(() => {
    setPage(1);
  }, [search, roleFilter, statusFilter, perPage]);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const result = await searchUsers({ search, role: roleFilter, status: statusFilter, page, per_page: perPage });
      setUsers(result.data);
      setMeta({
        current_page: result.current_page,
        last_page: result.last_page,
        per_page: result.per_page,
        total: result.total,
        from: result.from,
        to: result.to,
      });
    } catch {
      setError('Could not load users. Please refresh the page.');
    } finally {
      setLoading(false);
    }
  }, [search, roleFilter, statusFilter, page, perPage]);

  useEffect(() => {
    load();
  }, [load]);

  const openCreate = () => {
    setCreateForm(EMPTY_CREATE_FORM);
    setCreateError('');
    setCreateOpen(true);
  };

  const submitCreate = async () => {
    setCreateError('');
    setCreating(true);
    try {
      const result = await createStaffUser(createForm);
      setCreateOpen(false);
      setCredentialsResult(result);
      load();
    } catch (err) {
      setCreateError(err.response?.data?.message || 'Could not create this account.');
    } finally {
      setCreating(false);
    }
  };

  const openEdit = (row) => {
    setEditUser(row);
    setEditForm({ name: row.name, email: row.email, mobile_number: row.mobile_number || '', role: row.role });
    setEditError('');
  };

  const submitEdit = async () => {
    setEditError('');
    setEditing(true);
    try {
      await updateUser(editUser.id, {
        name: editForm.name.trim(),
        email: editForm.email.trim(),
        mobile_number: editForm.mobile_number.trim(),
        ...(editUser.role !== 'patient' ? { role: editForm.role } : {}),
      });
      setEditUser(null);
      load();
    } catch (err) {
      setEditError(err.response?.data?.message || 'Could not save these changes.');
    } finally {
      setEditing(false);
    }
  };

  const toggleStatus = async (row) => {
    const next = row.status === 'active' ? 'inactive' : 'active';
    const isDeactivating = next === 'inactive';

    const confirmed = await confirmAction({
      title: isDeactivating ? 'Deactivate this account?' : 'Reactivate this account?',
      text: `Are you sure you want to ${isDeactivating ? 'deactivate' : 'reactivate'} ${row.name}'s account?`,
      confirmButtonText: isDeactivating ? 'Deactivate' : 'Reactivate',
      confirmButtonColor: isDeactivating ? '#b42318' : '#2952e3',
    });
    if (!confirmed) return;

    try {
      await setUserStatus(row.id, next);
      load();
      showSuccessToast(next === 'active' ? 'Account reactivated.' : 'Account deactivated.');
    } catch (err) {
      showErrorToast(err.response?.data?.message || 'Could not update this account.');
    }
  };

  const columns = [
    {
      key: 'name',
      label: 'Name',
      minWidth: '26%',
      render: (row) => (
        <span className="cell-person">
          <span className="cell-avatar">{getInitials(row.name)}</span>
          <span className="cell-person-text">
            <span className="cell-person-name" title={row.name}>{row.name}</span>
            {row.id === currentUser?.id && <span className="cell-person-sub">You</span>}
          </span>
        </span>
      ),
    },
    {
      key: 'contact',
      label: 'Contact',
      minWidth: '26%',
      render: (row) => (
        <span className="cell-person-text">
          <span className="cell-person-name">{row.email}</span>
          {row.mobile_number && <span className="cell-person-sub">{row.mobile_number}</span>}
        </span>
      ),
    },
    {
      key: 'role',
      label: 'Role',
      minWidth: '16%',
      align: 'center',
      render: (row) => <StatusBadge status={ROLE_LABELS[row.role] || row.role} tone={ROLE_TONE[row.role]} />,
    },
    {
      key: 'status',
      label: 'Status',
      minWidth: '12%',
      align: 'center',
      render: (row) => <StatusBadge status={row.status === 'active' ? 'Active' : 'Inactive'} tone={row.status === 'active' ? 'green' : 'red'} />,
    },
    {
      key: 'actions',
      label: '',
      minWidth: '20%',
      align: 'right',
      render: (row) => (
        <div className="row-actions">
          <button type="button" className="dash-btn dash-btn--outline row-btn" onClick={() => openEdit(row)}>
            Edit
          </button>
          <button
            type="button"
            className={`dash-btn row-btn ${row.status === 'active' ? 'dash-btn--danger' : ''}`}
            onClick={() => toggleStatus(row)}
            disabled={row.id === currentUser?.id}
          >
            {row.status === 'active' ? 'Deactivate' : 'Activate'}
          </button>
        </div>
      ),
    },
  ];

  return (
    <div>
      <div className="section-card-header appt-page-header">
        <div>
          <h1 className="appt-page-title">User Management</h1>
          <p className="appt-page-subtitle">Manage every account in the system and provision new staff logins.</p>
        </div>
        <button type="button" className="dash-btn" onClick={openCreate}>
          + Add Staff Account
        </button>
      </div>

      <div className="section-card">
        <div className="appt-toolbar">
          <div className="filter-field filter-field--grow">
            <div className="filter-search">
              <SearchIcon />
              <input
                type="text"
                className="form-input"
                placeholder="Search by name or email…"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
              />
            </div>
          </div>
          <div className="filter-field">
            <select className="form-select" value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}>
              <option value="">All Roles</option>
              {Object.entries(ROLE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </div>
          <div className="filter-field">
            <select className="form-select" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="">All Statuses</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>
        </div>

        {loading ? (
          <Skeleton variant="row" count={6} />
        ) : error ? (
          <div className="dash-empty"><span className="dash-empty-title">{error}</span></div>
        ) : (
          <div className="appt-master-table">
            <DataTable columns={columns} rows={users} emptyMessage="No accounts match these filters." />
            <Pagination meta={meta} onPageChange={setPage} onPerPageChange={(n) => { setPerPage(n); setPage(1); }} itemLabel="account" />
          </div>
        )}
      </div>

      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Add Staff Account">
        {createError && <div className="profile-alert profile-alert--error">{createError}</div>}

        <label className="modal-field-label">Full Name</label>
        <input className="form-input" value={createForm.name} onChange={(e) => setCreateForm((p) => ({ ...p, name: e.target.value }))} />

        <label className="modal-field-label">Email Address</label>
        <input className="form-input" type="email" value={createForm.email} onChange={(e) => setCreateForm((p) => ({ ...p, email: e.target.value }))} />

        <label className="modal-field-label">Mobile Number</label>
        <input className="form-input" value={createForm.mobile_number} onChange={(e) => setCreateForm((p) => ({ ...p, mobile_number: e.target.value }))} placeholder="09XXXXXXXXX" />

        <label className="modal-field-label">Role</label>
        <select className="form-select" value={createForm.role} onChange={(e) => setCreateForm((p) => ({ ...p, role: e.target.value }))}>
          {STAFF_ROLES.map((r) => (
            <option key={r} value={r}>{ROLE_LABELS[r]}</option>
          ))}
        </select>

        <div className="modal-actions">
          <button type="button" className="dash-btn dash-btn--outline" onClick={() => setCreateOpen(false)}>Cancel</button>
          <button
            type="button"
            className="dash-btn"
            disabled={creating || !createForm.name.trim() || !createForm.email.trim() || !createForm.mobile_number.trim()}
            onClick={submitCreate}
          >
            {creating ? 'Creating…' : 'Create Account'}
          </button>
        </div>
      </Modal>

      <Modal open={!!credentialsResult} onClose={() => setCredentialsResult(null)} title="Account Created">
        {credentialsResult && (
          <>
            <p className="user-credentials-intro">
              Share these sign-in details with <strong>{credentialsResult.data.name}</strong>. This temporary password is
              shown only once — it won&apos;t be retrievable after you close this window.
            </p>
            <label className="modal-field-label">Email</label>
            <input className="form-input" value={credentialsResult.data.email} readOnly />
            <label className="modal-field-label">Temporary Password</label>
            <input className="form-input user-credentials-password" value={credentialsResult.temporary_password} readOnly />
            <div className="modal-actions">
              <button type="button" className="dash-btn" onClick={() => setCredentialsResult(null)}>Done</button>
            </div>
          </>
        )}
      </Modal>

      <Modal open={!!editUser} onClose={() => setEditUser(null)} title="Edit Account">
        {editError && <div className="profile-alert profile-alert--error">{editError}</div>}

        <label className="modal-field-label">Full Name</label>
        <input className="form-input" value={editForm.name} onChange={(e) => setEditForm((p) => ({ ...p, name: e.target.value }))} />

        <label className="modal-field-label">Email Address</label>
        <input className="form-input" type="email" value={editForm.email} onChange={(e) => setEditForm((p) => ({ ...p, email: e.target.value }))} />

        <label className="modal-field-label">Mobile Number</label>
        <input className="form-input" value={editForm.mobile_number} onChange={(e) => setEditForm((p) => ({ ...p, mobile_number: e.target.value }))} />

        {editUser && editUser.role !== 'patient' && (
          <>
            <label className="modal-field-label">Role</label>
            <select className="form-select" value={editForm.role} onChange={(e) => setEditForm((p) => ({ ...p, role: e.target.value }))}>
              {STAFF_ROLES.map((r) => (
                <option key={r} value={r}>{ROLE_LABELS[r]}</option>
              ))}
            </select>
          </>
        )}

        <div className="modal-actions">
          <button type="button" className="dash-btn dash-btn--outline" onClick={() => setEditUser(null)}>Cancel</button>
          <button type="button" className="dash-btn" disabled={editing} onClick={submitEdit}>
            {editing ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </Modal>
    </div>
  );
}

export default UserManagement;
