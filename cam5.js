// Çok eksenli CAM (4 ve 5 eksen): kurulum, takım yolu stratejileri, güvenli bağlantı hareketleri, kinematik çözüm.
// 3 eksen CAM (cam.js) değiştirilmez; indeksli / 3+2 işlemler onun motorunu döndürülmüş çerçevede kullanır.
// Saf hesap (DOM yok). Çarpışma ve talaş simülasyonu: coll5.js, G-kodu: post5.js.
//
// Ortak takım yolu verisi (CL): { p:[x,y,z] takım ucu, v:[i,j,k] takım ekseni, k:'r'|'f'|'p', f: ilerleme mm/dk, op: işlem sırası }
// İş parçası çerçevesi (W): makine gibi Z yukarı, iş sıfırı orijinde (bkz. kin.js). Simülasyon, çarpışma ve G-kodu aynı CL dizisini kullanır.
import * as C from './cam.js?v=20261111c';
import * as K from './kin.js?v=20261111c';

const { dot, cross, add, sub, mul, norm, unit, rot } = K;
const Z = [0, 0, 1];

export const STRATS = {
  index4: { name: '4 eksen indeksli (kaba + ince, her açıda 3 eksen)', axes: 4, sim: false, kind: 'index' },
  rotary4: { name: '4 eksen eş zamanlı döner işleme (X + A helis)', axes: 4, sim: true, kind: 'rotary' },
  p32: { name: '5 eksen 3+2 konumlandırmalı (sabit eğik takım)', axes: 5, sim: false, kind: 'index' },
  sim5: { name: '5 eksen eş zamanlı yüzey ince işleme (küresel uç, yüzey normali + lead / tilt)', axes: 5, sim: true, kind: 'surface' },
};
export const STRAT_LIMITS = {
  index4: 'Her açıda modelin o yönden görünen yüzeyleri işlenir (3 eksen motoru). Açılar arasındaki gizli girintiler işlenmez. Kaba işleme dönme eksenine kadar iner.',
  rotary4: 'Yalnız A ekseni X boyunca olan divizör / ayna bağlamasında. Parça, dönme ekseninden dışarı doğru bakıldığında görünen yüzeylerden oluşmalı (eksene göre "yıldız biçimli"); eksene paralel derin cepler ve alt kesilmeler işlenmez. Küresel uç için yüzey yerel olarak açılarak hesaplanır: takım yarıçapı parça yarıçapına göre küçük olmalı.',
  p32: 'Seçilen her yön için o yönden görünen yüzeyler 3 eksen motoruyla işlenir; takım yönü işlem boyunca sabittir. Yön makinenin döner eksen limitleri içinde olmalı.',
  sim5: 'Küresel uçlu takımla, üstten (+Z yarım küresi) görünen yüzeylerde. Takım ekseni yüzey normaline göre lead / tilt açılarıyla eğilir ve en çok "en büyük eğim" kadar dikeyden ayrılır; küre merkezi yönden bağımsız olduğundan yüzeye dalma olmaz, sap ve tutucu çarpışması ayrıca kontrol edilir. Alttan girintiler (alt kesilme) bu stratejiyle işlenmez.',
};

