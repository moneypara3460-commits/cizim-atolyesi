// Çalıştır: node tests/sac.test.mjs
// Flanşlı sac tava (sac.js): büküm payı / düşümü, açınım, köşe kapatma, hacim, kapalı mesh, hatalar.
import assert from 'node:assert/strict';
import { tavaCalc, rectUnionOutline, TAVA_VARSAYILAN, KOSE_ARALIK_ONERI } from '../sac.js';
import { sheetCalc, sheetFlatLines, SHEET_DEFAULTS, SHEET_PRESETS } from '../logic.js';

let fail = 0;
const t = (name, fn) => {
  try { fn(); console.log('ok   ', name); }
  catch (e) { fail++; console.log('FAIL ', name, '\n     ', String(e.message || e).split('\n').slice(0, 4).join(' / ')); }
};
const near = (a, b, e, m) => assert.ok(Math.abs(a - b) <= e, (m || '') + ' ' + a + ' ≠ ' + b);
const P = (o = {}) => ({ ...SHEET_DEFAULTS, ...JSON.parse(JSON.stringify(TAVA_VARSAYILAN)), ...o });
const vol = (pos) => { let V = 0; for (let i = 0; i < pos.length; i += 9) { const a = pos.slice(i, i + 3), b = pos.slice(i + 3, i + 6), c = pos.slice(i + 6, i + 9); V += (a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0])) / 6; } return V; };

t('BA, OSSB, BD: kaynaklardaki örnekle aynı (R 3, T 3, K 0,33, 90° → BA 6,27, OSSB 6, BD 5,73)', () => {
  const c = tavaCalc(P({ st: 3, sr: 3, sk: 0.33 }));
  near(c.ba, 6.27, 0.005, 'BA'); near(c.ossb, 6, 1e-9, 'OSSB'); near(c.bd, 5.73, 0.005, 'BD');
});

t('açınım: A + ΣL − n·BD (4 flanş 30, 120 × 80, T 2 R 2 K 0,44)', () => {
  const c = tavaCalc(P());
  const BA = Math.PI / 2 * (2 + 0.44 * 2), BD = 2 * 4 - BA;
  assert.ok(c.ok, c.err);
  near(c.flatL, 120 + 60 - 2 * BD, 1e-9, 'X'); near(c.W, 80 + 60 - 2 * BD, 1e-9, 'Z');
  assert.equal(c.bends.length, 4);
  assert.deepEqual(c.size.map((v) => Math.round(v * 1e6) / 1e6), [120, 30, 80]);
  // açık köşe: artı şekli (12 köşeli tek halka), alanı = dikdörtgenler toplamı
  assert.equal(c.flat.loops.length, 1); assert.equal(c.flat.loops[0].length, 12);
  const Af = 112, Bf = 72, Lf = 26;
  near(c.flat.alan, Af * Bf + 2 * (Af + Bf) * (BA + Lf), 1e-6, 'alan');
  // büküm çizgileri büküm bölgesinin ortasında
  const lines = sheetFlatLines(c).bendLines;
  assert.equal(lines.length, 4);
  assert.ok(lines.some((l) => Math.abs(l[0] - (Lf + BA / 2)) < 1e-9 && Math.abs(l[2] - l[0]) < 1e-9), 'sol büküm çizgisi');
});

t('3D hacim: analitik değere yakın, üçgen toplamı = hesap; kalınlık yönleri doğru', () => {
  const c = tavaCalc(P());
  const bend = Math.PI / 2 * 2 * (2 + 1), V = 112 * 72 * 2 + 2 * (112 + 72) * (bend + 2 * 26);
  near(c.hacim, V, V * 2e-4, 'hacim'); near(vol(c.tris), c.hacim, 1e-6, 'üçgen hacmi');
  assert.ok(vol(c.tris) > 0, 'dışa dönük');
});

