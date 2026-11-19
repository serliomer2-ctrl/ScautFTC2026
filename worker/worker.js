/**
 * Biobuzz Scout – Cloudflare Worker (senkronizasyon ara sunucusu)
 * ================================================================
 * GitHub anahtarı SADECE burada, Cloudflare'in şifreli "Secret" alanında durur.
 * Uygulama anahtarı hiç görmez; bu Worker'a iki istek atar:
 *
 *   GET  /data            → { data }            scouting_data.json'un güncel hali
 *   POST /sync  {ops:[]}  → { data, applied }   işlemleri birleştirip depoya yazar
 *
 * Güvenlik: Worker dosyanın üzerine körü körüne yazmaz. Her işlemi doğrular ve sunucuda
 * birleştirir (id bazlı, yeni updatedAt kazanır, var olan oda asla ezilmez). Yani adresi
 * bilen biri dosyayı silemez/boşaltamaz; en fazla kayıt ekleyebilir. Ayrıca yalnızca
 * ALLOWED_ORIGIN'den (GitHub Pages sitesi) gelen tarayıcı isteklerine izin verilir.
 *
 * Cloudflare'de tanımlanacak değişkenler (Settings → Variables and Secrets):
 *   GITHUB_TOKEN    (Secret)  fine-grained token, veri deposunda Contents: Read and write
 *   DATA_OWNER      (Text)    örn. serliomer2-ctrl
 *   DATA_REPO       (Text)    örn. ScautFTC2026-data
 *   DATA_PATH       (Text)    isteğe bağlı, varsayılan scouting_data.json
 *   DATA_BRANCH     (Text)    isteğe bağlı, boş = varsayılan dal
 *   ALLOWED_ORIGIN  (Text)    örn. https://serliomer2-ctrl.github.io  (virgülle birden fazla)
 */

const MAX_OPS = 200;
const MAX_ITEM_BYTES = 32 * 1024;
const MAX_FILE_BYTES = 50 * 1024 * 1024;
const ROOM_ID = /^(pub|prv):[a-z0-9-]{1,48}$/;

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const allowed = (env.ALLOWED_ORIGIN || '').split(',').map((s) => s.trim()).filter(Boolean);
    const originOk = !allowed.length || allowed.includes(origin) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
    const cors = {
      'Access-Control-Allow-Origin': originOk && origin ? origin : allowed[0] || '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400',
      Vary: 'Origin',
    };
    const json = (body, status = 200) =>
      new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (origin && !originOk) return json({ error: 'Bu siteden erişime izin yok' }, 403);
    if (!env.GITHUB_TOKEN || !env.DATA_OWNER || !env.DATA_REPO) return json({ error: 'Worker ayarları eksik (GITHUB_TOKEN / DATA_OWNER / DATA_REPO)' }, 500);

    const url = new URL(request.url);
    try {
      if (request.method === 'GET' && url.pathname === '/data') {
        const { data } = await getFile(env);
        return json({ data: normalize(data) });
      }
      if (request.method === 'POST' && url.pathname === '/sync') {
        const body = await request.json().catch(() => null);
        const ops = validateOps(body?.ops);
        const result = await commit(env, ops);
        return json(result);
      }
      if (url.pathname === '/' || url.pathname === '/health') return json({ ok: true, app: 'biobuzz-scout-sync' });
      return json({ error: 'Bulunamadı' }, 404);
    } catch (e) {
      return json({ error: e.message || String(e) }, e.status || 500);
    }
  },
};

/* ------------------------------ doğrulama ------------------------------ */
class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
const isStr = (v, max = 200) => typeof v === 'string' && v.length > 0 && v.length <= max;

function validateOps(ops) {
  if (!Array.isArray(ops) || !ops.length) throw new HttpError(400, 'ops boş');
  if (ops.length > MAX_OPS) throw new HttpError(413, `Tek seferde en fazla ${MAX_OPS} işlem`);
  return ops.map((op) => {
    if (op?.type === 'room') {
      const r = op.room;
      if (!r || !ROOM_ID.test(r.id) || !isStr(r.name, 80) || !['public', 'private'].includes(r.type)) throw new HttpError(400, 'Geçersiz oda');
      if ((r.type === 'private') !== r.id.startsWith('prv:')) throw new HttpError(400, 'Oda tipi uyuşmuyor');
      if (r.type === 'private' && (!r.kdf?.salt || !r.verifier?.ct)) throw new HttpError(400, 'Özel oda anahtar bilgisi eksik');
      if (JSON.stringify(r).length > 4096) throw new HttpError(413, 'Oda verisi çok büyük');
      return { type: 'room', room: r };
    }
    if (op?.type === 'record') {
      const it = op.item;
      if (!ROOM_ID.test(op.roomId) || !it || !isStr(it.id, 64) || !isStr(it.updatedAt, 40)) throw new HttpError(400, 'Geçersiz kayıt');
      if (JSON.stringify(it).length > MAX_ITEM_BYTES) throw new HttpError(413, 'Kayıt çok büyük');
      if (op.roomId.startsWith('prv:') && !it.enc) throw new HttpError(400, 'Özel oda kaydı şifreli olmalı');
      return { type: 'record', roomId: op.roomId, item: it };
    }
    throw new HttpError(400, 'Bilinmeyen işlem tipi');
  });
}

