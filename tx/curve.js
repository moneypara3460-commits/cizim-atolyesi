// Tekstil eğri geometrisi — saf modül (DOM yok). Birim mm.
// Yol (path): { closed, segs: [ { t:'L', a, b } | { t:'C', a, c1, c2, b } ] }  — her segment bir öncekinin bitişinden başlar.
// Kübik Bezier; uzunluk 16 noktalı Gauss–Legendre ile, uyarlamalı bölmeyle hesaplanır.

export const add = (p, q) => [p[0] + q[0], p[1] + q[1]];
export const sub = (p, q) => [p[0] - q[0], p[1] - q[1]];
export const mul = (p, k) => [p[0] * k, p[1] * k];
export const dist = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]);
const lerp = (p, q, t) => [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t];

/* ---------- tek segment ---------- */
export function point(s, t) {
  if (s.t === 'L') return lerp(s.a, s.b, t);
  const u = 1 - t, a = u * u * u, b = 3 * u * u * t, c = 3 * u * t * t, d = t * t * t;
  return [a * s.a[0] + b * s.c1[0] + c * s.c2[0] + d * s.b[0], a * s.a[1] + b * s.c1[1] + c * s.c2[1] + d * s.b[1]];
}
export function deriv(s, t) {
  if (s.t === 'L') return sub(s.b, s.a);
  const u = 1 - t;
  const d0 = sub(s.c1, s.a), d1 = sub(s.c2, s.c1), d2 = sub(s.b, s.c2);
  return [3 * (u * u * d0[0] + 2 * u * t * d1[0] + t * t * d2[0]), 3 * (u * u * d0[1] + 2 * u * t * d1[1] + t * t * d2[1])];
}
// Gauss–Legendre 16 nokta (düğüm, ağırlık), [-1,1]
const GX = [0.0950125098376374, 0.2816035507792589, 0.4580167776572274, 0.6178762444026438, 0.7554044083550030, 0.8656312023878318, 0.9445750230732326, 0.9894009349916499];
const GW = [0.1894506104550685, 0.1826034150449236, 0.1691565193950025, 0.1495959888165767, 0.1246289712555339, 0.0951585116824928, 0.0622535239386479, 0.0271524594117541];
function glen(s, t0, t1) {
  const h = (t1 - t0) / 2, m = (t1 + t0) / 2;
  let L = 0;
  for (let i = 0; i < 8; i++) for (const sg of [-1, 1]) { const d = deriv(s, m + sg * h * GX[i]); L += GW[i] * Math.hypot(d[0], d[1]); }
  return L * h;
}
// t0..t1 arası yay uzunluğu (uyarlamalı; tol mm)
export function segLength(s, t0 = 0, t1 = 1, tol = 1e-7) {
  if (s.t === 'L') return dist(s.a, s.b) * Math.abs(t1 - t0);
  const rec = (a, b, whole, depth) => {
    const m = (a + b) / 2, l = glen(s, a, m), r = glen(s, m, b);
    if (depth > 18 || Math.abs(l + r - whole) < tol) return l + r;
    return rec(a, m, l, depth + 1) + rec(m, b, r, depth + 1);
  };
  return rec(t0, t1, glen(s, t0, t1), 0);
}
// de Casteljau bölme
export function splitSeg(s, t) {
  if (s.t === 'L') { const m = lerp(s.a, s.b, t); return [{ t: 'L', a: s.a, b: m }, { t: 'L', a: m, b: s.b }]; }
  const p01 = lerp(s.a, s.c1, t), p12 = lerp(s.c1, s.c2, t), p23 = lerp(s.c2, s.b, t);
  const p012 = lerp(p01, p12, t), p123 = lerp(p12, p23, t), m = lerp(p012, p123, t);
  return [{ t: 'C', a: s.a, c1: p01, c2: p012, b: m }, { t: 'C', a: m, c1: p123, c2: p23, b: s.b }];
}
// uzunluğu L olan noktanın t'si (Newton + ikiye bölme)
export function tAtLength(s, L) {
  const tot = segLength(s);
  if (L <= 0) return 0; if (L >= tot) return 1;
  if (s.t === 'L') return L / tot;
  let lo = 0, hi = 1, t = L / tot;
  for (let i = 0; i < 50; i++) {
    const f = segLength(s, 0, t) - L;
    if (Math.abs(f) < 1e-9) break;
    if (f > 0) hi = t; else lo = t;
    const d = Math.hypot(...deriv(s, t));
    let tn = d > 1e-12 ? t - f / d : (lo + hi) / 2;
    if (!(tn > lo && tn < hi)) tn = (lo + hi) / 2;
    t = tn;
  }
  return t;
}
function segBBox(s) {
  const pts = s.t === 'L' ? [s.a, s.b] : [s.a, s.b];
  if (s.t === 'C') {
    // türevin kökleri (her eksen için ikinci derece)
    for (let k = 0; k < 2; k++) {
      const a = -s.a[k] + 3 * s.c1[k] - 3 * s.c2[k] + s.b[k], b = 2 * (s.a[k] - 2 * s.c1[k] + s.c2[k]), c = s.c1[k] - s.a[k];
      const roots = [];
      if (Math.abs(a) < 1e-12) { if (Math.abs(b) > 1e-12) roots.push(-c / b); }
      else { const D = b * b - 4 * a * c; if (D >= 0) { const q = Math.sqrt(D); roots.push((-b + q) / (2 * a), (-b - q) / (2 * a)); } }
      for (const t of roots) if (t > 0 && t < 1) pts.push(point(s, t));
    }
  }
  return pts;
}
// en yakın nokta: örnekleme + Newton
function segNearest(s, p) {
  if (s.t === 'L') {
    const d = sub(s.b, s.a), L2 = d[0] * d[0] + d[1] * d[1];
    const t = L2 < 1e-18 ? 0 : Math.max(0, Math.min(1, ((p[0] - s.a[0]) * d[0] + (p[1] - s.a[1]) * d[1]) / L2));
    const q = point(s, t); return { t, p: q, d: dist(p, q) };
  }
  let best = 0, bd = Infinity;
  for (let i = 0; i <= 32; i++) { const t = i / 32, d = dist(point(s, t), p); if (d < bd) { bd = d; best = t; } }
  let t = best;
  for (let i = 0; i < 12; i++) {
    const q = point(s, t), d1 = deriv(s, t), e = sub(q, p);
    const h = 1e-6, d2 = mul(sub(deriv(s, Math.min(1, t + h)), deriv(s, Math.max(0, t - h))), 1 / (Math.min(1, t + h) - Math.max(0, t - h)));
    const f = e[0] * d1[0] + e[1] * d1[1], fp = d1[0] * d1[0] + d1[1] * d1[1] + e[0] * d2[0] + e[1] * d2[1];
    if (Math.abs(fp) < 1e-12) break;
    const tn = Math.max(0, Math.min(1, t - f / fp)); if (Math.abs(tn - t) < 1e-12) { t = tn; break; } t = tn;
  }
  const q = point(s, t), d = dist(q, p);
  return d <= bd ? { t, p: q, d } : { t: best, p: point(s, best), d: bd };
}
// düzlemsel düzleştirme (çizim ve isabet testi için): sapma ≤ tol mm
function flattenSeg(s, tol, out) {
  if (s.t === 'L') { out.push(s.b); return; }
  const flat = (q) => { const d = sub(q.b, q.a), L = Math.hypot(d[0], d[1]) || 1e-12; const e = (c) => Math.abs((c[0] - q.a[0]) * d[1] - (c[1] - q.a[1]) * d[0]) / L; return Math.max(e(q.c1), e(q.c2)) <= tol; };
  const rec = (q, depth) => { if (depth > 16 || flat(q)) { out.push(q.b); return; } const [l, r] = splitSeg(q, 0.5); rec(l, depth + 1); rec(r, depth + 1); };
  rec(s, 0);
}

