import { useMutation, useQueryClient } from '@tanstack/react-query';
import { BellOff, CheckCheck } from 'lucide-react';
import { api } from '../../lib/api';
import { Button } from '../../components/ui/Button';
import { EmptyState, Skeleton } from '../../components/ui/Feedback';
import { NotificationItem, useNotifications, useReadNotification } from '../../components/shared/NotificationBell';

export default function NotificationsPage() {
  const { data, isLoading } = useNotifications();
  const qc = useQueryClient();
  const open = useReadNotification();
  const readAll = useMutation({ mutationFn: () => api.patch('/notifications/read-all'), onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }) });

  return (
    <div className="stack-lg" style={{ maxWidth: 760 }}>
      <div className="page-head" style={{ marginBottom: 0 }}>
        <div><h1 style={{ fontSize: 'var(--text-2xl)' }}>Notifications</h1><p>{data?.unread ? `${data.unread} unread` : 'You’re all caught up'}</p></div>
        <Button icon={<CheckCheck size={16} />} disabled={!data?.unread} loading={readAll.isPending} onClick={() => readAll.mutate()}>Mark all as read</Button>
      </div>
      <div className="card" style={{ overflow: 'hidden' }}>
        {isLoading && <div className="card-body stack"><Skeleton h={50} /><Skeleton h={50} /><Skeleton h={50} /></div>}
        {data && !data.items.length && <EmptyState icon={BellOff} title="Nothing here yet">Status updates and announcements will appear here.</EmptyState>}
        {data?.items.map((n) => <NotificationItem key={n._id} n={n} onOpen={open} />)}
      </div>
    </div>
  );
}
