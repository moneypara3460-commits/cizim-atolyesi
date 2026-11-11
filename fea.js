// Çizim Atölyesi — "Geleceğimi Göster" sanal test ortamı: sonlu elemanlar çekirdeği.
// Model gerçek 3B katı geometriden küp elemanlara (voxel) bölünür; her küp 8 düğümlü, uyumsuz modlu (Wilson–Taylor) hekzahedral
// elemandır (eğilmede kilitlenme olmaz). Doğrusal-elastik, küçük şekil değiştirme, izotrop malzeme. Çözücü: Jacobi ön koşullu
// eşlenik gradyan (matris saklamadan). Ayrıca: ısıl yük, doğal frekans (alt uzay yinelemesi), kritik bölge, yorulma / aşınma tahmini.
// Birimler: mm, N, MPa (N/mm²), ton/mm³ (kütle), s. Saf JS: ana iş parçacığında da Worker'da da çalışır.

/* ---------- malzeme özellikleri (tipik oda sıcaklığı değerleri) ---------- */
// E (GPa), sy (MPa), rho (g/cm³) logic.js MATERIALS'tan gelir; burada ek özellikler:
// nu: Poisson, alpha: ısıl genleşme (1/°C), su: çekme dayanımı (MPa), H: sertlik (MPa, ~HB·9,81), Tmax: yük taşımada önerilen üst sıcaklık (°C),
// Tmin: alt sıcaklık uyarısı, fat: yorulma modeli, aniso: yönlü malzeme (izotrop kabul yaklaşık)
export const MATPROPS = {
  celik: { nu: 0.30, alpha: 12e-6, su: 360, H: 1180, Tmax: 400, Tmin: -20, fat: { type: 'limit', surface: true }, note: 'S235: +20 °C darbe testli (JR); soğukta J0 / J2 kalite gerekir' },
  paslanmaz: { nu: 0.29, alpha: 17.3e-6, su: 505, H: 1960, Tmax: 800, Tmin: -196, fat: { type: 'limit', surface: true } },
  aluminyum: { nu: 0.33, alpha: 23.8e-6, su: 228, H: 590, Tmax: 100, Tmin: -200, fat: { type: 'basquin', Sf: 117, Nf: 5e8 } },
  al6061: { nu: 0.33, alpha: 23.6e-6, su: 310, H: 930, Tmax: 150, Tmin: -200, fat: { type: 'basquin', Sf: 96.5, Nf: 5e8 } },
  pirinc: { nu: 0.34, alpha: 20e-6, su: 340, H: 980, Tmax: 200, Tmin: -200, fat: { type: 'basquin', Sf: 0.35, rel: true, Nf: 1e8 } },
  bakir: { nu: 0.34, alpha: 17e-6, su: 220, H: 490, Tmax: 200, Tmin: -200, fat: { type: 'basquin', Sf: 0.35, rel: true, Nf: 1e8 } },
  titanyum: { nu: 0.34, alpha: 8.6e-6, su: 345, H: 1960, Tmax: 300, Tmin: -200, fat: { type: 'limit', surface: true } },
  pla: { nu: 0.36, alpha: 68e-6, su: 50, H: 150, Tmax: 50, Tmin: -10, fat: { type: 'basquin', Sf: 0.25, rel: true, Nf: 1e7, wide: true }, creep: true },
  abs: { nu: 0.35, alpha: 90e-6, su: 40, H: 100, Tmax: 80, Tmin: -20, fat: { type: 'basquin', Sf: 0.25, rel: true, Nf: 1e7, wide: true }, creep: true },
  petg: { nu: 0.38, alpha: 68e-6, su: 50, H: 100, Tmax: 65, Tmin: -20, fat: { type: 'basquin', Sf: 0.25, rel: true, Nf: 1e7, wide: true }, creep: true },
  naylon: { nu: 0.39, alpha: 95e-6, su: 75, H: 110, Tmax: 80, Tmin: -30, fat: { type: 'basquin', Sf: 0.25, rel: true, Nf: 1e7, wide: true }, creep: true, note: 'nem alınca dayanım ve rijitlik düşer' },
  cam: { nu: 0.30, alpha: 5e-6, su: 75, H: 30, Tmax: 60, Tmin: -40, aniso: true, fat: { type: 'basquin', Sf: 0.3, rel: true, Nf: 1e7, wide: true } },
  ahsap: { nu: 0.30, alpha: 5e-6, su: 95, H: 40, Tmax: 60, Tmin: -40, aniso: true, fat: { type: 'basquin', Sf: 0.3, rel: true, Nf: 1e7, wide: true } },
  kayin: { nu: 0.30, alpha: 5e-6, su: 110, H: 40, Tmax: 60, Tmin: -40, aniso: true, fat: { type: 'basquin', Sf: 0.3, rel: true, Nf: 1e7, wide: true } },
  kontrplak: { nu: 0.30, alpha: 7e-6, su: 45, H: 30, Tmax: 60, Tmin: -40, aniso: true, fat: { type: 'basquin', Sf: 0.3, rel: true, Nf: 1e7, wide: true } },
  mdf: { nu: 0.25, alpha: 10e-6, su: 30, H: 30, Tmax: 60, Tmin: -20, aniso: false, fat: { type: 'basquin', Sf: 0.3, rel: true, Nf: 1e7, wide: true }, note: 'nemde şişer, dayanımı düşer' },
};
// yüksek sıcaklıkta azaltma (oda sıcaklığına oran). Yalnızca kaynaklı veri olan malzemeler:
// çelik: EN 1993-1-2 Tablo 3.1 (ky akma, kE elastisite); 6061-T6: ASM verisi (akma)
const RED = {
  celik: { T: [20, 100, 200, 300, 400, 500, 600, 700], ky: [1, 1, 1, 1, 1, 0.78, 0.47, 0.23], kE: [1, 1, 0.9, 0.8, 0.7, 0.6, 0.31, 0.13] },
  al6061: { T: [24, 100, 149, 204, 260], ky: [1, 0.95, 0.78, 0.37, 0.12], kE: null },
};
const lerpTab = (T, xs, ys) => { if (T <= xs[0]) return ys[0]; for (let i = 1; i < xs.length; i++) if (T <= xs[i]) return ys[i - 1] + (ys[i] - ys[i - 1]) * (T - xs[i - 1]) / (xs[i] - xs[i - 1]); return null; };
export function matProps(m) {
  const x = MATPROPS[m.id] || { nu: 0.3, alpha: 12e-6, su: m.sy * 1.3, H: 1000, Tmax: 100, Tmin: -20, fat: { type: 'basquin', Sf: 0.3, rel: true, Nf: 1e7, wide: true }, unknown: true };
  return { id: m.id, name: m.name, kind: m.kind, E: m.E * 1000, sy: m.sy, rho: m.rho, ...x };
}
// sıcaklıkta akma / E oranları; veri yoksa null (uydurma yok)
export function tempFactors(id, T) {
  const r = RED[id];
  if (!r) return null;
  const ky = lerpTab(T, r.T, r.ky), kE = r.kE ? lerpTab(T, r.T, r.kE) : null;
  return ky == null ? null : { ky, kE };
}

