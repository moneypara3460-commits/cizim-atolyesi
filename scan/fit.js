// Ağdan düzenlenebilir CAD (Photo-to-CAD Mod C, 1. sürüm): tarama / STL ağındaki düz yüzleri ve silindirleri tanır,
// uygulamanın kendi parametrik parçalarına (kutu, silindir, boru, küre + delikler) çevirir. Bu parçalar OCCT'de gerçek
// B-Rep katı olur, ölçüleri düzenlenir, teknik resmi çıkar.
//
// Dürüstlük kuralı: şekil temel şekillere yeterince oturmazsa CAD üretilmez (ok: false) — ağ, CAD gibi gösterilmez.
// Tanınanlar: prizmatik parçalar (kutu + eksene paralel delikler, kör delikler), tornalanmış parçalar (kademeli mil, boru,
// iç kademeli delik, flanş delikleri), küre. Tanınmayanlar (açıklanamayan yüzey olarak raporlanır): pah, yuvarlama,
// eğik yüzler, serbest yüzeyler.
// Saf fonksiyonlar (tests/scan.test.mjs). Girdi: mesh-tools biçiminde ağ { V, F } (kaynaklanmış, yüzler dışa bakan).
import { measure, transform, toFloor } from './mesh-tools.js?v=20261118b';

const DEG = Math.PI / 180;
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

