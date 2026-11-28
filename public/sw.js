/**
 * Biobuzz Scout – Service Worker (çevrimdışı açılış)
 * - Uygulama kabuğu (index.html + derlenmiş JS/CSS + ikonlar) önbelleğe alınır.
 * - Sayfa istekleri: önce ağ (yeni sürüm gelsin), ağ yoksa önbellekteki index.html.
 * - /assets/* (içerik hash'li, değişmez): önce önbellek.
 * - Başka sitelere giden istekler (GitHub API, FTCScout, Worker) HİÇ önbelleğe alınmaz;
 *   veri senkronizasyonu uygulamanın kendi kuyruğunda yönetilir.
 */
const SHELL = 'bb-shell-v4';
// Modül dosyaları Origin başlığıyla istenir; önbellekteki kopya başlıksız kaydedilmiş olabilir → Vary'yi yok say
const MATCH = { ignoreVary: true, ignoreSearch: true };
const STATIC = ['./manifest.webmanifest', './icon-192.png', './icon-512.png', './icon-maskable-512.png', './logo.webp', './field.png', './team-members.json'];

const assetsIn = (html) =>
  [...html.matchAll(/(?:src|href)="(\.?\/?assets\/[^"]+)"/g)].map((m) => new URL(m[1], self.registration.scope).href);

async function cacheShell(response) {
  const cache = await caches.open(SHELL);
  const html = await response.clone().text();
  await cache.put(new URL('./', self.registration.scope).href, response);
  const wanted = assetsIn(html);
  // Ana JS paketinin sonradan yüklediği parçalar (örn. QR okuyucu) da çevrimdışı lazım
  for (const u of wanted.filter((x) => x.endsWith('.js'))) {
    try {
      const js = await ((await cache.match(u, MATCH)) || (await fetch(u))).text(); // önbellekte varsa yeniden indirme
      // Vite parçaları JS dosyasına göreli verir: "./jsQR-abc123.js"
      // (yalnızca hash'li dosya adları: "isim-HASH.js" – "./sw.js" gibi metinler eşleşmesin)
      for (const m of js.matchAll(/["'](\.\/[\w.]+-[\w-]{6,}\.(?:js|css))["']/g)) {
        const full = new URL(m[1], u).href;
        if (!wanted.includes(full)) wanted.push(full);
      }
    } catch { /* çevrimdışı: atla */ }
  }
  await Promise.all(
    wanted.map(async (u) => {
      if (!(await cache.match(u, MATCH))) await cache.add(u).catch(() => {});
    }),
  );
  // Eski sürümlerin hash'li dosyalarını temizle
  for (const req of await cache.keys()) {
    if (req.url.includes('/assets/') && !wanted.includes(req.url)) await cache.delete(req);
  }
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL);
      await cache.addAll(STATIC).catch(() => {});
      const res = await fetch('./', { cache: 'reload' });
      if (res.ok) await cacheShell(res);
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) if (key !== SHELL) await caches.delete(key);
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // API istekleri doğrudan ağa

  if (req.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          const res = await fetch(req);
          if (res.ok) event.waitUntil(cacheShell(res.clone()));
          return res;
        } catch {
          const cache = await caches.open(SHELL);
          return (await cache.match(new URL('./', self.registration.scope).href, MATCH)) || Response.error();
        }
      })(),
    );
    return;
  }

  event.respondWith(
    (async () => {
      const cache = await caches.open(SHELL);
      const isAsset = url.pathname.includes('/assets/');
      const hit = await cache.match(url.href, { ignoreVary: true, ignoreSearch: isAsset });
      if (hit && isAsset) return hit; // hash'li dosya: değişmez
      try {
        const res = await fetch(req);
        if (res.ok) event.waitUntil(cache.put(url.href, res.clone()));
        return res;
      } catch {
        return hit || Response.error();
      }
    })(),
  );
});
