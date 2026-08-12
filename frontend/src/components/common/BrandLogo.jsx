import { Link } from 'react-router-dom';
import logo from '../../assets/images/logo.png';
import './BrandLogo.css';

/**
 * Reusable Brand Logo Component
 * @param {'blue' | 'white'} variant - 'blue' for light backgrounds, 'white' for dark backgrounds
 * @param {'sm' | 'md' | 'lg'} size - 'sm' (navbar/topbar), 'md' (modals/auth), 'lg' (hero/large displays)
 * @param {string} to - Optional router Link target
 * @param {string} className - Optional additional wrapper classes
 */
function BrandLogo({ variant = 'blue', size = 'md', to, className = '', ...rest }) {
  const Wrapper = to ? Link : 'div';
  const wrapperProps = to ? { to, ...rest } : rest;
  const classes = ['sb-brand-logo', `variant-${variant}`, `size-${size}`, className]
    .filter(Boolean)
    .join(' ');

  return (
    <Wrapper {...wrapperProps} className={classes}>
      <div className="sb-logo-badge">
        <img src={logo} alt="Smile Bay" className="sb-logo-img" />
      </div>

      <div className="sb-text-block">
        <span className="sb-title">Smile Bay</span>
        <span className="sb-subtitle">DENTAL CLINIC</span>
      </div>
    </Wrapper>
  );
}

export default BrandLogo;
