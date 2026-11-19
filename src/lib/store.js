/**
 * Senkronizasyon katmanı
 * ----------------------
 * - cache : depodaki scouting_data.json'un en son çekilen hali (offline okuma için)
 * - queue : henüz depoya yazılamamış işlemler (offline kuyruk). Her işlem:
 *     { opId, type: 'room',   room }
 *     { opId, type: 'record', roomId, item }   item = düz kayıt ya da {id, updatedAt, enc}
 * syncNow(): dosyayı + sha'yı taze çeker → kuyruğu birleştirir → sha ile yazar.
 * Arada başkası yazdıysa GitHub 409 döner → tekrar çek, birleştir, yaz (en fazla 6 deneme).
 * Birleştirme id bazlıdır ve updatedAt'i yeni olan kazanır; böylece kimse kimsenin kaydını ezmez
 * ve aynı işlem iki kez gönderilse de sonuç değişmez (idempotent).
 */
import { DEFAULT_REPO } from '../config.js';
import { getFile, GitHubError, putFile } from './github.js';

const K = {
  cache: 'bb2.cache',
  queue: 'bb2.queue',
  repo: 'bb2.repo',
  token: 'bb2.token',
  session: 'bb2.session',
  lastSync: 'bb2.lastSync',
};

const read = (k, fb) => {
  try {
    const v = localStorage.getItem(k);
    return v ? JSON.parse(v) : fb;
  } catch {
    return fb;
  }
};
const write = (k, v) => {
  try {
    if (v == null) localStorage.removeItem(k);
    else localStorage.setItem(k, JSON.stringify(v));
    return true;
  } catch {
    return false;
  }
};

export const emptyDB = () => ({ schemaVersion: 2, app: 'ftc-biobuzz-2026', updatedAt: null, rooms: {}, records: {} });
const normalize = (d) => ({ ...emptyDB(), ...(d || {}), rooms: { ...(d?.rooms || {}) }, records: { ...(d?.records || {}) } });

export const loadCache = () => normalize(read(K.cache, null));
export const loadQueue = () => read(K.queue, []);
export const loadRepo = () => ({ ...DEFAULT_REPO, ...read(K.repo, {}) });
export const saveRepo = (r) => write(K.repo, r);
export const loadToken = () => read(K.token, '');
export const saveToken = (t) => write(K.token, t || null);
export const loadSession = () => read(K.session, null);
export const saveSession = (s) => write(K.session, s);
export const loadLastSync = () => read(K.lastSync, null);

const listeners = new Set();
/** Kuyruk / cache değişince UI'ı haberdar et */
export const subscribe = (fn) => (listeners.add(fn), () => listeners.delete(fn));
const emit = () => listeners.forEach((fn) => fn());

export function enqueue(op) {
  const q = loadQueue();
  q.push({ opId: crypto.randomUUID(), queuedAt: new Date().toISOString(), ...op });
  if (!write(K.queue, q)) throw new Error('Cihaz depolaması dolu');
  emit();
}

/** Kuyruktaki işlemleri bir veritabanı kopyasına uygular (saf fonksiyon). */
export function applyOps(db, ops) {
  const next = normalize(structuredClone(db));
  for (const op of ops) {
    if (op.type === 'room') {
      // İlk oluşturan kazanır: var olan oda (özellikle özel odanın anahtarı) asla ezilmez
      if (!next.rooms[op.room.id]) next.rooms[op.room.id] = op.room;
      next.records[op.room.id] ||= [];
    } else if (op.type === 'record') {
      const arr = (next.records[op.roomId] ||= []);
      const i = arr.findIndex((r) => r.id === op.item.id);
      if (i < 0) arr.push(op.item);
      else if ((op.item.updatedAt || '') > (arr[i].updatedAt || '')) arr[i] = op.item;
    }
  }
  return next;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let running = null;

/**
 * Çek + (anahtar varsa) kuyruğu gönder. Aynı anda tek senkronizasyon çalışır.
 * @returns {Promise<{pushed:number, needsToken?:boolean}>}
 */
export function syncNow() {
  if (!running) running = doSync().finally(() => (running = null));
  return running;
}

async function doSync() {
  const cfg = { ...loadRepo(), token: loadToken() };
  for (let attempt = 1; attempt <= 6; attempt++) {
    const ops = loadQueue();
    const { data, sha } = await getFile(cfg);
    const remote = normalize(data);

    if (!ops.length || !cfg.token) {
      write(K.cache, remote);
      write(K.lastSync, new Date().toISOString());
      emit();
      return { pushed: 0, needsToken: ops.length > 0 && !cfg.token };
    }

    const next = applyOps(remote, ops);
    next.updatedAt = new Date().toISOString();
    const nRec = ops.filter((o) => o.type === 'record').length;
    try {
      await putFile(cfg, next, sha, `scout: ${nRec} kayıt (${[...new Set(ops.map((o) => o.item?.scouter || o.by).filter(Boolean))].join(', ') || 'gözlemci'})`);
      // Yalnızca gönderilen işlemleri sil; senkronizasyon sırasında eklenenler kuyrukta kalır
      const sent = new Set(ops.map((o) => o.opId));
      write(K.queue, loadQueue().filter((o) => !sent.has(o.opId)));
      write(K.cache, next);
      write(K.lastSync, new Date().toISOString());
      emit();
      return { pushed: ops.length };
    } catch (e) {
      if (e instanceof GitHubError && e.status === 409) {
        await sleep(250 * attempt + Math.random() * 400); // rastgele bekleme: aynı anda yazanlar sıraya girsin
        continue;
      }
      throw e;
    }
  }
  throw new Error('Çok fazla eşzamanlı yazma – birazdan otomatik tekrar denenecek');
}

/** Sadece okuma (kuyruğu göndermeden) – giriş ekranında oda listesini almak için */
export async function pullOnly() {
  const cfg = { ...loadRepo(), token: loadToken() };
  const { data } = await getFile(cfg);
  const db = normalize(data);
  write(K.cache, db);
  emit();
  return db;
}

/** Bağlantı testi: okuma + yazma yetkisi */
export async function testConnection(repo, token) {
  const cfg = { ...repo, token };
  const { data, sha } = await getFile(cfg);
  if (!token) return { read: true, write: false, exists: !!data };
  const res = await fetch(`https://api.github.com/repos/${repo.owner}/${repo.repo}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' },
  });
  const j = res.ok ? await res.json() : {};
  return { read: true, write: !!j.permissions?.push, exists: !!data, sha };
}
