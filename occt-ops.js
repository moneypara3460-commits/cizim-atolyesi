// OCCT işlemleri: işçi (occt-worker.js) ve testler aynı kodu kullanır.
// Her işlem düz veri döndürür (Float32Array, metin); OCCT nesneleri işlem sonunda serbest bırakılır.

const BREP_MAX = 3e6;   // proje içinde saklanacak en büyük B-Rep metni (karakter); üstü yalnız ağ olarak saklanır

function quality(K, s) {
  const b = K.props(s).bbox, diag = Math.hypot(b.max[0] - b.min[0], b.max[1] - b.min[1], b.max[2] - b.min[2]) || 1;
  return { tol: Math.min(1, Math.max(0.01, diag * 0.0008)), ang: 0.25 };
}
// Three.js'e gidecek görüntü verisi
function view(K, s) {
  const q = quality(K, s);
  const m = K.mesh(s, q.tol, q.ang);
  return { positions: m.positions, normals: m.normals, index: m.index, groups: m.groups, lines: K.edgeLines(s, q.tol, q.ang) };
}
// CAM / üretim için özet: yüz ve kenar türleri, silindirik yüzler (delik / mil çapları), düzlemler
function camSummary(topo) {
  const cyl = new Map();
  for (const f of topo.faces) if (f.type === 'Cylinder') {
    const k = (2 * f.radius).toFixed(3) + '|' + f.axis.map((v) => Math.abs(v).toFixed(3)).join(',');
    const c = cyl.get(k) || { d: 2 * f.radius, axis: f.axis.map((v) => Math.abs(v) < 1e-9 ? 0 : v), n: 0 };
    c.n++; cyl.set(k, c);
  }
  const planes = topo.faces.filter((f) => f.type === 'Plane');
  const axisPlanes = planes.filter((f) => f.normal && f.normal.some((v) => Math.abs(Math.abs(v) - 1) < 1e-6)).length;
  return { faceTypes: topo.faceTypes, edgeTypes: topo.edgeTypes, cylinders: [...cyl.values()].sort((a, b) => a.d - b.d), planes: planes.length, axisPlanes };
}
// uygulamaya parça olarak eklenecek veri: yerel koordinat (alt orta = 0) + konum
function asPart(K, s) {
  const pr = K.props(s), b = pr.bbox;
  const cx = (b.min[0] + b.max[0]) / 2, cz = (b.min[2] + b.max[2]) / 2, y0 = b.min[1], h = Math.max(b.max[1] - b.min[1], 1e-3);
  const local = K.transform(s, { x: -cx, y: -y0, z: -cz });
  const q = quality(K, s);
  const t = K.triangles(K.mesh(local, q.tol, q.ang));
  for (let i = 1; i < t.pos.length; i += 3) t.pos[i] -= h / 2;   // uygulamadaki ağ parçası: orta yükseklik 0
  let brep = K.toBREP(local);
  if (brep.length > BREP_MAX) brep = null;
  return { tris: t, brep, x: cx, y: y0, z: cz, h };
}
function full(K, s, extra = {}) {
  const chk = K.check(s);
  return { ...extra, check: chk, props: K.props(s), cam: camSummary(K.topology(s)), view: view(K, s) };
}

