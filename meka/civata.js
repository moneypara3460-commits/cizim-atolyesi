// Mekatronik Mühendisliği — cıvata bağlantısı (metrik kaba diş, VDI 2230'un sadeleştirilmiş biçimi). Saf hesap (tests/meka-civata.test.mjs).
//
// Diş: d₂ = d − 0,6495·P, d₃ = d − 1,2269·P, gerilme kesiti A_s = π/4·((d₂ + d₃)/2)², d₀ = (d₂ + d₃)/2.
// İzin verilen montaj ön gerilmesi (akmanın ν = %90'ı, burulma dahil; VDI 2230 denklem 141):
//   F_Mzul = A₀·ν·R_p0,2 / √(1 + 3·[(3/2)·(d₂/d₀)·(P/(π d₂) + 1,155·μ_G)]²)
// Sıkma torku M_A = F_M·(0,16·P + 0,58·d₂·μ_G + μ_K·D_Km/2),  D_Km = (d_w + d_h)/2 (altıgen baş oturma çapı ve orta seri delik).
// Sıkma yöntemi dağılımı α_A: en düşük ön gerilme F_Mmin = F_Mzul/α_A. Oturma kaybı %10 alınır.
// Yük oranı Φ = 0,2 (yaklaşık; esneklikler hesaplanmaz): kalan sıkma F_KR = 0,9·F_Mmin − (1 − Φ)·F_A,
//   en büyük cıvata kuvveti F_Smax = F_Mzul + Φ·F_A. Kayma için gereken sıkma F_KQ = F_Q / (μ_T·q).
// Çalışmada eşdeğer gerilme (burulmanın yarısı kalır): σ_red = √(σ² + 3·(0,5·τ)²) ≤ R_p0,2.
const PI = Math.PI;
const tf = (v, d) => v.toFixed(d).replace('.', ',');
const num = (v, d) => (Number.isFinite(+v) ? +v : d);
// [ad, d, hatve P, altıgen baş oturma çapı d_w (ISO 4014/4017 en küçük), orta seri delik d_h (ISO 273)]
export const DISLER = [['M4', 4, 0.7, 5.88, 4.5], ['M5', 5, 0.8, 6.88, 5.5], ['M6', 6, 1, 8.88, 6.6], ['M8', 8, 1.25, 11.63, 9], ['M10', 10, 1.5, 14.63, 11], ['M12', 12, 1.75, 16.63, 13.5], ['M14', 14, 2, 19.64, 15.5], ['M16', 16, 2, 22.49, 17.5], ['M20', 20, 2.5, 28.19, 22], ['M24', 24, 3, 33.61, 26]];
export const SINIF = { '8.8': (d) => (d <= 16 ? 640 : 660), '10.9': () => 940, '12.9': () => 1100 };
export const YONTEM = [[1.6, 'Tork anahtarı (ayarlı)'], [1.8, 'Darbeli / ayarlı tabanca'], [2.5, 'Elle, anahtarla (tork ölçülmeden)']];
export const SURTUNME = [[0.1, 'Yağlı / MoS₂ (0,10)'], [0.14, 'Hafif yağlı, galvaniz (0,14)'], [0.2, 'Kuru / paslanmaz (0,20)']];
export const CIVATA_DEFAULTS = { boyut: 'M8', sinif: '8.8', mu: 0.14, aA: 1.6, FA: 0, FQ: 1000, muT: 0.15, q: 1, adet: 4 };
// "Motor konsolu bağlantısı" şablonu (temsilî): 4 cıvata, toplam 6 kN kesme, 2 kN çekme
export const CIVATA_ORNEK = () => ({ ...CIVATA_DEFAULTS, boyut: 'M10', sinif: '8.8', mu: 0.14, aA: 1.6, FA: 2000, FQ: 6000, muT: 0.15, q: 1, adet: 4 });
export function civataSanitize(o) {
  const x = o && typeof o === 'object' ? o : {}, D = CIVATA_DEFAULTS, out = {};
  for (const k of Object.keys(D)) out[k] = typeof D[k] === 'number' ? num(x[k], D[k]) : (typeof x[k] === 'string' ? x[k] : D[k]);
  if (!DISLER.some((r) => r[0] === out.boyut)) out.boyut = 'M8';
  if (!(out.sinif in SINIF)) out.sinif = '8.8';
  out.adet = Math.max(1, Math.round(out.adet)); out.q = Math.max(1, Math.round(out.q));
  return out;
}
export function dis(boyut) {
  const r = DISLER.find((x) => x[0] === boyut); if (!r) return null;
  const [, d, P, dw, dh] = r, d2 = d - 0.6495 * P, d3 = d - 1.2269 * P, d0 = (d2 + d3) / 2;
  return { d, P, dw, dh, d2, d3, d0, As: PI / 4 * d0 * d0, DKm: (dw + dh) / 2 };
}
export function onGerilme(t, Rp, mu, nu = 0.9) {
  const k = 1.5 * (t.d2 / t.d0) * (t.P / (PI * t.d2) + 1.155 * mu);
  return t.As * nu * Rp / Math.sqrt(1 + 3 * k * k);
}
export const tork = (t, FM, mu) => FM * (0.16 * t.P + 0.58 * t.d2 * mu + mu * t.DKm / 2) / 1000;  // N·m

