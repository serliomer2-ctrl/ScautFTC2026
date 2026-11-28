/**
 * Kimlik doğrulama (Faz 6)
 * ------------------------
 * Üye listesi  : public/team-members.json (bu depoda, GitHub'dan düzenlenir; site ile yayınlanır,
 *                service worker önbelleğe alır). Rol (mentor/member) YALNIZCA bu dosyadan gelir.
 * Hesaplar     : PIN hash'leri, mevcut senkronizasyonun taşıdığı sistem odasında
 *                ("pub:team-accounts", kind: 'account') tutulur → veri deposuna yazılır, tüm cihazlara iner,
 *                internetsiz cihaz da önbellekteki hesaplarla doğrular.
 * Kayıt        : listede adı olan kişi + takım davet kodu (PBKDF2 hash ile doğrulanır) + kendi PIN'i.
 * Oturum       : bb2.auth (localStorage) – PIN saklanmaz; çıkış yapılana kadar internetsiz de geçerli.
 *
 * GÜVENLİK SINIRI: Bu bir istemci tarafı erişim kontrolüdür (paylaşılan tablet / yanlış kişi adına kayıt
 * girmeyi önler). Sunucu olmadığı için, uygulama koduna veya veri deposuna erişebilen teknik biri
 * kontrolleri atlayabilir. PIN hash'leri PBKDF2 ile tuzlanır; kısa PIN'ler çevrimdışı denenebilir.
 */
import { b64ToBytes, bytesToB64 } from './github.js';
import { enqueue, loadCache, loadQueue } from './store.js';

export const ACCOUNTS_ROOM = 'pub:team-accounts';
const ROSTER_KEY = 'bb2.roster';
const AUTH_KEY = 'bb2.auth';
const ITER = 150_000;

/* ---------------- PBKDF2 ---------------- */
export async function pbkdf2(secret, saltB64, iterations = ITER) {
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: b64ToBytes(saltB64), iterations, hash: 'SHA-256' }, base, 256);
  return bytesToB64(new Uint8Array(bits));
}
export const newSalt = () => bytesToB64(crypto.getRandomValues(new Uint8Array(16)));

/** Mentör paneli: yeni davet kodu için team-members.json'a yapıştırılacak blok */
export async function makeInviteBlock(code) {
  const salt = newSalt();
  return { alg: 'PBKDF2-SHA256', iterations: ITER, salt, hash: await pbkdf2(code.trim().toUpperCase(), salt, ITER) };
}

/* ---------------- Üye listesi ---------------- */
const readJSON = (k) => {
  try {
    return JSON.parse(localStorage.getItem(k));
  } catch {
    return null;
  }
};
const writeJSON = (k, v) => {
  try {
    if (v == null) localStorage.removeItem(k);
    else localStorage.setItem(k, JSON.stringify(v));
  } catch { /* depolama yok */ }
};

export const cachedRoster = () => readJSON(ROSTER_KEY);

/** Listeyi siteden çeker (internet yoksa son kopya); en az bir kopya yoksa hata */
export async function loadRoster() {
  try {
    const res = await fetch('./team-members.json', { cache: 'no-store' });
    if (!res.ok) throw new Error(String(res.status));
    const r = await res.json();
    if (!Array.isArray(r.members)) throw new Error('liste bozuk');
    writeJSON(ROSTER_KEY, r);
    return r;
  } catch {
    const c = cachedRoster();
    if (c) return c;
    // Service worker önbelleği (ilk açılış çevrimdışıysa)
    const hit = await caches?.match?.('./team-members.json', { ignoreSearch: true }).catch(() => null);
    if (hit) return hit.json();
    throw new Error('Üye listesi alınamadı – ilk girişte internet gerekli');
  }
}

