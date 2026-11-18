// Mekatronik Mühendisliği — hesap motoru (1. aşama). Saf fonksiyonlar; DOM gerektirmez (tests/meka.test.mjs).
// Birimler: girişte kullanıcı birimleri (mm, kg, N, bar, dev/dk); içeride SI. Her hesap adım adım kaydedilir:
// { ad, formül, değer, birim, kaynak } → hesap raporu bu kayıtlardan üretilir (kara kutu yok).
// Kaynaklar:
//   [Dinamik]  Newton mekaniği, dönen kütle eylemsizliği (genel mühendislik bilgisi)
//   [THK]      Bilyalı vida kritik devir ve burkulma: üretici katalog formülleri (THK / ISO 3408 ile uyumlu sık kullanılan biçim)
//   [ISO 281]  Rulman temel nominal ömrü ve güvenilirlik katsayısı a1 (ISO 281:2007)
//   [ISO 15552][ISO 6432] Pnömatik silindir standart iç çap / mil çapı serileri
// Uyarı düzeyleri: 'hata' (sınır aşıldı, kullanılamaz), 'uyari' (sınıra yakın / üretici onayı gerekir), 'bilgi'.

export const G = 9.80665;
const PI = Math.PI;
const fin = (v) => typeof v === 'number' && Number.isFinite(v);

function need(inp, keys) {
  const bad = keys.filter((k) => !fin(inp[k]));
  if (bad.length) throw Object.assign(new Error('Eksik ya da geçersiz giriş: ' + bad.join(', ')), { user: true, fields: bad });
}
function rec() {
  const steps = [], checks = [];
  return {
    steps, checks,
    s(ad, formul, deger, birim, kaynak) { steps.push({ ad, formul, deger, birim, kaynak }); return deger; },
    c(ok, duzey, metin) { checks.push({ ok, duzey: duzey === 'bilgi' ? 'bilgi' : ok ? 'tamam' : duzey, metin }); return ok; },
  };
}

/* ======================= 1) Bilyalı vida tahrikli doğrusal eksen: motor + vida ======================= */
// Destekleme biçimine göre katsayılar [THK]: kritik devir λ, burkulma η
export const SCREW_MOUNT = {
  'sabit-serbest': { ad: 'Sabit – serbest', lambda: 3.4, eta: 1.3 },
  'mesnetli-mesnetli': { ad: 'Mesnetli – mesnetli', lambda: 9.7, eta: 5.1 },
  'sabit-mesnetli': { ad: 'Sabit – mesnetli', lambda: 15.1, eta: 10.2 },
  'sabit-sabit': { ad: 'Sabit – sabit', lambda: 21.9, eta: 20.3 },
};
export const SCREW_DEFAULTS = {
  m: 50, mu: 0.01, aci: 0, Fdis: 0,                       // yük: kütle kg, sürtünme katsayısı, eğim ° (90 = düşey), dış kuvvet N
  P: 10, d: 20, dr: 17.5, L: 800, mount: 'sabit-mesnetli', etaS: 0.9, rho: 7850,   // vida: hatve mm, çap mm, diş dibi çapı mm, boy mm
  i: 1, etaG: 1, Jc: 0.00002,                             // redüktör / kayış oranı (motor devri / vida devri), verimi; kaplin ataleti kg·m²
  strok: 300, v: 0.25, ta: 0.15, td: 0.5, tutma: 'motor', // hareket: strok mm, en yüksek hız m/s, hızlanma = yavaşlama süresi s, bekleme s
  Jm: 0.00012, Tn: 1.27, Tmax: 3.8, nmax: 3000,           // motor: rotor ataleti kg·m², anma torku N·m, en yüksek tork N·m, en yüksek devir dev/dk
  SF: 1.5, oranSinir: 10,                                 // güvenlik katsayısı (RMS tork), izin verilen atalet oranı (üreticiye göre)
};

