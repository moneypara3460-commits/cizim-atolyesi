// Çizim Atölyesi — CNC freze takım yolu (CAM) çekirdeği. 3 eksen dik işleme merkezi / router için.
// Model üstten yükseklik haritasına (Z-map) çevrilir; takım güvenli bölgesi uzaklık alanıyla (EDT) bulunur.
// İşlemler: yüzey alma, kaba boşaltma (Z seviyeli, ofset kontur), duvar ince işleme (kontur), 3B paralel ince işleme
// (drop-cutter), delik delme (G81 / G83). Malzeme kaldırma simülasyonu, kalan malzeme ve dalma kontrolü, G-kodu (Fanuc, Mach3/LinuxCNC, GRBL).
// Makine ekseni: X sağa (dünya X), Y ileri (dünya −Z), Z yukarı (dünya Y). Birim mm, mm/dk.

/* ---------- kesme değerleri (karbür parmak freze, başlangıç değeri) ---------- */
// Vc: kesme hızı (m/dk), fz: diş başı ilerleme (Ø10 için, mm/diş), ap: paso derinliği oranı (× çap) — tipik katalog değerleri
export const CUT_DATA = {
  aluminyum: { name: 'Alüminyum', Vc: 250, fz: 0.06, ap: 0.5 },
  celik: { name: 'Yapı çeliği', Vc: 100, fz: 0.04, ap: 0.3 },
  paslanmaz: { name: 'Paslanmaz', Vc: 70, fz: 0.03, ap: 0.25 },
  pirinc: { name: 'Pirinç / bakır', Vc: 150, fz: 0.05, ap: 0.4 },
  titanyum: { name: 'Titanyum', Vc: 50, fz: 0.03, ap: 0.2 },
  plastik: { name: 'Plastik', Vc: 200, fz: 0.08, ap: 0.6 },
  ahsap: { name: 'Ahşap / MDF', Vc: 400, fz: 0.1, ap: 0.8 },
};
export function matKeyFor(id) {
  if (/al/.test(id || '') && !/sap/.test(id)) return 'aluminyum';
  if (id === 'paslanmaz') return 'paslanmaz';
  if (id === 'pirinc' || id === 'bakir') return 'pirinc';
  if (id === 'titanyum') return 'titanyum';
  if (['pla', 'abs', 'petg', 'naylon'].includes(id)) return 'plastik';
  if (['cam', 'ahsap', 'kayin', 'kontrplak', 'mdf'].includes(id)) return 'ahsap';
  return 'celik';
}
export const TOOL_TYPES = { flat: 'Düz parmak freze', ball: 'Küresel uçlu freze', drill: 'Matkap' };
// devir (d/dk), ilerleme (mm/dk), dalma ilerlemesi
export function suggestCut(mk, tool, maxRpm = 24000) {
  const C = CUT_DATA[mk] || CUT_DATA.celik, D = Math.max(0.5, tool.d);
  let rpm = (C.Vc * 1000) / (Math.PI * D);
  const capped = rpm > maxRpm; rpm = Math.min(rpm, maxRpm);
  if (tool.type === 'drill') { const f = C.fz * 1.6 * Math.min(1.5, D / 10); return { rpm: Math.round(rpm * 0.6), feed: Math.round(rpm * 0.6 * f), plunge: Math.round(rpm * 0.6 * f), capped }; }
  const fz = C.fz * Math.min(1.6, Math.max(0.3, D / 10)), feed = rpm * fz * (tool.flutes || 2);
  return { rpm: Math.round(rpm), feed: Math.round(feed), plunge: Math.round(feed * 0.3), ap: +(C.ap * D).toFixed(2), capped };
}
export const STD_DRILLS = (() => { const a = []; for (let d = 1; d <= 13.001; d += 0.1) a.push(+d.toFixed(1)); for (let d = 13.5; d <= 20.001; d += 0.5) a.push(d); return a; })();
export const nearestDrill = (d) => STD_DRILLS.reduce((b, x) => (Math.abs(x - d) < Math.abs(b - d) ? x : b), STD_DRILLS[0]);

