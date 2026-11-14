import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { homeFor } from '../lib/constants';
import { PageLoader } from '../components/ui/Feedback';

/** Redirects guests to login; sends signed-in users with the wrong role to their own home. */
export function RequireRole({ roles }) {
  const { user, isLoading, isAuthenticated } = useAuth();
  const location = useLocation();
  if (isLoading) return <PageLoader label="Restoring your session" />;
  if (!isAuthenticated) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (!roles.includes(user.role)) return <Navigate to={homeFor(user.role)} replace />;
  return <Outlet />;
}

/** Keeps signed-in users away from the login / register pages. */
export function GuestOnly() {
  const { user, isLoading, isAuthenticated } = useAuth();
  if (isLoading) return <PageLoader />;
  if (isAuthenticated) return <Navigate to={homeFor(user.role)} replace />;
  return <Outlet />;
}
