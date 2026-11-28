// Mekatronik Mühendisliği — kayış–kasnak güç aktarımı (V kayışı ve triger kayışı). Saf hesap (tests/meka-kasnak.test.mjs).
//
// Açık kayış geometrisi: γ = asin((d₂ − d₁)/(2a)), küçük kasnakta sarım β₁ = π − 2γ,
//   kayış boyu L = 2a·cos γ + (π/2)(d₁ + d₂) + γ(d₂ − d₁). Verilen boydan eksen mesafesi bu bağıntının sayısal tersidir.
// Triger: d = p·z/π (bölüm çapı), boy hatvenin tam katı olmalı; küçük kasnakta kavrayan diş z₁·β₁/(2π).
// V kayışı: Euler–Eytelwein F₁/F₂ = e^(μ'β₁), kama etkisiyle μ' = μ / sin(φ/2) (φ = 38° kanal, μ = 0,25 kauçuk–döküm).
//   Kayış sayısı z = P·K_A / (P_k·c_β), c_β ≈ 1,25·(1 − 5^(−β₁/π)) (sarım açısı katsayısı); P_k bir kayışın katalog gücü.
// Triger: gevşek taraf kuvveti çevre kuvvetinin %20'si alınır (yaklaşık; ön gerilmeyi kayış üreticisinden al).
// Mile gelen yük F_w = √(F₁² + F₂² − 2F₁F₂·cos β₁)  (iki kol arasındaki açı π − β₁; β₁ = 180°'de F₁ + F₂).
const PI = Math.PI;
const tf = (v, d) => v.toFixed(d).replace('.', ',');
const num = (v, d) => (Number.isFinite(+v) ? +v : d);
export const SERVIS = [[1, 'Düzgün (konveyör, fan)'], [1.2, 'Hafif darbeli (ambalaj makinesi, karıştırıcı)'], [1.4, 'Orta darbeli (pres, kırıcı olmayan)'], [1.6, 'Ağır darbeli']];
export const KASNAK_DEFAULTS = { tip: 'v', d1: 100, d2: 200, p: 5, z1: 20, z2: 40, a: 400, L: 0, P: 1.5, n1: 1400, KA: 1.2, Pk: 1.2, mu: 0.25 };
// "Konveyör tahriki" şablonu (temsilî): 1,5 kW motor, V kayışı, 1:2
export const KASNAK_ORNEK = () => ({ ...KASNAK_DEFAULTS, tip: 'v', d1: 100, d2: 200, a: 400, L: 1120, P: 1.5, n1: 1400, KA: 1.2, Pk: 1.2 });
export function kasnakSanitize(o) {
  const x = o && typeof o === 'object' ? o : {}, D = KASNAK_DEFAULTS, out = {};
  for (const k of Object.keys(D)) out[k] = typeof D[k] === 'number' ? num(x[k], D[k]) : (typeof x[k] === 'string' ? x[k] : D[k]);
  if (out.tip !== 'triger') out.tip = 'v';
  return out;
}
export const boy = (a, d1, d2) => { const g = Math.asin((d2 - d1) / (2 * a)); return 2 * a * Math.cos(g) + PI / 2 * (d1 + d2) + g * (d2 - d1); };
// verilen boydan eksen mesafesi (boy, a ile tekdüze artar)
export function eksen(L, d1, d2) {
  let lo = Math.abs(d2 - d1) / 2 + 1e-9, hi = L;
  if (boy(lo, d1, d2) > L) return null;
  for (let i = 0; i < 100; i++) { const m = (lo + hi) / 2; if (boy(m, d1, d2) < L) lo = m; else hi = m; }
  return (lo + hi) / 2;
}
export const cBeta = (b) => 1.25 * (1 - Math.pow(5, -b / PI));

