import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ClipboardCheck, FileUp, GraduationCap, Radar } from 'lucide-react';
import { Brand, ThemeToggle } from '../../layouts/PublicLayout';

const POINTS = [
  { icon: ClipboardCheck, text: 'One guided form that autosaves your progress' },
  { icon: FileUp, text: 'Secure document upload with instant feedback' },
  { icon: Radar, text: 'Live status tracking and instant notifications' },
];

export function AuthShell({ title, subtitle, children, footer }) {
  return (
    <div className="auth">
      <a href="#main" className="skip-link">Skip to main content</a>
      <aside className="auth-aside" aria-hidden="false">
        <div className="brand" style={{ color: '#fff' }}>
          <span className="brand-mark"><GraduationCap size={22} aria-hidden="true" /></span>
          <span className="brand-name"><strong>IEM Admissions</strong><small style={{ color: '#9fb0d8' }}>Kolkata</small></span>
        </div>
        <div style={{ position: 'relative', zIndex: 1 }}>
          <h2>Begin your journey at IEM.</h2>
          <p>Apply to leading engineering and management programmes with a portal built to be fast, clear and secure.</p>
          <ul>
            {POINTS.map((p, i) => (
              <motion.li key={p.text} initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.3 + i * 0.12 }}>
                <span className="ico"><p.icon size={18} aria-hidden="true" /></span>{p.text}
              </motion.li>
            ))}
          </ul>
        </div>
        <small style={{ color: '#9fb0d8', position: 'relative', zIndex: 1 }}>© {new Date().getFullYear()} Institute of Engineering &amp; Management</small>
      </aside>

      <div className="auth-main">
        <div className="row-between" style={{ position: 'absolute', top: 16, left: 16, right: 16 }}>
          <span className="auth-brand-mobile" style={{ display: 'contents' }}><Link to="/" className="btn btn-ghost btn-sm">← Home</Link></span>
          <ThemeToggle />
        </div>
        <motion.main id="main" tabIndex={-1} className="auth-card" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45 }}>
          <div className="stack"><h1 style={{ fontSize: 'var(--text-2xl)' }}>{title}</h1><p className="muted">{subtitle}</p></div>
          {children}
          {footer && <p className="muted" style={{ textAlign: 'center', fontSize: 'var(--text-sm)' }}>{footer}</p>}
        </motion.main>
      </div>
    </div>
  );
}
