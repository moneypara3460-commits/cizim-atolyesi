// Akıllı Üretilebilirlik Kontrolü — saf geometri çekirdeği (3B kütüphanesi gerektirmez; Node'da test edilir: tests/mfgcheck.test.mjs)
//
// Girdi modeli (app.js hazırlar):
//   { parts: [{ id, name, type, op ('add'|'sub'), tris: Float32Array (dünya koordinatı, 9 sayı = 1 üçgen),
//               p (ham parça verisi: ölçüler, konum, açı), material: { id, name, kind } }],
//     mates: [[idA, idB, tür]], mateErr, hiddenCount, stock (kesim stok boyu) }
//
// Kontroller gerçek geometriyle yapılır:
//   - Çakışma: iki parçanın ortak hacmi, ızgara örnekleme + nokta-içinde testi (ışın paritesi, BVH) ve yüzeye uzaklık payı ile ölçülür.
//     Yalnızca yüzeyleri değen (kaynak / montaj teması) parçalar çakışma sayılmaz (iç noktalar yüzeyden en az 'tol' içeride olmalı).
//   - Boşluk: köşe noktalarından karşı yüzeye en kısa uzaklık (BVH); 0,05–2 mm arası "neredeyse değiyor" uyarısı.
//   - Montaj: parçalar 6 ana eksende tek tek sökülmeye çalışılır (projeksiyon ızgarasıyla süpürme testi); sökülemeyenler montaj sırası bulunamayanlardır.
//   - Kaynak erişimi: bağlantı noktasından yarım küre içinde torç ışınları (meme yarıçapı kadar paralel ışınlarla) atılır, açık yön oranı ölçülür.
//   - Delik / cıvata: oyuk silindirlerin ekseni boyunca cıvata başı ve somun için boşluk, kenar mesafesi, standart matkap çapı.
//   - Profil / ölçü: geçersiz ölçüler, uygulanamayan iskelet ölçüleri, stok boyundan uzun ya da çok kısa elemanlar, malzeme uyumu.
// Yapılamayan kontroller (ör. kapalı olmayan yüzey) rapora "yapılamadı" diye yazılır; asla başarılı gösterilmez.

import { frameMembers, PROFILES, miterOK } from './logic.js?v=20261111e';

const TOL = 0.05;          // temas toleransı (mm)
const DEPTH_MIN = 0.2;     // bundan sığ iç içe geçme çakışma sayılmaz (mm)
const GAP_MAX = 2;         // "neredeyse değiyor" üst sınırı (mm)

/* ---------- vektör ---------- */
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = (a) => Math.hypot(a[0], a[1], a[2]);
const norm = (a) => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const r1 = (v) => Math.round(v * 10) / 10;
const f1 = (v) => String(r1(v)).replace('.', ',');

// three.js Euler 'XYZ' (derece) dönüş matrisi: R = Rx · Ry · Rz
export function eulerXYZ(rx, ry, rz) {
  const D = Math.PI / 180, a = (rx || 0) * D, b = (ry || 0) * D, c = (rz || 0) * D;
  const ca = Math.cos(a), sa = Math.sin(a), cb = Math.cos(b), sb = Math.sin(b), cc = Math.cos(c), sc = Math.sin(c);
  return [
    [cb * cc, -cb * sc, sb],
    [ca * sc + sa * sb * cc, ca * cc - sa * sb * sc, -sa * cb],
    [sa * sc - ca * sb * cc, sa * cc + ca * sb * sc, ca * cb],
  ];
}
const mv = (m, v) => [m[0][0] * v[0] + m[0][1] * v[1] + m[0][2] * v[2], m[1][0] * v[0] + m[1][1] * v[1] + m[1][2] * v[2], m[2][0] * v[0] + m[2][1] * v[1] + m[2][2] * v[2]];
export const partPose = (p) => ({ R: eulerXYZ(+p.rx || 0, +p.ry || 0, +p.rz || 0), T: [+p.x || 0, +p.y || 0, +p.z || 0] });
const toWorld = (pose, v) => add(mv(pose.R, v), pose.T);

/* ---------- üçgen ağı + BVH ---------- */
export class Mesh {
  constructor(tris) {
    this.t = tris instanceof Float32Array || tris instanceof Float64Array ? tris : Float64Array.from(tris);
    this.n = Math.floor(this.t.length / 9);
    const b = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] };
    for (let i = 0; i < this.n * 9; i += 3) for (let k = 0; k < 3; k++) { const v = this.t[i + k]; if (v < b.min[k]) b.min[k] = v; if (v > b.max[k]) b.max[k] = v; }
    this.box = b;
    this._bvh = null;
  }
  tri(i) { const o = i * 9, t = this.t; return [[t[o], t[o + 1], t[o + 2]], [t[o + 3], t[o + 4], t[o + 5]], [t[o + 6], t[o + 7], t[o + 8]]]; }
  get bvh() { if (!this._bvh) this._bvh = buildBVH(this); return this._bvh; }
  // ışın paritesi: üç eğik yönden çoğunluk (kenar / köşe üstünden geçen ışınlara karşı dayanıklı)
  contains(p) {
    if (!inBox(this.box, p, 1e-9)) return false;
    let ins = 0;
    for (const d of PARITY_DIRS) { if (rayCount(this, p, d) % 2 === 1) ins++; if (ins >= 2) return true; }
    return false;
  }
  nearest(p, maxD = Infinity) { return nearestDist(this, p, maxD); }
  hit(o, d, tmax) { return rayAny(this, o, d, tmax); }
  // kapalı katı mı: her kenar çift sayıda üçgende kullanılmalı
  closed() {
    if (this._closed != null) return this._closed;
    const q = (i) => Math.round(this.t[i] * 1e3) + ',' + Math.round(this.t[i + 1] * 1e3) + ',' + Math.round(this.t[i + 2] * 1e3);
    const m = new Map();
    for (let i = 0; i < this.n; i++) {
      const k = [q(i * 9), q(i * 9 + 3), q(i * 9 + 6)];
      for (let e = 0; e < 3; e++) {
        const a = k[e], b = k[(e + 1) % 3];
        if (a === b) continue;
        const key = a < b ? a + '|' + b : b + '|' + a;
        m.set(key, (m.get(key) || 0) + 1);
      }
    }
    let bad = 0;
    for (const c of m.values()) if (c % 2) bad++;
    this._closed = m.size > 0 && bad / m.size < 0.002;
    return this._closed;
  }
  vertices(maxN = 4000) {
    const out = [], step = Math.max(1, Math.ceil(this.n * 3 / maxN));
    for (let i = 0; i < this.n * 3; i += step) out.push([this.t[i * 3], this.t[i * 3 + 1], this.t[i * 3 + 2]]);
    return out;
  }
  volume() { let v = 0; for (let i = 0; i < this.n; i++) { const [a, b, c] = this.tri(i); v += dot(a, cross(b, c)) / 6; } return Math.abs(v); }
}
const PARITY_DIRS = [norm([1, 0.0123, 0.0071]), norm([0.0091, 1, 0.0137]), norm([0.0113, 0.0067, 1])];
const inBox = (b, p, e = 0) => p[0] >= b.min[0] - e && p[0] <= b.max[0] + e && p[1] >= b.min[1] - e && p[1] <= b.max[1] + e && p[2] >= b.min[2] - e && p[2] <= b.max[2] + e;
export const boxOverlap = (a, b) => ({ min: [0, 1, 2].map((k) => Math.max(a.min[k], b.min[k])), max: [0, 1, 2].map((k) => Math.min(a.max[k], b.max[k])) });
const boxGap = (a, b) => Math.hypot(...[0, 1, 2].map((k) => Math.max(0, a.min[k] - b.max[k], b.min[k] - a.max[k])));

