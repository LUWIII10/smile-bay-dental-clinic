import { useCallback, useEffect, useState } from 'react';
import { getActivityLog } from '../../api/activityLog';
import DataTable from './components/DataTable';
import Pagination from './components/Pagination';
import Skeleton from './components/Skeleton';
import PageHeader from './components/PageHeader';
import FilterDropdown from './components/FilterDropdown';
import DateRangePicker from './components/DateRangePicker';
import { ActivityIcon, SearchIcon, UsersIcon } from './icons';
import { getAvatarUrl } from './avatarUtils';
import './dashboards.css';
import './Appointments.css';

const SEARCH_DEBOUNCE_MS = 400;

const ROLE_OPTIONS = [
  { value: '', label: 'All Roles', dot: '#94a3b8' },
  { value: 'patient', label: 'Patient', dot: '#2952e3' },
  { value: 'dentist', label: 'Dentist', dot: '#15803d' },
  { value: 'dental_assistant', label: 'Dental Assistant', dot: '#4338ca' },
  { value: 'admin', label: 'Administrator', dot: '#b45309' },
];

// Kept in sync with StaffVerificationController's sibling constant —
// ActivityLogController::ACTIONS — every value here must be a real key the
// backend actually validates against, or the filter just comes back empty.
// tone drives the pill's background/text color, icon its little glyph —
// both reused verbatim from the mockup's own color language (blue =
// appointment actions, indigo = account/profile, green = verification/
// positive outcomes, red = cancellations/restrictions, gray = neutral).
const ACTION_META = {
  account_created: { label: 'Account Created', tone: 'gray' },
  staff_account_created: { label: 'Staff Account Created', tone: 'gray' },
  password_changed: { label: 'Password Changed', tone: 'indigo' },
  profile_updated: { label: 'Profile Updated', tone: 'indigo' },
  appointment_booked: { label: 'Appointment Booked', tone: 'blue' },
  appointment_cancelled: { label: 'Appointment Cancelled', tone: 'red' },
  appointment_rejected: { label: 'Appointment Rejected', tone: 'red' },
  hmo_verified: { label: 'HMO Coverage Verified', tone: 'green' },
  hmo_info_updated: { label: 'HMO Info Updated', tone: 'indigo' },
  account_restricted: { label: 'Account Restricted', tone: 'red' },
  restriction_lifted: { label: 'Restriction Lifted', tone: 'green' },
  account_activated: { label: 'Account Activated', tone: 'green' },
  account_deactivated: { label: 'Account Deactivated', tone: 'red' },
};

const TONE_COLORS = {
  blue: { bg: '#dbeafe', text: '#1d4ed8' },
  indigo: { bg: '#e0e7ff', text: '#4338ca' },
  green: { bg: '#dcfce7', text: '#15803d' },
  red: { bg: '#fee2e2', text: '#b42318' },
  gray: { bg: '#f1f5f9', text: '#334155' },
};

const ACTION_OPTIONS = [
  { value: '', label: 'All Activity Types', dot: '#94a3b8' },
  ...Object.entries(ACTION_META).map(([value, meta]) => ({
    value,
    label: meta.label,
    dot: TONE_COLORS[meta.tone].text,
  })),
];

const ROLE_LABELS = { patient: 'Patient', dentist: 'Dentist', dental_assistant: 'Dental Assistant', admin: 'Administrator' };

function getInitials(name) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] || '';
  const last = parts.length > 1 ? parts[parts.length - 1][0] : '';
  return (first + last).toUpperCase();
}

function formatDateTime(iso) {
  const d = new Date(iso);
  const absolute = d.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });

  const diffMs = Date.now() - d.getTime();
  const diffMins = Math.round(diffMs / 60000);
  let relative;
  if (diffMins < 1) relative = 'just now';
  else if (diffMins < 60) relative = `${diffMins} min${diffMins === 1 ? '' : 's'} ago`;
  else if (diffMins < 1440) relative = `${Math.round(diffMins / 60)} hr${Math.round(diffMins / 60) === 1 ? '' : 's'} ago`;
  else if (diffMins < 2880) relative = 'Yesterday';
  else relative = `${Math.round(diffMins / 1440)} days ago`;

  return { absolute, relative };
}