/* ---------- yol ---------- */
export const line = (a, b) => ({ t: 'L', a, b });
export const cubic = (a, c1, c2, b) => ({ t: 'C', a, c1, c2, b });
export function polyPath(pts, closed = false) {
  const segs = []; for (let i = 0; i < pts.length - 1; i++) segs.push(line(pts[i], pts[i + 1]));
  if (closed && pts.length > 2) segs.push(line(pts.at(-1), pts[0]));
  return { closed, segs };
}
// Catmull–Rom (merkezcil değil, tension 0,5 klasik) noktalarından geçen düzgün eğri → kübik Bezier dizisi.
// Uç noktalarda yansıtılmış hayali nokta kullanılır; kapalıysa döner.
export function smoothPath(pts, closed = false, tension = 0.5) {
  const n = pts.length;
  if (n < 2) return { closed: false, segs: [] };
  if (n === 2) return { closed: false, segs: [line(pts[0], pts[1])] };
  const P = (i) => closed ? pts[(i + n) % n] : i < 0 ? sub(mul(pts[0], 2), pts[1]) : i >= n ? sub(mul(pts[n - 1], 2), pts[n - 2]) : pts[i];
  const segs = [], k = tension / 3 * 2;   // tension 0,5 → 1/3 (klasik Catmull-Rom)
  const last = closed ? n : n - 1;
  for (let i = 0; i < last; i++) {
    const p0 = P(i - 1), p1 = P(i), p2 = P(i + 1), p3 = P(i + 2);
    segs.push(cubic(p1, add(p1, mul(sub(p2, p0), k / 2 * 1)), sub(p2, mul(sub(p3, p1), k / 2 * 1)), p2));
  }
  return { closed, segs };
}
export const pathLength = (path) => path.segs.reduce((a, s) => a + segLength(s), 0);
export function pathPoints(path) { if (!path.segs.length) return []; return [path.segs[0].a, ...path.segs.map((s) => s.b)]; }
export function flatten(path, tol = 0.05) {
  if (!path.segs.length) return [];
  const out = [path.segs[0].a];
  for (const s of path.segs) flattenSeg(s, tol, out);
  return out;
}
export function bbox(path) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const s of path.segs) for (const p of segBBox(s)) { x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]); x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]); }
  return { x0, y0, x1, y1 };
}
export function nearest(path, p) {
  let best = null;
  path.segs.forEach((s, i) => { const r = segNearest(s, p); if (!best || r.d < best.d) best = { ...r, seg: i }; });
  return best;
}
// yolu uzunluk oranına (0..1) göre noktaya böl: iki yol döner
export function splitAtLength(path, L) {
  let acc = 0;
  for (let i = 0; i < path.segs.length; i++) {
    const s = path.segs[i], l = segLength(s);
    if (acc + l >= L || i === path.segs.length - 1) {
      const [a, b] = splitSeg(s, tAtLength(s, L - acc));
      return [{ closed: false, segs: [...path.segs.slice(0, i), a] }, { closed: false, segs: [b, ...path.segs.slice(i + 1)] }];
    }
    acc += l;
  }
  return [path, { closed: false, segs: [] }];
}
// afin dönüşüm: f(p) → p'
export function mapPath(path, f) {
  return { closed: path.closed, segs: path.segs.map((s) => (s.t === 'L' ? { t: 'L', a: f(s.a), b: f(s.b) } : { t: 'C', a: f(s.a), c1: f(s.c1), c2: f(s.c2), b: f(s.b) })) };
}
export const mirrorX = (path, x0 = 0) => mapPath(path, (p) => [2 * x0 - p[0], p[1]]);
export const translate = (path, dx, dy) => mapPath(path, (p) => [p[0] + dx, p[1] + dy]);
export function rotateScale(path, ang, k = 1, c = [0, 0]) { const cs = Math.cos(ang) * k, sn = Math.sin(ang) * k; return mapPath(path, (p) => { const x = p[0] - c[0], y = p[1] - c[1]; return [c[0] + x * cs - y * sn, c[1] + x * sn + y * cs]; }); }
export function reverse(path) { return { closed: path.closed, segs: [...path.segs].reverse().map((s) => (s.t === 'L' ? { t: 'L', a: s.b, b: s.a } : { t: 'C', a: s.b, c1: s.c2, c2: s.c1, b: s.a })) }; }
// yolları uç uca birleştir (uçlar tol içinde ise)
export function join(a, b, tol = 1e-6) {
  if (!a.segs.length) return b; if (!b.segs.length) return a;
  const ae = a.segs.at(-1).b, bs = b.segs[0].a;
  if (dist(ae, bs) > tol) throw new Error('Yollar uç uca değil');
  return { closed: false, segs: [...a.segs, ...b.segs] };
}
// Bezier ile çember (4 parça). Yarıçap hatası en çok ≈ %0,027
export function circlePath(c, r) {
  const k = 0.5522847498 * r, [x, y] = c;
  return { closed: true, segs: [cubic([x + r, y], [x + r, y + k], [x + k, y + r], [x, y + r]), cubic([x, y + r], [x - k, y + r], [x - r, y + k], [x - r, y]), cubic([x - r, y], [x - r, y - k], [x - k, y - r], [x, y - r]), cubic([x, y - r], [x + k, y - r], [x + r, y - k], [x + r, y])] };
}
export function toSVGd(path, f = (p) => p) {
  if (!path.segs.length) return '';
  const n = (p) => { const q = f(p); return +q[0].toFixed(3) + ' ' + +q[1].toFixed(3); };
  let d = 'M' + n(path.segs[0].a);
  for (const s of path.segs) d += s.t === 'L' ? ' L' + n(s.b) : ' C' + n(s.c1) + ' ' + n(s.c2) + ' ' + n(s.b);
  return d + (path.closed ? ' Z' : '');
}
export const finitePath = (path) => path && Array.isArray(path.segs) && path.segs.every((s) => (s.t === 'L' ? [s.a, s.b] : s.t === 'C' ? [s.a, s.c1, s.c2, s.b] : [null]).every((p) => Array.isArray(p) && p.length === 2 && Number.isFinite(p[0]) && Number.isFinite(p[1])));
