// Delik sihirbazı: metrik ISO vida delikleri (düz geçiş, kılavuz, kademeli, havşa) — ölçü tabloları ve delik kesiti.
// Saf hesap modülü (tarayıcıdan ve Node testlerinden kullanılır). Bütün ölçüler mm.
//
// Kaynaklar (her değer en az iki kaynakla karşılaştırıldı, 19.11.2026):
// - Diş adımı (kaba / ince): ISO 261 / ISO 262 — Optimas "tapping sizes", HP Academy tapping chart, Albany County
//   Fasteners metrik vida çizelgesi, Made Good Designs vida çizelgesi.
// - Kılavuz matkabı (piyasadaki matkap çapına yuvarlanmış önerilen değer): kaba diş — HP Academy tapping chart,
//   Five Flute, TR Fastenings, Fractory (M8 6,8 · M12 10,2); ince diş — HP Academy (M8×1 7 · M10×1,25 8,8 · M10×1 9 ·
//   M12×1,5 10,5 · M12×1,25 10,8) ve TR Fastenings ince sütunu (M14 12,5 · M16 14,5 · M18 16,5 · M20 18,5 · M24 22).
// - Geçiş deliği: ISO 273:1979 ince / orta / kaba seri (H12 / H13 / H14) — IS 1821:1987 (ISO 273 ile özdeş), Albany
//   County Fasteners ISO 273 çizelgesi, Made Good Designs, TR Fastenings (orta seri).
// - Havşa (90°, ISO 7721 başlı vidalar: ISO 2009, ISO 7046 …): ISO 15065:2005 Tablo 1 (resmî örnek sayfa) — D_c en büyük;
//   derinlik t ≈ (D_c,max − d_h,min) / 2 tablodaki t değeriyle uyuşur.
// - Alyan havşa başlı vida (ISO 10642, 90°): baş çapı dk (teorik keskin, en büyük) — Böllhoff ISO 10642 veri sayfası,
//   AIMS Industrial ISO 10642 çizelgesi, ASME B18.3.5M (aynı değerler). Havşa çapı = dk: baş yüzeyle aynı hizada kalır.
// - Kademe (alyan başlı ISO 4762 için): çap X — Machinery's Handbook 31. baskı Tablo 5 (ASME B18.3.1M), AmesWeb
//   "Counterbore hole dimensions chart"; derinlik H = baş yüksekliği k en büyük = d (ISO 4762; TR Fastenings çizelgesi).

// kaba adım (ISO 261/262)
export const KABA = { 'M1.6': 0.35, M2: 0.4, 'M2.5': 0.45, M3: 0.5, M4: 0.7, M5: 0.8, M6: 1, M8: 1.25, M10: 1.5, M12: 1.75, M14: 2, M16: 2, M18: 2.5, M20: 2.5, M24: 3 };
// yaygın ince adımlar (ISO 261)
export const INCE = { M8: [1], M10: [1.25, 1], M12: [1.5, 1.25], M14: [1.5], M16: [1.5], M18: [1.5], M20: [1.5], M24: [2] };
export const OLCULER = Object.keys(KABA);
// kılavuz matkabı: kaba diş ve ince diş (ölçü → { adım: matkap })
export const MATKAP = {
  'M1.6': { 0.35: 1.25 }, M2: { 0.4: 1.6 }, 'M2.5': { 0.45: 2.05 }, M3: { 0.5: 2.5 }, M4: { 0.7: 3.3 }, M5: { 0.8: 4.2 }, M6: { 1: 5 },
  M8: { 1.25: 6.8, 1: 7 }, M10: { 1.5: 8.5, 1.25: 8.8, 1: 9 }, M12: { 1.75: 10.2, 1.5: 10.5, 1.25: 10.8 }, M14: { 2: 12, 1.5: 12.5 },
  M16: { 2: 14, 1.5: 14.5 }, M18: { 2.5: 15.5, 1.5: 16.5 }, M20: { 2.5: 17.5, 1.5: 18.5 }, M24: { 3: 21, 2: 22 },
};
export const capOf = (m) => parseFloat(String(m).slice(1));
// ISO 273: [ince, orta, kaba]
export const GECIS = {
  'M1.6': [1.7, 1.8, 2], M2: [2.2, 2.4, 2.6], 'M2.5': [2.7, 2.9, 3.1], M3: [3.2, 3.4, 3.6], M4: [4.3, 4.5, 4.8], M5: [5.3, 5.5, 5.8],
  M6: [6.4, 6.6, 7], M8: [8.4, 9, 10], M10: [10.5, 11, 12], M12: [13, 13.5, 14.5], M14: [15, 15.5, 16.5], M16: [17, 17.5, 18.5],
  M18: [19, 20, 21], M20: [21, 22, 24], M24: [25, 26, 28],
};
export const SERI = { ince: 0, orta: 1, kaba: 2 };
export const SERI_AD = { ince: 'ince (H12)', orta: 'orta (H13)', kaba: 'kaba (H14)' };
// ISO 15065 havşa çapı D_c en büyük (M1,6 … M10)
export const HAVSA_15065 = { 'M1.6': 3.7, M2: 4.5, 'M2.5': 5.6, M3: 6.5, M4: 9.6, M5: 10.65, M6: 12.85, M8: 17.55, M10: 20.3 };
// ISO 10642 baş çapı dk (teorik, en büyük)
export const HAVSA_10642 = { M3: 6.72, M4: 8.96, M5: 11.2, M6: 13.44, M8: 17.92, M10: 22.4, M12: 26.88, M16: 33.6, M20: 40.32 };
// ISO 4762 kademe çapı X (ASME B18.3.1M)
export const KADEME = { 'M1.6': 3.5, M2: 4.4, 'M2.5': 5.4, M3: 6.5, M4: 8.25, M5: 9.75, M6: 11.25, M8: 14.25, M10: 17.25, M12: 19.25, M14: 22.25, M16: 25.5, M20: 31.5, M24: 37.5 };

