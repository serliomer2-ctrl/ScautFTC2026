import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ScoutForm from './components/ScoutForm.jsx';
import Login, { SyncSettings } from './components/Login.jsx';
import { RecordList } from './components/Records.jsx';
import TeamsView from './components/TeamsView.jsx';
import { AllianceView, PredictorView } from './components/StrategyViews.jsx';
import { Toast } from './components/ui.jsx';
import MatchExtras from './components/MatchExtras.jsx';
import SaveConfirm from './components/SaveConfirm.jsx';
import QRTransfer from './components/QRTransfer.jsx';
import PitScouting, { cleanPit, newPit, pitId, toggleAlert } from './components/PitScouting.jsx';
import HeadToHead from './components/HeadToHead.jsx';
import EventSchedule from './components/EventSchedule.jsx';
import MatchScreen, { PreMatch, loadMatchMode, saveMatchMode } from './components/MatchMode.jsx';
import MasterScanner from './components/MasterScanner.jsx';
import ScouterQRSend, { MatchQR } from './components/CompactQR.jsx';
import TeamProfileCard from './components/TeamProfileCard.jsx';
import Picklist from './components/Picklist.jsx';
import WhatIf from './components/WhatIf.jsx';
import Briefing from './components/Briefing.jsx';
import TextSync from './components/TextSync.jsx';
import Gallery from './components/Gallery.jsx';
import ConsensusPanel from './components/ConsensusPanel.jsx';
import Report from './components/Report.jsx';
import { averageRecords, resolvedForStats } from './lib/consensus.js';
import AuthScreen from './components/AuthScreen.jsx';
import TasksHub from './components/Tasks.jsx';
import { cachedRoster, loadAuth, loadRoster, logout as authLogout, refreshAuth, resetAccount } from './lib/auth.js';
import { taskProgress } from './lib/tasks.js';
import { cachedEvent } from './lib/ftcscout.js';
import { exportPitCSV } from './lib/exportExtra.js';
import { DEFAULT_SCORING, PROXY_URL, SHOW_SYNC_SETTINGS, SYNC_INTERVAL_MS } from './config.js';
import { emptyRecord, migrate, validate } from './schema.js';
import { teamStats } from './lib/analytics.js';
import { encodeRecord, roomRecords } from './lib/rooms.js';
import { enqueue, loadLastSync, loadQueue, loadSession, loadToken, saveSession, subscribe, syncNow } from './lib/store.js';
import {
  clearDraft, exportCSV, exportJSON, importJSONFile, loadDraft, loadPrefs,
  loadRecords as loadLegacyRecords, saveDraft, savePrefs, saveRecords as saveLegacyRecords,
} from './storage.js';

const THEMES = [
  { id: 'oled', label: '🌑', meta: '#0f1115' },
  { id: 'dark', label: '🌙', meta: '#0f1115' },
  { id: 'field', label: '⚡', meta: '#000000' },
  { id: 'light', label: '☀️', meta: '#f4f5f8' },
];
/**
 * OfflineScout tarzı 4 ana sekme. Her ana sekmenin alt sekmeleri mevcut ekranlardır (id'ler aynı kaldı).
 * master: true olanlar yalnızca Master (Strateji Masası) rolünde görünür.
 */