/* ---------- eleman matrisleri ---------- */
const NAT = [[-1, -1, -1], [1, -1, -1], [1, 1, -1], [-1, 1, -1], [-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]];
export function Dmat(E, nu) {
  const l = E * nu / ((1 + nu) * (1 - 2 * nu)), m = E / (2 * (1 + nu)), D = new Float64Array(36);
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) D[i * 6 + j] = l + (i === j ? 2 * m : 0);
  for (let i = 3; i < 6; i++) D[i * 6 + i] = m;
  return D;
}
// 6×n B matrisine bir düğüm / mod sütun üçlüsü yaz (g = fiziksel türev)
function putB(B, n, col, g) {
  const [gx, gy, gz] = g;
  B[0 * n + col] = gx; B[1 * n + col + 1] = gy; B[2 * n + col + 2] = gz;
  B[3 * n + col] = gy; B[3 * n + col + 1] = gx;
  B[4 * n + col + 1] = gz; B[4 * n + col + 2] = gy;
  B[5 * n + col] = gz; B[5 * n + col + 2] = gx;
}
const dNat = (a, s) => [NAT[a][0] * (1 + NAT[a][1] * s[1]) * (1 + NAT[a][2] * s[2]) / 8, NAT[a][1] * (1 + NAT[a][0] * s[0]) * (1 + NAT[a][2] * s[2]) / 8, NAT[a][2] * (1 + NAT[a][0] * s[0]) * (1 + NAT[a][1] * s[1]) / 8];
function invert(A, n) {
  const M = Float64Array.from(A), I = new Float64Array(n * n);
  for (let i = 0; i < n; i++) I[i * n + i] = 1;
  for (let c = 0; c < n; c++) {
    let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(M[r * n + c]) > Math.abs(M[p * n + c])) p = r;
    if (p !== c) for (let k = 0; k < n; k++) { [M[c * n + k], M[p * n + k]] = [M[p * n + k], M[c * n + k]]; [I[c * n + k], I[p * n + k]] = [I[p * n + k], I[c * n + k]]; }
    const d = M[c * n + c];
    for (let k = 0; k < n; k++) { M[c * n + k] /= d; I[c * n + k] /= d; }
    for (let r = 0; r < n; r++) if (r !== c) { const f = M[r * n + c]; if (f) for (let k = 0; k < n; k++) { M[r * n + k] -= f * M[c * n + k]; I[r * n + k] -= f * I[c * n + k]; } }
  }
  return I;
}
const EL_CACHE = new Map();
// birim küp (h = 1), E = 1 için yoğuşturulmuş rijitlik (24×24), merkez B (6×24), D, ısıl yük vektörü (24)
export function elementK(nu) {
  const key = nu.toFixed(4);
  if (EL_CACHE.has(key)) return EL_CACHE.get(key);
  const D = Dmat(1, nu), g = 1 / Math.sqrt(3), w = 1 / 8;
  const Kuu = new Float64Array(576), Kua = new Float64Array(216), Kaa = new Float64Array(81), gu = new Float64Array(24), ga = new Float64Array(9);
  const Bu = new Float64Array(144), Ba = new Float64Array(54), DB = new Float64Array(144), DBa = new Float64Array(54), eth = [1, 1, 1, 0, 0, 0];
  for (const s0 of [-g, g]) for (const s1 of [-g, g]) for (const s2 of [-g, g]) {
    const s = [s0, s1, s2];
    Bu.fill(0); Ba.fill(0);
    for (let a = 0; a < 8; a++) putB(Bu, 24, 3 * a, dNat(a, s).map((v) => v * 2));
    for (let k = 0; k < 3; k++) { const gg = [0, 0, 0]; gg[k] = -2 * s[k] * 2; putB(Ba, 9, 3 * k, gg); }
    for (let i = 0; i < 6; i++) for (let j = 0; j < 24; j++) { let t = 0; for (let k = 0; k < 6; k++) t += D[i * 6 + k] * Bu[k * 24 + j]; DB[i * 24 + j] = t; }
    for (let i = 0; i < 6; i++) for (let j = 0; j < 9; j++) { let t = 0; for (let k = 0; k < 6; k++) t += D[i * 6 + k] * Ba[k * 9 + j]; DBa[i * 9 + j] = t; }
    for (let i = 0; i < 24; i++) for (let j = 0; j < 24; j++) { let t = 0; for (let k = 0; k < 6; k++) t += Bu[k * 24 + i] * DB[k * 24 + j]; Kuu[i * 24 + j] += t * w; }
    for (let i = 0; i < 24; i++) for (let j = 0; j < 9; j++) { let t = 0; for (let k = 0; k < 6; k++) t += Bu[k * 24 + i] * DBa[k * 9 + j]; Kua[i * 9 + j] += t * w; }
    for (let i = 0; i < 9; i++) for (let j = 0; j < 9; j++) { let t = 0; for (let k = 0; k < 6; k++) t += Ba[k * 9 + i] * DBa[k * 9 + j]; Kaa[i * 9 + j] += t * w; }
    for (let i = 0; i < 24; i++) { let t = 0; for (let k = 0; k < 6; k++) { let de = 0; for (let q = 0; q < 6; q++) de += D[k * 6 + q] * eth[q]; t += Bu[k * 24 + i] * de; } gu[i] += t * w; }
    for (let i = 0; i < 9; i++) { let t = 0; for (let k = 0; k < 6; k++) { let de = 0; for (let q = 0; q < 6; q++) de += D[k * 6 + q] * eth[q]; t += Ba[k * 9 + i] * de; } ga[i] += t * w; }
  }
  const Ai = invert(Kaa, 9), T = new Float64Array(216);   // T = Kua · Kaa⁻¹
  for (let i = 0; i < 24; i++) for (let j = 0; j < 9; j++) { let t = 0; for (let k = 0; k < 9; k++) t += Kua[i * 9 + k] * Ai[k * 9 + j]; T[i * 9 + j] = t; }
  const K = new Float64Array(576);
  for (let i = 0; i < 24; i++) for (let j = 0; j < 24; j++) { let t = 0; for (let k = 0; k < 9; k++) t += T[i * 9 + k] * Kua[j * 9 + k]; K[i * 24 + j] = Kuu[i * 24 + j] - t; }
  const gth = new Float64Array(24);
  for (let i = 0; i < 24; i++) { let t = 0; for (let k = 0; k < 9; k++) t += T[i * 9 + k] * ga[k]; gth[i] = gu[i] - t; }
  const B0 = new Float64Array(144);
  for (let a = 0; a < 8; a++) putB(B0, 24, 3 * a, dNat(a, [0, 0, 0]).map((v) => v * 2));
  const o = { K, B0, D, gth };
  EL_CACHE.set(key, o);
  return o;
}

/* ---------- voxel ağı ---------- */
// items: [{ id, tris (Float32Array, dünya), mat (malzeme sırası) }]; opts: { h } ya da { target (eleman sayısı) }
export function voxelize(items, opts = {}) {
  const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
  const vols = items.map((it) => { const t = it.tris; let v = 0; for (let i = 0; i < t.length; i += 9) { v += (t[i] * (t[i + 4] * t[i + 8] - t[i + 5] * t[i + 7]) - t[i + 1] * (t[i + 3] * t[i + 8] - t[i + 5] * t[i + 6]) + t[i + 2] * (t[i + 3] * t[i + 7] - t[i + 4] * t[i + 6])) / 6; } for (let i = 0; i < t.length; i += 3) for (let k = 0; k < 3; k++) { if (t[i + k] < mn[k]) mn[k] = t[i + k]; if (t[i + k] > mx[k]) mx[k] = t[i + k]; } return Math.abs(v); });
  const vTot = vols.reduce((s, v) => s + v, 0);
  if (!(vTot > 0)) throw new Error('Modelde hacimli katı yok');
  const size = mx.map((v, k) => v - mn[k]), maxCells = opts.maxCells || 2.5e6;
  const fitH = (h) => { while (Math.ceil(size[0] / h) * Math.ceil(size[1] / h) * Math.ceil(size[2] / h) > maxCells) h *= 1.1; return h; };
  if (opts.h) return voxAt(items, vols, mn, size, fitH(opts.h));
  // eleman boyu: hedef sayıya yakın adaylar arasından geometriyi en az hatayla temsil eden (ölçülerle hizalı) seçilir.
  // İnce kesitte kalınlık yuvarlaması eğilme rijitliğini küple değiştirir; hizalama bu hatayı büyük ölçüde giderir.
  const h0 = Math.cbrt(vTot / (opts.target || 12000)), nice = [];
  for (let e = -2; e <= 3; e++) for (const m of [1, 1.25, 1.5, 2, 2.5, 3, 4, 5, 6, 7.5, 8]) nice.push(m * 10 ** e);
  const cand = [...new Set([h0, ...nice.filter((v) => v >= h0 * 0.75 && v <= h0 * 1.3), ...[0.85, 0.92, 1.08, 1.16].map((k) => h0 * k)])];
  let best = null;
  for (const h of cand) {
    const g = voxAt(items, vols, mn, size, fitH(h));
    const err = g.parts.reduce((s, p) => s + Math.abs(p.vVox - p.vTrue), 0) / vTot + 0.02 * Math.abs(Math.log(h / h0));
    if (!best || err < best.err) best = { g, err };
  }
  return best.g;
}
function voxAt(items, vols, mn, size, h) {
  const vTot = vols.reduce((s, v) => s + v, 0);
  const nx = Math.max(1, Math.ceil(size[0] / h - 1e-6)), ny = Math.max(1, Math.ceil(size[1] / h - 1e-6)), nz = Math.max(1, Math.ceil(size[2] / h - 1e-6));
  const origin = [mn[0], mn[1], mn[2]];   // ızgara modelin köşesine hizalı (CAD ölçüleri genelde buradan)
  const N = nx * ny * nz, mat = new Int8Array(N).fill(-1), part = new Int32Array(N).fill(-1);
  const e1 = h * 1.234567e-4, e2 = h * 2.345671e-4;
  const parts = [];
  items.forEach((it, pi) => {
    const t = it.tris, rows = new Map();
    for (let i = 0; i < t.length; i += 9) {
      const ay = t[i + 1], az = t[i + 2], by = t[i + 4], bz = t[i + 5], cy = t[i + 7], cz = t[i + 8];
      const d = (by - ay) * (cz - az) - (cy - ay) * (bz - az);
      if (Math.abs(d) < 1e-14) continue;
      const j0 = Math.max(0, Math.ceil((Math.min(ay, by, cy) - origin[1] - e1) / h - 0.5)), j1 = Math.min(ny - 1, Math.floor((Math.max(ay, by, cy) - origin[1] - e1) / h - 0.5));
      const k0 = Math.max(0, Math.ceil((Math.min(az, bz, cz) - origin[2] - e2) / h - 0.5)), k1 = Math.min(nz - 1, Math.floor((Math.max(az, bz, cz) - origin[2] - e2) / h - 0.5));
      for (let j = j0; j <= j1; j++) for (let k = k0; k <= k1; k++) {
        const yc = origin[1] + (j + 0.5) * h + e1, zc = origin[2] + (k + 0.5) * h + e2;
        const l1 = ((by - yc) * (cz - zc) - (cy - yc) * (bz - zc)) / d, l2 = ((cy - yc) * (az - zc) - (ay - yc) * (cz - zc)) / d, l3 = 1 - l1 - l2;
        if (l1 < 0 || l2 < 0 || l3 < 0) continue;
        const x = l1 * t[i] + l2 * t[i + 3] + l3 * t[i + 6], key = j + ny * k;
        let r = rows.get(key); if (!r) { r = []; rows.set(key, r); } r.push(x);
      }
    }
    let cnt = 0;
    for (const [key, xs] of rows) {
      xs.sort((a, b) => a - b);
      const j = key % ny, k = (key - j) / ny;
      for (let q = 0; q + 1 < xs.length; q += 2) {
        const i0 = Math.max(0, Math.ceil((xs[q] - origin[0]) / h - 0.5)), i1 = Math.min(nx - 1, Math.floor((xs[q + 1] - origin[0]) / h - 0.5));
        for (let ii = i0; ii <= i1; ii++) { const c = ii + nx * (j + ny * k); if (mat[c] < 0) cnt++; mat[c] = it.mat; part[c] = pi; }
      }
    }
    parts.push({ id: it.id, name: it.name, mat: it.mat, vTrue: vols[pi], cells: 0 });
  });
  for (let c = 0; c < N; c++) if (part[c] >= 0) parts[part[c]].cells++;
  for (const p of parts) { p.vVox = p.cells * h * h * h; p.err = p.vTrue > 0 ? (p.vVox - p.vTrue) / p.vTrue : 0; p.poor = p.cells < 8 || Math.abs(p.err) > 0.2; }
  return { nx, ny, nz, h, origin, mat, part, parts, vTrue: vTot };
}
export const cloneGrid = (g) => ({ ...g, mat: Int8Array.from(g.mat), part: Int32Array.from(g.part), parts: g.parts.map((p) => ({ ...p })) });