export function kasnakHesap(g0) {
  const g = kasnakSanitize(g0), tr = g.tip === 'triger';
  if (!(g.P > 0 && g.n1 > 0)) return { g, hata: 'Güç ve devir sıfırdan büyük olmalı' };
  if (tr && !(g.p > 0 && g.z1 >= 6 && g.z2 >= 6)) return { g, hata: 'Hatve ve diş sayılarını gir (en az 6 diş)' };
  let d1 = tr ? g.p * g.z1 / PI : g.d1, d2 = tr ? g.p * g.z2 / PI : g.d2, ters = false;
  if (!(d1 > 0 && d2 > 0)) return { g, hata: 'Kasnak çaplarını gir' };
  const i = d2 / d1;
  if (d2 < d1) { [d1, d2] = [d2, d1]; ters = true; }   // geometride küçük kasnak d1
  // eksen mesafesi: boy girildiyse (trigerde hatvenin katına yuvarlanır) boydan, yoksa girilen eksenden
  let a = g.a, L, dis = null;
  if (g.L > 0) {
    L = g.L; if (tr) { dis = Math.round(L / g.p); L = dis * g.p; }
    a = eksen(L, d1, d2); if (a == null) return { g, hata: 'Bu kayış boyu kasnaklara yetmiyor' };
  } else {
    if (!(a > (d1 + d2) / 2)) return { g, hata: 'Eksen mesafesi kasnakların yarıçapları toplamından büyük olmalı' };
    L = boy(a, d1, d2); if (tr) dis = L / g.p;
  }
  const gam = Math.asin((d2 - d1) / (2 * a)), b1 = PI - 2 * gam, v = PI * (tr ? g.p * g.z1 / PI : g.d1) * g.n1 / 60000;
  const Ft = g.P * 1000 * g.KA / v, n2 = g.n1 / i, T1 = g.P * 1000 / (2 * PI * g.n1 / 60), T2 = T1 * i;
  let F1, F2, zk = null, adet = null, cb = null, mup = null;
  if (tr) { F2 = 0.2 * Ft; F1 = Ft + F2; zk = (ters ? g.z2 : g.z1) * b1 / (2 * PI); }
  else { mup = g.mu / Math.sin(19 * PI / 180); const e = Math.exp(mup * b1); F1 = Ft * e / (e - 1); F2 = Ft / (e - 1); cb = cBeta(b1); if (g.Pk > 0) adet = g.P * g.KA / (g.Pk * cb); }
  const Fw = Math.sqrt(F1 * F1 + F2 * F2 - 2 * F1 * F2 * Math.cos(b1));
  const K = [], ok = (bb, duzey, metin) => K.push({ ok: bb, duzey, metin }), bd = b1 * 180 / PI;
  if (tr) ok(zk >= 6, zk < 4 ? 'hata' : 'uyari', zk >= 6 ? `Küçük kasnakta ${tf(zk, 1)} diş kavrıyor — yeterli (en az 6).` : `Küçük kasnakta yalnız ${tf(zk, 1)} diş kavrıyor (en az 6 önerilir): kayış diş atlar. Eksen mesafesini artır ya da küçük kasnağı büyüt.`);
  else ok(bd >= 120, bd < 90 ? 'hata' : 'uyari', bd >= 120 ? `Küçük kasnakta sarım açısı ${tf(bd, 1)}° — iyi (en az 120°).` : `Küçük kasnakta sarım açısı ${tf(bd, 1)}° (en az 120° önerilir): kayış kayar. Eksen mesafesini artır ya da gergi makarası koy.`);
  const vmax = tr ? 40 : 30;
  ok(v <= vmax, 'uyari', v <= vmax ? `Kayış hızı ${tf(v, 1)} m/s.` : `Kayış hızı ${tf(v, 1)} m/s yüksek (en çok ${vmax} m/s): kayış ısınır, merkezkaç kuvveti kavramayı azaltır.`);
  if (!tr) { const amin = 0.7 * (d1 + d2), amax = 2 * (d1 + d2); ok(a >= amin && a <= amax, 'uyari', a >= amin && a <= amax ? `Eksen mesafesi ${tf(a, 1)} mm uygun aralıkta (${tf(amin, 0)}–${tf(amax, 0)} mm).` : `Eksen mesafesi ${tf(a, 1)} mm, önerilen ${tf(amin, 0)}–${tf(amax, 0)} mm aralığının ${a < amin ? 'altında: sarım açısı küçülür' : 'üstünde: kayış çırpar'}.`); }
  if (tr && g.L > 0 && Math.abs(g.L - L) > 1e-9) ok(true, 'bilgi', `Boy hatvenin katına yuvarlandı: ${dis} diş = ${tf(L, 1)} mm.`);
  if (!tr && adet != null) ok(true, 'bilgi', `Gereken kayış sayısı ${tf(adet, 2)} → ${Math.ceil(adet - 1e-9)} adet (sarım katsayısı ${tf(cb, 3)}; katalogdaki boy katsayısını ayrıca uygula).`);
  ok(true, 'bilgi', `Mile gelen yük yaklaşık ${tf(Fw, 0)} N: rulman ve mil hesabında bu kuvveti kullan.`);
  const res = { g, d1: tr ? g.p * g.z1 / PI : g.d1, d2: tr ? g.p * g.z2 / PI : g.d2, i, n2, T1, T2, a, L, dis, beta: bd, v, Ft, F1, F2, Fw, zk, adet, cb, mup, kontroller: K };
  res.uygun = K.every((q) => q.ok || q.duzey !== 'hata');
  return res;
}
export function kasnakRapor(r, ad = '') {
  const g = r.g, f = (v, d = 2) => v.toFixed(d), tr = g.tip === 'triger', L = ['ÇİZİM ATÖLYESİ — KAYIŞ–KASNAK HESAP RAPORU', ad, ''];
  L.push('GİRDİLER', tr ? `  Triger kayışı · hatve ${g.p} mm · z₁ ${g.z1} · z₂ ${g.z2}` : `  V kayışı · d₁ ${g.d1} mm · d₂ ${g.d2} mm · sürtünme ${g.mu} · bir kayışın gücü ${g.Pk} kW`,
    `  Güç ${g.P} kW · ${g.n1} d/dk · servis katsayısı ${g.KA} · ${g.L > 0 ? `kayış boyu ${g.L} mm` : `eksen mesafesi ${g.a} mm`}`,
    '', 'SONUÇLAR', `  Bölüm çapları ${f(r.d1)} / ${f(r.d2)} mm · oran ${f(r.i, 3)} · çıkış ${f(r.n2, 1)} d/dk, ${f(r.T2, 2)} N·m (giriş ${f(r.T1, 2)} N·m)`,
    `  Eksen mesafesi ${f(r.a)} mm · kayış boyu ${f(r.L)} mm${r.dis != null ? ` (${f(r.dis, 1)} diş)` : ''} · sarım açısı ${f(r.beta, 1)}° · kayış hızı ${f(r.v)} m/s`,
    `  Çevre kuvveti ${f(r.Ft, 1)} N · gergin taraf ${f(r.F1, 1)} N · gevşek taraf ${f(r.F2, 1)} N · mile gelen yük ${f(r.Fw, 1)} N`,
    '', 'KONTROLLER', ...r.kontroller.map((c) => '  ' + (c.ok ? (c.duzey === 'bilgi' ? 'ℹ ' : '✓ ') : c.duzey === 'hata' ? '✗ ' : '⚠ ') + c.metin),
    '', 'YÖNTEM', '  Açık kayış geometrisi; V kayışında Euler–Eytelwein (38° kanal, kama etkisi), sarım katsayısı c_β ≈ 1,25(1 − 5^(−β/π)).',
    '  Triger kayışında gevşek taraf çevre kuvvetinin %20\'si alınmıştır. Kayış gücü, boy katsayısı ve ön gerilme kayış üreticisinin kataloğundan alınmalıdır.');
  return L;
}
