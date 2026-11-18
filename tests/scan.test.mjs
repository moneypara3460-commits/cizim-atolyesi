// Çalıştır: node tests/scan.test.mjs
// Tarama / ağ içe alma (STL, OBJ, PLY, GLB), ağ araçları ve ağdan CAD tanıma (saf JS, OCCT gerekmez).
// OCCT ile üretilmiş gerçek parçalarla tam gidiş-dönüş testi: tests/scan-occt.test.mjs
import assert from 'node:assert/strict';
import { parseMesh, parseSTL, sniff } from '../scan/mesh-import.js';
import { weld, measure, prepare, removeSmallPieces, simplify, scaleToKnown, toTris, edgeCheck } from '../scan/mesh-tools.js';
import { toPLY, toGLB } from '../scan/mesh-export.js';
import { alignToAxes, fitCAD, fitCircle, describe } from '../scan/fit.js';
import { toSTLBinary } from '../logic.js';

let fail = 0;
const t = (name, fn) => {
  try { fn(); console.log('ok   ', name); }
  catch (e) { fail++; console.log('FAIL ', name, '\n     ', String(e.message).split('\n')[0]); }
};
const near = (a, b, tol, m = '') => assert.ok(Math.abs(a - b) <= tol, `${m} ${a} ≉ ${b} (±${tol})`);

/* ---------- sentetik ağlar (dışa bakan yüzler) ---------- */
function boxTris(w, h, l, o = [0, 0, 0]) {
  const x0 = o[0] - w / 2, x1 = o[0] + w / 2, y0 = o[1], y1 = o[1] + h, z0 = o[2] - l / 2, z1 = o[2] + l / 2;
  const P = [[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0], [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]];
  const Q = [[0, 3, 2, 1], [4, 5, 6, 7], [0, 1, 5, 4], [3, 7, 6, 2], [0, 4, 7, 3], [1, 2, 6, 5]];
  const out = [];
  for (const [a, b, c, d] of Q) for (const i of [a, b, c, a, c, d]) out.push(...P[i]);
  return new Float32Array(out);
}
// silindir (Y ekseni), n kenarlı, isteğe bağlı iç delik (boru)
function cylTris(d, h, n = 48, di = 0, o = [0, 0, 0]) {
  const R = d / 2, r = di / 2, out = [];
  const p = (rr, a, y) => [o[0] + rr * Math.cos(a), o[1] + y, o[2] + rr * Math.sin(a)];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * 2 * Math.PI, b = ((i + 1) / n) * 2 * Math.PI;
    out.push(...p(R, a, 0), ...p(R, a, h), ...p(R, b, h), ...p(R, a, 0), ...p(R, b, h), ...p(R, b, 0));   // dış yan
    if (r) {
      out.push(...p(r, a, 0), ...p(r, b, h), ...p(r, a, h), ...p(r, a, 0), ...p(r, b, 0), ...p(r, b, h));   // iç yan (içe bakar)
      out.push(...p(r, a, h), ...p(R, b, h), ...p(R, a, h), ...p(r, a, h), ...p(r, b, h), ...p(R, b, h));   // üst halka
      out.push(...p(r, a, 0), ...p(R, a, 0), ...p(R, b, 0), ...p(r, a, 0), ...p(R, b, 0), ...p(r, b, 0));   // alt halka
    } else {
      out.push(...p(0, 0, h), ...p(R, b, h), ...p(R, a, h));
      out.push(...p(0, 0, 0), ...p(R, a, 0), ...p(R, b, 0));
    }
  }
  return new Float32Array(out);
}
function sphereTris(d, n = 24) {
  const R = d / 2, out = [];
  const p = (i, j) => { const th = (i / n) * Math.PI, ph = (j / (2 * n)) * 2 * Math.PI; return [R * Math.sin(th) * Math.cos(ph), R + R * Math.cos(th), R * Math.sin(th) * Math.sin(ph)]; };
  for (let i = 0; i < n; i++) for (let j = 0; j < 2 * n; j++) {
    const a = p(i, j), b = p(i + 1, j), c = p(i + 1, j + 1), e = p(i, j + 1);
    if (i > 0) out.push(...a, ...e, ...c);
    if (i < n - 1) out.push(...a, ...c, ...b);
  }
  return new Float32Array(out);
}
function rotate(tr, ax, ay, off = [0, 0, 0]) {
  const o = new Float32Array(tr.length);
  for (let i = 0; i < tr.length; i += 3) {
    let [x, y, z] = [tr[i], tr[i + 1], tr[i + 2]];
    [y, z] = [y * Math.cos(ax) - z * Math.sin(ax), y * Math.sin(ax) + z * Math.cos(ax)];
    [x, z] = [x * Math.cos(ay) + z * Math.sin(ay), -x * Math.sin(ay) + z * Math.cos(ay)];
    o[i] = x + off[0]; o[i + 1] = y + off[1]; o[i + 2] = z + off[2];
  }
  return o;
}
let seed = 11;
const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
const gauss = () => Math.sqrt(-2 * Math.log(rnd() + 1e-12)) * Math.cos(2 * Math.PI * rnd());
function noisy(tr, s) {   // aynı köşe aynı gürültüyü alır (ağ kopmasın)
  const m = new Map(), o = tr.slice();
  for (let i = 0; i < o.length; i += 3) {
    const k = o[i].toFixed(4) + ',' + o[i + 1].toFixed(4) + ',' + o[i + 2].toFixed(4);
    let d = m.get(k); if (!d) { d = [gauss() * s, gauss() * s, gauss() * s]; m.set(k, d); }
    o[i] += d[0]; o[i + 1] += d[1]; o[i + 2] += d[2];
  }
  return o;
}
const fit = (tr, opt) => { const p = prepare(tr, {}); const a = alignToAxes(p.mesh); return fitCAD(a.mesh, opt); };

