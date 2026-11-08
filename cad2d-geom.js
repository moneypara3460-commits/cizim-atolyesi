// 2B çizim (AutoCAD tarzı) için saf geometri: kesişim, kırp, uzat, ofset, köşe yuvarlama, dönüşümler, DXF.
// DOM gerektirmez; Node'da test edilir (tests/cad2d.test.mjs).
// Varlıklar (dünya koordinatı mm, Y yukarı):
//   { t:'line', a:[x,y], b:[x,y] }      { t:'circle', c:[x,y], r }
//   { t:'arc', c, r, a0, a1 }  (radyan, a0'dan a1'e saat yönünün tersi)
//   { t:'dim', a, b, off }     (hizalı ölçü; off = ölçü çizgisinin ab'den işaretli uzaklığı)
//   { t:'text', p, h, s }      (s = yazı, h = yükseklik)
// Hepsinde ayrıca id ve layer alanları bulunur.

const TAU = Math.PI * 2;
const EPS = 1e-9;
export const normA = (a) => { a %= TAU; return a < 0 ? a + TAU : a; };
export const arcSpan = (e) => { const s = normA(e.a1 - e.a0); return s < 1e-12 ? TAU : s; };
// açının yay üzerindeki konumu: a0'dan itibaren ccw uzaklık (0..TAU)
export const arcParam = (e, ang) => normA(ang - e.a0);
export const onArc = (e, ang, tol = 1e-7) => arcParam(e, ang) <= arcSpan(e) + tol || arcParam(e, ang) >= TAU - tol;
const sub = (p, q) => [p[0] - q[0], p[1] - q[1]];
const add = (p, q) => [p[0] + q[0], p[1] + q[1]];
const mul = (p, k) => [p[0] * k, p[1] * k];
const dot = (p, q) => p[0] * q[0] + p[1] * q[1];
const cross = (p, q) => p[0] * q[1] - p[1] * q[0];
export const dist = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]);
const pAt = (c, r, a) => [c[0] + r * Math.cos(a), c[1] + r * Math.sin(a)];
const clone = (e) => JSON.parse(JSON.stringify(e));

export function arcEnds(e) { return [pAt(e.c, e.r, e.a0), pAt(e.c, e.r, e.a1)]; }

// üç noktadan geçen yay (p1 başlangıç, p2 ara nokta, p3 bitiş). Doğrusalsa null
export function arcFrom3(p1, p2, p3) {
  const d = 2 * (p1[0] * (p2[1] - p3[1]) + p2[0] * (p3[1] - p1[1]) + p3[0] * (p1[1] - p2[1]));
  if (Math.abs(d) < 1e-9) return null;
  const s1 = dot(p1, p1), s2 = dot(p2, p2), s3 = dot(p3, p3);
  const c = [(s1 * (p2[1] - p3[1]) + s2 * (p3[1] - p1[1]) + s3 * (p1[1] - p2[1])) / d,
    (s1 * (p3[0] - p2[0]) + s2 * (p1[0] - p3[0]) + s3 * (p2[0] - p1[0])) / d];
  const r = dist(c, p1);
  const A1 = Math.atan2(p1[1] - c[1], p1[0] - c[0]), A2 = Math.atan2(p2[1] - c[1], p2[0] - c[0]), A3 = Math.atan2(p3[1] - c[1], p3[0] - c[0]);
  // p2, A1'den A3'e ccw yol üzerindeyse ccw; değilse yön ters (A3'ten A1'e)
  const ccw = normA(A2 - A1) < normA(A3 - A1);
  return ccw ? { t: 'arc', c, r, a0: normA(A1), a1: normA(A3) } : { t: 'arc', c, r, a0: normA(A3), a1: normA(A1) };
}

