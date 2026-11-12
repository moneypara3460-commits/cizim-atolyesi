// Çalıştır: node tests/tx-marker.test.mjs
// Tekstil — Aşama 7: kumaş yerleşimi (kesim planı), kısıtlar, verim / fire, tüketim, çıktı.
import assert from 'node:assert/strict';
import * as C from '../tx/curve.js';
import * as P from '../tx/woven/pattern.js';
import * as B from '../tx/woven/blocks.js';
import * as K from '../tx/woven/marker.js';
import * as M from '../tx/model.js';
import { markerSVG, markerPDF } from '../tx/woven/marker-ui.js';

let fail = 0;
const tests = [];
const t = (name, fn) => tests.push([name, fn]);
const near = (a, b, tol, m = '') => assert.ok(Math.abs(a - b) <= tol, `${m} ${a} ≉ ${b} (±${tol})`);
const rect = (w, h, o = {}) => P.makePiece({ name: o.name || 'r', qty: 1, grain: [[w / 2, h * 0.2], [w / 2, h * 0.8]], ...o, edges: [[0, 0], [w, 0], [w, h], [0, h]].map((p, i, a) => ({ segs: [C.line(p, a[(i + 1) % 4])], allow: 0 })) });
const fab = (props) => ({ id: 'f', name: 'Kumaş', kind: 'fabric', props: { width: 1500, ...props } });
// iki yerleşmiş çokgen gerçekten kesişiyor mu (alan > 0): kenar kesişimi ya da biri diğerinin içinde
function overlaps(a, b) {
  const ba = P.bboxPts(a), bb = P.bboxPts(b); if (ba.x1 <= bb.x0 + 1e-6 || bb.x1 <= ba.x0 + 1e-6 || ba.y1 <= bb.y0 + 1e-6 || bb.y1 <= ba.y0 + 1e-6) return false;
  const cr = (o, p, q) => (p[0] - o[0]) * (q[1] - o[1]) - (p[1] - o[1]) * (q[0] - o[0]);
  for (let i = 0; i < a.length; i++) for (let j = 0; j < b.length; j++) { const p1 = a[i], p2 = a[(i + 1) % a.length], q1 = b[j], q2 = b[(j + 1) % b.length]; const d1 = cr(q1, q2, p1), d2 = cr(q1, q2, p2), d3 = cr(p1, p2, q1), d4 = cr(p1, p2, q2); if (((d1 > 1e-6 && d2 < -1e-6) || (d1 < -1e-6 && d2 > 1e-6)) && ((d3 > 1e-6 && d4 < -1e-6) || (d3 < -1e-6 && d4 > 1e-6))) return true; }
  const c = (pts) => { const q = P.bboxPts(pts); return [(q.x0 + q.x1) / 2, (q.y0 + q.y1) / 2]; };
  return P.insidePoly(b, c(a)) || P.insidePoly(a, c(b));
}

t('1. Bilinen optimum: 4 adet 370 (en) × 300 (boy) mm dikdörtgen, kullanılabilir en 1480 mm, aralık 0 → tek sıra, boy 300 mm, verim %100', () => {
  const r = K.makeMarker([rect(370, 300, { qty: 4 })], fab({ width: 1500 }), { selvedge: 10, gap: 0, res: 5 });
  assert.equal(r.fails.length, 0); near(r.eval.length, 300, 1e-6); near(r.eval.efficiency, 1, 1e-9); assert.equal(r.eval.pieceCount, 4);
  near(r.eval.efficiency, r.eval.usedArea / r.eval.fabricArea, 1e-12, 'verim = kullanılan / (boy × en)'); near(r.eval.waste, 1 - r.eval.efficiency, 1e-12);
});

t('2. Gömlek, açık en: çakışma yok (tam çokgen testi), hepsi en içinde, adetler tam, verim %60 üstü, 2 s altında', () => {
  const g = B.buildSet('gomlek', {}), r = K.makeMarker(g.pieces, fab({}), { mode: 'single' });
  assert.equal(r.fails.length, 0); assert.deepEqual(r.eval.issues.filter((x) => x.level === 'hata'), []);
  const ps = r.eval.polys; for (let i = 0; i < ps.length; i++) { const b = P.bboxPts(ps[i].pts); assert.ok(b.y0 >= -1e-6 && b.y1 <= r.marker.width + 1e-6 && b.x0 >= -1e-6, 'en dışı'); for (let j = i + 1; j < ps.length; j++) assert.ok(!overlaps(ps[i].pts, ps[j].pts), ps[i].it.pc.name + ' ∩ ' + ps[j].it.pc.name); }
  const need = g.pieces.reduce((a, pc) => a + pc.qty * (pc.foldEdge != null ? 1 : 1), 0); assert.ok(r.eval.pieceCount >= need, 'adet');
  assert.ok(r.eval.efficiency > 0.6, 'verim ' + r.eval.efficiency); assert.ok(r.marker.ms < 2000, r.marker.ms + ' ms');
});

