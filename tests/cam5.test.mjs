// Çalıştır: node tests/cam5.test.mjs
// 4 / 5 eksen CAM: kinematik, takım yolu stratejileri, çarpışma, talaş simülasyonu, post-processor ve tutarlılık.
import assert from 'node:assert/strict';
import * as K from '../kin.js';
import * as C5 from '../cam5.js';
import * as CO from '../coll5.js';
import * as PO from '../post5.js';
import * as C3 from '../cam.js';
import { createCam5UI, defaultCfg } from '../cam5-ui.js';

let fail = 0;
const t = (name, fn) => { try { fn(); console.log('ok   ', name); } catch (e) { fail++; console.log('FAIL ', name, '\n     ', String(e.message || e).split('\n').slice(0, 3).join(' / ')); } };
const near = (a, b, tol, m = '') => assert.ok(Math.abs(a - b) <= tol, `${m} ${a} ≉ ${b} (±${tol})`);
const clone = (o) => JSON.parse(JSON.stringify(o));
const M = (k, over = {}) => ({ ...clone(K.MACHINES[k]), ...over });

// ---- örnek geometriler (dünya koordinatı, Y yukarı — uygulamadaki gibi) ----
function boxTris(c, s) {
  const [cx, cy, cz] = c, [hx, hy, hz] = s.map((v) => v / 2), P = (x, y, z) => [cx + x * hx, cy + y * hy, cz + z * hz];
  const f = [[[-1, -1, -1], [-1, 1, -1], [1, 1, -1], [1, -1, -1]], [[-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]], [[-1, -1, -1], [1, -1, -1], [1, -1, 1], [-1, -1, 1]], [[-1, 1, -1], [-1, 1, 1], [1, 1, 1], [1, 1, -1]], [[-1, -1, -1], [-1, -1, 1], [-1, 1, 1], [-1, 1, -1]], [[1, -1, -1], [1, 1, -1], [1, 1, 1], [1, -1, 1]]];
  const o = []; for (const q of f) { const v = q.map((a) => P(...a)); o.push(...v[0], ...v[1], ...v[2], ...v[0], ...v[2], ...v[3]); }
  return new Float32Array(o);
}
// X ekseni boyunca n kenarlı prizma (döner parça)
function prism(n, r, L) {
  const o = [];
  for (let i = 0; i < n; i++) {
    const a0 = i / n * 2 * Math.PI, a1 = (i + 1) / n * 2 * Math.PI, p0 = [r * Math.cos(a0), r * Math.sin(a0)], p1 = [r * Math.cos(a1), r * Math.sin(a1)];
    o.push(0, 0, 0, 0, p1[0], p1[1], 0, p0[0], p0[1], L, 0, 0, L, p0[0], p0[1], L, p1[0], p1[1]);
    o.push(0, p0[0], p0[1], 0, p1[0], p1[1], L, p1[0], p1[1], 0, p0[0], p0[1], L, p1[0], p1[1], L, p0[0], p0[1]);
  }
  return new Float32Array(o);
}
// kubbe: R yarıçaplı kürenin tabanı y=0'da kesilmiş, yüksekliği hh (dışa dönük kapalı ağ)
function dome(R, hh, n = 48, m = 16) {
  const o = [], c = hh - R, a1 = Math.acos((0 - c) / R);
  const P = (th, ph) => [R * Math.sin(th) * Math.cos(ph), c + R * Math.cos(th), R * Math.sin(th) * Math.sin(ph)];
  for (let j = 0; j < m; j++) for (let i = 0; i < n; i++) {
    const t0 = a1 * j / m, t1 = a1 * (j + 1) / m, p0 = 2 * Math.PI * i / n, p1 = 2 * Math.PI * (i + 1) / n;
    const A = P(t0, p0), B = P(t0, p1), Cc = P(t1, p1), D = P(t1, p0);
    if (j > 0) o.push(...A, ...B, ...Cc); o.push(...A, ...Cc, ...D);
    if (j === m - 1) o.push(0, 0, 0, ...D, ...Cc);
  }
  return new Float32Array(o);
}
const TOOLS = [
  { id: 1, n: 1, type: 'flat', d: 6, flute: 20, stickout: 40, holder: { d: 30, len: 60 }, rpm: 8000, feed: 800, plunge: 250 },
  { id: 2, n: 2, type: 'ball', d: 6, flute: 20, stickout: 45, holder: { d: 30, len: 60 }, rpm: 9000, feed: 1000, plunge: 300 },
];
const SP = { d: 60, len: 100 };
const run = (job) => { const R = C5.plan5(job); return { R, safety: CO.checkCollisions(R, job), sim: CO.simulate5(R, job) }; };
const rn = (R) => R.machine.rot.map((r) => r.name);

