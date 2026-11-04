import { useEffect, useState } from 'react';
import BrandLogo from '../../../components/common/BrandLogo';
import { MapPinIcon, PhoneIcon, MailIcon } from '../icons';
import { getPublicClinicInfo } from '../../../api/public';

// Shared print-only letterhead — screen-hidden by its own CSS (.print-letterhead),
// revealed by @media print, same flip every other print surface in this app
// already uses (Reports.jsx, PatientRecords.jsx's dental-record print).
// One reusable header instead of copy-pasting this block per page, so the
// clinic identity/contact block only ever needs updating in one place.
//
// Fetches live from GET /api/clinic-info (ClinicInfoController) — a public,
// unauthenticated endpoint already used by the landing page, not the
// role:admin-only GET /api/admin/settings this component used to assume was
// the only source. Editing Clinic Info in Settings now actually reaches this
// on-screen "Print" path too, instead of only the downloadable PDFs (which
// already read it live via AppServiceProvider's view composer). Hardcoded
// strings stay as the initial/fallback state — same values as before, same
// fallback pattern LandingPage.jsx already uses — so the letterhead never
// renders blank while the fetch is in flight or if it ever fails.
//
// title: the report's name (e.g. "Clinic Operations Report").
// metaRows: [{ icon: IconComponent, label, value }] — each print page's own
// reference facts (Period/Generated for Reports, Patient No./Date Printed
// for a dental record, Date/Generated/Total Patients for an appointments-
// by-date report).
function PrintLetterhead({ title, metaRows }) {
  const [clinicInfo, setClinicInfo] = useState(null);

  useEffect(() => {
    getPublicClinicInfo().then(setClinicInfo).catch(() => {});
  }, []);

  return (
    <div className="print-letterhead">
      <div className="print-letterhead-identity">
        <BrandLogo variant="blue" size="lg" />
        <p className="print-letterhead-tagline">{clinicInfo?.tagline || 'Your Smile, Our Priority'}</p>
        <div className="print-letterhead-contact">
          <span><MapPinIcon /> {clinicInfo?.address || 'Ground Floor, Mega Building, National Highway, Landayan, San Pedro, Laguna, 4023'}</span>
          <span><PhoneIcon /> {clinicInfo?.contact_number || '0917 132 3093'}</span>
          <span><MailIcon /> {clinicInfo?.contact_email || 'smilebayph@gmail.com'}</span>
        </div>
      </div>

      <div className="print-letterhead-doc">
        <div className="print-letterhead-title">
          <CalendarBadgeIcon />
          {title}
        </div>
        <div className="print-letterhead-meta">
          {metaRows.map((row) => (
            <div key={row.label} className="print-letterhead-meta-row">
              <row.icon />
              <span className="print-letterhead-meta-label">{row.label}:</span>
              <span className="print-letterhead-meta-value">{row.value}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// Small inline icon just for the title badge — a plain calendar glyph,
// deliberately not importing CalendarIcon (which would need its stroke
// forced to white here specifically, one-off enough to not be worth a
// shared icon prop just for this).
function CalendarBadgeIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  );
}

export default PrintLetterhead;
