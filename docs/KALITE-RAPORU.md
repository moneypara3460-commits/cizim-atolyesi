# Kalite raporu — Çizim Atölyesi (sürüm 20261112t)

Tarih: 11.11.2026, güncelleme 12.11.2026 (tekstil bölüm 7, CNC torna bölüm 8) · Ortam: Linux sunucu, Node 22, Chromium (Playwright) + yazılımsal WebGL (SwiftShader).
Test komutları ve kurallar: [TESTLER.md](../TESTLER.md). Bu rapor uygulamanın hatasız olduğunu iddia etmez. Yalnızca neyin, hangi ortamda, hangi toleransla sınandığını gösterir.

## 1. Özet

Durumlar ayrı sayılmıştır, birbirine karıştırılmaz:

| Katman | Geçti | Başarısız | Atlandı | Blokeli | Çalıştırılamadı |
|---|---|---|---|---|---|
| Node birim / entegrasyon (33 dosya; 12.11.2026) | 442 | 0 | 0 | 0 | 0 |
| — bunun içinde gerçek OCCT WASM | 16 | 0 | 0 | 0 | 0 |
| Tarayıcı uçtan uca (Chromium, emülasyon; makine + tekstil) | 36 | 0 | 0 | 0 | 0 |
| GitHub Actions CI (3 iş: birim, OCCT WASM, E2E) | 3 iş | 0 | 0 | — | 0 · sonuç commit sonrası CI'da (bkz. bölüm 8) |
| Gerçek telefon / tablet | — | — | — | — | Yapılmadı (yalnız emülasyon) |

## 2. Özellik durum matrisi

Sütunlar:
- **Durum**: Çalışıyor, Kısmi, Uygulanmadı ya da Doğrulanmadı.
- **Kanıt**: özelliğin kodda nerede olduğu.
- **Test**: hangi testin kapsadığı. U = birim, E = E2E.

| Alan | Özellik | Durum | Kanıt (kod) | Test |
|---|---|---|---|---|
| 2B CAD | Çizgi, dikdörtgen, daire, yay, ölçü, kırp, uzat, ofset, radyus | Çalışıyor | `cad2d-geom.js`, `cad2d.js` | U `cad2d` (22), E A |
| 2B CAD | DXF dışa / içe aktarma | Çalışıyor | `toDXF`, `parseDXF` | U `cad2d`, `robust`, E A (gidiş-dönüş + bozuk dosya) |
| 2B CAD | Fotoğraftan çizim, rakam okuma | Kısmi | `photo2d.js`, `digits-model.js` | U `photo2d` (6, sentetik görüntü). Gerçek kâğıt fotoğrafıyla otomatik test yok. |
| 3B CAD | Kutu, silindir, küre, koni, boru, süpürme, loft, dişli, kroki | Çalışıyor | `app.js`, `logic.js`, `sketch.js` | U `logic` (75), `examples`, E B |
| 3B CAD | Delik / oyuk (CSG), yuvarlama, pah | Çalışıyor | three-bvh-csg, `logic.js` | E B. Pah / yuvarlama yalnız kutu ve silindirde (README sınırları). |
| 3B CAD | Boş alana dokununca seçim temizleme | Çalışıyor | `app.js` `hasSel` / `onTap` | U `selection` (9), E B (fare ve dokunma) |
| 3B CAD | Kroki editörü | Kısmi | `sketch.js` | U `sketch` (9). Satır kapsaması %12: editör arayüzü test edilmiyor. |
| 3B CAD | Proje kaydet / aç, otomatik kayıt | Çalışıyor | `app.js` snapshot | E B, D, K, Sağlamlık (bozuk kayıt) |
| B-Rep | OCCT motoru: katı kurma, Boolean, yuvarlama, pah, doğrulama, onarma | Çalışıyor | `occt.js`, `occt-ops.js` | U `occt` (15, gerçek WASM), E C |
| B-Rep | STEP dışa / içe | Çalışıyor | `toSTEP` / `fromSTEP` | U `occt`, E C (gidiş-dönüş + bozuk STEP) |
| B-Rep | IGES içe aktarma | Çalışıyor | occt-import-js | U `occt`, E C (`tests/fixtures/cube-10mm.igs`) |
| B-Rep | IGES dışa aktarma | Uygulanmadı | Derlemede IGES yazıcısı yok. Düğme pasif, gerekçe yazıyor. | — |
| B-Rep | Ağ parçaları (kroki / sac / süpürme) | Kısmi | Üçgen ağdan dikilir: düzlemsel yüzler, 20 000 üçgen sınırı | U `occt` |
| Montaj | Eşleşmeler, eklemler, bağıntılar, çarpışma | Çalışıyor | `app.js`, `mech.js` | U `logic`, `mech`, E D |
| Montaj | Montaj sırası / sökme analizi | Çalışıyor | `assembly.js` | U `assembly` (11), E D |
| Sac | Açınım boyu, açınım DXF | Çalışıyor | `sheetCalc`, `sheetFlatLines` | U `logic`, E E (DXF kapsamı = açınım ±0,6 mm) |
| Üretim | Ağırlık, ağırlık merkezi | Çalışıyor | `weight.js` | U `weight` (16), E F (çelik küp 7,85 kg ±%1) |
| Üretim | Kesim listesi, kesim optimizasyonu | Çalışıyor | `cutopt.js` | U `cutopt` (14), `robust`, E F |
| Üretim | Kaynak tespiti / planı | Çalışıyor | `welds.js` | U `welds` (15), E F (masa: 16 birleşim × 160 mm = 2560 mm) |
| Üretim | Maliyet | Çalışıyor | `cost.js` | U `cost` (12), E F. Fiyatlar kullanıcıdan alınır, uydurulmaz. |
| Üretim | Üretilebilirlik kontrolü | Çalışıyor | `mfgcheck.js` | U `mfgcheck` (18) |
| CAM | 3 eksen: kaba, ince, 3B, delme, simülasyon, G-kodu | Çalışıyor | `cam.js` | U `cam` (9), E G |
| CAM | 4 eksen indeksli / eş zamanlı | Çalışıyor, tezgâhta doğrulanmadı | `cam5.js`, `kin.js`, `coll5.js`, `post5.js` | U `cam5` (16), E I |
| CAM | 5 eksen 3+2 / eş zamanlı, TCP | Çalışıyor, tezgâhta doğrulanmadı | aynı | U `cam5`, E I (Mach3 reddi dahil) |
| CAM | CNC torna (2 eksen X / Z, 11 operasyon, simülasyon, Fanuc torna postu) | Çalışıyor, tezgâhta doğrulanmadı | `lathe.js`, `lathe-ui.js` | U `lathe` (22), `occt` (torna doğrulaması), E H |
| Analiz | Statik, modal, kararlı / geçici ısı, doğrusal burkulma | Çalışıyor | `fea.js`, `fea2.js`, `fem-run.js` | U `fea` (18), `fea2` (14), E J |
| Analiz | Doğrusal olmayan, temas | Uygulanmadı | `ANALYSES` içinde desteklenmiyor diye işaretli | — |
| Analiz | Geleceğimi göster (yorulma, aşınma, alternatifler) | Kısmi | `fea.js`, `sim-ui.js` | U `fea`. Ömür hesapları yaklaşık, arayüzü E2E'de yok. |
| Dışa aktarma | STL, 3MF, ağ STEP, PDF teknik resim | Çalışıyor | `export3d.js`, `logic.js` | U `export3d` (5), `logic` |
| Diğer | Sesli komut | Doğrulanmadı | `parseVoice` | U `logic` (komut çözümleme). Mikrofon ve tarayıcı konuşma tanıma test edilmedi. |
| Diğer | React Native / Expo sürümü (`App.js`) | Doğrulanmadı | eski 2. aşama | Test yok, güncellenmedi |

