// Örnek 4 / 5 eksen programlarını üretir: node tools/gen_cnc5_samples.mjs
// Çıktı: docs/cnc5-ornekler/  (DOĞRULANMAMIŞ — yalnız biçim ve eksen hareketlerini incelemek için)
import fs from 'node:fs';
import * as K from '../kin.js';
import * as C5 from '../cam5.js';
import * as CO from '../coll5.js';
import * as PO from '../post5.js';
const clone = (o) => JSON.parse(JSON.stringify(o));
function boxTris(c, s) {
  const [cx, cy, cz] = c, [hx, hy, hz] = s.map((v) => v / 2), P = (x, y, z) => [cx + x * hx, cy + y * hy, cz + z * hz];
  const f = [[[-1, -1, -1], [-1, 1, -1], [1, 1, -1], [1, -1, -1]], [[-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]], [[-1, -1, -1], [1, -1, -1], [1, -1, 1], [-1, -1, 1]], [[-1, 1, -1], [-1, 1, 1], [1, 1, 1], [1, 1, -1]], [[-1, -1, -1], [-1, -1, 1], [-1, 1, 1], [-1, 1, -1]], [[1, -1, -1], [1, 1, -1], [1, 1, 1], [1, -1, 1]]];
  const o = []; for (const q of f) { const v = q.map((a) => P(...a)); o.push(...v[0], ...v[1], ...v[2], ...v[0], ...v[2], ...v[3]); }
  return new Float32Array(o);
}
function dome(R, hh, n = 32, m = 10) {
  const o = [], c = hh - R, a1 = Math.acos((0 - c) / R), P = (th, ph) => [R * Math.sin(th) * Math.cos(ph), c + R * Math.cos(th), R * Math.sin(th) * Math.sin(ph)];
  for (let j = 0; j < m; j++) for (let i = 0; i < n; i++) { const t0 = a1 * j / m, t1 = a1 * (j + 1) / m, p0 = 2 * Math.PI * i / n, p1 = 2 * Math.PI * (i + 1) / n, A = P(t0, p0), B = P(t0, p1), C = P(t1, p1), D = P(t1, p0); if (j > 0) o.push(...A, ...B, ...C); o.push(...A, ...C, ...D); if (j === m - 1) o.push(0, 0, 0, ...D, ...C); }
  return new Float32Array(o);
}
const tools = [{ id: 1, n: 1, type: 'flat', d: 8, flute: 25, stickout: 45, holder: { d: 32, len: 60 }, rpm: 7000, feed: 700, plunge: 200 }, { id: 2, n: 2, type: 'ball', d: 6, flute: 20, stickout: 45, holder: { d: 30, len: 60 }, rpm: 9000, feed: 900, plunge: 250 }];
const sp = { d: 60, len: 100 };
const jobs = {
  '4eksen_indeksli': { name: '4 EKSEN INDEKSLI ORNEK', tris: boxTris([0, 10, 0], [50, 18, 18]), machine: clone(K.MACHINES.vmc4A), tools, spindle: sp, setup: {}, ops: [{ type: 'index4', tool: 1, sub: ['rough'], angles: [0, 90, 180, 270], res: 1 }] },
  '5eksen_eszamanli': { name: '5 EKSEN ES ZAMANLI ORNEK', tris: dome(25, 12), machine: clone(K.MACHINES.tt_AC), tools, spindle: sp, setup: { stockBottom: 10, clampH: 4 }, ops: [{ type: 'sim5', tool: 2, stepover: 3, lead: 10, maxTilt: 40, res: 1 }] },
};
fs.mkdirSync(new URL('../docs/cnc5-ornekler/', import.meta.url), { recursive: true });
for (const [nm, job] of Object.entries(jobs)) {
  const R = C5.plan5(job), s = CO.checkCollisions(R, job);
  for (const [k, P] of Object.entries(PO.POSTS5)) {
    if (PO.canPost(R, k, s).length) continue;
    const txt = PO.gcode5(R, job, k, s, { date: 'ornek' });
    fs.writeFileSync(new URL(`../docs/cnc5-ornekler/${nm}_${k}.${P.ext}`, import.meta.url), txt);
    console.log(nm, k, txt.split('\n').length, 'satır');
  }
}
