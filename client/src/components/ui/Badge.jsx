import { STATUS_META } from '../../lib/constants';

export const Badge = ({ tone = 'neutral', children, plain }) => (
  <span className={`badge badge-${tone} ${plain ? 'badge-plain' : ''}`}>{children}</span>
);

export function StatusBadge({ status }) {
  const m = STATUS_META[status] || STATUS_META.draft;
  return <Badge tone={m.tone}>{m.label}</Badge>;
}

const DOC_TONE = { pending: ['warning', 'Pending review'], verified: ['success', 'Verified'], rejected: ['danger', 'Needs attention'] };
export function DocBadge({ status }) {
  const [tone, label] = DOC_TONE[status] || DOC_TONE.pending;
  return <Badge tone={tone}>{label}</Badge>;
}
