import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Award, CheckCircle2, Eye, Hourglass, Search, ShieldCheck, ThumbsDown, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { api, parseError } from '../../lib/api';
import { Button } from '../../components/ui/Button';
import { DocBadge, StatusBadge } from '../../components/ui/Badge';
import { Alert, ErrorState, Skeleton } from '../../components/ui/Feedback';
import { Modal } from '../../components/ui/Modal';
import { TextAreaField } from '../../components/ui/Field';
import { StatusTimeline } from '../../components/shared/StatusTimeline';
import { DocumentPreview } from '../../components/shared/DocumentPreview';
import { DOC_TYPES, TRANSITIONS } from '../../lib/constants';
import { fileSize, formatDate, formatINR } from '../../lib/format';

const ACTIONS = {
  under_review: { label: 'Start review', icon: Search, variant: 'secondary' },
  documents_verified: { label: 'Mark documents verified', icon: ShieldCheck, variant: 'primary' },
  accepted: { label: 'Accept', icon: Award, variant: 'success' },
  waitlisted: { label: 'Waitlist', icon: Hourglass, variant: 'secondary', needsRemark: true },
  rejected: { label: 'Reject', icon: ThumbsDown, variant: 'danger', needsRemark: true },
};

export default function ReviewDetail() {
  const { id } = useParams();
  const qc = useQueryClient();
  const [preview, setPreview] = useState(null);
  const [rejectDoc, setRejectDoc] = useState(null);
  const [remark, setRemark] = useState('');
  const [decision, setDecision] = useState(null); // status awaiting confirmation
  const [decisionRemark, setDecisionRemark] = useState('');

  const { data: app, isLoading, error, refetch } = useQuery({ queryKey: ['application', id], queryFn: async () => (await api.get(`/applications/${id}`)).data.application });
  const sync = (a) => { qc.setQueryData(['application', id], (old) => ({ ...old, ...a, course: old?.course, applicant: old?.applicant })); qc.invalidateQueries({ queryKey: ['review'] }); qc.invalidateQueries({ queryKey: ['reports'] }); };

  const reviewDoc = useMutation({
    mutationFn: ({ docId, status, remark: r }) => api.patch(`/review/applications/${id}/documents/${docId}`, { status, remark: r }).then((res) => res.data.application),
    onSuccess: (a, v) => { sync(a); toast.success(v.status === 'verified' ? 'Document verified' : 'Document sent back to applicant'); setRejectDoc(null); setRemark(''); },
    onError: (e) => toast.error(parseError(e).message),
  });
  const setStatus = useMutation({
    mutationFn: ({ status, remarks }) => api.patch(`/review/applications/${id}/status`, { status, remarks }).then((res) => res.data.application),
    onSuccess: (a, v) => { sync(a); toast.success(`Application marked ${v.status.replace('_', ' ')}`); setDecision(null); setDecisionRemark(''); },
    onError: (e) => toast.error(parseError(e).message),
  });

  if (error) return <ErrorState error={error?.response?.status === 404 ? { message: 'Application not found, or outside your department.' } : error} onRetry={refetch} />;
  if (isLoading) return <div className="stack"><Skeleton h={40} w="40%" /><Skeleton h={320} /></div>;

  const c = app.course;
  const p = app.personal;
  const a = app.academic;
  const docsLocked = !['submitted', 'under_review'].includes(app.status);
  const options = TRANSITIONS[app.status] || [];
  const docByType = (t) => app.documents.find((d) => d.type === t);
  const meets = a.percentage >= c.minPercentage;
  const pendingAction = decision && ACTIONS[decision];

  return (
    <div className="stack-lg">
      <div>
        <Link to="/staff/applications" className="row" style={{ gap: 6, fontSize: 'var(--text-sm)' }}><ArrowLeft size={15} aria-hidden="true" /> Review queue</Link>
        <div className="page-head" style={{ marginTop: 8, marginBottom: 0 }}>
          <div><h1 style={{ fontSize: 'var(--text-2xl)' }}>{p.fullName}</h1><p>{c.code} · {c.name} · <span className="mono">{app.applicationNo}</span></p></div>
          <StatusBadge status={app.status} />
        </div>
      </div>

      <div className="review-grid">
        <div className="stack-lg">
          <section className="card" aria-labelledby="p1"><div className="card-head"><h2 id="p1" style={{ fontSize: 'var(--text-lg)' }}>Applicant</h2></div>
            <div className="card-body form-grid cols-2">
              <dl className="kv"><dt>Name</dt><dd>{p.fullName}</dd><dt>Email</dt><dd>{app.applicant?.email}</dd><dt>Phone</dt><dd>{p.phone}</dd><dt>Date of birth</dt><dd>{formatDate(p.dateOfBirth)}</dd><dt>Gender</dt><dd style={{ textTransform: 'capitalize' }}>{p.gender}</dd></dl>
              <dl className="kv"><dt>Address</dt><dd>{[p.address, p.city, p.state, p.pincode].filter(Boolean).join(', ')}</dd><dt>Guardian</dt><dd>{p.guardianName}</dd><dt>Guardian phone</dt><dd>{p.guardianPhone}</dd></dl>
            </div>
          </section>

          <section className="card" aria-labelledby="p2"><div className="card-head"><h2 id="p2" style={{ fontSize: 'var(--text-lg)' }}>Academic record</h2><span className={`badge ${meets ? 'badge-success' : 'badge-danger'}`}>{meets ? 'Meets' : 'Below'} {c.minPercentage}% minimum</span></div>
            <div className="card-body stack">
              <dl className="kv"><dt>Board</dt><dd>{a.board}</dd><dt>School / college</dt><dd>{a.schoolName}</dd><dt>Passing year</dt><dd>{a.passingYear}</dd><dt>Aggregate</dt><dd><strong>{a.percentage}%</strong></dd>{a.entranceExam && <><dt>Entrance</dt><dd>{a.entranceExam} · {a.entranceScore}</dd></>}<dt>Application fee</dt><dd>{app.payment.status === 'paid' ? `${formatINR(app.payment.amount)} paid` : app.payment.status === 'not_required' ? 'Not required' : 'Unpaid'}</dd></dl>
              {app.statement && <div><h3 style={{ fontSize: 'var(--text-md)', fontFamily: 'var(--font-body)', marginBottom: 4 }}>Statement of purpose</h3><p className="muted">{app.statement}</p></div>}
            </div>
          </section>

          <section className="card" aria-labelledby="p3"><div className="card-head"><h2 id="p3" style={{ fontSize: 'var(--text-lg)' }}>Documents</h2></div>
            <div className="card-body">
              {docsLocked && <Alert tone="info">Documents are locked because the application is {app.status.replace('_', ' ')}.</Alert>}
              {c.requiredDocuments.map((t) => {
                const d = docByType(t);
                return (
                  <div className="doc-row" key={t}>
                    <span className="dz-icon"><Eye size={18} aria-hidden="true" /></span>
                    <div style={{ minWidth: 0 }}>
                      <div className="dz-title">{DOC_TYPES[t]}</div>
                      <div className="dz-meta truncate">{d ? `${d.originalName} · ${fileSize(d.size)}` : 'Not uploaded'}</div>
                      {d?.status === 'rejected' && d.remark && <div className="dz-meta" style={{ color: 'var(--danger)' }}>Sent back: {d.remark}</div>}
                      {d && <div style={{ marginTop: 6 }}><DocBadge status={d.status} /></div>}
                    </div>
                    {d && (
                      <div className="doc-actions row" style={{ gap: 6, flexWrap: 'nowrap' }}>
                        <Button size="sm" onClick={() => setPreview(d)}>View</Button>
                        <Button size="sm" variant="success" disabled={docsLocked || d.status === 'verified'} loading={reviewDoc.isPending && reviewDoc.variables?.docId === d._id && reviewDoc.variables.status === 'verified'} icon={<CheckCircle2 size={15} />} onClick={() => reviewDoc.mutate({ docId: d._id, status: 'verified' })} aria-label={`Verify ${DOC_TYPES[t]}`}>Verify</Button>
                        <Button size="sm" variant="danger" disabled={docsLocked || d.status === 'rejected'} icon={<XCircle size={15} />} onClick={() => setRejectDoc(d)} aria-label={`Reject ${DOC_TYPES[t]}`}>Reject</Button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        </div>

        <aside className="stack-lg review-side" aria-label="Decision">
          <section className="card" aria-labelledby="dec">
            <div className="card-head"><h2 id="dec" style={{ fontSize: 'var(--text-lg)' }}>Decision</h2></div>
            <div className="card-body stack">
              {options.length === 0 ? <Alert tone={app.status === 'accepted' ? 'success' : 'danger'}>This application is finalised ({app.status}).</Alert> : options.map((s) => {
                const act = ACTIONS[s];
                return <Button key={s} variant={act.variant} block icon={<act.icon size={17} />} onClick={() => (act.needsRemark || s === 'accepted' ? setDecision(s) : setStatus.mutate({ status: s }))} loading={setStatus.isPending && setStatus.variables?.status === s && !decision}>{act.label}</Button>;
              })}
              {app.decision?.remarks && <p className="muted" style={{ fontSize: 'var(--text-sm)' }}>Last remark: {app.decision.remarks}</p>}
            </div>
          </section>
          <section className="card" aria-labelledby="hist"><div className="card-head"><h2 id="hist" style={{ fontSize: 'var(--text-lg)' }}>History</h2></div><div className="card-body"><StatusTimeline history={app.history} status={app.status} /></div></section>
        </aside>
      </div>

      <DocumentPreview appId={app._id} doc={preview} onClose={() => setPreview(null)} />

      <Modal open={!!rejectDoc} onClose={() => setRejectDoc(null)} title="Send document back" description={rejectDoc ? `${DOC_TYPES[rejectDoc.type]} — tell the applicant what to fix.` : ''}
        footer={<><Button onClick={() => setRejectDoc(null)}>Cancel</Button><Button variant="danger" loading={reviewDoc.isPending} disabled={remark.trim().length < 3} onClick={() => reviewDoc.mutate({ docId: rejectDoc._id, status: 'rejected', remark: remark.trim() })}>Send back</Button></>}>
        <TextAreaField data-autofocus label="Reason" required value={remark} onChange={(e) => setRemark(e.target.value)} placeholder="e.g. The scan is blurry — please upload a clearer copy." maxLength={300} />
      </Modal>

      <Modal open={!!decision} onClose={() => setDecision(null)} title={pendingAction ? `${pendingAction.label} application` : ''} description={`${p.fullName} · ${c.code}`}
        footer={<><Button onClick={() => setDecision(null)}>Cancel</Button><Button variant={pendingAction?.variant === 'secondary' ? 'primary' : pendingAction?.variant} loading={setStatus.isPending} disabled={pendingAction?.needsRemark && decisionRemark.trim().length < 3} onClick={() => setStatus.mutate({ status: decision, remarks: decisionRemark.trim() || undefined })}>Confirm</Button></>}>
        <div className="stack">
          <p className="muted">The applicant will be notified immediately.</p>
          <TextAreaField data-autofocus label={`Remarks${pendingAction?.needsRemark ? '' : ' (optional)'}`} required={pendingAction?.needsRemark} value={decisionRemark} onChange={(e) => setDecisionRemark(e.target.value)} maxLength={500} />
        </div>
      </Modal>
    </div>
  );
}
