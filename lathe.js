// CNC TORNA (2 eksen X/Z) — saf hesap modülü: ham malzeme ve parça profili, takım kütüphanesi, 11 operasyonun
// takım yolu, eksenel simetrik malzeme kaldırma simülasyonu, çarpışma / sınır kontrolü, Fanuc uyumlu postprosesör
// ve G-kodu geri okuma (simülasyon ile G-kodun aynı yolu kullandığının denetimi).
//
// Koordinatlar (iç hesap): z eksenel (0 = bitmiş parçanın ön yüzü, negatif yön aynaya doğru), r yarıçap (≥ 0).
// G-kodunda X çaptır (yarıçap modu seçilebilir). Yay yönü: +Z sağa, +X yukarı bakışta G02 saat yönü
// (arka tip ve ön tip taret için programlanan G02/G03 aynıdır; ekranda çizim yönü değişir).
// Bütün hareketler takımın REFERANS noktası (kumandada ofseti ölçülen sanal uç / köşe) için hesaplanır;
// simülasyon ve G-kodu aynı hareket listesini kullanır.
// İlk sürüm: C ekseni, Y ekseni, canlı takım, punta, karşı iş mili YOK (yetenek bayrakları false; arayüz açıkça yazar).
import { matKeyFor, ascii, fmt } from './cam.js?v=20261112u';

const EPS = 1e-9, D2R = Math.PI / 180;
const hyp = Math.hypot, clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const sub = (a, b) => [a[0] - b[0], a[1] - b[1]], add = (a, b) => [a[0] + b[0], a[1] + b[1]], mul = (a, k) => [a[0] * k, a[1] * k];
const dist = (a, b) => hyp(a[0] - b[0], a[1] - b[1]), cross = (a, b) => a[0] * b[1] - a[1] * b[0], dot = (a, b) => a[0] * b[0] + a[1] * b[1];
const norm = (a) => { const l = hyp(a[0], a[1]) || 1; return [a[0] / l, a[1] / l]; };

/* ===================== makine, malzeme, takım ===================== */
export const LATHE_MACHINES = {
  fanuc2x: { name: 'Genel 2 eksen CNC torna — Fanuc 0i-T uyumlu (arka tip taret)', post: 'fanuc_t', turret: 'arka', maxRpm: 4000, minRpm: 30, xMin: -6, xMax: 320, zMin: -400, zMax: 150, rapid: 12000, positions: 12,
    caps: { css: true, g76: true, noseComp: true, radiusMode: true, c: false, y: false, live: false, tail: false } },
  fanuc2x_front: { name: 'Genel 2 eksen CNC torna — Fanuc 0i-T uyumlu (ön tip taret)', post: 'fanuc_t', turret: 'ön', maxRpm: 3500, minRpm: 30, xMin: -6, xMax: 260, zMin: -350, zMax: 150, rapid: 10000, positions: 8,
    caps: { css: true, g76: true, noseComp: true, radiusMode: true, c: false, y: false, live: false, tail: false } },
  iso_basic: { name: 'Basit ISO torna kumandası (G76 / takım ucu telafisi yok)', post: 'iso_t', turret: 'ön', maxRpm: 2500, minRpm: 50, xMin: -4, xMax: 200, zMin: -250, zMax: 100, rapid: 6000, positions: 6,
    caps: { css: true, g76: false, noseComp: false, radiusMode: false, c: false, y: false, live: false, tail: false } },
};
export const CAP_NAMES = { c: 'C ekseni (iş mili konumlama)', y: 'Y ekseni', live: 'Canlı (dönen) takım', tail: 'Punta' };
// Torna kesme değerleri: kesme hızı Vc (m/dk), ilerleme f (mm/dev) — başlangıç değerleri; takım üreticisi kataloğu esastır
export const LATHE_CUT = {
  celik: { name: 'Yapı çeliği (C45 vb.)', vcR: 200, vcF: 250, fR: 0.25, fF: 0.1, vcG: 120, fG: 0.06, vcT: 120, vcD: 90, fD: 0.15 },
  paslanmaz: { name: 'Paslanmaz', vcR: 150, vcF: 180, fR: 0.2, fF: 0.08, vcG: 90, fG: 0.05, vcT: 90, vcD: 60, fD: 0.1 },
  aluminyum: { name: 'Alüminyum', vcR: 500, vcF: 600, fR: 0.3, fF: 0.1, vcG: 300, fG: 0.08, vcT: 250, vcD: 150, fD: 0.2 },
  pirinc: { name: 'Pirinç / bakır', vcR: 300, vcF: 350, fR: 0.25, fF: 0.1, vcG: 200, fG: 0.06, vcT: 180, vcD: 120, fD: 0.15 },
  titanyum: { name: 'Titanyum', vcR: 60, vcF: 80, fR: 0.2, fF: 0.08, vcG: 40, fG: 0.04, vcT: 40, vcD: 30, fD: 0.08 },
  plastik: { name: 'Plastik', vcR: 300, vcF: 400, fR: 0.3, fF: 0.12, vcG: 200, fG: 0.1, vcT: 200, vcD: 100, fD: 0.2 },
};
export const latheMatKey = (id) => { const k = matKeyFor(id); return LATHE_CUT[k] ? k : 'celik'; };

export const TOOL_TYPES_L = { od: 'Dış çap tornalama takımı', id: 'İç çap (delik) tornalama — bara', face: 'Alın tornalama takımı', groove: 'Kanal takımı', part: 'Kesme (ayırma) takımı', thread: 'Vida açma takımı', drill: 'Matkap' };
// Takım: { id, n (taret yeri), off (ofset no), type, rn (uç yarıçapı), kr (yaklaşma açısı, °), kr2 (iz kenarı açısı, °),
//   edge (kesme kenarı boyu), w (kanal / kesme genişliği), d (matkap çapı), reach (en büyük kesme derinliği / boyu),
//   minBore (bara: en küçük delik çapı), bar (bara çapı), ang (diş / matkap uç açısı), ext (dış vida mı), hand (R/L/N), spin (M03/M04), name }
export function defaultLatheTools() {
  return [
    { id: 1, n: 1, off: 1, type: 'od', name: 'DNMG 55° R0.8 kaba', rn: 0.8, kr: 93, kr2: 32, edge: 11, hand: 'R', spin: 'M03', hw: 25 },
    { id: 2, n: 2, off: 2, type: 'od', name: 'VNMG 35° R0.4 finiş', rn: 0.4, kr: 93, kr2: 52, edge: 11, hand: 'R', spin: 'M03', hw: 25 },
    { id: 3, n: 3, off: 3, type: 'face', name: 'CNMG 80° R0.8 alın', rn: 0.8, kr: 95, kr2: 5, edge: 12, hand: 'R', spin: 'M03', hw: 25 },
    { id: 4, n: 4, off: 4, type: 'groove', name: 'Kanal 3 mm', rn: 0.2, w: 3, reach: 8, hand: 'N', spin: 'M03', hw: 25 },
    { id: 5, n: 5, off: 5, type: 'id', name: 'Bara Ø10 R0.4 (en az Ø12 delik)', rn: 0.4, kr: 93, kr2: 32, edge: 6, minBore: 12, bar: 10, reach: 45, hand: 'R', spin: 'M03' },
    { id: 6, n: 6, off: 6, type: 'thread', name: 'Dış vida 60° (ISO)', rn: 0.1, ang: 60, ext: true, hand: 'R', spin: 'M03', hw: 25 },
    { id: 7, n: 7, off: 7, type: 'drill', name: 'Matkap Ø14 118°', d: 14, ang: 118, reach: 70, hand: 'N', spin: 'M03' },
    { id: 8, n: 8, off: 8, type: 'part', name: 'Kesme 3 mm', rn: 0.2, w: 3, reach: 30, hand: 'N', spin: 'M03', hw: 25 },
  ];
}
export function validateTool(t) {
  const e = [];
  if (!TOOL_TYPES_L[t.type]) e.push('Takım türü bilinmiyor');
  if (!(Number.isInteger(t.n) && t.n >= 1 && t.n <= 99)) e.push('Takım numarası 1–99 tam sayı olmalı');
  if (!(Number.isInteger(t.off) && t.off >= 0 && t.off <= 99)) e.push('Ofset numarası 0–99 tam sayı olmalı');
  if (['od', 'id', 'face', 'groove', 'part', 'thread'].includes(t.type) && !(t.rn >= 0 && t.rn <= 3)) e.push('Uç yarıçapı 0–3 mm olmalı');
  if (['od', 'id', 'face'].includes(t.type)) { if (!(t.kr >= 45 && t.kr <= 120)) e.push('Yaklaşma açısı 45–120° olmalı'); if (!(t.kr2 >= 0 && t.kr2 <= 80)) e.push('İz kenarı açısı 0–80° olmalı'); if (!(t.edge > 0)) e.push('Kesme kenarı boyu gerekli'); }
  if (['groove', 'part'].includes(t.type) && !(t.w > 0 && t.w > 2 * t.rn)) e.push('Kanal / kesme genişliği uç yarıçapının iki katından büyük olmalı');
  if (['groove', 'part', 'id', 'drill'].includes(t.type) && !(t.reach > 0)) e.push('Erişim (en büyük derinlik) gerekli');
  if (t.type === 'id' && !(t.minBore > 0 && t.bar > 0 && t.bar < t.minBore)) e.push('Bara çapı en küçük delik çapından küçük olmalı');
  if (t.type === 'drill' && !(t.d > 0 && t.ang > 60 && t.ang < 180)) e.push('Matkap çapı ve uç açısı (60–180°) gerekli');
  if (t.type === 'thread' && !(t.ang > 0 && t.ang < 120)) e.push('Diş takımı açısı gerekli');
  if (!['R', 'L', 'N'].includes(t.hand)) e.push('Takım yönü R, L ya da N olmalı');
  if (!['M03', 'M04'].includes(t.spin)) e.push('İş mili yönü M03 ya da M04 olmalı');
  return e;
}
// Fanuc sanal uç numarası (takım ucu telafisi için, ofset sayfasına girilir): arka tip taret, +Z sağ, +X yukarı
export const tipNumber = (t) => ({ od: 3, face: 3, id: 2, groove: 3, part: 3, thread: 8, drill: 0 }[t.type] ?? 0);

/* ===================== profil geometrisi ===================== */
// Profil noktası: { z, r, R (yay yarıçapı, 0 = doğru), cw (önceki noktadan buraya yay yönü: saat yönü mü) }
// Elemanlar: { t:'L', a, b } | { t:'A', a, b, c, R, cw }   (noktalar [z, r])
export function profileElements(pts) {
  const out = [];
  for (let i = 1; i < pts.length; i++) {
    const a = [pts[i - 1].z, pts[i - 1].r], b = [pts[i].z, pts[i].r], R = +pts[i].R || 0;
    if (dist(a, b) < EPS) continue;
    if (R > 0) {
      const c = arcCenter(a, b, R, !!pts[i].cw); if (!c) throw new Error(`${i + 1}. nokta: yay yarıçapı (${R}) iki nokta arasındaki yarı uzaklıktan küçük`);
      out.push({ t: 'A', a, b, c, R, cw: !!pts[i].cw });
    } else out.push({ t: 'L', a, b });
  }
  return out;
}
// kısa yay (≤ 180°) merkezi
export function arcCenter(a, b, R, cw) {
  const m = mul(add(a, b), 0.5), h2 = R * R - (dist(a, b) / 2) ** 2; if (h2 < -1e-9) return null;
  const d = norm(sub(b, a)), n = [-d[1], d[0]], h = Math.sqrt(Math.max(0, h2));
  // saat yönü kısa yay: merkez, a→b yönünün sağında
  return cw ? add(m, mul(n, -h)) : add(m, mul(n, h));
}
const ang = (c, p) => Math.atan2(p[1] - c[1], p[0] - c[0]);
function sweep(e) { let s = ang(e.c, e.b) - ang(e.c, e.a); if (e.cw) { while (s > 0) s -= 2 * Math.PI; } else { while (s < 0) s += 2 * Math.PI; } return s; }
export function elemLength(e) { return e.t === 'L' ? dist(e.a, e.b) : Math.abs(sweep(e)) * e.R; }
export function sampleElem(e, step = 0.05) {
  if (e.t === 'L') { const n = Math.max(1, Math.ceil(dist(e.a, e.b) / step)), o = []; for (let i = 0; i <= n; i++) o.push(add(e.a, mul(sub(e.b, e.a), i / n))); return o; }
  const s = sweep(e), a0 = ang(e.c, e.a), n = Math.max(2, Math.ceil(Math.abs(s) * e.R / step)), o = [];
  for (let i = 0; i <= n; i++) { const t = a0 + (s * i) / n; o.push([e.c[0] + e.R * Math.cos(t), e.c[1] + e.R * Math.sin(t)]); }
  o[o.length - 1] = e.b.slice(); return o;
}
export function samplePath(els, step = 0.05) { const o = []; for (const e of els) { const s = sampleElem(e, step); o.push(...(o.length ? s.slice(1) : s)); } return o; }
const tanStart = (e) => (e.t === 'L' ? norm(sub(e.b, e.a)) : (() => { const v = sub(e.a, e.c); return e.cw ? norm([v[1], -v[0]]) : norm([-v[1], v[0]]); })());
const tanEnd = (e) => (e.t === 'L' ? norm(sub(e.b, e.a)) : (() => { const v = sub(e.b, e.c); return e.cw ? norm([v[1], -v[0]]) : norm([-v[1], v[0]]); })());

