// Mekatronik Mühendisliği — Eksantrik (kam) tasarımı: dış profilli disk, öteleme yapan makaralı izleyici (kol).
// Saf fonksiyonlar; DOM gerektirmez (tests/meka-kam.test.mjs).
//
// Hareket planı: [açı (°), strok (mm)] noktaları; ardışık iki nokta arasında strok aynıysa bekleme, artıyorsa itme,
// azalıyorsa geri dönüş. İtme / dönüş eğrisi (normalize u ∈ [0, 1], f(0) = 0, f(1) = 1):
//   Normal       — modifiye sinüs (Norton, Design of Machinery, 8.11; tepe ivme katsayısı 5,53)
//   Yumuşak      — sikloid  f = u − sin(2πu) / 2π (uçlarda ivme 0; katsayı 2π ≈ 6,28)
//   En yumuşak   — 4-5-6-7 polinom f = 35u⁴ − 84u⁵ + 70u⁶ − 20u⁷ (uçlarda ivme ve sarsıntı 0; katsayı 7,51)
// s(θ) = s₀ + h·f(u), s' = h·f'/β, s'' = h·f''/β², s''' = h·f'''/β³ (θ ve β radyan).
// Geometri (öteleme izleyici, kaçıklık e): Rp = Rb + Rr (birincil daire), d = √(Rp² − e²). Kam θ kadar dönünce izleyici
// merkezi kam ekseninde P(θ) = R(∓θ)·[e, d + s]. Kam profili = P − Rr·n (n: P eğrisinin dış normali).
// Basınç açısı φ: izleyici hareket yönü ile temas normali arasındaki açı (geometriden; Norton 8.7: öteleme izleyicide
// 30° altı önerilir). Eğrilik yarıçapı ρ = |P'|³ / (P' × P''); dışbükey kısımda ρ < Rr → profil alttan kesilir
// (makara yuvaya giremez), ρ < 2·Rr dar sayılır (Norton 8.8: ρ_min ≥ 2–3·Rr önerilir).
// Dinamik (isteğe bağlı): ω = 2π·n/60; v = s'·ω, a = s''·ω², j = s'''·ω³. Yay kapalı (kuvvetle kapalı) kamda temas
// kuvveti N = F₀ + k·s + m·a (+ m·g kol düşeyse ağırlık diski bastırır); N < 0 → kol diskten kalkar (zıplama).
// Mil torku T = F·s' (F izleyici yönünde kuvvet, s' m/rad) — sürtünme ve makara ataleti yok sayılır.
import { pdfDoc } from '../tx/pdf.js?v=20261112u';

export const YASALAR = {
  mods: { ad: 'Normal (modifiye sinüs)', Ca: 5.528 },
  sikloid: { ad: 'Yumuşak (sikloid)', Ca: 2 * Math.PI },
  p4567: { ad: 'En yumuşak (4-5-6-7 polinom)', Ca: 7.513 },
};
const PI = Math.PI, K = 4 + PI;
// [f, f', f'', f'''] (u'ya göre)
export function law(name, u) {
  u = Math.min(1, Math.max(0, u));
  if (name === 'sikloid') { const a = 2 * PI * u; return [u - Math.sin(a) / (2 * PI), 1 - Math.cos(a), 2 * PI * Math.sin(a), 4 * PI * PI * Math.cos(a)]; }
  if (name === 'p4567') { const u2 = u * u, u3 = u2 * u, u4 = u3 * u; return [35 * u4 - 84 * u4 * u + 70 * u4 * u2 - 20 * u4 * u3, 140 * u3 - 420 * u4 + 420 * u4 * u - 140 * u4 * u2, 420 * u2 - 1680 * u3 + 2100 * u4 - 840 * u4 * u, 840 * u - 5040 * u2 + 8400 * u3 - 4200 * u4]; }
  // modifiye sinüs (üç parça)
  if (u <= 1 / 8 || u >= 7 / 8) { const a = 4 * PI * u, c0 = u <= 1 / 8 ? 0 : 4; return [(c0 + PI * u - Math.sin(a) / 4) / K, PI * (1 - Math.cos(a)) / K, 4 * PI * PI * Math.sin(a) / K, 16 * PI ** 3 * Math.cos(a) / K]; }
  const b = PI / 3 + 4 * PI * u / 3;
  return [(2 + PI * u - 9 / 4 * Math.sin(b)) / K, PI * (1 - 3 * Math.cos(b)) / K, 4 * PI * PI * Math.sin(b) / K, 16 * PI ** 3 / 3 * Math.cos(b) / K];
}

