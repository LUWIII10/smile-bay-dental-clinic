import { MapPinIcon } from '../icons';

// Shared print-only footer — screen-hidden, revealed by @media print, paired
// with PrintLetterhead at the top of the same printed page.
//
// text: the line shown in the footer. Defaults to the original "San Pedro,
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
    </div>
  );
}

export default PrintFooter;
