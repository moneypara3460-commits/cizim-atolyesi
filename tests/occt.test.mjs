// Çalıştır: node tests/occt.test.mjs
// GERÇEK Open CASCADE (OCCT, WebAssembly) çekirdeğiyle: katı, Boolean, yuvarlama / pah, STEP, IGES, doğrulama,
// Three.js görüntü verisi ve uygulamanın yerleştirme (konum / döndürme) kuralı. Tarayıcıdaki işçinin kullandığı
// occt-ops.js aynen çalıştırılır.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import Module from '../vendor/occt/replicad_single.js';
import { initOCCT } from '../occt.js';
import { runOp } from '../occt-ops.js';
import { rotXYZ } from '../logic.js';

const require = createRequire(import.meta.url);
const K = await initOCCT(Module, { print: () => {}, printErr: () => {} });
let IG = null;
const ctx = { iges: async () => (IG ||= await require('../vendor/occt-import/occt-import-js.js')({ print: () => {}, printErr: () => {} })) };
const op = async (name, args) => { try { return await runOp(K, name, args, ctx); } finally { K.free(); } };

let fail = 0;
const t = async (name, fn) => {
  try { await fn(); console.log('ok   ', name); }
  catch (e) { fail++; console.log('FAIL ', name, '\n     ', String(e.message || e).split('\n').slice(0, 4).join(' / ')); }
};
const near = (a, b, tol, m = '') => assert.ok(Math.abs(a - b) <= tol, `${m} ${a} ≉ ${b} (±${tol})`);
const PI = Math.PI;
const box = (w, h, l, o = {}) => ({ type: 'box', w, h, l, ...o });
const cyl = (d, h, o = {}) => ({ type: 'cylinder', d, h, ...o });

await t('OCCT yüklenir (WebAssembly)', async () => {
  const r = await op('init', {});
  assert.ok(r.loadMs >= 0);
  assert.equal(typeof K.oc.BRepAlgoAPI_Fuse, 'function');
});

await t('1) basit katı: kutu, silindir, küre, koni, boru — hacim ve doğrulama', async () => {
  for (const [d, v] of [[box(10, 20, 30), 6000], [cyl(10, 20), PI * 25 * 20], [{ type: 'sphere', d: 10 }, 4 / 3 * PI * 125],
    [{ type: 'cone', d: 10, d2: 4, h: 20 }, PI * 20 / 3 * (25 + 10 + 4)], [{ type: 'tube', d: 20, di: 10, h: 10 }, PI * (100 - 25) * 10]]) {
    const r = await op('model', { descs: [d] });
    assert.ok(r.check.valid && r.check.solids === 1, d.type + ' geçerli');
    near(r.check.volume, v, v * 1e-6, d.type);
  }
  const r = await op('model', { descs: [box(10, 20, 30)] });
  assert.equal(r.check.faces, 6); assert.equal(r.check.edges, 12); assert.equal(r.check.vertices, 8);
});

await t('2) birleştirme (fuse): hacim = A + B − ortak', async () => {
  const A = box(40, 10, 40), B = cyl(10, 30, { y: -10 });
  const r = await op('bool', { a: A, b: B, op: 'fuse' });
  near(r.check.volume, 16000 + PI * 25 * 30 - PI * 25 * 10, 1e-6 * 20000);
  assert.ok(r.check.valid); assert.equal(r.check.solids, 1);
  assert.ok(r.part.brep && r.part.brep.length > 100, 'B-Rep metni');
});

await t('3) çıkarma (cut): delikli plaka', async () => {
  const r = await op('bool', { a: box(40, 10, 40), b: cyl(10, 30, { y: -10 }), op: 'cut' });
  near(r.check.volume, 16000 - PI * 25 * 10, 1e-3);
  assert.deepEqual(r.cam.faceTypes, { Plane: 6, Cylinder: 1 });
  assert.deepEqual(r.cam.edgeTypes, { Line: 13, Circle: 2 });   // 12 kutu kenarı + silindir dikişi, 2 daire
  assert.equal(r.cam.cylinders.length, 1); near(r.cam.cylinders[0].d, 10, 1e-9);
  assert.equal(Math.abs(r.cam.cylinders[0].axis[1]), 1, 'delik ekseni dikey');
});

