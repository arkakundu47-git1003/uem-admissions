import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { BookOpen, Lock, LockOpen, Pencil, Plus, Trash2 } from 'lucide-react';
import { api, parseError } from '../../lib/api';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Alert, EmptyState, ErrorState, Skeleton } from '../../components/ui/Feedback';
import { Modal } from '../../components/ui/Modal';
import { SelectField, TextAreaField, TextField } from '../../components/ui/Field';
import { DOC_TYPES } from '../../lib/constants';
import { deadlineInfo, formatDate, formatINR, toInputDate } from '../../lib/format';

const schema = z.object({
  code: z.string().trim().min(2, 'Enter a course code').max(20),
  name: z.string().trim().min(3, 'Enter the course name'),
  department: z.string().trim().min(2, 'Enter the department'),
  level: z.enum(['UG', 'PG']),
  durationYears: z.coerce.number({ error: 'Enter years' }).min(1, 'At least 1 year').max(6),
  seats: z.coerce.number({ error: 'Enter seats' }).int().min(1, 'At least 1 seat'),
  minPercentage: z.coerce.number({ error: 'Enter a percentage' }).min(0).max(100, 'Maximum 100'),
  applicationFee: z.coerce.number({ error: 'Enter a fee' }).min(0, 'Cannot be negative'),
  deadline: z.string().min(1, 'Pick a deadline'),
  description: z.string().trim().min(10, 'Describe the programme (10+ characters)'),
  eligibility: z.string().trim().min(5, 'Describe the eligibility'),
  requiredDocuments: z.array(z.string()).min(1, 'Select at least one document'),
  tags: z.string().optional(),
  isOpen: z.boolean(),
});

const blank = { code: '', name: '', department: '', level: 'UG', durationYears: 4, seats: 60, minPercentage: 50, applicationFee: 1000, deadline: '', description: '', eligibility: '', requiredDocuments: ['marksheet10', 'marksheet12', 'idProof', 'photo'], tags: '', isOpen: true };

function CourseForm({ course, onClose }) {
  const qc = useQueryClient();
  const editing = !!course;
  const { register, handleSubmit, setError, formState: { errors } } = useForm({
    resolver: zodResolver(schema),
    defaultValues: editing ? { ...course, deadline: toInputDate(course.deadline), tags: (course.tags || []).join(', ') } : blank,
  });
  const save = useMutation({
    mutationFn: (v) => {
      const payload = { ...v, tags: (v.tags || '').split(',').map((t) => t.trim()).filter(Boolean), deadline: new Date(`${v.deadline}T23:59:59`).toISOString() };
      return editing ? api.put(`/courses/${course._id}`, payload) : api.post('/courses', payload);
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['courses'] }); toast.success(editing ? 'Programme updated' : 'Programme created'); onClose(); },
    onError: (e) => {
      const { message, fields } = parseError(e);
      Object.entries(fields).forEach(([k, m]) => setError(k, { message: m }));
      toast.error(message);
    },
  });

  return (
    <form id="course-form" noValidate onSubmit={handleSubmit((v) => save.mutate(v))} className="stack">
      <div className="form-grid cols-2">
        <TextField label="Course code" required placeholder="CSE-BT" error={errors.code?.message} {...register('code')} />
        <SelectField label="Level" required error={errors.level?.message} {...register('level')}><option value="UG">Undergraduate</option><option value="PG">Postgraduate</option></SelectField>
        <div className="span-2"><TextField label="Name" required error={errors.name?.message} {...register('name')} /></div>
        <div className="span-2"><TextField label="Department" required error={errors.department?.message} {...register('department')} /></div>
        <TextField label="Duration (years)" type="number" step="0.5" required error={errors.durationYears?.message} {...register('durationYears')} />
        <TextField label="Seats" type="number" required error={errors.seats?.message} {...register('seats')} />
        <TextField label="Minimum %" type="number" step="0.1" required error={errors.minPercentage?.message} {...register('minPercentage')} />
        <TextField label="Application fee (₹)" type="number" required hint="0 = free" error={errors.applicationFee?.message} {...register('applicationFee')} />
        <TextField label="Deadline" type="date" required error={errors.deadline?.message} {...register('deadline')} />
        <TextField label="Tags" hint="Comma separated" error={errors.tags?.message} {...register('tags')} />
        <div className="span-2"><TextAreaField label="Description" required error={errors.description?.message} {...register('description')} /></div>
        <div className="span-2"><TextAreaField label="Eligibility criteria" required error={errors.eligibility?.message} {...register('eligibility')} /></div>
      </div>
      <fieldset style={{ border: 0, padding: 0, margin: 0 }} aria-describedby={errors.requiredDocuments ? 'docs-err' : undefined}>
        <legend className="field-label" style={{ marginBottom: 8 }}>Required documents</legend>
        <div className="form-grid cols-2">
          {Object.entries(DOC_TYPES).map(([k, label]) => <label key={k} className="check"><input type="checkbox" value={k} {...register('requiredDocuments')} /> {label}</label>)}
        </div>
        {errors.requiredDocuments && <p id="docs-err" className="field-error" role="alert" style={{ marginTop: 6 }}>{errors.requiredDocuments.message}</p>}
      </fieldset>
      <label className="check"><input type="checkbox" {...register('isOpen')} /> Accepting applications</label>
      <div className="modal-foot" style={{ margin: '0 calc(var(--space-5) * -1) calc(var(--space-5) * -1)' }}>
        <Button onClick={onClose}>Cancel</Button>
        <Button type="submit" variant="primary" loading={save.isPending}>{editing ? 'Save changes' : 'Create programme'}</Button>
      </div>
    </form>
  );
}

