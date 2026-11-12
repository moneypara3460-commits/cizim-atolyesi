// Kağıttaki el çizimini fotoğraftan 2B varlıklara çevirir (internetsiz, telefonda çalışır).
// Adımlar: kağıt köşeleri -> perspektif düzeltme -> uyarlamalı eşikleme (gölge temizliği) -> küçük lekeleri atma
//          -> inceltme (iskelet) -> yol takibi -> çizgi / yay / daire uydurma -> düzgünleştirme (yatay/dikey, uç birleştirme)
// Saf fonksiyonlar; DOM gerektirmez (tests/photo2d.test.mjs).
import { arcFrom3 } from './cad2d-geom.js?v=20261112u';
import { DIGIT_NET } from './digits-model.js?v=20261112u';

const TAU = Math.PI * 2;
const normA = (a) => { a %= TAU; return a < 0 ? a + TAU : a; };

/* ---------- gri görüntü, perspektif ---------- */
export function toGray(rgba, w, h) {
  const g = new Uint8Array(w * h);
  for (let i = 0, j = 0; i < g.length; i++, j += 4) g[i] = (rgba[j] * 77 + rgba[j + 1] * 150 + rgba[j + 2] * 29) >> 8;
  return g;
}
// 4 nokta -> 4 nokta izdüşüm matrisi (src -> dst), 3x3 dizi (h33 = 1)
// Renge duyarlı mürekkep haritası (0 = koyu mürekkep, 255 = kağıt). Gri yerine kullanılır:
// 1) yerel kağıt parlaklığına bölünür → gölge ve ışık farkı silinir; 2) kalem rengi (mavi, siyah, kırmızı…)
// kağıttan doygunluk / ton farkıyla ayrılır → soluk defter çizgileri ve basılı sayfa numaraları zayıflar.
export function inkGray(rgba, w, h) {
  const N = w * h, Y = new Float32Array(N), S = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const r = rgba[i * 4], g = rgba[i * 4 + 1], b = rgba[i * 4 + 2], mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    Y[i] = 0.299 * r + 0.587 * g + 0.114 * b; S[i] = mx > 0 ? (mx - mn) / mx : 0;
  }
  // kağıt parlaklığı ve doygunluğu: kalem izinden geniş pencerede en parlak / ortanca (ayrılabilir max + kutu bulanıklığı)
  const R = Math.max(4, Math.round(Math.max(w, h) / 90));
  // morfolojik kapama (genişlet + aşındır): ince koyu kalem izini doldurur, gölge sınırındaki basamağı korur
  const ext = (src, sg) => { const t = new Float32Array(N), o = new Float32Array(N);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { let m = sg > 0 ? -1e9 : 1e9; for (let k = Math.max(0, x - R); k <= Math.min(w - 1, x + R); k++) { const v = src[y * w + k]; if (sg > 0 ? v > m : v < m) m = v; } t[y * w + x] = m; }
    for (let x = 0; x < w; x++) for (let y = 0; y < h; y++) { let m = sg > 0 ? -1e9 : 1e9; for (let k = Math.max(0, y - R); k <= Math.min(h - 1, y + R); k++) { const v = t[k * w + x]; if (sg > 0 ? v > m : v < m) m = v; } o[y * w + x] = m; }
    return o; };
  const maxF = (src) => ext(ext(src, 1), -1);
  const box = (src, r) => { const t = new Float32Array(N), o = new Float32Array(N);
    for (let y = 0; y < h; y++) { let s = 0, n = 0; for (let k = 0; k <= Math.min(w - 1, r); k++) { s += src[y * w + k]; n++; } for (let x = 0; x < w; x++) { t[y * w + x] = s / n; const a = x + r + 1, b = x - r; if (a < w) { s += src[y * w + a]; n++; } if (b >= 0) { s -= src[y * w + b]; n--; } } }
    for (let x = 0; x < w; x++) { let s = 0, n = 0; for (let k = 0; k <= Math.min(h - 1, r); k++) { s += t[k * w + x]; n++; } for (let y = 0; y < h; y++) { o[y * w + x] = s / n; const a = y + r + 1, b = y - r; if (a < h) { s += t[a * w + x]; n++; } if (b >= 0) { s -= t[b * w + x]; n--; } } }
    return o; };
  const bg = box(maxF(Y), Math.max(1, R >> 2)), bgS = box(S, R * 2);
  // kalemin rengi: koyu (göreli parlaklık < 0,7) piksellerin ortalama doygunluk fazlası; belirginse (renkli kalem) renk ağırlığı verilir
  let sumS = 0, cnt = 0;
  for (let i = 0; i < N; i++) if (Y[i] < bg[i] * 0.7) { sumS += S[i] - bgS[i]; cnt++; }
  const inkSat = cnt > 50 ? sumS / cnt : 0, colorPen = inkSat > 0.12;
  const out = new Uint8ClampedArray(N);
  for (let i = 0; i < N; i++) {
    let v = Y[i] / Math.max(1, bg[i]);                       // 1 = kağıt, küçük = koyu
    if (colorPen) { const ds = (S[i] - bgS[i]) / inkSat; v -= 0.35 * Math.max(0, Math.min(1.2, ds)) - 0.12 * Math.max(0, -ds); }
    out[i] = Math.max(0, Math.min(255, Math.round(v * 255)));
  }
  out.colorPen = colorPen; out.inkSat = inkSat;
  return out;
}
export function homography(src, dst) {
  const A = [], b = [];
  for (let i = 0; i < 4; i++) {
    const [x, y] = src[i], [u, v] = dst[i];
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]); b.push(u);
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y]); b.push(v);
  }
  // Gauss eleme
  const n = 8;
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
    [A[c], A[p]] = [A[p], A[c]]; [b[c], b[p]] = [b[p], b[c]];
    if (Math.abs(A[c][c]) < 1e-12) return null;
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = A[r][c] / A[c][c];
      for (let k = c; k < n; k++) A[r][k] -= f * A[c][k];
      b[r] -= f * b[c];
    }
  }
  const h = b.map((v, i) => v / A[i][i]);
  return [h[0], h[1], h[2], h[3], h[4], h[5], h[6], h[7], 1];
}
const applyH = (H, x, y) => { const d = H[6] * x + H[7] * y + H[8]; return [(H[0] * x + H[1] * y + H[2]) / d, (H[3] * x + H[4] * y + H[5]) / d]; };
// quad: kaynak görüntüdeki kağıt köşeleri (sol üst, sağ üst, sağ alt, sol alt). Çift doğrusal örnekleme.
export function warpGray(gray, sw, sh, quad, ow, oh) {
  const H = homography([[0, 0], [ow - 1, 0], [ow - 1, oh - 1], [0, oh - 1]], quad); // hedef -> kaynak
  const out = new Uint8Array(ow * oh).fill(255);
  if (!H) return out;
  for (let y = 0; y < oh; y++) for (let x = 0; x < ow; x++) {
    const [u, v] = applyH(H, x, y);
    if (u < 0 || v < 0 || u > sw - 1 || v > sh - 1) continue;
    const x0 = Math.floor(u), y0 = Math.floor(v), x1 = Math.min(x0 + 1, sw - 1), y1 = Math.min(y0 + 1, sh - 1), fx = u - x0, fy = v - y0;
    const a = gray[y0 * sw + x0], b = gray[y0 * sw + x1], c = gray[y1 * sw + x0], d = gray[y1 * sw + x1];
    out[y * ow + x] = (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy;
  }
  return out;
}

// Kağıt köşelerini bul: kağıt, arka plandan açık renkli en büyük bölgedir. Bulamazsa null.
export function findPaperQuad(gray, w, h) {
  // Otsu eşiği
  const hist = new Array(256).fill(0);
  for (const v of gray) hist[v]++;
  let sum = 0; for (let i = 0; i < 256; i++) sum += i * hist[i];
  let sB = 0, wB = 0, best = 0, th = 128;
  for (let t = 0; t < 256; t++) {
    wB += hist[t]; if (!wB) continue;
    const wF = gray.length - wB; if (!wF) break;
    sB += t * hist[t];
    const mB = sB / wB, mF = (sum - sB) / wF, v = wB * wF * (mB - mF) ** 2;
    if (v > best) { best = v; th = t; }
  }
  const mask = new Uint8Array(w * h);
  for (let i = 0; i < mask.length; i++) mask[i] = gray[i] > th ? 1 : 0;
  // en büyük açık bileşen
  const lab = new Int32Array(w * h).fill(-1);
  let bestId = -1, bestN = 0;
  const st = [];
  for (let s = 0; s < mask.length; s++) {
    if (!mask[s] || lab[s] >= 0) continue;
    let n = 0; st.push(s); lab[s] = s;
    while (st.length) {
      const q = st.pop(); n++;
      const x = q % w, y = (q / w) | 0;
      for (const nb of [x > 0 ? q - 1 : -1, x < w - 1 ? q + 1 : -1, y > 0 ? q - w : -1, y < h - 1 ? q + w : -1]) if (nb >= 0 && mask[nb] && lab[nb] < 0) { lab[nb] = s; st.push(nb); }
    }
    if (n > bestN) { bestN = n; bestId = s; }
  }
  if (bestN < w * h * 0.15 || bestN > w * h * 0.985) return null; // kağıt yok ya da her yer kağıt
  let tl = null, tr = null, br = null, bl = null, a = Infinity, b = -Infinity, c = -Infinity, d = Infinity;
  for (let i = 0; i < lab.length; i++) {
    if (lab[i] !== bestId) continue;
    const x = i % w, y = (i / w) | 0;
    if (x + y < a) { a = x + y; tl = [x, y]; }
    if (x - y > b) { b = x - y; tr = [x, y]; }
    if (x + y > c) { c = x + y; br = [x, y]; }
    if (x - y < d) { d = x - y; bl = [x, y]; }
  }
  return [tl, tr, br, bl];
}

/* ---------- eşikleme, temizlik, inceltme ---------- */
// Bradley uyarlamalı eşik: piksel, çevresinin ortalamasından k oranında koyuysa mürekkep (1)
export function adaptiveThreshold(gray, w, h, win, k = 0.15) {
  const I = new Float64Array((w + 1) * (h + 1));
  for (let y = 0; y < h; y++) {
    let row = 0;
    for (let x = 0; x < w; x++) { row += gray[y * w + x]; I[(y + 1) * (w + 1) + x + 1] = I[y * (w + 1) + x + 1] + row; }
  }
  const r = Math.max(2, win >> 1), out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - r), y1 = Math.min(h, y + r + 1);
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - r), x1 = Math.min(w, x + r + 1);
      const s = I[y1 * (w + 1) + x1] - I[y0 * (w + 1) + x1] - I[y1 * (w + 1) + x0] + I[y0 * (w + 1) + x0];
      const mean = s / ((x1 - x0) * (y1 - y0));
      out[y * w + x] = gray[y * w + x] < mean * (1 - k) && gray[y * w + x] < 225 ? 1 : 0;
    }
  }
  return out;
}
// Bağlı bileşenleri etiketle; küçükleri (yazı, leke) ve kenara değenleri (kağıt kenarı, gölge) at
export function cleanComponents(bin, w, h, minSpan, dropBorder = true) {
  const lab = new Int32Array(w * h).fill(-1), out = new Uint8Array(w * h), st = [], comp = [];
  for (let s = 0; s < bin.length; s++) {
    if (!bin[s] || lab[s] >= 0) continue;
    let minX = w, maxX = 0, minY = h, maxY = 0;
    const px = [];
    st.push(s); lab[s] = s;
    while (st.length) {
      const q = st.pop(); px.push(q);
      const x = q % w, y = (q / w) | 0;
      if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const nb = ny * w + nx;
        if (bin[nb] && lab[nb] < 0) { lab[nb] = s; st.push(nb); }
      }
    }
    const span = Math.max(maxX - minX, maxY - minY);
    const border = minX <= 1 || minY <= 1 || maxX >= w - 2 || maxY >= h - 2;
    const keep = span >= minSpan && !(dropBorder && border && span > Math.max(w, h) * 0.6);
    comp.push({ n: px.length, span, keep, minX, maxX, minY, maxY, px });
    if (keep) for (const q of px) out[q] = 1;
  }
  return { bin: out, comps: comp.length, kept: comp.filter((c) => c.keep).length, list: comp };
}
// Zhang-Suen inceltme (yerinde değil, kopya döner)
export function thin(bin, w, h) {
  const im = new Uint8Array(bin);
  const P = (x, y) => (x < 0 || y < 0 || x >= w || y >= h ? 0 : im[y * w + x]);
  let changed = true;
  const del = [];
  while (changed) {
    changed = false;
    for (let step = 0; step < 2; step++) {
      del.length = 0;
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        if (!im[y * w + x]) continue;
        const p2 = P(x, y - 1), p3 = P(x + 1, y - 1), p4 = P(x + 1, y), p5 = P(x + 1, y + 1), p6 = P(x, y + 1), p7 = P(x - 1, y + 1), p8 = P(x - 1, y), p9 = P(x - 1, y - 1);
        const B = p2 + p3 + p4 + p5 + p6 + p7 + p8 + p9;
        if (B < 2 || B > 6) continue;
        const seq = [p2, p3, p4, p5, p6, p7, p8, p9, p2];
        let A = 0; for (let i = 0; i < 8; i++) if (!seq[i] && seq[i + 1]) A++;
        if (A !== 1) continue;
        if (step === 0 ? (p2 * p4 * p6 || p4 * p6 * p8) : (p2 * p4 * p8 || p2 * p6 * p8)) continue;
        del.push(y * w + x);
      }
      if (del.length) { changed = true; for (const q of del) im[q] = 0; }
    }
  }
  // fazlalık pikselleri sil (iki piksel kalın merdivenler, köşe dirsekleri): komşuları kendi aralarında tek parça
  // kalıyorsa piksel bağlantıyı bozmadan silinebilir. Uç noktalar (tek komşu) korunur.
  const RX = [0, 1, 1, 1, 0, -1, -1, -1], RY = [-1, -1, 0, 1, 1, 1, 0, -1];   // K, KD, D, GD, G, GB, B, KB
  const adjR = (i, j) => { const d = Math.abs(i - j) % 8; const dd = Math.min(d, 8 - d); return dd === 1 || (dd === 2 && i % 2 === 0 && j % 2 === 0); };
  for (let pass = 0; pass < 6; pass++) {
    let ch = 0;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (!im[y * w + x]) continue;
      const on = [];
      for (let k = 0; k < 8; k++) if (P(x + RX[k], y + RY[k])) on.push(k);
      if (on.length < 2) continue;
      // komşular tek bileşen mi
      const seen = new Set([on[0]]), st2 = [on[0]];
      while (st2.length) { const c = st2.pop(); for (const o of on) if (!seen.has(o) && adjR(c, o)) { seen.add(o); st2.push(o); } }
      if (seen.size !== on.length) continue;
      // küçük kapalı halka / dolu blok içini delmemek için: 6+ komşulu pikseller kalsın
      if (on.length > 5) continue;
      im[y * w + x] = 0; ch++;
    }
    if (!ch) break;
  }
  return im;
}

