// Ayakkabı Modelhanesi — düğüm yolu geometrisi. Saf modül (DOM yok), birim mm, y aşağı.
// Düğüm yolu (np): { id, closed, nodes: [ { id, p:[x,y], i:[dx,dy]|null, o:[dx,dy]|null, brk } ] }
//   i / o: düğümün giriş / çıkış Bezier tutamacı (düğüme göre bağıl). İkisi de yoksa köşe noktası.
//   k. segment: nodes[k] → nodes[k+1] (kapalıysa son → ilk). Uçlardan birinde tutamaç varsa kübik Bezier, yoksa doğru.
//   brk: parça çevresinde "kenar başı" (dikiş / binme / katlama kenarları bu düğümlerde ayrılır).
// Eğri hesapları (uzunluk, bölme, en yakın nokta) tekstilin test edilmiş tx/curve.js modülünden gelir.
import * as C from '../tx/curve.js?v=20261112u';

export { C };
let seq = 0;
export const uid = (pre = 'n') => pre + Date.now().toString(36).slice(-5) + (seq++).toString(36) + Math.random().toString(36).slice(2, 5);
const r4 = (v) => Math.round(v * 1e4) / 1e4;
export const rp = (p) => [r4(p[0]), r4(p[1])];
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
export const isP = (p) => Array.isArray(p) && p.length === 2 && isNum(p[0]) && isNum(p[1]);

export function node(p, o = {}) { return { id: o.id || uid('n'), p: rp(p), i: o.i ? rp(o.i) : null, o: o.o ? rp(o.o) : null, brk: !!o.brk }; }
export function makePath(pts, closed = false, o = {}) { return { id: o.id || uid('p'), closed, nodes: pts.map((q) => (Array.isArray(q) ? node(q) : node(q.p, q))) }; }
export const clone = (o) => JSON.parse(JSON.stringify(o));
// derin kopya + yeni kimlikler (eski → yeni eşlemesiyle)
export function cloneNew(np, map = {}) { const c = clone(np); c.id = uid('p'); for (const n of c.nodes) { const id = uid('n'); map[n.id] = id; n.id = id; } return c; }

/* ---------- segment / eğri ---------- */
export const segCount = (np) => (np.nodes.length < 2 ? 0 : np.closed ? np.nodes.length : np.nodes.length - 1);
export function seg(np, k) {
  const n = np.nodes.length, a = np.nodes[k], b = np.nodes[(k + 1) % n];
  if (!a.o && !b.i) return C.line(a.p, b.p);
  return C.cubic(a.p, a.o ? C.add(a.p, a.o) : a.p, b.i ? C.add(b.p, b.i) : b.p, b.p);
}
export function toCurve(np) { const segs = []; for (let k = 0; k < segCount(np); k++) segs.push(seg(np, k)); return { closed: np.closed && np.nodes.length > 2, segs }; }
export const length = (np) => C.pathLength(toCurve(np));
export const flatten = (np, tol = 0.05) => { const f = C.flatten(toCurve(np), tol); if (np.closed && f.length > 1 && C.dist(f[0], f.at(-1)) < 1e-9) f.pop(); return f; };
export function bbox(np) { if (!np.nodes.length) return null; if (np.nodes.length === 1) { const p = np.nodes[0].p; return { x0: p[0], y0: p[1], x1: p[0], y1: p[1] }; } return C.bbox(toCurve(np)); }
export function unionBox(boxes) {
  const b = boxes.filter(Boolean); if (!b.length) return null;
  return { x0: Math.min(...b.map((q) => q.x0)), y0: Math.min(...b.map((q) => q.y0)), x1: Math.max(...b.map((q) => q.x1)), y1: Math.max(...b.map((q) => q.y1)) };
}

