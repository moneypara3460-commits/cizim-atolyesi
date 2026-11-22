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

## 2. 3B (Makine bölümü)

Tuşlar çizim alanı seçiliyken çalışır (önce 3B alana bir kez dokun / tıkla). Yazılı komutlar Ctrl+K paletine yazılır.

| Tuş | İş |
|---|---|
| B · C · S · K | Kutu · silindir · küre · koni ekle |
| Delete | Seçili parçayı sil |
| Ctrl+D | Seçili parçayı çoğalt |
| H | Seçili parçayı gizle / göster |
| M | Ölçüm aracı aç / kapat |
| 1 · 2 · 3 · 4 | Önden · üstten · yandan · izometrik bak |
| F | Modeli ekrana sığdır |
| PageDown · PageUp | Sonraki · önceki sekme |
| Esc | Ölçümü kapat, sonra seçimi bırak |
| Ctrl+Z · Ctrl+Y | Geri al · ileri al |
| Ctrl+S | Projeyi kaydet |
| Ctrl+K | Komut paleti |

| Komut (Türkçe / İngilizce) | İş | Örnek |
|---|---|---|
| KUTU / BOX [G D Y] | Kutu | `KUTU 100 50 30` |
| SİLİNDİR, KÜRE, KONİ, BORU, DİŞLİ | Parça ekle | `BORU` |
| KROKİ / SKETCH | Yeni kroki | `KROKİ` |
| SÜPÜRME / SWEEP · LOFT | Süpürme · loft parçası | `LOFT` |
| SAC / SHEET · KONSTRÜKSİYON / FRAME | Sac metal · profil iskelet | `SAC` |
| 2B / 2D, EKSTRÜZYON / EXTRUDE | 2B çizim ekranı | `2B` |
| TAŞI / MOVE X Y Z | Taşı (mm) | `TAŞI 10 0 -5` |
| DÖNDÜR / ROTATE eksen açı | Döndür | `DÖNDÜR Z 90` |
| DELİK / HOLE çap | Ortadan boydan boya delik | `DELİK 10` |
| KARE DELİK / POCKET | Kare oyuk parça | `KARE DELİK` |
| PAH / CHAMFER [ölçü] · YUVARLAT / FILLET [R] | Seçili kenarlara | `PAH 2` |
| KABUK / SHELL [et] | İçini boşalt | `KABUK 2` |
| ÇOĞALT / DUPLICATE | Kopya | `ÇOĞALT` |
| AYNA / MIRROR X\|Z | Ayna kopya | `AYNA X` |
| DİZİ / ARRAY n dX dY dZ | Doğrusal dizi | `DİZİ 4 40 0 0` |
| DAİRESEL DİZİ / POLAR ARRAY n [açı] | Dairesel dizi | `DAİRESEL DİZİ 6 360` |
| GİZLE / HIDE | Gizle / göster | `GİZLE` |
| OYUK / CUT · BİRLEŞTİR / UNION | Parçayı oyuk ya da dolu yap | `OYUK` |
| TEK PARÇA / COMBINE | Bütün parçaları tek parça yap | `TEK PARÇA` |
| ÖLÇ / MEASURE | Ölçüm aracı | `ÖLÇ` |
| KESİT / SECTION [X\|Y\|Z] | Kesit aç / kapat | `KESİT X` |
| GÖRÜNÜM / VIEW ÖN\|ÜST\|YAN\|İZO | Bakış yönü | `GÖRÜNÜM ÜST` |
| GİT / GO sekme | Sekmeye git (ÖLÇÜ, KAYNAK, CNC, ANALİZ, RESİM, MEKATRONİK…) | `GİT KAYNAK` |
| BİRİM / UNITS MM\|CM\|İNÇ | Ölçü birimi | `BİRİM CM` |
| SİL, GERİ AL, YİNELE, SIĞDIR, KAYDET | Düzen | `KAYDET` |
