import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { adminService } from '../services/adminService';
import { useAuth } from '../context/AuthContext';
import StatusBadge from '../components/StatusBadge';


export default function AdminDashboard() {
  const { user, logout } = useAuth();
  const [stats, setStats] = useState(null);
  const [applications, setApplications] = useState([]);
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    adminService.stats().then((res) => setStats(res.stats)).catch(() => {});
  }, []);

  useEffect(() => {
    adminService
      .listApplications({ status: status || undefined, search: search || undefined })
      .then((res) => setApplications(res.applications))
      .catch(() => setError("We couldn't load applications. Please try again."));
  }, [status, search]);

  return (
    <main className="min-h-screen bg-paper px-8 py-10">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-2xl font-semibold text-ink">
          {user?.role === 'ADMIN' ? 'Admin' : 'Admission Officer'} Dashboard
        </h1>
        <div className="flex items-center gap-4"><Link to="/admin/courses" className="text-sm text-amber font-medium">Manage courses</Link><button onClick={logout} className="text-sm text-slate hover:text-ink">Log out</button></div>
      </div>

      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mt-6">
          <StatCard label="Total" value={stats.total} />
          <StatCard label="Submitted" value={stats.Submitted} />
          <StatCard label="Under Review" value={stats['Under Review']} />
          <StatCard label="Approved" value={stats.Approved} />
          <StatCard label="Rejected" value={stats.Rejected} />
        </div>
      )}

      <div className="mt-8 flex gap-3 max-w-lg">
        <input
          type="text"
          placeholder="Search applicant, program, or app #…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 border border-ink/20 rounded-sm px-3 py-2 text-sm focus:outline-none focus:border-amber"
        />
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="border border-ink/20 rounded-sm px-3 py-2 text-sm"
        >
          <option value="">All statuses</option>
          {['Draft', 'Submitted', 'Under Review', 'Approved', 'Rejected'].map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>

      {error && <p className="text-danger text-sm mt-6">{error}</p>}

      <div className="mt-6 bg-white border border-ink/10 rounded-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-indigo/5 text-left text-xs text-slate uppercase tracking-wide">
            <tr>
              <th className="px-4 py-3">Application ID</th>
              <th className="px-4 py-3">Applicant</th>
              <th className="px-4 py-3">Program</th>
              <th className="px-4 py-3">Submitted</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {applications.map((a) => (
              <tr key={a._id} className="border-t border-ink/5">
                <td className="px-4 py-3 text-ink">{a.applicationNumber || '—'}</td>
                <td className="px-4 py-3 text-ink">{a.studentId?.name}</td>
                <td className="px-4 py-3 text-slate">{a.courseId?.name}</td>
                <td className="px-4 py-3 text-slate">
                  {a.submittedAt ? new Date(a.submittedAt).toLocaleDateString() : '—'}
                </td>
                <td className="px-4 py-3">
                  <StatusBadge status={a.status} />
                </td>
                <td className="px-4 py-3">
                  <Link to={`/admin/applications/${a._id}`} className="text-amber text-xs font-medium">
                    Review →
                  </Link>
                </td>
              </tr>
            ))}
            {applications.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-slate text-sm">
                  No applications match these filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}

function StatCard({ label, value }) {
  return (
    <div className="bg-white border border-ink/10 rounded-sm p-4">
      <p className="text-xs text-slate uppercase tracking-wide">{label}</p>
      <p className="font-display text-2xl font-semibold text-ink mt-1">{value ?? 0}</p>
    </div>
  );
}