export async function runOp(K, op, a, ctx = {}) {
  switch (op) {
    case 'init': return { loadMs: K.loadMs };
    case 'model': {
      const m = K.model(a.descs || []);
      return full(K, m.shape, { skipped: m.skipped });
    }
    case 'bool': {
      const A = K.partShape(a.a), B = K.partShape(a.b);
      const s = a.op === 'fuse' ? K.fuse(A, B) : a.op === 'cut' ? K.cut(A, B) : K.common(A, B);
      if (!(K.volume(s) > 1e-9)) throw new Error(a.op === 'common' ? 'Parçalar kesişmiyor: ortak hacim yok' : 'Sonuçta hacim kalmadı');
      const r = full(K, s);
      r.part = asPart(K, s);
      return r;
    }
    case 'edge': {
      const S = K.partShape(a.desc);
      const s = a.kind === 'chamfer' ? K.chamfer(S, +a.r, a.which || 'all') : K.fillet(S, +a.r, a.which || 'all');
      const r = full(K, s);
      r.part = asPart(K, s);
      return r;
    }
    case 'fix': {
      const S = K.partShape(a.desc), s = K.fix(S);
      const r = full(K, s);
      r.part = asPart(K, s);
      return r;
    }
    case 'step-out': {
      const m = K.model(a.descs || []);
      return { text: K.toSTEP(m.shape), check: K.check(m.shape), skipped: m.skipped };
    }
    case 'step-in': {
      const s = K.fromSTEP(a.text);
      const r = full(K, s);
      r.part = asPart(K, s);
      return r;
    }
    case 'iges-in': {
      if (!ctx.iges) throw new Error('IGES okuyucu yok');
      const IG = await ctx.iges();
      const res = IG.ReadIgesFile(a.bytes, { linearUnit: 'millimeter', linearDeflectionType: 'bounding_box_ratio', linearDeflection: 0.001, angularDeflection: 0.3 });
      if (!res || !res.success || !res.meshes.length) throw new Error('IGES dosyası okunamadı');
      // eksenler dosyadaki gibi alınır (STEP içe aktarmayla aynı); gerekirse parça Döndür sekmesinden çevrilir
      const tri = [];
      for (const m of res.meshes) {
        const P = m.attributes.position.array, I = m.index.array;
        for (let i = 0; i < I.length; i++) { const v = I[i] * 3; tri.push(P[v], P[v + 1], P[v + 2]); }
      }
      const pos = new Float32Array(tri), nTri = pos.length / 9;
      let s = null, note = '';
      if (nTri <= 20000) {
        try { s = K.fromTris(pos, 1e-3); } catch (e) { note = 'B-Rep katıya dönüştürülemedi: ' + e.message; }
      } else note = 'Çok ayrıntılı (' + nTri + ' üçgen): yalnız görüntü ağı olarak alındı';
      if (s) { const r = full(K, s, { note: 'IGES yüzeyleri üçgenlere bölünüp B-Rep katı olarak dikildi (yüzeyler düzlemsel üçgen)' }); r.part = asPart(K, s); return r; }
      // yalnız ağ: yerel koordinata (alt orta = 0, orta yükseklik 0) taşı
      let x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity;
      for (let i = 0; i < pos.length; i += 3) { x0 = Math.min(x0, pos[i]); x1 = Math.max(x1, pos[i]); y0 = Math.min(y0, pos[i + 1]); y1 = Math.max(y1, pos[i + 1]); z0 = Math.min(z0, pos[i + 2]); z1 = Math.max(z1, pos[i + 2]); }
      const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, my = (y0 + y1) / 2;
      for (let i = 0; i < pos.length; i += 3) { pos[i] -= cx; pos[i + 1] -= my; pos[i + 2] -= cz; }
      return { note, meshOnly: true, part: { tris: { pos, nor: null }, brep: null, x: cx, y: y0, z: cz, h: Math.max(y1 - y0, 1e-3) } };
    }
    // CNC torna: hedef parça ile simülasyon sonucunun dönel katıları (kesit çokgeni [r, y]) — hacimler ve iki yönlü fark
    case 'lathe-verify': {
      const A = K.revolveProfile(a.target), B = K.revolveProfile(a.result);
      const vol = (s) => { try { return Math.abs(K.volume(s)); } catch (e) { return 0; } };
      const ca = K.check(A), cb = K.check(B);
      const vA = vol(A), vB = vol(B);
      // fark: önce Boolean çıkarma; çakışık yüzlerde başarısız olursa ortak hacimden (A − A∩B)
      const diff = (X, Y, vX) => { try { return vol(K.cut(X, Y)); } catch (e) { return Math.max(0, vX - vol(K.common(X, Y))); } };
      return { target: vA, result: vB, gouge: diff(A, B, vA), residual: diff(B, A, vB), valid: !!(ca.valid && cb.valid), solids: [ca.solids, cb.solids] };
    }
    case 'brep-view': { const s = K.fromBREP(a.brep); return full(K, s); }
    default: throw new Error('Bilinmeyen OCCT işlemi: ' + op);
  }
}
