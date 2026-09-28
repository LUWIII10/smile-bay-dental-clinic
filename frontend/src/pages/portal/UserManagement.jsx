import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { searchUsers, createStaffUser, updateUser, setUserStatus, unrestrictBooking } from '../../api/userManagement';
import DataTable from './components/DataTable';
import Pagination from './components/Pagination';
import Skeleton from './components/Skeleton';
import StatusBadge from './components/StatusBadge';
import Modal from './components/Modal';
import PageHeader from './components/PageHeader';
import { SearchIcon, UsersIcon } from './icons';
import { showSuccessToast, showErrorToast, confirmAction } from '../../utils/toast';
import { getAvatarUrl } from './avatarUtils';
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

// "1st"/"2nd"/"3rd"/"4th"... — patients.restriction_count is how many
// times CancellationPolicyService has ever set booking_restricted_at on
// this patient (never decremented by Lift Restriction), so this reads as
// "this is the Nth time", not just a bare count.
function ordinal(n) {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  switch (n % 10) {
    case 1: return `${n}st`;
    case 2: return `${n}nd`;
    case 3: return `${n}rd`;
    default: return `${n}th`;
  }
}

function UserManagement() {
  const { user: currentUser } = useAuth();
  // Arriving from AdminDashboard's "Restricted Accounts" card — same
  // navigate(path, { state }) → useLocation().state handoff pattern
  // DentistSchedule.jsx uses for Patient Records, just read once on mount
  // rather than kept "live" (re-clicking the same card while already here
  // wouldn't re-trigger a state change react-router would notice anyway).
  const location = useLocation();
  const incoming = location.state || {};

  const [users, setUsers] = useState([]);
  const [meta, setMeta] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState(incoming.roleFilter || '');
  const [statusFilter, setStatusFilter] = useState(incoming.statusFilter || '');
  // '' = default alphabetical order; 'cancellations_desc' = worst
  // cancellers first — only meaningful (and only shown as a column) while
  // roleFilter === 'patient', see the Cancellations column below.
  const [sort, setSort] = useState('');
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
  }, [search, roleFilter, statusFilter, sort, perPage]);

  // Switching away from the patient filter drops a stale cancellations-sort
  // — the Cancellations column itself stays visible for every role now, but
  // every non-patient row reads as a dash (n/a), so sorting by it outside
  // the patient filter would just be a no-op ordering, not a real sort.
  useEffect(() => {
    if (roleFilter !== 'patient') setSort('');
  }, [roleFilter]);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const result = await searchUsers({ search, role: roleFilter, status: statusFilter, sort, page, per_page: perPage });
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
  }, [search, roleFilter, statusFilter, sort, page, perPage]);

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

  // Lifts the automatic 3-strike booking restriction — separate action from
  // toggleStatus above, since a restricted account is still fully active
  // and logged-in-able; this only restores self-service booking. Repeat
  // cases (restriction_count > 1) get an extra line so the admin sees the
  // pattern before deciding, not just the current single event — a
  // first-time case stays as the plain original text, no reason to flag it.
  const unrestrictAccount = async (row) => {
    const restrictionCount = row.patient?.restriction_count ?? 0;
    const baseText = `${row.name} will be able to book new appointments again. They'll be notified.`;
    const text = restrictionCount > 1
      ? `${baseText} This is the ${ordinal(restrictionCount)} time this patient has been restricted.`
      : baseText;

    const confirmed = await confirmAction({
      title: 'Lift booking restriction?',
      text,
      confirmButtonText: 'Lift Restriction',
      confirmButtonColor: '#2952e3',
    });
    if (!confirmed) return;

    try {
      await unrestrictBooking(row.id);
      load();
      showSuccessToast('Booking restriction lifted.');
    } catch (err) {
      showErrorToast(err.response?.data?.message || 'Could not lift this restriction.');
    }
  };

  const toggleCancellationSort = () => setSort((s) => (s === 'cancellations_desc' ? '' : 'cancellations_desc'));

  const columns = [
    {
      key: 'name',
      label: 'Name',
      minWidth: '22%',
      render: (row) => {
        const avatarUrl = getAvatarUrl(row);
        return (
          <span className="cell-person">
            <span className="cell-avatar">
              {avatarUrl ? <img src={avatarUrl} alt="" /> : getInitials(row.name)}
            </span>
            <span className="cell-person-text">
              <span className="cell-person-name" title={row.name}>{row.name}</span>
              {row.id === currentUser?.id && <span className="cell-person-sub">You</span>}
            </span>
          </span>
        );
      },
    },
    {
      key: 'contact',
      label: 'Contact',
      minWidth: '22%',
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
      minWidth: '14%',
      align: 'center',
      render: (row) => <StatusBadge status={ROLE_LABELS[row.role] || row.role} tone={ROLE_TONE[row.role]} />,
    },
    {
      key: 'status',
      label: 'Status',
      minWidth: '12%',
      // 12% of a narrow table is well under what the "Booking Restricted"
      // pill needs — without a floor, table-layout: fixed (already active
      // on this table via the other columns' own minWidth) doesn't expand
      // the column to fit it, it just lets the pill visually spill out
      // past the column boundary into "Cancellations" next to it. This
      // floor keeps both badges inside their own column at any width; below
      // that, .data-table-wrap's existing horizontal scroll takes over
      // instead of content silently overlapping.
      minWidthPx: '160px',
      align: 'center',
      // Automatic 3-strike policy (CancellationPolicyService) — a lighter,
      // earlier state than Inactive: still logged-in-able, just blocked
      // from new self-service bookings. "Restricted Account" replaces
      // "Active" here rather than stacking alongside it — the account is
      // still genuinely active underneath (row.status is untouched), but
      // showing both badges together read as confusing/misaligned, and
      // the restriction is the more actionable fact for an admin scanning
      // this column.
      render: (row) => {
        const isRestricted = row.status === 'active' && row.patient?.booking_restricted_at;
        const restrictionCount = row.patient?.restriction_count ?? 0;
        return (
          <span className="status-cell-stack">
            <StatusBadge
              status={isRestricted ? 'Restricted Account' : (row.status === 'active' ? 'Active' : 'Inactive')}
              tone={isRestricted ? 'amber' : (row.status === 'active' ? 'green' : 'red')}
              className={isRestricted ? 'status-badge--wrap' : undefined}
            />
            {isRestricted && restrictionCount > 0 && (
              <span className={`restriction-count-caption restriction-count-caption--${restrictionCount >= 3 ? 'high' : restrictionCount === 2 ? 'mid' : 'low'}`}>
                {ordinal(restrictionCount)} time restricted
              </span>
            )}
          </span>
        );
      },
    },
    // Always visible now — was patient-role-filter-only, but that meant an
    // admin had to know to filter to Patient first before this (or a
    // frequent canceller) was visible at all. A dentist/assistant/admin
    // still never has a real count (their patientAppointments relation is
    // always empty) — shown as a plain dash for those rows instead of a
    // misleading "0" badge. Sort control only makes sense scoped to
    // patients (see toggleCancellationSort's own reset-on-role-change
    // effect above), so it stays even though the column itself doesn't.
    {
      key: 'cancellations',
      label: (
        <button type="button" className="th-sort-btn" onClick={toggleCancellationSort}>
          Cancellations
          <span className={`th-sort-arrow${sort === 'cancellations_desc' ? ' th-sort-arrow--asc' : ''}`}>&#9662;</span>
        </button>
      ),
      mobileLabel: 'Cancellations',
      minWidth: '12%',
      align: 'center',
      render: (row) => {
        if (row.role !== 'patient') return <span className="cancellation-count-na">&mdash;</span>;
        const count = row.cancellation_count ?? 0;
        const tone = count >= 3 ? 'red' : count >= 1 ? 'amber' : 'gray';
        return <StatusBadge status={String(count)} tone={tone} />;
      },
    },
    {
      key: 'actions',
      label: '',
      // A restricted patient's row now has 3 buttons (Edit/Lift Restriction/
      // Deactivate), not 2 — 20% was already tight for that case and, with
      // .row-actions's own flex-wrap, meant "Deactivate" could drop alone
      // onto its own line while the other two stayed put. Widened (and
      // Name/Contact/Role trimmed slightly to compensate) so 3 buttons
      // comfortably sit on one line at normal widths instead.
      minWidth: '26%',
      align: 'right',
      render: (row) => {
        const isRestricted = row.status === 'active' && row.patient?.booking_restricted_at;
        return (
          <div className="row-actions">
            <button type="button" className="dash-btn dash-btn--outline row-btn" onClick={() => openEdit(row)}>
              Edit
            </button>
            {isRestricted && (
              <button type="button" className="dash-btn row-btn" onClick={() => unrestrictAccount(row)}>
                Lift Restriction
              </button>
            )}
            <button
              type="button"
              className={`dash-btn row-btn ${row.status === 'active' ? 'dash-btn--danger' : ''}`}
              onClick={() => toggleStatus(row)}
              disabled={row.id === currentUser?.id}
            >
              {row.status === 'active' ? 'Deactivate' : 'Activate'}
            </button>
          </div>
        );
      },
    },
  ];

  return (
    <div>
      <PageHeader
        icon={UsersIcon}
        title="User Management"
        subtitle="Manage every account in the system and provision new staff logins."
      >
        <button type="button" className="dash-btn" onClick={openCreate}>
          + Add Staff Account
        </button>
      </PageHeader>

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
              <option value="restricted">Restricted</option>
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
