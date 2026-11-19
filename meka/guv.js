// Mekatronik Mühendisliği — 6. aşama: güvenlik. ISO 12100 risk değerlendirmesi kaydı, ISO 13849-1 gerekli performans
// seviyesi (PLr) ve güvenlik işlevi doğrulaması (alt sistemlerin üretici PL / PFHD verisiyle), MTTFD yardımcı hesabı,
// IEC 60204-1 kontrol listesi. Saf fonksiyonlar; DOM gerektirmez (tests/meka-guv.test.mjs).
//
// Kaynaklar (birden çok bağımsız kaynakla karşılaştırıldı; doğrulanamayan tablo kullanılmadı):
//   [ISO 12100]     Tehlike türleri (Ek B), risk değerlendirmesi, üç adımlı risk azaltma yöntemi (doğası gereği güvenli
//                   tasarım → koruyucu önlemler → kullanım bilgisi); kullanım bilgisi diğer önlemlerin yerine geçmez.
//   [ISO 13849-1]   Ek A risk grafiği (S, F, P → PLr a…e); 2023 baskısında tehlikeli olayın olasılığı düşük ve gerekçeli
//                   ise PLr bir seviye düşürülebilir. F2: maruz kalma 15 dakikada birden sık ya da toplam süre çalışma
//                   süresinin 1/20'sinden fazla. Tablo 2: PL – PFHD aralıkları. 6.2.2 (2023): seri alt sistemlerin PFHD
//                   değerleri toplanır; işlevin PL'si toplam PFHD'nin aralığını ve en düşük alt sistem PL'sini aşamaz.
//                   Ek C: nop = dop·hop·3600 / tcycle; MTTFD = B10D / (0,1·nop); T10D = B10D / nop; B10D bilinmiyorsa 2·B10.
//                   MTTFD seviyeleri: düşük 3–10, orta 10–30, yüksek 30–100 yıl.
//                   Bileşen MTTFD / DC / kategori verisinden PL hesaplamak (Ek K tablosu) bu araçta yapılmaz: bunun için
//                   IFA'nın ücretsiz SISTEMA yazılımı kullanılmalı; burada alt sistemin PL / PFHD değeri üreticiden girilir.
//   [IEC 60204-1]   Makine elektrik donanımı (2016) madde başlıklarına göre kontrol listesi.

const fin = (v) => typeof v === 'number' && Number.isFinite(v);
export const PL_SIRA = ['a', 'b', 'c', 'd', 'e'];
const plNo = (p) => PL_SIRA.indexOf(p);

export const TEHLIKE_TUR = {
  mekanik: 'Mekanik (ezilme, kesilme, sıkışma, çarpma, dolanma, fırlama)',
  elektrik: 'Elektrik (gerilimli parça, arıza gerilimi, ark)',
  termik: 'Termik (sıcak / soğuk yüzey, alev)',
  gurultu: 'Gürültü',
  titresim: 'Titreşim',
  isinim: 'Işınım (lazer, UV, elektromanyetik)',
  madde: 'Malzeme ve maddeler (kimyasal, toz, basınçlı akışkan)',
  ergonomi: 'Ergonomi (duruş, zorlanma, görüş)',
  ortam: 'Makinenin kullanıldığı ortamla ilgili',
  birlesik: 'Tehlikelerin birleşimi',
};
export const YASAM_FAZ = { tasima: 'Taşıma / kurulum', devreye: 'Devreye alma', calisma: 'Normal çalışma', ayar: 'Ayar / ürün değişimi', ariza: 'Arıza giderme', temizlik: 'Temizlik', bakim: 'Bakım', sokum: 'Söküm / hurdaya çıkarma' };
export const S_AD = { S1: 'S1 — hafif (genellikle geri dönüşlü) yaralanma', S2: 'S2 — ağır (genellikle geri dönüşsüz) yaralanma ya da ölüm' };
export const F_AD = { F1: 'F1 — seyrek / kısa süreli maruz kalma', F2: 'F2 — sık / sürekli ya da uzun süreli maruz kalma' };
export const P_AD = { P1: 'P1 — belirli koşullarda kaçınmak mümkün', P2: 'P2 — kaçınmak neredeyse imkânsız' };
export const ROL = { giris: 'Giriş (algılama)', mantik: 'Mantık (değerlendirme)', cikis: 'Çıkış (güç kesme / tahrik)', diger: 'Diğer' };
export const DURDURMA = { '': '—', 0: 'Durdurma kategorisi 0 (gücü hemen kes)', 1: 'Durdurma kategorisi 1 (kontrollü durdur, sonra kes)', 2: 'Durdurma kategorisi 2 (kontrollü durdur, güç kalır)' };

