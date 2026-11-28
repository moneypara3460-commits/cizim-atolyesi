// Mekatronik Mühendisliği — silindirik helisel basma yayı. Saf hesap; DOM gerektirmez (tests/meka-yay.test.mjs).
//
// Yay sabiti R = G·d⁴ / (8·D³·n)  (d tel çapı, D ortalama sarım çapı, n aktif sarım). Kuvvet F = R·(L₀ − L).
// Gerilme: τ = 8·F·D / (π·d³), Bergsträsser katsayısı k = (w + 0,5)/(w − 0,75), w = D/d; düzeltilmiş τ_k = k·τ.
// Statik sınır (EN 13906-1): τ ≤ 0,5·R_m. Blok boyu L_c = n_t·d (uçları taşlanmış). En küçük toplam ara boşluk
//   S_a = (0,0015·D²/d + 0,1·d)·n (EN 13906-1, statik) → en kısa çalışma boyu L_n = L_c + S_a.
// Yorulma (Zimmerli verisi, Goodman, Shigley bölüm 10): bilyesiz S_sa = 241, S_sm = 379 MPa; bilyeli 398 / 534 MPa;
//   S_su = 0,67·R_m, S_se = S_sa / (1 − S_sm/S_su), emniyet n_f = 1 / (τ_a/S_se + τ_m/S_su) (τ_a, τ_m Bergsträsser ile).
// Burkulma (Shigley): λ = α·L₀/D, C₁ = E/(2(E − G)), C₂ = 2π²(E − G)/(2G + E), kritik çökme s_cr = L₀·C₁·(1 − √(1 − C₂/λ²)).
// Doğal frekans (iki ucu plakalı): f = ½·√(R/m), m = ρ·π²·d²·D·n/4.
const PI = Math.PI;
const tf = (v, d) => v.toFixed(d).replace('.', ',');
const num = (v, d) => (Number.isFinite(+v) ? +v : d);
// R_m: tel çapına göre yaklaşık en düşük çekme dayanımı (MPa), log(d) ile ara değer — kesin değer tel sertifikasından
const RM_DH = [[0.5, 2480], [1, 2230], [1.5, 2080], [2, 1980], [3, 1840], [4, 1740], [5, 1670], [6, 1610], [8, 1520], [10, 1430], [12, 1360], [16, 1260], [20, 1180]];
const RM_NS = [[0.5, 2150], [1, 1900], [1.5, 1800], [2, 1700], [3, 1550], [4, 1480], [5, 1400], [6, 1350], [8, 1250], [10, 1200], [12, 1150]];
export const MALZEME = {
  dh: { ad: 'Patentli yay teli (EN 10270-1 DH)', G: 81500, E: 206000, rho: 7850, T: RM_DH },
  ns: { ad: 'Paslanmaz yay teli 1.4310 (EN 10270-3 NS)', G: 70000, E: 185000, rho: 7900, T: RM_NS },
  ozel: { ad: 'Elle gir', G: 81500, E: 206000, rho: 7850, T: null },
};
export const UCLAR = [[0.5, 'İki ucu düz plakalar arasında (paralel)'], [0.707, 'Bir ucu düz, öbürü mafsallı'], [1, 'İki ucu mafsallı / eğilebilir']];
export function rmTel(mat, d) {
  const T = MALZEME[mat] && MALZEME[mat].T; if (!T) return null;
  if (d <= T[0][0]) return T[0][1];
  if (d >= T.at(-1)[0]) return T.at(-1)[1];
  for (let i = 1; i < T.length; i++) if (d <= T[i][0]) { const [d0, r0] = T[i - 1], [d1, r1] = T[i], u = Math.log(d / d0) / Math.log(d1 / d0); return r0 + (r1 - r0) * u; }
  return null;
}
export const YAY_DEFAULTS = { d: 2, D: 16, n: 8, nt: 10, L0: 50, L1: 42, L2: 32, mat: 'dh', Rm: 1980, G: 81500, uc: 0.5, dinamik: 'evet', bilye: 'hayir', f: 60 };
// "Ambalaj makinesi kapak yayı" şablonu (temsilî)
export const YAY_ORNEK = () => ({ ...YAY_DEFAULTS, d: 2.5, D: 20, n: 8, nt: 10, L0: 60, L1: 50, L2: 38, mat: 'dh', uc: 0.5, dinamik: 'evet', bilye: 'hayir', f: 60 });

