import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { ArrowLeft, CheckCircle2, Receipt, XCircle } from 'lucide-react';
import { api } from '../../lib/api';
import { StatusBadge } from '../../components/ui/Badge';
import { Alert, ErrorState, Skeleton } from '../../components/ui/Feedback';
import { ProgressBar } from '../../components/ui/Misc';
import { StatusTimeline } from '../../components/shared/StatusTimeline';
import { DocumentPreview } from '../../components/shared/DocumentPreview';
import { DocUpload } from './DocUpload';
import { STATUS_META } from '../../lib/constants';
import { formatDate, formatDateTime, formatINR } from '../../lib/format';

export default function ApplicationDetail() {
  const { id } = useParams();
  const qc = useQueryClient();
  const [preview, setPreview] = useState(null);
  const { data: app, isLoading, error, refetch } = useQuery({ queryKey: ['application', id], queryFn: async () => (await api.get(`/applications/${id}`)).data.application, refetchInterval: 45_000 });

  if (error) return <ErrorState error={error?.response?.status === 404 ? { message: 'We couldn’t find that application.' } : error} onRetry={refetch} />;
  if (isLoading) return <div className="stack"><Skeleton h={40} w="50%" /><Skeleton h={260} /></div>;

  const c = app.course;
  const reuploadOpen = ['submitted', 'under_review'].includes(app.status);
  const rejected = app.documents.filter((d) => d.status === 'rejected');
  const update = (a) => qc.setQueryData(['application', id], (old) => ({ ...old, ...a }));

  return (
    <div className="stack-lg">
      <div>
        <Link to="/applicant" className="row" style={{ gap: 6, fontSize: 'var(--text-sm)' }}><ArrowLeft size={15} aria-hidden="true" /> Dashboard</Link>
        <div className="page-head" style={{ marginTop: 8, marginBottom: 0 }}>
          <div><h1 style={{ fontSize: 'var(--text-2xl)' }}>{c.name}</h1><p>{c.code} · <span className="mono">{app.applicationNo}</span> · Submitted {formatDate(app.submittedAt)}</p></div>
          <StatusBadge status={app.status} />
        </div>
        <div style={{ marginTop: 12 }}><ProgressBar value={STATUS_META[app.status].progress} label="Application progress" /></div>
      </div>

      {app.status === 'accepted' && <motion.div initial={{ scale: 0.97, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}><Alert tone="success" title="Congratulations — you’ve been accepted!">{app.decision?.remarks || 'Your admission offer is confirmed.'} The admissions office will contact you with next steps.</Alert></motion.div>}
      {app.status === 'rejected' && <Alert tone="danger" title="Application not successful">{app.decision?.remarks || 'We were unable to offer you a seat this time.'}</Alert>}
      {app.status === 'waitlisted' && <Alert tone="warning" title="You’re on the waiting list">{app.decision?.remarks}</Alert>}
      {rejected.length > 0 && reuploadOpen && <Alert tone="warning" title="Action needed">{rejected.length} document{rejected.length > 1 ? 's need' : ' needs'} to be replaced. Upload a corrected file below.</Alert>}

      <div className="dash-grid">
        <section className="card" aria-labelledby="docs">
          <div className="card-head"><h2 id="docs" style={{ fontSize: 'var(--text-lg)' }}>Documents</h2></div>
          <div className="card-body stack">
            {c.requiredDocuments.map((t) => {
              const doc = app.documents.find((d) => d.type === t);
              return <DocUpload key={t} appId={app._id} type={t} doc={doc} canEdit={reuploadOpen && (!doc || doc.status === 'rejected')} canRemove={false} onChange={update} onPreview={setPreview} />;
            })}
          </div>
        </section>

        <div className="stack-lg">
          <section className="card" aria-labelledby="tl"><div className="card-head"><h2 id="tl" style={{ fontSize: 'var(--text-lg)' }}>Progress</h2></div><div className="card-body"><StatusTimeline history={app.history} status={app.status} /></div></section>
          <section className="card" aria-labelledby="pay">
            <div className="card-head"><h2 id="pay" style={{ fontSize: 'var(--text-lg)' }}>Payment</h2></div>
            <div className="card-body">
              {app.payment.status === 'paid' ? (
                <dl className="kv"><dt>Amount</dt><dd>{formatINR(app.payment.amount)}</dd><dt>Transaction</dt><dd className="mono">{app.payment.transactionId}</dd><dt>Paid on</dt><dd>{formatDateTime(app.payment.paidAt)}</dd></dl>
              ) : <p className="muted row" style={{ gap: 8 }}><Receipt size={18} aria-hidden="true" /> No application fee for this programme.</p>}
            </div>
          </section>
        </div>
      </div>
      <DocumentPreview appId={app._id} doc={preview} onClose={() => setPreview(null)} />
    </div>
  );
}
