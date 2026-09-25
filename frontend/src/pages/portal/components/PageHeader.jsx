import { ToothIcon, SparkleIcon } from '../icons';

// Shared page-intro header — icon box + title/subtitle on a soft blue
// gradient card, with a faint tooth/sparkle watermark behind the actions.
// Replaces the old plain "section-card-header appt-page-header" block
// (still used verbatim by a couple of nested sub-headers elsewhere on each
// page — only the page's own top header switches to this). `icon` is a
// component reference (e.g. CalendarIcon), same convention as StatCard's
// `icon` prop. `children` renders as the right-aligned actions slot — pages
// with no header button just omit it, same as before.
function PageHeader({ icon: Icon, title, subtitle, children }) {
  return (
    <div className="page-hero">
      <div className="page-hero-decoration" aria-hidden="true">
        <ToothIcon />
        <SparkleIcon />
        <SparkleIcon />
      </div>
      <div className="page-hero-main">
        {Icon && (
          <span className="page-hero-icon">
            <Icon />
          </span>
        )}
        <div className="page-hero-text">
          <h1 className="page-hero-title">{title}</h1>
          {subtitle && <p className="page-hero-subtitle">{subtitle}</p>}
        </div>
      </div>
      {children && <div className="page-hero-actions">{children}</div>}
    </div>
  );
}

export default PageHeader;
