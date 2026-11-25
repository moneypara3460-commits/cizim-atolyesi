# Klavye kısayolları ve komutlar

Uygulamanın bütün klavye kısayolları ve yazılı komutları (tuşlar sabittir). Uygulamada **?** ya da **F1** (yazı alanı dışında) bu listeyi açar;
Makine bölümünde Ctrl+K paletine **KISAYOLLAR** yazmak da açar.
Uygulamadaki **Komut kılavuzu** sayfası (`kilavuz/`) bu dosyadan ve `docs/KILAVUZ-GIRIS.md`den üretilir: bir komutu değiştirince `node tools/kilavuz.mjs` çalıştır (testler güncelliği denetler).
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

## 3. Üretim, analiz ve dışa aktarma (Makine bölümü)

Komut, ilgili sekmeyi açar ve o sekmedeki gerçek düğmeye basar (elle basmakla aynı sonuç). Bir ön adım eksikse ne yapılacağını söyler.

| Tuş | İş |
|---|---|
| Ctrl+P | Teknik resim PDF |
| Ctrl+E | STEP dışa aktar |
| Ctrl+G | Etkin CNC modunun G-kodu |
| F9 | Bulunulan sekmede çalıştır: Analiz çöz · Gelecek dayanım testi · CNC takım yolu · Üretim kontrolü · Montaj planı analizi · B-Rep doğrula |

Teknik resim ekranında: **Esc** kapat · **Ctrl+P** PDF · **Ctrl+Shift+P** PNG · **Z** büyüt / küçült · **K** kesit ↔ izometrik.

| Komut (Türkçe / İngilizce) | İş |
|---|---|
| TEKNİK RESİM / DRAWING · RESİM PDF / DRAWING PDF | Teknik resmi aç · PDF indir |
| STEP · STL · 3MF · DXF GÖRÜNÜŞ / DXF VIEWS | Dışa aktar |
| PARÇA LİSTESİ / BOM | Parça listesi CSV |
| TAKIM YOLU / TOOLPATH · G KODU / GCODE · CNC SİMÜLASYON · İŞ KARTI · TORNA / LATHE | CNC |
| AĞ / MESH · ANALİZ, ÇÖZ / SOLVE · ANALİZ RAPORU | Mühendislik analizi |
| DAYANIM TESTİ · TİTREŞİM TESTİ · SICAKLIK TESTİ | Sanal testler (Gelecek sekmesi) |
| B-REP, DOĞRULA / VALIDATE | OCCT ile kur ve doğrula |
| ÜRETİLEBİLİRLİK / DFM · KESİM OPTİMİZASYONU | Üretim kontrolü · kesim planı |
| ÜRETİM RAPORU · AĞIRLIK RAPORU · MALİYET RAPORU · KAYNAK RAPORU · MONTAJ RAPORU · MEKATRONİK RAPORU | PDF raporlar |
| ÇALIŞTIR / RUN | F9 ile aynı |

## 4. Tekstil ve Moda

En üstteki ekran tuşu alır (3B görünüm → örgü çizelgesi → pastal → kalıp → teknik çizim → proje sayfası). Yazı alanındayken harfler yazıdır; Esc alandan çıkarır.

**Proje sayfası:** 1–9 sekme · PageDown / PageUp sonraki / önceki sekme · Ctrl+S kaydet · Ctrl+E projeyi dışa aktar (JSON).

**Teknik çizim:** V seç · L çizgi · E eğri · N nokta · D ölçü · T yazı · K detay · Enter şekli bitir · Shift+Enter kapatarak bitir · Backspace son noktayı geri al · Delete sil · Ctrl+D ayna kopya · F sığdır · 1–9 görünüş · Ctrl+Z / Ctrl+Y · Ctrl+S · Ctrl+P PDF · Ctrl+Shift+P PNG · Esc vazgeç → seç → kapat.

**Kalıp:** V seç · C çıt · P pens · I işaret · B böl · M birleştir · N yeni parça · E dikiş eşle · R döndür · H ters çevir · Ctrl+D çoğalt · Delete sil · Enter yeni parçayı / dikiş eşlemesini bitir · Backspace son noktayı geri al · F sığdır · Ctrl+Z / Ctrl+Y · Ctrl+S · Ctrl+P PDF · Ctrl+Shift+P SVG · Esc vazgeç → seç → kapat.

**Pastal:** A otomatik yerleştir · R seçili parçayı döndür · Ctrl+S pastalı kaydet · Ctrl+P PDF · Ctrl+Shift+P SVG · Esc kapat.

**Örgü çizelgesi:** B boya · D alan doldur · T tekrar alanı · S sıra bilgisi · H kaydır · F sığdır · 1–9 ilmek seç · Ctrl+Z / Ctrl+Y · Ctrl+S · Ctrl+P PDF · Ctrl+Shift+P PNG · Esc kapat.

**3B görünüm:** Esc kapat.

## 5. Ayakkabı Modelhanesi

**Sayfalar:** 1 Projelerim · 2 Yeni proje · 3 Stampa Atölyesi · 4 Saya Parçaları · 5 Malzeme · 6 Dosyalar · 7 Dışa Aktarma · 8 Ayarlar · PageDown / PageUp sonraki / önceki sayfa · Ctrl+S kaydet · Ctrl+Z / Ctrl+Y geri al / ileri al.

**Stampa çizim ekranı (araçlar):** V seç · L çizgi · E eğri · B bezier · S serbest · N nokta ekle · X nokta sil · K böl · J birleştir · G kenar başı · C çentik · M binme noktası · H delik · A aksesuar · R referans · D ölçü · T yazı (parça araçları yalnız bir parça düzenlenirken çalışır).

**Stampa çizim ekranı (işlemler):** P yeni saya parçası · Ctrl+D parçayı kopyala · Enter çizgiyi bitir · Shift+Enter çizgiyi kapat · Delete seçileni sil · Esc vazgeç → seç · F ortala · + / − yakınlaştır / uzaklaştır · Ctrl+Z / Ctrl+Y.
Çizim alanı (kanvas) seçiliyken Esc, Enter, Delete / Backspace ve Ctrl+Z ekranın kendi davranışıyla çalışır.

## 6. Yardım ekranı

**?** ya da **F1** (yazı alanı dışında): bulunulan bölümün bütün tuşları ve komutları (açık olan ekranın bölümü en üstte). Arama kutusu ada, komuta ve tuşa göre süzer. **Esc** kapatır.
Yardım açıkken alttaki ekran tuş almaz. Makine'de palete **KISAYOLLAR** yazmak da açar.

**Tuşlar sabittir.** Kullanıcı tuş değiştiremez: herkes aynı tuşlarla çalışır, kılavuz ve destek her kullanıcı için geçerlidir (23.11.2026 kararı).
Eski sürümde kaydedilmiş kullanıcı tuşu (`cizim:kisayol`) açılışta silinir.
