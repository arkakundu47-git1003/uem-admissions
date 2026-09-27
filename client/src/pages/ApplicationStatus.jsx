import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { applicationService } from '../services/applicationService';
import StatusBadge from '../components/StatusBadge';


function timelineFor(app) {
  const steps = [
    { label: 'Application Created', done: true },
    { label: 'Application Submitted', done: !!app.submittedAt },
    { label: 'Documents Submitted', done: !!app._documentsComplete },
    { label: 'Under Review', done: ['Under Review', 'Approved', 'Rejected'].includes(app.status) },
    { label: 'Decision', done: ['Approved', 'Rejected'].includes(app.status) },
  ];
  return steps;
}

export default function ApplicationStatus() {
  const { id } = useParams();
  const [application, setApplication] = useState(null);
  const [error, setError] = useState('');
  const [documents, setDocuments] = useState([]);

  useEffect(() => {
    applicationService
      .getById(id)
      .then((res) => { setApplication(res.application); setDocuments(res.documents || []); })
      .catch(() => setError("We couldn't load this application."));
  }, [id]);

  if (error) return <p className="p-10 text-danger text-sm">{error}</p>;
  if (!application) return <p className="p-10 text-slate text-sm">Loading…</p>;

  const required = application.courseId?.requiredDocuments || [];
  const uploaded = new Set(documents.map((d) => d.documentType));
  application._documentsComplete = required.length > 0 && required.every((d) => uploaded.has(d));
  const steps = timelineFor(application);
  const activeIndex = steps.findLastIndex ? steps.findLastIndex((s) => s.done) : steps.map((s) => s.done).lastIndexOf(true);

  return (
    <main className="min-h-screen bg-paper px-8 py-10 max-w-xl">
      <Link to="/student/dashboard" className="text-sm text-slate hover:text-ink">
        ← Back to dashboard
      </Link>

      <h1 className="font-display text-2xl font-semibold text-ink mt-6">
        {application.applicationNumber || 'Draft Application'}
      </h1>
      <p className="text-slate text-sm mt-1">{application.courseId?.name}</p>
      <div className="mt-3">
        <StatusBadge status={application.status} />
      </div>

      <ol className="mt-8 space-y-4">
        {steps.map((s, i) => (
          <li key={s.label} className="flex items-center gap-3">
            <span
              className={
                s.done
                  ? 'w-6 h-6 rounded-full bg-success text-white text-xs flex items-center justify-center'
                  : i === activeIndex + 1
                  ? 'w-6 h-6 rounded-full bg-amber text-white text-xs flex items-center justify-center'
                  : 'w-6 h-6 rounded-full border border-ink/20 text-slate text-xs flex items-center justify-center'
              }
            >
              {s.done ? '✓' : i === activeIndex + 1 ? '●' : '○'}
            </span>
            <span className={s.done ? 'text-ink text-sm' : 'text-slate text-sm'}>{s.label}</span>
          </li>
        ))}
      </ol>

      {application.reviewRemarks?.length > 0 && (
        <div className="mt-10">
          <h3 className="font-display text-base font-semibold text-ink mb-3">Review Remarks</h3>
          <ul className="space-y-2">
            {application.reviewRemarks.map((r, i) => (
              <li key={i} className="text-sm border border-ink/10 rounded-sm p-3 bg-white">
                <p className="text-ink">{r.remark}</p>
                <p className="text-xs text-slate mt-1">
                  {r.status} · {new Date(r.at).toLocaleDateString()}
                </p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </main>
  );
}
