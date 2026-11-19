/**
 * Özel oda şifrelemesi (WebCrypto). Depo herkese açık olabileceği için özel oda kayıtları
 * JSON'a AÇIK METİN olarak yazılmaz: oda şifresinden PBKDF2 ile AES-256-GCM anahtarı türetilir,
 * her kayıt bu anahtarla şifrelenir. Şifrenin kendisi hiçbir yerde saklanmaz; doğrulama,
 * bilinen bir metnin şifreli hali ("verifier") çözülebiliyor mu diye bakılarak yapılır.
 */
import { b64ToBytes, bytesToB64 } from './github.js';

const ITERATIONS = 210_000;
const VERIFIER_TEXT = 'biobuzz-room-ok';
const te = new TextEncoder();
const td = new TextDecoder();

function subtle() {
  if (!globalThis.crypto?.subtle) throw new Error('Şifreleme için HTTPS gerekli (GitHub Pages veya localhost)');
  return crypto.subtle;
}

export const randomB64 = (n = 16) => bytesToB64(crypto.getRandomValues(new Uint8Array(n)));

export async function deriveKey(password, salt, iterations = ITERATIONS) {
  const base = await subtle().importKey('raw', te.encode(password), 'PBKDF2', false, ['deriveKey']);
  return subtle().deriveKey(
    { name: 'PBKDF2', salt: b64ToBytes(salt), iterations, hash: 'SHA-256' },
    base,
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt'],
  );
}

export async function encryptJSON(key, obj) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await subtle().encrypt({ name: 'AES-GCM', iv }, key, te.encode(JSON.stringify(obj)));
  return { iv: bytesToB64(iv), ct: bytesToB64(new Uint8Array(ct)) };
}

export async function decryptJSON(key, box) {
  const pt = await subtle().decrypt({ name: 'AES-GCM', iv: b64ToBytes(box.iv) }, key, b64ToBytes(box.ct));
  return JSON.parse(td.decode(pt));
}

/** Yeni özel oda için kdf parametreleri + doğrulayıcı üretir. */
export async function createRoomSecret(password) {
  const kdf = { alg: 'PBKDF2-SHA256', iterations: ITERATIONS, salt: randomB64(16) };
  const key = await deriveKey(password, kdf.salt, kdf.iterations);
  return { key, kdf, verifier: await encryptJSON(key, VERIFIER_TEXT) };
}

/** Şifre doğruysa anahtarı, yanlışsa null döndürür. */
export async function unlockRoom(room, password) {
  const key = await deriveKey(password, room.kdf.salt, room.kdf.iterations);
  try {
    return (await decryptJSON(key, room.verifier)) === VERIFIER_TEXT ? key : null;
  } catch {
    return null;
  }
}

export const exportKey = async (key) => bytesToB64(new Uint8Array(await subtle().exportKey('raw', key)));
export const importKey = (b64) =>
  subtle().importKey('raw', b64ToBytes(b64), 'AES-GCM', true, ['encrypt', 'decrypt']);
