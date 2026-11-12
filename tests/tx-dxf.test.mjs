// Çalıştır: node tests/tx-dxf.test.mjs
// Tekstil — Aşama 11 (madde 8): kalıp DXF (AAMA / ASTM D6673 düzeni) dışa / içe aktarma, ölçek ve geometri kaybı.
import assert from 'node:assert/strict';
import * as C from '../tx/curve.js';
import * as P from '../tx/woven/pattern.js';
import * as B from '../tx/woven/blocks.js';
import * as X from '../tx/woven/dxf-aama.js';
import * as M from '../tx/model.js';

let fail = 0;
const tests = [];
const t = (name, fn) => tests.push([name, fn]);
const rel = (a, b) => Math.abs(a / b - 1);

t('1. Gidiş-dönüş (mm): gömlek ve etek; dikiş / kesim alanı ve çevresi göreli < 1e-6, kenar sayısı, pay, kat, çıt, pens, düz boy, ad, adet korunur', () => {
  for (const set of ['gomlek', 'etek']) {
    const g = B.buildSet(set, B.defaultParams(set)), r = X.readAAMA(X.writeAAMA(g.pieces));
    assert.equal(r.units, 'mm'); assert.deepEqual(r.warnings, []); assert.equal(r.pieces.length, g.pieces.length);
    g.pieces.forEach((a, i) => {
      const b = r.pieces[i], ma = P.measure(a), mb = P.measure(b);
      for (const k of ['seamArea', 'seamPerimeter', 'cutArea', 'cutPerimeter']) assert.ok(rel(mb[k], ma[k]) < 1e-6, `${a.name} ${k} ${mb[k]} / ${ma[k]}`);
      assert.equal(b.name, a.name); assert.equal(b.qty, a.qty); assert.equal(b.pair, a.pair); assert.equal(b.fold, a.fold); assert.equal(b.edges.length, a.edges.length);
      assert.deepEqual(b.edges.map((e) => e.allow), a.edges.map((e) => e.allow), a.name + ' pay');
      assert.equal(b.notches.length, a.notches.length); assert.equal(b.darts.length, a.darts.length); assert.ok(b.grain);
      b.notches.forEach((n, k) => { assert.equal(n.edge, a.notches[k].edge); assert.ok(Math.abs(n.at - a.notches[k].at) < 0.6, `${a.name} çıt ${n.at} / ${a.notches[k].at}`); });
      assert.deepEqual(P.validatePiece(b).filter((x) => x.level === 'hata'), [], b.name);
    });
  }
});

t('2. Ölçek: inç ve cm yazılıp okununca mm geri gelir; inç dosyada 1 inç = 25,4 mm; başlıksız dosyada mm varsayımı uyarısı', () => {
  const sq = P.makePiece({ name: 'Kare', grain: [[50, 20], [50, 80]], edges: [[0, 0], [100, 0], [100, 100], [0, 100]].map((p, i, a) => ({ segs: [C.line(p, a[(i + 1) % 4])], allow: 10 })) });
  for (const u of ['inch', 'cm']) { const r = X.readAAMA(X.writeAAMA([sq], { units: u })); assert.equal(r.units, u); assert.ok(rel(P.measure(r.pieces[0]).seamArea, 10000) < 1e-6, u); }
  const inch = X.writeAAMA([sq], { units: 'inch' }); assert.match(inch, /\n3\.937008\n/, "100 mm = 3,937008 inç");
  const noHdr = X.writeAAMA([sq]).replace(/\n9\n\$INSUNITS\n70\n4\n/, "\n").replace(/Units: METRIC/, 'X: y');
  const r = X.readAAMA(noHdr); assert.ok(r.warnings.some((w) => /milimetre varsayıldı/.test(w))); assert.ok(rel(P.measure(r.pieces[0]).seamArea, 10000) < 1e-9);
});

t('3. Katmanlar AAMA düzeninde: 1 kesim, 14 dikiş, 7 düz boy, 6 ayna, 4 çıt, 2 dönüş noktası, 15 açıklama; BLOCK + INSERT', () => {
  const g = B.buildSet('gomlek', B.defaultParams('gomlek')), txt = X.writeAAMA(g.pieces);
  for (const ly of ['1', '14', '7', '6', '4', '2', '15']) assert.ok(new RegExp(`\\n8\\n${ly}\\n`).test(txt), 'katman ' + ly);
  assert.equal((txt.match(/\n0\nBLOCK\n/g) || []).length, 7); assert.equal((txt.match(/\n0\nINSERT\n/g) || []).length, 7);
  assert.match(txt, /Piece Name: Ön beden/); assert.match(txt, /Quantity: 2 \(pair\)/); assert.match(txt, /\$INSUNITS\n70\n4\n/);
});

