// Makine kinematiği: 3, 4 ve 5 eksenli freze tezgâhları için ters / ileri kinematik, eksen limitleri.
// Saf hesap (DOM yok); tests/cam5.test.mjs ile doğrulanır.
//
// Koordinatlar: İŞ PARÇASI ÇERÇEVESİ (W) — makinedeki gibi Z yukarı (takım ekseni dik iken +Z), mm, derece.
//   Bütün döner eksenler 0°'deyken W ile makine eksenleri (X, Y, Z) aynı yöndedir; iş sıfırı (G54) W'nin orijinidir.
// Takım konumu (CL): uç noktası p = [x, y, z] ve takım ekseni v = [i, j, k] (uçtan iş miline doğru birim vektör).
//
// Makine türleri:
//   '3ax'                 : döner eksen yok, v her zaman +Z
//   '4ax'                 : bir döner eksen, TABLADA (parça döner): divizör (A, X ekseni) ya da döner tabla (B, Y ekseni)
//   '5ax-tt' (tabla-tabla): iki döner eksen tablada; dış eksen (ör. A beşiği) iç ekseni (ör. C tablası) taşır
//   '5ax-hh' (kafa-kafa)  : iki döner eksen iş milinde; dış eksen (ör. C) iç ekseni (ör. A / B) taşır, parça sabit
//   '5ax-ht' (kafa-tabla) : bir döner eksen kafada (ör. B), bir döner eksen tablada (ör. C)
// Döner eksen tanımı: { name: 'A'|'B'|'C', axis: [x,y,z] (0°'deki yön, sağ el kuralı), center: [x,y,z] (W'de, 0°'de),
//                       min, max (derece), cont: sürekli dönebilir mi (C tablası gibi) }
// Kafa eksenlerinde center = döner kafa pivot noktasının, takım ucu W orijinindeyken konumu değil; yerine
//   pivot: uçtan pivot noktasına uzaklık (mm, takım boyu dahil) kullanılır.

const D2R = Math.PI / 180, R2D = 180 / Math.PI, EPS = 1e-9;
export const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
export const norm = (a) => Math.hypot(a[0], a[1], a[2]);
export const unit = (a) => { const n = norm(a); return n < EPS ? [0, 0, 0] : [a[0] / n, a[1] / n, a[2] / n]; };
// Rodrigues: u ekseni etrafında deg derece döndür
export function rot(u, deg, p) {
  const t = deg * D2R, c = Math.cos(t), s = Math.sin(t), k = dot(u, p), x = cross(u, p);
  return [p[0] * c + x[0] * s + u[0] * k * (1 - c), p[1] * c + x[1] * s + u[1] * k * (1 - c), p[2] * c + x[2] * s + u[2] * k * (1 - c)];
}
const rotAbout = (u, c, deg, p) => add(rot(u, deg, sub(p, c)), c);
const wrap180 = (a) => { a = ((a + 180) % 360 + 360) % 360 - 180; return a === -180 ? 180 : a; };