await t('4) kesişim (common)', async () => {
  const r = await op('bool', { a: box(40, 10, 40), b: cyl(10, 30, { y: -10 }), op: 'common' });
  near(r.check.volume, PI * 25 * 10, 1e-6);
  await assert.rejects(op('bool', { a: box(10, 10, 10), b: box(10, 10, 10, { x: 100 }), op: 'common' }), /kesişmiyor/);
});

await t('5) yuvarlama (fillet) ve pah (chamfer): kapalı formülle', async () => {
  const a = 10, b = 20, c = 30, r = 2;
  const vF = a * b * c - (4 - PI) * r * r * (a + b + c - 6 * r) - (8 - 4 / 3 * PI) * r * r * r;
  const f = await op('edge', { desc: box(a, b, c), kind: 'fillet', r, which: 'all' });
  near(f.check.volume, vF, 1e-4); assert.ok(f.check.valid);
  // dikey 4 kenara 2 mm pah: her biri ½·2·2·h
  const ch = await op('edge', { desc: box(a, b, c), kind: 'chamfer', r: 2, which: 'vertical' });
  near(ch.check.volume, a * b * c - 4 * 0.5 * 4 * b, 1e-6);
  // silindir üst kenarına yuvarlama
  const top = await op('edge', { desc: cyl(20, 10), kind: 'fillet', r: 2, which: 'top' });
  // kaldırılan halka: kesit alanı r²(1−π/4), ağırlık merkezi duvardan x̄ içeride (Pappus)
  const Ar = r * r * (1 - PI / 4), xb = (r ** 3 / 2 - (PI * r * r / 4) * (r - 4 * r / (3 * PI))) / Ar;
  near(top.check.volume, PI * 100 * 10 - 2 * PI * (10 - xb) * Ar, 1e-3, 'Pappus');
  assert.ok(top.check.valid);
  assert.ok(top.cam.faceTypes.Torus >= 1, 'yuvarlama yüzü torus');
  // çok büyük yarıçap: anlaşılır hata
  await assert.rejects(op('edge', { desc: box(10, 10, 10), kind: 'fillet', r: 6, which: 'all' }));
});

await t('6) STEP dışa → içe: aynı hacim, aynı yüz türleri', async () => {
  const descs = [box(40, 10, 40), { ...cyl(10, 30, { y: -10 }), op: 'sub' }, { ...box(10, 10, 10, { x: 25, r: 1 }) }];
  const m = await op('model', { descs });
  const s = await op('step-out', { descs });
  assert.match(s.text, /^ISO-10303-21;/); assert.match(s.text, /MANIFOLD_SOLID_BREP|ADVANCED_BREP/);
  const r = await op('step-in', { text: s.text });
  near(r.check.volume, m.check.volume, 1e-6 * m.check.volume);
  assert.deepEqual(r.cam.faceTypes, m.cam.faceTypes);
  assert.ok(r.check.valid);
});

await t('7) IGES içe aktarma (10 mm küp, Autodesk Inventor dosyası)', async () => {
  const bytes = new Uint8Array(fs.readFileSync(new URL('./fixtures/cube-10mm.igs', import.meta.url)));
  const r = await op('iges-in', { bytes });
  assert.ok(r.part && r.part.tris.pos.length === 12 * 9, 'üçgen sayısı');
  near(r.check.volume, 1000, 1e-6); assert.ok(r.check.valid);
  near(r.part.h, 10, 1e-6);
});

await t('7b) IGES dışa aktarma: bu derlemede YOK (açıkça hata vermeli değil, sunulmuyor)', async () => {
  assert.equal(typeof K.oc.IGESControl_Writer, 'undefined');
});

await t('8) Three.js görüntü verisi: dizinler geçerli, yüz grupları tüm üçgenleri kapsar, kutu sınırları tutar', async () => {
  const r = await op('model', { descs: [box(40, 10, 40), { ...cyl(10, 30, { y: -10 }), op: 'sub' }] });
  const v = r.view, nv = v.positions.length / 3;
  assert.ok(v.index.length % 3 === 0 && v.index.length > 0);
  for (const i of v.index) assert.ok(i < nv);
  assert.equal(v.normals.length, v.positions.length);
  let cover = 0; for (const g of v.groups) cover += g.count;
  assert.equal(cover, v.index.length); assert.equal(v.groups.length, 7);
  const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < v.positions.length; i += 3) for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], v.positions[i + k]); mx[k] = Math.max(mx[k], v.positions[i + k]); }
  for (let k = 0; k < 3; k++) { near(mn[k], r.props.bbox.min[k], 1e-3); near(mx[k], r.props.bbox.max[k], 1e-3); }
  assert.ok(v.lines.length >= 6 * 12, 'kenar çizgileri');
  // ağdan hesaplanan hacim B-Rep hacmine yakın (ağ doğru yönlü ve kapalı)
  let vol = 0; const P = v.positions, I = v.index;
  for (let i = 0; i < I.length; i += 3) { const a = I[i] * 3, b = I[i + 1] * 3, c = I[i + 2] * 3; vol += (P[a] * (P[b + 1] * P[c + 2] - P[b + 2] * P[c + 1]) - P[a + 1] * (P[b] * P[c + 2] - P[b + 2] * P[c]) + P[a + 2] * (P[b] * P[c + 1] - P[b + 1] * P[c])) / 6; }
  near(Math.abs(vol), r.check.volume, r.check.volume * 0.01);
});

