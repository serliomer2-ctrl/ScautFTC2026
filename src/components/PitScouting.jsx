import React, { useMemo, useRef, useState } from 'react';
import { OPTIONS, labelOf } from '../schema.js';
import { compressImage } from '../lib/image.js';
import { Counter, Field, Section, Segmented, YesNoRow } from './ui.jsx';
import MicButton from './MicButton.jsx';

/**
 * Garaj (Pit) incelemesi
 * Pit kaydı maç kayıtlarıyla aynı oda listesinde, `kind: 'pit'` ile tutulur (aynı senkronizasyon,
 * şifreleme ve offline kuyruktan geçer). Her takım için TEK pit kaydı vardır: id takım numarasından
 * türetilir, böylece iki gözlemci aynı takımı girerse kayıt çoğalmaz, en yeni sürüm kalır.
 * Özel odalarda id, takım numarası açıkta görünmesin diye özetlenir (hash).
 *
 *   { id, kind:'pit', roomId, scouter, createdAt, updatedAt,
 *     team: { number, name },
 *     pit:  { drivetrain, drivetrainOther, intake, driveMotors, totalMotors, autoRoutes, autoNotes,
 *             driverExperience, odometry, vision, notes, photo (JPEG data URL, ≤ ~13 KB),
 *             alerts: [{ id, at, by }] } }     ← Faz 4: canlı garaj durum rozetleri (eski kayıtlarda yok → [])
 */
/** Canlı garaj durum rozetleri – takım profilinden ve pit formundan tek dokunuşla açılıp kapanır */
export const PIT_ALERTS = [
  { id: 'spares', label: '🧰 Yedek Parçası Bol', tone: 'ok' },
  { id: 'newCode', label: '💾 Yeni Kod Yüklendi', tone: 'warn' },
  { id: 'motorHeat', label: '🌡️ Motor Isınma Sorunu', tone: 'bad' },
  { id: 'maintenance', label: '🔧 Mekanik Bakımda', tone: 'bad' },
];

/** Rozet listesini değiştirir (varsa kaldırır, yoksa zaman damgasıyla ekler) */
export const toggleAlert = (alerts = [], id, by) =>
  alerts.some((a) => a.id === id) ? alerts.filter((a) => a.id !== id) : [...alerts, { id, at: new Date().toISOString(), by }];

export const EXPERIENCE = [
  { value: 'rookie', label: 'İlk sezon' },
  { value: '1-2', label: '1–2 sezon' },
  { value: '3+', label: '3+ sezon' },
];

const emptyPit = () => ({
  drivetrain: null, drivetrainOther: '', intake: null, driveMotors: 4, totalMotors: 8,
  autoRoutes: 0, autoNotes: '', driverExperience: null, odometry: null, vision: null, notes: '', photo: null, alerts: [],
});

/** Henüz pit kaydı olmayan takım için boş kayıt (durum rozeti ilk kez eklenirken kullanılır) */
export const newPit = (number, name = '') => ({ team: { number: String(number), name }, pit: emptyPit() });

export async function pitId(session, teamNumber) {
  if (session.type !== 'private') return `pit:${teamNumber}`;
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${session.roomId}:${teamNumber}`));
  return 'pit:' + [...new Uint8Array(buf)].slice(0, 8).map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Oda listesindeki (migrate edilmiş) pit kaydından yalnızca pit alanlarını çıkarır */
export const cleanPit = (r) => ({
  id: r.id, kind: 'pit', roomId: r.roomId, scouter: r.scouter, createdAt: r.createdAt, updatedAt: r.updatedAt,
  team: { number: String(r.team?.number || ''), name: r.team?.name || '' },
  pit: { ...emptyPit(), ...(r.pit || {}) },
});

export default function PitScouting({ pitRecords, teamNames, session, scouter, onSave, flash }) {
  const [editing, setEditing] = useState(null);
  const [q, setQ] = useState('');

  const list = useMemo(
    () =>
      pitRecords
        .map(cleanPit)
        .filter((p) => !q || p.team.number.includes(q) || p.team.name.toLowerCase().includes(q.toLowerCase()))
        .sort((a, b) => Number(a.team.number) - Number(b.team.number)),
    [pitRecords, q],
  );

  if (editing)
    return (
      <PitForm
        initial={editing}
        teamNames={teamNames}
        existing={pitRecords.map(cleanPit)}
        onCancel={() => setEditing(null)}
        flash={flash}
        onSave={async (p) => {
          const now = new Date().toISOString();
          const id = p.id || (await pitId(session, p.team.number));
          await onSave({ ...p, id, kind: 'pit', roomId: session.roomId, scouter: p.scouter || scouter, createdAt: p.createdAt || now, updatedAt: now });
          setEditing(null);
        }}
      />
    );

  return (
    <div className="grid gap-3">
      <button className="btn-primary min-h-[56px] text-lg" onClick={() => setEditing({ team: { number: '', name: '' }, pit: emptyPit() })}>
        ➕ Yeni Pit İncelemesi
      </button>
      {pitRecords.length > 0 && (
        <input className="input" type="search" placeholder="🔍 Takım ara…" value={q} onChange={(e) => setQ(e.target.value)} />
      )}
      {!pitRecords.length && <div className="card text-center text-muted">Henüz pit incelemesi yok.</div>}
      {list.map((p) => (
        <button key={p.id} className="card flex gap-3 p-3 text-left" onClick={() => setEditing(p)}>
          {p.pit.photo ? (
            <img src={p.pit.photo} alt={`#${p.team.number} robot`} className="h-24 w-24 shrink-0 rounded-xl object-cover" />
          ) : (
            <div className="flex h-24 w-24 shrink-0 items-center justify-center rounded-xl bg-raised text-3xl">🤖</div>
          )}
          <div className="min-w-0 flex-1">
            <div className="truncate text-lg font-bold">
              {p._pending ? '⏳ ' : ''}#{p.team.number} <span className="font-normal text-muted">{p.team.name}</span>
            </div>
            <SpecChips p={p.pit} />
            <AlertChips alerts={p.pit.alerts} />
            <div className="mt-1 text-xs text-muted">{p.scouter} · {p.updatedAt?.slice(0, 16).replace('T', ' ')}</div>
          </div>
        </button>
      ))}
    </div>
  );
}