// sonlu eleman modeli: aktif hücreler → eleman, köşeler → düğüm
export function buildFE(grid) {
  const { nx, ny, nz, h, origin, mat } = grid, NX = nx + 1, NY = ny + 1;   // eslint-disable-line
  const cells = []; for (let c = 0; c < mat.length; c++) if (mat[c] >= 0) cells.push(c);
  const ne = cells.length, nodeId = new Int32Array(NX * NY * (nz + 1)).fill(-1), elN = new Int32Array(ne * 8), elCell = Int32Array.from(cells), elMat = new Int8Array(ne);
  let nn = 0;
  const OFF = [[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0], [0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]];
  const cnt = [];
  for (let e = 0; e < ne; e++) {
    const c = cells[e], i = c % nx, j = ((c - i) / nx) % ny, k = Math.floor(c / (nx * ny));
    elMat[e] = mat[c];
    for (let a = 0; a < 8; a++) { const g = (i + OFF[a][0]) + NX * ((j + OFF[a][1]) + NY * (k + OFF[a][2])); if (nodeId[g] < 0) { nodeId[g] = nn++; cnt.push(0); } elN[e * 8 + a] = nodeId[g]; cnt[nodeId[g]]++; }
  }
  const xyz = new Float64Array(nn * 3), surf = new Uint8Array(nn);
  for (let g = 0; g < nodeId.length; g++) { const n = nodeId[g]; if (n < 0) continue; const i = g % NX, j = ((g - i) / NX) % NY, k = Math.floor(g / (NX * NY)); xyz[n * 3] = origin[0] + i * h; xyz[n * 3 + 1] = origin[1] + j * h; xyz[n * 3 + 2] = origin[2] + k * h; surf[n] = cnt[n] < 8 ? 1 : 0; }
  return { ne, nn, elN, elCell, elMat, xyz, surf, h, nx, ny, nz, origin };
}

/* ---------- sınır koşulları ---------- */
export const FACE_NAMES = { '-y': 'Alt yüz', '+y': 'Üst yüz', '-x': 'Sol yüz', '+x': 'Sağ yüz', '+z': 'Ön yüz', '-z': 'Arka yüz' };
// sel: { face: '-y' } ya da { p: [x, y, z], r }
export function selectNodes(fe, sel) {
  const out = [], { xyz, surf, nn, h } = fe;
  if (sel.face) {
    const ax = 'xyz'.indexOf(sel.face[1]), sg = sel.face[0] === '-' ? -1 : 1;
    let ext = -Infinity;
    if (sel.ext != null) ext = sg * sel.ext; else for (let n = 0; n < nn; n++) ext = Math.max(ext, sg * xyz[n * 3 + ax]);
    for (let n = 0; n < nn; n++) if (Math.abs(sg * xyz[n * 3 + ax] - ext) < h * 0.51) out.push(n);
    return out;
  }
  const [px, py, pz] = sel.p, r = Math.max(sel.r || 0, h * 1.01);
  let best = -1, bd = Infinity;
  for (let n = 0; n < nn; n++) {
    if (!surf[n]) continue;
    const d = Math.hypot(xyz[n * 3] - px, xyz[n * 3 + 1] - py, xyz[n * 3 + 2] - pz);
    if (d <= r) out.push(n);
    if (d < bd) { bd = d; best = n; }
  }
  if (!out.length && best >= 0 && bd < 3 * h + r) out.push(best);
  return out;
}

// yüz seçimlerini sabit koordinata bağla (alternatif tasarımlarda mesnet / yük yeri kaymasın)
export function resolveBC(fe, bc) {
  const fix = (sel) => { if (!sel.face || sel.ext != null) return sel; const ax = 'xyz'.indexOf(sel.face[1]), sg = sel.face[0] === '-' ? -1 : 1; let e = -Infinity; for (let n = 0; n < fe.nn; n++) e = Math.max(e, sg * fe.xyz[n * 3 + ax]); return { ...sel, ext: sg * e }; };
  return { ...bc, supports: (bc.supports || []).map(fix), loads: (bc.loads || []).map((L) => ({ ...L, sel: fix(L.sel) })) };
}
/* ---------- çözücü ---------- */
function matGroups(fe, mats) {
  return mats.map((m) => ({ ...m, el: elementK(m.nu) }));
}
// y = K x (matris saklamadan), scale[e] = E·h
function matvec(fe, G, x, y) {
  y.fill(0);
  const { ne, elN, elMat, h } = fe, xe = new Float64Array(24);
  for (let e = 0; e < ne; e++) {
    const g = G[elMat[e]], K = g.el.K, s = g.E * h, b = e * 8;
    for (let a = 0; a < 8; a++) { const d = elN[b + a] * 3; xe[a * 3] = x[d]; xe[a * 3 + 1] = x[d + 1]; xe[a * 3 + 2] = x[d + 2]; }
    for (let i = 0; i < 24; i++) {
      let t = 0; const r = i * 24;
      for (let j = 0; j < 24; j++) t += K[r + j] * xe[j];
      y[elN[b + (i / 3 | 0)] * 3 + (i % 3)] += t * s;
    }
  }
}
function diagK(fe, G) {
  const d = new Float64Array(fe.nn * 3);
  for (let e = 0; e < fe.ne; e++) { const g = G[fe.elMat[e]], s = g.E * fe.h; for (let i = 0; i < 24; i++) d[fe.elN[e * 8 + (i / 3 | 0)] * 3 + (i % 3)] += g.el.K[i * 25] * s; }
  return d;
}
function pcg(fe, G, f, fixed, x, opt = {}) {
  const n = f.length, r = new Float64Array(n), z = new Float64Array(n), p = new Float64Array(n), q = new Float64Array(n), dg = opt.mg ? null : opt.diag || diagK(fe, G);
  const tol = opt.tol || 1e-6, maxIt = opt.maxIter || (opt.mg ? 600 : 20000);
  for (let i = 0; i < n; i++) if (fixed[i]) x[i] = 0;
  matvec(fe, G, x, q);
  let fn = 0; for (let i = 0; i < n; i++) { r[i] = fixed[i] ? 0 : f[i] - q[i]; if (!fixed[i]) fn += f[i] * f[i]; }
  fn = Math.sqrt(fn) || 1;
  const mg = opt.mg, prec = (out) => { if (mg) { const v = vcycle(mg, 0, r); for (let i = 0; i < n; i++) out[i] = fixed[i] ? 0 : v[i]; } else for (let i = 0; i < n; i++) out[i] = fixed[i] || !dg[i] ? 0 : r[i] / dg[i]; };
  prec(z); let rz = 0; for (let i = 0; i < n; i++) { p[i] = z[i]; rz += r[i] * z[i]; }
  let it = 0, res = 1;
  for (; it < maxIt; it++) {
    let rr = 0; for (let i = 0; i < n; i++) rr += r[i] * r[i];
    res = Math.sqrt(rr) / fn;
    if (res < tol) break;
    if (opt.onProgress && it % (mg ? 5 : 50) === 0) opt.onProgress(it, res);
    matvec(fe, G, p, q);
    let pq = 0; for (let i = 0; i < n; i++) { if (fixed[i]) q[i] = 0; pq += p[i] * q[i]; }
    if (!(pq > 0)) { res = Infinity; break; }
    const al = rz / pq;
    for (let i = 0; i < n; i++) { x[i] += al * p[i]; r[i] -= al * q[i]; }
    prec(z); let rz2 = 0; for (let i = 0; i < n; i++) rz2 += r[i] * z[i];
    const be = rz2 / rz; rz = rz2;
    for (let i = 0; i < n; i++) p[i] = z[i] + be * p[i];
  }
  return { iters: it, res, converged: res < tol * 10 };
}

