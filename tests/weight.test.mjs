// Çalıştır: node tests/weight.test.mjs
import assert from 'node:assert/strict';
import { analyzeWeight, volumeProps, supportLoads, categoryOf } from '../weight.js';
import { partPose } from '../mfgcheck.js';
import { frameCalc, newPart, matById } from '../logic.js';

let fail = 0;
const tests = [];
const t = (name, fn) => tests.push([name, fn]);
const near = (a, b, tol, msg = '') => assert.ok(Math.abs(a - b) <= tol, msg + ' ' + a + ' ≠ ' + b);
function boxTris(min, max) {
  const [x0, y0, z0] = min, [x1, y1, z1] = max;
  const v = [[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0], [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]];
  const f = [[0, 2, 1], [0, 3, 2], [4, 5, 6], [4, 6, 7], [0, 1, 5], [0, 5, 4], [3, 7, 6], [3, 6, 2], [0, 4, 7], [0, 7, 3], [1, 2, 6], [1, 6, 5]];
  return Float32Array.from(f.flatMap((q) => q.flatMap((i) => v[i])));
}
function cylTris(c, r, h, n = 256) {   // Y ekseninde, tabanı c'de
  const tr = [];
  for (let i = 0; i < n; i++) {
    const a0 = i / n * 2 * Math.PI, a1 = (i + 1) / n * 2 * Math.PI;
    const P = (a, y) => [c[0] + r * Math.cos(a), c[1] + y, c[2] + r * Math.sin(a)];
    tr.push(...P(a0, 0), ...P(a1, 0), ...P(a1, h), ...P(a0, 0), ...P(a1, h), ...P(a0, h), c[0], c[1], c[2], ...P(a1, 0), ...P(a0, 0), c[0], c[1] + h, c[2], ...P(a0, h), ...P(a1, h));
  }
  return Float32Array.from(tr);
}
function frameTris(p) {
  const c = frameCalc(p), pos = c.pos, out = new Float32Array(pos.length), { R, T } = partPose(p);
  for (let i = 0; i < pos.length; i += 3) { const v = [pos[i], pos[i + 1] + c.h / 2, pos[i + 2]]; for (let k = 0; k < 3; k++) out[i + k] = R[k][0] * v[0] + R[k][1] * v[1] + R[k][2] * v[2] + T[k]; }
  return out;
}
const M = (id) => { const m = matById(id); return { material: { id: m.id, name: m.name, rho: m.rho, kind: m.kind }, rho: m.rho, rhoSrc: 'malzeme' }; };
let id = 1;
const item = (name, type, tris, mat = 'celik', extra = {}) => ({ id: id++, name, type, tris, p: extra.p || {}, ...M(mat), ...extra });

