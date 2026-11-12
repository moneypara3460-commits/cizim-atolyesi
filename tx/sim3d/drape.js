// Kumaş dökümlülük (drape) benzetimi — Cusick düzeni: 30 cm çaplı daire numune, 18 cm çaplı destek diski.
// Model: XPBD (sınırlı konum tabanlı dinamik). Uzama: neredeyse uzamaz mesafe kısıtları (yapısal + kesme).
// Eğilme: ızgara çizgisi boyunca ardışık üç parçacıkta orta noktanın sapması δ = m − (a + b)/2 sıfıra çekilir.
//   Eğrilik κ ≈ 2|δ|/h², düğüm başına enerji ½·B·κ²·h² = 2·B·δ²/h² → yay sabiti k = 4·B/h² (B: N·m/m, h: ızgara aralığı). Ayrık YAKLAŞIM.
// Öz-çarpışma yok. Sonuç fiziksel bir MODEL çıktısıdır: kullanıcı ölçtüğü dökümlülük katsayısıyla karşılaştırmadan doğrulanmış sayılmaz.
// Birimler: SI (m, kg, s, N).

export const CUSICK = { specimenR: 0.15, discR: 0.09 };

// Belirlenimci küçük gürültü (aynı girdi → aynı sonuç)
function lcg(seed) { let s = seed >>> 0; return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296); }

