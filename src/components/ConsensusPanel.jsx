import React, { useState } from 'react';
import { averageRecords } from '../lib/consensus.js';
import { matchPoints } from '../lib/analytics.js';
import { foulsOf } from '../lib/penalties.js';
import { labelOf } from '../schema.js';

/**
 * Çift gözlem doğrulama paneli (Master). Uyuşmazlıklar üstte; yönetici:
 *   "Ortalamasını Al" → ortalama tek kayıt yazılır, kaynak kayıtlar silinir (tombstone)
 *   "N. Kaydı Seç"    → seçilmeyen kayıt(lar) silinir
 * Kararlar normal senkronizasyonla tüm cihazlara yayılır.
 */
const ROWS = [
  ['Puan (model)', (r, S, a) => a.pts(r)],
  ['Oto Tip', (r) => r.auto.tipCount],
  ['Oto sonuç', (r) => labelOf('autoSuccess', r.auto.success) || '—'],
  ['TeleOp Tip', (r) => r.teleop.tipCount],
  ['İsabet', (r) => `%${r.teleop.accuracy}`],
  ['End Game', (r) => labelOf('flowerResult', r.endgame.flowerResult) || '—'],
  ['Ceza m/M', (r) => `${foulsOf(r).minor}/${foulsOf(r).major}`],
  ['Sürücü', (r) => r.teleop.driverRating || '—'],
];

export default function ConsensusPanel({ groups, scoring, onResolve }) {
  const [openKey, setOpenKey] = useState(null);
  const [busy, setBusy] = useState(false);
  if (!groups.length) return null;
  const anomalies = groups.filter((g) => g.status === 'anomaly');
  const verified = groups.filter((g) => g.status === 'verified');

  async function act(g, choice) {
    setBusy(true);
    try {
      await onResolve(g, choice);
      setOpenKey(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card grid gap-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold">🧪 Veri Doğrulama</h2>
        <div className="flex gap-1 text-xs font-bold">
          <span className="rounded-full bg-ok/20 px-2 py-1 text-ok">✓ {verified.length} doğrulanmış</span>
          {anomalies.length > 0 && <span className="rounded-full bg-bad/20 px-2 py-1 text-bad">⚠ {anomalies.length} uyuşmazlık</span>}
        </div>
      </div>
      <p className="-mt-2 text-xs text-muted">Aynı maçta aynı takımı izleyen gözlemcilerin kayıtları karşılaştırılır (%90 ve üzeri uyum = doğrulanmış). Analizler karar verilene kadar ortalamayı kullanır.</p>
      {groups.map((g) => {
        const open = openKey === g.key;
        const anomaly = g.status === 'anomaly';
        const pts = (r) => matchPoints(r, scoring).total;
        const avg = averageRecords(g.records);
        return (
          <div key={g.key} className={`rounded-2xl border-2 ${anomaly ? 'border-bad' : 'border-ok/50'} bg-raised`}>
            <button type="button" className="flex w-full items-center gap-2 p-3 text-left" onClick={() => setOpenKey(open ? null : g.key)}>
              <span className={`text-xl ${anomaly ? 'text-bad' : 'text-ok'}`}>{anomaly ? '⚠' : '✓'}</span>
              <b>#{g.team} · {g.match}</b>
              <span className="text-xs text-muted">{g.records.map((r) => r.scouter).join(' / ')}</span>
              <span className={`ml-auto text-sm font-extrabold ${anomaly ? 'text-bad' : 'text-ok'}`}>%{Math.round(g.score * 100)}</span>
            </button>
            {open && (
              <div className="grid gap-3 border-t border-line p-3">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs text-muted">
                        <th className="py-1">Alan</th>
                        {g.records.map((r, i) => <th key={r.id}>{i + 1}. {r.scouter}</th>)}
                        <th>Ortalama</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ROWS.map(([label, fn]) => {
                        const vals = g.records.map((r) => String(fn(r, scoring, { pts })));
                        const differ = new Set(vals).size > 1;
                        return (
                          <tr key={label} className={`border-t border-line ${differ ? 'text-warn' : ''}`}>
                            <td className="py-1.5 text-muted">{label}</td>
                            {vals.map((v, i) => <td key={i} className="font-bold">{v}</td>)}
                            <td className="font-bold">{String(fn(avg, scoring, { pts }))}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${g.records.length + 1}, minmax(0,1fr))` }}>
                  <button className="btn-primary px-1 text-sm" disabled={busy} onClick={() => act(g, 'average')}>⚖ Ortalamasını Al</button>
                  {g.records.map((r, i) => (
                    <button key={r.id} className="btn-ghost px-1 text-sm" disabled={busy} onClick={() => act(g, r.id)}>{i + 1}. Kaydı Seç</button>
                  ))}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </section>
  );
}