export function screwAxis(input) {
  const x = { ...SCREW_DEFAULTS, ...input };
  need(x, ['m', 'mu', 'aci', 'Fdis', 'P', 'd', 'dr', 'L', 'etaS', 'rho', 'i', 'etaG', 'Jc', 'strok', 'v', 'ta', 'td', 'Jm', 'Tn', 'Tmax', 'nmax', 'SF', 'oranSinir']);
  const pos = ['m', 'P', 'd', 'dr', 'L', 'etaS', 'i', 'etaG', 'strok', 'v', 'ta', 'Jm', 'Tn', 'Tmax', 'nmax', 'SF'];
  const neg = pos.filter((k) => !(x[k] > 0));
  if (neg.length) throw Object.assign(new Error('Sıfırdan büyük olmalı: ' + neg.join(', ')), { user: true, fields: neg });
  if (x.etaS > 1 || x.etaG > 1) throw Object.assign(new Error('Verim 0 ile 1 arasında olmalı'), { user: true });
  if (x.dr > x.d) throw Object.assign(new Error('Diş dibi çapı vida çapından büyük olamaz'), { user: true });
  const M = SCREW_MOUNT[x.mount];
  if (!M) throw Object.assign(new Error('Destekleme biçimi bilinmiyor'), { user: true });
  const R = rec();
  const Ph = x.P / 1000, th = (x.aci * PI) / 180;

  // hareket profili (yamuk; kısa strokta üçgen)
  let vp = x.v, tc;
  if (x.v * x.ta >= x.strok / 1000) { vp = x.strok / 1000 / x.ta; tc = 0; R.c(true, 'bilgi', 'Strok kısa: hız profili üçgen, ulaşılan en yüksek hız ' + vp.toFixed(3) + ' m/s'); }
  else tc = (x.strok / 1000 - x.v * x.ta) / x.v;
  R.s('Sabit hızda geçen süre', 'tc = (s − v·ta) / v', tc, 's', 'Dinamik');
  const tcyc = R.s('Çevrim süresi', 'tçevrim = 2·ta + tc + tbekleme', 2 * x.ta + tc + x.td, 's', 'Dinamik');
  const a = R.s('İvme', 'a = v / ta', vp / x.ta, 'm/s²', 'Dinamik');

  // kuvvetler
  const Fsur = R.s('Sürtünme + eğim + dış kuvvet (sabit hız)', 'F = m·g·(sin θ + μ·cos θ) + Fdış', x.m * G * (Math.sin(th) + x.mu * Math.cos(th)) + x.Fdis, 'N', 'Dinamik');
  const Fmax = R.s('En büyük eksenel kuvvet (hızlanmada)', 'Fmax = F + m·a', Fsur + x.m * a, 'N', 'Dinamik');

  // devir
  const nS = R.s('Vida devri', 'n_vida = v / Ph · 60', (vp / Ph) * 60, 'dev/dk', 'Dinamik');
  const nM = R.s('Motor devri', 'n_motor = n_vida · i', nS * x.i, 'dev/dk', 'Dinamik');
  const w = (nM * 2 * PI) / 60, alpha = R.s('Motor açısal ivmesi', 'α = ω / ta', w / x.ta, 'rad/s²', 'Dinamik');

  // ataletler
  const Js = R.s('Vida ataleti', 'J_vida = π·ρ·L·d⁴ / 32', (PI * x.rho * (x.L / 1000) * (x.d / 1000) ** 4) / 32, 'kg·m²', 'Dinamik');
  const Jl = R.s('Yükün vidaya indirgenmiş ataleti', 'J_yük = m·(Ph / 2π)²', x.m * (Ph / (2 * PI)) ** 2, 'kg·m²', 'Dinamik');
  const Jref = R.s('Motora indirgenmiş yük ataleti', "J' = (J_vida/ηr + J_yük/(ηv·ηr)) / i² + J_kaplin", (Js / x.etaG + Jl / (x.etaS * x.etaG)) / x.i ** 2 + x.Jc, 'kg·m²', 'Dinamik');
  const ratio = R.s('Atalet oranı', "k = J' / J_motor", Jref / x.Jm, '—', 'Dinamik');

  // torklar (motor milinde)
  const Tl = R.s('Yük torku (sabit hız)', 'T_yük = F·Ph / (2π·ηv·i·ηr)', (Fsur * Ph) / (2 * PI * x.etaS * x.i * x.etaG), 'N·m', 'Dinamik');
  const Tacc = R.s('Hızlanma torku', "T_h = (J_motor + J')·α + T_yük", (x.Jm + Jref) * alpha + Tl, 'N·m', 'Dinamik');
  const Tdec = R.s('Yavaşlama torku', "T_y = −(J_motor + J')·α + T_yük", -(x.Jm + Jref) * alpha + Tl, 'N·m', 'Dinamik');
  const Fhold = x.tutma === 'motor' ? x.m * G * Math.sin(th) + x.Fdis : 0;
  const Thold = R.s('Beklemede tutma torku', x.tutma === 'motor' ? 'T_b = (m·g·sin θ + Fdış)·Ph / (2π·ηv·i·ηr)' : 'Fren tutar: T_b = 0', (Fhold * Ph) / (2 * PI * x.etaS * x.i * x.etaG), 'N·m', 'Dinamik');
  const Tpk = R.s('En yüksek tork', 'T_tepe = max(|T_h|, |T_y|)', Math.max(Math.abs(Tacc), Math.abs(Tdec)), 'N·m', 'Dinamik');
  const Trms = R.s('Etkin (RMS) tork', 'T_rms = √((T_h²·ta + T_yük²·tc + T_y²·ta + T_b²·tb) / tçevrim)', Math.sqrt((Tacc ** 2 * x.ta + Tl ** 2 * tc + Tdec ** 2 * x.ta + Thold ** 2 * x.td) / tcyc), 'N·m', 'Dinamik');

  // vida kontrolleri [THK]
  const nc = R.s('Vida kritik devri', 'n_k = λ·(dr / L²)·10⁷   (' + M.ad + ', λ = ' + M.lambda + ')', (M.lambda * x.dr) / x.L ** 2 * 1e7, 'dev/dk', 'THK');
  const Pk = R.s('Vida burkulma yükü', 'P_k = η·(dr⁴ / L²)·10⁴   (η = ' + M.eta + ')', (M.eta * x.dr ** 4) / x.L ** 2 * 1e4, 'N', 'THK');

  R.c(nS <= 0.8 * nc, 'hata', `Vida devri ${nS.toFixed(0)} dev/dk, izin verilen (kritik devrin %80'i) ${(0.8 * nc).toFixed(0)} dev/dk`);
  R.c(Fmax <= 0.5 * Pk, 'hata', `En büyük eksenel kuvvet ${Fmax.toFixed(0)} N, izin verilen (burkulma yükünün %50'si) ${(0.5 * Pk).toFixed(0)} N` + (x.mount === 'sabit-serbest' ? '' : ' (çekme yönündeki yükte burkulma olmaz; basma için geçerlidir)'));
  R.c(nM <= x.nmax, 'hata', `Motor devri ${nM.toFixed(0)} dev/dk, motorun en yüksek devri ${x.nmax} dev/dk`);
  R.c(Trms * x.SF <= x.Tn, 'hata', `RMS tork × güvenlik (${Trms.toFixed(3)} × ${x.SF} = ${(Trms * x.SF).toFixed(3)} N·m), motor anma torku ${x.Tn} N·m`);
  R.c(Tpk <= x.Tmax, 'hata', `En yüksek tork ${Tpk.toFixed(3)} N·m, motorun en yüksek torku ${x.Tmax} N·m`);
  if (Tpk <= x.Tmax) R.c(Tpk <= 0.8 * x.Tmax, 'uyari', `En yüksek tork motor sınırının %${Math.round((100 * Tpk) / x.Tmax)}'i: sürücü akım sınırını ve sıcaklığı kontrol et`);
  R.c(ratio <= x.oranSinir, 'uyari', `Atalet oranı ${ratio.toFixed(1)} : 1, hedef ≤ ${x.oranSinir} : 1 (üreticinin değeri esastır; yüksek oran ayar zorluğu ve titreşim getirir)`);
  if (Tdec < 0) R.c(true, 'bilgi', 'Yavaşlamada motor frenliyor (geri besleme enerjisi): sürücünün fren direnci kapasitesini kontrol et');
  if (x.aci > 0 && x.tutma !== 'motor') R.c(true, 'bilgi', 'Eğik / düşey eksen: fren güvenilirliği güvenlik değerlendirmesinde ayrıca ele alınmalı');
  if (x.aci >= 45 && x.etaS >= 0.85) R.c(true, 'bilgi', 'Bilyalı vida kendiliğinden kilitlenmez: elektrik kesilince yük düşer, frenli motor ya da mekanik kilit gerekir');

  return { tur: 'vida', giris: x, sonuc: { tc, tcyc, a, Fsur, Fmax, nS, nM, Js, Jl, Jref, ratio, Tl, Tacc, Tdec, Thold, Tpk, Trms, nc, Pk }, adimlar: R.steps, kontroller: R.checks, uygun: R.checks.every((c) => c.ok || c.duzey !== 'hata') };
}

