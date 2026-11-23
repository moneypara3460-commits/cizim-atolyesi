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
- **Google ile giriş:** Google, uygulama içi WebView'da girişe izin vermez. Giriş sistem tarayıcısında açılır, oturum `com.cizimatolyesi.app://giris` ile uygulamaya döner.

**Supabase ayarı (bir kez):** Authentication → URL Configuration → Redirect URLs listesine `com.cizimatolyesi.app://giris` eklenmeli. Eklenmezse giriş tarayıcıda kalır, uygulamaya dönmez.

## Henüz yapılmayanlar (abonelik kilidi açılmadan önce)

- Google Play Billing eklentisi ve satın alma akışı (`hesap/billing.js` Android tarafı)
- Play Integrity ve sunucu imzalı erişim (ABONELIK.md madde 7)
- Satın alma jetonunun hesaba eşlenmesi (obfuscatedAccountId)