// Yüz normalleri, alanları, ağırlık merkezleri
function faces(m) {
  const { V, F } = m, n = F.length / 3;
  const N = new Float64Array(n * 3), A = new Float64Array(n), C = new Float64Array(n * 3);
  for (let t = 0; t < n; t++) {
    const a = F[t * 3] * 3, b = F[t * 3 + 1] * 3, c = F[t * 3 + 2] * 3;
    const ux = V[b] - V[a], uy = V[b + 1] - V[a + 1], uz = V[b + 2] - V[a + 2];
    const vx = V[c] - V[a], vy = V[c + 1] - V[a + 1], vz = V[c + 2] - V[a + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx, l = Math.hypot(nx, ny, nz) || 1e-30;
    N[t * 3] = nx / l; N[t * 3 + 1] = ny / l; N[t * 3 + 2] = nz / l; A[t] = l / 2;
    C[t * 3] = (V[a] + V[b] + V[c]) / 3; C[t * 3 + 1] = (V[a + 1] + V[b + 1] + V[c + 1]) / 3; C[t * 3 + 2] = (V[a + 2] + V[b + 2] + V[c + 2]) / 3;
  }
  return { n, N, A, C };
}

// Ana eksenler: her aday yön için "bu yöne dik düz yüzler + bu yöne paralel yüzler" alanı en büyük olan.
// Kutu ve silindirde gerçek eksenleri bulur (kaba çokgen silindirde bile yan yüzler değil, eksen seçilir).
export function principalAxes(m, fd = faces(m)) {
  const { n, N, A } = fd, cosT = Math.cos(6 * DEG), sinT = Math.sin(6 * DEG);
  const order = [...Array(n).keys()].sort((a, b) => A[b] - A[a]);
  const cands = order.slice(0, 120).map((t) => [N[t * 3], N[t * 3 + 1], N[t * 3 + 2]]);
  for (let i = 0; i < 40 && n; i++) { const t = order[Math.floor((i * 7919) % n)]; cands.push([N[t * 3], N[t * 3 + 1], N[t * 3 + 2]]); }
  cands.push([1, 0, 0], [0, 1, 0], [0, 0, 1]);
  const score = (d, sub = null) => {
    let s = 0;
    for (let t = 0; t < n; t++) {
      if (sub && !sub[t]) continue;
      const c = Math.abs(N[t * 3] * d[0] + N[t * 3 + 1] * d[1] + N[t * 3 + 2] * d[2]);
      if (c > cosT || c < sinT) s += A[t];
    }
    return s;
  };
  let d1 = [0, 1, 0], b1 = -1;
  for (const c of cands) { const s = score(c); if (s > b1 * 1.0005) { b1 = s; d1 = norm(c); } }
  // tarama gürültüsü: seçilen yönü, ona yakın bütün düz yüz normallerinin alan ağırlıklı ortalamasına çek
  const refine = (d, perpTo) => {
    for (let it = 0; it < 4; it++) {
      let sx = 0, sy = 0, sz = 0;
      for (let t = 0; t < n; t++) {
        const c = N[t * 3] * d[0] + N[t * 3 + 1] * d[1] + N[t * 3 + 2] * d[2];
        if (Math.abs(c) <= cosT) continue;
        const sg = c > 0 ? A[t] : -A[t];
        sx += N[t * 3] * sg; sy += N[t * 3 + 1] * sg; sz += N[t * 3 + 2] * sg;
      }
      if (!(sx || sy || sz)) return d;
      let r = [sx, sy, sz];
      if (perpTo) { const k = dot(r, perpTo); r = [r[0] - k * perpTo[0], r[1] - k * perpTo[1], r[2] - k * perpTo[2]]; }
      d = norm(r);
    }
    return d;
  };
  d1 = refine(d1);
  // ikinci eksen: d1'e dik düz yüzlerin normallerinden
  const perp = new Uint8Array(n);
  for (let t = 0; t < n; t++) if (Math.abs(N[t * 3] * d1[0] + N[t * 3 + 1] * d1[1] + N[t * 3 + 2] * d1[2]) < sinT) perp[t] = 1;
  let d2 = null, b2 = -1;
  for (let oi = 0; oi < order.length; oi++) {
    const t = order[oi];
    if (!perp[t]) continue;
    const nn = [N[t * 3], N[t * 3 + 1], N[t * 3 + 2]], k = dot(nn, d1);
    const c = norm([nn[0] - k * d1[0], nn[1] - k * d1[1], nn[2] - k * d1[2]]);
    let s = 0;
    for (let u = 0; u < n; u++) if (perp[u] && Math.abs(N[u * 3] * c[0] + N[u * 3 + 1] * c[1] + N[u * 3 + 2] * c[2]) > cosT) s += A[u];
    if (s > b2 * 1.0005) { b2 = s; d2 = c; }
    if (b2 > 0 && oi > 150) break;
  }
  if (!d2) { const a = Math.abs(d1[0]) < 0.9 ? [1, 0, 0] : [0, 0, 1]; d2 = norm(cross(cross(d1, a), d1)); }
  else d2 = refine(d2, d1);
  const d3 = norm(cross(d2, d1));
  // d1 bir dönel eksen mi? (d1'e paralel ama d2 / d3 düzlemlerinde olmayan, eğri yan yüz alanı)
  let curved = 0, tot = 0;
  for (let t = 0; t < n; t++) {
    tot += A[t];
    const nn = [N[t * 3], N[t * 3 + 1], N[t * 3 + 2]];
    if (Math.abs(dot(nn, d1)) < sinT && Math.abs(dot(nn, d2)) < cosT && Math.abs(dot(nn, d3)) < cosT) curved += A[t];
  }
  // dönüş yönü: girdi zaten eksenlere yakın duruyorsa gereksiz döndürme / aynalama olmasın (her eksen en yakın dünya
  // eksenine artı yönde bakar; dönel parçada ikinci eksen dünya X'inin izdüşümü)
  const canon = (d) => { const k = [0, 1, 2].reduce((b, i) => (Math.abs(d[i]) > Math.abs(d[b]) ? i : b), 0); return d[k] < 0 ? [-d[0], -d[1], -d[2]] : d; };
  if (curved > 0.2 * tot) {
    const y = canon(d1);
    let x = null;
    for (const w of [[1, 0, 0], [0, 0, 1], [0, 1, 0]]) { const k = dot(w, y); const p = [w[0] - k * y[0], w[1] - k * y[1], w[2] - k * y[2]]; if (Math.hypot(...p) > 0.3) { x = norm(p); break; } }
    return { x, y, z: norm(cross(x, y)), turned: true };
  }
  // prizmatik: parça yatık dursun — en kısa boy Y (yükseklik), en uzun X
  const ext = [d1, d2, d3].map((d) => {
    let lo = Infinity, hi = -Infinity;
    for (let i = 0; i < m.V.length; i += 3) { const s = m.V[i] * d[0] + m.V[i + 1] * d[1] + m.V[i + 2] * d[2]; if (s < lo) lo = s; if (s > hi) hi = s; }
    return { d, e: hi - lo };
  }).sort((a, b) => a.e - b.e);
  const y = canon(ext[0].d), x = canon(ext[2].d), z = norm(cross(x, y));
  return { x, y, z, turned: false };
}

// Ağı ana eksenlere çevirir (ana eksen → Y yukarı), yere oturtur
export function alignToAxes(m) {
  const ax = principalAxes(m);
  const r = transform(m, (x, y, z) => [x * ax.x[0] + y * ax.x[1] + z * ax.x[2], x * ax.y[0] + y * ax.y[1] + z * ax.y[2], x * ax.z[0] + y * ax.z[1] + z * ax.z[2]]);
  return { mesh: toFloor(r), axes: ax };
}

// Kenar komşuluğu
function adjacency(m) {
  const map = new Map(), F = m.F, nb = Array.from({ length: F.length / 3 }, () => []);
  for (let i = 0; i < F.length; i += 3) for (let k = 0; k < 3; k++) {
    const a = F[i + k], b = F[i + (k + 1) % 3], key = a < b ? a * 4294967296 + b : b * 4294967296 + a;
    const o = map.get(key);
    if (o === undefined) map.set(key, i / 3); else { nb[o].push(i / 3); nb[i / 3].push(o); }
  }
  return nb;
}

// Daire uydurma (Kåsa, cebirsel): noktalar [u, v]
export function fitCircle(pts) {
  let Suu = 0, Svv = 0, Suv = 0, Su = 0, Sv = 0, Suuu = 0, Svvv = 0, Suvv = 0, Svuu = 0;
  const n = pts.length;
  let mu = 0, mv = 0;
  for (const [u, v] of pts) { mu += u; mv += v; }
  mu /= n; mv /= n;
  for (const [u0, v0] of pts) {
    const u = u0 - mu, v = v0 - mv;
    Suu += u * u; Svv += v * v; Suv += u * v; Su += u; Sv += v;
    Suuu += u * u * u; Svvv += v * v * v; Suvv += u * v * v; Svuu += v * u * u;
  }
  const det = Suu * Svv - Suv * Suv;
  if (Math.abs(det) < 1e-12) return null;
  const bu = 0.5 * (Suuu + Suvv), bv = 0.5 * (Svvv + Svuu);
  const uc = (bu * Svv - bv * Suv) / det, vc = (bv * Suu - bu * Suv) / det;
  const R = Math.sqrt(uc * uc + vc * vc + (Suu + Svv) / n);
  let e = 0;
  for (const [u, v] of pts) { const d = Math.hypot(u - mu - uc, v - mv - vc) - R; e += d * d; }
  return { cu: uc + mu, cv: vc + mv, R, rms: Math.sqrt(e / n) };
}

const AX = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
const UV = [[1, 2], [2, 0], [0, 1]];   // eksene dik düzlemin koordinatları (x ekseni → y,z ; y → z,x ; z → x,y)

// Hizalanmış ağda yüz bölgeleri: eksene paralel silindirler ve eksene dik düz yüzler
export function analyze(m, opt = {}) {
  const fd = faces(m), { n, N, A, C } = fd, nb = adjacency(m), V = m.V, F = m.F;
  const info = measure(m), diag = Math.hypot(...info.size) || 1;
  const tolPos = opt.tolPos ?? Math.max(0.15, diag * 0.004);
  const planeCos = Math.cos((opt.planeDeg ?? 8) * DEG), latSin = Math.sin((opt.latDeg ?? 12) * DEG);
  const grow = Math.cos((opt.growDeg ?? 35) * DEG);
  // düz yüzler: eksene dik (normal ± eksen)
  const planeAx = new Int8Array(n).fill(-1);
  for (let t = 0; t < n; t++) for (let k = 0; k < 3; k++) if (Math.abs(N[t * 3 + k]) > planeCos) planeAx[t] = k;
  // büyük düz bölgeler (kutu yüzleri): aynı eksene dik, aynı düzlemde, bağlı yüzler; silindir büyütmeye katılmaz.
  // (küçük düz şeritler — kaba çokgen deliğin eksene paralel kenarları — katılır)
  const flatBig = new Uint8Array(n);
  {
    const seen = new Uint8Array(n), totA = A.reduce((s2, a) => s2 + a, 0);
    for (let s = 0; s < n; s++) {
      if (seen[s] || planeAx[s] < 0) continue;
      const k = planeAx[s], reg = [s]; seen[s] = 1; let ar = 0;
      for (let i = 0; i < reg.length; i++) {
        const t = reg[i]; ar += A[t];
        for (const u of nb[t]) if (!seen[u] && planeAx[u] === k && Math.abs(C[u * 3 + k] - C[t * 3 + k]) < tolPos) { seen[u] = 1; reg.push(u); }
      }
      if (ar > 0.004 * totA) for (const t of reg) flatBig[t] = 1;
    }
  }
  // silindir bölgeleri: her eksen için o eksene paralel (normal eksene dik) yüzlerden bölge büyütme
  const cyl = [];
  for (let k = 0; k < 3; k++) {
    const seen = new Uint8Array(n);
    for (let s = 0; s < n; s++) {
      if (seen[s] || Math.abs(N[s * 3 + k]) > latSin || flatBig[s]) continue;   // büyük düz yüzler (kutu yüzleri) silindire katılmaz
      const reg = [s]; seen[s] = 1;
      for (let i = 0; i < reg.length; i++) {
        const t = reg[i];
        for (const u of nb[t]) {
          if (seen[u] || Math.abs(N[u * 3 + k]) > latSin || flatBig[u]) continue;
          if (N[t * 3] * N[u * 3] + N[t * 3 + 1] * N[u * 3 + 1] + N[t * 3 + 2] * N[u * 3 + 2] < grow) continue;
          seen[u] = 1; reg.push(u);
        }
      }
      if (reg.length < 6) continue;
      const c = build(k, reg, true);
      if (c) cyl.push(c);
    }
  }
  // gürültüde bir silindir birkaç parçaya bölünebilir: aynı eksen, merkez, çap ve içbükeylikteki parçaları birleştir
  for (let merged = true; merged;) {
    merged = false;
    outer: for (let i = 0; i < cyl.length; i++) for (let j = i + 1; j < cyl.length; j++) {
      const a = cyl[i], b = cyl[j];
      if (a.axis !== b.axis || a.convex !== b.convex) continue;
      if (Math.hypot(a.cu - b.cu, a.cv - b.cv) > Math.max(tolPos * 3, a.R * 0.15) || Math.abs(a.R - b.R) > Math.max(tolPos * 2, a.R * 0.25)) continue;
      if (a.b < b.a - tolPos * 2 || b.b < a.a - tolPos * 2) continue;
      const c = build(a.axis, [...a.faces, ...b.faces], false);
      if (!c) continue;
      cyl.splice(j, 1); cyl[i] = c; merged = true;
      break outer;
    }
  }
  function build(k, reg, loose = false) {
    const [iu, iv] = UV[k];
    // normallerin açısal kapsamı (tam silindir ~360°)
    const ang = reg.map((t) => Math.atan2(N[t * 3 + iv], N[t * 3 + iu])).sort((a, b) => a - b);
    let gap = ang[0] + 2 * Math.PI - ang[ang.length - 1];
    for (let i = 1; i < ang.length; i++) gap = Math.max(gap, ang[i] - ang[i - 1]);
    const span = 360 - gap / DEG;
    if (span < 20) return null;   // düz yüz
    const vs = new Set(); for (const t of reg) { vs.add(F[t * 3]); vs.add(F[t * 3 + 1]); vs.add(F[t * 3 + 2]); }
    const pts = [], hs = [];
    for (const v of vs) { pts.push([V[v * 3 + iu], V[v * 3 + iv]]); hs.push(V[v * 3 + k]); }
    const c = fitCircle(pts);
    if (!c || !(c.R > 0) || c.rms > Math.max(tolPos, c.R * (loose ? 0.06 : 0.03))) return null;
    let conv = 0, area = 0;
    for (const t of reg) { const s2 = (C[t * 3 + iu] - c.cu) * N[t * 3 + iu] + (C[t * 3 + iv] - c.cv) * N[t * 3 + iv]; conv += s2 > 0 ? A[t] : -A[t]; area += A[t]; }
    let a = Infinity, b = -Infinity; for (const h of hs) { if (h < a) a = h; if (h > b) b = h; }
    return { axis: k, cu: c.cu, cv: c.cv, R: c.R, rms: c.rms, span, full: span >= 300 || (conv < 0 && span >= 220), convex: conv > 0, a, b, area, faces: reg };   // içbükey 220°+ yay: gürültüde bölünmüş delik
  }
  // birleşmeden kalan dar yaylar (yuvarlama, pah, gürültü) silindir sayılmaz
  const cylOut = cyl.filter((c) => c.span >= 90 && c.rms <= Math.max(tolPos, c.R * 0.03));
  return { fd, info, planeAx, cyl: cylOut, arcs: cyl, tolPos, diag, m };
}

const r1 = (v, s) => (s ? Math.round(v / s) * s : v);
const fmt = (v) => (Math.round(v * 100) / 100).toLocaleString('tr-TR');

// Ana işlev: hizalanmış ağdan parça listesi. Dönüş: { ok, kind, parts, quality, notes, reason }
// parts: uygulama parçası alanları (type, op, w, h, l, d, di, x, y, z, rx, rz). Ağ zaten hizalı ve yere oturmuş olmalı (alignToAxes).
function fitBasic(m, opt = {}) {
  const snap = opt.snap ?? 0.1;
  const an = analyze(m, opt), { info, planeAx, cyl, tolPos, fd } = an;
  const { n, A, C } = fd;
  // sağlam sınırlar: dış düz yüzlerin ortalama konumu (tarama gürültüsündeki uç noktalar ölçüyü büyütmesin)
  const mn = info.min.slice(), mx = info.max.slice();
  for (let k = 0; k < 3; k++) {
    let la = 0, ls = 0, ha = 0, hs = 0;
    for (let t = 0; t < n; t++) {
      if (planeAx[t] !== k) continue;
      const c = C[t * 3 + k];
      if (c - info.min[k] <= tolPos * 3) { la += A[t]; ls += A[t] * c; } else if (info.max[k] - c <= tolPos * 3) { ha += A[t]; hs += A[t] * c; }
    }
    if (la > 0) mn[k] = ls / la;
    if (ha > 0) mx[k] = hs / ha;
  }
  const S = [mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2]];
  const near = (a, b) => Math.abs(a - b) <= tolPos * 1.5;
  const notes = [];
  const total = fd.A.reduce((s, a) => s + a, 0);
  const holeParts = [], explained = new Uint8Array(n);
  let kind = null, base = [];

  // --- 0) küre (önce: ekvator şeridi silindir sanılmasın)
  let sphere = null;
  {
    const V = m.V, cx = (mn[0] + mx[0]) / 2, cy = (mn[1] + mx[1]) / 2, cz = (mn[2] + mx[2]) / 2, R = (S[0] + S[1] + S[2]) / 6;
    let e = 0; for (let i = 0; i < V.length; i += 3) { const d = Math.hypot(V[i] - cx, V[i + 1] - cy, V[i + 2] - cz) - R; e += d * d; }
    const rms = Math.sqrt(e / (V.length / 3));
    if (rms <= Math.max(tolPos, R * 0.02) && Math.max(...S) - Math.min(...S) <= R * 0.06) sphere = { R, rms };
  }

  // --- 1) tornalanmış parça: Y eksenli dış silindir, çapı taban ölçüsüne eşit, merkez eksende
  const big0 = cyl.filter((c) => c.axis === 1 && c.full && c.convex).reduce((b, c) => (!b || c.R > b.R ? c : b), null);
  const onAxis = (c) => big0 && near(c.cu, big0.cu) && near(c.cv, big0.cv);
  const outerY = cyl.filter((c) => c.axis === 1 && c.full && c.convex && onAxis(c));
  const big = big0;
  const isTurned = !sphere && big && Math.abs(2 * big.R - Math.max(S[0], S[2])) <= Math.max(tolPos * 3, S[0] * 0.03) && Math.abs(S[0] - S[2]) <= Math.max(tolPos * 3, S[0] * 0.03);
  // --- 2) prizmatik: 6 dış düzlem
  const extremePlane = (k, at) => { let a = 0; for (let t = 0; t < n; t++) if (planeAx[t] === k && Math.abs(C[t * 3 + k] - at) <= tolPos * 2) a += A[t]; return a; };
  const faceArea = (k) => S[(k + 1) % 3] * S[(k + 2) % 3];
  const boxOK = !sphere && !isTurned && [0, 1, 2].every((k) => extremePlane(k, mn[k]) >= 0.3 * faceArea(k) && extremePlane(k, mx[k]) >= 0.3 * faceArea(k));
  if (sphere) {
    kind = 'küre';
    base = [{ type: 'sphere', op: 'add', d: r1(2 * sphere.R, snap), x: r1((mn[0] + mx[0]) / 2, snap), y: r1(mn[1], snap), z: r1((mn[2] + mx[2]) / 2, snap) }];
    explained.fill(1);
  } else if (isTurned) {
    kind = 'torna';
    // eksen üzerindeki dış silindirler → kademeler (alttan üste), iç eş eksenli silindirler → iç delik kademeleri
    const segs = outerY.filter((c) => c.full).sort((a, b) => a.a - b.a);
    for (const c of segs) {
      base.push({ type: 'cylinder', op: 'add', d: r1(2 * c.R, snap), h: r1(c.b - c.a, snap), x: r1(big.cv, snap), y: r1(c.a, snap), z: r1(big.cu, snap) });
      for (const t of c.faces) explained[t] = 1;
    }
    const bores = cyl.filter((c) => c.axis === 1 && c.full && !c.convex && onAxis(c)).sort((a, b) => a.a - b.a);
    for (const c of bores) {
      const atLo = near(c.a, mn[1]), atHi = near(c.b, mx[1]), thru = atLo && atHi;
      if (!atLo && !atHi) { notes.push('İçeride kalan eksenel boşluk (Ø' + fmt(2 * c.R) + ') eklenmedi'); continue; }
      const y0 = atLo ? mn[1] - 1 : c.a, y1 = atHi ? mx[1] + 1 : c.b;
      holeParts.push({ type: 'cylinder', op: 'sub', d: r1(2 * c.R, snap), h: r1(y1 - y0, snap), x: r1(big.cv, snap), y: r1(y0, snap), z: r1(big.cu, snap), _hole: { axis: 1, R: c.R, len: c.b - c.a, thru } });
      for (const t of c.faces) explained[t] = 1;
    }
    // tek kademe ve tek tam boy iç delik → boru
    if (base.length === 1 && holeParts.length === 1 && holeParts[0]._hole.thru && Math.abs(base[0].h - S[1]) <= tolPos * 2) {
      const b = base[0], h = holeParts.pop();
      base = [{ type: 'tube', op: 'add', d: b.d, di: h.d, h: b.h, x: b.x, y: b.y, z: b.z }];
      kind = 'boru';
    }
  } else if (boxOK) {
    kind = 'prizmatik';
    base = [{ type: 'box', op: 'add', w: r1(S[0], snap), h: r1(S[1], snap), l: r1(S[2], snap), x: r1((mn[0] + mx[0]) / 2, snap), y: r1(mn[1], snap), z: r1((mn[2] + mx[2]) / 2, snap) }];
    // bütün kenarlarda eşit yuvarlama ya da pah (uygulamadaki kutunun r / c ölçüsü)
    const ef = boxEdges(an, mn, mx);
    if (ef) {
      if (ef.r) base[0].r = r1(ef.r, snap); else base[0].c = r1(ef.c, snap);
      for (const t of ef.faces) explained[t] = 1;
      kind = 'prizmatik';
    }
  } else {
    return { ok: false, kind: null, parts: [], notes, reason: 'Şekil kutu, silindir, boru ya da küreye oturmadı (eğik yüz, serbest yüzey ya da çok gürültülü tarama). Ağ olarak eklenebilir.', quality: null, analysis: summary(an) };
  }

  // düz yüzler (eksene dik) prizmatik ve tornada açıklanmış sayılır (dış yüzler, kademe omuzları, kör delik tabanları)
  if (kind !== 'küre') for (let t = 0; t < n; t++) if (planeAx[t] >= 0) explained[t] = 1;

  // --- delikler: eksene paralel, tam (≥300°), içbükey silindirler (tornada eksendeki iç delik zaten alındı)
  const lo = (k) => mn[k], hi = (k) => mx[k];
  for (const c of cyl) {
    if (!c.full || c.convex) continue;
    if (kind !== 'prizmatik' && c.axis === 1 && onAxis(c)) continue;
    if (kind === 'küre') continue;
    const k = c.axis, [iu, iv] = UV[k];
    const atLo = near(c.a, lo(k)), atHi = near(c.b, hi(k)), thru = atLo && atHi;
    if (!atLo && !atHi) { notes.push('İçeride kalan silindirik boşluk (Ø' + fmt(2 * c.R) + ') tanındı ama dışa açılmadığı için eklenmedi'); continue; }
    const len = thru ? S[k] + 2 : (atHi ? hi(k) - c.a : c.b - lo(k)) + 1;
    const p = { type: 'cylinder', op: 'sub', d: r1(2 * c.R, snap), h: r1(len, snap), x: 0, y: 0, z: 0, rx: 0, rz: 0, _hole: { axis: k, R: c.R, len: c.b - c.a, thru, side: thru ? 0 : atHi ? 1 : -1 } };
    const cen = [0, 0, 0]; cen[iu] = c.cu; cen[iv] = c.cv;
    // parça tabanı ekseni başlangıcıdır; Y'ye göre: y yukarı. X ekseni: rz=+90 → +Y, -X yönüne döner; rz=-90 → +X. Z: rx=+90 → +Z; rx=-90 → -Z.
    if (k === 1) { p.x = cen[0]; p.z = cen[2]; p.y = atLo ? lo(1) - 1 : hi(1) + 1 - len; }
    else if (k === 0) { p.y = cen[1]; p.z = cen[2]; if (atHi) { p.rz = 90; p.x = hi(0) + 1; } else { p.rz = -90; p.x = lo(0) - 1; } }
    else { p.x = cen[0]; p.y = cen[1]; if (atLo) { p.rx = 90; p.z = lo(2) - 1; } else { p.rx = -90; p.z = hi(2) + 1; } }
    p.x = r1(p.x, snap); p.y = r1(p.y, snap); p.z = r1(p.z, snap);
    holeParts.push(p);
    for (const t of c.faces) explained[t] = 1;
  }

  // --- doğrulama: açıklanan yüzey ve hacim
  let ex = 0; for (let t = 0; t < n; t++) if (explained[t]) ex += A[t];
  const coverage = total ? ex / total : 0;
  let fitVol = 0;
  for (const p of base) fitVol += volOf(p);
  if (base[0] && base[0].type === 'box' && (base[0].r || base[0].c)) fitVol = boxEdgeVol(base[0]);
  for (const p of holeParts) fitVol -= Math.PI * p._hole.R * p._hole.R * Math.min(p._hole.len, S[p._hole.axis]);
  const volErr = info.closed && info.volume > 0 ? Math.abs(fitVol - info.volume) / info.volume : null;
  const quality = { coverage, volErr, unexplained: 1 - coverage, faces: n };
  const minCov = opt.minCoverage ?? 0.85;
  if (coverage < minCov || (volErr != null && volErr > (opt.maxVolErr ?? 0.08))) {
    return { ok: false, kind, parts: [], notes, quality, analysis: summary(an), reason: 'Şekil ' + kind + ' parçaya benziyor ama yüzeyin %' + Math.round((1 - coverage) * 100) + "'i açıklanamadı" + (volErr != null ? ', hacim farkı %' + Math.round(volErr * 100) : '') + ' (pah, yuvarlama, eğik ya da serbest yüzey). Yanlış CAD üretmemek için ağ olarak eklenmesi önerilir.' };
  }
  if (coverage < 0.97) notes.push('Yüzeyin %' + Math.round((1 - coverage) * 100) + "'si temel şekillerle açıklanamadı (pah, yuvarlama ya da tarama gürültüsü). Bu ayrıntılar CAD'e alınmadı; gerekirse Kenar sekmesinden eklenir.");
  const parts = [...base, ...holeParts.map(({ _hole, ...p }) => p)];
  return { ok: true, kind, parts, quality, notes, holes: holeParts.length, analysis: summary(an) };
}

