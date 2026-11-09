// Çalıştır: node tests/cam.test.mjs — CNC takım yolu, simülasyon ve G-kodu
import assert from 'node:assert/strict';
import * as C from '../cam.js';

let fail = 0;
const tests = [];
const t = (name, fn) => tests.push([name, fn]);
const near = (a, b, tol, m) => assert.ok(Math.abs(a - b) <= tol, `${m}: ${a} ≠ ${b}`);
function boxTris(min, max) {
  const [x0, y0, z0] = min, [x1, y1, z1] = max;
  const v = [[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0], [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]];
  const f = [[0, 2, 1], [0, 3, 2], [4, 5, 6], [4, 6, 7], [0, 1, 5], [0, 5, 4], [3, 7, 6], [3, 6, 2], [0, 4, 7], [0, 7, 3], [1, 2, 6], [1, 6, 5]];
  return f.flatMap((q) => q.flatMap((i) => v[i]));
}
// dünya koordinatı (Y yukarı): 60 × 40 taban, ortada 30 × 20 × 10 cep
const POCKET = Float32Array.from([...boxTris([0, 0, 0], [60, 10, 40]), ...boxTris([0, 10, 0], [15, 20, 40]), ...boxTris([45, 10, 0], [60, 20, 40]), ...boxTris([15, 10, 0], [45, 20, 10]), ...boxTris([15, 10, 30], [45, 20, 40])]);
function dome(R = 20, base = 5, n = 48) {   // taban bloğu + yarım küre (üst yüzey)
  const tr = [...boxTris([-30, 0, -30], [30, base, 30])];
  for (let i = 0; i < n; i++) for (let j = 0; j < n / 2; j++) {
    const P = (a, b) => [R * Math.cos(b) * Math.cos(a), base + R * Math.sin(b), R * Math.cos(b) * Math.sin(a)];
    const a0 = (i / n) * 2 * Math.PI, a1 = ((i + 1) / n) * 2 * Math.PI, b0 = (j / (n / 2)) * Math.PI / 2, b1 = ((j + 1) / (n / 2)) * Math.PI / 2;
    tr.push(...P(a0, b0), ...P(a1, b1), ...P(a1, b0), ...P(a0, b0), ...P(a0, b1), ...P(a1, b1));
  }
  return Float32Array.from(tr);
}
const TOOLS = [{ id: 1, n: 1, type: 'flat', d: 8, flutes: 3, flute: 40, rpm: 8000, feed: 1200, plunge: 300 }, { id: 2, n: 2, type: 'ball', d: 6, flutes: 2, flute: 40, rpm: 10000, feed: 1500, plunge: 300 }, { id: 3, n: 3, type: 'drill', d: 5, flutes: 2, flute: 50, rpm: 3000, feed: 200, plunge: 150 }];
const run = (job) => { const R = C.plan(job), SG = C.simGrid(R, 200000); C.simulate(R, SG, { op: 0, mv: 0 }); return { R, SG, res: C.residual(R, SG, 0.1) }; };

