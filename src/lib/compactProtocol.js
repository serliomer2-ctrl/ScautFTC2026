/**
 * Ultra-kompakt maç QR protokolü (BZ2) – tek maç = tek, seyrek (kolay okunan) QR.
 *
 *   BZ2|i:<id>|u:<güncelleme>|s:<gözlemci>|t:<takım>|m:<maç>|al:r|a:...|tp:...|eg:...|tag:...|cy:...|fm:...
 *
 * Alanlar (boş / varsayılan olanlar hiç yazılmaz):
 *   i   kayıt id'si (UUID → 22 karakter base64url)        u,c  güncelleme/oluşturma zamanı (epoch sn, base36)
 *   si  gözlemci hesap id'si (Faz 6, görev ilerlemesi için)
 *   s   gözlemci   t takım no   n takım adı   m maç no   al ittifak r|b
 *   a   otonom: var,tip,başarı,başlangıç,kaynak,yardımsız,odometri,vision,rota
 *   tp  teleop: tip,taşıma,isabet,sürücü,otoHizalama,asistan
 *   eg  endgame: plan,sonuç          rb robot: şasi,intake,yetenekler(5 hane)
 *   tag etiketler (virgüllü)         cy döngüler (desisaniye, virgüllü)
 *   fm  saha: başlangıç ve skor noktaları "xx.yy" (0–99), skorlarda a|t son eki, ';' ayraçlı
 *   tl  telemetri: "<sn><kod>" virgüllü; kod a=oto skor, t=teleop skor, f=flower yaptı, x=flower yapamadı,
 *       m=küçük ceza, M=büyük ceza, G<etiket>
 *   fo  cezalar: küçük,büyük (Faz 5)
 *   no / pe / ad / do  notlar, otonom açıklaması, asistan açıklaması, diğer şasi (yalnız '%' '|' kaçışlı)
 * Üçlü (Evet/Hayır/boş) değerler 1 / 0 / boş; seçmeli alanlar tek harf kodla yazılır.
 */
import { emptyRecord } from '../schema.js';

const PREFIX = 'BZ2';
const CODES = {
  success: { success: 's', partial: 'p', fail: 'f' },
  start: { hive: 'h', flower: 'f', middle: 'm' },
  pickup: { garden: 'g', flower: 'f', both: 'b', none: 'n' },
  result: { done: 'd', failed: 'f', not_attempted: 'n' },
  drivetrain: { mecanum: 'm', tank: 't', swerve: 's', other: 'o' },
  intake: { internal: 'i', external: 'e' },
  alliance: { red: 'r', blue: 'b' },
};
const DECODE = Object.fromEntries(Object.entries(CODES).map(([k, m]) => [k, Object.fromEntries(Object.entries(m).map(([a, b]) => [b, a]))]));
const ABIL = ['hive', 'flower', 'nectar', 'pollen', 'stealFlower'];

const tri = (v) => (v === true ? '1' : v === false ? '0' : '');
const untri = (s) => (s === '1' ? true : s === '0' ? false : null);
const enc = (code, v) => (v == null ? '' : CODES[code][v] ?? '');
const dec = (code, s) => (s ? DECODE[code][s] ?? null : null);
const esc = (s) => String(s).replace(/%/g, '%25').replace(/\|/g, '%7C').replace(/\n/g, '%0A');
const unesc = (s) => s.replace(/%0A/g, '\n').replace(/%7C/g, '|').replace(/%25/g, '%');
const ts = (iso) => (iso ? Math.floor(new Date(iso).getTime() / 1000).toString(36) : '');
const unts = (s) => (s ? new Date(parseInt(s, 36) * 1000).toISOString() : null);
const trim = (arr) => {
  const a = [...arr];
  while (a.length && (a[a.length - 1] === '' || a[a.length - 1] === '0')) a.pop();
  return a.join(',');
};

