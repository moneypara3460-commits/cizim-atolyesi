// Kalıp fotoğrafından ölçülü kalıp çizgisi (saf fonksiyonlar; testlerde Node'da çalışır).
// Akış: A4/A3 kâğıdı bul → perspektifi düzelt (kâğıt düz dikdörtgen olur, ölçek bilinir) →
// kâğıt renginden farklı olan en büyük nesne = kalıp → dış çizgisini izle → mm'ye çevir → sadeleştir.
// Kalıp beyaz/açık renkliyse renkli (ör. mavi) kâğıt kullanılır: ayırma gri değil renk farkıyla yapılır.
import { toGray, homography } from '../photo2d.js?v=20261112u';
import * as G from './geom.js?v=20261119c';

export const PAPERS = { A4: [297, 210], A3: [420, 297] };
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const applyH = (H, x, y) => { const d = H[6] * x + H[7] * y + H[8]; return [(H[0] * x + H[1] * y + H[2]) / d, (H[3] * x + H[4] * y + H[5]) / d]; };

// Kâğıt köşeleri: açık renkli büyük bölgeler (kalıp kâğıdı ikiye bölse bile parçalar birlikte sayılır).
export function findPaper(gray, w, h) {
  const hist = new Array(256).fill(0); for (const v of gray) hist[v]++;
  const th = otsu(hist, gray.length);
  const lab = new Int32Array(w * h).fill(-1), sizes = new Map(), st = [];
  for (let s = 0; s < gray.length; s++) {
    if (gray[s] <= th || lab[s] >= 0) continue;
    let n = 0; st.push(s); lab[s] = s;
    while (st.length) {
      const q = st.pop(); n++;
      const x = q % w, y = (q / w) | 0;
      if (x > 0 && gray[q - 1] > th && lab[q - 1] < 0) { lab[q - 1] = s; st.push(q - 1); }
      if (x < w - 1 && gray[q + 1] > th && lab[q + 1] < 0) { lab[q + 1] = s; st.push(q + 1); }
      if (y > 0 && gray[q - w] > th && lab[q - w] < 0) { lab[q - w] = s; st.push(q - w); }
      if (y < h - 1 && gray[q + w] > th && lab[q + w] < 0) { lab[q + w] = s; st.push(q + w); }
    }
    sizes.set(s, n);
  }
  let big = 0; for (const n of sizes.values()) big = Math.max(big, n);
  const keep = new Set([...sizes].filter(([, n]) => n >= big * 0.2 && n >= w * h * 0.03).map(([id]) => id));
  let total = 0; for (const id of keep) total += sizes.get(id);
  if (total < w * h * 0.15 || total > w * h * 0.985) return null;
  let tl = null, tr = null, br = null, bl = null, a = Infinity, b = -Infinity, c = -Infinity, d = Infinity;
  for (let i = 0; i < lab.length; i++) {
    if (!keep.has(lab[i])) continue;
    const x = i % w, y = (i / w) | 0;
    if (x + y < a) { a = x + y; tl = [x, y]; }
    if (x - y > b) { b = x - y; tr = [x, y]; }
    if (x + y > c) { c = x + y; br = [x, y]; }
    if (x - y < d) { d = x - y; bl = [x, y]; }
  }
  return [tl, tr, br, bl];
}

// Kâğıdı bulup düz dikdörtgene çevirir; uzun kenar yatay. k: mm başına piksel.
export function rectify(rgba, w, h, paper = 'A4', k = 3) {
  const quad = findPaper(toGray(rgba, w, h), w, h);
  if (!quad || quad.some((q) => !q)) return null;
  let [tl, tr, br, bl] = quad;
  if (dist(tl, bl) + dist(tr, br) > dist(tl, tr) + dist(bl, br)) [tl, tr, br, bl] = [bl, tl, tr, br];   // dikey kâğıt: 90° çevir
  const [Lmm, Smm] = PAPERS[paper] || PAPERS.A4;
  const ow = Math.round(Lmm * k), oh = Math.round(Smm * k);
  const H = homography([[0, 0], [ow - 1, 0], [ow - 1, oh - 1], [0, oh - 1]], [tl, tr, br, bl]);
  if (!H) return null;
  const out = new Uint8ClampedArray(ow * oh * 4).fill(255);
  for (let y = 0; y < oh; y++) for (let x = 0; x < ow; x++) {
    const [u, v] = applyH(H, x, y);
    if (!(u >= 0 && v >= 0 && u <= w - 1 && v <= h - 1)) continue;
    const x0 = Math.floor(u), y0 = Math.floor(v), x1 = Math.min(x0 + 1, w - 1), y1 = Math.min(y0 + 1, h - 1), fx = u - x0, fy = v - y0;
    const o = (y * ow + x) * 4;
    for (let c = 0; c < 3; c++) {
      const a = rgba[(y0 * w + x0) * 4 + c], b = rgba[(y0 * w + x1) * 4 + c], d = rgba[(y1 * w + x0) * 4 + c], e = rgba[(y1 * w + x1) * 4 + c];
      out[o + c] = (a * (1 - fx) + b * fx) * (1 - fy) + (d * (1 - fx) + e * fx) * fy;
    }
  }
  const sides = [dist(tl, tr), dist(tr, br), dist(br, bl), dist(bl, tl)];
  const ratio = (sides[0] + sides[2]) / (sides[1] + sides[3]);
  const warnings = [];
  if (Math.abs(ratio - Lmm / Smm) > 0.45) warnings.push('Kâğıdın oranı ' + (paper || 'A4') + ' ile uyuşmuyor: kâğıt boyutunu kontrol et ya da fotoğrafı daha tepeden çek.');
  return { rgba: out, w: ow, h: oh, k, paper, quad: [tl, tr, br, bl], warnings };
}

