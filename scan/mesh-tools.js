// Tarama ağı araçları: kaynak (köşe birleştirme), temizleme, sadeleştirme, ölçek, hizalama, ölçüm.
// Ağ biçimi: { V: Float64Array (x y z), F: Uint32Array (üçgen köşe numaraları) }. Saf fonksiyonlar (tests/scan.test.mjs).

export function bboxTris(t) {
  const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < t.length; i += 3) for (let k = 0; k < 3; k++) { const v = t[i + k]; if (v < mn[k]) mn[k] = v; if (v > mx[k]) mx[k] = v; }
  return { min: mn, max: mx, size: [mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2]] };
}

// Aynı yerdeki köşeleri birleştirir (STL'de her üçgen kendi köşelerini taşır)
export function weld(tris, eps) {
  const bb = bboxTris(tris), diag = Math.hypot(...bb.size) || 1;
  const e = eps || diag * 1e-6, inv = 1 / e;
  const map = new Map(), V = [], F = new Uint32Array(tris.length / 3);
  for (let i = 0; i < tris.length; i += 3) {
    const x = tris[i], y = tris[i + 1], z = tris[i + 2];
    const k = Math.round(x * inv) + ',' + Math.round(y * inv) + ',' + Math.round(z * inv);
    let id = map.get(k);
    if (id === undefined) { id = V.length / 3; map.set(k, id); V.push(x, y, z); }
    F[i / 3] = id;
  }
  return dropDegenerate({ V: new Float64Array(V), F });
}

export function toTris(m) {
  const { V, F } = m, t = new Float32Array(F.length * 3);
  for (let i = 0; i < F.length; i++) { const v = F[i] * 3; t[i * 3] = V[v]; t[i * 3 + 1] = V[v + 1]; t[i * 3 + 2] = V[v + 2]; }
  return t;
}

function triArea(V, a, b, c) {
  const ux = V[b * 3] - V[a * 3], uy = V[b * 3 + 1] - V[a * 3 + 1], uz = V[b * 3 + 2] - V[a * 3 + 2];
  const vx = V[c * 3] - V[a * 3], vy = V[c * 3 + 1] - V[a * 3 + 1], vz = V[c * 3 + 2] - V[a * 3 + 2];
  return 0.5 * Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx);
}

// Sıfır alanlı, köşesi tekrar eden ve aynı üçgenin kopyası olan yüzleri atar
export function dropDegenerate(m) {
  const { V, F } = m, out = [], seen = new Set();
  for (let i = 0; i < F.length; i += 3) {
    const a = F[i], b = F[i + 1], c = F[i + 2];
    if (a === b || b === c || a === c) continue;
    if (!(triArea(V, a, b, c) > 1e-12)) continue;
    const k = [a, b, c].sort((p, q) => p - q).join(',');
    if (seen.has(k)) continue;
    seen.add(k); out.push(a, b, c);
  }
  return { V, F: new Uint32Array(out) };
}

// Bağlı parçalar (kenar komşuluğuyla); her biri { faces: [üçgen no], area }
export function components(m) {
  const { V, F } = m, n = F.length / 3, par = new Int32Array(V.length / 3).map((_, i) => i);
  const find = (x) => { while (par[x] !== x) { par[x] = par[par[x]]; x = par[x]; } return x; };
  for (let i = 0; i < F.length; i += 3) { const a = find(F[i]), b = find(F[i + 1]), c = find(F[i + 2]); par[b] = a; par[find(c)] = a; }
  const groups = new Map();
  for (let t = 0; t < n; t++) {
    const r = find(F[t * 3]);
    let g = groups.get(r); if (!g) { g = { faces: [], area: 0 }; groups.set(r, g); }
    g.faces.push(t); g.area += triArea(V, F[t * 3], F[t * 3 + 1], F[t * 3 + 2]);
  }
  return [...groups.values()].sort((a, b) => b.area - a.area);
}

