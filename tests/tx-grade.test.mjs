// Çalıştır: node tests/tx-grade.test.mjs
// Tekstil — Aşama 4: beden ve grading (kural tabanlı, blok ölçüsünden ve orantılı).
import assert from 'node:assert/strict';
import * as C from '../tx/curve.js';
import * as P from '../tx/woven/pattern.js';
import * as B from '../tx/woven/blocks.js';
import * as G from '../tx/woven/grade.js';
import * as M from '../tx/model.js';

let fail = 0;
const tests = [];
const t = (name, fn) => tests.push([name, fn]);
const near = (a, b, tol, m = '') => assert.ok(Math.abs(a - b) <= tol, `${m} ${a} ≉ ${b} (±${tol})`);
const SZ = ['XS', 'S', 'M', 'L', 'XL', 'XXL'], row = (a, s) => Object.fromEntries(SZ.map((z, i) => [z, a + s * (i - 2)]));
const TABLE = { id: 's1', name: 'Test', source: 'test', sizes: SZ, measures: { 'Göğüs çevresi': row(960, 40), 'Bel çevresi': row(760, 40), 'Kalça çevresi': row(1000, 40), 'Boy': row(1680, 20) } };
const rect = (w, h) => P.makePiece({ name: 'r', grain: [[w / 2, h / 4], [w / 2, 3 * h / 4]], edges: [[0, 0], [w, 0], [w, h], [0, h]].map((p, i, a) => ({ segs: [C.line(p, a[(i + 1) % 4])], allow: 10 })) });

t('1. Kural uygulama: köşeler tam kural kadar kayar; düz kenar düz kalır; eğri kenar uçları ve süreklilik korunur', () => {
  const r = rect(200, 300), g = G.applyRules(r, [[0, 0], [20, 0], [20, 10], [0, 10]]);
  assert.deepEqual(G.corners(g), [[0, 0], [220, 0], [220, 310], [0, 310]]);
  for (const e of g.edges) assert.ok(P.isStraight(e));
  near(P.measure(g).seamArea, 220 * 310, 1e-6);
  const cp = P.makePiece({ name: 'c', edges: [{ segs: [C.cubic([0, 0], [50, -40], [150, -40], [200, 0])], allow: 10 }, { segs: [C.line([200, 0], [200, 200])], allow: 10 }, { segs: [C.line([200, 200], [0, 200])], allow: 10 }, { segs: [C.line([0, 200], [0, 0])], allow: 10 }] });
  const cg = G.applyRules(cp, [[-10, 0], [10, 0], [10, 20], [-10, 20]]);
  assert.deepEqual(cg.edges[0].segs[0].a, [-10, 0]); assert.deepEqual(cg.edges[0].segs[0].b, [210, 0]);
  assert.deepEqual(P.validatePiece(cg).filter((x) => x.level === 'hata'), []);
  assert.throws(() => G.applyRules(r, [[0, 0]]), /Kural sayısı/);
});

t('2. Çıt kenar boyuyla orantılı kayar; pens genişliği sabit kalır, yeri orantılı kayar; pay, adet, kat kenarı aynen taşınır', () => {
  const r = rect(200, 300); r.notches.push({ edge: 0, at: 50, kind: 'tek' }); r.edges[2].allow = 40; r.qty = 2; r.fold = 3;
  r.edges[0].segs = [C.line([0, 0], [90, 0]), C.line([90, 0], [110, 0]), C.line([110, 0], [200, 0])]; r.darts.push({ a: [90, 0], b: [110, 0], apex: [100, 100] });
  const g = G.applyRules(r, [[0, 0], [40, 0], [40, 0], [0, 0]]);
  near(g.notches[0].at, 50 * 240 / 200, 1e-9); near(P.dartIntake(g.darts[0]), 20, 1e-9); near((g.darts[0].a[0] + g.darts[0].b[0]) / 2, 120, 1e-9);
  near(P.seamLength(g, 0), 240 - 20, 1e-9);
  assert.equal(g.edges[2].allow, 40); assert.equal(g.qty, 2); assert.equal(g.fold, 3);
});