/* ---------- çok katmanlı (multigrid) ön koşullayıcı ---------- */
// Voxel ağı 2×2×2 küpler birleştirilerek kabalaştırılır (kaba eleman rijitliği = çocukların ortalaması), aradeğerleme üç doğrusal.
// Simetrik V-döngüsü (2 ön + 2 son sönümlü Jacobi) eşlenik gradyan için ön koşullayıcıdır: çözüm aynı, adım sayısı çok azalır.
function lvMatvec(L, x, y) {
  y.fill(0);
  const { ne, elN, eK, eG, scale } = L, xe = new Float64Array(24);
  for (let e = 0; e < ne; e++) {
    const K = eK[eG[e]], s = scale[e], b = e * 8;
    for (let a = 0; a < 8; a++) { const d = elN[b + a] * 3; xe[a * 3] = x[d]; xe[a * 3 + 1] = x[d + 1]; xe[a * 3 + 2] = x[d + 2]; }
    for (let i = 0; i < 24; i++) { let t = 0; const r = i * 24; for (let j = 0; j < 24; j++) t += K[r + j] * xe[j]; y[elN[b + (i / 3 | 0)] * 3 + (i % 3)] += t * s; }
  }
}
function lvDiag(L) { const d = new Float64Array(L.nn * 3); for (let e = 0; e < L.ne; e++) { const K = L.eK[L.eG[e]], s = L.scale[e]; for (let i = 0; i < 24; i++) d[L.elN[e * 8 + (i / 3 | 0)] * 3 + (i % 3)] += K[i * 25] * s; } return d; }
function lvSmoothSetup(L) {
  L.diag = lvDiag(L);
  const n = L.nn * 3, v = new Float64Array(n), w = new Float64Array(n);
  for (let i = 0; i < n; i++) v[i] = L.fixed[i] ? 0 : Math.sin(i * 12.9898) * 0.5 + 0.5;
  let lam = 1;
  for (let it = 0; it < 12; it++) {
    lvMatvec(L, v, w); let nr = 0;
    for (let i = 0; i < n; i++) { w[i] = L.fixed[i] || !L.diag[i] ? 0 : w[i] / L.diag[i]; nr += w[i] * w[i]; }
    nr = Math.sqrt(nr) || 1; let nv = 0; for (let i = 0; i < n; i++) nv += v[i] * v[i];
    lam = nr / (Math.sqrt(nv) || 1); for (let i = 0; i < n; i++) v[i] = w[i] / nr;
  }
  L.omega = 1.2 / (1.1 * lam);
}
function coarsen(L) {
  const NX = (L.nx + 1) >> 1, NY = (L.ny + 1) >> 1, NZ = (L.nz + 1) >> 1, map = new Map(), cIJK = [], sc = [];
  for (let e = 0; e < L.ne; e++) {
    const I = L.cell[e * 3] >> 1, J = L.cell[e * 3 + 1] >> 1, K = L.cell[e * 3 + 2] >> 1, key = I + NX * (J + NY * K);
    let c = map.get(key); if (c == null) { c = sc.length; map.set(key, c); sc.push(0); cIJK.push(I, J, K); }
    sc[c] += L.scale[e] / 4;   // E_eff·2h = Σ(E·h)/4
  }
  const ne = sc.length, NNX = NX + 1, NNY = NY + 1, nodeId = new Int32Array(NNX * NNY * (NZ + 1)).fill(-1), elN = new Int32Array(ne * 8);
  const OFF = [[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0], [0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]], lat = [];
  let nn = 0;
  for (let e = 0; e < ne; e++) for (let a = 0; a < 8; a++) { const i = cIJK[e * 3] + OFF[a][0], j = cIJK[e * 3 + 1] + OFF[a][1], k = cIJK[e * 3 + 2] + OFF[a][2], g = i + NNX * (j + NNY * k); if (nodeId[g] < 0) { nodeId[g] = nn++; lat.push(i, j, k); } elN[e * 8 + a] = nodeId[g]; }
  // ince düğüm → kaba düğümler (üç doğrusal)
  const Pi = new Int32Array(L.nn * 8).fill(-1), Pw = new Float32Array(L.nn * 8);
  const ax = (i) => (i & 1 ? [[(i - 1) >> 1, 0.5], [(i + 1) >> 1, 0.5]] : [[i >> 1, 1]]);
  for (let n = 0; n < L.nn; n++) {
    let q = 0;
    for (const [I, wi] of ax(L.lat[n * 3])) for (const [J, wj] of ax(L.lat[n * 3 + 1])) for (const [K, wk] of ax(L.lat[n * 3 + 2])) { const c = nodeId[I + NNX * (J + NNY * K)]; if (c >= 0) { Pi[n * 8 + q] = c; Pw[n * 8 + q] = wi * wj * wk; q++; } }
  }
  const fixed = new Uint8Array(nn * 3);
  for (let n = 0; n < L.nn; n++) for (let q = 0; q < 8; q++) { const c = Pi[n * 8 + q]; if (c < 0) continue; for (let d = 0; d < 3; d++) if (L.fixed[n * 3 + d]) fixed[c * 3 + d] = 1; }
  L.Pi = Pi; L.Pw = Pw;
  return { ne, nn, elN, eK: [L.eK[0]], eG: new Int8Array(ne), scale: Float64Array.from(sc), cell: Int32Array.from(cIJK), lat: Int32Array.from(lat), nx: NX, ny: NY, nz: NZ, fixed };
}
export function buildMG(fe, G, fixed) {
  const lat = new Int32Array(fe.nn * 3), cell = new Int32Array(fe.ne * 3);
  for (let n = 0; n < fe.nn; n++) for (let k = 0; k < 3; k++) lat[n * 3 + k] = Math.round((fe.xyz[n * 3 + k] - fe.origin[k]) / fe.h);
  for (let e = 0; e < fe.ne; e++) { const c = fe.elCell[e], i = c % fe.nx, j = ((c - i) / fe.nx) % fe.ny; cell[e * 3] = i; cell[e * 3 + 1] = j; cell[e * 3 + 2] = Math.floor(c / (fe.nx * fe.ny)); }
  const scale = new Float64Array(fe.ne); for (let e = 0; e < fe.ne; e++) scale[e] = G[fe.elMat[e]].E * fe.h;
  const L0 = { ne: fe.ne, nn: fe.nn, elN: fe.elN, eK: G.map((g) => g.el.K), eG: fe.elMat, scale, cell, lat, nx: fe.nx, ny: fe.ny, nz: fe.nz, fixed };
  const levels = [L0];
  while (levels.length < 8) {
    const L = levels[levels.length - 1];
    if (L.ne <= 60) break;
    const C = coarsen(L);
    if (C.ne > L.ne * 0.6) { delete L.Pi; delete L.Pw; break; }
    levels.push(C);
  }
  for (const L of levels) lvSmoothSetup(L);
  // en kaba seviye: küçükse yoğun Cholesky ile tam çözüm
  const Lc = levels[levels.length - 1], free = [];
  for (let i = 0; i < Lc.nn * 3; i++) if (!Lc.fixed[i] && Lc.diag[i]) free.push(i);
  if (levels.length > 1 && free.length <= 1500) {
    const m = free.length, pos = new Int32Array(Lc.nn * 3).fill(-1); free.forEach((g, i) => { pos[g] = i; });
    const A = new Float64Array(m * m);
    for (let e = 0; e < Lc.ne; e++) { const K = Lc.eK[Lc.eG[e]], sc = Lc.scale[e]; for (let i = 0; i < 24; i++) { const gi = pos[Lc.elN[e * 8 + (i / 3 | 0)] * 3 + (i % 3)]; if (gi < 0) continue; for (let j = 0; j < 24; j++) { const gj = pos[Lc.elN[e * 8 + (j / 3 | 0)] * 3 + (j % 3)]; if (gj >= 0) A[gi * m + gj] += K[i * 24 + j] * sc; } } }
    let ok = true, dmax = 0; for (let i = 0; i < m; i++) dmax = Math.max(dmax, A[i * m + i]);
    for (let j = 0; j < m && ok; j++) {
      let d = A[j * m + j]; for (let k = 0; k < j; k++) d -= A[j * m + k] ** 2;
      if (!(d > dmax * 1e-12)) { ok = false; break; }
      d = Math.sqrt(d); A[j * m + j] = d;
      for (let i = j + 1; i < m; i++) { let v = A[i * m + j]; for (let k = 0; k < j; k++) v -= A[i * m + k] * A[j * m + k]; A[i * m + j] = v / d; }
    }
    if (ok) Lc.chol = { A, m, free };
  }
  return levels;
}
function vcycle(levels, l, r) {
  const L = levels[l], n = L.nn * 3, z = new Float64Array(n), t = new Float64Array(n), D = L.diag, F = L.fixed, w = L.omega;
  const sweep = () => { lvMatvec(L, z, t); for (let i = 0; i < n; i++) if (!F[i] && D[i]) z[i] += w * (r[i] - t[i]) / D[i]; };
  if (l === levels.length - 1) {
    if (L.chol) { const { A, m, free } = L.chol, y = new Float64Array(m); for (let i = 0; i < m; i++) { let v = r[free[i]]; for (let k = 0; k < i; k++) v -= A[i * m + k] * y[k]; y[i] = v / A[i * m + i]; } for (let i = m - 1; i >= 0; i--) { let v = y[i]; for (let k = i + 1; k < m; k++) v -= A[k * m + i] * y[k]; y[i] = v / A[i * m + i]; } for (let i = 0; i < m; i++) z[free[i]] = y[i]; return z; }
    for (let s = 0; s < 60; s++) sweep(); return z;
  }
  for (let i = 0; i < n; i++) z[i] = F[i] || !D[i] ? 0 : w * r[i] / D[i];
  sweep();
  lvMatvec(L, z, t);
  const C = levels[l + 1], rc = new Float64Array(C.nn * 3);
  for (let nd = 0; nd < L.nn; nd++) for (let q = 0; q < 8; q++) { const c = L.Pi[nd * 8 + q]; if (c < 0) continue; const wq = L.Pw[nd * 8 + q]; for (let d = 0; d < 3; d++) { const i = nd * 3 + d; if (!F[i]) rc[c * 3 + d] += wq * (r[i] - t[i]); } }
  for (let i = 0; i < rc.length; i++) if (C.fixed[i]) rc[i] = 0;
  const zc = vcycle(levels, l + 1, rc);
  for (let nd = 0; nd < L.nn; nd++) for (let q = 0; q < 8; q++) { const c = L.Pi[nd * 8 + q]; if (c < 0) continue; const wq = L.Pw[nd * 8 + q]; for (let d = 0; d < 3; d++) { const i = nd * 3 + d; if (!F[i]) z[i] += wq * zc[c * 3 + d]; } }
  sweep(); sweep();
  return z;
}
// sabitlemeye bağlı olmayan (havada kalan) eleman öbekleri
function floating(fe, fixedNode) {
  const par = new Int32Array(fe.nn); for (let i = 0; i < fe.nn; i++) par[i] = i;
  const find = (a) => { while (par[a] !== a) { par[a] = par[par[a]]; a = par[a]; } return a; };
  for (let e = 0; e < fe.ne; e++) { const r0 = find(fe.elN[e * 8]); for (let a = 1; a < 8; a++) { const r = find(fe.elN[e * 8 + a]); if (r !== r0) par[r] = r0; } }
  const ok = new Set(); for (let n = 0; n < fe.nn; n++) if (fixedNode[n]) ok.add(find(n));
  const bad = new Map();
  for (let e = 0; e < fe.ne; e++) { const r = find(fe.elN[e * 8]); if (!ok.has(r)) bad.set(r, (bad.get(r) || 0) + 1); }
  return { count: bad.size, elems: [...bad.values()].reduce((s, v) => s + v, 0), roots: bad, find };
}
const G_ACC = 9.81;
// bc: { supports: [sel], loads: [{ sel, F (N), dir [x,y,z] }], gravity: bool, dT (°C) }
export function solveStatic(fe, mats, bc, opt = {}) {
  const G = matGroups(fe, mats), nd = fe.nn * 3, fixed = new Uint8Array(nd), fixedNode = new Uint8Array(fe.nn), f = new Float64Array(nd);
  const supN = [], loadN = [];
  for (const s of bc.supports || []) for (const n of selectNodes(fe, s)) { fixedNode[n] = 1; fixed[n * 3] = fixed[n * 3 + 1] = fixed[n * 3 + 2] = 1; supN.push(n); }
  if (!supN.length) return { error: 'nofix', text: 'Sabitleme (mesnet) seçilmedi: model boşlukta serbest kalır, çözüm yok. En az bir yüz ya da nokta sabitle.' };
  const fl = floating(fe, fixedNode);
  if (fl.count) return { error: 'floating', text: fl.count + ' bölge (' + fl.elems + ' eleman) hiçbir sabitlemeye bağlı değil; o bölge boşlukta serbest kalıyor. Ya o bölgeyi de sabitle ya da parçaların birbirine değdiğinden emin ol.' };
  let Fapp = [0, 0, 0];
  for (const L of bc.loads || []) {
    const ns = selectNodes(fe, L.sel); if (!ns.length || !(L.F > 0)) continue;
    const dl = Math.hypot(...L.dir) || 1, df = L.dir.map((v) => v / dl), per = L.F / ns.length;
    for (const n of ns) { for (let k = 0; k < 3; k++) f[n * 3 + k] += per * df[k]; loadN.push(n); }
    for (let k = 0; k < 3; k++) Fapp[k] += L.F * df[k];
  }
  // düğüm kuvvetleri (basınç / moment yüklerinin eşdeğeri, fea2.js üretir): [{ n, f: [x, y, z] }]
  for (const q of bc.nodal || []) { for (let k = 0; k < 3; k++) { f[q.n * 3 + k] += q.f[k]; Fapp[k] += q.f[k]; } loadN.push(q.n); }
  let W = 0;
  if (bc.gravity) {
    for (let e = 0; e < fe.ne; e++) { const m = G[fe.elMat[e]], w = m.rho * 1e-6 * G_ACC * fe.h ** 3; W += w; for (let a = 0; a < 8; a++) f[fe.elN[e * 8 + a] * 3 + 1] -= w / 8; }
  }
  const dT = bc.dT || 0;
  if (dT) for (let e = 0; e < fe.ne; e++) { const m = G[fe.elMat[e]], s = m.E * m.alpha * dT * fe.h * fe.h; for (let i = 0; i < 24; i++) f[fe.elN[e * 8 + (i / 3 | 0)] * 3 + (i % 3)] += m.el.gth[i] * s; }
  const u = opt.x0 ? Float64Array.from(opt.x0) : new Float64Array(nd);
  let st, mg = null;
  if (opt.mg !== false && fe.origin && fe.ne > 800) { try { mg = buildMG(fe, G, fixed); } catch (e) { mg = null; } }
  st = pcg(fe, G, f, fixed, u, { ...opt, mg });
  if (mg && !st.converged) { u.fill(0); st = pcg(fe, G, f, fixed, u, { ...opt, mg: null }); st.fallback = true; }   // güvenlik: düz Jacobi ile yeniden
  // mesnet tepkileri: R = K u − f (sabit serbestliklerde)
  const Ku = new Float64Array(nd); matvec(fe, G, u, Ku);
  const R = [0, 0, 0]; for (let i = 0; i < nd; i++) if (fixed[i]) R[i % 3] += Ku[i] - f[i];
  const S = stresses(fe, G, u, dT);
  let maxU = 0, maxUn = -1; for (let n = 0; n < fe.nn; n++) { const d = Math.hypot(u[n * 3], u[n * 3 + 1], u[n * 3 + 2]); if (d > maxU) { maxU = d; maxUn = n; } }
  return { u: Float32Array.from(u), uFull: u, ...S, ...st, reaction: R, applied: [Fapp[0], Fapp[1] - W, Fapp[2]], weightN: W, maxU, maxUnode: maxUn, supN: [...new Set(supN)], loadN: [...new Set(loadN)], dT };
}
function stresses(fe, G, u, dT = 0) {
  const ne = fe.ne, vm = new Float32Array(ne), sig = new Float32Array(ne * 6), ue = new Float64Array(24), eps = new Float64Array(6);
  for (let e = 0; e < ne; e++) {
    const g = G[fe.elMat[e]], B0 = g.el.B0, D = g.el.D;
    for (let a = 0; a < 8; a++) { const d = fe.elN[e * 8 + a] * 3; ue[a * 3] = u[d]; ue[a * 3 + 1] = u[d + 1]; ue[a * 3 + 2] = u[d + 2]; }
    for (let i = 0; i < 6; i++) { let t = 0; for (let j = 0; j < 24; j++) t += B0[i * 24 + j] * ue[j]; eps[i] = t / fe.h - (i < 3 ? g.alpha * dT : 0); }
    const s = [];
    for (let i = 0; i < 6; i++) { let t = 0; for (let j = 0; j < 6; j++) t += D[i * 6 + j] * eps[j]; s.push(t * g.E); sig[e * 6 + i] = s[i]; }
    vm[e] = vonMises(s);
  }
  return { vm, sig };
}
export const vonMises = (s) => Math.sqrt(0.5 * ((s[0] - s[1]) ** 2 + (s[1] - s[2]) ** 2 + (s[2] - s[0]) ** 2) + 3 * (s[3] ** 2 + s[4] ** 2 + s[5] ** 2));

