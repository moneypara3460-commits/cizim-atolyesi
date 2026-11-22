# Klavye kısayolları ve komutlar

Uygulamanın bütün klavye kısayolları ve yazılı komutları. Kullanıcıya gösterilen liste uygulamada `?` tuşuyla açılır.
3B komut sisteminin iç yapısı: [COMMAND-SYSTEM.md](COMMAND-SYSTEM.md).

## 1. 2B çizim (AutoCAD tarzı)

2B çizim ekranı açıkken klavye bu ekranındır. 3B kısayolları (B, C, Delete…) o sırada çalışmaz.

**Komut satırı:** Harf ya da rakam yazınca çizim alanının altında komut satırı açılır. **Enter** ya da **Boşluk** çalıştırır.
**Boş Enter**, süren komutu bitirir; komut yoksa son komutu tekrarlar. **Esc** önce yazılanı, sonra komutu ve seçimi iptal eder.
Bir yazı alanındayken (X, Y, uzunluk…) yazılanlar komut sayılmaz.

| Komut | Türkçe | İş |
|---|---|---|
| L | ÇİZGİ | Çizgi (zincir) |
| C | DAİRE | Daire |
| A | YAY | Üç noktalı yay |
| REC | DİKDÖRTGEN | Dikdörtgen |
| DIM, DLI | ÖLÇÜ | Doğrusal ölçü |
| DRA, DDI | ÇAP, YARIÇAP | Çap / yarıçap ölçüsü |
| DAN | AÇI | Açı ölçüsü |
| H | TARAMA | Tarama |
| T, DT, MT | YAZI | Yazı |
| SEL | SEÇ | Seç |
| TR | KIRP | Kırp |
| EX | UZAT | Uzat |
| O | OFSET | Ofset |
| F | RADYUS | Köşe radyusu |
| M | TAŞI | Taşı |
| CO, CP | KOPYALA | Kopyala |
| RO | DÖNDÜR | Döndür |
| MI | AYNA | Ayna |
| AR | DİZİ | Dizi |
| SC | ÖLÇEKLE | Ölçekle |
| OV | ÖLÇÜ VER | Ölçü ver (esnet) |
| E | SİL | Sil |
| U | GERİ AL | Geri al |
| REDO | YİNELE | İleri al |
| Z, ZE | SIĞDIR | Ekrana sığdır |
| OS | YAKALA | Uç nokta yakalama aç / kapat |
| ORTHO | DİK | Dik çizim aç / kapat |
| ALL | TÜMÜ | Tümünü seç |
| 3B, 3D | EKSTRÜZYON | Kapalı şekilleri 3B parça yap |
| DXF | KAYDET | DXF kaydet |
| OPEN | AÇ | DXF aç |
| CLOSE | KAPAT | 2B ekranı kapat |

**Nokta ve değer girişi** (komut bir nokta ya da sayı beklerken):

| Yazım | Anlamı | Örnek |
|---|---|---|
| `X,Y` | Mutlak nokta | `0,0` · `100,50` |
| `@dX,dY` | Son noktaya göre | `@100,50` (dikdörtgende genişlik × yükseklik) |
| `L<açı` · `@L<açı` | Son noktadan L uzunluğunda, açı derece (saat yönü tersi +) | `@30<90` |
| `L` (tek sayı) | Çizgi / taşı / kopyala: imleç yönünde L mm (doğrudan mesafe; imleç yoksa açı alanındaki yön) | `40` |
| sayı | Daire: çap · Ofset: mesafe · Radyus: yarıçap · Döndür: açı · Ölçekle: gerçek ölçü ya da katsayı · Ölçü ver: ölçü · Yazı: yükseklik · Tarama: açı | `20` |
| `R5` | Daire yarıçapı | `R5` |
| `Ø12`, `D12` | Çap | `Ø12` |
| `X;Y` | Türkçe ondalıkla nokta (noktalı virgül ayırıcı) | `10;2,5` |

`2,5` yazımı: nokta beklenen adımda (2, 5) noktası, sayı beklenen adımda (daire çapı, ofset, açı…) 2,5 sayısıdır.

**Tuşlar:**

| Tuş | İş |
|---|---|
| Enter, Boşluk | Komut satırını çalıştır · boşsa bitir / son komutu tekrarla |
| Esc | Yazılanı, sonra komutu ve seçimi iptal et |
| Backspace | Komut satırından bir karakter sil |
| Delete | Seçilenleri sil |
| Ctrl+Z · Ctrl+Y, Ctrl+Shift+Z | Geri al · ileri al |
| Ctrl+A | Tümünü seç |
| Ctrl+S | DXF kaydet |
| F3 | Uç nokta yakalama aç / kapat |
| F8 | Dik çizim (ortho) aç / kapat |
| ? | Komut listesini göster |
| Fare tekerleği | Yakınlaştır / uzaklaştır |

Mac'te Ctrl yerine Cmd de çalışır. Masaüstünde fare gezinirken çizilecek çizgi önizlenir; doğrudan mesafe girişi bu imleç yönünü kullanır.