t('4. Başka programın düz DXF\'i: bloksuz, LWPOLYLINE kesim hattı (1) → parça, pay 0 uyarısı; desteklenmeyen ARC / SPLINE açık uyarı; parça yoksa açık hata; bozuk dosya hata', () => {
  const dxf = ['0', 'SECTION', '2', 'ENTITIES', '0', 'LWPOLYLINE', '8', '1', '70', '1', '10', '0', '20', '0', '10', '200', '20', '0', '10', '200', '20', '300', '10', '0', '20', '300', '0', 'LINE', '8', '7', '10', '100', '20', '50', '11', '100', '21', '250', '0', 'SPLINE', '8', '8', '0', 'ENDSEC', '0', 'EOF'].join('\n');
  const r = X.readAAMA(dxf); assert.equal(r.pieces.length, 1); assert.ok(Math.abs(P.measure(r.pieces[0]).seamArea - 60000) < 1e-6);
  assert.match(r.pieces[0].notes, /dikiş hattı \(14\) yok/); assert.ok(r.warnings.some((w) => /SPLINE varlığı desteklenmiyor/.test(w))); assert.ok(r.pieces[0].grain);
  assert.throws(() => X.readAAMA(['0', 'SECTION', '2', 'ENTITIES', '0', 'LINE', '8', '0', '10', '0', '20', '0', '11', '1', '21', '1', '0', 'ENDSEC', '0', 'EOF'].join('\n')), /kalıp parçası bulunamadı/);
  assert.throws(() => X.readAAMA('abc\ndef\n'), /bozuk/);
  assert.throws(() => X.writeAAMA([], { units: 'yard' }), /Desteklenmeyen birim/);
});

t('5. Model: DXF içe aktarma ürüne / bedene bağlar, dikiş eşleşmesi ve doğrulama temiz; içe aktarılan kalıptan yerleşim ve tüketim çalışır', () => {
  const p = M.createProject({ name: 'D', type: 'woven' }), g = M.addProduct(p, { branch: 'woven', type: 'etek' });
  const src = B.buildSet('etek', B.defaultParams('etek')), r = M.importDXF(p, X.writeAAMA(src.pieces), { product: g.id, size: 'M' });
  assert.equal(r.pieces.length, 3); assert.ok(p.woven.pieces.every((x) => x.product === g.id && x.size === 'M'));
  assert.deepEqual(M.validate(p).filter((x) => x.level === 'hata'), []);
  const f = M.addMaterial(p, 'fabric', { name: 'Gabardin', props: { width: 1500, gsm: 220 }, price: 150, priceUnit: 'm' }); M.linkMaterial(p, g.id, f.id, 'ana', null);
  const mk = M.addMarker(p, { product: g.id, size: 'M', fabric: f.id }); assert.equal(mk.fails.length, 0); assert.ok(mk.eval.efficiency > 0.5);
  assert.ok(M.productConsumption(p, g.id).sizes.M[f.id].detail.marker);
  assert.throws(() => M.importDXF(M.createProject({ name: 'K', type: 'knit' }), 'x'), /dokuma kalıbı yok/);
});

t('6. İndirme adı: Türkçe harfler ASCII\'ye çevrilir (tarayıcı adı düşürmesin), uzantı korunur', async () => {
  const { asciiName } = await import('../tx/download.js');
  assert.equal(asciiName('kalip-Gömlek-M.dxf'), 'kalip-Gomlek-M.dxf'); assert.equal(asciiName('Şık İş Çanta ğü.pdf'), 'Sik-Is-Canta-gu.pdf'); assert.equal(asciiName('a/b:c?.svg'), 'a_b_c_.svg'); assert.equal(asciiName(''), 'dosya');
});

for (const [name, fn] of tests) {
  try { await fn(); console.log('ok   ', name); }
  catch (e) { fail++; console.log('FAIL ', name, '\n     ', String(e.message).split('\n')[0]); }
}
console.log(fail ? `\n${fail} test başarısız` : '\nTüm testler geçti');
process.exit(fail ? 1 : 0);