/* ---------- kesişimler ---------- */
// Sonsuz doğru (p + t·d) ile varlık. Dönüş: [{ p, t, u }] — t doğru parametresi, u varlık üzerindeki parametre
function lineX(p, dvec, e, bounded = true) {
  const out = [];
  if (e.t === 'line') {
    const q = e.a, s = sub(e.b, e.a), den = cross(dvec, s);
    if (Math.abs(den) < 1e-12) return out;
    const w = sub(q, p), t = cross(w, s) / den, u = cross(w, dvec) / den;
    if (!bounded || (u >= -1e-9 && u <= 1 + 1e-9)) out.push({ p: add(p, mul(dvec, t)), t, u });
    return out;
  }
  if (e.t === 'circle' || e.t === 'arc') {
    const f = sub(p, e.c), A = dot(dvec, dvec), B = 2 * dot(f, dvec), C = dot(f, f) - e.r * e.r;
    const D = B * B - 4 * A * C;
    if (D < 0 || A < 1e-18) return out;
    const sq = Math.sqrt(D);
    for (const t of D < 1e-12 ? [-B / (2 * A)] : [(-B - sq) / (2 * A), (-B + sq) / (2 * A)]) {
      const q = add(p, mul(dvec, t)), ang = normA(Math.atan2(q[1] - e.c[1], q[0] - e.c[0]));
      if (e.t === 'arc' && bounded && !onArc(e, ang)) continue;
      out.push({ p: q, t, u: ang });
    }
  }
  return out;
}
// Çember / yay ile varlık (çember tam kabul edilir; yay sınırı u ile süzülür). Dönüş [{ p, ang (bu çemberde), u (diğerinde) }]
function circleX(c, r, e) {
  const out = [];
  if (e.t === 'line') {
    for (const h of lineX(e.a, sub(e.b, e.a), { t: 'circle', c, r })) if (h.t >= -1e-9 && h.t <= 1 + 1e-9) out.push({ p: h.p, ang: h.u, u: h.t });
    return out;
  }
  if (e.t === 'circle' || e.t === 'arc') {
    const d = dist(c, e.c);
    if (d < 1e-12 || d > r + e.r + 1e-9 || d < Math.abs(r - e.r) - 1e-9) return out;
    const a = (r * r - e.r * e.r + d * d) / (2 * d), h2 = r * r - a * a, h = h2 > 0 ? Math.sqrt(h2) : 0;
    const m = add(c, mul(sub(e.c, c), a / d)), n = [-(e.c[1] - c[1]) / d, (e.c[0] - c[0]) / d];
    for (const q of h < 1e-9 ? [m] : [add(m, mul(n, h)), sub(m, mul(n, h))]) {
      const u = normA(Math.atan2(q[1] - e.c[1], q[0] - e.c[0]));
      if (e.t === 'arc' && !onArc(e, u)) continue;
      out.push({ p: q, ang: normA(Math.atan2(q[1] - c[1], q[0] - c[0])), u });
    }
  }
  return out;
}
const geomOK = (e) => e && (e.t === 'line' || e.t === 'circle' || e.t === 'arc');
// iki varlığın kesişim noktaları (ikisinin de sınırları içinde)
export function intersect(e1, e2) {
  if (!geomOK(e1) || !geomOK(e2)) return [];
  if (e1.t === 'line') return lineX(e1.a, sub(e1.b, e1.a), e2).filter((h) => h.t >= -1e-9 && h.t <= 1 + 1e-9).map((h) => h.p);
  const hs = circleX(e1.c, e1.r, e2);
  return hs.filter((h) => e1.t === 'circle' || onArc(e1, h.ang)).map((h) => h.p);
}
// e üzerinde, diğerleriyle kesiştiği parametreler (çizgi: t 0..1, çember/yay: açı)
function cutParams(e, others) {
  const out = [];
  for (const o of others) {
    if (o === e || !geomOK(o)) continue;
    if (e.t === 'line') { for (const h of lineX(e.a, sub(e.b, e.a), o)) if (h.t > 1e-7 && h.t < 1 - 1e-7) out.push(h.t); }
    else for (const h of circleX(e.c, e.r, o)) if (e.t === 'circle' || onArc(e, h.ang)) out.push(h.ang);
  }
  return out;
}

/* ---------- en yakın nokta / uzaklık ---------- */
export function nearestOn(e, p) {
  if (e.t === 'line') {
    const s = sub(e.b, e.a), L2 = dot(s, s) || 1e-18;
    const t = Math.max(0, Math.min(1, dot(sub(p, e.a), s) / L2));
    return { p: add(e.a, mul(s, t)), t };
  }
  if (e.t === 'circle' || e.t === 'arc') {
    let ang = Math.atan2(p[1] - e.c[1], p[0] - e.c[0]);
    if (e.t === 'arc' && !onArc(e, ang)) {
      const [s0, s1] = arcEnds(e);
      return dist(p, s0) < dist(p, s1) ? { p: s0, t: e.a0 } : { p: s1, t: e.a1 };
    }
    return { p: pAt(e.c, e.r, ang), t: normA(ang) };
  }
  if (e.t === 'dim') { const n = nearestOn({ t: 'line', ...dimLine(e) }, p); return n; }
  if (e.t === 'text') return { p: e.p, t: 0 };
  return { p, t: 0 };
}
export function dimLine(e) {
  const d = sub(e.b, e.a), L = Math.hypot(...d) || 1e-9, n = [-d[1] / L, d[0] / L];
  return { a: add(e.a, mul(n, e.off)), b: add(e.b, mul(n, e.off)), n, L };
}

