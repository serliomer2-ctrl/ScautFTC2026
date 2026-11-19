import React from 'react';
import { ABILITIES, OPTIONS } from '../schema.js';
import { Counter, Field, Section, Segmented, Slider, Stars, YesNoRow } from './ui.jsx';

const allianceTone = (v) =>
  v === 'red'
    ? 'border-red-alliance bg-red-alliance text-white'
    : 'border-blue-alliance bg-blue-alliance text-white';

export default function ScoutForm({ rec, update, errors }) {
  // update(section, key, value) -> rec[section][key] = value
  const m = rec.match, r = rec.robot, a = rec.auto, t = rec.teleop, e = rec.endgame;
  const autoOff = a.hasAuto === false;

  return (
    <div className="grid gap-4">
      {/* ---------- MAÇ BİLGİLERİ ---------- */}
      <Section title="Maç Bilgileri" icon="🏁">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Takım Numarası *" error={errors.teamNumber}>
            <input
              className="input text-xl font-bold"
              inputMode="numeric"
              placeholder="örn. 23456"
              value={m.teamNumber}
              onChange={(ev) => update('match', 'teamNumber', ev.target.value.replace(/\D/g, '').slice(0, 6))}
            />
          </Field>
          <Field label="Maç Numarası *" error={errors.matchNumber}>
            <input
              className="input text-xl font-bold"
              placeholder="örn. Q12"
              value={m.matchNumber}
              onChange={(ev) => update('match', 'matchNumber', ev.target.value.toUpperCase().slice(0, 10))}
            />
          </Field>
        </div>
        <Field label="Takım Adı">
          <input
            className="input"
            placeholder="örn. BeeBots"
            value={m.teamName}
            onChange={(ev) => update('match', 'teamName', ev.target.value)}
          />
        </Field>
        <Field label="İttifak Rengi *" error={errors.alliance}>
          <Segmented
            options={OPTIONS.alliance}
            value={m.alliance}
            onChange={(v) => update('match', 'alliance', v)}
            tone={allianceTone}
          />
        </Field>
        <Field label="Gözlemci Adı">
          <input
            className="input"
            placeholder="Kim gözlemliyor?"
            value={rec.scouter}
            onChange={(ev) => update(null, 'scouter', ev.target.value)}
          />
        </Field>
        <Field label="Gözlemci Notları">
          <textarea
            className="input min-h-[96px]"
            placeholder="Dikkat çeken her şey: arızalar, faul, strateji, ittifak uyumu…"
            value={m.notes}
            onChange={(ev) => update('match', 'notes', ev.target.value)}
          />
        </Field>
      </Section>

      {/* ---------- ROBOT ÖZELLİKLERİ ---------- */}
      <Section title="Robot Özellikleri" icon="🤖">
        <Field label="Şasi Tipi">
          <Segmented
            options={OPTIONS.drivetrain}
            value={r.drivetrain}
            onChange={(v) => update('robot', 'drivetrain', v)}
            cols={2}
          />
        </Field>
        {r.drivetrain === 'other' && (
          <Field label="Diğer şasi tipi">
            <input
              className="input"
              placeholder="örn. H-Drive, Omni"
              value={r.drivetrainOther}
              onChange={(ev) => update('robot', 'drivetrainOther', ev.target.value)}
            />
          </Field>
        )}
        <Field label="Intake (Top Alma) Yapısı">
          <Segmented options={OPTIONS.intake} value={r.intake} onChange={(v) => update('robot', 'intake', v)} />
        </Field>
        <div className="grid gap-3">
          <span className="label mb-0">Yetenekler</span>
          {ABILITIES.map((ab) => (
            <YesNoRow
              key={ab.key}
              label={ab.label}
              value={r.abilities[ab.key]}
              onChange={(v) => update('robot', 'abilities', { ...r.abilities, [ab.key]: v })}
            />
          ))}
        </div>
      </Section>

      {/* ---------- OTONOM ---------- */}
      <Section title="Otonom Dönemi" icon="🧠">
        <YesNoRow label="Otonom var mı?" value={a.hasAuto} onChange={(v) => update('auto', 'hasAuto', v)} />
        {autoOff ? (
          <p className="rounded-xl bg-raised p-3 text-sm text-muted">
            Otonom yok olarak işaretlendi — otonom detayları kaydedilmeyecek.
          </p>
        ) : (
          <>
            <Field label="Otonom Başarı Durumu">
              <Segmented
                options={OPTIONS.autoSuccess}
                value={a.success}
                onChange={(v) => update('auto', 'success', v)}
                tone={(v) =>
                  v === 'success'
                    ? 'border-ok bg-ok text-black'
                    : v === 'fail'
                      ? 'border-bad bg-bad text-white'
                      : 'border-accent bg-accent text-accent-fg'
                }
              />
            </Field>
            <Field label="Otonom nasıl çalışıyor? (kısa açıklama)">
              <textarea
                className="input min-h-[80px]"
                placeholder="örn. Önce ön yüklü polen, sonra Garden'dan 2 nektar…"
                value={a.performance}
                onChange={(ev) => update('auto', 'performance', ev.target.value)}
              />
            </Field>
            <YesNoRow label="Odometri kullanıyor mu?" value={a.odometry} onChange={(v) => update('auto', 'odometry', v)} />
            <YesNoRow
              label="Görüntü işleme (Vision) ile topa gidiyor mu?"
              value={a.vision}
              onChange={(v) => update('auto', 'vision', v)}
            />
            <Field label="Başlangıç Konumu">
              <Segmented
                options={OPTIONS.startPosition}
                value={a.startPosition}
                onChange={(v) => update('auto', 'startPosition', v)}
              />
            </Field>
            <Field label="Topu nereden alıyor?">
              <Segmented
                options={OPTIONS.pickupSource}
                value={a.pickupSource}
                onChange={(v) => update('auto', 'pickupSource', v)}
                cols={2}
              />
            </Field>
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="Kayıtlı otonom rota sayısı">
                <Counter value={a.routeCount} onChange={(v) => update('auto', 'routeCount', v)} max={20} />
              </Field>
              <Field label="Otonomda kaç “Tip” yapıyor?">
                <Counter value={a.tipCount} onChange={(v) => update('auto', 'tipCount', v)} />
              </Field>
            </div>
            <YesNoRow
              label="Kendi başına (yardımsız) Tip yapabiliyor mu?"
              value={a.soloTip}
              onChange={(v) => update('auto', 'soloTip', v)}
            />
          </>
        )}
      </Section>

      {/* ---------- TELEOP ---------- */}
      <Section title="TeleOp / Sürücü Kontrolü" icon="🎮">
        <YesNoRow
          label="Otomatik hizalama (Hive'a robot kendi mi bakıyor?)"
          value={t.autoAim}
          onChange={(v) => update('teleop', 'autoAim', v)}
        />
        <YesNoRow
          label="Sürücü asistanı (assist) var mı?"
          value={t.driverAssist}
          onChange={(v) => update('teleop', 'driverAssist', v)}
        />
        {t.driverAssist && (
          <Field label="Asistan nasıl çalışıyor?">
            <textarea
              className="input min-h-[80px]"
              placeholder="örn. Tek tuşla Hive'a hizalanıp atış yapıyor…"
              value={t.assistDescription}
              onChange={(ev) => update('teleop', 'assistDescription', ev.target.value)}
            />
          </Field>
        )}
        <Field label="Sürücü (Driver) hakimiyeti">
          <Stars value={t.driverRating} onChange={(v) => update('teleop', 'driverRating', v)} />
        </Field>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Tek seferde kaç Nektar/Polen taşıyor?">
            <Counter value={t.carryCapacity} onChange={(v) => update('teleop', 'carryCapacity', v)} max={20} />
          </Field>
          <Field label="TeleOp boyunca kaç “Tip” yaptı?">
            <Counter value={t.tipCount} onChange={(v) => update('teleop', 'tipCount', v)} />
          </Field>
        </div>
        <Field label="Atış isabet oranı">
          <Slider value={t.accuracy} onChange={(v) => update('teleop', 'accuracy', v)} />
        </Field>
      </Section>

      {/* ---------- END GAME ---------- */}
      <Section title="Oyun Sonu (End Game)" icon="🌸">
        <YesNoRow
          label="End Game Flower yapmayı planlıyor mu?"
          value={e.flowerPlanned}
          onChange={(v) => update('endgame', 'flowerPlanned', v)}
        />
        <Field label="End Game Flower sonucu">
          <Segmented
            options={OPTIONS.flowerResult}
            value={e.flowerResult}
            onChange={(v) => update('endgame', 'flowerResult', v)}
            tone={(v) =>
              v === 'done'
                ? 'border-ok bg-ok text-black'
                : v === 'failed'
                  ? 'border-bad bg-bad text-white'
                  : 'border-muted bg-muted text-bg'
            }
          />
        </Field>
      </Section>
    </div>
  );
}

