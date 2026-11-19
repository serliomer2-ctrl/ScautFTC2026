import React, { useMemo, useState } from 'react';
import { ABILITIES, labelOf } from '../schema.js';

const yn = (v) => (v === true ? '✅' : v === false ? '❌' : '—');
const avg = (arr) => (arr.length ? arr.reduce((s, x) => s + x, 0) / arr.length : null);
const fmt = (n, d = 1) => (n == null ? '—' : n.toFixed(d).replace(/\.0$/, ''));

function AllianceDot({ alliance }) {
  if (!alliance) return null;
  return (
    <span
      className={`inline-block h-3 w-3 rounded-full ${alliance === 'red' ? 'bg-red-alliance' : 'bg-blue-alliance'}`}
      title={labelOf('alliance', alliance)}
    />
  );
}

/* ================= KAYIT LİSTESİ ================= */
export function RecordList({ records, onEdit, onDelete, filter, setFilter }) {
  const [openId, setOpenId] = useState(null);
  const list = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return [...records]
      .filter(
        (r) =>
          !q ||
          String(r.match.teamNumber).includes(q) ||
          r.match.teamName.toLowerCase().includes(q) ||
          String(r.match.matchNumber).toLowerCase().includes(q),
      )
      .sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
  }, [records, filter]);

  return (
    <div className="grid gap-3">
      <input
        className="input"
        type="search"
        placeholder="🔍 Takım no, ad veya maç ara…"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
      />
      <p className="text-sm text-muted">{list.length} kayıt</p>
      {list.length === 0 && (
        <div className="card text-center text-muted">Henüz kayıt yok. “Gözlem” sekmesinden ilk maçı girin.</div>
      )}
      {list.map((r) => {
        const open = openId === r.id;
        return (
          <article key={r.id} className="card p-0">
            <button
              type="button"
              className="flex w-full items-center gap-3 p-4 text-left"
              onClick={() => setOpenId(open ? null : r.id)}
            >
              <AllianceDot alliance={r.match.alliance} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-lg font-bold">
                  #{r.match.teamNumber} {r.match.teamName && <span className="font-medium text-muted">· {r.match.teamName}</span>}
                </div>
                <div className="text-sm text-muted">
                  Maç {r.match.matchNumber} · Tip {r.auto.tipCount}+{r.teleop.tipCount} · %{r.teleop.accuracy} isabet
                  {r.teleop.driverRating ? ` · ${'★'.repeat(r.teleop.driverRating)}` : ''}
                </div>
              </div>
              <span className="text-muted">{open ? '▴' : '▾'}</span>
            </button>
            {open && (
              <div className="grid gap-3 border-t border-line p-4 text-sm">
                <dl className="grid grid-cols-2 gap-x-4 gap-y-1">
                  <dt className="text-muted">Şasi</dt>
                  <dd>{r.robot.drivetrain === 'other' ? r.robot.drivetrainOther || 'Diğer' : labelOf('drivetrain', r.robot.drivetrain) || '—'}</dd>
                  <dt className="text-muted">Intake</dt>
                  <dd>{labelOf('intake', r.robot.intake) || '—'}</dd>
                  {ABILITIES.map((a) => (
                    <React.Fragment key={a.key}>
                      <dt className="text-muted">{a.label}</dt>
                      <dd>{yn(r.robot.abilities[a.key])}</dd>
                    </React.Fragment>
                  ))}
                  <dt className="text-muted">Otonom</dt>
                  <dd>
                    {yn(r.auto.hasAuto)} {labelOf('autoSuccess', r.auto.success)}
                  </dd>
                  {r.auto.hasAuto && (
                    <>
                      <dt className="text-muted">Odometri / Vision</dt>
                      <dd>{yn(r.auto.odometry)} / {yn(r.auto.vision)}</dd>
                      <dt className="text-muted">Başlangıç / Kaynak</dt>
                      <dd>{labelOf('startPosition', r.auto.startPosition) || '—'} / {labelOf('pickupSource', r.auto.pickupSource) || '—'}</dd>
                      <dt className="text-muted">Rota sayısı</dt>
                      <dd>{r.auto.routeCount}</dd>
                      <dt className="text-muted">Yardımsız Tip</dt>
                      <dd>{yn(r.auto.soloTip)}</dd>
                    </>
                  )}
                  <dt className="text-muted">Oto hizalama</dt>
                  <dd>{yn(r.teleop.autoAim)}</dd>
                  <dt className="text-muted">Sürücü asistanı</dt>
                  <dd>{yn(r.teleop.driverAssist)}</dd>
                  <dt className="text-muted">Taşıma kapasitesi</dt>
                  <dd>{r.teleop.carryCapacity}</dd>
                  <dt className="text-muted">End Game Flower</dt>
                  <dd>
                    Plan {yn(r.endgame.flowerPlanned)} · {labelOf('flowerResult', r.endgame.flowerResult) || '—'}
                  </dd>
                  <dt className="text-muted">Gözlemci</dt>
                  <dd>{r.scouter || '—'}</dd>
                </dl>
                {r.auto.performance && <p><b>Otonom:</b> {r.auto.performance}</p>}
                {r.teleop.assistDescription && <p><b>Asistan:</b> {r.teleop.assistDescription}</p>}
                {r.match.notes && <p className="rounded-lg bg-raised p-3"><b>Not:</b> {r.match.notes}</p>}
                <div className="grid grid-cols-2 gap-2">
                  <button className="btn-ghost" onClick={() => onEdit(r)}>✏️ Düzenle</button>
                  <button className="btn-danger" onClick={() => onDelete(r)}>🗑️ Sil</button>
                </div>
              </div>
            )}
          </article>
        );
      })}
    </div>
  );
}

