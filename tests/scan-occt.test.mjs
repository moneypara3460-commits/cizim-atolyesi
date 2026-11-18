// Çalıştır: node tests/scan-occt.test.mjs
// Ağdan CAD, GERÇEK OCCT ile gidiş-dönüş: OCCT'de yapılan parça → üçgen ağı (STL gibi; isteğe bağlı döndürme ve tarama
// gürültüsü) → tanıma → uygulama parçaları → yeniden OCCT katısı. Hacim ve (döndürülmemişse) ortak hacim karşılaştırılır:
// delik konumu / ekseni / yönü yanlışsa ortak hacim düşer.
import assert from 'node:assert/strict';
import Module from '../vendor/occt/replicad_single.js';
import { initOCCT } from '../occt.js';
import { runOp } from '../occt-ops.js';
import { prepare } from '../scan/mesh-tools.js';
import { alignToAxes, fitCAD, describe } from '../scan/fit.js';

const K = await initOCCT(Module, { print: () => {}, printErr: () => {} });
let fail = 0;
const t = async (name, fn) => {
  try { await fn(); console.log('ok   ', name); }
  catch (e) { fail++; console.log('FAIL ', name, '\n     ', String(e.message || e).split('\n')[0]); }
};
let seed = 5;
const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
const gauss = () => Math.sqrt(-2 * Math.log(rnd() + 1e-12)) * Math.cos(2 * Math.PI * rnd());

async function meshOf(descs, { rot = null, noise = 0 } = {}) {
  const r = await runOp(K, 'model', { descs }); K.free();
  const { positions: P, index: I } = r.view, tr = new Float32Array(I.length * 3);
  for (let i = 0; i < I.length; i++) for (let k = 0; k < 3; k++) tr[i * 3 + k] = P[I[i] * 3 + k];
  if (rot) for (let i = 0; i < tr.length; i += 3) {
    let [x, y, z] = [tr[i], tr[i + 1], tr[i + 2]];
    [y, z] = [y * Math.cos(rot[0]) - z * Math.sin(rot[0]), y * Math.sin(rot[0]) + z * Math.cos(rot[0])];
    [x, z] = [x * Math.cos(rot[1]) + z * Math.sin(rot[1]), -x * Math.sin(rot[1]) + z * Math.cos(rot[1])];
    tr[i] = x + 13; tr[i + 1] = y - 7; tr[i + 2] = z + 5;
  }
  if (noise) {
    const m = new Map();
    for (let i = 0; i < tr.length; i += 3) {
      const k = tr[i].toFixed(4) + ',' + tr[i + 1].toFixed(4) + ',' + tr[i + 2].toFixed(4);
      let d = m.get(k); if (!d) { d = [gauss() * noise, gauss() * noise, gauss() * noise]; m.set(k, d); }
      tr[i] += d[0]; tr[i + 1] += d[1]; tr[i + 2] += d[2];
    }
  }
  return { tr, vol: r.props.volume };
}
const fitOf = (tr) => fitCAD(alignToAxes(prepare(tr, {}).mesh).mesh);
const shape = (descs) => K.model(descs.map((p) => ({ rx: 0, ry: 0, rz: 0, ...p }))).shape;

const CASES = {
  'Kutu + 3 delik (Y boydan, X boydan, Z… kör)': [{ type: 'box', w: 80, h: 40, l: 60, op: 'add' }, { type: 'cylinder', d: 10, h: 42, x: 20, y: -1, z: 10, op: 'sub' }, { type: 'cylinder', d: 8, h: 82, x: 41, y: 20, z: -15, rz: 90, op: 'sub' }, { type: 'cylinder', d: 6, h: 15, x: -25, y: 26, z: -10, op: 'sub' }, { type: 'cylinder', d: 5, h: 21, x: 10, y: 15, z: -31, rx: 90, op: 'sub' }],
  'Kademeli mil + eksenel delik': [{ type: 'cylinder', d: 40, h: 30, op: 'add' }, { type: 'cylinder', d: 25, h: 50, y: 30, op: 'add' }, { type: 'cylinder', d: 12, h: 82, y: -1, op: 'sub' }],
  'Flanş: 4 bağlantı deliği + göbek deliği': [{ type: 'cylinder', d: 100, h: 12, op: 'add' }, ...[0, 1, 2, 3].map((i) => ({ type: 'cylinder', d: 9, h: 14, x: 38 * Math.cos(i * Math.PI / 2), y: -1, z: 38 * Math.sin(i * Math.PI / 2), op: 'sub' })), { type: 'cylinder', d: 30, h: 14, y: -1, op: 'sub' }],
  'Boru': [{ type: 'tube', d: 50, di: 40, h: 100, op: 'add' }],
};
const pos = (d) => d.map((p) => ({ x: 0, y: 0, z: 0, ...p }));

for (const [name, d0] of Object.entries(CASES)) {
  const d = pos(d0);
  await t(name + ': tanınır, aynı katı (ortak hacim ≥ %99,5)', async () => {
    const { tr, vol } = await meshOf(d);
    const r = fitOf(tr);
    assert.ok(r.ok, r.reason);
    const A = shape(d), B = shape(r.parts);
    const vB = K.volume(B), vC = K.volume(K.common(A, B));
    K.free();
    assert.ok(Math.abs(vB - vol) / vol < 0.005, 'hacim ' + vB + ' / ' + vol + ' · ' + describe(r));
    assert.ok(vC / vol > 0.995, 'ortak hacim %' + (100 * vC / vol).toFixed(2) + ' · ' + describe(r));
  });
  await t(name + ': eğik duran ve gürültülü (σ 0,05 mm) taramadan da tanınır, hacim %2 içinde', async () => {
    const { tr, vol } = await meshOf(d, { rot: [0.4, 0.9], noise: 0.05 });
    const r = fitOf(tr);
    assert.ok(r.ok, r.reason);
    const vB = K.volume(shape(r.parts)); K.free();
    const subs = d.filter((p) => p.op === 'sub').length, want = subs - (r.kind === 'boru' && subs ? 1 : 0);
    assert.equal(r.holes, want, 'delik sayısı · ' + describe(r));
    assert.ok(Math.abs(vB - vol) / vol < 0.02, 'hacim ' + vB.toFixed(0) + ' / ' + vol.toFixed(0) + ' · ' + describe(r));
  });
}

await t('Yuvarlatılmış kutu: CAD üretilmez (yuvarlama tanınmıyor), ağ olarak önerilir', async () => {
  const { tr } = await meshOf(pos([{ type: 'box', w: 50, h: 30, l: 40, r: 6, op: 'add' }]));
  const r = fitOf(tr);
  assert.equal(r.ok, false);
  assert.match(r.reason, /ağ olarak/);
});

console.log(fail ? `\n${fail} test BAŞARISIZ` : '\nTüm testler geçti');
process.exit(fail ? 1 : 0);
