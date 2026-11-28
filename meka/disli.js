// Mekatronik Mühendisliği — düz dişli çark mukavemeti (diş dibi kırılması ve yüzey ezilmesi). Saf hesap (tests/meka-disli.test.mjs).
//
// Düz dişli, α = 20°, profil kaydırmasız (x = 0), çelik–çelik. ISO 6336'nın sadeleştirilmiş biçimi:
//   Yüzey (pitting):  σH = Z_H·Z_E·Z_ε·√(F_t/(b·d₁)·(u + 1)/u · K_A·K_v·K_Hβ),  Z_H = √(2/(sin α cos α)) = 2,495,  Z_E = 189,8 √MPa,
//                     Z_ε = √((4 − ε_α)/3);  emniyet S_H = σ_Hlim / σH.
//   Diş dibi:         σF = F_t/(b·m)·Y_FS·Y_ε·K_A·K_v·K_Fβ,  Y_ε = 0,25 + 0,75/ε_α,
//                     Y_FS ≈ 3,47 + 13,2/z (birleşik form ve çentik katsayısı, x = 0 için yaklaşık);  S_F = 2·σ_Flim / σF.
//   Kavrama oranı ε_α = (√(r_a1² − r_b1²) + √(r_a2² − r_b2²) − a·sin α) / (π·m·cos α).
//   Dinamik katsayı K_v (AGMA 2001): B = 0,25·(12 − Q_v)^(2/3), A = 50 + 56·(1 − B), K_v = ((A + √(200·v))/A)^B, v m/s.
// Ömür, yağlama, boyut ve pürüzlülük katsayıları 1 alınır (uzun ömür, ≥ 10⁷ yük tekrarı). Ön boyutlandırmadır.
const PI = Math.PI;
const tf = (v, d) => v.toFixed(d).replace('.', ',');
const num = (v, d) => (Number.isFinite(+v) ? +v : d);
const AL = 20 * PI / 180;
export const ZH = Math.sqrt(2 / (Math.sin(AL) * Math.cos(AL))), ZE = 189.8;
// tipik (yaklaşık) sınır gerilmeleri, MPa — kesin değer malzeme sertifikası / ISO 6336-5'ten girilmeli
export const MALZEME = {
  c45n: { ad: 'C45 normalize (~190 HB)', H: 520, F: 200 },
  c45q: { ad: 'C45 ıslah (~220 HB)', H: 580, F: 220 },
  crmo: { ad: '42CrMo4 ıslah (~300 HB)', H: 720, F: 290 },
  ind: { ad: '42CrMo4 indüksiyonla sertleştirilmiş', H: 1150, F: 350 },
  sem: { ad: '16MnCr5 sementasyon (sertleştirilmiş)', H: 1450, F: 430 },
  ozel: { ad: 'Elle gir', H: 0, F: 0 },
};
export const KALITE = [[11, 'Hassas taşlanmış'], [9, 'Taşlanmış / tıraşlanmış'], [8, 'Azdırma, iyi'], [7, 'Azdırma, normal'], [6, 'Kaba']];
export const DARBE = [[1, 'Düzgün (elektrik motoru, düzgün yük)'], [1.25, 'Hafif darbeli'], [1.5, 'Orta darbeli'], [1.75, 'Ağır darbeli (pres, kırıcı)']];
export const MODULLER = [0.5, 0.6, 0.7, 0.8, 0.9, 1, 1.25, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10, 12, 16, 20, 25];  // DIN 780, 1. dizi
export const DISLI_DEFAULTS = { m: 2, z1: 20, z2: 50, b: 20, T1: 20, n1: 1400, KA: 1, Qv: 8, KB: 1.15, mat1: 'c45q', mat2: 'c45q', H1: 580, F1: 220, H2: 580, F2: 220, SHmin: 1.1, SFmin: 1.4 };
// "Konveyör redüktörü ilk kademe" şablonu (temsilî): 1,5 kW, 1400 d/dk, 1:3,15
export const DISLI_ORNEK = () => ({ ...DISLI_DEFAULTS, m: 2, z1: 20, z2: 63, b: 25, T1: 10.2, n1: 1400, KA: 1.25, Qv: 8, KB: 1.15, mat1: 'crmo', mat2: 'c45q' });

export function disliSanitize(o) {
  const x = o && typeof o === 'object' ? o : {}, D = DISLI_DEFAULTS, out = {};
  for (const k of Object.keys(D)) out[k] = typeof D[k] === 'number' ? num(x[k], D[k]) : (typeof x[k] === 'string' && (k.startsWith('mat') ? x[k] in MALZEME : true) ? x[k] : D[k]);
  return out;
}
export const YFS = (z) => 3.47 + 13.2 / z;
export function kavrama(m, z1, z2) {
  const r1 = m * z1 / 2, r2 = m * z2 / 2, a = r1 + r2, c = Math.cos(AL);
  return (Math.sqrt((r1 + m) ** 2 - (r1 * c) ** 2) + Math.sqrt((r2 + m) ** 2 - (r2 * c) ** 2) - a * Math.sin(AL)) / (PI * m * c);
}
export function dinamik(v, Qv) {
  const B = 0.25 * (12 - Qv) ** (2 / 3), A = 50 + 56 * (1 - B);
  return { Kv: ((A + Math.sqrt(200 * v)) / A) ** B, vmax: (A + (Qv - 3)) ** 2 / 200 };
}
const sinir = (g, i) => (g['mat' + i] === 'ozel' ? { H: g['H' + i], F: g['F' + i] } : MALZEME[g['mat' + i]]);

