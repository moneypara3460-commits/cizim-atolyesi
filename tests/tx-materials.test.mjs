// Çalıştır: node tests/tx-materials.test.mjs
// Tekstil — Aşama 6: kumaş, iplik, aksesuar kütüphanesi; numara dönüşümleri; tüketim, gramaj, maliyet.
import assert from 'node:assert/strict';
import * as C from '../tx/curve.js';
import * as P from '../tx/woven/pattern.js';
import * as X from '../tx/materials.js';
import * as S from '../tx/knit/shape.js';
import * as M from '../tx/model.js';

let fail = 0;
const tests = [];
const t = (name, fn) => tests.push([name, fn]);
const near = (a, b, tol, m = '') => assert.ok(Math.abs(a - b) <= tol, `${m} ${a} ≉ ${b} (±${tol})`);

t('1. İplik numarası: Nm 28 = 35,71 tex; Ne 30 = 19,68 tex; dtex = 10 tex; den = 9 tex; gidiş-dönüş tam; 2 katlı Nm 2/28 = 71,43 tex', () => {
  near(X.toTex(28, 'Nm'), 1000 / 28, 1e-12); near(X.toTex(30, 'Ne'), 590.5 / 30, 1e-12); near(X.fromTex(20, 'dtex'), 200, 1e-12); near(X.fromTex(20, 'den'), 180, 1e-12);
  for (const sys of ['tex', 'dtex', 'den', 'Nm', 'Ne']) for (const sys2 of ['tex', 'dtex', 'den', 'Nm', 'Ne']) near(X.convertCount(X.convertCount(37, sys, sys2), sys2, sys), 37, 1e-9, sys + '→' + sys2);
  near(X.convertCount(28, 'Nm', 'Ne'), 28 * 0.5905, 1e-9, 'Ne = 0,5905 × Nm');
  const c = X.allCounts(28, 'Nm', 2); near(c.tex, 2000 / 28, 1e-9); near(c.Nm, 14, 1e-9);
  assert.throws(() => X.toTex(0, 'Nm'), /sıfırdan büyük/); assert.throws(() => X.toTex(5, 'lea'), /Bilinmeyen/);
});

t('2. Hazır kartlar: her kart geçerli, sayısal alanları "tahmini" işaretli; projeye eklenince doğrulama temiz', () => {
  const p = M.createProject({ name: 'H', type: 'mixed' });
  for (const k of ['fabric', 'yarn', 'trim']) X.PRESETS[k].forEach((_, i) => { const m = M.addPresetMaterial(p, k, i); assert.deepEqual(M.validate(p).filter((x) => x.level === 'hata'), [], m.name); if (k !== 'trim') assert.ok(m.estimated.length > 0, m.name); });
  assert.throws(() => M.addPresetMaterial(p, 'fabric', 99), /Hazır kart yok/);
});

t('3. Dokuma tüketimi: dikdörtgen parça (kesim 220 × 320 mm, 2 adet) en 1500 mm, verim %80, çekme yok, kayıp 0 → 0,11733 m; çekme %3 / %2 ile büyür; katlı parça 2 kat', () => {
  const rect = (w, h, o = {}) => P.makePiece({ name: 'r', qty: 2, ...o, edges: [[0, 0], [w, 0], [w, h], [0, h]].map((p, i, a) => ({ segs: [C.line(p, a[(i + 1) % 4])], allow: 10 })) });
  const f = { name: 'k', props: { width: 1500, gsm: 100, shrinkWarp: 0, shrinkWeft: 0 } };
  const r = X.wovenConsumption([rect(200, 300)], f, { efficiency: 0.8, extra: 0 });
  near(r.cutArea, 2 * 220 * 320, 1e-6); near(r.lengthM, 2 * 220 * 320 / (1500 * 0.8) / 1000, 1e-12);
  near(r.garmentFabricG, 2 * 220 * 320 / 1e6 * 100, 1e-9); near(r.weightG, r.lengthM * 1.5 * 100, 1e-9);
  const s = X.wovenConsumption([rect(200, 300)], { ...f, props: { ...f.props, shrinkWarp: 3, shrinkWeft: 2 } }, { efficiency: 0.8, extra: 0 });
  near(s.lengthM / r.lengthM, 1 / (0.97 * 0.98), 1e-12);
  const fold = X.wovenConsumption([rect(200, 300, { fold: 3, qty: 1 })], f, { efficiency: 1, extra: 0 });
  near(fold.cutArea, 2 * 210 * 320, 1e-6, 'kat kenarına pay yok, alan 2 kat');
  assert.throws(() => X.wovenConsumption([rect(10, 10)], { name: 'x', props: {} }), /en bilinmiyor/);
  assert.ok(X.wovenConsumption([rect(10, 10)], { name: 'x', props: { width: 1000 } }).notes.some((n) => /çekme oranı bilinmiyor/.test(n)));
});

t('4. Triko ilmek toplamı: kol = sıra başına ilmeklerin toplamı (kapalı biçim ile aynı); beden = düz kısım + iki omuz', () => {
  const sw = { st10: 28, row10: 38 };
  const k = S.computePiece('kol', { cuffW: 200, upperW: 380, length: 560, ribH: 60 }, sw);
  let expect = 0; for (let row = 1; row <= k.rows; row++) expect += k.castOn + 2 * k.steps.filter((s) => s <= row).length;
  assert.equal(X.knitStitchTotal(k), expect);
  const b = S.computePiece('beden', { width: 520, length: 650, ribH: 60, armhole: 220, neckW: 180, neckD: 80 }, sw);
  const nr = b.rows - (b.plan.at(-1).from - 1);
  assert.equal(X.knitStitchTotal(b), b.castOn * (b.rows - nr) + 2 * b.shoulderSt * nr);
  const a = S.computePiece('atki', { width: 280, length: 1600, ribH: 40 }, sw); assert.equal(X.knitStitchTotal(a), a.castOn * a.rows);
});

