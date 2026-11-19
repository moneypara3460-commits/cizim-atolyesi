// Çalıştır: node tests/occt-kenar.test.mjs
// Kenar sekmesi (her şekle tek tek kenar yuvarlama / pah) — GERÇEK Open CASCADE (WebAssembly) ile.
// Tarayıcıdaki işçinin kullandığı occt-ops.js 'edges' ve 'edge-sel' işlemleri aynen çalıştırılır; hacimler elle
// hesaplanan kesin değerlerle karşılaştırılır.
import assert from 'node:assert/strict';
import Module from '../vendor/occt/replicad_single.js';
import { initOCCT } from '../occt.js';
import { runOp } from '../occt-ops.js';

const K = await initOCCT(Module, { print: () => {}, printErr: () => {} });
const op = async (name, args) => { try { return await runOp(K, name, args, {}); } finally { K.free(); } };

let fail = 0;
const t = async (name, fn) => {
  try { await fn(); console.log('ok   ', name); }
  catch (e) { fail++; console.log('FAIL ', name, '\n     ', String(e.message || e).split('\n').slice(0, 4).join(' / ')); }
};
const near = (a, b, tol, m = '') => assert.ok(Math.abs(a - b) <= tol, `${m} ${a} ≉ ${b} (±${tol})`);
const PI = Math.PI;
const box = (w, h, l, o = {}) => ({ type: 'box', w, h, l, ...o });
const cyl = (d, h, o = {}) => ({ type: 'cylinder', d, h, ...o });
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
// en yakın kenar (orta noktasına göre)
const pickAt = (edges, p, type) => {
  let best = null, bd = Infinity;
  for (const e of edges) { if (type && e.type !== type) continue; const d = dist(e.mid, p); if (d < bd) { bd = d; best = e; } }
  return best;
};
const sel = async (descs, picks, kind, r) => op('edge-sel', { descs, picks: picks.map(({ mid, type }) => ({ mid, type })), kind, r });
// yuvarlamanın kestiği köşe parçası (r yarıçaplı çeyrek dairenin dışı): alan ve köşeden ağırlık merkezi uzaklığı
const SPAN_A = (r) => (1 - PI / 4) * r * r;
const SPAN_X = (r) => (r * r * (r / 2) - (PI * r * r / 4) * (r - (4 * r) / (3 * PI))) / SPAN_A(r);

await t('1) kutu: 12 kenar listelenir, tek kenar yuvarlama hacmi V − (1 − π/4)·r²·L', async () => {
  const D = [box(80, 40, 60)];
  const { edges } = await op('edges', { descs: D });
  assert.equal(edges.length, 12);
  assert.ok(edges.every((e) => e.type === 'Line'));
  const e = pickAt(edges, [0, 40, 30]);
  near(e.len, 80, 1e-6, 'kenar boyu');
  const r = await sel(D, [e], 'fillet', 5);
  assert.ok(r.check.valid && r.check.solids === 1, 'geçerli tek katı');
  near(r.check.volume, 80 * 40 * 60 - SPAN_A(5) * 80, 1e-3, 'hacim');
  assert.equal(r.n, 1);
  assert.ok(r.part && r.part.brep, 'sonuç parça (B-Rep) olarak döner');
});

await t('2) kutu: iki ayrı kenara pah — her biri c²/2·L', async () => {
  const D = [box(80, 40, 60)];
  const { edges } = await op('edges', { descs: D });
  const a = pickAt(edges, [0, 40, 30]), b = pickAt(edges, [0, 0, -30]);
  const r = await sel(D, [a, b], 'chamfer', 3);
  assert.ok(r.check.valid);
  near(r.check.volume, 80 * 40 * 60 - 2 * (9 / 2) * 80, 1e-3);
  assert.equal(r.n, 2);
});