function buildBVH(mesh) {
  const n = mesh.n, t = mesh.t;
  const idx = new Int32Array(n), cen = new Float64Array(n * 3);
  for (let i = 0; i < n; i++) { idx[i] = i; for (let k = 0; k < 3; k++) cen[i * 3 + k] = (t[i * 9 + k] + t[i * 9 + 3 + k] + t[i * 9 + 6 + k]) / 3; }
  const nodes = [];
  const make = (s, e) => {
    const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity], cmn = [Infinity, Infinity, Infinity], cmx = [-Infinity, -Infinity, -Infinity];
    for (let j = s; j < e; j++) {
      const i = idx[j];
      for (let v = 0; v < 3; v++) for (let k = 0; k < 3; k++) { const x = t[i * 9 + v * 3 + k]; if (x < mn[k]) mn[k] = x; if (x > mx[k]) mx[k] = x; }
      for (let k = 0; k < 3; k++) { const c = cen[i * 3 + k]; if (c < cmn[k]) cmn[k] = c; if (c > cmx[k]) cmx[k] = c; }
    }
    const node = { min: mn, max: mx, s, e, l: -1, r: -1 };
    const id = nodes.length; nodes.push(node);
    if (e - s > 6) {
      let ax = 0; for (let k = 1; k < 3; k++) if (cmx[k] - cmn[k] > cmx[ax] - cmn[ax]) ax = k;
      const mid = (cmn[ax] + cmx[ax]) / 2;
      let i0 = s, i1 = e - 1;
      while (i0 <= i1) { if (cen[idx[i0] * 3 + ax] < mid) i0++; else { const tmp = idx[i0]; idx[i0] = idx[i1]; idx[i1] = tmp; i1--; } }
      if (i0 === s || i0 === e) i0 = (s + e) >> 1;
      node.l = make(s, i0); node.r = make(i0, e);
    }
    return id;
  };
  if (n) make(0, n);
  return { nodes, idx };
}
function rayBox(o, inv, mn, mx, tmax) {
  let t0 = 0, t1 = tmax;
  for (let k = 0; k < 3; k++) {
    let a = (mn[k] - o[k]) * inv[k], b = (mx[k] - o[k]) * inv[k];
    if (a > b) { const x = a; a = b; b = x; }
    if (a > t0) t0 = a; if (b < t1) t1 = b;
    if (t0 > t1) return false;
  }
  return true;
}
// Möller–Trumbore; t > 0 ise t, değilse -1
function rayTri(o, d, t, i) {
  const ax = t[i], ay = t[i + 1], az = t[i + 2];
  const e1x = t[i + 3] - ax, e1y = t[i + 4] - ay, e1z = t[i + 5] - az, e2x = t[i + 6] - ax, e2y = t[i + 7] - ay, e2z = t[i + 8] - az;
  const px = d[1] * e2z - d[2] * e2y, py = d[2] * e2x - d[0] * e2z, pz = d[0] * e2y - d[1] * e2x;
  const det = e1x * px + e1y * py + e1z * pz;
  if (Math.abs(det) < 1e-12) return -1;
  const id = 1 / det, sx = o[0] - ax, sy = o[1] - ay, sz = o[2] - az;
  const u = (sx * px + sy * py + sz * pz) * id;
  if (u < 0 || u > 1) return -1;
  const qx = sy * e1z - sz * e1y, qy = sz * e1x - sx * e1z, qz = sx * e1y - sy * e1x;
  const v = (d[0] * qx + d[1] * qy + d[2] * qz) * id;
  if (v < 0 || u + v > 1) return -1;
  const tt = (e2x * qx + e2y * qy + e2z * qz) * id;
  return tt > 1e-9 ? tt : -1;
}
function rayCount(mesh, o, d) {
  const { nodes, idx } = mesh.bvh, inv = d.map((x) => 1 / (x || 1e-30)), t = mesh.t;
  if (!nodes.length) return 0;
  const hits = [];
  const st = [0];
  while (st.length) {
    const nd = nodes[st.pop()];
    if (!rayBox(o, inv, nd.min, nd.max, Infinity)) continue;
    if (nd.l < 0) { for (let j = nd.s; j < nd.e; j++) { const h = rayTri(o, d, t, idx[j] * 9); if (h > 0) hits.push(h); } }
    else st.push(nd.l, nd.r);
  }
  // paylaşılan kenardan iki kez sayılan vuruşları birleştir
  hits.sort((a, b) => a - b);
  let c = 0;
  for (let i = 0; i < hits.length; i++) if (!i || hits[i] - hits[i - 1] > 1e-7) c++;
  return c;
}
function rayAny(mesh, o, d, tmax) {
  const { nodes, idx } = mesh.bvh, inv = d.map((x) => 1 / (x || 1e-30)), t = mesh.t;
  if (!nodes.length) return false;
  const st = [0];
  while (st.length) {
    const nd = nodes[st.pop()];
    if (!rayBox(o, inv, nd.min, nd.max, tmax)) continue;
    if (nd.l < 0) { for (let j = nd.s; j < nd.e; j++) { const h = rayTri(o, d, t, idx[j] * 9); if (h > 0 && h < tmax) return true; } }
    else st.push(nd.l, nd.r);
  }
  return false;
}
// noktanın üçgene en yakın uzaklığı (Ericson)
function ptTri(p, t, i) {
  const a = [t[i], t[i + 1], t[i + 2]], b = [t[i + 3], t[i + 4], t[i + 5]], c = [t[i + 6], t[i + 7], t[i + 8]];
  const ab = sub(b, a), ac = sub(c, a), ap = sub(p, a);
  const d1 = dot(ab, ap), d2 = dot(ac, ap);
  if (d1 <= 0 && d2 <= 0) return len(ap);
  const bp = sub(p, b), d3 = dot(ab, bp), d4 = dot(ac, bp);
  if (d3 >= 0 && d4 <= d3) return len(bp);
  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) return len(sub(p, add(a, mul(ab, d1 / (d1 - d3)))));
  const cp = sub(p, c), d5 = dot(ab, cp), d6 = dot(ac, cp);
  if (d6 >= 0 && d5 <= d6) return len(cp);
  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) return len(sub(p, add(a, mul(ac, d2 / (d2 - d6)))));
  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) { const w = (d4 - d3) / ((d4 - d3) + (d5 - d6)); return len(sub(p, add(b, mul(sub(c, b), w)))); }
  const den = 1 / (va + vb + vc), v = vb * den, w = vc * den;
  return len(sub(p, add(a, add(mul(ab, v), mul(ac, w)))));
}
const boxDist = (p, mn, mx) => Math.hypot(Math.max(mn[0] - p[0], 0, p[0] - mx[0]), Math.max(mn[1] - p[1], 0, p[1] - mx[1]), Math.max(mn[2] - p[2], 0, p[2] - mx[2]));
function nearestDist(mesh, p, maxD) {
  const { nodes, idx } = mesh.bvh, t = mesh.t;
  let best = maxD;
  if (!nodes.length) return best;
  const st = [0];
  while (st.length) {
    const nd = nodes[st.pop()];
    if (boxDist(p, nd.min, nd.max) >= best) continue;
    if (nd.l < 0) { for (let j = nd.s; j < nd.e; j++) { const d = ptTri(p, t, idx[j] * 9); if (d < best) best = d; } }
    else {
      const L = nodes[nd.l], R = nodes[nd.r];
      if (boxDist(p, L.min, L.max) < boxDist(p, R.min, R.max)) st.push(nd.r, nd.l); else st.push(nd.l, nd.r);
    }
  }
  return best;
}

