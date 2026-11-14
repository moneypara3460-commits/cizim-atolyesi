// Çalıştır: node tests/ayk-auto.test.mjs
// Ayakkabı Modelhanesi — kalıbın yan çizgisinden otomatik saya parçaları (Derby, Oxford, Loafer, Spor).
// Sentetik ama gerçeğe yakın kalıp çizgisi (tests/fixtures/kalip-siluet.mjs) kullanılır.
import assert from 'node:assert/strict';
import * as A from '../ayk/auto.js';
import * as M from '../ayk/model.js';
import * as G from '../ayk/geom.js';
import { checkPiece, netPolygon, cutLine } from '../ayk/build.js';
import { checkAll } from '../ayk/match.js';
import { lastView } from './fixtures/kalip-siluet.mjs';

const tests = [];
const t = (name, fn) => tests.push([name, fn]);
const proj = (o = {}) => { const p = M.createProject({ name: 'oto' }); p.last.views.yan = lastView(o); return p; };
const box = (pts) => { let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity; for (const [x, y] of pts) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); } return { x0, y0, x1, y1 }; };
const centroid = (pts) => [pts.reduce((s, q) => s + q[0], 0) / pts.length, pts.reduce((s, q) => s + q[1], 0) / pts.length];
const byName = (r, n) => r.pieces.find((pc) => pc.name === n);

t('1. Kalıbın yönü dört duruşta da doğru tahmin edilir', () => {
  for (const [fx, fy] of [[false, false], [true, false], [false, true], [true, true]]) {
    assert.deepEqual(A.guessOrientation(lastView({ flipX: fx, flipY: fy })), { flipX: fx, flipY: fy });
  }
});

t('2. Her model tipi beklenen parçaları üretir; hiçbir parçada hata/uyarı yok, eşleşmeler tutar', () => {
  const want = {
    derby: ['Ön saya', 'Yan saya', 'Dil'], oxford: ['Ön saya', 'Yan saya', 'Dil'],
    loafer: ['Ön saya', 'Yan saya', 'Maske'], spor: ['Ön saya', 'Yan saya', 'Dil', 'Burun kapağı', 'Topuk takviyesi'],
  };
  for (const type of Object.keys(A.MODELS)) for (const cap of [false, true]) {
    const p = proj(), r = A.generate(p, { type, params: { cap } });
    const names = r.pieces.map((pc) => pc.name);
    const exp = want[type].filter((n) => n !== 'Burun kapağı');
    if (cap) exp.splice(type === 'spor' ? 3 : exp.length, 0, 'Burun kapağı');
    assert.deepEqual(names.sort(), exp.slice().sort(), `${type} cap=${cap}`);
    for (const pc of r.pieces) {
      const iss = checkPiece(pc).filter((i) => i.msg !== 'Malzeme seçilmedi');
      assert.deepEqual(iss.map((i) => i.msg), [], `${type}/${pc.name}`);
      assert.ok(cutLine(pc).pts.length > 10, `${type}/${pc.name} kesim çizgisi`);
    }
    p.pieces.push(...r.pieces); p.matches.push(...r.matches);
    assert.ok(r.matches.length >= 1);
    for (const c of checkAll(p)) assert.equal(c.ok, true, `${type} eşleşme: ${c.issues.map((i) => i.msg).join()}`);
  }
});

t('3. Parçalar kalıbın üstünde: ön saya burunda, yan saya topukta; kenar türleri doğru', () => {
  const p = proj(), L = p.last.views.yan.length, H = p.last.views.yan.height, r = A.generate(p, { type: 'derby' });
  const vb = box(netPolygon(byName(r, 'Ön saya'))), qb = box(netPolygon(byName(r, 'Yan saya')));
  assert.ok(Math.abs(vb.x1 - L) < 1.5, 'ön saya burun ucuna kadar: ' + vb.x1);
  assert.ok(qb.x0 < 2, 'yan saya topuğa kadar: ' + qb.x0);
  for (const pc of r.pieces) { const b = box(netPolygon(pc)); assert.ok(b.x0 > -1 && b.x1 < L + 1 && b.y0 > -30 && b.y1 < H + 1, pc.name + ' kalıp çevresinde'); }
  const kinds = (pc) => G.edges(pc.outline).map((e) => M.edgeProp(pc, e.id).kind);
  assert.deepEqual(kinds(byName(r, 'Ön saya')).slice(0, 3), ['yok', 'montaj', 'binme'], 'derby: ön saya yan sayanın altına girer');
  assert.ok(kinds(byName(r, 'Yan saya')).includes('dikis') && kinds(byName(r, 'Yan saya')).includes('montaj'));
  const ox = A.generate(proj(), { type: 'oxford' });
  assert.equal(kinds(byName(ox, 'Ön saya'))[2], 'katlama', 'oxford: ön saya üstte');
  assert.ok(kinds(byName(ox, 'Yan saya')).includes('binme'), 'oxford: yan saya ön sayanın altında');
});

