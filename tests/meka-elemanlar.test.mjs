// Çalıştır: node tests/meka-elemanlar.test.mjs — kayış–kasnak, kama, cıvata
import assert from 'node:assert/strict';
import { boy, eksen, cBeta, kasnakHesap, KASNAK_ORNEK, kasnakRapor, kasnakSanitize } from '../meka/kasnak.js';
import { kamaOlcu, kamaHesap, KAMA_ORNEK, kamaRapor } from '../meka/kama.js';
import { dis, onGerilme, tork, civataHesap, boyutOner, CIVATA_ORNEK, civataRapor, civataSanitize } from '../meka/civata.js';

let fail = 0;
const t = (name, fn) => { try { fn(); console.log('ok   ', name); } catch (e) { fail++; console.log('FAIL ', name, '\n     ', String(e.message).split('\n')[0].slice(0, 300)); } };
const near = (a, b, tol, m = '') => assert.ok(Math.abs(a - b) <= tol, `${m} ${a} ≉ ${b}`);
const PI = Math.PI;

t('Kasnak geometrisi: eşit kasnakta L = 2a + πd; boydan eksen tersine; sarım açısı; c_β (180° → 1)', () => {
  near(boy(300, 100, 100), 600 + PI * 100, 1e-9);
  for (const [a, d1, d2] of [[400, 100, 200], [250, 80, 315], [1000, 63, 500]]) near(eksen(boy(a, d1, d2), d1, d2), a, 1e-6);
  assert.equal(eksen(100, 100, 200), null, 'boy yetmiyor');
  near(cBeta(PI), 1, 1e-12); assert.ok(cBeta(2 * PI / 3) < 0.9);
  const r = kasnakHesap(KASNAK_ORNEK());
  near(r.beta, 180 - 2 * Math.asin(100 / (2 * r.a)) * 180 / PI, 1e-9); near(r.L, 1120, 1e-6);
});
t('Kasnak kuvvetleri: F₁ − F₂ = çevre kuvveti, Euler oranı; 180° sarımda mil yükü F₁ + F₂; triger boyu hatvenin katı', () => {
  const r = kasnakHesap(KASNAK_ORNEK());
  near(r.F1 - r.F2, r.Ft, 1e-9); near(r.F1 / r.F2, Math.exp(0.25 / Math.sin(19 * PI / 180) * r.beta * PI / 180), 1e-9);
  near(r.Ft, 1500 * 1.2 / r.v, 1e-9); near(r.n2, 700, 1e-9);
  const e = kasnakHesap({ ...KASNAK_ORNEK(), d2: 100, L: 0, a: 300 }); near(e.Fw, e.F1 + e.F2, 1e-6, 'eşit kasnak');
  const tr = kasnakHesap({ ...KASNAK_ORNEK(), tip: 'triger', p: 5, z1: 20, z2: 40, L: 603 });
  assert.equal(tr.dis, 121); near(tr.L, 605, 1e-9); near(boy(tr.a, 100 / PI, 200 / PI), 605, 1e-6);
  assert.ok(/hatvenin katına/.test(tr.kontroller.map((k) => k.metin).join(' ')));
  near(tr.zk, 20 * tr.beta / 360, 1e-9);
});
t('Kasnak kontrolleri: küçük sarım açısı, az kavrayan diş, yüksek hız; kayış sayısı', () => {
  const k = kasnakHesap({ ...KASNAK_ORNEK(), d1: 80, d2: 400, L: 0, a: 260 }); assert.ok(k.kontroller.some((q) => !q.ok && /sarım açısı/.test(q.metin)));
  const z = kasnakHesap({ ...KASNAK_ORNEK(), tip: 'triger', z1: 10, z2: 60, L: 0, a: 70 }); assert.ok(!z.uygun && /diş kavrıyor/.test(z.kontroller[0].metin));
  const h = kasnakHesap({ ...KASNAK_ORNEK(), d1: 300, d2: 600, L: 0, a: 900, n1: 3000 }); assert.ok(h.kontroller.some((q) => !q.ok && /Kayış hızı/.test(q.metin)));
  const r = kasnakHesap(KASNAK_ORNEK()); near(r.adet, 1.5 * 1.2 / (1.2 * cBeta(r.beta * PI / 180)), 1e-9);
  assert.equal(kasnakSanitize({ tip: 'x' }).tip, 'v'); assert.ok(/KAYIŞ–KASNAK/.test(kasnakRapor(r, 'D').join('\n')));
});
t('Kama: DIN 6885 ölçüleri; basınç formülü; gereken boyda basınç tam sınırda; iki kama 1,5 kat; uyarılar', () => {
  assert.deepEqual(kamaOlcu(30), { b: 8, h: 7, t1: 4 }); assert.deepEqual(kamaOlcu(31), { b: 10, h: 8, t1: 5 }); assert.deepEqual(kamaOlcu(17), { b: 5, h: 5, t1: 3 });
  assert.equal(kamaOlcu(5), null); assert.equal(kamaOlcu(151), null);
  const r = kamaHesap(KAMA_ORNEK()); near(r.p, 2 * 120e3 * 1.25 / (30 * 3 * 32), 1e-9);
  const s = kamaHesap({ ...KAMA_ORNEK(), L: r.Lmin }); near(s.p, s.pizin, 1e-9);
  near(kamaHesap({ ...KAMA_ORNEK(), adet: 2 }).p, r.p / 1.5, 1e-9);
  const a = kamaHesap({ ...KAMA_ORNEK(), T: 300 }); assert.ok(!a.uygun && /en az \d+ mm/.test(a.kontroller[0].metin));
  assert.ok(kamaHesap({ ...KAMA_ORNEK(), L: 60 }).kontroller.some((q) => !q.ok && /çok uzun/.test(q.metin)));
  assert.ok(/genişliğinden/.test(kamaHesap({ ...KAMA_ORNEK(), L: 8 }).hata));
  assert.ok(/PARALEL KAMA/.test(kamaRapor(r, 'D').join('\n')));
});
t('Cıvata: gerilme kesiti; VDI tablo değerleri (M8 8.8 μ 0,14: 18,1 kN / 27,3 N·m; M12: 41,9 kN / 93 N·m)', () => {
  near(dis('M8').As, 36.6, 0.05); near(dis('M12').As, 84.3, 0.1); near(dis('M16').As, 157, 0.5);
  const m8 = dis('M8'), F8 = onGerilme(m8, 640, 0.14); near(F8 / 1000, 18.1, 0.1); near(tork(m8, F8, 0.14), 27.3, 0.3);
  const m12 = dis('M12'), F12 = onGerilme(m12, 640, 0.14); near(F12 / 1000, 41.9, 0.2); near(tork(m12, F12, 0.14), 93, 1);
  assert.ok(onGerilme(m8, 640, 0.1) > F8, 'yağlıda ön gerilme artar');
});
t('Cıvata kontrolleri: şablon (M10) uygun; M8 ile kayma yetmez ve M10 önerilir; ayrılma; elle sıkma uyarısı', () => {
  assert.ok(civataHesap(CIVATA_ORNEK()).uygun);
  const r = civataHesap({ ...CIVATA_ORNEK(), boyut: 'M8' });
  assert.ok(!r.uygun && r.oner === 'M10' && r.kontroller.some((q) => !q.ok && /parçalar kayar/.test(q.metin)));
  near(r.FKR, 0.9 * r.FMzul / 1.6 - 0.8 * 500, 1e-9); near(r.FKQ, 1500 / 0.15, 1e-9);
  assert.ok(civataHesap({ ...CIVATA_ORNEK(), boyut: 'M10' }).uygun);
  assert.equal(boyutOner({ ...CIVATA_ORNEK(), boyut: 'M10' }), 'M10');
  const ayr = civataHesap({ ...CIVATA_ORNEK(), FA: 100000, FQ: 0 }); assert.ok(!ayr.uygun && ayr.kontroller.some((q) => /açılma olur/.test(q.metin)));
  assert.ok(civataHesap({ ...CIVATA_ORNEK(), aA: 2.5 }).kontroller.some((q) => /tork anahtarı kullan/.test(q.metin)));
  assert.equal(boyutOner({ ...CIVATA_ORNEK(), FQ: 1e6 }), null);
  assert.equal(civataSanitize({ boyut: 'M7', sinif: '5.6' }).boyut, 'M8'); assert.equal(civataSanitize({ sinif: '5.6' }).sinif, '8.8');
  assert.ok(/CIVATA/.test(civataRapor(r, 'D').join('\n')));
});

if (fail) { console.log(fail + ' test başarısız'); process.exit(1); }
console.log('Tüm testler geçti');
