import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Award, BookOpen, ClipboardList, Hourglass, Users } from 'lucide-react';
import { api } from '../../lib/api';
import { useAuth } from '../../hooks/useAuth';
import { Counter } from '../../components/ui/Misc';
import { BarChart, Donut, HBars } from '../../components/shared/charts';
import { ErrorState, Skeleton } from '../../components/ui/Feedback';
import { Button } from '../../components/ui/Button';
import { STATUS_META } from '../../lib/constants';
import { fadeUp, stagger } from '../../lib/motion';

const STATUS_COLOR = { submitted: 'var(--chart-1)', under_review: 'var(--chart-2)', documents_verified: 'var(--chart-4)', accepted: 'var(--chart-3)', waitlisted: 'var(--chart-6)', rejected: 'var(--chart-5)' };

export default function StaffOverview() {
  const { user } = useAuth();
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ['reports', 'overview'], queryFn: async () => (await api.get('/reports/overview')).data, refetchInterval: 60_000 });
  if (error) return <ErrorState error={error} onRetry={refetch} />;

  const t = data?.totals;
  const tiles = [
    { label: 'Applications received', value: t?.applications, icon: ClipboardList, tone: 'brand' },
    { label: 'Awaiting review', value: t?.pending, icon: Hourglass, tone: 'warning' },
    { label: 'Accepted', value: t?.accepted, icon: Award, tone: 'success' },
    user.role === 'admin' ? { label: 'Registered applicants', value: t?.applicants, icon: Users, tone: 'info' } : { label: 'Programmes open', value: t?.openCourses, icon: BookOpen, tone: 'info' },
  ];

  return (
    <div className="stack-lg">
      <div className="page-head" style={{ marginBottom: 0 }}>
        <div><h1 style={{ fontSize: 'var(--text-2xl)' }}>Admissions overview</h1><p>{user.role === 'coordinator' ? `Applications for ${user.department}` : 'Live snapshot across all programmes'}</p></div>
        <Button variant="primary" to="/staff/applications">Open review queue</Button>
      </div>

      <motion.div className="stat-grid" variants={stagger} initial="hidden" animate="show">
        {tiles.map((s) => (
          <motion.div key={s.label} variants={fadeUp} className="card stat" data-tone={s.tone}>
            <span className="stat-ico"><s.icon size={24} aria-hidden="true" /></span>
            <div><div className="stat-val">{isLoading ? '–' : <Counter value={s.value ?? 0} />}</div><div className="stat-label">{s.label}</div></div>
          </motion.div>
        ))}
      </motion.div>

      <div className="dash-grid">
        <section className="card chart-card" aria-labelledby="c1">
          <h2 id="c1" style={{ fontSize: 'var(--text-lg)', marginBottom: 12 }}>Submissions · last 14 days</h2>
          {isLoading ? <Skeleton h={190} /> : <BarChart data={data.daily} />}
        </section>
        <section className="card chart-card" aria-labelledby="c2">
          <h2 id="c2" style={{ fontSize: 'var(--text-lg)', marginBottom: 12 }}>By status</h2>
          {isLoading ? <Skeleton h={190} /> : <Donut centerLabel="Applications" items={Object.entries(data.byStatus).map(([k, v]) => ({ label: STATUS_META[k].label, value: v, color: STATUS_COLOR[k] }))} />}
        </section>
      </div>

      <section className="card chart-card" aria-labelledby="c3">
        <div className="row-between" style={{ marginBottom: 14 }}><h2 id="c3" style={{ fontSize: 'var(--text-lg)' }}>Most-applied programmes</h2><Link to="/staff/applications" style={{ fontSize: 'var(--text-sm)', fontWeight: 600 }}>See all applications</Link></div>
        {isLoading ? <Skeleton h={120} /> : data.byCourse.length ? <HBars items={data.byCourse.map((c) => ({ label: c.code, title: c.name, value: c.count }))} /> : <p className="muted">No applications yet.</p>}
      </section>
    </div>
  );
}