/* ---------- model hazırlama ---------- */
// dünya üçgenleri (Float32Array, x y z …) → makine koordinatı (X = x, Y = −z, Z = y)
export function toMachine(tris) {
  const o = new Float32Array(tris.length);
  for (let i = 0; i < tris.length; i += 3) { o[i] = tris[i]; o[i + 1] = -tris[i + 2]; o[i + 2] = tris[i + 1]; }
  return o;
}
export function boundsOf(t) {
  const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < t.length; i += 3) for (let k = 0; k < 3; k++) { if (t[i + k] < mn[k]) mn[k] = t[i + k]; if (t[i + k] > mx[k]) mx[k] = t[i + k]; }
  return { min: mn, max: mx };
}
export function volumeOf(t) { let v = 0; for (let i = 0; i < t.length; i += 9) v += (t[i] * (t[i + 4] * t[i + 8] - t[i + 5] * t[i + 7]) - t[i + 1] * (t[i + 3] * t[i + 8] - t[i + 5] * t[i + 6]) + t[i + 2] * (t[i + 3] * t[i + 7] - t[i + 4] * t[i + 6])) / 6; return Math.abs(v); }
// yükseklik haritası: her hücre merkezinde modelin en üst yüzeyi (yoksa −∞)
export function heightMap(t, G) {
  const { nx, ny, ox, oy, res } = G, H = new Float32Array(nx * ny).fill(-Infinity);
  for (let i = 0; i < t.length; i += 9) {
    const ax = t[i], ay = t[i + 1], az = t[i + 2], bx = t[i + 3], by = t[i + 4], bz = t[i + 5], cx = t[i + 6], cy = t[i + 7], cz = t[i + 8];
    const d = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy);
    if (Math.abs(d) < 1e-12) continue;
    const i0 = Math.max(0, Math.ceil((Math.min(ax, bx, cx) - ox) / res - 0.5)), i1 = Math.min(nx - 1, Math.floor((Math.max(ax, bx, cx) - ox) / res - 0.5));
    const j0 = Math.max(0, Math.ceil((Math.min(ay, by, cy) - oy) / res - 0.5)), j1 = Math.min(ny - 1, Math.floor((Math.max(ay, by, cy) - oy) / res - 0.5));
    for (let j = j0; j <= j1; j++) {
      const py = oy + (j + 0.5) * res;
      for (let ii = i0; ii <= i1; ii++) {
        const px = ox + (ii + 0.5) * res;
        const l1 = ((by - cy) * (px - cx) + (cx - bx) * (py - cy)) / d, l2 = ((cy - ay) * (px - cx) + (ax - cx) * (py - cy)) / d, l3 = 1 - l1 - l2;
        if (l1 < -1e-9 || l2 < -1e-9 || l3 < -1e-9) continue;
        const z = l1 * az + l2 * bz + l3 * cz, c = ii + nx * j;
        if (z > H[c]) H[c] = z;
      }
    }
  }
  return H;
}
/* ---------- uzaklık alanı (Felzenszwalb–Huttenlocher, kesin Öklid) ---------- */
function dt1(f, n, d, v, z) {
  let k = 0; v[0] = 0; z[0] = -Infinity; z[1] = Infinity;
  for (let q = 1; q < n; q++) {
    let s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    while (s <= z[k]) { k--; s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]); }
    k++; v[k] = q; z[k] = s; z[k + 1] = Infinity;
  }
  k = 0;
  for (let q = 0; q < n; q++) { while (z[k + 1] < q) k++; const p = v[k]; d[q] = (q - p) * (q - p) + f[p]; }
}
// mask[c] = 1 yasak hücre → her hücrenin en yakın yasak hücreye uzaklığı (hücre birimi)
export function edt(mask, nx, ny) {
  const INF = 1e20, n = Math.max(nx, ny), f = new Float64Array(n), d = new Float64Array(n), v = new Int32Array(n), z = new Float64Array(n + 1), D = new Float64Array(nx * ny);
  let any = false;
  for (let c = 0; c < nx * ny; c++) { D[c] = mask[c] ? 0 : INF; if (mask[c]) any = true; }
  if (!any) return null;
  for (let i = 0; i < nx; i++) { for (let j = 0; j < ny; j++) f[j] = D[i + nx * j]; dt1(f, ny, d, v, z); for (let j = 0; j < ny; j++) D[i + nx * j] = d[j]; }
  for (let j = 0; j < ny; j++) { for (let i = 0; i < nx; i++) f[i] = D[i + nx * j]; dt1(f, nx, d, v, z); for (let i = 0; i < nx; i++) D[i + nx * j] = d[i]; }
  const out = new Float32Array(nx * ny); for (let c = 0; c < out.length; c++) out[c] = Math.sqrt(D[c]);
  return out;
}
/* ---------- eş değer eğrileri (marching squares) ---------- */
// F: hücre merkezlerindeki değer, L: seviye; dom(i,j): hücre etki alanında mı. Dönüş: [[x,y]…] hücre koordinatı (merkez = i, j)
export function isolines(F, nx, ny, L, dom) {
  const segs = [];
  const val = (i, j) => F[i + nx * j];
  const key = (a) => a[2];
  for (let j = 0; j + 1 < ny; j++) for (let i = 0; i + 1 < nx; i++) {
    if (dom && !(dom(i, j) && dom(i + 1, j) && dom(i, j + 1) && dom(i + 1, j + 1))) continue;
    const a = val(i, j), b = val(i + 1, j), c = val(i + 1, j + 1), d = val(i, j + 1);
    const idx = (a >= L ? 1 : 0) | (b >= L ? 2 : 0) | (c >= L ? 4 : 0) | (d >= L ? 8 : 0);
    if (idx === 0 || idx === 15) continue;
    const t = (u, w) => (Math.abs(w - u) < 1e-12 ? 0.5 : (L - u) / (w - u));
    const E = { B: () => [i + t(a, b), j, 'h' + i + ',' + j], R: () => [i + 1, j + t(b, c), 'v' + (i + 1) + ',' + j], T: () => [i + t(d, c), j + 1, 'h' + i + ',' + (j + 1)], Lf: () => [i, j + t(a, d), 'v' + i + ',' + j] };
    const add = (p, q) => segs.push([E[p](), E[q]()]);
    switch (idx) {
      case 1: case 14: add('Lf', 'B'); break;
      case 2: case 13: add('B', 'R'); break;
      case 3: case 12: add('Lf', 'R'); break;
      case 4: case 11: add('R', 'T'); break;
      case 6: case 9: add('B', 'T'); break;
      case 7: case 8: add('Lf', 'T'); break;
      case 5: case 10: { const m = (a + b + c + d) / 4; if ((m >= L) === (idx === 5)) { add('Lf', 'T'); add('B', 'R'); } else { add('Lf', 'B'); add('R', 'T'); } break; }
    }
  }
  // parçaları zincirle: önce açık uçlu zincirler, sonra kapalı döngüler
  const adj = new Map(), P = new Map();
  segs.forEach((sg, k) => { for (const p of sg) { if (!adj.has(p[2])) adj.set(p[2], []); adj.get(p[2]).push(k); P.set(p[2], [p[0], p[1]]); } });
  const used = new Uint8Array(segs.length), out = [];
  const trace = (k, startKey) => {
    const line = [P.get(startKey)]; let curK = startKey, sg = k;
    while (sg != null) {
      used[sg] = 1;
      const e = segs[sg][0][2] === curK ? segs[sg][1][2] : segs[sg][0][2];
      line.push(P.get(e)); curK = e;
      sg = (adj.get(e) || []).find((q) => !used[q]);
    }
    return { pts: line, closed: curK === startKey && line.length > 3 };
  };
  for (let k = 0; k < segs.length; k++) {
    if (used[k]) continue;
    const e0 = segs[k][0][2], e1 = segs[k][1][2];
    if (adj.get(e0).length === 1) out.push(trace(k, e0)); else if (adj.get(e1).length === 1) out.push(trace(k, e1));
  }
  for (let k = 0; k < segs.length; k++) if (!used[k]) out.push(trace(k, segs[k][0][2]));
  return out;
}
// Douglas–Peucker
export function simplify(pts, tol) {
  if (pts.length < 3) return pts;
  const n = pts.length - 1;
  if (Math.hypot(pts[0][0] - pts[n][0], pts[0][1] - pts[n][1]) <= tol) {   // kapalı: en uzak noktadan ikiye böl
    let mi = 1, md = -1; for (let i = 1; i < n; i++) { const d = Math.hypot(pts[i][0] - pts[0][0], pts[i][1] - pts[0][1]); if (d > md) { md = d; mi = i; } }
    if (md <= tol) return [pts[0]];
    const A = simplify(pts.slice(0, mi + 1), tol), B = simplify(pts.slice(mi), tol);
    return A.concat(B.slice(1));
  }
  const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1;
  const st = [[0, pts.length - 1]];
  while (st.length) {
    const [a, b] = st.pop(); let md = -1, mi = -1;
    const [x1, y1] = pts[a], [x2, y2] = pts[b], dx = x2 - x1, dy = y2 - y1, L = Math.hypot(dx, dy) || 1e-12;
    for (let i = a + 1; i < b; i++) { const d = Math.abs((pts[i][0] - x1) * dy - (pts[i][1] - y1) * dx) / L; if (d > md) { md = d; mi = i; } }
    if (md > tol) { keep[mi] = 1; st.push([a, mi], [mi, b]); }
  }
  return pts.filter((_, i) => keep[i]);
}

