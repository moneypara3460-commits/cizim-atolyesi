// Ayakkabı Modelhanesi — türetilmiş geometri ve çizim listesi. Saf modül.
// Parçanın net çizgisi (stampa) + kenar türüne göre paylar → kesim çizgisi; dikiş, çentik, binme noktası, ölçü, yazı.
// Ekran, PDF, SVG ve DXF aynı çizim listesini (items) kullanır: ekranda görülen ile dosyaya yazılan aynıdır.
//   item: { layer, piece, t:'path', path } | { t:'poly', pts, closed } | { t:'circle', c, r } | { t:'text', p, s, h, ang, align }
import * as G from './geom.js?v=20261114s';
import { cutPolygon, selfIntersections, removeLoops } from '../tx/woven/pattern.js?v=20261112u';
import { edgeProp, allowValue, LINE_KINDS, MARK_KINDS, SIDES, ALLOW } from './model.js?v=20261114s';

const { C } = G;
const TOL = 0.05;
const fmt = (v, d = 1) => (Math.round(v * 10 ** d) / 10 ** d).toFixed(d).replace('.', ',');
export { fmt };

// pattern.js biçimine çevir: her kenar kendi payı ve köşe türüyle
export function patternPiece(pc) {
  const E = G.edges(pc.outline);
  return { edges: E.map((e) => { const pr = edgeProp(pc, e.id); return { segs: e.segs, allow: allowValue(pc, pr.kind), corner: pr.corner }; }), fold: null };
}
export function netPolygon(pc, tol = TOL) { return pc.outline.closed && pc.outline.nodes.length >= 3 ? G.flatten(pc.outline, tol) : []; }
export function orientSign(pc) { return Math.sign(G.signedArea(netPolygon(pc, 0.5))) || 1; }
export function cutLine(pc) {
  if (!pc.outline.closed || pc.outline.nodes.length < 3) return { pts: [], issues: [{ msg: 'Parça sınırı kapalı değil' }] };
  const r = cutPolygon(patternPiece(pc), TOL);
  return { pts: cleanLoops(r.pts), issues: r.issues };
}
// Dışbükey köşede iki kenarın payları çok farklıysa (ör. katlama 4 ↔ montaj 16) sivri uzatma noktası
// geniş payın ötelenmiş çizgisinin "önüne" düşer ve küçük bir düğüm oluşur. Düğüm, iki çizginin kesişiminde kırpılır
// (doğru sonuç: dar payın uzantısı geniş payın çizgisine orada bağlanır). Kapalı çokgende başlangıç noktası da taranır.
export function cleanLoops(pts) {
  if (pts.length < 5) return pts;
  let out = removeLoops(pts);
  const h = Math.floor(out.length / 2);
  out = removeLoops([...out.slice(h), ...out.slice(0, h)]);
  return out;
}
// alan ağırlık merkezi (içbükeyde dışarı düşebilir → içeride bir nokta seçilir)
export function labelPoint(pts) {
  const A = G.signedArea(pts); let cx = 0, cy = 0;
  if (Math.abs(A) > 1e-9) { for (let i = 0; i < pts.length; i++) { const a = pts[i], b = pts[(i + 1) % pts.length], k = a[0] * b[1] - b[0] * a[1]; cx += (a[0] + b[0]) * k; cy += (a[1] + b[1]) * k; } cx /= 6 * A; cy /= 6 * A; }
  const c = [cx, cy];
  if (G.insidePoly(pts, c)) return c;
  // yatay tarama: orta yükseklikte en geniş iç aralığın ortası
  const ys = pts.map((p) => p[1]), y = (Math.min(...ys) + Math.max(...ys)) / 2, xs = [];
  for (let i = 0; i < pts.length; i++) { const a = pts[i], b = pts[(i + 1) % pts.length]; if ((a[1] > y) !== (b[1] > y)) xs.push(a[0] + (y - a[1]) * (b[0] - a[0]) / (b[1] - a[1])); }
  xs.sort((p, q) => p - q); let best = c, w = -1;
  for (let i = 0; i + 1 < xs.length; i += 2) if (xs[i + 1] - xs[i] > w) { w = xs[i + 1] - xs[i]; best = [(xs[i] + xs[i + 1]) / 2, y]; }
  return best;
}
export function measure(pc) {
  const net = netPolygon(pc), cut = cutLine(pc).pts;
  if (net.length < 3) return null;
  const bx = (pts) => ({ x0: Math.min(...pts.map((p) => p[0])), y0: Math.min(...pts.map((p) => p[1])), x1: Math.max(...pts.map((p) => p[0])), y1: Math.max(...pts.map((p) => p[1])) });
  const nb = bx(net), cb = cut.length ? bx(cut) : nb;
  return {
    netArea: Math.abs(G.signedArea(net)), netPerimeter: G.length(pc.outline), cutArea: cut.length ? Math.abs(G.signedArea(cut)) : 0, cutPerimeter: cut.length ? G.perimeter(cut) : 0,
    width: nb.x1 - nb.x0, height: nb.y1 - nb.y0, box: nb, cutBox: cb,
    edges: G.edges(pc.outline).map((e) => ({ id: e.id, length: G.edgeLength(e), ...edgeProp(pc, e.id), allow: allowValue(pc, edgeProp(pc, e.id).kind) })),
  };
}
// kenar üzerindeki konum + dışa dönük normal
export function edgeFrame(pc, edgeId, at) {
  const e = G.edges(pc.outline).find((q) => q.id === edgeId); if (!e) return null;
  const { p, tan } = G.pointOnEdge(e, at), sg = orientSign(pc);
  const left = [-tan[1], tan[0]];       // algebraik sol normal: alan > 0 ise içe bakar
  const out = [-sg * left[0], -sg * left[1]];
  return { p, tan, out, edge: e, len: G.edgeLength(e) };
}
export function markPoint(pc, m) { if (m.edge) { const f = edgeFrame(pc, m.edge, m.at || 0); return f ? f.p : null; } return G.isP(m.p) ? m.p : null; }

