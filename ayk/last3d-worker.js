// 3D kalıp ağır işleri (dosya okuma, sadeleştirme, yön bulma, görünüş çıkarma) arka planda: sayfa donmasın.
import * as L3 from './last3d.js?v=20261119b';

// Ortak iş: hem bu işçide hem (işçi açılamazsa) sayfada çalışır.
export function run(op, a) {
  if (op === 'prepare') {
    const P = L3.parseMeshFile(a.name, a.bytes);
    const r = L3.prepare(P, { expectedMm: a.expectedMm });
    const views = L3.allViews(r.mesh, r.outer);
    return { enc: L3.encodeMesh(r.mesh), meta: { unit: r.unit, inTris: r.inTris, outer: r.outer, open: r.check.open }, unitSure: r.unitSure, dims: r.dims, views };
  }
  if (op === 'views') {
    let m = L3.decodeMesh(a.enc), outer = a.outer;
    if (a.act === 'toe') m = L3.flipToe(m);
    else if (a.act === 'sole') m = L3.flipSole(m);
    else if (a.act === 'rot') m = L3.rot90(m);
    else if (a.act === 'unit') m = L3.rescale(m, a.factor);
    else if (a.act === 'side') outer = -outer;
    return { enc: a.act === 'side' || a.act === 'none' ? a.enc : L3.encodeMesh(m), outer, views: L3.allViews(m, outer) };
  }
  throw new Error('bilinmeyen iş: ' + op);
}
const isWorker = typeof WorkerGlobalScope !== 'undefined' && self instanceof WorkerGlobalScope;
if (isWorker) {
  self.onmessage = (e) => {
    const { id, op, args } = e.data;
    try {
      const out = run(op, args), tr = Object.values(out.views || {}).map((v) => v.rec.rgba.buffer);
      self.postMessage({ id, ok: true, out }, tr);
    } catch (err) { self.postMessage({ id, ok: false, error: err.message || String(err) }); }
  };
}