t('3. Blok parçaları: her bedende köşeler, o bedenin ölçüsüyle yeniden çizilen blokla birebir aynı (gömlek ve etek, 6 beden)', () => {
  for (const set of ['gomlek', 'etek']) {
    const base = B.buildSet(set, G.paramsForSize(set, B.defaultParams(set), TABLE, 'M'), { size: 'M' });
    const r = G.gradeGroup(base.pieces, base.seams, { table: TABLE, base: 'M', sizes: SZ });
    assert.deepEqual(r.report, [], set);
    for (const z of SZ.filter((x) => x !== 'M')) {
      const ref = B.buildSet(set, G.paramsForSize(set, B.defaultParams(set), TABLE, z));
      r.groups[z].pieces.forEach((pc, i) => G.corners(pc).forEach((c, j) => near(C.dist(c, G.corners(ref.pieces[i])[j]), 0, 1e-9, `${set} ${z} ${pc.name}`)));
    }
  }
});

t('4. Gömlek: bedenler arası arka yarı genişlik farkı = göğüs farkı / 4 (10 mm); kol başı her bedende kol oyuğu + bolluk; bütün eşleşmeler tutar', () => {
  const base = B.buildSet('gomlek', G.paramsForSize('gomlek', B.defaultParams('gomlek'), TABLE, 'M'), { size: 'M' });
  const r = G.gradeGroup(base.pieces, base.seams, { table: TABLE, base: 'M', sizes: SZ });
  const width = (pcs) => { const b = P.bboxPts(P.seamPolygon(pcs.find((p) => p.name === 'Arka beden'))); return b.x1 - b.x0; };
  const w = SZ.map((z) => width(z === 'M' ? base.pieces : r.groups[z].pieces));
  for (let i = 1; i < w.length; i++) near(w[i] - w[i - 1], 40 / 4, 1e-9);
  for (const z of SZ.filter((x) => x !== 'M')) {
    const g = r.groups[z]; for (const sm of g.seams) assert.ok(P.seamCheck(g.pieces, sm).ok, z + ' ' + sm.name);
    const f = g.pieces.find((p) => p.name === 'Ön beden'), b = g.pieces.find((p) => p.name === 'Arka beden'), s = g.pieces.find((p) => p.name === 'Kol');
    near(P.edgeLength(s.edges[0]) - P.edgeLength(f.edges[2]) - P.edgeLength(b.edges[2]), 10, 0.01, z);
  }
});

t('5. Temel bedende yapılan düzenleme (çıt, pay, not) bütün bedenlere taşınır; parça taşınmış olsa da kurallar farktan hesaplanır', () => {
  const base = B.buildSet('etek', B.defaultParams('etek'), { size: 'M' });
  base.pieces[0] = P.translatePiece(base.pieces[0], 300, 50); base.pieces[0].notches.push({ edge: 1, at: 300, kind: 'çift' }); base.pieces[0].edges[2].allow = 50; base.pieces[0].notes = 'kontrol';
  const r = G.gradeGroup(base.pieces, base.seams, { table: TABLE, base: 'M', sizes: ['L'] });
  const L = r.groups.L.pieces[0];
  assert.equal(L.notches.length, 2); assert.equal(L.edges[2].allow, 50); assert.equal(L.notes, 'kontrol');
  near(G.corners(L)[0][0], G.corners(base.pieces[0])[0][0], 1e-9, 'ön orta (kat) yerinde kalır');
  assert.equal(L.gradedFrom.base, 'M'); assert.match(L.gradedFrom.how, /yeniden çizildi/);
  // biçim değiştirilmiş parça (etek ucu 2 cm uzatıldı): kural esnetme ile yayılır, eşleşme yine tutar
  const ed = B.buildSet('etek', B.defaultParams('etek'), { size: 'M' }), f = ed.pieces[0];
  f.edges[1].segs.at(-1).b[1] += 20; f.edges[2].segs[0].a[1] += 20; f.edges[2].segs[0].b[1] += 20; f.edges[3].segs[0].a[1] += 20;
  ed.pieces[1].edges[1].segs.at(-1).b[1] += 20; ed.pieces[1].edges[2].segs[0].a[1] += 20; ed.pieces[1].edges[2].segs[0].b[1] += 20; ed.pieces[1].edges[3].segs[0].a[1] += 20;
  const r2 = G.gradeGroup(ed.pieces, ed.seams, { table: TABLE, base: 'M', sizes: ['XL'] });
  assert.match(r2.groups.XL.pieces[0].gradedFrom.how, /esnetildi/); assert.deepEqual(r2.report, []);
});

