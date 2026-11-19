// Kalıbın yan çizgisinden otomatik saya parçaları (Derby, Oxford, Loafer, Spor).
// Kalıp çizgisi önce "kanonik" konuma getirilir: topuk solda (x = 0), burun sağda (x = L), taban altta (y büyük).
// Model çizgileri (üst ağız, dil başı, yan saya önü, burun kapağı …) kalıp boyuna oranlı varsayılanlarla kurulur;
// usta değerleri değiştirip yeniden oluşturabilir ya da parçaları stampada düzeltebilir.
// Parçalar yarım kalıptır: üst kenarı "orta çizgi" olan parçalar (ön saya, dil, burun) bu çizgiden simetrik açılır.
import * as G from './geom.js?v=20261119c';
import { makePiece, setEdgeProp, nextPieceNo } from './model.js?v=20261119c';
import { makeMatch } from './match.js?v=20261119c';

export const MODELS = {
  derby: { name: 'Derby (açık bağcıklı)', lacing: true },
  oxford: { name: 'Oxford (kapalı bağcıklı)', lacing: true },
  loafer: { name: 'Loafer (bağcıksız, maskeli)', lacing: false },
  spor: { name: 'Spor ayakkabı', lacing: true },
};
// parametreler: oran olanlar kalıp boyunun oranı (% olarak gösterilir), mm olanlar mm
export const PARAMS = {
  backH: { name: 'Arka (topuk) yüksekliği', unit: 'mm', min: 30, max: 140 },
  throat: { name: 'Dil başı konumu', unit: '%', min: 45, max: 80, lacing: true },
  facing: { name: 'Bağcık ağzı başlangıcı', unit: '%', min: 30, max: 60, lacing: true },
  qfront: { name: 'Yan saya önü (tabanda)', unit: '%', min: 35, max: 75 },
  eyelets: { name: 'Bağcık deliği sayısı', unit: 'adet', min: 0, max: 10, lacing: true },
  cap: { name: 'Burun kapağı', unit: 'bool' },
  capAt: { name: 'Burun kapağı çizgisi', unit: '%', min: 70, max: 92 },
};
export function defaultParams(type, L = 260) {
  const r = (x) => Math.round(x);
  switch (type) {
    case 'oxford': return { backH: r(0.235 * L), throat: 62, facing: 43, qfront: 50, eyelets: 5, cap: false, capAt: 83 };
    case 'loafer': return { backH: r(0.2 * L), throat: 60, facing: 60, qfront: 50, eyelets: 0, cap: false, capAt: 83 };
    case 'spor': return { backH: r(0.27 * L), throat: 64, facing: 44, qfront: 55, eyelets: 6, cap: true, capAt: 82 };
    default: return { backH: r(0.235 * L), throat: 60, facing: 42, qfront: 52, eyelets: 5, cap: false, capAt: 83 };
  }
}
export function cleanParams(type, p = {}, L = 260) {
  const d = defaultParams(type, L), out = {};
  for (const [k, def] of Object.entries(PARAMS)) {
    if (def.unit === 'bool') { out[k] = typeof p[k] === 'boolean' ? p[k] : d[k]; continue; }
    const v = Number(p[k]);
    out[k] = Number.isFinite(v) ? Math.max(def.min, Math.min(def.max, v)) : d[k];
  }
  if (out.facing > out.throat - 8) out.facing = Math.max(PARAMS.facing.min, out.throat - 8);
  return out;
}

