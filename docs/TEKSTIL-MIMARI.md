# Tekstil ve Moda çalışma alanı (dokuma / konfeksiyon + triko): Aşama 0 mimari planı ve risk raporu

Tarih: 11.11.2026 · Temel: sürüm 20261111e. Bu belge yalnızca plandır, hiçbir kod değişikliği yapılmamıştır.

Güncelleme (12.11.2026): "Tekstil, Moda ve Triko birleşik modül yapısı" kararına göre triko dalı eklendi. Tek ana çalışma alanı, ortak araçlar ve iki uzmanlık dalı var: dokuma / konfeksiyon ve triko.

## 1. Mevcut sistemin durumu

| Konu | Mevcut durum | Tekstil için anlamı |
|---|---|---|
| Yapı | Derleme adımı olmayan ES modülleri; tek sayfa (`index.html`). Önbellek, dosya adlarındaki `?v=` sürüm etiketiyle tazelenir. Kütüphaneler unpkg'den gelir (importmap). | Tekstil de aynı yapıda, ayrı dosyalarla yazılabilir; yeni bağımlılık gerekmez. |
| Ana uygulama | `app.js` 4 249 satır, tek bir global durum (`parts`, `sel`, …) ve 25 sekme. | Tekstil **bu dosyaya eklenmemeli**. Ekleme riski yüksek, makine alanını kırabilir. |
| 2B CAD | `cad2d.js` tam ekran açılan ayrı bir katman (`openCad2D`) ve kendi kaydı (`cizim:2d`). `cad2d-geom.js` saf geometri: kesişim, kırpma, ofset, aynalama, döndürme, kapalı döngü bulma, DXF okuma/yazma. | En iyi örnek mimari bu: bağımsız çalışma alanı ve kendi verisi. Saf geometri fonksiyonları tekstilde **değiştirilmeden, içe aktarılarak** kullanılabilir. |
| Eğri | Yalnız çizgi, yay ve daire var. **Bezier / spline yok.** | Kol oyuğu, yaka, kalça ve ağ eğrileri için kontrollü eğri şart. Tekstil kendi eğri modülüyle gelmeli. |
| Ofset | Çizgi ve yay için `offsetEntity` var. Kapalı konturun köşe işlemli ofseti yok. | Dikiş payı için ayrı bir kontur ofset modülü gerekir (köşe türleri: düz kesik, uzatma, ayna köşe). |
| Kayıt | `localStorage` kullanılıyor (tarayıcıda yaklaşık 5 MB sınır). Proje biçiminde **sürüm alanı yok**. | Tekstil projeleri büyük olur (bedenler, yerleşimler, 3B). **IndexedDB** ve sürümlü şema önerilir. |
| PDF | Yalnız raster: JPEG gömen `jpegToPdf`. | Kalıbın 1:1 basılması ve föy için **vektör PDF** ve A4 parçalı baskı (sayfa döşeme + hizalama işaretleri) yazılmalı. Bağımlılıksız yapılabilir. |
| Birim | mm. | Tekstil iç birimi mm olur; ekranda cm/inç seçeneği, makine alanının `fea2` birim sistemine dokunmadan sunulur. |
| Test / CI | Node birim testleri, Playwright E2E, GitHub Actions (3 iş). | Tekstil testleri aynı çatıya eklenir: `tests/tx-*.test.mjs`, E2E senaryosu "T". |

## 2. Önerilen mimari

**Temel karar:** Tekstil, aynı depoda **ayrı bir sayfa** (`tekstil.html`) ve ayrı modüller (`tx/` klasörü) olarak yazılır. Makine alanı tekstile hiç bağımlı olmaz. Tekstil ise makine tarafından yalnız saf, yan etkisiz modülleri içe aktarır.

```
index.html  ── açılış seçimi ──►  Makine ve Mühendislik (mevcut app.js, değişmez)
                              └─►  tekstil.html → tx/app.js
                                   Yeni proje: Dokuma/Konfeksiyon · Triko · Karma Koleksiyon
                                   (seçim yalnız ilgili araçları öne çıkarır; ortak araçlar her dalda açık)
tx/
  ORTAK
  model.js      proje şeması, sürüm, göç (migration), doğrulama; dal bazlı alt şemalar
  store.js      IndexedDB kayıt/açma, otomatik kayıt, dışa/içe JSON yedek
  collection.js koleksiyon, ürün, varyant (model × renk × beden)
  library.js    renk, kumaş, iplik, aksesuar kartları ("tahmini" bayrağı ile)
  sizes.js      beden tabloları (kullanıcı tanımlı + kaynağı yazılı örnekler)
  curve.js      kübik Bezier / Catmull-Rom, uzunluk, bölme, en yakın nokta, çokgen yaklaşımı
  sketch-tx.js  teknik çizim (ön/arka/yan, simetri, katman, şablon, detay kütüphanesi)
  techpack.js   teknik föy, malzeme listesi, maliyet (dal modüllerinden veri alır)
  pdf.js        vektör PDF, 1:1 A4 döşemeli baskı, föy sayfaları
  DOKUMA / KONFEKSİYON  (tx/woven/)
  contour.js    kapalı kontur, öz-kesişim, alan, yön, köşe işlemli ofset (dikiş payı)
  piece.js      kalıp parçası: dikiş hattı, kesim hattı, pens, çıt, iplik yönü, etiket
  grade.js      nokta bazlı grading (Δx/Δy), dikiş hattı uzunluk eşleşmesi
  nest.js       kumaş yerleşimi (worker), verim/fire, hav / desen / katlı kumaş kısıtları
  dxf-aama.js   kalıp DXF (AAMA / ASTM D6673 düzeni)
  TRİKO  (tx/knit/)
  stitch.js     ilmek sözlüğü: düz, ters, askı (tuck), atlama (miss), aktarma, saç örgüsü çaprazı; ön/arka iğne yatağı
  chart.js      örgü deseni ızgarası (iğne × sıra), tekrar (repeat), jakar renk haritası, ribana / saç örgüsü şablonları
  gauge.js      numune (swatch): 10 cm'deki ilmek / sıra; ölçü ↔ ilmek sayısı dönüşümü
  shape.js      parça veya bütün giysi triko kalıbı: sıra bazlı eksiltme / artırma (fully-fashioned) tablosu
  yarn.js       iplik numarası (Nm, Ne, tex, dtex) dönüşümleri; ilmek boyu → iplik uzunluğu → gramaj ve tüketim
  machine.js    makine profili (marka/model, iğne yatağı, gauge, besleyici sayısı, desen genişliği sınırı) ve uyumluluk kontrolü
  export-*.js   yalnız doğrulanmış makine biçimleri için çıktı (bkz. risk 12)
  3B  (tx/3d/)  dokuma için kumaş çözücüsü; triko için ayrı parametreli model; önizleme ve fizik ayrı adlandırılır
```
Paylaşılan modüller **salt okunur** kullanılır. Bunlar: `cad2d-geom.js` (kesişim, DXF temel yazıcı, dönüşümler) ve `logic.js` içindeki yardımcılar (`fmtNum`, `esc`). Bunlarda tekstil için değişiklik gerekirse önce makine testleri çalıştırılır ve onay istenir.

**Açılış seçimi:** `index.html` ilk açılışta iki büyük düğmeli seçim ekranı gösterir (`ws.js`); son seçim hatırlanır. Makine alanında Projeler (💾) penceresinde "Tekstil ve Moda" bağlantısı, tekstilde "⚙ Makine" düğmesi var. Makine tarafında değişen tek dosya `index.html` (bir satır); `app.js` değişmedi.

### Proje verisi (sürümlü, türlendirilmiş)

```json
{ "kind": "cizim.textile", "schema": 1, "branch": "woven | knit | mixed", "id": "…", "name": "…", "rev": 12, "units": "mm",
  "collection": { "season": "…", "products": [ { "id": "p1", "name": "Gömlek", "branch": "woven", "variants": [ { "color": "c1", "sizes": ["S","M","L"] } ] },
                                              { "id": "p2", "name": "Kazak", "branch": "knit", … } ] },
  "library":   { "colors": [], "fabrics": [ { "id", "type", "width", "gsm", "stretch", "shrink", "estimated": ["stretch"] } ],
                 "yarns":   [ { "id", "fiber", "count": { "system": "Nm", "value": 28, "ply": 2 }, "estimated": [] } ], "trims": [] },
  "sizeTables": [ { "id", "source": "kullanıcı", "base": "M", "sizes": [], "measures": {} } ],
  "sketches":  [ … teknik çizim (ortak) … ],
  "woven": { "pieces": [ { "product": "p1", "seam": { "path": [] }, "allowance": [], "darts": [], "notches": [], "grain": [], "grade": {} } ], "markers": [] },
  "knit":  { "swatches": [ { "yarn": "y1", "stitch": "düz", "st10cm": 28, "row10cm": 40, "loopLen": null, "washed": false } ],
             "charts":   [ { "id", "w": 120, "h": 200, "cells": "…kodlu dizi…", "legend": {}, "repeat": [24, 30] } ],
             "pieces":   [ { "product": "p2", "chart": "ch1", "swatch": "sw1", "shaping": [ { "row": 80, "left": -1, "right": -1 } ] } ],
             "machine":  null },
  "techpack": { … }, "revisions": [ { "rev", "at", "note" } ] }
```
- `kind` ve `schema` her projede bulunur. Eski şemalar `model.js` içindeki göç fonksiyonlarıyla yükseltilir; bu da test edilir.
- **Ortak veri, ayrı teknik kurallar:** ürün, renk, beden, koleksiyon, maliyet ve föy ortak. Dokuma kalıbı (`woven`: sürekli eğri geometrisi, mm) ile triko (`knit`: ilmek ızgarası, ilmek/sıra sayısı) **ayrı alt şemalar**; biri diğerine dönüştürülmeye zorlanmaz. Her dal kendi doğrulamasını yapar. Triko parçasının mm ölçüsü yalnız numune (gauge) üzerinden hesaplanır ve bu, föyde böyle yazılır.
- Makine projeleri (`cizim:projects`) ile tekstil projeleri (IndexedDB `cizim-tx`) **ayrı yerde** tutulur. Biri diğerini okuyamaz, bozamaz.

