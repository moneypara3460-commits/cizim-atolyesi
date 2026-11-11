// Çalıştır: node tests/fea2.test.mjs
// Gelişmiş analizlerin analitik referans problemleriyle doğrulanması. Her toleransın gerekçesi testin yanında yazılıdır.
// Ölçülen hatalar sonda tablo olarak yazdırılır (rapor ve arayüzdeki doğrulama tablosu bu değerlerdir).
import assert from 'node:assert/strict';
import * as F from '../fea.js';
import * as X from '../fea2.js';
import * as C3 from '../cam.js';

let fail = 0;
const tests = [], table = [];
const t = (name, fn) => tests.push([name, fn]);
const rel = (a, b) => Math.abs(a - b) / Math.abs(b);
const within = (a, b, tol, what) => { const e = rel(a, b); table.push([what, a, b, e]); assert.ok(e <= tol, `${what}: ${a} ≠ ${b} (hata %${(e * 100).toFixed(3)}, sınır %${tol * 100})`); return e; };
function boxTris(min, max) { const [x0, y0, z0] = min, [x1, y1, z1] = max; const v = [[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0], [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]]; const f = [[0, 2, 1], [0, 3, 2], [4, 5, 6], [4, 6, 7], [0, 1, 5], [0, 5, 4], [3, 7, 6], [3, 6, 2], [0, 4, 7], [0, 7, 3], [1, 2, 6], [1, 6, 5]]; return Float32Array.from(f.flatMap((q) => q.flatMap((i) => v[i]))); }
const LIB = X.libraryMaterials(), steel = X.solverMat(LIB.find((m) => m.id === 'celik'));
const mesh = (min, max, h, items) => { const g = F.voxelize(items || [{ id: 1, name: 'parça', tris: boxTris(min, max), mat: 0 }], { h }); const fe = F.buildFE(g); return { g, fe, quads: F.surfaceQuads(fe, g) }; };
const avgAt = (fe, arr, ax, val, comp) => { let s = 0, c = 0; for (let n = 0; n < fe.nn; n++) if (Math.abs(fe.xyz[n * 3 + ax] - val) < 1e-6) { s += comp == null ? arr[n] : arr[n * 3 + comp]; c++; } return s / c; };
const E = 210000;

t('1) çekme çubuğu: σ = F/A, δ = FL/EA (yük basınç olarak)', () => {
  const { fe, quads } = mesh([0, 0, 0], [100, 10, 10], 2.5);
  const r = X.solveStatic2(fe, quads, [steel], { supports: [{ face: '-x' }], loads: [{ type: 'pressure', sel: { face: '+x' }, p: -100 }] });   // −100 MPa = 10 kN çekme
  const sx = []; for (let e = 0; e < fe.ne; e++) { const x = fe.xyz[fe.elN[e * 8] * 3]; if (x > 45 && x < 55) sx.push(r.sig[e * 6]); }
  // gerilme: düzgün alan, doğrusal eleman tam verir → %0,1
  within(sx.reduce((a, b) => a + b) / sx.length, 100, 0.001, 'Çekme çubuğu σ = F/A');
  // uzama: ankastre uçta yanal (Poisson) daralma tutulur, uç biraz rijit → %1,5
  within(avgAt(fe, r.u, 0, 100, 0), 10000 * 100 / (E * 100), 0.015, 'Çekme çubuğu δ = FL/EA');
  assert.ok(r.equilibriumErr < 1e-5, 'denge');
});

