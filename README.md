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
- **Mürekkep ayırma:** kağıt arka planı morfolojik kapamayla bulunur (el / telefon gölgesi silinir), mavi / renkli tükenmez rengiyle ayrılır, çizgili / kareli defter satırları ve kenar boşluğundaki basılı sayfa numaraları atılır
- Gölge temizlenir, küçük işaretler ve el yazısı rakamlar ayıklanır, kalem izi inceltilir, çizgiler takip edilip **düz çizgi / yay / daire** olarak tanınır; yataya / dikeye yakın çizgiler düzlenir, yakın uçlar birleştirilir, yayın teğet devamı ve kılçıklar temizlenir
- Sonuç 2B çizime normal varlık olarak gelir (düzenlenebilir). **📏 Ölçekle**: bir çizgiye dokunup gerçek ölçüsünü yazınca bütün çizim ölçeklenir. **🧊 3B** düğmesi kapalı şekilleri kalınlık verip 3B parçaya çevirir (içteki daire delik olur)
- **🔢 Ölçü rakamlarını oku** (açık gelir): kağıda elle yazılmış ölçü rakamları telefonda çalışan küçük bir yapay zekâ ile okunur (turuncu kutuyla gösterilir), çizgi olarak gelmez. Her rakam en yakın çizgiye (uzunluk), daireye (çap) veya yaya (yarıçap) eşlenir; listeden yanlış olan kapatılır, **Ölçüleri uygula** ile en uzun çizgi ölçeği belirler, diğerleri esnetilir, ölçüler (daire / yay için Ø / R ölçüsü) eklenir
- Rakamlar düz, yan (90° / 270°) ya da ters yazılmış olabilir; ters / yan duran glifler yapay zekâ tarafından reddedilir (15 ↔ 51 karışmaz), **Ø işareti** (ayrı ya da rakama bitişik) okunur ve çap olarak işaretlenir
- **📐 Parça yorumu (Temiz parça):** çizim bir parça olarak anlaşılır — dış şeklin kutusu (ölçü uzatma çizgilerine göre), her köşenin biçimi (keskin / radyüs / pah; çizimden ya da köşe yanındaki rakamdan), delikler (daireler) ve kılavuz çizgisiyle bağlı Ø rakamları. Kenar yanındaki rakam o kenarın ölçüsü olur (yatay ve dikey ölçek ayrı, el çizimi oransız olsa da). Yazılmayan ölçüler (ör. delik konumu) çizimden orantıyla tahmin edilir ve kartta "≈ çizimden" diye gösterilir; yazıdan gelenler "✍ yazından". Kartta genişlik, yükseklik, köşe tipi / ölçüsü, delik çapı / konumu düzeltilir, delik eklenip silinir; önizleme anında güncellenir. **Çizime aktar** temiz, kapalı dış şekli, delikleri ve ölçüleri (genişlik, yükseklik, R, pah, Ø, delik konumları — "Ölçü" katmanında) çizer. **Çizgiler olduğu gibi** ile eski davranış (ham çizgiler + ölçü eşleme) seçilebilir
- Sınırlar: bu bir tahmindir — dikdörtgen tabanlı parçalar (köşeleri radyüslü / pahlı, delikli) için tasarlandı; karmaşık dış şekiller için "Çizgiler olduğu gibi" kullanılmalı. Çizgiye değen rakam okunmayabilir; harfler (R, M, x) okunmaz; kart değerleri her zaman kontrol edilmeli

**₺ Akıllı Üretim Maliyeti (Maliyet sekmesi, ya da Hesap → Ağırlık ve maliyet)**
- **Fiyat uydurulmaz:** malzeme kg fiyatı (ya da Kesim optimizasyonundaki profil boy fiyatı), işçilik ve makine saat ücretleri, kaynak teli / gaz / elektrot fiyatı ve ekstra giderleri kullanıcı girer; bu cihazda saklanır, her projede kullanılır. Girilmeyen kalem "eksik bilgi" listesine düşer, toplama katılmaz ve toplam EKSİK diye işaretlenir
- **Hammadde:** net kütle Ağırlık modülünden (gerçek 3B hacim × yoğunluk); ham parça: blok / çubuk / boru + işleme payı, sac açınımı + yerleşim firesi, profillerde Kesim optimizasyonuyla bulunan boy sayısı. Fire = ham − net, fire maliyeti ayrıca gösterilir; hurda satış fiyatı girilirse düşülür
- **Süreler (tahmini, varsayımlar değiştirilebilir):** testere kesim adedi, lazer kesim boyu / kalınlığa göre hız, büküm adedi, CNC ve torna talaş hacmi / talaş kaldırma hızı, delik adedi ve derinliği, kaynak süresi (Kaynak sekmesindeki onaylı plan), dikiş taşlama. **Makineler:** testere, lazer kesim, büküm, kaynak, CNC freze, torna, delme, taşlama — modelde bulunanlar kendiliğinden seçilir, açılıp kapatılabilir, süre elle girilebilir, hazırlık süresi parti başına
- **Ekstra giderler:** elektrik, sarf, nakliye, montaj, paketleme, diğer — adet başı ya da parti başı
- **Rapor:** hammadde (fire dahil), fire maliyeti, işçilik, makine, kaynak sarfı, ekstralar, genel üretim maliyeti, birim maliyet, sabit / değişken ayrımı
- **Adet:** 1, 10, 50, 100 ya da istenen adet; sabit giderler adede bölünür, profiller her adet için birlikte yeniden optimize edilir (adet başına harcanan boy azalır); adet karşılaştırma tablosu
- **Akıllı maliyet optimizasyonu (kural tabanlı, doğrulanabilir hesaplar):** fiyatı girilmiş aynı türdeki malzemelere geçiş (dayanımı düşükse "doğrulama gerekir"), daha büyük partide birim maliyet, plaka gibi parçada bloktan CNC yerine lazer kesim, dönel parçada CNC yerine torna, kaynak yöntemi karşılaştırması, talaş oranı yüksek parçalar, kendine ait hacmi olmayan gereksiz parça, profil ve sac firesi; "mevcut maliyet → önerilerle → tahmini tasarruf"
- **📄 PDF maliyet raporu:** bütün kalemler, işlemler, adet tablosu, öneriler ve hesaplama varsayımları

