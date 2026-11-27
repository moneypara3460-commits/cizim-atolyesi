// Ayakkabı numara serisi (grading): taban numarada çizilmiş parçalar öteki numaralara orantılı büyütülür / küçültülür.
// Boy (kalıp boyu yönü, x) numara başına boy artışıyla, yükseklik (y) çevre artışıyla ölçeklenir:
//   sx = 1 + Δn · Δboy / L      sy = 1 + Δn · Δçevre / Ç
// L: taban kalıp boyu (yan görünüş), Ç: taban topuk-tarak çevresi (girilmezse 0,9 · L tahmini).
// Sistemler: Fransız (Paris noktası, EU) 6,67 mm boy / 5 mm çevre; İngiliz (UK / US) 8,47 mm (1/3 inç) / 6,35 mm (1/4 inç).
// Paylar, dikiş aralığı, delik çapları ve çentik derinliği mm olarak kalır (ölçeklenmez); kenar üstündeki işaretler kenar boyuyla taşınır.
// Bu orantılı (doğrusal) seridir; firmanın kalıp serisi farklı artış kullanıyorsa Δ değerleri değiştirilir. Gerçek kalıp serisiyle kontrol edilmelidir.
import * as G from './geom.js?v=20261119c';
import { transformPiece, edgeProp } from './model.js?v=20261127a';

export const SYSTEMS = {
  EU: { name: 'EU (Paris noktası)', dL: 20 / 3, dG: 5, step: 0.5 },
  UK: { name: 'UK', dL: 25.4 / 3, dG: 6.35, step: 0.5 },
  US: { name: 'US', dL: 25.4 / 3, dG: 6.35, step: 0.5 },
};
export function sizeList(from, to, step = 1) {
  const out = []; const a = Math.min(from, to), b = Math.max(from, to), st = Math.max(0.5, step);
  for (let s = a; s <= b + 1e-9 && out.length < 40; s += st) out.push(+s.toFixed(1));
  return out;
}
// taban kalıp boyu: yan görünüş varsa ondan, yoksa parçaların toplam eni
export function baseLength(project) {
  const v = project.last?.views?.yan;
  if (v && v.length > 0) return v.length;
  const b = G.unionBox(project.pieces.filter((q) => q.outline.closed).map((q) => G.bbox(q.outline)).filter(Boolean));
  return b ? b.x1 - b.x0 : 260;
}
export function factors(project, size, o = {}) {
  const sys = SYSTEMS[o.system || project.sizeSystem] || SYSTEMS.EU, base = Number(o.base ?? project.size);
  if (!Number.isFinite(base)) throw new Error('Taban numara sayı olmalı (ör. 40)');
  const L = o.L || baseLength(project), Gc = o.girth || 0.9 * L, dn = size - base;
  const dL = o.dL ?? sys.dL, dG = o.dG ?? sys.dG;
  return { sx: 1 + dn * dL / L, sy: 1 + dn * dG / Gc, dn, L, girth: Gc, dL, dG };
}
// ölçek merkezi: kalıp yan görünüşünün topuk-taban köşesi (yoksa parçaların ortak kutusunun sol-alt köşesi)
function origin(project) {
  const v = project.last?.views?.yan;
  const b = v ? G.bbox(v.outline) : G.unionBox(project.pieces.filter((q) => q.outline.closed).map((q) => G.bbox(q.outline)).filter(Boolean));
  if (!b) return [0, 0];
  return v ? [b.x0 + v.at[0], b.y1 + v.at[1]] : [b.x0, b.y1];
}
// tek parçanın numara kopyası (aynı düğüm kimlikleri: kenar özellikleri ve eşleşmeler geçerli kalır)
export function gradePiece(pc, f, o) {
  const c = JSON.parse(JSON.stringify(pc));
  const before = new Map(pc.outline.closed ? G.edges(pc.outline).map((e) => [e.id, G.edgeLength(e)]) : []);
  transformPiece(c, (p) => [o[0] + (p[0] - o[0]) * f.sx, o[1] + (p[1] - o[1]) * f.sy]);
  if (c.outline.closed) {
    const after = new Map(G.edges(c.outline).map((e) => [e.id, G.edgeLength(e)]));
    for (const m of c.marks) if (m.edge && before.get(m.edge) > 0 && after.has(m.edge)) m.at = +(m.at * after.get(m.edge) / before.get(m.edge)).toFixed(2);
  }
  return c;
}
export function gradeProject(project, size, opt = {}) {
  const f = factors(project, size, opt), o = origin(project);
  const pieces = project.pieces.filter((q) => q.outline.closed && (!opt.pieces || opt.pieces.includes(q.id))).map((pc) => ({ ...gradePiece(pc, f, o), size }));
  return { size, f, pieces };
}
// numara tablosu: her parçanın boy × en (net) ölçüsü
export function sizeTable(project, sizes, opt = {}) {
  return sizes.map((s) => { const g = gradeProject(project, s, opt); return { size: s, f: g.f, dims: g.pieces.map((pc) => { const b = G.bbox(pc.outline); return { id: pc.id, w: b.x1 - b.x0, h: b.y1 - b.y0 }; }) }; });
}
export { edgeProp };
