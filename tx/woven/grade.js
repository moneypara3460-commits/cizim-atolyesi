// Beden büyütme / küçültme (grading) — saf modül. Kural tabanlı: temel bedendeki her köşeye (kenar başlangıç noktası)
// hedef beden için bir kaydırma (Δx, Δy, mm) verilir. Kenar içindeki eğri noktaları, kenarın iki ucundaki kaydırmaların
// yay uzunluğuna göre karışımıyla taşınır. Çıtlar kenar boyuyla orantılı kayar; pens, işaret ve düz boy en yakın köşelerin
// ağırlıklı kaydırmasını alır. Pay, köşe türü, kat kenarı, adet ve notlar temel bedenden aynen gelir.
// Kural kaynakları:
//   block       — parça bir temel bloktan geldiyse: blok her bedenin ölçüleriyle yeniden çizilir, köşe farkları kural olur
//   proportional — genişlik ve boy ölçülerinin oranıyla, düz boy çizgisinin ortasına göre ölçekleme
import * as C from '../curve.js?v=20261112u';
import * as P from './pattern.js?v=20261112u';
import { buildSet, SETS } from './blocks.js?v=20261112u';

const clone = (o) => JSON.parse(JSON.stringify(o));
export const corners = (pc) => pc.edges.map((e) => e.segs[0].a);

// kural: rules[i] = [dx, dy] (köşe i = kenar i'nin başı)
export function applyRules(pc, rules) {
  const n = pc.edges.length;
  if (rules.length !== n) throw new Error(`Kural sayısı (${rules.length}) köşe sayısına (${n}) eşit değil`);
  const q = clone(pc);
  const lensOld = pc.edges.map(P.edgeLength);
  q.edges = pc.edges.map((e, i) => {
    const d0 = rules[i], d1 = rules[(i + 1) % n];
    // kenar boyunca kesir: segment uçlarının yay uzunluğu
    const L = lensOld[i] || 1; let acc = 0;
    const segs = e.segs.map((s) => {
      const l = C.segLength(s), f0 = acc / L, f1 = (acc + l) / L; acc += l;
      const mv = (p, f) => [p[0] + d0[0] + (d1[0] - d0[0]) * f, p[1] + d0[1] + (d1[1] - d0[1]) * f];
      return s.t === 'L' ? { t: 'L', a: mv(s.a, f0), b: mv(s.b, f1) } : { t: 'C', a: mv(s.a, f0), c1: mv(s.c1, f0 + (f1 - f0) / 3), c2: mv(s.c2, f0 + 2 * (f1 - f0) / 3), b: mv(s.b, f1) };
    });
    // uçları tam köşe kurallarına oturt (yuvarlama birikmesin)
    segs[0].a = [e.segs[0].a[0] + d0[0], e.segs[0].a[1] + d0[1]];
    segs.at(-1).b = [e.segs.at(-1).b[0] + d1[0], e.segs.at(-1).b[1] + d1[1]];
    for (let k = 1; k < segs.length; k++) segs[k].a = segs[k - 1].b;
    return { ...clone(e), segs };
  });
  const lensNew = q.edges.map(P.edgeLength);
  q.notches = pc.notches.map((nt) => ({ ...nt, at: nt.at * (lensNew[nt.edge] / (lensOld[nt.edge] || 1)) }));
  // iç noktalar: köşe kaydırmalarının ters uzaklık karesi ağırlıklı ortalaması
  const cs = corners(pc);
  const mvIn = (p) => {
    let w = 0, dx = 0, dy = 0;
    for (let i = 0; i < n; i++) { const d = C.dist(p, cs[i]); if (d < 1e-9) return [p[0] + rules[i][0], p[1] + rules[i][1]]; const k = 1 / (d * d); w += k; dx += k * rules[i][0]; dy += k * rules[i][1]; }
    return [p[0] + dx / w, p[1] + dy / w];
  };
  // pens ağzı dikiş hattında kalsın: ağız noktaları kenar üzerinde orantılı taşınır
  const onEdge = (p) => { const l = P.locate(pc, p); if (l && l.d < 0.5) { const r = P.pointAt(q, l.edge, l.at * (lensNew[l.edge] / (lensOld[l.edge] || 1))); return r.p; } return mvIn(p); };
  // pens genişliği (ağız) sabit kalır, yalnız yeri orantılı kayar (standart grading kuralı)
  q.darts = pc.darts.map((d) => {
    const la = P.locate(pc, d.a), lb = P.locate(pc, d.b);
    if (la && lb && la.d < 0.5 && lb.d < 0.5 && la.edge === lb.edge) {
      const k = lensNew[la.edge] / (lensOld[la.edge] || 1), mid = (la.at + lb.at) / 2 * k, half = (lb.at - la.at) / 2;
      const a = P.pointAt(q, la.edge, mid - half).p, b = P.pointAt(q, la.edge, mid + half).p;
      const t = C.sub(C.mul(C.add(a, b), 0.5), C.mul(C.add(d.a, d.b), 0.5));
      return { a, b, apex: C.add(d.apex, [t[0], mvIn(d.apex)[1] - d.apex[1]]) };
    }
    return { a: onEdge(d.a), b: onEdge(d.b), apex: mvIn(d.apex) };
  });
  q.marks = pc.marks.map((m) => ({ ...m, p: mvIn(m.p) }));
  q.lines = pc.lines.map((l) => ({ ...l, path: C.mapPath(l.path, mvIn) }));
  if (pc.grain) { const m = C.mul(C.add(pc.grain[0], pc.grain[1]), 0.5), t = C.sub(mvIn(m), m); q.grain = pc.grain.map((g) => C.add(g, t)); }
  return q;
}