/* ---------- doğal frekans (modal) ---------- */
// alt uzay yinelemesi: K Φ = ω² M Φ (toplanmış kütle). Mesnetsiz modelde rijit cisim modları olur → mesnet gerekir.
function jacobiEig(A, n) {
  const a = Float64Array.from(A), V = new Float64Array(n * n); for (let i = 0; i < n; i++) V[i * n + i] = 1;
  for (let sweep = 0; sweep < 60; sweep++) {
    let off = 0; for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) off += a[i * n + j] ** 2;
    if (off < 1e-24) break;
    for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) {
      const apq = a[p * n + q]; if (Math.abs(apq) < 1e-300) continue;
      const th = (a[q * n + q] - a[p * n + p]) / (2 * apq), t = Math.sign(th || 1) / (Math.abs(th) + Math.sqrt(th * th + 1)), c = 1 / Math.sqrt(t * t + 1), s = t * c;
      for (let k = 0; k < n; k++) { const akp = a[k * n + p], akq = a[k * n + q]; a[k * n + p] = c * akp - s * akq; a[k * n + q] = s * akp + c * akq; }
      for (let k = 0; k < n; k++) { const apk = a[p * n + k], aqk = a[q * n + k]; a[p * n + k] = c * apk - s * aqk; a[q * n + k] = s * apk + c * aqk; }
      for (let k = 0; k < n; k++) { const vkp = V[k * n + p], vkq = V[k * n + q]; V[k * n + p] = c * vkp - s * vkq; V[k * n + q] = s * vkp + c * vkq; }
    }
  }
  return { w: Array.from({ length: n }, (_, i) => a[i * n + i]), V };
}
export function solveModal(fe, mats, bc, opt = {}) {
  const G = matGroups(fe, mats), nd = fe.nn * 3, fixed = new Uint8Array(nd), fixedNode = new Uint8Array(fe.nn);
  for (const s of bc.supports || []) for (const n of selectNodes(fe, s)) { fixedNode[n] = 1; fixed[n * 3] = fixed[n * 3 + 1] = fixed[n * 3 + 2] = 1; }
  if (!fixedNode.some((v) => v)) return { error: 'nofix', text: 'Titreşim analizi için sabitleme gerekir (mesnetsiz parça serbest salınır).' };
  const fl = floating(fe, fixedNode); if (fl.count) return { error: 'floating', text: fl.count + ' bölge hiçbir sabitlemeye bağlı değil.' };
  const M = new Float64Array(nd);
  for (let e = 0; e < fe.ne; e++) { const m = G[fe.elMat[e]].rho * 1e-9 * fe.h ** 3 / 8; for (let a = 0; a < 8; a++) { const d = fe.elN[e * 8 + a] * 3; M[d] += m; M[d + 1] += m; M[d + 2] += m; } }
  const want = opt.modes || 3, p = opt.vectors || want + 1, dg = diagK(fe, G);
  let mg = null; if (opt.mg !== false && fe.origin && fe.ne > 800) { try { mg = buildMG(fe, G, fixed); } catch (e) { mg = null; } }
  // başlangıç: üç eksende yerçekimi benzeri kütle dağılımı + bir burulma vektörü
  const c = [0, 0, 0]; let mt = 0; for (let n = 0; n < fe.nn; n++) { const m = M[n * 3]; mt += m; for (let k = 0; k < 3; k++) c[k] += m * fe.xyz[n * 3 + k]; } c.forEach((v, k) => { c[k] = v / mt; });
  // j ≥ 4: farklı dalga sayılı düşük frekanslı biçimler (vektörler doğrusal bağımsız olsun; çok mod istendiğinde gerekli)
  const bbm = [0, 1, 2].map((k) => { let a = Infinity, b = -Infinity; for (let n = 0; n < fe.nn; n++) { a = Math.min(a, fe.xyz[n * 3 + k]); b = Math.max(b, fe.xyz[n * 3 + k]); } return [a, (b - a) || 1]; });
  let X = Array.from({ length: p }, (_, j) => { const v = new Float64Array(nd); for (let n = 0; n < fe.nn; n++) { if (j < 3) v[n * 3 + j] = 1; else if (j > 3) { const q = j - 4, ax = q % 3, w = 1 + (q / 3 | 0); for (let k = 0; k < 3; k++) { const s = (fe.xyz[n * 3 + k] - bbm[k][0]) / bbm[k][1]; v[n * 3 + ax] += Math.sin(w * Math.PI * s + k + q) * (k === ax ? 0.3 : 1); } } else { const dx = fe.xyz[n * 3] - c[0], dz = fe.xyz[n * 3 + 2] - c[2], dy = fe.xyz[n * 3 + 1] - c[1]; v[n * 3] = -dy + dz * 0.3; v[n * 3 + 1] = dx; v[n * 3 + 2] = -dx * 0.3 + dy * 0.2; } } for (let i = 0; i < nd; i++) if (fixed[i]) v[i] = 0; return v; });
  const Xb = Array.from({ length: p }, () => new Float64Array(nd));
  let lam = null, it = 0, conv = false, iters = 0;
  for (; it < (opt.maxIter || 20); it++) {
    for (let j = 0; j < p; j++) { const Y = new Float64Array(nd); for (let i = 0; i < nd; i++) Y[i] = fixed[i] ? 0 : M[i] * X[j][i]; const s = pcg(fe, G, Y, fixed, Xb[j], { tol: opt.tol || 1e-4, diag: dg, mg }); iters += s.iters; if (opt.debug) opt.debug(it, j, s); X[j] = Y; }
    // Kr = Xbᵀ K Xb = Xbᵀ Y,  Mr = Xbᵀ M Xb
    const Kr = new Float64Array(p * p), Mr = new Float64Array(p * p);
    for (let a = 0; a < p; a++) for (let b = a; b < p; b++) { let k = 0, m = 0; for (let i = 0; i < nd; i++) { k += Xb[a][i] * X[b][i]; m += Xb[a][i] * M[i] * Xb[b][i]; } Kr[a * p + b] = Kr[b * p + a] = k; Mr[a * p + b] = Mr[b * p + a] = m; }
    // Mr = L Lᵀ, C = L⁻¹ Kr L⁻ᵀ
    const L = new Float64Array(p * p);
    for (let i = 0; i < p; i++) for (let j = 0; j <= i; j++) { let s = Mr[i * p + j]; for (let k = 0; k < j; k++) s -= L[i * p + k] * L[j * p + k]; L[i * p + j] = i === j ? Math.sqrt(Math.max(s, 1e-300)) : s / L[j * p + j]; }
    const Li = invert(L, p), C = new Float64Array(p * p);
    for (let i = 0; i < p; i++) for (let j = 0; j < p; j++) { let s = 0; for (let a = 0; a < p; a++) for (let b = 0; b < p; b++) s += Li[i * p + a] * Kr[a * p + b] * Li[j * p + b]; C[i * p + j] = s; }
    const { w, V } = jacobiEig(C, p);
    const ord = w.map((v, i) => [v, i]).sort((a, b) => a[0] - b[0]);
    const Q = new Float64Array(p * p);   // Q = L⁻ᵀ V
    for (let i = 0; i < p; i++) for (let j = 0; j < p; j++) { let s = 0; for (let k = 0; k < p; k++) s += Li[k * p + i] * V[k * p + ord[j][1]]; Q[i * p + j] = s; }
    const newX = Array.from({ length: p }, () => new Float64Array(nd));
    for (let j = 0; j < p; j++) for (let a = 0; a < p; a++) { const q = Q[a * p + j]; if (q) for (let i = 0; i < nd; i++) newX[j][i] += Xb[a][i] * q; }
    const nl = ord.map((o) => o[0]);
    if (lam && nl.slice(0, want).every((v, i) => Math.abs(v - lam[i]) / Math.abs(v) < 1e-4)) { X = newX; lam = nl; conv = true; break; }
    X = newX; lam = nl;
    for (let j = 0; j < p; j++) { const sc = lam[j] > 0 ? 1 / lam[j] : 0; const v = Xb[j]; for (let i = 0; i < nd; i++) v[i] = X[j][i] * sc; }   // sıcak başlangıç: K⁻¹Mφ = φ/λ
    if (opt.onProgress) opt.onProgress(it, lam[0]);
  }
  const modes = [];
  for (let j = 0; j < want; j++) {
    const ev = lam[j]; if (!(ev > 0)) continue;
    const phi = X[j]; let mx = 0; for (let i = 0; i < nd; i++) mx = Math.max(mx, Math.abs(phi[i]));
    const ph = new Float32Array(nd); for (let i = 0; i < nd; i++) ph[i] = phi[i] / (mx || 1);
    // yön: en büyük ortalama hareket ekseni
    const ax = [0, 0, 0]; for (let n = 0; n < fe.nn; n++) for (let k = 0; k < 3; k++) ax[k] += Math.abs(ph[n * 3 + k]);
    const S = stresses(fe, G, ph, 0);
    modes.push({ f: Math.sqrt(ev) / (2 * Math.PI), phi: ph, axis: ax.indexOf(Math.max(...ax)), vm: S.vm });
  }
  return { modes, converged: conv, iters, massKg: mt * 1000 };
}
// zorlanmış titreşim: dinamik büyütme (tek serbestlik dereceli yaklaşım, viskoz sönüm ζ)
export function resonance(fn, f, zeta = 0.02) {
  const r = f / fn, daf = 1 / Math.sqrt((1 - r * r) ** 2 + (2 * zeta * r) ** 2);
  const level = r > 0.85 && r < 1.15 ? 'crit' : r > 0.7 && r < 1.4 ? 'warn' : 'ok';
  return { r, daf, level };
}