export function AlertChips({ alerts }) {
  if (!alerts?.length) return null;
  return (
    <div className="mt-1 flex flex-wrap gap-1">
      {alerts.map((a) => {
        const def = PIT_ALERTS.find((x) => x.id === a.id);
        return (
          <span key={a.id} className={`rounded-full px-2 py-0.5 text-xs font-bold ${def?.tone === 'ok' ? 'bg-ok/20 text-ok' : def?.tone === 'warn' ? 'bg-warn/20 text-warn' : 'bg-bad/20 text-bad'}`}>
            {def?.label || a.id}
          </span>
        );
      })}
    </div>
  );
}

export function SpecChips({ p }) {
  const chips = [
    p.drivetrain && (p.drivetrain === 'other' ? p.drivetrainOther || 'Diğer şasi' : labelOf('drivetrain', p.drivetrain)),
    p.intake && labelOf('intake', p.intake),
    `${p.driveMotors} sürüş / ${p.totalMotors} motor`,
    p.autoRoutes ? `${p.autoRoutes} oto rota` : null,
    p.driverExperience && `Sürücü: ${EXPERIENCE.find((e) => e.value === p.driverExperience)?.label}`,
    p.odometry && 'Odometri',
    p.vision && 'Vision',
  ].filter(Boolean);
  return (
    <div className="mt-1 flex flex-wrap gap-1">
      {chips.map((c) => (
        <span key={c} className="rounded-full border border-line px-2 py-0.5 text-xs">{c}</span>
      ))}
    </div>
  );
}