t('5. İplik gramajı = ilmek × ilmek boyu × tex; ilmek boyu önceliği: ölçülen > tartılan numune > numune sıklığı tahmini; uyumsuz numune uyarısı', () => {
  const y = { name: 'y', props: { count: 28, countSystem: 'Nm', ply: 2 } }, tex = 2000 / 28;
  const m = X.yarnConsumption(10000, y, { st10: 28, row10: 38, loopLen: 6 }, { waste: 0 });
  near(m.lengthM, 60, 1e-9); near(m.grams, 60 * tex / 1000, 1e-12); assert.equal(m.estimated, false); assert.match(m.method, /ölçülen/);
  // tartılan numune: 40 × 50 ilmek, 1,5 g → ilmek boyu = (1,5 / tex · 10⁶) / 2000 mm
  const w = X.yarnConsumption(2000, y, { st10: 28, row10: 38, weightG: 1.5, wSt: 40, wRows: 50 }, { waste: 0 });
  near(w.grams, 1.5, 1e-9, 'tartılan numunenin kendi ilmek sayısı → kendi ağırlığı'); assert.match(w.method, /tartılan/);
  const e = X.yarnConsumption(10000, y, { st10: 28, row10: 38 }); assert.equal(e.estimated, true);
  near(e.loop, Math.sqrt(19 / (2.8 * 3.8)) * 10, 1e-9); near(e.gramsWithWaste, e.grams * 1.05, 1e-12);
  assert.match(e.warn, /uyumsuz/, 'Nm 2/28 ile 28 ilmek/10 cm uyumsuz');
  const ok = X.yarnConsumption(10000, { props: { count: 4, countSystem: 'Nm', ply: 2 } }, { st10: 28, row10: 38 }); assert.equal(ok.warn, '');
  assert.throws(() => X.yarnConsumption(10, { name: 'n', props: {} }, {}), /numara bilinmiyor/);
});

t('6. Ürün tüketimi ve maliyet: gömlek kalıbı + poplin (m) bedene göre metre ve maliyet; elle girilen miktar önceliklidir; eksik kumaş bağı hata olarak raporlanır', () => {
  const p = M.createProject({ name: 'Ü', type: 'woven' });
  const g = M.addProduct(p, { branch: 'woven', type: 'gomlek' });
  M.addPatternSet(p, 'gomlek', {}, { product: g.id, size: 'M' });
  let c = M.productConsumption(p, g.id); assert.ok(c.errors.some((e) => /ana kumaş bağlı değil/.test(e)));
  const f = M.addPresetMaterial(p, 'fabric', 0); f.price = 100; M.linkMaterial(p, g.id, f.id, 'ana', null);
  c = M.productConsumption(p, g.id); const q = c.sizes.M[f.id].qty;
  assert.ok(q > 1 && q < 2.5, 'gömlek için makul metre: ' + q); assert.equal(c.errors.length, 0);
  const cost = M.materialCost(p, g.id, c.sizes.M); near(cost.total, q * 100, 1e-9); assert.ok(cost.lines[0].computed && cost.lines[0].estimated);
  g.materials[0].qty = 1.6; near(M.materialCost(p, g.id, c.sizes.M).total, 160, 1e-9);
  const s = M.techpackSummary(p, g.id); assert.ok(s.consumption.sizes.M && s.consumption.cost.M);
});

t('7. Triko ürün gramajı: kazak (beden ×2 + kol ×2) iplik gramı ve kg maliyeti; ana iplik yoksa hata', () => {
  const p = M.createProject({ name: 'K', type: 'knit' });
  const kz = M.addProduct(p, { branch: 'knit', type: 'kazak' });
  const sw = M.addSwatch(p, { name: 'N', st10: 28, row10: 38, washed: true, loopLen: 9 });
  for (const kind of ['beden', 'beden', 'kol', 'kol']) M.addKnitPiece(p, { kind, swatch: sw.id, product: kz.id, size: 'M' });
  assert.ok(M.productConsumption(p, kz.id).errors.some((e) => /ana iplik/.test(e)));
  const y = M.addMaterial(p, 'yarn', { name: 'Yün', props: { countSystem: 'Nm', count: 8, ply: 2 }, price: 800, priceUnit: 'kg' }); M.linkMaterial(p, kz.id, y.id, 'ana', null);
  const c = M.productConsumption(p, kz.id), r = c.sizes.M[y.id];
  const tot = p.knit.pieces.reduce((a, pc) => a + X.knitStitchTotal(M.knitCompute(p, pc)), 0);
  assert.equal(r.stitches, tot); near(r.grams, tot * 9 / 1000 * (2000 / 8) / 1000 * 1.05, 1e-9);
  near(M.materialCost(p, kz.id, c.sizes.M).total, r.grams / 1000 * 800, 1e-9);
  assert.equal(r.estimated, false, 'ölçülen ilmek boyu');
});

for (const [name, fn] of tests) {
  try { await fn(); console.log('ok   ', name); }
  catch (e) { fail++; console.log('FAIL ', name, '\n     ', String(e.message).split('\n')[0]); }
}
console.log(fail ? `\n${fail} test başarısız` : '\nTüm testler geçti');
process.exit(fail ? 1 : 0);