/* ---------- kırp / uzat ---------- */
// pick noktasına en yakın parça kesişimler arasında silinir. Dönüş: yerine konacak varlıklar (boş = tamamen sil), null = yapılamaz
export function trimEntity(e, others, pick) {
  const ps = cutParams(e, others);
  if (e.t === 'line') {
    if (!ps.length) return [];
    const tp = nearestOn(e, pick).t;
    let lo = 0, hi = 1;
    for (const t of ps) { if (t < tp && t > lo) lo = t; if (t > tp && t < hi) hi = t; }
    const at = (t) => add(e.a, mul(sub(e.b, e.a), t));
    const out = [];
    if (lo > 1e-7) out.push({ ...clone(e), b: at(lo) });
    if (hi < 1 - 1e-7) out.push({ ...clone(e), a: at(hi) });
    if (out.length === 2) delete out[1].id;
    return out;
  }
  if (e.t === 'circle') {
    const uniq = [...new Set(ps.map((a) => Math.round(normA(a) * 1e9) / 1e9))].sort((x, y) => x - y);
    if (!uniq.length) return [];
    if (uniq.length < 2) return null;
    const ap = normA(Math.atan2(pick[1] - e.c[1], pick[0] - e.c[0]));
    // ap'nin hemen öncesi ve sonrası
    let before = uniq[uniq.length - 1], after = uniq[0];
    for (const a of uniq) { if (a <= ap) before = a; }
    for (let i = uniq.length - 1; i >= 0; i--) if (uniq[i] > ap) after = uniq[i];
    if (ap >= uniq[uniq.length - 1]) after = uniq[0];
    return [{ ...clone(e), t: 'arc', a0: after, a1: before }];
  }
  if (e.t === 'arc') {
    const span = arcSpan(e);
    const us = ps.map((a) => arcParam(e, a)).filter((u) => u > 1e-7 && u < span - 1e-7);
    if (!us.length) return [];
    const up = arcParam(e, Math.atan2(pick[1] - e.c[1], pick[0] - e.c[0]));
    const upc = up > span ? (up - span < TAU - up ? span : 0) : up;
    let lo = 0, hi = span;
    for (const u of us) { if (u < upc && u > lo) lo = u; if (u > upc && u < hi) hi = u; }
    const out = [];
    if (lo > 1e-7) out.push({ ...clone(e), a1: normA(e.a0 + lo) });
    if (hi < span - 1e-7) out.push({ ...clone(e), a0: normA(e.a0 + hi) });
    if (out.length === 2) delete out[1].id;
    return out;
  }
  return null;
}
// pick'e yakın ucu, en yakın sınır varlığına kadar uzatır. Dönüş: yeni varlık ya da null
export function extendEntity(e, others, pick) {
  if (e.t === 'line') {
    const endB = dist(pick, e.b) <= dist(pick, e.a);
    const d = sub(e.b, e.a);
    let best = null;
    for (const o of others) {
      if (o === e || !geomOK(o)) continue;
      for (const h of lineX(e.a, d, o)) {
        if (endB ? h.t > 1 + 1e-7 && (best === null || h.t < best) : h.t < -1e-7 && (best === null || h.t > best)) best = h.t;
      }
    }
    if (best === null) return null;
    const q = add(e.a, mul(d, best));
    return endB ? { ...clone(e), b: q } : { ...clone(e), a: q };
  }
  if (e.t === 'arc') {
    const [s0, s1] = arcEnds(e);
    const endA1 = dist(pick, s1) <= dist(pick, s0);
    const span = arcSpan(e);
    let best = null;
    for (const o of others) {
      if (o === e || !geomOK(o)) continue;
      for (const h of circleX(e.c, e.r, o)) {
        const u = arcParam(e, h.ang);
        if (u <= span + 1e-7) continue; // zaten yayın üstünde
        const gain = endA1 ? u - span : TAU - u;   // a1'den ileri ya da a0'dan geri ne kadar
        if (best === null || gain < best.g) best = { g: gain, ang: h.ang };
      }
    }
    if (!best) return null;
    return endA1 ? { ...clone(e), a1: normA(best.ang) } : { ...clone(e), a0: normA(best.ang) };
  }
  return null;
}

