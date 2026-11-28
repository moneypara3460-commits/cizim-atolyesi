// Mekatronik Mühendisliği — krank–biyel (kol–sürgü) mekanizması. Saf hesap; DOM gerektirmez (tests/meka-krank.test.mjs).
//
// Krank (yarıçap r) sabit ω ile döner; biyel (boy l) sürgüyü (piston, itici, pres koçu) kaçıklık e olan doğru boyunca iter.
// Krank açısı θ (+x'ten, saat yönünün tersi); sürgü konumu x = r cos θ + √(l² − (r sin θ − e)²).
//   x′ = −r sin θ − s·r cos θ / q,   s = r sin θ − e,  q = √(l² − s²)
//   x″ = −r cos θ − (r² cos²θ / q − s r sin θ / q + s² r² cos²θ / q³)        (v = x′ω, a = x″ω²)
// Strok H = √((l + r)² − e²) − √((l − r)² − e²); ölü noktalar: θ_ön = asin(e/(l + r)), θ_arka = π + asin(e/(l − r)).
// Kaçıklıkta ileri / geri süreleri farklı olur (çabuk dönüş): oran (π + δ)/(π − δ), δ = asin(e/(l−r)) − asin(e/(l+r)).
// Kuvvet: sürgüye etkiyen F (dış yük) + m·a (eylemsizlik); biyel açısı φ = asin(s / l): biyel kuvveti F/cos φ, kızağa yan
// kuvvet F·tan φ; krank torku T = F·v / ω (güç dengesi, sürtünme yok). Norton, Design of Machinery, bölüm 13.
const PI = Math.PI;
const tf = (v, d) => v.toFixed(d).replace('.', ',');
const num = (v, d) => (Number.isFinite(+v) ? +v : d);
export const KRANK_DEFAULTS = { r: 40, l: 160, e: 0, n: 60, m: 0, F: 0, yuk: 'ileri', yon: 'ccw' };
// "Kutu itici" şablonu (temsilî): 80 mm strok, dakikada 60 itme, ileri strokta 150 N direnç
export const KRANK_ORNEK = () => ({ ...KRANK_DEFAULTS, r: 40, l: 170, e: 0, n: 60, m: 3, F: 150, yuk: 'ileri' });

export function krankSanitize(o) {
  const x = o && typeof o === 'object' ? o : {}, D = KRANK_DEFAULTS, out = {};
  for (const k of Object.keys(D)) out[k] = typeof D[k] === 'number' ? num(x[k], D[k]) : (typeof x[k] === 'string' ? x[k] : D[k]);
  if (!['ileri', 'geri', 'hep'].includes(out.yuk)) out.yuk = 'ileri';
  if (out.yon !== 'cw') out.yon = 'ccw';
  return out;
}
export function konum(th, r, l, e) {
  const s = r * Math.sin(th) - e, q = Math.sqrt(l * l - s * s), c = Math.cos(th), sn = Math.sin(th);
  const x = r * c + q, x1 = -r * sn - s * r * c / q, x2 = -r * c - (r * r * c * c / q - s * r * sn / q + s * s * r * r * c * c / (q * q * q));
  return { x, x1, x2, phi: Math.asin(s / l) };
}
export const strok = (r, l, e) => Math.sqrt((l + r) ** 2 - e * e) - Math.sqrt((l - r) ** 2 - e * e);
// istenen strok için krank yarıçapı (l, e sabit; ikiye bölme)
export function stroktanR(H, l, e) {
  let lo = 0, hi = l - Math.abs(e) - 1e-9;
  if (!(H > 0) || strok(hi, l, e) < H) return null;
  for (let i = 0; i < 80; i++) { const m = (lo + hi) / 2; if (strok(m, l, e) < H) lo = m; else hi = m; }
  return (lo + hi) / 2;
}