/* ================= TAKIM ÖZETİ (strateji / alliance seçimi) ================= */
export function TeamSummary({ records, onPickTeam }) {
  const [sortKey, setSortKey] = useState('tips');

  const teams = useMemo(() => {
    const map = new Map();
    for (const r of records) {
      const k = String(r.match.teamNumber);
      if (!map.has(k)) map.set(k, []);
      map.get(k).push(r);
    }
    return [...map.entries()].map(([num, rs]) => {
      const latest = [...rs].sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''))[0];
      const flowerTried = rs.filter((r) => r.endgame.flowerResult === 'done' || r.endgame.flowerResult === 'failed');
      const ratings = rs.map((r) => r.teleop.driverRating).filter(Boolean);
      return {
        num,
        name: rs.find((r) => r.match.teamName)?.match.teamName || '',
        matches: rs.length,
        autoTip: avg(rs.map((r) => (r.auto.hasAuto ? r.auto.tipCount : 0))),
        teleTip: avg(rs.map((r) => r.teleop.tipCount)),
        tips: avg(rs.map((r) => (r.auto.hasAuto ? r.auto.tipCount : 0) + r.teleop.tipCount)),
        accuracy: avg(rs.map((r) => r.teleop.accuracy)),
        driver: avg(ratings),
        autoRate: rs.filter((r) => r.auto.hasAuto).length / rs.length,
        flowerRate: flowerTried.length
          ? flowerTried.filter((r) => r.endgame.flowerResult === 'done').length / flowerTried.length
          : null,
        drivetrain: latest.robot.drivetrain === 'other' ? latest.robot.drivetrainOther || 'Diğer' : labelOf('drivetrain', latest.robot.drivetrain),
        abilities: ABILITIES.filter((a) => rs.some((r) => r.robot.abilities[a.key] === true)).map((a) => a.key),
      };
    });
  }, [records]);

  const sorted = [...teams].sort((a, b) => (b[sortKey] ?? -1) - (a[sortKey] ?? -1));
  const SORTS = [
    ['tips', 'Toplam Tip'],
    ['accuracy', 'İsabet'],
    ['driver', 'Sürücü'],
    ['flowerRate', 'Flower'],
  ];
  const ABBR = { hive: 'Hive', flower: 'Flower', nectar: 'Nektar', pollen: 'Polen', stealFlower: 'Çalma' };

  if (!teams.length)
    return <div className="card text-center text-muted">Özet için önce birkaç maç kaydedin.</div>;

  return (
    <div className="grid gap-3">
      <div className="grid grid-cols-4 gap-2">
        {SORTS.map(([k, l]) => (
          <button
            key={k}
            className={`btn min-h-[44px] border-2 px-1 text-sm ${sortKey === k ? 'border-accent bg-accent text-accent-fg' : 'border-line bg-raised'}`}
            onClick={() => setSortKey(k)}
          >
            {l}
          </button>
        ))}
      </div>
      {sorted.map((t, i) => (
        <button key={t.num} type="button" className="card text-left" onClick={() => onPickTeam(t.num)}>
          <div className="flex items-baseline gap-2">
            <span className="text-sm font-bold text-muted">{i + 1}.</span>
            <span className="text-xl font-extrabold">#{t.num}</span>
            <span className="truncate text-muted">{t.name}</span>
            <span className="ml-auto text-xs text-muted">{t.matches} maç</span>
          </div>
          <div className="mt-3 grid grid-cols-4 gap-2 text-center">
            {[
              ['Oto Tip', fmt(t.autoTip)],
              ['Tele Tip', fmt(t.teleTip)],
              ['İsabet', t.accuracy == null ? '—' : `%${fmt(t.accuracy, 0)}`],
              ['Sürücü', t.driver == null ? '—' : `${fmt(t.driver)}★`],
            ].map(([l, v]) => (
              <div key={l} className="rounded-lg bg-raised py-2">
                <div className="text-lg font-bold tabular-nums">{v}</div>
                <div className="text-[11px] text-muted">{l}</div>
              </div>
            ))}
          </div>
          <div className="mt-2 flex flex-wrap gap-1 text-xs">
            {t.drivetrain && <span className="rounded-full border border-line px-2 py-0.5">{t.drivetrain}</span>}
            <span className="rounded-full border border-line px-2 py-0.5">Otonom %{fmt(t.autoRate * 100, 0)}</span>
            {t.flowerRate != null && (
              <span className="rounded-full border border-line px-2 py-0.5">EG Flower %{fmt(t.flowerRate * 100, 0)}</span>
            )}
            {t.abilities.map((k) => (
              <span key={k} className="rounded-full bg-accent/20 px-2 py-0.5 text-fg">{ABBR[k]}</span>
            ))}
          </div>
        </button>
      ))}
    </div>
  );
}
