// Akıllı Kaynak Planlama — saf hesap modülü (3B kütüphanesi gerektirmez; Node'da test edilir: tests/welds.test.mjs)
//
// 1) Olası kaynak birleşimleri modelden bulunur:
//    - İskelet (konstrüksiyon) içindeki eleman uçları: köşe, T ve gönye (alın) birleşimleri; dikiş yolu profil kesitinin çevresi
//    - Ayrı metal parçaların teması (sac–profil, profil–profil...): temas bölgesi (yüz yüze örtüşme kırpılarak, çizgi temasta köşe noktaları)
//      kümelenir, temas düzlemindeki dış sınırı (dışbükey zarf) dikiş yolu olur
//    Bulunanlar yalnızca ÖNERİDİR (onaylanmamış); kullanıcı onaylar, düzenler, siler ya da elle ekler.
// 2) Dikiş uzunluğu, aralıklı dikişte gerçek kaynak uzunluğu, sarf malzemesi (tel / elektrot / çubuk, gaz), ark ve iş süresi tahmini
// 3) Kaynak sırası önerisi (alt şase → dikmeler → üst şase → çaprazlar → tamamlayıcı), grup içinde karşılıklı dengeli sıra
// Kaynak ölçüsü (a / s) kullanıcı girmezse BİLİNMİYOR kabul edilir; sarf hesabına katılmaz, tahmin uydurulmaz.

import { Mesh, frameWorldMembers, frameJoints, torchAccess, triTri, closestOnTri } from './mfgcheck.js?v=20261109h';

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = (a) => Math.hypot(a[0], a[1], a[2]);
const norm = (a) => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const r1 = (v) => Math.round(v * 10) / 10;
const f1 = (v) => String(r1(v)).replace('.', ',');

export const WELD_TYPES = { kose: 'Köşe kaynağı', alin: 'Alın kaynağı', t: 'T kaynak' };
export const SIDES = { cevre: 'Çepeçevre', iki: 'İki taraf', tek: 'Tek taraf' };
export const METHODS = {
  mag: { name: 'MIG/MAG (gazaltı)', iso: 135, filler: 'wire', eff: 0.92, arc: 0.30, gas: 14, rate: { 0.8: 1.5, 1: 2.5, 1.2: 3.5, 1.6: 5 }, dia: 1 },
  tig: { name: 'TIG', iso: 141, filler: 'rod', eff: 0.97, arc: 0.25, gas: 8, rate: { 1.6: 0.4, 2.4: 0.5, 3.2: 0.6 }, dia: 2.4 },
  argon: { name: 'Argon kaynağı (TIG)', iso: 141, filler: 'rod', eff: 0.97, arc: 0.25, gas: 8, rate: { 1.6: 0.4, 2.4: 0.5, 3.2: 0.6 }, dia: 2.4 },
  stick: { name: 'Örtülü elektrot', iso: 111, filler: 'electrode', eff: 0.65, arc: 0.25, gas: 0, rate: { 2: 0.6, 2.5: 0.8, 3.2: 1.2, 4: 1.7, 5: 2.3 }, dia: 3.2 },
};
export const WELD_DEFAULTS = { method: 'mag', dia: null, loss: 10, reinf: 10, arcPct: null, rodLen: 350, stub: 50 };
const DENS = { celik: 7.85, paslanmaz: 8.0, aluminyum: 2.7, al6061: 2.7, pirinc: 8.5, bakir: 8.96, titanyum: 4.51 };

/* ---------- harf etiketleri ---------- */
export const labelOf = (i) => { let s = ''; i++; while (i > 0) { const r = (i - 1) % 26; s = String.fromCharCode(65 + r) + s; i = Math.floor((i - 1) / 26); } return s; };

