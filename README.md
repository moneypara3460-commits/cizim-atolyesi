# Çizim Atölyesi

Telefonda çalışan basit bir 3D çizim (mini CAD) uygulaması. Parçaları ölçüyle oluşturur, birleştirir, oyuk açar, 3D yazıcı için STL olarak indirirsin.

**Güncel sürüm web sürümüdür** (`index.html`): https://moneypara3460-commits.github.io/cizim-atolyesi/
(GitHub → Settings → Pages → Deploy from branch → `main` / root ile yayınlanır.)

## Özellikler

**❓ Rehber ve örnek projeler** — üst çubuktaki ❓: ilk açılışta kendiliğinden gelir. 7 hazır örnek (L braket, flanş, menteşeli kutu, mil ve burç, sac U kanal, masa iskeleti, boru dirseği) tek dokunuşla yüklenir ve ne deneneceği ekranın üstünde yazar; ↶ Geri önceki çalışmayı geri getirir. Konu konu kısa kullanım rehberi.


**Şekiller ve düzenleme**
- Sonsuz zemin ızgarası (yakınlaştırdıkça 10 mm, 100 mm, 1 m, 10 m... ölçeğine geçer); ölçü sınırı 100 m. Kırmızı çizgi X, mavi çizgi Z eksenidir
- Şekiller: kutu, silindir, küre, koni / kesik koni, boru, **kroki** parçası
- Kutu ve silindirde **kenar yuvarlama** ve **pah** (kenar kırma), ayrıca **eğim** (döküm eğimi: üst yüz her yönden yükseklik × tan(eğim) kadar daralır)
- Birden fazla parça: **birleştir** veya **oyuk aç** (boolean / CSG, `three-bvh-csg`); hazır yuvarlak / kare delik tuşları
- Konum (X, Y alt, Z) ve döndürme (X°, Y°, Z°, parçanın alt orta noktası etrafında)
- Geri al / ileri al

**Hareketli montaj (Bağ sekmesi)**
- Bir parçayı başka bir parçaya **bağla**: üst parça taşınınca / döndürülünce alt parçalar da onunla gelir (🔗 işareti)
- **Menteşe** (seçilen eksen etrafında döner) ve **Kayar** eklem; kaydırıcı ile hareket ettir, "Eksen noktasını seç" ile menteşe yerini modelde belirle
- Yüze açılan delikler / pahlar, bağlı oldukları parçayla birlikte gider

**Kroki (2D çizim → 3D)**
- ✎ Kroki: çokgen, dikdörtgen (köşe yuvarlamalı), daire ve **yay** (başlangıç → bitiş → orta nokta; ilk noktaya bitirince şekil kapanır) çiz; köşeleri sürükleyerek düzelt; ölçüleri yazarak ayarla; yapışma (1 / 5 / 10 / 25 mm); iki parmakla yakınlaştır / kaydır
- **Birleşik kroki**: aynı krokide birden çok şekil çiz; başka şeklin içine çizdiğin şekil **delik** olur (iç içe: delik, onun içindeki ada…). "Seç" aracı ile şekle dokunup ölçüsünü değiştir ya da "Şekli sil"
- **Kalınlık ver** (ekstrüzyon): üstten (X-Z) ya da önden (X-Y) düzlemde
- **Döndür** (devir): profili dikey eksen etrafında döndürerek vazo, mil, tekerlek gibi parçalar
- Kroki sonradan **düzenlenebilir** (Tür / Ölçü sekmesi → Krokiyi düzenle)

**Yüze işlem (Yüz sekmesi)**
- Modelde bir yüze dokun: yüz sarı işaretlenir. O yüze **delik aç** (yuvarlak / kare, çap + derinlik), **çıkıntı ekle** (yükseklik) ya da **kroki çiz** (oyuk / çıkıntı). Yan ve üst yüzlerde, yüze dik olarak çalışır

**Delik / çıkıntı deseni (Yüz sekmesi)**
- Tek, **ızgara** (sütun × satır, iki aralık) ya da **daire** (adet + yarıçap) deseni; dokunduğun nokta desenin merkezidir. En fazla 64 parça

**Kabuk (Kabuk sekmesi)**
- Kutu, düz silindir ve küreyi içini boşaltır (duvar kalınlığı; üst / alt açık seçilebilir). İç hacim oyuk parça olarak eklenir; silersen geri gelir

