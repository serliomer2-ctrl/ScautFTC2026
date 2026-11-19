import React, { useEffect, useRef, useState } from 'react';
import ScoutForm from './components/ScoutForm.jsx';
import { RecordList, TeamSummary } from './components/Records.jsx';
import { Toast } from './components/ui.jsx';
import { emptyRecord, validate } from './schema.js';
import {
  clearDraft, exportCSV, exportJSON, importJSONFile, loadDraft, loadPrefs,
  loadRecords, saveDraft, savePrefs, saveRecords,
} from './storage.js';

const THEMES = [
  { id: 'dark', label: '🌙 Koyu', meta: '#0f1115' },
  { id: 'light', label: '☀️ Açık', meta: '#f4f5f8' },
  { id: 'field', label: '⚡ Saha', meta: '#000000' },
];
const TABS = [
  { id: 'form', label: '📝 Gözlem' },
  { id: 'list', label: '📋 Kayıtlar' },
  { id: 'teams', label: '🏆 Takımlar' },
];

/** Kaydetmeden önce, gizlenen/pasif alanlardaki artık verileri temizler. */
function sanitize(rec) {
  const r = structuredClone(rec);
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

export default function App() {
  const [prefs, setPrefs] = useState(loadPrefs);
  const [records, setRecords] = useState(loadRecords);
  const [rec, setRec] = useState(() => loadDraft() || { ...emptyRecord(), scouter: prefs.scouter });
  const [errors, setErrors] = useState({});
  const [tab, setTab] = useState('form');
  const [filter, setFilter] = useState('');
  const [toast, setToast] = useState(null);
  const fileRef = useRef(null);
  const toastTimer = useRef(null);
  const isEditing = records.some((r) => r.id === rec.id);

  // Tema
  useEffect(() => {
    document.documentElement.dataset.theme = prefs.theme;
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = THEMES.find((t) => t.id === prefs.theme)?.meta || '#0f1115';
    savePrefs(prefs);
  }, [prefs]);

  // Kalıcılık: kayıtlar + yarım kalan form (sayfa yenilense / telefon kilitlense de kaybolmaz)
  useEffect(() => {
    if (!saveRecords(records)) flash('Depolama dolu! Lütfen dışa aktarın.', 'error');
  }, [records]);
  useEffect(() => {
    saveDraft(rec);
  }, [rec]);

  function flash(text, type = 'ok') {
    setToast({ text, type });
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2200);
  }

  function update(section, key, value) {
    setRec((prev) => (section ? { ...prev, [section]: { ...prev[section], [key]: value } } : { ...prev, [key]: value }));
    if (errors[key]) setErrors((e) => ({ ...e, [key]: undefined }));
  }

  function newForm(keep = rec) {
    clearDraft();
    setRec({ ...emptyRecord(), scouter: keep.scouter });
    setErrors({});
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function save() {
    const errs = validate(rec);
    setErrors(errs);
    if (Object.keys(errs).length) {
      flash(Object.values(errs)[0], 'error');
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    const now = new Date().toISOString();
    const clean = { ...sanitize(rec), createdAt: rec.createdAt || now, updatedAt: now };

    // Aynı takım + aynı maç zaten kayıtlıysa üzerine yazmayı sor
    const dup = records.find(
      (r) => r.id !== clean.id && String(r.match.teamNumber) === String(clean.match.teamNumber) &&
        String(r.match.matchNumber) === String(clean.match.matchNumber),
    );
    if (dup && !confirm(`#${clean.match.teamNumber} için ${clean.match.matchNumber} maçı zaten kayıtlı. Üzerine yazılsın mı?`)) return;

    setRecords((list) => {
      const rest = list.filter((r) => r.id !== clean.id && r.id !== dup?.id);
      return [...rest, clean];
    });
    if (rec.scouter !== prefs.scouter) setPrefs((p) => ({ ...p, scouter: rec.scouter }));
    flash(isEditing ? 'Kayıt güncellendi ✓' : `#${clean.match.teamNumber} kaydedildi ✓`);
    newForm(clean);
  }

  function edit(r) {
    setRec(structuredClone(r));
    setErrors({});
    setTab('form');
    window.scrollTo({ top: 0 });
  }

  function remove(r) {
    if (!confirm(`#${r.match.teamNumber} – Maç ${r.match.matchNumber} silinsin mi?`)) return;
    setRecords((list) => list.filter((x) => x.id !== r.id));
    flash('Kayıt silindi');
  }

  async function onImport(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const incoming = await importJSONFile(file);
      // id'ye göre birleştir: aynı id varsa yenisi kazanır (birden çok gözlemcinin verisini toplamak için)
      setRecords((list) => {
        const map = new Map(list.map((r) => [r.id, r]));
        incoming.forEach((r) => map.set(r.id, r));
        return [...map.values()];
      });
      flash(`${incoming.length} kayıt içe aktarıldı`);
    } catch {
      flash('Geçersiz JSON dosyası', 'error');
    }
  }

  const cycleTheme = () =>
    setPrefs((p) => ({ ...p, theme: THEMES[(THEMES.findIndex((t) => t.id === p.theme) + 1) % THEMES.length].id }));

  return (
    <div className="mx-auto min-h-screen max-w-3xl px-4 pb-32">
      <Toast toast={toast} />

      {/* Üst bar */}
      <header className="sticky top-0 z-30 -mx-4 border-b border-line bg-bg/95 px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] backdrop-blur">
        <div className="flex items-center gap-3">
          <span className="text-3xl" aria-hidden>🐝</span>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-lg font-extrabold leading-tight sm:text-xl">Biobuzz Scout</h1>
            <p className="text-xs text-muted">FTC 2026 · {records.length} kayıt</p>
          </div>
          <button className="btn-ghost min-h-[44px] px-3 text-sm" onClick={cycleTheme} title="Tema değiştir">
            {THEMES.find((t) => t.id === prefs.theme)?.label}
          </button>
        </div>
        <nav className="mt-3 grid grid-cols-3 gap-2">
          {TABS.map((t) => (
            <button
              key={t.id}
              className={`btn min-h-[44px] border-2 text-sm sm:text-base ${tab === t.id ? 'border-accent bg-accent text-accent-fg' : 'border-line bg-surface'}`}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </header>

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
              <span className="label mb-0">Veri Aktarımı</span>
              <div className="grid grid-cols-3 gap-2">
                <button className="btn-primary" onClick={() => exportCSV(records)} disabled={!records.length}>⬇ CSV</button>
                <button className="btn-ghost" onClick={() => exportJSON(records)} disabled={!records.length}>⬇ JSON</button>
                <button className="btn-ghost" onClick={() => fileRef.current?.click()}>⬆ İçe Al</button>
              </div>
              <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={onImport} />
              <p className="text-xs text-muted">
                CSV → Excel / Google Sheets. JSON → yedek ya da başka gözlemcilerin verisini birleştirme.
              </p>
            </div>
            <RecordList records={records} onEdit={edit} onDelete={remove} filter={filter} setFilter={setFilter} />
          </div>
        )}

        {tab === 'teams' && (
          <TeamSummary
            records={records}
            onPickTeam={(num) => {
              setFilter(num);
              setTab('list');
            }}
          />
        )}
      </main>

      {/* Alt sabit kaydet çubuğu */}
      {tab === 'form' && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-bg/95 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur">
          <div className="mx-auto grid max-w-3xl grid-cols-[1fr_2fr] gap-3">
            <button
              className="btn-ghost min-h-[56px]"
              onClick={() => confirm('Form temizlensin mi?') && newForm()}
            >
              Temizle
            </button>
            <button className="btn-primary min-h-[56px] text-lg" onClick={save}>
              {isEditing ? '💾 Güncelle' : '💾 Kaydet'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
