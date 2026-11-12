// Teknik moda çizimi — saf veri modeli (DOM yok). Birim mm, y aşağı doğru (ekran / SVG düzeni),
// x = 0 ön / arka orta çizgisi (simetri ekseni).
// Bir çizim (sketch): görünüşler (ön, arka, yan) → katmanlar → varlıklar.
// Varlıklar: path (yol), point (nokta), dim (ölçü), text (açıklama), detail (kütüphane detayı).
// sym: true olan yol / detay x = 0'a göre aynalanmış kopyasıyla birlikte çizilir (tam simetri).
import * as C from './curve.js?v=20261112k';

export const VIEWS = { front: 'Ön', back: 'Arka', side: 'Yan' };
export const STROKES = { solid: 'Düz', stitch: 'Dikiş (kesik)', dot: 'Noktalı', fold: 'Katlama (çizgi-nokta)' };
export const DASH = { solid: null, stitch: [2.5, 1.5], dot: [0.4, 1.2], fold: [6, 1.5, 0.8, 1.5] };   // mm
const isP = (p) => Array.isArray(p) && p.length === 2 && Number.isFinite(p[0]) && Number.isFinite(p[1]);
const clone = (o) => JSON.parse(JSON.stringify(o));

/* ---------- oluşturma ---------- */
export function createSketch({ id, name = 'Teknik çizim', product = null, branch = 'woven' } = {}) {
  const views = {};
  for (const v of Object.keys(VIEWS)) views[v] = { layers: [{ id: 'L1', name: 'Çizim', visible: true, locked: false, ents: [] }] };
  return { id: id || 'k' + Date.now().toString(36), name, product, branch, views, nextE: 1, nextL: 2, template: null };
}
export function addEnt(sk, view, ent, layerId) {
  const V = sk.views[view]; if (!V) throw new Error('Görünüş yok: ' + view);
  const L = V.layers.find((l) => l.id === layerId) || V.layers.find((l) => !l.locked && l.visible && l.name !== 'Şablon') || V.layers.find((l) => !l.locked && l.visible) || V.layers[0];
  if (L.locked) throw new Error('Katman kilitli: ' + L.name);
  const e = { id: 'e' + sk.nextE++, ...ent };
  L.ents.push(e); return e;
}
export function addLayer(sk, view, name) {
  const L = { id: 'L' + sk.nextL++, name: name || 'Katman ' + (sk.nextL - 1), visible: true, locked: false, ents: [] };
  sk.views[view].layers.push(L); return L;
}
export function findEnt(sk, view, id) {
  for (const L of sk.views[view].layers) { const i = L.ents.findIndex((e) => e.id === id); if (i >= 0) return { L, i, e: L.ents[i] }; }
  return null;
}
export function removeEnt(sk, view, id) { const f = findEnt(sk, view, id); if (f) f.L.ents.splice(f.i, 1); return !!f; }
export function moveToLayer(sk, view, id, layerId) {
  const f = findEnt(sk, view, id), L = sk.views[view].layers.find((l) => l.id === layerId);
  if (!f || !L) return false; f.L.ents.splice(f.i, 1); L.ents.push(f.e); return true;
}

