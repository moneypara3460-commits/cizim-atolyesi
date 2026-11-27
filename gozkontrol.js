// Göz Kontrol: işlenmiş parçanın tepeden fotoğrafı (beyaz A4 kâğıt üstünde) çizimin üstten görünüşüyle karşılaştırılır.
// Kaba hataları yakalar: eksik / fazla boydan boya delik ve boşluk, yanlış yerde ya da yanlış çapta delik, dış ölçü farkı,
// eksik ya da fazla malzeme, ayna (ters) işleme. Ölçü aleti değildir: doğruluk fotoğrafa bağlı, yaklaşık 0,5–1 mm.
// Görmediği: kör delik, cep, pah, yükseklik (tepeden siluette görünmez).
// Adımlar: kâğıt köşeleri → perspektif düzeltme (A4 = 210 × 297 mm, ölçek buradan) → parça maskesi (kâğıttan koyu)
//          → çizimin üstten maskesi (cam.js yükseklik haritası) → hizalama (ağırlık merkezi, asal eksen, 4 yön × ayna,
//          ardından ince arama) → fark: delik eşleştirme, dış ölçü, fazla / eksik malzeme öbekleri.
// Saf fonksiyonlar; DOM yok (tests/gozkontrol.test.mjs).
import { toGray, findPaperQuad, warpGray } from './photo2d.js?v=20261112u';
import * as C from './cam.js?v=20261127y';

export const A4 = [210, 297];
const otsuTh = (g) => {
  const hist = new Array(256).fill(0); for (const v of g) hist[v]++;
  let sum = 0; for (let i = 0; i < 256; i++) sum += i * hist[i];
  let sB = 0, wB = 0, best = 0, th = 128;
  for (let t = 0; t < 256; t++) { wB += hist[t]; if (!wB) continue; const wF = g.length - wB; if (!wF) break; sB += t * hist[t]; const mB = sB / wB, mF = (sum - sB) / wF, v = wB * wF * (mB - mF) ** 2; if (v > best) { best = v; th = t; } }
  return th;
};
// 4 / 8 komşu bileşenler: lab (−1 boş), boyutlar, kenara değme
function components(mask, w, h, val = 1) {
  const lab = new Int32Array(w * h).fill(-1), comps = [], st = [];
  for (let s = 0; s < mask.length; s++) {
    if (mask[s] !== val || lab[s] >= 0) continue;
    const id = comps.length; let n = 0, sx = 0, sy = 0, edge = false, x0 = w, x1 = 0, y0 = h, y1 = 0;
    st.push(s); lab[s] = id;
    while (st.length) {
      const q = st.pop(), x = q % w, y = (q - x) / w; n++; sx += x; sy += y;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      if (x === 0 || y === 0 || x === w - 1 || y === h - 1) edge = true;
      if (x > 0 && mask[q - 1] === val && lab[q - 1] < 0) { lab[q - 1] = id; st.push(q - 1); }
      if (x < w - 1 && mask[q + 1] === val && lab[q + 1] < 0) { lab[q + 1] = id; st.push(q + 1); }
      if (y > 0 && mask[q - w] === val && lab[q - w] < 0) { lab[q - w] = id; st.push(q - w); }
      if (y < h - 1 && mask[q + w] === val && lab[q + w] < 0) { lab[q + w] = id; st.push(q + w); }
    }
    comps.push({ id, n, cx: sx / n, cy: sy / n, edge, x0, x1, y0, y1 });
  }
  return { lab, comps };
}

