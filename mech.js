// Mekanizma: evolvent düz dişli profili ve hareket bağıntıları (dişli, kasnak / kayış, kremayer, vida, serbest oran).
// Saf JS — testlenebilir.

/* ---------- evolvent dişli ---------- */
// m: modül (mm), z: diş sayısı, alpha: basınç açısı (°, standart 20). Diş başı yüksekliği = m, diş dibi = 1,25·m.
export function gearDims(m, z, alpha = 20) {
  const a = alpha * Math.PI / 180, rp = m * z / 2;
  return { rp, rb: rp * Math.cos(a), ra: rp + m, rf: rp - 1.25 * m, dp: m * z, da: m * (z + 2), df: m * (z - 2.5), pitch: Math.PI * m };
}
const inv = (a) => Math.tan(a) - a;
// merkez (0,0) etrafında kapalı dış çevre [[x,y], …] (saat yönü tersine)
export function gearOutline(m, z, opt = {}) {
  z = Math.max(6, Math.round(z));
  const alpha = (opt.alpha || 20) * Math.PI / 180, nF = opt.flank || 8, d = gearDims(m, z, opt.alpha || 20);
  const psi = Math.PI / (2 * z) + inv(alpha);   // dişin yarı açısı taban dairesinde (evolvent fonksiyonuyla)
  const half = (r) => (r <= d.rb ? psi : psi - inv(Math.acos(d.rb / r)));
  const r0 = Math.max(d.rf, d.rb), step = 2 * Math.PI / z, pts = [];
  const P = (r, a) => pts.push([r * Math.cos(a), r * Math.sin(a)]);
  for (let k = 0; k < z; k++) {
    const c = k * step;
    // sol diş dibi → sağ yan (açı azalarak yukarı) … saat yönü tersine gitmek için önce dişin "−" yanı
    if (d.rf < d.rb) P(d.rf, c - psi);
    for (let i = 0; i <= nF; i++) { const r = r0 + (d.ra - r0) * (i / nF) ** 1.3; P(r, c - half(r)); }
    const ht = half(d.ra);
    P(d.ra, c);
    for (let i = nF; i >= 0; i--) { const r = r0 + (d.ra - r0) * (i / nF) ** 1.3; P(r, c + half(r)); }
    if (d.rf < d.rb) P(d.rf, c + psi);
    // diş boşluğu dibi (yay)
    const a0 = c + psi, a1 = c + step - psi;
    if (a1 > a0) for (let i = 1; i < 3; i++) P(d.rf, a0 + (a1 - a0) * i / 3);
  }
  return pts;
}
// iki dişlinin eksenleri arası (dıştan temas): a = m·(z1 + z2)/2
export const centerDistance = (m, z1, z2) => m * (z1 + z2) / 2;

/* ---------- bağıntılar ---------- */
// Her bağıntı sürücü eklemin değişimini (Δa) sürülen ekleme aktarır: Δb = k · Δa.
// Döner eklem: derece; kayar eklem: mm.
export const COUPLINGS = {
  gear: { name: 'Dişli çark (dış)', from: 'hinge', to: 'hinge', note: 'Dıştan temaslı iki dişli ters yönde döner; oran = z₁ / z₂.' },
  igear: { name: 'İç dişli', from: 'hinge', to: 'hinge', note: 'İç dişlide aynı yönde döner; oran = z₁ / z₂.' },
  belt: { name: 'Kasnak / kayış / zincir', from: 'hinge', to: 'hinge', note: 'Aynı yönde döner; oran = d₁ / d₂ (çapraz kayışta ters).' },
  rack: { name: 'Kremayer (dişli → kayma)', from: 'hinge', to: 'slide', note: 'Bir turda kayma = π·m·z (bölüm dairesi çevresi).' },
  screw: { name: 'Vida / mil (dönme → kayma)', from: 'hinge', to: 'slide', note: 'Bir turda kayma = adım (çok ağızlıda adım × ağız sayısı).' },
  ratio: { name: 'Serbest oran', from: 'any', to: 'any', note: 'Δsürülen = oran × Δsürücü.' },
};
// k katsayısı (Δb / Δa)
export function couplingK(c) {
  const s = c.rev ? -1 : 1;
  switch (c.t) {
    case 'gear': return s * -(c.z1 / c.z2);
    case 'igear': return s * (c.z1 / c.z2);
    case 'belt': return s * (c.d1 / c.d2);
    case 'rack': return s * (Math.PI * c.m * c.z1) / 360;     // mm / derece
    case 'screw': return s * (c.p * (c.n || 1)) / 360;          // mm / derece
    case 'ratio': return s * c.k;
    default: return 0;
  }
}
export function couplingValid(c) {
  const k = couplingK(c);
  return isFinite(k) && k !== 0;
}
// sürücüden başlayarak değişimi yay (döngüleri engelle). cs: bağıntılar [{a, b, …}], d: Δ, out: Map(id → Δ)
// Bağıntı iki yönlü çalışır (b sürülürse a = Δ/k). Çelişki (aynı eklem iki farklı değer) varsa conflict döner.
export function propagate(cs, id, d) {
  const out = new Map([[id, d]]), q = [id];
  let conflict = null;
  while (q.length) {
    const x = q.shift(), dx = out.get(x);
    for (const c of cs) {
      if (!couplingValid(c)) continue;
      const k = couplingK(c);
      let y = null, dy = 0;
      if (c.a === x) { y = c.b; dy = k * dx; } else if (c.b === x) { y = c.a; dy = dx / k; }
      if (y == null) continue;
      if (out.has(y)) { if (Math.abs(out.get(y) - dy) > 1e-6 * Math.max(1, Math.abs(dy))) conflict = { a: c.a, b: c.b }; continue; }
      out.set(y, dy); q.push(y);
    }
  }
  return { deltas: out, conflict };
}
// motor: devir (d/dk) → derece / saniye; kayar eklem için mm/s doğrudan
export const rpmToDegPerSec = (rpm) => rpm * 6;
