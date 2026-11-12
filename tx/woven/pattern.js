// Dokuma / konfeksiyon kalıp geometrisi — saf modül (DOM yok). Birim mm, y aşağı.
// Kalıp parçası (piece): dikiş hattı (net çizgi) kapalı bir kenar (edge) zinciridir. Her kenarın kendi dikiş payı
// ve kenar sonundaki köşe türü vardır. Kesim hattı = dikiş hattının kenar bazında dışa ötelenmesi.
//   piece = { id, name, product, size, qty, pair, fold, fabric, grain:[a,b], notes,
//             edges:[{ name, segs:[...], allow, corner }], notches:[{ edge, at, kind }],
//             darts:[{ a, b, apex }], marks:[{ kind, p, label }], lines:[{ path, kind }] }
// fold: kumaş katına gelen kenarın indeksi (o kenara pay eklenmez, kesim katlı yapılır).
import * as C from '../curve.js?v=20261112g';

export const CORNERS = { miter: 'Sivri (uzatma)', square: 'Dik (bloklu)', bevel: 'Pah (düz bağla)' };
export const NOTCH_KINDS = { tek: 'Tek çıt', 'çift': 'Çift çıt', T: 'T çıt' };
export const MARK_KINDS = { delik: 'Delik / matkap', 'düğme': 'Düğme', iliK: 'İlik', referans: 'Referans' };
export const FABRICS = { ana: 'Ana kumaş', astar: 'Astar', tela: 'Tela', kontrast: 'Kontrast' };
const TOL = 0.05;   // düzleştirme toleransı (mm)
const clone = (o) => JSON.parse(JSON.stringify(o));
const isP = (p) => Array.isArray(p) && p.length === 2 && Number.isFinite(p[0]) && Number.isFinite(p[1]);
const cross = (a, b) => a[0] * b[1] - a[1] * b[0];
const unit = (v) => { const L = Math.hypot(v[0], v[1]); return L < 1e-15 ? [0, 0] : [v[0] / L, v[1] / L]; };

/* ---------- oluşturma ---------- */
export function makePiece(o = {}) {
  return { id: o.id || 'pc' + Math.random().toString(36).slice(2, 8), name: o.name || 'Parça', product: o.product ?? null, size: o.size ?? '', qty: o.qty ?? 1, pair: o.pair ?? false, fold: o.fold ?? null, fabric: o.fabric || 'ana', grain: o.grain || null, notes: o.notes || '',
    edges: (o.edges || []).map((e) => ({ name: e.name || '', segs: e.segs, allow: e.allow ?? 10, corner: e.corner || 'miter' })), notches: o.notches || [], darts: o.darts || [], marks: o.marks || [], lines: o.lines || [] };
}
// köşe noktaları + kenar başına yollar: points = [{ p, smooth }] → kenarlar (yumuşak noktalar eğri olur)
export function edgesFromPoints(points, allow = 10) {
  const n = points.length;
  if (n < 3) throw new Error('Kapalı parça için en az 3 nokta');
  const corners = points.map((q, i) => (!q.smooth ? i : -1)).filter((i) => i >= 0);
  if (!corners.length) { const path = C.smoothPath(points.map((q) => q.p), true); return [{ name: '', segs: path.segs, allow, corner: 'miter' }]; }
  const edges = [];
  for (let k = 0; k < corners.length; k++) {
    const i0 = corners[k], i1 = corners[(k + 1) % corners.length];
    const run = [points[i0].p]; for (let j = (i0 + 1) % n; j !== i1; j = (j + 1) % n) run.push(points[j].p); run.push(points[i1].p);
    const path = run.length === 2 ? C.polyPath(run) : C.smoothPath(run);
    edges.push({ name: '', segs: path.segs, allow, corner: 'miter' });
  }
  return edges;
}
export const edgePath = (e) => ({ closed: false, segs: e.segs });
export const edgeLength = (e) => C.pathLength(edgePath(e));
export const outline = (pc) => ({ closed: true, segs: pc.edges.flatMap((e) => e.segs) });