// Profil denetimi: z azalmayan (aynaya doğru) sıra, r ≥ 0
export function checkProfile(pts, label) {
  const e = [];
  if (!Array.isArray(pts) || pts.length < 2) { e.push(`${label}: en az 2 nokta gerekli`); return e; }
  pts.forEach((p, i) => { if (!(Number.isFinite(p.z) && Number.isFinite(p.r))) e.push(`${label} ${i + 1}. nokta: Z ve çap sayı olmalı`); else if (p.r < -1e-9) e.push(`${label} ${i + 1}. nokta: çap negatif`); if (i && p.z > pts[i - 1].z + 1e-9) e.push(`${label} ${i + 1}. nokta: profil aynaya doğru (Z azalan) gitmeli; geri dönüş desteklenmez`); if (p.R && !(p.R > 0)) e.push(`${label} ${i + 1}. nokta: yay yarıçapı pozitif olmalı`); });
  if (Math.abs(pts[0].z) > 1e-9) e.push(`${label}: ilk nokta Z = 0 (parça ön yüzü) olmalı`);
  if (!e.length) try { profileElements(pts); } catch (er) { e.push(`${label}: ${er.message}`); }
  return e;
}
// r(z) — dikey parçada en büyük (od) / en küçük (id) değer; z profil dışındaysa null
export function radiusAt(els, z, mode = 'max') {
  let best = null;
  for (const e of els) {
    const z0 = Math.min(e.a[0], e.b[0]), z1 = Math.max(e.a[0], e.b[0]); if (z < z0 - 1e-9 || z > z1 + 1e-9) continue;
    let rs = [];
    if (e.t === 'L') { if (Math.abs(e.b[0] - e.a[0]) < 1e-12) rs = [e.a[1], e.b[1]]; else rs = [e.a[1] + ((e.b[1] - e.a[1]) * (z - e.a[0])) / (e.b[0] - e.a[0])]; }
    else { const dz = z - e.c[0]; if (Math.abs(dz) > e.R + 1e-9) continue; const h = Math.sqrt(Math.max(0, e.R * e.R - dz * dz)); for (const r of [e.c[1] + h, e.c[1] - h]) { const p = [z, r]; if (onArc(e, p)) rs.push(r); } }
    for (const r of rs) best = best == null ? r : mode === 'max' ? Math.max(best, r) : Math.min(best, r);
  }
  return best;
}
function onArc(e, p) { const s = sweep(e), a0 = ang(e.c, e.a); let d = ang(e.c, p) - a0; if (e.cw) { while (d > 1e-12) d -= 2 * Math.PI; return d >= s - 1e-9; } while (d < -1e-12) d += 2 * Math.PI; return d <= s + 1e-9; }

/* ===================== ofset (takım ucu yarıçapı + pay) ===================== */
// side: +1 = hareket yönünün sağı (dış çap: malzeme altta, takım üstte), −1 = solu (iç çap)
export function offsetPath(els, d, side) {
  if (d < EPS) return els.map((e) => ({ ...e, a: e.a.slice(), b: e.b.slice() }));
  const off = [];
  for (const e of els) {
    if (e.t === 'L') { const t = norm(sub(e.b, e.a)), n = side > 0 ? [t[1], -t[0]] : [-t[1], t[0]]; off.push({ t: 'L', a: add(e.a, mul(n, d)), b: add(e.b, mul(n, d)), src: e }); continue; }
    const t0 = tanStart(e), n0 = side > 0 ? [t0[1], -t0[0]] : [-t0[1], t0[0]], away = dot(n0, sub(e.a, e.c)) > 0, R2 = away ? e.R + d : e.R - d;
    if (R2 < 1e-6) { off.push({ t: 'X', src: e }); continue; }   // takım bu iç yaya sığmıyor: komşularla kesiştirilecek
    const k = R2 / e.R; off.push({ t: 'A', a: add(e.c, mul(sub(e.a, e.c), k)), b: add(e.c, mul(sub(e.b, e.c), k)), c: e.c.slice(), R: R2, cw: e.cw, src: e });
  }
  const live = off.filter((e) => e.t !== 'X');
  const out = [];
  for (let i = 0; i < live.length; i++) {
    const cur = { ...live[i], a: live[i].a.slice(), b: live[i].b.slice() };
    if (out.length) {
      const prev = out[out.length - 1];
      if (dist(prev.b, cur.a) > 1e-7) {
        const V = prev.src.b, t1 = tanEnd(prev.src), t2 = tanStart(cur.src), cr = cross(t1, t2);
        const convex = cr * side > 0 && dist(prev.src.b, cur.src.a) < 1e-7;
        if (convex) out.push({ t: 'A', a: prev.b.slice(), b: cur.a.slice(), c: V.slice(), R: d, cw: side < 0, src: { t: 'P', a: V, b: V }, corner: true });   // dış çapta köşe yayı saat yönü tersi (G03)
        else {
          const P = intersectNear(prev, cur, prev.b);
          if (!P) throw new Error('Ofset hesaplanamadı: profil köşesi takım ucu yarıçapı için çok dar');
          prev.b = P; cur.a = P;
        }
      }
    }
    out.push(cur);
  }
  return out.filter((e) => elemLength(e) > 1e-7 || e.t === 'L' && dist(e.a, e.b) > 1e-7);
}
function intersectNear(e1, e2, near) {
  const c = intersect(e1, e2); if (!c.length) return null;
  return c.reduce((b, p) => (dist(p, near) < dist(b, near) ? p : b));
}
function intersect(e1, e2) {
  if (e1.t === 'L' && e2.t === 'L') { const d1 = sub(e1.b, e1.a), d2 = sub(e2.b, e2.a), den = cross(d1, d2); if (Math.abs(den) < 1e-12) return []; const t = cross(sub(e2.a, e1.a), d2) / den; return [add(e1.a, mul(d1, t))]; }
  if (e1.t === 'A' && e2.t === 'L') return lineCircle(e2, e1);
  if (e1.t === 'L' && e2.t === 'A') return lineCircle(e1, e2);
  const d = dist(e1.c, e2.c); if (d < 1e-12 || d > e1.R + e2.R || d < Math.abs(e1.R - e2.R)) return [];
  const a = (e1.R * e1.R - e2.R * e2.R + d * d) / (2 * d), h = Math.sqrt(Math.max(0, e1.R * e1.R - a * a)), u = norm(sub(e2.c, e1.c)), m = add(e1.c, mul(u, a));
  return [add(m, mul([-u[1], u[0]], h)), add(m, mul([u[1], -u[0]], h))];
}
function lineCircle(L, A) {
  const d = norm(sub(L.b, L.a)), f = sub(L.a, A.c), b = dot(f, d), c = dot(f, f) - A.R * A.R, disc = b * b - c; if (disc < 0) return [];
  const s = Math.sqrt(disc); return [add(L.a, mul(d, -b - s)), add(L.a, mul(d, -b + s))];
}

/* ===================== iş (ham + parça) ===================== */
// job: { stock: { d, len, face (ön yüz fazlası), bore (boru iç çapı, 0), stickout (aynadan çıkış) },
//   chuck: { jawD (çene dış çapı), jawLen, bodyD, bodyLen }, od: [nokta], id: [nokta] | [], partLen, machine, mat, tools, ops, safe, post: {...} }
export function exampleJob() {
  return {
    name: 'Ornek kademeli mil M24',
    mk: 'fanuc2x', mat: 'celik', units: 'mm', xMode: 'diameter',
    stock: { d: 50, len: 120, face: 2, bore: 0, stickout: 95 },
    chuck: { jawD: 110, jawLen: 30, bodyD: 200, bodyLen: 90 },
    partLen: 80,
    od: [{ z: 0, r: 11 }, { z: -1, r: 12 }, { z: -22, r: 12 }, { z: -22, r: 10.5 }, { z: -26, r: 10.5 }, { z: -26, r: 14 }, { z: -27, r: 15 }, { z: -40, r: 15 }, { z: -55, r: 20 }, { z: -62, r: 20 }, { z: -65, r: 23, R: 3, cw: true }, { z: -80, r: 23 }],
    id: [{ z: 0, r: 9 }, { z: -1, r: 8 }, { z: -20, r: 8 }, { z: -20, r: 7 }, { z: -30, r: 7 }, { z: -30 - 7 / Math.tan(59 * D2R), r: 0 }],
    safe: 2, retract: 1, tc: null,
    tools: defaultLatheTools(),
    ops: [
      { type: 'face', on: true, tool: 1, ap: 1, f: 0.2, vc: 200, css: true },
      { type: 'drill', on: true, tool: 7, d: 14, depth: 30, peck: 8, f: 0.15, rpm: 900 },
      { type: 'rough', on: true, side: 'od', tool: 1, ap: 2, allow: 0.3, f: 0.25, vc: 200, css: true },
      { type: 'finish', on: true, side: 'od', tool: 2, f: 0.1, vc: 250, css: true, comp: 'cam' },
      { type: 'groove', on: true, tool: 4, z: -22, width: 4, bottomD: 21, peck: 1, f: 0.06, vc: 120, css: true },
      { type: 'rough', on: true, side: 'id', tool: 5, ap: 0.8, allow: 0.2, f: 0.15, vc: 150, css: true },
      { type: 'finish', on: true, side: 'id', tool: 5, f: 0.08, vc: 180, css: true, comp: 'cam' },
      { type: 'thread', on: true, tool: 6, side: 'od', d: 24, pitch: 1.5, z1: 3, z2: -20, first: 0.25, min: 0.05, fin: 0.05, spring: 1, infeed: 29, method: 'G76', rpm: 800 },
      { type: 'part', on: true, tool: 8, z: -80, peck: 2, f: 0.05, vc: 100, css: true, endD: 0 },
    ],
  };
}
export const OP_NAMES_L = {
  od_turn: 'Dış çap tornalama', id_turn: 'İç çap tornalama', face: 'Alın tornalama', rough: 'Kaba talaş kaldırma (profil)', finish: 'Finiş tornalama (profil)',
  groove: 'Kanal açma', part: 'Kesme ve ayırma', drill: 'Delik delme', taper: 'Konik tornalama', profile: 'Profil tornalama (kopya / G73 tipi)', thread: 'Vida ve diş açma',
};
const OP_TOOLS = { od_turn: ['od'], id_turn: ['id'], face: ['od', 'face'], rough: ['od', 'id'], finish: ['od', 'id'], groove: ['groove'], part: ['part', 'groove'], drill: ['drill'], taper: ['od'], profile: ['od'], thread: ['thread'] };
export const OP_DEFAULTS = {
  od_turn: { d: 40, z2: -30, ap: 1.5, f: 0.25, vc: 200, css: true },
  id_turn: { d: 18, z2: -15, ap: 0.8, f: 0.15, vc: 150, css: true },
  face: { ap: 1, f: 0.2, vc: 200, css: true },
  rough: { side: 'od', ap: 2, allow: 0.3, f: 0.25, vc: 200, css: true },
  finish: { side: 'od', f: 0.1, vc: 250, css: true, comp: 'cam' },
  groove: { z: -20, width: 4, bottomD: 20, peck: 1, f: 0.06, vc: 120, css: true },
  part: { z: -50, peck: 2, f: 0.05, vc: 100, css: true, endD: 0 },
  drill: { d: 10, depth: 20, peck: 5, f: 0.12, rpm: 800 },
  taper: { d1: 30, z1: -10, d2: 40, z2: -30, ap: 1.5, f: 0.2, vc: 200, css: true },
  profile: { passes: 4, allow: 0, f: 0.2, vc: 200, css: true },
  thread: { side: 'od', d: 20, pitch: 1.5, z1: 3, z2: -15, first: 0.25, min: 0.05, fin: 0.05, spring: 1, infeed: 29, method: 'G76', rpm: 600 },
};
const opTool = (job, o) => job.tools.find((t) => t.id === o.tool);
// kanal kenarlarındaki profil yarıçapı (kanaldan önce bu seviyeye kadar kaba / finiş yapılmış varsayılır)
function grooveTop(job, o) { try { const G = partGeometry(job), a = radiusAt(G.odE, o.z + 0.01, 'max'), b = radiusAt(G.odE, o.z - o.width - 0.01, 'max'); const v = [a, b].filter((x) => x != null); return v.length ? Math.max(...v) : job.stock.d / 2; } catch (e) { return job.stock.d / 2; } }