function otsu(hist, n) {
  let sum = 0; for (let i = 0; i < hist.length; i++) sum += i * hist[i];
  let sB = 0, wB = 0, best = -1, th = 0;
  for (let t = 0; t < hist.length; t++) {
    wB += hist[t]; if (!wB) continue;
    const wF = n - wB; if (!wF) break;
    sB += t * hist[t];
    const v = wB * wF * (sB / wB - (sum - sB) / wF) ** 2;
    if (v > best) { best = v; th = t; }
  }
  return th;
}
const median = (a) => { const s = a.slice().sort((x, y) => x - y); return s[s.length >> 1] ?? 255; };

function morph(mask, w, h, r, grow) {
  // ayrık kare yapı elemanı: önce yatay sonra dikey geçiş
  const tmp = new Uint8Array(mask.length), out = new Uint8Array(mask.length);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let v = grow ? 0 : 1;
    for (let d = -r; d <= r; d++) { const xx = x + d; const m = xx < 0 || xx >= w ? 0 : mask[y * w + xx]; if (grow ? m : !m) { v = grow ? 1 : 0; break; } }
    tmp[y * w + x] = v;
  }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let v = grow ? 0 : 1;
    for (let d = -r; d <= r; d++) { const yy = y + d; const m = yy < 0 || yy >= h ? 0 : tmp[yy * w + x]; if (grow ? m : !m) { v = grow ? 1 : 0; break; } }
    out[y * w + x] = v;
  }
  return out;
}

// En büyük bağlı bileşen, içindeki delikler doldurulmuş. Dönen: { mask, n, outside (dışarıdan ulaşılan boşluk) }
function largestFilled(mask, w, h) {
  const lab = new Int32Array(w * h).fill(-1), st = [];
  let bestId = -1, bestN = 0;
  for (let s = 0; s < mask.length; s++) {
    if (!mask[s] || lab[s] >= 0) continue;
    let n = 0; st.push(s); lab[s] = s;
    while (st.length) {
      const q = st.pop(); n++;
      const x = q % w, y = (q / w) | 0;
      if (x > 0 && mask[q - 1] && lab[q - 1] < 0) { lab[q - 1] = s; st.push(q - 1); }
      if (x < w - 1 && mask[q + 1] && lab[q + 1] < 0) { lab[q + 1] = s; st.push(q + 1); }
      if (y > 0 && mask[q - w] && lab[q - w] < 0) { lab[q - w] = s; st.push(q - w); }
      if (y < h - 1 && mask[q + w] && lab[q + w] < 0) { lab[q + w] = s; st.push(q + w); }
    }
    if (n > bestN) { bestN = n; bestId = s; }
  }
  const obj = new Uint8Array(w * h), seen = new Uint8Array(w * h);
  if (bestId < 0) return { mask: obj, n: 0, outside: seen };
  for (let i = 0; i < obj.length; i++) obj[i] = lab[i] === bestId ? 1 : 0;
  // delikleri doldur: dışarıdan ulaşılamayan boşluklar nesneye katılır
  for (let x = 0; x < w; x++) for (const y of [0, h - 1]) if (!obj[y * w + x] && !seen[y * w + x]) { seen[y * w + x] = 1; st.push(y * w + x); }
  for (let y = 0; y < h; y++) for (const x of [0, w - 1]) if (!obj[y * w + x] && !seen[y * w + x]) { seen[y * w + x] = 1; st.push(y * w + x); }
  while (st.length) {
    const q = st.pop(), x = q % w, y = (q / w) | 0;
    for (const nb of [x > 0 ? q - 1 : -1, x < w - 1 ? q + 1 : -1, y > 0 ? q - w : -1, y < h - 1 ? q + w : -1]) if (nb >= 0 && !obj[nb] && !seen[nb]) { seen[nb] = 1; st.push(nb); }
  }
  let n = 0;
  for (let i = 0; i < obj.length; i++) { obj[i] = seen[i] ? 0 : 1; n += obj[i]; }
  return { mask: obj, n, outside: seen };
}
const lum = (rgba, i) => 0.299 * rgba[i * 4] + 0.587 * rgba[i * 4 + 1] + 0.114 * rgba[i * 4 + 2];
// Maske iyileştirme (16.11.2026 denemesinde kalıp çizgisi gölgeyi ve mat çizgilerini izliyordu):
// 1) açık renkli kalıpta zemin tonunda koyu pikseller (ya da çok koyu olanlar) gölgedir → çıkarılır;
// 2) ~1,6 mm'den ince çıkıntılar (mat çizgisi) açma ile silinir, kapama ile kenar geri gelir;
// 3) yeniden en büyük bileşen + delik doldurma (kalıbın üstündeki delik, yazı).
function refine(mask, rgba, w, h, k, paper) {
  const pl = 0.299 * paper[0] + 0.587 * paper[1] + 0.114 * paper[2], L = [], C = [];
  const chr = (i) => { const r = rgba[i * 4], g = rgba[i * 4 + 1], b = rgba[i * 4 + 2], t = r + g + b + 1; return [r / t, g / t, b / t]; };
  const pc = (() => { const t = paper[0] + paper[1] + paper[2] + 1; return [paper[0] / t, paper[1] / t, paper[2] / t]; })();
  const cd = (c) => Math.hypot(c[0] - pc[0], c[1] - pc[1], c[2] - pc[2]);
  for (let i = 0; i < mask.length; i += 7) if (mask[i]) { L.push(lum(rgba, i)); C.push(cd(chr(i))); }
  const ol = median(L), oc = median(C);
  let m = mask;
  if (ol > pl * 1.15 + 8) {
    // açık renkli kalıp: gölge, zeminin koyulaşmış hâlidir (renk tonu zemine yakın) ya da çok koyudur.
    // Kalıbın gölgede kalan yüzü kendi renk tonunu korur → silinmez.
    m = new Uint8Array(mask);
    const lim = Math.min(pl * 0.9, (pl + ol) / 2);
    for (let i = 0; i < m.length; i++) {
      if (!m[i]) continue;
      const l = lum(rgba, i);
      if (l < lim && (l < pl * 0.45 || cd(chr(i)) < 0.5 * oc)) m[i] = 0;
    }
  }
  const pre = largestFilled(m, w, h).mask;   // gölge çıktıktan sonra kapalı kalan delikler (kalıp üstündeki delik) doldurulur
  const r = Math.max(1, Math.round(0.8 * k));
  m = morph(morph(pre, w, h, r, false), w, h, r, true);   // açma: mat çizgisi gibi ince çıkıntılar
  m = morph(morph(m, w, h, r, true), w, h, r, false);     // kapama: kenar girintileri
  const res = largestFilled(m, w, h);
  return res.n > 0.5 * mask.reduce((a, b) => a + b, 0) ? res : largestFilled(mask, w, h);   // aşırı silindiyse eskisi
}