function ActivityLog() {
  const [rows, setRows] = useState([]);
  const [meta, setMeta] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [role, setRole] = useState('');
  const [action, setAction] = useState('');
  const [range, setRange] = useState({ from: '', to: '' });
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(15);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, role, action, range.from, range.to]);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await getActivityLog({
        role,
        action,
        search: debouncedSearch,
        dateFrom: range.from,
        dateTo: range.to,
        page,
        perPage,
      });
      setRows(data.data);
      setMeta(data);
    } catch {
      setError('Could not load the activity log. Please refresh the page.');
    } finally {
      setLoading(false);
    }
  }, [role, action, debouncedSearch, range.from, range.to, page, perPage]);

  useEffect(() => {
    load();
  }, [load]);

  const columns = [
    {
      key: 'user',
      label: 'User',
      headerColor: '#1d4ed8',
      minWidth: '24%',
      minWidthPx: '190px',
      render: (row) => {
        const name = row.actor?.name || 'System';
        const roleLabel = row.actor ? (ROLE_LABELS[row.actor.role] || row.actor.role) : 'Automatic';
        const avatarUrl = row.actor ? getAvatarUrl(row.actor) : null;
        return (
          <span className="cell-person">
            <span className="cell-avatar">
              {avatarUrl ? <img src={avatarUrl} alt="" /> : (row.actor ? getInitials(name) : '⚙')}
            </span>
            <span className="cell-person-text">
              <span className="cell-person-name">{name}</span>
              <span className="cell-person-sub">{roleLabel}</span>
            </span>
          </span>
        );
      },
    },
    {
      key: 'activity',
      label: 'Activity',
      headerColor: '#4338ca',
      minWidth: '20%',
      minWidthPx: '160px',
      render: (row) => {
        const meta = ACTION_META[row.action] || { label: row.action, tone: 'gray' };
        const colors = TONE_COLORS[meta.tone];
        return (
          <span
            style={{
              display: 'inline-flex', alignItems: 'center', padding: '5px 12px', borderRadius: 999,
              fontSize: '0.7rem', fontWeight: 700, whiteSpace: 'nowrap',
              background: colors.bg, color: colors.text,
            }}
          >
            {meta.label}
          </span>
        );
      },
    },
    {
      key: 'description',
      label: 'Details',
      headerColor: '#15803d',
      minWidth: '38%',
      minWidthPx: '220px',
      clampLines: 2,
      render: (row) => row.description,
    },
    {
      key: 'created_at',
      label: 'Date & Time',
      headerColor: '#b45309',
      minWidth: '18%',
      minWidthPx: '160px',
      render: (row) => {
        const { absolute, relative } = formatDateTime(row.created_at);
        return (
          <span className="cell-appointment">
            <span className="cell-appointment-date">{absolute}</span>
            <span className="cell-appointment-time">{relative}</span>
          </span>
        );
      },
    },
  ];

  return (
    <div>
      <PageHeader
        icon={ActivityIcon}
        title="Activity Log"
        subtitle="Every account and booking action taken across the system, most recent first."
      />

      <div className="appt-toolbar">
        <div className="filter-field filter-field--grow">
          <div className="filter-search">
            <SearchIcon />
            <input
              type="text"
              className="form-input"
              placeholder="Search by name..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        <FilterDropdown icon={<UsersIcon />} options={ROLE_OPTIONS} value={role} onChange={setRole} />
        <FilterDropdown icon={<ActivityIcon />} options={ACTION_OPTIONS} value={action} onChange={setAction} />

        <DateRangePicker
          mode="range"
          value={range}
          onChange={setRange}
        />
      </div>

      {loading ? (
        <Skeleton variant="row" count={6} />
      ) : error ? (
        <div className="dash-empty">
          <span className="dash-empty-title">{error}</span>
        </div>
      ) : (
        <>
          <DataTable columns={columns} rows={rows} emptyMessage="No activity recorded yet." />
          <Pagination
            meta={meta}
            onPageChange={setPage}
            onPerPageChange={(n) => { setPerPage(n); setPage(1); }}
            itemLabel="activity"
          />
        </>
      )}
    </div>
  );
}

export default ActivityLog;
