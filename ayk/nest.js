// Ayakkabı kesim yerleşimi (deri / sentetik plaka): parçalar kesim çizgisiyle (paylar dahil) dikdörtgen plakaya ya da
// deri parçasına yerleştirilir. Kusurlu bölgeler (daire) atlanır. Bıçak / lazer payı (gap) bırakılır.
// Yön: deride parça boyu (burun-topuk) sırt çizgisine paralel tutulur (0° / 180°, "yonlu"); serbest modda 90° adımla da döner.
// Çift (sağ + sol) parçalar: adedin yarısı ayna (sol ayak) olarak kesilir. Deri ters çevrilemez, ayna kopya ayrı yerleşir.
// Yöntem: ızgara (res mm) üzerinde sol-alt sığdırma, büyük parça önce. Optimum iddiası yoktur; sonuç kesin çokgen
// çakışma testiyle doğrulanır.
import { cutLine } from './build.js?v=20261119c';
import * as G from './geom.js?v=20261119c';
import { makePiece, setEdgeProp, edgeProp } from './model.js?v=20261127a';

// Yarım parça (orta çizgi = paysız 'yok' kenarı) kesim için açılır: orta çizginin kirişine göre aynalanıp birleştirilir.
// Orta çizgi eğriyse (ör. kalıp üstü) bu açılım yaklaşıktır: gerçek açılım (forme) kalıp yüzeyinden yapılır.
export function unfoldPiece(pc) {
  if (!pc.outline.closed) return null;
  const E = G.edges(pc.outline), ci = E.findIndex((e) => edgeProp(pc, e.id).kind === 'yok');
  if (ci < 0 || E.length < 2) return null;
  const c = E[ci], cp = G.C.flatten(c.path, 0.2), A = cp[0], B = cp[cp.length - 1];
  const dx = B[0] - A[0], dy = B[1] - A[1], L2 = dx * dx + dy * dy; if (L2 < 1) return null;
  const R = ([x, y]) => { const t = ((x - A[0]) * dx + (y - A[1]) * dy) / L2, px = A[0] + t * dx, py = A[1] + t * dy; return [2 * px - x, 2 * py - y]; };
  let dev = 0; for (const q of cp) dev = Math.max(dev, Math.abs((q[0] - A[0]) * dy - (q[1] - A[1]) * dx) / Math.sqrt(L2));
  const others = [...E.slice(ci + 1), ...E.slice(0, ci)];   // B'den başlayıp A'da biten kenarlar
  const list = others.map((e) => ({ pts: G.C.flatten(e.path, 0.2), prop: edgeProp(pc, e.id) }));
  const mirrored = list.slice().reverse().map((e) => ({ pts: e.pts.map(R).reverse(), prop: e.prop }));   // A'dan B'ye
  const nodes = [], starts = [];
  for (const e of [...list, ...mirrored]) { starts.push(nodes.length); e.pts.slice(0, -1).forEach((q, i) => nodes.push(G.node(q, { brk: i === 0 }))); }
  const full = makePiece({ ...pc, id: pc.id + '-acik', outline: G.makePath(nodes.map((n) => n), true), edges: {}, marks: [], lines: [], dims: [], texts: [] });
  full.outline.nodes = nodes;
  [...list, ...mirrored].forEach((e, j) => setEdgeProp(full, nodes[starts[j]].id, { ...e.prop }));
  return { pc: full, approx: dev > 0.04 * Math.sqrt(L2), dev };
}