// Kâğıt renginden ayrılan en büyük nesnenin maskesi (delikleri doldurulmuş). sens: -5 (az) … +5 (çok hassas)
export function segment(rec, sens = 0) {
  const { rgba, w, h, k } = rec;
  const m = Math.max(2, Math.round(2.5 * k));   // kâğıt kenarındaki gölgeyi yok say
  // kâğıt rengi: kenar şeridinin ortancası
  const R = [], Gr = [], B = [];
  const band = Math.round(8 * k);
  for (let y = m; y < h - m; y += 2) for (let x = m; x < w - m; x += 2) {
    if (x > band && x < w - band && y > band && y < h - band) continue;
    const o = (y * w + x) * 4; R.push(rgba[o]); Gr.push(rgba[o + 1]); B.push(rgba[o + 2]);
  }
  const pr = median(R), pg = median(Gr), pb = median(B);
  const d = new Uint8Array(w * h), hist = new Array(256).fill(0);
  for (let i = 0, o = 0; i < d.length; i++, o += 4) {
    const v = rec.dist ? rec.dist(rgba[o], rgba[o + 1], rgba[o + 2], pr, pg, pb) : Math.min(255, Math.round(Math.hypot(rgba[o] - pr, rgba[o + 1] - pg, rgba[o + 2] - pb) * 0.75));
    d[i] = v; hist[v]++;
  }
  let th = rec.th ?? otsu(hist, d.length);
  th = Math.max(12, Math.min(200, Math.round(th * (1 - 0.08 * sens))));
  let mask = new Uint8Array(w * h);
  for (let y = m; y < h - m; y++) for (let x = m; x < w - m; x++) mask[y * w + x] = d[y * w + x] > th ? 1 : 0;
  const r = Math.max(1, Math.round(0.7 * k));
  mask = morph(morph(mask, w, h, r, true), w, h, r, false);   // kapama: küçük boşlukları kapat
  mask = morph(morph(mask, w, h, 1, false), w, h, 1, true);   // açma: tozu sil
  let obj = largestFilled(mask, w, h);
  if (!obj.n) return { mask: obj.mask, area: 0, paper: [pr, pg, pb], th };
  if (rec.dist) obj = refine(obj.mask, rgba, w, h, k, [pr, pg, pb]);   // kesim matı: gölge ve ızgara çizgisi temizliği
  const seen = obj.outside, out = new Uint8Array(w * h);
  let area = 0;
  for (let i = 0; i < out.length; i++) { out[i] = seen[i] ? 0 : 1; area += out[i]; }
  return { mask: out, area, paper: [pr, pg, pb], th };
}

// Moore komşuluğuyla dış sınır izleme → piksel noktaları (saat yönü, ekran koordinatı)
export function traceBoundary(mask, w, h) {
  let start = -1;
  for (let i = 0; i < mask.length; i++) if (mask[i]) { start = i; break; }
  if (start < 0) return [];
  const DX = [1, 1, 0, -1, -1, -1, 0, 1], DY = [0, 1, 1, 1, 0, -1, -1, -1];
  const at = (x, y) => x >= 0 && y >= 0 && x < w && y < h && mask[y * w + x] === 1;
  const sx = start % w, sy = (start / w) | 0;
  const pts = [[sx, sy]];
  let x = sx, y = sy, dir = 7, guard = 0;
  const limit = 4 * (w + h) * 8 + mask.length / 4;
  do {
    let found = false;
    for (let i = 0; i < 8; i++) {
      const nd = (dir + 6 + i) % 8;   // önceki yönün solundan başla
      const nx = x + DX[nd], ny = y + DY[nd];
      if (at(nx, ny)) { x = nx; y = ny; dir = nd; found = true; break; }
    }
    if (!found) break;   // tek piksel
    if (x === sx && y === sy) break;
    pts.push([x, y]);
  } while (++guard < limit);
  return pts;
}

