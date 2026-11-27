import React, { useMemo, useState } from 'react';
import { labelOf } from '../schema.js';
import { predictMatch } from '../lib/analytics.js';
import { cachedEvent } from '../lib/ftcscout.js';
import { KIND_LABEL, pairSynergy, zoneProfile } from '../lib/synergy.js';
import { PIT_ALERTS } from './PitScouting.jsx';
import { f1 } from './TeamsView.jsx';

/**
 * 60 saniyelik "Drive Team" maç öncesi brifingi.
 * Sıradaki maç (yüklü FTCScout programından, bizim takımın oynanmamış ilk maçı) ya da elle girilen
 * 4 takım için: ana skor kaynağı, otonom başlangıcı/rotası, uyarılar ve otomatik aksiyon maddeleri.
 * Tüm hesaplar mevcut analiz verisinden yapılır; internet gerekmez.
 */
const PHASE = { autoPts: 'Otonom', telePts: 'TeleOp', endPts: 'Endgame' };
const BAD_TAGS = { brownout: 'bağlantı koptu', tipped: 'devrildi', penalty: 'ceza aldı', noShow: 'maça çıkmadı' };

function readEvent() {
  try {
    const last = JSON.parse(localStorage.getItem('bb2.event.last')) || {};
    return last.code ? cachedEvent(last.season, last.code) : null;
  } catch {
    return null;
  }
}

/** Brifing için takım özeti */
function brief(t, pit) {
  if (!t) return null;
  const prof = zoneProfile(t.records);
  const main = Object.keys(PHASE).sort((a, b) => t[b] - t[a])[0];
  const tagCount = {};
  t.records.forEach((r) => (r.tags || []).forEach((g) => (tagCount[g] = (tagCount[g] || 0) + 1)));
  const warns = [
    ...Object.entries(BAD_TAGS).filter(([g]) => tagCount[g]).map(([g, txt]) => `${tagCount[g]}× ${txt}`),
    ...(pit?.pit?.alerts || []).map((a) => PIT_ALERTS.find((x) => x.id === a.id)).filter((a) => a && a.tone !== 'ok').map((a) => a.label),
  ];
  const lastAuto = [...t.records].reverse().find((r) => r.auto.performance)?.auto.performance;
  return {
    t,
    prof,
    main,
    danger:
      t.flowerRate >= 0.6 && t.endPts >= t.telePts * 0.5
        ? `Endgame Flower %${Math.round(t.flowerRate * 100)}`
        : `${PHASE[main]}${prof.dominant ? ` · ${KIND_LABEL[prof.dominant.kind]}` : ''} (${f1(t[main])} p)`,
    start: [prof.startSide && `${prof.startSide} taraf`, prof.startPos && labelOf('startPosition', prof.startPos)].filter(Boolean).join(' · ') || '—',
    route: pit?.pit?.autoNotes || lastAuto || (t.autoRate ? `${f1(t.autoTip)} Tip / otonom` : 'Otonom yok'),
    warns,
  };
}

