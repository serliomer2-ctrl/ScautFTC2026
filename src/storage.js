import { CSV_COLUMNS, migrate } from './schema.js';

const KEYS = { records: 'biobuzz.records.v1', draft: 'biobuzz.draft.v1', prefs: 'biobuzz.prefs.v1' };

function read(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}
function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false; // kota dolu / gizli sekme
  }
}

export const loadRecords = () => read(KEYS.records, []).map(migrate);
export const saveRecords = (list) => write(KEYS.records, list);
export const loadDraft = () => {
  const d = read(KEYS.draft, null);
  return d ? migrate(d) : null;
};
export const saveDraft = (d) => write(KEYS.draft, d);
export const clearDraft = () => {
  try { localStorage.removeItem(KEYS.draft); } catch { /* yok say */ }
};
export const loadPrefs = () => read(KEYS.prefs, { theme: 'dark', scouter: '' });
export const savePrefs = (p) => write(KEYS.prefs, p);

/* ---------- Dışa / içe aktarma ---------- */
const stamp = () => new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');

function download(filename, content, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function exportJSON(records) {
  download(`biobuzz-scout-${stamp()}.json`, JSON.stringify(records, null, 2), 'application/json');
}

const csvCell = (v) => {
  const s = v == null ? '' : String(v);
  return /[",;\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function toCSV(records) {
  const header = CSV_COLUMNS.map(([h]) => csvCell(h)).join(',');
  const rows = records.map((r) => CSV_COLUMNS.map(([, get]) => csvCell(get(r))).join(','));
  return [header, ...rows].join('\r\n');
}

export function exportCSV(records) {
  // BOM: Excel'in Türkçe karakterleri (ş, ğ, ı) doğru açması için
  download(`biobuzz-scout-${stamp()}.csv`, '﻿' + toCSV(records), 'text/csv;charset=utf-8');
}

/** JSON dosyasını okuyup kayıt dizisi döndürür (tek kayıt ya da dizi kabul eder). */
export async function importJSONFile(file) {
  const data = JSON.parse(await file.text());
  const list = Array.isArray(data) ? data : [data];
  return list.filter((r) => r && r.match).map(migrate);
}
