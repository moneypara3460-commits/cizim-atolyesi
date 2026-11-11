# Tekstil ve Moda çalışma alanı: Aşama 0 mimari planı ve risk raporu

Tarih: 11.11.2026 · Temel: sürüm 20261111e. Bu belge yalnızca plandır, hiçbir kod değişikliği yapılmamıştır.

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
tx/
  model.js      proje şeması, sürüm, göç (migration), doğrulama
  store.js      IndexedDB kayıt/açma, otomatik kayıt, dışa/içe JSON yedek
  curve.js      kübik Bezier / Catmull-Rom, uzunluk, bölme, en yakın nokta, çokgen yaklaşımı
  contour.js    kapalı kontur, öz-kesişim, alan, yön, köşe işlemli ofset (dikiş payı)
  piece.js      kalıp parçası: dikiş hattı, kesim hattı, pens, çıt, iplik yönü, etiket
  sketch-tx.js  teknik çizim (ön/arka/yan, simetri, katman, şablon, detay kütüphanesi)
  grade.js      beden tabloları, grading kuralları (nokta bazlı Δx/Δy), bütünlük kontrolü
  fabric.js     kumaş ve aksesuar kartları ("tahmini" bayrağı ile)
  nest.js       kumaş yerleşimi (worker), verim/fire, kısıtlar
  pdf.js        vektör PDF, 1:1 A4 döşemeli baskı, föy sayfaları
  dxf-aama.js   kalıp DXF (AAMA/ASTM D6673 düzeni) okuma/yazma
  ui-*.js       arayüz parçaları (telefon önce, dokunmatik)
```

Paylaşılan modüller **salt okunur** kullanılır. Bunlar: `cad2d-geom.js` (kesişim, DXF temel yazıcı, dönüşümler) ve `logic.js` içindeki yardımcılar (`fmtNum`, `esc`). Bunlarda tekstil için değişiklik gerekirse önce makine testleri çalıştırılır ve onay istenir.

**Açılış seçimi:** `index.html`'de ilk açılışta iki büyük düğmeli bir seçim ekranı olur. Son seçim hatırlanır. Makine alanında araç çubuğuna "Tekstil'e geç", tekstilde "Makine'ye geç" eklenir. Makine koduna dokunan tek değişiklik budur (birkaç satır) ve E2E testiyle korunur.

### Proje verisi (sürümlü, türlendirilmiş)

```json
{ "kind": "cizim.textile", "schema": 1, "id": "…", "name": "…", "created": 0, "modified": 0, "rev": 12,
  "units": "mm", "sizeTable": { "system": "kullanıcı", "base": "M", "sizes": ["S","M","L"], "measures": {…} },
  "sketches": [ … teknik çizim … ],
  "pieces":   [ { "id", "name", "qty", "mirror", "grain": [x,y,x,y], "nap": false, "fabric": "f1",
                  "seam": { "path": [ … eğri segmentleri … ] }, "allowance": [ { "edge": 0, "w": 10, "corner": "miter" } ],
                  "darts": [], "notches": [], "grade": { "pointId": { "S": [dx,dy], "L": [dx,dy] } } } ],
  "fabrics":  [ { "id", "name", "type", "width", "gsm", "stretch": { "warp": null, "weft": null }, "shrink": {…}, "estimated": ["stretch"] } ],
  "markers":  [ … yerleşimler … ], "techpack": { … }, "revisions": [ { "rev", "at", "note" } ] }
```

- `kind` ve `schema` her projede bulunur. Eski şemalar `model.js` içindeki göç fonksiyonlarıyla yükseltilir; bu da test edilir.
- Makine projeleri (`cizim:projects`) ile tekstil projeleri (IndexedDB `cizim-tx`) **ayrı yerde** tutulur. Biri diğerini okuyamaz, bozamaz.

### Telefon, tablet, masaüstü

- Önce telefon için tasarlanır: büyük dokunma hedefleri, iki parmakla yakınlaştırma ve kaydırma, uzun basınca bağlam menüsü.
- Sayısal giriş her araçta vardır, çünkü parmakla hassas nokta koymak zor. Makine 2B CAD'deki yaklaşımın aynısı.
- Ağır hesaplar (yerleşim, grading kontrolü, 3B kumaş) Web Worker'da çalışır.

## 3. Aşamaların Claude görevlerine bölünmesi

| Görev | İçerik | Bitti sayılma ölçütü (test) |
|---|---|---|
| T0 (bu belge) | Mimari ve risk | Onay |
| T1a | Açılış seçimi, `tekstil.html` iskeleti, `model.js` ve `store.js` (IndexedDB, sürüm, göç) | Kaydet → yenile → aç aynı; makine E2E'si değişmeden geçer |
| T1b | `curve.js` ve teknik çizim: ön/arka/yan, simetri, katman, ölçü; tişört, gömlek, pantolon, etek, elbise, ceket şablonları; detay kütüphanesi; PNG ve vektör PDF/SVG | Eğri uzunluğu analitikle (çember, düz) ±0,01 mm; simetri tam; PDF ölçeği 1:1 |
| T2 | Kalıp parçası, pens, çıt, dikiş payı (seçili kenar / tüm çevre, köşe türleri), böl, birleştir, döndür, aynala, kontur doğrulama, ölçü tablosu bağlantısı | Bilinen dikdörtgen/daire kalıbında pay alanı ve çevresi analitikle eşleşir; öz-kesişim yakalanır |
| T3 | Beden tablosu (kullanıcı tanımlı ve örnek tablolar), nokta bazlı grading, yuva (nest) görünümü, bütünlük kontrolü | Bedenler arası ölçü farkı kurala tam eşit; dikiş hattı uzunluk eşleşmesi (kol ↔ kol oyuğu) raporlanır |
| T4 | Kumaş ve aksesuar kütüphanesi | Zorunlu alanlar doğrulanır; tahmini değerler işaretli |
| T5 | Kumaş yerleşimi: kısıtlar, otomatik + elle, verim/fire, kesim planı çıktısı | Bilinen dikdörtgen kümelerinde alt sınır ile karşılaştırma; kısıt ihlali sıfır |
| T6 | Teknik föy (PDF), iş emri, revizyon | Föy sayfaları ve tablolar projeden üretilir; revizyon geri alınabilir |
| T7 | Dosya alışverişi: kalıp DXF (AAMA / ASTM D6673), SVG, PDF | Kendi çıktısı gidiş-dönüşte ölçek ve eğri hatası < 0,1 mm |
| T8 | 3B giysi: önce **görsel önizleme**, sonra fiziksel kumaş çözücüsü | Önizleme ve fiziksel simülasyon arayüzde ayrı adlandırılır; çözücü sabit yük altında analitik sarkma testleriyle doğrulanır |
| T9 | Uçtan uca tekstil testleri ve kalite raporu | Kalite raporuna "Tekstil" bölümü eklenir |

Plandaki sırayla uyumlu: önce 0–3 (kullanılabilir 2B temel), sonra 4–5, sonra föy ve dosyalar, en son 3B.

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

## 5. Onay gereken kararlar

1. Tekstil'in ayrı sayfa (`tekstil.html`) olarak yapılması ve açılışta seçim ekranı eklenmesi. Makine koduna dokunan tek değişiklik bu.
2. Tekstil projelerinin IndexedDB'de, makine projelerinden ayrı saklanması.
3. Görev sırası: T1a → T1b → T2 → T3 → … (tablodaki gibi).