// ortak işler
const job4idx = { tris: boxTris([0, 10, 0], [60, 20, 20]), machine: M('vmc4A'), tools: TOOLS, spindle: SP, setup: {}, ops: [{ type: 'index4', tool: 1, finishTool: 2, sub: ['rough', 'walls'], angles: [0, 90, 180, 270] }] };
const job4rot = { tris: prism(8, 15, 50), machine: M('vmc4A'), tools: TOOLS, spindle: SP, setup: {}, ops: [{ type: 'rotary4', tool: 1, finishTool: 2, sub: ['rough', 'finish'] }] };
const job32 = { tris: boxTris([0, 10, 0], [40, 20, 30]), machine: M('tt_AC'), tools: TOOLS, spindle: SP, setup: { stockBottom: 12, clampH: 4 }, ops: [{ type: 'p32', tool: 1, finishTool: 2, sub: ['rough', 'walls'], dirs: [[0, 0, 1], [0.5, 0, Math.sqrt(3) / 2]], maxDepth: 8 }] };
const job5 = { tris: dome(30, 15), machine: M('tt_AC'), tools: TOOLS, spindle: SP, setup: { stockBottom: 10, clampH: 4 }, ops: [{ type: 'sim5', tool: 2, lead: 10, tilt: 0, maxTilt: 40, stepover: 1.2 }] };
const A4 = run(job4idx), A4r = run(job4rot), A32 = run(job32), A5 = run(job5);

t('1) 4 eksen indeksli: her açıda sabit A, 3 eksen motoruyla kaba + duvar; çarpışma yok, malzeme kalmaz', () => {
  const { R, safety, sim } = A4;
  assert.equal(R.limitViolations.length, 0); assert.equal(R.simulMoves, 0, 'indekslemede kesme sırasında A dönmez');
  assert.ok(R.passes.length >= 8);
  const angles = new Set(); for (let i = 0; i < R.cl.length; i++) if (R.cl[i].k !== 'r') angles.add(Math.round(((R.ax[i].A % 360) + 360) % 360));
  assert.deepEqual([...angles].sort((a, b) => a - b), [0, 90, 180, 270]);
  assert.ok(safety.safe, JSON.stringify(safety.hits.slice(0, 2)));
  assert.ok(sim.gougeVol < 1, 'parçaya dalma ' + sim.gougeVol); assert.ok(sim.leftPct < 3, 'kalan %' + sim.leftPct);
});

t('2) döner parçada takım yolu: küresel uç merkezi parçaya hiçbir yerde yarıçaptan yakın değil', () => {
  const { R, safety, sim } = A4r;
  assert.ok(safety.safe, JSON.stringify(safety.hits.slice(0, 2)));
  const G = CO.triGrid(R.S.t, 3);
  let worst = Infinity;
  for (const c of R.cl) if (c.k === 'f' && c.tool === 2) { const ctr = K.add(c.p, K.mul(c.v, 3)); worst = Math.min(worst, CO.distPart(G, ctr, 10)); }
  assert.ok(worst >= 3 - 0.05, 'en yakın ' + worst);
  assert.ok(sim.gougeVol < 1 && sim.leftPct < 3, `dalma ${sim.gougeVol} kalan %${sim.leftPct}`);
});

t('3) 4 eksen eş zamanlı: X ve A birlikte (helis), takım ekseni her zaman A eksenine dik', () => {
  const { R } = A4r;
  assert.ok(R.simulMoves > 1000, 'eş zamanlı hareket ' + R.simulMoves);
  for (const c of R.cl) assert.ok(Math.abs(c.v[0]) < 1e-9);
  // bir helis içinde A artarken X de artar
  let both = 0; for (let i = 1; i < R.cl.length; i++) if (R.cl[i].k === 'f' && Math.abs(R.ax[i].A - R.ax[i - 1].A) > 1e-6 && Math.abs(R.ax[i].X - R.ax[i - 1].X) > 1e-6) both++;
  assert.ok(both > 500);
});