/* ---------- detay kütüphanesi (yerel koordinat, mm) ---------- */
const P = C.polyPath, S = C.smoothPath, cub = C.cubic, ln = C.line;
const asPath = (x) => (x && x.segs ? x : { closed: false, segs: [x] });   // tek segment de kabul edilir
const seg = (path, stroke = 'solid') => ({ path: asPath(path), stroke });
const rect = (x0, y0, x1, y1) => P([[x0, y0], [x1, y0], [x1, y1], [x0, y1]], true);
export const DETAILS = {
  dugme: { label: 'Düğme (Ø 11 mm)', group: 'Kapama', build: () => [seg(C.circlePath([0, 0], 5.5)), ...[[-1.5, -1.5], [1.5, -1.5], [-1.5, 1.5], [1.5, 1.5]].map((c) => seg(C.circlePath(c, 0.6)))] },
  fermuar: { label: 'Fermuar (300 mm)', group: 'Kapama', build: (L = 300) => [seg(P([[-4, 0], [4, 0], [4, L], [-4, L]], true)), seg(P([[0, 0], [0, L]]), 'dot'), seg(P([[-3, -2], [3, -2], [3, 14], [-3, 14]], true)), seg(P([[-9, 0], [-9, L + 4], [9, L + 4], [9, 0]]), 'stitch')] },
  pat: { label: 'Düğme patı (30 mm)', group: 'Kapama', build: (L = 400) => [seg(P([[-15, 0], [-15, L]])), seg(P([[15, 0], [15, L]])), seg(P([[-12, 0], [-12, L]]), 'stitch'), seg(P([[12, 0], [12, L]]), 'stitch')] },
  'yaka-gomlek': { label: 'Gömlek yakası', group: 'Yaka', build: () => {
    const half = [cub([0, 0], [30, -6], [60, -14], [80, -20]), ln([80, -20], [92, 10]), cub([92, 10], [70, 40], [40, 62], [8, 78])];
    const r = { closed: false, segs: half }, l = C.reverse(C.mirrorX(r));
    return [seg(r), seg(l), seg(cub([0, -12], [30, -18], [62, -26], [80, -32])), seg(C.mirrorX({ closed: false, segs: [cub([0, -12], [30, -18], [62, -26], [80, -32])] })), seg(C.translate(r, 0, -4), 'stitch'), seg(C.translate(l, 0, -4), 'stitch')];
  } },
  'yaka-polo': { label: 'Polo yaka + pat', group: 'Yaka', build: () => {
    const r = { closed: false, segs: [cub([0, 0], [30, -4], [60, -10], [78, -16]), ln([78, -16], [86, 18]), cub([86, 18], [60, 30], [30, 36], [16, 40])] };
    return [seg(r), seg(C.mirrorX(r)), seg(P([[-16, 40], [-16, 150], [16, 150], [16, 40]])), seg(C.circlePath([0, 70], 5)), seg(C.circlePath([0, 115], 5))];
  } },
  'yaka-bisiklet': { label: 'Bisiklet yaka ribana', group: 'Yaka', build: () => {
    const o = { closed: false, segs: [cub([0, 80], [45, 80], [80, 45], [80, 0])] }, i = { closed: false, segs: [cub([0, 64], [36, 64], [64, 36], [64, 0])] };
    return [seg(o), seg(C.mirrorX(o)), seg(i), seg(C.mirrorX(i))];
  } },
  'yaka-v': { label: 'V yaka ribana', group: 'Yaka', build: () => [seg(P([[-80, 0], [0, 200], [80, 0]])), seg(P([[-62, 0], [0, 172], [62, 0]]))] },
  'kol-manset': { label: 'Manşet (60 mm)', group: 'Kol', build: (w = 120) => [seg(rect(0, 0, w, 60)), seg(C.circlePath([w - 16, 30], 5)), seg(P([[0, 6], [w, 6]]), 'stitch')] },
  'cep-yama': { label: 'Yama cep 140×160', group: 'Cep', build: () => [seg(rect(-70, 0, 70, 160)), seg(P([[-66, 0], [-66, 156], [66, 156], [66, 0]]), 'stitch'), seg(P([[-70, 24], [70, 24]]), 'stitch')] },
  'cep-gogus': { label: 'Göğüs cebi (sivri)', group: 'Cep', build: () => [seg(P([[-55, 0], [55, 0], [55, 110], [0, 130], [-55, 110]], true)), seg(P([[-51, 0], [-51, 107], [0, 125], [51, 107], [51, 0]]), 'stitch')] },
  'cep-kapakli': { label: 'Kapaklı cep', group: 'Cep', build: () => [seg(rect(-70, 0, 70, 50)), seg(P([[-66, 4], [-66, 46], [66, 46], [66, 4]]), 'stitch'), seg(P([[-70, 6], [-70, 170], [70, 170], [70, 6]])), seg(C.circlePath([0, 34], 5))] },
  'cep-kaynak': { label: 'Kaynak (fileto) cep', group: 'Cep', build: () => [seg(rect(-70, 0, 70, 12)), seg(P([[-70, 6], [70, 6]]))] },
  'kemer-gozu': { label: 'Kemer köprüsü', group: 'Bel', build: () => [seg(rect(-5, 0, 5, 50)), seg(P([[-5, 4], [5, 4]]), 'stitch'), seg(P([[-5, 46], [5, 46]]), 'stitch')] },
  ribana: { label: 'Ribana bandı 200×60', group: 'Triko', build: (w = 200, h = 60, pitch = 8) => [seg(rect(0, 0, w, h)), ...Array.from({ length: Math.floor(w / pitch) - 1 }, (_, k) => seg(P([[(k + 1) * pitch, 3], [(k + 1) * pitch, h - 3]]), 'dot'))] },
  'sac-orgusu': { label: 'Saç örgüsü işareti (60 mm)', group: 'Triko', build: (h = 240) => {
    const out = [seg(P([[-30, 0], [-30, h]])), seg(P([[30, 0], [30, h]]))];
    for (let y = 0; y + 60 <= h; y += 60) { out.push(seg({ closed: false, segs: [cub([-20, y], [-20, y + 30], [20, y + 30], [20, y + 60])] })); out.push(seg({ closed: false, segs: [cub([20, y], [20, y + 26], [6, y + 30], [3, y + 32])] })); out.push(seg({ closed: false, segs: [cub([-3, y + 28], [-6, y + 30], [-20, y + 34], [-20, y + 60])] })); }
    return out;
  } },
};
// detay örneğinin dünya yollarını üret (konum p, açı rot (derece), ölçek k)
function detailPaths(e) {
  const D = DETAILS[e.kind]; if (!D) return [];
  const a = (e.rot || 0) * Math.PI / 180, k = e.k || 1;
  return D.build(...(e.args || [])).map((s) => ({ path: C.translate(C.rotateScale(s.path, a, k), e.p[0], e.p[1]), stroke: s.stroke }));
}

