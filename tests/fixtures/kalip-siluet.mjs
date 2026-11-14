// Gerçeğe yakın sentetik kalıp yan çizgisi (erkek, ~265 mm, 25 mm topuk). Kanonik: topuk solda, burun sağda, taban altta (y aşağı).
// flipX / flipY ile fotoğraftaki farklı duruşlar taklit edilir.
import * as G from '../../ayk/geom.js';

function smooth(ctrl, x) {
  for (let i = 0; i < ctrl.length - 1; i++) {
    const [x0, y0] = ctrl[i], [x1, y1] = ctrl[i + 1];
    if (x >= x0 && x <= x1) { const t = (x - x0) / (x1 - x0), s = t * t * (3 - 2 * t); return y0 + (y1 - y0) * s; }
  }
  return ctrl[x < ctrl[0][0] ? 0 : ctrl.length - 1][1];
}
export function lastView({ L = 265, flipX = false, flipY = false, at = [0, 0] } = {}) {
  const ground = 130;
  const soleH = [[0, 27], [0.22 * L, 25], [0.45 * L, 10], [0.68 * L, 0], [0.86 * L, 3], [L, 13]];   // tabanın yerden yüksekliği
  const topH = [[0, 92], [0.05 * L, 118], [0.3 * L, 124], [0.45 * L, 104], [0.6 * L, 84], [0.75 * L, 60], [0.9 * L, 40], [0.985 * L, 26], [L, 16]];
  const top = [], bot = [];
  for (let i = 0; i <= 200; i++) {
    const x = (i / 200) * L;
    // uçlarda yuvarlatma: topuk arkası ve burun ucu kapanır
    const ends = Math.min(1, Math.sqrt(Math.max(0, x / (0.035 * L))), Math.sqrt(Math.max(0, (L - x) / (0.03 * L))));
    const s = smooth(soleH, x), t = smooth(topH, x), mid = (s + t) / 2, half = ((t - s) / 2) * ends;
    top.push([x, ground - (mid + half)]); bot.push([x, ground - (mid - half)]);
  }
  let pts = top.concat(bot.reverse().slice(1, -1));
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of pts) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  pts = pts.map(([x, y]) => [flipX ? x1 - x : x - x0, flipY ? y1 - y : y - y0]);
  return { outline: G.makePath(pts, true), at, imgAt: [0, 0], img: 'data:image/jpeg;base64,AAAA', k: 3, w: 10, h: 10, length: x1 - x0, height: y1 - y0, scale: 1, sens: 0, paper: 'A4' };
}
