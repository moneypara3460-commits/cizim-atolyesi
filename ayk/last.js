// Kalıp fotoğrafından ölçülü kalıp çizgisi (saf fonksiyonlar; testlerde Node'da çalışır).
// Akış: A4/A3 kâğıdı bul → perspektifi düzelt (kâğıt düz dikdörtgen olur, ölçek bilinir) →
// kâğıt renginden farklı olan en büyük nesne = kalıp → dış çizgisini izle → mm'ye çevir → sadeleştir.
// Kalıp beyaz/açık renkliyse renkli (ör. mavi) kâğıt kullanılır: ayırma gri değil renk farkıyla yapılır.
import { toGray, homography } from '../photo2d.js?v=20261112u';
import * as G from './geom.js?v=20261114u';

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
    const v = Math.min(255, Math.round(Math.hypot(rgba[o] - pr, rgba[o + 1] - pg, rgba[o + 2] - pb) * 0.75));
    d[i] = v; hist[v]++;
  }
  let th = otsu(hist, d.length);
  th = Math.max(12, Math.min(200, Math.round(th * (1 - 0.08 * sens))));
  let mask = new Uint8Array(w * h);
  for (let y = m; y < h - m; y++) for (let x = m; x < w - m; x++) mask[y * w + x] = d[y * w + x] > th ? 1 : 0;
  const r = Math.max(1, Math.round(0.7 * k));
  mask = morph(morph(mask, w, h, r, true), w, h, r, false);   // kapama: küçük boşlukları kapat
  mask = morph(morph(mask, w, h, 1, false), w, h, 1, true);   // açma: tozu sil
  // en büyük bileşen
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
  const obj = new Uint8Array(w * h);
  if (bestId < 0) return { mask: obj, area: 0, paper: [pr, pg, pb], th };
  for (let i = 0; i < obj.length; i++) obj[i] = lab[i] === bestId ? 1 : 0;
  // delikleri doldur: dışarıdan ulaşılamayan boşluklar nesneye katılır
  const out = new Uint8Array(w * h), seen = new Uint8Array(w * h);
  for (let x = 0; x < w; x++) for (const y of [0, h - 1]) if (!obj[y * w + x] && !seen[y * w + x]) { seen[y * w + x] = 1; st.push(y * w + x); }
  for (let y = 0; y < h; y++) for (const x of [0, w - 1]) if (!obj[y * w + x] && !seen[y * w + x]) { seen[y * w + x] = 1; st.push(y * w + x); }
  while (st.length) {
    const q = st.pop(), x = q % w, y = (q / w) | 0;
    for (const nb of [x > 0 ? q - 1 : -1, x < w - 1 ? q + 1 : -1, y > 0 ? q - w : -1, y < h - 1 ? q + w : -1]) if (nb >= 0 && !obj[nb] && !seen[nb]) { seen[nb] = 1; st.push(nb); }
  }
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
  mm = simplifyLoop(mm, 0.4);
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
