// Kroki kısıtları ve çözücü. Saf hesap modülü; ölçüler mm, açılar derece.
//
// Kısıt biçimleri (pts: şeklin köşeleri, kenar e = köşe e → köşe e+1, kapalı şekilde son kenar ilk köşeye döner):
//   kenar   : { t:'h'|'v', e }  { t:'len', e, L }  { t:'par'|'perp'|'eq'|'col', e, f }  { t:'ang', e, f, A }
//   köşe    : { t:'fix', i }  { t:'ox'|'oy', i, L } (orijinden X / Y konumu, işaretli)
//   köşe-köşe: { t:'hal'|'val', i, j } (yatay / dikey hizalı)  { t:'dist'|'dx'|'dy', i, j, L }
//   köşe-kenar: { t:'on', i, e } (kenarın doğrusu üzerinde)  { t:'mid', i, e } (kenarın orta noktası)
//   simetri : { t:'sym', i, j, e } (i ve j, e kenarının doğrusuna göre simetrik)
//
// Çözücü: kısıt artıklarının (residual) sıfırlanması, en küçük hareketle — her adımda
//   Δx = Jᵀ (J Jᵀ + λI)⁻¹ (−r)   (sönümlü Gauss-Newton / Levenberg-Marquardt, en küçük normlu adım).
// Böylece az kısıtlı şekillerde köşeler gereğinden fazla kaymaz (SolveSpace'in en küçük kareler yaklaşımıyla aynı fikir).
// Jacobian sayısal (merkezî fark), yalnızca kısıtlara giren koordinatlar için hesaplanır.

const D2R = Math.PI / 180;

export const CONS_EQ = { h: 1, v: 1, len: 1, fix: 2, par: 1, perp: 1, eq: 1, ang: 1, col: 2, ox: 1, oy: 1, hal: 1, val: 1, dist: 1, dx: 1, dy: 1, on: 1, mid: 2, sym: 2 };
export const CONS_LABEL = {
  h: 'Yatay', v: 'Dikey', len: 'Uzunluk', fix: 'Sabit', par: 'Paralel', perp: 'Dik', eq: 'Eşit', ang: 'Açı', col: 'Doğrusal',
  ox: 'Orijinden X', oy: 'Orijinden Y', hal: 'Yatay hizalı', val: 'Dikey hizalı', dist: 'Mesafe', dx: 'Yatay mesafe', dy: 'Dikey mesafe',
  on: 'Çizgi üzerinde', mid: 'Orta nokta', sym: 'Simetrik',
};
const EDGE1 = new Set(['h', 'v', 'len']), EDGE2 = new Set(['par', 'perp', 'eq', 'ang', 'col']);
const VTX1 = new Set(['fix', 'ox', 'oy']), VTX2 = new Set(['hal', 'val', 'dist', 'dx', 'dy']), VE = new Set(['on', 'mid']);

const isI = (k, n) => Number.isInteger(k) && k >= 0 && k < n;
// kısıt bu şekil için geçerli mi (n köşe, kapalı / açık)
export function consValid(c, n, closed = true) {
  if (!c || !CONS_EQ[c.t]) return false;
  const okE = (e) => Number.isInteger(e) && e >= 0 && (closed ? e < n : e + 1 < n);
  const num = (v) => typeof v === 'number' && isFinite(v);
  if (EDGE1.has(c.t)) return okE(c.e) && (c.t !== 'len' || (num(c.L) && c.L > 0));
  if (EDGE2.has(c.t)) return okE(c.e) && okE(c.f) && c.e !== c.f && (c.t !== 'ang' || (num(c.A) && c.A > 0 && c.A < 180));
  if (VTX1.has(c.t)) return isI(c.i, n) && (c.t === 'fix' || num(c.L));
  if (VTX2.has(c.t)) return isI(c.i, n) && isI(c.j, n) && c.i !== c.j && (!['dist', 'dx', 'dy'].includes(c.t) || (num(c.L) && c.L >= 0));
  if (VE.has(c.t)) return isI(c.i, n) && okE(c.e) && c.i !== c.e && c.i !== (c.e + 1) % n;
  if (c.t === 'sym') return isI(c.i, n) && isI(c.j, n) && c.i !== c.j && okE(c.e);
  return false;
}

// kısıtın dokunduğu köşeler
export function consVerts(c, n) {
  const E = (e) => [e, (e + 1) % n];
  if (EDGE1.has(c.t)) return E(c.e);
  if (EDGE2.has(c.t)) return [...E(c.e), ...E(c.f)];
  if (VTX1.has(c.t)) return [c.i];
  if (VTX2.has(c.t)) return [c.i, c.j];
  if (VE.has(c.t)) return [c.i, ...E(c.e)];
  if (c.t === 'sym') return [c.i, c.j, ...E(c.e)];
  return [];
}

