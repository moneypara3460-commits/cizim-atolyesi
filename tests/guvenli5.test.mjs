// Çalıştır: node tests/guvenli5.test.mjs
// 4 / 5 eksen Güvenli Kesim: risk haritası (sarı satırlar), kuru çalıştırma (takım ekseni boyunca geri çekme; kinematik ve
// çarpışma yeniden; talaş simülasyonunda hiç malzeme kaldırılmaması), ilk geçiş / riskli satır yavaşlatma, satır izi.
import assert from 'node:assert/strict';
import * as K from '../kin.js';
import * as C5 from '../cam5.js';
import * as CO from '../coll5.js';
import * as PO from '../post5.js';
import * as G5 from '../guvenli5.js';
import { runGcode } from '../cam5-run.js';

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
const keep = (A, job) => ({ R: A.R, job, safety: A.safety, risk: G5.risk5(A.R, A.safety, job) });
const Lg = { gcode5: PO.gcode5, dryShift5: G5.dryShift5 };

t('Risk haritası: güvenli yolda kırmızı yok; her takım değişiminin ilk yaklaşması sarı; çarpışma kaydı kırmızıya geçer', () => {
  for (const [A, job] of [[A4, job4idx], [A32, job32], [A5, job5], [A4r, job4rot]]) {
    const rk = G5.risk5(A.R, A.safety, job);
    assert.equal(rk.count.red, 0);
    const tc = A.R.cl.map((c, i) => i).filter((i) => A.R.cl[i].tc);
    assert.ok(tc.length >= 1); for (const i of tc) assert.ok(rk.points[i].lvl >= 1 && /boy ofsetini/.test(rk.points[i].why));
  }
  const fake = { hits: [{ i: 5, comp: 'takım tutucu', obj: 'parça', k: 'f' }] }, rk = G5.risk5(A32.R, fake, job32);
  assert.equal(rk.points[5].lvl, 2); assert.ok(/takım tutucu ↔ parça çarpışıyor/.test(rk.points[5].why));
});
t('Risk haritası: eksen sınırına yakınlık ve tek harekette büyük döner eksen değişimi sarı', () => {
  const { R } = A32;
  let zMax = -Infinity; for (const a of R.ax) if (a) zMax = Math.max(zMax, a.Z);
  const R2 = { ...R, machine: { ...R.machine, lin: { ...K.DEFAULT_LIN, Z: [K.DEFAULT_LIN.Z[0], zMax + 1] } } };
  const rk = G5.risk5(R2, { hits: [] }, job32);
  assert.ok(rk.points.some((p) => p.lvl === 1 && /Z ekseni sınırına 2 mm/.test(p.why)));
  // A ekseninde ilerlemeli harekette 40° sıçrama
  const i = R.cl.findIndex((c, k) => k > 0 && c.k === 'f' && R.cl[k - 1].k === 'f');
  const ax = R.ax.map((a) => (a ? { ...a } : a)); ax[i] = { ...ax[i], A: ax[i - 1].A - 40 };
  const rk2 = G5.risk5({ ...R, ax }, { hits: [] }, job32);
  assert.ok(rk2.points[i].lvl === 1 && rk2.points[i].slow && /40\.0° dönüyor/.test(rk2.points[i].why), rk2.points[i].why);
});
t('Kuru çalıştırma: her nokta kendi takım ekseni boyunca d kadar geri; kesen uçlar hamdan en az (r + pay) uzakta; talaş simülasyonu hiç malzeme kaldırmaz; çarpışma yok', () => {
  for (const [A, job] of [[A4, job4idx], [A32, job32], [A5, job5], [A4r, job4rot]]) {
    const D = G5.dryShift5(A.R, job, 10);
    assert.ok(D.ok, D.why); assert.ok(D.d >= 10);
    A.R.cl.forEach((c, i) => { const q = D.R.cl[i]; near(K.norm(K.sub(q.p, K.add(c.p, K.mul(c.v, D.d)))), 0, 1e-9); assert.deepEqual(q.v, c.v); });
    const sim = CO.simulate5(D.R, job);
    assert.ok(sim.removedVol < 1e-6, 'havada kaldırılan hacim ' + sim.removedVol);
    assert.ok(D.safety.safe, JSON.stringify(D.safety.hits.slice(0, 2)));
    // kinematik yeniden çözüldü: ileri kinematik kaydırılmış ucu verir
    for (let i = 0; i < D.R.cl.length; i += 37) near(K.norm(K.sub(K.forward(A.R.machine, D.R.ax[i]).p, D.R.cl[i].p)), 0, 1e-6);
  }
});
t('Kuru çalıştırma G-kodu: başlıkta pay, soğutma yok, uçlar kaydırılmış yolla aynı (TCP); eksen sınırı aşılırsa program verilmez', () => {
  const k = keep(A5, job5), r = runGcode(k, { post: 'fanuc_tcp', opt: { dryRun: { clear: 10 } } }, Lg);
  assert.ok(/KURU CALISTIRMA/.test(r.text) && /GERI CEKILDI/.test(r.text) && !/\nM8\n/.test(r.text) && r.dry.d >= 10);
  const D = G5.dryShift5(A5.R, job5, 10), rec = PO.parseMotion(r.text).filter((q) => q.X != null && q.Y != null && q.Z != null);
  let hit = 0; for (const c of D.R.cl.filter((_, i) => i % 50 === 0)) if (rec.some((q) => Math.hypot(q.X - c.p[0], q.Y - c.p[1], q.Z - c.p[2]) < 2e-3)) hit++;
  assert.ok(hit >= Math.floor(D.R.cl.length / 50) - 1, 'eşleşen ' + hit);
  // Z stroğu kısa makine: kaydırılmış yol sınırı aşar
  let zMax = -Infinity; for (const a of A5.R.ax) if (a) zMax = Math.max(zMax, a.Z);
  const Rs = { ...A5.R, machine: { ...A5.R.machine, lin: { ...K.DEFAULT_LIN, Z: [K.DEFAULT_LIN.Z[0], zMax + 3] } } };
  const D2 = G5.dryShift5(Rs, job5, 10); assert.ok(!D2.ok && /eksen sınırını aşıyor/.test(D2.why), D2.why);
  assert.throws(() => runGcode({ ...k, R: Rs }, { post: 'fanuc_tcp', opt: { dryRun: { clear: 10 } } }, Lg), /Kuru çalıştırma programı verilemez/);
});
t('İlk geçiş ve riskli satır yavaşlatma; satır izi her satır için; risk düzeyi satırlara taşınır', () => {
  const k = keep(A32, job32);
  const a = runGcode(k, { post: 'linuxcnc', opt: {} }, Lg), b = runGcode(k, { post: 'linuxcnc', opt: { valuable: true, firstPass: 0.5 } }, Lg);
  assert.equal(a.trace.length, a.text.trimEnd().split('\n').length); assert.equal(a.lv.length, a.trace.length);
  assert.ok(a.lv.some((v) => v === 1), 'sarı satır (takım değişimi)');
  assert.ok(/DEGERLI PARCA MODU/.test(b.text));
  const F = (txt) => [...txt.matchAll(/ F([\d.]+)/g)].map((m) => +m[1]);
  const fa = F(a.text), fb = F(b.text);
  assert.ok(fb.some((v) => fa.some((w) => Math.abs(v - w / 2) < 0.6)), 'yarı ilerleme var');
  // ilk geçiş dışı ilerleme aynı kalır: son kesme satırlarının F değeri iki programda aynı
  const lastF = (txt) => { const l = txt.split('\n').filter((x) => /^G1 |^X|^Y|^Z/.test(x) && / F/.test(x)); return +/ F([\d.]+)/.exec(l[l.length - 1])[1]; };
  near(lastF(a.text), lastF(b.text), 1e-9);
});

console.log(fail ? `\n${fail} test BAŞARISIZ` : '\nTüm testler geçti');
process.exit(fail ? 1 : 0);