/* ---------- iki parça: uzaklık ve çakışma ---------- */
// noktanın üçgendeki en yakın noktası
export function closestOnTri(p, a, b, c) {
  const ab = sub(b, a), ac = sub(c, a), ap = sub(p, a);
  const d1 = dot(ab, ap), d2 = dot(ac, ap);
  if (d1 <= 0 && d2 <= 0) return a;
  const bp = sub(p, b), d3 = dot(ab, bp), d4 = dot(ac, bp);
  if (d3 >= 0 && d4 <= d3) return b;
  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) return add(a, mul(ab, d1 / (d1 - d3)));
  const cp = sub(p, c), d5 = dot(ab, cp), d6 = dot(ac, cp);
  if (d6 >= 0 && d5 <= d6) return c;
  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) return add(a, mul(ac, d2 / (d2 - d6)));
  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) return add(b, mul(sub(c, b), (d4 - d3) / ((d4 - d3) + (d5 - d6))));
  const den = 1 / (va + vb + vc);
  return add(a, add(mul(ab, vb * den), mul(ac, vc * den)));
}
// iki doğru parçası arası en kısa uzaklık (Ericson) → [uzaklık, birinci parçadaki nokta]
function segSeg(p1, q1, p2, q2) {
  const d1 = sub(q1, p1), d2 = sub(q2, p2), r = sub(p1, p2), a = dot(d1, d1), e = dot(d2, d2), f = dot(d2, r);
  let s, t;
  if (a < 1e-18 && e < 1e-18) { s = t = 0; }
  else if (a < 1e-18) { s = 0; t = Math.min(Math.max(f / e, 0), 1); }
  else {
    const c = dot(d1, r);
    if (e < 1e-18) { t = 0; s = Math.min(Math.max(-c / a, 0), 1); }
    else {
      const b = dot(d1, d2), den = a * e - b * b;
      s = den > 1e-18 ? Math.min(Math.max((b * f - c * e) / den, 0), 1) : 0;
      t = (b * s + f) / e;
      if (t < 0) { t = 0; s = Math.min(Math.max(-c / a, 0), 1); } else if (t > 1) { t = 1; s = Math.min(Math.max((b - c) / a, 0), 1); }
    }
  }
  const c1 = add(p1, mul(d1, s)), c2 = add(p2, mul(d2, t));
  return [len(sub(c1, c2)), c1];
}
// iki üçgen arası en kısa uzaklık: köşe–yüz ve kenar–kenar çiftleri; kesişiyorsa 0
export function triTri(A, B) {
  let best = Infinity, at = null;
  const upd = (d, p) => { if (d < best) { best = d; at = p; } };
  for (let i = 0; i < 3; i++) {
    const p = A[i], q = A[(i + 1) % 3];
    const h = rayTri(p, sub(q, p), flat(B), 0);
    if (h > 0 && h <= 1) return [0, add(p, mul(sub(q, p), h))];
    const p2 = B[i], q2 = B[(i + 1) % 3];
    const h2 = rayTri(p2, sub(q2, p2), flat(A), 0);
    if (h2 > 0 && h2 <= 1) return [0, add(p2, mul(sub(q2, p2), h2))];
  }
  for (const v of A) { const c = closestOnTri(v, ...B); upd(len(sub(v, c)), v); }
  for (const v of B) { const c = closestOnTri(v, ...A); upd(len(sub(v, c)), c); }
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) { const [d, p] = segSeg(A[i], A[(i + 1) % 3], B[j], B[(j + 1) % 3]); upd(d, p); }
  return [best, at];
}
const flat = (T) => [T[0][0], T[0][1], T[0][2], T[1][0], T[1][1], T[1][2], T[2][0], T[2][1], T[2][2]];
const nodeGap = (a, b) => Math.hypot(...[0, 1, 2].map((k) => Math.max(0, a.min[k] - b.max[k], b.min[k] - a.max[k])));
// en kısa uzaklık (maxD'ye kadar) ve en yakın nokta: iki BVH birlikte gezilir, tam üçgen–üçgen uzaklığı
export function minDistance(A, B, maxD = 3) {
  const g0 = boxGap(A.box, B.box);
  if (g0 >= maxD) return { d: g0, p: null };
  const NA = A.bvh, NB = B.bvh;
  if (!NA.nodes.length || !NB.nodes.length) return { d: maxD, p: null };
  let best = maxD, at = null, work = 0;
  const st = [[0, 0]];
  while (st.length) {
    const [ia, ib] = st.pop(), na = NA.nodes[ia], nb = NB.nodes[ib];
    if (nodeGap(na, nb) >= best) continue;
    if (na.l < 0 && nb.l < 0) {
      for (let x = na.s; x < na.e; x++) {
        const TA = A.tri(NA.idx[x]);
        for (let y = nb.s; y < nb.e; y++) {
          const TB = B.tri(NB.idx[y]);
          const [d, p] = triTri(TA, TB);
          if (d < best) { best = d; at = p; if (best <= 1e-9) return { d: 0, p: at }; }
        }
      }
      if (++work > 400000) break;
      continue;
    }
    // büyük olanı böl
    const splitA = nb.l < 0 || (na.l >= 0 && (na.e - na.s) >= (nb.e - nb.s));
    if (splitA) st.push([na.l, ib], [na.r, ib]); else st.push([ia, nb.l], [ia, nb.r]);
  }
  return { d: best, p: at };
}
// ortak hacim: { vol (mm³), depth (mm), region {min,max}, count }. cutters: oyuk ağları (içleri sayılmaz)
export function interference(A, B, cutters = [], opts = {}) {
  const ov = boxOverlap(A.box, B.box), ext = [0, 1, 2].map((k) => ov.max[k] - ov.min[k]);
  const none = { vol: 0, depth: 0, region: null, count: 0, contact: ext.every((e) => e >= -TOL) };
  if (ext.some((e) => e <= 2 * TOL)) return none;
  const maxN = opts.samples || 24000;
  // eksen başına hücre: bütçe eksenlere dengeli dağıtılır; ince eksende de en az 6 hücre olur (ince batmalar kaçmasın)
  const nAx = [0, 0, 0], pinned = [false, false, false];
  for (let round = 0; round < 3; round++) {
    const free = [0, 1, 2].filter((k) => !pinned[k]);
    const pinProd = [0, 1, 2].filter((k) => pinned[k]).reduce((m, k) => m * nAx[k], 1);
    const cell = Math.pow(free.reduce((m, k) => m * ext[k], 1) / Math.max(maxN / pinProd, 1), 1 / Math.max(free.length, 1));
    let again = false;
    for (const k of free) { nAx[k] = Math.ceil(ext[k] / cell); if (nAx[k] < 6) { nAx[k] = 6; pinned[k] = true; again = true; } }
    if (!again) break;
  }
  for (let k = 0; k < 3; k++) nAx[k] = Math.max(2, Math.min(nAx[k], 600));
  const cs = ext.map((e, k) => e / nAx[k]);
  const cuts = cutters.filter((c) => boxGap(c.box, ov) === 0);
  let count = 0, depth = 0, vdepth = 0;
  const rmin = [Infinity, Infinity, Infinity], rmax = [-Infinity, -Infinity, -Infinity];
  const test = (p) => {
    if (!A.contains(p) || !B.contains(p)) return 0;
    if (cuts.some((c) => c.contains(p))) return 0;
    const da = A.nearest(p, 1e9), db = B.nearest(p, 1e9), d = Math.min(da, db);
    return d > TOL ? d : 0;
  };
  for (let i = 0; i < nAx[0]; i++) for (let j = 0; j < nAx[1]; j++) for (let k = 0; k < nAx[2]; k++) {
    const p = [ov.min[0] + (i + 0.5) * cs[0], ov.min[1] + (j + 0.5) * cs[1], ov.min[2] + (k + 0.5) * cs[2]];
    const d = test(p);
    if (!d) continue;
    count++; if (d > depth) depth = d;  // ortak bölgenin içindeki en derin nokta → bölge kalınlığının yarısı
    for (let q = 0; q < 3; q++) { if (p[q] < rmin[q]) rmin[q] = p[q]; if (p[q] > rmax[q]) rmax[q] = p[q]; }
  }
  // köşe derinliği: bir parçanın köşeleri diğerinin içindeyse (ızgaranın kaçırabileceği ince batmalar)
  for (const [P, Q] of [[A, B], [B, A]]) for (const v of P.vertices(1500)) {
    if (!inBox(ov, v, 1e-9) || !Q.contains(v) || cuts.some((c) => c.contains(v))) continue;
    const d = Q.nearest(v, 1e9);
    if (d > TOL) { if (d > vdepth) vdepth = d; for (let q = 0; q < 3; q++) { if (v[q] < rmin[q]) rmin[q] = v[q]; if (v[q] > rmax[q]) rmax[q] = v[q]; } if (!count) count = 0.5; }
  }
  if (!count) return none;
  // batma derinliği: ızgarada en derin iç nokta bölge kalınlığının yarısıdır (×2, hücre payı eklenir); köşe batması doğrudan derinliktir.
  // üst sınır: ortak bölgenin en ince kenarı (+1 hücre)
  const thin = Math.min(...[0, 1, 2].map((q) => rmax[q] - rmin[q] + cs[q]));
  const gd = depth > 0 ? Math.min(2 * depth + Math.min(...cs) / 2, thin) : 0;
  // span: çakışma bölgesinin en ince boyutu (parçayı ne kadar kaydırmak gerektiğinin tahmini; içi boş profilde malzeme derinliğinden büyüktür)
  const span = Math.max(thin, Math.max(gd, vdepth));
  return { vol: Math.round(Math.floor(count) * cs[0] * cs[1] * cs[2]), depth: r1(Math.max(gd, vdepth)), span: r1(span), region: { min: rmin, max: rmax }, count, contact: false };
}

