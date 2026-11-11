// Çalıştır: node tests/robust.test.mjs
// Sağlamlık (regresyon): bozuk dosya, NaN / Infinity, aşırı büyük girdi, geçersiz makine / malzeme tanımı.
// Beklenen davranış: çökmeden, sessizce sahte geometri üretmeden, anlaşılır hata ya da atlama.
import assert from 'node:assert/strict';
import * as G from '../cad2d-geom.js';
import { optimizeCuts, MAX_PIECES } from '../cutopt.js';
import * as L from '../logic.js';
import * as K from '../kin.js';
import * as X from '../fea2.js';

let fail = 0;
const t = (name, fn) => {
  try { fn(); console.log('ok   ', name); }
  catch (e) { fail++; console.log('FAIL ', name, '\n     ', String(e.message).split('\n')[0]); }
};
const dxf = (body) => '0\nSECTION\n2\nENTITIES\n' + body + '0\nENDSEC\n0\nEOF\n';

t('DXF: rastgele / ikili / boş metin çökmeden boş sonuç verir', () => {
  for (const s of ['', 'abc\n\u0000\u0001', '0\nSECTION\n', '\n\n\n\n', 'x'.repeat(100000), null, undefined]) {
    const r = G.parseDXF(s);
    assert.ok(Array.isArray(r.ents) && r.ents.length === 0, String(s).slice(0, 20));
  }
});

// Hata (bu görevde düzeltildi): NaN / Infinity koordinatlar 0 sayılıyor, olmayan bir çizgi çiziliyordu;
// negatif yarıçaplı daire kabul ediliyordu.
t('DXF: NaN / Infinity / bozuk sayılı ve negatif yarıçaplı varlıklar atlanır, sayılır; sağlam olanlar korunur', () => {
  const r = G.parseDXF(dxf(
    '0\nLINE\n10\nNaN\n20\n0\n11\nInfinity\n21\n5\n' +
    '0\nLINE\n10\n1e400\n20\n0\n11\n3\n21\n5\n' +
    '0\nLINE\n10\n12abc\n20\n0\n11\n3\n21\n5\n' +
    '0\nCIRCLE\n10\n0\n20\n0\n40\n-5\n' +
    '0\nARC\n10\n0\n20\n0\n40\n0\n50\n0\n51\n90\n' +
    '0\nLWPOLYLINE\n90\n2\n70\n0\n10\n0\n20\n0\n10\nNaN\n20\n5\n' +
    '0\nLINE\n10\n0\n20\n0\n11\n100\n21\n0\n' +
    '0\nCIRCLE\n10\n50\n20\n25\n40\n10\n'));
  assert.equal(r.ents.length, 2, JSON.stringify(r.ents));
  assert.deepEqual(r.ents[0].b, [100, 0]);
  assert.equal(r.ents[1].r, 10);
  assert.equal(r.skipped['geçersiz sayı'], 6);
});

t('DXF: kendi DXF çıktımız aynı geometriyle geri okunur (gidiş-dönüş)', () => {
  const ents = [{ t: 'line', a: [0, 0], b: [100, 0], layer: '0' }, { t: 'circle', c: [50, 25], r: 10, layer: '0' }, { t: 'arc', c: [0, 0], r: 20, a0: 0, a1: Math.PI / 2, layer: '0' }];
  const r = G.parseDXF(G.toDXF(ents, [{ name: '0', aci: 7, lt: 'CONTINUOUS' }]));
  const k = (e) => e.t;
  assert.deepEqual(r.ents.filter((e) => e.t !== 'text').map(k).sort(), ['arc', 'circle', 'line']);
  const c = r.ents.find((e) => e.t === 'circle'); assert.ok(Math.abs(c.r - 10) < 1e-6 && Math.abs(c.c[0] - 50) < 1e-6);
  const a = r.ents.find((e) => e.t === 'arc'); assert.ok(Math.abs(a.a1 - Math.PI / 2) < 1e-6);
});

