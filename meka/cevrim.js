// Mekatronik Mühendisliği — makine çevrim (zamanlama) diyagramı. Saf hesap; DOM gerektirmez (tests/meka-cevrim.test.mjs).
//
// Bir makinede aynı ana mil (bir tur = bir çevrim) birkaç istasyonu sürer: çene, bıçak, itici, dozaj kapağı… Her istasyonun
// hareketi eksantrikteki gibi [açı, konum] satırlarıyla yazılır (bekle / it / geri gel; hareket eğrileri meka/kam.js).
// İstasyon faz kadar kaydırılabilir: s(θ) = plan(θ − faz) — eksantrikte kama kanalını faz kadar döndürmek demektir.
// Kurallar (A, B istasyon; "ileride" = konum, strokun eşik %'sinden büyük):
//   'ayri'   — A ile B aynı anda ileride olmasın; aralarında en az `pay` derece boşluk kalsın (ör. film çekme ↔ çene).
//   'icinde' — B yalnız A ilerideyken ileride olsun; B'nin bölgesi A'nın bölgesinin içinde, iki uçta en az `pay`
//              derece boşlukla kalsın (ör. bıçak çene kapalıyken keser, dozaj çene kapalıyken boşalır).
// Kural bozuksa B için en küçük geciktirme ve en küçük öne alma (derece) önerilir.
import { bolumler, hareket, YASALAR } from './kam.js?v=20261127c';

export const ADIM = 0.5;                     // derece: örnekleme adımı
const N = Math.round(360 / ADIM);
const num = (v, d) => (Number.isFinite(+v) ? +v : d);

export const CEVRIM_DEFAULTS = { n: 40, ist: [], kural: [] };
// "Dikey poşet makinesi (VFFS)" şablonu — temsilî değerler
export const CEVRIM_ORNEK = () => ({
  n: 40,
  ist: [
    { ad: 'Kaynak çenesi', birim: 'mm', yasa: 'mods', faz: 0, plan: [[0, 0], [60, 40], [200, 40], [260, 0], [360, 0]] },
    { ad: 'Bıçak', birim: 'mm', yasa: 'sikloid', faz: 0, plan: [[0, 0], [100, 0], [130, 15], [150, 15], [180, 0], [360, 0]] },
    { ad: 'Dozaj kapağı', birim: '°', yasa: 'mods', faz: 0, plan: [[0, 0], [80, 0], [110, 60], [160, 60], [190, 0], [360, 0]] },
    { ad: 'Film çekme kolu', birim: 'mm', yasa: 'mods', faz: 0, plan: [[0, 0], [270, 0], [320, 120], [360, 0]] },
  ],
  kural: [
    { a: 0, b: 1, tur: 'icinde', esikA: 90, esikB: 10, pay: 5 },
    { a: 0, b: 2, tur: 'icinde', esikA: 90, esikB: 10, pay: 5 },
    { a: 0, b: 3, tur: 'ayri', esikA: 10, esikB: 10, pay: 5 },
  ],
});

export function cevrimSanitize(o) {
  const x = o && typeof o === 'object' ? o : {};
  const ist = (Array.isArray(x.ist) ? x.ist : []).slice(0, 12).map((s, i) => ({
    ad: typeof s?.ad === 'string' && s.ad.trim() ? s.ad.slice(0, 40) : 'İstasyon ' + (i + 1),
    birim: s?.birim === '°' ? '°' : 'mm',
    yasa: YASALAR[s?.yasa] ? s.yasa : 'mods',
    faz: ((num(s?.faz, 0) % 360) + 360) % 360,
    plan: Array.isArray(s?.plan) && s.plan.length >= 2 ? s.plan.slice(0, 40).map((p) => [num(p && p[0], 0), num(p && p[1], 0)]) : [[0, 0], [90, 0], [180, 10], [270, 10], [360, 0]],
  }));
  const kural = (Array.isArray(x.kural) ? x.kural : []).slice(0, 30).map((k) => ({
    a: Math.max(0, Math.round(num(k?.a, 0))), b: Math.max(0, Math.round(num(k?.b, 1))), tur: k?.tur === 'icinde' ? 'icinde' : 'ayri',
    esikA: Math.min(99, Math.max(1, num(k?.esikA, 10))), esikB: Math.min(99, Math.max(1, num(k?.esikB, 10))), pay: Math.min(90, Math.max(0, num(k?.pay, 5))),
  }));
  return { n: Math.max(0.1, num(x.n, 40)), ist, kural };
}