**⚙ CNC freze — takım yolu ve G-kodu (⚙ CNC sekmesi, ya da Hesap → CNC freze)**
- Modelin üstten görünen yüzeyi yükseklik haritasına çevrilir (3 eksen dik işleme); takımın modele değmeden gidebileceği bölge kesin Öklid uzaklık alanıyla bulunur
- **İşlemler:** yüzey alma (zikzak), **kaba boşaltma** (Z seviyeleri, düz taban seviyeleri otomatik eklenir, modelden ofset konturlar içten dışa, yan / taban payı), **duvar ve taban ince işleme** (pay sıfır son kontur, cep tabanları tamamen), **3B paralel ince işleme** (küresel / düz uç, drop-cutter, dik geçişlerde noktalar sıklaştırılır), **delik delme** (dik yuvarlak delikler standart matkapla; derin delikte G83 gagalama, boydan boya uç payı)
- **Takımlar:** düz parmak, küresel uç, matkap; çap, ağız sayısı, kesme boyu, devir, ilerleme, dalma; malzemeye göre önerilen kesme değerleri (Vc, diş başı ilerleme, makine en yüksek devri)
- **Stok ve sıfır:** yan / üst pay ve alt bağlama payı; G54 sıfırı stok üst ön-sol köşe, üst yüz ortası ya da alt köşe
- **Simülasyon:** malzeme kaldırma animasyonu (takım görünür), işlenmiş parça; **kalan malzeme** (kırmızı) ve **modele dalma** kontrolü; takım boyu yetersizliği, üstten görünmeyen (alttan girinti) bölge, standart olmayan delik uyarıları; tahmini süre
- **G-kodu:** Fanuc (Haas, Mitsubishi, Syntec uyumlu), Mach3 / Mach4 / LinuxCNC, GRBL; ondalık noktalı koordinatlar, satır numarası seçeneği, Türkçe karakter yok; GRBL'de takım değişiminde M0 bekleme ve açık delme döngüsü. **⬇ İndir** (.nc / .tap / .gcode) → OTG ile USB belleğe → makine
- **📄 CNC iş kartı (PDF):** stok, sıfır, takım listesi (S / F), işlem sırası, uyarılar, kontrol listesi
- Sınırlar: 3 eksen (4. / 5. eksen yok), tek bağlama; bağlama aparatı ve takım tutucu çarpışması hesaplanmaz; kesme değerleri başlangıç değeridir

**⚙ Mekanizma: dişli, bağıntılar, motor, çarpışma (⚙ Dişli düğmesi, Hareket sekmesi)**
- **Dişli çark:** evolvent düz dişli (20° basınç açısı); modül, diş sayısı, kalınlık, mil deliği Ölçü sekmesinden; bölüm / dış / diş dibi çapı yazılır. **Eş dişliyi ekle**: doğru eksen mesafesinde (m·(z₁+z₂)/2), dişler kavraşacak açıda; ilk dişli bir gövdeye menteşeyle bağlıysa eşi de bağlanır ve dişli bağıntısı kurulur
- **Bağıntılar:** dişli (ters yön, z₁/z₂), iç dişli, kasnak / kayış / zincir (d₁/d₂), kremayer (bir turda π·m·z kayma), vida (adım × ağız), serbest oran; ters yön seçeneği; iki yönlü (sürülen itilince sürücü de döner); çelişen kapalı döngü eklenmez
- **Motor:** döner eklem + devir (d/dk); bağlı eklemlerin devri / kayma hızı yazılır; motorla sürekli çalıştırma ve 1 tur video
- **Çarpışma kontrolü:** motor bir tur (36 konum) ya da oynatma hareketi (24 konum) boyunca hareket eden parçalar birbirine giriyor mu (gerçek hacim kesişimi; değen yüzeyler sayılmaz); konum, parça çifti, batma derinliği; dokununca o konum ve bölge gösterilir

**🧱 B-Rep — Open CASCADE (OCCT) geometri motoru (🧱 B-Rep sekmesi, ya da Hesap → B-Rep)**
- Gerçek OCCT kullanılır: Open CASCADE Technology'nin WebAssembly derlemesi (`vendor/occt`, replicad-opencascadejs, LGPL 2.1). Ayrı bir işçide (Web Worker) çalışır, ekran donmaz; ilk işlemde bir kez indirilir (10–25 MB), sonra tarayıcı önbelleğinden gelir. Sunucu gerekmez
- **Model → B-Rep:** kutu, silindir, küre, koni, boru (yuvarlama, pah, eğim dahil) analitik yüzeyli tam katı olarak kurulur; kroki, süpürme, loft, sac, iskelet ve ağ parçaları ekrandaki üçgen ağdan dikilerek katıya çevrilir (yüzeyler düzlemsel üçgen, 20 000 üçgen sınırı). Parçalar uygulamadaki sırayla birleştirilir / oyulur
- **Doğrulama:** BRepCheck ile geçerlilik, katı / kabuk / yüz / kenar / köşe sayısı, tam hacim (ekrandaki ağ hacmiyle karşılaştırma), açık ağ ve ters yönlü katı uyarısı; **🩺 Doğrula ve onar** (ShapeFix)
- **Boolean:** iki parça seçilip hassas birleştirme (A + B), çıkarma (A − B), kesişim (A ∩ B); sonuç yeni parça olur, A ve B gizlenir
- **Yuvarlama / pah:** seçili parçanın tüm / üst / alt / dikey / dairesel kenarlarına; geçersiz sonuç (yarıçap fazla büyük) reddedilir
- OCCT ile üretilen parçalar B-Rep metniyle projede saklanır (`bk`), taşınıp döndürülünce sonraki işlemlerde tam geometriyle kullanılır; ekranda Three.js ağı olarak görünür (eski sürümler bu parçayı normal ağ parçası olarak açar)
- **Görüntü köprüsü:** OCCT üçgenlemesi (yüz grupları + gerçek B-Rep kenar çizgileri) Three.js'te "OCCT görüntüsü" olarak gösterilir
- **CAM verisi:** yüz türleri (düzlem, silindir, koni, torus, B-spline), kenar türleri, silindirik yüzlerin çapı ve ekseni, eksenlere dik düzlem sayısı
- **Dosya:** STEP dışa aktarma (tam B-Rep, AP214) ve içe aktarma; IGES içe aktarma (occt-import-js; yüzeyler üçgenlenip katıya dikilir). **IGES dışa aktarma yok:** kullanılan OCCT derlemesinde IGES yazıcısı bulunmuyor (özel derleme gerekir)
- Sınırlar: koni / torus yüzlerinin ayrıntılı parametreleri bu derlemede okunamıyor (yalnız türü); tek tek kenar seçerek yuvarlama henüz yok (kenar grupları var); büyük modellerde telefonda işlem birkaç saniye sürebilir

