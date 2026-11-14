const dateFmt = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
const dateTimeFmt = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

export const formatDate = (d) => (d ? dateFmt.format(new Date(d)) : '—');
export const formatDateTime = (d) => (d ? dateTimeFmt.format(new Date(d)) : '—');
export const formatINR = (n) => (n ? `₹${Number(n).toLocaleString('en-IN')}` : 'Free');
export const initials = (name = '') =>
  name.split(' ').filter(Boolean).slice(0, 2).map((p) => p[0]).join('').toUpperCase() || '?';
export const fileSize = (bytes = 0) => (bytes > 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);

export function timeAgo(d) {
  const s = Math.floor((Date.now() - new Date(d).getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 604800) return `${Math.floor(s / 86400)}d ago`;
  return formatDate(d);
}

/** Deadline helper -> { label, tone } where tone is urgent | soon | ok | closed */
export function deadlineInfo(deadline, isOpen = true) {
  const days = Math.ceil((new Date(deadline) - Date.now()) / 86400000);
  if (!isOpen || days < 0) return { label: 'Closed', tone: 'closed', days };
  if (days === 0) return { label: 'Closes today', tone: 'urgent', days };
  if (days <= 7) return { label: `${days} day${days > 1 ? 's' : ''} left`, tone: 'urgent', days };
  if (days <= 21) return { label: `${days} days left`, tone: 'soon', days };
  return { label: `${days} days left`, tone: 'ok', days };
}

export const toInputDate = (d) => (d ? new Date(d).toISOString().slice(0, 10) : '');