// istasyonun bir turluk konumu (N örnek, ADIM derece), faz uygulanmış
export function istasyonYol(s) {
  const { seg, err } = bolumler(s.plan);
  if (err.length) return { hata: s.ad + ': ' + err.join(' · ') };
  const smax = Math.max(...s.plan.map((p) => p[1]));
  const y = new Float64Array(N);
  for (let i = 0; i < N; i++) { const th = ((i * ADIM - s.faz) % 360 + 360) % 360; y[i] = hareket(seg, s.yasa, th * Math.PI / 180)[0]; }
  return { y, smax };
}
// ileride bölgesi (boolean dizi) — konum > eşik % · strok
const bolge = (yol, esik) => { const z = new Uint8Array(N), t = yol.smax * esik / 100; for (let i = 0; i < N; i++) z[i] = yol.smax > 0 && yol.y[i] > t + 1e-9 ? 1 : 0; return z; };
// dairesel aralıklar [başla, bitir) (örnek indisleri)
export function araliklar(z) {
  const out = [], n = z.length;
  if (z.every((v) => v)) return [[0, n]];
  let s0 = z.findIndex((v, i) => !v && z[(i + 1) % n]);
  if (s0 < 0) return out;
  for (let k = 1; k <= n; k++) {
    const i = (s0 + k) % n;
    if (z[i] && !z[(i - 1 + n) % n]) { let j = i; while (z[j % n] && j - i < n) j++; out.push([i, j]); }
  }
  return out.sort((p, q) => p[0] - q[0]);
}
// iki bölge arasında en küçük dairesel boşluk (derece); kesişiyorsa −(kesişen derece)
function bosluk(za, zb) {
  let ortak = 0; for (let i = 0; i < N; i++) if (za[i] && zb[i]) ortak++;
  if (ortak) return -ortak * ADIM;
  const A = [], B = [];
  for (let i = 0; i < N; i++) { if (za[i]) A.push(i); if (zb[i]) B.push(i); }
  if (!A.length || !B.length) return Infinity;
  // her A örneğinden en yakın B örneği (dairesel); ikili arama
  let best = Infinity;
  for (const i of A) {
    let lo = 0, hi = B.length;
    while (lo < hi) { const m = (lo + hi) >> 1; if (B[m] < i) lo = m + 1; else hi = m; }
    for (const j of [B[lo % B.length], B[(lo - 1 + B.length) % B.length]]) { const d = Math.abs(i - j), c = Math.min(d, N - d); if (c < best) best = c; }
  }
  return (best - 1) * ADIM;   // aradaki boş örnek sayısı → derece
}
// B'nin bölgesi A'nınkinin içinde mi; dışarıda kalan derece ve en küçük iç pay
function icinde(za, zb) {
  let disari = 0; for (let i = 0; i < N; i++) if (zb[i] && !za[i]) disari++;
  if (disari) return { disari: disari * ADIM, pay: -1 };
  // A'nın dışındaki örneklere en yakın B örneği uzaklığı
  const notA = [], B = [];
  for (let i = 0; i < N; i++) { if (!za[i]) notA.push(i); if (zb[i]) B.push(i); }
  if (!B.length) return { disari: 0, pay: Infinity, bos: true };
  if (!notA.length) return { disari: 0, pay: Infinity };
  let best = Infinity;
  for (const i of B) {
    let lo = 0, hi = notA.length;
    while (lo < hi) { const m = (lo + hi) >> 1; if (notA[m] < i) lo = m + 1; else hi = m; }
    for (const j of [notA[lo % notA.length], notA[(lo - 1 + notA.length) % notA.length]]) { const d = Math.abs(i - j), c = Math.min(d, N - d); if (c < best) best = c; }
  }
  return { disari: 0, pay: (best - 1) * ADIM };
}
const kaydir = (z, k) => { const o = new Uint8Array(N); for (let i = 0; i < N; i++) o[(i + k + N) % N] = z[i]; return o; };
function kuralTamam(k, za, zb) {
  if (k.tur === 'ayri') { const b = bosluk(za, zb); return b >= k.pay - 1e-9; }
  const r = icinde(za, zb); return !r.disari && r.pay >= k.pay - 1e-9;
}
// B'yi kaydırarak kuralı sağlayan en küçük geciktirme ve öne alma (derece) — yoksa null
function oneri(k, za, zb) {
  let ileri = null, geri = null;
  for (let d = 1; d < N && (ileri == null || geri == null); d++) {
    if (ileri == null && kuralTamam(k, za, kaydir(zb, d))) ileri = d * ADIM;
    if (geri == null && kuralTamam(k, za, kaydir(zb, -d))) geri = d * ADIM;
  }
  return { geciktir: ileri, oneAl: geri };
}

