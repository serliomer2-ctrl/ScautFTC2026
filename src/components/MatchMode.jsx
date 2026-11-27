import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { cachedEvent } from '../lib/ftcscout.js';
import { QUICK_TAGS } from './MatchExtras.jsx';

/**
 * OfflineScout tarzı SIFIR KAYDIRMA maç ekranı.
 *  - Üst: maç bilgisi + maç saati + faz sekmeleri (Auto / TeleOp / Endgame)
 *  - Orta: o faza ait büyük dokunmatik sayaç kartları (ekrana sığan ızgara)
 *  - Alt: sabit Geri Al + Önceki/İleri/Bitir çubuğu
 * Veriyi mevcut form kaydına (rec) yazar → mevcut taslak, Geri Al, onay ve kaydetme akışı aynen kullanılır.
 * Maç durumu (faz, saat) ayrı anahtarda saklanır; uygulama kapansa bile kaldığı yerden devam edilir.
 */
const MM_KEY = 'bb2.matchmode';
/** Tek elle kullanım: 'right' → ana + butonları ve büyük sayaç sağda; 'left' → solda */
const HandCtx = createContext('right');
// Standart FTC süreleri (sn) – Biobuzz kural kitabı farklıysa buradan güncelleyin
export const MATCH_TIMING = { auto: 30, transition: 8, teleop: 120, endgame: 30 };
const PHASES = [
  { id: 'auto', label: 'Auto' },
  { id: 'teleop', label: 'TeleOp' },
  { id: 'endgame', label: 'Endgame' },
];

export const loadMatchMode = () => {
  try {
    return JSON.parse(localStorage.getItem(MM_KEY)) || null;
  } catch {
    return null;
  }
};
export const saveMatchMode = (s) => {
  try {
    if (s) localStorage.setItem(MM_KEY, JSON.stringify(s));
    else localStorage.removeItem(MM_KEY);
  } catch { /* depolama yok */ }
};

/** Maç saatine göre olması gereken faz ve kalan süre */
function clockState(startedAt) {
  if (!startedAt) return null;
  const T = MATCH_TIMING;
  const t = (Date.now() - startedAt) / 1000;
  const teleStart = T.auto + T.transition;
  const end = teleStart + T.teleop;
  if (t < T.auto) return { phase: 'auto', left: T.auto - t, label: 'AUTO' };
  if (t < teleStart) return { phase: 'teleop', left: teleStart - t, label: 'GEÇİŞ' };
  if (t < end - T.endgame) return { phase: 'teleop', left: end - t, label: 'TELEOP' };
  if (t < end) return { phase: 'endgame', left: end - t, label: 'ENDGAME' };
  return { phase: 'endgame', left: 0, label: 'BİTTİ' };
}
/** Telemetri: maç saati çalışıyorsa olayın saniyesi, değilse null */
const stampOf = (state) => (state.startedAt ? +((Date.now() - state.startedAt) / 1000).toFixed(1) : null);
/** rec.timeline'a olay ekler (saat kapalıysa dokunmaz) */
const withEvent = (r, t, a) => (t == null ? r : { ...r, timeline: [...(r.timeline || []), { t, a }] });
/** Azaltmada o türün son olayını geri alır */
const dropLast = (r, a) => {
  const tl = r.timeline || [];
  const i = tl.map((e) => e.a).lastIndexOf(a);
  return i < 0 ? r : { ...r, timeline: [...tl.slice(0, i), ...tl.slice(i + 1)] };
};

const mmss = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

