// Çalıştır: node tests/meka.test.mjs
// Mekatronik hesap motoru. Beklenen değerler formülden BAĞIMSIZ olarak elle hesaplanmıştır (yorumlarda işlem görünür).
import assert from 'node:assert/strict';
import { emptyProject, sanitize, addItem, removeItem, applyLinks, linkChecks, bomRows, bomCSV, libAdd, libSanitize, missing } from '../meka/tree.js';
import { beltAxis, rackAxis, rotaryTable, gearbox, shaft } from '../meka/calc.js';
import { screwAxis, bearingLife, pneumatic, pickCylinder, reportLines, G, SCREW_MOUNT, ISO281_A1, CYL_ROD } from '../meka/calc.js';

let fail = 0;
const t = (name, fn) => {
  try { fn(); console.log('ok   ', name); }
  catch (e) { fail++; console.log('FAIL ', name, '\n     ', String(e.message).split('\n')[0]); }
};
const near = (a, b, rel, m = '') => assert.ok(Math.abs(a - b) <= Math.abs(b) * rel + 1e-12, `${m} ${a} ≉ ${b} (±%${rel * 100})`);
const step = (r, ad) => r.adimlar.find((s) => s.ad.startsWith(ad)).deger;

/* ---------- vida + motor ---------- */
// Örnek: yatay eksen, m = 50 kg, μ = 0,01, Fdış = 0 → F = 50·9,80665·0,01 = 4,9033 N
// hatve 10 mm, ηv = 0,9, i = 1, ηr = 1 → T_yük = 4,9033·0,01 / (2π·0,9) = 0,0086711 N·m
// v = 0,25 m/s → n_vida = 0,25/0,01·60 = 1500 dev/dk; ta = 0,15 s → ω = 157,0796 rad/s, α = 1047,198 rad/s²
// J_vida = π·7850·0,8·0,02⁴/32 = 9,8646e-5 kg·m²; J_yük = 50·(0,01/2π)² = 1,26651e-4 kg·m²
// J' = 9,8646e-5 + 1,26651e-4/0,9 + 2e-5 = 2,59369e-4; Jm = 1,2e-4 → oran 2,1614
// T_h = (1,2e-4 + 2,59369e-4)·1047,198 + 0,0086711 = 0,405950 N·m
const base = { m: 50, mu: 0.01, aci: 0, Fdis: 0, P: 10, d: 20, dr: 17.5, L: 800, mount: 'sabit-mesnetli', etaS: 0.9, rho: 7850, i: 1, etaG: 1, Jc: 0.00002, strok: 300, v: 0.25, ta: 0.15, td: 0.5, tutma: 'motor', Jm: 0.00012, Tn: 1.27, Tmax: 3.8, nmax: 3000, SF: 1.5, oranSinir: 10 };

t('Vida: kuvvet, yük torku, devir (elle hesap)', () => {
  const r = screwAxis(base);
  near(r.sonuc.Fsur, 4.903325, 1e-6, 'F');
  near(r.sonuc.Tl, 0.0086711, 1e-4, 'T_yük');
  near(r.sonuc.nS, 1500, 1e-9, 'n_vida');
  near(r.sonuc.nM, 1500, 1e-9, 'n_motor');
});

t('Vida: ataletler ve hızlanma torku (elle hesap)', () => {
  const r = screwAxis(base);
  near(r.sonuc.Js, 9.8646e-5, 1e-4, 'J_vida');
  near(r.sonuc.Jl, 1.26651e-4, 1e-4, 'J_yük');
  near(r.sonuc.Jref, 2.59369e-4, 1e-4, "J'");
  near(r.sonuc.ratio, 2.1614, 1e-3, 'oran');
  near(r.sonuc.Tacc, 0.405950, 1e-4, 'T_h');
});