### Telefon, tablet, masaüstü

- Önce telefon için tasarlanır: büyük dokunma hedefleri, iki parmakla yakınlaştırma ve kaydırma, uzun basınca bağlam menüsü.
- Sayısal giriş her araçta vardır, çünkü parmakla hassas nokta koymak zor. Makine 2B CAD'deki yaklaşımın aynısı.
- Ağır hesaplar (yerleşim, grading kontrolü, 3B kumaş) Web Worker'da çalışır.

## 3. Aşamalar ve testler (birleşik prompttaki numaralarla)

| Aşama | İçerik | Bitti sayılma ölçütü (test) | Durum |
|---|---|---|---|
| 0 | Mimari, veri modeli, riskler (bu belge) | — | ✅ |
| 1 | Ortak tekstil proje altyapısı: çalışma alanı seçimi, `tekstil.html`, proje türleri (dokuma / triko / karma), koleksiyon, ürün, renk, beden tablosu, malzeme (kumaş / iplik / aksesuar), föy temeli, dal bazlı doğrulama, IndexedDB kaydı, revizyon, JSON dışa / içe aktarma, şema göçü | Bkz. bölüm 6 | ✅ (12.11.2026) |
| 2 | Teknik moda çizimi: `curve.js`, ön / arka / yan, simetri, katman, ölçü; dokuma ve triko şablonları; detay kütüphanesi; PNG, vektör PDF / SVG | Eğri uzunluğu analitikle ±0,01 mm; simetri tam; PDF ölçeği 1:1 | ✅ (12.11.2026) — bkz. bölüm 7 |
| 3 | Dokuma kalıbı: parça, pens, çıt, dikiş payı (seçili kenar / tüm çevre, köşe türleri), böl, birleştir, döndür, aynala, kontur ve eğri doğrulama | Referans kalıplarda pay alanı / çevresi analitikle eşleşir; öz-kesişim yakalanır | ✅ (12.11.2026) — bkz. bölüm 8 |
| 4 | Beden ve grading: nokta bazlı grading, kişiye özel ölçü altyapısı, bütünlük kontrolü; trikoda bedene göre ilmek / sıra sayıları | Bedenler arası fark kurala tam eşit; dikiş hattı eşleşmesi raporlanır | ✅ dokuma (12.11.2026) — bkz. bölüm 9; triko ilmek sayıları Aşama 5 ile |
| 5 | Triko desen ve ilmek: ilmek sözlüğü, ızgara, düz / ters / ribana / saç örgüsü / jakar, tekrar, renk raporu, numune ve gauge, sıra bazlı eksiltme / artırma | Ribana ve saç örgüsü kuralları; gauge dönüşümü elle hesapla tam; eksiltme tablosu hedef ölçüye ±1 ilmek; desteklenmeyen yapıda açık uyarı | ✅ (12.11.2026) — bkz. bölüm 10 |
| 6 | Kumaş, iplik, aksesuar kütüphanesi (ayrıntılı); iplik numarası dönüşümleri; tüketim, gramaj, maliyet | Nm / Ne / tex / dtex dönüşümleri tam; numunesiz sonuç "tahmini" | ✅ (12.11.2026) — bkz. bölüm 11 |
| 7 | Kumaş yerleşimi ve kesim optimizasyonu | Kısıt ihlali sıfır; verim alt sınırla raporlanır | ✅ (12.11.2026) — bkz. bölüm 12 |
| 8 | Triko makine profilleri ve üretim çıktısı | Doğrulanamayan makine için çıktı yok, gerekçe yazılı (risk 12) | ✅ (12.11.2026) — bkz. bölüm 13 |
| 9 | 3B giysi ve kumaş / örgü simülasyonu | Önizleme ve fizik ayrı adlandırılır; çözücü analitik testlerle doğrulanır | ✅ (12.11.2026) — bkz. bölüm 14 |
| 10 | Üretim föyü ve maliyet: işçilik, operasyon sırası, dikiş türü, vektör PDF | Föy projeden üretilir; maliyet varsayımları yazılı | ✅ (12.11.2026) — bkz. bölüm 15 |
| 11 | Uçtan uca tekstil testleri (promptta 1–14 numaralı liste), kalite raporu | Kalite raporuna "Tekstil" bölümü | Aşama 1 testleri var |

### Eklenen / değiştirilen dosyalar ve bağımlılıklar

| Dosya | Durum | Not |
|---|---|---|
| `tekstil.html` | Yeni | Tekstil sayfası; makine sayfasıyla aynı tasarım dili (koyu tema, aynı düğme ve alan stilleri) |
| `tx/model.js` | Yeni | Saf veri modeli, dal kuralları, doğrulama, varyant, malzeme maliyeti, föy özeti, şema göçü |
| `tx/store.js` | Yeni | IndexedDB / bellek deposu, revizyon, JSON dışa / içe aktarma |
| `tx/app.js` | Yeni | Tekstil arayüzü |
| `ws.js` | Yeni | Çalışma alanı seçim ekranı ve Projeler penceresine "Tekstil ve Moda" bağlantısı |
| `index.html` | **Değişti (1 satır)** | `ws.js` yüklenir. `app.js` ve diğer makine dosyaları değişmedi |
| `tests/tx-model.test.mjs` | Yeni | 11 Node testi |
| `tx/curve.js` | Yeni (Aşama 2) | Kübik Bezier / Catmull-Rom, yay uzunluğu (Gauss–Legendre), bölme, en yakın nokta, düzleştirme, aynalama |
| `tx/drawing.js` | Yeni (Aşama 2) | Çizim modeli: görünüş, katman, varlıklar, simetri, hizalama, isabet / yakalama, doğrulama, 13 şablon, 15 detay |
| `tx/export2d.js`, `tx/pdf.js` | Yeni (Aşama 2) | SVG (1 birim = 1 mm), bağımlılıksız vektör PDF (standart ölçekler, başlık bloğu, ölçü tablosu), tuval / PNG |
| `tx/sketch-ui.js` | Yeni (Aşama 2) | Tam ekran çizim editörü |
| `tests/tx-drawing.test.mjs` | Yeni (Aşama 2) | 14 Node testi |
| `tx/woven/pattern.js` | Yeni (Aşama 3) | Kalıp parçası ve kenar modeli, kenar bazında dikiş payı ve köşe türleri, çıt, pens, işaret, bölme, birleştirme, katı açma, dikiş eşleşmesi, doğrulama |
| `tx/woven/blocks.js` | Yeni (Aşama 3) | Ölçüden temel bloklar: gömlek takımı (7 parça) ve düz etek takımı (3 parça), dikiş eşleşmeleriyle |
| `tx/woven/pattern-export.js` | Yeni (Aşama 3) | Kalıp çizimi, SVG 1:1, 1:1 A4 / A3 döşemeli PDF |
| `tx/woven/pattern-ui.js` | Yeni (Aşama 3) | Kalıp editörü |
| `tests/tx-pattern.test.mjs` | Yeni (Aşama 3) | 14 Node testi |
| `tx/woven/grade.js` | Yeni (Aşama 4) | Kural tabanlı grading, blok ölçüsünden kural, orantılı kural, beden karşılaştırma tablosu |
| `tests/tx-grade.test.mjs` | Yeni (Aşama 4) | 8 Node testi |
| `tx/knit/chart.js`, `tx/knit/shape.js` | Yeni (Aşama 5) | İlmek sözlüğü, şema, doğrulama, tekrar, yazılı talimat, CSV; numune, ölçü ↔ ilmek, şekillendirme dağılımı, parça hesabı, bedenler |
| `tx/knit/chart-export.js`, `tx/knit/chart-ui.js` | Yeni (Aşama 5) | Şema çizimi (tuval / PNG, çok sayfalı A4 PDF), şema editörü |
| `tests/tx-knit.test.mjs` | Yeni (Aşama 5) | 11 Node testi |
| `tx/materials.js` | Yeni (Aşama 6) | Numara dönüşümleri, hazır kartlar, dokuma kumaş tüketimi, triko ilmek toplamı / ilmek boyu / gramaj |
| `tests/tx-materials.test.mjs` | Yeni (Aşama 6) | 7 Node testi |
| `tx/woven/marker.js` | Yeni (Aşama 7) | Kesim planı: parça örnekleri (açık en / katlı), yönlendirme, ızgara tabanlı otomatik yerleşim, desen eşleştirme, kesin çokgen doğrulaması, verim / fire |
| `tx/woven/marker-ui.js` | Yeni (Aşama 7) | Kesim planı editörü (otomatik + elle sürükleme / 180°), PDF (A3, ölçekli) ve SVG 1:1 çıktı |
| `tests/tx-marker.test.mjs` | Yeni (Aşama 7) | 10 Node testi |
| `tx/knit/machine.js` | Yeni (Aşama 8) | Makine profilleri, doğrulama, uyumluluk, operatör programı, delikli kart, knitout ve yapısal benzetim |
| `tests/tx-machine.test.mjs` | Yeni (Aşama 8) | 9 Node testi |
| `tx/sim3d/fit.js` | Yeni (Aşama 9) | Kalıptan giysi çevresi, bolluk raporu, basitleştirilmiş vücut formu, 3B kabuk halkaları |
| `tx/sim3d/drape.js` | Yeni (Aşama 9) | Dökümlülük benzetimi (XPBD), gölge alanı, kalibrasyon, referans karşılaştırma durumu |
| `tx/sim3d/view3d.js` | Yeni (Aşama 9) | three.js görüntüleyici (ÖNİZLEME etiketli) |
| `tests/tx-sim3d.test.mjs` | Yeni (Aşama 9) | 7 Node testi |
| `tx/production.js` | Yeni (Aşama 10) | Operasyon şablonları, SMV özeti, maliyet kartı, sipariş malzeme ihtiyacı |
| `tx/production-pdf.js` | Yeni (Aşama 10) | Çok sayfalı üretim föyü PDF'i |
| `tests/tx-production.test.mjs` | Yeni (Aşama 10) | 6 Node testi |
| `tests/e2e/run.mjs` | Değişti | W (çalışma alanı) ve T (tekstil) senaryoları; makine senaryoları seçim ekranını atlamak için `cizim:workspace = makine` ile başlar |