export const TURLER = { duz: 'Düz geçiş deliği', klavuz: 'Kılavuz (dişli)', kademe: 'Kademeli (alyan başı)', havsa: 'Havşa' };
export const HAVSA_STD = { 'iso15065': 'ISO 15065 (yıldız / düz havşa başlı)', 'iso10642': 'ISO 10642 (alyan havşa başlı)' };
const r2 = (v) => Math.round(v * 1000) / 1000;
const tf = (v) => String(r2(v)).replace('.', ',');
export const MATKAP_UCU = 118;                         // standart helis matkap uç açısı (°)
export const ucBoyu = (d) => (d / 2) / Math.tan((MATKAP_UCU / 2) * Math.PI / 180);

// tür için geçerli ölçüler
export function olculer(tur, havsaStd = 'iso15065') {
  if (tur === 'kademe') return OLCULER.filter((m) => KADEME[m]);
  if (tur === 'havsa') return OLCULER.filter((m) => (havsaStd === 'iso10642' ? HAVSA_10642 : HAVSA_15065)[m]);
  return OLCULER.slice();
}
export const adimlar = (m) => [KABA[m], ...(INCE[m] || [])].filter(Boolean);

// Ayarları denetle ve varsayılanlarla tamamla. o: { tur, olcu, adim, seri, havsaStd, boydan, derinlik, uc, disBoyu, kademeDer }
export function normalize(o = {}) {
  const tur = TURLER[o.tur] ? o.tur : 'klavuz';
  const havsaStd = HAVSA_STD[o.havsaStd] ? o.havsaStd : 'iso15065';
  const list = olculer(tur, havsaStd);
  const olcu = list.includes(o.olcu) ? o.olcu : (list.includes('M6') ? 'M6' : list[0]);
  const ad = adimlar(olcu), adim = ad.some((p) => Math.abs(p - +o.adim) < 1e-9) ? +o.adim : KABA[olcu];
  const seri = SERI[o.seri] != null ? o.seri : 'orta';
  const derinlik = +o.derinlik > 0 ? +o.derinlik : 2 * capOf(olcu);
  const boydan = !!o.boydan;
  const uc = o.uc !== false;
  const disBoyu = +o.disBoyu > 0 ? +o.disBoyu : null;
  const kademeDer = +o.kademeDer > 0 ? +o.kademeDer : null;
  return { tur, havsaStd, olcu, adim, seri, derinlik, boydan, uc, disBoyu, kademeDer };
}