// Fotoğraftan parça maskesi (mm ızgarası). rgba: Uint8ClampedArray, w × h. quad verilmezse kâğıt köşeleri aranır.
// Dönen: { mask (1 parça), nx, ny, res, quad, paper: [W, H] mm } — y yukarı (görüntüdeki aşağı yön ters çevrilir)
export function photoMask(rgba, w, h, opt = {}) {
  const gray = toGray(rgba, w, h), quad = opt.quad || findPaperQuad(gray, w, h);
  if (!quad) return { error: 'Beyaz A4 kâğıt bulunamadı. Parçayı kâğıdın ortasına koy, kâğıdın dört köşesi görünecek şekilde tepeden çek; koyu bir zemin üstünde daha iyi çalışır.' };
  const d = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]), wPx = (d(quad[0], quad[1]) + d(quad[3], quad[2])) / 2, hPx = (d(quad[0], quad[3]) + d(quad[1], quad[2])) / 2;
  const land = wPx > hPx, paper = land ? [A4[1], A4[0]] : A4, res = opt.res || 0.5;
  const ow = Math.round(paper[0] / res), oh = Math.round(paper[1] / res);
  const wg = warpGray(gray, w, h, quad, ow, oh);
  // kâğıt kenarındaki köşe bulma kaymaları ve gölge: kenardan 4 mm içerisi incelenir
  const m = Math.round(4 / res), inner = [];
  for (let y = m; y < oh - m; y++) for (let x = m; x < ow - m; x++) inner.push(wg[y * ow + x]);
  const th = opt.th || otsuTh(Uint8Array.from(inner));
  const dark = new Uint8Array(ow * oh);
  for (let y = m; y < oh - m; y++) for (let x = m; x < ow - m; x++) dark[y * ow + x] = wg[y * ow + x] < th ? 1 : 0;
  // parça: en büyük koyu bileşen; içindeki kâğıt (delikler) korunur, küçük kırıntılar atılır
  const { lab, comps } = components(dark, ow, oh, 1);
  if (!comps.length) return { error: 'Kâğıt üstünde parça bulunamadı (kâğıttan koyu bir şey yok).', quad, paper };
  const big = comps.reduce((a, b) => (b.n > a.n ? b : a));
  if (big.n * res * res < 100) return { error: 'Parça çok küçük ya da kâğıtla aynı renkte (en az 10 × 10 mm ve kâğıttan koyu olmalı).', quad, paper };
  if (big.x0 <= m || big.y0 <= m || big.x1 >= ow - m - 1 || big.y1 >= oh - m - 1) return { error: 'Parça kâğıdın kenarına değiyor ya da taşıyor: parçayı kâğıdın ortasına koy.', quad, paper };
  const mask = new Uint8Array(ow * oh);
  for (let y = 0; y < oh; y++) for (let x = 0; x < ow; x++) if (lab[y * ow + x] === big.id) mask[(oh - 1 - y) * ow + x] = 1;
  return { mask, nx: ow, ny: oh, res, quad, paper, th, warped: wg };
}

// Çizimin üstten maskesi: model üçgenleri (dünya, Y yukarı) → makine X-Y ızgarası
export function modelMask(tris, res = 0.5) {
  const t = C.toMachine(tris), b = C.boundsOf(t), pad = 6;
  const G = { ox: b.min[0] - pad, oy: b.min[1] - pad, res, nx: Math.ceil((b.max[0] - b.min[0] + 2 * pad) / res), ny: Math.ceil((b.max[1] - b.min[1] + 2 * pad) / res) };
  // dikey ışın: hücre merkezinden geçen üçgen kesişimleri sıralanır, çiftler arası (içerisi) toplam boy > 0,05 mm → malzeme.
  // Yükseklik haritası (en üst yüz) boydan boya deliği örtebilir (ayrı katı olarak çizilmiş delik); çift sayma örtmez.
  const { nx, ny, ox, oy } = G, Z = new Map();
  for (let i = 0; i < t.length; i += 9) {
    const ax = t[i], ay = t[i + 1], az = t[i + 2], bx = t[i + 3], by = t[i + 4], bz = t[i + 5], cx = t[i + 6], cy = t[i + 7], cz = t[i + 8];
    const d = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy);
    if (Math.abs(d) < 1e-12) continue;
    const i0 = Math.max(0, Math.ceil((Math.min(ax, bx, cx) - ox) / res - 0.5)), i1 = Math.min(nx - 1, Math.floor((Math.max(ax, bx, cx) - ox) / res - 0.5));
    const j0 = Math.max(0, Math.ceil((Math.min(ay, by, cy) - oy) / res - 0.5)), j1 = Math.min(ny - 1, Math.floor((Math.max(ay, by, cy) - oy) / res - 0.5));
    for (let j = j0; j <= j1; j++) {
      const py = oy + (j + 0.5) * res + res * 1.37e-4;
      for (let ii = i0; ii <= i1; ii++) {
        const px = ox + (ii + 0.5) * res + res * 2.11e-4;
        const l1 = ((by - cy) * (px - cx) + (cx - bx) * (py - cy)) / d, l2 = ((cy - ay) * (px - cx) + (ax - cx) * (py - cy)) / d, l3 = 1 - l1 - l2;
        if (l1 < 0 || l2 < 0 || l3 < 0) continue;
        const c = ii + nx * j; let a = Z.get(c); if (!a) Z.set(c, a = []); a.push(l1 * az + l2 * bz + l3 * cz);
      }
    }
  }
  const mask = new Uint8Array(nx * ny);
  for (const [c, a] of Z) { a.sort((p, q) => p - q); let L = 0; for (let k = 0; k + 1 < a.length; k += 2) L += a[k + 1] - a[k]; if (L > 0.05) mask[c] = 1; }
  return { mask, ...G };
}

