// Çalıştır: node tests/tx-production.test.mjs
// Tekstil — Aşama 10: operasyon listesi, maliyet kartı, sipariş malzeme ihtiyacı, üretim föyü PDF.
import assert from 'node:assert/strict';
import * as PR from '../tx/production.js';
import * as M from '../tx/model.js';
import { productionPDF } from '../tx/production-pdf.js';

let fail = 0;
const tests = [];
const t = (name, fn) => tests.push([name, fn]);
const near = (a, b, tol, m = '') => assert.ok(Math.abs(a - b) <= tol, `${m} ${a} ≉ ${b} (±${tol})`);

t('1. Şablonlar: gömlek / etek / kazak operasyonları geçerli ve "tahmini"; toplam SMV makul (gömlek 15–30 dk); şablonsuz tür açık hata', () => {
  for (const k of ['gomlek', 'etek', 'kazak']) { const o = PR.templateOps(k); assert.deepEqual(PR.validateOps(o), [], k); assert.ok(o.every((x) => x.est)); }
  const s = PR.opsSummary(PR.templateOps('gomlek')); assert.ok(s.total > 15 && s.total < 30, s.total); assert.ok(s.estimated);
  near(Object.values(s.byMachine).reduce((a, v) => a + v, 0), s.total, 1e-9);
  assert.throws(() => PR.templateOps('ceket'), /şablonu yok/);
  assert.ok(PR.validateOps([{ name: '', machine: 'x', smv: -1 }]).filter((x) => x.level === 'hata').length === 3);
});

t('2. Maliyet kartı elle hesapla aynı: malzeme 150 + işçilik 20 dk × 3 / %80 = 75 → 225; genel gider %20 = 45 → 270; kâr %30 → 351; KDV %10 → 386,1', () => {
  const ops = [{ name: 'a', machine: 'duz', smv: 12 }, { name: 'b', machine: 'utu', smv: 8 }];
  const c = PR.costSheet({ matCost: { total: 150, lines: [], missing: [], complete: true }, ops, c: { minuteRate: 3, efficiency: 80, overheadPct: 20, marginPct: 30, vatPct: 10 } });
  near(c.labour, 75, 1e-9); near(c.overhead, 45, 1e-9); near(c.cost, 270, 1e-9); near(c.price, 351, 1e-9); near(c.vat, 386.1, 1e-9); assert.ok(c.complete);
});

t('3. Eksik girdi: dakika ücreti / verim / genel gider / kâr yoksa ilgili kalem ve sonrası null, eksikler listelenir (uydurulmaz)', () => {
  const ops = [{ name: 'a', machine: 'duz', smv: 10 }, { name: 'b', machine: 'duz', smv: null }];
  const c = PR.costSheet({ matCost: { total: 50, lines: [], missing: ['Düğme (fiyat yok)'], complete: false }, ops, c: { minuteRate: 2 } });
  assert.equal(c.labour, null); assert.equal(c.cost, null); assert.equal(c.price, null); assert.equal(c.complete, false);
  for (const re of [/Düğme/, /1 operasyonun süresi yok/, /hat verimi/, /genel gider/, /kâr payı/]) assert.ok(c.missing.some((m) => re.test(m)), re);
});

t('4. Sipariş ihtiyacı: Σ adet × beden tüketimi × (1 + fire); elle miktar önceliklidir; tüketimi olmayan beden raporlanır', () => {
  const mats = [{ id: 'f', name: 'Kumaş', priceUnit: 'm', price: 100 }, { id: 'b', name: 'Düğme', priceUnit: 'adet', price: 1 }];
  const r = PR.orderRequirement({ order: { S: 10, M: 20 }, consumption: { S: { f: { qty: 1.5 } }, M: { f: { qty: 1.6 } } }, manual: { b: 9 }, materials: mats, wastePct: 5 });
  near(r.lines[0].qty, (10 * 1.5 + 20 * 1.6) * 1.05, 1e-9); near(r.lines[1].qty, 30 * 9 * 1.05, 1e-9); assert.equal(r.units, 30);
  near(r.total, r.lines[0].qty * 100 + r.lines[1].qty * 1, 1e-9);
  const r2 = PR.orderRequirement({ order: { L: 5 }, consumption: {}, materials: mats.slice(0, 1) }); assert.ok(r2.problems.some((p) => /L bedeni/.test(p))); assert.equal(r2.total, null);
  assert.ok(PR.orderRequirement({ order: {}, materials: mats }).problems.some((p) => /sipariş/.test(p)));
});

