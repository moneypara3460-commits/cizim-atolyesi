// Çalıştır: node tests/meka-yay.test.mjs — helisel basma yayı
import assert from 'node:assert/strict';
import { sabit, bergstrasser, tau, burkulma, sarimdanR, rmTel, yayHesap, yaySanitize, YAY_ORNEK, yayRapor } from '../meka/yay.js';

let fail = 0;
const t = (name, fn) => { try { fn(); console.log('ok   ', name); } catch (e) { fail++; console.log('FAIL ', name, '\n     ', String(e.message).split('\n')[0].slice(0, 300)); } };
const near = (a, b, tol, m = '') => assert.ok(Math.abs(a - b) <= tol, `${m} ${a} ≉ ${b}`);
const PI = Math.PI;

t('Temel formüller: yay sabiti, Bergsträsser, kayma gerilmesi; sarımdan R tersine; R_m tablo ve ara değer', () => {
  near(sabit(81500, 2, 16, 8), 81500 * 16 / (8 * 4096 * 8), 1e-12);
  near(sarimdanR(81500, 2, 16, sabit(81500, 2, 16, 8)), 8, 1e-12);
  near(bergstrasser(8), 8.5 / 7.25, 1e-12); assert.ok(bergstrasser(4) > bergstrasser(10) && bergstrasser(10) > 1);
  near(tau(100, 20, 2.5), 800 * 20 / (PI * 15.625), 1e-9);
  assert.equal(rmTel('dh', 2), 1980); assert.equal(rmTel('dh', 0.2), 2480); assert.equal(rmTel('ozel', 2), null);
  const r = rmTel('dh', 2.5); assert.ok(r < 1980 && r > 1840, 'ara değer: ' + r);
  assert.ok(rmTel('ns', 3) < rmTel('dh', 3), 'paslanmaz daha düşük');
});
t('Burkulma: mutlak kararlılık sınırı ≈ 2,63·D/α (çelik); sınırın üstünde kritik çökme L₀ ile azalır ve sürekli', () => {
  const b = burkulma(50, 20, 0.5, 207000, 79300);
  near(b.sinir * 0.5 / 20, 2.63, 0.01);
  assert.ok(b.kararli);
  const s1 = burkulma(120, 20, 0.5, 207000, 79300), s2 = burkulma(200, 20, 0.5, 207000, 79300);
  assert.ok(!s1.kararli && s2.scr / 200 < s1.scr / 120, 'uzun yay oransal olarak daha erken burkulur');
  const es = burkulma(b.sinir * 1.0001, 20, 0.5, 207000, 79300); near(es.scr, b.sinir * 207000 / (2 * (207000 - 79300)), 0.02 * b.sinir, 'sınırda s_cr ≈ C₁·L₀ (Shigley C₁ 0,812)');
  assert.ok(burkulma(100, 20, 1, 207000, 79300).scr < burkulma(100, 20, 0.707, 207000, 79300).scr || burkulma(100, 20, 0.707, 207000, 79300).kararli);
});
t('Hesap: kuvvetler doğrusal, blok ve ara boşluk; Goodman ve doğal frekans elle aynı; şablon uygun', () => {
  const r = yayHesap(YAY_ORNEK()), g = r.g;
  near(r.F2 / r.F1, (g.L0 - g.L2) / (g.L0 - g.L1), 1e-12); near(r.Lc, 25, 1e-12);
  near(r.Ln - r.Lc, (0.0015 * 400 / 2.5 + 0.25) * 8, 1e-12);
  const Ssu = 0.67 * r.Rm, Sse = 241 / (1 - 379 / Ssu); near(r.nf, 1 / (r.ta / Sse + r.tm / Ssu), 1e-12);
  near(r.ta, r.k * (r.t2 - r.t1) / 2, 1e-9);
  const m = 7850 * PI * PI * 2.5 * 2.5 * 20 * 8 / 4 * 1e-9; near(r.fn, 0.5 * Math.sqrt(r.R * 1000 / m), 1e-9);
  assert.ok(r.uygun && r.kontroller.every((k) => k.ok));
  const bil = yayHesap({ ...YAY_ORNEK(), bilye: 'evet' }); assert.ok(bil.nf > r.nf, 'bilyeli daha dayanıklı');
});
t('Hatalar ve uyarılar: aşırı gerilme, blok boyunun altı, burkulma, yorulma, gevşek sarım, sıra dışı boylar', () => {
  const asiri = yayHesap({ ...YAY_ORNEK(), d: 1.2, n: 3, nt: 5, L2: 15 });
  assert.ok(!asiri.uygun && asiri.kontroller.some((k) => !k.ok && /kalıcı olarak kısalır/.test(k.metin)));
  const blok = yayHesap({ ...YAY_ORNEK(), L2: 24 }); assert.ok(!blok.uygun && blok.kontroller.some((k) => /blok boyundan/.test(k.metin)));
  const yakin = yayHesap({ ...YAY_ORNEK(), L2: 27 }); assert.ok(yakin.kontroller.some((k) => !k.ok && k.duzey === 'uyari' && /neredeyse/.test(k.metin)));
  const uzun = yayHesap({ ...YAY_ORNEK(), L0: 160, L1: 140, L2: 70, n: 25, nt: 27, uc: 1 });
  assert.ok(uzun.kontroller.some((k) => !k.ok && /yana kaçar/.test(k.metin)), 'burkulma uyarısı');
  const yor = yayHesap({ ...YAY_ORNEK(), L1: 60, L2: 30 });
  assert.ok(yor.kontroller.some((k) => !k.ok && /Yorulma emniyeti/.test(k.metin)) && /Bilyeli/.test(yor.kontroller.find((k) => /Yorulma/.test(k.metin)).metin));
  const st = yayHesap({ ...YAY_ORNEK(), L1: 60, L2: 30, dinamik: 'hayir' }); assert.ok(!st.kontroller.some((k) => /Yorulma/.test(k.metin)), 'statikte yorulma denetimi yok');
  assert.ok(yayHesap({ ...YAY_ORNEK(), D: 60 }).kontroller.some((k) => !k.ok && /gevşek/.test(k.metin)));
  assert.ok(/sırayla küçülmeli/.test(yayHesap({ ...YAY_ORNEK(), L1: 30, L2: 40 }).hata));
  assert.ok(/çekme dayanımını/.test(yayHesap({ ...YAY_ORNEK(), mat: 'ozel', Rm: 0 }).hata));
  assert.equal(yaySanitize({ mat: 'x', uc: 3 }).mat, 'dh'); assert.equal(yaySanitize({ uc: 3 }).uc, 0.5);
  const rp = yayRapor(yayHesap(YAY_ORNEK()), 'Deneme').join('\n'); assert.ok(/BASMA YAYI/.test(rp) && /EN 13906-1/.test(rp) && /Yorulma/.test(rp));
});

if (fail) { console.log(fail + ' test başarısız'); process.exit(1); }
console.log('Tüm testler geçti');
