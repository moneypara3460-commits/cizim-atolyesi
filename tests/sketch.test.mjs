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

console.log(fail ? `\n${fail} test BAŞARISIZ` : '\nTüm testler geçti');
process.exit(fail ? 1 : 0);
