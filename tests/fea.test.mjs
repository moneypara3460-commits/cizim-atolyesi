// Çalıştır: node tests/fea.test.mjs — sonlu eleman çözücüsünün analitik çözümlerle doğrulanması
import assert from 'node:assert/strict';
import { voxelize, buildFE, solveStatic, solveModal, elementK, matProps, selectNodes, resolveBC, criticalRegions, fatigue, lifeYears, wear, thicken, lighten, gridMass, materialSwap, resonance, tempFactors, surfaceQuads, rle, unrle, percentile } from '../fea.js';
import { matById } from '../logic.js';

let fail = 0;
const tests = [];
const t = (name, fn) => tests.push([name, fn]);
const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol * Math.abs(b), `${msg}: ${a} ≠ ${b} (±%${tol * 100})`);
function boxTris(min, max) {
  const [x0, y0, z0] = min, [x1, y1, z1] = max;
  const v = [[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0], [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]];
  const f = [[0, 2, 1], [0, 3, 2], [4, 5, 6], [4, 6, 7], [0, 1, 5], [0, 5, 4], [3, 7, 6], [3, 6, 2], [0, 4, 7], [0, 7, 3], [1, 2, 6], [1, 6, 5]];
  return Float32Array.from(f.flatMap((q) => q.flatMap((i) => v[i])));
}
function cylTris(r, h, n = 64) {   // Y ekseni boyunca
  const tr = [];
  for (let i = 0; i < n; i++) { const a0 = i / n * 2 * Math.PI, a1 = (i + 1) / n * 2 * Math.PI, P = (a, y) => [r * Math.cos(a), y, r * Math.sin(a)];
    tr.push(...P(a0, 0), ...P(a1, 0), ...P(a1, h), ...P(a0, 0), ...P(a1, h), ...P(a0, h), 0, 0, 0, ...P(a1, 0), ...P(a0, 0), 0, h, 0, ...P(a0, h), ...P(a1, h)); }
  return Float32Array.from(tr);
}
const steel = matProps(matById('celik')), alu = matProps(matById('al6061'));
const tipUy = (fe, r, x) => { let s = 0, c = 0; for (let n = 0; n < fe.nn; n++) if (Math.abs(fe.xyz[n * 3] - x) < 1e-6) { s += r.u[n * 3 + 1]; c++; } return s / c; };