export function krankHesap(g0) {
  const g = krankSanitize(g0), { r, l, e } = g;
  if (!(r > 0 && l > 0)) return { g, hata: 'Krank yarıçapı ve biyel boyu sıfırdan büyük olmalı' };
  if (!(l > r + Math.abs(e))) return { g, hata: `Biyel çok kısa: biyel boyu, krank yarıçapı + kaçıklıktan (${(r + Math.abs(e)).toFixed(1)} mm) büyük olmalı; yoksa mekanizma takılır.` };
  const w = 2 * PI * g.n / 60, sg = g.yon === 'cw' ? -1 : 1, N = 720;
  const H = strok(r, l, e), thOn = Math.asin(e / (l + r)), thArka = PI + Math.asin(e / (l - r)), delta = Math.asin(e / (l - r)) - Math.asin(e / (l + r));
  const xOn = Math.sqrt((l + r) ** 2 - e * e), xArka = Math.sqrt((l - r) ** 2 - e * e);
  const rows = [];
  let vMax = 0, aMax = 0, aMin = 0, phiMax = 0, Tmax = 0, Tsum = 0, Pmax = 0, Fbiy = 0, Fyan = 0;
  for (let i = 0; i < N; i++) {
    const t = i * 2 * PI / N, th = sg * t, k = konum(th, r, l, e);
    const v = k.x1 * sg * w / 1000, a = k.x2 * w * w / 1000;   // m/s, m/s²
    // krankın biyel üstünden sürgüye uygulaması gereken kuvvet (+x yönünde): eylemsizlik m·a + harekete ters direnç
    const yon = v > 1e-12 ? 1 : v < -1e-12 ? -1 : 0, aktif = g.yuk === 'hep' || (g.yuk === 'ileri' && yon > 0) || (g.yuk === 'geri' && yon < 0);
    const Fx = g.m * a + (aktif ? g.F * yon : 0);
    const T = Fx * v / w;                                         // N·m: gereken krank torku (güç dengesi Fx·v = T·ω)
    const Fr = Math.abs(Fx) / Math.cos(k.phi), Fy = Math.abs(Fx * Math.tan(k.phi));
    vMax = Math.max(vMax, Math.abs(v)); aMax = Math.max(aMax, a); aMin = Math.min(aMin, a); phiMax = Math.max(phiMax, Math.abs(k.phi));
    Tmax = Math.max(Tmax, Math.abs(T)); Tsum += T; Pmax = Math.max(Pmax, T * w); Fbiy = Math.max(Fbiy, Fr); Fyan = Math.max(Fyan, Fy);
    rows.push({ deg: t * 180 / PI, x: k.x, xs: k.x - xArka, v, a, phi: k.phi * 180 / PI, T, Fr, Fy });
  }
  const Tort = Tsum / N, Port = Tort * w;
  const K = [], ok = (b, duzey, metin) => K.push({ ok: b, duzey, metin });
  const lr = l / r;
  ok(lr >= 3.5, lr < 2.5 ? 'hata' : 'uyari', lr >= 3.5 ? `Biyel / krank oranı ${tf(lr, 2)} — iyi (3,5 ve üstü önerilir).` : `Biyel / krank oranı ${tf(lr, 2)}: biyel kısa, sürgü kızağa çok yan yük bindirir ve hareket düzgünsüzleşir. Biyeli uzat (en az 3,5 × krank yarıçapı önerilir).`);
  const pd = phiMax * 180 / PI;
  ok(pd <= 17, pd > 25 ? 'hata' : 'uyari', pd <= 17 ? `En büyük biyel açısı ${tf(pd, 1)}° — yan yük makul.` : `En büyük biyel açısı ${tf(pd, 1)}°: kızağa yan kuvvet yüksek (en çok ${tf(Fyan, 0)} N). Biyeli uzat ya da kaçıklığı azalt.`);
  if (Math.abs(e) > 1e-9) ok(true, 'bilgi', `Kaçıklık var: ileri ve geri süreleri farklı (çabuk dönüş oranı ${tf((PI + Math.abs(delta)) / (PI - Math.abs(delta)), 3)}).`);
  if (g.m > 0 || g.F > 0) ok(true, 'bilgi', `Krank torku en çok ${tf(Tmax, 2)} N·m; ortalama güç ${tf(Port, 1)} W, anlık en çok ${tf(Pmax, 1)} W (sürtünme yok; motor seçiminde pay bırak).`);
  else ok(true, 'bilgi', 'Sürgü kütlesi ve dış kuvvet girilmedi: tork ve kuvvetler hesaplanmadı.');
  const res = { g, H, thOn, thArka, xOn, xArka, delta, w, rows, vMax, aMax, aMin, phiMax: pd, Tmax, Tort, Port, Pmax, Fbiy, Fyan, lr, kontroller: K };
  res.uygun = K.every((c) => c.ok || c.duzey !== 'hata');
  res.cabuk = Math.abs(e) > 1e-9 ? (PI + Math.abs(delta)) / (PI - Math.abs(delta)) : 1;
  return res;
}
export function krankCSV(r) {
  const L = ['krank_derece;surgu_konumu_mm;hiz_m_s;ivme_m_s2;biyel_acisi_derece;krank_torku_Nm;biyel_kuvveti_N;yan_kuvvet_N'];
  for (let i = 0; i < r.rows.length; i += 2) { const q = r.rows[i]; L.push([q.deg, q.xs, q.v, q.a, q.phi, q.T, q.Fr, q.Fy].map((v) => (Math.round(v * 1000) / 1000).toString().replace('.', ',')).join(';')); }
  return '﻿' + L.join('\r\n') + '\r\n';
}
export function krankRapor(r, ad = '') {
  const g = r.g, L = ['ÇİZİM ATÖLYESİ — KRANK–BİYEL MEKANİZMASI RAPORU', ad, ''];
  L.push('GİRDİLER', `  Krank yarıçapı r = ${g.r} mm · biyel boyu l = ${g.l} mm · kaçıklık e = ${g.e} mm · ${g.n} d/dk (${g.yon === 'cw' ? 'saat yönü' : 'saat yönünün tersi'})`,
    `  Sürgü kütlesi ${g.m} kg · dış kuvvet ${g.F} N (${g.yuk === 'ileri' ? 'yalnız ileri strokta' : g.yuk === 'geri' ? 'yalnız geri strokta' : 'iki yönde'}, harekete ters)`,
    '', 'SONUÇLAR', `  Strok ${r.H.toFixed(3)} mm · ön ölü nokta ${(r.thOn * 180 / PI).toFixed(2)}° · arka ölü nokta ${(r.thArka * 180 / PI).toFixed(2)}°` + (r.cabuk !== 1 ? ` · çabuk dönüş oranı ${r.cabuk.toFixed(3)}` : ''),
    `  En yüksek hız ${r.vMax.toFixed(3)} m/s · ivme +${r.aMax.toFixed(2)} / ${r.aMin.toFixed(2)} m/s² · en büyük biyel açısı ${r.phiMax.toFixed(2)}° · l/r ${r.lr.toFixed(2)}`);
  if (g.m > 0 || g.F > 0) L.push(`  Krank torku en çok ${r.Tmax.toFixed(3)} N·m · ortalama güç ${r.Port.toFixed(2)} W · biyel kuvveti en çok ${r.Fbiy.toFixed(1)} N · kızak yan kuvveti en çok ${r.Fyan.toFixed(1)} N`);
  L.push('', 'KONTROLLER', ...r.kontroller.map((c) => '  ' + (c.ok ? (c.duzey === 'bilgi' ? 'ℹ ' : '✓ ') : c.duzey === 'hata' ? '✗ ' : '⚠ ') + c.metin),
    '', 'YÖNTEM', '  Kaçıklıklı krank–biyel kapalı formülleri (Norton, Design of Machinery, bölüm 13); 0,5° adım. Biyel kütlesi, sürtünme,',
    '  esneme ve boşluklar yok sayılır. Ön tasarımdır: pres gibi büyük kuvvetli uygulamalarda yetkin mühendis onayı gerekir.');
  return L;
}