t('3. Çift parça: tek kat serimde ikinci adet ayna (ters) yerleşir; kumaş katında tek yerleşim çift kesim sayılır', () => {
  const pc = rect(200, 300, { qty: 2, name: 'Ön', pair: true }), r = K.makeMarker([pc], fab({}), { mode: 'single' });
  const pl = r.marker.placements; assert.equal(pl.length, 2); assert.equal(pl.filter((x) => x.flip).length, 1, 'biri ters');
  const f = K.makeMarker([pc], fab({}), { mode: 'folded' }); assert.equal(f.eval.layers, 2); assert.equal(f.marker.placements.length, 1, 'katlı: tek yerleşim iki kat keser');
});

t('4. Havlı / yönlü kumaş: hiçbir parça 180° çevrilmez; elle çevrilirse doğrulama hata verir', () => {
  const g = B.buildSet('gomlek', {}), r = K.makeMarker(g.pieces, fab({ nap: true }), { mode: 'single' });
  assert.ok(r.marker.placements.every((x) => !x.rot)); assert.ok(r.marker.constraints.some((c) => /hav|yön/i.test(c)));
  const m = JSON.parse(JSON.stringify(r.marker)); m.placements[0].rot = 180; assert.ok(K.evaluate(g.pieces, m).issues.some((x) => x.level === 'hata' && /hav|yön|çevril/i.test(x.msg)));
});

t('5. Katlı serim: kumaş katı kenarlı parça kat çizgisine (y = 0) oturur; kat kenarı düz boya dik ise açılır ve uyarı verir', () => {
  const g = B.buildSet('gomlek', {}), r = K.makeMarker(g.pieces, fab({}), { mode: 'folded' });
  near(r.marker.width, (1500 - 20) / 2, 1, 'kullanılabilir en yarı');
  const folds = r.marker.placements.filter((x) => x.onFold); assert.ok(folds.length > 0);
  for (const pl of folds) { const q = r.eval.polys.find((x) => x.pl.key === pl.key); near(P.bboxPts(q.pts).y0, 0, 1e-6, 'kat çizgisi'); }
  assert.deepEqual(r.eval.issues.filter((x) => x.level === 'hata'), []);
  assert.ok(r.warn.some((w) => /düz boya dik/.test(w)), 'dik kat kenarı uyarısı');
});

t('6. Desen eşleştirme: rapor 100 × 80 mm; her parçanın düz boy referansı rapor ızgarasına oturur', () => {
  const e = B.buildSet('etek', {}), r = K.makeMarker(e.pieces, fab({ repeatH: 100, repeatW: 80 }), { mode: 'single', patternMatch: true });
  assert.equal(r.fails.length, 0); assert.deepEqual(r.eval.issues.filter((x) => x.level === 'hata'), []);
  const { list } = K.instancesFor(e.pieces, 'single'), md = (v, k) => { const q = ((v % k) + k) % k; return Math.min(q, k - q); };
  for (const pl of r.marker.placements) {
    const it = list.find((x) => x.key === pl.key), o = K.orient(it, pl.rot), g = o.T(C.mul(C.add(it.pc.grain[0], it.pc.grain[1]), 0.5));
    near(md(g[0] - o.minX + pl.x, 100), 0, 1e-6, it.pc.name + ' boy raporu'); near(md(g[1] - o.minY + pl.y, 80), 0, 1e-6, it.pc.name + ' en raporu');
  }
  assert.ok(r.marker.constraints.some((c) => /desen|rapor/i.test(c)));
});

t('7. Doğrulama: çakışma, en dışı ve eksik parça hata olarak raporlanır', () => {
  const pcs = [rect(300, 300, { qty: 2, name: 'K' })], r = K.makeMarker(pcs, fab({}), { gap: 0 });
  const m = JSON.parse(JSON.stringify(r.marker)); m.placements[1].x = m.placements[0].x; m.placements[1].y = m.placements[0].y;
  assert.ok(K.evaluate(pcs, m).issues.some((x) => x.level === 'hata' && /üst üste/.test(x.msg)));
  const m2 = JSON.parse(JSON.stringify(r.marker)); m2.placements[0].y = m2.width - 10; assert.ok(K.evaluate(pcs, m2).issues.some((x) => x.level === 'hata' && /en/i.test(x.msg)));
  const m3 = JSON.parse(JSON.stringify(r.marker)); m3.placements.pop(); assert.ok(K.evaluate(pcs, m3).issues.some((x) => x.level === 'hata'));
});

