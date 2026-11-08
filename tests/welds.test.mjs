// Çalıştır: node tests/welds.test.mjs
import assert from 'node:assert/strict';
import { detectWelds, frameWelds, mergePlan, setSide, actualLen, weldArea, planReport, weldSequence, weldSummary, contactClusters, labelOf, weldAccess } from '../welds.js';
import { Mesh, partPose } from '../mfgcheck.js';
import { frameCalc, newPart } from '../logic.js';

let fail = 0;
const tests = [];
const t = (name, fn) => tests.push([name, fn]);
function boxTris(min, max) {
  const [x0, y0, z0] = min, [x1, y1, z1] = max;
  const v = [[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0], [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]];
  const f = [[0, 2, 1], [0, 3, 2], [4, 5, 6], [4, 6, 7], [0, 1, 5], [0, 5, 4], [3, 7, 6], [3, 6, 2], [0, 4, 7], [0, 7, 3], [1, 2, 6], [1, 6, 5]];
  return Float32Array.from(f.flatMap((q) => q.flatMap((i) => v[i])));
}
function frameTris(p) {
  const c = frameCalc(p), pos = c.pos, out = new Float32Array(pos.length), { R, T } = partPose(p);
  for (let i = 0; i < pos.length; i += 3) { const v = [pos[i], pos[i + 1] + c.h / 2, pos[i + 2]]; for (let k = 0; k < 3; k++) out[i + k] = R[k][0] * v[0] + R[k][1] * v[1] + R[k][2] * v[2] + T[k]; }
  return out;
}
const STEEL = { id: 'celik', name: 'Çelik (S235)', kind: 'metal' };
const frame = (o) => { const p = { ...newPart(1, 'frame', 'add', null), ...o }; return { id: 1, name: 'Şase', type: 'frame', op: 'add', tris: frameTris(p), p, material: STEEL }; };
const near = (a, b, tol = 0.5) => assert.ok(Math.abs(a - b) <= tol, a + ' ≠ ' + b);