Yeni dış bağımlılık yok: tarayıcının kendi IndexedDB'si kullanılır. Three.js tekstil tarafında Aşama 9'a kadar yüklenmez.

### Makine ve Mühendislik alanına etkisi

- Makine kodu (`app.js` ve modülleri) değişmedi, tekstil modüllerini içe aktarmıyor. Tekstil de makine modüllerini içe aktarmıyor; bunu test 11 denetliyor.
- **Görünen tek fark ilk açılış:** seçim ekranı. "Makine ve Mühendislik" seçilince uygulama eskisi gibi açılır ve seçim hatırlanır. Son seçim Tekstil ise ana adres tekstil sayfasına yönlenir; makineye `index.html?ws=makine` ya da tekstil sayfasındaki "⚙ Makine" düğmesiyle dönülür.
- Makine projeleri (`localStorage`) ile tekstil projeleri (IndexedDB `cizim-tx`) ayrı yerde. E2E testi makine kaydının tekstil işlemlerinde değişmediğini doğrular.
- Regresyon: 327 Node testi ve 21 tarayıcı testi geçti; CNC torna yine blokeli.

## 4. Riskler

| # | Risk | Önem | Önlem |
|---|---|---|---|
| 1 | Makine alanının bozulması | Yüksek | Ayrı sayfa ve klasör; makineye tek dokunuş açılış seçimi; her tekstil görevinde makine testleri (316 birim + 17 E2E) yeniden çalıştırılır. |
| 2 | Tarayıcı kayıt sınırı (localStorage ~5 MB), telefonda veri kaybı | Yüksek | IndexedDB, kalıcı depolama izni (`navigator.storage.persist`), JSON yedek dosyası indirme. Tarayıcı verisi silinirse projeler gider; kullanıcıya açıkça söylenir. |
| 3 | Dikiş payı ofsetinde köşe ve eğri hataları (öz-kesişim, ters dönmüş kontur) | Yüksek | Eğri → yoğun çokgen yaklaşımıyla sağlam ofset; sonuç kontur doğrulamasından geçmeden kabul edilmez; referans kalıp testleri. |
| 4 | Kumaş yerleşimi NP-zor; telefonda yavaş | Orta | Worker, süre sınırı, en iyi bulunan sonuç; verim alt sınırla birlikte raporlanır; "optimum" iddiası yok. Fabrika düzeyi (yüzlerce parça) için masaüstü önerilir. |
| 5 | 3B kumaş simülasyonu telefonda ağır; fiziksel doğruluk iddiası | Yüksek | Ayrı aşama; önizleme ile fizik ayrı adlandırılır; kalite seviyeleri; doğrulanmamış sonuç "fiziksel olarak doğru" diye sunulmaz. Gerçek kumaşla karşılaştırma yapılmadan bu iddia edilmez. |
| 6 | Beden standardı yanılgısı | Orta | Tek evrensel tablo yok. Örnek tablolar "örnek" diye etiketlenir; kullanıcı kendi tablosunu tanımlar; ülke/marka tablosu kaynağıyla girilir. |
| 7 | Dosya biçimi uyumu: tekstil CAD dünyasında yaygın açık biçim AAMA/ASTM DXF; Gerber, Lectra, Optitex yerel biçimleri kapalı ve lisanslı | Orta | Yalnız gerçekten okunup yazılabilen biçimler listelenir; kapalı biçimler desteklenmez ve öyleymiş gibi gösterilmez; T7'de gerçek örnek dosyalarla doğrulanır. |
| 8 | 1:1 baskı ölçek hatası (yazıcı "sayfaya sığdır") | Orta | Her sayfada 10 cm kontrol karesi ve hizalama işaretleri; kullanıcıya %100 baskı uyarısı. |
| 9 | Kapsamın çok büyük olması: "tam profesyonel" hedefi tek seferde gerçekçi değil | Yüksek | Her görev çalışan prototip ve testle teslim edilir; profesyonel doğruluk aşamalı gelir; kalite raporunda her özellik "çalışıyor / kısmi / yok" diye işaretlenir. |
| 10 | `app.js` gibi tek dev dosyaya dönüşme | Orta | `tx/` içinde modül başına bir dosya; arayüz ile hesap ayrı; saf hesap modülleri Node'da test edilir. |
| 11 | Bilgisayarsız kullanıcı (yalnız telefon) | Orta | Her özellik telefonda kullanılabilir olmalı; E2E telefon emülasyonu zorunlu senaryo; gerçek cihaz denemesi kullanıcıdan istenir. |
| 12 | Triko makine programı biçimleri | Yüksek | Endüstriyel triko makinelerinin desen / program sistemleri çoğunlukla üreticiye özgü ve kapalı. Genel bir dosyanın her makinede çalıştığı iddia edilmez. Önce makineden bağımsız çıktı verilir: desen ızgarası ve sıra sıra talimat. Makineye özgü çıktı, T9'da biçimi açık ve doğrulanabilen makineler araştırılarak tek tek eklenir. Desteklenmeyen makine "tasarım ve teknik çıktı" düzeyinde kalır. |
| 13 | Triko ölçüsünün numuneye bağlı olması (gauge yanlışsa bütün bedenler kayar) | Yüksek | Her triko parçası bir numuneye bağlanır. Yıkanmış / yıkanmamış numune ayrımı yapılır. Ölçü ↔ ilmek dönüşümü föyde açıkça yazılır. Numunesiz hesap "tahmini" diye işaretlenir. |
| 14 | İplik tüketimi ve gramaj: ilmek boyu ölçülmeden doğru hesaplanamaz | Orta | İlmek boyu kullanıcıdan (numuneden ölçülen) istenir. Yoksa yaklaşık formülle hesaplanır ve sonuç "tahmini" olarak gösterilir. |
| 15 | Dokuma ve trikoyu tek veri modeline zorlamak | Orta | Ayrı alt şemalar (`woven`, `knit`); yalnız ürün, renk, beden, maliyet, föy ortak. Karma koleksiyonda her ürün kendi dalının kurallarıyla doğrulanır. |
| 16 | Triko 3B (ilmek düzeyi) simülasyonu telefonda çok ağır | Yüksek | Önce yüzey düzeyinde önizleme, örgüye özgü parametrelerle (esneme, kalınlık). İlmek düzeyi fizik yalnız doğrulanabilir bir çözücüyle ve gerekirse masaüstünde. |

## 5. Kararlar

Birleşik prompt bu belgenin önerdiği yapıyı onayladı: tek "Tekstil ve Moda" alanı, iki dal, ortak üst şema ve ayrı alt şemalar, aşamalı geliştirme. Aşama 1 bu kararlarla uygulandı.

## 6. Aşama 1 raporu (12.11.2026)

**Çalışanlar** (kodla ve testle):
- Çalışma alanı seçimi, tekstil sayfası, makineye geri dönüş.
- Proje türleri. Dokuma projesi yalnız dokuma ürünlerini ve kumaşı, triko projesi yalnız triko ürünlerini ve ipliği gösterir. Karma koleksiyonda iki dal birlikte bulunur ve her ürün kendi dalının kurallarıyla doğrulanır.
- Koleksiyon: marka ve sezon. Ürün: ad, tür, model kodu, sezon, renk, beden tablosu, bedenler, malzeme ve kullanım rolü (ana / astar / yardımcı / aksesuar), ürün başına miktar.
- Renk kütüphanesi.
- Beden tabloları. Kaynak zorunlu; örnek tablo "standart değildir" diye işaretli. Ölçüler mm saklanır, cm gösterilir.
- Malzeme kartları: kumaş, iplik, aksesuar. Bilinmeyen değer boş kalır, uydurulmaz. Ölçülmemiş değer "tahmini" işaretlenir. Fiyat, birim, tedarikçi ve stok alanları var.
- Dal kuralları: dokuma ürününe iplik, triko ürününe kumaş ana malzeme olarak bağlanamaz; aksesuar ana malzeme olamaz.
- Doğrulama listesi: hata ve uyarı ayrı.
- Varyantlar (renk × beden, SKU kodu).
- Malzeme maliyeti: yalnız miktarı ve fiyatı bilinen satırlar toplanır, eksikler adıyla listelenir.
- Föy özeti ve tarayıcıdan yazdırma / PDF.
- Otomatik kayıt (IndexedDB) ve revizyon kaydı (tam kopya, son 30). Eski revizyona dönüş yeni bir revizyon olarak kaydedilir.
- JSON dışa / içe aktarma; içe aktarılan proje yeni kimlik alır. Bozuk veya daha yeni şemalı dosya reddedilir; eski şema yükseltilir.

**Henüz olmayanlar:** teknik çizim, kalıp, grading, örgü deseni, ayrıntılı tüketim / gramaj, yerleşim, makine çıktısı, 3B, vektör PDF föy. "Dal araçları" sekmesinde hangi aşamada geleceği yazılı; hiçbiri çalışıyor gibi gösterilmez.

**Testler:**
- `tests/tx-model.test.mjs` (Node): 11 test, 11 geçti.
- Tarayıcı (Chromium, telefon ve masaüstü emülasyonu): 4 senaryo (W ve 3 × T), 4 geçti. Gerçek telefonda denenmedi.
- Makine regresyonu: 327 Node + 21 tarayıcı testi geçti, 1 blokeli (torna).

**Testte bulunup düzeltilen 2 hata:**
- Ana sayfada proje türü seçilirken yazılan proje adı siliniyordu.
- Çok hızlı geçişte proje ekranının üstüne eski ana sayfa çiziliyordu.

## 7. Aşama 2 raporu: teknik moda çizimi (12.11.2026)