/* ---------- kenarlar (kapalı parça çevresi) ---------- */
// Kenar: kenar başı (brk) düğümünden sonraki kenar başına kadar. Hiç brk yoksa tüm çevre tek kenar (0. düğümden).
export function edgeStarts(np) { const s = np.nodes.map((n, i) => (n.brk ? i : -1)).filter((i) => i >= 0); return s.length ? s : [0]; }
export function edges(np) {
  const n = np.nodes.length, st = edgeStarts(np), out = [];
  if (!np.closed || n < 3) return out;
  for (let j = 0; j < st.length; j++) {
    const i0 = st[j], i1 = st[(j + 1) % st.length];
    const segs = []; let k = i0;
    do { segs.push(seg(np, k)); k = (k + 1) % n; } while (k !== i1);
    out.push({ id: np.nodes[i0].id, from: i0, to: i1, segs, path: { closed: false, segs } });
  }
  return out;
}
export const edgeLength = (e) => C.pathLength(e.path);
// kenar üzerinde baştan "at" mm uzaklıktaki nokta ve birim teğet
export function pointOnEdge(e, at) {
  const L = edgeLength(e), a = Math.max(0, Math.min(L, at));
  let acc = 0;
  for (const s of e.segs) {
    const l = C.segLength(s);
    if (acc + l >= a - 1e-12 || s === e.segs.at(-1)) {
      const t = l < 1e-12 ? 0 : C.tAtLength(s, a - acc), d = C.deriv(s, t), m = Math.hypot(d[0], d[1]) || 1;
      return { p: C.point(s, t), tan: [d[0] / m, d[1] / m] };
    }
    acc += l;
  }
  return { p: e.segs[0].a, tan: [1, 0] };
}
// noktayı en yakın kenara yerleştir → { edge(id), at, d, p }
export function locateOnEdges(np, p) {
  let best = null;
  for (const e of edges(np)) {
    let acc = 0;
    for (const s of e.segs) {
      const r = C.nearest({ segs: [s] }, p);
      if (r && (!best || r.d < best.d)) best = { edge: e.id, at: acc + C.segLength(s, 0, r.t), d: r.d, p: r.p };
      acc += C.segLength(s);
    }
  }
  return best;
}

/* ---------- isabet testi ---------- */
export function nearestNode(np, p) { let best = null; np.nodes.forEach((n, i) => { const d = C.dist(n.p, p); if (!best || d < best.d) best = { idx: i, d }; }); return best; }
export function nearestSeg(np, p) {
  let best = null;
  for (let k = 0; k < segCount(np); k++) { const r = C.nearest({ segs: [seg(np, k)] }, p); if (r && (!best || r.d < best.d)) best = { k, t: r.t, d: r.d, p: r.p }; }
  return best;
}

