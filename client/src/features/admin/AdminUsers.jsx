import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Search, UserPlus, UserX, UserCheck, KeyRound } from 'lucide-react';
import { api, parseError } from '../../lib/api';
import { useAuth } from '../../hooks/useAuth';
import { useDebounce } from '../../hooks/useDebounce';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { EmptyState, ErrorState, Skeleton } from '../../components/ui/Feedback';
import { FilterTabs, Pagination } from '../../components/ui/Misc';
import { Modal } from '../../components/ui/Modal';
import { PasswordField, SelectField, TextField } from '../../components/ui/Field';
import { ROLE_LABEL } from '../../lib/constants';
import { formatDate, formatDateTime } from '../../lib/format';

const ROLE_TONE = { admin: 'danger', officer: 'brand', coordinator: 'info', applicant: 'neutral' };
const schema = z.object({
  name: z.string().trim().min(2, 'Enter a name'),
  email: z.string().trim().min(1, 'Enter an email').email('Enter a valid email'),
  password: z.string().min(8, 'Use at least 8 characters'),
  role: z.enum(['officer', 'coordinator', 'admin']),
  department: z.string().optional(),
}).refine((v) => v.role !== 'coordinator' || !!v.department, { path: ['department'], message: 'Select a department' });

function NewStaff({ open, onClose }) {
  const qc = useQueryClient();
  const departments = useQuery({ queryKey: ['courses', 'admin'], queryFn: async () => (await api.get('/courses')).data, select: (d) => d.departments, enabled: open });
  const { register, handleSubmit, watch, reset, setError, formState: { errors } } = useForm({ resolver: zodResolver(schema), defaultValues: { name: '', email: '', password: '', role: 'officer', department: '' } });
  const create = useMutation({
    mutationFn: (v) => api.post('/admin/users', v),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin', 'users'] }); toast.success('Staff account created'); reset(); onClose(); },
    onError: (e) => { const { message, fields } = parseError(e); Object.entries(fields).forEach(([k, m]) => setError(k, { message: m })); toast.error(message); },
  });
  return (
    <Modal open={open} onClose={onClose} title="Add staff account" description="They can sign in right away with this temporary password."
      footer={<><Button onClick={onClose}>Cancel</Button><Button type="submit" form="staff-form" variant="primary" loading={create.isPending}>Create account</Button></>}>
      <form id="staff-form" noValidate onSubmit={handleSubmit((v) => create.mutate(v))} className="stack">
        <TextField label="Full name" required error={errors.name?.message} {...register('name')} />
        <TextField label="Email" type="email" required error={errors.email?.message} {...register('email')} />
        <PasswordField label="Temporary password" required error={errors.password?.message} {...register('password')} />
        <SelectField label="Role" required {...register('role')}><option value="officer">Admission officer</option><option value="coordinator">Department coordinator</option><option value="admin">Administrator</option></SelectField>
        {watch('role') === 'coordinator' && <SelectField label="Department" required error={errors.department?.message} {...register('department')}><option value="">Select…</option>{departments.data?.map((d) => <option key={d}>{d}</option>)}</SelectField>}
      </form>
    </Modal>
  );
}

function ResetLinkModal({ info, onClose }) {
  return (
    <Modal open={!!info} onClose={onClose} title="Password reset" description={info?.name}
      footer={<Button variant="primary" onClick={onClose}>Done</Button>}>
      {info?.emailed ? (
        <p>A reset link was emailed to <strong>{info.email}</strong>. It is valid for 30 minutes and works once.</p>
      ) : (
        <div className="stack">
          <p>The email could not be sent (email may not be configured, or the provider rejected it; see the server logs). Give this link to <strong>{info?.email}</strong> through a trusted channel. It is valid for 30 minutes and works once:</p>
          <TextField label="Reset link" readOnly value={info?.resetUrl || ''} onFocus={(e) => e.target.select()} />
        </div>
      )}
    </Modal>
  );
}

