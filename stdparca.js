// Standart parça kütüphanesi: alyan başlı vida (ISO 4762), altıgen somun (ISO 4032), düz pul (ISO 7089),
// sabit bilyalı rulman (60 / 62 / 63 serisi, sadeleştirilmiş). Saf hesap modülü; ölçüler mm.
//
// Kaynaklar (20.11.2026, her tablo en az iki kaynakla karşılaştırıldı):
// - ISO 4762: baş çapı dk en büyük, baş yüksekliği k = d, anahtar ağzı s, lokma derinliği t en küçük — TR Fastenings / Farnell
//   ISO 4762 veri sayfası (M3…M24 tam satır), Keller & Kalmbach M6 (k 6, dk 10, t 3), iki ayrı katalog (s ve t satırları).
// - ISO 4032: anahtar ağzı s, yükseklik m en büyük — Wermac ISO 4032 çizelgesi, H&B Bolt metrik somun veri sayfası
//   (M3 5,5 / 2,4 … M24 36 / 21,5), ISO 4032:1999 resmî örnek sayfası (adımlar).
// - ISO 7089: iç çap d1 en küçük, dış çap d2 en büyük, kalınlık h — JC Fasteners ISO 7089 veri sayfası, fasteners.eu ISO 7089,
//   BOLTS kütüphanesi (EN 7089), McMaster-Carr (M3, M4, M5, M8, M10, M20 satırları).
// - Rulman ana ölçüleri d × D × B (ISO 15): Miki Pulley JIS çizelgesi (6000–6005, 6200–6206), MRO Supply (6002–6006,
//   6200–6204, 6300–6304), igus (6002–6005, 6202–6205, 6302–6305). 6306 doğrulanamadığı için yok.

import { KABA } from './delik.js?v=20261120b';
import { vidaDisBoyu } from './dis.js?v=20261120b';

const r3 = (v) => Math.round(v * 1000) / 1000;
const tf = (v) => String(r3(v)).replace('.', ',');

// ISO 4762: [dk, k, s, t]
export const VIDA_4762 = {
  M3: [5.5, 3, 2.5, 1.3], M4: [7, 4, 3, 2], M5: [8.5, 5, 4, 2.5], M6: [10, 6, 5, 3], M8: [13, 8, 6, 4], M10: [16, 10, 8, 5],
  M12: [18, 12, 10, 6], M16: [24, 16, 14, 8], M20: [30, 20, 17, 10], M24: [36, 24, 19, 12],
};
// ISO 4762 anma boyları (l)
export const BOYLAR = [6, 8, 10, 12, 16, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 80, 90, 100, 110, 120];
// ISO 4032: [s, m]
export const SOMUN_4032 = {
  M3: [5.5, 2.4], M4: [7, 3.2], M5: [8, 4.7], M6: [10, 5.2], M8: [13, 6.8], M10: [16, 8.4], M12: [18, 10.8], M16: [24, 14.8], M20: [30, 18], M24: [36, 21.5],
};
// ISO 7089: [d1, d2, h]
export const PUL_7089 = {
  M3: [3.2, 7, 0.5], M4: [4.3, 9, 0.8], M5: [5.3, 10, 1], M6: [6.4, 12, 1.6], M8: [8.4, 16, 1.6], M10: [10.5, 20, 2],
  M12: [13, 24, 2.5], M16: [17, 30, 3], M20: [21, 37, 3], M24: [25, 44, 4],
};
// rulman: [d, D, B]
export const RULMAN = {
  6000: [10, 26, 8], 6001: [12, 28, 8], 6002: [15, 32, 9], 6003: [17, 35, 10], 6004: [20, 42, 12], 6005: [25, 47, 12], 6006: [30, 55, 13],
  6200: [10, 30, 9], 6201: [12, 32, 10], 6202: [15, 35, 11], 6203: [17, 40, 12], 6204: [20, 47, 14], 6205: [25, 52, 15], 6206: [30, 62, 16],
  6300: [10, 35, 11], 6301: [12, 37, 12], 6302: [15, 42, 13], 6303: [17, 47, 14], 6304: [20, 52, 15], 6305: [25, 62, 17],
};

export const TURLER = { vida: 'Alyan başlı vida (ISO 4762)', somun: 'Altıgen somun (ISO 4032)', pul: 'Düz pul (ISO 7089)', rulman: 'Sabit bilyalı rulman' };
export function olculer(tur) {
  const t = { vida: VIDA_4762, somun: SOMUN_4032, pul: PUL_7089, rulman: RULMAN }[tur];
  return t ? Object.keys(t) : [];
}
export function normalize(o = {}) {
  const tur = TURLER[o.tur] ? o.tur : 'vida';
  const list = olculer(tur);
  const def = tur === 'rulman' ? '6204' : 'M8';
  const olcu = list.includes(String(o.olcu)) ? String(o.olcu) : def;
  const boy = BOYLAR.includes(+o.boy) ? +o.boy : 25;
  return { tur, olcu, boy };
}