t('uzaklık alanı kesin Öklid, eş değer eğrisi kapalı kare-yuvarlak döngü', () => {
  const nx = 40, ny = 30, m = new Uint8Array(nx * ny); for (let j = 10; j < 20; j++) for (let i = 15; i < 25; i++) m[i + nx * j] = 1;
  const E = C.edt(m, nx, ny); near(E[0], Math.hypot(15, 10), 1e-5, 'köşe'); assert.equal(E[15 + nx * 15], 0); near(E[30 + nx * 15], 6, 1e-6, 'yan');
  const L = C.isolines(E, nx, ny, 4, null); assert.equal(L.length, 1); assert.ok(L[0].closed);
  let len = 0; const p = L[0].pts; for (let i = 1; i < p.length; i++) len += Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]);
  near(len, 4 * 9 + 2 * Math.PI * 4, 1.5, 'çevre = kare ofseti (4 kenar + çeyrek yaylar)');
  assert.equal(C.edt(new Uint8Array(4), 2, 2), null);
});
t('yükseklik haritası: koordinat dönüşümü (Y yukarı → Z), cep tabanı ve duvar', () => {
  const P = C.prepare({ tris: POCKET, tools: TOOLS, stock: { side: 2, top: 1, bottom: 5 }, res: 0.5 });
  const at = (x, y) => P.H[Math.floor((x - P.G.ox) / P.G.res) + P.G.nx * Math.floor((y - P.G.oy) / P.G.res)];
  assert.equal(at(30, -20), 10); assert.equal(at(5, -20), 20); assert.equal(at(-1, -20), -Infinity);
  assert.equal(P.stock.zTop, 21); assert.equal(P.stock.zBot, -5); near(P.vMap, P.vModel, P.vModel * 0.02, 'hacim'); assert.equal(P.undercut, 0);
});
t('cepli parça: yüzey alma + kaba + duvar → modele dalma yok, kalan yalnız iç köşelerde (r = takım yarıçapı)', () => {
  const job = { tris: POCKET, tools: TOOLS, stock: { side: 3, top: 1, bottom: 5 }, res: 0.4, holes: [], ops: [{ type: 'face', on: true, tool: 1 }, { type: 'rough', on: true, tool: 1, stepdown: 4, allowR: 0.3, allowZ: 0.2 }, { type: 'walls', on: true, tool: 1 }] };
  const { R, SG, res } = run(job);
  assert.equal(res.gouge, 0, 'dalma ' + res.gougeMax);
  // kalan: cep köşeleri — 4 köşe × (r² − πr²/4) alan ≈ 4 × 3,43 mm² (r = 4)
  // kalan hücreler ya duvar dibinde (ızgara payı ≤ 0,6 mm) ya da cep köşelerinde (r·√2 içinde) olmalı
  const corners = [[15, -10], [45, -10], [15, -30], [45, -30]], walls = [15, 45, 0, 60], wallsY = [-10, -30, 0, -40];
  let left = 0, stray = 0;
  for (let j = 0; j < SG.ny; j++) for (let i = 0; i < SG.nx; i++) {
    if (res.mark[i + SG.nx * j] !== 1) continue; left++;
    const x = SG.ox + (i + 0.5) * SG.res, y = SG.oy + (j + 0.5) * SG.res;
    const nearWall = walls.some((w) => Math.abs(x - w) < 0.7) || wallsY.some((w) => Math.abs(y - w) < 0.7), nearCorner = corners.some(([cx, cy]) => Math.hypot(x - cx, y - cy) < 4 * Math.SQRT2 + 0.5);
    if (!nearWall && !nearCorner) stray++;
  }
  assert.ok(left > 0 && stray === 0, 'kalan ' + left + ', yersiz ' + stray);
  assert.ok(res.leftPct < 3, 'kalan %' + res.leftPct);
  // seviyeler: cep tabanı (10) ve parça tabanı (0) dahil
  const zs = new Set(R.ops[1].moves.filter((m) => m.k === 'f').map((m) => +m.z.toFixed(2)));
  assert.ok(zs.has(10.2) && zs.has(0.2), [...zs].join(','));
  assert.ok(R.stats.minutes > 0.5 && R.stats.minutes < 60);
});
t('yarım küre: küresel uçla 3B ince işleme; dalma yok, kalan ≈ tarak yüksekliği', () => {
  const job = { tris: dome(), tools: TOOLS, stock: { side: 2, top: 1, bottom: 3 }, res: 0.25, holes: [], ops: [{ type: 'rough', on: true, tool: 1, stepdown: 4, allowR: 0.5, allowZ: 0.5 }, { type: 'finish', on: true, tool: 2, stepover: 0.4 }] };
  const { R, res } = run(job);
  assert.equal(res.gouge, 0, 'dalma ' + res.gougeMax);
  // küre üstünde kalan en fazla: tarak (so²/8R) + ızgara payı; taban köşesindeki kalan (r=3 küresel uç) hariç
  const SG = C.simGrid(R, 200000); C.simulate(R, SG, { op: 0, mv: 0 });
  let worst = 0;
  for (let j = 0; j < SG.ny; j++) for (let i = 0; i < SG.nx; i++) { const x = SG.ox + (i + 0.5) * SG.res, y = SG.oy + (j + 0.5) * SG.res, rr = Math.hypot(x, y); if (rr > 17) continue; const zt = 5 + Math.sqrt(400 - rr * rr); worst = Math.max(worst, SG.S[i + SG.nx * j] - zt); }
  assert.ok(worst < 0.25, 'kubbede kalan ' + worst);
});
t('drop-cutter: düz yüzeyde uç = yüzey; küresel uç kenardan uzaklaştıkça doğru iner', () => {
  const P = C.prepare({ tris: Float32Array.from(boxTris([0, 0, 0], [20, 10, 20])), tools: TOOLS, res: 0.1 });
  const ball = { type: 'ball', d: 6 };
  const fp = (tool) => ({ R: tool.d / 2, ball: tool.type === 'ball', extra: 0 });
  near(C.dropZ(P, fp(ball), 10, -10, 0), 10, 2e-3, 'üst');
  // kenardan 2 mm dışarıda: uç = 10 − (3 − √(9 − 4))
  near(C.dropZ(P, fp(ball), 22, -10, 0), 10 - (3 - Math.sqrt(5)), 0.07, 'kenar (ızgara adımı 0,1 mm)');
});
t('delik: G81 / G83 (derin), standart matkap, boydan boya uç payı', () => {
  const job = { tris: POCKET, tools: TOOLS, stock: { side: 2, top: 0, bottom: 5 }, res: 0.5, holes: [{ x: 7, z: 20, d: 5, top: 20, bottom: -1 }, { x: 53, z: 20, d: 5, top: 20, bottom: 12 }], ops: [{ type: 'drill', on: true, tool: 3 }] };
  const R = C.plan(job), dm = R.ops[0].moves.filter((m) => m.k === 'd');
  assert.equal(dm.length, 2);
  const deep = dm.find((m) => Math.abs(m.x - 7) < 1e-9), shallow = dm.find((m) => Math.abs(m.x - 53) < 1e-9);
  near(deep.z, 0 - 5 * 0.3 - 0.5, 1e-9, 'boydan boya'); assert.equal(deep.q, 5);   // 20 mm > 3·Ø → gagalama
  assert.equal(shallow.z, 12); assert.equal(shallow.q, 0);
  const g = C.gcode(R, job, 'fanuc');
  assert.ok(/G98 G83 X9\.0 Y22\.0 Z-22\.0 R2\.0 Q5\.0 F150/.test(g) && /G98 G81 X55\.0 Y22\.0 Z-8\.0 R2\.0 F150/.test(g), g.split('\n').filter((l) => /G8/.test(l)).join(' | '));
  assert.ok(g.includes('G80'));
  assert.equal(C.nearestDrill(8.4), 8.4); assert.equal(C.nearestDrill(14.2), 14);
});
t('G-kodu: Fanuc / Mach3 / GRBL farkları, ondalık nokta, sıfır kaydırma, Türkçe karakter yok', () => {
  const job = { tris: POCKET, tools: TOOLS, stock: { side: 2, top: 1, bottom: 5 }, res: 0.5, holes: [{ x: 7, z: 20, d: 5, top: 20, bottom: -1 }], ops: [{ type: 'face', on: true, tool: 1 }, { type: 'drill', on: true, tool: 3 }], name: 'Kapak çıkıntısı', zero: 'corner' };
  const R = C.plan(job);
  const F = C.gcode(R, job, 'fanuc', { lineNumbers: true }), M3 = C.gcode(R, job, 'mach3'), G = C.gcode(R, job, 'grbl');
  assert.ok(F.startsWith('%\nO1001') && F.trim().endsWith('%') && F.includes('M30') && F.includes('T1 M6') && F.includes('G43 Z') && /\nN10 /.test(F));
  assert.ok(!/[^\x00-\x7f]/.test(F + M3 + G), 'ASCII dışı karakter');
  assert.ok(F.includes('(KAPAK CIKINTISI)'));
  assert.ok(M3.includes('G53 G0 Z0.0') && !M3.includes('O1001'));
  assert.ok(!/M6|G43|G8[0-3]|G28/.test(G) && G.includes('M0') && G.trim().endsWith('M2'));   // GRBL: takım değişiminde M0 ile bekler
  // her sayı ondalık noktalı (Fanuc'ta "10" = 10 µm olabilir)
  for (const l of F.split('\n')) for (const m of l.matchAll(/[XYZRQ](-?[\d.]+)/g)) assert.ok(m[1].includes('.'), l);
  // sıfır: stok üst ön-sol köşe → yüzey alma Z0'a iner (üst pay 1 mm → Z-1.0)
  assert.ok(/Z-1\.0/.test(F));
  // GRBL: delme döngüsü G1 ile açılmış
  assert.ok(/G1 Z-[\d.]+ F150/.test(G));
});
t('alttan girinti (üstten görünmeyen) uyarısı', () => {
  // köprü: iki ayak + üst plaka (altı boş)
  const tr = Float32Array.from([...boxTris([0, 0, 0], [10, 20, 30]), ...boxTris([40, 0, 0], [50, 20, 30]), ...boxTris([0, 20, 0], [50, 30, 30])]);
  const R = C.plan({ tris: tr, tools: TOOLS, res: 0.5, holes: [], ops: [] });
  assert.ok(R.P.undercut > 0 && R.warn.some((w) => /üstten görünmüyor/.test(w.t)));
});
t('kesme değeri önerisi: Vc ve fz ile devir / ilerleme; makine sınırı', () => {
  const s = C.suggestCut('aluminyum', { type: 'flat', d: 10, flutes: 3 }, 24000);
  near(s.rpm, 250000 / (Math.PI * 10), 1, 'devir'); near(s.feed, s.rpm * 0.06 * 3, 2, 'ilerleme');
  const c = C.suggestCut('ahsap', { type: 'flat', d: 3, flutes: 2 }, 18000); assert.equal(c.rpm, 18000); assert.ok(c.capped);
  assert.equal(C.matKeyFor('al6061'), 'aluminyum'); assert.equal(C.matKeyFor('mdf'), 'ahsap'); assert.equal(C.matKeyFor('celik'), 'celik');
});

for (const [name, fn] of tests) {
  try { await fn(); console.log('ok   ', name); }
  catch (e) { fail++; console.log('FAIL ', name, '\n     ', e.message.split('\n')[0].slice(0, 600)); }
}
console.log(fail ? `\n${fail} test BAŞARISIZ` : '\nTüm testler geçti');
process.exit(fail ? 1 : 0);
