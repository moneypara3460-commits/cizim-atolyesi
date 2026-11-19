// Sentetik 3D kalıp (testler için): topuğu yüksek (konç), tabanı düzgün, burnu iç yana (−y) kaymış kapalı yüzey.
// x: topuktan buruna (0 … L mm), y: + dış yan, z: yukarı. Ölçüler "temsilî"dir, gerçek bir kalıbın ölçüsü değildir.
const sm = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
export function lastMesh({ L = 265, nx = 90, nt = 48, heel = 22, spring = 12, toeShift = -9 } = {}) {
  const V = [], F = [];
  const st = [];
  for (let i = 1; i < nx - 1; i++) st.push((L * (1 - Math.cos((Math.PI * i) / (nx - 1)))) / 2);
  const ring = (x) => {
    const t = x / L;
    const zb = heel * (1 - sm(0.12, 0.62, t)) + spring * sm(0.78, 1, t);             // taban çizgisi (topuk yüksekliği, burun kalkıklığı)
    const end = Math.pow(Math.max(0, 1 - Math.pow(2 * t - 1, 6)), 0.5);                 // uçlarda kapanma
    const w = (34 + 14 * sm(0.1, 0.7, t) - 10 * sm(0.75, 1, t)) * end;                // yarım genişlik
    const h = (62 + 55 * (1 - sm(0.08, 0.36, t)) - 28 * sm(0.4, 1, t)) * end;          // yükseklik (konçta yüksek)
    const cy = toeShift * sm(0.55, 1, t), out = [];
    for (let j = 0; j < nt; j++) {
      const a = (2 * Math.PI * j) / nt, c = Math.cos(a), s = Math.sin(a);
      const yy = w * Math.sign(c) * Math.pow(Math.abs(c), 0.8), zz = (h / 2) * (1 + Math.sign(s) * Math.pow(Math.abs(s), s < 0 ? 0.3 : 1));   // kesit: taban düz, üst yuvarlak
      out.push([x, cy + yy, zb + zz]);
    }
    return out;
  };
  for (const x of st) for (const p of ring(x)) V.push(p);
  const R = st.length;
  for (let i = 0; i < R - 1; i++) for (let j = 0; j < nt; j++) {
    const a = i * nt + j, b = i * nt + ((j + 1) % nt), c = (i + 1) * nt + j, d = (i + 1) * nt + ((j + 1) % nt);
    F.push([a, b, c], [b, d, c]);   // dışa bakan yüzler
  }
  // uç kapakları (ortadaki noktaya yelpaze)
  const cap = (ri, rev) => {
    const base = ri * nt; let cx = 0, cy = 0, cz = 0;
    for (let j = 0; j < nt; j++) { cx += V[base + j][0]; cy += V[base + j][1]; cz += V[base + j][2]; }
    const k = V.length; V.push([cx / nt + (rev ? 0.4 : -0.4), cy / nt, cz / nt]);
    for (let j = 0; j < nt; j++) { const a = base + j, b = base + ((j + 1) % nt); F.push(rev ? [k, b, a] : [k, a, b]); }
  };
  cap(0, false); cap(R - 1, true);
  return { V, F };
}
export const flipWinding = (m) => ({ V: m.V, F: m.F.map(([a, b, c]) => [a, c, b]) });
export function transform(m, { rot = [0, 0, 0], move = [0, 0, 0], scale = 1 } = {}) {
  const [a, b, c] = rot, ca = Math.cos(a), sa = Math.sin(a), cb = Math.cos(b), sb = Math.sin(b), cc = Math.cos(c), sc = Math.sin(c);
  const f = ([x, y, z]) => {
    let y1 = y * ca - z * sa, z1 = y * sa + z * ca;                // x ekseni etrafında
    let x2 = x * cb + z1 * sb, z2 = -x * sb + z1 * cb;             // y ekseni
    const x3 = x2 * cc - y1 * sc, y3 = x2 * sc + y1 * cc;          // z ekseni
    return [(x3 + move[0]) * scale, (y3 + move[1]) * scale, (z2 + move[2]) * scale];
  };
  return { V: m.V.map(f), F: m.F };
}
export function toSTLBinary(m) {
  const n = m.F.length, buf = new ArrayBuffer(84 + 50 * n), dv = new DataView(buf);
  for (let i = 0; i < 80; i++) dv.setUint8(i, 'solid sentetik kalip'.charCodeAt(i) || 32);   // başı "solid" diye başlayan ikili dosya (yaygın tuzak)
  dv.setUint32(80, n, true);
  m.F.forEach((f, i) => { let o = 84 + 50 * i + 12; for (const vi of f) for (const c of m.V[vi]) { dv.setFloat32(o, c, true); o += 4; } });
  return new Uint8Array(buf);
}
export function toSTLAscii(m) {
  return 'solid k\n' + m.F.map((f) => ' facet normal 0 0 0\n  outer loop\n' + f.map((vi) => '   vertex ' + m.V[vi].map((c) => c.toExponential(6)).join(' ')).join('\n') + '\n  endloop\n endfacet').join('\n') + '\nendsolid k\n';
}
// OBJ: dörtgen yüzler ve eksi (göreli) sıra numaralarıyla da yazılabilir
export function toOBJ(m, { quads = false } = {}) {
  let s = '# sentetik kalip\no kalip\n' + m.V.map((p) => 'v ' + p.map((c) => +c.toFixed(5)).join(' ')).join('\n') + '\nvn 0 0 1\n';
  if (!quads) return s + m.F.map((f) => 'f ' + f.map((i) => i + 1 + '//1').join(' ')).join('\n') + '\n';
  const nv = m.V.length;
  for (let i = 0; i < m.F.length; i++) {
    const f = m.F[i], g = m.F[i + 1];
    if (g && f[1] === g[0] && f[2] === g[2]) { s += 'f ' + [f[0], f[1], g[1], f[2]].map((k) => k - nv).join(' ') + '\n'; i++; }   // [a,b,c]+[b,d,c] → a b d c
    else s += 'f ' + f.map((k) => k + 1).join(' ') + '\n';
  }
  return s;
}
