import { useState } from 'react';
import { Link } from 'react-router-dom';
import { FaFacebook, FaInstagram } from 'react-icons/fa';
import BrandLogo from '../components/common/BrandLogo';
import clinicPhoto from '../assets/images/dentalchairbackground.jpg';
import drRamirezPhoto from '../assets/images/dr-ramirez.jpg';
import drCastroPhoto from '../assets/images/dr-castro.jpg';
import medicardLogo from '../assets/images/medicardlogo.png';
import flexicareLogo from '../assets/images/flexicarelogo.png';
import './LandingPage.css';

const NAV_LINKS = [
  { href: '#services', label: 'Services' },
  { href: '#how-it-works', label: 'How It Works' },
  { href: '#dentists', label: 'Our Dentists' },
  { href: '#location', label: 'Location' },
];

const ShieldCheckIcon = () => (
  <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 3l7 3v5c0 5-3.2 8.5-7 10-3.8-1.5-7-5-7-10V6l7-3z" />
    <path d="M8.7 12.2l2.2 2.2 4.2-4.6" />
  </svg>
);

const SparklesIcon = () => (
  <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 3c.4 3 1.6 4.6 4.6 5-3 .4-4.6 1.6-5 5-.4-3.4-2-4.6-5-5 3-.4 4.6-1.6 5-5z" />
    <path d="M18.3 14c.2 1.3.7 1.8 1.9 2-1.2.2-1.7.7-1.9 2-.2-1.3-.7-1.8-1.9-2 1.2-.2 1.7-.7 1.9-2z" />
  </svg>
);

const WrenchIcon = () => (
  <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14.6 6.3a4 4 0 00-5.2 5l-5 5V19h2.8l5-5a4 4 0 005-5.2l-2.5 2.5-1.9-1.9 2.5-2.5z" />
  </svg>
);

const ToothIcon = () => (
  <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 4.2c-1.3 0-2.2.8-3.1.8-.9 0-1.7-.7-2.7-.4-1.4.4-1.9 2.1-1.6 3.9.3 1.8 1.1 3.9 1.8 5.8.5 1.3.9 2.5 1.7 2.6.8.1 1-1.1 1.3-2.2.3-1.1.5-2.1.9-2.1s.6 1 .9 2.1c.3 1.1.5 2.3 1.3 2.2.8-.1 1.2-1.3 1.7-2.6.7-1.9 1.5-4 1.8-5.8.3-1.8-.2-3.5-1.6-3.9-1-.3-1.8.4-2.7.4-.9 0-1.8-.8-3.1-.8z" />
  </svg>
);

const CalendarIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <rect x="4" y="5" width="16" height="15" rx="2" />
    <path d="M4 9.5h16M8 3v4M16 3v4" />
  </svg>
);

const FolderIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 6.5A1.5 1.5 0 015.5 5h4l1.6 2H18.5A1.5 1.5 0 0120 8.5v9A1.5 1.5 0 0118.5 19h-13A1.5 1.5 0 014 17.5v-11z" />
  </svg>
);

// Filled, unlike every other icon in this file — the "Licensed Dentist"
// badge is the one deliberate exception (outline everywhere else).
const FilledCheckCircleIcon = () => (
  <svg width="15" height="15" viewBox="0 0 20 20" fill="currentColor">
    <path
      fillRule="evenodd"
      clipRule="evenodd"
      d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.7-9.7a1 1 0 00-1.4-1.4L9 10.17 7.7 8.88a1 1 0 10-1.4 1.42l2 2a1 1 0 001.4 0l4-4z"
    />
  </svg>
);

// Large, low-opacity decorative tooth silhouette behind the Dentists
// section — reuses ToothIcon's exact outline at a much bigger scale, drawn
// separately so ToothIcon itself stays a normal small 21px glyph.
const DentistsBgTooth = () => (
  <svg
    className="landing-dentists-bg-tooth"
    aria-hidden="true"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="0.6"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M12 4.2c-1.3 0-2.2.8-3.1.8-.9 0-1.7-.7-2.7-.4-1.4.4-1.9 2.1-1.6 3.9.3 1.8 1.1 3.9 1.8 5.8.5 1.3.9 2.5 1.7 2.6.8.1 1-1.1 1.3-2.2.3-1.1.5-2.1.9-2.1s.6 1 .9 2.1c.3 1.1.5 2.3 1.3 2.2.8-.1 1.2-1.3 1.7-2.6.7-1.9 1.5-4 1.8-5.8.3-1.8-.2-3.5-1.6-3.9-1-.3-1.8.4-2.7.4-.9 0-1.8-.8-3.1-.8z" />
  </svg>
);