// Ek A risk grafiği
const GRAF = { S1F1P1: 'a', S1F1P2: 'b', S1F2P1: 'b', S1F2P2: 'c', S2F1P1: 'c', S2F1P2: 'd', S2F2P1: 'd', S2F2P2: 'e' };
export function plr(S, F, P, dusukOlasilik = false, gerekce = '') {
  const temel = GRAF[S + F + P];
  if (!temel) throw new Error('S, F ve P seçilmeli');
  const ind = !!dusukOlasilik && String(gerekce || '').trim().length >= 10 && temel !== 'a';
  return { temel, plr: ind ? PL_SIRA[plNo(temel) - 1] : temel, indirim: ind, gerekceEksik: !!dusukOlasilik && !ind && temel !== 'a' };
}
// F için yardımcı öneri: maruz kalma aralığı (dakika) ve toplam süre payı (çalışma süresine oranı, %)
export function fOner(aralikDk, payYuzde) {
  const a = fin(aralikDk) && aralikDk > 0 ? aralikDk : null, p = fin(payYuzde) && payYuzde >= 0 ? payYuzde : null;
  if (a == null && p == null) return null;
  return (a != null && a < 15) || (p != null && p > 5) ? 'F2' : 'F1';
}
// Tablo 2: PFHD (1/saat) → PL
export function pfhPL(pfh) {
  if (!fin(pfh) || pfh <= 0) return null;
  if (pfh < 1e-7) return 'e';
  if (pfh < 1e-6) return 'd';
  if (pfh < 3e-6) return 'c';
  if (pfh < 1e-5) return 'b';
  if (pfh < 1e-4) return 'a';
  return '-';   // PL a aralığının dışında
}
export const PL_ARALIK = { a: '1×10⁻⁵ ≤ PFHD < 1×10⁻⁴', b: '3×10⁻⁶ ≤ PFHD < 1×10⁻⁵', c: '1×10⁻⁶ ≤ PFHD < 3×10⁻⁶', d: '1×10⁻⁷ ≤ PFHD < 1×10⁻⁶', e: '1×10⁻⁸ ≤ PFHD < 1×10⁻⁷' };

// Ek C: mekanik / elektromekanik bileşen MTTFD
export function mttfd({ B10d, B10, dop, hop, tcycle }) {
  let b = fin(B10d) && B10d > 0 ? B10d : fin(B10) && B10 > 0 ? 2 * B10 : NaN;
  const varsayim = !(fin(B10d) && B10d > 0) && fin(b);
  if (!fin(b)) throw new Error('B10D (ya da B10) girilmeli');
  if (!(fin(dop) && dop > 0 && dop <= 366)) throw new Error('Yılda çalışma günü 1–366 olmalı');
  if (!(fin(hop) && hop > 0 && hop <= 24)) throw new Error('Günde çalışma saati 1–24 olmalı');
  if (!(fin(tcycle) && tcycle > 0)) throw new Error('Çevrim süresi sıfırdan büyük olmalı');
  const nop = (dop * hop * 3600) / tcycle, M = b / (0.1 * nop), T10 = b / nop;
  const seviye = M < 3 ? 'yetersiz (3 yıldan az)' : M < 10 ? 'düşük' : M < 30 ? 'orta' : 'yüksek';
  return { B10d: b, varsayim, nop, MTTFd: M, T10d: T10, seviye };
}

