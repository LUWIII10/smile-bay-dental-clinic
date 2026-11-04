import medicardLogo from '../../assets/images/medicardlogo.png';
import flexicareLogo from '../../assets/images/flexicarelogo.png';

// Stopgap for the two launch partners, who predate hmo_providers.logo_path
// and have never had a logo uploaded through Settings — same two files the
// landing page's "Accredited HMO Partners" strip already used before it
// read live data. A real uploaded logo_path always wins over this map;
// matched by name, not id, same convention as dentistPhotos.js's
// KNOWN_DENTIST_PHOTOS. Shared between Settings.jsx (admin table) and
// LandingPage.jsx (public HMO partner strip).
export const KNOWN_HMO_PROVIDER_LOGOS = {
  Medicard: medicardLogo,
  Flexicare: flexicareLogo,
};
