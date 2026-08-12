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

const SERVICES = [
  {
    title: 'Online Appointment Scheduling',
    description:
      'Book an appointment online in minutes. Cash appointments are confirmed instantly, and HMO coverage is verified by our staff before your visit.',
  },
  {
    title: 'Digital Dental Records',
    description:
      'Get 24/7 secure access to your dental history, completed procedures, and past records — right from your patient portal.',
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
    degree: 'Doctor of Dental Medicine, University of the Philippines - Manila',
    licensed: 'Licensed to practice since June 2014',
    specialty:
      'General Dentistry, with further preceptorship in Orthodontics, Cosmetic and Restorative Dentistry',
  },
  {
    name: 'Dr. Rizael Castro',
    photo: drCastroPhoto,
    alt: 'Dr. Rizael Castro, General Dentist at Smile Bay Dental Clinic',
    degree: 'Doctor of Dental Medicine, University of the Philippines - Manila',
    licensed: 'Licensed to practice since December 2013',
    specialty: 'General Dentistry, with further preceptorship in Orthodontics, Endodontics, and Cosmetic Dentistry',
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

const CheckIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
    <polyline points="20 6 9 17 4 12" />
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
          <h2 className="landing-section-title">
            Everything you need, <span className="landing-section-title-accent">online</span>
          </h2>

          <div className="landing-services-grid">
            {SERVICES.map((service) => (
              <div key={service.title} className="landing-glass-card landing-service-card">
                <span className="landing-service-check">
                  <CheckIcon />
                </span>
                <h3>{service.title}</h3>
                <p>{service.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

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
      <section id="dentists" className="landing-section">
        <div className="landing-section-inner">
          <h2 className="landing-section-title">Meet Our Dentists</h2>

          <div className="landing-dentists-grid">
            {DENTISTS.map((dentist) => (
              <div key={dentist.name} className="landing-glass-card landing-dentist-card">
                <img
                  src={dentist.photo}
                  alt={dentist.alt}
                  width={96}
                  height={96}
                  loading="lazy"
                  className="landing-dentist-photo"
                />
                <div className="landing-dentist-info">
                  <h3>{dentist.name}</h3>
                  <p className="landing-dentist-degree">{dentist.degree}</p>
                  <p className="landing-dentist-licensed">{dentist.licensed}</p>
                  <p className="landing-dentist-specialty">{dentist.specialty}</p>
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
