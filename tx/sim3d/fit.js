// 3B önizleme için kalıp ↔ vücut ölçü karşılaştırması (geometrik; fiziksel değil).
// Giysi çevresi kalıp parçalarının DİKİŞ çizgisinden ölçülür: "yan dikiş" kenarı olan beden parçaları,
// kumaş katlı parça × 2, adetli parça × adet; ön ortada "orta çizgi" varsa pat (üst üste binme) ölçüye katılmaz; pens payları düşülür.
import * as C from '../curve.js?v=20261112j';
import * as P from '../woven/pattern.js?v=20261112j';

// y düzeyinde çokgenin yatay kesitleri (x aralıkları)
function spansAt(pts, y) {
  const xs = [];
  for (let i = 0; i < pts.length; i++) { const a = pts[i], b = pts[(i + 1) % pts.length]; if ((a[1] <= y) !== (b[1] <= y)) xs.push(a[0] + ((b[0] - a[0]) * (y - a[1])) / (b[1] - a[1])); }
  xs.sort((p, q) => p - q); const out = []; for (let i = 0; i + 1 < xs.length; i += 2) out.push([xs[i], xs[i + 1]]); return out;
}
const isBody = (pc) => pc.edges.some((e) => /yan dikiş/.test(e.name || ''));
const centreX = (pc) => { const l = (pc.lines || []).find((q) => q.kind === 'orta çizgi'); if (!l) return null; const s = l.path.segs[0]; return Math.abs(s.a[0] - s.b[0]) < 1e-6 ? s.a[0] : null; };
const count = (pc) => (pc.fold != null ? 2 : pc.qty);
// pens: y düzeyinde pensin iki bacağı arasındaki genişlik (dikişte kapanır)
function dartAt(pc, y) {
  let w = 0;
  for (const d of pc.darts || []) { const top = Math.min(d.a[1], d.b[1], d.apex[1]), bot = Math.max(d.a[1], d.b[1], d.apex[1]); if (y < top || y > bot) continue; const s = spansAt([d.a, d.apex, d.b], y); for (const [x0, x1] of s) w += x1 - x0; }
  return w;
}
// Bir parçanın y düzeyindeki dikiş genişliği (pat ve pens hariç)
export function pieceWidthAt(pc, y) {
  const pts = P.seamPolygon(pc, 0.5), cx = centreX(pc), b = P.bboxPts(pts);
  let w = 0;
  for (let [x0, x1] of spansAt(pts, y)) { if (cx != null) { const fromLeft = Math.abs(cx - b.x0) < Math.abs(cx - b.x1); if (fromLeft) x0 = Math.max(x0, cx); else x1 = Math.min(x1, cx); } if (x1 > x0) w += x1 - x0; }
  return Math.max(0, w - dartAt(pc, y));
}
export function garmentGirth(pieces, y) {
  const body = pieces.filter(isBody); if (!body.length) throw new Error('Yan dikişli beden parçası yok: çevre hesaplanamaz');
  return body.reduce((s, pc) => s + count(pc) * pieceWidthAt(pc, y), 0);
}
// Takım türüne göre ölçü düzeyleri (y: kalıptaki düzey; body: beden tablosundaki ölçü adı; range: önerilen bolluk mm)
export function detectSet(pieces) { const body = pieces.filter(isBody); if (body.some((pc) => pc.edges.some((e) => e.name === 'kol oyuğu'))) return 'gomlek'; if (body.some((pc) => pc.edges.some((e) => e.name === 'bel'))) return 'etek'; return null; }
function levelsFor(set, pieces) {
  set = set || detectSet(pieces);
  const body = pieces.filter(isBody), y0 = Math.min(...body.map((pc) => P.bboxPts(P.seamPolygon(pc, 0.5)).y0)), y1 = Math.max(...body.map((pc) => P.bboxPts(P.seamPolygon(pc, 0.5)).y1));
  if (set === 'gomlek') {
    const pc = body[0], e = pc.edges.find((x) => x.name === 'kol oyuğu'), ua = e ? e.segs.at(-1).b[1] : y0 + 230;
    return [
      { key: 'chest', label: 'Göğüs', y: ua + 2, body: 'Göğüs çevresi', range: [60, 200] },
      { key: 'hem', label: 'Etek ucu', y: y1 - 2, body: 'Kalça çevresi', range: [40, 250], note: 'etek ucu kalça hizasında varsayıldı' },
    ];
  }
  if (set === 'etek') {
    const pc = body[0], e = pc.edges.find((x) => x.name === 'yan dikiş'), hd = e ? e.segs[0].b[1] : y0 + 200;
    return [
      { key: 'waist', label: 'Bel', y: y0 + 0.01, body: 'Bel çevresi', range: [0, 25] },
      { key: 'hip', label: 'Kalça', y: hd, body: 'Kalça çevresi', range: [20, 80] },
      { key: 'hem', label: 'Etek ucu', y: y1 - 2, body: null, range: null },
    ];
  }
  throw new Error('Bu takım için ölçü düzeyleri tanımlı değil: ' + set);
}
// 3B kabuk halkaları: düzeyleri vücut formuna yerleştir (gömlek: göğüs halkası göğse; etek: bel halkası bele)
export function garmentRings(pieces, report, body) {
  const set = detectSet(pieces), byKey = Object.fromEntries(report.map((r) => [r.key, r])), ring = (z, g, level) => ({ z, girth: g, level, ...ellipseAxes(g) });
  const bz = (t) => body.rings.find((r) => Math.abs(r.z + t * body.height) < 1e-6)?.z ?? -t * body.height;
  if (set === 'gomlek') { const c = byKey.chest, h = byKey.hem, len = h.y - c.y; return [ring(bz(0.12), Math.max(c.garment * 0.9, body.rings[1].girth + 20), c.level), ring(bz(0.3), c.garment, c.level), ring(bz(0.3) - len, h.garment, h.level)]; }
  if (set === 'etek') { const w = byKey.waist, hp = byKey.hip, h = byKey.hem, z0 = bz(0.45); return [ring(z0, w.garment, w.level), ring(z0 - (hp.y - w.y), hp.garment, hp.level), ring(z0 - (h.y - w.y), h.garment, h.level === 'bilgi' ? hp.level : h.level)]; }
  throw new Error('3B kabuk bu takım için tanımlı değil');
}
// Dönüş: [{ label, garment, body, ease, status, note }]
export function fitReport(pieces, set, measures = {}) {
  return levelsFor(set, pieces).map((lv) => {
    const garment = garmentGirth(pieces, lv.y), bm = lv.body ? measures[lv.body] : null;
    if (!lv.body) return { ...lv, garment, bodyM: null, ease: null, status: '—', level: 'bilgi' };
    if (!(bm > 0)) return { ...lv, garment, bodyM: null, ease: null, status: `beden tablosunda "${lv.body}" yok`, level: 'uyarı' };
    const ease = garment - bm, [lo, hi] = lv.range;
    const status = ease < 0 ? 'dar: giysi vücuttan küçük' : ease < lo ? 'çok dar' : ease > hi ? 'çok bol' : 'uygun aralıkta';
    return { ...lv, garment, bodyM: bm, ease, status, level: ease < 0 ? 'hata' : ease < lo || ease > hi ? 'uyarı' : 'ok' };
  });
}

