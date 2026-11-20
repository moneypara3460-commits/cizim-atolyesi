# Makine CAD: SolidWorks'e göre eksikler

Sıra kolaydan zora. Her madde ayrı PR; tam test (birim, gerçek OCCT, iki arayüzde uçtan uca) ve CI'dan geçer.

| # | Madde | Durum |
|---|---|---|
| 6 | Her şekle radyüs / pah (tek tek kenar) | **Tamam** (19.11.2026) |
| 2 | Delik sihirbazı / diş (işaretli diş) | **Tamam** (19.11.2026) |
| 3 | Teknik resim: tolerans, pürüzlülük, parça listesi | **Tamam** (19.11.2026) |
| 1 | Standart parça kütüphanesi (doğrulanmış ölçü tablolarıyla) | **Tamam** (20.11.2026) |
| 8 | Sac metal: flanş, köşe kapatma | **Tamam** (20.11.2026) |
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

## 3. Teknik resim: tolerans, pürüzlülük, parça listesi

**Resim** sekmesi ayarları (projeyle saklanır): genel tolerans ISO 2768-1 sınıfı (f / m / c / v ya da yazma), genel yüzey
pürüzlülüğü Ra (N1…N12 dizisi ya da yazma), parça listesi ve delik tablosu aç / kapat. Kod: `teknik.js` (saf hesap),
`app.js` (`makeSheet`, `drawSheetNotes`).

- **Delik yazıları** (ISO 129 / ISO 6410 düzeninde): delik sihirbazının kılavuz deliği `M8-6H ↧16,25` + `Ø6,8 ↧20`; kademe
  `⌴ Ø11,25 ↧6`; havşa `⌵ Ø10,65 × 90°`; boydan boya. Kademe / havşa / uç parçaları ayrıca yazılmaz. Boydan boya delik de
  görünüşte yazılır. Yazı, çerçeveden taşmayan, ölçü çizgisini ve başka görünüşü kesmeyen tarafa konur.
- **Geçme toleransı** (ISO 286, H6…H11): delik seçilip Ölçü sekmesinden verilir (kılavuz deliğinde yok); resimde
  `Ø10 H7 (+0,015 / 0)`. 0–500 mm.
- **Antet**: `Genel toleranslar: ISO 2768-m`, tek malzemeliyse `Malzeme: …`, ISO 1302 pürüzlülük sembolü (talaş kaldırılarak)
  ve Ra değeri.
- **Parça listesi**: görünür, birleşen parçalar (oyuklar, gizliler, yardımcı kesiciler hariç); aynı ad + tür + ölçü + malzeme
  tek satırda adetle. İki ya da daha çok satır varsa çizilir (tek parçalı resimde malzeme antete yazılır). Sığmayan satırlar
  için "… N satır daha (tam liste: Hesap → Parça listesi CSV)".
- **Delik tablosu**: sihirbazla açılan ya da geçme toleranslı delikler, aynı yazı adetle (A, B, …).
- Tablolar izometrik alanın altına yerleşir (izometrik en az 35 mm kalır); geniş alanda yan yana.
- Ondalık ayırıcı resimde virgül.

**Sınır:** yüzey başına ayrı pürüzlülük, tek tek ölçüye tolerans, geometrik tolerans (GD&T) çerçeveleri ve parça
balonları (poz numarası okları) yok; resim raster (PNG / PDF).

**Tablo kaynakları** (`teknik.js` başında): ISO 2768-1 Tablo 1 (IS 2102-1 = ISO 2768-1, AmesWeb, Wevolver, Star Rapid);
ISO 286-1 IT6…IT11 (Wikipedia ISO 286 Tablo 1, Wevolver, GlobalSpec, RoyMech); Ra / N dizisi (Ceratizit, Xometry, Keyence).

**Doğrulama:** `tests/teknik.test.mjs` (tablo sınırları, H sapmaları, yazılar, parça listesi, delik tablosu), uçtan uca
`C-Resim` (iki arayüzde: M8 kılavuz + Ø10 H7 + ikinci parça → resim bilgisi, tablolar, ayarların yeniden yüklemede kalması).

