/** Pit (garaj) verisinin Excel uyumlu CSV dışa aktarımı – maç CSV'si (storage.js) değişmeden kalır */
import { labelOf } from '../schema.js';

const yn = (v) => (v === true ? 'Evet' : v === false ? 'Hayır' : '');
const EXP = { rookie: 'İlk sezon', '1-2': '1–2 sezon', '3+': '3+ sezon' };
const cell = (v) => {
  const s = v == null ? '' : String(v);
  return /[",;\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

const COLUMNS = [
  ['Takım No', (r) => r.team.number],
  ['Takım Adı', (r) => r.team.name],
  ['Şasi', (r) => (r.pit.drivetrain === 'other' ? `Diğer: ${r.pit.drivetrainOther}` : labelOf('drivetrain', r.pit.drivetrain))],
  ['Intake', (r) => labelOf('intake', r.pit.intake)],
  ['Sürüş Motoru', (r) => r.pit.driveMotors],
  ['Toplam Motor', (r) => r.pit.totalMotors],
  ['Odometri', (r) => yn(r.pit.odometry)],
  ['Vision', (r) => yn(r.pit.vision)],
  ['Otonom Rota Sayısı', (r) => r.pit.autoRoutes],
  ['Otonom Rotaları', (r) => r.pit.autoNotes],
  ['Sürücü Deneyimi', (r) => EXP[r.pit.driverExperience] || ''],
  ['Fotoğraf', (r) => (r.pit.photo ? 'Var' : '')],
  ['Notlar', (r) => r.pit.notes],
  ['Gözlemci', (r) => r.scouter],
  ['Kayıt Zamanı', (r) => r.updatedAt],
];

export function exportPitCSV(pits) {
  const csv = [COLUMNS.map(([h]) => cell(h)).join(','), ...pits.map((r) => COLUMNS.map(([, f]) => cell(f(r))).join(','))].join('\r\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `biobuzz-pit-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