t('Vida: RMS tork (elle hesap) — tc = (0,3 − 0,25·0,15)/0,25 = 1,05 s, çevrim 1,85 s', () => {
  const r = screwAxis(base);
  near(r.sonuc.tc, 1.05, 1e-9); near(r.sonuc.tcyc, 1.85, 1e-9);
  const Th = 0.405950, Tl = 0.0086711, Ty = -(0.405950 - 0.0086711) + 0.0086711;
  const rms = Math.sqrt((Th * Th * 0.15 + Tl * Tl * 1.05 + Ty * Ty * 0.15) / 1.85);   // yatay: tutma torku 0
  near(r.sonuc.Trms, rms, 1e-4);
  assert.equal(r.uygun, true);
});

t('Vida: kritik devir ve burkulma [THK] (elle hesap)', () => {
  const r = screwAxis(base);
  // n_k = 15,1·17,5/800²·10⁷ = 4128,906 dev/dk; P_k = 10,2·17,5⁴/800²·10⁴ = 14947,64 N
  near(r.sonuc.nc, 4128.906, 1e-6);
  near(r.sonuc.Pk, 14947.64, 1e-6);
  assert.deepEqual(Object.keys(SCREW_MOUNT).map((k) => [SCREW_MOUNT[k].lambda, SCREW_MOUNT[k].eta]), [[3.4, 1.3], [9.7, 5.1], [15.1, 10.2], [21.9, 20.3]]);
});

t('Vida: uzun ince vidada kritik devir aşılır → HATA, uygun değil', () => {
  const r = screwAxis({ ...base, L: 2500, v: 1, mount: 'sabit-serbest' });
  assert.equal(r.uygun, false);
  assert.ok(r.kontroller.some((c) => !c.ok && c.duzey === 'hata' && /kritik devr/.test(c.metin)));
});

t('Vida: düşey eksen — yerçekimi torku ve fren uyarısı', () => {
  const r = screwAxis({ ...base, aci: 90, mu: 0 });
  near(r.sonuc.Fsur, 50 * G, 1e-9);
  near(r.sonuc.Thold, (50 * G * 0.01) / (2 * Math.PI * 0.9), 1e-9);   // 0,86711 N·m
  assert.ok(r.kontroller.some((c) => /kendiliğinden kilitlenmez/.test(c.metin)));
});

t('Vida: küçük motor → RMS / tepe tork hatası; redüktör (i = 3) ile düzelir', () => {
  const small = { ...base, m: 300, Tn: 0.32, Tmax: 0.95, Jm: 0.00003 };
  const a = screwAxis(small);
  assert.equal(a.uygun, false);
  const b = screwAxis({ ...small, i: 3, etaG: 0.95, nmax: 6000, P: 20 });
  assert.ok(b.sonuc.Tpk < a.sonuc.Tpk);
});

t('Vida: kısa strok → üçgen profil, en yüksek hız düşer', () => {
  const r = screwAxis({ ...base, strok: 20 });
  assert.equal(r.sonuc.tc, 0);
  near(r.sonuc.a, 0.02 / 0.15 / 0.15, 1e-9);
});

t('Vida: hatalı giriş açık hata verir', () => {
  assert.throws(() => screwAxis({ ...base, P: 0 }), /Sıfırdan büyük/);
  assert.throws(() => screwAxis({ ...base, etaS: 1.2 }), /Verim/);
  assert.throws(() => screwAxis({ ...base, dr: 25 }), /Diş dibi/);
  assert.throws(() => screwAxis({ ...base, m: NaN }), /Eksik/);
});

/* ---------- rulman ISO 281 ---------- */
t('Rulman: L10 = (14000/2000)³ = 343 milyon devir; 1500 dev/dk → 3811,1 saat', () => {
  const r = bearingLife({ tip: 'bilyali', C: 14000, Fr: 2000, n: 1500, guv: 90, hedef: 3000 });
  near(r.sonuc.L10, 343, 1e-12);
  near(r.sonuc.L10h, 343e6 / 90000, 1e-12);
  assert.equal(r.uygun, true);
});

