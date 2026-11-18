// Ağdan düzenlenebilir CAD (Photo-to-CAD Mod C, 1. sürüm): tarama / STL ağındaki düz yüzleri ve silindirleri tanır,
// uygulamanın kendi parametrik parçalarına (kutu, silindir, boru, küre + delikler) çevirir. Bu parçalar OCCT'de gerçek
// B-Rep katı olur, ölçüleri düzenlenir, teknik resmi çıkar.
//
// Dürüstlük kuralı: şekil temel şekillere yeterince oturmazsa CAD üretilmez (ok: false) — ağ, CAD gibi gösterilmez.
// Tanınanlar: prizmatik parçalar (kutu + eksene paralel delikler, kör delikler), tornalanmış parçalar (kademeli mil, boru,
// iç kademeli delik, flanş delikleri), küre. Tanınmayanlar (açıklanamayan yüzey olarak raporlanır): pah, yuvarlama,
// eğik yüzler, serbest yüzeyler.
// Saf fonksiyonlar (tests/scan.test.mjs). Girdi: mesh-tools biçiminde ağ { V, F } (kaynaklanmış, yüzler dışa bakan).
import { measure, transform, toFloor } from './mesh-tools.js?v=20261118a';

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
  // silindir bölgeleri: her eksen için o eksene paralel (normal eksene dik) yüzlerden bölge büyütme
  const cyl = [];
  for (let k = 0; k < 3; k++) {
    const seen = new Uint8Array(n);
    for (let s = 0; s < n; s++) {
      if (seen[s] || Math.abs(N[s * 3 + k]) > latSin) continue;
      const reg = [s]; seen[s] = 1;
      for (let i = 0; i < reg.length; i++) {
        const t = reg[i];
        for (const u of nb[t]) {
          if (seen[u] || Math.abs(N[u * 3 + k]) > latSin) continue;
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
  return { fd, info, planeAx, cyl: cylOut, tolPos, diag };
}

const r1 = (v, s) => (s ? Math.round(v / s) * s : v);
const fmt = (v) => (Math.round(v * 100) / 100).toLocaleString('tr-TR');

// Ana işlev: hizalanmış ağdan parça listesi. Dönüş: { ok, kind, parts, quality, notes, reason }
// parts: uygulama parçası alanları (type, op, w, h, l, d, di, x, y, z, rx, rz). Ağ zaten hizalı ve yere oturmuş olmalı (alignToAxes).
export function fitCAD(m, opt = {}) {
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
  const b = r.parts.filter((p) => p.op === 'add'), h = r.parts.filter((p) => p.op === 'sub');
  const head = r.kind === 'prizmatik' ? 'Kutu ' + fmt(b[0].w) + ' × ' + fmt(b[0].l) + ' × ' + fmt(b[0].h) + ' mm'
    : r.kind === 'boru' ? 'Boru Ø' + fmt(b[0].d) + ' / Ø' + fmt(b[0].di) + ' × ' + fmt(b[0].h) + ' mm'
      : r.kind === 'küre' ? 'Küre Ø' + fmt(b[0].d) + ' mm'
        : 'Torna parçası: ' + b.map((p) => 'Ø' + fmt(p.d) + '×' + fmt(p.h)).join(' + ') + ' mm';
  if (!h.length) return head;
  const g = new Map(); for (const p of h) g.set(p.d, (g.get(p.d) || 0) + 1);
  return head + ' · ' + h.length + ' delik (' + [...g].map(([d, c]) => 'Ø' + fmt(d) + (c > 1 ? ' ×' + c : '')).join(', ') + ')';
}