const wrapPi = (a) => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };
const cross = (a, b) => a[0] * b[1] - a[1] * b[0];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1];

// Kısıt artıkları (mm cinsinden; 0 = sağlanıyor)
export function consResid(pts, c) {
  const n = pts.length;
  const P = (i) => pts[i];
  const ed = (e) => { const a = P(e), b = P((e + 1) % n); return [b[0] - a[0], b[1] - a[1]]; };
  const len = (d) => Math.hypot(d[0], d[1]);
  const sub = (p, q) => [p[0] - q[0], p[1] - q[1]];
  switch (c.t) {
    case 'h': return [ed(c.e)[1]];
    case 'v': return [ed(c.e)[0]];
    case 'len': return [len(ed(c.e)) - c.L];
    case 'eq': return [len(ed(c.e)) - len(ed(c.f))];
    case 'par': case 'perp': {
      const a = ed(c.e), b = ed(c.f), la = len(a), lb = len(b);
      if (la < 1e-12 || lb < 1e-12) return [0];
      const v = c.t === 'par' ? cross(a, b) : dot(a, b);
      return [v / (la * lb) * Math.min(la, lb)];
    }
    case 'ang': {
      // iki doğrultu arasındaki açı A ya da 180 − A (hangisi yakınsa)
      const a = ed(c.e), b = ed(c.f), la = len(a), lb = len(b);
      if (la < 1e-12 || lb < 1e-12) return [0];
      const phi = Math.abs(wrapPi(Math.atan2(cross(a, b), dot(a, b)))), want = c.A * D2R;
      const s1 = phi - want, s2 = (Math.PI - phi) - want;
      return [(Math.abs(s1) <= Math.abs(s2) ? s1 : s2) * Math.min(la, lb)];
    }
    case 'col': {
      const a = ed(c.e), la = len(a);
      if (la < 1e-12) return [0, 0];
      const o = P(c.e);
      return [cross(a, sub(P(c.f), o)) / la, cross(a, sub(P((c.f + 1) % n), o)) / la];
    }
    case 'fix': return [];
    case 'ox': return [P(c.i)[0] - c.L];
    case 'oy': return [P(c.i)[1] - c.L];
    case 'hal': return [P(c.j)[1] - P(c.i)[1]];
    case 'val': return [P(c.j)[0] - P(c.i)[0]];
    case 'dist': return [len(sub(P(c.j), P(c.i))) - c.L];
    case 'dx': return [Math.abs(P(c.j)[0] - P(c.i)[0]) - c.L];
    case 'dy': return [Math.abs(P(c.j)[1] - P(c.i)[1]) - c.L];
    case 'on': { const a = ed(c.e), la = len(a); return la < 1e-12 ? [0] : [cross(a, sub(P(c.i), P(c.e))) / la]; }
    case 'mid': { const a = P(c.e), b = P((c.e + 1) % n), p = P(c.i); return [p[0] - (a[0] + b[0]) / 2, p[1] - (a[1] + b[1]) / 2]; }
    case 'sym': {
      const a = ed(c.e), la = len(a);
      if (la < 1e-12) return [0, 0];
      const pi = P(c.i), pj = P(c.j), m = [(pi[0] + pj[0]) / 2, (pi[1] + pj[1]) / 2];
      return [cross(a, sub(m, P(c.e))) / la, dot(a, sub(pj, pi)) / la];
    }
    default: return [];
  }
}

// En büyük artık (0 = sağlanıyor). Geçersiz kısıt 0 sayılır.
export function consError(pts, c, closed = true) {
  if (!consValid(c, pts.length, closed)) return 0;
  return consResid(pts, c).reduce((m, v) => Math.max(m, Math.abs(v)), 0);
}

// (A + λI) y = b, A simetrik; Gauss eleme (kısmi pivot)
function solveSym(A, b) {
  const m = b.length, M = A.map((r, i) => [...r, b[i]]);
  for (let k = 0; k < m; k++) {
    let p = k; for (let i = k + 1; i < m; i++) if (Math.abs(M[i][k]) > Math.abs(M[p][k])) p = i;
    if (Math.abs(M[p][k]) < 1e-300) return null;
    [M[k], M[p]] = [M[p], M[k]];
    for (let i = k + 1; i < m; i++) { const f = M[i][k] / M[k][k]; if (f) for (let j = k; j <= m; j++) M[i][j] -= f * M[k][j]; }
  }
  const y = new Array(m).fill(0);
  for (let i = m - 1; i >= 0; i--) { let s = M[i][m]; for (let j = i + 1; j < m; j++) s -= M[i][j] * y[j]; y[i] = s / M[i][i]; }
  return y;
}

