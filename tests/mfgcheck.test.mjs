// Çalıştır: node tests/mfgcheck.test.mjs
import assert from 'node:assert/strict';
import { analyzeModel, Mesh, interference, minDistance, blocks, torchAccess, frameWorldMembers, frameJoints, eulerXYZ, partPose } from '../mfgcheck.js';
import { frameCalc, newPart } from '../logic.js';

let fail = 0;
const tests = [];
const t = (name, fn) => tests.push([name, fn]);

// eksenlere paralel kutu üçgenleri
function boxTris(min, max) {
  const [x0, y0, z0] = min, [x1, y1, z1] = max;
  const v = [[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0], [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]];
  const f = [[0, 2, 1], [0, 3, 2], [4, 5, 6], [4, 6, 7], [0, 1, 5], [0, 5, 4], [3, 7, 6], [3, 6, 2], [0, 4, 7], [0, 7, 3], [1, 2, 6], [1, 6, 5]];
  return Float32Array.from(f.flatMap((q) => q.flatMap((i) => v[i])));
}
const cat = (...arrs) => { const o = new Float32Array(arrs.reduce((s, a) => s + a.length, 0)); let k = 0; for (const a of arrs) { o.set(a, k); k += a.length; } return o; };
// iskeletin dünya üçgenleri (app.js place() ile aynı: yerel taban orijinli, sonra döndür + taşı)
function frameTris(p) {
  const c = frameCalc(p), pos = c.pos, out = new Float32Array(pos.length), { R, T } = partPose(p);
  for (let i = 0; i < pos.length; i += 3) {
    const v = [pos[i], pos[i + 1] + c.h / 2, pos[i + 2]];
    for (let k = 0; k < 3; k++) out[i + k] = R[k][0] * v[0] + R[k][1] * v[1] + R[k][2] * v[2] + T[k];
  }
  return out;
}
const MAT = { id: 'celik', name: 'Çelik (S235)', kind: 'metal' };
let pid = 1;
const part = (type, tris, extra = {}) => ({ id: pid++, name: extra.name || type + pid, type, op: extra.op || 'add', tris, p: extra.p || { d: 10, h: 10, w: 10, l: 10 }, material: extra.material || MAT, warnings: extra.warnings });
const run = (parts, o = {}) => analyzeModel({ parts, mates: o.mates || [], mateErr: o.mateErr || 0, stock: 6000 }, { mode: o.mode });
const has = (r, sev, cat2) => r.issues.filter((x) => x.sev === sev && (!cat2 || x.cat === cat2));