/* ---------- düzenleme (yerinde değiştirir, düğüm kimliklerini korur) ---------- */
// k. segmenti t'de böl: şekil değişmez (de Casteljau), yeni düğüm döner
export function insertNode(np, k, t) {
  const n = np.nodes.length, a = np.nodes[k], b = np.nodes[(k + 1) % n], s = seg(np, k);
  const [L, R] = C.splitSeg(s, t);
  const m = node(L.b);
  if (s.t === 'C') {
    a.o = rp(C.sub(L.c1, L.a)); m.i = rp(C.sub(L.c2, L.b)); m.o = rp(C.sub(R.c1, R.a)); b.i = rp(C.sub(R.c2, R.b));
    if (C.dist(a.o, [0, 0]) < 1e-9) a.o = null; if (C.dist(b.i, [0, 0]) < 1e-9) b.i = null;
  }
  np.nodes.splice(k + 1, 0, m);
  return m;
}
// düğümü sil (en az 2 / kapalıda 3 düğüm kalır)
export function removeNode(np, idx) {
  if (np.nodes.length <= (np.closed ? 3 : 2)) return false;
  np.nodes.splice(idx, 1); return true;
}
// düğümde böl: kapalı yol açılır (o düğümden başlar ve biter); açık yol iki yola ayrılır.
export function splitAtNode(np, idx) {
  const n = np.nodes.length;
  if (np.closed) {
    const nodes = [...np.nodes.slice(idx), ...np.nodes.slice(0, idx)];
    const end = node(nodes[0].p, { i: nodes[0].i }); nodes[0].i = null;
    return [{ id: np.id, closed: false, nodes: [...nodes, end] }];
  }
  if (idx <= 0 || idx >= n - 1) return [np];
  const A = np.nodes.slice(0, idx + 1), B = np.nodes.slice(idx).map((q) => ({ ...q }));
  B[0] = node(B[0].p, { o: B[0].o }); A[A.length - 1] = { ...A[A.length - 1], o: null };
  return [{ id: np.id, closed: false, nodes: A }, { id: uid('p'), closed: false, nodes: B }];
}
export function reverse(np) {
  // kenar başı kümesi yönden bağımsızdır (kenarlar ardışık kenar başları arasındadır); düğümlerde kalır
  return { ...np, nodes: [...np.nodes].reverse().map((q) => ({ ...q, i: q.o, o: q.i })) };
}
// iki açık yolu uç uca birleştir. endA/endB: 'start' | 'end'. Uçlar tol içindeyse tek düğüm olur, değilse doğruyla bağlanır.
export function joinPaths(A, endA, B, endB, tol = 0.01) {
  let a = endA === 'end' ? A : reverse(A), b = endB === 'start' ? B : reverse(B);
  a = clone(a); b = clone(b);
  const ea = a.nodes.at(-1), sb = b.nodes[0];
  let nodes;
  if (C.dist(ea.p, sb.p) <= tol) { ea.o = sb.o; nodes = [...a.nodes, ...b.nodes.slice(1)]; }
  else nodes = [...a.nodes, ...b.nodes];
  return { id: A.id, closed: false, nodes };
}
// açık yolu kapat (ilk ve son düğüm çakışıksa birleşir)
export function closePath(np, tol = 0.01) {
  if (np.closed || np.nodes.length < 3) return np.nodes.length >= 3;
  const f = np.nodes[0], l = np.nodes.at(-1);
  if (C.dist(f.p, l.p) <= tol && np.nodes.length > 3) { f.i = l.i; np.nodes.pop(); }
  np.closed = true; return true;
}
// düğüm tipi: köşe (tutamaç yok) / yumuşak (komşulardan otomatik teğet) / bezier (elle)
export function makeCorner(np, idx) { const q = np.nodes[idx]; q.i = null; q.o = null; }
export function autoSmooth(np, idx, k = 1 / 3) {
  const n = np.nodes.length, q = np.nodes[idx];
  const prev = idx > 0 ? np.nodes[idx - 1] : np.closed ? np.nodes[n - 1] : null;
  const next = idx < n - 1 ? np.nodes[idx + 1] : np.closed ? np.nodes[0] : null;
  if (!prev && !next) return;
  const a = prev ? prev.p : q.p, b = next ? next.p : q.p;
  const d = C.sub(b, a), L = Math.hypot(d[0], d[1]); if (L < 1e-9) return;
  const u = [d[0] / L, d[1] / L];
  const li = prev ? C.dist(prev.p, q.p) * k : 0, lo = next ? C.dist(q.p, next.p) * k : 0;
  q.i = prev ? rp(C.mul(u, -li)) : null; q.o = next ? rp(C.mul(u, lo)) : null;
}
// noktalardan geçen düzgün yol (Catmull-Rom → tutamaçlar)
export function smoothFromPoints(pts, closed = false) {
  const np = makePath(pts, closed);
  for (let i = 0; i < np.nodes.length; i++) autoSmooth(np, i);
  if (!closed && np.nodes.length) { np.nodes[0].i = null; np.nodes.at(-1).o = null; }
  return np;
}
// Ramer–Douglas–Peucker sadeleştirme (serbest çizim için)
export function simplify(pts, tol = 1) {
  if (pts.length < 3) return pts.slice();
  const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1;
  const st = [[0, pts.length - 1]];
  while (st.length) {
    const [i, j] = st.pop(); const a = pts[i], b = pts[j], d = C.sub(b, a), L = Math.hypot(d[0], d[1]) || 1e-12;
    let m = -1, md = tol;
    for (let k = i + 1; k < j; k++) { const e = Math.abs((pts[k][0] - a[0]) * d[1] - (pts[k][1] - a[1]) * d[0]) / L; if (e > md) { md = e; m = k; } }
    if (m > 0) { keep[m] = 1; st.push([i, m], [m, j]); }
  }
  return pts.filter((_, i) => keep[i]);
}
// afin dönüşüm: f nokta dönüşümü; tutamaçlar f(p+h) - f(p) ile taşınır (döndürme / ayna / öteleme için doğru)
export function transform(np, f) {
  for (const q of np.nodes) {
    const p2 = f(q.p);
    if (q.i) q.i = rp(C.sub(f(C.add(q.p, q.i)), p2));
    if (q.o) q.o = rp(C.sub(f(C.add(q.p, q.o)), p2));
    q.p = rp(p2);
  }
  return np;
}
export const moveFn = (dx, dy) => (p) => [p[0] + dx, p[1] + dy];
export const rotateFn = (c, deg) => { const a = deg * Math.PI / 180, cs = Math.cos(a), sn = Math.sin(a); return (p) => [c[0] + (p[0] - c[0]) * cs - (p[1] - c[1]) * sn, c[1] + (p[0] - c[0]) * sn + (p[1] - c[1]) * cs]; };
export const mirrorXFn = (x0) => (p) => [2 * x0 - p[0], p[1]];

