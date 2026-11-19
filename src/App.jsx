import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ScoutForm from './components/ScoutForm.jsx';
import Login, { SyncSettings } from './components/Login.jsx';
import { RecordList } from './components/Records.jsx';
import TeamsView from './components/TeamsView.jsx';
import { AllianceView, PredictorView } from './components/StrategyViews.jsx';
import { Toast } from './components/ui.jsx';
import { DEFAULT_SCORING, PROXY_URL, SHOW_SYNC_SETTINGS, SYNC_INTERVAL_MS } from './config.js';
import { emptyRecord, validate } from './schema.js';
import { teamStats } from './lib/analytics.js';
import { encodeRecord, roomRecords } from './lib/rooms.js';
import { enqueue, loadLastSync, loadQueue, loadSession, loadToken, saveSession, subscribe, syncNow } from './lib/store.js';
import {
  clearDraft, exportCSV, exportJSON, importJSONFile, loadDraft, loadPrefs,
  loadRecords as loadLegacyRecords, saveDraft, savePrefs, saveRecords as saveLegacyRecords,
} from './storage.js';

const THEMES = [
  { id: 'dark', label: '🌙', meta: '#0f1115' },
  { id: 'field', label: '⚡', meta: '#000000' },
  { id: 'light', label: '☀️', meta: '#f4f5f8' },
];
const TABS = [
  { id: 'form', icon: '📝', label: 'Gözlem' },
  { id: 'list', icon: '📋', label: 'Kayıtlar' },
  { id: 'teams', icon: '🏆', label: 'Takımlar' },
  { id: 'alliance', icon: '🤝', label: 'İttifak' },
  { id: 'predict', icon: '🎲', label: 'Simülatör' },
];

/** Kaydetmeden önce gizlenen / pasif alanlardaki artık verileri temizler */
function sanitize(rec) {
  const r = structuredClone(rec);
  delete r._pending;
  if (r.auto.hasAuto === false) {
    Object.assign(r.auto, {
      performance: '', success: null, odometry: null, vision: null, startPosition: null,
      routeCount: 0, pickupSource: null, tipCount: 0, soloTip: null,
    });
  }
  if (!r.teleop.driverAssist) r.teleop.assistDescription = '';
  if (r.robot.drivetrain !== 'other') r.robot.drivetrainOther = '';
  return r;
}

const ago = (iso) => {
  if (!iso) return 'hiç';
  const s = Math.round((Date.now() - new Date(iso)) / 1000);
  return s < 60 ? 'az önce' : s < 3600 ? `${Math.round(s / 60)} dk önce` : `${Math.round(s / 3600)} sa önce`;
};

export default function App() {
  const [prefs, setPrefs] = useState(() => ({ theme: 'dark', scouter: '', scoring: DEFAULT_SCORING, myTeam: '', ...loadPrefs() }));
  const [session, setSession] = useState(loadSession);

  useEffect(() => {
    document.documentElement.dataset.theme = prefs.theme;
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = THEMES.find((t) => t.id === prefs.theme)?.meta || '#0f1115';
    savePrefs(prefs);
  }, [prefs]);

  const enter = (s) => {
    saveSession(s);
    setSession(s);
    setPrefs((p) => ({ ...p, scouter: s.scouter }));
  };
  const leave = () => {
    saveSession(null);
    setSession(null);
  };

  if (!session) return <Login onEnter={enter} defaultScouter={prefs.scouter} />;
  return <Room key={session.roomId} session={session} prefs={prefs} setPrefs={setPrefs} onLeave={leave} />;
}