// Orantılı kural: x yönü wRatio, y yönü hRatio; sabit nokta = düz boy çizgisinin ortası (yoksa parça merkezi)
export function proportionalRules(pc, wRatio, hRatio) {
  const a = pc.grain ? C.mul(C.add(pc.grain[0], pc.grain[1]), 0.5) : P.centroid(pc);
  return corners(pc).map((p) => [(p[0] - a[0]) * (wRatio - 1), (p[1] - a[1]) * (hRatio - 1)]);
}

// Blok kuralı: aynı blok takımı hedef beden ölçüleriyle çizilir, köşe farkları alınır.
// block = { set, params, index } (buildSet tarafından parçaya yazılır)
export function blockRules(pc, targetParams) {
  const b = pc.block;
  if (!b || !SETS[b.set]) return null;
  const base = buildSet(b.set, b.params).pieces[b.index], tgt = buildSet(b.set, { ...b.params, ...targetParams }).pieces[b.index];
  if (!base || !tgt || base.edges.length !== pc.edges.length || tgt.edges.length !== pc.edges.length) return null;
  // kullanıcı parçayı taşımış olabilir: kural farklardan çıkar, mutlak konumdan değil
  const rules = corners(base).map((p, i) => C.sub(corners(tgt)[i], p));
  // biçim değişmemiş mi (yalnız taşınmış)? öyleyse hedef bedenin eğrileri aynen kullanılabilir
  const off = C.sub(corners(pc)[0], corners(base)[0]);
  const pts = (e) => e.segs.flatMap((s) => (s.t === 'L' ? [s.a, s.b] : [s.a, s.c1, s.c2, s.b]));
  const same = pc.edges.every((e, i) => { const A = pts(e), Bp = pts(base.edges[i]); return A.length === Bp.length && A.every((q, k) => C.dist(q, C.add(Bp[k], off)) < 0.01); });
  rules.exact = same ? tgt.edges.map((e) => C.translate({ segs: e.segs }, off[0], off[1]).segs) : null;
  return rules;
}

// Beden tablosundan blok parametresi: tablo sütunundaki ölçüler blok parametrelerinin üstüne yazılır
export function paramsForSize(set, baseParams, table, size) {
  const o = { ...baseParams };
  for (const [k, [, , src]] of Object.entries(SETS[set].params)) if (src && table.measures[src] && Number.isFinite(table.measures[src][size])) o[k] = table.measures[src][size];
  return o;
}