t('2) ankastre kiriş: uç yükünde FL³/3EI ve M·c/I; uç momentinde ML²/2EI', () => {
  const L = 200, b = 20, h = 20, I = b * h ** 3 / 12, Fz = 1000;
  const { fe, quads } = mesh([0, 0, 0], [L, h, b], 2.5);
  const r = X.solveStatic2(fe, quads, [steel], { supports: [{ face: '-x' }], loads: [{ type: 'force', sel: { face: '+x' }, F: Fz, dir: [0, -1, 0] }] });
  // Euler–Bernoulli kayma şekil değişimini ihmal eder (L/h = 10'da ~%1); ağ hatası < %1 → %3
  within(-avgAt(fe, r.u, 0, L, 1), Fz * L ** 3 / (3 * E * I), 0.03, 'Ankastre kiriş uç sehimi FL³/3EI');
  const sm = []; for (let e = 0; e < fe.ne; e++) { const x = fe.xyz[fe.elN[e * 8] * 3], y = fe.xyz[fe.elN[e * 8] * 3 + 1]; if (x >= 97.5 && x < 100 && y > h - 2.6) sm.push(r.sig[e * 6]); }
  // eleman merkezi gerilmesi yüzeyden h/2 içeride: c = h/2 − 1,25
  within(sm.reduce((a, b) => a + b) / sm.length, Fz * (L - 98.75) * (h / 2 - 1.25) / I, 0.03, 'Ankastre kiriş eğilme gerilmesi M·c/I');
  const M = 1e6, rm = X.solveStatic2(fe, quads, [steel], { supports: [{ face: '-x' }], loads: [{ type: 'moment', sel: { face: '+x' }, M: [0, 0, -M] }] });
  within(-avgAt(fe, rm.u, 0, L, 1), M * L * L / (2 * E * I), 0.015, 'Uç momenti sehimi ML²/2EI');
  assert.ok(rm.equilibriumErr < 1e-5);
});

t('3) modal: ankastre kiriş 1. ve 2. doğal frekans (Euler–Bernoulli)', () => {
  const L = 200, b = 10, h = 10, A = b * h, I = b * h ** 3 / 12, rho = steel.rho * 1e-9;
  const { fe } = mesh([0, 0, 0], [L, h, b], 2);
  const r = F.solveModal(fe, [steel], { supports: [{ face: '-x' }] }, { modes: 3 });
  assert.ok(r.converged);
  const f1 = 1.8751 ** 2 / (2 * Math.PI) * Math.sqrt(E * I / (rho * A * L ** 4));
  // kare kesit: iki eğilme yönü aynı frekans; toplanmış kütle + kayma etkisi → %3
  within(r.modes[0].f, f1, 0.03, 'Modal 1. frekans (1,875²)');
  within(r.modes[1].f, f1, 0.03, 'Modal 1. frekans, diğer yön');
  const r2 = F.solveModal(fe, [steel], { supports: [{ face: '-x' }] }, { modes: 5, vectors: 8 });
  const f2 = 4.6941 ** 2 / (2 * Math.PI) * Math.sqrt(E * I / (rho * A * L ** 4));
  const fb = r2.modes.map((m) => m.f).find((f) => f > f1 * 3);
  // 2. eğilme modunda kayma ve dönme ataleti etkisi büyür (L/h = 20) → %6
  within(fb, f2, 0.06, 'Modal 2. eğilme frekansı (4,694²)');
});

t('4) kararlı ısı iletimi: doğrusal profil, iç ısı üretimi, taşınım; enerji dengesi', () => {
  const { fe, quads } = mesh([0, 0, 0], [100, 10, 10], 2.5);
  const a = X.solveThermal(fe, quads, [steel], { fixed: [{ sel: { face: '-x' }, T: 100 }, { sel: { face: '+x' }, T: 0 }] });
  // 1B iletimde doğrusal eleman düğümlerde tamdır → 1e-6
  within(avgAt(fe, a.T, 0, 50), 50, 1e-6, 'Isı iletimi: orta sıcaklık (doğrusal)');
  within(a.heat.fixedIn, steel.kmm * 100 * 100 / 100, 1e-6, 'Isı iletimi: q = kAΔT/L');
  const b = X.solveThermal(fe, quads, [steel], { fixed: [{ sel: { face: '-x' }, T: 0 }, { sel: { face: '+x' }, T: 0 }], Q: 1e-3 });
  within(b.tmax, 1e-3 * 100 * 100 / (8 * steel.kmm), 1e-6, 'İç ısı üretimi: Tmax = QL²/8k');
  const hc = 50e-6, c = X.solveThermal(fe, quads, [steel], { fixed: [{ sel: { face: '-x' }, T: 100 }], conv: [{ sel: { face: '+x' }, h: hc, Tinf: 0 }] });
  within(avgAt(fe, c.T, 0, 100), 100 / (1 + hc * 100 / steel.kmm), 1e-6, 'Taşınım ucu sıcaklığı (seri direnç)');
  for (const r of [a, b, c]) assert.ok(r.heat.balanceErr < 1e-6, 'enerji dengesi ' + r.heat.balanceErr);
});

