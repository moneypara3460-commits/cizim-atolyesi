// Test verisi: 21 noktalı yapay el (MediaPipe sırası, normalize koordinat). Gerçek kamera görüntüsü DEĞİLDİR;
// yalnız hareket mantığını (tests/hand.test.mjs) ve arayüz bağlantısını (E2E) belirli girdilerle sınamak içindir.
// hand({ x, y, size, pinch, fingers }) → işaret parmağı ucu (x, y) noktasına gelen el.
//   pinch: başparmak ucu ↔ işaret ucu uzaklığı / el boyu.  fingers: [işaret, orta, yüzük, serçe] açık mı
//   Birleştirirken işaret parmağı da bükülür (gerçekte olduğu gibi): uç, (x, y) noktasından aşağı kayar.
export function hand({ x = 0.5, y = 0.5, size = 0.2, pinch = 1.2, fingers = [true, false, false, false], aspect = 4 / 3 } = {}) {
  const s = size, ax = 1 / aspect;                 // x birimi: görüntü yüksekliği → normalize
  const curl = Math.max(0, Math.min(1, (0.62 - pinch) / 0.62)) * 0.35 * s;   // birleştirme yaklaştıkça uç aşağı iner
  // bilek (0, 0); parmaklar yukarı (−y). Kök noktaları: işaret (−0.5s .. ) serçe (+0.5s)
  const mcp = [[-0.45, -1.0], [-0.15, -1.08], [0.15, -1.0], [0.45, -0.85]].map(([u, v]) => [u * s, v * s]);
  const finger = ([mx, my], open, len) => open
    ? [[mx, my], [mx, my - len * 0.45], [mx, my - len * 0.75], [mx, my - len]]
    : [[mx, my], [mx, my - len * 0.3], [mx + 0.02 * s, my - len * 0.1], [mx + 0.03 * s, my + len * 0.12]];
  const idx = finger(mcp[0], fingers[0], 0.95 * s), mid = finger(mcp[1], fingers[1], 1.05 * s), rng = finger(mcp[2], fingers[2], 0.95 * s), pky = finger(mcp[3], fingers[3], 0.75 * s);
  if (fingers[0]) { idx[3][1] += curl; idx[2][1] += curl * 0.5; }
  const tip = idx[3];
  const hs = Math.max(Math.hypot(0.9, 0.15), Math.hypot(0.15, 1.08) * 0.75) * s;   // gestures.js handSize ile aynı ölçü
  const thumbTip = [tip[0] - pinch * hs, tip[1]];                  // başparmak ucu işaret ucunun solunda, tam `pinch` oranında
  const thumb = [[-0.55 * s, -0.25 * s], [-0.8 * s, -0.5 * s], [(thumbTip[0] - 0.8 * s) / 2, (thumbTip[1] - 0.5 * s) / 2], thumbTip];
  const local = [[0, 0], ...thumb, ...idx, ...mid, ...rng, ...pky];
  // işaret parmağı ucunun açık haldeki yeri (x, y) olsun
  const ox = x - mcp[0][0] * ax, oy = y - (mcp[0][1] - 0.95 * s);
  return local.map(([u, v]) => ({ x: ox + u * ax, y: oy + v, z: 0 }));
}
export const POSE = {
  point: { fingers: [true, false, false, false], pinch: 1.2 },
  pinch: { fingers: [true, false, false, false], pinch: 0.1 },
  palm: { fingers: [true, true, true, true], pinch: 1.3 },
  two: { fingers: [true, true, false, false], pinch: 1.2 },
  fist: { fingers: [false, false, false, false], pinch: 0.9 },
};