// m ile verilen dişli çiftinin gerilme ve emniyetleri
export function gerilme(g, m = g.m) {
  const { z1, z2, b, T1, n1 } = g, d1 = m * z1, d2 = m * z2, u = z2 / z1, a = (d1 + d2) / 2;
  const Ft = 2000 * T1 / d1, v = PI * d1 * n1 / 60000, ea = kavrama(m, z1, z2), dy = dinamik(v, g.Qv), K = g.KA * dy.Kv * g.KB;
  const sH = ZH * ZE * Math.sqrt((4 - ea) / 3) * Math.sqrt(Ft / (b * d1) * (u + 1) / u * K);
  const Ye = 0.25 + 0.75 / ea, sF1 = Ft / (b * m) * YFS(z1) * Ye * K, sF2 = Ft / (b * m) * YFS(z2) * Ye * K;
  const L1 = sinir(g, 1), L2 = sinir(g, 2), Hlim = Math.min(L1.H, L2.H);
  const SH = Hlim / sH, SF1 = 2 * L1.F / sF1, SF2 = 2 * L2.F / sF2;
  return { m, d1, d2, u, a, Ft, v, ea, Kv: dy.Kv, vmax: dy.vmax, K, sH, sF1, sF2, Hlim, F1lim: L1.F, F2lim: L2.F, SH, SF1, SF2 };
}
// emniyetleri sağlayan en küçük standart modül (diş sayıları ve genişlik sabit)
export function modulOner(g) {
  for (const m of MODULLER) { const s = gerilme(g, m); if (s.SH >= g.SHmin && Math.min(s.SF1, s.SF2) >= g.SFmin) return m; }
  return null;
}