t('4b) zamana bağlı ısı: levha soğuması (Fourier serisi), zaman adımı yakınsaması', () => {
  const { fe, quads } = mesh([0, 0, 0], [20, 2, 2], 1);
  const al = steel.kmm / (steel.rho * 1e-6 * steel.cp), tau = 400 / al, tEnd = 0.2 * tau;
  const run = (div) => {
    const dt = 0.02 * tau / div, r = X.solveThermal(fe, quads, [steel], { fixed: [{ sel: { face: '-x' }, T: 0 }, { sel: { face: '+x' }, T: 0 }], transient: { T0: 100, dt, steps: Math.round(tEnd / dt), save: 1e9 } });
    const fr = r.frames[r.frames.length - 1]; let ex = 0;
    for (let k = 1; k < 80; k += 2) ex += 400 / (k * Math.PI) * Math.sin(k * Math.PI / 2) * Math.exp(-k * k * Math.PI * Math.PI * al * fr.t / 400);
    return { T: avgAt(fe, fr.T, 0, 10), ex };
  };
  const a = run(8), b = run(32);
  // geri Euler 1. mertebe: Δt dörtte bire inince hata belirgin azalmalı; ince adımda %1,5
  assert.ok(rel(b.T, b.ex) < rel(a.T, a.ex) * 0.5, 'zaman adımı yakınsaması');
  within(b.T, b.ex, 0.015, 'Zamana bağlı: levha orta sıcaklığı');
});

t('5) doğrusal burkulma: ankastre-serbest kolon P = π²EI/4L²', () => {
  const L = 200, b = 10, I = b ** 4 / 12, P = 1000;
  const { fe, quads } = mesh([0, 0, 0], [b, L, b], 2.5);
  const setup = { supports: [{ face: '-y' }], loads: [{ type: 'force', sel: { face: '+y' }, F: P, dir: [0, -1, 0] }] };
  const r = X.solveStatic2(fe, quads, [steel], setup), bk = X.solveBuckling(fe, [steel], setup, r, { modes: 3 });
  assert.ok(bk.converged, bk.text);
  // narin kolon (L/b = 20): Euler teorisi geçerli; ağ hatası küçük → %2
  within(bk.modes[0].lambda * P, Math.PI ** 2 * E * I / (4 * L * L), 0.02, 'Burkulma: Euler kritik yükü');
  assert.ok(rel(bk.modes[1].lambda, bk.modes[0].lambda) < 1e-3, 'kare kesit: iki yön eşit');
  // çekmede burkulma yok
  const rt = X.solveStatic2(fe, quads, [steel], { ...setup, loads: [{ type: 'force', sel: { face: '+y' }, F: P, dir: [0, 1, 0] }] });
  const bt = X.solveBuckling(fe, [steel], { ...setup }, rt, { modes: 1 });
  assert.ok(bt.error === 'nobuck' || (bt.modes && bt.modes[0].lambda > 1e6), 'çekme');
});