export default function AdminCourses() {
  const qc = useQueryClient();
  const [form, setForm] = useState(null); // null | 'new' | course
  const [del, setDel] = useState(null);
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ['courses', 'admin'], queryFn: async () => (await api.get('/courses')).data.courses });

  const toggle = useMutation({
    mutationFn: (c) => api.put(`/courses/${c._id}`, { ...c, deadline: c.deadline, isOpen: !c.isOpen }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['courses'] }); toast.success('Programme updated'); },
    onError: (e) => toast.error(parseError(e).message),
  });
  const remove = useMutation({
    mutationFn: (c) => api.delete(`/courses/${c._id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['courses'] }); toast.success('Programme deleted'); setDel(null); },
    onError: (e) => toast.error(parseError(e).message),
  });

  return (
    <div className="stack-lg">
      <div className="page-head" style={{ marginBottom: 0 }}>
        <div><h1 style={{ fontSize: 'var(--text-2xl)' }}>Programmes</h1><p>Create and manage the courses applicants can apply to.</p></div>
        <Button variant="primary" icon={<Plus size={17} />} onClick={() => setForm('new')}>New programme</Button>
      </div>

      <div className="card">
        {error ? <ErrorState error={error} onRetry={refetch} /> : isLoading ? <div className="card-body stack"><Skeleton h={48} /><Skeleton h={48} /><Skeleton h={48} /></div> : !data.length ? <EmptyState icon={BookOpen} title="No programmes yet" action={<Button variant="primary" onClick={() => setForm('new')}>Create the first one</Button>} /> : (
          <div className="table-wrap">
            <table className="table responsive">
              <caption className="sr-only">Programmes</caption>
              <thead><tr><th scope="col">Programme</th><th scope="col">Seats</th><th scope="col">Min %</th><th scope="col">Fee</th><th scope="col">Deadline</th><th scope="col">Status</th><th scope="col"><span className="sr-only">Actions</span></th></tr></thead>
              <tbody>
                {data.map((c) => { const dl = deadlineInfo(c.deadline, c.isOpen); return (
                  <tr key={c._id}>
                    <td data-label="Programme"><div className="cell-title">{c.name}</div><div className="cell-sub">{c.code} · {c.department}</div></td>
                    <td data-label="Seats" className="mono">{c.seats}</td>
                    <td data-label="Min %" className="mono">{c.minPercentage}%</td>
                    <td data-label="Fee">{formatINR(c.applicationFee)}</td>
                    <td data-label="Deadline">{formatDate(c.deadline)}</td>
                    <td data-label="Status"><Badge tone={dl.tone === 'closed' ? 'neutral' : 'success'}>{dl.tone === 'closed' ? 'Closed' : 'Open'}</Badge></td>
                    <td><div className="row" style={{ gap: 4, flexWrap: 'nowrap', justifyContent: 'flex-end' }}>
                      <Button size="sm" iconOnly aria-label={`Edit ${c.code}`} onClick={() => setForm(c)}><Pencil size={15} /></Button>
                      <Button size="sm" iconOnly aria-label={c.isOpen ? `Close ${c.code}` : `Reopen ${c.code}`} onClick={() => toggle.mutate(c)}>{c.isOpen ? <Lock size={15} /> : <LockOpen size={15} />}</Button>
                      <Button size="sm" variant="ghost" iconOnly aria-label={`Delete ${c.code}`} onClick={() => setDel(c)}><Trash2 size={15} /></Button>
                    </div></td>
                  </tr>); })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal open={!!form} onClose={() => setForm(null)} wide title={form === 'new' ? 'New programme' : 'Edit programme'}>
        {form && <CourseForm course={form === 'new' ? null : form} onClose={() => setForm(null)} />}
      </Modal>

      <Modal open={!!del} onClose={() => setDel(null)} title="Delete programme?" footer={<><Button onClick={() => setDel(null)}>Cancel</Button><Button variant="danger" loading={remove.isPending} onClick={() => remove.mutate(del)}>Delete</Button></>}>
        <Alert tone="warning">You are about to delete <strong>{del?.name}</strong>. Programmes with applications can’t be deleted — close them instead.</Alert>
      </Modal>
    </div>
  );
}
