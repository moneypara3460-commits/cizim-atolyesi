// Çizim Atölyesi — gelişmiş mühendislik analizleri (fea.js çekirdeğinin üstünde).
// Her analiz için fiziksel model, sayısal yöntem ve varsayımlar ANALYSES içinde yazılıdır; arayüz ve rapor bunu gösterir.
// İç birimler (her yerde): uzunluk mm, kuvvet N, gerilme MPa (N/mm²), moment N·mm, sıcaklık °C, güç W, zaman s,
// yoğunluk g/cm³ (fea.js ile aynı), ısı iletkenliği W/(mm·K), ısı akısı W/mm², taşınım katsayısı W/(mm²·K), özgül ısı J/(kg·K).
// Saf JS, DOM yok: Worker'da ve Node testlerinde (tests/fea2.test.mjs) aynen çalışır.
import * as F from './fea.js?v=20261112t';
import { MATERIALS } from './logic.js?v=20261112t';

const { matGroups, matvec, pcg, buildMG, floating, invert, jacobiEig, dNat } = F._internal;

/* ================= analiz türleri: yöntem ve varsayım kayıtları (genişletilebilir) ================= */
export const ANALYSES = {
  static: {
    name: 'Yapısal statik', supported: true,
    physics: 'Doğrusal elastisite: K u = f. Küçük yer değiştirme ve şekil değiştirme, izotrop doğrusal-elastik malzeme (Hooke), statik yük.',
    method: 'Sonlu elemanlar: düzenli küp (voksel) ağ, 8 düğümlü altı yüzlü eleman, düğüm başına 3 serbestlik (ux, uy, uz), Wilson–Taylor uyumsuz modlar (eğilmede kilitlenme yok), 2×2×2 Gauss. Rijitlik matrisi saklanmaz; eşlenik gradyan + geometrik çok katmanlı (multigrid) ön koşullayıcı. Gerilme: eleman merkezinde σ = D ε; von Mises.',
    outputs: 'Yer değiştirme (mm), von Mises gerilmesi (MPa), gerilme bileşenleri, emniyet katsayısı (akma / von Mises), mesnet tepkileri.',
  },
  modal: {
    name: 'Modal (doğal frekans)', supported: true,
    physics: 'Sönümsüz serbest titreşim: K φ = ω² M φ, f = ω / 2π. Doğrusal elastik, küçük genlik.',
    method: 'Rijitlik: statik analizdeki eleman. Kütle: toplanmış (lumped) — her elemanın kütlesi 8 düğümüne eşit (ρ h³ / 8). Özdeğer: alt uzay yinelemesi (K⁻¹ M ile, çok katmanlı ön koşullu eşlenik gradyan), Rayleigh–Ritz ve Jacobi.',
    outputs: 'Doğal frekanslar (Hz, küçükten büyüğe), mod şekilleri (göreli, birimsiz).',
  },
  thermal: {
    name: 'Termal (kararlı durum)', supported: true,
    physics: 'Isı iletimi: ∇·(k ∇T) + Q = 0. Sabit sıcaklık (Dirichlet), ısı akısı (Neumann), taşınım q = h (T − T∞) (Robin). Işınım yok, k sıcaklıktan bağımsız.',
    method: 'Sonlu elemanlar: aynı küp ağ, 8 düğümlü üç doğrusal eleman, düğüm başına 1 serbestlik (T), 2×2×2 Gauss; yüzey yükleri dörtgen yüz alanına eşit paylaştırılır. Çözüm: Jacobi ön koşullu eşlenik gradyan.',
    outputs: 'Sıcaklık (°C), ısı akısı (W/m²), sınırlardan geçen ısı (W) ve enerji dengesi.',
  },
  thermalT: {
    name: 'Termal (zamana bağlı)', supported: true,
    physics: 'ρ c ∂T/∂t = ∇·(k ∇T) + Q, başlangıç sıcaklığı T₀, sınır koşulları kararlı durumdakiyle aynı.',
    method: 'Uzayda kararlı durumla aynı eleman; ısı kapasitesi toplanmış (ρ c h³ / 8). Zamanda geri Euler (koşulsuz kararlı, 1. mertebe): (C/Δt + K) Tⁿ⁺¹ = C/Δt Tⁿ + f.',
    outputs: 'Seçilen zamanlarda sıcaklık alanı (°C).',
  },
  buckling: {
    name: 'Doğrusal burkulma (özdeğer)', supported: true,
    physics: '(K + λ K_G(σ₀)) φ = 0. σ₀: referans yükte doğrusal statik gerilme. Kritik yük = λ × referans yük. İdeal (kusursuz) geometri, doğrusal elastik malzeme, ön burkulma şekil değişimi ihmal.',
    method: 'K_G: üç doğrusal biçim fonksiyonu türevleri ve eleman merkezi gerilmesiyle 2×2×2 Gauss (her yöne aynı). Özdeğer: alt uzay yinelemesi K⁻¹(−K_G), Rayleigh–Ritz; en küçük pozitif λ.',
    outputs: 'Kritik yük katsayıları λ (birimsiz), burkulma mod şekilleri. UYARI: doğrusal burkulma gerçek taşıma kapasitesi değildir (kusur, plastiklik, büyük şekil değişimi yok); genellikle güvensiz tarafta kalır.',
  },
  nonlinear: {
    name: 'Doğrusal olmayan (plastik / büyük şekil değişimi)', supported: false,
    physics: 'Desteklenmiyor.',
    method: 'Mevcut çözücü doğrusaldır (tek K, tek çözüm). Malzeme doğrusal olmayanlığı (plastiklik) ve geometrik doğrusal olmayanlık (büyük dönme, takip eden yükler) için artımlı-yinelemeli (Newton–Raphson) çözüm, teğet rijitlik ve gerilme güncelleme gerekir; bunlar yok. Arayüz ANALYSES / solve(type) üzerinden eklenebilecek şekilde ayrıldı.',
    outputs: '—',
  },
  contact: {
    name: 'Temas (sürtünmeli / ayrılabilir)', supported: false,
    physics: 'Desteklenmiyor.',
    method: 'Montajdaki parçalar aynı ağda birleştirilir: birbirine değen parçaların ortak düğümleri vardır = TAM YAPIŞIK (bonded) bağlantı. Temas (ayrılma, kayma, sürtünme), cıvata ön yükü ve cıvatalı bağlantı modellenmez. Değmeyen parça mesnetsiz kalır ve analiz durdurulur.',
    outputs: '—',
  },
};
export const BOND_NOTE = ANALYSES.contact.method;

