import { useCallback, useEffect, useState } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js';
import { Line, Doughnut } from 'react-chartjs-2';
import { getReportsOverview } from '../../api/reports';
import StatCard from './components/StatCard';
import Skeleton from './components/Skeleton';
import BrandLogo from '../../components/common/BrandLogo';
import { CalendarIcon, CheckCircleIcon, XCircleIcon, UsersIcon, PrinterIcon } from './icons';
import { formatDateLong } from './dateTimeUtils';
import './dashboards.css';
import './Appointments.css';
import './Reports.css';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, ArcElement, Title, Tooltip, Legend, Filler);

// Same palette/config conventions as AdminDashboard.jsx's charts — this
// page is the real-data completion of what that dashboard's own comment
// flagged as still mock ("they belong to the ... Reports module").
const LINE_OPTIONS = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: { legend: { display: false } },
  scales: {
    x: { grid: { display: false }, ticks: { color: '#64748b', font: { family: 'Poppins', size: 11 } } },
    y: {
      beginAtZero: true,
      grid: { color: '#e2e8f0' },
      ticks: { color: '#64748b', font: { family: 'Poppins', size: 11 }, precision: 0 },
    },
  },
};

const DOUGHNUT_OPTIONS = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: {
      position: 'bottom',
      labels: { color: '#334155', font: { family: 'Poppins', size: 11 }, padding: 14, boxWidth: 10 },
    },
  },
};

function formatDayLabel(dateStr) {
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function defaultRange() {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth(), 1);
  const to = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const toIso = (d) => d.toISOString().slice(0, 10);
  return { date_from: toIso(from), date_to: toIso(to) };
}

