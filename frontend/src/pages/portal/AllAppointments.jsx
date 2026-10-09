import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  getAllAppointments,
  getAppointmentStats,
  getDentists,
  getServices,
  cancelAppointmentAsStaff,
  markNoShow,
} from '../../api/appointments';
import StatusBadge from './components/StatusBadge';
import StatCard from './components/StatCard';
import DataTable from './components/DataTable';
import Skeleton from './components/Skeleton';
import WalkInBookingModal from './components/WalkInBookingModal';
import AppointmentDetailModal from './components/AppointmentDetailModal';
import ActionMenu from './components/ActionMenu';
import Pagination from './components/Pagination';
import RejectionModal from './components/RejectionModal';
import PageHeader from './components/PageHeader';
import FilterDropdown from './components/FilterDropdown';
import {
  CalendarIcon, CheckCircleIcon, ClockIcon, XCircleIcon, SearchIcon, EyeIcon, CashIcon, ShieldIcon, UserIcon,
} from './icons';
import { formatDateShort, formatTime12h, toLocalDate } from './dateTimeUtils';
import { showSuccessToast, showErrorToast, confirmAction } from '../../utils/toast';
import './dashboards.css';
import './Appointments.css';

// Dot colors mirror StatusBadge's own tone mapping (confirmed/completed
// green, pending amber, cancelled/rejected red) so a status reads the
// same color in this filter as it does on the row badge it's filtering.
const STATUS_OPTIONS = [
  { value: '', label: 'All Statuses', dot: '#94a3b8' },
  { value: 'confirmed', label: 'Confirmed', dot: '#15803d' },
  { value: 'pending_verification', label: 'Pending', dot: '#b45309' },
  { value: 'cancelled', label: 'Cancelled', dot: '#b42318' },
  { value: 'rejected', label: 'Rejected', dot: '#b42318' },
  { value: 'completed', label: 'Completed', dot: '#15803d' },
];

const PAYMENT_TYPE_OPTIONS = [
  { value: '', label: 'All Payments', dot: '#94a3b8' },
  { value: 'cash', label: 'Cash', dot: '#15803d' },
  { value: 'hmo', label: 'HMO', dot: '#2952e3' },
];

const SEARCH_DEBOUNCE_MS = 400;

// Icon shown inside the status pill — StatusBadge's own color mapping is
// untouched, this is purely additive (icon prop is optional, every other
// page using StatusBadge doesn't pass one).
const STATUS_ICON = {
  confirmed: CheckCircleIcon,
  pending_verification: ClockIcon,
  cancelled: XCircleIcon,
  rejected: XCircleIcon,
  completed: CheckCircleIcon,
  no_show: XCircleIcon,
};

function getInitials(name) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] || '';
  const last = parts.length > 1 ? parts[parts.length - 1][0] : '';
  return (first + last).toUpperCase();
}