/* ---------- ofset ---------- */
export function offsetEntity(e, d, side) {
  if (e.t === 'line') {
    const s = sub(e.b, e.a), L = Math.hypot(...s);
    if (L < 1e-12) return null;
    let n = [-s[1] / L, s[0] / L];
    if (dot(sub(side, e.a), n) < 0) n = mul(n, -1);
    const o = clone(e); delete o.id;
    o.a = add(e.a, mul(n, d)); o.b = add(e.b, mul(n, d));
    return o;
  }
  if (e.t === 'circle' || e.t === 'arc') {
    const r = dist(side, e.c) > e.r ? e.r + d : e.r - d;
    if (!(r > 1e-9)) return null;
    const o = clone(e); delete o.id; o.r = r; return o;
  }
  return null;
}

/* ---------- köşe yuvarlama (iki çizgi) ---------- */
// p1, p2: çizgilerin korunacak tarafındaki dokunma noktaları. r = 0 ise köşe keskin birleşir.
// Dönüş: { l1, l2, arc|null } ya da null (paralel / yarıçap sığmıyor)
export function filletLines(l1, l2, r, p1, p2) {
  const d1 = sub(l1.b, l1.a), d2 = sub(l2.b, l2.a);
  const den = cross(d1, d2);
  if (Math.abs(den) < 1e-12) return null;
  const t = cross(sub(l2.a, l1.a), d2) / den;
  const X = add(l1.a, mul(d1, t));
  // korunacak taraf: dokunma noktasının X'e göre yönü
  const keepDir = (l, d, p) => { const L = Math.hypot(...d), u = mul(d, 1 / L); return dot(sub(nearestOn({ t: 'line', a: l.a, b: l.b }, p).p, X), u) >= 0 ? u : mul(u, -1); };
  const u1 = keepDir(l1, d1, p1), u2 = keepDir(l2, d2, p2);
  const far = (l, u) => (dot(sub(l.a, X), u) > dot(sub(l.b, X), u) ? l.a : l.b);
  const f1 = far(l1, u1), f2 = far(l2, u2);
  if (!(r > 0)) return { l1: { ...clone(l1), a: f1, b: X }, l2: { ...clone(l2), a: f2, b: X }, arc: null };
  const th = Math.acos(Math.max(-1, Math.min(1, dot(u1, u2))));
  if (th < 1e-6 || th > Math.PI - 1e-6) return null;
  const tl = r / Math.tan(th / 2);
  if (tl > dot(sub(f1, X), u1) + 1e-9 || tl > dot(sub(f2, X), u2) + 1e-9) return null;
  const T1 = add(X, mul(u1, tl)), T2 = add(X, mul(u2, tl));
  const bis = add(u1, u2), bl = Math.hypot(...bis);
  const c = add(X, mul(bis, (r / Math.sin(th / 2)) / bl));
  let a0 = normA(Math.atan2(T1[1] - c[1], T1[0] - c[0])), a1 = normA(Math.atan2(T2[1] - c[1], T2[0] - c[0]));
  if (normA(a1 - a0) > Math.PI) [a0, a1] = [a1, a0];
  return { l1: { ...clone(l1), a: f1, b: T1 }, l2: { ...clone(l2), a: f2, b: T2 }, arc: { t: 'arc', c, r, a0, a1, layer: l1.layer } };
}

/* ---------- dönüşümler ---------- */
export function transformEntity(e, f, kind = 'rigid') {
  // f: nokta dönüşümü; kind 'mirror' ise yay yönü ters döner
  const o = clone(e);
  if (o.a) o.a = f(o.a);
  if (o.b) o.b = f(o.b);
  if (o.p) o.p = f(o.p);
  if (o.t === 'circle') o.c = f(o.c);
  if (o.t === 'arc') {
    const [s0, s1] = arcEnds(e).map(f);
    o.c = f(e.c);
    const A0 = normA(Math.atan2(s0[1] - o.c[1], s0[0] - o.c[0])), A1 = normA(Math.atan2(s1[1] - o.c[1], s1[0] - o.c[0]));
    if (kind === 'mirror') { o.a0 = A1; o.a1 = A0; } else { o.a0 = A0; o.a1 = A1; }
  }
  if (o.t === 'dim' && kind === 'mirror') o.off = -o.off;
  return o;
}
export const moveFn = (dx, dy) => (p) => [p[0] + dx, p[1] + dy];
export const rotateFn = (c, ang) => { const cs = Math.cos(ang), sn = Math.sin(ang); return (p) => [c[0] + (p[0] - c[0]) * cs - (p[1] - c[1]) * sn, c[1] + (p[0] - c[0]) * sn + (p[1] - c[1]) * cs]; };
export const mirrorFn = (a, b) => {
  const d = sub(b, a), L2 = dot(d, d) || 1e-18;
  return (p) => { const t = dot(sub(p, a), d) / L2, f = add(a, mul(d, t)); return [2 * f[0] - p[0], 2 * f[1] - p[1]]; };
};

