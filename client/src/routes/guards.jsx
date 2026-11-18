import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useDispatch } from 'react-redux';
import { bootstrap } from '../store/authSlice';
import { useAuth } from '../hooks/useAuth';
import { homeFor } from '../lib/constants';
import { PageLoader } from '../components/ui/Feedback';

const WAKING = 'Waking up the server. The free hosting plan puts it to sleep when idle, so this can take up to a minute.';

/** Shown instead of a wrong "please sign in" when the server cannot be reached. The session is not lost. */
function ServerUnavailable() {
  const dispatch = useDispatch();
  return (
    <div className="page-loader" role="alert" style={{ padding: 24, textAlign: 'center' }}>
      <div className="stack">
        <h1 style={{ fontSize: '1.75rem' }}>We can’t reach the server</h1>
        <p className="muted">Your session has not been lost. Check your connection and try again; if the server was asleep it may need a moment.</p>
        <div><button type="button" className="btn btn-primary" onClick={() => dispatch(bootstrap())}>Try again</button></div>
      </div>
    </div>
  );
}

/** Redirects guests to login; sends signed-in users with the wrong role to their own home. */
export function RequireRole({ roles }) {
  const { user, isLoading, isAuthenticated, isUnavailable, isWaking } = useAuth();
  const location = useLocation();
  if (isUnavailable) return <ServerUnavailable />;
  if (isLoading) return <PageLoader label={isWaking ? WAKING : 'Restoring your session'} showLabel={isWaking} />;
  if (!isAuthenticated) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (!roles.includes(user.role)) return <Navigate to={homeFor(user.role)} replace />;
  return <Outlet />;
}

/** Keeps signed-in users away from the login / register pages. */
export function GuestOnly() {
  const { user, isLoading, isAuthenticated, isUnavailable, isWaking } = useAuth();
  if (isUnavailable) return <ServerUnavailable />;
  if (isLoading) return <PageLoader label={isWaking ? WAKING : 'Loading'} showLabel={isWaking} />;
  if (isAuthenticated) return <Navigate to={homeFor(user.role)} replace />;
  return <Outlet />;
}