## 1. Standart parça kütüphanesi

**Yüz** sekmesi → yüze dokun → **🧰 Standart parça**. Kod: `stdparca.js` (tablolar ve parça tarifleri, saf hesap),
`app.js` (`faceStdPart`, `holeMouthNear`).

- **Alyan başlı vida ISO 4762** M3–M24, boy 6–120 mm (anma boyları): gövde + baş tek dönel parça, altıgen lokma ona bağlı
  yardımcı oyuk (vida silinince o da silinir, vidayla taşınır).
- **Altıgen somun ISO 4032** M3–M24 (altıgen prizma, ortasında delik), **düz pul ISO 7089** M3–M24 (halka),
  **sabit bilyalı rulman** 6000–6006, 6200–6206, 6300–6305 (d × D × B halka, sadeleştirilmiş).
- Parça dokunulan yüze oturur (vida başı yüzeyde, gövdesi içeri). Yakında yüze dik bir delik varsa (ağız, kademe ya da havşa
  çapı + 3 mm içinde) parça deliğin eksenine ortalanır; kademeli delikte vida başı kademenin tabanına oturur.
- Parça listesinde (teknik resim) ad ve standart ölçü yazısı görünür (`ISO 4762 M8×30`, `M8 (s 13, m 6,8)`,
  `20 × 47 × 14 (sadeleştirilmiş)`); aynı parçalar adetle.
- Diş modellenmez (vida gövdesi anma çapında). Malzeme projenin varsayılanıdır; Parça sekmesinden değiştirilebilir.

**Tablo kaynakları** (`stdparca.js` başında, her tablo en az iki kaynak): ISO 4762 (TR Fastenings / Farnell veri sayfası,
Keller & Kalmbach, iki katalog), ISO 4032 (Wermac, H&B Bolt, ISO 4032 resmî örnek sayfa), ISO 7089 (JC Fasteners,
fasteners.eu, BOLTS, McMaster-Carr), rulman ana ölçüleri (Miki Pulley JIS çizelgesi, MRO Supply, igus). 6306 doğrulanamadığı
için konmadı. Ek çapraz denetim: pul iç çapı ISO 273 ince serisiyle, kademe derinliği vida baş yüksekliğiyle birebir aynı.

**Doğrulama:** `tests/stdparca.test.mjs` (kaynak değerleri, tablo tutarlılığı, standartlar arası uyum, Pappus ile vida hacmi,
altıgen alanı ve anahtar ağzı), uçtan uca `C-Standart` (iki arayüzde: kademeli deliğe vida — eksen ve oturma yüksekliği,
lokmayla silme, somunlu B-Rep hacmi 192,65 cm³, rulman ve parça listesi).

### Kozmetik diş (madde 1 ile birlikte, 20.11.2026)

