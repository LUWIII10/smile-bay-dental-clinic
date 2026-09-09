import { useState } from 'react';
import { ClockIcon, CheckCircleIcon, ToothIcon, SparkleIcon, BracesIcon, SyringeIcon, BabyIcon, SmileIcon } from '../icons';

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
const SERVICE_ICON_MATCHERS = [
  [/pediatric/i, BabyIcon],
  [/whitening|veneer/i, SparkleIcon],
  [/braces|aligner|retainer|orthodontic/i, BracesIcon],
  [/extraction|root canal|implant|sedation/i, SyringeIcon],
  [/gum|denture|tmj|cleaning/i, SmileIcon],
];

function iconForService(name) {
  const match = SERVICE_ICON_MATCHERS.find(([pattern]) => pattern.test(name));
  return match ? match[1] : ToothIcon;
}

// Category chips + a 2-column service-card grid for the booking wizard's
// service step. No description shown per card — the services table's
// `description` column exists but is empty for all 20 real procedures, so
// showing it would mean inventing copy that isn't actually in our data.
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
