// Çalıştır: node tests/occt-delik.test.mjs
// Delik sihirbazının ürettiği kesiciler GERÇEK Open CASCADE (WebAssembly) ile kutudan çıkarılır; hacim kesin formülle,
// kesit (yarıçap / derinlik) B-Rep kenarlarından denetlenir.
import assert from 'node:assert/strict';
import Module from '../vendor/occt/replicad_single.js';
import { initOCCT } from '../occt.js';
import { runOp } from '../occt-ops.js';
import * as D from '../delik.js';

const K = await initOCCT(Module, { print: () => {}, printErr: () => {} });
const op = async (name, args) => { try { return await runOp(K, name, args, {}); } finally { K.free(); } };
let fail = 0;
const t = async (name, fn) => {
  try { await fn(); console.log('ok   ', name); }
  catch (e) { fail++; console.log('FAIL ', name, '\n     ', String(e.message || e).split('\n').slice(0, 4).join(' / ')); }
};
const near = (a, b, tol, m = '') => assert.ok(Math.abs(a - b) <= tol, `${m} ${a} ≉ ${b} (±${tol})`);
const PI = Math.PI;
const W = 60, H = 30;

// uygulamadaki gibi: kutunun üst yüzü (normal +Y) ortasına delik; uç konisi içeri bakar (rx = 180°)
function descs(k, x = 0, z = 0) {
  const out = [{ type: 'box', w: W, h: H, l: W }];
  for (const s of k.segs) {
    const h = s.top - s.bottom;
    if (s.kind === 'cyl') out.push({ type: 'cylinder', d: s.d, h, x, y: H + s.bottom, z, op: 'sub' });
    else if (s.rol === 'uc') out.push({ type: 'cone', d: s.dTop, d2: 0, h, x, y: H + s.top, z, rx: 180, op: 'sub' });
    else out.push({ type: 'cone', d: s.dBottom, d2: s.dTop, h, x, y: H + s.bottom, z, op: 'sub' });
  }
  return out;
}
function exact(k) {
  const L = -Math.min(...k.segs.filter((s) => s.rol === 'govde').map((s) => s.bottom)), r = k.d / 2;
  let v = PI * r * r * Math.min(L, H);
  for (const s of k.segs) {
    if (s.rol === 'uc') v += PI * r * r * (s.top - s.bottom) / 3;
    if (s.rol === 'kademe') v += PI * (s.d * s.d / 4 - r * r) * -s.bottom;
    if (s.rol === 'havsa') { const tt = -s.bottom, R = r + tt; v += PI * tt / 3 * (R * R + R * r + r * r) - PI * r * r * tt; }
  }
  return v;
}
const CASES = [
  ['M8 kılavuz kör 20 (118° uç)', { tur: 'klavuz', olcu: 'M8', derinlik: 20 }],
  ['M10×1,25 kılavuz boydan boya', { tur: 'klavuz', olcu: 'M10', adim: 1.25, boydan: true }],
  ['M6 düz geçiş, ince seri, uçsuz 15', { tur: 'duz', olcu: 'M6', seri: 'ince', derinlik: 15, uc: false }],
  ['M6 kademeli (ISO 4762) kör 25', { tur: 'kademe', olcu: 'M6', derinlik: 25 }],
  ['M8 kademeli boydan boya', { tur: 'kademe', olcu: 'M8', boydan: true }],
  ['M5 havşa ISO 15065 kör 12', { tur: 'havsa', olcu: 'M5', derinlik: 12 }],
  ['M8 havşa ISO 10642 boydan boya', { tur: 'havsa', havsaStd: 'iso10642', olcu: 'M8', boydan: true }],
];
for (const [name, o] of CASES) {
  await t(name + ': geçerli tek katı, hacim kesin', async () => {
    const k = D.delikKesiti(o, H + 2);
    assert.ok(!k.hata, k.hata);
    const r = await op('model', { descs: descs(k) });
    assert.ok(r.check.valid && r.check.solids === 1, 'geçerli katı');
    near(r.check.volume, W * H * W - exact(k), 1e-3 * exact(k) + 0.05, 'hacim');
  });
}

await t('kılavuz deliğin B-Rep kenarı: ağız çapı = matkap 6,8 (M8), dairesel', async () => {
  const k = D.delikKesiti({ tur: 'klavuz', olcu: 'M8', derinlik: 20 }, H + 2);
  const { edges } = await op('edges', { descs: descs(k) });
  const mouth = edges.find((e) => e.type === 'Circle' && Math.abs(e.mid[1] - H) < 1e-6);
  assert.ok(mouth, 'ağız kenarı');
  near(mouth.len, PI * 6.8, 1e-6, 'çevre');
});

await t('havşa: yüzeydeki çap ISO 15065 D_c (M5 10,65), 90° koni', async () => {
  const k = D.delikKesiti({ tur: 'havsa', olcu: 'M5', derinlik: 12 }, H + 2);
  const { edges } = await op('edges', { descs: descs(k) });
  const top = edges.filter((e) => e.type === 'Circle' && Math.abs(e.mid[1] - H) < 1e-6);
  assert.equal(top.length, 1);
  near(top[0].len, PI * 10.65, 1e-6, 'havşa ağzı');
  // havşanın geçiş deliğine indiği daire (90° → derinlik = yarıçap farkı); dikiş yerlerinde yaylara bölünebilir
  const low = edges.filter((e) => e.type === 'Circle' && Math.abs(e.mid[1] - (H - (10.65 - 5.5) / 2)) < 1e-6);
  assert.ok(low.length >= 1, 'alt daire');
  near(low.reduce((a, e) => a + e.len, 0), PI * 5.5, 1e-6);
});

await t('desen: üç kılavuz deliği tek katıda, hacim üç katı', async () => {
  const k = D.delikKesiti({ tur: 'klavuz', olcu: 'M6', derinlik: 15 }, H + 2);
  const ds = [descs(k, -15, 0), descs(k, 0, 0).slice(1), descs(k, 15, 0).slice(1)].flat();
  const r = await op('model', { descs: ds });
  assert.ok(r.check.valid && r.check.solids === 1);
  near(r.check.volume, W * H * W - 3 * exact(k), 3e-3 * exact(k));
});

console.log(fail ? `\n${fail} test başarısız` : '\nhepsi geçti');
process.exit(fail ? 1 : 0);