t('eleman rijitliği simetrik, rijit cisim hareketinde kuvvet yok', () => {
  const K = elementK(0.3).K;
  for (let i = 0; i < 24; i++) for (let j = 0; j < 24; j++) assert.ok(Math.abs(K[i * 24 + j] - K[j * 24 + i]) < 1e-12);
  for (let d = 0; d < 3; d++) for (let i = 0; i < 24; i++) { let s = 0; for (let a = 0; a < 8; a++) s += K[i * 24 + a * 3 + d]; assert.ok(Math.abs(s) < 1e-12); }
});
t('voxel: silindir hacmi ve parça doğruluğu', () => {
  const g = voxelize([{ id: 1, tris: cylTris(20, 50), mat: 0 }], { h: 1.25 });
  near(g.parts[0].vVox, Math.PI * 400 * 50, 0.02, 'hacim'); assert.equal(g.parts[0].poor, false);
  const g2 = voxelize([{ id: 1, tris: boxTris([0, 0, 0], [500, 500, 500]), mat: 0 }, { id: 2, tris: boxTris([0, 500, 0], [500, 501, 500]), mat: 0 }], { h: 10 });
  assert.equal(g2.parts[1].poor, true);   // 1 mm sac 10 mm ağda temsil edilemez → işaretlenir
});
t('konsol kiriş (uç yükü): sehim FL³/3EI ve gerilme M·c/I ile %3 içinde, denge', () => {
  const L = 200, b = 20, h = 20, F = 1000, I = b * h ** 3 / 12;
  const g = voxelize([{ id: 1, tris: boxTris([0, 0, 0], [L, h, b]), mat: 0 }], { h: 2.5 }), fe = buildFE(g);
  const r = solveStatic(fe, [steel], { supports: [{ face: '-x' }], loads: [{ sel: { face: '+x' }, F, dir: [0, -1, 0] }] });
  assert.ok(r.converged);
  near(-tipUy(fe, r, L), F * L ** 3 / (3 * steel.E * I), 0.03, 'uç sehim');
  let vmid = 0; for (let e = 0; e < fe.ne; e++) { const x = fe.xyz[fe.elN[e * 8] * 3] + 1.25; if (Math.abs(x - L / 2) < 1.5) vmid = Math.max(vmid, r.vm[e]); }
  near(vmid, F * (L / 2) * (h / 2 - 1.25) / I, 0.03, 'orta kesit gerilme');
  near(r.reaction[1], F, 1e-3, 'mesnet tepkisi');
});
t('eksenel çubuk σ = F/A, δ = FL/EA', () => {
  const g = voxelize([{ id: 1, tris: boxTris([0, 0, 0], [100, 10, 10]), mat: 0 }], { h: 2.5 }), fe = buildFE(g);
  const r = solveStatic(fe, [steel], { supports: [{ face: '-x' }], loads: [{ sel: { face: '+x' }, F: 10000, dir: [1, 0, 0] }] });
  let s = 0, c = 0; for (let n = 0; n < fe.nn; n++) if (fe.xyz[n * 3] > 99.99) { s += r.u[n * 3]; c++; }
  near(s / c, 10000 * 100 / (steel.E * 100), 0.02, 'uzama');
  let vm = 0, cn = 0; for (let e = 0; e < fe.ne; e++) { const x = fe.xyz[fe.elN[e * 8] * 3]; if (x > 40 && x < 60) { vm += r.vm[e]; cn++; } }
  near(vm / cn, 100, 0.01, 'gerilme');
});
t('öz ağırlık: qL⁴/8EI ve ağırlık = ρgV', () => {
  const L = 1000, b = 50, h = 50, I = b * h ** 3 / 12, q = 7.85e-6 * 9.81 * b * h;
  const g = voxelize([{ id: 1, tris: boxTris([0, 0, 0], [L, h, b]), mat: 0 }], { h: 12.5 }), fe = buildFE(g);
  const r = solveStatic(fe, [steel], { supports: [{ face: '-x' }], loads: [], gravity: true });
  near(-tipUy(fe, r, L), q * L ** 4 / (8 * steel.E * I), 0.02, 'sehim'); near(r.weightN, q * L, 1e-6, 'ağırlık'); near(r.reaction[1], q * L, 1e-3, 'tepki');
});
t('ısıl: serbest uzama αLΔT (gerilmesiz), iki uçtan tutulunca ≈ EαΔT', () => {
  const g = voxelize([{ id: 1, tris: boxTris([0, 0, 0], [100, 10, 10]), mat: 0 }], { h: 2.5 }), fe = buildFE(g);
  const r = solveStatic(fe, [steel], { supports: [{ face: '-x' }], loads: [], dT: 100 });
  let s = 0, c = 0; for (let n = 0; n < fe.nn; n++) if (fe.xyz[n * 3] > 99.99) { s += r.u[n * 3]; c++; }
  near(s / c, 12e-6 * 100 * 100, 0.02, 'uzama'); assert.ok(percentile(r.vm, 0.5) < 1);
  const r2 = solveStatic(fe, [steel], { supports: [{ face: '-x' }, { face: '+x' }], loads: [], dT: 100 });
  let vm = 0, cn = 0; for (let e = 0; e < fe.ne; e++) { const x = fe.xyz[fe.elN[e * 8] * 3]; if (x > 40 && x < 60) { vm += r2.vm[e]; cn++; } }
  near(vm / cn, steel.E * 12e-6 * 100, 0.05, 'kısıtlı gerilme');
});
t('modal: konsol kiriş 1. doğal frekans (1,875²/2π)·√(EI/ρAL⁴)', () => {
  const L = 200, b = 20, h = 20, I = b * h ** 3 / 12;
  const g = voxelize([{ id: 1, tris: boxTris([0, 0, 0], [L, h, b]), mat: 0 }], { h: 5 }), fe = buildFE(g);
  const r = solveModal(fe, [steel], { supports: [{ face: '-x' }] });
  const f1 = 1.875 ** 2 / (2 * Math.PI) * Math.sqrt(steel.E * I / (7.85e-9 * b * h * L ** 4));
  assert.ok(r.converged); near(r.modes[0].f, f1, 0.03, 'f1'); near(r.modes[1].f, f1, 0.03, 'f1 diğer eksen (kare kesit)');
  const rs = resonance(r.modes[0].f, r.modes[0].f * 1.02); assert.equal(rs.level, 'crit'); assert.ok(rs.daf > 10);
  assert.equal(resonance(400, 100).level, 'ok');
});
t('mesnetsiz ya da havada kalan parça → sonuç uydurulmaz', () => {
  const g = voxelize([{ id: 1, tris: boxTris([0, 0, 0], [50, 10, 10]), mat: 0 }, { id: 2, tris: boxTris([100, 0, 0], [150, 10, 10]), mat: 0 }], { h: 2.5 }), fe = buildFE(g);
  assert.equal(solveStatic(fe, [steel], { supports: [], loads: [] }).error, 'nofix');
  const r = solveStatic(fe, [steel], { supports: [{ face: '-x' }], loads: [] });
  assert.equal(r.error, 'floating');
});
t('nokta seçimi ve yüz seçimi', () => {
  const g = voxelize([{ id: 1, tris: boxTris([0, 0, 0], [100, 20, 20]), mat: 0 }], { h: 5 }), fe = buildFE(g);
  assert.equal(selectNodes(fe, { face: '+y' }).length, 21 * 5);
  const ns = selectNodes(fe, { p: [50, 20, 10], r: 6 });
  assert.ok(ns.length >= 5 && ns.every((n) => fe.surf[n]));
});
t('kritik bölge: konsolun ankastre ucunda, mesnede yakın işaretli', () => {
  const g = voxelize([{ id: 1, tris: boxTris([0, 0, 0], [200, 20, 20]), mat: 0 }], { h: 5 }), fe = buildFE(g);
  const r = solveStatic(fe, [steel], { supports: [{ face: '-x' }], loads: [{ sel: { face: '+x' }, F: 2000, dir: [0, -1, 0] }] });
  const R = criticalRegions(fe, g, [steel], r.vm, { bcNodes: r.supN });
  assert.ok(R.length >= 1); assert.ok(R[0].at[0] < 20, String(R[0].at)); assert.ok(R[0].nearBC);
});
t('yorulma: çelik yorulma sınırı altı sonsuz, üstü sonlu; Goodman; alüminyumda sınır yok', () => {
  const a = fatigue(steel, 100, { R: -1 }); assert.equal(a.N, Infinity); near(a.Se, 0.5 * 360 * 4.51 * 360 ** -0.265 * 0.85, 1e-6, 'Se');
  const b = fatigue(steel, 250, { R: -1 }); assert.ok(b.N > 1e3 && b.N < 1e6, String(b.N));
  const c = fatigue(steel, 250, { R: 0 }); assert.ok(c.N > b.N);   // aynı maksimumda R=0 daha az hasar
  const d = fatigue(alu, 80, { R: -1 }); assert.ok(isFinite(d.N) && d.N > 1e6);
  assert.ok(fatigue(steel, 400, { R: -1 }).low);
  const y = lifeYears(1e6, 1000); near(y.y, 1e6 / 365000, 1e-9, 'yıl'); assert.ok(y.lo < y.y && y.hi > y.y);
  assert.equal(lifeYears(1e6, 0), null);
});
t('aşınma (Archard) aralığı; eksik bilgide sonuç yok', () => {
  const w = wear(steel, 100, 10, 1000, 100, 'kuru'); assert.ok(w.lo < w.hi); near(w.hi, 1e-4 * 100 * 10 * 1000 * 365 / 1180 / 100, 1e-9, 'üst');
  assert.equal(wear(steel, 100, 0, 1000, 100), null);
});
t('sıcaklık azaltma: çelik EN 1993-1-2, veri olmayan malzemede null', () => {
  assert.equal(tempFactors('celik', 300).ky, 1); near(tempFactors('celik', 550).ky, 0.625, 1e-9, 'ky'); near(tempFactors('celik', 250).kE, 0.85, 1e-9, 'kE');
  assert.equal(tempFactors('pla', 40), null); assert.equal(tempFactors('celik', 900), null);
});
t('alternatifler: güçlendir gerilmeyi düşürür, hafiflet kütleyi azaltır; malzeme değişimi süperpozisyonu yeniden çözümle aynı', () => {
  const g = voxelize([{ id: 1, tris: boxTris([0, 0, 0], [200, 40, 20]), mat: 0 }], { h: 5 }), fe = buildFE(g);
  const bc = { supports: [{ face: '-x' }], loads: [{ sel: { face: '+x' }, F: 2000, dir: [0, -1, 0] }] };
  const r = solveStatic(fe, [steel], bc), p99 = percentile(r.vm, 0.99);
  const T = thicken(g, fe, r.vm, [steel], { lock: ['-x', '+x'] }); assert.ok(T.added > 0);
  const bcR = resolveBC(fe, bc), feT = buildFE(T.grid), rT = solveStatic(feT, [steel], bcR);
  assert.ok(Math.abs(rT.reaction[1] - 2000) < 1); assert.ok(percentile(rT.vm, 0.99) < p99 && rT.maxU < r.maxU);
  const Lb = lighten(g, fe, r.vm, [steel], r.supN, r.loadN, { frac: 0.3 }); assert.ok(Lb.broken);   // fazla çıkarınca uç kopar → algılanır
  const Lg = lighten(g, fe, r.vm, [steel], r.supN, r.loadN, { frac: 0.1 }); assert.ok(Lg.removed > 0 && !Lg.broken);
  assert.ok(gridMass(Lg.grid, [steel]) < gridMass(g, [steel]));
  const feL = buildFE(Lg.grid), rL = solveStatic(feL, [steel], bcR); assert.ok(!rL.error && rL.converged);
  // süperpozisyon: çelik (yük + öz ağırlık) → alüminyum
  const rF = solveStatic(fe, [steel], { ...bc, gravity: false }), rG = solveStatic(fe, [steel], { supports: bc.supports, loads: [], gravity: true });
  const sw = materialSwap(rF, rG, steel, alu);
  const rA = solveStatic(fe, [{ ...alu, nu: steel.nu }], { ...bc, gravity: true });
  near(sw.vmax, Math.max(...rA.vm), 1e-3, 'σmax'); near(sw.umax, rA.maxU, 1e-3, 'umax');
});
t('yüzey dörtgenleri ve RLE kaydı', () => {
  const g = voxelize([{ id: 1, tris: boxTris([0, 0, 0], [20, 10, 10]), mat: 0 }], { h: 5 }), fe = buildFE(g);
  const { quads } = surfaceQuads(fe, g); assert.equal(quads.length / 4, 2 * (4 * 2 + 4 * 2 + 2 * 2));
  assert.deepEqual(Array.from(unrle(rle(g.mat), g.mat.length)), Array.from(g.mat));
});

