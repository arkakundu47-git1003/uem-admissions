import { motion } from 'framer-motion';

export function BarChart({ data, label = 'Applications per day' }) {
  const w = 600;
  const h = 190;
  const pad = { t: 14, r: 8, b: 28, l: 28 };
  const max = Math.max(4, ...data.map((d) => d.count));
  const bw = (w - pad.l - pad.r) / data.length;
  const y = (v) => pad.t + (h - pad.t - pad.b) * (1 - v / max);
  const ticks = [0, Math.round(max / 2), max];
  return (
    <figure style={{ margin: 0 }}>
      <svg viewBox={`0 0 ${w} ${h}`} role="img" aria-label={`${label}, last ${data.length} days. Total ${data.reduce((a, d) => a + d.count, 0)}.`} style={{ width: '100%', height: 'auto' }}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={w - pad.r} y1={y(t)} y2={y(t)} stroke="var(--border)" strokeDasharray={t ? '3 4' : undefined} />
            <text x={pad.l - 8} y={y(t) + 4} textAnchor="end" fontSize="11" fill="var(--text-muted)">{t}</text>
          </g>
        ))}
        {data.map((d, i) => {
          const bh = Math.max(0, h - pad.b - y(d.count));
          const x = pad.l + i * bw + bw * 0.18;
          return (
            <g key={d.date}>
              <motion.rect x={x} width={bw * 0.64} rx="5" fill="var(--chart-1)" initial={{ y: h - pad.b, height: 0 }} whileInView={{ y: y(d.count), height: bh }} viewport={{ once: true }} transition={{ duration: 0.6, delay: i * 0.03 }}>
                <title>{`${d.date}: ${d.count}`}</title>
              </motion.rect>
              {i % 2 === 0 && (
                <text x={x + bw * 0.32} y={h - 8} textAnchor="middle" fontSize="10.5" fill="var(--text-muted)">{d.date.slice(8)}/{d.date.slice(5, 7)}</text>
              )}
            </g>
          );
        })}
      </svg>
    </figure>
  );
}

export function Donut({ items, centerLabel = 'Total' }) {
  const total = items.reduce((a, i) => a + i.value, 0);
  let acc = 0;
  return (
    <div className="donut-wrap">
      <svg viewBox="0 0 42 42" width="190" height="190" role="img" aria-label={`${centerLabel}: ${total}. ${items.map((i) => `${i.label} ${i.value}`).join(', ')}`}>
        <circle cx="21" cy="21" r="15.915" fill="none" stroke="var(--surface-2)" strokeWidth="6" />
        {total > 0 &&
          items.filter((i) => i.value > 0).map((i, idx) => {
            const pct = (i.value / total) * 100;
            const off = -acc;
            acc += pct;
            return (
              <motion.circle key={i.label} cx="21" cy="21" r="15.915" fill="none" stroke={i.color} strokeWidth="6" transform="rotate(-90 21 21)" strokeDashoffset={off}
                initial={{ strokeDasharray: '0 100' }} animate={{ strokeDasharray: `${Math.max(pct - 0.6, 0.1)} ${100 - Math.max(pct - 0.6, 0.1)}` }} transition={{ duration: 0.8, delay: idx * 0.08 }} />
            );
          })}
        <text x="21" y="21.5" textAnchor="middle" fontSize="7" fontWeight="700" fill="var(--text)" fontFamily="var(--font-display)">{total}</text>
        <text x="21" y="27" textAnchor="middle" fontSize="2.8" fill="var(--text-muted)">{centerLabel}</text>
      </svg>
      <ul className="donut-legend">
        {items.map((i) => (
          <li key={i.label}><i style={{ background: i.color }} />{i.label}<strong style={{ marginLeft: 'auto', paddingLeft: 16 }}>{i.value}</strong></li>
        ))}
      </ul>
    </div>
  );
}

export function HBars({ items, max }) {
  const m = max ?? Math.max(1, ...items.map((i) => i.value));
  return (
    <div className="bars">
      {items.map((i, idx) => (
        <div className="hbar" key={i.label}>
          <span className="truncate" title={i.title || i.label}>{i.label}</span>
          <div className="track" aria-hidden="true">
            <motion.div className="fill" style={{ background: i.color || 'var(--chart-1)' }} initial={{ width: 0 }} whileInView={{ width: `${(i.value / m) * 100}%` }} viewport={{ once: true }} transition={{ duration: 0.7, delay: idx * 0.07 }} />
          </div>
          <strong className="mono">{i.value}{i.suffix}</strong>
        </div>
      ))}
    </div>
  );
}