/* ================= birimler ================= */
// ekran değeri = iç değer × k (+ ofset); giriş: iç = (ekran − ofset) / k
const LBF = 4.4482216152605, IN = 25.4;
export const UNIT_SYSTEMS = {
  mm: { name: 'SI — mm, N, MPa', L: ['mm', 1], F: ['N', 1], S: ['MPa', 1], E: ['GPa', 1e-3], M: ['N·mm', 1], P: ['MPa', 1], T: ['°C', 1, 0], q: ['W/m²', 1e6], h: ['W/(m²·K)', 1e6], k: ['W/(m·K)', 1e3], rho: ['g/cm³', 1], W: ['W', 1], Q: ['W/m³', 1e9] },
  m: { name: 'SI — m, N, Pa', L: ['m', 1e-3], F: ['N', 1], S: ['Pa', 1e6], E: ['Pa', 1e6], M: ['N·m', 1e-3], P: ['Pa', 1e6], T: ['K', 1, 273.15], q: ['W/m²', 1e6], h: ['W/(m²·K)', 1e6], k: ['W/(m·K)', 1e3], rho: ['kg/m³', 1000], W: ['W', 1], Q: ['W/m³', 1e9] },
  us: { name: 'ABD — in, lbf, psi', L: ['in', 1 / IN], F: ['lbf', 1 / LBF], S: ['psi', IN * IN / LBF], E: ['ksi', IN * IN / LBF / 1000], M: ['lbf·in', 1 / (LBF * IN)], P: ['psi', IN * IN / LBF], T: ['°F', 1.8, 32], q: ['BTU/(h·ft²)', 1e6 * 0.316998331], h: ['BTU/(h·ft²·°F)', 1e6 * 0.176110184], k: ['BTU/(h·ft·°F)', 1e3 * 0.577789317], rho: ['lb/in³', 0.0361272920], W: ['W', 1], Q: ['W/m³', 1e9] },
};
export function toDisp(sys, q, v) { const u = UNIT_SYSTEMS[sys][q]; return v * u[1] + (u[2] || 0); }
export function fromDisp(sys, q, v) { const u = UNIT_SYSTEMS[sys][q]; return (v - (u[2] || 0)) / u[1]; }
// sıcaklık farkı (ΔT): ofset yok
export const dTtoDisp = (sys, v) => v * UNIT_SYSTEMS[sys].T[1];
export const unitOf = (sys, q) => UNIT_SYSTEMS[sys][q][0];

/* ================= malzeme kütüphanesi ================= */
// Isıl özellikler ve kaynakları. "standart": yayımlanmış standarttaki formül/değer; "tipik": el kitabı / üretici veri sayfası
// tipik değeri — belirli bir parti için doğrulanmış değildir. Ahşap yönlüdür; burada izotrop kabul (yaklaşık).
const THERM = {
  celik: { k: 53.3, cp: 440, src: 'EN 1993-1-2 §3.4: λa = 54 − 0,0333·θ, ca(20 °C) ≈ 440', st: 'standart' },
  paslanmaz: { k: 16.2, cp: 500, src: '304 paslanmaz tipik veri sayfası değeri', st: 'tipik' },
  aluminyum: { k: 138, cp: 880, src: '5052-H32 tipik el kitabı değeri', st: 'tipik' },
  al6061: { k: 167, cp: 896, src: '6061-T6 tipik el kitabı değeri', st: 'tipik' },
  pirinc: { k: 120, cp: 375, src: 'C26000 pirinç tipik değeri', st: 'tipik' },
  bakir: { k: 388, cp: 385, src: 'C11000 bakır tipik değeri', st: 'tipik' },
  titanyum: { k: 16.4, cp: 523, src: 'Ti Grade 2 tipik değeri', st: 'tipik' },
  pla: { k: 0.13, cp: 1800, src: 'PLA literatür aralığı 0,13–0,20 W/mK (alt değer)', st: 'tipik' },
  abs: { k: 0.17, cp: 1400, src: 'ABS literatür tipik değeri', st: 'tipik' },
  petg: { k: 0.20, cp: 1200, src: 'PETG üretici veri sayfası aralığı', st: 'tipik' },
  naylon: { k: 0.25, cp: 1700, src: 'PA6 kuru, tipik değer', st: 'tipik' },
  cam: { k: 0.12, cp: 1600, src: 'çam, liflere dik tipik değer (yönlü malzeme)', st: 'tipik' },
  ahsap: { k: 0.17, cp: 1700, src: 'meşe, liflere dik tipik değer (yönlü malzeme)', st: 'tipik' },
  kayin: { k: 0.16, cp: 1700, src: 'kayın, liflere dik tipik değer (yönlü malzeme)', st: 'tipik' },
  kontrplak: { k: 0.13, cp: 1600, src: 'kontrplak tipik değer', st: 'tipik' },
  mdf: { k: 0.12, cp: 1700, src: 'MDF tipik değer', st: 'tipik' },
};
const MECH_SRC = 'uygulama malzeme kütüphanesi (tipik oda sıcaklığı değeri; E ve akma logic.js, ν / α / Su fea.js)';
// birimler: E GPa, nu –, sy/su MPa, rho g/cm³, alpha 1/K, k W/(m·K), cp J/(kg·K)
export const PROP_DEFS = [['E', 'Elastisite modülü', 'GPa'], ['nu', 'Poisson oranı', '–'], ['sy', 'Akma dayanımı', 'MPa'], ['su', 'Çekme dayanımı', 'MPa'], ['rho', 'Yoğunluk', 'g/cm³'], ['alpha', 'Isıl genleşme', '1/K'], ['k', 'Isı iletkenliği', 'W/(m·K)'], ['cp', 'Özgül ısı', 'J/(kg·K)']];
export function libraryMaterials() {
  return MATERIALS.map((m) => {
    const mp = F.MATPROPS[m.id] || {}, th = THERM[m.id] || {};
    const P = (v, src, st) => (v == null || !Number.isFinite(+v) ? null : { v: +v, src, st });
    return {
      id: m.id, name: m.name, kind: m.kind, custom: false, aniso: !!mp.aniso,
      props: {
        E: P(m.E, MECH_SRC, 'tipik'), nu: P(mp.nu, MECH_SRC, 'tipik'), sy: P(m.sy, MECH_SRC, 'tipik'), su: P(mp.su, MECH_SRC, 'tipik'),
        rho: P(m.rho, MECH_SRC, 'tipik'), alpha: P(mp.alpha, MECH_SRC, 'tipik'), k: P(th.k, th.src, th.st), cp: P(th.cp, th.src, th.st),
      },
    };
  });
}
// kullanıcı malzemesi: değerler kullanıcı girişidir, doğrulanmamıştır
export function customMaterial(id, name, vals) {
  const props = {};
  for (const [k] of PROP_DEFS) { const v = vals[k]; props[k] = v === '' || v == null || !Number.isFinite(+v) ? null : { v: +v, src: 'kullanıcı girişi', st: 'kullanıcı' }; }
  return { id, name, kind: 'custom', custom: true, aniso: false, props };
}
export function validateMaterial(m) {
  const e = [], p = m.props, v = (k) => (p[k] ? p[k].v : null);
  if (v('E') != null && !(v('E') > 0)) e.push('E > 0 olmalı');
  if (v('nu') != null && !(v('nu') > -1 && v('nu') < 0.5)) e.push('Poisson oranı −1 ile 0,5 arasında olmalı (0,5 sıkıştırılamaz, çözülemez)');
  for (const k of ['sy', 'su', 'rho', 'k', 'cp']) if (v(k) != null && !(v(k) > 0)) e.push(k + ' > 0 olmalı');
  return e;
}
// analiz türüne göre gerekli özellikler
export const REQUIRED = { static: ['E', 'nu'], modal: ['E', 'nu', 'rho'], buckling: ['E', 'nu'], thermal: ['k'], thermalT: ['k', 'rho', 'cp'], gravity: ['rho'], fos: ['sy'], thermalStrain: ['alpha'] };
export function missingProps(m, list) { return list.filter((k) => !m.props[k] || !Number.isFinite(m.props[k].v)); }
// çözücü biçimi (fea.js matProps ile aynı alanlar + ısıl)
export function solverMat(m) {
  const v = (k) => (m.props[k] ? m.props[k].v : NaN);
  return { id: m.id, name: m.name, E: v('E') * 1000, nu: v('nu'), sy: v('sy'), su: v('su'), rho: v('rho'), alpha: v('alpha'), kmm: v('k') / 1000, cp: v('cp') };
}

