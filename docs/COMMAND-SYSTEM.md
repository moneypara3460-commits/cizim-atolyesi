# Advanced Command System

Çizim Atölyesi'nin masaüstü komut altyapısı ve ilk uygulama entegrasyonu.

## Bu sürümde bulunanlar
- Sabit komut kimlikleri ve Türkçe/İngilizce ad-alias kayıt sistemi.
- Tırnaklı argümanları, kaçışlı tırnakları ve ters eğik çizgileri destekleyen komut satırı ayrıştırıcısı.
- Klavye, komut paleti ve komut satırını aynı dispatcher üzerinden çalıştıran merkez.
- Kısayol çakışması denetimi ve input/textarea/select/contenteditable koruması.
- Kutu, silindir, küre ve koni oluşturma; seçili parçayı silme; geri al/yinele; ekrana sığdırma ve kaydetme adaptörleri.
- Seçili parçayı MOVE ile X/Y/Z yönlerinde taşıma ve ROTATE ile X/Y/Z eksenlerinde döndürme.
- HOLE ile seçili standart parçanın merkezinden yerel Y ekseninde boydan boya silindirik delik açma.
- EXTRUDE komutuyla mevcut 2B çizim/ekstrüzyon editörünü açma.
- CHAMFER ve FILLET komutlarıyla Kenar sekmesinde önceden seçilmiş kenarlara pah/yuvarlatma uygulama.
- Komut paletinde EN/TR dil düğmesi; komut adları ve açıklamaları iki dilde, komut takma adları ortak dispatcher üzerinden çalışır.
- Ctrl+K ile açılan, arama yapılabilen komut paleti. Komut satırı örneği: `BOX 100 50 30`.
- Kısayollar yalnızca 3B çalışma alanı odaktayken etkinleşir.

## İlk kısayollar

| Kısayol | Komut |
|---|---|
| B | Kutu oluştur |
| C | Silindir oluştur |
| S | Küre oluştur |
| K | Koni oluştur |
| Delete | Seçili parçayı sil |
| Ctrl+Z | Geri al |
| Ctrl+Y / Ctrl+Shift+Z | Yinele |
| F | Modeli ekrana sığdır |
| Ctrl+S | Projeyi kaydet |
| Ctrl+K | Komut paletini aç |

## Yeni komut örnekleri

- `MOVE 10 0 0` (seçili parçayı X yönünde 10 mm taşı)
- `ROTATE Z 90` (seçili parçayı Z ekseninde 90° döndür)
- `HOLE 10` (seçili parçaya Ø10 boydan boya delik aç)
- `EXTRUDE` (2B çizim editörünü aç)
- `CHAMFER 2` / `FILLET 2` (önce Kenar sekmesinde kenar seç)

## Komut örnekleri

- `KUTU` veya `BOX`
- `BOX 100 50 30`
- `SILINDIR`
- `SPHERE`
- `CONE`
- `UNDO`
- `REDO`
- `FIT`
- `SAVE`

## Entegrasyon sınırı ve güvenlik
Komutlar mevcut CAD işlevlerine adaptörlerle bağlanır; model geçmişi ikinci kez oluşturulmaz. Komut çekirdeği rastgele kod çalıştırmaz. Kısayol dinleyicisi form alanlarında yazılan karakterleri komut olarak yorumlamaz. MOVE/ROTATE seçili parçayı ve alt parçalarını birlikte taşır/döndürür. HOLE yalnızca box/cylinder/cone/sphere/tube türlerinde merkezden, yerel Y ekseninde boydan boya delik açar; serbest konumlu/yüz seçmeli delik sihirbazının yerini almaz. EXTRUDE mevcut 2B editörü açar; çizim tamamlanınca editörün mevcut akışı 3B parçayı üretir. CHAMFER/FILLET için önce Kenar sekmesinde kenarlar seçilmelidir. Komut paletindeki EN/TR düğmesi yalnızca komut paleti arayüz dilini değiştirir; uygulamanın tüm panellerini çevirdiği anlamına gelmez.

## Kurallar (22.11.2026 inceleme düzeltmeleri)
- **Ondalık virgül:** `TAŞI 2,5 0 0` = `MOVE 2.5 0 0`. Binlik ayırıcı kabul edilmez (`1.000,5` geçersiz).
- **Çok kelimeli adlar:** `DELİK AÇ 10`, `KUTU OLUŞTUR`, `CREATE BOX 100` çalışır (ilk 3 kelimeye kadar en uzun ad önce denenir).
- **Mac:** Cmd tuşu Ctrl gibi çalışır (Cmd+Z, Cmd+S, Cmd+K).
- **Basılı tutma:** Ctrl+Z / Ctrl+Y tekrarlar; B / C / S / K / Delete / Ctrl+S basılı tutulunca bir kez çalışır.
- **ƒx bağlı konum:** Parçanın ya da onunla gelen alt parçaların konumu / açısı değişkene bağlıysa MOVE ve ROTATE değiştirmez, uyarır.
- **HOLE sınırı:** Çap parçanın en dar kesitinden küçük olmalı (kutu: min(genişlik, derinlik); silindir / küre: çap; koni: iki çapın küçüğü, sivri koni olmaz; boru: iç çaptan büyük, dış çaptan küçük). Oyuk (çıkarma) parçasına delik açılmaz.
- **Yeni arayüz:** Ctrl+K kabuğun arama paletini açar (ikinci palet açılmaz). Palette komut satırı yazılırsa (`MOVE 0 0 3`, `DELİK 8`) en üstte "Komut" etiketiyle çıkar, Enter çalıştırır; parametre hatası satırın altında yazılır. Eski arayüzde (klasik.html) uygulamanın kendi paleti açılır.

## Test
- Birim: `node --test tests/command-system.test.mjs`
- Uçtan uca (iki arayüzde): `node tests/e2e/run.mjs L-Komut` · `E2E_UI=yeni node tests/e2e/run.mjs L-Komut`
