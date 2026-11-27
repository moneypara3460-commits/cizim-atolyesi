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

**Aşama 2 — 3D kalıp yükleme, görüntüleme, ölçüm.** Yapıldı (19.11.2026): `project.last.mesh`, bkz. aşağıda "3D kalıp". `future.last3d` alanı kullanılmıyor (eski kayıtlarla uyum için duruyor).

**Kalıp fotoğrafı (yapıldı, Kasım 2026).** `project.last`: yan ve alt görünüşün kâğıt (A4/A3) üstünde çekilmiş
fotoğrafından ölçülü dış çizgi (`ayk/last.js`: kâğıt bulma → perspektif düzeltme → renk farkıyla ayırma → sınır izleme → mm).
Bilinen kalıp boyu girilirse ölçek ona göre düzeltilir. Çizgi stampada referans katmanında, fotoğraf altlık olarak açılır.
`project.modelRef`: yapılacak modelin resimleri (en çok 6) ve notu; stampada köşedeki "Model" düğmesiyle görünür.
Sınır: fotoğraf 3D kalıbın gölge/yükseklik etkisini taşır; kesin ölçü için bilinen boy girilmeli.

**Kalıptan otomatik saya parçaları (yapıldı, Kasım 2026).** `ayk/auto.js`: kalıbın yan çizgisi kanonik konuma getirilir
(topuk solda, burun sağda, taban altta; yön kendiliğinden tahmin edilir, kullanıcı çevirebilir). Kalıp boyuna oranlı model
çizgileriyle (arka yükseklik, dil başı, bağcık ağzı, yan saya önü, burun kapağı) Derby, Oxford, Loafer ve Spor için yarım
kalıp parçaları üretilir: ön saya, yan saya, dil, burun kapağı, topuk takviyesi, maske. Kenar türleri (montaj, binme,
katlama, dikiş, orta çizgi) ve paylar atanır, bağcık delikleri ve yan saya ↔ ön saya eşleşmesi (çentikli) eklenir.
Ayarlar `project.modelRef.auto`'da saklanır; yeniden oluşturma yalnız bu yolla üretilen parçaları değiştirir.
Sınır: oranlar genel varsayılanlardır, kalıba ve modele göre usta ayarı gerekir; model fotoğrafından çizgi okuma ayrı adımdır.

**Model fotoğrafını yapay zekâyla okuma (yapıldı, Kasım 2026).** `ayk/ai.js` → Supabase fonksiyonu `ayk-model-oku`
(`supabase/functions/ayk-model-oku`): fotoğraf Claude'a gösterilir; model tipi, burun kapağı, delik sayısı, dil başı /
bağcık ağzı / yan saya önü / burun çizgisi konumları (% kalıp boyu) ve arka yükseklik oranı JSON olarak döner,
sınırlar içine kırpılır ve otomatik parça ayarlarına çevrilir. Kötüye kullanım sınırı: IP başına günde 20, toplam 300
(`public.ai_take`). **Açmak için** Supabase → Edge Functions → Secrets'a `ANTHROPIC_API_KEY` girilmeli; girilmezse
uygulama "henüz açılmadı" der. Sınır: oranlar tahmindir, en iyi sonuç tam yandan çekilmiş fotoğrafla alınır.

**Aşama 3 — kamerayla tarama.** `future.scan`: ham nokta bulutu / ağ referansı + kalibrasyon (bilinen ölçülü işaret). Depodaki `hand/` kamera altyapısı (izin, önizleme) örnek alınabilir.

**Aşama 4 — fotoğraftan saya tanıma.** Çıktısı doğrudan bu aşamanın veri biçimine yazılmalı: her tanınan parça için `outline` (düğüm yolu, mm), `edges` (pay türü önerisi), `marks`. Ölçek, fotoğraftaki bilinen ölçüden alınmalı. Depodaki `photo2d.js` (elle çizimden çizgi / yay çıkarma) başlangıç olabilir.

