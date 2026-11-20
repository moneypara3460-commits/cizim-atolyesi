// Sac metal: flanşlı tava / kutu (kenar flanşı + köşe kapatma) ve açınımı. Saf hesap modülü; ölçüler mm.
//
// Parça: dış ölçüsü A (X) × B (Z) taban; dört kenarın her birinde isteğe bağlı flanş (dış boyu L, sanal keskin
// köşeden ölçülür, 0 = flanş yok), hepsinde aynı büküm açısı θ (düzden dönüş açısı, 90° = dik flanş).
// Köşe: 'acik' = iki büküm bölgesinin kesiştiği kare bölge açınımda boş kalır (büküm teğet çizgilerine kadar
//        dikdörtgen köşe boşaltması); 'kapali' = flanşlardan biri dış ölçüye kadar uzar, diğeri ona aralık g kalacak
//        kadar uzar (yalnızca 90° flanşta).
//
// Formüller (20.11.2026, her biri en az iki kaynakla karşılaştırıldı):
// - Büküm payı BA = θ(rad) × (R + K × T) — The Fabricator (Benson, k-faktör yazısı), Durma "bend deduction formula",
//   SendCutSend büküm hesaplayıcısı, Proleantech (Autodesk Inventor açınım denklemleriyle aynı).
// - Dış geri çekilme OSSB = tan(θ / 2) × (R + T); 90°'de R + T — The Fabricator, Durma, Proleantech, calculate.co.nz.
// - Büküm düşümü BD = 2 × OSSB − BA; açınım = dış ölçüler toplamı − BD — The Fabricator, Durma, SMLease, Harsle.
// - Köşe boşaltması, büküm teğet çizgileriyle sınırlı bölgeyi aşmamalı — PTC Creo "About Corner Relief";
//   "kapalı köşe" (flanşlardan biri uzar, diğeriyle arasında küçük aralık) — Siemens Solid Edge "Sheet metal reliefs
//   and corners", Autodesk Inventor köşe birleşimi (overlap / gap). Aralık için öneri ≥ 0,4 mm — SendCutSend
//   (lazer kesim aralığı; uyarı olarak gösterilir, kural değildir).
// Hacim gerçek geometriden (büküm bölgesi alanı θ × T × (R + T/2)); açınım tarafsız eksenden (K) hesaplanır.

const D2R = Math.PI / 180;
export const KENARLAR = ['on', 'arka', 'sol', 'sag'];
export const KENAR_ADI = { on: 'Ön (+Z)', arka: 'Arka (−Z)', sol: 'Sol (−X)', sag: 'Sağ (+X)' };
export const TAVA_VARSAYILAN = { sh: 'tava', sm: 'tava', ta: 120, tb: 80, tq: 90, fl: { on: 30, arka: 30, sol: 30, sag: 30 }, kk: 'acik', kg: 0.4, ko: 'x' };
export const KOSE_ARALIK_ONERI = 0.4;

const num = (v, d) => (v !== '' && v !== null && isFinite(Number(v)) ? Number(v) : d);
const tf = (v, n = 2) => String(Math.round(v * 10 ** n) / 10 ** n).replace('.', ',');

// iki çoklu çizgiden (dış / iç, eş sayıda nokta) kapalı prizma; map(u, v, s) → [x, y, z]
function prism(out, outer, inner, sa, sb, map) {
  if (!(sb - sa > 1e-9) || outer.length < 2) return 0;
  const tris = [];
  const P = (q, s) => map(q[0], q[1], s);
  const quad = (a, b, c, d) => { tris.push(a, b, c, a, c, d); };
  const n = outer.length;
  for (let i = 0; i + 1 < n; i++) {
    quad(P(outer[i], sa), P(outer[i + 1], sa), P(outer[i + 1], sb), P(outer[i], sb));       // dış yüz
    quad(P(inner[i], sa), P(inner[i], sb), P(inner[i + 1], sb), P(inner[i + 1], sa));       // iç yüz
    quad(P(outer[i], sa), P(inner[i], sa), P(inner[i + 1], sa), P(outer[i + 1], sa));       // baş kapak
    quad(P(outer[i], sb), P(outer[i + 1], sb), P(inner[i + 1], sb), P(inner[i], sb));       // son kapak
  }
  quad(P(outer[0], sa), P(outer[0], sb), P(inner[0], sb), P(inner[0], sa));                 // kesit başı
  quad(P(outer[n - 1], sa), P(inner[n - 1], sa), P(inner[n - 1], sb), P(outer[n - 1], sb)); // kesit ucu
  // yön: işaretli hacim negatifse üçgenleri çevir
  let v = 0;
  for (let i = 0; i < tris.length; i += 3) {
    const [a, b, c] = [tris[i], tris[i + 1], tris[i + 2]];
    v += (a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0])) / 6;
  }
  for (let i = 0; i < tris.length; i += 3) {
    const t = v < 0 ? [tris[i], tris[i + 2], tris[i + 1]] : [tris[i], tris[i + 1], tris[i + 2]];
    for (const q of t) out.push(q[0], q[1], q[2]);
  }
  return Math.abs(v);
}