/* ---------- iskelet -> yollar ---------- */
export function tracePaths(sk, w, h) {
  const at = (x, y) => (x >= 0 && y >= 0 && x < w && y < h && sk[y * w + x] ? 1 : 0);
  const nbrs = (q) => {
    const x = q % w, y = (q / w) | 0, out = [];
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if ((dx || dy) && at(x + dx, y + dy)) out.push((y + dy) * w + x + dx);
    return out;
  };
  const deg = new Uint8Array(w * h);
  for (let q = 0; q < sk.length; q++) if (sk[q]) deg[q] = nbrs(q).length;
  const isNode = (q) => deg[q] !== 2;
  const used = new Set();      // kenar anahtarı: küçük-büyük
  const ek = (a, b) => (a < b ? a * 4194304 + b : b * 4194304 + a);
  const visited = new Uint8Array(w * h);
  const paths = [];
  const xy = (q) => [q % w, (q / w) | 0];
  const walk = (start, next) => {
    const path = [xy(start)];
    let prev = start, cur = next;
    used.add(ek(prev, cur));
    for (let guard = 0; guard < w * h; guard++) {
      path.push(xy(cur));
      visited[cur] = 1;
      if (isNode(cur) && cur !== start) break;
      if (cur === start) break;
      const cand = nbrs(cur).filter((n) => n !== prev && !used.has(ek(cur, n)));
      if (!cand.length) break;
      // dik komşuyu çaprazdan önce seç (daha düzgün yol)
      cand.sort((a, b) => (Math.abs(a - cur) === 1 || Math.abs(a - cur) === w ? 0 : 1) - (Math.abs(b - cur) === 1 || Math.abs(b - cur) === w ? 0 : 1));
      const n = cand[0];
      used.add(ek(cur, n));
      prev = cur; cur = n;
    }
    return path;
  };
  for (let q = 0; q < sk.length; q++) {
    if (!sk[q] || !isNode(q) || deg[q] === 0) continue;
    visited[q] = 1;
    for (const n of nbrs(q)) if (!used.has(ek(q, n))) paths.push(walk(q, n));
  }
  // yalnızca kapalı halkalar kaldı (her pikselin iki komşusu var)
  for (let q = 0; q < sk.length; q++) {
    if (!sk[q] || visited[q]) continue;
    const n = nbrs(q).find((m) => !used.has(ek(q, m)));
    visited[q] = 1;
    if (n !== undefined) paths.push(walk(q, n));
  }
  return paths;
}