**Aşama 5 — açınım ve kampre.** Girdi hazır: parça bazında `forming` (kampre, ön / arka form, bölgesel paylar, kalıba çekme, esneme yönü, kalınlık) ve malzeme (`thickness`, `stretchDir`, `stretchPct`). Çıktı, mevcut `outline` + `edges` yapısına yeni bir parça sürümü olarak yazılmalı (kaynağı `forming.source` ile işaretlenerek), böylece pay motoru, eşleştirme ve dışa aktarma değişmeden çalışır.

**Aşama 6 — grafik / logo.** Yeni bir katman (`grafik`) ve parça içi `graphics: [{ kind, svgRef, transform }]` alanı; `build.js` çizim listesine eklenir, çıktılar otomatik destekler.

**Aşama 7 — grading (27.11.2026: orantılı seri yapıldı, `ayk/grade.js`).** Boy numara başına Δboy (EU 6,67 / UK-US 8,47 mm), yükseklik Δçevre (5 / 6,35 mm) ile ölçeklenir; paylar mm kalır, düğüm kimlikleri korunur. Nokta bazlı kurallar hâlâ ileride: `future.grading`: numara serisi ve nokta bazlı artış kuralları (düğüm kimliği → Δx/Δy). Düğüm kimlikleri kalıcı olduğu için kurallar parçaya bağlanabilir; kenar işaretleri `edge + at` biçiminde olduğundan numaraya göre yeniden hesaplanır. Tekstildeki `tx/woven/grade.js` yöntemi örnek alınabilir.

**Aşama 8 — kesim yerleşimi (27.11.2026: ilk sürüm, `ayk/nest.js`, sayfa "Numara ve Kesim").** Dikdörtgen deri / plaka, daire kusurlar, bıçak payı, yönlü (0° / 180°) ya da serbest dönüş; çift parçanın yarısı ayna, orta çizgili yarım parça kirişe göre açılır (eğri orta çizgide yaklaşık, uyarılır); DXF / SVG. Deri silueti ve kalite haritası hâlâ ileride: `future.nesting`: deri (kusurlu bölge, sırt / karın kalite haritası) ve top malzeme için ayrı stratejiler. Kesim çizgisi `build.cutLine()` ile hazır; tekstildeki `tx/woven/marker.js` başlangıç olabilir.

**Genel kurallar:** her yeni modül `ayk/` altında ayrı dosya; saf hesap modülleri DOM'suz ve Node'da test edilebilir; proje şeması değişirse `SCHEMA` artırılır ve `migrate()` ile eski projeler yükseltilir (testli). Henüz çalışmayan özellik arayüzde çalışıyormuş gibi gösterilmez.

## Ümit Abi'nin istekleri (15.11.2026, sürüm `20261115m`)

**Kesim matı üstünde kalıp fotoğrafı (kâğıtsız).** "Fotoğraftaki kâğıt" → *Kesim matı (10 mm kareli)*. `ayk/last.js → analyzeMat`:
ölçek matın kare çizgilerinin tekrar aralığından (özilişki) bulunur; ızgara çizgileri mat rengine boyanır; kalıp parlaklıktan
bağımsız renk farkıyla (gölge ve parlama ayırmayı bozmaz) ve matın kendi gürültüsüne göre eşikle ayrılır; eğik duran kalıp
uzun ekseni yataya gelecek şekilde döndürülür. Dört görünüş: dış yan, iç yan, alt (taban), üst. Fotoğraf tepeden çekilmiş kabul
edilir: kesin ölçü için **bilinen kalıp boyu** girilmeli (girilince bütün görünüşler ona göre düzeltilir).

**Model resimleri.** En çok 6 resim (önden, arkadan, üstten, iki yandan önerilir); hepsi birlikte yapay zekâya gider.