const pointsOf = (M) => { const p = []; for (let j = 0; j < M.ny; j++) for (let i = 0; i < M.nx; i++) if (M.mask[i + M.nx * j]) p.push((M.ox || 0) + (i + 0.5) * M.res, (M.oy || 0) + (j + 0.5) * M.res); return Float64Array.from(p); };
function moments(P) {
  let n = P.length / 2, cx = 0, cy = 0; for (let i = 0; i < P.length; i += 2) { cx += P[i]; cy += P[i + 1]; } cx /= n; cy /= n;
  let a = 0, b = 0, c = 0; for (let i = 0; i < P.length; i += 2) { const x = P[i] - cx, y = P[i + 1] - cy; a += x * x; b += x * y; c += y * y; }
  return { cx, cy, ang: 0.5 * Math.atan2(2 * b, a - c) };
}
// fotoğraf noktalarını (mirror, döndür θ, ötele) model ızgarasına yerleştir → kesişim / birleşim
function score(Pp, E, T) {
  const { nx, ny, ox, oy, res } = E, hit = new Uint8Array(nx * ny);
  let inter = 0, nP = 0;
  const c = Math.cos(T.th), s = Math.sin(T.th);
  for (let i = 0; i < Pp.length; i += 2) {
    const x0 = (Pp[i] - T.pcx) * T.mir, y0 = Pp[i + 1] - T.pcy;
    const x = c * x0 - s * y0 + T.tx, y = s * x0 + c * y0 + T.ty;
    const gi = Math.floor((x - ox) / res), gj = Math.floor((y - oy) / res);
    if (gi < 0 || gj < 0 || gi >= nx || gj >= ny) { nP++; continue; }
    const k = gi + nx * gj; if (hit[k]) continue; hit[k] = 1; nP++;
    if (E.mask[k]) inter++;
  }
  return inter / (nP + E.count - inter);
}
export function align(PM, E) {   // [düz, ayna] en iyi hizalamalar
  const Pp = pointsOf({ ...PM, ox: 0, oy: 0 }), Pe = pointsOf(E);
  E.count = Pe.length / 2;
  const mp = moments(Pp), me = moments(Pe);
  const res = [];
  for (const mir of [1, -1]) {
    let best = null;
    const ap = mir === 1 ? mp.ang : -mp.ang;
    for (let k = 0; k < 4; k++) {
      const T = { mir, th: me.ang - ap + k * Math.PI / 2, pcx: mp.cx, pcy: mp.cy, tx: me.cx, ty: me.cy };
      const sc = score(Pp, E, T); if (!best || sc > best.sc) best = { T, sc };
    }
    res.push(refine(Pp, E, best));
  }
  return res;   // [düz, ayna]
}
// ince arama: açı ve kayma (koordinat iniş, üç adım)
function refine(Pp, E, best) {
  let T = { ...best.T }, sc = best.sc;
  for (const [stA, stD] of [[0.01, 1], [0.004, 0.5], [0.0015, 0.25]]) {
    let improved = true, guard = 0;
    while (improved && guard++ < 40) {
      improved = false;
      for (const [k, d] of [['th', stA], ['th', -stA], ['tx', stD], ['tx', -stD], ['ty', stD], ['ty', -stD]]) {
        const T2 = { ...T, [k]: T[k] + d }, s2 = score(Pp, E, T2);
        if (s2 > sc + 1e-9) { T = T2; sc = s2; improved = true; }
      }
    }
  }
  return { T, iou: sc };
}
// hizalanmış fotoğraf maskesi model ızgarasında (boşluklar kapanmasın diye ters dönüşümle örneklenir)
function resample(PM, E, T) {
  const out = new Uint8Array(E.nx * E.ny), c = Math.cos(T.th), s = Math.sin(T.th);
  for (let j = 0; j < E.ny; j++) for (let i = 0; i < E.nx; i++) {
    const x = E.ox + (i + 0.5) * E.res - T.tx, y = E.oy + (j + 0.5) * E.res - T.ty;
    const x0 = c * x + s * y, y0 = -s * x + c * y, px = x0 * T.mir + T.pcx, py = y0 + T.pcy;
    const pi = Math.floor(px / PM.res), pj = Math.floor(py / PM.res);
    if (pi >= 0 && pj >= 0 && pi < PM.nx && pj < PM.ny && PM.mask[pi + PM.nx * pj]) out[i + E.nx * j] = 1;
  }
  return out;
}
// iç boşluklar (kenara değmeyen boş bileşenler): delik ve kapalı boşluk
function voids(mask, G, minArea) {
  const inv = new Uint8Array(mask.length); for (let i = 0; i < mask.length; i++) inv[i] = mask[i] ? 0 : 1;
  const { comps } = components(inv, G.nx, G.ny, 1);
  return comps.filter((q) => !q.edge && q.n * G.res * G.res >= minArea).map((q) => ({ x: G.ox + (q.cx + 0.5) * G.res, y: G.oy + (q.cy + 0.5) * G.res, area: q.n * G.res * G.res, d: 2 * Math.sqrt(q.n / Math.PI) * G.res, w: (q.x1 - q.x0 + 1) * G.res, h: (q.y1 - q.y0 + 1) * G.res }));
}