function volOf(p) {
  if (p.type === 'box') return p.w * p.h * p.l;
  if (p.type === 'cylinder') return Math.PI * p.d * p.d / 4 * p.h;
  if (p.type === 'tube') return Math.PI * (p.d * p.d - p.di * p.di) / 4 * p.h;
  if (p.type === 'sphere') return Math.PI * p.d ** 3 / 6;
  return 0;
}

function summary(an) {
  return { size: an.info.size, closed: an.info.closed, cylinders: an.cyl.map((c) => ({ axis: 'XYZ'[c.axis], d: 2 * c.R, full: c.full, convex: c.convex, len: c.b - c.a })) };
}

// Okunur özet: "Kutu 80 × 60 × 40 mm · 3 delik (Ø10 ×2, Ø6)"
export function describe(r) {
  if (!r.ok) return r.reason;
  const b = r.parts.filter((p) => p.op !== 'sub'), h = r.parts.filter((p) => p.op === 'sub');
  const dia = (p) => p.type === 'cone' ? 'Ø' + fmt(p.d) + '→Ø' + fmt(p.d2) + '×' + fmt(p.h) : 'Ø' + fmt(p.d) + '×' + fmt(p.h);
  const edge = (p) => (p.r ? ', kenarlar R' + fmt(p.r) : p.c ? ', kenarlar ' + fmt(p.c) + ' mm pah' : '');
  let head;
  if (r.kind === 'prizmatik') head = 'Kutu ' + fmt(b[0].w) + ' × ' + fmt(b[0].l) + ' × ' + fmt(b[0].h) + ' mm' + edge(b[0]);
  else if (r.kind === 'boru') head = 'Boru Ø' + fmt(b[0].d) + ' / Ø' + fmt(b[0].di) + ' × ' + fmt(b[0].h) + ' mm';
  else if (r.kind === 'küre') head = 'Küre Ø' + fmt(b[0].d) + ' mm';
  else if (r.kind === 'kroki') { const s = b[0], bb = s.pts.reduce((a, [u, v]) => [Math.min(a[0], u), Math.max(a[1], u), Math.min(a[2], v), Math.max(a[3], v)], [Infinity, -Infinity, Infinity, -Infinity]); head = 'Kesit krokisi (' + s.pts.length + ' köşe) ' + fmt(bb[1] - bb[0]) + ' × ' + fmt(bb[3] - bb[2]) + ' mm, kalınlık ' + fmt(s.h) + ' mm'; }
  else if (r.kind === 'kroki-döndürme') { const s = b[0], R = Math.max(...s.pts.map((p) => p[0])), H = Math.max(...s.pts.map((p) => p[1])); head = 'Döndürme krokisi Ø' + fmt(2 * R) + ' × ' + fmt(H) + ' mm (' + s.pts.length + ' nokta)'; }
  else head = 'Torna parçası: ' + b.map(dia).join(' + ') + ' mm';
  const inner = r.kind === 'torna' ? h.filter((p) => p.type === 'cone' || (!p.rx && !p.rz && Math.abs(p.x - b[0].x) < 1e-6 && Math.abs(p.z - b[0].z) < 1e-6)) : [];
  const holes = h.filter((p) => !inner.includes(p));
  let tail = inner.length ? ' · iç: ' + inner.map(dia).join(' + ') : '';
  if (holes.length) { const g = new Map(); for (const p of holes) g.set(p.d, (g.get(p.d) || 0) + 1); tail += ' · ' + holes.length + ' delik (' + [...g].map(([d, c]) => 'Ø' + fmt(d) + (c > 1 ? ' ×' + c : '')).join(', ') + ')'; }
  return head + tail;
}

