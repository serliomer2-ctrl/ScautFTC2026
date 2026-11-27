import React, { useEffect, useRef, useState } from 'react';
import { FIELD_IMAGE, FIELD_ZONES, ZONE_LABEL, zoneAt } from '../lib/field.js';
import { Section, Segmented } from './ui.jsx';

/**
 * Maç formuna eklenen yeni alanlar (mevcut ScoutForm'a dokunmadan, altına eklenir):
 *   rec.fieldMap = { start: {x,y,z}|null, shots: [{x,y,z,p:'a'|'t'}] }   (0–1 normalize koordinat)
 *   rec.cycles   = [saniye, ...]                                          (döngü süreleri)
 *   rec.tags     = ['brownout', 'defense', ...]                            (hızlı durum etiketleri)
 * Eski kayıtlarda bu alanlar yoktur; her yerde `|| varsayılan` ile okunur.
 */
export const QUICK_TAGS = [
  { id: 'brownout', label: '⚡ Bağlantı Koptu / Brownout', tone: 'bad' },
  { id: 'defense', label: '🛡️ İyi Savunma', tone: 'ok' },
  { id: 'climbFail', label: '🧗 Tırmanma Başarısız', tone: 'bad' },
  { id: 'penalty', label: '🟨 Ceza Aldı', tone: 'bad' },
  { id: 'tipped', label: '🙃 Devrildi', tone: 'bad' },
  { id: 'noShow', label: '🚫 Maça Çıkmadı', tone: 'bad' },
  { id: 'carried', label: '💪 İttifakı Taşıdı', tone: 'ok' },
  { id: 'fast', label: '🏎️ Çok Hızlı Döngü', tone: 'ok' },
];
export const TAG_LABEL = Object.fromEntries(QUICK_TAGS.map((t) => [t.id, t.label]));

export const avgCycle = (cycles) => (cycles?.length ? cycles.reduce((s, x) => s + x, 0) / cycles.length : null);

export default function MatchExtras({ rec, update }) {
  return (
    <div className="mt-4 grid gap-4">
      <Section title="Saha Haritası" icon="🗺️">
        <FieldMap value={rec.fieldMap} alliance={rec.match.alliance} onChange={(v) => update(null, 'fieldMap', v)} />
      </Section>
      <Section title="Döngü Süresi Ölçer" icon="⏱️">
        <CycleTimer cycles={rec.cycles || []} onChange={(v) => update(null, 'cycles', v)} />
      </Section>
      <Section title="Hızlı Durum Etiketleri" icon="🏷️">
        <QuickTags value={rec.tags || []} onChange={(v) => update(null, 'tags', v)} />
      </Section>
    </div>
  );
}

/* ============================ SAHA HARİTASI ============================ */
const ZONE_FILL = { red: 'rgb(var(--alliance-red) / 0.25)', blue: 'rgb(var(--alliance-blue) / 0.25)', neutral: 'rgb(var(--accent) / 0.18)' };

