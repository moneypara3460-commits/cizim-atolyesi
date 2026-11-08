# Çizim Atölyesi

Telefonda çalışan basit bir 3D çizim (mini CAD) uygulaması. Parçaları ölçüyle oluşturur, birleştirir, oyuk açar, 3D yazıcı için STL olarak indirirsin.

**Güncel sürüm web sürümüdür** (`index.html`): https://moneypara3460-commits.github.io/cizim-atolyesi/
(GitHub → Settings → Pages → Deploy from branch → `main` / root ile yayınlanır.)

## Özellikler

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

**2B Çizim — AutoCAD tarzı (📝 2B Çizim düğmesi)**
- Ayrı tam ekran çizim alanı; telefonda otomatik saklanır, geri al / ileri al
- **Çiz:** çizgi (zincirleme; X/Y, uzunluk ve açı yazarak), daire (merkez + çap), yay (3 nokta), dikdörtgen (köşe + genişlik/yükseklik), hizalı ölçü, yazı
- **Düzenle:** kırp (AutoCAD hızlı kırp), uzat, ofset, radyus (iki çizgi arası köşe yuvarlama, 0 = keskin köşe), taşı, kopyala (çoklu), döndür / döndürerek kopyala, ayna (aslı kalsın / silinsin), sil, seç
- **Yakalama:** uç nokta, orta nokta, merkez, kesişim, çeyrek, ızgara (0,5 / 1 / 5 / 10 mm), orto modu. Dokunurken parmağın altı büyüteçte gösterilir; parmağı kaydırıp doğru yere oturtup bırakınca nokta konur
- **Katmanlar:** renk, çizgi tipi (sürekli, gizli, eksen), gizle, kilitle, etkin katman, seçileni katmana taşı
- **Dosya:** DXF kaydet / aç (LINE, CIRCLE, ARC, LWPOLYLINE + bulge, POLYLINE, TEXT, MTEXT), PNG kaydet
- **🧊 3B parça yap:** kapalı şekiller (uçları birleşen çizgi / yaylar ve daireler) kalınlık verilerek 3B kroki parçasına çevrilir; iç içe olan delik olur
- Kısıtlar 2B çizimde yok (kroki editöründe var); ölçüler ilişkisel değil (çizim değişince ölçü yazısı güncellenir ama ölçü şekli sürüklemez)

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

**Hesap ve dışa aktarma (Hesap sekmesi)**
- Malzeme seç (PLA, ABS, PETG, naylon, ahşap, alüminyum, çelik, paslanmaz, pirinç, bakır, titanyum): hacim, yüzey alanı, **ağırlık**, ağırlık merkezi, genel ölçü. Tam dolu katı varsayılır
- **Parça listesi (CSV)**: Excel'de açılır (Türkçe, noktalı virgül ayraçlı)
- **DXF**: ön / yan / üst görünüş, mm. Katmanlar: GORUNEN (düz), GIZLI (kesik), EKSEN (delik eksenleri). AutoCAD, FreeCAD, LibreCAD vb. açar. STEP yok (uygulama ağ tabanlı çalışır, gerçek katı çekirdeği değil)

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
- `tests/` — testler: `node tests/logic.test.mjs` ve `node tests/sketch.test.mjs`
- `App.js`, `viewerHtml.js`, `package.json` — eski React Native / Expo sürümü (2. aşama; güncellenmedi)

## Yol haritası

1. ~~Kutu / silindir + ölçü girişi~~
2. ~~Çoklu parça, birleştirme, delik açma~~
3. ~~Geri al, yeni şekiller, döndürme, kaydetme, STL, sesli komut~~
4. ~~Kroki çizip kalınlık verme / döndürme~~
5. ~~Çoğaltma, ölçü etiketleri, ölçüm, kesit, parça yönetimi, birimler~~
6. ~~Kroki yayları, eğim, kabuk, delik deseni, montaj, teknik resim (PNG / PDF)~~
7. Sıradaki (isteğe bağlı): birleşik kroki (birden çok şekil), kroki kısıtları, delik / iç ölçülendirme, teknik resimde Y/Z kesiti ve delik konum ölçüleri