/* ======================= 2) Rulman ömrü — ISO 281 temel nominal ömür ======================= */
// a1 güvenilirlik katsayısı (ISO 281:2007, Tablo 12)
export const ISO281_A1 = { 90: 1, 95: 0.64, 96: 0.55, 97: 0.47, 98: 0.37, 99: 0.25 };
export const BEARING_DEFAULTS = { tip: 'bilyali', C: 14000, Fr: 2000, Fa: 0, X: 1, Y: 0, n: 1500, guv: 90, hedef: 20000 };

export function bearingLife(input) {
  const x = { ...BEARING_DEFAULTS, ...input };
  need(x, ['C', 'Fr', 'Fa', 'X', 'Y', 'n', 'guv', 'hedef']);
  if (!(x.C > 0) || !(x.n > 0)) throw Object.assign(new Error('C ve devir sıfırdan büyük olmalı'), { user: true });
  if (x.Fr < 0 || x.Fa < 0) throw Object.assign(new Error('Yük negatif olamaz'), { user: true });
  const a1 = ISO281_A1[x.guv];
  if (a1 == null) throw Object.assign(new Error('Güvenilirlik %90, 95, 96, 97, 98 ya da 99 olmalı'), { user: true });
  const R = rec();
  const p = x.tip === 'makarali' ? 10 / 3 : 3;
  const P = R.s('Eşdeğer dinamik yük', 'P = X·Fr + Y·Fa', x.X * x.Fr + x.Y * x.Fa, 'N', 'ISO 281');
  if (!(P > 0)) throw Object.assign(new Error('Rulmana yük gelmiyor (P = 0)'), { user: true });
  const L10 = R.s('Temel nominal ömür', 'L10 = (C / P)^p   (p = ' + (p === 3 ? '3, bilyalı' : '10/3, makaralı') + ')', (x.C / P) ** p, 'milyon devir', 'ISO 281');
  const L10h = R.s('Saat olarak ömür', 'L10h = L10·10⁶ / (60·n)', (L10 * 1e6) / (60 * x.n), 'saat', 'ISO 281');
  const Lnm = R.s('Güvenilirliğe göre ömür (%' + x.guv + ')', 'Lnh = a1·L10h   (a1 = ' + a1 + ')', a1 * L10h, 'saat', 'ISO 281');
  R.c(Lnm >= x.hedef, 'hata', `Ömür ${Math.round(Lnm).toLocaleString('tr-TR')} saat, hedef ${x.hedef.toLocaleString('tr-TR')} saat (%${x.guv} güvenilirlik)`);
  R.c(P <= 0.5 * x.C, 'uyari', `Yük oranı P/C = ${(P / x.C).toFixed(2)}: 0,5 üstü ağır yüktür, ISO 281 değiştirilmiş ömür (aISO) ve üretici onayı gerekir`);
  if (x.Fa > 0 && x.Y === 0) R.c(false, 'uyari', 'Eksenel yük var ama Y = 0: bu yalnız Fa/Fr ≤ e ise doğrudur. X ve Y katsayılarını rulman kataloğundan kontrol et.');
  R.c(true, 'bilgi', 'Bu temel ömürdür (a1 dışında yağlama, kirlilik, sıcaklık katsayısı aISO alınmadı). Statik yük (C0) kontrolü ayrıca yapılmalıdır.');
  return { tur: 'rulman', giris: x, sonuc: { P, L10, L10h, Lnm, a1, p }, adimlar: R.steps, kontroller: R.checks, uygun: R.checks.every((c) => c.ok || c.duzey !== 'hata') };
}