/* ---------- sonuç işleme ---------- */
export function nodalAvg(fe, ev) {
  const s = new Float32Array(fe.nn), c = new Uint8Array(fe.nn);
  for (let e = 0; e < fe.ne; e++) for (let a = 0; a < 8; a++) { const n = fe.elN[e * 8 + a]; s[n] += ev[e]; c[n]++; }
  for (let n = 0; n < fe.nn; n++) if (c[n]) s[n] /= c[n];
  return s;
}
export function percentile(arr, p) { const a = Float32Array.from(arr).sort(); return a.length ? a[Math.min(a.length - 1, Math.floor(p * (a.length - 1)))] : 0; }
// yüzey dörtgenleri (boş komşuya bakan hücre yüzleri) → düğüm indeksleri
export function surfaceQuads(fe, grid) {
  const { nx, ny, nz, mat } = grid, cellEl = new Int32Array(mat.length).fill(-1);
  for (let e = 0; e < fe.ne; e++) cellEl[fe.elCell[e]] = e;
  const filled = (i, j, k) => i >= 0 && j >= 0 && k >= 0 && i < nx && j < ny && k < nz && mat[i + nx * (j + ny * k)] >= 0;
  // yüz → yerel düğümler (dışa bakan sırayla)
  const F = [[[-1, 0, 0], [0, 4, 7, 3]], [[1, 0, 0], [1, 2, 6, 5]], [[0, -1, 0], [0, 1, 5, 4]], [[0, 1, 0], [3, 7, 6, 2]], [[0, 0, -1], [0, 3, 2, 1]], [[0, 0, 1], [4, 5, 6, 7]]];
  const q = [], qe = [];
  for (let e = 0; e < fe.ne; e++) {
    const c = fe.elCell[e], i = c % nx, j = ((c - i) / nx) % ny, k = Math.floor(c / (nx * ny));
    for (const [d, loc] of F) if (!filled(i + d[0], j + d[1], k + d[2])) { for (const a of loc) q.push(fe.elN[e * 8 + a]); qe.push(e); }
  }
  return { quads: Int32Array.from(q), qe: Int32Array.from(qe) };
}
// kritik bölgeler: kullanım oranı (σvm / akma) yüksek elemanların komşuluk öbekleri
export function criticalRegions(fe, grid, mats, vm, opt = {}) {
  const util = new Float32Array(fe.ne); let um = 0;
  for (let e = 0; e < fe.ne; e++) { util[e] = vm[e] / mats[fe.elMat[e]].sy; if (util[e] > um) um = util[e]; }
  if (!(um > 0)) return [];
  const th = um * (opt.frac || 0.6), { nx, ny } = grid, cellEl = new Map();
  for (let e = 0; e < fe.ne; e++) if (util[e] >= th) cellEl.set(fe.elCell[e], e);
  const seen = new Set(), regs = [], bc = new Set([...(opt.bcNodes || [])]);
  for (const [c0] of cellEl) {
    if (seen.has(c0)) continue;
    const st = [c0], list = []; seen.add(c0);
    while (st.length) {
      const c = st.pop(); list.push(cellEl.get(c));
      const i = c % nx, j = ((c - i) / nx) % ny, k = Math.floor(c / (nx * ny));
      for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) for (let dk = -1; dk <= 1; dk++) {
        const ii = i + di, jj = j + dj, kk = k + dk; if (ii < 0 || jj < 0 || kk < 0 || ii >= nx || jj >= ny || kk >= grid.nz) continue;
        const cc = ii + nx * (jj + ny * kk); if (cellEl.has(cc) && !seen.has(cc)) { seen.add(cc); st.push(cc); }
      }
    }
    let mx = 0, me = list[0]; const ctr = [0, 0, 0];
    for (const e of list) { if (util[e] > mx) { mx = util[e]; me = e; } for (let a = 0; a < 8; a++) for (let k = 0; k < 3; k++) ctr[k] += fe.xyz[fe.elN[e * 8 + a] * 3 + k] / 8; }
    ctr.forEach((v, k) => { ctr[k] = v / list.length; });
    const at = [0, 0, 0]; for (let a = 0; a < 8; a++) for (let k = 0; k < 3; k++) at[k] += fe.xyz[fe.elN[me * 8 + a] * 3 + k] / 8;
    let nearBC = false; for (const e of list) { for (let a = 0; a < 8; a++) if (bc.has(fe.elN[e * 8 + a])) { nearBC = true; break; } if (nearBC) break; }
    if (!nearBC && opt.bcXYZ) for (const p of opt.bcXYZ) if (Math.hypot(p[0] - at[0], p[1] - at[1], p[2] - at[2]) < 2.5 * fe.h) { nearBC = true; break; }
    regs.push({ util: mx, vm: vm[me], at, center: ctr, count: list.length, elem: me, partIdx: grid.part[fe.elCell[me]], mat: fe.elMat[me], nearBC });
  }
  return regs.sort((a, b) => b.util - a.util).slice(0, opt.max || 5);
}

