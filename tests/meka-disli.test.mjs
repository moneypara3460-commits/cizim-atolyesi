// Çalıştır: node tests/meka-disli.test.mjs — düz dişli mukavemeti
import assert from 'node:assert/strict';
import { ZH, YFS, kavrama, dinamik, gerilme, modulOner, disliHesap, disliSanitize, DISLI_ORNEK, DISLI_DEFAULTS, MODULLER, disliRapor } from '../meka/disli.js';

let fail = 0;
const t = (name, fn) => { try { fn(); console.log('ok   ', name); } catch (e) { fail++; console.log('FAIL ', name, '\n     ', String(e.message).split('\n')[0].slice(0, 300)); } };
const near = (a, b, tol, m = '') => assert.ok(Math.abs(a - b) <= tol, `${m} ${a} ≉ ${b}`);
const PI = Math.PI;

t('Katsayılar: Z_H 2,495; kavrama oranı (20/20 → 1,557, kremayere yaklaşır); Y_FS azalan; K_v hızla artar, kaliteyle azalır', () => {
  near(ZH, 2.4946, 1e-4);
  near(kavrama(1, 20, 20), 1.5568, 1e-3);
  near(kavrama(3, 20, 20), kavrama(1, 20, 20), 1e-12, 'modülden bağımsız');
  // kremayer sınırı: (√(r_a1² − r_b1²) − r₁ sin α + m / sin α) / (π m cos α)
  const al = 20 * PI / 180, kr = (Math.sqrt(11 ** 2 - (10 * Math.cos(al)) ** 2) - 10 * Math.sin(al) + 1 / Math.sin(al)) / (PI * Math.cos(al));
  assert.ok(kavrama(1, 20, 2000) > kavrama(1, 20, 60) && kavrama(1, 20, 2000) < kr); near(kavrama(1, 20, 1e7), kr, 1e-4);
  near(YFS(20), 4.13, 1e-12); assert.ok(YFS(17) > YFS(40) && YFS(40) > YFS(200));
  near(dinamik(0, 8).Kv, 1, 1e-12); assert.ok(dinamik(10, 8).Kv > dinamik(2, 8).Kv && dinamik(5, 6).Kv > dinamik(5, 10).Kv);
});
t('Gerilmeler: σH ∝ √T, σF ∝ T (K_v sabitken); elle hesapla aynı', () => {
  const g = disliSanitize({ ...DISLI_DEFAULTS, m: 3, z1: 24, z2: 72, b: 30, T1: 50, n1: 1000, KA: 1.25, Qv: 8, KB: 1.1 });
  const s = gerilme(g), s4 = gerilme({ ...g, T1: 200 });
  near(s4.sH / s.sH, 2, 1e-12); near(s4.sF1 / s.sF1, 4, 1e-12);
  const d1 = 72, Ft = 2000 * 50 / d1, v = PI * d1 * 1000 / 60000, ea = kavrama(3, 24, 72), K = 1.25 * dinamik(v, 8).Kv * 1.1;
  near(s.sH, 2.4946 * 189.8 * Math.sqrt((4 - ea) / 3) * Math.sqrt(Ft / (30 * d1) * 4 / 3 * K), 0.05);
  near(s.sF1, Ft / 90 * (3.47 + 13.2 / 24) * (0.25 + 0.75 / ea) * K, 1e-9);
  near(s.SH, 580 / s.sH, 1e-12); near(s.SF2, 440 / s.sF2, 1e-12);
});
t('Taşınabilecek tork: o torkta emniyet tam sınırda; modül önerisi en küçük yeten standart modül', () => {
  const g = disliSanitize(DISLI_ORNEK()), r = disliHesap(g);
  const s = gerilme({ ...g, T1: r.Tmax }), lim = Math.min(s.SH / g.SHmin, Math.min(s.SF1, s.SF2) / g.SFmin);
  near(lim, 1, 0.02, 'sınırda (K_v aynı kaldığı için tam 1)');
  const agir = { ...g, T1: 120 }, m = modulOner(agir), i = MODULLER.indexOf(m);
  assert.ok(m > g.m, 'ağır yükte modül büyür: ' + m);
  const ok = (mm) => { const q = gerilme(agir, mm); return q.SH >= g.SHmin && Math.min(q.SF1, q.SF2) >= g.SFmin; };
  assert.ok(ok(m) && !ok(MODULLER[i - 1]), 'bir küçük modül yetmez');
});
t('Kontroller: şablon uygun; aşırı yük hata; az diş alttan kesme; dar diş uyarısı; elle malzeme', () => {
  assert.ok(disliHesap(DISLI_ORNEK()).uygun);
  const a = disliHesap({ ...DISLI_ORNEK(), T1: 60 });
  assert.ok(!a.uygun && a.kontroller.some((k) => k.duzey === 'hata' && /Yüzey ezilmesine/.test(k.metin)) && /yeten en küçük standart modül/.test(a.kontroller.at(-1).metin));
  const z = disliHesap({ ...DISLI_ORNEK(), z1: 12 }); assert.ok(!z.uygun && /alttan kesilir/.test(z.kontroller[0].metin));
  const d = disliHesap({ ...DISLI_ORNEK(), b: 8 }); assert.ok(d.kontroller.some((k) => !k.ok && /dar/.test(k.metin)));
  assert.ok(/sınır gerilmelerini/.test(disliHesap({ ...DISLI_ORNEK(), mat1: 'ozel', H1: 0 }).hata));
  const o = disliHesap({ ...DISLI_ORNEK(), mat1: 'ozel', H1: 1000, F1: 300, mat2: 'ozel', H2: 1000, F2: 300 });
  near(o.SH, 1000 / o.sH, 1e-12);
  assert.equal(disliSanitize({ mat1: 'yok' }).mat1, DISLI_DEFAULTS.mat1);
  const rp = disliRapor(disliHesap(DISLI_ORNEK()), 'Deneme').join('\n'); assert.ok(/MUKAVEMET/.test(rp) && /S_H/.test(rp) && /ISO 6336/.test(rp));
});

if (fail) { console.log(fail + ' test başarısız'); process.exit(1); }
console.log('Tüm testler geçti');
