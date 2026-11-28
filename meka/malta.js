// Mekatronik Mühendisliği — Malta haçı (dış Geneva mekanizması). Saf hesap; DOM gerektirmez (tests/meka-malta.test.mjs).
//
// Sürekli dönen krank (kol) üzerindeki pim, z yuvalı tekerin yuvasına teğet girer, tekeri 360/z derece çevirir ve çıkar;
// kalan sürede kilit diski tekerin içbükey kilit yayına oturur, teker kıpırdamaz (bekleme). Döner tabla, dolum ve montaj
// makinelerinde adım adım ilerletme için kullanılır.
// Geometri (a: mil merkezleri arası, λ = sin(π/z)): krank yarıçapı r = a·λ; pim yuvaya teğet girdiği için teker yuva ağzı
// yarıçapı R = a·cos(π/z); dış yarıçap Ro = √(R² + rp²) (rp: pim yarıçapı). Yuva genişliği w = pim çapı + boşluk; yuva dibi
// pimin en derin noktasından (a − r) yarım daire. Kilit yayları yuvaların ortasında, merkezi a uzaklıkta, yarıçapı Rd + boşluk;
// kilit diskinde tekerin boynuzu geçsin diye pim tarafında Ro + boşluk yarıçaplı oyuk.
// Kinematik (krank açısı φ, merkez çizgisinden; kavrama |φ| ≤ α = π/2 − π/z):
//   tan β = λ sin φ / (1 − λ cos φ);  ω₂/ω₁ = λ (cos φ − λ) / (1 − 2λ cos φ + λ²);  α₂/ω₁² = λ (λ² − 1) sin φ / (1 − 2λ cos φ + λ²)²
//   en büyük hız oranı φ = 0'da λ / (1 − λ). Adımlama süresi oranı 1/2 − 1/z, bekleme 1/2 + 1/z (Shigley, Mechanism design).
// Dinamik: teker + yük ataleti J → krank torku T = J·α₂·(ω₂/ω₁) (güç dengesi; sürtünme yok).

const PI = Math.PI;
const tf = (v, d) => v.toFixed(d).replace('.', ',');
const num = (v, d) => (Number.isFinite(+v) ? +v : d);
export const MALTA_DEFAULTS = { z: 4, a: 100, dp: 12, bosluk: 0.2, kilit: 4, delik: 20, kDelik: 20, kalinlik: 12, n: 30, J: 0 };
// "Döner dolum tablası" şablonu (temsilî): 6 istasyonlu tabla, 25 çevrim/dk
export const MALTA_ORNEK = () => ({ ...MALTA_DEFAULTS, z: 6, a: 140, dp: 16, kilit: 5, delik: 30, kDelik: 25, kalinlik: 15, n: 25, J: 0.35 });

export function maltaSanitize(o) {
  const x = o && typeof o === 'object' ? o : {}, D = MALTA_DEFAULTS, out = {};
  for (const k of Object.keys(D)) out[k] = num(x[k], D[k]);
  out.z = Math.round(out.z);
  return out;
}
export const beta = (phi, lam) => Math.atan2(lam * Math.sin(phi), 1 - lam * Math.cos(phi));
export const hizOrani = (phi, lam) => lam * (Math.cos(phi) - lam) / (1 - 2 * lam * Math.cos(phi) + lam * lam);
export const ivmeOrani = (phi, lam) => lam * (lam * lam - 1) * Math.sin(phi) / (1 - 2 * lam * Math.cos(phi) + lam * lam) ** 2;

const segDist = (p, a, b) => { const dx = b[0] - a[0], dy = b[1] - a[1], L = dx * dx + dy * dy, u = L ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L)) : 0; return Math.hypot(p[0] - a[0] - u * dx, p[1] - a[1] - u * dy); };
// ışın (açı ψ) boyunca merkezi c (orijinden a uzaklık, açı γ), yarıçapı R olan daireye ilk giriş uzaklığı (yoksa Infinity)
const rayIn = (psi, gam, a, R) => { const d = psi - gam, s = a * Math.sin(d), c = a * Math.cos(d); if (Math.abs(s) >= R || c <= 0) return Infinity; return c - Math.sqrt(R * R - s * s); };