// İş içinden profil elemanları (dış çapa ham yarıçapına kadar son yükseliş eklenir)
export function partGeometry(job) {
  const od = profileElements(job.od), Rs = job.stock.d / 2, last = job.od[job.od.length - 1];
  const odE = [...od]; if (last.r < Rs - 1e-9) odE.push({ t: 'L', a: [last.z, last.r], b: [last.z, Rs] });
  const id = job.id && job.id.length >= 2 ? profileElements(job.id) : [];
  return { od, odE, id, Rs };
}

/* ===================== doğrulama (parametre) ===================== */
export function validateJob(job) {
  const out = [], E = (msg, where = 'İş') => out.push({ level: 'hata', where, msg }), W = (msg, where = 'İş') => out.push({ level: 'uyarı', where, msg });
  const M = LATHE_MACHINES[job.mk]; if (!M) E('Makine seçilmedi');
  const s = job.stock || {};
  if (!(s.d > 0)) E('Ham malzeme çapı pozitif olmalı', 'Ham');
  if (!(s.len > 0)) E('Ham malzeme boyu pozitif olmalı', 'Ham');
  if (!(s.face >= 0)) E('Ön yüz fazlası 0 ya da pozitif olmalı', 'Ham');
  if (s.bore && !(s.bore > 0 && s.bore < s.d)) E('Boru ham iç çapı dış çaptan küçük olmalı', 'Ham');
  if (!(s.stickout > 0)) E('Aynadan çıkış boyu gerekli (çarpışma kontrolü için)', 'Ham');
  if (s.stickout > s.len - 5) E(`Aynadan çıkış (${s.stickout}) ham boyundan (${s.len}) en az 5 mm kısa olmalı: ayna malzemeyi tutamaz`, 'Ham');
  if (s.stickout > 3 * s.d && !(M && M.caps.tail)) W(`Aynadan çıkış çapın 3 katından fazla (${(s.stickout / s.d).toFixed(1)}×): punta yok, titreşim ve eğilme riski`, 'Ham');
  if (!(job.partLen > 0)) E('Parça boyu pozitif olmalı', 'Parça');
  for (const x of checkProfile(job.od, 'Dış profil')) E(x, 'Parça');
  if (job.id && job.id.length) for (const x of checkProfile(job.id, 'İç profil')) E(x, 'Parça');
  if (out.some((x) => x.level === 'hata')) return out;
  const G = partGeometry(job), maxR = Math.max(...samplePath(G.od, 0.2).map((p) => p[1]));
  if (maxR > G.Rs + 1e-9) E(`Parça en büyük çapı (Ø${fmt(maxR * 2)}) ham çaptan (Ø${s.d}) büyük`, 'Parça');
  const odEnd = job.od[job.od.length - 1].z; if (Math.abs(odEnd + job.partLen) > 1e-6) W(`Dış profil Z = ${odEnd} bitiyor, parça boyu ${job.partLen}: profil parça boyunca tanımlı olmalı`, 'Parça');
  if (job.partLen + s.face > s.stickout - 2) E(`Parça boyu + ön fazla (${job.partLen + s.face}) aynadan çıkışı (${s.stickout}) aşıyor: takım aynaya çarpar`, 'Parça');
  if (G.id.length) for (const p of samplePath(G.id, 0.5)) { const ro = radiusAt(G.od, p[0], 'min'); if (ro != null && p[1] >= ro - 0.3) { E(`İç profil Z ${fmt(p[0])}'de dış profile değiyor ya da 0,3 mm'den ince et`, 'Parça'); break; } }
  if (s.bore && G.id.length && Math.min(...samplePath(G.id, 0.5).map((p) => p[1])) < s.bore / 2 - 1e-6) E('İç profil boru ham deliğinden küçük', 'Parça');
  for (const t of job.tools) for (const x of validateTool(t)) E(x, `T${t.n}`);
  const nums = job.tools.map((t) => t.n); if (new Set(nums).size !== nums.length) E('Aynı taret yerinde iki takım var', 'Takımlar');
  if (M) for (const t of job.tools) if (t.n > M.positions) E(`T${t.n}: makinede ${M.positions} taret yeri var`, 'Takımlar');
  const C = LATHE_CUT[job.mat] || LATHE_CUT.celik;
  job.ops.forEach((o, i) => { if (o.on !== false) for (const x of validateOp(job, o, C, M)) out.push({ ...x, where: `${i + 1}. ${OP_NAMES_L[o.type] || o.type}` }); });
  return out;
}
function validateOp(job, o, C, M) {
  const out = [], E = (msg) => out.push({ level: 'hata', msg }), W = (msg) => out.push({ level: 'uyarı', msg });
  if (!OP_NAMES_L[o.type]) { E('Operasyon türü bilinmiyor'); return out; }
  const t = opTool(job, o); if (!t) { E('Takım seçilmedi'); return out; }
  if (!OP_TOOLS[o.type].includes(t.type)) E(`Bu operasyon için ${OP_TOOLS[o.type].map((k) => TOOL_TYPES_L[k]).join(' ya da ')} gerekli (seçili: ${TOOL_TYPES_L[t.type]})`);
  if ((o.type === 'rough' || o.type === 'finish') && t.type !== (o.side === 'id' ? 'id' : 'od')) E(`Taraf ${o.side === 'id' ? 'iç' : 'dış'} çap: takım türü uymuyor`);
  if (['od', 'id', 'face'].includes(t.type) && t.hand === 'L') E('Takım yönü sol (L): bu operasyonlar aynaya doğru (−Z) keser; sağ (R) ya da nötr takım seç');
  const posNum = (k, l) => { if (!(o[k] > 0)) E(`${l} pozitif olmalı`); };
  if (o.type !== 'thread' && o.type !== 'drill') { posNum('f', 'İlerleme (mm/dev)'); if (!(o.vc > 0) && !(o.rpm > 0)) E('Kesme hızı (m/dk) ya da devir gerekli'); }
  if (o.f > 1) E('İlerleme 1 mm/dev üstünde: değer yanlış girilmiş olabilir');
  if (t.rn > 0 && o.f > 0.8 * t.rn * 1.25 && ['od', 'id', 'face'].includes(t.type)) W(`İlerleme (${o.f}) uç yarıçapına (${t.rn}) göre büyük: yüzey kötüleşir, uç kırılabilir (öneri ≤ ${fmt(t.rn * 0.8)})`);
  const vcRef = o.type === 'finish' ? C.vcF : ['groove', 'part'].includes(o.type) ? C.vcG : C.vcR;
  if (o.vc > 0 && (o.vc > vcRef * 1.8 || o.vc < vcRef * 0.3)) W(`Kesme hızı ${o.vc} m/dk, ${C.name} için başlangıç değeri ~${vcRef}`);
  if (o.rpm > 0 && M && o.rpm > M.maxRpm) E(`Devir ${o.rpm}, makine en çok ${M.maxRpm}`);
  if (o.rpm > 0 && M && o.rpm < M.minRpm) E(`Devir ${o.rpm}, makine en az ${M.minRpm}`);
  if (['face', 'rough', 'od_turn', 'id_turn', 'taper'].includes(o.type)) { posNum('ap', 'Talaş derinliği'); if (t.edge && o.ap > t.edge * 0.66) W(`Talaş derinliği (${o.ap}) kesme kenarının 2/3'ünü (${fmt(t.edge * 0.66)}) aşıyor`); if (t.rn && o.ap < t.rn * 0.5) W('Talaş derinliği uç yarıçapının yarısından küçük: talaş oluşmayabilir'); }
  if (o.type === 'rough' && !(o.allow >= 0)) E('Finiş payı 0 ya da pozitif olmalı');
  if (o.type === 'finish' && o.comp === 'control' && M && !M.caps.noseComp) E('Bu kumanda takım ucu telafisi (G41/G42) desteklemiyor: telafi "CAM" seçilmeli');
  if (['id_turn'].includes(o.type) || (o.type === 'rough' || o.type === 'finish') && o.side === 'id') if (!(job.id && job.id.length) && o.type !== 'id_turn') E('İç profil tanımlı değil');
  if (o.type === 'groove') { posNum('width', 'Kanal genişliği'); if (t.w && o.width < t.w - 1e-9) E(`Kanal genişliği (${o.width}) takım genişliğinden (${t.w}) küçük`); if (!(o.bottomD > 0)) E('Kanal dip çapı pozitif olmalı'); if (o.bottomD >= job.stock.d) E('Kanal dip çapı ham çaptan küçük olmalı'); if (!(o.z <= 0)) E('Kanal Z konumu (ön duvar) ≤ 0 olmalı'); const top = grooveTop(job, o), dep = top - o.bottomD / 2; if (t.reach && dep > t.reach + 1e-9) E(`Kanal derinliği ${fmt(dep)} mm (kanal kenarındaki profil Ø${fmt(2 * top)}), takım erişimi ${t.reach} mm`); }
  if (o.type === 'part') { if (t.reach && job.stock.d / 2 - (o.endD || 0) / 2 > t.reach + 1e-9) E(`Kesme derinliği ${fmt(job.stock.d / 2)} mm, takım erişimi ${t.reach} mm`); if (!(o.z < 0)) E('Kesme Z konumu (parça arka yüzü) negatif olmalı'); if (o.endD < 0) E('Kesme bitiş çapı negatif olamaz'); }
  if (o.type === 'drill') { posNum('d', 'Delik çapı'); posNum('depth', 'Delik derinliği'); if (!(o.rpm > 0)) E('Matkap devri gerekli'); if (!(o.f > 0)) E('İlerleme gerekli'); if (t.d && Math.abs(t.d - o.d) > 1e-6) E(`Matkap çapı (${t.d}) delik çapıyla (${o.d}) aynı olmalı`); if (t.reach && o.depth > t.reach) E(`Delik derinliği ${o.depth}, matkap boyu ${t.reach}`); if (o.peck < 0) E('Gagalama adımı negatif olamaz'); }
  if (o.type === 'thread') { posNum('pitch', 'Hatve'); posNum('d', 'Diş çapı'); if (!(o.z1 > o.z2)) E('Diş başlangıcı (Z1) bitişten (Z2) büyük olmalı (aynaya doğru keser)'); if (o.z1 - Math.max(0, o.z2) < 2 * o.pitch && o.z1 < 2 * o.pitch) W('Diş girişi kısa: en az 2 hatve yaklaşma önerilir (hızlanma)'); posNum('first', 'İlk paso derinliği'); if (!(o.rpm > 0)) E('Diş açmada sabit devir gerekli'); if (M && o.rpm * o.pitch > M.rapid * 0.5) E('Devir × hatve makine eksen hızını aşıyor'); if (t.ext === (o.side === 'id')) E('Dış / iç vida takımı operasyon tarafına uymuyor'); if (o.method === 'G76' && M && !M.caps.g76) W('Kumanda G76 desteklemiyor: G32 tek tek pasolara çevrilir'); }
  if (o.type === 'taper') { posNum('d1', 'Başlangıç çapı'); posNum('d2', 'Bitiş çapı'); if (!(o.z1 > o.z2)) E('Koni Z1, Z2\'den büyük olmalı'); }
  if (o.type === 'od_turn' || o.type === 'id_turn') { posNum('d', 'Hedef çap'); if (!(o.z2 < 0)) E('Bitiş Z negatif olmalı'); if (o.type === 'od_turn' && o.d >= job.stock.d) E('Hedef çap ham çaptan küçük olmalı'); }
  if (o.type === 'profile' && !(o.passes >= 1 && o.passes <= 50)) E('Paso sayısı 1–50');
  if (o.css && M && !M.caps.css) W('Kumanda sabit kesme hızı (G96) desteklemiyor: G97 ile hesaplanan devir kullanılır');
  return out;
}