/* ======================= 3) Pnömatik silindir — ISO 15552 / ISO 6432 ======================= */
// Standart iç çap → mil çapı (mm). ISO 6432 (mini, Ø8–25), ISO 15552 (Ø32–125)
export const CYL_ROD = { 8: 4, 10: 4, 12: 6, 16: 6, 20: 8, 25: 10, 32: 12, 40: 16, 50: 20, 63: 20, 80: 25, 100: 25, 125: 32 };
export const CYL_STD = (D) => (D <= 25 ? 'ISO 6432' : 'ISO 15552');
export const PNEU_DEFAULTS = { D: 50, d: null, strok: 100, p: 6, yuk: 600, yon: 'itme', dinamik: true, cevrim: 20, eta: 1 };
const PATM = 1.013;   // bar mutlak (deniz seviyesi standart atmosfer)

export function pneumatic(input) {
  const x = { ...PNEU_DEFAULTS, ...input };
  if (x.d == null) x.d = CYL_ROD[x.D];
  need(x, ['D', 'd', 'strok', 'p', 'yuk', 'cevrim', 'eta']);
  if (!(x.D > 0 && x.strok > 0 && x.p > 0)) throw Object.assign(new Error('Çap, strok ve basınç sıfırdan büyük olmalı'), { user: true });
  if (!(x.d >= 0 && x.d < x.D)) throw Object.assign(new Error('Mil çapı iç çaptan küçük olmalı'), { user: true });
  const R = rec();
  const pMPa = x.p / 10;
  const A1 = R.s('Piston alanı', 'A = π·D² / 4', (PI * x.D ** 2) / 4, 'mm²', 'Dinamik');
  const A2 = R.s('Halka alan (mil tarafı)', "A' = π·(D² − d²) / 4", (PI * (x.D ** 2 - x.d ** 2)) / 4, 'mm²', 'Dinamik');
  const Fi = R.s('Teorik itme kuvveti', 'F_it = p·A' + (x.eta < 1 ? '·η' : ''), pMPa * A1 * x.eta, 'N', 'Dinamik');
  const Fc = R.s('Teorik çekme kuvveti', "F_çek = p·A'" + (x.eta < 1 ? '·η' : ''), pMPa * A2 * x.eta, 'N', 'Dinamik');
  const F = x.yon === 'cekme' ? Fc : Fi;
  const oran = R.s('Yük oranı', 'yük / F', x.yuk / F, '—', 'Dinamik');
  const r = (x.p + PATM) / PATM;
  const Vcyc = R.s('Çevrim başına serbest hava', 'Q = (A + A′)·strok·(p + 1,013) / 1,013', ((A1 + A2) * x.strok * r) / 1e6, 'NL / çevrim', 'Dinamik');
  const Q = R.s('Hava tüketimi', 'Q·çevrim/dk', Vcyc * x.cevrim, 'NL/dk', 'Dinamik');
  const sinir = x.dinamik ? 0.7 : 0.85;
  R.c(oran <= sinir, 'hata', `Yük ${x.yuk} N, ${x.yon === 'cekme' ? 'çekme' : 'itme'} kuvvetinin %${Math.round(oran * 100)}'i; ${x.dinamik ? 'hareketli' : 'sıkma / statik'} yükte önerilen en çok %${Math.round(sinir * 100)} (sürtünme, basınç düşümü ve hız payı)`);
  if (CYL_ROD[x.D] == null) R.c(false, 'uyari', `Ø${x.D} standart iç çap değil (${Object.keys(CYL_ROD).join(', ')})`);
  else R.c(true, 'bilgi', `Ø${x.D} ${CYL_STD(x.D)} standart çapı; standart mil Ø${CYL_ROD[x.D]}` + (x.d !== CYL_ROD[x.D] ? ` (girilen Ø${x.d})` : ''));
  R.c(true, 'bilgi', 'Teorik kuvvettir: conta sürtünmesi ve hortum / valf basınç düşümü üretici verisiyle ayrıca düşülmelidir. Uzun strok ve itme yükünde mil burkulması üretici tablosundan kontrol edilmelidir.');
  return { tur: 'pnomatik', giris: x, sonuc: { A1, A2, Fi, Fc, F, oran, Vcyc, Q }, adimlar: R.steps, kontroller: R.checks, uygun: R.checks.every((c) => c.ok || c.duzey !== 'hata') };
}

