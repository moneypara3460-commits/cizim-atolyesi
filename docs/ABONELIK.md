# Abonelik ve ödeme sistemi

Ödeme **yalnız Google Play** üzerinden alınır (şirket gerekmez; gelir mağaza üzerinden gelir).
Telefon/tablet kullanıcısı Play Store'daki Android uygulamasından abone olur. Bilgisayar, iPhone ve tarayıcı
kullanıcısı aynı Google hesabıyla giriş yaptığında aboneliği orada da açılır.

## Nasıl çalışır

| Parça | Yer | Görev |
|---|---|---|
| Kilit | `hesap/guard.js` | Her bölüm sayfasında ilk yüklenir. `PAYWALL = false` iken hiçbir şey yapmaz. |
| Ayarlar | `hesap/config.js` | `PAYWALL` anahtarı, Supabase adresi ve yayınlanabilir anahtar. |
| Hesabım sayfası | `hesap/` | Google ile giriş, deneme/abonelik durumu, paketler, satın alma, geri yükleme. |
| Erişim hesabı | `hesap/access.js` | Deneme + abonelikten hangi bölümün ne zamana kadar açık olduğu. İnternetsiz 7 gün. |
| Ödeme | `hesap/billing.js` | Google Play Faturalandırma (Digital Goods API) — yalnız Play'deki uygulamada çalışır. |
| Veritabanı | Supabase `CIZIM-ATOLYESI` | `profiles` (7 günlük deneme sunucuda başlar; 23.11.2026'ya kadar 14 gündü), `subscriptions`. Kullanıcı yalnız kendi kaydını okur, yazamaz. |
| Doğrulama | `supabase/functions/play-verify` | Satın alma jetonunu Google'a sorar, aboneliği yazar, onaylar. |
| Bildirimler | `supabase/functions/play-rtdn` | Google'ın yenileme/iptal/iade bildirimlerini işler. |

Paketler ve ürün kimlikleri (Play Console'da birebir bu adlarla açılır):

| Ürün kimliği | Paket | Fiyat (KDV dahil) |
|---|---|---|
| `tek_makine_aylik` | Tek Bölüm · Makine | 4.788 TL |
| `tek_tekstil_aylik` | Tek Bölüm · Tekstil | 4.788 TL |
| `tek_ayakkabi_aylik` | Tek Bölüm · Ayakkabı | 4.788 TL |
| `atolye_aylik` | Atölye · 3 bölüm | 9.588 TL |

İşletme (5 kişi) paketi ekip yönetimi gerektirdiği için sonraki aşamada eklenecek.

## Yapılacaklar (sırayla)

1. **Google ile giriş** — Google Cloud Console → API'ler ve Hizmetler → Kimlik bilgileri → OAuth istemci kimliği (Web uygulaması).
   Yetkili yönlendirme adresi: `https://anqfdlahimxdjovecsyk.supabase.co/auth/v1/callback`.
   Çıkan istemci kimliği ve gizli anahtarı Supabase → Authentication → Sign In / Providers → Google'a gir.
   Supabase → Authentication → URL Configuration → Redirect URLs'e uygulamanın `hesap/` adresini ekle.
2. **Android uygulaması (TWA)** — Play Faturalandırma yalnız Play'deki uygulamada çalışır. Uygulamanın PWA hazırlığı ve
   Android paketi (AAB) ayrı bir iş olarak yapılacak.
3. **Abonelik ürünleri** — Play Console → Para kazanma → Abonelikler: yukarıdaki 8 ürünü aç; her birinde tek temel plan
   (aylık ürüne 1 ay, yıllık ürüne 1 yıl), "geriye dönük uyumlu" işaretli, fiyat KDV dahil. Ücretsiz deneme teklifi **ekleme**
   (7 günlük deneme uygulamanın kendisinde).
4. **Servis hesabı** — Google Cloud'da servis hesabı aç, JSON anahtar indir. Play Console → Kullanıcılar ve izinler → bu hesabı davet et
   (finansal verileri görüntüleme + siparişleri ve abonelikleri yönetme). Supabase gizli ayarları: `GOOGLE_SERVICE_ACCOUNT` (JSON'un tamamı),
   `PLAY_PACKAGE` (paket adı).
5. **Gerçek zamanlı bildirimler** — Google Cloud Pub/Sub'da konu aç, Play Console → Para kazanma kurulumu'na konu adını gir.
   Konuya "push" aboneliği ekle: `https://anqfdlahimxdjovecsyk.supabase.co/functions/v1/play-rtdn?k=<RTDN_SECRET>`.
   Supabase gizli ayarı: `RTDN_SECRET` (uzun rastgele metin).
6. **Lisans testçisiyle dene** — Play Console → Lisans testi'ne kendi hesabını ekle; test kartıyla satın al, durum sayfasında görün.
7. **Kilidi sertleştir (kilidi açmadan önce, Android paketiyle birlikte)** — 18 Kasım güvenlik incelemesi:
   - Erişim bilgisi sunucuda imzalansın (Ed25519): `cizim:erisim` önbelleği telefonda elle değiştirilirse geçersiz sayılsın.
   - Google Play Integrity: uygulama Play'den gelmediyse ya da değiştirildiyse sunucu erişim vermesin.
   - Kilit denetimi yalnız `hesap/guard.js`'e bağlı kalmasın; bölüm modülleri de denetlesin.
   - Yalnız `dist/` yayınlansın (`node tools/build.mjs --obfuscate`, CI: "Yayın derlemesi" işi).
8. **Kilidi aç** — `hesap/config.js` içinde `PAYWALL = true`.

## Bilinen sınırlar

- Kilit tarayıcı tarafındadır. Kaynak kodu gören biri kilidi atlatabilir (7. madde bunu zorlaştırır); abonelik kaydı ise
  sunucudadır ve sahtelenemez. Yapay zekâ özellikleri sunucuda olduğu için kilit atlatılsa da hesap sınırına tabidir.
- Satın alma doğrulanamazsa (internet kesilmesi vb.) Google onaylanmamış aboneliği 3 gün içinde iade eder. Uygulama her
  açılışta Play'deki aboneliği sessizce yeniden doğrular; kullanıcı "Satın alımları geri yükle" ile de tetikleyebilir.

## Android uygulaması (Capacitor) — 25.11.2026

TWA yerine Capacitor kullanıldığı için Digital Goods API yok. Ödeme yerel eklentiyle yapılır:

- `mobil/yerel/Odeme.java`: Play Billing Library 8.3.0 (`urunler`, `satinAl`, `satinAlimlar`). Paket değişikliğinde eski jetonla
  `WITH_TIME_PRORATION`. Onaylama (acknowledge) uygulamada yapılmaz, sunucuda (`play-verify`).
- `hesap/billing.js` önce `window.__mobil.odeme`'yi (mobil/kopru.js) kullanır, yoksa Digital Goods API'yi.
- Kilit (`PAYWALL`) kapalıyken uygulamada paketler yalnız `hesap/config.js` `ODEME_DENEYENLER` hesaplarına görünür
  (e-postanın küçük harfli SHA-256 özeti). Bu hesap Play Console → Ayarlar → **Lisans testi** listesinde olmalı: satın alma
  gerçek para çekmez.
- Ürünler: `tools/play-urunler.mjs` (Actions → **Play ürünleri** → Run). Yalnız aylık 4 ürün (Play'de TR üst sınırı
  40.800 TL olduğu için yıllık paket şimdilik yok; 26.11.2026 kararı), her birinde `temel` adlı tek temel plan,
  yalnız Türkiye, KDV dahil TRY. Var olan ürüne dokunmaz.
- Sunucu sırları (Supabase → Edge Functions → Secrets): `GOOGLE_SERVICE_ACCOUNT` (servis hesabı JSON), `PLAY_PACKAGE`
  (`com.cizimatolyesi.app`). Servis hesabı: `play-yukleme@cizim-atolyesi.iam.gserviceaccount.com`.

## Promosyon kodu — 27.11.2026

Testçilere / tanıdıklara ödemesiz süreli erişim. Kontrolün tamamı sunucuda
(`supabase/migrations/20261127090000_promosyon_kodu.sql`); uygulama yalnız `promosyon_kullan(kod)` çağırır
(Hesabım → "Promosyon kodun var mı?").

- Kod düz saklanmaz, yalnız SHA-256 özeti. Biçim `CZ-XXXX-XXXX-XXXX-XXXX` (16 rastgele karakter, 80 bit).
- Kişi başına günde 5 deneme; hatalı kodlar güvenlik nöbetçisine olay olarak yazılır.
- Bir kod bir e-postada bir kez (hesabı silip açmak işe yaramaz); aktif promosyon varken ikinci kod kullanılamaz.
- Erişim `subscriptions` tablosuna `source='promo'`, `product_id='promo'` satırı olarak yazılır, kendiliğinden yenilenmez.
- Kod üretme ve iptal yalnız Supabase panelinden (SQL Editor), uygulamadan çağrılamaz:
  - Üret: `select * from public.promosyon_uret(adet, gün, array['makine','tekstil','ayakkabi'], kişi_başı_kullanım, son_tarih, 'etiket');`
    Düz kodlar yalnız bu sorgunun sonucunda bir kez görünür.
  - İptal: `select public.promosyon_iptal(kod_id, true);` (true: o kodla açılmış erişimler de hemen biter).
- Kodlar satılmaz: Google Play kuralına göre ücretli dijital erişim yalnız Play ödeme sistemiyle satılabilir.
