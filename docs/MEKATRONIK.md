# Mekatronik Mühendisliği bölümü

Makine bölümünün içinde (yeni arayüzde alttaki **Mekatronik** düğmesi, klasik arayüzde **⚡ Mekatronik** sekmesi).
Amaç: çizilen mekanik sistemi motoru, aktarma organları, pnömatiği, elektriği ve kontrolüyle birlikte doğru seçmek ve
her kararı izlenebilir bir hesap raporuyla belgelemek. Hedef kullanıcı: makine imalatı ve savunma sanayi dahil ileri
mühendislik ekipleri.

## İlkeler (bütün aşamalar)

1. **Kara kutu yok.** Her sonuç adım adım: ad, formül, değer, birim, kaynak. Hesap raporu (PDF) bu kayıtlardan üretilir.
2. **Uydurma veri yok.** Üretici değerleri (motor, rulman, vida) kullanıcı katalogdan girer. Örnek değerler "temsilî" diye işaretlidir.
   Yalnız standartta tanımlı olan değerler (ISO 281 a1, ISO 15552 / 6432 çap serileri, THK katsayıları) uygulamada gömülüdür.
3. **Doğrulanmadan birleşmez.** Her formül, elle hesaplanmış bağımsız örnekle birim testinde sınanır (`tests/meka.test.mjs`).
4. **Sınırlar açık yazılır.** Hesabın kapsamadığı her şey raporda "bilgi" satırı olarak yer alır.
5. **İnternetsiz çalışır, veri cihazdan çıkmaz.**
6. Bu bölüm **ön tasarım ve hesap aracıdır**; sertifikalı bir araç değildir. Kalite sertifikaları (ör. AQAP 2110) şirket ve
   süreç düzeyinde alınır. Seçimler üreticinin güncel kataloğu ve yetkili mühendis onayıyla kesinleşir.

## Aşamalar

| Aşama | İçerik | Durum |
|---|---|---|
| 1 | Hesap ve seçim motoru: bilyalı vida tahrikli eksen (motor + vida), rulman ömrü (ISO 281), pnömatik silindir (ISO 15552 / 6432); PDF hesap raporu | **Tamam** |
| 2 | Ürün ağacı (10 bileşen türü, katalog alanları, zorunlu alan denetimi), model parçasına bağlama, hesaplara bağlama (katalog değeri hesaba geçer, kaynağı raporda), redüktör / kaplin tork ve rulman sınır devri + ISO 76 statik güvenlik kontrolleri, parça listesi (CSV / PDF), cihazda bileşen kütüphanesi; veriler projeyle kaydedilir | **Tamam** |
| 3 | Triger kayışlı ve kremayer–pinyon eksenleri (eğim, dış kuvvet, kayış / diş kuvveti sınırı), döner indeksleme tablası (üçgen / yamuk profil), redüktör seçimi (oran, servis katsayısı fs, tepe tork, giriş devri), mil eğilmesi (iki yatak arası / konsol: sehim, yatak eğimi, von Mises statik güvenlik); hepsi ürün ağacına bağlanır | **Tamam** |
| 4 | Elektrik: yük listesi (3 faz / 1 faz / 24 V DC, ürün ağacından sürücü, valf, sensör, motor freni), devre akımı, devre kesici seçimi (Ib ≤ In ≤ Iz), kablo kesiti (IEC 60204-1 Tablo 6 + Ek D sıcaklık ve gruplama katsayıları), gerilim düşümü (%5), TN sisteminde otomatik kesme (Zs·Ia ≤ U0), 24 V güç kaynağı, faz dağılımı ve ana besleme, tek hat şeması, kablo listesi ve klemens planı (CSV), PDF rapor | **Tamam** |
| 5 | Kontrol: PLC G/Ç listesi (ürün ağacından sensör, valf, sürücü, motor freni; IEC 61131-3 ad ve adres denetimi, otomatik %IX / %QX / %IW / %QW adresleme, kart ve yedek kanal hesabı), adım tasarımı (GRAFCET benzeri: adım, N eylemi, geçiş koşulu dili, adım süresi, sonraki adım), denetimler (bilinmeyen sinyal, analog koşul, çıkış kilitleri, ulaşılamayan adım, başa dönmeyen sıra, kullanılmayan G/Ç), IEC 61131-3 ST kodu ve PLCopen TC6 XML v2.01, adım şeması, G/Ç listesi (CSV), PDF rapor | **Tamam** |
| 6 | Güvenlik: ISO 12100 risk kaydı (tehlike türü, yaşam döngüsü evresi, üç adımlı risk azaltma), ISO 13849-1 Ek A risk grafiğiyle PLr (2023: gerekçeli olasılık indirimi, F seçimi yardımcısı), güvenlik işlevi doğrulaması (alt sistemlerin üretici PL / PFHD verisi; PFHD toplamı ve en düşük alt sistem PL sınırı; tutarsız veri denetimi), Ek C MTTFD / T10D yardımcı hesabı, IEC 60204-1 (2016) kontrol listesi, risk kaydı CSV, PDF rapor | **Tamam** |
| 7 | Benzetim: tahrikler (elektrikli eksen — 1. / 3. aşama kartlarından tek dokunuşla, pnömatik silindir, sabit süreli işlem), sıralı / eşzamanlı hareketler, yamuk / üçgen hız profili, zaman çizelgesi ve hız grafikleri, çevrim süresi ve saatlik / vardiyalık üretim, tüm çevrim boyunca motor RMS / tepe tork, devir ve atalet oranı denetimi, aynı motorda çakışan hareket ve "birlikte olamaz" kilitleri, çevrimde an kaydırıcısı, zaman serisi CSV, PDF rapor | **Tamam** |
| 8 | Gereksinim izlenebilirliği, revizyon / onay geçmişi, STEP AP242 çıktısı | |