**Montaj (Montaj sekmesi)**
- Önce hareket edecek parçanın yüzüne, sonra yapışacağı başka parçanın yüzüne dokun; "Yüzü yüze birleştir" parçayı döndürür ve oturtur (boşluk ve yüz çevresinde döndürme ayarı; yüz merkezlerini hizalama açılıp kapanır). Geri al ile döner. Gerçek bir bağlantı (mate) çözücüsü değildir: tek seferlik yerleştirmedir, sonradan parça oynatılırsa bağlı kalmaz

**Teknik resim (Resim sekmesi)**
- A4 yatay sayfada ön, sağ yan, üst ve izometrik görünüş (üçüncü açı), standart ölçek (1:2, 1:5...), genel ölçü çizgileri, başlık kutusu. **PNG** ya da **PDF** olarak indirilir
- **Gizli çizgiler** kesik çizgiyle gösterilir (başka yüzün arkasında kalan kenarlar ve silindir siluetleri)
- **Delik ölçüleri**: eksene paralel yuvarlak delikler için `Ø10`, kare delikler için `□ 8 × 6` yazısı ve eksen çizgileri; delik, eksenine bakan görünüşte gösterilir
- Sayfadaki **✂ Kesit** düğmesi sağ alttaki izometriği A-A kesitiyle değiştirir: X ekseninde kesilir (Kesit sekmesi açık ve X seçiliyse onun konumunda, değilse ortada), kesilen yüzey 45° taranır, önden görünüşte kesit düzlemi işaretlenir

