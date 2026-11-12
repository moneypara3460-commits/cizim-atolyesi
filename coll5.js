// Çok eksenli çarpışma kontrolü ve hacimsel (voksel) talaş simülasyonu. Saf hesap; cam5.js'in CL dizisini kullanır.
// KAPSAM (kullanıcıya da gösterilir): takım kesici kısım, takım sapı, takım tutucu, iş mili burnu (eş eksenli silindirler);
// bağlama (ayna / punta silindiri, mengene çeneleri kutusu), tabla yüzü (düzlem); bitmiş parça (üçgen ağ).
// KAPSAM DIŞI: makine gövdesi, kapak, döner tabla / beşik gövdesi, takım değiştirici, ara stok (tutucu kontrolünde bitmiş parça kullanılır).
import { dot, add, sub, mul, norm, unit } from './kin.js?v=20261112u';
import { stockBox } from './cam5.js?v=20261112u';

export const COVERAGE = {
  checked: ['Takım kesici kısım ↔ bağlama ve tabla', 'Takım sapı ↔ parça, bağlama, tabla', 'Takım tutucu ↔ parça, bağlama, tabla', 'İş mili burnu ↔ parça, bağlama, tabla', 'Hızlı harekette takım ↔ parça', 'Küresel uçta yüzeye dalma (gouge)', 'Doğrusal ve döner eksen limitleri, erişilemeyen takım yönleri'],
  notChecked: ['Makine gövdesi, kapak ve kolon', 'Döner tabla / beşik (trunnion) gövdesi', 'Takım değiştirici', 'Ara stok: tutucu kontrolü bitmiş parçaya göre yapılır, henüz kesilmemiş malzemeye göre değil', 'Bağlama elemanlarının gerçek biçimi (basit kutu / silindir olarak modellenir)'],
};

