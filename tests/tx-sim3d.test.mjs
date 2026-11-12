// Çalıştır: node tests/tx-sim3d.test.mjs
// Tekstil — Aşama 9: 3B önizleme (kalıp ↔ vücut bolluğu, geometrik) ve dökümlülük benzetimi (fiziksel model) + referans karşılaştırması.
import assert from 'node:assert/strict';
import * as C from '../tx/curve.js';
import * as P from '../tx/woven/pattern.js';
import * as B from '../tx/woven/blocks.js';
import * as F from '../tx/sim3d/fit.js';
import * as D from '../tx/sim3d/drape.js';
import * as M from '../tx/model.js';

let fail = 0;
const tests = [];
const t = (name, fn) => tests.push([name, fn]);
const near = (a, b, tol, m = '') => assert.ok(Math.abs(a - b) <= tol, `${m} ${a} ≉ ${b} (±${tol})`);
const Q = { n: 21, steps: 450 };   // testte hızlı ızgara

t('1. Gömlek: göğüs çevresi = göğüs + bolluk (pat hariç, ön 2 × + arka katlı); ölçü yoksa uyarı; bolluk sınıfı', () => {
  for (const [chest, ease] of [[960, 120], [1040, 80], [880, 200]]) {
    const g = B.buildSet('gomlek', { ...B.defaultParams('gomlek'), chest, ease });
    const r = F.fitReport(g.pieces, null, { 'Göğüs çevresi': chest, 'Kalça çevresi': chest + 40 });
    near(r[0].garment, chest + ease, 0.5, 'göğüs'); near(r[0].ease, ease, 0.5); assert.equal(r[0].level, 'ok');
  }
  const g = B.buildSet('gomlek', B.defaultParams('gomlek'));
  assert.equal(F.fitReport(g.pieces, null, { 'Göğüs çevresi': 1100 })[0].level, 'hata', 'giysi vücuttan dar');
  assert.equal(F.fitReport(g.pieces, null, {})[0].level, 'uyarı');
});

t('2. Etek: bel = bel ölçüsü (pens düşülür, ±0,2 mm), kalça = kalça + bolluk; parça tanımı yoksa açık hata', () => {
  const e = B.buildSet('etek', { ...B.defaultParams('etek'), waist: 700, hip: 960, hipEase: 50 });
  const r = F.fitReport(e.pieces, null, { 'Bel çevresi': 700, 'Kalça çevresi': 960 });
  near(r[0].garment, 700, 0.2, 'bel'); near(r[1].garment, 1010, 0.5, 'kalça'); assert.equal(r[1].level, 'ok'); assert.equal(r[2].level, 'bilgi');
  const pc = P.makePiece({ name: 'Kare', edges: P.edgesFromPoints([{ p: [0, 0] }, { p: [100, 0] }, { p: [100, 100] }, { p: [0, 100] }]) });
  assert.throws(() => F.garmentGirth([pc], 50), /Yan dikişli/); assert.throws(() => F.fitReport([pc], null, {}), /tanımlı değil|Yan dikişli/);
});

t('3. Vücut formu: elips çevresi (Ramanujan) ölçüye eşit; giysi kabuğu halkaları düzeylere ve çevrelere uyar', () => {
  for (const g of [700, 960, 1200]) { const { a, b } = F.ellipseAxes(g); const h = ((a - b) / (a + b)) ** 2; near(Math.PI * (a + b) * (1 + (3 * h) / (10 + Math.sqrt(4 - 3 * h))), g, 1e-6); near(a / b, 1.35, 1e-9); }
  const meas = { 'Göğüs çevresi': 960, 'Bel çevresi': 800, 'Kalça çevresi': 1000 }, body = F.bodyForm(meas);
  assert.equal(body.rings.find((r) => r.girth === 960).z, -0.3 * 700); assert.match(body.assumptions, /elips/);
  const g = B.buildSet('gomlek', B.defaultParams('gomlek')), rep = F.fitReport(g.pieces, null, meas), rings = F.garmentRings(g.pieces, rep, body);
  near(rings[1].girth, rep[0].garment, 1e-9); assert.equal(rings[1].z, -210); assert.ok(rings[2].z < rings[1].z);
});

t('4. Triko: ön + arka genişlik göğüsle; −6 … +20 cm aralığı', () => {
  assert.equal(F.knitFitReport(500, { 'Göğüs çevresi': 960 })[0].ease, 40); assert.equal(F.knitFitReport(500, { 'Göğüs çevresi': 960 })[0].level, 'ok');
  assert.equal(F.knitFitReport(400, { 'Göğüs çevresi': 960 })[0].level, 'uyarı');
});

