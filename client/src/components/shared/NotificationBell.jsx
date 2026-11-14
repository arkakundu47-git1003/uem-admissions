import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertTriangle, Bell, CheckCircle2, Info, XCircle } from 'lucide-react';
import { api } from '../../lib/api';
import { timeAgo } from '../../lib/format';
import { Button } from '../ui/Button';

export const NOTIF_ICON = { info: Info, success: CheckCircle2, warning: AlertTriangle, error: XCircle };

export function useNotifications() {
  return useQuery({ queryKey: ['notifications'], queryFn: async () => (await api.get('/notifications')).data, refetchInterval: 60_000 });
}

export function NotificationItem({ n, onOpen }) {
  const Icon = NOTIF_ICON[n.type] || Info;
  return (
    <button type="button" className="notif" data-read={n.read} data-type={n.type} onClick={() => onOpen(n)}>
      <span className="n-ico"><Icon size={18} aria-hidden="true" /></span>
      <span>
        <strong>{n.title}</strong>
        <p>{n.message}</p>
        <p style={{ marginTop: 2 }}>{timeAgo(n.createdAt)}</p>
      </span>
    </button>
  );
}

export function useReadNotification() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const mark = useMutation({
    mutationFn: (id) => api.patch(`/notifications/${id}/read`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  });
  return (n) => {
    if (!n.read) mark.mutate(n._id);
    if (n.link) navigate(n.link);
  };
}

export function NotificationBell({ allHref }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const { data } = useNotifications();
  const qc = useQueryClient();
  const open_ = useReadNotification();
  const readAll = useMutation({ mutationFn: () => api.patch('/notifications/read-all'), onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }) });

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => !ref.current?.contains(e.target) && setOpen(false);
    const onKey = (e) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open]);

  const unread = data?.unread || 0;
  return (
    <div className="bell" ref={ref} style={{ position: 'relative' }}>
      <Button variant="ghost" iconOnly onClick={() => setOpen((o) => !o)} aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`} aria-expanded={open} aria-haspopup="true">
        <Bell size={20} />
        {unread > 0 && <span className="dot" aria-hidden="true">{unread > 9 ? '9+' : unread}</span>}
      </Button>
      <AnimatePresence>
        {open && (
          <motion.div className="dropdown" initial={{ opacity: 0, y: -8, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.16 }}>
            <div className="card-head">
              <h3 style={{ fontSize: 'var(--text-md)' }}>Notifications</h3>
              <Button size="sm" variant="ghost" disabled={!unread} onClick={() => readAll.mutate()}>Mark all read</Button>
            </div>
            <div style={{ maxHeight: 360, overflowY: 'auto' }}>
              {data?.items?.length ? data.items.slice(0, 6).map((n) => <NotificationItem key={n._id} n={n} onOpen={(x) => { setOpen(false); open_(x); }} />) : <p className="muted" style={{ padding: 24, textAlign: 'center' }}>You’re all caught up.</p>}
            </div>
            <div style={{ padding: 10, textAlign: 'center' }}><Link to={allHref} onClick={() => setOpen(false)} style={{ fontWeight: 600, fontSize: 'var(--text-sm)' }}>View all notifications</Link></div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