/** Otomatik aksiyon maddeleri */
function actions(ours, theirs, mine, pred, ourColor) {
  const out = [];
  const opp = theirs.filter(Boolean).sort((a, b) => b.t.points - a.t.points);
  if (opp[0]) out.push(`Rakibin en yüksek skorlu robotu #${opp[0].t.num} (ort ${f1(opp[0].t.points)} p, ${opp[0].danger}); savunma yapılacaksa ona odaklanılmalı.`);
  const partner = ours.find((b) => b && b.t.num !== String(mine));
  const me = ours.find((b) => b && b.t.num === String(mine));
  if (partner?.prof.startSide) {
    const other = partner.prof.startSide === 'sol' ? 'sağ' : 'sol';
    if (me?.prof.startSide && me.prof.startSide === partner.prof.startSide)
      out.push(`⚠ Partnerimiz #${partner.t.num} de bizim gibi ${partner.prof.startSide} taraftan otonom yapıyor – biri ${other} tarafa geçmeli.`);
    else out.push(`Partnerimiz #${partner.t.num} ${partner.prof.startSide} bölgeden otonom yapıyor, biz ${other}dan başlamalıyız.`);
  }
  if (me && partner) {
    const s = pairSynergy(me.t, partner.t);
    if (s.level === 'conflict') out.push(`Alan çakışması riski: ${s.reasons[0]}. Görev paylaşımını şimdi netleştirin.`);
  }
  const egOpp = opp.find((b) => b.t.flowerRate >= 0.6);
  if (egOpp) out.push(`#${egOpp.t.num} Endgame'de güçlü (Flower %${Math.round(egOpp.t.flowerRate * 100)}) – farkı Endgame'den önce açmalıyız.`);
  for (const b of opp) if (b.warns.length) out.push(`#${b.t.num} güvenilirlik sorunu yaşamış (${b.warns.join(', ')}) – maç uzarsa baskı avantajlı olabilir.`);
  if (partner?.warns.length) out.push(`Partner #${partner.t.num}: ${partner.warns.join(', ')} – yedek plan hazır olsun.`);
  if (pred && ourColor) {
    const p = ourColor === 'red' ? pred.pRed : pred.pBlue;
    out.push(p >= 0.65 ? `Favoriyiz (%${Math.round(p * 100)}): risk almadan, temiz döngülerle oynayın.` : p <= 0.35 ? `Zorlu maç (%${Math.round(p * 100)}): yüksek puanlı hedeflere öncelik verin, savunma seçeneğini değerlendirin.` : `Başa baş (%${Math.round(p * 100)}): Endgame ve ceza disiplini belirleyici.`);
  }
  return out;
}