// ---- kurulum: model (dünya, Y yukarı) → W çerçevesi, ham parça ve bağlama ----
// job.setup: { stockSide, stockTop, stockBottom, grip (aynada tutma boyu), chuckD, chuckL, tail (punta), viseH (mengene çene yüksekliği), clampH }
export function setupPart(worldTris, machine, s = {}) {
  const t = C.toMachine(worldTris), b = C.boundsOf(t);
  const out = new Float32Array(t.length);
  let T;
  const fix = [];
  let stock;
  if (machine.type === '4ax' && machine.mount === 'chuck') {
    // A ekseni X boyunca: parça ekseni dönme ekseninde, sol ucu X0
    T = [-b.min[0], -(b.min[1] + b.max[1]) / 2, -(b.min[2] + b.max[2]) / 2];
    for (let i = 0; i < t.length; i += 3) { out[i] = t[i] + T[0]; out[i + 1] = t[i + 1] + T[1]; out[i + 2] = t[i + 2] + T[2]; }
    let rmax = 0; for (let i = 0; i < out.length; i += 3) rmax = Math.max(rmax, Math.hypot(out[i + 1], out[i + 2]));
    const L = b.max[0] - b.min[0], side = s.stockSide ?? 2, face = s.stockFace ?? 1, grip = s.grip ?? 20, gap = s.gap ?? 25;
    stock = { kind: 'cyl', axis: 'x', r: rmax + side, x0: -gap - grip, x1: L + face };
    const chuckD = Math.max(s.chuckD ?? 100, 2 * stock.r + 10), chuckL = s.chuckL ?? 60;
    fix.push({ name: 'Ayna (çeneler + gövde)', kind: 'cylX', r: chuckD / 2, x0: -gap - chuckL, x1: -gap });
    if (s.tail) fix.push({ name: 'Punta', kind: 'cylX', r: 25, x0: stock.x1 + 5, x1: stock.x1 + 120 }, { name: 'Punta ucu', kind: 'cylX', r: 6, x0: stock.x1, x1: stock.x1 + 5 });
  } else {
    // parça tabanı tabla / mengene üstünde, ortası Z ekseninde
    T = [-(b.min[0] + b.max[0]) / 2, -(b.min[1] + b.max[1]) / 2, -b.min[2]];
    for (let i = 0; i < t.length; i += 3) { out[i] = t[i] + T[0]; out[i + 1] = t[i + 1] + T[1]; out[i + 2] = t[i + 2] + T[2]; }
    const side = s.stockSide ?? 2, top = s.stockTop ?? 1, bot = s.stockBottom ?? 5;
    const hx = (b.max[0] - b.min[0]) / 2 + side, hy = (b.max[1] - b.min[1]) / 2 + side;
    stock = { kind: 'box', x0: -hx, x1: hx, y0: -hy, y1: hy, z0: -bot, z1: b.max[2] - b.min[2] + top };
    const clampH = Math.min(s.clampH ?? Math.max(1, bot - 2), bot), viseH = s.viseH ?? 40, jaw = 15;   // çene ham parçanın alt payını tutar, parçaya ulaşmaz
    // mengene çeneleri ham parçayı alttan clampH kadar tutar; tabla yüzü çene altında
    fix.push({ name: 'Mengene çenesi (sol)', kind: 'box', min: [stock.x0 - 10, stock.y0 - jaw, stock.z0 - viseH], max: [stock.x1 + 10, stock.y0, stock.z0 + clampH] });
    fix.push({ name: 'Mengene çenesi (sağ)', kind: 'box', min: [stock.x0 - 10, stock.y1, stock.z0 - viseH], max: [stock.x1 + 10, stock.y1 + jaw, stock.z0 + clampH] });
    fix.push({ name: 'Tabla yüzü', kind: 'plane', z: stock.z0 - viseH });
  }
  return { t: out, T, stock, fix, bounds: C.boundsOf(out) };
}
// W noktası → dünya (görüntü): toMachine'in tersi
export const toWorld = (S, p) => { const x = p[0] - S.T[0], y = p[1] - S.T[1], z = p[2] - S.T[2]; return [x, z, -y]; };
export function stockBox(st) { return st.kind === 'cyl' ? { min: [st.x0, -st.r, -st.r], max: [st.x1, st.r, st.r] } : { min: [st.x0, st.y0, st.z0], max: [st.x1, st.y1, st.z1] }; }

// W üçgenleri bir döndürmeyle çevrilmiş çerçeveye (takım ekseni +Z olacak şekilde)
function rotTris(t, u, deg) { const o = new Float32Array(t.length); for (let i = 0; i < t.length; i += 3) { const q = rot(u, deg, [t[i], t[i + 1], t[i + 2]]); o[i] = q[0]; o[i + 1] = q[1]; o[i + 2] = q[2]; } return o; }
// cam.js dünya (Y yukarı) bekler: W-benzeri (Z yukarı) → dünya
function asWorld(t) { const o = new Float32Array(t.length); for (let i = 0; i < t.length; i += 3) { o[i] = t[i]; o[i + 1] = t[i + 2]; o[i + 2] = -t[i + 1]; } return o; }

