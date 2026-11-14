import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { SearchX, Search } from 'lucide-react';
import { api } from '../../lib/api';
import { useDebounce } from '../../hooks/useDebounce';
import { CourseCard } from '../../components/shared/CourseCard';
import { CardSkeletons, EmptyState, ErrorState } from '../../components/ui/Feedback';
import { Button } from '../../components/ui/Button';
import { SelectField, TextField } from '../../components/ui/Field';

export default function CoursesPage() {
  const [q, setQ] = useState('');
  const [department, setDepartment] = useState('');
  const [level, setLevel] = useState('');
  const [openOnly, setOpenOnly] = useState(false);
  const dq = useDebounce(q);

  const { data, isLoading, isFetching, error, refetch } = useQuery({
    queryKey: ['courses', { dq, department, level, openOnly }],
    queryFn: async () => (await api.get('/courses', { params: { q: dq || undefined, department: department || undefined, level: level || undefined, open: openOnly || undefined } })).data,
    placeholderData: (prev) => prev,
  });
  const courses = data?.courses || [];
  const reset = () => { setQ(''); setDepartment(''); setLevel(''); setOpenOnly(false); };
  const filtered = q || department || level || openOnly;

  return (
    <>
      <section className="page-hero">
        <div className="container"><span className="eyebrow">Programmes</span><h1 style={{ marginTop: 8 }}>Find the programme that fits you</h1><p>Compare eligibility, seats, fees and deadlines. Apply in minutes.</p></div>
      </section>
      <div className="container" style={{ marginTop: -28, position: 'relative', zIndex: 2 }}>
        <form className="card filters" role="search" aria-label="Filter programmes" onSubmit={(e) => e.preventDefault()}>
          <TextField label="Search" type="search" placeholder="Course, code or department" value={q} onChange={(e) => setQ(e.target.value)} adornment={<Search size={18} color="var(--text-faint)" aria-hidden="true" style={{ marginRight: 10 }} />} />
          <SelectField label="Department" value={department} onChange={(e) => setDepartment(e.target.value)}>
            <option value="">All departments</option>
            {data?.departments?.map((d) => <option key={d}>{d}</option>)}
          </SelectField>
          <SelectField label="Level" value={level} onChange={(e) => setLevel(e.target.value)}>
            <option value="">UG &amp; PG</option><option value="UG">Undergraduate</option><option value="PG">Postgraduate</option>
          </SelectField>
          <label className="check" style={{ minHeight: 46, alignItems: 'center' }}><input type="checkbox" checked={openOnly} onChange={(e) => setOpenOnly(e.target.checked)} /> Open now</label>
        </form>
      </div>

      <div className="container section-tight">
        <p className="muted" aria-live="polite" style={{ marginBottom: 'var(--space-4)' }}>{isLoading ? 'Loading programmes…' : `${courses.length} programme${courses.length === 1 ? '' : 's'} found${isFetching ? ' · updating' : ''}`}</p>
        {error ? <ErrorState error={error} onRetry={refetch} /> : isLoading ? <CardSkeletons count={6} /> : courses.length ? (
          <div className="grid-cards">{courses.map((c, i) => <CourseCard key={c._id} course={c} index={i} />)}</div>
        ) : (
          <EmptyState icon={SearchX} title="No programmes match" action={filtered && <Button onClick={reset}>Clear filters</Button>}>Try a different keyword or remove a filter.</EmptyState>
        )}
      </div>
    </>
  );
}