// En küçük uygun standart silindir (yük oranı sınırına göre)
export function pickCylinder(yuk, p, yon = 'itme', dinamik = true) {
  for (const D of Object.keys(CYL_ROD).map(Number)) {
    const r = pneumatic({ D, p, yuk, yon, dinamik });
    if (r.uygun) return { D, d: CYL_ROD[D], std: CYL_STD(D), sonuc: r };
  }
  return null;
}

/* ======================= Rapor ======================= */
export const KAYNAK = {
  Dinamik: 'Newton mekaniği ve dönen kütle eylemsizliği (genel mühendislik bilgisi)',
  THK: 'Bilyalı vida kritik devir ve burkulma formülleri (THK genel katalog; ISO 3408 ile uyumlu sık kullanılan biçim)',
  'ISO 281': 'ISO 281:2007 Rulmanlar — Dinamik yük sayıları ve nominal ömür',
};
export const BASLIK = { vida: 'Bilyalı vida tahrikli eksen: motor ve vida seçimi', rulman: 'Rulman ömrü (ISO 281)', pnomatik: 'Pnömatik silindir seçimi (ISO 15552 / ISO 6432)' };

// rapordaki girdi adları ve birimleri
export const GIRDI_ADI = {
  m: ['Taşınan kütle', 'kg'], mu: ['Kılavuz sürtünme katsayısı μ', ''], aci: ['Eğim', '°'], Fdis: ['Dış kuvvet', 'N'], P: ['Vida hatvesi', 'mm'], d: ['Vida çapı', 'mm'], dr: ['Diş dibi çapı', 'mm'],
  L: ['Yataklar arası boy', 'mm'], mount: ['Yataklama', ''], etaS: ['Vida verimi ηv', ''], rho: ['Vida malzemesi yoğunluğu', 'kg/m³'], i: ['Aktarma oranı i', ''], etaG: ['Aktarma verimi ηr', ''],
  Jc: ['Kaplin ataleti', 'kg·m²'], strok: ['Strok', 'mm'], v: ['En yüksek hız', 'm/s'], ta: ['Hızlanma / yavaşlama süresi', 's'], td: ['Bekleme süresi', 's'], tutma: ['Beklemede tutan', ''],
  Jm: ['Motor rotor ataleti', 'kg·m²'], Tn: ['Motor anma torku', 'N·m'], Tmax: ['Motor en yüksek torku', 'N·m'], nmax: ['Motor en yüksek devri', 'dev/dk'], SF: ['Güvenlik katsayısı (RMS)', ''], oranSinir: ['İzin verilen atalet oranı', ': 1'],
  tip: ['Rulman tipi', ''], C: ['Dinamik yük sayısı C', 'N'], Fr: ['Radyal yük Fr', 'N'], Fa: ['Eksenel yük Fa', 'N'], X: ['X katsayısı', ''], Y: ['Y katsayısı', ''], n: ['Devir', 'dev/dk'], guv: ['Güvenilirlik', '%'], hedef: ['Hedef ömür', 'saat'],
  D: ['Silindir iç çapı', 'mm'], p: ['Çalışma basıncı', 'bar'], yuk: ['Yük', 'N'], yon: ['Kuvvet yönü', ''], dinamik: ['Hareketli yük', ''], cevrim: ['Çevrim sayısı', '/dk'], eta: ['Kuvvet verimi', ''],
};
const num = (v) => (Math.abs(v) >= 1000 ? v.toLocaleString('tr-TR', { maximumFractionDigits: 1 }) : Math.abs(v) >= 1 ? v.toLocaleString('tr-TR', { maximumFractionDigits: 3 }) : v.toLocaleString('tr-TR', { maximumSignificantDigits: 4 }));
export function reportLines(r, proje = '') {
  const L = [];
  L.push('ÇİZİM ATÖLYESİ — MEKATRONİK MÜHENDİSLİĞİ HESAP RAPORU');
  L.push(BASLIK[r.tur] + (proje ? ' · ' + proje : ''));
  L.push('Sonuç: ' + (r.uygun ? 'UYGUN (sınır aşımı yok)' : 'UYGUN DEĞİL — aşağıdaki hatalara bak'));
  L.push('');
  L.push('GİRDİLER');
  for (const [k, v] of Object.entries(r.giris)) if (v != null && typeof v !== 'object') { const [ad, br] = GIRDI_ADI[k] || [k, '']; L.push('  ' + ad + ' = ' + (typeof v === 'number' ? num(v) : typeof v === 'boolean' ? (v ? 'evet' : 'hayır') : k === 'mount' && SCREW_MOUNT[v] ? SCREW_MOUNT[v].ad : v) + (br ? ' ' + br : '')); }
  L.push('');
  L.push('HESAP ADIMLARI');
  r.adimlar.forEach((s, i) => L.push(`  ${i + 1}. ${s.ad}: ${s.formul} = ${num(s.deger)} ${s.birim}  [${s.kaynak}]`));
  L.push('');
  L.push('KONTROLLER');
  for (const c of r.kontroller) L.push('  ' + (c.ok ? (c.duzey === 'bilgi' ? 'ℹ' : '✓') : c.duzey === 'hata' ? '✗ HATA' : '⚠ UYARI') + ' ' + c.metin);
  L.push('');
  L.push('KAYNAKLAR');
  for (const k of [...new Set(r.adimlar.map((s) => s.kaynak))]) L.push('  [' + k + '] ' + (KAYNAK[k] || k));
  L.push('');
  L.push('Bu rapor ön tasarım hesabıdır. Bileşen seçimi üreticinin güncel katalog değerleriyle ve yetkili mühendis onayıyla kesinleştirilmelidir.');
  return L;
}
