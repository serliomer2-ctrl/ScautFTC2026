# 🐝 Biobuzz Scout — FTC 2026 Scouting & Strateji

Çok kullanıcılı, takım odalı scouting uygulaması. Veritabanı olarak bu depodaki **`scouting_data.json`**
dosyası kullanılır (GitHub Contents API). React 18 + Vite + Tailwind CSS, GitHub Pages'te çalışır.

## Kurulum
```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # dist/  (GitHub Actions bunu otomatik Pages'e yükler)
```
**Yazma anahtarı:** GitHub → Settings → Developer settings → *Fine-grained tokens* → yalnızca bu depo,
*Repository permissions → Contents: Read and write*. Uygulamada **⚙️ Senkronizasyon Ayarları**'na yapıştırın
(anahtar sadece o cihazın tarayıcısında saklanır). Anahtar olmadan veri okunur, kayıtlar cihazda kuyrukta bekler.

## `scouting_data.json` şeması (v2)
```jsonc
{
  "schemaVersion": 2, "app": "ftc-biobuzz-2026", "updatedAt": "ISO tarih",
  "rooms": {
    "pub:istanbul-regional": { "id", "name", "type": "public", "createdAt", "createdBy" },
    "prv:takim-23456": { "id", "name", "type": "private", "createdAt", "createdBy",
                          "kdf": { "alg": "PBKDF2-SHA256", "iterations": 210000, "salt" },
                          "verifier": { "iv", "ct" } }
  },
  "records": {
    "pub:istanbul-regional": [ ScoutRecord, ... ],                  // açık metin
    "prv:takim-23456":       [ { "id", "updatedAt", "enc": { "iv", "ct" } } ]  // AES-256-GCM
  }
}
```
`ScoutRecord` = `{ id, roomId, scouter, createdAt, updatedAt, match, robot, auto, teleop, endgame }`
(alanlar: `src/schema.js`). Silinen kayıt `{ id, updatedAt, deleted: true }` olarak kalır (tombstone).

## Nasıl çalışır
- **Çakışma önleme:** Her yazmadan önce dosya + `sha` taze çekilir, kuyruktaki işlemler id bazında birleştirilir
  (yeni `updatedAt` kazanır) ve `sha` ile yazılır. Arada başkası yazdıysa GitHub 409 döner → yeniden çek-birleştir-yaz
  (rastgele beklemeyle 6 deneme). Kimse kimsenin kaydını ezmez.
- **Offline kuyruk:** Her kayıt önce LocalStorage kuyruğuna girer (⏳). Bağlantı gelince, 45 sn'de bir,
  uygulamaya dönünce veya **🔄 Senkronize Et** ile gönderilir (☁️).
- **Odalar:** Ortak oda şifresizdir (offline da açılabilir). Özel oda, şifreden türetilen anahtarla **şifrelenir**;
  şifre hiçbir yerde saklanmaz, depo herkese açık olsa bile kayıtlar okunamaz. Özel oda oluşturmak çevrimiçi olmayı gerektirir.
  ⚠️ Şifre unutulursa veri kurtarılamaz.
- **Analiz:** Takımlar (detay kartı + maç grafiği + pit/not özeti), İttifak (4 takıma kadar karşılaştırma + partner uyum puanı),
  Simülatör (2v2 tahmini skor ve kazanma ihtimali). Puan değerleri Simülatör → *Puan Modeli*'nden kural kitabına göre ayarlanır.
- Veri kayıtları Pages'i yeniden derletmez (`paths-ignore: scouting_data.json`).

## Dosyalar
| | |
|---|---|
| `src/lib/github.js` | Contents API okuma/yazma, UTF-8 base64, 1 MB+ dosya desteği |
| `src/lib/store.js` | Cache, offline kuyruk, `syncNow()` (sha + 409 tekrar deneme) |
| `src/lib/rooms.js` | Oda oluştur/gir, kayıt şifreleme/çözme |
| `src/lib/crypto.js` | PBKDF2 + AES-GCM (WebCrypto) |
| `src/lib/analytics.js` | Takım istatistikleri, maç tahmini, partner sıralaması |
| `src/components/` | Login, ScoutForm, Records, TeamsView, StrategyViews, Charts, ui |