/* ------------------------------ birleştirme ------------------------------ */
const emptyDB = () => ({ schemaVersion: 2, app: 'ftc-biobuzz-2026', updatedAt: null, rooms: {}, records: {} });
const normalize = (d) => ({ ...emptyDB(), ...(d || {}), rooms: { ...(d?.rooms || {}) }, records: { ...(d?.records || {}) } });

function applyOps(db, ops) {
  const next = normalize(structuredClone(db));
  let applied = 0;
  for (const op of ops) {
    if (op.type === 'room') {
      if (!next.rooms[op.room.id]) {
        next.rooms[op.room.id] = op.room;
        applied++;
      }
      next.records[op.room.id] ||= [];
    } else {
      if (!next.rooms[op.roomId]) continue; // var olmayan odaya kayıt yazılamaz
      const arr = (next.records[op.roomId] ||= []);
      const i = arr.findIndex((r) => r.id === op.item.id);
      if (i < 0) arr.push(op.item), applied++;
      else if (op.item.updatedAt > (arr[i].updatedAt || '')) (arr[i] = op.item), applied++;
    }
  }
  return { next, applied };
}

/* ------------------------------ GitHub ------------------------------ */
const gh = (env, path, init = {}) =>
  fetch(`https://api.github.com/repos/${env.DATA_OWNER}/${env.DATA_REPO}${path}`, {
    ...init,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${env.GITHUB_TOKEN}`,
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'biobuzz-scout-worker',
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
    },
  });
const filePath = (env) => (env.DATA_PATH || 'scouting_data.json').split('/').map(encodeURIComponent).join('/');

function b64ToUtf8(b64) {
  const bin = atob(b64.replace(/\s/g, ''));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}
function utf8ToB64(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

async function ghFail(res) {
  const msg = (await res.json().catch(() => ({}))).message || res.statusText;
  throw new HttpError(502, `GitHub ${res.status}: ${msg}`);
}

async function getFile(env) {
  const q = env.DATA_BRANCH ? `?ref=${encodeURIComponent(env.DATA_BRANCH)}` : '';
  const res = await gh(env, `/contents/${filePath(env)}${q}`, { cf: { cacheTtl: 0 } });
  if (res.status === 404) return { data: null, sha: null };
  if (!res.ok) await ghFail(res);
  const j = await res.json();
  let b64 = j.content;
  if (!b64 && j.size > 0) {
    const br = await gh(env, `/git/blobs/${j.sha}`);
    if (!br.ok) await ghFail(br);
    b64 = (await br.json()).content;
  }
  const text = b64 ? b64ToUtf8(b64) : '';
  return { data: text.trim() ? JSON.parse(text) : null, sha: j.sha };
}

/** Optimistic concurrency: oku(sha) → birleştir → sha ile yaz; 409 ise tekrar */
async function commit(env, ops) {
  for (let attempt = 1; attempt <= 8; attempt++) {
    const { data, sha } = await getFile(env);
    const { next, applied } = applyOps(normalize(data), ops);
    if (!applied) return { data: next, applied: 0 };
    next.updatedAt = new Date().toISOString();
    const content = JSON.stringify(next, null, 2) + '\n';
    if (content.length > MAX_FILE_BYTES) throw new HttpError(507, 'Veri dosyası boyut sınırına ulaştı');
    const scouters = [...new Set(ops.map((o) => o.item?.scouter || o.room?.createdBy).filter((s) => typeof s === 'string'))].slice(0, 5);
    const res = await gh(env, `/contents/${filePath(env)}`, {
      method: 'PUT',
      body: JSON.stringify({
        message: `scout: ${applied} değişiklik${scouters.length ? ` (${scouters.join(', ')})` : ''}`,
        content: utf8ToB64(content),
        ...(sha ? { sha } : {}),
        ...(env.DATA_BRANCH ? { branch: env.DATA_BRANCH } : {}),
      }),
    });
    if (res.ok) return { data: next, applied };
    if (res.status === 409 || res.status === 422) {
      await new Promise((r) => setTimeout(r, 200 * attempt + Math.random() * 300));
      continue;
    }
    await ghFail(res);
  }
  throw new HttpError(503, 'Çok fazla eşzamanlı yazma, tekrar deneyin');
}