export function cevrimHesap(c0) {
  const c = cevrimSanitize(c0);
  if (!c.ist.length) return { c, hata: 'İstasyon yok: "+ İstasyon ekle" ya da şablon seç' };
  const yol = [];
  for (const s of c.ist) { const y = istasyonYol(s); if (y.hata) return { c, hata: y.hata }; yol.push(y); }
  const msTur = 60000 / c.n, msDer = msTur / 360;
  const sonuc = [];
  for (const k of c.kural) {
    const A = c.ist[k.a], B = c.ist[k.b];
    if (!A || !B || k.a === k.b) { sonuc.push({ k, ok: false, duzey: 'hata', metin: 'Kural geçersiz istasyona bağlı (sil ya da düzelt)' }); continue; }
    const za = bolge(yol[k.a], k.esikA), zb = bolge(yol[k.b], k.esikB);
    const ad = `${A.ad} ↔ ${B.ad}`;
    if (k.tur === 'ayri') {
      const b = bosluk(za, zb), ok = b >= k.pay - 1e-9;
      const r = { k, ok, duzey: ok ? 'ok' : b < 0 ? 'hata' : 'uyari', bosluk: b, cakisma: b < 0 ? araliklar(za.map((v, i) => v && zb[i])).map(([s, e]) => [s * ADIM, e * ADIM]) : [] };
      r.metin = b < 0 ? `${ad}: ${(-b).toFixed(1)}° boyunca ikisi aynı anda ileride — ÇARPIŞMA (${(-b * msDer).toFixed(0)} ms)` : b === Infinity ? `${ad}: istasyonlardan biri hiç ileri gitmiyor` : ok ? `${ad}: aralarında ${b.toFixed(1)}° boşluk (${(b * msDer).toFixed(0)} ms) — en az ${k.pay}° istendi` : `${ad}: aralarında yalnız ${b.toFixed(1)}° boşluk (${(b * msDer).toFixed(0)} ms), en az ${k.pay}° istendi`;
      if (!ok && b !== Infinity) r.oneri = oneri(k, za, zb);
      sonuc.push(r);
    } else {
      const q = icinde(za, zb), ok = !q.disari && q.pay >= k.pay - 1e-9;
      const r = { k, ok, duzey: ok ? 'ok' : q.disari ? 'hata' : 'uyari', disari: q.disari, pay: q.pay };
      r.metin = q.bos ? `${B.ad} hiç ileri gitmiyor` : q.disari ? `${B.ad}, ${A.ad} ileride değilken ${q.disari.toFixed(1)}° boyunca ileride — SIRA HATASI (${(q.disari * msDer).toFixed(0)} ms)` : ok ? `${B.ad}, ${A.ad} ilerideyken çalışıyor; iki uçta en az ${q.pay === Infinity ? '—' : q.pay.toFixed(1) + '°'} pay (en az ${k.pay}° istendi)` : `${B.ad}, ${A.ad} ilerideyken çalışıyor ama pay yalnız ${q.pay.toFixed(1)}° (en az ${k.pay}° istendi)`;
      if (!ok && !q.bos) r.oneri = oneri(k, za, zb);
      sonuc.push(r);
    }
  }
  return { c, yol, sonuc, msTur, msDer, uygun: sonuc.every((r) => r.ok), N, ADIM };
}

