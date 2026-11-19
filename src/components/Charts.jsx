import React from 'react';

/** Bağımlılıksız SVG çizgi grafik. series: [{key, label, color}] ; data: [{match, [key]: number}] */
export function LineChart({ data, series, height = 200 }) {
  if (!data.length) return null;
  const W = 600, H = height, P = { l: 34, r: 12, t: 12, b: 28 };
  const max = Math.max(1, ...data.flatMap((d) => series.map((s) => d[s.key] || 0)));
  const nice = Math.ceil(max / 5) * 5 || 5;
  const x = (i) => P.l + (data.length === 1 ? (W - P.l - P.r) / 2 : (i * (W - P.l - P.r)) / (data.length - 1));
  const y = (v) => P.t + (1 - v / nice) * (H - P.t - P.b);
  const ticks = [0, nice / 2, nice];

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Maç bazlı performans grafiği">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={P.l} x2={W - P.r} y1={y(t)} y2={y(t)} stroke="rgb(var(--line))" strokeDasharray={t ? '3 4' : ''} />
            <text x={P.l - 6} y={y(t) + 4} textAnchor="end" fontSize="12" fill="rgb(var(--muted))">{Math.round(t)}</text>
          </g>
        ))}
        {data.map((d, i) => (
          <text key={i} x={x(i)} y={H - 8} textAnchor="middle" fontSize="12" fill="rgb(var(--muted))">{d.match}</text>
        ))}
        {series.map((s) => (
          <g key={s.key}>
            <polyline
              fill="none"
              stroke={s.color}
              strokeWidth="3"
              strokeLinejoin="round"
              strokeLinecap="round"
              points={data.map((d, i) => `${x(i)},${y(d[s.key] || 0)}`).join(' ')}
            />
            {data.map((d, i) => (
              <circle key={i} cx={x(i)} cy={y(d[s.key] || 0)} r="5" fill={s.color} stroke="rgb(var(--surface))" strokeWidth="2">
                <title>{`${d.match} · ${s.label}: ${Math.round((d[s.key] || 0) * 10) / 10}`}</title>
              </circle>
            ))}
          </g>
        ))}
      </svg>
      <div className="mt-1 flex flex-wrap gap-4 text-sm">
        {series.map((s) => (
          <span key={s.key} className="flex items-center gap-2">
            <span className="h-1 w-5 rounded" style={{ background: s.color }} /> {s.label}
          </span>
        ))}
      </div>
    </div>
  );
}

/** Yatay oran çubuğu (karşılaştırma tabloları için) */
export function Bar({ value, max, color = 'rgb(var(--accent))', label }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className="flex items-center gap-2">
      <div className="h-3 flex-1 overflow-hidden rounded-full bg-raised">
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
      </div>
      <span className="w-12 text-right text-sm font-bold tabular-nums">{label}</span>
    </div>
  );
}