t('hacim × yoğunluk: 100 mm küp, çelik / alüminyum / bakır / pirinç / paslanmaz / plastik', () => {
  const cube = boxTris([0, 0, 0], [100, 100, 100]);
  for (const [m, kg] of [['celik', 7.85], ['aluminyum', 2.68], ['bakir', 8.96], ['pirinc', 8.5], ['paslanmaz', 8.0], ['pla', 1.24], ['abs', 1.04]]) {
    const r = analyzeWeight([item('Küp', 'box', cube, m)]);
    near(r.total.kg, kg, 1e-6, m);
    near(r.total.com[0], 50, 1e-9); near(r.total.com[1], 50, 1e-9); near(r.total.com[2], 50, 1e-9);
  }
});
t('silindir: π·r²·h ve merkez (ince ağ)', () => {
  const r = analyzeWeight([item('Mil', 'cylinder', cylTris([10, 0, -20], 25, 400), 'celik')]);
  const V = Math.PI * 25 * 25 * 400;
  near(r.parts[0].volume, V, V * 0.0005);                     // 256 kenarlı ağ: < %0,05 fark
  near(r.total.kg, V / 1e6 * 7.85, 0.01);
  near(r.total.com[0], 10, 1e-6); near(r.total.com[1], 200, 1e-6); near(r.total.com[2], -20, 1e-6);
});
t('iki malzeme: ağırlık merkezi kütleyle ağırlıklı (elle hesapla doğrulama)', () => {
  const a = item('Çelik blok', 'box', boxTris([-50, 0, -50], [50, 100, 50]), 'celik');
  const b = item('Alü blok', 'box', boxTris([950, 0, -50], [1050, 100, 50]), 'aluminyum');
  const r = analyzeWeight([a, b]);
  near(r.total.kg, 7.85 + 2.68, 1e-9);
  near(r.total.com[0], (7.85 * 0 + 2.68 * 1000) / (7.85 + 2.68), 1e-6);   // 254,5 mm
  near(r.total.com[1], 50, 1e-9);
  assert.deepEqual(r.byMat.map(([k]) => k), [matById('celik').name, matById('aluminyum').name]);
});
t('içi boş profil iskelet: ağırlık iskeletin kendi kesim listesi hesabıyla aynı', () => {
  const p = { ...newPart(1, 'frame', 'add', null), fr: 'table', fw: 1200, fd: 700, fh: 750, fs: 150, pf: 'k40' };
  const c = frameCalc(p);
  const r = analyzeWeight([item('Şase', 'frame', frameTris(p), 'celik', { p })]);
  near(r.total.kg, c.kg, c.kg * 1e-4, 'kesit alanı × boy ile');   // alın birleşimli masa: iki yöntem aynı sonucu vermeli
  assert.equal(r.byCat[0][0], 'Profil');
  // simetrik masa: ağırlık merkezi X = Z = 0
  near(r.total.com[0], 0, 1e-6); near(r.total.com[2], 0, 1e-6);
  assert.ok(r.total.com[1] > 300 && r.total.com[1] < 600, String(r.total.com[1]));
});
t('özel yoğunluk ve geçersiz yoğunluk (uydurma yok)', () => {
  const a = item('Döküm', 'box', boxTris([0, 0, 0], [100, 100, 100]), 'celik', { rho: 7.2, rhoSrc: 'özel' });
  const b = item('Bilinmeyen', 'box', boxTris([200, 0, 0], [300, 100, 100]), 'celik', { rho: NaN });
  const r = analyzeWeight([a, b]);
  near(r.total.kg, 7.2, 1e-9);
  near(r.total.com[0], 50, 1e-9);                             // geçersiz parça merkeze katılmadı
  assert.ok(r.estimate); assert.ok(r.notes.some((n) => n.text.includes('Bilinmeyen') && n.text.includes('KATILMADI')));
  assert.ok(r.byMat[0][0].startsWith('Özel yoğunluk'));
});
t('tahmini işaretleri: CSG ayrımı yapılamayan ve varsayılan malzemeli parçalar', () => {
  const r = analyzeWeight([item('A', 'box', boxTris([0, 0, 0], [10, 10, 10]), 'celik', { exact: false }), item('B', 'box', boxTris([0, 10, 0], [10, 20, 10]), 'celik', { rhoSrc: 'varsayılan' })]);
  assert.ok(r.estimate);
  assert.ok(r.notes.some((n) => n.text.includes('TAHMİNİ'))); assert.ok(r.notes.some((n) => n.text.includes('tek tek seçilmedi')));
});
t('kategoriler: profil, sac, boru, dolu malzeme', () => {
  assert.equal(categoryOf('frame'), 'Profil'); assert.equal(categoryOf('sheet'), 'Sac'); assert.equal(categoryOf('tube'), 'Boru');
  assert.equal(categoryOf('box'), 'Dolu malzeme'); assert.equal(categoryOf('sweep', { prof: 'tube' }), 'Boru'); assert.equal(categoryOf('sweep', { prof: 'circle' }), 'Dolu malzeme');
});
t('denge: masa iskeleti 4 ayakta, yükler eşit, dengede', () => {
  const p = { ...newPart(1, 'frame', 'add', null), fr: 'table', fw: 1200, fd: 700, fh: 750, fs: 150, pf: 'k40' };
  const r = analyzeWeight([item('Şase', 'frame', frameTris(p), 'celik', { p })]);
  const b = r.balance;
  assert.equal(b.status, 'ok'); assert.ok(b.inside); assert.equal(b.feet.length, 4);
  for (const f of b.feet) near(f.kg, r.total.kg / 4, 1e-6);
  near(b.width[0], 1200, 1e-6); near(b.width[1], 700, 1e-6);
  near(b.tipDeg, Math.atan2(350, r.total.com[1]) * 180 / Math.PI, 1e-6);   // en yakın kenar 350 mm
});
t('denge: taşan ağır kol → DEVRİLİR, ince uzun kule → uyarı', () => {
  const base = item('Taban', 'box', boxTris([0, 0, 0], [200, 10, 200]), 'aluminyum');
  const arm = item('Kol', 'box', boxTris([200, 10, 80], [900, 50, 120]), 'celik');    // tabanın dışına 700 mm taşan çelik kol
  const r = analyzeWeight([base, arm]);
  assert.equal(r.balance.status, 'tips'); assert.ok(!r.balance.inside);
  const tower = analyzeWeight([item('Kule', 'box', boxTris([0, 0, 0], [100, 1000, 100]), 'celik')]);
  assert.ok(tower.balance.inside);
  assert.ok(tower.balance.issues.some((s) => s.includes('Uzun ve dar')), JSON.stringify(tower.balance.issues));
  near(tower.balance.tipDeg, Math.atan2(50, 500) * 180 / Math.PI, 1e-6);
  assert.equal(tower.balance.status, 'high');
});
t('denge: köşeye konan ağır yük → ayak yükleri dengesiz, toplam korunur', () => {
  const plate = item('Tabla', 'sheet', boxTris([-500, 100, -500], [500, 110, 500]), 'celik');
  const feet = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sz], i) => item('Ayak ' + (i + 1), 'box', boxTris([sx * 480 - 20, 0, sz * 480 - 20], [sx * 480 + 20, 100, sz * 480 + 20]), 'celik'));
  const load = item('Motor', 'box', boxTris([250, 110, 250], [450, 310, 450]), 'celik');
  const r = analyzeWeight([plate, ...feet, load]);
  const F = r.balance.feet.map((f) => f.kg);
  near(F.reduce((s, v) => s + v, 0), r.total.kg, 1e-6);
  assert.equal(F.length, 4);
  assert.ok(Math.max(...F) > 1.5 * Math.min(...F), F.join(', '));
  // moment dengesi: Σ F·x = M·X
  near(r.balance.feet.reduce((s, f) => s + f.kg * f.c[0], 0), r.total.kg * r.total.com[0], 1e-6);
});
t('destek yükleri: rijit dağılım, negatif yük olmaz', () => {
  const F = supportLoads([[0, 0], [1000, 0], [1000, 1000], [0, 1000]], 900, 900, 100);
  near(F.reduce((s, v) => s + v, 0), 100, 1e-9);
  assert.ok(F.every((f) => f >= 0));
  near(F.reduce((s, f, i) => s + f * [0, 1000, 1000, 0][i], 0), 100 * 900, 1e-6);
  const L = supportLoads([[0, 0], [1000, 0]], 250, 0, 100);    // doğru üzerinde iki destek
  near(L[0], 75, 1e-9); near(L[1], 25, 1e-9);
});
t('çizgi teması: yatık silindir kendi başına durmaz diye raporlanır', () => {
  const tr = [], n = 64, r = 20, L = 300;
  for (let i = 0; i < n; i++) { const a0 = i / n * 2 * Math.PI, a1 = (i + 1) / n * 2 * Math.PI; const P = (a, x) => [x, r + r * Math.sin(a), r * Math.cos(a)]; tr.push(...P(a0, 0), ...P(a1, L), ...P(a1, 0), ...P(a0, 0), ...P(a0, L), ...P(a1, L), 0, r, 0, ...P(a0, 0), ...P(a1, 0), L, r, 0, ...P(a1, L), ...P(a0, L)); }
  const res = analyzeWeight([item('Boru', 'cylinder', Float32Array.from(tr))]);
  assert.equal(res.balance.status, 'line');
  assert.ok(Array.isArray(res.balance.issues) && Array.isArray(res.balance.feet), 'arayüzün kullandığı alanlar var (eksikse ağırlık paneli çöküyordu)');
});
t('kaldırma: masa üst köşelerinden 4 nokta, eşit yük, sapan katsayıları', () => {
  const p = { ...newPart(1, 'frame', 'add', null), fr: 'table', fw: 1200, fd: 700, fh: 750, fs: 150, pf: 'k40' };
  const r = analyzeWeight([item('Şase', 'frame', frameTris(p), 'celik', { p })]);
  const L = r.lift;
  assert.equal(L.points.length, 4); assert.ok(L.inside);
  for (const q of L.points) { near(q.kg, r.total.kg / 4, 1e-6); near(q.y, 750, 1e-6); }
  near(L.legs[0].factor, 1 / Math.sin(Math.PI / 3), 1e-12);    // 60° → 1,155
  near(L.legs[1].factor, Math.SQRT2, 1e-12);                   // 45° → 1,414
  assert.ok(L.notes.some((s) => s.includes('MÜHENDİSLİK')));
  near(r.total.N, r.total.kg * 9.81, 1e-9);
});
t('kaldırma: üstteki küçük motor değil, gövde (tabla) seviyesinden kaldırılır', () => {
  const plate = item('Tabla', 'sheet', boxTris([-600, 740, -350], [600, 750, 350]), 'celik');
  const legs = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sz], i) => item('Ayak ' + i, 'box', boxTris([sx * 580 - 20, 0, sz * 330 - 20], [sx * 580 + 20, 740, sz * 330 + 20]), 'celik'));
  const motor = item('Motor', 'box', boxTris([200, 750, 50], [550, 1050, 330]), 'celik');
  const r = analyzeWeight([plate, ...legs, motor]);
  for (const q of r.lift.points) near(q.y, 750, 1e-6);
  assert.ok(r.lift.aboveParts); assert.ok(r.lift.notes.some((s) => s.includes('üstünde parçalar')));
  assert.ok(r.lift.notes.some((s) => s.includes('yukarıda') && s.includes('dengede')), JSON.stringify(r.lift.notes));   // ağırlık merkezi ~810 mm, 60° kanca çok daha yukarıda
});
t('kaldırma: ağırlık merkezi kaldırma noktaları dışında → uyarı', () => {
  // üst plaka yalnız solda (kaldırma seviyesi orası), ağır blok sağda ve aşağıda
  const plate = item('Üst plaka', 'sheet', boxTris([0, 190, 0], [320, 200, 100]), 'aluminyum');
  const post = item('Dikme', 'box', boxTris([0, 40, 0], [50, 190, 100]), 'aluminyum');
  const heavy = item('Ağır', 'box', boxTris([0, 0, 0], [1000, 40, 100]), 'celik');
  const r = analyzeWeight([plate, post, heavy]);
  near(r.lift.points[0].y, 200, 1e-6);
  assert.ok(!r.lift.inside); assert.ok(r.lift.notes[0].includes('arasında değil'));
});
t('büyük model: 400 parça hızlı', () => {
  const its = [];
  for (let i = 0; i < 400; i++) { const x = (i % 20) * 60, z = Math.floor(i / 20) * 60; its.push(item('P' + i, 'box', boxTris([x, 0, z], [x + 50, 30 + (i % 7) * 10, z + 50]), i % 2 ? 'celik' : 'aluminyum')); }
  const t0 = Date.now(); const r = analyzeWeight(its); const dt = Date.now() - t0;
  console.log('      400 parça: ' + dt + ' ms, ' + r.total.kg.toFixed(1) + ' kg');
  assert.ok(dt < 3000); assert.equal(r.balance.feet.length, 400);
});

for (const [name, fn] of tests) {
  try { await fn(); console.log('ok   ', name); }
  catch (e) { fail++; console.log('FAIL ', name, '\n     ', e.message.split('\n')[0].slice(0, 400)); }
}
console.log(fail ? `\n${fail} test BAŞARISIZ` : '\nTüm testler geçti');
process.exit(fail ? 1 : 0);
