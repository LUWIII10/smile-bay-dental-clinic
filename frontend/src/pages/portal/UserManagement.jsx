import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import {
  searchUsers, createStaffUser, updateUser, setUserStatus, unrestrictBooking,
  archivePatient, restorePatient, getDormantPatientCount,
} from '../../api/userManagement';
import DataTable from './components/DataTable';
import Pagination from './components/Pagination';
import Skeleton from './components/Skeleton';
import StatusBadge from './components/StatusBadge';
import Modal from './components/Modal';
import PageHeader from './components/PageHeader';
import { SearchIcon, UsersIcon, CheckCircleIcon, ArchiveIcon, AlertIcon } from './icons';
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

  // "Review N Patients" — a separate, orthogonal filter from statusFilter
  // (see searchUsers()'s own comment on why), so a patient can be dormant
  // regardless of which status they're currently sitting in.
  const [dormantOnly, setDormantOnly] = useState(false);
  const [dormantCount, setDormantCount] = useState(0);
  const [bannerDismissed, setBannerDismissed] = useState(false);

  const [archiveTarget, setArchiveTarget] = useState(null);
  const [archiveReason, setArchiveReason] = useState('');
  const [archiving, setArchiving] = useState(false);
  const [archiveError, setArchiveError] = useState('');

  useEffect(() => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setSearch(searchInput.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(debounceRef.current);
  }, [searchInput]);

  useEffect(() => {
    setPage(1);
  }, [search, roleFilter, statusFilter, sort, perPage, dormantOnly]);

  // Loaded once on mount, then refreshed after any archive/restore — the
  // banner's own number and what "Review N Patients" shows must never
  // silently drift apart from each other.
  const loadDormantCount = useCallback(() => {
    getDormantPatientCount().then(setDormantCount).catch(() => {});
  }, []);

  useEffect(() => {
    loadDormantCount();
  }, [loadDormantCount]);

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
      const result = await searchUsers({ search, role: roleFilter, status: statusFilter, sort, dormant: dormantOnly, page, per_page: perPage });
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
  }, [search, roleFilter, statusFilter, sort, dormantOnly, page, perPage]);

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

  // Same dormant criteria as UserManagementController::applyDormantScope()
  // — no appointment (any status) in DORMANT_MONTHS, and nothing upcoming.
  // Only meaningful for a patient who isn't already archived; row.patient
  // is absent entirely for non-patient roles.
  const isDormant = (row) => {
    if (row.role !== 'patient' || !row.patient || row.patient.archived_at) return false;
    if (row.has_upcoming_appointment) return false;
    if (!row.last_appointment_date) return true;
    const cutoff = new Date();
    cutoff.setMonth(cutoff.getMonth() - 12);
    return new Date(row.last_appointment_date) < cutoff;
  };

  const formatLastVisit = (dateStr) => {
    if (!dateStr) return 'Never had an appointment';
    const then = new Date(dateStr);
    const months = Math.max(0, Math.floor((Date.now() - then.getTime()) / (1000 * 60 * 60 * 24 * 30.44)));
    if (months < 1) return 'No visit in under a month';
    if (months < 12) return `No visit in ${months} mo${months === 1 ? '' : 's'}`;
    const years = Math.floor(months / 12);
    const remMonths = months % 12;
    return `No visit in ${years} yr${years === 1 ? '' : 's'}${remMonths ? ` ${remMonths} mo${remMonths === 1 ? '' : 's'}` : ''}`;
  };

  const openArchive = (row) => {
    setArchiveError('');
    setArchiveReason('');
    setArchiveTarget(row);
  };

  const submitArchive = async () => {
    if (!archiveTarget) return;
    setArchiving(true);
    setArchiveError('');
    try {
      await archivePatient(archiveTarget.id, archiveReason.trim() || null);
      setArchiveTarget(null);
      load();
      loadDormantCount();
      showSuccessToast(`${archiveTarget.name} moved to Archived.`);
    } catch (err) {
      setArchiveError(err.response?.data?.message || 'Could not archive this patient.');
    } finally {
      setArchiving(false);
    }
  };

  // No confirmation dialog here on purpose — unlike archiving, restoring
  // has nothing risky to weigh (see restorePatient()'s own comment).
  const restoreAccount = async (row) => {
    try {
      await restorePatient(row.id);
      load();
      loadDormantCount();
      showSuccessToast(`${row.name} restored to the active list.`);
    } catch (err) {
      showErrorToast(err.response?.data?.message || 'Could not restore this patient.');
    }
  };

  const openDormantReview = () => {
    setDormantOnly(true);
    setStatusFilter('');
    setRoleFilter('patient');
  };

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
        const isArchived = !!row.patient?.archived_at;

        // Archived is orthogonal to the account's own status (see
        // Patient::isArchived()'s doc comment) — shown in place of Active/
        // Inactive here since "archived" is the more useful fact to a
        // reviewer looking at the Archived filter specifically, same
        // "replace rather than stack" reasoning Restricted already uses.
        if (isArchived) {
          return (
            <span className="status-cell-stack">
              <StatusBadge status="Archived" tone="gray" />
              <span className="restriction-count-caption restriction-count-caption--low">
                {new Date(row.patient.archived_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                {row.patient.archived_by?.name ? ` by ${row.patient.archived_by.name}` : ''}
              </span>
            </span>
          );
        }

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
            {!isRestricted && isDormant(row) && (
              <span className="restriction-count-caption restriction-count-caption--mid">
                {formatLastVisit(row.last_appointment_date)}
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
        const isArchived = !!row.patient?.archived_at;

        // Archived rows: Restore replaces Deactivate one-for-one (same
        // shape, same 2 buttons every other row already has) — no
        // confirmation needed, see restorePatient()'s own comment.
        if (isArchived) {
          return (
            <div className="row-actions">
              <button type="button" className="dash-btn dash-btn--outline row-btn" onClick={() => openEdit(row)}>
                Edit
              </button>
              <button type="button" className="dash-btn row-btn dash-btn--success" onClick={() => restoreAccount(row)}>
                <CheckCircleIcon /> Restore
              </button>
            </div>
          );
        }

        // Restricted rows get their own grouped layout — Lift Restriction is
        // the one action that only exists BECAUSE of this state, so it
        // stands alone, full-width, solid; Edit/Deactivate are routine
        // account actions every row has, demoted to a smaller shared row
        // underneath (Deactivate outline instead of solid so it doesn't
        // visually compete with Lift Restriction for attention). Approved
        // design: https://claude.ai/artifact/HWLfvwQQpvcD4p3qNpiEd4 (Option A)
        // — the non-restricted layout below is unchanged on purpose.
        if (isRestricted) {
          return (
            <div className="row-actions-grouped">
              <button type="button" className="dash-btn row-btn row-btn--lift" onClick={() => unrestrictAccount(row)}>
                <CheckCircleIcon /> Lift Restriction
              </button>
              <div className="row-actions-secondary">
                <button type="button" className="dash-btn dash-btn--outline row-btn" onClick={() => openEdit(row)}>
                  Edit
                </button>
                <button
                  type="button"
                  className="dash-btn dash-btn--outline-danger row-btn"
                  onClick={() => toggleStatus(row)}
                  disabled={row.id === currentUser?.id}
                >
                  Deactivate
                </button>
              </div>
            </div>
          );
        }

        // Archive only ever shows on the rows it's actually relevant to —
        // every other row (the overwhelming majority) renders exactly as
        // before, same 2 buttons, nothing new to notice.
        return (
          <div className="row-actions">
            <button type="button" className="dash-btn dash-btn--outline row-btn" onClick={() => openEdit(row)}>
              Edit
            </button>
            {isDormant(row) && (
              <button type="button" className="dash-btn dash-btn--outline row-btn" onClick={() => openArchive(row)}>
                <ArchiveIcon /> Archive
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
            <select
              className="form-select"
              value={statusFilter}
              onChange={(e) => { setStatusFilter(e.target.value); setDormantOnly(false); }}
            >
              <option value="">All Statuses</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="restricted">Restricted</option>
              <option value="archived">Archived</option>
            </select>
          </div>
        </div>

        {dormantOnly && (
          <div className="dormant-review-bar">
            <span>
              <ArchiveIcon /> Reviewing {dormantCount} dormant patient{dormantCount === 1 ? '' : 's'} — none of this happens automatically.
            </span>
            <button type="button" className="dash-btn dash-btn--outline" onClick={() => setDormantOnly(false)}>
              &larr; Back to All Patients
            </button>
          </div>
        )}

        {!dormantOnly && statusFilter !== 'archived' && dormantCount > 0 && !bannerDismissed && (
          <div className="dormant-suggestion-banner">
            <span className="dormant-suggestion-icon"><AlertIcon /></span>
            <div className="dormant-suggestion-text">
              <p className="dormant-suggestion-title">
                {dormantCount} patient{dormantCount === 1 ? '' : 's'} haven&rsquo;t visited in over 12 months
              </p>
              <p className="dormant-suggestion-sub">
                Just a suggestion — nothing happens automatically. Review and archive only the ones you choose.
              </p>
            </div>
            <button type="button" className="dash-btn dash-btn--amber" onClick={openDormantReview}>
              Review {dormantCount} Patient{dormantCount === 1 ? '' : 's'}
            </button>
            <button
              type="button"
              className="dormant-suggestion-dismiss"
              aria-label="Dismiss"
              onClick={() => setBannerDismissed(true)}
            >
              &times;
            </button>
          </div>
        )}

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

      <Modal open={!!archiveTarget} onClose={() => setArchiveTarget(null)} title="Archive Patient?">
        {archiveTarget && (
          <>
            <div className="archive-target-chip">
              <span className="cell-avatar">{getInitials(archiveTarget.name)}</span>
              <div>
                <div className="archive-target-name">{archiveTarget.name}</div>
                <div className="archive-target-hint">{formatLastVisit(archiveTarget.last_appointment_date)}</div>
              </div>
            </div>

            <div className="archive-checklist-label">What happens when you archive</div>
            <div className="archive-checklist">
              <div className="archive-check-row">
                <span className="archive-check-icon"><CheckCircleIcon /></span>
                Nothing is deleted — records, history, everything stays
              </div>
              <div className="archive-check-row">
                <span className="archive-check-icon"><CheckCircleIcon /></span>
                Hidden from the main Active list only
              </div>
              <div className="archive-check-row">
                <span className="archive-check-icon"><CheckCircleIcon /></span>
                Restorable any time from the "Archived" filter
              </div>
              <div className="archive-check-row">
                <span className="archive-check-icon"><CheckCircleIcon /></span>
                Auto-restored the moment they book a new visit
              </div>
            </div>

            <label className="modal-field-label">
              Reason <span className="archive-reason-optional">(optional, for your own reference)</span>
            </label>
            <textarea
              className="form-textarea"
              placeholder="e.g. Moved to another city, per patient's phone call."
              value={archiveReason}
              onChange={(e) => setArchiveReason(e.target.value)}
            />

            {archiveError && <p className="modal-field-error">{archiveError}</p>}

            <div className="modal-actions">
              <button type="button" className="dash-btn dash-btn--outline" onClick={() => setArchiveTarget(null)}>
                Cancel
              </button>
              <button type="button" className="dash-btn dash-btn--archive-confirm" disabled={archiving} onClick={submitArchive}>
                <ArchiveIcon /> {archiving ? 'Archiving…' : 'Archive Patient'}
              </button>
            </div>
          </>
        )}
      </Modal>
    </div>
  );
}

export default UserManagement;