/* ======================= 2. sürüm: pah, yuvarlama, eğik yüz ======================= */

// Kutunun 12 kenarında eşit yuvarlama ya da 45° pah var mı? { r } | { c } ve bu yüzlerin listesi; yoksa null
function boxEdges(an, mn, mx) {
  const { fd, arcs, tolPos } = an, { n, N, A, C } = fd;
  const tol = Math.max(tolPos * 2, 0.3);
  // pah: iki bileşeni ±0,707 olan düz yüzler
  const ch = new Map();
  for (let t = 0; t < n; t++) {
    const nn = [N[t * 3], N[t * 3 + 1], N[t * 3 + 2]];
    const big = [0, 1, 2].filter((k) => Math.abs(nn[k]) > 0.6 && Math.abs(nn[k]) < 0.8);
    if (big.length !== 2 || Math.abs(nn[3 - big[0] - big[1]]) > 0.1) continue;
    const corner = [0, 0, 0];
    for (const k of big) corner[k] = nn[k] > 0 ? mx[k] : mn[k];
    let d = 0; for (const k of big) d += nn[k] * (corner[k] - C[t * 3 + k]);
    const key = (3 - big[0] - big[1]) + ':' + big.map((k) => Math.sign(nn[k])).join(':');
    const e = ch.get(key) || { a: 0, s: 0, faces: [] };
    e.a += A[t]; e.s += A[t] * d * Math.SQRT2; e.faces.push(t); ch.set(key, e);
  }
  if (ch.size >= 12) {
    const cs = [...ch.values()].map((e) => e.s / e.a).sort((a, b) => a - b), c = cs[cs.length >> 1];
    if (c > 0.1 && cs.every((x) => Math.abs(x - c) <= Math.max(tol, c * 0.15))) {
      const faces = [...ch.values()].flatMap((e) => e.faces);
      for (let t = 0; t < n; t++) {   // köşe üçgenleri
        const nn = [N[t * 3], N[t * 3 + 1], N[t * 3 + 2]];
        if ([0, 1, 2].every((k) => Math.abs(Math.abs(nn[k]) - 0.577) < 0.1)) faces.push(t);
      }
      // gerçek pah: geriye düz olmayan başka yüz kalmamalı (yuvarlamanın 45° civarı şeritleri pah sanılmasın)
      const holeF = new Uint8Array(n); for (const cc of an.cyl) if (!cc.convex) for (const t of cc.faces) holeF[t] = 1;
      const fs = new Uint8Array(n); for (const t of faces) fs[t] = 1;
      let rest = 0, all = 0; for (let t = 0; t < n; t++) { all += A[t]; if (!fs[t] && !holeF[t] && an.planeAx[t] < 0) rest += A[t]; }
      if (rest <= 0.02 * all) return { c, faces };
    }
  }
  // yuvarlama: yuvarlatılmış kutunun işaretli uzaklık işlevine (SDF) en iyi oturan R. Düz olmayan yüzler (delikler hariç) bu
  // yüzeyde olmalı; hepsi oturursa 12 kenar + 8 köşe eşit R ile yuvarlatılmış demektir.
  {
    const holeF = new Uint8Array(n); for (const c of an.cyl) if (!c.convex) for (const t of c.faces) holeF[t] = 1;
    const ids = []; let ar = 0, all = 0;
    for (let t = 0; t < n; t++) { all += A[t]; if (an.planeAx[t] < 0 && !holeF[t]) { ids.push(t); ar += A[t]; } }
    if (ar > 0.02 * all) {
      const c = [0, 1, 2].map((k) => (mn[k] + mx[k]) / 2), hf = [0, 1, 2].map((k) => (mx[k] - mn[k]) / 2);
      const err = (R) => {
        let e = 0, w = 0;
        for (const t of ids) {
          let q2 = 0, qm = -Infinity;
          for (let k = 0; k < 3; k++) { const q = Math.abs(C[t * 3 + k] - c[k]) - (hf[k] - R); if (q > 0) q2 += q * q; if (q > qm) qm = q; }
          const d = Math.sqrt(q2) + Math.min(qm, 0) - R; e += A[t] * d * d; w += A[t];   // yuvarlatılmış kutu SDF
        }
        return Math.sqrt(e / w);
      };
      let lo = 0.05, hi = Math.min(...hf) * 0.98;
      for (let it = 0; it < 60; it++) { const m1 = lo + (hi - lo) / 3, m2 = hi - (hi - lo) / 3; if (err(m1) < err(m2)) hi = m2; else lo = m1; }
      const R = (lo + hi) / 2, e = err(R);
      // yüz ağırlık merkezleri eğri yüzün biraz içinde kalır (kiriş): R'nin %4'üne kadar sapma kabul
      if (e <= Math.max(tolPos, R * 0.04)) return { r: R, faces: ids };
    }
  }
  return null;
}
function boxEdgeVol(p) {
  const { w, h, l } = p;
  if (p.r) { const r = p.r, a = w - 2 * r, b = h - 2 * r, c = l - 2 * r; return a * b * c + 2 * r * (a * b + a * c + b * c) + Math.PI * r * r * (a + b + c) + 4 / 3 * Math.PI * r ** 3; }
  const c = p.c; return w * h * l - 2 * c * c * (w + h + l) + (8 / 3) * c ** 3;   // 12 üçgen prizma, köşe bindirmesi
}

