// Çalıştır: node tests/assembly.test.mjs
import assert from 'node:assert/strict';
import { analyzeAssembly, recognize, boltForHole, stdBoltLen, explodeOffsets, animState } from '../assembly.js';
import { partPose } from '../mfgcheck.js';
import { matById } from '../logic.js';

let fail = 0;
const tests = [];
const t = (name, fn) => tests.push([name, fn]);
function boxTris(min, max) {
  const [x0, y0, z0] = min, [x1, y1, z1] = max;
  const v = [[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0], [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]];
  const f = [[0, 2, 1], [0, 3, 2], [4, 5, 6], [4, 6, 7], [0, 1, 5], [0, 5, 4], [3, 7, 6], [3, 6, 2], [0, 4, 7], [0, 7, 3], [1, 2, 6], [1, 6, 5]];
  return f.flatMap((q) => q.flatMap((i) => v[i]));
}
const cat = (...a) => Float32Array.from(a.flat());
// kare delikli plaka: delik merkezleri (x, z), kenar s
function plateWithHoles(x0, x1, y0, y1, z0, z1, holes, s) {
  // x şeritleri ve delik araları: basit ızgara ayrıştırma
  const xs = [x0, x1, ...holes.flatMap(([x]) => [x - s / 2, x + s / 2])].sort((a, b) => a - b), zs = [z0, z1, ...holes.flatMap(([, z]) => [z - s / 2, z + s / 2])].sort((a, b) => a - b);
  const out = [];
  for (let i = 0; i + 1 < xs.length; i++) for (let j = 0; j + 1 < zs.length; j++) {
    const cx = (xs[i] + xs[i + 1]) / 2, cz = (zs[j] + zs[j + 1]) / 2;
    if (xs[i + 1] - xs[i] < 1e-9 || zs[j + 1] - zs[j] < 1e-9) continue;
    if (holes.some(([hx, hz]) => Math.abs(cx - hx) < s / 2 && Math.abs(cz - hz) < s / 2)) continue;
    out.push(boxTris([xs[i], y0, zs[j]], [xs[i + 1], y1, zs[j + 1]]));
  }
  return cat(...out);
}
function cylTris(p, n = 32) {
  const { R, T } = partPose(p), r = p.d / 2, h = p.h, tr = [];
  const W = (v) => [0, 1, 2].map((k) => R[k][0] * v[0] + R[k][1] * v[1] + R[k][2] * v[2] + T[k]);
  for (let i = 0; i < n; i++) {
    const a0 = i / n * 2 * Math.PI, a1 = (i + 1) / n * 2 * Math.PI, P = (a, y) => W([r * Math.cos(a), y, r * Math.sin(a)]);
    tr.push(...P(a0, 0), ...P(a1, 0), ...P(a1, h), ...P(a0, 0), ...P(a1, h), ...P(a0, h), ...W([0, 0, 0]), ...P(a1, 0), ...P(a0, 0), ...W([0, h, 0]), ...P(a0, h), ...P(a1, h));
  }
  return Float32Array.from(tr);
}
let pid = 1;
const part = (name, type, tris, extra = {}) => ({ id: pid++, name, type, op: extra.op || 'add', tris: tris instanceof Float32Array ? tris : Float32Array.from(tris), p: extra.p || {}, material: { id: 'celik', kind: 'metal' } });
const hole = (name, x, z, y0, h, d = 9) => { const p = { type: 'cylinder', d, h, x, y: y0, z, rx: 0, ry: 0, rz: 0 }; return part(name, 'cylinder', cylTris(p), { op: 'sub', p }); };