export const KAM_DEFAULTS = {
  plan: [[0, 0], [90, 0], [180, 40], [270, 40], [360, 0]],
  yasa: 'mods', Rb: 50, Dr: 30, e: 0, yon: 'ccw', delik: 20, kalinlik: 15, n: 60,
  m: 0, k: 0, F0: 0, dikey: true,
  // G-kodu
  takim: 10, devir: 6000, ilerleme: 600, kademe: 3, guvenli: 10,
};
// "Poşet kaynak çenesi" şablonu (temsilî): 0–100° bekle, 100–160° 30 mm it, 160–220° kaynak süresi bekle, 220–300° geri, 300–360° bekle
export const KAM_ORNEK = () => ({ ...KAM_DEFAULTS, plan: [[0, 0], [100, 0], [160, 30], [220, 30], [300, 0], [360, 0]], yasa: 'mods', Rb: 65, Dr: 32, delik: 25, kalinlik: 16, n: 60, m: 2.5, k: 3, F0: 60, dikey: true });

const tf = (v, d) => v.toFixed(d).replace('.', ',');
const num = (v, d) => (Number.isFinite(+v) ? +v : d);
export function kamSanitize(o) {
  const D = KAM_DEFAULTS, x = o && typeof o === 'object' ? o : {}, out = {};
  for (const k of Object.keys(D)) out[k] = k === 'plan' ? null : typeof D[k] === 'number' ? num(x[k], D[k]) : typeof D[k] === 'boolean' ? (typeof x[k] === 'boolean' ? x[k] : D[k]) : (typeof x[k] === 'string' ? x[k] : D[k]);
  out.plan = Array.isArray(x.plan) && x.plan.length >= 2 ? x.plan.slice(0, 40).map((p) => [num(p && p[0], 0), num(p && p[1], 0)]) : D.plan.map((p) => p.slice());
  if (!YASALAR[out.yasa]) out.yasa = 'mods';
  if (out.yon !== 'cw') out.yon = 'ccw';
  return out;
}
// planın denetimi ve bölümlere ayrılması
export function bolumler(plan) {
  const err = [];
  if (!plan.length || plan[0][0] !== 0) err.push('Plan 0° ile başlamalı');
  if (plan[plan.length - 1][0] !== 360) err.push('Plan 360° ile bitmeli');
  for (let i = 1; i < plan.length; i++) if (!(plan[i][0] > plan[i - 1][0])) err.push(`${i + 1}. satır: açı bir öncekinden büyük olmalı`);
  if (Math.abs(plan[plan.length - 1][1] - plan[0][1]) > 1e-9) err.push('360°deki strok 0°dekiyle aynı olmalı (disk bir turda başa döner)');
  if (plan.some((p) => p[1] < 0)) err.push('Strok negatif olamaz (0 = en alttaki konum)');
  const seg = [];
  for (let i = 1; i < plan.length; i++) {
    const [a0, s0] = plan[i - 1], [a1, s1] = plan[i];
    seg.push({ a0, a1, s0, s1, tur: Math.abs(s1 - s0) < 1e-9 ? 'bekle' : s1 > s0 ? 'it' : 'geri' });
  }
  return { seg, err };
}
// θ (radyan, 0–2π) için [s, s', s'', s''']
export function hareket(seg, yasa, th) {
  const deg = ((th * 180 / PI) % 360 + 360) % 360;
  const b = seg.find((q) => deg >= q.a0 - 1e-9 && deg <= q.a1 + 1e-9) || seg[seg.length - 1];
  if (b.tur === 'bekle') return [b.s0, 0, 0, 0];
  const beta = (b.a1 - b.a0) * PI / 180, h = b.s1 - b.s0, u = (deg - b.a0) / (b.a1 - b.a0), f = law(yasa, u);
  return [b.s0 + h * f[0], h * f[1] / beta, h * f[2] / beta ** 2, h * f[3] / beta ** 3];
}