// ---- indeksli / 3+2: her yön için 3 eksen motoru, sonuç W'ye geri döndürülür ----
function planIndexed(S, op, tools, dirs, frameFor) {
  const passes = [], warn = [];
  const sb = stockBox(S.stock);
  for (const d of dirs) {
    const { u, deg } = frameFor(d);
    const tf = rotTris(S.t, u, deg), bf = C.boundsOf(tf);
    // ham parça kutusunun bu çerçevedeki sınırları (köşeler döndürülür)
    let top = -Infinity, lo = Infinity;
    if (S.stock.kind === 'cyl') top = S.stock.r;
    else for (const x of [sb.min[0], sb.max[0]]) for (const y of [sb.min[1], sb.max[1]]) for (const z of [sb.min[2], sb.max[2]]) { const q = rot(u, deg, [x, y, z]); top = Math.max(top, q[2]); lo = Math.min(lo, q[2]); }
    // kaba boşaltmanın ineceği en alt seviye: döner eksende eksene kadar (karşı taraf sonraki açıda), diğerlerinde model altı
    // 3+2'de varsayılan derinlik: takımın kesme boyu (eğik yönde modelin altına kadar inmek tutucuyu çarptırır)
    const tl = tools.find((x) => x.id === op.tool), maxD = op.maxDepth || (tl && tl.flute ? tl.flute - 0.5 : Infinity);
    const floorZ = S.stock.kind === 'cyl' ? Math.max(bf.min[2], 0) : Math.max(bf.min[2], top - maxD);
    const job = {
      tris: asWorld(tf), tools, res: op.res || 0.5, safe: op.safe ?? 5, zero: 'corner',
      stock: { side: op.stockSide ?? 2, top: Math.max(0, top - bf.max[2]), bottom: 0 },
      ops: (op.sub || ['rough', 'walls']).map((type) => ({ type, on: true, tool: type === 'finish' ? (op.finishTool ?? op.tool) : op.tool, stepdown: op.stepdown, stepover: op.stepover, allowR: op.allowR, allowZ: op.allowZ, floor: floorZ })),
    };
    let R;
    try { R = C.plan(job); } catch (e) { warn.push({ sev: 'crit', t: 'Yön ' + fmtDir(d) + ': ' + e.message }); continue; }
    for (const w of R.warn) if (w.sev !== 'info' && !/alttan girinti/.test(w.t)) warn.push({ sev: w.sev, t: 'Yön ' + fmtDir(d) + ': ' + w.t });
    const vW = rot(u, -deg, Z);
    for (const o of R.ops) {
      const seg = [];
      for (const m of o.moves) { if (m.k === 'd') continue; seg.push({ p: rot(u, -deg, [m.x, m.y, m.z]), v: vW, k: m.k, f: m.f, tool: o.tool.id }); }
      if (seg.length) passes.push({ name: o.name + ' — ' + fmtDir(d), cl: seg, tool: o.tool.id, dir: d, index: true });
    }
  }
  return { passes, warn };
}
const fmtDir = (d) => (typeof d === 'number' ? d + '°' : '[' + d.map((x) => (Math.round(x * 1000) / 1000)).join(', ') + ']');