// Piksel basamağını ve kenar gürültüsünü gider: döngü eşit aralıkla (step mm) yeniden örneklenir, sonra dairesel
// Gauss ortalaması (sigma mm) büzülme düzeltmesiyle uygulanır (yalın Gauss'ta R yarıçaplı kavis ≈ sigma² / (2R) içe kayardı).
export function smoothLoop(pts, step = 0.5, sigma = 1.2) {
  const n0 = pts.length;
  if (n0 < 8) return pts.slice();
  let per = 0;
  for (let i = 0; i < n0; i++) per += dist(pts[i], pts[(i + 1) % n0]);
  const N = Math.max(16, Math.round(per / step)), ds = per / N, R = [];
  let i = 0, acc = 0, segL = dist(pts[0], pts[1 % n0]);
  for (let s = 0; s < N; s++) {
    const t = s * ds;
    while (acc + segL < t && i < n0 - 1) { acc += segL; i++; segL = dist(pts[i], pts[(i + 1) % n0]); }
    const u = segL > 0 ? (t - acc) / segL : 0, a = pts[i], b = pts[(i + 1) % n0];
    R.push([a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u]);
  }
  const rad = Math.max(1, Math.round((3 * sigma) / ds)), W = [];
  for (let j = -rad; j <= rad; j++) W.push(Math.exp(-((j * ds) ** 2) / (2 * sigma * sigma)));
  const ws = W.reduce((x, y) => x + y, 0);
  const blur = (A) => A.map((_, s) => {
    let x = 0, y = 0;
    for (let j = -rad; j <= rad; j++) { const q = A[(s + j + N) % N], wj = W[j + rad]; x += q[0] * wj; y += q[1] * wj; }
    return [x / ws, y / ws];
  });
  // büzülme düzeltmesi (2G − G∘G): ince tırtık yine silinir, geniş kavislerde boy kaybı ikinci mertebede kalır
  const g1 = blur(R), g2 = blur(g1), S = g1.map((p, s) => [2 * p[0] - g2[s][0], 2 * p[1] - g2[s][1]]);
  // gerçek köşe (topuk oturağı, burun ucu, konç tepesi) yuvarlanmasın: 3 mm'lik kirişler arasındaki dönüş büyükse
  // o bölgede ham çizgi korunur (piksel basamağı ve kenar tırtığı bu ölçekte ~45°'yi geçmez)
  const c = Math.max(2, Math.round(3 / ds)), turn = new Float32Array(N);
  for (let s2 = 0; s2 < N; s2++) {
    const a = R[(s2 - c + N) % N], b = R[s2], e = R[(s2 + c) % N];
    const d = Math.atan2(e[1] - b[1], e[0] - b[0]) - Math.atan2(b[1] - a[1], b[0] - a[0]);
    turn[s2] = Math.abs(Math.atan2(Math.sin(d), Math.cos(d))) * 180 / Math.PI;
  }
  return S.map((p, s2) => {
    let t = 0;
    for (let j = -c; j <= c; j++) t = Math.max(t, turn[(s2 + j + N) % N] * (1 - Math.abs(j) / (c + 1)));   // köşenin çevresine yumuşak geçiş
    const k = Math.max(0, Math.min(1, (t - 50) / 30));
    return k ? [p[0] + (R[s2][0] - p[0]) * k, p[1] + (R[s2][1] - p[1]) * k] : p;
  });
}
// kapalı döngüyü sadeleştir: başlangıca en uzak noktadan ikiye bölünür (aksi halde kiriş sıfır uzunlukta olur)
export function simplifyLoop(pts, tol) {
  let far = 0, fd = -1;
  for (let i = 1; i < pts.length; i++) { const d = dist(pts[0], pts[i]); if (d > fd) { fd = d; far = i; } }
  if (far === 0) return pts.slice();
  const a = G.simplify(pts.slice(0, far + 1), tol), b = G.simplify(pts.slice(far).concat([pts[0]]), tol);
  return a.concat(b.slice(1, -1));
}

// Ana işlem: fotoğraf → ölçülü kalıp çizgisi.
// Dönen: { ok, error?, rec (düzeltilmiş görüntü), outline (mm, sol üst 0,0), imgAt (görüntünün çizgiye göre konumu),
//          length, height, warnings }
export function analyzeLast(rgba, w, h, { paper = 'A4', sens = 0, k = 3 } = {}) {
  const rec = rectify(rgba, w, h, paper, k);
  if (!rec) return { ok: false, error: 'Kâğıt bulunamadı. Kâğıdın dört köşesi de görünsün ve kâğıt arka plandan açık renkli olsun.' };
  return analyzeRectified(rec, sens);
}
export function analyzeRectified(rec, sens = 0) {
  const { w, h, k } = rec;
  const seg = segment(rec, sens);
  const paperArea = w * h;
  const warnings = [...(rec.warnings || [])];
  if (seg.area < paperArea * 0.03) return { ok: false, rec, error: 'Kâğıt üstünde kalıp bulunamadı. Kalıp kâğıttan belirgin farklı renkte olmalı (açık renkli kalıp için renkli kâğıt kullan).' };
  if (seg.area > paperArea * 0.85) return { ok: false, rec, error: 'Kalıp kâğıttan ayrılamadı. Hassasiyeti azalt ya da daha düz ışıkta çek.' };
  const px = traceBoundary(seg.mask, w, h);
  if (px.length < 20) return { ok: false, rec, error: 'Kalıp çizgisi çıkarılamadı.' };
  // kâğıt kenarına değiyorsa kalıp kâğıda sığmamış olabilir
  const edge = Math.round(3 * k);
  if (px.some(([x, y]) => x <= edge || y <= edge || x >= w - 1 - edge || y >= h - 1 - edge)) warnings.push('Kalıp kâğıdın kenarına değiyor: kâğıda sığmamış olabilir. Daha büyük kâğıt (A3) seç.');
  let mm = px.map(([x, y]) => [(x + 0.5) / k, (y + 0.5) / k]);
  mm = simplifyLoop(smoothLoop(mm, 0.5, 2), 0.25);
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of mm) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  const pts = mm.map(([x, y]) => [x - x0, y - y0]);
  return {
    ok: true, rec, outline: G.makePath(pts, true), imgAt: [-x0, -y0],
    length: x1 - x0, height: y1 - y0, area: seg.area / (k * k), warnings,
  };
}

