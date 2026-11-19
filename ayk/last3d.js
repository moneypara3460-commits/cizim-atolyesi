// 3D kalıp (STL / OBJ): dosyayı oku, birimi ve yönü bul, sakla, görünüşleri (dış yan, iç yan, alt, üst) tam ölçüsünde çıkar.
// Kalıp koordinatı (mm): x topuk arkasından buruna, z yukarı (taban altta), y = z × x. Dış yan "outer" (+1 / −1) işaretli y yönündedir.
// Saf hesap: tarayıcı ya da Node fark etmez (görüntüye çevirme app.js'de).
import * as G from './geom.js?v=20261119c';
import { traceBoundary, smoothLoop, simplifyLoop } from './last.js?v=20261119c';

export const UNITS = { mm: 1, cm: 10, m: 1000, in: 25.4 };
export const UNIT_NAMES = { mm: 'milimetre', cm: 'santimetre', m: 'metre', in: 'inç' };
export const MAX_IN_TRIS = 3e6;        // okunacak en çok üçgen
export const STORE_TRIS = 60000;       // saklanan en çok üçgen (sadeleştirme)

/* ---------- dosya okuma ---------- */
// Üçgen çorbası: Float32Array, üçgen başına 9 sayı.
export function parseSTL(data) {
  const u8 = data instanceof Uint8Array ? data : new Uint8Array(data);
  if (u8.length >= 84) {
    const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength), n = dv.getUint32(80, true);
    if (84 + 50 * n === u8.length) {   // ikili (başı "solid" diye başlasa da boyut tutuyorsa ikilidir)
      if (n > MAX_IN_TRIS) throw new Error(`çok fazla üçgen (${n.toLocaleString('tr-TR')}; en çok ${MAX_IN_TRIS.toLocaleString('tr-TR')})`);
      const P = new Float32Array(n * 9);
      for (let i = 0; i < n; i++) { const o = 84 + 50 * i + 12; for (let j = 0; j < 9; j++) P[i * 9 + j] = dv.getFloat32(o + 4 * j, true); }
      return P;
    }
  }
  const text = new TextDecoder().decode(u8);
  if (!/^\s*solid/i.test(text)) throw new Error('STL dosyası okunamadı (ne ikili ne yazı biçiminde)');
  const out = [], re = /vertex\s+(\S+)\s+(\S+)\s+(\S+)/gi;
  let m;
  while ((m = re.exec(text))) { out.push(+m[1], +m[2], +m[3]); if (out.length > MAX_IN_TRIS * 9) throw new Error('çok fazla üçgen'); }
  if (!out.length || out.length % 9) throw new Error('STL dosyasında üçgen bulunamadı');
  return Float32Array.from(out);
}
export function parseOBJ(text) {
  const V = [], T = [];
  for (const raw of String(text).split(/\r?\n/)) {
    const line = raw.trim();
    if (line.startsWith('v ')) { const a = line.split(/\s+/); V.push(+a[1], +a[2], +a[3]); continue; }
    if (!line.startsWith('f ')) continue;
    const nv = V.length / 3;
    const idx = line.split(/\s+/).slice(1).map((tok) => { const k = parseInt(tok, 10); return k < 0 ? nv + k : k - 1; });
    if (idx.some((k) => !(k >= 0 && k < nv))) throw new Error('OBJ dosyasında geçersiz yüz: ' + line.slice(0, 60));
    for (let i = 1; i + 1 < idx.length; i++) {   // çokgen → yelpaze üçgenler
      for (const k of [idx[0], idx[i], idx[i + 1]]) T.push(V[3 * k], V[3 * k + 1], V[3 * k + 2]);
      if (T.length > MAX_IN_TRIS * 9) throw new Error('çok fazla üçgen');
    }
  }
  if (!T.length) throw new Error('OBJ dosyasında yüz (f) bulunamadı');
  return Float32Array.from(T);
}
export function parseMeshFile(name, bytes) {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const ext = String(name || '').toLowerCase().split('.').pop();
  if (ext === 'obj') return parseOBJ(new TextDecoder().decode(u8));
  if (ext === 'stl') return parseSTL(u8);
  const head = new TextDecoder().decode(u8.subarray(0, 400));
  if (/^\s*(#|v |o |g |mtllib)/m.test(head) && !/^\s*solid/i.test(head)) return parseOBJ(new TextDecoder().decode(u8));
  return parseSTL(u8);
}

/* ---------- küçük cebir ---------- */
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
// simetrik 3 × 3 matrisin öz vektörleri (Jacobi); büyükten küçüğe
function eigen3(A) {
  const a = A.map((r) => r.slice()), v = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  for (let it = 0; it < 60; it++) {
    let p = 0, q = 1;
    if (Math.abs(a[0][2]) > Math.abs(a[p][q])) { p = 0; q = 2; }
    if (Math.abs(a[1][2]) > Math.abs(a[p][q])) { p = 1; q = 2; }
    if (Math.abs(a[p][q]) < 1e-12 * (Math.abs(a[0][0]) + Math.abs(a[1][1]) + Math.abs(a[2][2]) + 1e-30)) break;
    const th = 0.5 * Math.atan2(2 * a[p][q], a[q][q] - a[p][p]), c = Math.cos(th), s = Math.sin(th);
    for (let k = 0; k < 3; k++) { const x = a[k][p], y = a[k][q]; a[k][p] = c * x - s * y; a[k][q] = s * x + c * y; }
    for (let k = 0; k < 3; k++) { const x = a[p][k], y = a[q][k]; a[p][k] = c * x - s * y; a[q][k] = s * x + c * y; }
    for (let k = 0; k < 3; k++) { const x = v[k][p], y = v[k][q]; v[k][p] = c * x - s * y; v[k][q] = s * x + c * y; }
  }
  return [0, 1, 2].map((i) => ({ val: a[i][i], vec: [v[0][i], v[1][i], v[2][i]] })).sort((x, y) => y.val - x.val);
}

/* ---------- ölçü ---------- */
export function soupBox(P) {
  const b = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
  for (let i = 0; i < P.length; i += 3) for (let j = 0; j < 3; j++) { const c = P[i + j]; if (!Number.isFinite(c)) throw new Error('dosyada geçersiz sayı var'); if (c < b[j]) b[j] = c; if (c > b[3 + j]) b[3 + j] = c; }
  return b;
}
// Birim tahmini: kalıbın en uzun ölçüsü 80–450 mm olmalı (çocuk … büyük numara). Hangi birim bu aralığa düşürüyorsa o.
// Numaradan beklenen boy verilirse aralığa düşen birimlerden ona en yakın olanı seçilir (ör. 10,5 hem cm hem inç olabilir).
export function guessUnit(P, expectedMm = null) {
  const b = soupBox(P), ext = Math.max(b[3] - b[0], b[4] - b[1], b[5] - b[2]);
  if (!(ext > 0)) throw new Error('model boş ya da düz (boyutu sıfır)');
  const fits = ['mm', 'cm', 'in', 'm'].filter((u) => ext * UNITS[u] >= 80 && ext * UNITS[u] <= 450);
  if (!fits.length) return { unit: 'mm', sure: false, ext };
  if (expectedMm > 0) fits.sort((u, v) => Math.abs(ext * UNITS[u] - expectedMm) - Math.abs(ext * UNITS[v] - expectedMm));
  return { unit: fits[0], sure: fits.length === 1 || expectedMm > 0, ext };
}

/* ---------- kaynak + sadeleştirme (köşe kümeleme) ---------- */
// Kaynak: aynı noktadaki köşeler tek köşe olur (üçgen çorbası → sıralı ağ).
export function weld(P, tol = 0.001) {
  const map = new Map(), V = [], F = [], n = P.length / 9;
  for (let t = 0; t < n; t++) {
    const ids = [];
    for (let k = 0; k < 3; k++) {
      const o = t * 9 + 3 * k, key = Math.round(P[o] / tol) + ',' + Math.round(P[o + 1] / tol) + ',' + Math.round(P[o + 2] / tol);
      let id = map.get(key);
      if (id === undefined) { id = V.length / 3; map.set(key, id); V.push(P[o], P[o + 1], P[o + 2]); }
      ids.push(id);
    }
    if (ids[0] !== ids[1] && ids[1] !== ids[2] && ids[0] !== ids[2]) F.push(ids[0], ids[1], ids[2]);
  }
  return dedupeFaces({ V: Float32Array.from(V), F });
}
function dedupeFaces(m) {
  const seen = new Set(), F = [];
  for (let i = 0; i < m.F.length; i += 3) {
    const a = m.F[i], b = m.F[i + 1], c = m.F[i + 2];
    if (a === b || b === c || a === c) continue;
    const s = [a, b, c].sort((u, v) => u - v).join(',');
    if (seen.has(s)) continue;
    seen.add(s); F.push(a, b, c);
  }
  return { V: m.V, F: Uint32Array.from(F) };
}
// Sadeleştirme (köşe kümeleme, Lindstrom 2000): aynı hücreye (cell mm) düşen köşeler tek köşe olur. Yeni köşe, hücreye değen
// üçgen düzlemlerine uzaklık kareleri toplamını en küçük yapan noktadır (kuadrik); böylece burun ucu, topuk gibi uçlar ve keskin
// kenarlar içe çekilmez. Düz bölgede çözüm belirsizse ortalamaya yaslanır. Bozulan ve yinelenen üçgenler atılır.
export function cluster(m, cell) {
  const map = new Map(), n = m.V.length / 3, rep = new Int32Array(n), acc = [];   // hücre başına: Σx Σy Σz say, kuadrik (10)
  for (let i = 0; i < n; i++) {
    const x = m.V[3 * i], y = m.V[3 * i + 1], z = m.V[3 * i + 2], key = Math.floor(x / cell) + ',' + Math.floor(y / cell) + ',' + Math.floor(z / cell);
    let id = map.get(key);
    if (id === undefined) { id = acc.length / 14; map.set(key, id); for (let k = 0; k < 14; k++) acc.push(0); }
    acc[14 * id] += x; acc[14 * id + 1] += y; acc[14 * id + 2] += z; acc[14 * id + 3]++; rep[i] = id;
  }
  for (let t = 0; t < m.F.length; t += 3) {
    const [a, b, c] = tri(m, t), nn = cross(sub(b, a), sub(c, a)), l = Math.hypot(nn[0], nn[1], nn[2]);
    if (!(l > 0)) continue;
    const w = l / 2, nx = nn[0] / l, ny = nn[1] / l, nz = nn[2] / l, d = -(nx * a[0] + ny * a[1] + nz * a[2]);
    const q = [nx * nx, nx * ny, nx * nz, ny * ny, ny * nz, nz * nz, nx * d, ny * d, nz * d, d * d];
    const done = new Set();
    for (let k = 0; k < 3; k++) { const id = rep[m.F[t + k]]; if (done.has(id)) continue; done.add(id); for (let j = 0; j < 10; j++) acc[14 * id + 4 + j] += w * q[j]; }
  }
  const nv = acc.length / 14, V = new Float32Array(nv * 3);
  for (let i = 0; i < nv; i++) {
    const o = 14 * i, k = acc[o + 3], mx = acc[o] / k, my = acc[o + 1] / k, mz = acc[o + 2] / k;
    const [a11, a12, a13, a22, a23, a33, b1, b2, b3] = acc.slice(o + 4, o + 13);
    const lam = 1e-3 * (a11 + a22 + a33) + 1e-12;   // düz bölgede ortalamaya yaslan
    const A = [[a11 + lam, a12, a13], [a12, a22 + lam, a23], [a13, a23, a33 + lam]], B = [-b1 + lam * mx, -b2 + lam * my, -b3 + lam * mz];
    let p = solve3(A, B);
    // sonuç hücrenin dışına kaçarsa (kötü koşullu) ortalama
    if (!p || Math.abs(p[0] - mx) > cell || Math.abs(p[1] - my) > cell || Math.abs(p[2] - mz) > cell) p = [mx, my, mz];
    V[3 * i] = p[0]; V[3 * i + 1] = p[1]; V[3 * i + 2] = p[2];
  }
  const F = new Uint32Array(m.F.length);
  for (let i = 0; i < F.length; i++) F[i] = rep[m.F[i]];
  return compact(dedupeFaces({ V, F }));
}
function solve3(A, b) {
  const det = (M) => M[0][0] * (M[1][1] * M[2][2] - M[1][2] * M[2][1]) - M[0][1] * (M[1][0] * M[2][2] - M[1][2] * M[2][0]) + M[0][2] * (M[1][0] * M[2][1] - M[1][1] * M[2][0]);
  const D = det(A);
  if (!Number.isFinite(D) || Math.abs(D) < 1e-18) return null;
  const col = (j) => A.map((r, i) => r.map((v, k) => (k === j ? b[i] : v)));
  return [det(col(0)) / D, det(col(1)) / D, det(col(2)) / D];
}
// kullanılmayan köşeleri at
function compact(m) {
  const map = new Int32Array(m.V.length / 3).fill(-1), V = [];
  const F = new Uint32Array(m.F.length);
  for (let i = 0; i < F.length; i++) { const k = m.F[i]; if (map[k] < 0) { map[k] = V.length / 3; V.push(m.V[3 * k], m.V[3 * k + 1], m.V[3 * k + 2]); } F[i] = map[k]; }
  return { V: Float32Array.from(V), F };
}
export function surfaceArea(m) {
  let A = 0;
  for (let i = 0; i < m.F.length; i += 3) { const [a, b, c] = tri(m, i); A += Math.hypot(...cross(sub(b, a), sub(c, a))) / 2; }
  return A;
}
const vtx = (m, k) => [m.V[3 * k], m.V[3 * k + 1], m.V[3 * k + 2]];
const tri = (m, i) => [vtx(m, m.F[i]), vtx(m, m.F[i + 1]), vtx(m, m.F[i + 2])];
// hacim (kapalı yüzeyde anlamlı) ve açık kenar sayısı (yalnız bir üçgene ait kenar)
export function meshCheck(m) {
  const E = new Map();
  let vol = 0;
  for (let i = 0; i < m.F.length; i += 3) {
    const [a, b, c] = tri(m, i);
    vol += dot(a, cross(b, c)) / 6;
    for (const [u, v] of [[m.F[i], m.F[i + 1]], [m.F[i + 1], m.F[i + 2]], [m.F[i + 2], m.F[i]]]) { const k = u < v ? u * 4294967296 + v : v * 4294967296 + u; E.set(k, (E.get(k) || 0) + 1); }
  }
  let open = 0, multi = 0;
  for (const c of E.values()) { if (c === 1) open++; else if (c > 2) multi++; }
  return { volume: Math.abs(vol), open, multi, closed: open === 0 && multi === 0 };
}
export function box(m) {
  const b = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
  for (let i = 0; i < m.V.length; i += 3) for (let j = 0; j < 3; j++) { const c = m.V[i + j]; if (c < b[j]) b[j] = c; if (c > b[3 + j]) b[3 + j] = c; }
  return b;
}
export function dims(m) { const b = box(m); return { length: b[3] - b[0], width: b[4] - b[1], height: b[5] - b[2] }; }

/* ---------- yön bulma ---------- */
function applyBasis(m, X, Y, Z) {
  const V = new Float32Array(m.V.length);
  for (let i = 0; i < m.V.length; i += 3) { const p = [m.V[i], m.V[i + 1], m.V[i + 2]]; V[i] = dot(p, X); V[i + 1] = dot(p, Y); V[i + 2] = dot(p, Z); }
  return { V, F: m.F };
}
// x ≥ 0 topuk arkası 0, z ≥ 0 taban 0, y ortada
export function normalizePos(m) {
  const b = box(m), cy = (b[1] + b[4]) / 2, V = new Float32Array(m.V.length);
  for (let i = 0; i < m.V.length; i += 3) { V[i] = m.V[i] - b[0]; V[i + 1] = m.V[i + 1] - cy; V[i + 2] = m.V[i + 2] - b[2]; }
  return { V, F: m.F };
}
// 180° çevirme (dönüş: el yönü korunur) ve 90° döndürme
export function flipToe(m) { return normalizePos(applyBasis(m, [-1, 0, 0], [0, -1, 0], [0, 0, 1])); }
export function flipSole(m) { return normalizePos(applyBasis(m, [1, 0, 0], [0, -1, 0], [0, 0, -1])); }
export function rot90(m) { return normalizePos(applyBasis(m, [1, 0, 0], [0, 0, -1], [0, 1, 0])); }

// Uzun eksen: yüzey dağılımının ana ekseni. Düşey: uzun eksene dik düzlemde yüzey normallerinin en çok toplandığı doğrultu
// (taban ve konç düzlüğü birbirine ters bakar); taban, kesitte düz olan (normalleri dar açıda toplanan) taraf. Topuk: konç tarafı.
// İç yan tahmini: burun ucu kalıp eksenine göre iç yana kaçıktır (başparmak çizgisi). Hepsi kullanıcı tarafından çevrilebilir.
export function orient(m) {
  let A = 0; const c = [0, 0, 0], tris = [];
  for (let i = 0; i < m.F.length; i += 3) {
    const [a, b, d] = tri(m, i), n = cross(sub(b, a), sub(d, a)), ar = Math.hypot(...n) / 2;
    if (!(ar > 0)) continue;
    const g = [(a[0] + b[0] + d[0]) / 3, (a[1] + b[1] + d[1]) / 3, (a[2] + b[2] + d[2]) / 3];
    tris.push([g, norm(n), ar]); A += ar; c[0] += g[0] * ar; c[1] += g[1] * ar; c[2] += g[2] * ar;
  }
  if (!(A > 0)) throw new Error('modelin yüzeyi yok');
  c[0] /= A; c[1] /= A; c[2] /= A;
  const C = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (const [g, , ar] of tris) { const d = sub(g, c); for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) C[i][j] += d[i] * d[j] * ar; }
  const ev = eigen3(C), X = norm(ev[0].vec), b1 = norm(ev[1].vec), b2 = norm(cross(X, b1));
  // normal açısı histogramı (2°)
  const NB = 180, H = new Float64Array(NB);
  for (const [, n, ar] of tris) {
    const u = dot(n, b1), v = dot(n, b2), l2 = u * u + v * v;
    if (l2 < 0.25) continue;   // uzun eksene yakın bakan yüzler (topuk arkası, burun ucu) sayılmaz
    H[((Math.round((Math.atan2(v, u) * 180) / Math.PI / 2) % NB) + NB) % NB] += ar * l2;
  }
  const win = (k) => { let s = 0; for (let j = -7; j <= 7; j++) s += H[(k + j + NB) % NB] * (1 - Math.abs(j) / 8); return s; };
  let best = 0, bs = -1;
  for (let k = 0; k < NB / 2; k++) { const s = win(k) + win(k + NB / 2); if (s > bs) { bs = s; best = k; } }
  // Ana eksen konç yüzünden tabana göre eğik çıkabilir (≈15°): düşey eksen, histogramın bulduğu doğrultunun uzun eksen yönünde
  // ±35° eğilmiş hâlleri arasından düz yüz alanı (normali bu doğrultuya ±12° içinde) en büyük olanıdır.
  // Taban kesitte düzdür: bu düz yüzlerin alanı tabanın olduğu uçta büyüktür. Normalin yönüne (üçgen sırasına) bakılmaz:
  // içe dönük yüzlü dosyalarda da çalışır.
  const ang = (best * 2 * Math.PI) / 180, A0 = norm([b1[0] * Math.cos(ang) + b2[0] * Math.sin(ang), b1[1] * Math.cos(ang) + b2[1] * Math.sin(ang), b1[2] * Math.cos(ang) + b2[2] * Math.sin(ang)]);
  const c12 = Math.cos((12 * Math.PI) / 180), flat = (D) => { let a = 0; for (const [, n, ar] of tris) if (Math.abs(dot(n, D)) > c12) a += ar; return a; };
  let Ax = A0, bf = -1;
  for (let deg = -35; deg <= 35; deg += 1) {
    const t = (deg * Math.PI) / 180, D = norm([A0[0] * Math.cos(t) + X[0] * Math.sin(t), A0[1] * Math.cos(t) + X[1] * Math.sin(t), A0[2] * Math.cos(t) + X[2] * Math.sin(t)]);
    const f = flat(D); if (f > bf) { bf = f; Ax = D; }
  }
  let lo = 0, hi = 0;
  for (const [g, n, ar] of tris) if (Math.abs(dot(n, Ax)) > c12) { if (dot(sub(g, c), Ax) < 0) lo += ar; else hi += ar; }
  const Z = lo >= hi ? Ax : [-Ax[0], -Ax[1], -Ax[2]];   // taban alttaki uçtaysa yukarı +Ax
  const Xh = norm(sub(X, [Z[0] * dot(X, Z), Z[1] * dot(X, Z), Z[2] * dot(X, Z)])), Y = norm(cross(Z, Xh));
  let out = normalizePos(applyBasis(m, Xh, Y, Z));  // topuk: x'in iki ucundan hangisinde kalıp daha yüksek
  const L = box(out)[3];
  let hiA = 0, hiB = 0;
  for (let i = 0; i < out.V.length; i += 3) { const x = out.V[i], z = out.V[i + 2]; if (x < 0.35 * L) hiA = Math.max(hiA, z); else if (x > 0.65 * L) hiB = Math.max(hiB, z); }
  if (hiB > hiA) out = flipToe(out);
  out = alignYaw(out);
  return { mesh: out, outer: guessOuter(out) };
}
// Üstten bakışta topuk arkası ile burun ucunu birleştiren doğru x eksenine gelsin (kalıp boyu bu doğru boyunca ölçülür).
function alignYaw(m) {
  for (let it = 0; it < 3; it++) {
    const L = box(m)[3];
    let ha = [0, 0], ta = [0, 0], hx = Infinity, tx = -Infinity;
    for (let i = 0; i < m.V.length; i += 3) { const x = m.V[i], y = m.V[i + 1]; if (x < hx) { hx = x; ha = [x, y]; } if (x > tx) { tx = x; ta = [x, y]; } }
    const a = Math.atan2(ta[1] - ha[1], ta[0] - ha[0]);
    if (Math.abs(a) < 1e-4 || !(L > 0)) break;
    const c = Math.cos(a), s = Math.sin(a);
    m = normalizePos(applyBasis(m, [c, s, 0], [-s, c, 0], [0, 0, 1]));
  }
  return m;
}
// dış yan işareti: burun ucu iç yana kaçıktır → dış yan ters taraf
export function guessOuter(m) {
  const L = box(m)[3], acc = { h: [0, 0], b: [0, 0], t: [0, 0] };
  for (let i = 0; i < m.V.length; i += 3) {
    const x = m.V[i] / L, y = m.V[i + 1];
    const k = x > 0.05 && x < 0.2 ? 'h' : x > 0.55 && x < 0.7 ? 'b' : x > 0.97 ? 't' : null;
    if (k) { acc[k][0] += y; acc[k][1]++; }
  }
  const my = (k) => (acc[k][1] ? acc[k][0] / acc[k][1] : 0);
  // topuk ortası → tarak ortası doğrusunun burun ucundaki yeri
  const yh = my('h'), yb = my('b'), yLine = yh + ((yb - yh) * (1 - 0.125)) / (0.625 - 0.125);
  return my('t') - yLine > 0 ? -1 : 1;
}

/* ---------- hazırlama ---------- */
// Dosya baytlarından saklanacak kalıba: birim → mm, kaynak, gerekirse sadeleştirme, yön.
export function prepare(P, { unit = null, target = STORE_TRIS, expectedMm = null } = {}) {
  const g = guessUnit(P, expectedMm), u = UNITS[unit] ? unit : g.unit, s = UNITS[u];
  const Q = s === 1 ? P : P.map((c) => c * s);
  const w = weld(Q, 0.001), inTris = P.length / 9;
  let m = w;
  if (m.F.length / 3 > target) {
    const A = surfaceArea(w);
    let cell = Math.max(0.05, Math.sqrt((2 * A) / target) * 0.75);
    for (let i = 0; i < 14; i++) { m = cluster(w, cell); if (m.F.length / 3 <= target) break; cell *= 1.15; }
    if (m.F.length / 3 > target) throw new Error('model sadeleştirilemedi');
  } else m = compact(w);
  if (m.F.length < 12) throw new Error('modelde yeterli üçgen yok');
  const o = orient(m), chk = meshCheck(w);   // kapalılık asıl (sadeleştirilmemiş) yüzeyde denetlenir
  return { mesh: o.mesh, outer: o.outer, unit: u, unitSure: !!(unit || g.sure), inTris, tris: o.mesh.F.length / 3, check: chk, dims: dims(o.mesh) };
}
// birim değişince (ör. mm sanılan cm imiş) ölçekle
export function rescale(m, k) { const V = new Float32Array(m.V.length); for (let i = 0; i < V.length; i++) V[i] = m.V[i] * k; return { V, F: m.F }; }

/* ---------- saklama (base64, 16 bit nicemleme ≈ 0,006 mm) ---------- */
const B64 = /^[A-Za-z0-9+/]*={0,2}$/;
function toB64(u8) { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); }
function fromB64(s) { const b = atob(s), u8 = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u8[i] = b.charCodeAt(i); return u8; }
export function encodeMesh(m) {
  const b = box(m), n = m.V.length / 3, q = new Uint16Array(n * 3);
  for (let i = 0; i < n * 3; i++) { const j = i % 3, r = b[3 + j] - b[j] || 1; q[i] = Math.round(((m.V[i] - b[j]) / r) * 65535); }
  const big = n > 65535, F = big ? new Uint32Array(m.F) : new Uint16Array(m.F);
  return { n, m: m.F.length / 3, bb: b.map((v) => +v.toFixed(4)), pos: toB64(new Uint8Array(q.buffer)), idx: toB64(new Uint8Array(F.buffer)), i32: big };
}
export function decodeMesh(e) {
  const qb = fromB64(e.pos), q = new Uint16Array(qb.buffer, qb.byteOffset, qb.byteLength / 2);
  const ib = fromB64(e.idx), F = e.i32 ? new Uint32Array(ib.buffer.slice(ib.byteOffset, ib.byteOffset + ib.byteLength)) : new Uint32Array(new Uint16Array(ib.buffer, ib.byteOffset, ib.byteLength / 2));
  if (q.length !== e.n * 3 || F.length !== e.m * 3) throw new Error('3D kalıp kaydı bozuk');
  const V = new Float32Array(e.n * 3);
  for (let i = 0; i < V.length; i++) { const j = i % 3; V[i] = e.bb[j] + (q[i] / 65535) * (e.bb[3 + j] - e.bb[j]); }
  for (let i = 0; i < F.length; i++) if (F[i] >= e.n) throw new Error('3D kalıp kaydı bozuk');
  return { V, F };
}
// proje kaydındaki alanın güvenli biçimi (bozuksa null)
export function sanitizeStored(o) {
  if (!o || typeof o !== 'object') return null;
  const n = Math.round(+o.n), m = Math.round(+o.m);
  if (!(n >= 3 && n <= 400000 && m >= 4 && m <= 200000)) return null;
  if (typeof o.pos !== 'string' || typeof o.idx !== 'string' || !B64.test(o.pos) || !B64.test(o.idx)) return null;
  const i32 = !!o.i32;
  if (Math.floor((o.pos.length * 3) / 4) - (o.pos.endsWith('==') ? 2 : o.pos.endsWith('=') ? 1 : 0) !== n * 6) return null;
  if (Math.floor((o.idx.length * 3) / 4) - (o.idx.endsWith('==') ? 2 : o.idx.endsWith('=') ? 1 : 0) !== m * 3 * (i32 ? 4 : 2)) return null;
  if (!Array.isArray(o.bb) || o.bb.length !== 6 || !o.bb.every((v) => Number.isFinite(+v) && Math.abs(+v) < 1e6)) return null;
  return {
    n, m, i32, pos: o.pos, idx: o.idx, bb: o.bb.map(Number),
    name: String(o.name || '').replace(/[<>]/g, '').slice(0, 80), unit: UNITS[o.unit] ? o.unit : 'mm',
    inTris: Math.max(0, Math.round(+o.inTris) || 0), outer: o.outer === -1 ? -1 : 1,
    open: Math.max(0, Math.round(+o.open) || 0),
  };
}