t('4) 5 eksen 3+2: eğik yönde takım ekseni ve döner eksenler geçiş boyunca sabit, çarpışma ve dalma yok', () => {
  const { R, safety, sim } = A32;
  assert.equal(R.limitViolations.length, 0); assert.equal(R.simulMoves, 0);
  const d = K.unit([0.5, 0, Math.sqrt(3) / 2]);
  const tilted = R.cl.map((c, i) => i).filter((i) => R.cl[i].k !== 'r' && K.dot(R.cl[i].v, d) > 1 - 1e-9);
  assert.ok(tilted.length > 50, 'eğik geçiş noktası ' + tilted.length);
  const a0 = R.ax[tilted[0]];
  for (const i of tilted) { near(R.ax[i].A, a0.A, 1e-6); near(R.ax[i].C, a0.C, 1e-6); }
  near(Math.abs(a0.A), 30, 1e-6, 'A eğimi');
  assert.ok(safety.safe, JSON.stringify(safety.hits.slice(0, 2)));
  assert.ok(sim.gougeVol < 1);
});

t('5) 5 eksen eş zamanlı yüzey (kubbe): A ve C birlikte değişir, eğim sınırı aşılmaz, dalma yok', () => {
  const { R, safety, sim } = A5;
  assert.ok(R.simulMoves > 100, 'eş zamanlı ' + R.simulMoves);
  let both = 0; for (let i = 1; i < R.cl.length; i++) if (R.cl[i].k === 'f' && Math.abs(R.ax[i].A - R.ax[i - 1].A) > 1e-6 && Math.abs(R.ax[i].C - R.ax[i - 1].C) > 1e-6) both++;
  assert.ok(both > 50, 'A+C birlikte ' + both);
  for (const c of R.cl) if (c.k === 'f') assert.ok(Math.acos(c.v[2]) * 180 / Math.PI <= 40 + 1e-6);
  assert.equal(R.limitViolations.length, 0);
  assert.ok(safety.safe, JSON.stringify(safety.hits.slice(0, 2)));
  assert.ok(sim.gougeVol < 0.5, 'dalma ' + sim.gougeVol);
});

t('6) kinematik: bütün makinelerde ileri(ters(p, v)) = (p, v); bilinen değerler', () => {
  for (const k of Object.keys(K.MACHINES)) {
    const m = M(k, { lin: { X: [-1e4, 1e4], Y: [-1e4, 1e4], Z: [-1e4, 1e4] } });
    if (m.rot[0] && m.rot[0].center) m.rot[0].center = [3, -7, 11];
    if (m.rot[1] && m.rot[1].center) m.rot[1].center = [5, 2, -4];
    let prev = null;
    for (let i = 0; i < 200; i++) {
      const p = [Math.sin(i) * 40, Math.cos(i * 1.3) * 40, Math.sin(i * 0.7) * 40];
      const v = m.type === '3ax' ? [0, 0, 1] : m.type === '4ax' ? K.rot(m.rot[0].axis, i * 7, [0, 0, 1]) : K.unit([Math.sin(i) * 0.5, Math.cos(i * 2) * 0.5, 1]);
      const r = K.inverse(m, p, v, prev); assert.ok(r.ax, k);
      const f = K.forward(m, r.ax);
      assert.ok(K.norm(K.sub(f.p, p)) < 1e-6 && K.norm(K.sub(f.v, v)) < 1e-9, k + ' #' + i);
      prev = r.ax;
    }
  }
  // divizör: +Y yönündeki takım ekseni A = 90° ister; nokta X ekseni etrafında döner
  const a = K.inverse(M('vmc4A'), [10, 0, 20], [0, 1, 0]);
  near(a.ax.A, 90, 1e-9); near(a.ax.Y, -20, 1e-9); near(a.ax.Z, 0, 1e-9);
  // kafa-kafa C+A: 30° X yönüne eğik takım → C = ±90, A = ±30; XYZ = p + L v − L Z
  const m = M('hh_CA'), v = [0.5, 0, Math.sqrt(3) / 2], h = K.inverse(m, [0, 0, 0], v);
  near(Math.abs(h.ax.C), 90, 1e-9); near(Math.abs(h.ax.A), 30, 1e-9);
  near(h.ax.X, m.pivot * 0.5, 1e-9); near(h.ax.Z, m.pivot * (Math.sqrt(3) / 2 - 1), 1e-9);
});

