import React, { useEffect, useMemo, useRef, useState } from 'react';
import { f1 } from './TeamsView.jsx';

/**
 * İnteraktif ittifak seçim listesi (Picklist)
 *  - Ağırlıklı skor: %Otonom + %TeleOp + %Endgame (her dönem alandaki en iyiye göre 0–100 normalize)
 *  - "Otomatik sırala" ağırlıklı skora ya da ortalama puana göre dizer
 *  - Sürükle-bırak (tutamaçtan) veya ▲▼ ile elle sıralama
 *  - Satıra dokun: boş → Seçildi (yeşil) → Elendi (kırmızı, üstü çizili) → boş
 * Liste cihaza ve odaya özeldir (strateji masası), buluta gönderilmez.
 */
const key = (roomId) => `bb2.picklist.${roomId}`;
const DEFAULT = { order: [], status: {}, weights: { auto: 40, tele: 40, end: 20 }, hide: false };

function load(roomId) {
  try {
    return { ...DEFAULT, ...JSON.parse(localStorage.getItem(key(roomId))) };
  } catch {
    return { ...DEFAULT };
  }
}

export default function Picklist({ stats, roomId, myTeam, pitByTeam }) {
  const [st, setSt] = useState(() => load(roomId));
  const [drag, setDrag] = useState(null); // { from, over }
  const listRef = useRef(null);
  useEffect(() => {
    try {
      localStorage.setItem(key(roomId), JSON.stringify(st));
    } catch { /* dolu */ }
  }, [st, roomId]);

  const byNum = useMemo(() => Object.fromEntries(stats.map((t) => [t.num, t])), [stats]);
  const max = useMemo(
    () => ({
      auto: Math.max(1e-9, ...stats.map((t) => t.autoPts)),
      tele: Math.max(1e-9, ...stats.map((t) => t.telePts)),
      end: Math.max(1e-9, ...stats.map((t) => t.endPts)),
    }),
    [stats],
  );
  const w = st.weights;
  const wSum = w.auto + w.tele + w.end || 1;
  const score = (t) => (100 * (w.auto * (t.autoPts / max.auto) + w.tele * (t.telePts / max.tele) + w.end * (t.endPts / max.end))) / wSum;

  // Sırada olmayan yeni takımlar sona (skora göre) eklenir; verisi silinen takımlar düşer
  const order = useMemo(() => {
    const known = st.order.filter((n) => byNum[n]);
    const fresh = stats.filter((t) => !known.includes(t.num)).sort((a, b) => score(b) - score(a)).map((t) => t.num);
    return [...known, ...fresh];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [st.order, stats, byNum, w.auto, w.tele, w.end]);

  const set = (patch) => setSt((s) => ({ ...s, ...patch }));
  const autoSort = (by) => set({ order: [...stats].sort((a, b) => (by === 'avg' ? b.points - a.points : score(b) - score(a))).map((t) => t.num) });
  const move = (from, to) => {
    if (to < 0 || to >= order.length || from === to) return;
    const o = [...order];
    const [x] = o.splice(from, 1);
    o.splice(to, 0, x);
    set({ order: o });
  };
  const cycle = (n) => {
    const cur = st.status[n];
    const next = !cur ? 'picked' : cur === 'picked' ? 'crossed' : undefined;
    const status = { ...st.status };
    if (next) status[n] = next;
    else delete status[n];
    set({ status });
  };

  // Sürükle-bırak: dokunmatikte de çalışsın diye pointer olaylarıyla
  function onHandleDown(e, i) {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    setDrag({ from: i, over: i });
  }
  function onHandleMove(e) {
    if (!drag) return;
    const el = document.elementFromPoint(e.clientX, e.clientY)?.closest('[data-row]');
    if (el) setDrag((d) => ({ ...d, over: +el.dataset.row }));
  }
  function onHandleUp() {
    if (drag) move(drag.from, drag.over);
    setDrag(null);
  }

  if (!stats.length) return <div className="card text-center text-muted">Picklist için önce maç verisi gerekli.</div>;
  const picked = order.filter((n) => st.status[n] === 'picked').length;
  const crossed = order.filter((n) => st.status[n] === 'crossed').length;

  return (
    <div className="grid gap-3">
      <section className="card grid gap-3">
        <h2 className="text-lg font-bold">⚖️ Ağırlıklar</h2>
        {[
          ['auto', 'Otonom', 'rgb(var(--alliance-blue))'],
          ['tele', 'TeleOp', 'rgb(var(--accent))'],
          ['end', 'Endgame', 'rgb(var(--warn))'],
        ].map(([k, l, c]) => (
          <label key={k} className="grid grid-cols-[72px_1fr_48px] items-center gap-2 text-sm">
            <span className="font-semibold" style={{ color: c }}>{l}</span>
            <input type="range" min="0" max="100" step="5" value={w[k]} onChange={(e) => set({ weights: { ...w, [k]: +e.target.value } })} />
            <span className="text-right font-bold tabular-nums">%{Math.round((w[k] / wSum) * 100)}</span>
          </label>
        ))}
        <div className="grid grid-cols-2 gap-2">
          <button className="btn-primary" onClick={() => autoSort('weighted')}>⇅ Ağırlığa göre sırala</button>
          <button className="btn-ghost" onClick={() => autoSort('avg')}>⇅ Ort. puana göre</button>
        </div>
      </section>

      <div className="flex items-center gap-2 text-sm">
        <span className="rounded-full bg-ok/20 px-2 py-1 text-ok">✓ {picked} seçildi</span>
        <span className="rounded-full bg-bad/20 px-2 py-1 text-bad">✕ {crossed} elendi</span>
        <label className="ml-auto flex items-center gap-2">
          <input type="checkbox" className="h-5 w-5" checked={st.hide} onChange={(e) => set({ hide: e.target.checked })} /> Gizle
        </label>
        {(picked || crossed) > 0 && (
          <button className="text-muted underline" onClick={() => confirm('Tüm seçildi/elendi işaretleri kaldırılsın mı?') && set({ status: {} })}>Sıfırla</button>
        )}
      </div>

      <ol ref={listRef} className="grid select-none gap-1" onPointerMove={onHandleMove} onPointerUp={onHandleUp} onPointerCancel={() => setDrag(null)}>
        {order.map((n, i) => {
          const t = byNum[n];
          const s = st.status[n];
          if (st.hide && s) return null;
          const isOver = drag && drag.over === i && drag.from !== i;
          return (
            <li
              key={n}
              data-row={i}
              className={`grid grid-cols-[40px_32px_1fr_auto_auto] items-center gap-2 rounded-xl border-2 p-2 transition ${
                drag?.from === i ? 'opacity-50' : ''
              } ${isOver ? 'border-accent' : s === 'picked' ? 'border-ok bg-ok/10' : s === 'crossed' ? 'border-bad/50 bg-bad/5' : 'border-line bg-surface'} ${
                String(myTeam) === n ? 'ring-2 ring-warn' : ''
              }`}
            >
              <button
                type="button"
                className="flex h-12 cursor-grab touch-none items-center justify-center rounded-lg bg-raised text-xl text-muted"
                onPointerDown={(e) => onHandleDown(e, i)}
                aria-label={`#${n} sürükle`}
              >
                ⠿
              </button>
              <span className="text-center text-lg font-extrabold text-muted tabular-nums">{i + 1}</span>
              <button type="button" className="flex min-w-0 items-center gap-2 text-left" onClick={() => cycle(n)}>
                {pitByTeam[n]?.pit?.photo && <img src={pitByTeam[n].pit.photo} alt="" className="h-10 w-10 shrink-0 rounded-lg object-cover" />}
                <span className={`min-w-0 ${s === 'crossed' ? 'text-muted line-through decoration-bad decoration-2' : ''}`}>
                  <span className="block truncate font-extrabold">#{n} {s === 'picked' && <span className="text-ok">✓ Seçildi</span>}{s === 'crossed' && <span className="text-bad"> Elendi</span>}</span>
                  <span className="block truncate text-xs text-muted">{t.name || '—'} · {t.n} maç · ort {f1(t.points)}</span>
                </span>
              </button>
              <span className="w-12 text-right text-xl font-extrabold tabular-nums text-accent">{Math.round(score(t))}</span>
              <span className="grid">
                <button type="button" className="h-6 w-8 rounded bg-raised text-xs disabled:opacity-30" disabled={i === 0} onClick={() => move(i, i - 1)} aria-label="Yukarı">▲</button>
                <button type="button" className="mt-0.5 h-6 w-8 rounded bg-raised text-xs disabled:opacity-30" disabled={i === order.length - 1} onClick={() => move(i, i + 1)} aria-label="Aşağı">▼</button>
              </span>
            </li>
          );
        })}
      </ol>
      <p className="text-xs text-muted">Satıra dokunun: Seçildi → Elendi → temizle. ⠿ tutamacından sürükleyin. Sağdaki sayı ağırlıklı skordur (0–100).</p>
    </div>
  );
}
