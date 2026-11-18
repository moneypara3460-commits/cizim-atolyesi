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

/* ======================= 3. aşama ======================= */
// Ortak: motor milindeki hızlanma / sabit hız / yavaşlama / bekleme torkları ve motor kontrolleri.
// J: motor + motora indirgenmiş toplam atalet (kg·m²), w: motor en yüksek açısal hızı (rad/s)
function motorDuty(R, x, Jtot, w, ta, tc, td, Tl, Th, nM) {
  const alpha = R.s('Motor açısal ivmesi', 'α = ω / ta', w / ta, 'rad/s²', 'Dinamik');
  const Tacc = R.s('Hızlanma torku', 'T_h = J_toplam·α + T_yük', Jtot * alpha + Tl, 'N·m', 'Dinamik');
  const Tdec = R.s('Yavaşlama torku', 'T_y = −J_toplam·α + T_yük', -Jtot * alpha + Tl, 'N·m', 'Dinamik');
  const tcyc = 2 * ta + tc + td;
  const Tpk = R.s('En yüksek tork', 'T_tepe = max(|T_h|, |T_y|)', Math.max(Math.abs(Tacc), Math.abs(Tdec)), 'N·m', 'Dinamik');
  const Trms = R.s('Etkin (RMS) tork', 'T_rms = √((T_h²·ta + T_yük²·tc + T_y²·ta + T_b²·tb) / tçevrim)', Math.sqrt((Tacc ** 2 * ta + Tl ** 2 * tc + Tdec ** 2 * ta + Th ** 2 * td) / tcyc), 'N·m', 'Dinamik');
  const ratio = R.s('Atalet oranı', "k = (J_toplam − J_motor) / J_motor", (Jtot - x.Jm) / x.Jm, '—', 'Dinamik');
  R.c(nM <= x.nmax, 'hata', `Motor devri ${nM.toFixed(0)} dev/dk, motorun en yüksek devri ${x.nmax} dev/dk`);
  R.c(Trms * x.SF <= x.Tn, 'hata', `RMS tork × güvenlik (${Trms.toFixed(3)} × ${x.SF} = ${(Trms * x.SF).toFixed(3)} N·m), motor anma torku ${x.Tn} N·m`);
  R.c(Tpk <= x.Tmax, 'hata', `En yüksek tork ${Tpk.toFixed(3)} N·m, motorun en yüksek torku ${x.Tmax} N·m`);
  if (Tpk <= x.Tmax) R.c(Tpk <= 0.8 * x.Tmax, 'uyari', `En yüksek tork motor sınırının %${Math.round((100 * Tpk) / x.Tmax)}'i: sürücü akım sınırını ve sıcaklığı kontrol et`);
  R.c(ratio <= x.oranSinir, 'uyari', `Atalet oranı ${ratio.toFixed(1)} : 1, hedef ≤ ${x.oranSinir} : 1 (üreticinin değeri esastır)`);
  if (Tdec < 0) R.c(true, 'bilgi', 'Yavaşlamada motor frenliyor (geri besleme enerjisi): sürücünün fren direnci kapasitesini kontrol et');
  return { alpha, Tacc, Tdec, Tpk, Trms, ratio, tcyc };
}
function profile(R, x, s, v) {
  let vp = v, tc;
  if (v * x.ta >= s) { vp = s / x.ta; tc = 0; R.c(true, 'bilgi', 'Hareket kısa: hız profili üçgen, ulaşılan en yüksek hız ' + vp.toFixed(3)); }
  else tc = (s - v * x.ta) / v;
  R.s('Sabit hızda geçen süre', 'tc = (s − v·ta) / v', tc, 's', 'Dinamik');
  R.s('Çevrim süresi', 'tçevrim = 2·ta + tc + tbekleme', 2 * x.ta + tc + x.td, 's', 'Dinamik');
  return { vp, tc };
}
const MOTOR_KEYS = ['Jm', 'Tn', 'Tmax', 'nmax', 'SF', 'oranSinir'];
const MOTOR_DEF = { Jm: 0.00012, Tn: 1.27, Tmax: 3.8, nmax: 3000, SF: 1.5, oranSinir: 10 };
const bad = (m) => { throw Object.assign(new Error(m), { user: true }); };
function positive(x, keys) { const n = keys.filter((k) => !(x[k] > 0)); if (n.length) bad('Sıfırdan büyük olmalı: ' + n.join(', ')); }