/* ---------------- Hesaplar ---------------- */
/** Önbellek + bekleyen kuyruk → memberId → hesap (silinmiş hesaplar hariç) */
export function accounts() {
  const map = new Map();
  const put = (it) => {
    if (it?.kind !== 'account' && !it?.deleted) return;
    const cur = map.get(it.id);
    if (!cur || (it.updatedAt || '') >= (cur.updatedAt || '')) map.set(it.id, it);
  };
  (loadCache().records[ACCOUNTS_ROOM] || []).forEach(put);
  loadQueue().filter((o) => o.type === 'record' && o.roomId === ACCOUNTS_ROOM).forEach((o) => put(o.item));
  const out = new Map();
  for (const a of map.values()) if (!a.deleted) out.set(a.memberId, a);
  return out;
}

function ensureAccountsRoom() {
  const exists = loadCache().rooms[ACCOUNTS_ROOM] || loadQueue().some((o) => o.type === 'room' && o.room.id === ACCOUNTS_ROOM);
  if (!exists)
    enqueue({ type: 'room', room: { id: ACCOUNTS_ROOM, name: 'Takım Hesapları (sistem)', type: 'public', createdAt: new Date().toISOString(), createdBy: 'sistem' } });
}

export async function register(roster, memberId, invite, pin) {
  const m = roster.members.find((x) => x.id === memberId);
  if (!m) throw new Error('Bu kişi takım listesinde yok');
  if (accounts().has(memberId)) throw new Error('Bu üyenin hesabı zaten aktif – Giriş Yap sekmesini kullanın (PIN unutulduysa mentör sıfırlar)');
  if (roster.inviteCode?.hash) {
    const h = await pbkdf2(invite.trim().toUpperCase(), roster.inviteCode.salt, roster.inviteCode.iterations || ITER);
    if (h !== roster.inviteCode.hash) throw new Error('Davet kodu hatalı');
  }
  if (!/^\S{4,}$/.test(pin)) throw new Error('PIN en az 4 karakter olmalı (6+ önerilir)');
  const salt = newSalt();
  const now = new Date().toISOString();
  ensureAccountsRoom();
  enqueue({
    type: 'record',
    roomId: ACCOUNTS_ROOM,
    item: { id: `acct:${memberId}`, kind: 'account', memberId, pin: { alg: 'PBKDF2-SHA256', iterations: ITER, salt, hash: await pbkdf2(pin, salt) }, createdAt: now, updatedAt: now, scouter: m.adSoyad },
  });
  return startSession(m);
}

export async function login(roster, memberId, pin) {
  const m = roster.members.find((x) => x.id === memberId);
  if (!m) throw new Error('Bu kişi takım listesinde yok');
  const acc = accounts().get(memberId);
  if (!acc) throw new Error('Hesap henüz aktif değil – önce Kayıt Ol (veya internete bağlanıp tekrar deneyin)');
  const h = await pbkdf2(pin, acc.pin.salt, acc.pin.iterations || ITER);
  if (h !== acc.pin.hash) throw new Error('PIN hatalı');
  return startSession(m);
}

/** Mentör: üyenin hesabını sıfırlar (üye yeniden Kayıt Ol ile PIN belirler) */
export function resetAccount(memberId) {
  ensureAccountsRoom();
  enqueue({ type: 'record', roomId: ACCOUNTS_ROOM, item: { id: `acct:${memberId}`, deleted: true, updatedAt: new Date().toISOString() } });
}

/* ---------------- Oturum ---------------- */
function startSession(m) {
  const s = { memberId: m.id, adSoyad: m.adSoyad, rol: m.rol === 'mentor' ? 'mentor' : 'member', gitHub: m.gitHubKullaniciAdi || '', at: new Date().toISOString() };
  writeJSON(AUTH_KEY, s);
  return s;
}
export const loadAuth = () => readJSON(AUTH_KEY);
export const logout = () => writeJSON(AUTH_KEY, null);

/** Liste güncellendiyse (ad / rol değişti, üye çıkarıldı) oturumu tazeler; çıkarıldıysa null */
export function refreshAuth(auth, roster) {
  if (!auth || !roster) return auth;
  const m = roster.members.find((x) => x.id === auth.memberId);
  if (!m) {
    logout();
    return null;
  }
  if (m.adSoyad !== auth.adSoyad || (m.rol === 'mentor' ? 'mentor' : 'member') !== auth.rol) return startSession(m);
  return auth;
}
