import React, { useMemo, useState } from 'react';
import { Bar, LineChart } from './Charts.jsx';
import { f1 } from './TeamsView.jsx';
import { TAG_LABEL, avgCycle } from './MatchExtras.jsx';

/**
 * Kafa kafaya karşılaştırma – mevcut "Takım Karşılaştırma" panelinde OLMAYAN metrikler:
 * en yüksek / en düşük skor, tutarlılık (standart sapma + maç maç grafik),
 * otonom/TeleOp/End Game puan dağılımı, ortalama döngü süresi, sorun etiketleri ve pit fotoğrafı.
 * teamStats() çıktısını (mevcut analiz motoru) kullanır; yeni hesaplar burada yapılır.
 */
const COLORS = ['rgb(var(--accent))', 'rgb(var(--alliance-blue))', 'rgb(var(--ok))'];
const PART = { auto: 'rgb(var(--alliance-blue))', tele: 'rgb(var(--ok))', end: 'rgb(var(--accent))' };

export default function HeadToHead({ stats, pitByTeam }) {
  const [sel, setSel] = useState([]);
  const toggle = (n) => setSel((s) => (s.includes(n) ? s.filter((x) => x !== n) : s.length >= 3 ? [...s.slice(1), n] : [...s, n]));

  const teams = useMemo(
    () =>
      sel
        .map((n) => stats.find((t) => t.num === n))
        .filter(Boolean)
        .map((t) => {
          const totals = t.perMatch.map((m) => m.total);
          const cyc = t.records.map((r) => avgCycle(r.cycles)).filter((x) => x != null);
          const tags = {};
          t.records.forEach((r) => (r.tags || []).forEach((g) => (tags[g] = (tags[g] || 0) + 1)));
          return {
            ...t,
            max: Math.max(...totals),
            min: Math.min(...totals),
            std: t.n > 1 ? Math.sqrt(totals.reduce((s, x) => s + (x - t.points) ** 2, 0) / (t.n - 1)) : null,
            cycle: cyc.length ? cyc.reduce((s, x) => s + x, 0) / cyc.length : null,
            tags,
          };
        }),
    [sel, stats],
  );

  if (stats.length < 2) return null;

  // Mevcut LineChart eksik değeri 0 çizdiği için ortak maç sayısı kadar gösterilir
  const common = Math.min(...teams.map((t) => t.n));
  const chart = Array.from({ length: teams.length ? common : 0 }, (_, i) => {
    const row = { match: `${i + 1}.` };
    teams.forEach((t) => (row[t.num] = t.perMatch[i]?.total ?? null));
    return row;
  });
  const maxPts = Math.max(1, ...teams.map((t) => t.max));

  return (
    <section className="card grid gap-4">
      <h2 className="text-lg font-bold">🥊 Kafa Kafaya (Head-to-Head) <span className="text-sm font-normal text-muted">2–3 takım</span></h2>
      <div className="flex flex-wrap gap-2">
        {stats.map((t) => {
          const i = sel.indexOf(t.num);
          return (
            <button
              key={t.num}
              onClick={() => toggle(t.num)}
              className="min-h-[44px] rounded-full border-2 px-3 text-sm font-semibold"
              style={i >= 0 ? { borderColor: COLORS[i], background: COLORS[i], color: '#000' } : { borderColor: 'rgb(var(--line))' }}
            >
              #{t.num}
            </button>
          );
        })}
      </div>

      {teams.length >= 2 && (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-muted">
                  <th className="py-1">Metrik</th>
                  {teams.map((t, i) => (
                    <th key={t.num} style={{ color: COLORS[i] }}>#{t.num}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[
                  ['Maç', (t) => t.n],
                  ['Ort. puan', (t) => f1(t.points)],
                  ['En yüksek', (t) => f1(t.max)],
                  ['En düşük', (t) => f1(t.min)],
                  ['Std. sapma', (t) => (t.std == null ? '—' : f1(t.std))],
                  ['Ort. döngü', (t) => (t.cycle == null ? '—' : `${f1(t.cycle)} sn`)],
                ].map(([label, fn]) => {
                  // En iyi değeri vurgula (std ve döngüde düşük olan iyi)
                  const vals = teams.map((t) => ({ 'Std. sapma': t.std, 'Ort. döngü': t.cycle, 'En düşük': t.min, 'En yüksek': t.max, 'Ort. puan': t.points }[label]));
                  const valid = vals.filter((v) => v != null);
                  const best = !valid.length || label === 'Maç' ? null : ['Std. sapma', 'Ort. döngü'].includes(label) ? Math.min(...valid) : Math.max(...valid);
                  return (
                    <tr key={label} className="border-t border-line">
                      <td className="py-2 text-muted">{label}</td>
                      {teams.map((t, i) => (
                        <td key={t.num} className={vals[i] != null && vals[i] === best && valid.length > 1 ? 'font-extrabold text-ok' : 'font-semibold'}>{fn(t)}</td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div>
            <h3 className="mb-2 text-sm font-semibold text-muted">Dönem dağılımı (ort. puan)</h3>
            <div className="grid gap-2">
              {teams.map((t) => (
                <div key={t.num} className="grid grid-cols-[64px_1fr] items-center gap-2 text-sm">
                  <span className="font-bold">#{t.num}</span>
                  <div className="flex h-6 overflow-hidden rounded-full bg-raised" title={`Oto ${f1(t.autoPts)} · Tele ${f1(t.telePts)} · EG ${f1(t.endPts)}`}>
                    {['auto', 'tele', 'end'].map((k) => {
                      const v = t[`${k}Pts`];
                      return v > 0 ? (
                        <div key={k} className="flex items-center justify-center text-[11px] font-bold text-black" style={{ width: `${(v / maxPts) * 100}%`, background: PART[k] }}>
                          {Math.round(v)}
                        </div>
                      ) : null;
                    })}
                  </div>
                </div>
              ))}
              <div className="flex gap-4 text-xs text-muted">
                <span style={{ color: PART.auto }}>■ Otonom</span>
                <span style={{ color: PART.tele }}>■ TeleOp</span>
                <span style={{ color: PART.end }}>■ End Game</span>
              </div>
            </div>
          </div>

          <div>
            <h3 className="mb-2 text-sm font-semibold text-muted">Tutarlılık – maç maç puan (her takımın ilk {common} maçı)</h3>
            <LineChart data={chart} series={teams.map((t, i) => ({ key: t.num, label: `#${t.num}`, color: COLORS[i] }))} />
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            {teams.map((t, i) => (
              <div key={t.num} className="rounded-xl border-2 p-3" style={{ borderColor: COLORS[i] }}>
                {pitByTeam[t.num]?.pit?.photo && <img src={pitByTeam[t.num].pit.photo} alt="" className="mb-2 h-28 w-full rounded-lg object-cover" />}
                <div className="font-bold">#{t.num} {t.name}</div>
                <div className="mt-2 grid gap-1">
                  {Object.keys(t.tags).length === 0 && <span className="text-xs text-muted">Etiket yok</span>}
                  {Object.entries(t.tags).map(([g, n]) => (
                    <div key={g} className="grid grid-cols-[1fr_auto] text-xs">
                      <span>{TAG_LABEL[g] || g}</span>
                      <b>{n}/{t.n}</b>
                    </div>
                  ))}
                </div>
                <div className="mt-2">
                  <Bar value={t.points} max={maxPts} color={COLORS[i]} label={f1(t.points)} />
                </div>
              </div>
            ))}
          </div>
        </>
      )}
      {teams.length < 2 && <p className="text-sm text-muted">Karşılaştırmak için en az 2 takım seçin.</p>}
    </section>
  );
}
