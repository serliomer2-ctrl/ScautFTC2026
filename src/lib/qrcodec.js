/**
 * QR ile internetsiz veri aktarımı – kodlama
 * ------------------------------------------
 * Kayıt(lar) → anahtarlar kısaltılır (KEYMAP) → JSON → deflate-raw (CompressionStream) → base64url
 * → ~700 karakterlik parçalara bölünür. Her QR metni:
 *     BB1|<aktarımId>|<parçaNo>/<toplam>|<Z|J><veri>
 * Z = sıkıştırılmış, J = sıkıştırma desteklenmeyen tarayıcı için düz base64url.
 * Okuyucu parçaları aktarımId'ye göre toplar; hepsi gelince decodeTransfer() ile çözer.
 * Haritada olmayan (sonradan eklenen) alanlar olduğu gibi taşınır – ileriye dönük uyumlu.
 */
const KEYMAP = {
  id: 'i', kind: 'k', roomId: 'ro', scouter: 'sc', createdAt: 'ca', updatedAt: 'ua', schemaVersion: 'sv',
  match: 'm', teamNumber: 'tn', teamName: 'tm', matchNumber: 'mn', alliance: 'al', notes: 'no',
  robot: 'r', drivetrain: 'dt', drivetrainOther: 'do', intake: 'in', abilities: 'ab',
  hive: 'h', flower: 'f', nectar: 'ne', pollen: 'po', stealFlower: 'sf',
  auto: 'a', hasAuto: 'ha', performance: 'pe', success: 'su', odometry: 'od', vision: 'vi',
  startPosition: 'sp', routeCount: 'rc', pickupSource: 'ps', tipCount: 'tc', soloTip: 'st',
  teleop: 't', autoAim: 'aa', driverAssist: 'da', assistDescription: 'ad', driverRating: 'dr',
  carryCapacity: 'cc', accuracy: 'ac',
  endgame: 'e', flowerPlanned: 'fp', flowerResult: 'fr',
  tags: 'tg', cycles: 'cy', fieldMap: 'fm', start: 's0', shots: 'sh', x: 'x', y: 'y', p: 'p', z: 'z',
  pit: 'pt', driveMotors: 'dm', totalMotors: 'tmo', autoRoutes: 'ar', autoNotes: 'an',
  driverExperience: 'dx', photo: 'ph', team: 'te', number: 'nu', name: 'na',
};
const REVERSE = Object.fromEntries(Object.entries(KEYMAP).map(([k, v]) => [v, k]));
const PREFIX = 'BB1';
const CHUNK = 700;

function mapKeys(v, map) {
  if (Array.isArray(v)) return v.map((x) => mapKeys(x, map));
  if (v && typeof v === 'object') {
    const o = {};
    for (const [k, val] of Object.entries(v)) {
      if (k.startsWith('_')) continue; // _pending gibi yerel alanlar taşınmaz
      if (val === '' || val === undefined) continue; // boş metinler gereksiz yer kaplamasın
      o[map[k] ?? k] = mapKeys(val, map);
    }
    return o;
  }
  return v;
}

const toB64url = (bytes) => {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const fromB64url = (s) => {
  const b = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4));
  return Uint8Array.from(b, (c) => c.charCodeAt(0));
};

async function pipe(bytes, Stream) {
  const res = new Response(new Blob([bytes]).stream().pipeThrough(new Stream('deflate-raw')));
  return new Uint8Array(await res.arrayBuffer());
}
const canCompress = () => typeof CompressionStream !== 'undefined' && typeof DecompressionStream !== 'undefined';

/** Kayıt listesini QR metinlerine çevirir */
export async function encodeTransfer(records) {
  const json = JSON.stringify(records.map((r) => mapKeys(r, KEYMAP)));
  const raw = new TextEncoder().encode(json);
  const body = canCompress() ? 'Z' + toB64url(await pipe(raw, CompressionStream)) : 'J' + toB64url(raw);
  const tid = Math.random().toString(36).slice(2, 8);
  const parts = [];
  for (let i = 0; i < body.length; i += CHUNK) parts.push(body.slice(i, i + CHUNK));
  return parts.map((p, i) => `${PREFIX}|${tid}|${i + 1}/${parts.length}|${p}`);
}

/** Tek bir QR metnini ayrıştırır; uygulamaya ait değilse null */
export function parsePart(text) {
  const m = /^BB1\|([a-z0-9]+)\|(\d+)\/(\d+)\|(.*)$/s.exec(text || '');
  if (!m) return null;
  return { tid: m[1], index: +m[2], total: +m[3], data: m[4] };
}

/** Tüm parçalar toplanınca kayıt listesini döndürür */
export async function decodeTransfer(parts) {
  const body = [...parts].sort((a, b) => a.index - b.index).map((p) => p.data).join('');
  const bytes = fromB64url(body.slice(1));
  const raw = body[0] === 'Z' ? await pipe(bytes, DecompressionStream) : bytes;
  return JSON.parse(new TextDecoder().decode(raw)).map((r) => mapKeys(r, REVERSE));
}

/* ---------- Faz 4: QR'sız metin aktarımı için tek parça gövde (aynı sıkıştırma) ---------- */
/** Kayıtları tek bir sıkıştırılmış metin gövdesine çevirir ('Z…' veya 'J…') */
export async function encodeBlob(records) {
  const raw = new TextEncoder().encode(JSON.stringify(records.map((r) => mapKeys(r, KEYMAP))));
  return canCompress() ? 'Z' + toB64url(await pipe(raw, CompressionStream)) : 'J' + toB64url(raw);
}
/** encodeBlob çıktısını kayıt listesine geri çevirir */
export async function decodeBlob(body) {
  const bytes = fromB64url(body.slice(1));
  const raw = body[0] === 'Z' ? await pipe(bytes, DecompressionStream) : bytes;
  return JSON.parse(new TextDecoder().decode(raw)).map((r) => mapKeys(r, REVERSE));
}