export function FieldMap({ value, alliance, onChange, readOnly = false, size = 'full' }) {
  const fm = value || { start: null, shots: [] };
  const [mode, setMode] = useState('start');
  const svgRef = useRef(null);

  function tap(e) {
    if (readOnly) return;
    const r = svgRef.current.getBoundingClientRect();
    const x = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
    const y = Math.min(1, Math.max(0, (e.clientY - r.top) / r.height));
    const pt = { x: +x.toFixed(3), y: +y.toFixed(3), z: zoneAt(x, y) };
    if (mode === 'start') onChange({ ...fm, start: pt });
    else onChange({ ...fm, shots: [...(fm.shots || []), { ...pt, p: mode === 'auto' ? 'a' : 't' }] });
  }

  const shots = fm.shots || [];
  const startColor = alliance === 'blue' ? 'rgb(var(--alliance-blue))' : 'rgb(var(--alliance-red))';
  const byZone = shots.reduce((m, s) => ((m[s.z || 'diğer'] = (m[s.z || 'diğer'] || 0) + 1), m), {});

  return (
    <div className="grid gap-3">
      {!readOnly && (
        <Segmented
          options={[
            { value: 'start', label: '📍 Başlangıç' },
            { value: 'auto', label: '🧠 Oto Skor' },
            { value: 'tele', label: '🎮 Tele Skor' },
          ]}
          value={mode}
          onChange={(v) => v && setMode(v)}
        />
      )}
      <svg
        ref={svgRef}
        viewBox="0 0 100 100"
        className={`touch-manipulation select-none rounded-xl border-2 border-line bg-raised ${size === 'full' ? 'w-full' : 'w-40'}`}
        onPointerDown={tap}
        role={readOnly ? 'img' : 'button'}
        aria-label="Saha haritası – işaretlemek için dokunun"
      >
        {FIELD_IMAGE ? (
          <>
            <image href={`./${FIELD_IMAGE}`} x="0" y="0" width="100" height="100" preserveAspectRatio="none" />
            {/* Dokunma bölgeleri görselin üstünde kesikli çerçeve + küçük etiket */}
            {FIELD_ZONES.map((z, i) => (
              <g key={i} pointerEvents="none">
                <rect x={z.x * 100} y={z.y * 100} width={z.w * 100} height={z.h * 100} rx="1" fill="none" stroke={z.tone === 'neutral' ? '#f59e0b' : '#fff'} strokeOpacity="0.55" strokeWidth="0.4" strokeDasharray="1.2 1" />
                {z.w > 0.15 && (
                  <text x={(z.x + z.w / 2) * 100} y={(z.y + z.h / 2) * 100 + 1.2} textAnchor="middle" fontSize="3.2" fontWeight="bold" fill="#fff" stroke="#000" strokeWidth="0.5" paintOrder="stroke">{z.label}</text>
                )}
              </g>
            ))}
          </>
        ) : (
          <>
            {[1, 2, 3, 4, 5].map((i) => (
              <g key={i} stroke="rgb(var(--line))" strokeWidth="0.3">
                <line x1={(i * 100) / 6} y1="0" x2={(i * 100) / 6} y2="100" />
                <line x1="0" y1={(i * 100) / 6} x2="100" y2={(i * 100) / 6} />
              </g>
            ))}
            <rect x="0" y="0" width="100" height="2" fill="rgb(var(--alliance-blue))" />
            <rect x="0" y="98" width="100" height="2" fill="rgb(var(--alliance-red))" />
            {FIELD_ZONES.map((z) => (
              <g key={z.id}>
                <rect x={z.x * 100} y={z.y * 100} width={z.w * 100} height={z.h * 100} rx="2" fill={ZONE_FILL[z.tone]} stroke="rgb(var(--muted))" strokeWidth="0.4" />
                <text x={(z.x + z.w / 2) * 100} y={(z.y + z.h / 2) * 100 + 1.5} textAnchor="middle" fontSize="4" fill="rgb(var(--fg))" pointerEvents="none">{z.label}</text>
              </g>
            ))}
          </>
        )}
        {shots.map((s, i) => (
          <circle key={i} cx={s.x * 100} cy={s.y * 100} r="2.2" fill={s.p === 'a' ? 'rgb(var(--alliance-blue))' : 'rgb(var(--ok))'} stroke="rgb(var(--bg))" strokeWidth="0.6" />
        ))}
        {fm.start && (
          <g pointerEvents="none">
            <rect x={fm.start.x * 100 - 3.5} y={fm.start.y * 100 - 3.5} width="7" height="7" rx="1" fill={startColor} stroke="rgb(var(--fg))" strokeWidth="0.8" />
            <text x={fm.start.x * 100} y={fm.start.y * 100 + 1.6} textAnchor="middle" fontSize="4.5" fontWeight="bold" fill="#fff">S</text>
          </g>
        )}
      </svg>
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
        <span>■ Başlangıç</span>
        <span style={{ color: 'rgb(var(--alliance-blue))' }}>● Otonom ({shots.filter((s) => s.p === 'a').length})</span>
        <span style={{ color: 'rgb(var(--ok))' }}>● TeleOp ({shots.filter((s) => s.p === 't').length})</span>
        {Object.entries(byZone).map(([z, n]) => (
          <span key={z} className="rounded-full border border-line px-2 py-0.5">{ZONE_LABEL[z] || 'Diğer'}: {n}</span>
        ))}
      </div>
      {!readOnly && (
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            className="btn-ghost"
            disabled={!shots.length && !fm.start}
            onClick={() => onChange(shots.length ? { ...fm, shots: shots.slice(0, -1) } : { ...fm, start: null })}
          >
            ↶ Son işareti sil
          </button>
          <button type="button" className="btn-ghost" disabled={!shots.length && !fm.start} onClick={() => confirm('Haritadaki tüm işaretler silinsin mi?') && onChange(null)}>
            Haritayı temizle
          </button>
        </div>
      )}
    </div>
  );
}

