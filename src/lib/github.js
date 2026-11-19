/** GitHub Contents API ile tek bir JSON dosyasını okuma / yazma. */
const API = 'https://api.github.com';

export class GitHubError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

/* UTF-8 güvenli base64 (Türkçe karakterler için btoa tek başına yetmez) */
export function bytesToB64(bytes) {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}
export const b64ToBytes = (b64) => Uint8Array.from(atob(b64.replace(/\s/g, '')), (c) => c.charCodeAt(0));
const encodeUtf8B64 = (s) => bytesToB64(new TextEncoder().encode(s));
const decodeUtf8B64 = (b) => new TextDecoder().decode(b64ToBytes(b));

const headers = (token) => ({
  Accept: 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
  ...(token ? { Authorization: `Bearer ${token}` } : {}),
});

async function fail(res) {
  let msg = res.statusText;
  try {
    msg = (await res.json()).message || msg;
  } catch { /* gövde yok */ }
  if (res.status === 401) msg = 'GitHub anahtarı geçersiz veya süresi dolmuş';
  if (res.status === 403 && /rate limit/i.test(msg)) msg = 'GitHub istek limiti doldu – biraz bekleyin';
  if (res.status === 403 || res.status === 404) msg += ' (anahtarın bu depoda "Contents: Read and write" izni var mı?)';
  throw new GitHubError(res.status, msg);
}

const contentsUrl = (c) =>
  `${API}/repos/${c.owner}/${c.repo}/contents/${c.path.split('/').map(encodeURIComponent).join('/')}`;

/**
 * Dosyanın güncel halini ve sha değerini çeker.
 * Anahtar yoksa raw.githubusercontent.com kullanılır (API limitine takılmaz; ama sha dönmez → yazılamaz).
 * @returns {{data: object|null, sha: string|null}}
 */
export async function getFile(c) {
  if (!c.token) {
    const res = await fetch(
      `https://raw.githubusercontent.com/${c.owner}/${c.repo}/${c.branch || 'HEAD'}/${c.path}?nocache=${Date.now()}`,
      { cache: 'no-store' },
    );
    if (res.status === 404) return { data: null, sha: null };
    if (!res.ok) await fail(res);
    return { data: await res.json(), sha: null };
  }
  const q = c.branch ? `?ref=${encodeURIComponent(c.branch)}` : '';
  const res = await fetch(contentsUrl(c) + q, { headers: headers(c.token), cache: 'no-store' });
  if (res.status === 404) return { data: null, sha: null };
  if (!res.ok) await fail(res);
  const j = await res.json();
  let b64 = j.content;
  if (!b64 && j.size > 0) {
    // 1 MB üzerindeki dosyalarda içerik boş gelir → blob API (100 MB'a kadar)
    const br = await fetch(`${API}/repos/${c.owner}/${c.repo}/git/blobs/${j.sha}`, { headers: headers(c.token), cache: 'no-store' });
    if (!br.ok) await fail(br);
    b64 = (await br.json()).content;
  }
  const text = b64 ? decodeUtf8B64(b64) : '';
  return { data: text.trim() ? JSON.parse(text) : null, sha: j.sha };
}

/**
 * Dosyayı yazar. sha, okunduğu andaki sha olmalı; arada başkası yazdıysa GitHub 409 döner
 * → çağıran taraf dosyayı tekrar okuyup birleştirip yeniden dener (optimistic concurrency).
 */
export async function putFile(c, data, sha, message) {
  const body = {
    message,
    content: encodeUtf8B64(JSON.stringify(data, null, 2) + '\n'),
    ...(sha ? { sha } : {}),
    ...(c.branch ? { branch: c.branch } : {}),
  };
  const res = await fetch(contentsUrl(c), {
    method: 'PUT',
    headers: { ...headers(c.token), 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (res.status === 409 || res.status === 422) throw new GitHubError(409, 'conflict');
  if (!res.ok) await fail(res);
  return (await res.json()).content.sha;
}