// ---- hazır makineler (kullanıcı eksen limitlerini, merkezleri ve pivot boyunu değiştirebilir) ----
export const MACHINES = {
  vmc3: { name: '3 eksen dik işleme', type: '3ax', rot: [] },
  vmc4A: { name: '4. eksen divizör (A, X ekseni boyunca; ayna + punta)', type: '4ax', mount: 'chuck', rot: [{ name: 'A', axis: [1, 0, 0], center: [0, 0, 0], min: -99999, max: 99999, cont: true }] },
  vmc4B: { name: '4. eksen döner tabla (B, Y ekseni; parça tabla yüzüne bağlı)', type: '4ax', mount: 'table', rot: [{ name: 'B', axis: [0, 1, 0], center: [0, 0, 0], min: -120, max: 120, cont: false }] },
  tt_AC: { name: '5 eksen tabla-tabla: A beşik + C döner tabla', type: '5ax-tt', rot: [{ name: 'A', axis: [1, 0, 0], center: [0, 0, 0], min: -120, max: 30 }, { name: 'C', axis: [0, 0, 1], center: [0, 0, 0], min: -99999, max: 99999, cont: true }] },
  tt_BC: { name: '5 eksen tabla-tabla: B beşik + C döner tabla', type: '5ax-tt', rot: [{ name: 'B', axis: [0, 1, 0], center: [0, 0, 0], min: -110, max: 110 }, { name: 'C', axis: [0, 0, 1], center: [0, 0, 0], min: -99999, max: 99999, cont: true }] },
  hh_CA: { name: '5 eksen kafa-kafa: C + A döner kafa', type: '5ax-hh', pivot: 150, rot: [{ name: 'C', axis: [0, 0, 1], min: -360, max: 360 }, { name: 'A', axis: [1, 0, 0], min: -110, max: 110 }] },
  ht_BC: { name: '5 eksen kafa-tabla: B kafa + C döner tabla', type: '5ax-ht', pivot: 150, rot: [{ name: 'B', axis: [0, 1, 0], min: -110, max: 110, head: true }, { name: 'C', axis: [0, 0, 1], center: [0, 0, 0], min: -99999, max: 99999, cont: true }] },
};
export const DEFAULT_LIN = { X: [-400, 400], Y: [-250, 250], Z: [-400, 300] };

// ---- yapılandırma doğrulama: hatalı makineyle hiçbir hesap yapılmaz ----
export function validateMachine(m) {
  const err = [];
  if (!m || typeof m !== 'object') return ['Makine tanımı yok'];
  const need = { '3ax': 0, '4ax': 1, '5ax-tt': 2, '5ax-hh': 2, '5ax-ht': 2 }[m.type];
  if (need == null) return ['Bilinmeyen makine türü: ' + m.type];
  const R = m.rot || [];
  if (R.length !== need) err.push(`${m.type} için ${need} döner eksen gerekir, ${R.length} tanımlı`);
  const names = new Set();
  for (const r of R) {
    if (!['A', 'B', 'C'].includes(r.name)) err.push('Döner eksen adı A, B ya da C olmalı: ' + r.name);
    if (names.has(r.name)) err.push('Aynı döner eksen iki kez: ' + r.name); names.add(r.name);
    if (!Array.isArray(r.axis) || r.axis.length !== 3 || r.axis.some((x) => !Number.isFinite(+x)) || norm(r.axis) < 1e-6) err.push(r.name + ' ekseninin yönü geçersiz');
    if (!(Number.isFinite(+r.min) && Number.isFinite(+r.max) && +r.min < +r.max)) err.push(r.name + ' ekseni limitleri geçersiz (en az < en çok olmalı)');
    if (r.center && (r.center.length !== 3 || r.center.some((x) => !Number.isFinite(+x)))) err.push(r.name + ' ekseninin merkezi geçersiz');
  }
  if (R.length === 2 && !err.length && Math.abs(Math.abs(dot(unit(R[0].axis), unit(R[1].axis))) - 1) < 1e-6) err.push('İki döner eksen paralel olamaz');
  if ((m.type === '5ax-hh' || m.type === '5ax-ht') && !(+m.pivot > 0)) err.push('Kafa pivot boyu (uçtan dönme merkezine) > 0 olmalı');
  if (m.type === '5ax-ht' && R.length === 2 && !(R[0].head && !R[1].head)) err.push('Kafa-tabla makinede 1. eksen kafada, 2. eksen tablada olmalı');
  if (m.type === '4ax' && R.length === 1 && Math.abs(dot(unit(R[0].axis), [0, 0, 1])) > 1e-6) err.push('4. eksen takım eksenine (Z) dik olmalı (A ya da B)');
  const L = m.lin || DEFAULT_LIN;
  for (const k of ['X', 'Y', 'Z']) if (!(L[k] && +L[k][0] < +L[k][1])) err.push(k + ' doğrusal eksen limitleri geçersiz');
  return err;
}