// ---- 4 eksen eş zamanlı: silindirik yükseklik haritası + X/A helis ----
// R(x, φ): x konumunda, φ yönünde (+Y'den +Z'ye) parçanın en dış yarıçapı. Üçgenler yoğun örneklenir.
export function radialMap(t, x0, x1, res, nphi) {
  const nx = Math.max(2, Math.ceil((x1 - x0) / res) + 1), M = new Float32Array(nx * nphi).fill(-Infinity), dphi = 2 * Math.PI / nphi;
  for (let i = 0; i < t.length; i += 9) {
    const A = [t[i], t[i + 1], t[i + 2]], B = [t[i + 3], t[i + 4], t[i + 5]], Cc = [t[i + 6], t[i + 7], t[i + 8]];
    const rmax = Math.max(Math.hypot(A[1], A[2]), Math.hypot(B[1], B[2]), Math.hypot(Cc[1], Cc[2]));
    const ext = Math.max(norm(sub(B, A)), norm(sub(Cc, A)), norm(sub(Cc, B)));
    const step = Math.min(res, Math.max(rmax, 0.5) * dphi) * 0.5, n = Math.max(1, Math.ceil(ext / step));
    for (let a = 0; a <= n; a++) for (let b = 0; a + b <= n; b++) {
      const w1 = a / n, w2 = b / n, w0 = 1 - w1 - w2;
      const x = A[0] * w0 + B[0] * w1 + Cc[0] * w2, y = A[1] * w0 + B[1] * w1 + Cc[1] * w2, z = A[2] * w0 + B[2] * w1 + Cc[2] * w2;
      const ix = Math.round((x - x0) / res); if (ix < 0 || ix >= nx) continue;
      let ph = Math.atan2(z, y); if (ph < 0) ph += 2 * Math.PI;
      const ip = Math.round(ph / dphi) % nphi, r = Math.hypot(y, z), c = ix * nphi + ip;
      if (r > M[c]) M[c] = r;
    }
  }
  return { M, nx, nphi, x0, res, dphi };
}
// takım ucunun yarıçapı (x, φ): küresel uçta açılmış yüzey yaklaşımıyla, düz uçta ayak izindeki en büyük yarıçap
function radialDrop(RM, x, ph, tool, floorR) {
  const rb = tool.d / 2, ball = tool.type === 'ball';
  let best = floorR;
  const ix0 = Math.floor((x - rb - RM.x0) / RM.res), ix1 = Math.ceil((x + rb - RM.x0) / RM.res);
  for (let ix = Math.max(0, ix0); ix <= Math.min(RM.nx - 1, ix1); ix++) {
    const dx = RM.x0 + ix * RM.res - x; if (Math.abs(dx) > rb) continue;
    const rem = Math.sqrt(rb * rb - dx * dx);
    // açısal pencere: en dış yarıçapta rem kadar yay
    const span = Math.min(Math.PI / 2, rem / Math.max(floorR, 1)), k = Math.ceil(span / RM.dphi);
    const ipc = Math.round(ph / RM.dphi);
    for (let o = -k; o <= k; o++) {
      const ip = ((ipc + o) % RM.nphi + RM.nphi) % RM.nphi, r = RM.M[ix * RM.nphi + ip];
      if (!(r > best - rb)) continue;
      const dph = (ipc + o) * RM.dphi - ph, ds = r * Math.sin(Math.abs(dph)), d2 = dx * dx + ds * ds;
      if (d2 > rb * rb) continue;
      const rr = r * Math.cos(dph);   // yüzey noktasının takım ekseni (radyal) üzerindeki izdüşümü
      const v = ball ? rr - (rb - Math.sqrt(rb * rb - d2)) : rr;
      if (v > best) best = v;
    }
  }
  return best;
}
function planRotary(S, op, tools, machine) {
  const warn = [], passes = [];
  if (!(machine.type === '4ax' && machine.mount === 'chuck' && Math.abs(Math.abs(machine.rot[0].axis[0]) - 1) < 1e-9)) return { passes, warn: [{ sev: 'crit', t: 'Eş zamanlı döner işleme yalnız A ekseni X boyunca olan divizör / ayna bağlamasında yapılır.' }] };
  const st = S.stock, b = S.bounds;
  const rough = tools.find((x) => x.id === op.tool), fin = tools.find((x) => x.id === (op.finishTool ?? op.tool));
  if (!rough || !fin) return { passes, warn: [{ sev: 'crit', t: 'Döner işleme: takım seçilmedi.' }] };
  const res = op.res || 0.5, nphi = Math.min(1440, Math.max(180, Math.ceil(2 * Math.PI * st.r / res)));
  const RM = radialMap(S.t, b.min[0] - fin.d, b.max[0] + fin.d, res, nphi);
  const sgn = Math.sign(machine.rot[0].axis[0]) || 1;
  // A açısı a iken takım altındaki yön: φ = 90° − a·sgn
  const clAt = (x, a, r, k, f, tool) => { const v = rot([1, 0, 0], -a * sgn, Z); return { p: [x, v[1] * r, v[2] * r], v, k, f, tool: tool.id, a }; };
  const xA = Math.max(b.min[0] - fin.d / 2, st.x0 + 1), xB = Math.min(b.max[0] + fin.d / 2, st.x1);
  const levels = [];
  const sd = op.stepdown || rough.d * 0.3, allow = op.allowR ?? 0.3;
  for (let r = st.r - sd; r > 0; r -= sd) levels.push(r);
  const minR = Math.max(0, Math.min(...Array.from(RM.M).filter((v) => v > -Infinity)));
  // helis: bir turda X'te "so" kadar ilerle; açı adımı en dış yarıçapta ~res yay
  const helix = (tool, so, rOf, name) => {
    const da = Math.max(0.5, Math.min(5, (res / Math.max(st.r, 1)) * 180 / Math.PI));
    const turns = Math.ceil((xB - xA) / so) + 1, cl = [];
    for (let a = 0; a <= turns * 360 + 1e-9; a += da) {
      const x = Math.min(xB, xA + (a / 360) * so), ph = ((90 - a * sgn) % 360 + 360) % 360 * Math.PI / 180;
      const r = rOf(x, ph);
      cl.push(clAt(x, a, r, 'f', tool.feed, tool));
    }
    if (cl.length) passes.push({ name, cl: simplifyCL(cl, 0.003), tool: tool.id, rotary: true });
  };
  if (op.sub ? op.sub.includes('rough') : true) {
    for (const L of levels) {
      if (L < minR - allow) break;
      helix(rough, rough.d * (op.stepover || 0.45), (x, ph) => Math.max(L, radialDrop(RM, x, ph, rough, minR - rough.d) + allow), 'Döner kaba (R' + L.toFixed(1) + ')');
    }
  }
  if (op.sub ? op.sub.includes('finish') : true) {
    const so = op.finishStepover || (fin.type === 'ball' ? fin.d * 0.15 : fin.d * 0.4);
    helix(fin, so, (x, ph) => Math.max(radialDrop(RM, x, ph, fin, 0), 0), 'Döner ince (helis)');
  }
  if (fin.type === 'ball' && fin.d / 2 > minR * 0.5) warn.push({ sev: 'warn', t: 'Döner ince işleme: takım yarıçapı parçanın en küçük yarıçapına göre büyük; açılmış yüzey yaklaşımı hata yapabilir (simülasyonla kontrol et).' });
  return { passes, warn };
}
// aynı doğru üzerindeki ara noktaları at (uç ve eksen birlikte)
function simplifyCL(cl, tol) {
  if (cl.length < 3) return cl;
  const out = [cl[0]];
  for (let i = 1; i < cl.length - 1; i++) {
    const a = out[out.length - 1], b = cl[i], c = cl[i + 1];
    const ab = sub(c.p, a.p), L = norm(ab) || 1e-12, t = Math.max(0, Math.min(1, dot(sub(b.p, a.p), ab) / (L * L)));
    const d = norm(sub(b.p, add(a.p, mul(ab, t)))), dv = norm(sub(b.v, unit(add(mul(a.v, 1 - t), mul(c.v, t)))));
    if (d > tol || dv > 1e-4 || b.k !== c.k) out.push(b);
  }
  out.push(cl[cl.length - 1]);
  return out;
}