/* ---------- düzlem kesiti ---------- */
// Ağı düzlemle keser; kapalı döngüleri 2B ([u, v]) verir. Düzlem: nokta P0, normal Nn; 2B eksenler U, Vv.
export function section(m, P0, Nn, U, Vv) {
  const { V, F } = m, segs = [];
  const d = new Float64Array(V.length / 3);
  for (let i = 0; i < d.length; i++) d[i] = (V[i * 3] - P0[0]) * Nn[0] + (V[i * 3 + 1] - P0[1]) * Nn[1] + (V[i * 3 + 2] - P0[2]) * Nn[2];
  const P2 = (a, b) => { const t = d[a] / (d[a] - d[b]); const x = V[a * 3] + t * (V[b * 3] - V[a * 3]) - P0[0], y = V[a * 3 + 1] + t * (V[b * 3 + 1] - V[a * 3 + 1]) - P0[1], z = V[a * 3 + 2] + t * (V[b * 3 + 2] - V[a * 3 + 2]) - P0[2]; return [x * U[0] + y * U[1] + z * U[2], x * Vv[0] + y * Vv[1] + z * Vv[2]]; };
  for (let i = 0; i < F.length; i += 3) {
    const v = [F[i], F[i + 1], F[i + 2]], s = v.map((k) => d[k] > 0);
    if (s[0] === s[1] && s[1] === s[2]) continue;
    const pts = [];
    for (let k = 0; k < 3; k++) { const a = v[k], b = v[(k + 1) % 3]; if ((d[a] > 0) !== (d[b] > 0)) pts.push(P2(a, b)); }
    if (pts.length === 2) segs.push(pts);
  }
  // uç noktaları eşleştirerek döngü kur
  const key = (p) => Math.round(p[0] * 1e4) + ',' + Math.round(p[1] * 1e4);
  const at = new Map();
  segs.forEach((sg, i) => { for (const p of sg) { const k = key(p); (at.get(k) || at.set(k, []).get(k)).push(i); } });
  const used = new Uint8Array(segs.length), loops = [];
  for (let i = 0; i < segs.length; i++) {
    if (used[i]) continue;
    used[i] = 1;
    const loop = [segs[i][0], segs[i][1]];
    let cur = segs[i][1];
    for (let guard = 0; guard < segs.length; guard++) {
      const cand = (at.get(key(cur)) || []).find((j) => !used[j]);
      if (cand === undefined) break;
      used[cand] = 1;
      const sg = segs[cand], nx = key(sg[0]) === key(cur) ? sg[1] : sg[0];
      if (key(nx) === key(loop[0])) { cur = null; break; }
      loop.push(nx); cur = nx;
    }
    if (loop.length >= 3) loops.push(loop);
  }
  return loops;
}
const area2 = (L) => { let s = 0; for (let i = 0; i < L.length; i++) { const a = L[i], b = L[(i + 1) % L.length]; s += a[0] * b[1] - b[0] * a[1]; } return s / 2; };
// Douglas-Peucker (kapalı döngü)
export function simplifyLoop(L, tol) {
  if (L.length < 4) return L;
  let far = 0, fd = -1;
  for (let i = 1; i < L.length; i++) { const d = Math.hypot(L[i][0] - L[0][0], L[i][1] - L[0][1]); if (d > fd) { fd = d; far = i; } }
  const dp = (pts) => {
    if (pts.length < 3) return pts;
    const [a, b] = [pts[0], pts[pts.length - 1]], L2 = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1e-12;
    let mi = 0, md = -1;
    for (let i = 1; i < pts.length - 1; i++) { const d = Math.abs((b[0] - a[0]) * (a[1] - pts[i][1]) - (a[0] - pts[i][0]) * (b[1] - a[1])) / L2; if (d > md) { md = d; mi = i; } }
    if (md <= tol) return [a, b];
    const l = dp(pts.slice(0, mi + 1)), r = dp(pts.slice(mi));
    return [...l.slice(0, -1), ...r];
  };
  const A1 = dp(L.slice(0, far + 1)), B1 = dp([...L.slice(far), L[0]]);
  const out = [...A1.slice(0, -1), ...B1.slice(0, -1)];
  // aynı doğru üzerindeki ara noktaları at (başlangıç noktası dahil)
  for (let ch = true; ch && out.length > 3;) {
    ch = false;
    for (let i = 0; i < out.length; i++) {
      const a = out[(i + out.length - 1) % out.length], p = out[i], b = out[(i + 1) % out.length];
      const L2 = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1e-12;
      if (Math.abs((b[0] - a[0]) * (a[1] - p[1]) - (a[0] - p[0]) * (b[1] - a[1])) / L2 <= tol) { out.splice(i, 1); ch = true; break; }
    }
  }
  return out;
}
// yarım düzleme (u ≥ 0) kırpma (Sutherland-Hodgman)
function clipU(L) {
  const out = [];
  for (let i = 0; i < L.length; i++) {
    const a = L[i], b = L[(i + 1) % L.length], ia = a[0] >= 0, ib = b[0] >= 0;
    if (ia) out.push(a);
    if (ia !== ib) { const t = a[0] / (a[0] - b[0]); out.push([0, a[1] + t * (b[1] - a[1])]); }
  }
  return out;
}