/* ---------- Kayış (triger) ve kremayer–pinyon tahrikli doğrusal eksen ---------- */
// tur: 'kayis' (iki kasnak: tahrik + avara, aynı çap) | 'kremayer' (tek pinyon)
export const BELT_DEFAULTS = { m: 10, mu: 0.1, aci: 0, Fdis: 0, Dp: 50, Jp: 0.00005, mb: 0.3, eta: 0.95, i: 1, etaG: 1, Jc: 0.00002, strok: 800, v: 1, ta: 0.2, td: 0.5, tutma: 'motor', Fizin: 0, ...MOTOR_DEF };
export const RACK_DEFAULTS = { m: 40, mu: 0.05, aci: 0, Fdis: 0, Dp: 40, Jp: 0.00003, mb: 0, eta: 0.95, i: 5, etaG: 0.95, Jc: 0.00002, strok: 1500, v: 1, ta: 0.25, td: 0.5, tutma: 'motor', Fizin: 0, ...MOTOR_DEF };

export function linearDrive(input, tur = 'kayis') {
  const x = { ...(tur === 'kayis' ? BELT_DEFAULTS : RACK_DEFAULTS), ...input };
  need(x, ['m', 'mu', 'aci', 'Fdis', 'Dp', 'Jp', 'mb', 'eta', 'i', 'etaG', 'Jc', 'strok', 'v', 'ta', 'td', 'Fizin', ...MOTOR_KEYS]);
  positive(x, ['m', 'Dp', 'eta', 'i', 'etaG', 'strok', 'v', 'ta', ...MOTOR_KEYS]);
  if (x.eta > 1 || x.etaG > 1) bad('Verim 0 ile 1 arasında olmalı');
  if (x.Jp < 0 || x.mb < 0 || x.Jc < 0) bad('Atalet ve kütle negatif olamaz');
  const R = rec(), th = (x.aci * PI) / 180, r = x.Dp / 2000, nP = tur === 'kayis' ? 2 : 1;
  const { vp, tc } = profile(R, x, x.strok / 1000, x.v);
  const a = R.s('İvme', 'a = v / ta', vp / x.ta, 'm/s²', 'Dinamik');
  const F = R.s('Sürtünme + eğim + dış kuvvet (sabit hız)', 'F = m·g·(sin θ + μ·cos θ) + Fdış', x.m * G * (Math.sin(th) + x.mu * Math.cos(th)) + x.Fdis, 'N', 'Dinamik');
  const Fmax = R.s(tur === 'kayis' ? 'Kayışta en büyük çekme kuvveti' : 'Dişlide en büyük teğetsel kuvvet', 'F_max = F + (m + m_kayış)·a', F + (x.m + x.mb) * a, 'N', 'Dinamik');
  const nK = R.s(tur === 'kayis' ? 'Kasnak devri' : 'Pinyon devri', 'n = v / (π·Dp) · 60', (vp / (PI * x.Dp / 1000)) * 60, 'dev/dk', 'Dinamik');
  const nM = R.s('Motor devri', 'n_motor = n·i', nK * x.i, 'dev/dk', 'Dinamik');
  const w = (nM * 2 * PI) / 60;
  const Jl = R.s('Doğrusal kütlenin kasnağa indirgenmiş ataleti', 'J_yük = (m + m_kayış)·r²', (x.m + x.mb) * r * r, 'kg·m²', 'Dinamik');
  const Jref = R.s('Motora indirgenmiş yük ataleti', `J' = (${nP}·J_kasnak/ηr + J_yük/(η·ηr)) / i² + J_kaplin`, (nP * x.Jp / x.etaG + Jl / (x.eta * x.etaG)) / x.i ** 2 + x.Jc, 'kg·m²', 'Dinamik');
  const Tl = R.s('Yük torku (sabit hız)', 'T_yük = F·r / (η·i·ηr)', (F * r) / (x.eta * x.i * x.etaG), 'N·m', 'Dinamik');
  const Fh = x.tutma === 'motor' ? x.m * G * Math.sin(th) + x.Fdis : 0;
  const Th = R.s('Beklemede tutma torku', x.tutma === 'motor' ? 'T_b = (m·g·sin θ + Fdış)·r / (η·i·ηr)' : 'Fren tutar: T_b = 0', (Fh * r) / (x.eta * x.i * x.etaG), 'N·m', 'Dinamik');
  const d = motorDuty(R, x, x.Jm + Jref, w, x.ta, tc, x.td, Tl, Th, nM);
  if (x.Fizin > 0) R.c(Fmax <= x.Fizin, 'hata', `${tur === 'kayis' ? 'Kayış' : 'Kremayer–pinyon'} kuvveti ${Fmax.toFixed(0)} N, katalogdaki izin verilen ${x.Fizin} N`);
  else R.c(false, 'uyari', `${tur === 'kayis' ? 'Kayışın izin verilen çekme kuvveti' : 'Kremayer–pinyonun izin verilen teğetsel kuvveti'} girilmedi: ${Fmax.toFixed(0)} N'u katalogla karşılaştır`);
  if (tur === 'kayis') R.c(true, 'bilgi', 'Kayış esner: konumlama hassasiyeti ve rezonans için kayış rijitliği üretici verisiyle ayrıca kontrol edilmelidir. Ön gerdirme yatak yükü olarak rulman hesabına eklenmelidir.');
  else R.c(true, 'bilgi', 'Dişli boşluğu (backlash) konumlama hassasiyetini etkiler; diş dibi / yüzey dayanımı (ISO 6336) üretici tablosuyla kontrol edilmelidir.');
  if (x.aci >= 45 && x.tutma !== 'fren') R.c(true, 'bilgi', 'Eğik / düşey eksen: elektrik kesilince yük düşer, frenli motor ya da mekanik kilit gerekir');
  return { tur, giris: x, sonuc: { a, F, Fmax, nK, nM, Jl, Jref, Tl, Th, ...d }, adimlar: R.steps, kontroller: R.checks, uygun: R.checks.every((c) => c.ok || c.duzey !== 'hata') };
}
export const beltAxis = (inp) => linearDrive(inp, 'kayis');
export const rackAxis = (inp) => linearDrive(inp, 'kremayer');