function hesapla(g, boyut) {
  const t = dis(boyut), Rp = SINIF[g.sinif](t.d), FA = g.FA / g.adet, FQ = g.FQ / g.adet, PHI = 0.2;
  const FMzul = onGerilme(t, Rp, g.mu), MA = tork(t, FMzul, g.mu), FMmin = FMzul / g.aA, FKR = 0.9 * FMmin - (1 - PHI) * FA;
  const FKQ = FQ > 0 ? FQ / (g.muT * g.q) : 0, FSmax = FMzul + PHI * FA;
  const MG = FMzul * (0.16 * t.P + 0.58 * t.d2 * g.mu), tau = 16 * MG / (PI * t.d0 ** 3), sig = FSmax / t.As, sred = Math.sqrt(sig * sig + 3 * (0.5 * tau) ** 2);
  return { t, Rp, FA, FQ, FMzul, MA, FMmin, FKR, FKQ, FSmax, sig, tau, sred, Skay: FKQ > 0 ? FKR / FKQ : Infinity, Sak: Rp / sred };
}
const yeter = (h) => h.FKR > 0 && h.FKR >= h.FKQ && h.sred <= h.Rp;
// aynı sınıf ve adetle yeten en küçük boyut
export function boyutOner(g0) { const g = civataSanitize(g0); for (const r of DISLER) if (yeter(hesapla(g, r[0]))) return r[0]; return null; }

