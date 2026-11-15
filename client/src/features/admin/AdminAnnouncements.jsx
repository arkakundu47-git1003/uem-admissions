import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Megaphone, Pin, Send, Trash2 } from 'lucide-react';
import { api, parseError } from '../../lib/api';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { EmptyState, Skeleton } from '../../components/ui/Feedback';
import { TextAreaField, TextField } from '../../components/ui/Field';
import { formatDate } from '../../lib/format';

const schema = z.object({ title: z.string().trim().min(3, 'Add a title'), body: z.string().trim().min(5, 'Write the announcement').max(1000, 'Keep it under 1000 characters'), pinned: z.boolean(), emailApplicants: z.boolean() });

export default function AdminAnnouncements() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ['announcements'], queryFn: async () => (await api.get('/announcements')).data.items });
  const { register, handleSubmit, reset, formState: { errors } } = useForm({ resolver: zodResolver(schema), defaultValues: { title: '', body: '', pinned: false, emailApplicants: false } });
  const create = useMutation({
    mutationFn: (v) => api.post('/announcements', v),
    onSuccess: ({ data }) => {
      qc.invalidateQueries({ queryKey: ['announcements'] });
      toast.success(`Published. ${data.notified} applicant${data.notified === 1 ? '' : 's'} notified${data.emailed ? `, ${data.emailed} being emailed${data.emailSkipped ? ` (${data.emailSkipped} skipped: daily email limit)` : ''}` : ''}.`);
      reset();
    },
    onError: (e) => toast.error(parseError(e).message),
  });
  const remove = useMutation({
    mutationFn: (id) => api.delete(`/announcements/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['announcements'] }); toast.success('Announcement removed'); },
    onError: (e) => toast.error(parseError(e).message),
  });

  return (
    <div className="stack-lg">
      <div className="page-head" style={{ marginBottom: 0 }}><div><h1 style={{ fontSize: 'var(--text-2xl)' }}>Announcements</h1><p>Shown on the public homepage and applicant dashboards. Applicants also get a notification.</p></div></div>
      <div className="dash-grid">
        <section className="stack" aria-label="Published announcements">
          {isLoading && <Skeleton h={100} r={18} />}
          {data && !data.length && <div className="card"><EmptyState icon={Megaphone} title="No announcements">Publish one using the form.</EmptyState></div>}
          {data?.map((n) => (
            <article key={n._id} className="card card-pad stack">
              <div className="row-between"><div className="row" style={{ gap: 8 }}>{n.pinned && <Badge tone="warning" plain><Pin size={12} aria-hidden="true" /> Pinned</Badge>}<span className="muted" style={{ fontSize: 'var(--text-xs)' }}>{formatDate(n.createdAt)}</span></div>
                <Button size="sm" variant="ghost" iconOnly aria-label={`Delete ${n.title}`} onClick={() => remove.mutate(n._id)}><Trash2 size={16} /></Button></div>
              <h2 style={{ fontSize: 'var(--text-lg)' }}>{n.title}</h2><p className="muted">{n.body}</p>
            </article>
          ))}
        </section>
        <form className="card card-pad stack" noValidate onSubmit={handleSubmit((v) => create.mutate(v))} aria-label="New announcement" style={{ position: 'sticky', top: 88 }}>
          <h2 style={{ fontSize: 'var(--text-lg)' }}>New announcement</h2>
          <TextField label="Title" required error={errors.title?.message} {...register('title')} />
          <TextAreaField label="Message" required error={errors.body?.message} {...register('body')} />
          <label className="check"><input type="checkbox" {...register('pinned')} /> Pin to the top</label>
          <label className="check"><input type="checkbox" {...register('emailApplicants')} /> Also email all applicants <span className="muted">(everyone gets an in-app notification anyway)</span></label>
          <Button type="submit" variant="primary" loading={create.isPending} icon={<Send size={16} />}>Publish</Button>
        </form>
      </div>
    </div>
  );
}