/* ---------- Döner tabla (indeksleme) ---------- */
export const TABLE_DEFAULTS = { M: 20, Dt: 300, Jek: 0, aci: 90, tm: 0.5, ka: 1 / 3, td: 1, Tsur: 0.5, i: 10, etaG: 0.9, Jc: 0.00002, ...MOTOR_DEF };
export function rotaryTable(input) {
  const x = { ...TABLE_DEFAULTS, ...input };
  need(x, ['M', 'Dt', 'Jek', 'aci', 'tm', 'ka', 'td', 'Tsur', 'i', 'etaG', 'Jc', ...MOTOR_KEYS]);
  positive(x, ['Dt', 'aci', 'tm', 'i', 'etaG', ...MOTOR_KEYS]);
  if (!(x.ka > 0 && x.ka <= 0.5)) bad('Hızlanma payı 0 ile 0,5 arasında olmalı (ta = pay × hareket süresi)');
  if (x.etaG > 1) bad('Verim 0 ile 1 arasında olmalı');
  if (x.M < 0 || x.Jek < 0 || x.Tsur < 0) bad('Kütle, atalet ve sürtünme torku negatif olamaz');
  const R = rec();
  const Jt = R.s('Tabla ataleti (dolu disk)', 'J_tabla = M·D² / 8', (x.M * (x.Dt / 1000) ** 2) / 8, 'kg·m²', 'Dinamik');
  const JT = R.s('Tabla + yük ataleti', 'J = J_tabla + J_ek', Jt + x.Jek, 'kg·m²', 'Dinamik');
  const ta = R.s('Hızlanma süresi', 'ta = pay·t_hareket', x.ka * x.tm, 's', 'Dinamik');
  const wT = R.s('Tablanın en yüksek açısal hızı', 'ω = θ / (t_hareket − ta)', ((x.aci * PI) / 180) / (x.tm - ta), 'rad/s', 'Dinamik');
  const nT = R.s('Tabla devri', 'n = ω·60 / 2π', (wT * 60) / (2 * PI), 'dev/dk', 'Dinamik');
  const nM = R.s('Motor devri', 'n_motor = n·i', nT * x.i, 'dev/dk', 'Dinamik');
  const Jref = R.s('Motora indirgenmiş atalet', "J' = J / (i²·ηr) + J_kaplin", JT / (x.i ** 2 * x.etaG) + x.Jc, 'kg·m²', 'Dinamik');
  const Tl = R.s('Sürtünme torku (motorda)', 'T_yük = T_sürtünme / (i·ηr)', x.Tsur / (x.i * x.etaG), 'N·m', 'Dinamik');
  const tc = x.tm - 2 * ta;
  const d = motorDuty(R, x, x.Jm + Jref, nM * 2 * PI / 60, ta, tc, x.td, Tl, 0, nM);
  R.s('Çevrim süresi', 'tçevrim = t_hareket + tbekleme', x.tm + x.td, 's', 'Dinamik');
  R.c(true, 'bilgi', 'Tabla dolu disk kabul edildi; fikstür ve parçaların ataleti "ek atalet" olarak girilmelidir (montajdan Ağırlık sekmesiyle hesaplanabilir). Konumda tutma için fren / kilit pimi ayrıca değerlendirilmelidir.');
  return { tur: 'tabla', giris: x, sonuc: { Jt, JT, ta, wT, nT, nM, Jref, Tl, ...d }, adimlar: R.steps, kontroller: R.checks, uygun: R.checks.every((c) => c.ok || c.duzey !== 'hata') };
}