/* ---------- iş hazırlığı ---------- */
// job: { tris (dünya), holes: [{x, z, d, top, bottom}] (dünya), stock: {side, top, bottom}, zero: 'corner'|'center', res, safe, tools, ops, mk }
export function prepare(job) {
  const t = toMachine(job.tris), b = boundsOf(t), st = job.stock || {};
  const side = st.side ?? 2, top = st.top ?? 1, bot = st.bottom ?? 0;
  const stock = { x0: b.min[0] - side, x1: b.max[0] + side, y0: b.min[1] - side, y1: b.max[1] + side, zTop: b.max[2] + top, zBot: b.min[2] - bot, modelTop: b.max[2], modelBot: b.min[2] };
  const rMax = Math.max(1, ...(job.tools || []).map((x) => x.d / 2));
  const sx = stock.x1 - stock.x0 + 2 * rMax + 2, sy = stock.y1 - stock.y0 + 2 * rMax + 2;
  let res = job.res || 0.5;
  while ((sx / res) * (sy / res) > (job.maxCells || 1.6e6)) res *= 1.25;
  const nx = Math.ceil(sx / res), ny = Math.ceil(sy / res), ox = stock.x0 - rMax - 1, oy = stock.y0 - rMax - 1;
  const G = { nx, ny, ox, oy, res };
  const H = heightMap(t, G);
  const zero = job.zero === 'center' ? [(stock.x0 + stock.x1) / 2, (stock.y0 + stock.y1) / 2, stock.zTop] : job.zero === 'bottom' ? [stock.x0, stock.y0, stock.zBot] : [stock.x0, stock.y0, stock.zTop];
  // üstten görünmeyen hacim (alt kesilme): model hacmi < yükseklik haritası hacmi
  let vMap = 0; for (let c = 0; c < H.length; c++) if (H[c] > -Infinity) vMap += (H[c] - b.min[2]) * res * res;
  const vModel = volumeOf(t);
  const holes = (job.holes || []).map((h) => ({ x: h.x, y: -h.z, d: h.d, top: h.top, bottom: h.bottom }));
  return { t, b, stock, G, H, zero, holes, undercut: vMap > vModel * 1.03 + res * res * 4 ? (vMap - vModel) : 0, vModel, vMap };
}
const inStock = (S, x, y) => x >= S.x0 - 1e-9 && x <= S.x1 + 1e-9 && y >= S.y0 - 1e-9 && y <= S.y1 + 1e-9;

