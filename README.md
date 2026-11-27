# 🐝 Biobuzz Scout — FTC 2026 Scouting & Strateji

Çok kullanıcılı, takım odalı scouting uygulaması. Veritabanı olarak bu depodaki **`scouting_data.json`**
dosyası kullanılır (GitHub Contents API). React 18 + Vite + Tailwind CSS, GitHub Pages'te çalışır.

## Kurulum
```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # dist/  (GitHub Actions bunu otomatik Pages'e yükler)
```
**Senkronizasyon (aktif: B seçeneği):** Anahtar `ScautFTC2026` deposunun **Settings → Secrets and variables → Actions**
bölümünde `SCOUT_TOKEN` adıyla durur; GitHub Actions derlerken pakete gömer, uygulama doğrudan GitHub API ile
`serliomer2-ctrl/ScautFTC2026-data` deposuna yazar. Anahtar yalnızca o depoya *Contents: Read and write* yetkili olmalı.
⚠️ Siteyi açan biri anahtarı paketten çıkarabilir; şüphede GitHub'dan iptal edip yenisini Secret'a koyun.

**Alternatif (A seçeneği):** Veri, Cloudflare Worker ara sunucusu (`worker/worker.js`) üzerinden ayrı, gizli
`ScautFTC2026-data` deposuna yazılır. GitHub anahtarı yalnızca Worker'da saklanır; uygulamada anahtar yoktur ve
gözlemciler hiçbir ayar yapmaz. Kurulum: **[worker/KURULUM.md](worker/KURULUM.md)**. Worker adresi `src/config.js →
PROXY_URL`'e yazılır. (Worker yoksa ya da adres `?admin` ile açılırsa, eski "cihaza anahtar gir" modu kullanılabilir.)

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
- **Çakışma önleme:** (Worker'da, sunucu tarafında) Her yazmadan önce dosya + `sha` taze çekilir, kuyruktaki işlemler id bazında birleştirilir
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

## Çevrimdışı & saha özellikleri (OfflineScout eklentileri)
| Özellik | Dosya | Not |
|---|---|---|
| PWA (ana ekrana ekle, internetsiz açılış) | `public/manifest.webmanifest`, `public/sw.js`, `src/pwa.js` | Uygulama kabuğu önbellekte; API istekleri önbelleğe alınmaz |
| QR ile internetsiz aktarım | `src/lib/qrcodec.js`, `src/components/QRTransfer.jsx` | Kısaltılmış anahtar + deflate; 40 maç ≈ 4 QR. Çift kayıt kontrolü (id + takım/maç) |
| Saha haritası | `src/components/MatchExtras.jsx`, `src/lib/field.js` | Başlangıç + oto/tele skor noktaları. Bölgeler şematik – kural kitabına göre `field.js`'ten güncelleyin, gerçek görsel için `FIELD_IMAGE` |
| Döngü süresi ölçer, hızlı etiketler | `src/components/MatchExtras.jsx` | `rec.cycles` (sn), `rec.tags` |
| Geri Al + kayıt onayı | `src/App.jsx`, `src/components/SaveConfirm.jsx` | Boş kalan alanları hatırlatır |
| Pit incelemesi + fotoğraf | `src/components/PitScouting.jsx`, `src/lib/image.js` | Fotoğraf cihazda ≤ ~13 KB'a sıkıştırılır; takım başına tek pit kaydı (`kind: 'pit'`) |
| Kafa kafaya karşılaştırma | `src/components/HeadToHead.jsx` | En yüksek/düşük skor, std. sapma, dönem dağılımı, döngü, etiketler |
| Turnuva programı (FTCScout) | `src/lib/ftcscout.js`, `src/components/EventSchedule.jsx` | Resmi skorlar + bizim tahminimiz + tahmin isabeti; son program cihazda saklanır |

Yeni kayıt alanları (eski kayıtlarda yoksa varsayılan kullanılır):
`fieldMap: { start: {x,y,z}, shots: [{x,y,z,p:'a'|'t'}] }`, `cycles: [sn]`, `tags: [id]` ve pit kayıtları
`{ id: 'pit:<takım>', kind: 'pit', team: {number,name}, pit: {drivetrain, intake, driveMotors, totalMotors, odometry, vision, autoRoutes, autoNotes, driverExperience, notes, photo} }`.

## OfflineScout tarzı arayüz ve iş akışı (Faz 3)
| Özellik | Dosya | Not |
|---|---|---|
| OLED tema (varsayılan) | `src/index.css` (`data-theme='oled'`) | #0F1115 zemin, #181B20 kart, #EF4444 / #3B82F6 ittifak, #10B981 birincil, #F59E0B uyarı. Eski 3 tema duruyor |
| 4 sekmeli alt menü + alt sekmeler | `src/App.jsx` (`MAIN`) | Scout (Maç / Detaylı / Pit) · Sync/QR · Takımlar · Strateji (Picklist / İttifak / Simülatör) |
| Cihaz rolü | `src/App.jsx` | 📝 Scouter: Scout + Sync (kendi maçları, QR). 🧠 Master: 4 sekme, sürekli tarayıcı, analiz |
| Sıfır kaydırma maç ekranı | `src/components/MatchMode.jsx` | Üst: maç + saat + Auto/TeleOp/Endgame; orta: sayaç kartları; alt: Geri Al / Önceki / İleri-Bitir. 375×667'de dahi kaydırmasız. Süreler `MATCH_TIMING` |
| Maç öncesi hızlı seçim | `MatchMode.jsx` → `PreMatch` | Yüklü FTCScout programından takımlar gelir (FTC: ittifak başına 2 robot) |
| Yarım kalan maç koruması | `MatchMode.jsx` + mevcut taslak | Faz/saat `bb2.matchmode`'da; açılışta “Yarım kalan maç … Devam / Sil” |
| Kompakt QR protokolü (BZ2) | `src/lib/compactProtocol.js` | `BZ2\|i:..\|t:19452\|m:Q12\|a:1,3,s\|tp:8,2,70,4\|eg:1,d\|tag:brownout` – sade maç ≈ 110–250 karakter |
| Sürekli QR tarayıcı (Master) | `src/components/MasterScanner.jsx`, `src/lib/feedback.js` | Bip + titreşim + yeşil çerçeve; BZ2 ve BB1 okur; testte 6 QR ≈ 2,6 sn |
| Takım profil kartı | `src/components/TeamProfileCard.jsx` | Fotoğraf, şasi, maç, ort. puan, yığılmış dönem çubuğu, etiket rozetleri, pit notları |
| Picklist | `src/components/Picklist.jsx` | Ağırlıklı (%Auto/%TeleOp/%Endgame) otomatik sıralama, sürükle-bırak (dokunmatik dahil), ▲▼, Seçildi/Elendi; cihazda kalıcı |

## Pro-Level Strateji & Telemetri (Faz 4)
| Modül | Dosya | Not |
|---|---|---|
| İttifak Sinerji Motoru + What-If | `src/lib/synergy.js`, `src/components/WhatIf.jsx` (Strateji → İttifak) | Bölge türü `field.js` **etiketinden** (Hive / Loading Zone / Garden). Mavi kayıtlar 180° aynalanır. Çakışmada küçük katkının %12'si (+%5 başlangıç) düşülür |
| Sesli pit notu + canlı garaj rozetleri | `src/components/MicButton.jsx`, `PitScouting.jsx`, `TeamProfileCard.jsx` | Web Speech API (TR/EN); desteklenmezse buton gizli. Rozetler `pit.alerts: [{id, at, by}]` |
| Maç telemetrisi | `MatchMode.jsx` (kayıt), `src/lib/telemetry.js`, `TeamProfileCard.jsx` | `rec.timeline: [{t, a}]` yalnız maç saati çalışırken. Ölü süre = TeleOp'ta 20 sn'den uzun skorsuz aralık |
| Drive Team brifingi | `src/components/Briefing.jsx` (Strateji → Brifing) | Sıradaki maç (programdan) veya elle 4 takım; tam ekran, otomatik aksiyon maddeleri |
| Hızlı Metin Kodu | `src/lib/textcode.js`, `src/components/TextSync.jsx` (Sync) | `BBT1.P.…` ortak oda (sıkıştırılmış), `BBT1.E.…` özel oda (oda anahtarıyla AES-GCM). Kopyala / Paylaş (Bluetooth, Yakındaki Paylaşım) / .txt; BZ2 ve BB1 metinlerini de birleştirir |

Geriye dönük uyumluluk: yeni alanlar (`timeline`, `pit.alerts`) eski kayıtlarda yoktur ve her yerde `|| []` ile okunur;
şema sürümü değişmedi, eski uygulama sürümleri bilinmeyen alanları yok sayar.

## Jüri Raporlama, Veri Doğrulama ve Saha Ergonomisi (Faz 5)
| Modül | Dosya | Not |
|---|---|---|
| Jüri / Portfolyo raporu | `src/components/Report.jsx` (Strateji → 📄 Rapor), `src/index.css` (`@media print`) | Yönetici özeti, #37677 gelişim grafiği, metodoloji (puan modeli, picklist ağırlıkları, net katkı, doğrulama), en iyi ittifak eşleşmeleri. 🖨 Yazdır/PDF (açık tema, A4) + 🎤 Jüri Sunum Modu (tam ekran slaytlar) |
| Ceza takibi + Net Katkı | `MatchMode.jsx` (basılı tut Minor/Major), `MatchExtras.jsx`, `src/lib/penalties.js` | `rec.fouls = {minor, major}`; eski kayıtta “Ceza Aldı” etiketi = 1 minor. Net = brüt − rakibe ceza puanı; ≥10 p/maç veya ≥%30 major → “Yüksek Ceza Riski” (profil, picklist, galeri) |
| Robot galerisi | `src/components/Gallery.jsx` (Takımlar → ▦ Galeri) | Pit fotoğrafı yoksa robot silüeti; puan ve ceza rozetleri |
| Çift gözlem doğrulama | `src/lib/consensus.js`, `src/components/ConsensusPanel.jsx` (Master → Sync) | Aynı maç+takım, farklı gözlemci. Uyum ≥%90 doğrulanmış; altı: Ortalamasını Al / 1. / 2. kaydı seç. Analizler grupları tek kayıt sayar. QR/metin içe aktarmada yalnız **aynı gözlemcinin** eski kaydı değiştirilir |
| Saha ergonomisi | `MatchMode.jsx`, `App.jsx` (⚙ Ayarlar) | Ekranı uyanık tut (Wake Lock, desteklenmezse sessiz), Sağ/Sol el düzeni (+ butonları, büyük sayaç, İleri) |

## Dosyalar
| | |
|---|---|
| `worker/worker.js` | Cloudflare Worker: doğrulama, sunucu tarafı birleştirme, sha/409 tekrar deneme |
| `src/lib/github.js` | Contents API okuma/yazma, UTF-8 base64, 1 MB+ dosya desteği |
| `src/lib/store.js` | Cache, offline kuyruk, `syncNow()` (sha + 409 tekrar deneme) |
| `src/lib/rooms.js` | Oda oluştur/gir, kayıt şifreleme/çözme |
| `src/lib/crypto.js` | PBKDF2 + AES-GCM (WebCrypto) |
| `src/lib/analytics.js` | Takım istatistikleri, maç tahmini, partner sıralaması |
| `src/components/` | Login, ScoutForm, Records, TeamsView, StrategyViews, Charts, ui |