/* ---------- kalıp çizgisi ölçümü ---------- */
const lerp = (a, b, t) => a + (b - a) * t;
function polyOf(v) { return v.outline.nodes.map((n) => [n.p[0], n.p[1]]); }
function bboxOf(poly) { let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity; for (const [x, y] of poly) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); } return { x0, y0, x1, y1 }; }
// dikey çizginin kalıpla kesişimi → [üst y, alt y]
export function colRange(poly, x) {
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    if ((a[0] - x) * (b[0] - x) > 0 || a[0] === b[0]) continue;
    const y = a[1] + (b[1] - a[1]) * (x - a[0]) / (b[0] - a[0]);
    lo = Math.min(lo, y); hi = Math.max(hi, y);
  }
  return lo <= hi ? [lo, hi] : null;
}
function rowRange(poly, y) {
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    if ((a[1] - y) * (b[1] - y) > 0 || a[1] === b[1]) continue;
    const x = a[0] + (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]);
    lo = Math.min(lo, x); hi = Math.max(hi, x);
  }
  return lo <= hi ? [lo, hi] : null;
}
// Kalıbı kanonik konuma getiren dönüşüm ve ölçüm fonksiyonları
export function lastFrame(view, flipX = false, flipY = false) {
  const raw = polyOf(view), b = bboxOf(raw), L = b.x1 - b.x0, H = b.y1 - b.y0;
  const toC = ([x, y]) => [flipX ? b.x1 - x : x - b.x0, flipY ? b.y1 - y : y - b.y0];
  const toV = ([x, y]) => [(flipX ? b.x1 - x : x + b.x0) + view.at[0], (flipY ? b.y1 - y : y + b.y0) + view.at[1]];
  const poly = raw.map(toC);
  const col = (x) => colRange(poly, Math.max(0.3, Math.min(L - 0.3, x))) || [H / 2, H / 2];
  const top = (x) => col(x)[0], bot = (x) => col(x)[1];
  const left = (y) => (rowRange(poly, y) || [0, L])[0];
  return { poly, L, H, toV, top, bot, left, flipX, flipY };
}
// Yön tahmini: burun ucu topuktan incedir; üst (ağız/diz) çizgisi tabandan çok daha fazla iner.
export function guessOrientation(view) {
  const f = lastFrame(view), { L } = f;
  const h = (x) => f.bot(x) - f.top(x);
  // kalıbın en yüksek yeri (konç / bilek) topuk yarısındadır; burun ucu topuktan incedir (yedek ölçüt)
  let best = 0, bx = 0;
  for (let i = 1; i < 60; i++) { const x = (L * i) / 60, v = h(x); if (v > best) { best = v; bx = x; } }
  let a = 0, b = 0;
  for (let i = 1; i <= 6; i++) { a += h(L * 0.015 * i); b += h(L - L * 0.015 * i); }
  const flipX = Math.abs(bx - L / 2) > 0.06 * L ? bx > L / 2 : a < b;   // en yüksek yer sağdaysa topuk sağdadır → çevir
  const g = lastFrame(view, flipX, false);
  // taban çizgisi düzgün akar; üst çizgi (konç tepesi → ağız → burun) iner-çıkar: eğriliği büyük olan üst taraftır
  const bend = (f) => { let sum = 0; const n = 24; for (let i = 1; i < n; i++) { const x = (k) => L * (0.08 + 0.62 * k / n); sum += Math.abs(f(x(i - 1)) - 2 * f(x(i)) + f(x(i + 1))); } return sum; };
  const bt = bend(g.top), bb = bend(g.bot);
  const dTop = Math.abs(g.top(0.75 * L) - g.top(0.3 * L)), dBot = Math.abs(g.bot(0.75 * L) - g.bot(0.3 * L));
  const flipY = Math.abs(bt - bb) > 0.25 * Math.max(bt, bb) ? bb > bt : dBot > dTop;
  return { flipX, flipY };
}