t('tanıma: rulman, rondela, cıvata, mil, flanş, isim', () => {
  assert.equal(recognize({ type: 'tube', p: { d: 47, di: 20, h: 14 } }).detail.startsWith('6204'), true);
  assert.equal(recognize({ type: 'tube', p: { d: 16, di: 8.4, h: 1.6 } }).kind, 'Rondela');
  const b = recognize({ type: 'cylinder', p: { d: 8, h: 40 } });
  assert.equal(b.kind, 'Cıvata'); assert.equal(b.conf, 'şekil'); assert.equal(b.m, 8);
  assert.equal(recognize({ type: 'cylinder', p: { d: 25, h: 300 } }).kind, 'Mil');
  assert.equal(recognize({ type: 'cylinder', p: { d: 120, h: 15 } }).kind, 'Flanş / disk');
  const nm = recognize({ name: '4. Ana mil', type: 'box', p: {} });
  assert.equal(nm.kind, 'Mil'); assert.equal(nm.conf, 'isim');
  assert.equal(recognize({ type: 'box', p: { w: 10, l: 10, h: 10 } }).conf, 'tür');
});
t('delik → M ölçüsü (ISO 273), tabloda yoksa tahmin yok; standart boy', () => {
  assert.deepEqual(boltForHole(9), { m: 8, kind: 'geçiş' });
  assert.deepEqual(boltForHole(6.8), { m: 8, kind: 'diş (kılavuz)' });
  assert.equal(boltForHole(7.3), null);
  assert.equal(stdBoltLen(32.5), 35); assert.equal(stdBoltLen(40), 40);
});
t('basit montaj: iki plaka 2 delikle → 2 × M8×35 + 4 rondela + 2 somun EKSİK, 2 adım', () => {
  const H = [[50, 50], [150, 50]];
  const a = part('Alt plaka', 'box', plateWithHoles(0, 200, 0, 10, 0, 100, H, 9), { p: { w: 200, l: 100, h: 10 } });
  const b = part('Üst plaka', 'box', plateWithHoles(0, 200, 10, 20, 0, 100, H, 9), { p: { w: 200, l: 100, h: 10 } });
  const h1 = hole('Delik 1', 50, 50, -1, 22), h2 = hole('Delik 2', 150, 50, -1, 22);
  const r = analyzeAssembly({ parts: [a, b, h1, h2] });
  assert.equal(r.fasteners.length, 2);
  for (const F of r.fasteners) { assert.equal(F.status, 'EKSİK'); assert.equal(F.bolt.m, 8); assert.equal(F.bolt.len, 35); assert.ok(Math.abs(F.grip - 20) < 1, String(F.grip)); }
  const bom = Object.fromEntries(r.bom.map((x) => [x.what, x.need]));
  assert.equal(bom['Cıvata M8×35'], 2); assert.equal(bom['Rondela M8 (ISO 7089)'], 4); assert.equal(bom['Somun M8 (ISO 4032)'], 2);
  assert.equal(r.steps.length, 2); assert.ok(r.steps[0].base);
  assert.equal(r.steps[1].fasten.length, 2);
  assert.equal(r.problems.filter((p) => p.sev === 'crit').length, 0);
  assert.equal(r.questions.length, 0);   // delikle bağlı: soru yok
});
t('cıvata modelde varsa "mevcut", deliğe eksenden çıkarılabilir, sıra: plakalar → cıvata', () => {
  const H = [[50, 50]];
  const a = part('Alt plaka', 'box', plateWithHoles(0, 200, 0, 10, 0, 100, H, 9), { p: {} });
  const b = part('Üst plaka', 'box', plateWithHoles(0, 200, 10, 20, 0, 100, H, 9), { p: {} });
  const bp = { type: 'cylinder', d: 8, h: 40, x: 50, y: -10, z: 50, rx: 0, ry: 0, rz: 0 };
  const bolt = part('Cıvata', 'cylinder', cylTris(bp), { p: bp });
  const r = analyzeAssembly({ parts: [a, b, bolt, hole('Delik', 50, 50, -1, 22)] });
  assert.equal(r.fasteners[0].status, 'mevcut');
  assert.equal(r.problems.filter((p) => p.title === 'Parçalar çakışıyor').length, 0);
  const order = r.steps.map((s) => s.names.join('+'));
  assert.equal(order[order.length - 1], 'Cıvata', order.join(' → '));
  assert.ok(r.steps[r.steps.length - 1].insert.includes('Y'));
});
t('yanlış yönlendirilmiş cıvata (10° eğik)', () => {
  const H = [[50, 50]];
  const a = part('Alt', 'box', plateWithHoles(0, 200, 0, 10, 0, 100, H, 9), { p: {} });
  const b = part('Üst', 'box', plateWithHoles(0, 200, 10, 20, 0, 100, H, 9), { p: {} });
  const bp = { type: 'cylinder', d: 8, h: 40, x: 50, y: -10, z: 50, rx: 10, ry: 0, rz: 0 };
  const r = analyzeAssembly({ parts: [a, b, part('Eğik cıvata', 'cylinder', cylTris(bp), { p: bp }), hole('Delik', 50, 50, -1, 22)] });
  assert.ok(r.problems.some((p) => p.title === 'Yanlış yönlendirilmiş parça'), JSON.stringify(r.problems.map((p) => p.title)));
});
t('fiziksel olarak mümkün olmayan montaj: kapalı kafesteki parça', () => {
  const P = (n, a, b) => part(n, 'sheet', boxTris(a, b));
  const cage = [P('Taban', [0, 0, 0], [100, 2, 100]), P('Kapak', [0, 98, 0], [100, 100, 100]), P('Sol', [0, 2, 0], [2, 98, 100]), P('Sağ', [98, 2, 0], [100, 98, 100]), P('Arka', [2, 2, 0], [98, 98, 2]), P('Ön', [2, 2, 98], [98, 98, 100])];
  const welds = [];
  for (let i = 1; i < cage.length; i++) if (i !== 1) welds.push({ status: 'approved', parts: [cage[0].id, cage[i].id] });
  for (const i of [2, 3, 4, 5]) welds.push({ status: 'approved', parts: [cage[1].id, cage[i].id] });
  const pin = part('Pim bloğu', 'box', boxTris([30, 2, 30], [70, 40, 70]));
  const r = analyzeAssembly({ parts: [...cage, pin], welds });
  assert.ok(r.problems.some((p) => p.title === 'Fiziksel olarak mümkün olmayan montaj'), JSON.stringify(r.problems.map((p) => p.title)));
  assert.ok(r.stuck.some((ids) => ids.includes(pin.id)));
  // kapak yoksa mümkün
  const r2 = analyzeAssembly({ parts: [...cage.filter((_, i) => i !== 1), pin], welds: welds.filter((w) => !w.parts.includes(cage[1].id)) });
  assert.ok(!r2.problems.some((p) => p.title === 'Fiziksel olarak mümkün olmayan montaj'));
  assert.equal(r2.steps[r2.steps.length - 1].names[0], 'Pim bloğu');
});
t('çok parçalı: kaynaklı şase + cıvatalı plaka + motor; sıra, patlatma, animasyon', () => {
  // şase: delikli iki üst lama + bacaklar (uygulamada delik öncesindeki her parçadan çıkarılır)
  const rl = part('Şase', 'frame', plateWithHoles(-600, -560, 710, 750, -350, 350, [[-580, 0]], 9));
  const rr = part('Şase sağ', 'frame', plateWithHoles(560, 600, 710, 750, -350, 350, [[580, 0]], 9));
  const legs = [[-600, -560], [560, 600]].map(([a, b], i) => part('Bacak ' + (i + 1), 'frame', boxTris([a, 0, -20], [b, 710, 20])));
  const welds = [[rl, legs[0]], [rr, legs[1]]].map(([a, b]) => ({ status: 'approved', parts: [a.id, b.id] }));
  const tie = part('Alt kuşak', 'frame', boxTris([-560, 100, -20], [560, 140, 20]));
  welds.push({ status: 'approved', parts: [tie.id, legs[0].id] }, { status: 'approved', parts: [tie.id, legs[1].id] });
  const frame = rl;
  const plate = part('Motor plakası', 'box', plateWithHoles(-600, 600, 750, 760, -350, 350, [[-580, 0], [580, 0]], 9), { p: {} });
  const motor = part('Motor', 'box', boxTris([-150, 760, -100], [150, 960, 100]));
  const holes = [hole('D1', -580, 0, 700, 70), hole('D2', 580, 0, 700, 70)];
  const r = analyzeAssembly({ parts: [rl, rr, ...legs, tie, plate, motor, ...holes], welds }, { answers: { [Math.min(plate.id, motor.id) + '-' + Math.max(plate.id, motor.id)]: 'cıvata' } });
  assert.deepEqual(r.steps.map((s) => s.names[0]), ['Şase', 'Motor plakası', 'Motor'], JSON.stringify(r.steps.map((s) => s.text)) + JSON.stringify(r.questions.map((q) => q.text)));
  assert.equal(r.steps[0].ids.length, 5);
  assert.ok(r.steps[1].onto.includes('Şase') && r.steps[2].onto.includes('Motor plakası'), JSON.stringify(r.steps.map((s) => s.onto)));
  assert.equal(r.fasteners.length, 2); assert.equal(r.fasteners[0].bolt.m, 8);
  assert.ok(Math.abs(r.fasteners[0].grip - 50) < 1.5, String(r.fasteners[0].grip));   // 10 mm plaka + 40 mm lama
  assert.equal(r.fasteners[0].bolt.len, 65);
  assert.ok(r.steps[1].fasten.length === 2);
  const off = explodeOffsets(r, 1500, 1);
  assert.deepEqual(off.get(frame.id), [0, 0, 0]);
  assert.ok(off.get(plate.id)[1] > 0 && off.get(motor.id)[1] > off.get(plate.id)[1]);
  assert.ok(Math.abs(off.get(motor.id)[0]) < 1e-9 && Math.abs(off.get(motor.id)[2]) < 1e-9);   // yalnız takılma ekseni boyunca
  const a0 = animState(r, off, 1, 0), a1 = animState(r, off, 1, 1);
  assert.equal(a0.get(frame.id).mode, 'placed'); assert.equal(a0.get(motor.id).mode, 'ghost');
  assert.deepEqual(a0.get(plate.id).off, off.get(plate.id));
  assert.deepEqual(a1.get(plate.id).off.map((v) => Math.abs(v)), [0, 0, 0]);
  const half = animState(r, off, 1, 0.5).get(plate.id).off[1];
  assert.ok(half > 0 && half < off.get(plate.id)[1]);
});
t('bağlantısı bilinmeyen temas → kullanıcıya sorulur; cevap "kaynak" ise birlikte hareket eder', () => {
  const a = part('Gövde', 'box', boxTris([0, 0, 0], [100, 50, 100])), b = part('Kulak', 'box', boxTris([100, 0, 40], [130, 50, 60]));
  const r = analyzeAssembly({ parts: [a, b] });
  assert.equal(r.questions.length, 1); assert.deepEqual(r.questions[0].options, ['kaynak', 'cıvata', 'geçme / yapıştırma', 'yok']);
  const k = r.questions[0].key;
  const r2 = analyzeAssembly({ parts: [a, b] }, { answers: { [k]: 'kaynak' } });
  assert.equal(r2.questions.length, 0); assert.equal(r2.steps.length, 1); assert.deepEqual(r2.steps[0].ids.sort(), [a.id, b.id].sort());
  const r3 = analyzeAssembly({ parts: [a, b] }, { answers: { [k]: 'yok' } });
  assert.equal(r3.questions.length, 0); assert.equal(r3.steps.length, 2);
});
t('erişilemeyen montaj noktası: somun tarafı başka parçayla kapalı', () => {
  const H = [[50, 50]];
  const a = part('Alt', 'box', plateWithHoles(0, 200, 0, 10, 0, 100, H, 9), { p: {} });
  const b = part('Üst', 'box', plateWithHoles(0, 200, 10, 20, 0, 100, H, 9), { p: {} });
  const blk = part('Kapak bloğu', 'box', boxTris([30, 20, 30], [70, 40, 70]));
  const r = analyzeAssembly({ parts: [a, b, blk, hole('Delik', 50, 50, -1, 22)] }, { answers: { [Math.min(b.id, blk.id) + '-' + Math.max(b.id, blk.id)]: 'yok' } });
  assert.ok(r.problems.some((p) => p.title === 'Erişilemeyen montaj noktası' && p.parts.includes(blk.id)), JSON.stringify(r.problems));
});
t('delik ölçüsü tabloda yok → ölçü belirlenemedi, eleman listesine girmez', () => {
  const H = [[50, 50]];
  const a = part('Alt', 'box', plateWithHoles(0, 200, 0, 10, 0, 100, H, 7.3), { p: {} });
  const b = part('Üst', 'box', plateWithHoles(0, 200, 10, 20, 0, 100, H, 7.3), { p: {} });
  const r = analyzeAssembly({ parts: [a, b, hole('Garip delik', 50, 50, -1, 22, 7.3)] });
  assert.equal(r.fasteners[0].status, 'ölçü belirlenemedi'); assert.equal(r.bom.length, 0);
});
t('büyük model: 30 parça makul sürede', () => {
  const ps = [part('Taban', 'box', boxTris([0, 0, 0], [1000, 20, 1000]))];
  for (let i = 0; i < 30; i++) { const x = (i % 6) * 160 + 10, z = Math.floor(i / 6) * 190 + 10; ps.push(part('Blok ' + i, 'box', boxTris([x, 20, z], [x + 100, 80, z + 100]))); }
  const ans = Object.fromEntries(ps.slice(1).map((q) => [Math.min(ps[0].id, q.id) + '-' + Math.max(ps[0].id, q.id), 'cıvata']));
  const t0 = Date.now(); const r = analyzeAssembly({ parts: ps }, { answers: ans }); const dt = Date.now() - t0;
  console.log('      31 parça: ' + dt + ' ms, ' + r.steps.length + ' adım');
  assert.equal(r.steps.length, 31); assert.ok(dt < 20000);
});

for (const [name, fn] of tests) {
  try { await fn(); console.log('ok   ', name); }
  catch (e) { fail++; console.log('FAIL ', name, '\n     ', e.message.split('\n')[0].slice(0, 600)); }
}
console.log(fail ? `\n${fail} test BAŞARISIZ` : '\nTüm testler geçti');
process.exit(fail ? 1 : 0);
