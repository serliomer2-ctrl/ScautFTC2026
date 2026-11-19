/**
 * Strateji / analiz hesapları – tümü saf fonksiyonlar.
 *
 * Puan modeli (bir takımın bir maçtaki tahmini puan katkısı):
 *   P = otoTip × S.autoTip + teleTip × S.teleTip + (EG Flower yaptı ? S.endFlower : 0)
 *       + (otonom Başarılı ? S.autoBonus : 0)
 * Maç tahmini: her takımın maç puanları ~ Normal(μ, σ²). İttifak = 2 takımın toplamı
 *   → μ_ittifak = μ1+μ2, σ²_ittifak = σ1²+σ2². Kazanma ihtimali = Φ((μK−μM)/√(σK²+σM²)).
 * Az veri olan takımlarda σ için temkinli bir varsayım kullanılır (aşırı emin tahmin olmasın).
 */
import { ABILITIES, labelOf } from '../schema.js';

export const mean = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0);
export const std = (a) => {
  if (a.length < 2) return 0;
  const m = mean(a);
  return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1));
};

/** "Q2" < "Q10" < "E1" gibi doğal sıralama */
const matchOrder = (m) => {
  const s = String(m).toUpperCase();
  const stage = s.startsWith('P') ? 0 : s.startsWith('Q') || /^\d/.test(s) ? 1 : 2; // pratik, eleme, playoff
  return stage * 1e6 + (parseInt(s.replace(/\D/g, ''), 10) || 0);
};

export function matchPoints(r, S) {
  const auto = r.auto.hasAuto ? r.auto.tipCount * S.autoTip + (r.auto.success === 'success' ? S.autoBonus : 0) : 0;
  const tele = r.teleop.tipCount * S.teleTip;
  const end = r.endgame.flowerResult === 'done' ? S.endFlower : 0;
  return { auto, tele, end, total: auto + tele + end };
}

const share = (rs, pred) => (rs.length ? rs.filter(pred).length / rs.length : 0);

export function teamStats(records, S) {
  const groups = new Map();
  for (const r of records) {
    const k = String(r.match.teamNumber);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(r);
  }
  const out = [];
  for (const [num, rs0] of groups) {
    const rs = [...rs0].sort((a, b) => matchOrder(a.match.matchNumber) - matchOrder(b.match.matchNumber));
    const pts = rs.map((r) => matchPoints(r, S));
    const totals = pts.map((p) => p.total);
    const latest = [...rs].sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''))[0];
    const tried = rs.filter((r) => ['done', 'failed'].includes(r.endgame.flowerResult));
    const ratings = rs.map((r) => r.teleop.driverRating).filter(Boolean);
    const m = mean(totals);
    out.push({
      num,
      name: rs.find((r) => r.match.teamName)?.match.teamName || '',
      n: rs.length,
      records: rs,
      perMatch: rs.map((r, i) => ({ match: r.match.matchNumber, ...pts[i], autoTip: r.auto.hasAuto ? r.auto.tipCount : 0, teleTip: r.teleop.tipCount, accuracy: r.teleop.accuracy })),
      points: m,
      // Az veride belirsizliği yüksek tut: en az ortalamanın %35'i + 5 puan
      sigma: rs.length >= 3 ? Math.max(std(totals), 2) : Math.max(std(totals), m * 0.35 + 5),
      autoTip: mean(rs.map((r) => (r.auto.hasAuto ? r.auto.tipCount : 0))),
      teleTip: mean(rs.map((r) => r.teleop.tipCount)),
      autoPts: mean(pts.map((p) => p.auto)),
      telePts: mean(pts.map((p) => p.tele)),
      endPts: mean(pts.map((p) => p.end)),
      accuracy: mean(rs.map((r) => r.teleop.accuracy)),
      carry: mean(rs.map((r) => r.teleop.carryCapacity)),
      driver: ratings.length ? mean(ratings) : null,
      autoRate: share(rs, (r) => r.auto.hasAuto),
      autoSuccess: share(rs, (r) => r.auto.success === 'success'),
      flowerRate: tried.length ? tried.filter((r) => r.endgame.flowerResult === 'done').length / tried.length : null,
      flowerPlanned: share(rs, (r) => r.endgame.flowerPlanned === true),
      abilities: Object.fromEntries(ABILITIES.map((a) => [a.key, share(rs, (r) => r.robot.abilities[a.key] === true)])),
      autoAim: share(rs, (r) => r.teleop.autoAim === true),
      pit: {
        drivetrain: latest.robot.drivetrain === 'other' ? latest.robot.drivetrainOther || 'Diğer' : labelOf('drivetrain', latest.robot.drivetrain),
        intake: labelOf('intake', latest.robot.intake),
        odometry: share(rs, (r) => r.auto.odometry === true),
        vision: share(rs, (r) => r.auto.vision === true),
        routes: Math.max(0, ...rs.map((r) => r.auto.routeCount || 0)),
        start: labelOf('startPosition', latest.auto.startPosition),
        pickup: labelOf('pickupSource', latest.auto.pickupSource),
      },
      notes: rs.flatMap((r) =>
        [
          r.match.notes && { kind: 'Not', text: r.match.notes },
          r.auto.performance && { kind: 'Otonom', text: r.auto.performance },
          r.teleop.assistDescription && { kind: 'Asistan', text: r.teleop.assistDescription },
        ]
          .filter(Boolean)
          .map((n) => ({ ...n, match: r.match.matchNumber, scouter: r.scouter })),
      ),
      trend: totals.length >= 3 ? mean(totals.slice(-2)) - mean(totals.slice(0, -2)) : 0,
    });
  }
  return out.sort((a, b) => b.points - a.points);
}