/* ---------- basitleştirilmiş vücut formu ---------- */
// Kesitler elips (en / derinlik oranı 1,35). Yükseklik oranları VARSAYIM (boyun 0, göğüs 0,30, bel 0,45, kalça 0,64, diz 0,90 × gövde boyu).
// Boy ölçüsü yoksa gövde boyu 700 mm varsayılır. Kol / bacak yok.
export const BODY_ASSUMPTIONS = 'Kesitler elips (en/derinlik 1,35); düzey yükseklikleri ortalama oranlardan; kol ve bacak yok; duruş düz.';
export function ellipseAxes(girth, ratio = 1.35) {
  // Ramanujan çevre yaklaşımından b'yi çöz (a = ratio·b)
  const f = (b) => { const a = ratio * b, h = ((a - b) / (a + b)) ** 2; return Math.PI * (a + b) * (1 + (3 * h) / (10 + Math.sqrt(4 - 3 * h))); };
  let lo = 1, hi = girth; for (let i = 0; i < 60; i++) { const m = (lo + hi) / 2; if (f(m) < girth) lo = m; else hi = m; }
  const b = (lo + hi) / 2; return { a: ratio * b, b };
}
export function bodyForm(measures = {}) {
  const chest = measures['Göğüs çevresi'] || 960, waist = measures['Bel çevresi'] || chest * 0.82, hip = measures['Kalça çevresi'] || chest * 1.04, neck = measures['Boyun çevresi'] || chest * 0.4;
  const T = measures['Gövde boyu'] || 700;
  const rings = [[0, neck], [0.12, (neck + chest) * 0.55], [0.3, chest], [0.45, waist], [0.64, hip], [0.9, hip * 0.92]];
  return { rings: rings.map(([t, g]) => ({ z: -t * T, girth: g, ...ellipseAxes(g) })), height: T, assumptions: BODY_ASSUMPTIONS };
}
// Triko: beden parçasının genişliği (ön + arka) göğüsle karşılaştırılır; örgü esnediği için hafif negatif bolluk olağan olabilir
export function knitFitReport(widthMM, measures = {}) {
  const garment = 2 * widthMM, bm = measures['Göğüs çevresi'];
  if (!(bm > 0)) return [{ label: 'Göğüs', garment, bodyM: null, ease: null, status: 'beden tablosunda "Göğüs çevresi" yok', level: 'uyarı' }];
  const ease = garment - bm, st = ease < -60 ? 'çok dar (örgü esnemesi bile yetmeyebilir)' : ease > 200 ? 'çok bol' : 'uygun aralıkta (triko: −60 … +200 mm)';
  return [{ label: 'Göğüs', garment, bodyM: bm, ease, status: st, level: ease < -60 || ease > 200 ? 'uyarı' : 'ok', range: [-60, 200] }];
}
