// Çalıştır: node tests/photo2d.test.mjs
import assert from 'node:assert/strict';
import { vectorize, homography, warpGray, findPaperQuad, fitPath, fitCircle, beautify } from '../photo2d.js';

let fail = 0;
const t = (name, fn) => {
  try { fn(); console.log('ok   ', name); }
  catch (e) { fail++; console.log('FAIL ', name, '\n     ', e.message.split('\n')[0]); }
};

// sentetik kağıt: gölgeli arka plan + kalın, hafif titrek kalem çizgileri
function paper(w, h, draw) {
  const g = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) g[y * w + x] = 235 - Math.round(60 * x / w); // soldan sağa gölge
  const ink = (x, y) => { if (x >= 0 && y >= 0 && x < w && y < h) g[(y | 0) * w + (x | 0)] = 40; };
  const seg = (x1, y1, x2, y2, th = 2.2, wob = 1) => {
    const L = Math.hypot(x2 - x1, y2 - y1), n = Math.ceil(L * 2);
    for (let i = 0; i <= n; i++) {
      const s = i / n, wv = Math.sin(s * 9) * wob;
      const nx = -(y2 - y1) / L, ny = (x2 - x1) / L;
      const cx = x1 + (x2 - x1) * s + nx * wv, cy = y1 + (y2 - y1) * s + ny * wv;
      for (let dy = -th; dy <= th; dy++) for (let dx = -th; dx <= th; dx++) if (dx * dx + dy * dy <= th * th) ink(cx + dx, cy + dy);
    }
  };
  const circ = (cx, cy, r, a0 = 0, a1 = Math.PI * 2) => {
    const n = Math.ceil(r * Math.abs(a1 - a0) * 2);
    let px = null;
    for (let i = 0; i <= n; i++) { const a = a0 + (a1 - a0) * i / n, x = cx + r * Math.cos(a), y = cy - r * Math.sin(a); if (px) seg(px[0], px[1], x, y, 2.2, 0); px = [x, y]; }
  };
  draw({ seg, circ, ink });
  return g;
}
const count = (ents, t0) => ents.filter((e) => e.t === t0).length;

t('dikdörtgen + daire: 4 yatay/dikey çizgi ve 1 daire', () => {
  const w = 600, h = 450;
  const g = paper(w, h, ({ seg, circ, ink }) => {
    seg(100, 80, 500, 82); seg(500, 82, 498, 380); seg(498, 380, 101, 378); seg(101, 378, 100, 80);
    circ(300, 230, 60);
    for (let k = 0; k < 6; k++) ink(560 + k, 20); // küçük leke (yazı benzeri) atılmalı
  });
  const r = vectorize(g, w, h, { mmPerPx: 1 });
  const lines = r.ents.filter((e) => e.t === 'line');
  assert.equal(count(r.ents, 'circle'), 1, JSON.stringify(r.stats) + ' ' + JSON.stringify(r.ents.map((e) => e.t)));
  assert.equal(lines.length, 4, JSON.stringify(r.ents.map((e) => e.t)));
  for (const l of lines) assert.ok(Math.abs(l.a[0] - l.b[0]) < 1e-9 || Math.abs(l.a[1] - l.b[1]) < 1e-9, 'yatay/dikey değil: ' + JSON.stringify(l));
  const c = r.ents.find((e) => e.t === 'circle');
  assert.ok(Math.abs(c.r - 60) < 3, 'r ' + c.r);
  // uçlar birleşik: dört köşe, her köşede iki çizgi
  const key = (p) => p.map((v) => v.toFixed(3)).join(',');
  const deg = new Map();
  for (const l of lines) for (const p of [l.a, l.b]) deg.set(key(p), (deg.get(key(p)) || 0) + 1);
  assert.equal(deg.size, 4); for (const v of deg.values()) assert.equal(v, 2);
});
t('L şekli ve yay: yay tanınır', () => {
  const w = 500, h = 400;
  const g = paper(w, h, ({ seg, circ }) => {
    seg(80, 320, 330, 320); seg(80, 320, 80, 80);
    circ(330, 200, 120, -Math.PI / 2, 0); // alt uçtan sağa çeyrek yay
  });
  const r = vectorize(g, w, h, { mmPerPx: 1 });
  assert.ok(count(r.ents, 'arc') >= 1, JSON.stringify(r.ents.map((e) => e.t)));
  assert.ok(count(r.ents, 'line') >= 2);
});
t('homography ve warp: köşeler eşlenir', () => {
  const H = homography([[0, 0], [10, 0], [10, 10], [0, 10]], [[5, 5], [20, 6], [19, 18], [4, 17]]);
  const ap = (x, y) => { const d = H[6] * x + H[7] * y + 1; return [(H[0] * x + H[1] * y + H[2]) / d, (H[3] * x + H[4] * y + H[5]) / d]; };
  const q = ap(10, 10); assert.ok(Math.abs(q[0] - 19) < 1e-6 && Math.abs(q[1] - 18) < 1e-6);
  const src = new Uint8Array(100 * 100).fill(200); for (let i = 0; i < 100; i++) src[50 * 100 + i] = 0;
  const out = warpGray(src, 100, 100, [[0, 0], [99, 0], [99, 99], [0, 99]], 50, 50);
  assert.ok(out[25 * 50 + 10] < 120);
});
t('findPaperQuad: koyu masada açık kağıt', () => {
  const w = 200, h = 160, g = new Uint8Array(w * h).fill(40);
  for (let y = 20; y < 140; y++) for (let x = 30 + Math.round((y - 20) * 0.1); x < 170; x++) g[y * w + x] = 220;
  const q = findPaperQuad(g, w, h);
  assert.ok(q && Math.abs(q[0][0] - 30) <= 2 && Math.abs(q[0][1] - 20) <= 2 && Math.abs(q[2][0] - 169) <= 2 && Math.abs(q[2][1] - 139) <= 2, JSON.stringify(q));
});
t('fitPath: titrek düz çizgi tek çizgi, çember noktaları daire', () => {
  const line = Array.from({ length: 100 }, (_, i) => [i, Math.sin(i / 5) * 0.8]);
  assert.equal(fitPath(line, 2).length, 1);
  const circ = Array.from({ length: 121 }, (_, i) => [50 * Math.cos(i / 120 * Math.PI * 2), 50 * Math.sin(i / 120 * Math.PI * 2)]);
  const r = fitPath(circ, 2);
  assert.equal(r.length, 1); assert.equal(r[0].t, 'circle');
  assert.ok(Math.abs(fitCircle(circ).r - 50) < 1e-6);
});
t('beautify: yakın uçlar birleşir, aynı doğrultudaki parçalar tek çizgi olur', () => {
  const r = beautify([{ t: 'line', a: [0, 0], b: [50, 0.5] }, { t: 'line', a: [51, 0.3], b: [100, 1] }, { t: 'line', a: [100, 0], b: [100, 60] }], 2);
  assert.equal(r.length, 2, JSON.stringify(r));
  assert.ok(r.some((e) => e.a[1] === e.b[1]));
});

console.log(fail ? `\n${fail} test BAŞARISIZ` : '\nTüm testler geçti');
process.exit(fail ? 1 : 0);
