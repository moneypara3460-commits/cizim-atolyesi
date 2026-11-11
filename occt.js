// OCCT (Open CASCADE Technology) B-Rep çekirdeği köprüsü.
// Gerçek OCCT: vendor/occt/replicad_single.{js,wasm} (OCCT 7.x'in Emscripten/WebAssembly derlemesi,
// replicad-opencascadejs, LGPL-2.1). Bu dosya tarayıcıda (Web Worker içinde) ve Node'da (testler) aynen çalışır.
//
// Koordinatlar uygulamayla aynıdır: Y yukarı, mm. Parça tanımı (desc), app.js'teki parça alanlarıdır:
//   { type: 'box'|'cylinder'|'sphere'|'cone'|'tube', w, l, h, d, d2, di, r, c, tp, x, y, z, rx, ry, rz }
//   ya da tam karşılığı olmayan parçalar için { type: 'tris', pos: Float32Array (dünya koordinatı, üçgen listesi) }
// Parçanın alt orta noktası (0,0,0)'dadır; döndürme Euler XYZ (derece), sonra (x,y,z) taşıma — app.js place() ile aynı.

const RAD = Math.PI / 180;
export const TRIS_MAX = 20000;   // üçgen ağdan katı dikme sınırı (telefonda birkaç saniye)
const pos = (v) => (Number.isFinite(+v) ? +v : 0);

export async function initOCCT(factory, moduleArg = {}) {
  const t0 = Date.now();
  const oc = await factory(moduleArg);
  const K = createKernel(oc);
  K.loadMs = Date.now() - t0;
  return K;
}

