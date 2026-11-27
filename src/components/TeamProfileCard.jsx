import React from 'react';
import { labelOf } from '../schema.js';
import { avgCycle } from './MatchExtras.jsx';
import { f1 } from './TeamsView.jsx';
import { PIT_ALERTS } from './PitScouting.jsx';
import { DEAD_GAP, MATCH_END, TELE_START, teamActivity } from '../lib/telemetry.js';
import { MATCH_TIMING } from './MatchMode.jsx';
import { teamPenalty } from '../lib/penalties.js';

const ago = (iso) => {
  const m = Math.round((Date.now() - new Date(iso)) / 60000);
  return m < 1 ? 'şimdi' : m < 60 ? `${m} dk önce` : m < 1440 ? `${Math.round(m / 60)} sa önce` : `${Math.round(m / 1440)} gün önce`;
};

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

export default function TeamProfileCard({ t, pit, onToggleAlert, scoring }) {
  const pen = scoring ? teamPenalty(t, scoring) : null;
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
          {pen && (
            <div className="mt-1" title={`Brüt ${f1(t.points)} − rakibe kazandırılan ceza ${f1(pen.given)}`}>
              <div className={`text-xl font-extrabold tabular-nums ${pen.net < t.points ? 'text-warn' : 'text-fg'}`}>{f1(pen.net)}</div>
              <div className="text-[10px] text-muted">net katkı</div>
            </div>
          )}
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
        {pen && (pen.minor > 0 || pen.major > 0) && (
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
            {pen.risk && <span className="rounded-full bg-bad px-3 py-1 font-extrabold text-white">⚠ Yüksek Ceza Riski</span>}
            <span className="text-muted">Maç başı {f1(pen.minor)} minor · {f1(pen.major)} major → rakibe ≈ {f1(pen.given)} p</span>
          </div>
        )}
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
      {/* Canlı garaj durumu – tek dokunuşla aç/kapa (pit kaydına yazılır, senkronize olur) */}
      <div className="grid gap-2 border-t border-line px-4 py-3">
        <div className="text-sm font-bold text-muted">🛠 Canlı garaj durumu</div>
        <div className="grid grid-cols-2 gap-2">
          {PIT_ALERTS.map((a) => {
            const cur = (p?.alerts || []).find((x) => x.id === a.id);
            return (
              <button
                key={a.id}
                type="button"
                aria-pressed={!!cur}
                disabled={!onToggleAlert}
                onClick={() => onToggleAlert?.(t.num, a.id)}
                className={`min-h-[52px] rounded-xl border-2 px-2 text-left text-sm font-bold active:scale-95 ${
                  cur ? (a.tone === 'ok' ? 'border-ok bg-ok/15 text-ok' : a.tone === 'warn' ? 'border-warn bg-warn/15 text-warn' : 'border-bad bg-bad/15 text-bad') : 'border-line bg-raised text-muted'
                }`}
              >
                {a.label}
                {cur && <span className="block text-[10px] font-normal opacity-80">{ago(cur.at)}{cur.by ? ` · ${cur.by}` : ''}</span>}
              </button>
            );
          })}
        </div>
      </div>

      <Telemetry records={t.records} />
    </section>
  );
}

/* ============================ TELEMETRİ ============================ */
const T = MATCH_END; // maç toplam süresi (sn)
const pctX = (sec) => `${Math.max(0, Math.min(100, (sec / T) * 100))}%`;
const EV_COLOR = { auto_score: 'rgb(var(--alliance-blue))', teleop_score: 'rgb(var(--ok))', flower_done: 'rgb(var(--warn))', flower_fail: 'rgb(var(--bad))' };

function Telemetry({ records }) {
  const act = teamActivity(records);
  return (
    <div className="grid gap-2 border-t border-line px-4 py-3">
      <div className="flex items-baseline justify-between">
        <span className="text-sm font-bold text-muted">⏱ Maç telemetrisi</span>
        {act && (
          <span className="text-sm">
            Aktiflik <b className={act.avg >= 0.75 ? 'text-ok' : act.avg >= 0.5 ? 'text-warn' : 'text-bad'}>%{Math.round(act.avg * 100)}</b>
          </span>
        )}
      </div>
      {!act && <p className="text-xs text-muted">Zaman damgalı veri yok. Maç ekranında saat (⏱) çalışırken girilen skorlar burada zaman çizelgesi olarak görünür.</p>}
      {act?.rows.map((r) => (
        <div key={r.match} className="grid grid-cols-[44px_1fr_40px] items-center gap-2">
          <span className="text-xs font-bold">{r.match}</span>
          <div className="relative h-6 overflow-hidden rounded-md bg-raised" title={`${r.scores} TeleOp skoru · ölü süre ${Math.round(r.deadSec)} sn`}>
            <div className="absolute inset-y-0 left-0 bg-blue-alliance/15" style={{ width: pctX(MATCH_TIMING.auto) }} />
            <div className="absolute inset-y-0 bg-line/40" style={{ left: pctX(MATCH_TIMING.auto), width: pctX(TELE_START - MATCH_TIMING.auto) }} />
            {r.dead.map(([a, b], i) => (
              <div
                key={i}
                className="absolute inset-y-0"
                style={{ left: pctX(a), width: pctX(b - a), background: 'repeating-linear-gradient(135deg, rgb(var(--bad) / .35) 0 4px, transparent 4px 8px)' }}
              />
            ))}
            {r.events.map((e, i) => (
              <div
                key={i}
                className="absolute inset-y-1 w-[3px] rounded-full"
                style={{ left: pctX(e.t), background: EV_COLOR[e.a] || 'rgb(var(--bad))' }}
                title={`${e.t} sn · ${e.a}`}
              />
            ))}
          </div>
          <span className={`text-right text-xs font-bold ${r.active >= 0.75 ? 'text-ok' : r.active >= 0.5 ? 'text-warn' : 'text-bad'}`}>%{Math.round(r.active * 100)}</span>
        </div>
      ))}
      {act && (
        <div className="flex flex-wrap gap-3 text-[11px] text-muted">
          <span><span style={{ color: EV_COLOR.auto_score }}>▮</span> Oto skor</span>
          <span><span style={{ color: EV_COLOR.teleop_score }}>▮</span> TeleOp skor</span>
          <span><span style={{ color: EV_COLOR.flower_done }}>▮</span> Flower</span>
          <span><span className="text-bad">▨</span> Ölü süre (&gt;{DEAD_GAP} sn skorsuz)</span>
        </div>
      )}
    </div>
  );
}