// Paden–Kahan alt problem 1: u ekseni etrafında p'yi q'ya getiren açı (derece); p ∥ u ise null
function sp1(u, p, q) {
  const pp = sub(p, mul(u, dot(u, p))), qq = sub(q, mul(u, dot(u, q)));
  if (norm(pp) < 1e-9 || norm(qq) < 1e-9) return null;
  return Math.atan2(dot(u, cross(pp, qq)), dot(pp, qq)) * R2D;
}
// Alt problem 2: R(u1,t1)·R(u2,t2)·p = q → [{t1, t2}] (0, 1 ya da 2 çözüm; tekillikte t = null)
function sp2(u1, u2, p, q) {
  const a12 = dot(u1, u2), den = a12 * a12 - 1;
  if (Math.abs(den) < 1e-12) return [];
  const al = (a12 * dot(u2, p) - dot(u1, q)) / den, be = (a12 * dot(u1, q) - dot(u2, p)) / den;
  const c12 = cross(u1, u2), g2 = (dot(p, p) - al * al - be * be - 2 * al * be * a12) / dot(c12, c12);
  if (g2 < -1e-9) return [];
  const out = [];
  for (const g of g2 <= 1e-12 ? [0] : [Math.sqrt(g2), -Math.sqrt(g2)]) {
    const c = add(add(mul(u1, al), mul(u2, be)), mul(c12, g));
    const t2 = sp1(u2, p, c), t1b = sp1(u1, q, c);   // R(u1,−t1) q = c
    out.push({ t1: t1b == null ? null : -t1b, t2 });
  }
  return out;
}

// döner eksen açısını limit içinde, önceki açıya en yakın eşdeğerine getir (sürekli eksenlerde tur sayısı korunur)
function pickAngle(r, a, prev) {
  if (a == null) a = prev ?? 0;   // tekillik: eksen serbest, öncekini koru
  const cands = [];
  for (let k = -3; k <= 3; k++) { const x = a + 360 * k; if (x >= r.min - 1e-9 && x <= r.max + 1e-9) cands.push(x); }
  if (!cands.length) return { a: wrap180(a), ok: false };
  const ref = prev ?? 0;
  cands.sort((x, y) => Math.abs(x - ref) - Math.abs(y - ref));
  return { a: cands[0], ok: true };
}

// ---- ileri kinematik: makine eksenleri → W'de takım ucu ve ekseni ----
// ax = { X, Y, Z, A?, B?, C? }
export function forward(m, ax) {
  const R = m.rot || [], T = (r) => +(ax[r.name] || 0), M = [ax.X, ax.Y, ax.Z];
  const Z = [0, 0, 1];
  if (m.type === '3ax') return { p: M, v: Z };
  if (m.type === '4ax') {   // W = R(-a) (M - c) + c
    const r = R[0], u = unit(r.axis), c = r.center || [0, 0, 0];
    return { p: rotAbout(u, c, -T(r), M), v: rot(u, -T(r), Z) };
  }
  if (m.type === '5ax-tt') {   // M = R1(t1)( R2(t2)(p - c2) + c2 - c1 ) + c1
    const [r1, r2] = R, u1 = unit(r1.axis), u2 = unit(r2.axis), c1 = r1.center || [0, 0, 0], c2 = r2.center || [0, 0, 0];
    const q = rotAbout(u1, c1, -T(r1), M), p = rotAbout(u2, c2, -T(r2), q);
    return { p, v: rot(u2, -T(r2), rot(u1, -T(r1), Z)) };
  }
  const L = +m.pivot;
  if (m.type === '5ax-hh') {   // v = R1 R2 Z ; M = p + L v − L Z
    const [r1, r2] = R, v = rot(unit(r1.axis), T(r1), rot(unit(r2.axis), T(r2), Z));
    return { p: sub(add(M, mul(Z, L)), mul(v, L)), v };
  }
  if (m.type === '5ax-ht') {   // kafa: vm = Rh Z ; tabla: p' = Rt(p - ct) + ct, M = p' + L vm − L Z
    const [rh, rt] = R, ut = unit(rt.axis), ct = rt.center || [0, 0, 0];
    const vm = rot(unit(rh.axis), T(rh), Z), pm = sub(add(M, mul(Z, L)), mul(vm, L));
    return { p: rotAbout(ut, ct, -T(rt), pm), v: rot(ut, -T(rt), vm) };
  }
  throw new Error('Bilinmeyen makine türü');
}