/* ---------- takım yolları ---------- */
// Hareket: { k: 'r' hızlı | 'f' kesme | 'p' dalma | 'd' delme, x, y, z, f }  (makine koordinatı, sıfır kaydırması G-kodunda)
function linker(P, moves, safe) {
  let cx = null, cy = null, cz = safe;
  return {
    rapidTo(x, y, z) { moves.push({ k: 'r', x, y, z }); cx = x; cy = y; cz = z; },
    feedTo(x, y, z, f) { moves.push({ k: 'f', x, y, z, f }); cx = x; cy = y; cz = z; },
    plungeTo(x, y, z, f) { moves.push({ k: 'p', x, y, z, f }); cx = x; cy = y; cz = z; },
    get pos() { return [cx, cy, cz]; },
    retract() { if (cz < safe) { moves.push({ k: 'r', x: cx, y: cy, z: safe }); cz = safe; } },
  };
}
function cellXY(G, i, j) { return [G.ox + (i + 0.5) * G.res, G.oy + (j + 0.5) * G.res]; }
// Z seviyesinde takım merkezinin modelden uzaklığı (mm); yasak = model üstü z − pay'dan yüksek hücreler
function levelField(P, z, allowZ) {
  const { G, H } = P, mask = new Uint8Array(G.nx * G.ny);
  for (let c = 0; c < mask.length; c++) if (H[c] > z - allowZ + 1e-6) mask[c] = 1;
  const E = edt(mask, G.nx, G.ny);
  if (!E) return null;
  const k = G.res, off = 0.75 * G.res;   // hücre merkezinden gerçek sınıra güvenli düzeltme
  for (let c = 0; c < E.length; c++) E[c] = mask[c] ? -1 : E[c] * k - off;
  return E;
}
function contourPaths(P, E, levels, tol, r) {
  const { G, stock } = P, out = [];
  for (const L of levels) {
    const rr = r;
    const dom = (i, j) => { const [x, y] = cellXY(G, i, j); return x >= stock.x0 - rr - G.res && x <= stock.x1 + rr + G.res && y >= stock.y0 - rr - G.res && y <= stock.y1 + rr + G.res; };
    for (const pl of isolines(E, G.nx, G.ny, L, dom)) {
      const pts = simplify(pl.pts.map(([i, j]) => [G.ox + (i + 0.5) * G.res, G.oy + (j + 0.5) * G.res]), tol);
      if (pts.length >= 2) out.push({ L, pts, closed: pl.closed });
    }
  }
  return out;
}
// iki nokta arasında takım derinlikte güvenle gidebilir mi (uzaklık alanı ≥ gereken)
function clearLine(P, E, a, b, need) {
  const { G } = P, n = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / (G.res * 0.7)) + 1;
  for (let s = 0; s <= n; s++) {
    const x = a[0] + (b[0] - a[0]) * s / n, y = a[1] + (b[1] - a[1]) * s / n, i = Math.floor((x - G.ox) / G.res), j = Math.floor((y - G.oy) / G.res);
    if (i < 0 || j < 0 || i >= G.nx || j >= G.ny) return false;
    if (E && E[i + G.nx * j] < need - 1e-6) return false;
  }
  return true;
}
function zLevels(P, from, to, sd, H, aZ = 0, flats = null) {
  const lv = []; let z = from - sd;
  while (z > to + 1e-6) { lv.push(z); z -= sd; }
  lv.push(to);
  // düz taban seviyeleri (cep tabanları, basamaklar): bu yüksekliklerde de geçilir, basamak kalmaz
  // yalnızca gerçekten düz (komşusuyla aynı yükseklikte) ve yeterince geniş alanlar
  const hist = new Map(), { nx } = P.G;
  for (let c = 0; c + nx + 1 < H.length; c++) {
    const h = H[c];
    if (!(h > to + 1e-3 && h < from - 1e-3)) continue;
    if (Math.abs(H[c + 1] - h) > 1e-4 || Math.abs(H[c + nx] - h) > 1e-4) continue;
    const k = Math.round(h * 100) / 100; hist.set(k, (hist.get(k) || 0) + 1);
  }
  const minCells = Math.max(20, 4 / (P.G.res * P.G.res));   // ≥ ~4 mm²
  for (const [h, n] of hist) if (n > minCells && h + aZ < from - 1e-3) { if (flats) flats.add(+(h + aZ).toFixed(4)); if (!lv.some((x) => Math.abs(x - h - aZ) < 0.05)) lv.push(h + aZ); }
  return [...new Set(lv)].sort((a, b) => b - a);
}
// yüzey alma: stok üstünden model üstüne zikzak
function opFacing(P, op, tool, mv) {
  const { stock } = P, r = tool.d / 2, so = tool.d * (op.stepover || 0.7), target = stock.modelTop + (op.allowZ || 0);
  if (stock.zTop - target < 0.005) return { note: 'Stok üstü model üstüyle aynı: yüzey alma gerekmiyor.' };
  const sd = op.stepdown || tool.d * 0.5, zs = [];
  for (let z = stock.zTop - sd; z > target + 1e-6; z -= sd) zs.push(z);
  zs.push(target);
  const L = linker(P, mv, op.safe);
  for (const z of zs) {
    let dir = 1;
    for (let y = stock.y0 + r * 0.4; y <= stock.y1 - r * 0.4 + so - 1e-6; y += so) {
      const yy = Math.min(y, stock.y1 - r * 0.4), xa = dir > 0 ? stock.x0 - r - 1 : stock.x1 + r + 1, xb = dir > 0 ? stock.x1 + r + 1 : stock.x0 - r - 1;
      if (mv.length && L.pos[2] <= z + 1e-6) L.feedTo(xa, yy, z, tool.feed);
      else { L.rapidTo(xa, yy, op.safe); L.rapidTo(xa, yy, z + 1); L.plungeTo(xa, yy, z, tool.plunge); }
      L.feedTo(xb, yy, z, tool.feed); dir = -dir;
    }
    L.retract();
  }
  return {};
}
// kaba boşaltma: Z seviyeleri, her seviyede modelden ofset konturlar (içeriden dışarı)
function opRough(P, op, tool, mv, onProg) {
  const { stock, H } = P, r = tool.d / 2, so = tool.d * (op.stepover || 0.45), aR = op.allowR ?? 0.3, aZ = op.allowZ ?? 0.2;
  const floor = op.floor ?? stock.modelBot, sd = op.stepdown || tool.d * 0.4;
  const zs = zLevels(P, stock.zTop, floor + aZ, sd, H, aZ).filter((z) => z < stock.zTop - 1e-6);
  const L = linker(P, mv, op.safe);
  let lvi = 0, maxDepth = 0;
  for (const z of zs) {
    if (onProg) onProg(++lvi / zs.length);
    const E = levelField(P, z, aZ);
    const need = r + aR;
    if (!E) {   // bu seviyede model yok: zikzak
      let dir = 1;
      for (let y = stock.y0 + r * 0.4; y <= stock.y1 - r * 0.4 + so - 1e-6; y += so) {
        const yy = Math.min(y, stock.y1 - r * 0.4), xa = dir > 0 ? stock.x0 - r - 1 : stock.x1 + r + 1, xb = dir > 0 ? stock.x1 + r + 1 : stock.x0 - r - 1;
        if (L.pos[2] <= z + 1e-6 && L.pos[0] != null && Math.abs(L.pos[1] - yy) <= so + 1e-6) L.feedTo(xa, yy, z, tool.feed); else { L.retract(); L.rapidTo(xa, yy, op.safe); L.rapidTo(xa, yy, z + 1); L.plungeTo(xa, yy, z, tool.plunge); }
        L.feedTo(xb, yy, z, tool.feed); dir = -dir;
      }
      L.retract(); continue;
    }
    // stoktaki işlenecek (yasak olmayan) hücrelerin en büyük uzaklığı; takım L ofsetinde [L−r, L+r] bandını keser
    let maxE = -1;
    for (let c = 0; c < E.length; c++) { if (E[c] < 0) continue; const i = c % P.G.nx, j = (c - i) / P.G.nx, [x, y] = cellXY(P.G, i, j); if (inStock(stock, x, y) && E[c] > maxE) maxE = E[c]; }
    if (maxE < 0) continue;
    const levels = [need]; for (let Lv = need + so; Lv < maxE - r * 0.8; Lv += so) levels.push(Lv);
    const lastL = levels[levels.length - 1];
    if (maxE - r * 0.8 > lastL + so * 0.3) levels.push(maxE - r * 0.8);
    const cs = contourPaths(P, E, levels, Math.min(0.05, P.G.res * 0.25), r).sort((a, b) => b.L - a.L);
    for (const c of cs) {
      const p0 = c.pts[0];
      const [cx, cy, cz] = L.pos;
      if (cz <= z + 1e-6 && cx != null && clearLine(P, E, [cx, cy], p0, need)) L.feedTo(p0[0], p0[1], z, tool.feed);
      else { L.retract(); L.rapidTo(p0[0], p0[1], op.safe); L.rapidTo(p0[0], p0[1], Math.min(op.safe, z + sd + 1)); L.plungeTo(p0[0], p0[1], z, tool.plunge); }
      for (let k = 1; k < c.pts.length; k++) L.feedTo(c.pts[k][0], c.pts[k][1], z, tool.feed);
      if (c.closed) L.feedTo(p0[0], p0[1], z, tool.feed);
    }
    maxDepth = Math.max(maxDepth, stock.zTop - z);
    L.retract();
  }
  return { levels: zs.length, maxDepth };
}
// duvar ve taban ince işleme: her seviyede payı sıfır son kontur; düz tabanlarda (cep tabanı, basamak) taban da tamamen geçilir
function opWalls(P, op, tool, mv) {
  const { stock, H } = P, r = tool.d / 2, floor = op.floor ?? stock.modelBot, sd = op.stepdown || tool.d * 0.5, so = tool.d * 0.6;
  const flats = new Set();
  const zs = zLevels(P, stock.modelTop + 1e-3, floor, sd, H, 0, flats).filter((z) => z < stock.modelTop - 1e-3 || z === floor);
  flats.add(+floor.toFixed(4));
  const L = linker(P, mv, op.safe);
  for (const z of zs) {
    const E = levelField(P, z, 0); if (!E) continue;
    let levels = [r];
    if (flats.has(+z.toFixed(4))) {
      let maxE = -1;
      for (let c = 0; c < E.length; c++) { if (E[c] < 0) continue; const i = c % P.G.nx, j = (c - i) / P.G.nx, [x, y] = cellXY(P.G, i, j); if (inStock(stock, x, y) && E[c] > maxE) maxE = E[c]; }
      for (let Lv = r + so; Lv < maxE - r * 0.8; Lv += so) levels.push(Lv);
      if (maxE - r * 0.8 > levels[levels.length - 1] + so * 0.3) levels.push(maxE - r * 0.8);
    }
    const cs = contourPaths(P, E, levels, Math.min(0.02, P.G.res * 0.2), r).sort((a, b) => b.L - a.L);
    for (const c of cs) {
      const p0 = c.pts[0], [cx, cy, cz] = L.pos;
      if (cz <= z + 1e-6 && cx != null && clearLine(P, E, [cx, cy], p0, r)) L.feedTo(p0[0], p0[1], z, tool.feed);
      else { L.retract(); L.rapidTo(p0[0], p0[1], op.safe); L.rapidTo(p0[0], p0[1], z + 1); L.plungeTo(p0[0], p0[1], z, tool.plunge); }
      for (let k = 1; k < c.pts.length; k++) L.feedTo(c.pts[k][0], c.pts[k][1], z, tool.feed);
      if (c.closed) L.feedTo(p0[0], p0[1], z, tool.feed);
    }
    L.retract();
  }
  return { levels: zs.length, floors: flats.size };
}
// takım izdüşümü: (di, dj, düşüş) — küresel uçta merkezden uzaklaştıkça yüzey yükselir
function footprint(G, tool, extra = 0) { return { R: tool.d / 2, ball: tool.type === 'ball', extra }; }
// drop-cutter: takım ucu (alt nokta) yüksekliği. Uzaklıklar noktanın kendisinden ölçülür (hücreye yuvarlanmaz);
// fp.extra kadar güvenlik halkası: yükseklik haritası hücreler arasını bilmez.
export function dropZ(P, fp, x, y, floor) {
  const { G, H } = P, R = fp.R, ball = fp.ball, re = R + (fp.extra || 0), re2 = re * re;
  const i0 = Math.max(0, Math.floor((x - re - G.ox) / G.res)), i1 = Math.min(G.nx - 1, Math.floor((x + re - G.ox) / G.res));
  const j0 = Math.max(0, Math.floor((y - re - G.oy) / G.res)), j1 = Math.min(G.ny - 1, Math.floor((y + re - G.oy) / G.res));
  let z = floor;
  for (let j = j0; j <= j1; j++) {
    const dy = G.oy + (j + 0.5) * G.res - y, dy2 = dy * dy, row = G.nx * j;
    for (let i = i0; i <= i1; i++) {
      const h = H[row + i]; if (h <= z) continue;
      const dx = G.ox + (i + 0.5) * G.res - x, d2 = dx * dx + dy2;
      if (d2 > re2) continue;
      let v = h;
      if (ball) v = d2 >= R * R ? h - R : h - (R - Math.sqrt(R * R - d2));
      if (v > z) z = v;
    }
  }
  return z;
}
// 3B paralel ince işleme (X yönünde zikzak)
function opFinish3D(P, op, tool, mv, onProg) {
  const { stock, G } = P, so = op.stepover || (tool.type === 'ball' ? tool.d * 0.1 : tool.d * 0.3), floor = op.floor ?? stock.modelBot;
  const fp = footprint(G, tool, G.res * 0.71), step = Math.max(G.res * 2, 0.2), r = tool.d / 2;
  const L = linker(P, mv, op.safe);
  // yalnızca model üstünde (taban düzlüğünde gezinme)
  let dir = 1, row = 0;
  const ys = []; for (let y = stock.y0; y <= stock.y1 + 1e-6; y += so) ys.push(y);
  for (const y of ys) {
    if (onProg) onProg(++row / ys.length);
    const xs = []; for (let x = stock.x0 - r; x <= stock.x1 + r + 1e-6; x += step) xs.push(x);
    if (dir < 0) xs.reverse();
    let run = [];
    const flush = () => {
      if (run.length < 2) { run = []; return; }
      // ardışık noktalar arasında doğrusal hareket yüzeye dalmasın: dik duvar / basamakta araya nokta ekle (ikiye bölme)
      const full = [run[0]];
      const refine = (A, B, dep) => {
        // dörtte bir noktalarda da bak (S biçimli geçişte orta nokta yetmez); en kötü noktadan böl
        let worst = 0, W = null;
        for (const f of [0.25, 0.5, 0.75]) { const mx = A[0] + (B[0] - A[0]) * f, my = A[1] + (B[1] - A[1]) * f, mz = dropZ(P, fp, mx, my, floor), v = mz - (A[2] + (B[2] - A[2]) * f); if (v > worst) { worst = v; W = [mx, my, mz]; } }
        if (worst > 0.003 && dep < 14) { refine(A, W, dep + 1); full.push(W); refine(W, B, dep + 1); }
      };
      for (let k = 1; k < run.length; k++) { refine(run[k - 1], run[k], 0); full.push(run[k]); }
      const pts = simplify3(full, 0.003);
      const [x0, y0, z0] = pts[0], [cx, cy, cz] = L.pos;
      const safeLink = () => { const n = Math.ceil(Math.hypot(cx - x0, cy - y0) / (G.res * 0.5)) + 1; for (let k = 0; k <= n; k++) { const x = cx + (x0 - cx) * k / n, y = cy + (y0 - cy) * k / n, z = cz + (z0 - cz) * k / n; if (dropZ(P, fp, x, y, floor) > z + 0.003) return false; } return true; };
      if (cx != null && cz < op.safe && Math.hypot(cx - x0, cy - y0) <= so * 1.5 + 1e-6 && safeLink()) L.feedTo(x0, y0, z0, tool.feed);
      else { L.retract(); L.rapidTo(x0, y0, op.safe); L.rapidTo(x0, y0, z0 + 1); L.plungeTo(x0, y0, z0, tool.plunge); }
      for (let k = 1; k < pts.length; k++) L.feedTo(pts[k][0], pts[k][1], pts[k][2], tool.feed);
      run = [];
    };
    for (const x of xs) { const z = dropZ(P, fp, x, y, floor); if (z > floor + 1e-3) run.push([x, y, z]); else flush(); }
    flush(); dir = -dir;
  }
  L.retract();
  return { rows: ys.length };
}
function simplify3(pts, tol) {
  // aynı doğru üzerindeki ara noktaları at (XZ düzleminde)
  const out = [pts[0]];
  for (let i = 1; i < pts.length - 1; i++) {
    const a = out[out.length - 1], b = pts[i], c = pts[i + 1], dx = c[0] - a[0], dz = c[2] - a[2], L = Math.hypot(dx, dz) || 1e-12;
    const d = Math.abs((b[0] - a[0]) * dz - (b[2] - a[2]) * dx) / L;
    if (d > tol) out.push(b);
  }
  out.push(pts[pts.length - 1]);
  return out;
}
// delme
function opDrill(P, op, tool, mv, holes) {
  const L = linker(P, mv, op.safe);
  const list = [];
  for (const h of holes) {
    const top = Math.min(h.top, P.stock.zTop), through = h.bottom <= P.stock.modelBot + 0.01;
    const bottom = through ? P.stock.modelBot - tool.d * 0.3 - 0.5 : h.bottom;   // boydan boya: matkap ucu payı
    const z = Math.max(bottom, P.stock.zBot - (through ? tool.d * 0.3 + 0.5 : 0));
    list.push({ x: h.x, y: h.y, top, z, depth: top - z, through });
  }
  // en yakın komşu sırası
  const ord = []; let cur = [P.stock.x0, P.stock.y0]; const left = list.slice();
  while (left.length) { let bi = 0, bd = Infinity; left.forEach((h, i) => { const d = Math.hypot(h.x - cur[0], h.y - cur[1]); if (d < bd) { bd = d; bi = i; } }); const h = left.splice(bi, 1)[0]; ord.push(h); cur = [h.x, h.y]; }
  for (const h of ord) {
    const peck = h.depth > 3 * tool.d ? tool.d : 0, R = h.top + 2;
    L.retract(); L.rapidTo(h.x, h.y, op.safe); L.rapidTo(h.x, h.y, R);
    mv.push({ k: 'd', x: h.x, y: h.y, z: h.z, r: R, q: peck, f: tool.plunge });
    L.rapidTo(h.x, h.y, R);
  }
  L.retract();
  return { holes: ord.length };
}