t('multigrid ön koşullayıcı: Jacobi ile aynı sonuç, çok daha az adım', () => {
  const its = [{ id: 1, tris: boxTris([0, 0, 0], [10, 120, 60]), mat: 0 }, { id: 2, tris: boxTris([10, 100, 10], [200, 120, 50]), mat: 0 }];
  const g = voxelize(its, { target: 8000 }), fe = buildFE(g), bc = { supports: [{ face: '-x' }], loads: [{ sel: { p: [200, 120, 30], r: 7.5 }, F: 490, dir: [0, -1, 0] }], gravity: true };
  const a = solveStatic(fe, [steel], bc, { mg: false }), b = solveStatic(fe, [steel], bc);
  assert.ok(b.converged && !b.fallback); near(b.maxU, a.maxU, 1e-4, 'umax'); assert.ok(b.iters * 8 < a.iters, a.iters + ' / ' + b.iters);
});
t('ağ hizalama: L-braket iki farklı ağda aynı sehim (%2)', () => {
  const its = [{ id: 1, tris: boxTris([0, 0, 0], [10, 120, 60]), mat: 0 }, { id: 2, tris: boxTris([10, 100, 10], [200, 120, 50]), mat: 0 }];
  const bc = { supports: [{ face: '-x' }], loads: [{ sel: { p: [200, 120, 30], r: 7.5 }, F: 490, dir: [0, -1, 0] }] };
  const u = [6000, 20000].map((target) => { const g = voxelize(its, { target }); assert.ok(g.parts.every((p) => Math.abs(p.err) < 0.05)); return solveStatic(buildFE(g), [steel], bc).maxU; });
  near(u[0], u[1], 0.02, 'sehim');
});