/* ---------- Proje verisi ---------- */
export const KONTROL = [
  ['5.3', 'Her besleme için kilitlenebilir ana ayırma (ayırıcı) cihazı var'],
  ['5.4', 'Bakım / müdahale sırasında beklenmedik yol almayı önleyen enerji kesme düzeni var'],
  ['6.2', 'Gerilimli parçalara doğrudan temasa karşı koruma (muhafaza, yalıtım) sağlandı'],
  ['6.3', 'Arıza durumunda dolaylı temasa karşı koruma (beslemenin otomatik kesilmesi) sağlandı — 4. aşama hesabı'],
  ['7.2', 'Tüm devrelerde aşırı akım koruması var — 4. aşama hesabı'],
  ['7.5', 'Enerji kesilip geri geldiğinde makine kendiliğinden tehlikeli biçimde yeniden çalışmıyor'],
  ['8.2', 'Koruma iletkeni devresi: tüm açıkta iletken parçalar koruma iletkenine (PE) bağlı'],
  ['9.2.2', 'Her durdurma işlevi için durdurma kategorisi (0 / 1 / 2) risk değerlendirmesine göre belirlendi'],
  ['9.2.3', 'Başlatma, durdurma ve işletme türü seçimi gibi kumanda işlevleri güvenli çalışıyor'],
  ['10.2', 'Kumanda düğmelerinin renk ve işaretleri uygun; kırmızı / sarı birleşimi yalnız acil durdurmada kullanılıyor'],
  ['10.7', 'Acil durdurma: kırmızı düğme, sarı zemin, kendiliğinden kilitlenen, kolay erişilebilir; durdurma kategorisi 0 ya da 1'],
  ['11', 'Kumanda panosu yerleşimi ve muhafaza koruma sınıfı ortam koşullarına uygun'],
  ['13', 'Kablolama: iletkenler tanıtılmış / numaralandırılmış, koruma iletkeni yeşil-sarı'],
  ['16', 'Uyarı levhaları (elektrik tehlikesi) ve ekipman etiketleri takıldı'],
  ['17', 'Teknik dokümantasyon hazır: şemalar, kablo listesi, klemens planı, kullanım ve bakım bilgisi'],
  ['18.2', 'Otomatik kesme koşulları doğrulandı (koruma iletkeni sürekliliği, çevrim empedansı ölçümü)'],
  ['18.3', 'Yalıtım direnci testi yapıldı ve kaydedildi'],
  ['18.4', 'Gerilim (dayanım) testi yapıldı ve kaydedildi'],
  ['18.5', 'Artık gerilimlere karşı koruma doğrulandı'],
  ['18.6', 'İşlevsel testler yapıldı (özellikle acil durdurma ve güvenlik işlevleri)'],
];
export const KONTROL_DURUM = { '': 'Kontrol edilmedi', uygun: 'Uygun', degil: 'Uygun değil', yok: 'Uygulanamaz' };