export function yaySanitize(o) {
  const x = o && typeof o === 'object' ? o : {}, D = YAY_DEFAULTS, out = {};
  for (const k of Object.keys(D)) out[k] = typeof D[k] === 'number' ? num(x[k], D[k]) : (typeof x[k] === 'string' ? x[k] : D[k]);
  if (!(out.mat in MALZEME)) out.mat = 'dh';
  if (out.dinamik !== 'hayir') out.dinamik = 'evet';
  if (out.bilye !== 'evet') out.bilye = 'hayir';
  if (![0.5, 0.707, 1].includes(out.uc)) out.uc = 0.5;
  return out;
}
export const sabit = (G, d, D, n) => G * d ** 4 / (8 * D ** 3 * n);
export const bergstrasser = (w) => (w + 0.5) / (w - 0.75);
export const tau = (F, D, d) => 8 * F * D / (PI * d ** 3);
export function burkulma(L0, D, alfa, E, G) {
  const lam = alfa * L0 / D, C1 = E / (2 * (E - G)), C2 = 2 * PI * PI * (E - G) / (2 * G + E);
  if (lam * lam <= C2) return { lam, kararli: true, scr: Infinity, sinir: D / alfa * Math.sqrt(C2) };
  return { lam, kararli: false, scr: L0 * C1 * (1 - Math.sqrt(1 - C2 / (lam * lam))), sinir: D / alfa * Math.sqrt(C2) };
}
// istenen yay sabitinden aktif sarım sayısı
export const sarimdanR = (G, d, D, R) => G * d ** 4 / (8 * D ** 3 * R);