/* ---------- ölçü çizgisi → basit öğeler ---------- */
export function dimItems(a, b, off, text, layer = 'olcu', h = 2.5) {
  const d = C.sub(b, a), L = Math.hypot(d[0], d[1]); if (L < 1e-6) return [];
  const u = [d[0] / L, d[1] / L], n = [-u[1], u[0]], A = C.add(a, C.mul(n, off)), B = C.add(b, C.mul(n, off));
  const ext = (p, q) => ({ layer, t: 'poly', pts: [C.add(p, C.mul(n, Math.sign(off) * 1)), C.add(q, C.mul(n, Math.sign(off) * 2))], closed: false });
  const ar = (p, dir) => ({ layer, t: 'poly', pts: [C.add(C.add(p, C.mul(u, 2.5 * dir)), C.mul(n, 0.8)), p, C.add(C.add(p, C.mul(u, 2.5 * dir)), C.mul(n, -0.8))], closed: false });
  let ang = Math.atan2(u[1], u[0]); if (ang > Math.PI / 2 + 1e-9) ang -= Math.PI; if (ang < -Math.PI / 2 - 1e-9) ang += Math.PI;
  const mid = C.add(C.mul(C.add(A, B), 0.5), C.mul(n, Math.sign(off || 1) * 1.2));
  return [ext(a, A), ext(b, B), { layer, t: 'poly', pts: [A, B], closed: false }, ar(A, 1), ar(B, -1), { layer, t: 'text', p: mid, s: text ?? fmt(L), h, ang, align: 'c' }];
}

