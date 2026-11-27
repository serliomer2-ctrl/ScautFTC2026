/**
 * Ceza takibi ve Net Katkı Puanı
 *   Kayıt alanı (Faz 5): rec.fouls = { minor: n, major: n }   (eski kayıtlarda yok)
 *   Eski kayıt + "Ceza Aldı" etiketi → 1 küçük ceza kabul edilir; ikisi de yoksa 0.
 *   Net Katkı = brüt ortalama puan (mevcut puan modeli) − rakibe kazandırılan ortalama ceza puanı.
 *   Yüksek Ceza Riski: maç başı ≥ 10 ceza puanı VEYA maçların ≥ %30'unda büyük ceza.
 */
/** Varsayılan ceza puanları (config.js DEFAULT_SCORING ile aynı; kayıtlı modelde yoksa kullanılır) */
const DEF = { minorFoul: 5, majorFoul: 15 };

export function foulsOf(r) {
  if (r.fouls) return { minor: r.fouls.minor || 0, major: r.fouls.major || 0 };
  if ((r.tags || []).includes('penalty')) return { minor: 1, major: 0 }; // eski kayıt: sayı bilinmiyor
  return { minor: 0, major: 0 };
}

export function teamPenalty(t, S) {
  const minorPts = S?.minorFoul ?? DEF.minorFoul;
  const majorPts = S?.majorFoul ?? DEF.majorFoul;
  const rs = t.records || [];
  if (!rs.length) return { given: 0, net: t.points, minor: 0, major: 0, risk: false, majorRate: 0 };
  const f = rs.map(foulsOf);
  const minor = f.reduce((s, x) => s + x.minor, 0) / rs.length;
  const major = f.reduce((s, x) => s + x.major, 0) / rs.length;
  const given = minor * minorPts + major * majorPts;
  const majorRate = f.filter((x) => x.major > 0).length / rs.length;
  return { given, net: t.points - given, minor, major, majorRate, risk: given >= 10 || majorRate >= 0.3 };
}