/* ---------- varlık geometrisi ---------- */
// Çizilecek yollar (dünya koordinatı). sym → aynalanmış kopya da döner.
export function entityPaths(e) {
  let out = [];
  if (e.t === 'path') out = [{ path: e.path, stroke: e.stroke || 'solid', w: e.w }];
  else if (e.t === 'detail') out = detailPaths(e).map((s) => ({ ...s, w: e.w }));
  else return [];
  if (e.sym) out = out.concat(out.map((s) => ({ ...s, path: C.mirrorX(s.path) })));
  return out;
}
export function dimGeom(e) {
  const d = C.sub(e.b, e.a), L = Math.hypot(d[0], d[1]) || 1e-9, n = [-d[1] / L, d[0] / L], o = e.off || 0;
  const A = C.add(e.a, C.mul(n, o)), B = C.add(e.b, C.mul(n, o));
  return { A, B, L, n, mid: C.mul(C.add(A, B), 0.5), ang: Math.atan2(d[1], d[0]) };
}
export const fmtCm = (mm) => (mm / 10).toFixed(1).replace('.', ',');
export const dimText = (e) => (e.label ? e.label + ' ' : '') + fmtCm(dimGeom(e).L) + ' cm';
export function entBBox(e) {
  const pts = [];
  for (const s of entityPaths(e)) { const b = C.bbox(s.path); pts.push([b.x0, b.y0], [b.x1, b.y1]); }
  if (e.t === 'point') pts.push(e.p);
  if (e.t === 'dim') { const g = dimGeom(e); pts.push(e.a, e.b, g.A, g.B); }
  if (e.t === 'text') { const h = e.size || 5, w = String(e.text).length * h * 0.55; pts.push(e.p, [e.p[0] + w, e.p[1] - h]); if (e.leader) pts.push(e.leader); }
  if (!pts.length) return null;
  return { x0: Math.min(...pts.map((p) => p[0])), y0: Math.min(...pts.map((p) => p[1])), x1: Math.max(...pts.map((p) => p[0])), y1: Math.max(...pts.map((p) => p[1])) };
}
export function viewBBox(sk, view, onlyVisible = true) {
  let b = null;
  for (const L of sk.views[view].layers) {
    if (onlyVisible && !L.visible) continue;
    for (const e of L.ents) { const q = entBBox(e); if (!q) continue; b = b ? { x0: Math.min(b.x0, q.x0), y0: Math.min(b.y0, q.y0), x1: Math.max(b.x1, q.x1), y1: Math.max(b.y1, q.y1) } : q; }
  }
  return b;
}
// varlığı kaydır
export function translateEnt(e, dx, dy) {
  const T = (p) => [p[0] + dx, p[1] + dy];
  if (e.t === 'path') e.path = C.translate(e.path, dx, dy);
  if (e.t === 'point' || e.t === 'detail') e.p = T(e.p);
  if (e.t === 'text') { e.p = T(e.p); if (e.leader) e.leader = T(e.leader); }
  if (e.t === 'dim') { e.a = T(e.a); e.b = T(e.b); }
  return e;
}
// kutu merkezinde döndür (derece)
export function rotateEnt(e, deg) {
  const b = entBBox(e); if (!b) return e;
  const c = [(b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2], a = deg * Math.PI / 180;
  const R = (p) => { const x = p[0] - c[0], y = p[1] - c[1]; return [c[0] + x * Math.cos(a) - y * Math.sin(a), c[1] + x * Math.sin(a) + y * Math.cos(a)]; };
  if (e.t === 'path') e.path = C.mapPath(e.path, R);
  if (e.t === 'detail') { e.p = R(e.p); e.rot = ((e.rot || 0) + deg) % 360; }
  if (e.t === 'dim') { e.a = R(e.a); e.b = R(e.b); }
  if (e.t === 'point' || e.t === 'text') e.p = R(e.p);
  return e;
}
// Aynala: x = 0'a göre kopya üretir (sym bayrağı yerine kalıcı kopya isteyenler için)
export function mirroredCopy(e) {
  const m = clone(e); delete m.id;
  const M = (p) => [-p[0], p[1]];
  if (m.t === 'path') m.path = C.mirrorX(m.path);
  if (m.t === 'detail') { m.p = M(m.p); m.rot = -(m.rot || 0); }
  if (m.t === 'dim') { m.a = M(m.a); m.b = M(m.b); m.off = -(m.off || 0); }
  if (m.t === 'point' || m.t === 'text') m.p = M(m.p);
  if (m.t === 'text' && m.leader) m.leader = M(m.leader);
  return m;
}
// Hizala: seçili varlıkların kutularını ortak kutuya göre hizala.
// mode: left | right | hcenter | top | bottom | vmiddle | axis (x = 0 eksenine ortala)
export function align(ents, mode) {
  const bs = ents.map(entBBox), all = bs.filter(Boolean);
  if (!all.length) return;
  const U = { x0: Math.min(...all.map((b) => b.x0)), x1: Math.max(...all.map((b) => b.x1)), y0: Math.min(...all.map((b) => b.y0)), y1: Math.max(...all.map((b) => b.y1)) };
  ents.forEach((e, i) => {
    const b = bs[i]; if (!b) return;
    const dx = { left: U.x0 - b.x0, right: U.x1 - b.x1, hcenter: (U.x0 + U.x1) / 2 - (b.x0 + b.x1) / 2, axis: -(b.x0 + b.x1) / 2 }[mode] ?? 0;
    const dy = { top: U.y0 - b.y0, bottom: U.y1 - b.y1, vmiddle: (U.y0 + U.y1) / 2 - (b.y0 + b.y1) / 2 }[mode] ?? 0;
    translateEnt(e, dx, dy);
  });
}

/* ---------- isabet ve yakalama ---------- */
function polyDist(pts, p) {
  let d = Infinity;
  for (let i = 0; i < pts.length - 1; i++) d = Math.min(d, C.nearest({ segs: [C.line(pts[i], pts[i + 1])] }, p).d);
  return d;
}
export function hitTest(sk, view, p, tol) {
  let best = null;
  for (const L of sk.views[view].layers) {
    if (!L.visible || L.locked) continue;
    for (const e of L.ents) {
      let d = Infinity;
      for (const s of entityPaths(e)) { const pts = C.flatten(s.path, tol / 4); d = Math.min(d, pts.length > 1 ? polyDist(pts, p) : Infinity); if (s.path.closed && C.flatten(s.path, tol / 4).length > 2 && insidePoly(C.flatten(s.path, tol / 4), p) && e.t === 'detail') d = 0; }
      if (e.t === 'point') d = C.dist(e.p, p);
      if (e.t === 'dim') { const g = dimGeom(e); d = Math.min(polyDist([g.A, g.B], p), C.dist(g.mid, p)); }
      if (e.t === 'text') { const b = entBBox(e); d = p[0] >= b.x0 - tol && p[0] <= b.x1 + tol && p[1] >= b.y0 - tol && p[1] <= b.y1 + tol ? 0 : Infinity; }
      if (d <= tol && (!best || d <= best.d)) best = { id: e.id, d, layer: L.id };
    }
  }
  return best;
}
function insidePoly(pts, p) { let c = false; for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) { const a = pts[i], b = pts[j]; if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < (b[0] - a[0]) * (p[1] - a[1]) / (b[1] - a[1]) + a[0]) c = !c; } return c; }
// yakalama noktaları: yol uçları / köşeleri (aynalı kopyalar dahil), nokta varlıkları, ölçü uçları
export function snapPoints(sk, view) {
  const out = [];
  for (const L of sk.views[view].layers) {
    if (!L.visible) continue;
    for (const e of L.ents) {
      if (e.t === 'path') { const pts = C.pathPoints(e.path); out.push(...pts); if (e.sym) out.push(...pts.map((q) => [-q[0], q[1]])); }
      if (e.t === 'point') out.push(e.p);
      if (e.t === 'dim') out.push(e.a, e.b);
    }
  }
  return out;
}
export function snap(sk, view, p, tol, grid = 0) {
  let best = null, bd = tol;
  for (const q of snapPoints(sk, view)) { const d = C.dist(p, q); if (d <= bd) { bd = d; best = q; } }
  if (Math.abs(p[0]) <= tol && !best) best = [0, p[1]];   // orta eksen
  if (best) return { p: [best[0], best[1]], snapped: true };
  if (grid > 0) return { p: [Math.round(p[0] / grid) * grid, Math.round(p[1] / grid) * grid], snapped: false };
  return { p, snapped: false };
}

