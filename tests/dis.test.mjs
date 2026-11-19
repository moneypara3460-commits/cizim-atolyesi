// Çalıştır: node tests/dis.test.mjs
// Kozmetik diş (dis.js): küçük çaplar, vida diş boyu, diş doğrulama, parçanın dişleri ve helis.
import assert from 'node:assert/strict';
import * as T from '../dis.js';
import * as S from '../stdparca.js';
import * as D from '../delik.js';

let fail = 0;
const t = (name, fn) => {
  try { fn(); console.log('ok   ', name); }
  catch (e) { fail++; console.log('FAIL ', name, '\n     ', String(e.message || e).split('\n').slice(0, 4).join(' / ')); }
};
const near = (a, b, tol, m = '') => assert.ok(Math.abs(a - b) <= tol, `${m} ${a} ≉ ${b} (±${tol})`);

t('1) küçük çaplar (Optimas metrik diş çizelgesi: M3×0,5 d3 2,387 D1 2,459; M4×0,7 d3 3,141 D1 3,242)', () => {
  near(T.dKucukDis(3, 0.5), 2.387, 0.0006); near(T.dKucukIc(3, 0.5), 2.459, 0.0006);
  near(T.dKucukDis(4, 0.7), 3.141, 0.0006); near(T.dKucukIc(4, 0.7), 3.242, 0.0006);
});

t('2) ISO 4762 diş boyu b = 2d + 12 (Misumi: M3 18, M8 28, M24 60), kısa vidada boydan boya', () => {
  assert.equal(T.vidaDisBoyu(3, 40), 18); assert.equal(T.vidaDisBoyu(8, 50), 28); assert.equal(T.vidaDisBoyu(24, 100), 60);
  assert.equal(T.vidaDisBoyu(8, 20), 20);
});

t('3) diş doğrulama: metrik adım kabası, özel diş, geçersizler', () => {
  assert.deepEqual(T.disSan({ yan: 'dis', olcu: 'M20', P: 1.5, bas: 0, boy: 30 }), { yan: 'dis', olcu: 'M20', d: 20, P: 1.5, bas: 0, boy: 30, ad: '' });
  assert.equal(T.disSan({ olcu: 'M8', P: 0.9, boy: 10 }).P, 1.25, 'geçersiz adım → kaba');
  const g = T.disSan({ yan: 'ic', olcu: 'ozel', d: 20.955, P: 1.814, bas: 5, boy: 15, ad: 'G 1/2' });
  assert.equal(g.olcu, 'ozel'); assert.equal(T.disAdi(g), 'G 1/2');
  assert.equal(T.disAdi(T.disSan({ olcu: 'ozel', d: 30, P: 2, boy: 5 })), 'Ø30×2');
  assert.equal(T.disAdi(T.disSan({ olcu: 'M10', P: 1.25, boy: 5 })), 'M10×1,25');
  assert.equal(T.disSan({ olcu: 'ozel', d: 10, P: 6, boy: 5 }), null, 'adım çapın yarısından büyük');
  assert.equal(T.disSan({ olcu: 'M8', boy: 0 }), null);
  assert.equal(T.disSan(null), null);
});

t('4) borunun yarısında dış, yarısında iç diş: yerel aralıklar ve yüzey yarıçapları', () => {
  const p = { type: 'tube', d: 20, di: 14, h: 60, threads: [{ yan: 'dis', olcu: 'M20', P: 1.5, bas: 0, boy: 30 }, { yan: 'ic', olcu: 'M16', P: 1.5, bas: 30, boy: 30 }] };
  const th = T.parcaDisleri(p);
  assert.deepEqual(th.map((x) => [x.yan, x.y0, x.y1, x.r, x.ad]), [['dis', 0, 30, 10, 'M20×1,5'], ['ic', 30, 60, 7, 'M16×1,5']]);
});

t('5) standart vida ve somun dişleri; delik sihirbazının kılavuz deliği', () => {
  const v = S.tarif({ tur: 'vida', olcu: 'M8', boy: 30 });
  assert.deepEqual(T.parcaDisleri({ type: 'sketch', threads: v.disler }).map((x) => [x.yan, x.y0, x.y1, x.r, x.ad]), [['dis', 0, 28, 4, 'M8']]);
  const n = S.tarif({ tur: 'somun', olcu: 'M10' });
  assert.deepEqual(T.parcaDisleri({ type: 'sketch', threads: n.disler }).map((x) => [x.yan, x.y1]), [['ic', 8.4]]);
  // M8 kılavuz kör 20: kesici h = 21 (1 mm dışarı), yüzey y = 20, diş 20 − 3·1,25 = 16,25 → y 3,75 … 20
  const k = D.delikKesiti({ tur: 'klavuz', olcu: 'M8', derinlik: 20 });
  const hole = { type: 'cylinder', op: 'sub', d: k.d, h: 21, hole: { ...k.o, thread: k.thread } };
  const th = T.parcaDisleri(hole);
  assert.equal(th.length, 1); near(th[0].y0, 3.75, 1e-9); near(th[0].y1, 20, 1e-9); assert.equal(th[0].r, 3.4); assert.equal(th[0].ad, 'M8');
  // boydan boya
  const kb = D.delikKesiti({ tur: 'klavuz', olcu: 'M10', adim: 1.25, boydan: true }, 50);
  const tb = T.parcaDisleri({ type: 'cylinder', d: kb.d, h: 51, hole: { ...kb.o, thread: kb.thread } });
  assert.deepEqual([tb[0].y0, tb[0].y1, tb[0].ad], [0, 50, 'M10×1,25']);
});

t('6) helis: adım ve yarıçap doğru, uçlar tam', () => {
  const h = T.helis(5, 0, 10, 1.25);
  assert.deepEqual(h[0], [5, 0, 0]);
  near(h[h.length - 1][1], 10, 1e-9);
  for (const q of h) near(Math.hypot(q[0], q[2]), 5, 1e-9);
  near((h.length - 1) / 24, 8, 1e-9, '8 tur');
  // çok uzun dişte nokta sayısı sınırlı
  assert.ok(T.helis(5, 0, 5000, 0.5).length <= 600 * 24 + 2);
});

console.log(fail ? `\n${fail} test başarısız` : '\nhepsi geçti');
process.exit(fail ? 1 : 0);