function packId(id) {
  const hex = String(id).replace(/-/g, '');
  if (!/^[0-9a-f]{32}$/i.test(hex)) return '~' + esc(id);
  const bytes = hex.match(/../g).map((h) => parseInt(h, 16));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function unpackId(s) {
  if (s.startsWith('~')) return unesc(s.slice(1));
  const b = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==');
  const hex = [...b].map((c) => c.charCodeAt(0).toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

const pt = (p) => `${Math.min(99, Math.round(p.x * 100))}.${Math.min(99, Math.round(p.y * 100))}`;

/** Maç kaydı → tek QR metni */
export function encodeMatch(r) {
  const seg = [PREFIX, `i:${packId(r.id)}`];
  const put = (k, v) => v !== '' && v != null && seg.push(`${k}:${v}`);
  put('u', ts(r.updatedAt));
  if (r.createdAt && r.createdAt !== r.updatedAt) put('c', ts(r.createdAt));
  put('s', esc(r.scouter || ''));
  put('si', esc(r.scouterId || ''));
  put('t', r.match.teamNumber);
  put('n', esc(r.match.teamName || ''));
  put('m', esc(r.match.matchNumber));
  put('al', enc('alliance', r.match.alliance));
  const a = r.auto;
  put('a', trim([tri(a.hasAuto), a.tipCount || '', enc('success', a.success), enc('start', a.startPosition), enc('pickup', a.pickupSource), tri(a.soloTip), tri(a.odometry), tri(a.vision), a.routeCount || '']));
  const t = r.teleop;
  put('tp', trim([t.tipCount || '', t.carryCapacity || '', t.accuracy, t.driverRating || '', tri(t.autoAim), tri(t.driverAssist)]));
  put('eg', trim([tri(r.endgame.flowerPlanned), enc('result', r.endgame.flowerResult)]));
  const ab = ABIL.map((k) => tri(r.robot.abilities[k]) || '-').join('');
  put('rb', trim([enc('drivetrain', r.robot.drivetrain), enc('intake', r.robot.intake), ab === '-----' ? '' : ab]));
  put('tag', (r.tags || []).join(','));
  put('cy', (r.cycles || []).map((c) => Math.round(c * 10)).join(','));
  if (r.fieldMap && (r.fieldMap.start || r.fieldMap.shots?.length)) {
    put('fm', [r.fieldMap.start ? pt(r.fieldMap.start) : '', ...(r.fieldMap.shots || []).map((s) => pt(s) + s.p)].join(';'));
  }
  const TL = { auto_score: 'a', teleop_score: 't', flower_done: 'f', flower_fail: 'x', foul_minor: 'm', foul_major: 'M' };
  if (r.fouls && (r.fouls.minor || r.fouls.major)) put('fo', `${r.fouls.minor || 0},${r.fouls.major || 0}`);
  put('tl', (r.timeline || []).map((e) => `${e.t}${TL[e.a] || (e.a.startsWith('tag:') ? 'G' + e.a.slice(4) : '')}`).filter((x) => !/^[\d.]+$/.test(x)).join(','));
  put('no', esc(r.match.notes || ''));
  put('pe', esc(a.performance || ''));
  put('ad', esc(t.assistDescription || ''));
  put('do', esc(r.robot.drivetrainOther || ''));
  return seg.join('|');
}

export const isCompact = (text) => typeof text === 'string' && text.startsWith(PREFIX + '|');

/** QR metni → maç kaydı (eksik alanlar emptyRecord varsayılanları) */
export async function decodeMatch(text) {
  if (!isCompact(text)) throw new Error('BZ2 QR değil');
  const f = {};
  for (const part of text.split('|').slice(1)) {
    const i = part.indexOf(':');
    if (i > 0) f[part.slice(0, i)] = part.slice(i + 1);
  }
  if (!f.i || !f.t) throw new Error('QR verisi eksik');
  const { zoneAt } = await import('./field.js');
  const r = emptyRecord();
  r.id = unpackId(f.i);
  r.updatedAt = unts(f.u) || new Date().toISOString();
  r.createdAt = unts(f.c) || r.updatedAt;
  r.scouter = unesc(f.s || '');
  if (f.si) r.scouterId = unesc(f.si);
  Object.assign(r.match, { teamNumber: f.t, teamName: unesc(f.n || ''), matchNumber: unesc(f.m || ''), alliance: dec('alliance', f.al), notes: unesc(f.no || '') });
  const a = (f.a || '').split(',');
  Object.assign(r.auto, {
    hasAuto: untri(a[0]), tipCount: +a[1] || 0, success: dec('success', a[2]), startPosition: dec('start', a[3]),
    pickupSource: dec('pickup', a[4]), soloTip: untri(a[5]), odometry: untri(a[6]), vision: untri(a[7]),
    routeCount: +a[8] || 0, performance: unesc(f.pe || ''),
  });
  const t = (f.tp || '').split(',');
  Object.assign(r.teleop, {
    tipCount: +t[0] || 0, carryCapacity: +t[1] || 0, accuracy: t[2] === undefined || t[2] === '' ? 50 : +t[2],
    driverRating: +t[3] || 0, autoAim: untri(t[4]), driverAssist: untri(t[5]), assistDescription: unesc(f.ad || ''),
  });
  const e = (f.eg || '').split(',');
  Object.assign(r.endgame, { flowerPlanned: untri(e[0]), flowerResult: dec('result', e[1]) });
  const rb = (f.rb || '').split(',');
  r.robot.drivetrain = dec('drivetrain', rb[0]);
  r.robot.intake = dec('intake', rb[1]);
  r.robot.drivetrainOther = unesc(f.do || '');
  const bits = rb[2] || '-----';
  ABIL.forEach((k, i) => (r.robot.abilities[k] = untri(bits[i] === '-' ? '' : bits[i])));
  r.tags = f.tag ? f.tag.split(',') : [];
  r.cycles = f.cy ? f.cy.split(',').map((x) => +x / 10) : [];
  if (f.fo) {
    const [mi, ma] = f.fo.split(',').map(Number);
    r.fouls = { minor: mi || 0, major: ma || 0 };
  }
  if (f.tl) {
    const TL = { a: 'auto_score', t: 'teleop_score', f: 'flower_done', x: 'flower_fail', m: 'foul_minor', M: 'foul_major' };
    r.timeline = f.tl
      .split(',')
      .map((s) => /^(\d+(?:\.\d+)?)(G.+|[atfxmM])$/.exec(s))
      .filter(Boolean)
      .map(([, t, c]) => ({ t: +t, a: c[0] === 'G' ? `tag:${c.slice(1)}` : TL[c] }));
  }
  if (f.fm) {
    const [start, ...shots] = f.fm.split(';');
    const xy = (s) => {
      const [x, y] = s.replace(/[at]$/, '').split('.').map((n) => +n / 100);
      return { x, y, z: zoneAt(x, y) };
    };
    r.fieldMap = { start: start ? xy(start) : null, shots: shots.filter(Boolean).map((s) => ({ ...xy(s), p: s.endsWith('a') ? 'a' : 't' })) };
  }
  return r;
}
