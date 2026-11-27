// Çalıştır: node tests/gozkontrol.test.mjs — Göz Kontrol: yapay fotoğraflarla (perspektifli A4, döndürülmüş parça)
import assert from 'node:assert/strict';
import * as GK from '../gozkontrol.js';
import { homography } from '../photo2d.js';

const tests = [];
const t = (name, fn) => tests.push([name, fn]);
function boxTris(min, max) { const [x0, y0, z0] = min, [x1, y1, z1] = max; const v = [[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0], [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]]; const f = [[0, 2, 1], [0, 3, 2], [4, 5, 6], [4, 6, 7], [0, 1, 5], [0, 5, 4], [3, 7, 6], [3, 6, 2], [0, 4, 7], [0, 7, 3], [1, 2, 6], [1, 6, 5]]; return f.flatMap((q) => q.flatMap((i) => v[i])); }
// dünya Y ekseni boyunca boydan boya delik (ters yönlü silindir)
function holeTris(cx, cz, r, y0, y1, n = 64) { const tr = []; for (let i = 0; i < n; i++) { const a0 = i / n * 2 * Math.PI, a1 = (i + 1) / n * 2 * Math.PI, P = (a, y) => [cx + r * Math.cos(a), y, cz + r * Math.sin(a)]; for (const q of [[...P(a0, y0), ...P(a1, y1), ...P(a1, y0)], [...P(a0, y0), ...P(a0, y1), ...P(a1, y1)], [cx, y0, cz, ...P(a0, y0), ...P(a1, y0)], [cx, y1, cz, ...P(a1, y1), ...P(a0, y1)]]) tr.push(q[0], q[1], q[2], q[6], q[7], q[8], q[3], q[4], q[5]); } return tr; }
// model: 80 × 50 × 10 levha; delikler (makine X, Y): Ø10 (20, 25), Ø6 (60, 38), Ø8 (60, 12) — simetrik değil
const HOLES = [[20, 25, 10], [60, 38, 6], [60, 12, 8]];
const MODEL = Float32Array.from([...boxTris([0, 0, -50], [80, 10, 0]), ...HOLES.flatMap(([x, y, d]) => holeTris(x, -y, d / 2, 0, 10))]);
// yapay fotoğraf: koyu masa, perspektifli A4, kâğıtta döndürülmüş parça (gri), deliklerden kâğıt görünür
function photo({ holes = HOLES, mirror = false, ang = 0.35, off = [105, 150], size = [80, 50], paper = true, W = 900, H = 1200, cut = null, noise = 0, seed = 7 } = {}) {
  let rs = seed; const rnd = () => { rs = (rs * 1103515245 + 12345) % 2147483648; return rs / 2147483648; };
  const quad = [[120, 90], [790, 140], [830, 1110], [70, 1060]], img = new Uint8ClampedArray(W * H * 4);
  const Hm = homography(quad, [[0, 0], [210, 0], [210, 297], [0, 297]]);   // görüntü → kâğıt (mm, y aşağı)
  const c = Math.cos(ang), s = Math.sin(ang);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let v = 45;
    const dd = Hm[6] * x + Hm[7] * y + 1, u = (Hm[0] * x + Hm[1] * y + Hm[2]) / dd, w = (Hm[3] * x + Hm[4] * y + Hm[5]) / dd;
    if (paper && u >= 0 && u <= 210 && w >= 0 && w <= 297) {
      v = 232;
      // kâğıt (y yukarı) → parça (makine) koordinatı
      const px = u - off[0], py = (297 - w) - off[1];
      let mx = c * px + s * py, my = -s * px + c * py;
      if (mirror) mx = -mx;
      mx += size[0] / 2; my += size[1] / 2;
      if (mx >= 0 && mx <= size[0] && my >= 0 && my <= size[1] && !holes.some(([hx, hy, hd]) => Math.hypot(mx - hx, my - hy) < hd / 2) && !(cut && mx >= cut[0] && mx <= cut[2] && my >= cut[1] && my <= cut[3])) v = 95;
      // kâğıtta yumuşak ışık değişimi (bir yandan gölge)
      v -= 18 * (u / 210);
    }
    if (noise) v += (rnd() - 0.5) * 2 * noise;
    const k = (y * W + x) * 4; img[k] = img[k + 1] = img[k + 2] = v; img[k + 3] = 255;
  }
  return { img, W, H };
}
const run = (o) => { const p = photo(o); return GK.checkPhoto(p.img, p.W, p.H, MODEL); };

t('doğru parça: hata yok, örtüşme yüksek, delikler ±0,8 mm', () => {
  const r = run();
  assert.ok(!r.error, r.error);
  assert.ok(r.iou > 0.9, 'örtüşme ' + r.iou);
  assert.equal(r.items.length, 0, JSON.stringify(r.items));
  assert.equal(r.holes.length, 3);
  for (const h of r.holes) { assert.ok(h.found && h.dPos < 0.8, 'konum ' + h.dPos); assert.ok(Math.abs(h.dD) < 0.8, 'çap ' + h.dD); }
});
t('eksik delik ve fazla delik yakalanır', () => {
  const r1 = run({ holes: HOLES.slice(0, 2) });
  assert.ok(r1.items.some((w) => w.sev === 'crit' && /EKSİK delik/.test(w.t) && /Ø8/.test(w.t)), JSON.stringify(r1.items));
  const r2 = run({ holes: [...HOLES, [40, 40, 7]] });
  assert.ok(r2.items.some((w) => w.sev === 'crit' && /FAZLA delik/.test(w.t)), JSON.stringify(r2.items));
});
t('yanlış yerde ve yanlış çapta delik', () => {
  const r1 = run({ holes: [[20, 28, 10], HOLES[1], HOLES[2]] });
  assert.ok(r1.items.some((w) => /Delik yeri farklı/.test(w.t)), JSON.stringify(r1.items));
  const r2 = run({ holes: [[20, 25, 13], HOLES[1], HOLES[2]] });
  assert.ok(r2.items.some((w) => /Delik çapı farklı/.test(w.t) && /Ø10/.test(w.t)), JSON.stringify(r2.items));
});
t('dış ölçü farkı ve ayna işleme', () => {
  const r1 = run({ size: [84, 50] });
  assert.ok(r1.items.some((w) => /Dış ölçü X/.test(w.t)), JSON.stringify(r1.items));
  const r2 = run({ mirror: true });
  assert.ok(r2.mirrored && r2.items.some((w) => /AYNA/.test(w.t)), JSON.stringify(r2.items));
});
t('eksik malzeme (köşesi fazla kesilmiş) yakalanır; gürültülü ve ışığı eşit olmayan fotoğrafta doğru parça yine temiz', () => {
  const r1 = run({ cut: [68, 38, 80, 50] });
  assert.ok(r1.items.some((w) => /EKSİK malzeme/.test(w.t)), JSON.stringify(r1.items));
  const r2 = run({ noise: 25, ang: -1.1, off: [100, 160] });
  assert.ok(!r2.error, r2.error); assert.equal(r2.items.length, 0, JSON.stringify(r2.items));
});
t('kâğıt yoksa sonuç uydurulmaz', () => {
  const r = run({ paper: false });
  assert.ok(r.error && /A4/.test(r.error));
});

let fail = 0;
for (const [name, fn] of tests) {
  try { await fn(); console.log('ok   ', name); } catch (e) { fail++; console.log('FAIL ', name, '\n     ', String(e.message).split('\n')[0].slice(0, 500)); }
}
console.log(fail ? `\n${fail} test BAŞARISIZ` : '\nTüm testler geçti');
process.exit(fail ? 1 : 0);