export function guvEmpty() { return { tehlikeler: [], fonksiyonlar: [], kontrol: {}, nextId: 1 }; }
const str = (v, n) => (typeof v === 'string' ? v.slice(0, n) : '');
export function guvSanitize(o) {
  const G = guvEmpty();
  if (!o || typeof o !== 'object') return G;
  const ids = new Set();
  for (const f of Array.isArray(o.fonksiyonlar) ? o.fonksiyonlar.slice(0, 100) : []) {
    if (!f || !fin(f.id) || ids.has(f.id)) continue;
    ids.add(f.id);
    const alt = [];
    for (const a of Array.isArray(f.altsistemler) ? f.altsistemler.slice(0, 20) : []) {
      if (!a || !fin(a.id) || ids.has(a.id)) continue;
      ids.add(a.id);
      alt.push({ id: a.id, rol: ROL[a.rol] ? a.rol : 'diger', ad: str(a.ad, 80), PL: PL_SIRA.includes(a.PL) ? a.PL : '', PFH: fin(a.PFH) && a.PFH > 0 ? a.PFH : NaN, kategori: ['B', '1', '2', '3', '4'].includes(a.kategori) ? a.kategori : '', kaynak: str(a.kaynak, 120) });
    }
    G.fonksiyonlar.push({ id: f.id, ad: str(f.ad, 80) || 'Güvenlik işlevi', tetik: str(f.tetik, 200), guvenliDurum: str(f.guvenliDurum, 200), durdurma: ['0', '1', '2'].includes(String(f.durdurma)) ? String(f.durdurma) : '', altsistemler: alt });
  }
  const fids = new Set(G.fonksiyonlar.map((f) => f.id));
  for (const t of Array.isArray(o.tehlikeler) ? o.tehlikeler.slice(0, 300) : []) {
    if (!t || !fin(t.id) || ids.has(t.id)) continue;
    ids.add(t.id);
    G.tehlikeler.push({
      id: t.id, tur: TEHLIKE_TUR[t.tur] ? t.tur : 'mekanik', faz: YASAM_FAZ[t.faz] ? t.faz : 'calisma', bolge: str(t.bolge, 80), aciklama: str(t.aciklama, 300),
      S: S_AD[t.S] ? t.S : '', F: F_AD[t.F] ? t.F : '', P: P_AD[t.P] ? t.P : '', dusuk: !!t.dusuk, gerekce: str(t.gerekce, 300),
      tasarim: str(t.tasarim, 300), koruyucu: str(t.koruyucu, 300), bilgi: str(t.bilgi, 300), fonk: Array.isArray(t.fonk) ? [...new Set(t.fonk.filter((x) => fids.has(x)))] : [],
    });
  }
  for (const [k] of KONTROL) { const v = o.kontrol?.[k]; if (v && KONTROL_DURUM[v.durum] !== undefined) G.kontrol[k] = { durum: v.durum, not: str(v.not, 200) }; }
  G.nextId = Math.max(fin(o.nextId) ? o.nextId : 1, ...[...ids].map((i) => i + 1), 1);
  return G;
}
export function tehlikeEkle(G, from = {}) { const t = { id: G.nextId++, tur: 'mekanik', faz: 'calisma', bolge: '', aciklama: '', S: '', F: '', P: '', dusuk: false, gerekce: '', tasarim: '', koruyucu: '', bilgi: '', fonk: [], ...from }; G.tehlikeler.push(t); return t; }
export function fonkEkle(G, from = {}) { const f = { id: G.nextId++, ad: 'Güvenlik işlevi ' + (G.fonksiyonlar.length + 1), tetik: '', guvenliDurum: '', durdurma: '', altsistemler: [], ...from }; G.fonksiyonlar.push(f); return f; }
export function altEkle(G, f, from = {}) { const a = { id: G.nextId++, rol: 'giris', ad: '', PL: '', PFH: NaN, kategori: '', kaynak: '', ...from }; f.altsistemler.push(a); return a; }