// "Sep 12 – Sep 16, 2026" for the date-range filter trigger — year once,
// at the end, not repeated on both sides like formatDateShort() would give
// if called twice. toLocalDate() (not a raw `new Date(str)`) because these
// are plain "YYYY-MM-DD" values typed into a date input, and parsing a
// bare date string with `new Date()` reads it as UTC midnight — safe here
// only by accident of the viewer's timezone, same class of bug already
// fixed elsewhere in this app for API-sourced dates.
function formatDateRangeLabel(from, to) {
  if (!from && !to) return null;
  const short = (d) => toLocalDate(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const full = (d) => toLocalDate(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  if (from && to) return `${short(from)} – ${full(to)}`;
  return full(from || to);
}

// A confirmed/pending appointment whose date has already passed — the
// dentist/staff never recorded what actually happened. Mirrors the same
// "Awaiting Update" rule used on the patient-facing My Appointments page,
// so this file's own definition stays in sync with that one rather than
// importing across the patient/staff boundary.
function isOverdueUnresolved(row) {
  if (!['confirmed', 'pending_verification'].includes(row.status)) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return toLocalDate(row.appointment_date) < today;
}

function AllAppointments() {
  const [appointments, setAppointments] = useState([]);
  const [meta, setMeta] = useState(null);
  const [dentists, setDentists] = useState([]);
  const [services, setServices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [stats, setStats] = useState(null);
  const [statsLoading, setStatsLoading] = useState(true);

  const [status, setStatus] = useState('');
  const [dentistId, setDentistId] = useState('');
  const [paymentType, setPaymentType] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [overdueOnly, setOverdueOnly] = useState(false);

  // Date-range popover — draft values only; dateFrom/dateTo (the ones that
  // actually drive the fetch below) are only touched by Apply/Clear, never
  // by typing in the popover. Same portal + fixed-position + mousedown
  // pattern as ActionMenu/NotificationBell.
  const [dateRangeOpen, setDateRangeOpen] = useState(false);
  const [dateRangePosition, setDateRangePosition] = useState(null);
  const [draftDateFrom, setDraftDateFrom] = useState('');
  const [draftDateTo, setDraftDateTo] = useState('');
  const dateRangeTriggerRef = useRef(null);
  const dateRangeDropdownRef = useRef(null);

  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState('date_desc');
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(10);

  const [walkInOpen, setWalkInOpen] = useState(false);
  const [selectedSlotData, setSelectedSlotData] = useState(null);
  const [detailAppointmentId, setDetailAppointmentId] = useState(null);

  const [cancelTarget, setCancelTarget] = useState(null);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelling, setCancelling] = useState(false);

  const debounceRef = useRef(null);

  useEffect(() => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setSearch(searchInput.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(debounceRef.current);
  }, [searchInput]);

  // Any filter/sort change invalidates the current page — landing on (say)
  // page 4 of a now-3-page result set would just render empty.
  useEffect(() => {
    setPage(1);
  }, [status, dentistId, paymentType, dateFrom, dateTo, overdueOnly, search, sort, perPage]);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const result = await getAllAppointments({
        status,
        dentist_id: dentistId,
        payment_type: paymentType,
        date_from: dateFrom,
        date_to: dateTo,
        overdue: overdueOnly || undefined,
        search,
        sort,
        per_page: perPage,
        page,
      });
      setAppointments(result.data);
      setMeta({
        current_page: result.current_page,
        last_page: result.last_page,
        per_page: result.per_page,
        total: result.total,
        from: result.from,
        to: result.to,
      });
    } catch {
      setError('Could not load appointments. Please refresh the page.');
    } finally {
      setLoading(false);
    }
  }, [status, dentistId, paymentType, dateFrom, dateTo, overdueOnly, search, sort, perPage, page]);

  useEffect(() => {
    load();
  }, [load]);

  // Independent of the table's filters/pagination — these are the page
  // header's month-scoped totals, not a summary of whatever's currently
  // filtered. Re-run after any action that changes appointment counts
  // (cancel, walk-in), not just on mount.
  const loadStats = useCallback(async () => {
    setStatsLoading(true);
    try {
      setStats(await getAppointmentStats());
    } catch {
      // Stat row just stays at its zero/loading state — not worth a
      // page-level error for a header summary.
    } finally {
      setStatsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  useEffect(() => {
    (async () => {
      try {
        const [dentistList, serviceList] = await Promise.all([getDentists(), getServices()]);
        setDentists(dentistList);
        setServices(serviceList);
      } catch {
        // Filters/walk-in just degrade to fewer options.
      }
    })();
  }, []);

  const clearFilters = () => {
    setStatus('');
    setDentistId('');
    setPaymentType('');
    setDateFrom('');
    setDateTo('');
    setOverdueOnly(false);
    setSearchInput('');
    setSearch('');
  };

  const hasActiveFilters = status || dentistId || paymentType || dateFrom || dateTo || overdueOnly || search;

  const openDateRange = () => {
    // Seed the draft from whatever's currently applied, not from whatever
    // was left over in the draft from a previous open-then-cancel.
    setDraftDateFrom(dateFrom);
    setDraftDateTo(dateTo);
    const rect = dateRangeTriggerRef.current.getBoundingClientRect();
    // Unlike NotificationBell/AvatarMenu (right-anchored off the topbar's
    // own right edge, so they can never overflow), this trigger sits inside
    // a left-to-right toolbar — left-anchoring it the same way it's always
    // been would push the popover off the right edge of a narrow viewport
    // whenever the trigger itself sits close to that edge. Clamp instead of
    // just anchoring to rect.left so it visually lands exactly where it
    // always has on any width wide enough to fit it.
    const left = Math.max(12, Math.min(rect.left, window.innerWidth - 264 - 12));
    setDateRangePosition({ top: rect.bottom + 6, left });
    setDateRangeOpen(true);
  };

  const applyDateRange = () => {
    setDateFrom(draftDateFrom);
    setDateTo(draftDateTo);
    setDateRangeOpen(false);
  };

  // Scoped to just this popover's two fields — the toolbar's own "Clear
  // Filters" button (below) still resets every filter, including these.
  const clearDateRange = () => {
    setDraftDateFrom('');
    setDraftDateTo('');
    setDateFrom('');
    setDateTo('');
    setDateRangeOpen(false);
  };

  useEffect(() => {
    if (!dateRangeOpen) return undefined;

    const handleClickOutside = (e) => {
      if (
        dateRangeTriggerRef.current && !dateRangeTriggerRef.current.contains(e.target) &&
        dateRangeDropdownRef.current && !dateRangeDropdownRef.current.contains(e.target)
      ) {
        // Outside click discards the draft — dateFrom/dateTo (applied)
        // are untouched, and the draft gets re-seeded from them next open.
        setDateRangeOpen(false);
      }
    };
    const handleDismiss = () => setDateRangeOpen(false);

    document.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('scroll', handleDismiss, true);
    window.addEventListener('resize', handleDismiss);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('scroll', handleDismiss, true);
      window.removeEventListener('resize', handleDismiss);
    };
  }, [dateRangeOpen]);

  const openBlankWalkIn = () => {
    setSelectedSlotData(null);
    setWalkInOpen(true);
  };

  const openWalkInForRow = (row) => {
    setSelectedSlotData({
      dentist_id: row.dentist_id,
      dentist_name: row.dentist?.name || 'Unassigned',
      service_id: row.service_id,
      service_name: row.service?.name,
      appointment_date: row.appointment_date.slice(0, 10),
      appointment_time: row.appointment_time.slice(0, 5),
    });
    setWalkInOpen(true);
  };

  const openCancel = (row) => {
    setCancelReason('');
    setCancelTarget(row);
  };

  const handleCancel = async () => {
    if (!cancelTarget) return;
    setCancelling(true);
    try {
      await cancelAppointmentAsStaff(cancelTarget.id, cancelReason);
      setCancelTarget(null);
      load();
      loadStats();
      showSuccessToast('Appointment cancelled.');
    } catch (err) {
      showErrorToast(err.response?.data?.message || 'Could not cancel this appointment.');
    } finally {
      setCancelling(false);
    }
  };

  const toggleSort = () => setSort((s) => (s === 'date_desc' ? 'date_asc' : 'date_desc'));

  const handleNoShow = async (row) => {
    const confirmed = await confirmAction({
      title: 'Mark as No Show?',
      text: `Appointment #${row.id} will be recorded as a missed visit. The patient will be notified.`,
      confirmButtonText: 'Mark No Show',
      confirmButtonColor: '#dc2626',
    });
    if (!confirmed) return;
    try {
      await markNoShow(row.id);
      load();
      loadStats();
      showSuccessToast('Appointment marked as no-show.');
    } catch (err) {
      showErrorToast(err.response?.data?.message || 'Could not mark this appointment as no-show.');
    }
  };

  const columns = [
    {
      key: 'patient',
      label: 'Patient',
      minWidth: '20%',
      minWidthPx: '200px',
      render: (row) => {
        const name = `${row.patient?.first_name || ''} ${row.patient?.last_name || ''}`.trim();
        const patientNumber = row.patient?.patient_number;
        const phone = row.patient?.user?.mobile_number;
        const subLine = [patientNumber, phone].filter(Boolean).join(' · ');
        return (
          <span className="cell-person">
            <span className="cell-avatar">{getInitials(name)}</span>
            <span className="cell-person-text">
              <span className="cell-person-name" title={name}>{name}</span>
              {subLine && <span className="cell-person-sub" title={subLine}>{subLine}</span>}
            </span>
          </span>
        );
      },
    },
    {
      key: 'appointment',
      label: (
        <button type="button" className="th-sort-btn" onClick={toggleSort}>
          Appointment
          <span className={`th-sort-arrow${sort === 'date_asc' ? ' th-sort-arrow--asc' : ''}`}>&#9662;</span>
        </button>
      ),
      mobileLabel: 'Appointment',
      minWidth: '14%',
      minWidthPx: '140px',
      // Two guaranteed lines: date, then time + ref # folded into the same
      // muted line — no separate ref line and no icon, both of which were
      // costing horizontal room the date needs to stay on one line.
      render: (row) => (
        <span className="cell-appointment">
          <span className="cell-appointment-date">{formatDateShort(row.appointment_date)}</span>
          <span className="cell-appointment-time">{formatTime12h(row.appointment_time)} · #{row.id}</span>
        </span>
      ),
    },
    {
      key: 'dentist',
      label: 'Dentist',
      minWidth: '18%',
      minWidthPx: '180px',
      // No photo/avatar here by request — plain truncated text, tooltip on
      // genuine overflow. Photo shows in the detail modal instead.
      render: (row) => {
        const name = row.dentist?.name || 'Unassigned';
        return <span className="cell-dentist-name" title={name}>{name}</span>;
      },
    },
    {
      key: 'service',
      label: 'Service',
      minWidth: '18%',
      minWidthPx: '150px',
      clampLines: 2,
      render: (row) => <span className="cell-service" title={row.service?.name}>{row.service?.name}</span>,
    },
    {
      key: 'payment',
      label: 'Payment',
      minWidth: '8%',
      minWidthPx: '110px',
      align: 'center',
      render: (row) => {
        const isCash = row.patient_type_snapshot === 'cash';
        return (
          <StatusBadge
            status={isCash ? 'Cash' : 'HMO'}
            tone={isCash ? 'green' : 'amber'}
            icon={isCash ? CashIcon : ShieldIcon}
          />
        );
      },
    },
    {
      key: 'status',
      label: 'Status',
      minWidth: '12%',
      minWidthPx: '140px',
      align: 'center',
      render: (row) => (
        isOverdueUnresolved(row) ? (
          <StatusBadge status="Awaiting Update" tone="amber" icon={ClockIcon} />
        ) : (
          <StatusBadge status={row.status} icon={STATUS_ICON[row.status]} />
        )
      ),
    },
    {
      key: 'actions',
      label: '',
      minWidth: '10%',
      minWidthPx: '105px',
      align: 'right',
      render: (row) => (
        <div className="row-actions">
          <button type="button" className="row-action-icon" aria-label="View details" onClick={() => setDetailAppointmentId(row.id)}>
            <EyeIcon />
          </button>
          <ActionMenu
            items={[
              row.status === 'cancelled' && { label: 'Assign Walk-In', onClick: () => openWalkInForRow(row) },
              isOverdueUnresolved(row) && { label: 'Mark No Show', onClick: () => handleNoShow(row), danger: true },
              ['confirmed', 'pending_verification'].includes(row.status) && {
                label: 'Cancel Appointment', onClick: () => openCancel(row), danger: true,
              },
            ]}
          />
        </div>
      ),
    },
  ];

  return (
    <div>
      <PageHeader icon={CalendarIcon} title="Appointments" subtitle="Manage and monitor all patient appointments">
        <button type="button" className="dash-btn" onClick={openBlankWalkIn}>
          + Add Appointment
        </button>
      </PageHeader>

      <div className="stat-grid stat-grid--4">
        {statsLoading ? (
          <Skeleton variant="stat-card" count={4} />
        ) : (
          <>
            <StatCard label="Appointments This Month" value={stats?.total ?? 0} icon={CalendarIcon} tint="blue" />
            <StatCard
              label="Confirmed"
              value={stats?.confirmed ?? 0}
              subtitle={`${stats?.confirmedPct ?? 0}% of monthly total`}
              icon={CheckCircleIcon}
              tint="green"
            />
            <StatCard
              label="Pending Verification"
              value={stats?.pending ?? 0}
              subtitle={`${stats?.pendingPct ?? 0}% of monthly total`}
              icon={ClockIcon}
              tint="amber"
            />
            <StatCard
              label="Cancelled"
              value={stats?.cancelled ?? 0}
              subtitle={`${stats?.cancelledPct ?? 0}% of monthly total`}
              icon={XCircleIcon}
              tint="red"
            />
          </>
        )}
      </div>

      <div className="section-card">
        <div className="appt-toolbar">
          <div className="filter-field filter-field--grow">
            <div className="filter-search">
              <SearchIcon />
              <input
                type="text"
                className="form-input"
                placeholder="Search name or REF #"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
              />
            </div>
          </div>
          <div className="filter-field">
            <button
              type="button"
              ref={dateRangeTriggerRef}
              className={`filter-search filter-date-trigger${dateFrom || dateTo ? ' filter-date-trigger--active' : ''}`}
              onClick={() => (dateRangeOpen ? setDateRangeOpen(false) : openDateRange())}
              aria-haspopup="true"
              aria-expanded={dateRangeOpen}
            >
              <CalendarIcon />
              <span className="filter-date-trigger-label">
                {formatDateRangeLabel(dateFrom, dateTo) || 'Filter by date'}
              </span>
            </button>

            {dateRangeOpen && dateRangePosition && createPortal(
              <div
                ref={dateRangeDropdownRef}
                className="filter-date-popover"
                style={{ top: dateRangePosition.top, left: dateRangePosition.left }}
              >
                <div className="filter-date-popover-field">
                  <label htmlFor="date-range-from">From</label>
                  <input
                    id="date-range-from"
                    type="date"
                    value={draftDateFrom}
                    onChange={(e) => setDraftDateFrom(e.target.value)}
                  />
                </div>
                <div className="filter-date-popover-field">
                  <label htmlFor="date-range-to">To</label>
                  <input
                    id="date-range-to"
                    type="date"
                    value={draftDateTo}
                    onChange={(e) => setDraftDateTo(e.target.value)}
                  />
                </div>
                <div className="filter-date-popover-actions">
                  <button type="button" className="dash-btn dash-btn--outline" onClick={clearDateRange}>
                    Clear
                  </button>
                  <button type="button" className="dash-btn" onClick={applyDateRange}>
                    Apply
                  </button>
                </div>
              </div>,
              document.body
            )}
          </div>
          <FilterDropdown
            icon={<UserIcon />}
            options={[{ value: '', label: 'All Dentists' }, ...dentists.map((d) => ({ value: String(d.id), label: d.name }))]}
            value={dentistId}
            onChange={setDentistId}
          />
          <FilterDropdown icon={<CheckCircleIcon />} options={STATUS_OPTIONS} value={status} onChange={setStatus} />
          <FilterDropdown icon={<CashIcon />} options={PAYMENT_TYPE_OPTIONS} value={paymentType} onChange={setPaymentType} />
          <div className="filter-field">
            <button
              type="button"
              className={`filter-search filter-date-trigger${overdueOnly ? ' filter-date-trigger--active' : ''}`}
              onClick={() => setOverdueOnly((v) => !v)}
              aria-pressed={overdueOnly}
              title="Confirmed/pending appointments whose date has already passed"
            >
              <ClockIcon />
              <span className="filter-date-trigger-label">Overdue Only</span>
            </button>
          </div>
          {hasActiveFilters && (
            <button type="button" className="dash-btn dash-btn--outline" onClick={clearFilters}>
              Clear Filters
            </button>
          )}
        </div>

        {loading ? (
          <Skeleton variant="row" count={6} />
        ) : error ? (
          <div className="dash-empty">
            <span className="dash-empty-title">{error}</span>
          </div>
        ) : (
          <div className="appt-master-table">
            <DataTable columns={columns} rows={appointments} emptyMessage="No appointments match these filters." />
            <Pagination
              meta={meta}
              onPageChange={setPage}
              onPerPageChange={(n) => { setPerPage(n); setPage(1); }}
            />
          </div>
        )}
      </div>

      <WalkInBookingModal
        open={walkInOpen}
        onClose={() => setWalkInOpen(false)}
        selectedSlotData={selectedSlotData}
        services={services}
        onSuccess={() => {
          setWalkInOpen(false);
          load();
          loadStats();
        }}
      />

      <AppointmentDetailModal appointmentId={detailAppointmentId} onClose={() => setDetailAppointmentId(null)} />

      <RejectionModal
        open={!!cancelTarget}
        onClose={() => setCancelTarget(null)}
        title="Cancel Appointment"
        message={cancelTarget ? `Cancel appointment #${cancelTarget.id}? The patient will be notified by email.` : ''}
        confirmLabel="Cancel Appointment"
        reason={cancelReason}
        onReasonChange={setCancelReason}
        onConfirm={handleCancel}
        confirming={cancelling}
      />
    </div>
  );
}

export default AllAppointments;