/* ===================== takım yolu ===================== */
// Hareket: { g: 0|1|2|3|32, p: [z, r] (referans nokta, bitiş), R, cw, f (mm/dev), op, tool, thread?: { cyc } }
// Takım referans noktası ↔ uç merkezi: P = C + tv(tool)
export function tipVec(t) { const r = t.rn || 0; return t.type === 'id' ? [-r, r] : t.type === 'thread' ? [0, t.ext === false ? r : -r] : ['od', 'face'].includes(t.type) ? [-r, -r] : [0, 0]; }
function rpmFor(o, d, M) { if (o.rpm > 0 && !o.css) return clamp(o.rpm, M.minRpm, M.maxRpm); const n = (1000 * (o.vc || 100)) / (Math.PI * Math.max(d, 1)); return clamp(n, M.minRpm, M.maxRpm); }

export function planLathe(job) {
  const issues = validateJob(job), errs = issues.filter((x) => x.level === 'hata');
  if (errs.length) return { ok: false, issues, moves: [], ops: [] };
  const M = LATHE_MACHINES[job.mk], G = partGeometry(job), S = job.stock, Rs = S.d / 2, safe = job.safe ?? 2, ret = job.retract ?? 1;
  const moves = [], ops = [];
  let cur = null;
  try {
  const push = (m) => { moves.push(m); cur = m.p; };
  const rHome = M.xMax / 2;
  push({ g: 0, p: [M.zMax, rHome], home: 'start', op: -1, tool: null });
  job.ops.forEach((o, oi) => {
    if (o.on === false) return;
    const t = opTool(job, o), tv = tipVec(t), i0 = moves.length, notes = [];
    // takım değişimi: önce X referansa (G28 U0.), sonra Z ile ilk noktanın hizasına, sonra X ile ilk noktaya
    push({ g: 0, p: [cur[0], rHome], home: 'U', op: oi, tool: t.id }); push({ g: 0, p: [NaN, rHome], op: oi, tool: t.id, zOnly: true });
    const C2P = (c) => add(c, tv);   // uç merkezi → referans
    const rap = (p) => push({ g: 0, p, op: oi, tool: t.id });
    const lin = (p, f = o.f) => push({ g: 1, p, f, op: oi, tool: t.id });
    const zSafe = S.face + safe, xSafe = Rs + safe;   // yarıçap
    switch (o.type) {
      case 'face': {
        // ön fazla: S.face → 0, her paso ap; uç merkezinin ön noktası (z − rn) yüze değer; merkez (r = 0) geçilir
        const rn = t.rn, n = Math.max(1, Math.ceil(S.face / o.ap - 1e-9));
        for (let k = 1; k <= n; k++) {
          const zf = Math.max(0, S.face - (k * S.face) / n), cz = zf + rn;
          rap(C2P([zSafe + rn, xSafe + rn])); rap(C2P([cz, xSafe + rn])); lin(C2P([cz, 0]));
          lin(C2P([cz + ret, ret])); rap(C2P([zSafe + rn, ret])); rap(C2P([zSafe + rn, xSafe + rn]));
        }
        notes.push(`${n} paso, merkez geçilir (X ${fmt(2 * C2P([0, 0])[1])})`);
        break;
      }
      case 'od_turn': case 'id_turn': case 'taper': {
        // basit silindir / koni: hedef çizgi (z1,r1)→(z2,r2), sonuna ham yüzeyine dik çıkış
        const idS = o.type === 'id_turn', z1 = o.type === 'taper' ? o.z1 : 0, z2 = o.z2, r1 = o.type === 'taper' ? o.d1 / 2 : o.d / 2, r2 = o.type === 'taper' ? o.d2 / 2 : o.d / 2;
        const target = [{ t: 'L', a: [z1, r1], b: [z2, r2] }];
        // bitişte omuz (dış: hama kadar yukarı, iç: deliğe kadar aşağı): uç bu duvara girmez (iç köşe kesişimi)
        if (!idS) target.push({ t: 'L', a: [z2, r2], b: [z2, Rs + 5] }); else { const hr = holeRadiusBefore(job, oi); if (hr != null && hr < r2 - 1e-9) target.push({ t: 'L', a: [z2, r2], b: [z2, Math.max(0, hr - 5)] }); }
        const ap = o.ap, rn = t.rn;
        if (!idS) {
          const B = samplePath(offsetPath(target, rn, +1), 0.05);
          const rTop = Math.max(...B.map((p) => p[1])), levels = [];
          for (let r = Rs + rn - ap; r > Math.min(...B.map((p) => p[1])) + 1e-6; r -= ap) levels.push(r);
          levels.push(Math.min(...B.map((p) => p[1])));
          for (const rc of levels) {
            const zEnd = freeUntil(B, rc, +1, z1 + rn); if (zEnd == null) continue;
            const zs = Math.max(z1, 0) + rn + safe;
            rap(C2P([zs, rc + ret])); rap(C2P([zs, rc])); lin(C2P([zEnd, rc])); lin(C2P([zEnd + ret, rc + ret])); rap(C2P([zs, rc + ret]));
          }
          // son paso: hedef çizgi boyunca
          const Fz = offsetPath(target, rn, +1)[0];
          rap(C2P([Fz.a[0] + safe, Fz.a[1] + ret])); lin(C2P(Fz.a)); lin(C2P(Fz.b)); lin(C2P([Fz.b[0] + ret, Fz.b[1] + ret])); rap(C2P([Fz.b[0] + ret, xSafe + rn])); rap(C2P([zSafe + rn, xSafe + rn]));
          notes.push(`${levels.length} kaba paso + 1 son paso${rTop > Rs ? ' (hedef ham yüzeyinin üstünde: kesim yok)' : ''}`);
        } else {
          const hole = holeRadiusBefore(job, oi), B = samplePath(offsetPath(target, rn, -1), 0.05), rMax = Math.max(...B.map((p) => p[1]));
          if (hole == null) throw new Error(`${oi + 1}. operasyon: iç çap için önce delik (matkap ya da boru ham) gerekli`);
          for (let rc = hole - rn + ap; rc < rMax; rc += ap) { const zEnd = freeUntil(B, rc, -1, z1 + rn); if (zEnd == null) continue; rap(C2P([zSafe + rn, rc - ret])); rap(C2P([z1 + rn + safe, rc])); lin(C2P([zEnd, rc])); lin(C2P([zEnd + ret, rc - ret])); rap(C2P([zSafe + rn, rc - ret])); }
          const Fz = offsetPath(target, rn, -1)[0];
          rap(C2P([zSafe + rn, Fz.a[1] - ret])); rap(C2P([Fz.a[0] + safe, Fz.a[1]])); lin(C2P(Fz.a)); lin(C2P(Fz.b)); lin(C2P([Fz.b[0] + ret, Fz.b[1] - ret])); rap(C2P([zSafe + rn, Fz.b[1] - ret]));
        }
        break;
      }
      case 'rough': {
        const idS = o.side === 'id', side = idS ? -1 : 1, rn = t.rn, els = idS ? clipBore(G.id, t, notes) : G.odE;
        const Bel = offsetPath(els, rn + (o.allow || 0), side), B = samplePath(Bel, 0.05);
        if (!idS) {
          const rMin = Math.min(...B.map((p) => p[1])), levels = [];
          for (let rc = Rs + rn - o.ap; rc > rMin + 1e-6; rc -= o.ap) levels.push(rc);
          if (!levels.length || levels[levels.length - 1] - rMin > 1e-6) levels.push(rMin + 1e-6);
          let n = 0;
          for (const rc of levels) {
            const zEnd = freeUntil(B, rc, +1, rn + 1e-6); if (zEnd == null || zEnd > rn - 1e-6) continue;
            const zs = rn + safe; n++;
            rap(C2P([zs, rc + ret])); rap(C2P([zs, rc])); lin(C2P([zEnd, rc])); lin(C2P([zEnd + ret, rc + ret])); rap(C2P([zs, rc + ret]));
          }
          // kademe temizleme: önden ulaşılan sınır boyunca yarı finiş
          const reach = reachable(B, +1, rn);
          if (reach.length > 1) { rap(C2P([reach[0][0] + safe, reach[0][1] + ret])); lin(C2P(reach[0])); for (const p of reach.slice(1)) lin(C2P(p)); lin(C2P([reach[reach.length - 1][0], Rs + rn + ret])); }
          rap(C2P([zSafe + rn, xSafe + rn]));
          notes.push(`${n} kaba paso + profil temizleme; pay ${o.allow} mm`);
          let run = -Infinity, pocket = false; for (const p of B) { if (p[0] > rn) continue; if (p[1] < run - 0.05) pocket = true; run = Math.max(run, p[1]); }
          if (pocket) notes.push('Profilde önden ulaşılamayan cep var (ör. kanal): kanal / profil operasyonu gerekir');
        } else {
          const hole = holeRadiusBefore(job, oi); if (hole == null) throw new Error(`${oi + 1}. operasyon: iç çap için önce delik (matkap ya da boru ham) gerekli`);
          const rMax = Math.max(...B.map((p) => p[1])), levels = [];
          for (let rc = hole - rn + o.ap; rc < rMax - 1e-6; rc += o.ap) levels.push(rc);
          levels.push(rMax - 1e-6);
          let n = 0;
          for (const rc of levels) {
            const zEnd = freeUntil(B, rc, -1, rn + 1e-6); if (zEnd == null || zEnd > rn - 1e-6) continue; n++;
            rap(C2P([zSafe + rn, rc - ret])); rap(C2P([rn + safe, rc])); lin(C2P([zEnd, rc])); lin(C2P([zEnd + ret, rc - ret])); rap(C2P([zSafe + rn, rc - ret]));
          }
          const reach = reachable(B, -1, rn);
          if (reach.length > 1) { rap(C2P([reach[0][0] + safe, reach[0][1] - ret])); lin(C2P(reach[0])); for (const p of reach.slice(1)) lin(C2P(p)); lin(C2P([reach[reach.length - 1][0] + ret, Math.max(0, reach[reach.length - 1][1] - ret)])); }
          rap(C2P([zSafe + rn, Math.max(0, (hole - rn) - ret)]));
          notes.push(`${n} kaba paso + profil temizleme; pay ${o.allow} mm`);
        }
        break;
      }
      case 'finish': case 'profile': {
        const idS = o.side === 'id', side = idS ? -1 : 1, rn = t.rn, base = idS ? clipBore(G.id, t, notes) : G.odE;
        const maxPl = Math.max(0, (t.kr2 || 0) - 2);   // iz kenarı açısı − 2° pay
        const K = bridgeContour(base, side, maxPl, o.allow || 0);   // önden ulaşılabilir kontur (uç merkez yolu değil, profil seviyesinde)
        if (K.bridged.length) notes.push(`Takımın iniş açısı (en çok ${fmt(maxPl)}°) yetmeyen ${K.bridged.length} bölge köprülendi: ${K.bridged.map((b) => `Z ${fmt(b[0])}…${fmt(b[1])}`).join(', ')} — kanal operasyonu gerekir`);
        const Cp = offsetPath(K.els, rn, side);   // uç merkez yolu
        const passes = o.type === 'profile' ? Math.max(1, o.passes | 0) : 1, compPasses = [];
        const stockDepth = o.type === 'profile' ? Math.max(0, ...samplePath(Cp, 0.2).map((p) => (idS ? p[1] - (holeRadiusBefore(job, oi) ?? p[1]) : Rs + rn - p[1]))) : 0;
        for (let k = passes; k >= 1; k--) {
          const dd = o.type === 'profile' ? (stockDepth * (k - 1)) / passes : 0;
          // G73 gibi: son kontur radyal yönde dd kadar KAYDIRILIR (ofset değil: büyük ofset iç köşelerde kendini keser)
          const path = dd > 1e-9 ? Cp.map((e) => { const sh = (p) => [p[0], p[1] + side * dd]; return { ...e, a: sh(e.a), b: sh(e.b), ...(e.c ? { c: sh(e.c) } : {}) }; }) : Cp;
          const st = path[0].a, en = path[path.length - 1].b;
          if (!idS) rap(C2P([st[0] + safe, st[1] + ret]));
          else { rap(C2P([zSafe + rn, st[1] - ret])); rap(C2P([st[0] + safe, st[1]])); }
          const ia = moves.length; lin(C2P(st));
          for (const e of path) { if (e.t === 'L') lin(C2P(e.b)); else push({ g: e.cw ? 2 : 3, p: C2P(e.b), R: e.R, cw: e.cw, c: C2P(e.c), f: o.f, op: oi, tool: t.id }); }
          compPasses.push({ ia, ib: moves.length, contour: dd > 1e-9 ? K.els.map((e) => { const sh = (p) => [p[0], p[1] + side * dd]; return { ...e, a: sh(e.a), b: sh(e.b), ...(e.c ? { c: sh(e.c) } : {}) }; }) : K.els });
          if (!idS) { lin(C2P([en[0], Math.max(en[1], Rs) + rn + ret])); rap(C2P([zSafe + rn, Math.max(en[1], Rs) + rn + ret])); }
          else { lin(C2P([en[0] + ret, en[1] - ret])); rap(C2P([zSafe + rn, en[1] - ret])); }
        }
        // yüzey pürüzlülüğü (kuramsal): Rt = f² / (8 rn)
        if (rn > 0) notes.push(`Kuramsal pürüz Rt ≈ ${fmt((o.f * o.f) / (8 * rn) * 1000)} µm (f ${o.f}, rn ${rn})`);
        if (o.comp === 'control') notes.push('Takım ucu telafisi kumandada (G41/G42): G-kodu parça konturunu programlar; ofset sayfasına uç yarıçapı ve sanal uç no ' + tipNumber(t) + ' girilmeli');
        ops.push({ partial: true, comp: o.comp, contour: K.els, compPasses });
        break;
      }
      case 'groove': {
        // takım referansı: aynaya bakan köşe (en küçük z), dip (en küçük r). Kanal ön duvarı o.z, arka duvarı o.z − width.
        const w = t.w, zA = o.z - o.width, zB = o.z - w, rB = o.bottomD / 2, top = Math.max(grooveTop(job, o), rB);
        const rTop = Math.min(Rs, top) + safe, n = Math.max(1, Math.ceil((zB - zA) / (w * 0.8) - 1e-9));
        const zs = []; for (let k = 0; k <= n; k++) zs.push(zA + ((zB - zA) * k) / n);
        const uniq = [...new Set(zs.map((z) => +z.toFixed(6)))];
        rap([zSafe, Rs + safe]); rap([uniq[0], Rs + safe]);
        for (const z of uniq) {
          rap([z, rTop]);
          // gagalama: peck kadar in, 0,5 mm geri çık
          let r = rTop; const pk = o.peck > 0 ? o.peck : rTop - rB;
          while (r - rB > 1e-9) { const nr = Math.max(rB, r - pk); lin([z, nr]); r = nr; if (r - rB > 1e-9) { rap([z, r + 0.5]); moves[moves.length - 1].re = true; } }
          rap([z, rTop]);
        }
        // son paso: dip boyunca
        rap([uniq[0], rTop]); lin([uniq[0], rB]); lin([uniq[uniq.length - 1], rB]); rap([uniq[uniq.length - 1], rTop]); rap([uniq[uniq.length - 1], Rs + safe]);
        notes.push(`${uniq.length} dalma, kanal Z ${fmt(o.z)}…${fmt(zA)}, dip Ø${fmt(o.bottomD)}`);
        break;
      }
      case 'part': {
        const zRef = o.z - t.w, rEnd = (o.endD || 0) / 2 - (o.endD > 0 ? 0 : 0.2);
        rap([zSafe, Rs + safe]); rap([zRef, Rs + safe]);
        let r = Rs + safe; const pk = o.peck > 0 ? o.peck : r - rEnd;
        while (r - rEnd > 1e-9) { const nr = Math.max(rEnd, r - pk); lin([zRef, nr], nr < 3 ? o.f * 0.5 : o.f); r = nr; if (r - rEnd > 1e-9) { rap([zRef, r + 0.3]); moves[moves.length - 1].re = true; } }
        rap([zRef, Rs + safe]);
        notes.push(`Kesme Z ${fmt(o.z)} (takım köşesi Z ${fmt(zRef)}), merkeze yakın ilerleme yarıya iner`);
        break;
      }
      case 'drill': {
        const tipLen = (o.d / 2) / Math.tan((t.ang / 2) * D2R), zEnd = -o.depth - tipLen, pk = o.peck > 0 ? o.peck : o.depth + tipLen;
        rap([zSafe + 5, 0]); rap([S.face + safe, 0]);
        let z = Math.min(S.face, 0) + 0;
        while (z - zEnd > 1e-9) { const nz = Math.max(zEnd, z - pk); lin([nz, 0]); z = nz; if (z - zEnd > 1e-9) { rap([S.face + safe, 0]); rap([z + 0.5, 0]); moves[moves.length - 1].re = true; } }
        rap([zSafe + 5, 0]);
        notes.push(`Uç derinliği Z ${fmt(zEnd)} (tam çap derinliği ${o.depth} + uç ${fmt(tipLen)})`);
        break;
      }
      case 'thread': {
        const P = threadPasses(o, t);
        const ext = o.side !== 'id', rStart = ext ? o.d / 2 + 1 : (o.d / 2 - P.k) - 1;
        rap([o.z1 + safe, rStart]);
        for (const ps of P.passes) {
          rap([o.z1 + ps.dz, rStart]); rap([o.z1 + ps.dz, ps.r]);
          push({ g: 32, p: [o.z2 + ps.dz, ps.r], f: o.pitch, op: oi, tool: t.id, thread: { n: ps.n } });
          rap([o.z2 + ps.dz, rStart]);
        }
        rap([o.z1, rStart]);   // G76 çevrimi başlangıç noktasına döner
        rap([o.z1 + safe, rStart]);
        notes.push(`${P.passes.length} paso (son ${o.spring | 0} boş paso), diş yüksekliği ${fmt(P.k)} mm, ${ext ? 'dip çapı' : 'diş dibi'} Ø${fmt(2 * P.rRoot)}`);
        ops.push({ partial: true, thread: P });
        break;
      }
      default: throw new Error('Operasyon desteklenmiyor: ' + o.type);
    }
    if (moves.length > i0 + 2) moves[i0 + 1].p[0] = moves[i0 + 2].p[0]; else moves.splice(i0, 2);
    const op = ops.length && ops[ops.length - 1].partial ? ops.pop() : {}; delete op.partial;
    ops.push({ ...op, idx: oi, type: o.type, name: OP_NAMES_L[o.type], tool: t.id, i0, i1: moves.length, notes });
  });
  push({ g: 0, p: [cur[0], rHome], home: 'U', op: -1, tool: null }); push({ g: 0, p: [M.zMax, rHome], home: 'W', op: -1, tool: null });
  } catch (e) { issues.push({ level: 'hata', where: 'Takım yolu', msg: e.message }); return { ok: false, issues, moves: [], ops: [] }; }
  // makine X / Z sınırları ve merkez geçişi
  for (let i = 0; i < moves.length; i++) {
    const m = moves[i], X = 2 * m.p[1], t = m.tool != null ? job.tools.find((q) => q.id === m.tool) : null;
    if (X < M.xMin - 1e-6 || X > M.xMax + 1e-6) issues.push({ level: 'hata', where: `Hareket ${i + 1}`, msg: `X ${fmt(X)} makine sınırı (${M.xMin}…${M.xMax}) dışında` });
    if (m.p[0] < M.zMin - 1e-6 || m.p[0] > M.zMax + 1e-6) issues.push({ level: 'hata', where: `Hareket ${i + 1}`, msg: `Z ${fmt(m.p[0])} makine sınırı (${M.zMin}…${M.zMax}) dışında` });
    if (t && ['od', 'face', 'groove', 'part', 'thread'].includes(t.type) && m.p[1] < -(t.rn || 0) - 0.25 - 1e-6) issues.push({ level: 'hata', where: `Hareket ${i + 1}`, msg: `X ${fmt(X)}: dış takım eksen merkezini ${fmt(-m.p[1])} mm geçiyor (ters kesim)` });
  }
  return { ok: true, issues, moves, ops, job };
}
// z yönünde (önden, −z) giderken sınırın serbest bıraktığı en uzak z (dış: B(z) < rc; iç: B(z) > rc)
function freeUntil(B, rc, side, zStart) {
  let last = null;
  for (let i = 0; i < B.length; i++) {
    const p = B[i]; if (p[0] > zStart) continue;
    const blocked = side > 0 ? p[1] >= rc - 1e-9 : p[1] <= rc + 1e-9;
    if (blocked) {
      if (i === 0 || last == null) return null;
      const q = B[i - 1]; if (Math.abs(p[1] - q[1]) < 1e-12) return q[0];
      const tt = (rc - q[1]) / (p[1] - q[1]); return q[0] + (p[0] - q[0]) * clamp(tt, 0, 1);
    }
    last = p[0];
  }
  return last;
}
// önden ulaşılan sınır (dış: aynaya doğru iniş yok — ilk yükselişten sonra inen yer "cep")
function reachable(B, side, zMax) {
  const o = []; let best = null;
  for (const p of B) { if (p[0] > zMax + 1e-9) continue; const v = side > 0 ? p[1] : -p[1]; if (best == null || v >= best - 1e-9) { best = best == null ? v : Math.max(best, v); o.push(p); } else { o.push([p[0], side > 0 ? best : -best]); } }
  // eşdoğrusal sadeleştir
  const s = [o[0]]; for (let i = 1; i < o.length - 1; i++) { const a = s[s.length - 1], b = o[i], c = o[i + 1]; if (Math.abs(cross(sub(b, a), sub(c, b))) > 1e-9) s.push(b); } if (o.length > 1) s.push(o[o.length - 1]);
  return s;
}
// Bitiş konturu: profil (+pay) ofseti, takımın iniş açısını aşan inişler köprülenir (önden ulaşılabilir zarf)
export function bridgeContour(els, side, maxPlungeDeg, allow = 0) {
  const base = allow > 0 ? offsetPath(els, allow, side) : els;
  const tanA = Math.tan(clamp(maxPlungeDeg, 0, 89.9) * D2R), bridged = [];
  const out = []; let i = 0;
  const pts = (e) => sampleElem(e, 0.05);
  // her eleman için: iniş (dış: r azalır −z giderken) eğimi maxPlunge'dan dikse → köprü
  while (i < base.length) {
    const e = base[i];
    const desc = (() => { const P = pts(e); for (let k = 1; k < P.length; k++) { const dz = P[k - 1][0] - P[k][0], dr = side > 0 ? P[k - 1][1] - P[k][1] : P[k][1] - P[k - 1][1]; if (dr > 1e-9 && Math.atan2(dr, Math.max(dz, 0)) > Math.atan(tanA) + 1e-6) return true; } return false; })();
    if (!desc) { out.push(e); i++; continue; }
    // köprü başlangıcı e.a; inen eğim çizgisi (maxPlunge) ile sonraki profil kesişimine kadar: ilk yeniden ulaşılan nokta
    const A = e.a, all = []; for (let j = i; j < base.length; j++) all.push(...pts(base[j]).map((p) => ({ p, j })));
    let hit = null;
    // G70 tip I gibi: dik inişte A seviyesinde yatay köprü, profil bu seviyeye yeniden çıkana kadar
    for (let k = 1; k < all.length; k++) { const p = all[k].p, lineR = A[1]; const above = side > 0 ? p[1] >= lineR - 1e-9 : p[1] <= lineR + 1e-9; if (above && A[0] - p[0] > 1e-6) { hit = all[k]; break; } }
    if (!hit) { const L = all[all.length - 1].p; out.push({ t: 'L', a: A, b: [L[0], A[1]] }); bridged.push([A[0], L[0]]); break; }
    // köprü: A → hit.p (doğru), sonra hit elemanının kalan kısmı
    out.push({ t: 'L', a: A, b: hit.p.slice() }); bridged.push([A[0], hit.p[0]]);
    const he = base[hit.j], rest = splitAt(he, hit.p);
    if (rest) out.push(rest);
    i = hit.j + 1;
  }
  return { els: out, bridged };
}
function splitAt(e, p) { if (dist(p, e.b) < 1e-7) return null; return e.t === 'L' ? { ...e, a: p.slice() } : { ...e, a: p.slice() }; }
// iç profil: baranın girebileceği bölge (r ≥ en küçük delik / 2); daha dar yer (ör. matkap ucu konisi) işlenmez
function clipBore(els, t, notes) {
  const rMin = (t.minBore || 0) / 2, out = [];
  for (const e of els) {
    const P = sampleElem(e, 0.02), k = P.findIndex((p) => p[1] < rMin - 1e-9);
    if (k < 0) { out.push(e); continue; }
    if (k > 0) { const q = P[k - 1]; out.push(e.t === 'L' ? { t: 'L', a: e.a, b: q } : { ...e, b: q }); }
    notes.push(`Bara (en küçük delik Ø${fmt(2 * rMin)}) Z ${fmt(P[k][0])}'den derine giremez: kalan bölge işlenmez`);
    break;
  }
  if (!out.length) throw new Error('Bara bu deliğe girmiyor (en küçük delik çapı)');
  return out;
}
// operasyon öncesindeki delik yarıçapı (matkap / boru / önceki iç işlemler); yoksa null
function holeRadiusBefore(job, oi) {
  let r = job.stock.bore ? job.stock.bore / 2 : null;
  for (let k = 0; k < oi; k++) { const o = job.ops[k]; if (o.on === false) continue; if (o.type === 'drill') r = Math.max(r ?? 0, o.d / 2); if (o.type === 'id_turn') r = Math.max(r ?? 0, o.d / 2); }
  return r;
}
// Fanuc G76 paso derinlikleri: n. paso toplam derinlik Δd·√n (artış en az Δdmin), son d payı, sonra (m) bitiş pasosu.
// Dış vida diş yüksekliği k = 0,61343·P (ISO metrik, dış), iç: 0,54127·P. Yanal besleme: her pasoda z kayması = derinlik·tan(açı/2) (infeed açısı).
export function threadPasses(o, t) {
  const ext = o.side !== 'id', k = (ext ? 0.61343 : 0.54127) * o.pitch, d = Math.max(0, o.fin || 0), dmin = Math.max(0.001, o.min || 0.05), first = o.first;
  const rMaj = o.d / 2, rRoot = ext ? rMaj - k : rMaj, rCrest = ext ? rMaj : rMaj - k;
  const depths = []; let n = 1, prev = 0;
  while (true) { let dep = first * Math.sqrt(n); if (dep - prev < dmin) dep = prev + dmin; if (dep >= k - d - 1e-9) break; depths.push(dep); prev = dep; n++; if (n > 200) break; }
  depths.push(k - d); depths.push(k);
  for (let s = 0; s < (o.spring | 0); s++) depths.push(k);
  const tanH = Math.tan(((o.infeed ?? 0) / 2) * D2R);
  const passes = depths.map((dep, i) => ({ n: i + 1, depth: dep, r: ext ? rCrest - dep : rCrest + dep, dz: -0 + (o.infeed ? dep * tanH * 0 : 0) }));
  // not: yanal besleme kayması (Fanuc G76 a parametresi) kumandada uygulanır; G32 çıktısında radyal besleme kullanılır
  return { k, rRoot, rCrest, rMaj, passes, depths, ext, a: t.ang || 60 };
}

