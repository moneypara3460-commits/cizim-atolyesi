# Ayakkabı Modelhanesi — Aşama 1 teslim raporu

Tarih: 14.11.2026 · Sürüm etiketi: `20261114s` · Adres: `…/cizim-atolyesi/ayakkabi.html` (açılış ekranında üçüncü bölüm)

Dijital ayakkabı modelist sisteminin ilk aşaması: gerçek milimetre ölçüleriyle 2B stampa ve saya parçası hazırlama, pay motoru, teknik işaretler, parça eşleştirme ve üretim dosyaları (PDF, SVG, DXF).

## 1. Çalışan uygulama

- Açılış ekranı artık üç bölüm gösterir: **Makine ve Mühendislik**, **Tekstil ve Moda**, **Ayakkabı Modelhanesi**. Son seçim hatırlanır; bölüm içindeki "⌂ Ana ekran" seçime döner.
- Ayakkabı bölümü ayrı bir sayfadır (`ayakkabi.html`) ve ayrı bir klasörde durur (`ayk/`). Makine ve tekstil dosyalarına dokunulmadı. Tekstilin yalnızca üç saf (yan etkisiz) modülü salt okunur olarak içe aktarılır: Bezier eğrisi (`tx/curve.js`), vektör PDF yazıcı (`tx/pdf.js`), köşe işlemli ofset (`tx/woven/pattern.js`). Dosya indirme yardımcısı (`tx/download.js`) da aynı şekilde kullanılır.
- Projeler tarayıcının veritabanında (IndexedDB `cizim-ayk`) saklanır. Makine ve tekstil projelerinden ayrıdır.

## 2. Tamamlanan özellikler

| İstenen | Durum | Nasıl |
|---|---|---|
| 8 ana bölüm (Projelerim … Ayarlar), Türkçe, mm | ✅ | Üst sekmeler; telefonda yatay kayar |
| Yakınlaştır / uzaklaştır / kaydır / ortala | ✅ | İki parmak, fare tekerleği, +/− düğmeleri, boşlukta sürükle, "Ortala". Ölçek çubuğu gerçek mm gösterir |
| Proje oluşturma (ad, kod, tür, sağ/sol, numara, malzeme, yöntem, açıklama), kaydet, aç, düzenle | ✅ | Proje Dosyaları'nda düzenlenir |
| Serbest çizgi, nokta ekleme, eğri, Bezier | ✅ | Araçlar: Çizgi, Eğri (noktalardan geçen), Bezier (bas-sürükle tutamaç), Serbest (sadeleştirilip eğriye çevrilir), +Nokta (şekli bozmadan) |
| Çizgileri birleştirme, bölme, nokta taşıma | ✅ | Birleştir (uçtan uca, çakışan uçlar tek düğüm olur), Böl (düğümde ya da çizgide), Seç ile sürükle; düğüm türü köşe / yumuşak / kırık Bezier |
| Parça sınırı, kapalı geometri | ✅ | "+ Parça" ile sınır çiz ya da kapalı yardımcı çizgiyi "Saya parçası yap" |
| Kopyala, döndür, taşı, ayna | ✅ | Parça panelinde Δx/Δy, açı, ±90°, ayna (sağ ↔ sol değişir) |
| Ölçü girerek çizim | ✅ | Son noktadan uzunluk + açı (0° sağ, 90° yukarı) ya da mutlak X, Y |
| Geri al / ileri al | ✅ | Proje anlık görüntüleri (100 adım), Ctrl+Z / Ctrl+Y |
| Izgara ve yakalama | ✅ | Izgara 1/2/5/10 mm, ızgaraya, noktaya, 15° açıya yakalama |
| Saya parçaları (ad, kod, ölçü, geometri, sağ/sol, malzeme, teknik çizgiler) ayrı nesne | ✅ | Parça seçilince yalnız o parça düzenlenir, diğerleri soluk ve kilitli |
| Teknik katmanlar A–K (+ net çizgi, montaj, yardımcı) | ✅ | 14 katman; renk, kalınlık, görünürlük, çizgi türü düzenlenir; çıktılara da uygulanır |
| Pay motoru: dikiş, binme, katlama, kenar bitirme, montaj | ✅ | Her kenara tek pay türü; değerler parça bazında; her türün hangi üretim işlemine ait olduğu tabloda yazar. Köşe türü (sivri / dik / pah) kenar bazında |
| Otomatik pay hesabı / elle değiştirme | ✅ | Malzeme kalınlığı + üretim yöntemi → başlangıç değeri. Elle girilen değer otomatik hesapta korunur |
| Offset köşe / eğri / iç köşe hataları | ✅ | İç köşe kırpma, sıkı eğride düğüm temizleme, farklı payların buluştuğu dış köşede düğüm temizleme; kalan sorunlar parça kontrolünde "hata" olarak gösterilir |
| Dikiş çizgisi | ✅ | Kenar bazında: net çizgiden mesafe, 1–4 sıra, sıra arası, baştan / sondan boşluk |
| Çentik, binme noktası, delik, aksesuar, referans, ölçü, yazı | ✅ | Kenara oturan işaretler kenarla birlikte hareket eder |
| Parça eşleştirme ve kontrol | ✅ | Kenar uzunluk farkı, çentik / binme noktası sayısı ve konumu (etiketle ya da sırayla), karşılıklı / aynı yön, tolerans; hatalı geometri işareti; isteğe bağlı "B'deki işaretleri A'ya göre hizala" |
| Kampre ve modelleme payı altyapısı | ✅ veri | Parça bazında ön / arka kampre, ön / arka form verme, esneme yönü (ekranda ok), kalınlık, bölgesel paylar, kalıba çekme payı / gerdirme / yön. **Hesap yapılmaz** (Aşama 5) |
| Malzeme kütüphanesi (7 hazır + yeni) | ✅ | Kalınlık, esneme yönü, boy/en esneme %, açıklama. Bütün projelerde ortak; kullanılan malzemelerin kopyası projeye de yazılır |
| Otomatik kayıt, kaldığı yerden devam | ✅ | Her değişiklikten 0,5 sn sonra ve sayfa gizlenince kayıt; açılışta son proje açılır. Revizyon (son 30), geri yükleme, JSON yedek / içe aktarma |
| PDF: 1:1, A4 / A3 / özel, sayfalama, ölçek, parça adı / no, ölçüler | ✅ | Sığmayan parça bindirmeli döşeme sayfalarına bölünür (artı hizalama işaretleri). Her sayfada 50 mm kontrol çizgisi ve başlık bloğu |
| SVG (düzenlenebilir vektör) | ✅ | mm birimli, 1:1, her katman ayrı Inkscape katmanı |
| DXF (katmanlı) | ✅ | R12 / AC1009 ASCII, mm, 14 katman adı, çizgi türleri; eğriler 0,02 mm toleransla çoklu çizgi |