/* ============================ MAÇ ÖNCESİ ============================ */
export function PreMatch({ rec, update, teamNames, onStart, resume }) {
  const ev = useMemo(() => {
    try {
      const last = JSON.parse(localStorage.getItem('bb2.event.last')) || {};
      return last.code ? cachedEvent(last.season, last.code) : null;
    } catch {
      return null;
    }
  }, []);
  const [num, setNum] = useState(rec.match.matchNumber || '');
  const label = /^\d+$/.test(num) ? `Q${num}` : num.toUpperCase();
  const scheduled = ev?.matches.find((m) => m.label.toUpperCase() === label);

  function pick(team, alliance) {
    update('match', 'teamNumber', team);
    update('match', 'alliance', alliance);
    if (teamNames[team] && !rec.match.teamName) update('match', 'teamName', teamNames[team]);
  }
  const ready = rec.match.teamNumber && label && rec.match.alliance;

  return (
    <div className="grid gap-4">
      {resume}
      <section className="card grid gap-3">
        <h2 className="text-lg font-bold">⚡ Maç Öncesi</h2>
        <label className="grid gap-1">
          <span className="label mb-0">Maç numarası</span>
          <input
            className="input text-center text-3xl font-extrabold"
            inputMode="text"
            placeholder="örn. 14 veya Q14"
            value={num}
            onChange={(e) => {
              const v = e.target.value.toUpperCase().slice(0, 10);
              setNum(v);
              update('match', 'matchNumber', /^\d+$/.test(v) ? `Q${v}` : v);
            }}
          />
        </label>

        {scheduled ? (
          <>
            <p className="text-sm text-muted">{ev.code} programından – izleyeceğiniz robota dokunun:</p>
            {['red', 'blue'].map((c) => (
              <div key={c} className="grid grid-cols-2 gap-2">
                {scheduled[c].teams.map((t, i) => {
                  const on = rec.match.teamNumber === t && rec.match.alliance === c;
                  return (
                    <button
                      key={t}
                      type="button"
                      onClick={() => pick(t, c)}
                      className={`min-h-[72px] rounded-2xl border-4 px-2 text-left transition active:scale-95 ${
                        c === 'red' ? 'border-red-alliance' : 'border-blue-alliance'
                      } ${on ? (c === 'red' ? 'bg-red-alliance text-white' : 'bg-blue-alliance text-white') : 'bg-raised'}`}
                    >
                      <div className="text-xs font-semibold opacity-80">{c === 'red' ? 'Kırmızı' : 'Mavi'} {i + 1}</div>
                      <div className="text-2xl font-extrabold">{t}</div>
                      <div className="truncate text-xs opacity-80">{teamNames[t] || ''}</div>
                    </button>
                  );
                })}
              </div>
            ))}
            <p className="text-[11px] text-muted">FTC eleme maçlarında her ittifakta 2 robot bulunur.</p>
          </>
        ) : (
          <>
            {ev && num && <p className="text-xs text-muted">{ev.code} programında “{label}” bulunamadı – takımı elle girin.</p>}
            {!ev && <p className="text-xs text-muted">İpucu: Strateji → Simülatör'den turnuva programını yüklerseniz takımlar otomatik gelir.</p>}
            <div className="grid grid-cols-[1.2fr_1fr_1fr] gap-2">
              <input
                className="input text-center text-2xl font-bold"
                inputMode="numeric"
                placeholder="Takım"
                value={rec.match.teamNumber}
                onChange={(e) => update('match', 'teamNumber', e.target.value.replace(/\D/g, '').slice(0, 6))}
              />
              {['red', 'blue'].map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => update('match', 'alliance', c)}
                  className={`btn border-4 ${c === 'red' ? 'border-red-alliance' : 'border-blue-alliance'} ${
                    rec.match.alliance === c ? (c === 'red' ? 'bg-red-alliance text-white' : 'bg-blue-alliance text-white') : 'bg-raised'
                  }`}
                >
                  {c === 'red' ? 'Kırmızı' : 'Mavi'}
                </button>
              ))}
            </div>
          </>
        )}

        <button className="btn-primary min-h-[72px] text-2xl" disabled={!ready} onClick={onStart}>
          ▶ Maçı Başlat
        </button>
        {!ready && <p className="text-center text-xs text-muted">Maç no, takım ve ittifak seçilince başlar.</p>}
      </section>
    </div>
  );
}