export function createKernel(oc) {
  const PR = () => new oc.Message_ProgressRange();
  const gc = [];               // geçici C++ nesneleri: işlem sonunda serbest bırakılır
  const T = (o) => { gc.push(o); return o; };
  const T_ = (f, x) => T(f(x));
  const free = () => { while (gc.length) { const o = gc.pop(); try { o.delete(); } catch (e) { /* zaten serbest */ } } };
  const P = (x, y, z) => T(new oc.gp_Pnt(x, y, z));
  const DIR = (x, y, z) => T(new oc.gp_Dir(x, y, z));
  const AX2 = (p, d) => T(new oc.gp_Ax2(p, d));
  const E = oc.TopAbs_ShapeEnum;

  function each(shape, kind, fn) {
    const ex = new oc.TopExp_Explorer(shape, E[kind], E.TopAbs_SHAPE);
    let i = 0;
    try { for (; ex.More(); ex.Next()) fn(T(ex.Current()), i++); } finally { ex.delete(); }
    return i;
  }
  // benzersiz alt şekil sayısı (gezgin paylaşılan kenarı her yüz için ayrı verir)
  function eachUnique(shape, kind, fn) {
    const buckets = new Map(); let n = 0;
    each(shape, kind, (x) => {
      const h = oc.ReplicadShapeHasher.HashCode(x, 1 << 30);
      const b = buckets.get(h) || [];
      if (b.some((y) => y.IsSame(x))) return;
      b.push(x); buckets.set(h, b); fn(x, n++);
    });
    return n;
  }
  const count = (shape, kind) => eachUnique(shape, kind, () => {});

  // ---- yerleştirme ----
  function transform(shape, d) {
    const rx = pos(d.rx), ry = pos(d.ry), rz = pos(d.rz), x = pos(d.x), y = pos(d.y), z = pos(d.z);
    if (!rx && !ry && !rz && !x && !y && !z) return shape;
    const tr = T(new oc.gp_Trsf());
    tr.SetTranslation(T(new oc.gp_Vec(x, y, z)));
    const O = P(0, 0, 0);
    for (const [a, v] of [[rx, [1, 0, 0]], [ry, [0, 1, 0]], [rz, [0, 0, 1]]]) {
      if (!a) continue;
      const r = T(new oc.gp_Trsf());
      r.SetRotation(T(new oc.gp_Ax1(O, DIR(...v))), a * RAD);
      tr.Multiply(r);   // tr = Ç · Rx · Ry · Rz  (three.js Euler 'XYZ' ile aynı)
    }
    const mk = T(new oc.BRepBuilderAPI_Transform(shape, tr, true, false));
    return T(mk.Shape());
  }

  // ---- kenar seçimi (yuvarlama / pah için) ----
  function edgeInfo(edge) {
    const bb = T(new oc.Bnd_Box());
    oc.BRepBndLib.Add(edge, bb, false);
    const mn = bb.CornerMin(), mx = bb.CornerMax();
    const r = { min: [mn.X(), mn.Y(), mn.Z()], max: [mx.X(), mx.Y(), mx.Z()] };
    mn.delete(); mx.delete();
    const c = T(new oc.BRepAdaptor_Curve(edge));
    r.type = String(c.GetType()).replace('GeomAbs_', '');
    return r;
  }
  function pickEdges(shape, which = 'all') {
    const all = [];
    let ymin = Infinity, ymax = -Infinity;
    eachUnique(shape, 'TopAbs_EDGE', (e) => {
      const ed = T_(oc.TopoDS.Edge, e), inf = edgeInfo(ed);
      all.push({ e: ed, inf });
      ymin = Math.min(ymin, inf.min[1]); ymax = Math.max(ymax, inf.max[1]);
    });
    const tol = Math.max(1e-4, (ymax - ymin) * 1e-6);
    const sel = all.filter(({ inf }) => {
      const flat = inf.max[1] - inf.min[1] < tol;
      if (which === 'all') return true;
      if (which === 'top') return flat && Math.abs(inf.max[1] - ymax) < tol * 10;
      if (which === 'bottom') return flat && Math.abs(inf.min[1] - ymin) < tol * 10;
      if (which === 'vertical') return inf.type === 'Line' && inf.max[0] - inf.min[0] < tol && inf.max[2] - inf.min[2] < tol && inf.max[1] - inf.min[1] > tol;
      if (which === 'circular') return inf.type === 'Circle';
      return false;
    });
    return sel.map((s) => s.e);
  }
  function mustBeValid(s, msg) {
    const an = T(new oc.BRepCheck_Analyzer(s, true, false));
    if (!an.IsValid() || !(volume(s) > 0)) throw new Error(msg);
    return s;
  }
  function fillet(shape, r, which = 'all') {
    if (!(r > 0)) return shape;
    const edges = pickEdges(shape, which);
    if (!edges.length) throw new Error('Yuvarlanacak kenar bulunamadı');
    const mk = T(new oc.BRepFilletAPI_MakeFillet(shape, oc.ChFi3d_FilletShape.ChFi3d_Rational));
    for (const e of edges) mk.Add(r, e);
    mk.Build(PR());
    if (!mk.IsDone()) throw new Error('Yuvarlama yapılamadı (yarıçap kenara göre çok büyük olabilir)');
    return mustBeValid(T(mk.Shape()), 'Yuvarlama sonucu bozuk katı (yarıçap kenara göre çok büyük)');
  }
  function chamfer(shape, dist, which = 'all') {
    if (!(dist > 0)) return shape;
    const edges = pickEdges(shape, which);
    if (!edges.length) throw new Error('Pah kırılacak kenar bulunamadı');
    const mk = T(new oc.BRepFilletAPI_MakeChamfer(shape));
    for (const e of edges) mk.Add(dist, e);
    mk.Build(PR());
    if (!mk.IsDone()) throw new Error('Pah kırılamadı (pah kenara göre çok büyük olabilir)');
    return mustBeValid(T(mk.Shape()), 'Pah sonucu bozuk katı (pah kenara göre çok büyük)');
  }

  // ---- temel katılar (alt orta nokta orijinde, Y yukarı) ----
  const Y = () => AX2(P(0, 0, 0), DIR(0, 1, 0));
  function rectWire(w, l, y) {
    const pts = [[-w / 2, y, -l / 2], [w / 2, y, -l / 2], [w / 2, y, l / 2], [-w / 2, y, l / 2]];
    const mw = T(new oc.BRepBuilderAPI_MakeWire());
    for (let i = 0; i < 4; i++) {
      const a = pts[i], b = pts[(i + 1) % 4];
      mw.Add(T(T(new oc.BRepBuilderAPI_MakeEdge(P(...a), P(...b))).Edge()));
    }
    return T(mw.Wire());
  }
  // Y ekseni etrafında döndürülmüş (r, y) profili — koni ve eğimli silindir için
  function revolveProfile(pts) {
    const mw = T(new oc.BRepBuilderAPI_MakeWire());
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      if (Math.hypot(a[0] - b[0], a[1] - b[1]) < 1e-9) continue;
      mw.Add(T(T(new oc.BRepBuilderAPI_MakeEdge(P(a[0], a[1], 0), P(b[0], b[1], 0))).Edge()));
    }
    const face = T(T(new oc.BRepBuilderAPI_MakeFace(mw.Wire(), true)).Face());
    const ax = T(new oc.gp_Ax1(P(0, 0, 0), DIR(0, 1, 0)));
    return T(T(new oc.BRepPrimAPI_MakeRevol(face, ax, Math.PI * 2, false)).Shape());
  }
  function box(w, h, l, o = {}) {
    let s;
    const tp = Math.min(Math.max(pos(o.tp), 0), 60);
    if (tp > 0.01 && !(o.r > 0.05) && !(o.c > 0.05)) {
      const inset = Math.min(h * Math.tan(tp * RAD), Math.max(Math.min(w, l) / 2 - 0.05, 0.01));
      const ts = T(new oc.BRepOffsetAPI_ThruSections(true, true, 1e-6));
      ts.AddWire(rectWire(w, l, 0)); ts.AddWire(rectWire(w - 2 * inset, l - 2 * inset, h));
      ts.Build(PR());
      s = T(ts.Shape());
    } else s = T(T(new oc.BRepPrimAPI_MakeBox(P(-w / 2, 0, -l / 2), w, h, l)).Shape());
    const r = Math.min(pos(o.r), Math.min(w, h, l) / 2 - 0.01);
    if (r > 0.05) return fillet(s, r);
    const c = Math.min(pos(o.c), Math.min(w, h, l) / 2 - 0.01);
    if (c > 0.05) return chamfer(s, c);
    return s;
  }
  function cylinder(d, h, o = {}) {
    const tp = Math.min(Math.max(pos(o.tp), 0), 60);
    let s;
    if (tp > 0.01 && !(o.r > 0.05) && !(o.c > 0.05)) {
      const d2 = Math.max(d - 2 * h * Math.tan(tp * RAD), 0.1);
      s = revolveProfile([[0, 0], [d / 2, 0], [d2 / 2, h], [0, h]]);
    } else s = T(T(new oc.BRepPrimAPI_MakeCylinder(Y(), d / 2, h)).Shape());
    const r = Math.min(pos(o.r), Math.min(d / 2, h / 2) - 0.01);
    if (r > 0.05) return fillet(s, r, 'circular');
    const c = Math.min(pos(o.c), Math.min(d / 2, h / 2) - 0.01);
    if (c > 0.05) return chamfer(s, c, 'circular');
    return s;
  }
  function cone(d, d2, h, o = {}) {
    d2 = Math.max(pos(d2), 0);
    const s = revolveProfile(d2 > 1e-6 ? [[0, 0], [d / 2, 0], [d2 / 2, h], [0, h]] : [[0, 0], [d / 2, 0], [0, h]]);
    const r = pos(o.r), c = pos(o.c);
    if (r > 0.05) return fillet(s, r, 'circular');
    if (c > 0.05) return chamfer(s, c, 'circular');
    return s;
  }
  function sphere(d) { return T(T(new oc.BRepPrimAPI_MakeSphere(P(0, d / 2, 0), d / 2)).Shape()); }
  function tube(d, di, h, o = {}) {
    di = Math.min(pos(di), d - 0.4);
    let s = T(T(new oc.BRepPrimAPI_MakeCylinder(Y(), d / 2, h)).Shape());
    if (di > 0) s = cut(s, T(T(new oc.BRepPrimAPI_MakeCylinder(AX2(P(0, -1, 0), DIR(0, 1, 0)), di / 2, h + 2)).Shape()));
    const w = (d - Math.max(di, 0)) / 2;
    const r = Math.min(pos(o.r), w / 2 - 0.01, h / 2 - 0.01);
    if (r > 0.05) return fillet(s, r, 'circular');
    const c = Math.min(pos(o.c), w / 2 - 0.01, h / 2 - 0.01);
    if (c > 0.05) return chamfer(s, c, 'circular');
    return s;
  }

  // ---- üçgen ağdan katı (tam karşılığı olmayan parça türleri için; yüzeyler düzlemsel üçgen kalır) ----
  function fromTris(p, tol = 1e-3) {
    const n = (p.length / 9) | 0;
    if (!n) throw new Error('Boş üçgen ağı');
    const sew = T(new oc.BRepBuilderAPI_Sewing(tol, true, true, true, false));
    let added = 0;
    for (let i = 0; i < n; i++) {
      const k = i * 9;
      const a = [p[k], p[k + 1], p[k + 2]], b = [p[k + 3], p[k + 4], p[k + 5]], c = [p[k + 6], p[k + 7], p[k + 8]];
      const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], ac = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
      const cr = Math.hypot(ab[1] * ac[2] - ab[2] * ac[1], ab[2] * ac[0] - ab[0] * ac[2], ab[0] * ac[1] - ab[1] * ac[0]);
      if (cr < 1e-12) continue;   // yozlaşmış üçgen
      const pa = new oc.gp_Pnt(...a), pb = new oc.gp_Pnt(...b), pc = new oc.gp_Pnt(...c);
      const e1 = new oc.BRepBuilderAPI_MakeEdge(pa, pb), e2 = new oc.BRepBuilderAPI_MakeEdge(pb, pc), e3 = new oc.BRepBuilderAPI_MakeEdge(pc, pa);
      if (e1.IsDone() && e2.IsDone() && e3.IsDone()) {
        const mw = new oc.BRepBuilderAPI_MakeWire(T(e1.Edge()), T(e2.Edge()), T(e3.Edge()));
        if (mw.IsDone()) { const mf = new oc.BRepBuilderAPI_MakeFace(T(mw.Wire()), true); if (mf.IsDone()) { sew.Add(T(mf.Face())); added++; } mf.delete(); }
        mw.delete();
      }
      e1.delete(); e2.delete(); e3.delete(); pa.delete(); pb.delete(); pc.delete();
    }
    if (!added) throw new Error('Geçerli üçgen yok');
    sew.Perform(PR());
    const fe = sew.NbFreeEdges();
    if (fe > 0) throw new Error('Üçgen ağı kapalı değil (' + fe + ' açık kenar): katı oluşturulamaz');
    const sh = T(sew.SewedShape());
    // kapalı kabuk(lar)dan katı
    const ms = T(new oc.BRepBuilderAPI_MakeSolid());
    let shells = 0;
    each(sh, 'TopAbs_SHELL', (s) => { ms.Add(T_(oc.TopoDS.Shell, s)); shells++; });
    if (!shells) throw new Error('Üçgen ağı kapalı bir kabuk oluşturmadı');
    let solid = T(ms.Solid());
    const fx = T(new oc.ShapeFix_Solid(solid));
    fx.Perform(PR());
    solid = T(fx.Solid());
    if (volume(solid) < 0) solid = T(solid.Reversed());
    return solid;
  }

  // ---- parça tanımından katı ----
  function partShape(d) {
    const v = (k, def = 1) => (Number.isFinite(+d[k]) && +d[k] > 0 ? +d[k] : def);
    let s;
    switch (d.type) {
      case 'box': s = box(v('w'), v('h'), v('l'), d); break;
      case 'cylinder': s = cylinder(v('d'), v('h'), d); break;
      case 'sphere': s = sphere(v('d')); break;
      case 'cone': s = cone(v('d'), Math.max(pos(d.d2), 0), v('h'), d); break;
      case 'tube': s = tube(v('d'), pos(d.di), v('h'), d); break;
      case 'tris':
        if (d.pos.length / 9 > TRIS_MAX) throw new Error('çok ayrıntılı ağ (' + Math.round(d.pos.length / 9) + ' üçgen, sınır ' + TRIS_MAX + ')');
        return fromTris(d.pos);
      case 'brep': s = fromBREP(d.brep); break;   // daha önce OCCT ile üretilmiş parça (yerel koordinatta)
      default: throw new Error('Desteklenmeyen tür: ' + d.type);
    }
    return transform(s, d);
  }

  // ---- Boolean ----
  function boolOp(Cls, a, b, name) {
    const op = T(new Cls(a, b, PR()));
    if (!op.IsDone() || op.HasErrors()) throw new Error(name + ' işlemi başarısız');
    return T(op.Shape());
  }
  const fuse = (a, b) => boolOp(oc.BRepAlgoAPI_Fuse, a, b, 'Birleştirme');
  const cut = (a, b) => boolOp(oc.BRepAlgoAPI_Cut, a, b, 'Çıkarma');
  const common = (a, b) => boolOp(oc.BRepAlgoAPI_Common, a, b, 'Kesişim');
  // uygulamadaki sıra: 1. parça taban, sonra her parça birleşir ya da (oyuk ise) çıkarılır
  function model(descs) {
    let s = null; const skipped = [];
    for (const d of descs) {
      let ps;
      try { ps = partShape(d); } catch (e) { skipped.push({ name: d.name, why: e.message }); continue; }
      if (!s) { if (d.op !== 'sub') s = ps; continue; }
      s = d.op === 'sub' ? cut(s, ps) : fuse(s, ps);
    }
    if (!s) throw new Error('Modelde katı parça yok');
    return { shape: s, skipped };
  }

  // ---- ölçüm / doğrulama ----
  function volume(s) { const g = T(new oc.GProp_GProps()); oc.BRepGProp.VolumeProperties(s, g, false, false, false); return g.Mass(); }
  function props(s) {
    const g = T(new oc.GProp_GProps()); oc.BRepGProp.VolumeProperties(s, g, false, false, false);
    const a = T(new oc.GProp_GProps()); oc.BRepGProp.SurfaceProperties(s, a, false, false);
    const c = g.CentreOfMass();
    const bb = T(new oc.Bnd_Box()); oc.BRepBndLib.Add(s, bb, false);
    const mn = bb.CornerMin(), mx = bb.CornerMax();
    const r = { volume: g.Mass(), area: a.Mass(), center: [c.X(), c.Y(), c.Z()], bbox: { min: [mn.X(), mn.Y(), mn.Z()], max: [mx.X(), mx.Y(), mx.Z()] } };
    c.delete(); mn.delete(); mx.delete();
    return r;
  }
  function check(s) {
    const an = T(new oc.BRepCheck_Analyzer(s, true, false));
    const r = {
      valid: an.IsValid(), solids: count(s, 'TopAbs_SOLID'), shells: count(s, 'TopAbs_SHELL'),
      faces: count(s, 'TopAbs_FACE'), edges: count(s, 'TopAbs_EDGE'), vertices: count(s, 'TopAbs_VERTEX'), problems: [],
    };
    if (!r.valid) r.problems.push('BRepCheck: topoloji / geometri hatası var');
    if (!r.solids) r.problems.push('Katı (solid) yok: açık yüzey ya da kabuk');
    const v = r.solids ? volume(s) : 0;
    if (r.solids && !(v > 0)) r.problems.push('Hacim sıfır ya da negatif (yüz yönleri ters)');
    r.volume = v;
    return r;
  }
  function fix(s) {
    let out = s;
    each(s, 'TopAbs_SOLID', () => {});
    const fx = T(new oc.ShapeFix_Solid());
    if (count(s, 'TopAbs_SOLID') === 1) {
      let so = null; each(s, 'TopAbs_SOLID', (x) => { so = T_(oc.TopoDS.Solid, x); });
      fx.Init(so); fx.Perform(PR()); out = T(fx.Solid());
    }
    return out;
  }

  // ---- CAM için geometri: yüz ve kenar türleri (düzlem, silindir, koni...; eksen, yarıçap) ----
  function topology(s) {
    const faces = [], edges = [];
    each(s, 'TopAbs_FACE', (f) => {
      const face = T_(oc.TopoDS.Face, f);
      const ad = T(new oc.BRepAdaptor_Surface(face, true));
      const type = String(ad.GetType()).replace('GeomAbs_', '');
      const g = T(new oc.GProp_GProps()); oc.BRepGProp.SurfaceProperties(face, g, false, false);
      const c = g.CentreOfMass();
      const o = { type, area: g.Mass(), center: [c.X(), c.Y(), c.Z()] };
      c.delete();
      if (type === 'Plane') { const pl = ad.Plane(), ax = pl.Axis(), dd = ax.Direction(); o.normal = [dd.X(), dd.Y(), dd.Z()]; if (face.Orientation() === oc.TopAbs_Orientation.TopAbs_REVERSED) o.normal = o.normal.map((x) => -x); dd.delete(); ax.delete(); pl.delete(); }
      if (type === 'Cylinder') { const cy = ad.Cylinder(), ax = cy.Axis(), dd = ax.Direction(), lo = ax.Location(); o.radius = cy.Radius(); o.axis = [dd.X(), dd.Y(), dd.Z()]; o.origin = [lo.X(), lo.Y(), lo.Z()]; dd.delete(); lo.delete(); ax.delete(); cy.delete(); }
      // koni / küre / torus ayrıntısı bu derlemede bağlı değil (gp_Cone, gp_Torus): yalnız tür ve alan verilir
      if (type === 'Sphere') { try { const sp = ad.Sphere(); o.radius = sp.Radius(); sp.delete(); } catch (e) { /* bağlı değil */ } }
      faces.push(o);
    });
    eachUnique(s, 'TopAbs_EDGE', (e) => {
      const ed = T_(oc.TopoDS.Edge, e);
      const c = T(new oc.BRepAdaptor_Curve(ed));
      const type = String(c.GetType()).replace('GeomAbs_', '');
      const g = T(new oc.GProp_GProps()); oc.BRepGProp.LinearProperties(ed, g, false, false);
      const o = { type, length: g.Mass() };
      if (type === 'Circle') { const ci = c.Circle(); o.radius = ci.Radius(); const lo = ci.Location(); o.center = [lo.X(), lo.Y(), lo.Z()]; lo.delete(); ci.delete(); }
      edges.push(o);
    });
    const cnt = (arr) => arr.reduce((m, o) => ((m[o.type] = (m[o.type] || 0) + 1), m), {});
    return { faces, edges, faceTypes: cnt(faces), edgeTypes: cnt(edges) };
  }

  // ---- Three.js'e aktarım: üçgenler (yüz grupları ile) ve kenar çizgileri ----
  function mesh(s, tol = 0.05, angTol = 0.3) {
    const data = oc.ReplicadMeshExtractor.extract(s, tol, angTol, false);
    try {
      const buf = oc.wasmMemory.buffer;
      const vp = data.getVerticesPtr(), vn = data.getVerticesSize();
      const np = data.getNormalsPtr(), nn = data.getNormalsSize();
      const tp = data.getTrianglesPtr(), tn = data.getTrianglesSize();
      const gp = data.getFaceGroupsPtr(), gn = data.getFaceGroupsSize();
      const positions = new Float32Array(buf, vp, vn).slice();
      const normals = nn ? new Float32Array(buf, np, nn).slice() : null;
      const index = new Uint32Array(buf, tp, tn).slice();
      const fg = new Int32Array(buf, gp, gn).slice();
      const groups = [];
      for (let i = 0; i + 2 < fg.length; i += 3) groups.push({ start: fg[i], count: fg[i + 1], face: i / 3 });
      return { positions, normals, index, groups };
    } finally { data.delete(); }
  }
  function edgeLines(s, tol = 0.05, angTol = 0.3) {
    const data = oc.ReplicadEdgeMeshExtractor.extract(s, tol, angTol);
    try {
      const buf = oc.wasmMemory.buffer;
      const lines = new Float32Array(buf, data.getLinesPtr(), data.getLinesSize()).slice();
      const eg = new Int32Array(buf, data.getEdgeGroupsPtr(), data.getEdgeGroupsSize()).slice();
      // her kenar bir çoklu çizgi: {start, count} (nokta sayısı) -> LineSegments için çiftlere aç
      const seg = [];
      for (let i = 0; i + 2 < eg.length; i += 3) {
        const st = eg[i], n = eg[i + 1];
        for (let k = st; k < st + n - 1; k++) seg.push(lines[k * 3], lines[k * 3 + 1], lines[k * 3 + 2], lines[k * 3 + 3], lines[k * 3 + 4], lines[k * 3 + 5]);
      }
      return new Float32Array(seg);
    } finally { data.delete(); }
  }
  // dizinli ağı dizinsiz üçgen listesine aç (uygulamanın 'mesh' parçası ve STL için)
  function triangles(m) {
    const n = m.index.length, p = new Float32Array(n * 3), q = m.normals ? new Float32Array(n * 3) : null;
    for (let i = 0; i < n; i++) {
      const v = m.index[i];
      p[i * 3] = m.positions[v * 3]; p[i * 3 + 1] = m.positions[v * 3 + 1]; p[i * 3 + 2] = m.positions[v * 3 + 2];
      if (q) { q[i * 3] = m.normals[v * 3]; q[i * 3 + 1] = m.normals[v * 3 + 1]; q[i * 3 + 2] = m.normals[v * 3 + 2]; }
    }
    return { pos: p, nor: q };
  }

  // ---- dosya: STEP (içe / dışa), BREP (proje içinde saklamak için) ----
  let fileN = 0;
  function toSTEP(shapes) {
    const list = Array.isArray(shapes) ? shapes : [shapes];
    const w = T(new oc.STEPControl_Writer());
    for (const s of list) {
      const st = w.Transfer(s, oc.STEPControl_StepModelType.STEPControl_AsIs, true, PR());
      if (String(st) !== 'IFSelect_RetDone' && st !== oc.IFSelect_ReturnStatus?.IFSelect_RetDone) throw new Error('STEP aktarımı başarısız');
    }
    const fn = '/out' + (++fileN) + '.step';
    const st = w.Write(fn);
    if (String(st) !== 'IFSelect_RetDone' && st !== oc.IFSelect_ReturnStatus?.IFSelect_RetDone) throw new Error('STEP yazılamadı');
    const txt = oc.FS.readFile(fn, { encoding: 'utf8' });
    oc.FS.unlink(fn);
    return txt;
  }
  function fromSTEP(text) {
    const fn = '/in' + (++fileN) + '.step';
    oc.FS.writeFile(fn, text);
    try {
      const r = T(new oc.STEPControl_Reader());
      const st = r.ReadFile(fn);
      if (String(st) !== 'IFSelect_RetDone' && st !== oc.IFSelect_ReturnStatus?.IFSelect_RetDone) throw new Error('STEP dosyası okunamadı');
      const n = r.TransferRoots(PR());
      if (!n) throw new Error('STEP dosyasında aktarılabilir şekil yok');
      return T(r.OneShape());
    } finally { try { oc.FS.unlink(fn); } catch (e) { /* yok */ } }
  }
  const toBREP = (s) => oc.BRepToolsWrapper.Write(s);
  const fromBREP = (txt) => T(oc.BRepToolsWrapper.Read(txt));

  return {
    oc, free, transform, fillet, chamfer, box, cylinder, cone, sphere, tube, fromTris, partShape,
    fuse, cut, common, model, volume, props, check, fix, topology, mesh, edgeLines, triangles,
    toSTEP, fromSTEP, toBREP, fromBREP, count,
  };
}
