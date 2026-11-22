# Advanced Command System

Çizim Atölyesi'nin masaüstü komut altyapısı ve ilk uygulama entegrasyonu.

## Bu sürümde bulunanlar
- Sabit komut kimlikleri ve Türkçe/İngilizce ad-alias kayıt sistemi.
- Tırnaklı argümanları, kaçışlı tırnakları ve ters eğik çizgileri destekleyen komut satırı ayrıştırıcısı.
- Klavye, komut paleti ve komut satırını aynı dispatcher üzerinden çalıştıran merkez.
- Kısayol çakışması denetimi ve input/textarea/select/contenteditable koruması.
- Kutu, silindir, küre ve koni oluşturma; seçili parçayı silme; geri al/yinele; ekrana sığdırma ve kaydetme adaptörleri.
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
Komutlar mevcut CAD işlevlerine adaptörlerle bağlanır; model geçmişi ikinci kez oluşturulmaz. Komut çekirdeği rastgele kod çalıştırmaz. Kısayol dinleyicisi form alanlarında yazılan karakterleri komut olarak yorumlamaz. Henüz taşımak, döndürmek, delik açmak, ekstrüzyon ve pah/yuvarlatma komutları bu sürüme bağlanmamıştır; gerçek UI giriş noktaları doğrulanmadan eklenmeyecektir.

## Test
`node --test tests/command-system.test.mjs`