// dikdörtgenlerin birleşiminin dış sınırı (eksene paralel): parçalar + kapalı halkalar
export function rectUnionOutline(rects, eps = 1e-6) {
  const uniq = (a) => { a.sort((p, q) => p - q); const o = []; for (const v of a) if (!o.length || v - o[o.length - 1] > eps) o.push(v); return o; };
  const xs = uniq(rects.flatMap((r) => [r[0], r[2]])), zs = uniq(rects.flatMap((r) => [r[1], r[3]]));
  const nx = xs.length - 1, nz = zs.length - 1;
  const fill = (i, j) => {
    if (i < 0 || j < 0 || i >= nx || j >= nz) return false;
    const cx = (xs[i] + xs[i + 1]) / 2, cz = (zs[j] + zs[j + 1]) / 2;
    return rects.some((r) => cx > r[0] && cx < r[2] && cz > r[1] && cz < r[3]);
  };
  const F = []; for (let i = 0; i < nx; i++) { F.push([]); for (let j = 0; j < nz; j++) F[i].push(fill(i, j)); }
  const f = (i, j) => (i >= 0 && j >= 0 && i < nx && j < nz ? F[i][j] : false);
  // dolu hücre solda kalacak yönde kenarlar (saat yönü tersine halka)
  const E = [];
  for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
    if (!F[i][j]) continue;
    const x0 = xs[i], x1 = xs[i + 1], z0 = zs[j], z1 = zs[j + 1];
    if (!f(i, j - 1)) E.push([x0, z0, x1, z0]);
    if (!f(i + 1, j)) E.push([x1, z0, x1, z1]);
    if (!f(i, j + 1)) E.push([x1, z1, x0, z1]);
    if (!f(i - 1, j)) E.push([x0, z1, x0, z0]);
  }
  const key = (x, z) => Math.round(x / eps) + ',' + Math.round(z / eps);
  const from = new Map();
  E.forEach((e, k) => { const s = key(e[0], e[1]); if (!from.has(s)) from.set(s, []); from.get(s).push(k); });
  const used = new Array(E.length).fill(false), loops = [];
  for (let k0 = 0; k0 < E.length; k0++) {
    if (used[k0]) continue;
    const loop = []; let k = k0;
    while (k !== undefined && !used[k]) {
      used[k] = true; loop.push([E[k][0], E[k][1]]);
      const nxt = (from.get(key(E[k][2], E[k][3])) || []).find((q) => !used[q]);
      k = nxt;
    }
    // aynı doğrultudaki ardışık noktaları sil
    const simp = loop.filter((q, i) => {
      const a = loop[(i - 1 + loop.length) % loop.length], b = loop[(i + 1) % loop.length];
      return Math.abs((q[0] - a[0]) * (b[1] - q[1]) - (q[1] - a[1]) * (b[0] - q[0])) > eps * eps;
    });
    if (simp.length >= 3) loops.push(simp);
  }
  const area = (L) => L.reduce((s, q, i) => { const r = L[(i + 1) % L.length]; return s + q[0] * r[1] - r[0] * q[1]; }, 0) / 2;
  loops.sort((a, b) => Math.abs(area(b)) - Math.abs(area(a)));
  const segs = loops.flatMap((L) => L.map((q, i) => { const r = L[(i + 1) % L.length]; return [q[0], q[1], r[0], r[1]]; }));
  return { loops, segs, area: loops.reduce((s, L) => s + area(L), 0) };
}