/* ---------- doğrulama ---------- */
export function validateSketch(sk) {
  const out = [], E = (m) => out.push({ level: 'hata', where: 'Çizim ' + (sk?.name || ''), msg: m }), W = (m) => out.push({ level: 'uyarı', where: 'Çizim ' + (sk?.name || ''), msg: m });
  if (!sk || typeof sk !== 'object' || !sk.views) { E('Çizim verisi yok'); return out; }
  const ids = new Set();
  for (const v of Object.keys(VIEWS)) {
    const V = sk.views[v]; if (!V || !Array.isArray(V.layers) || !V.layers.length) { E(VIEWS[v] + ' görünüşü eksik'); continue; }
    const lids = new Set();
    for (const L of V.layers) {
      if (lids.has(L.id)) E(VIEWS[v] + ': yinelenen katman ' + L.id); lids.add(L.id);
      for (const e of L.ents || []) {
        const w = VIEWS[v] + ' / ' + L.name + ' / ' + e.id + ': ';
        if (ids.has(e.id)) E(w + 'yinelenen kimlik'); ids.add(e.id);
        if (e.t === 'path') { if (!C.finitePath(e.path)) E(w + 'geçersiz koordinat'); else if (!e.path.segs.length) E(w + 'boş yol'); else if (C.pathLength(e.path) < 1e-6) W(w + 'sıfır uzunlukta yol'); if (e.stroke && !STROKES[e.stroke]) E(w + 'bilinmeyen çizgi türü'); }
        else if (e.t === 'point') { if (!isP(e.p)) E(w + 'geçersiz nokta'); }
        else if (e.t === 'dim') { if (!isP(e.a) || !isP(e.b) || !Number.isFinite(e.off || 0)) E(w + 'geçersiz ölçü'); else if (C.dist(e.a, e.b) < 1e-6) E(w + 'ölçünün iki ucu aynı'); }
        else if (e.t === 'text') { if (!isP(e.p)) E(w + 'geçersiz konum'); if (!String(e.text || '').trim()) W(w + 'boş açıklama'); if (!(e.size > 0)) E(w + 'yazı boyu geçersiz'); }
        else if (e.t === 'detail') { if (!DETAILS[e.kind]) E(w + 'bilinmeyen detay ' + e.kind); if (!isP(e.p) || !(e.k > 0) || !Number.isFinite(e.rot || 0)) E(w + 'geçersiz konum / ölçek'); }
        else E(w + 'bilinmeyen varlık türü ' + e.t);
      }
    }
  }
  if (sk.template) { for (const [k, v] of Object.entries(sk.template.params || {})) if (!(Number.isFinite(v) && v > 0)) E('Şablon ölçüsü geçersiz: ' + k); }
  return out;
}