function Reports() {
  const [range, setRange] = useState(defaultRange());
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setData(await getReportsOverview(range));
    } catch {
      setError('Could not load report data. Please refresh the page.');
    } finally {
      setLoading(false);
    }
  }, [range]);

  useEffect(() => {
    load();
  }, [load]);

  const lineData = data && {
    labels: data.by_day.map((d) => formatDayLabel(d.date)),
    datasets: [
      {
        label: 'Appointments',
        data: data.by_day.map((d) => d.count),
        borderColor: '#2952e3',
        backgroundColor: 'rgba(41, 82, 227, 0.1)',
        pointBackgroundColor: '#2952e3',
        tension: 0.35,
        fill: true,
      },
    ],
  };

  const paymentData = data && {
    labels: ['Cash', 'HMO'],
    datasets: [
      {
        data: [data.payment_split.cash, data.payment_split.hmo],
        backgroundColor: ['#15803d', '#b45309'],
        borderWidth: 0,
      },
    ],
  };

  const maxServiceCount = data ? Math.max(1, ...data.top_services.map((s) => s.count)) : 1;
  const maxDentistCount = data ? Math.max(1, ...data.by_dentist.map((d) => d.count)) : 1;

  // Printed-page numbers for the two Chart.js visuals — a canvas chart
  // is the one thing that genuinely doesn't belong on a paper report
  // (nothing to hover, colors are the only encoding), so print shows the
  // same figures as plain text/list instead of the graphic itself.
  const paymentTotal = data ? data.payment_split.cash + data.payment_split.hmo : 0;
  const cashPct = paymentTotal ? Math.round((data.payment_split.cash / paymentTotal) * 100) : 0;
  const hmoPct = paymentTotal ? Math.round((data.payment_split.hmo / paymentTotal) * 100) : 0;
  const avgPerDay = data && data.by_day.length ? (data.totals.total_appointments / data.by_day.length).toFixed(1) : 0;

  // Printed tables 3 and 4 — share is each row's count over the sum of
  // that table's own rows (top_services is already capped at 5 by the
  // backend, so this is "share of the top 5 shown", not "share of every
  // appointment" — matching what the table itself actually lists), one
  // decimal place. Table 2 reuses cashPct/hmoPct above as-is instead of
  // recomputing to a different decimal precision.
  const servicesTotal = data ? data.top_services.reduce((sum, s) => sum + s.count, 0) : 0;
  const dentistTotal = data ? data.by_dentist.reduce((sum, d) => sum + d.count, 0) : 0;
  const pct = (count, total) => (total ? ((count / total) * 100).toFixed(1) : '0.0');

  const printPeriod = data && (
    <p className="reports-print-caption-date">{formatDateLong(range.date_from)} – {formatDateLong(range.date_to)}</p>
  );

  return (
    <div>
      <div className="section-card-header appt-page-header">
        <div>
          <h1 className="appt-page-title">Reports</h1>
          <p className="appt-page-subtitle">Appointment activity and clinic operations at a glance.</p>
        </div>
        <div className="reports-date-range">
          <input
            type="date"
            className="form-input"
            value={range.date_from}
            onChange={(e) => setRange((p) => ({ ...p, date_from: e.target.value }))}
          />
          <span className="filter-date-range-sep" aria-hidden="true" />
          <input
            type="date"
            className="form-input"
            value={range.date_to}
            onChange={(e) => setRange((p) => ({ ...p, date_to: e.target.value }))}
          />
          <button
            type="button"
            className="dash-btn dash-btn--outline"
            disabled={loading || !!error}
            onClick={() => window.print()}
          >
            <PrinterIcon /> Print Report
          </button>
        </div>
      </div>

      {/* Screen-hidden, print-only letterhead — a printed report should read
          as a standalone document (clinic identity, the exact period it
          covers, when it was generated), not a screenshot of dashboard
          widgets with no context once it's off-screen and on paper. */}
      <div className="reports-print-header">
        <BrandLogo variant="blue" size="md" />
        <div className="reports-print-meta">
          <h2>Clinic Operations Report</h2>
          <p>Period: {formatDateLong(range.date_from)} – {formatDateLong(range.date_to)}</p>
          <p>
            Generated on {new Date().toLocaleString('en-US', {
              month: 'long', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
            })}
          </p>
        </div>
      </div>

      {error ? (
        <div className="dash-empty"><span className="dash-empty-title">{error}</span></div>
      ) : (
        <>
          <div className="stat-grid stat-grid--4">
            {loading ? (
              <Skeleton variant="stat-card" count={4} />
            ) : (
              <>
                <StatCard label="Total Appointments" value={data.totals.total_appointments} icon={CalendarIcon} tint="blue" />
                <StatCard label="Completed" value={data.totals.completed} icon={CheckCircleIcon} tint="green" />
                <StatCard
                  label="Cancelled / Rejected"
                  value={data.totals.cancelled + data.totals.rejected}
                  icon={XCircleIcon}
                  tint="red"
                />
                <StatCard label="New Patients" value={data.totals.new_patients} icon={UsersIcon} tint="amber" />
              </>
            )}
          </div>

          {/* Print-only — Table 1. No header row (label/figure pairs, not
              name/count/share), so the "dark rule above first row, below
              last row" comes from the .reports-print-table--summary
              modifier's own border rather than a <thead>. No Total row:
              these four figures aren't parts of one whole that sums to
              100% (New Patients is an unrelated metric), unlike tables
              2-4 below. */}
          {!loading && data && (
            <div className="reports-print-table-block">
              <p className="reports-print-caption">TABLE 1 — APPOINTMENT SUMMARY</p>
              {printPeriod}
              <table className="reports-print-table reports-print-table--summary">
                <tbody>
                  <tr><td>Total appointments</td><td className="reports-print-num">{data.totals.total_appointments}</td></tr>
                  <tr><td>Completed</td><td className="reports-print-num">{data.totals.completed}</td></tr>
                  <tr><td>Cancelled / rejected</td><td className="reports-print-num">{data.totals.cancelled + data.totals.rejected}</td></tr>
                  <tr><td>New patients</td><td className="reports-print-num">{data.totals.new_patients}</td></tr>
                </tbody>
              </table>
            </div>
          )}

          <div className="chart-grid">
            <div className="section-card">
              <div className="section-card-header">
                <h3 className="section-card-title">Appointments Over Time</h3>
              </div>
              {loading ? (
                <Skeleton variant="block" />
              ) : data.by_day.length === 0 ? (
                <div className="dash-empty"><span className="dash-empty-title">No appointments in this range.</span></div>
              ) : (
                <>
                  <div className="chart-container">
                    <Line data={lineData} options={LINE_OPTIONS} />
                  </div>
                  <p className="reports-print-summary">
                    <strong>{data.totals.total_appointments}</strong> appointment{data.totals.total_appointments === 1 ? '' : 's'}{' '}
                    over {data.by_day.length} day{data.by_day.length === 1 ? '' : 's'} — averaging {avgPerDay} per day.
                  </p>
                </>
              )}
            </div>

            <div className="section-card">
              <div className="section-card-header">
                <h3 className="section-card-title">Payment Type Split</h3>
              </div>
              {loading ? (
                <Skeleton variant="block" />
              ) : data.totals.total_appointments === 0 ? (
                <div className="dash-empty"><span className="dash-empty-title">No appointments in this range.</span></div>
              ) : (
                <>
                  <div className="chart-container">
                    <Doughnut data={paymentData} options={DOUGHNUT_OPTIONS} />
                  </div>
                  {/* Print-only — Table 2, replacing the doughnut. Reuses
                      cashPct/hmoPct as already computed above (whole-number
                      rounding) rather than recomputing to the one-decimal
                      precision tables 3/4 use below. */}
                  <div className="reports-print-table-block">
                    <p className="reports-print-caption">TABLE 2 — PAYMENT TYPE</p>
                    {printPeriod}
                    <table className="reports-print-table">
                      <thead>
                        <tr><th>Type</th><th className="reports-print-num">Count</th><th className="reports-print-num">Share</th></tr>
                      </thead>
                      <tbody>
                        <tr><td>Cash</td><td className="reports-print-num">{data.payment_split.cash}</td><td className="reports-print-num">{cashPct}%</td></tr>
                        <tr><td>HMO</td><td className="reports-print-num">{data.payment_split.hmo}</td><td className="reports-print-num">{hmoPct}%</td></tr>
                      </tbody>
                      <tfoot>
                        <tr><td>Total</td><td className="reports-print-num">{paymentTotal}</td><td className="reports-print-num">100%</td></tr>
                      </tfoot>
                    </table>
                  </div>
                </>
              )}
            </div>
          </div>

          <div className="chart-grid">
            <div className="section-card">
              <div className="section-card-header">
                <h3 className="section-card-title">Top Services</h3>
              </div>
              {loading ? (
                <Skeleton variant="row" count={5} />
              ) : data.top_services.length === 0 ? (
                <div className="dash-empty"><span className="dash-empty-title">No data in this range.</span></div>
              ) : (
                <>
                  <ul className="reports-bar-list">
                    {data.top_services.map((s) => (
                      <li key={s.name} className="reports-bar-row">
                        <span className="reports-bar-label" title={s.name}>{s.name}</span>
                        <div className="reports-bar-track">
                          <div className="reports-bar-fill reports-bar-fill--blue" style={{ width: `${(s.count / maxServiceCount) * 100}%` }} />
                        </div>
                        <span className="reports-bar-count">{s.count}</span>
                      </li>
                    ))}
                  </ul>
                  {/* Print-only — Table 3. Share is of the top 5 shown
                      here (that's what the backend returns and what this
                      table lists), not of every appointment in range. */}
                  <div className="reports-print-table-block">
                    <p className="reports-print-caption">TABLE 3 — SERVICES RENDERED</p>
                    {printPeriod}
                    <table className="reports-print-table">
                      <thead>
                        <tr><th>Service</th><th className="reports-print-num">Count</th><th className="reports-print-num">Share</th></tr>
                      </thead>
                      <tbody>
                        {data.top_services.map((s) => (
                          <tr key={s.name}>
                            <td>{s.name}</td>
                            <td className="reports-print-num">{s.count}</td>
                            <td className="reports-print-num">{pct(s.count, servicesTotal)}%</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr><td>Total</td><td className="reports-print-num">{servicesTotal}</td><td className="reports-print-num">100.0%</td></tr>
                      </tfoot>
                    </table>
                  </div>
                </>
              )}
            </div>

            <div className="section-card">
              <div className="section-card-header">
                <h3 className="section-card-title">Appointments by Dentist</h3>
              </div>
              {loading ? (
                <Skeleton variant="row" count={4} />
              ) : data.by_dentist.length === 0 ? (
                <div className="dash-empty"><span className="dash-empty-title">No data in this range.</span></div>
              ) : (
                <>
                  <ul className="reports-bar-list">
                    {data.by_dentist.map((d) => (
                      <li key={d.name} className="reports-bar-row">
                        <span className="reports-bar-label" title={d.name}>{d.name}</span>
                        <div className="reports-bar-track">
                          <div className="reports-bar-fill reports-bar-fill--green" style={{ width: `${(d.count / maxDentistCount) * 100}%` }} />
                        </div>
                        <span className="reports-bar-count">{d.count}</span>
                      </li>
                    ))}
                  </ul>
                  {/* Print-only — Table 4. Unlike top_services, by_dentist
                      isn't capped by the backend, so this share is genuinely
                      "of every appointment in range" (every appointment has
                      exactly one dentist). */}
                  <div className="reports-print-table-block">
                    <p className="reports-print-caption">TABLE 4 — APPOINTMENTS BY DENTIST</p>
                    {printPeriod}
                    <table className="reports-print-table">
                      <thead>
                        <tr><th>Dentist</th><th className="reports-print-num">Count</th><th className="reports-print-num">Share</th></tr>
                      </thead>
                      <tbody>
                        {data.by_dentist.map((d) => (
                          <tr key={d.name}>
                            <td>{d.name}</td>
                            <td className="reports-print-num">{d.count}</td>
                            <td className="reports-print-num">{pct(d.count, dentistTotal)}%</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr><td>Total</td><td className="reports-print-num">{dentistTotal}</td><td className="reports-print-num">100.0%</td></tr>
                      </tfoot>
                    </table>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Print-only footer — repeats on every printed page via
              position: fixed (see Reports.css). No page number: CSS
              cannot reliably produce one in Chrome/Firefox/Edge without a
              paged-media library (see the verification report), so this
              stays a single line rather than a number that might be
              wrong. */}
          <div className="reports-print-footer">
            <span>Smile Bay Dental Clinic · Clinic Operations Report</span>
          </div>
        </>
      )}
    </div>
  );
}

export default Reports;