// opts: { gsm (g/m²), bend (μN·m, eğilme rijitliği), n (ızgara), steps, iters, seed }
export function simulateDrape({ gsm, bend, n = 31, steps = 700, iters = 12, seed = 7, dt = 1 / 240, damping = 0.03 } = {}) {
  if (!(gsm > 0)) throw new Error('Gramaj (g/m²) gerekli');
  if (!(bend > 0)) throw new Error('Eğilme rijitliği (μN·m) gerekli');
  const R = CUSICK.specimenR, Rd = CUSICK.discR, h = (2 * R) / (n - 1), B = bend * 1e-6, mPer = (gsm / 1000) * h * h;
  const idx = new Int32Array(n * n).fill(-1), X = [], Y = [], Z = [], W = [];
  const rnd = lcg(seed);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const x = -R + i * h, y = -R + j * h, r = Math.hypot(x, y); if (r > R + 1e-9) continue;
    idx[j * n + i] = X.length; X.push(x); Y.push(y); Z.push((rnd() - 0.5) * 1e-4); W.push(r <= Rd ? 0 : 1 / mPer);
  }
  const N = X.length, px = Float64Array.from(X), py = Float64Array.from(Y), pz = Float64Array.from(Z), w = Float64Array.from(W);
  const vx = new Float64Array(N), vy = new Float64Array(N), vz = new Float64Array(N), ox = new Float64Array(N), oy = new Float64Array(N), oz = new Float64Array(N);
  // kısıtlar: [a, b, rest, compliance]
  const A = [], Bq = [], L0 = [], Cm = [];
  const add = (a, b, comp) => { if (a < 0 || b < 0) return; A.push(a); Bq.push(b); L0.push(Math.hypot(px[a] - px[b], py[a] - py[b], pz[a] - pz[b])); Cm.push(comp); };
  const kStretch = 1e-7, kBendK = (4 * B) / (h * h), kBend = 1 / kBendK;
  const at = (i, j) => (i >= 0 && j >= 0 && i < n && j < n ? idx[j * n + i] : -1);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const a = at(i, j); if (a < 0) continue;
    add(a, at(i + 1, j), kStretch); add(a, at(i, j + 1), kStretch); add(a, at(i + 1, j + 1), kStretch); add(a, at(i - 1, j + 1), kStretch);
  }
  // eğilme üçlüleri: [a, m, b]
  // çok ölçekli: aralık 1, 2, 4 (uzun menzilli üçlüler sertliği Gauss–Seidel'de hızlı yayar; her ölçek k = 4B/(s·h)² ile)
  const T = [], TS = [];
  for (const sp of [1, 2, 4]) for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) { const m = at(i, j); if (m < 0) continue; const l = at(i - sp, j), r = at(i + sp, j), d = at(i, j - sp), u = at(i, j + sp); if (l >= 0 && r >= 0) { T.push(l, m, r); TS.push(sp); } if (d >= 0 && u >= 0) { T.push(d, m, u); TS.push(sp); } }
  const nt = T.length / 3, lamB = new Float64Array(nt);
  const nc = A.length, lam = new Float64Array(nc), g = -9.81;
  for (let s = 0; s < steps; s++) {
    for (let k = 0; k < N; k++) { ox[k] = px[k]; oy[k] = py[k]; oz[k] = pz[k]; if (!w[k]) continue; vz[k] += g * dt; px[k] += vx[k] * dt; py[k] += vy[k] * dt; pz[k] += vz[k] * dt; }
    lam.fill(0); lamB.fill(0);
    for (let it = 0; it < iters; it++) {
      for (let c = 0; c < nc; c++) {
        const a = A[c], b = Bq[c], wa = w[a], wb = w[b], ws = wa + wb; if (!ws) continue;
        const dx = px[a] - px[b], dy = py[a] - py[b], dz = pz[a] - pz[b], d = Math.hypot(dx, dy, dz); if (d < 1e-12) continue;
        const C = d - L0[c], at2 = Cm[c] / (dt * dt), dl = (-C - at2 * lam[c]) / (ws + at2); lam[c] += dl;
        const fx = (dx / d) * dl, fy = (dy / d) * dl, fz = (dz / d) * dl;
        px[a] += wa * fx; py[a] += wa * fy; pz[a] += wa * fz; px[b] -= wb * fx; py[b] -= wb * fy; pz[b] -= wb * fz;
      }
      for (let t = 0; t < nt; t++) {
        const a = T[3 * t], m = T[3 * t + 1], b = T[3 * t + 2], wa = w[a], wm = w[m], wb = w[b], ws = wm + 0.25 * (wa + wb); if (!ws) continue;
        const dx = px[m] - 0.5 * (px[a] + px[b]), dy = py[m] - 0.5 * (py[a] + py[b]), dz = pz[m] - 0.5 * (pz[a] + pz[b]), d = Math.hypot(dx, dy, dz); if (d < 1e-12) continue;
        const at2 = (kBend * TS[t] * TS[t]) / (dt * dt), dl = (-d - at2 * lamB[t]) / (ws + at2); lamB[t] += dl;
        const fx = (dx / d) * dl, fy = (dy / d) * dl, fz = (dz / d) * dl;
        px[m] += wm * fx; py[m] += wm * fy; pz[m] += wm * fz;
        px[a] -= 0.5 * wa * fx; py[a] -= 0.5 * wa * fy; pz[a] -= 0.5 * wa * fz; px[b] -= 0.5 * wb * fx; py[b] -= 0.5 * wb * fy; pz[b] -= 0.5 * wb * fz;
      }
      // disk: serbest parçacık diskin içinden geçemez (disk üst yüzü z = 0, kalınlık 5 mm)
      for (let k = 0; k < N; k++) { if (!w[k]) continue; const r = Math.hypot(px[k], py[k]); if (r < Rd && pz[k] < 0 && pz[k] > -0.005) { const f = Rd / Math.max(r, 1e-9); px[k] *= f; py[k] *= f; } }
    }
    const keep = 1 - damping;
    for (let k = 0; k < N; k++) { vx[k] = ((px[k] - ox[k]) / dt) * keep; vy[k] = ((py[k] - oy[k]) / dt) * keep; vz[k] = ((pz[k] - oz[k]) / dt) * keep; }
  }
  // üçgenler
  const tris = [];
  for (let j = 0; j < n - 1; j++) for (let i = 0; i < n - 1; i++) { const a = at(i, j), b = at(i + 1, j), c = at(i + 1, j + 1), d = at(i, j + 1); if (a >= 0 && b >= 0 && c >= 0) tris.push(a, b, c); if (a >= 0 && c >= 0 && d >= 0) tris.push(a, c, d); }
  // gölge alanı: izdüşen üçgenler 1 mm ızgarada taranır (birleşim alanı). Başvuru alanı aynı ağın düz hâli → düz numune DC = 1.
  const sh = shadow(px, py, tris), ref = shadow(Float64Array.from(X), Float64Array.from(Y), tris), A0 = ref.area, Ad = Math.PI * Rd * Rd, As = sh.area;
  const dc = Math.max(0, Math.min(1, (As - Ad) / (A0 - Ad))), bins = sh.rmax.length, rmax = [...sh.rmax].map((v, b) => v - ref.rmax[b]);   // düz hâline göre çekilme (ağ kenarının pürüzü düşer)
  // dalga (kat) sayısı: düzgünleştirilmiş yarıçap profilinde yerel tepeler
  const sm = [...rmax].map((_, b) => { let s2 = 0; for (let k = -10; k <= 10; k++) s2 += rmax[(b + k + bins) % bins]; return s2 / 21; });
  const mean = sm.reduce((a, v) => a + v, 0) / bins, top = Math.max(...sm); let nodes = 0;
  // tepe: ±15° içinde en büyük ve ortalamanın belirgin üstünde (düz numunede tepe yok)
  if (top - mean > 0.005) for (let b = 0; b < bins; b++) { const v = sm[b]; if (v <= mean + 0.25 * (top - mean)) continue; let isMax = true; for (let k = 1; k <= 15 && isMax; k++) if (sm[(b + k) % bins] > v || sm[(b - k + bins) % bins] >= v) isMax = false; if (isMax) nodes++; }
  let maxV = 0; for (let k = 0; k < N; k++) maxV = Math.max(maxV, Math.hypot(vx[k], vy[k], vz[k]));
  return { dc, nodes, shadowArea: As, refArea: A0, settled: maxV < 0.02, maxV, particles: N, pos: { x: px, y: py, z: pz }, tris, rmax: [...sh.rmax], model: { h, k_b: kBendK, gsm, bend } };
}