/* ---------- parça çizim listesi ---------- */
export function pieceItems(pc, project = null, { labels = true } = {}) {
  const items = [], id = pc.id, push = (o) => items.push({ piece: id, ...o });
  const np = pc.outline;
  if (np.nodes.length < 2) return items;
  if (!np.closed || np.nodes.length < 3) { push({ layer: 'net', t: 'path', path: G.toCurve(np) }); return items; }
  const sg = orientSign(pc), E = G.edges(np), cut = cutLine(pc);
  // A) kesim, net
  if (cut.pts.length > 2) push({ layer: 'kesim', t: 'poly', pts: cut.pts, closed: true });
  push({ layer: 'net', t: 'path', path: G.toCurve(np) });
  for (const e of E) {
    const pr = edgeProp(pc, e.id), a = allowValue(pc, pr.kind);
    // C) binme, montaj, katlama: kenarın net çizgisi (pay > 0 iken kesimden ayrı görünür)
    const lay = pr.kind === 'binme' ? 'binme' : pr.kind === 'montaj' ? 'montaj' : pr.kind === 'katlama' ? 'katlama' : null;
    if (lay && a > 0) push({ layer: lay, t: 'path', path: e.path, edge: e.id });
    // B) dikiş çizgisi: net çizgiden içeri dist (çok sıra: + gap)
    if (pr.stitch.on) {
      const base = C.flatten(e.path, TOL);
      for (let r = 0; r < pr.stitch.rows; r++) {
        const d = pr.stitch.dist + r * pr.stitch.gap;
        let pts = G.offsetOpen(base, sg * d);
        pts = G.trimPolyline(pts, pr.stitch.from, pr.stitch.to);
        if (pts.length > 1) push({ layer: 'dikis', t: 'poly', pts, closed: false, edge: e.id });
      }
    }
    // pay etiketi (kenar ortasında, pay bandının içinde)
    if (labels && a > 0) {
      const L = G.edgeLength(e), f = edgeFrame(pc, e.id, L / 2);
      if (f && L > 25) {
        let ang = Math.atan2(f.tan[1], f.tan[0]); if (ang > Math.PI / 2) ang -= Math.PI; if (ang < -Math.PI / 2) ang += Math.PI;
        push({ layer: 'yazi', t: 'text', p: C.add(f.p, C.mul(f.out, a / 2 + 0.6)), s: ALLOW[pr.kind].name.split(' ')[0] + ' ' + fmt(a, a % 1 ? 1 : 0), h: Math.min(2, Math.max(1.2, a * 0.45)), ang, align: 'c' });
      }
    }
  }
  // D, E, H, I) işaretler
  for (const m of pc.marks) {
    const lay = MARK_KINDS[m.kind]?.layer || 'referans';
    if (m.kind === 'centik') {
      const f = m.edge ? edgeFrame(pc, m.edge, m.at || 0) : null; if (!f) continue;
      const a = allowValue(pc, edgeProp(pc, m.edge).kind), depth = Math.max(1, m.depth || 3), tip = C.add(f.p, C.mul(f.out, a));
      if (m.shape === 'V') push({ layer: lay, t: 'poly', pts: [C.add(tip, C.mul(f.tan, -1)), C.add(tip, C.mul(f.out, -Math.min(2, depth))), C.add(tip, C.mul(f.tan, 1))], closed: false, mark: m.id });
      else push({ layer: lay, t: 'poly', pts: [tip, C.add(tip, C.mul(f.out, -depth))], closed: false, mark: m.id });
      if (m.label && labels) push({ layer: 'centik', t: 'text', p: C.add(f.p, C.mul(f.out, -depth - 2.2)), s: m.label, h: 2, ang: 0, align: 'c' });
      continue;
    }
    const p = markPoint(pc, m); if (!p) continue;
    if (m.kind === 'binme') {
      push({ layer: lay, t: 'circle', c: p, r: Math.max(0.3, (m.d || 1.2) / 2), mark: m.id });
      push({ layer: lay, t: 'poly', pts: [[p[0] - 1.6, p[1]], [p[0] + 1.6, p[1]]], closed: false });
      push({ layer: lay, t: 'poly', pts: [[p[0], p[1] - 1.6], [p[0], p[1] + 1.6]], closed: false });
    } else if (m.kind === 'delik' || m.kind === 'aksesuar') {
      const r = Math.max(0.25, (m.d || 3) / 2);
      push({ layer: lay, t: 'circle', c: p, r, mark: m.id });
      if (m.kind === 'aksesuar') push({ layer: lay, t: 'poly', pts: [[p[0] - r - 1, p[1] - r - 1], [p[0] + r + 1, p[1] - r - 1], [p[0] + r + 1, p[1] + r + 1], [p[0] - r - 1, p[1] + r + 1]], closed: true });
      push({ layer: lay, t: 'poly', pts: [[p[0] - r - 1.5, p[1]], [p[0] + r + 1.5, p[1]]], closed: false });
      push({ layer: lay, t: 'poly', pts: [[p[0], p[1] - r - 1.5], [p[0], p[1] + r + 1.5]], closed: false });
    } else {
      push({ layer: lay, t: 'circle', c: p, r: 0.8, mark: m.id });
      push({ layer: lay, t: 'poly', pts: [[p[0] - 2.5, p[1]], [p[0] + 2.5, p[1]]], closed: false });
      push({ layer: lay, t: 'poly', pts: [[p[0], p[1] - 2.5], [p[0], p[1] + 2.5]], closed: false });
    }
    if (m.label && labels) push({ layer: lay, t: 'text', p: [p[0] + 3, p[1] - 2.5], s: m.label, h: 2, ang: 0, align: 'l' });
  }
  // F, G) iç çizgiler
  for (const l of pc.lines) { if (l.path?.nodes?.length > 1) push({ layer: LINE_KINDS[l.kind]?.layer || 'yardimci', t: 'path', path: G.toCurve(l.path), line: l.id }); }
  // esneme yönü oku (kampre altyapısı verisi)
  const net = netPolygon(pc), lp = net.length > 2 ? labelPoint(net) : null;
  const yon = pc.forming?.esneme?.yonDeg;
  if (lp && Number.isFinite(yon)) {
    const a = yon * Math.PI / 180, u = [Math.cos(a), -Math.sin(a)]   // 0° sağ, 90° yukarı (ölçüyle çizimle aynı), q0 = C.add(lp, C.mul(u, -18)), q1 = C.add(lp, C.mul(u, 18));
    const hd = (q, s) => [C.add(q, C.add(C.mul(u, -3 * s), C.mul([-u[1], u[0]], 1.5))), q, C.add(q, C.add(C.mul(u, -3 * s), C.mul([-u[1], u[0]], -1.5)))];
    push({ layer: 'referans', t: 'poly', pts: [q0, q1], closed: false });
    push({ layer: 'referans', t: 'poly', pts: hd(q1, 1), closed: false }); push({ layer: 'referans', t: 'poly', pts: hd(q0, -1), closed: false });
    if (labels) push({ layer: 'referans', t: 'text', p: C.add(q1, C.mul([-u[1], u[0]], -2.5)), s: 'esneme', h: 1.8, ang: 0, align: 'l' });
  }
  // J) ölçüler: otomatik (net en / boy) + kullanıcı ölçüleri
  if (pc.autoDims && net.length > 2) {
    const m = measure(pc), cb = m.cutBox, b = m.box;
    for (const it of dimItems([b.x0, b.y0], [b.x1, b.y0], -(b.y0 - cb.y0 + 6), fmt(m.width))) push(it);
    for (const it of dimItems([b.x0, b.y1], [b.x0, b.y0], -(b.x0 - cb.x0 + 6), fmt(m.height))) push(it);
  }
  for (const d of pc.dims) if (G.isP(d.a) && G.isP(d.b)) for (const it of dimItems(d.a, d.b, d.off ?? 6, d.text || null)) push(it);
  // K) parça numarası ve açıklama
  if (labels && lp) {
    const mat = project?.materials?.find((x) => x.id === pc.material) || null;
    const lines = ['#' + pc.no + ' ' + pc.name, [pc.code, SIDES[pc.side], '×' + pc.qty].filter(Boolean).join(' · '), mat ? mat.name : ''].filter(Boolean);
    lines.forEach((s, i) => push({ layer: 'yazi', t: 'text', p: [lp[0], lp[1] + (i - (lines.length - 1) / 2) * 5], s, h: i ? 2.5 : 3.5, ang: 0, align: 'c' }));
  }
  for (const t of pc.texts) if (G.isP(t.p) && t.s) push({ layer: 'yazi', t: 'text', p: t.p, s: String(t.s).slice(0, 120), h: t.h || 2.5, ang: 0, align: 'l' });
  return items;
}
export function sketchItems(project) { return project.sketch.paths.filter((np) => np.nodes.length > 1).map((np) => ({ layer: 'yardimci', t: 'path', path: G.toCurve(np), sketch: np.id })); }
export function projectItems(project, { pieces = null, sketch = true, labels = true } = {}) {
  const out = sketch ? sketchItems(project) : [];
  for (const pc of project.pieces) if (!pieces || pieces.includes(pc.id)) out.push(...pieceItems(pc, project, { labels }));
  return out;
}
export const visibleItems = (project, items) => items.filter((it) => project.layers[it.layer]?.visible !== false);