/* ---------- şablonlar ---------- */
// Parametreler mm. Ölçüler düz serilmiş giysinin ölçüleridir (flat): "göğüs genişliği" koltuk altından koltuk altına.
const TOP_PARAMS = { chestW: ['Göğüs genişliği (koltuk altı – koltuk altı)', 530], length: ['Boy (omuz yüksek noktası – etek)', 700], shoulder: ['Omuz genişliği', 450], neckW: ['Yaka genişliği', 170], armhole: ['Kol oyuğu derinliği', 230], sleeve: ['Kol boyu (omuzdan)', 620], cuffW: ['Kol ağzı genişliği', 110], hemW: ['Etek genişliği', 530] };
const pick = (o, ks) => Object.fromEntries(ks.map((k) => [k, o[k]]));
function tp(def, over = {}) { const o = {}; for (const [k, [lbl, v]] of Object.entries(def)) o[k] = [lbl, over[k] ?? v]; return o; }

// Üst giysi gövdesi: sağ yarı açık yol (orta çizgide başlar, orta çizgide biter) + yardımcı noktalar
function topHalf(o, { neckDepth, sleeveAng, sleeve = true, vneck = false, curvedHem = 0, waist = null }) {
  const ch = o.chestW / 2, nw = o.neckW / 2, sh = o.shoulder / 2, drop = 40, A = [ch, o.armhole], L = o.length, hh = (o.hemW || o.chestW) / 2;
  const segs = [];
  segs.push(vneck ? C.line([0, neckDepth], [nw, 0]) : C.cubic([0, neckDepth], [nw * 0.6, neckDepth], [nw, neckDepth * 0.45], [nw, 0]));
  const S = [sh, drop]; segs.push(C.line([nw, 0], S));
  let O = null, I = null, d = null;
  if (sleeve) {
    const a = sleeveAng * Math.PI / 180; d = [Math.cos(a), Math.sin(a)];
    const n = [-Math.sin(a), Math.cos(a)];
    O = C.add(S, C.mul(d, o.sleeve)); I = C.add(O, C.mul(n, o.cuffW));
    segs.push(C.line(S, O), C.line(O, I), C.line(I, A));
  } else segs.push(C.cubic(S, [sh - 8, drop + 90], [ch - 45, o.armhole], A));
  if (waist) {
    const W = [waist.half, waist.y];
    segs.push(C.cubic(A, [ch, A[1] + 60], [W[0], W[1] - 80], W));
    segs.push(C.cubic(W, [W[0], W[1] + 70], [hh, L - (L - W[1]) * 0.5], [hh, L - curvedHem]));
  } else segs.push(C.line(A, [hh, L - curvedHem]));
  segs.push(curvedHem ? C.cubic([hh, L - curvedHem], [hh * 0.6, L - curvedHem], [hh * 0.3, L], [0, L]) : C.line([hh, L], [0, L]));
  return { path: { closed: false, segs }, S, A, O, I, d, ch, nw, hh, L };
}
const pth = (path, stroke = 'solid', sym = true) => ({ t: 'path', path: asPath(path), stroke, sym });
const det = (kind, p, o = {}) => ({ t: 'detail', kind, p, rot: 0, k: 1, sym: false, ...o });
const dimH = (y, half, label, off = 0) => ({ t: 'dim', a: [-half, y], b: [half, y], off, label });
// kol ucu paralel çizgisi (kol ağzı içerisi)
const cuffLine = (h, inset) => ({ closed: false, segs: [C.line(C.sub(h.O, C.mul(h.d, inset)), C.sub(h.I, C.mul(h.d, inset)))] });
// ribana çizgileri (sağ yarı): yatay bant y0..y1, x 0..xr
function ribLines(y0, y1, xr, pitch = 8) { const out = []; for (let x = pitch / 2; x < xr - 2; x += pitch) out.push(pth(C.polyPath([[x, y0 + 2], [x, y1 - 2]]), 'dot')); return out; }