/* ===================== simülasyon (eksenel simetrik ızgara) ===================== */
// hücre: 0 boş, 1 malzeme, 2 diş bölgesi (helisel oluk: eksenel simetrik modelde ayrı işaretlenir)
export function simGrid(job, res = 0.1) {
  const S = job.stock, Rs = S.d / 2, z0 = S.face - S.len, z1 = S.face;
  const nz = Math.ceil((z1 - z0) / res), nr = Math.ceil((Rs + 0.0001) / res);
  const g = new Uint8Array(nz * nr), rb = S.bore ? S.bore / 2 : 0;
  for (let j = 0; j < nz; j++) for (let i = 0; i < nr; i++) { const r = (i + 0.5) * res; if (r <= Rs + 1e-9 && r >= rb - 1e-9) g[j * nr + i] = 1; }
  return { g, nz, nr, res, z0, z1, Rs };
}
// takım biçimi (referans noktasına göre çokgen, [dz, dr]); kesen bölge
export function toolShape(t, len = 4) {
  const out = [], circ = (c, r, a0, a1, n = 10) => { for (let k = 0; k <= n; k++) { const a = a0 + ((a1 - a0) * k) / n; out.push([c[0] + r * Math.cos(a), c[1] + r * Math.sin(a)]); } };
  const rn = Math.max(0.02, t.rn || 0);
  if (t.type === 'od' || t.type === 'face' || t.type === 'id') {
    const up = t.type === 'id' ? -1 : 1, C = [rn, up * rn], L = Math.min(len, t.edge || len);
    // ön kenar (aynaya bakan): yaklaşma açısı kr → kenar yukarı, (kr−90)° +z'ye eğik; iz kenarı +z yönünde kr2 kadar yukarı
    const lead = [Math.sin((t.kr - 90) * D2R), up * Math.cos((t.kr - 90) * D2R)], trail = [Math.cos(t.kr2 * D2R), up * Math.sin(t.kr2 * D2R)];
    const nl = up > 0 ? [-lead[1], lead[0]] : [lead[1], -lead[0]], nt = up > 0 ? [trail[1], -trail[0]] : [-trail[1], trail[0]];
    const aL = Math.atan2(nl[1], nl[0]), aT = Math.atan2(nt[1], nt[0]);
    let a0 = aL, a1 = aT; if (up > 0) { while (a1 < a0) a1 += 2 * Math.PI; } else { while (a1 > a0) a1 -= 2 * Math.PI; }   // dış takım: uç yayı alttan; iç takım: üstten
    out.push(add(add(C, mul(nl, rn)), mul(lead, L)));
    circ(C, rn, a0, a1, 12);
    out.push(add(add(C, mul(nt, rn)), mul(trail, L)));
    return out;
  }
  if (t.type === 'groove' || t.type === 'part') { const w = t.w, h = Math.min(len * 2, t.reach || 8); out.push([0, h]); circ([rn, rn], rn, Math.PI, 1.5 * Math.PI, 6); circ([w - rn, rn], rn, 1.5 * Math.PI, 2 * Math.PI, 6); out.push([w, h]); return out; }
  if (t.type === 'thread') { const H = 2.5, w = H * Math.tan((t.ang / 2) * D2R), s = t.ext === false ? -1 : 1; out.push([-w, s * H], [0, 0], [w, s * H]); return out; }
  if (t.type === 'drill') { const r = t.d / 2, tl = r / Math.tan((t.ang / 2) * D2R); out.push([0, 0], [tl, r], [tl + (t.reach || 50), r], [tl + (t.reach || 50), -r], [tl, -r]); return out; }
  return [[0, 0]];
}
// tutucu (kesmeyen) bölge: dış takım: uçtan +r yönüne uzanan sap (genişlik hw, +z tarafında); kanal / kesme: bıçak üstü (erişim üstü)
export function holderZone(t) {
  if (['od', 'face', 'thread'].includes(t.type)) return { kind: 'up', z0: 1.5, z1: 1.5 + (t.hw || 25), r0: Math.max(8, (t.edge || 0) * 0.9) };   // kesici uç yüksekliği üstünde tutucu başı
  if (t.type === 'groove' || t.type === 'part') return { kind: 'up', z0: -0.5, z1: t.w + 0.5, r0: t.reach || 8 };
  if (t.type === 'id') return { kind: 'bar', minR: (t.bar || 10) / 2, z0: (t.edge || 6) * 0.6 };
  return null;
}
// çokgen → hücre maskesi (referans hücresine göre (dj, di) listesi)
function shapeMask(poly, res) {
  const zs = poly.map((p) => p[0]), rs = poly.map((p) => p[1]);
  const j0 = Math.floor(Math.min(...zs) / res) - 1, j1 = Math.ceil(Math.max(...zs) / res) + 1, i0 = Math.floor(Math.min(...rs) / res) - 1, i1 = Math.ceil(Math.max(...rs) / res) + 1, m = [];
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) if (inPoly(poly, [(j + 0.5) * res, (i + 0.5) * res])) m.push(j, i);
  return Int32Array.from(m);
}
function inPoly(poly, p) { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const a = poly[i], b = poly[j]; if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0]) c = !c; } return c; }