/* ---------- Redüktör seçimi (katalog değerleriyle) ---------- */
export const GEARBOX_DEFAULTS = { T2rms: 20, T2tepe: 45, n2: 300, n1: 3000, fs: 1.25, i: 10, T2N: 40, T2max: 80, n1max: 4500, eta: 0.95 };
export function gearbox(input) {
  const x = { ...GEARBOX_DEFAULTS, ...input };
  need(x, ['T2rms', 'T2tepe', 'n2', 'n1', 'fs', 'i', 'T2N', 'T2max', 'n1max', 'eta']);
  positive(x, ['T2rms', 'T2tepe', 'n2', 'n1', 'fs', 'i', 'T2N', 'T2max', 'n1max', 'eta']);
  if (x.eta > 1) bad('Verim 0 ile 1 arasında olmalı');
  if (x.fs < 1) bad('Servis (işletme) katsayısı 1\'den küçük olamaz');
  const R = rec();
  const iGer = R.s('Gereken oran', 'i_gerek = n1 / n2', x.n1 / x.n2, '—', 'Dinamik');
  const n1 = R.s('Seçilen oranla giriş devri', 'n1 = n2·i', x.n2 * x.i, 'dev/dk', 'Dinamik');
  const T2s = R.s('Servis katsayılı sürekli tork', 'T2·fs', x.T2rms * x.fs, 'N·m', 'Katalog');
  const T1 = R.s('Motordan istenen tepe tork', 'T1 = T2_tepe / (i·η)', x.T2tepe / (x.i * x.eta), 'N·m', 'Dinamik');
  R.c(T2s <= x.T2N, 'hata', `Sürekli çıkış torku × fs = ${T2s.toFixed(1)} N·m, redüktör anma çıkış torku ${x.T2N} N·m`);
  R.c(x.T2tepe <= x.T2max, 'hata', `Tepe çıkış torku ${x.T2tepe} N·m, redüktörün izin verilen en yüksek çıkış torku ${x.T2max} N·m`);
  R.c(n1 <= x.n1max, 'hata', `Giriş devri ${n1.toFixed(0)} dev/dk, redüktörün izin verilen giriş devri ${x.n1max} dev/dk`);
  R.c(Math.abs(x.i - iGer) / iGer <= 0.1, 'uyari', `Seçilen oran ${x.i}, gereken ${iGer.toFixed(2)}: çıkış devri ${(x.n1 / x.i).toFixed(0)} dev/dk olur`);
  R.c(true, 'bilgi', 'Servis katsayısı fs üreticinin kataloğundan (yük tipi, günlük çalışma saati, saatteki kalkış sayısı) alınmalıdır. Çıkış milindeki radyal / eksenel yük ve ısıl kapasite katalogdan ayrıca kontrol edilmelidir.');
  return { tur: 'reduktor', giris: x, sonuc: { iGer, n1, T2s, T1 }, adimlar: R.steps, kontroller: R.checks, uygun: R.checks.every((c) => c.ok || c.duzey !== 'hata') };
}

