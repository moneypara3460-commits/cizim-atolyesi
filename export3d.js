// 3B dosya dışa aktarma: 3MF (3B yazıcılar) ve STEP (CAD programları). Saf fonksiyonlar; Node'da test edilir.
// Giriş: üçgen listesi (9 sayı = 1 üçgen, mm, Y yukarı). Çıkışlar Z yukarı (STL ile aynı: x, −z, y).

const zUp = (x, y, z) => [x, -z, y];

// Aynı noktaları birleştirip indeksli ağ: { V: [[x,y,z]], T: [[a,b,c]] } (Z yukarı); bozuk üçgenler atılır
export function indexMesh(pos, tol = 1e-4) {
  const map = new Map(), V = [], T = [];
  const q = 1 / tol;
  const vid = (x, y, z) => {
    const k = Math.round(x * q) + ',' + Math.round(y * q) + ',' + Math.round(z * q);
    let i = map.get(k);
    if (i === undefined) { i = V.length; map.set(k, i); V.push(zUp(x, y, z)); }
    return i;
  };
  for (let o = 0; o + 8 < pos.length; o += 9) {
    const a = vid(pos[o], pos[o + 1], pos[o + 2]), b = vid(pos[o + 3], pos[o + 4], pos[o + 5]), c = vid(pos[o + 6], pos[o + 7], pos[o + 8]);
    if (a === b || b === c || a === c) continue;
    const A = V[a], B = V[b], C = V[c];
    const ux = B[0] - A[0], uy = B[1] - A[1], uz = B[2] - A[2], vx = C[0] - A[0], vy = C[1] - A[1], vz = C[2] - A[2];
    if (Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx) < 1e-12) continue;
    T.push([a, b, c]);
  }
  return { V, T };
}
// Kapalı ve yönleri tutarlı mı: her kenar tam iki kez, zıt yönlerde kullanılmalı
export function isClosedManifold(T) {
  const use = new Map();
  for (const [a, b, c] of T) for (const [p, q] of [[a, b], [b, c], [c, a]]) {
    const k = p + '>' + q;
    use.set(k, (use.get(k) || 0) + 1);
  }
  for (const [k, n] of use) {
    if (n !== 1) return false;
    const [p, q] = k.split('>');
    if (use.get(q + '>' + p) !== 1) return false;
  }
  return T.length > 0;
}