/* ---------- iskelet birleşimleri ---------- */
// profil ucundaki dikiş halkası (gönyede eğik kesim)
function endLoop(m, atA) {
  const end = atA ? m.a : m.b, d = atA ? m.axis : mul(m.axis, -1);
  const sh = (q) => (m.mit ? m.mit.sign * q[m.mit.ax] : 0);
  const pt = (q) => add(add(end, mul(m.axis, (atA ? -1 : 1) * sh(q))), add(mul(m.u, q[0]), mul(m.v, q[1])));
  let qs;
  if (m.kind === 'round') { const n = 24, r = m.w / 2; qs = Array.from({ length: n }, (_, i) => [r * Math.cos(i / n * 2 * Math.PI), r * Math.sin(i / n * 2 * Math.PI)]); }
  else { const a = m.w / 2, b = m.h / 2; qs = [[-a, -b], [a, -b], [a, b], [-a, b]]; }
  return { pts: qs.map((q) => add(pt(q), mul(d, 0.3))), inward: d };
}
const loopLen = (pts) => pts.reduce((s, p, i) => s + len(sub(pts[(i + 1) % pts.length], p)), 0);
// yan (tek / iki taraf) uzunlukları: dikişin en uzun kenarı
function sideLens(pts, closed = true) {
  const segs = []; for (let i = 0; i < pts.length - (closed ? 0 : 1); i++) segs.push(len(sub(pts[(i + 1) % pts.length], pts[i])));
  const per = segs.reduce((s, v) => s + v, 0);
  if (pts.length > 8) return { cevre: per, iki: per / 2, tek: per / 4 };        // boru / eğri: yarım ve çeyrek çevre
  const mx = Math.max(...segs);
  return { cevre: per, iki: Math.min(per, 2 * mx), tek: mx };
}
export function frameWelds(q) {
  const ms = frameWorldMembers(q.p), J = frameJoints(ms), out = [], seen = new Set();
  for (const j of J) {
    const m = ms[j.member], atA = len(sub(j.at, m.a)) < 1e-6;
    let type, partner = j.other[0], note = '';
    if (m.mit) {
      // gönye: aynı köşede gönyeli diğer eleman (alın kaynağı, çift sayılmasın)
      const mp = j.other.find((o) => ms[o].mit && (len(sub(ms[o].a, j.at)) < 1 || len(sub(ms[o].b, j.at)) < 1));
      if (mp != null) {
        const key = [j.member, mp].sort((a, b) => a - b).join('-') + '@' + j.at.map((v) => Math.round(v)).join(',');
        if (seen.has(key)) continue; seen.add(key);
        type = 'alin'; partner = mp; note = 'gönye 45°';
      } else type = 'kose';
    } else {
      const o = ms[partner], s = dot(sub(j.at, o.a), o.axis);
      type = s < o.w * 1.01 || s > o.len - o.w * 1.01 ? 'kose' : 't';
    }
    const loop = endLoop(m, atA), L = sideLens(loop.pts);
    const o = ms[partner];
    out.push({
      key: 'f:' + q.id + ':' + j.member + ':' + (atA ? 'a' : 'b'), src: 'frame', parts: [q.id], partNames: [q.name],
      where: q.name + ' · ' + m.role + ' ↔ ' + o.role + (note ? ' (' + note + ')' : ''), type, side: 'cevre', lens: L, path: loop.pts, closed: true,
      pos: j.at, normal: loop.inward, t: Math.min(m.t || 2, o.t || 2), roles: [m.role, o.role], axis: m.axis, material: q.material,
      access: { pts: loop.pts.map((p, i) => [add(p, mul(norm(sub(p, j.at)), 3)), norm(sub(p, j.at))]) },
    });
  }
  return out;
}