// öğe sınır kutusu (metin kabaca: h × 0,6 × harf)
export function itemsBox(items) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const add = (p) => { x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]); x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]); };
  for (const it of items) {
    if (it.t === 'poly') it.pts.forEach(add);
    else if (it.t === 'path') { if (it.path.segs.length) { const b = C.bbox(it.path); add([b.x0, b.y0]); add([b.x1, b.y1]); } }
    else if (it.t === 'circle') { add([it.c[0] - it.r, it.c[1] - it.r]); add([it.c[0] + it.r, it.c[1] + it.r]); }
    else if (it.t === 'text') { const w = it.h * 0.6 * String(it.s).length, dx = it.align === 'c' ? w / 2 : 0; add([it.p[0] - dx, it.p[1] - it.h]); add([it.p[0] - dx + w, it.p[1] + it.h * 0.3]); }
  }
  return Number.isFinite(x0) ? { x0, y0, x1, y1 } : null;
}

/* ---------- parça kontrolü ---------- */
export function checkPiece(pc) {
  const out = [], np = pc.outline, add = (level, msg) => out.push({ level, msg, piece: pc.id });
  if (!np.closed) { add('hata', 'Parça sınırı kapalı değil'); return out; }
  if (np.nodes.length < 3) { add('hata', 'Parçada en az 3 nokta olmalı'); return out; }
  const net = netPolygon(pc), A = Math.abs(G.signedArea(net));
  if (A < 1) { add('hata', 'Parça alanı sıfıra yakın'); return out; }
  for (let k = 0; k < G.segCount(np); k++) if (C.segLength(G.seg(np, k)) < 0.05) add('uyarı', `Çok kısa segment (${k + 1}. nokta): üst üste nokta olabilir`);
  if (selfIntersections(net, 5).length) add('hata', 'Net çizgi kendini kesiyor');
  const cut = cutLine(pc);
  for (const i of cut.issues) add('uyarı', 'Kesim çizgisi: ' + i.msg);
  if (cut.pts.length > 2 && selfIntersections(cut.pts, 5).length) add('hata', 'Kesim (pay) çizgisi kendini kesiyor: pay, eğri yarıçapından büyük olabilir');
  if (cut.pts.length > 2 && Math.abs(G.signedArea(cut.pts)) + 1e-6 < A) add('hata', 'Kesim alanı net alandan küçük çıktı (geometri hatası)');
  for (const e of G.edges(np)) {
    const pr = edgeProp(pc, e.id);
    if (pr.stitch.on && pr.stitch.dist + (pr.stitch.rows - 1) * pr.stitch.gap <= 0) add('uyarı', 'Dikiş çizgisi net çizginin üzerinde (mesafe 0)');
    if (G.edgeLength(e) < 1) add('uyarı', 'Çok kısa kenar');
  }
  for (const m of pc.marks) {
    if (m.edge) { const e = G.edges(np).find((q) => q.id === m.edge); if (!e) add('hata', `${MARK_KINDS[m.kind]?.name || 'İşaret'} artık olmayan bir kenarda`); else if ((m.at ?? 0) < 0 || m.at > G.edgeLength(e) + 1e-6) add('uyarı', `${MARK_KINDS[m.kind]?.name} kenarın dışında`); continue; }
    const p = markPoint(pc, m); if (!p) { add('hata', 'Konumsuz işaret'); continue; }
    if ((m.kind === 'delik' || m.kind === 'aksesuar') && !G.insidePoly(net, p)) add('uyarı', `${MARK_KINDS[m.kind].name} parçanın dışında`);
  }
  if (!pc.material) add('uyarı', 'Malzeme seçilmedi');
  return out;
}