// Simülasyon durumu: hareket hareket ilerletilebilir (arayüz oynatması); bitince denetim raporu
export function createSim(R, opt = {}) {
  const job = R.job, res = opt.res || 0.1, SG = simGrid(job, res), M = LATHE_MACHINES[job.mk], ch = job.chuck || {};
  const masks = new Map(), shapes = new Map();
  for (const t of job.tools) { const sh = toolShape(t); shapes.set(t.id, sh); masks.set(t.id, shapeMask(sh, res)); }
  const events = [], seen = new Set(), ev = (level, kind, msg, i) => { const k = kind + '|' + (R.moves[i]?.op ?? '') + '|' + msg.slice(0, 40); if (seen.has(k)) return; seen.add(k); events.push({ level, kind, msg, move: i, op: R.moves[i]?.op }); };
  const zChuck = -job.stock.stickout, threadZones = [];
  const st = { i: 0, removed: 0, prev: R.moves.length ? R.moves[0].p.slice() : [0, 0] };
  const cellZ = (j) => SG.z0 + (j + 0.5) * res;
  function stamp(t, p, cut, i, thread = false) {
    const m = masks.get(t.id), J = Math.round((p[0] - SG.z0) / res), I = Math.round(p[1] / res);   // en yakın ızgara köşesi: sapma ±res/2, yanlı değil
    let hit = 0;
    for (let k = 0; k < m.length; k += 2) {
      const j = J + m[k], ii = I + m[k + 1]; if (j < 0 || j >= SG.nz) continue;
      // eksenin altına taşan hücreler: eksenel simetri — aynı yarıçapın karşı tarafı
      const ia = ii < 0 ? -ii - 1 : ii; if (ia >= SG.nr) continue;
      const q = j * SG.nr + ia; if (SG.g[q] === 1) { hit++; if (thread) SG.g[q] = 2; else if (cut) { SG.g[q] = 0; st.removed++; } }
    }
    return hit;
  }
  function holderHit(t, p) {
    const hz = holderZone(t); if (!hz) return false;
    if (hz.kind === 'up') {
      const j0 = Math.max(0, Math.floor((p[0] + hz.z0 - SG.z0) / res)), j1 = Math.min(SG.nz - 1, Math.floor((p[0] + hz.z1 - SG.z0) / res)), i0 = Math.max(0, Math.ceil((p[1] + hz.r0) / res));
      for (let j = j0; j <= j1; j++) for (let i = i0; i < SG.nr; i++) if (SG.g[j * SG.nr + i] === 1) return true;
      return false;
    }
    if (hz.kind === 'bar') {   // bara: uçtan +z yönünde, eksene göre en az minR yarıçaplı silindir — bu yarıçap içinde malzeme olmamalı
      const j0 = Math.max(0, Math.floor((p[0] + hz.z0 - SG.z0) / res)), iMax = Math.min(SG.nr, Math.ceil(hz.minR / res));
      for (let j = j0; j < SG.nz; j++) for (let i = 0; i < iMax; i++) if (SG.g[j * SG.nr + i] === 1) return true;
      return false;
    }
    return false;
  }
  function chuckHit(t, p) {
    // ayna çenesi: z ≤ −çıkış, r ≤ çene çapı/2; ayna gövdesi: z ≤ −çıkış − çene boyu, r ≤ gövde çapı/2. Takım biçimi + tutucu kaba kutusu.
    const sh = shapes.get(t.id); let zmin = Infinity, rmin = Infinity;
    for (const q of sh) { zmin = Math.min(zmin, p[0] + q[0]); rmin = Math.min(rmin, Math.abs(p[1] + q[1])); }
    if (zmin <= zChuck + 1e-9 && rmin <= (ch.jawD || 0) / 2) return 'ayna çenesi';
    if (zmin <= zChuck - (ch.jawLen || 0) + 1e-9 && rmin <= (ch.bodyD || 0) / 2) return 'ayna gövdesi / fener mili';
    return null;
  }
  function step(budget = Infinity) {
    let n = 0;
    while (st.i < R.moves.length && n < budget) {
      const i = st.i, m = R.moves[i], a = st.prev, b = m.p;
      const t = m.tool != null ? job.tools.find((q) => q.id === m.tool) : (R.moves[i - 1] && job.tools.find((q) => q.id === R.moves[i - 1].tool));
      if (!t) { st.prev = b; st.i++; n++; continue; }
      const pts = m.g === 2 || m.g === 3 ? arcPts(a, b, m.c, m.cw, res / 3) : linePts(a, b, res / 2);
      const cut = m.g !== 0 && m.g !== 32;
      for (const p of pts) {
        const h = stamp(t, p, cut, i, m.g === 32);
        if (m.g === 0 && h > 0) ev('hata', 'çarpışma', `Hızlı harekette (G00) ${TOOL_TYPES_L[t.type].toLowerCase()} malzemeye çarpıyor (Z ${fmt(p[0])}, X ${fmt(2 * p[1])})`, i);
        if (holderHit(t, p)) ev('hata', 'tutucu', `Takım tutucu / gövdesi malzemeye çarpıyor (T${t.n}, Z ${fmt(p[0])}, X ${fmt(2 * p[1])})`, i);
        const c = chuckHit(t, p); if (c) ev('hata', 'ayna', `Takım ${c} bölgesine giriyor (Z ${fmt(p[0])}, X ${fmt(2 * p[1])})`, i);
      }
      const nx = R.moves[i + 1], pv = R.moves[i - 1];
      if (m.g === 0 && !m.re && st.i > 0 && nx && nx.g !== 0 && nx.op === m.op && pv && pv.g === 0) { const near = safeNear(t, b); if (near) ev('uyarı', 'güvenli mesafe', `Hızlı hareket malzemeye ${fmt(near)} mm'den yakın bitiyor (güvenli mesafe ${job.safe ?? 2} mm)`, i); }
      if (m.g === 32) { const tz = [Math.min(a[0], b[0]), Math.max(a[0], b[0])]; threadZones.push({ z0: tz[0], z1: tz[1], r: b[1], ext: t.ext !== false }); }
      st.prev = b; st.i++; n++;
    }
    return st.i >= R.moves.length;
  }
  function safeNear(t, p) {
    // hızlı hareketin bitiş noktasında takım ucu çevresinde (safe − 0,05 mm) malzeme var mı
    const s = Math.max(0, (job.safe ?? 2) - 0.25), m = masks.get(t.id), J = Math.round((p[0] - SG.z0) / res), I = Math.round(p[1] / res), k = Math.ceil(s / res);
    let best = null;
    for (let q = 0; q < m.length; q += 2) for (const [dj, di] of [[k, 0], [-k, 0], [0, k], [0, -k]]) { const j = J + m[q] + dj, ii = I + m[q + 1] + di, ia = ii < 0 ? -ii - 1 : ii; if (j < 0 || j >= SG.nz || ia >= SG.nr) continue; if (SG.g[j * SG.nr + ia] === 1) { best = s; break; } }
    return best;
  }
  return { SG, st, step, events, threadZones, shapes, get done() { return st.i >= R.moves.length; } };
}
function linePts(a, b, step) { const n = Math.max(1, Math.ceil(dist(a, b) / step)), o = []; for (let k = 1; k <= n; k++) o.push(add(a, mul(sub(b, a), k / n))); return o; }
function arcPts(a, b, c, cw, step) { const e = { t: 'A', a, b, c, R: dist(a, c), cw }; return sampleElem(e, step).slice(1); }