t('Rulman: %99 güvenilirlik a1 = 0,25 → 952,8 saat; hedef 3000 saat → HATA', () => {
  const r = bearingLife({ C: 14000, Fr: 2000, n: 1500, guv: 99, hedef: 3000 });
  near(r.sonuc.Lnm, 0.25 * 343e6 / 90000, 1e-12);
  assert.equal(r.uygun, false);
  assert.deepEqual(ISO281_A1, { 90: 1, 95: 0.64, 96: 0.55, 97: 0.47, 98: 0.37, 99: 0.25 });
});

t('Rulman: makaralı p = 10/3; X / Y ile eşdeğer yük', () => {
  const r = bearingLife({ tip: 'makarali', C: 50000, Fr: 4000, Fa: 1000, X: 0.4, Y: 1.6, n: 600, guv: 90, hedef: 1 });
  near(r.sonuc.P, 0.4 * 4000 + 1.6 * 1000, 1e-12);   // 3200 N
  near(r.sonuc.L10, (50000 / 3200) ** (10 / 3), 1e-12);
});

t('Rulman: eksenel yük ama Y = 0 → uyarı; geçersiz güvenilirlik → hata', () => {
  const r = bearingLife({ C: 14000, Fr: 2000, Fa: 300, n: 1500 });
  assert.ok(r.kontroller.some((c) => !c.ok && c.duzey === 'uyari' && /Fa\/Fr/.test(c.metin)));
  assert.throws(() => bearingLife({ guv: 93 }), /Güvenilirlik/);
});

/* ---------- pnömatik ---------- */
t('Pnömatik: Ø50/Ø20, 6 bar → itme 1178,10 N, çekme 989,60 N (elle hesap)', () => {
  const r = pneumatic({ D: 50, p: 6, yuk: 500 });
  assert.equal(r.giris.d, 20);   // ISO 15552 standart mil
  near(r.sonuc.Fi, 0.6 * Math.PI * 2500 / 4, 1e-12);          // 1178,097
  near(r.sonuc.Fc, 0.6 * Math.PI * (2500 - 400) / 4, 1e-12);  // 989,602
});

t('Pnömatik: hava tüketimi Ø50/Ø20, 100 mm, 6 bar → 2,501 NL/çevrim (elle hesap)', () => {
  const r = pneumatic({ D: 50, p: 6, strok: 100, yuk: 100, cevrim: 20 });
  const v = (Math.PI * 2500 / 4 + Math.PI * 2100 / 4) * 100 * (7.013 / 1.013) / 1e6;
  near(r.sonuc.Vcyc, v, 1e-12); near(v, 2.501, 1e-3);
  near(r.sonuc.Q, v * 20, 1e-12);
});

t('Pnömatik: hareketli yükte %70 sınırı; en küçük uygun standart silindir', () => {
  assert.equal(pneumatic({ D: 50, p: 6, yuk: 900 }).uygun, false);   // 900/1178 = %76
  assert.equal(pneumatic({ D: 50, p: 6, yuk: 800 }).uygun, true);    // %68
  const s = pickCylinder(800, 6);
  assert.equal(s.D, 50); assert.equal(s.d, 20); assert.equal(s.std, 'ISO 15552');
  assert.equal(pickCylinder(100, 6).std, 'ISO 6432');
  assert.deepEqual(Object.entries(CYL_ROD).slice(6).map(([D, d]) => [+D, d]), [[32, 12], [40, 16], [50, 20], [63, 20], [80, 25], [100, 25], [125, 32]]);
});

/* ---------- rapor ---------- */
t('Rapor: girdiler, her adım (formül + kaynak), kontroller ve kaynak listesi yazılır', () => {
  const r = screwAxis(base), L = reportLines(r, 'Dolum ünitesi');
  const s = L.join('\n');
  assert.match(s, /Dolum ünitesi/);
  assert.match(s, /UYGUN/);
  assert.ok(r.adimlar.every((a) => s.includes(a.formul)));
  assert.match(s, /\[THK\]/);
  assert.match(s, /üreticinin güncel katalog/);
});

