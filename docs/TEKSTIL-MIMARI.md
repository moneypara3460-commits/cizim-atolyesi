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

**Açılış seçimi:** `index.html`'de ilk açılışta iki büyük düğmeli bir seçim ekranı olur. Son seçim hatırlanır. Makine alanında araç çubuğuna "Tekstil'e geç", tekstilde "Makine'ye geç" eklenir. Makine koduna dokunan tek değişiklik budur (birkaç satır) ve E2E testiyle korunur.

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

## 3. Aşamaların Claude görevlerine bölünmesi

| Görev | Dal | İçerik | Bitti sayılma ölçütü (test) |
|---|---|---|---|
| T0 (bu belge) | — | Mimari ve risk | Onay |
| T1a | Ortak | Açılış seçimi, `tekstil.html`, proje türü seçimi (dokuma / triko / karma), `model.js` + `store.js` (IndexedDB, sürüm, göç), koleksiyon ve varyant iskeleti | Kaydet → yenile → aç aynı; eski şema göçü; makine E2E'si değişmeden geçer |
| T1b | Ortak | `curve.js` ve teknik çizim: ön/arka/yan, simetri, katman, ölçü; tişört, gömlek, pantolon, etek, elbise, ceket, kazak, hırka şablonları; detay kütüphanesi; PNG, vektör PDF / SVG | Eğri uzunluğu analitikle ±0,01 mm; simetri tam; PDF ölçeği 1:1 |
| T2 | Dokuma | Kalıp parçası, pens, çıt, dikiş payı (seçili kenar / tüm çevre, köşe türleri), böl, birleştir, döndür, aynala, kontur doğrulama, ölçü tablosu bağlantısı | Bilinen kalıplarda pay alanı ve çevresi analitikle eşleşir; öz-kesişim yakalanır |
| T3 | Triko | İlmek sözlüğü, örgü deseni ızgarası (düz, ters, ribana, jakar, saç örgüsü), tekrar, numune / gauge, ölçü ↔ ilmek dönüşümü, sıra bazlı eksiltme / artırma ile parça kalıbı, desen PDF'i | 1×1 / 2×2 ribana ve saç örgüsü kuralları (çapraz genişliği, ön/arka yatak) doğrulanır; gauge dönüşümü elle hesapla tam; eksiltme tablosu hedef ölçüye ±1 ilmek |
| T4 | Ortak + iki dal | Beden tabloları; dokumada nokta bazlı grading; trikoda bedene göre ilmek / sıra sayılarının gauge'dan yeniden hesabı | Bedenler arası fark kurala tam eşit; dikiş hattı eşleşmesi (kol ↔ kol oyuğu) raporlanır |
| T5 | Ortak | Kumaş, iplik, aksesuar kütüphanesi; iplik numarası dönüşümleri | Nm / Ne / tex / dtex dönüşümleri tam; tahmini değerler işaretli |
| T6 | Dokuma + triko | Dokuma: kumaş yerleşimi, verim / fire, kesim planı. Triko: iplik tüketimi ve ürün gramajı (ilmek boyu × ilmek sayısı × tex) | Dokuma: kısıt ihlali sıfır, verim alt sınırla raporlanır. Triko: bilinen numunede gramaj elle hesapla eşit; ilmek boyu ölçülmediyse sonuç "tahmini" |
| T7 | Ortak | Teknik föy (dal bazlı sayfalar), malzeme listesi, maliyet, iş emri, revizyon | Föy projeden üretilir; revizyon geri alınabilir |
| T8 | Dokuma + triko | Dosya alışverişi: kalıp DXF (AAMA / ASTM D6673), SVG, PDF; triko için makineden bağımsız çıktı (desen ızgarası PNG / CSV, sıra sıra talimat) | Gidiş-dönüşte ölçek ve eğri hatası < 0,1 mm |
| T9 | Triko | Makineye özgü program çıktısı: yalnız biçimi açık ve doğrulanabilen makineler için, makine profili ve uyumluluk kontrolüyle | Bkz. risk 12; doğrulanamayan makine için çıktı düğmesi yok, gerekçe yazılı |
| T10 | 3B | Dokuma: önizleme, sonra fiziksel kumaş çözücüsü. Triko: önizleme, sonra ayrı örgü parametreleriyle model | Önizleme ve fizik ayrı adlandırılır; çözücü analitik sarkma testleriyle doğrulanır |
| T11 | Hepsi | Uçtan uca tekstil + triko testleri, kalite raporu | Kalite raporuna "Tekstil" bölümü |

Sıra, birleşik yapıdaki ilkeye uyar: ortak altyapı ve teknik çizim → dokuma kalıbı → triko desen ve ilmek → grading, malzeme ve tüketim → föy ve dosyalar → makine çıktısı → 3B.

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

## 5. Onay gereken kararlar

1. Tekstil'in ayrı sayfa (`tekstil.html`) olarak yapılması ve açılışta seçim ekranı eklenmesi. Makine koduna dokunan tek değişiklik bu.
2. Tekstil projelerinin IndexedDB'de, makine projelerinden ayrı saklanması.
3. Dokuma ve triko için ortak üst şema ile ayrı alt şemalar (`woven`, `knit`).
4. Görev sırası: T1a → T1b → T2 (dokuma) → T3 (triko) → T4 … (tablodaki gibi).
