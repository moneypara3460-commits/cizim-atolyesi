// Çalıştır: node tests/meka-cevrim.test.mjs — makine çevrim (zamanlama) diyagramı
import assert from 'node:assert/strict';
import { cevrimHesap, cevrimSanitize, CEVRIM_ORNEK, istasyonYol, araliklar, cevrimCSV, cevrimRapor, oneriYazi, ADIM } from '../meka/cevrim.js';
import { law } from '../meka/kam.js';

let fail = 0;
const t = (name, fn) => { try { fn(); console.log('ok   ', name); } catch (e) { fail++; console.log('FAIL ', name, '\n     ', String(e.message).split('\n')[0].slice(0, 300)); } };
const near = (a, b, tol, m = '') => assert.ok(Math.abs(a - b) <= tol, `${m} ${a} ≉ ${b}`);
// eşik geçiş açısı (ikiye bölme) — hareket eğrisinden bağımsız hesap
const cross = (yasa, a0, a1, frac) => { let lo = 0, hi = 1; for (let i = 0; i < 60; i++) { const m = (lo + hi) / 2; if (law(yasa, m)[0] < frac) lo = m; else hi = m; } return a0 + (a1 - a0) * lo; };
const ist = (ad, plan, faz = 0, yasa = 'mods') => ({ ad, birim: 'mm', yasa, faz, plan });