3. aşama kaynakları: mil sehim / eğim formülleri — Roark's Formulas for Stress and Strain (basit mesnetli ve konsol kiriş, tekil yük); von Mises ve yatak eğimi önerileri — Shigley, Mechanical Engineering Design, Tablo 7-2 (derin oluklu bilyalı rulman için ~0,001 rad değeri öneri olarak verilir, kesin sınır rulman kataloğundandır). Redüktör servis katsayısı ve kayış izin verilen kuvveti kullanıcı tarafından üretici kataloğundan girilir; uygulama uydurma katalog değeri kullanmaz.

4. aşama kaynakları: IEC 60204-1 Tablo 6 (PVC bakır, 40 °C, B1 / B2 / C / E; 0,75–50 mm²), Ek D sıcaklık ve gruplama katsayıları, 12.5 (%5 gerilim düşümü), Tablo 5 (en küçük kesit) — tablo değerleri ABB "Kabel- und Leitungsdimensionierung" (2CDC400027D0104, DIN EN 60204-1 tablosu) ve Kollmorgen akım taşıma tablosuyla karşılaştırıldı; IEC 60364-4-43 (Ib ≤ In ≤ Iz, I2 ≤ 1,45·Iz), IEC 60364-4-41 (Zs·Ia ≤ U0), IEC 60364-5-54 (koruma iletkeni kesiti), IEC 60898-1 (B 5·In, C 10·In, D 20·In ani açma üst sınırı), IEC 60228 (bakır özdirenci). Tablo dışı durumlarda (60 °C üstü ortam, 14'ten fazla devre, 50 mm² üstü kesit, 63 A üstü devre) uygulama tahmin yapmaz, kullanıcıdan üretici değeri ister. Kapsam dışı: motor yol alma akımı, RCD seçimi, kısa devre kesme kapasitesi, EMC.

5. aşama kaynakları: IEC 61131-3 (tanımlayıcı kuralları, ayrılmış sözcükler, doğrudan adresleme, PROGRAM / CONFIGURATION / RESOURCE / TASK, TON, CASE), IEC 60848 (GRAFCET), PLCopen TC6 XML v2.01 — üretilen XML resmî şemayla (tc6_xml_v201.xsd) xmllint ile doğrulandı. Acil durdurma ve koruyucu kilitleme bu programa bırakılmaz (güvenlik rölesi / güvenlik PLC'si, 6. aşama); üretilen kod iskelettir, devreye almadan önce yetkili otomasyon mühendisince denetlenip sınanır.

6. aşama kaynakları ve sınırlar: ISO 12100 (tehlike türleri, üç adımlı yöntem), ISO 13849-1 (Ek A risk grafiği; Tablo 2 PL – PFHD aralıkları; 2023 6.2.2 seri alt sistemlerde PFHD toplamı ve en düşük alt sistem PL'si sınırı; Ek C MTTFD formülleri; F2 ölçütü 15 dakika / 1/20), IEC 60204-1:2016 madde başlıkları. Değerler Pilz, IFA / DGUV, Festo, Keyence, Omron ve üretici sertifikası örnekleriyle karşılaştırıldı. Bileşen MTTFD / DCavg / kategori verisinden PL hesabı (Ek K tablosu) doğrulanmış tam tablo elde edilemediği için uygulanmadı: alt sistem PL / PFHD değeri üreticiden girilir, bileşen düzeyi hesap için IFA SISTEMA önerilir. Örnek projede cihaz PL / PFHD değerleri bilerek boş bırakılır (uydurma veri yok). Araç, yetkin kişilerce yapılan risk değerlendirmesi ve ISO 13849 doğrulama / geçerli kılmanın yerine geçmez.

7. aşama yöntemi: ω = 2π·n/60, n = v·k·60, α = ω/ta; hızlanma ve yavaşlamada |T| = J·α + |T_yük| (güvenli taraf), sabit hızda |T_yük|, beklemede |T_tutma|; T_rms = √(Σ T²·Δt / t_çevrim). Sürtünmenin yöne göre değişimi, esneklik, titreşim, sürücü akım döngüsü ve ısınma modellenmez; motor ve sürücü üreticinin boyutlandırma yazılımıyla kesinleştirilir.

Test projesi: paketleme makinesi — vidalı mil tahrikli dolum ünitesi + pnömatik itici (örnek değerler).

## 1. aşama kaynakları

- Newton mekaniği, dönen kütle eylemsizliği (genel mühendislik bilgisi)
- Bilyalı vida kritik devir `n_k = λ·dr/L²·10⁷` ve burkulma `P_k = η·dr⁴/L²·10⁴` — THK genel katalog formülleri
  (λ: 3,4 / 9,7 / 15,1 / 21,9; η: 1,3 / 5,1 / 10,2 / 20,3). İzin: kritik devrin %80'i, burkulmanın %50'si.
- ISO 281:2007 — `L10 = (C/P)^p`, p = 3 (bilyalı), 10/3 (makaralı); a1 = 1 / 0,64 / 0,55 / 0,47 / 0,37 / 0,25 (%90–99)
- ISO 15552 (Ø32–125) ve ISO 6432 (Ø8–25) iç çap / mil çapı serileri

## Bilinen sınırlar (1. aşama)

- Rulmanda değiştirilmiş ömür (aISO: yağlama, kirlilik), statik yük (C0) ve X / Y katsayıları kullanıcıdan gelir.
- Pnömatikte conta sürtünmesi ve basınç düşümü üretici verisiyle düşülmelidir; mil burkulması üretici tablosundan.
- Vidada geri sürülme verimi ayrı alınmaz (yavaşlamada aynı verim kullanılır; enerji geri beslemesi uyarı olarak çıkar).
- (2. aşamada giderildi) Girdiler artık projeyle kaydedilir.

## 2. aşama

- **Ürün ağacı**: motor, redüktör / kayış, bilyalı vida, kaplin, rulman, pnömatik silindir, valf, sensör, sürücü, diğer.
  Her bileşen: ad, ürün kodu, üretici, adet, bağlı model parçası, katalog değerleri (zorunlular `*`), not.
- **Hesaplara bağlama**: eksen hesabında motor / vida / redüktör / kaplin, rulman hesabında rulman, pnömatikte silindir seçilir.
  Katalog değeri hesaba geçer (alan 🔗 ile kilitlenir), raporda "KATALOGDAN GELEN DEĞERLER" altında kaynağıyla yazılır.
  Eksik zorunlu alan uyarı verir; o alan için hesapta girilen değer kullanılır.
- **Ek kontroller**: redüktör çıkış torku `T·i·η` ≤ izin verilen; kaplin anma torku; rulman sınır devri;
  statik güvenlik `s0 = C0 / P0`, `P0 = max(Fr, 0,6·Fr + 0,5·Fa)` (ISO 76, bilyalı radyal rulman).
- **Parça listesi**: türe göre, model parçası ve hesap durumuyla; CSV (Excel, `;`) ve bütün hesaplarla PDF.
- **Kütüphane**: kullanıcının girdiği bileşenler bu cihazda; aynı ürün kodu güncellenir.
- Veri projeyle kaydedilir (proje kaydı ve otomatik kayıt); Mekatronik verisi olmayan eski projeler boş ağaçla açılır.
