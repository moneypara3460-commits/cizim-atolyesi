// Mekatronik Mühendisliği — paralel kama bağlantısı (DIN 6885-1, A biçimi: uçları yuvarlak). Saf hesap (tests/meka-kama.test.mjs).
//
// Kama ölçüsü mil çapına göre DIN 6885-1 tablosundan: genişlik b × yükseklik h, mil kanalı derinliği t₁.
// Taşıyan boy l_t = L − b (A biçimi), göbek tarafında taşıyan yükseklik h − t₁.
// Yüzey basıncı p = 2·T·K_A / (d·(h − t₁)·l_t·φ),  φ = 1 (tek kama), 0,75·2 = 1,5 (iki kama, yük eşit dağılmaz; DIN 6892).
// Kama kesmesi τ = 2·T·K_A / (d·b·l_t·φ). İzin verilen basınç göbek malzemesine göre yaklaşık (darbesiz), elle değiştirilebilir.
// Gereken en kısa kama boyu L_min = 2·T·K_A / (d·(h − t₁)·p_izin·φ) + b.
const tf = (v, d) => v.toFixed(d).replace('.', ',');
const num = (v, d) => (Number.isFinite(+v) ? +v : d);
// [d üst sınırı (dahil), b, h, t₁]  — DIN 6885-1
export const KAMA_TABLO = [[8, 2, 2, 1.2], [10, 3, 3, 1.8], [12, 4, 4, 2.5], [17, 5, 5, 3], [22, 6, 6, 3.5], [30, 8, 7, 4], [38, 10, 8, 5], [44, 12, 8, 5], [50, 14, 9, 5.5], [58, 16, 10, 6], [65, 18, 11, 7], [75, 20, 12, 7.5], [85, 22, 14, 9], [95, 25, 14, 9], [110, 28, 16, 10], [130, 32, 18, 11], [150, 36, 20, 12]];
export const GOBEK = { celik: { ad: 'Çelik göbek (S355, C45)', p: 120 }, dokum: { ad: 'Dökme demir göbek (GJL / GJS)', p: 70 }, al: { ad: 'Alüminyum göbek', p: 40 }, ozel: { ad: 'Elle gir', p: 0 } };
export const KAMA_DEFAULTS = { d: 25, T: 50, L: 32, adet: 1, gobek: 'celik', pizin: 120, KA: 1.2, tauizin: 90 };
// "Redüktör çıkış mili – zincir dişlisi" şablonu (temsilî)
export const KAMA_ORNEK = () => ({ ...KAMA_DEFAULTS, d: 30, T: 120, L: 40, adet: 1, gobek: 'celik', KA: 1.25 });
export function kamaSanitize(o) {
  const x = o && typeof o === 'object' ? o : {}, D = KAMA_DEFAULTS, out = {};
  for (const k of Object.keys(D)) out[k] = typeof D[k] === 'number' ? num(x[k], D[k]) : (typeof x[k] === 'string' ? x[k] : D[k]);
  if (!(out.gobek in GOBEK)) out.gobek = 'celik';
  out.adet = out.adet === 2 ? 2 : 1;
  return out;
}
export function kamaOlcu(d) { for (const r of KAMA_TABLO) if (d > 6 && d <= r[0]) return { b: r[1], h: r[2], t1: r[3] }; return null; }