// Çözücü. pinned: sürüklenen / sabit tutulacak köşeler. Dönüş: { pts, ok, err, iter }
export function solveCons(pts0, cons, pinned = [], iters = 100, tol = 1e-7, closed = true) {
  const pts = pts0.map((q) => [q[0], q[1]]);
  const n = pts.length;
  const valid = (cons || []).filter((c) => consValid(c, n, closed));
  if (!valid.length || n < 2) return { pts, ok: true, err: 0, iter: 0 };
  const fixed = new Set(pinned.filter((i) => isI(i, n)));
  for (const c of valid) if (c.t === 'fix') fixed.add(c.i);
  const eqs = valid.filter((c) => c.t !== 'fix');
  // değişkenler: kısıtlara giren serbest köşelerin u, v'si
  const used = new Set(); for (const c of eqs) for (const i of consVerts(c, n)) if (!fixed.has(i)) used.add(i);
  const vars = []; for (const i of [...used].sort((a, b) => a - b)) vars.push([i, 0], [i, 1]);
  const R = () => eqs.flatMap((c) => consResid(pts, c));
  const nrm = (r) => r.reduce((s, v) => s + v * v, 0);
  let r = R(), e2 = nrm(r), lam = 1e-9, it = 0;
  const maxAbs = (v) => v.reduce((m, x) => Math.max(m, Math.abs(x)), 0);
  for (; it < iters && maxAbs(r) > tol && vars.length; it++) {
    // Jacobian (m × k), merkezî fark
    const m = r.length, k = vars.length, J = Array.from({ length: m }, () => new Array(k).fill(0));
    for (let q = 0; q < k; q++) {
      const [i, a] = vars[q], x0 = pts[i][a], h = 1e-6 * Math.max(1, Math.abs(x0));
      pts[i][a] = x0 + h; const rp = R(); pts[i][a] = x0 - h; const rm = R(); pts[i][a] = x0;
      for (let p = 0; p < m; p++) J[p][q] = (rp[p] - rm[p]) / (2 * h);
    }
    const JJ = Array.from({ length: m }, (_, a) => Array.from({ length: m }, (_, b) => { let s = 0; for (let q = 0; q < k; q++) s += J[a][q] * J[b][q]; return s; }));
    const tr = JJ.reduce((s, row, a) => s + row[a], 0) / m || 1;
    let accepted = false;
    for (let tries = 0; tries < 12; tries++) {
      const A = JJ.map((row, a) => row.map((v, b) => (a === b ? v + lam * tr : v)));
      const y = solveSym(A, r.map((v) => -v));
      if (!y) { lam *= 10; continue; }
      const dx = new Array(k).fill(0); for (let q = 0; q < k; q++) { let s = 0; for (let p = 0; p < m; p++) s += J[p][q] * y[p]; dx[q] = s; }
      const keep = vars.map(([i, a]) => pts[i][a]);
      vars.forEach(([i, a], q) => { pts[i][a] += dx[q]; });
      const r2 = R(), e22 = nrm(r2);
      if (e22 < e2 || e22 < tol * tol) { r = r2; e2 = e22; lam = Math.max(lam / 3, 1e-12); accepted = true; break; }
      vars.forEach(([i, a], q) => { pts[i][a] = keep[q]; });
      lam *= 8;
    }
    if (!accepted) break;
  }
  const err = maxAbs(r);
  return { pts, ok: err < 1e-3, err, iter: it };
}

// Serbestlik derecesi (yaklaşık): 2·köşe − kısıt denklemleri. 0 → tam tanımlı, < 0 → fazla kısıt
export function freedom(n, cons) {
  let eq = 0;
  for (const c of cons || []) eq += CONS_EQ[c.t] || 0;
  return 2 * n - eq;
}

// Köşe silinince kısıtları uyarlar. n: yeni köşe sayısı, removed: silinen köşe (null = sadece temizle)
export function fixConsAfterRemove(cons, n, removed) {
  const gone = removed !== null && removed !== undefined;
  const mapV = (i) => (!gone ? i : i === removed ? -1 : i > removed ? i - 1 : i);
  const touches = (e) => gone && (e === removed || (e + 1) % (n + 1) === removed);
  const out = [];
  for (const c of cons || []) {
    const d = { ...c };
    let bad = false;
    for (const k of ['e', 'f']) if (d[k] !== undefined) { if (touches(d[k])) bad = true; else { d[k] = mapV(d[k]); if (d[k] < 0 || d[k] >= n) bad = true; } }
    for (const k of ['i', 'j']) if (d[k] !== undefined) { d[k] = mapV(d[k]); if (d[k] < 0 || d[k] >= n) bad = true; }
    if (!bad) out.push(d);
  }
  return out;
}
