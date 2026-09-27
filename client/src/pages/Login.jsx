import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const roleHome = {
  STUDENT: '/student/dashboard',
  ADMISSION_OFFICER: '/officer/dashboard',
  ADMIN: '/admin/dashboard',
  FACULTY_COORDINATOR: '/faculty/dashboard',
};

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: '', password: '' });
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  function update(field) {
    return (e) => setForm((f) => ({ ...f, [field]: e.target.value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const user = await login(form.email, form.password);
      navigate(roleHome[user.role] || '/');
    } catch (err) {
      setError(err.response?.data?.message || 'Login failed. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen bg-paper flex items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <h1 className="font-display text-3xl font-semibold text-ink text-center">
          Welcome back
        </h1>
        <p className="text-slate text-sm text-center mt-2">
          Sign in to continue your admission journey.
        </p>

        <form onSubmit={handleSubmit} className="mt-8 space-y-4">
          {error && (
            <p className="text-danger text-sm bg-danger/10 rounded-sm px-3 py-2">{error}</p>
          )}

          <div>
            <label className="text-sm font-medium text-ink/80">Email</label>
            <input
              type="email"
              required
              value={form.email}
              onChange={update('email')}
              className="mt-1 w-full border border-ink/20 rounded-sm px-3 py-2 text-sm focus:outline-none focus:border-amber"
            />
          </div>

          <div>
            <label className="text-sm font-medium text-ink/80">Password</label>
            <div className="mt-1 flex items-center border border-ink/20 rounded-sm focus-within:border-amber">
              <input
                type={showPassword ? 'text' : 'password'}
                required
                value={form.password}
                onChange={update('password')}
                className="w-full px-3 py-2 text-sm focus:outline-none"
              />
              <button
                type="button"
                onClick={() => setShowPassword((s) => !s)}
                className="px-3 text-xs text-slate"
              >
                {showPassword ? 'Hide' : 'Show'}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full bg-amber text-white py-2.5 rounded-sm font-medium hover:bg-amber-dark transition-colors disabled:opacity-60"
          >
            {submitting ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <p className="text-sm text-slate text-center mt-6">
          New here?{' '}
          <Link to="/register" className="text-amber font-medium">
            Create an account
          </Link>
        </p>
      </div>
    </main>
  );
}