/* ================= ağ (mesh) bilgisi ve kalite uyarıları ================= */
export const DENSITY = { kaba: [3000, 'Kaba (~3 000 eleman)'], orta: [10000, 'Orta (~10 000)'], ince: [30000, 'İnce (~30 000)'], cokince: [80000, 'Çok ince (~80 000)'] };
export function meshInfo(grid, fe) {
  const { nx, ny, nz, mat } = grid, warn = [];
  const filled = (i, j, k) => i >= 0 && j >= 0 && k >= 0 && i < nx && j < ny && k < nz && mat[i + nx * (j + ny * k)] >= 0;
  let thin = 0, surf = 0;
  for (let e = 0; e < fe.ne; e++) {
    const c = fe.elCell[e], i = c % nx, j = ((c - i) / nx) % ny, k = Math.floor(c / (nx * ny));
    const ex = [!filled(i - 1, j, k), !filled(i + 1, j, k), !filled(i, j - 1, k), !filled(i, j + 1, k), !filled(i, j, k - 1), !filled(i, j, k + 1)];
    if (ex.some(Boolean)) surf++;
    if ((ex[0] && ex[1]) || (ex[2] && ex[3]) || (ex[4] && ex[5])) thin++;
  }
  const thinPct = fe.ne ? thin / fe.ne * 100 : 0, surfPct = fe.ne ? surf / fe.ne * 100 : 0;
  if (!fe.ne) warn.push({ sev: 'crit', t: 'Ağ oluşturulamadı: model hiç eleman içermiyor.' });
  for (const p of grid.parts) if (p.poor) warn.push({ sev: 'crit', t: `"${p.name || p.id}" bu ağda iyi temsil edilmiyor (${p.cells} eleman, hacim hatası %${(p.err * 100).toFixed(1)}). Ağı incelt.` });
  if (thinPct > 10) warn.push({ sev: 'warn', t: `Elemanların %${thinPct.toFixed(0)}'i bir eleman kalınlığında (ince kesit): eğilme ve gerilme hatalı olabilir. Kalınlıkta en az 2–3 eleman için ağı incelt.` });
  if (surfPct > 80 && fe.ne > 0) warn.push({ sev: 'warn', t: `Elemanların %${surfPct.toFixed(0)}'i yüzeyde: ağ kaba, sonuçlar ağa duyarlı olabilir.` });
  if (fe.ne > 150000) warn.push({ sev: 'warn', t: 'Çok büyük ağ: telefonda çözüm uzun sürebilir.' });
  return {
    h: grid.h, ne: fe.ne, nn: fe.nn, dof3: fe.nn * 3, parts: grid.parts.map((p) => ({ name: p.name || p.id, cells: p.cells, err: p.err, poor: p.poor })),
    shape: 'Küp eleman: en-boy oranı 1, Jacobian sabit (ideal). Eğri yüzeyler basamaklı temsil edilir: yüzeydeki gerilmeler ve yüzey alanı yaklaşık.',
    thinPct, surfPct, warn,
  };
}