// İzdüşüm birleşim alanı (m²) ve 360 açısal dilimde en büyük yarıçap; ızgara 1 mm
function shadow(x, y, tris, res = 0.001, R = 0.16) {
  const N = Math.ceil((2 * R) / res), grid = new Uint8Array(N * N), bins = 360, rmax = new Float64Array(bins);
  const toI = (v) => (v + R) / res;
  for (let t = 0; t < tris.length; t += 3) {
    const a = tris[t], b = tris[t + 1], c = tris[t + 2], ax = toI(x[a]), ay = toI(y[a]), bx = toI(x[b]), by = toI(y[b]), cx = toI(x[c]), cy = toI(y[c]);
    const i0 = Math.max(0, Math.floor(Math.min(ax, bx, cx))), i1 = Math.min(N - 1, Math.ceil(Math.max(ax, bx, cx))), j0 = Math.max(0, Math.floor(Math.min(ay, by, cy))), j1 = Math.min(N - 1, Math.ceil(Math.max(ay, by, cy)));
    const d = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax); if (Math.abs(d) < 1e-12) continue;
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const px = i + 0.5, py = j + 0.5, u = ((bx - px) * (cy - py) - (by - py) * (cx - px)) / d, v = ((cx - px) * (ay - py) - (cy - py) * (ax - px)) / d, w = 1 - u - v;
      if (u >= -1e-9 && v >= -1e-9 && w >= -1e-9) grid[j * N + i] = 1;
    }
  }
  let cnt = 0;
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) if (grid[j * N + i]) { cnt++; const X = (i + 0.5) * res - R, Y = (j + 0.5) * res - R, r = Math.hypot(X, Y); let b = Math.floor(((Math.atan2(Y, X) + Math.PI) / (2 * Math.PI)) * bins); if (b >= bins) b = 0; if (r > rmax[b]) rmax[b] = r; }
  return { area: cnt * res * res, rmax };
}