// Simülasyon sonucu ↔ hedef parça: kalan malzeme (hedef dışında kalan) ve fazla kesim (hedefe girme)
export function evaluateSim(R, sim) {
  const job = R.job, G = partGeometry(job), SG = sim.SG, res = SG.res, tol = 1.5 * res + 0.02, Lp = job.partLen;
  let residual = 0, gouge = 0; const resZ = [], gouZ = [];
  // her sütunda hedef dış / iç yarıçap; dik duvarlarda ızgara hatasını elemek için ±tol komşu sütunların en dar / en geniş değeri
  const ro = new Float64Array(SG.nz), ri = new Float64Array(SG.nz), has = new Uint8Array(SG.nz), kk = Math.ceil(tol / res);
  for (let j = 0; j < SG.nz; j++) { const z = SG.z0 + (j + 0.5) * res; if (z > 0 || z < -Lp) continue; const a = radiusAt(G.odE, z, 'min'); if (a == null) continue; has[j] = 1; ro[j] = a; ri[j] = G.id.length ? (radiusAt(G.id, z, 'max') ?? 0) : 0; }
  for (let j = 0; j < SG.nz; j++) {
    const z = SG.z0 + (j + 0.5) * res;
    if (z < -Lp - tol) continue;   // parça arkası: kalan çubuk (değerlendirme dışı)
    let roMin = Infinity, roMax = -Infinity, riMin = Infinity, riMax = -Infinity, all = true, any = false;
    for (let d = -kk; d <= kk; d++) { const q = j + d; if (q < 0 || q >= SG.nz || !has[q]) { all = false; continue; } any = true; roMin = Math.min(roMin, ro[q]); roMax = Math.max(roMax, ro[q]); riMin = Math.min(riMin, ri[q]); riMax = Math.max(riMax, ri[q]); }
    for (let i = 0; i < SG.nr; i++) {
      const r = (i + 0.5) * res, v = SG.g[j * SG.nr + i];
      if (v === 0 && all && r < roMin - tol && r > riMax + tol) { gouge++; gouZ.push(z); }
      if (v === 1 && z > -Lp + tol && (!any || r > roMax + tol || r < riMin - tol)) { residual++; resZ.push(z); }
    }
  }
  const cellA = res * res, ring = (z) => z;   // alan (mm², kesit) — hacim için 2πr ağırlığı ayrı hesaplanır
  const range = (a) => (a.length ? [Math.min(...a), Math.max(...a)] : null);
  return { residualArea: residual * cellA, gougeArea: gouge * cellA, residualZ: range(resZ), gougeZ: range(gouZ), tol, ring };
}
// simüle edilen sonuçtan dönel profil (r, z) çokgeni: OCCT doğrulaması ve 3B görüntü için
export function simProfile(sim, step = 1) {
  const SG = sim.SG, out = [], inner = [];
  for (let j = 0; j < SG.nz; j += step) {
    let top = -1, bot = -1;
    for (let i = SG.nr - 1; i >= 0; i--) if (SG.g[j * SG.nr + i]) { top = i; break; }
    for (let i = 0; i < SG.nr; i++) if (SG.g[j * SG.nr + i]) { bot = i; break; }
    const z = SG.z0 + (j + 0.5) * SG.res;
    out.push([z, top < 0 ? 0 : (top + 1) * SG.res]); inner.push([z, bot < 0 ? 0 : bot * SG.res]);
  }
  return { outer: out, inner };
}

// ızgaradaki malzeme hacmi (mm³): Σ 2π r · res² ; z aralığı verilebilir (diş bölgesi malzeme sayılır)
export function gridVolume(SG, zMin = -Infinity, zMax = Infinity) {
  let v = 0; const a = SG.res * SG.res * 2 * Math.PI;
  for (let j = 0; j < SG.nz; j++) { const z = SG.z0 + (j + 0.5) * SG.res; if (z < zMin || z > zMax) continue; for (let i = 0; i < SG.nr; i++) if (SG.g[j * SG.nr + i]) v += a * (i + 0.5) * SG.res; }
  return v;
}
// sütunun en dış / en iç malzeme yarıçapı (z'ye en yakın sütun); malzeme yoksa null
export function simRadiusAt(SG, z) {
  const j = Math.floor((z - SG.z0) / SG.res); if (j < 0 || j >= SG.nz) return null;
  let top = -1, bot = -1; for (let i = SG.nr - 1; i >= 0; i--) if (SG.g[j * SG.nr + i]) { top = i; break; } for (let i = 0; i < SG.nr; i++) if (SG.g[j * SG.nr + i]) { bot = i; break; }
  return top < 0 ? null : { outer: (top + 1) * SG.res, inner: bot * SG.res };
}

/* ===================== süre ===================== */
export function cycleTime(R) {
  const M = LATHE_MACHINES[R.job.mk]; let tCut = 0, tRap = 0, tChange = 0, prev = null, prevTool = null;
  for (const m of R.moves) {
    const o = R.job.ops[m.op];
    if (m.tool != null && m.tool !== prevTool) { tChange += 2; prevTool = m.tool; }   // taret dönüşü ~2 s (varsayım)
    if (prev) { const L = m.g === 2 || m.g === 3 ? Math.abs(sweep({ t: 'A', a: prev, b: m.p, c: m.c, R: dist(prev, m.c), cw: m.cw })) * dist(prev, m.c) : dist(prev, m.p);
      if (m.g === 0 || !o) tRap += (L / M.rapid) * 60;
      else { const d = 2 * Math.max(prev[1], m.p[1], 0.5), n = m.g === 32 || o.type === 'drill' ? clamp(o.rpm, M.minRpm, M.maxRpm) : rpmFor(o, d, M); tCut += (L / (m.f * n)) * 60; }
    }
    prev = m.p;
  }
  return { cut: tCut, rapid: tRap, change: tChange, total: tCut + tRap + tChange };
}

