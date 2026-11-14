import { useEffect, useState } from 'react';
import { animate, useReducedMotion } from 'framer-motion';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from './Button';

export function Counter({ value = 0, duration = 1.1, format = (n) => Math.round(n).toLocaleString('en-IN') }) {
  const reduce = useReducedMotion();
  const [n, setN] = useState(reduce ? value : 0);
  useEffect(() => {
    if (reduce) { setN(value); return undefined; }
    const c = animate(0, value, { duration, ease: 'easeOut', onUpdate: setN });
    return () => c.stop();
  }, [value, duration, reduce]);
  return <span className="mono">{format(n)}</span>;
}

export function ProgressBar({ value, label }) {
  return (
    <div className="progress" role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
      <span style={{ width: `${value}%` }} />
    </div>
  );
}

export function Stepper({ steps, current }) {
  return (
    <ol className="stepper" aria-label="Application progress">
      {steps.map((s, i) => (
        <li key={s} data-state={i < current ? 'done' : i === current ? 'current' : 'todo'} aria-current={i === current ? 'step' : undefined}>
          <span>{s}</span>
        </li>
      ))}
    </ol>
  );
}

export function FilterTabs({ tabs, value, onChange, label }) {
  return (
    <div className="tabs" role="group" aria-label={label}>
      {tabs.map((t) => (
        <button key={t.value} type="button" className="tab" aria-pressed={value === t.value} onClick={() => onChange(t.value)}>
          {t.label}
          {t.count !== undefined && <span className="count">{t.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function Pagination({ page, pages, total, onPage, noun = 'results' }) {
  if (!total) return null;
  return (
    <nav className="pagination" aria-label="Pagination">
      <span aria-live="polite">{total} {noun} · Page {page} of {pages}</span>
      <div className="row">
        <Button size="sm" icon={<ChevronLeft size={16} />} disabled={page <= 1} onClick={() => onPage(page - 1)}>Previous</Button>
        <Button size="sm" disabled={page >= pages} onClick={() => onPage(page + 1)}>Next <ChevronRight size={16} aria-hidden="true" /></Button>
      </div>
    </nav>
  );
}