/* ---------- Değerlendirme ---------- */
export function tehlikeDegerlendir(t) {
  const k = [], add = (ok, duzey, metin) => k.push({ ok, duzey: ok ? (duzey === 'bilgi' ? 'bilgi' : 'tamam') : duzey, metin });
  let r = null;
  if (t.S && t.F && t.P) r = plr(t.S, t.F, t.P, t.dusuk, t.gerekce);
  else add(false, 'hata', 'Risk tahmini eksik: S, F ve P seç');
  if (r?.gerekceEksik) add(false, 'hata', 'Olasılık indirimi için gerekçe yazılmalı (en az 10 karakter); gerekçesiz indirim yapılmaz');
  if (r?.indirim) add(true, 'bilgi', `Tehlikeli olayın olasılığı düşük (gerekçeli): PLr ${r.temel} → ${r.plr}`);
  const hic = !t.tasarim.trim() && !t.koruyucu.trim() && !t.bilgi.trim() && !t.fonk.length;
  if (hic) add(false, 'hata', 'Risk azaltma önlemi yok (tasarım, koruyucu önlem ya da güvenlik işlevi)');
  else if (!t.tasarim.trim() && !t.koruyucu.trim() && !t.fonk.length) add(false, t.S === 'S2' ? 'hata' : 'uyari', 'Yalnız kullanım bilgisi var: kullanım bilgisi tasarım ve koruyucu önlemlerin yerine geçmez (ISO 12100)');
  if (!t.aciklama.trim()) add(false, 'uyari', 'Tehlike açıklaması boş');
  return { r, kontroller: k, uygun: k.every((c) => c.ok || c.duzey !== 'hata') };
}
export function fonkDegerlendir(f, G) {
  const k = [], add = (ok, duzey, metin) => k.push({ ok, duzey: ok ? (duzey === 'bilgi' ? 'bilgi' : 'tamam') : duzey, metin });
  // PLr: bu işleve bağlı tehlikelerin en yükseği
  const bagli = G.tehlikeler.filter((t) => t.fonk.includes(f.id));
  let PLr = null;
  for (const t of bagli) { try { if (t.S && t.F && t.P) { const r = plr(t.S, t.F, t.P, t.dusuk, t.gerekce).plr; if (PLr == null || plNo(r) > plNo(PLr)) PLr = r; } } catch (e) { /* */ } }
  if (!bagli.length) add(false, 'uyari', 'Bu işleve bağlı tehlike yok: PLr belirlenemiyor (Riskler sekmesinde tehlikeyi bu işleve bağla)');
  else if (PLr == null) add(false, 'hata', 'Bağlı tehlikelerin risk tahmini (S, F, P) eksik');
  // alt sistemler
  const A = f.altsistemler;
  if (!A.length) add(false, 'hata', 'Alt sistem yok: işlevi gerçekleştiren giriş, mantık ve çıkış parçalarını ekle');
  for (const r of ['giris', 'mantik', 'cikis']) if (A.length && !A.some((a) => a.rol === r)) add(false, 'uyari', `${ROL[r]} alt sistemi tanımlanmadı`);
  let eksik = false, top = 0, enDusuk = null;
  for (const a of A) {
    const ad = a.ad || ROL[a.rol];
    if (!a.PL || !fin(a.PFH)) { eksik = true; add(false, 'hata', `"${ad}": üreticinin PL ve PFHD değeri girilmedi (katalog / güvenlik verisi)`); continue; }
    const pb = pfhPL(a.PFH);
    if (pb === '-' ) add(false, 'hata', `"${ad}": PFHD ${a.PFH.toExponential(2)} PL a aralığının da dışında`);
    else if (plNo(pb) < plNo(a.PL)) add(false, 'hata', `"${ad}": girilen PL ${a.PL} ile PFHD ${a.PFH.toExponential(2)} (PL ${pb} aralığı) tutarsız — üretici verisini kontrol et`);
    top += a.PFH;
    if (enDusuk == null || plNo(a.PL) < plNo(enDusuk)) enDusuk = a.PL;
  }
  let PL = null, plToplam = null;
  if (A.length && !eksik) {
    plToplam = pfhPL(top);
    PL = plToplam === '-' ? null : plNo(plToplam) < plNo(enDusuk) ? plToplam : enDusuk;
    add(true, 'bilgi', `Toplam PFHD = ${top.toExponential(2)} 1/saat → PL ${plToplam}; en düşük alt sistem PL ${enDusuk} → işlev PL ${PL || 'yok'}`);
    if (PL && PLr) add(plNo(PL) >= plNo(PLr), 'hata', `Ulaşılan PL ${PL} ≥ gereken PLr ${PLr}`);
    if (plToplam === '-') add(false, 'hata', 'Toplam PFHD PL a aralığının da dışında (≥ 1×10⁻⁴): işlev hiçbir PL\'yi sağlamıyor');
  }
  if (!f.guvenliDurum.trim()) add(false, 'uyari', 'Güvenli durum tanımlanmadı (işlev çalışınca makine hangi duruma geçer?)');
  return { PLr, PL, PFH: A.length && !eksik ? top : null, plToplam, enDusuk, bagli: bagli.length, dogrulandi: !!(PL && PLr && plNo(PL) >= plNo(PLr)), kontroller: k, uygun: k.every((c) => c.ok || c.duzey !== 'hata') };
}
export function guvOzet(G) {
  const T = G.tehlikeler.map((t) => ({ t, d: tehlikeDegerlendir(t) })), F = G.fonksiyonlar.map((f) => ({ f, d: fonkDegerlendir(f, G) }));
  const ks = KONTROL.map(([m, metin]) => ({ m, metin, durum: G.kontrol[m]?.durum || '', not: G.kontrol[m]?.not || '' }));
  const sayi = { uygun: ks.filter((x) => x.durum === 'uygun').length, degil: ks.filter((x) => x.durum === 'degil').length, yok: ks.filter((x) => x.durum === 'yok').length, bos: ks.filter((x) => !x.durum).length };
  const kontroller = [];
  if (!G.tehlikeler.length) kontroller.push({ ok: false, duzey: 'uyari', metin: 'Risk değerlendirmesi boş: makinenin tüm yaşam döngüsü evrelerindeki tehlikeleri listele' });
  for (const x of ks) if (x.durum === 'degil') kontroller.push({ ok: false, duzey: 'hata', metin: `IEC 60204-1 ${x.m}: uygun değil — ${x.metin}` });
  if (sayi.bos) kontroller.push({ ok: false, duzey: 'uyari', metin: `IEC 60204-1 kontrol listesinde ${sayi.bos} madde kontrol edilmedi` });
  const fazlar = new Set(G.tehlikeler.map((t) => t.faz));
  for (const fz of ['calisma', 'bakim', 'temizlik', 'ayar']) if (G.tehlikeler.length && !fazlar.has(fz)) kontroller.push({ ok: false, duzey: 'uyari', metin: `"${YASAM_FAZ[fz]}" evresi için tehlike kaydı yok — bu evreyi de değerlendir` });
  const uygun = T.every((x) => x.d.uygun) && F.every((x) => x.d.uygun) && kontroller.every((c) => c.ok || c.duzey !== 'hata');
  const tam = uygun && G.tehlikeler.length > 0 && F.every((x) => x.d.dogrulandi) && sayi.bos === 0 && kontroller.every((c) => c.ok);
  return { T, F, ks, sayi, kontroller, uygun, tam };
}

