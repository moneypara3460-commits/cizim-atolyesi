// Elle çizilmiş parça yorumu: fotoğraftan çıkan ham çizgiler + okunan ölçü rakamları -> düzgün, ölçülü parça.
// Saf hesap (DOM yok); Node'da test edilir (tests/part2d.test.mjs).
//
// interpretPart(ents, texts) -> part:
//   { w, h,                                  // gerçek ölçü (mm)
//     corners: { bl, br, tr, tl: { type: 'sharp'|'chamfer'|'radius', size, from: 'yazı'|'çizim' } },
//     holes: [{ x, y, d, dFrom, posFrom }],  // x, y: sol-alt köşeden (mm)
//     wFrom, hFrom, scale: [sx, sy], bbox, notes: [] }
// partEnts(part) -> temiz 2B varlıklar (dış çizgi, delikler, ölçüler), sol-alt köşe (0,0).
//
// Bu bir tahmindir: el çizimi oranlıdır, yazılmayan ölçüler çizimden orantıyla bulunur.
// Kullanıcı her değeri yorum kartında düzeltebilir.

const TAU = Math.PI * 2;
const D = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]);
const ang = (a, b) => Math.atan2(b[1] - a[1], b[0] - a[0]);
const len = (e) => D(e.a, e.b);

// bir varlıktan örnek noktalar (yaklaşık "step" aralıkla)
function samples(e, step) {
  const out = [];
  if (e.t === 'line') {
    const n = Math.max(1, Math.ceil(len(e) / step));
    for (let i = 0; i <= n; i++) out.push([e.a[0] + (e.b[0] - e.a[0]) * i / n, e.a[1] + (e.b[1] - e.a[1]) * i / n]);
  } else if (e.t === 'arc' || e.t === 'circle') {
    let s = e.t === 'circle' ? TAU : ((e.a1 - e.a0) % TAU + TAU) % TAU; if (s < 1e-9) s = TAU;
    const n = Math.max(2, Math.ceil(s * e.r / step));
    for (let i = 0; i <= n; i++) { const a = (e.a0 || 0) + s * i / n; out.push([e.c[0] + e.r * Math.cos(a), e.c[1] + e.r * Math.sin(a)]); }
  }
  return out;
}
function bboxOf(ents) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const e of ents) for (const p of samples(e, 5)) { x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]); x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]); }
  return { x0, y0, x1, y1 };
}
// çizgi ile nokta uzaklığı
function segDist(p, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy || 1e-12;
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L2));
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
}
// eksene paralel mi: 'h' | 'v' | null
function axisOf(e, deg = 8) {
  if (e.t !== 'line') return null;
  const a = Math.abs(ang(e.a, e.b)) % Math.PI, t = deg * Math.PI / 180;
  if (a < t || a > Math.PI - t) return 'h';
  if (Math.abs(a - Math.PI / 2) < t) return 'v';
  return null;
}
// ağırlıklı 1B kümeleme (konum, ağırlık) -> [{ x, w }]
function cluster1(items, tol) {
  items = items.slice().sort((a, b) => a.x - b.x);
  const out = [];
  for (const it of items) {
    const last = out[out.length - 1];
    if (last && it.x - last.x <= tol) { last.x = (last.x * last.w + it.x * it.w) / (last.w + it.w); last.w += it.w; }
    else out.push({ x: it.x, w: it.w });
  }
  return out;
}
const nice = (v, st = 0.5) => Math.round(v / st) * st;

// uzun, eksene paralel çizgilerin (parçalı olsa da) toplam uzunluğuyla kaba dış kutu
function roughBox(body) {
  if (!body.length) return null;
  const bb = bboxOf(body), bext = Math.max(bb.x1 - bb.x0, bb.y1 - bb.y0);
  const vs = [], hs = [];
  for (const e of body) { const ax = axisOf(e); if (!ax || len(e) < bext * 0.04) continue; (ax === 'v' ? vs : hs).push({ x: ax === 'v' ? (e.a[0] + e.b[0]) / 2 : (e.a[1] + e.b[1]) / 2, w: len(e) }); }
  const strong = (cs) => { const m = Math.max(0, ...cs.map((c) => c.w)); return cs.filter((c) => c.w >= m * 0.35 && c.w >= bext * 0.1); };
  const sv = strong(cluster1(vs, bext * 0.025)), sh = strong(cluster1(hs, bext * 0.025));
  let L = sv.length ? sv[0].x : bb.x0, R = sv.length > 1 ? sv[sv.length - 1].x : bb.x1;
  let B = sh.length ? sh[0].x : bb.y0, T = sh.length > 1 ? sh[sh.length - 1].x : bb.y1;
  if (R - L < bext * 0.05) { L = bb.x0; R = bb.x1; }
  if (T - B < bext * 0.05) { B = bb.y0; T = bb.y1; }
  return { L, R, B, T };
}

