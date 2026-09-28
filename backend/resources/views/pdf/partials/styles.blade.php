<style>
  /* Shared by all three PDF reports (clinic-operations-report,
     patient-appointments-report, patient-dental-record) — dompdf's CSS
     support is closer to CSS2.1 than a real browser (no reliable flexbox/
     grid), so this uses tables/blocks for layout instead of the flexbox
     the on-screen @media print versions of these same reports use.
     DejaVu Sans (bundled with dompdf) renders correctly; the app's actual
     'Poppins' web font isn't loaded here. */
  @page { margin: 30px 34px; }

  body { font-family: 'DejaVu Sans', sans-serif; color: #334155; font-size: 10.5px; }

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

  .pdf-letterhead { width: 100%; margin-bottom: 16px; padding-bottom: 14px; border-bottom: 3px solid #2952e3; }
  .pdf-letterhead td { vertical-align: top; }
  .pdf-logo-cell { width: 42px; padding-right: 10px; }
  .pdf-logo-cell img { width: 38px; height: 38px; }
  .pdf-brand-title { font-family: 'Pacifico', 'DejaVu Sans', cursive; font-size: 19px; font-weight: normal; color: #2952e3; }
  .pdf-brand-subtitle { font-size: 8.5px; letter-spacing: 1px; color: #64748b; }
  .pdf-tagline { font-size: 9px; font-style: italic; color: #64748b; padding-top: 6px; margin-top: 8px; border-top: 1px solid #dbeafe; }
  .pdf-contact { font-size: 9px; color: #334155; margin-top: 10px; line-height: 1.6; }

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
  }
  .pdf-meta { width: 100%; margin-top: 10px; }
  .pdf-meta td { padding: 2px 0; font-size: 9.5px; text-align: right; }
  .pdf-meta-label { color: #64748b; font-weight: bold; }
  .pdf-meta-value { color: #0f2557; font-weight: bold; padding-left: 6px; }

  .pdf-section-title {
    background: #eff6ff;
    color: #0f2557;
    font-size: 10.5px;
    font-weight: bold;
    padding: 6px 10px;
    margin: 16px 0 8px;
    text-transform: uppercase;
    letter-spacing: 0.4px;
  }

  .pdf-summary { font-size: 10px; color: #334155; margin: 6px 0 14px; }

  .pdf-table { width: 100%; margin-bottom: 4px; }
  .pdf-table th {
    background: #1d4ed8;
    color: #ffffff;
    text-align: left;
    padding: 6px 8px;
    font-size: 9px;
    text-transform: uppercase;
    letter-spacing: 0.3px;
  }
  .pdf-table td { padding: 6px 8px; font-size: 9.5px; border-bottom: 1px solid #e2e8f0; }
  .pdf-table .num { text-align: right; }
  .pdf-table tfoot td { font-weight: bold; color: #0f2557; border-top: 1.5px solid #cbd5e1; border-bottom: none; }
  .pdf-table-summary td:first-child { color: #334155; }
  .pdf-table-summary td.num { color: #0f2557; font-weight: bold; }

  .pdf-grid { width: 100%; margin-bottom: 4px; }
  .pdf-grid td { padding: 3px 4px; font-size: 9.5px; vertical-align: top; }
  .pdf-grid .g-label { color: #64748b; width: 42%; }
  .pdf-grid .g-value { color: #0f2557; font-weight: bold; }

  .pdf-empty { font-size: 9.5px; color: #94a3b8; font-style: italic; margin: 0 0 6px; }

  .pdf-footer { margin-top: 22px; padding-top: 10px; border-top: 1px solid #e2e8f0; text-align: center; font-size: 8.5px; color: #64748b; }

  .pdf-signature-row { width: 100%; margin-top: 26px; }
  .pdf-signature-row td { width: 50%; padding: 0 10px; }
  .pdf-signature-line { display: block; border-top: 1px solid #94a3b8; margin-top: 28px; padding-top: 4px; font-size: 8.5px; color: #64748b; text-align: center; }
</style>
