// Çalıştır: node tests/tx-knit.test.mjs
// Tekstil — Aşama 5: triko desen ve ilmek sistemi (şema, doğrulama, numune, ölçü ↔ ilmek, şekillendirme, bedenler).
import assert from 'node:assert/strict';
import * as K from '../tx/knit/chart.js';
import * as S from '../tx/knit/shape.js';
import { chartPDF } from '../tx/knit/chart-export.js';
import * as M from '../tx/model.js';
import { openStore, memoryBackend } from '../tx/store.js';

let fail = 0;
const tests = [];
const t = (name, fn) => tests.push([name, fn]);
const near = (a, b, tol, m = '') => assert.ok(Math.abs(a - b) <= tol, `${m} ${a} ≉ ${b} (±${tol})`);
const SW = { st10: 28, row10: 38 };

t('1. Hazır desenler (9) geçerli; ribana 1×1 ve 2×2 düz / ters dizilişi; jakar 2 renk; ajur sıraları dengeli', () => {
  for (const k of Object.keys(K.TEMPLATES)) assert.deepEqual(K.validateChart(K.fromTemplate(k)), [], k);
  const r1 = K.fromTemplate('rib11'), r2 = K.fromTemplate('rib22');
  for (let y = 0; y < r1.h; y++) for (let x = 0; x < r1.w; x++) assert.equal(K.get(r1, x, y), x % 2 ? 'p' : 'k');
  assert.deepEqual([...Array(8).keys()].map((x) => K.get(r2, x, 0)).join(''), 'kkppkkpp');
  const j = K.fromTemplate('baklava'); assert.equal(j.palette.length, 2); assert.ok(j.col.includes(1) && j.col.includes(0));
  const a = K.fromTemplate('ajur'); for (let y = 0; y < a.h; y++) assert.equal(K.rowStats(a, y).delta, 0);
});

t('2. Saç örgüsü: başlangıç + devam hücreleri yazılır; sığmazsa reddedilir; üstüne ilmek konunca çapraz temizlenir; eksik çapraz hata', () => {
  const ch = K.createChart({ w: 10, h: 4 });
  K.setStitch(ch, 2, 1, 'c6L');
  assert.deepEqual([...Array(10).keys()].map((x) => K.get(ch, x, 1)), ['k', 'k', 'c6L', 'c+', 'c+', 'c+', 'c+', 'c+', 'k', 'k']);
  assert.throws(() => K.setStitch(ch, 6, 2, 'c6R'), /yer yok/);
  K.setStitch(ch, 4, 1, 'p'); assert.equal(K.get(ch, 2, 1), 'k'); assert.equal(K.get(ch, 4, 1), 'p'); assert.equal(K.get(ch, 7, 1), 'k');
  const bad = K.createChart({ w: 6, h: 2 }); bad.st[1] = 'c4R'; bad.st[2] = 'c+'; bad.st[7] = 'c+';
  const m = K.validateChart(bad).map((x) => x.msg).join('\n');
  assert.match(m, /saç örgüsü eksik/); assert.match(m, /başı olmayan/);
  assert.throws(() => K.setStitch(ch, 0, 0, 'zz'), /Bilinmeyen/);
  bad.st[0] = 'brioche'; assert.ok(K.validateChart(bad).some((x) => x.level === 'hata' && /Desteklenmeyen ilmek kodu: brioche/.test(x.msg)));
});

t('3. Doğrulama uyarıları: dengesiz delik / eksiltme, uzun jakar atlaması, sırada 3 renk, üst üste askı, uzun atlama ilmeği', () => {
  const ch = K.createChart({ w: 20, h: 8, palette: [{ name: 'A', hex: '#ffffff' }, { name: 'B', hex: '#000000' }, { name: 'C', hex: '#ff0000' }] });
  K.setStitch(ch, 3, 0, 'yo');
  K.setColor(ch, 0, 1, 1); K.setColor(ch, 19, 1, 1);   // B rengi 18 ilmek atlar
  K.setColor(ch, 0, 2, 1); K.setColor(ch, 1, 2, 2);
  for (let y = 0; y < 6; y++) K.setStitch(ch, 5, y, 't');
  for (let x = 8; x < 17; x++) K.setStitch(ch, x, 7, 'm');
  const m = K.validateChart(ch).map((x) => x.msg).join('\n');
  assert.match(m, /Sıra 1: ilmek sayısı \+1/); assert.match(m, /"B" rengi 18 ilmek atlıyor/); assert.match(m, /Sıra 3: 3 renk/); assert.match(m, /6 sıra üst üste askı/); assert.match(m, /9 ilmek üst üste atlama/);
  assert.equal(K.rowStats(ch, 1).floats[1], 18);
});