const SERVICES = [
  {
    title: 'Online Appointment Scheduling',
    description:
      'Book an appointment online in minutes. Cash appointments are confirmed instantly, and HMO coverage is verified by our staff before your visit.',
    icon: CalendarIcon,
  },
  {
    title: 'Digital Dental Records',
    description:
      'Get 24/7 secure access to your dental history, completed procedures, and past records — right from your patient portal.',
    icon: FolderIcon,
  },
];

// The clinic's actual treatments, grouped the way patients think about
// them — replaces the old two-card grid that described the booking system
// itself rather than what's treated. Chips are display-only (no links).
const SERVICE_CATEGORIES = [
  {
    title: 'General & preventive',
    icon: ShieldCheckIcon,
    services: ['Cleaning', 'Fillings', 'Extractions', 'Root canal'],
  },
  {
    title: 'Cosmetic dentistry',
    icon: SparklesIcon,
    services: ['Teeth whitening', 'Veneers', 'Gum recontouring'],
  },
  {
    title: 'Restorative dentistry',
    icon: WrenchIcon,
    services: ['Crowns', 'Dentures', 'Implants'],
  },
  {
    title: 'Orthodontics & specialty',
    icon: ToothIcon,
    services: ['Braces', 'Aligners', 'Retainers', 'TMJ disorders', 'Pediatric dentistry', 'Sedation'],
  },
];

const STEPS = [
  {
    number: 1,
    title: 'Create an account & book online',
    description: 'Sign up and choose a date and service that works for you.',
  },
  {
    number: 2,
    title: 'Get confirmed',
    description: 'Cash appointments confirm instantly; HMO coverage is verified by our staff.',
  },
  {
    number: 3,
    title: 'Visit the clinic',
    description: 'Show up on your scheduled date — we take care of the rest.',
  },
];

const DENTISTS = [
  {
    name: 'Dr. Richelle Ramirez',
    photo: drRamirezPhoto,
    alt: 'Dr. Richelle Ramirez, General Dentist at Smile Bay Dental Clinic',
    degree: 'Doctor of Dental Medicine',
    university: 'University of the Philippines – Manila',
    licenseDate: 'June 2014',
    specializations: ['General Dentistry', 'Orthodontics', 'Cosmetic Dentistry', 'Restorative Dentistry'],
  },
  {
    name: 'Dr. Rizael Castro',
    photo: drCastroPhoto,
    alt: 'Dr. Rizael Castro, General Dentist at Smile Bay Dental Clinic',
    degree: 'Doctor of Dental Medicine',
    university: 'University of the Philippines – Manila',
    licenseDate: 'December 2013',
    specializations: ['General Dentistry', 'Orthodontics', 'Endodontics', 'Cosmetic Dentistry'],
  },
];

const HMO_PARTNERS = [
  { name: 'Medicard', logo: medicardLogo, alt: 'Medicard accredited logo', width: 172, height: 120 },
  { name: 'Flexicare', logo: flexicareLogo, alt: 'Flexicare accredited logo', width: 247, height: 120 },
];

const MAP_EMBED_SRC =
  'https://www.google.com/maps?q=Smile+Bay+Dental+Clinic,+Ground+Floor,+Mega+Building,+National+Highway,+Landayan,+San+Pedro,+Laguna,+Philippines+4023&output=embed';

const DIRECTIONS_URL =
  'https://www.google.com/maps/dir/?api=1&destination=Smile+Bay+Dental+Clinic+Mega+Building+Landayan+San+Pedro+Laguna';

const MenuIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <line x1="4" y1="7" x2="20" y2="7" />
    <line x1="4" y1="12" x2="20" y2="12" />
    <line x1="4" y1="17" x2="20" y2="17" />
  </svg>
);

const CloseIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <line x1="6" y1="6" x2="18" y2="18" />
    <line x1="18" y1="6" x2="6" y2="18" />
  </svg>
);