/* ================= yüzey yükleri: basınç, ısı akısı, taşınım; moment ================= */
// seçimdeki yüzey dörtgenleri (4 düğümü de seçimde ve yüz seçiminde normali o yöne bakan)
export function selQuads(fe, quads, sel) {
  const ns = new Set(F.selectNodes(fe, sel)), Q = quads.quads, out = [];
  const want = sel.face ? (() => { const n = [0, 0, 0]; n['xyz'.indexOf(sel.face[1])] = sel.face[0] === '-' ? -1 : 1; return n; })() : null;
  for (let q = 0; q < Q.length / 4; q++) {
    const a = Q[q * 4], b = Q[q * 4 + 1], c = Q[q * 4 + 2], d = Q[q * 4 + 3];
    if (!(ns.has(a) && ns.has(b) && ns.has(c) && ns.has(d))) continue;
    const P = (n) => [fe.xyz[n * 3], fe.xyz[n * 3 + 1], fe.xyz[n * 3 + 2]], A = P(a), B = P(b), C = P(c);
    const u = [B[0] - A[0], B[1] - A[1], B[2] - A[2]], v = [C[0] - A[0], C[1] - A[1], C[2] - A[2]];
    const nrm = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]], L = Math.hypot(...nrm) || 1;
    const n = nrm.map((x) => x / L);
    if (want && n[0] * want[0] + n[1] * want[1] + n[2] * want[2] < 0.99) continue;
    out.push({ nodes: [a, b, c, d], n, area: fe.h * fe.h });
  }
  return out;
}
// basınç p (MPa, pozitif = yüzeye doğru bastırır) → düğüm kuvvetleri
export function pressureNodal(fe, quads, sel, p) {
  const qs = selQuads(fe, quads, sel), out = [];
  for (const q of qs) for (const n of q.nodes) out.push({ n, f: q.n.map((x) => -p * q.area / 4 * x) });
  return { nodal: out, area: qs.length * fe.h * fe.h };
}
// moment M = [Mx, My, Mz] (N·mm), seçili düğümlerin ağırlık merkezi etrafında: en küçük normlu düğüm kuvvetleri
// fᵢ = μ × rᵢ, J μ = M, J = Σ(|r|² I − r rᵀ)  →  Σ fᵢ = 0 ve Σ rᵢ × fᵢ = M tam sağlanır
export function momentNodal(fe, sel, M) {
  const ns = F.selectNodes(fe, sel);
  if (ns.length < 3) throw new Error('Moment için seçimde en az 3 düğüm gerekir');
  const c = [0, 0, 0]; for (const n of ns) for (let k = 0; k < 3; k++) c[k] += fe.xyz[n * 3 + k] / ns.length;
  const J = new Float64Array(9);
  const R = ns.map((n) => [fe.xyz[n * 3] - c[0], fe.xyz[n * 3 + 1] - c[1], fe.xyz[n * 3 + 2] - c[2]]);
  for (const r of R) { const r2 = r[0] * r[0] + r[1] * r[1] + r[2] * r[2]; for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) J[i * 3 + j] += (i === j ? r2 : 0) - r[i] * r[j]; }
  const det = J[0] * (J[4] * J[8] - J[5] * J[7]) - J[1] * (J[3] * J[8] - J[5] * J[6]) + J[2] * (J[3] * J[7] - J[4] * J[6]);
  if (Math.abs(det) < 1e-12 * Math.pow(J[0] + J[4] + J[8], 3)) throw new Error('Seçili düğümler bir doğru üzerinde: bu eksende moment aktarılamaz');
  const Ji = invert(J, 3), mu = [0, 1, 2].map((i) => Ji[i * 3] * M[0] + Ji[i * 3 + 1] * M[1] + Ji[i * 3 + 2] * M[2]);
  return { nodal: ns.map((n, i) => ({ n, f: [mu[1] * R[i][2] - mu[2] * R[i][1], mu[2] * R[i][0] - mu[0] * R[i][2], mu[0] * R[i][1] - mu[1] * R[i][0]] })), center: c };
}