await t('3) birleşen köşe: üst ön ve üst sağ kenar birlikte yuvarlanır (köşe yumuşak, geçerli katı)', async () => {
  const D = [box(80, 40, 60)];
  const { edges } = await op('edges', { descs: D });
  const a = pickAt(edges, [0, 40, 30]), b = pickAt(edges, [40, 40, 0]);
  const r = await sel(D, [a, b], 'fillet', 4);
  assert.ok(r.check.valid && r.check.solids === 1);
  // iki kenar şeridi + köşede küre parçası: hacim, iki kenarın ayrı ayrı kestiğinin toplamından biraz farklı olmalı
  const v2 = 80 * 40 * 60 - SPAN_A(4) * (80 + 60);
  assert.ok(Math.abs(r.check.volume - v2) < 0.02 * SPAN_A(4) * 140, 'hacim ' + r.check.volume + ' ~ ' + v2);
  assert.ok(r.check.faces > 6, 'yuvarlama yüzleri eklendi');
});

await t('4) oyukla oluşan kenar: deliğin ağzına pah — Pappus 2π(R + c/3)·c²/2', async () => {
  const D = [box(60, 20, 60), cyl(20, 20, { op: 'sub' })];
  const { edges } = await op('edges', { descs: D });
  const circ = edges.filter((e) => e.type === 'Circle');
  assert.equal(circ.length, 2, 'deliğin iki ağzı (dikiş kenarı gösterilmez): ' + edges.map((e) => e.type).join(','));
  const top = circ.find((e) => Math.abs(e.mid[1] - 20) < 1e-6);
  near(top.len, PI * 20, 1e-6, 'ağız çevresi (kesin)');
  const r = await sel(D, [top], 'chamfer', 2);
  assert.ok(r.check.valid);
  const v0 = 60 * 20 * 60 - PI * 100 * 20;
  near(r.check.volume, v0 - 2 * PI * (10 + 2 / 3) * 2, 1e-2);
});

await t('5) silindir: üst dairesel kenar yuvarlama — Pappus; pah — 2π(R − c/3)·c²/2', async () => {
  const D = [cyl(50, 30)];
  const { edges } = await op('edges', { descs: D });
  assert.equal(edges.length, 2, 'yalnız iki daire (dikiş yok): ' + edges.map((e) => e.type).join(','));
  const top = edges.find((e) => Math.abs(e.mid[1] - 30) < 1e-6);
  const v0 = PI * 625 * 30;
  const f = await sel(D, [top], 'fillet', 3);
  assert.ok(f.check.valid);
  near(f.check.volume, v0 - 2 * PI * (25 - SPAN_X(3)) * SPAN_A(3), 1e-2, 'yuvarlama');
  const c = await sel(D, [top], 'chamfer', 2);
  near(c.check.volume, v0 - 2 * PI * (25 - 2 / 3) * 2, 1e-2, 'pah');
});

await t('6) dikiş ve yozlaşmış kenarlar ayıklanır: küre kenarsız, boru 4 daire', async () => {
  const s = await op('edges', { descs: [{ type: 'sphere', d: 30 }] });
  assert.equal(s.edges.length, 0);
  const b = await op('edges', { descs: [{ type: 'tube', d: 40, di: 20, h: 10 }] });
  assert.equal(b.edges.length, 4);
  assert.ok(b.edges.every((e) => e.type === 'Circle'));
});

