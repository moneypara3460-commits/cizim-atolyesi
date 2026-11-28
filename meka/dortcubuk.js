// Mekatronik Mühendisliği — dört çubuk mekanizması. Saf hesap; DOM gerektirmez (tests/meka-dortcubuk.test.mjs).
//
// Sabit mafsallar O2 = (0, 0) ve O4 = (d, 0). Krank a (O2–A) sabit ω₂ ile döner, biyel b (A–B), sarkaç c (O4–B).
// Konum: s = |O4 − A|, γ = atan2(−A_y, d − A_x), cos α = (b² + s² − c²)/(2 b s), θ₃ = γ + σα (σ = +1 açık, −1 çapraz montaj),
//   B = A + b(cos θ₃, sin θ₃), θ₄ = atan2(B_y, B_x − d). Geçiş açısı μ = acos((b² + c² − s²)/(2bc)).
// Hız: ω₃ = (a ω₂ / b)·sin(θ₄ − θ₂)/sin(θ₃ − θ₄),  ω₄ = (a ω₂ / c)·sin(θ₂ − θ₃)/sin(θ₄ − θ₃).
// İvme (α₂ = 0): A = c sinθ₄, B = b sinθ₃, C = a ω₂² cosθ₂ + b ω₃² cosθ₃ − c ω₄² cosθ₄,
//   D = c cosθ₄, E = b cosθ₃, F = −a ω₂² sinθ₂ − b ω₃² sinθ₃ + c ω₄² sinθ₄;  α₃ = (CD − AF)/(AE − BD), α₄ = (CE − BF)/(AE − BD).
// Biyel noktası P = A + p·(cos(θ₃ + q), sin(θ₃ + q)). Norton, Design of Machinery, bölüm 4, 6, 7.
// Tork: sarkaç ataleti J ve harekete ters sabit yük torku M için güç dengesi T₂ = (J α₄ + M·işaret(ω₄))·ω₄ / ω₂ (sürtünme yok).
// Tasarım (zaman oranı 1): sarkaç c, salınım ψ, sabit d → a = c·sin(ψ/2), b = √(d² − c²·cos²(ψ/2)) (d > c olmalı).
const PI = Math.PI;
const tf = (v, d) => v.toFixed(d).replace('.', ',');
const num = (v, d) => (Number.isFinite(+v) ? +v : d);
export const DORT_DEFAULTS = { a: 40, b: 120, c: 90, d: 110, p: 60, q: 30, n: 60, yon: 'ccw', montaj: 'acik', J: 0, M: 0 };
// "Poşet açma kolu" şablonu (temsilî): 60° salınım, dakikada 60 çevrim; ölçüler salınımdan tasarlanmış (zaman oranı 1)
export const DORT_ORNEK = () => ({ ...DORT_DEFAULTS, a: 40, b: 97.98, c: 80, d: 120, p: 50, q: 40, n: 60, J: 0.02, M: 3 });