/* ---------- çokgen ölçüleri ---------- */
export function signedArea(pts) { let A = 0; for (let i = 0, n = pts.length; i < n; i++) { const a = pts[i], b = pts[(i + 1) % n]; A += a[0] * b[1] - b[0] * a[1]; } return A / 2; }
export function insidePoly(pts, p) { let c = false; for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) { const a = pts[i], b = pts[j]; if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < (b[0] - a[0]) * (p[1] - a[1]) / (b[1] - a[1]) + a[0]) c = !c; } return c; }
export function perimeter(pts, closed = true) { let L = 0; for (let i = 0; i < pts.length - (closed ? 0 : 1); i++) L += C.dist(pts[i], pts[(i + 1) % pts.length]); return L; }
// açık çoklu çizgiyi d mm ötele (d > 0: yürüme yönünün sağına (y aşağı ekranda); işaret çağıran tarafından seçilir)
export function offsetOpen(pts, d) {
  const n = pts.length; if (n < 2) return pts.slice();
  const nrm = (a, b) => { const v = C.sub(b, a), L = Math.hypot(v[0], v[1]) || 1e-12; return [-v[1] / L, v[0] / L]; };
  const out = [];
  for (let i = 0; i < n; i++) {
    if (i === 0) { out.push(C.add(pts[0], C.mul(nrm(pts[0], pts[1]), d))); continue; }
    if (i === n - 1) { out.push(C.add(pts[i], C.mul(nrm(pts[i - 1], pts[i]), d))); continue; }
    const n1 = nrm(pts[i - 1], pts[i]), n2 = nrm(pts[i], pts[i + 1]), m = C.add(n1, n2), L = Math.hypot(m[0], m[1]);
    if (L < 1e-9) { out.push(C.add(pts[i], C.mul(n1, d))); continue; }
    const u = [m[0] / L, m[1] / L], c = u[0] * n1[0] + u[1] * n1[1];
    out.push(C.add(pts[i], C.mul(u, d / Math.max(0.3, c))));
  }
  return out;
}
// çoklu çizgiyi baştan / sondan kırp (mm)
export function trimPolyline(pts, a, b) {
  const L = perimeter(pts, false); if (a + b >= L - 1e-9) return [];
  const at = (s) => { let acc = 0; for (let i = 0; i < pts.length - 1; i++) { const l = C.dist(pts[i], pts[i + 1]); if (acc + l >= s) { const t = l ? (s - acc) / l : 0; return { i, p: [pts[i][0] + (pts[i + 1][0] - pts[i][0]) * t, pts[i][1] + (pts[i + 1][1] - pts[i][1]) * t] }; } acc += l; } return { i: pts.length - 2, p: pts.at(-1) }; };
  const s = at(a), e = at(L - b);
  return [s.p, ...pts.slice(s.i + 1, e.i + 1), e.p];
}