/* ---------- yakalama (osnap) noktaları ---------- */
export function snapPoints(ents) {
  const out = [];
  const g = ents.filter(geomOK);
  for (const e of ents) {
    if (e.t === 'line') { out.push({ p: e.a, k: 'end' }, { p: e.b, k: 'end' }, { p: mul(add(e.a, e.b), 0.5), k: 'mid' }); }
    else if (e.t === 'circle') { out.push({ p: e.c, k: 'cen' }); for (let i = 0; i < 4; i++) out.push({ p: pAt(e.c, e.r, i * Math.PI / 2), k: 'quad' }); }
    else if (e.t === 'arc') { const [s0, s1] = arcEnds(e); out.push({ p: s0, k: 'end' }, { p: s1, k: 'end' }, { p: e.c, k: 'cen' }, { p: pAt(e.c, e.r, e.a0 + arcSpan(e) / 2), k: 'mid' }); }
    else if (e.t === 'text') out.push({ p: e.p, k: 'end' });
  }
  if (g.length <= 400) {
    for (let i = 0; i < g.length; i++) for (let j = i + 1; j < g.length; j++) for (const p of intersect(g[i], g[j])) out.push({ p, k: 'int' });
  }
  return out;
}

export function entBBox(e) {
  if (e.t === 'line' || e.t === 'dim') { const pts = e.t === 'dim' ? [e.a, e.b, dimLine(e).a, dimLine(e).b] : [e.a, e.b]; return bbOf(pts); }
  if (e.t === 'circle') return { minX: e.c[0] - e.r, maxX: e.c[0] + e.r, minY: e.c[1] - e.r, maxY: e.c[1] + e.r };
  if (e.t === 'arc') { const pts = arcEnds(e); for (let i = 0; i < 4; i++) if (onArc(e, i * Math.PI / 2)) pts.push(pAt(e.c, e.r, i * Math.PI / 2)); return bbOf(pts); }
  if (e.t === 'text') return { minX: e.p[0], maxX: e.p[0] + (e.h || 5) * 0.6 * String(e.s).length, minY: e.p[1], maxY: e.p[1] + (e.h || 5) };
  return null;
}
function bbOf(pts) {
  return { minX: Math.min(...pts.map((p) => p[0])), maxX: Math.max(...pts.map((p) => p[0])), minY: Math.min(...pts.map((p) => p[1])), maxY: Math.max(...pts.map((p) => p[1])) };
}

/* ---------- kapalı şekiller (3B'ye aktarmak için) ---------- */
// Çizgi ve yayları uçlarından birleştirip kapalı döngüler çıkarır; daireler kendi başına döngüdür. Dönüş: [[[x,y],...], ...]
export function closedLoops(ents, tol = 1e-3, segDeg = 6) {
  const loops = [];
  const segs = [];
  for (const e of ents) {
    if (e.t === 'circle') { const n = 64; loops.push(Array.from({ length: n }, (_, i) => pAt(e.c, e.r, i / n * TAU))); }
    else if (e.t === 'line') segs.push([e.a, e.b]);
    else if (e.t === 'arc') {
      const span = arcSpan(e), k = Math.max(2, Math.ceil(span / (segDeg * Math.PI / 180)));
      segs.push(Array.from({ length: k + 1 }, (_, i) => pAt(e.c, e.r, e.a0 + span * i / k)));
    }
  }
  const key = (p) => Math.round(p[0] / tol) + ',' + Math.round(p[1] / tol);
  const at = new Map();
  segs.forEach((s, i) => { for (const k of [key(s[0]), key(s[s.length - 1])]) { if (!at.has(k)) at.set(k, []); at.get(k).push(i); } });
  const used = new Array(segs.length).fill(false);
  for (let i = 0; i < segs.length; i++) {
    if (used[i]) continue;
    used[i] = true;
    const chain = segs[i].map((p) => p.slice());
    let closed = false;
    for (let guard = 0; guard < segs.length + 2; guard++) {
      const tip = chain[chain.length - 1];
      if (chain.length > 2 && key(tip) === key(chain[0])) { closed = true; break; }
      const cand = (at.get(key(tip)) || []).find((j) => !used[j]);
      if (cand === undefined) break;
      used[cand] = true;
      const s = segs[cand];
      const pts = key(s[0]) === key(tip) ? s : s.slice().reverse();
      chain.push(...pts.slice(1).map((p) => p.slice()));
    }
    if (closed) { chain.pop(); if (chain.length >= 3) loops.push(chain); }
  }
  return loops;
}