**Çalışanlar** (kodla ve testle):
- **Teknik çizim sekmesi.** Ürüne bağlı ya da bağımsız çizim oluşturulur. Çizimin dalı ürünün dalıdır.
- **Görünüşler ve araçlar.** Ön, arka ve yan görünüş var. Araçlar:
  - Seç, çizgi, düzgün eğri (Catmull-Rom → kübik Bezier), nokta, ölçü (gerçek uzunluk, cm), açıklama yazısı, detay.
  - Simetri: eksene göre tam aynalı çizim.
  - Yakalama: köşelere ve orta eksene; isteğe bağlı 5 mm ızgara.
  - Çoklu seçim; hizalama (sol, sağ, üst, alt, ortalar, eksene ortala).
  - Kaydırma (sürükleyerek ya da sayıyla), 15° döndürme, aynalı kopya.
  - Çizgi türü (düz / dikiş / noktalı / katlama) ve kalınlık.
  - Sayıyla nokta girişi; geri al / ileri al.
- **Katmanlar.** Ekle, adlandır, göster / gizle, kilitle, sil. Yeni öğeler şablon dışındaki katmana eklenir; bu yüzden şablonu yeniden uygulamak kullanıcının çizdiklerini silmez.
- **Şablonlar (13).**
  - Dokuma: tişört, gömlek, ceket, mont, elbise, pantolon, etek.
  - Triko: kazak, süveter, hırka, yelek, atkı, bere.
  - Ölçüleri cm ile düzenlenir. Beden tablosundan göğüs / bel / basen önerilir; bu öneri bolluk payı ekler ve yaklaşıktır, kullanıcı kontrol eder.
  - Ön görünüşe ölçü çizgileri eklenir.
- **Detay kütüphanesi (15).** Düğme, fermuar, düğme patı, gömlek yakası, polo yaka, bisiklet ve V yaka ribanası, manşet, yama / sivri / kapaklı / fileto cep, kemer köprüsü, ribana bandı, saç örgüsü işareti.
- **Çıktılar.**
  - PNG.
  - SVG: 1 birim = 1 mm, gerçek boyut.
  - Vektör PDF: A4 / A3, standart ölçekler (1:1, 1:2, 1:2,5, 1:5, 1:10, 1:20), başlık bloğu, 50 mm kontrol çubuğu, ölçü tablosu. Tablo sığmazsa ikinci sayfaya geçer. Türkçe harfler PDF'in yerleşik yazı tipiyle doğru çıkar.
- **Kayıt.** Çizim, projeyle birlikte kaydedilir, revizyona ve JSON yedeğe girer.

**Doğrulama ve toleranslar** (`tests/tx-drawing.test.mjs`, 14 test):

| Konu | Referans | Tolerans |
|---|---|---|
| Eğri uzunluğu | Parabol kapalı formülü | ±0,01 mm hedef, ölçülen < 1e-6 mm |
| Bezier çember uzunluğu | 2πr | ±%0,03 (bilinen yaklaşım hatası) |
| Düzleştirme sapması | — | ≤ 0,05 mm |
| Bölme ve uzunluk konumu | — | 1e-7 mm |
| Catmull-Rom | Noktalardan geçiş ve C1 süreklilik | 1e-9 |
| En yakın nokta | — | 1e-6 mm |
| Simetri | Aynalı noktalar x → -x | Tam eşitlik |
| Şablon ölçü çizgileri | Parametreler | 1e-9 mm |
| SVG | width / height (mm) = viewBox | — |
| PDF ölçeği | 1:1'de 100 mm çizgi = 283,465 pt; 1:5'te 20 mm | 0,01 pt |
| PDF yapısı | xref ofsetleri | — |

PDF ayrıca `qpdf --check` ile denetlendi ve `pdftotext` / `pdftoppm` ile açıldı: hata yok, Türkçe metin doğru.

**Tarayıcı testi** (telefon emülasyonu, Chromium) — sırasıyla:
1. Gömlek şablonu uygulanır.
2. Sayıyla simetrik çizgi çizilir; uzunluk 15 cm.
3. Dokunarak eğri, ölçü, yazı ve detay eklenir; seçilir, sayıyla kaydırılır.
4. Geri al / ileri al, katman ekle.
5. SVG, PDF (1:10) ve PNG indirilir.
6. Sayfa yenilenir, çizim yeniden açılır; öğe sayıları aynıdır.
7. Şablon yeniden uygulanır; öğe kaybı olmaz.

Masaüstü ve tablet görünümüne ekran görüntüsüyle bakıldı. Gerçek cihazda denenmedi.

**Testte bulunup düzeltilen hatalar:**
- Yeni öğeler "Şablon" katmanına eklenebiliyordu; şablon yeniden uygulanınca silinirdi.
- V yaka ribanası yaka çizgisini kesiyordu.
- PDF yazı boyları ve yerleşimi bozuktu.
- Ölçü yazısı tuvalde çizginin üstüne biniyordu.

**Sınırlar:**
- Şablonlar teknik çizimdir (flat), kalıp değildir. Ölçüler düz serilmiş giysinin ölçüleridir. Kalıp Aşama 3'te.
- Detaylar kütüphane şeklidir; tek tek düzenlemek için aynalı kopya / taşıma / döndürme / ölçek var. Detayı çizgilere "açma" yok.
- Eğri noktalarını sonradan tek tek düzenleme (kontrol noktası tutamaçları) yok: eğri silinip yeniden çizilir ya da taşınır / döndürülür.
- PDF'te yazı genişliği yaklaşık hesaplanır (ortalama harf genişliği); ölçü yazısının ortalanması birkaç mm kayabilir. Geometri ve ölçek kesindir.
- DXF teknik çizim çıktısı bilerek yok: plan, DXF'in kalıp için katman / ölçek kurallarıyla (Aşama 3 / 8 dosya alışverişi) sunulmasını istiyor.

## 8. Aşama 3 raporu: dokuma / konfeksiyon kalıp sistemi (12.11.2026)

**Çalışanlar** (kodla ve testle):
- **Kalıp sekmesi** (dokuma ve karma projelerde). Temel blok takımı oluşturulur; ölçüler beden tablosundaki bedenden (göğüs, bel, kalça) ya da elle cm olarak girilir. Parçalar ürün + beden grubuna bağlanır.
- **Temel bloklar.**
  - Gömlek takımı: ön beden (2,5 cm düğme patı, düğme yerleri), arka beden (katlı), kol, yaka ayağı, yaka, manşet, göğüs cebi.
  - Düz etek takımı: ön ve arka (katlı, pensli), kemer.
  - Kol başı eğrisi, kol oyuğu + bolluk olacak şekilde hesaplanır (ikiye bölme yöntemiyle).
  - Takımın dikiş eşleşmeleri birlikte üretilir: omuz, yan dikiş, kol oyuğu ↔ kol başı, kol altı, yaka ↔ yaka ayağı ↔ yaka, kol ağzı ↔ manşet (pile), bel ↔ kemer (pens kapalı, kruvaze payıyla).
- **Kalıp editörü** (tam ekran, telefon önce).
  - Seçim: parçaya dokunma parçayı, seçili parçanın kenarına ikinci dokunuş kenarı seçer.
  - Parça bilgileri: ad, kesim adedi, çift kes (biri ters), kumaş türü (ana / astar / tela / kontrast), kumaş katı kenarı, üretim notu.
  - İşlemler: 90° / 180° döndür, ters çevir, düz boyu 90° çevir, katı aç (yarım kalıptan tam parça), çoğalt, sil, sürükleyerek taşı.
  - Kenar bazında dikiş payı ve köşe türü: sivri (uzatma), dik (bloklu), pah. "Bütün kenarlara pay" da var.
  - Kenar uzunluğu, pensli kenarda pens kapalı dikiş boyu.
  - Araçlar: çıt (tek / çift / T; konumu cm ile düzeltilir), pens (ağız iki nokta + uç), işaret (delik, düğme, ilik, referans), bölme (iki nokta), birleştirme (iki parçanın eş kenarı), yeni parça (köşe / eğri noktaları, dokunarak ya da cm ile), dikiş eşleştirme (A + beklenen fark = B, tolerans).
  - Geri al / ileri al.
- **Doğrulama** (Doğrulama sekmesinde ve editörde):
  - Kontur kapalı mı; dikiş hattı kendini kesiyor mu.
  - Kenar içinde kırık (eğri sürekliliği; uyarı).
  - Kumaş katı kenarı düz mü.
  - Dikiş payının kesim hattı kendini kesiyor mu (iç bükey sıkı eğride pay > yarıçapsa oluşan düğüm otomatik kırpılır).
  - Çıt kenar dışında mı; pens ucu parça içinde mi; pens bacakları eşit mi; düz boy çizgisi var mı.
  - Adet, pay sınırları.
  - Dikiş eşleşmesi sapması (beklenen farka göre).
- **Çıktılar.**
  - SVG: 1:1 mm.
  - PDF: 1:1 A4 ya da A3 döşemeli. Kapakta açıklama, 10 × 10 cm kontrol karesi, sayfa haritası ve parça listesi (kesim alanlarıyla). Sayfalar satır-sütun numaralı, köşe işaretli; boş sayfalar atlanır. Kesim hattı kalın, dikiş hattı kesik, kat / katlama çizgi-nokta, düz boy oklu.

**Doğrulama ve toleranslar** (`tests/tx-pattern.test.mjs`, 14 test):

| Konu | Referans | Tolerans |
|---|---|---|
| Dikdörtgen | Kesim alanı (W+2s)(H+2s), çevre 2(W+H)+8s; köşe türleri; yön bağımsızlığı; etek payı; kat kenarı | 1e-6 mm² |
| L parça (iç köşe) | Kesim alanı A + s·P + s²·(dış − iç köşe) | Tam |
| Daire | π(r+s)² ve 2π(r+s) | ±%0,05 (Bezier çember yaklaşımı) |
| Sivri köşe | Uzatma 6 × pay sınırı | — |
| Sıkı iç bükey eğri | Kesim hattında öz-kesişim yok | — |
| Çıt | Konumu ve yönü; ters çevirmede yeri | 1e-9 mm |
| Pens | Kapalı dikiş boyu = kenar − ağız | 1e-9 mm |
| Bölme | Alan korunur: dikdörtgende 1e-6, dairede %0,01 | Bkz. referans |
| Bölme: çıtlar | Doğru parçada kalır | — |
| Birleştirme | Alan toplamı | 1e-3 mm² |
| Katı açma | Alan 2×, orta çizgiye simetri | 0,05 mm |
| Gömlek ve etek blokları | Varsayılan ve değiştirilmiş ölçülerle bütün parçalar hatasız, bütün eşleşmeler tolerans içinde | — |
| Kol başı | Kol oyuğu + bolluk | ±0,01 mm |
| Etek beli | Pens kapalı bel toplamı = bel çevresi | 1e-6 mm |
| PDF | Geçerli xref; kapak karesi 100 mm; döşemede 120 × 170 mm kesim çizgisi kağıtta aynı boyda | 0,01 pt |

