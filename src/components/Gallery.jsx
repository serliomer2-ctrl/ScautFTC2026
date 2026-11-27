import React, { useMemo, useState } from 'react';
import { labelOf } from '../schema.js';
import { teamPenalty } from '../lib/penalties.js';
import { f1 } from './TeamsView.jsx';

/**
 * Görsel Robot Galerisi – pit fotoğrafları (cihazda sıkıştırılmış, çevrimdışı) ızgara kartlarda.
 * Maç verisi olmayan ama pit kaydı olan takımlar da gösterilir. Fotoğraf yoksa robot silüeti.
 */
export function RobotSilhouette({ className = '' }) {
  return (
    <svg viewBox="0 0 120 90" className={className} aria-hidden="true">
      <rect width="120" height="90" fill="rgb(var(--raised))" />
      <g fill="none" stroke="rgb(var(--muted))" strokeWidth="3" strokeLinejoin="round" opacity="0.55">
        <rect x="30" y="30" width="60" height="34" rx="4" />
        <path d="M44 30 V18 h32 v12" />
        <circle cx="54" cy="24" r="2.5" fill="rgb(var(--muted))" />
        <circle cx="66" cy="24" r="2.5" fill="rgb(var(--muted))" />
        <path d="M90 40 h12 l6 -8" />
        <rect x="22" y="58" width="16" height="16" rx="3" />
        <rect x="82" y="58" width="16" height="16" rx="3" />
      </g>
    </svg>
  );
}

export default function Gallery({ stats, pitRecords, scoring, onOpen }) {
  const [q, setQ] = useState('');
  const items = useMemo(() => {
    const byNum = new Map(stats.map((t) => [t.num, { num: t.num, name: t.name, t }]));
    for (const p of pitRecords) {
      const n = String(p.team?.number || '');
      if (!n) continue;
      byNum.set(n, { ...(byNum.get(n) || { num: n, name: p.team?.name || '' }), pit: p });
    }
    return [...byNum.values()]
      .filter((x) => !q || x.num.includes(q) || (x.name || '').toLowerCase().includes(q.toLowerCase()))
      .sort((a, b) => (b.t?.points ?? -1) - (a.t?.points ?? -1) || Number(a.num) - Number(b.num));
  }, [stats, pitRecords, q]);

  if (!items.length) return <div className="card text-center text-muted">Henüz takım yok.</div>;
  return (
    <div className="grid gap-3">
      <input className="input" type="search" placeholder="🔍 Takım ara…" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {items.map(({ num, name, t, pit }) => {
          const p = pit?.pit;
          const dt = p?.drivetrain ? (p.drivetrain === 'other' ? p.drivetrainOther || 'Diğer' : labelOf('drivetrain', p.drivetrain)) : t?.pit.drivetrain;
          const risk = t && scoring ? teamPenalty(t, scoring).risk : false;
          const alerts = (p?.alerts || []).filter((a) => a.id !== 'spares').length;
          return (
            <button key={num} type="button" onClick={() => t && onOpen(num)} className="overflow-hidden rounded-2xl border border-line bg-surface text-left active:scale-[0.98] disabled:opacity-70" disabled={!t}>
              <div className="relative aspect-[4/3]">
                {p?.photo ? <img src={p.photo} alt={`#${num} robot`} loading="lazy" className="h-full w-full object-cover" /> : <RobotSilhouette className="h-full w-full" />}
                {t && <span className="absolute right-1.5 top-1.5 rounded-lg bg-black/75 px-2 py-0.5 text-sm font-extrabold text-accent">{f1(t.points)}</span>}
                {(risk || alerts > 0) && (
                  <span className="absolute left-1.5 top-1.5 rounded-lg bg-bad px-1.5 py-0.5 text-[10px] font-extrabold text-white">{risk ? 'CEZA' : '⚠'}{alerts > 0 && risk ? ' ⚠' : ''}</span>
                )}
              </div>
              <div className="p-2">
                <div className="truncate text-lg font-extrabold leading-tight">#{num}</div>
                <div className="truncate text-xs text-muted">{name || '—'}</div>
                <div className="mt-1 flex flex-wrap gap-1 text-[10px]">
                  {dt && <span className="rounded-full bg-raised px-2 py-0.5">{dt}</span>}
                  <span className="rounded-full bg-raised px-2 py-0.5">{t ? `${t.n} maç` : 'yalnız pit'}</span>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
