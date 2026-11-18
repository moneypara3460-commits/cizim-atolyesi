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
| Veritabanı | Supabase `CIZIM-ATOLYESI` | `profiles` (14 günlük deneme sunucuda başlar), `subscriptions`. Kullanıcı yalnız kendi kaydını okur, yazamaz. |
| Doğrulama | `supabase/functions/play-verify` | Satın alma jetonunu Google'a sorar, aboneliği yazar, onaylar. |
| Bildirimler | `supabase/functions/play-rtdn` | Google'ın yenileme/iptal/iade bildirimlerini işler. |

Paketler ve ürün kimlikleri (Play Console'da birebir bu adlarla açılır):

| Ürün kimliği | Paket | Fiyat (KDV dahil) |
|---|---|---|
| `tek_makine_aylik` / `tek_makine_yillik` | Tek Bölüm · Makine | 4.788 TL / 47.880 TL |
| `tek_tekstil_aylik` / `tek_tekstil_yillik` | Tek Bölüm · Tekstil | 4.788 TL / 47.880 TL |
| `tek_ayakkabi_aylik` / `tek_ayakkabi_yillik` | Tek Bölüm · Ayakkabı | 4.788 TL / 47.880 TL |
| `atolye_aylik` / `atolye_yillik` | Atölye · 3 bölüm | 9.588 TL / 95.880 TL |

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
   (14 günlük deneme uygulamanın kendisinde).
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