/* ================= yapısal statik ================= */
// setup: { supports: [sel], loads: [{ type: 'force', sel, F (N), dir } | { type: 'pressure', sel, p (MPa) } | { type: 'moment', sel, M: [x,y,z] (N·mm) }], gravity, dT }
export function solveStatic2(fe, quads, mats, setup, opt = {}) {
  const nodal = [], loads = [];
  for (const L of setup.loads || []) {
    if (!L.type || L.type === 'force') { if (!(L.F > 0)) throw new Error('Kuvvet büyüklüğü > 0 olmalı (yönü "dir" verir)'); loads.push({ sel: L.sel, F: L.F, dir: L.dir }); }
    else if (L.type === 'pressure') { const r = pressureNodal(fe, quads, L.sel, L.p); if (!r.nodal.length) throw new Error('Basınç yüzeyi bulunamadı (seçimde dış yüzey yok)'); nodal.push(...r.nodal); }
    else if (L.type === 'moment') nodal.push(...momentNodal(fe, L.sel, L.M).nodal);
    else throw new Error('Bilinmeyen yük türü: ' + L.type);
  }
  if (!loads.length && !nodal.length && !setup.gravity && !setup.dT) return { error: 'noload', text: 'Yük tanımlı değil: en az bir kuvvet, basınç, moment, öz ağırlık ya da sıcaklık farkı gerekir.' };
  const r = F.solveStatic(fe, mats, { supports: setup.supports || [], loads, nodal, gravity: !!setup.gravity, dT: setup.dT || 0 }, opt);
  if (r.error) return r;
  if (!r.converged) return { error: 'noconv', text: 'Çözücü yakınsamadı (kalan hata ' + (r.res || 0).toExponential(1) + '). Sonuç gösterilmiyor: ağı değiştir ya da mesnetleri kontrol et.' };
  // denge: tepki + uygulanan ≈ 0
  // ölçek: yüklerin mutlak toplamı (momentte net kuvvet sıfırdır, ona bölünmez)
  let absF = loads.reduce((a, L) => a + L.F, 0) + nodal.reduce((a, q) => a + Math.hypot(...q.f), 0) + (r.weightN || 0);
  if (setup.dT) for (let i = 0; i < r.reaction.length; i++) absF += Math.abs(r.reaction[i]);
  const app = r.applied, eq = Math.hypot(r.reaction[0] + app[0], r.reaction[1] + app[1], r.reaction[2] + app[2]) / (absF || 1);
  r.equilibriumErr = eq;
  return r;
}
// emniyet katsayısı ve tekillik (mesnet / yük noktası komşuluğu hariç en büyük gerilme)
export function stressSummary(fe, r, mats) {
  const bc = new Set([...r.supN, ...r.loadN]), near = new Uint8Array(fe.ne);
  for (let e = 0; e < fe.ne; e++) for (let a = 0; a < 8; a++) if (bc.has(fe.elN[e * 8 + a])) { near[e] = 1; break; }
  let vmax = 0, eMax = -1, vEx = 0, eEx = -1;
  for (let e = 0; e < fe.ne; e++) { const v = r.vm[e]; if (v > vmax) { vmax = v; eMax = e; } if (!near[e] && v > vEx) { vEx = v; eEx = e; } }
  const p995 = F.percentile(r.vm, 0.995);
  const hasSy = mats.every((m) => m.sy > 0);
  const fos = hasSy && eEx >= 0 && vEx > 0 ? mats[fe.elMat[eEx]].sy / vEx : null;
  const fosMin = hasSy && vmax > 0 ? Math.min(...mats.map((m, i) => { let mv = 0; for (let e = 0; e < fe.ne; e++) if (fe.elMat[e] === i && r.vm[e] > mv) mv = r.vm[e]; return mv > 0 ? m.sy / mv : Infinity; })) : null;
  const warn = [];
  if (eMax >= 0 && near[eMax] && vmax > 1.02 * (vEx || 1e-30)) warn.push({ sev: 'warn', t: 'En yüksek gerilme (' + vmax.toFixed(1) + ' MPa) mesnet / yük uygulama noktasına bitişik elemanda: tekil (ağ inceldikçe büyüyen, gerçekte olmayan) gerilme olabilir. Emniyet katsayısı bu elemanlar hariç (' + vEx.toFixed(1) + ' MPa) verilir; ağ yakınsama çalışmasıyla kontrol et.' });
  if (hasSy && fosMin != null && fosMin < 1) warn.push({ sev: 'crit', t: 'Gerilme akma dayanımını aşıyor: doğrusal-elastik varsayım bu bölgede geçersiz (plastik şekil değişimi). Gerçek davranış için doğrusal olmayan analiz gerekir (desteklenmiyor).' });
  if (!hasSy) warn.push({ sev: 'warn', t: 'Akma dayanımı eksik malzeme var: emniyet katsayısı hesaplanmadı.' });
  return { vmax, eMax, vEx, eEx, p995, fos, fosAll: fosMin, warn };
}