/* ---------- Mil: eğilme, sehim, yatak açısı, statik gerilme ---------- */
// Dolu yuvarlak mil. Durum: 'iki-mesnet' (iki yatak arası, a mesafesinde tekil yük) | 'konsol' (ankastre, uçta tekil yük)
export const SHAFT_DEFAULTS = { durum: 'iki-mesnet', F: 1000, L: 200, a: 100, d: 20, T: 20, E: 210000, Re: 355, Sgerek: 2, yIzin: 0, tIzin: 0.001 };
export function shaft(input) {
  const x = { ...SHAFT_DEFAULTS, ...input };
  need(x, ['F', 'L', 'a', 'd', 'T', 'E', 'Re', 'Sgerek', 'yIzin', 'tIzin']);
  positive(x, ['L', 'd', 'E', 'Re', 'Sgerek']);
  if (x.F < 0 || x.T < 0) bad('Kuvvet ve tork negatif olamaz (büyüklük gir)');
  const R = rec(), iki = x.durum !== 'konsol';
  if (iki && !(x.a > 0 && x.a < x.L)) bad('Yük yatakların arasında olmalı (0 < a < L)');
  const I = R.s('Atalet momenti', 'I = π·d⁴ / 64', (PI * x.d ** 4) / 64, 'mm⁴', 'Mukavemet');
  const Wb = R.s('Eğilme direnç momenti', 'Wb = π·d³ / 32', (PI * x.d ** 3) / 32, 'mm³', 'Mukavemet');
  const Wt = R.s('Burulma direnç momenti', 'Wt = π·d³ / 16', (PI * x.d ** 3) / 16, 'mm³', 'Mukavemet');
  let M, y, t1, t2 = null, R1, R2;
  const F = x.F, L = x.L, EI = x.E * I;
  if (iki) {
    const a = x.a, b = L - a, s = Math.min(a, b);
    R1 = R.s('Sol yatak tepkisi', 'R1 = F·b / L', (F * b) / L, 'N', 'Mukavemet');
    R2 = R.s('Sağ yatak tepkisi', 'R2 = F·a / L', (F * a) / L, 'N', 'Mukavemet');
    M = R.s('En büyük eğilme momenti', 'M = F·a·b / L', (F * a * b) / L, 'N·mm', 'Mukavemet');
    y = R.s('En büyük sehim', 'y_max = F·s·(L² − s²)^1,5 / (9·√3·E·I·L)   (s = kısa kol)', (F * s * (L * L - s * s) ** 1.5) / (9 * Math.sqrt(3) * EI * L), 'mm', 'Mukavemet');
    R.s('Yük altındaki sehim', 'y_F = F·a²·b² / (3·E·I·L)', (F * a * a * b * b) / (3 * EI * L), 'mm', 'Mukavemet');
    t1 = R.s('Sol yatakta eğim', 'θ1 = F·b·(L² − b²) / (6·E·I·L)', (F * b * (L * L - b * b)) / (6 * EI * L), 'rad', 'Mukavemet');
    t2 = R.s('Sağ yatakta eğim', 'θ2 = F·a·(L² − a²) / (6·E·I·L)', (F * a * (L * L - a * a)) / (6 * EI * L), 'rad', 'Mukavemet');
  } else {
    R1 = R.s('Ankastre tepki', 'R = F', F, 'N', 'Mukavemet');
    M = R.s('En büyük eğilme momenti (ankastre)', 'M = F·L', F * L, 'N·mm', 'Mukavemet');
    y = R.s('Uç sehimi', 'y = F·L³ / (3·E·I)', (F * L ** 3) / (3 * EI), 'mm', 'Mukavemet');
    t1 = R.s('Uçta eğim', 'θ = F·L² / (2·E·I)', (F * L * L) / (2 * EI), 'rad', 'Mukavemet');
  }
  const sb = R.s('Eğilme gerilmesi', 'σ = M / Wb', M / Wb, 'MPa', 'Mukavemet');
  const tau = R.s('Burulma gerilmesi', 'τ = T / Wt   (T N·mm)', (x.T * 1000) / Wt, 'MPa', 'Mukavemet');
  const sv = R.s('Eşdeğer gerilme (von Mises)', 'σv = √(σ² + 3·τ²)', Math.sqrt(sb * sb + 3 * tau * tau), 'MPa', 'Mukavemet');
  const S = R.s('Statik güvenlik', 'S = Re / σv', sv > 0 ? x.Re / sv : Infinity, '—', 'Mukavemet');
  R.c(S >= x.Sgerek, 'hata', `Statik güvenlik ${Number.isFinite(S) ? S.toFixed(2) : '∞'}, istenen ≥ ${x.Sgerek}`);
  if (x.yIzin > 0) R.c(y <= x.yIzin, 'hata', `Sehim ${y.toFixed(4)} mm, izin verilen ${x.yIzin} mm`);
  const tmax = Math.max(t1, t2 ?? 0);
  if (x.tIzin > 0) R.c(tmax <= x.tIzin, 'hata', `${iki ? 'Yatakta' : 'Uçta'} eğim ${tmax.toFixed(5)} rad, izin verilen ${x.tIzin} rad (Shigley Tablo 7-2 yol gösterici değerler: sabit bilyalı rulman 0,001–0,003; silindirik makaralı 0,0008–0,0012; konik makaralı 0,0005–0,0012 rad)`);
  R.c(true, 'bilgi', 'Statik kontroldür. Dönen milde eğilme gerilmesi değişkendir: yorulma (DIN 743 / Shigley, kama yuvası, kademe ve çentik etkileri) ayrıca kontrol edilmelidir. Kendi ağırlığı ve kayış / dişli kuvvetinin yönü kullanıcı girdisine bağlıdır.');
  return { tur: 'mil', giris: x, sonuc: { I, Wb, Wt, R1, R2, M, y, t1, t2, sb, tau, sv, S }, adimlar: R.steps, kontroller: R.checks, uygun: R.checks.every((c) => c.ok || c.duzey !== 'hata') };
}

