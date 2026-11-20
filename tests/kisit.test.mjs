// Çalıştır: node tests/kisit.test.mjs
// Kroki kısıtları (kisit.js): yeni nokta kısıtları, en küçük hareketli çözüm, çelişki, serbestlik, köşe silme.
import assert from 'node:assert/strict';
import { solveCons, consError, consValid, freedom, fixConsAfterRemove, CONS_EQ, CONS_LABEL } from '../kisit.js';

let fail = 0;
const t = (name, fn) => {
  try { fn(); console.log('ok   ', name); }
  catch (e) { fail++; console.log('FAIL ', name, '\n     ', String(e.message || e).split('\n').slice(0, 4).join(' / ')); }
};
const near = (a, b, e, m) => assert.ok(Math.abs(a - b) <= e, (m || '') + ' ' + a + ' ≠ ' + b);
const allOK = (r, cons) => { assert.ok(r.ok, 'çözülemedi, hata ' + r.err); for (const c of cons) assert.ok(consError(r.pts, c) < 1e-6, c.t + ' sağlanmadı: ' + consError(r.pts, c)); };
const sq = () => [[0, 0], [40, 0], [40, 30], [0, 30]];

t('her kısıt türünün adı ve denklem sayısı var', () => {
  for (const k of Object.keys(CONS_EQ)) assert.ok(CONS_LABEL[k], k);
});

t('orijinden konum (ox / oy): köşe tam yerine gider, öbürleri kıpırdamaz', () => {
  const cons = [{ t: 'ox', i: 2, L: 50 }, { t: 'oy', i: 2, L: 35 }];
  const r = solveCons(sq(), cons); allOK(r, cons);
  near(r.pts[2][0], 50, 1e-6); near(r.pts[2][1], 35, 1e-6);
  for (const i of [0, 1, 3]) assert.deepEqual(r.pts[i], sq()[i]);
});

t('yatay / dikey hizalı ve mesafeler (dist, dx, dy)', () => {
  const p = [[0, 0], [40, 3], [43, 30], [0, 30]];
  const c1 = [{ t: 'hal', i: 0, j: 1 }, { t: 'val', i: 1, j: 2 }];
  allOK(solveCons(p, c1), c1);
  const c2 = [{ t: 'dist', i: 0, j: 2, L: 50 }, { t: 'dx', i: 0, j: 1, L: 25 }, { t: 'dy', i: 3, j: 0, L: 12 }];
  const r = solveCons(sq(), c2); allOK(r, c2);
  near(Math.hypot(r.pts[2][0] - r.pts[0][0], r.pts[2][1] - r.pts[0][1]), 50, 1e-6);
});

t('çizgi üzerinde ve orta nokta (beşgen: 5. köşe 1. kenarın orta noktasına)', () => {
  const p = [[0, 0], [40, 0], [40, 30], [20, 40], [0, 30]];
  const on = [{ t: 'on', i: 3, e: 0 }];
  const r1 = solveCons(p, on, [0, 1]); allOK(r1, on); near(r1.pts[3][1], 0, 1e-6);
  const mid = [{ t: 'mid', i: 3, e: 1 }];
  const r2 = solveCons(p, mid, [1, 2]); allOK(r2, mid); near(r2.pts[3][0], 40, 1e-6); near(r2.pts[3][1], 15, 1e-6);
});

t('simetri: iki köşe bir kenarın doğrusuna göre simetrik', () => {
  // dikey eksen kenarı (köşe 0 → 1, u = 0); köşe 2 ve 3 bu eksene göre simetrik olsun
  const p = [[0, 0], [0, 40], [-15, 30], [18, 10]];
  const cons = [{ t: 'sym', i: 2, j: 3, e: 0 }];
  const r = solveCons(p, cons, [0, 1]); allOK(r, cons);
  near(r.pts[2][0], -r.pts[3][0], 1e-6); near(r.pts[2][1], r.pts[3][1], 1e-6);
});