/* ---------- montaj: eksen boyunca sökülebilir mi ---------- */
const AXES = [[0, 1], [0, -1], [1, 1], [1, -1], [2, 1], [2, -1]];
export const AXIS_NAME = ['+X (sağa)', '−X (sola)', '+Y (yukarı)', '−Y (aşağı)', '+Z (öne)', '−Z (arkaya)'];
// P, ax eksen yönünde sonsuza kaydırılırsa Q'ya çarpar mı? (projeksiyon ızgarası; yan yüzden temas engel sayılmaz)
export function blocks(P, Q, ai, res = 40) {
  const [ax, sg] = AXES[ai], u = (ax + 1) % 3, v = (ax + 2) % 3;
  const ou = Math.max(P.box.min[u], Q.box.min[u]), ou1 = Math.min(P.box.max[u], Q.box.max[u]);
  const ovv = Math.max(P.box.min[v], Q.box.min[v]), ov1 = Math.min(P.box.max[v], Q.box.max[v]);
  if (ou1 - ou <= TOL || ov1 - ovv <= TOL) return false;
  // Q tamamen P'nin arkasındaysa çarpmaz
  if (sg > 0 ? Q.box.max[ax] <= P.box.min[ax] + TOL : Q.box.min[ax] >= P.box.max[ax] - TOL) return false;
  const nu = res, nv = res, du = (ou1 - ou) / nu, dv = (ov1 - ovv) / nv;
  const front = new Float64Array(nu * nv).fill(-Infinity);
  const raster = (M, cb) => {
    for (let i = 0; i < M.n; i++) {
      const T = M.tri(i);
      const pu = T.map((p) => p[u]), pv = T.map((p) => p[v]), pd = T.map((p) => p[ax] * sg);
      const area = (pu[1] - pu[0]) * (pv[2] - pv[0]) - (pu[2] - pu[0]) * (pv[1] - pv[0]);
      if (Math.abs(area) < 1e-12) continue;
      const i0 = Math.max(0, Math.floor((Math.min(...pu) - ou) / du - 0.5)), i1 = Math.min(nu - 1, Math.ceil((Math.max(...pu) - ou) / du - 0.5));
      const j0 = Math.max(0, Math.floor((Math.min(...pv) - ovv) / dv - 0.5)), j1 = Math.min(nv - 1, Math.ceil((Math.max(...pv) - ovv) / dv - 0.5));
      for (let a = i0; a <= i1; a++) for (let b = j0; b <= j1; b++) {
        const cu = ou + (a + 0.5) * du, cv = ovv + (b + 0.5) * dv;
        const w0 = ((pu[1] - cu) * (pv[2] - cv) - (pu[2] - cu) * (pv[1] - cv)) / area;
        const w1 = ((pu[2] - cu) * (pv[0] - cv) - (pu[0] - cu) * (pv[2] - cv)) / area;
        const w2 = 1 - w0 - w1;
        if (w0 < -1e-9 || w1 < -1e-9 || w2 < -1e-9) continue;
        if (cb(a * nv + b, w0 * pd[0] + w1 * pd[1] + w2 * pd[2])) return true;
      }
    }
    return false;
  };
  raster(P, (c, d) => { if (d > front[c]) front[c] = d; return false; });
  return raster(Q, (c, d) => front[c] > -Infinity && d > front[c] + TOL);
}
// sökme sırası: her turda kalanlara çarpmadan bir eksende çıkabilen birimler sökülür. Dönüş: { order: [[birim, eksen]], stuck: [birim] }
export function disassembly(units, meshesOf) {
  const left = units.slice(), order = [];
  const free = (u, rest) => {
    for (let ai = 0; ai < 6; ai++) {
      let ok = true;
      for (const o of rest) { if (o === u) continue; if (meshesOf(u).some((P) => meshesOf(o).some((Q) => blocks(P, Q, ai)))) { ok = false; break; } }
      if (ok) return ai;
    }
    return -1;
  };
  let changed = true;
  while (left.length > 1 && changed) {
    changed = false;
    for (let i = left.length - 1; i >= 0 && left.length > 1; i--) {
      const ai = free(left[i], left);
      if (ai >= 0) { order.push([left[i], ai]); left.splice(i, 1); changed = true; }
    }
  }
  if (left.length === 1) { order.push([left[0], -1]); return { order, stuck: [] }; }
  return { order, stuck: left };
}

/* ---------- kaynak erişimi ---------- */
// noktadan n çevresinde (yarım küre) torç yönleri; açık yön oranı. Meme yarıçapı kadar 4 paralel ışın da açık olmalı.
const HEMI = (() => { const out = [], N = 40; for (let i = 0; i < N; i++) { const z = 1 - (i + 0.5) / N * 0.83, r = Math.sqrt(1 - z * z), a = i * 2.39996; out.push([r * Math.cos(a), r * Math.sin(a), z]); } return out; })();
export function torchAccess(p, n, meshes, opts = {}) {
  const L = opts.reach || 150, nr = opts.nozzle || 6;
  n = norm(n);
  const t1 = norm(Math.abs(n[0]) < 0.9 ? cross(n, [1, 0, 0]) : cross(n, [0, 1, 0])), t2 = cross(n, t1);
  const near = meshes.filter((m) => boxGap(m.box, { min: sub(p, [L, L, L]), max: add(p, [L, L, L]) }) === 0);
  // başlangıç noktası katının içindeyse erişim yok
  if (near.some((m) => m.contains(p))) return 0;
  let freeN = 0;
  for (const h of HEMI) {
    const d = norm(add(add(mul(t1, h[0]), mul(t2, h[1])), mul(n, h[2])));
    const a = norm(Math.abs(d[0]) < 0.9 ? cross(d, [1, 0, 0]) : cross(d, [0, 1, 0])), b = cross(d, a);
    const starts = [p, ...[[1, 0], [-1, 0], [0, 1], [0, -1]].map(([x, y]) => add(add(p, mul(a, x * nr)), mul(b, y * nr)))];
    // paralel ışınlar uçtan biraz geride başlar (meme ağzı kaynağa değmez)
    const ok = starts.every((s, i) => !near.some((m) => m.hit(i ? add(s, mul(d, nr)) : s, d, L)));
    if (ok) freeN++;
  }
  return freeN / HEMI.length;
}

/* ---------- iskelet elemanları (dünya koordinatında) ---------- */
export function frameWorldMembers(p) {
  const F = frameMembers(p), pose = partPose(p);
  return F.members.map((m) => {
    const a = toWorld(pose, m.a), b = toWorld(pose, m.b), axis = norm(sub(b, a));
    const u0 = mv(pose.R, m.u), u = norm(sub(u0, mul(axis, dot(u0, axis)))), v = cross(axis, u);
    return { a, b, axis, u, v, w: m.w, h: m.h, role: m.role, len: len(sub(b, a)), miter: !!m.miter, mit: m.miter || null, kind: F.pr.kind, t: F.pr.t };
  });
}
// nokta ile eleman (kutu) yüzeyi arasındaki uzaklık (eleman ekseni etrafında w×h kesit)
function memberDist(m, p) {
  const r = sub(p, m.a), s = dot(r, m.axis), x = dot(r, m.u), y = dot(r, m.v);
  const ds = Math.max(-s, 0, s - m.len), dx = Math.max(Math.abs(x) - m.w / 2, 0), dy = Math.max(Math.abs(y) - m.h / 2, 0);
  return Math.hypot(ds, dx, dy);
}
// iskeletteki kaynak noktaları: bir elemanın ucu başka elemana değiyorsa
export function frameJoints(members) {
  const out = [];
  members.forEach((m, i) => {
    for (const [end, inward] of [[m.a, m.axis], [m.b, mul(m.axis, -1)]]) {
      const hits = members.map((o, j) => [j, j === i ? Infinity : memberDist(o, end)]).filter(([, d]) => d < 1.0);
      if (hits.length) out.push({ member: i, other: hits.map(([j]) => j), at: end, inward });
    }
  });
  return out;
}

/* ---------- delikler (oyuk silindirler) ---------- */
export const DRILLS = [1, 1.5, 2, 2.5, 3, 3.2, 3.3, 3.5, 4, 4.2, 4.5, 5, 5.5, 6, 6.4, 6.6, 6.8, 7, 8, 8.4, 8.5, 9, 10, 10.2, 10.5, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 24, 25, 26, 28, 30, 32];
export function holeAxis(p) {
  const pose = partPose(p), h = Math.max(+p.h || 0, 0.01);
  const base = toWorld(pose, [0, 0, 0]), top = toWorld(pose, [0, h, 0]);
  return { base, top, axis: norm(sub(top, base)), r: Math.max(+p.d || 0, 0) / 2, h };
}