export function maltaHesap(g0) {
  const g = maltaSanitize(g0);
  if (!(g.z >= 3 && g.z <= 18)) return { g, hata: 'Yuva sayısı 3 ile 18 arasında olmalı' };
  if (!(g.a > 0 && g.dp > 0)) return { g, hata: 'Mil merkezleri arası ve pim çapı sıfırdan büyük olmalı' };
  const z = g.z, lam = Math.sin(PI / z), r = g.a * lam, R = g.a * Math.cos(PI / z), rp = g.dp / 2, w = g.dp + g.bosluk;
  const Ro = Math.sqrt(R * R + rp * rp), Rd = r - rp - g.kilit, Rl = Rd + g.bosluk, Rrel = Ro + 2 * g.bosluk + 1, alfa = PI / 2 - PI / z;
  if (!(Rd > 0)) return { g, hata: `Kilit diski yarıçapı sıfırın altında: krank yarıçapı ${r.toFixed(1)} mm, pim ve kilit payı buna sığmıyor. Mil merkezleri arasını büyüt ya da pimi küçült.` };
  const sb = g.a - r;                         // yuva dibi yarım dairesinin merkezi (pimin en derin konumu)
  // teker dış çevresi: ψ yönünde Ro ile kilit yaylarının küçüğü
  const rho = (psi) => { let m = Ro; for (let k = 0; k < z; k++) m = Math.min(m, rayIn(psi, (k + 0.5) * 2 * PI / z, g.a, Rl)); return m; };
  const tek = [];
  for (let k = 0; k < z; k++) {
    const th = k * 2 * PI / z, u = [Math.cos(th), Math.sin(th)], n = [-Math.sin(th), Math.cos(th)];
    const wall = (s, side) => [s * u[0] + side * w / 2 * n[0], s * u[1] + side * w / 2 * n[1]];
    // duvarın çevreyle kesiştiği s (ikiye bölme)
    const sOut = (side) => { let lo = sb, hi = Ro + w; for (let i = 0; i < 60; i++) { const m = (lo + hi) / 2, p = wall(m, side); if (Math.hypot(p[0], p[1]) < rho(Math.atan2(p[1], p[0]))) lo = m; else hi = m; } return lo; };
    const sM = sOut(-1), sP = sOut(+1);
    // − duvarı dışarıdan içeri, dip yarım daire, + duvarı içeriden dışarı
    const nW = 24;
    for (let i = 0; i <= nW; i++) tek.push(wall(sM - (sM - sb) * i / nW, -1));
    for (let i = 1; i < 24; i++) { const sg = PI * i / 24; tek.push([sb * u[0] - w / 2 * (Math.cos(sg) * n[0] + Math.sin(sg) * u[0]), sb * u[1] - w / 2 * (Math.cos(sg) * n[1] + Math.sin(sg) * u[1])]); }   // −n → −u (dip) → +n
    for (let i = 0; i <= nW; i++) tek.push(wall(sb + (sP - sb) * i / nW, +1));
    // çevre: bu yuvanın + duvarından sonrakinin − duvarına
    const pP = wall(sP, +1), psi1 = Math.atan2(pP[1], pP[0]);
    const th2 = (k + 1) * 2 * PI / z, u2 = [Math.cos(th2), Math.sin(th2)], n2 = [-Math.sin(th2), Math.cos(th2)];
    let psi2 = psi1;
    { let lo = sb, hi = Ro + w; for (let i = 0; i < 60; i++) { const m = (lo + hi) / 2, p = [m * u2[0] - w / 2 * n2[0], m * u2[1] - w / 2 * n2[1]]; if (Math.hypot(p[0], p[1]) < rho(Math.atan2(p[1], p[0]))) lo = m; else hi = m; } psi2 = Math.atan2(lo * u2[1] - w / 2 * n2[1], lo * u2[0] - w / 2 * n2[0]); }
    let d = psi2 - psi1; while (d <= 0) d += 2 * PI;
    // uyarlamalı örnekleme: kiriş ortası gerçek eğriden 0,005 mm'den fazla saparsa böl (kilit yayı uçlarında ışın teğete yaklaşır)
    const P = (ps) => { const q = rho(ps); return [q * Math.cos(ps), q * Math.sin(ps)]; };
    const bol = (pa, pb, A, B, derin) => {
      const pm = (pa + pb) / 2, M = P(pm), sap = segDist(M, A, B);
      if (derin < 14 && (sap > 0.005 || pb - pa > PI / 90)) { bol(pa, pm, A, M, derin + 1); tek.push(M); bol(pm, pb, M, B, derin + 1); }
    };
    const nA = Math.max(8, Math.ceil(d / (PI / 90)));
    let prevP = P(psi1);
    for (let i = 1; i <= nA; i++) { const ps = psi1 + d * i / nA, Q = P(ps); bol(psi1 + d * (i - 1) / nA, ps, prevP, Q, 0); if (i < nA) tek.push(Q); prevP = Q; }
  }
  // kilit diski (krank çerçevesi: krank merkezi orijin, pim +x yönünde, r uzaklıkta)
  const disk = [];
  for (let i = 0; i < 720; i++) { const ps = i * PI / 360, q = Math.min(Rd, rayIn(ps, 0, g.a, Rrel)); disk.push([q * Math.cos(ps), q * Math.sin(ps)]); }
  // boynuz kalınlığı: yuva duvarı ile kilit yayı arası en az malzeme
  let boynuz = Infinity;
  for (let k = 0; k < 1; k++) {
    const th = 0, gam = PI / z;
    for (let s = sb; s <= Ro; s += 0.25) { const p = [s * Math.cos(th) + w / 2 * -Math.sin(th), s * Math.sin(th) + w / 2 * Math.cos(th)]; if (Math.hypot(p[0], p[1]) > rho(Math.atan2(p[1], p[0])) + 1e-9) break; const dc = Math.hypot(p[0] - g.a * Math.cos(gam), p[1] - g.a * Math.sin(gam)) - Rl; boynuz = Math.min(boynuz, dc); }
  }
  const dipEt = sb - w / 2 - g.delik / 2, diskEt = Rd - g.kDelik / 2;
  // kinematik tablo (krank 0–360°, 0,5°): teker açısı, hız ve ivme oranı
  const w1 = 2 * PI * g.n / 60, rows = [];
  let w2max = 0, a2max = 0, Tmax = 0;
  for (let i = 0; i < 720; i++) {
    const deg = i / 2, phi = ((deg + 180) % 360 - 180) * PI / 180, ic = Math.abs(phi) <= alfa + 1e-12;
    const hr = ic ? hizOrani(phi, lam) : 0, ir = ic ? ivmeOrani(phi, lam) : 0, b = ic ? beta(phi, lam) : (phi > 0 ? PI / z : -PI / z);
    const w2 = hr * w1, a2 = ir * w1 * w1, T = g.J * a2 * hr;
    w2max = Math.max(w2max, Math.abs(w2)); a2max = Math.max(a2max, Math.abs(a2)); Tmax = Math.max(Tmax, Math.abs(T));
    rows.push({ deg, phi, ic, beta: b, w2, a2, T });
  }
  const K = [], ok = (b, duzey, metin) => K.push({ ok: b, duzey, metin });
  ok(boynuz >= Math.max(2, 0.25 * g.dp), 'hata', boynuz >= Math.max(2, 0.25 * g.dp) ? `Yuva kenarındaki boynuz kalınlığı ${tf(boynuz, 1)} mm — yeterli.` : `Yuva kenarındaki boynuz çok ince (${tf(Math.max(0, boynuz), 1)} mm): kırılır. Kilit payını büyüt ya da pimi küçült.`);
  ok(dipEt >= 3, 'hata', dipEt >= 3 ? `Yuva dibi ile mil deliği arasında ${tf(dipEt, 1)} mm et var.` : `Yuva dibi mil deliğine çok yakın (${tf(dipEt, 1)} mm et): mil deliğini küçült ya da merkezler arasını büyüt.`);
  ok(diskEt >= 3, 'hata', diskEt >= 3 ? `Kilit diskinde mil deliği çevresinde ${tf(diskEt, 1)} mm et var.` : `Kilit diski mil deliğine göre çok küçük (${tf(diskEt, 1)} mm et).`);
  ok(true, 'bilgi', `Teker her adımda ${tf((360 / z), 1)}° döner. Krankın ${tf((2 * alfa * 180 / PI), 0)}°'lik bölümünde döner, ${tf((360 - 2 * alfa * 180 / PI), 0)}°'sinde bekler (adımlama ${tf((100 * (0.5 - 1 / z)), 1)}%, bekleme ${tf((100 * (0.5 + 1 / z)), 1)}%).`);
  ok(true, 'bilgi', `Pim yuvaya teğet girdiği için girişte hız sıfırdır ama ivme birden başlar (${tf(Math.abs(ivmeOrani(alfa, lam)) * w1 * w1, 1)} rad/s²): bu Malta haçının doğasıdır; yüksek devirde vuruntu yapar.`);
  if (g.J > 0) ok(true, 'bilgi', `Teker ve yükü döndürmek için gereken en büyük krank torku ${tf(Tmax, 2)} N·m (sürtünme yok; motor seçiminde pay bırak).`);
  else ok(true, 'bilgi', 'Teker + yük ataleti girilmedi: krank torku hesaplanmadı.');
  const r_ = { g, z, lam, r, R, Ro, Rd, Rl, Rrel, rp, w, sb, alfa, tek, disk, boynuz, dipEt, rows, w1, w2max, a2max, Tmax, kontroller: K };
  r_.uygun = K.every((c) => c.ok || c.duzey !== 'hata');
  r_.adimSn = (2 * alfa) / w1; r_.bekleSn = (2 * PI - 2 * alfa) / w1;
  return r_;
}