// tam hesap: N örnek (varsayılan 0,25°)
export function kamHesap(g0, opt = {}) {
  const g = kamSanitize(g0), { seg, err } = bolumler(g.plan);
  if (err.length) return { hata: err.join(' · '), g };
  const Rr = g.Dr / 2, Rp = g.Rb + Rr, e = g.e;
  if (!(g.Rb > 0 && Rr > 0)) return { hata: 'Temel daire ve makara ölçüsü sıfırdan büyük olmalı', g };
  if (Math.abs(e) >= Rp) return { hata: 'Kaçıklık birincil daire yarıçapından (Rb + makara yarıçapı) küçük olmalı', g };
  if (g.delik > 0 && g.delik / 2 >= g.Rb - 3) return { hata: 'Mil deliği temel daireye çok yakın (delik yarıçapı + 3 mm < temel daire olmalı)', g };
  const d = Math.sqrt(Rp * Rp - e * e), sg = g.yon === 'cw' ? 1 : -1;   // kam saat yönünün tersine dönerse izleyici kam ekseninde −θ döner
  const P = (th) => { const s = hareket(seg, g.yasa, th)[0], c = Math.cos(sg * th), sn = Math.sin(sg * th), x = e, y = d + s; return [c * x - sn * y, sn * x + c * y]; };
  const N = opt.N || 1440, dth = 2 * PI / N, hd = 1e-5, w = 2 * PI * g.n / 60;
  const rows = [], prof = [], pitch = [];
  let phiMax = 0, phiAt = 0, rhoMin = Infinity, rhoAt = 0, rhoConc = Infinity, vMax = 0, aMax = 0, aMin = 0, jMax = 0, Nmin = Infinity, NminAt = 0, Tmax = 0, F0req = -Infinity;
  for (let i = 0; i < N; i++) {
    const th = i * dth, [s, s1, s2, s3] = hareket(seg, g.yasa, th);
    const p = P(th), pa = P(th - hd), pb = P(th + hd);
    const d1 = [(pb[0] - pa[0]) / (2 * hd), (pb[1] - pa[1]) / (2 * hd)], d2 = [(pb[0] - 2 * p[0] + pa[0]) / (hd * hd), (pb[1] - 2 * p[1] + pa[1]) / (hd * hd)];
    const L = Math.hypot(d1[0], d1[1]);
    let n = [d1[1] / L, -d1[0] / L]; if (n[0] * p[0] + n[1] * p[1] < 0) n = [-n[0], -n[1]];   // dışa bakan normal
    // eğri kam ekseninde sg yönünde dolaşır (sg = +1: saat yönünün tersi): o yönde sola dönüş = dışbükey
    const cross = d1[0] * d2[1] - d1[1] * d2[0];
    const rho = (sg * cross > 0 ? 1 : -1) * L ** 3 / Math.max(Math.abs(cross), 1e-30);   // + dışbükey, − içbükey
    const dir = [-Math.sin(sg * th), Math.cos(sg * th)];   // izleyici yönü (kam ekseninde)
    const phi = Math.acos(Math.min(1, Math.abs(n[0] * dir[0] + n[1] * dir[1]))) * 180 / PI;
    const q = [p[0] - Rr * n[0], p[1] - Rr * n[1]];
    pitch.push(p); prof.push(q);
    const v = s1 * w / 1000, a = s2 * w * w / 1000, j = s3 * w ** 3 / 1000;   // m/s, m/s², m/s³
    let Nc = null, T = null;
    if (g.m > 0 || g.k > 0 || g.F0 > 0) {
      const grav = g.dikey ? g.m * 9.81 : 0;
      Nc = g.F0 + g.k * s + g.m * a + grav;
      T = Nc * s1 / 1000;
      if (Nc < Nmin) { Nmin = Nc; NminAt = th; }
      if (Math.abs(T) > Math.abs(Tmax)) Tmax = T;
      F0req = Math.max(F0req, -(g.k * s + g.m * a + grav));
    }
    if (phi > phiMax) { phiMax = phi; phiAt = th; }
    if (rho > 0 && rho < rhoMin) { rhoMin = rho; rhoAt = th; }
    if (rho < 0 && -rho < rhoConc) rhoConc = -rho;
    vMax = Math.max(vMax, Math.abs(v)); aMax = Math.max(aMax, a); aMin = Math.min(aMin, a); jMax = Math.max(jMax, Math.abs(j));
    rows.push({ deg: th * 180 / PI, s, v, a, j, phi, rho, N: Nc, T });
  }
  const K_ = [], ok = (b, duzey, metin) => K_.push({ ok: b, duzey, metin });
  ok(phiMax <= 30, phiMax > 45 ? 'hata' : 'uyari', `En büyük basınç açısı ${tf(phiMax, 1)}° (${tf((phiAt * 180 / PI), 0)}°'de)` + (phiMax <= 30 ? ' — 30° sınırının altında.' : ': kol bu noktada çok dik itiliyor, kızakta sıkışabilir. Temel daireyi büyüt ya da itme açısını genişlet (30° altı önerilir).'));
  ok(rhoMin >= Rr, 'hata', isFinite(rhoMin) ? `Dışbükey kısımda en küçük eğrilik yarıçapı (makara merkezi yolu) ${tf(rhoMin, 1)} mm` + (rhoMin >= Rr ? '' : `: makara yarıçapından (${Rr} mm) küçük — disk burada sivrileşir, profil alttan kesilir (makara gerçek yolu izleyemez). Temel daireyi büyüt ya da makarayı küçült.`) : 'Dışbükey bölüm yok');
  if (rhoMin >= Rr) ok(rhoMin >= 2 * Rr, 'uyari', rhoMin >= 2 * Rr ? `Eğrilik yeterli (makara yarıçapının ${tf((rhoMin / Rr), 1)} katı).` : `Disk ${tf((rhoAt * 180 / PI), 0)}° civarında dar (eğrilik makara yarıçapının yalnız ${tf((rhoMin / Rr), 1)} katı; 2–3 katı önerilir): temas gerilmesi yüksek, aşınma artar.`);
  if (Nmin !== Infinity) {
    ok(Nmin > 0, 'hata', Nmin > 0 ? `Temas kuvveti her yerde pozitif (en düşük ${tf(Nmin, 1)} N): kol diskten kalkmaz.` : `Kol ${tf((NminAt * 180 / PI), 0)}°'de diskten KALKAR (temas kuvveti ${tf(Nmin, 1)} N). Yay ön yükünü en az ${Math.ceil(F0req + 10)} N yap, yayı sertleştir ya da hareketi yumuşat / devri düşür.`);
  } else ok(true, 'bilgi', 'Kol kütlesi ve yay değerleri girilmedi: zıplama (diskten kalkma) ve mil torku hesaplanmadı.');
  const r = { g, seg, rows, prof, pitch, Rp, Rr, d, w, phiMax, phiAt: phiAt * 180 / PI, rhoMin, rhoConc, vMax, aMax, aMin, jMax, Nmin: Nmin === Infinity ? null : Nmin, Tmax: Nmin === Infinity ? null : Tmax, F0req: F0req === -Infinity ? null : F0req, kontroller: K_ };
  r.uygun = K_.every((c) => c.ok || c.duzey !== 'hata');
  r.smax = Math.max(...g.plan.map((p) => p[1]));
  return r;
}