// Hesap: { ok, err, uyari[], A, B, T, R, K, theta, ossb, ba, bd, kenar{}, bends[], tris[], hacim, size, h, flat{ rects, loops, outline, bendLines, L, W, alan }, flatL, W }
export function tavaCalc(p) {
  const T = Math.max(num(p.st, 2), 0.05), R = Math.max(num(p.sr, 0), 0), K = Math.min(Math.max(num(p.sk, 0.44), 0), 1);
  const A = Math.max(num(p.ta, 120), 0.1), B = Math.max(num(p.tb, 80), 0.1);
  const th = Math.max(1, Math.min(150, num(p.tq, 90))), t = th * D2R;
  const kapali = p.kk === 'kapali', g = Math.max(num(p.kg, KOSE_ARALIK_ONERI), 0), ko = p.ko === 'z' ? 'z' : 'x';
  const fl = p.fl && typeof p.fl === 'object' ? p.fl : {};
  const ossb = Math.tan(t / 2) * (R + T), ba = t * (R + K * T), bd = 2 * ossb - ba;
  const errs = [], uyari = [];
  const L = {}, on = {};
  for (const k of KENARLAR) { L[k] = Math.max(num(fl[k], 0), 0); on[k] = L[k] > 1e-9; }
  const sb = (k) => (on[k] ? ossb : 0);
  const x0 = sb('sol'), x1 = A - sb('sag'), z0 = sb('arka'), z1 = B - sb('on');
  if (x1 - x0 < -1e-9) errs.push('Taban X ölçüsü büküm paylarından küçük (en az ' + tf(sb('sol') + sb('sag')) + ' mm olmalı)');
  if (z1 - z0 < -1e-9) errs.push('Taban Z ölçüsü büküm paylarından küçük (en az ' + tf(sb('arka') + sb('on')) + ' mm olmalı)');
  for (const k of KENARLAR) if (on[k] && L[k] - ossb < -1e-9) errs.push(KENAR_ADI[k] + ' flanşı büküm payından kısa (en az ' + tf(ossb) + ' mm olmalı)');
  const kapaliOK = kapali && Math.abs(th - 90) < 1e-9;
  if (kapali && !kapaliOK) errs.push('Kapalı köşe yalnızca 90° flanşta yapılır (köşeler açık bırakıldı)');
  // köşe uzatmaları: [baş, son] (s ekseninin küçük / büyük ucu)
  const ext = {}; for (const k of KENARLAR) ext[k] = [0, 0];
  const corners = [['sol', 'arka', 0, 0], ['sag', 'arka', 0, 1], ['sol', 'on', 1, 0], ['sag', 'on', 1, 1]]; // [z-kenarı, x-kenarı, z-kenarının ucu, x-kenarının ucu]
  let kapaliN = 0;
  if (kapaliOK) {
    for (const [zk, xk, zi, xi] of corners) {
      if (!on[zk] || !on[xk]) continue;
      const [uz, al] = ko === 'x' ? [xk, zk] : [zk, xk]; // uz: dış ölçüye uzayan, al: aralık bırakan
      const ui = uz === xk ? xi : zi, ai = al === xk ? xi : zi;
      ext[uz][ui] = ossb; ext[al][ai] = ossb - T - g; kapaliN++;
    }
    if (kapaliN && g < KOSE_ARALIK_ONERI - 1e-9) uyari.push('Köşe aralığı ' + tf(g) + ' mm: lazer kesimde kenarlar birbirine değebilir, en az ' + tf(KOSE_ARALIK_ONERI) + ' mm önerilir.');
  }
  // 3D
  const tris = []; let hacim = 0;
  hacim += prism(tris, [[x0, 0], [x1, 0]], [[x0, T], [x1, T]], z0, z1, (a, b, s) => [a, b, s]);
  const map = {
    sag: (u, v, s) => [A + u, v, s], sol: (u, v, s) => [-u, v, s],
    on: (u, v, s) => [s, v, B + u], arka: (u, v, s) => [s, v, -u],
  };
  const range = { sag: [z0, z1], sol: [z0, z1], on: [x0, x1], arka: [x0, x1] };
  const cx = -ossb, cy = R + T, n = Math.max(2, Math.ceil(th / 3));
  const arcO = [], arcI = [];
  for (let i = 0; i <= n; i++) { const f = t * i / n; arcO.push([cx + (R + T) * Math.sin(f), cy - (R + T) * Math.cos(f)]); arcI.push([cx + R * Math.sin(f), cy - R * Math.cos(f)]); }
  const d = [Math.cos(t), Math.sin(t)];
  const kenar = {}, bends = [], rects = [], bendLines = [];
  const Abf = Math.max(x1 - x0, 0), Bbf = Math.max(z1 - z0, 0);
  rects.push([0, 0, Abf, Bbf]);
  for (const k of KENARLAR) {
    if (!on[k]) { kenar[k] = { var: false }; continue; }
    const Lf = Math.max(L[k] - ossb, 0);
    const [s0, s1] = range[k], [e0, e1] = ext[k];
    const bs0 = s0 + Math.max(0, -e0), bs1 = s1 - Math.max(0, -e1), fs0 = s0 - e0, fs1 = s1 + e1;
    const Po = arcO[n], Pi = arcI[n], tipO = [Po[0] + Lf * d[0], Po[1] + Lf * d[1]], tipI = [Pi[0] + Lf * d[0], Pi[1] + Lf * d[1]];
    hacim += prism(tris, arcO, arcI, bs0, bs1, map[k]);
    if (Lf > 1e-9) hacim += prism(tris, [Po, tipO], [Pi, tipI], fs0, fs1, map[k]);
    kenar[k] = { var: true, L: L[k], Lf, s: [s0, s1], bukum: [bs0, bs1], duz: [fs0, fs1], uzatma: [e0, e1] };
    bends.push({ kenar: k, a: th, ba, boy: Math.max(bs1 - bs0, 0) });
    // açınım (taban düz bölgesi [0, Abf] × [0, Bbf])
    const zx = k === 'sag' || k === 'sol', o = zx ? z0 : x0;
    const lo = (v) => v - o;
    if (zx) {
      const xb = k === 'sag' ? [Abf, Abf + ba] : [-ba, 0], xf = k === 'sag' ? [Abf + ba, Abf + ba + Lf] : [-ba - Lf, -ba];
      rects.push([xb[0], lo(bs0), xb[1], lo(bs1)]); if (Lf > 1e-9) rects.push([xf[0], lo(fs0), xf[1], lo(fs1)]);
      bendLines.push([(xb[0] + xb[1]) / 2, lo(bs0), (xb[0] + xb[1]) / 2, lo(bs1)]);
    } else {
      const zb = k === 'on' ? [Bbf, Bbf + ba] : [-ba, 0], zf = k === 'on' ? [Bbf + ba, Bbf + ba + Lf] : [-ba - Lf, -ba];
      rects.push([lo(bs0), zb[0], lo(bs1), zb[1]]); if (Lf > 1e-9) rects.push([lo(fs0), zf[0], lo(fs1), zf[1]]);
      bendLines.push([lo(bs0), (zb[0] + zb[1]) / 2, lo(bs1), (zb[0] + zb[1]) / 2]);
    }
  }
  const good = rects.filter((r) => r[2] - r[0] > 1e-9 && r[3] - r[1] > 1e-9);
  const mx = Math.min(...good.map((r) => r[0])), mz = Math.min(...good.map((r) => r[1]));
  const sh = (r) => [r[0] - mx, r[1] - mz, r[2] - mx, r[3] - mz];
  const fr = good.map(sh), bl = bendLines.map(sh);
  const U = rectUnionOutline(fr);
  const fL = Math.max(...fr.map((r) => r[2])), fW = Math.max(...fr.map((r) => r[3]));
  // boyut
  let lo3 = [Infinity, Infinity, Infinity], hi3 = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < tris.length; i += 3) for (let j = 0; j < 3; j++) { lo3[j] = Math.min(lo3[j], tris[i + j]); hi3[j] = Math.max(hi3[j], tris[i + j]); }
  const size = [hi3[0] - lo3[0], hi3[1] - lo3[1], hi3[2] - lo3[2]];
  const err = errs.join(' · ');
  return {
    ok: !errs.length, err, uyari, tava: true, A, B, T, R, K, theta: th, ossb, ba, bd, kapali: kapaliOK && kapaliN > 0, g, ko,
    kenar, bends, tris, hacim, size, h: Math.max(size[1], 0.001),
    flat: { rects: fr, loops: U.loops, outline: U.segs, bendLines: bl, L: fL, W: fW, alan: U.area },
    flatL: fL, W: fW, straights: [], poly: null,
  };
}