export function kamaHesap(g0) {
  const g = kamaSanitize(g0), o = kamaOlcu(g.d);
  if (!(g.T > 0 && g.L > 0)) return { g, hata: 'Tork ve kama boyu sıfırdan büyük olmalı' };
  if (!o) return { g, hata: 'Mil çapı 6–150 mm arasında olmalı (DIN 6885-1 tablosu)' };
  const pizin = g.gobek === 'ozel' ? g.pizin : GOBEK[g.gobek].p;
  if (!(pizin > 0)) return { g, hata: 'İzin verilen yüzey basıncını gir' };
  const lt = g.L - o.b;
  if (!(lt > 0)) return { g, hata: `Kama boyu kama genişliğinden (${o.b} mm) uzun olmalı` };
  const phi = g.adet === 2 ? 1.5 : 1, Te = g.T * g.KA * 1000, ht = o.h - o.t1;
  const p = 2 * Te / (g.d * ht * lt * phi), tau = 2 * Te / (g.d * o.b * lt * phi), Lmin = 2 * Te / (g.d * ht * pizin * phi) + o.b;
  const Sp = pizin / p, K = [], ok = (bb, duzey, metin) => K.push({ ok: bb, duzey, metin });
  ok(Sp >= 1, 'hata', Sp >= 1 ? `Göbekte yüzey basıncı ${tf(p, 1)} MPa / izin verilen ${tf(pizin, 0)} MPa (emniyet ${tf(Sp, 2)}).` : `Göbekte yüzey basıncı ${tf(p, 1)} MPa, izin verilenden (${tf(pizin, 0)} MPa) fazla: kama yuvası ezilir, bağlantı boşluk yapar. Kamayı en az ${tf(Math.ceil(Lmin), 0)} mm yap${g.adet === 1 ? ', ya da iki kama kullan' : ''}.`);
  ok(tau <= g.tauizin, 'uyari', tau <= g.tauizin ? `Kamada kesme gerilmesi ${tf(tau, 1)} MPa — sorun yok.` : `Kamada kesme gerilmesi ${tf(tau, 1)} MPa (izin ${tf(g.tauizin, 0)} MPa): kama kesilebilir.`);
  ok(g.L <= 1.6 * g.d, 'uyari', g.L <= 1.6 * g.d ? `Kama boyu ${tf(g.L, 0)} mm, mil çapının ${tf(g.L / g.d, 2)} katı.` : `Kama boyu mil çapının ${tf(g.L / g.d, 2)} katı: çok uzun kamada yük uçta toplanır (çapın 1,6 katına kadar önerilir). İki kama, kamalı mil ya da sıkı geçme düşün.`);
  if (g.adet === 2) ok(true, 'bilgi', 'İki kama 180° karşılıklı açılır; yük eşit dağılmadığı için taşıma tek kamanın 1,5 katı alınır.');
  const res = { g, ...o, lt, p, tau, pizin, Sp, Lmin, ht, kontroller: K };
  res.uygun = K.every((q) => q.ok || q.duzey !== 'hata');
  return res;
}
export function kamaRapor(r, ad = '') {
  const g = r.g, f = (v, d = 2) => v.toFixed(d), L = ['ÇİZİM ATÖLYESİ — PARALEL KAMA HESAP RAPORU', ad, ''];
  L.push('GİRDİLER', `  Mil çapı ${g.d} mm · tork ${g.T} N·m · darbe katsayısı ${g.KA} · kama boyu ${g.L} mm · ${g.adet} kama · ${g.gobek === 'ozel' ? 'elle girilen göbek' : GOBEK[g.gobek].ad}`,
    '', 'SONUÇLAR', `  Kama DIN 6885-1 A ${r.b} × ${r.h} × ${g.L} · mil kanalı derinliği t₁ ${r.t1} mm · taşıyan boy ${f(r.lt, 1)} mm, yükseklik ${f(r.ht, 1)} mm`,
    `  Yüzey basıncı ${f(r.p, 1)} MPa / izin ${f(r.pizin, 0)} MPa · kesme ${f(r.tau, 1)} MPa · gereken en kısa kama ${f(r.Lmin, 1)} mm`,
    '', 'KONTROLLER', ...r.kontroller.map((c) => '  ' + (c.ok ? (c.duzey === 'bilgi' ? 'ℹ ' : '✓ ') : c.duzey === 'hata' ? '✗ ' : '⚠ ') + c.metin),
    '', 'YÖNTEM', '  DIN 6885-1 ölçüleri; basınç p = 2T·K_A/(d·(h − t₁)·l_t·φ) (DIN 6892 yöntem C\'ye benzer sade hesap). İzin verilen basınçlar darbesiz yük için',
    '  yaklaşıktır. Mil kanalının çentik etkisi mil hesabında ayrıca dikkate alınmalıdır.');
  return L;
}
