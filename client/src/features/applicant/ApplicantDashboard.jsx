import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { ArrowRight, Award, CalendarClock, ClipboardList, FilePlus2, Hourglass, Megaphone, Search } from 'lucide-react';
import { api } from '../../lib/api';
import { useAuth } from '../../hooks/useAuth';
import { Button } from '../../components/ui/Button';
import { StatusBadge } from '../../components/ui/Badge';
import { Counter, ProgressBar } from '../../components/ui/Misc';
import { EmptyState, ErrorState, Skeleton } from '../../components/ui/Feedback';
import { STATUS_META } from '../../lib/constants';
import { deadlineInfo, formatDate } from '../../lib/format';
import { fadeUp, stagger } from '../../lib/motion';

const greeting = () => { const h = new Date().getHours(); return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'; };

export default function ApplicantDashboard() {
  const { user } = useAuth();
  const apps = useQuery({ queryKey: ['applications', 'mine'], queryFn: async () => (await api.get('/applications/mine')).data.applications });
  const courses = useQuery({ queryKey: ['courses', 'open'], queryFn: async () => (await api.get('/courses', { params: { open: true } })).data });
  const news = useQuery({ queryKey: ['announcements'], queryFn: async () => (await api.get('/announcements')).data });

  const list = apps.data || [];
  const count = (f) => list.filter(f).length;
  const stats = [
    { label: 'Applications', value: list.length, icon: ClipboardList, tone: 'brand' },
    { label: 'Drafts in progress', value: count((a) => a.status === 'draft'), icon: FilePlus2, tone: 'info' },
    { label: 'Under review', value: count((a) => ['submitted', 'under_review', 'documents_verified', 'waitlisted'].includes(a.status)), icon: Hourglass, tone: 'warning' },
    { label: 'Accepted', value: count((a) => a.status === 'accepted'), icon: Award, tone: 'success' },
  ];
  const applied = new Set(list.map((a) => a.course?._id));
  const suggestions = (courses.data?.courses || []).filter((c) => !applied.has(c._id)).slice(0, 4);

  return (
    <div className="stack-lg">
      <motion.section className="welcome" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
        <h1>{greeting()}, {user.name.split(' ')[0]} 👋</h1>
        <p>{list.length ? 'Here’s where your applications stand today.' : 'Ready to begin? Pick a programme and start your first application.'}</p>
        <div className="row" style={{ marginTop: 16 }}><Button variant="accent" to="/courses" icon={<Search size={16} />}>Browse programmes</Button></div>
      </motion.section>

      <motion.div className="stat-grid" variants={stagger} initial="hidden" animate="show">
        {stats.map((s) => (
          <motion.div key={s.label} variants={fadeUp} className="card stat" data-tone={s.tone}>
            <span className="stat-ico"><s.icon size={24} aria-hidden="true" /></span>
            <div><div className="stat-val">{apps.isLoading ? '–' : <Counter value={s.value} />}</div><div className="stat-label">{s.label}</div></div>
          </motion.div>
        ))}
      </motion.div>

      <div className="dash-grid">
        <section aria-labelledby="my-apps" className="stack">
          <h2 id="my-apps" style={{ fontSize: 'var(--text-xl)' }}>My applications</h2>
          {apps.isLoading && <Skeleton h={150} r={18} />}
          {apps.error && <ErrorState error={apps.error} onRetry={apps.refetch} />}
          {apps.data && !list.length && <div className="card"><EmptyState icon={ClipboardList} title="No applications yet" action={<Button variant="primary" to="/courses">Find a programme</Button>}>When you start an application it will appear here so you can resume or track it.</EmptyState></div>}
          {list.map((a, i) => {
            const m = STATUS_META[a.status];
            return (
              <motion.article key={a._id} className="card card-hover app-card" variants={fadeUp} custom={i} initial="hidden" animate="show">
                <div className="top">
                  <div><h3 style={{ fontSize: 'var(--text-lg)' }}>{a.course?.name}</h3><p className="muted" style={{ fontSize: 'var(--text-sm)' }}>{a.course?.code} · <span className="mono">{a.applicationNo}</span></p></div>
                  <StatusBadge status={a.status} />
                </div>
                <ProgressBar value={m.progress} label={`${a.course?.code} progress`} />
                <div className="row-between">
                  <span className="muted" style={{ fontSize: 'var(--text-sm)' }}>{a.status === 'draft' ? `Step ${Math.min((a.step || 0) + 1, 5)} · last edited ${formatDate(a.updatedAt)}` : `Submitted ${formatDate(a.submittedAt)}`}</span>
                  {a.status === 'draft'
                    ? <Button variant="primary" size="sm" to={`/applicant/apply/${a.course?._id}`} icon={<ArrowRight size={15} />}>Continue</Button>
                    : <Button size="sm" to={`/applicant/applications/${a._id}`}>View status</Button>}
                </div>
              </motion.article>
            );
          })}
        </section>

        <aside className="stack-lg" aria-label="Updates">
          <section className="card" aria-labelledby="dl">
            <div className="card-head"><h3 id="dl">Open for applications</h3><Link to="/courses" style={{ fontSize: 'var(--text-sm)', fontWeight: 600 }}>All</Link></div>
            <div className="card-body stack">
              {courses.isLoading && <Skeleton h={60} />}
              {suggestions.map((c) => { const dl = deadlineInfo(c.deadline); return (
                <Link key={c._id} to={`/courses/${c._id}`} className="row-between" style={{ textDecoration: 'none', color: 'inherit', flexWrap: 'nowrap' }}>
                  <span style={{ minWidth: 0 }}><strong className="truncate" style={{ display: 'block' }}>{c.name}</strong><span className="deadline" data-tone={dl.tone} style={{ fontSize: 'var(--text-xs)' }}><CalendarClock size={13} aria-hidden="true" /> {dl.label}</span></span>
                  <ArrowRight size={16} aria-hidden="true" color="var(--text-faint)" />
                </Link>); })}
              {courses.data && !suggestions.length && <p className="muted">You’ve applied to every open programme.</p>}
            </div>
          </section>
          <section className="card" aria-labelledby="an">
            <div className="card-head"><h3 id="an">Announcements</h3></div>
            <div className="card-body stack">
              {news.data?.items?.slice(0, 3).map((n) => (
                <div key={n._id}><div className="row" style={{ gap: 6, fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}><Megaphone size={13} aria-hidden="true" /> {formatDate(n.createdAt)}</div><strong>{n.title}</strong></div>
              ))}
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}