/* ---------- dönel parça: kesit profilinden silindir + koni kademeleri ya da döndürme krokisi ---------- */
function fitTurnedProfile(m, opt) {
  const snap = opt.snap ?? 0.1;
  const an = analyze(m, opt), { info, fd, cyl, tolPos } = an, { n, N, A, C } = fd;
  // eksen: en büyük dışbükey Y silindiri ya da sınır kutusu ortası
  const big = cyl.filter((c) => c.axis === 1 && c.convex).reduce((b, c) => (!b || c.R > b.R ? c : b), null);
  const cx = big ? big.cv : (info.min[0] + info.max[0]) / 2, cz = big ? big.cu : (info.min[2] + info.max[2]) / 2;
  if (Math.abs(info.size[0] - info.size[2]) > Math.max(tolPos * 4, info.size[0] * 0.04)) return null;
  // eksen dışı delikler (flanş) ve çapraz delikler ayrı
  const holes = cyl.filter((c) => c.full && !c.convex && !(c.axis === 1 && Math.hypot(c.cv - cx, c.cu - cz) <= tolPos * 3));
  const inHole = new Uint8Array(n); for (const c of holes) for (const t of c.faces) inHole[t] = 1;
  // dönel simetri: yüz normali, eksenden geçen düzlemde olmalı
  let sym = 0, tot = 0;
  for (let t = 0; t < n; t++) {
    tot += A[t]; if (inHole[t]) { sym += A[t]; continue; }
    const rx = C[t * 3] - cx, rz = C[t * 3 + 2] - cz, r = Math.hypot(rx, rz);
    if (r < tolPos) { sym += A[t]; continue; }
    const tang = (-rz * N[t * 3] + rx * N[t * 3 + 2]) / r;
    if (Math.abs(tang) < 0.17 || Math.abs(N[t * 3 + 1]) > 0.985) sym += A[t];
  }
  if (sym < 0.9 * tot) return null;
  // kesit: delikleri kesmeyen açıyı bul (en büyük profil alanı)
  let prof = null, best = -1;
  for (let i = 0; i < 16; i++) {
    const th = (i / 16) * 2 * Math.PI + 0.05, U = [Math.cos(th), 0, Math.sin(th)];
    const loops = section(m, [cx, 0, cz], [-Math.sin(th), 0, Math.cos(th)], U, [0, 1, 0]).map(clipU).filter((L) => L.length >= 3);
    for (const L of loops) { const a = Math.abs(area2(L)); if (a > best) { best = a; prof = L; } }
  }
  if (!prof) return null;
  const tolS = Math.max(0.05, tolPos * 0.5);
  prof = simplifyLoop(prof, tolS);
  const y0 = info.min[1], y1 = info.max[1];
  // kırılma yükseklikleri, her aralıkta dış ve iç yarıçap (aralığın iki ucunda)
  const ys = [...new Set(prof.map((p) => p[1]))].sort((a, b) => a - b).filter((y, i, a) => i === 0 || y - a[i - 1] > tolS);
  const radiiAt = (y) => {
    const xs = [];
    for (let i = 0; i < prof.length; i++) {
      const a = prof[i], b = prof[(i + 1) % prof.length];
      if ((a[1] > y) !== (b[1] > y)) xs.push(a[0] + (y - a[1]) / (b[1] - a[1]) * (b[0] - a[0]));
    }
    xs.sort((p, q) => p - q);
    return xs.length >= 2 ? { ri: xs[xs.length - 2] > tolS ? xs[xs.length - 2] : 0, ro: xs[xs.length - 1] } : null;
  };
  const segs = [];
  for (let i = 0; i + 1 < ys.length; i++) {
    const a = ys[i], b = ys[i + 1], e = Math.min(tolS, (b - a) / 4);
    const lo = radiiAt(a + e), hi = radiiAt(b - e);
    if (!lo || !hi) return null;
    // ölçüm aralığın biraz içinde: uçlara doğrusal uzat
    const ex = (p, q) => { const k = (q - p) / (b - a - 2 * e); return [p - k * e, q + k * e]; };
    const [ro0, ro1] = ex(lo.ro, hi.ro), [ri0, ri1] = lo.ri && hi.ri ? ex(lo.ri, hi.ri) : [lo.ri, hi.ri];
    segs.push({ a, b, ro0, ro1, ri0, ri1 });
  }
  const same = (p, q) => Math.abs(p - q) <= Math.max(tolS * 2, 0.05);
  // aynı silindiri ardışık aralıklarda birleştir
  const mergeRuns = (get0, get1) => {
    const out = [];
    for (const s of segs) {
      const r0 = get0(s), r1 = get1(s), last = out[out.length - 1];
      if (last && same(last.r0, last.r1) && same(r0, r1) && same(last.r1, r0) && Math.abs(last.b - s.a) < 1e-9) { last.b = s.b; continue; }
      out.push({ a: s.a, b: s.b, r0, r1 });
    }
    return out;
  };
  const outer = mergeRuns((s) => s.ro0, (s) => s.ro1), inner = mergeRuns((s) => s.ri0, (s) => s.ri1).filter((s) => s.r0 > 0 || s.r1 > 0);
  const cones = (L) => L.filter((s) => !same(s.r0, s.r1));
  const consecutiveCones = (L) => L.some((s, i) => i && !same(s.r0, s.r1) && !same(L[i - 1].r0, L[i - 1].r1));
  const notes = [];
  let parts = [], kind;
  if (outer.length + inner.length > 14 || consecutiveCones(outer) || consecutiveCones(inner)) {
    // yuvarlama / eğri profil: tek döndürme krokisi (düzenlenebilir noktalar)
    kind = 'kroki-döndürme';
    const pts = prof.map(([u, v]) => [r1(u, snap / 10 || 0.01), r1(v - y0, snap / 10 || 0.01)]);
    parts.push({ type: 'sketch', mode: 'revolve', plane: 'front', h: 0, x: r1(cx, snap), y: r1(y0, snap), z: r1(cz, snap), pts });
    notes.push('Profilde yuvarlama ya da eğri var: parça, noktaları düzenlenebilen bir döndürme krokisi olarak eklendi.');
  } else {
    kind = 'torna';
    const seg = (s, op, ext) => {
      const ya = s.a - (ext && Math.abs(s.a - y0) < tolS * 4 ? 1 : 0), yb = s.b + (ext && Math.abs(s.b - y1) < tolS * 4 ? 1 : 0);
      const base = { op, x: r1(cx, snap), y: r1(ya, snap), z: r1(cz, snap), h: r1(yb - ya, snap) };
      if (same(s.r0, s.r1)) return { type: 'cylinder', d: r1(2 * (s.r0 + s.r1) / 2, snap), ...base };
      // uzatılan uçta yarıçap aynı eğimle sürer
      const k = (s.r1 - s.r0) / (s.b - s.a), r0 = s.r0 - k * (s.a - ya), rr1 = s.r1 + k * (yb - s.b);
      return { type: 'cone', d: r1(2 * Math.max(r0, 0), snap), d2: r1(2 * Math.max(rr1, 0), snap), ...base };
    };
    for (const s of outer) parts.push(seg(s, 'add', false));
    for (const s of inner) parts.push(seg(s, 'sub', true));
    const nc = cones(outer).length + cones(inner).length;
    if (nc) notes.push(nc + ' konik yüz (pah / koni) tanındı.');
  }
  // eksen dışı delikler: temel hesaptaki gibi
  const hp = holeParts(an, holes, snap);
  parts.push(...hp.parts); notes.push(...hp.notes);
  // doğrulama: profil hacmi (Pappus) − delikler
  let vol = 0;
  for (let i = 0; i < prof.length; i++) { const [u1, v1] = prof[i], [u2, v2] = prof[(i + 1) % prof.length]; vol += Math.PI * (v2 - v1) * (u1 * u1 + u1 * u2 + u2 * u2) / 3; }
  vol = Math.abs(vol);
  for (const c of holes) vol -= Math.PI * c.R * c.R * (c.b - c.a);
  const volErr = info.closed && info.volume > 0 ? Math.abs(vol - info.volume) / info.volume : null;
  const quality = { coverage: sym / tot, volErr, unexplained: 1 - sym / tot, faces: n };
  if (volErr != null && volErr > (opt.maxVolErr ?? 0.08)) return { ok: false, kind, parts: [], notes, quality, reason: 'Dönel parçaya benziyor ama hacim farkı %' + Math.round(volErr * 100) + '. Ağ olarak eklenmesi önerilir.' };
  return { ok: true, kind, parts, quality, notes, holes: hp.parts.length, analysis: summary(an) };
}

