// Kalıp DXF alışverişi — AAMA / ASTM D6673 düzenine göre (ASCII DXF, R12 varlıkları). Birim mm; DXF'te y yukarı.
// Her parça bir BLOCK; ENTITIES'te INSERT ile yerleşir. Katmanlar (AAMA):
//   1 kesim hattı (sınır) · 2 dönüş noktası (köşe) · 3 eğri noktası · 4 çıt · 6 ayna (kumaş katı) hattı · 7 düz boy
//   8 iç çizgi (pens bacakları dahil) · 13 delik · 14 dikiş hattı · 15 açıklama yazısı · 80 T çıt
// Yazı (15): "Piece Name:", "Size:", "Quantity:", "Material:", "Units: METRIC". Kenar adları DXF'e taşınmaz (biçimde yok).
// UYARI: Biçim tanımı izlenerek yazıldı ve bu modülün kendi okuyucusuyla gidiş-dönüş test edildi; Gerber / Lectra / Optitex
// gibi programlarda içe aktarma DENENMEDİ.
import * as C from '../curve.js?v=20261112k';
import * as P from './pattern.js?v=20261112k';

const TOL = 0.05;
const UNITS = { mm: { insunits: 4, k: 1 }, cm: { insunits: 5, k: 0.1 }, inch: { insunits: 1, k: 1 / 25.4 } };

