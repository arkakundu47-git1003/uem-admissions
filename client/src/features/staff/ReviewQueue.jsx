import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ClipboardCheck, Search } from 'lucide-react';
import { api } from '../../lib/api';
import { useDebounce } from '../../hooks/useDebounce';
import { Button } from '../../components/ui/Button';
import { StatusBadge } from '../../components/ui/Badge';
import { EmptyState, ErrorState, Skeleton } from '../../components/ui/Feedback';
import { FilterTabs, Pagination } from '../../components/ui/Misc';
import { SelectField, TextField } from '../../components/ui/Field';
import { formatDate } from '../../lib/format';

const TABS = [
  { value: '', label: 'All' }, { value: 'submitted', label: 'New' }, { value: 'under_review', label: 'In review' },
  { value: 'documents_verified', label: 'Verified' }, { value: 'waitlisted', label: 'Waitlisted' }, { value: 'accepted', label: 'Accepted' }, { value: 'rejected', label: 'Rejected' },
];

export default function ReviewQueue() {
  const navigate = useNavigate();
  const [status, setStatus] = useState('submitted');
  const [q, setQ] = useState('');
  const [course, setCourse] = useState('');
  const [sort, setSort] = useState('oldest');
  const [page, setPage] = useState(1);
  const dq = useDebounce(q);
  const reset = (fn) => (v) => { fn(v); setPage(1); };

  const courses = useQuery({ queryKey: ['courses', 'all'], queryFn: async () => (await api.get('/courses')).data.courses, staleTime: 300_000 });
  const { data, isLoading, isFetching, error, refetch } = useQuery({
    queryKey: ['review', { status, dq, course, sort, page }],
    queryFn: async () => (await api.get('/review/applications', { params: { status: status || undefined, q: dq || undefined, course: course || undefined, sort, page, limit: 10 } })).data,
    placeholderData: (p) => p,
  });

  return (
    <div className="stack-lg">
      <div className="page-head" style={{ marginBottom: 0 }}><div><h1 style={{ fontSize: 'var(--text-2xl)' }}>Review queue</h1><p>Verify documents and decide on applications.</p></div></div>

      <FilterTabs label="Filter by status" tabs={TABS} value={status} onChange={reset(setStatus)} />

      <div className="card">
        <form className="filters" role="search" onSubmit={(e) => e.preventDefault()} style={{ borderBottom: '1px solid var(--border)', gridTemplateColumns: undefined }}>
          <TextField label="Search" type="search" placeholder="Applicant name or application no." value={q} onChange={(e) => reset(setQ)(e.target.value)} adornment={<Search size={18} color="var(--text-faint)" aria-hidden="true" style={{ marginRight: 10 }} />} />
          <SelectField label="Programme" value={course} onChange={(e) => reset(setCourse)(e.target.value)}><option value="">All programmes</option>{courses.data?.map((c) => <option key={c._id} value={c._id}>{c.code} — {c.name}</option>)}</SelectField>
          <SelectField label="Sort" value={sort} onChange={(e) => reset(setSort)(e.target.value)}><option value="oldest">Oldest first</option><option value="newest">Newest first</option></SelectField>
        </form>

        {error ? <ErrorState error={error} onRetry={refetch} /> : isLoading ? (
          <div className="card-body stack">{[0, 1, 2, 3].map((i) => <Skeleton key={i} h={48} />)}</div>
        ) : !data.items.length ? (
          <EmptyState icon={ClipboardCheck} title="Nothing in this view">No applications match your filters.</EmptyState>
        ) : (
          <div className="table-wrap" aria-busy={isFetching}>
            <table className="table responsive">
              <caption className="sr-only">Applications</caption>
              <thead><tr><th scope="col">Applicant</th><th scope="col">Programme</th><th scope="col">Submitted</th><th scope="col">Documents</th><th scope="col">Status</th><th scope="col"><span className="sr-only">Actions</span></th></tr></thead>
              <tbody>
                {data.items.map((a) => {
                  const verified = a.documents.filter((d) => d.status === 'verified').length;
                  return (
                    <tr key={a._id} onDoubleClick={() => navigate(`/staff/applications/${a._id}`)}>
                      <td data-label="Applicant"><div className="cell-title">{a.personal?.fullName || a.applicant?.name}</div><div className="cell-sub mono">{a.applicationNo}</div></td>
                      <td data-label="Programme"><div className="cell-title">{a.course?.code}</div><div className="cell-sub">{a.academic?.percentage != null ? `${a.academic.percentage}% aggregate` : ''}</div></td>
                      <td data-label="Submitted">{formatDate(a.submittedAt)}</td>
                      <td data-label="Documents"><span className="mono">{verified}/{a.documents.length}</span> verified{a.documents.some((d) => d.status === 'rejected') && <span className="cell-sub" style={{ color: 'var(--danger)' }}> · issue</span>}</td>
                      <td data-label="Status"><StatusBadge status={a.status} /></td>
                      <td><Button size="sm" variant="primary" to={`/staff/applications/${a._id}`} aria-label={`Review ${a.personal?.fullName || a.applicationNo}`}>Review</Button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {data && <Pagination page={data.page} pages={data.pages} total={data.total} onPage={setPage} noun="applications" />}
      </div>
    </div>
  );
}