/* ======================= Rapor ======================= */
export const KAYNAK = {
  Dinamik: 'Newton mekaniği ve dönen kütle eylemsizliği (genel mühendislik bilgisi)',
  THK: 'Bilyalı vida kritik devir ve burkulma formülleri (THK genel katalog; ISO 3408 ile uyumlu sık kullanılan biçim)',
  'ISO 281': 'ISO 281:2007 Rulmanlar — Dinamik yük sayıları ve nominal ömür',
  Mukavemet: 'Mukavemet: kiriş eğilmesi, sehim ve eğim (Roark / Shigley), von Mises eşdeğer gerilmesi',
  Katalog: 'Üretici kataloğu değerleri (kullanıcı girdisi)',
};
export const BASLIK = { vida: 'Bilyalı vida tahrikli eksen: motor ve vida seçimi', rulman: 'Rulman ömrü (ISO 281)', pnomatik: 'Pnömatik silindir seçimi (ISO 15552 / ISO 6432)', kayis: 'Triger kayış tahrikli eksen: motor ve kayış', kremayer: 'Kremayer–pinyon tahrikli eksen: motor ve dişli', tabla: 'Döner tabla (indeksleme): motor ve redüktör', reduktor: 'Redüktör seçimi (katalog değerleriyle)', mil: 'Mil: eğilme, sehim, yatak eğimi ve statik gerilme' };

