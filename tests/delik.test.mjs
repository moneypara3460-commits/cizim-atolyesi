// Çalıştır: node tests/delik.test.mjs
// Delik sihirbazı (delik.js): ölçü tabloları kaynaklarla karşılaştırılır, kesit ve hacim hesabı denetlenir.
import assert from 'node:assert/strict';
import * as D from '../delik.js';

let fail = 0;
const t = (name, fn) => {
  try { fn(); console.log('ok   ', name); }
  catch (e) { fail++; console.log('FAIL ', name, '\n     ', String(e.message || e).split('\n').slice(0, 4).join(' / ')); }
};
const near = (a, b, tol, m = '') => assert.ok(Math.abs(a - b) <= tol, `${m} ${a} ≉ ${b} (±${tol})`);
const PI = Math.PI;

t('1) tablolar tutarlı: her ölçüde adım, matkap, ISO 273 üç seri; matkap < çap < geçiş; ince < orta < kaba', () => {
  for (const m of D.OLCULER) {
    const d = D.capOf(m);
    assert.ok(D.KABA[m] > 0, m + ' adım');
    for (const p of D.adimlar(m)) {
      const k = D.MATKAP[m][p];
      assert.ok(k > 0 && k < d, m + '×' + p + ' matkap ' + k);
      assert.ok(Math.abs(k - (d - p)) <= 0.06, m + '×' + p + ' matkap D − P\'ye yakın: ' + k);   // piyasa matkabına yuvarlama en çok 0,05
    }
    const [a, b, c] = D.GECIS[m];
    assert.ok(d < a && a < b && b < c, m + ' ISO 273 sırası ' + [a, b, c]);
    if (D.KADEME[m]) assert.ok(D.KADEME[m] > c, m + ' kademe çapı geçişten büyük');
    if (D.HAVSA_15065[m]) assert.ok(D.HAVSA_15065[m] > b, m + ' havşa çapı geçişten büyük');
    if (D.HAVSA_10642[m]) assert.ok(D.HAVSA_10642[m] > b, m + ' ISO 10642 baş çapı geçişten büyük');
  }
});

t('2) kaynaklardaki örnek değerler (ISO 261, ISO 273, ISO 15065, ISO 10642, ASME B18.3.1M)', () => {
  assert.equal(D.KABA.M8, 1.25); assert.equal(D.KABA.M12, 1.75); assert.equal(D.KABA.M24, 3);
  assert.equal(D.MATKAP.M8[1.25], 6.8); assert.equal(D.MATKAP.M12[1.75], 10.2); assert.equal(D.MATKAP.M10[1.25], 8.8);
  assert.deepEqual(D.GECIS.M8, [8.4, 9, 10]); assert.deepEqual(D.GECIS.M12, [13, 13.5, 14.5]); assert.deepEqual(D.GECIS.M20, [21, 22, 24]);
  assert.equal(D.HAVSA_15065.M4, 9.6); assert.equal(D.HAVSA_15065.M6, 12.85);
  assert.equal(D.HAVSA_10642.M8, 17.92); assert.equal(D.KADEME.M6, 11.25); assert.equal(D.KADEME.M16, 25.5);
  // ISO 15065 t ≈ (D_c,max − d_h,min) / 2: tablodaki t değerleri (M3 1,55 · M4 2,55 · M6 3,13 · M8 4,28 · M10 4,65)
  for (const [m, tt] of [['M3', 1.55], ['M4', 2.55], ['M6', 3.13], ['M8', 4.28], ['M10', 4.65]]) near((D.HAVSA_15065[m] - D.GECIS[m][1]) / 2, tt, 0.006, m + ' havşa derinliği');
});