**⚙ 4 ve 5 eksen CNC (⚙ CNC sekmesi → 4 eksen / 5 eksen)**
- 3 eksen CAM aynen duruyor (⚙ CNC → 3 eksen). 4 / 5 eksen ayrı bir katmandır: `kin.js` (kinematik), `cam5.js` (stratejiler), `coll5.js` (çarpışma + voksel simülasyon), `post5.js` (G-kodu), `cam5-ui.js` + `cam5-worker.js` (arayüz, işçi). Ayarlar projeyle kaydedilir
- **Makineler / kinematik:** 4. eksen divizör (A, X boyunca; ayna + punta) ve döner tabla (B, Y ekseni); 5 eksen tabla-tabla (A+C, B+C), kafa-kafa (C+A), kafa-tabla (B kafa + C tabla). Döner eksen limitleri, dönme merkezleri, pivot boyu, doğrusal eksen limitleri düzenlenir; hatalı yapılandırma hesaplanmaz. Ters / ileri kinematik kapalı formül (Paden–Kahan), iki çözümden limit içinde ve öncekine en yakını; sürekli C ekseni tur atlamaz
- **Stratejiler:** 4 eksen indeksli (her açıda 3 eksen motoru), 4 eksen eş zamanlı döner işleme (X + A helis, kaba + ince), 5 eksen 3+2 (eğim/dönüş açılarıyla sabit takım yönü), 5 eksen eş zamanlı yüzey ince işleme (küresel uç, yüzey normali + lead / tilt, en büyük eğim sınırı, adım başına en çok 3° yön değişimi). Her stratejinin sınırı ekranda yazılır
- **Güvenli bağlantı:** takım ekseni boyunca geri çekilme, güvenli küre (5 eksen) / güvenli silindir (divizör) üstünde yön ara değerlemesi, eksen boyunca yaklaşma
- **Çarpışma:** kesici, sap, tutucu ve iş mili burnu (düz uçlu silindirler) ↔ parça (üçgen ağ), bağlama (ayna, punta, mengene çeneleri) ve tabla; hızlı harekette parçaya giriş; küresel uçta yüzeye dalma; eksen limitleri. Makine gövdesi, beşik gövdesi, takım değiştirici ve ara stok modellenmez (ekranda yazar). Çarpışma / limit varsa G-kodu engellenir
- **Simülasyon:** hacimsel (voksel) talaş kaldırma; kalan fazla malzeme ve parçaya dalma; takım yolu, talaş sonucu ve makine hareketi (tabla eksenlerinde parça döner, kafa eksenlerinde takım eğilir) görünümleri, eksen değerleri, çarpışan noktalar kırmızı. Simülasyon ve G-kodu aynı takım yolu verisinden üretilir (testle doğrulanır)
- **Kontrolcüler:** Fanuc 30i/31i-B5 (G43.4 TCP), Siemens 840D sl (TRAORI), LinuxCNC (makine koordinatı, G93), Fanuc / Haas 4. eksen ve Mach3 / Mach4 (G93); GRBL döner eksen için reddedilir. TCP'siz kontrolcüye eş zamanlı 5 eksen kodu üretilmez. Örnek programlar: `docs/cnc5-ornekler/` (`node tools/gen_cnc5_samples.mjs`)
- **Doğrulanmadı:** hiçbir post gerçek bir makinede denenmedi; program başlığında yazar. İlk çalıştırma kumanda simülasyonu, tek blok ve düşük ilerlemeyle, yetkin operatör kontrolünde yapılmalı

**🔩 CNC torna (⚙ CNC sekmesi → Torna)**
- Ayrı modül: `lathe.js` (saf hesap) + `lathe-ui.js` (arayüz, 3B). Freze (3 eksen) ve 4 / 5 eksen kodu değiştirilmedi; CNC sekmesinde yalnız "Torna" düğmesi eklendi.
- **Makine:** 2 eksen (X çap, Z boyuna). Üç genel profil: Fanuc 0i-T uyumlu arka tip / ön tip taret, basit ISO kumanda (G76 ve G41/G42 yok). X sınırı, Z sınırı, en çok / en az devir, taret yeri sayısı. **Yok:** C ekseni, Y ekseni, canlı takım, punta, karşı iş mili (arayüzde açıkça yazar; ileride yetenek bayraklarıyla eklenebilir).
- **Ham ve parça:** ham çap / boy / ön fazla / boru iç çapı / aynadan çıkış, ayna çenesi ve gövdesi. Parça X-Z profili (dış ve iç, doğru + yay R, G02 / G03 yönü), 2B önizleme; örnek parça (kademeli mil M24) ve modelden alma (döndürme krokisi ya da silindir). Ham ↔ parça karşılaştırması (parça hamdan büyük, iç profil dış profile değiyor, parça aynadan çıkışı aşıyor vb.).
- **Takım kütüphanesi:** dış / iç (bara) / alın / kanal / kesme / vida / matkap; taret yeri (T), ofset no, uç yarıçapı, yaklaşma ve iz kenarı açısı, kesme kenarı, kanal genişliği, erişim, bara çapı ve en küçük delik, matkap çapı ve uç açısı, takım yönü (R / L / N), iş mili yönü, Fanuc sanal uç numarası.
- **11 operasyon:** dış çap, iç çap, alın, kaba talaş kaldırma (profil, G71 tipi), finiş (profil, G70 tipi), kanal (gagalamalı), kesme / ayırma, delik delme (gagalamalı), konik, profil (kopya, G73 tipi kaydırmalı pasolar), vida (G76 ya da G32). Her birinin parametreleri: kesme hızı (G96) ya da devir (G97), ilerleme (mm/dev), talaş derinliği, finiş payı, takım, taraf, başlangıç / bitiş Z ve çap, gagalama, güvenli mesafe ve geri çekilme.
- **Takım yolu:** uç yarıçapı telafisi CAM'de (ofset; dış köşede R = rn yay, iç köşede kesişim) ya da kumandada (G41 / G42, kontur programlanır); kaba seviyeler profile ve paya göre; takımın iniş açısını aşan bölgeler köprülenir ve kanal operasyonu gerektiği yazılır; baranın giremediği dar delik bölgesi işlenmez; takım değişiminden önce X referansa çekilme.
- **Simülasyon:** eksenel simetrik 0,1 mm ızgarada takım biçimiyle (uç yarıçapı, kenar açıları) malzeme kaldırma; 3B'de dönen ayna ve ham, takım, operasyon renkli yol; başlat / durdur / hız / konum / önceki-sonraki operasyon; sonunda fazla kesim ve kalan malzeme ölçülür. İsteğe bağlı OCCT doğrulaması: hedef parça ve simülasyon sonucu dönel katı kurulur, hacim ve iki yönlü fark.
- **Çarpışma ve güvenlik:** hızlı harekette malzemeye çarpma, takım tutucu / bara gövdesi, ayna çenesi ve gövdesi, makine X / Z sınırları, dış takımla merkezi geçme, güvenli mesafe, yanlış yön (sol takım), takım türü – operasyon uyumu, erişim, devir / ilerleme sınırları. **Kontrol edilmeyenler** (taret, diğer takımlar, punta, gerçek 3B tutucu, helisel diş, kesme kuvveti) arayüzde listelidir.
- **G-kodu (Fanuc uyumlu post, `LATHE_POSTS` ile genişletilebilir):** G00 G01 G02 G03 G18 G21 G28 G32 G76 G40 G41 G42 G50 G54 G96 G97 G99, M03 M04 M05 M08 M09 M30, T takım + ofset. Çap ya da yarıçap programlama; güvenli başlangıç / bitiş blokları; takım ve operasyon açıklamaları; ekranda gösterme, .nc / .txt indirme. Hata varken indirme kapalı. G20 (inç) bu sürümde reddedilir.
- **Tutarlılık:** üretilen G-kodu uygulama içinde geri okunur (G76 aynı algoritmayla açılır) ve simülasyonun kullandığı hareket listesiyle karşılaştırılır.
- **Doğrulanmadı:** hiçbir torna programı gerçek bir tezgâhta denenmedi; program başlığında yazar.

