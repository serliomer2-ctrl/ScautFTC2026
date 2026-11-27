/**
 * Çift Gözlem Doğrulama Motoru
 * ----------------------------
 * Aynı maçta aynı takımı birden fazla gözlemci izlediyse (matchNumber + teamNumber eşleşmesi,
 * farklı kayıt id'leri) kayıtlar karşılaştırılır:
 *   uyum ≥ %90  → "verified"  (Doğrulanmış Veri – yeşil tik)
 *   uyum < %90  → "anomaly"   (Veri Uyuşmazlığı – Master yöneticisi karar verir)
 * Uyum = 0.7 × puan uyumu + 0.3 × kategorik alan uyumu.
 *   puan uyumu    = 1 − |PA − PB| / max(PA, PB, 10)    (mevcut puan modeline göre)
 *   kategorik     = otonom var mı, otonom sonucu, End Game sonucu, ceza sayıları eşleşme oranı
 * Analizlerde (takım istatistikleri) her grup TEK kayıt olarak sayılır: çift saymayı önlemek için
 * henüz karar verilmemiş gruplarda kayıtların ortalaması kullanılır.
 */
import { matchPoints } from './analytics.js';
import { foulsOf } from './penalties.js';

const key = (r) => `${String(r.match.teamNumber)}|${String(r.match.matchNumber).toUpperCase()}`;

export function agreement(a, b, S) {
  const pa = matchPoints(a, S).total;
  const pb = matchPoints(b, S).total;
  const pts = 1 - Math.abs(pa - pb) / Math.max(pa, pb, 10);
  const fa = foulsOf(a);
  const fb = foulsOf(b);
  const cats = [
    a.auto.hasAuto === b.auto.hasAuto,
    (a.auto.success || null) === (b.auto.success || null),
    (a.endgame.flowerResult || null) === (b.endgame.flowerResult || null),
    fa.minor === fb.minor && fa.major === fb.major,
  ];
  const cat = cats.filter(Boolean).length / cats.length;
  return { score: Math.max(0, 0.7 * pts + 0.3 * cat), pa, pb };
}

/** Grupları bulur. Döner: { groups: [{key, records, status, score}], byId: Map(id → grup) } */
export function findGroups(records, S) {
  const m = new Map();
  for (const r of records) {
    if (!r.match?.teamNumber || !r.match?.matchNumber) continue;
    const k = key(r);
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(r);
  }
  const groups = [];
  for (const [k, rs] of m) {
    if (rs.length < 2) continue;
    // Çoklu kayıtta en düşük ikili uyum belirleyici
    let worst = 1;
    for (let i = 0; i < rs.length; i++) for (let j = i + 1; j < rs.length; j++) worst = Math.min(worst, agreement(rs[i], rs[j], S).score);
    groups.push({ key: k, team: rs[0].match.teamNumber, match: rs[0].match.matchNumber, records: rs, score: worst, status: worst >= 0.9 ? 'verified' : 'anomaly' });
  }
  return groups.sort((a, b) => (a.status === b.status ? a.score - b.score : a.status === 'anomaly' ? -1 : 1));
}

const avg = (xs) => xs.reduce((s, x) => s + x, 0) / xs.length;
const mode = (xs) => {
  const c = {};
  xs.forEach((x) => (c[x] = (c[x] || 0) + 1));
  return Object.entries(c).sort((a, b) => b[1] - a[1])[0]?.[0];
};
const typed = (v) => (v === 'true' ? true : v === 'false' ? false : v === 'null' || v === undefined ? null : v);

/** Kayıtların ortalamasını tek kayıt olarak üretir (sayısal alanlar ortalama, seçmeli alanlar çoğunluk) */
export function averageRecords(rs) {
  const [a] = rs;
  const pick = (f) => typed(mode(rs.map((r) => String(f(r)))));
  const out = structuredClone(a);
  delete out._pending;
  out.auto.tipCount = Math.round(avg(rs.map((r) => r.auto.tipCount)) * 10) / 10;
  out.teleop.tipCount = Math.round(avg(rs.map((r) => r.teleop.tipCount)) * 10) / 10;
  out.teleop.accuracy = Math.round(avg(rs.map((r) => r.teleop.accuracy)));
  out.teleop.carryCapacity = Math.round(avg(rs.map((r) => r.teleop.carryCapacity)) * 10) / 10;
  const ratings = rs.map((r) => r.teleop.driverRating).filter(Boolean);
  out.teleop.driverRating = ratings.length ? Math.round(avg(ratings)) : 0;
  out.auto.hasAuto = pick((r) => r.auto.hasAuto);
  out.auto.success = pick((r) => r.auto.success);
  out.endgame.flowerResult = pick((r) => r.endgame.flowerResult);
  out.endgame.flowerPlanned = pick((r) => r.endgame.flowerPlanned);
  const fs = rs.map(foulsOf);
  out.fouls = { minor: Math.round(avg(fs.map((f) => f.minor)) * 10) / 10, major: Math.round(avg(fs.map((f) => f.major)) * 10) / 10 };
  out.tags = [...new Set(rs.flatMap((r) => r.tags || []))];
  out.cycles = rs.flatMap((r) => r.cycles || []);
  out.match.notes = rs.map((r) => r.match.notes && `${r.scouter}: ${r.match.notes}`).filter(Boolean).join(' | ');
  out.scouter = [...new Set(rs.map((r) => r.scouter))].join(' + ');
  return out;
}

/**
 * Analiz için çift sayımı önlenmiş kayıt listesi.
 * Grup dışındaki kayıtlar aynen; gruplar tek (ortalama) kayıt olarak, `_consensus` işaretiyle döner.
 */
export function resolvedForStats(records, S) {
  const groups = findGroups(records, S);
  if (!groups.length) return { records, groups };
  const inGroup = new Set(groups.flatMap((g) => g.records.map((r) => r.id)));
  const merged = groups.map((g) => ({ ...averageRecords(g.records), _consensus: g.status }));
  return { records: [...records.filter((r) => !inGroup.has(r.id)), ...merged], groups };
}