t('8. Model: addMarker kaydeder, validate temiz; tüketim varsayımlı verim yerine plan boyunu (+ 2 × 2 cm) kullanır; maliyet buna göre', () => {
  const p = M.createProject({ name: 'K', type: 'woven' }), g = M.addProduct(p, { branch: 'woven', type: 'gomlek' });
  M.addPatternSet(p, 'gomlek', {}, { product: g.id, size: 'M' });
  const f = M.addMaterial(p, 'fabric', { name: 'Poplin', props: { width: 1500, gsm: 120 }, price: 100, priceUnit: 'm' }); M.linkMaterial(p, g.id, f.id, 'ana', null);
  const before = M.productConsumption(p, g.id).sizes.M[f.id];
  const r = M.addMarker(p, { product: g.id, size: 'M', fabric: f.id });
  assert.equal(p.woven.markers.length, 1); assert.deepEqual(M.validate(p).filter((x) => x.level === 'hata' && /Kesim/.test(x.where || x.msg || '')), []);
  const c = M.productConsumption(p, g.id), q = c.sizes.M[f.id];
  near(q.qty, (r.eval.length + 40) / 1000, 1e-9, 'plan boyu'); assert.ok(q.detail.marker); assert.ok(c.notes.some((n) => /kesim planından/.test(n)));
  assert.notEqual(q.qty, before.qty); near(M.materialCost(p, g.id, c.sizes.M).total, q.qty * 100, 1e-6);
  M.addMarker(p, { product: g.id, size: 'M', fabric: f.id, mode: 'folded' }); assert.equal(p.woven.markers.length, 1, 'aynı beden: yerine geçer');
  const q2 = M.productConsumption(p, g.id).sizes.M[f.id]; near(q2.qty, (K.evaluate(p.woven.pieces.filter((x) => x.fabric === 'ana'), p.woven.markers[0]).length + 40) / 1000 * 2, 1e-9, 'katlı: boy × 2');
  // çekme: boy çekmesi %3 boya eklenir, en çekmesi uyarılır
  f.props.shrinkWarp = 3; f.props.shrinkWeft = 2; const cs = M.productConsumption(p, g.id), Lf = K.evaluate(p.woven.pieces.filter((x) => x.fabric === 'ana'), p.woven.markers[0]).length;
  near(cs.sizes.M[f.id].qty, (Lf / 0.97 + 40) / 1000 * 2, 1e-9, 'boy çekmesi'); assert.ok(cs.notes.some((n) => /en çekmesi %2 planda yok/.test(n)));
  // bozuk plan: tüketim varsayıma döner ve hata yazar
  p.woven.markers[0].placements.pop(); const c3 = M.productConsumption(p, g.id); assert.ok(c3.errors.some((e) => /kesim planında hata/.test(e))); assert.ok(!c3.sizes.M[f.id].detail.marker);
  assert.ok(M.validate(p).some((x) => x.level === 'hata'));
  assert.throws(() => M.addMarker(p, { product: g.id, size: 'XL', fabric: f.id }), /parçası yok/);
  // JSON gidiş-dönüş
  const p2 = M.migrate(JSON.parse(JSON.stringify(p))); assert.equal(p2.woven.markers.length, 1);
});

t('9. Çıktılar: SVG 1:1 (mm) tüm parçaları içerir; PDF A3 geçerli, ölçek etiketli ve kısıtları yazar', () => {
  const g = B.buildSet('gomlek', {}), r = K.makeMarker(g.pieces, fab({}), {});
  const svg = markerSVG(g.pieces, r.marker); assert.equal((svg.match(/<path /g) || []).length, r.eval.polys.length); assert.match(svg, /mm" height="/);
  const pdf = markerPDF(g.pieces, r.marker, { meta: { product: 'Gömlek', size: 'M', fabric: 'Poplin' } });
  const txt = Buffer.from(pdf.bytes).toString('latin1'); assert.match(txt, /^%PDF-/); assert.match(txt, /%%EOF\s*$/); assert.match(txt, /1:\d+/); assert.ok(pdf.pages >= 1); assert.ok([5, 10, 20, 25, 50].includes(pdf.scale));
});

t('10. Desteklenmeyen / eksik: kumaş eni yok, desen raporu yok, parça enden geniş, düz boy yok → açık hata', () => {
  assert.throws(() => K.makeMarker([rect(100, 100)], fab({}), { patternMatch: true }), /desen raporu/);
  const ng = K.makeMarker([rect(100, 100, { grain: null, name: 'Düzsüz' })], fab({}), {}); assert.ok(ng.eval.issues.some((x) => x.level === 'hata' && /Düzsüz/.test(x.msg)));
  assert.throws(() => K.makeMarker([rect(100, 100)], { name: 'x', props: {} }, {}), /en/i);
  const r = (() => { try { return K.makeMarker([rect(2000, 1600)], fab({}), {}); } catch (e) { return e; } })();
  assert.ok(r instanceof Error ? /en|sığ/i.test(r.message) : r.fails.length === 1);
});

for (const [name, fn] of tests) {
  try { await fn(); console.log('ok   ', name); }
  catch (e) { fail++; console.log('FAIL ', name, '\n     ', String(e.message).split('\n')[0]); }
}
console.log(fail ? `\n${fail} test başarısız` : '\nTüm testler geçti');
process.exit(fail ? 1 : 0);