## 3. Doğrulama sonuçları ve toleranslar

| Konu | Referans | Tolerans | Ölçülen | Test |
|---|---|---|---|---|
| Ankastre kiriş sehimi 200×20×20, F = 1000 N | FL³/3EI = 0,9524 mm | ±%3 | 0,9551–0,9558 mm (%0,3–0,4; ağ yoğunluğuna göre) | `fea2` 2, E J, `perf` |
| Çekme çubuğu σ = F/A ve δ = FL/EA | analitik | %0,1 / %1,5 | test içinde yazılır | `fea2` 1 |
| Modal 1. ve 2. frekans, ısı iletimi, taşınım, Euler burkulması | analitik | test başına (%1–5) | `fea2` çıktısındaki tablo | `fea2` |
| Çelik küp ağırlığı (100 mm) | ρV = 7,85 kg | ±%1 | 7,85 kg | E F |
| Sac açınım DXF dış ölçüsü | panelde yazan açınım boyu | ±0,6 mm | eşit | E E |
| Kaynak: masa iskeleti | 16 uç × 4 × 40 mm | tam | 16 × 160 = 2560 mm | E F |
| OCCT hacim (delikli kutu, Pappus yuvarlama, prizma), sınır kutusu, STEP gidiş-dönüş | analitik / özgün hacim | ±0,001 mm³ (mm) | testte | `occt` |
| 4/5 eksen: ters → ileri kinematik (bütün makineler) | özdeşlik | konum 1e-6 mm, yön 1e-9 | testte | `cam5` |
| 5 eksen eş zamanlı: eğim sınırı / parçaya dalma | 40° / dalma yok | 40° + 1e-6, dalma hacmi < 0,5 mm³ (voksel) | testte | `cam5` |
| Simülasyon ↔ G-kodu | aynı hareket listesi | tam | ayrıştırılan G-kodu = plan | `cam5` |

CNC son işlemci varsayımları: README "4 / 5 eksen CNC" bölümü ve `docs/cnc5-ornekler/`. Hiçbir post gerçek tezgâhta denenmedi. G-kodu testleri biçim ve kinematik tutarlılığını sınar, tezgâhta kuru çalıştırmanın yerine geçmez.