## 3. Proje dosya yapısı

```
ayakkabi.html          sayfa (CSP: yalnız kendi dosyaları; dış siteye istek yok)
ayk/
  geom.js              düğüm yolu geometrisi: Bezier, kenarlar, nokta ekle / sil, böl, birleştir, dönüşüm, ofset
  model.js             proje şeması (sürümlü), katmanlar, pay türleri, malzeme, kampre verisi, parça işlemleri, göç
  build.js             türetilmiş geometri: kesim çizgisi, pay / dikiş / işaret / ölçü / yazı çizim listesi, parça kontrolü
  match.js             parça eşleştirme ve kontrol
  export.js            PDF (yerleşim + döşeme), SVG, DXF
  store.js             IndexedDB / bellek deposu, revizyon, JSON yedek, malzeme kütüphanesi
  sample.js            isteğe bağlı örnek stampa (3 parça, eğitim amaçlı)
  editor.js            stampa editörü (tuval, araçlar, yakalama, dokunmatik)
  app.js, ayk.css      8 bölümlü arayüz, otomatik kayıt, geri al
tests/ayk-core.test.mjs    birim testleri (15)
tests/e2e/ayakkabi.mjs     uçtan uca tarayıcı testleri (21)
```
Değişen ortak dosyalar: `index.html` ve `acilis/` (üçüncü kapı, site simgesi), `tests/e2e/run.mjs` (açılışta üç seçenek), `.github/workflows/ci.yml`, `package.json`, `TESTLER.md`, `README.md`.

## 4. Kullanılan teknolojiler

Derleme adımı olmayan saf JavaScript ES modülleri, HTML Canvas 2D, IndexedDB. Yeni bağımlılık **eklenmedi**. PDF, SVG ve DXF yazıcıları bağımlılıksızdır. Testler: Node 22 (birim), Playwright + Chromium (uçtan uca); ölçü doğrulamasında poppler (`pdftoppm`, `pdfinfo`), `rsvg-convert` ve Python PIL kullanılır.

## 5. Test sonuçları (14.11.2026)

