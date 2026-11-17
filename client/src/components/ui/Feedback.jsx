import { AlertTriangle, CheckCircle2, Info, XCircle, Inbox } from 'lucide-react';
import { Button } from './Button';

export const Skeleton = ({ h = 16, w = '100%', r, style }) => (
  <span className="skeleton" aria-hidden="true" style={{ height: h, width: w, borderRadius: r, ...style }} />
);

export const Spinner = ({ large = false, label = 'Loading' }) => (
  <span role="status" aria-label={label}>
    <span className={`spinner ${large ? 'spinner-lg' : ''}`} style={{ display: 'block' }} />
  </span>
);

export const PageLoader = ({ label = 'Loading' }) => (
  <div className="page-loader"><Spinner large label={label} /></div>
);

export function CardSkeletons({ count = 3, h = 190 }) {
  return (
    <div className="grid-cards" role="status" aria-label="Loading">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="card card-pad stack">
          <Skeleton h={20} w="40%" />
          <Skeleton h={24} />
          <Skeleton h={14} w="70%" />
          <Skeleton h={h - 120} />
        </div>
      ))}
    </div>
  );
}

export function EmptyState({ icon: Icon = Inbox, title, children, action, headingLevel: Heading = 'h3' }) {
  return (
    <div className="empty">
      <span className="empty-icon"><Icon size={28} aria-hidden="true" /></span>
      <Heading>{title}</Heading>
      {children && <p>{children}</p>}
      {action}
    </div>
  );
}

export function ErrorState({ error, onRetry, title = 'We couldn’t load this' }) {
  return (
    <div className="empty" role="alert">
      <span className="empty-icon" style={{ background: 'var(--danger-soft)', color: 'var(--danger)' }}><XCircle size={28} aria-hidden="true" /></span>
      <h3>{title}</h3>
      <p>{error?.message || 'Please check your connection and try again.'}</p>
      {onRetry && <Button variant="primary" onClick={onRetry}>Try again</Button>}
    </div>
  );
}

const ICONS = { info: Info, success: CheckCircle2, warning: AlertTriangle, danger: XCircle };
export function Alert({ tone = 'info', title, children, ...rest }) {
  const Icon = ICONS[tone];
  return (
    <div className={`alert alert-${tone}`} role={tone === 'danger' ? 'alert' : 'status'} {...rest}>
      <Icon size={18} aria-hidden="true" />
      <div>
        {title && <strong style={{ display: 'block' }}>{title}</strong>}
        {children}
      </div>
    </div>
  );
}