/* ---------- ayrı parçaların temas bölgeleri ---------- */
const triN = (T) => norm(cross(sub(T[1], T[0]), sub(T[2], T[0])));
// p→q parçasını (T ile aynı düzlemde) üçgen içine kırp
function clipSeg(p, q, T, n) {
  const d = sub(q, p);
  let t0 = 0, t1 = 1;
  for (let i = 0; i < 3; i++) {
    const a = T[i], b = T[(i + 1) % 3], c = T[(i + 2) % 3];
    let en = cross(n, sub(b, a));
    if (dot(en, sub(c, a)) < 0) en = mul(en, -1);          // içe bakan kenar normali
    const num = dot(en, sub(p, a)), den = dot(en, d);
    if (Math.abs(den) < 1e-12) { if (num < -1e-6) return null; continue; }
    const t = -num / den;
    if (den > 0) t0 = Math.max(t0, t); else t1 = Math.min(t1, t);
    if (t0 > t1 + 1e-9) return null;
  }
  return [add(p, mul(d, t0)), add(p, mul(d, t1))];
}
const nodeGap = (a, b) => Math.hypot(...[0, 1, 2].map((k) => Math.max(0, a.min[k] - b.max[k], b.min[k] - a.max[k])));
// A ile B'nin temas kümeleri: [{ pts, n }]
export function contactClusters(A, B, tol = 0.05) {
  const NA = A.bvh, NB = B.bvh, pairs = [];
  if (!NA.nodes.length || !NB.nodes.length) return [];
  const st = [[0, 0]];
  let work = 0;
  while (st.length && work < 200000) {
    const [ia, ib] = st.pop(), na = NA.nodes[ia], nb = NB.nodes[ib];
    if (nodeGap(na, nb) > tol) continue;
    if (na.l < 0 && nb.l < 0) {
      for (let x = na.s; x < na.e; x++) for (let y = nb.s; y < nb.e; y++) {
        work++;
        const ta = NA.idx[x], tb = NB.idx[y], TA = A.tri(ta), TB = B.tri(tb);
        const [d, cp] = triTri(TA, TB);
        if (d > tol) continue;
        const nA = triN(TA), nB = triN(TB), pts = [];
        // yüz yüze temas: normaller ZIT yönde (yan yana aynı düzlemdeki yüzler temas değildir)
        const facing = dot(nA, nB) < -0.996 && Math.abs(dot(sub(TA[0], TB[0]), nB)) <= tol;
        if (facing) {
          for (let i = 0; i < 3; i++) { const c = clipSeg(TA[i], TA[(i + 1) % 3], TB, nB); if (c) pts.push(...c); }
          for (let i = 0; i < 3; i++) { const c = clipSeg(TB[i], TB[(i + 1) % 3], TA, nA); if (c) pts.push(...c); }
        }
        if (!facing) {
          for (const v of TA) if (len(sub(v, closestOnTri(v, ...TB))) <= tol) pts.push(v);
          for (const v of TB) if (len(sub(v, closestOnTri(v, ...TA))) <= tol) pts.push(v);
          // üçgenin bir kenarı baştan sona temas çizgisi mi (uçları ve ortası diğer parçaya değiyor): boru boyunca temas
          // (kenar bu çiftin üçgenine de değmeli; yoksa başka bölgedeki temas buraya bağlanır)
          const lineEdge = (T, O, OT) => {
            for (let i = 0; i < 3; i++) {
              const p = T[i], q = T[(i + 1) % 3], m = mul(add(p, q), 0.5);
              if (len(sub(p, q)) <= 1 || ![p, q, m].some((x) => len(sub(x, closestOnTri(x, ...OT))) <= tol)) continue;
              if ([p, q, m].every((x) => O.nearest(x, tol * 2) <= tol)) pts.push(p, q);
            }
          };
          lineEdge(TA, B, TB); lineEdge(TB, A, TA);
        }
        if (!pts.length && cp) pts.push(cp);
        if (facing && pts.length < 3) continue;   // yalnızca kenarda değen yüzler
        if (pts.length) pairs.push({ ta, tb, pts, n: facing ? nA : null });
      }
      continue;
    }
    const splitA = nb.l < 0 || (na.l >= 0 && (na.e - na.s) >= (nb.e - nb.s));
    if (splitA) st.push([na.l, ib], [na.r, ib]); else st.push([ia, nb.l], [ia, nb.r]);
  }
  if (!pairs.length) return [];
  // kümeleme: temas noktaları 1 mm'den yakın olan çiftler aynı bölge (büyük bir üçgen iki ayrı bölgeye değebilir; üçgen paylaşımı bağlamaz)
  const par = pairs.map((_, i) => i), find = (x) => { while (par[x] !== x) { par[x] = par[par[x]]; x = par[x]; } return x; };
  const join = (a, b) => { a = find(a); b = find(b); if (a !== b) par[a] = b; };
  const byKey = new Map(), link = (k, i) => { if (byKey.has(k)) join(byKey.get(k), i); else byKey.set(k, i); };
  pairs.forEach((p, i) => {
    for (const v of p.pts) { link('p' + v.map((x) => Math.round(x)).join(','), i); link('q' + v.map((x) => Math.round(x + 0.5)).join(','), i); }
  });
  const groups = new Map();
  pairs.forEach((p, i) => { const r = find(i); if (!groups.has(r)) groups.set(r, []); groups.get(r).push(p); });
  const out = [];
  for (const g of groups.values()) {
    const pts = [], seen = new Set();
    for (const p of g) for (const v of p.pts) { const k = v.map((x) => Math.round(x * 20)).join(','); if (!seen.has(k)) { seen.add(k); pts.push(v); } }
    // düzlem normali: yüz yüze temas varsa onun normali, yoksa noktaların en küçük yayılım yönü
    let n = g.find((p) => p.n);
    n = n ? n.n : planeNormal(pts);
    out.push({ pts, n, faceToFace: g.some((p) => p.n) });
  }
  return out;
}
function planeNormal(pts) {
  const c = mul(pts.reduce((s, p) => add(s, p), [0, 0, 0]), 1 / pts.length);
  let best = [0, 1, 0], bv = Infinity;
  for (const n of [[1, 0, 0], [0, 1, 0], [0, 0, 1], norm([1, 1, 0]), norm([1, 0, 1]), norm([0, 1, 1]), norm([1, -1, 0]), norm([1, 0, -1]), norm([0, 1, -1])]) {
    const v = pts.reduce((s, p) => s + dot(sub(p, c), n) ** 2, 0);
    if (v < bv) { bv = v; best = n; }
  }
  return best;
}
// temas noktalarının düzlemdeki dışbükey zarfı (3B noktalar)
export function hull3(pts, n) {
  const u = norm(Math.abs(n[0]) < 0.9 ? cross(n, [1, 0, 0]) : cross(n, [0, 1, 0])), v = cross(n, u);
  const c = mul(pts.reduce((s, p) => add(s, p), [0, 0, 0]), 1 / pts.length);
  // 2B koordinatlar mikrona yuvarlanır: neredeyse eşit değerler (200 / 200,00000000000006) sıralamayı bozmasın
  const q6 = (x) => Math.round(x * 1e4) / 1e4;
  const P = pts.map((p) => [q6(dot(sub(p, c), u)), q6(dot(sub(p, c), v)), p]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [], hi = [];
  for (const p of P) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], p) <= 1e-9) lo.pop(); lo.push(p); }
  for (let i = P.length - 1; i >= 0; i--) { const p = P[i]; while (hi.length >= 2 && cr(hi[hi.length - 2], hi[hi.length - 1], p) <= 1e-9) hi.pop(); hi.push(p); }
  const h = lo.slice(0, -1).concat(hi.slice(0, -1));
  return (h.length ? h : P.slice(0, 1)).map((x) => x[2]);
}