// ---- üçgen ızgarası ve noktanın parçaya uzaklığı ----
export function triGrid(t, cell) {
  let mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < t.length; i += 3) for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], t[i + k]); mx[k] = Math.max(mx[k], t[i + k]); }
  const n = [0, 1, 2].map((k) => Math.max(1, Math.ceil((mx[k] - mn[k]) / cell) + 1));
  const cells = new Map();
  for (let i = 0; i < t.length; i += 9) {
    let a = [Infinity, Infinity, Infinity], b = [-Infinity, -Infinity, -Infinity];
    for (let j = 0; j < 9; j += 3) for (let k = 0; k < 3; k++) { a[k] = Math.min(a[k], t[i + j + k]); b[k] = Math.max(b[k], t[i + j + k]); }
    const i0 = a.map((v, k) => Math.floor((v - mn[k]) / cell)), i1 = b.map((v, k) => Math.floor((v - mn[k]) / cell));
    for (let x = i0[0]; x <= i1[0]; x++) for (let y = i0[1]; y <= i1[1]; y++) for (let z = i0[2]; z <= i1[2]; z++) {
      const key = (x * n[1] + y) * n[2] + z; let l = cells.get(key); if (!l) cells.set(key, (l = [])); l.push(i);
    }
  }
  return { t, cell, mn, mx, n, cells };
}
// nokta–üçgen en yakın uzaklık karesi (Ericson)
function ptTri2(p, t, i) {
  const ax = t[i], ay = t[i + 1], az = t[i + 2], bx = t[i + 3], by = t[i + 4], bz = t[i + 5], cx = t[i + 6], cy = t[i + 7], cz = t[i + 8];
  const abx = bx - ax, aby = by - ay, abz = bz - az, acx = cx - ax, acy = cy - ay, acz = cz - az;
  const apx = p[0] - ax, apy = p[1] - ay, apz = p[2] - az;
  const d1 = abx * apx + aby * apy + abz * apz, d2 = acx * apx + acy * apy + acz * apz;
  const D = (x, y, z) => x * x + y * y + z * z;
  if (d1 <= 0 && d2 <= 0) return D(apx, apy, apz);
  const bpx = p[0] - bx, bpy = p[1] - by, bpz = p[2] - bz, d3 = abx * bpx + aby * bpy + abz * bpz, d4 = acx * bpx + acy * bpy + acz * bpz;
  if (d3 >= 0 && d4 <= d3) return D(bpx, bpy, bpz);
  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) { const v = d1 / (d1 - d3); return D(apx - v * abx, apy - v * aby, apz - v * abz); }
  const cpx = p[0] - cx, cpy = p[1] - cy, cpz = p[2] - cz, d5 = abx * cpx + aby * cpy + abz * cpz, d6 = acx * cpx + acy * cpy + acz * cpz;
  if (d6 >= 0 && d5 <= d6) return D(cpx, cpy, cpz);
  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) { const w = d2 / (d2 - d6); return D(apx - w * acx, apy - w * acy, apz - w * acz); }
  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) { const w = (d4 - d3) / ((d4 - d3) + (d5 - d6)); return D(bpx - w * (cx - bx), bpy - w * (cy - by), bpz - w * (cz - bz)); }
  const den = 1 / (va + vb + vc), v = vb * den, w = vc * den;
  return D(apx - abx * v - acx * w, apy - aby * v - acy * w, apz - abz * v - acz * w);
}
// p noktası parçaya r'den daha yakın mı (erken çıkış)
export function nearPart(G, p, r) {
  const { mn, cell, n, cells, t } = G;
  if (p[0] < mn[0] - r || p[1] < mn[1] - r || p[2] < mn[2] - r || p[0] > G.mx[0] + r || p[1] > G.mx[1] + r || p[2] > G.mx[2] + r) return false;
  const r2 = r * r;
  const i0 = [0, 1, 2].map((k) => Math.max(0, Math.floor((p[k] - r - mn[k]) / cell))), i1 = [0, 1, 2].map((k) => Math.min(n[k] - 1, Math.floor((p[k] + r - mn[k]) / cell)));
  const seen = new Set();
  for (let x = i0[0]; x <= i1[0]; x++) for (let y = i0[1]; y <= i1[1]; y++) for (let z = i0[2]; z <= i1[2]; z++) {
    const l = cells.get((x * n[1] + y) * n[2] + z); if (!l) continue;
    for (const i of l) { if (seen.has(i)) continue; seen.add(i); if (ptTri2(p, t, i) < r2) return true; }
  }
  return false;
}
export function distPart(G, p, rMax) {
  const { mn, cell, n, cells, t } = G;
  let best = rMax * rMax;
  const i0 = [0, 1, 2].map((k) => Math.max(0, Math.floor((p[k] - rMax - mn[k]) / cell))), i1 = [0, 1, 2].map((k) => Math.min(n[k] - 1, Math.floor((p[k] + rMax - mn[k]) / cell)));
  for (let x = i0[0]; x <= i1[0]; x++) for (let y = i0[1]; y <= i1[1]; y++) for (let z = i0[2]; z <= i1[2]; z++) {
    const l = cells.get((x * n[1] + y) * n[2] + z); if (!l) continue;
    for (const i of l) { const d = ptTri2(p, t, i); if (d < best) best = d; }
  }
  return Math.sqrt(best);
}

// ---- bağlama elemanları (analitik) ----
function nearFix(f, p, r) {
  if (f.kind === 'plane') return p[2] - r < f.z;
  if (f.kind === 'box') { let d2 = 0; for (let k = 0; k < 3; k++) { const v = p[k] < f.min[k] ? f.min[k] - p[k] : p[k] > f.max[k] ? p[k] - f.max[k] : 0; d2 += v * v; } return d2 < r * r; }
  if (f.kind === 'cylX') { const dx = p[0] < f.x0 ? f.x0 - p[0] : p[0] > f.x1 ? p[0] - f.x1 : 0, dr = Math.max(0, Math.hypot(p[1], p[2]) - f.r); return dx * dx + dr * dr < r * r; }
  return false;
}


