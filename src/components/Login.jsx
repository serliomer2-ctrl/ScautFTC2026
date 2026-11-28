import React, { useEffect, useState } from 'react';
import { createPrivate, joinPrivate, joinPublic, knownRooms } from '../lib/rooms.js';
import { loadRepo, loadToken, pullOnly, saveRepo, saveToken, testConnection } from '../lib/store.js';
import { Field, Segmented } from './ui.jsx';
import { SHOW_SYNC_SETTINGS } from '../config.js';

export default function Login({ onEnter, defaultScouter = '', lockedScouter = false }) {
  const [scouter, setScouter] = useState(defaultScouter);
  const [mode, setMode] = useState('public');
  const [privMode, setPrivMode] = useState('join');
  const [roomName, setRoomName] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [rooms, setRooms] = useState(knownRooms);
  const [showSettings, setShowSettings] = useState(false);

  useEffect(() => {
    pullOnly().then(() => setRooms(knownRooms())).catch(() => {});
  }, []);

  // Sistem odaları (takım hesapları) listede gösterilmez
  const publicRooms = Object.values(rooms).filter((r) => r.type === 'public' && r.id !== 'pub:team-accounts');

  async function submit(e) {
    e.preventDefault();
    setError('');
    if (!scouter.trim()) return setError('Gözlemci adınızı girin');
    if (!roomName.trim()) return setError('Oda adını girin');
    setBusy(true);
    try {
      let s;
      if (mode === 'public') s = joinPublic(roomName, scouter.trim());
      else if (privMode === 'create') s = await createPrivate(roomName, password, scouter.trim());
      else s = await joinPrivate(roomName, password, scouter.trim());
      onEnter(s);
    } catch (err) {
      setError(err.message || String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-4 px-4 py-8">
      <div className="text-center">
        <img src="./logo.webp" alt="Qubitrobotics #37677 logosu" className="mx-auto h-28 w-28 rounded-3xl shadow-lg" />
        <h1 className="mt-3 text-3xl font-extrabold">Biobuzz Scout</h1>
        <p className="text-muted">Qubitrobotics · #37677 · FTC 2026</p>
      </div>

      <form onSubmit={submit} className="card grid gap-4">
        <Field label="Gözlemci (Scouter) Adı">
          <input
            className={`input ${lockedScouter ? 'opacity-80' : ''}`}
            value={scouter}
            readOnly={lockedScouter}
            onChange={(e) => setScouter(e.target.value)}
            placeholder="örn. Ayşe"
            autoComplete="nickname"
          />
          {lockedScouter && <span className="mt-1 block text-xs text-muted">🔒 Giriş yapılan hesaptan otomatik</span>}
        </Field>

        <Segmented
          options={[
            { value: 'public', label: '🌐 Ortak Oda' },
            { value: 'private', label: '🔒 Takım Odası' },
          ]}
          value={mode}
          onChange={(v) => v && (setMode(v), setError(''))}
        />

        {mode === 'private' && (
          <Segmented
            options={[
              { value: 'join', label: 'Giriş Yap' },
              { value: 'create', label: 'Yeni Oda Oluştur' },
            ]}
            value={privMode}
            onChange={(v) => v && setPrivMode(v)}
          />
        )}

        <Field
          label={mode === 'public' ? 'Turnuva / Oda Adı' : 'Takım Odası Adı'}
          hint={mode === 'public' ? 'Yoksa otomatik oluşturulur. Ortak oda verisi depodaki herkes tarafından görülebilir.' : undefined}
        >
          <input className="input" value={roomName} onChange={(e) => setRoomName(e.target.value)} placeholder={mode === 'public' ? 'örn. İstanbul Regional' : 'örn. Takım 23456'} />
        </Field>

        {mode === 'public' && publicRooms.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {publicRooms.map((r) => (
              <button type="button" key={r.id} className="rounded-full border border-line bg-raised px-3 py-2 text-sm" onClick={() => setRoomName(r.name)}>
                {r.name}
              </button>
            ))}
          </div>
        )}

        {mode === 'private' && (
          <Field
            label="Oda Şifresi"
            hint={privMode === 'create' ? 'Kayıtlar bu şifreyle uçtan uca şifrelenir. Şifre unutulursa veri kurtarılamaz!' : undefined}
          >
            <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={privMode === 'create' ? 'new-password' : 'current-password'} />
          </Field>
        )}

        {error && <p className="rounded-xl bg-bad/15 p-3 text-sm font-semibold text-bad">{error}</p>}

        <button className="btn-primary min-h-[56px] text-lg" disabled={busy}>
          {busy ? '⏳ Bekleyin…' : mode === 'private' && privMode === 'create' ? 'Odayı Oluştur' : 'Odaya Gir'}
        </button>
      </form>

      {SHOW_SYNC_SETTINGS && <SyncSettings open={showSettings} setOpen={setShowSettings} onSaved={() => pullOnly().then(() => setRooms(knownRooms())).catch(() => {})} />}
    </div>
  );
}

export function SyncSettings({ open, setOpen, onSaved }) {
  const [repo, setRepo] = useState(loadRepo);
  const [token, setToken] = useState(loadToken);
  const [status, setStatus] = useState('');

  async function save() {
    saveRepo(repo);
    saveToken(token.trim());
    setStatus('⏳ Test ediliyor…');
    try {
      const t = await testConnection(repo, token.trim());
      setStatus(
        !token.trim()
          ? '✅ Okuma çalışıyor. Yazma için anahtar gerekli – kayıtlar şimdilik cihazda bekler.'
          : t.write
            ? `✅ Bağlantı tamam: okuma + yazma${t.exists ? '' : ' (dosya ilk kayıtta oluşturulacak)'}`
            : '⚠️ Okuma tamam ama bu hesabın depoya yazma yetkisi görünmüyor',
      );
      onSaved?.();
    } catch (e) {
      setStatus('❌ ' + e.message);
    }
  }

  return (
    <div className="card">
      <button type="button" className="flex w-full items-center justify-between text-left font-bold" onClick={() => setOpen(!open)}>
        ⚙️ Senkronizasyon Ayarları {token ? <span className="text-sm text-ok">● anahtar var</span> : <span className="text-sm text-bad">● anahtar yok</span>}
        <span className="text-muted">{open ? '▴' : '▾'}</span>
      </button>
      {open && (
        <div className="mt-4 grid gap-3">
          <Field
            label="GitHub Erişim Anahtarı (Fine-grained token)"
            hint="GitHub → Settings → Developer settings → Fine-grained tokens. Sadece bu depo + “Contents: Read and write” izni verin. Anahtar yalnızca bu cihazda saklanır."
          >
            <input className="input font-mono text-sm" type="password" value={token} onChange={(e) => setToken(e.target.value)} placeholder="github_pat_…" autoComplete="off" />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Depo sahibi">
              <input className="input text-sm" value={repo.owner} onChange={(e) => setRepo({ ...repo, owner: e.target.value.trim() })} />
            </Field>
            <Field label="Depo adı">
              <input className="input text-sm" value={repo.repo} onChange={(e) => setRepo({ ...repo, repo: e.target.value.trim() })} />
            </Field>
            <Field label="Dal (boş = varsayılan)">
              <input className="input text-sm" value={repo.branch} onChange={(e) => setRepo({ ...repo, branch: e.target.value.trim() })} />
            </Field>
            <Field label="Dosya">
              <input className="input text-sm" value={repo.path} onChange={(e) => setRepo({ ...repo, path: e.target.value.trim() })} />
            </Field>
          </div>
          <button type="button" className="btn-ghost" onClick={save}>Kaydet & Bağlantıyı Test Et</button>
          {status && <p className="text-sm">{status}</p>}
        </div>
      )}
    </div>
  );
}