function buildTop(o, cfg) {
  const F = topHalf(o, { ...cfg, neckDepth: cfg.vneck ? cfg.vDepth || 200 : cfg.frontNeck ?? 85 });
  const B = topHalf(o, { ...cfg, vneck: false, neckDepth: 20 });
  const front = [pth(F.path)], back = [pth(B.path)];
  const hemY = F.L;
  if (cfg.rib) {
    // triko: etek, kol ağzı ve yaka ribanası
    const rh = cfg.ribH || 60;
    for (const [arr, H] of [[front, F], [back, B]]) {
      arr.push(pth(C.polyPath([[0, hemY - rh], [H.hh, hemY - rh]])), ...ribLines(hemY - rh, hemY, H.hh));
      if (H.O) arr.push(pth(cuffLine(H, rh)));
    }
    if (!cfg.vneck) front.push(pth({ closed: false, segs: [C.cubic([0, 85 + 22], [F.nw * 0.6 + 4, 85 + 22], [F.nw + 18, 85 * 0.45 + 6], [F.nw + 18, 40 * 18 / (o.shoulder / 2 - F.nw)])] }));
    else front.push(pth(C.polyPath([[0, (cfg.vDepth || 200) + 26], [F.nw + 18, 40 * 18 / (o.shoulder / 2 - F.nw)]])));   // ribana V açıklığın dışında
    back.push(pth({ closed: false, segs: [C.cubic([0, 42], [F.nw * 0.6, 42], [F.nw + 18, 22], [F.nw + 18, 40 * 18 / (o.shoulder / 2 - F.nw)])] }));
  } else {
    for (const [arr, H] of [[front, F], [back, B]]) {
      if (!cfg.curvedHem) arr.push(pth(C.polyPath([[0, hemY - 20], [H.hh, hemY - 20]]), 'stitch'));
      if (H.O && !cfg.cuff) arr.push(pth(cuffLine(H, 20), 'stitch'));
      if (H.O && cfg.cuff) arr.push(pth(cuffLine(H, 60)));
    }
    if (cfg.neckRib) { front.push(pth({ closed: false, segs: [C.cubic([0, 85 + 15], [F.nw * 0.6 + 3, 85 + 15], [F.nw + 12, 85 * 0.45 + 4], [F.nw + 12, 40 * 12 / (o.shoulder / 2 - F.nw)])] }, 'stitch')); back.push(pth({ closed: false, segs: [C.cubic([0, 35], [F.nw * 0.6, 35], [F.nw + 12, 18], [F.nw + 12, 40 * 12 / (o.shoulder / 2 - F.nw)])] }, 'stitch')); }
  }
  if (cfg.placket) {
    const y0 = cfg.vneck ? (cfg.vDepth || 200) : cfg.collar ? 78 : 85;
    front.push(pth(C.polyPath([[15, y0], [15, hemY - (cfg.curvedHem || 0)]]), 'stitch'));
    const n = cfg.buttons || 6, step = (hemY - (cfg.curvedHem || 0) - y0 - 60) / (n - 1);
    for (let k = 0; k < n; k++) front.push(det('dugme', [0, y0 + 25 + k * step]));
  }
  if (cfg.zip) { front.push(det('fermuar', [0, 60], { args: [hemY - 60 - (cfg.ribH && cfg.rib ? 0 : 0)] })); }
  if (cfg.collar === 'shirt') front.push(det('yaka-gomlek', [0, 0])), back.push(pth({ closed: false, segs: [C.cubic([0, -12], [30, -18], [62, -26], [80, -32])] }));
  if (cfg.collar === 'stand') { front.push(pth(C.polyPath([[0, 85], [0, 40], [F.nw + 10, -30], [F.nw, 0]]))); back.push(pth(C.polyPath([[0, 20], [0, -30], [F.nw + 10, -30]]))); }
  if (cfg.yoke) back.push(pth(C.polyPath([[0, 120], [o.chestW / 2 - 25, 120]]), 'stitch'));
  if (cfg.chestPocket) front.push(det('cep-gogus', [o.chestW / 4, 210]));
  if (cfg.patchPockets) front.push(det(cfg.patchPockets, [o.chestW / 4, hemY - 240], { sym: true }));
  if (cfg.weltChest) front.push(det('cep-kaynak', [-o.chestW / 4, 230]));
  if (cfg.lapel) {
    front.push(pth(C.polyPath([[0, 330], [F.nw + 5, 0]]))); front.push(pth(C.polyPath([[0, 330], [F.nw + 60, 140], [F.nw + 25, 120], [F.nw + 5, 0]])));
    front.push(pth(C.polyPath([[0, 330], [0, hemY]]), 'solid', false));
  }
  if (cfg.waistSeam) { front.push(pth(C.polyPath([[0, cfg.waistSeam.y], [cfg.waistSeam.half, cfg.waistSeam.y]]))); back.push(pth(C.polyPath([[0, cfg.waistSeam.y], [cfg.waistSeam.half, cfg.waistSeam.y]]))); }
  if (cfg.backZip) back.push(det('fermuar', [0, 20], { args: [cfg.backZip] }));
  // ölçüler (ön görünüş)
  front.push(dimH(o.armhole + 15, o.chestW / 2, 'Göğüs'));
  front.push({ t: 'dim', a: [o.neckW / 2, 0], b: [o.neckW / 2, o.length], off: -((o.hemW || o.chestW) / 2 - o.neckW / 2 + 40), label: 'Boy' });
  back.push(dimH(-50, o.shoulder / 2, 'Omuz'));
  return { front, back };
}