/* ============================ MAÇ EKRANI ============================ */
export default function MatchScreen({ rec, update, patch, undo, histLen, state, setState, onFinish, onExit, hand = 'right', keepAwake = true }) {
  const [, tick] = useState(0);
  const awake = useWakeLock(keepAwake);
  const fouls = rec.fouls || { minor: 0, major: 0 };
  const addFoul = (kind) =>
    patch((r) => withEvent({ ...r, fouls: { minor: 0, major: 0, ...r.fouls, [kind]: ((r.fouls || {})[kind] || 0) + 1 } }, stampOf(state), `foul_${kind}`));
  const autoSwitched = useRef(state.phase);
  const clock = clockState(state.startedAt);

  // Saat çalışırken her yarım saniyede yenile ve faz sınırında otomatik geç
  useEffect(() => {
    if (!state.startedAt) return undefined;
    const id = setInterval(() => tick((x) => x + 1), 500);
    return () => clearInterval(id);
  }, [state.startedAt]);
  useEffect(() => {
    if (clock && clock.phase !== autoSwitched.current && PHASES.findIndex((p) => p.id === clock.phase) > PHASES.findIndex((p) => p.id === state.phase)) {
      autoSwitched.current = clock.phase;
      setPhase(clock.phase);
    }
  });

  function setPhase(phase) {
    const next = { ...state, phase };
    // TeleOp'a geçerken döngü ölçümü başlar
    if (phase === 'teleop' && !state.lastScoreAt) next.lastScoreAt = Date.now();
    setState(next);
  }

  const idx = PHASES.findIndex((p) => p.id === state.phase);
  const allianceBorder = rec.match.alliance === 'blue' ? 'border-blue-alliance' : 'border-red-alliance';
  const allianceBg = rec.match.alliance === 'blue' ? 'bg-blue-alliance' : 'bg-red-alliance';

  return (
    <HandCtx.Provider value={hand}>
    <div className="fixed inset-0 z-40 flex h-[100dvh] flex-col bg-bg">
      {/* ÜST: maç bilgisi + saat + fazlar */}
      <div className={`shrink-0 border-b-4 ${allianceBorder} bg-surface px-3 pb-2 pt-[max(0.5rem,env(safe-area-inset-top))]`}>
        <div className="flex items-center gap-2">
          {/* İttifak rengi: takım numarası + alt çizgi (ceza butonlarına yer açmak için rozet yok) */}
          <span className={`h-10 w-1.5 shrink-0 rounded-full ${allianceBg}`} aria-label={rec.match.alliance === 'blue' ? 'Mavi ittifak' : 'Kırmızı ittifak'} />
          <div className="min-w-0 flex-1 leading-tight">
            <div className={`truncate text-xl font-extrabold ${rec.match.alliance === 'blue' ? 'text-blue-alliance' : 'text-red-alliance'}`}>{rec.match.teamNumber}</div>
            <div className="truncate text-xs text-muted">{rec.match.matchNumber}{rec.match.teamName ? ` · ${rec.match.teamName}` : ''}</div>
          </div>
          <HoldButton label="Minor" count={fouls.minor} tone="warn" onHold={() => addFoul('minor')} />
          <HoldButton label="Major" count={fouls.major} tone="bad" onHold={() => addFoul('major')} />
          <button
            type="button"
            className="rounded-xl bg-raised px-3 py-1 text-center"
            onClick={() => setState({ ...state, startedAt: state.startedAt ? null : Date.now() })}
            title="Maç saatini başlat / sıfırla"
          >
            <div className={`text-2xl font-extrabold tabular-nums ${clock?.label === 'ENDGAME' ? 'text-warn' : ''}`}>{clock ? mmss(clock.left) : '⏱'}</div>
            <div className="text-[10px] font-bold text-muted">{clock ? clock.label : 'SAAT'}{awake ? ' 🔆' : ''}</div>
          </button>
          <button type="button" className="h-11 w-11 rounded-xl bg-raised text-lg" onClick={onExit} aria-label="Maç ekranından çık (veri korunur)">✕</button>
        </div>
        <div className="mt-2 grid grid-cols-3 gap-1 rounded-xl bg-raised p-1">
          {PHASES.map((p, i) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setPhase(p.id)}
              className={`min-h-[40px] rounded-lg text-sm font-extrabold ${
                state.phase === p.id ? 'bg-accent text-accent-fg' : clock?.phase === p.id ? 'text-warn' : i < idx ? 'text-muted' : ''
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* ORTA: faz kartları */}
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {state.phase === 'auto' && <AutoPhase rec={rec} update={update} patch={patch} stamp={() => stampOf(state)} />}
        {state.phase === 'teleop' && <TeleopPhase rec={rec} patch={patch} update={update} state={state} setState={setState} />}
        {state.phase === 'endgame' && <EndgamePhase rec={rec} update={update} patch={patch} stamp={() => stampOf(state)} />}
      </div>

      {/* ALT: Geri Al + gezinme */}
      {/* Ana eylem (İleri/Bitir) başparmağın tarafında */}
      <div
        className={`grid shrink-0 gap-2 border-t border-line bg-surface px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 ${hand === 'left' ? 'grid-cols-[1.6fr_1fr_1fr]' : 'grid-cols-[1fr_1fr_1.6fr]'}`}
      >
        <button type="button" className={`btn-ghost min-h-[60px] px-1 ${hand === 'left' ? 'order-3' : ''}`} disabled={!histLen} onClick={undo}>↶ Geri Al</button>
        <button type="button" className="btn-ghost order-2 min-h-[60px] px-1" disabled={idx === 0} onClick={() => setPhase(PHASES[idx - 1].id)}>◀ Önceki</button>
        {idx < PHASES.length - 1 ? (
          <button type="button" className={`btn-primary min-h-[60px] text-lg ${hand === 'left' ? 'order-1' : 'order-3'}`} onClick={() => setPhase(PHASES[idx + 1].id)}>İleri ▶</button>
        ) : (
          <button type="button" className={`btn min-h-[60px] bg-warn text-lg text-black ${hand === 'left' ? 'order-1' : 'order-3'}`} onClick={onFinish}>✅ Bitir</button>
        )}
      </div>
    </div>
    </HandCtx.Provider>
  );
}

/* ------------------------- ekran uyanık tutma (Wake Lock) ------------------------- */
function useWakeLock(enabled) {
  const [active, setActive] = useState(false);
  useEffect(() => {
    if (!enabled || !('wakeLock' in navigator)) return undefined; // desteklenmiyorsa sessizce geç
    let lock = null;
    let dead = false;
    const acquire = async () => {
      try {
        if (document.visibilityState !== 'visible') return;
        lock = await navigator.wakeLock.request('screen');
        if (dead) return lock.release();
        setActive(true);
        lock.addEventListener('release', () => setActive(false));
      } catch {
        setActive(false); // düşük pil modu vb. – sorun değil
      }
    };
    // Sekme arka plana gidince kilit tarayıcı tarafından bırakılır; geri gelince yeniden al
    const onVisible = () => document.visibilityState === 'visible' && acquire();
    acquire();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      dead = true;
      document.removeEventListener('visibilitychange', onVisible);
      lock?.release().catch(() => {});
    };
  }, [enabled]);
  return active;
}

/* ------------------- yanlışlıkla basılmayan ceza butonu (basılı tut) ------------------- */
const HOLD_MS = 600;
function HoldButton({ label, count, tone, onHold }) {
  const [p, setP] = useState(0); // 0..1 dolum
  const [hint, setHint] = useState(false);
  const t0 = useRef(0);
  const raf = useRef(0);
  const done = useRef(false);
  const prog = useRef(0);
  const stop = () => {
    cancelAnimationFrame(raf.current);
    // Erken bırakıldıysa (kısa dokunuş) sayılmaz, ipucu gösterilir
    if (!done.current && prog.current > 0) {
      setHint(true);
      setTimeout(() => setHint(false), 1200);
    }
    prog.current = 0;
    setP(0);
  };
  const step = () => {
    const v = Math.min(1, (performance.now() - t0.current) / HOLD_MS);
    prog.current = v;
    setP(v);
    if (v >= 1) {
      done.current = true;
      if (navigator.vibrate) navigator.vibrate([60, 40, 60]);
      onHold();
      prog.current = 0;
      setP(0);
      return;
    }
    raf.current = requestAnimationFrame(step);
  };
  const color = tone === 'bad' ? 'bg-bad' : 'bg-warn';
  return (
    <button
      type="button"
      className={`relative h-11 w-12 shrink-0 select-none overflow-hidden rounded-xl border-2 ${tone === 'bad' ? 'border-bad' : 'border-warn'} bg-raised text-center touch-none`}
      onPointerDown={(e) => {
        e.preventDefault();
        done.current = false;
        prog.current = 0.001;
        t0.current = performance.now();
        raf.current = requestAnimationFrame(step);
      }}
      onPointerUp={stop}
      onPointerLeave={stop}
      onPointerCancel={stop}
      onContextMenu={(e) => e.preventDefault()}
      aria-label={`${label} ceza – eklemek için basılı tutun`}
    >
      <span className={`absolute inset-y-0 left-0 ${color} opacity-60`} style={{ width: `${p * 100}%` }} />
      <span className="relative block text-lg font-extrabold leading-none">{count}</span>
      <span className="relative block text-[9px] font-bold leading-none">{hint ? 'BASILI TUT' : label.toUpperCase()}</span>
    </button>
  );
}

/* ----------------------------- kart bileşenleri ----------------------------- */
function Stepper({ label, value, onChange, step = 1, max = 99, big = false, suffix = '', hint }) {
  const hand = useContext(HandCtx);
  const left = hand === 'left';
  return (
    <div className={`flex flex-col rounded-2xl border border-line bg-surface p-1.5 [@media(min-height:720px)]:p-2 ${big ? `row-span-2 row-start-1 ${left ? 'col-start-1' : 'col-start-2'}` : ''}`}>
      <div className="flex items-baseline justify-between px-1">
        <span className="text-sm font-bold text-muted">{label}</span>
        {hint && <span className="text-[11px] text-muted">{hint}</span>}
      </div>
      <div className={`grid flex-1 grid-cols-[1fr_auto_1fr] items-stretch gap-2 ${big ? 'min-h-[118px] [@media(min-height:720px)]:min-h-[150px]' : 'min-h-[56px] [@media(min-height:720px)]:min-h-[64px]'}`}>
        <button type="button" className={`rounded-xl bg-raised text-4xl font-bold active:scale-95 disabled:opacity-30 ${left ? 'order-3' : ''}`} disabled={value <= 0} onClick={() => onChange(Math.max(0, value - step))} aria-label={`${label} azalt`}>−</button>
        <div className={`order-2 flex items-center justify-center font-extrabold tabular-nums ${big ? 'min-w-[72px] text-6xl' : 'min-w-[56px] text-3xl'}`}>
          {value}
          {suffix}
        </div>
        <button type="button" className={`rounded-xl bg-accent text-4xl font-bold text-accent-fg active:scale-95 disabled:opacity-30 ${left ? 'order-1' : 'order-3'}`} disabled={value >= max} onClick={() => onChange(Math.min(max, value + step))} aria-label={`${label} artır`}>+</button>
      </div>
    </div>
  );
}

function Choice({ label, options, value, onChange, cols }) {
  return (
    <div className="rounded-2xl border border-line bg-surface p-1.5 [@media(min-height:720px)]:p-2">
      <div className="px-1 pb-1 text-sm font-bold text-muted">{label}</div>
      <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${cols || options.length}, minmax(0,1fr))` }}>
        {options.map((o) => {
          const on = value === o.value;
          return (
            <button
              key={String(o.value)}
              type="button"
              onClick={() => onChange(on ? null : o.value)}
              className={`min-h-[44px] rounded-xl px-1 text-sm font-bold active:scale-95 [@media(min-height:720px)]:min-h-[48px] ${on ? o.tone || 'bg-accent text-accent-fg' : 'bg-raised'}`}
            >
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
const YN = [
  { value: true, label: 'Evet', tone: 'bg-ok text-black' },
  { value: false, label: 'Hayır', tone: 'bg-bad text-white' },
];

function AutoPhase({ rec, update, patch, stamp }) {
  const a = rec.auto;
  return (
    <div className="grid grid-flow-row-dense grid-cols-2 gap-1.5 [@media(min-height:720px)]:gap-2">
      <Stepper
        big
        label="Otonom Tip"
        value={a.tipCount}
        onChange={(v) =>
          patch((r) => {
            const next = { ...r, auto: { ...r.auto, tipCount: v, hasAuto: v > 0 ? true : r.auto.hasAuto } };
            return v > r.auto.tipCount ? withEvent(next, stamp(), 'auto_score') : dropLast(next, 'auto_score');
          })
        }
      />
      <Choice label="Otonom var mı?" options={YN} value={a.hasAuto} onChange={(v) => update('auto', 'hasAuto', v)} />
      <Choice label="Yardımsız Tip" options={YN} value={a.soloTip} onChange={(v) => update('auto', 'soloTip', v)} />
      <div className="col-span-2">
        <Choice
          label="Sonuç"
          options={[
            { value: 'success', label: 'Başarılı', tone: 'bg-ok text-black' },
            { value: 'partial', label: 'Kısmen', tone: 'bg-warn text-black' },
            { value: 'fail', label: 'Başarısız', tone: 'bg-bad text-white' },
          ]}
          value={a.success}
          onChange={(v) => update('auto', 'success', v)}
        />
      </div>
      <div className="col-span-2">
        <Choice
          label="Başlangıç"
          options={[
            { value: 'hive', label: 'Hive' },
            { value: 'flower', label: 'Flower' },
            { value: 'middle', label: 'Orta' },
          ]}
          value={a.startPosition}
          onChange={(v) => update('auto', 'startPosition', v)}
        />
      </div>
      <div className="col-span-2">
        <Choice
          label="Topu nereden alıyor?"
          options={[
            { value: 'garden', label: 'Garden' },
            { value: 'flower', label: 'Flower' },
            { value: 'both', label: 'İkisi' },
            { value: 'none', label: 'Almıyor' },
          ]}
          value={a.pickupSource}
          onChange={(v) => update('auto', 'pickupSource', v)}
        />
      </div>
    </div>
  );
}

function TeleopPhase({ rec, patch, update, state, setState }) {
  const t = rec.teleop;
  const cycles = rec.cycles || [];
  const avg = cycles.length ? cycles.reduce((s, x) => s + x, 0) / cycles.length : null;

  // "+" = skor: Tip artar VE son skordan bu yana geçen süre döngü olarak kaydedilir (tek Geri Al adımı)
  function score(v) {
    const now = Date.now();
    if (v > t.tipCount) {
      const sec = state.lastScoreAt ? +((now - state.lastScoreAt) / 1000).toFixed(1) : null;
      const t = stampOf(state);
      patch((r) =>
        withEvent({ ...r, teleop: { ...r.teleop, tipCount: v }, cycles: sec && sec < 90 ? [...(r.cycles || []), sec] : r.cycles || [] }, t, 'teleop_score'),
      );
      setState({ ...state, lastScoreAt: now });
    } else {
      patch((r) => dropLast({ ...r, teleop: { ...r.teleop, tipCount: v } }, 'teleop_score'));
    }
  }

  return (
    <div className="grid grid-flow-row-dense grid-cols-2 gap-1.5 [@media(min-height:720px)]:gap-2">
      <Stepper big label="TeleOp Tip" hint="+ = skor (döngü otomatik)" value={t.tipCount} onChange={score} />
      <Stepper label="Tek seferde taşıma" value={t.carryCapacity} onChange={(v) => update('teleop', 'carryCapacity', v)} max={20} />
      <Stepper label="İsabet" value={t.accuracy} step={10} max={100} suffix="%" onChange={(v) => update('teleop', 'accuracy', v)} />
      <div className="col-span-2 grid grid-cols-[1fr_auto] items-center gap-2 rounded-2xl border border-line bg-surface p-3">
        <div>
          <div className="text-sm font-bold text-muted">Döngü</div>
          <div className="text-lg font-extrabold tabular-nums">
            {cycles.length} döngü · ort. {avg ? `${avg.toFixed(1)} sn` : '—'}
            {cycles.length > 0 && <span className="ml-2 text-sm font-normal text-muted">son {cycles[cycles.length - 1].toFixed(1)} sn</span>}
          </div>
        </div>
        <button type="button" className="btn-ghost min-h-[48px] px-3 text-sm" onClick={() => setState({ ...state, lastScoreAt: Date.now() })} title="Robot parçayı almaya şimdi başladı">
          ⟲ Sıfırla
        </button>
      </div>
      <Choice label="Oto hizalama" options={YN} value={t.autoAim} onChange={(v) => update('teleop', 'autoAim', v)} />
      <Choice label="Sürücü asistanı" options={YN} value={t.driverAssist} onChange={(v) => update('teleop', 'driverAssist', v)} />
    </div>
  );
}

function EndgamePhase({ rec, update, patch, stamp }) {
  const e = rec.endgame;
  const tags = rec.tags || [];
  return (
    <div className="grid grid-flow-row-dense grid-cols-2 gap-1.5 [@media(min-height:720px)]:gap-2">
      <Choice label="Flower planı" options={YN} value={e.flowerPlanned} onChange={(v) => update('endgame', 'flowerPlanned', v)} />
      <div className="rounded-2xl border border-line bg-surface p-1.5 [@media(min-height:720px)]:p-2">
        <div className="px-1 pb-1 text-sm font-bold text-muted">Sürücü</div>
        <div className="grid grid-cols-5">
          {[1, 2, 3, 4, 5].map((n) => (
            <button key={n} type="button" aria-label={`${n} yıldız`} onClick={() => update('teleop', 'driverRating', rec.teleop.driverRating === n ? 0 : n)} className={`min-h-[48px] text-3xl ${n <= rec.teleop.driverRating ? 'text-warn' : 'text-line'}`}>
              ★
            </button>
          ))}
        </div>
      </div>
      <div className="col-span-2">
        <Choice
          label="End Game Flower sonucu"
          options={[
            { value: 'done', label: 'Yaptı', tone: 'bg-ok text-black' },
            { value: 'failed', label: 'Yapamadı', tone: 'bg-bad text-white' },
            { value: 'not_attempted', label: 'Denemedi', tone: 'bg-muted text-bg' },
          ]}
          value={e.flowerResult}
          onChange={(v) =>
            patch((r) => {
              const next = { ...r, endgame: { ...r.endgame, flowerResult: v } };
              return v === 'done' ? withEvent(next, stamp(), 'flower_done') : v === 'failed' ? withEvent(next, stamp(), 'flower_fail') : next;
            })
          }
        />
      </div>
      <div className="col-span-2 grid grid-cols-2 gap-1 rounded-2xl border border-line bg-surface p-1.5 [@media(min-height:720px)]:p-2">
        <div className="col-span-2 px-1 text-sm font-bold text-muted">Hızlı etiketler</div>
        {QUICK_TAGS.map((t) => {
          const on = tags.includes(t.id);
          return (
            <button
              key={t.id}
              type="button"
              aria-pressed={on}
              onClick={() =>
                patch((r) => {
                  const cur = r.tags || [];
                  return on ? { ...r, tags: cur.filter((x) => x !== t.id) } : withEvent({ ...r, tags: [...cur, t.id] }, stamp(), `tag:${t.id}`);
                })
              }
              className={`min-h-[44px] rounded-xl px-1 text-xs font-bold active:scale-95 ${on ? (t.tone === 'ok' ? 'bg-ok text-black' : 'bg-bad text-white') : 'bg-raised'}`}
            >
              {t.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