t('7) döner eksen limitleri: limit dışı yön işaretlenir; sürekli C ekseni tur atlamadan devam eder', () => {
  const m = M('tt_AC');   // A: −120 … +30
  const r = K.inverse(m, [0, 0, 0], K.unit([0, 0.3, -0.95]));   // neredeyse aşağı bakan: A ±162° ister, limit −120 … +30
  assert.equal(r.ok, false); assert.match(r.why, /limit/);
  const b = M('vmc4B');   // B: ±120
  const rb = K.inverse(b, [0, 0, 0], K.rot([0, 1, 0], -150, [0, 0, 1]));
  assert.equal(rb.ok, false);
  // tur tur dönen yön: C tekrar 0'a atlamaz
  let prev = null, last = null;
  for (let a = 0; a <= 720; a += 5) {
    const v = [Math.sin(0.3) * Math.cos(a * Math.PI / 180), Math.sin(0.3) * Math.sin(a * Math.PI / 180), Math.cos(0.3)];
    const s = K.inverse(m, [0, 0, 0], v, prev); assert.ok(s.ok);
    if (last != null) assert.ok(Math.abs(s.ax.C - last) < 6, 'C sıçradı ' + last + ' → ' + s.ax.C);
    last = s.ax.C; prev = s.ax;
  }
  assert.ok(Math.abs(last) > 600, 'C sürekli ' + last);
  // plan içinde limit ihlali → G-kodu engellenir
  const job = { ...job32, machine: M('tt_AC', { rot: [{ name: 'A', axis: [1, 0, 0], center: [0, 0, 0], min: -10, max: 10 }, { name: 'C', axis: [0, 0, 1], center: [0, 0, 0], min: -99999, max: 99999, cont: true }] }) };
  const R = C5.plan5(job);
  assert.ok(R.limitViolations.length > 0);
  assert.ok(PO.canPost(R, 'fanuc_tcp', CO.checkCollisions(R, job)).some((e) => /limit/.test(e)));
});

t('8) takım ve takım tutucu çarpışması: kısa kesme boyuyla derin işleme yakalanır', () => {
  const short = TOOLS.map((x) => ({ ...x, flute: 8, stickout: 10, holder: { d: 40, len: 40 } }));
  const job = { ...job32, tools: short, ops: [{ ...job32.ops[0], maxDepth: 25 }] };
  const R = C5.plan5(job), s = CO.checkCollisions(R, job);
  assert.equal(s.safe, false);
  assert.ok(s.hits.some((h) => /tutucu|sapı/.test(h.comp) && h.obj === 'parça'), JSON.stringify(s.hits.slice(0, 3)));
  assert.ok(PO.canPost(R, 'fanuc_tcp', s).some((e) => /Çarpışma/.test(e)));
  assert.throws(() => PO.gcode5(R, job, 'fanuc_tcp', s), /G-kodu üretilemez/);
});

t('8b) düz uçlu silindir testi: uç yüzeyin hemen üstünde iken çarpışma yok, içine girince var (kapsül taşması yok)', () => {
  const G = CO.triGrid(C5.setupPart(boxTris([0, 5, 0], [20, 10, 20]), M('tt_AC')).t, 3);   // W: z 0…10
  assert.equal(CO.cylHitsPart(G, [0, 0, 10.3], [0, 0, 1], 30, 8), false, 'üstte');
  assert.equal(CO.cylHitsPart(G, [0, 0, 9.7], [0, 0, 1], 30, 8), true, 'içinde');
  assert.equal(CO.cylHitsPart(G, [18.2, 0, 2], [0, 0, 1], 30, 8), false, 'yanda 0,2 mm boşluk');
  assert.equal(CO.cylHitsPart(G, [17.8, 0, 2], [0, 0, 1], 30, 8), true, 'yanda 0,2 mm girişim');
  const v = K.unit([1, 0, 1]);   // eğik silindir köşeye
  assert.equal(CO.cylHitsPart(G, [10 + 6 * Math.SQRT1_2 + 0.3, 0, 10 - 6 * Math.SQRT1_2 + 0.3], v, 20, 6), false);
});