t('6. Orantılı grading (blok olmayan parça): genişlik ve boy oranında; düz boy ortası sabit; ölçü yoksa uyarı ve değişmeden kopya', () => {
  const r = rect(200, 300);
  const g = G.gradeGroup([r], [], { table: TABLE, base: 'M', sizes: ['XL'], method: 'auto', wMeasure: 'Göğüs çevresi', hMeasure: 'Boy' });
  const x = g.groups.XL.pieces[0], b = P.bboxPts(P.seamPolygon(x));
  near(b.x1 - b.x0, 200 * 1040 / 960, 1e-9); near(b.y1 - b.y0, 300 * 1720 / 1680, 1e-9);
  near((b.x0 + b.x1) / 2, 100, 1e-9);
  const n = G.gradeGroup([r], [], { table: TABLE, base: 'M', sizes: ['L'], wMeasure: 'Yok', hMeasure: 'Yok' });
  assert.ok(n.report.some((q) => q.level === 'uyarı' && /tabloda yok/.test(q.msg)));
  assert.throws(() => G.gradeGroup([r], [], { table: TABLE, base: '3XL', sizes: ['L'] }), /Temel beden/);
});

t('7. Kişiye özel ölçü: tabloya kişinin adıyla eklenen sütun bir beden gibi yayılır', () => {
  const T2 = JSON.parse(JSON.stringify(TABLE)); T2.sizes.push('Ayşe'); T2.measures['Göğüs çevresi'].Ayşe = 1012; T2.measures['Bel çevresi'].Ayşe = 790; T2.measures['Kalça çevresi'].Ayşe = 1060; T2.measures.Boy.Ayşe = 1650;
  const base = B.buildSet('etek', G.paramsForSize('etek', B.defaultParams('etek'), T2, 'M'), { size: 'M' });
  const r = G.gradeGroup(base.pieces, base.seams, { table: T2, base: 'M', sizes: ['Ayşe'] });
  assert.deepEqual(r.report, []);
  near(P.seamCheck(r.groups.Ayşe.pieces, r.groups.Ayşe.seams.find((s) => /kemer/.test(s.name))).A, 790, 1e-6, 'pens kapalı bel = kişinin beli');
});

t('8. Projede: kaynaksız tablo reddedilir; hedef bedendeki eski kalıp değiştirilir (yinelenmez); karşılaştırma tablosu; doğrulama temiz', () => {
  const p = M.createProject({ name: 'G', type: 'woven' });
  const pr = M.addProduct(p, { branch: 'woven', type: 'gomlek' });
  const t1 = M.addSizeTable(p, { name: 'T', source: '', sizes: ['M', 'L'], measures: { 'Göğüs çevresi': { M: 960, L: 1000 } } });
  M.addPatternSet(p, 'gomlek', {}, { product: pr.id, size: 'M' });
  assert.throws(() => M.gradeProduct(p, { product: pr.id, base: 'M', table: t1.id, sizes: ['L'] }), /kaynağı/);
  t1.source = 'kendi ölçüm';
  M.gradeProduct(p, { product: pr.id, base: 'M', table: t1.id, sizes: ['L'] });
  M.gradeProduct(p, { product: pr.id, base: 'M', table: t1.id, sizes: ['L'] });
  assert.equal(p.woven.pieces.length, 14); assert.equal(p.woven.seams.length, 14);
  assert.deepEqual(M.validate(p).filter((x) => x.level === 'hata'), []);
  const tb = G.sizeTable({ M: p.woven.pieces.filter((x) => x.size === 'M'), L: p.woven.pieces.filter((x) => x.size === 'L') });
  const w = tb.rows.find((x) => x.piece === 'Arka beden' && x.item === 'Genişlik'); near(w.vals[1] - w.vals[0], 10, 1e-9);
  assert.throws(() => M.gradeProduct(p, { product: pr.id, base: 'S', table: t1.id, sizes: ['L'] }), /Temel beden/);
});

for (const [name, fn] of tests) {
  try { await fn(); console.log('ok   ', name); }
  catch (e) { fail++; console.log('FAIL ', name, '\n     ', String(e.message).split('\n')[0]); }
}
console.log(fail ? `\n${fail} test başarısız` : '\nTüm testler geçti');
process.exit(fail ? 1 : 0);
