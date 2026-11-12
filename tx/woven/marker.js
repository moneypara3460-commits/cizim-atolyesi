// Kumaş yerleşimi (pastal / marker) ve kesim planı — saf modül. Birim mm.
// Yerleşim koordinatı: x = kumaş boyu (çözgü / düz boy yönü), y = kumaş eni (0 … kullanılabilir en).
// Parçalar düz boy çizgisi x eksenine paralel olacak şekilde döndürülür (0° ya da 180°; havlı kumaşta yalnız 0°).
// Serim: 'single' — açık en, tek kat, yüz yukarı (katlı kalıp açılır, çift parçanın biri ters çevrilir)
//        'folded' — en ortadan katlı, iki kat (y = 0 kat çizgisi; her yerleşim iki parça keser; kat kenarlı parça kat çizgisine oturur)
// Otomatik yerleşim: ızgara (res mm) üzerinde en küçük x, sonra en küçük y'ye sığdırma (bottom-left). Sonuç kesin çokgen
// çakışma testiyle ayrıca doğrulanır; "en iyi" (optimum) iddiası yoktur.
import * as C from '../curve.js?v=20261112h';
import * as P from './pattern.js?v=20261112h';

const cross = (a, b) => a[0] * b[1] - a[1] * b[0];

/* ---------- parça örnekleri ---------- */
export function instancesFor(pieces, mode) {
  const out = [], warn = [];
  for (const pc of pieces) {
    if (!pc.grain) { warn.push(`${pc.name}: düz boy çizgisi yok, yerleştirilemez`); continue; }
    if (mode === 'folded') {
      // kat kenarı düz boya paralel değilse (ör. yaka ayağının arka ortası) boyuna katlı kumaşın katına oturamaz: açılıp normal kesilir
      let src = pc, onFold = pc.fold != null;
      if (onFold) {
        const e = pc.edges[pc.fold], d = C.sub(e.segs.at(-1).b, e.segs[0].a), g = C.sub(pc.grain[1], pc.grain[0]);
        if (Math.abs(cross(d, g)) / (Math.hypot(...d) * Math.hypot(...g)) > Math.sin(Math.PI / 180)) {
          src = P.unfoldPiece(pc, pc.fold); src.grain = pc.grain; onFold = false;
          warn.push(`${pc.name}: kat kenarı düz boya dik; katlı kumaşta açılmış olarak kesilir`);
        }
      }
      const n = onFold ? pc.qty : Math.ceil(pc.qty / 2);
      if (!onFold && pc.qty % 2) warn.push(`${pc.name}: adet ${pc.qty} tek; katlı kumaşta ${n * 2} parça kesilir (1 fazla)`);
      for (let k = 0; k < n; k++) out.push({ pc: src, src: pc, key: `${pc.id}#${k}`, onFold, flip: false, yields: onFold ? 1 : 2 });
    } else {
      const base = pc.fold != null ? P.unfoldPiece(pc, pc.fold) : pc;
      if (pc.fold != null) base.grain = pc.grain;
      for (let k = 0; k < pc.qty; k++) out.push({ pc: base, src: pc, key: `${pc.id}#${k}`, onFold: false, flip: !!pc.pair && k % 2 === 1, yields: 1 });
    }
  }
  return { list: out, warn };
}