/* ---------- plan ---------- */
export const OP_NAMES = { face: 'Yüzey alma', rough: 'Kaba boşaltma', walls: 'Duvar ve taban ince işleme', finish: '3B ince işleme (paralel)', drill: 'Delik delme' };
export function plan(job, onProg) {
  const P = prepare(job), out = [], warn = [];
  const safe = P.stock.zTop + (job.safe ?? 5);
  const toolById = (id) => job.tools.find((t) => t.id === id);
  for (const op0 of job.ops) {
    if (!op0.on) continue;
    const tool = toolById(op0.tool);
    if (!tool) { warn.push({ sev: 'crit', t: OP_NAMES[op0.type] + ': takım seçilmedi.' }); continue; }
    const op = { ...op0, safe }, mv = [];
    let info = {};
    const prog = (f) => onProg && onProg(op0.type, f);
    if (op.type === 'face') info = opFacing(P, op, tool, mv);
    else if (op.type === 'rough') info = opRough(P, op, tool, mv, prog);
    else if (op.type === 'walls') info = opWalls(P, op, tool, mv);
    else if (op.type === 'finish') info = opFinish3D(P, op, tool, mv, prog);
    else if (op.type === 'drill') {
      const hs = P.holes.filter((h) => Math.abs(nearestDrill(h.d) - tool.d) < 0.051);
      if (!hs.length) continue;
      info = opDrill(P, op, tool, mv, hs);
    }
    if (info.note) warn.push({ sev: 'info', t: OP_NAMES[op.type] + ': ' + info.note });
    if (mv.length) out.push({ type: op.type, name: OP_NAMES[op.type], tool, moves: mv, info });
    // takım boyu
    const depth = P.stock.zTop - Math.min(...mv.filter((m) => m.k !== 'r').map((m) => m.z), P.stock.zTop);
    if (tool.flute && depth > tool.flute + 1e-6) warn.push({ sev: 'crit', t: OP_NAMES[op.type] + ': işleme derinliği ' + depth.toFixed(1) + ' mm, T' + tool.n + ' kesme boyu ' + tool.flute + ' mm. Takım tutucu parçaya çarpar.' });
  }
  if (P.undercut) warn.push({ sev: 'warn', t: 'Modelin bir kısmı üstten görünmüyor (alttan girinti / yan delik, ~' + Math.round(P.undercut / 1000) + ' cm³). 3 eksende tek bağlamada işlenemez: parçayı çevirip ikinci bağlama ya da 4. eksen gerekir.' });
  const big = P.holes.filter((h) => h.d > 13.01);
  if (big.length) warn.push({ sev: 'info', t: big.length + ' delik Ø13 mm\'den büyük: matkap yerine kaba boşaltma / frezeyle açılır (delme listesine alınmadı).' });
  const odd = P.holes.filter((h) => h.d <= 13.01 && Math.abs(nearestDrill(h.d) - h.d) > 0.051);
  if (odd.length) warn.push({ sev: 'warn', t: odd.map((h) => 'Ø' + h.d.toFixed(2)).join(', ') + ' standart matkap değil; en yakın matkapla delinir, tam ölçü için rayba / frezeyle bitir.' });
  const res = { P, ops: out, warn, safe };
  res.stats = stats(res, job);
  return res;
}
export function stats(R, job) {
  const rapid = job.rapid || 5000;
  let tFeed = 0, tRapid = 0, lFeed = 0, lRapid = 0, n = 0, last = null;
  for (const op of R.ops) {
    for (const m of op.moves) {
      if (m.k === 'd') { const L = (m.r - m.z) * (m.q ? 1 + Math.ceil((m.r - m.z) / m.q) * 0.5 : 1); tFeed += L / m.f; lFeed += L; tRapid += (m.r - m.z) / rapid; last = [m.x, m.y, m.r]; continue; }
      if (last) { const d = Math.hypot(m.x - last[0], m.y - last[1], m.z - last[2]); if (m.k === 'r') { tRapid += d / rapid; lRapid += d; } else { tFeed += d / (m.f || 100); lFeed += d; } }
      last = [m.x, m.y, m.z]; n++;
    }
  }
  const tc = R.ops.length * (job.toolChange ?? 10) / 60;
  return { minutes: tFeed + tRapid + tc, tFeed, tRapid, lFeed, lRapid, moves: n };
}