t('5. Model: gömlek + kalıp + poplin; şablon operasyonlar; maliyet bedene göre; sipariş ihtiyacı; doğrulama (tahmini süre uyarısı, geçersiz verim hata); JSON gidiş-dönüş', () => {
  const p = M.createProject({ name: 'Ü', type: 'woven' }), g = M.addProduct(p, { branch: 'woven', type: 'gomlek' });
  M.addPatternSet(p, 'gomlek', {}, { product: g.id, size: 'M' }); g.sizes = ['M'];
  const f = M.addMaterial(p, 'fabric', { name: 'Poplin', props: { width: 1500, gsm: 110 }, price: 120, priceUnit: 'm' }); M.linkMaterial(p, g.id, f.id, 'ana', null);
  M.applyOpTemplate(p, g.id); Object.assign(g.costing, { minuteRate: 2.5, efficiency: 70, overheadPct: 25, marginPct: 40, wastePct: 3 }); g.order = { M: 100 };
  const sh = M.productionSheet(p, g.id), c = sh.perSize.M; assert.ok(c.complete, c.missing.join('; '));
  const mat = sh.consumption.sizes.M[f.id].qty * 120; near(c.mat, mat, 1e-9); near(c.labour, (PR.opsSummary(g.techpack.ops).total * 2.5) / 0.7, 1e-9); near(c.price, (mat + c.labour) * 1.25 * 1.4, 1e-6);
  near(sh.requirement.lines[0].qty, sh.consumption.sizes.M[f.id].qty * 100 * 1.03, 1e-9);
  const v = M.validate(p); assert.ok(v.some((x) => /tahmini/.test(x.msg) && x.where === 'Ürün ' + g.name));
  g.costing.efficiency = 150; assert.ok(M.validate(p).some((x) => x.level === 'hata' && /Hat verimi/.test(x.msg))); g.costing.efficiency = 70;
  g.order.M = 2.5; assert.ok(M.validate(p).some((x) => x.level === 'hata' && /tam sayı/.test(x.msg))); g.order.M = 100;
  M.addOp(p, g.id, { name: 'Ek', machine: 'punteriz' }); assert.equal(M.productionSheet(p, g.id).perSize.M.complete, false, 'süresiz operasyon');
  const p2 = M.migrate(JSON.parse(JSON.stringify(p))); assert.equal(p2.collection.products[0].techpack.ops.length, g.techpack.ops.length); assert.equal(p2.collection.products[0].costing.minuteRate, 2.5);
  const old = JSON.parse(JSON.stringify(p)); delete old.collection.products[0].costing; delete old.collection.products[0].order; const p3 = M.migrate(old); assert.equal(p3.collection.products[0].costing.efficiency, null); assert.deepEqual(p3.collection.products[0].order, {});
});

t('6. Üretim föyü PDF: geçerli, çok sayfalı, bütün bölümler ve "tahmini / eksik / doğrulanmamış" işaretleri metinde', () => {
  const p = M.createProject({ name: 'Föy', type: 'woven' }), g = M.addProduct(p, { branch: 'woven', type: 'gomlek', modelCode: 'GM-01' });
  M.addPatternSet(p, 'gomlek', {}, { product: g.id, size: 'M' }); g.sizes = ['M'];
  const f = M.addMaterial(p, 'fabric', { name: 'Poplin', props: { width: 1500, gsm: 110 }, price: 120, priceUnit: 'm' }); M.linkMaterial(p, g.id, f.id, 'ana', null);
  M.applyOpTemplate(p, g.id); g.costing.minuteRate = 2; g.order = { M: 50 };
  const r = productionPDF(p, g.id), txt = Buffer.from(r.bytes).toString('latin1');
  assert.match(txt, /^%PDF-/); assert.match(txt, /%%EOF\s*$/); assert.ok(r.pages >= 2, 'sayfa ' + r.pages);
  for (const re of [/GM-01/, /Operasyon listesi/, /Maliyet/, /malzeme ihtiyac/i, /tahmini/, /eksik/i]) assert.match(txt, re);
});

for (const [name, fn] of tests) {
  try { await fn(); console.log('ok   ', name); }
  catch (e) { fail++; console.log('FAIL ', name, '\n     ', String(e.message).split('\n')[0]); }
}
console.log(fail ? `\n${fail} test başarısız` : '\nTüm testler geçti');
process.exit(fail ? 1 : 0);
