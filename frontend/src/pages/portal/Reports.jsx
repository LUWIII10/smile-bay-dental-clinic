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
                  <ul className="reports-print-summary reports-print-summary--list">
                    <li>Cash: {data.payment_split.cash} ({cashPct}%)</li>
                    <li>HMO: {data.payment_split.hmo} ({hmoPct}%)</li>
                  </ul>
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
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default Reports;