/* ---------- ZIP (sıkıştırmasız) ---------- */
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
export function crc32(u8) { let c = 0xffffffff; for (let i = 0; i < u8.length; i++) c = CRC[(c ^ u8[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
export function zipStore(files) {
  const enc = new TextEncoder(), parts = [], central = [];
  let off = 0;
  for (const f of files) {
    const name = enc.encode(f.name), data = typeof f.data === 'string' ? enc.encode(f.data) : f.data, crc = crc32(data);
    const h = new DataView(new ArrayBuffer(30));
    h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true); h.setUint16(8, 0, true);
    h.setUint16(10, 0, true); h.setUint16(12, 0x21, true); h.setUint32(14, crc, true); h.setUint32(18, data.length, true); h.setUint32(22, data.length, true);
    h.setUint16(26, name.length, true); h.setUint16(28, 0, true);
    parts.push(new Uint8Array(h.buffer), name, data);
    const c = new DataView(new ArrayBuffer(46));
    c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true); c.setUint16(10, 0, true);
    c.setUint16(12, 0, true); c.setUint16(14, 0x21, true); c.setUint32(16, crc, true); c.setUint32(20, data.length, true); c.setUint32(24, data.length, true);
    c.setUint16(28, name.length, true); c.setUint32(42, off, true);
    central.push(new Uint8Array(c.buffer), name);
    off += 30 + name.length + data.length;
  }
  const cdSize = central.reduce((s, a) => s + a.length, 0);
  const e = new DataView(new ArrayBuffer(22));
  e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true); e.setUint32(12, cdSize, true); e.setUint32(16, off, true);
  const all = [...parts, ...central, new Uint8Array(e.buffer)];
  const out = new Uint8Array(all.reduce((s, a) => s + a.length, 0));
  let o = 0; for (const a of all) { out.set(a, o); o += a.length; }
  return out;
}

/* ---------- 3MF ---------- */
const xmlEsc = (s) => String(s).replace(/[<>&"']/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' }[c]));
const n6 = (v) => String(Math.round(v * 1e6) / 1e6);
export function to3MF(pos, name = 'model', color = '#38bdf8') {
  const { V, T } = indexMesh(pos);
  const col = /^#[0-9a-f]{6}$/i.test(color) ? color.toUpperCase() + 'FF' : '#38BDF8FF';
  const model = '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<model unit="millimeter" xml:lang="tr-TR" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">\n' +
    ` <metadata name="Title">${xmlEsc(name)}</metadata>\n <metadata name="Application">Çizim Atölyesi</metadata>\n` +
    ' <resources>\n' +
    `  <basematerials id="1"><base name="${xmlEsc(name)}" displaycolor="${col}"/></basematerials>\n` +
    `  <object id="2" type="model" name="${xmlEsc(name)}" pid="1" pindex="0">\n   <mesh>\n    <vertices>\n` +
    V.map(([x, y, z]) => `     <vertex x="${n6(x)}" y="${n6(y)}" z="${n6(z)}"/>`).join('\n') +
    '\n    </vertices>\n    <triangles>\n' +
    T.map(([a, b, c]) => `     <triangle v1="${a}" v2="${b}" v3="${c}"/>`).join('\n') +
    '\n    </triangles>\n   </mesh>\n  </object>\n </resources>\n <build>\n  <item objectid="2"/>\n </build>\n</model>\n';
  return zipStore([
    { name: '[Content_Types].xml', data: '<?xml version="1.0" encoding="UTF-8"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/></Types>\n' },
    { name: '_rels/.rels', data: '<?xml version="1.0" encoding="UTF-8"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/></Relationships>\n' },
    { name: '3D/3dmodel.model', data: model },
  ]);
}

/* ---------- STEP (AP214, yüzeyli katı) ---------- */
// Her üçgen düzlemsel bir yüzdür. Ağ kapalıysa MANIFOLD_SOLID_BREP (katı), değilse yüzey modeli (SHELL_BASED_SURFACE_MODEL).
const R = (v) => {
  let s = (Math.abs(v) < 1e-12 ? 0 : Math.round(v * 1e6) / 1e6).toString();
  if (/e/i.test(s)) { const [m, e] = s.toLowerCase().split('e'); s = (m.includes('.') ? m : m + '.') + 'E' + e; }
  else if (!s.includes('.')) s += '.';
  return s;
};
const stepStr = (s) => "'" + String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ı/g, 'i').replace(/[^\x20-\x7e]/g, '_').replace(/'/g, "''") + "'";
export function toSTEP(pos, name = 'model', when = new Date()) {
  const { V, T } = indexMesh(pos);
  const solid = isClosedManifold(T);
  const L = [];
  let n = 0;
  const E = (body) => { n++; L.push('#' + n + '=' + body + ';'); return '#' + n; };
  const nm = stepStr(name);
  // bağlam
  const appCtx = E("APPLICATION_CONTEXT('automotive design')");
  E(`APPLICATION_PROTOCOL_DEFINITION('international standard','automotive_design',2000,${appCtx})`);
  const prodCtx = E(`PRODUCT_CONTEXT('',${appCtx},'mechanical')`);
  const prod = E(`PRODUCT(${nm},${nm},'',(${prodCtx}))`);
  E(`PRODUCT_RELATED_PRODUCT_CATEGORY('part',$,(${prod}))`);
  const pdf = E(`PRODUCT_DEFINITION_FORMATION('','',${prod})`);
  const pdc = E(`PRODUCT_DEFINITION_CONTEXT('part definition',${appCtx},'design')`);
  const pd = E(`PRODUCT_DEFINITION('design','',${pdf},${pdc})`);
  const pds = E(`PRODUCT_DEFINITION_SHAPE('','',${pd})`);
  const mm = E('(LENGTH_UNIT()NAMED_UNIT(*)SI_UNIT(.MILLI.,.METRE.))');
  const rad = E('(NAMED_UNIT(*)PLANE_ANGLE_UNIT()SI_UNIT($,.RADIAN.))');
  const sr = E('(NAMED_UNIT(*)SI_UNIT($,.STERADIAN.)SOLID_ANGLE_UNIT())');
  const unc = E(`UNCERTAINTY_MEASURE_WITH_UNIT(LENGTH_MEASURE(1.E-06),${mm},'distance_accuracy_value','confusion accuracy')`);
  const ctx = E(`(GEOMETRIC_REPRESENTATION_CONTEXT(3)GLOBAL_UNCERTAINTY_ASSIGNED_CONTEXT((${unc}))GLOBAL_UNIT_ASSIGNED_CONTEXT((${mm},${rad},${sr}))REPRESENTATION_CONTEXT('Context #1','3D Context with UNIT and UNCERTAINTY'))`);
  const o0 = E("CARTESIAN_POINT('',(0.,0.,0.))"), dz = E("DIRECTION('',(0.,0.,1.))"), dx = E("DIRECTION('',(1.,0.,0.))");
  const origin = E(`AXIS2_PLACEMENT_3D('',${o0},${dz},${dx})`);
  // geometri
  const P = V.map(([x, y, z]) => E(`CARTESIAN_POINT('',(${R(x)},${R(y)},${R(z)}))`));
  const VP = P.map((p) => E(`VERTEX_POINT('',${p})`));
  const edges = new Map();
  const edgeOf = (a, b) => {
    const k = a < b ? a + '_' + b : b + '_' + a;
    let e = edges.get(k);
    if (!e) {
      const [i, j] = a < b ? [a, b] : [b, a];
      const d = [V[j][0] - V[i][0], V[j][1] - V[i][1], V[j][2] - V[i][2]], len = Math.hypot(...d);
      const dir = E(`DIRECTION('',(${R(d[0] / len)},${R(d[1] / len)},${R(d[2] / len)}))`);
      const vec = E(`VECTOR('',${dir},${R(len)})`);
      const line = E(`LINE('',${P[i]},${vec})`);
      e = { id: E(`EDGE_CURVE('',${VP[i]},${VP[j]},${line},.T.)`), i };
      edges.set(k, e);
    }
    return { id: e.id, same: e.i === a };
  };
  const faces = [];
  for (const [a, b, c] of T) {
    const oe = [[a, b], [b, c], [c, a]].map(([p, q]) => { const e = edgeOf(p, q); return E(`ORIENTED_EDGE('',*,*,${e.id},${e.same ? '.T.' : '.F.'})`); });
    const loop = E(`EDGE_LOOP('',(${oe.join(',')}))`);
    const bound = E(`FACE_OUTER_BOUND('',${loop},.T.)`);
    const A = V[a], B = V[b], C = V[c];
    const u = [B[0] - A[0], B[1] - A[1], B[2] - A[2]], w = [C[0] - A[0], C[1] - A[1], C[2] - A[2]];
    const nrm = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]], nl = Math.hypot(...nrm), ul = Math.hypot(...u);
    const nd = E(`DIRECTION('',(${R(nrm[0] / nl)},${R(nrm[1] / nl)},${R(nrm[2] / nl)}))`);
    const rd = E(`DIRECTION('',(${R(u[0] / ul)},${R(u[1] / ul)},${R(u[2] / ul)}))`);
    const ax = E(`AXIS2_PLACEMENT_3D('',${P[a]},${nd},${rd})`);
    const pl = E(`PLANE('',${ax})`);
    faces.push(E(`ADVANCED_FACE('',(${bound}),${pl},.T.)`));
  }
  let rep;
  if (solid) {
    const shell = E(`CLOSED_SHELL('',(${faces.join(',')}))`);
    const brep = E(`MANIFOLD_SOLID_BREP(${nm},${shell})`);
    rep = E(`ADVANCED_BREP_SHAPE_REPRESENTATION(${nm},(${brep},${origin}),${ctx})`);
  } else {
    const shell = E(`OPEN_SHELL('',(${faces.join(',')}))`);
    const sbsm = E(`SHELL_BASED_SURFACE_MODEL(${nm},(${shell}))`);
    rep = E(`MANIFOLD_SURFACE_SHAPE_REPRESENTATION(${nm},(${sbsm},${origin}),${ctx})`);
  }
  E(`SHAPE_DEFINITION_REPRESENTATION(${pds},${rep})`);
  const ts = when.toISOString().slice(0, 19);
  const head = 'ISO-10303-21;\nHEADER;\n' +
    `FILE_DESCRIPTION(('Cizim Atolyesi faceted model'),'2;1');\n` +
    `FILE_NAME(${nm},'${ts}',(''),(''),'Cizim Atolyesi','Cizim Atolyesi','');\n` +
    "FILE_SCHEMA(('AUTOMOTIVE_DESIGN { 1 0 10303 214 1 1 1 1 }'));\nENDSEC;\nDATA;\n";
  return { text: head + L.join('\n') + '\nENDSEC;\nEND-ISO-10303-21;\n', solid, faces: T.length, vertices: V.length };
}