t('4. Ters çekilmiş kalıpta parçalar da ters (görünümdeki kalıba oturur)', () => {
  const p = proj({ flipX: true }), r = A.generate(p, { type: 'derby' });
  assert.equal(r.frame.flipX, true);
  const v = centroid(netPolygon(byName(r, 'Ön saya'))), q = centroid(netPolygon(byName(r, 'Yan saya')));
  assert.ok(v[0] < q[0], 'burun solda olduğundan ön saya solda');
  for (const pc of r.pieces) assert.deepEqual(checkPiece(pc).filter((i) => i.level === 'hata'), [], pc.name);
  // yönü elle zorlamak
  const r2 = A.generate(p, { type: 'derby', flipX: false, flipY: false });
  assert.equal(r2.frame.flipX, false);
});

t('5. Ayarlar: arka yükseklik, delik sayısı, burun kapağı; sınır dışı değerler kırpılır', () => {
  const lo = A.generate(proj(), { type: 'derby', params: { backH: 55 } }), hi = A.generate(proj(), { type: 'derby', params: { backH: 75 } });
  const top = (r) => Math.min(...netPolygon(byName(r, 'Yan saya')).filter((q) => q[0] < 20).map((q) => q[1]));   // topuk tarafındaki en üst nokta
  const d = top(lo) - top(hi);
  assert.ok(Math.abs(d - 20) < 2, 'arka yükseklik 20 mm artınca topukta yan saya 20 mm yükselir: ' + d);
  const holes = (r) => byName(r, 'Yan saya').marks.filter((m) => m.kind === 'delik').length;
  assert.equal(holes(A.generate(proj(), { type: 'derby', params: { eyelets: 7 } })), 7);
  assert.equal(holes(A.generate(proj(), { type: 'derby', params: { eyelets: 0 } })), 0);
  for (const m of byName(lo, 'Yan saya').marks.filter((q) => q.kind === 'delik')) assert.ok(G.insidePoly(netPolygon(byName(lo, 'Yan saya')), m.p), 'delik parçanın içinde');
  const c = A.cleanParams('derby', { throat: 999, facing: 75, backH: -5, cap: 'evet' }, 260);
  assert.equal(c.throat, 80); assert.equal(c.backH, 30); assert.ok(c.facing <= c.throat - 8); assert.equal(c.cap, false);
});

t('6. Kalıp boyu ölçeklenince parçalar orantılı büyür; hatalı girişler anlaşılır hata verir', () => {
  const s = A.generate(proj({ L: 240 }), { type: 'derby' }), b = A.generate(proj({ L: 290 }), { type: 'derby' });
  const w = (r) => { const q = box(netPolygon(byName(r, 'Ön saya'))); return q.x1 - q.x0; };
  const ratio = w(b) / w(s);
  assert.ok(Math.abs(ratio - 290 / 240) < 0.06, 'oran ' + ratio);
  const p = M.createProject({ name: 'x' });
  assert.throws(() => A.generate(p, { type: 'derby' }), /yan görünüşü/);
  assert.throws(() => A.generate(proj(), { type: 'terlik' }), /Bilinmeyen/);
  assert.throws(() => A.generate(proj({ L: 60 }), { type: 'derby' }), /beklenmeyen ölçü/);
});

t('7. Kayıt: otomatik ayarlar temizlenir, projeyle birlikte saklanır', () => {
  const a = M.makeAuto({ type: 'spor', flipX: 'evet', params: { backH: 70, 'x y': 3, kötü: '<script>', cap: true }, pieceIds: ['pc1', 5, null] });
  assert.equal(a.type, 'spor'); assert.equal(a.flipX, null); assert.deepEqual(a.params, { backH: 70, cap: true }); assert.deepEqual(a.pieceIds, ['pc1']);
  assert.equal(M.makeAuto({ type: 'terlik' }).type, '');
  const p = proj(); p.modelRef.auto = M.makeAuto({ type: 'derby', params: { backH: 66 } });
  const back = M.migrate(JSON.parse(JSON.stringify(p)));
  assert.equal(back.modelRef.auto.type, 'derby'); assert.equal(back.modelRef.auto.params.backH, 66);
  assert.equal(M.migrate({ kind: M.KIND, name: 'eski', pieces: [] }).modelRef.auto.type, '');
});

let fail = 0;
for (const [name, fn] of tests) {
  try { await fn(); console.log('ok   ' + name); }
  catch (e) { fail++; console.log('FAIL ' + name + '\n     ' + (e.stack || e).toString().split('\n').slice(0, 4).join('\n     ')); }
}
console.log(`\n${tests.length - fail}/${tests.length} geçti`);
process.exit(fail ? 1 : 0);