/* ---------- çokgen yardımcıları ---------- */
export function signedArea(pts) { let A = 0; for (let i = 0, n = pts.length; i < n; i++) { const a = pts[i], b = pts[(i + 1) % n]; A += a[0] * b[1] - b[0] * a[1]; } return A / 2; }
export const polyArea = (pts) => Math.abs(signedArea(pts));
export function polyPerimeter(pts) { let L = 0; for (let i = 0; i < pts.length; i++) L += C.dist(pts[i], pts[(i + 1) % pts.length]); return L; }
export function insidePoly(pts, p) { let c = false; for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) { const a = pts[i], b = pts[j]; if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < (b[0] - a[0]) * (p[1] - a[1]) / (b[1] - a[1]) + a[0]) c = !c; } return c; }
const dedupe = (pts) => pts.filter((p, i) => i === 0 || C.dist(p, pts[i - 1]) > 1e-9);
function flatEdge(e, tol = TOL) { return C.flatten(edgePath(e), tol); }
export function seamPolygon(pc, tol = TOL) {
  const out = [];
  for (const e of pc.edges) { const f = flatEdge(e, tol); out.push(...(out.length ? f.slice(1) : f)); }
  if (out.length > 1 && C.dist(out[0], out.at(-1)) < 1e-6) out.pop();
  return dedupe(out);
}
// iki doğru parçası kesişimi (uçlar dahil değil): t, u ∈ (eps, 1-eps)
function segX(a, b, c, d, eps = 1e-9) {
  const r = C.sub(b, a), s = C.sub(d, c), den = cross(r, s);
  if (Math.abs(den) < 1e-14) return null;
  const t = cross(C.sub(c, a), s) / den, u = cross(C.sub(c, a), r) / den;
  if (t > eps && t < 1 - eps && u > eps && u < 1 - eps) return { t, u, p: C.add(a, C.mul(r, t)) };
  return null;
}
// kapalı çokgende komşu olmayan kenarların kesişimleri (süpürme)
export function selfIntersections(pts, max = 20) {
  const n = pts.length, segs = [];
  for (let i = 0; i < n; i++) { const a = pts[i], b = pts[(i + 1) % n]; segs.push({ i, a, b, x0: Math.min(a[0], b[0]), x1: Math.max(a[0], b[0]), y0: Math.min(a[1], b[1]), y1: Math.max(a[1], b[1]) }); }
  segs.sort((p, q) => p.x0 - q.x0);
  const out = [], act = [];
  for (const s of segs) {
    for (let k = act.length - 1; k >= 0; k--) if (act[k].x1 < s.x0 - 1e-9) act.splice(k, 1);
    for (const o of act) {
      if (o.y1 < s.y0 - 1e-9 || o.y0 > s.y1 + 1e-9) continue;
      const d = Math.abs(o.i - s.i); if (d <= 1 || d === n - 1) continue;
      const x = segX(s.a, s.b, o.a, o.b); if (x) { out.push(x.p); if (out.length >= max) return out; }
    }
    act.push(s);
  }
  return out;
}