export function yayHesap(g0) {
  const g = yaySanitize(g0), { d, D, n, nt, L0, L1, L2 } = g, M = MALZEME[g.mat];
  if (!(d > 0 && D > d && n > 0 && nt >= n && L0 > 0)) return { g, hata: 'Tel çapı, sarım çapı (telden büyük), aktif sarım ve serbest boy sıfırdan büyük; toplam sarım aktif sarımdan az olmamalı' };
  if (!(L1 <= L0 && L2 < L1 && L2 > 0)) return { g, hata: 'Boylar sırayla küçülmeli: serbest boy ≥ montaj boyu > en kısa çalışma boyu > 0' };
  const G = g.mat === 'ozel' ? g.G : M.G, E = g.mat === 'ozel' ? G * 2.53 : M.E, Rm = g.mat === 'ozel' ? g.Rm : rmTel(g.mat, d);
  if (!(Rm > 0 && G > 0)) return { g, hata: 'Malzemenin çekme dayanımını ve kayma modülünü gir' };
  const R = sabit(G, d, D, n), w = D / d, k = bergstrasser(w), Lc = nt * d, Sa = (0.0015 * D * D / d + 0.1 * d) * n, Ln = Lc + Sa;
  const F1 = R * (L0 - L1), F2 = R * (L0 - L2), Fn = R * (L0 - Ln), Fc = R * (L0 - Lc);
  const t1 = tau(F1, D, d), t2 = tau(F2, D, d), tc = tau(Fc, D, d), tzul = 0.5 * Rm;
  const tk1 = k * t1, tk2 = k * t2, ta = (tk2 - tk1) / 2, tm = (tk2 + tk1) / 2;
  const [Ssa, Ssm] = g.bilye === 'evet' ? [398, 534] : [241, 379], Ssu = 0.67 * Rm, Sse = Ssa / (1 - Ssm / Ssu);
  const nf = ta > 0 ? 1 / (ta / Sse + tm / Ssu) : Infinity, ns = tzul / t2;
  const bk = burkulma(L0, D, g.uc, E, G), s2 = L0 - L2;
  const m = M.rho * PI * PI * d * d * D * n / 4 * 1e-9, fn = 0.5 * Math.sqrt(R * 1000 / m), fz = g.f / 60;
  const Da = D + d, Di = D - d, egim = (L0 - Lc) / n + d;  // sarım adımı (yaklaşık)
  const K = [], ok = (bb, duzey, metin) => K.push({ ok: bb, duzey, metin });
  ok(w >= 4 && w <= 16, w < 3 || w > 20 ? 'hata' : 'uyari', w >= 4 && w <= 16 ? `Sarım oranı D/d = ${tf(w, 2)} — iyi (4–16).` : `Sarım oranı D/d = ${tf(w, 2)}: ${w < 4 ? 'çok sıkı sarım, tel sarılırken zorlanır ve gerilme yükselir' : 'çok gevşek sarım, yay kolay burkulur ve ölçüsü tutmaz'} (4–16 önerilir).`);
  ok(n >= 3, n < 2 ? 'hata' : 'uyari', n >= 3 ? `${tf(n, 1)} aktif sarım.` : `Aktif sarım ${tf(n, 1)}: çok az; yay sabiti tutmaz (en az 3 önerilir).`);
  ok(L2 >= Ln - 1e-9, L2 < Lc ? 'hata' : 'uyari', L2 >= Ln - 1e-9 ? `En kısa çalışma boyu ${tf(L2, 1)} mm, sarımlar arasında yeterli boşluk kalıyor (en az ${tf(Ln, 1)} mm).` : L2 < Lc ? `En kısa çalışma boyu ${tf(L2, 1)} mm blok boyundan (${tf(Lc, 1)} mm) kısa: yay o kadar sıkışamaz.` : `En kısa çalışma boyu ${tf(L2, 1)} mm, sarımlar neredeyse birbirine değiyor (en az ${tf(Ln, 1)} mm önerilir): sürtünme ve kırılma riski.`);
  ok(ns >= 1, 'hata', ns >= 1 ? `En kısa boyda kayma gerilmesi ${tf(t2, 0)} MPa / izin verilen ${tf(tzul, 0)} MPa (statik emniyet ${tf(ns, 2)}).` : `En kısa boyda kayma gerilmesi ${tf(t2, 0)} MPa, izin verilenden (${tf(tzul, 0)} MPa) fazla: yay kalıcı olarak kısalır (oturur). Tel çapını büyüt ya da sarım çapını küçült.`);
  ok(tc <= tzul, 'uyari', tc <= tzul ? 'Yay tam sıkışsa (blok) bile oturmaz.' : `Yay tam sıkışırsa (blok) gerilme ${tf(tc, 0)} MPa olur, izin verilenin üstü: bir kaza sıkışmasında kalıcı kısalır. Mümkünse mekanik dayama koy.`);
  if (g.dinamik === 'evet') {
    ok(nf >= 1.3, nf < 1 ? 'hata' : 'uyari', nf >= 1.3 ? `Yorulma emniyeti ${tf(nf, 2)} — sürekli çalışma için yeterli (≥ 1,3).` : `Yorulma emniyeti ${tf(nf, 2)} (en az 1,3 istenir): yay zamanla kırılır. ${g.bilye === 'hayir' ? 'Bilyeli dövülmüş (shot peened) tel seç ya da ' : ''}kursu azalt veya tel çapını büyüt.`);
    if (g.f > 0) ok(fn >= 15 * fz, fn < 5 * fz ? 'hata' : 'uyari', fn >= 15 * fz ? `Yayın doğal frekansı ${tf(fn, 0)} Hz, çalışma hızının (${tf(fz, 2)} Hz) ${tf(fn / fz, 0)} katı — titreşim sorunu yok.` : `Yayın doğal frekansı ${tf(fn, 0)} Hz, çalışma hızına (${tf(fz, 2)} Hz) yakın (en az 15 katı önerilir): yay titreşip vurur.`);
  }
  ok(bk.kararli || s2 < bk.scr, 'uyari', bk.kararli ? 'Yay burkulmaz (her kurs için kararlı).' : s2 < bk.scr ? `Burkulma: ${tf(bk.scr, 1)} mm çökmeden sonra burkulur; kursun (${tf(s2, 1)} mm) altında — sorun yok.` : `Burkulma: yay ${tf(bk.scr, 1)} mm çökmede yana kaçar, kurs ${tf(s2, 1)} mm. İçine mil ya da dışına kovan koy, ya da sarım çapını büyüt.`);
  const res = { g, G, E, Rm, R, w, k, Lc, Sa, Ln, F1, F2, Fn, Fc, t1, t2, tc, tk1, tk2, ta, tm, tzul, ns, nf, Ssu, Sse, burk: bk, s2, kutle: m * 1000, fn, Da, Di, adim: egim, kontroller: K };
  res.uygun = K.every((q) => q.ok || q.duzey !== 'hata');
  return res;
}
export function yayRapor(r, ad = '') {
  const g = r.g, f = (v, d = 2) => v.toFixed(d), L = ['ÇİZİM ATÖLYESİ — BASMA YAYI HESAP RAPORU', ad, ''];
  L.push('GİRDİLER', `  Tel çapı d ${g.d} mm · ortalama sarım çapı D ${g.D} mm (dış ${f(r.Da)}, iç ${f(r.Di)} mm) · aktif sarım ${g.n} · toplam sarım ${g.nt}`,
    `  Serbest boy ${g.L0} mm · montaj boyu ${g.L1} mm · en kısa çalışma boyu ${g.L2} mm · uçlar taşlanmış`,
    `  Malzeme: ${g.mat === 'ozel' ? 'elle girilen' : MALZEME[g.mat].ad} · R_m ${f(r.Rm, 0)} MPa · G ${r.G} MPa · ${g.dinamik === 'evet' ? `sürekli çalışma, ${g.f} çevrim/dk, ${g.bilye === 'evet' ? 'bilyeli dövülmüş' : 'bilyesiz'}` : 'statik (az tekrarlı) yük'}`,
    '', 'SONUÇLAR', `  Yay sabiti ${f(r.R, 3)} N/mm · sarım oranı ${f(r.w, 2)} · Bergsträsser k ${f(r.k, 3)} · yay kütlesi ${f(r.kutle, 1)} g`,
    `  F₁ ${f(r.F1, 1)} N (montaj) · F₂ ${f(r.F2, 1)} N (en kısa boy) · blok boyu ${f(r.Lc)} mm · en kısa izin verilen boy ${f(r.Ln)} mm`,
    `  Kayma gerilmesi τ₁ ${f(r.t1, 0)} · τ₂ ${f(r.t2, 0)} · blokta ${f(r.tc, 0)} MPa · izin verilen 0,5·R_m = ${f(r.tzul, 0)} MPa · statik emniyet ${f(r.ns, 2)}`);
  if (g.dinamik === 'evet') L.push(`  Yorulma: τ_k1 ${f(r.tk1, 0)} · τ_k2 ${f(r.tk2, 0)} MPa · genlik ${f(r.ta, 0)} · ortalama ${f(r.tm, 0)} MPa · emniyet ${Number.isFinite(r.nf) ? f(r.nf, 2) : '∞'} · doğal frekans ${f(r.fn, 0)} Hz`);
  L.push(`  Burkulma: ${r.burk.kararli ? 'kararlı (burkulmaz)' : `kritik çökme ${f(r.burk.scr, 1)} mm`} · kurs ${f(r.s2, 1)} mm`,
    '', 'KONTROLLER', ...r.kontroller.map((c) => '  ' + (c.ok ? '✓ ' : c.duzey === 'hata' ? '✗ ' : '⚠ ') + c.metin),
    '', 'YÖNTEM', '  EN 13906-1 (yay sabiti, Bergsträsser katsayısı, 0,5·R_m statik sınır, en küçük ara boşluk); yorulma Zimmerli verisi ve Goodman doğrusu,',
    '  burkulma ve doğal frekans Shigley (Mechanical Engineering Design, bölüm 10). R_m tel çapına göre yaklaşık en düşük değerdir; tel sertifikasından doğrula.',
    '  Ön boyutlandırmadır; seri üretimden önce yay üreticisinin onayı gerekir.');
  return L;
}
