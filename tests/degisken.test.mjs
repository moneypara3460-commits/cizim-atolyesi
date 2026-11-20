// Çalıştır: node tests/degisken.test.mjs
// Parametrik model: ifade ayrıştırıcı, değişken çözücü (bağımlılık sırası, döngü), parça alan bağları.
import assert from 'node:assert/strict';
import { ifadeDegeri, ayristir, degiskenleriCoz, bagliAlanlar, degiskenSan, adGecerli, IfadeHatasi } from '../degisken.js';

let n = 0;
const t = (ad, f) => { f(); n++; };
const yakin = (a, b, e = 1e-9) => assert.ok(Math.abs(a - b) < e, a + ' ≠ ' + b);
const d = (s, env) => ifadeDegeri(s, env).deger;

t('dört işlem ve öncelik', () => {
  assert.equal(d('2+3*4'), 14);
  assert.equal(d('(2+3)*4'), 20);
  assert.equal(d('10-4-3'), 3);          // soldan birleşir
  assert.equal(d('100/10/2'), 5);
  assert.equal(d('2^3^2'), 512);         // üs sağdan birleşir
  assert.equal(d('-2^2'), -4);           // tekli eksi üsten zayıf (Excel'den farklı, matematikteki gibi)
  assert.equal(d('2*-3'), -6);
  assert.equal(d('--5'), 5);
  assert.equal(d('+7'), 7);
});
t('ondalık virgül ve nokta, bilimsel', () => {
  assert.equal(d('2,5*2'), 5);
  assert.equal(d('2.5*2'), 5);
  assert.equal(d(',5+0.5'), 1);
  assert.equal(d('1e3'), 1000);
  assert.equal(d('3 − 1 × 2'), 1);       // tipografik eksi ve çarpı
});
t('fonksiyonlar (açılar derece) ve pi', () => {
  yakin(d('sin(30)'), 0.5);
  yakin(d('cos(60)'), 0.5);
  yakin(d('tan(45)'), 1);
  yakin(d('atan(1)'), 45);
  yakin(d('asin(0,5)'), 30);
  assert.equal(d('sqrt(16)'), 4);
  assert.equal(d('kok(9)'), 3);
  assert.equal(d('abs(-3)'), 3);
  assert.equal(d('min(4; 2; 9)'), 2);
  assert.equal(d('max(4; 2; 9)'), 9);
  assert.equal(d('round(2,567; 2)'), 2.57);
  assert.equal(d('yuvarla(2,5)'), 3);
  assert.equal(d('floor(2,9)+ceil(2,1)'), 5);
  yakin(d('pi'), Math.PI);
  yakin(d('PI*2'), 2 * Math.PI);
  assert.equal(d('SQRT(4)'), 2);         // büyük/küçük harf fark etmez
});
t('değişkenler, Türkçe adlar', () => {
  assert.equal(d('L/2', { L: 120 }), 60);
  assert.equal(d('Kalınlık*2+delik_çap', { 'Kalınlık': 3, 'delik_çap': 8 }), 14);
});
t('hatalar: Türkçe ileti, istisna atmaz', () => {
  const h = (s, env) => ifadeDegeri(s, env).hata;
  assert.match(h(''), /Boş/);
  assert.match(h('(2+3'), /Kapanmayan/);
  assert.match(h('2+3)'), /Fazla kapanan/);
  assert.match(h('2+'), /yarım/);
  assert.match(h('2 3'), /Fazladan/);
  assert.match(h('1/0'), /Sıfıra/);
  assert.match(h('X+1'), /Tanımsız değişken: X/);
  assert.match(h('foo(2)'), /Bilinmeyen fonksiyon/);
  assert.match(h('sin(1; 2)'), /1 değer alır/);
  assert.match(h('2 # 3'), /Anlaşılmayan/);
  assert.match(h('sqrt(-1)'), /sayı değil/);
  assert.match(h('x'.repeat(501)), /uzun/);
  // eval yok: kod parçaları ifade olarak kabul edilmez
  assert.ok(h('alert(1)'));
  assert.ok(h('constructor.constructor("x")()'));
  assert.ok(h('__proto__'));
  assert.throws(() => ayristir('2+'), IfadeHatasi);
});
t('ad geçerliliği', () => {
  assert.ok(adGecerli('L'));
  assert.ok(adGecerli('Kalınlık_2'));
  assert.ok(!adGecerli('2L'));
  assert.ok(!adGecerli('a b'));
  assert.ok(!adGecerli('sin'));
  assert.ok(!adGecerli('PI'));
  assert.ok(!adGecerli(''));
  assert.ok(!adGecerli(null));
});
t('çözücü: bağımlılık sırası listedeki sıradan bağımsız', () => {
  const r = degiskenleriCoz([{ ad: 'D', ifade: 'L/4' }, { ad: 'E', ifade: 'D+L' }, { ad: 'L', ifade: '120' }]);
  assert.deepEqual(r.deger, { L: 120, D: 30, E: 150 });
  assert.deepEqual(r.hata, {});
  assert.ok(r.sira.indexOf('L') < r.sira.indexOf('D') && r.sira.indexOf('D') < r.sira.indexOf('E'));
});
t('çözücü: döngü, kendine başvuru, zincirleme hata', () => {
  const r = degiskenleriCoz([{ ad: 'A', ifade: 'B+1' }, { ad: 'B', ifade: 'A*2' }, { ad: 'C', ifade: 'A+1' }, { ad: 'S', ifade: 'S' }, { ad: 'K', ifade: '5' }]);
  assert.match(r.hata.A, /Döngü/);
  assert.match(r.hata.B, /Döngü/);
  assert.match(r.hata.S, /Döngü/);
  assert.match(r.hata.C, /Bağlı olduğu A hatalı/);
  assert.equal(r.deger.K, 5);
  assert.ok(!('A' in r.deger));
});
t('çözücü: geçersiz ad, çift ad, tanımsız', () => {
  const r = degiskenleriCoz([{ ad: '2x', ifade: '1' }, { ad: 'L', ifade: '1' }, { ad: 'L', ifade: '2' }, { ad: 'M', ifade: 'Q*2' }, { ad: 'cos', ifade: '1' }]);
  assert.match(r.hata['2x'], /Geçersiz ad/);
  assert.match(r.hata.cos, /Geçersiz ad/);
  assert.equal(r.deger.L, 1);             // ilk tanım geçerli
  assert.ok(!r.hata.L);
  assert.equal(r.satir[1], '');
  assert.match(r.satir[2], /iki kez/);
  assert.match(r.satir[0], /Geçersiz ad/);
  assert.match(r.satir[3], /Tanımsız/);
  assert.match(degiskenleriCoz([{ ad: '', ifade: '1' }]).satir[0], /Ad boş/);
  assert.match(r.hata.M, /Tanımsız değişken: Q/);
  assert.deepEqual(degiskenleriCoz(null), { deger: {}, hata: {}, satir: [], sira: [] });
});
t('bağlı alanlar', () => {
  const parts = [{ id: 1, w: 10, eq: { w: 'L/2', h: 'L*' } }, { id: 2, w: 5 }, { id: 3, eq: { x: 'D+1' } }];
  const r = bagliAlanlar(parts, { L: 120, D: 30 });
  assert.deepEqual(r[0], { id: 1, alan: 'w', deger: 60 });
  assert.equal(r[1].id, 1); assert.equal(r[1].alan, 'h'); assert.ok(r[1].hata);
  assert.deepEqual(r[2], { id: 3, alan: 'x', deger: 31 });
  assert.equal(r.length, 3);
});
t('kayıt temizliği', () => {
  assert.deepEqual(degiskenSan(undefined), []);
  assert.deepEqual(degiskenSan('x'), []);
  assert.deepEqual(degiskenSan([{ ad: 'L', ifade: 120 }, null, { ad: 5 }, { ad: 'D' }]), [{ ad: 'L', ifade: '120' }, { ad: 'D', ifade: '' }]);
  assert.equal(degiskenSan(Array.from({ length: 300 }, (_, i) => ({ ad: 'v' + i, ifade: '1' }))).length, 200);
  assert.equal(degiskenSan([{ ad: 'a'.repeat(99), ifade: '1'.repeat(999) }])[0].ifade.length, 500);
});

console.log('degisken: ' + n + ' test geçti');