await t('yerleştirme uygulamayla aynı: Euler XYZ + konum (app.js place / logic rotXYZ)', async () => {
  const d = box(10, 20, 30, { x: 5, y: 7, z: -3, rx: 30, ry: 45, rz: 60 });
  const r = await op('model', { descs: [d] });
  const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
  for (const sx of [-5, 5]) for (const sy of [0, 20]) for (const sz of [-15, 15]) {
    const q = rotXYZ([sx, sy, sz], 30, 45, 60).map((v, k) => v + [5, 7, -3][k]);
    for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], q[k]); mx[k] = Math.max(mx[k], q[k]); }
  }
  for (let k = 0; k < 3; k++) { near(r.props.bbox.min[k], mn[k], 1e-4, 'min' + k); near(r.props.bbox.max[k], mx[k], 1e-4, 'max' + k); }
});

await t('uygulama sırası: taban + birleşen + oyuk; OCCT parçası (B-Rep) taşınınca yeniden kullanılır', async () => {
  const f = await op('edge', { desc: box(20, 10, 20), kind: 'fillet', r: 2, which: 'vertical' });
  const brepPart = { type: 'brep', brep: f.part.brep, x: 100, y: 0, z: 0 };
  const m = await op('model', { descs: [brepPart] });
  near(m.check.volume, f.check.volume, 1e-6);
  near((m.props.bbox.min[0] + m.props.bbox.max[0]) / 2, 100, 1e-6);
  near(m.props.bbox.min[1], 0, 1e-6);
});

await t('üçgen ağdan katı (kroki / süpürme gibi parçalar): kapalı ağ → geçerli katı', async () => {
  // 32 kenarlı prizma (silindir benzeri ağ)
  const n = 32, R = 10, H = 5, tri = [];
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * 2 * PI, a1 = ((i + 1) / n) * 2 * PI;
    const p0 = [R * Math.cos(a0), R * Math.sin(a0)], p1 = [R * Math.cos(a1), R * Math.sin(a1)];
    tri.push(0, 0, 0, p1[0], 0, p1[1], p0[0], 0, p0[1]);
    tri.push(0, H, 0, p0[0], H, p0[1], p1[0], H, p1[1]);
    tri.push(p0[0], 0, p0[1], p1[0], 0, p1[1], p1[0], H, p1[1]);
    tri.push(p0[0], 0, p0[1], p1[0], H, p1[1], p0[0], H, p0[1]);
  }
  const r = await op('model', { descs: [{ type: 'tris', pos: new Float32Array(tri) }] });
  assert.ok(r.check.valid && r.check.solids === 1);
  near(r.check.volume, 0.5 * n * R * R * Math.sin(2 * PI / n) * H, 1e-3);
});

await t('bozuk / açık ağ: doğrulama sorunu bildirir', async () => {
  const open = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 1, 1, 0, 0]);   // kapalı olmayan iki üçgen
  await assert.rejects(op('model', { descs: [{ type: 'tris', pos: open }] }));
});

await t('9) eski projeler: parça listesinde OCCT alanı yoksa bile tanımlar kurulur (geri uyum)', async () => {
  // eski kayıttaki gibi alanları eksik / metin olan parça
  const r = await op('model', { descs: [{ type: 'box', w: '10', h: '20', l: '30', r: undefined, c: null }] });
  near(r.check.volume, 6000, 1e-6);
});

console.log(fail ? `\n${fail} test BAŞARISIZ` : '\nTüm testler geçti');
process.exit(fail ? 1 : 0);