t('kapalı köşe: ön/arka uzar (R+T), sol/sağ aralık bırakır (R − g); açınım üst üste binmez', () => {
  const c = tavaCalc(P({ kk: 'kapali', kg: 0.5 }));
  assert.ok(c.ok, c.err); assert.ok(c.kapali);
  assert.deepEqual(c.kenar.on.uzatma.map((v) => +v.toFixed(9)), [4, 4]); assert.deepEqual(c.kenar.sol.uzatma.map((v) => +v.toFixed(9)), [1.5, 1.5]);
  // sol flanş arka flanşın iç yüzünden g kadar uzakta biter: z = T + g
  near(c.kenar.sol.duz[0], 2 + 0.5, 1e-9, 'aralık');
  const base = tavaCalc(P()), extra = 4 * 2 * 26 * 4 + 4 * 2 * 26 * 1.5;
  near(c.hacim - base.hacim, extra, 1e-6, 'uzatma hacmi');
  near(c.flat.alan, base.flat.alan + 4 * 26 * 4 + 4 * 26 * 1.5, 1e-6, 'açınım alanı (çakışma yok)');
  assert.equal(c.flat.loops.length, 1);
  assert.deepEqual(c.uyari, []);
  const z = tavaCalc(P({ kk: 'kapali', ko: 'z', kg: 0.5 }));
  assert.deepEqual(z.kenar.sag.uzatma.map((v) => +v.toFixed(9)), [4, 4]);
});

t('uyarı ve hatalar: küçük aralık, 90° dışı kapalı köşe, kısa flanş, dar taban', () => {
  assert.equal(tavaCalc(P({ kk: 'kapali', kg: 0.1 })).uyari.length, 1);
  assert.ok(KOSE_ARALIK_ONERI === 0.4);
  const a = tavaCalc(P({ kk: 'kapali', tq: 60 }));
  assert.ok(!a.ok && /90°/.test(a.err)); assert.ok(!a.kapali);
  const k = tavaCalc(P({ fl: { on: 3, arka: 30, sol: 30, sag: 30 } }));
  assert.ok(!k.ok && /Ön \(\+Z\) flanşı büküm payından kısa/.test(k.err));
  const d = tavaCalc(P({ ta: 6 }));
  assert.ok(!d.ok && /Taban X/.test(d.err));
});

t('açılı flanş ve tek kenar: 60° dış ölçü ve açınım; flanşsız kenarda taban tam boy', () => {
  const c = tavaCalc(P({ tq: 60 }));
  near(c.size[0], 120 + 2 * 30 * Math.cos(Math.PI / 3), 1e-6, 'X');
  near(c.size[1], 30 * Math.sin(Math.PI / 3) + 2 * Math.cos(Math.PI / 3), 1e-6, 'Y (iç uç)');
  const BA = Math.PI / 3 * (2 + 0.88), BD = 2 * Math.tan(Math.PI / 6) * 4 - BA;
  near(c.flatL, 120 + 60 - 2 * BD, 1e-9, 'açınım');
  const s = tavaCalc(P({ fl: { on: 30, arka: 0, sol: 0, sag: 0 } }));
  near(s.flatL, 120, 1e-9); near(s.W, 80 + 30 - (2 * 4 - Math.PI / 2 * 2.88), 1e-9);
  assert.equal(s.flat.loops[0].length, 4);
});

t('sheetCalc tava kipine geçer; hazır profil hesabı değişmez', () => {
  const c = sheetCalc({ ...SHEET_DEFAULTS, ...JSON.parse(JSON.stringify(SHEET_PRESETS.tava)) });
  assert.ok(c.tava && c.ok);
  const L = sheetCalc({ ...SHEET_DEFAULTS, ...SHEET_PRESETS.L });
  assert.ok(!L.tava); near(L.flatL, 80 - (2 * 4 - Math.PI / 2 * 2.88), 1e-9);
});

t('rectUnionOutline: L şekli tek halka, 6 köşe, alan doğru', () => {
  const u = rectUnionOutline([[0, 0, 10, 2], [0, 0, 2, 10]]);
  assert.equal(u.loops.length, 1); assert.equal(u.loops[0].length, 6); near(u.area, 36, 1e-9);
});

if (fail) { console.log(fail + ' test başarısız'); process.exit(1); }
console.log('Hepsi geçti');
