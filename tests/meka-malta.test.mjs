// Çalıştır: node tests/meka-malta.test.mjs — Malta haçı (Geneva). Kapalı formüller + bir tam krank turunda çarpışma benzetimi.
import assert from 'node:assert/strict';
import { maltaHesap, maltaSanitize, MALTA_ORNEK, MALTA_DEFAULTS, beta, hizOrani, ivmeOrani, maltaDXF, maltaCSV, maltaRapor } from '../meka/malta.js';

let fail = 0;
const t = (name, fn) => { try { fn(); console.log('ok   ', name); } catch (e) { fail++; console.log('FAIL ', name, '\n     ', String(e.message).split('\n')[0].slice(0, 300)); } };
const near = (a, b, tol, m = '') => assert.ok(Math.abs(a - b) <= tol, `${m} ${a} ≉ ${b}`);
const PI = Math.PI;
const inPoly = (p, poly) => { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const a = poly[i], b = poly[j]; if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < (b[0] - a[0]) * (p[1] - a[1]) / (b[1] - a[1]) + a[0]) c = !c; } return c; };
const segD = (p, a, b) => { const dx = b[0] - a[0], dy = b[1] - a[1], L = dx * dx + dy * dy, u = L ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L)) : 0; return Math.hypot(p[0] - a[0] - u * dx, p[1] - a[1] - u * dy); };
const polyD = (p, poly) => { let m = Infinity; for (let i = 0; i < poly.length; i++) m = Math.min(m, segD(p, poly[i], poly[(i + 1) % poly.length])); return m; };
const rot = (p, t) => [p[0] * Math.cos(t) - p[1] * Math.sin(t), p[0] * Math.sin(t) + p[1] * Math.cos(t)];

