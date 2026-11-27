// Çalıştır: node tests/ayk-numara-kesim.test.mjs — Ayakkabı numara serisi (grading) ve kesim yerleşimi (nesting)
import assert from 'node:assert/strict';
import * as A from '../ayk/auto.js';
import * as M from '../ayk/model.js';
import * as G from '../ayk/geom.js';
import * as GR from '../ayk/grade.js';
import * as N from '../ayk/nest.js';
import { cutLine, netPolygon } from '../ayk/build.js';
import { lastView } from './fixtures/kalip-siluet.mjs';

const tests = [];
const t = (name, fn) => tests.push([name, fn]);
const proj = (type = 'derby') => { const p = M.createProject({ name: 'n', size: '40' }); p.last.views.yan = lastView(); const r = A.generate(p, { type }); p.pieces.push(...r.pieces); p.matches.push(...r.matches); return p; };
const box = (pts) => { let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity; for (const [x, y] of pts) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); } return { w: x1 - x0, h: y1 - y0 }; };

t('numara listesi ve katsayılar: EU 6,67 mm boy / 5 mm çevre, UK 8,47 / 6,35', () => {
  assert.deepEqual(GR.sizeList(38, 42), [38, 39, 40, 41, 42]); assert.deepEqual(GR.sizeList(40, 41, 0.5), [40, 40.5, 41]);
  const p = proj(), L = p.last.views.yan.length;
  const f = GR.factors(p, 41); assert.ok(Math.abs(f.sx - (1 + (20 / 3) / L)) < 1e-12 && Math.abs(f.sy - (1 + 5 / (0.9 * L))) < 1e-12);
  const u = GR.factors(p, 42, { system: 'UK' }); assert.ok(Math.abs(u.sx - (1 + 2 * 25.4 / 3 / L)) < 1e-12);
  assert.equal(GR.factors(p, 40).sx, 1);
  assert.throws(() => GR.factors({ ...p, size: 'büyük' }, 41), /sayı/);
});
t('parça büyür: net boy numara başına ≈ boy oranında, paylar mm olarak aynı, kenar kimlikleri ve işaretler korunur', () => {
  const p = proj(), L = p.last.views.yan.length, base = p.pieces.find((q) => q.name === 'Yan saya');
  const g44 = GR.gradeProject(p, 44).pieces.find((q) => q.name === 'Yan saya'), g36 = GR.gradeProject(p, 36).pieces.find((q) => q.name === 'Yan saya');
  const b0 = box(netPolygon(base)), b4 = box(netPolygon(g44)), bm = box(netPolygon(g36));
  assert.ok(Math.abs(b4.w / b0.w - (1 + 4 * (20 / 3) / L)) < 0.002, 'boy oranı ' + b4.w / b0.w);
  assert.ok(Math.abs(b4.h / b0.h - (1 + 4 * 5 / (0.9 * L))) < 0.002, 'yükseklik oranı');
  assert.ok(bm.w < b0.w && b4.w > b0.w);
  // pay: kesim çizgisi ile net çizgi arasındaki fark numaradan bağımsız (≈ aynı mm)
  const pay = (pc) => box(cutLine(pc).pts).w - box(netPolygon(pc)).w;
  assert.ok(Math.abs(pay(g44) - pay(base)) < 0.6, 'pay ' + pay(g44) + ' / ' + pay(base));
  assert.deepEqual(G.edges(g44.outline).map((e) => e.id), G.edges(base.outline).map((e) => e.id));
  assert.deepEqual(Object.keys(g44.edges).sort(), Object.keys(base.edges).sort());
  const holes = (pc) => pc.marks.filter((m) => m.kind === 'delik');
  assert.equal(holes(g44).length, holes(base).length); assert.equal(holes(g44)[0].d, holes(base)[0].d, 'delik çapı aynı');
  const cb = base.marks.find((m) => m.kind === 'centik'), cg = g44.marks.find((m) => m.kind === 'centik');
  const eL = (pc, id) => G.edgeLength(G.edges(pc.outline).find((e) => e.id === id));
  assert.ok(Math.abs(cg.at / eL(g44, cg.edge) - cb.at / eL(base, cb.edge)) < 0.01, 'çentik kenarda aynı oranda');
  assert.equal(g44.size, 44); assert.equal(base.size, undefined, 'taban parça değişmedi');
});
t('yerleşim: çakışma yok, plakada, kusurlardan uzak; çift parçanın yarısı ayna; yönlü modda yalnız 0 / 180°', () => {
  const p = proj();
  const graded = [38, 40, 42].map((s) => GR.gradeProject(p, s));
  const { list } = N.instances(graded, 1);
  const want = graded.reduce((s, g) => s + g.pieces.reduce((a, pc) => a + pc.qty, 0), 0);
  assert.equal(list.length, want);
  const half = list.filter((i) => !i.open);
  assert.equal(half.filter((i) => i.mirror).length, half.filter((i) => !i.mirror).length, 'çift: yarım olmayan parçaların yarısı ayna');
  assert.ok(list.some((i) => i.open) && list.filter((i) => i.open).every((i) => !i.mirror), 'orta çizgili parça açılır, aynası olmaz');
  const sheet = { w: 1400, h: 700, defects: [{ x: 300, y: 300, r: 40 }, { x: 900, y: 120, r: 25 }] };
  const t0 = Date.now(), L = N.nest(list, sheet, { res: 2, gap: 2 }), ms = Date.now() - t0;
  assert.equal(L.unplaced.length, 0, 'hepsi yerleşti');
  assert.deepEqual(N.verify(L), []);
  assert.ok(L.placed.every((q) => q.rot === 0 || q.rot === 2));
  assert.ok(L.util > 0.3 && L.util <= 1, 'kullanım ' + L.util);
  assert.ok(ms < 20000, 'süre ' + ms);
  const dxf = N.nestDXF(L);
  assert.ok(dxf.includes('KESIM') && dxf.includes('KUSUR') && !/[^\x00-\x7f]/.test(dxf));
  assert.equal((dxf.match(/\r\nPOLYLINE\r\n/g) || []).length, L.placed.length + 1);
  assert.ok(N.nestSVG(L).startsWith('<svg'));
});
t('yarım parça orta çizgiden açılır: alan iki katı, kesim çizgisi simetrik; eğri orta çizgi uyarılır', () => {
  const p = proj(), vamp = p.pieces.find((q) => q.name === 'Ön saya'), uf = N.unfoldPiece(vamp);
  const a = (P) => Math.abs(G.signedArea(P));
  // kirişe göre aynalama: eğri orta çizginin kirişi aştığı şerit iki yarıda üst üste biner → alan 2 katından biraz az
  const ratio = a(netPolygon(uf.pc)) / a(netPolygon(vamp)); assert.ok(ratio > 1.7 && ratio <= 2.01, 'alan oranı ' + ratio);
  // düz orta çizgili yarım parça (dikdörtgen) tam iki katına açılır
  const sq = M.makePiece({ name: 'kare', outline: G.makePath([[0, 0], [40, 0], [40, 20], [0, 20]].map((q, i) => ({ p: q, brk: true })), true) });
  M.setEdgeProp(sq, sq.outline.nodes[0].id, { kind: 'yok' });
  assert.ok(Math.abs(a(netPolygon(N.unfoldPiece(sq).pc)) - 1600) < 1, 'dikdörtgen açılımı');
  assert.ok(cutLine(uf.pc).pts.length > 20);
  assert.equal(N.unfoldPiece(p.pieces.find((q) => q.name === 'Yan saya')), null, 'orta çizgisi olmayan parça açılmaz');
  const { warn } = N.instances([GR.gradeProject(p, 40)], 1);
  assert.ok(warn.some((w) => /Ön saya: orta çizgi eğri/.test(w)));
});
t('plaka küçükse sığmayanlar listelenir, sığanlar yine çakışmasız', () => {
  const p = proj(), { list } = N.instances([GR.gradeProject(p, 40)], 3);
  const L = N.nest(list, { w: 500, h: 300, defects: [] }, { res: 2, gap: 2 });
  assert.ok(L.unplaced.length > 0 && L.placed.length > 0);
  assert.deepEqual(N.verify(L), []);
  const F = N.nest(list, { w: 500, h: 300, defects: [] }, { res: 2, gap: 2, free: true });
  assert.ok(F.placed.length >= L.placed.length, 'serbest dönüş en az o kadar yerleştirir');
});

let fail = 0;
for (const [name, fn] of tests) {
  try { await fn(); console.log('ok   ', name); } catch (e) { fail++; console.log('FAIL ', name, '\n     ', String(e.message).split('\n')[0].slice(0, 400)); }
}
console.log(fail ? `\n${fail} test BAŞARISIZ` : '\nTüm testler geçti');
process.exit(fail ? 1 : 0);