**📐 Mühendislik analizi (📐 Analiz sekmesi, ya da Hesap → Mühendislik analizi)**
- Akış: analiz türü → birim sistemi (SI-mm, SI-m, ABD) → malzeme (kaynaklı kütüphane + özel malzeme) → ağ yoğunluğu → mesnet / yük / ısıl sınırlar → çöz → sonuç ağacı → rapor. Kurulum ve sonuç özetleri projeyle kaydedilir; geometri, malzeme, yük ya da ağ değişince eski sonuç "ESKİ" olarak işaretlenir
- **Yapısal statik:** kuvvet (yüzey / nokta), basınç, moment (en küçük normlu düğüm kuvvetleriyle tam moment), öz ağırlık; yer değiştirme, von Mises, kullanım oranı, emniyet katsayısı (akma varsa; mesnet / yük komşuluğu hariç, tekil gerilme uyarısıyla), mesnet tepkisi ve denge hatası
- **Modal:** doğal frekanslar (Hz) ve mod şekilleri (toplanmış kütle, alt uzay yinelemesi)
- **Termal:** kararlı durum (sabit sıcaklık, ısı akısı, taşınım, hacimsel ısı; enerji dengesi) ve zamana bağlı (geri Euler)
- **Doğrusal burkulma:** geometrik rijitlik K_G ile özdeğer; kritik yük katsayıları ve modlar (ideal geometri uyarısıyla)
- **Desteklenmeyen (açıkça):** doğrusal olmayan malzeme / büyük şekil değişimi, temas ve cıvatalı bağlantı. Montaj parçaları ortak düğümlerle TAM YAPIŞIK bağlanır
- **Ağ:** küp elemanlar (kaba / orta / ince / çok ince), parça başına hacim hatası, ince kesit ve kaba ağ uyarıları, 3 ağlı yakınsama çalışması
- **Doğrulama:** `tests/fea2.test.mjs` analitik referanslar (çekme çubuğu, ankastre kiriş kuvvet + moment, modal 1. ve 2. frekans, ısı iletimi doğrusal / üretim / taşınım, levha soğuması, Euler burkulması), birimler, hata durumları, yakınsama. Ölçülen hatalar rapora yazılır
- Görsel büyütme her zaman yazılır ("×N büyütüldü, gerçek en büyük yer değiştirme …"); mod şekilleri birimsizdir