// Taramadaki küçük kopuk parçaları (masa, toz, gürültü) atar: en büyük parçanın alanının `frac` katından küçükler gider
export function removeSmallPieces(m, frac = 0.02) {
  const cs = components(m);
  if (cs.length <= 1) return { mesh: m, removed: 0 };
  const lim = cs[0].area * frac, keep = [];
  let removed = 0;
  for (const c of cs) { if (c.area >= lim) keep.push(...c.faces); else removed++; }
  keep.sort((a, b) => a - b);
  const F = new Uint32Array(keep.length * 3);
  keep.forEach((t, i) => { F[i * 3] = m.F[t * 3]; F[i * 3 + 1] = m.F[t * 3 + 1]; F[i * 3 + 2] = m.F[t * 3 + 2]; });
  return { mesh: compact({ V: m.V, F }), removed };
}

// Kullanılmayan köşeleri atar
export function compact(m) {
  const re = new Int32Array(m.V.length / 3).fill(-1), V = [];
  const F = new Uint32Array(m.F.length);
  for (let i = 0; i < m.F.length; i++) {
    const v = m.F[i];
    if (re[v] < 0) { re[v] = V.length / 3; V.push(m.V[v * 3], m.V[v * 3 + 1], m.V[v * 3 + 2]); }
    F[i] = re[v];
  }
  return { V: new Float64Array(V), F };
}

// Kenar sayımı: kapalı (su geçirmez) mi, delik kenarı ve 2'den çok yüze ait kenar sayısı
export function edgeCheck(m) {
  const cnt = new Map(), F = m.F;
  for (let i = 0; i < F.length; i += 3) for (let k = 0; k < 3; k++) {
    const a = F[i + k], b = F[i + (k + 1) % 3], key = a < b ? a * 4294967296 + b : b * 4294967296 + a;
    cnt.set(key, (cnt.get(key) || 0) + 1);
  }
  let open = 0, nonManifold = 0;
  for (const c of cnt.values()) { if (c === 1) open++; else if (c > 2) nonManifold++; }
  return { closed: open === 0 && nonManifold === 0, openEdges: open, nonManifold };
}

export function measure(m) {
  const { V, F } = m;
  const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < V.length; i += 3) for (let k = 0; k < 3; k++) { if (V[i + k] < mn[k]) mn[k] = V[i + k]; if (V[i + k] > mx[k]) mx[k] = V[i + k]; }
  let area = 0, vol = 0;
  for (let i = 0; i < F.length; i += 3) {
    const a = F[i] * 3, b = F[i + 1] * 3, c = F[i + 2] * 3;
    area += triArea(V, F[i], F[i + 1], F[i + 2]);
    vol += (V[a] * (V[b + 1] * V[c + 2] - V[b + 2] * V[c + 1]) - V[a + 1] * (V[b] * V[c + 2] - V[b + 2] * V[c]) + V[a + 2] * (V[b] * V[c + 1] - V[b + 1] * V[c])) / 6;
  }
  return { tris: F.length / 3, verts: V.length / 3, min: mn, max: mx, size: [mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2]], area, volume: Math.abs(vol), inverted: vol < 0, ...edgeCheck(m) };
}

// Yüzler içe bakıyorsa (hacim eksi) çevirir
export function orientOutward(m) {
  const r = measure(m);
  if (!r.inverted) return m;
  const F = m.F.slice();
  for (let i = 0; i < F.length; i += 3) { const t = F[i + 1]; F[i + 1] = F[i + 2]; F[i + 2] = t; }
  return { V: m.V, F };
}

export function transform(m, fn) {
  const V = new Float64Array(m.V.length);
  for (let i = 0; i < V.length; i += 3) { const p = fn(m.V[i], m.V[i + 1], m.V[i + 2]); V[i] = p[0]; V[i + 1] = p[1]; V[i + 2] = p[2]; }
  return { V, F: m.F };
}
export const scale = (m, s) => transform(m, (x, y, z) => [x * s, y * s, z * s]);