/* ---------- DXF ---------- */
export const ACI = { 1: '#ff3b30', 2: '#facc15', 3: '#22c55e', 4: '#22d3ee', 5: '#3b82f6', 6: '#d946ef', 7: '#f1f5f9', 8: '#94a3b8', 30: '#fb923c' };
const fmt = (v) => String(Math.round(v * 1e6) / 1e6);
const deg = (r) => fmt(r * 180 / Math.PI);
export function toDXF(ents, layers) {
  const o = [];
  const g = (c, v) => o.push(String(c), String(v));
  g(0, 'SECTION'); g(2, 'HEADER'); g(9, '$ACADVER'); g(1, 'AC1009'); g(9, '$INSUNITS'); g(70, 4); g(0, 'ENDSEC');
  g(0, 'SECTION'); g(2, 'TABLES');
  g(0, 'TABLE'); g(2, 'LTYPE'); g(70, 3);
  g(0, 'LTYPE'); g(2, 'CONTINUOUS'); g(70, 0); g(3, 'Solid line'); g(72, 65); g(73, 0); g(40, 0);
  g(0, 'LTYPE'); g(2, 'HIDDEN'); g(70, 0); g(3, 'Hidden'); g(72, 65); g(73, 2); g(40, 6); g(49, 4); g(49, -2);
  g(0, 'LTYPE'); g(2, 'CENTER'); g(70, 0); g(3, 'Center'); g(72, 65); g(73, 4); g(40, 14); g(49, 8); g(49, -2); g(49, 1); g(49, -2);
  g(0, 'ENDTAB');
  g(0, 'TABLE'); g(2, 'LAYER'); g(70, layers.length);
  for (const L of layers) { g(0, 'LAYER'); g(2, L.name); g(70, 0); g(62, L.hidden ? -(L.aci || 7) : (L.aci || 7)); g(6, L.lt || 'CONTINUOUS'); }
  g(0, 'ENDTAB'); g(0, 'ENDSEC');
  g(0, 'SECTION'); g(2, 'ENTITIES');
  const line = (a, b, ly) => { g(0, 'LINE'); g(8, ly); g(10, fmt(a[0])); g(20, fmt(a[1])); g(30, 0); g(11, fmt(b[0])); g(21, fmt(b[1])); g(31, 0); };
  const text = (p, h, s, ly, rot = 0) => { g(0, 'TEXT'); g(8, ly); g(10, fmt(p[0])); g(20, fmt(p[1])); g(30, 0); g(40, fmt(h)); g(1, s); if (rot) g(50, deg(rot)); };
  for (const e of ents) {
    const ly = e.layer || '0';
    if (e.t === 'line') line(e.a, e.b, ly);
    else if (e.t === 'circle') { g(0, 'CIRCLE'); g(8, ly); g(10, fmt(e.c[0])); g(20, fmt(e.c[1])); g(30, 0); g(40, fmt(e.r)); }
    else if (e.t === 'arc') { g(0, 'ARC'); g(8, ly); g(10, fmt(e.c[0])); g(20, fmt(e.c[1])); g(30, 0); g(40, fmt(e.r)); g(50, deg(e.a0)); g(51, deg(e.a1)); }
    else if (e.t === 'text') text(e.p, e.h || 5, e.s, ly);
    else if (e.t === 'dim') {
      // patlatılmış ölçü: uzatma çizgileri, ölçü çizgisi, oklar, yazı
      for (const s of dimParts(e)) line(s[0], s[1], ly);
      const dl = dimLine(e), h = e.h || 3.5;
      const ang = Math.atan2(e.b[1] - e.a[1], e.b[0] - e.a[0]);
      const rot = ang > Math.PI / 2 || ang <= -Math.PI / 2 ? ang + Math.PI : ang;
      const txt = dimText(e), w = h * 0.6 * txt.length;
      const mid = mul(add(dl.a, dl.b), 0.5), u = [Math.cos(rot), Math.sin(rot)], nn = [-u[1], u[0]];
      text(add(add(mid, mul(u, -w / 2)), mul(nn, h * 0.4)), h, txt, ly, rot);
    }
  }
  g(0, 'ENDSEC'); g(0, 'EOF');
  return o.join('\r\n') + '\r\n';
}
export function dimText(e) { const L = dist(e.a, e.b); return String(Math.round(L * 100) / 100).replace('.', ','); }
// ölçünün çizgi parçaları (uzatma çizgileri + ölçü çizgisi + ok kanatları)
export function dimParts(e) {
  const dl = dimLine(e), out = [];
  const ext = 1.5 * Math.sign(e.off || 1), gap = 1 * Math.sign(e.off || 1);
  out.push([add(e.a, mul(dl.n, gap)), add(dl.a, mul(dl.n, ext))], [add(e.b, mul(dl.n, gap)), add(dl.b, mul(dl.n, ext))]);
  out.push([dl.a, dl.b]);
  const u = mul(sub(dl.b, dl.a), 1 / (dl.L || 1)), al = Math.min(3, dl.L / 3), aw = al * 0.3;
  const wing = (p, s) => { const q = add(p, mul(u, s * al)); out.push([p, add(q, mul(dl.n, aw))], [p, sub(q, mul(dl.n, aw))]); };
  wing(dl.a, 1); wing(dl.b, -1);
  return out;
}

