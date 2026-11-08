// Çalıştır: node tests/sketch.test.mjs
import assert from 'node:assert/strict';
import { selfIntersects, validateDraw } from '../sketch.js';
import { rectPts, circlePts } from '../logic.js';

let fail = 0;
const t = (name, fn) => {
  try { fn(); console.log('ok   ', name); }
  catch (e) { fail++; console.log('FAIL ', name, '\n     ', e.message.split('\n')[0]); }
};

t('kendini kesen çokgen', () => {
  assert.equal(selfIntersects(rectPts(0, 0, 10, 10)), false);
  assert.equal(selfIntersects([[0, 0], [10, 10], [10, 0], [0, 10]]), true); // kelebek
  assert.equal(selfIntersects(circlePts(0, 0, 10, 24)), false);
  assert.equal(selfIntersects([[0, 0], [10, 0], [10, 10], [5, 5], [0, 10]]), false); // içbükey
});
t('doğrulama: ekstrüzyon', () => {
  assert.match(validateDraw('extrude', 'top', [[0, 0], [1, 1]], 5).error, /3 noktalı/);
  assert.match(validateDraw('extrude', 'top', [[0, 0], [5, 5], [10, 10]], 5).error, /alanı/);
  assert.match(validateDraw('extrude', 'top', rectPts(0, 0, 10, 10), 0).error, /Kalınlık/);
  const r = validateDraw('extrude', 'front', rectPts(0, 0, 10, 10), 7);
  assert.deepEqual(r.draw, { mode: 'extrude', plane: 'front', pts: rectPts(0, 0, 10, 10), h: 7 });
});
t('doğrulama: tekrar eden noktalar silinir', () => {
  const pts = [[0, 0], [0, 0], [10, 0], [10, 10], [0, 10], [0, 0]];
  assert.equal(validateDraw('extrude', 'top', pts, 5).draw.pts.length, 4);
});
t('doğrulama: döndürme', () => {
  assert.match(validateDraw('revolve', 'front', rectPts(-5, 0, 5, 10), 0).error, /sağına/);
  const r = validateDraw('revolve', 'top', rectPts(0, 0, 10, 20), 0);
  assert.equal(r.draw.plane, 'front'); assert.equal(r.draw.mode, 'revolve');
});

t('çoklu şekil: iç içe delik, en büyük dış olur', () => {
  const r = validateDraw('extrude', 'top', [rectPts(2, 2, 6, 6), rectPts(0, 0, 10, 10)], 5);
  assert.ok(r.draw, r.error);
  assert.equal(r.draw.pts.length, 4);
  assert.equal(r.draw.more.length, 1);
  assert.equal(Math.max(...r.draw.pts.map((q) => q[0])), 10);
});
t('çoklu şekil: kesişenler reddedilir', () => {
  const r = validateDraw('extrude', 'top', [rectPts(0, 0, 10, 10), rectPts(5, 5, 15, 15)], 5);
  assert.match(r.error, /birbirini kesiyor/);
});
t('çoklu şekil: döndürmede tek şekil', () => {
  const r = validateDraw('revolve', 'front', [rectPts(1, 0, 5, 10), rectPts(6, 0, 9, 4)], 0);
  assert.match(r.error, /tek şekil/);
});
t('tek şekil geriye uyumlu (more yok)', () => {
  const r = validateDraw('extrude', 'top', rectPts(0, 0, 10, 10), 5);
  assert.equal(r.draw.more, undefined);
});
t('validateDraw kısıtları döngü sırasıyla taşır; köşe sayısı değişirse atar', () => {
  const big = rectPts(0, 0, 50, 50), small = rectPts(10, 10, 20, 20);
  const r = validateDraw('extrude', 'top', [small, big], 5, [[{ t: 'h', e: 0 }], [{ t: 'v', e: 1 }]]);
  assert.deepEqual(r.draw.cons, [[{ t: 'v', e: 1 }], [{ t: 'h', e: 0 }]]);
  const dup = [[0, 0], [10, 0], [10, 0], [10, 10]];
  const r2 = validateDraw('extrude', 'top', [dup], 5, [[{ t: 'h', e: 0 }]]);
  assert.equal(r2.draw.cons, undefined);
});

console.log(fail ? `\n${fail} test BAŞARISIZ` : '\nTüm testler geçti');
process.exit(fail ? 1 : 0);
