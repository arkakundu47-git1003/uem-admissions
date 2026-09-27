import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { courseService } from '../services/courseService';
import { applicationService } from '../services/applicationService';
import { useAuth } from '../context/AuthContext';

export default function CourseDetails() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [course, setCourse] = useState(null);
  const [error, setError] = useState('');
  const [applying, setApplying] = useState(false);

  useEffect(() => {
    courseService
      .getById(id)
      .then((res) => setCourse(res.course))
      .catch(() => setError("We couldn't load this program. Please try again."));
  }, [id]);

  async function handleApply() {
    if (!user) {
      navigate('/login');
      return;
    }
    if (user.role !== 'STUDENT') return;

    setApplying(true);
    try {
      const res = await applicationService.create(course._id);
      navigate(`/student/apply/${res.application._id}`);
    } catch {
      setError('Could not start your application. Please try again.');
    } finally {
      setApplying(false);
    }
  }

  if (error) return <p className="p-10 text-danger text-sm">{error}</p>;
  if (!course) return <p className="p-10 text-slate text-sm">Loading…</p>;

  return (
    <main className="min-h-screen bg-paper px-8 py-10 max-w-2xl">
      <Link to="/courses" className="text-sm text-slate hover:text-ink">
        ← Back to programs
      </Link>

      <p className="text-xs text-slate uppercase tracking-wide mt-6">{course.department}</p>
      <h1 className="font-display text-3xl font-semibold text-ink mt-1">{course.name}</h1>
      <p className="text-slate text-sm mt-2">
        {course.degree} · {course.duration}
      </p>

      <Section title="Program Overview">{course.description}</Section>
      <Section title="Eligibility">{course.eligibility}</Section>
      <Section title="Required Documents">
        <ul className="list-disc list-inside text-sm text-slate space-y-1">
          {course.requiredDocuments.map((d) => (
            <li key={d}>{d}</li>
          ))}
        </ul>
      </Section>
      <Section title="Important Deadline">
        {new Date(course.deadline).toLocaleDateString(undefined, {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        })}
      </Section>

      {error && <p className="text-danger text-sm mt-4">{error}</p>}

      <button
        onClick={handleApply}
        disabled={applying}
        className="mt-8 bg-amber text-white px-6 py-2.5 rounded-sm font-medium hover:bg-amber-dark transition-colors disabled:opacity-60"
      >
        {!user
          ? 'Log in to Apply'
          : user.role !== 'STUDENT'
          ? 'Only students can apply'
          : applying
          ? 'Starting application…'
          : 'Apply Now'}
      </button>
    </main>
  );
}

function Section({ title, children }) {
  return (
    <div className="mt-6">
      <h3 className="font-display text-base font-semibold text-ink">{title}</h3>
      <div className="text-sm text-slate mt-1">{children}</div>
    </div>
  );
}