// Bilinen kalıp boyuna göre ölçek düzeltmesi (fotoğraf yüksekten çekilmezse kalıbın üst kısmı büyük görünür)
export function scaleView(v, s) {
  if (!(s > 0) || Math.abs(s - 1) < 1e-9) return v;
  G.transform(v.outline, (p) => [p[0] * s, p[1] * s]);
  return { ...v, k: v.k / s, imgAt: [v.imgAt[0] * s, v.imgAt[1] * s], length: v.length * s, height: v.height * s, scale: (v.scale || 1) * s };
}

/* ---------- Kesim matı üstünde çekilmiş fotoğraf (kâğıtsız) ----------
   Ölçek matın kareli ızgarasından bulunur (varsayılan 10 mm kare). Fotoğraf tepeden çekilmiş kabul edilir
   (perspektif düzeltmesi yapılmaz); kesin ölçü için "bilinen kalıp boyu" girilmelidir. */
function boxBlur1(src, w, h, r) {
  const tmp = new Float32Array(w * h), out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) { let s = 0, n = 0; for (let x = -r; x < w; x++) { if (x + r < w) { s += src[y * w + x + r]; n++; } if (x - r - 1 >= 0) { s -= src[y * w + x - r - 1]; n--; } if (x >= 0) tmp[y * w + x] = s / n; } }
  for (let x = 0; x < w; x++) { let s = 0, n = 0; for (let y = -r; y < h; y++) { if (y + r < h) { s += tmp[(y + r) * w + x]; n++; } if (y - r - 1 >= 0) { s -= tmp[(y - r - 1) * w + x]; n--; } if (y >= 0) out[y * w + x] = s / n; } }
  return out;
}
// profilin tekrar periyodu (piksel): ortalaması çıkarılmış özilişkinin ilk belirgin tepesi
export function period(prof, minLag = 5, maxLag = 0) {
  const n = prof.length; maxLag = maxLag || Math.floor(n / 3);
  let m = 0; for (const v of prof) m += v; m /= n;
  const p = prof.map((v) => v - m);
  let e = 0; for (const v of p) e += v * v; if (!e) return null;
  const ac = [];
  for (let lag = 0; lag <= maxLag; lag++) { let s = 0; for (let i = 0; i + lag < n; i++) s += p[i] * p[i + lag]; ac.push(s / e * n / (n - lag)); }
  let best = null;
  for (let lag = minLag; lag < maxLag; lag++) {
    if (ac[lag] > ac[lag - 1] && ac[lag] >= ac[lag + 1] && ac[lag] > 0.12) {
      // ilk belirgin tepe; parabolle ince ayar
      const a = ac[lag - 1], b = ac[lag], c = ac[lag + 1], d = a - 2 * b + c;
      best = { lag: lag + (d ? 0.5 * (a - c) / d : 0), score: b }; break;
    }
  }
  return best;
}
// Profilin periyodu: özilişkinin en güçlü tepesi; onun yarısında / üçte birinde de neredeyse aynı güçte tepe varsa
// o küçük olan alınır (2 ya da 3 kare atlayan uyum yanlışlıkla seçilmesin). Döner: { lag, score } ya da null.
function strongPeriod(prof, minLag, maxLag) {
  const n = prof.length; if (maxLag >= n - 2) maxLag = n - 3;
  if (maxLag <= minLag + 2) return null;
  let m = 0; for (const v of prof) m += v; m /= n;
  const p = prof.map((v) => v - m);
  let e = 0; for (const v of p) e += v * v; if (!e) return null;
  const ac = new Float32Array(maxLag + 2);
  for (let lag = 0; lag <= maxLag + 1; lag++) { let t = 0; for (let i = 0; i + lag < n; i++) t += p[i] * p[i + lag]; ac[lag] = (t / e) * n / (n - lag); }
  const peaks = [];
  for (let lag = minLag; lag <= maxLag; lag++) if (ac[lag] > ac[lag - 1] && ac[lag] >= ac[lag + 1] && ac[lag] > 0.15) peaks.push(lag);
  if (!peaks.length) return null;
  let best = peaks[0]; for (const q of peaks) if (ac[q] > ac[best]) best = q;
  for (const div of [3, 2]) {
    const t = best / div; if (t < minLag) continue;
    const q = peaks.find((x) => Math.abs(x - t) <= Math.max(1.5, 0.06 * t));
    if (q != null && ac[q] > 0.7 * ac[best]) { best = q; break; }
  }
  const a = ac[best - 1], b = ac[best], c = ac[best + 1], d = a - 2 * b + c;
  return { lag: best + (d ? 0.5 * (a - c) / d : 0), score: b };
}
// Bir kare parçada ızgaranın iki çizgi ailesi: her aile için çizgilere dik birim yön n ve aralık p (px).
// Fotoğraf eğik çekilince (perspektif) iki aile ne dik ne eşit aralıklı olur; yerel olarak afin kabul edilir.
function patchGrid(line, w, h, x0, y0, P, minLag) {
  const prof = (th, st = 2) => {
    const c = Math.cos(th), s = Math.sin(th), R = Math.ceil(P * 0.75), N = 2 * R + 1, sum = new Float32Array(N), cnt = new Uint16Array(N);
    const cx = x0 + P / 2, cy = y0 + P / 2;
    const r2 = (P / 2) ** 2;   // daire içinden örnek: her açıda kutu sayıları aynı dağılır (köşegen yön kayırılmaz)
    for (let y = y0; y < y0 + P; y += st) for (let x = x0; x < x0 + P; x += st) {
      if ((x - cx) ** 2 + (y - cy) ** 2 > r2) continue;
      const d = Math.round((x - cx) * c + (y - cy) * s) + R; sum[d] += line[y * w + x]; cnt[d]++;
    }
    // seyrek örnekte (her 2. piksel) bazı kutular boş kalır: atılırsa profil sıkışır, periyot yarıya iner →
    // boş kutular komşulardan doğrusal doldurulur; yalnız uçlardaki az örnekli kısım kesilir
    let mc = 0; for (const v of cnt) mc = Math.max(mc, v);
    let lo = 0, hi = N - 1;
    const win = (i) => { let c = 0; for (let j = Math.max(0, i - st); j <= Math.min(N - 1, i + st); j++) c += cnt[j]; return c; };
    const full = (() => { let m = 0; for (let i = 0; i < N; i++) m = Math.max(m, win(i)); return m; })();
    while (lo < N && win(lo) < 0.35 * full) lo++;
    while (hi > lo && win(hi) < 0.35 * full) hi--;
    const out = [];
    for (let i = lo; i <= hi; i++) {
      if (cnt[i]) { out.push(sum[i] / cnt[i]); continue; }
      let a = i - 1, b = i + 1; while (a >= lo && !cnt[a]) a--; while (b <= hi && !cnt[b]) b++;
      const va = a >= lo ? sum[a] / cnt[a] : null, vb = b <= hi ? sum[b] / cnt[b] : null;
      out.push(va == null ? vb ?? 0 : vb == null ? va : va + (vb - va) * (i - a) / (b - a));
    }
    return out;
  };
  const varOf = (a) => { let m = 0; for (const v of a) m += v; m /= a.length || 1; let q = 0; for (const v of a) q += (v - m) ** 2; return q / (a.length || 1); };
  const D = Math.PI / 180, V = [];
  for (let t = 0; t < 180; t += 3) V.push([t, varOf(prof(t * D, 4))]);   // kaba tarama seyrek örnekle
  const pick = (ok) => {
    let b = null; for (const [t, v] of V) if (ok(t) && (!b || v > b[1])) b = [t, v];
    if (!b) return null;
    let bt = b[0], bv = b[1];
    for (let t = b[0] - 2; t <= b[0] + 2; t += 1) { const v = varOf(prof(t * D)); if (v > bv) { bv = v; bt = t; } }
    return bt;
  };
  const t1 = pick(() => true);
  if (t1 == null) return null;
  const t2 = pick((t) => { const d = Math.abs(((t - t1) % 180 + 180) % 180); return d > 50 && d < 130; });
  if (t2 == null) return null;
  const res = [];
  for (const t of [t1, t2]) {
    const pr = strongPeriod(prof(t * D), minLag, Math.floor(P / 3));
    if (!pr || pr.score < 0.25) return null;
    res.push({ n: [Math.cos(t * D), Math.sin(t * D)], p: pr.lag, score: pr.score });
  }
  return res;
}
// Matın ızgarası: görüntü parçalara bölünür, her parçada ızgara ayrı ölçülür (eğik çekimde kare boyu yere göre değişir).
// Döner: { px (yatay yönde kare aralığı, ortanca), patches: [{ cx, cy, A }], agree, line, bl, g }.
// A: görüntü pikselini kare sayısına çeviren 2×2 matris (u = A·Δx); bir yöndeki kare aralığı 1 / |A·yön|.
export function matScale(rgba, w, h) {
  const g = new Float32Array(w * h);
  for (let i = 0, o = 0; i < g.length; i++, o += 4) g[i] = 0.3 * rgba[o] + 0.59 * rgba[o + 1] + 0.11 * rgba[o + 2];
  const rb = Math.max(4, Math.round(Math.min(w, h) / 150));
  const bl = boxBlur1(g, w, h, rb);
  const line = new Float32Array(w * h);
  for (let i = 0; i < g.length; i++) line[i] = Math.max(0, g[i] - bl[i]);
  const P = Math.max(60, Math.round(Math.min(w, h) / 4)), stp = Math.round(P / 2), patches = [];
  const lb = boxBlur1(line, w, h, 2);   // ince çizgi seyrek örnekte kaçmasın (örnek aralığı 2–4 px)
  for (let y0 = 0; y0 + P <= h; y0 += stp) for (let x0 = 0; x0 + P <= w; x0 += stp) {
    const gr = patchGrid(lb, w, h, x0, y0, P, Math.max(8, Math.round(Math.min(w, h) / 120)));   // kalıbın yüzey dokusu (ince ızgara) kare sanılmasın
    if (!gr) continue;
    const A = [[gr[0].n[0] / gr[0].p, gr[0].n[1] / gr[0].p], [gr[1].n[0] / gr[1].p, gr[1].n[1] / gr[1].p]];
    patches.push({ cx: x0 + P / 2, cy: y0 + P / 2, A, p: [gr[0].p, gr[1].p], score: Math.min(gr[0].score, gr[1].score) });
  }
  if (!patches.length) return null;
  const along = (pt, u) => 1 / Math.hypot(pt.A[0][0] * u[0] + pt.A[0][1] * u[1], pt.A[1][0] * u[0] + pt.A[1][1] * u[1]);
  const px = median(patches.map((pt) => along(pt, [1, 0])));
  // tepeden çekimde iki aile eşit aralıklıdır; %15'ten çok farklıysa çekim eğik
  const agree = median(patches.map((pt) => Math.abs(pt.p[0] - pt.p[1]) / Math.max(pt.p[0], pt.p[1]))) < 0.15;
  return { px, patches, along, agree, line, bl, g };
}
// Kalıbın çevresindeki parçalardan, kalıbın uzun ekseni yönünde kare aralığı (px). box: [x0, y0, x1, y1] görüntü pikseli.
// Eğik çekimde kare boyu yere göre değişir: ölçek, kalıbın matla buluştuğu alt kenarın ortasına en yakın
// (kalıbın dışında kalan) parçaların ortancasından alınır, kalıbın uzun ekseni yönünde.
export function scaleNear(sc, box, ang) {
  const u = [Math.cos(ang), Math.sin(ang)], q = [(box[0] + box[2]) / 2, box[3]];
  // kalıbın üstündeki parçalar (kalıp yüzeyinin dokusu, kısmen görünen ızgara) kullanılmaz
  const out = sc.patches.filter((pt) => !(pt.cx > box[0] && pt.cx < box[2] && pt.cy > box[1] && pt.cy < box[3]));
  const use = (out.length >= 3 ? out : sc.patches).map((pt) => ({ d: Math.hypot(pt.cx - q[0], pt.cy - q[1]), dx: pt.cx - q[0], dy: pt.cy - q[1], s: sc.along(pt, u) }));
  use.sort((a, b) => a.d - b.d);
  const near = use.slice(0, 10), med = median(near.slice(0, 5).map((p) => p.s));
  // en yakın parçalar çoğunlukla kalıbın altındadır (kare orada daha büyük): s = a + b·dx + c·dy düzlemi oturtulup
  // alt kenarın ortasına taşınır; uymayanlar (ortancadan %25 sapan) atılır, çözüm kararsızsa ortanca kalır
  const P = near.filter((p) => Math.abs(p.s - med) / med < 0.25);
  if (P.length >= 5) {
    const M = [[0, 0, 0], [0, 0, 0], [0, 0, 0]], r = [0, 0, 0];
    for (const p of P) { const f = [1, p.dx, p.dy]; for (let i = 0; i < 3; i++) { r[i] += f[i] * p.s; for (let j = 0; j < 3; j++) M[i][j] += f[i] * f[j]; } }
    const det = (A) => A[0][0] * (A[1][1] * A[2][2] - A[1][2] * A[2][1]) - A[0][1] * (A[1][0] * A[2][2] - A[1][2] * A[2][0]) + A[0][2] * (A[1][0] * A[2][1] - A[1][1] * A[2][0]);
    const D = det(M);
    if (Math.abs(D) > 1e-6 * M[1][1] * M[2][2]) {
      const a0 = det([[r[0], M[0][1], M[0][2]], [r[1], M[1][1], M[1][2]], [r[2], M[2][1], M[2][2]]]) / D;
      if (a0 > 0.6 * med && a0 < 1.4 * med) return a0;
    }
  }
  return med;
}
export function analyzeMat(rgba, w, h, { gridMm = 10, sens = 0 } = {}, _sc = null, _k = 0) {
  const sc = _sc || matScale(rgba, w, h);
  if (!sc) return { ok: false, error: 'Matın kareli çizgileri bulunamadı. Matın çizgileri net görünsün, telefonu tam tepeden tut.' };
  const k = _k || sc.px / gridMm;
  // ızgara çizgilerini matın rengine boya (ayırmayı bozmasın)
  const out = new Uint8ClampedArray(rgba);
  const near = new Float32Array(w * h);
  for (let i = 0; i < near.length; i++) near[i] = sc.line[i] > 6 ? 1 : 0;
  const lineMask = boxBlur1(near, w, h, 1);
  // matın rengi: kenar şeridinin ortancası (çizgiler hariç)
  const R = [], Gc = [], B = [], band = Math.max(4, Math.round(0.06 * Math.min(w, h)));
  for (let y = 0; y < h; y += 2) for (let x = 0; x < w; x += 2) {
    if (x > band && x < w - band && y > band && y < h - band) continue;
    const i = y * w + x; if (lineMask[i] > 0) continue;
    R.push(rgba[i * 4]); Gc.push(rgba[i * 4 + 1]); B.push(rgba[i * 4 + 2]);
  }
  const mr = median(R), mg = median(Gc), mb = median(B);
  // çizgilerin renk tonu (kenar şeridindeki çizgi pikselleri): matın tonundan ne kadar ayrıldığı
  const cs = mr + mg + mb + 1, mc = [mr / cs, mg / cs, mb / cs];
  const cdist = (o) => { const t = rgba[o] + rgba[o + 1] + rgba[o + 2] + 1; return Math.hypot(rgba[o] / t - mc[0], rgba[o + 1] / t - mc[1], rgba[o + 2] / t - mc[2]); };
  const LC = [];
  for (let y = 0; y < h; y += 2) for (let x = 0; x < w; x += 2) {
    if (x > band && x < w - band && y > band && y < h - band) continue;
    const i = y * w + x; if (lineMask[i] > 0) LC.push(cdist(i * 4));
  }
  const lineTone = 1.6 * (LC.length ? median(LC) : 0) + 0.03;
  for (let i = 0; i < near.length; i++) {
    if (lineMask[i] <= 0) continue;
    const o = i * 4, d = Math.hypot(rgba[o] - mr, rgba[o + 1] - mg, rgba[o + 2] - mb);
    // çizgi pikseli matın açık tonu ise mat rengine çek; kalıbın üstündeki parlak noktaya ve kalıbın kendi
    // (gölgede kalan) yüzeyine dokunma: renk tonu matın/çizginin tonundan uzaksa kalıptır (çizginin uzantısı kalıbı ısırmasın)
    if (d < 200 && sc.g[i] > sc.bl[i] && cdist(o) < lineTone) { out[o] = mr; out[o + 1] = mg; out[o + 2] = mb; }
  }
  const warnings = [];
  if (!sc.agree) warnings.push('Matın kareleri iki yönde aynı ölçülmedi: fotoğraf eğik çekilmiş olabilir. Bilinen kalıp boyunu gir.');
  warnings.push(`Ölçek matın ${gridMm} mm karelerinden bulundu. Kesin ölçü için bilinen kalıp boyunu gir.`);
  const seg = matOptions(out, w, h, sens, [mr, mg, mb]);
  let r = analyzeRectified({ rgba: out, w, h, k, warnings, ...seg }, 0);
  if (!r.ok) { r.error = r.error.replace(/kâğıt/gi, 'mat'); return r; }
  // kalıp eğik duruyorsa (mat düz, kalıp çapraz) uzun ekseni yataya çevir
  const a = mainAngle(r.outline.nodes.map((n) => n.p));
  if (!_k) {
    // ölçek: kalıbın çevresindeki ızgaradan, kalıbın uzun ekseni yönünde (eğik çekimde kare boyu yere göre değişir)
    const P = r.outline.nodes.map((n) => [(n.p[0] - r.imgAt[0]) * k, (n.p[1] - r.imgAt[1]) * k]);
    const box = [Math.min(...P.map((q) => q[0])), Math.min(...P.map((q) => q[1])), Math.max(...P.map((q) => q[0])), Math.max(...P.map((q) => q[1]))];
    const k1 = scaleNear(sc, box, a) / gridMm;
    if (Math.abs(k1 - k) / k > 0.02) return analyzeMat(rgba, w, h, { gridMm, sens }, sc, k1);
  }
  if (Math.abs(a) > 0.035) {
    const rot = rotateRgba(out, w, h, -a, [mr, mg, mb]);
    const r2 = analyzeRectified({ rgba: rot.rgba, w: rot.w, h: rot.h, k, warnings, ...seg }, 0);
    if (r2.ok) { r2.warnings.push(`Kalıp ${Math.round(a * 180 / Math.PI)}° eğikti, düzeltildi.`); r = r2; }
  }
  return r;
}