**Birim (`node tests/ayk-core.test.mjs`) — 15/15 geçti.** Analitik referanslarla: çeyrek çember Bezier uzunluğu ≈ πr/2; nokta ekleme / bölme / birleştirmede uzunluk korunur; dikdörtgen 200 × 100'de 5 mm pay → kesim alanı tam 210 × 110, kenar türlerine ayrı paylar (4 / 8 / 16 / 2 mm) → kesim kutusu tam; L parçada A + s·P + s²·(dış − iç köşe); çember + 5 mm pay ≈ π·55²; dikiş çizgisi tam 1,5 mm ve 1,5 + 2,5 mm içeride, uç kırpma; çentiğin kesim çizgisinden 3 mm derinliği; eşleştirme (uzunluk, etiket, ters yön, sayı farkı, silinmiş parça); hatalı geometri (kendini kesen, açık, sıfır alan); kayıt / revizyon / içe aktarma / şema denetimi; DXF (210 × 110, y ekseni çevrilmiş, ASCII, uygulamanın kendi DXF okuyucusuyla çevre 640 mm); SVG viewBox = mm; PDF A4 = 595,276 × 841,89 pt, döşeme, A3 ve özel sayfa.

**Uçtan uca (`node tests/e2e/ayakkabi.mjs`) — 21/21 geçti, art arda 3 çalıştırmada kararlı.** Gerçek Chromium'da kullanıcı gibi: açılışta üç kapı → proje oluştur → ölçü girerek 200 × 100 parça (tam ölçü) → fareyle ızgaraya oturan çizim, yakınlaştırınca mm değişmez → nokta ekle / böl / birleştir / Bezier → kenar türü ve 5 mm dikiş payı → binme 8 mm + dikiş çizgisi 1,5 mm → çentik, binme noktası, delik (tıklayarak) → katman kapat (DXF'ten de düşer) → taşı / döndür / geri al / ileri al → kopya + eşleştirme (uyumlu, sonra konum farkı yakalandı) → parça silme → **sayfayı yeniden yükle: proje birebir geri geldi** → revizyon + JSON yedek → yeni malzeme → **PDF, SVG, DXF indirildi ve dışarıda ölçüldü** → telefon (390 × 844 dokunmatik): dokunarak kapalı çizgi, parçaya dönüştürme, yatay taşma yok → sayfa hatası ve dış istek yok.

**Çıktıların gerçek ölçüsü** (beklenen kesim 210 × 113 mm: 200 + 2 × 5 dikiş; 100 + 8 binme + 5 dikiş):
| Dosya | Yöntem | Ölçülen |
|---|---|---|
| PDF (A3 yatay) | `pdftoppm` 254 dpi (10 piksel = 1 mm), kesim çizgisinin piksel kutusu | 210,0 × 113,3 mm (±0,4 tolerans; fark çizgi kalınlığı) |
| SVG | `rsvg-convert` 254 dpi | 210 × 113 mm (±0,4) |
| DXF | Uygulamanın DXF okuyucusu (`cad2d-geom.parseDXF`) | 210,000 × 113,000 mm |

**Mevcut testler:** bütün birim testleri (34 dosya, 463 test) ve açılış ekranı uçtan uca senaryosu geçti; makine ve tekstil kodu değişmedi.

## 6. Bilinen hatalar ve eksikler (dürüst liste)

- **Gerçek CAD programlarında açılış denenmedi.** Bu ortamda AutoCAD / LibreCAD / kesim yazılımı yok. DXF, R12 biçimine göre yazıldı ve iki ayrı okuyucuyla (testteki ayrıştırıcı ve uygulamanın kendi DXF içe aktarıcısı) ölçüsü doğrulandı; SVG `rsvg` ile, PDF `poppler` ile işlendi. İlk gerçek dosyayı kendi CAD / kesim yazılımında açıp 50 mm kontrol çizgisini ve bir parça ölçüsünü kontrol etmeni öneririm.
- DXF yazıları ASCII'dir (ğ → g, ş → s, ı → i): R12 okuyucularında Türkçe karakter bozulmasın diye. PDF ve SVG'de Türkçe tam.
- DXF'te eğriler kısa doğru parçalarına (0,02 mm sapma) çevrilir; SPLINE yazılmaz (R12'de yok).
- Bölge doldurma yok: parça, tek bir kapalı çizgiden oluşturulur; birbirini kesen birden çok çizginin oluşturduğu bölgeye dokunarak parça çıkarma ileride eklenebilir.
- Parça sınırı bölünemez / başka çizgiyle birleştirilemez (parçanın açık kalmasını önlemek için); düğüm eklenip taşınabilir.
- Otomatik pay değerleri atölye başlangıç değerleridir; kendi standardına göre düzeltilmelidir. Hazır malzeme kalınlık / esneme değerleri tahminidir.
- Kampre, form verme, esneme verileri yalnız saklanır; hesap yapılmaz.
- Eşleştirmede uzunluklar farklıysa işaretler oransal konumla karşılaştırılır; farklı bir dağıtım kuralı (ör. bolluk yalnız bir bölgede) henüz seçilemiyor.
- PDF'te parça yerleşimi basit sıralı yerleşimdir (kesim yerleşimi / malzeme optimizasyonu Aşama 8).
- Gizli sekmede tarayıcı veritabanı kapalıysa projeler geçici bellekte tutulur (ekranda uyarılır; JSON yedeği indirilmeli).