// Parçanın kesim çokgenini yerleşim yönüne çevir: düz boy +x, rot 180 → ters, flip → x eksenine göre aynala.
// onFold: kat kenarı y = 0'a, parça y > 0 tarafına oturtulur. Dönüş: köşeleri min x = 0, min y = 0 olacak şekilde
export function orient(inst, rot = 0) {
  const pc = inst.pc, g = C.sub(pc.grain[1], pc.grain[0]), a = -Math.atan2(g[1], g[0]) + (rot ? Math.PI : 0);
  const cs = Math.cos(a), sn = Math.sin(a), sy = inst.flip ? -1 : 1;
  const T = (p) => [p[0] * cs - p[1] * sn, sy * (p[0] * sn + p[1] * cs)];
  let pts = P.cutPolygon(pc).pts.map(T);
  let foldY = null;
  if (inst.onFold) {
    const e = pc.edges[pc.fold], fy = T(e.segs[0].a)[1], fy2 = T(e.segs.at(-1).b)[1];
    if (Math.abs(fy - fy2) > 0.5) throw new Error(`${pc.name}: kumaş katı kenarı düz boya paralel değil`);
    const cy = pts.reduce((s, p) => s + p[1], 0) / pts.length;
    if (cy < fy) { pts = pts.map((p) => [p[0], 2 * fy - p[1]]); }
    foldY = fy;
  }
  const minX = Math.min(...pts.map((p) => p[0])), minY = inst.onFold ? foldY : Math.min(...pts.map((p) => p[1]));
  pts = pts.map((p) => [p[0] - minX, p[1] - minY]);
  // kat kenarındaki pay 0 olduğu için kesim çokgeni y = 0'a dayanır; sayısal hata payını sıfırla
  if (inst.onFold) pts = pts.map((p) => [p[0], Math.max(0, p[1])]);
  return { pts, w: Math.max(...pts.map((p) => p[0])), h: Math.max(...pts.map((p) => p[1])), T, minX, minY, rot, flip: inst.flip };
}

/* ---------- ızgara ---------- */
// Tutucu (konservatif) tarama: hücre çokgenle (gap kadar şişirilmiş) iç alanda kesişiyorsa dolu.
// Yalnız sınırda değen hücre (kenar tam ızgara çizgisinde) dolu sayılmaz → tam sığan parçalar boşa hücre harcamaz.
const EPS = 1e-7;
function rasterize(pts, res, gap) {
  const H = Math.max(...pts.map((p) => p[1])), W = Math.max(...pts.map((p) => p[0]));
  const nr = Math.ceil((H + gap) / res - EPS), rows = [];
  const n = pts.length;
  for (let r = 0; r < nr; r++) {
    const y0 = r * res - gap + EPS, y1 = (r + 1) * res + gap - EPS;
    let lo = Infinity, hi = -Infinity;
    // şerit içindeki tarama çizgileri ve köşeler
    for (let k = 0; k <= 6; k++) {
      const y = y0 + (y1 - y0) * k / 6;
      for (let i = 0; i < n; i++) { const a = pts[i], b = pts[(i + 1) % n]; if ((a[1] <= y && b[1] >= y) || (b[1] <= y && a[1] >= y)) { const x = Math.abs(b[1] - a[1]) < 1e-12 ? Math.min(a[0], b[0]) : a[0] + (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]); lo = Math.min(lo, x, Math.abs(b[1] - a[1]) < 1e-12 ? Math.min(a[0], b[0]) : x); hi = Math.max(hi, x, Math.abs(b[1] - a[1]) < 1e-12 ? Math.max(a[0], b[0]) : x); } }
    }
    for (const p of pts) if (p[1] >= y0 && p[1] <= y1) { lo = Math.min(lo, p[0]); hi = Math.max(hi, p[0]); }
    if (lo <= hi) rows.push([r, Math.floor((lo - gap) / res + EPS), Math.max(Math.floor((lo - gap) / res + EPS), Math.ceil((hi + gap) / res - EPS) - 1)]);
  }
  return { rows, cw: Math.ceil((W + gap) / res) + 1 };
}

