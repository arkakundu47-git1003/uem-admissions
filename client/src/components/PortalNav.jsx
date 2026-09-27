import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function PortalNav({ title = 'Admission Portal' }) {
  const { user, logout } = useAuth();
  const dashboard = user?.role === 'STUDENT' ? '/student/dashboard' : user?.role === 'FACULTY_COORDINATOR' ? '/faculty/dashboard' : user ? '/admin/dashboard' : '/';
  return <nav className="border-b border-ink/10 px-5 md:px-8 py-4 flex items-center justify-between bg-paper sticky top-0 z-20">
    <Link to={dashboard} className="font-display text-lg font-semibold">{title}</Link>
    <div className="flex items-center gap-4 text-sm">
      <Link to="/courses" className="text-slate hover:text-ink">Programs</Link>
      {user && <Link to={dashboard} className="text-slate hover:text-ink">Dashboard</Link>}
      {user ? <button onClick={logout} className="text-slate hover:text-ink">Log out</button> : <Link to="/login" className="text-amber font-medium">Log in</Link>}
    </div>
  </nav>;
}