/* ---------- dosya biçimleri ---------- */
const BOX = boxTris(40, 20, 30);

t('STL ikili: okunur, biçim içerikten tanınır (uzantı yanlış olsa da)', () => {
  const b = toSTLBinary(BOX, false);
  assert.equal(sniff(b), 'stl');
  const r = parseMesh(b, 'parca.bin');
  assert.equal(r.format, 'stl'); assert.equal(r.tris.length, BOX.length);
  near(measure(weld(r.tris)).volume, 40 * 20 * 30, 1e-3);
});

t('STL metin: okunur', () => {
  let s = 'solid x\n';
  for (let i = 0; i < BOX.length; i += 9) s += ` facet normal 0 0 0\n  outer loop\n${[0, 1, 2].map((k) => `   vertex ${BOX[i + k * 3]} ${BOX[i + k * 3 + 1]} ${BOX[i + k * 3 + 2]}\n`).join('')}  endloop\n endfacet\n`;
  const r = parseMesh(new TextEncoder().encode(s + 'endsolid x\n'), 'a.stl');
  assert.equal(r.tris.length, BOX.length);
});

t('OBJ: dörtgen yüzler üçgene bölünür, eksi köşe numarası çalışır', () => {
  const s = 'v 0 0 0\nv 10 0 0\nv 10 10 0\nv 0 10 0\nf 1 2 3 4\nf -4 -2 -1\n';
  const r = parseMesh(new TextEncoder().encode(s), 'a.obj');
  assert.equal(r.tris.length / 9, 3);
});

t('OBJ: yalnız noktalar (nokta bulutu) anlaşılır hatayla reddedilir', () => {
  assert.throws(() => parseMesh(new TextEncoder().encode('v 0 0 0\nv 1 0 0\n'), 'a.obj'), /nokta bulutu/);
});

t('PLY: dışa aktarılan ikili PLY geri okunur, hacim aynı', () => {
  const b = toPLY(BOX);
  assert.equal(sniff(b), 'ply');
  const r = parseMesh(b, 'a.ply');
  near(measure(weld(r.tris)).volume, 24000, 0.5);
});

t('PLY metin: okunur', () => {
  const s = 'ply\nformat ascii 1.0\nelement vertex 4\nproperty float x\nproperty float y\nproperty float z\nelement face 2\nproperty list uchar int vertex_indices\nend_header\n0 0 0\n10 0 0\n10 10 0\n0 10 0\n3 0 1 2\n3 0 2 3\n';
  const r = parseMesh(new TextEncoder().encode(s), 'a.ply');
  assert.equal(r.tris.length / 9, 2);
});