/* ---------- yorulma (S-N) ---------- */
// Shigley yaklaşımı: çelik / titanyum yorulma sınırı Se' = 0,5·Su (Su ≤ 1400 MPa), Marin yüzey katsayısı ka = a·Su^b, boyut kb ≈ 0,85;
// sınırı olmayan malzemelerde Basquin doğrusu (10³ çevrimde 0,9·Su → Nf çevrimde Sf). Ortalama gerilme: Goodman.
export const SURF = { islenmis: [4.51, -0.265, 'İşlenmiş / soğuk çekilmiş'], taslanmis: [1.58, -0.085, 'Taşlanmış'], haddelenmis: [57.7, -0.718, 'Sıcak haddelenmiş'], dovme: [272, -0.995, 'Dövme / döküm yüzey'] };
export function fatigue(mp, smax, opt = {}) {
  const Su = mp.su, R = opt.R ?? -1;   // R = σmin/σmax: −1 tam değişken, 0 sıfırdan maksimuma
  const sa = smax * (1 - R) / 2, sm = smax * (1 + R) / 2;
  if (sm >= Su) return { N: 0, sa, sm, text: 'Ortalama gerilme çekme dayanımını aşıyor: ilk yüklemede hasar.' };
  const sar = sa / (1 - sm / Su);   // Goodman eşdeğer tam değişken genlik
  const f = 0.9, S3 = f * Su;
  let Se, Ne, limit = false, ka = 1, kb = 1;
  if (mp.fat.type === 'limit') {
    const s = SURF[opt.surface || 'islenmis']; ka = Math.min(1, s[0] * Su ** s[1]); kb = 0.85;
    Se = 0.5 * Math.min(Su, 1400) * ka * kb; Ne = 1e6; limit = true;
  } else {
    Se = mp.fat.rel ? mp.fat.Sf * Su : mp.fat.Sf; Ne = mp.fat.Nf;
    if (!mp.fat.rel) { const s = SURF[opt.surface || 'islenmis']; ka = Math.min(1, s[0] * Su ** s[1]); Se *= ka; }
  }
  if (sar >= S3) return { N: sar >= Su ? 0 : 1e3, sa, sm, sar, Se, low: true, text: 'Genlik çok yüksek (düşük çevrimli yorulma bölgesi, < 1000 çevrim).' };
  if (limit && sar <= Se) return { N: Infinity, sa, sm, sar, Se, ka, kb, infinite: true };
  const b = Math.log10(Se / S3) / Math.log10(Ne / 1e3), N = 1e3 * (sar / S3) ** (1 / b);
  return { N, sa, sm, sar, Se, Ne, ka, kb, beyond: !limit && N > Ne };
}
// yıl olarak ömür aralığı: yorulma deneylerinde saçılma ~ ×3 (ölçüm yoksa kesin değer verilmez)
export function lifeYears(N, cyclesPerDay) {
  if (!(cyclesPerDay > 0)) return null;
  if (N === Infinity) return { inf: true };
  const y = N / (cyclesPerDay * 365);
  return { y, lo: y / 3, hi: y * 3 };
}
/* ---------- aşınma (Archard) ---------- */
// V = K·F·s / H; derinlik = V / A. K boyutsuz aşınma katsayısı (kuru kayma 1e-6…1e-4, yağlı 1e-9…1e-7 tipik aralık)
export const WEAR_K = { kuru: [1e-6, 1e-4], yagli: [1e-9, 1e-7] };
export function wear(mp, F, slidePerCycle, cyclesPerDay, area, cond = 'kuru') {
  if (!(F > 0 && slidePerCycle > 0 && cyclesPerDay > 0 && area > 0)) return null;
  const s = slidePerCycle * cyclesPerDay * 365, [k0, k1] = WEAR_K[cond];
  const d = (k) => k * F * s / mp.H / area;   // mm / yıl
  return { lo: d(k0), hi: d(k1), p: F / area };
}

