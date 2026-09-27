import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { courseService } from '../services/courseService';

export default function Courses() {
  const [courses, setCourses] = useState([]);
  const [search, setSearch] = useState('');
  const [department, setDepartment] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    setLoading(true);
    setError('');
    courseService
      .list({ search: search || undefined, department: department || undefined })
      .then((res) => setCourses(res.courses))
      .catch(() => setError("We couldn't load courses. Please try again."))
      .finally(() => setLoading(false));
  }, [search, department]);

  const departments = [...new Set(courses.map((c) => c.department))];

  return (
    <main className="min-h-screen bg-paper px-8 py-10">
      <h1 className="font-display text-3xl font-semibold text-ink">Programs</h1>
      <p className="text-slate text-sm mt-1">Browse available programs and check eligibility.</p>

      <div className="mt-6 flex gap-3 max-w-lg">
        <input
          type="text"
          placeholder="Search programs…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 border border-ink/20 rounded-sm px-3 py-2 text-sm focus:outline-none focus:border-amber"
        />
        <select
          value={department}
          onChange={(e) => setDepartment(e.target.value)}
          className="border border-ink/20 rounded-sm px-3 py-2 text-sm"
        >
          <option value="">All departments</option>
          {departments.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
      </div>

      {loading && <p className="text-slate text-sm mt-8">Loading programs…</p>}
      {error && <p className="text-danger text-sm mt-8">{error}</p>}
      {!loading && !error && courses.length === 0 && (
        <p className="text-slate text-sm mt-8">No programs match your search.</p>
      )}

      <div className="mt-8 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {courses.map((c) => (
          <Link
            key={c._id}
            to={`/courses/${c._id}`}
            className="border border-ink/10 rounded-sm p-5 hover:border-amber transition-colors bg-white"
          >
            <p className="text-xs text-slate uppercase tracking-wide">{c.department}</p>
            <h2 className="font-display text-lg font-semibold text-ink mt-1">{c.name}</h2>
            <p className="text-sm text-slate mt-2">
              {c.degree} · {c.duration}
            </p>
            <p className="text-xs text-slate mt-3">
              Deadline: {new Date(c.deadline).toLocaleDateString()}
            </p>
            <span className="text-amber text-sm font-medium mt-3 inline-block">View details →</span>
          </Link>
        ))}
      </div>
    </main>
  );
}
