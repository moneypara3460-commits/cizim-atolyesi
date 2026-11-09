// Akıllı Ağırlık ve Ağırlık Merkezi — saf hesap modülü (3B kütüphanesi gerektirmez; Node'da test edilir: tests/weight.test.mjs)
//
// Girdi: parçalar [{ id, name, type, tris (dünya koordinatı, parçanın KENDİSİNE AİT katısı: oyuklar ve kendinden sonra gelen
//        parçaların kapladığı yer çıkarılmış), material { id, name, rho, kind }, rho (g/cm³, etkin), rhoSrc ('malzeme'|'özel'|'varsayılan'),
//        exact (CSG ayrımı yapılabildi mi) }]
// Kütle = hacim × yoğunluk; ağırlık merkezi = Σ(mᵢ · cᵢ) / Σmᵢ (cᵢ = parçanın hacim merkezi, tetrahedron ayrışımı)
// Koordinatlar uygulamadaki gibi: X sağ, Y yukarı (yükseklik), Z ön. Taban zemini modelin en alt noktasıdır.
// Denge: zemine değen noktaların (en alttaki köşeler) dışbükey zarfı = destek alanı; ağırlık merkezinin izdüşümü bu alanın
//        içinde mi, kenara uzaklığı ve devrilme açısı atan(uzaklık / yükseklik); ayak yükleri (rijit gövde, en küçük norm dağılım).
// Kaldırma: en üstteki noktaların zarfından kaldırma noktası önerisi, nokta yükleri, sapan bacak kuvvetleri (60° / 45°).

const r1 = (v) => Math.round(v * 10) / 10;
const G = 9.81;

/* ---------- hacim ve hacim merkezi ---------- */
export function volumeProps(tris) {
  const n = Math.floor(tris.length / 9);
  let vol = 0, cx = 0, cy = 0, cz = 0;
  for (let t = 0; t < n; t++) {
    const o = t * 9;
    const ax = tris[o], ay = tris[o + 1], az = tris[o + 2], bx = tris[o + 3], by = tris[o + 4], bz = tris[o + 5], qx = tris[o + 6], qy = tris[o + 7], qz = tris[o + 8];
    const v = (ax * (by * qz - bz * qy) - ay * (bx * qz - bz * qx) + az * (bx * qy - by * qx)) / 6;
    vol += v; cx += v * (ax + bx + qx) / 4; cy += v * (ay + by + qy) / 4; cz += v * (az + bz + qz) / 4;
  }
  const sg = vol < 0 ? -1 : 1, V = vol * sg;
  return { volume: V, centroid: V > 1e-9 ? [cx * sg / V, cy * sg / V, cz * sg / V] : null };
}

/* ---------- kategori ---------- */
export function categoryOf(type, p = {}) {
  if (type === 'frame') return 'Profil';
  if (type === 'sweep') return p.prof === 'tube' ? 'Boru' : p.prof === 'rect' ? 'Profil' : 'Dolu malzeme';
  if (type === 'sheet') return 'Sac';
  if (type === 'tube') return 'Boru';
  if (type === 'mesh') return 'Birleştirilmiş parça';
  return 'Dolu malzeme';
}

