import React, { useMemo, useState } from 'react';
import { ABILITIES, labelOf } from '../schema.js';

const yn = (v) => (v === true ? '✅' : v === false ? '❌' : '—');

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
                  <span title={r._pending ? 'Senkronizasyon bekliyor' : 'Depoya kaydedildi'}>{r._pending ? '⏳' : '☁️'}</span>{' '}
                  #{r.match.teamNumber} {r.match.teamName && <span className="font-medium text-muted">· {r.match.teamName}</span>}
                </div>
                <div className="text-sm text-muted">
                  Maç {r.match.matchNumber}{r.scouter ? ` · ${r.scouter}` : ''} · Tip {r.auto.tipCount}+{r.teleop.tipCount} · %{r.teleop.accuracy} isabet
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