// ---- ters kinematik: W'de (p, v) → makine eksenleri. prev: önceki eksen değerleri (en yakın çözüm seçilir) ----
// Dönüş: { ax, ok, why } — ok=false ise eksen limiti / erişilemeyen yön
export function inverse(m, p, v, prev = null) {
  v = unit(v);
  const R = m.rot || [], Z = [0, 0, 1], lin = m.lin || DEFAULT_LIN;
  const finish = (ax, okRot, why) => {
    let ok = okRot, w = why;
    for (const k of ['X', 'Y', 'Z']) if (ax[k] < lin[k][0] - 1e-6 || ax[k] > lin[k][1] + 1e-6) { ok = false; w = w || (k + ' ekseni limit dışı (' + ax[k].toFixed(1) + ')'); }
    return { ax, ok, why: w };
  };
  if (m.type === '3ax') {
    const ok = Math.abs(v[2] - 1) < 1e-6;
    return finish({ X: p[0], Y: p[1], Z: p[2] }, ok, ok ? null : '3 eksende takım ekseni dik olmalı');
  }
  if (m.type === '4ax') {
    const r = R[0], u = unit(r.axis), c = r.center || [0, 0, 0];
    if (Math.abs(dot(u, v)) > 1e-6) return { ax: null, ok: false, why: 'Bu takım yönü 4 eksende yapılamaz (döner eksene dik değil)' };
    const t = sp1(u, v, Z);
    const pk = pickAngle(r, t, prev ? prev[r.name] : null);
    const M = rotAbout(u, c, pk.a, p);
    return finish({ X: M[0], Y: M[1], Z: M[2], [r.name]: pk.a }, pk.ok, pk.ok ? null : r.name + ' ekseni limit dışı');
  }
  const sols = [];
  if (m.type === '5ax-tt') {
    const [r1, r2] = R, u1 = unit(r1.axis), u2 = unit(r2.axis), c1 = r1.center || [0, 0, 0], c2 = r2.center || [0, 0, 0];
    for (const s of sp2(u1, u2, v, Z)) {
      const a1 = pickAngle(r1, s.t1, prev ? prev[r1.name] : null), a2 = pickAngle(r2, s.t2, prev ? prev[r2.name] : null);
      const M = rotAbout(u1, c1, a1.a, rotAbout(u2, c2, a2.a, p));
      sols.push({ ax: { X: M[0], Y: M[1], Z: M[2], [r1.name]: a1.a, [r2.name]: a2.a }, ok: a1.ok && a2.ok });
    }
  } else if (m.type === '5ax-hh') {
    const [r1, r2] = R, L = +m.pivot;
    for (const s of sp2(unit(r1.axis), unit(r2.axis), Z, v)) {
      const a1 = pickAngle(r1, s.t1, prev ? prev[r1.name] : null), a2 = pickAngle(r2, s.t2, prev ? prev[r2.name] : null);
      const M = sub(add(p, mul(v, L)), mul(Z, L));
      sols.push({ ax: { X: M[0], Y: M[1], Z: M[2], [r1.name]: a1.a, [r2.name]: a2.a }, ok: a1.ok && a2.ok });
    }
  } else if (m.type === '5ax-ht') {
    const [rh, rt] = R, uh = unit(rh.axis), ut = unit(rt.axis), ct = rt.center || [0, 0, 0], L = +m.pivot;
    // R(uh, −θh) R(ut, θt) v = Z
    for (const s of sp2(uh, ut, v, Z)) {
      const ah = pickAngle(rh, s.t1 == null ? null : -s.t1, prev ? prev[rh.name] : null), at = pickAngle(rt, s.t2, prev ? prev[rt.name] : null);
      const vm = rot(uh, ah.a, Z), pm = rotAbout(ut, ct, at.a, p), M = sub(add(pm, mul(vm, L)), mul(Z, L));
      sols.push({ ax: { X: M[0], Y: M[1], Z: M[2], [rh.name]: ah.a, [rt.name]: at.a }, ok: ah.ok && at.ok });
    }
  } else throw new Error('Bilinmeyen makine türü');
  if (!sols.length) return { ax: null, ok: false, why: 'Bu takım yönüne bu makineyle ulaşılamaz' };
  // limit içindeki, önceki konuma en yakın çözüm (döner eksen hareketi en az)
  const cost = (s) => (s.ok ? 0 : 1e9) + R.reduce((t, r) => t + Math.abs(s.ax[r.name] - (prev ? prev[r.name] ?? 0 : 0)), 0);
  sols.sort((a, b) => cost(a) - cost(b));
  const s = sols[0];
  return finish(s.ax, s.ok, s.ok ? null : 'Döner eksen limiti: ' + R.map((r) => r.name + ' ' + s.ax[r.name].toFixed(1) + '° [' + r.min + ', ' + r.max + ']').join(', '));
}