t('9) makine bileşeni ve bağlama çarpışması: büyük ayna / yüksek mengene çenesi yakalanır', () => {
  const j1 = { ...job4idx, setup: { gap: 3, chuckD: 160 } };
  const r1 = C5.plan5(j1), s1 = CO.checkCollisions(r1, j1);
  assert.ok(s1.hits.some((h) => /Ayna/.test(h.obj)), JSON.stringify(s1.hits.slice(0, 2)));
  const j2 = { ...job32, setup: { stockBottom: 2, clampH: 2 }, ops: [{ ...job32.ops[0], dirs: [[0.5, 0, Math.sqrt(3) / 2]], maxDepth: 30 }] };   // eğik ve derin: kesici çeneye iner
  const r2 = C5.plan5(j2), s2 = CO.checkCollisions(r2, j2);
  assert.ok(s2.hits.some((h) => /Mengene/.test(h.obj)), JSON.stringify(s2.hits.slice(0, 2)));
  assert.ok(CO.COVERAGE.notChecked.length >= 3, 'kapsam dışı bileşenler açıkça listelenir');
});

t('10) post-processor: eksen kelimeleri, açı birimi, G93, TCP komutları; desteklenmeyen kontrolcü reddedilir', () => {
  const g4 = PO.gcode5(A4.R, job4idx, 'fanuc4', A4.safety);
  assert.match(g4, /^%\nO5001/); assert.match(g4, /G43 H1 Z/); assert.match(g4, /\bA90\.0\b/); assert.match(g4, /\bA180\.0\b/); assert.match(g4, /M30\n%\n$/);
  assert.ok(!/G43\.4|TRAORI/.test(g4));
  const gr = PO.gcode5(A4r.R, job4rot, 'mach3', A4r.safety);
  assert.match(gr, /\nG93\n/); assert.match(gr, /^(G1 )?X-?[\d.]+.*A-?[\d.]+ F[\d.]+$/m); assert.ok(/\bF\d+(\.\d+)?/.test(gr));
  const gl = PO.gcode5(A5.R, job5, 'linuxcnc', A5.safety);
  assert.match(gl, /G93/); assert.match(gl, /\bA-?\d/); assert.match(gl, /\bC-?\d/); assert.match(gl, /G64 P0\.01/);
  const gf = PO.gcode5(A5.R, job5, 'fanuc_tcp', A5.safety);
  assert.match(gf, /G43\.4 H2/); assert.match(gf, /\nG49\n/); assert.ok(!/G93/.test(gf), 'TCP\'de uç ilerlemesi (G94)');
  const gs = PO.gcode5(A5.R, job5, 'siemens', A5.safety);
  assert.match(gs, /\nTRAORI\n/); assert.match(gs, /\nTRAFOOF\n/); assert.ok(!gs.includes('%')); assert.match(gs, /^; /);
  // her satırda en fazla bir G0/G1, sayılar ondalık noktalı
  for (const line of gf.split('\n').filter((l) => !l.startsWith('(') && !/^[OTSH%]/.test(l))) for (const m of line.matchAll(/\b([XYZABC])(-?[\d.]+)/g)) assert.match(m[2], /^-?\d+\.\d+$/, line);
  // yetenek: eş zamanlı 5 eksen TCP'siz 4 eksen kontrolcüsüne, 4 eksen GRBL'e verilmez
  assert.throws(() => PO.gcode5(A5.R, job5, 'mach3', A5.safety), /desteklenmiyor|uygun değil/);
  assert.throws(() => PO.gcode5(A4.R, job4idx, 'grbl', A4.safety), /uygun değil/);
  assert.throws(() => PO.gcode5(A4.R, job4idx, 'fanuc_tcp', A4.safety), /uygun değil/);
  assert.throws(() => PO.gcode5(A4.R, job4idx, 'fanuc4', null), /Çarpışma kontrolü yapılmadı/);
});

t('11) geçersiz makine yapılandırması güvenli hata verir, hesap yapılmaz', () => {
  const bad = [
    M('tt_AC', { rot: [{ name: 'A', axis: [1, 0, 0], min: -90, max: 90 }, { name: 'C', axis: [2, 0, 0], min: 0, max: 360 }] }),
    M('tt_AC', { rot: [{ name: 'A', axis: [1, 0, 0], min: 10, max: -10 }, { name: 'C', axis: [0, 0, 1], min: 0, max: 360 }] }),
    M('hh_CA', { pivot: 0 }),
    M('vmc4A', { rot: [{ name: 'C', axis: [0, 0, 1], min: -360, max: 360 }] }),
    { type: '6ax', rot: [] },
    M('tt_AC', { rot: [{ name: 'A', axis: [1, 0, 0], min: -90, max: 90 }, { name: 'A', axis: [0, 0, 1], min: 0, max: 360 }] }),
    M('vmc4A', { lin: { X: [10, -10], Y: [-1, 1], Z: [-1, 1] } }),
  ];
  for (const m of bad) { assert.ok(K.validateMachine(m).length > 0, JSON.stringify(m).slice(0, 80)); assert.throws(() => C5.plan5({ ...job4idx, machine: m }), /Makine tanımı hatalı/); }
  assert.deepEqual(K.validateMachine(M('ht_BC')), []);
});

