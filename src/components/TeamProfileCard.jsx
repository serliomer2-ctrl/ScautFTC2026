import React from 'react';
import { labelOf } from '../schema.js';
import { avgCycle } from './MatchExtras.jsx';
import { f1 } from './TeamsView.jsx';

/**
 * OfflineScout tarzı takım profil kartı – mevcut takım detayının (TeamsView) ÜSTÜNE eklenir.
 * Fotoğraf + kimlik + maç sayısı + ortalama puan, dönem dağılımı (yığılmış çubuk),
 * maç içi etiketlerden üretilen uyarı rozetleri ve pit notları. Maç bazlı çizgi grafik hemen
 * altındaki mevcut detay kartında yer alır.
 */
const PHRASES = {
  brownout: (n) => ({ text: `${n} kez bağlantı koptu`, tone: 'bad' }),
  climbFail: (n) => ({ text: `${n} kez tırmanma başarısız`, tone: 'bad' }),
  penalty: (n) => ({ text: `${n} kez ceza aldı`, tone: 'bad' }),
  tipped: (n) => ({ text: `${n} kez devrildi`, tone: 'bad' }),
  noShow: (n) => ({ text: `${n} maça çıkmadı`, tone: 'bad' }),
  defense: (n) => ({ text: `${n} maçta iyi savunma`, tone: 'ok' }),
  carried: (n) => ({ text: `${n} maçta ittifakı taşıdı`, tone: 'ok' }),
  fast: (n) => ({ text: `${n} maçta hızlı döngü`, tone: 'ok' }),
};
const PART = [
  ['autoPts', 'Otonom', 'rgb(var(--alliance-blue))'],
  ['telePts', 'TeleOp', 'rgb(var(--accent))'],
  ['endPts', 'Endgame', 'rgb(var(--warn))'],
];

export default function TeamProfileCard({ t, pit }) {
  const p = pit?.pit;
  const counts = {};
  t.records.forEach((r) => (r.tags || []).forEach((g) => (counts[g] = (counts[g] || 0) + 1)));
  const badges = Object.entries(counts)
    .map(([g, n]) => (PHRASES[g] ? PHRASES[g](n) : { text: `${g} ×${n}`, tone: 'muted' }))
    .sort((a, b) => (a.tone === 'bad' ? -1 : 1) - (b.tone === 'bad' ? -1 : 1));
  const cyc = t.records.map((r) => avgCycle(r.cycles)).filter((x) => x != null);
  if (cyc.length) badges.push({ text: `Ort. döngü ${f1(cyc.reduce((s, x) => s + x, 0) / cyc.length)} sn`, tone: 'muted' });
  const drivetrain = p?.drivetrain ? (p.drivetrain === 'other' ? p.drivetrainOther || 'Diğer' : labelOf('drivetrain', p.drivetrain)) : t.pit.drivetrain;
  const total = t.autoPts + t.telePts + t.endPts || 1;

  return (
    <section className="card mb-4 grid gap-4 p-0 overflow-hidden">
      <div className="flex gap-3 p-4 pb-0">
        {p?.photo ? (
          <img src={p.photo} alt={`#${t.num} robot`} className="h-28 w-28 shrink-0 rounded-2xl object-cover" />
        ) : (
          <div className="flex h-28 w-28 shrink-0 items-center justify-center rounded-2xl bg-raised text-5xl">🤖</div>
        )}
        <div className="min-w-0 flex-1">
          <div className="text-4xl font-extrabold leading-none">#{t.num}</div>
          <div className="mt-1 truncate text-lg font-semibold">{t.name || pit?.team?.name || 'İsimsiz takım'}</div>
          <div className="mt-2 flex flex-wrap gap-1 text-xs">
            {drivetrain && <span className="rounded-full bg-raised px-2 py-1">{drivetrain}</span>}
            <span className="rounded-full bg-raised px-2 py-1">{t.n} maç</span>
          </div>
        </div>
        <div className="text-right">
          <div className="text-4xl font-extrabold tabular-nums text-accent">{f1(t.points)}</div>
          <div className="text-[11px] text-muted">ort. puan</div>
        </div>
      </div>

      <div className="px-4">
        <div className="flex h-8 overflow-hidden rounded-xl">
          {PART.map(([k, l, c]) =>
            t[k] > 0 ? (
              <div key={k} className="flex items-center justify-center text-xs font-extrabold text-black" style={{ width: `${(t[k] / total) * 100}%`, background: c }} title={`${l}: ${f1(t[k])}`}>
                {Math.round(t[k])}
              </div>
            ) : null,
          )}
          {total === 1 && <div className="flex-1 bg-raised" />}
        </div>
        <div className="mt-1 flex gap-4 text-xs text-muted">
          {PART.map(([k, l, c]) => (
            <span key={k}><span style={{ color: c }}>■</span> {l} {f1(t[k])}</span>
          ))}
        </div>
      </div>

      {(badges.length > 0 || p?.notes) && (
        <div className="grid gap-2 px-4 pb-4">
          <div className="flex flex-wrap gap-1">
            {badges.map((b) => (
              <span
                key={b.text}
                className={`rounded-full px-3 py-1 text-xs font-bold ${b.tone === 'bad' ? 'bg-bad/20 text-bad' : b.tone === 'ok' ? 'bg-ok/20 text-ok' : 'bg-raised text-muted'}`}
              >
                {b.tone === 'bad' ? '⚠ ' : b.tone === 'ok' ? '✓ ' : ''}{b.text}
              </span>
            ))}
          </div>
          {p?.notes && <p className="rounded-xl bg-raised p-3 text-sm"><b>Pit notu:</b> {p.notes}</p>}
          {p?.autoNotes && <p className="rounded-xl bg-raised p-3 text-sm"><b>Otonom rotaları:</b> {p.autoNotes}</p>}
        </div>
      )}
      {!badges.length && !p?.notes && <div className="pb-1" />}
    </section>
  );
}
