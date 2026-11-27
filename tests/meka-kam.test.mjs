// Çalıştır: node tests/meka-kam.test.mjs — Eksantrik (kam) tasarımı. Beklenen değerler kapalı formüllerle (Norton, bölüm 8).
import assert from 'node:assert/strict';
import { law, YASALAR, kamHesap, kamSanitize, bolumler, hareket, kamDXF, kamCSV, kamGcode, kamRapor, KAM_ORNEK, KAM_DEFAULTS } from '../meka/kam.js';
import { checkProgram } from '../gcheck.js';

let fail = 0;
const t = (name, fn) => { try { fn(); console.log('ok   ', name); } catch (e) { fail++; console.log('FAIL ', name, '\n     ', String(e.message).split('\n')[0].slice(0, 300)); } };
const near = (a, b, tol, m = '') => assert.ok(Math.abs(a - b) <= tol, `${m} ${a} ≉ ${b}`);

t('Hareket eğrileri: uçlar (f 0→1, hız 0), parçalı eğride süreklilik, türevler tutarlı, tepe ivme katsayıları', () => {
  for (const k of Object.keys(YASALAR)) {
    near(law(k, 0)[0], 0, 1e-12, k); near(law(k, 1)[0], 1, 1e-12, k); near(law(k, 0)[1], 0, 1e-9, k); near(law(k, 1)[1], 0, 1e-9, k);
    let amax = 0;
    for (let i = 1; i < 2000; i++) {
      const u = i / 2000, h = 1e-6, a = law(k, u - h), b = law(k, u + h), c = law(k, u);
      near((b[0] - a[0]) / (2 * h), c[1], 1e-5, k + ' f′'); near((b[1] - a[1]) / (2 * h), c[2], 1e-4, k + ' f″');
      amax = Math.max(amax, Math.abs(c[2]));
    }
    near(amax, YASALAR[k].Ca, 0.01, k + ' Ca');
  }
  for (const u of [1 / 8, 7 / 8]) { const a = law('mods', u - 1e-9), b = law('mods', u + 1e-9); for (let i = 0; i < 3; i++) near(a[i], b[i], 1e-6, 'mods süreklilik ' + u); }
  near(law('sikloid', 0)[2], 0, 1e-12); near(law('p4567', 0)[3], 0, 1e-12);   // uçta ivme / sarsıntı 0
});
t('Plan denetimi ve bölümler', () => {
  const { seg, err } = bolumler(KAM_DEFAULTS.plan);
  assert.deepEqual(err, []); assert.deepEqual(seg.map((q) => q.tur), ['bekle', 'it', 'bekle', 'geri']);
  assert.ok(bolumler([[0, 0], [180, 10], [350, 0]]).err.some((e) => /360/.test(e)));
  assert.ok(bolumler([[0, 0], [180, 10], [360, 5]]).err.some((e) => /başa döner/.test(e)));
  assert.ok(kamHesap({ plan: [[0, 0], [90, 5], [80, 0], [360, 0]] }).hata);
});
t('Hep bekleyen plan → profil temel daire, basınç açısı 0, eğrilik = Rp', () => {
  const r = kamHesap({ plan: [[0, 0], [360, 0]], Rb: 40, Dr: 20 });
  for (const p of r.prof) near(Math.hypot(p[0], p[1]), 40, 1e-6);
  near(r.phiMax, 0, 1e-4); near(r.rhoMin, 50, 0.01);
});
t('Merkezli izleyici: basınç açısı tanφ = s′/(Rp + s), eğrilik ρ kapalı formülle aynı (her 0,25°), iki dönüş yönünde', () => {
  for (const yon of ['ccw', 'cw']) {
    const g = { ...KAM_DEFAULTS, yon }, r = kamHesap(g), Rp = g.Rb + g.Dr / 2, { seg } = bolumler(g.plan);
    r.rows.forEach((q, i) => {
      const [s, s1, s2] = hareket(seg, g.yasa, i * 2 * Math.PI / r.rows.length);
      near(q.phi, Math.atan(Math.abs(s1) / (Rp + s)) * 180 / Math.PI, 2e-3, yon + ' φ ' + q.deg);
      const R = Rp + s, rho = (R * R + s1 * s1) ** 1.5 / (R * R + 2 * s1 * s1 - R * s2);
      near(q.rho, rho, Math.max(0.05, Math.abs(rho) * 2e-3), yon + ' ρ ' + q.deg);
    });
    // profil noktası makara merkezinden tam Rr uzakta
    r.prof.forEach((p, i) => near(Math.hypot(p[0] - r.pitch[i][0], p[1] - r.pitch[i][1]), g.Dr / 2, 1e-9));
  }
});
t('Kaçık izleyici: tanφ = (s′ ∓ e)/(d + s) (dönüş yönüne göre işaret tutarlı)', () => {
  const g = { ...KAM_DEFAULTS, e: 10 }, r = kamHesap(g), d = Math.sqrt((g.Rb + g.Dr / 2) ** 2 - 100), { seg } = bolumler(g.plan);
  let sgn = null;
  r.rows.forEach((q, i) => {
    const [s, s1] = hareket(seg, g.yasa, i * 2 * Math.PI / r.rows.length);
    const A = Math.abs(Math.atan((s1 - 10) / (d + s))) * 180 / Math.PI, B = Math.abs(Math.atan((s1 + 10) / (d + s))) * 180 / Math.PI;
    if (Math.abs(A - B) < 0.01) return;
    const m = Math.abs(q.phi - A) < 2e-3 ? -1 : Math.abs(q.phi - B) < 2e-3 ? 1 : 0;
    assert.ok(m !== 0, 'φ ' + q.deg); if (sgn == null) sgn = m; assert.equal(m, sgn);
  });
});
t('Alttan kesme ve dar profil: küçük disk + büyük makara + kısa itme açısı → hata; büyütünce geçer', () => {
  const bad = kamHesap({ plan: [[0, 0], [30, 25], [60, 0], [360, 0]], Rb: 15, Dr: 24, delik: 8 });
  assert.ok(!bad.uygun && bad.kontroller.some((c) => !c.ok && c.duzey === 'hata' && /alttan kesilir/.test(c.metin)), JSON.stringify(bad.kontroller));
  assert.ok(bad.kontroller.some((c) => !c.ok && /basınç açısı/i.test(c.metin)));
  const good = kamHesap({ plan: [[0, 0], [90, 25], [180, 0], [360, 0]], Rb: 70, Dr: 24, delik: 20 });
  assert.ok(good.uygun, JSON.stringify(good.kontroller.filter((c) => !c.ok)));
});
t('Dinamik: hız / ivme ölçeği ω, ω²; temas kuvveti ve zıplama; önerilen ön yükle düzelir', () => {
  const g = { ...KAM_DEFAULTS, n: 120, m: 3, k: 0.5, F0: 2, dikey: false }, r = kamHesap(g), w = 2 * Math.PI * 2, beta = Math.PI / 2, h = 40;
  near(r.vMax, h * 2 / beta * w / 1000 * (1.7596 / 2), 0.01);   // modifiye sinüs tepe hız katsayısı 1,76 (Norton)
  near(r.aMax, 5.528 * h / beta ** 2 * w * w / 1000, 0.05);
  assert.ok(r.Nmin < 0 && r.kontroller.some((c) => /KALKAR/.test(c.metin)));
  const m = r.kontroller.find((c) => /KALKAR/.test(c.metin)).metin.match(/en az (\d+) N/);
  const r2 = kamHesap({ ...g, F0: +m[1] });
  assert.ok(r2.Nmin > 0 && r2.uygun, r2.Nmin);
  near(r.Tmax, r.rows.reduce((b, q) => (Math.abs(q.T) > Math.abs(b) ? q.T : b), 0), 1e-12);
});
t('Çıktılar: DXF profil + delik, CSV, rapor; G-kodu güvenli kesim kontrolünden kırmızısız geçer, büyük takım reddedilir', () => {
  const r = kamHesap(KAM_ORNEK());
  assert.ok(r.uygun, JSON.stringify(r.kontroller.filter((c) => !c.ok)));
  const dxf = kamDXF(r); assert.equal((dxf.match(/\r\nVERTEX\r\n/g) || []).length, r.prof.length); assert.ok(/DELIK/.test(dxf) && !/[^\x00-\x7f]/.test(dxf));
  const csv = kamCSV(r); assert.equal(csv.trim().split('\r\n').length, 361);
  assert.ok(kamRapor(r, 'x').some((l) => /modifiye sinüs/.test(l)));
  const G = kamGcode(r, { takim: 10 }); assert.ok(!G.hata, G.hata);
  const R = G.stok / 2, c = checkProgram(G.kod, { x0: -R, x1: R, y0: -R, y1: R, zTop: 0, zBot: -r.g.kalinlik - 5 }, { 1: { d: 10, type: 'flat', flute: 30 } }, { res: 0.5 });
  assert.ok(c.complete, 'eksiksiz okundu'); assert.equal(c.red, 0, JSON.stringify(c.lines.filter((l) => l.lvl === 2).slice(0, 3)));
  // takım yolu profilden tam takım yarıçapı uzakta (her köşe noktası)
  const tp = [...G.kod.matchAll(/X(-?[\d.]+) Y(-?[\d.]+)/g)].map((m) => [+m[1], +m[2]]).slice(1, 40);
  for (const p of tp) { let dm = Infinity; for (const q of r.prof) dm = Math.min(dm, Math.hypot(p[0] - q[0], p[1] - q[1])); assert.ok(dm > 4.9 && dm < 5.1, 'uzaklık ' + dm); }
  const conc = kamHesap({ plan: [[0, 0], [60, 30], [120, 30], [180, 0], [360, 0]], Rb: 40, Dr: 20 });
  if (isFinite(conc.rhoConc)) assert.ok(kamGcode(conc, { takim: 2 * (conc.rhoConc + 10) + 2 }).hata);
});
t('Kayıt temizleme: bozuk değerler varsayılana döner', () => {
  const g = kamSanitize({ Rb: 'x', yasa: 'yok', yon: 'sağ', plan: 'a' });
  assert.equal(g.Rb, KAM_DEFAULTS.Rb); assert.equal(g.yasa, 'mods'); assert.equal(g.yon, 'ccw'); assert.deepEqual(g.plan, KAM_DEFAULTS.plan);
});

console.log(fail ? `\n${fail} test BAŞARISIZ` : '\nTüm testler geçti');
process.exit(fail ? 1 : 0);
