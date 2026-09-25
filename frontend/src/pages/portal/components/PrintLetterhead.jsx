import BrandLogo from '../../../components/common/BrandLogo';
import { MapPinIcon, PhoneIcon, MailIcon } from '../icons';

// Shared print-only letterhead — screen-hidden by its own CSS (.print-letterhead),
// revealed by @media print, same flip every other print surface in this app
// already uses (Reports.jsx, PatientRecords.jsx's dental-record print).
// One reusable header instead of copy-pasting this block per page, so the
// clinic identity/contact block only ever needs updating in one place.
//
// Tagline and contact details are real but hardcoded, not fetched live —
// same reasoning as the address/phone/email this replaces: ClinicInfo
// (which holds the editable tagline) only exists behind GET /api/admin/
// settings, role:admin-only, and this component is shared by dentist/
// dental_assistant print pages too. Opening that endpoint to more roles is
// a backend change this pass doesn't make.
//
// title: the report's name (e.g. "Clinic Operations Report").
// metaRows: [{ icon: IconComponent, label, value }] — each print page's own
// reference facts (Period/Generated for Reports, Patient No./Date Printed
// for a dental record, Date/Generated/Total Patients for an appointments-
// by-date report).
function PrintLetterhead({ title, metaRows }) {
  return (
    <div className="print-letterhead">
      <div className="print-letterhead-identity">
        <BrandLogo variant="blue" size="lg" />
        <p className="print-letterhead-tagline">Your Smile, Our Priority</p>
        <div className="print-letterhead-contact">
          <span><MapPinIcon /> Ground Floor, Mega Building, National Highway, Landayan, San Pedro, Laguna, 4023</span>
          <span><PhoneIcon /> 0917 132 3093</span>
          <span><MailIcon /> smilebayph@gmail.com</span>
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