// Eğilme rijitliğini ölçülen dökümlülük katsayısına uydur (log ölçekte ikiye bölme). DC eğilmeyle artar.
export function calibrateBend({ gsm, target, lo = 0.02, hi = 2000, rounds = 12, ...o }) {
  if (!(target > 0 && target < 1)) throw new Error('Ölçülen dökümlülük katsayısı 0 ile 1 arasında olmalı');
  let a = Math.log(lo), b = Math.log(hi), best = null;
  const fa = simulateDrape({ gsm, bend: lo, ...o }).dc, fb = simulateDrape({ gsm, bend: hi, ...o }).dc;
  if (target < fa || target > fb) throw new Error(`Hedef ${target} bu modelin aralığında değil (${fa.toFixed(2)}–${fb.toFixed(2)})`);
  for (let r = 0; r < rounds; r++) { const m = (a + b) / 2, s = simulateDrape({ gsm, bend: Math.exp(m), ...o }); best = { bend: Math.exp(m), dc: s.dc }; if (s.dc < target) a = m; else b = m; }
  return best;
}

// Arayüz için: her benzetimden önce olay döngüsüne döner (sayfa donmaz), ilerleme bildirir
export async function calibrateBendAsync({ gsm, target, lo = 0.02, hi = 2000, rounds = 9, onStep = null, ...o }) {
  if (!(target > 0 && target < 1)) throw new Error('Ölçülen dökümlülük katsayısı 0 ile 1 arasında olmalı');
  const tick = () => new Promise((r) => setTimeout(r, 0)), total = rounds + 2; let k = 0;
  const run = async (bend) => { await tick(); onStep && onStep(++k, total); return simulateDrape({ gsm, bend, ...o }); };
  const fa = (await run(lo)).dc, fb = (await run(hi)).dc;
  if (target < fa || target > fb) throw new Error(`Hedef ${target} bu modelin aralığında değil (${fa.toFixed(2)}–${fb.toFixed(2)})`);
  let a = Math.log(lo), b = Math.log(hi), best = null;
  for (let r = 0; r < rounds; r++) { const m = (a + b) / 2, s2 = await run(Math.exp(m)); best = { bend: Math.exp(m), dc: s2.dc, res: s2 }; if (s2.dc < target) a = m; else b = m; }
  return best;
}

// Doğrulama durumu: ölçülen referans yoksa doğrulanmamış; varsa fark ±0,05 içinde mi. Eğilme aynı ölçümden kalibre edildiyse bağımsız değil.
export function drapeStatus(simDC, { measured = null, calibratedFromSame = false, tol = 0.05 } = {}) {
  if (measured == null || !(measured >= 0 && measured <= 1)) return { level: 'uyarı', verified: false, text: 'DOĞRULANMAMIŞ — ölçülmüş dökümlülük katsayısı (referans numune) yok; sonuç yalnız model tahminidir' };
  const d = simDC - measured;
  if (Math.abs(d) > tol) return { level: 'hata', verified: false, text: `Referansla UYUŞMUYOR: model ${simDC.toFixed(2)}, ölçülen ${measured.toFixed(2)} (fark ${d >= 0 ? '+' : ''}${d.toFixed(2)}, tolerans ±${tol})` };
  if (calibratedFromSame) return { level: 'uyarı', verified: false, text: `Kalibre edildi: eğilme rijitliği bu ölçümden uyduruldu (fark ${d.toFixed(3)}); bağımsız doğrulama için ikinci bir ölçüm (ör. başka numune) gerekir` };
  return { level: 'ok', verified: true, text: `Referans numuneyle uyumlu: model ${simDC.toFixed(2)}, ölçülen ${measured.toFixed(2)} (fark ${d >= 0 ? '+' : ''}${d.toFixed(2)}, tolerans ±${tol})` };
}

// Kumaş kartındaki son benzetimin durumu (m.sim = { dc, bend, calibrated, sig })
export const drapeSig = (m) => `${m.props.gsm}|${m.props.bendEff}`;
export function drapeVerdict(m) {
  const sm = m.sim; if (!sm) return null;
  if (sm.sig !== drapeSig(m)) return { level: 'uyarı', verified: false, text: 'Benzetim eski: gramaj ya da eğilme değişti, yeniden benzet' };
  return sm.calibrated && m.props.drapeRef2 != null ? drapeStatus(sm.dc, { measured: m.props.drapeRef2 }) : drapeStatus(sm.dc, { measured: m.props.drapeRef, calibratedFromSame: !!sm.calibrated });
}
