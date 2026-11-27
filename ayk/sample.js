// Örnek stampa: alçak kesim derby'nin basitleştirilmiş üç parçası (ön saya, yan saya, dil).
// Eğitim / deneme amaçlıdır; gerçek bir kalıptan alınmamıştır. Yalnız kullanıcı "Örnek ekle" derse eklenir.
import { makePath, node, autoSmooth } from './geom.js?v=20261119c';
import { makePiece, setEdgeProp, nextPieceNo } from './model.js?v=20261127a';
import { makeMatch } from './match.js?v=20261119c';

function outline(spec) {
  // spec: [[x, y, 'k'|'s', brk?]] — k: köşe, s: yumuşak
  const np = makePath(spec.map(([x, y, , brk]) => node([x, y], { brk: !!brk })), true);
  spec.forEach((q, i) => { if (q[2] === 's') autoSmooth(np, i); });
  return np;
}
export function addSample(project, materialId = null) {
  const ox = 0, oy = 0, no = nextPieceNo(project);
  const vamp = makePiece({ no, name: 'Ön saya', code: 'OS-01', kind: 'Ön saya', side: 'cift', qty: 2, material: materialId,
    outline: outline([[150, 20, 'k', 1], [90, 8, 's'], [30, 24, 's'], [0, 62, 'k', 1], [8, 100, 's'], [60, 118, 's'], [200, 118, 'k', 1], [186, 38, 'k', 1]].map(([x, y, t, b]) => [x + ox, y + oy, t, b])) });
  const qtr = makePiece({ no: no + 1, name: 'Yan saya', code: 'YS-01', kind: 'Yan saya', side: 'cift', qty: 2, material: materialId,
    outline: outline([[262, 30, 'k', 1], [250, 110, 'k', 1], [330, 118, 's'], [420, 112, 'k', 1], [425, 60, 's'], [415, 20, 'k', 1], [340, 8, 's']].map(([x, y, t, b]) => [x + ox, y + oy, t, b])) });
  const tng = makePiece({ no: no + 2, name: 'Dil', code: 'DL-01', kind: 'Dil', side: 'cift', qty: 2, material: materialId,
    outline: outline([[20, 300, 'k', 1], [80, 300, 'k', 1], [85, 200, 's'], [50, 160, 's'], [15, 200, 's']].map(([x, y, t, b]) => [x + ox, y + oy + 0, t, b])) });
  const ids = (pc) => pc.outline.nodes.filter((n) => n.brk).map((n) => n.id);
  const [v1, v2, v3, v4] = ids(vamp);
  setEdgeProp(vamp, v1, { name: 'Dil ağzı', kind: 'katlama', stitch: { on: true, dist: 1.5 } });
  setEdgeProp(vamp, v2, { name: 'Kalıba çekme', kind: 'montaj' });
  setEdgeProp(vamp, v3, { name: 'Yan saya altı', kind: 'binme' });
  setEdgeProp(vamp, v4, { name: 'Boğaz', kind: 'katlama', stitch: { on: true, dist: 1.5 } });
  const [q1, q2, q3, q4] = ids(qtr);
  setEdgeProp(qtr, q1, { name: 'Ön (ön sayaya biner)', kind: 'katlama', stitch: { on: true, dist: 1.5, rows: 2, gap: 2.5 } });
  setEdgeProp(qtr, q2, { name: 'Kalıba çekme', kind: 'montaj' });
  setEdgeProp(qtr, q3, { name: 'Arka dikiş', kind: 'dikis' });
  setEdgeProp(qtr, q4, { name: 'Üst ağız', kind: 'katlama', stitch: { on: true, dist: 1.5 } });
  const [t1, t2] = ids(tng);
  setEdgeProp(tng, t1, { name: 'Ön saya altı', kind: 'binme' });
  setEdgeProp(tng, t2, { name: 'Dil kenarı', kind: 'kenar' });
  // eşleştirme işaretleri
  vamp.marks.push({ id: 'mk' + Math.random().toString(36).slice(2, 7), kind: 'centik', edge: v3, at: 29, label: 'A', depth: 3 });
  qtr.marks.push({ id: 'mk' + Math.random().toString(36).slice(2, 7), kind: 'centik', edge: q1, at: 52, label: 'A', depth: 3 });
  vamp.marks.push({ id: 'mk' + Math.random().toString(36).slice(2, 7), kind: 'binme', edge: v1, at: 70, label: '' });
  qtr.lines.push({ id: 'ln' + Math.random().toString(36).slice(2, 7), kind: 'merkez', path: makePath([[340, 14], [335, 110]], false) });
  for (let k = 0; k < 4; k++) qtr.marks.push({ id: 'mk' + k + Math.random().toString(36).slice(2, 6), kind: 'delik', p: [282 + k * 4, 40 + k * 18], d: 4, label: k ? '' : 'Bağcık deliği Ø4' });
  project.pieces.push(vamp, qtr, tng);
  project.matches.push(makeMatch({ name: 'Yan saya ön ↔ ön saya', a: { piece: qtr.id, edge: q1 }, b: { piece: vamp.id, edge: v3 }, kind: 'binme', reverse: true, tol: 1 }));
  return [vamp, qtr, tng];
}
