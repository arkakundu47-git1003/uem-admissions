import { motion } from 'framer-motion';
import { CheckCircle2, Clock, FileCheck2, FilePlus2, Hourglass, Search, Send, XCircle } from 'lucide-react';
import { STATUS_META } from '../../lib/constants';
import { formatDateTime } from '../../lib/format';

const ICON = { draft: FilePlus2, submitted: Send, under_review: Search, documents_verified: FileCheck2, accepted: CheckCircle2, rejected: XCircle, waitlisted: Hourglass };
const TONE = { draft: 'info', submitted: 'info', under_review: 'warning', documents_verified: 'success', accepted: 'success', rejected: 'danger', waitlisted: 'warning' };
const FLOW = ['submitted', 'under_review', 'documents_verified', 'accepted'];

export function StatusTimeline({ history = [], status }) {
  const reached = new Set(history.map((h) => h.status));
  const terminal = ['accepted', 'rejected'].includes(status);
  const upcoming = terminal || status === 'draft' ? [] : FLOW.filter((s) => !reached.has(s));
  const items = [
    ...history.map((h) => ({ key: `${h.status}-${h.at}`, status: h.status, title: STATUS_META[h.status]?.label || h.status, meta: `${formatDateTime(h.at)}${h.byName ? ` · ${h.byName}` : ''}`, note: h.note, tone: TONE[h.status] })),
    ...upcoming.map((s) => ({ key: `next-${s}`, status: s, title: s === 'accepted' ? 'Final decision' : STATUS_META[s].label, meta: 'Upcoming', tone: 'pending' })),
  ];
  return (
    <ol className="timeline" aria-label="Application history">
      {items.map((it, i) => {
        const Icon = it.tone === 'pending' ? Clock : ICON[it.status] || Clock;
        return (
          <motion.li key={it.key} data-tone={it.tone} initial={{ opacity: 0, x: -10 }} animate={{ opacity: it.tone === 'pending' ? 0.7 : 1, x: 0 }} transition={{ delay: i * 0.08, duration: 0.35 }}>
            <span className="dot"><Icon size={16} aria-hidden="true" /></span>
            <div>
              <div className="t-title">{it.title}</div>
              <div className="t-meta">{it.meta}</div>
              {it.note && <div className="t-note">{it.note}</div>}
            </div>
          </motion.li>
        );
      })}
    </ol>
  );
}
