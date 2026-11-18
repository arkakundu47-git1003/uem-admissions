import { useSelector } from 'react-redux';

export function useAuth() {
  const { user, status, waking } = useSelector((s) => s.auth);
  return { user, status, isAuthenticated: status === 'authenticated', isLoading: status === 'loading', isUnavailable: status === 'unavailable', isWaking: !!waking };
}
