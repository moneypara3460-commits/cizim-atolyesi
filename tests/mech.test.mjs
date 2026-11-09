// Çalıştır: node tests/mech.test.mjs
import assert from 'node:assert/strict';
import { gearDims, gearOutline, centerDistance, couplingK, couplingValid, propagate, rpmToDegPerSec } from '../mech.js';

let fail = 0;
const tests = [];
const t = (name, fn) => tests.push([name, fn]);
const near = (a, b, tol, m) => assert.ok(Math.abs(a - b) <= tol, `${m}: ${a} ≠ ${b}`);
const area = (p) => { let A = 0; for (let i = 0; i < p.length; i++) { const [a, b] = p[i], [c, d] = p[(i + 1) % p.length]; A += a * d - c * b; } return A / 2; };
function selfInt(p) {
  const o = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  for (let i = 0; i < p.length; i++) for (let j = i + 2; j < p.length; j++) {
    if (i === 0 && j === p.length - 1) continue;
    const a = p[i], b = p[(i + 1) % p.length], c = p[j], d = p[(j + 1) % p.length];
    const e = 1e-9; if (o(a, b, c) * o(a, b, d) < -e && o(c, d, a) * o(c, d, b) < -e) return true;
  }
  return false;
}

t('dişli ölçüleri: bölüm, dış, diş dibi çapı, adım', () => {
  const d = gearDims(2, 20);
  assert.equal(d.dp, 40); assert.equal(d.da, 44); assert.equal(d.df, 35); near(d.pitch, 2 * Math.PI, 1e-12, 'adım'); near(d.rb, 20 * Math.cos(20 * Math.PI / 180), 1e-12, 'taban');
  assert.equal(centerDistance(2, 20, 40), 60);
});
t('evolvent profil: kapalı, kendini kesmiyor, dış / dip yarıçap, z diş, saat yönü tersine', () => {
  for (const [m, z] of [[2, 20], [1, 12], [3, 41], [0.5, 80]]) {
    const p = gearOutline(m, z), d = gearDims(m, z), r = p.map((q) => Math.hypot(...q));
    near(Math.max(...r), d.ra, 1e-9, 'dış'); near(Math.min(...r), d.rf, 1e-9, 'dip');
    assert.ok(area(p) > 0, 'yön'); assert.ok(!selfInt(p), 'kendini kesme m' + m + ' z' + z);
    // diş sayısı: dış yarıçapa değen tepe sayısı
    let tips = 0; for (let i = 0; i < p.length; i++) if (Math.abs(Math.hypot(...p[i]) - d.ra) < 1e-9 && Math.abs(Math.hypot(...p[(i + p.length - 1) % p.length]) - d.ra) > 1e-9) tips++;
    assert.equal(tips, z);
    // alan: bölüm dairesi alanına yakın (diş üstü ≈ diş boşluğu)
    assert.ok(Math.abs(area(p) / (Math.PI * d.rp ** 2) - 1) < 0.06, 'alan oranı ' + area(p) / (Math.PI * d.rp ** 2));
  }
});
t('diş kalınlığı bölüm dairesinde = π·m/2 (evolvent doğru)', () => {
  const m = 2, z = 30, p = gearOutline(m, z, { flank: 40 }), rp = m * z / 2;
  // 0. dişin sağ ve sol yanının bölüm dairesini kestiği açı
  const ang = []; for (let i = 0; i + 1 < p.length; i++) { const r0 = Math.hypot(...p[i]), r1 = Math.hypot(...p[i + 1]); if ((r0 - rp) * (r1 - rp) < 0) { const f = (rp - r0) / (r1 - r0); const x = p[i][0] + (p[i + 1][0] - p[i][0]) * f, y = p[i][1] + (p[i + 1][1] - p[i][1]) * f; ang.push(Math.atan2(y, x)); } if (ang.length === 2) break; }
  near(Math.abs(ang[1] - ang[0]) * rp, Math.PI * m / 2, 0.01, 'diş kalınlığı');
});
t('bağıntı oranları: dişli ters yön z1/z2, iç dişli, kasnak, kremayer π·m·z, vida adım', () => {
  assert.equal(couplingK({ t: 'gear', z1: 20, z2: 40 }), -0.5);
  assert.equal(couplingK({ t: 'igear', z1: 20, z2: 60 }), 1 / 3);
  assert.equal(couplingK({ t: 'belt', d1: 50, d2: 100 }), 0.5);
  near(couplingK({ t: 'rack', m: 2, z1: 20 }) * 360, Math.PI * 40, 1e-9, 'kremayer bir tur');
  near(couplingK({ t: 'screw', p: 5, n: 2 }) * 360, 10, 1e-9, 'vida');
  assert.equal(couplingK({ t: 'gear', z1: 20, z2: 40, rev: true }), 0.5);
  assert.equal(couplingValid({ t: 'gear', z1: 20, z2: 0 }), false);
  assert.equal(rpmToDegPerSec(60), 360);
});
t('yayılım: zincir (motor → dişli → vida), iki yönlü, çelişki algılama', () => {
  const cs = [{ t: 'gear', a: 1, b: 2, z1: 20, z2: 40 }, { t: 'screw', a: 2, b: 3, p: 4 }];
  const r = propagate(cs, 1, 360);
  assert.equal(r.deltas.get(2), -180); near(r.deltas.get(3), -2, 1e-12, 'vida'); assert.equal(r.conflict, null);
  const back = propagate(cs, 3, 1);   // sürülen itilirse sürücü geri döner
  near(back.deltas.get(2), 90, 1e-9, 'geri'); near(back.deltas.get(1), -180, 1e-9, 'geri 2');
  const loop = propagate([...cs, { t: 'ratio', a: 1, b: 3, k: 1 }], 1, 360);
  assert.ok(loop.conflict, 'kapalı döngü çelişkisi');
});

for (const [name, fn] of tests) {
  try { await fn(); console.log('ok   ', name); }
  catch (e) { fail++; console.log('FAIL ', name, '\n     ', e.message.split('\n')[0].slice(0, 600)); }
}
console.log(fail ? `\n${fail} test BAŞARISIZ` : '\nTüm testler geçti');
process.exit(fail ? 1 : 0);