// ---- 5 eksen eş zamanlı yüzey işleme ----
function planSurface5(S, op, tools) {
  const warn = [], passes = [];
  const tool = tools.find((x) => x.id === op.tool);
  if (!tool) return { passes, warn: [{ sev: 'crit', t: '5 eksen yüzey: takım seçilmedi.' }] };
  if (tool.type !== 'ball') return { passes, warn: [{ sev: 'crit', t: '5 eksen eş zamanlı yüzey işleme yalnız küresel uçlu takımla yapılır (yön değişince uç geometrisi aynı kalmalı).' }] };
  const rb = tool.d / 2, res = op.res || 0.5;
  const P = C.prepare({ tris: asWorld(S.t), tools: [tool], res, stock: { side: 0, top: 0, bottom: 0 } });
  const floor = P.stock.modelBot + (op.floorOffset ?? 0.01);
  // küresel uç düşürme: yükseklik haritası hücre merkezlerinde örneklendiği için uzaklık hücre köşegeni kadar kısaltılır (kenarda dalmasın)
  const ex = res * 0.71, G = P.G, H = P.H;
  const drop = (x, y, fl) => {
    const re = rb + ex, i0 = Math.max(0, Math.floor((x - re - G.ox) / G.res)), i1 = Math.min(G.nx - 1, Math.floor((x + re - G.ox) / G.res));
    const j0 = Math.max(0, Math.floor((y - re - G.oy) / G.res)), j1 = Math.min(G.ny - 1, Math.floor((y + re - G.oy) / G.res));
    let z = fl;
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const h = H[i + G.nx * j]; if (!(h > z - rb)) continue;
      const d = Math.max(0, Math.hypot(G.ox + (i + 0.5) * G.res - x, G.oy + (j + 0.5) * G.res - y) - ex);
      if (d > rb) continue;
      const v = h - (rb - Math.sqrt(rb * rb - d * d));
      if (v > z) z = v;
    }
    return z;
  };
  const so = op.stepover || tool.d * 0.12, step = Math.max(res, 0.4);
  const lead = (op.lead ?? 10) * Math.PI / 180, tilt = (op.tilt ?? 0) * Math.PI / 180, maxT = Math.min(89, op.maxTilt ?? 60) * Math.PI / 180;
  const b = P.b, x0 = b.min[0] - rb, x1 = b.max[0] + rb;
  const zc = (x, y) => drop(x, y, floor) + rb;   // küre merkezi yüksekliği
  let dir = 1;
  for (let y = b.min[1]; y <= b.max[1] + 1e-9; y += so) {
    let run = [];
    const flush = () => { if (run.length >= 2) passes.push({ name: '5 eksen yüzey', cl: simplifyCL(run, 0.002), tool: tool.id, sim5: true }); run = []; };
    const xs = []; for (let x = x0; x <= x1 + 1e-9; x += step) xs.push(x);
    if (dir < 0) xs.reverse();
    let prevV = null;
    for (const x of xs) {
      const tip = drop(x, y, floor);
      if (!(tip > floor + 1e-3)) { flush(); prevV = null; continue; }
      const c = [x, y, tip + rb], h = res;
      // offset yüzeyinin (küre merkezleri) normali = temas noktasındaki yüzey normali
      const gx = (zc(x + h, y) - zc(x - h, y)) / (2 * h), gy = (zc(x, y + h) - zc(x, y - h)) / (2 * h);
      const n = Number.isFinite(gx) && Number.isFinite(gy) ? unit([-gx, -gy, 1]) : Z;
      const fd = unit([dir, 0, 0]), side = unit(cross(n, fd)), fwd = unit(cross(side, n));
      // lead: ilerleme yönüne doğru eğ (sıfır kesme hızındaki uç noktasından kaçınır), tilt: yana eğ
      let v = op.orient === 'fixed' ? Z : n;
      v = unit(rot(side, -lead * 180 / Math.PI, v));
      v = unit(rot(fwd, tilt * 180 / Math.PI, v));
      // dikeyden en fazla maxT
      const ang = Math.acos(Math.max(-1, Math.min(1, v[2])));
      if (ang > maxT) { const ax = unit(cross(v, Z)); v = unit(rot(ax, (ang - maxT) * 180 / Math.PI, v)); }
      // ani yön değişimini yumuşat (adım başına en çok 3°)
      if (prevV) { const a = Math.acos(Math.max(-1, Math.min(1, dot(prevV, v)))); if (a > 3 * Math.PI / 180) { const ax = unit(cross(prevV, v)); if (norm(ax) > 0) v = unit(rot(ax, 3, prevV)); } }
      prevV = v;
      run.push({ p: sub(c, mul(v, rb)), v, k: 'f', f: tool.feed, tool: tool.id });
    }
    flush(); dir = -dir;
  }
  return { passes, warn };
}