**Modelden bütün saya parçaları (yapay zekâ).** Saya Parçaları → "🤖 Bütün parçaları modelden çıkar".
`ayk/ai.js → readModelParts` resimleri küçültüp (1100 px) kalıp bilgisiyle (boy + her ~10 mm'de üst çizgi yüksekliği)
`supabase/functions/ayk-parca-cikar`'a gönderir. Sunucu Claude'dan modelin bütün üst parçalarını dış yan görünüşünde
mm koordinatla (x topuktan, y tabandan) ve kat sırasıyla (0 temel, 1 üstüne dikilen …) ister; marka logoları çizilmez,
yerine "Logo yeri" dikdörtgeni gelir. `ayk/aiparts.js → generateAi` parçaları kalıbın çizgisine oturtur ve kenar türlerini
kendisi bulur: tabana inen kenar → kalıba çekme (montaj), orta çizgi → simetri ekseni (yarım kalıp), topuk arkası → arka dikiş,
üstteki parçanın altında kalan kenar → binme payı, alttaki parçanın üstüne binen kenar → katlama + 2 sıra dikiş, açık kenar →
kenar + dikiş. Bağcık delikleri işaret olarak eklenir. Ek parçalar (açılıp kapatılabilir): ön ve arka astar (üst parçaların
kapladığı alandan), kontrfort (topuk sertliği), burun sertliği. İç yan fotoğrafı varsa tabana inen yan parçaların iç yan eşi
iç yan kalıp çizgisine orantılanarak ayrıca çıkarılır. Yumuşatma keskin köşede kesim çizgisini bozarsa parça düz çizgilerle,
o da olmazsa pah köşeyle yeniden kurulur. Sonuç `project.modelRef.ai`'de saklanır: seçenek değiştirmek ya da yön çevirmek
sunucuya yeniden gitmeden parçaları yeniden kurar. Kötüye kullanım sınırı: kişi başına günde 10, toplam 150.

**Kalıp yönü tahmini iyileştirildi** (şablon parçalar da yararlanır): topuk = kalıbın en yüksek yerinin olduğu yarı;
taban = daha düzgün akan çizgi (eğrilik karşılaştırması). Yanlışsa "↔ Burun yönünü çevir" / "↕ Tabanı çevir".

**Sınırlar (dürüst):** parça çizgileri fotoğraftan tahmindir; ilk sonuç ustanın kontrolünden geçmeli, gerekirse Stampa
Atölyesi'nde düğümler sürüklenerek düzeltilir. Mat ölçeği tepeden olmayan çekimde sapar (bilinen boy bunu düzeltir).
Parçalar arası hizalama: üstteki parçanın binen kenarına A, B … harfli çentik; alttaki parçada aynı yere aynı harfle çentik (kenardaysa) ya da binme noktası (içindeyse). Kamerayla 3B tarama yok; 3D kalıp dosyası (STL / OBJ) yüklenebilir (aşağıda).

Testler: `tests/ayk-aiparts.test.mjs` (9: sentetik mat ölçeği ve eğik kalıp, parça yerleştirme, kenar türleri, iç yan,
kayıt güvenliği, çizgi yumuşatma, mat çizgisinin kalıba yapışmaması, taşan yapay zekâ çizgisinin kırpılması);
`tests/e2e/ayk-auto.mjs` 4. senaryo (gerçek kalıbın mat fotoğrafı + sahte sunucu yanıtıyla uçtan uca).

### Mat ölçeği düzeltmesi (19.11.2026, sürüm `20261119c`)

Ümit Abi'nin gerçek kalıp fotoğraflarında (32 numara, ~213 mm) ölçek kareleri yanlış sayıyordu: boy 420–1000 mm çıkıyordu.
Nedenler: bütün görüntünün sütun toplamında ilk tepe seçiliyordu (kalıbın yüzey dokusu ve gürültü yarım/üçte bir kareyi
yakalıyordu); eğik çekimde kare boyu yere göre değiştiği hâlde tek ölçek kullanılıyordu.

- Görüntü parçalara bölünür; her parçada ızgaranın iki çizgi ailesi ayrı bulunur (açı taraması, daire içinden örnek
  ki köşegen yön kayırılmasın), her aile için en güçlü özilişki tepesi alınır (2 ya da 3 kare atlayan uyum değil).
- Kalıp önce kaba ölçekle bulunur; sonra kalıbın dışında kalan, matla buluştuğu alt kenara en yakın parçalardan
  yerel doğrusal uydurmayla o noktadaki kare aralığı, kalıbın uzun ekseni yönünde hesaplanır; kalıp bu ölçekle yeniden ayrılır.
- Sonuç (aynı kalıbın gerçek fotoğrafları): yandan 213,4 mm, çapraz 207,6 mm, tabandan 224 mm, eski test fotoğrafı 216,7 mm.
  Kalıbın ucundan bakan (boyuna) çekim hâlâ kısa ölçer (171 mm) — kalıp boyu o açıdan görünmez.
- Kesin ölçü için bilinen kalıp boyu girilmesi önerisi sürüyor.
- Test: `tests/ayk-aiparts.test.mjs` 10 (eğik çekilmiş mat, yüzeyi dokulu kalıp; eski kod 345 mm buluyordu).

### Hızlı yama (19.11.2026, sürüm `20261119a`)

Ümit Abi'nin denemesinde (16.11.2026) iki sorun görüldü: fotoğraftan çıkan kalıp çizgisi tırtıklıydı, yapay zekânın
model çizgileri kalıbın dışına taşıyordu.

- **Mat çizgisi silme kalıbı ısırıyordu.** Izgara çizgisinin kalıbın gölgede kalan yüzüne denk gelen uzantısı da mat rengine
  boyanıyordu; çizgi bu yüzden kalıbın içine dişli dişli giriyordu. Artık yalnız renk tonu matın / çizginin tonuna yakın
  pikseller boyanır (çizgi tonu kenar şeridinden ölçülür); kalıbın kendi yüzeyine dokunulmaz.
- **Gölge ve mat çizgisi temizliği (yalnız kesim matında).** Açık renkli kalıpta zemin tonunda koyulaşmış (ya da çok koyu)
  pikseller gölge sayılıp çıkarılır; kalıbın gölgede kalan yüzü kendi tonunu koruduğu için silinmez. ~1,6 mm'den ince
  çıkıntılar (mat çizgisi) açma ile silinir, kenar girintileri kapama ile kapanır; kalıbın üstündeki delik ve yazı doldurulur.
- **Çizgi yumuşatma** (`smoothLoop`): çizgi 0,5 mm aralıkla yeniden örneklenir, büzülme düzeltmeli Gauss ortalaması
  (σ = 2 mm) uygulanır; piksel basamağı ve kenar tırtığı en az %70 azalır. 3 mm ölçeğinde 50°'den keskin dönen gerçek köşeler
  (topuk oturağı, burun ucu, konç tepesi) yuvarlanmaz. Kâğıt üstünde ölçülen boy değişmedi (sentetik 262 mm kalıp: 261,0 mm,
  önceki sürümle aynı).
- **Yapay zekâ çizgisi kalıbın içinde kalır** (`keepIn`, `densify`): parça köşeleri 4 mm'den sık ara noktalara bölünür,
  her nokta kalıbın sütun aralığına (üst çizgi … taban) sıkıştırılır, yine dışarıda kalan (topuk kavisi, burun ucu) en yakın
  kalıp kenarına oturtulur. Yumuşatılan kenar eğrileri de aynı işlemden geçer. İç yan eşi de iç yan kalıp çizgisine göre kırpılır.
  Ölçüt: net çizgi kalıp kenarını en çok 0,5 mm aşabilir (düğümler arası eğri payı).
- Bu sırada bulunan gizli hata düzeltildi: çentik eşleştirmede önce "parçanın içinde" bulunan, sonra kenarda bulunan
  parça karşılaştırılınca hata veriyordu (`addNotches`).

## 3D kalıp — STL / OBJ (19.11.2026, sürüm `20261119b`)

Proje Dosyaları (ya da Yeni Proje) → Kalıp ve model resmi → **3D kalıp yükle**. Kalıbın 3D taraması ya da çizimi
yüklenince dört görünüş (dış yan, iç yan, alt, üst) fotoğrafsız, tam ölçüsünde çıkar; bundan sonrası (stampa altlığı,
otomatik ve yapay zekâlı parçalar) fotoğraftaki gibi çalışır. Model resimleri (en çok 6) aynı kartta eklenir.

`ayk/last3d.js` (saf hesap) ve `ayk/last3d-worker.js` (ağır işler arka planda; işçi açılamazsa aynı kod sayfada çalışır):

- **Okuma:** ikili ve yazı biçimli STL (başı "solid" diye başlayan ikili dosya boyutundan tanınır), OBJ (çokgen yüzler
  yelpaze üçgenlere bölünür, eksi / göreli sıra numaraları, `v/vt/vn`). En çok 3 milyon üçgen, 150 MB.
- **Birim:** kalıbın en uzun ölçüsünü 80–450 mm aralığına düşüren birim (mm, cm, inç, m). Hem cm hem inç olabilen ölçüde
  projedeki numaradan beklenen boya en yakın olan seçilir. Kartta değiştirilebilir.
- **Yön:** uzun eksen yüzey dağılımının ana ekseni; düşey eksen, uzun eksene dik düzlemde normallerin toplandığı doğrultu,
  konç yüzünden eğik çıkan uzun eksene göre ±35° taranarak düz yüz alanı en büyük olan. Taban, kesitte düz olan uçtur
  (normalin yönüne bakılmaz: üçgen sırası ters dosyada da çalışır). Topuk konç tarafı (en yüksek yer), x ekseni topuk
  arkasından burun ucuna. Dış / iç yan tahmindir: burun ucu, topuk ortası → tarak ortası doğrusuna göre iç yana kaçıktır.
  Kartta: ↔ burun / topuk, ↕ taban / üst, ⟳ 90°, dış / iç yan düğmeleri; önizleme parmakla döndürülür.
- **Saklama:** kaynak (aynı noktadaki köşeler birleşir), en çok 60 000 üçgene sadeleştirme (köşe kümeleme + kuadrik konum,
  Lindstrom 2000: uçlar ve kenarlar içe çekilmez; ölçü sapması deneyde < 0,4 mm), 16 bit nicemleme (kutu / 65535 ≈ 0,004 mm).
  Proje JSON'unda base64 (60 000 üçgende ≈ 0,7 MB); yedek dosyasıyla birlikte taşınır. Kapalılık (açık kenar) asıl yüzeyde denetlenir.
- **Görünüşler:** dik izdüşüm, 5 piksel / mm (yanlış birimde görüntü 3000 pikseli geçmez), kaplanan alan → sınır izleme →
  yarım piksel dışa düzeltme. Deneyde boy / yükseklik / genişlik 3D ölçüyle ±0,15 mm. Görünüş kaydında `src: '3d'`.
- **Numara denetimi (yaklaşık):** EU numarası kalıp boyunun Paris noktası (2/3 cm) cinsinden değeridir → beklenen boy =
  numara × 6,667 mm. UK yetişkin: (numara + 25) ÷ 3 inç. US erkek ≈ UK + 1 kabulüyle (resmî standart değil; kadın numarasında
  ≈ 13 mm kısa beklenir). Mondopoint ayak boyudur; kalıp tipik olarak 13–17 mm uzundur. Fark 10 mm'ye kadar uyumlu, 10–25 mm
  uyarı (burun biçimi bu kadar fark yaratabilir), 25 mm üstü "birim ya da numara yanlış olabilir" (uyan birim önerilir).

Sınırlar (dürüst): iç / dış yan ve yön tahmindir, önizlemeden kontrol edilmeli. Görünüşler dik izdüşümdür (fotoğraftaki
perspektif yok). Yüzey açınımı, sanal bantlama ve forme bir sonraki işlerdir (1c, 1d).

Testler: `tests/ayk-last3d.test.mjs` (10: okuma, birim, 12 duruş + ters üçgen sırasıyla yön, çevirme, ~500 000 üçgen
sadeleştirme, saklama ve bozuk kayıt, görünüş ölçüleri, 3D görünüşten derby, numara denetimi, arka plan işi);
`tests/e2e/ayk-3d.mjs` (4: yeni projede STL → derby parçaları; birim, yön düğmeleri, yeniden açma; yazı STL / OBJ / inç,
bozuk dosya, telefon; işçi açılamazsa sayfada). Deneme kalıbı sentetiktir (`tests/fixtures/kalip-3d.mjs`, ölçüleri temsilî).