export function interpretPart(ents, texts = []) {
  const notes = [];
  ents = ents.filter((e) => e && (e.t === 'line' || e.t === 'arc' || e.t === 'circle'));
  if (!ents.length) return null;
  const all = bboxOf(ents), ext = Math.max(all.x1 - all.x0, all.y1 - all.y0, 1e-6);

  // 1) delikler: küçük daireler (ve neredeyse tam daire olan yaylar); kaba parça kutusunun dışındakiler ok ucu / leke sayılır
  const round = ents.filter((e) => (e.t === 'circle' || (e.t === 'arc' && (((e.a1 - e.a0) % TAU + TAU) % TAU) > TAU * 0.8)) && e.r < ext * 0.3);
  const rb = roughBox(ents.filter((e) => !round.includes(e)));
  const circles = rb ? round.filter((c) => c.c[0] > rb.L - c.r * 0.5 && c.c[0] < rb.R + c.r * 0.5 && c.c[1] > rb.B - c.r * 0.5 && c.c[1] < rb.T + c.r * 0.5) : round;
  // 2) kılavuz (leader) çizgileri: daireden dışarı uzanan çizgi zinciri
  const lines = ents.filter((e) => e.t === 'line');
  const leader = new Set(), tipOf = new Map();
  const lineDist = (c, p, q) => { const dx = q[0] - p[0], dy = q[1] - p[1], L0 = Math.hypot(dx, dy) || 1e-12; return Math.abs((c[0] - p[0]) * dy - (c[1] - p[1]) * dx) / L0; };
  // p'den q'ya giden çizgiden başlayıp aynı yönde devam eden zinciri izler
  const chain = (first, p, q, taken) => {
    const set = [first]; let tip = q, dir = ang(p, q); const tol = ext * 0.02;
    for (let k = 0; k < 6; k++) {
      const nx = lines.find((l) => !taken.has(l) && !set.includes(l) && (D(l.a, tip) < tol || D(l.b, tip) < tol) && (() => { const far = D(l.a, tip) < tol ? l.b : l.a; let da = Math.abs(ang(tip, far) - dir); da = Math.min(da, TAU - da); return da < 0.45; })());
      if (!nx) break;
      set.push(nx); const far = D(nx.a, tip) < tol ? nx.b : nx.a; dir = ang(tip, far); tip = far;
    }
    return { set, tip };
  };
  for (const c of circles) {
    let best = null;
    for (const l of lines) {
      if (leader.has(l) || len(l) > ext * 0.6) continue;
      for (const [p, q] of [[l.a, l.b], [l.b, l.a]]) {
        const dp = D(p, c.c), dq = D(q, c.c);
        // daireden dışarı doğru (merkeze yönelik) çıkan ya da dairenin merkezinden geçen çizgi
        const ok = (dp < c.r * 1.6 && dq > dp + c.r * 0.5 && lineDist(c.c, p, q) < c.r * 0.6 + ext * 0.005) || (segDist(c.c, p, q) < c.r * 0.7 && dq > c.r * 0.9);
        if (!ok) continue;
        const ch = chain(l, p, q, leader), dt = D(ch.tip, c.c);
        if (dt > c.r * 1.8 && (!best || dt > best.d)) best = { ...ch, d: dt };
      }
    }
    if (!best) continue;
    for (const l of best.set) leader.add(l);
    const tip = best.tip;
    // uçtaki ok başı (kısa çizgiler)
    for (const l of lines) if (!leader.has(l) && len(l) < ext * 0.06 && (D(l.a, tip) < ext * 0.03 || D(l.b, tip) < ext * 0.03)) leader.add(l);
    tipOf.set(c, tip);
  }
  // 3) çap yazılarını deliklere bağla: önce kılavuz ucuna en yakın Ø, sonra en yakın serbest Ø
  const dias = texts.filter((t) => t.dia), plain = texts.filter((t) => !t.dia);
  const diaOf = new Map(), tUsed = new Set();
  const pairs = [];
  for (const c of circles) for (const t of dias) { const tip = tipOf.get(c); pairs.push({ c, t, d: tip ? Math.min(D(tip, t.p), D(c.c, t.p) * 1.5) : D(c.c, t.p) * 1.5 }); }
  pairs.sort((a, b) => a.d - b.d);
  for (const p of pairs) if (!diaOf.has(p.c) && !tUsed.has(p.t) && p.d < ext * 0.6) { diaOf.set(p.c, p.t); tUsed.add(p.t); }
  // Ø'siz yazı ama hemen kılavuz ucunda → yine çap say
  for (const c of circles) {
    if (diaOf.has(c) || !tipOf.has(c)) continue;
    const t = plain.filter((t) => !tUsed.has(t)).sort((a, b) => D(a.p, tipOf.get(c)) - D(b.p, tipOf.get(c)))[0];
    if (t && D(t.p, tipOf.get(c)) < Math.max(t.h * 4, ext * 0.06)) { diaOf.set(c, t); tUsed.add(t); }
  }

  // 4) dış şekil: delik / kılavuz dışındaki varlıklar
  const isHole = new Set(circles);
  const body = ents.filter((e) => !isHole.has(e) && !leader.has(e) && !round.includes(e));
  if (!body.length) return null;
  const bb = bboxOf(body), bext = Math.max(bb.x1 - bb.x0, bb.y1 - bb.y0);
  let { L, R, B, T } = roughBox(body) || { L: bb.x0, R: bb.x1, B: bb.y0, T: bb.y1 };

  // 5) ölçü yazılarını kenarlara bağla. Yazının konumu: kutunun solunda/sağında → yükseklik, altında/üstünde → genişlik, çaprazda → köşe
  const free = plain.filter((t) => !tUsed.has(t));
  let wT = null, hT = null; const cornerT = [];
  const mx = (R - L) * 0.12, my = (T - B) * 0.12;
  for (const t of free) {
    const [x, y] = t.p;
    const outX = x < L - 1 ? 'L' : x > R + 1 ? 'R' : null, outY = y < B - 1 ? 'B' : y > T + 1 ? 'T' : null;
    const inX = x > L + mx && x < R - mx, inY = y > B + my && y < T - my;
    if (outX && inY) { if (!hT || t.conf > hT.conf) hT = t; }
    else if (outY && inX) { if (!wT || t.conf > wT.conf) wT = t; }
    else cornerT.push(t);
  }
  // iki taraflı belirsizlik: aynı yerde iki aday yoksa, en uzun kenara en büyük değer
  if (!wT && !hT && free.length >= 2) {
    const s = free.slice().sort((a, b) => b.value - a.value);
    if (R - L >= T - B) { wT = s[0]; hT = s[1]; } else { hT = s[0]; wT = s[1]; }
    cornerT.splice(0, cornerT.length, ...free.filter((t) => t !== wT && t !== hT));
    notes.push('Ölçü yazılarının hangi kenara ait olduğu konumdan çıkarılamadı; büyük değer uzun kenara verildi.');
  }
  // ölçü sınır çizgileri (uzatma çizgileri): yazının tarafında kutunun dışına taşan dik çizgiler -> ölçülen aralık
  const extLines = new Set();
  const spanFrom = (t, axis) => {
    if (!t) return null;
    const side = axis === 'w' ? (t.p[1] < B ? -1 : 1) : (t.p[0] < L ? -1 : 1);
    const edge = axis === 'w' ? (side < 0 ? B : T) : (side < 0 ? L : R);
    const tolOut = bext * 0.03;
    const xs = [];
    for (const e of body) {
      const ax = axisOf(e, 12);
      if (ax !== (axis === 'w' ? 'v' : 'h')) continue;
      const k = axis === 'w' ? 1 : 0;   // dışarı taşma ekseni
      const far = side < 0 ? Math.min(e.a[k], e.b[k]) : Math.max(e.a[k], e.b[k]);
      if ((side < 0 ? edge - far : far - edge) > tolOut) { xs.push(axis === 'w' ? (e.a[0] + e.b[0]) / 2 : (e.a[1] + e.b[1]) / 2); extLines.add(e); }
    }
    if (xs.length < 2) return null;
    const lo = Math.min(...xs), hi = Math.max(...xs);
    const full = axis === 'w' ? R - L : T - B;
    return hi - lo > full * 0.5 ? [lo, hi] : null;
  };
  const ws = spanFrom(wT, 'w'), hsp = spanFrom(hT, 'h');
  if (ws) { L = ws[0]; R = ws[1]; }
  if (hsp) { B = hsp[0]; T = hsp[1]; }
  const dw = R - L, dh = T - B;
  if (!(dw > 0 && dh > 0)) return null;
  // ölçek: yazılan ölçü / çizimdeki uzunluk
  let sx = wT ? wT.value / dw : null, sy = hT ? hT.value / dh : null;
  if (sx == null && sy == null) { sx = sy = 1; notes.push('Genişlik / yükseklik yazısı bulunamadı: ölçüler kağıt ölçeğinden.'); }
  else if (sx == null) { sx = sy; notes.push('Genişlik yazılmamış: çizim oranından bulundu.'); }
  else if (sy == null) { sy = sx; notes.push('Yükseklik yazılmamış: çizim oranından bulundu.'); }
  const W = wT ? wT.value : nice(dw * sx), H = hT ? hT.value : nice(dh * sy), sAvg = (sx + sy) / 2;

  // 6) köşeler: kutunun içindeki dış şekil noktalarının köşeye en yakın uzaklığı.
  //    keskin köşe -> ~0; pah (a) -> a/√2; radyüs (r) -> r(√2-1)
  const tolIn = Math.min(dw, dh) * 0.04;
  const shapeEnts = body.filter((e) => !extLines.has(e));
  const pts = [];
  for (const e of shapeEnts) for (const p of samples(e, Math.min(dw, dh) / 80)) if (p[0] > L - tolIn && p[0] < R + tolIn && p[1] > B - tolIn && p[1] < T + tolIn) pts.push({ p, e });
  const corners = {};
  const CK = { bl: [L, B, 1, 1], br: [R, B, -1, 1], tr: [R, T, -1, -1], tl: [L, T, 1, -1] };
  const maxCut = Math.min(dw, dh) * 0.5;
  for (const [k, [cx, cy, ux, uy]] of Object.entries(CK)) {
    // köşegen yönünde iç tarafta kalan noktalar
    let best = null;
    for (const q of pts) {
      const lx = (q.p[0] - cx) * ux, ly = (q.p[1] - cy) * uy;
      if (lx < -tolIn || ly < -tolIn || lx > maxCut || ly > maxCut) continue;
      const d = Math.hypot(Math.max(0, lx), Math.max(0, ly));
      if (!best || d < best.d) best = { d, q, lx, ly };
    }
    let type = 'sharp', size = 0;
    if (best && best.d > tolIn * 1.2) {
      // biçim: en yakın nokta yaydan mı, köşegen çizgiden mi?
      const e = best.q.e;
      let diag = false;
      if (e.t === 'line') { const a = Math.abs(ang(e.a, e.b)) % Math.PI; diag = a > 0.35 && a < Math.PI - 0.35 && Math.abs(a - Math.PI / 2) > 0.35; }
      type = diag ? 'chamfer' : 'radius';
      const dd = best.d;
      size = type === 'chamfer' ? dd * Math.SQRT2 : dd / (Math.SQRT2 - 1);
      size = Math.min(size, maxCut) * sAvg;
    } else if (!best) { type = 'sharp'; }
    corners[k] = { type, size: type === 'sharp' ? 0 : nice(size, 1), from: 'çizim' };
  }
  // köşe yazısı -> en yakın köşe (kutuya göre)
  for (const t of cornerT) {
    let bk = null, bd = Infinity;
    for (const [k, [cx, cy]] of Object.entries(CK)) { const d = D(t.p, [cx, cy]); if (d < bd) { bd = d; bk = k; } }
    if (!bk || bd > Math.max(dw, dh) * 0.6) continue;
    const c = corners[bk];
    if (c.type === 'sharp') c.type = 'radius';
    c.size = t.value; c.from = 'yazı';
  }
  for (const c of Object.values(corners)) c.size = Math.min(c.size, Math.min(W, H) / 2);

  // 7) delikler (sol-alt köşeden)
  const holes = circles.filter((c) => c.c[0] > L - c.r && c.c[0] < R + c.r && c.c[1] > B - c.r && c.c[1] < T + c.r).map((c) => {
    const t = diaOf.get(c);
    return { x: nice((c.c[0] - L) * sx), y: nice((c.c[1] - B) * sy), d: t ? t.value : nice(2 * c.r * sAvg), dFrom: t ? 'yazı' : 'çizim', posFrom: 'çizim' };
  });
  if (holes.some((h) => h.posFrom === 'çizim')) notes.push('Delik konumları yazılmamış: çizimdeki yerinden orantıyla bulundu (karttan düzeltilebilir).');
  return { w: W, h: H, wFrom: wT ? 'yazı' : 'çizim', hFrom: hT ? 'yazı' : 'çizim', corners, holes, scale: [sx, sy], bbox: { x0: L, y0: B, x1: R, y1: T }, notes };
}