// ---- güvenli bağlantı: geçiş sonu → takım ekseni boyunca geri çekil → güvenli küre / silindir üstünde → yeni geçişe yaklaş ----
function linkAll(S, passes, job) {
  const sb = stockBox(S.stock), safe = job.safe ?? 5, clear = job.clear ?? 3;
  const cyl = S.stock.kind === 'cyl';
  const ctr = cyl ? null : mul(add(sb.min, sb.max), 0.5);
  const Rs = cyl ? S.stock.r + safe : norm(sub(sb.max, ctr)) + safe;
  // nokta p'den v boyunca güvenli yüzeye çık
  const exitAlong = (p, v) => {
    if (cyl) { const a = v[1] * v[1] + v[2] * v[2]; if (a < 1e-9) return add(p, mul(v, Rs)); const bq = p[1] * v[1] + p[2] * v[2], cq = p[1] * p[1] + p[2] * p[2] - Rs * Rs; const s = (-bq + Math.sqrt(Math.max(0, bq * bq - a * cq))) / a; return add(p, mul(v, Math.max(s, clear))); }
    const q = sub(p, ctr), bq = dot(q, v), cq = dot(q, q) - Rs * Rs, s = -bq + Math.sqrt(Math.max(0, bq * bq - cq));
    return add(p, mul(v, Math.max(s, clear)));
  };
  // güvenli yüzey üstünde iki nokta arasında (küre: büyük daire, silindir: yarıçap sabit, X doğrusal) ara noktalar
  const arc = (A, vA, B, vB) => {
    const out = [];
    if (cyl) {
      const pa = Math.atan2(A[2], A[1]), pb0 = Math.atan2(B[2], B[1]);
      let d = pb0 - pa; d = Math.atan2(Math.sin(d), Math.cos(d));
      const n = Math.max(1, Math.ceil(Math.abs(d) / (10 * Math.PI / 180)));
      for (let i = 1; i < n; i++) { const f = i / n, ph = pa + d * f, x = A[0] + (B[0] - A[0]) * f; const v = [0, Math.cos(ph), Math.sin(ph)]; out.push({ p: [x, Rs * v[1], Rs * v[2]], v: unit(add(mul(vA, 1 - f), mul(vB, f))) }); }
      return out;
    }
    const da = unit(sub(A, ctr)), db = unit(sub(B, ctr)), w = Math.acos(Math.max(-1, Math.min(1, dot(da, db))));
    const n = Math.max(1, Math.ceil(w / (10 * Math.PI / 180)));
    for (let i = 1; i < n; i++) {
      const f = i / n, s = Math.sin(w);
      const d = s < 1e-6 ? da : unit(add(mul(da, Math.sin((1 - f) * w) / s), mul(db, Math.sin(f * w) / s)));
      out.push({ p: add(ctr, mul(d, Rs)), v: unit(add(mul(vA, 1 - f), mul(vB, f))) });
    }
    return out;
  };
  const cl = [];
  let last = null;
  passes.forEach((ps, oi) => {
    const first = ps.cl[0];
    const tool = job.tools.find((t) => t.id === ps.tool);
    const entry = exitAlong(first.p, first.v), toolChange = !last || last.tool !== ps.tool;
    if (last && !toolChange) {
      const ex = exitAlong(last.p, last.v);
      cl.push({ p: ex, v: last.v, k: 'r', f: 0, tool: ps.tool, op: oi, link: true });
      for (const q of arc(ex, last.v, entry, first.v)) cl.push({ ...q, k: 'r', f: 0, tool: ps.tool, op: oi, link: true });
    }
    cl.push({ p: entry, v: first.v, k: 'r', f: 0, tool: ps.tool, op: oi, link: true, tc: toolChange });
    // takım ekseni boyunca yaklaş: hızlı "clear" mm'ye kadar, sonra dalma ilerlemesiyle
    cl.push({ p: add(first.p, mul(first.v, clear)), v: first.v, k: 'r', f: 0, tool: ps.tool, op: oi, link: true });
    for (let i = 0; i < ps.cl.length; i++) {
      const c = ps.cl[i];
      cl.push({ p: c.p, v: c.v, k: i === 0 ? 'p' : c.k, f: i === 0 ? (tool.plunge || tool.feed / 3) : (c.k === 'r' ? 0 : c.f), tool: ps.tool, op: oi });
    }
    last = { ...ps.cl[ps.cl.length - 1], tool: ps.tool };
  });
  if (last) { const ex = exitAlong(last.p, last.v); cl.push({ p: ex, v: last.v, k: 'r', f: 0, tool: last.tool, op: passes.length - 1, link: true }); }
  return cl;
}