/* ---------- görünüşler ---------- */
// Görünüş: kameranın baktığı yön (f) ve ekranın yukarısı (u), kalıp koordinatında. Sağ = f × u.
export function viewDirs(id, outer = 1) {
  if (id === 'yan') return { f: [0, -outer, 0], u: [0, 0, 1] };
  if (id === 'ic') return { f: [0, outer, 0], u: [0, 0, 1] };
  if (id === 'alt') return { f: [0, 0, 1], u: [0, outer, 0] };
  return { f: [0, 0, -1], u: [0, outer, 0] };   // ust
}
function vertexNormals(m) {
  const N = new Float32Array(m.V.length);
  for (let i = 0; i < m.F.length; i += 3) {
    const [a, b, c] = tri(m, i), n = cross(sub(b, a), sub(c, a));
    for (let k = 0; k < 3; k++) { const o = 3 * m.F[i + k]; N[o] += n[0]; N[o + 1] += n[1]; N[o + 2] += n[2]; }
  }
  for (let i = 0; i < N.length; i += 3) { const l = Math.hypot(N[i], N[i + 1], N[i + 2]) || 1; N[i] /= l; N[i + 1] /= l; N[i + 2] /= l; }
  return N;
}
// Dik izdüşüm: k piksel / mm. Dönen: rgba (gölgeli kalıp resmi), mask (kapladığı pikseller), w, h, x0, y0 (ekran mm başlangıcı).
// fit: { w, h } verilirse model bu kutuya sığdırılır (önizleme).
export function render(m, { f, u }, { k = 4, margin = 4, fit = null, normals = null, bg = [246, 245, 240], color = [214, 196, 142] } = {}) {
  const F = norm(f), U = norm(u), R = cross(F, U);
  const n = m.V.length / 3, S = new Float32Array(n * 3);
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let i = 0; i < n; i++) {
    const p = [m.V[3 * i], m.V[3 * i + 1], m.V[3 * i + 2]], sx = dot(p, R), sy = -dot(p, U);
    S[3 * i] = sx; S[3 * i + 1] = sy; S[3 * i + 2] = dot(p, F);
    if (sx < x0) x0 = sx; if (sx > x1) x1 = sx; if (sy < y0) y0 = sy; if (sy > y1) y1 = sy;
  }
  let W, H;
  if (fit) { k = Math.min((fit.w - 2 * margin) / (x1 - x0 || 1), (fit.h - 2 * margin) / (y1 - y0 || 1)); W = fit.w; H = fit.h; x0 -= (W / k - (x1 - x0)) / 2; y0 -= (H / k - (y1 - y0)) / 2; }
  else { x0 -= margin; y0 -= margin; x1 += margin; y1 += margin; W = Math.ceil((x1 - x0) * k); H = Math.ceil((y1 - y0) * k); }
  if (W * H > 16e6) throw new Error('görüntü çok büyük');
  const Nn = normals || vertexNormals(m);
  const zb = new Float32Array(W * H).fill(Infinity), mask = new Uint8Array(W * H), rgba = new Uint8ClampedArray(W * H * 4);
  for (let i = 0; i < W * H; i++) { rgba[4 * i] = bg[0]; rgba[4 * i + 1] = bg[1]; rgba[4 * i + 2] = bg[2]; rgba[4 * i + 3] = 255; }
  const L = norm([-F[0] + 0.45 * U[0] - 0.35 * R[0], -F[1] + 0.45 * U[1] - 0.35 * R[1], -F[2] + 0.45 * U[2] - 0.35 * R[2]]);
  const px = (i) => (S[3 * i] - x0) * k, py = (i) => (S[3 * i + 1] - y0) * k;
  for (let t = 0; t < m.F.length; t += 3) {
    const a = m.F[t], b = m.F[t + 1], c = m.F[t + 2];
    const ax = px(a), ay = py(a), bx = px(b), by = py(b), cx = px(c), cy = py(c);
    const area = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
    if (!area) continue;
    const minX = Math.max(0, Math.floor(Math.min(ax, bx, cx))), maxX = Math.min(W - 1, Math.ceil(Math.max(ax, bx, cx)));
    const minY = Math.max(0, Math.floor(Math.min(ay, by, cy))), maxY = Math.min(H - 1, Math.ceil(Math.max(ay, by, cy)));
    for (let y = minY; y <= maxY; y++) {
      const sy = y + 0.5;
      for (let x = minX; x <= maxX; x++) {
        const sx = x + 0.5;
        let w0 = ((bx - sx) * (cy - sy) - (by - sy) * (cx - sx)) / area, w1 = ((cx - sx) * (ay - sy) - (cy - sy) * (ax - sx)) / area;
        const w2 = 1 - w0 - w1;
        if (w0 < -1e-9 || w1 < -1e-9 || w2 < -1e-9) continue;
        const i = y * W + x, z = w0 * S[3 * a + 2] + w1 * S[3 * b + 2] + w2 * S[3 * c + 2];
        mask[i] = 1;
        if (z >= zb[i]) continue;
        zb[i] = z;
        let nx = w0 * Nn[3 * a] + w1 * Nn[3 * b] + w2 * Nn[3 * c], ny = w0 * Nn[3 * a + 1] + w1 * Nn[3 * b + 1] + w2 * Nn[3 * c + 1], nz = w0 * Nn[3 * a + 2] + w1 * Nn[3 * b + 2] + w2 * Nn[3 * c + 2];
        if (nx * F[0] + ny * F[1] + nz * F[2] > 0) { nx = -nx; ny = -ny; nz = -nz; }   // iki yüzlü
        const l = Math.hypot(nx, ny, nz) || 1, di = Math.max(0, (nx * L[0] + ny * L[1] + nz * L[2]) / l), sh = 0.32 + 0.68 * di;
        rgba[4 * i] = color[0] * sh; rgba[4 * i + 1] = color[1] * sh; rgba[4 * i + 2] = color[2] * sh;
      }
    }
  }
  return { rgba, mask, w: W, h: H, k, x0, y0 };
}
// En büyük parça, içi doldurulmuş (açık yüzeyli modelde delik kalmasın)
function solidMask(mask, w, h) {
  const out = new Uint8Array(w * h), st = [];
  for (let x = 0; x < w; x++) for (const y of [0, h - 1]) if (!mask[y * w + x] && !out[y * w + x]) { out[y * w + x] = 2; st.push(y * w + x); }
  for (let y = 0; y < h; y++) for (const x of [0, w - 1]) if (!mask[y * w + x] && !out[y * w + x]) { out[y * w + x] = 2; st.push(y * w + x); }
  while (st.length) {
    const q = st.pop(), x = q % w, y = (q / w) | 0;
    for (const nb of [x > 0 ? q - 1 : -1, x < w - 1 ? q + 1 : -1, y > 0 ? q - w : -1, y < h - 1 ? q + w : -1]) if (nb >= 0 && !mask[nb] && !out[nb]) { out[nb] = 2; st.push(nb); }
  }
  const fill = new Uint8Array(w * h);
  for (let i = 0; i < fill.length; i++) fill[i] = out[i] === 2 ? 0 : 1;
  // en büyük bileşen
  const lab = new Int32Array(w * h).fill(-1);
  let best = -1, bn = 0;
  for (let s = 0; s < fill.length; s++) {
    if (!fill[s] || lab[s] >= 0) continue;
    let n = 0; st.push(s); lab[s] = s;
    while (st.length) {
      const q = st.pop(), x = q % w, y = (q / w) | 0; n++;
      for (const nb of [x > 0 ? q - 1 : -1, x < w - 1 ? q + 1 : -1, y > 0 ? q - w : -1, y < h - 1 ? q + w : -1]) if (nb >= 0 && fill[nb] && lab[nb] < 0) { lab[nb] = s; st.push(nb); }
    }
    if (n > bn) { bn = n; best = s; }
  }
  for (let i = 0; i < fill.length; i++) fill[i] = lab[i] === best ? 1 : 0;
  return fill;
}
// kapalı çizgiyi d kadar dışa kaydır (köşe normali: iki komşu kenar normalinin ortalaması)
function outward(P, d) {
  let A = 0;
  for (let i = 0; i < P.length; i++) { const a = P[i], b = P[(i + 1) % P.length]; A += a[0] * b[1] - b[0] * a[1]; }
  const sg = A > 0 ? 1 : -1, n = P.length;
  return P.map((p, i) => {
    const a = P[(i - 1 + n) % n], b = P[(i + 1) % n], e1 = [p[0] - a[0], p[1] - a[1]], e2 = [b[0] - p[0], b[1] - p[1]];
    const l1 = Math.hypot(...e1) || 1, l2 = Math.hypot(...e2) || 1, nx = e1[1] / l1 + e2[1] / l2, ny = -e1[0] / l1 - e2[0] / l2, l = Math.hypot(nx, ny) || 1;
    return [p[0] + (sg * d * nx) / l, p[1] + (sg * d * ny) / l];
  });
}
// Bir görünüşün ölçülü çizgisi + resmi (analyzeRectified ile aynı biçim: outline mm, imgAt, length, height)
export function viewFromMesh(m, id, outer = 1, { k = 5 } = {}) {
  const b = box(m), ext = Math.max(b[3] - b[0], b[4] - b[1], b[5] - b[2]);
  k = Math.min(k, 3000 / (ext + 8));   // yanlış birimde (ör. metre) görüntü büyümesin
  const r = render(m, viewDirs(id, outer), { k, margin: 4 });
  const sm = solidMask(r.mask, r.w, r.h), px = traceBoundary(sm, r.w, r.h);
  if (px.length < 20) throw new Error('görünüş çıkarılamadı');
  let mm = px.map(([x, y]) => [(x + 0.5) / k, (y + 0.5) / k]);
  mm = outward(simplifyLoop(smoothLoop(mm, 0.25, 0.3), 0.06), 0.5 / k);   // izlenen çizgi piksel ortasından geçer: yarım piksel dışa
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of mm) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  return { rec: { rgba: r.rgba, w: r.w, h: r.h, k }, outline: G.makePath(mm.map(([x, y]) => [x - x0, y - y0]), true), imgAt: [-x0, -y0], length: x1 - x0, height: y1 - y0 };
}
export function allViews(m, outer = 1, opt) { return Object.fromEntries(['yan', 'ic', 'alt', 'ust'].map((id) => [id, viewFromMesh(m, id, outer, opt)])); }