const MAIN = [
  { id: 'scout', icon: '📝', label: 'Scout', subs: [['match', '⚡ Maç'], ['form', '📝 Detaylı'], ['pit', '🔧 Pit']] },
  { id: 'tasks', icon: '✅', label: 'Görevler', subs: [['tasks', 'Görevler']] },
  { id: 'sync', icon: '📡', label: 'Sync / QR', subs: [['list', 'Sync']] },
  { id: 'teams', icon: '🏆', label: 'Takımlar', subs: [['teams', 'Takımlar']], master: true },
  { id: 'strategy', icon: '🧠', label: 'Strateji', subs: [['brief', '📣 Brifing'], ['picklist', '📋 Liste'], ['alliance', '🤝 İttifak'], ['predict', '🎲 Simül.'], ['report', '📄 Rapor']], master: true },
];
const mainOf = (leaf) => MAIN.find((m) => m.subs.some(([id]) => id === leaf)) || MAIN[0];

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
  const [prefs, setPrefs] = useState(() => {
    const p = { theme: 'oled', scouter: '', scoring: DEFAULT_SCORING, myTeam: '', role: 'scouter', ...loadPrefs() };
    if (!p.myTeam) p.myTeam = '37677'; // Qubitrobotics – İttifak/Picklist/Program vurgusu için
    p.scoring = { ...DEFAULT_SCORING, ...p.scoring }; // Faz 5: eski kayıtlı modele ceza puanları eklenir
    if (!p.hand) p.hand = 'right';
    if (p.keepAwake === undefined) p.keepAwake = true;
    // Tek seferlik: yeni OLED tasarımına geçiş (kullanıcı sonra istediği temaya dönebilir)
    if (!p.uiV) Object.assign(p, { theme: 'oled', uiV: 3 });
    return p;
  });
  const [session, setSession] = useState(loadSession);
  // Faz 6: kimlik. Oturum cihazda kalır (internetsiz de geçerli); liste güncellenince ad/rol tazelenir.
  const [auth, setAuth] = useState(() => refreshAuth(loadAuth(), cachedRoster()));
  const [roster, setRoster] = useState(cachedRoster);
  useEffect(() => {
    loadRoster()
      .then((r) => {
        setRoster(r);
        setAuth((a) => refreshAuth(a, r));
      })
      .catch(() => {});
  }, []);
  // Gözlemci adı artık hesaptan gelir: açık oda oturumundaki ad hesap adıyla eşitlenir (eski kayıtlara dokunulmaz)
  useEffect(() => {
    if (auth && session && session.scouter !== auth.adSoyad) {
      const s = { ...session, scouter: auth.adSoyad };
      saveSession(s);
      setSession(s);
    }
  }, [auth, session]);

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

  const signOut = () => {
    authLogout();
    setAuth(null);
    leave();
  };

  if (!auth) return <AuthScreen onAuth={(a) => (setAuth(a), loadRoster().then(setRoster, () => {}))} />;
  if (!session) return <Login onEnter={enter} defaultScouter={auth.adSoyad} lockedScouter />;
  return <Room key={session.roomId} session={session} prefs={prefs} setPrefs={setPrefs} onLeave={leave} auth={auth} roster={roster} onSignOut={signOut} />;
}