/* ---------- dikiş payı ---------- */
const orient = (pc) => Math.sign(signedArea(seamPolygon(pc, 0.5))) || 1;
// dışa dönük birim normal (y aşağı koordinatta da geçerli: işaret alan yönünden)
const outN = (d, sg) => unit([sg * d[1], -sg * d[0]]);
function offsetPolyline(pts, dist, sg) {
  if (dist === 0) return pts.map((p) => [p[0], p[1]]);
  const n = pts.length, out = [];
  for (let i = 0; i < n; i++) {
    if (i === 0) { out.push(C.add(pts[0], C.mul(outN(C.sub(pts[1], pts[0]), sg), dist))); continue; }
    if (i === n - 1) { out.push(C.add(pts[i], C.mul(outN(C.sub(pts[i], pts[i - 1]), sg), dist))); continue; }
    const n1 = outN(C.sub(pts[i], pts[i - 1]), sg), n2 = outN(C.sub(pts[i + 1], pts[i]), sg), m = unit(C.add(n1, n2));
    const c = m[0] * n1[0] + m[1] * n1[1];
    out.push(C.add(pts[i], C.mul(m, dist / Math.max(0.25, c))));
  }
  return out;
}
// ötelenmiş çoklu çizgideki yerel düğümleri (içbükey sıkı eğride pay > yarıçap) kırp
export function removeLoops(pts, win = 400) {
  const out = pts.map((p) => p);
  for (let i = 0; i < out.length - 3; i++) {
    for (let j = Math.min(out.length - 2, i + win); j >= i + 2; j--) {
      const x = segX(out[i], out[i + 1], out[j], out[j + 1]);
      if (x) { out.splice(i + 1, j - i, x.p); break; }
    }
  }
  return out;
}
function lineX(p, t, q, u) { const den = cross(t, u); if (Math.abs(den) < 1e-9) return null; const s = cross(C.sub(q, p), u) / den; return { p: C.add(p, C.mul(t, s)), s, v: cross(C.sub(q, p), t) / den }; }
// iki çoklu çizginin (A sonu, B başı) ilk kesişimi: A'yı ve B'yi kesişimde kırp
function trimJoin(A, B) {
  for (let i = A.length - 2; i >= Math.max(0, A.length - 400); i--) for (let j = 0; j < Math.min(B.length - 1, 400); j++) {
    const x = segX(A[i], A[i + 1], B[j], B[j + 1], -1e-9); if (x) return { A: [...A.slice(0, i + 1), x.p], B: [x.p, ...B.slice(j + 1)] };
  }
  return null;
}
// Kesim hattı: her kenar kendi payıyla ötelenir, köşeler köşe türüne göre birleştirilir.
// Dönüş: { pts, issues } — pts kapalı çokgen
export function cutPolygon(pc, tol = TOL) {
  const sg = orient(pc), E = pc.edges, n = E.length, issues = [];
  const allowOf = (i) => (pc.fold === i ? 0 : Math.max(0, E[i].allow || 0));
  const raw = E.map((e) => flatEdge(e, tol));
  let offs = raw.map((pts, i) => removeLoops(offsetPolyline(pts, allowOf(i), sg)));
  const out = [];
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n, A = offs[i], B = offs[j];
    const ta = unit(C.sub(raw[i].at(-1), raw[i].at(-2))), tb = unit(C.sub(raw[j][1], raw[j][0]));
    const corner = raw[i].at(-1), ai = allowOf(i), aj = allowOf(j);
    let tail = [];   // köşe birleştirme noktaları (A sonu ile B başı arası)
    const turn = cross(ta, tb) * sg;   // > 0: dışbükey köşe (dönüş yönü alan işaretiyle aynı)
    const convex = turn > -1e-9;
    if (C.dist(A.at(-1), B[0]) < 1e-6) tail = [];
    else if (!convex) {
      // içbükey köşe: ötelenmiş çizgiler kesişir → kırp
      const r = trimJoin(A, B);
      if (r) { offs[i] = r.A; offs[j] = r.B; } else issues.push({ edge: i, msg: 'iç köşede pay birleşmedi' });
    } else {
      const kind = E[i].corner || 'miter';
      const X = lineX(A.at(-1), ta, B[0], tb);
      if (kind === 'miter' && X && X.s >= -1e-6 && C.dist(X.p, corner) <= 6 * Math.max(ai, aj, 1)) tail = [X.p];
      else if (kind === 'bevel' || !X) tail = [];
      else tail = [C.add(A.at(-1), C.mul(ta, aj)), C.sub(B[0], C.mul(tb, ai))];   // dik köşe (ya da çok sivri uzatma)
    }
    offs[i].tailJoin = tail;
  }
  for (let i = 0; i < n; i++) { out.push(...offs[i], ...(offs[i].tailJoin || [])); }
  let pts = dedupe(out);
  if (pts.length > 1 && C.dist(pts[0], pts.at(-1)) < 1e-9) pts.pop();
  // aynı doğru üzerindeki ara noktaları at (çıktı sade, alan / çevre değişmez)
  pts = pts.filter((p, i) => { const a = pts[(i - 1 + pts.length) % pts.length], b = pts[(i + 1) % pts.length]; return Math.abs(cross(C.sub(p, a), C.sub(b, p))) > 1e-9 * Math.max(1, C.dist(a, b)) || C.dist(a, b) < 1e-12; });
  return { pts, issues };
}