// DXF okuyucu: LINE, CIRCLE, ARC, LWPOLYLINE, POLYLINE/VERTEX, TEXT, MTEXT ve LAYER tablosu
export function parseDXF(txt) {
  const lines = String(txt).split(/\r?\n/);
  const pairs = [];
  for (let i = 0; i + 1 < lines.length; i += 2) pairs.push([parseInt(lines[i].trim(), 10), lines[i + 1].trim()]);
  const ents = [], layers = [], skipped = {};
  let i = 0, section = '';
  const readEnt = () => { const rec = []; i++; while (i < pairs.length && pairs[i][0] !== 0) { rec.push(pairs[i]); i++; } return rec; };
  const get = (rec, c, d) => { const r = rec.find((q) => q[0] === c); return r ? r[1] : d; };
  const num = (rec, c, d = 0) => { const v = parseFloat(get(rec, c, d)); return isFinite(v) ? v : d; };
  const bulgeArc = (p, q, b, ly) => {
    // bulge = tan(açı/4); p'den q'ya
    const th = 4 * Math.atan(b), ch = dist(p, q);
    if (Math.abs(b) < 1e-9 || ch < 1e-12) return { t: 'line', a: p, b: q, layer: ly };
    const r = ch / (2 * Math.sin(Math.abs(th) / 2));
    const m = mul(add(p, q), 0.5), u = mul(sub(q, p), 1 / ch), n = [-u[1], u[0]];
    const h = r * Math.cos(Math.abs(th) / 2) * Math.sign(b);
    const c = add(m, mul(n, h));
    let a0 = normA(Math.atan2(p[1] - c[1], p[0] - c[0])), a1 = normA(Math.atan2(q[1] - c[1], q[0] - c[0]));
    if (b < 0) [a0, a1] = [a1, a0];
    return { t: 'arc', c, r, a0, a1, layer: ly };
  };
  const polyEnts = (vs, closed, ly) => {
    const out = [];
    const n = vs.length;
    for (let k = 0; k < (closed ? n : n - 1); k++) out.push(bulgeArc(vs[k].p, vs[(k + 1) % n].p, vs[k].b || 0, ly));
    return out;
  };
  while (i < pairs.length) {
    const [c, v] = pairs[i];
    if (c === 0 && v === 'SECTION') { i++; section = pairs[i] ? pairs[i][1] : ''; i++; continue; }
    if (c !== 0) { i++; continue; }
    if (section === 'TABLES' && v === 'LAYER') {
      const rec = readEnt(), name = get(rec, 2, null);
      if (name !== null) { const aci = parseInt(get(rec, 62, 7), 10); layers.push({ name, aci: Math.abs(aci) || 7, hidden: aci < 0, lt: get(rec, 6, 'CONTINUOUS').toUpperCase() }); }
      continue;
    }
    if (section !== 'ENTITIES' && section !== 'BLOCKS') { i++; continue; }
    if (section === 'BLOCKS') { i++; continue; }
    if (v === 'LINE') { const r = readEnt(); ents.push({ t: 'line', a: [num(r, 10), num(r, 20)], b: [num(r, 11), num(r, 21)], layer: get(r, 8, '0') }); continue; }
    if (v === 'CIRCLE') { const r = readEnt(); ents.push({ t: 'circle', c: [num(r, 10), num(r, 20)], r: num(r, 40, 1), layer: get(r, 8, '0') }); continue; }
    if (v === 'ARC') { const r = readEnt(); ents.push({ t: 'arc', c: [num(r, 10), num(r, 20)], r: num(r, 40, 1), a0: normA(num(r, 50) * Math.PI / 180), a1: normA(num(r, 51) * Math.PI / 180), layer: get(r, 8, '0') }); continue; }
    if (v === 'TEXT' || v === 'MTEXT') { const r = readEnt(); ents.push({ t: 'text', p: [num(r, 10), num(r, 20)], h: num(r, 40, 3.5), s: get(r, 1, '').replace(/\\P/g, ' '), layer: get(r, 8, '0') }); continue; }
    if (v === 'LWPOLYLINE') {
      const r = readEnt(), ly = get(r, 8, '0'), closed = (parseInt(get(r, 70, 0), 10) & 1) === 1;
      const vs = [];
      for (const [cc, vv] of r) {
        if (cc === 10) vs.push({ p: [parseFloat(vv), 0], b: 0 });
        else if (cc === 20 && vs.length) vs[vs.length - 1].p[1] = parseFloat(vv);
        else if (cc === 42 && vs.length) vs[vs.length - 1].b = parseFloat(vv);
      }
      ents.push(...polyEnts(vs, closed, ly));
      continue;
    }
    if (v === 'POLYLINE') {
      const r = readEnt(), ly = get(r, 8, '0'), closed = (parseInt(get(r, 70, 0), 10) & 1) === 1;
      const vs = [];
      while (i < pairs.length && pairs[i][1] === 'VERTEX') { const q = readEnt(); vs.push({ p: [num(q, 10), num(q, 20)], b: num(q, 42, 0) }); }
      if (i < pairs.length && pairs[i][1] === 'SEQEND') readEnt();
      ents.push(...polyEnts(vs, closed, ly));
      continue;
    }
    skipped[v] = (skipped[v] || 0) + 1;
    readEnt();
  }
  return { ents, layers, skipped };
}

