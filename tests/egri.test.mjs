// Çalıştır: node tests/egri.test.mjs
// Kroki serbest eğrisi (egri.js) ve kroki ↔ parça dönüşümünde eğri bilgisinin korunması.
import assert from 'node:assert/strict';
import { egriNoktalari, egriKenar, egriTemizle } from '../egri.js';
import { validateDraw } from '../sketch.js';
import { sketchFromDraw, sketchToDraw } from '../logic.js';

let fail = 0;
const t = (name, fn) => {
  try { fn(); console.log('ok   ', name); }
  catch (e) { fail++; console.log('FAIL ', name, '\n     ', String(e.message || e).split('\n').slice(0, 4).join(' / ')); }
};
const near = (a, b, e, m) => assert.ok(Math.abs(a - b) <= e, (m || '') + ' ' + a + ' ≠ ' + b);
const dir = (a, b) => { const l = Math.hypot(b[0] - a[0], b[1] - a[1]); return [(b[0] - a[0]) / l, (b[1] - a[1]) / l]; };
const area = (p) => p.reduce((s, q, i) => { const r = p[(i + 1) % p.length]; return s + q[0] * r[1] - r[0] * q[1]; }, 0) / 2;
const sq = [[0, 0], [40, 0], [40, 40], [0, 40]];

t('eğri noktası yoksa noktalar aynen döner', () => {
  const r = egriNoktalari(sq, true, []);
  assert.deepEqual(r.pts, sq); assert.deepEqual(r.idx, [0, 1, 2, 3]);
});

t('eğri kontrol noktalarından geçer (idx konumlarında kontrol noktası tam yerinde)', () => {
  const r = egriNoktalari(sq, true, [0, 1, 2, 3]);
  assert.ok(r.pts.length > 30);
  r.idx.forEach((k, i) => assert.deepEqual(r.pts[k], sq[i]));
});

t('eğri noktasında yumuşak geçiş: iki yandaki parçanın teğeti aynı (köşe yok)', () => {
  const p = [[0, 0], [30, 10], [60, 0], [60, 30], [0, 30]];
  const r = egriNoktalari(p, true, [1]);
  const k = r.idx[1], a = r.pts[k - 1], m = r.pts[k], b = r.pts[k + 1];
  const d1 = dir(a, m), d2 = dir(m, b);
  const ang = Math.acos(Math.min(1, d1[0] * d2[0] + d1[1] * d2[1])) * 180 / Math.PI;
  assert.ok(ang < 8, 'eğri noktasında kırılma ' + ang.toFixed(2) + '°');
  // teğet, komşu iki noktanın farkı yönünde (Catmull-Rom): yatay
  const tg = dir(a, b); near(tg[1], 0, 0.02, 'teğet yatay');
});

t('sivri köşe sivri kalır, iki ucu sivri kenar düz kalır', () => {
  const p = [[0, 0], [30, 10], [60, 0], [60, 30], [0, 30]];
  const r = egriNoktalari(p, true, [1]);
  // 2 → 3 ve 3 → 4 kenarları düz: araya nokta girmez
  assert.equal(r.idx[3] - r.idx[2], 1); assert.equal(r.idx[4] - r.idx[3], 1);
  // köşe 3 (60,30) dik açı olarak kalır
  const k = r.idx[3], d1 = dir(r.pts[k - 1], r.pts[k]), d2 = dir(r.pts[k], r.pts[k + 1]);
  near(d1[0] * d2[0] + d1[1] * d2[1], 0, 1e-9, 'dik köşe');
  assert.ok(egriKenar([1], 5, 0) && egriKenar([1], 5, 1) && !egriKenar([1], 5, 2));
});

t('dört eğri noktalı kare yuvarlaklaşır: köşelerden geçen eğri karenin biraz dışına çıkar, ilmek / aşırı taşma yok', () => {
  const r = egriNoktalari(sq, true, [0, 1, 2, 3]);
  // köşeler eğri üzerinde olduğundan şekil karenin dışına taşar ama aşırı değil
  const A = Math.abs(area(r.pts));
  assert.ok(A > 1600 && A < 1600 * 1.6, 'alan ' + A.toFixed(1));
  const xs = r.pts.map((q) => q[0]), ys = r.pts.map((q) => q[1]);
  assert.ok(Math.min(...xs) > -12 && Math.max(...xs) < 52 && Math.min(...ys) > -12 && Math.max(...ys) < 52, 'taşma sınırlı');
});

t('açık eğri: uç noktalar korunur, son kenar yok', () => {
  const p = [[0, 0], [20, 15], [40, 0]];
  const r = egriNoktalari(p, false, [0, 1, 2]);
  assert.deepEqual(r.pts[0], [0, 0]); assert.deepEqual(r.pts[r.pts.length - 1], [40, 0]);
  assert.equal(r.idx.length, 3);
});

t('egriTemizle: aralık dışı ve tekrar atılır, sıralanır', () => {
  assert.deepEqual(egriTemizle([3, 1, 1, 9, -1, 2.5], 4), [1, 3]);
});

t('validateDraw + parça dönüşümü: eğri bilgisi döngü sırasıyla saklanır, geri açılınca kontrol noktaları aynı', () => {
  const hole = [[10, 10], [14, 10], [14, 14], [10, 14]];
  const cp = [[0, 0], [60, 0], [60, 40], [30, 55], [0, 40]], sm = [3];
  const outer = egriNoktalari(cp, true, sm).pts;
  // delik önce, dış şekil sonra verilir: çıktıda dış şekil pts, delik more olur; eğri bilgisi de buna göre sıralanır
  const r = validateDraw('extrude', 'top', [hole, outer], 10, [[], []], [null, { cp, sm, cons: [{ t: 'h', e: 0 }] }]);
  assert.ok(r.draw, r.error);
  assert.ok(r.draw.egri[0] && r.draw.egri[1] === null, 'sıra');
  const part = sketchFromDraw(r.draw);
  assert.ok(part.pts.length > 5 && part.egri[0].cp.length === 5);
  const back = sketchToDraw(part);
  back.egri[0].cp.forEach((q, i) => { near(q[0], cp[i][0], 1e-4); near(q[1], cp[i][1], 1e-4); });
  assert.deepEqual(back.egri[0].sm, [3]); assert.deepEqual(back.egri[0].cons, [{ t: 'h', e: 0 }]);
  // döndürmede de
  const rv = validateDraw('revolve', 'front', [egriNoktalari([[0, 0], [20, 0], [25, 30], [0, 40]], true, [2]).pts], 0, [[]], [{ cp: [[0, 0], [20, 0], [25, 30], [0, 40]], sm: [2], cons: [] }]);
  const pr = sketchFromDraw(rv.draw), br = sketchToDraw(pr);
  near(br.egri[0].cp[2][0], 25, 1e-4); near(br.egri[0].cp[2][1], 30, 1e-4);
});

if (fail) { console.log(fail + ' test başarısız'); process.exit(1); }
console.log('Hepsi geçti');