const METAL = (q) => q.material && q.material.kind === 'metal';
// bütün olası kaynaklar (öneri)
export function detectWelds(model) {
  const parts = (model.parts || []).filter((q) => q.op !== 'sub' && q.tris && q.tris.length >= 9);
  const out = [];
  for (const q of parts) if (q.type === 'frame' && METAL(q)) out.push(...frameWelds(q));
  const metal = parts.filter(METAL), mesh = new Map(metal.map((q) => [q.id, new Mesh(q.tris)]));
  for (let i = 0; i < metal.length; i++) for (let j = i + 1; j < metal.length; j++) {
    const a = metal[i], b = metal[j], A = mesh.get(a.id), B = mesh.get(b.id);
    if (nodeGap(A.box, B.box) > 0.05) continue;
    const cls = contactClusters(A, B);
    cls.forEach((c, k) => {
      const hull = hull3(c.pts, c.n);
      if (hull.length < 2) return;
      const L = hull.length >= 3 ? sideLens(hull) : (() => { const l = len(sub(hull[1], hull[0])); return { cevre: 2 * l, iki: 2 * l, tek: l }; })();
      if (L.cevre < 1) return;
      // tür: temas bölgesi iki parçanın da kesitini kaplıyorsa alın, birinin kesitini kaplıyorsa T (profil ucu yüzeye), yoksa köşe (bindirme / yan temas)
      const ext = (Q) => { const b = Q.box; return [0, 1, 2].map((x) => b.max[x] - b.min[x]); };
      const across = (Q) => { const e = ext(Q); const k = [0, 1, 2].reduce((m, x) => (Math.abs(c.n[x]) > Math.abs(c.n[m]) ? x : m), 0); return e.filter((_, x) => x !== k); };
      const hb = [0, 1, 2].map((x) => Math.max(...hull.map((p) => p[x])) - Math.min(...hull.map((p) => p[x])));
      const kN = [0, 1, 2].reduce((m, x) => (Math.abs(c.n[x]) > Math.abs(c.n[m]) ? x : m), 0), hb2 = hb.filter((_, x) => x !== kN);
      const covers = (Q) => { const e = across(Q); return e[0] <= hb2[0] + 1 && e[1] <= hb2[1] + 1; };
      // parça temas düzlemine dik uzanıyor mu (uç yüzüyle değiyor: profil ucu, sac kenarı)
      const endOn = (Q) => covers(Q) && ext(Q)[kN] >= Math.min(...across(Q)) * 0.9;
      // bölge diğer parçanın yüzünün kenarlarına değmüyor (yüzün ortasında) → T, kenarda → köşe
      const inside = (Q) => [0, 1, 2].some((x) => x !== kN && Math.min(...hull.map((p) => p[x])) > Q.box.min[x] + 1 && Math.max(...hull.map((p) => p[x])) < Q.box.max[x] - 1);
      let type = 'kose';
      if (c.faceToFace) {
        if (endOn(A) && endOn(B)) type = 'alin';
        else if (endOn(A)) type = inside(B) ? 't' : 'kose';
        else if (endOn(B)) type = inside(A) ? 't' : 'kose';
      }
      const ctr = mul(hull.reduce((s, p) => add(s, p), [0, 0, 0]), 1 / hull.length);
      out.push({
        key: 'c:' + Math.min(a.id, b.id) + ':' + Math.max(a.id, b.id) + ':' + ctr.map((v) => Math.round(v / 5)).join(','), src: 'contact', parts: [a.id, b.id], partNames: [a.name, b.name],
        where: a.name + ' ↔ ' + b.name + (cls.length > 1 ? ' (' + (k + 1) + '. bölge)' : '') + (c.faceToFace ? '' : ' · çizgi temas'), type, side: type === 'alin' ? 'cevre' : 'cevre', lens: L, path: hull, closed: hull.length >= 3,
        pos: ctr, normal: c.n, t: null, roles: [a.type, b.type], material: a.material, material2: b.material,
        access: { pts: hull.map((p) => [add(p, mul(norm(sub(p, ctr)), 3)), norm(sub(p, ctr))]) },
      });
    });
  }
  return out;
}

