<style>
  /* Shared by all three PDF reports (clinic-operations-report,
     patient-appointments-report, patient-dental-record) — dompdf's CSS
     support is closer to CSS2.1 than a real browser (no reliable flexbox/
     grid), so this uses tables/blocks for layout instead of the flexbox
     the on-screen @media print versions of these same reports use.
     DejaVu Sans (bundled with dompdf) renders correctly; the app's actual
     'Poppins' web font isn't loaded here. */
  @page { margin: 40px 38px; }

  body { font-family: 'DejaVu Sans', sans-serif; color: #334155; font-size: 11.5px; }

  /* "Smile Bay" in the letterhead is Pacifico everywhere else in the app
     (BrandLogo.css's .sb-title, loaded there from Google Fonts) — dompdf
     can't reach a remote @font-face src by default, so this is the same
     font file, shipped locally instead, referenced by a real filesystem
     path the way the logo image already is (public_path(), not asset()). */
  @font-face {
    font-family: 'Pacifico';
    src: url('{{ public_path('fonts/Pacifico-Regular.ttf') }}') format('truetype');
    font-weight: normal;
    font-style: normal;
  }

  table { border-collapse: collapse; width: 100%; }

  .pdf-letterhead { width: 100%; margin-bottom: 20px; padding-bottom: 16px; border-bottom: 3px solid #2952e3; }
  .pdf-letterhead td { vertical-align: top; }

  /* Same lockup as the real BrandLogo component (BrandLogo.css) — badge
     and wordmark vertically centered against each other, both lines the
     same blue (#1d4ed8, its variant="blue"), not this PDF's own guess at
     the colors/alignment. Keep this in sync with BrandLogo.css if that
     component's own logo/wordmark styling ever changes. */
  .pdf-brand-row td { vertical-align: middle; }
  .pdf-logo-cell { width: 42px; padding-right: 10px; }
  .pdf-logo-cell img { width: 38px; height: 38px; display: block; }
  .pdf-brand-text-cell { line-height: 1; }
  .pdf-brand-title { font-family: 'Pacifico', 'DejaVu Sans', cursive; font-size: 19px; font-weight: normal; color: #1d4ed8; line-height: 1; }
  .pdf-brand-subtitle { font-size: 8.5px; font-weight: bold; letter-spacing: 1px; text-transform: uppercase; color: #1d4ed8; margin-top: 3px; }
  .pdf-tagline { font-size: 9.5px; font-style: italic; color: #64748b; padding-top: 7px; margin-top: 9px; border-top: 1px solid #dbeafe; }
  .pdf-contact { font-size: 10px; color: #334155; margin-top: 10px; line-height: 1.7; }

  .pdf-doc-col { width: 230px; text-align: right; }
  .pdf-doc-badge {
    display: inline-block;
    background: #1d4ed8;
    color: #ffffff;
    padding: 8px 14px;
    font-size: 10.5px;
    font-weight: bold;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    border-radius: 5px;
  }
  .pdf-meta { width: 100%; margin-top: 10px; }
  .pdf-meta td { padding: 3px 0; font-size: 10px; text-align: right; }
  .pdf-meta-label { color: #64748b; font-weight: bold; }
  .pdf-meta-value { color: #0f2557; font-weight: bold; padding-left: 6px; }

  /* Wraps a .pdf-section-title + its table/empty-state in a visible
     border — matches the bordered "card" feel the on-screen @media print
     versions of these same reports already give each section, instead of
     just a colored title bar with nothing anchoring where it ends. */
  .pdf-section-box { border: 1px solid #dbeafe; border-radius: 5px; margin: 16px 0; overflow: hidden; }

  .pdf-section-title {
    background: #eff6ff;
    color: #0f2557;
    font-size: 10.5px;
    font-weight: bold;
    padding: 8px 12px;
    margin: 0;
    text-transform: uppercase;
    letter-spacing: 0.4px;
  }

  .pdf-summary { font-size: 10.5px; color: #334155; margin: 8px 0 16px; }

  .pdf-table { width: 100%; margin-bottom: 4px; }
  .pdf-table th {
    background: #1d4ed8;
    color: #ffffff;
    text-align: left;
    padding: 7px 10px;
    font-size: 9.5px;
    text-transform: uppercase;
    letter-spacing: 0.3px;
  }
  .pdf-table td { padding: 7px 10px; font-size: 10px; border-bottom: 1px solid #e2e8f0; }
  .pdf-table .num { text-align: right; }
  .pdf-table tfoot td { font-weight: bold; color: #0f2557; border-top: 1.5px solid #cbd5e1; border-bottom: none; }
  .pdf-table-summary td:first-child { color: #334155; }
  .pdf-table-summary td.num { color: #0f2557; font-weight: bold; }

  /* patient-appointments-report.blade.php only — same fix as the on-screen
     print version of this same report (.prt-col-* in PrintLetterhead.css):
     fixed-format, short-content columns get just enough width plus real
     slack to never wrap, freeing real space for Patient/Service/Dentist.
     Prefixed "par-" (not the generic .pdf-table/.col-* names) so this never
     touches the Dental Chart/Treatment History/Clinic Operations tables
     that also share .pdf-table but have entirely different columns. */
  .par-col-patno { width: 90px; white-space: nowrap; }
  .par-col-date { width: 85px; white-space: nowrap; }
  .par-col-time { width: 65px; white-space: nowrap; }
  .par-col-type { width: 65px; white-space: nowrap; text-align: center; }

  /* Same green/amber Cash/HMO convention as the on-screen StatusBadge
     (dashboards.css .status-badge--green/--amber) — dompdf doesn't load
     that stylesheet, so these are a small, scoped re-declaration just for
     this one column rather than a shared class name. */
  .par-type-cash, .par-type-hmo {
    display: inline-block;
    padding: 2px 8px;
    font-size: 8.5px;
    font-weight: bold;
    border-radius: 999px;
  }
  .par-type-cash { background: #dcfce7; color: #15803d; }
  .par-type-hmo { background: #fef3c7; color: #b45309; }
  .par-type-provider { display: block; margin-top: 2px; font-size: 7.5px; color: #64748b; white-space: nowrap; }

  /* table-layout: fixed so these widths actually hold — without it, dompdf
     (like most browsers on an "auto" table) can let a long value's content
     push its column wider than intended, which previously meant both
     label columns (same .g-label class on each) pulled 42% apiece, leaving
     the two value columns ~8% each — exactly why long names/addresses were
     wrapping into 3-4 lines. 19%/31% per label/value pair instead. */
  .pdf-grid { width: 100%; margin-bottom: 4px; table-layout: fixed; }
  .pdf-grid td { padding: 6px 9px; font-size: 10px; vertical-align: top; overflow-wrap: break-word; }
  .pdf-grid .g-label { color: #64748b; width: 19%; }
  .pdf-grid .g-value { color: #0f2557; font-weight: bold; width: 31%; }

  .pdf-empty { font-size: 10px; color: #94a3b8; font-style: italic; margin: 0; padding: 8px 12px; }

  .pdf-footer { margin-top: 24px; padding-top: 12px; border-top: 1px solid #e2e8f0; text-align: center; font-size: 9px; color: #64748b; }

  .pdf-signature-row { width: 100%; margin-top: 26px; }
  .pdf-signature-row td { width: 50%; padding: 0 10px; }
  .pdf-signature-line { display: block; border-top: 1px solid #94a3b8; margin-top: 28px; padding-top: 4px; font-size: 8.5px; color: #64748b; text-align: center; }
</style>