t('GLB: dışa aktarılan GLB geri okunur (metre ↔ mm), hacim aynı', () => {
  const b = toGLB(BOX);
  assert.equal(sniff(b), 'glb');
  const r = parseMesh(b, 'a.glb');
  near(measure(weld(r.tris)).volume, 24000, 1);
});

t('Bozuk / boş / desteklenmeyen dosya: açık hata, çökme yok', () => {
  assert.throws(() => parseMesh(new Uint8Array(0), 'a.stl'), /boş/);
  assert.throws(() => parseMesh(new TextEncoder().encode('merhaba'), 'a.txt'), /Desteklenmeyen/);
  assert.throws(() => parseMesh(new TextEncoder().encode('ply\nformat ascii 1.0\nelement vertex 1\nproperty float x\nend'), 'a.ply'), /PLY/);
  assert.throws(() => parseSTL(new TextEncoder().encode('solid boş\nendsolid')), /STL/);
});

/* ---------- ağ araçları ---------- */
t('Kaynak: STL köşeleri birleşir, kutu kapalı (su geçirmez) çıkar', () => {
  const m = weld(BOX);
  assert.equal(m.V.length / 3, 8);
  assert.ok(edgeCheck(m).closed);
});

t('Temizleme: küçük kopuk parçalar (toz, masa parçası) atılır', () => {
  const tr = new Float32Array([...BOX, ...boxTris(1, 1, 1, [60, 0, 0])]);
  const r = removeSmallPieces(weld(tr), 0.02);
  assert.equal(r.removed, 1);
  near(measure(r.mesh).volume, 24000, 1e-3);
});

t('Sadeleştirme: üçgen sayısı hedefin altına iner, ölçü korunur', () => {
  const m = weld(sphereTris(50, 60));
  const s = simplify(m, 1500);
  assert.ok(s.mesh.F.length / 3 <= 1500, 'üçgen ' + s.mesh.F.length / 3);
  near(measure(s.mesh).size[0], 50, 2);
});

t('Bilinen ölçüyle ölçekleme ve birim çevirme (cm → mm)', () => {
  const m = weld(boxTris(4, 2, 3));
  const r = scaleToKnown(m, 0, 40);
  near(r.factor, 10, 1e-9);
  near(measure(r.mesh).size[1], 20, 1e-9);
  near(prepare(boxTris(4, 2, 3), { unit: 10 }).info.size[2], 30, 1e-9);
});

t('Hazırlama: içe bakan ağ çevrilir, yere oturtulur (alt y = 0, x-z ortada)', () => {
  const inv = BOX.slice(); for (let i = 0; i < inv.length; i += 9) for (let k = 0; k < 3; k++) { const a = inv[i + 3 + k]; inv[i + 3 + k] = inv[i + 6 + k]; inv[i + 6 + k] = a; }
  const p = prepare(rotate(inv, 0, 0, [100, 50, -20]), {});
  assert.ok(!p.info.inverted);
  near(p.info.min[1], 0, 1e-9); near(p.info.min[0] + p.info.max[0], 0, 1e-9);
});

/* ---------- ağdan CAD ---------- */
t('Daire uydurma', () => {
  const c = fitCircle([...Array(20).keys()].map((i) => [3 + 5 * Math.cos(i), -2 + 5 * Math.sin(i)]));
  near(c.R, 5, 1e-9); near(c.cu, 3, 1e-9); near(c.cv, -2, 1e-9);
});

t('Kutu: eğik duran taramadan 80 × 40 × 60 kutu tanınır, yatık konur (en kısa boy yükseklik)', () => {
  const r = fit(rotate(boxTris(80, 60, 40), 0.5, 1.1, [30, 10, -5]));
  assert.ok(r.ok, r.reason);
  assert.equal(r.kind, 'prizmatik');
  const b = r.parts[0];
  assert.equal(b.type, 'box');
  near(b.w, 80, 0.05); near(b.h, 40, 0.05); near(b.l, 60, 0.05);
});

