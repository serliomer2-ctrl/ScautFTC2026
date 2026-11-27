/**
 * İttifak Sinerji Motoru
 * ----------------------
 * Her takımın saha haritası kayıtlarından (fieldMap) bir "bölge profili" çıkarır ve iki takımın
 * aynı dar bölgede mi (çakışma) yoksa birbirini tamamlayan bölgelerde mi (sinerji) çalıştığını söyler.
 *
 * - Bölge türü, field.js'teki ETİKETTEN çıkarılır (Hive / Loading / Garden / Flower). Böylece
 *   etiketler değişince analiz de kendiliğinden güncellenir; kayıtlarda saklanan id'ler sabit kalır.
 * - Saha 180° döndürmeye göre simetrik kabul edilir: Mavi ittifak kayıtları (x,y) → (1-x, 1-y)
 *   ile Kırmızı bakış açısına çevrilir; böylece iki ittifaktaki maçlar aynı koordinatta karşılaştırılır.
 *   "Sol / Sağ" = Kırmızı sürücü duvarından bakış.
 * - Harita verisi azsa otonom başlangıç konumu (Hive/Flower/Orta) ve top kaynağı gibi
 *   kategorik alanlara düşülür.
 */
import { ZONE_LABEL } from './field.js';
import { labelOf } from '../schema.js';

export function kindOf(zoneId) {
  const l = (ZONE_LABEL[zoneId] || '').toLowerCase();
  if (l.includes('hive')) return 'hive';
  if (l.includes('loading') || l.includes('yükleme')) return 'loading';
  if (l.includes('garden')) return 'garden';
  if (l.includes('flower')) return 'flower';
  return zoneId ? 'other' : null;
}
export const KIND_LABEL = { hive: 'Hive', loading: 'Loading Zone', garden: 'Garden', flower: 'Flower', other: 'Diğer' };

const norm = (p, alliance) => (alliance === 'blue' ? { x: 1 - p.x, y: 1 - p.y } : { x: p.x, y: p.y });
const majority = (arr) => {
  const c = {};
  arr.filter(Boolean).forEach((v) => (c[v] = (c[v] || 0) + 1));
  const best = Object.entries(c).sort((a, b) => b[1] - a[1])[0];
  return best ? { value: best[0], share: best[1] / arr.filter(Boolean).length } : null;
};

/** Takımın bölge profili (records: o takımın maç kayıtları) */
export function zoneProfile(records) {
  const shots = [];
  const starts = [];
  for (const r of records) {
    const fm = r.fieldMap;
    if (!fm) continue;
    if (fm.start) starts.push(norm(fm.start, r.match.alliance));
    for (const s of fm.shots || []) shots.push({ ...norm(s, r.match.alliance), kind: kindOf(s.z), p: s.p });
  }
  const kinds = {};
  shots.forEach((s) => s.kind && (kinds[s.kind] = (kinds[s.kind] || 0) + 1));
  const dominant = Object.entries(kinds).sort((a, b) => b[1] - a[1])[0];
  const centroid = shots.length ? { x: shots.reduce((a, s) => a + s.x, 0) / shots.length, y: shots.reduce((a, s) => a + s.y, 0) / shots.length } : null;
  const startSide = majority(starts.map((p) => (p.x < 0.5 ? 'sol' : 'sağ')));
  return {
    shots: shots.length,
    kinds,
    dominant: dominant ? { kind: dominant[0], share: dominant[1] / shots.length } : null,
    centroid,
    side: centroid ? (centroid.x < 0.5 ? 'sol' : 'sağ') : null,
    startSide: startSide?.value || null,
    startPos: majority(records.map((r) => r.auto.startPosition))?.value || null,
    pickup: majority(records.map((r) => r.auto.pickupSource))?.value || null,
  };
}

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

/**
 * İki takımın sinerjisi.
 * @returns {{ level: 'conflict'|'synergy'|'neutral', score: number, reasons: string[], penalty: number }}
 *   penalty: çakışma nedeniyle beklenen ittifak puanından düşülecek oran (küçük olan katkıya uygulanır)
 */
export function pairSynergy(ta, tb) {
  const A = zoneProfile(ta.records);
  const B = zoneProfile(tb.records);
  const reasons = [];
  let score = 50;
  let penalty = 0;
  let conflict = false;
  let synergy = false;

  if (A.shots >= 3 && B.shots >= 3 && A.dominant && B.dominant) {
    const d = dist(A.centroid, B.centroid);
    if (A.dominant.kind === B.dominant.kind && d < 0.22) {
      conflict = true;
      score -= 30;
      penalty += 0.12;
      reasons.push(`İkisi de ağırlıkla ${KIND_LABEL[A.dominant.kind]} bölgesinde ve aynı ${A.side} tarafta skor yapıyor`);
    } else if (A.dominant.kind !== B.dominant.kind) {
      synergy = true;
      score += 25;
      reasons.push(`Farklı hedefler: #${ta.num} ${KIND_LABEL[A.dominant.kind]}, #${tb.num} ${KIND_LABEL[B.dominant.kind]}`);
    } else if (d > 0.35) {
      synergy = true;
      score += 15;
      reasons.push(`Aynı hedef (${KIND_LABEL[A.dominant.kind]}) ama farklı taraflardan: #${ta.num} ${A.side}, #${tb.num} ${B.side}`);
    }
  }

  if (A.startSide && B.startSide) {
    if (A.startSide === B.startSide) {
      conflict = true;
      score -= 15;
      penalty += 0.05;
      reasons.push(`Otonom başlangıcı çakışıyor: ikisi de ${A.startSide} taraftan başlıyor`);
    } else {
      score += 10;
      reasons.push(`Otonom başlangıçları ayrık (${A.startSide} / ${B.startSide})`);
    }
  } else if (A.startPos && B.startPos) {
    if (A.startPos === B.startPos) {
      score -= 10;
      penalty += 0.03;
      reasons.push(`İkisi de otonoma ${labelOf('startPosition', A.startPos)} konumundan başlıyor`);
    } else score += 5;
  }

  // Dönem uzmanlığı tamamlayıcılığı (biri otonomda, diğeri endgame'de güçlüyse iyi)
  const strong = (t) => ['autoPts', 'telePts', 'endPts'].sort((x, y) => t[y] - t[x])[0];
  if (ta.n && tb.n && strong(ta) !== strong(tb)) {
    score += 10;
    reasons.push('Güçlü oldukları dönemler farklı (iş bölümü kolay)');
  }

  if (A.shots < 3 || B.shots < 3) reasons.push('Saha haritası verisi az – analiz kısmi');
  score = Math.max(0, Math.min(100, score));
  return { level: conflict ? 'conflict' : synergy || score >= 70 ? 'synergy' : 'neutral', score, reasons, penalty, A, B };
}