## 4. Performans

Sunucu CPU'sunda tek iş parçacığıyla ölçüldü (`tests/perf.mjs`, E2E ⏱). Telefonda genellikle 3–6 kat yavaştır; bu bir tahmindir, ölçülmedi.

| İş | Süre | Not |
|---|---|---|
| FEM statik kiriş: kaba / orta / ince / çok ince ağ | 0,5 / 0,7–0,9 / 3,2 / 6,1 sn | 5 120 / 10 000 / 40 960 / 80 000 eleman. **Darboğaz**: çok ince ağ telefonda tahminen 20–35 sn. |
| 4 eksen indeksli: plan / çarpışma / voksel simülasyon | 0,17 / 0,03 / 0,83 sn | En pahalı adım simülasyon. |
| 3+2: plan / çarpışma / simülasyon | 0,12 / 0,03 / 0,34 sn | |
| OCCT WASM yükleme | Node 0,18 sn; tarayıcıda ilk model 1,6–1,9 sn | WASM dosyası ~10 MB, ilk açılışta indirilir. |
| OCCT model + doğrulama / R2 yuvarlama / STEP yazma | 0,09 / 0,17 / 0,09 sn | |
| Uygulama açılışı (emülasyon) | telefon 1,2 sn, tablet 2,3 sn, masaüstü 1,3 sn | Kütüphaneler yerel, ağ gecikmesi yok. |
| JS yığın belleği açılışta | 10–13 MB | |
| Parça ekleme (40 parçalı modelde) | ilk 5: ~1,0 sn/parça, son 5: ~0,5 sn/parça | Süre parça sayısıyla artmıyor. Yazılımsal WebGL olduğu için mutlak değerler gerçek GPU'yu temsil etmez. |

## 5. Bulunan hatalar (önem sırasıyla)

| # | Önem | Hata | Durum |
|---|---|---|---|
| 1 | Orta | **Kesim optimizasyonu**: çok büyük adet (ör. 1 000 000 000) girilince hesap bitmiyor, bellek taşıyor, telefon donuyordu. | **Düzeltildi.** Profil başına en çok 20 000 parça hesaplanır. Fazlası hata satırı olarak gösterilir, diğer parçalar hesaplanır. Regresyon testi: `robust`. |
| 2 | Orta | **DXF içe aktarma**: NaN, Infinity ya da bozuk sayılı koordinat 0 kabul ediliyor, dosyada olmayan çizgiler çiziliyordu. Negatif / sıfır yarıçaplı daire ve yay da kabul ediliyordu. | **Düzeltildi.** Bu varlıklar atlanıyor; kullanıcı "geçersiz sayı ×N" bilgisini görüyor. Regresyon testi: `robust`. |
| 3 | Düşük | Sayı gösterimi tutarsız: bazı yerlerde ondalık nokta (sac açınımı "133.05 mm"), bazı yerlerde virgül ("7,85 kg"). `fmtNum` sayı olmayan değeri "0" diye gösteriyor. | Açık. Çok dosyaya dokunan bir değişiklik; onay bekliyor. |
| 4 | Düşük | Kroki editörü (`sketch.js` %12) ve 4/5 eksen arayüzü (`cam5-ui.js` %20) Node testlerinde az kapsanıyor. Arayüz dosyalarının (`app.js` vb.) kapsaması ölçülmüyor; yalnız E2E ile sınanıyor. | Açık (test eksiği). |
| — | Eksik özellik | CNC torna CAM yok. | Blokeli |
| — | Eksik özellik | IGES dışa aktarma yok. Doğrusal olmayan analiz ve temas yok. | Uygulamada açıkça yazıyor |

E2E senaryolarında uygulama hatası, sayfa hatası ya da konsol hatası görülmedi. Bozuk STEP, bozuk DXF ve bozuk kayıt testlerinde beklenen uyarılar dışında hata çıkmadı.

## 6. Yayına hazırlık

**Hazır sayılabilecekler**: 2B / 3B CAD, B-Rep (STEP), montaj, sac, üretim modülleri ve 3 eksen CAM. Otomatik testlerle doğrulandı, kritik kullanıcı akışları tarayıcıda baştan sona geçiyor.

**Yayın öncesi kalan engeller ve riskler**:
1. **Gerçek cihaz testi yapılmadı.** En az bir Android (Chrome) ve bir iPhone (Safari) ile E2E senaryoları elle denenmeli. Özellikle bellek (OCCT WASM, çok ince FEM ağı) ve dokunma hareketleri.
2. CI'da ilk iki çalıştırma kurulum hatasıyla kırmızı oldu (npm klasör adı, three-bvh-csg eş bağımlılığı); düzeltildi, üç iş yeşil. Sayfanın kendisi kütüphaneleri hâlâ unpkg'den yükler: unpkg erişilemezse uygulama açılmaz (çevrimdışı kopya yok).
3. **4/5 eksen G-kodu** hiçbir tezgâhta denenmedi. Kumanda simülasyonu ve tek blokla doğrulanmadan üretimde kullanılmamalı.
4. **CNC torna** uygulanmadı.
5. Analiz sonuçları doğrusal-elastik ve küp ağ ile hesaplanır. Mühendislik onayının yerine geçmez; uygulamada da yazıyor.