function Room({ session, prefs, setPrefs, onLeave, auth, roster, onSignOut }) {
  const [allRecords, setRecords] = useState([]);
  // Oda listesinde maç kayıtları + pit kayıtları (kind: 'pit') birlikte durur
  const records = useMemo(() => allRecords.filter((r) => r.kind !== 'pit' && r.kind !== 'task'), [allRecords]);
  // Faz 6: mentör görevleri (oda kayıtlarında kind: 'task')
  const tasks = useMemo(() => allRecords.filter((r) => r.kind === 'task'), [allRecords]);
  const pitRecords = useMemo(() => allRecords.filter((r) => r.kind === 'pit'), [allRecords]);
  const pitByTeam = useMemo(() => Object.fromEntries(pitRecords.map((r) => [String(r.team?.number), r])), [pitRecords]);
  const [confirming, setConfirming] = useState(false);
  const history = useRef([]); // Geri Al (Undo) yığını
  const lastEdit = useRef({ k: '', t: 0 });
  const [histLen, setHistLen] = useState(0);
  const [undecryptable, setUndecryptable] = useState(0);
  const [queueLen, setQueueLen] = useState(() => loadQueue().length);
  const [sync, setSync] = useState({ busy: false, error: '', last: loadLastSync(), online: navigator.onLine });
  const [rec, setRec] = useState(() => {
    const d = loadDraft();
    return d && d.roomId === session.roomId ? d : { ...emptyRecord(), roomId: session.roomId, scouter: session.scouter };
  });
  const [errors, setErrors] = useState({});
  const [tab, setTab] = useState('match');
  const lastSub = useRef({});
  const role = prefs.role === 'master' ? 'master' : 'scouter';
  const visibleMain = MAIN.filter((m) => role === 'master' || !m.master);
  // Maç ekranı durumu (faz, saat). Uygulama yeniden açıldığında doğrudan maça atlamaz, "devam et" sorar.
  const [mm, setMmState] = useState(() => {
    const m = loadMatchMode();
    return m && m.roomId === session.roomId ? { ...m, active: false, resumable: !!m.active || m.resumable } : null;
  });
  const setMm = (m) => {
    setMmState(m);
    saveMatchMode(m);
  };
  const [lastSaved, setLastSaved] = useState(null);
  // Açılışta yarım kalmış taslak var mıydı? (uyarı yalnızca bu durumda gösterilir)
  const [resumeAsk, setResumeAsk] = useState(() => !!(mm?.resumable || rec.match.teamNumber || rec.match.matchNumber));
  const [filter, setFilter] = useState('');
  const [selectedTeam, setSelectedTeam] = useState(null);
  const [toast, setToast] = useState(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showPrefs, setShowPrefs] = useState(false);
  const toastTimer = useRef(null);
  const fileRef = useRef(null);
  const legacy = useMemo(() => loadLegacyRecords(), []);
  const [legacyCount, setLegacyCount] = useState(legacy.length);

  const isEditing = records.some((r) => r.id === rec.id);
  // Faz 5: aynı maç+takımın çoklu gözlemleri analizde tek (ortalama) kayıt olarak sayılır
  const consensus = useMemo(() => resolvedForStats(records, prefs.scoring), [records, prefs.scoring]);
  const stats = useMemo(() => teamStats(consensus.records, prefs.scoring), [consensus, prefs.scoring]);
  const [teamsView, setTeamsView] = useState('list');

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
    // Geri Al için önceki hali sakla; aynı metin alanına art arda yazmayı tek adım say
    const k = `${section}.${key}`;
    const now = Date.now();
    const coalesce = typeof value === 'string' && lastEdit.current.k === k && now - lastEdit.current.t < 1500;
    lastEdit.current = { k, t: now };
    if (!coalesce) {
      history.current.push(rec);
      if (history.current.length > 80) history.current.shift();
      setHistLen(history.current.length);
    }
    setRec((prev) => (section ? { ...prev, [section]: { ...prev[section], [key]: value } } : { ...prev, [key]: value }));
    if (errors[key]) setErrors((e) => ({ ...e, [key]: undefined }));
  }

  /** Birden çok alanı tek Geri Al adımıyla değiştirir (örn. TeleOp skor + döngü süresi) */
  function patch(fn) {
    history.current.push(rec);
    if (history.current.length > 80) history.current.shift();
    setHistLen(history.current.length);
    lastEdit.current = { k: '', t: 0 };
    setRec((prev) => fn(prev));
  }

  function resetHistory() {
    history.current = [];
    lastEdit.current = { k: '', t: 0 };
    setHistLen(0);
  }

  function undo() {
    const prev = history.current.pop();
    if (!prev) return;
    lastEdit.current = { k: '', t: 0 };
    setRec(prev);
    setHistLen(history.current.length);
    if (!mm?.active) flash('↶ Geri alındı'); // maç ekranında bildirim başlığı kapatmasın
  }

  /** Kaydet'e basınca: önce doğrula, sorun yoksa özet/onay penceresini aç */
  function requestSave() {
    if (Object.keys(validate(rec)).length) return save();
    setConfirming(true);
  }

  function newForm(scouter = rec.scouter) {
    resetHistory();
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
    const clean = {
      ...sanitize(rec),
      roomId: session.roomId,
      // Düzenlenen eski kayıtta orijinal gözlemci korunur; yeni kayıtta giriş yapan kullanıcı yazılır
      scouter: isEditing ? rec.scouter || auth.adSoyad : auth.adSoyad,
      scouterId: isEditing ? rec.scouterId || null : auth.memberId,
      scouterRole: isEditing ? rec.scouterRole || null : auth.rol,
      createdAt: rec.createdAt || now,
      updatedAt: now,
    };
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
    return clean;
  }

  function edit(r) {
    resetHistory();
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

  /** QR'dan gelen kayıtları birleştirir: aynı id → yeni olan kazanır; aynı takım+maç farklı id → yeni olan kalır */
  const importScanned = async (list, opts = {}) => {
    const sum = { added: 0, updated: 0, skipped: 0, replaced: 0 };
    const byId = new Map(allRecords.map((r) => [r.id, r]));
    const now = new Date().toISOString();
    for (const raw of list) {
      if (raw.kind === 'task') {
        const ex = byId.get(raw.id);
        if (!raw.id || (ex && (ex.updatedAt || '') >= (raw.updatedAt || ''))) {
          sum.skipped++;
          continue;
        }
        const { _pending, ...task } = raw;
        await pushRecord({ ...task, roomId: session.roomId });
        ex ? sum.updated++ : sum.added++;
        byId.set(raw.id, raw);
        continue;
      }
      const isPit = raw.kind === 'pit';
      const r = isPit ? cleanPit(raw) : migrate(raw);
      delete r._pending;
      r.roomId = session.roomId;
      if (!r.id || (!isPit && !r.match.teamNumber)) continue;
      const ex = byId.get(r.id);
      if (ex && (ex.updatedAt || '') >= (r.updatedAt || '')) {
        sum.skipped++;
        continue;
      }
      if (isPit && ex?.pit?.photo && !r.pit.photo) r.pit.photo = ex.pit.photo; // QR fotoğraf taşımaz
      if (!ex && !isPit) {
        const dup = records.find(
          (x) =>
            String(x.match.teamNumber) === String(r.match.teamNumber) &&
            String(x.match.matchNumber) === String(r.match.matchNumber) &&
            (x.scouter || '') === (r.scouter || ''), // farklı gözlemci → silinmez, doğrulama motoruna gider
        );
        if (dup) {
          if ((dup.updatedAt || '') >= (r.updatedAt || '')) {
            sum.skipped++;
            continue;
          }
          await pushRecord({ id: dup.id, roomId: session.roomId, deleted: true, updatedAt: now });
          sum.replaced++;
        }
      }
      await pushRecord(r);
      ex ? sum.updated++ : sum.added++;
      byId.set(r.id, r);
    }
    if (sum.added + sum.updated) runSync();
    if (!opts.quiet) flash(`QR: ${sum.added} yeni, ${sum.updated} güncel, ${sum.skipped} zaten vardı`);
    return sum;
  };

  /** Takım profilinden canlı garaj rozeti aç/kapa – pit kaydı yoksa oluşturur */
  async function togglePitAlert(num, alertId) {
    const ex = pitByTeam[String(num)];
    const base = ex ? cleanPit(ex) : { ...newPit(num, stats.find((t) => t.num === String(num))?.name || ''), id: await pitId(session, num) };
    const now = new Date().toISOString();
    const next = { ...base, kind: 'pit', roomId: session.roomId, scouter: base.scouter || session.scouter, createdAt: base.createdAt || now, updatedAt: now };
    next.pit = { ...next.pit, alerts: toggleAlert(next.pit.alerts, alertId, session.scouter) };
    await pushRecord(next);
    runSync();
  }

  async function saveTask(t) {
    await pushRecord({ ...t, roomId: session.roomId, scouter: auth.adSoyad });
    runSync();
  }
  async function deleteTask(t) {
    await pushRecord({ id: t.id, roomId: session.roomId, deleted: true, updatedAt: new Date().toISOString() });
    runSync();
  }
  const schedule = useMemo(() => {
    try {
      const last = JSON.parse(localStorage.getItem('bb2.event.last')) || {};
      return last.code ? cachedEvent(last.season, last.code) : null;
    } catch {
      return null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);
  const myOpenTasks = useMemo(() => {
    const ctx = { records, pits: pitRecords, members: roster?.members || [], schedule };
    return tasks.filter((t) => t.assignee === auth.memberId && !taskProgress(t, ctx).complete).length;
  }, [tasks, records, pitRecords, roster, schedule, auth]);

  /** Veri doğrulama kararı: 'average' veya seçilen kaydın id'si */
  async function resolveConsensus(g, choice) {
    const now = new Date().toISOString();
    if (choice === 'average') {
      const merged = {
        ...averageRecords(g.records),
        id: crypto.randomUUID(),
        roomId: session.roomId,
        createdAt: now,
        updatedAt: now,
        consensus: { status: 'merged', from: g.records.map((r) => r.id), by: session.scouter },
      };
      await pushRecord(merged);
      for (const r of g.records) await pushRecord({ id: r.id, roomId: session.roomId, deleted: true, updatedAt: now });
      flash(`#${g.team} ${g.match}: ortalama kayıt oluşturuldu`);
    } else {
      for (const r of g.records) if (r.id !== choice) await pushRecord({ id: r.id, roomId: session.roomId, deleted: true, updatedAt: now });
      flash(`#${g.team} ${g.match}: seçilen kayıt tutuldu`);
    }
    runSync();
  }

  async function savePit(p) {
    p = { ...p, scouter: p.scouterId ? p.scouter : auth.adSoyad, scouterId: p.scouterId || auth.memberId };
    await pushRecord(p);
    flash(`#${p.team.number} pit kaydı kaydedildi ✓`);
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
      {confirming && (
        <SaveConfirm
          rec={rec}
          isEditing={isEditing}
          onCancel={() => setConfirming(false)}
          onConfirm={async () => {
            setConfirming(false);
            const fromMatch = mm?.active;
            const saved = await save();
            if (saved && fromMatch) {
              setMm(null);
              if (role === 'scouter') setLastSaved(saved);
            }
          }}
        />
      )}

      {lastSaved && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/80 sm:items-center" role="dialog" aria-modal="true" aria-label="Maç QR">
          <div className="card w-full max-w-md rounded-b-none sm:rounded-2xl">
            <h2 className="text-xl font-extrabold">✅ #{lastSaved.match.teamNumber} · {lastSaved.match.matchNumber} kaydedildi</h2>
            <p className="mb-3 text-sm text-muted">Master cihaza okutun (internet gerekmez).</p>
            <MatchQR record={lastSaved} />
            <button className="btn-primary mt-3 min-h-[60px] w-full text-lg" onClick={() => (setLastSaved(null), setTab('match'))}>⚡ Yeni Maç</button>
          </div>
        </div>
      )}
      {tab === 'match' && mm?.active && (
        <MatchScreen
          rec={rec}
          update={update}
          patch={patch}
          undo={undo}
          histLen={histLen}
          state={mm}
          setState={setMm}
          onFinish={requestSave}
          hand={prefs.hand}
          keepAwake={prefs.keepAwake}
          onExit={() => {
            setMm({ ...mm, active: false, resumable: true });
            setResumeAsk(true);
          }}
        />
      )}

      <header className="sticky top-0 z-30 -mx-4 border-b border-line bg-bg/95 px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] backdrop-blur">
        <div className="flex items-center gap-2">
          <img src="./logo.webp" alt="Qubitrobotics logosu" className="h-10 w-10 shrink-0 rounded-xl" />
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-base font-extrabold leading-tight sm:text-lg">
              {session.type === 'private' ? '🔒' : '🌐'} {session.roomName}
            </h1>
            <p className="truncate text-xs text-muted">
              {auth.rol === 'mentor' ? '🧑‍🏫' : '👤'} {auth.adSoyad} · {records.length} kayıt · {stats.length} takım
            </p>
          </div>
          <button
            className={`btn min-h-[44px] border-2 px-2 text-xs ${role === 'master' ? 'border-warn bg-warn/15 text-warn' : 'border-line bg-raised'}`}
            onClick={() => {
              const next = role === 'master' ? 'scouter' : 'master';
              setPrefs((p) => ({ ...p, role: next }));
              if (next === 'scouter' && mainOf(tab).master) setTab('match');
              flash(next === 'master' ? '🧠 Master modu: tarama + analiz + yedekleme' : '📝 Scouter modu: veri toplama + QR');
            }}
            title="Cihaz rolü"
          >
            {role === 'master' ? '🧠 Master' : '📝 Scouter'}
          </button>
          <button className="btn-ghost min-h-[44px] w-11 px-0" onClick={() => setShowPrefs((v) => !v)} title="Ayarlar" aria-label="Ayarlar">⚙</button>
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

      {showPrefs && <PrefsPanel prefs={prefs} setPrefs={setPrefs} onClose={() => setShowPrefs(false)} auth={auth} onSignOut={onSignOut} />}

      {SHOW_SYNC_SETTINGS && showSettings && (
        <div className="mt-3">
          <SyncSettings open setOpen={setShowSettings} onSaved={() => runSync(true)} />
        </div>
      )}

      {undecryptable > 0 && (
        <p className="mt-3 rounded-xl bg-bad/15 p-3 text-sm text-bad">{undecryptable} kayıt çözülemedi (farklı anahtarla şifrelenmiş).</p>
      )}

      <main className="mt-4">
        {mainOf(tab).subs.length > 1 && (
          <div className="mb-4 grid gap-1 rounded-2xl bg-surface p-1" style={{ gridTemplateColumns: `repeat(${mainOf(tab).subs.length}, minmax(0,1fr))` }}>
            {mainOf(tab).subs.map(([id, label]) => (
              <button
                key={id}
                onClick={() => {
                  setTab(id);
                  lastSub.current[mainOf(id).id] = id;
                }}
                className={`min-h-[44px] rounded-xl text-sm font-bold ${tab === id ? 'bg-accent text-accent-fg' : 'text-muted'}`}
              >
                {label}
              </button>
            ))}
          </div>
        )}

        {tab === 'match' && !mm?.active && (
          <PreMatch
            rec={rec}
            update={update}
            teamNames={{ ...Object.fromEntries(pitRecords.map((p) => [String(p.team?.number), p.team?.name])), ...Object.fromEntries(stats.map((t) => [t.num, t.name])) }}
            onStart={() => setMm({ roomId: session.roomId, active: true, phase: mm?.phase || 'auto', startedAt: Date.now(), lastScoreAt: null })}
            resume={
              resumeAsk && (rec.match.teamNumber || rec.match.matchNumber) && !isEditing ? (
                <div className="flex items-center gap-3 rounded-2xl border-2 border-warn bg-warn/10 p-3">
                  <span className="text-2xl">⏸</span>
                  <div className="min-w-0 flex-1 text-sm">
                    <b>Yarım kalan maç{rec.match.matchNumber ? ` ${rec.match.matchNumber}` : ''}</b>
                    {rec.match.teamNumber ? ` · #${rec.match.teamNumber}` : ''}
                    <div className="text-xs text-muted">Veriler cihazda güvende{mm?.phase ? ` · ${mm.phase === 'auto' ? 'Auto' : mm.phase === 'teleop' ? 'TeleOp' : 'Endgame'} fazında kaldı` : ''}</div>
                  </div>
                  <button
                    className="btn-primary px-3"
                    onClick={() => {
                      setResumeAsk(false);
                      // Saat eski oturumdan kalmışsa sıfırlanır (gerekirse maç ekranında yeniden başlatılır)
                      setMm({ roomId: session.roomId, active: true, phase: mm?.phase || 'auto', startedAt: null, lastScoreAt: null });
                    }}
                  >
                    ▶ Devam
                  </button>
                  <button className="btn-ghost px-3" onClick={() => confirm('Yarım kalan maç verisi silinsin mi?') && (newForm(), setMm(null), setResumeAsk(false))}>Sil</button>
                </div>
              ) : null
            }
          />
        )}

        {tab === 'form' && (
          <>
            {isEditing && (
              <div className="mb-3 flex items-center justify-between rounded-xl border border-accent bg-accent/10 p-3 text-sm">
                <span>✏️ Düzenleniyor: <b>#{rec.match.teamNumber}</b> – Maç {rec.match.matchNumber}</span>
                <button className="font-semibold underline" onClick={() => newForm()}>Vazgeç</button>
              </div>
            )}
            <ScoutForm rec={rec} update={update} errors={errors} />
            <MatchExtras rec={rec} update={update} />
          </>
        )}

        {tab === 'tasks' && (
          <TasksHub
            auth={auth}
            roster={roster}
            tasks={tasks}
            records={records}
            pits={pitRecords}
            groups={consensus.groups}
            schedule={schedule}
            session={session}
            onSaveTask={saveTask}
            onDeleteTask={deleteTask}
            onResetAccount={(id) => (resetAccount(id), runSync())}
            goTo={(t) => (setTab(t), window.scrollTo({ top: 0 }))}
            flash={flash}
          />
        )}

        {tab === 'pit' && (
          <PitScouting
            pitRecords={pitRecords}
            teamNames={Object.fromEntries(stats.map((t) => [t.num, t.name]))}
            session={session}
            scouter={session.scouter}
            onSave={savePit}
            flash={flash}
          />
        )}

        {tab === 'list' && (
          <div className="grid gap-4">
            {role === 'master' ? (
              <>
                <MasterScanner onImport={importScanned} />
                <ConsensusPanel groups={consensus.groups} scoring={prefs.scoring} onResolve={resolveConsensus} />
              </>
            ) : (
              <ScouterQRSend records={records} scouter={session.scouter} />
            )}
            <div className="card grid gap-2">
              <span className="label mb-0">Dışa / İçe Aktarma — {session.roomName}</span>
              <div className="grid grid-cols-3 gap-2">
                <button className="btn-primary" onClick={() => exportCSV(exportRows)} disabled={!records.length}>⬇ Excel (CSV)</button>
                <button className="btn-ghost" onClick={() => exportJSON([...exportRows, ...pitRecords.map(cleanPit)])} disabled={!allRecords.length}>⬇ JSON</button>
                <button className="btn-ghost" onClick={() => fileRef.current?.click()}>⬆ İçe Al</button>
              </div>
              <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={onImport} />
              {pitRecords.length > 0 && (
                <button className="btn-ghost text-sm" onClick={() => exportPitCSV(pitRecords.map(cleanPit))}>⬇ Pit verisi (CSV)</button>
              )}
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
            <QRTransfer matchRecords={[...records, ...tasks]} pitRecords={pitRecords} scouter={session.scouter} onImport={importScanned} />
            <TextSync matchRecords={[...records, ...tasks]} pitRecords={pitRecords} session={session} onImport={importScanned} />
            {role === 'scouter' && <p className="-mb-2 text-sm font-semibold text-muted">Benim maçlarım</p>}
            <RecordList records={role === 'master' ? records : records.filter((r) => r.scouter === session.scouter)} onEdit={edit} onDelete={remove} filter={filter} setFilter={setFilter} />
          </div>
        )}

        {tab === 'teams' && selectedTeam && stats.some((t) => t.num === selectedTeam) && (
          <TeamProfileCard t={stats.find((t) => t.num === selectedTeam)} pit={pitByTeam[selectedTeam]} onToggleAlert={togglePitAlert} scoring={prefs.scoring} />
        )}
        {tab === 'teams' && !selectedTeam && (
          <div className="mb-3 grid grid-cols-2 gap-1 rounded-2xl bg-surface p-1">
            {[
              ['list', '☰ Liste'],
              ['grid', '▦ Galeri'],
            ].map(([k, l]) => (
              <button key={k} onClick={() => setTeamsView(k)} className={`min-h-[44px] rounded-xl text-sm font-bold ${teamsView === k ? 'bg-accent text-accent-fg' : 'text-muted'}`}>
                {l}
              </button>
            ))}
          </div>
        )}
        {tab === 'teams' && !selectedTeam && teamsView === 'grid' ? (
          <Gallery stats={stats} pitRecords={pitRecords} scoring={prefs.scoring} onOpen={setSelectedTeam} />
        ) : (
          tab === 'teams' && <TeamsView stats={stats} selected={selectedTeam} setSelected={setSelectedTeam} />
        )}

        {tab === 'report' && (
          <Report stats={stats} rawRecords={records} pitRecords={pitRecords} groups={consensus.groups} scoring={prefs.scoring} myTeam={prefs.myTeam} session={session} />
        )}

        {tab === 'brief' && <Briefing stats={stats} pitByTeam={pitByTeam} myTeam={prefs.myTeam} />}

        {tab === 'picklist' && <Picklist stats={stats} roomId={session.roomId} myTeam={prefs.myTeam} pitByTeam={pitByTeam} scoring={prefs.scoring} />}

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
        {tab === 'alliance' && (
          <div className="mt-4">
            <HeadToHead stats={stats} pitByTeam={pitByTeam} />
          </div>
        )}
        {tab === 'alliance' && (
          <div className="mt-4">
            <WhatIf stats={stats} myTeam={prefs.myTeam} />
          </div>
        )}

        {tab === 'predict' && (
          <PredictorView stats={stats} scoring={prefs.scoring} setScoring={(s) => setPrefs((p) => ({ ...p, scoring: s }))} />
        )}
        {tab === 'predict' && (
          <div className="mt-4">
            <EventSchedule stats={stats} myTeam={prefs.myTeam} />
          </div>
        )}
      </main>

      {/* Alt kısım: kaydet çubuğu (sadece formda) + sekme menüsü */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-bg/95 backdrop-blur">
        {tab === 'form' && (
          <div className="mx-auto grid max-w-3xl grid-cols-[1fr_1fr_2fr] gap-2 px-4 pt-3">
            <button className="btn-ghost min-h-[52px] px-2" onClick={() => confirm('Form temizlensin mi?') && newForm()}>Temizle</button>
            <button className="btn-ghost min-h-[52px] px-2" onClick={undo} disabled={!histLen} aria-label="Geri al">↶ Geri Al</button>
            <button className="btn-primary min-h-[52px] text-lg" onClick={requestSave}>{isEditing ? '💾 Güncelle' : '💾 Kaydet'}</button>
          </div>
        )}
        <nav
          className="mx-auto grid max-w-3xl gap-1 px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2"
          style={{ gridTemplateColumns: `repeat(${visibleMain.length}, minmax(0,1fr))` }}
        >
          {visibleMain.map((t) => (
            <button
              key={t.id}
              onClick={() => {
                const cur = mainOf(tab).id;
                if (t.id === 'teams' && cur === 'teams') setSelectedTeam(null);
                setTab(cur === t.id ? tab : lastSub.current[t.id] || t.subs[0][0]);
                window.scrollTo({ top: 0 });
              }}
              className={`flex min-h-[56px] flex-col items-center justify-center gap-0.5 rounded-xl text-xs font-bold ${mainOf(tab).id === t.id ? 'bg-accent text-accent-fg' : 'text-muted'}`}
            >
              <span className="relative text-2xl leading-none">
                {t.icon}
                {t.id === 'tasks' && myOpenTasks > 0 && (
                  <span className="absolute -right-3 -top-1 min-w-[18px] rounded-full bg-bad px-1 text-[10px] font-black leading-[18px] text-white">{myOpenTasks}</span>
                )}
              </span>
              {t.label}
            </button>
          ))}
        </nav>
      </div>
    </div>
  );
}

/* ============================ AYARLAR (Faz 5) ============================ */
function PrefsPanel({ prefs, setPrefs, onClose, auth, onSignOut }) {
  const set = (k, v) => setPrefs((p) => ({ ...p, [k]: v }));
  const wakeOk = typeof navigator !== 'undefined' && 'wakeLock' in navigator;
  return (
    <section className="card mt-3 grid gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold">⚙ Saha Ayarları</h2>
        <button className="btn-ghost min-h-[40px] px-3 text-sm" onClick={onClose}>Kapat</button>
      </div>
      <div className="grid gap-2">
        <span className="label mb-0">Tema</span>
        <div className="grid grid-cols-4 gap-2">
          {[
            ['oled', '🌑 OLED'],
            ['dark', '🌙 Koyu'],
            ['field', '⚡ Saha'],
            ['light', '☀️ Açık'],
          ].map(([k, l]) => (
            <button key={k} onClick={() => set('theme', k)} className={`btn min-h-[48px] border-2 px-1 text-xs ${prefs.theme === k ? 'border-accent bg-accent text-accent-fg' : 'border-line bg-raised'}`}>
              {l}
            </button>
          ))}
        </div>
      </div>
      {auth && (
        <div className="flex items-center gap-3 rounded-2xl bg-raised p-3">
          <div className="min-w-0 flex-1">
            <div className="truncate font-bold">{auth.adSoyad}</div>
            <div className="text-xs text-muted">{auth.rol === 'mentor' ? 'Mentör' : 'Üye'}{auth.gitHub ? ` · @${auth.gitHub}` : ''} · bu cihazda oturum açık</div>
          </div>
          <button className="btn-danger min-h-[44px] px-3 text-sm" onClick={() => confirm('Hesaptan çıkılsın mı? Tekrar girişte PIN gerekir.') && onSignOut()}>Hesaptan Çık</button>
        </div>
      )}
      <div className="grid gap-2">
        <span className="label mb-0">Tek elle kullanım (maç ekranındaki + butonları ve İleri)</span>
        <div className="grid grid-cols-2 gap-2">
          {[
            ['left', '🤚 Sol El'],
            ['right', 'Sağ El ✋'],
          ].map(([k, l]) => (
            <button key={k} onClick={() => set('hand', k)} className={`btn min-h-[52px] border-2 ${prefs.hand === k ? 'border-accent bg-accent text-accent-fg' : 'border-line bg-raised'}`}>
              {l}
            </button>
          ))}
        </div>
      </div>
      <label className="flex items-center justify-between gap-3">
        <span>
          <span className="block font-semibold">Maç ekranında ekranı uyanık tut</span>
          <span className="text-xs text-muted">{wakeOk ? 'Telefon maç sırasında kararmaz / kilitlenmez.' : 'Bu tarayıcı desteklemiyor – ayar etkisiz.'}</span>
        </span>
        <input type="checkbox" className="h-7 w-7 accent-[rgb(var(--accent))]" checked={prefs.keepAwake} onChange={(e) => set('keepAwake', e.target.checked)} />
      </label>
      <div className="grid grid-cols-2 gap-3">
        {[
          ['minorFoul', 'Minor Foul puanı'],
          ['majorFoul', 'Major Foul puanı'],
        ].map(([k, l]) => (
          <label key={k} className="grid gap-1 text-sm">
            <span className="text-muted">{l}</span>
            <input
              className="input"
              inputMode="numeric"
              value={prefs.scoring?.[k] ?? ''}
              onChange={(e) => setPrefs((p) => ({ ...p, scoring: { ...p.scoring, [k]: Number(e.target.value.replace(/\D/g, '')) || 0 } }))}
            />
          </label>
        ))}
      </div>
      <p className="-mt-2 text-xs text-muted">Ceza puanları Net Katkı hesabında kullanılır – kural kitabına göre güncelleyin.</p>
    </section>
  );
}