Diş modellenmez (model hafif kalır; imalat diş yazısından yapılır, SolidWorks'teki gibi) ama görünür. Kod: `dis.js`.

- **Ölçü** sekmesi (silindir / boru / delik seçiliyken) → **Diş**: dış ya da iç diş, ölçü (M1,6–M24, kaba / ince adım
  ya da **özel**: dış çap, adım ve ad, ör. boru dişi `G 1/2`), başlangıç ve boy. Ör. borunun yarısına kadar dış, kalanına iç
  diş. Parçadan taşan diş reddedilir; çap uyuşmazsa uyarılır. Birden çok diş eklenip tek tek silinebilir.
- Kendiliğinden dişler: ISO 4762 vidada uçtan b = 2d + 12 (kısa vidada boydan boya), ISO 4032 somunda boydan boya, delik
  sihirbazının kılavuz deliğinde diş boyu kadar.
- **3B**: dişli bölge yüzeyde helis çizgisiyle (gerçek adımla) görünür.
- **Teknik resim (ISO 6410)**: dış diş — küçük çapta (d3 = d − 1,226869·P) ince çizgi, diş sonunda kalın sınır çizgisi,
  uçtan bakışta küçük çapta 3/4 ince daire; iç diş (kesitsiz) — dış çapta kesik çizgi, uçtan bakışta dış çapta 3/4 daire;
  diş yazısı (ör. `M20×1,5`) bir görünüşte gösterme çizgisiyle. Resimde helis çizgisi gösterilmez.

**Doğrulama:** `tests/dis.test.mjs` (küçük çaplar Optimas çizelgesiyle, vida diş boyu Misumi çizelgesiyle, diş doğrulama,
borunun yarı dış / yarı iç dişi, vida / somun / kılavuz deliği dişleri, helis), uçtan uca `C-Dis` (iki arayüzde: borunun
iki dişi, taşan dişin reddi, helis parça sayısı, ISO 6410 çizgileri ve yazıları, silme, yeniden yükleme) ve `C-Standart`
(vida dişi b = 28).

## 8. Sac metal: kenar flanşı ve köşe kapatma

Sac parça → **Tür** sekmesi → **Flanşlı sac → ▭ Tava / kutu (kenar flanşları)**. Kod: `sac.js` (hesap, 3B üçgenler, açınım;
saf modül), `logic.js` (`sheetCalc` tava kipine geçer), `app.js` (`tavaPanel`, çizim).

- **Ölçü** sekmesi: taban dış ölçüsü X × Z, sac kalınlığı, iç büküm yarıçapı, K faktörü, flanş açısı (düzden dönüş;
  90° = dik, 90°'den küçükse dışa açılır). Dört kenarın her birine ayrı flanş boyu (dış ölçü, sanal keskin köşeden;
  0 = flanş yok).
- **Köşe**: *açık* — iki büküm bölgesinin kesiştiği kare, açınımda boş kalır (büküm teğet çizgilerine kadar köşe
  boşaltması); *kapalı* — ön / arka (ya da seçilirse sol / sağ) flanş dış ölçüye kadar uzar, öbürü ona **köşe aralığı**
  kadar boşluk bırakacak boyda uzar. Kapalı köşe yalnızca 90° flanşta yapılır (başka açıda uyarı verir, köşeyi açık
  bırakır). Aralık 0,4 mm'den küçükse uyarır.
- Panelde açınım ölçüsü, büküm sayısı, büküm payı (BA), geri çekilme (OSSB) ve büküm düşümü (BD); kısa flanş, dar taban
  ve malzemenin en küçük büküm yarıçapı uyarıları.
- **Açınım**: *Düz (açınım) göster* gerçek açınım şeklini (artı biçimi, kapalı köşede uzatmalarla) gösterir;
  **Açınım DXF** dış konturu (KONTUR katmanı) ve büküm eksen çizgilerini (BUKUM katmanı) verir. Ağırlık gerçek 3B
  geometriden, maliyetteki sac boyutu açınımın dış ölçüsünden.

**Formüller** (`sac.js` başında, her biri en az iki kaynak): BA = θ·(R + K·T) (The Fabricator, Durma, SendCutSend,
Proleantech / Inventor), OSSB = tan(θ/2)·(R + T) (The Fabricator, Durma, Proleantech, calculate.co.nz), BD = 2·OSSB − BA,
açınım = dış ölçüler − BD (The Fabricator, Durma, SMLease, Harsle). Köşe boşaltması büküm teğet çizgileriyle sınırlı
bölgeyi aşmaz (PTC Creo); kapalı köşe biçimi Solid Edge ve Inventor'daki gibi (bir flanş uzar, arada aralık). 0,4 mm aralık
önerisi SendCutSend'den (kural değil, uyarı).

**Doğrulama:** `tests/sac.test.mjs` (kaynak örneği R 3 T 3 K 0,33 → BA 6,27 / OSSB 6 / BD 5,73, açınım formülü, açınım
alanı, 3B hacmin analitik değerle uyumu, kapalı köşe uzatmaları ve aralık, 60° flanş, tek flanş, hata ve uyarılar),
uçtan uca `E-Tava` (iki arayüzde: açınım 173,05 × 133,05, dış ölçü 120 × 30 × 80, hacim, flanş kaldırma, kapalı köşe hacim
farkı, 60° uyarısı, düz açınım ölçüsü, DXF kapsamı ve büküm katmanı, kayıttan geri yükleme).