function Room({ session, prefs, setPrefs, onLeave }) {
  const [records, setRecords] = useState([]);
  const [undecryptable, setUndecryptable] = useState(0);
  const [queueLen, setQueueLen] = useState(() => loadQueue().length);
  const [sync, setSync] = useState({ busy: false, error: '', last: loadLastSync(), online: navigator.onLine });
  const [rec, setRec] = useState(() => {
    const d = loadDraft();
    return d && d.roomId === session.roomId ? d : { ...emptyRecord(), roomId: session.roomId, scouter: session.scouter };
  });
  const [errors, setErrors] = useState({});
  const [tab, setTab] = useState('form');
  const [filter, setFilter] = useState('');
  const [selectedTeam, setSelectedTeam] = useState(null);
  const [toast, setToast] = useState(null);
  const [showSettings, setShowSettings] = useState(false);
  const toastTimer = useRef(null);
  const fileRef = useRef(null);
  const legacy = useMemo(() => loadLegacyRecords(), []);
  const [legacyCount, setLegacyCount] = useState(legacy.length);

  const isEditing = records.some((r) => r.id === rec.id);
  const stats = useMemo(() => teamStats(records, prefs.scoring), [records, prefs.scoring]);

  const flash = useCallback((text, type = 'ok') => {
    setToast({ text, type });
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2600);
  }, []);

  // Cache / kuyruk değiştikçe oda kayıtlarını yeniden hesapla (özel odada şifre çözülür)
  const refresh = useCallback(() => {
    setQueueLen(loadQueue().length);
    roomRecords(session).then(({ records, failed }) => {
      setRecords(records);
      setUndecryptable(failed);
    });
  }, [session]);
  useEffect(() => {
    refresh();
    return subscribe(refresh);
  }, [refresh]);

  useEffect(() => {
    saveDraft(rec);
  }, [rec]);

  const runSync = useCallback(
    async (manual = false) => {
      if (!navigator.onLine) {
        setSync((s) => ({ ...s, online: false }));
        if (manual) flash('Çevrimdışı – kayıtlar cihazda bekliyor', 'error');
        return;
      }
      setSync((s) => ({ ...s, busy: true, online: true }));
      try {
        const r = await syncNow();
        setSync({ busy: false, error: '', last: new Date().toISOString(), online: true });
        if (manual) flash(r.needsToken ? 'Veri çekildi. Göndermek için GitHub anahtarı gerekli' : r.pushed ? `${r.pushed} işlem gönderildi ✓` : 'Güncel ✓', r.needsToken ? 'error' : 'ok');
      } catch (e) {
        setSync((s) => ({ ...s, busy: false, error: e.message }));
        if (manual) flash(e.message, 'error');
      }
    },
    [flash],
  );

  // Otomatik senkronizasyon: açılışta, periyodik, bağlantı gelince, uygulamaya dönünce
  useEffect(() => {
    runSync();
    const id = setInterval(() => document.visibilityState === 'visible' && runSync(), SYNC_INTERVAL_MS);
    const on = () => runSync();
    const off = () => setSync((s) => ({ ...s, online: false }));
    const vis = () => document.visibilityState === 'visible' && runSync();
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    document.addEventListener('visibilitychange', vis);
    return () => {
      clearInterval(id);
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
      document.removeEventListener('visibilitychange', vis);
    };
  }, [runSync]);

  function update(section, key, value) {
    setRec((prev) => (section ? { ...prev, [section]: { ...prev[section], [key]: value } } : { ...prev, [key]: value }));
    if (errors[key]) setErrors((e) => ({ ...e, [key]: undefined }));
  }

  function newForm(scouter = rec.scouter) {
    clearDraft();
    setRec({ ...emptyRecord(), roomId: session.roomId, scouter });
    setErrors({});
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function pushRecord(r) {
    enqueue({ type: 'record', roomId: session.roomId, item: await encodeRecord(session, r) });
  }

  async function save() {
    const errs = validate(rec);
    setErrors(errs);
    if (Object.keys(errs).length) {
      flash(Object.values(errs)[0], 'error');
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    const now = new Date().toISOString();
    const clean = { ...sanitize(rec), roomId: session.roomId, scouter: rec.scouter || session.scouter, createdAt: rec.createdAt || now, updatedAt: now };
    const dup = records.find(
      (r) => r.id !== clean.id && String(r.match.teamNumber) === String(clean.match.teamNumber) && String(r.match.matchNumber) === String(clean.match.matchNumber),
    );
    if (dup && !confirm(`#${clean.match.teamNumber} için ${clean.match.matchNumber} maçı zaten kayıtlı (${dup.scouter || '?'}). Onun yerine bu kayıt geçsin mi?`)) return;
    try {
      await pushRecord(clean);
      if (dup) await pushRecord({ id: dup.id, roomId: session.roomId, deleted: true, updatedAt: now });
    } catch (e) {
      return flash(e.message, 'error');
    }
    flash(isEditing ? 'Kayıt güncellendi ✓' : `#${clean.match.teamNumber} kaydedildi ✓`);
    newForm(clean.scouter);
    runSync();
  }

  function edit(r) {
    setRec(structuredClone(r));
    setErrors({});
    setTab('form');
    window.scrollTo({ top: 0 });
  }

  async function remove(r) {
    if (!confirm(`#${r.match.teamNumber} – Maç ${r.match.matchNumber} silinsin mi? (Odadaki herkes için silinir)`)) return;
    // Silme = "tombstone": diğer cihazlardaki eski kopya geri gelmesin diye silindi işaretli yeni sürüm
    await pushRecord({ id: r.id, roomId: session.roomId, deleted: true, updatedAt: new Date().toISOString() });
    flash('Kayıt silindi');
    runSync();
  }

  async function importInto(list) {
    for (const r of list) await pushRecord({ ...r, roomId: session.roomId, updatedAt: r.updatedAt || new Date().toISOString() });
    flash(`${list.length} kayıt odaya eklendi`);
    runSync();
  }

  async function onImport(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      await importInto(await importJSONFile(file));
    } catch {
      flash('Geçersiz JSON dosyası', 'error');
    }
  }

  const cycleTheme = () =>
    setPrefs((p) => ({ ...p, theme: THEMES[(THEMES.findIndex((t) => t.id === p.theme) + 1) % THEMES.length].id }));
  const exportRows = records.map(({ _pending, ...r }) => r);
  const hasToken = !!PROXY_URL || !!loadToken();

  const statusColor = !sync.online ? 'bg-bad' : sync.error ? 'bg-bad' : queueLen ? 'bg-accent' : 'bg-ok';
  const statusText = !sync.online
    ? `Çevrimdışı · ${queueLen} bekliyor`
    : sync.busy
      ? 'Senkronize ediliyor…'
      : sync.error
        ? 'Hata – tekrar denenecek'
        : queueLen
          ? `${queueLen} işlem bekliyor${hasToken ? '' : ' (anahtar yok)'}`
          : `Güncel · ${ago(sync.last)}`;

  return (
    <div className="mx-auto min-h-screen max-w-3xl px-4 pb-44">
      <Toast toast={toast} />

      <header className="sticky top-0 z-30 -mx-4 border-b border-line bg-bg/95 px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] backdrop-blur">
        <div className="flex items-center gap-2">
          <span className="text-2xl" aria-hidden>🐝</span>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-base font-extrabold leading-tight sm:text-lg">
              {session.type === 'private' ? '🔒' : '🌐'} {session.roomName}
            </h1>
            <p className="truncate text-xs text-muted">👤 {session.scouter} · {records.length} kayıt · {stats.length} takım</p>
          </div>
          <button className="btn-ghost min-h-[44px] w-11 px-0" onClick={cycleTheme} title="Tema (Koyu / Saha / Açık)">
            {THEMES.find((t) => t.id === prefs.theme)?.label}
          </button>
          <button className="btn-ghost min-h-[44px] px-3 text-sm" onClick={onLeave} title="Odadan çık">Çık</button>
        </div>
        <div className="mt-2 flex items-center gap-2">
          <button className="flex min-w-0 flex-1 items-center gap-2 text-left text-xs" onClick={() => SHOW_SYNC_SETTINGS && setShowSettings((v) => !v)}>
            <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${statusColor}`} />
            <span className="truncate text-muted">{statusText}</span>
          </button>
          <button className="btn-primary min-h-[40px] px-3 text-sm" onClick={() => runSync(true)} disabled={sync.busy}>
            {sync.busy ? '⏳' : '🔄'} Senkronize Et
          </button>
        </div>
        {sync.error && <p className="mt-1 text-xs text-bad">{sync.error}</p>}
      </header>

      {SHOW_SYNC_SETTINGS && showSettings && (
        <div className="mt-3">
          <SyncSettings open setOpen={setShowSettings} onSaved={() => runSync(true)} />
        </div>
      )}

      {undecryptable > 0 && (
        <p className="mt-3 rounded-xl bg-bad/15 p-3 text-sm text-bad">{undecryptable} kayıt çözülemedi (farklı anahtarla şifrelenmiş).</p>
      )}

      <main className="mt-4">
        {tab === 'form' && (
          <>
            {isEditing && (
              <div className="mb-3 flex items-center justify-between rounded-xl border border-accent bg-accent/10 p-3 text-sm">
                <span>✏️ Düzenleniyor: <b>#{rec.match.teamNumber}</b> – Maç {rec.match.matchNumber}</span>
                <button className="font-semibold underline" onClick={() => newForm()}>Vazgeç</button>
              </div>
            )}
            <ScoutForm rec={rec} update={update} errors={errors} />
          </>
        )}

        {tab === 'list' && (
          <div className="grid gap-4">
            <div className="card grid gap-2">
              <span className="label mb-0">Dışa / İçe Aktarma — {session.roomName}</span>
              <div className="grid grid-cols-3 gap-2">
                <button className="btn-primary" onClick={() => exportCSV(exportRows)} disabled={!records.length}>⬇ Excel (CSV)</button>
                <button className="btn-ghost" onClick={() => exportJSON(exportRows)} disabled={!records.length}>⬇ JSON</button>
                <button className="btn-ghost" onClick={() => fileRef.current?.click()}>⬆ İçe Al</button>
              </div>
              <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={onImport} />
              {legacyCount > 0 && (
                <button
                  className="btn-ghost text-sm"
                  onClick={async () => {
                    await importInto(legacy);
                    saveLegacyRecords([]);
                    setLegacyCount(0);
                  }}
                >
                  📦 Bu cihazdaki eski {legacyCount} kaydı bu odaya aktar
                </button>
              )}
            </div>
            <RecordList records={records} onEdit={edit} onDelete={remove} filter={filter} setFilter={setFilter} />
          </div>
        )}

        {tab === 'teams' && <TeamsView stats={stats} selected={selectedTeam} setSelected={setSelectedTeam} />}

        {tab === 'alliance' && (
          <AllianceView
            stats={stats}
            myTeam={prefs.myTeam}
            setMyTeam={(v) => setPrefs((p) => ({ ...p, myTeam: v }))}
            onOpenTeam={(n) => {
              setSelectedTeam(n);
              setTab('teams');
            }}
          />
        )}

        {tab === 'predict' && (
          <PredictorView stats={stats} scoring={prefs.scoring} setScoring={(s) => setPrefs((p) => ({ ...p, scoring: s }))} />
        )}
      </main>

      {/* Alt kısım: kaydet çubuğu (sadece formda) + sekme menüsü */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-bg/95 backdrop-blur">
        {tab === 'form' && (
          <div className="mx-auto grid max-w-3xl grid-cols-[1fr_2fr] gap-3 px-4 pt-3">
            <button className="btn-ghost min-h-[52px]" onClick={() => confirm('Form temizlensin mi?') && newForm()}>Temizle</button>
            <button className="btn-primary min-h-[52px] text-lg" onClick={save}>{isEditing ? '💾 Güncelle' : '💾 Kaydet'}</button>
          </div>
        )}
        <nav className="mx-auto grid max-w-3xl grid-cols-5 gap-1 px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => {
                setTab(t.id);
                if (t.id === 'teams' && tab === 'teams') setSelectedTeam(null);
                window.scrollTo({ top: 0 });
              }}
              className={`flex min-h-[52px] flex-col items-center justify-center rounded-xl text-[11px] font-semibold sm:text-xs ${tab === t.id ? 'bg-accent text-accent-fg' : 'text-muted'}`}
            >
              <span className="text-xl leading-none">{t.icon}</span>
              {t.label}
            </button>
          ))}
        </nav>
      </div>
    </div>
  );
}