// Hata (bu görevde düzeltildi): çok büyük adet (ör. 1e9) hesaplamayı sonsuza dek bekletiyor / belleği taşırıyordu.
t('Kesim optimizasyonu: aşırı adet sınırla reddedilir ve hata satırı olarak gösterilir; diğer parçalar hesaplanır', () => {
  const t0 = Date.now();
  const r = optimizeCuts([{ len: 500, qty: 1e9 }, { len: 500, qty: 3 }], { stock: 6000, kerf: 3 });
  assert.ok(Date.now() - t0 < 2000, 'hızlı dönmeli');
  assert.equal(r.total.pieces, 3);
  assert.ok(r.groups[0].errors.some((e) => /Adet çok büyük/.test(e.msg) && e.qty === 1e9));
  assert.ok(MAX_PIECES >= 10000);
});
t('Kesim optimizasyonu: NaN / Infinity / 0 / negatif boy ve adet yok sayılır; stoktan uzun parça hata olarak listelenir', () => {
  const r = optimizeCuts([{ len: NaN, qty: 2 }, { len: Infinity, qty: 1 }, { len: -5, qty: 1 }, { len: 500, qty: NaN }, { len: 500, qty: 0 }, { len: 400, qty: 2 }], { stock: 6000, kerf: 3 });
  assert.equal(r.total.pieces, 2);
  assert.ok(Number.isFinite(r.total.buyLen) && Number.isFinite(r.total.scrapLen));
  const long = optimizeCuts([{ len: 9000, qty: 2 }], { stock: 6000, kerf: 3 });
  assert.equal(long.total.pieces, 0); assert.ok(/uzun/.test(long.groups[0].errors[0].msg));
});
t('Kesim optimizasyonu: aynı girdi → aynı sonuç (deterministik)', () => {
  const pcs = [{ len: 1234, qty: 7 }, { len: 777, qty: 9 }, { len: 2500, qty: 3 }, { len: 410.5, qty: 11 }];
  assert.equal(JSON.stringify(optimizeCuts(pcs, { kerf: 3 })), JSON.stringify(optimizeCuts(pcs, { kerf: 3 })));
});

t('Sac açınım: NaN / Infinity girdiler sonlu sonuç ya da açık hata verir', () => {
  const c = L.sheetCalc({ ...L.SHEET_DEFAULTS, st: NaN, sr: Infinity, sk: -3, seg: [{ L: NaN }, { L: 40, a: NaN }] });
  assert.ok(c.ok ? Number.isFinite(c.flatL) && c.flatL > 0 : typeof c.err === 'string' && c.err.length > 0, JSON.stringify([c.ok, c.err, c.flatL]));
});

t('Makine tanımı: eksik / NaN limitli / bilinmeyen tür reddedilir', () => {
  assert.ok(K.validateMachine(null).length);
  assert.ok(K.validateMachine({ type: 'uçan' }).length);
  const e = K.validateMachine({ type: '5ax-tt', rot: [{ name: 'A', min: NaN, max: Infinity }] });
  assert.ok(e.some((s) => /limit/.test(s)) && e.some((s) => /2 döner eksen/.test(s)));
  for (const k of Object.keys(K.MACHINES)) assert.deepEqual(K.validateMachine(K.MACHINES[k]), [], k);
});

t('Malzeme: NaN / sıfır / fiziksel olmayan değerler reddedilir; kütüphane malzemeleri geçerlidir', () => {
  assert.ok(X.validateMaterial({ props: { E: { v: NaN }, nu: { v: 0.5 } } }).length === 2);
  assert.ok(X.validateMaterial({ props: { E: { v: 210 }, nu: { v: 0.3 }, rho: { v: 0 } } }).length === 1);
  for (const m of X.libraryMaterials()) assert.deepEqual(X.validateMaterial(m), [], m.name);
});

console.log(fail ? `\n${fail} test başarısız` : '\nTüm testler geçti');
process.exit(fail ? 1 : 0);
