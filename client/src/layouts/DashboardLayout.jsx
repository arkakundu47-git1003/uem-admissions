import { Suspense, useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useDispatch } from 'react-redux';
import { useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Bell, BookOpen, ClipboardList, FileText, LayoutDashboard, LogOut, Megaphone, Menu, ShieldCheck, Users, Search, Globe } from 'lucide-react';
import { Brand, ThemeToggle } from './PublicLayout';
import { Button } from '../components/ui/Button';
import { NotificationBell, useNotifications } from '../components/shared/NotificationBell';
import { PageLoader } from '../components/ui/Feedback';
import { useAuth } from '../hooks/useAuth';
import { logout } from '../store/authSlice';
import { initials } from '../lib/format';
import { ROLE_LABEL } from '../lib/constants';
import { pageVariants } from '../lib/motion';

const NAV = {
  applicant: [
    { section: 'Applicant' },
    { to: '/applicant', label: 'Dashboard', icon: LayoutDashboard, end: true },
    { to: '/courses', label: 'Browse programmes', icon: BookOpen },
    { to: '/applicant/notifications', label: 'Notifications', icon: Bell, badge: true },
  ],
  staff: [
    { section: 'Admissions' },
    { to: '/staff', label: 'Overview', icon: LayoutDashboard, end: true },
    { to: '/staff/applications', label: 'Applications', icon: ClipboardList },
    { to: '/staff/notifications', label: 'Notifications', icon: Bell, badge: true },
  ],
  admin: [
    { section: 'Administration' },
    { to: '/admin/courses', label: 'Programmes', icon: BookOpen },
    { to: '/admin/users', label: 'Users & audit', icon: Users },
    { to: '/admin/announcements', label: 'Announcements', icon: Megaphone },
  ],
};

export default function DashboardLayout({ area }) {
  const { user } = useAuth();
  const dispatch = useDispatch();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const { data: notif } = useNotifications();

  useEffect(() => setOpen(false), [location.pathname]);
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  const groups = area === 'applicant' ? [NAV.applicant] : user.role === 'admin' ? [NAV.staff, NAV.admin] : [NAV.staff];
  const notifHref = area === 'applicant' ? '/applicant/notifications' : '/staff/notifications';

  const signOut = async () => {
    await dispatch(logout());
    qc.clear();
    navigate('/', { replace: true });
  };

  return (
    <>
      <a href="#main" className="skip-link">Skip to main content</a>
      <div className="shell">
        {open && <div className="scrim" onClick={() => setOpen(false)} aria-hidden="true" />}
        <aside className="sidebar" data-open={open} aria-label="Sidebar">
          <Brand to={area === 'applicant' ? '/applicant' : '/staff'} />
          <nav aria-label="Dashboard" style={{ display: 'grid', gap: 18 }}>
            {groups.flat().map((item, i) =>
              item.section ? (
                <div key={`s${i}`} className="sidebar-label" style={{ marginTop: i ? 8 : 0 }}>{item.section}</div>
              ) : (
                <NavLink key={item.to} to={item.to} end={item.end} className="side-link">
                  <item.icon size={19} aria-hidden="true" />
                  {item.label}
                  {item.badge && notif?.unread > 0 && <span className="pill" aria-label={`${notif.unread} unread`}>{notif.unread}</span>}
                </NavLink>
              ),
            )}
            <NavLink to="/" className="side-link"><Globe size={19} aria-hidden="true" /> Public site</NavLink>
          </nav>
          <div className="sidebar-foot">
            <span className="avatar" aria-hidden="true">{initials(user.name)}</span>
            <div className="who truncate" style={{ flex: 1 }}>
              <strong className="truncate">{user.name}</strong>
              <small>{ROLE_LABEL[user.role]}</small>
            </div>
            <Button variant="ghost" size="sm" iconOnly onClick={signOut} aria-label="Sign out" style={{ color: '#c8d2ee' }}><LogOut size={18} /></Button>
          </div>
        </aside>

        <div className="main">
          <header className="topbar">
            <Button variant="ghost" iconOnly className="menu-btn" onClick={() => setOpen(true)} aria-label="Open navigation" aria-expanded={open}><Menu size={22} /></Button>
            <span className="topbar-title">{area === 'applicant' ? 'Applicant portal' : user.role === 'admin' ? 'Admin console' : user.role === 'coordinator' ? 'Coordinator console' : 'Officer console'}</span>
            <span className="grow" />
            <ThemeToggle />
            <NotificationBell allHref={notifHref} />
          </header>
          <main id="main" tabIndex={-1} className="content">
            <Suspense fallback={<PageLoader />}>
              <motion.div key={location.pathname} variants={pageVariants} initial="initial" animate="animate">
                <Outlet />
              </motion.div>
            </Suspense>
          </main>
        </div>
      </div>
    </>
  );
}
