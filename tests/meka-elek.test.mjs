// Çalıştır: node tests/meka-elek.test.mjs
// Mekatronik 4. aşama — elektrik. Beklenen değerler formülden BAĞIMSIZ olarak elle hesaplanmıştır (yorumlarda işlem).
// ρ70 = (1/58)·(1 + 0,00393·50) = 0,0172414·1,1965 = 0,0206293 Ω·mm²/m
import assert from 'node:assert/strict';
import { circuit, elekSystem, kT, kG, rho70, peKesit, kabloListesi, klemensPlani, kabloCSV, klemensCSV, kabloTip, tekHat, elekRapor, elekSanitize, yukEkle, agactanYukler, bagliDeger, IZ_TABLO, ELEK_DEFAULTS } from '../meka/elec.js';

let fail = 0;
const t = (name, fn) => {
  try { fn(); console.log('ok   ', name); }
  catch (e) { fail++; console.log('FAIL ', name, '\n     ', String(e.message).split('\n')[0]); }
};
const near = (a, b, rel, m = '') => assert.ok(Math.abs(a - b) <= Math.abs(b) * rel + 1e-12, `${m} ${a} ≉ ${b} (±%${rel * 100})`);
const R70 = 0.0206293;

t('Tablo değerleri (IEC 60204-1 Tablo 6, iki kaynakla karşılaştırıldı): 1,5 mm² B1 13,5 / B2 13,1 / C 15,2 / E 16,1; 16 mm² B1 59', () => {
  assert.deepEqual(IZ_TABLO.find((r) => r[0] === 1.5), [1.5, 13.5, 13.1, 15.2, 16.1]);
  assert.deepEqual(IZ_TABLO.find((r) => r[0] === 16), [16, 59, 54, 66, 70]);
  assert.deepEqual(IZ_TABLO.find((r) => r[0] === 35), [35, 96, 86, 104, 110]);
  near(rho70(), R70, 1e-5);
  assert.equal(peKesit(10), 10); assert.equal(peKesit(25), 16); assert.equal(peKesit(50), 25);
});
t('Katsayılar: ara sıcaklık / devre sayısında güvenli taraf (bir üst satır); tablo dışı hata', () => {
  assert.equal(kT(40), 1); assert.equal(kT(42), 0.91); assert.equal(kT(25), 1.15); assert.equal(kT(50), 0.82);
  assert.throws(() => kT(65), /60 °C/);
  assert.equal(kG(1), 1); assert.equal(kG(7), 0.52); assert.equal(kG(14), 0.43); assert.equal(kG(20, 0.38), 0.38);
  assert.throws(() => kG(15), /14/); assert.throws(() => kG(2, 1.2), /1'den büyük/);
});
t('3 faz motor 2,2 kW, cos 0,82, η 0,85, 20 m: Ib = 4,5558 A → C6, 0,75 mm²; ΔU %0,89; Zs = 1,4003 Ω', () => {
  const r = circuit({ ad: 'M1', tur: 'ac3', giris: 'P', P: 2200, cos: 0.82, eta: 0.85, L: 20, egri: 'C' });
  near(r.sonuc.Ib, 2200 / (Math.sqrt(3) * 400 * 0.82 * 0.85), 1e-12); near(r.sonuc.Ib, 4.5558, 1e-4);
  assert.equal(r.sonuc.In, 6); assert.equal(r.sonuc.S, 0.75); assert.equal(r.sonuc.Iz, 9.8);
  // ΔU = √3·4,5558·20·(0,0206293/0,75)·0,82 = 3,5594 V → %0,8898
  near(r.sonuc.dU, 3.5594, 1e-3); near(r.sonuc.dUp, 0.88985, 1e-3);
  // Zs = 0,3 + 20·0,0206293·(1/0,75 + 1/0,75) = 1,40023; Ia = 60 → 84,0 V ≤ 230,9 V
  near(r.sonuc.Zs, 1.40023, 1e-4); assert.equal(r.sonuc.Ia, 60); assert.equal(r.uygun, true);
});
t('24 V DC 48 W, 30 m: gerilim düşümü kesiti belirler → 2,5 mm² (0,75: %13,75 · 1,5: %6,88 · 2,5: %4,13)', () => {
  const r = circuit({ ad: 'Valf adası', tur: 'dc', giris: 'P', P: 48, eta: 1, L: 30, egri: 'C' });
  near(r.sonuc.Ib, 2, 1e-12); assert.equal(r.sonuc.In, 2); assert.equal(r.sonuc.S, 2.5);
  near(r.sonuc.dU, 2 * 2 * 30 * R70 / 2.5, 1e-4); near(r.sonuc.dUp, 4.1259, 1e-3);
  const z = circuit({ ad: 'x', tur: 'dc', giris: 'P', P: 48, eta: 1, L: 30, S: 1.5 });
  assert.equal(z.uygun, false); assert.ok(z.kontroller.some((c) => !c.ok && /Gerilim düşümü %6,8|Gerilim düşümü %6.8/.test(c.metin)));
});
t('1 faz 10 A, 60 m, D eğrisi: çevrim empedansı kesiti belirler → 4 mm² (2,5 mm²: Zs 1,290 Ω · 200 A = 258 V > 230 V)', () => {
  const r = circuit({ ad: 'Isıtıcı', tur: 'ac1', giris: 'I', I: 10, cos: 0.85, L: 60, egri: 'D' });
  assert.equal(r.sonuc.In, 10); assert.equal(r.sonuc.Ia, 200); assert.equal(r.sonuc.S, 4);
  near(r.sonuc.Zs, 0.3 + 60 * R70 * 2 / 4, 1e-4);
  const z = circuit({ ad: 'x', tur: 'ac1', giris: 'I', I: 10, L: 60, egri: 'D', S: 2.5 });
  near(z.sonuc.Zs, 1.29016, 1e-4); assert.equal(z.uygun, false);
  assert.ok(z.kontroller.some((c) => !c.ok && /Otomatik kesme/.test(c.metin)));
});
t('Sıcak ve kalabalık kanal: 50 °C (0,82), 7 devre (0,52), 20 A, yöntem E → Iz ≥ 46,9 A → 10 mm² (52 A)', () => {
  const r = circuit({ ad: 'x', tur: 'ac3', giris: 'I', I: 20, cos: 0.9, L: 5 }, { ...ELEK_DEFAULTS, T: 50, grup: 7, yontem: 'E' });
  assert.equal(r.sonuc.In, 20); assert.equal(r.sonuc.S, 10); near(r.sonuc.Izd, 52 * 0.82 * 0.52, 1e-12);
});
t('Kullanıcının seçtiği koruma işletme akımından küçükse hata; eksik akım hata verir (uydurulmaz)', () => {
  const r = circuit({ ad: 'x', tur: 'ac3', giris: 'I', I: 7, In: 6, L: 5 });
  assert.equal(r.uygun, false);
  assert.throws(() => circuit({ ad: 'Sürücü', tur: 'ac3', giris: 'I', I: NaN, L: 5 }), /akım girilmedi/);
  assert.throws(() => circuit({ ad: 'x', tur: 'ac3', giris: 'I', I: 70, L: 5 }), /63 A/);
});
t('Sistem: 2 × 24 V 1 A + 4 A 3 faz + 2 A 1 faz → güç kaynağı ≥ 2,5 A, giriş 0,30511 A; fazlar L1 4,305 · L2 6 · L3 4; ana C6', () => {
  const E = { ayar: { ...ELEK_DEFAULTS }, yukler: [
    { ad: 'Sensörler', tur: 'dc', giris: 'P', P: 24, eta: 1, L: 5 }, { ad: 'Valfler', tur: 'dc', giris: 'P', P: 24, eta: 1, L: 5 },
    { ad: 'Konveyör', tur: 'ac3', giris: 'I', I: 4, cos: 0.8, L: 15 }, { ad: 'Fan', tur: 'ac1', giris: 'I', I: 2, cos: 0.9, L: 8 }] };
  const s = elekSystem(E);
  near(s.dc.toplam, 2, 1e-12); near(s.dc.gerek, 2.5, 1e-12);
  near(s.dc.Iin, 24 * 2.5 / (0.9 * 230 * 0.95), 1e-9); near(s.dc.Iin, 0.30511, 1e-4);
  assert.ok(s.kontroller.some((c) => c.duzey === 'uyari' && /girilmedi/.test(c.metin)));
  near(s.fazlar[0], 4.30511, 1e-4); near(s.fazlar[1], 6, 1e-12); near(s.fazlar[2], 4, 1e-12);
  assert.equal(s.ana.sonuc.In, 6); assert.equal(s.ana.notr, true);
  assert.equal(s.uygun, true);
  const kl = kabloListesi(s); assert.equal(kl.length, 6); assert.equal(kl[0].tip, '5G0,75');
  const kp = klemensPlani(s); assert.equal(kp.length, 11);
  assert.deepEqual(kp.filter((r) => r.klemens.startsWith('-X2')).map((r) => r.klemens + ' ' + r.potansiyel), ['-X2:1 +24V', '-X2:2 0V', '-X2:3 +24V', '-X2:4 0V']);
  assert.equal(kp.find((r) => r.hedef === 'Fan' && r.damar === 'L').potansiyel, 'L2');
  assert.ok(/^﻿Kablo;/.test(kabloCSV(kl)) && /-W4;Konveyör;4G0,75/.test(kabloCSV(kl)));
  assert.ok(/-X1:1;L1;-F4;-W4;L1;Konveyör/.test(klemensCSV(kp)) && /-X1:5;L2;-F5;-W5;L;Fan/.test(klemensCSV(kp)));
  // güç kaynağı yeterli girilirse uyarı kalkar, yetersizse hata
  assert.equal(elekSystem({ ...E, ayar: { ...E.ayar, psuIn: 5 } }).kontroller[0].ok, true);
  assert.equal(elekSystem({ ...E, ayar: { ...E.ayar, psuIn: 2 } }).uygun, false);
  const th = tekHat(s); assert.ok(th.prims.length > 30 && th.w >= 120);
  const L = elekRapor(s, 'deneme'); assert.ok(L.some((l) => /KLEMENS PLANI/.test(l)) && L.some((l) => /IEC 60364-4-41/.test(l)));
});
t('Kablo tipi gösterimi ve proje verisi temizliği; ürün ağacından yük alma (değer yoksa boş kalır)', () => {
  assert.equal(kabloTip('ac3', 2.5), '4G2,5'); assert.equal(kabloTip('ac1', 1.5), '3G1,5'); assert.equal(kabloTip('dc', 0.75), '2x0,75');
  const E = elekSanitize({ ayar: { yontem: 'Z', T: 45, anaEgri: 'D', U3: 'x' }, yukler: [{ id: 3, tur: 'ac3', ad: 'A', P: 100 }, { id: 3, tur: 'dc' }, { id: 4, tur: 'zz' }, null], nextId: 1 });
  assert.equal(E.ayar.yontem, 'C'); assert.equal(E.ayar.T, 45); assert.equal(E.ayar.anaEgri, 'D'); assert.equal(E.ayar.U3, 400);
  assert.equal(E.yukler.length, 1); assert.equal(E.nextId, 4);
  const items = [{ id: 1, kind: 'surucu', ad: 'Servo sürücü', deger: { U: 400, Ig: 3.2 } }, { id: 2, kind: 'valf', ad: '5/2 valf', deger: { U: 24 } }, { id: 3, kind: 'motor', ad: 'X motoru', deger: { fren: 1, Pf: 12 } }, { id: 4, kind: 'vida', ad: 'Vida', deger: {} }];
  const yeni = agactanYukler(E, items);
  assert.deepEqual(yeni.map((y) => y.tur + ':' + y.giris + ':' + y.ref), ['ac3:I:1', 'dc:P:2', 'dc:P:3']);
  assert.equal(agactanYukler(E, items).length, 0);   // ikinci kez eklenmez
  const b1 = bagliDeger(yeni[0], items); assert.equal(b1.y.I, 3.2); assert.equal(b1.kaynak.I, 'Servo sürücü');
  const b2 = bagliDeger(yeni[1], items); assert.ok(!Number.isFinite(b2.y.P));   // valf gücü girilmemiş: uydurulmaz
  assert.throws(() => circuit(b2.y), /güç girilmedi/);
  assert.equal(bagliDeger(yeni[2], items).y.P, 12);
  assert.equal(yukEkle(E, 'ac1').ad, '1 faz yük');
});

console.log(fail ? `\n${fail} test BAŞARISIZ` : '\nTüm testler geçti');
process.exit(fail ? 1 : 0);