// Kısa çıkıntıları (iskeletin kenarlarında oluşan kılçıklar) temizle: bir ucu boşta, öbür ucu kavşakta olan kısa dallar silinir
export function pruneSpurs(sk, w, h, maxLen, rounds = 3) {
  const im = new Uint8Array(sk);
  for (let r = 0; r < rounds; r++) {
    const paths = tracePaths(im, w, h);
    const degAt = (x, y) => { let n = 0; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const X = x + dx, Y = y + dy; if ((dx || dy) && X >= 0 && Y >= 0 && X < w && Y < h && im[Y * w + X]) n++; } return n; };
    let removed = 0;
    for (const p of paths) {
      if (p.length > maxLen) continue;
      const [s0, s1] = [p[0], p[p.length - 1]];
      const d0 = degAt(s0[0], s0[1]), d1 = degAt(s1[0], s1[1]);
      if ((d0 === 1 && d1 >= 3) || (d1 === 1 && d0 >= 3)) {
        const keepEnd = d0 >= 3 ? 0 : p.length - 1;
        p.forEach(([x, y], i) => { if (i !== keepEnd) { im[y * w + x] = 0; removed++; } });
      }
    }
    if (!removed) break;
  }
  return im;
}

/* ---------- uydurma ---------- */
function chordDist(p, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy);
  if (L < 1e-9) return Math.hypot(p[0] - a[0], p[1] - a[1]);
  return Math.abs((p[0] - a[0]) * dy - (p[1] - a[1]) * dx) / L;
}
// Kasa en küçük kareler çember uydurma
export function fitCircle(pts) {
  const n = pts.length;
  if (n < 3) return null;
  let mx = 0, my = 0;
  for (const [x, y] of pts) { mx += x; my += y; }
  mx /= n; my /= n;
  let suu = 0, svv = 0, suv = 0, suuu = 0, svvv = 0, suvv = 0, svuu = 0;
  for (const [x, y] of pts) {
    const u = x - mx, v = y - my;
    suu += u * u; svv += v * v; suv += u * v; suuu += u * u * u; svvv += v * v * v; suvv += u * v * v; svuu += v * u * u;
  }
  const det = suu * svv - suv * suv;
  if (Math.abs(det) < 1e-9) return null;
  const b1 = (suuu + suvv) / 2, b2 = (svvv + svuu) / 2;
  const uc = (b1 * svv - b2 * suv) / det, vc = (b2 * suu - b1 * suv) / det;
  const c = [mx + uc, my + vc], r = Math.sqrt(uc * uc + vc * vc + (suu + svv) / n);
  let maxE = 0;
  for (const p of pts) maxE = Math.max(maxE, Math.abs(Math.hypot(p[0] - c[0], p[1] - c[1]) - r));
  return { c, r, maxE };
}
// Yol -> çizgi / yay / daire (aynı birimde tol). Bölerek uydurma.
export function fitPath(pts, tol, maxR = Infinity, depth = 0) {
  const n = pts.length;
  if (n < 2) return [];
  const a = pts[0], b = pts[n - 1];
  const closed = n > 12 && Math.hypot(a[0] - b[0], a[1] - b[1]) <= tol * 2;
  if (closed) {
    const cf = fitCircle(pts);
    if (cf && cf.maxE <= tol * 1.3 && cf.r < maxR && cf.r > tol * 2) return [{ t: 'circle', c: cf.c, r: cf.r }];
  }
  let far = 0, fi = -1;
  for (let i = 1; i < n - 1; i++) { const d = chordDist(pts[i], a, b); if (d > far) { far = d; fi = i; } }
  if (!closed && (far <= tol || n < 4)) return [{ t: 'line', a: a.slice(), b: b.slice() }];
  if (n >= 8 && depth < 30) {
    const cf = fitCircle(pts);
    if (cf && cf.maxE <= tol && cf.r < maxR && cf.r > tol * 2) {
      // kapsadığı açı yeterince büyük olmalı (yoksa çizgi gibi davranır)
      const m = pts[n >> 1];
      const arc = arcFrom3(a, m, b);
      if (arc) {
        const span = normA(arc.a1 - arc.a0);
        if (span > 0.35 && span < TAU - 0.3) return [{ t: 'arc', c: cf.c, r: cf.r, a0: arc.a0, a1: arc.a1, _snap: arc }];
      }
    }
  }
  if (closed && fi < 0) return [];
  if (closed) { // kapalı yolu en uzak noktadan ikiye böl
    let fd = 0, fj = 1;
    for (let i = 1; i < n - 1; i++) { const d = Math.hypot(pts[i][0] - a[0], pts[i][1] - a[1]); if (d > fd) { fd = d; fj = i; } }
    return [...fitPath(pts.slice(0, fj + 1), tol, maxR, depth + 1), ...fitPath(pts.slice(fj), tol, maxR, depth + 1)];
  }
  return [...fitPath(pts.slice(0, fi + 1), tol, maxR, depth + 1), ...fitPath(pts.slice(fi), tol, maxR, depth + 1)];
}