/* ---------- numaraya göre boy denetimi ---------- */
// EU (Fransız / Paris noktası): numara = kalıp boyu / (2/3 cm). UK yetişkin: numara = 3 × kalıp boyu (inç) − 25.
// US erkek ≈ UK + 1 (kadın ≈ erkek + 1,5) — resmî bir standart değil, yaygın kabul. Mondopoint ayak boyudur (mm):
// kalıp ayaktan tipik olarak 13–17 mm uzundur. Burun biçimi (sivri / uzun burun) kalıbı numaradan uzun yapabilir.
export function expectedLength(size, system) {
  const s = parseFloat(String(size ?? '').replace(',', '.').replace('½', '.5'));
  if (!(s > 0)) return null;
  if (system === 'EU') return { mm: (s * 20) / 3, how: 'EU numara × 6,667 mm (Paris noktası)' };
  if (system === 'UK') return { mm: ((s + 25) / 3) * 25.4, how: 'UK: (numara + 25) ÷ 3 inç' };
  if (system === 'US') return { mm: ((s - 1 + 25) / 3) * 25.4, how: 'US erkek ≈ UK + 1 kabulüyle (kadın numarasıysa ≈ 13 mm daha kısa beklenir)' };
  if (/^Mondo/.test(system)) return { mm: s + 15, lo: s + 13, hi: s + 17, how: 'Mondopoint ayak boyu + tipik 13–17 mm burun payı' };
  return null;
}
export function sizeCheck(lengthMm, size, system, unit = 'mm') {
  const e = expectedLength(size, system);
  if (!e || !(lengthMm > 0)) return null;
  const lo = e.lo ?? e.mm, hi = e.hi ?? e.mm, gap = (L) => (L < lo ? L - lo : L > hi ? L - hi : 0), ad = Math.abs(gap(lengthMm));
  let level = 'ok', msg = 'numarayla uyumlu';
  if (ad > 25) {
    level = 'hata'; msg = 'numarayla uyuşmuyor: birim ya da numara yanlış olabilir';
    const raw = lengthMm / (UNITS[unit] || 1), alt = Object.keys(UNITS).find((v) => v !== unit && Math.abs(gap(raw * UNITS[v])) <= 10);
    if (alt) msg += ` (dosyanın birimi ${UNIT_NAMES[alt]} seçilirse uyar)`;
  } else if (ad > 10) { level = 'uyari'; msg = 'numaradan belirgin farklı: burun biçimi bu kadar fark yaratabilir, numarayı ve birimi kontrol et'; }
  return { level, msg, expected: e.mm, diff: lengthMm - e.mm, how: e.how };
}