/* ---------- yazıcı ---------- */
export function writeAAMA(pieces, { units = 'mm', author = 'Cizim Atolyesi' } = {}) {
  const U = UNITS[units]; if (!U) throw new Error('Desteklenmeyen birim: ' + units);
  const out = [], g = (c, v) => out.push(String(c), String(v)), dg = units === 'inch' ? 6 : units === 'cm' ? 5 : 4, f = (v) => (Math.abs(v) < 1e-9 ? '0' : (+v).toFixed(dg));   // ~0,0001 mm çözünürlük
  const T = (p) => [p[0] * U.k, -p[1] * U.k];
  const poly = (pts, layer, closed = true) => { g(0, 'POLYLINE'); g(8, layer); g(66, 1); g(10, 0); g(20, 0); g(30, 0); g(70, closed ? 1 : 0); for (const p of pts) { const q = T(p); g(0, 'VERTEX'); g(8, layer); g(10, f(q[0])); g(20, f(q[1])); g(30, 0); } g(0, 'SEQEND'); g(8, layer); };
  const line = (a, b, layer) => { const p = T(a), q = T(b); g(0, 'LINE'); g(8, layer); g(10, f(p[0])); g(20, f(p[1])); g(30, 0); g(11, f(q[0])); g(21, f(q[1])); g(31, 0); };
  const point = (p, layer) => { const q = T(p); g(0, 'POINT'); g(8, layer); g(10, f(q[0])); g(20, f(q[1])); g(30, 0); };
  const text = (p, s, layer = 15, h = 4) => { const q = T(p); g(0, 'TEXT'); g(8, layer); g(10, f(q[0])); g(20, f(q[1])); g(30, 0); g(40, f(h * U.k)); g(1, s.replace(/[\r\n]/g, ' ')); };
  g(0, 'SECTION'); g(2, 'HEADER'); g(9, '$ACADVER'); g(1, 'AC1009'); g(9, '$INSUNITS'); g(70, U.insunits); g(9, '$MEASUREMENT'); g(70, units === 'inch' ? 0 : 1); g(0, 'ENDSEC');
  g(0, 'SECTION'); g(2, 'BLOCKS');
  const names = new Set();
  pieces.forEach((pc, k) => {
    let bn = (pc.name || 'Parca').replace(/[<>/\\":;?*|=,]/g, '_'); while (names.has(bn)) bn += '_' + k; names.add(bn);
    g(0, 'BLOCK'); g(8, '1'); g(2, bn); g(70, 0); g(10, 0); g(20, 0); g(30, 0); g(3, bn);
    const cut = P.cutPolygon(pc).pts; poly(cut, '1');
    // dikiş hattı: kenar kenar düzleştirilir; kenar başları dönüş noktası (2), eğri iç noktaları (3)
    const sew = [];
    pc.edges.forEach((e) => { const pts = C.flatten({ closed: false, segs: e.segs }, TOL); point(pts[0], '2'); pts.slice(1, -1).forEach((q, i) => { if (e.segs.some((s) => s.t === 'C')) { if (i % 4 === 0) point(q, '3'); } }); sew.push(...pts.slice(0, -1)); });
    poly(sew, '14');
    if (pc.grain) line(pc.grain[0], pc.grain[1], '7');
    if (pc.fold != null) { const e = pc.edges[pc.fold]; line(e.segs[0].a, e.segs.at(-1).b, '6'); }
    for (const nt of pc.notches) for (const [a, b] of P.notchGeom(pc, nt)) line(a, b, nt.kind === 'T' ? '80' : '4');
    for (const d of pc.darts) { poly([d.a, d.apex, d.b], '8', false); point(d.apex, '13'); }
    for (const m of pc.marks) point(m.p, '13');
    for (const l of pc.lines || []) poly(C.flatten(l.path, TOL), '8', false);
    const b = P.bboxPts(cut), c = [(b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2];
    [`Piece Name: ${pc.name}`, `Size: ${pc.size || ''}`, `Quantity: ${pc.qty}${pc.pair ? ' (pair)' : ''}`, `Material: ${pc.fabric}`, `Units: ${units === 'inch' ? 'ENGLISH' : 'METRIC'}`, `Author: ${author}`].forEach((s, i) => text([c[0] - 30, c[1] + i * 6], s));
    g(0, 'ENDBLK'); g(8, '1');
    pc._bn = bn;
  });
  g(0, 'ENDSEC'); g(0, 'SECTION'); g(2, 'ENTITIES');
  for (const pc of pieces) { g(0, 'INSERT'); g(8, '1'); g(2, pc._bn); g(10, 0); g(20, 0); g(30, 0); delete pc._bn; }
  g(0, 'ENDSEC'); g(0, 'EOF');
  return out.join('\n') + '\n';
}

/* ---------- okuyucu ---------- */
// Dönüş: { pieces, warnings, units }
export function readAAMA(txt, { idPrefix = 'dx' } = {}) {
  const L = String(txt).split(/\r?\n/), pairs = [];
  for (let i = 0; i + 1 < L.length; i += 2) { const c = parseInt(L[i].trim(), 10); if (Number.isNaN(c)) throw new Error(`DXF bozuk: ${i + 1}. satırda grup kodu yok`); pairs.push([c, L[i + 1].replace(/\s+$/, '')]); }
  const warnings = []; let insunits = null, section = '', i = 0;
  const blocks = new Map(), top = []; let cur = null;
  const rec = () => { const r = []; i++; while (i < pairs.length && pairs[i][0] !== 0) { r.push(pairs[i]); i++; } return r; };
  const gv = (r, c, d = null) => { const q = r.find((x) => x[0] === c); return q ? q[1] : d; };
  const gn = (r, c, d = 0) => { const v = gv(r, c, null); if (v == null) return d; const x = Number(v); if (!Number.isFinite(x)) throw new Error('DXF bozuk: sayı değil "' + v + '"'); return x; };
  const sink = () => (cur ? cur.ents : top);
  while (i < pairs.length) {
    const [c, v] = pairs[i];
    if (c === 0 && v === 'SECTION') { i++; section = pairs[i]?.[1] || ''; i++; continue; }
    if (c === 9 && v === '$INSUNITS' && section === 'HEADER') { insunits = parseInt(pairs[i + 1]?.[1], 10); i += 2; continue; }
    if (c !== 0) { i++; continue; }
    if (v === 'EOF') break;
    if (v === 'BLOCK') { const r = rec(); cur = { name: gv(r, 2, 'blok'), ents: [] }; continue; }
    if (v === 'ENDBLK') { if (cur) blocks.set(cur.name, cur); cur = null; rec(); continue; }
    if (section !== 'BLOCKS' && section !== 'ENTITIES') { i++; continue; }
    if (v === 'POLYLINE') {
      const r = rec(), layer = gv(r, 8, '0'), closed = (parseInt(gv(r, 70, '0'), 10) & 1) === 1, pts = [];
      while (i < pairs.length && pairs[i][1] === 'VERTEX') { const q = rec(); if (gn(q, 42, 0)) warnings.push('Yaylı (bulge) çoklu çizgi düz kabul edildi'); pts.push([gn(q, 10), gn(q, 20)]); }
      if (pairs[i]?.[1] === 'SEQEND') rec();
      sink().push({ t: 'poly', layer, closed, pts }); continue;
    }
    if (v === 'LWPOLYLINE') {
      const r = rec(), layer = gv(r, 8, '0'), closed = (parseInt(gv(r, 70, '0'), 10) & 1) === 1, pts = [];
      for (const [cc, vv] of r) { if (cc === 10) pts.push([Number(vv), 0]); else if (cc === 20 && pts.length) pts.at(-1)[1] = Number(vv); else if (cc === 42 && Number(vv)) warnings.push('Yaylı (bulge) çoklu çizgi düz kabul edildi'); }
      sink().push({ t: 'poly', layer, closed, pts }); continue;
    }
    if (v === 'LINE') { const r = rec(); sink().push({ t: 'line', layer: gv(r, 8, '0'), a: [gn(r, 10), gn(r, 20)], b: [gn(r, 11), gn(r, 21)] }); continue; }
    if (v === 'POINT') { const r = rec(); sink().push({ t: 'point', layer: gv(r, 8, '0'), p: [gn(r, 10), gn(r, 20)] }); continue; }
    if (v === 'TEXT' || v === 'MTEXT') { const r = rec(); sink().push({ t: 'text', layer: gv(r, 8, '0'), s: gv(r, 1, ''), p: [gn(r, 10), gn(r, 20)] }); continue; }
    if (v === 'INSERT') { const r = rec(); top.push({ t: 'insert', name: gv(r, 2, ''), at: [gn(r, 10), gn(r, 20)], sx: gn(r, 41, 1), sy: gn(r, 42, 1), rot: gn(r, 50, 0) }); continue; }
    if (['ARC', 'CIRCLE', 'SPLINE', 'ELLIPSE'].includes(v)) { const r = rec(); warnings.push(`${v} varlığı desteklenmiyor (katman ${gv(r, 8, '0')}); atlandı`); continue; }
    rec();
  }
  // birim: başlık → yazı → yoksa mm varsay
  const allText = [...top, ...[...blocks.values()].flatMap((b) => b.ents)].filter((e) => e.t === 'text').map((e) => e.s);
  let k = 1, units = 'mm';
  if (insunits === 1 || allText.some((s) => /^units:\s*english/i.test(s))) { k = 25.4; units = 'inch'; } else if (insunits === 5) { k = 10; units = 'cm'; } else if (insunits === 4 || allText.some((s) => /^units:\s*metric/i.test(s))) { k = 1; units = 'mm'; }
  else { warnings.push('Birim belirtilmemiş: milimetre varsayıldı — ölçeği kontrol et'); }
  // parça grupları: INSERT edilen bloklar; blok yoksa üst düzey varlıklar tek grup
  const groups = [];
  for (const ins of top.filter((e) => e.t === 'insert')) {
    const b = blocks.get(ins.name); if (!b) { warnings.push('Tanımsız blok: ' + ins.name); continue; }
    if (Math.abs(ins.rot) > 1e-9 || Math.abs(ins.sx - 1) > 1e-9 || Math.abs(ins.sy - 1) > 1e-9) warnings.push(`Blok ${ins.name}: döndürme / ölçek uygulandı`);
    const a = (ins.rot * Math.PI) / 180, cs = Math.cos(a), sn = Math.sin(a), tf = (p) => { const x = p[0] * ins.sx, y = p[1] * ins.sy; return [ins.at[0] + x * cs - y * sn, ins.at[1] + x * sn + y * cs]; };
    groups.push({ name: ins.name, ents: b.ents.map((e) => ({ ...e, pts: e.pts?.map(tf), a: e.a && tf(e.a), b: e.b && tf(e.b), p: e.p && tf(e.p) })) });
  }
  const loose = top.filter((e) => e.t !== 'insert'); if (loose.length) groups.push(...splitLoose(loose));
  const toMM = (p) => [p[0] * k, -p[1] * k];
  const pieces = [];
  groups.forEach((gr, gi) => {
    try { const pc = buildPiece(gr, toMM, `${idPrefix}${gi + 1}`); if (pc) pieces.push(pc); }
    catch (e) { warnings.push(`${gr.name}: ${e.message}`); }
  });
  if (!pieces.length) throw new Error('DXF\'te kalıp parçası bulunamadı (kapalı kesim hattı, katman 1 / dikiş hattı, katman 14)');
  return { pieces, warnings: [...new Set(warnings)], units };
}
// blok kullanmayan dosya: her kapalı katman-1 çoklu çizgisi bir parça; diğer varlıklar içinde kaldığı parçaya
function splitLoose(ents) {
  const bounds = ents.filter((e) => e.t === 'poly' && e.closed && e.layer === '1');
  if (!bounds.length) return [{ name: 'parça', ents }];
  return bounds.map((b, k) => ({ name: 'parça ' + (k + 1), ents: [b, ...ents.filter((e) => e !== b && !(e.t === 'poly' && e.closed && e.layer === '1') && P.insidePoly(b.pts, e.p || e.a || e.pts?.[0] || [Infinity, 0]))] }));
}
function buildPiece(gr, toMM, id) {
  const E = gr.ents.map((e) => ({ ...e, pts: e.pts?.map(toMM), a: e.a && toMM(e.a), b: e.b && toMM(e.b), p: e.p && toMM(e.p) }));
  const cut = E.find((e) => e.t === 'poly' && e.layer === '1' && e.closed), sew = E.find((e) => e.t === 'poly' && e.layer === '14' && e.closed);
  if (!cut && !sew) return null;
  const warn = [];
  let base = sew ? sew.pts : cut.pts; if (!sew) warn.push('dikiş hattı (14) yok: kesim hattı dikiş hattı alındı, dikiş payı 0');
  base = dedupe(base);
  // dönüş noktalarında kenarlara böl
  const turns = E.filter((e) => e.t === 'point' && e.layer === '2').map((e) => e.p);
  let cutIdx = turns.length ? base.map((p, i) => (turns.some((q) => C.dist(p, q) < 0.05) ? i : -1)).filter((i) => i >= 0) : base.map((_, i) => i);
  if (cutIdx.length < 3) cutIdx = base.map((_, i) => i);
  const edges = [];
  for (let k = 0; k < cutIdx.length; k++) {
    const i0 = cutIdx[k], i1 = cutIdx[(k + 1) % cutIdx.length], pts = [];
    for (let j = i0; ; j = (j + 1) % base.length) { pts.push(base[j]); if (j === i1 && pts.length > 1) break; }
    const segs = []; for (let j = 0; j + 1 < pts.length; j++) segs.push(C.line(pts[j], pts[j + 1]));
    edges.push({ name: '', segs, allow: 0, corner: 'miter' });
  }
  const text = Object.fromEntries(E.filter((e) => e.t === 'text').map((e) => { const m = /^([^:]+):\s*(.*)$/.exec(e.s); return m ? [m[1].trim().toLowerCase(), m[2].trim()] : ['', '']; }));
  const qtyM = /^(\d+)/.exec(text.quantity || '');
  const pc = P.makePiece({ id, name: text['piece name'] || gr.name, size: text.size || '', qty: qtyM ? +qtyM[1] : 1, pair: /pair/i.test(text.quantity || ''), fabric: P.FABRICS[text.material] ? text.material : 'ana', edges });
  // düz boy, kat, pay, çıt, pens, delik, iç çizgi
  const gl = E.find((e) => e.t === 'line' && e.layer === '7'); if (gl) pc.grain = [gl.a, gl.b]; else warn.push('düz boy (7) yok');
  const mir = E.find((e) => e.t === 'line' && e.layer === '6');
  if (mir) { const fi = pc.edges.findIndex((e) => C.dist(e.segs[0].a, mir.a) + C.dist(e.segs.at(-1).b, mir.b) < 0.2 || C.dist(e.segs[0].a, mir.b) + C.dist(e.segs.at(-1).b, mir.a) < 0.2); if (fi >= 0) pc.fold = fi; else warn.push('ayna hattı bir kenarla eşleşmedi'); }
  if (cut && sew) {
    const cp = cut.pts.map((p) => p), dmin = (p) => { let m = Infinity; for (let i = 0; i < cp.length; i++) m = Math.min(m, segDist(p, cp[i], cp[(i + 1) % cp.length])); return m; };
    pc.edges.forEach((e, i) => { if (i === pc.fold) { e.allow = 0; return; } const mid = C.point(e.segs[Math.floor(e.segs.length / 2)], e.segs.length % 2 ? 0.5 : 0); e.allow = Math.round(dmin(mid) * 2) / 2; });
  }
  const notchLines = E.filter((e) => e.t === 'line' && (e.layer === '4' || e.layer === '80'));
  const used = new Set();
  notchLines.forEach((nl, k) => {
    if (used.has(k)) return; used.add(k);
    const twin = notchLines.findIndex((o, j) => !used.has(j) && o.layer === '4' && nl.layer === '4' && C.dist(C.mul(C.add(o.a, o.b), 0.5), C.mul(C.add(nl.a, nl.b), 0.5)) < 4);
    let kind = nl.layer === '80' ? 'T' : 'tek', a = nl.a, b = nl.b;
    if (twin >= 0) { used.add(twin); kind = 'çift'; const o = notchLines[twin]; a = C.mul(C.add(a, o.a), 0.5); b = C.mul(C.add(b, o.b), 0.5); }
    if (nl.layer === '80') { const bar = notchLines.findIndex((o, j) => !used.has(j) && o.layer === '80' && Math.min(C.dist(C.mul(C.add(o.a, o.b), 0.5), nl.a), C.dist(C.mul(C.add(o.a, o.b), 0.5), nl.b)) < 0.5); if (bar >= 0) used.add(bar); }
    const inner = P.insidePoly(base, a) ? a : b, loc = P.locate(pc, inner);
    if (loc) pc.notches.push({ edge: loc.edge, at: Math.round(loc.at * 100) / 100, kind });
  });
  // T çıtın yatay çubuğu ayrı bir çıt değil: yukarıda eşleşen çubuklar atlandı
  for (const d of E.filter((e) => e.t === 'poly' && e.layer === '8' && !e.closed && e.pts.length === 3)) {
    const [a, apex, b] = d.pts, la = P.locate(pc, a), lb = P.locate(pc, b);
    if (la && lb && la.d < 0.5 && lb.d < 0.5) pc.darts.push({ a, b, apex }); else pc.lines.push({ path: C.polyPath(d.pts), kind: 'iç çizgi' });
  }
  for (const d of E.filter((e) => e.t === 'poly' && e.layer === '8' && !(e.pts.length === 3 && !e.closed) && !e.closed)) pc.lines.push({ path: C.polyPath(d.pts), kind: 'iç çizgi' });
  for (const h of E.filter((e) => e.t === 'point' && e.layer === '13')) if (!pc.darts.some((d) => C.dist(d.apex, h.p) < 0.05)) pc.marks.push({ kind: 'delik', p: h.p, label: '' });
  pc.notes = warn.join('; ');
  return pc;
}
function dedupe(pts) { const o = []; for (const p of pts) if (!o.length || C.dist(o.at(-1), p) > 1e-6) o.push(p); if (o.length > 1 && C.dist(o[0], o.at(-1)) < 1e-6) o.pop(); return o; }
function segDist(p, a, b) { const d = C.sub(b, a), L2 = d[0] ** 2 + d[1] ** 2; const t = L2 < 1e-18 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * d[0] + (p[1] - a[1]) * d[1]) / L2)); return C.dist(p, C.add(a, C.mul(d, t))); }
