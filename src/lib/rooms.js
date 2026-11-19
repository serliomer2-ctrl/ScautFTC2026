/**
 * Oda sistemi
 *  - Ortak oda  : id = "pub:<slug>", kayıtlar JSON'da açık metin.
 *  - Özel oda   : id = "prv:<slug>", kayıtlar AES-GCM ile şifreli: { id, updatedAt, enc:{iv,ct} }.
 *    id ve updatedAt açıkta kalır (birleştirme için gerekli); takım no, notlar vb. her şey şifreli.
 */
import { createRoomSecret, decryptJSON, encryptJSON, exportKey, importKey, unlockRoom } from './crypto.js';
import { enqueue, loadCache, loadQueue, syncNow } from './store.js';
import { migrate } from '../schema.js';

export function slugify(name) {
  const map = { ç: 'c', ğ: 'g', ı: 'i', İ: 'i', ö: 'o', ş: 's', ü: 'u' };
  return name
    .trim()
    .toLocaleLowerCase('tr')
    .replace(/[çğıİöşü]/g, (c) => map[c] || c)
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48);
}

/** Cache + kuyruktaki oda tanımları (henüz senkronize olmamış ortak odalar dahil) */
export function knownRooms() {
  const rooms = { ...loadCache().rooms };
  for (const op of loadQueue()) if (op.type === 'room' && !rooms[op.room.id]) rooms[op.room.id] = op.room;
  return rooms;
}

export function joinPublic(name, scouter) {
  const slug = slugify(name);
  if (!slug) throw new Error('Geçerli bir oda adı girin');
  const id = `pub:${slug}`;
  const room = knownRooms()[id];
  if (!room) {
    // Ortak oda offline da oluşturulabilir; ilk senkronizasyonda depoya yazılır
    enqueue({
      type: 'room',
      by: scouter,
      room: { id, name: name.trim(), type: 'public', createdAt: new Date().toISOString(), createdBy: scouter },
    });
  }
  return { scouter, roomId: id, roomName: room?.name || name.trim(), type: 'public' };
}

/**
 * Özel oda – oluşturma depoya HEMEN yazılmalı (iki kişi aynı anda aynı isimle farklı şifre
 * belirlerse ikinci kişinin verisi çözülemez hale gelirdi). Bu yüzden çevrimiçi + anahtar gerekir.
 */
export async function createPrivate(name, password, scouter) {
  const slug = slugify(name);
  if (!slug) throw new Error('Geçerli bir oda adı girin');
  if (password.length < 4) throw new Error('Şifre en az 4 karakter olmalı');
  const id = `prv:${slug}`;
  await syncNow(); // en güncel listeyi al
  if (loadCache().rooms[id]) throw new Error('Bu isimde özel oda zaten var – “Giriş Yap” sekmesini kullanın');
  const { key, kdf, verifier } = await createRoomSecret(password);
  const room = { id, name: name.trim(), type: 'private', createdAt: new Date().toISOString(), createdBy: scouter, kdf, verifier };
  enqueue({ type: 'room', by: scouter, room });
  const res = await syncNow();
  if (res.needsToken) throw new Error('Özel oda oluşturmak için GitHub anahtarı gerekli');
  // Aynı anda başkası oluşturduysa bizimki yazılmamış olur
  if (loadCache().rooms[id]?.kdf?.salt !== kdf.salt) throw new Error('Bu isimde oda az önce başka biri tarafından oluşturuldu');
  return { scouter, roomId: id, roomName: room.name, type: 'private', key: await exportKey(key) };
}

export async function joinPrivate(name, password, scouter) {
  const id = `prv:${slugify(name)}`;
  try {
    await syncNow();
  } catch {
    /* offline: cache'teki oda bilgisiyle devam */
  }
  const room = loadCache().rooms[id];
  if (!room) throw new Error('Böyle bir özel oda bulunamadı (çevrimdışıysanız önce bağlanın)');
  const key = await unlockRoom(room, password);
  if (!key) throw new Error('Şifre yanlış');
  return { scouter, roomId: id, roomName: room.name, type: 'private', key: await exportKey(key) };
}

/* ---------- Kayıt kodlama ---------- */
const keyCache = new Map();
const getKey = (b64) => {
  if (!keyCache.has(b64)) keyCache.set(b64, importKey(b64));
  return keyCache.get(b64);
};

/** Depoya yazılacak hale getirir (özel odada şifreler) */
export async function encodeRecord(session, rec) {
  if (session.type !== 'private') return rec;
  const key = await getKey(session.key);
  return { id: rec.id, updatedAt: rec.updatedAt, enc: await encryptJSON(key, rec) };
}

/** Odanın görünür kayıtları: depo cache'i + kuyruktaki bekleyenler, silinenler hariç */
export async function roomRecords(session) {
  const cache = loadCache();
  const pending = loadQueue().filter((o) => o.type === 'record' && o.roomId === session.roomId);
  const byId = new Map();
  for (const item of cache.records[session.roomId] || []) byId.set(item.id, { item, pending: false });
  for (const o of pending) {
    const cur = byId.get(o.item.id);
    if (!cur || (o.item.updatedAt || '') >= (cur.item.updatedAt || '')) byId.set(o.item.id, { item: o.item, pending: true });
  }
  const key = session.type === 'private' ? await getKey(session.key) : null;
  const out = [];
  let failed = 0;
  for (const { item, pending: p } of byId.values()) {
    let rec = item;
    if (item.enc) {
      try {
        rec = await decryptJSON(key, item.enc);
      } catch {
        failed++;
        continue;
      }
    }
    if (rec.deleted) continue;
    out.push({ ...migrate(rec), _pending: p });
  }
  return { records: out, failed };
}