// ---- tam silindir testi (uçları düz): yarım küre uçlu kapsül yaklaşımı uçlarda yarıçap kadar taşar, yanlış alarm verir ----
function basis(v) { const a = Math.abs(v[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0]; const e1 = unit([a[1] * v[2] - a[2] * v[1], a[2] * v[0] - a[0] * v[2], a[0] * v[1] - a[1] * v[0]]); const e2 = [v[1] * e1[2] - v[2] * e1[1], v[2] * e1[0] - v[0] * e1[2], v[0] * e1[1] - v[1] * e1[0]]; return [e1, e2]; }
// çokgeni t ∈ [lo, hi] dilimine kırp (Sutherland–Hodgman, iki düzlem)
function clipT(poly, lo, hi) {
  const clip = (P, keep, edge) => { const o = []; for (let i = 0; i < P.length; i++) { const a = P[i], b = P[(i + 1) % P.length], ia = keep(a), ib = keep(b); if (ia) o.push(a); if (ia !== ib) { const f = (edge - a[2]) / (b[2] - a[2]); o.push([a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, edge]); } } return o; };
  let P = clip(poly, (q) => q[2] >= lo, lo); if (!P.length) return P;
  return clip(P, (q) => q[2] <= hi, hi);
}
// XY izdüşümünde orijinin çokgene uzaklığı (içindeyse 0)
function dist2DOrigin(P) {
  let inside = false, best = Infinity;
  for (let i = 0, j = P.length - 1; i < P.length; j = i++) {
    const a = P[j], b = P[i];
    if ((a[1] > 0) !== (b[1] > 0) && 0 < (b[0] - a[0]) * (0 - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
    const dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy, t = L2 > 0 ? Math.max(0, Math.min(1, -(a[0] * dx + a[1] * dy) / L2)) : 0;
    best = Math.min(best, Math.hypot(a[0] + t * dx, a[1] + t * dy));
  }
  return inside ? 0 : best;
}
// A noktasından v yönünde L boyunda, r yarıçaplı düz uçlu silindir parçaya (tol kadar içeri) değiyor mu
export function cylHitsPart(G, A, v, L, r, tol = 0.02) {
  const B = add(A, mul(v, L)), R = r - tol;
  if (R <= 0) return false;
  const { mn, cell, n, cells, t } = G;
  const lo = [0, 1, 2].map((k) => Math.min(A[k], B[k]) - r), hi = [0, 1, 2].map((k) => Math.max(A[k], B[k]) + r);
  if (hi[0] < mn[0] || hi[1] < mn[1] || hi[2] < mn[2] || lo[0] > G.mx[0] || lo[1] > G.mx[1] || lo[2] > G.mx[2]) return false;
  const i0 = [0, 1, 2].map((k) => Math.max(0, Math.floor((lo[k] - mn[k]) / cell))), i1 = [0, 1, 2].map((k) => Math.min(n[k] - 1, Math.floor((hi[k] - mn[k]) / cell)));
  const [e1, e2] = basis(v), seen = new Set();
  const loc = (x, y, z) => { const q = [x - A[0], y - A[1], z - A[2]]; return [dot(q, e1), dot(q, e2), dot(q, v)]; };
  for (let x = i0[0]; x <= i1[0]; x++) for (let y = i0[1]; y <= i1[1]; y++) for (let z = i0[2]; z <= i1[2]; z++) {
    const l = cells.get((x * n[1] + y) * n[2] + z); if (!l) continue;
    for (const i of l) {
      if (seen.has(i)) continue; seen.add(i);
      const P = clipT([loc(t[i], t[i + 1], t[i + 2]), loc(t[i + 3], t[i + 4], t[i + 5]), loc(t[i + 6], t[i + 7], t[i + 8])], 0, L);
      if (P.length && dist2DOrigin(P) < R) return true;
    }
  }
  return false;
}
// bağlama elemanı ile düz uçlu silindir: önce kapsül ön elemesi, sonra yüzey noktalarıyla (halkalar + uç diskleri) sıkı test
function cylHitsFix(f, A, v, L, r, tol = 0.02) {
  const B = add(A, mul(v, L));
  if (f.kind === 'plane') { const s = r * Math.sqrt(Math.max(0, 1 - v[2] * v[2])); return Math.min(A[2], B[2]) - s < f.z - tol; }
  // kapsül ön elemesi (kaba)
  const nS = Math.max(1, Math.ceil(L / Math.max(0.5, r))); let maybe = false;
  for (let k = 0; k <= nS && !maybe; k++) if (nearFix(f, add(A, mul(v, L * k / nS)), r + 1e-6)) maybe = true;
  if (!maybe) return false;
  const [e1, e2] = basis(v), step = Math.max(0.4, Math.min(1.5, r * 0.25)), na = Math.max(1, Math.ceil(L / step)), nc = Math.max(8, Math.ceil(2 * Math.PI * r / step));
  const inside = (q) => nearFix(f, q, 1e-9 + 0) || false;
  const rings = [];
  for (let k = 0; k <= na; k++) rings.push(L * k / na);
  for (const ta of rings) for (let j = 0; j < nc; j++) {
    const a = 2 * Math.PI * j / nc, rr = r - tol;
    const q = add(add(A, mul(v, ta)), add(mul(e1, rr * Math.cos(a)), mul(e2, rr * Math.sin(a))));
    if (insideFix(f, q)) return true;
  }
  // uç diskleri (iç halkalar)
  for (const ta of [0, L]) for (let m = 1; m < 4; m++) for (let j = 0; j < nc; j++) { const a = 2 * Math.PI * j / nc, rr = (r - tol) * m / 4; if (insideFix(f, add(add(A, mul(v, ta)), add(mul(e1, rr * Math.cos(a)), mul(e2, rr * Math.sin(a)))))) return true; }
  return insideFix(f, A) || insideFix(f, B);
}
function insideFix(f, p) {
  if (f.kind === 'box') return p[0] > f.min[0] && p[0] < f.max[0] && p[1] > f.min[1] && p[1] < f.max[1] && p[2] > f.min[2] && p[2] < f.max[2];
  if (f.kind === 'cylX') return p[0] > f.x0 && p[0] < f.x1 && Math.hypot(p[1], p[2]) < f.r;
  if (f.kind === 'plane') return p[2] < f.z;
  return false;
}

// takım bileşenleri: uçtan itibaren eksen boyunca [başlangıç, bitiş, yarıçap, ad, keser mi]
export function toolParts(tool, spindle) {
  const r = tool.d / 2, fl = tool.flute || tool.d * 3, so = Math.max(tool.stickout || fl + 10, fl), h = tool.holder || { d: 40, len: 60 }, sp = spindle || { d: 100, len: 120 };
  return [
    { a: 0, b: fl, r, name: 'kesici kısım', cut: true },
    { a: fl, b: so, r: Math.max(r, (tool.shankD || tool.d) / 2), name: 'takım sapı' },
    { a: so, b: so + h.len, r: h.d / 2, name: 'takım tutucu' },
    { a: so + h.len, b: so + h.len + sp.len, r: sp.d / 2, name: 'iş mili burnu' },
  ];
}

// ---- çarpışma kontrolü: her CL (ve hareketlerin arası) ----
export function checkCollisions(R, job, opt = {}) {
  const S = R.S, G = triGrid(S.t, Math.max(2, (job.collCell || 0) || norm(sub(S.bounds.max, S.bounds.min)) / 30));
  const hits = [], seen = new Set(), tol = opt.tol ?? 0.02, maxHits = opt.maxHits ?? 200;
  const tools = new Map(job.tools.map((t) => [t.id, t]));
  const add1 = (i, comp, obj, k) => { const key = i + '|' + comp + '|' + obj; if (seen.has(key)) return; seen.add(key); if (hits.length < maxHits) hits.push({ i, comp, obj, k }); };
  const checkPose = (i, p, v, tool, kind) => {
    const parts = toolParts(tool, job.spindle);
    for (const c of parts) {
      const A = add(p, mul(v, c.a)), L = c.b - c.a;
      // küresel uçta kesici kısmın alt yarım küresi: silindir r'den başlar, küre ayrıca
      const A2 = c.cut && tool.type === 'ball' ? add(p, mul(v, tool.d / 2)) : A, L2 = c.cut && tool.type === 'ball' ? L - tool.d / 2 : L;
      for (const f of S.fix) {
        if (cylHitsFix(f, A2, v, L2, c.r, tol)) add1(i, c.name, f.name, kind);
        else if (c.cut && tool.type === 'ball' && nearFix(f, A2, c.r - tol)) add1(i, c.name, f.name, kind);
      }
      if (!c.cut && cylHitsPart(G, A, v, L, c.r, tol)) add1(i, c.name, 'parça', kind);
      if (c.cut && kind === 'r' && (cylHitsPart(G, A2, v, L2, c.r, tol) || (tool.type === 'ball' && nearPart(G, A2, c.r - tol)))) add1(i, 'hızlı harekette kesici', 'parça', kind);
    }
    // küresel uçta dalma: küre merkezi parçaya rb − tol'dan yakın olamaz
    if (tool.type === 'ball' && kind !== 'r') { const rb = tool.d / 2, c = add(p, mul(v, rb)); if (nearPart(G, c, rb - Math.max(tol, 0.03))) add1(i, 'kesici kısım (yüzeye dalma)', 'parça', kind); }
  };
  const cl = R.cl;
  for (let i = 0; i < cl.length; i++) {
    const c = cl[i], tool = tools.get(c.tool);
    if (!tool) continue;
    checkPose(i, c.p, c.v, tool, c.k);
    if (i > 0 && cl[i - 1].tool === c.tool) {
      // ara noktalar (eş zamanlı harekette eksen de ara değerlenir)
      const a = cl[i - 1], L = norm(sub(c.p, a.p)), ang = Math.acos(Math.max(-1, Math.min(1, dot(a.v, c.v))));
      const n = Math.min(40, Math.max(Math.ceil(L / Math.max(1, tool.d)), Math.ceil(ang / 0.05)));
      for (let s = 1; s < n; s++) { const f = s / n; checkPose(i, add(a.p, mul(sub(c.p, a.p), f)), unit(add(mul(a.v, 1 - f), mul(c.v, f))), tool, c.k); }
    }
    if (hits.length >= maxHits) break;
  }
  for (const b of R.limitViolations) hits.push({ i: b.i, comp: 'eksen', obj: b.why, k: 'limit' });
  return { hits, safe: hits.length === 0, coverage: COVERAGE };
}

// ---- hacimsel talaş simülasyonu (voksel) ----
// parça içi: X boyunca ışın paritesi (her (y, z) satırı)
function insideMask(t, g) {
  const { nx, ny, nz, o, h } = g, M = new Uint8Array(nx * ny * nz);
  const rows = new Map();
  for (let i = 0; i < t.length; i += 9) {
    const ys = [t[i + 1], t[i + 4], t[i + 7]], zs = [t[i + 2], t[i + 5], t[i + 8]];
    const j0 = Math.max(0, Math.ceil((Math.min(...ys) - o[1]) / h - 0.5)), j1 = Math.min(ny - 1, Math.floor((Math.max(...ys) - o[1]) / h - 0.5));
    const k0 = Math.max(0, Math.ceil((Math.min(...zs) - o[2]) / h - 0.5)), k1 = Math.min(nz - 1, Math.floor((Math.max(...zs) - o[2]) / h - 0.5));
    for (let j = j0; j <= j1; j++) for (let k = k0; k <= k1; k++) {
      const y = o[1] + (j + 0.5) * h + 1e-7, z = o[2] + (k + 0.5) * h + 1.3e-7;
      // (y, z) üçgenin izdüşümü içinde mi; X kesişimi
      const [ax, ay, az, bx, by, bz, cx, cy, cz] = [t[i], t[i + 1], t[i + 2], t[i + 3], t[i + 4], t[i + 5], t[i + 6], t[i + 7], t[i + 8]];
      const d = (by - ay) * (cz - az) - (bz - az) * (cy - ay);
      if (Math.abs(d) < 1e-14) continue;
      const w1 = ((y - ay) * (cz - az) - (z - az) * (cy - ay)) / d, w2 = ((by - ay) * (z - az) - (bz - az) * (y - ay)) / d;
      if (w1 < 0 || w2 < 0 || w1 + w2 > 1) continue;
      const x = ax + w1 * (bx - ax) + w2 * (cx - ax), key = j * nz + k;
      let l = rows.get(key); if (!l) rows.set(key, (l = [])); l.push(x);
    }
  }
  for (const [key, xs] of rows) {
    xs.sort((a, b) => a - b);
    const j = Math.floor(key / nz), k = key % nz;
    for (let q = 0; q + 1 < xs.length; q += 2) {
      const i0 = Math.max(0, Math.ceil((xs[q] - o[0]) / h - 0.5)), i1 = Math.min(nx - 1, Math.floor((xs[q + 1] - o[0]) / h - 0.5));
      for (let i = i0; i <= i1; i++) M[(k * ny + j) * nx + i] = 1;
    }
  }
  return M;
}
export function simulate5(R, job, opt = {}) {
  const S = R.S, sb = stockBox(S.stock), maxCells = opt.maxCells || 6e5;
  const ext = [0, 1, 2].map((k) => sb.max[k] - sb.min[k]);
  let h = Math.cbrt((ext[0] * ext[1] * ext[2]) / maxCells); h = Math.max(h, opt.minH || 0.2);
  const nx = Math.ceil(ext[0] / h), ny = Math.ceil(ext[1] / h), nz = Math.ceil(ext[2] / h), o = sb.min;
  const g = { nx, ny, nz, o, h };
  const V = new Uint8Array(nx * ny * nz);   // 1: malzeme var
  for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const y = o[1] + (j + 0.5) * h, z = o[2] + (k + 0.5) * h;
    V[(k * ny + j) * nx + i] = S.stock.kind === 'cyl' ? (Math.hypot(y, z) <= S.stock.r ? 1 : 0) : 1;
  }
  const inPart = insideMask(S.t, g);
  const stockCells = V.reduce((a, b) => a + b, 0);
  const tools = new Map(job.tools.map((t) => [t.id, t]));
  // takımın kesici hacmi (uç p, eksen v): küresel → küre + silindir, düz → silindir
  const carve = (p, v, tool) => {
    const r = tool.d / 2, fl = tool.flute || tool.d * 3, ball = tool.type === 'ball', r2 = r * r;
    const e = add(p, mul(v, fl));
    const lo = [0, 1, 2].map((k) => Math.min(p[k], e[k]) - r), hi = [0, 1, 2].map((k) => Math.max(p[k], e[k]) + r);
    const i0 = Math.max(0, Math.floor((lo[0] - o[0]) / h)), i1 = Math.min(nx - 1, Math.floor((hi[0] - o[0]) / h));
    const j0 = Math.max(0, Math.floor((lo[1] - o[1]) / h)), j1 = Math.min(ny - 1, Math.floor((hi[1] - o[1]) / h));
    const k0 = Math.max(0, Math.floor((lo[2] - o[2]) / h)), k1 = Math.min(nz - 1, Math.floor((hi[2] - o[2]) / h));
    for (let k = k0; k <= k1; k++) for (let j = j0; j <= j1; j++) {
      const row = (k * ny + j) * nx;
      for (let i = i0; i <= i1; i++) {
        const c = row + i; if (!V[c]) continue;
        const qx = o[0] + (i + 0.5) * h - p[0], qy = o[1] + (j + 0.5) * h - p[1], qz = o[2] + (k + 0.5) * h - p[2];
        const ta = qx * v[0] + qy * v[1] + qz * v[2];
        if (ta > fl) continue;
        if (ball && ta < r) { const dx = qx - v[0] * r, dy = qy - v[1] * r, dz = qz - v[2] * r; if (dx * dx + dy * dy + dz * dz <= r2) V[c] = 0; continue; }
        if (ta < 0) continue;
        const rx = qx - v[0] * ta, ry = qy - v[1] * ta, rz = qz - v[2] * ta;
        if (rx * rx + ry * ry + rz * rz <= r2) V[c] = 0;
      }
    }
  };
  const cl = R.cl, upto = opt.upto ?? cl.length - 1;
  for (let i = 1; i <= upto && i < cl.length; i++) {
    const a = cl[i - 1], b = cl[i];
    if (b.k === 'r' || a.tool !== b.tool) continue;   // hızlı hareketler kesmez (parçaya girerse çarpışma olarak işaretlenir)
    const tool = tools.get(b.tool); if (!tool) continue;
    const L = norm(sub(b.p, a.p)), ang = Math.acos(Math.max(-1, Math.min(1, dot(a.v, b.v))));
    const n = Math.max(1, Math.ceil(L / (h * 0.6)), Math.ceil(ang * (tool.flute || 20) / (h * 0.6)));
    for (let s = 1; s <= n; s++) { const f = s / n; carve(add(a.p, mul(sub(b.p, a.p), f)), unit(add(mul(a.v, 1 - f), mul(b.v, f))), tool); }
    if (i === 1) carve(a.p, a.v, tool);
  }
  // sonuç: kalan fazla malzeme (parça dışı), parçaya dalma (parça içi silinmiş; yüzeyden 1 voksel içeride), yüzey noktaları
  let left = 0, gouge = 0, removed = 0;
  const pts = [], col = [];
  const idx = (i, j, k) => (k * ny + j) * nx + i;
  const deepIn = (i, j, k) => { for (const [a, b, c] of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]) { const ii = i + a, jj = j + b, kk = k + c; if (ii < 0 || jj < 0 || kk < 0 || ii >= nx || jj >= ny || kk >= nz || !inPart[idx(ii, jj, kk)]) return false; } return true; };
  for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const c = idx(i, j, k), y = o[1] + (j + 0.5) * h, z = o[2] + (k + 0.5) * h;
    const wasStock = S.stock.kind === 'cyl' ? Math.hypot(y, z) <= S.stock.r : true;
    if (!wasStock) continue;
    if (!V[c]) { removed++; if (inPart[c] && deepIn(i, j, k)) { gouge++; pts.push(o[0] + (i + 0.5) * h, y, z); col.push(2); } continue; }
    if (!inPart[c] && !(S.stock.kind === 'cyl' ? o[0] + (i + 0.5) * h < 0 : z < 0)) left++;   // bağlama payı (ayna içi / mengene altı) hariç
    // görünür yüzey vokseli (komşusu boş / sınırda)
    let surf = false;
    for (const [a, b, cc] of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]) { const ii = i + a, jj = j + b, kk = k + cc; if (ii < 0 || jj < 0 || kk < 0 || ii >= nx || jj >= ny || kk >= nz || !V[idx(ii, jj, kk)]) { surf = true; break; } }
    if (surf) { pts.push(o[0] + (i + 0.5) * h, y, z); col.push(inPart[c] ? 0 : 1); }
  }
  const vol = h * h * h;
  return {
    h, cells: stockCells, removedVol: removed * vol, leftVol: left * vol, gougeVol: gouge * vol,
    leftPct: stockCells ? left / stockCells * 100 : 0, points: new Float32Array(pts), kinds: new Uint8Array(col),
  };
}