/* ---------- Çıktılar ---------- */
const csvq = (v) => { const s = String(v ?? ''); return /[;"\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
export function riskCSV(G) {
  const fAd = new Map(G.fonksiyonlar.map((f) => [f.id, f.ad]));
  const rows = G.tehlikeler.map((t, i) => { let r = null; try { r = t.S && t.F && t.P ? plr(t.S, t.F, t.P, t.dusuk, t.gerekce) : null; } catch (e) { r = null; } return [i + 1, TEHLIKE_TUR[t.tur], YASAM_FAZ[t.faz], t.bolge, t.aciklama, t.S, t.F, t.P, r ? r.temel : '', r?.indirim ? 'evet: ' + t.gerekce : 'hayır', r ? r.plr : '', t.tasarim, t.koruyucu, t.bilgi, t.fonk.map((id) => fAd.get(id)).join(', ')]; });
  return '﻿' + [['No', 'Tehlike türü', 'Yaşam döngüsü evresi', 'Bölge', 'Açıklama', 'S', 'F', 'P', 'PLr (grafik)', 'Olasılık indirimi', 'PLr', 'Tasarım önlemi', 'Koruyucu önlem', 'Kullanım bilgisi', 'Güvenlik işlevi'].join(';'), ...rows.map((r) => r.map(csvq).join(';'))].join('\r\n');
}
export function guvRapor(G, proje = '') {
  const O = guvOzet(G), L = [];
  L.push('ÇİZİM ATÖLYESİ — MEKATRONİK MÜHENDİSLİĞİ GÜVENLİK RAPORU', 'ISO 12100 · ISO 13849-1 · IEC 60204-1' + (proje ? ' · ' + proje : ''));
  L.push('Sonuç: ' + (O.tam ? 'TAMAM (eksik ve hata yok)' : O.uygun ? 'HATA YOK — eksik / doğrulanmamış maddeler var' : 'UYGUN DEĞİL — aşağıdaki hatalara bak'), '');
  L.push('RİSK DEĞERLENDİRMESİ (ISO 12100)');
  const fAd = new Map(G.fonksiyonlar.map((f) => [f.id, f.ad]));
  O.T.forEach(({ t, d }, i) => {
    L.push(`  ${i + 1}. ${TEHLIKE_TUR[t.tur]} · ${YASAM_FAZ[t.faz]}${t.bolge ? ' · ' + t.bolge : ''}`, `     ${t.aciklama || '—'}`);
    L.push(`     Risk: ${t.S || '—'} ${t.F || '—'} ${t.P || '—'} → PLr (güvenlik işlevi kullanılırsa gereken) ${d.r ? d.r.plr + (d.r.indirim ? ' (olasılık indirimiyle, grafik ' + d.r.temel + '; gerekçe: ' + t.gerekce + ')' : '') : '—'}`);
    L.push(`     Önlemler — tasarım: ${t.tasarim || '—'} · koruyucu: ${t.koruyucu || '—'} · bilgi: ${t.bilgi || '—'}${t.fonk.length ? ' · işlev: ' + t.fonk.map((x) => fAd.get(x)).join(', ') : ''}`);
    for (const c of d.kontroller.filter((c) => !c.ok || c.duzey === 'bilgi')) L.push('     ' + (c.ok ? 'ℹ' : c.duzey === 'hata' ? '✗ HATA' : '⚠ UYARI') + ' ' + c.metin);
  });
  L.push('', 'GÜVENLİK İŞLEVLERİ (ISO 13849-1)');
  O.F.forEach(({ f, d }) => {
    L.push(`  ${f.ad}: PLr ${d.PLr || '—'} · ulaşılan PL ${d.PL || '—'} · ${d.dogrulandi ? 'DOĞRULANDI' : 'DOĞRULANMADI'}`);
    L.push(`     Tetikleyen olay: ${f.tetik || '—'} · güvenli durum: ${f.guvenliDurum || '—'}${f.durdurma ? ' · durdurma kategorisi ' + f.durdurma : ''}`);
    for (const a of f.altsistemler) L.push(`     - ${ROL[a.rol]}: ${a.ad || '—'} · PL ${a.PL || '—'} · PFHD ${fin(a.PFH) ? a.PFH.toExponential(2) : '—'}${a.kategori ? ' · kategori ' + a.kategori : ''}${a.kaynak ? ' · kaynak: ' + a.kaynak : ''}`);
    for (const c of d.kontroller.filter((c) => !c.ok || c.duzey === 'bilgi')) L.push('     ' + (c.ok ? 'ℹ' : c.duzey === 'hata' ? '✗ HATA' : '⚠ UYARI') + ' ' + c.metin);
  });
  L.push('', 'IEC 60204-1 KONTROL LİSTESİ', `  Uygun ${O.sayi.uygun} · uygun değil ${O.sayi.degil} · uygulanamaz ${O.sayi.yok} · kontrol edilmedi ${O.sayi.bos}`);
  for (const x of O.ks) L.push(`  [${KONTROL_DURUM[x.durum]}] ${x.m} ${x.metin}${x.not ? ' — not: ' + x.not : ''}`);
  if (O.kontroller.length) { L.push('', 'GENEL KONTROLLER'); for (const c of O.kontroller) L.push('  ' + (c.ok ? '✓' : c.duzey === 'hata' ? '✗ HATA' : '⚠ UYARI') + ' ' + c.metin); }
  L.push('', 'YÖNTEM VE KAYNAKLAR',
    '  [ISO 12100] Tehlike türleri, risk değerlendirmesi ve üç adımlı risk azaltma (tasarım → koruyucu önlem → kullanım bilgisi)',
    '  [ISO 13849-1] Ek A risk grafiği (S, F, P → PLr); PL – PFHD aralıkları; seri alt sistemlerde PFHD toplamı ve en düşük alt sistem PL sınırı',
    '  [IEC 60204-1] Makine elektrik donanımı genel kuralları (madde numaraları 2016 baskısına göre)',
    '', 'Alt sistem PL ve PFHD değerleri üreticinin güvenlik verisidir (sertifikalı cihaz). Bileşenlerden (MTTFD, DCavg, kategori, CCF) PL hesabı bu araçta yapılmaz; IFA SISTEMA ile yapılmalıdır. Görev süresi (mission time) üreticinin verisindeki varsayımdır. Bu rapor yetkin kişilerce yapılması gereken risk değerlendirmesinin ve doğrulamanın (ISO 13849-1 doğrulama / geçerli kılma) yerine geçmez; CE uygunluğu için yetkili güvenlik mühendisinin onayı gerekir.');
  return L;
}

// Örnek (temsilî): dolum istasyonu. Alt sistem PL / PFHD değerleri BOŞ bırakılır — üretici verisi uydurulmaz.
export function guvOrnek() {
  const G = guvEmpty();
  const f1 = fonkEkle(G, { ad: 'Koruyucu kapak kilitlemesi', tetik: 'Koruyucu kapak açılır', guvenliDurum: 'Silindir ve konveyör enerjisiz, yeniden başlatma elle', durdurma: '0' });
  altEkle(G, f1, { rol: 'giris', ad: 'Kapak emniyet anahtarı' }); altEkle(G, f1, { rol: 'mantik', ad: 'Güvenlik rölesi' }); altEkle(G, f1, { rol: 'cikis', ad: 'Emniyet valfi + kontaktör' });
  const f2 = fonkEkle(G, { ad: 'Acil durdurma', tetik: 'Acil durdurma butonuna basılır', guvenliDurum: 'Tüm hareketler durur, basınç boşaltılır', durdurma: '0' });
  altEkle(G, f2, { rol: 'giris', ad: 'Acil durdurma butonu' }); altEkle(G, f2, { rol: 'mantik', ad: 'Güvenlik rölesi' }); altEkle(G, f2, { rol: 'cikis', ad: 'Emniyet valfi + kontaktör' });
  tehlikeEkle(G, { tur: 'mekanik', faz: 'calisma', bolge: 'Pnömatik itici', aciklama: 'İtici ile gövde arasında el / parmak ezilmesi', S: 'S2', F: 'F2', P: 'P1', tasarim: 'İtici kuvveti ve hızı sınırlandı', koruyucu: 'Kilitlemeli koruyucu kapak', bilgi: 'Uyarı etiketi', fonk: [f1.id] });
  tehlikeEkle(G, { tur: 'mekanik', faz: 'temizlik', bolge: 'Konveyör', aciklama: 'Kayış ve kasnak arasına el kaptırma', S: 'S2', F: 'F1', P: 'P1', koruyucu: 'Sabit kasnak muhafazası', bilgi: 'Temizlikte enerji kesilir', fonk: [f2.id] });
  tehlikeEkle(G, { tur: 'elektrik', faz: 'bakim', bolge: 'Kumanda panosu', aciklama: 'Gerilimli parçaya temas', S: 'S2', F: 'F1', P: 'P2', tasarim: 'Parmak korumalı klemensler', koruyucu: 'Kilitli pano kapağı, ana şalter kilitlenebilir', bilgi: 'Yalnız yetkili elektrikçi açar' });
  tehlikeEkle(G, { tur: 'madde', faz: 'ayar', bolge: 'Pnömatik hat', aciklama: 'Basınçlı hava hortumunun kopup savrulması', S: 'S1', F: 'F1', P: 'P1', tasarim: 'Uygun basınç sınıfında hortum', koruyucu: 'Basınç boşaltma valfi' });
  return G;
}