/* ---------- düzgünleştirme ---------- */
const lenOf = (e) => Math.hypot(e.b[0] - e.a[0], e.b[1] - e.a[1]);
export function arcPts(e) { return [[e.c[0] + e.r * Math.cos(e.a0), e.c[1] + e.r * Math.sin(e.a0)], [e.c[0] + e.r * Math.cos(e.a1), e.c[1] + e.r * Math.sin(e.a1)]]; }
function arcMid(e) { const m = e.a0 + normA(e.a1 - e.a0) / 2; return [e.c[0] + e.r * Math.cos(m), e.c[1] + e.r * Math.sin(m)]; }
export function beautify(ents0, tol, angDeg = 5) {
  let ents = ents0.map((e) => JSON.parse(JSON.stringify(e)));
  const angTol = angDeg * Math.PI / 180;
  // 1) uçları kümele (çok kısa çizgiler tek düğüme çöker)
  const P = [];               // { p, ref: [ent, key] }
  const parent = [];
  const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const unite = (i, j) => { parent[find(i)] = find(j); };
  const addP = (p, e, k) => { P.push({ p, e, k }); parent.push(parent.length); return P.length - 1; };
  const ends = new Map();
  for (const e of ents) {
    if (e.t === 'line') { const i = addP(e.a, e, 'a'), j = addP(e.b, e, 'b'); ends.set(e, [i, j]); if (lenOf(e) < tol * 1.5) unite(i, j); }
    else if (e.t === 'arc') { const [s0, s1] = arcPts(e); e._mid = arcMid(e); ends.set(e, [addP(s0, e, 's0'), addP(s1, e, 's1')]); }
  }
  const R = tol * 2;
  for (let i = 0; i < P.length; i++) for (let j = i + 1; j < P.length; j++) {
    if (Math.hypot(P[i].p[0] - P[j].p[0], P[i].p[1] - P[j].p[1]) <= R) unite(i, j);
  }
  const clusters = new Map();
  for (let i = 0; i < P.length; i++) { const r = find(i); if (!clusters.has(r)) clusters.set(r, []); clusters.get(r).push(i); }
  const pos = new Map();
  for (const [r, list] of clusters) pos.set(r, [list.reduce((s, i) => s + P[i].p[0], 0) / list.length, list.reduce((s, i) => s + P[i].p[1], 0) / list.length]);
  // 2) yatay / dikey çizgiler: iki ucun kümesini aynı y (ya da x) değerine getir (birkaç tur)
  const lines = ents.filter((e) => e.t === 'line');
  const hv = lines.map((e) => {
    const [i, j] = ends.get(e), A = pos.get(find(i)), B = pos.get(find(j));
    if (find(i) === find(j)) return null;
    const ang = Math.atan2(B[1] - A[1], B[0] - A[0]);
    const h = Math.abs(Math.sin(ang)) < Math.sin(angTol), v = Math.abs(Math.cos(ang)) < Math.sin(angTol);
    return h ? [find(i), find(j), 1] : v ? [find(i), find(j), 0] : null;
  }).filter(Boolean);
  // yatay ilişkiyle bağlı kümeler aynı y'yi, dikey ilişkiyle bağlı olanlar aynı x'i paylaşır
  for (const k of [0, 1]) {
    const par = new Map();
    const f2 = (a) => { while (par.get(a) !== a) { par.set(a, par.get(par.get(a))); a = par.get(a); } return a; };
    for (const [ci, cj, kk] of hv) { if (kk !== k) continue; for (const c of [ci, cj]) if (!par.has(c)) par.set(c, c); par.set(f2(ci), f2(cj)); }
    const grp = new Map();
    for (const c of par.keys()) { const r = f2(c); if (!grp.has(r)) grp.set(r, []); grp.get(r).push(c); }
    for (const list of grp.values()) { const m = list.reduce((sum, c) => sum + pos.get(c)[k], 0) / list.length; for (const c of list) pos.get(c)[k] = m; }
  }
  // 3) varlıkları yeni uç noktalarıyla kur
  const out = [];
  for (const e of ents) {
    if (e.t === 'circle') { out.push(e); continue; }
    const [i, j] = ends.get(e), A = pos.get(find(i)), B = pos.get(find(j));
    if (e.t === 'line') { if (find(i) !== find(j)) out.push({ t: 'line', a: A.slice(), b: B.slice() }); continue; }
    if (find(i) === find(j)) continue;
    const arc = arcFrom3(A, e._mid, B);
    if (arc) out.push({ t: 'arc', c: arc.c, r: arc.r, a0: arc.a0, a1: arc.a1 }); else out.push({ t: 'line', a: A.slice(), b: B.slice() });
  }
  // 4) aynı doğrultudaki ardışık çizgileri birleştir (yalnızca iki çizginin buluştuğu düğümlerde)
  let merged = true;
  const key = (p) => Math.round(p[0] * 1e4) + ',' + Math.round(p[1] * 1e4);
  while (merged) {
    merged = false;
    const deg = new Map();
    for (const e of out) for (const p of e.t === 'line' ? [e.a, e.b] : e.t === 'arc' ? arcPts(e) : []) deg.set(key(p), (deg.get(key(p)) || 0) + 1);
    outer: for (let i = 0; i < out.length; i++) {
      const e = out[i];
      if (e.t !== 'line') continue;
      for (let j = i + 1; j < out.length; j++) {
        const f = out[j];
        if (f.t !== 'line') continue;
        for (const [pe, qe] of [['a', 'b'], ['b', 'a']]) for (const [pf, qf] of [['a', 'b'], ['b', 'a']]) {
          if (key(e[pe]) !== key(f[pf]) || deg.get(key(e[pe])) !== 2) continue;
          const d1 = [e[pe][0] - e[qe][0], e[pe][1] - e[qe][1]], d2 = [f[qf][0] - f[pf][0], f[qf][1] - f[pf][1]];
          const c = (d1[0] * d2[0] + d1[1] * d2[1]) / (Math.hypot(...d1) * Math.hypot(...d2) || 1);
          if (c < Math.cos(angTol)) continue;
          out[i] = { t: 'line', a: e[qe], b: f[qf] };
          out.splice(j, 1);
          merged = true;
          break outer;
        }
      }
    }
  }
  // 4b) son düzleme: yataya / dikeye yakın çizgileri tam düzle; ortak uçlar (çizgi ve yay) birlikte taşınır
  {
    const nodes = new Map();
    const node = (p) => { const k = key(p); let n = nodes.get(k); if (!n) { n = [p[0], p[1]]; nodes.set(k, n); } return n; };
    const arcInfo = [];
    for (const e of out) {
      if (e.t === 'line') { e.a = node(e.a); e.b = node(e.b); }
      else if (e.t === 'arc') { const [s0, s1] = arcPts(e); arcInfo.push({ e, n0: node(s0), n1: node(s1), mid: arcMid(e) }); }
    }
    for (let pass = 0; pass < 2; pass++) for (const e of out) {
      if (e.t !== 'line') continue;
      const ang = Math.atan2(e.b[1] - e.a[1], e.b[0] - e.a[0]);
      const k = Math.abs(Math.sin(ang)) < Math.sin(angTol) ? 1 : Math.abs(Math.cos(ang)) < Math.sin(angTol) ? 0 : -1;
      if (k < 0) continue;
      const m = (e.a[k] + e.b[k]) / 2; e.a[k] = m; e.b[k] = m;
    }
    for (const ai of arcInfo) { const na = arcFrom3(ai.n0, ai.mid, ai.n1); if (na) Object.assign(ai.e, { c: na.c, r: na.r, a0: na.a0, a1: na.a1 }); }
    for (const e of out) if (e.t === 'line') { e.a = e.a.slice(); e.b = e.b.slice(); }
  }
  // 5) yayın devamındaki kısa çizgiyi yaya kat (yay, teğet giden çizgiye dönüşürken bölünmüş olabilir)
  const kp = (p) => Math.round(p[0] * 1e4) + ',' + Math.round(p[1] * 1e4);
  for (let pass = 0; pass < 4; pass++) {
    let did = false;
    const degN = new Map();
    for (const e of out) for (const q of e.t === 'line' ? [e.a, e.b] : e.t === 'arc' ? arcPts(e) : []) degN.set(kp(q), (degN.get(kp(q)) || 0) + 1);
    for (let i = 0; i < out.length && !did; i++) {
      const A = out[i];
      if (A.t !== 'arc') continue;
      const [s0, s1] = arcPts(A);
      for (let j = 0; j < out.length && !did; j++) {
        const L = out[j];
        if (L.t !== 'line' || lenOf(L) > A.r * 1.2) continue;
        for (const [ae, other] of [[s0, 's0'], [s1, 's1']]) {
          const shared = kp(L.a) === kp(ae) ? 'a' : kp(L.b) === kp(ae) ? 'b' : null;
          if (!shared || degN.get(kp(ae)) !== 2) continue;
          const far = shared === 'a' ? L.b : L.a, mid = [(L.a[0] + L.b[0]) / 2, (L.a[1] + L.b[1]) / 2];
          const on = (q) => Math.abs(Math.hypot(q[0] - A.c[0], q[1] - A.c[1]) - A.r) <= tol * 1.2;
          if (!on(far) || !on(mid)) continue;
          const keep = other === 's0' ? s1 : s0;
          const na = arcFrom3(keep, ae, far) || null;
          if (!na) continue;
          // ae yay üzerinde kalmalı (keep -> ae -> far sırası)
          out[i] = { t: 'arc', c: na.c, r: na.r, a0: na.a0, a1: na.a1 };
          out.splice(j, 1);
          did = true;
          break;
        }
      }
    }
    if (!did) break;
  }
  // 6) bir ucu boşta kalan kısa çıkıntıları at (kapalı şekli bozmasınlar)
  for (let pass = 0; pass < 3; pass++) {
    const degN = new Map();
    for (const e of out) for (const q of e.t === 'line' ? [e.a, e.b] : e.t === 'arc' ? arcPts(e) : []) degN.set(kp(q), (degN.get(kp(q)) || 0) + 1);
    const before = out.length;
    for (let i = out.length - 1; i >= 0; i--) {
      const e = out[i];
      if (e.t !== 'line' || lenOf(e) > tol * 5) continue;
      const da = degN.get(kp(e.a)), db = degN.get(kp(e.b));
      if ((da === 1 && db >= 3) || (db === 1 && da >= 3)) out.splice(i, 1);
    }
    if (out.length === before) break;
  }
  // aynı çemberin yayları: kapsam tamamsa daire
  const arcs = out.filter((e) => e.t === 'arc');
  const usedA = new Set();
  for (let i = 0; i < arcs.length; i++) {
    if (usedA.has(arcs[i])) continue;
    const grp = [arcs[i]];
    for (let j = i + 1; j < arcs.length; j++) {
      const a = arcs[i], b = arcs[j];
      if (!usedA.has(b) && Math.hypot(a.c[0] - b.c[0], a.c[1] - b.c[1]) < tol * 2 && Math.abs(a.r - b.r) < tol * 1.5) grp.push(b);
    }
    if (grp.length < 2) continue;
    const span = grp.reduce((s0, e) => s0 + normA(e.a1 - e.a0), 0);
    if (span > TAU * 0.92) {
      const c = [grp.reduce((s0, e) => s0 + e.c[0], 0) / grp.length, grp.reduce((s0, e) => s0 + e.c[1], 0) / grp.length], r = grp.reduce((s0, e) => s0 + e.r, 0) / grp.length;
      for (const e of grp) usedA.add(e);
      out.push({ t: 'circle', c, r });
    }
  }
  return out.filter((e) => !usedA.has(e) && (e.t !== 'line' || lenOf(e) > tol * 0.5));
}