/* ============================ DÖNGÜ SÜRESİ ÖLÇER ============================ */
export function CycleTimer({ cycles, onChange }) {
  const [startedAt, setStartedAt] = useState(null);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (!startedAt) return undefined;
    const id = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(id);
  }, [startedAt]);

  const running = startedAt != null;
  const elapsed = running ? (now - startedAt) / 1000 : 0;
  const avg = avgCycle(cycles);
  const best = cycles.length ? Math.min(...cycles) : null;

  function primary() {
    if (!running) {
      setStartedAt(Date.now());
      setNow(Date.now());
      return;
    }
    const sec = +((Date.now() - startedAt) / 1000).toFixed(1);
    onChange([...cycles, sec]);
    // Skor yapınca bir sonraki döngü hemen başlar (robot toplamaya geri döner)
    setStartedAt(Date.now());
  }

  return (
    <div className="grid gap-3">
      <p className="text-sm text-muted">
        Robot parçayı <b>almaya başladığında</b> “Başlat”a, <b>skor yaptığında</b> “Skor!”a dokunun. Skordan sonra sayaç bir sonraki döngü için otomatik yeniden başlar.
      </p>
      <div className="text-center text-6xl font-extrabold tabular-nums">{elapsed.toFixed(1)}<span className="text-2xl text-muted"> sn</span></div>
      <button
        type="button"
        className={`btn min-h-[88px] text-2xl ${running ? 'bg-ok text-black' : 'bg-accent text-accent-fg'}`}
        onClick={primary}
      >
        {running ? '🎯 Skor!' : '▶ Döngüyü Başlat'}
      </button>
      <div className="grid grid-cols-2 gap-2">
        <button type="button" className="btn-ghost" disabled={!running} onClick={() => setStartedAt(null)}>
          ⏹ Durdur (parça düştü / maç bitti)
        </button>
        <button type="button" className="btn-ghost" disabled={!cycles.length} onClick={() => onChange(cycles.slice(0, -1))}>
          ↶ Son döngüyü sil
        </button>
      </div>
      <div className="grid grid-cols-3 gap-2 text-center">
        {[
          ['Döngü', cycles.length],
          ['Ortalama', avg == null ? '—' : `${avg.toFixed(1)} sn`],
          ['En iyi', best == null ? '—' : `${best.toFixed(1)} sn`],
        ].map(([l, v]) => (
          <div key={l} className="rounded-xl bg-raised p-3">
            <div className="text-xl font-bold tabular-nums">{v}</div>
            <div className="text-xs text-muted">{l}</div>
          </div>
        ))}
      </div>
      {cycles.length > 0 && <p className="text-xs text-muted">Süreler: {cycles.map((c) => c.toFixed(1)).join(' · ')}</p>}
    </div>
  );
}

/* ============================ HIZLI ETİKETLER ============================ */
export function QuickTags({ value, onChange }) {
  const toggle = (id) => onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id]);
  return (
    <div className="grid grid-cols-2 gap-2">
      {QUICK_TAGS.map((t) => {
        const on = value.includes(t.id);
        return (
          <button
            key={t.id}
            type="button"
            aria-pressed={on}
            onClick={() => toggle(t.id)}
            className={`btn min-h-[56px] border-2 px-2 text-sm ${
              on ? (t.tone === 'ok' ? 'border-ok bg-ok text-black' : 'border-bad bg-bad text-white') : 'border-line bg-raised text-fg'
            }`}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}
