// Ağ dışa aktarma: PLY (ikili) ve GLB (glTF 2.0 ikili). Girdi: üçgen listesi (mm, Y yukarı).
// STL, OBJ, 3MF, STEP zaten var (logic.js, export3d.js); bunlar tarama / görselleştirme programları için eklendi.
// Saf fonksiyonlar (tests/scan.test.mjs).
import { weld } from './mesh-tools.js?v=20261118b';

export function toPLY(tris) {
  const m = weld(tris), nv = m.V.length / 3, nf = m.F.length / 3;
  const head = new TextEncoder().encode(`ply\nformat binary_little_endian 1.0\ncomment Cizim Atolyesi (mm)\nelement vertex ${nv}\nproperty float x\nproperty float y\nproperty float z\nelement face ${nf}\nproperty list uchar uint vertex_indices\nend_header\n`);
  const out = new Uint8Array(head.length + nv * 12 + nf * 13), dv = new DataView(out.buffer);
  out.set(head);
  let o = head.length;
  for (let i = 0; i < m.V.length; i++, o += 4) dv.setFloat32(o, m.V[i], true);
  for (let f = 0; f < nf; f++) {
    dv.setUint8(o, 3); o++;
    for (let k = 0; k < 3; k++, o += 4) dv.setUint32(o, m.F[f * 3 + k], true);
  }
  return out;
}

// glTF birimi metredir: mm / 1000
export function toGLB(tris, name = 'model') {
  const m = weld(tris), nv = m.V.length / 3, nf = m.F.length / 3;
  const pos = new Float32Array(m.V.length);
  const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < m.V.length; i++) { const v = m.V[i] / 1000; pos[i] = v; const k = i % 3; if (v < mn[k]) mn[k] = v; if (v > mx[k]) mx[k] = v; }
  const idx = new Uint32Array(m.F);
  const posBytes = pos.byteLength, idxBytes = idx.byteLength;
  const json = {
    asset: { version: '2.0', generator: 'Cizim Atolyesi' },
    scene: 0, scenes: [{ nodes: [0] }], nodes: [{ mesh: 0, name }],
    meshes: [{ name, primitives: [{ attributes: { POSITION: 0 }, indices: 1, mode: 4 }] }],
    buffers: [{ byteLength: posBytes + idxBytes }],
    bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: posBytes, target: 34962 }, { buffer: 0, byteOffset: posBytes, byteLength: idxBytes, target: 34963 }],
    accessors: [
      { bufferView: 0, componentType: 5126, count: nv, type: 'VEC3', min: mn, max: mx },
      { bufferView: 1, componentType: 5125, count: nf * 3, type: 'SCALAR' },
    ],
  };
  let jb = new TextEncoder().encode(JSON.stringify(json));
  const jpad = (4 - (jb.length % 4)) % 4;
  if (jpad) { const t = new Uint8Array(jb.length + jpad).fill(0x20); t.set(jb); jb = t; }
  const binLen = posBytes + idxBytes;
  const total = 12 + 8 + jb.length + 8 + binLen;
  const out = new Uint8Array(total), dv = new DataView(out.buffer);
  dv.setUint32(0, 0x46546c67, true); dv.setUint32(4, 2, true); dv.setUint32(8, total, true);
  dv.setUint32(12, jb.length, true); dv.setUint32(16, 0x4e4f534a, true); out.set(jb, 20);
  let o = 20 + jb.length;
  dv.setUint32(o, binLen, true); dv.setUint32(o + 4, 0x004e4942, true); o += 8;
  out.set(new Uint8Array(pos.buffer), o); out.set(new Uint8Array(idx.buffer), o + posBytes);
  return out;
}
