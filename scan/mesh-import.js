// Tarama / ağ (mesh) dosyalarını okur: STL (ikili ve metin), OBJ, PLY (metin ve ikili), GLB (glTF ikili).
// Sonuç her zaman aynı biçimdedir: { tris: Float32Array (üçgen listesi, x y z × 3 köşe), unit, format, note }
// Saf fonksiyonlar; DOM gerektirmez (tests/scan.test.mjs). Telefonda internetsiz çalışır.
//
// Güvenlik / kararlılık: dosya boyutu ve üçgen sayısı sınırlıdır; bozuk dosya açık bir hata verir, sekmeyi kilitlemez.

export const MAX_BYTES = 150 * 1024 * 1024;   // 150 MB
export const MAX_TRIS = 3_000_000;
export const FORMATS = ['stl', 'obj', 'ply', 'glb'];
export const ACCEPT = '.stl,.obj,.ply,.glb,.STL,.OBJ,.PLY,.GLB';

const err = (m) => Object.assign(new Error(m), { user: true });
const td = new TextDecoder('utf-8');

export function formatOf(name) {
  const m = /\.([a-z0-9]+)$/i.exec(name || '');
  const e = m ? m[1].toLowerCase() : '';
  return FORMATS.includes(e) ? e : null;
}

// Dosya içeriğinden biçimi tahmin eder (uzantı yanlışsa)
export function sniff(bytes) {
  const head = td.decode(bytes.subarray(0, Math.min(bytes.length, 256)));
  if (bytes.length >= 12 && head.startsWith('glTF')) return 'glb';
  if (/^ply\s/.test(head)) return 'ply';
  if (/^\s*solid\b/i.test(head) && /facet\s+normal/i.test(td.decode(bytes.subarray(0, Math.min(bytes.length, 4096))))) return 'stl';
  if (bytes.length >= 84) {
    const n = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(80, true);
    if (84 + n * 50 === bytes.length) return 'stl';
  }
  if (/^\s*(#|v\s|o\s|g\s|mtllib|vn\s)/m.test(head)) return 'obj';
  return null;
}

export function parseMesh(bytes, name = '') {
  if (!(bytes instanceof Uint8Array)) bytes = new Uint8Array(bytes);
  if (!bytes.length) throw err('Dosya boş');
  if (bytes.length > MAX_BYTES) throw err('Dosya çok büyük (en çok 150 MB)');
  const fmt = sniff(bytes) || formatOf(name);
  if (!fmt) throw err('Desteklenmeyen dosya. STL, OBJ, PLY ya da GLB seç.');
  const r = fmt === 'stl' ? parseSTL(bytes) : fmt === 'obj' ? parseOBJ(bytes) : fmt === 'ply' ? parsePLY(bytes) : parseGLB(bytes);
  if (!r.tris.length) throw err('Dosyada üçgen bulunamadı');
  // geçersiz sayıları (NaN / sonsuz) içeren üçgenleri at
  const t = r.tris; let bad = 0, w = 0;
  for (let i = 0; i < t.length; i += 9) {
    let ok = true;
    for (let k = 0; k < 9; k++) if (!Number.isFinite(t[i + k])) { ok = false; break; }
    if (!ok) { bad++; continue; }
    if (w !== i) t.copyWithin(w, i, i + 9);
    w += 9;
  }
  return { ...r, format: fmt, tris: w === t.length ? t : t.slice(0, w), dropped: bad };
}

function checkCount(n) { if (n > MAX_TRIS) throw err('Çok fazla üçgen (' + n.toLocaleString('tr-TR') + '); en çok 3 milyon. Tarama uygulamasında sadeleştirip tekrar dışa aktar.'); }

/* ---------- STL ---------- */
export function parseSTL(bytes) {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const n = bytes.length >= 84 ? dv.getUint32(80, true) : 0;
  if (bytes.length >= 84 && 84 + n * 50 === bytes.length) {
    checkCount(n);
    const t = new Float32Array(n * 9);
    for (let i = 0; i < n; i++) {
      const o = 84 + i * 50 + 12;
      for (let k = 0; k < 9; k++) t[i * 9 + k] = dv.getFloat32(o + k * 4, true);
    }
    return { tris: t, unit: null, note: 'STL (ikili)' };
  }
  const s = td.decode(bytes);
  if (!/facet/i.test(s)) throw err('STL dosyası okunamadı (bozuk ya da eksik)');
  const out = [];
  const re = /vertex\s+([-+0-9.eE]+)\s+([-+0-9.eE]+)\s+([-+0-9.eE]+)/g;
  let m;
  while ((m = re.exec(s))) { out.push(+m[1], +m[2], +m[3]); if (out.length > MAX_TRIS * 9) checkCount(out.length / 9); }
  if (out.length % 9) out.length -= out.length % 9;
  return { tris: new Float32Array(out), unit: null, note: 'STL (metin)' };
}

/* ---------- OBJ ---------- */
export function parseOBJ(bytes) {
  const s = td.decode(bytes);
  const v = [], out = [];
  for (const raw of s.split('\n')) {
    const line = raw.trim();
    if (line.startsWith('v ')) {
      const p = line.split(/\s+/);
      v.push(+p[1], +p[2], +p[3]);
    } else if (line.startsWith('f ')) {
      const p = line.split(/\s+/).slice(1).map((q) => {
        let i = parseInt(q, 10);
        if (i < 0) i = v.length / 3 + i; else i -= 1;
        return i;
      });
      if (p.some((i) => !(i >= 0 && i * 3 < v.length))) throw err('OBJ dosyasında geçersiz yüz (köşe numarası yok)');
      for (let k = 1; k + 1 < p.length; k++) {   // çokgen → üçgen yelpazesi
        for (const i of [p[0], p[k], p[k + 1]]) out.push(v[i * 3], v[i * 3 + 1], v[i * 3 + 2]);
      }
      if (out.length > MAX_TRIS * 9) checkCount(out.length / 9);
    }
  }
  if (!out.length && v.length) throw err('OBJ dosyasında yalnız noktalar var (yüz yok): nokta bulutu desteklenmiyor, tarama uygulamasında ağ olarak dışa aktar');
  return { tris: new Float32Array(out), unit: null, note: 'OBJ' };
}

/* ---------- PLY ---------- */
const PLY_T = { char: ['getInt8', 1], uchar: ['getUint8', 1], int8: ['getInt8', 1], uint8: ['getUint8', 1], short: ['getInt16', 2], ushort: ['getUint16', 2], int16: ['getInt16', 2], uint16: ['getUint16', 2], int: ['getInt32', 4], uint: ['getUint32', 4], int32: ['getInt32', 4], uint32: ['getUint32', 4], float: ['getFloat32', 4], float32: ['getFloat32', 4], double: ['getFloat64', 8], float64: ['getFloat64', 8] };

export function parsePLY(bytes) {
  const headEnd = (() => {
    const s = td.decode(bytes.subarray(0, Math.min(bytes.length, 65536)));
    const i = s.indexOf('end_header');
    if (i < 0) throw err('PLY başlığı okunamadı');
    let j = i + 'end_header'.length;
    if (s[j] === '\r') j++;
    if (s[j] === '\n') j++;
    return { text: s.slice(0, i), off: new TextEncoder().encode(s.slice(0, j)).length };
  })();
  const lines = headEnd.text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const fmt = (lines.find((l) => l.startsWith('format')) || '').split(/\s+/)[1];
  if (!['ascii', 'binary_little_endian', 'binary_big_endian'].includes(fmt)) throw err('PLY biçimi desteklenmiyor: ' + fmt);
  const els = [];
  for (const l of lines) {
    const p = l.split(/\s+/);
    if (p[0] === 'element') els.push({ name: p[1], n: +p[2], props: [] });
    else if (p[0] === 'property' && els.length) {
      if (p[1] === 'list') els[els.length - 1].props.push({ list: true, ct: p[2], it: p[3], name: p[4] });
      else els[els.length - 1].props.push({ t: p[1], name: p[2] });
    }
  }
  const ve = els.find((e) => e.name === 'vertex'), fe = els.find((e) => e.name === 'face');
  if (!ve) throw err('PLY dosyasında köşe yok');
  if (!fe || !fe.n) throw err('PLY dosyasında yüz yok: nokta bulutu desteklenmiyor, tarama uygulamasında ağ olarak dışa aktar');
  checkCount(fe.n);
  const xi = ve.props.findIndex((q) => q.name === 'x'), yi = ve.props.findIndex((q) => q.name === 'y'), zi = ve.props.findIndex((q) => q.name === 'z');
  const V = new Float64Array(ve.n * 3), faces = [];
  if (fmt === 'ascii') {
    const body = td.decode(bytes.subarray(headEnd.off)).split(/\s+/).filter(Boolean);
    let k = 0;
    for (const e of els) {
      for (let i = 0; i < e.n; i++) {
        const row = [];
        for (const q of e.props) {
          if (q.list) { const c = +body[k++]; const l = []; for (let j = 0; j < c; j++) l.push(+body[k++]); row.push(l); } else row.push(+body[k++]);
        }
        if (e === ve) { V[i * 3] = row[xi]; V[i * 3 + 1] = row[yi]; V[i * 3 + 2] = row[zi]; } else if (e === fe) faces.push(row[e.props.findIndex((q) => q.list)]);
      }
      if (k > body.length) throw err('PLY dosyası eksik');
    }
  } else {
    const le = fmt === 'binary_little_endian';
    const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    let o = headEnd.off;
    const rd = (t) => { const d = PLY_T[t]; if (!d) throw err('PLY türü desteklenmiyor: ' + t); if (o + d[1] > bytes.length) throw err('PLY dosyası eksik'); const v = dv[d[0]](o, le); o += d[1]; return v; };
    for (const e of els) {
      for (let i = 0; i < e.n; i++) {
        let fl = null;
        for (let pi = 0; pi < e.props.length; pi++) {
          const q = e.props[pi];
          if (q.list) { const c = rd(q.ct); const l = new Array(c); for (let j = 0; j < c; j++) l[j] = rd(q.it); if (e === fe && !fl) fl = l; } else {
            const v = rd(q.t);
            if (e === ve) { if (pi === xi) V[i * 3] = v; else if (pi === yi) V[i * 3 + 1] = v; else if (pi === zi) V[i * 3 + 2] = v; }
          }
        }
        if (e === fe) faces.push(fl);
      }
    }
  }
  const out = [];
  for (const f of faces) {
    if (!f || f.length < 3) continue;
    for (let k = 1; k + 1 < f.length; k++) for (const i of [f[0], f[k], f[k + 1]]) {
      if (!(i >= 0 && i < ve.n)) throw err('PLY dosyasında geçersiz yüz');
      out.push(V[i * 3], V[i * 3 + 1], V[i * 3 + 2]);
    }
  }
  return { tris: new Float32Array(out), unit: null, note: 'PLY (' + (fmt === 'ascii' ? 'metin' : 'ikili') + ')' };
}

/* ---------- GLB (glTF 2.0 ikili) ---------- */
// glTF birimi metredir → milimetreye çevrilir. Düğüm dönüşümleri (konum / dönme / ölçek / matris) uygulanır.
export function parseGLB(bytes) {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.length < 20 || dv.getUint32(0, true) !== 0x46546c67) throw err('GLB dosyası okunamadı');
  let o = 12, json = null, bin = null;
  while (o + 8 <= bytes.length) {
    const len = dv.getUint32(o, true), type = dv.getUint32(o + 4, true);
    if (o + 8 + len > bytes.length) throw err('GLB dosyası eksik');
    const chunk = bytes.subarray(o + 8, o + 8 + len);
    if (type === 0x4e4f534a) json = JSON.parse(td.decode(chunk));
    else if (type === 0x004e4942) bin = chunk;
    o += 8 + len;
  }
  if (!json) throw err('GLB dosyasında sahne bilgisi yok');
  if (json.extensionsRequired && json.extensionsRequired.length) throw err('Bu GLB sıkıştırılmış (' + json.extensionsRequired.join(', ') + '); sıkıştırmasız dışa aktar ya da STL / OBJ seç');
  const acc = (i, comps) => {
    const a = json.accessors[i], bv = json.bufferViews[a.bufferView];
    if (!bin || !bv || (bv.buffer || 0) !== 0) throw err('GLB veri bloğu okunamadı');
    const C = { 5126: [Float32Array, 4], 5125: [Uint32Array, 4], 5123: [Uint16Array, 2], 5121: [Uint8Array, 1] }[a.componentType];
    if (!C) throw err('GLB veri türü desteklenmiyor');
    const nc = comps || ({ SCALAR: 1, VEC3: 3, VEC4: 4 }[a.type] || 1);
    const stride = bv.byteStride || C[1] * nc, base = (bv.byteOffset || 0) + (a.byteOffset || 0);
    const out = new Float64Array(a.count * nc), d = new DataView(bin.buffer, bin.byteOffset, bin.byteLength);
    const get = { 5126: 'getFloat32', 5125: 'getUint32', 5123: 'getUint16', 5121: 'getUint8' }[a.componentType];
    for (let i = 0; i < a.count; i++) for (let k = 0; k < nc; k++) {
      const off = base + i * stride + k * C[1];
      if (off + C[1] > bin.length) throw err('GLB verisi eksik');
      out[i * nc + k] = d[get](off, true);
    }
    return out;
  };
  const mul = (a, b) => { const r = new Array(16).fill(0); for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) for (let k = 0; k < 4; k++) r[j * 4 + i] += a[k * 4 + i] * b[j * 4 + k]; return r; };
  const local = (n) => {
    if (n.matrix) return n.matrix.slice();
    const [tx, ty, tz] = n.translation || [0, 0, 0], [x, y, z, w] = n.rotation || [0, 0, 0, 1], [sx, sy, sz] = n.scale || [1, 1, 1];
    return [(1 - 2 * (y * y + z * z)) * sx, 2 * (x * y + z * w) * sx, 2 * (x * z - y * w) * sx, 0,
      2 * (x * y - z * w) * sy, (1 - 2 * (x * x + z * z)) * sy, 2 * (y * z + x * w) * sy, 0,
      2 * (x * z + y * w) * sz, 2 * (y * z - x * w) * sz, (1 - 2 * (x * x + y * y)) * sz, 0, tx, ty, tz, 1];
  };
  const out = [];
  const visit = (ni, M, depth) => {
    if (depth > 64) return;
    const n = json.nodes[ni]; if (!n) return;
    const W = mul(M, local(n));
    if (n.mesh != null) for (const pr of (json.meshes[n.mesh] || {}).primitives || []) {
      if (pr.mode != null && pr.mode !== 4) continue;   // yalnız üçgenler
      const P = acc(pr.attributes.POSITION, 3), I = pr.indices != null ? acc(pr.indices, 1) : null;
      const cnt = I ? I.length : P.length / 3;
      if (out.length / 9 + cnt / 3 > MAX_TRIS) checkCount(out.length / 9 + cnt / 3);
      for (let k = 0; k + 2 < cnt; k += 3) {
        for (let j = 0; j < 3; j++) {
          const vi = I ? I[k + j] : k + j, x = P[vi * 3], y = P[vi * 3 + 1], z = P[vi * 3 + 2];
          out.push((W[0] * x + W[4] * y + W[8] * z + W[12]) * 1000, (W[1] * x + W[5] * y + W[9] * z + W[13]) * 1000, (W[2] * x + W[6] * y + W[10] * z + W[14]) * 1000);
        }
      }
    }
    for (const c of n.children || []) visit(c, W, depth + 1);
  };
  const I4 = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  const sc = json.scenes ? json.scenes[json.scene || 0] : null;
  const roots = sc ? sc.nodes || [] : (json.nodes || []).map((_, i) => i);
  for (const r of roots) visit(r, I4, 0);
  return { tris: new Float32Array(out), unit: 'mm', note: 'GLB (metre → mm)' };
}
