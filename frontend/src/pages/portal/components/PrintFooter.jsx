import { MapPinIcon } from '../icons';

// Shared print-only footer — screen-hidden, revealed by @media print, paired
// with PrintLetterhead at the top of the same printed page. The wave echoes
// the wave already inside the real logo icon, not a separate motif invented
// for print specifically.
//
// text: the line shown above the wave. Defaults to the original "San Pedro,
// Laguna" location line (unchanged for the Patient Appointments Report,
// this component's first caller) — the Patient Dental Record and Clinic
// Operations Report pass their own document-identifying line instead,
// exactly what each page's own standalone footer said before switching to
// this shared one.
function PrintFooter({ text = 'Smile Bay Dental Clinic — San Pedro, Laguna' }) {
  return (
    <div className="print-footer">
      <p className="print-footer-line">
        <MapPinIcon /> {text}
      </p>
      <svg className="print-footer-wave" viewBox="0 0 900 70" preserveAspectRatio="none" aria-hidden="true">
        <path d="M0 30 C 150 60, 300 0, 450 25 C 600 50, 750 5, 900 30 L 900 70 L 0 70 Z" fill="#1d4ed8" />
        <path d="M0 40 C 150 65, 300 15, 450 38 C 600 60, 750 20, 900 42 L 900 70 L 0 70 Z" fill="#2952e3" opacity="0.55" />
      </svg>
    </div>
  );
}

export default PrintFooter;