/* ---------- çıktılar ---------- */
const f4 = (v) => (Math.round(v * 1e4) / 1e4).toString();
export function maltaDXF(r, ad = 'MALTA') {
  const o = [], w = (c, v) => o.push(String(c), String(v)), nm = ad.replace(/[^\x20-\x7e]/g, '?');
  w(0, 'SECTION'); w(2, 'HEADER'); w(9, '$ACADVER'); w(1, 'AC1009'); w(9, '$INSUNITS'); w(70, 4); w(0, 'ENDSEC');
  w(0, 'SECTION'); w(2, 'TABLES'); w(0, 'TABLE'); w(2, 'LAYER'); w(70, 5);
  for (const [n, c] of [['0', 7], ['TEKER', 1], ['KILIT_DISKI', 5], ['DELIK', 3], ['YARDIMCI', 8]]) { w(0, 'LAYER'); w(2, n); w(70, 0); w(62, c); w(6, 'CONTINUOUS'); }
  w(0, 'ENDTAB'); w(0, 'ENDSEC'); w(0, 'SECTION'); w(2, 'ENTITIES');
  const poly = (layer, pts, dx = 0) => { w(0, 'POLYLINE'); w(8, layer); w(66, 1); w(10, 0); w(20, 0); w(30, 0); w(70, 1); for (const p of pts) { w(0, 'VERTEX'); w(8, layer); w(10, f4(p[0] + dx)); w(20, f4(p[1])); w(30, 0); } w(0, 'SEQEND'); w(8, layer); };
  const circle = (layer, x, y, R) => { w(0, 'CIRCLE'); w(8, layer); w(10, f4(x)); w(20, f4(y)); w(30, 0); w(40, f4(R)); };
  const text = (x, y, h, t) => { w(0, 'TEXT'); w(8, 'YARDIMCI'); w(10, f4(x)); w(20, f4(y)); w(30, 0); w(40, h); w(1, t); };
  // teker orijinde; krank parçaları sağda, merkezler arası a (kilitli konumda gerçek yerleşim)
  poly('TEKER', r.tek); if (r.g.delik > 0) circle('DELIK', 0, 0, r.g.delik / 2);
  const dx = r.g.a;
  const rot = (p, t) => [p[0] * Math.cos(t) - p[1] * Math.sin(t), p[0] * Math.sin(t) + p[1] * Math.cos(t)];
  poly('KILIT_DISKI', r.disk.map((p) => rot(p, PI)), dx); if (r.g.kDelik > 0) circle('DELIK', dx, 0, r.g.kDelik / 2);
  circle('KILIT_DISKI', dx - r.r, 0, r.rp);   // pim (kilit diskinin oyuğu pime bakar)
  text(-r.Ro, -r.Ro - 8, 3.5, `${nm} MALTA HACI Z${r.z} - MERKEZLER ARASI ${f4(r.g.a)} - PIM D${f4(r.g.dp)}`);
  w(0, 'ENDSEC'); w(0, 'EOF');
  return o.join('\r\n') + '\r\n';
}
export function maltaCSV(r) {
  const L = ['krank_derece;teker_derece;teker_hiz_rad_s;teker_ivme_rad_s2;krank_torku_Nm'];
  for (let i = 0; i < r.rows.length; i += 2) { const q = r.rows[i]; L.push([q.deg, q.beta * 180 / PI, q.w2, q.a2, q.T].map((v) => (Math.round(v * 1000) / 1000).toString().replace('.', ',')).join(';')); }
  return '﻿' + L.join('\r\n') + '\r\n';
}
export function maltaRapor(r, ad = '') {
  const g = r.g, L = ['ÇİZİM ATÖLYESİ — MALTA HAÇI (GENEVA) TASARIM RAPORU', ad, ''];
  L.push('GİRDİLER', `  Yuva sayısı z = ${r.z} · mil merkezleri arası a = ${g.a} mm · pim çapı ${g.dp} mm · yuva boşluğu ${g.bosluk} mm · kilit payı ${g.kilit} mm`,
    `  Teker mil deliği Ø${g.delik} · krank mil deliği Ø${g.kDelik} · kalınlık ${g.kalinlik} mm · krank devri ${g.n} d/dk · teker + yük ataleti ${g.J} kg·m²`,
    '', 'ÖLÇÜLER', `  Krank (pim) yarıçapı r = ${r.r.toFixed(3)} mm · teker yuva ağzı R = ${r.R.toFixed(3)} mm · teker dış yarıçapı Ro = ${r.Ro.toFixed(3)} mm`,
    `  Yuva genişliği ${r.w.toFixed(2)} mm · yuva dibi (pim merkezinin en derin yeri) ${r.sb.toFixed(3)} mm · kilit diski yarıçapı ${r.Rd.toFixed(3)} mm · kilit yayı ${r.Rl.toFixed(3)} mm`,
    `  Boynuz kalınlığı ${r.boynuz.toFixed(2)} mm · yuva dibi – delik eti ${r.dipEt.toFixed(2)} mm`,
    '', 'HAREKET', `  Adım ${(360 / r.z).toFixed(2)}° · adımlama ${(r.adimSn * 1000).toFixed(0)} ms · bekleme ${(r.bekleSn * 1000).toFixed(0)} ms (çevrim ${(60000 / g.n).toFixed(0)} ms)`,
    `  En büyük teker hızı ${r.w2max.toFixed(3)} rad/s (krankın ${(r.lam / (1 - r.lam)).toFixed(3)} katı) · en büyük teker ivmesi ${r.a2max.toFixed(2)} rad/s²`);
  if (g.J > 0) L.push(`  En büyük krank torku ${r.Tmax.toFixed(3)} N·m (sürtünmesiz)`);
  L.push('', 'KONTROLLER', ...r.kontroller.map((c) => '  ' + (c.ok ? (c.duzey === 'bilgi' ? 'ℹ ' : '✓ ') : c.duzey === 'hata' ? '✗ ' : '⚠ ') + c.metin),
    '', 'YÖNTEM', '  Dış Malta haçı kapalı formülleri (Shigley, Theory of Machines and Mechanisms). Teker profili yuva duvarları, dip yarım dairesi ve',
    '  kilit yaylarından; kilit diskinde boynuzun geçtiği oyuk. Pim yuvaya teğet girer (yuva ekseni merkezler çizgisine göre 90°).',
    '  Sürtünme, esneme ve boşlukların vuruntusu yok sayılır. Ön tasarımdır: yüksek devirde yetkin mühendis ve deneme ile doğrulanmalıdır.');
  return L;
}