## 7. İkinci aşamaya geçiş için teknik hazırlık

**Aşama 2 — 3D kalıp yükleme, görüntüleme, ölçüm.** Projede `future.last3d` alanı ayrıldı (şu an `null`). Önerilen kayıt: `{ file: { name, format: 'stl'|'obj'|'step', bytesRef }, units: 'mm', transform, landmarks: { burunUcu, topukArka, kemer, ... }, measures: { boy, genislik, ... } }`. Büyük ikili dosya proje JSON'una gömülmez; IndexedDB'de ayrı anahtar (`f:<proje>:<dosya>`) olarak tutulur, projede yalnız referans durur. Depo zaten three.js 0.160.0 (vendor/) ve STL / OCCT (STEP) okuyucularını içeriyor; Aşama 2 bunları `ayk/` içinden salt okunur kullanabilir. 3B görünüm ayrı bir modül (`ayk/last3d.js`) olmalı, 2B editöre bağımlı olmamalı.

**Kalıp fotoğrafı (yapıldı, Kasım 2026).** `project.last`: yan ve alt görünüşün kâğıt (A4/A3) üstünde çekilmiş
fotoğrafından ölçülü dış çizgi (`ayk/last.js`: kâğıt bulma → perspektif düzeltme → renk farkıyla ayırma → sınır izleme → mm).
Bilinen kalıp boyu girilirse ölçek ona göre düzeltilir. Çizgi stampada referans katmanında, fotoğraf altlık olarak açılır.
`project.modelRef`: yapılacak modelin resimleri (en çok 6) ve notu; stampada köşedeki "Model" düğmesiyle görünür.
Sınır: fotoğraf 3D kalıbın gölge/yükseklik etkisini taşır; kesin ölçü için bilinen boy girilmeli.

**Aşama 3 — kamerayla tarama.** `future.scan`: ham nokta bulutu / ağ referansı + kalibrasyon (bilinen ölçülü işaret). Depodaki `hand/` kamera altyapısı (izin, önizleme) örnek alınabilir.

**Aşama 4 — fotoğraftan saya tanıma.** Çıktısı doğrudan bu aşamanın veri biçimine yazılmalı: her tanınan parça için `outline` (düğüm yolu, mm), `edges` (pay türü önerisi), `marks`. Ölçek, fotoğraftaki bilinen ölçüden alınmalı. Depodaki `photo2d.js` (elle çizimden çizgi / yay çıkarma) başlangıç olabilir.

**Aşama 5 — açınım ve kampre.** Girdi hazır: parça bazında `forming` (kampre, ön / arka form, bölgesel paylar, kalıba çekme, esneme yönü, kalınlık) ve malzeme (`thickness`, `stretchDir`, `stretchPct`). Çıktı, mevcut `outline` + `edges` yapısına yeni bir parça sürümü olarak yazılmalı (kaynağı `forming.source` ile işaretlenerek), böylece pay motoru, eşleştirme ve dışa aktarma değişmeden çalışır.

**Aşama 6 — grafik / logo.** Yeni bir katman (`grafik`) ve parça içi `graphics: [{ kind, svgRef, transform }]` alanı; `build.js` çizim listesine eklenir, çıktılar otomatik destekler.

**Aşama 7 — grading.** `future.grading`: numara serisi ve nokta bazlı artış kuralları (düğüm kimliği → Δx/Δy). Düğüm kimlikleri kalıcı olduğu için kurallar parçaya bağlanabilir; kenar işaretleri `edge + at` biçiminde olduğundan numaraya göre yeniden hesaplanır. Tekstildeki `tx/woven/grade.js` yöntemi örnek alınabilir.

**Aşama 8 — kesim yerleşimi.** `future.nesting`: deri (kusurlu bölge, sırt / karın kalite haritası) ve top malzeme için ayrı stratejiler. Kesim çizgisi `build.cutLine()` ile hazır; tekstildeki `tx/woven/marker.js` başlangıç olabilir.

**Genel kurallar:** her yeni modül `ayk/` altında ayrı dosya; saf hesap modülleri DOM'suz ve Node'da test edilebilir; proje şeması değişirse `SCHEMA` artırılır ve `migrate()` ile eski projeler yükseltilir (testli). Henüz çalışmayan özellik arayüzde çalışıyormuş gibi gösterilmez.