t('farklı malzemeler: çelik+alüminyum çubuk; seri yay rijitliği ve ısıtılınca bimetal gerilmesi', () => {
  const its = [{ id: 1, tris: boxTris([0, 0, 0], [100, 10, 10]), mat: 0 }, { id: 2, tris: boxTris([100, 0, 0], [200, 10, 10]), mat: 1 }];
  const g = voxelize(its, { h: 2.5 }), fe = buildFE(g);
  const r = solveStatic(fe, [steel, alu], { supports: [{ face: '-x' }], loads: [{ sel: { face: '+x' }, F: 10000, dir: [1, 0, 0] }] });
  let s = 0, c = 0; for (let n = 0; n < fe.nn; n++) if (fe.xyz[n * 3] > 199.99) { s += r.u[n * 3]; c++; }
  near(s / c, 10000 * 100 / 100 * (1 / steel.E + 1 / alu.E), 0.03, 'uzama');
  const b = voxelize([{ id: 1, tris: boxTris([0, 0, 0], [200, 5, 20]), mat: 0 }, { id: 2, tris: boxTris([0, 5, 0], [200, 10, 20]), mat: 1 }], { h: 1.25 }), fb = buildFE(b);
  const rt = solveStatic(fb, [steel, alu], { supports: [{ p: [0, 5, 10], r: 3 }], loads: [], dT: 50 });
  assert.ok(!rt.error); let up = 0; for (let n = 0; n < fb.nn; n++) if (fb.xyz[n * 3] > 199.9) up += rt.u[n * 3 + 1];
  assert.ok(up < 0, 'alüminyum üstte → uzun kenar üstte, şerit aşağı bükülür'); assert.ok(percentile(rt.vm, 0.5) > 5);
});

for (const [name, fn] of tests) {
  try { await fn(); console.log('ok   ', name); }
  catch (e) { fail++; console.log('FAIL ', name, '\n     ', e.message.split('\n')[0].slice(0, 600)); }
}
console.log(fail ? `\n${fail} test BAŞARISIZ` : '\nTüm testler geçti');
process.exit(fail ? 1 : 0);
