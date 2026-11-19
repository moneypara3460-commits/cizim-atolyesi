# Makine CAD: SolidWorks'e göre eksikler

Sıra kolaydan zora. Her madde ayrı PR; tam test (birim, gerçek OCCT, iki arayüzde uçtan uca) ve CI'dan geçer.

| # | Madde | Durum |
|---|---|---|
| 6 | Her şekle radyüs / pah (tek tek kenar) | **Tamam** (19.11.2026) |
| 2 | Delik sihirbazı / diş (işaretli diş) | **Tamam** (19.11.2026) |
| 3 | Teknik resim: tolerans, pürüzlülük, parça listesi | Bekliyor |
| 1 | Standart parça kütüphanesi (doğrulanmış ölçü tablolarıyla) | Bekliyor |
| 8 | Sac metal: flanş, köşe kapatma | Bekliyor |
| 4 | Kroki kısıtları ve serbest eğri | Bekliyor |
| 5 | Parametrik geçmiş ve varyantlar | Bekliyor |
| 7 | DWG | Lisans kararı bekliyor (ODA ücretli, LibreDWG GPL) |

## 6. Her şekle radyüs / pah

**Kenar** sekmesi. Eskiden yalnız düz kutunun kenarında çalışıyordu ve yuvarlama kesici parçalarla yaklaşık yapılıyordu
(iki kenarın buluştuğu köşe yumuşak olmuyordu). Şimdi:

- Dokunulan parça ve ona değen parçalar (birleşen ya da oyan, kutuları kesişenler) Open CASCADE ile gerçek katı olarak kurulur.
  Grubun gerçek kenarları mavi gösterilir (arkada kalanlar soluk). Deliğin ağzı gibi oyukla oluşan kenarlar da seçilebilir.
- Üçgen ağından gelen parçalarda (kroki çekme, konstrüksiyon, sac, içe aktarılan ağ) aynı düzlemdeki yüzler ve aynı doğrudaki
  kenarlar birleştirilir (`ShapeUpgrade_UnifySameDomain`): düz yüzün üçgen köşegenleri kenar sayılmaz.
- Silindirin, deliğin, kürenin dikiş kenarı (yüzün kapanma çizgisi) gösterilmez; seçilmesi anlamsızdır.
- Birden çok kenar seçilir (aynı kenara tekrar dokununca kalkar). Seçilen kenarlar tek ölçüyle gerçek yuvarlama
  (`BRepFilletAPI_MakeFillet`) ya da 45° pah (`BRepFilletAPI_MakeChamfer`) alır; sonuç geçerlilik denetiminden geçer.
- Sonuç, grubun parçalarının yerine tek parça olur (B-Rep verisiyle saklanır, STEP'e tam yazılır). Geri al ile döner.
- Seçim, kenarın orta noktası ve türüyle saklanır; işlem anında model yeniden kurulup kenar yeniden bulunur. Model bu arada
  değiştiyse işlem yapılmaz, "kenarları yeniden seç" denir.
- Ölçü büyükse anlaşılır hata: "ölçü kenara ya da komşu yüzlere göre büyük olabilir" (en kısa seçili kenarla birlikte).

**Sınır:** eğri yüzü üçgen ağdan gelen parçalarda (süpürme, loft, dönel kroki) eğri kenar küçük doğru parçalarına bölünmüştür;
bu kenarlarda yuvarlama yapılamayabilir. B-Rep sekmesindeki toplu kenar seçenekleri (tüm / üst / alt / dikey / dairesel) duruyor.

**Doğrulama** (`tests/occt-kenar.test.mjs`, gerçek OCCT): kutu kenarı yuvarlama V − (1 − π/4)·r²·L; iki kenar pah c²/2·L;
delik ağzı pahı (Pappus); silindir üst kenar yuvarlama (Pappus); dikiş kenarlarının ayıklanması; üçgen ağından L profilde
iç köşe dolgusu; büyük ölçü / değişmiş model / sıfır ölçü hataları; döndürülmüş, taşınmış parça. Uçtan uca (`C-Kenar`, iki
arayüzde): ekranda kenara dokunma → yuvarlama → B-Rep hacmi 191,571 cm³ → Geri al → silindir dairesel kenar pahı → 58,599 cm³.

## 2. Delik sihirbazı / diş

**Yüz** sekmesi → yüze dokun → **🔩 Delik sihirbazı**. Kod: `delik.js` (tablolar ve kesit, saf hesap), `app.js` (`faceHoleWizard`).

- Türler: **düz geçiş** (ISO 273 ince / orta / kaba seri), **kılavuz** (kaba ya da ince adım; matkap çapında delik, diş
  bilgisi deliğe yazılır), **kademeli** (ISO 4762 alyan başı: kademe çapı ve baş yüksekliği kadar derinlik, değiştirilebilir),
  **havşa** 90° (ISO 15065: yıldız / düz havşa başlı vidalar, M1,6–M10; ISO 10642: alyan havşa başlı, M3–M20).
- Derinlik: kör (118° matkap ucuyla ya da uçsuz) veya boydan boya. Kör kılavuzda varsayılan diş boyu derinlik − 3 adım
  (kılavuz ucunun pahı; elle değiştirilebilir, derinliği aşamaz).
- Desen (tek / ızgara / daire) basit delikteki gibi çalışır.
- **Diş helis olarak modellenmez** (SolidWorks'teki işaretli delik gibi): model matkap çapındadır, diş yazısı
  (ör. `M8-6H ↧ 16,25`) deliğin bilgisinde durur ve Ölçü sekmesinde görünür; teknik resimde gösterilmesi madde 3'te.
- Kesiciler gerçek B-Rep temel katılardır (silindir, koni): hacim ve kenarlar kesin. Kademe / havşa / uç parçaları ana
  deliğe bağlı yardımcı parçadır: delikle birlikte taşınır, delik silinince onlar da silinir.

**Tablo kaynakları** (her değer en az iki kaynakla karşılaştırıldı; ayrıntı `delik.js` başında): ISO 261/262 diş adımı;
kılavuz matkabı (HP Academy, Five Flute, TR Fastenings, Fractory); ISO 273 (IS 1821 = ISO 273, Albany County Fasteners,
TR Fastenings); ISO 15065 Tablo 1 (resmî örnek sayfa); ISO 10642 baş çapı (Böllhoff, AIMS, ASME B18.3.5M); kademe çapı
ASME B18.3.1M (Machinery's Handbook 31. baskı Tablo 5, AmesWeb). DIN 974-1 kademe tablosu ücretli olduğu için doğrulanamadı,
kullanılmadı.

**Doğrulama:** `tests/delik.test.mjs` (tablo tutarlılığı, kaynak örnek değerleri, ISO 15065 t sütunuyla derinlik uyumu,
kesit hacmi), `tests/occt-delik.test.mjs` (gerçek OCCT: 7 delik türü/ölçüsünde geçerli katı ve kesin hacim, ağız çapları,
desen), uçtan uca `C-Delik` (iki arayüzde: M8 kılavuz → B-Rep hacmi 191,25 cm³, delikle taşınan uç, yardımcılarıyla silme,
M6 kademeli boydan boya → 190,24 cm³).