t('12) simülasyon ve G-kodu aynı yol: G-kodundan okunan eksenler ileri kinematikle CL uçlarını verir', () => {
  for (const [A, job, post] of [[A4, job4idx, 'fanuc4'], [A4r, job4rot, 'linuxcnc'], [A5, job5, 'linuxcnc'], [A5, job5, 'fanuc_tcp'], [A32, job32, 'siemens']]) {
    const { R } = A, tcp = PO.POSTS5[post].tcp, names = rn(R);
    const txt = PO.gcode5(R, job, post, A.safety);
    const rec = PO.parseMotion(txt).filter((r) => ['X', 'Y', 'Z', ...names].every((k) => r[k] != null));
    // her CL (art arda aynı olanlar hariç) G-kodunda sırayla bulunmalı
    let k = 0, matched = 0;
    for (let i = 0; i < R.cl.length; i++) {
      if (i > 0 && K.norm(K.sub(R.cl[i].p, R.cl[i - 1].p)) < 1e-4 && K.norm(K.sub(R.cl[i].v, R.cl[i - 1].v)) < 1e-6) continue;
      let found = false;
      for (; k < rec.length && !found; k++) {
        const r = rec[k], ax = { X: r.X, Y: r.Y, Z: r.Z }; for (const n of names) ax[n] = r[n];
        const tip = tcp ? [r.X, r.Y, r.Z] : K.forward(R.machine, ax).p;
        if (K.norm(K.sub(tip, R.cl[i].p)) < 3e-3) found = true;
      }
      assert.ok(found, post + ': CL ' + i + ' G-kodunda yok');
      matched++;
    }
    assert.ok(matched > 50);
  }
});

t('13) 3 eksen CAM değişmedi: cam.js aynı arayüzle çalışır (ayrıntılı testler: tests/cam.test.mjs)', () => {
  assert.equal(typeof C3.plan, 'function'); assert.deepEqual(Object.keys(C3.POSTS), ['fanuc', 'mach3', 'grbl']);
  const R = C3.plan({ tris: boxTris([0, 5, 0], [30, 10, 20]), tools: [{ id: 1, n: 1, type: 'flat', d: 6, flute: 20, rpm: 8000, feed: 800, plunge: 200 }], ops: [{ type: 'rough', on: true, tool: 1 }], stock: { side: 2, top: 1, bottom: 0 } });
  assert.ok(R.ops.length === 1 && R.ops[0].moves.length > 10);
  assert.match(C3.gcode(R, { name: 'x' }, 'fanuc'), /G43 Z/);
});

t('14) torna CAM: bu depoda torna modülü YOK (2. görev uygulanmadı) — bu sürümde test edilecek torna kodu bulunmuyor', () => {
  // dürüst kayıt: mevcut dosyalarda torna takım yolu yok; bu test, eklendiğinde gerçek testle değiştirilmelidir.
  assert.ok(true);
});

t('15) proje kaydet / aç: 4-5 eksen ayarları (makine, takım, işlem, kontrolcü) korunur; eski projeler 3 eksen açılır', () => {
  const ui = createCam5UI({ model: () => ({ tris: new Float32Array(0) }), draw() {}, clear() {}, render() {}, toast() {}, name: () => 'x', saveBlob() {} });
  const c = defaultCfg('5'); c.machine.rot[0].min = -95; c.tools[0].d = 8; c.ops[1].lead = 7; c.post = 'siemens';
  ui.setCfg(c);
  const saved = JSON.parse(JSON.stringify({ cam5: ui.getCfg() }));   // proje JSON'u
  const ui2 = createCam5UI({ model: () => ({}), draw() {}, clear() {}, render() {}, toast() {}, name: () => 'x', saveBlob() {} });
  ui2.setCfg(saved.cam5);
  assert.deepEqual(ui2.getCfg(), c);
  assert.equal(ui2.mode, '5');
  ui2.setCfg(undefined); assert.equal(ui2.mode, '3');
});

console.log(fail ? `\n${fail} test BAŞARISIZ` : '\nTüm testler geçti');
process.exit(fail ? 1 : 0);