PDF ayrıca `qpdf --check` ile denetlendi ve `pdftoppm` ile açıldı.

**Tarayıcı testleri** (telefon emülasyonu):
1. Örnek beden tablosunun L bedeninden gömlek bloğu oluşturulur; 7 eşleşmenin hepsi tutar.
2. Ön beden yan dikiş payı 2 cm yapılır, kesim alanı artar; çıt eklenir.
3. Sayıyla 40 × 12 cm parça çizilir (4,80 dm², geçerli).
4. PDF ve SVG indirilir; yenileme sonrası kalıp kaydedilmiş, Doğrulama sekmesinde hata yok.
5. Etek bloğuna dokunarak ikinci pens eklenir: bel eşleşmesi tam 3,00 cm sapmayla bozulur, geri alınınca düzelir.
6. Kemer dokunarak bölünür ve aynı kenardan geri birleştirilir: alan aynı kalır.
7. Dokunarak elle dikiş eşleşmesi eklenir.

Gerçek cihazda denenmedi.

**Testte bulunup düzeltilen hatalar:**
- **Birleştirme aracı** (değişken tanımlanmadan önce kullanılıyordu, dokunuş sessizce düşüyordu). İki parçanın ortak kenarında ikinci parça da seçilemiyordu.
- **Proje oluşturma.** Tür değiştirilirken yazılan proje adı bazen kayboluyordu; tür seçimi artık sayfayı yeniden çizmiyor.
- **Arka yaka bloğu.** Eğri, 1 cm pay için fazla keskindi; eğri yumuşatıldı ve iç bükey düğüm kırpma eklendi.
- **Etek.** Ön / arka yan dikişleri 2,7 mm tutmuyordu; eşitlendi.
- **Kendini kesen dikiş hattı.** "alan sıfır" olarak raporlanıyordu; artık doğru uyarı veriliyor.
- **Kesim hattı.** Doğru üstündeki gereksiz noktalar temizlendi.

**Sınırlar:**
- **Bloklar basitleştirilmiş temel kalıptır.** Endüstri kalıp sistemlerinin (ör. Müller, Aldrich) birebir uygulaması değil; prova olmadan seri üretime alınmamalı. Pantolon, ceket, elbise ve mont blokları henüz yok (bu türler için teknik çizim şablonu var).
- **Köşe türlerinde "ayna köşe"** (katlanan payın köşesi) yok: sivri, dik ve pah var.
- **Kenar düzenleme.** Kenarlar sonradan nokta nokta düzenlenemez (eğri tutamaçları yok); parça böl / birleştir / yeniden çiz ile değiştirilir.
- **Birleştirme ve eşleşmeler.** Birleştirme sonrası aynı doğru üzerindeki iki kenar tek kenara indirilmez. Bölme / birleştirme / katı açma, o parçanın dikiş eşleşmelerini kaldırır; yeniden eşlenmesi gerekir.
- **Pens.** Ağzı dikiş hattında işaretlenir; pens kapatılmış biçim (pens "katlanmış" kalıp kenarı) çizilmez.
- **Kapsam dışı (sonraki aşamalar).** Grading (Aşama 4), yerleşim (Aşama 7), DXF-AAMA (dosya alışverişi).

## 9. Aşama 4 raporu: beden ve grading (12.11.2026)

**Yöntem: kural tabanlı grading.** Temel bedendeki her köşeye hedef beden için kaydırma (Δx, Δy) verilir. Kenar içindeki eğri noktaları, iki uçtaki kaydırmanın yay uzunluğuna göre karışımıyla taşınır. Çıtlar kenar boyuyla orantılı kayar. Pens genişliği sabit kalır, yalnız yeri kayar. Pay, köşe türü, kat kenarı, adet ve notlar aynen taşınır.

Kurallar iki kaynaktan gelir:
- **Blok parçası.** Blok, hedef bedenin tablodaki ölçüleriyle yeniden çizilir; köşe farkları kural olur. Kullanıcı parçanın biçimini değiştirmediyse (yalnız taşıdıysa) eğriler de hedef bedenin bloğundan aynen alınır. Böylece kol başı bolluğu her bedende tam tutar. Biçim değiştiyse eğriler esnetilir; dikiş eşleşmesi yine kontrol edilir.
- **Diğer parçalar: orantılı.** Seçilen en ve boy ölçüsünün oranıyla ölçeklenir; düz boy çizgisinin ortası sabit kalır.

**Arayüz.**
- Kalıp sekmesinde her grupta "📐 Bedenlere yay" var: tablo, hedef bedenler, yöntem, orantılı ölçüler seçilir.
- Sonuçta her beden için hata ya da uyarı gösterilir ve parça × ölçü × beden karşılaştırma tablosu çıkar (genişlik, boy, adlandırılmış kenar boyları).
- Hedef bedendeki eski kalıp değiştirilir, yinelenmez.
- Editörde "◫ Beden yuvası" aynı ürünün bütün bedenlerini üst üste renkli gösterir.
- Kaynağı yazılmamış tablo reddedilir.
- **Kişiye özel ölçü:** beden tablosuna kişinin adıyla bir sütun eklenip o "bedene" yayılır.

**Doğrulama** (`tests/tx-grade.test.mjs`, 8 test):
- **Blok ile birebir aynılık.** Gömlek ve etek, 6 bedende: yayılan kalıbın köşeleri, o bedenin ölçüsüyle doğrudan çizilen blokla aynı (1e-9 mm).
- **Gömlek.** Bedenler arası arka yarı genişlik farkı = göğüs farkı / 4 (tam). Kol başı her bedende kol oyuğu + 1 cm (±0,01 mm). Bütün eşleşmeler tutar.
- **Etek ve kişiye özel ölçü.** Etekte pens kapalı bel toplamı kişinin bel ölçüsüne eşit (1e-6 mm).
- **Orantılı grading.** En / boy oranları tam.
- **Taşınan düzenlemeler.** Taşınmış ve düzenlenmiş parçada çıt, pay ve not taşınır. Biçimi değiştirilmiş parçada eşleşmeler tolerans içinde kalır.
- **Tarayıcı testi.** M bedeninden 5 bedene yayma; karşılaştırma tablosunda arka genişlik 25–30 cm; L bedeninde 7 eşleşme tutar; beden yuvası açılır; Doğrulama sekmesi temiz.

**Testte bulunup düzeltilen hatalar:**
- **Etek beli.** Pens ağzı kenarla birlikte esniyordu, bel eşleşmesi 3,8–7,6 mm kayıyordu.
- **Kol başı.** Yalnız esnetilen kol başı eğrisinde bolluk büyük bedende 1,19 cm çıkıyordu.

**Sınırlar:**
- **Ölçü kapsamı.** Bloklar beden tablosundan yalnız göğüs, bel ve kalça çevresini alır. Boy ölçüleri (giysi boyu, kol boyu) tabloda olsa bile blok parametresine bağlanmadıkça değişmez; karşılaştırma tablosunda görünür.
- **Kural düzenleme.** Kurallar elle tek tek düzenlenemiyor (kural tablosu ekranı yok). Kaynak: blok ölçüsü ya da oran.
- **Triko.** Trikoda bedene göre ilmek / sıra sayıları, örgü deseni gelince (Aşama 5) eklenecek.

## 10. Aşama 5 raporu: triko desen ve ilmek sistemi (12.11.2026)

**Çalışanlar.** "Örgü" sekmesi, triko ve karma projelerde.
- **Numune (gauge).** 10 cm'deki ilmek / sıra, iplik bağlantısı, yıkandı işareti; yıkanmamış numune uyarı verir.
- **Örgü şeması editörü** (tam ekran, telefon önce).
  - İlmekler:
    - Düz, ters, askı, atlama.
    - Delik (+1), sağa / sola eksiltme (−1), "ilmek yok" (şekil dışı).
    - Saç örgüsü: 1/1, 2/2, 3/3, sola ve sağa.
  - Çalışma:
    - Fırça (dokun / sürükle), alan doldur, tekrar alanı, sıra bilgisi, kaydır, iki parmakla yakınlaştır, geri al.
    - Renk paleti (jakar).
    - Boyut değiştirme.
  - Sıra 1 altta, ilmek 1 sağda; 10'luk kalın çizgiler.
- **Hazır desenler (9).** Düz, ters, ribana 1×1 ve 2×2, saç örgüsü 2/2 ve 3/3, jakar baklava, ajur, askılı.
- **Kontrol.**
  - Hata: desteklenmeyen ilmek kodu, eksik ya da başsız saç örgüsü.
  - Uyarı:
    - Delik / eksiltme dengesizliği (sıra ilmek sayısı değişiyor).
    - Jakarda uzun atlama ipliği (varsayılan en çok 7 ilmek).
    - Sırada 2'den fazla renk (makine jakarı gerekir).
    - 4'ten fazla üst üste askı.
    - Uzun atlama ilmeği.
- **Tekrarla alan doldurma.** Ortalanır; kenarda bölünen saç örgüsü düz ilmeğe çevrilir ve sayılır.
- **Çıktılar.**
  - Şema PDF: A4; semboller, renkler, sıra / ilmek numaraları, açıklama, tekrar çerçevesi. Büyük şema sayfalara bölünür.
  - PNG ve CSV.
  - Yazılı talimat: gidiş-dönüş; çift sıralar arka yüzden, düz ve ters yer değiştirir; ardışık ilmekler gruplanır.
