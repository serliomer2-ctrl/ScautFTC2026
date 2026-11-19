import React, { useMemo, useState } from 'react';
import { partnerRanking, predictMatch } from '../lib/analytics.js';
import { Bar } from './Charts.jsx';
import { f1, pct } from './TeamsView.jsx';

function TeamSelect({ stats, value, onChange, placeholder = 'Takım seç', exclude = [] }) {
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

/* ================= KARŞILAŞTIRMA + İTTİFAK SEÇİMİ ================= */
const METRICS = [
  ['points', 'Tahmini puan', (v) => f1(v)],
  ['autoTip', 'Otonom Tip', (v) => f1(v)],
  ['teleTip', 'TeleOp Tip', (v) => f1(v)],
  ['accuracy', 'İsabet %', (v) => `%${Math.round(v)}`],
  ['driver', 'Sürücü ★', (v) => (v == null ? '—' : f1(v))],
  ['carry', 'Taşıma', (v) => f1(v)],
  ['autoSuccess', 'Otonom başarı', (v) => pct(v)],
  ['flowerRate', 'EG Flower', (v) => pct(v)],
];
const COLORS = ['rgb(var(--accent))', 'rgb(var(--alliance-blue))', 'rgb(var(--ok))', 'rgb(var(--alliance-red))'];

export function AllianceView({ stats, onOpenTeam, myTeam, setMyTeam }) {
  const [compare, setCompare] = useState([]);
  const ranking = useMemo(() => (myTeam ? partnerRanking(stats, myTeam) : []), [stats, myTeam]);
  const picked = compare.map((n) => stats.find((t) => t.num === n)).filter(Boolean);

  const toggle = (num) =>
    setCompare((c) => (c.includes(num) ? c.filter((x) => x !== num) : c.length >= 4 ? [...c.slice(1), num] : [...c, num]));

  if (stats.length < 2) return <div className="card text-center text-muted">Karşılaştırma için en az 2 takımın verisi gerekli.</div>;

  return (
    <div className="grid gap-4">
      <section className="card grid gap-3">
        <h2 className="text-lg font-bold">⚖️ Takım Karşılaştırma <span className="text-sm font-normal text-muted">(en fazla 4)</span></h2>
        <div className="flex flex-wrap gap-2">
          {stats.map((t) => {
            const i = compare.indexOf(t.num);
            return (
              <button
                key={t.num}
                onClick={() => toggle(t.num)}
                className="rounded-full border-2 px-3 py-2 text-sm font-semibold"
                style={i >= 0 ? { borderColor: COLORS[i], background: COLORS[i], color: '#000' } : { borderColor: 'rgb(var(--line))' }}
              >
                #{t.num}
              </button>
            );
          })}
        </div>
        {picked.length > 0 && (
          <div className="grid gap-4">
            {METRICS.map(([k, label, fmt]) => {
              const max = Math.max(...stats.map((t) => (k === 'driver' ? 5 : k === 'accuracy' ? 100 : ['autoSuccess', 'flowerRate'].includes(k) ? 1 : t[k] ?? 0)), 0.0001);
              return (
                <div key={k}>
                  <div className="mb-1 text-sm font-semibold text-muted">{label}</div>
                  <div className="grid gap-1">
                    {picked.map((t, i) => (
                      <div key={t.num} className="grid grid-cols-[64px_1fr] items-center gap-2 text-sm">
                        <span className="font-bold">#{t.num}</span>
                        <Bar value={t[k] ?? 0} max={max} color={COLORS[i]} label={fmt(t[k])} />
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="card grid gap-3">
        <h2 className="text-lg font-bold">🤝 İttifak Partneri Önerisi</h2>
        <p className="text-sm text-muted">
          Kendi takımınızı seçin; partnerler beklenen puan (%55), sizin zayıf olduğunuz rolleri tamamlama (%20),
          tutarlılık (%15) ve sürücü puanına (%10) göre sıralanır.
        </p>
        <TeamSelect stats={stats} value={myTeam} onChange={setMyTeam} placeholder="Bizim takımımız…" />
        {!stats.some((t) => t.num === myTeam) && myTeam && (
          <p className="text-sm text-muted">Bu takımın kaydı yok; yalnızca partnerin gücüne göre sıralanıyor.</p>
        )}
        {ranking.slice(0, 10).map((p, i) => (
          <button key={p.team.num} className="rounded-xl border border-line bg-raised p-3 text-left" onClick={() => onOpenTeam(p.team.num)}>
            <div className="flex items-center gap-3">
              <span className="text-2xl font-extrabold text-muted">{i + 1}</span>
              <div className="min-w-0 flex-1">
                <div className="font-bold">#{p.team.num} <span className="font-normal text-muted">{p.team.name}</span></div>
                <div className="text-xs text-muted">
                  Birlikte ≈ {f1(p.combined)} puan · {p.team.n} maç{p.lowData ? ' · ⚠️ az veri' : ''}
                </div>
              </div>
              <div className="text-right">
                <div className="text-2xl font-extrabold text-accent">{Math.round(p.score)}</div>
                <div className="text-[10px] text-muted">uyum</div>
              </div>
            </div>
            {p.covers.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {p.covers.map((c) => (
                  <span key={c} className="rounded-full bg-ok/20 px-2 py-0.5 text-xs">+ {c}</span>
                ))}
              </div>
            )}
          </button>
        ))}
      </section>
    </div>
  );
}

/* ================= MAÇ SİMÜLATÖRÜ ================= */
export function PredictorView({ stats, scoring, setScoring }) {
  const [sel, setSel] = useState({ r1: '', r2: '', b1: '', b2: '' });
  const used = Object.values(sel).filter(Boolean);
  const get = (n) => stats.find((t) => t.num === n);
  const red = [get(sel.r1), get(sel.r2)].filter(Boolean);
  const blue = [get(sel.b1), get(sel.b2)].filter(Boolean);
  const ready = red.length && blue.length;
  const res = ready ? predictMatch(red, blue) : null;

  const slot = (k, ph) => <TeamSelect stats={stats} value={sel[k]} onChange={(v) => setSel({ ...sel, [k]: v })} placeholder={ph} exclude={used} />;

  return (
    <div className="grid gap-4">
      <section className="card grid gap-3">
        <h2 className="text-lg font-bold">🎲 Maç Simülatörü</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="grid gap-2 rounded-xl border-2 border-red-alliance p-3">
            <span className="font-bold text-red-alliance">KIRMIZI İTTİFAK</span>
            {slot('r1', 'Kırmızı 1')}
            {slot('r2', 'Kırmızı 2')}
          </div>
          <div className="grid gap-2 rounded-xl border-2 border-blue-alliance p-3">
            <span className="font-bold text-blue-alliance">MAVİ İTTİFAK</span>
            {slot('b1', 'Mavi 1')}
            {slot('b2', 'Mavi 2')}
          </div>
        </div>
      </section>

      {res && (
        <section className="card grid gap-4">
          <div className="grid grid-cols-2 gap-3 text-center">
            {[['red', 'Kırmızı', res.red, res.pRed], ['blue', 'Mavi', res.blue, res.pBlue]].map(([k, l, a, p]) => (
              <div key={k} className={`rounded-xl p-4 text-white ${k === 'red' ? 'bg-red-alliance' : 'bg-blue-alliance'}`}>
                <div className="text-sm font-semibold opacity-90">{l}</div>
                <div className="text-4xl font-extrabold tabular-nums">{Math.round(a.mu)}</div>
                <div className="text-xs opacity-90">± {Math.round(a.sigma)} puan</div>
                <div className="mt-2 text-2xl font-bold">%{Math.round(p * 100)}</div>
                <div className="text-xs opacity-90">kazanma ihtimali</div>
              </div>
            ))}
          </div>
          <div className="flex h-4 overflow-hidden rounded-full">
            <div className="bg-red-alliance" style={{ width: `${res.pRed * 100}%` }} />
            <div className="flex-1 bg-blue-alliance" />
          </div>
          <table className="w-full text-sm">
            <thead className="text-muted">
              <tr><th className="text-left">Dönem</th><th>Kırmızı</th><th>Mavi</th></tr>
            </thead>
            <tbody className="text-center">
              {[['Otonom', 'auto'], ['TeleOp', 'tele'], ['End Game', 'end']].map(([l, k]) => (
                <tr key={k} className="border-t border-line">
                  <td className="py-2 text-left">{l}</td>
                  <td className="font-bold">{f1(res.red[k])}</td>
                  <td className="font-bold">{f1(res.blue[k])}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-xs text-muted">
            {Math.abs(res.margin) < 5 ? 'Çok yakın maç – End Game ve faul belirleyici olabilir. ' : ''}
            Tahmin, takımların bu odadaki maç ortalamalarına ve tutarlılığına dayanır; 1–2 maçlık veride belirsizlik yüksektir.
          </p>
        </section>
      )}

      <ScoringEditor scoring={scoring} setScoring={setScoring} />
    </div>
  );
}

function ScoringEditor({ scoring, setScoring }) {
  const [open, setOpen] = useState(false);
  const fields = [
    ['autoTip', 'Otonom Tip başına'],
    ['teleTip', 'TeleOp Tip başına'],
    ['endFlower', 'End Game Flower'],
    ['autoBonus', 'Otonom başarı bonusu'],
  ];
  return (
    <section className="card">
      <button className="flex w-full justify-between font-bold" onClick={() => setOpen(!open)}>
        🧮 Puan Modeli <span className="text-muted">{open ? '▴' : '▾'}</span>
      </button>
      {open && (
        <div className="mt-3 grid gap-3">
          <p className="text-xs text-muted">Biobuzz kural kitabındaki puan değerlerini girin. Tüm analizler buna göre hesaplanır (bu cihazda saklanır).</p>
          <div className="grid grid-cols-2 gap-3">
            {fields.map(([k, l]) => (
              <label key={k} className="grid gap-1 text-sm">
                <span className="text-muted">{l}</span>
                <input
                  className="input"
                  inputMode="numeric"
                  value={scoring[k]}
                  onChange={(e) => setScoring({ ...scoring, [k]: Number(e.target.value.replace(/[^\d.]/g, '')) || 0 })}
                />
              </label>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