t('6) birimler: SI-mm, SI-m, ABD; gidiş-dönüş', () => {
  assert.ok(rel(X.toDisp('us', 'S', 1), 145.0377) < 1e-6);
  assert.ok(rel(X.toDisp('us', 'L', 25.4), 1) < 1e-12);
  assert.ok(rel(X.toDisp('us', 'F', 4.4482216152605), 1) < 1e-12);
  assert.ok(rel(X.toDisp('m', 'S', 1), 1e6) < 1e-12);
  assert.ok(rel(X.toDisp('m', 'M', 1000), 1) < 1e-12);
  assert.ok(Math.abs(X.toDisp('us', 'T', 100) - 212) < 1e-9 && Math.abs(X.toDisp('m', 'T', 0) - 273.15) < 1e-9);
  assert.ok(rel(X.toDisp('mm', 'k', steel.kmm), 53.3) < 1e-12);
  assert.ok(rel(X.toDisp('us', 'k', 1e-3), 0.577789317) < 1e-9);
  for (const sys of Object.keys(X.UNIT_SYSTEMS)) for (const q of ['L', 'F', 'S', 'M', 'T', 'q', 'h', 'k', 'rho']) assert.ok(Math.abs(X.fromDisp(sys, q, X.toDisp(sys, q, 12.34)) - 12.34) < 1e-9, sys + q);
  // aynı fiziksel problem farklı birim girişiyle aynı sonucu verir
  const { fe, quads } = mesh([0, 0, 0], [100, 10, 10], 5);
  const pSI = X.fromDisp('m', 'P', -1e8), pUS = X.fromDisp('us', 'P', -14503.77377);
  const a = X.solveStatic2(fe, quads, [steel], { supports: [{ face: '-x' }], loads: [{ type: 'pressure', sel: { face: '+x' }, p: pSI }] });
  const b = X.solveStatic2(fe, quads, [steel], { supports: [{ face: '-x' }], loads: [{ type: 'pressure', sel: { face: '+x' }, p: pUS }] });
  assert.ok(rel(a.maxU, b.maxU) < 1e-6);
});

t('7) eksik malzeme özelliği ve eksik sınır koşulu: çözüm durdurulur, sebep yazılır', () => {
  const cust = X.customMaterial('u1', 'Özel', { E: 70, nu: 0.33, sy: '', rho: 2.7 });
  assert.deepEqual(X.missingProps(cust, X.REQUIRED.thermal), ['k']);
  assert.deepEqual(X.missingProps(cust, X.REQUIRED.fos), ['sy']);
  assert.ok(X.validateMaterial(X.customMaterial('u2', 'x', { E: 70, nu: 0.5 })).length > 0, 'ν = 0,5 reddedilir');
  const { fe, quads } = mesh([0, 0, 0], [50, 10, 10], 2.5);
  assert.equal(X.solveThermal(fe, quads, [X.solverMat(cust)], { fixed: [{ sel: { face: '-x' }, T: 1 }] }).error, 'mat');
  assert.equal(X.solveStatic2(fe, quads, [steel], { supports: [], loads: [{ type: 'force', sel: { face: '+x' }, F: 1, dir: [1, 0, 0] }] }).error, 'nofix');
  assert.equal(X.solveStatic2(fe, quads, [steel], { supports: [{ face: '-x' }], loads: [] }).error, 'noload');
  assert.equal(X.solveThermal(fe, quads, [steel], { flux: [{ sel: { face: '+x' }, q: 1e-3 }] }).error, 'nobc');
  const r = X.solveStatic2(fe, quads, [X.solverMat(cust)], { supports: [{ face: '-x' }], loads: [{ type: 'force', sel: { face: '+x' }, F: 1, dir: [1, 0, 0] }] });
  const s = X.stressSummary(fe, r, [X.solverMat(cust)]);
  assert.equal(s.fos, null); assert.ok(s.warn.some((w) => /Akma dayanımı eksik/.test(w.t)));
  // havada kalan ikinci parça
  const two = mesh(null, null, 2.5, [{ id: 1, name: 'a', tris: boxTris([0, 0, 0], [20, 10, 10]), mat: 0 }, { id: 2, name: 'b', tris: boxTris([40, 0, 0], [60, 10, 10]), mat: 0 }]);
  assert.equal(X.solveStatic2(two.fe, two.quads, [steel], { supports: [{ face: '-x' }], loads: [{ type: 'force', sel: { face: '+x' }, F: 1, dir: [1, 0, 0] }] }).error, 'floating');
});