// W'de bir yönü (v) +Z'ye getiren en küçük döndürme (3+2 ve indeksleme düzlem çerçevesi): [eksen, açı]
export function alignToZ(v) {
  v = unit(v);
  const c = cross(v, [0, 0, 1]), s = norm(c), d = v[2];
  if (s < 1e-12) return d > 0 ? { u: [1, 0, 0], deg: 0 } : { u: [1, 0, 0], deg: 180 };
  return { u: mul(c, 1 / s), deg: Math.atan2(s, d) * R2D };
}

// Görselleştirme için makine durumu: W'deki bir nokta makine çerçevesinde nerede (tabla dönmesi), takım ucu ve ekseni makinede.
// x_m = Rm · x_w + t ; kafa eksenli makinelerde tabla dönmesi yoktur (Rm = I).
export function machinePose(m, ax) {
  const R = m.rot || [], T = (r) => +(ax[r.name] || 0);
  let f = (x) => x, fd = (d) => d;
  if (m.type === '4ax') { const r = R[0], u = unit(r.axis), c = r.center || [0, 0, 0]; f = (x) => rotAbout(u, c, T(r), x); fd = (d) => rot(u, T(r), d); }
  else if (m.type === '5ax-tt') { const [r1, r2] = R, u1 = unit(r1.axis), u2 = unit(r2.axis), c1 = r1.center || [0, 0, 0], c2 = r2.center || [0, 0, 0]; f = (x) => rotAbout(u1, c1, T(r1), rotAbout(u2, c2, T(r2), x)); fd = (d) => rot(u1, T(r1), rot(u2, T(r2), d)); }
  else if (m.type === '5ax-ht') { const rt = R[1], ut = unit(rt.axis), ct = rt.center || [0, 0, 0]; f = (x) => rotAbout(ut, ct, T(rt), x); fd = (d) => rot(ut, T(rt), d); }
  const o = f([0, 0, 0]), ex = fd([1, 0, 0]), ey = fd([0, 1, 0]), ez = fd([0, 0, 1]);
  const fw = forward(m, ax);
  return { R: [[ex[0], ey[0], ez[0]], [ex[1], ey[1], ez[1]], [ex[2], ey[2], ez[2]]], t: o, tip: f(fw.p), axis: fd(fw.v) };
}