// L profil (x: 0…40, y: 0…30, kol kalınlığı 10), z: 0…20 boyunca çekilmiş, dışa bakan üçgenler
function lPrismTris() {
  const P = [[0, 0], [40, 0], [40, 10], [10, 10], [10, 30], [0, 30]], H = 20, T = [];
  const v = (p, z) => [p[0], p[1], z];
  const tri = (a, b, c) => T.push(...a, ...b, ...c);
  // alt kapak (z = 0, normal −z) ve üst kapak (z = H, normal +z): içbükey profil elle üçgenlenir
  const caps = [[0, 1, 2], [0, 2, 3], [0, 3, 4], [0, 4, 5]];
  for (const [a, b, c] of caps) { tri(v(P[a], 0), v(P[c], 0), v(P[b], 0)); tri(v(P[a], H), v(P[b], H), v(P[c], H)); }
  // yan yüzler (profil saat yönünün tersine → dışa normal)
  for (let i = 0; i < P.length; i++) {
    const a = P[i], b = P[(i + 1) % P.length];
    tri(v(a, 0), v(b, 0), v(b, H)); tri(v(a, 0), v(b, H), v(a, H));
  }
  return T;
}
await t('7) üçgen ağından gelen parça: düz yüz köşegenleri kenar sayılmaz (18 kenar); iç köşe dolgusu +(1 − π/4)·r²·L', async () => {
  const D = [{ type: 'tris', pos: lPrismTris() }];
  const { edges, skipped } = await op('edges', { descs: D });
  assert.equal(skipped.length, 0);
  assert.equal(edges.length, 18, 'L prizmanın gerçek kenarları: ' + edges.length);
  const inner = pickAt(edges, [10, 10, 10]);
  near(inner.len, 20, 1e-6, 'iç köşe kenarı z boyunca');
  const r = await sel(D, [inner], 'fillet', 2);
  assert.ok(r.check.valid && r.check.solids === 1);
  const v0 = (40 * 10 + 10 * 20) * 20;
  near(r.check.volume, v0 + SPAN_A(2) * 20, 1e-2, 'iç köşeye malzeme eklenir');
});

await t('8) döndürülmüş ve taşınmış parça: kenarlar dünya koordinatında, hacim aynı', async () => {
  const D = [box(80, 40, 60, { x: 100, y: 5, z: -20, ry: 90 })];
  const { edges } = await op('edges', { descs: D });
  assert.equal(edges.length, 12);
  // ry = 90°: 80 mm'lik kenarlar artık z yönünde; üst kenarlardan biri
  const e = edges.filter((x) => Math.abs(x.len - 80) < 1e-6).find((x) => Math.abs(x.mid[1] - 45) < 1e-6);
  assert.ok(e, 'üstteki 80 mm kenar');
  assert.ok(Math.abs(e.pts[0][2] - e.pts[1][2]) > 79, 'kenar z yönünde');
  const r = await sel(D, [e], 'fillet', 5);
  near(r.check.volume, 80 * 40 * 60 - SPAN_A(5) * 80, 1e-3);
});

await t('9) hatalar: büyük ölçü, değişmiş model, sıfır ölçü, boş seçim — anlaşılır ileti', async () => {
  const D = [box(10, 10, 10)];
  const { edges } = await op('edges', { descs: D });
  const e = pickAt(edges, [0, 10, 5]);
  await assert.rejects(sel(D, [e], 'fillet', 12), /Yuvarlama yapılamadı|ölçü/);   // yarıçap komşu yüzlerden büyük
  // kenar 10 mm'lik kutuda x = 5'teydi; kutu 12 mm olunca x = 6'ya kaydı → bulunamaz
  await assert.rejects(sel([box(12, 10, 10)], [{ mid: [5, 10, 0], type: 'Line' }], 'fillet', 1), /bulunamadı|yeniden seç/);
  await assert.rejects(sel(D, [e], 'chamfer', 0), /0'dan büyük/);
  await assert.rejects(sel(D, [], 'chamfer', 1), /Kenar seçilmedi/);
});

await t('10) katıya çevrilemeyen parça varsa işlem yapılmaz', async () => {
  const bad = { type: 'tris', pos: new Array(9 * 5).fill(0), name: 'bozuk ağ' };
  await assert.rejects(sel([box(10, 10, 10), bad], [{ mid: [0, 10, 5], type: 'Line' }], 'fillet', 1), /katıya çevrilemedi|katı/);
});

console.log(fail ? `\n${fail} test başarısız` : '\nhepsi geçti');
process.exit(fail ? 1 : 0);
