# 🔐 Senkronizasyon Sunucusu Kurulumu (Cloudflare Worker)

Bu kurulumu **bir kez** sen yaparsın; gözlemciler hiçbir ayar yapmaz. Toplam ~15 dakika.
GitHub anahtarı yalnızca Cloudflare'de şifreli saklanır — **bana veya kimseye gönderme.**
Bana sadece en sondaki Worker adresini (`https://....workers.dev`) göndermen yeterli; o gizli değildir.

---

## 1. Veri deposunu oluştur (GitHub)
1. https://github.com/new adresine git.
2. **Repository name:** `ScautFTC2026-data`
3. **Private** seç (veriler herkese açık olmasın).
4. **Add a README file** kutusunu işaretle (deponun boş olmaması için).
5. **Create repository**.

## 2. GitHub anahtarını oluştur
1. https://github.com/settings/personal-access-tokens/new adresine git
   (veya: profil resmi → Settings → Developer settings → Personal access tokens → **Fine-grained tokens** → Generate new token).
2. **Token name:** `biobuzz-sync`
3. **Expiration:** sezon sonu (ör. *Custom* → 6 ay sonrası).
4. **Repository access:** **Only select repositories** → yalnızca `ScautFTC2026-data`.
5. **Permissions → Repository permissions → Contents:** **Read and write**
   (Metadata: Read-only otomatik gelir; başka hiçbir izin verme).
6. **Generate token** → `github_pat_...` ile başlayan anahtarı **kopyala**
   (bir daha gösterilmez; şimdilik sadece bir sonraki adımda yapıştırmak için tut).

## 3. Cloudflare Worker'ı oluştur
1. https://dash.cloudflare.com/sign-up adresinden ücretsiz hesap aç (kredi kartı gerekmez), e-postanı doğrula.
2. Sol menü → **Workers & Pages** (bazı hesaplarda *Compute (Workers)*) → **Create** → **Create Worker**
   ("Start with Hello World" seçeneği).
3. **Name:** `biobuzz-sync` → **Deploy**.
4. Açılan sayfada **Edit code** butonuna bas.
5. Soldaki `worker.js` içindeki her şeyi sil; bu depodaki **`worker/worker.js`** dosyasının içeriğinin
   tamamını yapıştır
   (GitHub'da dosyayı aç → sağ üstteki **Raw** / kopyala simgesi).
6. Sağ üstten **Deploy**.

## 4. Değişkenleri tanımla
Worker sayfasında **Settings** → **Variables and Secrets** → **+ Add**. Şunları ekle:

| Tip | Ad (Variable name) | Değer |
|---|---|---|
| **Secret** | `GITHUB_TOKEN` | 2. adımda kopyaladığın `github_pat_...` |
| Text | `DATA_OWNER` | `serliomer2-ctrl` |
| Text | `DATA_REPO` | `ScautFTC2026-data` |
| Text | `ALLOWED_ORIGIN` | `https://serliomer2-ctrl.github.io` |

Her birinden sonra / en sonda **Deploy** (veya *Save and deploy*) de.
> `GITHUB_TOKEN` için tipi mutlaka **Secret** seç — böylece Cloudflare panelinde bile bir daha görünmez.

## 5. Test et
Worker sayfasının üstünde adresi görürsün: `https://biobuzz-sync.<hesap-adın>.workers.dev`
- Tarayıcıda `…workers.dev/health` aç → `{"ok":true,"app":"biobuzz-scout-sync"}` görmelisin.
- `…workers.dev/data` aç → `{"data":{"schemaVersion":2, ... "rooms":{} ...}}` görmelisin.
  - `GitHub 401` → anahtar yanlış kopyalanmış. `GitHub 404` → DATA_OWNER/DATA_REPO yanlış ya da anahtara bu depo seçilmemiş.
  - `Worker ayarları eksik` → 4. adımdaki değişkenlerden biri yok.

## 6. Adresi bana gönder
Sadece **Worker adresini** (`https://biobuzz-sync.<hesap-adın>.workers.dev`) yaz. Ben uygulamaya ekleyip
yayınlarım; o andan itibaren herkes sadece **ad + oda** girerek kullanır.

---

### Sık sorulanlar
- **Ücretli mi?** Hayır. Ücretsiz plan günde 100.000 istek verir; bir turnuvada birkaç bin istek olur.
- **Anahtarın süresi dolunca?** 2. adımla yeni anahtar üret, 4. adımda `GITHUB_TOKEN`'ı güncelle. Uygulamaya dokunmaya gerek yok.
- **Anahtar çalınırsa / şüphelenirsen?** GitHub → Fine-grained tokens → anahtarı **Revoke** et, yenisini oluştur.
- **Worker adresi biri tarafından ele geçirilirse?** Worker yalnızca kayıt ekler/günceller; dosyayı silemez, kodunu değiştiremez,
  başka depolara erişemez. Silinen/bozulan bir kayıt olursa `ScautFTC2026-data` deposunun commit geçmişinden geri alınabilir.
- **Verileri görmek/yedeklemek?** `ScautFTC2026-data` deposundaki `scouting_data.json` dosyası; her kayıt bir commit'tir.