/* ---------- 2B yardımcılar (XZ düzlemi) ---------- */
function hull2(pts) {
  const q = (x) => Math.round(x * 1e4) / 1e4;
  const P = pts.map((p) => [q(p[0]), q(p[1])]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const uniq = P.filter((p, i) => !i || p[0] !== P[i - 1][0] || p[1] !== P[i - 1][1]);
  if (uniq.length < 3) return uniq;
  const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [], hi = [];
  for (const p of uniq) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], p) <= 1e-9) lo.pop(); lo.push(p); }
  for (let i = uniq.length - 1; i >= 0; i--) { const p = uniq[i]; while (hi.length >= 2 && cr(hi[hi.length - 2], hi[hi.length - 1], p) <= 1e-9) hi.pop(); hi.push(p); }
  return lo.slice(0, -1).concat(hi.slice(0, -1));
}
const segDist = (p, a, b) => { const dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz; const t = L2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / L2)) : 0; return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dz); };
function inPoly(poly, p) {
  if (poly.length < 3) return false;
  let ins = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const a = poly[i], b = poly[j]; if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < (b[0] - a[0]) * (p[1] - a[1]) / (b[1] - a[1]) + a[0]) ins = !ins; }
  return ins;
}
const polyArea = (P) => { let s = 0; for (let i = 0; i < P.length; i++) { const a = P[i], b = P[(i + 1) % P.length]; s += a[0] * b[1] - b[0] * a[1]; } return Math.abs(s) / 2; };
// noktaları yakınlığa göre kümele (ayaklar / kaldırma bölgeleri)
function clusters(pts, eps) {
  const par = pts.map((_, i) => i), find = (x) => { while (par[x] !== x) { par[x] = par[par[x]]; x = par[x]; } return x; };
  const cell = new Map(), key = (x, z) => Math.floor(x / eps) + ',' + Math.floor(z / eps);
  pts.forEach((p, i) => {
    const cx = Math.floor(p[0] / eps), cz = Math.floor(p[1] / eps);
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (const j of cell.get((cx + a) + ',' + (cz + b)) || []) if (Math.hypot(p[0] - pts[j][0], p[1] - pts[j][1]) <= eps) par[find(i)] = find(j);
    const k = key(p[0], p[1]); if (!cell.has(k)) cell.set(k, []); cell.get(k).push(i);
  });
  const m = new Map();
  pts.forEach((p, i) => { const r = find(i); if (!m.has(r)) m.set(r, []); m.get(r).push(p); });
  return [...m.values()];
}
// rijit gövde, eşit rijit destekler: ΣF = W, ΣF·(x, z) = W·(X, Z), ΣF² en küçük; negatif çıkan destek bırakılıp yeniden çözülür
export function supportLoads(pts, X, Z, W) {
  let act = pts.map((_, i) => i);
  for (let iter = 0; iter < pts.length; iter++) {
    const n = act.length;
    if (!n) return pts.map(() => 0);
    const P = act.map((i) => pts[i]);
    let F;
    if (n === 1) F = [W];
    else {
      // ağırlık merkezine göre ortalanmış koordinatlarla 3×3 Gram sistemi (tekilse 2 / 1 bilinmeyene düş)
      const sx = P.reduce((s, p) => s + p[0], 0), sz = P.reduce((s, p) => s + p[1], 0);
      const sxx = P.reduce((s, p) => s + p[0] * p[0], 0), szz = P.reduce((s, p) => s + p[1] * p[1], 0), sxz = P.reduce((s, p) => s + p[0] * p[1], 0);
      const A = [[n, sx, sz], [sx, sxx, sxz], [sz, sxz, szz]], b = [W, W * X, W * Z];
      let lam = solve3(A, b);
      if (!lam) {
        // destekler bir doğru üzerinde: doğru boyunca 2 bilinmeyen
        const mx = sx / n, mz = sz / n;
        let dx = 0, dz = 0; for (const p of P) { const ex = p[0] - mx, ez = p[1] - mz; if (Math.hypot(ex, ez) > Math.hypot(dx, dz)) { dx = ex; dz = ez; } }
        const L = Math.hypot(dx, dz) || 1, ux = dx / L, uz = dz / L;
        const s = P.map((p) => (p[0] - mx) * ux + (p[1] - mz) * uz), S2 = s.reduce((a, v) => a + v * v, 0);
        const sc = (X - mx) * ux + (Z - mz) * uz;
        F = s.map((v) => W / n + (S2 > 1e-9 ? W * sc * v / S2 : 0));
      } else F = P.map((p) => lam[0] + lam[1] * p[0] + lam[2] * p[1]);
    }
    const neg = F.findIndex((f) => f < -1e-9 * W);
    if (neg < 0) { const out = pts.map(() => 0); act.forEach((i, k) => { out[i] = Math.max(0, F[k]); }); return out; }
    // en negatif desteği bırak
    let worst = 0; F.forEach((f, k) => { if (f < F[worst]) worst = k; });
    act = act.filter((_, k) => k !== worst);
  }
  return pts.map(() => 0);
}
function solve3(A, b) {
  const M = A.map((r, i) => [...r, b[i]]);
  for (let c = 0; c < 3; c++) {
    let p = c; for (let r = c + 1; r < 3; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    if (Math.abs(M[p][c]) < 1e-9 * Math.max(1, Math.abs(M[0][0]) * Math.max(1, Math.abs(A[1][1]) + Math.abs(A[2][2])))) return null;
    [M[c], M[p]] = [M[p], M[c]];
    for (let r = 0; r < 3; r++) if (r !== c) { const f = M[r][c] / M[c][c]; for (let k = c; k < 4; k++) M[r][k] -= f * M[c][k]; }
  }
  return [M[0][3] / M[0][0], M[1][3] / M[1][1], M[2][3] / M[2][2]];
}

/* ---------- ana hesap ---------- */
export function analyzeWeight(items, opts = {}) {
  const floorTol = opts.floorTol ?? 0.05;   // zemine değme toleransı (mm, üretim kontrolündeki temas toleransıyla aynı)
  const rows = [], notes = [];
  for (const it of items) {
    const vp = volumeProps(it.tris);
    const rho = Number(it.rho);
    const ok = isFinite(rho) && rho > 0;
    const kg = ok ? vp.volume / 1000 * rho / 1000 : null;
    rows.push({ id: it.id, name: it.name, type: it.type, cat: categoryOf(it.type, it.p), material: it.material, rho: ok ? rho : null, rhoSrc: it.rhoSrc || 'malzeme', exact: it.exact !== false, volume: vp.volume, com: vp.centroid, kg });
  }
  const valid = rows.filter((r) => r.kg != null && r.com && r.volume > 1e-6);
  const M = valid.reduce((s, r) => s + r.kg, 0);
  const com = M > 0 ? [0, 1, 2].map((k) => valid.reduce((s, r) => s + r.kg * r.com[k], 0) / M) : null;
  const V = rows.reduce((s, r) => s + r.volume, 0);
  // dağılımlar
  const byMat = new Map(), byCat = new Map();
  for (const r of valid) {
    const mk = (r.rhoSrc === 'özel' ? 'Özel yoğunluk ' + String(r.rho).replace('.', ',') + ' g/cm³' : r.material ? r.material.name : '?');
    byMat.set(mk, (byMat.get(mk) || 0) + r.kg);
    byCat.set(r.cat, (byCat.get(r.cat) || 0) + r.kg);
  }
  // uyarılar / tahmin durumları
  const noRho = rows.filter((r) => r.kg == null);
  if (noRho.length) notes.push({ sev: 'warn', text: noRho.map((r) => r.name).join(', ') + ': yoğunluk bilinmiyor (geçersiz değer); bu parçalar toplam ağırlığa ve ağırlık merkezine KATILMADI.' });
  const deflt = rows.filter((r) => r.rhoSrc === 'varsayılan');
  if (deflt.length) notes.push({ sev: 'info', text: deflt.length + ' parçanın malzemesi tek tek seçilmedi; genel malzeme (' + (deflt[0].material ? deflt[0].material.name : '') + ') kullanıldı. Doğru değilse parçanın malzemesini seç.' });
  const approx = rows.filter((r) => !r.exact);
  if (approx.length) notes.push({ sev: 'warn', text: approx.map((r) => r.name).join(', ') + ': oyuk / çakışma düşülemedi; bu parçaların ağırlığı TAHMİNİ (fazla çıkabilir).' });
  const empty = rows.filter((r) => r.volume <= 1e-6);
  if (empty.length) notes.push({ sev: 'info', text: empty.map((r) => r.name).join(', ') + ': kendine ait hacmi yok (tamamen başka parçaların içinde ya da oyukla silinmiş); ağırlığı 0.' });
  const result = {
    parts: rows, total: { kg: M, N: M * G, volume: V, com }, byMat: [...byMat.entries()].sort((a, b) => b[1] - a[1]), byCat: [...byCat.entries()].sort((a, b) => b[1] - a[1]),
    notes, estimate: noRho.length > 0 || approx.length > 0,
  };
  if (com && valid.length) { result.balance = balance(valid, items, com, M, floorTol); result.lift = lift(items, com, M, result.balance); }
  return result;
}

function verts(items) {
  const out = [];
  for (const it of items) for (let i = 0; i + 2 < it.tris.length; i += 3) out.push([it.tris[i], it.tris[i + 1], it.tris[i + 2]]);
  return out;
}
function balance(valid, items, com, M, tol) {
  const ids = new Set(valid.map((r) => r.id));
  const V = verts(items.filter((it) => ids.has(it.id)));
  let ymin = Infinity, ymax = -Infinity;
  for (const v of V) { if (v[1] < ymin) ymin = v[1]; if (v[1] > ymax) ymax = v[1]; }
  const H = ymax - ymin, h = com[1] - ymin;
  const bottom = V.filter((v) => v[1] <= ymin + tol).map((v) => [v[0], v[2]]);
  const hull = hull2(bottom), p = [com[0], com[2]];
  // ayaklar: zemine yatan üçgenlerin bağlı grupları (içi boş profil tabanı halka olsa da tek ayak); zemine yalnız köşe / kenarla değen noktalar 15 mm yakınlıkla eklenir
  const feetPts = footClusters(items.filter((it) => ids.has(it.id)), ymin, tol);
  const feet = feetPts.map((c) => { const hh = hull2(c); const cx = c.reduce((s, q) => s + q[0], 0) / c.length, cz = c.reduce((s, q) => s + q[1], 0) / c.length; return { c: [cx, cz], n: c.length, size: hh.length >= 3 ? Math.sqrt(polyArea(hh)) : 0 }; });
  const res = { ymin, ymax, H, comHeight: h, hull, feet: [], area: hull.length >= 3 ? polyArea(hull) : 0 };
  if (hull.length < 3) {
    res.status = 'line'; res.inside = false; res.margin = 0; res.tipDeg = 0;
    res.text = 'Model zemine tek noktada ya da bir çizgi boyunca değiyor; kendi başına dengede durmaz (desteklenmesi gerekir).';
    return res;
  }
  const inside = inPoly(hull, p);
  let margin = Infinity, edge = null;
  for (let i = 0; i < hull.length; i++) { const a = hull[i], b = hull[(i + 1) % hull.length], d = segDist(p, a, b); if (d < margin) { margin = d; edge = [a, b]; } }
  const tip = inside ? Math.atan2(margin, Math.max(h, 1e-6)) * 180 / Math.PI : 0;
  // devrilme yönü: ağırlık merkezinden en yakın kenara
  let dir = null;
  if (edge) {
    const a = edge[0], b = edge[1], dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz, t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / L2));
    const q = [a[0] + t * dx, a[1] + t * dz], vx = q[0] - p[0], vz = q[1] - p[1];
    dir = Math.abs(vx) >= Math.abs(vz) ? (vx > 0 ? '+X (sağ)' : '−X (sol)') : (vz > 0 ? '+Z (ön)' : '−Z (arka)');
  }
  // destek alanının merkezine göre kayma
  const hc = hull.reduce((s, q) => [s[0] + q[0] / hull.length, s[1] + q[1] / hull.length], [0, 0]);
  const xs = hull.map((q) => q[0]), zs = hull.map((q) => q[1]), wX = Math.max(...xs) - Math.min(...xs), wZ = Math.max(...zs) - Math.min(...zs);
  const offX = (p[0] - hc[0]) / Math.max(wX / 2, 1e-6), offZ = (p[1] - hc[1]) / Math.max(wZ / 2, 1e-6);
  Object.assign(res, { inside, margin, tipDeg: tip, dir, center: hc, width: [wX, wZ], offset: [offX, offZ], slender: h / Math.max(Math.min(wX, wZ), 1e-6) });
  // ayak yükleri
  if (feet.length >= 1 && feet.length <= 2000) {
    const F = supportLoads(feet.map((f) => f.c), p[0], p[1], M);
    res.feet = feet.map((f, i) => ({ ...f, kg: F[i] }));
  }
  res.status = !inside ? 'tips' : tip < 10 ? 'high' : tip < 20 ? 'care' : 'ok';
  const statusText = { tips: 'Ağırlık merkezi destek alanının dışında; kendi başına duramaz.', high: 'Küçük bir eğim ya da itme ile devrilebilir; sabitleme / ankraj gerekli.', care: 'Denge sınırda; sabitleme / ankraj önerilir.', ok: 'Kendi ağırlığıyla dengede (statik).' };
  res.text = statusText[res.status];
  const issues = [];
  if (inside && Math.max(Math.abs(offX), Math.abs(offZ)) > 0.35) issues.push('Ağırlık ' + (Math.abs(offX) >= Math.abs(offZ) ? (offX > 0 ? 'sağa (+X)' : 'sola (−X)') : (offZ > 0 ? 'öne (+Z)' : 'arkaya (−Z)')) + ' kaymış: ağırlık merkezi destek alanının ortasından yarı genişliğin %' + Math.round(Math.max(Math.abs(offX), Math.abs(offZ)) * 100) + "'i kadar uzakta.");
  if (res.slender > 1.5) issues.push('Uzun ve dar yapı: ağırlık merkezi yüksekliği taban genişliğinin ' + r1(res.slender).toString().replace('.', ',') + ' katı; yan kuvvetlere (itme, rüzgâr, titreşim) karşı devrilmeye yatkın.');
  const lifted = res.feet.filter((f) => f.kg <= M * 1e-6);
  if (inside && lifted.length && res.feet.length > 1) issues.push(lifted.length + ' destek bölgesi yük taşımıyor (ağırlık diğer ayaklarda); zemin düz değilse sallanabilir.');
  const maxFoot = res.feet.reduce((m, f) => Math.max(m, f.kg), 0);
  if (res.feet.length >= 3 && maxFoot > M * 0.5) issues.push('Bir destek toplam ağırlığın %' + Math.round(maxFoot / M * 100) + "'ini taşıyor; ağırlık dağılımı dengesiz.");
  res.issues = issues;
  return res;
}
function footClusters(items, ymin, tol) {
  const key = (x, z) => Math.round(x * 100) + ',' + Math.round(z * 100);
  const par = new Map(), find = (k) => { while (par.get(k) !== k) { par.set(k, par.get(par.get(k))); k = par.get(k); } return k; };
  const add = (k) => { if (!par.has(k)) par.set(k, k); };
  const pos = new Map(), loose = [];
  for (const it of items) {
    const t = it.tris;
    for (let o = 0; o + 8 < t.length; o += 9) {
      const on = [0, 1, 2].map((i) => t[o + i * 3 + 1] <= ymin + tol);
      if (!on.some(Boolean)) continue;
      const ks = [0, 1, 2].map((i) => { const k = key(t[o + i * 3], t[o + i * 3 + 2]); if (on[i]) { add(k); pos.set(k, [t[o + i * 3], t[o + i * 3 + 2]]); } return k; });
      if (on.every(Boolean)) { par.set(find(ks[0]), find(ks[1])); par.set(find(ks[1]), find(ks[2])); }
      else { // kenar zemine yatıyorsa (iki köşe) o kenar da bağlar
        for (let i = 0; i < 3; i++) if (on[i] && on[(i + 1) % 3]) par.set(find(ks[i]), find(ks[(i + 1) % 3]));
      }
    }
  }
  const m = new Map();
  for (const k of par.keys()) { const r = find(k); if (!m.has(r)) m.set(r, []); m.get(r).push(pos.get(k)); }
  let groups = [...m.values()];
  // tek noktalı (yalnız köşesiyle değen) gruplar yakın komşularıyla birleşsin
  const single = groups.filter((g) => g.length === 1), multi = groups.filter((g) => g.length > 1);
  if (single.length) {
    const merged = clusters(single.map((g) => g[0]), 15);
    groups = multi.concat(merged);
  }
  return groups;
}
function lift(items, com, M, bal) {
  const V = verts(items);
  let ymax = -Infinity, ymin = Infinity; for (const v of V) { if (v[1] > ymax) ymax = v[1]; if (v[1] < ymin) ymin = v[1]; }
  const H = ymax - ymin, band = Math.max(2, H * 0.02);
  // kaldırma seviyesi: plan alanının en az %30'unu kaplayan EN ÜST yüzey (üstteki küçük bir motor / kapak değil, gövde)
  let xmin = Infinity, xmax = -Infinity, zmin = Infinity, zmax = -Infinity;
  for (const v of V) { if (v[0] < xmin) xmin = v[0]; if (v[0] > xmax) xmax = v[0]; if (v[2] < zmin) zmin = v[2]; if (v[2] > zmax) zmax = v[2]; }
  const plan = Math.max((xmax - xmin) * (zmax - zmin), 1e-9);
  const levels = [...new Set(V.map((v) => Math.round(v[1])))].sort((a, b) => b - a);
  let level = ymax, hull = null, best = null;
  for (const lv of levels.slice(0, 40)) {
    const h2 = hull2(V.filter((v) => Math.abs(v[1] - lv) <= band).map((v) => [v[0], v[2]]));
    const ar = h2.length >= 3 ? polyArea(h2) : 0;
    if (!best || ar > best.ar) best = { lv, h2, ar };
    if (ar >= 0.3 * plan) { level = lv; hull = h2; break; }
  }
  if (!hull) { level = best ? best.lv : ymax; hull = best ? best.h2 : hull2(V.filter((v) => v[1] >= ymax - band).map((v) => [v[0], v[2]])); }
  // seviyenin gerçek yüksekliği (yuvarlamadan önce)
  const lvY = V.filter((v) => Math.abs(v[1] - level) <= band).reduce((m, v) => Math.max(m, v[1]), -Infinity);
  let pts;
  if (hull.length >= 3) {
    // dört köşe: köşegen yönlerinde en uçtaki noktalar
    const pick = (fx, fz) => hull.reduce((b, q) => (q[0] * fx + q[1] * fz > b[0] * fx + b[1] * fz ? q : b), hull[0]);
    pts = [pick(1, 1), pick(1, -1), pick(-1, -1), pick(-1, 1)];
    pts = pts.filter((q, i) => pts.findIndex((o) => Math.hypot(o[0] - q[0], o[1] - q[1]) < 1) === i);
  } else pts = hull.length ? hull : [[com[0], com[2]]];
  const p = [com[0], com[2]];
  const inside = pts.length >= 3 ? inPoly(pts, p) : pts.length === 2 ? segDist(p, pts[0], pts[1]) < 1 : Math.hypot(pts[0][0] - p[0], pts[0][1] - p[1]) < 1;
  const F = supportLoads(pts, p[0], p[1], M);
  const hookAbove = lvY - com[1];
  const R = Math.max(...pts.map((q) => Math.hypot(q[0] - p[0], q[1] - p[1])));
  const legs = [60, 45].map((ang) => ({ ang, factor: 1 / Math.sin(ang * Math.PI / 180), legKg: F.map((f) => f / Math.sin(ang * Math.PI / 180)), hookHeight: R * Math.tan(ang * Math.PI / 180) }));
  const res = { kg: M, N: M * G, points: pts.map((q, i) => ({ x: q[0], y: lvY, z: q[1], kg: F[i] })), inside, hookAbove, legs, comHeight: com[1] - ymin, aboveParts: lvY < ymax - band };
  const verify = ['Kaldırma noktaları yalnızca geometrik öneridir: kaldırma kulağı / mapa, kaynakları ve taşıyan profil MÜHENDİSLİK HESABIYLA doğrulanmalıdır.'];
  if (M > 1000) verify.unshift('Toplam ağırlık 1 tonun üzerinde: kaldırma planı ve ekipman seçimi yetkili kişi tarafından yapılmalı.');
  if (!inside) verify.unshift('Ağırlık merkezi önerilen kaldırma noktalarının arasında değil: yük kaldırılınca devrilir / eğilir. Kaldırma noktalarını ağırlık merkezi etrafında yeniden seç.');
  const mx = Math.max(...F);
  if (pts.length >= 3 && mx > M * 0.4) verify.push('Bir kaldırma noktası toplam ağırlığın %' + Math.round(mx / M * 100) + "'ini taşıyor (dengesiz); sapan boyları eşit olursa yük eğik kalkar, ayarlı sapan kullan.");
  if (bal && bal.offset && Math.max(Math.abs(bal.offset[0]), Math.abs(bal.offset[1])) > 0.2) verify.push('Forklift: çatallar ağırlık merkezinin iki yanına eşit aralıkla girmeli (merkez X ' + Math.round(com[0]) + ' / Z ' + Math.round(com[2]) + ' mm); ağırlık merkezi gövde ortasında değil.');
  if (res.aboveParts) verify.push('Kaldırma seviyesinin üstünde parçalar var (en üst nokta Y ' + Math.round(ymax) + ' mm); sapanlar bu parçalara sürtmemeli, gerekirse ayırıcı (traversi) kullan.');
  if (hookAbove < 0) {
    // asılı yük, kanca (asma noktası) ağırlık merkezinin üstündeyse dengededir
    const d = -hookAbove, h60 = legs[0].hookHeight;
    if (h60 > d + 50) verify.push('Ağırlık merkezi kaldırma noktalarından ' + Math.round(d) + ' mm yukarıda. 60° sapanla kanca kaldırma noktalarından ' + Math.round(h60) + ' mm yukarıda olur, ağırlık merkezinin üstünde kalır (asılı yük dengede); sapan boyu bundan kısa olmamalı.');
    else verify.unshift('Ağırlık merkezi kaldırma noktalarından ' + Math.round(d) + ' mm yukarıda ve 60° sapanla kanca ancak ' + Math.round(h60) + ' mm yukarıda: kanca ağırlık merkezinin üstüne çıkmazsa yük ters döner. Daha uzun sapan / traversi kullan ya da kaldırma noktalarını yükselt.');
  }
  res.notes = verify;
  return res;
}
