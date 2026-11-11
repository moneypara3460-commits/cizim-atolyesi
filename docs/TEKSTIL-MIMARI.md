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
| 2 | Teknik moda çizimi: `curve.js`, ön / arka / yan, simetri, katman, ölçü; dokuma ve triko şablonları; detay kütüphanesi; PNG, vektör PDF / SVG | Eğri uzunluğu analitikle ±0,01 mm; simetri tam; PDF ölçeği 1:1 | Yok |
| 3 | Dokuma kalıbı: parça, pens, çıt, dikiş payı (seçili kenar / tüm çevre, köşe türleri), böl, birleştir, döndür, aynala, kontur ve eğri doğrulama | Referans kalıplarda pay alanı / çevresi analitikle eşleşir; öz-kesişim yakalanır | Yok |
| 4 | Beden ve grading: nokta bazlı grading, kişiye özel ölçü altyapısı, bütünlük kontrolü; trikoda bedene göre ilmek / sıra sayıları | Bedenler arası fark kurala tam eşit; dikiş hattı eşleşmesi raporlanır | Yok (tablo altyapısı Aşama 1'de var) |
| 5 | Triko desen ve ilmek: ilmek sözlüğü, ızgara, düz / ters / ribana / saç örgüsü / jakar, tekrar, renk raporu, numune ve gauge, sıra bazlı eksiltme / artırma | Ribana ve saç örgüsü kuralları; gauge dönüşümü elle hesapla tam; eksiltme tablosu hedef ölçüye ±1 ilmek; desteklenmeyen yapıda açık uyarı | Yok |
| 6 | Kumaş, iplik, aksesuar kütüphanesi (ayrıntılı); iplik numarası dönüşümleri; tüketim, gramaj, maliyet | Nm / Ne / tex / dtex dönüşümleri tam; numunesiz sonuç "tahmini" | Kısmi: kart yapısı, birimler, "tahmini" işareti, malzeme maliyeti Aşama 1'de var |
| 7 | Kumaş yerleşimi ve kesim optimizasyonu | Kısıt ihlali sıfır; verim alt sınırla raporlanır | Yok |
| 8 | Triko makine profilleri ve üretim çıktısı | Doğrulanamayan makine için çıktı yok, gerekçe yazılı (risk 12) | Yok |
| 9 | 3B giysi ve kumaş / örgü simülasyonu | Önizleme ve fizik ayrı adlandırılır; çözücü analitik testlerle doğrulanır | Yok |
| 10 | Üretim föyü ve maliyet: işçilik, operasyon sırası, dikiş türü, vektör PDF | Föy projeden üretilir; maliyet varsayımları yazılı | Kısmi: föy özeti, varyant, malzeme maliyeti, tarayıcıdan yazdır / PDF Aşama 1'de var |
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
