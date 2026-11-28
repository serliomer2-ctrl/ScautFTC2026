import React, { useEffect, useState } from 'react';
import { accounts, loadRoster, login, register } from '../lib/auth.js';
import { pullOnly, syncNow } from '../lib/store.js';
import { Segmented } from './ui.jsx';

/**
 * Giriş / Kayıt ekranı (OLED). Listeden kişini seç → Giriş (PIN) ya da Kayıt (davet kodu + yeni PIN).
 * Hesaplar senkronizasyonla gelir; internet yoksa önbellekteki hesaplarla giriş yapılır.
 */
export default function AuthScreen({ onAuth }) {
  const [roster, setRoster] = useState(null);
  const [err, setErr] = useState('');
  const [mode, setMode] = useState('login');
  const [memberId, setMemberId] = useState('');
  const [pin, setPin] = useState('');
  const [pin2, setPin2] = useState('');
  const [invite, setInvite] = useState('');
  const [busy, setBusy] = useState(false);
  const [, setTick] = useState(0);

  useEffect(() => {
    loadRoster().then(setRoster, (e) => setErr(e.message));
    pullOnly().then(() => setTick((x) => x + 1), () => {}); // hesapları tazele (internet yoksa önbellek)
  }, []);

  const acc = roster ? accounts() : new Map();
  const member = roster?.members.find((m) => m.id === memberId);
  const active = member && acc.has(member.id);

  async function submit(e) {
    e.preventDefault();
    setErr('');
    if (!member) return setErr('Listeden adınızı seçin');
    setBusy(true);
    try {
      if (mode === 'login') onAuth(await login(roster, memberId, pin));
      else {
        if (pin !== pin2) throw new Error('PIN tekrarı eşleşmiyor');
        const s = await register(roster, memberId, invite, pin);
        syncNow().catch(() => {}); // internet varsa hesabı hemen yayınla
        onAuth(s);
      }
    } catch (x) {
      setErr(x.message || String(x));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-4 px-4 py-8">
      <div className="text-center">
        <img src="./logo.webp" alt="Qubitrobotics #37677 logosu" className="mx-auto h-24 w-24 rounded-3xl shadow-lg" />
        <h1 className="mt-3 text-3xl font-extrabold">Biobuzz Scout</h1>
        <p className="text-muted">{roster?.team ? `${roster.team.name} · #${roster.team.number}` : 'Takım girişi'}</p>
      </div>

      <form onSubmit={submit} className="card grid gap-4">
        <Segmented
          options={[
            { value: 'login', label: '🔑 Giriş Yap' },
            { value: 'register', label: '✨ Kayıt Ol' },
          ]}
          value={mode}
          onChange={(v) => v && (setMode(v), setErr(''))}
        />

        <label className="grid gap-1">
          <span className="label mb-0">Adınız (takım listesi)</span>
          <select className="input" value={memberId} onChange={(e) => setMemberId(e.target.value)} disabled={!roster}>
            <option value="">{roster ? '— Seçin —' : 'Liste yükleniyor…'}</option>
            {roster?.members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.adSoyad}
                {m.rol === 'mentor' ? ' · Mentör' : ''}
                {acc.has(m.id) ? '' : ' (aktif değil)'}
              </option>
            ))}
          </select>
        </label>

        {mode === 'register' && (
          <label className="grid gap-1">
            <span className="label mb-0">Takım davet kodu</span>
            <input className="input font-mono uppercase tracking-wider" value={invite} onChange={(e) => setInvite(e.target.value)} placeholder="QB37-XXXX-XXXX" autoComplete="off" autoCapitalize="characters" />
          </label>
        )}

        <label className="grid gap-1">
          <span className="label mb-0">{mode === 'register' ? 'Yeni PIN / şifre (en az 4, önerilen 6+)' : 'PIN / şifre'}</span>
          <input className="input text-center text-2xl tracking-[0.4em]" type="password" inputMode="numeric" value={pin} onChange={(e) => setPin(e.target.value)} autoComplete={mode === 'register' ? 'new-password' : 'current-password'} />
        </label>
        {mode === 'register' && (
          <label className="grid gap-1">
            <span className="label mb-0">PIN tekrar</span>
            <input className="input text-center text-2xl tracking-[0.4em]" type="password" inputMode="numeric" value={pin2} onChange={(e) => setPin2(e.target.value)} autoComplete="new-password" />
          </label>
        )}

        {member && mode === 'login' && !active && <p className="rounded-xl bg-warn/15 p-3 text-sm">Bu hesap henüz aktif değil. “Kayıt Ol” ile davet kodunuzu girip PIN belirleyin.</p>}
        {err && <p className="rounded-xl bg-bad/15 p-3 text-sm font-semibold text-bad">{err}</p>}

        <button className="btn-primary min-h-[56px] text-lg" disabled={busy || !roster}>
          {busy ? '⏳ Doğrulanıyor…' : mode === 'login' ? 'Giriş Yap' : 'Hesabı Aktifleştir'}
        </button>
      </form>
      <p className="text-center text-xs text-muted">Bir kez giriş yaptıktan sonra internet olmadan da kullanabilirsiniz. Listede adınız yoksa mentörünüze başvurun.</p>
    </div>
  );
}
