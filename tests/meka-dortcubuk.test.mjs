// Çalıştır: node tests/meka-dortcubuk.test.mjs — dört çubuk mekanizması
import assert from 'node:assert/strict';
import { konum, hizIvme, sinif, salinimdanTasarla, dortHesap, dortSanitize, DORT_ORNEK, dortCSV, dortRapor } from '../meka/dortcubuk.js';

let fail = 0;
const t = (name, fn) => { try { fn(); console.log('ok   ', name); } catch (e) { fail++; console.log('FAIL ', name, '\n     ', String(e.message).split('\n')[0].slice(0, 300)); } };
const near = (a, b, tol, m = '') => assert.ok(Math.abs(a - b) <= tol, `${m} ${a} ≉ ${b}`);
const PI = Math.PI;
const fark = (x, y) => { let d = x - y; while (d > PI) d -= 2 * PI; while (d < -PI) d += 2 * PI; return d; };

t('Konum: çubuk boyları her açıda korunur; açık ve çapraz montaj ayrı; geçiş açısı tanımla aynı', () => {
  for (const montaj of ['acik', 'capraz']) {
    const g = dortSanitize({ a: 40, b: 120, c: 90, d: 110, p: 60, q: 30, montaj });
    for (let th = 0; th < 2 * PI; th += 0.07) {
      const k = konum(th, g);
      near(Math.hypot(k.A[0], k.A[1]), 40, 1e-9); near(Math.hypot(k.B[0] - k.A[0], k.B[1] - k.A[1]), 120, 1e-9); near(Math.hypot(k.B[0] - 110, k.B[1]), 90, 1e-9);
      near(Math.hypot(k.P[0] - k.A[0], k.P[1] - k.A[1]), 60, 1e-9);
      const u = [k.A[0] - k.B[0], k.A[1] - k.B[1]], v = [110 - k.B[0], -k.B[1]];
      near(Math.acos((u[0] * v[0] + u[1] * v[1]) / (120 * 90)), k.mu, 1e-9);
    }
  }
  const g1 = dortSanitize({ a: 40, b: 120, c: 90, d: 110 }), g2 = { ...g1, montaj: 'capraz' };
  assert.ok(konum(0, g1).B[1] > 0 && konum(0, g2).B[1] < 0, 'açık montajda B üstte, çaprazda altta');
});
t('Hız ve ivme: kapalı formüller sayısal türevle aynı (iki montaj, iki ölçü seti)', () => {
  for (const s of [{ a: 40, b: 120, c: 90, d: 110 }, { a: 25, b: 80, c: 70, d: 60 }]) for (const montaj of ['acik', 'capraz']) {
    const g = dortSanitize({ ...s, montaj }), h = 1e-5;
    for (let th = 0.05; th < 2 * PI; th += 0.11) {
      const k = konum(th, g), m = konum(th - h, g), p = konum(th + h, g), hv = hizIvme(th, k, g);
      near(fark(p.th4, m.th4) / (2 * h), hv.w4, 1e-6); near(fark(p.th3, m.th3) / (2 * h), hv.w3, 1e-6);
      const hm = hizIvme(th - h, m, g), hp = hizIvme(th + h, p, g);
      near((hp.w4 - hm.w4) / (2 * h), hv.a4, 1e-4); near((hp.w3 - hm.w3) / (2 * h), hv.a3, 1e-4);
    }
  }
});
t('Grashof sınıfı: krank–sarkaç, çift krank, değişim noktası, tam dönmeyen', () => {
  assert.equal(sinif(40, 120, 90, 110).ad, 'Krank–sarkaç');
  assert.ok(sinif(60, 80, 70, 25).ciftKrank, 'en kısa sabitse çift krank');
  assert.ok(sinif(40, 100, 80, 60).esit, 'S + L = P + Q');
  assert.ok(!sinif(90, 40, 120, 110).tam, 'en kısa krank değilse krank tam dönmez');
  assert.ok(!sinif(70, 80, 90, 110).tam && !sinif(70, 80, 90, 110).grashof && !sinif(70, 80, 90, 110).esit, 'Grashof dışı');
  assert.ok(/tam dönebilmesi/.test(dortHesap({ a: 90, b: 40, c: 120, d: 110 }).hata));
  const e = dortHesap({ a: 40, b: 100, c: 80, d: 60 });
  assert.ok(!e.hata && !e.uygun && /Değişim noktalı/.test(e.kontroller[0].metin));
});
t('Salınımdan tasarım: istenen salınım tutar, zaman oranı 1; şablon uygun', () => {
  for (const [psi, c, d] of [[60, 80, 120], [45, 100, 150], [90, 60, 140]]) {
    const ab = salinimdanTasarla(psi, c, d), r = dortHesap({ ...ab, c, d, n: 30 });
    near(r.salinim, psi, 0.02, 'salınım'); near(r.oran, 1, 0.01, 'zaman oranı');
  }
  assert.equal(salinimdanTasarla(60, 120, 100), null, 'sabit sarkaçtan kısa olamaz');
  const r = dortHesap(DORT_ORNEK());
  assert.ok(r.uygun && Math.abs(r.salinim - 60) < 0.05, 'şablon: ' + r.salinim);
  // kaçık (zaman oranı ≠ 1) bir mekanizmada gidiş + dönüş = 360 ve oran ≥ 1
  const q = dortHesap({ a: 30, b: 100, c: 70, d: 90 });
  near(q.git + q.don, 360, 1e-9); assert.ok(q.oran > 1.01);
});
t('Tork: güç dengesi; yalnız atalette ortalama tork ≈ 0; ters yönde aynı salınım; CSV ve rapor', () => {
  const g = { ...DORT_ORNEK(), M: 0 }, r = dortHesap(g);
  assert.ok(Math.abs(r.Tort) < 1e-3 * r.Tmax, 'atalet tek başına net iş yapmaz: ' + r.Tort);
  const r2 = dortHesap({ ...g, J: 0, M: 3 });
  // sabit yük torku: krankın ortalama gücü = M × ortalama |ω₄|
  const ortW4 = r2.rows.reduce((s, q) => s + Math.abs(q.w4), 0) / r2.rows.length;
  near(r2.Port, 3 * ortW4, 1e-3 * r2.Port);
  near(r2.salinim, ortW4 * 180 / r2.w, 0.05, 'salınım = ∫|ω₄|dt / 2');
  const cw = dortHesap({ ...g, yon: 'cw' }); near(cw.salinim, r.salinim, 1e-6);
  const csv = dortCSV(r); assert.ok(csv.startsWith('﻿') && csv.split('\r\n').length > 360);
  const rp = dortRapor(r, 'Deneme').join('\n'); assert.ok(/DÖRT ÇUBUK/.test(rp) && /Krank–sarkaç/.test(rp) && /zaman oranı/.test(rp));
});

if (fail) { console.log(fail + ' test başarısız'); process.exit(1); }
console.log('Tüm testler geçti');
