import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { applicationService } from '../services/applicationService';
import { adminService } from '../services/adminService';
import StatusBadge from '../components/StatusBadge';
import { documentService } from '../services/documentService';
import { useAuth } from '../context/AuthContext';

export default function ApplicationReview() {
  const { id } = useParams();
  const [application, setApplication] = useState(null);
  const [documents, setDocuments] = useState([]);
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const { user } = useAuth();
  const [docReason, setDocReason] = useState('');

  useEffect(() => {
    load();
  }, [id]);

  function load() {
    applicationService
      .getById(id)
      .then((res) => {
        setApplication(res.application);
        setDocuments(res.documents || []);
      })
      .catch(() => setError("We couldn't load this application."));
  }

  async function updateDocument(id, status) {
    if (status === 'Rejected' && !docReason.trim()) { setError('Please provide a reason before rejecting a document.'); return; }
    try { await documentService.updateStatus(id, status, docReason); setDocReason(''); load(); } catch (err) { setError(err.response?.data?.message || 'Could not update document.'); }
  }

  async function downloadDocument(id, name) {
    try { const blob = await documentService.download(id); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href=url; a.download=name; a.click(); URL.revokeObjectURL(url); } catch { setError('Could not download the document.'); }
  }

  async function updateStatus(status) {
    setError('');
    if (status === 'Rejected' && !reason.trim()) {
      setError('Please provide a reason before rejecting.');
      return;
    }
    setSaving(true);
    try {
      await adminService.updateStatus(id, status, reason || undefined);
      setReason('');
      load();
    } catch (err) {
      setError(err.response?.data?.message || 'Could not update status.');
    } finally {
      setSaving(false);
    }
  }

  if (error && !application) return <p className="p-10 text-danger text-sm">{error}</p>;
  if (!application) return <p className="p-10 text-slate text-sm">Loading…</p>;

  const p = application.personalInformation || {};
  const a = application.academicInformation || {};

  return (
    <main className="min-h-screen bg-paper px-8 py-10 max-w-2xl">
      <Link to={user?.role === 'FACULTY_COORDINATOR' ? '/faculty/dashboard' : user?.role === 'ADMISSION_OFFICER' ? '/officer/dashboard' : '/admin/dashboard'} className="text-sm text-slate hover:text-ink">
        ← Back to dashboard
      </Link>

      <div className="flex items-center justify-between mt-6">
        <h1 className="font-display text-2xl font-semibold text-ink">
          {application.applicationNumber || 'Draft'}
        </h1>
        <StatusBadge status={application.status} />
      </div>
      <p className="text-slate text-sm mt-1">{application.courseId?.name}</p>

      <Section title="Applicant Information">
        <Row label="Name" value={application.studentId?.name} />
        <Row label="Email" value={application.studentId?.email} />
        <Row label="Phone" value={p.phone} />
        <Row label="Address" value={p.address} />
        <Row label="Gender" value={p.gender} />
      </Section>

      <Section title="Academic Information">
        <Row label="Class X %" value={a.classXPercentage} />
        <Row label="Class XII %" value={a.classXIIPercentage} />
        <Row label="Board" value={a.board} />
        <Row label="Passing year" value={a.passingYear} />
      </Section>

      <Section title="Eligibility">
        <p className={application.eligibility?.isEligible ? 'text-success text-sm' : 'text-danger text-sm'}>
          {application.eligibility?.isEligible ? '✓ Eligible' : '✕ Not eligible'} — {application.eligibility?.rule}
        </p>
      </Section>

      <Section title="Documents">
        {documents.length === 0 && <p className="text-sm text-slate">No documents uploaded yet.</p>}
        <textarea value={docReason} onChange={(e)=>setDocReason(e.target.value)} placeholder="Document rejection reason (required only when rejecting)" rows={2} className="w-full border border-ink/20 rounded-sm px-3 py-2 text-sm mb-3" />
        <ul className="space-y-2">
          {documents.map((d) => (
            <li key={d._id} className="border border-ink/10 rounded-sm p-3 space-y-2">
              <div className="flex flex-wrap justify-between gap-2"><span className="text-ink font-medium">{d.documentType}</span><span className="text-slate">{d.fileName} · {d.status}</span></div>
              <div className="flex flex-wrap gap-2 text-xs"><button onClick={()=>downloadDocument(d._id,d.fileName)} className="border border-ink/20 px-3 py-1.5 rounded-sm">View / Download</button>{d.status!=='Verified'&&<button onClick={()=>updateDocument(d._id,'Verified')} className="border border-success text-success px-3 py-1.5 rounded-sm">Verify</button>}{d.status!=='Rejected'&&<button onClick={()=>updateDocument(d._id,'Rejected')} className="border border-danger text-danger px-3 py-1.5 rounded-sm">Reject</button>}</div>{d.status==='Rejected'&&d.reviewReason&&<p className="text-xs text-danger">Reason: {d.reviewReason}</p>}</li>
          ))}
        </ul>
      </Section>

      {application.reviewRemarks?.length > 0 && (
        <Section title="Application Timeline">
          <ul className="space-y-2">
            {application.reviewRemarks.map((r, i) => (
              <li key={i} className="text-sm text-slate">
                {r.status} — {r.remark} ({new Date(r.at).toLocaleDateString()})
              </li>
            ))}
          </ul>
        </Section>
      )}

      {user?.role !== 'FACULTY_COORDINATOR' && <Section title="Review">
        {error && <p className="text-danger text-sm mb-3">{error}</p>}
        <textarea
          placeholder="Remarks (required if rejecting)"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          className="w-full border border-ink/20 rounded-sm px-3 py-2 text-sm focus:outline-none focus:border-amber"
          rows={3}
        />
        <div className="flex gap-3 mt-3">
          <button
            disabled={saving}
            onClick={() => updateStatus('Under Review')}
            className="border border-ink/20 px-4 py-2 rounded-sm text-sm font-medium hover:border-ink/40 disabled:opacity-60"
          >
            Mark Under Review
          </button>
          <button
            disabled={saving}
            onClick={() => updateStatus('Approved')}
            className="bg-success text-white px-4 py-2 rounded-sm text-sm font-medium hover:opacity-90 disabled:opacity-60"
          >
            Approve
          </button>
          <button
            disabled={saving}
            onClick={() => updateStatus('Rejected')}
            className="bg-danger text-white px-4 py-2 rounded-sm text-sm font-medium hover:opacity-90 disabled:opacity-60"
          >
            Reject
          </button>
        </div>
      </Section>}
    </main>
  );
}

function Section({ title, children }) {
  return (
    <div className="mt-8">
      <h3 className="font-display text-base font-semibold text-ink mb-2">{title}</h3>
      {children}
    </div>
  );
}

function Row({ label, value }) {
  return (
    <div className="flex justify-between text-sm py-1">
      <span className="text-slate">{label}</span>
      <span className="text-ink">{value || '—'}</span>
    </div>
  );
}
