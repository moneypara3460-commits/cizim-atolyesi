# Kalite raporu — Çizim Atölyesi (sürüm 20261111e)

Tarih: 11.11.2026 · Ortam: Linux sunucu, Node 22, Chromium (Playwright) + yazılımsal WebGL (SwiftShader).
Test komutları ve kurallar: [TESTLER.md](../TESTLER.md). Bu rapor uygulamanın hatasız olduğunu iddia etmez. Yalnızca neyin, hangi ortamda, hangi toleransla sınandığını gösterir.

## 1. Özet

Durumlar ayrı sayılmıştır, birbirine karıştırılmaz:

| Katman | Geçti | Başarısız | Atlandı | Blokeli | Çalıştırılamadı |
|---|---|---|---|---|---|
| Node birim / entegrasyon (21 dosya) | 316 | 0 | 0 | 0 | 0 |
| — bunun içinde gerçek OCCT WASM | 15 | 0 | 0 | 0 | 0 |
| Tarayıcı uçtan uca (Chromium, emülasyon) | 17 | 0 | 0 | 1 (CNC torna) | 0 |
| GitHub Actions CI | — | — | — | — | Bu oturumda GitHub'da çalıştırılmadı. İlk push'ta çalışacak, sonucu Actions sekmesinde. |
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
| CAM | CNC torna | Uygulanmadı | Kodda torna takım yolu / postu yok | E H: blokeli |
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
2. **CI ilk kez GitHub'da çalışacak.** E2E işi npm paketlerini (three-mesh-bvh 0.6.0 derlemesi) kullanır. Yerelde git kopyasıyla denendi, npm paketiyle denenmedi. İlk çalıştırmanın sonucu kontrol edilmeli.
3. **4/5 eksen G-kodu** hiçbir tezgâhta denenmedi. Kumanda simülasyonu ve tek blokla doğrulanmadan üretimde kullanılmamalı.
4. **CNC torna** uygulanmadı.
5. Analiz sonuçları doğrusal-elastik ve küp ağ ile hesaplanır. Mühendislik onayının yerine geçmez; uygulamada da yazıyor.