/* ---------- çıktılar ---------- */
const f4 = (v) => (Math.round(v * 1e4) / 1e4).toString();
export function kamDXF(r, ad = 'EKSANTRIK') {
  const o = [], w = (c, v) => o.push(String(c), String(v));
  w(0, 'SECTION'); w(2, 'HEADER'); w(9, '$ACADVER'); w(1, 'AC1009'); w(9, '$INSUNITS'); w(70, 4); w(0, 'ENDSEC');
  w(0, 'SECTION'); w(2, 'TABLES'); w(0, 'TABLE'); w(2, 'LAYER'); w(70, 4);
  for (const [n, c] of [['0', 7], ['PROFIL', 1], ['DELIK', 3], ['YARDIMCI', 8]]) { w(0, 'LAYER'); w(2, n); w(70, 0); w(62, c); w(6, 'CONTINUOUS'); }
  w(0, 'ENDTAB'); w(0, 'ENDSEC'); w(0, 'SECTION'); w(2, 'ENTITIES');
  const poly = (layer, pts) => { w(0, 'POLYLINE'); w(8, layer); w(66, 1); w(10, 0); w(20, 0); w(30, 0); w(70, 1); for (const p of pts) { w(0, 'VERTEX'); w(8, layer); w(10, f4(p[0])); w(20, f4(p[1])); w(30, 0); } w(0, 'SEQEND'); w(8, layer); };
  poly('PROFIL', r.prof);
  if (r.g.delik > 0) { w(0, 'CIRCLE'); w(8, 'DELIK'); w(10, 0); w(20, 0); w(30, 0); w(40, f4(r.g.delik / 2)); }
  w(0, 'CIRCLE'); w(8, 'YARDIMCI'); w(10, 0); w(20, 0); w(30, 0); w(40, f4(r.g.Rb));
  w(0, 'LINE'); w(8, 'YARDIMCI'); w(10, 0); w(20, 0); w(30, 0); w(11, 0); w(21, f4(r.g.Rb)); w(31, 0);   // 0° referans çizgisi (izleyici bu yönde)
  w(0, 'TEXT'); w(8, 'YARDIMCI'); w(10, 2); w(20, f4(r.g.Rb * 0.5)); w(30, 0); w(40, 3); w(1, ad.replace(/[^\x20-\x7e]/g, '?') + ' 0 DERECE');
  w(0, 'ENDSEC'); w(0, 'EOF');
  return o.join('\r\n') + '\r\n';
}
export function kamCSV(r, adim = 1) {
  const L = ['aci_derece;strok_mm;hiz_m_s;ivme_m_s2;basinc_acisi_derece;profil_x_mm;profil_y_mm'], st = Math.max(1, Math.round(adim * r.rows.length / 360));
  for (let i = 0; i < r.rows.length; i += st) { const q = r.rows[i], p = r.prof[i]; L.push([q.deg, q.s, q.v, q.a, q.phi, p[0], p[1]].map((v) => (Math.round(v * 1000) / 1000).toString().replace('.', ',')).join(';')); }
  return '﻿' + L.join('\r\n') + '\r\n';
}
// Dış kontur frezeleme (Fanuc / ISO): takım merkezi profilin takım yarıçapı kadar dışında, tırmanma için saat yönünde,
// kademeli derinlik (disk kalınlığı + 0,5 mm), dışarıdan radyal giriş / çıkış. Mil deliği bu programa girmez (delme / raybalama).
// Sıfır: disk merkezi, Z0 disk üst yüzü. İçbükey bölgede takım yarıçapı profil eğriliğinden büyükse oyma olur: hata döner.
export function kamGcode(r, o = {}) {
  const g = r.g, rt = (o.takim ?? g.takim) / 2, F = Math.round(o.ilerleme ?? g.ilerleme), S = Math.round(o.devir ?? g.devir), kd = Math.max(0.2, o.kademe ?? g.kademe), safe = o.guvenli ?? g.guvenli;
  if (!(rt > 0)) return { hata: 'Takım çapı girilmeli' };
  const concCam = isFinite(r.rhoConc) ? r.rhoConc + r.Rr : Infinity;   // içbükey profil yarıçapı
  if (rt >= concCam) return { hata: `Takım çok büyük: profilin içbükey kısmının yarıçapı ${concCam.toFixed(1)} mm, takım yarıçapı bundan küçük olmalı (oyma olur).` };
  const tool = [];
  for (let i = 0; i < r.pitch.length; i++) {
    const p = r.pitch[i], q = r.prof[i], nx = (p[0] - q[0]) / r.Rr, ny = (p[1] - q[1]) / r.Rr;   // dış normal
    tool.push([q[0] + rt * nx, q[1] + rt * ny]);
  }
  // saat yönü (tırmanma, M3) için sırayı ayarla: işaretli alan > 0 ise saat yönünün tersi
  let A = 0; for (let i = 0; i < tool.length; i++) { const a = tool[i], b = tool[(i + 1) % tool.length]; A += a[0] * b[1] - b[0] * a[1]; }
  if (A > 0) tool.reverse();
  // seyrelt: 0,02 mm sapmaya kadar
  const pts = [tool[0]];
  for (let i = 1; i < tool.length; i++) { const a = pts[pts.length - 1], b = tool[i], c = tool[(i + 1) % tool.length]; const dx = c[0] - a[0], dy = c[1] - a[1], L = Math.hypot(dx, dy) || 1, dev = Math.abs((b[0] - a[0]) * dy - (b[1] - a[1]) * dx) / L; if (dev > 0.02 || Math.hypot(b[0] - a[0], b[1] - a[1]) > 5) pts.push(b); }
  const p0 = pts[0], r0 = Math.hypot(p0[0], p0[1]), lead = [p0[0] * (1 + (rt + 5) / r0), p0[1] * (1 + (rt + 5) / r0)];
  const X = (v) => v.toFixed(3), L = [];
  const Zend = -(g.kalinlik + 0.5), levels = [];
  for (let z = -kd; z > Zend + 1e-9; z -= kd) levels.push(z); levels.push(Zend);
  L.push('%', 'O2001 (EKSANTRIK DIS PROFIL)', '(CIZIM ATOLYESI - EKSANTRIK KAM)', '(SIFIR: DISK MERKEZI, Z0 DISK UST YUZU)', `(DISK KALINLIGI ${g.kalinlik} MM - TAKIM D${(rt * 2).toFixed(1)} PARMAK FREZE)`,
    '(MIL DELIGI BU PROGRAMDA YOK: AYRI DELINIR / RAYBALANIR)', '(ILK CALISTIRMA: KUMANDA SIMULASYONU, TEK BLOK VE DUSUK ILERLEME)', 'G21 G17 G40 G49 G80 G90', 'T1 M6', `S${S} M3`, `G0 G54 X${X(lead[0])} Y${X(lead[1])}`, `G43 Z${safe.toFixed(1)} H1`, 'M8');
  for (const z of levels) {
    L.push(`G0 Z${(Math.min(safe, 2)).toFixed(1)}`, `G1 Z${z.toFixed(3)} F${Math.round(F / 2)}`, `G1 X${X(p0[0])} Y${X(p0[1])} F${F}`);
    for (let i = 1; i < pts.length; i++) L.push(`X${X(pts[i][0])} Y${X(pts[i][1])}`);
    L.push(`X${X(p0[0])} Y${X(p0[1])}`, `X${X(lead[0])} Y${X(lead[1])}`);
  }
  L.push(`G0 Z${safe.toFixed(1)}`, 'M9', 'M5', 'G91 G28 Z0.', 'G90', 'M30', '%');
  return { kod: L.join('\n') + '\n', stok: Math.max(...r.prof.map((p) => Math.hypot(p[0], p[1]))) * 2 + 10, z: Zend };
}
export function kamRapor(r, ad = '') {
  const g = r.g, L = ['ÇİZİM ATÖLYESİ — EKSANTRİK (KAM) TASARIM RAPORU', ad, ''];
  L.push('HAREKET PLANI');
  for (const b of r.seg) L.push(`  ${b.a0}° – ${b.a1}°: ${b.tur === 'bekle' ? 'bekle' : b.tur === 'it' ? 'it' : 'geri gel'} (${b.s0} → ${b.s1} mm)`);
  L.push('', 'GİRDİLER', `  Hareket eğrisi: ${YASALAR[g.yasa].ad}`, `  Temel daire yarıçapı Rb = ${g.Rb} mm · makara çapı ${g.Dr} mm · kaçıklık e = ${g.e} mm · dönüş ${g.yon === 'cw' ? 'saat yönü' : 'saat yönünün tersi'}`,
    `  Mil deliği Ø${g.delik} mm · disk kalınlığı ${g.kalinlik} mm · devir ${g.n} çevrim/dk`, g.m || g.k || g.F0 ? `  Kol kütlesi ${g.m} kg · yay sertliği ${g.k} N/mm · ön yük ${g.F0} N · ${g.dikey ? 'kol düşey (ağırlık diske bastırır)' : 'kol yatay'}` : '  Kol kütlesi / yay girilmedi',
    '', 'SONUÇLAR', `  En büyük basınç açısı ${r.phiMax.toFixed(2)}° (${r.phiAt.toFixed(0)}°'de)`, `  Dışbükey en küçük eğrilik yarıçapı (makara merkezi yolu) ${isFinite(r.rhoMin) ? r.rhoMin.toFixed(2) + ' mm' : '—'}`,
    `  En yüksek hız ${r.vMax.toFixed(3)} m/s · ivme +${r.aMax.toFixed(2)} / ${r.aMin.toFixed(2)} m/s² · sarsıntı ${r.jMax.toFixed(1)} m/s³`);
  if (r.Nmin != null) L.push(`  En düşük temas kuvveti ${r.Nmin.toFixed(1)} N · en büyük mil torku ${Math.abs(r.Tmax).toFixed(2)} N·m (sürtünmesiz)`);
  L.push('', 'KONTROLLER', ...r.kontroller.map((c) => '  ' + (c.ok ? '✓ ' : c.duzey === 'hata' ? '✗ ' : '⚠ ') + c.metin),
    '', 'YÖNTEM', '  Modifiye sinüs, sikloid ve 4-5-6-7 polinom hareket eğrileri (Norton, Design of Machinery, bölüm 8). Basınç açısı ve eğrilik',
    '  yarıçapı makara merkezi yolundan sayısal türevle (0,25° adım). Temas kuvveti N = F0 + k·s + m·a (+ m·g); sürtünme, makara ataleti,',
    '  kol esnekliği ve titreşim yok sayılır. Ön tasarımdır: yüksek devirli makinede yetkin mühendis ve deneme ile doğrulanmalıdır.');
  return L;
}