/* ---------- el yazısı rakamlar (ölçü yazıları) ---------- */
// Bileşenin piksellerini 16x16 girdiye çevirir (eğitimdeki gibi: kutuya kırp, oranı koruyarak 14 px'e sığdır, ortala)
// rot: yazının döndürülme açısı (0, 90 = saat yönünde yan yazı, 180, 270); glif okuma yönüne çevrilir
export function glyphVector(c, w, rot = 0) {
  const W0 = c.maxX - c.minX + 1, H0 = c.maxY - c.minY + 1, sw = rot === 90 || rot === 270;
  const gw = sw ? H0 : W0, gh = sw ? W0 : H0;
  const g = new Float32Array(gw * gh);
  for (const q of c.px) {
    const x = q % w, y = (q / w) | 0;
    const u = rot === 90 ? y - c.minY : rot === 270 ? c.maxY - y : rot === 180 ? c.maxX - x : x - c.minX;
    const v = rot === 90 ? c.maxX - x : rot === 270 ? x - c.minX : rot === 180 ? c.maxY - y : y - c.minY;
    g[v * gw + u] = 1;
  }
  const k = 14 / Math.max(gw, gh), nw = Math.max(1, Math.round(gw * k)), nh = Math.max(1, Math.round(gh * k));
  const out = new Float32Array(256), ox = (16 - nw) >> 1, oy = (16 - nh) >> 1;
  const kx = gw / nw, ky = gh / nh;   // hedef pikselin kaynakta kapladığı alan (alan ortalaması)
  for (let y = 0; y < nh; y++) for (let x = 0; x < nw; x++) {
    const x0 = x * kx, x1 = (x + 1) * kx, y0 = y * ky, y1 = (y + 1) * ky;
    let sum = 0, area = 0;
    for (let yy = Math.floor(y0); yy < Math.ceil(y1); yy++) for (let xx = Math.floor(x0); xx < Math.ceil(x1); xx++) {
      if (xx < 0 || yy < 0 || xx >= gw || yy >= gh) continue;
      const a = (Math.min(x1, xx + 1) - Math.max(x0, xx)) * (Math.min(y1, yy + 1) - Math.max(y0, yy));
      if (a > 0) { sum += g[yy * gw + xx] * a; area += a; }
    }
    out[(oy + y) * 16 + ox + x] = area ? sum / area : 0;
  }
  let m = 0; for (const v of out) m = Math.max(m, v);
  if (m > 0) for (let i = 0; i < 256; i++) out[i] /= m;
  return out;
}
export function classifyDigit(vec) {
  const N = DIGIT_NET, H = new Float32Array(N.n_h);
  for (let j = 0; j < N.n_h; j++) { let z = N.b1[j]; for (let i = 0; i < 256; i++) if (vec[i]) z += vec[i] * N.W1[i * N.n_h + j]; H[j] = z > 0 ? z : 0; }
  const K = N.n_out || 10, o = new Float32Array(K);   // 0–9 rakam, 10 = yan / ters glif (rakam değil), 11 = Ø
  for (let c = 0; c < K; c++) { let z = N.b2[c]; for (let j = 0; j < N.n_h; j++) z += H[j] * N.W2[j * K + c]; o[c] = z; }
  let mx = -Infinity; for (const v of o) mx = Math.max(mx, v);
  let sum = 0; for (let c = 0; c < K; c++) { o[c] = Math.exp(o[c] - mx); sum += o[c]; }
  let best = 0; for (let c = 1; c < K; c++) if (o[c] > o[best]) best = c;
  return { d: best, p: o[best] / sum };
}
// okuma çerçevesine göre kutu (X okuma yönü, Y glif aşağısı)
const rbox = (c, rot) => rot === 90 ? { minX: c.minY, maxX: c.maxY, minY: -c.maxX, maxY: -c.minX } : rot === 270 ? { minX: -c.maxY, maxX: -c.minY, minY: c.minX, maxY: c.maxX } : rot === 180 ? { minX: -c.maxX, maxX: -c.minX, minY: -c.maxY, maxY: -c.minY } : c;
function numbersAt(list, maxDim, rot) {
  const hMin = maxDim * 0.008, hMax = maxDim * 0.07;
  const B = new Map(list.map((c) => [c, rbox(c, rot)]));
  const cand = list.filter((c) => { const b = B.get(c), gh = b.maxY - b.minY + 1, gw = b.maxX - b.minX + 1; return gh >= hMin && gh <= hMax && gw <= gh * 1.3 && c.n >= 6; });
  const dots = list.filter((c) => Math.max(c.maxX - c.minX, c.maxY - c.minY) + 1 < hMin * 1.2 && c.n >= 2);
  cand.sort((a, b) => B.get(a).minX - B.get(b).minX);
  const used = new Array(cand.length).fill(false), groups = [];
  for (let i = 0; i < cand.length; i++) {
    if (used[i]) continue;
    used[i] = true;
    const g = [cand[i]];
    for (let j = i + 1; j < cand.length; j++) {
      if (used[j]) continue;
      const last = B.get(g[g.length - 1]), c = B.get(cand[j]);
      const h1 = last.maxY - last.minY + 1, h2 = c.maxY - c.minY + 1, hh = Math.max(h1, h2);
      const ov = Math.min(last.maxY, c.maxY) - Math.max(last.minY, c.minY);
      if (c.minX - last.maxX > hh * 0.9) break;
      if (ov < Math.min(h1, h2) * 0.5 || h1 / h2 > (g.length === 1 ? 2.6 : 2) || h2 / h1 > 2) continue;   // ilk glif Ø olabilir (büyük)
      used[j] = true; g.push(cand[j]);
    }
    groups.push(g);
  }
  const texts = [];
  for (let g of groups) {
    let s = '', conf = 1, dia = false;
    const g0 = g;   // Ø işareti dahil tüm bileşenler (aynı glif başka okumada tekrar kullanılmasın)
    const cls = g.map((c) => classifyDigit(glyphVector(c, c.w, rot)));
    // Ø işareti: ilk glif Ø sınıfı (ya da "0" / belirgin büyük halka) → çap işareti
    if (g.length >= 2) {
      const hs = g.map((c) => { const b = B.get(c); return b.maxY - b.minY + 1; }), rest = hs.slice(1).sort((a, b) => a - b)[(hs.length - 1) >> 1];
      const b0 = B.get(g[0]), fat1 = cls[0].d === 1 && (b0.maxX - b0.minX + 1) > (b0.maxY - b0.minY + 1) * 0.6;   // "1" bu kadar geniş olmaz: Ø
      if (cls[0].d === 11 || cls[0].d === 0 || fat1 || (hs[0] > rest * 1.25 && hasHole(g[0], 1) && !(cls[0].d >= 1 && cls[0].d <= 9 && cls[0].d !== 6 && cls[0].d !== 9 && cls[0].d !== 8 && cls[0].p > 0.97))) { dia = true; g = g.slice(1); cls.shift(); }
    }
    for (let k = 0; k < cls.length; k++) if (cls[k].d === 11) cls[k] = { d: 0, p: hasHole(g[k], 1) ? Math.max(cls[k].p, 0.9) : cls[k].p };   // baştaki dışında Ø yok: halka biçimli "0"
    // basık / yatık yazılmış "0": içi boş, yuvarlağa yakın glif reddedilmişse 0 say (rakam grubunun içinde)
    if (g.length >= 2) for (let k = 1; k < g.length; k++) if (cls[k].d === 10 && cls[k].p < 0.95) { const b = B.get(g[k]), r = (b.maxX - b.minX + 1) / (b.maxY - b.minY + 1); if (r > 0.45 && r < 1.8 && hasHole(g[k], 1)) cls[k] = { d: 0, p: 0.85 }; }
    if (cls.some((c) => c.d === 10)) continue;   // yan / ters glif: bu yönde okunmaz
    for (let k = 0; k < g.length; k++) {
      s += cls[k].d; conf *= cls[k].p;
      if (k + 1 < g.length) {
        const a = B.get(g[k]), b2 = B.get(g[k + 1]), hh = Math.max(a.maxY - a.minY, b2.maxY - b2.minY) + 1;
        if (dots.some((d0) => { const d = rbox(d0, rot); return d.minX >= a.maxX - 1 && d.maxX <= b2.minX + 1 && d.minY > a.minY + hh * 0.55; })) s += ',';
      }
    }
    if (!g.length) continue;
    const box = { minX: Math.min(...g.map((c) => c.minX)), maxX: Math.max(...g.map((c) => c.maxX)), minY: Math.min(...g.map((c) => c.minY)), maxY: Math.max(...g.map((c) => c.maxY)) };
    if (g.length === 1 && (s === '0' || s === '1') && !dia) continue;          // küçük daire / kısa çizgiyle karışır
    if (conf < Math.pow(0.8, g.length) || /^0\d/.test(s)) continue;
    const value = parseFloat(s.replace(',', '.'));
    if (!(value > 0)) continue;
    const ch = g.map((c) => { const b = B.get(c); return b.maxY - b.minY + 1; });
    texts.push({ s, value, box, conf, rot, dia, comps: g0, nd: g.length, gh: Math.max(...ch) });
  }
  return texts;
}
// Bileşenlerden sayı grupları bulur (yatay ve yan yazılmış: 0°, 90°, 270°, 180°). Aynı bileşen tek okumaya girer: güven × uzunlukça en iyisi seçilir.
// Dönüş: { texts: [{ s, value, box, conf, rot, dia }], used: Set(bileşen) }
export function findNumbers(list, maxDim, rots = [0, 90, 270, 180]) {
  const all = [];
  for (const rot of rots) for (const t of numbersAt(list, maxDim, rot)) all.push(t);
  const base = (t) => Math.pow(t.conf, 1 / t.nd) * (1 + 0.5 * (t.nd - 1));
  // baskın yazı yönü: güvenilir çok haneli okumaların oylaması (bir çizimdeki ölçüler çoğunlukla aynı yönde yazılır)
  const vote = new Map();
  for (const t of all) if (t.nd >= 2 && t.conf > 0.85) vote.set(t.rot, (vote.get(t.rot) || 0) + base(t));
  let dom = 0, dv = 0; for (const [r, v] of vote) if (v > dv) { dv = v; dom = r; }
  const score = (t) => base(t) * (t.rot === dom ? 1.4 : t.rot === 0 ? 1 : 0.75);
  // ters (180°) okuma ancak çizimin baskın yönü de tersse geçerli; aksi halde 6↔9 karışmaları üretir. Baskının tam tersi yön de atılır.
  const opp = (dom + 180) % 360;
  for (let i = all.length - 1; i >= 0; i--) { const r = all[i].rot; if ((r === 180 && dom !== 180) || (r === opp && dom !== 0 && all[i].conf < 0.97)) all.splice(i, 1); }
  all.sort((a, b) => score(b) - score(a));
  const usedSet = new Set(), texts = [];
  for (const t of all) {
    if (t.comps.some((c) => usedSet.has(c))) continue;
    for (const c of t.comps) usedSet.add(c);
    texts.push(t);
  }
  // tek başına duran Ø işareti: deliği olan glif, sayının hemen önünde (okuma yönünde) → çap
  const hMin = maxDim * 0.008, hMax = maxDim * 0.09;
  for (const t of texts) {
    if (t.dia) continue;
    const tb = rbox(t.box, t.rot), th = tb.maxY - tb.minY + 1;
    const pre = list.find((c) => {
      if (usedSet.has(c) && !t.comps.includes(c)) { const other = texts.find((o) => o !== t && o.comps.includes(c)); if (!other || other.nd > 1) return false; }
      if (t.comps.includes(c)) return false;
      const b = rbox(c, t.rot), gh = b.maxY - b.minY + 1, gw = b.maxX - b.minX + 1;
      if (gh < hMin || gh > hMax || gw > gh * 1.8 || gh > th * 2.2) return false;
      const gap = tb.minX - b.maxX, ov = Math.min(b.maxY, tb.maxY) - Math.max(b.minY, tb.minY);
      return gap > -th * 0.3 && gap < th * 1.6 && ov > Math.min(gh, th) * 0.4 && (classifyDigit(glyphVector(c, c.w, t.rot)).d === 11 || hasHole(c));
    });
    if (pre) {
      t.dia = true;
      const other = texts.find((o) => o !== t && o.comps.includes(pre)); if (other) other.drop = true;
      usedSet.add(pre); t.box = { minX: Math.min(t.box.minX, pre.minX), maxX: Math.max(t.box.maxX, pre.maxX), minY: Math.min(t.box.minY, pre.minY), maxY: Math.max(t.box.maxY, pre.maxY) };
    }
  }
  return { texts: texts.filter((t) => !t.drop).map((t) => ({ s: t.s, value: t.value, box: t.box, conf: t.conf, rot: t.rot, dia: t.dia })), used: usedSet, dominant: dom };
}
// bileşenin içinde kapalı boşluk var mı (0, 6, 8, 9, Ø, halka)
export function hasHole(c, dil = 0) {
  const gw = c.maxX - c.minX + 3 + 2 * dil, gh = c.maxY - c.minY + 3 + 2 * dil, m = new Uint8Array(gw * gh);
  for (const q of c.px) { const x = q % c.w - c.minX + 1 + dil, y = ((q / c.w) | 0) - c.minY + 1 + dil; for (let dy = -dil; dy <= dil; dy++) for (let dx = -dil; dx <= dil; dx++) m[(y + dy) * gw + x + dx] = 1; }
  const st = [0]; m[0] = 2;
  while (st.length) { const q = st.pop(), x = q % gw, y = (q / gw) | 0; for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= gw || ny >= gh) continue; const k = ny * gw + nx; if (!m[k]) { m[k] = 2; st.push(k); } } }
  let holes = 0; for (let i = 0; i < m.length; i++) if (!m[i]) holes++;
  return holes >= Math.max(4, (gw * gh) * 0.03);
}
export function otsu(gray) {
  const hist = new Float64Array(256); for (const v of gray) hist[v]++;
  const N = gray.length; let sum = 0; for (let i = 0; i < 256; i++) sum += i * hist[i];
  let sB = 0, wB = 0, best = 0, T = 128;
  for (let t = 0; t < 256; t++) { wB += hist[t]; if (!wB) continue; const wF = N - wB; if (!wF) break; sB += t * hist[t]; const mB = sB / wB, mF = (sum - sB) / wF, v = wB * wF * (mB - mF) ** 2; if (v > best) { best = v; T = t; } }
  return T;
}
/* ---------- tüm akış ---------- */
// gray: düzeltilmiş kağıt görüntüsü (w × h). mmPerPx: ölçek. Dönüş: { ents (mm, Y yukarı), stats }
export function vectorize(gray, w, h, opts = {}) {
  const k = opts.sens ?? 0.15;
  const maxDim = Math.max(w, h);
  let bin;
  if (opts.ink) {   // mürekkep haritası (inkGray): gölgesiz → tek eşik (Otsu); hassasiyet eşiği kaydırır
    const T = Math.min(185, Math.max(50, otsu(gray) * (0.7 + 2 * k)));
    bin = new Uint8Array(w * h); for (let i = 0; i < bin.length; i++) bin[i] = gray[i] < T ? 1 : 0;
  } else bin = adaptiveThreshold(gray, w, h, Math.max(15, Math.round(maxDim / 14)) | 1, k);
  const cl = cleanComponents(bin, w, h, Math.max(4, maxDim * (opts.minSpan ?? 0.03)), opts.dropBorder !== false);
  if (opts.ink) {
    // kağıt kenarına değen lekeler (köşe gölgesi) ve kenar boşluğundaki küçük basılı yazılar (sayfa / satır numarası) atılır
    const mx = w * 0.075, my = h * 0.05;
    for (const c of cl.list) {
      const touch = c.minX <= 1 || c.minY <= 1 || c.maxX >= w - 2 || c.maxY >= h - 2;
      const inMargin = (c.maxX < mx || c.minX > w - mx || c.maxY < my || c.minY > h - my) && c.span < maxDim * 0.05;
      // tamamen kağıt kenarına yapışık bantta kalan (köşe biraz içeriden seçilince kalan kağıt kenarı / gölge çizgisi)
      const bx = w * 0.025, by = h * 0.025;
      const edgeBand = c.maxX < bx || c.minX > w - bx || c.maxY < by || c.minY > h - by;
      if (touch || inMargin || edgeBand) { if (c.keep) for (const q of c.px) cl.bin[q] = 0; c.keep = false; c.drop = true; }
    }
    cl.list = cl.list.filter((c) => !c.drop);
  }
  // ölçü rakamları: küçük ve orta boy bileşenlere bakılır; rakam olanlar çizimden çıkarılır
  let texts = [];
  if (opts.readNumbers !== false) {
    for (const c of cl.list) c.w = w;
    const fn = findNumbers(cl.list, maxDim);
    for (const c of fn.used) if (c.keep) for (const q of c.px) cl.bin[q] = 0;
    texts = fn.texts;
  }
  const sk = pruneSpurs(thin(cl.bin, w, h), w, h, Math.max(6, maxDim * 0.02));
  const paths = tracePaths(sk, w, h).filter((p) => p.length >= 3);
  const s = opts.mmPerPx || 1;
  const tolPx = Math.max(1.5, maxDim * (opts.tol ?? 0.008));
  const ents = [];
  for (const p of paths) {
    const pts = p.map(([x, y]) => [x * s, (h - 1 - y) * s]);
    ents.push(...fitPath(pts, tolPx * s, maxDim * s * 2));
  }
  const clean = opts.beautify === false ? ents : beautify(ents, tolPx * s, opts.angDeg ?? 5);
  const tx = texts.map((t) => ({ s: t.s, value: t.value, conf: t.conf, rot: t.rot || 0, dia: !!t.dia, p: [((t.box.minX + t.box.maxX) / 2) * s, (h - 1 - (t.box.minY + t.box.maxY) / 2) * s], h: (t.box.maxY - t.box.minY + 1) * s, box: t.box }));
  return { ents: clean, texts: tx, stats: { comps: cl.comps, kept: cl.kept, paths: paths.length, raw: ents.length, out: clean.length, numbers: tx.length } };
}