- **Triko parçası hesabı.** Beden (düşük omuz), kol (manşetten koltuğa artırma), atkı.
  - Ölçü (cm) → ilmek / sıra. İlmek sayısı desen tekrarına, ribana tekrarına ve 2 kenar ilmeğine uyacak en yakın sayıya yuvarlanır; gerçek genişlik farkı yazılır.
  - Sıra sıra plan: ribana, düz, yaka ortası / omuzlar. Kolda "her a. sırada 1 artır × p, her a+1. sırada × q" eşit dağıtımı.
- **Bedenlere göre ilmek sayıları.** Beden tablosundaki göğüs çevresinden; tekrar her bedende korunur.

**Doğrulama** (`tests/tx-knit.test.mjs`, 11 test).
- **Desen kuralları.** Ribana dizilişleri ve ajur sıra dengesi doğru; saç örgüsü kuralları (sığmama, üstüne yazınca temizleme, eksik / başsız) çalışıyor; bütün uyarılar tetikleniyor.
- **Tekrar ve talimat.** Tekrar periyodikliği tutuyor. Talimatta arka yüz çevrimi doğru.
- **Ölçü ↔ ilmek.** 28 ilmek / 10 cm'de 52 cm = 145,6 ilmek → tekrar 8 + 2 kenarla 146 ilmek (52,14 cm). Ters dönüşüm tam.
- **Şekillendirme dağılımı.** 5 durumda toplam ve sıra tam, aralık farkı ≤ 1.
- **Parça hesabı.** Beden ilmek sayısı hedefe ±1. Kolda başlangıç + 2 × artırma = pazu ilmeği.
- **Bedenler.** İlmek sayısı göğüsle artıyor, tekrar her bedende korunuyor.
- **Çıktılar ve model.** PDF yapısı geçerli, büyük şema çok sayfalı. Projede dal ve ürün kuralları çalışıyor; kayıt gidiş-dönüş tam.
- **Tarayıcı testi.** Dokunarak ters ilmek, saç örgüsü, delik → uyarı → eksiltmeyle dengeleme; jakar rengiyle uzun atlama uyarısı → geri al; tekrar alanı; PDF / talimat / CSV indirildi; 2×2 ribanalı parça 12'nin katı + 2 ilmek; yenileme sonrası kayıtlı; doğrulama temiz.

**Testte bulunup düzeltilen hatalar:**
- **Saç örgüsü sembolü.** Komşu hücre boyamasının altında kalıyordu.
- **Yaka hesabı.** Düşük omuzlu bedende yanlış hesaplanıyordu: omuz parametresi bedenle çelişiyordu.
- **Askı uyarısı.** Askı dizisinin gerçek boyunu değil, eşiği aşan ilk değeri yazıyordu.

**Sınırlar:**
- **Kol.** Takma kol (kol oyuğunda eksiltme ve kol başı şekillendirme) yok; yalnız düşük omuz.
- **Yaka.** Yaka eğrisi sıra sıra eksiltilmiyor: "ortadaki X ilmek kapatılır" düzeyinde.
- **Ölçüler.** Bedenlere göre hesap yalnız göğüs çevresinden; boy ve kol boyu bedene bağlı değil.
- **İlmek türleri.** Brioche, plaka (intarsia), çift yataklı özel yapılar desteklenmiyor; kod görülürse hata verilir.
- **Tüketim ve gramaj.** İplik tüketimi ve gramaj Aşama 6'da.
- **Makine programı.** Makineye özgü program yok (Aşama 8); yazılı talimat elle ya da genel kullanım içindir.

## 11. Aşama 6 raporu: kumaş, iplik, aksesuar kütüphanesi; tüketim, gramaj, maliyet (12.11.2026)