t('çekirdek: içinde mi, uzaklık, hacim', () => {
  const A = new Mesh(boxTris([0, 0, 0], [10, 10, 10]));
  assert.ok(A.contains([5, 5, 5])); assert.ok(!A.contains([11, 5, 5])); assert.ok(A.closed());
  assert.ok(Math.abs(A.nearest([5, 5, 13]) - 3) < 1e-6);
  assert.ok(Math.abs(A.volume() - 1000) < 1e-6);
  const B = new Mesh(boxTris([8, 0, 0], [18, 10, 10]));
  const it = interference(A, B);
  assert.ok(it.vol > 150 && it.vol < 250, 'hacim ' + it.vol); assert.ok(it.depth >= 0.8, 'derinlik ' + it.depth);
  const C = new Mesh(boxTris([10, 0, 0], [20, 10, 10]));
  assert.equal(interference(A, C).depth, 0);
  assert.ok(minDistance(A, C).d < 1e-6);
  assert.ok(Math.abs(minDistance(A, new Mesh(boxTris([11, 0, 0], [20, 10, 10]))).d - 1) < 1e-6);
});
t('uzaklık: köşeleri üst üste gelmeyen paralel levhalar (yüz–yüz 1,2 mm)', () => {
  const A = new Mesh(boxTris([-650, 745, -200], [650, 760, 200])), B = new Mesh(boxTris([-600, 761.2, -350], [-100, 766, 350]));
  assert.ok(Math.abs(minDistance(A, B).d - 1.2) < 1e-3, String(minDistance(A, B).d));
  // çapraz duran iki çubuk: kenar–kenar uzaklığı
  const C = new Mesh(boxTris([0, 0, -50], [10, 10, 50])), D = new Mesh(boxTris([-50, 10.7, 40], [50, 20, 45]));
  assert.ok(Math.abs(minDistance(C, D).d - 0.7) < 1e-3);
});
t('Euler dönüşü three.js ile aynı (XYZ)', () => {
  const R = eulerXYZ(90, 0, 0); // x etrafında 90°: y → z
  assert.ok(Math.abs(R[2][1] - 1) < 1e-12 && Math.abs(R[1][2] + 1) < 1e-12);
});
t('1) birbirine çarpan iki profil → KRİTİK çakışma', async () => {
  const a = part('sweep', boxTris([0, 0, 0], [1000, 40, 40]), { name: 'Profil A' });
  const b = part('sweep', boxTris([480, 20, -200], [520, 60, 200]), { name: 'Profil B' }); // 20 mm iç içe
  const r = await run([a, b]);
  const c = has(r, 'crit', 'Çakışma');
  assert.equal(c.length, 1); assert.ok(c[0].depth >= 9 && c[0].depth <= 21, 'derinlik ' + c[0].depth);
  assert.ok(c[0].box && c[0].box.min[0] >= 470 && c[0].box.max[0] <= 530);
  assert.ok(r.summary.includes('1 bölgede geometrik çakışma'));
});
t('içi boş profile batan plaka: malzeme derinliği ve kaydırma payı ayrı', async () => {
  const fp = { ...newPart(1, 'frame', 'add', null), fr: 'table', fw: 1200, fd: 700, fh: 750, fs: 150, pf: 'k40' };
  const r = await run([part('frame', frameTris(fp), { p: fp }), part('sheet', boxTris([-650, 745, -200], [650, 760, 200]), { p: { st: 15, sw: 400, seg: [{ L: 1300 }] } })]);
  const c = has(r, 'crit', 'Çakışma')[0];
  assert.ok(c.depth >= 1.5 && c.depth <= 2.6, 'malzeme ' + c.depth);      // et kalınlığı 2 mm
  assert.ok(c.span >= 4.5 && c.span <= 6, 'kaydırma ' + c.span);           // plaka 5 mm batıyor
});
t('2) doğru temas eden iki profil → çakışma yok, boşluk yok', async () => {
  const a = part('sweep', boxTris([0, 0, 0], [1000, 40, 40]));
  const b = part('sweep', boxTris([480, 40, 0], [520, 400, 40])); // üstüne dik oturuyor
  const c = part('sweep', boxTris([1000, 0, 0], [1040, 40, 1000])); // uca alın temas
  const r = await run([a, b, c]);
  assert.equal(has(r, 'crit').length, 0, JSON.stringify(r.issues.map((x) => x.title)));
  assert.equal(r.issues.filter((x) => x.cat === 'Boşluk').length, 0);
});
t('3) aralarında istenmeyen boşluk olan parçalar → UYARI', async () => {
  const a = part('sweep', boxTris([0, 0, 0], [1000, 40, 40]));
  const b = part('sweep', boxTris([480, 41.5, 0], [520, 400, 40]));
  const r = await run([a, b]);
  const g = r.issues.filter((x) => x.cat === 'Boşluk');
  assert.equal(g.length, 1); assert.ok(Math.abs(g[0].gap - 1.5) < 0.01);
  // eşleşmesi olan ama uzak parçalar
  const c = part('box', boxTris([0, 100, 0], [10, 110, 10])), d = part('box', boxTris([0, 130, 0], [10, 140, 10]));
  const r2 = await run([c, d], { mates: [[c.id, d.id, 'coinc']] });
  assert.ok(r2.issues.some((x) => x.title === 'Eşleşen parçalar birbirine değmiyor'));
});
t('4) montajı engelleyen geometri: kapalı kafesin içindeki parça', async () => {
  const P = (a, b) => part('sheet', boxTris(a, b), { p: { st: 2, sw: 100, seg: [{ L: 100 }] } });
  const cage = [P([0, 0, 0], [100, 2, 100]), P([0, 98, 0], [100, 100, 100]), P([0, 2, 0], [2, 98, 100]), P([98, 2, 0], [100, 98, 100]), P([2, 2, 0], [98, 98, 2]), P([2, 2, 98], [98, 98, 100])];
  const pin = part('box', boxTris([30, 2, 30], [70, 40, 70]), { name: 'Pim' }); // tabana oturuyor
  const r = await run([...cage, pin]);
  assert.ok(r.issues.some((x) => x.title === 'Montaj sırası bulunamadı' && x.parts.includes(pin.id)), JSON.stringify(r.issues.map((x) => x.title)));
  // aynı parça açık kutuda (üst kapak yok) → montaj mümkün, yukarıdan takılır
  const r2 = await run([...cage.filter((_, i) => i !== 1), pin]);
  assert.ok(!r2.issues.some((x) => x.title === 'Montaj sırası bulunamadı'));
  const seq = r2.issues.find((x) => x.title === 'Önerilen montaj sırası');
  assert.ok(seq && seq.desc.includes('Pim'), seq && seq.desc);
});
t('montaj: blocks() projeksiyon testi', () => {
  const P = new Mesh(boxTris([0, 0, 0], [10, 10, 10]));
  const above = new Mesh(boxTris([0, 20, 0], [10, 30, 10]));
  const side = new Mesh(boxTris([10, 0, 0], [20, 10, 10]));
  assert.ok(blocks(P, above, 2)); assert.ok(!blocks(P, above, 3));
  assert.ok(!blocks(P, side, 2)); assert.ok(blocks(P, side, 0));
});
t('5) kaynak erişimi zor bölge → UYARI', async () => {
  const fp = { ...newPart(1, 'frame', 'add', null), fr: 'rect', fw: 800, fh: 600, pf: 'k40' };
  const ms = frameWorldMembers(fp), J = frameJoints(ms);
  assert.equal(J.length, 4);
  const frame = part('frame', frameTris(fp), { p: fp, name: 'Pano' });
  // bir köşeyi saran plakalar (çerçeveye değmeden, 5 mm uzakta) — torç giremez
  const j = J[0], m = ms[j.member], c = j.at;
  const blk = [];
  for (const [n, half] of [[m.u, m.w / 2], [m.u.map((x) => -x), m.w / 2], [m.v, m.h / 2], [m.v.map((x) => -x), m.h / 2]]) {
    const ctr = c.map((x, k) => x + n[k] * (half + 5 + 3) + j.inward[k] * 30);
    const ext = [0, 1, 2].map((k) => (Math.abs(n[k]) > 0.5 ? 3 : 70));
    blk.push(part('box', boxTris(ctr.map((x, k) => x - ext[k]), ctr.map((x, k) => x + ext[k])), { name: 'Engel' }));
  }
  const r = await run([frame, ...blk]);
  const w = r.issues.filter((x) => x.cat === 'Kaynak');
  assert.ok(w.length >= 1, JSON.stringify(r.issues.map((x) => x.title)));
  assert.ok(w.every((x) => x.sev === 'warn'));
  // engelsiz pano çerçeve: kaynak uyarısı yok
  const r0 = await run([part('frame', frameTris(fp), { p: fp })]);
  assert.equal(r0.issues.filter((x) => x.cat === 'Kaynak').length, 0, JSON.stringify(r0.issues.map((x) => x.desc)));
});
t('torç erişimi: açık köşe yüksek, dar yarık düşük', () => {
  const floor = new Mesh(boxTris([-100, -10, -100], [100, 0, 100]));
  assert.ok(torchAccess([0, 3, 0], [0, 1, 0], [floor]) > 0.6);
  const lid = new Mesh(boxTris([-100, 8, -100], [100, 18, 100]));
  assert.ok(torchAccess([0, 3, 0], [0, 1, 0], [floor, lid]) < 0.1);
});
t('6) sorunsuz makine şasesi → kritik ve uyarı yok', async () => {
  const fp = { ...newPart(1, 'frame', 'add', null), fr: 'table', fw: 1200, fd: 700, fh: 750, fs: 150, pf: 'k40' };
  const r = await run([part('frame', frameTris(fp), { p: fp, name: 'Şase' })]);
  assert.equal(has(r, 'crit').length, 0, JSON.stringify(has(r, 'crit')));
  assert.equal(has(r, 'warn').length, 0, JSON.stringify(has(r, 'warn').map((x) => x.desc)));
  assert.ok(r.coverage.find((c) => c.name === 'Kaynak erişimi').detail.includes('16 kaynak bağlantısı'));
  assert.equal(r.coverage.find((c) => c.name === 'Yapısal dayanım').status, 'skip');
});
t('7) çok parçalı konstrüksiyon: şase + üst tabla + ayaklar + delikli braket', async () => {
  const fp = { ...newPart(1, 'frame', 'add', null), fr: 'table', fw: 1200, fd: 700, fh: 750, fs: 150, pf: 'k40' };
  const frame = part('frame', frameTris(fp), { p: fp, name: 'Şase' });
  const top = part('sheet', boxTris([-600, 750, -350], [600, 755, 350]), { name: 'Üst tabla', p: { st: 5, sw: 700, seg: [{ L: 1200 }] } });
  const feet = [[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sz], i) => part('box', boxTris([sx * 580 - 20, -10, sz * 330 - 20], [sx * 580 + 20, 0, sz * 330 + 20]), { name: 'Ayak ' + (i + 1) }));
  const r = await run([frame, top, ...feet]);
  assert.equal(has(r, 'crit').length, 0, JSON.stringify(has(r, 'crit').map((x) => x.desc)));
  assert.ok(!r.issues.some((x) => x.title === 'Ana gövdeye değmeyen parça'), JSON.stringify(r.issues.map((x) => x.desc)));
  assert.equal(r.partCount, 6);
});
t('delik: cıvata başı alanı kapalı, kenara yakın, standart dışı çap', async () => {
  const plate = part('sheet', boxTris([0, 0, 0], [100, 5, 100]), { name: 'Plaka', p: { st: 5, sw: 100, seg: [{ L: 100 }] } });
  const holeP = { type: 'cylinder', d: 8.7, h: 7, x: 50, y: -1, z: 50, rx: 0, ry: 0, rz: 0 };
  const cyl = (p, n = 32) => { const tr = []; const r = p.d / 2; for (let i = 0; i < n; i++) { const a0 = i / n * 2 * Math.PI, a1 = (i + 1) / n * 2 * Math.PI; const P0 = [p.x + r * Math.cos(a0), p.y, p.z + r * Math.sin(a0)], P1 = [p.x + r * Math.cos(a1), p.y, p.z + r * Math.sin(a1)], Q0 = [P0[0], p.y + p.h, P0[2]], Q1 = [P1[0], p.y + p.h, P1[2]]; tr.push(...P0, ...P1, ...Q1, ...P0, ...Q1, ...Q0, p.x, p.y, p.z, ...P1, ...P0, p.x, p.y + p.h, p.z, ...Q0, ...Q1); } return Float32Array.from(tr); };
  const hole = part('cylinder', cyl(holeP), { op: 'sub', p: holeP, name: 'Delik' });
  const blocker = part('box', boxTris([40, 6, 40], [60, 12, 60]), { name: 'Engel blok' }); // somun tarafını kapatıyor (1 mm boşluk)
  const r = await run([plate, hole, blocker]);
  assert.ok(r.issues.some((x) => x.title === 'Bağlantı elemanı için yer yok' && x.parts.includes(blocker.id)), JSON.stringify(r.issues.map((x) => x.title)));
  assert.ok(r.issues.some((x) => x.title === 'Standart dışı delik çapı'));
  assert.ok(!r.issues.some((x) => x.title === 'Delik kenara çok yakın'));
  const edgeP = { ...holeP, x: 6, d: 8.5 };
  const r2 = await run([plate, part('cylinder', cyl(edgeP), { op: 'sub', p: edgeP })]);
  assert.ok(r2.issues.some((x) => x.title === 'Delik kenara çok yakın'));
  assert.ok(!r2.issues.some((x) => x.title === 'Standart dışı delik çapı'));
  // delik boşta
  const farP = { ...holeP, x: 500 };
  const r3 = await run([plate, part('cylinder', cyl(farP), { op: 'sub', p: farP })]);
  assert.ok(r3.issues.some((x) => x.title === 'Oyuk hiçbir parçayı kesmiyor'));
});
t('geçersiz ölçü, havada parça, tek gövde sayılan basit parçalar, çelişen eşleşme', async () => {
  const a = part('box', boxTris([0, 0, 0], [50, 50, 50]), { p: { w: 0, l: 50, h: 50 }, name: 'Kutu' });
  const b = part('cylinder', boxTris([20, 40, 20], [30, 80, 30]), { p: { d: 10, h: 40 }, name: 'Çıkıntı' }); // iç içe: tek gövde
  const c = part('box', boxTris([200, 0, 0], [220, 20, 20]), { name: 'Uzak' });
  const r = await run([a, b, c], { mateErr: 3 });
  assert.ok(has(r, 'crit', 'Ölçü').length === 1);
  assert.equal(has(r, 'crit', 'Çakışma').length, 0);
  assert.ok(r.issues.some((x) => x.title === 'İç içe parçalar tek gövde sayıldı'));
  assert.ok(r.issues.some((x) => x.title === 'Ana gövdeye değmeyen parça' && x.parts.includes(c.id)));
  assert.ok(r.issues.some((x) => x.title === 'Montaj ilişkileri çelişiyor'));
  // "her parça ayrı" modunda aynı iç içelik kritik
  const r2 = await run([a, b], { mode: 'separate' });
  assert.equal(has(r2, 'crit', 'Çakışma').length, 1);
});
t('stok boyundan uzun ve çok kısa iskelet elemanı, uygulanamayan ölçü', async () => {
  const fp = { ...newPart(1, 'frame', 'add', null), fr: 'rect', fw: 7000, fh: 600, pf: 'k40' };
  const r = await run([part('frame', frameTris(fp), { p: fp })]);
  assert.ok(r.issues.some((x) => x.title === 'Eleman stok boyundan uzun'));
  const fp2 = { ...newPart(1, 'frame', 'add', null), fr: 'table', fw: 50, fd: 700, fh: 750, pf: 'k40' };
  const r2 = await run([part('frame', frameTris(fp2), { p: fp2 })]);
  assert.ok(r2.issues.some((x) => x.title === 'Girilen iskelet ölçüsü uygulanamadı'));
});
t('kapalı olmayan yüzey: kontrol yapılamadı diye raporlanır', async () => {
  const open = boxTris([0, 0, 0], [10, 10, 10]).slice(0, 9 * 10); // iki yüz eksik
  const r = await run([part('mesh', open, { name: 'Açık' }), part('box', boxTris([5, 5, 5], [15, 15, 15]))]);
  const cv = r.coverage.find((c) => c.name === 'Kapalı katı kontrolü');
  assert.equal(cv.status, 'partial'); assert.ok(cv.detail.includes('Açık'));
  assert.equal(has(r, 'crit', 'Çakışma').length, 0);
});
t('8) büyük model: raf iskeleti + 40 parça, makul sürede', async () => {
  const fp = { ...newPart(1, 'frame', 'add', null), fr: 'shelf', fw: 2000, fd: 600, fh: 1800, fn: 6, pf: 'k40' };
  const ps = [part('frame', frameTris(fp), { p: fp })];
  // 40 parça üst kuşağın üstüne oturuyor (temas), ön ve arka kuşakta 20'şer
  for (let i = 0; i < 40; i++) { const x = -950 + (i % 20) * 95, z = i < 20 ? 260 : -300; ps.push(part('box', boxTris([x, 1800, z], [x + 40, 1860, z + 40]))); }
  const t0 = Date.now(); const r = await run(ps); const dt = Date.now() - t0;
  console.log('      büyük model: ' + (r.partCount) + ' parça, ' + dt + ' ms, ' + r.issues.length + ' bulgu');
  assert.ok(dt < 20000, dt + ' ms');
  assert.equal(has(r, 'crit').length, 0);
  assert.ok(!r.issues.some((x) => x.title === 'Ana gövdeye değmeyen parça'), JSON.stringify(r.issues.map((x) => x.title)));
});

for (const [name, fn] of tests) {
  try { await fn(); console.log('ok   ', name); }
  catch (e) { fail++; console.log('FAIL ', name, '\n     ', e.message.split('\n')[0].slice(0, 600)); }
}
console.log(fail ? `\n${fail} test BAŞARISIZ` : '\nTüm testler geçti');
process.exit(fail ? 1 : 0);