/* ---------- plan: öneri + kullanıcı kararları ---------- */
// eski plandaki kullanıcı düzenlemeleri aynı anahtarlı yeni önerilere taşınır
export function mergePlan(found, old = []) {
  const prev = new Map(old.filter((w) => !w.manual).map((w) => [w.key, w]));
  const out = found.map((f, i) => {
    const o = prev.get(f.key);
    const base = { id: f.key, status: 'proposed', mode: 'surekli', stitch: 50, pitch: 100, size: null, method: null, lenEdited: false };
    const w = { ...base, ...(o ? pick(o, ['id', 'status', 'mode', 'stitch', 'pitch', 'size', 'method', 'type', 'side', 'len', 'lenEdited', 'label']) : {}), ...strip(f) };
    if (o) { w.type = o.type; w.side = o.side; if (o.lenEdited) w.len = o.len; }
    if (!w.lenEdited) w.len = r1(w.lens[w.side] || w.lens.cevre);
    return w;
  });
  for (const m of old.filter((w) => w.manual)) out.push(m);
  out.forEach((w, i) => { w.label = labelOf(i); });
  return out;
}
const pick = (o, ks) => Object.fromEntries(ks.filter((k) => o[k] !== undefined).map((k) => [k, o[k]]));
const strip = (f) => { const { type, side, ...r } = f; return { ...r, type: f.type, side: f.side }; };
export function setSide(w, side) { w.side = side; if (!w.lenEdited && w.lens) w.len = r1(w.lens[side] || w.lens.cevre); return w; }