t('5. Dökümlülük modeli: belirlenimci, durulur, 0 ≤ DC ≤ 1; eğilme arttıkça DC artar, gramaj arttıkça azalır', () => {
  const a = D.simulateDrape({ gsm: 120, bend: 10, ...Q }), b = D.simulateDrape({ gsm: 120, bend: 10, ...Q });
  assert.equal(a.dc, b.dc, 'belirlenimci'); assert.ok(a.settled, 'durulmadı ' + a.maxV); assert.ok(a.dc >= 0 && a.dc <= 1);
  const dcs = [1, 10, 100].map((bend) => D.simulateDrape({ gsm: 120, bend, ...Q }).dc); assert.ok(dcs[0] < dcs[1] && dcs[1] < dcs[2], 'eğilme: ' + dcs);
  assert.ok(D.simulateDrape({ gsm: 400, bend: 10, ...Q }).dc < a.dc, 'ağır kumaş daha çok düşer');
  // destek diskindeki parçacıklar yerinde (sabit), dökülen kenar diskten aşağıda
  const r = a.pos, inner = [...r.z].filter((_, k) => Math.hypot(r.x[k], r.y[k]) <= D.CUSICK.discR); assert.ok(inner.every((z) => Math.abs(z) < 1e-3));
  assert.ok(Math.min(...r.z) < -0.02, 'kenar düşmeli');
  // çok sert numune düz kalır: DC → 1, dalga yok (ölçüm yönteminin doğruluğu)
  const st = D.simulateDrape({ gsm: 120, bend: 1e5, ...Q }); assert.ok(st.dc > 0.99, 'sert ' + st.dc); assert.equal(st.nodes, 0);
  assert.ok(st.refArea > 0.88 * Math.PI * 0.15 ** 2 && st.refArea <= Math.PI * 0.15 ** 2, 'başvuru alanı ağ çokgeni ≈ π·R²');
  assert.throws(() => D.simulateDrape({ gsm: 0, bend: 1 }), /Gramaj/); assert.throws(() => D.simulateDrape({ gsm: 100 }), /Eğilme/);
});

t('6. Kalibrasyon ve doğrulama: hedef katsayıya ±0,02 uyar; ölçüm yoksa DOĞRULANMAMIŞ; aynı ölçüme kalibre "bağımsız değil"; ikinci ölçüm ±0,05 → uyumlu, değilse uyuşmuyor', () => {
  const c = D.calibrateBend({ gsm: 150, target: 0.6, ...Q, rounds: 9 }); near(c.dc, 0.6, 0.02, 'kalibrasyon');
  assert.throws(() => D.calibrateBend({ gsm: 150, target: 0.1, ...Q }), /aralığında değil/);
  assert.match(D.drapeStatus(0.4).text, /DOĞRULANMAMIŞ/); assert.equal(D.drapeStatus(0.4).verified, false);
  assert.equal(D.drapeStatus(0.4, { measured: 0.41, calibratedFromSame: true }).verified, false);
  assert.equal(D.drapeStatus(0.4, { measured: 0.43 }).verified, true); assert.equal(D.drapeStatus(0.4, { measured: 0.5 }).level, 'hata');
});

t('7. Model: kumaş kartında benzetim durumu doğrulamaya yazılır; gramaj değişince "eski"; geçersiz ölçüm hata', () => {
  const p = M.createProject({ name: 'S', type: 'woven' }), m = M.addMaterial(p, 'fabric', { name: 'K', props: { width: 1500, gsm: 120, bendEff: 10 } });
  const r = D.simulateDrape({ gsm: 120, bend: 10, ...Q }); m.sim = { dc: r.dc, bend: 10, calibrated: false, sig: D.drapeSig(m) };
  assert.ok(M.validate(p).some((x) => /DOĞRULANMAMIŞ/.test(x.msg)));
  m.props.drapeRef = r.dc + 0.01; assert.ok(!M.validate(p).some((x) => /Dökümlülük/.test(x.msg)), 'uyumlu');
  m.props.drapeRef = r.dc - 0.2; assert.ok(M.validate(p).some((x) => x.level === 'hata' && /UYUŞMUYOR/.test(x.msg)));
  m.props.gsm = 200; assert.ok(M.validate(p).some((x) => /eski/.test(x.msg)));
  m.props.drapeRef = 1.5; assert.ok(M.validate(p).some((x) => x.level === 'hata' && /0 ile 1/.test(x.msg)));
});

for (const [name, fn] of tests) {
  try { await fn(); console.log('ok   ', name); }
  catch (e) { fail++; console.log('FAIL ', name, '\n     ', String(e.message).split('\n')[0]); }
}
console.log(fail ? `\n${fail} test başarısız` : '\nTüm testler geçti');
process.exit(fail ? 1 : 0);