function Users() {
  const { user: me } = useAuth();
  const qc = useQueryClient();
  const [role, setRole] = useState('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [adding, setAdding] = useState(false);
  const [resetInfo, setResetInfo] = useState(null);
  const dq = useDebounce(q);
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ['admin', 'users', { role, dq, page }], queryFn: async () => (await api.get('/admin/users', { params: { role: role || undefined, q: dq || undefined, page } })).data, placeholderData: (p) => p });
  const toggle = useMutation({
    mutationFn: (u) => api.patch(`/admin/users/${u._id}`, { isActive: !u.isActive }),
    onSuccess: (_, u) => { qc.invalidateQueries({ queryKey: ['admin', 'users'] }); toast.success(u.isActive ? 'Account deactivated' : 'Account reactivated'); },
    onError: (e) => toast.error(parseError(e).message),
  });
  const sendReset = useMutation({
    mutationFn: (u) => api.post(`/admin/users/${u._id}/reset-password`).then((r) => ({ ...r.data, name: u.name, email: u.email })),
    onSuccess: setResetInfo,
    onError: (e) => toast.error(parseError(e).message),
  });
  const tabs = [{ value: '', label: 'All' }, { value: 'applicant', label: 'Applicants' }, { value: 'officer', label: 'Officers' }, { value: 'coordinator', label: 'Coordinators' }, { value: 'admin', label: 'Admins' }];

  return (
    <div className="stack">
      <div className="row-between"><FilterTabs label="Filter by role" tabs={tabs} value={role} onChange={(v) => { setRole(v); setPage(1); }} /><Button variant="primary" icon={<UserPlus size={17} />} onClick={() => setAdding(true)}>Add staff</Button></div>
      <div className="card">
        <div style={{ padding: 'var(--space-4)', borderBottom: '1px solid var(--border)' }}><TextField label="Search users" type="search" placeholder="Name or email" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} adornment={<Search size={18} color="var(--text-faint)" aria-hidden="true" style={{ marginRight: 10 }} />} /></div>
        {error ? <ErrorState error={error} onRetry={refetch} /> : isLoading ? <div className="card-body stack"><Skeleton h={44} /><Skeleton h={44} /><Skeleton h={44} /></div> : !data.items.length ? <EmptyState title="No users found" /> : (
          <div className="table-wrap"><table className="table responsive">
            <caption className="sr-only">Users</caption>
            <thead><tr><th scope="col">User</th><th scope="col">Role</th><th scope="col">Joined</th><th scope="col">Last sign-in</th><th scope="col">Status</th><th scope="col"><span className="sr-only">Actions</span></th></tr></thead>
            <tbody>{data.items.map((u) => (
              <tr key={u._id}>
                <td data-label="User"><div className="cell-title">{u.name}</div><div className="cell-sub">{u.email}</div></td>
                <td data-label="Role"><Badge tone={ROLE_TONE[u.role]} plain>{ROLE_LABEL[u.role]}</Badge>{u.department && <div className="cell-sub">{u.department}</div>}</td>
                <td data-label="Joined">{formatDate(u.createdAt)}</td>
                <td data-label="Last sign-in">{u.lastLoginAt ? formatDateTime(u.lastLoginAt) : '—'}</td>
                <td data-label="Status"><Badge tone={u.isActive ? 'success' : 'neutral'}>{u.isActive ? 'Active' : 'Deactivated'}</Badge></td>
                <td>{u._id !== me._id && <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>{u.isActive && <Button size="sm" variant="ghost" icon={<KeyRound size={15} />} loading={sendReset.isPending && sendReset.variables?._id === u._id} onClick={() => sendReset.mutate(u)} aria-label={`Send password reset link to ${u.name}`}>Reset password</Button>}<Button size="sm" variant={u.isActive ? 'ghost' : 'secondary'} icon={u.isActive ? <UserX size={15} /> : <UserCheck size={15} />} onClick={() => toggle.mutate(u)} aria-label={`${u.isActive ? 'Deactivate' : 'Reactivate'} ${u.name}`}>{u.isActive ? 'Deactivate' : 'Reactivate'}</Button></div>}</td>
              </tr>))}</tbody>
          </table></div>
        )}
        {data && <Pagination page={data.page} pages={data.pages} total={data.total} onPage={setPage} noun="users" />}
      </div>
      <NewStaff open={adding} onClose={() => setAdding(false)} />
      <ResetLinkModal info={resetInfo} onClose={() => setResetInfo(null)} />
    </div>
  );
}

function Audit() {
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ['admin', 'audit'], queryFn: async () => (await api.get('/admin/audit')).data.items });
  return (
    <div className="card">
      {error ? <ErrorState error={error} onRetry={refetch} /> : isLoading ? <div className="card-body stack"><Skeleton h={40} /><Skeleton h={40} /></div> : !data.length ? <EmptyState title="No activity yet" /> : (
        <div className="table-wrap"><table className="table responsive">
          <caption className="sr-only">Audit log</caption>
          <thead><tr><th scope="col">When</th><th scope="col">Who</th><th scope="col">Action</th><th scope="col">Entity</th></tr></thead>
          <tbody>{data.map((l) => <tr key={l._id}><td data-label="When">{formatDateTime(l.createdAt)}</td><td data-label="Who">{l.actorName || '—'}</td><td data-label="Action"><code>{l.action}</code></td><td data-label="Entity" className="cell-sub">{l.entity}</td></tr>)}</tbody>
        </table></div>
      )}
    </div>
  );
}

export default function AdminUsers() {
  const [tab, setTab] = useState('users');
  return (
    <div className="stack-lg">
      <div className="page-head" style={{ marginBottom: 0 }}><div><h1 style={{ fontSize: 'var(--text-2xl)' }}>Users &amp; audit</h1><p>Manage access and review administrative activity.</p></div></div>
      <FilterTabs label="Section" tabs={[{ value: 'users', label: 'Users' }, { value: 'audit', label: 'Audit log' }]} value={tab} onChange={setTab} />
      {tab === 'users' ? <Users /> : <Audit />}
    </div>
  );
}