/* ---------- otomatik yerleşim ---------- */
// opts: { width (kullanılabilir en, mm), res, gap, nap, repeat: { x, y } (desen raporu, mm), maxLength }
export function autoNest(insts, { width, res = 5, gap = 2, nap = false, repeat = null, order: ord = 'area' } = {}) {
  if (!(width > 0)) throw new Error('Kullanılabilir kumaş eni bilinmiyor');
  const ny = Math.floor(width / res);
  let cols = 64, grid = new Uint8Array(cols * ny);
  const pref = () => { const s = new Int32Array((cols + 1) * ny); for (let y = 0; y < ny; y++) { let acc = 0; for (let x = 0; x < cols; x++) { acc += grid[x * ny + y]; s[(x + 1) * ny + y] = acc; } } return s; };
  // satır (y) bazında prefix: s[(x+1)*ny + y] = Σ grid[0..x][y]
  const grow = (need) => { if (need <= cols) return; let nc = cols; while (nc < need) nc *= 2; const g2 = new Uint8Array(nc * ny); g2.set(grid); grid = g2; cols = nc; };
  const key = { area: (o) => o.w * o.h, height: (o) => o.h, length: (o) => o.w, perim: (o) => o.w + o.h }[ord] || ((o) => o.w * o.h);
  const order = insts.map((it) => ({ it, o0: orient(it, 0) })).sort((a, b) => key(b.o0) - key(a.o0));
  const placed = [], fails = [];
  let firstFree = new Int32Array(ny);
  for (const { it } of order) {
    let best = null;
    for (const rot of nap ? [0] : [0, 180]) {
      const o = orient(it, rot), R = rasterize(o.pts, res, gap);
      const pr = R.rows; if (!pr.length) continue;
      const hRows = pr[pr.length - 1][0] + 1;
      if (o.h > width + 1e-6) continue;
      grow(Math.max(...firstFree) + R.cw + 2);
      const S = pref();
      const sum = (y, x0, x1) => (x1 < x0 ? 0 : S[(x1 + 1) * ny + y] - S[x0 * ny + y]);
      const yCands = it.onFold ? [0] : [...Array(Math.max(0, ny - hRows + 1)).keys()];
      let startX = Infinity; for (const y of yCands) startX = Math.min(startX, firstFree[y]);
      startX = Math.max(0, Math.min(startX, cols) - R.cw);
      for (let x = startX; x < cols && (!best || x * res < best.x + 1e-9); x++) {
        for (const y of yCands) {
          if (y + hRows > ny) break;
          let ok = true;
          for (const [r, c0, c1] of pr) { const yy = y + r; if (yy >= ny) { ok = false; break; } if (sum(yy, Math.max(0, x + c0), Math.min(cols - 1, x + c1)) || x + c1 >= cols) { ok = false; break; } }
          if (!ok) continue;
          let X = x * res, Y = y * res;
          if (repeat && (repeat.x > 0 || repeat.y > 0)) {
            // desen eşleştirme: düz boy ortası rapor ızgarasına; yeni konumda yeniden dene
            const g = C.mul(C.add(it.pc.grain[0], it.pc.grain[1]), 0.5), q = o.T(g), gx = q[0] - o.minX + X, gy = q[1] - o.minY + Y;
            const dx = repeat.x > 0 ? (Math.ceil(gx / repeat.x) * repeat.x - gx) : 0, dy = repeat.y > 0 && !it.onFold ? (Math.ceil(gy / repeat.y) * repeat.y - gy) : 0;
            if (dx || dy) {
              // kaymış konumu gerçek ofsetiyle yeniden tara (ızgaraya oturmayan konum da tutucu kalır)
              const NX = X + dx, NY = Y + dy, xx = Math.floor(NX / res + 1e-9), yy0 = Math.floor(NY / res + 1e-9), ox = NX - xx * res, oy = NY - yy0 * res;
              const Rs = ox > 1e-9 || oy > 1e-9 ? rasterize(o.pts.map((p) => [p[0] + ox, p[1] + oy]), res, gap) : R;
              let ok2 = true; grow(xx + Rs.cw + 2);
              for (const [r, c0, c1] of Rs.rows) { const yr = yy0 + r; if (yr >= ny || xx + c1 >= cols || sum(yr, Math.max(0, xx + c0), xx + c1)) { ok2 = false; break; } }
              if (!ok2) continue; X = NX; Y = NY;
            }
          }
          if (!best || X < best.x - 1e-9 || (Math.abs(X - best.x) < 1e-9 && Y < best.y)) best = { x: X, y: Y, rot, o, R };
          break;
        }
      }
    }
    if (!best) { fails.push(it.pc.name); continue; }
    // ızgarayı işaretle (desen eşleştirmesiyle kayan konumu da kapsayacak şekilde yeniden tara)
    const gx = Math.floor(best.x / res), gy = Math.floor(best.y / res), ox = best.x - gx * res, oy = best.y - gy * res;
    const Rs = ox || oy ? rasterize(best.o.pts.map((p) => [p[0] + ox, p[1] + oy]), res, gap) : best.R;
    grow(gx + Rs.cw + 2);
    for (const [r, c0, c1] of Rs.rows) { const yy = gy + r; if (yy >= ny) continue; for (let x = Math.max(0, gx + c0); x <= gx + c1; x++) grid[x * ny + yy] = 1; }
    for (let y = 0; y < ny; y++) { let x = firstFree[y]; while (x < cols && grid[x * ny + y]) x++; firstFree[y] = x; }
    placed.push({ key: it.key, piece: (it.src || it.pc).id, x: best.x, y: best.y, rot: best.rot, flip: it.flip, onFold: it.onFold, yields: it.yields });
  }
  return { placed, fails };
}

