// Çalıştır: node tests/teknik.test.mjs
// Teknik resim yardımcıları (teknik.js): ISO 2768-1, ISO 286 H, Ra dizisi, delik yazıları, resim parça listesi.
import assert from 'node:assert/strict';
import * as T from '../teknik.js';
import * as D from '../delik.js';

let fail = 0;
const t = (name, fn) => {
  try { fn(); console.log('ok   ', name); }
  catch (e) { fail++; console.log('FAIL ', name, '\n     ', String(e.message || e).split('\n').slice(0, 4).join(' / ')); }
};

t('1) ISO 2768-1 Tablo 1: aralık sınırları ve dört sınıf', () => {
  assert.equal(T.genelTol('m', 0.5), 0.1);
  assert.equal(T.genelTol('m', 3), 0.1);        // 3 dahil ilk aralık
  assert.equal(T.genelTol('c', 3.01), 0.3);
  assert.equal(T.genelTol('m', 30), 0.2);
  assert.equal(T.genelTol('m', 80), 0.3);
  assert.equal(T.genelTol('f', 120), 0.15);
  assert.equal(T.genelTol('v', 400), 2.5);
  assert.equal(T.genelTol('m', 4000), 2);
  assert.equal(T.genelTol('v', 2), null, 'v için 3 ve altı tanımsız');
  assert.equal(T.genelTol('f', 3000), null, 'f için 2000 üstü tanımsız');
  assert.equal(T.genelTol('m', 0.3), null);
  assert.equal(T.genelTol('x', 10), null);
});

t('2) ISO 286 H: IT değerleri ve sapmalar (40 H7 = +0,025 / 0; 10 H7 = +0,015; 10,01 H7 = +0,018)', () => {
  assert.deepEqual(T.hSapma('H7', 40), { es: 0.025, ei: 0 });
  assert.equal(T.hSapma('H7', 10).es, 0.015);
  assert.equal(T.hSapma('H7', 10.01).es, 0.018);
  assert.equal(T.hSapma('H6', 3).es, 0.006);
  assert.equal(T.hSapma('H11', 500).es, 0.4);
  assert.equal(T.hSapma('H8', 200).es, 0.072);
  assert.equal(T.hSapma('H9', 300).es, 0.13);
  assert.equal(T.hSapma('H7', 501), null);
  assert.equal(T.hSapma('H5', 10), null);
  assert.equal(T.hSapma('g6', 10), null);
  // IT dizisi büyüdükçe artar (her satırda IT6 < … < IT11, her sütunda boyla artar)
  for (const d of [2, 5, 8, 15, 25, 40, 60, 100, 150, 200, 300, 350, 450]) for (let g = 6; g < 11; g++) assert.ok(T.itDeger(g, d) < T.itDeger(g + 1, d));
});

t('3) Ra dizisi N1…N12', () => {
  assert.equal(T.RA.length, 12);
  assert.equal(T.nSinifi(3.2), 'N8'); assert.equal(T.nSinifi(0.8), 'N6'); assert.equal(T.nSinifi(50), 'N12'); assert.equal(T.nSinifi(4), '');
});

const delik = (o) => { const k = D.delikKesiti(o, 100); return { type: 'cylinder', op: 'sub', d: k.d, hole: { ...k.o, d: k.d, thread: k.thread, kademe: k.kademe, havsa: k.havsa, label: k.label } }; };
t('4) delik yazıları: kılavuz, kademe, havşa, düz + geçme, elle açılmış delik', () => {
  assert.deepEqual(T.delikYazisi(delik({ tur: 'klavuz', olcu: 'M8', derinlik: 20 })), ['M8-6H ↧16,25', 'Ø6,8 ↧20']);
  assert.deepEqual(T.delikYazisi(delik({ tur: 'klavuz', olcu: 'M10', adim: 1.25, boydan: true })), ['M10×1,25-6H boydan boya', 'Ø8,8 boydan boya']);
  assert.deepEqual(T.delikYazisi(delik({ tur: 'kademe', olcu: 'M6', derinlik: 25 })), ['Ø6,6 ↧25', '⌴ Ø11,25 ↧6']);
  assert.deepEqual(T.delikYazisi(delik({ tur: 'havsa', olcu: 'M5', boydan: true })), ['Ø5,5 boydan boya', '⌵ Ø10,65 × 90°']);
  const dz = { ...delik({ tur: 'duz', olcu: 'M10', seri: 'orta', derinlik: 15 }), fit: 'H7' };
  assert.deepEqual(T.delikYazisi(dz), ['Ø11 H7 (+0,018 / 0) ↧15']);
  assert.deepEqual(T.delikYazisi({ type: 'cylinder', d: 10, fit: 'H7' }), ['Ø10 H7 (+0,015 / 0)']);
  assert.deepEqual(T.delikYazisi({ type: 'cylinder', d: 12.5 }), ['Ø12,5']);
});

t('5) resim parça listesi: oyuk / gizli / yardımcı parçalar yok; aynı parçalar adetle', () => {
  const parts = [
    { id: 1, type: 'box', op: 'add', name: 'Gövde' },
    { id: 2, type: 'cylinder', op: 'sub', d: 6.8 },
    { id: 3, type: 'cone', op: 'sub', aux: true, parent: 2 },
    { id: 4, type: 'cylinder', op: 'add', name: 'Pim', mat: 'p' },
    { id: 5, type: 'cylinder', op: 'add', name: 'Pim', mat: 'p' },
    { id: 6, type: 'box', op: 'add', name: 'Kapak', hidden: true },
  ];
  const rows = T.resimParcaListesi(parts, (p) => p.type, (p) => p.mat || 'çelik');
  assert.deepEqual(rows.map((r) => [r.poz, r.ad, r.adet, r.malzeme]), [[1, 'Gövde', 1, 'çelik'], [2, 'Pim', 2, 'p']]);
  assert.deepEqual(rows[1].ids, [4, 5]);
  // ilk parça "oyuk" olsa bile tabandır, listede kalır
  assert.equal(T.resimParcaListesi([{ id: 1, type: 'box', op: 'sub' }], () => '', () => '').length, 1);
});

t('6) delik tablosu: aynı yazı adetle, harfle', () => {
  const a = delik({ tur: 'klavuz', olcu: 'M6', derinlik: 12 }), b = delik({ tur: 'klavuz', olcu: 'M6', derinlik: 12 }), c = delik({ tur: 'kademe', olcu: 'M8', boydan: true });
  const rows = T.delikTablosu([{ id: 0, type: 'box', op: 'add' }, a, b, c, { type: 'cylinder', op: 'sub', d: 5 }]);
  assert.equal(rows.length, 2);
  assert.deepEqual(rows.map((r) => [r.harf, r.adet]), [['A', 2], ['B', 1]]);
  assert.ok(/M6-6H/.test(rows[0].yazi));
});

console.log(fail ? `\n${fail} test başarısız` : '\nhepsi geçti');
process.exit(fail ? 1 : 0);
