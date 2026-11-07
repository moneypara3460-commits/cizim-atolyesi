# Çizim Atölyesi

Telefonda çalışan basit bir 3D çizim (mini CAD) uygulaması. Parçaları ölçüyle oluşturur, birleştirir, oyuk açar, 3D yazıcı için STL olarak indirirsin.

**Güncel sürüm web sürümüdür** (`index.html`): https://moneypara3460-commits.github.io/cizim-atolyesi/
(GitHub → Settings → Pages → Deploy from branch → `main` / root ile yayınlanır.)

## Özellikler

- Şekiller: kutu (kenar yuvarlamalı), silindir, küre, koni / kesik koni, boru
- Birden fazla parça: **birleştir** veya **oyuk aç** (boolean / CSG, `three-bvh-csg`)
- Hazır delik tuşları: yuvarlak delik, kare delik
- Konum (X, Y alt, Z) ve döndürme (X°, Y°, Z°, parçanın alt orta noktası etrafında)
- Geri al / ileri al
- Projeleri telefonda kaydetme ve açma (tarayıcı belleği, `localStorage`); son durum otomatik saklanır
- STL dışa aktarma (mm, Z-yukarı, 3D yazıcı dilimleyicilerine uygun)
- Sesli komut (Türkçe, Chrome): kural tabanlıdır, yapay zekâ kullanmaz

### Sesli komut örnekleri

- "elli milimetre çapında yirmi milimetre yüksekliğinde silindir ekle"
- "kutu ekle 80 60 40"
- "10 milimetre delik aç" / "kare delik 8 milimetre"
- "küre ekle çap 30", "boru ekle dış çap 40 iç çap 30 yükseklik 20", "koni ekle alt çap 40 üst çap 10 yükseklik 50"
- "yüksekliği 30 yap", "çapı elli yap", "kenarları 5 milimetre yuvarla"
- "x ekseninde 45 derece döndür"
- "geri al", "yinele", "sığdır", "kaydet", "stl indir", "parçayı sil"

## Dosyalar

- `index.html` — uygulama (arayüz + 3D görüntüleyici)
- `logic.js` — test edilebilir mantık: parça varsayılanları, geri al geçmişi, STL yazıcı, sesli komut çözücü
- `tests/logic.test.mjs` — testler: `node tests/logic.test.mjs`
- `App.js`, `viewerHtml.js`, `package.json` — eski React Native / Expo sürümü (2. aşama; güncellenmedi)

## Yol haritası

1. ~~Kutu / silindir + ölçü girişi~~
2. ~~Çoklu parça, birleştirme, delik açma~~
3. ~~Geri al, yeni şekiller, döndürme, kaydetme, STL, sesli komut~~
4. Kroki çizip kalınlık verme (extrude)
5. Parçaları gruplayıp kopyalama / çoğaltma, ölçü etiketleri
6. Play Store için sarmalama (Expo WebView ya da Capacitor)
