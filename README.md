# Çizim Atölyesi

Telefonda çalışan basit bir 3D çizim (mini CAD) uygulaması. Parçaları ölçüyle oluşturur, birleştirir ve oyuk açarsın.

## Şu an neler var (2. aşama)

- Kutu ve silindir, ölçüleri mm olarak girme
- Birden fazla parça: **birleştir** veya **oyuk aç** (boolean / CSG)
- Hazır delik tuşları: yuvarlak delik, kare delik
- Parçanın konumu (X, Y alt, Z)
- Parmakla döndürme ve yakınlaştırma

## Yol haritası

1. ~~Kutu / silindir + ölçü girişi~~
2. ~~Çoklu parça, birleştirme, delik açma~~
3. Geri al / yinele, STL dışa aktarma (3D yazıcı)
4. Sesli komut ("50 mm çapında silindir yap, ortasına 10 mm delik aç")
5. Kroki çizip kalınlık verme (extrude)

## Dosyalar

- `App.js` — arayüz (parça listesi, ölçü alanları, düğmeler)
- `viewerHtml.js` — 3D görüntüleyici (Three.js + three-bvh-csg), WebView / iframe içinde çalışır
- `package.json` — bağımlılıklar

## Snack'te açma

Tarayıcıda `snack.expo.dev` adresine git, GitHub'dan içe aktar seçeneğiyle bu depoyu aç.
Web önizleme iframe ile, telefonda (Expo Go) WebView ile çalışır. 3D kütüphaneler internetten yüklenir.