## 7. Tekstil ve Moda (Aşama 11, 12.11.2026)

Ortam aynı: Node 22, Chromium (Playwright), telefon / tablet / masaüstü **emülasyonu**. Gerçek cihaz, gerçek örgü makinesi, gerçek kesim masası ve gerçek kumaş numunesiyle deneme **yapılmadı**.

**Özet.**
- Tekstil Node testleri: 11 dosya, 103 test, hepsi geçti.
- Tekstil tarayıcı senaryoları: 17, hepsi geçti (ayrıca makine tarafında 17 senaryo, çalışma alanı seçimi dahil; toplam 35 geçti, 1 blokeli); telefon emülasyonunda (390 × 844), ayrıca tablet ve masaüstünde temel akış.
- Bütün uygulama: 32 dosya / 419 Node testi; makine dahil tüm E2E senaryoları geçti, 1 blokeli (CNC torna, uygulanmadı).

**Promptun Aşama 11 listesi ↔ testler**

| # | Madde | Node testi | Tarayıcı senaryosu | Ölçüt / tolerans |
|---|---|---|---|---|
| 1 | Teknik çizim oluşturma, düzenleme, kaydet / aç | tx-drawing (14) | Tekstil teknik çizim | Eğri boyu, simetri, katman; SVG / PDF ölçeği 1 birim = 1 mm; kaydet → yenile → aç |
| 2 | Kalıp konturu, eğri, ölçü | tx-pattern (14) | Tekstil kalıp | Alan / çevre analitikle ±1e-6; öz-kesişim yakalanır; 1:1 PDF |
| 3 | Dikiş payı, pens, çıt, parça işlemleri | tx-pattern | Kalıp araçları (dokunarak) | Kenar bazında pay, köşe türleri; böl → birleştir alanı korur; pens dikiş boyundan düşer |
| 4 | Grading sonrası ölçü ve geometri | tx-grade (8) | Tekstil grading | Bedenler arası fark kurala tam eşit; 6 beden × 7 dikiş eşleşmesi |
| 5 | İlmek / sıra yoğunluğu, desen tekrarı | tx-knit (11) | Tekstil triko | Gauge dönüşümü elle hesapla tam; tekrar katına uydurma; eksiltme ±1 ilmek |
| 6 | İplik tüketimi ve gramaj | tx-materials (7) | Malzeme / tüketim | Numara dönüşümleri 1e-9; gram = ilmek × boy × tex; tartılan numune kendi ağırlığını verir |
| 7 | Kumaş yerleşimi, tüketim, fire | tx-marker (10), tx-production (fire) | Kesim planı, üretim föyü | Bilinen optimum (%100); çakışma kesin çokgen testiyle 0; tüketim = plan boyu (+ çekme, pastal başı); ihtiyaç × (1 + fire) |
| 8 | DXF içe / dışa ve ölçek | **tx-dxf (6), bu aşamada eklendi** | **Tekstil DXF (AAMA), bu aşamada eklendi** | mm gidiş-dönüşte alan / çevre göreli < 1e-6; inç ve cm ölçeği; pay, kat, çıt, pens, adet korunur |
| 9 | Triko makine profili ve format | tx-machine (9) | Triko makinesi | Doğrulanmamış profil "yalnız numune"; knitout yapısal benzetimi her iğnede şemayla aynı; kapalı biçim üretilmez |
| 10 | 2B kalıptan 3B giysiye akış | tx-sim3d (7) | Tekstil 3B | Göğüs çevresi = göğüs + bolluk ±0,5 mm; 3B sahne ÖNİZLEME etiketli; dökümlülük referanssız "doğrulanmamış" |
| 11 | Dokuma / triko malzeme ayrılığı | tx-model (dal kuralları), tx-sim3d / tx-materials | Karma koleksiyon, triko projesi | Kumaş yalnız dokumaya, iplik yalnız trikoya bağlanır; triko projesinde dokuma araçları yok |
| 12 | Kaydet, yeniden aç, revizyon | tx-model (store, göç) | Karma koleksiyon, kesim planı | Revizyon geri dönüşü; JSON dışa / içe aktarma; bozuk JSON reddi; eski şemaların göçü |
| 13 | Telefon, tablet, masaüstü | — | **Temel akış (telefon / tablet / masaüstü), bu aşamada eklendi** | 11 sekmenin hiçbirinde yatay taşma yok; çizim, kalıp, desen editörleri açılır / kapanır; föy PDF iner |
| 14 | Makine ve Mühendislik regresyonu | 21 makine dosyası | A–S makine senaryoları + W | Önceki raporla aynı; makine kodu (app.js ve modülleri) tekstil için değiştirilmedi, yalnız index.html'e ws.js eklendi |