**🔮 Geleceğimi Göster — sanal test ortamı (🔮 Gelecek sekmesi, ya da Hesap → Geleceğimi göster)**
- **Akış:** tasarımı bitir → ölçüler → her parçanın malzemesini seç → **✓ Tasarımımı onayla** → **🔮 GELECEĞİMİ GÖSTER** açılır. Onaydan sonra tasarım değişirse yeniden onay ister. Tasarım test ortamına kopyalanır; orijinal hiçbir zaman değiştirilmez
- **Gerçek sonlu eleman analizi (FEA):** katı geometri küp elemanlara (voxel) bölünür; 8 düğümlü uyumsuz modlu hekzahedral eleman (eğilmede kilitlenmez), doğrusal-elastik, çok katmanlı (multigrid) ön koşullu eşlenik gradyan çözücü, arka plan iş parçacığında (Worker). Eleman boyu ölçülerle hizalanır (kalınlık yuvarlama hatası olmasın). Ağ: Hızlı / Normal / İnce
- **Kurulum:** sabitleme (yüz seç ya da 3B modelde dokun), yükler (N ya da kg, 6 yön, yüze ya da dokunulan noktaya), öz ağırlık
- **Dayanım:** von Mises gerilmesi, güvenlik katsayısı (akma / σ), en büyük yer değiştirme, boy/sehim, denge kontrolü (mesnet tepkisi = yük), kritik bölgeler (3B'de işaretli), tekillik ayrımı (yük / mesnet çevresi hariç değer + tepe değer), ağ yakınsama kontrolü
- **3B:** gerilme ya da yer değiştirme renk haritası, hesaplanan şekil değişiminin animasyonu (abartma oranı yazılı), test öncesi / sonrası / karşılaştırma
- **Titreşim:** ilk 3 doğal frekans (alt uzay yinelemesi), girilen frekansla oran, dinamik büyütme, rezonans uyarısı, mod şekli animasyonu
- **Sıcaklık:** serbest termal genleşme, sabitlemeler genleşmeyi engellerse ısıl gerilme (FEA, farklı malzemeler dahil), malzeme sıcaklık sınırları; çelik (EN 1993-1-2) ve 6061-T6 için sıcaklıkta dayanım düşüşü — verisi olmayan malzemede sonuç uydurulmaz
- **Ömür (yaklaşık):** yorulma (Shigley S-N, Marin yüzey katsayısı, Goodman), günlük tekrar girilirse yıl aralığı (saçılma ×3), aşınma (Archard, katsayı aralığıyla); kullanım sıklığı girilmezse süre iddia edilmez
- **Tasarımını geliştir:** daha dayanıklı (kritik bölgeye malzeme katmanı), daha hafif (yük taşımayan malzemeyi çıkar, yük yolu korunur), malzeme alternatifleri (doğrusal süperpozisyon; Maliyet sekmesindeki fiyatlarla ekonomik karşılaştırma). Her alternatif yeniden FEA ile doğrulanır, ayrı kopya olarak saklanır, STL indirilebilir
- **🤖 Akıllı test asistanı:** her öneri "neden" ve "öneri" ile
- **📄 PDF test raporu:** tasarım, malzemeler, kuvvetler, koşullar, gerilme / deformasyon, kritik bölgeler, güvenlik katsayısı, titreşim / sıcaklık / ömür, öneriler, alternatifler, doğrulama tablosu
- **Doğrulama (`tests/fea.test.mjs`):** konsol kiriş sehim %0,1 ve gerilme %1,4, eksenel çubuk, öz ağırlık %0,4, ısıl uzama %1,2, 1. doğal frekans %0,2, denge, iki malzemeli çubuk, multigrid = Jacobi, ağ hizalama
- **Sınırlar:** akma sonrası davranış, burkulma, temas / cıvata ön yükü, kaynak dikişi, darbe, sıcaklık dağılımı hesaplanmaz; ince sac / ince cidarlı profiller küp ağda iyi temsil edilmeyebilir (uyarı verilir). Sonuçlar profesyonel mühendislik onayının yerine geçmez

**🧩 Akıllı Montaj Sırası ve 3B Patlatılmış Görünüm (Montaj planı sekmesi, ya da Hesap → Montaj sırası)**
- **Tek dokunuş:** "▶ MONTAJ SIRASINI BAŞLAT" — parçalar tanınır, bağlantılar bulunur, sıra çıkarılır, 3B görünüm açılır
- **Parça tanıma:** önce parça adından (cıvata, somun, rondela, pim, mil, rulman, flanş, burç, kapak, plaka…), sonra standart ölçüden (60xx / 62xx / 63xx rulman, ISO 7089 rondela), sonra şekilden (ince uzun silindir → cıvata / mil, yassı disk → flanş); kaynağı (isim / ölçü / şekil / tür) her parçada yazılır, şekilden tanıma "tahmin" olarak gösterilir
- **Bağlantılar:** Kaynak sekmesinde onaylanan kaynaklar (birlikte hareket eden grup), Montaj eşleşmeleri, delikler (delik ekseninin geçtiği parçalar = cıvatalı bağlantı, sıkma boyu gerçek kalınlıktan). Birbirine değen ama bağlantısı modelde olmayan parçalar **kullanıcıya sorulur** (kaynak / cıvata / geçme / yok); cevaplar projeye kaydedilir, tahmin edilmez
- **Montaj sırası:** gerçek geometriyle sökme analizi — her turda altı ana yönden biriyle hiçbir parçaya çarpmadan çıkabilen en üstteki birim sökülür; sökme sırasının tersi montaj sırasıdır. Delikteki cıvata çıkmadan geçtiği parçalar sökülemez. Hiçbir yönde çıkamayan parçalar "fiziksel olarak mümkün olmayan montaj" olarak gösterilir
- **3B patlatılmış görünüm:** her parça kendi takılma ekseni boyunca, gerçek konumundan uzaklaşır (yönü değişmez); miktar kaydırıcıyla ayarlanır; döndür / yakınlaştır; parçaya dokununca bilgisi (tanıma, adım, boyut, hacim, bağlantılar, sorunlar) açılır
- **Adım adım animasyon:** ⏮ baştan, ◀ önceki, ▶ / ⏸ oynat-durdur, ▶▶ sonraki; takılan parça turuncu, yerindekiler gri, sıradakiler soluk
- **Bağlantı elemanları:** her delik için ISO 273 geçiş deliğinden M ölçüsü (kılavuz deliğinden dişli bağlantı), cıvata boyu (sıkma + 2 rondela + somun + diş payı, standart boya yuvarlanmış), rondela ve somun; modelde çizili cıvata varsa "mevcut", yoksa "EKSİK", delik çapı tabloda yoksa "ölçü belirlenemedi" (ölçü uydurulmaz)
- **Montaj kontrolü:** çakışan parçalar, delik eksenine göre eğik duran cıvata / pim (yanlış yön), cıvata başı ya da somun tarafı başka parçayla kapalı (erişilemeyen nokta), sağlanamayan eşleşmeler, imkânsız montaj
- **📄 PDF montaj raporu:** patlatılmış görünüm, montaj talimatı (adım adım, her adımda sıkılacak elemanlar), parça listesi, bağlantı elemanı listesi, sorunlar, cevap bekleyen bağlantılar

**⚖ Akıllı Ağırlık ve Ağırlık Merkezi (Ağırlık sekmesi, ya da Hesap → Ağırlık)**
- Her parça kendi malzemesiyle (Çelik, Paslanmaz, Alüminyum, Bakır, Pirinç, Titanyum, PLA / ABS / PETG / Naylon, ahşaplar) ya da parçaya girilen **özel yoğunlukla** hesaplanır: kütle = gerçek 3B hacim × yoğunluk. Malzemesi seçilmeyen parçalar genel malzemeyle hesaplanır ve bu yazılır; geçersiz yoğunlukta parça toplama katılmaz (uydurma yok)
- Hacim gerçek geometriden: her parçanın kendine ait katısı = parça − sıralamada kendinden sonraki parçalar (CSG). Böylece oyuklar düşülür, iç içe hacim iki kez sayılmaz; içi boş profil yalnızca et kalınlığıyla sayılır. Ayrım yapılamazsa parça "tahmini" diye işaretlenir
- Toplam ağırlık (kg, kN), malzemeye ve türe göre (profil, sac, boru, dolu malzeme) dağılım, parça ağırlıkları ve parça ağırlık merkezleri
- **Ağırlık merkezi** X / Y / Z = Σ(mᵢ·cᵢ) / Σmᵢ. 3B'de kırmızı-beyaz ağırlık merkezi sembolü (model içinden de görünür), zemine kesik çizgi, destek alanı çizgisi (yeşil / sarı / turuncu / kırmızı) ve ayak yükleri; sahnede durduğu için model döndürülünce birlikte döner, model değişince yeniden hesaplanır. İstenirse her sekmede görünür
- **Denge:** zemine değen yüzlerin zarfı = destek alanı; ağırlık merkezi izdüşümü içeride mi, en yakın kenara uzaklık, devrilme açısı (atan(uzaklık / yükseklik)) ve yönü; ağırlığın bir yana kayması, uzun-dar yapı, yük taşımayan ayak; ayak yükleri (rijit gövde, en küçük norm dağılım)
- **Taşıma ve kaldırma:** kaldırma ağırlığı, plan alanının en az %30'unu kaplayan en üst yüzeyden 4 kaldırma noktası önerisi ve nokta yükleri, 60° / 45° sapan bacak kuvveti ve kanca yüksekliği, kancanın ağırlık merkezinin üstünde kalıp kalmadığı, forklift notu; mühendislik doğrulaması gereken durumlar açıkça yazılır. Kaldırma noktaları 3B'de gösterilebilir
- **📄 PDF ağırlık raporu:** toplam, malzeme listesi, parça ağırlıkları, ağırlık merkezi, denge, kaldırma, 3B görüntü

**🔥 Akıllı Kaynak Planlama (Kaynak sekmesi → KAYNAK BİRLEŞİMLERİNİ BUL)**
- Olası kaynak birleşimleri 3B modelden bulunur: iskelet içindeki eleman uçları (köşe, T, gönye = alın; dikiş yolu profil kesitinin çevresi, gönyede eğik kesit) ve birbirine değen metal parçalar (sac–profil, profil–profil). Temas bölgesi yüz yüze örtüşme kırpılarak ya da çizgi temasından (boru plakaya yatık) çıkarılır; bölgenin dış sınırı dikiş olur. Yan yana aynı düzlemde duran yüzler temas sayılmaz, plastik / ahşap parçalar kaynağa girmez
- Bulunanlar **öneridir**: her kaynak tek tek ya da topluca onaylanır, düzenlenir, silinir (geri getirilebilir); elle kaynak eklenir (iki parçanın en yakın noktasına). Yeniden tespitte onaylar ve girilen ölçüler korunur; model değişince uyarı çıkar
- Her kaynak: tür (köşe / alın / T), dikiş (sürekli / aralıklı: dikiş boyu l, aralık e), taraf (çepeçevre / iki / tek taraf; uzunluk geometriden otomatik, elle değiştirilebilir), ölçü (a ya da s), yöntem. Torç erişimi zor olanlar Üretim kontrolüyle aynı ölçütle işaretlenir
- 3B gösterim (Kaynak sekmesinde): dikişler model üzerinde renkli tüp (turuncu köşe, kırmızı alın, mor T; soluk = öneri, sarı = seçili) ve harf etiketiyle; karta dokununca kamera kaynağa gider
- Uzunluk: onaylı kaynakların bağlantı uzunluğu ve aralıklı dikişte gerçek kaynak uzunluğu ayrı; türlere göre dağılım
- Sarf (tahmini): kesit alanı (köşe / T = a², alın = 0,577·s² + aralık·s) + fazla dolgu %, malzeme yoğunluğu, yöntem verimi ve kayıp payı ile; MIG/MAG teli (kg, metre), TIG çubuğu, örtülü elektrot (adet, kg), koruyucu gaz, ark süresi ve iş süresi; öteki yöntemle karşılaştırma. **Ölçüsü girilmeyen kaynak hesaba katılmaz**, uygulama ölçü uydurmaz
- Kaynak sırası önerisi: alt şase → dikme / ara bağlantılar → üst şase → çaprazlar → tamamlayıcı (sac, braket); her grupta karşılıklı (dengeli) sıra; puntalama, geri adım, aralıklı çalışma tavsiyeleri
- **Teknik resim:** onaylı kaynaklar ISO 2553 sembolüyle (ok, referans çizgisi, köşe üçgeni / V, ○ çepeçevre, a ölçüsü — girilmediyse a?, uzunluk ya da n×l(e), kuyrukta ISO 4063 yöntem no ve kaynak harfi) en iyi göründüğü görünüşte çizilir; Resim sekmesinden aç / kapa
- **📄 PDF kaynak raporu:** özet, türlere göre dağılım, uzunluklar, sarf ve süre, 3B görüntü, kaynak listesi, sıra, uyarılar
- Sınırlar: kaynak ölçüsünü, boğaz kalınlığını, malzeme uyumunu ve yapısal yeterliliği onaylamaz (mühendislik değerlendirmesi gerekir); sarf ve süre tahminidir

**🏭 Akıllı Üretilebilirlik Kontrolü (Üretim sekmesi → ÜRETİMİ ANALİZ ET, ya da Hesap → Üretim)**
- Model gerçek geometriyle (dünya koordinatındaki üçgenler, BVH ağacı) incelenir; analiz sırasında ilerleme çubuğu gösterilir
- **Çakışma:** iki parçanın ortak malzeme hacmi ızgara örneklemesi + ışın paritesi ile ölçülür; yüzeyi değen parçalar (kaynak / montaj teması) çakışma sayılmaz (iç noktalar yüzeyden en az 0,05 mm içeride olmalı, en az 0,2 mm batma). Çakışma bölgesinin kalınlığı (kaç mm kaydırmalı) ve malzemeye giriş derinliği (içi boş profilde farklıdır) ayrı verilir
- **Boşluk:** tam üçgen–üçgen en kısa uzaklık; 0,05–2 mm arası "neredeyse değiyor" uyarısı, eşleşmesi olup değmeyen parçalar, hiçbir parçaya değmeyen (havada) parçalar
- **Montaj:** parçalar 6 ana eksende tek tek sökülmeye çalışılır (projeksiyon ızgarasıyla süpürme testi); kaynaklı ve tek gövde gruplar birlikte hareket eder. Takılamayan parçalar uyarılır, önerilen montaj sırası verilir. Döndürerek takma denenmez (raporda yazar)
- **Kaynak erişimi (uyarı):** iskelet bağlantılarında ve birbirine değen metal profil / sac parçalarda, her kenardan yarım küre içinde torç ışınları (Ø12 mm meme, 150 mm boy) atılır; açık yön oranı düşükse "erişim zor" uyarısı. Çelik–alüminyum teması kritik sayılır
- **Delik / cıvata:** oyuk silindirlerde cıvata başı ve somun alanı (Ø1,8·d × 1,2·d), kenar mesafesi (1,2·d), standart matkap çapı, hiçbir parçayı kesmeyen oyuk
- **Ölçü / profil:** boş / sıfır ölçü, uygulanamayan iskelet ölçüsü, geçersiz alt kuşak, uygulanamayan gönye, stok boyundan (kesim optimizasyonundaki stok boyu) uzun ya da çok kısa eleman, ince boru et kalınlığı, sac büküm uyarıları, çelişen montaj eşleşmeleri
- Sonuçlar 🔴 kritik / 🟠 uyarı / 🟢 öneri kartlarıdır: başlık, açıklama, parça, konum, çözüm önerisi. Karta dokununca kamera bölgeye gider, problem bölgesi kırmızı kutu, ilgili parçalar turuncu görünür; parça seçilebilir, "çözüldü" işaretlenebilir, yeniden analiz edilebilir. Model değişince "sonuçlar eski" uyarısı çıkar
- "Yapılan kontroller" listesi: her kontrolün yapıldığı / kısmen yapıldığı / yapılmadığı açıkça yazılır (ör. kapalı olmayan yüzeyde çakışma testi yapılamaz, yapısal dayanım kapsam dışı)
- **Parçalar modu:** otomatik (profil, sac, boru ve eşleşmeli parçalar ayrı; iç içe basit parçalar tek gövde) ya da "her parça ayrı"
- **📄 PDF rapor:** özet, genel sonuç, 3B görüntü, bütün bulgular ve yapılan kontroller
- Sınırlar: ön kontroldür, kesin hata iddiası değildir; yapısal dayanım, kaynak dikiş kalitesi ve toleranslar kapsam dışı; kaynak planlama ayrı bir özellik olacak

**✂ Akıllı kesim optimizasyonu (profil iskelet → Tür → ✂ Kesim optimizasyonu, ya da Hesap → Üretim)**
- Kesilecek parçalar **çizimden otomatik** alınır (projedeki bütün profil iskeletlerinin kesim listesi; gönyeli boylar uzun kenardan) ya da **elle** eklenir (profil, malzeme, ad, boy, adet). İkisi birlikte kullanılabilir
- Farklı kesit, et kalınlığı ya da malzeme ayrı grupta optimize edilir (40×40×2 ile 40×40×3 asla aynı boydan kesilmez). Uygulamanın iskelet profillerine ek olarak L, U, lama, dolu mil ve "Diğer" (adını yaz) seçilebilir
- Ayarlar: stok boyu (6000 mm), testere kesim payı (3 mm), uç düzeltme payı, saklanacak en kısa artık (300 mm), profil boy fiyatı
- Algoritma gerçek 1B kesim stoğu optimizasyonu: FFD, BFD, **MBS** (her boyu en iyi dolduran parça kümesi, sınırlı sırt çantası DP) ve takaslı yerel iyileştirme birlikte denenir, en az boy + artığı tek boyda toplayan sonuç seçilir. **Teorik alt sınır** hesaplanır: sonuç ona eşitse "daha az profille yapılamaz ✅" yazar. Hiçbir boy stok uzunluğunu aşamaz (testere payı dahil; son parça boyun ucuna denk gelirse son kesim sayılmaz)
- Görsel kesim planı: her 6 m boy ayrı çizilir, parçalar renkli, uzunluk ve kesim sırası numaralı; sonda kalan boy (yeşil = stoğa, kırmızı = fire). Aynı kesim düzenindeki boylar "4 boy aynı kesim" diye gruplanır
- Rapor: parça sayısı, alınacak boy sayısı ve uzunluk, kesilen toplam, testere kaybı, stoğa kalan, gerçek fire, fire %, maliyet; "Bu iş için X adet 6 metrelik profil almanız yeterli" cümlesi
- **♻ Artık stok:** kesimden sonra "artık stoğunu güncelle" ile kullanılabilir kalanlar (boy, profil, malzeme, et kalınlığı, durum) saklanır; sonraki işte yeni boy almadan önce bunlar kullanılır. Elle artık eklenebilir
- Dışa aktarma: **PDF kesim planı** (A4, yazdırılabilir, operatöre verilir), **CSV** kesim listesi (Excel'de açılır)
- Sınırlar: tek stok boyu (gruba göre farklı boy ve tedarikçi fiyatı için altyapı hazır, arayüzü sonra); kesim açısı (gönye) boyu etkilemez, uzun kenar ölçüsü kullanılır

**2B Çizim — AutoCAD tarzı (📝 2B Çizim düğmesi)**
- Ayrı tam ekran çizim alanı; telefonda otomatik saklanır, geri al / ileri al
- **Çiz:** çizgi (zincirleme; X/Y, uzunluk ve açı yazarak), daire (merkez + çap), yay (3 nokta), dikdörtgen (köşe + genişlik/yükseklik), hizalı ölçü, **⌀ çap / R yarıçap ölçüsü** (daireye / yaya dokun, yazının yerini seç), **∠ açı ölçüsü** (iki çizgi + dokunulan açı bölgesi: 60° ya da 120°), **▨ tarama** (kapalı alanın içine dokun; içteki delikler boş kalır, açı / aralık ayarlı, çapraz kafes), yazı
- **Düzenle:** kırp (AutoCAD hızlı kırp), uzat, ofset, radyus (iki çizgi arası köşe yuvarlama, 0 = keskin köşe), taşı, kopyala (çoklu), döndür / döndürerek kopyala, ayna (aslı kalsın / silinsin), sil, seç, **▦ dizi** (seçileni çoğalt: dikdörtgen = satır × sütun ve aralıklar; dairesel = adet, toplam açı, merkeze dokun, döndürerek ya da döndürmeden)
- **📐 Ölçü ver:** çizgiye dokunup uzunluğunu yaz; dokunulan uç tarafındaki her şey birlikte kayar (AutoCAD esnet gibi: dikdörtgenin eni değişince kenar dik kalır, delik yerinde kalır). Daireye çap, yaya yarıçap verilir (bağlı çizgi uçları takip eder). İsteğe bağlı ölçü yazısı otomatik eklenir. El çiziminden gelen taslağı tam ölçülü yapmak için
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

**Parmakla kontrol (kamera ile, dokunmadan)**
- 🖐 düğmesi (eski arayüzde üst çubuk, yeni arayüzde çizim alanındaki yüzen düğmeler ve menü, tekstil sayfasında üst çubuk): kamera izni istenir, kamera açılır, el algılama başlar; küçük bir önizlemede el iskeleti (21 nokta) ve durum görünür
- **İşaret parmağı** imleci gezdirir. **Başparmak + işaret parmağını birleştirmek** fare tuşuna basmak gibidir: çizer / sürükler, ayırınca bırakır; kısa birleştirme dokunmadır (düğme, sekme, parça seçimi). **Açık avuç** duraklatır. **İşaret + orta parmak** yukarı / aşağı: kaydırır, çizim alanında yakınlaştırır
- Uygulamanın kendi çizim işleyicilerine gerçek fare olayı olarak gider: 3B sahne, kroki, 2B çizim, tekstil tuvalleri ve bütün düğmeler değişiklik olmadan çalışır. Fare ve dokunma aynı anda çalışmaya devam eder
- Ayarlar: kamera aç / kapat, parmakla çizim aç / kapat (kapalıyken yalnız imleç), hassasiyet (1–10), kalibrasyon (rahat çalışılan alanın iki köşesi), durum göstergeleri. Ayarlar cihazda saklanır
- Titreme için 1€ süzgeci, tek karelik yanlış algılamaya karşı sıçrama süzgeci, eşikte titreyen parmaklara karşı giriş / çıkış eşiği; el 0,3 sn'den kısa kaybolursa çizgi kopmaz
- El algılama: MediaPipe Hand Landmarker (WebAssembly), depodaki `vendor/` kopyasından yüklenir. **Görüntü yalnız cihazda işlenir; kaydedilmez, hiçbir yere gönderilmez.** Kamera yalnız düğmeye basınca açılır; kapatınca kamera ve model tamamen serbest bırakılır
- Yeni hareket eklemek için: `window.__hand.engine.addGesture({ id, label, holdMs, test: ({ f, lm, features }) => … })` ve `window.__hand.onGesture(id, fn)`

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

- Parmakla kontrol: hareket mantığı ve uygulamayla bağlantısı yapay el verisiyle, MediaPipe'ın yüklenip kare işlemesi sahte kamera görüntüsüyle sınandı; **gerçek kamera ve gerçek elle doğruluk / eşik ayarı sınanmadı** (ayrıntı: `docs/KALITE-RAPORU.md` bölüm 10). Kaydırıcı, açılır liste ve dosya seçici gibi tarayıcının kendi denetimleri yapay işaretçiyle çalışmaz (hassasiyet için − / + düğmeleri var). Tek el izlenir. İlk açılışta yaklaşık 20 MB (kütüphane + model) iner, sonra tarayıcı önbelleğinden gelir; SIMD desteklemeyen eski tarayıcılarda çalışmaz
- Pah ve yuvarlama yalnızca kutu ve silindirde var (küre, koni, boru, kroki parçalarında yok)
- Kroki: yay üç nokta ile çizilir (serbest eğri / spline yok); yaylar ve daire çokgen parçalara bölünür (6° adım, daire 48 kenar). Çizgiler birbirini kesemez (şekiller iç içe ya da ayrı olabilir); döndürmede tek şekil olur
- Kabuk ve eğim yalnızca düz kutu / silindirde (küre kabuğu var, eğim yok); eğimli ya da yuvarlamalı parçada kenar işlemi ve kabuk yapılamaz
- Kabuğun iç boşluğu kendinden önceki tüm parçaları keser
- Montaj yüzeyin ortalama düzlemine göre yapar; eğri yüzlerde (silindir yan yüzü gibi) dokunduğun noktadaki yüz yönü kullanılır
- Teknik resimde delik ölçüsü yalnızca eksene paralel (Ø / kare) delikler için; eğik, küre ve koni oyuklarına yazılmaz. Gizli çizgiler çok ayrıntılı modelde (çok kenarlı) atlanır. Kesit yalnızca X ekseninde; Y/Z kesiti için sayfadaki izometrik/kesit seçimi yok
- Kesit görünümünde kesilen yüzey turuncu "iç yüz" olarak gösterilir (gerçek dolu kesit yüzeyi değil)
- Renkli parçalarda oyuğun iç duvarı tabanın rengini alır
- Çok sayıda parçada (kırk üstü dizi vb.) birleştirme yavaşlar
- Montaj sırası yalnızca altı ana eksen yönünde takmayı dener (döndürerek / eğik takma, esnek parça, anahtar boşluğu yaklaşık); vida dişi modellenmez, cıvata ölçüsü delik çapından bulunur

## Dosyalar

- `index.html` — arayüz kabuğu (görünüm, stiller)
- `yeni/` — **yeni arayüz** (deneme): `yeni/index.html`, `yeni/ui.css`, `yeni/shell.js`. Aynı `app.js` ve hesap modüllerini kullanır, onlara dokunmaz. Telefonda tam ekran çizim alanı, alt bölümler (Tasarım · Analiz · Üretim · Tekstil), alttan açılan özellik paneli, araç listesi, menü ve komut arama (Ctrl K); bilgisayarda solda araçlar ve parçalar, sağda özellikler. Projeler aynı tarayıcı kaydını paylaşır. Adres: `…/cizim-atolyesi/yeni/`
- `app.js` — uygulama: 3D sahne, CSG, kenar çizgileri, panel, taşıma, ölçüm, kesit, sesli komut
- `sketch.js` — kroki editörü (2D tuval) ve doğrulama
- `logic.js` — test edilebilir mantık: parça varsayılanları, geri al geçmişi, STL yazıcı, sesli komut çözücü, birimler, kroki dönüşümleri (yay, yuvarlak köşe), kopya / ayna / dizi, pah geometrisi, teknik resim yerleşimi ve PDF yazıcı
- `photo2d.js`, `photoimport.js` — fotoğraftan çizim: görüntü işleme (mürekkep ayırma, eşik, inceltme, yol takibi, çizgi / yay / daire uydurma, rakam okuma) ve ekranı
- `part2d.js` — elle çizilmiş parçayı yorumlama (kutu, köşe radyüs / pah, delik + Ø, ölçek) ve temiz ölçülü çizim üretimi
- `cad2d.js`, `cad2d-geom.js` — 2B çizim modu ve saf geometrisi (kesişim, kırp, uzat, ofset, radyus, DXF)
- `cam.js`, `cam-ui.js` — CNC: yükseklik haritası, uzaklık alanı, takım yolları, simülasyon, G-kodu, iş kartı
- `mech.js` — evolvent dişli profili, mekanizma bağıntıları
- `fea2.js`, `fem-run.js`, `fem-worker.js`, `fem-ui.js` — mühendislik analizi: basınç / moment yükleri, termal (kararlı / geçici), doğrusal burkulma, malzeme kütüphanesi, birimler, ağ kalitesi, yakınsama, Analiz sekmesi
- `lathe.js`, `lathe-ui.js` — CNC torna: profil ve ofset geometrisi, 11 operasyon, eksenel simetrik simülasyon, çarpışma / sınır kontrolü, Fanuc torna postu, G-kodu geri okuma, arayüz ve 3B
- `kin.js`, `cam5.js`, `coll5.js`, `post5.js`, `cam5-run.js`, `cam5-worker.js`, `cam5-ui.js` — 4 / 5 eksen CNC: kinematik, stratejiler, çarpışma, voksel simülasyon, son işlemciler, arayüz
- `occt.js`, `occt-ops.js`, `occt-worker.js`, `occt-ui.js` — OCCT B-Rep köprüsü (katı kurma, Boolean, yuvarlama / pah, doğrulama, STEP / IGES, Three.js'e üçgenleme, CAM için topoloji), işçi ve B-Rep sekmesi; `vendor/` — üçüncü taraf WebAssembly kütüphaneleri (bkz. `vendor/README.md`)
- `fea.js`, `fea-worker.js`, `sim-ui.js` — Geleceğimi Göster: sonlu eleman çözücü (voxel H8, multigrid), modal, ısıl, yorulma / aşınma, alternatifler, arayüz ve PDF
- `assembly.js`, `assembly-ui.js` — montaj sırası: parça tanıma, delik → cıvata, sökme analizi, patlatma / animasyon, PDF
- `tekstil.html`, `tx/` — **Tekstil ve Moda** çalışma alanı (dokuma / konfeksiyon + triko). Aşama 1–11 tamam: proje türleri, koleksiyon, ürün, renk, beden tablosu, kumaş / iplik / aksesuar, föy özeti, revizyon, JSON yedek; teknik moda çizimi (ön / arka / yan, eğri, simetri, katman, ölçü, 13 giysi şablonu, 15 detay, PNG / SVG / vektör PDF); dokuma kalıbı (gömlek ve etek temel blokları, dikiş payı, çıt, pens, bölme / birleştirme, dikiş eşleşmesi kontrolü, 1:1 A4 döşemeli PDF); beden yayma / grading (blok ölçüsünden ya da orantılı, kişiye özel ölçü, beden yuvası); triko (numune, örgü şeması editörü: düz / ters / askı / delik / saç örgüsü / jakar, kontroller, tekrar, PDF / talimat / CSV, ilmek ve sıra hesabı, eksiltme / artırma planı, bedenlere göre ilmek sayıları); malzeme kütüphanesi (hazır kartlar, iplik numarası dönüşümleri), kalıptan kumaş metresi, trikodan iplik gramajı, bedene göre maliyet; kumaş yerleşimi / kesim planı (otomatik + elle, açık en / katlı, havlı kumaş, desen eşleştirme, verim / fire, ölçekli PDF ve 1:1 SVG, tüketim plan boyundan). Triko makine profilleri (doğrulama zorunlu), uyumluluk kontrolü, operatör programı, delikli kart şeması, knitout + yapısal benzetim (Stoll / Shima kapalı biçimleri üretilmez); 3B önizleme (kalıptan bolluk, basitleştirilmiş vücut, ÖNİZLEME etiketli) ve kumaş dökümlülük benzetimi (referans ölçümle karşılaştırılmadan doğrulanmış sayılmaz); üretim föyü (operasyon listesi, dakika, maliyet kartı, sipariş ve malzeme ihtiyacı, çok sayfalı PDF; eksik girdi hesaplanmaz); kalıp DXF (AAMA / ASTM D6673 düzeni) içe / dışa aktarma. Test eşlemesi: docs/KALITE-RAPORU.md bölüm 7. Plan ve durum: [docs/TEKSTIL-MIMARI.md](docs/TEKSTIL-MIMARI.md). `ws.js` — açılıştaki çalışma alanı seçimi.
- `hand/` — **parmakla kontrol**: `gestures.js` (saf hareket motoru: 21 nokta → imleç ve işaretçi olayları, süzgeçler, kalibrasyon), `pointer.js` (yapay işaretçi), `camera.js`, `tracker.js` (MediaPipe bağdaştırıcısı), `control.js` (yönetici), `ui.js`, `hand.css` (düğme, önizleme, panel, imleç). Sayfalara yalnız bir `<script type="module">` ile bağlanır; `app.js` ve çizim modülleri değişmedi
- `vendor/` — üçüncü taraf kütüphanelerin birebir kopyaları (OCCT WASM, three.js 0.160.0, three-mesh-bvh 0.6.0, three-bvh-csg 0.0.7); uygulama dış siteden kod yüklemez. `tools/vendor-check.mjs` kopyaları npm paketleriyle karşılaştırır (CI).
- `tests/` — testler. Tek komut: `npm test` (birim), `npm run test:e2e` (tarayıcı), `npm run test:all`; ayrıntı [TESTLER.md](TESTLER.md), sonuçlar [docs/KALITE-RAPORU.md](docs/KALITE-RAPORU.md). `.github/workflows/ci.yml` — her push'ta birim, gerçek OCCT WASM ve E2E işleri
- `App.js`, `viewerHtml.js`, `package.json` — eski React Native / Expo sürümü (2. aşama; güncellenmedi)

## Yol haritası

1. ~~Kutu / silindir + ölçü girişi~~
2. ~~Çoklu parça, birleştirme, delik açma~~
3. ~~Geri al, yeni şekiller, döndürme, kaydetme, STL, sesli komut~~
4. ~~Kroki çizip kalınlık verme / döndürme~~
5. ~~Çoğaltma, ölçü etiketleri, ölçüm, kesit, parça yönetimi, birimler~~
6. ~~Kroki yayları, eğim, kabuk, delik deseni, montaj, teknik resim (PNG / PDF)~~
7. Sıradaki (isteğe bağlı): birleşik kroki (birden çok şekil), kroki kısıtları, delik / iç ölçülendirme, teknik resimde Y/Z kesiti ve delik konum ölçüleri

## Lisans

Telif Hakkı (c) 2026 Deniz Kuşaklı. Tüm hakları saklıdır. Depo herkese açık olsa da kod izinsiz kopyalanamaz ya da kullanılamaz; ayrıntı [LICENSE](LICENSE). Üçüncü taraf kütüphaneler kendi lisanslarıyla dağıtılır ([vendor/README.md](vendor/README.md)).