const area = (P) => { let A = 0; for (let i = 0; i < P.length; i++) { const a = P[i], b = P[(i + 1) % P.length]; A += a[0] * b[1] - b[0] * a[1]; } return Math.abs(A) / 2; };
// yerleştirilecek örnekler: [{ key, name, size, poly (kesim çizgisi), mirror }]
export function instances(graded, pairs = 1) {
  const out = [], warn = [];
  const seen = new Set();
  for (const g of graded) for (const pc0 of g.pieces) {
    const uf = unfoldPiece(pc0), pc = uf ? uf.pc : pc0;
    if (uf && uf.approx && !seen.has(pc0.id)) { seen.add(pc0.id); warn.push(`${pc0.name}: orta çizgi eğri (${uf.dev.toFixed(0)} mm sehim); açılım yaklaşık, kesimden önce stampa ile karşılaştır`); }
    const cl = cutLine(pc).pts;
    if (cl.length < 3) { warn.push(`${pc0.name} (${g.size}): kesim çizgisi yok`); continue; }
    // açılmış (simetrik) parça sağ / sol aynı; yarım değilse çift parçanın yarısı ayna (sol ayak)
    const n = pc0.qty * pairs, mir = !uf && pc0.side === 'cift' ? Math.floor(n / 2) : 0;
    for (let k = 0; k < n; k++) out.push({ key: `${pc0.id}@${g.size}#${k}`, id: pc0.id, no: pc0.no, name: pc0.name, size: g.size, mirror: k < mir, open: !!uf, poly: cl, area: area(cl) });
  }
  return { list: out, warn };
}
function orient(poly, rot, mirror) {
  let P = poly.map((p) => (mirror ? [-p[0], p[1]] : p.slice()));
  const a = rot * Math.PI / 2, c = Math.round(Math.cos(a)), s = Math.round(Math.sin(a));
  P = P.map(([x, y]) => [c * x - s * y, s * x + c * y]);
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity; for (const [x, y] of P) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  return { pts: P.map(([x, y]) => [x - x0, y - y0]), w: x1 - x0, h: y1 - y0 };
}
// çokgeni ızgaraya bas (pay kadar şişirilmiş: hücre merkezinin çokgene uzaklığı ≤ r ise dolu)
function raster(pts, res, r) {
  let w = 0, h = 0; for (const [x, y] of pts) { w = Math.max(w, x); h = Math.max(h, y); }
  const nx = Math.ceil((w + 2 * r) / res) + 1, ny = Math.ceil((h + 2 * r) / res) + 1, m = new Uint8Array(nx * ny);
  const inside = (px, py) => { let c = false; for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) { const a = pts[i], b = pts[j]; if ((a[1] > py) !== (b[1] > py) && px < (b[0] - a[0]) * (py - a[1]) / (b[1] - a[1]) + a[0]) c = !c; } return c; };
  const dseg = (px, py) => { let d = Infinity; for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) { const a = pts[j], b = pts[i], vx = b[0] - a[0], vy = b[1] - a[1], L2 = vx * vx + vy * vy, t = L2 ? Math.max(0, Math.min(1, ((px - a[0]) * vx + (py - a[1]) * vy) / L2)) : 0; d = Math.min(d, Math.hypot(px - a[0] - t * vx, py - a[1] - t * vy)); } return d; };
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) { const px = i * res - r + res / 2, py = j * res - r + res / 2; if (inside(px, py) || dseg(px, py) <= r + res * 0.71) m[i + nx * j] = 1; }
  return { m, nx, ny, off: r };
}
// sheet: { w, h, defects: [{ x, y, r }] }; opt: { res, gap, free }
export function nest(list, sheet, opt = {}) {
  const res = opt.res || 2, gap = opt.gap ?? 2, rots = opt.free ? [0, 1, 2, 3] : [0, 2];
  const NX = Math.floor(sheet.w / res), NY = Math.floor(sheet.h / res), occ = new Uint8Array(NX * NY);
  for (const d of sheet.defects || []) for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) if (Math.hypot((i + 0.5) * res - d.x, (j + 0.5) * res - d.y) <= d.r + gap / 2) occ[i + NX * j] = 1;
  const order = list.slice().sort((a, b) => b.area - a.area), placed = [], unplaced = [];
  const fits = (R, ox, oy) => { for (let j = 0; j < R.ny; j++) { const gy = oy + j; for (let i = 0; i < R.nx; i++) { if (!R.m[i + R.nx * j]) continue; const gx = ox + i; if (gx < 0 || gy < 0 || gx >= NX || gy >= NY || occ[gx + NX * gy]) return false; } } return true; };
  const cache = new Map();
  for (const it of order) {
    let best = null;
    for (const rot of rots) {
      const ck = it.id + '|' + it.size + '|' + it.mirror + '|' + rot;
      let O = cache.get(ck); if (!O) { const o = orient(it.poly, rot, it.mirror); O = { o, R: raster(o.pts, res, gap / 2) }; cache.set(ck, O); }
      const { R } = O;
      // sol-alt: önce en küçük x (plaka boyunca ilerle), sonra en küçük y
      for (let ox = 0; ox + R.nx <= NX && (!best || ox <= best.ox); ox++) {
        let found = -1;
        for (let oy = 0; oy + R.ny <= NY; oy++) if (fits(R, ox, oy)) { found = oy; break; }
        if (found >= 0) { if (!best || ox < best.ox || (ox === best.ox && found < best.oy)) best = { ox, oy: found, rot, O }; break; }
      }
    }
    if (!best) { unplaced.push(it); continue; }
    const { R, o } = best.O;
    for (let j = 0; j < R.ny; j++) for (let i = 0; i < R.nx; i++) if (R.m[i + R.nx * j]) occ[best.ox + i + NX * (best.oy + j)] = 1;
    const dx = best.ox * res + R.off - res / 2 + res / 2, dy = best.oy * res + R.off;
    placed.push({ ...it, rot: best.rot, x: dx, y: dy, pts: o.pts.map(([x, y]) => [x + dx, y + dy]) });
  }
  let used = 0; for (const p of placed) used = Math.max(used, ...p.pts.map((q) => q[0]));
  const pa = placed.reduce((s, p) => s + p.area, 0), da = (sheet.defects || []).reduce((s, d) => s + Math.PI * d.r * d.r, 0);
  return { placed, unplaced, used, util: pa / Math.max(1, used * sheet.h), utilSheet: pa / Math.max(1, sheet.w * sheet.h - da), sheet };
}
// kesin doğrulama: kenar kesişimi ya da içerme, plaka dışı, kusur çakışması
export function verify(L) {
  const segs = (P) => P.map((a, i) => [a, P[(i + 1) % P.length]]);
  const inter = (p, q, r, s) => { const d = (q[0] - p[0]) * (s[1] - r[1]) - (q[1] - p[1]) * (s[0] - r[0]); if (Math.abs(d) < 1e-12) return false; const t = ((r[0] - p[0]) * (s[1] - r[1]) - (r[1] - p[1]) * (s[0] - r[0])) / d, u = ((r[0] - p[0]) * (q[1] - p[1]) - (r[1] - p[1]) * (q[0] - p[0])) / d; return t > 0 && t < 1 && u > 0 && u < 1; };
  const inside = (pts, p) => { let c = false; for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) { const a = pts[i], b = pts[j]; if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < (b[0] - a[0]) * (p[1] - a[1]) / (b[1] - a[1]) + a[0]) c = !c; } return c; };
  const bad = [];
  L.placed.forEach((A, i) => {
    if (A.pts.some(([x, y]) => x < -1e-6 || y < -1e-6 || x > L.sheet.w + 1e-6 || y > L.sheet.h + 1e-6)) bad.push(A.key + ' plaka dışı');
    for (const d of L.sheet.defects || []) if (A.pts.some(([x, y]) => Math.hypot(x - d.x, y - d.y) < d.r) || inside(A.pts, [d.x, d.y])) bad.push(A.key + ' kusurda');
    for (let j = i + 1; j < L.placed.length; j++) {
      const B = L.placed[j], sa = segs(A.pts), sb = segs(B.pts);
      if (inside(A.pts, B.pts[0]) || inside(B.pts, A.pts[0]) || sa.some(([p, q]) => sb.some(([r, s]) => inter(p, q, r, s)))) bad.push(A.key + ' ↔ ' + B.key);
    }
  });
  return bad;
}
const TR = { 'ç': 'c', 'Ç': 'C', 'ğ': 'g', 'Ğ': 'G', 'ı': 'i', 'İ': 'I', 'ö': 'o', 'Ö': 'O', 'ş': 's', 'Ş': 'S', 'ü': 'u', 'Ü': 'U' };
const asc = (s) => String(s).replace(/[çÇğĞıİöÖşŞüÜ]/g, (c) => TR[c]).replace(/[^\x20-\x7e]/g, '?');
// DXF R12: KESIM katmanında kesim çizgileri, YAZI katmanında parça adı + numara, PLAKA ve KUSUR katmanları
export function nestDXF(L) {
  const o = [], w = (c, v) => o.push(String(c), String(v)), f = (v) => (Math.round(v * 1e4) / 1e4).toString(), Y = (y) => -y;
  w(0, 'SECTION'); w(2, 'HEADER'); w(9, '$ACADVER'); w(1, 'AC1009'); w(9, '$INSUNITS'); w(70, 4); w(0, 'ENDSEC');
  w(0, 'SECTION'); w(2, 'TABLES'); w(0, 'TABLE'); w(2, 'LAYER'); w(70, 5);
  for (const [n, c] of [['0', 7], ['KESIM', 1], ['YAZI', 7], ['PLAKA', 8], ['KUSUR', 6]]) { w(0, 'LAYER'); w(2, n); w(70, 0); w(62, c); w(6, 'CONTINUOUS'); }
  w(0, 'ENDTAB'); w(0, 'ENDSEC'); w(0, 'SECTION'); w(2, 'ENTITIES');
  const poly = (layer, pts) => { w(0, 'POLYLINE'); w(8, layer); w(66, 1); w(10, 0); w(20, 0); w(30, 0); w(70, 1); for (const p of pts) { w(0, 'VERTEX'); w(8, layer); w(10, f(p[0])); w(20, f(Y(p[1]))); w(30, 0); } w(0, 'SEQEND'); w(8, layer); };
  poly('PLAKA', [[0, 0], [L.sheet.w, 0], [L.sheet.w, L.sheet.h], [0, L.sheet.h]]);
  for (const d of L.sheet.defects || []) { w(0, 'CIRCLE'); w(8, 'KUSUR'); w(10, f(d.x)); w(20, f(Y(d.y))); w(30, 0); w(40, f(d.r)); }
  for (const p of L.placed) {
    poly('KESIM', p.pts);
    let cx = 0, cy = 0; for (const q of p.pts) { cx += q[0]; cy += q[1]; } cx /= p.pts.length; cy /= p.pts.length;
    w(0, 'TEXT'); w(8, 'YAZI'); w(10, f(cx)); w(20, f(Y(cy))); w(30, 0); w(40, 4); w(1, asc('#' + p.no + ' ' + p.name + ' N' + p.size + (p.mirror ? ' SOL' : '')));
  }
  w(0, 'ENDSEC'); w(0, 'EOF');
  return o.join('\r\n') + '\r\n';
}
export function nestSVG(L, { scale = 1 } = {}) {
  const W = L.sheet.w, H = L.sheet.h, cols = ['#2563eb', '#16a34a', '#d97706', '#db2777', '#7c3aed', '#0891b2', '#65a30d', '#dc2626'];
  const sizes = [...new Set(L.placed.map((p) => p.size))];
  let s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-2 -2 ${W + 4} ${H + 4}" width="${W * scale}mm" height="${H * scale}mm"><rect x="0" y="0" width="${W}" height="${H}" fill="#f8fafc" stroke="#64748b" stroke-width="0.8"/>`;
  for (const d of L.sheet.defects || []) s += `<circle cx="${d.x}" cy="${d.y}" r="${d.r}" fill="#fecaca" stroke="#dc2626" stroke-width="0.6"/>`;
  for (const p of L.placed) { const c = cols[sizes.indexOf(p.size) % cols.length]; s += `<polygon points="${p.pts.map((q) => q[0].toFixed(1) + ',' + q[1].toFixed(1)).join(' ')}" fill="${c}" fill-opacity="0.18" stroke="${c}" stroke-width="0.6"/>`; let cx = 0, cy = 0; for (const q of p.pts) { cx += q[0]; cy += q[1]; } s += `<text x="${(cx / p.pts.length).toFixed(1)}" y="${(cy / p.pts.length).toFixed(1)}" font-size="6" text-anchor="middle" fill="#0f172a">${p.no}·${p.size}${p.mirror ? 'S' : ''}</text>`; }
  return s + '</svg>';
}