/* ---------- eğri yardımcıları ---------- */
export function cubic(p0, p1, p2, p3, n = 24) {
  const out = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, u = 1 - t;
    out.push([u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0], u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1]]);
  }
  return out;
}
export function catmull(pts, per = 14) {
  const out = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
    for (let j = 0; j < per; j++) {
      const t = j / per, t2 = t * t, t3 = t2 * t;
      out.push([0, 1].map((k) => 0.5 * (2 * p1[k] + (-p0[k] + p2[k]) * t + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t2 + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * t3)));
    }
  }
  out.push(pts[pts.length - 1].slice());
  return out;
}
export const range = (a, b, step = 2) => { const n = Math.max(2, Math.ceil(Math.abs(b - a) / step)); return Array.from({ length: n + 1 }, (_, i) => lerp(a, b, i / n)); };
// soldan sağa giden çizgiyi gövdeye doğru (aşağı) d mm kaydır; geri dönen (kendine katlanan) noktalar atılır
function offsetDown(pts, d) {
  const out = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[Math.max(0, i - 2)], b = pts[Math.min(pts.length - 1, i + 2)];
    let nx = -(b[1] - a[1]), ny = b[0] - a[0]; const l = Math.hypot(nx, ny) || 1; nx /= l; ny /= l;
    const q = [pts[i][0] + nx * d, pts[i][1] + ny * d];
    if (out.length && q[0] <= out[out.length - 1][0] + 0.2) continue;
    out.push(q);
  }
  return out;
}
function lenOf(pts) { let s = 0; for (let i = 1; i < pts.length; i++) s += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); return s; }
function atLen(pts, s) {
  for (let i = 1; i < pts.length; i++) {
    const d = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    if (s <= d) { const t = d ? s / d : 0; return [lerp(pts[i - 1][0], pts[i][0], t), lerp(pts[i - 1][1], pts[i][1], t)]; }
    s -= d;
  }
  return pts[pts.length - 1].slice();
}

/* ---------- parça kurucu ---------- */
// edges: [{ pts, kind, name, stitch? }] ardışık; her kenarın son noktası bir sonrakinin ilk noktasıdır.
export function buildPiece(spec, edgeList, toV) {
  const nodes = [], starts = [];
  for (const e of edgeList) {
    const pts = G.simplify(e.pts.map(toV), 0.2);
    starts.push(nodes.length);
    pts.slice(0, -1).forEach((q, i) => nodes.push(G.node(q, { brk: i === 0 })));
  }
  const np = G.makePath(nodes, true);
  np.nodes.forEach((n, i) => { if (!n.brk) G.autoSmooth(np, i); });
  const pc = makePiece({ ...spec, outline: np });
  edgeList.forEach((e, j) => setEdgeProp(pc, np.nodes[starts[j]].id, { name: e.name, kind: e.kind, stitch: e.stitch || { on: false }, ...(e.corner ? { corner: e.corner } : {}) }));
  return { pc, edgeIds: starts.map((s) => np.nodes[s].id) };
}
const mid = () => 'mk' + Math.random().toString(36).slice(2, 8);

