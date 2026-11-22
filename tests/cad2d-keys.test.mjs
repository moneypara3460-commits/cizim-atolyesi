// 2B çizim klavye komutları: çözümleyici (cad2d-keys.js)
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseLine, findCommand, directPoint, polarPoint, isTypingKey, COMMANDS } from '../cad2d-keys.js';

test('AutoCAD kısaltmaları, İngilizce ve Türkçe adlar aynı araca gider', () => {
  const t = (s) => findCommand(s)?.tool || findCommand(s)?.act;
  assert.equal(t('L'), 'line'); assert.equal(t('line'), 'line'); assert.equal(t('ÇİZGİ'), 'line');
  assert.equal(t('C'), 'circle'); assert.equal(t('daire'), 'circle');
  assert.equal(t('REC'), 'rect'); assert.equal(t('dikdörtgen'), 'rect');
  assert.equal(t('TR'), 'trim'); assert.equal(t('KIRP'), 'trim');
  assert.equal(t('EX'), 'extend'); assert.equal(t('O'), 'offset'); assert.equal(t('F'), 'fillet');
  assert.equal(t('M'), 'move'); assert.equal(t('CO'), 'copy'); assert.equal(t('CP'), 'copy');
  assert.equal(t('RO'), 'rotate'); assert.equal(t('MI'), 'mirror'); assert.equal(t('AR'), 'array');
  assert.equal(t('SC'), 'scale'); assert.equal(t('E'), 'erase'); assert.equal(t('SİL'), 'erase');
  assert.equal(t('DIM'), 'dim'); assert.equal(t('DİM'), 'dim'); assert.equal(t('DRA'), 'rdim'); assert.equal(t('DAN'), 'adim');
  assert.equal(t('H'), 'hatch'); assert.equal(t('T'), 'text'); assert.equal(t('A'), 'arc');
  assert.equal(t('Z'), 'zfit'); assert.equal(t('U'), 'undo'); assert.equal(t('3B'), 'f-3d'); assert.equal(t('3D'), 'f-3d');
  assert.equal(findCommand('XYZ'), null);
});

test('her komut adı tek bir komuta ait; her komutun etiketi var', () => {
  const seen = new Set();
  for (const c of COMMANDS) {
    assert.ok(c.label && (c.tool || c.act), JSON.stringify(c));
    for (const n of c.names) { assert.ok(!seen.has(n), 'çakışma: ' + n); seen.add(n); }
  }
});

test('koordinat yazımları: mutlak, göreli, kutupsal; noktalı virgüllü Türkçe yazım', () => {
  assert.deepEqual(parseLine('100,50'), { kind: 'abs', x: 100, y: 50, alt: 100.5 });
  assert.deepEqual(parseLine('-10.5,20'), { kind: 'abs', x: -10.5, y: 20 });
  assert.deepEqual(parseLine('@20,0'), { kind: 'rel', x: 20, y: 0 });
  assert.deepEqual(parseLine('@ -5 , 7.5'), { kind: 'rel', x: -5, y: 7.5 });
  assert.deepEqual(parseLine('@50<30'), { kind: 'polar', rel: true, len: 50, ang: 30 });
  assert.deepEqual(parseLine('40<-90'), { kind: 'polar', rel: false, len: 40, ang: -90 });
  assert.deepEqual(parseLine('10;2,5'), { kind: 'abs', x: 10, y: 2.5 });
  assert.deepEqual(parseLine('@2,5;7'), { kind: 'rel', x: 2.5, y: 7 });
});

test('sayılar: tek sayı, ondalık virgül, R yarıçap, Ø / D çap; hatalı yazım', () => {
  assert.deepEqual(parseLine('25'), { kind: 'num', v: 25 });
  assert.deepEqual(parseLine('-3.5'), { kind: 'num', v: -3.5 });
  assert.equal(parseLine('2,5').alt, 2.5);
  assert.deepEqual(parseLine('R5'), { kind: 'radius', v: 5 });
  assert.deepEqual(parseLine('r 2,5'), { kind: 'radius', v: 2.5 });
  assert.deepEqual(parseLine('Ø12'), { kind: 'num', v: 12 });
  assert.deepEqual(parseLine('D8'), { kind: 'num', v: 8 });
  assert.equal(parseLine('1,2,3').kind, 'bad');
  assert.equal(parseLine('qwe').kind, 'bad');
  assert.equal(parseLine('   ').kind, 'empty');
  assert.equal(parseLine('REC').kind, 'cmd');   // R ile başlayan komut yarıçap sanılmaz
  assert.equal(parseLine('DIM').kind, 'cmd');   // D ile başlayan komut çap sanılmaz
});

test('doğrudan mesafe: imleç yönünde; imleç yoksa varsayılan açı; ortho eksene oturtur', () => {
  const close = (a, b) => assert.ok(Math.hypot(a[0] - b[0], a[1] - b[1]) < 1e-9, JSON.stringify(a) + ' ≠ ' + JSON.stringify(b));
  close(directPoint([0, 0], [3, 4], 10), [6, 8]);
  close(directPoint([10, 10], null, 5, 90), [10, 15]);
  close(directPoint([0, 0], [0, 0], 5, 0), [5, 0]);
  close(directPoint([0, 0], [10, 2], 7, 0, true), [7, 0]);
  close(directPoint([0, 0], [1, -9], 4, 0, true), [0, -4]);
  close(polarPoint([1, 1], 2, 90), [1, 3]);
  close(polarPoint([0, 0], 10, 180), [-10, 0]);
});

test('yazı tuşu ayrımı: harf / rakam evet; Ctrl, Alt, boşluk, işlev tuşları hayır', () => {
  assert.equal(isTypingKey({ key: 'l' }), true);
  assert.equal(isTypingKey({ key: '@' }), true);
  assert.equal(isTypingKey({ key: 'z', ctrlKey: true }), false);
  assert.equal(isTypingKey({ key: 'z', metaKey: true }), false);
  assert.equal(isTypingKey({ key: ' ' }), false);
  assert.equal(isTypingKey({ key: 'Enter' }), false);
  assert.equal(isTypingKey({ key: 'F3' }), false);
});