t('İstasyon yolu: plan ve faz; "ileride" bölgesi eşik geçişleriyle aynı yerde başlar ve biter', () => {
  const s = ist('A', [[0, 0], [60, 40], [200, 40], [260, 0], [360, 0]]), y = istasyonYol(s);
  assert.equal(y.smax, 40); near(y.y[Math.round(100 / ADIM)], 40, 1e-9); near(y.y[0], 0, 1e-9);
  const z = Uint8Array.from(y.y, (v) => (v > 4 ? 1 : 0)), ar = araliklar(z);
  assert.equal(ar.length, 1);
  near(ar[0][0] * ADIM, cross('mods', 0, 60, 0.1), ADIM, 'başlangıç'); near(ar[0][1] * ADIM, 260 - (cross('mods', 0, 60, 0.1)), ADIM, 'bitiş (simetrik dönüş)');
  // faz 90°: aynı bölge 90° ileride
  const y2 = istasyonYol({ ...s, faz: 90 });
  for (let i = 0; i < y.y.length; i++) near(y2.y[(i + 180) % y.y.length], y.y[i], 1e-9);
  // dairesel aralık: 0° üstünden geçen bölge tek parça sayılır
  const w = istasyonYol(ist('W', [[0, 0], [270, 0], [320, 120], [360, 0]]));
  const zw = Uint8Array.from(w.y, (v) => (v > 12 ? 1 : 0)), z2 = new Uint8Array(zw.length); for (let i = 0; i < zw.length; i++) z2[(i + 200) % zw.length] = zw[i];
  assert.equal(araliklar(z2).length, 1);
});
t('"Ayrı" kuralı: boşluk açısı ve çakışma; ms hesabı; faz önerisi uygulanınca kural sağlanır', () => {
  const c = { n: 60, ist: [ist('Çene', [[0, 0], [60, 40], [200, 40], [260, 0], [360, 0]]), ist('Film', [[0, 0], [220, 0], [280, 100], [360, 0]])], kural: [{ a: 0, b: 1, tur: 'ayri', esikA: 10, esikB: 10, pay: 5 }] };
  const r = cevrimHesap(c), x = r.sonuc[0];
  near(r.msTur, 1000, 1e-9); near(r.msDer, 1000 / 360, 1e-9);
  assert.ok(!x.ok && x.bosluk < 0 && /ÇARPIŞMA/.test(x.metin), x.metin);
  // bağımsız: çene 260 − c'de iniyor, film 240 + c'de kalkıyor → kesişim ≈ 20 + 2·(60·u10 ... ) hesapla
  const cDown = 260 - cross('mods', 0, 60, 0.1), fUp = 220 + cross('mods', 0, 60, 0.1);
  near(-x.bosluk, cDown - fUp, 2 * ADIM, 'kesişim derecesi');
  assert.ok(x.oneri && x.oneri.geciktir > 0);
  const c2 = { ...c, ist: [c.ist[0], { ...c.ist[1], faz: x.oneri.geciktir }] }, r2 = cevrimHesap(c2);
  assert.ok(r2.sonuc[0].ok, r2.sonuc[0].metin); near(r2.sonuc[0].bosluk, 5, ADIM + 1e-9);
  const c3 = { ...c, ist: [c.ist[0], { ...c.ist[1], faz: (360 - x.oneri.oneAl) % 360 }] };
  assert.ok(cevrimHesap(c3).sonuc[0].ok);
  assert.match(oneriYazi(x, cevrimSanitize(c)), /Film istasyonunu .*° geciktir/);
});
t('"İçinde" kuralı: B, A ilerideyken çalışır; taşma ve pay; öneri', () => {
  const A = ist('Çene', [[0, 0], [60, 40], [200, 40], [260, 0], [360, 0]]);
  const ok = cevrimHesap({ n: 40, ist: [A, ist('Bıçak', [[0, 0], [100, 0], [130, 15], [150, 15], [180, 0], [360, 0]])], kural: [{ a: 0, b: 1, tur: 'icinde', esikA: 90, esikB: 10, pay: 5 }] });
  assert.ok(ok.sonuc[0].ok, ok.sonuc[0].metin);
  const bad = cevrimHesap({ n: 40, ist: [A, ist('Bıçak', [[0, 0], [180, 0], [210, 15], [230, 15], [260, 0], [360, 0]])], kural: [{ a: 0, b: 1, tur: 'icinde', esikA: 90, esikB: 10, pay: 5 }] });
  const x = bad.sonuc[0];
  assert.ok(!x.ok && x.disari > 0 && /SIRA HATASI/.test(x.metin));
  assert.ok(x.oneri.oneAl > 0);
  const fixed = cevrimHesap({ ...bad.c, ist: [A, { ...bad.c.ist[1], faz: (360 - x.oneri.oneAl) % 360 }] });
  assert.ok(fixed.sonuc[0].ok, fixed.sonuc[0].metin);
});
t('VFFS şablonu uygun; dozaj kaydırılınca sıra hatası; CSV ve rapor', () => {
  const r = cevrimHesap(CEVRIM_ORNEK());
  assert.ok(r.uygun, JSON.stringify(r.sonuc.filter((x) => !x.ok).map((x) => x.metin)));
  const c = CEVRIM_ORNEK(); c.ist[2].faz = 120;
  const b = cevrimHesap(c); assert.ok(!b.uygun && b.sonuc[1].duzey === 'hata');
  const csv = cevrimCSV(r).split('\r\n'); assert.equal(csv.length, 362); assert.ok(/^.aci_derece;zaman_ms;Kaynak_çenesi_mm/.test(csv[0]));
  assert.ok(cevrimRapor(b).some((l) => /Öneri:/.test(l)));
});
t('Bozuk girişler: plan hatası, geçersiz kural, istasyonsuz proje', () => {
  assert.ok(cevrimHesap({ ist: [ist('X', [[0, 0], [180, 10], [350, 0]])] }).hata);
  const r = cevrimHesap({ ist: [ist('A', [[0, 0], [180, 10], [360, 0]])], kural: [{ a: 0, b: 5, tur: 'ayri' }] });
  assert.equal(r.sonuc[0].duzey, 'hata');
  assert.ok(cevrimHesap({}).hata);
  const s = cevrimSanitize({ n: 'x', ist: [{ ad: '', faz: -30, yasa: 'yok', birim: 'z' }], kural: [{ esikA: 500, pay: -3 }] });
  assert.equal(s.n, 40); assert.equal(s.ist[0].faz, 330); assert.equal(s.ist[0].yasa, 'mods'); assert.equal(s.ist[0].birim, 'mm'); assert.equal(s.kural[0].esikA, 99); assert.equal(s.kural[0].pay, 0);
});

console.log(fail ? `\n${fail} test BAŞARISIZ` : '\nTüm testler geçti');
process.exit(fail ? 1 : 0);