// altıgen (köşeler; düz kenarlar u eksenine paralel değil — köşe +u yönünde), anahtar ağzı s
export function altigen(s) {
  const R = s / Math.sqrt(3);
  return Array.from({ length: 6 }, (_, i) => { const a = (i * Math.PI) / 3; return [r3(R * Math.cos(a)), r3(R * Math.sin(a))]; });
}
export function daire(d, n = 48) {
  return Array.from({ length: n }, (_, i) => { const a = (i * 2 * Math.PI) / n; return [r3((d / 2) * Math.cos(a)), r3((d / 2) * Math.sin(a))]; });
}

// Parça tarifleri. Yerel eksen: y yüzey normali (dışa), y = 0 yüzey. Her tarif: { tip, op, olculer, taban (y), ad, yardimci }
// Dönüş: { parcalar, ad, yazi (parça listesi ölçü yazısı), std }
export function tarif(opts) {
  const o = normalize(opts);
  const out = [];
  let ad, yazi;
  if (o.tur === 'vida') {
    const [dk, k, s, t] = VIDA_4762[o.olcu], d = parseFloat(o.olcu.slice(1)), l = o.boy;
    ad = 'ISO 4762 ' + o.olcu + '×' + l;
    yazi = o.olcu + '×' + l;
    // gövde + baş tek dönel profil (u yarıçap, v yükseklik; v = 0 vida ucu)
    out.push({ tip: 'sketch', op: 'add', mode: 'revolve', pts: [[0, 0], [d / 2, 0], [d / 2, l], [dk / 2, l], [dk / 2, l + k], [0, l + k]], taban: -l, ad });
    // altıgen lokma (baştan t derinliğinde oyuk)
    out.push({ tip: 'sketch', op: 'sub', mode: 'extrude', plane: 'top', pts: altigen(s), h: t + 0.5, taban: k - t, ad: ad + ' · lokma', yardimci: true });
  } else if (o.tur === 'somun') {
    const [s, m] = SOMUN_4032[o.olcu], d = parseFloat(o.olcu.slice(1));
    ad = 'ISO 4032 ' + o.olcu;
    yazi = o.olcu + ' (s ' + tf(s) + ', m ' + tf(m) + ')';
    out.push({ tip: 'sketch', op: 'add', mode: 'extrude', plane: 'top', pts: altigen(s), more: [daire(d)], h: m, taban: 0, ad });
  } else if (o.tur === 'pul') {
    const [d1, d2, h] = PUL_7089[o.olcu];
    ad = 'ISO 7089 ' + o.olcu.slice(1);
    yazi = 'Ø' + tf(d1) + ' / Ø' + tf(d2) + ' × ' + tf(h);
    out.push({ tip: 'tube', op: 'add', d: d2, di: d1, h, taban: 0, ad });
  } else {
    const [d, D, B] = RULMAN[o.olcu];
    ad = 'Rulman ' + o.olcu;
    yazi = d + ' × ' + D + ' × ' + B + ' (sadeleştirilmiş)';
    out.push({ tip: 'tube', op: 'add', d: D, di: d, h: B, taban: 0, ad });
  }
  // kozmetik dişler (ana parçanın yerel çerçevesinde): vida gövdesinde ucundan b = 2d + 12 boyunca, somunda boydan boya
  let disler = [];
  if (o.tur === 'vida') { const d = parseFloat(o.olcu.slice(1)); disler = [{ yan: 'dis', olcu: o.olcu, d, P: KABA[o.olcu], bas: 0, boy: vidaDisBoyu(d, o.boy), r: d / 2 }]; }
  if (o.tur === 'somun') { const d = parseFloat(o.olcu.slice(1)); disler = [{ yan: 'ic', olcu: o.olcu, d, P: KABA[o.olcu], bas: 0, boy: SOMUN_4032[o.olcu][1], r: d / 2 }]; }
  return { parcalar: out, ad, yazi, disler, std: { tur: o.tur, olcu: o.olcu, boy: o.tur === 'vida' ? o.boy : null } };
}

// Kesin hacim (elle): vida = gövde + baş − lokma; somun = altıgen − delik; pul / rulman = halka
export function hacim(opts) {
  const o = normalize(opts);
  if (o.tur === 'vida') {
    const [dk, k, s, t] = VIDA_4762[o.olcu], d = parseFloat(o.olcu.slice(1));
    return Math.PI * (d / 2) ** 2 * o.boy + Math.PI * (dk / 2) ** 2 * k - (Math.sqrt(3) / 2) * s * s * t;
  }
  if (o.tur === 'somun') { const [s, m] = SOMUN_4032[o.olcu], d = parseFloat(o.olcu.slice(1)); return ((Math.sqrt(3) / 2) * s * s - Math.PI * (d / 2) ** 2) * m; }
  if (o.tur === 'pul') { const [d1, d2, h] = PUL_7089[o.olcu]; return (Math.PI / 4) * (d2 * d2 - d1 * d1) * h; }
  const [d, D, B] = RULMAN[o.olcu];
  return (Math.PI / 4) * (D * D - d * d) * B;
}