export function dortSanitize(o) {
  const x = o && typeof o === 'object' ? o : {}, D = DORT_DEFAULTS, out = {};
  for (const k of Object.keys(D)) out[k] = typeof D[k] === 'number' ? num(x[k], D[k]) : (typeof x[k] === 'string' ? x[k] : D[k]);
  if (out.yon !== 'cw') out.yon = 'ccw';
  if (out.montaj !== 'capraz') out.montaj = 'acik';
  return out;
}
// Grashof sınıfı ve krankın tam dönüp dönemeyeceği
export function sinif(a, b, c, d) {
  const L = [a, b, c, d].sort((x, y) => x - y), S = L[0], Lg = L[3], P = L[1] + L[2], gr = S + Lg < P - 1e-9, esit = Math.abs(S + Lg - P) <= 1e-9;
  const tam = d + a <= b + c + 1e-12 && Math.abs(d - a) >= Math.abs(b - c) - 1e-12;
  let ad;
  if (!tam) ad = gr || esit ? 'Krank tam dönmüyor (en kısa çubuk krank değil)' : 'Grashof dışı: hiçbir çubuk tam dönmez (üçlü sarkaç)';
  else if (esit) ad = 'Değişim noktalı (kararsız)';
  else if (S === d) ad = 'Çift krank (sarkaç da tam döner)';
  else ad = 'Krank–sarkaç';
  return { grashof: gr, esit, tam, ad, ciftKrank: tam && !esit && S === d };
}
export function konum(th2, g) {
  const { a, b, c, d } = g, sg = g.montaj === 'capraz' ? -1 : 1;
  const A = [a * Math.cos(th2), a * Math.sin(th2)], dx = d - A[0], dy = -A[1], s = Math.hypot(dx, dy);
  const ca = (b * b + s * s - c * c) / (2 * b * s);
  if (!(ca >= -1 - 1e-12 && ca <= 1 + 1e-12)) return null;
  const al = Math.acos(Math.max(-1, Math.min(1, ca))), th3 = Math.atan2(dy, dx) + sg * al;
  const B = [A[0] + b * Math.cos(th3), A[1] + b * Math.sin(th3)], th4 = Math.atan2(B[1], B[0] - d);
  const mu = Math.acos(Math.max(-1, Math.min(1, (b * b + c * c - s * s) / (2 * b * c))));
  const P = [A[0] + g.p * Math.cos(th3 + g.q * PI / 180), A[1] + g.p * Math.sin(th3 + g.q * PI / 180)];
  return { A, B, P, th3, th4, mu };
}
// ω₂ = 1 rad/s için hız ve ivme oranları (ω₃, ω₄, α₃, α₄); gerçek değer: ω·ω₂, α·ω₂²
export function hizIvme(th2, k, g) {
  const { a, b, c } = g, { th3, th4 } = k;
  const w3 = a / b * Math.sin(th4 - th2) / Math.sin(th3 - th4), w4 = a / c * Math.sin(th2 - th3) / Math.sin(th4 - th3);
  const A = c * Math.sin(th4), B = b * Math.sin(th3), C = a * Math.cos(th2) + b * w3 * w3 * Math.cos(th3) - c * w4 * w4 * Math.cos(th4);
  const D = c * Math.cos(th4), E = b * Math.cos(th3), F = -a * Math.sin(th2) - b * w3 * w3 * Math.sin(th3) + c * w4 * w4 * Math.sin(th4);
  const den = A * E - B * D;
  return { w3, w4, a3: (C * D - A * F) / den, a4: (C * E - B * F) / den };
}
// zaman oranı 1 olan krank–sarkaç: salınım ψ (derece), sarkaç c, sabit d → krank a ve biyel b
export function salinimdanTasarla(psiDeg, c, d) {
  const h = psiDeg * PI / 360;
  if (!(psiDeg > 0 && psiDeg < 180 && c > 0 && d > c)) return null;
  return { a: c * Math.sin(h), b: Math.sqrt(d * d - c * c * Math.cos(h) ** 2) };
}
// açıyı bir öncekine en yakın sürekli değere taşı
const sur = (x, onceki) => { if (onceki == null) return x; while (x - onceki > PI) x -= 2 * PI; while (x - onceki < -PI) x += 2 * PI; return x; };