/* ---------- kenar üzerindeki konumlar ---------- */
// noktayı en yakın kenara yerleştir: { edge, at (mm, kenar başından), d, p }
export function locate(pc, p) {
  let best = null;
  pc.edges.forEach((e, i) => {
    const r = C.nearest(edgePath(e), p); if (!r) return;
    let at = 0; for (let k = 0; k < r.seg; k++) at += C.segLength(e.segs[k]); at += C.segLength(e.segs[r.seg], 0, r.t);
    if (!best || r.d < best.d) best = { edge: i, at, d: r.d, p: r.p };
  });
  return best;
}
// kenar boyunca "at" mm'deki nokta ve dışa normal
export function pointAt(pc, edge, at) {
  const e = pc.edges[edge], sg = orient(pc);
  let acc = 0;
  for (const s of e.segs) {
    const l = C.segLength(s);
    if (acc + l >= at - 1e-9 || s === e.segs.at(-1)) { const t = C.tAtLength(s, Math.max(0, Math.min(l, at - acc))); return { p: C.point(s, t), n: outN(C.deriv(s, t), sg) }; }
    acc += l;
  }
  return null;
}
export function notchGeom(pc, nt) {
  const q = pointAt(pc, nt.edge, nt.at); if (!q) return [];
  const a = pc.fold === nt.edge ? 0 : pc.edges[nt.edge].allow || 0, L = Math.min(6, Math.max(3, a * 0.6));
  const p0 = C.add(q.p, C.mul(q.n, a)), p1 = C.add(q.p, C.mul(q.n, a - L));
  const tvec = [-q.n[1], q.n[0]];
  if (nt.kind === 'çift') return [[C.add(p0, C.mul(tvec, 1.5)), C.add(p1, C.mul(tvec, 1.5))], [C.sub(p0, C.mul(tvec, 1.5)), C.sub(p1, C.mul(tvec, 1.5))]];
  if (nt.kind === 'T') return [[p0, p1], [C.add(p1, C.mul(tvec, 2)), C.sub(p1, C.mul(tvec, 2))]];
  return [[p0, p1]];
}
// Etkin dikiş uzunluğu: kenar uzunluğu − bu kenardaki pens ağızları (pens kapatıldığında dikilen boy)
export function seamLength(pc, i) {
  let L = edgeLength(pc.edges[i]);
  for (const d of pc.darts) {
    const a = locate(pc, d.a), b = locate(pc, d.b);
    if (a && b && a.edge === i && b.edge === i && a.d < 0.5 && b.d < 0.5) L -= Math.abs(a.at - b.at);
  }
  return L;
}
export const dartIntake = (d) => C.dist(d.a, d.b);

