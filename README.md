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

## Web sürümü (en kolay deneme yolu)

`index.html` tek sayfalık web sürümüdür, kurulum gerektirmez. GitHub Pages ile yayınlanır:
https://moneypara3460-commits.github.io/cizim-atolyesi/

Telefonun tarayıcısında açman yeterli. 3D kütüphaneler internetten yüklenir.

## Dosyalar

- `index.html` — web sürümü (arayüz + 3D görüntüleyici, tek dosya)
- `App.js` — React Native / Expo sürümünün arayüzü
- `viewerHtml.js` — Expo sürümündeki 3D görüntüleyici (WebView / iframe içinde)
- `package.json` — Expo sürümünün bağımlılıkları