// noktaların ana ekseninin açısı (radyan, x eksenine göre)
export function mainAngle(pts) {
  let mx = 0, my = 0; for (const [x, y] of pts) { mx += x; my += y; } mx /= pts.length; my /= pts.length;
  let sxx = 0, syy = 0, sxy = 0; for (const [x, y] of pts) { sxx += (x - mx) ** 2; syy += (y - my) ** 2; sxy += (x - mx) * (y - my); }
  let a = 0.5 * Math.atan2(2 * sxy, sxx - syy);
  if (a > Math.PI / 2) a -= Math.PI; if (a < -Math.PI / 2) a += Math.PI;
  return a;
}
// görüntüyü merkez etrafında döndür (tuval büyür, boşluk verilen renkle dolar)
export function rotateRgba(rgba, w, h, ang, fill = [255, 255, 255]) {
  const c = Math.cos(ang), s = Math.sin(ang);
  const W = Math.ceil(Math.abs(w * c) + Math.abs(h * s)), H = Math.ceil(Math.abs(w * s) + Math.abs(h * c));
  const out = new Uint8ClampedArray(W * H * 4);
  const cx = w / 2, cy = h / 2, CX = W / 2, CY = H / 2;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const dx = x - CX, dy = y - CY, u = Math.round(c * dx + s * dy + cx), v = Math.round(-s * dx + c * dy + cy), o = (y * W + x) * 4;
    if (u >= 0 && v >= 0 && u < w && v < h) { const q = (v * w + u) * 4; out[o] = rgba[q]; out[o + 1] = rgba[q + 1]; out[o + 2] = rgba[q + 2]; }
    else { out[o] = fill[0]; out[o + 1] = fill[1]; out[o + 2] = fill[2]; }
    out[o + 3] = 255;
  }
  return { rgba: out, w: W, h: H };
}