// Delik kesiti. through: boydan boya için kullanılacak boy (modelin köşegeni gibi). Döner:
// { segs: [{ kind: 'cyl', d, top, bottom } | { kind: 'cone', dTop, dBottom, top, bottom }], d, label, thread, hata }
// y ekseni: yüzey 0, malzemenin içi eksi. Kesiciler yüzeyin 1 mm dışına taşar (temiz kesim).
export function delikKesiti(opts, through = 1000) {
  const o = normalize(opts), D = capOf(o.olcu), P = o.adim, kaba = Math.abs(P - KABA[o.olcu]) < 1e-9;
  const segs = [], warn = [];
  const dCap = () => GECIS[o.olcu][SERI[o.seri]];
  let d, label, thread = null;
  const L = o.boydan ? through : o.derinlik;
  if (!(L > 0)) return { hata: 'Derinlik 0\'dan büyük olmalı' };
  if (o.tur === 'klavuz') {
    d = MATKAP[o.olcu][P];
    // kör delikte kılavuz dibe kadar diş açamaz: varsayılan diş boyu derinlik − 3 adım (kılavuz ucunun pah boyu; değiştirilebilir)
    const tl = o.boydan ? L : Math.min(o.disBoyu || Math.max(P, L - 3 * P), L);
    if (!o.boydan && o.disBoyu && o.disBoyu > L) warn.push('Diş boyu delik derinliğinden uzun olamaz; delik derinliğine indirildi');
    thread = { olcu: o.olcu, adim: P, kaba, boy: r2(tl), sinif: '6H', boydan: o.boydan };
    label = o.olcu + (kaba ? '' : '×' + tf(P)) + ' kılavuz';
  } else if (o.tur === 'duz') {
    d = dCap();
    label = 'Ø' + tf(d) + ' geçiş (' + o.olcu + ', ISO 273 ' + o.seri + ')';
  } else if (o.tur === 'kademe') {
    d = dCap();
    const X = KADEME[o.olcu], H = o.kademeDer || D;
    if (!o.boydan && H >= L) return { hata: 'Kademe derinliği (' + tf(H) + ' mm) delik derinliğinden küçük olmalı' };
    segs.push({ kind: 'cyl', d: X, top: 1, bottom: -H, rol: 'kademe' });
    label = o.olcu + ' kademeli Ø' + tf(X) + '×' + tf(H) + ' / Ø' + tf(d);
  } else {
    d = dCap();
    const Dc = (o.havsaStd === 'iso10642' ? HAVSA_10642 : HAVSA_15065)[o.olcu], t = (Dc - d) / 2;   // 90°: derinlik = yarıçap farkı
    if (!o.boydan && t >= L) return { hata: 'Havşa derinliği (' + tf(t) + ' mm) delik derinliğinden küçük olmalı' };
    segs.push({ kind: 'cone', dTop: Dc + 2, dBottom: d, top: 1, bottom: -t, rol: 'havsa' });   // 1 mm dışarıda çap 2 mm büyür (90°)
    label = o.olcu + ' havşa 90° Ø' + tf(Dc) + ' / Ø' + tf(d);
  }
  segs.unshift({ kind: 'cyl', d, top: 1, bottom: -L, rol: 'govde' });
  if (!o.boydan && o.uc) segs.push({ kind: 'cone', dTop: d, dBottom: 0, top: -L, bottom: -L - ucBoyu(d), rol: 'uc' });
  label += o.boydan ? ' · boydan boya' : ' · derinlik ' + tf(L) + (o.uc ? ' (+118° uç)' : '');
  return { o, segs, d, label, thread, warn };
}

// Elle hesap: kesitin malzemeden aldığı hacim (yalnız yüzeyin altı; kesişmeyen eş eksenli parçalar)
export function kesitHacmi(k) {
  const below = (s) => [Math.min(s.top, 0), s.bottom];
  let v = 0;
  const cyl = k.segs.filter((s) => s.kind === 'cyl').map((s) => { const [t, b] = below(s); return { r: s.d / 2, t, b }; });
  const cone = k.segs.filter((s) => s.kind === 'cone');
  // eş eksenli dönel katılar: her y diliminde en büyük yarıçap alınır (sayısal, ince dilim)
  const lo = Math.min(...k.segs.map((s) => s.bottom)), N = 20000, dy = (0 - lo) / N;
  for (let i = 0; i < N; i++) {
    const y = -(i + 0.5) * dy;
    let r = 0;
    for (const c of cyl) if (y <= c.t && y >= c.b) r = Math.max(r, c.r);
    for (const s of cone) if (y <= s.top && y >= s.bottom) { const f = (y - s.bottom) / (s.top - s.bottom); r = Math.max(r, (s.dBottom + (s.dTop - s.dBottom) * f) / 2); }
    v += Math.PI * r * r * dy;
  }
  return v;
}

// teknik resim / parça listesi yazısı (ör. "M8 kılavuz, diş boyu 16")
export function disYazisi(th) {
  if (!th) return '';
  return th.olcu + (th.kaba ? '' : '×' + tf(th.adim)) + '-' + th.sinif + (th.boydan ? ' boydan boya' : ' ↧ ' + tf(th.boy));
}