/* ---------- 2. aşama: ürün ağacı ---------- */
function demo() {
  const P = emptyProject();
  const m = addItem(P, 'motor'); m.ad = 'Servo 400 W'; m.kod = 'M-400'; Object.assign(m.deger, { Jm: 0.00025, Tn: 1.27, Tmax: 3.8, nmax: 3000 });
  const v = addItem(P, 'vida'); v.kod = 'BV-1610'; Object.assign(v.deger, { P: 10, d: 16, dr: 13.2, L: 450, eta: 0.92 });
  const k = addItem(P, 'kaplin'); Object.assign(k.deger, { J: 0.00001, Tn: 2 });
  const r = addItem(P, 'reduktor'); Object.assign(r.deger, { i: 3, eta: 0.95, J: 0.00002, Tmax: 6 });
  P.bag.vida = { motor: m.id, vida: v.id, kaplin: k.id, reduktor: r.id };
  return { P, m, v, k, r };
}
t('Ürün ağacı: bağlı bileşenlerin katalog değerleri hesaba geçer, kaynağı yazılır', () => {
  const { P } = demo();
  const a = applyLinks('vida', { ...base }, P);
  assert.equal(a.giris.Jm, 0.00025); assert.equal(a.giris.P, 10); assert.equal(a.giris.etaS, 0.92); assert.equal(a.giris.i, 3); assert.equal(a.giris.etaG, 0.95);
  near(a.giris.Jc, 0.00003, 1e-12);   // kaplin + redüktör giriş ataleti
  assert.match(a.kaynak.Jm, /Servo 400 W \(M-400\)/);
  assert.equal(a.eksik.length, 0);
});
t('Ürün ağacı: eksik zorunlu katalog alanı raporlanır; frenli motor tutmayı frene çevirir', () => {
  const { P, m, v } = demo();
  delete v.deger.dr; m.deger.fren = 1;
  const a = applyLinks('vida', { ...base }, P);
  assert.ok(a.eksik.some((e) => /Diş dibi/.test(e)));
  assert.equal(a.giris.dr, base.dr);
  assert.equal(a.giris.tutma, 'fren');
  assert.deepEqual(missing(v), ['Diş dibi çapı']);
});
t('Ürün ağacı: redüktör çıkış torku (T·i·η) ve kaplin torku kontrolü', () => {
  const { P, r } = demo();
  const res = screwAxis(applyLinks('vida', { ...base, m: 18, aci: 90 }, P).giris);
  const red = linkChecks('vida', res, P).find((x) => /Redüktör/.test(x.metin));
  near(+red.metin.match(/tepe tork ([0-9.]+)/)[1], res.sonuc.Tpk * 3 * 0.95, 0.01);
  r.deger.Tmax = 0.1;
  assert.equal(linkChecks('vida', res, P).find((x) => /Redüktör/.test(x.metin)).ok, false);
});
t('Ürün ağacı: rulman sınır devri ve ISO 76 statik güvenlik (P0 = max(Fr, 0,6Fr + 0,5Fa))', () => {
  const P = emptyProject(); const b = addItem(P, 'rulman'); Object.assign(b.deger, { C: 14000, C0: 6550, nlim: 1000 }); P.bag.rulman = { rulman: b.id };
  const res = bearingLife(applyLinks('rulman', { Fr: 2000, Fa: 3000, X: 0.56, Y: 1.4, n: 1500 }, P).giris);
  const c = linkChecks('rulman', res, P);
  assert.equal(c.find((x) => /sınır devri/.test(x.metin)).ok, false);
  near(+c.find((x) => /s0/.test(x.metin)).metin.match(/= ([0-9.]+) \(/)[1], 6550 / 2700, 0.005);
});
t('Ürün ağacı: bileşen silinince bağları da kalkar; bozuk proje verisi temizlenir', () => {
  const { P, v } = demo();
  removeItem(P, v.id);
  assert.equal(P.bag.vida.vida, undefined);
  const Q = sanitize({ items: [{ id: 1, kind: 'motor', deger: { Jm: 'x', Tn: 2 } }, { id: 1, kind: 'motor' }, { id: 2, kind: 'uzay' }, null], bag: { vida: { motor: 1, vida: 99 } }, nextId: -5 });
  assert.equal(Q.items.length, 1); assert.deepEqual(Q.items[0].deger, { Tn: 2 }); assert.equal(Q.bag.vida.motor, 1); assert.equal(Q.bag.vida.vida, undefined); assert.equal(Q.nextId, 2);
  assert.deepEqual(sanitize('bozuk').items, []);
});
t('Parça listesi: türe göre sıralı, model parçası, hesap durumu; CSV (Excel uyumlu ;)', () => {
  const { P, m } = demo(); m.partId = 7;
  addItem(P, 'sensor').ad = 'Endüktif; sensör "M12"';
  const rows = bomRows(P, (id) => (id === 7 ? 'Motor gövdesi' : ''), { vida: true });
  assert.deepEqual(rows.map((r) => r.tur), ['Servo / adım motoru', 'Redüktör / kayış kasnak', 'Bilyalı vida', 'Kaplin', 'Sensör']);
  assert.equal(rows[0].parca, 'Motor gövdesi'); assert.equal(rows[0].durum, 'uygun'); assert.equal(rows[4].durum, '—');
  const csv = bomCSV(rows);
  assert.ok(csv.startsWith('﻿No;Tür;'));
  assert.ok(csv.includes('"Endüktif; sensör ""M12"""'));
});
t('Kütüphane: aynı ürün kodu güncellenir, tekrar eklenmez; bozuk kayıt atılır', () => {
  const { m } = demo();
  const lib = libAdd([], m); m.deger.Tn = 1.5; libAdd(lib, m);
  assert.equal(lib.length, 1); assert.equal(lib[0].deger.Tn, 1.5);
  assert.equal(libSanitize([...lib, { kind: 'yok' }, 5]).length, 1);
});

/* ---------- 3. aşama ---------- */
t('Mil (iki mesnet, ortada 1000 N, L 200, Ø20): M 50 000 N·mm, y 0,10105 mm, σ 63,66 MPa, θ 0,0015158 rad (elle hesap)', () => {
  const r = shaft({ durum: 'iki-mesnet', F: 1000, L: 200, a: 100, d: 20, T: 20, E: 210000, Re: 355, Sgerek: 2, tIzin: 0.001 });
  // I = π·20⁴/64 = 7853,98; y = F·L³/(48·E·I) = 8e9 / 7,9168e10 = 0,101051 (orta yük: y_max = y_F)
  near(r.sonuc.I, 7853.98, 1e-6); near(r.sonuc.M, 50000, 1e-12); near(r.sonuc.y, 1000 * 200 ** 3 / (48 * 210000 * 7853.9816), 1e-6);
  near(r.sonuc.sb, 63.662, 1e-4); near(r.sonuc.tau, 12.732, 1e-4); near(r.sonuc.sv, Math.sqrt(63.662 ** 2 + 3 * 12.732 ** 2), 1e-4);
  near(r.sonuc.t1, 0.0015158, 1e-4);   // 1000·100·30000 / (6·210000·7853,98·200)
  assert.equal(r.uygun, false);   // eğim 0,0015 > 0,001 rad
  assert.ok(r.kontroller.some((c) => !c.ok && /eğim/.test(c.metin)));
});
t('Mil: yük kenara yakın (a = 50) → R1 = 750, R2 = 250 N; konsol uç yükü y = F·L³/(3EI)', () => {
  const r = shaft({ F: 1000, L: 200, a: 50, d: 20, T: 0, tIzin: 0 });
  near(r.sonuc.R1, 750, 1e-12); near(r.sonuc.R2, 250, 1e-12); near(r.sonuc.M, 1000 * 50 * 150 / 200, 1e-12);
  // y_max (s = 50): F·s·(L² − s²)^1,5 / (9√3·E·I·L)
  near(r.sonuc.y, 1000 * 50 * (40000 - 2500) ** 1.5 / (9 * Math.sqrt(3) * 210000 * 7853.9816 * 200), 1e-6);
  const k = shaft({ durum: 'konsol', F: 200, L: 100, d: 20, T: 0, tIzin: 0 });
  near(k.sonuc.y, 200 * 1e6 / (3 * 210000 * 7853.9816), 1e-6); near(k.sonuc.M, 20000, 1e-12);
  assert.throws(() => shaft({ a: 250 }), /yatakların arasında/);
});
t('Kayış ekseni: F = 10·g·0,1 = 9,807 N; T_yük = F·0,025/0,95 = 0,25807 N·m; n = 1/(π·0,05)·60 = 381,97 dev/dk', () => {
  const r = beltAxis({ m: 10, mu: 0.1, Dp: 50, v: 1, eta: 0.95, i: 1, etaG: 1 });
  near(r.sonuc.F, 9.80665, 1e-9); near(r.sonuc.Tl, 0.258070, 1e-5); near(r.sonuc.nK, 381.972, 1e-5);
  // J_yük = (10 + 0,3)·0,025² = 0,0064375; J' = (2·5e-5 + 0,0064375/0,95)/1 + 2e-5 = 0,00689632
  near(r.sonuc.Jl, 0.0064375, 1e-9); near(r.sonuc.Jref, 0.0068963, 1e-4);
  assert.ok(r.kontroller.some((c) => !c.ok && c.duzey === 'uyari' && /girilmedi/.test(c.metin)));
  assert.equal(beltAxis({ Fizin: 10 }).uygun, false);
});
t('Kremayer ekseni: tek pinyon ataleti; redüktör oranı devri ve ataleti böler', () => {
  const a = rackAxis({ i: 1, etaG: 1 }), b = rackAxis({ i: 5, etaG: 1 });
  near(b.sonuc.nM, a.sonuc.nM * 5, 1e-12);
  near(b.sonuc.Jref - b.giris.Jc, (a.sonuc.Jref - a.giris.Jc) / 25, 1e-9);
  near(a.sonuc.Jref - a.giris.Jc, 0.00003 + 40 * 0.02 ** 2 / 0.95, 1e-9);
});
t('Döner tabla: 90° / 0,5 s, ka = 1/3 → ω = 4,7124 rad/s, α = 28,274 rad/s²; J = 20·0,3²/8 = 0,225; i = 10 → 450 dev/dk', () => {
  const r = rotaryTable({ M: 20, Dt: 300, aci: 90, tm: 0.5, ka: 1 / 3, i: 10, etaG: 0.9, Jek: 0, Tsur: 0.5 });
  near(r.sonuc.Jt, 0.225, 1e-12); near(r.sonuc.wT, 4.712389, 1e-6); near(r.sonuc.nM, 450, 1e-9);
  near(r.sonuc.alpha, 4.712389 * 10 / (0.5 / 3), 1e-6);   // motorda α = ω·i / ta = 282,74
  near(r.sonuc.Jref, 0.225 / (100 * 0.9) + 0.00002, 1e-9);
  near(r.sonuc.Tacc, (0.00012 + 0.00252) * 282.7433 + 0.5 / 9, 1e-5);
  assert.throws(() => rotaryTable({ ka: 0.7 }), /Hızlanma payı/);
});
t('Redüktör: oran, fs ile sürekli tork, tepe tork, giriş devri kontrolleri', () => {
  const r = gearbox({ T2rms: 20, T2tepe: 45, n2: 300, n1: 3000, fs: 1.25, i: 10, T2N: 40, T2max: 80, n1max: 4500, eta: 0.95 });
  near(r.sonuc.iGer, 10, 1e-12); near(r.sonuc.T2s, 25, 1e-12); near(r.sonuc.T1, 45 / 9.5, 1e-12);
  assert.equal(r.uygun, true);
  assert.equal(gearbox({ T2rms: 35, fs: 1.25 }).uygun, false);   // 43,75 > 40
  assert.equal(gearbox({ i: 20, n2: 300, n1max: 4500 }).uygun, false);   // 6000 > 4500
  assert.throws(() => gearbox({ fs: 0.8 }), /Servis/);
});

console.log(fail ? `\n${fail} test BAŞARISIZ` : '\nTüm testler geçti');
process.exit(fail ? 1 : 0);