// Delik parçaları: açık uç, uçtaki taban yüzü yoksa anlaşılır (kör delik tabanı varsa o uç kapalı)
function holeParts(an, list, snap) {
  const { fd, planeAx, tolPos } = an, { n, A, C } = fd;
  const parts = [], notes = [];
  for (const c of list) {
    const k = c.axis, [iu, iv] = UV[k];
    const capAt = (at) => {
      let a = 0;
      for (let t = 0; t < n; t++) if (planeAx[t] === k && Math.abs(C[t * 3 + k] - at) <= tolPos * 2 && Math.hypot(C[t * 3 + iu] - c.cu, C[t * 3 + iv] - c.cv) < c.R * 0.95) a += A[t];
      return a > Math.PI * c.R * c.R * 0.3;
    };
    const openLo = !capAt(c.a), openHi = !capAt(c.b);
    if (!openLo && !openHi) { notes.push('İçeride kalan silindirik boşluk (Ø' + fmt(2 * c.R) + ') eklenmedi'); continue; }
    const a = openLo ? c.a - 1 : c.a, b = openHi ? c.b + 1 : c.b, len = b - a;
    const p = { type: 'cylinder', op: 'sub', d: r1(2 * c.R, snap), h: r1(len, snap), x: 0, y: 0, z: 0, rx: 0, rz: 0 };
    const cen = [0, 0, 0]; cen[iu] = c.cu; cen[iv] = c.cv;
    if (k === 1) { p.x = cen[0]; p.z = cen[2]; p.y = a; }
    else if (k === 0) { p.y = cen[1]; p.z = cen[2]; p.rz = -90; p.x = a; }   // rz = -90: +Y → +X
    else { p.x = cen[0]; p.y = cen[1]; p.rx = 90; p.z = a; }                 // rx = +90: +Y → +Z
    p.x = r1(p.x, snap); p.y = r1(p.y, snap); p.z = r1(p.z, snap);
    parts.push(p);
  }
  return { parts, notes };
}