// karşılaştırma. tol: konum (mm), çap (mm)
// karşılaştırma: düz ve ayna hizalamanın ikisi de değerlendirilir; daha az farkla açıklayan seçilir (eşitlikte düz).
// Simetrik parçada ayna ayırt edilemez; o zaman düz kabul edilir.
export function compare(PM, tris, opt = {}) {
  const E = modelMask(tris, PM.res), [A0, A1] = align(PM, E);
  const r0 = diff(PM, E, A0, opt), r1 = diff(PM, E, A1, opt);
  const bad = (r) => 10 * r.items.filter((w) => w.sev === 'crit').length + r.items.length;
  const useMir = bad(r1) < bad(r0) || (bad(r1) === bad(r0) && A1.iou > A0.iou + 0.02);
  const r = useMir ? r1 : r0;
  if (useMir) r.items.unshift({ sev: 'warn', t: 'Parça çizimin AYNA görüntüsüyle örtüşüyor. Parça ters (alt yüzü yukarı) konduysa sorun yok; değilse parça ayna işlenmiş demektir.' });
  return { ...r, mirrored: useMir, ok: !r.items.some((w) => w.sev === 'crit' || w.sev === 'warn') };
}
function diff(PM, E, A, opt) {
  const res = PM.res, tolPos = opt.tolPos ?? 1.0, tolD = opt.tolD ?? 0.8, tolOut = opt.tolOut ?? 1.0;
  const F = resample(PM, E, A.T);
  const out = [], push = (sev, t, at) => out.push({ sev, t, at });
  if (A.iou < 0.8) push('crit', 'Fotoğraftaki parça çizime benzemiyor (örtüşme %' + Math.round(A.iou * 100) + '). Yanlış parça, yanlış çizim ya da fotoğraf hatalı (gölge, parlama, parça kâğıt rengine yakın) olabilir.');
  // dış ölçü: iki maskenin model eksenlerindeki kapladığı aralık
  const ext = (M) => { let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity; for (let j = 0; j < E.ny; j++) for (let i = 0; i < E.nx; i++) if (M[i + E.nx * j]) { if (i < x0) x0 = i; if (i > x1) x1 = i; if (j < y0) y0 = j; if (j > y1) y1 = j; } return [(x1 - x0 + 1) * res, (y1 - y0 + 1) * res]; };
  const eE = ext(E.mask), eF = ext(F);
  for (const [k, ax] of [[0, 'X'], [1, 'Y']]) if (Math.abs(eF[k] - eE[k]) > tolOut) push('warn', 'Dış ölçü ' + ax + ': çizimde ' + eE[k].toFixed(1) + ' mm, fotoğrafta ' + eF[k].toFixed(1) + ' mm (fark ' + (eF[k] - eE[k] > 0 ? '+' : '') + (eF[k] - eE[k]).toFixed(1) + ' mm)');
  // delikler / iç boşluklar
  const minA = opt.minArea ?? Math.max(3, 9 * res * res);
  const hE = voids(E.mask, E, minA), hF = voids(F, E, minA), used = new Set(), holes = [];
  for (const h of hE) {
    let bi = -1, bd = Infinity;
    hF.forEach((q, i) => { if (used.has(i)) return; const d = Math.hypot(q.x - h.x, q.y - h.y); if (d < bd) { bd = d; bi = i; } });
    const lim = Math.max(3, h.d * 0.6);
    if (bi < 0 || bd > lim) { push('crit', 'EKSİK delik / boşluk: çizimde Ø' + h.d.toFixed(1) + ' mm (X ' + h.x.toFixed(1) + ', Y ' + h.y.toFixed(1) + '), fotoğrafta yok', [h.x, h.y]); holes.push({ ...h, found: null }); continue; }
    used.add(bi); const q = hF[bi]; holes.push({ ...h, found: q, dPos: bd, dD: q.d - h.d });
    if (bd > tolPos) push('warn', 'Delik yeri farklı: çizimde X ' + h.x.toFixed(1) + ' Y ' + h.y.toFixed(1) + ', fotoğrafta ' + bd.toFixed(1) + ' mm kaymış', [q.x, q.y]);
    if (Math.abs(q.d - h.d) > tolD) push('warn', 'Delik çapı farklı: çizimde Ø' + h.d.toFixed(1) + ', fotoğrafta yaklaşık Ø' + q.d.toFixed(1) + ' mm', [q.x, q.y]);
  }
  hF.forEach((q, i) => { if (!used.has(i)) push('crit', 'FAZLA delik / boşluk: fotoğrafta Ø' + q.d.toFixed(1) + ' mm (X ' + q.x.toFixed(1) + ', Y ' + q.y.toFixed(1) + '), çizimde yok', [q.x, q.y]); });
  // eksik / fazla malzeme öbekleri (deliklerden bağımsız; dış konturda ≥ 3 mm genişlik)
  const miss = new Uint8Array(F.length), extra = new Uint8Array(F.length);
  for (let i = 0; i < F.length; i++) { if (E.mask[i] && !F[i]) miss[i] = 1; if (!E.mask[i] && F[i]) extra[i] = 1; }
  const thick = (M) => { // 1,5 mm aşındırma: kenar çizgisi kaymalarını ele
    const r = Math.max(1, Math.round(1.5 / res)), o = new Uint8Array(M.length);
    for (let j = r; j < E.ny - r; j++) for (let i = r; i < E.nx - r; i++) { if (!M[i + E.nx * j]) continue; let ok = true; for (let dj = -r; dj <= r && ok; dj++) for (let di = -r; di <= r; di++) if (!M[i + di + E.nx * (j + dj)]) { ok = false; break; } o[i + E.nx * j] = ok ? 1 : 0; }
    return o;
  };
  const near = (x, y) => out.some((w) => w.at && Math.hypot(w.at[0] - x, w.at[1] - y) < 4);
  for (const [M, t] of [[thick(miss), 'EKSİK malzeme (çizimde var, parçada yok)'], [thick(extra), 'FAZLA malzeme (parçada var, çizimde yok)']]) {
    const { comps } = components(M, E.nx, E.ny, 1);
    for (const q of comps) { const x = E.ox + (q.cx + 0.5) * res, y = E.oy + (q.cy + 0.5) * res; if (near(x, y)) continue; push('warn', t + ': yaklaşık ' + ((q.x1 - q.x0 + 1 + 2 * Math.round(1.5 / res)) * res).toFixed(0) + ' × ' + ((q.y1 - q.y0 + 1 + 2 * Math.round(1.5 / res)) * res).toFixed(0) + ' mm bölge (X ' + x.toFixed(0) + ', Y ' + y.toFixed(0) + ')', [x, y]); }
  }
  return { iou: A.iou, T: A.T, items: out, holes, ext: { model: eE, photo: eF }, grid: E, aligned: F };
}
export function checkPhoto(rgba, w, h, tris, opt = {}) {
  const PM = photoMask(rgba, w, h, opt);
  if (PM.error) return { error: PM.error, quad: PM.quad };
  return { ...compare(PM, tris, opt), photo: PM };
}