/* ===================== postprosesör ===================== */
export const LATHE_POSTS = {
  fanuc_t: { name: 'Fanuc 0i-T / 0i-TF (sistem A) ve uyumlular', ext: 'nc', g76: true, comp: true, css: true, g50: true },
  iso_t: { name: 'Basit ISO torna (G76 ve G41/G42 yok)', ext: 'nc', g76: false, comp: false, css: true, g50: true },
};
export function postLathe(R, opt = {}) {
  const job = R.job, M = LATHE_MACHINES[job.mk], P = LATHE_POSTS[opt.post || M.post] || LATHE_POSTS.fanuc_t, radius = job.xMode === 'radius';
  if (radius && !M.caps.radiusMode) throw new Error('Bu kumandada yarıçap programlama yok');
  const L = [], c = (t) => '(' + ascii(t).slice(0, 72) + ')';
  const X = (r) => 'X' + fmt(radius ? r : 2 * r), Z = (z) => 'Z' + fmt(z), F = (f) => 'F' + fmt(f);
  let n = 0; const out = (s) => { if (opt.lineNumbers && s && !/^[%(O]/.test(s)) { n += 10; L.push('N' + n + ' ' + s); } else L.push(s); };
  const used = [...new Set(R.moves.map((m) => m.tool).filter((x) => x != null))].map((id) => job.tools.find((t) => t.id === id));
  out('%'); out('O' + String(opt.program || 2001).padStart(4, '0') + ' ' + c(job.name || 'TORNA'));
  out(c('CIZIM ATOLYESI TORNA CAM ' + (opt.date || '')));
  out(c('MAKINE ' + M.name)); out(c('POST ' + P.name));
  out(c('X ' + (radius ? 'YARICAP' : 'CAP') + ' PROGRAMLAMA' + (radius ? ' - KUMANDA PARAMETRESI YARICAP OLMALI' : '')));
  out(c(`HAM D${fmt(job.stock.d)} L${fmt(job.stock.len)} ON FAZLA ${fmt(job.stock.face)} AYNADAN CIKIS ${fmt(job.stock.stickout)}`));
  out(c('SIFIR: PARCA ON YUZU MERKEZI Z0 X0 (G54)'));
  for (const t of used) out(c(`T${String(t.n).padStart(2, '0')}${String(t.off).padStart(2, '0')} ${TOOL_TYPES_L[t.type]} ${t.name || ''} R${fmt(t.rn || 0)} UC NO ${tipNumber(t)}`));
  out(c('DOGRULANMAMIS PROGRAM: KUMANDADA SIMULASYON VE TEK BLOK ILE DENE'));
  out((job.units === 'inch' ? 'G20' : 'G21') + ' G18 G40 G54 G99 G97');
  const ftype = job.units === 'inch' ? 1 / 25.4 : 1; if (ftype !== 1) throw new Error('İnç çıktı için koordinat dönüşümü bu sürümde yok: mm (G21) kullan');
  let lastTool = null;
  const homeOut = (m) => { if (m.home === 'start') { out('G28 U0.'); out('G28 W0.'); } else if (m.home === 'U') out('G28 U0.'); else if (m.home === 'W') out('G28 W0.'); };
  homeOut(R.moves[0]);
  R.ops.forEach((op) => {
    const o = job.ops[op.idx], t = job.tools.find((q) => q.id === op.tool), mv = R.moves.slice(op.i0, op.i1); if (!mv.length) return;
    out(c(`OP ${op.idx + 1} ${op.name}`));
    homeOut(mv[0]);
    if (lastTool !== t.id) { out(`T${String(t.n).padStart(2, '0')}${String(t.off).padStart(2, '0')} ${c(t.name || TOOL_TYPES_L[t.type])}`); lastTool = t.id; }
    const useCss = o.css && P.css && M.caps.css && !['drill', 'thread'].includes(o.type);
    if (useCss) { if (P.g50) out(`G50 S${Math.round(M.maxRpm)}`); out(`G96 S${Math.round(o.vc)} ${t.spin}`); }
    else { const rpm = o.rpm > 0 ? o.rpm : Math.round(rpmFor(o, job.stock.d, M)); out(`G97 S${Math.round(clamp(rpm, M.minRpm, M.maxRpm))} ${t.spin}`); }
    out('M08');
    out(`G00 ${Z(mv[1].p[0])}`);
    const first = mv[2]; out(`G00 ${X(first.p[1])} ${Z(first.p[0])}`);
    const isThreadCycle = o.type === 'thread' && o.method === 'G76' && P.g76 && M.caps.g76;
    if (isThreadCycle) {
      const T = R.ops.find((q) => q.idx === op.idx).thread, mm = String(Math.max(1, (o.spring | 0) + 1)).padStart(2, '0'), aa = String(Math.round(t.ang)).padStart(2, '0');
      const st = mv.find((m, k) => k > 2 && m.g === 0) || first;
      out(`G00 ${X(st.p[1])} ${Z(o.z1)}`);
      out(`G76 P${mm}00${aa} Q${Math.round((o.min || 0.05) * 1000)} R${fmt(o.fin || 0)}`);
      out(`G76 ${X(T.ext ? T.rRoot : T.rMaj)} ${Z(o.z2)} R0. P${Math.round(T.k * 1000)} Q${Math.round(o.first * 1000)} ${F(o.pitch)}`);
      const last = mv[mv.length - 1]; out(`G00 ${X(last.p[1])} ${Z(last.p[0])}`);
    } else {
      const comp = o.comp === 'control' && (o.type === 'finish' || o.type === 'profile');
      if (comp && !(P.comp && M.caps.noseComp)) throw new Error('Kumanda takım ucu telafisi desteklemiyor');
      const passes = comp ? (op.compPasses || []) : [];
      for (let k = 3; k < mv.length; k++) {
        const gi = op.i0 + k, m = mv[k], pass = comp && passes.find((q) => q.ia === gi);
        if (pass) {
          // kumanda telafisi: parça konturu programlanır, uç yarıçapı ve sanal uç no ofset sayfasında
          const c0 = pass.contour[0].a;
          out(`${o.side === 'id' ? 'G41' : 'G42'} G01 ${X(c0[1])} ${Z(c0[0])} ${F(m.f)}`);
          for (const e of pass.contour) out(e.t === 'L' ? `G01 ${X(e.b[1])} ${Z(e.b[0])}` : `G0${e.cw ? 2 : 3} ${X(e.b[1])} ${Z(e.b[0])} R${fmt(e.R)}`);
          const ex = mv[pass.ib - op.i0]; k = pass.ib - op.i0;
          if (ex) out(`G40 G01 ${X(ex.p[1])} ${Z(ex.p[0])}`);
          continue;
        }
        if (m.g === 0) out(`G00 ${X(m.p[1])} ${Z(m.p[0])}`);
        else if (m.g === 1) out(`G01 ${X(m.p[1])} ${Z(m.p[0])} ${F(m.f)}`);
        else if (m.g === 2 || m.g === 3) out(`G0${m.g} ${X(m.p[1])} ${Z(m.p[0])} R${fmt(m.R)} ${F(m.f)}`);
        else if (m.g === 32) out(`G32 ${Z(m.p[0])} ${F(m.f)}`);
      }
    }
    out('M09');
  });
  for (const m of R.moves.slice(-2)) homeOut(m);
  out('M05'); out('M30'); out('%');
  return { text: L.join('\n') + '\n', lines: L.length, post: P };
}

/* ===================== G-kodu geri okuma ===================== */
// Üretilen (ya da elle yazılmış) torna programını okur, referans nokta yolunu çıkarır. G76 aynı algoritmayla açılır.
export function parseLatheGcode(text, opt = {}) {
  const radius = !!opt.radius, out = [], warn = [];
  let x = null, z = null, mode = 0, g76a = null, f = 0;
  const num = (s, k) => { const m = new RegExp(k + '(-?\\d*\\.?\\d+)').exec(s); return m ? +m[1] : null; };
  for (let raw of text.split('\n')) {
    let s = raw.replace(/\(.*?\)/g, '').replace(/^N\d+\s*/, '').trim().toUpperCase(); if (!s || s === '%' || /^O\d/.test(s)) continue;
    const gs = [...s.matchAll(/G(\d+)/g)].map((q) => +q[1]);
    if (gs.includes(28)) { if (/U/.test(s)) x = opt.homeR ?? null; if (/W/.test(s)) z = opt.homeZ ?? null; if (x != null && z != null) out.push({ g: 0, p: [z, x] }); continue; }
    if (gs.includes(76)) {
      if (/ X| Z|^G76 X|G76 U/.test(s) && num(s, 'P') != null && num(s, 'F') != null) {
        const X2 = num(s, 'X'), Z2 = num(s, 'Z'), Pk = num(s, 'P') / 1000, Qd = num(s, 'Q') / 1000, Fp = num(s, 'F');
        const a = g76a || { m: 1, ang: 60, dmin: 0.05, d: 0 }, rRoot = radius ? X2 : X2 / 2, x0r = x, ext = x0r > rRoot;
        const o = { side: ext ? 'od' : 'id', pitch: Fp, d: ext ? 2 * (rRoot + Pk) : 2 * rRoot, first: Qd, min: a.dmin, fin: a.d, spring: a.m - 1, z1: z, z2: Z2 };
        const T = threadPasses({ ...o, d: ext ? 2 * (rRoot + (0.61343 * Fp)) : 2 * rRoot }, { ang: a.ang, ext });
        if (Math.abs(T.k - Pk) > 0.002) warn.push(`G76 P (${Pk}) ISO diş yüksekliğinden (${fmt(T.k)}) farklı`);
        const rStart = x0r;
        for (const ps of T.passes) { out.push({ g: 0, p: [z, rStart] }); out.push({ g: 0, p: [z, ps.r] }); out.push({ g: 32, p: [Z2, ps.r], f: Fp }); out.push({ g: 0, p: [Z2, rStart] }); }
        out.push({ g: 0, p: [z, rStart] });
        continue;
      }
      const P = num(s, 'P'); if (P != null) { const ps = String(Math.round(P)).padStart(6, '0'); g76a = { m: +ps.slice(0, 2), ang: +ps.slice(4, 6), dmin: (num(s, 'Q') || 50) / 1000, d: num(s, 'R') || 0 }; }
      continue;
    }
    for (const g of gs) if ([0, 1, 2, 3, 32].includes(g)) mode = g;
    const X = num(s, 'X'), Zv = num(s, 'Z'), Fv = num(s, 'F'), Rv = num(s, 'R'); if (Fv != null) f = Fv;
    if (X == null && Zv == null) continue;
    const nx = X != null ? (radius ? X : X / 2) : x, nz = Zv != null ? Zv : z;
    if (nx == null || nz == null) { x = nx; z = nz; continue; }
    out.push({ g: mode, p: [nz, nx], f, R: Rv });
    x = nx; z = nz;
  }
  return { moves: out, warn };
}
// İki hareket listesinin aynı yolu çizdiğini denetle (G76 bloğunun açılımı dahil). Sonuç: en büyük sapma (mm)
export function compareMoves(A, B, skipFirst = true) {
  const dd = (L) => { const o = []; for (const m of L) { if (!m.p) continue; if (o.length && dist(o[o.length - 1].p, m.p) < 1e-6 && (m.g === 0) === (o[o.length - 1].g === 0)) continue; o.push(m); } return o; };
  const a = dd(A), b = dd(B);
  const sa = skipFirst ? a.slice(1) : a, sb = skipFirst ? b.slice(1) : b;
  if (sa.length !== sb.length) return { ok: false, count: [sa.length, sb.length], maxErr: Infinity };
  let maxErr = 0, gMismatch = 0;
  for (let i = 0; i < sa.length; i++) { maxErr = Math.max(maxErr, dist(sa[i].p, sb[i].p)); if ((sa[i].g === 32) !== (sb[i].g === 32) || (sa[i].g > 0) !== (sb[i].g > 0)) gMismatch++; }
  return { ok: maxErr < 0.0011 && !gMismatch, maxErr, gMismatch, count: [sa.length, sb.length] };
}

/* ===================== tek çağrı: hesapla + simüle et + denetle ===================== */
export function runLathe(job, opt = {}) {
  const R = planLathe(job); if (!R.ok) return { R, sim: null, ev: null, issues: R.issues };
  const sim = createSim(R, { res: opt.res || 0.1 }); sim.step();
  const ev = evaluateSim(R, sim);
  const issues = [...R.issues, ...sim.events.map((e) => ({ level: e.level, where: `${(e.op ?? 0) + 1}. ${OP_NAMES_L[job.ops[e.op]?.type] || ''} (hareket ${e.move + 1})`, msg: e.msg, kind: e.kind }))];
  if (ev.gougeArea > 0) issues.push({ level: 'hata', where: 'Simülasyon', msg: `Parça profiline girildi (fazla kesim) — kesit alanı ${fmt(ev.gougeArea)} mm², Z ${fmt(ev.gougeZ[1])}…${fmt(ev.gougeZ[0])}` });
  if (ev.residualArea > 0) issues.push({ level: 'uyarı', where: 'Simülasyon', msg: `Hedef profil dışında malzeme kaldı — kesit alanı ${fmt(ev.residualArea)} mm², Z ${fmt(ev.residualZ[1])}…${fmt(ev.residualZ[0])}` });
  return { R, sim, ev, issues, time: cycleTime(R) };
}
// Kontrol kapsamı (arayüzde ve raporda aynen gösterilir)
export const CHECK_SCOPE = {
  checked: ['Uç ve kesme kenarı biçimi ile hızlı (G00) harekette malzemeye çarpma', 'Takım tutucu / sap (basitleştirilmiş dikdörtgen) ve bara (silindir) ile malzeme çarpışması', 'Ayna çenesi ve ayna gövdesi / fener mili önü (girilen çap ve boylarla, silindir yaklaşımı)', 'Makine X / Z hareket sınırları, dış takımla eksen merkezini geçme', 'Hızlı hareket sonunda güvenli mesafe', 'Simülasyon sonunda parça profiline girme (fazla kesim) ve kalan malzeme', 'Takım yönü (sol / sağ), takım türü – operasyon uyumu, kanal / kesme / bara erişimi, devir ve ilerleme sınırları'],
  notChecked: ['Taretteki diğer takımlar ve taret gövdesi', 'Punta, karşı iş mili, kapak, talaş konveyörü', 'Gerçek tutucu ve bara 3B biçimi (2B kesit yaklaşımı)', 'Helisel diş geometrisi (eksenel simetrik model: diş bölgesi ayrı işaretlenir)', 'Talaş birikmesi, titreşim, takım aşınması, kesme kuvveti ve eğilme', 'Ayna çene sıkma basıncı ve iş parçası kayması'],
};