// aralıklı dikiş: bağlantı uzunluğu L, dikiş l, aralık e → n dikiş, gerçek uzunluk
export function actualLen(w) {
  const L = Math.max(0, Number(w.len) || 0);
  if (w.mode !== 'aralikli') return { n: 1, actual: L, conn: L };
  const l = Math.max(1, Number(w.stitch) || 50), e = Math.max(0, Number(w.pitch) || 0);
  if (L <= l) return { n: 1, actual: L, conn: L };
  const n = Math.max(1, Math.floor((L + e) / (l + e)));
  return { n, actual: n * l, conn: L };
}
// kesit alanı (mm²): köşe / T = a² (eşit kenarlı, boğaz a), alın = 0,577·s² + 1 mm aralık·s (60° V); takviye payı eklenir
export function weldArea(w, reinf = 10) {
  const s = Number(w.size);
  if (!(s > 0)) return null;
  const base = w.type === 'alin' ? 0.577 * s * s + s : s * s;
  return base * (1 + reinf / 100);
}
const near = (tbl, d) => { const ks = Object.keys(tbl).map(Number); const k = ks.reduce((b, x) => (Math.abs(x - d) < Math.abs(b - d) ? x : b), ks[0]); return tbl[k]; };

export function planReport(plan, set = {}) {
  const S = { ...WELD_DEFAULTS, ...set };
  const all = plan || [], ok = all.filter((w) => w.status === 'approved');
  const byType = {}, unknown = [];
  let conn = 0, actual = 0, depositG = 0, sized = 0;
  const methodsUsed = {};
  for (const w of ok) {
    const L = actualLen(w);
    conn += L.conn; actual += L.actual;
    const k = w.type + (w.mode === 'aralikli' ? '-a' : '');
    byType[k] = byType[k] || { count: 0, len: 0, actual: 0 };
    byType[k].count++; byType[k].len += L.conn; byType[k].actual += L.actual;
    const area = weldArea(w, S.reinf);
    const mid = w.method || S.method;
    if (area == null) { unknown.push(w.label); continue; }
    sized++;
    const rho = DENS[(w.material && w.material.id) || 'celik'] || 7.85;
    const g = area * L.actual * rho / 1000;                   // mm³ × g/cm³ / 1000 = g
    depositG += g;
    methodsUsed[mid] = (methodsUsed[mid] || 0) + g;
  }
  // sarf: yöntem başına
  const cons = Object.entries(methodsUsed).map(([mid, g]) => {
    const M = METHODS[mid] || METHODS.mag, dia = Number(S.dia) || M.dia;
    const need = g / M.eff * (1 + S.loss / 100);              // eriyen dolgu metali (g)
    const rate = near(M.rate, dia);                           // kg/saat (tipik yığma hızı)
    const arcH = g / 1000 / rate, workH = arcH / ((Number(S.arcPct) || M.arc * 100) / 100);
    const o = { method: mid, name: M.name, dia, depositG: g, needG: need, arcMin: arcH * 60, workMin: workH * 60, gasL: M.gas * arcH * 60, filler: M.filler };
    const steelR = 7.85e-3, area = Math.PI * dia * dia / 4;
    if (M.filler === 'wire') o.wireM = need / (area * steelR) / 1000;
    if (M.filler === 'rod') { o.rodM = need / (area * steelR) / 1000; o.rods = Math.ceil(o.rodM / 1); }
    if (M.filler === 'electrode') {
      const usable = (S.rodLen - S.stub) / S.rodLen, perRod = area * S.rodLen * steelR;     // çekirdek tel (g / adet)
      const needCore = need / usable;
      o.electrodes = Math.ceil(needCore / perRod); o.electrodeKg = needCore / 1000; o.perRodG = perRod;
    }
    return o;
  });
  return {
    detected: all.filter((w) => !w.manual).length, manual: all.filter((w) => w.manual).length, approved: ok.length, proposed: all.filter((w) => w.status === 'proposed').length, rejected: all.filter((w) => w.status === 'rejected').length,
    connLen: r1(conn), actualLen: r1(actual), byType, unknown, sized, depositG, cons,
    arcMin: cons.reduce((s, c) => s + c.arcMin, 0), workMin: cons.reduce((s, c) => s + c.workMin, 0),
  };
}