// rapordaki girdi adları ve birimleri
export const GIRDI_ADI = {
  m: ['Taşınan kütle', 'kg'], mu: ['Kılavuz sürtünme katsayısı μ', ''], aci: ['Eğim', '°'], Fdis: ['Dış kuvvet', 'N'], P: ['Vida hatvesi', 'mm'], d: ['Vida çapı', 'mm'], dr: ['Diş dibi çapı', 'mm'],
  L: ['Yataklar arası boy', 'mm'], mount: ['Yataklama', ''], etaS: ['Vida verimi ηv', ''], rho: ['Vida malzemesi yoğunluğu', 'kg/m³'], i: ['Aktarma oranı i', ''], etaG: ['Aktarma verimi ηr', ''],
  Jc: ['Kaplin ataleti', 'kg·m²'], strok: ['Strok', 'mm'], v: ['En yüksek hız', 'm/s'], ta: ['Hızlanma / yavaşlama süresi', 's'], td: ['Bekleme süresi', 's'], tutma: ['Beklemede tutan', ''],
  Jm: ['Motor rotor ataleti', 'kg·m²'], Tn: ['Motor anma torku', 'N·m'], Tmax: ['Motor en yüksek torku', 'N·m'], nmax: ['Motor en yüksek devri', 'dev/dk'], SF: ['Güvenlik katsayısı (RMS)', ''], oranSinir: ['İzin verilen atalet oranı', ': 1'],
  tip: ['Rulman tipi', ''], C: ['Dinamik yük sayısı C', 'N'], Fr: ['Radyal yük Fr', 'N'], Fa: ['Eksenel yük Fa', 'N'], X: ['X katsayısı', ''], Y: ['Y katsayısı', ''], n: ['Devir', 'dev/dk'], guv: ['Güvenilirlik', '%'], hedef: ['Hedef ömür', 'saat'],
  Dp: ['Kasnak / pinyon bölüm çapı', 'mm'], Jp: ['Kasnak / pinyon ataleti (her biri)', 'kg·m²'], mb: ['Kayış kütlesi', 'kg'], Fizin: ['İzin verilen kayış / dişli kuvveti', 'N'],
  M: ['Tabla kütlesi', 'kg'], Jek: ['Fikstür + parça ataleti', 'kg·m²'], tm: ['Hareket süresi', 's'], ka: ['Hızlanma payı', ''], Tsur: ['Tabla sürtünme torku', 'N·m'],
  T2rms: ['Sürekli (RMS) çıkış torku', 'N·m'], T2tepe: ['Tepe çıkış torku', 'N·m'], n2: ['Çıkış devri', 'dev/dk'], n1: ['Motor devri', 'dev/dk'], fs: ['Servis katsayısı fs', ''], T2N: ['Redüktör anma çıkış torku', 'N·m'], T2max: ['Redüktör en yüksek çıkış torku', 'N·m'], n1max: ['İzin verilen giriş devri', 'dev/dk'],
  durum: ['Yükleme durumu', ''], F: ['Kuvvet', 'N'], a: ['Yükün sol yatağa uzaklığı', 'mm'], T: ['İletilen tork', 'N·m'], E: ['Elastisite modülü', 'MPa'], Re: ['Akma dayanımı Re', 'MPa'], Sgerek: ['İstenen statik güvenlik', ''], yIzin: ['İzin verilen sehim (0 = kontrol yok)', 'mm'], tIzin: ['İzin verilen eğim (0 = kontrol yok)', 'rad'],
  D: ['Silindir iç çapı', 'mm'], Dt: ['Tabla çapı', 'mm'], p: ['Çalışma basıncı', 'bar'], yuk: ['Yük', 'N'], yon: ['Kuvvet yönü', ''], dinamik: ['Hareketli yük', ''], cevrim: ['Çevrim sayısı', '/dk'], eta: ['Kuvvet verimi', ''],
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