**Hareket etüdü (Hareket sekmesi)**
- Menteşe / kayar eklemler ile mesafe / açı eşleşmeleri baştan sona yumuşakça oynatılır (her biri için başlangıç ve bitiş değeri); eşleşmeli parçalar birlikte hareket eder
- Git-gel, tek yön ya da sürekli döngü; süre ayarlanır
- **🎬 Video kaydet**: ekrandaki görünüm bir tur boyunca WebM (iPhone'da MP4) olarak kaydedilip indirilir

**Kalıcı eşleşmeler — mate (Montaj sekmesi)**
- Türler: **Çakışık** (yüzler aynı düzlemde, yüz yüze ya da aynı yöne), **Mesafe**, **Paralel**, **Açı**, **Eş merkezli** (mil – delik / boru aynı eksende; parçaların dikey ekseni kullanılır)
- 1. dokunulan parça hareket eder, 2. parça referanstır. Eşleşmeler saklanır: referans parça taşınınca / döndürülünce bağlı parça da gelir; bağlı parça sürüklenirse yalnızca serbest kalan yönde kayar
- Birden çok eşleşme birlikte çözülür (yinelemeli); çelişki varsa uyarı çıkar. Mesafe / açı değeri listeden değiştirilebilir, eşleşme silinebilir
- Eski "yüzü yüze oturt" (bir kerelik) de aynı sekmede duruyor

**Kaynak konstrüksiyon (▦ Konstrüksiyon düğmesi)**
- Hazır iskeletler: masa iskeleti (üst kuşak + isteğe bağlı alt kuşak), kutu çerçeve, raf / sehpa (raf sayısı), pano çerçeve
- Standart profiller: kutu 20–80, dikdörtgen 40×20 / 60×40, boru Ø21,3–Ø48,3 (içi boş, et kalınlıklı)
- Ölçüler dış ölçü; dikmeler tam boy, kuşaklar dikmeler arasına alın kesimle oturur (alın birleşim) ya da gönye
- **Gönye (45°)**: pano ve kutu çerçevede, kare / yuvarlak profille; kesim listesinde uzun kenar boyu ve kesim açısı
- **Kesim listesi**: eleman, adet, boy, toplam boy, çelik ağırlığı, kaç 6 m'lik boy gerektiği; CSV olarak indirilir

**Sac metal (⌐ Sac metal düğmesi)**
- Bükülmüş sac parça: kalınlık, iç büküm yarıçapı, derinlik, K faktörü. Hazır profiller: L köşebent, U kanal, Z, şapka, C (dudaklı); ya da kenar ekleyip her kenarın dış ölçüsünü ve büküm açısını (+ yukarı / − aşağı) kendin yaz
- **Açınım boyu** otomatik hesaplanır (düz kısımlar + büküm payı, BA = açı × (R + K·T)); kenar büküm payından kısaysa uyarır
- **📄 Düz göster**: parçayı 3B'de açınım plakası olarak gösterir. **⬇ Açınım DXF**: lazer / abkant için dış kontur + kırmızı büküm çizgileri (mm)
- Delik parçalarıyla sac delinebilir, ama delikler açınım DXF'ine aktarılmaz (yalnızca kontur ve büküm çizgileri)

**Kağıttan çizim — fotoğraftan 2B / 3B (2B Çizim → Dosya → 📷 Fotoğraftan çizim)**
- Kağıda elle çizilmiş çizimin fotoğrafı çekilir ya da galeriden seçilir; her şey telefonda, internetsiz yapılır
- Kağıdın köşeleri otomatik bulunur (sarı noktalar sürüklenerek düzeltilir, sürüklerken büyüteç), eğik fotoğraf düz kağıda çevrilir (A4 dikey / yatay / serbest)
- Gölge temizlenir (uyarlamalı eşik), küçük işaretler ve el yazısı rakamlar ayıklanır, kalem izi inceltilir, çizgiler takip edilip **düz çizgi / yay / daire** olarak tanınır; yataya / dikeye yakın çizgiler düzlenir, yakın uçlar birleştirilir, yayın teğet devamı ve kılçıklar temizlenir
- Sonuç 2B çizime normal varlık olarak gelir (düzenlenebilir). **📏 Ölçekle**: bir çizgiye dokunup gerçek ölçüsünü yazınca bütün çizim ölçeklenir. **🧊 3B** düğmesi kapalı şekilleri kalınlık verip 3B parçaya çevirir (içteki daire delik olur)
- Sınırlar: el yazısı ölçü rakamları okunmaz (ölçü Ölçekle ile verilir); ölçü okları / taramalar çizgi olarak gelebilir, silinmesi gerekir; kareli / çizgili kağıtta hassasiyet düşürülmeli

**2B Çizim — AutoCAD tarzı (📝 2B Çizim düğmesi)**
- Ayrı tam ekran çizim alanı; telefonda otomatik saklanır, geri al / ileri al
- **Çiz:** çizgi (zincirleme; X/Y, uzunluk ve açı yazarak), daire (merkez + çap), yay (3 nokta), dikdörtgen (köşe + genişlik/yükseklik), hizalı ölçü, yazı
- **Düzenle:** kırp (AutoCAD hızlı kırp), uzat, ofset, radyus (iki çizgi arası köşe yuvarlama, 0 = keskin köşe), taşı, kopyala (çoklu), döndür / döndürerek kopyala, ayna (aslı kalsın / silinsin), sil, seç
- **📐 Ölçü ver:** çizgiye dokunup uzunluğunu yaz; dokunulan uç tarafındaki her şey birlikte kayar (AutoCAD esnet gibi: dikdörtgenin eni değişince kenar dik kalır, delik yerinde kalır). Daireye çap, yaya yarıçap verilir (bağlı çizgi uçları takip eder). İsteğe bağlı ölçü yazısı otomatik eklenir. El çiziminden gelen taslağı tam ölçülü yapmak için
- **Yakalama:** uç nokta, orta nokta, merkez, kesişim, çeyrek, ızgara (0,5 / 1 / 5 / 10 mm), orto modu. Dokunurken parmağın altı büyüteçte gösterilir; parmağı kaydırıp doğru yere oturtup bırakınca nokta konur
- **Katmanlar:** renk, çizgi tipi (sürekli, gizli, eksen), gizle, kilitle, etkin katman, seçileni katmana taşı
- **Dosya:** DXF kaydet / aç (LINE, CIRCLE, ARC, LWPOLYLINE + bulge, POLYLINE, TEXT, MTEXT), PNG kaydet
- **🧊 3B parça yap:** kapalı şekiller (uçları birleşen çizgi / yaylar ve daireler) kalınlık verilerek 3B kroki parçasına çevrilir; iç içe olan delik olur
- Kısıtlar 2B çizimde yok (kroki editöründe var); ölçüler ilişkisel değil (çizim değişince ölçü yazısı güncellenir ama ölçü şekli sürüklemez)

**2B Çizim — AutoCAD tarzı (📝 2B Çizim düğmesi)**
- Ayrı tam ekran çizim alanı; telefonda otomatik saklanır, geri al / ileri al
- **Çiz:** çizgi (zincirleme; X/Y, uzunluk ve açı yazarak), daire (merkez + çap), yay (3 nokta), dikdörtgen (köşe + genişlik/yükseklik), hizalı ölçü, yazı
- **Düzenle:** kırp (AutoCAD hızlı kırp), uzat, ofset, radyus (iki çizgi arası köşe yuvarlama, 0 = keskin köşe), taşı, kopyala (çoklu), döndür / döndürerek kopyala, ayna (aslı kalsın / silinsin), sil, seç
- **Yakalama:** uç nokta, orta nokta, merkez, kesişim, çeyrek, ızgara (0,5 / 1 / 5 / 10 mm), orto modu. Dokunurken parmağın altı büyüteçte gösterilir; parmağı kaydırıp doğru yere oturtup bırakınca nokta konur
- **Katmanlar:** renk, çizgi tipi (sürekli, gizli, eksen), gizle, kilitle, etkin katman, seçileni katmana taşı
- **Dosya:** DXF kaydet / aç (LINE, CIRCLE, ARC, LWPOLYLINE + bulge, POLYLINE, TEXT, MTEXT), PNG kaydet
- **🧊 3B parça yap:** kapalı şekiller (uçları birleşen çizgi / yaylar ve daireler) kalınlık verilerek 3B kroki parçasına çevrilir; iç içe olan delik olur
- 2B çizimde kısıt yok (kroki editöründe var); ölçüler çizimle birlikte değişmez, ayrı varlıktır

**Parametrik kroki (Kroki → 📐 Kısıt)**
- Çokgen kenarına dokun: **Yatay**, **Dikey**, **Uzunluğu kilitle** (ölçüyü sonradan yazınca şekil kendini ayarlar). İki kenar seç: **Paralel**, **Dik**, **Eşit uzunluk**, **Açı**. Köşeye dokun: **Sabitle**
- Kısıtlı şekilde köşe sürüklenince diğer köşeler kısıtlara uyacak şekilde kendiliğinden yer değiştirir; çelişen kısıt eklenmez
- Çizerken neredeyse yatay / dikey çizilen kenar otomatik kısıt alır (kapatılabilir). Dikdörtgen "kısıtlı çokgene" çevrilebilir
- Serbestlik derecesi gösterilir: 0 = tam tanımlı. Kısıtlar parçayla kaydedilir, "Krokiyi düzenle" ile geri gelir
- Kısıtlar düz kenarlar içindir; yay ve daire ölçüleri kendi alanlarından girilir

**Süpürme ve Loft (+ Süpürme, + Loft düğmeleri)**
- **Süpürme**: bir profili (daire, dikdörtgen, boru) yol boyunca sürer. Yol: dirsek / yay (eğri yarıçapı, açı, baştaki ve sondaki düz boy), helis (yay, vida: sarım yarıçapı, adım, sarım sayısı) ya da çok noktalı boru hattı (X/Y/Z noktaları, köşeler yarıçapla yuvarlanır). Profil ve yol Tür sekmesinden seçilir. Oyuk olarak da kullanılır (kavisli kanal açmak için)
- **Loft**: alt şekilden üst şekle geçiş (kare → daire, dikdörtgen → dikdörtgen vb.), üst şekli kaydırma ve burma. Kesik piramit, huni, kare tabandan yuvarlak ağza geçiş
- Yolu parmakla çizme yok; ölçüler ve noktalar sayıyla girilir. Kendini kesen (çok dar eğri) süpürmeler CSG'de hata verebilir; eğri yarıçapı profilden küçük yapılamaz

**Dayanım ve büküm uyarıları (Dayanım sekmesi)**
- Malzeme kütüphanesi: çelik S235, paslanmaz 304, alüminyum 5052 / 6061-T6, pirinç, bakır, titanyum, PLA, ABS, PETG, naylon, çam, meşe, kayın, kontrplak, MDF (E, akma / eğilme dayanımı, uzama). Her parçaya ayrı malzeme verilir
- **Bükme sınırı:** sacda en küçük güvenli iç büküm yarıçapı (metallerde endüstri tablosu R/T, ahşapta dış lif uzaması = eğilme dayanımı / E), abkant için en kısa kenar; boru / çubuk süpürmede en küçük eğri yarıçapı (mandrelli / buharla seçenekleri). Sınırın altında parça listesinde ⚠ ve kırmızı uyarı çıkar
- **Yük testi:** kutu / plaka, mil, boru, düz sac için kiriş hesabı (iki ucundan dayalı ya da konsol, tekil ya da yayılı yük): gerilme, sehim, güvenlik katsayısı, 2 kat güvenlikle taşıyabileceği en fazla yük. Konstrüksiyonda en uzun kuşak ve dikmelerin burkulması
- Temel el hesabıdır (FEA değil); ön kontrol içindir

**Hesap ve dışa aktarma (Hesap sekmesi)**
- Malzeme seç (PLA, ABS, PETG, naylon, ahşap, alüminyum, çelik, paslanmaz, pirinç, bakır, titanyum): hacim, yüzey alanı, **ağırlık**, ağırlık merkezi, genel ölçü. Tam dolu katı varsayılır
- **Parça listesi (CSV)**: Excel'de açılır (Türkçe, noktalı virgül ayraçlı)
- **DXF**: ön / yan / üst görünüş, mm. Katmanlar: GORUNEN (düz), GIZLI (kesik), EKSEN (delik eksenleri). AutoCAD, FreeCAD, LibreCAD vb. açar. 
- **STEP** (AP214): SolidWorks, Fusion, FreeCAD, Onshape açar. Yüzeyli (üçgen yüzlü) katı olarak yazılır; model tam kapalı değilse yüzey modeli olur. Parametrik özellik ağacı ve gerçek eğri yüzey yoktur
- **3MF**: 3B yazıcı dilimleyicileri için (mm, renkli)

**Tek kenara pah / yuvarlama (Kenar sekmesi)**
- Düz bir kutunun kenarına dokun (sarı çizgi seçileni gösterir), ölçüyü yaz, "Pah kır" ya da "Yuvarla". İşlem kenara oyuk parçası(ları) ekler; Parça listesinden silersen geri gelir. Yalnızca düz kutu parçalarında çalışır

**Taşıma, çoğaltma**
- **✋ Taşı** açıkken seçili parçayı parmakla sürükle (yer düzlemi, dikey düzlem ya da yalnızca yukarı-aşağı; Konum sekmesinde seçilir). Oyuk (kesici) parça modelin içinde kalsa da üzerinden tutulup sürüklenebilir, ızgaraya yapışma (1 / 5 / 10 / 50 mm). Kapalıyken sürükleme sahneyi döndürür. Dokununca parça seçilir
- Çoğalt sekmesi: kopyala, ayna (X / Z), doğrusal dizi, dairesel dizi (1. parçanın ortası etrafında)

**Parça yönetimi, ölçü, görünüm**
- Parça sekmesi: ad, renk (12 renk), gizle / göster, sırayı değiştir
- **🧩 Tek parça yap** (Parça sekmesi): tüm görünür parçaları, birleştirme ve oyuklar uygulanmış haliyle tek bir parçaya çevirir. Sonradan ölçüsü değişmez (konum ve döndürme çalışır); yeni parça ekleyip birleştirebilir ya da oyabilirsin. Gizli parçalar atılır, tek renk kalır, Geri al ile döner. Üçgen verisi proje kaydına yazılır (çok ayrıntılı modelde kayıt büyür)
- Birimler: mm / cm / inç (içeride hep mm saklanır)
- Ölçü etiketleri (modelin ya da seçili parçanın genişlik, derinlik, yükseklik) ve **📏 ölçüm aracı** (iki noktaya dokun, köşelere yapışır, mesafe ve Δx Δy Δz)
- **Kesit görünümü** (X / Y / Z ekseninde, kaydırıcıyla, ters çevirilebilir)
- Görünümler: Üst, Ön, Yan, İzometrik, Sığdır, **Ortografik** (perspektifsiz) mod
- Kenar çizgileri ekran uzayında çizilir (temiz kenarlar); Görünüm sekmesinden kapatılabilir. Cihaz bunu doğru çizemiyorsa açılışta kendini sınar ve otomatik kapatır

**Kayıt ve çıktı**
- Projeleri telefonda kaydetme ve açma (tarayıcı belleği, `localStorage`); son durum otomatik saklanır
- STL dışa aktarma (mm, Z-yukarı, 3D yazıcı dilimleyicilerine uygun)
- Sesli komut (Türkçe, Chrome): kural tabanlıdır, yapay zekâ kullanmaz

### Sesli komut örnekleri

- "elli milimetre çapında yirmi milimetre yüksekliğinde silindir ekle"
- "kutu ekle 80 60 40"
- "10 milimetre delik aç" / "kare delik 8 milimetre"
- "küre ekle çap 30", "boru ekle dış çap 40 iç çap 30 yükseklik 20", "koni ekle alt çap 40 üst çap 10 yükseklik 50"
- "yüksekliği 30 yap", "çapı elli yap", "kenarları 5 milimetre yuvarla", "kenarlara 2 milimetre pah ver"
- "x ekseninde 45 derece döndür"
- "kopyala", "5 tane kopyala", "aynala", "z ekseninde aynala"
- "üstten bak", "önden bak", "yandan bak", "izometrik"
- "geri al", "yinele", "sığdır", "kaydet", "stl indir", "parçayı sil"

## Bilinen sınırlar

- Pah ve yuvarlama yalnızca kutu ve silindirde var (küre, koni, boru, kroki parçalarında yok)
- Kroki: yay üç nokta ile çizilir (serbest eğri / spline yok); yaylar ve daire çokgen parçalara bölünür (6° adım, daire 48 kenar). Çizgiler birbirini kesemez (şekiller iç içe ya da ayrı olabilir); döndürmede tek şekil olur
- Kabuk ve eğim yalnızca düz kutu / silindirde (küre kabuğu var, eğim yok); eğimli ya da yuvarlamalı parçada kenar işlemi ve kabuk yapılamaz
- Kabuğun iç boşluğu kendinden önceki tüm parçaları keser
- Montaj yüzeyin ortalama düzlemine göre yapar; eğri yüzlerde (silindir yan yüzü gibi) dokunduğun noktadaki yüz yönü kullanılır
- Teknik resimde delik ölçüsü yalnızca eksene paralel (Ø / kare) delikler için; eğik, küre ve koni oyuklarına yazılmaz. Gizli çizgiler çok ayrıntılı modelde (çok kenarlı) atlanır. Kesit yalnızca X ekseninde; Y/Z kesiti için sayfadaki izometrik/kesit seçimi yok
- Kesit görünümünde kesilen yüzey turuncu "iç yüz" olarak gösterilir (gerçek dolu kesit yüzeyi değil)
- Renkli parçalarda oyuğun iç duvarı tabanın rengini alır
- Çok sayıda parçada (kırk üstü dizi vb.) birleştirme yavaşlar

## Dosyalar

- `index.html` — arayüz kabuğu (görünüm, stiller)
- `app.js` — uygulama: 3D sahne, CSG, kenar çizgileri, panel, taşıma, ölçüm, kesit, sesli komut
- `sketch.js` — kroki editörü (2D tuval) ve doğrulama
- `logic.js` — test edilebilir mantık: parça varsayılanları, geri al geçmişi, STL yazıcı, sesli komut çözücü, birimler, kroki dönüşümleri (yay, yuvarlak köşe), kopya / ayna / dizi, pah geometrisi, teknik resim yerleşimi ve PDF yazıcı
- `photo2d.js`, `photoimport.js` — fotoğraftan çizim: görüntü işleme (eşik, inceltme, yol takibi, çizgi / yay / daire uydurma) ve ekranı
- `cad2d.js`, `cad2d-geom.js` — 2B çizim modu ve saf geometrisi (kesişim, kırp, uzat, ofset, radyus, DXF)
- `tests/` — testler: `node tests/logic.test.mjs`, `node tests/sketch.test.mjs`, `node tests/cad2d.test.mjs`, `node tests/photo2d.test.mjs`, `node tests/examples.test.mjs`, `node tests/export3d.test.mjs`
- `App.js`, `viewerHtml.js`, `package.json` — eski React Native / Expo sürümü (2. aşama; güncellenmedi)

## Yol haritası

1. ~~Kutu / silindir + ölçü girişi~~
2. ~~Çoklu parça, birleştirme, delik açma~~
3. ~~Geri al, yeni şekiller, döndürme, kaydetme, STL, sesli komut~~
4. ~~Kroki çizip kalınlık verme / döndürme~~
5. ~~Çoğaltma, ölçü etiketleri, ölçüm, kesit, parça yönetimi, birimler~~
6. ~~Kroki yayları, eğim, kabuk, delik deseni, montaj, teknik resim (PNG / PDF)~~
7. Sıradaki (isteğe bağlı): birleşik kroki (birden çok şekil), kroki kısıtları, delik / iç ölçülendirme, teknik resimde Y/Z kesiti ve delik konum ölçüleri
