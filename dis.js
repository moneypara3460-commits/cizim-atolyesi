// Kozmetik diş: dişin kendisi modellenmez (model hafif kalır, imalat diş yazısından yapılır); dişli bölge 3B'de helis çizgisiyle,
// teknik resimde ISO 6410'a göre ince çizgilerle gösterilir. Saf hesap modülü; ölçüler mm.
//
// Metrik ISO diş küçük çapları (ISO 724 / ISO 68-1 temel profil): dış diş d3 = d − 1,226869·P, iç diş D1 = d − 1,082532·P.
// Optimas metrik diş çizelgesiyle karşılaştırıldı (M3×0,5: d3 2,387, D1 2,459; M4×0,7: d3 3,141, D1 3,242).
// ISO 4762 vida diş boyu b (başvuru, l ≤ 125): 2d + 12 — Misumi / JIS B 1176 çizelgesi (M3 18 … M24 60), fasten.it (M2 16).
import { KABA, INCE } from './delik.js?v=20261120b';

export const dKucukDis = (d, P) => d - 1.226869 * P;   // dış diş küçük çapı d3
export const dKucukIc = (d, P) => d - 1.082532 * P;    // iç diş küçük çapı D1
export const vidaDisBoyu = (d, l) => Math.min(l, 2 * d + 12);

const r3 = (v) => Math.round(v * 1000) / 1000;
const tf = (v) => String(r3(v)).replace('.', ',');
export const MOLCU = Object.keys(KABA);
export const madimlar = (m) => [KABA[m], ...(INCE[m] || [])].filter(Boolean);

// Kullanıcının eklediği diş (parça üstünde saklanır): { yan: 'dis' | 'ic', olcu: 'M8' | 'ozel', d, P, bas, boy, ad }
// Doğrulayıp eksikleri tamamlar; geçersizse null.
export function disSan(t) {
  if (!t || typeof t !== 'object') return null;
  const yan = t.yan === 'ic' ? 'ic' : 'dis';
  let olcu = t.olcu === 'ozel' || KABA[t.olcu] ? t.olcu : 'ozel';
  let d = +t.d, P = +t.P;
  if (olcu !== 'ozel') { d = parseFloat(olcu.slice(1)); if (!madimlar(olcu).some((p) => Math.abs(p - P) < 1e-9)) P = KABA[olcu]; }
  if (!(d > 0) || !(P > 0) || P > d / 2) return null;
  const bas = Math.max(0, +t.bas || 0), boy = +t.boy;
  if (!(boy > 0)) return null;
  const ad = String(t.ad || '').slice(0, 40);
  return { yan, olcu, d: r3(d), P: r3(P), bas: r3(bas), boy: r3(boy), ad };
}
// diş yazısı: M8, M10×1,25 ya da özel ad (ör. G 1/2) — boşsa çap × adım
export function disAdi(t) {
  if (t.olcu && t.olcu !== 'ozel') return t.olcu + (Math.abs(t.P - KABA[t.olcu]) < 1e-9 ? '' : '×' + tf(t.P));
  return t.ad ? t.ad : 'Ø' + tf(t.d) + '×' + tf(t.P);
}

// Parçanın bütün dişleri, parçanın yerel çerçevesinde (taban ortası orijin, eksen +y):
// [{ yan, d, P, y0, y1, r (helisin çizileceği yarıçap: yüzey), ad }]
// p: parça; kaynaklar: kullanıcı dişleri (p.threads), delik sihirbazının kılavuz deliği (p.hole.thread),
// standart parça dişleri (p.threads, oluşturulurken yazılır).
export function parcaDisleri(p) {
  const out = [];
  if (!p) return out;
  const yuzR = (yan) => {
    if (p.type === 'tube') return yan === 'ic' ? +p.di / 2 : +p.d / 2;
    if (p.type === 'cylinder') return +p.d / 2;
    return null;
  };
  for (const raw of Array.isArray(p.threads) ? p.threads : []) {
    const t = disSan(raw);
    if (!t) continue;
    const r = raw.r > 0 ? +raw.r : yuzR(t.yan) || (t.yan === 'dis' ? t.d / 2 : dKucukIc(t.d, t.P) / 2);
    out.push({ yan: t.yan, d: t.d, P: t.P, y0: t.bas, y1: t.bas + t.boy, r, ad: disAdi(t) });
  }
  const th = p.hole && p.hole.thread;
  if (th && p.type === 'cylinder' && +p.h > 1) {
    const top = +p.h - 1;   // kesici yüzeyin 1 mm dışına taşar: yüzey y = h − 1
    const boy = th.boydan ? top : Math.min(+th.boy, top);
    out.push({ yan: 'ic', d: parseFloat(th.olcu.slice(1)), P: +th.adim, y0: top - boy, y1: top, r: +p.d / 2, ad: th.olcu + (th.kaba ? '' : '×' + tf(th.adim)) });
  }
  return out;
}

// helis (yerel): yarıçap r, y0 → y1, adım P; tur başına n parça. Çok uzun dişte en çok 600 tur (görüntü için adım büyütülür).
export function helis(r, y0, y1, P, n = 24) {
  const turns = Math.max(0.25, (y1 - y0) / P), k = Math.min(1, 600 / turns), N = Math.ceil(turns * k * n);
  const pts = [];
  for (let i = 0; i <= N; i++) {
    const f = i / N, a = f * turns * 2 * Math.PI;
    pts.push([r * Math.cos(a), y0 + f * (y1 - y0), r * Math.sin(a)]);
  }
  return pts;
}