export function cevrimCSV(r, adim = 1) {
  const st = Math.max(1, Math.round(adim / ADIM)), L = [['aci_derece', 'zaman_ms', ...r.c.ist.map((s) => (s.ad + '_' + (s.birim === '°' ? 'derece' : 'mm')).replace(/[;\s]+/g, '_'))].join(';')];
  for (let i = 0; i < N; i += st) L.push([i * ADIM, i * ADIM * r.msDer, ...r.yol.map((y) => y.y[i])].map((v) => (Math.round(v * 1000) / 1000).toString().replace('.', ',')).join(';'));
  return '﻿' + L.join('\r\n') + '\r\n';
}
export function cevrimRapor(r, ad = '') {
  const c = r.c, L = ['ÇİZİM ATÖLYESİ — MAKİNE ÇEVRİM (ZAMANLAMA) DİYAGRAMI', ad, ''];
  L.push(`Ana mil ${c.n} çevrim/dk · bir çevrim ${r.msTur.toFixed(0)} ms · 1° = ${r.msDer.toFixed(2)} ms`, '', 'İSTASYONLAR');
  c.ist.forEach((s, i) => {
    L.push(`  ${i + 1}. ${s.ad} (${YASALAR[s.yasa].ad}, faz ${s.faz}°, strok ${r.yol[i].smax} ${s.birim})`);
    const { seg } = bolumler(s.plan);
    for (const b of seg) L.push(`     ${b.a0}° – ${b.a1}°: ${b.tur === 'bekle' ? 'bekle' : b.tur === 'it' ? 'ileri' : 'geri'} (${b.s0} → ${b.s1} ${s.birim})`);
  });
  L.push('', 'KURALLAR');
  if (!r.sonuc.length) L.push('  Kural yok.');
  for (const x of r.sonuc) {
    L.push('  ' + (x.ok ? '✓ ' : x.duzey === 'hata' ? '✗ ' : '⚠ ') + x.metin);
    if (x.oneri) L.push('     Öneri: ' + oneriYazi(x, c));
  }
  L.push('', 'YÖNTEM', '  Her istasyonun konumu 0,5° adımla hesaplanır (modifiye sinüs, sikloid, 4-5-6-7 polinom; Norton, Design of Machinery, bölüm 8).',
    '  "İleride" = konum, istasyon strokunun eşik yüzdesinden büyük. Gerçek parçaların boyu, esnemesi ve boşluklar hesapta yoktur;',
    '  pay bunlar için bırakılır. Ön tasarımdır: makinede yavaş devirde, elle çevirerek denenmelidir.');
  return L;
}
export function oneriYazi(x, c) {
  const B = c.ist[x.k.b], o = x.oneri, p = [];
  if (o.geciktir != null) p.push(`${B.ad} istasyonunu ${o.geciktir}° geciktir (faz ${((B.faz + o.geciktir) % 360).toFixed(1)}°)`);
  if (o.oneAl != null) p.push(`ya da ${o.oneAl}° öne al (faz ${((B.faz - o.oneAl + 360) % 360).toFixed(1)}°)`);
  return p.length ? p.join(' ') : 'yalnız faz kaydırarak çözülmüyor: hareket açılarını değiştir';
}