/* ---------- yerleşim geometrisi, doğrulama, istatistik ---------- */
export function placedPolygon(inst, pl) { const o = orient(inst, pl.rot); return o.pts.map((p) => [p[0] + pl.x, p[1] + pl.y]); }
function polysOverlap(A, B) {
  const bb = (P_) => [Math.min(...P_.map((p) => p[0])), Math.min(...P_.map((p) => p[1])), Math.max(...P_.map((p) => p[0])), Math.max(...P_.map((p) => p[1]))];
  const a = bb(A), b = bb(B);
  if (a[2] <= b[0] + 1e-6 || b[2] <= a[0] + 1e-6 || a[3] <= b[1] + 1e-6 || b[3] <= a[1] + 1e-6) return false;
  for (let i = 0; i < A.length; i++) for (let j = 0; j < B.length; j++) {
    const p = A[i], q = A[(i + 1) % A.length], r = B[j], s = B[(j + 1) % B.length];
    const d1 = cross(C.sub(q, p), C.sub(r, p)), d2 = cross(C.sub(q, p), C.sub(s, p)), d3 = cross(C.sub(s, r), C.sub(p, r)), d4 = cross(C.sub(s, r), C.sub(q, r));
    if (((d1 > 1e-6 && d2 < -1e-6) || (d1 < -1e-6 && d2 > 1e-6)) && ((d3 > 1e-6 && d4 < -1e-6) || (d3 < -1e-6 && d4 > 1e-6))) return true;
  }
  // biri ötekinin içinde mi
  const cA = A.reduce((s, p) => C.add(s, p), [0, 0]).map((v) => v / A.length), cB = B.reduce((s, p) => C.add(s, p), [0, 0]).map((v) => v / B.length);
  return P.insidePoly(B, cA) || P.insidePoly(A, cB);
}
// marker = { mode, width (kullanılabilir), nap, placements }  — pieces: proje parçaları
export function evaluate(pieces, marker) {
  const { list, warn } = instancesFor(pieces, marker.mode);
  const byKey = new Map(list.map((it) => [it.key, it]));
  const polys = [], issues = warn.map((m) => ({ level: /yerleştirilemez/.test(m) ? 'hata' : 'uyarı', msg: m }));
  for (const pl of marker.placements) {
    const it = byKey.get(pl.key);
    if (!it) { issues.push({ level: 'hata', msg: `Yerleşimde artık olmayan parça: ${pl.key}` }); continue; }
    if (marker.nap && pl.rot) issues.push({ level: 'hata', msg: `${it.pc.name}: havlı kumaşta ters (180°) yerleştirilemez` });
    polys.push({ pl, it, pts: placedPolygon(it, pl) });
  }
  const placedKeys = new Set(marker.placements.map((p) => p.key));
  for (const it of list) if (!placedKeys.has(it.key)) issues.push({ level: 'hata', msg: `${it.pc.name} yerleşmedi (${it.key})` });
  for (const q of polys) {
    const b = P.bboxPts(q.pts);
    if (b.y0 < -0.5 || b.y1 > marker.width + 0.5 || b.x0 < -0.5) issues.push({ level: 'hata', msg: `${q.it.pc.name}: kumaş eninin dışında` });
    if (q.it.onFold && Math.abs(b.y0) > 0.5) issues.push({ level: 'hata', msg: `${q.it.pc.name}: kumaş katı kenarı kat çizgisinde değil` });
  }
  for (let i = 0; i < polys.length; i++) for (let j = i + 1; j < polys.length; j++) if (polysOverlap(polys[i].pts, polys[j].pts)) issues.push({ level: 'hata', msg: `${polys[i].it.pc.name} ile ${polys[j].it.pc.name} üst üste` });
  const length = polys.length ? Math.max(...polys.map((q) => P.bboxPts(q.pts).x1)) : 0;
  const used = polys.reduce((s, q) => s + P.polyArea(q.pts), 0);
  const layers = marker.mode === 'folded' ? 2 : 1;
  const eff = length > 0 ? used / (length * marker.width) : 0;
  const pieceCount = polys.reduce((s, q) => s + q.it.yields, 0);
  return { polys, issues, length, usedArea: used * layers, fabricArea: length * marker.width * layers, efficiency: eff, waste: 1 - eff, pieceCount, layers };
}
// Kumaş kartı + ayarlardan tam bir yerleşim üret
export function makeMarker(pieces, fabric, { mode = 'single', selvedge = 10, gap = 2, res = 5, patternMatch = false } = {}) {
  const pr = fabric?.props || {};
  if (!(pr.width > 0)) throw new Error(`${fabric?.name || 'Kumaş'}: en bilinmiyor`);
  const full = pr.width - 2 * selvedge, width = mode === 'folded' ? full / 2 : full;
  const nap = !!pr.nap, repeat = patternMatch ? { x: pr.repeatH || 0, y: pr.repeatW || 0 } : null;
  if (patternMatch && !(pr.repeatH > 0 || pr.repeatW > 0)) throw new Error('Desen eşleştirme için kumaş kartında desen raporu (en / boy) gerekli');
  const { list, warn } = instancesFor(pieces, mode);
  // birkaç sıralama denenir, en kısa yerleşim seçilir (hepsi yerleştiyse)
  const t0 = Date.now(); let r = null, bestLen = Infinity, tried = [];
  for (const order of ['area', 'height', 'length', 'perim']) {
    const q = autoNest(list, { width, res, gap, nap, repeat, order });
    const len = q.placed.length ? Math.max(...q.placed.map((pl) => { const it = list.find((x) => x.key === pl.key); return pl.x + orient(it, pl.rot).w; })) : Infinity;
    tried.push({ order, length: len, fails: q.fails.length });
    if (q.fails.length < (r ? r.fails.length : Infinity) || (q.fails.length === (r ? r.fails.length : 0) && len < bestLen)) { r = q; bestLen = len; }
  }
  const m = { mode, fabricWidth: pr.width, selvedge, width, gap, res, nap, repeat, patternMatch, placements: r.placed, ms: Date.now() - t0, tried };
  const ev = evaluate(pieces, m);
  m.length = ev.length; m.efficiency = ev.efficiency;
  m.constraints = [
    `Kumaş eni ${pr.width} mm − 2 × ${selvedge} mm kenar = ${full} mm kullanılabilir${mode === 'folded' ? `; ortadan katlı, iki kat (${width} mm)` : '; açık en, tek kat'}`,
    nap ? 'Havlı / yönlü kumaş: bütün parçalar aynı yönde (döndürme yok)' : 'Yönsüz kumaş: parçalar 0° ya da 180°',
    'Düz boy çizgileri kumaş boyuna paralel', `Parçalar arası en az ${gap} mm`, `Arama ızgarası ${res} mm (yerleşim bu çözünürlükte; çakışma kesin çokgen testiyle denetlendi)`,
    ...(repeat ? [`Desen eşleştirme: düz boy ortaları ${repeat.x || '—'} × ${repeat.y || '—'} mm rapor ızgarasında`] : []),
    'Otomatik yerleşim sezgiseldir (en sola / en alta sığdırma, 4 sıralama denendi, en kısası seçildi); en iyi sonuç garantisi yoktur. Kesimden önce operatör kontrol etmelidir.',
  ];
  return { marker: m, fails: r.fails, warn, eval: ev };
}
