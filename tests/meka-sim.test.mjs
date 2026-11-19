// Çalıştır: node tests/meka-sim.test.mjs
// Mekatronik 7. aşama — benzetim. Beklenen değerler elle hesaplandı (yorumlarda işlem).
import assert from 'node:assert/strict';
import { simule, simOrnek, simEmpty, simSanitize, tahrikEkle, hareketEkle, karttanTahrik, hizAn, zamanSerisi, seriCSV, cizelge, simRapor } from '../meka/sim.js';
import { screwAxis, beltAxis, rotaryTable } from '../meka/calc.js';

let fail = 0;
const t = (name, fn) => {
  try { fn(); console.log('ok   ', name); }
  catch (e) { fail++; console.log('FAIL ', name, '\n     ', String(e.message).split('\n')[0]); }
};
const near = (a, b, rel, m = '') => assert.ok(Math.abs(a - b) <= Math.abs(b) * rel + 1e-12, `${m} ${a} ≉ ${b}`);

t('Örnek çevrim: zaman çizelgesi elle hesapla aynı (çevrim 3,816667 s)', () => {
  const s = simule(simOrnek()), o = s.olaylar;
  // h1: v·ta = 90 < 400 → tc = 310/600 = 0,516667; T = 0,3 + 0,516667
  near(o[0].bit, 0.816667, 1e-5);
  near(o[1].bas, 0.816667, 1e-5); near(o[1].bit, 0.816667 + 0.03 + 80 / 250, 1e-6);   // pnömatik: gecikme + strok / v
  near(o[2].bit, 1.166667 + 2, 1e-6);
  near(o[3].bit, 3.166667 + 0.03 + 80 / 300, 1e-6);
  near(o[4].bas, 3.166667, 1e-6); near(o[4].bit, 3.166667 + 0.3 + 280 / 800, 1e-6);   // "birlikte": önceki hareketin başlangıcında
  near(s.tcyc, 3.816667, 1e-6); near(s.adetSaat, 3600 / 3.816667, 1e-6);
  near(s.adetVardiya, (3600 / 3.816667) * 8 * 0.85, 1e-6);
  assert.equal(s.uygun, true, s.kontroller.filter((c) => !c.ok).map((c) => c.metin).join(' | '));
});
t('Motor yükü: ω = v/r, α = ω/ta, T = J·α + T_yük; RMS tüm çevrim üzerinden (elle)', () => {
  const s = simule(simOrnek()), m = s.motorlar[0], o = s.olaylar;
  near(o[0].n, 600 / (Math.PI * 50) * 60, 1e-9); near(o[0].alpha, 24 / 0.15, 1e-9); near(o[0].Tacc, 0.0004 * 160 + 0.26, 1e-9);   // 0,324
  near(o[4].Tacc, 0.0004 * (32 / 0.15) + 0.26, 1e-9);                                                                               // 0,345333
  const e = 0.324 ** 2 * 0.3 + 0.26 ** 2 * (310 / 600) + 0.345333333 ** 2 * 0.3 + 0.26 ** 2 * 0.35;
  near(m.rms, Math.sqrt(e / 3.816667), 1e-5); near(m.tepe, 0.345333, 1e-5); near(m.nmax, 800 / (Math.PI * 50) * 60, 1e-9);
  near(m.oran, (0.0004 - 0.00012) / 0.00012, 1e-9);
  near(m.bos, 3.816667 - 0.816667 - 0.65, 1e-5);
});
t('Üçgen profil, hız fonksiyonu ve tutma torkunun RMS\'e katkısı', () => {
  const S = simEmpty();
  const d = tahrikEkle(S, { ad: 'Z', tur: 'eksen', J: 0.001, Tl: 0.5, Th: 0.5, k: 0.1, Jm: 0.0002, Tn: 5, Tmax: 10, nmax: 6000 });
  hareketEkle(S, { ad: 'kısa', tahrik: d.id, yol: 10, v: 200, ta: 0.1 });   // v·ta = 20 ≥ 10 → v' = 100, T = 0,2
  const w = tahrikEkle(S, { ad: 'Bekle', tur: 'sure' }); hareketEkle(S, { ad: 'bekle', tahrik: w.id, sure: 0.8 });
  const s = simule(S), o = s.olaylar[0];
  assert.equal(o.p.ucgen, true); near(o.p.vp, 100, 1e-12); near(o.p.T, 0.2, 1e-12);
  near(hizAn(o, 0.05), 50, 1e-12); near(hizAn(o, 0.1), 100, 1e-12); near(hizAn(o, 0.15), 50, 1e-12); assert.equal(hizAn(o, 0.3), 0);
  // n = 100·0,1·60 = 600 dev/dk, ω = 62,832, α = 628,32; T = 0,001·628,32 + 0,5 = 1,12832
  near(o.Tacc, 0.001 * (2 * Math.PI * 600 / 60) / 0.1 + 0.5, 1e-9);
  near(s.motorlar[0].rms, Math.sqrt((o.Tacc ** 2 * 0.2 + 0.5 ** 2 * 0.8) / 1.0), 1e-9);
  assert.ok(s.kontroller.some((c) => c.duzey === 'bilgi' && /üçgen/.test(c.metin)));
});
t('Hatalar: aynı motorda çakışan hareket, kilit ihlali, sınır aşımı, eksik değer, tahriksiz hareket', () => {
  const S = simOrnek();
  S.hareketler[1].basla = 'birlikte';   // itici, taşıma ile birlikte → kilit ihlali
  let k = simule(S).kontroller.filter((c) => !c.ok).map((c) => c.metin).join(' | ');
  assert.match(k, /Kilit "Parçayı istasyona taşı" ⟂ "İtici ileri": 0,35 s birlikte|Kilit "Parçayı istasyona taşı" ⟂ "İtici ileri": 0.35 s birlikte/);
  const Q = simOrnek(); Q.hareketler[2].basla = 'birlikte'; Q.hareketler[2].tahrik = Q.tahrikler[1].id; Q.hareketler[2].yol = 50; Q.hareketler[2].v = 100;
  k = simule(Q).kontroller.filter((c) => !c.ok).map((c) => c.metin).join(' | ');
  assert.match(k, /"İtici silindir" aynı anda iki hareket/);
  const Z = simOrnek(); Z.tahrikler[0].Tmax = 0.3; Z.tahrikler[0].nmax = 200;
  k = simule(Z).kontroller.filter((c) => !c.ok).map((c) => c.metin).join(' | ');
  assert.match(k, /tepe tork 0.345 ≤ motor en yüksek 0.3/); assert.match(k, /en yüksek motor devri 306 ≤ 200/);
  const E = simOrnek(); E.tahrikler[0].Jm = NaN;
  assert.match(simule(E).kontroller.map((c) => c.metin).join(' | '), /değeri eksik \(Jm\)/);
  const H = simOrnek(); H.hareketler[0].tahrik = null; H.hareketler[2].sure = NaN;
  k = simule(H).kontroller.filter((c) => !c.ok).map((c) => c.metin).join(' | ');
  assert.match(k, /tahrik seçilmedi/); assert.match(k, /süre girilmeli/);
});
t('Eksen kartlarından tahrik: J = Jm + J\', T_yük, tutma, k (vida i/P, kayış i/(π·Dp), tabla i/360)', () => {
  const v = screwAxis({}), tv = karttanTahrik('vida', v);
  near(tv.J, v.giris.Jm + v.sonuc.Jref, 1e-12); near(tv.Tl, v.sonuc.Tl, 1e-12); near(tv.Th, v.sonuc.Thold, 1e-12); near(tv.k, v.giris.i / v.giris.P, 1e-12); assert.equal(tv.birim, 'mm');
  const b = beltAxis({}), tb = karttanTahrik('kayis', b); near(tb.k, b.giris.i / (Math.PI * b.giris.Dp), 1e-12);
  const r = rotaryTable({}), tt = karttanTahrik('tabla', r); near(tt.k, r.giris.i / 360, 1e-12); assert.equal(tt.birim, '°');
  // tutarlılık: kart hızındaki motor devri, k ile aynı
  near(b.giris.v * 1000 * tb.k * 60, b.sonuc.nM, 1e-9);
  assert.throws(() => karttanTahrik('rulman', { sonuc: {}, giris: {} }), /tahriki değil/);
});
t('Veri temizliği, zaman serisi, CSV, çizelge, rapor', () => {
  const S = simSanitize(JSON.parse(JSON.stringify({ ...simOrnek(), tahrikler: [...simOrnek().tahrikler, { id: 1, tur: 'eksen' }, { id: 50, tur: 'zz' }], hareketler: [...simOrnek().hareketler, { id: 60, tahrik: 999, basla: 'x' }], kilitler: [[4, 4], [4, 999]] })));
  assert.equal(S.tahrikler.length, 3); assert.equal(S.hareketler.length, 6); assert.equal(S.hareketler[5].tahrik, null); assert.equal(S.hareketler[5].basla, 'sonra');
  assert.equal(S.kilitler.length, 0);
  const sim = simule(simOrnek()), z = zamanSerisi(sim, simOrnek(), 0.1);
  assert.equal(z.rows.length, Math.floor(3.816667 / 0.1) + 1);
  near(z.rows[5].t, 0.5, 1e-9); near(z.rows[5][1], 600, 1e-9);   // taşıma sabit hızda
  assert.match(seriCSV(sim, simOrnek()), /^\ufeffZaman \(s\);Kayışlı taşıma ekseni hız \(mm\/s\)/);
  const c = cizelge(sim, simOrnek()); assert.ok(c.prims.filter((p) => p.t === 'r').length === 5 && c.h > 40);
  const L = simRapor(simOrnek(), 'Dolum'); assert.ok(L.some((l) => /MOTOR YÜKÜ/.test(l)) && /UYGUN/.test(L[2]));
});

console.log(fail ? `\n${fail} test BAŞARISIZ` : '\nTüm testler geçti');
process.exit(fail ? 1 : 0);