/* ---------- tasarım alternatifleri (voxel) ---------- */
// güçlendir: yüksek gerilmeli bölgenin çevresine malzeme katmanı ekle (yalnızca boş hücreye, model sınır kutusu içinde)
// ızgarayı her yönde p hücre büyüt
export function padGrid(grid, p) {
  const { nx, ny, nz, h, origin } = grid, NX = nx + 2 * p, NY = ny + 2 * p, NZ = nz + 2 * p, N = NX * NY * NZ;
  const mat = new Int8Array(N).fill(-1), part = new Int32Array(N).fill(-1);
  for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) { const c = i + nx * (j + ny * k), d = (i + p) + NX * ((j + p) + NY * (k + p)); mat[d] = grid.mat[c]; part[d] = grid.part[c]; }
  return { ...grid, nx: NX, ny: NY, nz: NZ, origin: [origin[0] - p * h, origin[1] - p * h, origin[2] - p * h], mat, part, parts: grid.parts.map((q) => ({ ...q })) };
}
// güçlendir: yüksek gerilmeli bölgenin çevresine malzeme katmanı ekle (yalnızca boş hücreye). lock: ['-x', …] mesnet / yük yüzleri:
// o yüzlerin ötesine malzeme eklenmez (mesnet ve yük yeri değişmesin)
export function thicken(grid, fe, vm, mats, opt = {}) {
  const L = opt.layers || 2, g = padGrid(grid, L), { nx, ny, nz, h, origin } = g, util = (e) => vm[e] / mats[fe.elMat[e]].sy;
  const lo = grid.origin, hi = [grid.origin[0] + grid.nx * grid.h, grid.origin[1] + grid.ny * grid.h, grid.origin[2] + grid.nz * grid.h];
  const lim = (opt.lock || []).map((f) => [f[0] === '-' ? -1 : 1, 'xyz'.indexOf(f[1])]);
  let um = 0; for (let e = 0; e < fe.ne; e++) um = Math.max(um, util(e));
  const th = um * (opt.frac || 0.5), map = (c) => { const i = c % grid.nx, j = ((c - i) / grid.nx) % grid.ny, k = Math.floor(c / (grid.nx * grid.ny)); return (i + L) + nx * ((j + L) + ny * (k + L)); };
  let seeds = []; for (let e = 0; e < fe.ne; e++) if (util(e) >= th) seeds.push(map(fe.elCell[e]));
  let added = 0;
  for (let layer = 0; layer < L; layer++) {
    const next = [];
    for (const c of seeds) {
      const i = c % nx, j = ((c - i) / nx) % ny, k = Math.floor(c / (nx * ny));
      for (const [di, dj, dk] of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]) {
        const ii = i + di, jj = j + dj, kk = k + dk; if (ii < 0 || jj < 0 || kk < 0 || ii >= nx || jj >= ny || kk >= nz) continue;
        const ctr = [origin[0] + (ii + 0.5) * h, origin[1] + (jj + 0.5) * h, origin[2] + (kk + 0.5) * h];
        if (lim.some(([sg, ax]) => (sg < 0 ? ctr[ax] < lo[ax] : ctr[ax] > hi[ax]))) continue;
        const cc = ii + nx * (jj + ny * kk);
        if (g.mat[cc] < 0) { g.mat[cc] = g.mat[c]; g.part[cc] = g.part[c]; added++; next.push(cc); }
      }
    }
    seeds = next;
  }
  return { grid: g, added };
}
// hafiflet: düşük gerilmeli hücreleri çıkar (yük / mesnet hücreleri korunur), sonra mesnede bağlı olmayan öbekleri at
// hafiflet: düşük gerilmeli hücreleri çıkar (mesnet ve yük hücreleri korunur), mesnede bağlı olmayan öbekleri at.
// Yük bölgesi mesnetten koparsa { broken: true } döner (tasarım taşıyamaz → daha az malzeme çıkar).
export function lighten(grid, fe, vm, mats, supN, loadN, opt = {}) {
  const g = cloneGrid(grid), keep = new Uint8Array(fe.nn); for (const n of supN) keep[n] = 1; for (const n of loadN) keep[n] = 1;
  const util = new Float32Array(fe.ne); for (let e = 0; e < fe.ne; e++) util[e] = vm[e] / mats[fe.elMat[e]].sy;
  const ref = percentile(util, 0.99), th = ref * (opt.frac || 0.08);
  let removed = 0;
  for (let e = 0; e < fe.ne; e++) {
    if (util[e] >= th) continue;
    let k = false; for (let a = 0; a < 8; a++) if (keep[fe.elN[e * 8 + a]]) { k = true; break; }
    if (k) continue;
    g.mat[fe.elCell[e]] = -1; g.part[fe.elCell[e]] = -1; removed++;
  }
  const key = (x, n) => Math.round(x[n * 3] * 1e3) + ',' + Math.round(x[n * 3 + 1] * 1e3) + ',' + Math.round(x[n * 3 + 2] * 1e3);
  const supK = new Set(supN.map((n) => key(fe.xyz, n))), loadK = new Set(loadN.map((n) => key(fe.xyz, n)));
  const fe2 = buildFE(g), anchor = new Uint8Array(fe2.nn);
  for (let n = 0; n < fe2.nn; n++) if (supK.has(key(fe2.xyz, n))) anchor[n] = 1;
  const fl = floating(fe2, anchor);
  let broken = false;
  if (fl.count) {
    for (let n = 0; n < fe2.nn; n++) if (loadK.has(key(fe2.xyz, n)) && fl.roots.has(fl.find(n))) { broken = true; break; }
    for (let e = 0; e < fe2.ne; e++) if (fl.roots.has(fl.find(fe2.elN[e * 8]))) { g.mat[fe2.elCell[e]] = -1; g.part[fe2.elCell[e]] = -1; removed++; }
  }
  return { grid: g, removed, broken };
}
export function gridMass(grid, mats) { let m = 0; const v = grid.h ** 3; for (let c = 0; c < grid.mat.length; c++) if (grid.mat[c] >= 0) m += mats[grid.mat[c]].rho * v * 1e-6; return m; }   // kg
// tek malzemeli modelde malzeme değişimi: doğrusal süperpozisyon (uygulanan yük gerilmesi E'den bağımsız, öz ağırlık ρ ile orantılı,
// yer değiştirme 1/E ile). ν farkı ihmal edilir.
export function materialSwap(caseF, caseG, m0, m1) {
  const kr = m1.rho / m0.rho, ke = m0.E / m1.E, ne = caseF.vm.length;
  let vmax = 0; const s = new Array(6);
  for (let e = 0; e < ne; e++) { for (let i = 0; i < 6; i++) s[i] = caseF.sig[e * 6 + i] + (caseG ? kr * caseG.sig[e * 6 + i] : 0); vmax = Math.max(vmax, vonMises(s)); }
  let umax = 0; const nn = caseF.u.length / 3;
  for (let n = 0; n < nn; n++) { let d = 0; for (let k = 0; k < 3; k++) { const v = ke * (caseF.u[n * 3 + k] + (caseG ? kr * caseG.u[n * 3 + k] : 0)); d += v * v; } umax = Math.max(umax, Math.sqrt(d)); }
  return { vmax, umax };
}
// RLE (proje kaydı için)
export function rle(mat) { const out = []; let v = mat[0], n = 0; for (let i = 0; i < mat.length; i++) { if (mat[i] === v) n++; else { out.push(v, n); v = mat[i]; n = 1; } } out.push(v, n); return out; }
export function unrle(a, N) { const m = new Int8Array(N); let p = 0; for (let i = 0; i < a.length; i += 2) { m.fill(a[i], p, p + a[i + 1]); p += a[i + 1]; } return m; }

// fea2.js (gelişmiş analizler) için iç yapı taşları — davranış değişmez, yalnız dışa açılır
export const _internal = { matGroups, matvec, diagK, pcg, buildMG, floating, stresses, invert, jacobiEig, NAT, dNat };