/* ---------- ölçü verme (esnetme) ---------- */
// Çizginin uzunluğunu L yapar: dokunulan uç (moveB) yönünde, o ucun önündeki yarı düzlemdeki her nokta aynı miktarda kayar
// (AutoCAD STRETCH gibi). Dönüş: yeni varlık listesi (id'ler korunur).
export function stretchToLength(ents, line, L, moveB = true) {
  const L0 = dist(line.a, line.b);
  if (!(L0 > 1e-9) || !(L > 0)) return null;
  const u = mul(sub(line.b, line.a), 1 / L0), dir = moveB ? u : mul(u, -1);
  const anchor = moveB ? line.b : line.a, delta = L - L0, eps = Math.max(L0, 1) * 1e-6;
  const inH = (p) => dot(sub(p, anchor), dir) >= -eps;
  const mv = (p) => (inH(p) ? add(p, mul(dir, delta)) : p);
  return ents.map((e) => {
    const o = clone(e);
    if (e.t === 'line' || e.t === 'dim') { o.a = mv(e.a); o.b = mv(e.b); return o; }
    if (e.t === 'text') { o.p = mv(e.p); return o; }
    if (e.t === 'circle') { o.c = mv(e.c); return o; }
    if (e.t === 'arc') {
      const [s0, s1] = arcEnds(e), m = pAt(e.c, e.r, e.a0 + arcSpan(e) / 2);
      const n0 = mv(s0), n1 = mv(s1), nm = mv(m);
      if (inH(s0) && inH(s1) && inH(m)) { o.c = mv(e.c); return o; }
      if (!inH(s0) && !inH(s1) && !inH(m)) return o;
      const a = arcFrom3(n0, nm, n1);
      return a ? { ...o, c: a.c, r: a.r, a0: a.a0, a1: a.a1 } : { ...o, t: 'line', a: n0, b: n1 };
    }
    return o;
  });
}
// Daire / yay yarıçapını değiştirir; yayın uçlarına bağlı çizgi uçları da yeni uçlara taşınır
export function setRadius(ents, target, r) {
  if (!(r > 0)) return null;
  const old = target.t === 'arc' ? arcEnds(target) : [];
  const tol = Math.max(target.r, 1) * 1e-5;
  const nt = { ...clone(target), r };
  const now = target.t === 'arc' ? arcEnds(nt) : [];
  return ents.map((e) => {
    if (e === target) return nt;
    if (e.t !== 'line' || !old.length) return clone(e);
    const o = clone(e);
    for (const k of ['a', 'b']) for (let i = 0; i < 2; i++) if (dist(e[k], old[i]) <= tol) o[k] = now[i].slice();
    return o;
  });
}