function buildBottom(o, kind) {
  const wh = o.waistW / 2, hh = o.hipW / 2, L = o.length;
  const front = [], back = [];
  if (kind === 'pantolon') {
    const rise = o.rise, legC = hh / 2 + 8, ho = legC + o.hemW / 2, hi = Math.max(6, legC - o.hemW / 2);
    const half = { closed: false, segs: [C.line([0, 0], [wh, 0]), C.cubic([wh, 0], [wh + 10, 80], [hh, 140], [hh, 200]), C.line([hh, 200], [ho, L]), C.line([ho, L], [hi, L]), C.cubic([hi, L], [hi - 2, L * 0.6], [10, rise + 60], [6, rise]), C.cubic([6, rise], [2, rise - 30], [0, rise - 60], [0, rise - 90]), C.line([0, rise - 90], [0, 0])] };
    front.push(pth(half), pth(C.polyPath([[0, 40], [wh + 3, 40]])), pth(C.polyPath([[ho - 2, L - 25], [hi + 1, L - 25]]), 'stitch'));
    front.push(pth({ closed: false, segs: [C.cubic([wh - 70, 40], [wh - 40, 120], [hh - 20, 170], [hh, 175])] }, 'stitch'));
    front.push(pth({ closed: false, segs: [C.line([-38, 40], [-38, rise - 110]), C.cubic([-38, rise - 110], [-38, rise - 80], [-20, rise - 70], [0, rise - 75])] }, 'stitch', false));
    front.push(det('kemer-gozu', [wh - 40, 0], { sym: true }), det('dugme', [0, 20]));
    back.push(pth(half), pth(C.polyPath([[0, 40], [wh + 3, 40]])), pth(C.polyPath([[0, 110], [hh - 2, 70]]), 'stitch'), det('cep-yama', [hh / 2, 120], { sym: true }), det('kemer-gozu', [wh - 40, 0], { sym: true }), det('kemer-gozu', [0, 0]));
    front.push(dimH(20, wh, 'Bel', -40), { t: 'dim', a: [ho, 200], b: [ho, L], off: -40, label: 'İç bacak dışı' }, { t: 'dim', a: [wh + 20, 0], b: [wh + 20, L], off: -(ho - wh + 30), label: 'Boy' });
  } else {
    const hm = o.hemW / 2;
    const half = { closed: false, segs: [C.line([0, 0], [wh, 0]), C.cubic([wh, 0], [wh + 10, 70], [hh, 130], [hh, 180]), C.line([hh, 180], [hm, L]), C.cubic([hm, L], [hm * 0.6, L + 8], [hm * 0.3, L + 10], [0, L + 10])] };
    front.push(pth(half), pth(C.polyPath([[0, 40], [wh + 3, 40]])), pth({ closed: false, segs: [C.cubic([hm, L - 25], [hm * 0.6, L - 17], [hm * 0.3, L - 15], [0, L - 15])] }, 'stitch'), pth(C.polyPath([[wh * 0.5, 40], [wh * 0.52, 140]])));
    back.push(pth(half), pth(C.polyPath([[0, 40], [wh + 3, 40]])), det('fermuar', [0, 40], { args: [180] }), pth(C.polyPath([[wh * 0.5, 40], [wh * 0.52, 150]])));
    front.push(dimH(20, wh, 'Bel', -40), dimH(180, hh, 'Basen', 0), dimH(L + 30, hm, 'Etek ucu', 0), { t: 'dim', a: [0, 0], b: [0, L + 10], off: -(hm + 60), label: 'Boy' });
  }
  return { front, back };
}

