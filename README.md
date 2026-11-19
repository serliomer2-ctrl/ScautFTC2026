# 🐝 Biobuzz Scout — FTC 2026 Scouting Uygulaması

Maç sırasında ve pit alanında hızlı veri girişi için mobil uyumlu, tek sayfalık (SPA) scouting uygulaması.
React 18 + Vite + Tailwind CSS. Sunucu gerektirmez; tüm veri tarayıcının LocalStorage'ında tutulur.

## Çalıştırma

```bash
npm install
npm run dev        # http://localhost:5173 (aynı ağdaki telefondan IP ile açılabilir)
npm run build      # dist/ klasörü – herhangi bir statik sunucuya / GitHub Pages'e yüklenebilir
```

## Özellikler
- **3 tema:** Koyu, Açık, ⚡ Saha (saf siyah + yüksek kontrast, büyük yazı)
- Büyük dokunmatik butonlar, −/+ sayaçlar, yıldız puanı, isabet slider'ı
- Otonom "Hayır" → otonom detayları gizlenir; Asistan "Evet" → açıklama kutusu açılır
- Yarım kalan form otomatik taslak olarak saklanır (sayfa yenilense de kaybolmaz)
- Aynı takım + maç tekrar girilirse üzerine yazma onayı
- **Kayıtlar:** arama, detay, düzenle, sil · **CSV** (Excel uyumlu, UTF-8 BOM) / **JSON** dışa aktarma · JSON içe aktarma (birden çok gözlemcinin verisini id'ye göre birleştirir)
- **Takımlar:** takım bazlı ortalamalar (oto/tele Tip, isabet, sürücü puanı, End Game Flower başarı oranı), sıralama — alliance seçimi için

## Veri mimarisi
Bir kayıt = bir takımın bir maçtaki gözlemi (`src/schema.js`):

```
ScoutRecord { id, schemaVersion, createdAt, updatedAt, scouter,
  match:   { teamNumber, teamName, matchNumber, alliance: 'red'|'blue', notes },
  robot:   { drivetrain, drivetrainOther, intake, abilities: { hive, flower, nectar, pollen, stealFlower } },
  auto:    { hasAuto, success, performance, odometry, vision, startPosition, routeCount, pickupSource, tipCount, soloTip },
  teleop:  { autoAim, driverAssist, assistDescription, driverRating(0-5), carryCapacity, tipCount, accuracy(0-100) },
  endgame: { flowerPlanned, flowerResult: 'done'|'failed'|'not_attempted' } }
```
Evet/Hayır alanları `null | true | false` (null = işaretlenmedi). LocalStorage anahtarları:
`biobuzz.records.v1`, `biobuzz.draft.v1`, `biobuzz.prefs.v1`.
