// Çalıştır: node tests/logic.test.mjs
import assert from 'node:assert/strict';
import { parseVoice, normalize, History, toSTLBinary, newPart, heightOf } from '../logic.js';

let fail = 0;
const t = (name, fn) => {
  try { fn(); console.log('ok   ', name); }
  catch (e) { fail++; console.log('FAIL ', name, '\n     ', e.message.split('\n')[0]); }
};
const one = (s) => parseVoice(s)[0];

t('sayı kelimeleri', () => {
  assert.equal(normalize('yirmi beş'), '25');
  assert.equal(normalize('yüz yirmi'), '120');
  assert.equal(normalize('iki yüz elli milimetre'), '250');
  assert.equal(normalize('bir silindir'), 'bir silindir');
  assert.equal(normalize('5 santim'), '50');
  assert.equal(normalize('2,5 cm'), '25');
});
t('silindir (sayı önde, -ında)', () => {
  const c = one('elli milimetre çapında yirmi milimetre yüksekliğinde silindir ekle');
  assert.deepEqual(c, { cmd: 'add', type: 'cylinder', op: 'add', dims: { d: 50, h: 20 } });
});
t('silindir (anahtar sözcük önde)', () => {
  const c = one('silindir yap çap 50 yükseklik 20');
  assert.deepEqual(c.dims, { d: 50, h: 20 });
});
t('kutu sıralı sayılar', () => {
  const c = one("kutu ekle 80'e 60'a 40");
  assert.deepEqual(c, { cmd: 'add', type: 'box', op: 'add', dims: { w: 80, l: 60, h: 40 } });
});
t('yuvarlak delik', () => {
  const c = one('10 milimetre delik aç');
  assert.deepEqual(c, { cmd: 'add', type: 'cylinder', op: 'sub', dims: { d: 10 } });
});
t('santim -> mm', () => {
  const c = one('5 santim çapında delik aç');
  assert.deepEqual(c.dims, { d: 50 });
});
t('kare delik', () => {
  const c = one('kare delik 8 milimetre');
  assert.deepEqual(c, { cmd: 'add', type: 'box', op: 'sub', dims: { w: 8, l: 8 } });
});
t('küre', () => {
  assert.deepEqual(one('küre ekle çap 30'), { cmd: 'add', type: 'sphere', op: 'add', dims: { d: 30 } });
});
t('boru', () => {
  const c = one('boru ekle dış çap 40 iç çap 30 yükseklik 20');
  assert.deepEqual(c.dims, { d: 40, di: 30, h: 20 });
  assert.equal(c.type, 'tube');
});
t('koni', () => {
  const c = one('koni ekle alt çap 40 üst çap 10 yükseklik 50');
  assert.deepEqual(c.dims, { d: 40, d2: 10, h: 50 });
});
t('geri al / yinele / sığdır / stl / kaydet / sil', () => {
  assert.equal(one('geri al').cmd, 'undo');
  assert.equal(one('yinele').cmd, 'redo');
  assert.equal(one('ekrana sığdır').cmd, 'fit');
  assert.equal(one('stl indir').cmd, 'export');
  assert.equal(one('kaydet').cmd, 'save');
  assert.equal(one('parçayı sil').cmd, 'delete');
});
t('silindir sözcüğü "sil" sayılmaz', () => {
  assert.equal(one('silindir ekle').cmd, 'add');
});
t('özellik değiştirme', () => {
  assert.deepEqual(one('yüksekliği 30 yap'), { cmd: 'set', key: 'h', value: 30 });
  assert.deepEqual(one('çapı elli yap'), { cmd: 'set', key: 'd', value: 50 });
  assert.deepEqual(one('iç çapı 25 yap'), { cmd: 'set', key: 'di', value: 25 });
  assert.deepEqual(one("x'i 10 yap"), { cmd: 'set', key: 'x', value: 10 });
});
t('döndürme', () => {
  assert.deepEqual(one('x ekseninde 45 derece döndür'), { cmd: 'rotate', axis: 'x', deg: 45 });
  assert.deepEqual(one('90 derece döndür'), { cmd: 'rotate', axis: 'y', deg: 90 });
});
t('kenar yuvarlama', () => {
  assert.deepEqual(one('kenarları 5 milimetre yuvarla'), { cmd: 'set', key: 'r', value: 5 });
});
t('anlaşılmayan', () => {
  assert.equal(one('bugün hava çok güzel').cmd, 'unknown');
});

t('geçmiş: geri al / yinele', () => {
  const h = new History();
  h.push('A'); h.push('B');
  assert.equal(h.undo('C'), 'B');
  assert.equal(h.undo('B'), 'A');
  assert.equal(h.undo('A'), null);
  assert.equal(h.redo('A'), 'B');
  h.push('X');
  assert.equal(h.canRedo, false);
});
t('yeni parça konumları', () => {
  const base = { id: 1, type: 'box', h: 40, x: 5, y: 0, z: 7 };
  const add = newPart(2, 'box', 'add', base);
  assert.equal(add.y, 40); assert.equal(add.x, 5);
  const hole = newPart(3, 'cylinder', 'sub', base);
  assert.equal(hole.h, 42); assert.equal(hole.y, -1); assert.equal(hole.z, 7);
  assert.equal(heightOf({ type: 'sphere', d: 30 }), 30);
});
t('STL ikili biçim', () => {
  const tri = new Float32Array([0, 0, 0, 10, 0, 0, 0, 10, 0]);
  const b = toSTLBinary(tri, false);
  assert.equal(b.length, 84 + 50);
  const dv = new DataView(b.buffer);
  assert.equal(dv.getUint32(80, true), 1);
  assert.equal(dv.getFloat32(84 + 8, true), 1); // normal z = +1
  const z = toSTLBinary(tri, true); // Y-yukarı -> Z-yukarı
  const dz = new DataView(z.buffer);
  assert.equal(dz.getFloat32(84 + 4, true), -1); // normal artık -Y
});

console.log(fail ? `\n${fail} test BAŞARISIZ` : '\nTüm testler geçti');
process.exit(fail ? 1 : 0);