t('3) kılavuz: M8 kör 20 mm — matkap 6,8, diş boyu 20 − 3·1,25, 118° uç', () => {
  const k = D.delikKesiti({ tur: 'klavuz', olcu: 'M8', derinlik: 20 });
  assert.equal(k.d, 6.8);
  assert.equal(k.thread.boy, 16.25);
  assert.equal(k.thread.kaba, true);
  assert.equal(D.disYazisi(k.thread), 'M8-6H ↧ 16,25');
  const uc = k.segs.find((s) => s.rol === 'uc');
  near(uc.top - uc.bottom, 3.4 / Math.tan(59 * PI / 180), 1e-9, 'uç boyu');
  assert.ok(/M8 kılavuz/.test(k.label));
  // ince diş ve diş boyu girişi
  const f = D.delikKesiti({ tur: 'klavuz', olcu: 'M10', adim: 1.25, derinlik: 25, disBoyu: 18 });
  assert.equal(f.d, 8.8); assert.equal(f.thread.boy, 18); assert.equal(f.thread.kaba, false);
  assert.equal(D.disYazisi(f.thread), 'M10×1,25-6H ↧ 18');
  // diş boyu derinlikten uzunsa uyarı ve kısaltma
  const u = D.delikKesiti({ tur: 'klavuz', olcu: 'M6', derinlik: 10, disBoyu: 15 });
  assert.equal(u.thread.boy, 10); assert.ok(u.warn.length);
});

t('4) düz, kademeli, havşa: çaplar ve hatalı derinlik', () => {
  assert.equal(D.delikKesiti({ tur: 'duz', olcu: 'M8', seri: 'ince', boydan: true }, 50).d, 8.4);
  const c = D.delikKesiti({ tur: 'kademe', olcu: 'M6', derinlik: 30 });
  const kd = c.segs.find((s) => s.rol === 'kademe');
  assert.equal(kd.d, 11.25); assert.equal(kd.bottom, -6);   // baş yüksekliği k = d
  assert.ok(D.delikKesiti({ tur: 'kademe', olcu: 'M6', derinlik: 5 }).hata, 'kademe delikten derin olamaz');
  const h = D.delikKesiti({ tur: 'havsa', olcu: 'M5', derinlik: 12 });
  const hv = h.segs.find((s) => s.rol === 'havsa');
  near(-hv.bottom, (10.65 - 5.5) / 2, 1e-12); near(hv.dTop - hv.dBottom, 2 * (hv.top - hv.bottom), 1e-9, '90°');
  assert.equal(D.normalize({ tur: 'havsa', havsaStd: 'iso15065', olcu: 'M12' }).olcu, 'M6', 'ISO 15065 M12 yok → geçerli ölçü');
  assert.ok(D.olculer('havsa', 'iso10642').includes('M12'));
});

// kesit hacmi (yüzeyin altı) — kesin formül
function exact(k) {
  const L = -Math.min(...k.segs.filter((s) => s.rol === 'govde').map((s) => s.bottom)), r = k.d / 2;
  let v = PI * r * r * L;
  for (const s of k.segs) {
    if (s.rol === 'uc') v += PI * r * r * (s.top - s.bottom) / 3;
    if (s.rol === 'kademe') v += PI * (s.d * s.d / 4 - r * r) * -s.bottom;
    if (s.rol === 'havsa') { const tt = -s.bottom, R = r + tt; v += PI * tt / 3 * (R * R + R * r + r * r) - PI * r * r * tt; }
  }
  return v;
}
t('5) kesit hacmi (sayısal dilim) kesin formülle uyuşur — her tür', () => {
  for (const o of [{ tur: 'klavuz', olcu: 'M8', derinlik: 20 }, { tur: 'duz', olcu: 'M10', derinlik: 15, uc: false }, { tur: 'kademe', olcu: 'M6', derinlik: 30 },
    { tur: 'havsa', olcu: 'M5', derinlik: 12 }, { tur: 'havsa', havsaStd: 'iso10642', olcu: 'M12', boydan: true }]) {
    const k = D.delikKesiti(o, 40), e = exact(k);
    near(D.kesitHacmi(k), e, e * 2e-4, o.tur + ' ' + o.olcu);
  }
});

t('6) geçersiz girdiler varsayılana döner', () => {
  const o = D.normalize({ tur: 'xx', olcu: 'M99', adim: 7, seri: 'q', derinlik: -3 });
  assert.equal(o.tur, 'klavuz'); assert.equal(o.olcu, 'M6'); assert.equal(o.adim, 1); assert.equal(o.seri, 'orta'); assert.equal(o.derinlik, 12);
});

console.log(fail ? `\n${fail} test başarısız` : '\nhepsi geçti');
process.exit(fail ? 1 : 0);