/* ---------- simülasyon ---------- */
export function simGrid(R, maxCells = 90000) {
  const { G, stock } = R.P;
  let f = 1; while ((G.nx / f) * (G.ny / f) > maxCells) f++;
  const nx = Math.ceil(G.nx / f), ny = Math.ceil(G.ny / f), res = G.res * f;
  const S = new Float32Array(nx * ny);
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) { const x = G.ox + (i + 0.5) * res, y = G.oy + (j + 0.5) * res; S[i + nx * j] = inStock(stock, x, y) ? stock.zTop : -Infinity; }
  return { nx, ny, ox: G.ox, oy: G.oy, res, S, f };
}
// k. harekete kadar (dahil) malzeme kaldır; state = { op, mv, prev }
export function simulate(R, SG, state, budget = Infinity) {
  let done = 0;
  while (state.op < R.ops.length && done < budget) {
    const op = R.ops[state.op], m = op.moves[state.mv];
    if (!m) { state.op++; state.mv = 0; continue; }
    const tool = op.tool, fp = state.fpTool === tool ? state.fp : (state.fpTool = tool, state.fp = simFoot(SG, tool));
    if (m.k === 'd') cutAt(SG, state.fp, m.x, m.y, m.z);
    else if (state.prev && m.k !== 'r') {
      const [x0, y0, z0] = state.prev, L = Math.hypot(m.x - x0, m.y - y0), n = Math.max(1, Math.ceil(L / (SG.res * 0.5)));
      for (let s = 1; s <= n; s++) cutAt(SG, state.fp, x0 + (m.x - x0) * s / n, y0 + (m.y - y0) * s / n, z0 + (m.z - z0) * s / n);
    }
    state.prev = m.k === 'd' ? [m.x, m.y, m.r] : [m.x, m.y, m.z];
    state.mv++; done++;
  }
  return state.op >= R.ops.length;
}
function simFoot(SG, tool) { return { R: tool.d / 2, ball: tool.type === 'ball' }; }
function cutAt(SG, fp, x, y, z) {
  const R = fp.R, R2 = R * R, S = SG.S;
  const i0 = Math.max(0, Math.ceil((x - R - SG.ox) / SG.res - 0.5)), i1 = Math.min(SG.nx - 1, Math.floor((x + R - SG.ox) / SG.res - 0.5));
  const j0 = Math.max(0, Math.ceil((y - R - SG.oy) / SG.res - 0.5)), j1 = Math.min(SG.ny - 1, Math.floor((y + R - SG.oy) / SG.res - 0.5));
  for (let j = j0; j <= j1; j++) {
    const dy = SG.oy + (j + 0.5) * SG.res - y, dy2 = dy * dy, row = SG.nx * j;
    for (let i = i0; i <= i1; i++) {
      const dx = SG.ox + (i + 0.5) * SG.res - x, d2 = dx * dx + dy2;
      if (d2 > R2) continue;
      const v = fp.ball ? z + R - Math.sqrt(R2 - d2) : z, c = row + i;
      if (S[c] > v) S[c] = v;
    }
  }
}
// kalan malzeme ve modele dalma (simülasyon sonrası)
export function residual(R, SG, tol = 0.1) {
  const { G, H, stock } = R.P;
  let left = 0, leftMax = 0, gouge = 0, gougeMax = 0, cells = 0;
  const mark = new Int8Array(SG.nx * SG.ny);
  for (let j = 0; j < SG.ny; j++) for (let i = 0; i < SG.nx; i++) {
    const c = i + SG.nx * j, x = SG.ox + (i + 0.5) * SG.res, y = SG.oy + (j + 0.5) * SG.res;
    if (!inStock(stock, x, y)) continue;
    const gi = Math.min(G.nx - 1, Math.floor((x - G.ox) / G.res)), gj = Math.min(G.ny - 1, Math.floor((y - G.oy) / G.res));
    const hm = H[gi + G.nx * gj], h = Math.max(hm, stock.modelBot), d = SG.S[c] - h;
    cells++;
    if (d > tol) { left++; leftMax = Math.max(leftMax, d); mark[c] = 1; }
    // modelin olmadığı yerde (boydan boya delik, dış kontur) bağlama payına girmek dalma değildir
    if (hm > -Infinity && d < -0.05) { gouge++; gougeMax = Math.max(gougeMax, -d); mark[c] = -1; }
  }
  return { leftPct: cells ? left / cells * 100 : 0, leftMax, gouge, gougeMax, mark };
}