/* ---------- ölçüler ---------- */
export function measure(pc) {
  const s = seamPolygon(pc), c = cutPolygon(pc).pts;
  return { seamArea: polyArea(s), seamPerimeter: polyPerimeter(s), cutArea: polyArea(c), cutPerimeter: polyPerimeter(c), bbox: bboxPts(c) };
}
export function bboxPts(pts) { return { x0: Math.min(...pts.map((p) => p[0])), y0: Math.min(...pts.map((p) => p[1])), x1: Math.max(...pts.map((p) => p[0])), y1: Math.max(...pts.map((p) => p[1])) }; }
export function centroid(pc) { const b = bboxPts(seamPolygon(pc, 0.5)); return [(b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2]; }

/* ---------- dönüşümler ---------- */
export function mapPiece(pc, f) {
  const q = clone(pc);
  q.edges = q.edges.map((e) => ({ ...e, segs: C.mapPath({ segs: e.segs }, f).segs }));
  q.darts = q.darts.map((d) => ({ ...d, a: f(d.a), b: f(d.b), apex: f(d.apex) }));
  q.marks = q.marks.map((m) => ({ ...m, p: f(m.p) }));
  q.lines = q.lines.map((l) => ({ ...l, path: C.mapPath(l.path, f) }));
  if (q.grain) q.grain = q.grain.map(f);
  return q;   // çıtlar kenar + uzunlukla tutulduğu için dönüşümden etkilenmez
}
export const translatePiece = (pc, dx, dy) => mapPiece(pc, (p) => [p[0] + dx, p[1] + dy]);
export function rotatePiece(pc, deg, c = centroid(pc)) { const a = deg * Math.PI / 180, cs = Math.cos(a), sn = Math.sin(a); return mapPiece(pc, (p) => { const x = p[0] - c[0], y = p[1] - c[1]; return [c[0] + x * cs - y * sn, c[1] + x * sn + y * cs]; }); }
export function mirrorPiece(pc, x0 = centroid(pc)[0]) { return mapPiece(pc, (p) => [2 * x0 - p[0], p[1]]); }
// doğruya göre aynala (a, b doğru üzerinde)
export function mirrorAcross(pc, a, b) {
  const u = unit(C.sub(b, a));
  return mapPiece(pc, (p) => { const v = C.sub(p, a), k = v[0] * u[0] + v[1] * u[1], f = C.add(a, C.mul(u, k)); return [2 * f[0] - p[0], 2 * f[1] - p[1]]; });
}
// yön çevir: kenar sırası ve her kenar ters; çıtlar, köşe türleri, kat kenarı yeniden eşlenir
export function reversePiece(pc) {
  const q = clone(pc), n = q.edges.length, map = (i) => n - 1 - i;
  const lens = q.edges.map(edgeLength);
  q.edges = pc.edges.map((_, k) => { const o = pc.edges[n - 1 - k]; return { ...clone(o), segs: C.reverse({ segs: o.segs }).segs, corner: pc.edges[(n - 2 - k + n) % n].corner }; });
  q.notches = pc.notches.map((nt) => ({ ...nt, edge: map(nt.edge), at: lens[nt.edge] - nt.at }));
  if (pc.fold != null) q.fold = map(pc.fold);
  return q;
}

/* ---------- bölme ---------- */
function lineSegRoots(s, P, u) {
  // f(t) = cross(u, B(t) - P) = 0 ; t ∈ [0,1]
  const f = (t) => cross(u, C.sub(C.point(s, t), P));
  if (s.t === 'L') { const f0 = f(0), f1 = f(1); if (Math.abs(f1 - f0) < 1e-15) return []; const t = f0 / (f0 - f1); return t >= -1e-12 && t <= 1 + 1e-12 ? [Math.min(1, Math.max(0, t))] : []; }
  const N = 64, out = []; let t0 = 0, v0 = f(0);
  if (Math.abs(v0) < 1e-12) out.push(0);
  for (let k = 1; k <= N; k++) {
    const t1 = k / N, v1 = f(t1);
    if (Math.abs(v1) < 1e-12) out.push(t1);
    else if (v0 * v1 < 0) { let a = t0, b = t1, fa = v0; for (let it = 0; it < 80; it++) { const m = (a + b) / 2, fm = f(m); if (fa * fm <= 0) b = m; else { a = m; fa = fm; } } out.push((a + b) / 2); }
    t0 = t1; v0 = v1;
  }
  return out;
}
// Parçayı p1–p2 doğrusuyla ikiye böl. Doğru dikiş hattını tam iki noktada kesmeli.
export function splitPiece(pc, p1, p2, { allow = 10 } = {}) {
  const u = unit(C.sub(p2, p1)); if (!u[0] && !u[1]) throw new Error('Bölme çizgisi için iki farklı nokta gerekli');
  const hits = [];
  pc.edges.forEach((e, i) => e.segs.forEach((s, k) => { for (const t of lineSegRoots(s, p1, u)) { const p = C.point(s, t); if (!hits.some((h) => C.dist(h.p, p) < 1e-6)) hits.push({ e: i, k, t, p }); } }));
  if (hits.length !== 2) throw new Error(`Bölme çizgisi dikiş hattını tam iki noktada kesmeli (bulunan: ${hits.length})`);
  // mutlak çıt / pens konumları
  const absN = pc.notches.map((nt) => ({ ...nt, p: pointAt(pc, nt.edge, nt.at).p }));
  // kenarları kesişimlerde böl
  const E = clone(pc.edges), cuts = [];
  hits.sort((a, b) => a.e - b.e || a.k - b.k || a.t - b.t);
  const split = []; // yeni kenar listesi + kesişimde başlayan kenar indeksleri
  E.forEach((e, i) => {
    const hs = hits.filter((h) => h.e === i).sort((a, b) => a.k - b.k || a.t - b.t);
    if (!hs.length) { split.push(e); return; }
    let segs = [...e.segs], off = 0, cur = [];
    const pieces = [];
    for (const h of hs) {
      const k = h.k - off;
      if (h.t <= 1e-9) { pieces.push([...cur, ...segs.slice(0, k)]); segs = segs.slice(k); off += k; cur = []; }
      else if (h.t >= 1 - 1e-9) { pieces.push([...cur, ...segs.slice(0, k + 1)]); segs = segs.slice(k + 1); off += k + 1; cur = []; }
      else { const [l, r] = C.splitSeg(segs[k], h.t); pieces.push([...cur, ...segs.slice(0, k), l]); segs = [r, ...segs.slice(k + 1)]; off += k; cur = []; }
    }
    pieces.push(segs);
    pieces.forEach((sg, j) => { if (!sg.length) { if (j > 0) cuts.push(split.length); return; } if (j > 0) cuts.push(split.length); split.push({ ...e, segs: sg }); });
  });
  // kesim indeksleri: kesişim noktasında başlayan kenar
  const startAt = (p) => split.findIndex((e) => C.dist(e.segs[0].a, p) < 1e-6);
  const I1 = startAt(hits[0].p), I2 = startAt(hits[1].p);
  if (I1 < 0 || I2 < 0) throw new Error('Bölme noktaları bulunamadı');
  const n = split.length, loop = (from, to) => { const r = []; for (let i = from; i !== to; i = (i + 1) % n) r.push(split[i]); return r; };
  const X1 = hits[0].p, X2 = hits[1].p;
  const mk = (edges, closeA, closeB, suffix) => {
    const q = makePiece({ ...clone(pc), id: pc.id + suffix, name: pc.name + ' ' + suffix, edges: [...edges, { name: 'bölme', segs: [C.line(closeA, closeB)], allow, corner: 'miter' }], notches: [], darts: [], marks: [], lines: [] });
    const poly = seamPolygon(q, 0.5);
    q.fold = pc.fold != null ? edges.findIndex((e) => e === pc.edges[pc.fold] || (e.name === pc.edges[pc.fold].name && e.name)) : null; if (q.fold < 0) q.fold = null;
    for (const nt of absN) { const l = locate(q, nt.p); if (l && l.d < 0.5) q.notches.push({ edge: l.edge, at: l.at, kind: nt.kind }); }
    q.darts = clone(pc.darts.filter((d) => insidePoly(poly, d.apex)));
    q.marks = clone(pc.marks.filter((m) => insidePoly(poly, m.p)));
    q.lines = clone(pc.lines);
    if (pc.grain) { const c = centroid(q), d = C.sub(pc.grain[1], pc.grain[0]), h = C.mul(d, 0.5); q.grain = [C.sub(c, h), C.add(c, h)]; }
    return q;
  };
  return [mk(loop(I1, I2), X2, X1, 'A'), mk(loop(I2, I1), X1, X2, 'B')];
}

/* ---------- birleştirme ---------- */
// A'nın ea kenarına B'nin eb kenarını dik: B taşınır / döndürülür (gerekirse yönü çevrilir). Kenarlar aynı biçimde olmalı.
export function mergePieces(A, ea, B, eb, { tol = 0.5 } = {}) {
  if (orient(A) !== orient(B)) { B = reversePiece(B); eb = B.edges.length - 1 - eb; }
  const P = A.edges[ea].segs[0].a, Q = A.edges[ea].segs.at(-1).b, R = B.edges[eb].segs[0].a, S = B.edges[eb].segs.at(-1).b;
  const la = edgeLength(A.edges[ea]), lb = edgeLength(B.edges[eb]);
  if (Math.abs(la - lb) > tol) throw new Error(`Kenar boyları farklı: ${(la / 10).toFixed(1)} / ${(lb / 10).toFixed(1)} cm`);
  // R → Q, S → P (aynı yönlü iki parçada birleşen kenarlar ters yönde ilerler)
  const ang = Math.atan2(P[1] - Q[1], P[0] - Q[0]) - Math.atan2(S[1] - R[1], S[0] - R[0]), cs = Math.cos(ang), sn = Math.sin(ang);
  const f = (p) => { const x = p[0] - R[0], y = p[1] - R[1]; return [Q[0] + x * cs - y * sn, Q[1] + x * sn + y * cs]; };
  const Bt = mapPiece(B, f);
  const pa = edgePath(A.edges[ea]);
  const fb = C.flatten(edgePath(Bt.edges[eb]), 0.2);
  for (const q of fb) if (C.nearest(pa, q).d > tol) throw new Error('Kenarlar aynı biçimde değil; birleştirilemez');
  const nA = A.edges.length, nB = Bt.edges.length, edges = [], mapA = {}, mapB = {};
  for (let k = 1; k < nA; k++) { const i = (ea + k) % nA; mapA[i] = edges.length; edges.push(clone(A.edges[i])); }
  for (let k = 1; k < nB; k++) { const i = (eb + k) % nB; mapB[i] = edges.length; edges.push(clone(Bt.edges[i])); }
  const M = makePiece({ ...clone(A), name: A.name + ' + ' + B.name, edges, fold: null,
    notches: [...A.notches.filter((x) => x.edge !== ea).map((x) => ({ ...x, edge: mapA[x.edge] })), ...Bt.notches.filter((x) => x.edge !== eb).map((x) => ({ ...x, edge: mapB[x.edge] }))],
    darts: [...clone(A.darts), ...Bt.darts], marks: [...clone(A.marks), ...Bt.marks], lines: [...clone(A.lines), ...Bt.lines, { path: clone(pa), kind: 'birleşim' }] });
  if (A.fold != null && A.fold !== ea) M.fold = mapA[A.fold];
  return M;
}
// Kat kenarından aç: parçayı o kenara göre aynalayıp kendisiyle birleştir (yarım kalıptan tam kalıp)
export function unfoldPiece(pc, i) {
  const e = pc.edges[i];
  if (!e.segs.every((s) => s.t === 'L') || !isStraight(e)) throw new Error('Yalnız düz kenardan açılır');
  const a = e.segs[0].a, b = e.segs.at(-1).b;
  const M = mergePieces({ ...pc, fold: null }, i, mirrorAcross({ ...pc, fold: null }, a, b), i);
  M.name = pc.name; M.lines = M.lines.map((l) => (l.kind === 'birleşim' ? { ...l, kind: 'orta çizgi' } : l));
  return M;
}
export function isStraight(e, tol = 0.05) { const a = e.segs[0].a, b = e.segs.at(-1).b; if (C.dist(a, b) < 1e-6) return false; const u = unit(C.sub(b, a)); return flatEdge(e).every((p) => Math.abs(cross(u, C.sub(p, a))) <= tol); }

/* ---------- doğrulama ---------- */
export function validatePiece(pc) {
  const out = [], W = 'Kalıp ' + (pc?.name || '');
  const E = (m) => out.push({ level: 'hata', where: W, msg: m }), Wn = (m) => out.push({ level: 'uyarı', where: W, msg: m });
  if (!pc || !Array.isArray(pc.edges) || !pc.edges.length) { E('Kenar yok'); return out; }
  if (!String(pc.name || '').trim()) E('Parça adı boş');
  if (!(Number.isInteger(pc.qty) && pc.qty >= 1)) E('Kesim adedi en az 1 tam sayı olmalı');
  let bad = false;
  pc.edges.forEach((e, i) => {
    if (!Array.isArray(e.segs) || !e.segs.length || !C.finitePath({ segs: e.segs })) { E(`Kenar ${i + 1}: geçersiz geometri`); bad = true; return; }
    for (let k = 1; k < e.segs.length; k++) if (C.dist(e.segs[k - 1].b, e.segs[k].a) > 0.01) { E(`Kenar ${i + 1}: parçalar uç uca değil`); bad = true; }
    if (!(Number.isFinite(e.allow) && e.allow >= 0 && e.allow <= 100)) E(`Kenar ${i + 1}: dikiş payı 0–100 mm olmalı`);
    if (!CORNERS[e.corner]) E(`Kenar ${i + 1}: bilinmeyen köşe türü`);
    // eğri sürekliliği: kenar içinde kırık (köşe) olmamalı
    for (let k = 1; k < e.segs.length; k++) {
      const t1 = unit(C.deriv(e.segs[k - 1], 1)), t2 = unit(C.deriv(e.segs[k], 0)), ang = Math.acos(Math.max(-1, Math.min(1, t1[0] * t2[0] + t1[1] * t2[1]))) * 180 / Math.PI;
      if (ang > 12) { Wn(`Kenar ${i + 1} (${e.name || 'adsız'}) içinde ${ang.toFixed(0)}° kırık var; köşede kenarı ayır`); break; }
    }
  });
  if (bad) return out;
  pc.edges.forEach((e, i) => { const nx = pc.edges[(i + 1) % pc.edges.length]; if (C.dist(e.segs.at(-1).b, nx.segs[0].a) > 0.01) E(`Kontur kapalı değil: kenar ${i + 1} sonu ile kenar ${(i + 1) % pc.edges.length + 1} başı ${C.dist(e.segs.at(-1).b, nx.segs[0].a).toFixed(2)} mm ayrık`); });
  if (out.some((x) => x.level === 'hata')) return out;
  const poly = seamPolygon(pc);
  const si = selfIntersections(poly, 3);
  if (!si.length && polyArea(poly) < 1) { E('Parça alanı sıfır'); return out; }
  if (si.length) E(`Dikiş hattı kendini kesiyor (${si.map((p) => `x ${(p[0] / 10).toFixed(1)}, y ${(p[1] / 10).toFixed(1)} cm`).join('; ')})`);
  if (pc.fold != null) { if (!pc.edges[pc.fold]) E('Kat kenarı yok'); else if (!isStraight(pc.edges[pc.fold])) E('Kumaş katı kenarı düz olmalı'); }
  if (!si.length) {
    const cut = cutPolygon(pc);
    for (const is of cut.issues) E(`Kenar ${is.edge + 1}: ${is.msg}`);
    const ci = selfIntersections(cut.pts, 3);
    if (ci.length) E('Kesim hattı (dikiş payı) kendini kesiyor: pay, eğrinin yarıçapından büyük olabilir');
  }
  pc.notches.forEach((nt, k) => { const L = pc.edges[nt.edge] ? edgeLength(pc.edges[nt.edge]) : -1; if (L < 0) E(`Çıt ${k + 1}: kenar yok`); else if (!(nt.at >= 0 && nt.at <= L + 1e-6)) E(`Çıt ${k + 1}: kenar dışında (${(nt.at / 10).toFixed(1)} / ${(L / 10).toFixed(1)} cm)`); if (!NOTCH_KINDS[nt.kind]) E(`Çıt ${k + 1}: bilinmeyen tür`); });
  pc.darts.forEach((d, k) => {
    if (![d.a, d.b, d.apex].every(isP)) { E(`Pens ${k + 1}: geçersiz nokta`); return; }
    const la = locate(pc, d.a), lb = locate(pc, d.b);
    if (la.d > 0.5 || lb.d > 0.5) E(`Pens ${k + 1}: ağız noktaları dikiş hattında değil`);
    if (!insidePoly(poly, d.apex)) E(`Pens ${k + 1}: ucu parça dışında`);
    const l1 = C.dist(d.a, d.apex), l2 = C.dist(d.b, d.apex);
    if (Math.abs(l1 - l2) > 1) Wn(`Pens ${k + 1}: bacak boyları farklı (${(l1 / 10).toFixed(1)} / ${(l2 / 10).toFixed(1)} cm); dikişte eşit olmalı`);
    if (dartIntake(d) < 1) E(`Pens ${k + 1}: ağız genişliği sıfır`);
  });
  pc.marks.forEach((m, k) => { if (!isP(m.p)) E(`İşaret ${k + 1}: geçersiz`); else if (!insidePoly(poly, m.p)) Wn(`İşaret ${k + 1} parça dışında`); });
  if (!pc.grain) Wn('Düz boy (kumaş yönü) çizgisi yok');
  else if (!pc.grain.every(isP) || C.dist(pc.grain[0], pc.grain[1]) < 10) E('Düz boy çizgisi geçersiz (en az 1 cm)');
  if (!FABRICS[pc.fabric]) E('Bilinmeyen kumaş türü: ' + pc.fabric);
  return out;
}
// Dikiş eşleşmesi: a tarafı kenarları toplamı + beklenen fark (bolluk / pile / kruvaze) = b tarafı
//   seam = { id, name, a:[{ piece, edge, k }], b:[...], ease, tol }
export function seamCheck(pieces, sm) {
  const get = (r) => { const pc = pieces.find((p) => p.id === r.piece); return pc && pc.edges[r.edge] ? seamLength(pc, r.edge) * (r.k || 1) : null; };
  const la = sm.a.map(get), lb = sm.b.map(get);
  if (la.includes(null) || lb.includes(null)) return { ok: false, missing: true };
  const A = la.reduce((x, y) => x + y, 0), B = lb.reduce((x, y) => x + y, 0), diff = B - A - (sm.ease || 0);
  return { ok: Math.abs(diff) <= (sm.tol ?? 2), A, B, diff };
}
