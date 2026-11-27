import React, { useMemo, useState } from 'react';
import { phi, predictMatch } from '../lib/analytics.js';
import { pairSynergy } from '../lib/synergy.js';
import { f1 } from './TeamsView.jsx';

/**
 * İttifak Sinerji Motoru + "What-If" simülatörü
 *  - Biz + 2 aday partner → sahaya çıkabilecek 3 ikili kombinasyon
 *  - Her ikili: sinerji rozeti (Alan Çakışması Riski / Yüksek Sinerji), ham ve çakışma düzeltmeli
 *    beklenen puan, seçilen rakip ittifaka karşı kazanma olasılığı
 *  - Çakışma düzeltmesi: aynı dar bölgede çalışan iki robot birbirini yavaşlatır varsayımıyla
 *    küçük katkının %12'si (otonom başlangıç çakışmasında +%5) düşülür. Bu bir sezgisel tahmindir.
 */
function Pick({ stats, value, onChange, placeholder, exclude }) {
  return (
    <select className="input" value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">{placeholder}</option>
      {stats.map((t) => (
        <option key={t.num} value={t.num} disabled={exclude.includes(t.num) && t.num !== value}>
          #{t.num} {t.name} ({f1(t.points)} p)
        </option>
      ))}
    </select>
  );
}

export function SynergyBadge({ s, big }) {
  const cls =
    s.level === 'conflict' ? 'bg-bad/20 text-bad border-bad' : s.level === 'synergy' ? 'bg-ok/20 text-ok border-ok' : 'bg-raised text-muted border-line';
  const label = s.level === 'conflict' ? '⚠ Alan Çakışması Riski' : s.level === 'synergy' ? '✦ Yüksek Sinerji' : '◌ Nötr';
  return <span className={`inline-block rounded-full border px-3 py-1 font-bold ${big ? 'text-sm' : 'text-xs'} ${cls}`}>{label} · {s.score}</span>;
}