/* ---------- G-kodu ---------- */
export const POSTS = {
  fanuc: { name: 'Fanuc (ve uyumlu: Haas, Mitsubishi, Syntec)', ext: 'nc' },
  mach3: { name: 'Mach3 / Mach4 / LinuxCNC', ext: 'tap' },
  grbl: { name: 'GRBL (hobi CNC, router)', ext: 'gcode' },
};
const TR = { 'ç': 'C', 'Ç': 'C', 'ğ': 'G', 'Ğ': 'G', 'ı': 'I', 'İ': 'I', 'ö': 'O', 'Ö': 'O', 'ş': 'S', 'Ş': 'S', 'ü': 'U', 'Ü': 'U', 'Ø': 'D', '×': 'X', '°': ' DER' };
export const ascii = (s) => String(s).replace(/[çÇğĞıİöÖşŞüÜØ×°]/g, (c) => TR[c]).replace(/[()]/g, '').replace(/[^\x20-\x7e]/g, '').toUpperCase();
export function fmt(v) { let s = (Math.round(v * 1000) / 1000).toFixed(3).replace(/0+$/, ''); if (s.endsWith('.')) s += '0'; if (s === '-0.0') s = '0.0'; return s; }
export function gcode(R, job, postKey, opt = {}) {
  const post = postKey, Z0 = R.P.zero, L = [], fanuc = post === 'fanuc', grbl = post === 'grbl';
  const X = (x) => fmt(x - Z0[0]), Y = (y) => fmt(y - Z0[1]), Zf = (z) => fmt(z - Z0[2]);
  const c = (t) => '(' + ascii(t).slice(0, 70) + ')';
  let nline = 0; const out = (s) => { if (opt.lineNumbers && fanuc && s && !s.startsWith('%') && !s.startsWith('(') && !s.startsWith('O')) { nline += 10; L.push('N' + nline + ' ' + s); } else L.push(s); };
  const st = R.P.stock;
  if (!grbl) out('%');
  if (fanuc) out('O' + String(opt.program || 1001).padStart(4, '0') + ' ' + c(job.name || 'CIZIM ATOLYESI'));
  else out(c(job.name || 'CIZIM ATOLYESI'));
  out(c('CIZIM ATOLYESI CAM - ' + (opt.date || '')));
  out(c('STOK X' + fmt(st.x1 - st.x0) + ' Y' + fmt(st.y1 - st.y0) + ' Z' + fmt(st.zTop - st.zBot)));
  out(c('SIFIR: ' + (job.zero === 'center' ? 'STOK UST YUZ ORTASI' : job.zero === 'bottom' ? 'STOK ALT ON SOL KOSE' : 'STOK UST YUZ ON SOL KOSE')));
  for (const op of R.ops) out(c('T' + op.tool.n + ' ' + TOOLN(op.tool) + ' - ' + op.name));
  out(grbl ? 'G21 G90 G94 G17' : 'G21 G17 G40 G49 G80 G90 G94');
  let lx = null, ly = null, lz = null, lf = null, lg = null, first = true;
  const safe = R.safe;
  for (const op of R.ops) {
    const t = op.tool;
    out(c(op.name + ' - T' + t.n + ' ' + TOOLN(t)));
    if (grbl) { if (!first) { out('M5'); out(c('TAKIM DEGISTIR: T' + t.n + ' ' + TOOLN(t) + ' - BOY AYARI YAP')); out('M0'); } }
    else { if (!first) { out('M9'); out('M5'); out(fanuc ? 'G91 G28 Z0.0' : 'G53 G0 Z0.0'); out('G90'); } out('T' + t.n + ' M6'); }
    out('S' + Math.round(t.rpm) + ' M3');
    if (!grbl) out('G54');
    const m0 = op.moves.find((m) => m.k !== 'd') || op.moves[0];
    out('G0 X' + X(m0.x) + ' Y' + Y(m0.y)); lx = m0.x; ly = m0.y; lg = 0;
    out(grbl ? 'G0 Z' + Zf(safe) : 'G43 Z' + Zf(safe) + ' H' + t.n); lz = safe;
    if (!grbl && opt.coolant !== false) out('M8');
    first = false; lf = null;
    let inCycle = false;
    for (const m of op.moves) {
      if (m.k === 'd') {
        if (grbl || opt.expandCycles) {
          out('G0 X' + X(m.x) + ' Y' + Y(m.y)); out('G0 Z' + Zf(m.r));
          const steps = m.q ? Math.ceil((m.r - m.z) / m.q) : 1;
          for (let s = 1; s <= steps; s++) { const zz = Math.max(m.z, m.r - s * (m.q || (m.r - m.z))); out('G1 Z' + Zf(zz) + ' F' + Math.round(m.f)); if (s < steps) { out('G0 Z' + Zf(m.r)); out('G0 Z' + Zf(zz + 0.5)); } }
          out('G0 Z' + Zf(m.r)); lx = m.x; ly = m.y; lz = m.r; lg = 0; lf = null;
        } else {
          if (!inCycle) { out('G98 ' + (m.q ? 'G83' : 'G81') + ' X' + X(m.x) + ' Y' + Y(m.y) + ' Z' + Zf(m.z) + ' R' + Zf(m.r) + (m.q ? ' Q' + fmt(m.q) : '') + ' F' + Math.round(m.f)); inCycle = true; }
          else out('X' + X(m.x) + ' Y' + Y(m.y) + ' Z' + Zf(m.z) + ' R' + Zf(m.r) + (m.q ? ' Q' + fmt(m.q) : ''));
          lx = m.x; ly = m.y; lz = m.r;
        }
        continue;
      }
      if (inCycle) { out('G80'); inCycle = false; lg = null; }
      const g = m.k === 'r' ? 0 : 1, xyz = [];
      if (lx === null || Math.abs(m.x - lx) > 5e-4) xyz.push('X' + X(m.x));
      if (ly === null || Math.abs(m.y - ly) > 5e-4) xyz.push('Y' + Y(m.y));
      if (lz === null || Math.abs(m.z - lz) > 5e-4) xyz.push('Z' + Zf(m.z));
      if (!xyz.length) continue;
      const w = (g !== lg ? ['G' + g] : []).concat(xyz);
      if (g === 1 && m.f !== lf) { w.push('F' + Math.round(m.f)); lf = m.f; }
      out(w.join(' ')); lg = g;
      lx = m.x; ly = m.y; lz = m.z;
    }
    if (inCycle) { out('G80'); inCycle = false; }
    out('G0 Z' + Zf(safe)); lz = safe; lg = 0;
  }
  if (!grbl) { out('M9'); out('M5'); out(fanuc ? 'G91 G28 Z0.0' : 'G53 G0 Z0.0'); out('G90'); out('M30'); out('%'); }
  else { out('M5'); out('G0 X0.0 Y0.0'); out('M2'); }
  return L.join('\n') + '\n';
}
export const TOOLN = (t) => 'D' + fmt(t.d) + ' ' + (t.type === 'ball' ? 'KURESEL' : t.type === 'drill' ? 'MATKAP' : 'PARMAK FREZE');