export function disliHesap(g0) {
  const g = disliSanitize(g0);
  if (!(g.m > 0 && g.b > 0 && g.n1 > 0 && g.T1 > 0)) return { g, hata: 'Modül, diş genişliği, devir ve tork sıfırdan büyük olmalı' };
  if (!(g.z1 >= 6 && g.z2 >= 6)) return { g, hata: 'Diş sayıları en az 6 olmalı' };
  const L1 = sinir(g, 1), L2 = sinir(g, 2);
  if (!(L1.H > 0 && L1.F > 0 && L2.H > 0 && L2.F > 0)) return { g, hata: 'Malzemenin sınır gerilmelerini (σHlim ve σFlim) gir' };
  const s = gerilme(g), K = [], ok = (bb, duzey, metin) => K.push({ ok: bb, duzey, metin });
  const zmin = Math.min(g.z1, g.z2);
  ok(zmin >= 17, zmin < 14 ? 'hata' : 'uyari', zmin >= 17 ? 'Diş sayıları alttan kesme sınırının (17) üstünde.' : `${zmin} dişli çarkta diş dibi alttan kesilir (profil kaydırmasız sınır 17, pratikte 14): diş zayıflar. Diş sayısını artır ya da profil kaydırmalı dişli kullan.`);
  ok(s.ea >= 1.2, 'uyari', s.ea >= 1.2 ? `Kavrama oranı ${tf(s.ea, 2)} — yeterli (1,2 ve üstü).` : `Kavrama oranı ${tf(s.ea, 2)}: aynı anda kavrayan diş az, hareket sarsıntılı olur.`);
  const bm = g.b / g.m, bd = g.b / s.d1;
  ok(bm >= 6 && bm <= 25 && bd <= 1.2, 'uyari', bm >= 6 && bm <= 25 && bd <= 1.2 ? `Diş genişliği ${tf(bm, 1)}·m — uygun aralıkta.` : `Diş genişliği ${tf(bm, 1)}·m (genişlik / küçük çark çapı ${tf(bd, 2)}): ${bm < 6 ? 'dar, diş yükü taşıyamayabilir' : 'geniş, yük diş boyunca eşit dağılmaz; yük dağılım katsayısını büyüt'} (6·m–25·m ve çapın en çok 1,2 katı önerilir).`);
  if (s.v > s.vmax) ok(false, 'uyari', `Çevre hızı ${tf(s.v, 1)} m/s bu kalite için yüksek (en çok ${tf(s.vmax, 1)} m/s): daha hassas dişli seç.`);
  ok(s.SH >= g.SHmin, s.SH < 1 ? 'hata' : 'uyari', s.SH >= g.SHmin ? `Yüzey ezilmesine karşı emniyet ${tf(s.SH, 2)} — yeterli (en az ${tf(g.SHmin, 2)}).` : `Yüzey ezilmesine karşı emniyet ${tf(s.SH, 2)} (en az ${tf(g.SHmin, 2)} istenir): diş yüzeyi zamanla çukurlaşır (pitting). Modülü ya da genişliği büyüt ya da daha sert malzeme seç.`);
  const SF = Math.min(s.SF1, s.SF2), hangi = s.SF1 <= s.SF2 ? 'küçük çark (pinyon)' : 'büyük çark';
  ok(SF >= g.SFmin, SF < 1 ? 'hata' : 'uyari', SF >= g.SFmin ? `Diş kırılmasına karşı emniyet ${tf(SF, 2)} — yeterli (en az ${tf(g.SFmin, 2)}).` : `Diş kırılmasına karşı emniyet ${tf(SF, 2)}, zayıf olan ${hangi} (en az ${tf(g.SFmin, 2)} istenir). Modülü büyüt.`);
  const Tmax = Math.min(g.T1 * (s.SH / g.SHmin) ** 2, g.T1 * SF / g.SFmin), mOner = modulOner(g);
  ok(true, 'bilgi', `Bu dişliler küçük çarkta en çok ~${tf(Tmax, 1)} N·m taşır (istenen emniyetlerle).` + (mOner != null && mOner !== g.m ? ` Bu yük için yeten en küçük standart modül: ${tf(mOner, 2)}.` : ''));
  const res = { g, ...s, Tmax, mOner, P: g.T1 * 2 * PI * g.n1 / 60 / 1000, n2: g.n1 * g.z1 / g.z2, T2: g.T1 * g.z2 / g.z1, kontroller: K };
  res.uygun = K.every((q) => q.ok || q.duzey !== 'hata');
  return res;
}
export function disliRapor(r, ad = '') {
  const g = r.g, f = (v, d = 2) => v.toFixed(d), L = ['ÇİZİM ATÖLYESİ — DÜZ DİŞLİ MUKAVEMET RAPORU', ad, ''];
  const mt = (i) => g['mat' + i] === 'ozel' ? `elle girilen (σHlim ${g['H' + i]}, σFlim ${g['F' + i]} MPa)` : MALZEME[g['mat' + i]].ad + ` (σHlim ${MALZEME[g['mat' + i]].H}, σFlim ${MALZEME[g['mat' + i]].F} MPa)`;
  L.push('GİRDİLER', `  Modül ${g.m} mm · z₁ = ${g.z1} · z₂ = ${g.z2} · diş genişliği ${g.b} mm · α = 20° · profil kaydırma yok`,
    `  Küçük çark torku ${g.T1} N·m · ${g.n1} d/dk (${f(r.P, 3)} kW) · darbe katsayısı K_A ${g.KA} · kalite Q_v ${g.Qv} · yük dağılımı K_Hβ = K_Fβ ${g.KB}`,
    `  Küçük çark: ${mt(1)}`, `  Büyük çark: ${mt(2)}`,
    '', 'SONUÇLAR', `  d₁ ${f(r.d1)} mm · d₂ ${f(r.d2)} mm · eksen mesafesi ${f(r.a)} mm · oran ${f(r.u, 3)} · çıkış ${f(r.n2, 1)} d/dk, ${f(r.T2, 2)} N·m`,
    `  Çevre kuvveti ${f(r.Ft, 1)} N · çevre hızı ${f(r.v, 2)} m/s · kavrama oranı ${f(r.ea, 3)} · K_v ${f(r.Kv, 3)} · toplam yük katsayısı ${f(r.K, 3)}`,
    `  Yüzey basıncı σH ${f(r.sH, 1)} MPa / sınır ${r.Hlim} MPa → S_H ${f(r.SH, 3)}`,
    `  Diş dibi σF₁ ${f(r.sF1, 1)} MPa (Y_FS ${f(YFS(g.z1), 3)}) → S_F₁ ${f(r.SF1, 3)} · σF₂ ${f(r.sF2, 1)} MPa (Y_FS ${f(YFS(g.z2), 3)}) → S_F₂ ${f(r.SF2, 3)}`,
    `  Taşınabilecek en büyük tork (S_H ≥ ${g.SHmin}, S_F ≥ ${g.SFmin}): ${f(r.Tmax, 2)} N·m` + (r.mOner != null ? ` · yeten en küçük standart modül ${r.mOner}` : ''),
    '', 'KONTROLLER', ...r.kontroller.map((c) => '  ' + (c.ok ? (c.duzey === 'bilgi' ? 'ℹ ' : '✓ ') : c.duzey === 'hata' ? '✗ ' : '⚠ ') + c.metin),
    '', 'YÖNTEM', '  ISO 6336\'nın sadeleştirilmiş biçimi: düz dişli, α = 20°, x = 0, çelik–çelik (Z_E 189,8). Y_FS ≈ 3,47 + 13,2/z yaklaşık; K_v AGMA 2001',
    '  formülüyle. Ömür, yağlama, boyut ve pürüzlülük katsayıları 1 (uzun ömür). Malzeme değerleri tipik olup sertifikadan doğrulanmalı.',
    '  Ön boyutlandırmadır; üretimden önce tam ISO 6336 hesabı ya da dişli üreticisinin onayı gerekir.');
  return L;
}