function PitForm({ initial, teamNames, existing, onCancel, onSave, flash }) {
  const [rec, setRec] = useState(() => ({ ...initial, team: { ...initial.team }, pit: { ...emptyPit(), ...initial.pit } }));
  const [busy, setBusy] = useState(false);
  const [photoInfo, setPhotoInfo] = useState('');
  const camRef = useRef(null);
  const galRef = useRef(null);
  const p = rec.pit;
  const set = (k, v) => setRec((r) => ({ ...r, pit: { ...r.pit, [k]: v } }));
  const setTeam = (k, v) => setRec((r) => ({ ...r, team: { ...r.team, [k]: v } }));
  // Sesli not: kesinleşen cümleyi mevcut metnin sonuna ekler
  const appendTo = (k) => (text) => setRec((r) => ({ ...r, pit: { ...r.pit, [k]: r.pit[k] ? `${r.pit[k].replace(/\s+$/, '')} ${text}` : text } }));

  async function onPhoto(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setPhotoInfo('⏳ Sıkıştırılıyor…');
    try {
      const out = await compressImage(file);
      set('photo', out.dataUrl);
      setPhotoInfo(`✅ ${Math.round(file.size / 1024)} KB → ${Math.round(out.bytes / 1024)} KB (${out.width}×${out.height})`);
    } catch (err) {
      setPhotoInfo('');
      flash(err.message, 'error');
    }
  }

  async function submit() {
    if (!rec.team.number) return flash('Takım numarası zorunlu', 'error');
    // Aynı takım için başka bir pit kaydı varsa onu güncelle (çift kayıt olmasın)
    const dup = !rec.id && existing.find((x) => x.team.number === rec.team.number);
    if (dup && !confirm(`#${rec.team.number} için pit incelemesi zaten var (${dup.scouter}). Üzerine yazılsın mı?`)) return;
    setBusy(true);
    try {
      await onSave(dup ? { ...rec, id: dup.id, createdAt: dup.createdAt } : rec);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-4">
      <button className="btn-ghost justify-self-start" onClick={onCancel}>← Pit listesi</button>

      <Section title="Takım" icon="🏷️">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Takım Numarası *">
            <input
              className="input text-xl font-bold"
              inputMode="numeric"
              value={rec.team.number}
              disabled={!!rec.id}
              onChange={(e) => {
                const n = e.target.value.replace(/\D/g, '').slice(0, 6);
                setTeam('number', n);
                if (!rec.team.name && teamNames[n]) setTeam('name', teamNames[n]);
              }}
            />
          </Field>
          <Field label="Takım Adı">
            <input className="input" value={rec.team.name} onChange={(e) => setTeam('name', e.target.value)} />
          </Field>
        </div>
      </Section>

      <Section title="Robot Fotoğrafı" icon="📸">
        {p.photo ? (
          <img src={p.photo} alt="Robot" className="max-h-80 w-full rounded-xl object-contain bg-raised" />
        ) : (
          <div className="flex h-40 items-center justify-center rounded-xl bg-raised text-5xl">🤖</div>
        )}
        <div className="grid grid-cols-3 gap-2">
          <button type="button" className="btn-primary" onClick={() => camRef.current?.click()}>📷 Çek</button>
          <button type="button" className="btn-ghost" onClick={() => galRef.current?.click()}>🖼️ Seç</button>
          <button type="button" className="btn-danger" disabled={!p.photo} onClick={() => (set('photo', null), setPhotoInfo(''))}>Sil</button>
        </div>
        <input ref={camRef} type="file" accept="image/*" capture="environment" hidden onChange={onPhoto} />
        <input ref={galRef} type="file" accept="image/*" hidden onChange={onPhoto} />
        <p className="text-xs text-muted">{photoInfo || 'Fotoğraf cihazda otomatik küçültülür (~13 KB) – senkronizasyonu yavaşlatmaz.'}</p>
      </Section>

      <Section title="Teknik Özellikler" icon="⚙️">
        <Field label="Şasi Tipi">
          <Segmented options={OPTIONS.drivetrain} value={p.drivetrain} onChange={(v) => set('drivetrain', v)} cols={2} />
        </Field>
        {p.drivetrain === 'other' && (
          <Field label="Diğer şasi tipi">
            <input className="input" value={p.drivetrainOther} onChange={(e) => set('drivetrainOther', e.target.value)} />
          </Field>
        )}
        <Field label="Intake Yapısı">
          <Segmented options={OPTIONS.intake} value={p.intake} onChange={(v) => set('intake', v)} />
        </Field>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Sürüş motoru sayısı">
            <Counter value={p.driveMotors} onChange={(v) => set('driveMotors', v)} max={8} />
          </Field>
          <Field label="Toplam motor sayısı">
            <Counter value={p.totalMotors} onChange={(v) => set('totalMotors', v)} max={20} />
          </Field>
        </div>
        <YesNoRow label="Odometri (dead wheel / IMU) var mı?" value={p.odometry} onChange={(v) => set('odometry', v)} />
        <YesNoRow label="Görüntü işleme (kamera) var mı?" value={p.vision} onChange={(v) => set('vision', v)} />
      </Section>

      <Section title="Otonom & Sürücü" icon="🧭">
        <Field label="Hazır otonom rota sayısı">
          <Counter value={p.autoRoutes} onChange={(v) => set('autoRoutes', v)} max={20} />
        </Field>
        <Field label="Otonom rotaları (kısaca)">
          <textarea className="input min-h-[80px]" placeholder="örn. Sol: 3 polen + park, Sağ: 2 nektar…" value={p.autoNotes} onChange={(e) => set('autoNotes', e.target.value)} />
          <MicButton onAppend={appendTo('autoNotes')} />
        </Field>
        <Field label="Sürücü deneyimi">
          <Segmented options={EXPERIENCE} value={p.driverExperience} onChange={(v) => set('driverExperience', v)} />
        </Field>
        <Field label="Pit notları">
          <textarea className="input min-h-[96px]" placeholder="Güçlü/zayıf yönler, yedek parça, takım stratejisi…" value={p.notes} onChange={(e) => set('notes', e.target.value)} />
          <MicButton onAppend={appendTo('notes')} />
        </Field>
        <Field label="Canlı garaj durumu">
          <div className="grid grid-cols-2 gap-2">
            {PIT_ALERTS.map((a) => {
              const on = (p.alerts || []).some((x) => x.id === a.id);
              return (
                <button
                  key={a.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => set('alerts', toggleAlert(p.alerts, a.id, rec.scouter))}
                  className={`btn min-h-[52px] border-2 px-2 text-sm ${on ? (a.tone === 'ok' ? 'border-ok bg-ok text-black' : a.tone === 'warn' ? 'border-warn bg-warn text-black' : 'border-bad bg-bad text-white') : 'border-line bg-raised'}`}
                >
                  {a.label}
                </button>
              );
            })}
          </div>
        </Field>
      </Section>

      <button className="btn-primary min-h-[56px] text-lg" disabled={busy} onClick={submit}>
        {busy ? '⏳' : '💾'} {rec.id ? 'Pit Kaydını Güncelle' : 'Pit Kaydını Kaydet'}
      </button>
    </div>
  );
}