export const TEMPLATES = {
  tisort: { label: 'Tişört', branch: 'woven', params: tp(TOP_PARAMS, { sleeve: 200, cuffW: 170, length: 700 }), build: (o) => buildTop(o, { sleeveAng: 35, neckRib: true }) },
  gomlek: { label: 'Gömlek (uzun kol)', branch: 'woven', params: tp(TOP_PARAMS, { length: 760, neckW: 150, cuffW: 120 }), build: (o) => buildTop(o, { sleeveAng: 58, collar: 'shirt', placket: true, buttons: 7, cuff: true, yoke: true, chestPocket: true, curvedHem: 60, frontNeck: 78 }) },
  ceket: { label: 'Ceket', branch: 'woven', params: tp(TOP_PARAMS, { chestW: 560, length: 740, shoulder: 470, sleeve: 630, cuffW: 135 }), build: (o) => buildTop(o, { sleeveAng: 60, lapel: true, vneck: true, vDepth: 330, placket: false, patchPockets: 'cep-kapakli', weltChest: true }) },
  mont: { label: 'Mont', branch: 'woven', params: tp(TOP_PARAMS, { chestW: 600, length: 720, shoulder: 490, sleeve: 650, cuffW: 140, hemW: 580, neckW: 190 }), build: (o) => buildTop(o, { sleeveAng: 60, zip: true, collar: 'stand', patchPockets: 'cep-kaynak', rib: false, cuff: true }) },
  elbise: { label: 'Elbise', branch: 'woven', params: { ...tp(pick(TOP_PARAMS, ['chestW', 'shoulder', 'neckW', 'armhole']), { neckW: 190, shoulder: 380 }), waistW: ['Bel genişliği', 400], waistY: ['Bel yüksekliği (omuzdan)', 400], length: ['Boy (omuz yüksek noktası – etek)', 1000], hemW: ['Etek ucu genişliği', 760] }, build: (o) => buildTop(o, { sleeve: false, frontNeck: 120, waist: { half: o.waistW / 2, y: o.waistY }, waistSeam: { y: o.waistY, half: o.waistW / 2 }, backZip: 520 }) },
  pantolon: { label: 'Pantolon', branch: 'woven', params: { waistW: ['Bel genişliği', 400], hipW: ['Basen genişliği', 500], rise: ['Ön ağ (bel – ağ)', 270], length: ['Yan boy', 1040], hemW: ['Paça genişliği', 200] }, build: (o) => buildBottom(o, 'pantolon') },
  etek: { label: 'Etek', branch: 'woven', params: { waistW: ['Bel genişliği', 380], hipW: ['Basen genişliği', 490], length: ['Boy', 600], hemW: ['Etek ucu genişliği', 640] }, build: (o) => buildBottom(o, 'etek') },
  kazak: { label: 'Kazak (bisiklet yaka)', branch: 'knit', params: tp(TOP_PARAMS, { chestW: 560, length: 680, shoulder: 460, sleeve: 610, cuffW: 100, hemW: 520 }), build: (o) => buildTop(o, { sleeveAng: 60, rib: true }) },
  suveter: { label: 'Süveter (V yaka)', branch: 'knit', params: tp(TOP_PARAMS, { chestW: 560, length: 680, shoulder: 460, sleeve: 610, cuffW: 100, hemW: 520 }), build: (o) => buildTop(o, { sleeveAng: 60, rib: true, vneck: true, vDepth: 230 }) },
  hirka: { label: 'Hırka', branch: 'knit', params: tp(TOP_PARAMS, { chestW: 570, length: 690, shoulder: 460, sleeve: 610, cuffW: 100, hemW: 540 }), build: (o) => buildTop(o, { sleeveAng: 60, rib: true, vneck: true, vDepth: 260, placket: true, buttons: 5 }) },
  yelek: { label: 'Yelek (triko)', branch: 'knit', params: tp(pick(TOP_PARAMS, ['chestW', 'length', 'shoulder', 'neckW', 'armhole', 'hemW']), { chestW: 540, length: 640, shoulder: 400, armhole: 250, hemW: 510 }), build: (o) => buildTop(o, { sleeve: false, rib: true, vneck: true, vDepth: 240 }) },
  atki: { label: 'Atkı', branch: 'knit', params: { width: ['En', 300], length: ['Boy (saçak hariç)', 1600], fringe: ['Saçak boyu', 80] }, build: (o) => {
    const h = o.width / 2, f = [pth(C.polyPath([[0, 0], [h, 0], [h, o.length], [0, o.length]]))];
    for (let x = 6; x < h; x += 12) f.push(pth(C.polyPath([[x, o.length], [x, o.length + o.fringe]])), pth(C.polyPath([[x, 0], [x, -o.fringe]])));
    f.push(...ribLines(0, o.length, h, 10).map((e) => ({ ...e, stroke: 'dot' })));
    return { front: [...f, dimH(o.length / 2, h, 'En'), { t: 'dim', a: [h, 0], b: [h, o.length], off: -40, label: 'Boy' }], back: [] };
  } },
  bere: { label: 'Bere', branch: 'knit', params: { width: ['Düz genişlik', 220], height: ['Yükseklik (ribana dahil)', 250], ribH: ['Ribana yüksekliği', 70] }, build: (o) => {
    const h = o.width / 2, H = o.height, r = H - o.ribH;
    const crown = { closed: false, segs: [C.cubic([0, 0], [h * 0.7, 0], [h, r * 0.45], [h, r]), C.line([h, r], [h, H]), C.line([h, H], [0, H])] };
    const front = [pth(crown), pth(C.polyPath([[0, r], [h, r]])), ...ribLines(r, H, h), dimH(H + 25, h, 'Genişlik'), { t: 'dim', a: [h, 0], b: [h, H], off: -40, label: 'Yükseklik' }];
    return { front, back: [pth(crown), pth(C.polyPath([[0, r], [h, r]])), ...ribLines(r, H, h)] };
  } },
};
// beden tablosundan şablon ölçüsüne (çevre / 2 = düz genişlik) yaklaşık önerme; kullanıcı her zaman düzeltebilir
export function paramsFromSize(type, measures) {
  const T = TEMPLATES[type], o = {};
  for (const [k, [, v]] of Object.entries(T.params)) o[k] = v;
  const m = measures || {}, ease = { woven: 100, knit: 60 }[T.branch];
  if (m['Göğüs çevresi'] && 'chestW' in o) o.chestW = Math.round((m['Göğüs çevresi'] + ease) / 2);
  if (m['Bel çevresi'] && 'waistW' in o) o.waistW = Math.round((m['Bel çevresi'] + 20) / 2);
  if (m['Kalça çevresi'] && 'hipW' in o) o.hipW = Math.round((m['Kalça çevresi'] + 40) / 2);
  if ('hemW' in o && 'chestW' in o && !('waistW' in o)) o.hemW = Math.min(o.hemW, o.chestW);
  return o;
}
// şablonu çizime uygula: "Şablon" katmanı (değiştirilebilir) olarak ön ve arka görünüşe ekler
export function applyTemplate(sk, type, params) {
  const T = TEMPLATES[type]; if (!T) throw new Error('Bilinmeyen şablon: ' + type);
  const o = {}; for (const [k, [, v]] of Object.entries(T.params)) { const x = params?.[k] ?? v; if (!(Number.isFinite(x) && x > 0)) throw new Error(`${T.params[k][0]} geçersiz: ${x}`); o[k] = x; }
  const g = T.build(o);
  for (const [view, ents] of Object.entries({ front: g.front, back: g.back })) {
    const V = sk.views[view];
    V.layers = V.layers.filter((l) => l.name !== 'Şablon');
    const L = { id: 'L' + sk.nextL++, name: 'Şablon', visible: true, locked: false, ents: [] };
    V.layers.unshift(L);
    for (const e of ents) L.ents.push({ id: 'e' + sk.nextE++, w: e.t === 'path' && e.stroke === 'solid' ? 0.5 : 0.3, ...e });
  }
  sk.template = { type, params: o };
  return sk;
}
export function measureTable(sk) {
  const rows = [];
  if (sk.template) { const T = TEMPLATES[sk.template.type]; for (const [k, v] of Object.entries(sk.template.params)) rows.push({ name: T.params[k][0], mm: v, src: 'şablon' }); }
  for (const v of Object.keys(VIEWS)) for (const L of sk.views[v].layers) for (const e of L.ents) if (e.t === 'dim') rows.push({ name: (e.label || 'Ölçü') + ' (' + VIEWS[v] + ')', mm: dimGeom(e).L, src: 'çizim' });
  return rows;
}