function LandingPage() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleAnchorClick = (e, href) => {
    e.preventDefault();
    setMobileMenuOpen(false);
    document.querySelector(href)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div className="landing-page">
      {/* ============ Navbar ============ */}
      <header className="landing-navbar">
        <div className="landing-navbar-inner">
          <BrandLogo
            to="/"
            variant="blue"
            size="sm"
            className="landing-navbar-brand"
            onClick={() => setMobileMenuOpen(false)}
          />

          <nav className="landing-navbar-links">
            {NAV_LINKS.map((link) => (
              <a key={link.href} href={link.href} onClick={(e) => handleAnchorClick(e, link.href)}>
                {link.label}
              </a>
            ))}
          </nav>

          <div className="landing-navbar-actions">
            <Link to="/login" className="landing-btn landing-btn--ghost">Sign In</Link>
            <Link to="/register" className="landing-btn landing-btn--solid">Register</Link>
          </div>

          <button
            type="button"
            className="landing-hamburger"
            onClick={() => setMobileMenuOpen((v) => !v)}
            aria-label="Toggle navigation menu"
          >
            {mobileMenuOpen ? <CloseIcon /> : <MenuIcon />}
          </button>
        </div>

        <div className={`landing-mobile-drawer${mobileMenuOpen ? ' landing-mobile-drawer--open' : ''}`}>
          {NAV_LINKS.map((link) => (
            <a key={link.href} href={link.href} onClick={(e) => handleAnchorClick(e, link.href)}>
              {link.label}
            </a>
          ))}
          <div className="landing-mobile-actions">
            <Link to="/login" className="landing-btn landing-btn--ghost" onClick={() => setMobileMenuOpen(false)}>
              Sign In
            </Link>
            <Link to="/register" className="landing-btn landing-btn--solid" onClick={() => setMobileMenuOpen(false)}>
              Register
            </Link>
          </div>
        </div>
      </header>

      {/* ============ Hero ============ */}
      <section className="landing-hero">
        <div className="landing-hero-inner">
          <div className="landing-hero-left">
            <span className="landing-pill-badge">ONLINE DENTAL PORTAL</span>
            <h1 className="landing-hero-heading">
              Book your dental visit online — no phone calls, no waiting.
            </h1>
            <p className="landing-hero-subheading">
              Schedule appointments and access your digital dental records anytime, all in one secure patient portal.
            </p>
            <div className="landing-hero-cta">
              <Link to="/register" className="landing-btn landing-btn--solid landing-btn--lg">
                Book an Appointment
              </Link>
              <Link to="/login" className="landing-hero-signin">Sign In to Portal →</Link>
            </div>
          </div>

          <div className="landing-hero-right">
            <div className="landing-hero-photo-frame">
              <img src={clinicPhoto} alt="Smile Bay Dental Clinic interior" className="landing-hero-photo" />
              <span className="landing-hero-badge">Instant Cash & Verified HMO</span>
            </div>
          </div>
        </div>
      </section>

      {/* ============ Services ============ */}
      <section id="services" className="landing-section">
        <div className="landing-section-inner">
          <div className="landing-services-header">
            <span className="landing-services-eyebrow">Our services</span>
            <h2 className="landing-services-heading">Complete dental care for the whole family</h2>
            <p className="landing-services-subheading">
              From routine cleaning to orthodontics, our licensed dentists handle it all here in Landayan, San Pedro.
            </p>
          </div>

          <div className="landing-category-grid">
            {SERVICE_CATEGORIES.map((category) => (
              <div key={category.title} className="landing-category-card">
                <div className="landing-category-top">
                  <span className="landing-category-icon">
                    <category.icon />
                  </span>
                  <h3>{category.title}</h3>
                </div>
                <div className="landing-service-chips">
                  {category.services.map((service) => (
                    <span key={service} className="landing-service-chip">{service}</span>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div className="landing-services-cta">
            <p>Not sure which service you need? Book a consultation first.</p>
            <Link to="/register" className="landing-btn landing-btn--solid">Book an appointment</Link>
          </div>
        </div>
      </section>

      {/* ============ Why book online (relocated from the old Services cards) ============ */}
      <div className="landing-section-inner">
        <div className="landing-features-band">
          {SERVICES.map((service) => (
            <div key={service.title} className="landing-features-band-item">
              <service.icon />
              <div>
                <h4>{service.title}</h4>
                <p>{service.description}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ============ How It Works ============ */}
      <section id="how-it-works" className="landing-section landing-section--tint">
        <div className="landing-section-inner">
          <h2 className="landing-section-title">How It Works</h2>

          <div className="landing-steps">
            {STEPS.map((step, index) => (
              <div key={step.number} className="landing-step">
                <div className="landing-step-badge">{step.number}</div>
                <h3>{step.title}</h3>
                <p>{step.description}</p>
                {index < STEPS.length - 1 && <span className="landing-step-connector" aria-hidden="true" />}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ============ Dentists ============ */}
      <section id="dentists" className="landing-section landing-dentists-section">
        <span className="landing-dentists-bg-blob" aria-hidden="true" />
        <DentistsBgTooth />

        <div className="landing-section-inner">
          <div className="landing-dentists-header">
            <div className="landing-eyebrow-row">
              <span className="landing-eyebrow-rule" aria-hidden="true" />
              <span className="landing-eyebrow-label">Our dental team</span>
              <span className="landing-eyebrow-rule" aria-hidden="true" />
            </div>
            <h2 className="landing-dentists-heading">Meet Our Dentists</h2>
            <p className="landing-dentists-subheading">
              Experienced dental professionals dedicated to providing personalized care for every smile.
            </p>
          </div>

          <div className="landing-dentists-grid">
            {DENTISTS.map((dentist) => (
              <div key={dentist.name} className="landing-dentist-card">
                <div className="landing-dentist-upper">
                  <img
                    src={dentist.photo}
                    alt={dentist.alt}
                    width={120}
                    height={120}
                    loading="lazy"
                    className="landing-dentist-photo"
                  />
                  <div className="landing-dentist-info">
                    <span className="landing-dentist-badge">
                      <FilledCheckCircleIcon />
                      Licensed Dentist
                    </span>
                    <h3 className="landing-dentist-name">{dentist.name}</h3>
                    <p className="landing-dentist-degree">{dentist.degree}</p>
                    <p className="landing-dentist-university">{dentist.university}</p>
                    <div className="landing-dentist-license">
                      <CalendarIcon />
                      <span>
                        Licensed to practice since <strong>{dentist.licenseDate}</strong>
                      </span>
                    </div>
                  </div>
                </div>

                <hr className="landing-dentist-divider" />

                <div className="landing-dentist-lower">
                  <span className="landing-dentist-spec-label">Specializations</span>
                  <div className="landing-dentist-chips">
                    {dentist.specializations.map((spec) => (
                      <span key={spec} className="landing-dentist-chip">{spec}</span>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ============ HMO Partners ============ */}
      <section className="landing-hmo-strip">
        <div className="landing-section-inner landing-hmo-inner">
          <h2 className="landing-hmo-heading">Accredited HMO Partners</h2>
          <div className="landing-hmo-logos">
            {HMO_PARTNERS.map((partner) => (
              <img
                key={partner.name}
                src={partner.logo}
                alt={partner.alt}
                width={partner.width}
                height={partner.height}
                loading="lazy"
                className="landing-hmo-logo"
              />
            ))}
          </div>
        </div>
      </section>

      {/* ============ Location ============ */}
      <section id="location" className="landing-section">
        <div className="landing-section-inner">
          <h2 className="landing-section-title">Visit Our Clinic</h2>

          <div className="landing-location-grid">
            <div className="landing-glass-card landing-location-card">
              <h3>Smile Bay Dental Clinic</h3>
              <p>Ground Floor, Mega Building, National Highway, Landayan, San Pedro, Laguna, Philippines, 4023</p>

              <dl className="landing-location-details">
                <div>
                  <dt>Hours</dt>
                  <dd>Monday–Saturday, 9:00 AM–6:00 PM<br />Closed Sundays</dd>
                </div>
                <div>
                  <dt>Phone</dt>
                  <dd><a href="tel:+639171323093">0917 132 3093</a></dd>
                </div>
                <div>
                  <dt>Email</dt>
                  <dd><a href="mailto:smilebayph@gmail.com">smilebayph@gmail.com</a></dd>
                </div>
              </dl>
            </div>

            <div className="landing-map-card">
              <iframe
                title="Smile Bay Dental Clinic location"
                src={MAP_EMBED_SRC}
                className="landing-map-iframe"
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
              />
              <a
                href={DIRECTIONS_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="landing-map-directions"
              >
                Get Directions ↗
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* ============ Footer ============ */}
      <footer className="landing-footer">
        <div className="landing-section-inner landing-footer-grid">
          <div className="landing-footer-col">
            <div className="landing-footer-brand">
              <BrandLogo variant="white" size="md" />
            </div>
            <p className="landing-footer-tagline">Online appointments and digital dental records, made simple.</p>
            <div className="landing-footer-social">
              <a href="#" aria-label="Facebook" className="landing-social-icon landing-social-icon--fb">
                <FaFacebook size={24} />
              </a>
              <a href="#" aria-label="Instagram" className="landing-social-icon landing-social-icon--ig">
                <FaInstagram size={24} />
              </a>
            </div>
          </div>

          <div className="landing-footer-col">
            <h4>Explore</h4>
            {NAV_LINKS.map((link) => (
              <a key={link.href} href={link.href} onClick={(e) => handleAnchorClick(e, link.href)}>
                {link.label}
              </a>
            ))}
          </div>

          <div className="landing-footer-col">
            <h4>Patient Portal</h4>
            <Link to="/login">Sign In</Link>
            <Link to="/register">Register</Link>
            <Link to="/forgot-password">Forgot Password</Link>
          </div>

          <div className="landing-footer-col">
            <h4>Contact</h4>
            <p>Monday–Saturday, 9:00 AM–6:00 PM</p>
            <p>Closed Sundays</p>
            <p><a href="tel:+639171323093">0917 132 3093</a></p>
            <p><a href="mailto:smilebayph@gmail.com">smilebayph@gmail.com</a></p>
          </div>
        </div>

        <div className="landing-footer-bottom">
          © 2026 Smile Bay Dental Clinic. All rights reserved.
        </div>
      </footer>
    </div>
  );
}

export default LandingPage;