// Mat üstünde ayırma ayarları: parlaklıktan bağımsız renk farkı ve matın kendi gürültüsüne göre eşik.
// mat rengi verilmezse görüntünün kenar şeridinden bulunur (kayıtlı görüntüyü yeniden işlerken).
export function matOptions(rgba, w, h, sens = 0, mat = null) {
  const band = Math.max(4, Math.round(0.06 * Math.min(w, h)));
  if (!mat) {
    const R = [], Gc = [], B = [];
    for (let y = 0; y < h; y += 2) for (let x = 0; x < w; x += 2) { if (x > band && x < w - band && y > band && y < h - band) continue; const o = (y * w + x) * 4; R.push(rgba[o]); Gc.push(rgba[o + 1]); B.push(rgba[o + 2]); }
    mat = [median(R), median(Gc), median(B)];
  }
  const [mr, mg, mb] = mat;
  const chroma = (r, g, b) => { const s = r + g + b + 1; return [r / s, g / s, b / s]; };
  const [cr, cg, cb] = chroma(mr, mg, mb);
  const dist = (r, g, b) => { const [a, c, e] = chroma(r, g, b); const dc = Math.hypot(a - cr, c - cg, e - cb) * 900; const dl = Math.abs(r + g + b - mr - mg - mb) / 3 * 0.35; return Math.min(255, Math.round(dc + dl)); };
  const ds = [];
  for (let y = 0; y < h; y += 3) for (let x = 0; x < w; x += 3) { if (x > band && x < w - band && y > band && y < h - band) continue; const o = (y * w + x) * 4; ds.push(dist(rgba[o], rgba[o + 1], rgba[o + 2])); }
  const md = median(ds), mad = median(ds.map((v) => Math.abs(v - md))) || 1;
  return { dist, th: Math.max(10, Math.round((md + 4 * mad + 6) * (1 - 0.08 * sens))) };
}