/* ================= termal (kararlı / geçici) ================= */
let KT_UNIT = null;
// birim küp, k = 1: 8×8 iletim matrisi (2×2×2 Gauss)
export function conductionUnit() {
  if (KT_UNIT) return KT_UNIT;
  const K = new Float64Array(64), g = 1 / Math.sqrt(3);
  for (const s0 of [-g, g]) for (const s1 of [-g, g]) for (const s2 of [-g, g]) {
    const d = []; for (let a = 0; a < 8; a++) d.push(dNat(a, [s0, s1, s2]).map((v) => v * 2));   // ∂N/∂x (birim küp)
    for (let a = 0; a < 8; a++) for (let b = 0; b < 8; b++) K[a * 8 + b] += (d[a][0] * d[b][0] + d[a][1] * d[b][1] + d[a][2] * d[b][2]) / 8;
  }
  return (KT_UNIT = K);
}
function pcgScalar(apply, diag, b, fixed, x, tol = 1e-9, maxIt = 50000) {
  const n = b.length, r = new Float64Array(n), z = new Float64Array(n), p = new Float64Array(n), q = new Float64Array(n);
  apply(x, q);
  let bn = 0; for (let i = 0; i < n; i++) { r[i] = fixed[i] ? 0 : b[i] - q[i]; if (!fixed[i]) bn += b[i] * b[i]; }
  bn = Math.sqrt(bn); if (!(bn > 0)) { let rr = 0; for (let i = 0; i < n; i++) rr += r[i] * r[i]; bn = Math.sqrt(rr) || 1; }
  for (let i = 0; i < n; i++) z[i] = fixed[i] ? 0 : r[i] / diag[i];
  let rz = 0; for (let i = 0; i < n; i++) { p[i] = z[i]; rz += r[i] * z[i]; }
  let it = 0, res = 1;
  for (; it < maxIt; it++) {
    let rr = 0; for (let i = 0; i < n; i++) rr += r[i] * r[i];
    res = Math.sqrt(rr) / bn; if (res < tol) break;
    apply(p, q); let pq = 0; for (let i = 0; i < n; i++) { if (fixed[i]) q[i] = 0; pq += p[i] * q[i]; }
    if (!(pq > 0)) { res = Infinity; break; }
    const al = rz / pq; for (let i = 0; i < n; i++) { x[i] += al * p[i]; r[i] -= al * q[i]; }
    let rz2 = 0; for (let i = 0; i < n; i++) { z[i] = fixed[i] ? 0 : r[i] / diag[i]; rz2 += r[i] * z[i]; }
    const be = rz2 / rz; rz = rz2; for (let i = 0; i < n; i++) p[i] = z[i] + be * p[i];
  }
  return { iters: it, res, converged: res < tol * 10 };
}
// ts: { fixed: [{ sel, T }], flux: [{ sel, q (W/mm², pozitif = parçaya giren) }], conv: [{ sel, h (W/mm²K), Tinf }], Q (W/mm³, tüm hacim),
//       transient: { T0, dt (s), steps, save (her kaç adımda bir) } }
export function solveThermal(fe, quads, mats, ts, opt = {}) {
  const nn = fe.nn, KT = conductionUnit(), h = fe.h;
  for (const m of mats) if (!(m.kmm > 0)) return { error: 'mat', text: 'Isı iletkenliği eksik malzeme: ' + m.name };
  const fixed = new Uint8Array(nn), Tfix = new Float64Array(nn), f = new Float64Array(nn), Hd = new Float64Array(nn);
  let nFix = 0, convArea = 0, fluxIn = 0;
  for (const c of ts.fixed || []) for (const n of F.selectNodes(fe, c.sel)) { fixed[n] = 1; Tfix[n] = c.T; nFix++; }
  for (const q of ts.flux || []) { const qs = selQuads(fe, quads, q.sel); if (!qs.length) return { error: 'sel', text: 'Isı akısı yüzeyi bulunamadı' }; for (const s of qs) for (const n of s.nodes) f[n] += q.q * s.area / 4; fluxIn += q.q * qs.length * h * h; }
  for (const c of ts.conv || []) { const qs = selQuads(fe, quads, c.sel); if (!qs.length) return { error: 'sel', text: 'Taşınım yüzeyi bulunamadı' }; for (const s of qs) for (const n of s.nodes) { Hd[n] += c.h * s.area / 4; f[n] += c.h * s.area / 4 * c.Tinf; } convArea += qs.length * h * h; }
  if (ts.Q) for (let e = 0; e < fe.ne; e++) for (let a = 0; a < 8; a++) f[fe.elN[e * 8 + a]] += ts.Q * h * h * h / 8;
  const tr = ts.transient;
  if (!tr && !nFix && !convArea) return { error: 'nobc', text: 'Kararlı durum için en az bir sabit sıcaklık ya da taşınım sınırı gerekir (yoksa sıcaklık belirsizdir).' };
  if (!tr) {   // her bağımsız bölgenin bir sıcaklık sınırı olmalı
    const anchor = new Uint8Array(nn); for (let n = 0; n < nn; n++) if (fixed[n] || Hd[n] > 0) anchor[n] = 1;
    const fl = floating(fe, anchor); if (fl.count) return { error: 'floating', text: fl.count + ' bölgenin hiçbir sıcaklık / taşınım sınırı yok: kararlı durum sıcaklığı belirsiz.' };
  }
  const kE = new Float64Array(fe.ne); for (let e = 0; e < fe.ne; e++) kE[e] = mats[fe.elMat[e]].kmm * h;
  const Cn = new Float64Array(nn);
  if (tr) {
    for (const m of mats) if (!(m.rho > 0 && m.cp > 0)) return { error: 'mat', text: 'Zamana bağlı analiz için yoğunluk ve özgül ısı gerekir: ' + m.name };
    for (let e = 0; e < fe.ne; e++) { const m = mats[fe.elMat[e]], c = m.rho * 1e-6 * m.cp * h * h * h / 8; for (let a = 0; a < 8; a++) Cn[fe.elN[e * 8 + a]] += c; }   // J/K
  }
  const cdt = tr ? 1 / tr.dt : 0;
  const apply = (x, y) => {
    y.fill(0);
    for (let e = 0; e < fe.ne; e++) {
      const b = e * 8, s = kE[e];
      for (let i = 0; i < 8; i++) { let t = 0; for (let j = 0; j < 8; j++) t += KT[i * 8 + j] * x[fe.elN[b + j]]; y[fe.elN[b + i]] += t * s; }
    }
    for (let n = 0; n < nn; n++) y[n] += (Hd[n] + Cn[n] * cdt) * x[n];
  };
  const diag = new Float64Array(nn);
  for (let e = 0; e < fe.ne; e++) for (let i = 0; i < 8; i++) diag[fe.elN[e * 8 + i]] += KT[i * 9] * kE[e];
  for (let n = 0; n < nn; n++) diag[n] += Hd[n] + Cn[n] * cdt;
  // Dirichlet: T = Tfix; serbest denklemler b − K·Tfix
  const solve = (rhs, x0) => {
    const x = Float64Array.from(x0); for (let n = 0; n < nn; n++) if (fixed[n]) x[n] = Tfix[n];
    const Kx = new Float64Array(nn), xb = new Float64Array(nn); for (let n = 0; n < nn; n++) xb[n] = fixed[n] ? Tfix[n] : 0;
    apply(xb, Kx); const b = new Float64Array(nn); for (let n = 0; n < nn; n++) b[n] = fixed[n] ? 0 : rhs[n] - Kx[n];
    const y = new Float64Array(nn); for (let n = 0; n < nn; n++) y[n] = fixed[n] ? 0 : x[n];
    const st = pcgScalar(apply, diag, b, fixed, y, opt.tol || 1e-10);
    for (let n = 0; n < nn; n++) x[n] = fixed[n] ? Tfix[n] : y[n];
    return { x, st };
  };
  const flux = (T) => {   // eleman merkezinde q = −k ∇T (W/mm²)
    const q = new Float32Array(fe.ne * 3), d0 = []; for (let a = 0; a < 8; a++) d0.push(dNat(a, [0, 0, 0]).map((v) => v * 2 / h));
    for (let e = 0; e < fe.ne; e++) { const k = mats[fe.elMat[e]].kmm; for (let c = 0; c < 3; c++) { let g = 0; for (let a = 0; a < 8; a++) g += d0[a][c] * T[fe.elN[e * 8 + a]]; q[e * 3 + c] = -k * g; } }
    return q;
  };
  if (!tr) {
    const { x, st } = solve(f, new Float64Array(nn).fill(nFix ? Tfix.reduce((a, b) => a + b, 0) / Math.max(1, nFix) : 0));
    if (!st.converged) return { error: 'noconv', text: 'Termal çözüm yakınsamadı (kalan hata ' + st.res.toExponential(1) + ').' };
    // sınırlardan parçaya giren ısı (W): sabit sıcaklık düğümlerinde r = K T − f, taşınımda h A (T∞ − T); enerji dengesi
    const KTx = new Float64Array(nn); apply(x, KTx);
    let qFix = 0, qFixIn = 0; for (let n = 0; n < nn; n++) if (fixed[n]) { const r = KTx[n] - f[n]; qFix += r; if (r > 0) qFixIn += r; }
    let qc = 0; for (const c of ts.conv || []) for (const s of selQuads(fe, quads, c.sel)) for (const n of s.nodes) qc += c.h * s.area / 4 * (c.Tinf - x[n]);
    const qGen = (ts.Q || 0) * fe.ne * h * h * h;
    const flows = [qFix, qc, fluxIn, qGen], inflow = flows.filter((v) => v > 0).reduce((a, b) => a + b, 0), outflow = -flows.filter((v) => v < 0).reduce((a, b) => a + b, 0);
    const net = flows.reduce((a, b) => a + b, 0), scale = Math.max(inflow, outflow) || 1;
    let tmin = Infinity, tmax = -Infinity; for (const v of x) { if (v < tmin) tmin = v; if (v > tmax) tmax = v; }
    return { T: Float32Array.from(x), Tfull: x, q: flux(x), tmin, tmax, ...st, heat: { fixed: qFix, fixedIn: qFixIn, conv: qc, flux: fluxIn, gen: qGen, inflow, balanceErr: inflow + outflow > 1e-12 ? Math.abs(net) / scale : 0 } };
  }
  // geçici: geri Euler
  let T = new Float64Array(nn).fill(tr.T0 ?? 20);
  for (let n = 0; n < nn; n++) if (fixed[n]) T[n] = Tfix[n];
  const frames = [{ t: 0, T: Float32Array.from(T) }], save = Math.max(1, tr.save || 1);
  for (let s = 1; s <= tr.steps; s++) {
    const rhs = new Float64Array(nn); for (let n = 0; n < nn; n++) rhs[n] = f[n] + Cn[n] * cdt * T[n];
    const { x, st } = solve(rhs, T);
    if (!st.converged) return { error: 'noconv', text: 'Zaman adımı ' + s + ' yakınsamadı.' };
    T = x;
    if (s % save === 0 || s === tr.steps) frames.push({ t: s * tr.dt, T: Float32Array.from(T) });
    if (opt.onProgress && s % 5 === 0) opt.onProgress(s, s / tr.steps);
  }
  let tmin = Infinity, tmax = -Infinity; for (const fr of frames) for (const v of fr.T) { if (v < tmin) tmin = v; if (v > tmax) tmax = v; }
  return { frames, tmin, tmax, converged: true };
}