export default function Briefing({ stats, pitByTeam, myTeam }) {
  const ev = useMemo(readEvent, []);
  const mine = String(myTeam || '');
  const upcoming = (ev?.matches || []).filter((m) => !m.played);
  const myNext = upcoming.filter((m) => [...m.red.teams, ...m.blue.teams].includes(mine));
  const [key, setKey] = useState(() => myNext[0]?.key || upcoming[0]?.key || '');
  const [manual, setManual] = useState({ r1: '', r2: '', b1: '', b2: '' });
  const [full, setFull] = useState(false);
  const byNum = useMemo(() => Object.fromEntries(stats.map((t) => [t.num, t])), [stats]);

  const m = ev?.matches.find((x) => x.key === key);
  const red = m ? m.red.teams : [manual.r1, manual.r2].filter(Boolean);
  const blue = m ? m.blue.teams : [manual.b1, manual.b2].filter(Boolean);
  const R = red.map((n) => ({ n, b: brief(byNum[n], pitByTeam[n]) }));
  const B = blue.map((n) => ({ n, b: brief(byNum[n], pitByTeam[n]) }));
  const ourColor = red.includes(mine) ? 'red' : blue.includes(mine) ? 'blue' : null;
  const Rs = R.map((x) => x.b?.t).filter(Boolean);
  const Bs = B.map((x) => x.b?.t).filter(Boolean);
  const pred = Rs.length && Bs.length ? predictMatch(Rs, Bs) : null;
  const acts =
    R.length || B.length
      ? ourColor
        ? actions((ourColor === 'red' ? R : B).map((x) => x.b), (ourColor === 'red' ? B : R).map((x) => x.b), mine, pred, ourColor)
        : actions(R.map((x) => x.b), B.map((x) => x.b), null, pred, null)
      : [];

  const Card = ({ n, b, color }) => (
    <div className={`rounded-2xl border-4 bg-black p-3 ${color === 'red' ? 'border-red-alliance' : 'border-blue-alliance'} ${n === mine ? 'ring-4 ring-warn' : ''}`}>
      <div className="flex items-baseline justify-between">
        <span className="text-4xl font-black text-white">{n}</span>
        {b && <span className="text-3xl font-black text-accent">{Math.round(b.t.points)}</span>}
      </div>
      {!b ? (
        <p className="mt-2 text-lg text-white/60">Scouting verisi yok</p>
      ) : (
        <div className="mt-2 grid gap-1.5 text-lg leading-snug text-white">
          <div><span className="text-sm font-bold uppercase text-white/50">Tehlike</span><br /><b>{b.danger}</b></div>
          <div><span className="text-sm font-bold uppercase text-white/50">Otonom</span><br /><b>{b.start}</b><span className="block text-base text-white/80">{b.route}</span></div>
          {b.warns.length > 0 && <div className="text-base font-bold text-bad">⚠ {b.warns.join(' · ')}</div>}
        </div>
      )}
    </div>
  );

  const body = (
    <div className="grid gap-3">
      <div className="flex items-center gap-2">
        <h2 className="flex-1 text-2xl font-black">📣 Maç Brifingi {m ? m.label : ''}</h2>
        <button className="btn-ghost px-3" onClick={() => setFull(!full)}>{full ? '✕ Kapat' : '⛶ Tam ekran'}</button>
      </div>
      {pred && (
        <div className="grid grid-cols-2 gap-2 text-center">
          <div className="rounded-2xl bg-red-alliance p-2 text-white"><div className="text-4xl font-black">{Math.round(pred.red.mu)}</div><div className="font-bold">%{Math.round(pred.pRed * 100)}</div></div>
          <div className="rounded-2xl bg-blue-alliance p-2 text-white"><div className="text-4xl font-black">{Math.round(pred.blue.mu)}</div><div className="font-bold">%{Math.round(pred.pBlue * 100)}</div></div>
        </div>
      )}
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="grid gap-2">{R.map((x) => <Card key={x.n} {...x} color="red" />)}</div>
        <div className="grid gap-2">{B.map((x) => <Card key={x.n} {...x} color="blue" />)}</div>
      </div>
      {acts.length > 0 && (
        <div className="rounded-2xl border-4 border-warn bg-black p-3">
          <div className="mb-1 text-sm font-black uppercase text-warn">Aksiyonlar</div>
          <ol className="grid gap-2 text-lg font-semibold leading-snug text-white">
            {acts.map((a, i) => (
              <li key={i} className="flex gap-2"><span className="text-warn">{i + 1}.</span><span>{a}</span></li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );

  return (
    <div className="grid gap-3">
      <section className="card grid gap-2">
        {ev ? (
          <>
            <label className="label mb-0">Maç ({ev.code}{mine ? ` · önce #${mine} maçları` : ''})</label>
            <select className="input" value={key} onChange={(e) => setKey(e.target.value)}>
              <option value="">— Elle gir —</option>
              {[...myNext, ...upcoming.filter((x) => !myNext.includes(x)), ...ev.matches.filter((x) => x.played)].map((x) => (
                <option key={x.key} value={x.key}>
                  {x.label}{x.played ? ' (oynandı)' : ''} · K {x.red.teams.join('+')} vs M {x.blue.teams.join('+')}{myNext.includes(x) ? ' ★' : ''}
                </option>
              ))}
            </select>
          </>
        ) : (
          <p className="text-xs text-muted">Program yüklü değil (Strateji → Simülatör → Turnuva Programı). Takımları elle girin:</p>
        )}
        {!m && (
          <div className="grid grid-cols-2 gap-2">
            {[['r1', 'Kırmızı 1'], ['b1', 'Mavi 1'], ['r2', 'Kırmızı 2'], ['b2', 'Mavi 2']].map(([k, l]) => (
              <input
                key={k}
                className={`input border-2 text-center text-lg font-bold ${k[0] === 'r' ? 'border-red-alliance' : 'border-blue-alliance'}`}
                inputMode="numeric"
                placeholder={l}
                value={manual[k]}
                onChange={(e) => setManual({ ...manual, [k]: e.target.value.replace(/\D/g, '').slice(0, 6) })}
              />
            ))}
          </div>
        )}
      </section>
      {(R.length > 0 || B.length > 0) &&
        (full ? <div className="fixed inset-0 z-50 overflow-y-auto bg-black p-4 pt-[max(1rem,env(safe-area-inset-top))]">{body}</div> : <section className="rounded-2xl bg-black p-3">{body}</section>)}
    </div>
  );
}
