// Shared page-intro header — icon box + title/subtitle on the same
// navy-to-blue gradient and wave motif as the dashboard greeting banner
// (DashGreeting), reused here via the same .dash-greeting-wave classes
// rather than a second copy. Approved mockup: https://claude.ai/artifact/9b4rJvL6917sbn52cmWY1V
// Replaces the old plain "section-card-header appt-page-header" block
// (still used verbatim by a couple of nested sub-headers elsewhere on each
// page — only the page's own top header switches to this), and replaces
// this component's own earlier light-tint/tooth-watermark treatment.
// `icon` is a component reference (e.g. CalendarIcon), same convention as
// StatCard's `icon` prop. `children` renders as the right-aligned actions
// slot — pages with no header button just omit it, same as before.
function PageHeader({ icon: Icon, title, subtitle, children }) {
  return (
    <div className="page-hero">
      <svg className="dash-greeting-wave dash-greeting-wave--back" viewBox="0 0 500 44" preserveAspectRatio="none" aria-hidden="true">
        <path d="M0,22 C100,44 150,0 250,18 C350,36 400,6 500,24 L500,44 L0,44 Z" />
      </svg>
      <svg className="dash-greeting-wave dash-greeting-wave--front" viewBox="0 0 500 30" preserveAspectRatio="none" aria-hidden="true">
        <path d="M0,14 C120,30 180,2 260,12 C360,24 420,4 500,16 L500,30 L0,30 Z" />
      </svg>
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