t('4. Tekrar ile alan doldurma: tekrar periyodik, ortalanır; kenarda bölünen saç örgüsü düzeltilir ve sayılır', () => {
  const r = K.fromTemplate('rib22'), { chart } = K.tile(r, 18, 3);
  for (let x = 4; x < 18; x++) assert.equal(K.get(chart, x, 0), K.get(chart, x - 4, 0));
  const c = K.tile(K.fromTemplate('sac22'), 13, 16);
  assert.ok(c.cutCables >= 1); assert.deepEqual(K.validateChart(c.chart).filter((x) => x.level === 'hata'), []);
  const full = K.tile(K.fromTemplate('sac22'), 24, 16); assert.equal(full.cutCables, 0);
});

t('5. Yazılı talimat: ön yüz sağdan sola, arka yüz soldan sağa ve düz / ters yer değiştirir; ardışık ilmekler gruplanır; CSV', () => {
  const ch = K.createChart({ w: 6, h: 2 }); for (const x of [0, 1, 2]) K.setStitch(ch, x, 0, 'p'); for (const x of [0, 1, 2]) K.setStitch(ch, x, 1, 'p');
  const L = K.instructions(ch);
  assert.equal(L[0], '1. sıra (ön yüz, sağdan sola): 3 düz, 3 ters');
  assert.equal(L[1], '2. sıra (arka yüz, soldan sağa): 3 düz, 3 ters');
  assert.equal(K.instructions(ch, { flat: false })[1], '2. sıra (sağdan sola): 3 düz, 3 ters');
  const csv = K.toCSV(ch).trim().split('\n'); assert.equal(csv.length, 3); assert.equal(csv[1], '2;p;p;p;k;k;k');
});

t('6. Ölçü ↔ ilmek: 28 ilmek / 10 cm → 52 cm = 145,6 → tekrar 8 + 2 kenar ile 146 ilmek (52,14 cm); ters dönüşüm tutarlı; geçersiz numune reddedilir', () => {
  const f = S.fitStitches(520, SW, { rep: 8, edge: 1 });
  assert.equal(f.n, 146); assert.equal((f.n - 2) % 8, 0); near(f.width, 1460 / 2.8, 1e-9); near(f.raw, 145.6, 1e-9);
  assert.ok(Math.abs(f.n - f.raw) <= 8 / 2 + 1e-9, 'en yakın tekrar katı');
  near(S.widthOf(S.stitchesFor(333, SW), SW), 333, 1e-9); near(S.heightOf(S.rowsFor(650, SW), SW), 650, 1e-9);
  assert.equal(S.fitRows(60, SW).n, 23);
  assert.deepEqual(S.validateSwatch({ st10: 0, row10: 38 }).length, 1); assert.deepEqual(S.validateSwatch({ st10: NaN, row10: -1 }).length, 2);
});

t('7. Şekillendirme dağılımı: toplam değişim ve sıra tam; aralıklar a / a+1 (fark ≤ 1); yetersiz sıra reddedilir', () => {
  for (const [n, r] of [[20, 130], [7, 7], [13, 100], [1, 9], [25, 180]]) {
    const sp = S.spread(n, r);
    assert.equal(sp.steps.length, n); assert.equal(sp.steps.at(-1), r);
    const gaps = sp.steps.map((s, i) => s - (i ? sp.steps[i - 1] : 0)); assert.ok(Math.max(...gaps) - Math.min(...gaps) <= 1);
    assert.equal(sp.groups.reduce((a, g) => a + g.times, 0), n); assert.equal(sp.groups.reduce((a, g) => a + g.every * g.times, 0), r);
  }
  assert.throws(() => S.spread(10, 9), /en az 10 sıra/);
});

t('8. Parça hesabı: beden (yaka ortada, omuzlar eşit, hedef genişliğe ±1 ilmek), kol (artırma sonunda pazu ilmeği tam), atkı; hatalı ölçü reddedilir', () => {
  const b = S.computePiece('beden', { width: 520, length: 650, ribH: 60, armhole: 220, neckW: 180, neckD: 80 }, SW, { rep: 1, ribRep: 2 });
  assert.equal(b.neckSt + 2 * b.shoulderSt, b.castOn); assert.ok(Math.abs(b.castOn - 145.6) <= 1);
  const k = S.computePiece('kol', { cuffW: 200, upperW: 380, length: 560, ribH: 60 }, SW, { rep: 1, ribRep: 2 });
  assert.equal(k.castOn + 2 * k.perSide, k.end); assert.equal(k.steps.length, k.perSide); assert.ok(k.steps.at(-1) <= k.rows);
  assert.ok(Math.abs(k.end - S.stitchesFor(380, SW)) <= 2);
  const a = S.computePiece('atki', { width: 280, length: 1600, ribH: 40 }, SW, { rep: 4, ribRep: 4 }); assert.equal((a.castOn - 2) % 4, 0);
  assert.throws(() => S.computePiece('kol', { cuffW: 400, upperW: 300, length: 560, ribH: 60 }, SW), /manşetten küçük/);
  assert.throws(() => S.computePiece('beden', { width: 520, length: 250, ribH: 60, armhole: 220, neckW: 180, neckD: 80 }, SW), /kısa/);
  assert.throws(() => S.computePiece('beden', { width: 520, length: 650, ribH: 60, armhole: 220, neckW: 180, neckD: 80 }, { st10: 0, row10: 1 }), /0–200/);
});

