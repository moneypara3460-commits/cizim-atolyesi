// Çalıştır: node tests/meka-krank.test.mjs — krank–biyel mekanizması
import assert from 'node:assert/strict';
import { konum, strok, stroktanR, krankHesap, krankSanitize, KRANK_ORNEK, KRANK_DEFAULTS, krankCSV, krankRapor } from '../meka/krank.js';

let fail = 0;
const t = (name, fn) => { try { fn(); console.log('ok   ', name); } catch (e) { fail++; console.log('FAIL ', name, '\n     ', String(e.message).split('\n')[0].slice(0, 300)); } };
const near = (a, b, tol, m = '') => assert.ok(Math.abs(a - b) <= tol, `${m} ${a} ≉ ${b}`);
const PI = Math.PI;

t('Kinematik: kaçıklıksız bilinen değerler; türevler sayısal türevle aynı (kaçıklıklı da)', () => {
  const r = 40, l = 160;
  near(konum(0, r, l, 0).x, r + l, 1e-12); near(konum(PI, r, l, 0).x, l - r, 1e-12);
  near(konum(PI / 2, r, l, 0).x1, -r, 1e-12);                          // θ = 90°: v = −rω
  near(konum(0, r, l, 0).x2, -r * (1 + r / l), 1e-9);                    // θ = 0: a = −rω²(1 + r/l)
  near(konum(PI, r, l, 0).x2, r * (1 - r / l), 1e-9);
  for (const e of [0, 15, -20]) for (let th = 0; th < 2 * PI; th += 0.13) {
    const h = 1e-5, a = konum(th - h, r, l, e), b = konum(th + h, r, l, e), c = konum(th, r, l, e);
    near((b.x - a.x) / (2 * h), c.x1, 1e-5); near((b.x1 - a.x1) / (2 * h), c.x2, 1e-4);
  }
});
t('Strok, ölü noktalar ve çabuk dönüş: sayısal tarama ile aynı; stroktan krank yarıçapı', () => {
  const r = 40, l = 150, e = 25, R = krankHesap({ r, l, e, n: 60 });
  let mx = -Infinity, mn = Infinity, tMx = 0, tMn = 0;
  for (let i = 0; i < 200000; i++) { const th = i * 2 * PI / 200000, x = konum(th, r, l, e).x; if (x > mx) { mx = x; tMx = th; } if (x < mn) { mn = x; tMn = th; } }
  near(R.H, mx - mn, 1e-6); near(R.thOn, tMx, 1e-4); near(R.thArka, tMn, 1e-4);
  // ileri (arka → ön) ve geri süreleri oranı
  const ileri = (tMx - tMn + 2 * PI) % (2 * PI), geri = 2 * PI - ileri;
  near(R.cabuk, Math.max(ileri, geri) / Math.min(ileri, geri), 1e-3);
  near(strok(40, 160, 0), 80, 1e-12);
  near(strok(stroktanR(100, 200, 10), 200, 10), 100, 1e-9); near(stroktanR(80, 160, 0), 40, 1e-9);
  assert.equal(stroktanR(400, 160, 0), null);
});
t('Kuvvet ve tork: güç dengesi (T·ω = F·v), eylemsizlik kuvveti m·a; biyel ve yan kuvvet', () => {
  const R = krankHesap({ ...KRANK_ORNEK() });
  assert.ok(R.uygun, JSON.stringify(R.kontroller.filter((c) => !c.ok)));
  for (const q of R.rows) {
    const yon = q.v > 1e-12 ? 1 : q.v < -1e-12 ? -1 : 0, Fx = 3 * q.a + (yon > 0 ? 150 : 0);
    near(q.T * R.w, Fx * q.v, 1e-9);
    near(q.Fr, Math.abs(Fx) / Math.cos(q.phi * PI / 180), 1e-9);
  }
  // yalnız kütle: bir turda net iş sıfır (ortalama tork ≈ 0)
  const M = krankHesap({ r: 40, l: 170, m: 5, F: 0, n: 120 }); near(M.Tort, 0, 1e-6);
  // sabit direnç iki yönde: ortalama güç = F · 2H / çevrim süresi
  const H = krankHesap({ r: 40, l: 170, m: 0, F: 200, yuk: 'hep', n: 60 }); near(H.Port, 200 * 2 * H.H / 1000 / 1, 0.5);
});
t('Denetimler: kısa biyel (l/r, biyel açısı), takılan mekanizma; saat yönü', () => {
  const k = krankHesap({ r: 50, l: 110 }); assert.ok(!k.uygun && k.kontroller.some((c) => !c.ok && /Biyel \/ krank oranı/.test(c.metin)));
  assert.ok(krankHesap({ r: 50, l: 60, e: 20 }).hata);
  const a = krankHesap({ r: 40, l: 160 }), b = krankHesap({ r: 40, l: 160, yon: 'cw' });
  near(a.vMax, b.vMax, 1e-12); near(a.H, b.H, 1e-12);
  assert.equal(krankCSV(a).trim().split('\r\n').length, 361);
  assert.ok(krankRapor(a).some((l) => /Strok 80\.000 mm/.test(l)));
  assert.equal(krankSanitize({ yuk: 'x', r: 'a' }).yuk, 'ileri'); assert.equal(krankSanitize({ r: 'a' }).r, KRANK_DEFAULTS.r);
});

console.log(fail ? `\n${fail} test BAŞARISIZ` : '\nTüm testler geçti');
process.exit(fail ? 1 : 0);