t('8) geçersiz geometri ve ağ hataları', () => {
  assert.throws(() => F.voxelize([{ id: 1, tris: new Float32Array(9), mat: 0 }], { h: 1 }), /hacimli katı yok/);
  const g = F.voxelize([{ id: 1, name: 'büyük', tris: boxTris([0, 0, 0], [500, 500, 500]), mat: 0 }, { id: 2, name: 'sac', tris: boxTris([0, 500, 0], [500, 501, 500]), mat: 0 }], { h: 10 });
  const mi = X.meshInfo(g, F.buildFE(g));
  assert.ok(mi.warn.some((w) => w.sev === 'crit' && /sac/.test(w.t)), 'temsil edilemeyen ince parça');
  const thin = mesh([0, 0, 0], [100, 2.5, 20], 2.5);
  assert.ok(X.meshInfo(thin.g, thin.fe).warn.some((w) => /bir eleman kalınlığında/.test(w.t)));
  const { fe, quads } = mesh([0, 0, 0], [50, 10, 10], 2.5);
  assert.throws(() => X.solveStatic2(fe, quads, [steel], { supports: [{ face: '-x' }], loads: [{ type: 'pressure', sel: { p: [25, 5, 5], r: 1 }, p: 1 }] }), /yüzeyi bulunamadı/);
});

t('9) ağ inceltme ve yakınsama: kiriş sehimi ve burkulma yükü yakınsar; tekil gerilme işaretlenir', () => {
  const L = 200, b = 20, h = 20, I = b * h ** 3 / 12, ex = 1000 * L ** 3 / (3 * E * I);
  const run = (hh) => { const { fe, quads } = mesh([0, 0, 0], [L, h, b], hh); const r = X.solveStatic2(fe, quads, [steel], { supports: [{ face: '-x' }], loads: [{ type: 'force', sel: { face: '+x' }, F: 1000, dir: [0, -1, 0] }] }); return { value: -avgAt(fe, r.u, 0, L, 1), ne: fe.ne }; };
  const cv = X.convergence(run, [10, 5, 2.5], 0.02);
  table.push(...cv.rows.map((r) => ['Yakınsama: kiriş sehimi, h = ' + r.target + ' mm (' + r.ne + ' eleman)', r.value, ex, rel(r.value, ex)]));
  assert.ok(cv.converged, 'son değişim %' + (cv.rows[2].change * 100).toFixed(2));
  // hata ağ inceldikçe azalır (teorik değere yaklaşır)
  assert.ok(rel(cv.rows[2].value, ex) <= rel(cv.rows[0].value, ex) + 1e-9);
  // tekil: tek noktaya 10 kN (gerçekte sonsuz gerilme; ağ inceldikçe büyür)
  const { fe, quads } = mesh([0, 0, 0], [100, 10, 10], 2.5);
  const r = X.solveStatic2(fe, quads, [steel], { supports: [{ face: '-x' }], loads: [{ type: 'force', sel: { p: [100, 5, 5], r: 0.1 }, F: 10000, dir: [1, 0, 0] }] });
  const s = X.stressSummary(fe, r, [steel]);
  assert.ok(s.warn.some((w) => /tekil/.test(w.t)), 'nokta yükünde tekil gerilme uyarısı');
});

