import React, { useEffect } from 'react';
import { ABILITIES, labelOf } from '../schema.js';
import { TAG_LABEL, avgCycle } from './MatchExtras.jsx';

/** Boş bırakılan (işaretlenmemiş) önemli alanları sayar – gözlemciye hatırlatma için */
function missingFields(r) {
  const miss = [];
  if (!r.robot.drivetrain) miss.push('Şasi tipi');
  if (!r.robot.intake) miss.push('Intake');
  if (ABILITIES.some((a) => r.robot.abilities[a.key] == null)) miss.push('Yetenekler');
  if (r.auto.hasAuto == null) miss.push('Otonom var mı');
  if (r.auto.hasAuto && !r.auto.success) miss.push('Otonom başarı');
  if (!r.teleop.driverRating) miss.push('Sürücü puanı');
  if (!r.endgame.flowerResult) miss.push('End Game sonucu');
  return miss;
}

export default function SaveConfirm({ rec, isEditing, onCancel, onConfirm }) {
  useEffect(() => {
    const esc = (e) => e.key === 'Escape' && onCancel();
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [onCancel]);

  const miss = missingFields(rec);
  const cyc = avgCycle(rec.cycles);
  const rows = [
    ['İttifak', labelOf('alliance', rec.match.alliance)],
    ['Otonom', rec.auto.hasAuto === false ? 'Yok' : `${rec.auto.tipCount} Tip · ${labelOf('autoSuccess', rec.auto.success) || '—'}`],
    ['TeleOp', `${rec.teleop.tipCount} Tip · %${rec.teleop.accuracy} isabet`],
    ['Sürücü', rec.teleop.driverRating ? '★'.repeat(rec.teleop.driverRating) : '—'],
    ['End Game', labelOf('flowerResult', rec.endgame.flowerResult) || '—'],
    ['Döngü', rec.cycles?.length ? `${rec.cycles.length} × ort. ${cyc.toFixed(1)} sn` : '—'],
    ['Harita', rec.fieldMap ? `${rec.fieldMap.start ? 'başlangıç + ' : ''}${rec.fieldMap.shots?.length || 0} skor noktası` : '—'],
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label="Kayıt onayı">
      <div className="card max-h-[90vh] w-full max-w-md overflow-y-auto rounded-b-none sm:rounded-2xl">
        <h2 className="text-2xl font-extrabold">
          #{rec.match.teamNumber} <span className="text-base font-semibold text-muted">· Maç {rec.match.matchNumber}</span>
        </h2>
        <p className="text-sm text-muted">{rec.match.teamName || 'İsimsiz takım'} · Gözlemci: {rec.scouter || '—'}</p>

        <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
          {rows.map(([k, v]) => (
            <React.Fragment key={k}>
              <dt className="text-muted">{k}</dt>
              <dd className="font-semibold">{v}</dd>
            </React.Fragment>
          ))}
        </dl>

        {rec.tags?.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1">
            {rec.tags.map((t) => (
              <span key={t} className="rounded-full bg-raised px-2 py-1 text-xs">{TAG_LABEL[t] || t}</span>
            ))}
          </div>
        )}

        {miss.length > 0 && (
          <p className="mt-3 rounded-xl bg-accent/15 p-3 text-sm">
            ⚠️ Boş kalan alanlar: <b>{miss.join(', ')}</b>. Yine de kaydedebilirsiniz.
          </p>
        )}

        <div className="mt-4 grid grid-cols-[1fr_1.6fr] gap-3">
          <button className="btn-ghost min-h-[56px]" onClick={onCancel}>✏️ Düzenle</button>
          <button className="btn-primary min-h-[56px] text-lg" onClick={onConfirm} autoFocus>
            ✅ {isEditing ? 'Güncelle' : 'Onayla & Kaydet'}
          </button>
        </div>
      </div>
    </div>
  );
}