export function dortHesap(g0) {
  const g = dortSanitize(g0), { a, b, c, d } = g;
  if (!(a > 0 && b > 0 && c > 0 && d > 0)) return { g, hata: 'Bütün çubuk boyları sıfırdan büyük olmalı' };
  const sn = sinif(a, b, c, d);
  if (!sn.tam) return { g, sinif: sn, hata: `${sn.ad}. Krankın tam dönebilmesi için: sabit + krank ≤ biyel + sarkaç ve |sabit − krank| ≥ |biyel − sarkaç| olmalı (şu an ${tf(d + a, 1)} / ${tf(b + c, 1)} ve ${tf(Math.abs(d - a), 1)} / ${tf(Math.abs(b - c), 1)}).` };
  const w = 2 * PI * g.n / 60, sg = g.yon === 'cw' ? -1 : 1, N = 720, rows = [];
  let t4p = null, muMin = PI, muMax = 0, w4Max = 0, a4Max = 0, Tmax = 0, Tsum = 0, Pmax = 0, vPMax = 0, Pp = null;
  for (let i = 0; i < N; i++) {
    const t = i * 2 * PI / N, th2 = sg * t, k = konum(th2, g), hv = hizIvme(th2, k, g);
    const th4 = sur(k.th4, t4p); t4p = th4;
    const w4 = hv.w4 * sg * w, a4 = hv.a4 * w * w, w3 = hv.w3 * sg * w;
    const Tl = g.J * a4 + (Math.abs(w4) > 1e-12 ? g.M * Math.sign(w4) : 0), T = Tl * w4 / w;
    if (Pp) vPMax = Math.max(vPMax, Math.hypot(k.P[0] - Pp[0], k.P[1] - Pp[1]) / (2 * PI / N / w) / 1000);
    Pp = k.P;
    muMin = Math.min(muMin, k.mu); muMax = Math.max(muMax, k.mu); w4Max = Math.max(w4Max, Math.abs(w4)); a4Max = Math.max(a4Max, Math.abs(a4));
    Tmax = Math.max(Tmax, Math.abs(T)); Tsum += T; Pmax = Math.max(Pmax, T * w);
    rows.push({ deg: t * 180 / PI, th4: th4 * 180 / PI, th3: k.th3 * 180 / PI, w4, w3, a4, mu: k.mu * 180 / PI, T, Px: k.P[0], Py: k.P[1], A: k.A, B: k.B, P: k.P });
  }
  { const k = konum(0, g); vPMax = Math.max(vPMax, Math.hypot(k.P[0] - Pp[0], k.P[1] - Pp[1]) / (2 * PI / N / w) / 1000); }
  // sarkaç uç konumları ve zaman oranı (krank–sarkaçta)
  const ths = rows.map((q) => q.th4);
  let iMx = 0, iMn = 0; ths.forEach((v, i) => { if (v > ths[iMx]) iMx = i; if (v < ths[iMn]) iMn = i; });
  const salinim = sn.ciftKrank ? 360 : ths[iMx] - ths[iMn];
  const git = ((iMx - iMn + N) % N) * 360 / N, don = 360 - git, oran = sn.ciftKrank ? 1 : Math.max(git, don) / Math.min(git, don);
  const Tort = Tsum / N, Port = Tort * w;
  const K = [], ok = (bb, duzey, metin) => K.push({ ok: bb, duzey, metin });
  ok(!sn.esit, 'hata', sn.esit ? 'Değişim noktalı mekanizma: çubuklar bir anda üst üste gelir ve hareket iki yola ayrılabilir. Bir çubuğu biraz kısalt ya da uzat.' : `Tür: ${sn.ad}.`);
  const mn = muMin * 180 / PI, mx = muMax * 180 / PI, sap = Math.max(90 - mn, mx - 90);
  ok(sap <= 50, sap > 60 ? 'hata' : 'uyari', sap <= 50 ? `Geçiş açısı ${tf(mn, 1)}° ile ${tf(mx, 1)}° arasında — iyi (40°–140° önerilir).` : `Geçiş açısı ${tf(mn, 1)}° ile ${tf(mx, 1)}° arasında: biyel sarkacı çok yatık iter, mafsallara büyük yük biner ve hareket takılabilir. 40°–140° arası önerilir; sabit mesafeyi ya da biyeli değiştir.`);
  if (!sn.ciftKrank) ok(true, 'bilgi', `Sarkaç ${tf(salinim, 1)}° salınır; gidiş krankın ${tf(git, 1)}°'sinde, dönüş ${tf(don, 1)}°'sinde (zaman oranı ${tf(oran, 3)}).`);
  else ok(true, 'bilgi', `Sarkaç da tam döner; hızı krankın ${tf(w4Max / w, 2)} katına kadar çıkar.`);
  if (g.J > 0 || g.M > 0) ok(true, 'bilgi', `Krank torku en çok ${tf(Tmax, 2)} N·m; ortalama güç ${tf(Port, 1)} W, anlık en çok ${tf(Pmax, 1)} W (sürtünme yok; motor seçiminde pay bırak).`);
  else ok(true, 'bilgi', 'Sarkaç ataleti ve yük torku girilmedi: tork hesaplanmadı.');
  const res = { g, sinif: sn, w, rows, muMin: mn, muMax: mx, salinim, git, don, oran, th4Min: ths[iMn], th4Max: ths[iMx], degMin: rows[iMn].deg, degMax: rows[iMx].deg, w4Max, a4Max, vPMax, Tmax, Tort, Port, Pmax, kontroller: K };
  res.uygun = K.every((q) => q.ok || q.duzey !== 'hata');
  return res;
}
export function dortCSV(r) {
  const L = ['krank_derece;sarkac_derece;sarkac_hizi_rad_s;sarkac_ivmesi_rad_s2;gecis_acisi_derece;krank_torku_Nm;nokta_x_mm;nokta_y_mm'];
  for (let i = 0; i < r.rows.length; i += 2) { const q = r.rows[i]; L.push([q.deg, q.th4, q.w4, q.a4, q.mu, q.T, q.Px, q.Py].map((v) => (Math.round(v * 1000) / 1000).toString().replace('.', ',')).join(';')); }
  return '﻿' + L.join('\r\n') + '\r\n';
}
export function dortRapor(r, ad = '') {
  const g = r.g, L = ['ÇİZİM ATÖLYESİ — DÖRT ÇUBUK MEKANİZMASI RAPORU', ad, ''];
  L.push('GİRDİLER', `  Krank a = ${g.a} mm · biyel b = ${g.b} mm · sarkaç c = ${g.c} mm · sabit d = ${g.d} mm · ${g.montaj === 'capraz' ? 'çapraz' : 'açık'} montaj`,
    `  Biyel noktası: A'dan ${g.p} mm, biyele göre ${g.q}° · ${g.n} d/dk (${g.yon === 'cw' ? 'saat yönü' : 'saat yönünün tersi'}) · sarkaç ataleti ${g.J} kg·m² · yük torku ${g.M} N·m`,
    '', 'SONUÇLAR', `  Tür: ${r.sinif.ad} · geçiş açısı ${r.muMin.toFixed(2)}° – ${r.muMax.toFixed(2)}°`);
  if (!r.sinif.ciftKrank) L.push(`  Sarkaç salınımı ${r.salinim.toFixed(3)}° (uçlar krank ${r.degMin.toFixed(1)}° ve ${r.degMax.toFixed(1)}°) · gidiş ${r.git.toFixed(1)}° / dönüş ${r.don.toFixed(1)}° · zaman oranı ${r.oran.toFixed(3)}`);
  L.push(`  Sarkaç hızı en çok ${r.w4Max.toFixed(3)} rad/s · ivmesi en çok ${r.a4Max.toFixed(2)} rad/s² · biyel noktası hızı en çok ${r.vPMax.toFixed(3)} m/s`);
  if (g.J > 0 || g.M > 0) L.push(`  Krank torku en çok ${r.Tmax.toFixed(3)} N·m · ortalama güç ${r.Port.toFixed(2)} W · anlık güç en çok ${r.Pmax.toFixed(2)} W`);
  L.push('', 'KONTROLLER', ...r.kontroller.map((c) => '  ' + (c.ok ? (c.duzey === 'bilgi' ? 'ℹ ' : '✓ ') : c.duzey === 'hata' ? '✗ ' : '⚠ ') + c.metin),
    '', 'YÖNTEM', '  Dört çubuk kapalı konum, hız ve ivme formülleri (Norton, Design of Machinery, bölüm 4, 6, 7); 0,5° adım.',
    '  Biyel ve krank kütlesi, sürtünme, esneme ve boşluklar yok sayılır. Ön tasarımdır; yetkin mühendis onayı önerilir.');
  return L;
}
