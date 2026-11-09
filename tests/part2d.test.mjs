// Çalıştır: node tests/part2d.test.mjs
// Elle çizilmiş parçayı yorumlama (part2d.js) ve gerçek bir defter fotoğrafından (tests/fixtures) uçtan uca okuma.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import zlib from 'node:zlib';
import { interpretPart, partEnts, fixPart, partSummary } from '../part2d.js';
import { vectorize, inkGray, otsu } from '../photo2d.js';

let fail = 0;
const t = (name, fn) => {
  try { fn(); console.log('ok   ', name); }
  catch (e) { fail++; console.log('FAIL ', name, '\n     ', e.message.split('\n')[0]); }
};
const L = (a, b) => ({ t: 'line', a, b });
const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg || ''} ${a} ≉ ${b}`);

// Sentetik "el çizimi" (oranları bozuk): 60×40 çizilmiş, üzerinde 100 ve 50 yazıyor.
// Sol üst köşe pah (çizimde 8), sağ üst radyüs (çizimde ~10), delik Ø (kılavuzlu), ölçü uzatma çizgileri.
function sketch() {
  const ents = [];
  // dış şekil (sol alt 10,10 ; sağ üst 70,50)
  ents.push(L([10, 10], [70, 10]), L([70, 10], [70, 40]));
  ents.push({ t: 'arc', c: [60, 40], r: 10, a0: 0, a1: Math.PI / 2 });          // sağ üst R
  ents.push(L([60, 50], [18, 50]), L([18, 50], [10, 42]), L([10, 42], [10, 10])); // sol üst pah 8
  // delik + kılavuz + ok
  ents.push({ t: 'circle', c: [30, 30], r: 4 });
  ents.push(L([33, 33], [45, 62]), L([45, 62], [43, 58.5]), L([45, 62], [41.5, 60]));
  // genişlik ölçüsü: alt kenarın altına inen uzatma çizgileri
  ents.push(L([10, 10], [10, 0]), L([70, 10], [70, 0]));
  // yükseklik ölçüsü: sol kenarın soluna taşan uzatma çizgileri
  ents.push(L([10, 10], [0, 10]), L([10, 50], [0, 50]));
  const texts = [
    { s: '100', value: 100, p: [40, 2], h: 4, conf: 0.99, rot: 0, dia: false },
    { s: '50', value: 50, p: [3, 30], h: 4, conf: 0.99, rot: 90, dia: false },
    { s: '12', value: 12, p: [47, 66], h: 4, conf: 0.99, rot: 0, dia: true },
    { s: '15', value: 15, p: [4, 54], h: 4, conf: 0.99, rot: 0, dia: false },
  ];
  return { ents, texts };
}

t('genişlik / yükseklik yazıdan, kenarlar konumdan bağlanır', () => {
  const { ents, texts } = sketch();
  const p = interpretPart(ents, texts);
  assert.equal(p.w, 100); assert.equal(p.h, 50);
  assert.equal(p.wFrom, 'yazı'); assert.equal(p.hFrom, 'yazı');
  near(p.scale[0], 100 / 60, 0.02); near(p.scale[1], 50 / 40, 0.02);
});

t('köşeler: pah ve radyüs biçimi çizimden, köşe yazısı en yakın köşeye', () => {
  const { ents, texts } = sketch();
  const p = interpretPart(ents, texts);
  assert.equal(p.corners.tl.type, 'chamfer'); assert.equal(p.corners.tl.size, 15); assert.equal(p.corners.tl.from, 'yazı');
  assert.equal(p.corners.tr.type, 'radius');
  near(p.corners.tr.size, 10 * (100 / 60 + 50 / 40) / 2, 2.5, 'R');
  assert.equal(p.corners.bl.type, 'sharp'); assert.equal(p.corners.br.type, 'sharp');
});

t('delik: kılavuz ucundaki Ø yazısı çapı verir, konum orantılı', () => {
  const { ents, texts } = sketch();
  const p = interpretPart(ents, texts);
  assert.equal(p.holes.length, 1);
  assert.equal(p.holes[0].d, 12); assert.equal(p.holes[0].dFrom, 'yazı');
  near(p.holes[0].x, 20 * 100 / 60, 1); near(p.holes[0].y, 20 * 50 / 40, 1);
});

t('yazı yoksa kağıt ölçeği, delik çapı çizimden', () => {
  const { ents } = sketch();
  const p = interpretPart(ents, []);
  near(p.w, 60, 0.6); near(p.h, 40, 0.6);
  near(p.holes[0].d, 8, 0.6);
  assert.ok(p.notes.length);
});

t('kutunun dışındaki küçük daire (ok ucu) delik sayılmaz', () => {
  const { ents, texts } = sketch();
  ents.push({ t: 'circle', c: [-4, 30], r: 2 });
  const p = interpretPart(ents, texts);
  assert.equal(p.holes.length, 1);
});

t('partEnts: kapalı dış şekil, doğru radyüs / pah, ölçüler', () => {
  const p = fixPart({ w: 100, h: 50, corners: { bl: { type: 'sharp', size: 0 }, br: { type: 'chamfer', size: 5 }, tr: { type: 'radius', size: 10 }, tl: { type: 'sharp', size: 0 } }, holes: [{ x: 20, y: 25, d: 12 }] });
  const E = partEnts(p);
  const shape = E.filter((e) => !e._dim && e.t !== 'circle');
  // uç noktalar zincir oluşturmalı (her nokta iki kez)
  const key = (q) => q.map((v) => v.toFixed(6)).join(',');
  const cnt = new Map();
  for (const e of shape) {
    const ends = e.t === 'line' ? [e.a, e.b] : [[e.c[0] + e.r * Math.cos(e.a0), e.c[1] + e.r * Math.sin(e.a0)], [e.c[0] + e.r * Math.cos(e.a1), e.c[1] + e.r * Math.sin(e.a1)]];
    for (const q of ends) cnt.set(key(q), (cnt.get(key(q)) || 0) + 1);
  }
  for (const [k, v] of cnt) assert.equal(v, 2, 'açık uç ' + k);
  const arc = shape.find((e) => e.t === 'arc');
  assert.equal(arc.r, 10); near(arc.c[0], 90, 1e-9); near(arc.c[1], 40, 1e-9);
  const ch = shape.find((e) => e.t === 'line' && Math.abs(e.a[0] - e.b[0]) > 1e-9 && Math.abs(e.a[1] - e.b[1]) > 1e-9);
  near(Math.hypot(ch.a[0] - ch.b[0], ch.a[1] - ch.b[1]), 5 * Math.SQRT2, 1e-9);
  assert.equal(E.filter((e) => e.t === 'circle').length, 1);
  const dims = E.filter((e) => e._dim);
  assert.ok(dims.some((d) => d.t === 'dim' && Math.abs(Math.hypot(d.b[0] - d.a[0], d.b[1] - d.a[1]) - 100) < 1e-9));
  assert.ok(dims.some((d) => d.t === 'dim' && Math.abs(Math.hypot(d.b[0] - d.a[0], d.b[1] - d.a[1]) - 50) < 1e-9));
  assert.ok(dims.some((d) => d.t === 'rdim' && d.dia && d.r === 6));
  assert.ok(dims.some((d) => d.t === 'rdim' && !d.dia && d.r === 10));
});

t('fixPart: aşırı köşe ölçüsü kenara sığdırılır, geçersiz delik atılır', () => {
  const p = fixPart({ w: 20, h: 10, corners: { bl: { type: 'radius', size: 50 }, br: { type: 'radius', size: 50 }, tr: { type: 'sharp', size: 9 }, tl: { type: 'chamfer', size: 0 } }, holes: [{ x: 1, y: 1, d: 0 }] });
  assert.ok(p.corners.bl.size <= 5 && p.corners.br.size <= 5);
  assert.equal(p.corners.tr.size, 0); assert.equal(p.corners.tl.type, 'sharp');
  assert.equal(p.holes.length, 0);
  assert.match(partSummary(p), /20 × 10 mm/);
});

t('inkGray: gölge ve çizgili kağıt silinir, mavi kalem kalır', () => {
  const w = 120, h = 80, rgba = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4, sh = x > 60 ? 0.55 : 1;                     // sağ yarı el gölgesi
    let r = 235, g = 232, b = 225;
    if (y % 12 === 0) { r = 190; g = 200; b = 215; }                     // soluk mavi satır çizgisi
    if (y >= 38 && y <= 40 && x > 10 && x < 110) { r = 40; g = 50; b = 150; }  // mavi tükenmez çizgi
    rgba[i] = r * sh; rgba[i + 1] = g * sh; rgba[i + 2] = b * sh; rgba[i + 3] = 255;
  }
  const ink = inkGray(rgba, w, h), T = Math.min(185, Math.max(50, otsu(ink) * 1.0));   // vectorize ile aynı eşik kuralı
  assert.ok(ink[39 * w + 30] < T && ink[39 * w + 90] < T, 'kalem çizgisi iki tarafta da mürekkep');
  assert.ok(ink[20 * w + 90] > T, 'gölgedeki boş kağıt mürekkep değil');
  assert.ok(ink[20 * w + 61] > T && ink[20 * w + 59] > T, 'gölge kenarı mürekkep değil');
  assert.ok(ink[24 * w + 30] > T && ink[24 * w + 90] > T, 'satır çizgisi mürekkep değil');
});

// Gerçek defter fotoğrafı (kullanıcının eskizinden; perspektif düzeltilmiş mürekkep haritası, 707×1000, A4 dikey):
// 40 × 120 plaka, sol üstte "15" köşe, Ø20 ve Ø15 delik (kılavuzlu, rakamlar yan yazılmış), çizgili kağıt + el gölgesi.
t('gerçek eskiz: rakamlar (yan yazı, Ø) ve parça yorumu', () => {
  const g = new Uint8Array(zlib.inflateSync(fs.readFileSync(new URL('./fixtures/sketch1-ink.bin.z', import.meta.url))));
  const r = vectorize(g, 707, 1000, { ink: true, mmPerPx: 210 / 707 });
  const got = r.texts.map((x) => (x.dia ? 'Ø' : '') + x.s).sort();
  assert.deepEqual(got, ['120', '15', '40', 'Ø15', 'Ø20'].sort());
  const p = interpretPart(r.ents, r.texts);
  assert.equal(p.w, 40); assert.equal(p.h, 120);
  assert.deepEqual(p.holes.map((h) => h.d).sort((a, b) => a - b), [15, 20]);
  assert.ok(p.holes.every((h) => h.dFrom === 'yazı'));
  assert.equal(p.corners.tl.size, 15); assert.equal(p.corners.tl.from, 'yazı');
  // büyük delik üstte, küçük altta (çizimdeki gibi)
  const big = p.holes.find((h) => h.d === 20), small = p.holes.find((h) => h.d === 15);
  assert.ok(big.y > 80 && small.y < 40, `${big.y} / ${small.y}`);
  assert.ok(big.x > 0 && big.x < 40 && small.x > 0 && small.x < 40);
});

console.log(fail ? `\n${fail} test BAŞARISIZ` : '\nTüm testler geçti');
process.exit(fail ? 1 : 0);