export default function WhatIf({ stats, myTeam }) {
  const [us, setUs] = useState(String(myTeam || ''));
  const [p1, setP1] = useState('');
  const [p2, setP2] = useState('');
  const [oppMode, setOppMode] = useState('best');
  const [o1, setO1] = useState('');
  const [o2, setO2] = useState('');
  const get = (n) => stats.find((t) => t.num === n);
  const chosen = [us, p1, p2].filter(Boolean);

  const opp = useMemo(() => {
    if (oppMode === 'pick') return [get(o1), get(o2)].filter(Boolean);
    // Varsayılan rakip: bizim üçlü dışındaki en güçlü 2 takım (en zor senaryo)
    return stats.filter((t) => !chosen.includes(t.num)).slice(0, 2);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [oppMode, o1, o2, stats, us, p1, p2]);

  const trio = [get(us), get(p1), get(p2)];
  const ready = trio.every(Boolean);
  const pairs = ready
    ? [
        [trio[0], trio[1]],
        [trio[0], trio[2]],
        [trio[1], trio[2]],
      ].map(([a, b]) => {
        const syn = pairSynergy(a, b);
        const raw = a.points + b.points;
        const adj = raw - syn.penalty * Math.min(a.points, b.points);
        const pred = opp.length ? predictMatch([a, b], opp) : null;
        // Kazanma olasılığını çakışma düzeltmeli ortalamayla yeniden ölçekle
        const pWin = pred ? phi((adj - pred.blue.mu) / (Math.sqrt(pred.red.sigma ** 2 + pred.blue.sigma ** 2) || 1)) : null;
        return { a, b, syn, raw, adj, sigma: pred?.red.sigma, pWin };
      }).sort((x, y) => y.adj - x.adj)
    : [];

  if (stats.length < 3) return null;

  return (
    <section className="card grid gap-3">
      <h2 className="text-lg font-bold">🧬 Sinerji Motoru & What-If</h2>
      <p className="text-xs text-muted">
        3 robotluk eleme ittifakında hangi ikilinin sahaya çıkması gerektiğini karşılaştırır. Sinerji, saha haritasındaki skor bölgeleri ve otonom başlangıçlarından hesaplanır.
      </p>
      <div className="grid gap-2">
        <Pick stats={stats} value={us} onChange={setUs} placeholder="Bizim takım" exclude={chosen} />
        <div className="grid grid-cols-2 gap-2">
          <Pick stats={stats} value={p1} onChange={setP1} placeholder="Partner 1" exclude={chosen} />
          <Pick stats={stats} value={p2} onChange={setP2} placeholder="Partner 2" exclude={chosen} />
        </div>
        <div className="grid grid-cols-2 gap-2">
          {[
            ['best', 'Rakip: en güçlü 2'],
            ['pick', 'Rakibi seç'],
          ].map(([k, l]) => (
            <button key={k} className={`btn min-h-[44px] border-2 text-sm ${oppMode === k ? 'border-accent bg-accent text-accent-fg' : 'border-line bg-raised'}`} onClick={() => setOppMode(k)}>
              {l}
            </button>
          ))}
        </div>
        {oppMode === 'pick' && (
          <div className="grid grid-cols-2 gap-2">
            <Pick stats={stats} value={o1} onChange={setO1} placeholder="Rakip 1" exclude={[...chosen, o2]} />
            <Pick stats={stats} value={o2} onChange={setO2} placeholder="Rakip 2" exclude={[...chosen, o1]} />
          </div>
        )}
        {opp.length > 0 && <p className="text-xs text-muted">Rakip ittifak: {opp.map((t) => `#${t.num}`).join(' + ')} ({f1(opp.reduce((s, t) => s + t.points, 0))} p)</p>}
      </div>

      {!ready && <p className="text-sm text-muted">Bizim takımı ve 2 aday partneri seçin.</p>}
      {pairs.map((p, i) => (
        <div key={p.a.num + p.b.num} className={`grid gap-2 rounded-2xl border-2 p-3 ${i === 0 ? 'border-ok' : 'border-line'} bg-raised`}>
          <div className="flex items-center gap-2">
            <span className="rounded-lg bg-surface px-2 py-1 text-xs font-bold text-muted">{i === 0 ? '🥇 Eleme 1' : i === 1 ? 'Eleme 2' : 'Yedek'}</span>
            <b className="text-lg">#{p.a.num} + #{p.b.num}</b>
            <span className="ml-auto text-right">
              <span className="block text-2xl font-extrabold tabular-nums text-accent">{Math.round(p.adj)}</span>
              {p.adj !== p.raw && <span className="block text-[10px] text-muted line-through">{Math.round(p.raw)}</span>}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <SynergyBadge s={p.syn} />
            {p.pWin != null && (
              <span className={`text-sm font-bold ${p.pWin >= 0.5 ? 'text-ok' : 'text-bad'}`}>Kazanma %{Math.round(p.pWin * 100)}</span>
            )}
            {p.sigma && <span className="text-xs text-muted">± {Math.round(p.sigma)} p</span>}
          </div>
          <ul className="grid gap-0.5 text-xs text-muted">
            {p.syn.reasons.map((r) => (
              <li key={r}>• {r}</li>
            ))}
          </ul>
        </div>
      ))}
      {pairs.length > 0 && (
        <p className="rounded-xl bg-surface p-3 text-sm">
          Öneri: <b>#{pairs[0].a.num} + #{pairs[0].b.num}</b> ile başlayın.
          {pairs[0].syn.level === 'conflict' && ' Dikkat: en yüksek puanlı ikili bile bölge çakışması taşıyor – görev paylaşımını maç öncesi netleştirin.'}
          {pairs[1] && pairs[0].adj - pairs[1].adj < 5 && ` #${pairs[1].a.num} + #${pairs[1].b.num} neredeyse eşit; robot arızası/şarj durumuna göre rotasyon yapılabilir.`}
        </p>
      )}
    </section>
  );
}