// geçerli değerlere kırp (kart düzenlemesinden sonra)
export function fixPart(p) {
  const W = Math.max(0.1, +p.w || 0), H = Math.max(0.1, +p.h || 0);
  const corners = {};
  for (const k of ['bl', 'br', 'tr', 'tl']) {
    const c = p.corners[k] || { type: 'sharp', size: 0 };
    const size = Math.max(0, Math.min(+c.size || 0, Math.min(W, H) / 2 - 1e-6));
    corners[k] = { ...c, type: size > 0 ? c.type : 'sharp', size: c.type === 'sharp' ? 0 : size };
  }
  // komşu köşeler toplamı kenarı aşmasın
  const fit = (a, b, side) => { const s = corners[a].size + corners[b].size; if (s > side) { const k = side / s; corners[a].size *= k; corners[b].size *= k; } };
  fit('bl', 'br', W); fit('tl', 'tr', W); fit('bl', 'tl', H); fit('br', 'tr', H);
  const holes = (p.holes || []).filter((h) => +h.d > 0).map((h) => ({ ...h, x: +h.x, y: +h.y, d: +h.d }));
  return { ...p, w: W, h: H, corners, holes };
}

// Temiz varlıklar: dış şekil (saat yönünün tersine), delikler, ölçüler. Sol-alt köşe (0,0).
export function partEnts(p0, opt = {}) {
  const p = fixPart(p0), W = p.w, H = p.h, C = p.corners;
  const hh = opt.textH || Math.max(2.5, Math.min(5, Math.max(W, H) / 30));
  const out = [];
  // köşe noktaları (ccw: bl -> br -> tr -> tl)
  const seq = [
    ['bl', [0, 0], [1, 0], [0, 1]],
    ['br', [W, 0], [0, 1], [-1, 0]],
    ['tr', [W, H], [-1, 0], [0, -1]],
    ['tl', [0, H], [0, -1], [1, 0]],
  ];
  // her köşe: giriş noktası (önceki kenardan) ve çıkış noktası (sonraki kenara)
  const cut = seq.map(([k, P, dirOut, dirInRev]) => {
    const s = C[k].size;
    return { k, P, inP: [P[0] + dirInRev[0] * s, P[1] + dirInRev[1] * s], outP: [P[0] + dirOut[0] * s, P[1] + dirOut[1] * s], s, type: C[k].type };
  });
  for (let i = 0; i < 4; i++) {
    const c = cut[i], n = cut[(i + 1) % 4];
    if (c.type !== 'sharp' && c.s > 0) {
      if (c.type === 'chamfer') out.push({ t: 'line', a: c.inP, b: c.outP });
      else {
        // radyüs merkezi: köşeden iki kenar yönünde s kadar içeride
        const cc = [c.inP[0] + c.outP[0] - c.P[0], c.inP[1] + c.outP[1] - c.P[1]];
        const a0 = Math.atan2(c.inP[1] - cc[1], c.inP[0] - cc[0]), a1 = Math.atan2(c.outP[1] - cc[1], c.outP[0] - cc[0]);
        out.push({ t: 'arc', c: cc, r: c.s, a0: (a0 + TAU) % TAU, a1: (a1 + TAU) % TAU, _corner: c.k });
      }
    }
    const a = c.s > 0 && c.type !== 'sharp' ? c.outP : c.P, b = n.s > 0 && n.type !== 'sharp' ? n.inP : n.P;
    if (D(a, b) > 1e-9) out.push({ t: 'line', a, b });
  }
  for (const h of p.holes) out.push({ t: 'circle', c: [h.x, h.y], r: h.d / 2 });
  if (opt.dims !== false) {
    const g = hh * 3;
    out.push({ t: 'dim', a: [0, 0], b: [W, 0], off: -g, h: hh, _dim: 1 });
    out.push({ t: 'dim', a: [0, 0], b: [0, H], off: g, h: hh, _dim: 1 });
    for (const c of cut) {
      if (c.type === 'sharp' || !(c.s > 0)) continue;
      if (c.type === 'radius') {
        const cc = [c.inP[0] + c.outP[0] - c.P[0], c.inP[1] + c.outP[1] - c.P[1]], k = 0.7071;
        const dx = Math.sign(c.P[0] - cc[0]) || 1, dy = Math.sign(c.P[1] - cc[1]) || 1;
        out.push({ t: 'rdim', c: cc, r: c.s, p: [cc[0] + dx * (c.s * k + hh * 3), cc[1] + dy * (c.s * k + hh * 3)], dia: false, h: hh, _dim: 1 });
      } else {
        // pah: köşe noktasından kesik ucuna yatay/dikey ölçü
        const a = c.P, b = Math.abs(c.outP[1] - c.P[1]) < 1e-9 ? c.outP : c.inP;
        const horiz = Math.abs(b[1] - a[1]) < 1e-9;
        const outward = horiz ? (a[1] > H / 2 ? 1 : -1) : (a[0] > W / 2 ? 1 : -1);
        // off işareti: ab'nin soluna pozitif
        const d = [b[0] - a[0], b[1] - a[1]], nrm = [-d[1], d[0]], want = horiz ? [0, outward] : [outward, 0];
        const sg = Math.sign(nrm[0] * want[0] + nrm[1] * want[1]) || 1;
        out.push({ t: 'dim', a: a.slice(), b: b.slice(), off: sg * hh * 2, h: hh, _dim: 1, _pref: 'chamfer' });
      }
    }
    p.holes.forEach((h) => {
      const k = 0.7071, sx = h.x > W / 2 ? 1 : -1;
      out.push({ t: 'rdim', c: [h.x, h.y], r: h.d / 2, p: [h.x + sx * (h.d / 2 * k + hh * 3), h.y + h.d / 2 * k + hh * 2], dia: true, h: hh, _dim: 1 });
      // konum ölçüleri parçanın dışında: x sol kenardan (üstte), y alt kenardan (sağda); her delik bir kademe dışarıda
      // kısa ölçü parçaya yakın, uzun olan dışta (çizgiler kesişmesin)
      const rx = p.holes.filter((o) => o.x < h.x).length, ry = p.holes.filter((o) => o.y < h.y).length;
      out.push({ t: 'dim', a: [0, H], b: [h.x, H], off: hh * 2.2 + rx * hh * 2.4, h: hh * 0.85, _dim: 1 });
      out.push({ t: 'dim', a: [W, 0], b: [W, h.y], off: -(hh * 2.2 + ry * hh * 2.4), h: hh * 0.85, _dim: 1 });
    });
  }
  return out;
}

// kartta gösterilecek kısa özet
export function partSummary(p) {
  const cs = ['tl', 'tr', 'br', 'bl'].map((k) => { const c = p.corners[k]; return c.type === 'sharp' ? null : (c.type === 'radius' ? 'R' + c.size : c.size + '×45° pah'); }).filter(Boolean);
  return `${p.w} × ${p.h} mm` + (cs.length ? ', köşeler: ' + cs.join(', ') : '') + (p.holes.length ? ', delikler: ' + p.holes.map((h) => 'Ø' + h.d).join(', ') : '');
}
export const CORNER_NAMES = { tl: 'Sol üst', tr: 'Sağ üst', br: 'Sağ alt', bl: 'Sol alt' };
