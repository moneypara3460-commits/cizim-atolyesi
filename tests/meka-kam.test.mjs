// Çalıştır: node tests/meka-kam.test.mjs — Eksantrik (kam) tasarımı. Beklenen değerler kapalı formüllerle (Norton, bölüm 8).
import assert from 'node:assert/strict';
import { law, YASALAR, kamHesap, kamSanitize, bolumler, hareket, kamDXF, kamCSV, kamGcode, kamRapor, KAM_ORNEK, KAM_ORNEK2, KAM_DEFAULTS } from '../meka/kam.js';
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
t('Sallanan kol: bekleme bölgesinde basınç açısı kapalı formülle (makara yönü kola dik), kosinüs teoremi |B| = Rp', () => {
  const g = { ...KAM_DEFAULTS, izleyici: 'salinim', C: 110, L: 90, plan: [[0, 0], [90, 0], [180, 20], [270, 20], [360, 0]] }, r = kamHesap(g), Rp = g.Rb + g.Dr / 2;
  assert.ok(!r.hata, r.hata);
  near(Math.hypot(r.rows[0].bx, r.rows[0].by), Rp, 1e-9);
  near(Math.hypot(r.rows[0].bx - g.C, r.rows[0].by), g.L, 1e-9);
  r.rows.forEach((q, i) => {
    if (!(q.deg > 2 && q.deg < 88) && !(q.deg > 182 && q.deg < 268)) return;   // bekleme: makara yolu daire
    const psi = r.psi0 + q.s * Math.PI / 180, B = [q.bx, q.by], Bh = B.map((v) => v / Math.hypot(...B)), dir = [Math.sin(psi), Math.cos(psi)];
    near(q.phi, Math.acos(Math.abs(Bh[0] * dir[0] + Bh[1] * dir[1])) * 180 / Math.PI, 1e-3, 'φ ' + q.deg);
    near(Math.hypot(...r.pitch[i]), Math.hypot(...B), 1e-9);
  });
  // kol açısı plan değerini izler: ψ − ψ0 = s
  r.rows.forEach((q) => near(Math.atan2(q.by, -(q.bx - g.C)) - r.psi0, q.s * Math.PI / 180, 1e-9));
  assert.ok(kamHesap({ ...g, C: 300 }).hata);   // makara temel daireye ulaşamaz
});
t('Sallanan kol çok uzunsa düz giden kola yaklaşır (basınç açısı, hız, ivme)', () => {
  const Lk = 20000, base = { ...KAM_DEFAULTS, n: 60 }, Rp = base.Rb + base.Dr / 2;
  const tr = kamHesap(base), deg = (mm) => mm / Lk * 180 / Math.PI;
  const os = kamHesap({ ...base, izleyici: 'salinim', L: Lk, C: Math.sqrt(Lk * Lk - Rp * Rp), yon: 'cw', plan: base.plan.map(([a, s]) => [a, deg(s)]) });
  const tc = kamHesap({ ...base, yon: 'cw' });
  assert.ok(!os.hata, os.hata);
  near(os.phiMax, tc.phiMax, 0.3); near(os.vMax, tc.vMax, tc.vMax * 0.005); near(os.aMax, tc.aMax, tc.aMax * 0.005);
  assert.ok(tr.phiMax > 0);
});
t('Kanallı kam: iki yanak makara merkezi yolundan tam Rr uzakta; yay yokken zıplama yok, yanak geçişi bildirilir', () => {
  const g = { ...KAM_ORNEK(), kamTur: 'kanal', k: 0, F0: 0, dikey: false, kanalDerin: 10, kenar: 10 }, r = kamHesap(g);
  assert.ok(!r.hata && r.uygun, r.hata || JSON.stringify(r.kontroller.filter((c) => !c.ok)));
  r.pitch.forEach((p, i) => { near(Math.hypot(r.prof[i][0] - p[0], r.prof[i][1] - p[1]), g.Dr / 2, 1e-9); near(Math.hypot(r.prof2[i][0] - p[0], r.prof2[i][1] - p[1]), g.Dr / 2, 1e-9); });
  assert.ok(!r.kontroller.some((c) => /KALKAR/.test(c.metin)) && r.gecis >= 2 && r.kontroller.some((c) => /öbür yanağına geçer/.test(c.metin)));
  near(r.Rdis, Math.max(...r.prof2.map((q) => Math.hypot(...q))) + 10, 1e-9);
  const dxf = kamDXF(r); assert.equal((dxf.match(/\r\nVERTEX\r\n/g) || []).length, 2 * r.prof.length); assert.ok(/\r\nDIS\r\n/.test(dxf));
  assert.equal(kamCSV(r).split('\r\n')[0].split(';').length, 9);
  // dış yanak alttan kesme: keskin içbükey dönüş + büyük makara
  const bad = kamHesap({ ...g, plan: [[0, 0], [40, 30], [80, 0], [360, 0]], Rb: 40, Dr: 40, delik: 10 });
  assert.ok(!bad.uygun && bad.kontroller.some((c) => !c.ok && /dış yanağı .* alttan kesilir/.test(c.metin)), JSON.stringify(bad.kontroller.map((c) => c.metin)));
  assert.ok(kamGcode(bad).hata);
  assert.ok(kamHesap({ ...g, kanalDerin: 20 }).hata);   // disk kalınlığından derin
});
t('Kanal G-kodu: rampayla iner, takım yanaklara değmez ama son turda yanakları bitirir, kesim kontrolünden kırmızısız geçer', () => {
  const g = { ...KAM_ORNEK(), kamTur: 'kanal', kanalDerin: 8, kademe: 3 }, r = kamHesap(g), G = kamGcode(r, { takim: 12 });
  assert.ok(!G.hata, G.hata); assert.equal(G.tur, 5);   // 10 mm yanak payı, tur başı en çok 0,8·D → merkez + 2×2 tur
  assert.ok(!/G1 Z-/.test(G.kod), 'dik dalma yok (Z yalnız rampada X Y ile birlikte)');
  const R = G.stok / 2, c = checkProgram(G.kod, { x0: -R, x1: R, y0: -R, y1: R, zTop: 0, zBot: -g.kalinlik }, { 1: { d: 12, type: 'flat', flute: 30 } }, { res: 0.5 });
  assert.ok(c.complete); assert.equal(c.red, 0, JSON.stringify(c.lines.filter((l) => l.lvl === 2).slice(0, 3)));
  const tp = [...G.kod.matchAll(/X(-?[\d.]+) Y(-?[\d.]+)/g)].map((m) => [+m[1], +m[2]]);
  let minFl = Infinity;
  for (const p of tp.filter((_, i) => i % 7 === 0)) { let a = Infinity, b = Infinity; for (let i = 0; i < r.prof.length; i += 2) { a = Math.min(a, Math.hypot(p[0] - r.prof[i][0], p[1] - r.prof[i][1])); b = Math.min(b, Math.hypot(p[0] - r.prof2[i][0], p[1] - r.prof2[i][1])); } minFl = Math.min(minFl, a, b); }
  assert.ok(minFl > 6 - 0.05 && minFl < 6 + 0.2, 'yanağa uzaklık ' + minFl);
  const zs = [...G.kod.matchAll(/Z(-[\d.]+)/g)].map((m) => +m[1]); near(Math.min(...zs), -8, 1e-9);
  assert.ok(kamGcode(r, { takim: 40 }).hata);   // kanaldan geniş takım
  const G1 = kamGcode(r, { takim: g.Dr }); assert.equal(G1.tur, 1);   // takım = makara: tek tur
});
t('Sallanan kol: kol mili diske çarpıyorsa hata; "Kesme bıçağı kolu" şablonu uygun ve kanal G-kodu üretilir', () => {
  const r = kamHesap(KAM_ORNEK2());
  assert.ok(r.uygun && r.sal && r.kanal, JSON.stringify(r.kontroller.filter((c) => !c.ok)));
  assert.ok(r.A[0] >= r.Rdis + 10 && !kamGcode(r).hata);
  const bad = kamHesap({ ...KAM_ORNEK2(), C: 130, L: 100 });
  assert.ok(!bad.uygun && bad.kontroller.some((c) => !c.ok && /Kol mili diske çarpar/.test(c.metin)));
});
t('Kayıt temizleme: bozuk değerler varsayılana döner', () => {
  const g = kamSanitize({ Rb: 'x', yasa: 'yok', yon: 'sağ', plan: 'a', kamTur: 'x', izleyici: 1 });
  assert.equal(g.Rb, KAM_DEFAULTS.Rb); assert.equal(g.yasa, 'mods'); assert.equal(g.yon, 'ccw'); assert.deepEqual(g.plan, KAM_DEFAULTS.plan); assert.equal(g.kamTur, 'disk'); assert.equal(g.izleyici, 'oteleme');
});

console.log(fail ? `\n${fail} test BAŞARISIZ` : '\nTüm testler geçti');
process.exit(fail ? 1 : 0);