t('masa şasesi: 16 birleşim, üst kuşak köşe, alt kuşak T, profil çevresi 160 mm', () => {
  const ws = frameWelds(frame({ fr: 'table', fw: 1200, fd: 700, fh: 750, fs: 150, pf: 'k40' }));
  assert.equal(ws.length, 16);
  const top = ws.filter((w) => w.pos[1] > 700), low = ws.filter((w) => w.pos[1] < 200);
  assert.equal(top.length, 8); assert.equal(low.length, 8);
  assert.ok(top.every((w) => w.type === 'kose')); assert.ok(low.every((w) => w.type === 't'));
  for (const w of ws) { near(w.lens.cevre, 160); near(w.lens.tek, 40); near(w.lens.iki, 80); }
});
t('gönyeli pano çerçeve: 4 alın kaynağı, eğik kesit çevresi 2·40 + 2·40·√2', () => {
  const ws = frameWelds(frame({ fr: 'rect', fw: 800, fh: 600, pf: 'k40', fj: 'miter' }));
  assert.equal(ws.length, 4);
  assert.ok(ws.every((w) => w.type === 'alin'));
  near(ws[0].lens.cevre, 80 + 80 * Math.SQRT2, 1);
});
t('yuvarlak boru iskelet: çevre π·D', () => {
  const ws = frameWelds(frame({ fr: 'table', fw: 1000, fd: 600, fh: 700, fs: 0, pf: 'b42' }));
  assert.ok(ws.length >= 8);
  near(ws[0].lens.cevre, Math.PI * 42.4, 1.5);
});
t('sac–profil teması: şase üstüne tabla → dış çevre dikişi, köşe kaynağı', () => {
  const f = frame({ fr: 'table', fw: 1200, fd: 700, fh: 750, fs: 150, pf: 'k40' });
  const top = { id: 2, name: 'Tabla', type: 'sheet', op: 'add', tris: boxTris([-600, 750, -350], [600, 755, 350]), p: {}, material: STEEL };
  const ws = detectWelds({ parts: [f, top] }).filter((w) => w.src === 'contact');
  assert.equal(ws.length, 1, JSON.stringify(ws.map((w) => w.where)));
  near(ws[0].lens.cevre, 2 * (1200 + 700), 2);
  assert.equal(ws[0].type, 'kose');
  // tabla daha dar: iki ayrı kuşak üstüne oturan plaka → iki bölge, her biri 40×400 dikdörtgen
  const plate = { id: 3, name: 'Motor plakası', type: 'sheet', op: 'add', tris: boxTris([-600, 750, -200], [600, 755, 200]), p: {}, material: STEEL };
  const w2 = detectWelds({ parts: [f, plate] }).filter((w) => w.src === 'contact');
  assert.equal(w2.length, 2);
  for (const w of w2) near(w.lens.cevre, 2 * (40 + 400), 2);
});
t('profil–profil: alın (uç uca), T (uç yüzeye), değmeyen parça kaynak önerilmez', () => {
  const a = { id: 1, name: 'A', type: 'sweep', op: 'add', tris: boxTris([0, 0, 0], [500, 40, 40]), p: {}, material: STEEL };
  const b = { id: 2, name: 'B', type: 'sweep', op: 'add', tris: boxTris([500, 0, 0], [900, 40, 40]), p: {}, material: STEEL };
  const c = { id: 3, name: 'C', type: 'sweep', op: 'add', tris: boxTris([200, 40, 0], [240, 400, 40]), p: {}, material: STEEL };
  const d = { id: 4, name: 'D', type: 'sweep', op: 'add', tris: boxTris([0, 300, 300], [100, 340, 340]), p: {}, material: STEEL };
  const ws = detectWelds({ parts: [a, b, c, d] });
  const ab = ws.find((w) => w.parts.includes(1) && w.parts.includes(2)), ac = ws.find((w) => w.parts.includes(1) && w.parts.includes(3));
  assert.equal(ab.type, 'alin'); near(ab.lens.cevre, 160);
  assert.equal(ac.type, 't'); near(ac.lens.cevre, 160);
  assert.ok(!ws.some((w) => w.parts.includes(4)));
});
t('plastik / ahşap parçalar kaynak önerisine girmez', () => {
  const a = { id: 1, name: 'A', type: 'box', op: 'add', tris: boxTris([0, 0, 0], [50, 50, 50]), p: {}, material: { id: 'pla', kind: 'plastic' } };
  const b = { id: 2, name: 'B', type: 'box', op: 'add', tris: boxTris([0, 50, 0], [50, 100, 50]), p: {}, material: { id: 'pla', kind: 'plastic' } };
  assert.equal(detectWelds({ parts: [a, b] }).length, 0);
});
t('çizgi teması (boru plakaya yatık): dikiş iki yandan boru boyu', () => {
  const n = 24, r = 20, L = 600, tr = [];
  for (let i = 0; i < n; i++) {
    const a0 = i / n * 2 * Math.PI, a1 = (i + 1) / n * 2 * Math.PI;
    const P = (a, x) => [x, r + r * Math.sin(a - Math.PI / 2), r * Math.cos(a - Math.PI / 2)];
    tr.push(...P(a0, 0), ...P(a1, 0), ...P(a1, L), ...P(a0, 0), ...P(a1, L), ...P(a0, L), 0, r, 0, ...P(a1, 0), ...P(a0, 0), L, r, 0, ...P(a0, L), ...P(a1, L));
  }
  const tube = { id: 1, name: 'Boru', type: 'sweep', op: 'add', tris: Float32Array.from(tr), p: {}, material: STEEL };
  const plate = { id: 2, name: 'Plaka', type: 'sheet', op: 'add', tris: boxTris([-50, -5, -100], [700, 0, 100]), p: {}, material: STEEL };
  const ws = detectWelds({ parts: [tube, plate] });
  assert.equal(ws.length, 1); near(ws[0].lens.cevre, 2 * L, 2); near(ws[0].lens.tek, L, 1);
});
t('plan birleştirme: onay ve düzenlemeler yeniden tespitte korunur, elle eklenen kalır', () => {
  const f = frame({ fr: 'rect', fw: 800, fh: 600, pf: 'k40' });
  let plan = mergePlan(frameWelds(f), []);
  assert.ok(plan.every((w) => w.status === 'proposed' && w.size == null));
  assert.deepEqual(plan.map((w) => w.label), ['A', 'B', 'C', 'D']);
  plan[0].status = 'approved'; plan[0].size = 3; plan[1].status = 'rejected';
  setSide(plan[2], 'tek'); near(plan[2].len, 40);
  plan.push({ id: 'm1', manual: true, status: 'approved', type: 'kose', side: 'tek', len: 120, size: 4, mode: 'surekli', pos: [0, 0, 0], parts: [], label: '?' });
  const again = mergePlan(frameWelds(f), plan);
  assert.equal(again[0].status, 'approved'); assert.equal(again[0].size, 3); assert.equal(again[1].status, 'rejected'); near(again[2].len, 40);
  assert.ok(again.some((w) => w.manual && w.len === 120));
  assert.equal(labelOf(25), 'Z'); assert.equal(labelOf(26), 'AA');
});
t('aralıklı dikiş: bağlantı ve gerçek uzunluk ayrı', () => {
  const r = actualLen({ len: 1000, mode: 'aralikli', stitch: 50, pitch: 100 });
  assert.equal(r.n, 7); assert.equal(r.actual, 350); assert.equal(r.conn, 1000);
  assert.equal(actualLen({ len: 300, mode: 'surekli' }).actual, 300);
});
t('sarf hesabı: köşe a=3, 1000 mm çelik, MAG Ø1,0', () => {
  assert.equal(weldArea({ type: 'kose', size: null }), null);
  near(weldArea({ type: 'kose', size: 3 }, 10), 9.9, 1e-9);
  const plan = [{ status: 'approved', type: 'kose', size: 3, len: 1000, mode: 'surekli', material: STEEL, label: 'A' }];
  const r = planReport(plan, { method: 'mag', dia: 1, loss: 10 });
  near(r.depositG, 9.9 * 1000 * 7.85 / 1000, 0.01);                 // 77,7 g
  const c = r.cons[0];
  near(c.needG, 77.715 / 0.92 * 1.1, 0.05);                          // ~92,9 g tel
  near(c.wireM, c.needG / (Math.PI * 0.25 * 7.85e-3) / 1000, 0.01);  // ~15 m
  assert.ok(c.arcMin > 1 && c.arcMin < 3, String(c.arcMin));         // 77,7 g / 2,5 kg/h ≈ 1,9 dk
  assert.ok(c.gasL > 20 && c.gasL < 35);
});
t('sarf hesabı: örtülü elektrot adedi, ölçüsü girilmeyen kaynak hesaba katılmaz', () => {
  const plan = [
    { status: 'approved', type: 'kose', size: 4, len: 2000, mode: 'surekli', material: STEEL, label: 'A' },
    { status: 'approved', type: 'alin', size: null, len: 500, mode: 'surekli', material: STEEL, label: 'B' },
    { status: 'proposed', type: 'kose', size: 3, len: 900, mode: 'surekli', material: STEEL, label: 'C' },
  ];
  const r = planReport(plan, { method: 'stick', dia: 3.2 });
  assert.deepEqual(r.unknown, ['B']); assert.equal(r.approved, 2); near(r.connLen, 2500);
  const c = r.cons[0];
  assert.ok(c.electrodes >= 10 && c.electrodes <= 25, String(c.electrodes));
  assert.equal(c.gasL, 0);
});
t('kaynak sırası: alt → dikme → üst → tamamlayıcı, grup içinde karşılıklı', () => {
  const f = frame({ fr: 'table', fw: 1200, fd: 700, fh: 750, fs: 150, pf: 'k40' });
  const top = { id: 2, name: 'Tabla', type: 'sheet', op: 'add', tris: boxTris([-600, 750, -350], [600, 755, 350]), p: {}, material: STEEL };
  const plan = mergePlan(detectWelds({ parts: [f, top] }), []);
  plan.forEach((w) => { w.status = 'approved'; });
  const seq = weldSequence(plan, { min: [-600, 0, -350], max: [600, 755, 350] });
  assert.deepEqual(seq.map((g) => g.name), ['Alt şase birleşimleri', 'Üst şase birleşimleri', 'Tamamlayıcı kaynaklar (sac, braket, ek parçalar)']);
  assert.equal(seq[0].welds.length, 8);
  // ardışık iki kaynak birbirine uzak (karşılıklı): ilk ikisi arasındaki mesafe şasenin yarı boyundan büyük
  const [w1, w2] = seq[0].welds, dd = Math.hypot(w1.pos[0] - w2.pos[0], w1.pos[2] - w2.pos[2]);
  assert.ok(dd > 600, String(dd));
});
t('özet cümlesi', () => {
  const f = frame({ fr: 'table', fw: 1200, fd: 700, fh: 750, fs: 150, pf: 'k40' });
  const plan = mergePlan(frameWelds(f), []);
  plan.slice(0, 15).forEach((w) => { w.status = 'approved'; w.size = 3; });
  const s = weldSummary(plan, planReport(plan));
  assert.ok(s.startsWith('Modelinde 16 olası kaynak birleşimi tespit edildi. Bunlardan 15 tanesini onayladın. Toplam kaynak uzunluğu 2.400 mm.'), s);
  assert.ok(s.includes('sarf malzemesi ve kaynak işlem sırası hazır'));
});
t('erişim: açık şase köşesi erişilebilir', () => {
  const f = frame({ fr: 'table', fw: 1200, fd: 700, fh: 750, fs: 150, pf: 'k40' });
  const ws = frameWelds(f), M = [new Mesh(f.tris)];
  const a = weldAccess(ws[0], M);
  assert.ok(a && a.best > 0.2, JSON.stringify(a));
});
t('büyük model hızlı: raf iskeleti + 20 plaka', () => {
  const f = frame({ fr: 'shelf', fw: 2000, fd: 600, fh: 1800, fn: 6, pf: 'k40' });
  const ps = [f];
  for (let i = 0; i < 20; i++) ps.push({ id: 10 + i, name: 'P' + i, type: 'sheet', op: 'add', tris: boxTris([-1000 + i * 100, 1800, -300], [-920 + i * 100, 1805, 300]), p: {}, material: STEEL });
  const t0 = Date.now(); const ws = detectWelds({ parts: ps }); const dt = Date.now() - t0;
  console.log('      büyük model: ' + ws.length + ' birleşim, ' + dt + ' ms');
  assert.ok(dt < 8000); assert.ok(ws.length >= 48 + 20);
});

for (const [name, fn] of tests) {
  try { await fn(); console.log('ok   ', name); }
  catch (e) { fail++; console.log('FAIL ', name, '\n     ', e.message.split('\n')[0].slice(0, 500)); }
}
console.log(fail ? `\n${fail} test BAŞARISIZ` : '\nTüm testler geçti');
process.exit(fail ? 1 : 0);