/* ================= doğrusal burkulma ================= */
let KG_UNIT = null;
// birim küp: 6 gerilme bileşeni için 8×8 matrisler (xx, yy, zz, xy, yz, zx) — Σ ∂Na/∂xi σij ∂Nb/∂xj
export function geomUnit() {
  if (KG_UNIT) return KG_UNIT;
  const P = [[0, 0], [1, 1], [2, 2], [0, 1], [1, 2], [2, 0]], M = P.map(() => new Float64Array(64)), g = 1 / Math.sqrt(3);
  for (const s0 of [-g, g]) for (const s1 of [-g, g]) for (const s2 of [-g, g]) {
    const d = []; for (let a = 0; a < 8; a++) d.push(dNat(a, [s0, s1, s2]).map((v) => v * 2));
    P.forEach(([i, j], c) => { for (let a = 0; a < 8; a++) for (let b = 0; b < 8; b++) M[c][a * 8 + b] += (i === j ? d[a][i] * d[b][j] : d[a][i] * d[b][j] + d[a][j] * d[b][i]) / 8; });
  }
  return (KG_UNIT = M);
}
// referans yük statik çözümü (r: solveStatic2 sonucu) üzerinden; nm: istenen mod sayısı
export function solveBuckling(fe, mats, setup, r, opt = {}) {
  if (!r || r.error) return { error: 'static', text: 'Burkulma için önce referans yükte statik çözüm gerekir.' };
  const G = matGroups(fe, mats), nd = fe.nn * 3, fixed = new Uint8Array(nd);
  for (const s of setup.supports || []) for (const n of F.selectNodes(fe, s)) fixed[n * 3] = fixed[n * 3 + 1] = fixed[n * 3 + 2] = 1;
  const Mg = geomUnit(), sig = r.sig, h = fe.h, xe = new Float64Array(8);
  const kgApply = (x, y) => {   // y = K_G x
    y.fill(0);
    for (let e = 0; e < fe.ne; e++) {
      const s = sig.subarray ? sig.subarray(e * 6, e * 6 + 6) : sig.slice(e * 6, e * 6 + 6), b = e * 8;
      for (let d = 0; d < 3; d++) {
        for (let a = 0; a < 8; a++) xe[a] = x[fe.elN[b + a] * 3 + d];
        for (let i = 0; i < 8; i++) { let t = 0; for (let c = 0; c < 6; c++) { if (!s[c]) continue; const Mc = Mg[c]; let u = 0; for (let j = 0; j < 8; j++) u += Mc[i * 8 + j] * xe[j]; t += s[c] * u; } y[fe.elN[b + i] * 3 + d] += t * h; }
      }
    }
    for (let i = 0; i < nd; i++) if (fixed[i]) y[i] = 0;
  };
  const want = opt.modes || 3, p = Math.min(want + 4, 12);
  let mg = null; if (opt.mg !== false && fe.ne > 800) { try { mg = buildMG(fe, G, fixed); } catch (e) { mg = null; } }
  // başlangıç vektörleri: referans yer değiştirme + düzgün kaymalar + düşük frekanslı sinüsler
  const bb = [[Infinity, -Infinity], [Infinity, -Infinity], [Infinity, -Infinity]];
  for (let n = 0; n < fe.nn; n++) for (let k = 0; k < 3; k++) { bb[k][0] = Math.min(bb[k][0], fe.xyz[n * 3 + k]); bb[k][1] = Math.max(bb[k][1], fe.xyz[n * 3 + k]); }
  let X = Array.from({ length: p }, (_, j) => {
    const v = new Float64Array(nd);
    for (let n = 0; n < fe.nn; n++) for (let k = 0; k < 3; k++) {
      const t = (fe.xyz[n * 3 + (j + 1) % 3] - bb[(j + 1) % 3][0]) / ((bb[(j + 1) % 3][1] - bb[(j + 1) % 3][0]) || 1);
      v[n * 3 + k] = j === 0 ? r.uFull[n * 3 + k] : (k === j % 3 ? Math.sin((1 + (j / 3 | 0)) * Math.PI * t / 2) : 0.05 * Math.sin(n * 0.37 + j + k));
    }
    for (let i = 0; i < nd; i++) if (fixed[i]) v[i] = 0;
    return v;
  });
  const Kx = new Float64Array(nd);
  let lam = null, conv = false, it = 0, iters = 0;
  for (; it < (opt.maxIter || 30); it++) {
    const Z = [], Y = [];
    for (let j = 0; j < p; j++) {
      const y = new Float64Array(nd); kgApply(X[j], y); for (let i = 0; i < nd; i++) y[i] = -y[i];   // −K_G x
      const z = new Float64Array(nd); const st = pcg(fe, G, y, fixed, z, { tol: opt.tol || 1e-6, mg }); iters += st.iters;
      Z.push(z); Y.push(y);
    }
    // Rayleigh–Ritz: Kr = Zᵀ K Z = Zᵀ Y ; Gr = Zᵀ (−K_G) Z ;  Gr q = μ Kr q ,  λ = 1/μ
    const Kr = new Float64Array(p * p), Gr = new Float64Array(p * p), gz = new Float64Array(nd);
    for (let a = 0; a < p; a++) { kgApply(Z[a], gz); for (let b = 0; b < p; b++) { let k = 0, g = 0; for (let i = 0; i < nd; i++) { k += Z[b][i] * Y[a][i]; g -= Z[b][i] * gz[i]; } Kr[a * p + b] = k; Gr[a * p + b] = g; } }
    for (let a = 0; a < p; a++) for (let b = a + 1; b < p; b++) { const k = (Kr[a * p + b] + Kr[b * p + a]) / 2, g = (Gr[a * p + b] + Gr[b * p + a]) / 2; Kr[a * p + b] = Kr[b * p + a] = k; Gr[a * p + b] = Gr[b * p + a] = g; }
    const L = new Float64Array(p * p);
    for (let i = 0; i < p; i++) for (let j = 0; j <= i; j++) { let s = Kr[i * p + j]; for (let k = 0; k < j; k++) s -= L[i * p + k] * L[j * p + k]; L[i * p + j] = i === j ? Math.sqrt(Math.max(s, 1e-300)) : s / L[j * p + j]; }
    const Li = invert(L, p), C = new Float64Array(p * p);
    for (let i = 0; i < p; i++) for (let j = 0; j < p; j++) { let s = 0; for (let a = 0; a < p; a++) for (let b = 0; b < p; b++) s += Li[i * p + a] * Gr[a * p + b] * Li[j * p + b]; C[i * p + j] = s; }
    const { w, V } = jacobiEig(C, p);
    const ord = w.map((v, i) => [v, i]).sort((a, b) => b[0] - a[0]);   // μ büyükten küçüğe = λ küçükten büyüğe (pozitifler)
    const newX = [];
    for (let j = 0; j < p; j++) {
      const q = new Float64Array(p); for (let i = 0; i < p; i++) { let s = 0; for (let k = 0; k < p; k++) s += Li[k * p + i] * V[k * p + ord[j][1]]; q[i] = s; }
      const v = new Float64Array(nd); for (let a = 0; a < p; a++) if (q[a]) for (let i = 0; i < nd; i++) v[i] += Z[a][i] * q[a];
      let mx = 0; for (let i = 0; i < nd; i++) mx = Math.max(mx, Math.abs(v[i])); for (let i = 0; i < nd; i++) v[i] /= mx || 1;
      newX.push(v);
    }
    const nl = ord.map((o) => (o[0] > 0 ? 1 / o[0] : Infinity));
    X = newX;
    if (lam && nl.slice(0, want).every((v, i) => isFinite(v) && Math.abs(v - lam[i]) / Math.abs(v) < 1e-5)) { lam = nl; conv = true; break; }
    lam = nl;
    if (opt.onProgress) opt.onProgress(it, lam[0]);
  }
  void Kx;
  const modes = [];
  for (let j = 0; j < want; j++) { if (!isFinite(lam[j])) continue; modes.push({ lambda: lam[j], phi: Float32Array.from(X[j]) }); }
  if (!modes.length) return { error: 'nobuck', text: 'Pozitif kritik yük katsayısı bulunamadı: bu yük durumu (örn. yalnız çekme) burkulma oluşturmuyor.' };
  if (!conv) return { error: 'noconv', text: 'Burkulma özdeğerleri yakınsamadı (' + it + ' yineleme). Sonuç gösterilmiyor.', modes };
  return { modes, converged: conv, iters };
}

/* ================= ağ yakınsama çalışması ================= */
// runAt(target) → { value } ; hedef eleman sayıları büyüyen sırada. Son iki ağ arasındaki fark < tol → yakınsadı
export function convergence(runAt, targets, tol = 0.03) {
  const rows = [];
  for (const t of targets) { const r = runAt(t); rows.push({ target: t, ...r }); }
  for (let i = 1; i < rows.length; i++) rows[i].change = Math.abs(rows[i].value - rows[i - 1].value) / (Math.abs(rows[i].value) || 1);
  const last = rows[rows.length - 1];
  // değişim inceldikçe küçülmüyorsa (gerilme tekilliği gibi) yakınsamıyor
  const diverging = rows.length > 2 && last.change >= rows[rows.length - 2].change * 0.9 && last.change > tol;
  return { rows, converged: rows.length > 1 && last.change < tol, diverging, tol };
}

/* ================= sonuç kaydı: ayar özeti, giriş özeti (hash), geçersizleşme ================= */
export function hashStr(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36); }
// sonuç ancak aynı geometri + malzeme + kurulum + ağ ayarıyla geçerli
export function inputKey(geoHash, materials, setup, mesh) { return hashStr(JSON.stringify([geoHash, materials, setup, mesh])); }