**Çalışanlar.**
- **Hazır kartlar.** 8 kumaş, 5 iplik, 6 aksesuar; piyasadaki tipik değerler. Sayısal alanlar "tahmini" işaretli gelir; tedarikçi kartıyla değiştirilmeli.
- **İplik numarası dönüşümü.** tex, dtex, denye, Nm, Ne (pamuk); katlı iplikte sonuç numara (büküm kısalması hariç) ve m/g. Malzeme kartında gösterilir.
- **Dokuma kumaş tüketimi.** Kalıp parçalarından:
  - Kesim alanı (pay dahil) × adet; katlı kesilen parça 2 kat.
  - Çekme oranıyla büyütme; kumaş eni ve yerleşim verimiyle metre (varsayılan %80, gerçek yerleşim Aşama 7'de) + %3 kesim kaybı.
  - Kumaş gramajıyla tüketilen ve giysideki kumaş ağırlığı.
  - Ana kumaş ve astar ayrı.
- **Triko iplik tüketimi.** Parça planından tam ilmek sayısı (kolda artırmalar sıra sıra toplanır) × ilmek boyu × tex + %5 kayıp. İlmek boyunun kaynağı, öncelik sırasıyla:
  1. Numunede ölçülen.
  2. Tartılan numune (ağırlık, ilmek × sıra).
  3. Numune sıklığından geometrik tahmin (Munden, düz örgü, ks ≈ 19, "tahmini").
- **Uyumluluk uyarısı.** Sıkılık faktörü (√tex / ilmek boyu) 1,0–2,0 dışındaysa numune ile iplik numarası uyumsuz uyarısı verilir.
- **Föyde "Tüketim ve malzeme maliyeti".** Bedene göre tüketim ve maliyet. Elle girilen miktar varsa o, yoksa hesaplanan miktar kullanılır ve "tahmini" işaretlenir. Varsayımlar yazılı. Eksik bağlar (ürüne kumaş / iplik bağlanmamış) hata olarak gösterilir.

**Doğrulama** (`tests/tx-materials.test.mjs`, 7 test):
- **Numara dönüşümleri.** Kesin; 25 sistem çifti gidiş-dönüşü 1e-9.
- **Hazır kartlar.** Geçerli.
- **Kumaş tüketimi.** Dikdörtgende analitik metre; çekme çarpanı 1 / ((1 − s₁)(1 − s₂)); katlı parça 2 kat.
- **İlmek toplamı.** Kol ve beden kapalı biçimle aynı.
- **Gramaj.** = ilmek × boy × tex; tartılan numune kendi ağırlığını verir.
- **Ürün düzeyi.** Gömlek metresi makul aralıkta (1–2,5 m) ve maliyet = metre × fiyat; elle girilen miktar önceliklidir. Kazak gramı ve kg maliyeti tam.
- **Tarayıcı testi.**
  - Hazır karttan poplin ve merinos eklenir, Nm 2/28 dönüşümü doğru.
  - Fiyatlar girilir, kalıp ve triko parçası eklenir.
  - Föyde gömlek kumaş metresi, varsayımlar, kazak iplik gramı ve uyumsuz numune uyarısı görünür.

**Sınırlar:**
- **Kumaş metresi.** Yerleşim yapılmadan önce varsayılan verimle hesaplanır (Aşama 7'de gerçek yerleşim gelecek).
- **İlmek boyu tahmini.** Düz örgü katsayısıyla yapılır; ribana / saç örgüsü bölümleri için ayrı katsayı yok. Doğru gramaj için numunede ilmek boyunu ölç ya da numuneyi tart.
- **Kapsam dışı.** Aksesuar tüketimi (düğme adedi, fermuar boyu) otomatik hesaplanmaz; elle girilir. Stok düşümü / sipariş yok, alanlar kayıt amaçlıdır.

## 12. Aşama 7 raporu: kumaş yerleşimi ve kesim planı (12.11.2026)

**Çalışanlar.**
- **Kesim planı ekranı.** Kalıp sekmesinde her ürün / beden kartında "✂ Kumaş yerleşimi". Ürüne bağlı kumaş, serim (açık en tek kat ya da ortadan katlı iki kat), kenar (selvedge) payı, parça aralığı, arama ızgarası ve "desen eşleştir" seçilir.
- **Otomatik yerleşim.**
  - En sola / en alta sığdırma, ızgara üzerinde. Tutucu tarama: hücre yalnız parçanın iç alanına (aralık kadar şişirilmiş) değiyorsa dolu sayılır.
  - Dört sıralama denenir (alan, en, boy, çevre), en kısa plan seçilir.
  - Ardından her çift parça kesin çokgen testiyle denetlenir.
- **Kısıtlar.**
  - Düz boy çizgisi kumaş boyuna paralel.
  - Yönsüz kumaşta 0° / 180°; havlı / yönlü kumaşta (kumaş kartında "hav") hiç çevirme yok. Elle çevrilirse hata.
  - Çift (sağ / sol) parçalar tek kat seriminde ikinci adet ayna olarak yerleşir.
  - Katlı serimde kumaş katı kenarlı parça kat çizgisine oturur ve tek yerleşimle iki kat kesilir. Kat kenarı düz boya dik olan parça (yaka, yaka ayağı) açılıp normal yerleşir, uyarı yazılır. Tek adetli parça için "1 fazla kesilir" uyarısı.
  - Desen eşleştirmede her parçanın düz boy ortası kumaş kartındaki desen raporu ızgarasına (boy × en) oturur.
- **Elle yerleşim.**
  - Parça sürüklenir, seçili parça 180° çevrilir (havlıda engelli). İki parmakla yakınlaştırma.
  - Çakışan ya da en dışına taşan parça kırmızı görünür. Boy, verim, fire ve hata sayısı canlı yazılır.
- **Çıktılar.**
  - Kesim planı PDF: A3 yatay, standart ölçek (1:5 … 1:50), sığmazsa sayfalara bölünür. İstatistikler, kısıtlar ve varsayımlar, hata / uyarılar sayfada.
  - SVG 1:1 (mm), çizici / kesim masası için.
- **Tüketim.**
  - Kayıtlı ve hatasız plan varsa föydeki kumaş metresi %80 verim varsayımı yerine plan boyundan hesaplanır: boy / (1 − boy çekmesi) + pastal başı / sonu 2 × 2 cm; katlı serimde × 2.
  - En çekmesi planda yoktur; föyde "kalıp ene göre büyütülmeli ya da kumaş ön çektirilmeli" diye yazılır.
  - Plan bozuksa (parça değişti, çakışma) tüketim varsayıma döner ve hata yazılır.
- **Doğrulama sekmesi.** Kayıtlı her planı yeniden denetler: çakışma, en dışı, yerleşmeyen / artık parça, kat çizgisi, havlıda çevirme, silinmiş kumaş.

**Ölçülen sonuçlar** (gömlek bloğu, M, en 150 cm, kenar 1 cm, aralık 2 mm, ızgara 5 mm):

| Durum | Boy | Verim | Sorun |
|---|---|---|---|
| Açık en | 133,5 cm | %69,0 | yok |
| Açık en, havlı | 136,5 cm | %67,5 | yok |
| Katlı | 137,5 cm | %68,1 | yalnız uyarı (yaka açılır, cep 1 fazla) |
| Etek, desen eşleştirme 10 × 8 cm | 78,5 cm | %64,1 | yok |

**Doğrulama** (`tests/tx-marker.test.mjs`, 10 test):
- **Bilinen optimum.** 4 adet 37 × 30 cm dikdörtgen, kullanılabilir en 148 cm, aralık 0 → boy 30 cm, verim %100.
- **Gömlek.** Çakışma yok (testin kendi kesişim denetimiyle), hepsi en içinde, verim > %60, süre < 2 s.
- **Çift parça, katlı serim, havlı kumaş, desen eşleştirme.** Kurallar ayrı ayrı denetlenir; desen eşleştirmede her düz boy ortası rapor ızgarasında (±1e-6 mm).
- **Doğrulama.** Elle bozulan planda çakışma, en dışı ve eksik parça hata olarak çıkar.
- **Model.** Kayıt, yerine geçme, JSON gidiş-dönüş; tüketim = plan boyu (+ çekme, + pastal başı), maliyet buna göre; bozuk plan varsayıma döner.
- **Çıktılar.** SVG tüm parçaları içerir; PDF geçerli ve ölçek etiketli.
- **Desteklenmeyen.** Kumaş eni yok, desen raporu yok, parça enden geniş, düz boy yok: açık hata.
- **Tarayıcı testi.**
  - Gömlek + poplin, otomatik yerleşim hatasız.
  - Parça elle başka parçanın üstüne sürüklenince çakışma hatası; yeniden yerleştirince temiz.
  - PDF indirilir; kaydedilir; föyde tüketim plandan, en çekmesi uyarısı.
  - Yenileme sonrası plan duruyor.

**Sınırlar:**
- **En iyi sonuç garantisi yok.** Otomatik yerleşim sezgiseldir; ticari yerleşim yazılımlarının (yüzlerce deneme, serbest açı) verimine ulaşmaz. Tipik giysi planında %65–70. Plan ve kısıtlar PDF'de yazılıdır; **kesimden önce operatör kontrol etmelidir.**
- **Serbest açı yok.** Yalnız 0° / 180° (düz boy toleransı ile küçük eğme desteklenmez); verev (45°) kesim parçası yok.
- **Tek beden.** Plan tek beden içindir; çok bedenli karışık pastal (ör. 2 M + 1 L) ve kat sayısı / pastal planı yok.
- **Ana kumaş.** Astar ve tela parçaları bu ekranda planlanmaz; onların tüketimi varsayımla hesaplanmaya devam eder.
- **Çıktı biçimi.** Kesim makinesine özel biçimler (Gerber, Lectra vb.) yok; SVG 1:1 ve PDF var. DXF-AAMA dışa aktarımı ilerideki bir iş.
- **Desen eşleştirme.** Parçayı rapor ızgarasına oturtur; parçaların birbirine göre hangi desen noktasında buluşacağı (ör. ön ortada kareli eşleşme) kalıpta işaretlenmez.

## 13. Aşama 8 raporu: triko makine profilleri ve üretim çıktısı (12.11.2026)

**Çalışanlar.**
- **Makine profili** (Örgü sekmesi → "Örgü makineleri"). Dört genel şablon:
  - Ev tipi standart (4,5 mm, 200 iğne, 24'lük delikli kart).
  - Ev tipi kalın (9 mm, 110 iğne, 12'lik kart).
  - V yatak elektronik E7 ve E12.
  - Şablonlar gerçek bir makine değildir; sayılar "tahmini" işaretlidir. Kullanıcı marka, model, iğne aralığı, iğne sayısı, plaka, besleyici, kaydırma sınırını girer.
- **Doğrulama.**
  - Profil, kullanıcı gerçek makinede numune örüp "Makinede doğrulandı" diyene kadar **DOĞRULANMAMIŞ** sayılır (marka, model ve not zorunlu). Doğrulanmamış profilin bütün çıktıları bu başlığı taşır; doğrulama sekmesinde uyarı çıkar.
  - Doğrulamadan sonra makine değerlerinden biri değişirse doğrulama kendiliğinden düşer.
- **Uyumluluk kontrolü** (parça + desen + numune ↔ makine):
  - İğne sayısı yetiyor mu; ribana için ikinci plaka var mı; tek plakada ters ilmek (hata).
  - Bir sıradaki renk sayısı ≤ besleyici sayısı; saç örgüsü kaydırması ≤ makine sınırı; elle aktarma gereken saç örgüsü / delik uyarısı.
  - Delikli kartta tekrar genişliği kart genişliğinin böleni, bir sırada kartla seçilebilir karışım (2 renk ya da düz + askı ya da düz + atlama), bütün kartta tek taşıyıcı ayarı.
  - Numune ilmek genişliği / iğne aralığı oranı 0,5–1,1 dışındaysa "bu incelikte örülemeyebilir" (kaba kural, uyarı).
- **Çıktılar** (yalnız açık, denetlenebilir biçimler):
  1. **Operatör programı** (.txt): sıra sayacına (RC) göre talimat. Çalışan iğneler (L / R), ribana, kolda her artırma sırası, bedende kol oyuğu işareti ve ön yaka bekletmesi, kapama. Uyumsuzluk varsa program üretilmez, nedenler yazılır.
  2. **Delikli kart şeması** (SVG): jakarda delik = 2. renk; askıda boş = askı; atlamada boş = atlama. Tekrar kart genişliğine döşenir, en az sıra sayısına tamamlanır. Kart okuma kayması, ters yüzden okuma ve fiziksel kart ölçüleri için "kılavuzdan doğrula" notları.
  3. **knitout** (.k, V yatak): açık iğne düzeyi ara biçim (Carnegie Mellon). Düz (ön plaka), ters (arka plakaya aktarma), askı, atlama, saç örgüsü (aktarma + kaydırma), yüzen jakar (renk başına geçiş). Başlangıç tek-çift askılı.
- **Yapısal benzetim.** Üretilen knitout her seferinde uygulamanın kendi benzetiminden geçer:
  - Sözdizimi; besleyici giriş / çıkış; iğne aralığı; kaydırma sınırı.
  - Aktarma hizası (f(n) ↔ b(n − kaydırma)); boştan aktarma; boş iğnede örme (ilmek kaybı).
  - Benzetim hatalıysa dosya verilmez.
- **Kapalı biçimler.** Stoll (M1plus / .sin), Shima Seiki (APEX / .dat), Steiger yerel biçimleri kapalı ve lisanslıdır: **üretilmez**, arayüzde açıkça yazılı.
- **Arayüz düzeltmesi.** Bir alandan ötekine geçerken sayfa yeniden çiziliyor ve dokunulan yeni alan odağını kaybediyordu (telefonda klavye kapanıyordu). Yeniden çizim, odak yeni alana geçtikten sonra yapılıyor ve odak ile imleç korunuyor.

**Doğrulama** (`tests/tx-machine.test.mjs`, 9 test):
- **Şablonlar.** Geçerli ama doğrulanmamış; doğrulama koşulları; değer değişince düşme.
- **Uyumluluk kuralları.** Her biri ayrı ayrı denetlenir.
- **Operatör programı.** Kolda artırma satırı sayısı = (pazu − manşet) / 2 ve her biri doğru RC'de; yaka bekletmesi; uyumsuzlukta program yok.
- **Delikli kart.** 36 × 24 hücrenin her biri desenle karşılaştırılır; askı kartı.
- **knitout.** Düz + ters + askı + atlama + iki saç örgüsü + 2 renkli panelde benzetim hatasız. Her sırada her iğnenin işlemi (örme / askı / atlama), plakası (ön / arka) ve besleyicisi şemayla bire bir aynı. Bütün hazır desenler (delikli ajur hariç: açık hata) temiz.
- **Benzetimin kendisi.** Bozuk programları yakalar: hizasız aktarma, boş iğnede örme, içeride olmayan besleyici, kaydırma sınırı, makine dışı iğne, içeride kalan besleyici, başlık.
- **Model.** Profil durumu doğrulama sekmesinde; JSON gidiş-dönüş.
- **Tarayıcı testi.**
  - Kol + baklava deseni.
  - Ev tipi şablon: doğrulanmamış uyarısı, ribana plakası uyarısı, operatör programı ve delikli kart indirilir.
  - V yatak: 24 × 24 knitout indirilir, benzetim ✅.
  - Ev tipinde knitout reddedilir. Marka / model + not ile doğrulama; iğne sayısı değişince doğrulama düşer.

**Sınırlar:**
- **Makinede denenmedi.** Hiçbir çıktı bu uygulamada gerçek bir makinede denenmedi. Yapısal benzetim komut tutarlılığını denetler; iplik gerilimi, ilmek çekme, makineye özgü kurallar (ör. aynı anda iki plakada örme, besleyici park konumları, kaydırma sırasında örme yasakları) denetlenmez. Üretimden önce makinede numune şart.
- **knitout kapsamı.** Delik / eksiltme / artırma (şekillendirme) yok; düz panel üretir (açık hata verir). Bağlama / kapama makine yazılımına bırakılır. knitout'u makine biçimine çevirmek için ayrı bir dönüştürücü gerekir.
- **Elektronik ev tipi makineler.** Bunların desen yükleme biçimleri desteklenmez; delikli kart ve operatör programı verilir.
- **Delikli kart.** Okuma kayması ve kart yönü markaya göre değişir; şema delik konumunu gösterir, kesim şablonu değildir.

## 14. Aşama 9 raporu: 3B önizleme ve kumaş benzetimi (12.11.2026)

Bu aşamada iki ayrı şey var ve arayüzde de ayrı tutuldu.

### 14.1 3B önizleme (geometrik, fiziksel DEĞİL)

**Nerede.** Kalıp sekmesinde her ürün / beden kartında "🧍 3B önizleme"; Örgü sekmesinde beden parçasında "🧍 3B".

**Bolluk raporu.**
- Giysi çevresi kalıbın dikiş çizgisinden ölçülür. Yan dikişli beden parçaları toplanır; katlı parça × 2, adetli parça × adet. Ön pat (üst üste binme) ve pens payları düşülür.
- Beden tablosundaki ölçüyle karşılaştırılır; tablonun adı ve kaynağı ekranda yazılı.
- Gömlek: göğüs, etek ucu (kalça hizasında varsayıldı). Etek: bel, kalça, etek ucu.
- Önerilen bolluk aralıkları: gömlek göğüs 6–20 cm, etek kalça 2–8 cm, bel 0–2,5 cm. Vücuttan darsa hata.
- Triko: ön + arka genişlik göğüsle karşılaştırılır; örgü esnediği için −6 … +20 cm aralığı.

**3B sahne.**
- Basitleştirilmiş vücut formu: elips kesitler, düzey yükseklikleri ortalama oranlardan; kol ve bacak yok.
- Giysi kabuğu: kalıp çevrelerinden kurulan halkalar. Yeşil uygun, sarı çok dar / bol, kırmızı vücuttan dar.
- Ekranda sürekli **ÖNİZLEME** etiketi ve "kumaşın düşüşü, kırışıklık, gerilim hesaplanmaz; prova gerekir" notu var.

### 14.2 Dökümlülük benzetimi (fiziksel model)

**Nerede.** Malzemeler sekmesinde her kumaş kartında.

**Model.**
- Cusick düzeni: 30 cm çaplı daire numune, 18 cm çaplı destek diski.
- XPBD: uzamaz mesafe kısıtları (yapısal + kesme). Eğilme, ızgara çizgisi üçlülerinin orta nokta sapmasıyla; 1, 2 ve 4 aralıklı üçlülerle.
- Dökümlülük katsayısı = (gölge − disk) / (numune − disk). Gölge, izdüşen üçgenlerin 1 mm ızgarada taranmasıyla ölçülür. Ayrıca dalga sayısı çıkar.

**Doğrulama durumu (zorunlu).**
- Ölçülmüş katsayı girilmemişse: **DOĞRULANMAMIŞ — yalnız model tahmini**. Doğrulama sekmesinde uyarı çıkar.
- "Ölçüme kalibre et": etkin eğilme parametresi ölçülen katsayıya uydurulur. Sonuç "kalibre edildi, bağımsız doğrulama değil" diye yazılır.
- İkinci bağımsız ölçüm (başka numune) girilip model ±0,05 içinde kalırsa: **referans numuneyle uyumlu**. Dışındaysa: **UYUŞMUYOR** (hata).
- Gramaj ya da eğilme değişirse sonuç "eski" olur.

**Doğrulama** (`tests/tx-sim3d.test.mjs`, 7 test):
- **Çevre ölçümü analitik değerle aynı.**
  - Gömlek göğsü = göğüs + bolluk (üç farklı ölçüde ±0,5 mm).
  - Etek beli = bel (pens düşülmüş, ±0,2 mm), kalça = kalça + bolluk.
- **Elips çevresi.** Ölçüye eşit (1e-6).
- **Dökümlülük modeli.**
  - Belirlenimci ve durulur.
  - Çok sert numune düz kalır: katsayı > 0,99, dalga yok. Bu, ölçüm yönteminin kendi doğruluğunu sınar.
  - Eğilme arttıkça katsayı artar, gramaj arttıkça azalır; disk üstü sabit.
- **Kalibrasyon.** Hedefe ±0,02; durum kuralları; model doğrulamasına yazılma.
- **Tarayıcı testi.**
  - Gömlek kalıbından 3B sahne (vücut + kabuk), göğüs bolluğu uygun, ÖNİZLEME etiketi; kazak 3B.
  - Poplin benzetimi doğrulanmamış görünür. 0,55 ölçümüne kalibre edilir (bağımsız değil yazısı). İkinci ölçüm 0,57 ile "uyumlu" olur. Dökülmüş numune 3B görünür.

**Sınırlar:**
- **Ağ yakınsaması tam değil.** 21 / 31 / 41 ızgarada katsayı: eğilme 2 için 0,49 / 0,52 / 0,54; eğilme 10 için 0,83 / 0,91 / 0,92. Uygulama 31 kullanır. Bu yüzden eğilme parametresi "etkin" bir model değeridir (KES / Peirce ölçümüyle birebir aynı değil) ve ölçüme kalibre edilmelidir.
- **Model aralığı.** Çok yumuşak kumaşta katsayı 0,25'in altına inmez (öz-çarpışma yok, ağ kaba). Bu aralığın dışındaki ölçümler için kalibrasyon açık hata verir.
- **Süre.** Tek benzetim masaüstünde ~2 s, kalibrasyon (11 benzetim) ~25 s; telefonda daha uzun. Kalibrasyon adım adım çalışır (sayfa donmaz, ilerleme yazılır).
- **Giysi düzeyinde kumaş fiziği yok.** 3B önizleme geometriktir. Giysinin vücut üstünde dökülmesi, dikiş gerilimi, kırışıklık benzetilmez.
- **Vücut formu.** Ortalama oranlarla basitleştirilmiştir; gerçek vücut taraması içe aktarılmaz.

## 15. Aşama 10 raporu: üretim föyü ve maliyet (12.11.2026)

**Çalışanlar** (Föy sekmesi).
- **Operasyon listesi.**
  - Her operasyonun adı, makine türü (düz, overlok, reçme, ilik, düğme, punteriz, ütü, örgü, remaye, yıkama, kontrol, paket…) ve süresi (dakika, SMV) var. Sıra değiştirilir, silinir.
  - Gömlek, etek ve triko (kazak / hırka / süveter) için şablon var. Şablon süreleri genel kaba değerlerdir ve **tahmini** işaretlidir; kullanıcı süreyi değiştirince o operasyon tahmini olmaktan çıkar.
  - Toplam süre ve makine başına süre gösterilir. Doğrulama sekmesi tahmini süre uyarısı verir.
- **Maliyet kartı (bedene göre).**
  - Malzeme: hesaplanan tüketim (kesim planı varsa plandan) ya da elle girilen miktar × fiyat.
  - İşçilik: toplam süre × dakika ücreti / hat verimi.
  - Genel gider %, birim maliyet, kâr % ile satış fiyatı, isteğe bağlı KDV.
  - **Eksik girdi varsa o kalem ve sonrası hesaplanmaz.** Eksikler tek tek yazılır (ör. "dakika ücreti girilmedi", "2 operasyonun süresi yok", "Düğme (fiyat yok)").
- **Sipariş ve malzeme ihtiyacı.** Bedene göre adet ve fire %. Her malzeme için net ihtiyaç, fire dahil ihtiyaç ve tutar. Bir bedende tüketim yoksa açıkça yazılır, toplam uydurulmaz.
- **Üretim föyü PDF'i** (A4, çok sayfa). Sırasıyla:
  - Başlık, renkler / varyantlar, ölçü tablosu (kaynağıyla).
  - Malzeme ve bedene göre tüketim (kaynağı ve varsayımlarıyla), kesim planı özeti.
  - Operasyon listesi (tahmini süreler işaretli), maliyet tablosu ve eksik girdiler, sipariş ve malzeme ihtiyacı.
  - "Doğrulanmamış ve açık kalemler": doğrulanmamış makine profili, doğrulanmamış dökümlülük, ürün sorunları. Sonunda "numune ve prova onayı olmadan seri üretime alınmamalı" notu.

**Doğrulama** (`tests/tx-production.test.mjs`, 6 test):
- **Şablonlar.** Geçerli ve tahmini; gömlek toplamı 15–30 dk.
- **Maliyet zinciri elle hesapla aynı.** 150 + 20 dk × 3 / %80 = 225 → genel gider %20 = 270 → kâr %30 = 351 → KDV %10 = 386,1.
- **Eksik girdi.** Kalemler null kalır, eksikler listelenir.
- **Sipariş ihtiyacı.** = Σ adet × beden tüketimi × (1 + fire); elle miktar önceliklidir.
- **Model düzeyinde.** Gömlek + kalıp + poplin uçtan uca; doğrulama kuralları (verim aralığı, tam sayı adet); eski kayıtların göçü.
- **PDF.** Geçerli, çok sayfa, bölümler ve işaretler metinde.
- **Tarayıcı testi.**
  - Şablon 16 operasyon tahmini; eksik girdi uyarısı.
  - Süre düzeltilince "tahmini" kalkar.
  - Girdiler girilince işçilik ve maliyet zinciri ekrandaki toplam süreden elle hesapla aynı.
  - 200 adet + %3 fire ile malzeme ihtiyacı, PDF indirilir; doğrulamada hata yok.

**Sınırlar:**
- **Süreler.** Şablon süreleri sektör ortalaması değildir, yalnız başlangıçtır. Gerçek maliyet için firmanın zaman etüdü (GSD / MTM ya da kronometre) gerekir.
- **İşçilik kalemleri.** Dakika ücretine işçilik ve makine birlikte girilir; kesim, yıkama gibi dış işlemler ayrı fatura edilmez (operasyon olarak eklenir).
- **Renk dağılımı.** Sipariş bedene göredir; renk × beden dağılımı ve renge göre farklı malzeme yok.
- **Kapsam dışı.** Hat dengeleme (operasyonların istasyonlara dağıtımı), kapasite ve termin planı yok. Para birimi tek (TL); kur dönüşümü yok.

