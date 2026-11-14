import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { ArrowRight, CalendarClock, CheckCircle2, FileUp, Megaphone, Search, ShieldCheck, Sparkles, UserPlus, Send, BadgeCheck } from 'lucide-react';
import { api } from '../../lib/api';
import { Button } from '../../components/ui/Button';
import { CourseCard } from '../../components/shared/CourseCard';
import { CardSkeletons, Skeleton } from '../../components/ui/Feedback';
import { Counter } from '../../components/ui/Misc';
import { deadlineInfo, formatDate } from '../../lib/format';
import { fadeUp, stagger } from '../../lib/motion';
import { useAuth } from '../../hooks/useAuth';
import { homeFor } from '../../lib/constants';

const STEPS = [
  { icon: UserPlus, title: 'Create your account', text: 'Register in under a minute with your basic contact details.' },
  { icon: Search, title: 'Choose a programme', text: 'Compare eligibility, fees, seats and deadlines side by side.' },
  { icon: FileUp, title: 'Apply & upload documents', text: 'Fill one guided form. Your progress autosaves as you go.' },
  { icon: BadgeCheck, title: 'Track your decision', text: 'Follow every review step live and get notified instantly.' },
];

export default function LandingPage() {
  const { user, isAuthenticated } = useAuth();
  const courses = useQuery({ queryKey: ['courses', 'open'], queryFn: async () => (await api.get('/courses', { params: { open: true } })).data });
  const news = useQuery({ queryKey: ['announcements'], queryFn: async () => (await api.get('/announcements')).data });

  const list = courses.data?.courses || [];
  const next = list[0];
  const seats = list.reduce((a, c) => a + c.seats, 0);

  return (
    <>
      <section className="hero" aria-labelledby="hero-title">
        <div className="container hero-grid">
          <motion.div variants={stagger} initial="hidden" animate="show">
            <motion.span variants={fadeUp} className="eyebrow">Admissions 2026–27 · Now open</motion.span>
            <motion.h1 variants={fadeUp} id="hero-title" style={{ marginTop: 12 }}>Your future starts with <em>one application.</em></motion.h1>
            <motion.p variants={fadeUp} className="lead">Explore programmes, apply online, upload documents securely and follow your admission decision in real time — all from a single portal.</motion.p>
            <motion.div variants={fadeUp} className="hero-cta">
              {isAuthenticated ? (
                <Button variant="accent" size="lg" to={homeFor(user.role)} icon={<ArrowRight size={18} />}>Go to dashboard</Button>
              ) : (
                <Button variant="accent" size="lg" to="/register" icon={<Sparkles size={18} />}>Start your application</Button>
              )}
              <Button size="lg" className="btn-hero-ghost" to="/courses">Browse programmes</Button>
            </motion.div>
            <motion.div variants={fadeUp} className="hero-trust">
              <span><ShieldCheck size={18} aria-hidden="true" /> Encrypted &amp; private</span>
              <span><CheckCircle2 size={18} aria-hidden="true" /> Autosaving form</span>
              <span><CheckCircle2 size={18} aria-hidden="true" /> Live status tracking</span>
            </motion.div>
          </motion.div>

          <motion.div className="hero-panel" initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3, duration: 0.7 }} aria-label="Admissions at a glance">
            <div className="glass-row">
              <div className="glass"><div className="big">{courses.isLoading ? '—' : <Counter value={list.length} />}</div><small>Programmes open</small></div>
              <div className="glass"><div className="big">{courses.isLoading ? '—' : <Counter value={seats} />}</div><small>Seats available</small></div>
            </div>
            <div className="glass" style={{ display: 'grid', gap: 8 }}>
              <span className="row" style={{ gap: 8, color: '#e2b35e', fontWeight: 700, fontSize: 'var(--text-sm)' }}><CalendarClock size={18} aria-hidden="true" /> Next deadline</span>
              {next ? (
                <>
                  <strong style={{ fontFamily: 'var(--font-display)', fontSize: '1.25rem' }}>{next.name}</strong>
                  <small>{formatDate(next.deadline)} · {deadlineInfo(next.deadline).label}</small>
                </>
              ) : <Skeleton h={40} />}
            </div>
            <div className="glass row" style={{ gap: 14 }}>
              <span className="avatar" style={{ background: 'var(--gold-500)', color: '#0b1b44' }} aria-hidden="true"><CheckCircle2 size={20} /></span>
              <div><strong>Documents verified in ~48 hours</strong><br /><small>Officers review submissions in order of arrival.</small></div>
            </div>
          </motion.div>
        </div>
      </section>

      <section className="section" aria-labelledby="how-title">
        <div className="container">
          <div className="section-head"><span className="eyebrow">How it works</span><h2 id="how-title">Four simple steps to admission</h2><p>A guided process designed to take the stress out of applying.</p></div>
          <motion.div className="steps" variants={stagger} initial="hidden" whileInView="show" viewport={{ once: true }}>
            {STEPS.map((s) => (
              <motion.div key={s.title} variants={fadeUp} className="step-card">
                <span className="step-ico"><s.icon size={24} aria-hidden="true" /></span>
                <h3 style={{ fontSize: 'var(--text-lg)' }}>{s.title}</h3>
                <p className="muted" style={{ marginTop: 6 }}>{s.text}</p>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      <section className="section-tight" aria-labelledby="feat-title">
        <div className="container">
          <div className="row-between" style={{ alignItems: 'flex-end', marginBottom: 'var(--space-5)' }}>
            <div className="section-head" style={{ marginBottom: 0 }}><span className="eyebrow">Programmes</span><h2 id="feat-title">Closing soonest</h2></div>
            <Button to="/courses" icon={<ArrowRight size={16} />}>View all programmes</Button>
          </div>
          {courses.isLoading ? <CardSkeletons count={3} /> : (
            <div className="grid-cards">{list.slice(0, 3).map((c, i) => <CourseCard key={c._id} course={c} index={i} />)}</div>
          )}
        </div>
      </section>

      <section className="section" aria-labelledby="news-title">
        <div className="container" style={{ display: 'grid', gap: 'var(--space-6)', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))' }}>
          <div>
            <div className="section-head"><span className="eyebrow">Announcements</span><h2 id="news-title">What’s new</h2></div>
            <div className="stack">
              {news.isLoading && <Skeleton h={90} />}
              {news.data?.items?.slice(0, 3).map((n) => (
                <motion.article key={n._id} className="card card-pad" initial={{ opacity: 0, x: -14 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }}>
                  <div className="row" style={{ gap: 8, color: 'var(--accent)', fontSize: 'var(--text-xs)', fontWeight: 700 }}><Megaphone size={15} aria-hidden="true" />{n.pinned ? 'PINNED · ' : ''}{formatDate(n.createdAt)}</div>
                  <h3 style={{ fontSize: 'var(--text-lg)', margin: '6px 0' }}>{n.title}</h3>
                  <p className="muted">{n.body}</p>
                </motion.article>
              ))}
            </div>
          </div>
          <div className="cta-band" style={{ alignSelf: 'center' }}>
            <h2>Ready to apply?</h2>
            <p>Create a free account and start your application today. Your progress is saved automatically.</p>
            <Button variant="accent" size="lg" to={isAuthenticated ? homeFor(user.role) : '/register'} icon={<Send size={18} />}>{isAuthenticated ? 'Open dashboard' : 'Create free account'}</Button>
          </div>
        </div>
      </section>
    </>
  );
}