export function civataHesap(g0) {
  const g = civataSanitize(g0);
  if (!(g.mu > 0 && g.aA >= 1 && g.muT > 0)) return { g, hata: 'Sürtünme katsayıları ve sıkma dağılımı geçerli olmalı' };
  if (!(g.FA >= 0 && g.FQ >= 0)) return { g, hata: 'Yükler negatif olamaz' };
  const h = hesapla(g, g.boyut), K = [], ok = (bb, duzey, metin) => K.push({ ok: bb, duzey, metin });
  ok(true, 'bilgi', `Sıkma torku ${tf(h.MA, 1)} N·m (tork anahtarını buna ayarla) → ön gerilme en çok ${tf(h.FMzul / 1000, 2)} kN, saçılmayla en az ${tf(h.FMmin / 1000, 2)} kN.`);
  ok(h.FKR > 0, 'hata', h.FKR > 0 ? `Çekme yükünden sonra kalan sıkma kuvveti ${tf(h.FKR / 1000, 2)} kN — parçalar ayrılmaz.` : `Çekme yükü (${tf(h.FA / 1000, 2)} kN / cıvata) sıkmayı yeniyor: parçalar arasında açılma olur, cıvata gevşer ve yorulur. Daha büyük ya da daha çok cıvata kullan.`);
  if (h.FQ > 0) ok(h.FKR >= h.FKQ, 'hata', h.FKR >= h.FKQ ? `Kaymaya karşı emniyet ${tf(h.Skay, 2)}: yan yük sürtünmeyle taşınıyor (cıvata kesmeye çalışmaz).` : `Yan yük için gereken sıkma ${tf(h.FKQ / 1000, 2)} kN, kalan ${tf(h.FKR / 1000, 2)} kN: parçalar kayar, cıvata kesmeye zorlanır. Cıvatayı büyüt, sınıfını yükselt ya da pim / dayama koy.`);
  ok(h.sred <= h.Rp, 'hata', h.sred <= h.Rp ? `Çalışmada cıvata gerilmesi ${tf(h.sred, 0)} MPa / akma ${tf(h.Rp, 0)} MPa.` : `Çalışmada cıvata gerilmesi ${tf(h.sred, 0)} MPa, akmayı (${tf(h.Rp, 0)} MPa) geçiyor: cıvata uzar.`);
  if (g.aA >= 2.5) ok(false, 'uyari', 'Tork ölçülmeden elle sıkmada ön gerilme çok dağılır: önemli bağlantılarda tork anahtarı kullan.');
  const oner = boyutOner(g);
  if (oner && oner !== g.boyut) ok(true, 'bilgi', `Bu yük için yeten en küçük boyut ${oner} (${g.sinif}, ${g.adet} cıvata).`);
  if (!oner) ok(true, 'bilgi', `M24'e kadar hiçbir boyut yetmiyor: cıvata sayısını artır, sınıfı yükselt ya da kaymayı pimle al.`);
  const res = { g, ...h, oner, kontroller: K };
  res.uygun = K.every((q) => q.ok || q.duzey !== 'hata');
  return res;
}
export function civataRapor(r, ad = '') {
  const g = r.g, t = r.t, f = (v, d = 2) => v.toFixed(d), L = ['ÇİZİM ATÖLYESİ — CIVATA BAĞLANTISI HESAP RAPORU', ad, ''];
  L.push('GİRDİLER', `  ${g.adet} × ${g.boyut} × hatve ${t.P}, sınıf ${g.sinif} (R_p0,2 ${r.Rp} MPa) · diş ve baş sürtünmesi ${g.mu} · sıkma dağılımı α_A ${g.aA}`,
    `  Toplam çekme yükü ${g.FA} N · toplam yan (kesme) yükü ${g.FQ} N · ara yüz sürtünmesi ${g.muT} · ${g.q} ara yüz`,
    '', 'SONUÇLAR', `  Gerilme kesiti ${f(t.As, 1)} mm² · d₂ ${f(t.d2, 3)} · d₃ ${f(t.d3, 3)} mm · D_Km ${f(t.DKm, 2)} mm`,
    `  Sıkma torku ${f(r.MA, 2)} N·m · ön gerilme F_Mzul ${f(r.FMzul, 0)} N · en az ${f(r.FMmin, 0)} N`,
    `  Cıvata başına çekme ${f(r.FA, 0)} N, yan yük ${f(r.FQ, 0)} N · kalan sıkma ${f(r.FKR, 0)} N · kayma için gereken ${f(r.FKQ, 0)} N`,
    `  En büyük cıvata kuvveti ${f(r.FSmax, 0)} N · σ ${f(r.sig, 0)} · τ ${f(r.tau, 0)} · σ_red ${f(r.sred, 0)} MPa`,
    '', 'KONTROLLER', ...r.kontroller.map((c) => '  ' + (c.ok ? (c.duzey === 'bilgi' ? 'ℹ ' : '✓ ') : c.duzey === 'hata' ? '✗ ' : '⚠ ') + c.metin),
    '', 'YÖNTEM', '  VDI 2230\'un sadeleştirilmiş biçimi: %90 akma kullanımıyla ön gerilme ve sıkma torku; yük oranı Φ = 0,2 ve oturma kaybı %10 yaklaşık alınmıştır',
    '  (esneklik hesabı yok). Yorulma, diş sıyrılması ve ezilme basıncı hesaplanmaz. Kritik bağlantılarda tam VDI 2230 hesabı yapılmalıdır.');
  return L;
}