t('9. Bedenlere göre ilmek sayıları: göğüsle artar, desen tekrarı (8) ve ribana (4) her bedende korunur', () => {
  const sizes = ['S', 'M', 'L', 'XL'], table = { sizes, measures: { 'Göğüs çevresi': { S: 920, M: 960, L: 1000, XL: 1040 } } };
  const g = S.gradeKnit('beden', { width: 520, length: 650, ribH: 60, armhole: 220, neckW: 180, neckD: 80 }, SW, table, sizes, { rep: 8, ribRep: 4, edge: 1, base: 'M' });
  assert.ok(g.every((x) => x.ok)); for (const x of g) assert.equal((x.castOn - 2) % 8, 0);
  for (let i = 1; i < g.length; i++) assert.ok(g[i].castOn >= g[i - 1].castOn);
  assert.ok(g.at(-1).castOn > g[0].castOn);
  const kg = S.gradeKnit('kol', { cuffW: 200, upperW: 380, length: 560, ribH: 60 }, SW, table, sizes, { rep: 1, ribRep: 2, edge: 1, base: 'M' });
  assert.ok(kg.every((x) => x.ok) && kg.at(-1).end > kg[0].end);
});

t('10. Şema PDF: geçerli yapı; büyük şema birden çok sayfaya bölünür; semboller ve tekrar açıklaması', () => {
  const r = chartPDF(K.fromTemplate('sac22'));
  const txt = Buffer.from(r.bytes).toString('latin1'), xref = +txt.match(/startxref\n(\d+)/)[1];
  assert.equal(txt.slice(xref, xref + 4), 'xref'); assert.equal(r.pages, 1); assert.ok(!/NaN|undefined/.test(txt));
  assert.match(txt, /tekrar/); assert.match(txt, /Sa\\347 \\366rg\\374s\\374 2\/2/);
  const big = K.tile(K.fromTemplate('baklava'), 120, 300).chart; const rb = chartPDF(big); assert.ok(rb.pages >= 2, 'sayfa ' + rb.pages);
});

t('11. Projede triko: yalnız triko projesinde; ürün triko olmalı; numune / desen / parça doğrulanır; kayıt gidiş-dönüş', async () => {
  const w = M.createProject({ name: 'D', type: 'woven' }); assert.throws(() => M.addSwatch(w, { st10: 28, row10: 38 }), /triko yok/);
  const p = M.createProject({ name: 'T', type: 'mixed' });
  const kz = M.addProduct(p, { branch: 'knit', type: 'kazak' }), gm = M.addProduct(p, { branch: 'woven', type: 'gomlek' });
  assert.throws(() => M.addSwatch(p, { st10: -1, row10: 38 }), /0–200/);
  const sw = M.addSwatch(p, { name: 'Merinos', st10: 28, row10: 38, washed: true });
  const ch = M.addChart(p, 'sac22');
  assert.throws(() => M.addKnitPiece(p, { kind: 'beden', swatch: sw.id, product: gm.id }), /triko ürününe/);
  const pc = M.addKnitPiece(p, { kind: 'beden', swatch: sw.id, chart: ch.id, rib: 'rib22', product: kz.id, size: 'M' });
  assert.equal((M.knitCompute(p, pc).castOn - 2) % 8, 0);
  assert.deepEqual(M.validate(p).filter((x) => x.level === 'hata'), []);
  sw.st10 = 0; assert.ok(M.validate(p).some((x) => x.level === 'hata' && /Numune/.test(x.where))); sw.st10 = 28;
  ch.st[0] = 'zz'; assert.ok(M.validate(p).some((x) => /Desteklenmeyen/.test(x.msg))); ch.st[0] = 'p';
  const S2 = openStore(memoryBackend()); await S2.commit(p, 'triko'); assert.deepEqual((await S2.get(p.id)).knit, p.knit);
});

for (const [name, fn] of tests) {
  try { await fn(); console.log('ok   ', name); }
  catch (e) { fail++; console.log('FAIL ', name, '\n     ', String(e.message).split('\n')[0]); }
}
console.log(fail ? `\n${fail} test başarısız` : '\nTüm testler geçti');
process.exit(fail ? 1 : 0);