t('10) analiz kurulumu ve sonuç özeti proje JSON\'unda kaydedilip açılır', () => {
  const setup = { type: 'static', units: 'us', supports: [{ face: '-x' }], loads: [{ type: 'pressure', sel: { face: '+x' }, p: -1 }], density: 'orta', mats: { 1: 'celik' } };
  const key = X.inputKey('geo1', [{ id: 'celik' }], setup, { h: 2.5 });
  const rec = { setup, results: [{ type: 'static', key, at: 1, maxU: 0.1, vmax: 99, units: 'mm, N, MPa', method: X.ANALYSES.static.method }] };
  const back = JSON.parse(JSON.stringify({ fem: rec }));
  assert.deepEqual(back.fem, rec);
  assert.equal(X.inputKey('geo1', [{ id: 'celik' }], back.fem.setup, { h: 2.5 }), back.fem.results[0].key, 'açınca hâlâ geçerli');
});

t('11) geometri, malzeme, yük ya da ağ değişince eski sonuç geçersizleşir', () => {
  const setup = { supports: [{ face: '-x' }], loads: [{ type: 'force', sel: { face: '+x' }, F: 100, dir: [0, -1, 0] }] };
  const k0 = X.inputKey('g', ['celik'], setup, { h: 2.5 });
  assert.notEqual(X.inputKey('g2', ['celik'], setup, { h: 2.5 }), k0);
  assert.notEqual(X.inputKey('g', ['al6061'], setup, { h: 2.5 }), k0);
  assert.notEqual(X.inputKey('g', ['celik'], { ...setup, loads: [{ ...setup.loads[0], F: 101 }] }, { h: 2.5 }), k0);
  assert.notEqual(X.inputKey('g', ['celik'], setup, { h: 2 }), k0);
  assert.equal(X.inputKey('g', ['celik'], JSON.parse(JSON.stringify(setup)), { h: 2.5 }), k0);
});

t('12) mevcut CAD/CAM çekirdekleri etkilenmedi: fea.js eski çağrı biçimi, cam.js', () => {
  const { fe } = mesh([0, 0, 0], [100, 10, 10], 2.5);
  const r = F.solveStatic(fe, [steel], { supports: [{ face: '-x' }], loads: [{ sel: { face: '+x' }, F: 10000, dir: [1, 0, 0] }] });
  assert.ok(r.converged && rel(avgAt(fe, r.u, 0, 100, 0), 10000 * 100 / (E * 100)) < 0.015);
  const R = C3.plan({ tris: boxTris([0, 0, 0], [30, 10, 20]), tools: [{ id: 1, n: 1, type: 'flat', d: 6, flute: 20, rpm: 8000, feed: 800, plunge: 200 }], ops: [{ type: 'rough', on: true, tool: 1 }], stock: { side: 2, top: 1, bottom: 0 } });
  assert.ok(R.ops[0].moves.length > 10);
});

t('analiz kayıtları: desteklenmeyenler açıkça işaretli', () => {
  assert.equal(X.ANALYSES.nonlinear.supported, false); assert.equal(X.ANALYSES.contact.supported, false);
  for (const k of ['static', 'modal', 'thermal', 'thermalT', 'buckling']) { const a = X.ANALYSES[k]; assert.ok(a.supported && a.physics && a.method && a.outputs); }
});

for (const [name, fn] of tests) {
  try { fn(); console.log('ok   ', name); }
  catch (e) { fail++; console.log('FAIL ', name, '\n     ', String(e.message).split('\n')[0].slice(0, 400)); }
}
console.log('\nReferans karşılaştırmaları (sayısal / analitik / bağıl hata):');
for (const [w, a, b, e] of table) console.log('  ' + w.padEnd(58) + ' ' + (+a).toPrecision(6).padStart(12) + ' ' + (+b).toPrecision(6).padStart(12) + '  %' + (e * 100).toFixed(3));
console.log(fail ? `\n${fail} test BAŞARISIZ` : '\nTüm testler geçti');
process.exit(fail ? 1 : 0);