/* ---------- ana analiz ---------- */
const COMPONENT_TYPES = new Set(['frame', 'sheet', 'sweep', 'tube', 'mesh']);
const WELDABLE = new Set(['frame', 'sheet', 'sweep', 'tube']);
const DIM_KEYS = { box: ['w', 'l', 'h'], cylinder: ['d', 'h'], sphere: ['d'], cone: ['d', 'h'], tube: ['d', 'di', 'h'], frame: ['fw', 'fd', 'fh'], sheet: ['st', 'sw'] };
const DIM_NAME = { w: 'genişlik', l: 'uzunluk', h: 'yükseklik', d: 'çap', di: 'iç çap', fw: 'en', fd: 'derinlik', fh: 'yükseklik', st: 'sac kalınlığı', sw: 'sac genişliği' };

export async function analyzeModel(model, opts = {}) {
  const prog = opts.onProgress || (() => {}), tick = opts.tick || (() => Promise.resolve());
  const mode = opts.mode || 'auto';                         // 'auto' | 'separate'
  const stock = Number(model.stock) || 6000;
  const issues = [], coverage = [];
  let nid = 0;
  const issue = (o) => issues.push({ id: ++nid, ...o });
  const all = (model.parts || []).filter((q) => q.tris && q.tris.length >= 9);
  const mesh = new Map(all.map((q) => [q.id, new Mesh(q.tris)]));
  const solids = all.filter((q) => q.op !== 'sub'), cutters = all.filter((q) => q.op === 'sub');
  const name = (q) => q.name || ('#' + q.id);
  const M = (q) => mesh.get(q.id);
  const cutMeshes = cutters.map(M);
  const mated = new Set((model.mates || []).flatMap(([a, b]) => [a + '|' + b, b + '|' + a]));
  const linked = (a, b) => mated.has(a.id + '|' + b.id) || a.p.parent === b.id || b.p.parent === a.id;
  const separate = (a, b) => mode === 'separate' || COMPONENT_TYPES.has(a.type) || COMPONENT_TYPES.has(b.type) || linked(a, b);
  const isMetal = (q) => q.material && q.material.kind === 'metal';

  /* 1) açık / kapalı yüzey */
  prog(0.02, 'Yüzeyler kontrol ediliyor');
  const open = solids.filter((q) => !M(q).closed());
  const usable = solids.filter((q) => !open.includes(q));
  if (open.length) coverage.push({ name: 'Kapalı katı kontrolü', status: 'partial', detail: open.map(name).join(', ') + ' kapalı bir katı değil; bu parçalarda çakışma ve içerik testleri yapılamadı.' });
  else coverage.push({ name: 'Kapalı katı kontrolü', status: 'ok', detail: solids.length + ' parça kapalı katı.' });
  await tick();

  /* 2) ölçü ve profil kontrolleri (veriden) */
  prog(0.05, 'Ölçüler ve profiller kontrol ediliyor');
  let profileChecks = 0;
  for (const q of all) {
    const p = q.p || {};
    for (const k of DIM_KEYS[q.type] || []) {
      const v = Number(p[k]);
      if (!(isFinite(v) && v > 0)) issue({ sev: 'crit', cat: 'Ölçü', title: 'Eksik veya geçersiz ölçü', desc: name(q) + ' parçasının ' + (DIM_NAME[k] || k) + ' değeri ' + (p[k] === '' || p[k] == null ? 'boş' : '"' + p[k] + '"') + '. Uygulama bunu 1 mm kabul edip çiziyor; üretim ölçüsü belirsiz.', fix: 'Ölçü sekmesinden gerçek değeri gir.', parts: [q.id], box: M(q).box });
    }
    if (q.type === 'tube' && +p.di >= +p.d) issue({ sev: 'crit', cat: 'Ölçü', title: 'Boru iç çapı dış çaptan büyük', desc: name(q) + ': iç çap ' + f1(+p.di) + ' mm, dış çap ' + f1(+p.d) + ' mm. Et kalınlığı yok.', fix: 'İç çapı dış çaptan en az 1 mm küçük yap.', parts: [q.id], box: M(q).box });
    else if (q.type === 'tube' && (+p.d - +p.di) / 2 < 0.8) issue({ sev: 'warn', cat: 'Profil', title: 'Çok ince boru et kalınlığı', desc: name(q) + ': et kalınlığı ' + f1((+p.d - +p.di) / 2) + ' mm. Kesimde ezilir, kaynakta delinir.', fix: 'Et kalınlığını en az 1–1,5 mm yap.', parts: [q.id], box: M(q).box });
    if (q.type === 'frame') {
      profileChecks++;
      const pr = PROFILES[p.pf] || PROFILES.k40;
      if (!PROFILES[p.pf]) issue({ sev: 'warn', cat: 'Profil', title: 'Profil tanımı bulunamadı', desc: name(q) + ' için seçilen profil (' + p.pf + ') listede yok; 40×40×2 kabul edildi.', fix: 'Tür sekmesinden profili yeniden seç.', parts: [q.id], box: M(q).box });
      if (pr.t * 2 >= Math.min(pr.w, pr.h)) issue({ sev: 'crit', cat: 'Profil', title: 'Geçersiz profil et kalınlığı', desc: pr.name + ': et kalınlığı kesitin yarısından büyük.', fix: 'Profil ölçüsünü düzelt.', parts: [q.id], box: M(q).box });
      const W = +p.fw, D = +p.fd, H = +p.fh;
      const minW = 2 * pr.w + 1, minD = 2 * pr.h + 1, minH = 2 * pr.w + 1;
      const bad = [];
      if (W > 0 && W < minW) bad.push('en ' + f1(W) + ' mm (en az ' + f1(minW) + ')');
      if (D > 0 && D < minD && p.fr !== 'rect') bad.push('derinlik ' + f1(D) + ' mm (en az ' + f1(minD) + ')');
      if (H > 0 && H < minH) bad.push('yükseklik ' + f1(H) + ' mm (en az ' + f1(minH) + ')');
      if (bad.length) issue({ sev: 'warn', cat: 'Ölçü', title: 'Girilen iskelet ölçüsü uygulanamadı', desc: name(q) + ': ' + bad.join(', ') + '. Bu profille daha küçük olamaz; çizimde otomatik büyütüldü, girilen ölçü ile model tutarsız.', fix: 'Ölçüyü büyüt ya da daha ince profil seç.', parts: [q.id], box: M(q).box });
      if (p.fr === 'table' && Number(p.fs) > 0) {
        const fs = Number(p.fs), rh = pr.w;
        if (!(fs > rh / 2 && fs < (H || 0) - 1.5 * rh)) issue({ sev: 'warn', cat: 'Ölçü', title: 'Alt kuşak yüksekliği geçersiz', desc: name(q) + ': alt kuşak ' + f1(fs) + ' mm yükseklikte istenmiş ama iskeletin içine sığmıyor; alt kuşak çizilmedi.', fix: 'Alt kuşak yüksekliğini ' + f1(rh / 2) + ' ile ' + f1((H || 0) - 1.5 * rh) + ' mm arasında ver.', parts: [q.id], box: M(q).box });
      }
      if (p.fj === 'miter' && !miterOK(p)) issue({ sev: 'tip', cat: 'Profil', title: 'Gönye seçili ama uygulanamıyor', desc: name(q) + ': gönye (45°) yalnızca kare / yuvarlak profille, pano ve kutu çerçevede yapılır; alın (90°) birleşim kullanıldı.', fix: 'Kare profil seç ya da alın birleşimi kabul et.', parts: [q.id], box: M(q).box });
      const ms = frameWorldMembers(p);
      for (const m of ms) {
        const L = m.len + (m.miter ? m.w : 0);
        const box = { min: [0, 1, 2].map((k) => Math.min(m.a[k], m.b[k]) - m.w / 2), max: [0, 1, 2].map((k) => Math.max(m.a[k], m.b[k]) + m.w / 2) };
        if (L > stock + 1e-6) issue({ sev: 'warn', cat: 'Profil', title: 'Eleman stok boyundan uzun', desc: name(q) + ' · ' + m.role + ': ' + f1(L) + ' mm, stok boyu ' + f1(stock) + ' mm. Tek parçadan kesilemez, ek kaynak gerekir.', fix: 'Ek yeri planla (destek altına) ya da daha uzun stok boy tedarik et. Kesim optimizasyonu bu parçayı hata olarak gösterir.', parts: [q.id], box });
        else if (L < 1.5 * Math.max(m.w, m.h)) issue({ sev: 'warn', cat: 'Profil', title: 'Çok kısa profil elemanı', desc: name(q) + ' · ' + m.role + ': ' + f1(L) + ' mm, profil kesitine (' + f1(m.w) + ' mm) göre çok kısa. Testerede tutulması ve kaynakta çarpılmadan tutturulması zor.', fix: 'Ölçüleri gözden geçir; gerekirse bu elemanı plaka ile değiştir.', parts: [q.id], box });
      }
    }
    if (q.type === 'sheet' && Array.isArray(p.seg)) {
      profileChecks++;
      p.seg.forEach((sg, i) => { if (!(Number(sg.L) > 0)) issue({ sev: 'crit', cat: 'Ölçü', title: 'Sac kenarı ölçüsü geçersiz', desc: name(q) + ': ' + (i + 1) + '. kenar ' + (sg.L ?? 'boş') + '.', fix: 'Tür sekmesinden kenar ölçüsünü gir.', parts: [q.id], box: M(q).box }); });
    }
    for (const w of q.warnings || []) issue({ sev: 'warn', cat: 'Profil', title: 'Büküm / profil uyarısı', desc: name(q) + ': ' + w, fix: 'Dayanım sekmesindeki önerilere bak.', parts: [q.id], box: M(q).box });
  }
  if (model.mateErr > 1e-2) issue({ sev: 'crit', cat: 'Montaj', title: 'Montaj ilişkileri çelişiyor', desc: 'Eşleşmeler (Montaj sekmesi) aynı anda sağlanamıyor; parçalar istenen konumda değil (sapma ~' + f1(model.mateErr) + ').', fix: 'Montaj sekmesinde çelişen eşleşmeyi sil ya da düzelt.', parts: [...new Set((model.mates || []).flat().filter((x) => typeof x === 'number'))], box: null });
  const profKinds = new Set(all.filter((q) => q.type === 'frame').map((q) => (PROFILES[q.p.pf] || {}).name));
  if (profKinds.size > 3) issue({ sev: 'tip', cat: 'Profil', title: 'Çok çeşit profil', desc: profKinds.size + ' farklı profil kullanılmış: ' + [...profKinds].join(', ') + '.', fix: 'Profil çeşidini azaltmak stok, kesim ve fireyi azaltır.', parts: all.filter((q) => q.type === 'frame').map((q) => q.id), box: null });
  coverage.push({ name: 'Ölçü ve profil kontrolü', status: 'ok', detail: all.length + ' parçanın ölçüleri' + (profileChecks ? ', ' + profileChecks + ' iskelet / sac parçasının profil verisi' : '') + ' kontrol edildi.' });
  await tick();

  /* 3) parça çiftleri: çakışma, temas, boşluk */
  const pairs = [];
  for (let i = 0; i < usable.length; i++) for (let j = i + 1; j < usable.length; j++) pairs.push([usable[i], usable[j]]);
  const contacts = [], overlaps = [];
  let merged = 0;
  const mergedPairs = [];
  for (let k = 0; k < pairs.length; k++) {
    const [a, b] = pairs[k], A = M(a), B = M(b);
    if (k % 3 === 0) { prog(0.1 + 0.45 * k / Math.max(pairs.length, 1), 'Çakışma kontrolü: ' + (k + 1) + ' / ' + pairs.length + ' parça çifti'); await tick(); }
    if (boxGap(A.box, B.box) > GAP_MAX && !linked(a, b)) continue;
    const it = interference(A, B, cutMeshes);
    if (it.depth > DEPTH_MIN) {
      overlaps.push([a, b]);
      if (separate(a, b)) {
        issue({ sev: 'crit', cat: 'Çakışma', title: 'Parçalar iç içe geçiyor', desc: name(a) + ' ile ' + name(b) + ' çakışıyor: çakışma bölgesi ~' + f1(it.span) + ' mm' + (it.span - it.depth > 0.5 ? ' (malzemeye ~' + f1(it.depth) + ' mm giriyor; içi boş profil)' : '') + ', ortak malzeme hacmi ~' + f1(it.vol / 1000) + ' cm³. Bu haliyle üretilen parçalar yerine oturmaz.', fix: 'Parçalardan birini en az ~' + f1(it.span) + ' mm kaydır, boyunu kısalt ya da oyuk / kesim aç.', parts: [a.id, b.id], box: it.region, depth: it.depth, span: it.span });
      } else { merged++; mergedPairs.push([a, b]); }
      continue;
    }
    const md = minDistance(A, B, GAP_MAX + 1);
    if (md.d <= TOL) contacts.push({ a, b, p: md.p });
    else if (md.d <= GAP_MAX) {
      const box = md.p ? { min: sub(md.p, [3, 3, 3]), max: add(md.p, [3, 3, 3]) } : boxOverlap(A.box, B.box);
      issue({ sev: linked(a, b) ? 'warn' : 'warn', cat: 'Boşluk', title: 'Parçalar arasında küçük boşluk', desc: name(a) + ' ile ' + name(b) + ' arasında ' + f1(md.d) + ' mm boşluk var. ' + (linked(a, b) ? 'Bu parçalar birbirine bağlı (eşleşme var), temas etmeleri beklenir.' : 'Birbirine değmesi gereken parçalarsa kaynak / cıvata bağlantısı olmaz; yanlış konumlandırılmış olabilir.'), fix: 'Konumu ' + f1(md.d) + ' mm düzelt (Konum sekmesi) ya da yüzey eşleşmesi (Montaj) kullan.', parts: [a.id, b.id], box, gap: md.d });
    } else if (linked(a, b) && (model.mates || []).some(([x, y, t]) => t === 'coinc' && ((x === a.id && y === b.id) || (x === b.id && y === a.id)))) {
      issue({ sev: 'warn', cat: 'Boşluk', title: 'Eşleşen parçalar birbirine değmiyor', desc: name(a) + ' ile ' + name(b) + ' arasında çakışık yüzey eşleşmesi var ama parçalar ' + (md.d > GAP_MAX ? GAP_MAX + ' mm’den' : '') + ' uzakta.', fix: 'Eşleşmeyi kontrol et (yanlış yüz seçilmiş olabilir).', parts: [a.id, b.id], box: null });
    }
  }
  if (merged) issue({ sev: 'tip', cat: 'Çakışma', title: 'İç içe parçalar tek gövde sayıldı', desc: merged + ' çift basit parça (kutu, silindir, kroki...) iç içe: ' + mergedPairs.slice(0, 4).map(([a, b]) => name(a) + ' + ' + name(b)).join(', ') + (merged > 4 ? '…' : '') + '. Uygulamada bunlar birleşip tek parça oluşturur, çakışma sayılmadı.', fix: 'Bunlar ayrı ayrı üretilecek parçalarsa analiz modunu "Her parça ayrı" yap ve yeniden analiz et.', parts: [...new Set(mergedPairs.flat().map((q) => q.id))], box: null });
  coverage.push({ name: 'Geometrik çakışma kontrolü', status: open.length ? 'partial' : 'ok', detail: usable.length + ' parça, ' + pairs.length + ' çift karşılaştırıldı (ortak hacim örneklemesi, temas toleransı ' + TOL + ' mm, en az ' + DEPTH_MIN + ' mm batma).' });
  coverage.push({ name: 'Boşluk / temas kontrolü', status: 'ok', detail: contacts.length + ' temas noktası bulundu; 0,05–' + GAP_MAX + ' mm arası boşluklar uyarıldı.' });

  /* 4) oyuklar: boşta mı, delikse cıvata alanı ve kenar mesafesi */
  prog(0.58, 'Delikler ve bağlantı elemanı alanları kontrol ediliyor');
  await tick();
  let holeN = 0;
  for (const c of cutters) {
    const C = M(c);
    const hosts = solids.filter((q) => boxGap(M(q).box, C.box) === 0 && C.vertices(400).concat(sampleInside(C, 300)).some((v) => M(q).contains(v)));
    if (!hosts.length) { issue({ sev: 'warn', cat: 'Delik', title: 'Oyuk hiçbir parçayı kesmiyor', desc: name(c) + ' (oyuk) hiçbir katı parçaya değmiyor; delik / kesim modelde yok.', fix: 'Oyuğu kesmesi gereken parçanın içine taşı ya da sil.', parts: [c.id], box: C.box }); continue; }
    if (c.type !== 'cylinder' || !(+c.p.d > 0)) continue;
    holeN++;
    const H = holeAxis(c.p), d = 2 * H.r;
    // eksen boyunca giriş / çıkış: deliğin geçtiği katı bölge
    const ts = [];
    for (let s = -0.02 * H.h; s <= 1.02 * H.h; s += Math.max(H.h / 200, 0.2)) { const pt = add(H.base, mul(H.axis, s)); const ringIn = [0, 1, 2, 3].some((k) => { const q = ringPt(H, s, H.r * 1.05, k * Math.PI / 2); return hosts.some((h) => M(h).contains(q)); }); if (ringIn) ts.push(s); }
    if (!ts.length) continue;
    const s0 = Math.min(...ts), s1 = Math.max(...ts), axisLoc = add(H.base, mul(H.axis, (s0 + s1) / 2));
    // standart matkap
    const near = DRILLS.reduce((b, x) => (Math.abs(x - d) < Math.abs(b - d) ? x : b), DRILLS[0]);
    if (Math.abs(near - d) > 0.05) issue({ sev: 'tip', cat: 'Delik', title: 'Standart dışı delik çapı', desc: name(c) + ': Ø' + f1(d) + ' mm. En yakın standart matkap Ø' + f1(near) + ' mm.', fix: 'Delik çapını Ø' + f1(near) + ' yap (cıvata boşluk deliği için ör. M8 → Ø9, M10 → Ø11).', parts: [c.id], box: C.box });
    // kenar mesafesi: delik merkezinden 1,2·d uzaklıkta çevre malzeme içinde olmalı
    const e = 1.2 * d, mid = (s0 + s1) / 2;
    let outN = 0;
    for (let k = 0; k < 16; k++) { const q = ringPt(H, mid, e, k * Math.PI / 8); if (!hosts.some((h) => M(h).contains(q))) outN++; }
    if (outN) issue({ sev: outN > 4 ? 'warn' : 'tip', cat: 'Delik', title: 'Delik kenara çok yakın', desc: name(c) + ' (Ø' + f1(d) + '): delik merkezinden ' + f1(e) + ' mm (1,2·d) çevrede malzeme bitiyor. Kenar yırtılabilir, cıvata pulu oturmaz.', fix: 'Deliği kenardan en az ' + f1(e) + ' mm içeri al ya da parçayı genişlet.', parts: [c.id, ...hosts.map((h) => h.id)], box: { min: sub(axisLoc, [e, e, e]), max: add(axisLoc, [e, e, e]) } });
    // cıvata başı / somun: iki uçta, eksen boyunca 1,2·d yükseklikte, 0,9·d yarıçaplı silindir boş olmalı (anahtar / lokma alanı)
    for (const [s, sg, what] of [[s0, -1, 'cıvata başı'], [s1, 1, 'somun / anahtar']]) {
      let blocked = null;
      for (let hgt = 0.15 * d; hgt <= 1.2 * d && !blocked; hgt += 0.35 * d) for (const rr of [0, 0.5 * d, 0.9 * d]) for (let k = 0; k < (rr ? 8 : 1) && !blocked; k++) {
        const q = ringPt(H, s + sg * hgt, rr, k * Math.PI / 4);
        blocked = solids.find((h) => boxGap(M(h).box, { min: q, max: q }) === 0 && M(h).contains(q)) || null;
      }
      if (blocked) {
        const at = add(H.base, mul(H.axis, s + sg * 0.6 * d));
        issue({ sev: 'warn', cat: 'Montaj', title: 'Bağlantı elemanı için yer yok', desc: name(c) + ' (Ø' + f1(d) + ') deliğinin ' + (sg < 0 ? 'giriş' : 'çıkış') + ' tarafında ' + what + ' için gereken alan (Ø' + f1(1.8 * d) + ' × ' + f1(1.2 * d) + ' mm) ' + name(blocked) + ' tarafından kapatılıyor.', fix: 'Deliği kaydır, engel olan parçada boşluk aç ya da bu taraf için kör delik / dişli delik (kılavuz) kullan.', parts: [c.id, blocked.id], box: { min: sub(at, [d, d, d]), max: add(at, [d, d, d]) } });
      }
    }
  }
  coverage.push({ name: 'Delik ve bağlantı elemanı alanı', status: 'ok', detail: cutters.length ? cutters.length + ' oyuk, ' + holeN + ' silindir delik incelendi (kenar mesafesi 1,2·d, cıvata başı / somun alanı, standart matkap).' : 'Modelde oyuk / delik yok.' });

  /* 5) montaj: sökme sırası simülasyonu (6 ana eksen) */
  prog(0.65, 'Montaj sırası simüle ediliyor');
  await tick();
  // birimler: kaynaklı (iki kaynaklanabilir metal parça temas) ya da tek gövde sayılan parçalar birlikte hareket eder
  const parent = new Map(usable.map((q) => [q.id, q.id]));
  const find = (x) => { while (parent.get(x) !== x) x = parent.get(x); return x; };
  const unite = (a, b) => parent.set(find(a), find(b));
  for (const c of contacts) if (WELDABLE.has(c.a.type) && WELDABLE.has(c.b.type) && isMetal(c.a) && isMetal(c.b)) unite(c.a.id, c.b.id);
  for (const [a, b] of mergedPairs) unite(a.id, b.id);
  const unitMap = new Map();
  for (const q of usable) { const r = find(q.id); if (!unitMap.has(r)) unitMap.set(r, []); unitMap.get(r).push(q); }
  const units = [...unitMap.values()];
  let asmNote = '';
  if (units.length >= 2 && units.length <= 60) {
    const res = disassembly(units, (u) => u.map(M));
    if (res.stuck.length) {
      const names = res.stuck.map((u) => u.map(name).join('+'));
      const box = res.stuck.flat().map((q) => M(q).box).reduce((s, b) => ({ min: s.min.map((v, k) => Math.min(v, b.min[k])), max: s.max.map((v, k) => Math.max(v, b.max[k])) }));
      issue({ sev: 'warn', cat: 'Montaj', title: 'Montaj sırası bulunamadı', desc: names.join(', ') + ' parçaları altı ana yönün (±X, ±Y, ±Z) hiçbirinde birbirine çarpmadan takılamıyor / sökülemiyor. Döndürerek takma ve esneme denenmedi; kesin hata değil, kontrol et.', fix: 'Bu parçalardan birini cıvatalı ya da sonradan kaynaklı yap, veya takma yönünde açıklık bırak.', parts: res.stuck.flat().map((q) => q.id), box });
    }
    const seq = res.order.slice().reverse().map(([u, ai]) => u.map(name).join('+') + (ai >= 0 ? ' (' + AXIS_NAME[ai ^ 1] + ' yönünde takılır)' : ' (taban)'));
    if (!res.stuck.length) issue({ sev: 'tip', cat: 'Montaj', title: 'Önerilen montaj sırası', desc: seq.slice(0, 12).join(' → ') + (seq.length > 12 ? ' …' : ''), fix: 'Kaynaklı birleşimler ve tek gövde parçalar birlikte sayıldı.', parts: [], box: null });
    asmNote = units.length + ' montaj birimi (kaynaklı / birleşik gruplar birlikte), 6 eksende sökme simülasyonu yapıldı. Döndürerek takma denenmedi.';
    coverage.push({ name: 'Montaj uygunluğu', status: 'ok', detail: asmNote });
  } else coverage.push({ name: 'Montaj uygunluğu', status: units.length > 60 ? 'skip' : 'ok', detail: units.length > 60 ? 'Çok fazla ayrı birim (' + units.length + '); montaj simülasyonu yapılmadı.' : 'Tek montaj birimi: sökme simülasyonu gerekmiyor.' });

  // havada duran parçalar (hiçbir şeye değmeyen gruplar)
  if (usable.length >= 2) {
    const g2 = new Map(usable.map((q) => [q.id, q.id]));
    const f2 = (x) => { while (g2.get(x) !== x) x = g2.get(x); return x; };
    for (const c of contacts) g2.set(f2(c.a.id), f2(c.b.id));
    for (const [a, b] of overlaps) g2.set(f2(a.id), f2(b.id));
    const comp = new Map();
    for (const q of usable) { const r = f2(q.id); if (!comp.has(r)) comp.set(r, []); comp.get(r).push(q); }
    const comps = [...comp.values()].sort((a, b) => b.reduce((s, q) => s + M(q).volume(), 0) - a.reduce((s, q) => s + M(q).volume(), 0));
    for (const cg of comps.slice(1)) {
      const box = cg.map((q) => M(q).box).reduce((s, b) => ({ min: s.min.map((v, k) => Math.min(v, b.min[k])), max: s.max.map((v, k) => Math.max(v, b.max[k])) }));
      issue({ sev: 'warn', cat: 'Montaj', title: 'Ana gövdeye değmeyen parça', desc: cg.map(name).join(', ') + ' başka hiçbir parçaya temas etmiyor (havada duruyor). Kaynak ya da cıvata ile bağlanamaz.', fix: 'Parçayı bağlanacağı yüzeye taşı ya da bağlantı parçası (lama, braket) ekle.', parts: cg.map((q) => q.id), box });
    }
  }
  await tick();

  /* 6) kaynak erişimi (yalnızca uyarı) */
  prog(0.75, 'Kaynak erişimi kontrol ediliyor');
  const sceneMeshes = usable.map(M);
  let jointN = 0, hardN = 0;
  const frames = usable.filter((q) => q.type === 'frame');
  for (const q of frames) {
    const ms = frameWorldMembers(q.p), joints = frameJoints(ms);
    for (let ji = 0; ji < joints.length; ji++) {
      const J = joints[ji], m = ms[J.member];
      jointN++;
      if (ji % 4 === 0) { prog(0.75 + 0.2 * ji / joints.length, 'Kaynak erişimi: ' + name(q) + ' · ' + (ji + 1) + ' / ' + joints.length + ' bağlantı'); await tick(); }
      // dört yan yüzde, uçtan 3 mm geride, yüzeyden 3 mm dışarıda torç noktası
      const sides = m.kind === 'round' ? [m.u, mul(m.u, -1), m.v, mul(m.v, -1)].map((n) => [n, m.w / 2]) : [[m.u, m.w / 2], [mul(m.u, -1), m.w / 2], [m.v, m.h / 2], [mul(m.v, -1), m.h / 2]];
      const acc = sides.map(([n, half]) => torchAccess(add(add(J.at, mul(J.inward, 3)), mul(n, half + 3)), n, sceneMeshes));
      const okSides = acc.filter((x) => x >= 0.12).length, best = Math.max(...acc);
      if (okSides <= 1) {
        hardN++;
        const at = J.at, R = Math.max(m.w, m.h);
        issue({ sev: 'warn', cat: 'Kaynak', title: okSides ? 'Kaynak erişimi kısıtlı' : 'Kaynak erişimi çok zor', desc: name(q) + ' · ' + m.role + ' ucu: bağlantının 4 kenarından ' + (okSides ? 'yalnızca 1' : 'hiçbirine') + ' torçla rahat ulaşılamıyor (açık yön oranı en iyi kenarda %' + Math.round(best * 100) + '). Etraftaki parçalar torcun yaklaşmasını engelliyor.', fix: okSides ? 'Kaynak sırasını planla: bu bağlantıyı çevresindeki parçalar takılmadan önce kaynakla.' : 'Bu bağlantıyı alt montaj olarak önce kaynakla ya da cıvatalı bağlantıya çevir.', parts: [q.id], box: { min: sub(at, [R, R, R]), max: add(at, [R, R, R]) } });
      }
    }
  }
  // ayrı parçalar arasındaki kaynak temasları (kaynaklanabilir metal çiftleri)
  const weldContacts = contacts.filter((c) => WELDABLE.has(c.a.type) && WELDABLE.has(c.b.type) && c.p);
  for (const c of weldContacts) {
    jointN++;
    const dirs = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
    let best = 0;
    for (const n of dirs) { const q = add(c.p, mul(n, 3)); if (sceneMeshes.some((m) => m.contains(q))) continue; best = Math.max(best, torchAccess(q, n, sceneMeshes)); }
    if (best < 0.12) { hardN++; issue({ sev: 'warn', cat: 'Kaynak', title: 'Kaynak erişimi zor', desc: name(c.a) + ' ile ' + name(c.b) + ' birleşim noktasına torç rahat yaklaşamıyor (açık yön oranı %' + Math.round(best * 100) + ').', fix: 'Bu birleşimi diğer parçalar takılmadan önce kaynakla ya da cıvatalı yap.', parts: [c.a.id, c.b.id], box: { min: sub(c.p, [15, 15, 15]), max: add(c.p, [15, 15, 15]) } }); }
    if (isMetal(c.a) && isMetal(c.b) && c.a.material.id !== c.b.material.id) {
      const steel = (m) => /celik|paslanmaz/.test(m.id), alu = (m) => /alum|al60/.test(m.id);
      if ((steel(c.a.material) && alu(c.b.material)) || (alu(c.a.material) && steel(c.b.material))) issue({ sev: 'crit', cat: 'Profil', title: 'Çelik ile alüminyum kaynaklanamaz', desc: name(c.a) + ' (' + c.a.material.name + ') ile ' + name(c.b) + ' (' + c.b.material.name + ') birbirine değiyor; bu iki malzeme normal yöntemlerle kaynaklanmaz ve temas korozyon yapar.', fix: 'Cıvatalı bağlantı ve araya yalıtım pulu kullan ya da malzemeyi eşitle.', parts: [c.a.id, c.b.id], box: { min: sub(c.p, [15, 15, 15]), max: add(c.p, [15, 15, 15]) } });
    }
  }
  coverage.push({ name: 'Kaynak erişimi', status: 'ok', detail: jointN ? jointN + ' kaynak bağlantısı incelendi (Ø12 mm meme, 150 mm torç boyu, 40 yön); ' + hardN + ' tanesinde erişim zor.' : 'Kaynaklı bağlantı bulunamadı (iskelet ya da birbirine değen profil / sac yok).' });
  coverage.push({ name: 'Yapısal dayanım', status: 'skip', detail: 'Bu analizin kapsamında değil. Geometrik kontrol tasarımın güvenli olduğunu göstermez; Dayanım sekmesini kullan ve önemli yük taşıyan yapılarda mühendise onaylat.' });
  if (model.hiddenCount) coverage.push({ name: 'Gizli parçalar', status: 'skip', detail: model.hiddenCount + ' gizli parça analize dahil edilmedi.' });

  prog(1, 'Bitti');
  const rank = { crit: 0, warn: 1, tip: 2 };
  issues.sort((a, b) => rank[a.sev] - rank[b.sev]);
  const byId = new Map(all.map((q) => [q.id, name(q)]));
  for (const x of issues) x.partNames = (x.parts || []).map((id) => byId.get(id)).filter(Boolean);
  return { issues, coverage, partCount: all.length, solidCount: solids.length, summary: summaryText(issues, all.length) };
}
// kesim yüzeyinden rastgele değil, düzenli iç noktalar (oyuğun içinde mi testi için)
function sampleInside(C, n) {
  const out = [], b = C.box, k = Math.max(2, Math.round(Math.cbrt(n)));
  for (let i = 0; i < k; i++) for (let j = 0; j < k; j++) for (let l = 0; l < k; l++) {
    const p = [b.min[0] + (i + 0.5) / k * (b.max[0] - b.min[0]), b.min[1] + (j + 0.5) / k * (b.max[1] - b.min[1]), b.min[2] + (l + 0.5) / k * (b.max[2] - b.min[2])];
    if (C.contains(p)) out.push(p);
  }
  return out;
}
function ringPt(H, s, r, ang) {
  const a = norm(Math.abs(H.axis[0]) < 0.9 ? cross(H.axis, [1, 0, 0]) : cross(H.axis, [0, 1, 0])), b = cross(H.axis, a);
  return add(add(H.base, mul(H.axis, s)), add(mul(a, r * Math.cos(ang)), mul(b, r * Math.sin(ang))));
}
export function summaryText(issues, n) {
  const c = (sev, cat) => issues.filter((x) => x.sev === sev && (!cat || x.cat === cat)).length;
  const crit = c('crit'), warn = c('warn'), tip = c('tip');
  const clash = c('crit', 'Çakışma'), weld = issues.filter((x) => x.cat === 'Kaynak').length, gap = issues.filter((x) => x.cat === 'Boşluk').length;
  const asm = issues.filter((x) => x.cat === 'Montaj' && x.sev !== 'tip').length;
  const parts = [];
  if (clash) parts.push(clash + ' bölgede geometrik çakışma tespit ettim');
  if (crit - clash) parts.push((crit - clash) + ' kritik ölçü / montaj problemi buldum');
  if (gap) parts.push(gap + ' yerde parçalar arasında küçük boşluk var');
  if (weld) parts.push(weld + ' bağlantı noktasında kaynak erişimi zor olabilir');
  if (asm) parts.push(asm + ' montaj uyarısı var');
  let s = 'Modelini inceledim (' + n + ' parça). ';
  if (!parts.length) s += warn ? warn + ' üretim uyarısı dışında belirgin bir geometrik problem bulmadım.' : 'Kontrol edilen alanlarda geometrik problem bulmadım.';
  else s += parts.join('. ').replace(/^./, (x) => x.toUpperCase()) + '. ' + (crit ? 'Üretime başlamadan önce bu bölgeleri kontrol etmeni öneriyorum.' : 'Üretimden önce bu noktalara bir göz atmanı öneriyorum.');
  if (!crit && !warn && tip) s += ' ' + tip + ' iyileştirme önerim var.';
  return s;
}
