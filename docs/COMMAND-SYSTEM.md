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

## Test
`node --test tests/command-system.test.mjs`