/* ---------- kaynak sırası ---------- */
export const SEQ_GROUPS = ['Alt şase birleşimleri', 'Dikme / ara bağlantılar', 'Üst şase birleşimleri', 'Çapraz destekler', 'Tamamlayıcı kaynaklar (sac, braket, ek parçalar)'];
export function weldSequence(plan, bbox) {
  const ok = (plan || []).filter((w) => w.status === 'approved');
  if (!ok.length) return [];
  const ymin = bbox ? bbox.min[1] : Math.min(...ok.map((w) => w.pos[1])), ymax = bbox ? bbox.max[1] : Math.max(...ok.map((w) => w.pos[1]));
  const H = Math.max(ymax - ymin, 1);
  const diag = (w) => w.axis && Math.max(...w.axis.map(Math.abs)) < 0.985;
  const grp = (w) => {
    if (w.src !== 'frame' && !w.manual) return 4;
    if (diag(w)) return 3;
    const f = (w.pos[1] - ymin) / H;
    return f < 0.34 ? 0 : f > 0.66 ? 2 : 1;
  };
  const groups = SEQ_GROUPS.map((name) => ({ name, list: [] }));
  for (const w of ok) groups[grp(w)].list.push(w);
  const out = [];
  for (const g of groups) {
    if (!g.list.length) continue;
    // karşılıklı dengeli sıra: merkez etrafında açıya göre diz, sonra karşıdakiyle dönüşümlü
    const c = mul(g.list.reduce((s, w) => add(s, w.pos), [0, 0, 0]), 1 / g.list.length);
    const srt = g.list.slice().sort((a, b) => Math.atan2(a.pos[2] - c[2], a.pos[0] - c[0]) - Math.atan2(b.pos[2] - c[2], b.pos[0] - c[0]));
    const n = srt.length, half = Math.ceil(n / 2), ord = [];
    for (let i = 0; i < half; i++) { ord.push(srt[i]); if (i + half < n) ord.push(srt[i + half]); }
    out.push({ name: g.name, welds: ord });
  }
  return out;
}
export const SEQ_TIPS = [
  'Önce bütün birleşimleri puntala (kısa nokta kaynaklarla tuttur), ölçüleri ve gönyeyi kontrol et, sonra dikişlere geç.',
  'Her grupta karşılıklı birleşimleri art arda kaynakla (sıradaki liste buna göre dizildi); ısı tek tarafa toplanmasın.',
  'Uzun dikişlerde geri adım (backstep) yöntemi: dikişi parçalara böl, her parçayı ters yönde çek.',
  'İnce sacı profile bağlarken ortadan dışa doğru ve aralıklı çalış; sürekli dikiş gerekiyorsa aralıkları sonra doldur.',
  'Bu sıra üretim planlama tavsiyesidir; çarpılma malzemeye, kalınlığa ve fikstüre göre değişir.',
];

/* ---------- erişim (üretilebilirlik çekirdeğiyle) ---------- */
export function weldAccess(w, meshes) {
  if (!w.access || !w.access.pts.length) return null;
  const step = Math.max(1, Math.floor(w.access.pts.length / 6));
  let best = 0, okN = 0, n = 0;
  for (let i = 0; i < w.access.pts.length; i += step) { const [p, nn] = w.access.pts[i]; const a = torchAccess(p, nn, meshes); best = Math.max(best, a); if (a >= 0.12) okN++; n++; }
  return { best, okFrac: okN / Math.max(n, 1) };
}

/* ---------- özet cümle ---------- */
export function weldSummary(plan, rep) {
  if (!plan || !plan.length) return 'Modelde olası kaynak birleşimi bulunamadı. Metal parçalar birbirine değmiyor olabilir; elle kaynak ekleyebilirsin.';
  let s = 'Modelinde ' + rep.detected + ' olası kaynak birleşimi tespit edildi.' + (rep.manual ? ' ' + rep.manual + ' kaynağı elle ekledin.' : '');
  s += rep.approved ? ' Bunlardan ' + rep.approved + ' tanesini onayladın. Toplam kaynak uzunluğu ' + fmtMM(rep.connLen) + (rep.actualLen < rep.connLen - 0.5 ? ' (aralıklı dikişlerle gerçek kaynak ' + fmtMM(rep.actualLen) + ')' : '') + '.' : ' Henüz hiçbirini onaylamadın; kontrol edip onayla.';
  if (rep.approved) s += rep.unknown.length ? ' ' + rep.unknown.length + ' kaynağın ölçüsü (a) girilmediği için sarf hesabı eksik; kaynak sırası hazır.' : ' Tahmini kaynak sarf malzemesi ve kaynak işlem sırası hazır.';
  return s;
}
export const fmtMM = (v) => { try { return Math.round(v).toLocaleString('tr-TR') + ' mm'; } catch (e) { return Math.round(v) + ' mm'; } };