/* ---------- ana işlem ---------- */
// project.last.views.yan gerekir. Dönen: { pieces, matches, frame, params } — projeye eklemez.
export function generate(project, { type = 'derby', flipX, flipY, params = {}, material = null } = {}) {
  const view = project.last?.views?.yan;
  if (!view) throw new Error('Önce kalıbın yan görünüşü fotoğrafını ekle.');
  if (!MODELS[type]) throw new Error('Bilinmeyen model tipi');
  const or = flipX === undefined || flipY === undefined ? guessOrientation(view) : { flipX, flipY };
  const F = lastFrame(view, !!or.flipX, !!or.flipY);
  const { L, top, bot, left, toV } = F;
  if (L < 120 || L > 450) throw new Error('Kalıp boyu ' + Math.round(L) + ' mm: ayakkabı kalıbı için beklenmeyen ölçü. Fotoğrafı ve bilinen boyu kontrol et.');
  const P = cleanParams(type, params, L), m = MODELS[type];
  const X = (pct) => (pct / 100) * L;
  const gap = type === 'oxford' ? 2 : type === 'spor' ? 8 : 6;   // bağcık ağzı yarı açıklığı
  const topPts = (x0, x1) => range(x0, x1).map((x) => [x, top(x)]);
  const solePts = (x0, x1) => range(x0, x1).map((x) => [x, bot(x)]);
    const yB = bot(0.04 * L) - P.backH;
  const B = [left(yB) + 0.3, yB];
  // topuk noktası: kalıbın sol-alt uç noktası (taban ile arka eğrinin buluştuğu yer)
  const { poly } = F;
  let iH = 0, best = -Infinity;
  poly.forEach((q, i) => { const v = -q[0] + q[1]; if (v > best) { best = v; iH = i; } });
  const H0 = poly[iH].slice();
  // arka dikiş: topuk noktasından B'ye kalıbın kendi arka çizgisi boyunca (sol taraftan dolaşan yol)
  let iB = 0, bd = Infinity;
  poly.forEach((q, i) => { const d = Math.hypot(q[0] - B[0], q[1] - B[1]); if (d < bd) { bd = d; iB = i; } });
  const walk = (dir) => { const out = []; for (let i = iH; ; i = (i + dir + poly.length) % poly.length) { out.push(poly[i]); if (i === iB || out.length > poly.length) break; } return out; };
  const w1 = walk(1), w2 = walk(-1);
  const maxX = (w) => Math.max(...w.map((q) => q[0]));
  const backPts = (maxX(w1) <= maxX(w2) ? w1 : w2).slice(0, -1).concat([B]);   // aşağıdan yukarı
  const xT = X(P.throat), xF = X(m.lacing ? P.facing : P.throat), xQ = X(P.qfront);
  const T = [xT, top(xT)];
  // bağcık ağzı (yarım kalıpta orta çizginin gap kadar altı)
  const facingPts = m.lacing ? offsetDown(topPts(xF, xT), gap) : null;
  const Tg = m.lacing ? facingPts[facingPts.length - 1] : T;
  const Fg = m.lacing ? facingPts[0] : T;
  // üst ağız: B → ayak bileği çukuru → bağcık ağzı başı
  const xA = 0.27 * L, A = [xA, bot(xA) - (P.backH - (type === 'spor' ? 4 : 9))];
  const topline = catmull([B, A, Fg]);
  // yan saya önü: dil başından tabana, öne doğru dolgun eğri
  const rev = (a) => a.slice().reverse();
  // tabana / orta çizgiye dik çıkış (köşeler 90° olsun: pay çizgileri temiz birleşir)
  const upFromSole = (x) => { const a = [x - 2, bot(x - 2)], b = [x + 2, bot(x + 2)]; let nx = b[1] - a[1], ny = -(b[0] - a[0]); const l = Math.hypot(nx, ny) || 1; if (ny > 0) { nx = -nx; ny = -ny; } return [nx / l, ny / l]; };
  const downFromTop = (x) => { const a = [x - 2, top(x - 2)], b = [x + 2, top(x + 2)]; let nx = -(b[1] - a[1]), ny = b[0] - a[0]; const l = Math.hypot(nx, ny) || 1; if (ny < 0) { nx = -nx; ny = -ny; } return [nx / l, ny / l]; };
  const along = (p, d, s) => [p[0] + d[0] * s, p[1] + d[1] * s];
  const Q = [xQ, bot(xQ)], dh = Q[1] - Tg[1];
  const qline = cubic(Tg, [Tg[0] + 0.035 * L, Tg[1] + 0.3 * dh], along(Q, upFromSole(xQ), 0.35 * dh), Q);
  const pieces = [], matches = [], base = { side: 'cift', qty: 2, material, no: nextPieceNo(project) };
  let no = base.no;
  const add = (spec, edges) => { const r = buildPiece({ ...base, no: no++, ...spec }, edges, toV); pieces.push(r.pc); return r; };
  const toeTip = [L, (top(L - 0.3) + bot(L - 0.3)) / 2];
  const st = (on, rows = 1) => ({ on, dist: 1.5, rows, gap: 2.5 });
  const note = (x) => `Kalıptan otomatik (${m.name}). ${x}`;

  // ÖN SAYA (vamp): orta çizgi T → burun, taban burun → Q, yan saya çizgisi Q → Tg (+ Tg → T küçük dil ağzı)
  const vampTop = topPts(xT, L - 0.6).concat([toeTip]);
  const vampSole = [toeTip].concat(solePts(L - 0.6, xQ));
  const overQ = type === 'oxford' || type === 'loafer';   // ön saya yan sayanın üstünde mi
  const vEdges = [
    { pts: vampTop, kind: 'yok', name: 'Orta çizgi (simetri ekseni)' },
    { pts: vampSole, kind: 'montaj', name: 'Kalıba çekme' },
    { pts: rev(qline), kind: overQ ? 'katlama' : 'binme', name: overQ ? 'Yan saya üstü (katlanır)' : 'Yan saya altı', stitch: overQ ? st(true, 2) : undefined },
  ];
  if (m.lacing && Math.hypot(Tg[0] - T[0], Tg[1] - T[1]) > 0.5) vEdges.push({ pts: [Tg, T], kind: 'katlama', name: 'Dil ağzı', stitch: st(true) });
  const vamp = add({ name: 'Ön saya', code: 'OS-01', kind: 'Ön saya', notes: note('Üst kenar orta çizgidir: parça bu çizgiden simetrik açılır.') }, vEdges);

  // YAN SAYA (quarter)
  const qEdges = [];
  if (m.lacing) qEdges.push({ pts: facingPts, kind: type === 'spor' ? 'kenar' : 'katlama', name: 'Bağcık ağzı', stitch: st(true) });
  qEdges.push(
    { pts: qline, kind: overQ ? 'binme' : 'katlama', name: overQ ? 'Ön saya altı' : 'Ön kenar (ön sayaya biner)', stitch: overQ ? undefined : st(true, 2) },
    { pts: solePts(xQ, H0[0] + 1).concat([H0]), kind: 'montaj', name: 'Kalıba çekme' },
    { pts: backPts, kind: 'dikis', name: 'Arka dikiş' },
    { pts: topline, kind: type === 'spor' ? 'kenar' : 'katlama', name: 'Üst ağız', stitch: st(true) },
  );
  const qtr = add({ name: 'Yan saya', code: 'YS-01', kind: 'Yan saya', notes: note('İç ve dış yan için ayna olarak kesilir.') }, qEdges);
  // yan saya ↔ ön saya eşleştirmesi (aynı eğri: uzunluklar eşit)
  const qi = m.lacing ? 1 : 0;
  matches.push(makeMatch({ name: 'Yan saya önü ↔ ön saya', a: { piece: qtr.pc.id, edge: qtr.edgeIds[qi] }, b: { piece: vamp.pc.id, edge: vamp.edgeIds[2] }, kind: 'binme', reverse: true, tol: 1 }));
  for (const [r, e] of [[qtr, qtr.edgeIds[qi]], [vamp, vamp.edgeIds[2]]]) {
    const ed = G.edges(r.pc.outline).find((q) => q.id === e);
    r.pc.marks.push({ id: mid(), kind: 'centik', edge: e, at: +(G.edgeLength(ed) / 2).toFixed(2), label: 'A', depth: 3 });
  }
  // bağcık delikleri
  if (m.lacing && P.eyelets > 0) {
    const inner = offsetDown(facingPts, 10), len = lenOf(inner), s0 = 9, s1 = len - 12;
    for (let k = 0; k < P.eyelets; k++) {
      const p = atLen(inner, P.eyelets === 1 ? (s0 + s1) / 2 : lerp(s0, s1, k / (P.eyelets - 1)));
      qtr.pc.marks.push({ id: mid(), kind: 'delik', p: toV(p).map((v) => +v.toFixed(2)), d: type === 'spor' ? 5 : 4, label: k ? '' : `Bağcık deliği Ø${type === 'spor' ? 5 : 4}` });
    }
  }

  // DİL
  if (m.lacing) {
    const tl = topPts(xF, Math.min(xT + 15, L * 0.9));
    const ext = (() => { const a = tl[0], b = tl[3] || tl[1]; const dx = a[0] - b[0], dy = a[1] - b[1], l = Math.hypot(dx, dy) || 1; return [a[0] + (dx / l) * 22, a[1] + (dy / l) * 22]; })();
    const centre = [ext].concat(tl);   // arkadan öne
    const w = type === 'spor' ? 34 : 28;
    const lower = offsetDown(centre, w);
    add({ name: 'Dil', code: 'DL-01', kind: 'Dil', qty: 1, notes: note('Üst kenar orta çizgidir: dil bu çizgiden simetrik açılır. Ön ucu ön sayanın altına girer.') }, [
      { pts: rev(centre), kind: 'yok', name: 'Orta çizgi (simetri ekseni)' },
      { pts: [centre[0], lower[0]], kind: 'kenar', name: 'Dil ucu' },
      { pts: lower, kind: 'kenar', name: 'Dil kenarı' },
      { pts: [lower[lower.length - 1], centre[centre.length - 1]], kind: 'binme', name: 'Ön saya altı' },
    ]);
  }

  // BURUN KAPAĞI
  if (P.cap) {
    const xC = X(P.capAt), C0 = [xC, top(xC)], xc1 = xC - 0.02 * L, C1 = [xc1, bot(xc1)], hh = C1[1] - C0[1];
    const capLine = cubic(C1, along(C1, upFromSole(xc1), 0.35 * hh), along(C0, downFromTop(xC), 0.35 * hh), C0);
    add({ name: 'Burun kapağı', code: 'BK-01', kind: 'Burun', notes: note('Ön sayanın üstüne dikilir; üst kenar orta çizgidir.') }, [
      { pts: topPts(xC, L - 0.6).concat([toeTip]), kind: 'yok', name: 'Orta çizgi (simetri ekseni)' },
      { pts: [toeTip].concat(solePts(L - 0.6, xc1)), kind: 'montaj', name: 'Kalıba çekme' },
      { pts: capLine, kind: 'katlama', name: 'Burun çizgisi (ön sayaya biner)', stitch: st(true, 2) },
    ]);
  }

  // TOPUK (spor): yan sayanın üstüne arkadan biner
  if (type === 'spor') {
    const cs = topline.findIndex((p) => p[0] >= 0.14 * L), C1 = topline[Math.max(1, cs)];
    const Hc = [0.3 * L, bot(0.3 * L)], hh = Hc[1] - C1[1];
    const front = cubic(C1, [C1[0] + 0.06 * L, C1[1] + 0.4 * hh], along(Hc, upFromSole(Hc[0]), 0.4 * hh), Hc);
    add({ name: 'Topuk takviyesi', code: 'TP-01', kind: 'Topuk', notes: note('Yan sayanın üstüne arkadan dikilir.') }, [
      { pts: backPts, kind: 'dikis', name: 'Arka dikiş' },
      { pts: topline.slice(0, Math.max(2, cs + 1)), kind: 'kenar', name: 'Üst ağız' },
      { pts: front, kind: 'katlama', name: 'Ön kenar (yan sayaya biner)', stitch: st(true, 2) },
      { pts: solePts(Hc[0], H0[0] + 1).concat([H0]), kind: 'montaj', name: 'Kalıba çekme' },
    ]);
  }

  // MASKE (loafer): dil başında, orta çizgiye dik bant
  if (type === 'loafer') {
    const a = xT - 0.035 * L, b = xT + 0.045 * L, depth = 30;
    const tp = topPts(a, b), lowA = [a + 4, top(a) + depth], lowB = [b - 4, top(b) + depth];
    add({ name: 'Maske', code: 'MK-01', kind: 'Diğer', notes: note('Ön saya ile yan sayanın birleştiği yerin üstüne dikilir; üst kenar orta çizgidir.') }, [
      { pts: rev(tp), kind: 'yok', name: 'Orta çizgi (simetri ekseni)' },
      { pts: [tp[0], lowA], kind: 'kenar', name: 'Arka kenar' },
      { pts: cubic(lowA, [lowA[0] + 5, lowA[1] + 6], [lowB[0] - 5, lowB[1] + 6], lowB), kind: 'kenar', name: 'Alt kenar' },
      { pts: [lowB, tp[tp.length - 1]], kind: 'kenar', name: 'Ön kenar' },
    ]);
  }
  return { pieces, matches, frame: { flipX: !!or.flipX, flipY: !!or.flipY, L }, params: P, type };
}
