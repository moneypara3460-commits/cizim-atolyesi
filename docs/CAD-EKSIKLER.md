# Makine CAD: SolidWorks'e göre eksikler

Sıra kolaydan zora. Her madde ayrı PR; tam test (birim, gerçek OCCT, iki arayüzde uçtan uca) ve CI'dan geçer.

| # | Madde | Durum |
|---|---|---|
| 6 | Her şekle radyüs / pah (tek tek kenar) | **Tamam** (19.11.2026) |
| 2 | Delik sihirbazı / diş | Bekliyor |
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