/* ---------- teknik resim: ISO 2553 kaynak sembolü ---------- */
// g: 2B tuval, (x,y) birleşim noktası (piksel), k: mm→piksel, w: kaynak; dir: +1 sağa / −1 sola. Dönüş: kullanılan kutu
export function drawWeldSymbol(g, x, y, k, w, dir = 1, method, rise = 7) {
  const M = METHODS[w.method || method] || METHODS.mag;
  const ex = x + dir * Math.min(rise, 12) * k, ey = y - rise * k, rl = 30 * k;   // ok ucu → dirsek → referans çizgisi
  g.save();
  g.strokeStyle = '#b91c1c'; g.fillStyle = '#b91c1c'; g.lineWidth = Math.max(1, 0.25 * k);
  g.beginPath(); g.moveTo(x, y); g.lineTo(ex, ey); g.lineTo(ex + dir * rl, ey); g.stroke();
  // ok ucu
  const ang = Math.atan2(y - ey, x - ex), al = 2.2 * k;
  g.beginPath(); g.moveTo(x, y); g.lineTo(x - al * Math.cos(ang - 0.35), y - al * Math.sin(ang - 0.35)); g.lineTo(x - al * Math.cos(ang + 0.35), y - al * Math.sin(ang + 0.35)); g.closePath(); g.fill();
  // çepeçevre dairesi
  if (w.side === 'cevre') { g.beginPath(); g.arc(ex, ey, 1.6 * k, 0, 2 * Math.PI); g.stroke(); }
  // sembol: referans çizgisinin altında (ok tarafı); iki taraf ise üstte de
  const sx = ex + dir * (rl / 2 + (dir < 0 ? 5 * k : 0)), s = 3 * k;                              // sembol referans çizgisinin ortasında
  const sym = (up) => {
    const yy = ey, sg = up ? -1 : 1;
    g.beginPath();
    if (w.type === 'alin') { g.moveTo(sx - s * 0.6, yy + sg * s); g.lineTo(sx, yy); g.lineTo(sx + s * 0.6, yy + sg * s); }   // V
    else { g.moveTo(sx - s / 2, yy); g.lineTo(sx - s / 2, yy + sg * s); g.lineTo(sx + s / 2, yy); }                          // köşe (üçgen)
    g.stroke();
  };
  sym(false); if (w.side === 'iki') sym(true);
  g.font = 'bold ' + (2.6 * k) + 'px sans-serif'; g.textBaseline = 'middle';
  const sz = Number(w.size) > 0 ? (w.type === 'alin' ? 's' : 'a') + f1(w.size) : (w.type === 'alin' ? 's?' : 'a?');
  g.textAlign = 'right'; g.fillText(sz, sx - s * 0.8, ey + 1.8 * k);
  const L = actualLen(w);
  const rt = w.mode === 'aralikli' ? L.n + '×' + f1(w.stitch) + '(' + f1(w.pitch) + ')' : f1(w.len);
  g.textAlign = 'left'; g.fillText(rt, sx + s * 0.8, ey + 1.8 * k);
  // kuyruk: yöntem numarası (ISO 4063) ve harf
  const tx = ex + dir * rl;
  g.beginPath(); g.moveTo(tx, ey); g.lineTo(tx + dir * 2 * k, ey - 2 * k); g.moveTo(tx, ey); g.lineTo(tx + dir * 2 * k, ey + 2 * k); g.stroke();
  g.textAlign = dir > 0 ? 'left' : 'right'; g.fillText(M.iso + ' · ' + w.label, tx + dir * 2.6 * k, ey);
  g.restore();
  return { x0: Math.min(x, ex + dir * (rl + 14 * k)), x1: Math.max(x, ex + dir * (rl + 14 * k)), y0: ey - 4 * k, y1: y };
}
