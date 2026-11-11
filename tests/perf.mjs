// Ağır hesapların süre ve bellek ölçümü (Node, tek iş parçacığı): node tests/perf.mjs
// Sonuçlar makineye bağlıdır; telefonda genellikle 3–6 kat yavaştır. Çıktı: reports/perf.json
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rows = [];
async function measure(name, fn, size) {
  global.gc?.();
  const h0 = process.memoryUsage().heapUsed, t0 = performance.now();
  let peak = h0; const iv = setInterval(() => { peak = Math.max(peak, process.memoryUsage().heapUsed); }, 5);
  let note = '';
  try { note = (await fn()) || ''; } catch (e) { note = 'HATA: ' + e.message; }
  clearInterval(iv); peak = Math.max(peak, process.memoryUsage().heapUsed);
  const ms = performance.now() - t0;
  rows.push({ name, size, ms: Math.round(ms), heapMB: +((peak - h0) / 1048576).toFixed(1), note });
  console.log(`${name.padEnd(46)} ${String(Math.round(ms)).padStart(7)} ms  +${((peak - h0) / 1048576).toFixed(1).padStart(6)} MB  ${size}  ${note}`);
}
const imp = (f) => import(path.join(ROOT, f));

function boxTris(min, max) { const [x0, y0, z0] = min, [x1, y1, z1] = max; const v = [[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0], [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]]; const f = [[0, 2, 1], [0, 3, 2], [4, 5, 6], [4, 6, 7], [0, 1, 5], [0, 5, 4], [3, 7, 6], [3, 6, 2], [0, 4, 7], [0, 7, 3], [1, 2, 6], [1, 6, 5]]; return Float32Array.from(f.flatMap((q) => q.flatMap((i) => v[i]))); }

// FEM — ankastre kiriş 200×20×20, F = 1000 N, ağ yoğunluğuna göre (uygulamadaki runFEM hattı)
const F = await imp('fea.js'), X = await imp('fea2.js'), { runFEM } = await imp('fem-run.js');
const steel = X.solverMat(X.libraryMaterials().find((m) => /çelik|steel/i.test(m.name + m.id)));
const ex = 1000 * 200 ** 3 / (3 * 210000 * (20 * 20 ** 3 / 12));
for (const [lbl, target] of [['kaba', 3000], ['orta', 10000], ['ince', 30000], ['çok ince', 80000]]) {
  await measure('FEM statik kiriş (' + lbl + ')', () => {
    const r = runFEM(F, X, { type: 'static', items: [{ id: 1, name: 'kiriş', tris: boxTris([0, 0, 0], [200, 20, 20]), mat: 0 }], mats: [steel], target, setup: { supports: [{ face: '-x' }], loads: [{ type: 'force', sel: { face: '+x' }, F: 1000, dir: [0, -1, 0] }] } });
    if (r.error) return 'HATA: ' + r.text;
    const u = r.res?.maxU;
    return `${r.mesh.elements ?? r.mesh.ne ?? ''} eleman` + (u ? ` · sehim ${u.toFixed(4)} mm (analitik ${ex.toFixed(4)})` : '');
  }, 'hedef ' + target);
}
// 4/5 eksen CAM — plan + çarpışma + simülasyon (testlerdeki deterministik işler)
const K5 = await imp('kin.js'), C5 = await imp('cam5.js'), CO = await imp('coll5.js');
const TOOLS = [{ id: 1, n: 1, type: 'flat', d: 6, flute: 20, stickout: 40, holder: { d: 30, len: 60 }, rpm: 8000, feed: 800, plunge: 250 }, { id: 2, n: 2, type: 'ball', d: 6, flute: 20, stickout: 45, holder: { d: 30, len: 60 }, rpm: 9000, feed: 1000, plunge: 300 }];
const M = (k) => JSON.parse(JSON.stringify(K5.MACHINES[k]));
const jobs = [
  ['4 eksen indeksli (60×20×20)', { tris: boxTris([0, 10, 0], [60, 20, 20]), machine: M('vmc4A'), tools: TOOLS, spindle: { d: 60, len: 100 }, setup: {}, ops: [{ type: 'index4', tool: 1, finishTool: 2, sub: ['rough', 'walls'], angles: [0, 90, 180, 270] }] }],
  ['3+2 (40×20×30, 2 yön)', { tris: boxTris([0, 10, 0], [40, 20, 30]), machine: M('tt_AC'), tools: TOOLS, spindle: { d: 60, len: 100 }, setup: { stockBottom: 12, clampH: 4 }, ops: [{ type: 'p32', tool: 1, finishTool: 2, sub: ['rough', 'walls'], dirs: [[0, 0, 1], [0.5, 0, Math.sqrt(3) / 2]], maxDepth: 8 }] }],
];
for (const [n, job] of jobs) {
  let R;
  await measure('CAM ' + n + ' · plan', () => { R = C5.plan5(job); return R.moves?.length ? R.moves.length + ' hareket' : ''; }, '');
  await measure('CAM ' + n + ' · çarpışma', () => { const s = CO.checkCollisions(R, job); return (s.collisions?.length ?? s.hits?.length ?? 0) + ' çarpışma'; }, '');
  await measure('CAM ' + n + ' · malzeme simülasyonu', () => { CO.simulate5(R, job); return ''; }, '');
}
// 3 eksen CAM
const C3 = await imp('cam.js');
await measure('CAM 3 eksen kaba (30×20×10)', () => { const R = C3.plan({ tris: boxTris([0, 0, 0], [30, 10, 20]), tools: [{ id: 1, n: 1, type: 'flat', d: 6, flute: 20, rpm: 8000, feed: 800, plunge: 200 }], ops: [{ type: 'rough', on: true, tool: 1 }], stock: { side: 2, top: 1, bottom: 0 } }); void R; return ''; }, '');
// OCCT (gerçek WASM)
const { default: Module } = await imp('vendor/occt/replicad_single.js');
const { initOCCT } = await imp('occt.js'), { runOp } = await imp('occt-ops.js');
let K;
await measure('OCCT WASM yükleme (Node)', async () => { K = await initOCCT(Module, { print: () => {}, printErr: () => {} }); return ''; }, '—');
const op = async (n, a) => { try { return await runOp(K, n, a, {}); } finally { K.free(); } };
await measure('OCCT kutu − silindir modeli + doğrulama + ağ', async () => { const r = await op('model', { descs: [{ type: 'box', w: 80, h: 30, l: 60 }, { type: 'cylinder', d: 20, h: 40, hole: true }] }); return r.check?.valid ? 'geçerli' : 'geçersiz'; }, '2 parça');
await measure('OCCT tüm kenar yuvarlama R2', async () => { const r = await op('edge', { desc: { type: 'box', w: 80, h: 30, l: 60 }, kind: 'fillet', r: 2, which: 'all' }); return r.check?.valid ? 'geçerli' : 'geçersiz'; }, '');
await measure('OCCT STEP yazma', async () => { const r = await op('step-out', { descs: [{ type: 'box', w: 80, h: 30, l: 60, r: 3 }] }); return (r.text.length / 1024).toFixed(0) + ' kB'; }, '');
fs.mkdirSync(path.join(ROOT, 'reports'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'reports/perf.json'), JSON.stringify({ at: new Date().toISOString(), node: process.version, cpu: (await import('node:os')).cpus()[0]?.model, rows }, null, 1));