/* Standart normal kümülatif dağılım (Abramowitz–Stegun) */
export function phi(z) {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989423 * Math.exp((-z * z) / 2);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return z > 0 ? 1 - p : p;
}

export function predictMatch(red, blue) {
  const agg = (ts) => ({
    mu: ts.reduce((s, t) => s + t.points, 0),
    sigma: Math.sqrt(ts.reduce((s, t) => s + t.sigma ** 2, 0)),
    auto: ts.reduce((s, t) => s + t.autoPts, 0),
    tele: ts.reduce((s, t) => s + t.telePts, 0),
    end: ts.reduce((s, t) => s + t.endPts, 0),
  });
  const R = agg(red), B = agg(blue);
  const spread = Math.sqrt(R.sigma ** 2 + B.sigma ** 2) || 1;
  const pRed = phi((R.mu - B.mu) / spread);
  return { red: R, blue: B, pRed, pBlue: 1 - pRed, margin: R.mu - B.mu };
}

/**
 * İttifak partneri uyum puanı (0–100):
 *  %55 beklenen puan (alandaki en iyi takıma göre normalize)
 *  %20 tamamlayıcılık (benim zayıf olduğum rolleri o güçlü yapıyor mu)
 *  %15 tutarlılık (düşük varyasyon katsayısı)
 *  %10 sürücü puanı
 */
export function partnerRanking(stats, myNum) {
  const me = stats.find((t) => t.num === String(myNum));
  const others = stats.filter((t) => t.num !== String(myNum));
  const maxPts = Math.max(1, ...others.map((t) => t.points));
  const roles = (t) => ({
    'Otonom': t.autoRate * (0.5 + 0.5 * t.autoSuccess),
    'EG Flower': t.flowerRate ?? 0,
    'Hive': t.abilities.hive,
    'Flower': t.abilities.flower,
    'Nektar': t.abilities.nectar,
    'Polen': t.abilities.pollen,
    'Flower Çalma': t.abilities.stealFlower,
  });
  const mine = me ? roles(me) : null;
  return others
    .map((t) => {
      const theirs = roles(t);
      let comp = 0.5;
      const covers = [];
      if (mine) {
        const gaps = Object.keys(mine).filter((k) => mine[k] < 0.5);
        comp = gaps.length ? gaps.reduce((s, k) => s + theirs[k], 0) / gaps.length : 0.5;
        covers.push(...gaps.filter((k) => theirs[k] >= 0.5));
      }
      const cv = t.points > 0 ? t.sigma / t.points : 1;
      const consistency = Math.max(0, 1 - cv);
      const driver = (t.driver ?? 2.5) / 5;
      const score = 100 * (0.55 * (t.points / maxPts) + 0.2 * comp + 0.15 * consistency + 0.1 * driver);
      return {
        team: t,
        score,
        combined: (me?.points || 0) + t.points,
        covers,
        lowData: t.n < 2,
      };
    })
    .sort((a, b) => b.score - a.score);
}
