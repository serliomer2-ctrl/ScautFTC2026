import React, { useState } from 'react';
import { ABILITIES } from '../schema.js';
import { Bar, LineChart } from './Charts.jsx';

export const f1 = (n) => (n == null || Number.isNaN(n) ? '—' : (Math.round(n * 10) / 10).toString());
export const pct = (n) => (n == null ? '—' : `%${Math.round(n * 100)}`);

const C = {
  total: 'rgb(var(--accent))',
  auto: 'rgb(var(--alliance-blue))',
  tele: 'rgb(var(--ok))',
};

function Tile({ label, value, sub }) {
  return (
    <div className="rounded-xl bg-raised p-3 text-center">
      <div className="text-2xl font-extrabold tabular-nums">{value}</div>
      <div className="text-xs text-muted">{label}</div>
      {sub && <div className="text-[11px] text-muted">{sub}</div>}
    </div>
  );
}

export default function TeamsView({ stats, selected, setSelected }) {
  const [q, setQ] = useState('');
  const team = stats.find((t) => t.num === selected);
  if (team) return <TeamDetail t={team} onBack={() => setSelected(null)} />;

  const list = stats.filter((t) => !q || t.num.includes(q) || t.name.toLowerCase().includes(q.toLowerCase()));
  if (!stats.length) return <div className="card text-center text-muted">Bu odada henüz kayıt yok.</div>;
  return (
    <div className="grid gap-3">
      <input className="input" type="search" placeholder="🔍 Takım ara…" value={q} onChange={(e) => setQ(e.target.value)} />
      {list.map((t, i) => (
        <button key={t.num} className="card text-left" onClick={() => setSelected(t.num)}>
          <div className="flex items-baseline gap-2">
            <span className="text-sm font-bold text-muted">{i + 1}.</span>
            <span className="text-xl font-extrabold">#{t.num}</span>
            <span className="truncate text-muted">{t.name}</span>
            <span className="ml-auto text-xs text-muted">{t.n} maç</span>
          </div>
          <div className="mt-3 grid grid-cols-4 gap-2">
            <Tile label="Tahmini Puan" value={f1(t.points)} />
            <Tile label="Oto Tip" value={f1(t.autoTip)} />
            <Tile label="Tele Tip" value={f1(t.teleTip)} />
            <Tile label="İsabet" value={`%${Math.round(t.accuracy)}`} />
          </div>
        </button>
      ))}
    </div>
  );
}

function TeamDetail({ t, onBack }) {
  const trend = t.trend > 1 ? '📈 yükselişte' : t.trend < -1 ? '📉 düşüşte' : '➖ stabil';
  return (
    <div className="grid gap-4">
      <button className="btn-ghost justify-self-start" onClick={onBack}>← Tüm takımlar</button>

      <section className="card grid gap-4">
        <div>
          <h2 className="text-3xl font-extrabold">#{t.num}</h2>
          <p className="text-muted">{t.name || 'İsimsiz takım'} · {t.n} maç gözlemlendi · {t.n >= 3 ? trend : 'az veri'}</p>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Tile label="Tahmini Puan / maç" value={f1(t.points)} sub={`± ${f1(t.sigma)}`} />
          <Tile label="Otonom Tip" value={f1(t.autoTip)} />
          <Tile label="TeleOp Tip" value={f1(t.teleTip)} />
          <Tile label="İsabet" value={`%${Math.round(t.accuracy)}`} />
          <Tile label="Sürücü" value={t.driver ? `${f1(t.driver)}★` : '—'} />
          <Tile label="Taşıma" value={f1(t.carry)} />
          <Tile label="Otonom Başarı" value={pct(t.autoSuccess)} />
          <Tile label="EG Flower" value={pct(t.flowerRate)} />
        </div>
      </section>

      <section className="card">
        <h3 className="mb-3 text-lg font-bold">Maç Bazlı Performans (puan)</h3>
        <LineChart
          data={t.perMatch}
          series={[
            { key: 'total', label: 'Toplam', color: C.total },
            { key: 'auto', label: 'Otonom', color: C.auto },
            { key: 'tele', label: 'TeleOp', color: C.tele },
          ]}
        />
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-muted">
              <tr className="text-left">
                <th className="py-1">Maç</th><th>Oto Tip</th><th>Tele Tip</th><th>İsabet</th><th>EG</th><th className="text-right">Puan</th>
              </tr>
            </thead>
            <tbody>
              {t.perMatch.map((m, i) => (
                <tr key={i} className="border-t border-line">
                  <td className="py-2 font-semibold">{m.match}</td>
                  <td>{m.autoTip}</td>
                  <td>{m.teleTip}</td>
                  <td>%{m.accuracy}</td>
                  <td>{m.end ? '🌸' : '—'}</td>
                  <td className="text-right font-bold">{m.total}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card grid gap-3">
        <h3 className="text-lg font-bold">🔧 Pit Özeti</h3>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
          <dt className="text-muted">Şasi</dt><dd>{t.pit.drivetrain || '—'}</dd>
          <dt className="text-muted">Intake</dt><dd>{t.pit.intake || '—'}</dd>
          <dt className="text-muted">Başlangıç</dt><dd>{t.pit.start || '—'}</dd>
          <dt className="text-muted">Top kaynağı (oto)</dt><dd>{t.pit.pickup || '—'}</dd>
          <dt className="text-muted">Kayıtlı rota</dt><dd>{t.pit.routes}</dd>
          <dt className="text-muted">Odometri / Vision</dt><dd>{pct(t.pit.odometry)} / {pct(t.pit.vision)}</dd>
          <dt className="text-muted">Oto hizalama</dt><dd>{pct(t.autoAim)}</dd>
        </dl>
        <div className="grid gap-2">
          {ABILITIES.map((a) => (
            <div key={a.key} className="grid grid-cols-[1fr_1.2fr] items-center gap-2 text-sm">
              <span>{a.label}</span>
              <Bar value={t.abilities[a.key]} max={1} label={pct(t.abilities[a.key])} color={C.tele} />
            </div>
          ))}
        </div>
        <p className="text-xs text-muted">Yüzdeler: o yeteneğe “Evet” denen maçların oranı.</p>
      </section>

      <section className="card grid gap-2">
        <h3 className="text-lg font-bold">📝 Gözlemci Notları</h3>
        {t.notes.length === 0 && <p className="text-sm text-muted">Not yok.</p>}
        {t.notes.map((n, i) => (
          <div key={i} className="rounded-xl bg-raised p-3 text-sm">
            <div className="mb-1 text-xs text-muted">
              <b className="text-fg">{n.kind}</b> · Maç {n.match}{n.scouter ? ` · ${n.scouter}` : ''}
            </div>
            {n.text}
          </div>
        ))}
      </section>
    </div>
  );
}
