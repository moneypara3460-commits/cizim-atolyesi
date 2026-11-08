// Çalıştır: node tests/cad2d.test.mjs
import assert from 'node:assert/strict';
import {
  arcFrom3, intersect, trimEntity, extendEntity, offsetEntity, filletLines, transformEntity, rotateFn, mirrorFn, moveFn,
  snapPoints, closedLoops, toDXF, parseDXF, arcSpan, arcEnds, dist, normA,
} from '../cad2d-geom.js';

let fail = 0;
const t = (name, fn) => {
  try { fn(); console.log('ok   ', name); }
  catch (e) { fail++; console.log('FAIL ', name, '\n     ', e.message.split('\n')[0]); }
};
const near = (p, q, tol = 1e-6) => assert.ok(dist(p, q) < tol, JSON.stringify(p) + ' ≠ ' + JSON.stringify(q));
const L = (a, b) => ({ t: 'line', a, b, layer: '0' });

t('arcFrom3: yön ve merkez', () => {
  const a = arcFrom3([10, 0], [0, 10], [-10, 0]);
  near(a.c, [0, 0]); assert.ok(Math.abs(a.r - 10) < 1e-9);
  assert.ok(Math.abs(arcSpan(a) - Math.PI) < 1e-9);
  const b = arcFrom3([10, 0], [0, -10], [-10, 0]); // alttan: ters yön
  near(arcEnds(b)[0], [-10, 0]); assert.ok(Math.abs(arcSpan(b) - Math.PI) < 1e-9);
  assert.equal(arcFrom3([0, 0], [1, 1], [2, 2]), null);
});
t('intersect: çizgi-çizgi, çizgi-çember, çember-çember, yay sınırı', () => {
  near(intersect(L([0, 0], [10, 10]), L([0, 10], [10, 0]))[0], [5, 5]);
  assert.equal(intersect(L([0, 0], [1, 1]), L([5, 0], [6, 1])).length, 0);
  assert.equal(intersect(L([-20, 0], [20, 0]), { t: 'circle', c: [0, 0], r: 10 }).length, 2);
  assert.equal(intersect({ t: 'circle', c: [0, 0], r: 10 }, { t: 'circle', c: [10, 0], r: 10 }).length, 2);
  const up = { t: 'arc', c: [0, 0], r: 10, a0: 0, a1: Math.PI };
  assert.equal(intersect(L([-20, 0.5], [20, 0.5]), up).length, 2);
  assert.equal(intersect(L([-20, -5], [20, -5]), up).length, 0);
});
t('trimEntity: çizginin ortası kesilir, uçtaki parça silinir', () => {
  const e = L([0, 0], [30, 0]), c1 = L([10, -5], [10, 5]), c2 = L([20, -5], [20, 5]);
  const mid = trimEntity(e, [c1, c2], [15, 0]);
  assert.equal(mid.length, 2); near(mid[0].b, [10, 0]); near(mid[1].a, [20, 0]);
  const end = trimEntity(e, [c1, c2], [25, 0]);
  assert.equal(end.length, 1); near(end[0].a, [0, 0]); near(end[0].b, [20, 0]);
  assert.deepEqual(trimEntity(e, [], [5, 0]), []);
});
t('trimEntity: çember iki kesişimle yaya döner', () => {
  const c = { t: 'circle', c: [0, 0], r: 10 };
  const r = trimEntity(c, [L([-20, 0], [20, 0])], [0, 10]); // üst yarı silinir
  assert.equal(r[0].t, 'arc');
  near(arcEnds(r[0])[0], [-10, 0]); near(arcEnds(r[0])[1], [10, 0]);
  assert.ok(Math.abs(arcSpan(r[0]) - Math.PI) < 1e-9);
});
t('trimEntity: yay ortasından kesilir', () => {
  const a = { t: 'arc', c: [0, 0], r: 10, a0: 0, a1: Math.PI };
  const r = trimEntity(a, [L([0, -20], [0, 20])], [7, 7]);
  assert.equal(r.length, 1); near(arcEnds(r[0])[0], [0, 10]); near(arcEnds(r[0])[1], [-10, 0]);
});
t('extendEntity: çizgi en yakın sınıra uzar; yay uzar', () => {
  const e = L([0, 0], [5, 0]);
  const r = extendEntity(e, [L([10, -5], [10, 5]), L([20, -5], [20, 5])], [5, 0]);
  near(r.b, [10, 0]);
  const r2 = extendEntity(e, [L([-8, -5], [-8, 5])], [0, 0]);
  near(r2.a, [-8, 0]);
  assert.equal(extendEntity(e, [], [5, 0]), null);
  const a = { t: 'arc', c: [0, 0], r: 10, a0: 0, a1: Math.PI / 4 };
  const ra = extendEntity(a, [L([0, 0], [0, 20])], [7, 7]);
  assert.ok(Math.abs(ra.a1 - Math.PI / 2) < 1e-9);
});
t('offsetEntity: tarafa göre', () => {
  near(offsetEntity(L([0, 0], [10, 0]), 3, [5, 1]).a, [0, 3]);
  near(offsetEntity(L([0, 0], [10, 0]), 3, [5, -1]).a, [0, -3]);
  assert.equal(offsetEntity({ t: 'circle', c: [0, 0], r: 5 }, 2, [10, 0]).r, 7);
  assert.equal(offsetEntity({ t: 'circle', c: [0, 0], r: 5 }, 2, [1, 0]).r, 3);
  assert.equal(offsetEntity({ t: 'circle', c: [0, 0], r: 1 }, 2, [0, 0]), null);
});
t('filletLines: dik köşe r=2', () => {
  const r = filletLines(L([0, 0], [10, 0]), L([10, 0], [10, 10]), 2, [3, 0], [10, 6]);
  near(r.l1.b, [8, 0]); near(r.l2.b, [10, 2]); near(r.arc.c, [8, 2]);
  assert.ok(Math.abs(arcSpan(r.arc) - Math.PI / 2) < 1e-9);
  const z = filletLines(L([0, 0], [8, 0]), L([10, 2], [10, 10]), 0, [3, 0], [10, 6]);
  near(z.l1.b, [10, 0]); near(z.l2.b, [10, 0]);
  assert.equal(filletLines(L([0, 0], [10, 0]), L([0, 5], [10, 5]), 1, [1, 0], [1, 5]), null);
});
t('dönüşümler: döndür, ayna (yay yönü korunur)', () => {
  near(transformEntity(L([1, 0], [2, 0]), rotateFn([0, 0], Math.PI / 2)).b, [0, 2]);
  near(transformEntity(L([1, 0], [2, 0]), moveFn(1, 1)).a, [2, 1]);
  const a = { t: 'arc', c: [0, 0], r: 10, a0: 0, a1: Math.PI / 2 };
  const m = transformEntity(a, mirrorFn([0, -1], [0, 1]), 'mirror');
  assert.ok(Math.abs(arcSpan(m) - Math.PI / 2) < 1e-9);
  near(arcEnds(m)[0], [0, 10]); near(arcEnds(m)[1], [-10, 0]);
});
t('snapPoints: uç, orta, merkez, kesişim', () => {
  const s = snapPoints([L([0, 0], [10, 0]), L([5, -5], [5, 5]), { t: 'circle', c: [20, 0], r: 3 }]);
  assert.ok(s.some((q) => q.k === 'int' && dist(q.p, [5, 0]) < 1e-9));
  assert.ok(s.some((q) => q.k === 'mid' && dist(q.p, [5, 0]) < 1e-9));
  assert.ok(s.some((q) => q.k === 'cen' && dist(q.p, [20, 0]) < 1e-9));
});
t('closedLoops: dikdörtgen (karışık yönlü çizgiler) + yuvarlak köşe + daire', () => {
  const ents = [L([0, 0], [20, 0]), L([20, 10], [20, 0]), L([20, 10], [0, 10]), L([0, 0], [0, 10]), { t: 'circle', c: [10, 5], r: 2 }, L([50, 50], [60, 60])];
  const lp = closedLoops(ents);
  assert.equal(lp.length, 2);
  const f = filletLines(L([0, 0], [10, 0]), L([10, 0], [10, 10]), 2, [3, 0], [10, 6]);
  const lp2 = closedLoops([f.l1, f.arc, f.l2, L([10, 10], [0, 0])]);
  assert.equal(lp2.length, 1);
});
t('DXF: yaz ve geri oku', () => {
  const ents = [L([0, 0], [10, 0]), { t: 'circle', c: [5, 5], r: 2, layer: 'Eksen' }, { t: 'arc', c: [0, 0], r: 5, a0: 0, a1: Math.PI / 2, layer: '0' }, { t: 'text', p: [1, 1], h: 3, s: 'Merhaba', layer: '0' }, { t: 'dim', a: [0, 0], b: [10, 0], off: 5, layer: 'Ölçü' }];
  const d = toDXF(ents, [{ name: '0', aci: 7 }, { name: 'Eksen', aci: 1, lt: 'CENTER' }, { name: 'Ölçü', aci: 2 }]);
  const r = parseDXF(d);
  assert.equal(r.layers.length, 3);
  assert.equal(r.ents.filter((e) => e.t === 'circle').length, 1);
  assert.equal(r.ents.find((e) => e.t === 'circle').layer, 'Eksen');
  const arc = r.ents.find((e) => e.t === 'arc');
  assert.ok(Math.abs(arcSpan(arc) - Math.PI / 2) < 1e-6);
  assert.ok(r.ents.some((e) => e.t === 'text' && e.s === 'Merhaba'));
  assert.ok(r.ents.some((e) => e.t === 'text' && e.s === '10'));
});
t('DXF: LWPOLYLINE bulge ile yay', () => {
  const d = ['0', 'SECTION', '2', 'ENTITIES', '0', 'LWPOLYLINE', '8', 'A', '90', '2', '70', '0', '10', '0', '20', '0', '42', '1', '10', '10', '20', '0', '0', 'ENDSEC', '0', 'EOF'].join('\n');
  const r = parseDXF(d);
  assert.equal(r.ents.length, 1);
  assert.equal(r.ents[0].t, 'arc');
  near(r.ents[0].c, [5, 0]); assert.ok(Math.abs(r.ents[0].r - 5) < 1e-9);
  assert.ok(Math.abs(arcSpan(r.ents[0]) - Math.PI) < 1e-9);
});

console.log(fail ? `\n${fail} test BAŞARISIZ` : '\nTüm testler geçti');
process.exit(fail ? 1 : 0);
