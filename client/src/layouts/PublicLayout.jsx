import { useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { GraduationCap, Menu, Moon, Sun, X } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { useAuth } from '../hooks/useAuth';
import { useTheme } from '../hooks/useTheme';
import { homeFor } from '../lib/constants';

const CONTACT_EMAIL = import.meta.env.VITE_CONTACT_EMAIL;
const CONTACT_PHONE = import.meta.env.VITE_CONTACT_PHONE;

export function Brand({ to = '/' }) {
  return (
    <Link to={to} className="brand" aria-label="UEM Admission Portal home">
      <span className="brand-mark"><GraduationCap size={22} aria-hidden="true" /></span>
      <span className="brand-name"><strong>UEM Admissions</strong><small>Kolkata</small></span>
    </Link>
  );
}

export function ThemeToggle() {
  const { theme, toggle } = useTheme();
  return (
    <Button variant="ghost" iconOnly onClick={toggle} aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}>
      {theme === 'dark' ? <Sun size={20} /> : <Moon size={20} />}
    </Button>
  );
}

const LINKS = [
  { to: '/', label: 'Home', end: true },
  { to: '/courses', label: 'Programmes' },
];

export default function PublicLayout() {
  const { user, isAuthenticated } = useAuth();
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();
  const dark = pathname === '/' ? false : false;

  return (
    <>
      <a href="#main" className="skip-link">Skip to main content</a>
      <header className="navbar" data-dark={dark}>
        <div className="container navbar-inner">
          <Brand />
          <nav className="nav-links" aria-label="Primary">
            {LINKS.map((l) => <NavLink key={l.to} to={l.to} end={l.end} className="nav-link">{l.label}</NavLink>)}
          </nav>
          <div className="nav-actions">
            <ThemeToggle />
            {isAuthenticated ? (
              <Button variant="primary" to={homeFor(user.role)}>Dashboard</Button>
            ) : (
              <>
                <Button variant="ghost" to="/login" className="nav-login">Sign in</Button>
                <Button variant="accent" to="/register">Apply now</Button>
              </>
            )}
            <Button variant="ghost" iconOnly className="nav-burger" onClick={() => setOpen((o) => !o)} aria-label={open ? 'Close menu' : 'Open menu'} aria-expanded={open}>
              {open ? <X size={22} /> : <Menu size={22} />}
            </Button>
          </div>
        </div>
        {open && (
          <nav className="mobile-menu" aria-label="Mobile">
            {LINKS.map((l) => <NavLink key={l.to} to={l.to} end={l.end} className="nav-link" onClick={() => setOpen(false)}>{l.label}</NavLink>)}
            {!isAuthenticated && <NavLink to="/login" className="nav-link" onClick={() => setOpen(false)}>Sign in</NavLink>}
          </nav>
        )}
      </header>

      <main id="main" tabIndex={-1}><Outlet /></main>

      <footer className="footer">
        <div className="container footer-grid">
          <div>
            <div className="brand" style={{ color: '#fff', marginBottom: 12 }}>
              <span className="brand-mark"><GraduationCap size={22} aria-hidden="true" /></span>
              <span className="brand-name"><strong>UEM Admissions</strong><small style={{ color: '#9fb0d8' }}>Kolkata</small></span>
            </div>
            <p style={{ maxWidth: '38ch', fontSize: 'var(--text-sm)' }}>A single, secure place to explore programmes, apply, upload documents and follow your admission decision.</p>
          </div>
          <div><h4>Explore</h4><ul><li><Link to="/courses">All programmes</Link></li><li><Link to="/register">Create account</Link></li><li><Link to="/login">Sign in</Link></li></ul></div>
          <div><h4>Support</h4><ul>{CONTACT_EMAIL && <li><a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a></li>}{CONTACT_PHONE && <li>{CONTACT_PHONE}</li>}<li>Mon–Sat, 9am–6pm IST</li></ul></div>
          <div><h4>Portal</h4><ul><li>Secure, encrypted sessions</li><li>WCAG 2.1 AA accessible</li><li>Your data stays private</li></ul></div>
        </div>
        <div className="container footer-bottom">© {new Date().getFullYear()} UEM Admission Portal. Demonstration system — uses simulated admission data.</div>
      </footer>
    </>
  );
}