// Eksen değiştirme: Z yukarı olan dosyaları (çoğu tarama / CAD) uygulamanın Y yukarı düzenine çevirir
export const zUpToYUp = (m) => {
  const r = transform(m, (x, y, z) => [x, z, -y]);
  return r;
};

// Alt yüzü y = 0'a, x-z ortasını 0'a getirir
export function toFloor(m) {
  const r = measure(m);
  const cx = (r.min[0] + r.max[0]) / 2, cz = (r.min[2] + r.max[2]) / 2;
  return transform(m, (x, y, z) => [x - cx, y - r.min[1], z - cz]);
}

// Bilinen ölçüyle ölçekleme: `axis` (0 x, 1 y, 2 z) yönündeki boy `value` mm olsun
export function scaleToKnown(m, axis, value) {
  const s = measure(m).size[axis];
  if (!(s > 0) || !(value > 0)) return { mesh: m, factor: 1 };
  const f = value / s;
  return { mesh: scale(m, f), factor: f };
}

// Sadeleştirme (köşe kümeleme): üçgen sayısı `target` altına inene kadar ızgara büyütülür.
// Keskin kenarlarda küçük yumuşama olur; ölçüler hücre boyu kadar (genelde < 0,5 mm) değişebilir: sonuç bu bilgiyi döndürür.
export function simplify(m, target) {
  if (m.F.length / 3 <= target) return { mesh: m, cell: 0 };
  const r = measure(m), diag = Math.hypot(...r.size) || 1;
  let cell = diag / Math.sqrt(target) / 2, best = null;
  for (let it = 0; it < 12; it++) {
    const inv = 1 / cell, map = new Map(), acc = [], re = new Int32Array(m.V.length / 3);
    for (let i = 0; i < m.V.length; i += 3) {
      const k = Math.floor((m.V[i] - r.min[0]) * inv) + ',' + Math.floor((m.V[i + 1] - r.min[1]) * inv) + ',' + Math.floor((m.V[i + 2] - r.min[2]) * inv);
      let id = map.get(k);
      if (id === undefined) { id = acc.length / 4; map.set(k, id); acc.push(0, 0, 0, 0); }
      acc[id * 4] += m.V[i]; acc[id * 4 + 1] += m.V[i + 1]; acc[id * 4 + 2] += m.V[i + 2]; acc[id * 4 + 3]++;
      re[i / 3] = id;
    }
    const V = new Float64Array(acc.length / 4 * 3);
    for (let i = 0; i < acc.length / 4; i++) { V[i * 3] = acc[i * 4] / acc[i * 4 + 3]; V[i * 3 + 1] = acc[i * 4 + 1] / acc[i * 4 + 3]; V[i * 3 + 2] = acc[i * 4 + 2] / acc[i * 4 + 3]; }
    const F = new Uint32Array(m.F.length);
    for (let i = 0; i < F.length; i++) F[i] = re[m.F[i]];
    best = { mesh: compact(dropDegenerate({ V, F })), cell };
    if (best.mesh.F.length / 3 <= target) break;
    cell *= 1.4;
  }
  return best;
}

// Tek komutla içe alma hazırlığı: kaynak, yön, küçük parçaları atma, yere oturtma
export function prepare(tris, opt = {}) {
  let m = weld(tris);
  const notes = [];
  if (opt.zUp) m = zUpToYUp(m);
  if (opt.unit && opt.unit !== 1) m = scale(m, opt.unit);
  if (opt.removeSmall !== false) {
    const r = removeSmallPieces(m, opt.smallFrac ?? 0.02);
    m = r.mesh;
    if (r.removed) notes.push(r.removed + ' küçük kopuk parça (gürültü) atıldı');
  }
  m = orientOutward(m);
  if (opt.maxTris && m.F.length / 3 > opt.maxTris) {
    const s = simplify(m, opt.maxTris);
    m = s.mesh;
    notes.push('sadeleştirildi (ızgara ' + s.cell.toFixed(2) + ' mm)');
  }
  m = toFloor(m);
  return { mesh: m, notes, info: measure(m) };
}