// Bir grubu (aynı ürün + temel beden) hedef bedenlere yay.
//   opts: { table, base, sizes, method: 'auto' | 'proportional', wMeasure, hMeasure }
// Dönüş: { groups: { [size]: { pieces, seams } }, report: [...] }
export function gradeGroup(pieces, seams, opts) {
  const { table, base, sizes, method = 'auto', wMeasure = 'Göğüs çevresi', hMeasure = 'Boy' } = opts;
  if (!table || !table.sizes.includes(base)) throw new Error('Temel beden tabloda yok: ' + base);
  const ratio = (m, z) => { const r = table.measures[m]; if (!r || !Number.isFinite(r[base]) || !Number.isFinite(r[z]) || r[base] <= 0) return null; return r[z] / r[base]; };
  const out = { groups: {}, report: [] };
  for (const z of sizes) {
    if (z === base) continue;
    if (!table.sizes.includes(z)) throw new Error('Beden tabloda yok: ' + z);
    const idMap = {}, list = [];
    for (const pc of pieces) {
      let rules = null, how = '';
      if (method === 'auto' && pc.block) { rules = blockRules(pc, paramsForSize(pc.block.set, pc.block.params, table, z)); how = 'blok ölçüsünden'; }
      if (!rules) {
        const w = ratio(wMeasure, z) ?? 1, h = ratio(hMeasure, z) ?? 1;
        if (ratio(wMeasure, z) == null && ratio(hMeasure, z) == null) out.report.push({ size: z, piece: pc.name, level: 'uyarı', msg: `"${wMeasure}" / "${hMeasure}" ölçüsü tabloda yok: parça değişmeden kopyalandı` });
        rules = proportionalRules(pc, w, h); how = `orantılı (en ×${w.toFixed(3)}, boy ×${h.toFixed(3)})`;
      }
      let g = applyRules(pc, rules);
      if (rules.exact) {
        // eğriler hedef bedenin bloğundan: kol başı / kol oyuğu gibi eşleşen eğriler tam tutar
        const L0 = g.edges.map(P.edgeLength);
        g.edges.forEach((e, i) => { e.segs = rules.exact[i]; });
        g.notches = g.notches.map((nt) => ({ ...nt, at: nt.at * (P.edgeLength(g.edges[nt.edge]) / (L0[nt.edge] || 1)) }));
        how = 'blok ölçüsünden (eğriler yeniden çizildi)';
      } else if (how.startsWith('blok')) how = 'blok kuralı (biçim değiştirilmiş: eğriler esnetildi)';
      g.id = pc.id.replace(/@[^@]*$/, '') + '@' + z; g.size = z; g.gradedFrom = { id: pc.id, base, how };
      if (g.block) g.block = { ...g.block, params: paramsForSize(g.block.set, g.block.params, table, z) };
      idMap[pc.id] = g.id; list.push(g);
      for (const x of P.validatePiece(g)) if (x.level === 'hata') out.report.push({ size: z, piece: g.name, level: 'hata', msg: x.msg });
    }
    const sms = seams.filter((sm) => [...sm.a, ...sm.b].every((r) => idMap[r.piece])).map((sm) => ({ ...clone(sm), id: sm.id.replace(/@[^@]*$/, '') + '@' + z, a: sm.a.map((r) => ({ ...r, piece: idMap[r.piece] })), b: sm.b.map((r) => ({ ...r, piece: idMap[r.piece] })) }));
    for (const sm of sms) { const r = P.seamCheck(list, sm); if (!r.ok) out.report.push({ size: z, piece: sm.name, level: 'hata', msg: `dikiş eşleşmesi tutmuyor (sapma ${(r.diff / 10).toFixed(2)} cm)` }); }
    out.groups[z] = { pieces: list, seams: sms };
  }
  return out;
}

// Beden karşılaştırma tablosu: her parçanın kenar boyları ve genişlik / boy (dikiş hattı) bedenlere göre
export function sizeTable(groupsBySize) {
  const sizes = Object.keys(groupsBySize), rows = [];
  const first = groupsBySize[sizes[0]] || [];
  for (const pc of first) {
    const key = pc.id.replace(/@[^@]*$/, '');
    const per = sizes.map((z) => (groupsBySize[z] || []).find((q) => q.id.replace(/@[^@]*$/, '') === key));
    const bb = (q) => (q ? P.bboxPts(P.seamPolygon(q, 0.2)) : null);
    rows.push({ piece: pc.name, item: 'Genişlik', vals: per.map((q) => (q ? bb(q).x1 - bb(q).x0 : null)) });
    rows.push({ piece: pc.name, item: 'Boy', vals: per.map((q) => (q ? bb(q).y1 - bb(q).y0 : null)) });
    pc.edges.forEach((e, i) => { if (e.name) rows.push({ piece: pc.name, item: e.name, vals: per.map((q) => (q && q.edges[i] ? P.edgeLength(q.edges[i]) : null)) }); });
  }
  return { sizes, rows };
}
