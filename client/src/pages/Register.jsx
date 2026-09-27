import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const initialForm = {
  name: '',
  email: '',
  phone: '',
  dateOfBirth: '',
  password: '',
  confirmPassword: '',
};

export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState(initialForm);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  function update(field) {
    return (e) => setForm((f) => ({ ...f, [field]: e.target.value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');

    if (form.password !== form.confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setSubmitting(true);
    try {
      await register(form);
      navigate('/login', { state: { justRegistered: true } });
    } catch (err) {
      setError(err.response?.data?.message || 'Registration failed. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen bg-paper flex items-center justify-center px-6 py-12">
      <div className="w-full max-w-sm">
        <h1 className="font-display text-3xl font-semibold text-ink text-center">
          Create your account
        </h1>
        <p className="text-slate text-sm text-center mt-2">
          Start your admission journey in a few minutes.
        </p>

        <form onSubmit={handleSubmit} className="mt-8 space-y-4">
          {error && (
            <p className="text-danger text-sm bg-danger/10 rounded-sm px-3 py-2">{error}</p>
          )}

          <Field label="Full name" type="text" value={form.name} onChange={update('name')} required />
          <Field label="Email" type="email" value={form.email} onChange={update('email')} required />
          <Field label="Phone" type="tel" value={form.phone} onChange={update('phone')} required />
          <Field
            label="Date of birth"
            type="date"
            value={form.dateOfBirth}
            onChange={update('dateOfBirth')}
          />
          <Field
            label="Password"
            type="password"
            value={form.password}
            onChange={update('password')}
            required
            hint="At least 8 characters, including a number"
          />
          <Field
            label="Confirm password"
            type="password"
            value={form.confirmPassword}
            onChange={update('confirmPassword')}
            required
          />

          <button
            type="submit"
            disabled={submitting}
            className="w-full bg-amber text-white py-2.5 rounded-sm font-medium hover:bg-amber-dark transition-colors disabled:opacity-60"
          >
            {submitting ? 'Creating account…' : 'Create account'}
          </button>
        </form>

        <p className="text-sm text-slate text-center mt-6">
          Already have an account?{' '}
          <Link to="/login" className="text-amber font-medium">
            Sign in
          </Link>
        </p>
      </div>
    </main>
  );
}

function Field({ label, hint, ...inputProps }) {
  return (
    <div>
      <label className="text-sm font-medium text-ink/80">{label}</label>
      <input
        {...inputProps}
        className="mt-1 w-full border border-ink/20 rounded-sm px-3 py-2 text-sm focus:outline-none focus:border-amber"
      />
      {hint && <p className="text-xs text-slate mt-1">{hint}</p>}
    </div>
  );
}