**Bu aşamada bulunan ve düzeltilen hatalar.**
1. **Kalıp DXF alışverişi yoktu.** Mimari planda vardı, uygulanmamıştı. `tx/woven/dxf-aama.js` (AAMA / ASTM D6673 düzeni: katmanlar, BLOCK / INSERT, birim başlığı, açıklama yazıları) eklendi.
2. **Türkçe harfli dosya adları.** Örneğin "kalıp-Gömlek-M.pdf" gibi adlarda tarayıcı adı atıp dosyayı "download" adıyla, uzantısız indiriyordu. Bu, Aşama 3'ten beri bütün tekstil indirmelerini etkiliyordu ve telefonda dosyanın açılamamasına yol açabilirdi. Bütün indirmeler tek yardımcıya bağlandı, ad ASCII'ye çevriliyor (ö → o, ş → s …). Testler artık dosya adını da denetliyor.

**Yayın öncesi tekstil riskleri.**
1. **Gerçek cihaz.** Telefon ve tablette yalnız emülasyon yapıldı. Özellikle dokunarak kalıp düzenleme, yakınlaştırma ve dökümlülük benzetiminin süresi (masaüstünde ~2 s, kalibrasyon ~25 s) gerçek cihazda denenmeli.
2. **Dış programlarla alışveriş.** DXF çıktısı Gerber / Lectra / Optitex'te; knitout çıktısı gerçek bir örgü makinesinde denenmedi.
3. **Fiziksel doğrulama.** Kalıplar temel bloklardır (prova gerekir). Dökümlülük modeli referans numuneyle kalibre edilmeden kullanılmamalıdır. Operasyon süreleri tahminidir.
4. **Beden tabloları.** Örnek tablo kaynağıyla birlikte verilir; üretimde firmanın kendi ölçü tablosu kullanılmalıdır.

## 8. CNC torna (12.11.2026)

Ortam aynı (Node 22, Chromium emülasyonu, gerçek OCCT WASM). Gerçek bir torna tezgâhında, kumanda simülatöründe ya da CAM yazılımıyla karşılaştırmalı deneme **yapılmadı**.

**Sonuçlar.**
- `tests/lathe.test.mjs`: 22 test, hepsi geçti.
- `tests/occt.test.mjs` içine 1 torna testi eklendi (gerçek WASM), geçti.
- Tarayıcı senaryosu "H-Torna" (telefon emülasyonu) geçti. Önceki raporlardaki "1 blokeli (CNC torna)" kalktı.
- Bütün uygulama: 33 dosya / 442 Node testi, 0 başarısız.

**Promptun test listesi ↔ testler** (`lathe.test.mjs` numaraları):

| Madde | Test | Ölçüt |
|---|---|---|
| X/Z koordinat hesapları | 1, 3, 4 | Sanal uç ↔ uç merkezi; yay merkezi / yönü; r(z) analitik değerle 1e-9; ofsetin her noktası profile tam rn (±0,002 mm) |
| Çap / yarıçap modu | 2, 16 | Yarıçap modunda her X tam yarı (±0,0005); iki mod geri okununca aynı yol; yarıçap modu olmayan kumandada hata |
| Dış çap tornalama | 5 | Seviyeler 23,5 / 22 / 20,5 / 20 (ap 1,5); simülasyon çapı Ø40 ±0,1; kaldırılan hacim π(25² − 20²)·30 ±%2 |
| İç çap tornalama | 6 | Ø20 boru → Ø30: iç çap ±0,1, hacim ±%3; delik yoksa açık hata |
| Alın tornalama | 7 | 2 mm fazla, 2 paso; ön yüz boş, X = −2·rn ile merkez geçilir; hacim ±%3 |
| Kanal açma | 8 | 4 mm kanal / 3 mm takım → Z −26 ve −25 dalma; dip ve duvarlar ±0,06; dar kanal ve erişim hatası |
| Delik delme | 9 | Uç derinliği 30 + 7 / tan 59°; gagalama sayısı; delik çapı ve uç konisi ±0,1 |
| Konik profil | 10 | Son paso ofset doğrusunun analitik uçlarında (1e-6), omuza girmez; simülasyon çapı doğrusal ±0,1 |
| Kaba / finiş paso | 11, 19 | Kaba seviyeler tam ap aralıklı, hiçbir kaba hareket finiş payına girmez; finiş uç merkezi konturdan tam rn; G02 R2,6 / G03 R0,4; Rt = f² / (8·rn); profil (G73 tipi) pasoları ve iniş açısına göre köprüleme |
| Takım yolu sınırları | 12, 20 | Makine X sınırı, aynadan çıkış, ayna tutma payı, punta yok uyarısı, kesmede merkezi en çok 0,2 mm geçme |
| Çarpışma kontrolleri | 13 | Ayna çenesi, bara gövdesi, hızlı harekette malzeme, kaydırılmış yolda fazla kesim alanı (≈ 30 × (1 − tol) mm²) |
| G-kodu çıktısı | 14, 15, 17 | Başlangıç / bitiş blokları, takım değişiminde G28 U0., G50 + G96 / G97, M08 / M09 eşleşmesi, yalnız izinli kodlar, ASCII; G76 iki satır (P020060 Q50 R0.05 / X22.16 Z-20.0 P920 Q250 F1.5); G32 açılımı; G41 / G42 ile kontur |
| Hatalı parametreler | 18 | 21 ayrı hatalı girdi, her biri açık hata ve takım yolu üretilmez; uyarı türleri ayrı |
| Simülasyon ↔ G-kodu tutarlılığı | 16 | Üretilen G-kodu geri okunur (G76 açılımı dahil), 4 değişkende hareket listesiyle aynı, sapma ≤ 0,001 mm; bozulmuş G-kodu fark edilir |
| Örnek parça | 21, occt 10 | Kademeli mil M24 (alın, delik, dış kaba / finiş, kanal, iç kaba / finiş, vida, kesme): hata ve uyarı yok, fazla kesim 0, kalan 0; parça hacmi analitik hacimle ±%1,5; çaplar ±0,25. OCCT: hedef hacim analitikle ±%0,2, sonuç hacmi ızgara hacmiyle ±%1, iki yönlü fark < %1 |

