// Sentetik kalıp fotoğrafı: koyu masa, perspektifli kâğıt, kâğıdın ortasında bilinen ölçüde elips "kalıp".
// rx, ry: elipsin yarı eksenleri (mm). shape(u, v): elips yerine kâğıt üstündeki herhangi bir şekil (mm). paperMm: kâğıdın gerçek ölçüsü (uzun, kısa). portrait: kâğıt fotoğrafta dik.
import zlib from 'node:zlib';

export function scene({ w = 1200, h = 900, rx = 130, ry = 50, last = [45, 40, 42], paper = [246, 245, 240], bg = [62, 52, 46], paperMm = [297, 210], portrait = false, quad = null, shape = null } = {}) {
  const rgba = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) { rgba[i * 4] = bg[0]; rgba[i * 4 + 1] = bg[1]; rgba[i * 4 + 2] = bg[2]; rgba[i * 4 + 3] = 255; }
  // kâğıt köşeleri (sol üst, sağ üst, sağ alt, sol alt): hafif perspektif
  const P = quad || (portrait ? [[150, 110], [760, 140], [790, 1090], [110, 1060]] : [[150, 120], [1080, 160], [1050, 800], [120, 760]]);
  const [Lm, Sm] = paperMm;
  // kâğıt koordinatı (u: uzun kenar, v: kısa kenar, mm) → görüntü (çift doğrusal)
  const corner = portrait ? [P[3], P[0], P[1], P[2]] : P;   // dikeyde uzun kenar soldan sağa değil yukarıdan aşağı
  const map = (u, v) => {
    const s = u / Lm, q = v / Sm;
    const top = [corner[0][0] + (corner[1][0] - corner[0][0]) * s, corner[0][1] + (corner[1][1] - corner[0][1]) * s];
    const bot = [corner[3][0] + (corner[2][0] - corner[3][0]) * s, corner[3][1] + (corner[2][1] - corner[3][1]) * s];
    return [top[0] + (bot[0] - top[0]) * q, top[1] + (bot[1] - top[1]) * q];
  };
  const step = 0.2;
  for (let v = 0; v < Sm; v += step) for (let u = 0; u < Lm; u += step) {
    const [x, y] = map(u, v).map(Math.round);
    if (x < 0 || y < 0 || x >= w || y >= h) continue;
    const inE = shape ? shape(u, v) : rx > 0 && ((u - Lm / 2) / rx) ** 2 + ((v - Sm / 2) / ry) ** 2 <= 1;
    const c = inE ? last : paper, o = (y * w + x) * 4;
    rgba[o] = c[0]; rgba[o + 1] = c[1]; rgba[o + 2] = c[2];
  }
  return { rgba, w, h };
}

// RGBA → PNG (tarayıcı testlerinde dosya olarak yüklemek için)
export function toPNG({ rgba, w, h }) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) { raw[y * (w * 4 + 1)] = 0; Buffer.from(rgba.buffer, rgba.byteOffset + y * w * 4, w * 4).copy(raw, y * (w * 4 + 1) + 1); }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(zlib.crc32(td) >>> 0);
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