t('doğrusal kenarlar (iki kenar aynı doğru üzerinde)', () => {
  const p = [[0, 0], [20, 0], [20, 10], [30, 10], [30, 2], [50, 2], [50, 30], [0, 30]];
  const cons = [{ t: 'col', e: 0, f: 4 }, { t: 'h', e: 0 }];
  const r = solveCons(p, cons, [0]); allOK(r, cons);
  near(r.pts[4][1], 0, 1e-6); near(r.pts[5][1], 0, 1e-6);
});

t('en küçük hareket: tek uzunluk kısıtı yalnızca o kenarın uçlarını, eşit ve ters yönde oynatır', () => {
  const cons = [{ t: 'len', e: 0, L: 50 }];
  const r = solveCons(sq(), cons); allOK(r, cons);
  near(r.pts[0][0], -5, 1e-6); near(r.pts[1][0], 45, 1e-6);
  assert.deepEqual(r.pts[2], [40, 30]); assert.deepEqual(r.pts[3], [0, 30]);
});

t('tam tanımlı dikdörtgen: eski ve yeni kısıtlar birlikte, serbestlik 0', () => {
  const cons = [{ t: 'fix', i: 0 }, { t: 'h', e: 0 }, { t: 'v', e: 1 }, { t: 'h', e: 2 }, { t: 'v', e: 3 }, { t: 'dx', i: 0, j: 1, L: 60 }, { t: 'dy', i: 0, j: 3, L: 25 }];
  const r = solveCons([[1, 2], [41, -1], [38, 33], [-2, 28]], cons); allOK(r, cons);
  assert.equal(freedom(4, cons), 8 - 2 - 4 - 2);   // h/v'lerden biri fazlalık (dikdörtgende 4 h/v = 3 bağımsız) → yaklaşık sayım
  near(r.pts[2][0] - r.pts[0][0], 60, 1e-6); near(r.pts[2][1] - r.pts[0][1], 25, 1e-6);
});

t('çelişen kısıt: başarısız, hata büyük', () => {
  const r = solveCons(sq(), [{ t: 'fix', i: 0 }, { t: 'fix', i: 1 }, { t: 'dist', i: 0, j: 1, L: 10 }]);
  assert.ok(!r.ok && r.err > 1);
  const r2 = solveCons(sq(), [{ t: 'hal', i: 0, j: 2 }, { t: 'fix', i: 0 }, { t: 'oy', i: 2, L: 30 }]);
  assert.ok(!r2.ok);
});

t('geçerlilik: açık şeklin son kenarı yok, köşe kendi kenarının ucunda olamaz, kendine mesafe olmaz', () => {
  assert.ok(consValid({ t: 'h', e: 3 }, 4, true)); assert.ok(!consValid({ t: 'h', e: 3 }, 4, false));
  assert.ok(!consValid({ t: 'on', i: 1, e: 0 }, 4)); assert.ok(consValid({ t: 'on', i: 2, e: 0 }, 4));
  assert.ok(!consValid({ t: 'dist', i: 1, j: 1, L: 3 }, 4)); assert.ok(!consValid({ t: 'len', e: 0, L: 0 }, 4));
  assert.ok(consValid({ t: 'ox', i: 0, L: -12 }, 4));
});

t('köşe silinince köşe kısıtları kayar ya da düşer', () => {
  const r = fixConsAfterRemove([{ t: 'dist', i: 0, j: 3, L: 5 }, { t: 'ox', i: 2, L: 1 }, { t: 'sym', i: 0, j: 2, e: 3 }, { t: 'mid', i: 3, e: 0 }], 4, 2);
  assert.deepEqual(r, [{ t: 'dist', i: 0, j: 2, L: 5 }, { t: 'mid', i: 2, e: 0 }]);
});

if (fail) { console.log(fail + ' test başarısız'); process.exit(1); }
console.log('Hepsi geçti');