**Bu işte bulunan ve düzeltilen hatalar** (geliştirme sırasında, testler yakaladı):
1. Ofsette dış köşe yayının yönü tersti (G02 yerine G03 olmalı): köşelerde parçaya girme.
2. Takım biçimindeki uç yayı ters yönden çiziliyordu: simülasyonda uç yanlış tarafta.
3. Ayrık ızgarada takım konumu aşağı yuvarlanıyordu: tek yönlü 0,1 mm sapma, kalan malzeme gibi görünüyordu.
4. Profil (G73 tipi) pasolarında büyük ofset iç köşelerde kendini kesiyordu; Fanuc G73 gibi radyal kaydırmaya çevrildi.
5. Basit dış çap / konik operasyonunda uç, bitişteki omuz duvarına uç yarıçapı kadar giriyordu; omuz hedefe eklendi.
6. OCCT Boolean, hedef ve sonuç katılarının çakışık düz yüzlerinde başarısız oluyordu; sonuç uçları 0,02 mm uzatıldı, hedefteki doğrudaş noktalar atıldı (etkisi raporda yazılı).

**Kalan sınırlar ve tezgâhta ayrıca doğrulanması gerekenler.**
- Program **hiçbir tezgâhta** denenmedi. Kumanda uyumu (Fanuc 0i-T sistem A varsayıldı; sistem B / C'de G kodları farklıdır), G76 parametre biçimi, G28 referans dönüşü, takım ofsetleri ve sanal uç numarası, iş mili yönü (M03 / M04, ön / arka taret) makinede kontrol edilmeli.
- **Simülasyon ve çarpışma.** Eksenel simetrik 2B kesitte yapılır. Taret ve diğer takımlar, punta, gerçek 3B tutucu biçimi, helisel diş, talaş, titreşim, kesme kuvveti ve iş parçasının eğilmesi hesaplanmaz. Ayna yalnız girilen çap / boylarla silindir olarak denetlenir.
- **Yetenekler.** C ekseni, Y ekseni, canlı takım, punta, karşı iş mili ve inç (G20) çıktısı yok.
- **Çevrimler.** Kaba / finiş G71 / G70 çevrimi olarak değil, tek tek G01 / G02 / G03 hareketleri olarak yazılır (kumandadan bağımsız ve geri okunarak doğrulanabilir). Diş açmada yanal besleme (G76 açı) kumandaya bırakılır; G32 açılımı radyal beslemedir.
- **Modelden alma.** Döndürme krokisi ya da silindirden profil alma düğmesi var ama ne otomatik testi var ne de tarayıcıda denendi; sonucu profil tablosundan kontrol et.

## 9. Güvenlik taraması (12.11.2026)

**Kapsam.** Uygulama tamamen tarayıcıda çalışan, sunucusu olmayan statik bir sitedir (GitHub Pages). Hesap, parola, sunucu veritabanı ya da dış API anahtarı yoktur; veriler kullanıcının tarayıcısında (localStorage / IndexedDB) durur. Bu yüzden tarama şunlara odaklandı:
- dışarıdan gelen verinin sayfaya kod olarak sızması (XSS);
- içe aktarılan dosyalar ve kayıtlar;
- üçüncü taraf kod (tedarik zinciri);
- CI izinleri, gizli bilgi sızıntısı.

**Yapılanlar ve sonuçlar.**

| Konu | Yöntem | Sonuç |
|---|---|---|
| XSS (tekstil) | Her ad / not / kaynak / marka / model / renk / beden tablosu alanına `<img onerror>` ve `<svg onload>` yükü içeren proje (108 yük) içe aktarıldı. 11 sekme, kalıp, kesim planı, 3B, örgü deseni, makine çıktısı, teknik çizim editörleri açıldı. | **Tetiklenmedi.** Yükler düz metin olarak göründü, DOM'a etiket olarak girmedi. |
| XSS (makine) | Parça adları, torna iş ve takım adları, kayıtlı proje adı aynı yükle dolduruldu; 25 sekme, torna hesabı, proje penceresi açıldı. | **Tetiklenmedi.** G-kodu açıklamalarında parantez ve ASCII dışı karakterler süzülüyor. Satır kırma ile komut enjeksiyonu yok. |
| eval / new Function / document.write | Kod taraması | Uygulama kodunda yok. Tek istisna: OCCT işçisi kendi klasöründeki IGES okuyucusunu (vendor) çalıştırıyor, dış içerik değil. |
| Prototip kirletme | Tekstil alan yazıcısı (`setPath`) incelendi; beden adı `__proto__.x` ile denendi. | **AÇIK BULUNDU, DÜZELTİLDİ.** Önce `Object.prototype` kirleniyordu. Şimdi `__proto__`, `constructor`, `prototype` alan adları reddediliyor; içe aktarılan JSON'da bu anahtarlar varsa dosya reddediliyor; beden / ölçü adlarındaki nokta kodlanıyor. Test: `tx-model` "Güvenlik". |
| Üçüncü taraf kod | Uygulama three.js, three-mesh-bvh, three-bvh-csg'yi her açılışta unpkg.com'dan bütünlük kontrolü olmadan yüklüyordu. | **RİSK, DÜZELTİLDİ.** Bu kütüphanelerin npm'deki resmi paketlerinin birebir kopyaları `vendor/` içine alındı, sayfalar artık dış siteden kod yüklemiyor. Uygulama internetsiz de açılıyor. Yeni CI işi "Üçüncü taraf kütüphane bütünlüğü", her çalıştırmada kopyaları npm paketiyle bayt bayt (sha256) karşılaştırıyor. E2E testleri dış siteye tek bir istek atılırsa başarısız oluyor. |
| İçerik güvenlik politikası (CSP) | Yoktu. | **EKLENDİ** (`<meta http-equiv="Content-Security-Policy">`): yalnız aynı kaynaktan betik; satır içi betikten yalnız importmap (sha256 ile); nesne / form / base yasak; `no-referrer`. `'unsafe-eval'` tutuldu: OCCT işçisi açılamazsa sayfada çalışan yedek yol (emscripten / embind) bunu gerektiriyor. |
| Büyük / bozuk dosya | Boyut sınırı yoktu. | **EKLENDİ:** STEP / IGES 80 MB, DXF ve tekstil JSON 40 MB, fotoğraf 30 MB. Bozuk DXF / STEP / JSON için açık hata zaten vardı (önceki testler). |
| GitHub Actions | İzin tanımı yoktu (varsayılan jeton yazma yetkili olabilir). `pull_request_target` yok, gizli bilgi kullanılmıyor. | **DÜZELTİLDİ:** `permissions: contents: read`. |
| Gizli bilgi sızıntısı | Depoda anahtar / parola / jeton taraması | Yok. |
| `postMessage` | İşçi mesajları yalnız kendi işçilerinden. Eski React Native görüntüleyicisinde (`viewerHtml.js`, web sitesinde kullanılmıyor) kaynak denetimi yoktu. | Kaynak denetimi eklendi. |
| Adres satırı | Yalnız `?ws=makine` karşılaştırılıyor, sayfaya yazılmıyor. | Sorun yok. |

**Kalan riskler ve sınırlar.**
- **Başlık tabanlı politika yok.** GitHub Pages özel HTTP başlığı vermiyor: `frame-ancestors` (başka sitenin uygulamayı çerçeve içinde göstermesi) ve HSTS sayfadan ayarlanamıyor. Uygulamada oturum ya da para işlemi olmadığı için etkisi düşük.
- **Yerel veriler şifresiz.** Projeler tarayıcıda şifresiz durur. Cihaza erişen biri görebilir; tarayıcı verisi silinirse projeler gider (dışa aktarma ile yedek alınmalı).
- **`'unsafe-eval'` açık.** OCCT yedek yolu için gerekli. Uygulama kodunda eval'e giden kullanıcı verisi yok.
- **Kapsam dışı.** Fuzz testi yalnız tarayıcı emülasyonunda yapıldı; profesyonel sızma testi değildir.

## 10. Parmakla kontrol (13.11.2026)

**Ne eklendi.** Kamerayla el algılama ve dokunmadan kullanım (`hand/`). Uygulama kodu (`app.js`, kroki, 2B çizim, tekstil) değişmedi; üç sayfaya yalnız bir modül etiketi eklendi. Hareketler uygulamaya gerçek fare olayı (pointer / click / wheel) olarak verilir, çizim motoru yeniden yazılmadı.

**Kaynak inceleme (fingermouse, Python).** Paket bir Windows masaüstü aracıdır: OpenCV ile kamera, MediaPipe Tasks Hand Landmarker ile 21 nokta, PyAutoGUI ile işletim sistemi faresi. Tarayıcıda çalışan bu uygulamaya kod olarak taşınamaz (Python, OpenCV penceresi, sistem faresi). Alınan fikirler JavaScript'e yeniden yazıldı: parmak birleştirme oranının avuç genişliğine bölünmesi, giriş / çıkış eşiği (histerezis), parmak açık / kapalı ölçütü, aynı karenin iki kez işlenmemesi, el kaybolunca bırakma, konum / ölçek / dönmeden bağımsız 42 boyutlu özellik vektörü. Alınmayanlar: sistem faresi kontrolü, sağ tık, pencere kapatma (Alt+F4), klavyeyle eğitim menüsü, `gestures.json` kaydı. Buraya özgü ekler: en-boy düzeltmesi, 1€ süzgeci, sıçrama süzgeci, birleştirme anında nişan noktası, dokunma sabitleyici, bırakırken imleç kilidi, kalibrasyon, yavaş ekran kartında işlemciye geçiş.

**Durum matrisi.**

| Konu | Durum | Nasıl doğrulandı |
|---|---|---|
| Hareket motoru (imleç, birleştirme, açık avuç, iki parmak, özel hareket, kalibrasyon, sol / sağ el) | Çalışıyor | Birim test, yapay 21 noktalı el |
| Titreme / sıçrama / kopma önlemleri | Çalışıyor | Birim test (ölçülen: duran elde titreme ≥ 3 kat azalır; 1200 px/sn harekette gecikme < 60 ms) |
| Kamera açma / kapama, izin reddi, yeniden açma, kaynakların bırakılması | Çalışıyor | E2E, Chromium sahte kamera |
| 3B sahne, kroki, 2B çizim, düğmeler: parmakla kullanım | Çalışıyor | E2E, sahte kamera + yapay el (iki arayüz, telefon ölçüsü emülasyonu) |
| Mevcut özelliklerin bozulmaması | Bozulmadı | Bütün birim ve E2E testleri yeniden koşuldu |
| MediaPipe'ın depodaki kopyadan yüklenmesi ve kare işlemesi (CSP altında, dış istek yok) | Çalışıyor | E2E, sahte kamera görüntüsü (el yok) |
| **Gerçek kamera + gerçek el: 21 noktanın doğruluğu, eşiklerin uygunluğu, kullanım rahatlığı** | **SINANMADI** | Geliştirme ortamında kamera ve el görüntüsü yok |
| Gerçek cihaz hızı (kare/sn, pil, ısınma) | SINANMADI | Test ortamı yazılımsal WebGL; orada ölçülen hız gerçek cihazı göstermez |

**Platform değerlendirmesi.**

| Platform | Değerlendirme |
|---|---|
| Web — bilgisayar (Windows / macOS / Linux; Chrome, Edge) | Hedef platform. Kod yolu Chromium'da sınandı. https gerekir (GitHub Pages uygun). |
| Web — Android telefon / tablet (Chrome) | Aynı kod; ön kamera kullanılır, görüntü aynalanır. Telefon ölçüsü yalnız emülasyonda sınandı. Elde tutulan telefonda kamera sallanacağı için telefonu sabit bir yere koymak gerekir. |
| Firefox, Safari (iOS 16.4+ / macOS) | Kullanılan arabirimler (getUserMedia, WebAssembly SIMD, PointerEvent) destekleniyor; **denenmedi**. |
| Windows uygulaması | Ayrı bir Windows paketi depoda yok; Windows'ta tarayıcıdan çalışır. İleride WebView2 ile paketlenirse kamera izni isteğini onaylayan işleyici gerekir. |
| Android uygulaması | Depodaki `App.js` (Expo / WebView) eski 2. aşama sürümüdür ve bu arayüzü yüklemez. Güncel site bir WebView içinde gösterilecekse: uygulama bildiriminde `CAMERA` izni, WebView'da kamera izin isteğinin onaylanması ve https gerekir. Yerel (Kotlin) MediaPipe gerekmez; `hand/tracker.js` aynı arabirimle değiştirilebilir. |

**Güvenlik ve gizlilik.** Kamera yalnız kullanıcı düğmeye basınca istenir; ses istenmez. Kareler yalnız bellekte işlenir: kayıt, ekran görüntüsü ya da ağ isteği yoktur (E2E her senaryoda dış istek olmadığını denetler; CSP `connect-src 'self'`). Kütüphane ve model `vendor/` içinde birebir kopyadır; CI npm paketiyle ve sabit sha256 ile karşılaştırır. Kapatınca kamera izleri durdurulur, model bellekten bırakılır, işaretçi yaması geri alınır; sekme arka plana geçince işleme durur. Yapay işaretçi, tarayıcının `setPointerCapture` işlevini yalnız kendi işaretçi kimliği için ve yalnız kontrol açıkken sarar.

**Bilinen sınırlar.** Tek el. Tarayıcının kendi denetimleri (kaydırıcı, açılır liste, dosya seçici, klavye) yapay işaretçiyle çalışmaz. Sesli komut gibi "kullanıcı hareketi" isteyen tarayıcı özellikleri parmakla dokunmayla açılmayabilir. El algılama ana iş parçacığında çalışır: yavaş cihazda arayüz akıcılığı düşebilir. Özel hareket öğretme arayüzü yok (kodla eklenir).

