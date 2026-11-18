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
| 4 | Elektrik: şema, kablo listesi, klemens planı, güç ve sigorta hesabı | |
| 5 | Kontrol: PLC giriş / çıkış listesi, adım (sıralama) tasarımı, IEC 61131-3 iskeleti (PLCopen XML) | |
| 6 | Güvenlik: ISO 12100 risk değerlendirmesi, ISO 13849-1 PLr / PL (doğrulanmış tablolarla), IEC 60204-1 kontrol listesi | |
| 7 | Benzetim: hareket etüdü ve çevrim süresi; motorun mekanizmayı sürdüğünün kontrolü | |
| 8 | Gereksinim izlenebilirliği, revizyon / onay geçmişi, STEP AP242 çıktısı | |

3. aşama kaynakları: mil sehim / eğim formülleri — Roark's Formulas for Stress and Strain (basit mesnetli ve konsol kiriş, tekil yük); von Mises ve yatak eğimi önerileri — Shigley, Mechanical Engineering Design, Tablo 7-2 (derin oluklu bilyalı rulman için ~0,001 rad değeri öneri olarak verilir, kesin sınır rulman kataloğundandır). Redüktör servis katsayısı ve kayış izin verilen kuvveti kullanıcı tarafından üretici kataloğundan girilir; uygulama uydurma katalog değeri kullanmaz.

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
