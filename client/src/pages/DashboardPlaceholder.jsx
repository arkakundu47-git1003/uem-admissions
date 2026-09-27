import { useAuth } from '../context/AuthContext';

export default function DashboardPlaceholder() {
  const { user, logout } = useAuth();

  return (
    <main className="min-h-screen bg-paper px-8 py-10">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-2xl font-semibold text-ink">
          Welcome back, {user?.name?.split(' ')[0]}.
        </h1>
        <button onClick={logout} className="text-sm text-slate hover:text-ink">
          Log out
        </button>
      </div>
      <p className="text-slate text-sm mt-2">
        Role: <span className="font-medium text-ink">{user?.role}</span>
      </p>
      <p className="text-slate text-sm mt-8 max-w-md">
        This is a placeholder landing spot for your role. The real dashboard
        (application tracker for students, review queue for officers/admins)
        is built in a later stage.
      </p>
    </main>
  );
}