/* ---------- 2,5B parça: bir eksen boyunca sabit kesit (eğik yüzler, L / T profil, yuvarlatılmış köşe) → üstten kroki ---------- */
function fitExtrusion(m, opt) {
  const snap = opt.snap ?? 0.1;
  const an = analyze(m, opt), { info, fd, planeAx, cyl, tolPos } = an, { n, N, A, C } = fd;
  const cosT = Math.cos(15 * DEG), sinT = Math.sin(15 * DEG);   // tarama gürültüsünde küçük üçgenlerin normali sapar
  const y0 = info.min[1], y1 = info.max[1], H = y1 - y0;
  if (!(H > tolPos * 2)) return null;
  const cross = cyl.filter((c) => c.full && !c.convex && c.axis !== 1);
  const inCross = new Uint8Array(n); for (const c of cross) for (const t of c.faces) inCross[t] = 1;
  let ok = 0, tot = 0, capsOff = 0;
  for (let t = 0; t < n; t++) {
    tot += A[t];
    const ny = Math.abs(N[t * 3 + 1]);
    if (inCross[t]) { ok += A[t]; continue; }
    if (ny > cosT) { ok += A[t]; const y = C[t * 3 + 1]; if (Math.abs(y - y0) > tolPos * 2 && Math.abs(y - y1) > tolPos * 2) capsOff += A[t]; continue; }
    if (ny < sinT) ok += A[t];
  }
  if (ok < 0.97 * tot || capsOff > 0.02 * tot) return null;   // ara yükseklikte basamak / cep var: tek kesitle anlatılamaz
  // kalınlık: alt ve üst kapak yüzlerinin ortalama yüksekliği (gürültüdeki uç noktalar değil)
  let la = 0, ls = 0, ha = 0, hs = 0;
  for (let t = 0; t < n; t++) {
    if (Math.abs(N[t * 3 + 1]) <= cosT) continue;
    const y = C[t * 3 + 1];
    if (y - y0 <= tolPos * 3) { la += A[t]; ls += A[t] * y; } else if (y1 - y <= tolPos * 3) { ha += A[t]; hs += A[t] * y; }
  }
  const Y0 = la ? ls / la : y0, Y1 = ha ? hs / ha : y1;
  // kesit: çapraz delikleri kesmeyen yükseklik (en büyük alan)
  let loops = null, best = -1;
  for (const f of [0.5, 0.3, 0.7, 0.15, 0.85, 0.42, 0.58]) {
    const L = section(m, [0, y0 + H * f, 0], [0, 1, 0], [1, 0, 0], [0, 0, 1]);
    const a = L.reduce((s, l) => s + area2(l), 0);
    if (L.length && Math.abs(a) > best) { best = Math.abs(a); loops = L; }
  }
  if (!loops) return null;
  const tolS = Math.max(0.05, tolPos * 0.5);
  loops = loops.map((L) => simplifyLoop(L, tolS)).filter((L) => L.length >= 3 && Math.abs(area2(L)) > tolS * tolS * 4);
  loops.sort((p, q) => Math.abs(area2(q)) - Math.abs(area2(p)));
  let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
  for (const L of loops) for (const [u, v] of L) { u0 = Math.min(u0, u); u1 = Math.max(u1, u); v0 = Math.min(v0, v); v1 = Math.max(v1, v); }
  const cu = (u0 + u1) / 2, cv = (v0 + v1) / 2, q = (x) => Math.round(x * 1000) / 1000;
  const rel = (L) => L.map(([u, v]) => [q(u - cu), q(v - cv)]);
  const sk = { type: 'sketch', mode: 'extrude', plane: 'top', op: 'add', h: r1(Y1 - Y0, snap), x: r1(cu, 0.001), y: r1(Y0, snap), z: r1(cv, 0.001), pts: rel(loops[0]) };
  if (loops.length > 1) sk.more = loops.slice(1).map(rel);
  const hp = holeParts(an, cross, snap);
  // doğrulama
  let area = 0;   // dış döngüler artı, delikler eksi (iç içe derinliğe göre)
  for (let i = 0; i < loops.length; i++) {
    let depth = 0; for (let j = 0; j < loops.length; j++) if (j !== i && Math.abs(area2(loops[j])) > Math.abs(area2(loops[i])) && pip(loops[i][0], loops[j])) depth++;
    area += (depth % 2 ? -1 : 1) * Math.abs(area2(loops[i]));
  }
  let vol = area * (Y1 - Y0); for (const c of cross) vol -= Math.PI * c.R * c.R * (c.b - c.a);
  const volErr = info.closed && info.volume > 0 ? Math.abs(vol - info.volume) / info.volume : null;
  const quality = { coverage: ok / tot, volErr, unexplained: 1 - ok / tot, faces: n };
  if (volErr != null && volErr > (opt.maxVolErr ?? 0.08)) return null;
  // dikdörtgen kesit + yuvarlak delikler → kutu ve silindir delikler (ölçüleri doğrudan düzenlenir)
  const L0 = loops[0], axisRect = L0.length === 4 && L0.every((p, i) => { const r = L0[(i + 1) % 4]; return Math.abs(r[0] - p[0]) <= tolS * 3 || Math.abs(r[1] - p[1]) <= tolS * 3; });
  const circ = loops.slice(1).map((L) => { const c = fitCircle(L); return c && L.length >= 8 && c.rms <= Math.max(tolS, c.R * 0.03) ? c : null; });
  if (axisRect && circ.every(Boolean)) {
    const H2 = Y1 - Y0;
    const box = { type: 'box', op: 'add', w: r1(u1 - u0, snap), h: r1(H2, snap), l: r1(v1 - v0, snap), x: r1(cu, snap), y: r1(Y0, snap), z: r1(cv, snap) };
    const yh = circ.map((c) => ({ type: 'cylinder', op: 'sub', d: r1(2 * c.R, snap), h: r1(H2 + 2, snap), x: r1(c.cu, snap), y: r1(Y0 - 1, snap), z: r1(c.cv, snap), rx: 0, rz: 0 }));
    return { ok: true, kind: 'prizmatik', parts: [box, ...yh, ...hp.parts], quality, notes: hp.notes, holes: yh.length + hp.parts.length, analysis: summary(an) };
  }
  const inclined = loops[0].some((p, i) => { const r = loops[0][(i + 1) % loops[0].length]; const dx = Math.abs(r[0] - p[0]), dz = Math.abs(r[1] - p[1]); return dx > tolS * 4 && dz > tolS * 4; });
  const notes = ['Parça, sabit kesitli bir kroki (üstten ekstrüzyon) olarak eklendi: köşe noktaları ve kalınlık düzenlenebilir.'];
  if (inclined) notes.push('Eğik yüzler tanındı.');
  notes.push(...hp.notes);
  return { ok: true, kind: 'kroki', parts: [sk, ...hp.parts], quality, notes, holes: hp.parts.length + Math.max(0, loops.length - 1), analysis: summary(an) };
}
function pip(pt, poly) {
  let inside = false; const [x, y] = pt;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const [xi, yi] = poly[i], [xj, yj] = poly[j]; if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside; }
  return inside;
}

// Eksen döndürmeleri: k ekseni Y'ye (sağ el kuralı korunur)
const TO_Y = { 1: (x, y, z) => [x, y, z], 2: (x, y, z) => [x, z, -y], 0: (x, y, z) => [-y, x, z] };

// Ana işlev: hizalanmış ağdan parça listesi. Sırayla: temel şekiller (+ eşit pah / yuvarlama) → dönel profil → 2,5B kesit.
// Dönüş: { ok, kind, parts, quality, notes, reason }. parts: uygulama parçası alanları. Ağ hizalı ve yere oturmuş olmalı (alignToAxes).
export function fitCAD(m, opt = {}) {
  const a = fitBasic(m, opt);
  // temel şekil kusursuz oturduysa başka arama yok
  if (a.ok && a.quality.coverage >= 0.995 && !(a.quality.volErr > 0.005)) return a;
  const cands = a.ok ? [a] : [];
  const b = fitTurnedProfile(m, opt);
  if (b && b.ok) cands.push(b);
  for (const k of [1, 2, 0]) {
    const mk = k === 1 ? m : toFloor(transform(m, TO_Y[k]));
    const c = fitExtrusion(mk, opt);
    if (c && c.ok) cands.push(k === 1 ? c : { ...c, notes: [...c.notes, 'Parça, kesit ekseni dikey olacak şekilde çevrildi.'] });
  }
  if (!cands.length) return b && !b.ok ? b : a;
  // sıra önemli: temel şekil (ölçüleri en kolay düzenlenen) → dönel profil → kesit krokisi. İyi oturan ilk aday seçilir;
  // hiçbiri iyi değilse en iyi oturan.
  const good = (r) => r.quality.coverage >= 0.92 && !(r.quality.volErr > 0.02);
  const g = cands.find(good);
  if (g) return g;
  const score = (r) => r.quality.coverage - 2 * (r.quality.volErr || 0);
  return cands.reduce((p, q) => (score(q) > score(p) ? q : p));
}
