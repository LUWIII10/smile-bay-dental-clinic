import { useState } from 'react';
import { ClockIcon, CheckCircleIcon, ToothIcon, SparkleIcon, BracesIcon, SyringeIcon, PediatricToothIcon } from '../icons';

// Matches the thesis's category order (General Dentistry -> Cosmetic ->
// Orthodontics -> Specialist Services), not alphabetical — chips render in
// this fixed order, filtered to whichever categories actually have
// services so an empty category never shows as a dead chip. Real category
// values are longer than the approved chip copy ("Cosmetic Dentistry" vs.
// "Cosmetic") — CATEGORY_CHIP_LABELS maps display text separately from the
// value actually filtered on, so the chip stays short without touching data.
const CATEGORY_ORDER = ['General Dentistry', 'Cosmetic Dentistry', 'Orthodontics', 'Specialist Services'];
const CATEGORY_CHIP_LABELS = {
  'General Dentistry': 'General Dentistry',
  'Cosmetic Dentistry': 'Cosmetic',
  Orthodontics: 'Orthodontics',
  'Specialist Services': 'Specialist',
};

// Keyword -> icon, checked in order (first match wins), falling back to a
// plain tooth. Name-based rather than a stored icon key on the service
// row, matching how Service::isPediatric() already works server-side —
// avoids a schema change for something purely decorative.
//
// Every icon here is dental-specific (a tooth, a sparkle, a braces wire, a
// syringe) rather than a face or generic emoji-style pictogram — gum/
// denture/TMJ/cleaning/consultation and everything else without a real
// distinct pictogram fall through to the plain tooth default below, since
// a forced "close enough" icon for those would be less honest than a
// shared, accurate one.
const SERVICE_ICON_MATCHERS = [
  [/pediatric/i, PediatricToothIcon],
  [/whitening|veneer/i, SparkleIcon],
  [/braces|aligner|retainer|orthodontic/i, BracesIcon],
  [/extraction|root canal|implant|sedation/i, SyringeIcon],
];

function iconForService(name) {
  const match = SERVICE_ICON_MATCHERS.find(([pattern]) => pattern.test(name));
  return match ? match[1] : ToothIcon;
}

// A plain-Tagalog one-liner under each English procedure name — not every
// patient is familiar with dental terms in English. Keyed by the exact
// service name (not a pattern) since the services table's own
// `description` column is empty for every real procedure and these are
// specific per name, not derivable from a keyword the way the icon above
// is. A service added later with no entry here just shows no subtitle,
// same as before this existed.
const SERVICE_TAGALOG_DESCRIPTIONS = {
  'Comprehensive Dental Consultation / Checkup': 'Pangkalahatang konsultasyon at pagsusuri ng ngipin at gilagid.',
  'Cleaning (Oral Prophylaxis)': 'Paglilinis ng ngipin para tanggalin ang tartar at plaque.',
  'Tooth Filling (Composite - Simple)': 'Pagtatambal ng maliit na butas sa ngipin.',
  'Complex Tooth Filling (Multi-surface)': 'Pagtatambal ng mas malaking sira sa ngipin na may ilang bahagi.',
  'Simple Tooth Extraction': 'Pagbunot ng ngiping hindi komplikado.',
  'Surgical Extraction (Impacted Wisdom Tooth)': 'Operasyon para bunutin ang naipit na wisdom tooth.',
  'Root Canal Therapy (Initial / Single Canal)': 'Paglinis at pagtambal sa loob ng ugat ng ngipin para hindi na kailanganing bunutin.',
  'Crowns (Fitting & Placement)': 'Paglagay ng takip (crown) sa sirang ngipin para protektahan ito.',
  'Dentures (Fitting / Adjustment)': 'Pagsukat o pag-aayos ng pustiso.',
  'Tooth Extraction': 'Pagbunot ng ngipin.',
  'Denture Consultation / Adjustment': 'Konsultasyon o pag-aayos ng pustiso.',
  'Teeth Whitening (In-Clinic)': 'Pagpaputi ng ngipin sa loob ng clinic.',
  'Veneers (Fitting & Consultation)': 'Manipis na takip sa harapang ngipin para gumanda ang itsura.',
  'Gum Recontouring': 'Pag-aayos ng hugis ng gilagid.',
  'Orthodontic Consultation / Adjustment': 'Konsultasyon o pag-aayos ng braces o aligners.',
  'Braces (Installation / Adjustment)': 'Paglagay o pagpapahigpit ng braces.',
  'Clear Aligners (Fitting & Progress Visit)': 'Pagsukat o pagsubaybay sa progreso ng clear aligners (hindi makitang braces).',
  'Retainers (Fitting / Check)': 'Pagsukat o pagsuri sa retainer matapos ang braces.',
  'Braces Consultation': 'Konsultasyon bago maglagay ng braces.',
  'Braces Adjustment': 'Pagpapahigpit o pag-aayos ng braces.',
  'Pediatric Dentistry (General Consultation)': 'Konsultasyong pang-ngipin para sa mga bata.',
  'Dental Implants (Consultation / Surgery)': 'Konsultasyon o operasyon para sa implant (artipisyal na ugat ng ngipin).',
  'TMJ Disorders (Consultation & Triage)': 'Konsultasyon para sa sakit o problema sa panga (TMJ).',
  'Sedation Dentistry (Consultation Add-on)': 'Karagdagang serbisyo para sa pasyenteng kailangan ng pampakalma habang ginagawan ng procedure.',
};

// Category chips + a 2-column service-card grid for the booking wizard's
// service step.
function ServiceSelector({ services, selectedServiceId, onSelect }) {
  const [activeCategory, setActiveCategory] = useState(null);

  const categories = CATEGORY_ORDER.filter((cat) => services.some((s) => s.category === cat));
  const effectiveCategory = activeCategory && categories.includes(activeCategory) ? activeCategory : categories[0];
  const filteredServices = services.filter((s) => s.category === effectiveCategory);

  return (
    <div>
      <div className="service-chips">
        {categories.map((category) => (
          <button
            key={category}
            type="button"
            className={`service-chip${category === effectiveCategory ? ' service-chip--active' : ''}`}
            onClick={() => setActiveCategory(category)}
          >
            {CATEGORY_CHIP_LABELS[category] || category}
          </button>
        ))}
      </div>

      {filteredServices.length === 0 ? (
        <p className="booking-empty-note">No services in this category right now.</p>
      ) : (
        <div className="service-grid">
          {filteredServices.map((service) => {
            const isSelected = service.id === selectedServiceId;
            const Icon = iconForService(service.name);
            return (
              <div
                key={service.id}
                className={`service-card${isSelected ? ' service-card--selected' : ''}`}
                onClick={() => onSelect(service.id)}
              >
                {isSelected && (
                  <span className="service-card-check" aria-hidden="true">
                    <CheckCircleIcon />
                  </span>
                )}
                <span className="service-card-icon">
                  <Icon />
                </span>
                <h4 className="service-card-name">{service.name}</h4>
                {SERVICE_TAGALOG_DESCRIPTIONS[service.name] && (
                  <p className="service-card-tagalog">{SERVICE_TAGALOG_DESCRIPTIONS[service.name]}</p>
                )}
                <span className="service-card-duration">
                  <ClockIcon /> {service.duration_minutes} min
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default ServiceSelector;