t('Kinematik: β(α) = π/z (teğet giriş), en büyük hız oranı λ/(1−λ), hız ve ivme oranı β türevleriyle aynı', () => {
  for (const z of [3, 4, 6, 8]) {
    const lam = Math.sin(PI / z), al = PI / 2 - PI / z;
    near(beta(al, lam), PI / z, 1e-12, 'z' + z); near(hizOrani(0, lam), lam / (1 - lam), 1e-12); near(hizOrani(al, lam), 0, 1e-12);
    for (let phi = -al + 0.01; phi < al; phi += 0.05) {
      const h = 1e-6; near((beta(phi + h, lam) - beta(phi - h, lam)) / (2 * h), hizOrani(phi, lam), 1e-6);
      near((hizOrani(phi + h, lam) - hizOrani(phi - h, lam)) / (2 * h), ivmeOrani(phi, lam), 1e-5);
    }
  }
  near(hizOrani(0, Math.sin(PI / 4)), 1 + Math.SQRT2, 1e-12);   // z = 4: 2,414
  const r = maltaHesap({ ...MALTA_DEFAULTS, z: 4, n: 60 });
  near(r.w2max, 2 * PI * (1 + Math.SQRT2), 1e-6); near(r.adimSn, 0.25, 1e-9); near(r.bekleSn, 0.75, 1e-9);
});
t('Geometri: r = a·sin(π/z), yuva ağzı a·cos(π/z), pim girişte ağızda; yuva duvarları eksenden w/2', () => {
  const r = maltaHesap(MALTA_ORNEK()), g = r.g;
  near(r.r, g.a * Math.sin(PI / 6), 1e-12); near(r.R, g.a * Math.cos(PI / 6), 1e-12);
  // girişte pim merkezinin teker merkezine uzaklığı R
  const al = r.alfa, pin = [g.a - r.r * Math.cos(al), -r.r * Math.sin(al)]; near(Math.hypot(...pin), r.R, 1e-9);
  for (const p of r.tek) assert.ok(Math.hypot(...p) <= r.Ro + 1e-6);
  assert.ok(r.uygun, JSON.stringify(r.kontroller.filter((c) => !c.ok)));
});
t('Tam tur benzetimi: kavramada pim yuvanın içinde, tekere değmiyor; beklemede ve adımlamada kilit diski tekere girmiyor', () => {
  for (const cfg of [MALTA_ORNEK(), { ...MALTA_DEFAULTS, z: 4 }, { ...MALTA_DEFAULTS, z: 8, a: 160, dp: 10, kilit: 3, delik: 20 }]) {
    const r = maltaHesap(cfg), g = r.g; assert.ok(!r.hata, r.hata);
    let pinMin = Infinity, diskIn = 0;
    for (let i = 0; i < 360; i++) {
      const phi = (i - 180) * PI / 180, ic = Math.abs(phi) <= r.alfa;
      const th = ic ? -beta(phi, r.lam) : (phi > 0 ? -PI / r.z : PI / r.z);   // teker açısı (krank CCW, teker CW)
      // pim ve krank çerçevesi → dünya: krank merkezi (a, 0), pim açısı π + φ
      const pin = [g.a - r.r * Math.cos(phi), -r.r * Math.sin(phi)];
      if (ic) { const pw = rot(pin, -th); assert.ok(!inPoly(pw, r.tek), 'pim malzemede φ=' + i); pinMin = Math.min(pinMin, polyD(pw, r.tek) - r.rp); }
      // kilit diski: krank çerçevesinde oyuk +x (pim) yönünde → dünyada π + φ döndürülüp (a,0)'a taşınır
      for (let k = 0; k < r.disk.length; k += 6) { const q = rot(r.disk[k], PI + phi), pw = rot([q[0] + g.a, q[1]], -th); if (inPoly(pw, r.tek) && polyD(pw, r.tek) > 0.05) diskIn++; }
    }
    assert.ok(pinMin >= -1e-6 && pinMin <= g.bosluk / 2 + 0.05, 'pim boşluğu ' + pinMin);
    assert.equal(diskIn, 0, 'kilit diski tekere giriyor (z=' + g.z + ')');
  }
});
t('Beklemede kilit: teker döndürülmek istenirse kilit yayı diske dayanır (yay ile disk eş merkezli, aralarında boşluk kadar)', () => {
  const r = maltaHesap(MALTA_ORNEK()), g = r.g, c = [g.a * Math.cos(PI / r.z), g.a * Math.sin(PI / r.z)];
  const onArc = r.tek.filter((p) => Math.abs(Math.hypot(p[0] - c[0], p[1] - c[1]) - r.Rl) < 1e-6);
  assert.ok(onArc.length > 20, 'kilit yayı noktası ' + onArc.length);
  near(r.Rl - r.Rd, g.bosluk, 1e-12);
});
t('Denetimler: ince boynuz, delik eti; dinamik tork; çıktılar', () => {
  const ince = maltaHesap({ ...MALTA_DEFAULTS, kilit: 0.3, dp: 20 });
  assert.ok(!ince.hata && ince.kontroller.some((c) => !c.ok && /boynuz/.test(c.metin)), JSON.stringify(ince.kontroller.map((c) => c.metin)));
  const delik = maltaHesap({ ...MALTA_DEFAULTS, delik: 60 }); assert.ok(delik.kontroller.some((c) => !c.ok && /mil deliğine/.test(c.metin)));
  assert.ok(maltaHesap({ ...MALTA_DEFAULTS, z: 2 }).hata); assert.ok(maltaHesap({ ...MALTA_DEFAULTS, dp: 140 }).hata);
  const r = maltaHesap(MALTA_ORNEK());
  near(r.Tmax, Math.max(...r.rows.map((q) => Math.abs(q.T))), 1e-12); assert.ok(r.Tmax > 0);
  const dxf = maltaDXF(r); assert.equal((dxf.match(/\r\nPOLYLINE\r\n/g) || []).length, 2); assert.ok(/TEKER/.test(dxf) && /KILIT_DISKI/.test(dxf) && !/[^\x00-\x7f]/.test(dxf));
  assert.equal(maltaCSV(r).trim().split('\r\n').length, 361);
  assert.ok(maltaRapor(r).some((l) => /Adım 60\.00°/.test(l)));
  assert.equal(maltaSanitize({ z: 'x', a: -1 }).z, 4);
});

console.log(fail ? `\n${fail} test BAŞARISIZ` : '\nTüm testler geçti');
process.exit(fail ? 1 : 0);