t('Silindir (kaba 16 kenarlı STL): eksen bulunur, çap köşe çapına yakın', () => {
  const r = fit(rotate(cylTris(30, 90, 16), 1.2, 0.3));
  assert.ok(r.ok, r.reason);
  const p = r.parts[0];
  assert.equal(p.type, 'cylinder');
  near(p.h, 90, 0.1); near(p.d, 30 * (1 + Math.cos(Math.PI / 16)) / 2, 0.6);
});

t('Boru: Ø50 / Ø40 × 100 tanınır', () => {
  const r = fit(rotate(cylTris(50, 100, 64, 40), 0.7, 0.2));
  assert.ok(r.ok, r.reason);
  assert.equal(r.kind, 'boru');
  near(r.parts[0].d, 50, 0.2); near(r.parts[0].di, 40, 0.2); near(r.parts[0].h, 100, 0.1);
});

t('Küre: Ø50 tanınır', () => {
  const r = fit(sphereTris(50, 32));
  assert.ok(r.ok, r.reason);
  assert.equal(r.kind, 'küre');
  near(r.parts[0].d, 50, 0.5);
});

t('Gürültülü tarama (σ 0,05 mm): kutu yine tanınır, ölçü 0,2 mm içinde', () => {
  const tr = boxTris(80, 30, 50);
  // gürültü düz yüzlerde etkili olsun diye ağı sıklaştır (ızgara)
  const fine = [];
  const N = 16, quad = (a, b, c, d) => {
    for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
      const P = (u, v) => [0, 1, 2].map((k) => a[k] + (b[k] - a[k]) * u + (d[k] - a[k]) * v);
      const p00 = P(i / N, j / N), p10 = P((i + 1) / N, j / N), p11 = P((i + 1) / N, (j + 1) / N), p01 = P(i / N, (j + 1) / N);
      fine.push(...p00, ...p10, ...p11, ...p00, ...p11, ...p01);
    }
  };
  for (let i = 0; i < tr.length; i += 18) quad([tr[i], tr[i + 1], tr[i + 2]], [tr[i + 3], tr[i + 4], tr[i + 5]], [tr[i + 6], tr[i + 7], tr[i + 8]], [tr[i + 15], tr[i + 16], tr[i + 17]]);
  const r = fit(noisy(rotate(new Float32Array(fine), 0.3, 0.4), 0.05));
  assert.ok(r.ok, r.reason);
  near(r.parts[0].w, 80, 0.2); near(r.parts[0].h, 30, 0.2); near(r.parts[0].l, 50, 0.2);
});

t('Serbest şekil (eğik yüzlü takoz): CAD üretilmez, neden açıklanır (sahte CAD yok)', () => {
  // eğik çatılı prizma
  const P = [[0, 0, 0], [60, 0, 0], [60, 10, 0], [0, 40, 0], [0, 0, 30], [60, 0, 30], [60, 10, 30], [0, 40, 30]];
  const Q = [[0, 3, 2, 1], [4, 5, 6, 7], [0, 1, 5, 4], [3, 7, 6, 2], [0, 4, 7, 3], [1, 2, 6, 5]];
  const out = []; for (const [a, b, c, d] of Q) for (const i of [a, b, c, a, c, d]) out.push(...P[i]);
  const r = fit(new Float32Array(out));
  assert.equal(r.ok, false);
  assert.equal(r.parts.length, 0);
  assert.ok(/ağ olarak/i.test(r.reason), r.reason);
});

t('Özet metni okunur', () => {
  const r = fit(cylTris(50, 100, 64, 40));
  assert.match(describe(r), /^Boru Ø50 \/ Ø40 × 100 mm$/);
});

t('Gidiş-dönüş: tanınan parçaların üçgen ağı yeniden aynı ölçüleri verir', () => {
  const r = fit(boxTris(70, 25, 45));
  const b = r.parts[0];
  const again = fit(boxTris(b.w, b.h, b.l));
  assert.deepEqual(again.parts[0], b);
  void toTris;
});

console.log(fail ? `\n${fail} test BAŞARISIZ` : '\nTüm testler geçti');
process.exit(fail ? 1 : 0);