// ---- ana hesap: işlemler → geçişler → bağlantı → kinematik ----
// job: { tris (dünya), machine, setup, tools: [{ id, n, type, d, flute, stickout, holder:{d,len}, rpm, feed, plunge }], ops: [...], spindle: {d,len}, safe, clear }
export function plan5(job) {
  const err = K.validateMachine(job.machine);
  if (err.length) throw new Error('Makine tanımı hatalı: ' + err.join('; '));
  const m = job.machine, S = setupPart(job.tris, m, job.setup || {});
  const warn = [], passes = [], opsOut = [];
  for (const [oi, op] of job.ops.entries()) {
    if (op.on === false) continue;
    const st = STRATS[op.type];
    if (!st) { warn.push({ sev: 'crit', t: 'Bilinmeyen işlem: ' + op.type }); continue; }
    if (st.axes === 5 && !m.type.startsWith('5ax')) { warn.push({ sev: 'crit', t: st.name + ': bu makine 5 eksenli değil.' }); continue; }
    if (st.axes === 4 && m.type !== '4ax') { warn.push({ sev: 'crit', t: st.name + ': 4 eksenli makine seçilmeli.' }); continue; }
    let r;
    if (op.type === 'index4') {
      const u = unit(m.rot[0].axis), angles = (op.angles && op.angles.length ? op.angles : [0, 90, 180, 270]).map(Number);
      r = planIndexed(S, op, job.tools, angles, (a) => ({ u, deg: a }));
      for (const ps of r.passes) ps.angle = ps.dir;
    } else if (op.type === 'p32') {
      const dirs = (op.dirs && op.dirs.length ? op.dirs : [[0, 0, 1]]).map(unit);
      r = planIndexed(S, op, job.tools, dirs, (d) => K.alignToZ(d));
    } else if (op.type === 'rotary4') r = planRotary(S, op, job.tools, m);
    else if (op.type === 'sim5') r = planSurface5(S, op, job.tools);
    for (const ps of r.passes) { ps.opType = op.type; ps.opIndex = oi; ps.simul = st.sim; passes.push(ps); }
    warn.push(...r.warn);
    opsOut.push({ type: op.type, name: st.name, passes: r.passes.length, limits: STRAT_LIMITS[op.type] });
  }
  const cl = linkAll(S, passes, job);
  // kinematik: her CL için makine eksenleri; limit / erişim ihlali işaretlenir
  const ax = [], bad = [];
  let prev = null;
  for (let i = 0; i < cl.length; i++) {
    const r = K.inverse(m, cl[i].p, cl[i].v, prev);
    ax.push(r.ax);
    if (!r.ok) bad.push({ i, why: r.why });
    if (r.ax) prev = r.ax;
  }
  // eş zamanlı mı: döner eksen bir kesme hareketi içinde değişiyor mu
  const rn = (m.rot || []).map((r) => r.name);
  let simulMoves = 0;
  for (let i = 1; i < cl.length; i++) if (cl[i].k !== 'r' && ax[i] && ax[i - 1] && rn.some((n) => Math.abs(ax[i][n] - ax[i - 1][n]) > 1e-6)) simulMoves++;
  return { S, cl, ax, passes: passes.map((p) => ({ name: p.name, n: p.cl.length, tool: p.tool, opType: p.opType, simul: p.simul })), ops: opsOut, warn, limitViolations: bad, simulMoves, machine: m };
}

// süre ve yol uzunluğu
export function stats5(R, rapid = 5000) {
  let tF = 0, tR = 0, lF = 0, lR = 0;
  for (let i = 1; i < R.cl.length; i++) {
    const a = R.cl[i - 1], b = R.cl[i], d = norm(sub(b.p, a.p));
    if (b.k === 'r') { tR += d / rapid; lR += d; } else { tF += d / (b.f || 100); lF += d; }
  }
  return { minutes: tF + tR, lFeed: lF, lRapid: lR, points: R.cl.length };
}
