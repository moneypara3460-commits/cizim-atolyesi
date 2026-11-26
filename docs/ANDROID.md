# Android paketi (Google Play)

Uygulama Capacitor ile Android'e paketlenir. Bilgisayar gerekmez: paketi GitHub Actions'taki **Android** iş akışı üretir.

## Nasıl çalışır

1. `tools/build.mjs --obfuscate` yayın kopyasını (`dist/`, küçültülmüş + karıştırılmış) üretir.
2. `mobil/hazirla.mjs web` bu kopyayı `mobil/www/` klasörüne alır ve her sayfanın başına `mobil/kopru.js` ekler.
3. Capacitor Android projesini kurar; `mobil/hazirla.mjs android` kamera iznini, giriş dönüş adresini, sürüm numarasını, simgeleri ve açılış rengini işler.
4. Gradle imzalı `.aab` (Google Play) ve `.apk` (telefona doğrudan kurmak için) üretir.

`mobil/android/`, `mobil/www/` depoya girmez; her pakette baştan üretilir.

## Ayarlar

| Ayar | Değer |
| --- | --- |
| Paket adı | `com.cizimatolyesi.app` (değiştirilemez) |
| Hedef Android | API 36 (Capacitor 8) |
| Sürüm | `1.0.<çalıştırma no>`, sürüm kodu = çalıştırma numarası |
| İmza | GitHub sırları `ANDROID_KEYSTORE_B64`, `ANDROID_KEYSTORE_SIFRE`; anahtar adı `cizim` |

İmza anahtarı (yükleme anahtarı) depoda tutulmaz. Kaybolursa Play Console → Uygulama bütünlüğü bölümünden yükleme anahtarı sıfırlama istenir (Play Uygulama İmzalama açıkken).

## Köprü (`mobil/kopru.js`)

Yalnız Android paketinde çalışır, web sitesinde yoktur.

- **Dosya kaydetme:** WebView `<a download>` ile dosya indiremez. Dosya geçici klasöre yazılır, Android paylaşım ekranı açılır.
- **Google ile giriş:** Google, uygulama içi WebView'da girişe izin vermez. Giriş sistem tarayıcısında açılır, `com.cizimatolyesi.app://giris` adresine tek kullanımlık bir kod döner (PKCE). Kod, uygulamanın cihazda sakladığı doğrulayıcıyla `/auth/v1/token?grant_type=pkce` üzerinden oturuma çevrilir; aynı adresi sahiplenen başka bir uygulama kodu yakalasa da kullanamaz (`tests/mobil-pkce.test.mjs`).

**Supabase ayarı (bir kez):** Authentication → URL Configuration → Redirect URLs listesine `com.cizimatolyesi.app://giris` eklenmeli. Eklenmezse giriş tarayıcıda kalır, uygulamaya dönmez.

## Henüz yapılmayanlar (abonelik kilidi açılmadan önce)

- Google Play Billing eklentisi ve satın alma akışı (`hesap/billing.js` Android tarafı)
- Play Integrity ve sunucu imzalı erişim (ABONELIK.md madde 7)
- Satın alma jetonunun hesaba eşlenmesi (obfuscatedAccountId)

## Google Play'e otomatik yükleme

Ana dala her birleştirmede `.github/workflows/android.yml` imzalı AAB'yi **dahili test** kanalına yükler
(`tools/play-yukle.mjs`, Google Play Developer API; dış paket yok). Gerekli sır: `PLAY_SERVICE_JSON`
(Google Cloud projesi cizim-atolyesi, servis hesabı `play-yukleme@cizim-atolyesi.iam.gserviceaccount.com`).
Play Console'da bu hesabın izinleri: test kanallarına yayınlama, mağazadaki varlığı yönetme, finansal verileri görüntüleme,
siparişleri ve abonelikleri yönetme. **Üretim izni yoktur:** kapalı teste ve üretime taşıma Play Console'dan elle yapılır.

## Davetli hesapla giriş (GEÇİCİ — Google Play incelemesi) — 26.11.2026

Uygulamada giriş yalnız Google iledir. Google Play incelemecisi inceleme Gmail'iyle girerken Google'ın yeni cihaz onayına
takıldığı için, kapalı test / inceleme süresince **tek bir davetli hesaba** e-posta + şifre girişi açıldı.

- Giriş ekranı (`mobil/sayfalar/giris.*`): küçük "Davetli hesapla giriş" bölümü → `mobil/kopru.js` `sifreyleGir`.
- Sunucu: `supabase/migrations/20261126180000_davetli_eposta_girisi.sql` e-posta ile **yeni hesap açılmasını reddeder**;
  izinli tek adres `cizimatolyesi.inceleme+play@gmail.com`. Hesap Supabase panelinde elle açılır (Auto confirm).
- Supabase → Authentication → Providers → **Email** açık olmalı (yalnız bu hesap için).
- Play Console → Uygulama içeriği → Uygulama erişimi: bu e-posta ve şifre (şifre depoya/sohbete yazılmaz).

**Kaldırma (inceleme / üretime çıkış bitince):** Email sağlayıcısını kapat; davetli hesabı sil; giriş ekranındaki
"Davetli hesapla giriş" bölümünü, `sifreyleGir`'i, `tests/mobil-davetli-giris.test.mjs`'i ve tetiği kaldır
(yeni bir migration ile `drop trigger eposta_kaydi_yalniz_davetli on auth.users`).
