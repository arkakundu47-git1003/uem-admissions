import { Link, useLocation, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { ArrowLeft, CalendarClock, CheckCircle2, Clock, FileText, IndianRupee, Percent, Users } from 'lucide-react';
import { api } from '../../lib/api';
import { Button } from '../../components/ui/Button';
import { Alert, ErrorState, Skeleton } from '../../components/ui/Feedback';
import { Badge } from '../../components/ui/Badge';
import { useAuth } from '../../hooks/useAuth';
import { DOC_TYPES } from '../../lib/constants';
import { deadlineInfo, formatDate, formatINR } from '../../lib/format';
import { fadeUp, stagger } from '../../lib/motion';

export default function CourseDetailPage() {
  const { id } = useParams();
  const { user, isAuthenticated } = useAuth();
  const location = useLocation();
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ['course', id], queryFn: async () => (await api.get(`/courses/${id}`)).data.course });

  if (error) return <div className="container section"><ErrorState error={error?.response?.status === 404 ? { message: 'This programme could not be found.' } : error} onRetry={refetch} /></div>;
  if (isLoading) return <div className="container section stack"><Skeleton h={40} w="50%" /><Skeleton h={200} /></div>;

  const c = data;
  const dl = deadlineInfo(c.deadline, c.isOpen);
  const closed = dl.tone === 'closed';
  const facts = [
    { icon: Clock, label: 'Duration', value: `${c.durationYears} years` },
    { icon: Users, label: 'Seats', value: c.seats },
    { icon: Percent, label: 'Minimum marks', value: `${c.minPercentage}%` },
    { icon: IndianRupee, label: 'Application fee', value: formatINR(c.applicationFee) },
  ];

  return (
    <>
      <section className="page-hero">
        <div className="container">
          <Link to="/courses" className="row" style={{ color: '#d4ddf5', marginBottom: 14, gap: 6 }}><ArrowLeft size={16} aria-hidden="true" /> All programmes</Link>
          <div className="row" style={{ gap: 8 }}><Badge tone="brand" plain>{c.code}</Badge><Badge tone="info" plain>{c.level === 'UG' ? 'Undergraduate' : 'Postgraduate'}</Badge></div>
          <h1 style={{ marginTop: 10 }}>{c.name}</h1>
          <p>{c.department}</p>
        </div>
      </section>

      <div className="container section-tight" style={{ display: 'grid', gap: 'var(--space-6)', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 340px), 1fr))', alignItems: 'start' }}>
        <motion.div className="stack-lg" variants={stagger} initial="hidden" animate="show" style={{ gridColumn: 'span 1' }}>
          <motion.section variants={fadeUp} className="card card-pad stack" aria-labelledby="about"><h2 id="about" style={{ fontSize: 'var(--text-xl)' }}>About the programme</h2><p>{c.description}</p></motion.section>
          <motion.section variants={fadeUp} className="card card-pad stack" aria-labelledby="elig"><h2 id="elig" style={{ fontSize: 'var(--text-xl)' }}>Eligibility</h2><p>{c.eligibility}</p></motion.section>
          <motion.section variants={fadeUp} className="card card-pad stack" aria-labelledby="docs">
            <h2 id="docs" style={{ fontSize: 'var(--text-xl)' }}>Documents you’ll need</h2>
            <ul className="checklist">{c.requiredDocuments.map((d) => <li key={d}><FileText size={18} className="ok" aria-hidden="true" />{DOC_TYPES[d]}</li>)}</ul>
            <p className="faint" style={{ fontSize: 'var(--text-sm)' }}>Accepted formats: PDF, JPG or PNG up to 5 MB each.</p>
          </motion.section>
        </motion.div>

        <aside className="card card-pad stack" style={{ position: 'sticky', top: 88 }} aria-label="Apply">
          <dl className="stack" style={{ margin: 0 }}>
            {facts.map((f) => (
              <div key={f.label} className="row" style={{ justifyContent: 'space-between', flexWrap: 'nowrap' }}>
                <dt className="row muted" style={{ gap: 10 }}><f.icon size={18} aria-hidden="true" />{f.label}</dt><dd style={{ margin: 0, fontWeight: 700 }}>{f.value}</dd>
              </div>
            ))}
          </dl>
          <hr className="divider" />
          <div className="row-between"><span className="deadline" data-tone={dl.tone}><CalendarClock size={18} aria-hidden="true" /> {dl.label}</span><span className="muted" style={{ fontSize: 'var(--text-sm)' }}>{formatDate(c.deadline)}</span></div>
          {closed ? <Alert tone="warning">Applications for this programme are closed.</Alert>
            : !isAuthenticated ? <Button variant="accent" size="lg" block to="/login" state={{ from: location.pathname }}>Sign in to apply</Button>
            : user.role === 'applicant' ? <Button variant="accent" size="lg" block to={`/applicant/apply/${c._id}`} icon={<CheckCircle2 size={18} />}>Start application</Button>
            : <Alert tone="info">Staff accounts can’t submit applications.</Alert>}
          {!isAuthenticated && !closed && <p className="muted" style={{ fontSize: 'var(--text-sm)', textAlign: 'center' }}>New here? <Link to="/register">Create a free account</Link></p>}
        </aside>
      </div>
    </>
  );
}
