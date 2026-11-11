// "🔮 Geleceğimi Göster" — sanal test ortamı arayüzü (Gelecek sekmesi).
// api: { info() → { parts:[{id,name,matId,matName,chosen}], size:[x,y,z], kg }, hash(), items() → [{id,name,tris,matId}], materials,
//        setMat(id, matId), getSim(), setSim(o), draw(spec), enter(), leave(), focus(p, r), render(), toast(m), name(), snapshot(), prices() }
import * as F from './fea.js?v=20261111a';
import { pdfFromJpegs } from './cutopt.js?v=20261111a';
import { toSTLBinary } from './logic.js?v=20261111a';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const nf = (v, d = 1) => (v == null || !isFinite(v) ? '—' : (Math.round(v * 10 ** d) / 10 ** d).toLocaleString('tr-TR', { maximumFractionDigits: d }));
const f0 = (v) => nf(v, 0), f1 = (v) => nf(v, 1), f2 = (v) => nf(v, 2);
const fmm = (v) => (v < 0.01 ? nf(v * 1000, 1) + ' µm' : v < 1 ? nf(v, 3) + ' mm' : nf(v, 2) + ' mm');
const fyr = (y) => (y >= 100 ? '100+ yıl' : y >= 1 ? nf(y, 1) + ' yıl' : y * 12 >= 1 ? nf(y * 12, 1) + ' ay' : nf(y * 365, 1) + ' gün');
const fN = (n) => (n === Infinity ? 'sonsuz (≥ 10⁶)' : n >= 1e9 ? '> 10⁹' : n >= 1e6 ? nf(n / 1e6, 2) + ' milyon' : f0(n));
const RES = { hizli: [5000, 'Hızlı'], normal: [15000, 'Normal'], ince: [45000, 'İnce'] };
const DIRS = { '-y': ['↓ Aşağı (−Y)', [0, -1, 0]], '+y': ['↑ Yukarı (+Y)', [0, 1, 0]], '+x': ['→ Sağa (+X)', [1, 0, 0]], '-x': ['← Sola (−X)', [-1, 0, 0]], '+z': ['⊙ Öne (+Z)', [0, 0, 1]], '-z': ['⊗ Arkaya (−Z)', [0, 0, -1]] };
const FACES = ['-y', '+y', '-x', '+x', '+z', '-z'];
// doğrulama: tests/fea.test.mjs analitik karşılaştırmaları (bu sürümde ölçülen sapmalar)
export const VALIDATION = [
  ['Konsol kiriş uç sehimi (FL³/3EI)', '%0,1'], ['Konsol kiriş eğilme gerilmesi (M·c/I)', '%1,4'], ['Eksenel çubuk (F/A, FL/EA)', '%0–0,8'],
  ['Öz ağırlık sehimi (qL⁴/8EI)', '%0,4'], ['Serbest ısıl uzama (αLΔT)', '%1,2'], ['Konsol 1. doğal frekans', '%0,2'], ['Mesnet tepkisi = uygulanan yük (denge)', '< %0,01'],
];
const TABS = [['setup', '1 Kurulum'], ['str', '2 Dayanım'], ['vib', '3 Titreşim'], ['temp', '4 Sıcaklık'], ['life', '5 Ömür'], ['alt', '6 Geliştir'], ['rep', '7 Rapor']];

export function createSimUI(api) {
  const S = { lab: false, tab: 'setup', busy: null, err: null, grid: null, fe: null, quads: null, mats: null, matIds: null, stat: null, crit: [], vib: null, mode: 0, therm: null, alts: null, altShow: null, view: { what: 'stress', anim: true, cmp: 'after' }, pick: null, form: { F: '1000', unit: 'N', dir: '-y' } };
  const P = () => {
    const d = { approved: null, setup: { supports: [], loads: [], gravity: true, res: 'normal' }, vib: { f: '', zeta: 2 }, temp: { T: '', withLoads: false }, life: { R: -1, cpd: '', surface: 'islenmis', fric: 'yok', slide: '' }, target: 2, saved: [] };
    const o = api.getSim(); if (!o) { api.setSim(d); return d; }
    for (const k of Object.keys(d)) if (o[k] == null) o[k] = d[k];
    return o;
  };
  const save = () => api.setSim(P());

  /* ---------- işçi (Worker) ---------- */
  let W = null, wid = 0; const pend = new Map();
  function inline(cmd, a, prog) { return new Promise((res) => setTimeout(() => { try { res(cmd === 'static' ? F.solveStatic(a.fe, a.mats, a.bc, { onProgress: prog }) : F.solveModal(a.fe, a.mats, a.bc, { onProgress: prog })); } catch (e) { res({ error: 'exc', text: e.message }); } }, 40)); }
  function worker() {
    if (W === false) return null;
    if (W) return W;
    try {
      W = new Worker(new URL('./fea-worker.js?v=20261111a', import.meta.url), { type: 'module' });
      W.onmessage = (ev) => { const m = ev.data, p = pend.get(m.id); if (!p) return; if (m.progress) { p.prog && p.prog(m.progress.it, m.progress.res); return; } pend.delete(m.id); m.error ? p.res({ error: 'exc', text: m.error }) : p.res(m.result); };
      W.onerror = () => { W = false; for (const [id, p] of pend) { pend.delete(id); inline(p.cmd, p.a, p.prog).then(p.res); } };
    } catch (e) { W = false; }
    return W || null;
  }
  function run(cmd, a, prog) {
    const w = worker();
    if (!w) return inline(cmd, a, prog);
    return new Promise((res) => { const id = ++wid; pend.set(id, { res, cmd, a, prog }); w.postMessage({ id, cmd, a }); });
  }
  const feMsg = (fe) => ({ ne: fe.ne, nn: fe.nn, elN: fe.elN, elMat: fe.elMat, elCell: fe.elCell, xyz: fe.xyz, surf: fe.surf, h: fe.h, nx: fe.nx, ny: fe.ny, nz: fe.nz, origin: fe.origin });
  async function busy(text, fn) { S.busy = { text, it: 0 }; S.err = null; api.render(); try { return await fn((it, r) => { S.busy.it = it; const el = document.getElementById('simbusy'); if (el) el.textContent = text + ' · adım ' + it + (isFinite(r) && r < 1 ? ' · kalan hata ' + r.toExponential(1) : ''); }); } finally { S.busy = null; } }

  /* ---------- model hazırlama ---------- */
  function build() {
    const its = api.items().filter((x) => x.tris && x.tris.length >= 9);
    if (!its.length) throw new Error('Görünür katı parça yok');
    const ids = [...new Set(its.map((x) => x.matId))];
    S.matIds = ids; S.mats = ids.map((id) => F.matProps(api.materials.find((m) => m.id === id) || api.materials[0]));
    S.grid = F.voxelize(its.map((x) => ({ id: x.id, name: x.name, tris: x.tris, mat: ids.indexOf(x.matId) })), { target: RES[P().setup.res][0] });
    S.fe = F.buildFE(S.grid); S.quads = F.surfaceQuads(S.fe, S.grid);
    S.stat = null; S.crit = []; S.vib = null; S.therm = null; S.alts = null; S.altShow = null; S.vibFE = null;
  }
  const bcBase = () => { const s = P().setup; return { supports: s.supports.map((x) => x.sel), loads: s.loads.map((L) => ({ sel: L.sel, F: L.N, dir: DIRS[L.dir][1] })) }; };
  const selXYZ = (fe, sel) => F.selectNodes(fe, sel).map((n) => [fe.xyz[n * 3], fe.xyz[n * 3 + 1], fe.xyz[n * 3 + 2]]);
  const size = () => { const g = S.grid; return Math.hypot(g.nx, g.ny, g.nz) * g.h; };

  /* ---------- 3B çizim ---------- */
  function draw() {
    if (!S.lab || !S.fe) return;
    const alt = S.tab === 'alt' && S.altShow != null && S.alts ? S.alts[S.altShow] : null;
    const fe = alt ? alt.fe : S.fe, quads = alt ? alt.quads : S.quads, setup = P().setup;
    const spec = { fe, quads: quads.quads, val: null, vmin: 0, vmax: 1, disp: null, scale: 0, anim: 'none', ghost: false, before: false, sup: [], loads: [], marks: [], unit: '' };
    for (const s of setup.supports) spec.sup.push(...F.selectNodes(fe, s.sel));
    for (const L of setup.loads) { const ps = selXYZ(fe, L.sel); if (!ps.length) continue; const c = [0, 1, 2].map((k) => ps.reduce((a, p) => a + p[k], 0) / ps.length); spec.loads.push({ p: c, dir: DIRS[L.dir][1], label: f0(L.N) + ' N' }); }
    const res = alt ? alt.res : S.tab === 'temp' ? S.therm && S.therm.res : S.tab === 'vib' ? null : S.stat && S.stat.res;
    if (S.tab === 'vib' && S.vib && S.vib.modes && S.vib.modes[S.mode]) {
      const m = S.vib.modes[S.mode], vfe = S.vib.fe;
      spec.fe = vfe; spec.quads = S.vib.quads.quads; spec.sup = []; for (const s of setup.supports) spec.sup.push(...F.selectNodes(vfe, s.sel));
      const nv = F.nodalAvg(vfe, m.vm); spec.val = nv; spec.vmax = F.percentile(nv, 0.99) || 1; spec.disp = m.phi; spec.scale = size() * 0.06; spec.anim = 'osc'; spec.unit = 'göreli'; spec.ghost = true;
    } else if (res && !res.error && S.tab !== 'setup') {
      const nv = S.view.what === 'disp' ? dispMag(fe, res.u) : F.nodalAvg(fe, res.vm);
      spec.val = nv; spec.vmax = S.view.what === 'disp' ? res.maxU : (F.percentile(res.vm, 0.995) || 1); spec.unit = S.view.what === 'disp' ? 'mm' : 'MPa';
      spec.disp = res.u; spec.scale = res.maxU > 0 ? size() * 0.05 / res.maxU : 0; spec.anim = S.view.anim ? 'grow' : 'none';
      spec.before = S.view.cmp === 'before'; spec.ghost = S.view.cmp === 'both';
      const cr = alt ? alt.crit : S.tab === 'temp' ? S.therm.crit : S.crit;
      (cr || []).forEach((r, i) => spec.marks.push({ p: r.at, label: String(i + 1) }));
    }
    S.legend = spec.val ? { vmin: spec.vmin, vmax: spec.vmax, unit: spec.unit } : null;
    S.scaleShown = spec.scale;
    api.draw(spec);
  }
  const dispMag = (fe, u) => { const a = new Float32Array(fe.nn); for (let n = 0; n < fe.nn; n++) a[n] = Math.hypot(u[n * 3], u[n * 3 + 1], u[n * 3 + 2]); return a; };

  /* ---------- testler ---------- */
  async function runStatic() {
    const setup = P().setup, base = bcBase();
    if (!base.supports.length) { S.err = 'Önce en az bir sabitleme (mesnet) seç.'; api.render(); return; }
    if (!base.loads.length && !setup.gravity) { S.err = 'Yük yok: bir yük ekle ya da öz ağırlığı aç.'; api.render(); return; }
    const res = await busy('Dayanım hesaplanıyor (sonlu elemanlar)', (prog) => run('static', { fe: feMsg(S.fe), mats: S.mats, bc: { ...base, gravity: setup.gravity } }, prog));
    if (res.error) { S.err = res.text; S.stat = null; api.render(); return; }
    S.stat = { res, at: Date.now(), gravity: setup.gravity, hasLoads: base.loads.length > 0 };
    S.crit = F.criticalRegions(S.fe, S.grid, S.mats, res.vm, { bcNodes: [...res.supN, ...res.loadN] });
    S.tab = 'str'; S.alts = null; draw(); api.render();
  }
  // tekillik (nokta yük / mesnet kenarı) dışındaki en yüksek gerilme ve güvenlik katsayısı
  function summary(fe, res, mats, grid) {
    const near = new Uint8Array(fe.nn), bcs = [...res.supN, ...res.loadN], h = fe.h;
    const bxyz = bcs.map((n) => [fe.xyz[n * 3], fe.xyz[n * 3 + 1], fe.xyz[n * 3 + 2]]);
    let vmax = 0, vmEx = 0, fos = Infinity, fosEx = Infinity, eMax = -1, eEx = -1;
    const bset = new Set(bcs);
    for (let e = 0; e < fe.ne; e++) {
      const v = res.vm[e], sy = mats[fe.elMat[e]].sy;
      if (v > vmax) { vmax = v; eMax = e; }
      if (sy / v < fos) fos = sy / v;
      let nb = false; for (let a = 0; a < 8 && !nb; a++) if (bset.has(fe.elN[e * 8 + a])) nb = true;
      if (!nb && bxyz.length < 4000) { const c = fe.elN[e * 8]; for (const p of bxyz) if (Math.abs(p[0] - fe.xyz[c * 3]) < 2 * h && Math.abs(p[1] - fe.xyz[c * 3 + 1]) < 2 * h && Math.abs(p[2] - fe.xyz[c * 3 + 2]) < 2 * h) { nb = true; break; } }
      if (!nb) { if (v > vmEx) { vmEx = v; eEx = e; } if (sy / v < fosEx) fosEx = sy / v; }
    }
    if (eEx < 0) { vmEx = vmax; fosEx = fos; }
    const mass = F.gridMass(grid, mats);
    return { vmax, vmEx, fos, fosEx, eEx: eEx < 0 ? eMax : eEx, matEx: fe.elMat[eEx < 0 ? Math.max(eMax, 0) : eEx], mass, maxU: res.maxU, span: Math.max(grid.nx, grid.ny, grid.nz) * grid.h };
  }
  async function runModal() {
    const v = P().vib, base = bcBase();
    if (!base.supports.length) { S.err = 'Titreşim için sabitleme gerekir (Kurulum).'; api.render(); return; }
    // modal analiz kaba ağda (frekans ağ inceliğine az duyarlı; süre için)
    let vfe = S.fe, vq = S.quads, vg = S.grid;
    if (S.fe.ne > 9000) { const its = api.items().filter((x) => x.tris && x.tris.length >= 9); vg = F.voxelize(its.map((x) => ({ id: x.id, tris: x.tris, mat: S.matIds.indexOf(x.matId) })), { target: 8000 }); vfe = F.buildFE(vg); vq = F.surfaceQuads(vfe, vg); }
    const r = await busy('Doğal frekanslar hesaplanıyor', (prog) => run('modal', { fe: feMsg(vfe), mats: S.mats, bc: { supports: base.supports }, modes: 3 }, prog));
    if (r.error) { S.err = r.text; api.render(); return; }
    S.vib = { ...r, fe: vfe, quads: vq, grid: vg, f: +v.f || null }; S.mode = 0; draw(); api.render();
  }
  async function runThermal() {
    const t = P().temp, T = parseFloat(String(t.T).replace(',', '.'));
    if (!isFinite(T)) { S.err = 'Çalışma sıcaklığını gir (°C).'; api.render(); return; }
    const base = bcBase();
    if (!base.supports.length) { S.err = 'Sıcaklık gerilmesi için sabitleme gerekir (Kurulum). Serbest genleşme yine de aşağıda.'; }
    let res = null;
    if (base.supports.length) {
      const bc = t.withLoads ? { ...base, gravity: P().setup.gravity, dT: T - 20 } : { supports: base.supports, loads: [], gravity: false, dT: T - 20 };
      res = await busy('Isıl gerilme hesaplanıyor', (prog) => run('static', { fe: feMsg(S.fe), mats: S.mats, bc }, prog));
      if (res.error) { S.err = res.text; res = null; }
    }
    S.therm = { T, res, crit: res ? F.criticalRegions(S.fe, S.grid, S.mats, res.vm, { bcNodes: res.supN }) : [] };
    draw(); api.render();
  }
  async function runAlts() {
    if (!S.stat) { S.err = 'Önce Dayanım testini çalıştır.'; api.render(); return; }
    const base = F.resolveBC(S.fe, bcBase()), setup = P().setup, target = +P().target || 2, R0 = S.stat.res;
    const lock = [...setup.supports, ...setup.loads].map((x) => x.sel.face).filter(Boolean);
    const s0 = summary(S.fe, R0, S.mats, S.grid);
    const alts = [{ key: 'orig', name: 'Mevcut tasarım', fe: S.fe, quads: S.quads, grid: S.grid, res: R0, sum: s0, crit: S.crit, why: 'Onaylanan tasarım (değiştirilmedi).' }];
    const solve = async (g, label) => { const fe = F.buildFE(g); const res = await busy(label, (prog) => run('static', { fe: feMsg(fe), mats: S.mats, bc: { ...base, gravity: S.stat.gravity } }, prog)); if (res.error) return { fe, error: res.text }; return { fe, res, quads: F.surfaceQuads(fe, g), sum: summary(fe, res, S.mats, g), crit: F.criticalRegions(fe, g, S.mats, res.vm, { bcNodes: [...res.supN, ...res.loadN] }) }; };
    // 1) daha dayanıklı: kritik bölgeyi 2 katman kalınlaştır
    const T = F.thicken(S.grid, S.fe, R0.vm, S.mats, { lock, layers: 2, frac: 0.5 });
    if (T.added) { const r = await solve(T.grid, 'Daha dayanıklı tasarım çözülüyor'); if (!r.error) alts.push({ key: 'strong', name: 'Daha dayanıklı', grid: T.grid, ...r, why: 'Gerilmenin akma sınırının %50 üstüne çıktığı bölgelerin çevresine 2 katman (' + f1(2 * S.grid.h) + ' mm) malzeme eklendi. Neden: eğilmede gerilme kesit kalınlığının karesiyle ters orantılıdır; kritik bölgede kalınlık artışı gerilmeyi doğrudan düşürür.' }); }
    // 2) daha hafif: düşük gerilmeli malzemeyi çıkar (yük yolu korunur)
    for (const frac of [0.25, 0.15, 0.08]) {
      const L = F.lighten(S.grid, S.fe, R0.vm, S.mats, R0.supN, R0.loadN, { frac });
      if (L.broken || !L.removed) continue;
      const r = await solve(L.grid, 'Daha hafif tasarım çözülüyor');
      if (r.error || r.sum.fosEx < Math.min(target, s0.fosEx) * 0.98) continue;
      alts.push({ key: 'light', name: 'Daha hafif', grid: L.grid, ...r, why: 'Gerilmesi en yüksek değerin %' + Math.round(frac * 100) + "'inden az olan (yük taşımaya katkısı küçük) malzeme çıkarıldı; yük ve mesnet bölgeleri korundu, mesnetten kopan parça bırakılmadı. Neden: düşük gerilmeli malzeme kütle ekler ama dayanıma az katkı verir. Sonuç yeniden FEA ile kontrol edildi." });
      break;
    }
    // 3) malzeme: tek malzemeli modelde doğrusal süperpozisyon (kesin; ν farkı ihmal)
    const mats = [];
    if (S.mats.length === 1) {
      const m0 = S.mats[0], prices = api.prices() || {};
      // öz ağırlık payını ayır: G yalnız öz ağırlık, F = toplam − G (doğrusallık)
      let cG = null;
      if (S.stat.gravity) { cG = await busy('Öz ağırlık payı ayrılıyor', (prog) => run('static', { fe: feMsg(S.fe), mats: S.mats, bc: { supports: base.supports, loads: [], gravity: true } }, prog)); if (cG.error) cG = null; }
      const cF = cG ? diff(R0, cG) : R0;
      for (const m of api.materials) {
        const mp = F.matProps(m), sw = F.materialSwap(cF, cG, m0, mp);
        const mass = s0.mass * mp.rho / m0.rho, fos = mp.sy / (sw.vmax * (s0.vmEx / (s0.vmax || 1)) || 1e-9);
        mats.push({ id: m.id, name: m.name, kind: m.kind, mass, vmax: sw.vmax, umax: sw.umax, fos, cost: prices[m.id] > 0 ? mass * prices[m.id] : null, cur: m.id === m0.id, aniso: !!mp.aniso });
      }
    }
    S.alts = alts; S.altMats = mats; S.altShow = null; S.tab = 'alt';
    save(); draw(); api.render();
  }
  const diff = (a, b) => { const u = new Float32Array(a.u.length), sig = new Float32Array(a.sig.length); for (let i = 0; i < u.length; i++) u[i] = a.u[i] - b.u[i]; for (let i = 0; i < sig.length; i++) sig[i] = a.sig[i] - b.sig[i]; return { u, sig, vm: a.vm }; };

  /* ---------- akıllı test asistanı ---------- */
  function advice() {
    const out = [], setup = P().setup, target = +P().target || 2;
    if (!S.stat) return out;
    const s = summary(S.fe, S.stat.res, S.mats, S.grid), pn = (i) => (S.grid.parts[i] ? S.grid.parts[i].name : 'parça');
    const c0 = S.crit[0], m0 = c0 ? S.mats[c0.mat] : S.mats[0];
    if (c0) {
      if (c0.nearBC) out.push({ sev: c0.util > 1 / target ? 'warn' : 'info', t: pn(c0.partIdx) + ' üzerinde, mesnet / yük bölgesinde yüksek gerilme tespit edildi (' + f0(c0.vm) + ' MPa).', why: 'Kuvvet parçaya bu bölgeden girip çıkıyor; kesit burada ani değişiyor. Modelde yük ve mesnet tek yüze / noktaya yayıldığı için tepe değer bir miktar abartılı olabilir (gerilme tekilliği), ama gerçekte de en çok zorlanan yer burasıdır.', fix: 'Bağlantı bölgesinin kalınlığını artırmak, keskin iç köşeye radyüs vermek ya da yükü daha geniş bir alana yaymak (pul, flanş, takviye) çözüm olabilir.' });
      else out.push({ sev: c0.util > 1 / target ? 'warn' : 'info', t: pn(c0.partIdx) + ' içinde en yüksek gerilme bölgesi: ' + f0(c0.vm) + ' MPa (akma sınırına oranı %' + Math.round(c0.util * 100) + ').', why: 'Eğilme momenti ya da kesit daralması bu bölgede en büyük.', fix: 'Bu bölgenin kalınlığını / yüksekliğini artırmak en etkili çözümdür (eğilme gerilmesi kalınlığın karesiyle düşer).' });
    }
    if (s.fosEx < 1) out.push({ sev: 'crit', t: 'Güvenlik katsayısı 1\'in altında (' + f2(s.fosEx) + '): bu yükte malzeme akar, kalıcı şekil değiştirir ya da kırılır.', why: 'Hesaplanan von Mises gerilmesi malzemenin akma dayanımını (' + f0(m0.sy) + ' MPa) aşıyor.', fix: 'Kesiti büyüt, yükü azalt ya da daha dayanıklı malzeme seç (Geliştir sekmesi).' });
    else if (s.fosEx < target) out.push({ sev: 'warn', t: 'Güvenlik katsayısı ' + f2(s.fosEx) + ', hedef ' + f1(target) + "'nin altında.", why: 'Yük, malzeme ve üretim belirsizlikleri için gereken pay yok.', fix: 'Geliştir sekmesindeki "Daha dayanıklı" alternatifi ya da daha yüksek akma dayanımlı malzeme.' });
    else if (s.fosEx > 4 * target) out.push({ sev: 'info', t: 'Tasarım bu yük için çok güçlü (güvenlik katsayısı ' + f1(s.fosEx) + ').', why: 'Gerilme akma sınırının çok altında; malzemenin bir kısmı yük taşımıyor.', fix: 'Geliştir sekmesindeki "Daha hafif" alternatifi ağırlığı ve maliyeti düşürebilir.' });
    const ratio = s.span / (s.maxU || 1e-12);
    if (s.maxU > 0 && ratio < 250) out.push({ sev: 'warn', t: 'Şekil değiştirme büyük: en çok ' + fmm(s.maxU) + ' (boy / sehim = 1/' + f0(ratio) + ').', why: 'Sehim malzemenin elastisite modülü (E) ve kesit atalet momentiyle ters orantılıdır. Taşıyıcı parçalarda genelde L/250–L/500 sınırı kullanılır.', fix: m0.E < 100000 ? m0.name + ' yerine çelik gibi daha rijit bir malzeme düşünülebilir: E ~' + f0(210000 / m0.E) + ' kat büyük → sehim aynı oranda azalır (ağırlık artar).' : 'Kesit yüksekliğini artırmak sehmi en çok azaltır (atalet momenti yüksekliğin küpüyle artar).' });
    if (m0.id === 'aluminyum' || m0.id === 'al6061') out.push({ sev: 'info', t: 'Alüminyumda yorulma sınırı yoktur.', why: 'Çeliğin aksine düşük genlikli tekrarlı yükler de zamanla çatlak oluşturur.', fix: 'Tekrarlı yük varsa Ömür sekmesini çalıştır; gerekirse çelik ya da kesit artışı değerlendirilebilir.' });
    if (S.mats.some((m) => m.creep)) out.push({ sev: 'info', t: 'Plastikte sürünme: sürekli yük altında zamanla şekil değiştirir.', why: 'Buradaki hesap kısa süreli (doğrusal-elastik) davranışı gösterir.', fix: 'Uzun süreli yükte gerilmeyi akma sınırının ~%20–30\'unda tut.' });
    if (S.mats.some((m) => m.aniso)) out.push({ sev: 'info', t: 'Ahşap yönlü (anizotrop) bir malzemedir; hesap izotrop kabulle yapıldı.', why: 'Lif yönüne dik dayanım ve rijitlik çok daha düşüktür.', fix: 'Sonucu yaklaşık kabul et; yükü lif yönünde taşıt.' });
    const poor = S.grid.parts.filter((p) => p.poor);
    if (poor.length) out.push({ sev: 'warn', t: poor.map((p) => p.name).join(', ') + ' bu ağda iyi temsil edilmiyor (hacim farkı ' + poor.map((p) => '%' + Math.round(Math.abs(p.err) * 100)).join(', ') + ').', why: 'Küp eleman boyu ' + f1(S.grid.h) + ' mm; ince sac, ince cidarlı profil ya da küçük parçalar bu boyda doğru modellenemez.', fix: 'Kurulumda "İnce" çözünürlüğü dene. Hâlâ öyleyse bu parçalar için sonuç güvenilir değildir (kabuk / kiriş elemanı gerekir).' });
    if (!S.stat.res.converged) out.push({ sev: 'warn', t: 'Çözücü tam yakınsamadı.', why: 'Model zayıf bağlı olabilir (tek noktadan tutulan parça, ince köprü).', fix: 'Sabitlemeyi genişlet; sonuçları dikkatli yorumla.' });
    return out;
  }

  /* ---------- panel ---------- */
  function html() {
    const p = P();
    let h = '<div class="lbl h">🔮 Geleceğimi Göster — sanal test ortamı</div>';
    if (S.busy) return h + `<div id="simbusy" style="flex:1 0 100%;background:#111a2e;border:1px solid #1e293b;border-radius:12px;padding:14px;font-size:15px">⏳ ${esc(S.busy.text)}…</div>` + note('Hesap arka planda sürüyor; modeli döndürebilirsin.');
    const hs = api.hash(), approved = p.approved && p.approved.hash === hs;
    if (!S.lab) {
      const inf = api.info();
      if (!inf.parts.length) return h + note('Önce bir tasarım çiz. Bu özellik çizim aşamasında değil, tasarım bittikten sonra kullanılır.');
      h += card('<div style="font-size:14px;margin-bottom:6px">Sırayla: <b>1</b> tasarımı tamamla · <b>2</b> ölçüleri belirle · <b>3</b> malzemeleri seç · <b>4</b> tasarımı onayla → sonra <b>GELECEĞİMİ GÖSTER</b> açılır.</div>' +
        row('Genel ölçü (X × Z × Y)', f0(inf.size[0]) + ' × ' + f0(inf.size[2]) + ' × ' + f0(inf.size[1]) + ' mm') + (inf.kg != null ? row('Ağırlık', f2(inf.kg) + ' kg') : '') + row('Parça', inf.parts.length));
      const unset = inf.parts.filter((q) => !q.chosen);
      h += '<div class="lbl h">Malzemeler</div>';
      h += inf.parts.map((q) => `<label class="f" style="flex:1 0 100%"><span>${esc(q.name)}${q.chosen ? '' : ' <b style="color:#fbbf24">· seçilmedi</b>'}</span><select data-sm="mat" data-pid="${q.id}">${q.chosen ? '' : '<option value="" selected>— malzeme seç —</option>'}${api.materials.map((m) => `<option value="${m.id}"${q.chosen && m.id === q.matId ? ' selected' : ''}>${esc(m.name)}</option>`).join('')}</select></label>`).join('');
      if (p.approved && !approved) h += note('<span style="color:#fbbf24">⚠ Tasarım onaydan sonra değişti; yeniden onaylaman gerekiyor.</span>');
      if (!approved) h += unset.length ? note('Onay için her parçanın malzemesini seç (' + unset.length + ' parça eksik).') : btn('✓ Tasarımımı onayla', 'sm-approve', false, 'flex:1 0 100%;font-size:16px;font-weight:700');
      else h += note('✓ Tasarım onaylandı (' + esc(new Date(p.approved.at).toLocaleString('tr-TR')) + ').');
      h += `<button data-act="sm-go"${approved ? '' : ' disabled'} style="flex:1 0 100%;font-size:18px;font-weight:800;padding:16px;${approved ? 'background:linear-gradient(90deg,#7c3aed,#db2777);color:#fff;border-color:#7c3aed' : 'opacity:.45'}">🔮 GELECEĞİMİ GÖSTER</button>`;
      h += note('Tasarım sanal test ortamına kopyalanır; orijinal tasarımın hiçbir zaman değiştirilmez. Testler: dayanım (gerilme, şekil değiştirme, güvenlik katsayısı), ağırlık ve yük, titreşim (doğal frekans, rezonans), sıcaklık (genleşme, ısıl gerilme), yorulma ve aşınma tahmini, tasarım iyileştirme.');
      return h;
    }
    h += `<div style="flex:1 0 100%;display:flex;gap:4px;overflow-x:auto;padding-bottom:2px">${TABS.map(([k, l]) => `<button data-act="sm-t-${k}"${S.tab === k ? ' class="on"' : ''} style="flex:0 0 auto;min-width:0;padding:9px 10px;font-size:13px">${l}</button>`).join('')}<button data-act="sm-exit" style="flex:0 0 auto;min-width:0;padding:9px 10px;font-size:13px">✕</button></div>`;
    if (S.err) h += `<div style="flex:1 0 100%;background:#3b0d0d;border:1px solid #7f1d1d;border-radius:12px;padding:10px;font-size:14px">⚠ ${esc(S.err)}</div>`;
    h += ({ setup: setupHTML, str: strHTML, vib: vibHTML, temp: tempHTML, life: lifeHTML, alt: altHTML, rep: repHTML })[S.tab]();
    return h;
  }
  function legend() {
    if (!S.legend) return '';
    const L = S.legend;
    return `<div style="flex:1 0 100%"><div style="height:12px;border-radius:6px;background:linear-gradient(90deg,#1d4ed8,#06b6d4,#22c55e,#eab308,#ef4444)"></div><div style="display:flex;justify-content:space-between;font-size:12.5px;color:#94a3b8;margin-top:2px"><span>${L.unit === 'göreli' ? 'düşük' : f1(L.vmin) + ' ' + L.unit}</span><span>${L.unit === 'göreli' ? 'yüksek' : '≥ ' + (L.unit === 'mm' ? fmm(L.vmax) : f0(L.vmax) + ' ' + L.unit)}</span></div></div>`;
  }
  function viewCtl() {
    const v = S.view;
    return `<div style="flex:1 0 100%;display:flex;gap:6px;flex-wrap:wrap">${btn('Gerilme', 'sm-v-stress', v.what === 'stress', 'flex:1')}${btn('Yer değiştirme', 'sm-v-disp', v.what === 'disp', 'flex:1')}${btn(v.anim ? '⏸ Animasyon' : '▶ Animasyon', 'sm-v-anim', v.anim, 'flex:1')}</div>` +
      `<div style="flex:1 0 100%;display:flex;gap:6px">${btn('Test öncesi', 'sm-c-before', v.cmp === 'before', 'flex:1')}${btn('Test sonrası', 'sm-c-after', v.cmp === 'after', 'flex:1')}${btn('Karşılaştır', 'sm-c-both', v.cmp === 'both', 'flex:1')}</div>` + legend() +
      (S.scaleShown ? note('Şekil değişimi görünsün diye ×' + f0(S.scaleShown) + ' büyütülmüş çiziliyor (gerçek değerler aşağıda).') : '');
  }
  function setupHTML() {
    const p = P(), s = p.setup, g = S.grid;
    let h = card(row('Ağ', f0(S.fe.ne) + ' küp eleman · ' + f0(S.fe.nn) + ' düğüm') + row('Eleman boyu', f2(g.h) + ' mm') + row('Malzeme', S.mats.map((m) => esc(m.name)).join(', ')));
    h += `<div style="flex:1 0 100%;display:flex;gap:6px">${Object.entries(RES).map(([k, [, l]]) => btn(l, 'sm-res-' + k, s.res === k, 'flex:1')).join('')}</div>`;
    const poor = g.parts.filter((q) => q.poor);
    if (poor.length) h += note('<span style="color:#fbbf24">⚠ ' + poor.map((q) => esc(q.name) + ' (hacim farkı %' + Math.round(Math.abs(q.err) * 100) + ')').join(', ') + ' bu ağda iyi temsil edilmiyor. "İnce" dene; ince sac / profil için sonuç güvenilir olmayabilir.</span>');
    h += '<div class="lbl h">Sabitleme (mesnet)</div>';
    h += s.supports.map((x, i) => `<div style="flex:1 0 100%;display:flex;justify-content:space-between;align-items:center;background:#0f2a1a;border:1px solid #166534;border-radius:10px;padding:8px 10px;font-size:14px"><span>📌 ${esc(x.label)} · ${F.selectNodes(S.fe, x.sel).length} düğüm</span><button data-act="sm-sd-${i}" style="all:unset;cursor:pointer;color:#f87171;font-weight:700;padding:0 6px">✕</button></div>`).join('') || note('Henüz sabitleme yok. Parçanın bağlandığı / oturduğu yeri seç.');
    h += `<div style="flex:1 0 100%;display:flex;gap:6px;flex-wrap:wrap">${FACES.map((f) => btn(F.FACE_NAMES[f], 'sm-sf-' + f, false, 'flex:1 1 30%;padding:9px 4px;font-size:13px')).join('')}</div>`;
    h += btn(S.pick === 'sup' ? '👆 Modele dokun… (iptal)' : '👆 3B modelde dokunarak sabitle', 'sm-pick-sup', S.pick === 'sup', 'flex:1 0 100%');
    h += '<div class="lbl h">Yükler</div>';
    h += s.loads.map((L, i) => `<div style="flex:1 0 100%;display:flex;justify-content:space-between;align-items:center;background:#2a1010;border:1px solid #7f1d1d;border-radius:10px;padding:8px 10px;font-size:14px"><span>➜ ${f0(L.N)} N${L.kg ? ' (' + f1(L.kg) + ' kg)' : ''} · ${esc(DIRS[L.dir][0])} · ${esc(L.label)}</span><button data-act="sm-ld-${i}" style="all:unset;cursor:pointer;color:#f87171;font-weight:700;padding:0 6px">✕</button></div>`).join('') || note('Yük yok. Kuvveti, yönünü ve uygulandığı yeri seç.');
    const fm = S.form;
    h += `<label class="f" style="flex:1 1 30%"><span>Miktar</span><input type="number" inputmode="decimal" step="any" data-sf="F" value="${esc(fm.F)}"></label><label class="f" style="flex:1 1 20%"><span>Birim</span><select data-sf="unit"><option value="N"${fm.unit === 'N' ? ' selected' : ''}>N</option><option value="kg"${fm.unit === 'kg' ? ' selected' : ''}>kg (ağırlık)</option></select></label><label class="f" style="flex:1 1 40%"><span>Yön</span><select data-sf="dir">${Object.entries(DIRS).map(([k, [l]]) => `<option value="${k}"${fm.dir === k ? ' selected' : ''}>${l}</option>`).join('')}</select></label>`;
    h += `<div style="flex:1 0 100%;display:flex;gap:6px;flex-wrap:wrap">${FACES.map((f) => btn(F.FACE_NAMES[f] + 'e', 'sm-lf-' + f, false, 'flex:1 1 30%;padding:9px 4px;font-size:13px')).join('')}</div>`;
    h += btn(S.pick === 'load' ? '👆 Modele dokun… (iptal)' : '👆 3B modelde dokunarak yük uygula', 'sm-pick-load', S.pick === 'load', 'flex:1 0 100%');
    h += btn((s.gravity ? '☑' : '☐') + ' Parçanın kendi ağırlığını hesaba kat', 'sm-grav', s.gravity, 'flex:1 0 100%');
    h += `<button data-act="sm-run" style="flex:1 0 100%;font-size:17px;font-weight:800;padding:14px;background:#16a34a;color:#fff;border-color:#16a34a">▶ DAYANIM TESTİNİ ÇALIŞTIR</button>`;
    h += note('Yük, seçilen yüzün / bölgenin düğümlerine eşit dağıtılır. Sabitlenen bölge her yönde tamamen tutulur (ankastre). Parçalar birbirine tam bağlı (kaynaklı / yapışık) kabul edilir; cıvata boşluğu ve temas modellenmez.');
    return h;
  }
  function strHTML() {
    if (!S.stat) return note('Önce Kurulum sekmesinden "Dayanım testini çalıştır".') + btn('▶ Dayanım testini çalıştır', 'sm-run', false, 'flex:1 0 100%');
    const r = S.stat.res, s = summary(S.fe, r, S.mats, S.grid), target = +P().target || 2;
    const st = s.fosEx >= target ? ['🟢', 'Güvenli', '#22c55e'] : s.fosEx >= 1.5 ? ['🟡', 'Sınırda', '#eab308'] : s.fosEx >= 1 ? ['🟠', 'Riskli', '#f97316'] : ['🔴', 'Akar / kırılabilir', '#ef4444'];
    let h = viewCtl();
    h += card(`<div style="font-weight:800;font-size:17px;color:${st[2]}">${st[0]} ${st[1]} · güvenlik katsayısı ${f2(s.fosEx)}</div>` +
      row('En yüksek von Mises gerilmesi', f1(s.vmEx) + ' MPa') + row('Yük / mesnet çevresi dahil tepe', f1(s.vmax) + ' MPa (GK ' + f2(s.fos) + ')') +
      row('En büyük yer değiştirme', fmm(s.maxU)) + row('Boy / sehim oranı', s.maxU > 0 ? '1/' + f0(s.span / s.maxU) : '—') +
      row('Toplam yük', f0(Math.hypot(...r.applied)) + ' N' + (r.weightN ? ' (öz ağırlık ' + f1(r.weightN) + ' N)' : '')) +
      row('Denge kontrolü (mesnet tepkisi)', f0(Math.hypot(...r.reaction)) + ' N · fark %' + f2(Math.abs(Math.hypot(...r.reaction) - Math.hypot(...r.applied)) / (Math.hypot(...r.applied) || 1) * 100)) +
      row('Çözüm', (r.converged ? 'yakınsadı' : '<span style="color:#fbbf24">tam yakınsamadı</span>') + ' · ' + r.iters + ' adım'));
    h += note('Güvenlik katsayısı = akma dayanımı / von Mises gerilmesi. Tek düğüme / keskin kenara yığılan tepe değerler (gerilme tekilliği) ağ inceldikçe büyür; bu yüzden ana değer yük ve mesnet çevresi (2 eleman) hariç verilir, tepe değer ayrıca gösterilir.');
    h += '<div class="lbl h">Kritik bölgeler</div>';
    h += S.crit.map((c, i) => `<button data-act="sm-cr-${i}" style="all:unset;box-sizing:border-box;flex:1 0 100%;background:#111a2e;border:1px solid ${c.util >= 1 ? '#7f1d1d' : c.util >= 1 / target ? '#78350f' : '#1e293b'};border-radius:10px;padding:8px 10px;cursor:pointer;font-size:14px"><b>${i + 1}.</b> ${esc(S.grid.parts[c.partIdx] ? S.grid.parts[c.partIdx].name : '')} · ${f0(c.vm)} MPa · akma sınırına oranı %${Math.round(c.util * 100)}${c.nearBC ? ' · <span style="color:#94a3b8">mesnet / yük yakını</span>' : ''}<br><span style="font-size:12.5px;color:#94a3b8">X ${f0(c.at[0])} / Y ${f0(c.at[1])} / Z ${f0(c.at[2])} · ${c.count} eleman</span></button>`).join('') || note('—');
    h += '<div class="lbl h">🤖 Akıllı test asistanı</div>' + advice().map(adv).join('');
    h += `<label class="f" style="flex:1 0 100%"><span>Hedef güvenlik katsayısı (statik, sünek malzeme için tipik 1,5–3)</span><input type="number" step="0.1" min="1" data-sp="target" value="${esc(P().target)}"></label>`;
    h += btn('🔁 Ağ yakınsama kontrolü (daha ince ağla karşılaştır)', 'sm-conv', false, 'flex:1 0 100%');
    if (S.conv) h += card(row('Ağ', f0(S.conv.ne0) + ' → ' + f0(S.conv.ne1) + ' eleman') + row('En büyük yer değiştirme farkı', '%' + f1(S.conv.dU)) + row('Gerilme farkı (tekillik hariç)', '%' + f1(S.conv.dS)) + `<div style="font-size:13px;margin-top:4px;color:${S.conv.dU < 5 && S.conv.dS < 10 ? '#22c55e' : '#fbbf24'}">${S.conv.dU < 5 && S.conv.dS < 10 ? 'Sonuç ağdan büyük ölçüde bağımsız.' : S.conv.dU < 5 ? 'Yer değiştirme yakınsadı; tepe gerilme ağ inceldikçe artıyor. Bu, keskin iç köşede gerilme yığılması demektir: gerçek tepe değer köşe radyüsüne bağlıdır. Köşeye radyüs vermek bu tepe değeri düşürür.' : 'Sonuç ağa duyarlı: daha ince ağ ile kontrol et, değerleri yaklaşık kabul et.'}</div>`);
    return h;
  }
  const adv = (a) => `<div style="flex:1 0 100%;background:#111a2e;border:1px solid ${a.sev === 'crit' ? '#7f1d1d' : a.sev === 'warn' ? '#78350f' : '#1e293b'};border-radius:12px;padding:10px;font-size:14px"><b style="color:${a.sev === 'crit' ? '#f87171' : a.sev === 'warn' ? '#fbbf24' : '#93c5fd'}">${a.sev === 'crit' ? '🔴' : a.sev === 'warn' ? '🟠' : '💡'} ${esc(a.t)}</b><div style="margin-top:4px;color:#cbd5e1"><b>Neden:</b> ${esc(a.why)}</div><div style="margin-top:3px;color:#cbd5e1"><b>Öneri:</b> ${esc(a.fix)}</div></div>`;
  function vibHTML() {
    const v = P().vib;
    let h = `<label class="f" style="flex:1 1 45%"><span>Titreşim frekansı (Hz)</span><input type="number" inputmode="decimal" step="any" data-sv="f" value="${esc(v.f)}" placeholder="ör. 50 (motor 3000 d/dk)"></label><label class="f" style="flex:1 1 45%"><span>Sönüm oranı %</span><input type="number" step="0.5" data-sv="zeta" value="${esc(v.zeta)}"></label>`;
    h += note('Motor / makine: frekans (Hz) = devir (d/dk) / 60. Sönüm bilinmiyorsa kaynaklı çelik için %1–2, cıvatalı birleşim için %3–5 tipiktir.');
    h += btn('▶ Titreşim testini çalıştır', 'sm-vib', false, 'flex:1 0 100%;font-weight:700');
    const V = S.vib;
    if (!V) return h;
    h += legend();
    h += `<div style="flex:1 0 100%;display:flex;gap:6px">${V.modes.map((m, i) => btn((i + 1) + '. mod · ' + f1(m.f) + ' Hz', 'sm-m-' + i, S.mode === i, 'flex:1;font-size:13px')).join('')}</div>`;
    const f = +v.f, z = (+v.zeta || 2) / 100;
    const AX = ['X', 'Y', 'Z'];
    h += card(V.modes.map((m, i) => { const r = f > 0 ? F.resonance(m.f, f, z) : null; return row((i + 1) + '. doğal frekans (' + AX[m.axis] + ' yönü ağırlıklı)', f1(m.f) + ' Hz' + (r ? ' · oran ' + f2(r.r) + ' · büyütme ×' + f1(r.daf) : ''), r ? (r.level === 'crit' ? '#ef4444' : r.level === 'warn' ? '#eab308' : '#22c55e') : null); }).join('') + (V.converged ? '' : '<div style="color:#fbbf24;font-size:13px">Özdeğer çözümü tam yakınsamadı.</div>') + row('Ağ (titreşim)', f0(V.fe.ne) + ' eleman'));
    if (f > 0) {
      const rs = V.modes.map((m) => F.resonance(m.f, f, z)), worst = rs.reduce((a, b) => (b.daf > a.daf ? b : a));
      const lvl = rs.some((r) => r.level === 'crit') ? 'crit' : rs.some((r) => r.level === 'warn') ? 'warn' : 'ok';
      h += adv(lvl === 'crit' ? { sev: 'crit', t: 'REZONANS RİSKİ: ' + f1(f) + ' Hz uyarı frekansı bir doğal frekansa çok yakın.', why: 'Uyarı frekansı doğal frekansa yaklaşınca titreşim genliği sönümle sınırlı kalır; şu sönümde ~' + f0(worst.daf) + ' kat büyür. Kısa sürede yorulma çatlağı ve gevşeme olur.', fix: 'Doğal frekansı uyarı frekansından en az %20–30 uzaklaştır: rijitliği artır (takviye, kesit) frekansı yükseltir; kütle eklemek düşürür. Ya da titreşim yalıtımı (takoz) kullan.' } :
        lvl === 'warn' ? { sev: 'warn', t: 'Doğal frekansa yakın çalışma (×' + f1(worst.daf) + ' büyütme).', why: 'Uyarı frekansı rezonans bandının kenarında.', fix: 'Frekansı biraz uzaklaştıracak takviye ya da yalıtım değerlendirilebilir.' } :
          { sev: 'info', t: 'Rezonans riski düşük (en yüksek büyütme ×' + f2(worst.daf) + ').', why: 'Uyarı frekansı doğal frekanslardan yeterince uzak.', fix: 'Değişiklik gerekmiyor; frekans değişebiliyorsa (devir ayarı) tüm aralığı kontrol et.' });
      if (S.stat) { const s = summary(S.fe, S.stat.res, S.mats, S.grid); h += note('Uygulanan yük bu frekansta salınırsa gerilme yaklaşık ' + f0(s.vmEx) + ' × ' + f1(worst.daf) + ' ≈ <b>' + f0(s.vmEx * worst.daf) + ' MPa</b> olur (tek mod yaklaşımı, YAKLAŞIK).'); }
    } else h += note('Uyarı frekansını girersen rezonans riski değerlendirilir.');
    h += note('3B görünümde seçili titreşim modu gerçek hesaplanan biçimiyle salınır (abartılı); renkler o modda en çok eğilen / zorlanan bölgeleri gösterir.');
    return h;
  }
  function tempHTML() {
    const t = P().temp;
    let h = `<label class="f" style="flex:1 1 45%"><span>Çalışma sıcaklığı (°C)</span><input type="number" inputmode="decimal" step="any" data-st="T" value="${esc(t.T)}" placeholder="ör. 80"></label>` + btn((t.withLoads ? '☑' : '☐') + ' Yüklerle birlikte', 'sm-tl', t.withLoads, 'flex:1 1 45%');
    h += btn('▶ Sıcaklık testini çalıştır', 'sm-temp', false, 'flex:1 0 100%;font-weight:700');
    const R = S.therm;
    if (!R) return h + note('Referans (montaj) sıcaklığı 20 °C kabul edilir.');
    const T = R.T, dT = T - 20, g = S.grid;
    if (R.res) h += viewCtl();
    // serbest genleşme
    h += '<div class="lbl h">Termal genleşme (serbest)</div>';
    const byMat = S.mats.map((m, i) => ({ m, v: g.parts.filter((q) => q.mat === i).reduce((s, q) => s + q.vVox, 0) })).sort((a, b) => b.v - a.v), m0 = byMat[0].m;
    h += card(['X', 'Y', 'Z'].map((ax, k) => row(ax + ' boyu ' + f0([g.nx, g.ny, g.nz][k] * g.h) + ' mm', (dT >= 0 ? '+' : '−') + fmm(Math.abs(m0.alpha * dT * [g.nx, g.ny, g.nz][k] * g.h)))).join('') + row('Genleşme katsayısı (' + esc(m0.name) + ')', f1(m0.alpha * 1e6) + ' ×10⁻⁶ /°C'));
    if (S.mats.length > 1) h += note('Farklı genleşen malzemeler (' + S.mats.map((m) => esc(m.name) + ' ' + f1(m.alpha * 1e6)).join(', ') + ' ×10⁻⁶) birleşim yerinde ek gerilme yapar; aşağıdaki FEA bunu hesaba katar.');
    // malzeme davranışı
    h += '<div class="lbl h">Malzemenin sıcaklık davranışı</div>';
    for (const m of S.mats) {
      const tf = F.tempFactors(m.id, T);
      let txt;
      if (T > m.Tmax && !tf) txt = { sev: 'crit', t: m.name + ': ' + f0(T) + ' °C bu malzeme için önerilen üst sınırın (' + f0(m.Tmax) + ' °C) üstünde.', why: 'Bu sıcaklıkta dayanım verisi yok' + (m.kind === 'plastic' ? '; plastik camsı geçiş sıcaklığına yaklaşınca yumuşar ve yük altında akar' : '') + '. Sonuç uydurulmaz.', fix: 'Daha yüksek sıcaklığa dayanıklı malzeme seç ya da sıcaklığı düşür (yalıtım, soğutma).' };
      else if (tf && (tf.ky < 1 || (tf.kE && tf.kE < 1))) txt = { sev: tf.ky < 0.8 ? 'warn' : 'info', t: m.name + ': ' + f0(T) + ' °C\'de akma dayanımı %' + Math.round(tf.ky * 100) + (tf.kE ? ', elastisite %' + Math.round(tf.kE * 100) : '') + ' seviyesine düşer.', why: m.id === 'celik' ? 'EN 1993-1-2 azaltma katsayıları.' : 'ASM 6061-T6 yüksek sıcaklık verisi.', fix: 'Güvenlik katsayısı bu azaltılmış dayanımla hesaplandı.' };
      else if (T < m.Tmin) txt = { sev: 'warn', t: m.name + ': ' + f0(T) + ' °C düşük sıcaklık.', why: m.note || 'Düşük sıcaklıkta malzeme gevrekleşebilir (darbe dayanımı düşer).', fix: 'Düşük sıcaklık darbe testi olan malzeme kalitesi seç.' };
      else txt = { sev: 'info', t: m.name + ': ' + f0(T) + ' °C kullanım aralığında.', why: 'Önerilen aralık ' + f0(m.Tmin) + ' … ' + f0(m.Tmax) + ' °C (tipik değer).', fix: m.creep ? 'Plastikte sıcaklık arttıkça sürünme hızlanır; sürekli yükte payı büyük tut.' : '—' };
      h += adv(txt);
    }
    if (R.res) {
      const s = summary(S.fe, R.res, S.mats, S.grid), m = S.mats[S.fe.elMat[0]], tf = F.tempFactors(m.id, T);
      const syT = tf ? m.sy * tf.ky : T <= m.Tmax ? m.sy : null;
      h += '<div class="lbl h">Isıl gerilme (FEA)</div>' + card(row('En yüksek gerilme (sabitlemeler genleşmeyi engelliyor)', f1(s.vmEx) + ' MPa') + row('En büyük yer değiştirme', fmm(s.maxU)) + row('Güvenlik katsayısı (sıcaklıkta)', syT ? f2(syT / s.vmEx) : 'hesaplanamaz (veri yok)'));
      h += note('Isıl gerilme, sabitlenen yüzlerin genleşmeyi tamamen engellediği kabulüyle hesaplanır; gerçekte bağlantı biraz esner → gerçek değer daha düşük olabilir. Sıcaklık her yerde aynı kabul edilir (sıcaklık dağılımı hesaplanmaz).');
    } else h += note('Isıl gerilme için sabitleme gerekli (Kurulum).');
    return h;
  }
  function lifeHTML() {
    const L = P().life;
    let h = `<label class="f" style="flex:1 1 45%"><span>Yük türü</span><select data-sl2="R"><option value="-1"${+L.R === -1 ? ' selected' : ''}>İleri-geri (tam değişken)</option><option value="0"${+L.R === 0 ? ' selected' : ''}>Sıfırdan maksimuma (bas-bırak)</option></select></label>` +
      `<label class="f" style="flex:1 1 45%"><span>Günde kaç tekrar</span><input type="number" inputmode="decimal" step="any" data-sl2="cpd" value="${esc(L.cpd)}" placeholder="ör. 500"></label>` +
      `<label class="f" style="flex:1 1 45%"><span>Yüzey (metal)</span><select data-sl2="surface">${Object.entries(F.SURF).map(([k, v]) => `<option value="${k}"${L.surface === k ? ' selected' : ''}>${v[2]}</option>`).join('')}</select></label>` +
      `<label class="f" style="flex:1 1 45%"><span>Sürtünme</span><select data-sl2="fric"><option value="yok"${L.fric === 'yok' ? ' selected' : ''}>Yok</option><option value="kuru"${L.fric === 'kuru' ? ' selected' : ''}>Kuru kayma</option><option value="yagli"${L.fric === 'yagli' ? ' selected' : ''}>Yağlı kayma</option></select></label>` +
      (L.fric !== 'yok' ? `<label class="f" style="flex:1 0 100%"><span>Her tekrarda kayma mesafesi (mm)</span><input type="number" inputmode="decimal" step="any" data-sl2="slide" value="${esc(L.slide)}" placeholder="ör. 20"></label>` : '');
    if (!S.stat) return h + note('Ömür tahmini için önce Dayanım testini çalıştır (tekrarlanan yük = Kurulumdaki yükler).');
    const s = summary(S.fe, S.stat.res, S.mats, S.grid), m = S.mats[s.matEx], smax = s.vmEx;
    const fat = F.fatigue(m, smax, { R: +L.R, surface: L.surface }), cpd = parseFloat(String(L.cpd).replace(',', '.'));
    h += '<div class="lbl h">Yorulma (tekrarlanan yük)</div>';
    let body = row('En yüksek gerilme (tekillik hariç)', f0(smax) + ' MPa (' + esc(m.name) + ')') + row('Gerilme genliği / ortalama', f0(fat.sa) + ' / ' + f0(fat.sm) + ' MPa') + (fat.Se ? row(m.fat.type === 'limit' ? 'Düzeltilmiş yorulma sınırı Se' : 'Yorulma dayanımı (' + fN(fat.Ne || m.fat.Nf) + ' çevrim)', f0(fat.Se) + ' MPa') : '');
    if (fat.low) body += row('Tahmini ömür', '< 1000 tekrar', '#ef4444');
    else body += row('Tahmini dayanılan tekrar', fN(fat.N), fat.N === Infinity ? '#22c55e' : fat.N < 1e5 ? '#ef4444' : '#eab308');
    const ly = !fat.low && fat.N > 0 ? F.lifeYears(fat.N, cpd) : null;
    if (ly) body += row('Kullanım ömrü (günde ' + f0(cpd) + ' tekrar)', ly.inf ? 'yorulma sınırının altında (sonsuz ömür beklenir)' : fyr(ly.lo) + ' … ' + fyr(ly.hi) + ' (orta ' + fyr(ly.y) + ')');
    h += card(body);
    if (!(cpd > 0) && !fat.low && fat.N !== Infinity) h += note('<span style="color:#fbbf24">Kullanım sıklığını (günde kaç tekrar) girersen yıl olarak aralık verilir. Bu bilgi olmadan süre iddia edilmez.</span>');
    if (m.fat.wide) h += note('⚠ ' + esc(m.name) + ' için yorulma verisi çok değişkendir (üretim yöntemi, baskı yönü, nem, sıcaklık). Sayı yalnızca kaba fikir verir.');
    h += note('Yöntem (YAKLAŞIK): ' + (m.fat.type === 'limit' ? 'Shigley S-N yaklaşımı, Se = 0,5·Su × yüzey (ka = ' + f2(fat.ka) + ') × boyut (0,85)' : 'Basquin doğrusu, 10³ çevrimde 0,9·Su → yorulma dayanımı') + '; ortalama gerilme Goodman ile. Yorulma deneylerinde ömür ~3 kat saçılır; kaynak dikişi, çentik, korozyon ömrü belirgin kısaltır. Kesin ömür ancak deneyle belirlenir.');
    // aşınma
    if (L.fric !== 'yok') {
      h += '<div class="lbl h">Aşınma (sürtünme)</div>';
      const Ftot = P().setup.loads.reduce((a, x) => a + x.N, 0), nodes = new Set(S.stat.res.loadN), area = nodes.size * S.grid.h ** 2;
      const w = F.wear(m, Ftot, parseFloat(String(L.slide).replace(',', '.')), cpd, area, L.fric);
      if (!w) h += note('<span style="color:#fbbf24">Aşınma için yük, kayma mesafesi ve günlük tekrar sayısı gerekli.</span>');
      else h += card(row('Temas basıncı (yük / yüklenen alan)', f1(w.p) + ' MPa') + row('Yılda aşınma derinliği', fmm(w.lo) + ' … ' + fmm(w.hi))) + note('Archard bağıntısı V = K·F·s/H (YAKLAŞIK). K katsayısı malzeme çiftine, yüzeye ve yağlamaya göre 100 kat değişir; ölçülmeden kesin değer verilemez, bu yüzden aralık gösterilir. Karşı yüzeyin malzemesi bilinmiyor.');
    }
    return h;
  }
  function altHTML() {
    const p = P();
    let h = `<label class="f" style="flex:1 0 100%"><span>Hedef güvenlik katsayısı</span><input type="number" step="0.1" min="1" data-sp="target" value="${esc(p.target)}"></label>`;
    h += btn('✨ Alternatif tasarımları oluştur', 'sm-alts', false, 'flex:1 0 100%;font-weight:700');
    if (!S.alts) return h + note('Dayanım sonucuna göre: daha dayanıklı (kritik bölgeye malzeme ekleme), daha hafif (yük taşımayan malzemeyi çıkarma) ve malzeme alternatifleri hesaplanır. Her alternatif ayrı bir kopyadır; orijinal tasarımın değiştirilmez. Her alternatif yeniden FEA ile doğrulanır.');
    if (S.altShow != null) h += legend() + `<div style="flex:1 0 100%;display:flex;gap:6px">${btn('Test öncesi', 'sm-c-before', S.view.cmp === 'before', 'flex:1')}${btn('Test sonrası', 'sm-c-after', S.view.cmp === 'after', 'flex:1')}${btn('Karşılaştır', 'sm-c-both', S.view.cmp === 'both', 'flex:1')}</div>`;
    const o = S.alts[0].sum, prices = api.prices() || {}, pr = S.mats.length === 1 ? prices[S.matIds[0]] : null;
    const pct = (a, b) => (b ? (a - b) / b * 100 : 0), sgn = (v) => (v > 0 ? '+' : '') + f0(v) + '%';
    for (const [i, a] of S.alts.entries()) {
      const s = a.sum, cost = pr > 0 ? s.mass * pr : null;
      h += `<div style="flex:1 0 100%;background:${S.altShow === i ? '#1e1b4b' : '#111a2e'};border:1px solid ${S.altShow === i ? '#7c3aed' : '#1e293b'};border-radius:12px;padding:10px">` +
        `<div style="display:flex;justify-content:space-between;gap:8px"><b style="font-size:16px">${esc(a.name)}</b>${btn(S.altShow === i ? '◉ 3B' : '○ 3B', 'sm-as-' + i, S.altShow === i, 'flex:0 0 auto;min-width:0;padding:6px 10px')}</div>` +
        row('Kütle', f2(s.mass) + ' kg' + (i ? ' (' + sgn(pct(s.mass, o.mass)) + ')' : '')) + row('En yüksek gerilme', f0(s.vmEx) + ' MPa' + (i ? ' (' + sgn(pct(s.vmEx, o.vmEx)) + ')' : '')) +
        row('Güvenlik katsayısı', f2(s.fosEx), s.fosEx >= p.target ? '#22c55e' : '#eab308') + row('En büyük yer değiştirme', fmm(s.maxU) + (i ? ' (' + sgn(pct(s.maxU, o.maxU)) + ')' : '')) +
        (cost != null ? row('Malzeme maliyeti (net)', f0(cost) + ' ₺') : '') + `<div style="font-size:13px;color:#cbd5e1;margin-top:6px">${esc(a.why)}</div>` +
        (i ? `<div style="display:flex;gap:6px;margin-top:6px">${btn('💾 Kopya olarak sakla', 'sm-ak-' + i, false, 'flex:1;font-size:13px')}${btn('⬇ STL', 'sm-ax-' + i, false, 'flex:1;font-size:13px')}</div>` : '') + '</div>';
    }
    if (S.alts.length === 1) h += note('Geometrik alternatif üretilemedi (eklenecek boş yer yok ya da çıkarılabilecek malzeme dayanımı hedefin altına düşürüyor).');
    if (S.altMats && S.altMats.length) {
      const target = +p.target || 2, ok = S.altMats.filter((m) => m.fos >= target && !m.cur);
      const lightest = ok.slice().sort((a, b) => a.mass - b.mass)[0], cheapest = ok.filter((m) => m.cost != null).sort((a, b) => a.cost - b.cost)[0], cur = S.altMats.find((m) => m.cur);
      h += '<div class="lbl h">Malzeme alternatifleri (aynı geometri)</div>';
      if (lightest) h += adv({ sev: 'info', t: 'Daha hafif: ' + lightest.name + ' → ' + f2(lightest.mass) + ' kg (' + sgn(pct(lightest.mass, cur.mass)) + '), güvenlik katsayısı ' + f2(lightest.fos) + '.', why: 'Yük kaynaklı gerilme malzemeden bağımsızdır; yoğunluğu düşük ama akma dayanımı hedefi karşılayan malzeme aynı yükü daha hafif taşır. Sehim E ile ters orantılı: ' + fmm(lightest.umax) + '.', fix: 'Değiştirmeden önce üretim yöntemi, kaynak edilebilirlik ve korozyonu kontrol et.' });
      if (cheapest) h += adv({ sev: 'info', t: 'Daha ekonomik: ' + cheapest.name + ' → ' + f0(cheapest.cost) + ' ₺ (şu an ' + (cur.cost != null ? f0(cur.cost) + ' ₺' : 'fiyat yok') + ').', why: 'Maliyet sekmesine girdiğin kg fiyatı × net kütle; işçilik ve fire dahil değil.', fix: 'Tam karşılaştırma için Maliyet sekmesini kullan.' });
      else h += note('Ekonomik karşılaştırma için Maliyet sekmesinde malzeme kg fiyatlarını gir (fiyat uydurulmaz).');
      h += card(S.altMats.slice().sort((a, b) => b.fos - a.fos).map((m) => row(esc(m.name) + (m.cur ? ' (mevcut)' : ''), f2(m.mass) + ' kg · GK ' + f2(m.fos) + ' · ' + fmm(m.umax) + (m.cost != null ? ' · ' + f0(m.cost) + ' ₺' : ''), m.fos >= target ? '#22c55e' : m.fos >= 1 ? '#eab308' : '#ef4444')).join(''));
      h += note('Malzeme tablosu doğrusal süperpozisyonla hesaplanır (yük gerilmesi aynı, öz ağırlık yoğunlukla, sehim 1/E ile ölçeklenir) — bu durumda yeniden FEA ile aynı sonucu verir (test edildi); Poisson oranı farkı ihmal edilir. Ahşap için izotrop kabul yaklaşıktır.');
    } else if (S.mats.length > 1) h += note('Birden fazla malzemeli modelde malzeme alternatifi hesaplanmadı; parça malzemesini değiştirip yeniden test edebilirsin.');
    if (p.saved.length) h += '<div class="lbl h">Saklanan kopyalar</div>' + p.saved.map((x, i) => row(esc(x.name) + ' · ' + esc(new Date(x.at).toLocaleDateString('tr-TR')), f2(x.sum.mass) + ' kg · GK ' + f2(x.sum.fosEx) + ` <button data-act="sm-sx-${i}" style="all:unset;cursor:pointer;color:#f87171;padding:0 4px">✕</button>`)).join('');
    return h;
  }
  function repHTML() {
    return note('PDF raporda: tasarım bilgileri, malzemeler, uygulanan kuvvetler ve sabitlemeler, test koşulları, gerilme ve şekil değiştirme sonuçları, kritik bölgeler, güvenlik katsayısı, titreşim / sıcaklık / ömür sonuçları (çalıştırıldıysa), iyileştirme önerileri, alternatifler, doğrulama tablosu ve sınırlamalar.') +
      btn('📄 PDF test raporunu indir', 'sm-pdf', false, 'flex:1 0 100%;font-size:16px;font-weight:700') +
      '<div class="lbl h">Hesap güvenilirliği</div>' + card('<div style="font-size:13.5px;margin-bottom:6px"><b>Sayısal hesap (FEA):</b> gerilme, şekil değiştirme, güvenlik katsayısı, doğal frekans, ısıl gerilme. Doğrusal-elastik sonlu elemanlar; analitik çözümlerle doğrulandı:</div>' + VALIDATION.map(([k, v]) => row(esc(k), v)).join('')) +
      card('<div style="font-size:13.5px"><b>Yaklaşık / ampirik tahmin:</b> yorulma ömrü (S-N eğrisi), aşınma (Archard), yüksek sıcaklıkta dayanım (tablo), rezonans büyütmesi (tek serbestlik), malzeme özellikleri (tipik değer). <b>Hesaplanmayan:</b> plastik şekil değiştirme / kırılma sonrası, burkulma, temas ve cıvata ön yükü, kaynak dikişi, darbe, sıcaklık dağılımı. Bu sonuçlar profesyonel mühendislik onayının yerine geçmez.</div>');
  }
  const btn = (l, a, on, st = '') => `<button data-act="${a}"${on ? ' class="on"' : ''}${st ? ' style="' + st + '"' : ''}>${l}</button>`;
  const note = (t) => `<div class="lbl" style="flex:1 0 100%;font-size:13px;line-height:1.4">${t}</div>`;
  const card = (inner) => `<div style="flex:1 0 100%;background:#111a2e;border:1px solid #1e293b;border-radius:12px;padding:10px">${inner}</div>`;
  const row = (k, v, col) => `<div style="display:flex;justify-content:space-between;gap:8px;padding:4px 0;border-top:1px solid #1e293b;font-size:14px"><span style="color:#94a3b8">${k}</span><b style="text-align:right${col ? ';color:' + col : ''}">${v}</b></div>`;

  /* ---------- olaylar ---------- */
  async function enterLab() {
    try { build(); } catch (e) { api.toast('Model hazırlanamadı: ' + e.message); return; }
    S.lab = true; S.tab = 'setup'; S.err = null; S.pick = null; api.enter(); draw(); api.render();
  }
  function addSup(sel, label) { P().setup.supports.push({ sel, label }); save(); S.stat = null; S.alts = null; draw(); api.render(); }
  function addLoad(sel, label) {
    const fm = S.form, v = parseFloat(String(fm.F).replace(',', '.'));
    if (!(v > 0)) { api.toast('Yük miktarını gir'); return; }
    const N = fm.unit === 'kg' ? v * 9.81 : v;
    P().setup.loads.push({ sel, label, N, kg: fm.unit === 'kg' ? v : null, dir: fm.dir }); save(); S.stat = null; S.alts = null; draw(); api.render();
  }
  function act(a) {
    if (!a.startsWith('sm-')) return false;
    if (S.busy) return true;
    const p = P();
    if (a === 'sm-approve') { const inf = api.info(); if (inf.parts.some((q) => !q.chosen)) { api.toast('Önce bütün malzemeleri seç'); return true; } p.approved = { hash: api.hash(), at: Date.now() }; save(); api.toast('Tasarım onaylandı'); api.render(); return true; }
    if (a === 'sm-go') { if (!(p.approved && p.approved.hash === api.hash())) { api.toast('Önce tasarımı onayla'); return true; } enterLab(); return true; }
    if (a === 'sm-exit') { exit(); api.render(); return true; }
    let m = a.match(/^sm-t-(\w+)$/); if (m) { S.tab = m[1]; S.err = null; S.pick = null; if (S.tab !== 'alt') S.altShow = null; draw(); api.render(); return true; }
    m = a.match(/^sm-res-(\w+)$/); if (m) { p.setup.res = m[1]; save(); try { build(); } catch (e) { api.toast(e.message); } draw(); api.render(); return true; }
    m = a.match(/^sm-sf-(.+)$/); if (m) { addSup({ face: m[1] }, F.FACE_NAMES[m[1]]); return true; }
    m = a.match(/^sm-lf-(.+)$/); if (m) { addLoad({ face: m[1] }, F.FACE_NAMES[m[1]]); return true; }
    m = a.match(/^sm-sd-(\d+)$/); if (m) { p.setup.supports.splice(+m[1], 1); save(); S.stat = null; draw(); api.render(); return true; }
    m = a.match(/^sm-ld-(\d+)$/); if (m) { p.setup.loads.splice(+m[1], 1); save(); S.stat = null; draw(); api.render(); return true; }
    if (a === 'sm-pick-sup' || a === 'sm-pick-load') { const k = a.slice(8); S.pick = S.pick === k ? null : k; if (S.pick) api.toast('Modelde bir noktaya dokun'); api.render(); return true; }
    if (a === 'sm-grav') { p.setup.gravity = !p.setup.gravity; save(); S.stat = null; api.render(); return true; }
    if (a === 'sm-run') { runStatic(); return true; }
    if (a === 'sm-vib') { runModal(); return true; }
    if (a === 'sm-temp') { runThermal(); return true; }
    if (a === 'sm-tl') { p.temp.withLoads = !p.temp.withLoads; save(); api.render(); return true; }
    if (a === 'sm-alts') { runAlts(); return true; }
    if (a === 'sm-conv') { convergence(); return true; }
    if (a === 'sm-pdf') { exportPDF(); return true; }
    m = a.match(/^sm-v-(\w+)$/); if (m) { if (m[1] === 'anim') S.view.anim = !S.view.anim; else S.view.what = m[1]; draw(); api.render(); return true; }
    m = a.match(/^sm-c-(\w+)$/); if (m) { S.view.cmp = m[1]; draw(); api.render(); return true; }
    m = a.match(/^sm-m-(\d+)$/); if (m) { S.mode = +m[1]; draw(); api.render(); return true; }
    m = a.match(/^sm-cr-(\d+)$/); if (m) { const c = S.crit[+m[1]]; if (c) api.focus(c.at, Math.max(S.grid.h * 12, size() * 0.15)); return true; }
    m = a.match(/^sm-as-(\d+)$/); if (m) { S.altShow = S.altShow === +m[1] ? null : +m[1]; draw(); api.render(); return true; }
    m = a.match(/^sm-ak-(\d+)$/); if (m) { const x = S.alts[+m[1]]; p.saved.push({ name: x.name, at: Date.now(), h: x.grid.h, origin: x.grid.origin, dims: [x.grid.nx, x.grid.ny, x.grid.nz], rle: F.rle(x.grid.mat), mats: S.matIds, sum: x.sum }); save(); api.toast('"' + x.name + '" ayrı kopya olarak projeye kaydedildi (orijinal değişmedi)'); api.render(); return true; }
    m = a.match(/^sm-ax-(\d+)$/); if (m) { stl(S.alts[+m[1]]); return true; }
    m = a.match(/^sm-sx-(\d+)$/); if (m) { p.saved.splice(+m[1], 1); save(); api.render(); return true; }
    return true;
  }
  function input(el, type) {
    const d = el.dataset, p = P();
    if (d.sm === 'mat') { if (el.value) api.setMat(+d.pid, el.value); return; }
    if (d.sf) { S.form[d.sf] = el.value; return; }
    if (d.sp === 'target' && type === 'change') { const v = parseFloat(String(el.value).replace(',', '.')); if (v >= 1) { p.target = v; save(); api.render(); } return; }
    if (d.sv) { p.vib[d.sv] = el.value; save(); if (type === 'change' && S.vib) api.render(); return; }
    if (d.st) { p.temp[d.st] = el.value; save(); return; }
    if (d.sl2) { p.life[d.sl2] = el.value; save(); if (type === 'change') api.render(); }
  }
  function tap(pt) {
    if (!S.lab || !S.pick || !pt) return false;
    const r = Math.max(S.grid.h * 1.6, size() * 0.03), lbl = 'Nokta (' + f0(pt[0]) + ', ' + f0(pt[1]) + ', ' + f0(pt[2]) + ')';
    const sel = { p: pt, r };
    if (!F.selectNodes(S.fe, sel).length) { api.toast('Bu noktada yüzey bulunamadı'); return true; }
    const k = S.pick; S.pick = null;
    if (k === 'sup') addSup(sel, lbl); else addLoad(sel, lbl);
    return true;
  }
  async function convergence() {
    if (!S.stat) return;
    const its = api.items().filter((x) => x.tris && x.tris.length >= 9);
    const IT = its.map((x) => ({ id: x.id, tris: x.tris, mat: S.matIds.indexOf(x.matId) }));
    let g = F.voxelize(IT, { target: S.fe.ne * 2.5 }); if (g.h > S.grid.h * 0.9) g = F.voxelize(IT, { h: S.grid.h / 1.4 });
    const fe = F.buildFE(g);
    if (fe.ne > 120000) { api.toast('Daha ince ağ bu cihaz için çok büyük'); return; }
    const base = bcBase(), setup = P().setup;
    const r = await busy('İnce ağ çözülüyor (' + fe.ne + ' eleman)', (prog) => run('static', { fe: feMsg(fe), mats: S.mats, bc: { ...base, gravity: setup.gravity } }, prog));
    if (r.error) { S.err = r.text; api.render(); return; }
    const s1 = summary(fe, r, S.mats, g), s0 = summary(S.fe, S.stat.res, S.mats, S.grid);
    S.conv = { ne0: S.fe.ne, ne1: fe.ne, dU: Math.abs(s1.maxU - s0.maxU) / s1.maxU * 100, dS: Math.abs(s1.vmEx - s0.vmEx) / s1.vmEx * 100 };
    api.render();
  }
  function stl(a) {
    const q = a.quads.quads, fe = a.fe, pos = new Float32Array(q.length / 4 * 18);
    let k = 0; const P3 = (n) => { pos[k++] = fe.xyz[n * 3]; pos[k++] = fe.xyz[n * 3 + 1]; pos[k++] = fe.xyz[n * 3 + 2]; };
    for (let i = 0; i < q.length; i += 4) { P3(q[i]); P3(q[i + 1]); P3(q[i + 2]); P3(q[i]); P3(q[i + 2]); P3(q[i + 3]); }
    const blob = new Blob([toSTLBinary(pos)], { type: 'model/stl' }), el = document.createElement('a');
    el.href = URL.createObjectURL(blob); el.download = fname() + '-' + a.key + '.stl'; document.body.appendChild(el); el.click(); el.remove(); setTimeout(() => URL.revokeObjectURL(el.href), 8000);
    api.toast('Alternatif STL olarak indirildi (küp yüzeyli taslak geometri)');
  }
  const fname = () => String(api.name() || 'model').replace(/[^\w\-çğıöşüÇĞİÖŞÜ ]+/g, '_');
  function exit() { S.lab = false; S.pick = null; S.altShow = null; api.leave(); }

  async function exportPDF() {
    if (!S.stat) { api.toast('Önce Dayanım testini çalıştır'); return; }
    api.toast('PDF hazırlanıyor…');
    try {
      const keep = { tab: S.tab, cmp: S.view.cmp, anim: S.view.anim, show: S.altShow };
      S.tab = 'str'; S.altShow = null; S.view.cmp = 'after'; S.view.anim = false; draw();
      let shot = null; try { shot = api.snapshot(); } catch (e) { shot = null; }
      Object.assign(S, { tab: keep.tab, altShow: keep.show }); S.view.cmp = keep.cmp; S.view.anim = keep.anim; draw();
      const pages = drawReport(reportData(), shot);
      const jp = [];
      for (const c of pages) { const b = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.9)); jp.push({ jpeg: new Uint8Array(await b.arrayBuffer()), w: c.width, h: c.height }); }
      const el = document.createElement('a'); el.href = URL.createObjectURL(new Blob([pdfFromJpegs(jp)], { type: 'application/pdf' }));
      el.download = fname() + '-test-raporu.pdf'; document.body.appendChild(el); el.click(); el.remove(); setTimeout(() => URL.revokeObjectURL(el.href), 8000);
      api.toast('PDF test raporu indirildi (' + pages.length + ' sayfa)');
    } catch (e) { api.toast('PDF oluşturulamadı: ' + e.message); }
  }
  function reportData() {
    const p = P(), s = summary(S.fe, S.stat.res, S.mats, S.grid), inf = api.info();
    const L = p.life, m = S.mats[s.matEx], cpd = parseFloat(String(L.cpd).replace(',', '.'));
    const fat = F.fatigue(m, s.vmEx, { R: +L.R, surface: L.surface });
    return { title: api.name(), inf, grid: S.grid, fe: S.fe, mats: S.mats, setup: p.setup, target: +p.target || 2, s, res: S.stat.res, crit: S.crit, advice: advice(), vib: S.vib && { modes: S.vib.modes.map((x) => ({ f: x.f, axis: x.axis })), f: +p.vib.f || null, zeta: (+p.vib.zeta || 2) / 100 }, therm: S.therm && { T: S.therm.T, s: S.therm.res ? summary(S.fe, S.therm.res, S.mats, S.grid) : null }, life: { fat, cpd, ly: !fat.low && fat.N > 0 ? F.lifeYears(fat.N, cpd) : null, m }, alts: S.alts && S.alts.map((a) => ({ name: a.name, sum: a.sum, why: a.why })), approved: p.approved };
  }
  return { html, act, input, tap, draw, exit, get active() { return S.lab; }, get picking() { return !!S.pick; }, get state() { return S; }, invalidate() { if (S.lab) { exit(); } } };
}

/* ---------- PDF ---------- */
export function drawReport(D, shot) {
  const W = 1240, H = 1754, M = 70, pages = [];
  let g, y;
  const newPage = () => { const c = document.createElement('canvas'); c.width = W; c.height = H; g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, W, H); pages.push(c); y = M; g.fillStyle = '#64748b'; g.font = '20px sans-serif'; g.textAlign = 'right'; g.fillText('Çizim Atölyesi · Geleceğimi Göster test raporu · sayfa ' + pages.length, W - M, H - 36); g.textAlign = 'left'; };
  const need = (h) => { if (y + h > H - 90) newPage(); };
  const font = (s, b) => { g.font = (b ? 'bold ' : '') + s + 'px sans-serif'; };
  const wrap = (txt, x, maxW, size, color = '#0f172a', bold = false) => { font(size, bold); g.fillStyle = color; const lh = size * 1.35; let line = ''; for (const w of String(txt).split(/\s+/)) { const t = line ? line + ' ' + w : w; if (g.measureText(t).width > maxW && line) { need(lh); g.fillText(line, x, y); y += lh; line = w; } else line = t; } if (line) { need(lh); g.fillText(line, x, y); y += lh; } };
  const kv = (k, v, col = '#0f172a') => { need(40); font(22); g.fillStyle = '#334155'; let kk = String(k); while (g.measureText(kk).width > 640 && kk.length > 4) kk = kk.slice(0, -2); g.fillText(kk, M, y); font(22, true); g.fillStyle = col; g.textAlign = 'right'; g.fillText(String(v), W - M, y); g.textAlign = 'left'; g.strokeStyle = '#e2e8f0'; g.beginPath(); g.moveTo(M, y + 12); g.lineTo(W - M, y + 12); g.stroke(); y += 38; };
  const head = (t) => { y += 18; need(70); font(32, true); g.fillStyle = '#0f172a'; g.fillText(t, M, y); y += 42; };
  const s = D.s;
  newPage();
  font(44, true); g.fillStyle = '#0f172a'; g.fillText('SANAL TEST RAPORU', M, y + 30); y += 64;
  font(24); g.fillStyle = '#475569'; g.fillText(D.title + ' · ' + new Date().toLocaleString('tr-TR'), M, y); y += 46;
  const st = s.fosEx >= D.target ? ['GÜVENLİ', '#166534'] : s.fosEx >= 1 ? ['SINIRDA / RİSKLİ', '#b45309'] : ['AKAR / KIRILABİLİR', '#991b1b'];
  kv('Sonuç', st[0], st[1]); kv('Güvenlik katsayısı (hedef ' + nf(D.target, 1) + ')', f2(s.fosEx), st[1]);
  if (shot) { y += 10; const sw = W - 2 * M, sh = Math.min(560, sw * shot.height / shot.width); need(sh + 40); const k = Math.min(sw / shot.width, sh / shot.height); g.fillStyle = '#0b1220'; g.fillRect(M, y, sw, sh); g.drawImage(shot, M + (sw - shot.width * k) / 2, y + (sh - shot.height * k) / 2, shot.width * k, shot.height * k); y += sh + 30; wrap('von Mises gerilme dağılımı (mavi düşük → kırmızı yüksek), şekil değişimi abartılı', M, W - 2 * M, 18, '#64748b'); }
  head('Tasarım bilgileri');
  kv('Genel ölçü (X × Z × Y)', f0(D.inf.size[0]) + ' × ' + f0(D.inf.size[2]) + ' × ' + f0(D.inf.size[1]) + ' mm');
  kv('Parça sayısı', D.inf.parts.length); kv('Kütle (FEA ağı)', f2(s.mass) + ' kg');
  if (D.approved) kv('Tasarım onayı', new Date(D.approved.at).toLocaleString('tr-TR'));
  head('Malzemeler');
  for (const m of D.mats) kv(m.name, 'E ' + f0(m.E / 1000) + ' GPa · akma ' + f0(m.sy) + ' MPa · ρ ' + f2(m.rho) + ' g/cm³');
  for (const q of D.inf.parts) kv('  ' + q.name, q.matName);
  head('Uygulanan kuvvetler ve sabitlemeler');
  for (const x of D.setup.supports) kv('Sabitleme (ankastre)', x.label);
  for (const L of D.setup.loads) kv('Yük · ' + L.label, f0(L.N) + ' N ' + ({ '-y': '↓', '+y': '↑', '+x': '+X', '-x': '−X', '+z': '+Z', '-z': '−Z' })[L.dir]);
  kv('Öz ağırlık', D.setup.gravity ? 'dahil (' + f1(D.res.weightN || 0) + ' N)' : 'dahil değil');
  head('Test koşulları ve yöntem');
  kv('Analiz', 'Doğrusal-elastik statik FEA'); kv('Eleman', 'Küp (voxel) H8, uyumsuz modlu');
  kv('Ağ', f0(D.fe.ne) + ' eleman · ' + f0(D.fe.nn) + ' düğüm · ' + f2(D.grid.h) + ' mm'); kv('Çözücü', (D.res.converged ? 'yakınsadı' : 'TAM YAKINSAMADI') + ' · ' + D.res.iters + ' adım');
  kv('Denge kontrolü', 'uygulanan ' + f0(Math.hypot(...D.res.applied)) + ' N · tepki ' + f0(Math.hypot(...D.res.reaction)) + ' N');
  for (const q of D.grid.parts.filter((x) => x.poor)) wrap('⚠ ' + q.name + ': ağda iyi temsil edilmiyor (hacim farkı %' + Math.round(Math.abs(q.err) * 100) + ') — bu parçanın sonucu güvenilir değil.', M, W - 2 * M, 20, '#b45309');
  head('Gerilme ve deformasyon sonuçları');
  kv('En yüksek von Mises (tekillik hariç)', f1(s.vmEx) + ' MPa'); kv('Yük / mesnet çevresi dahil tepe', f1(s.vmax) + ' MPa');
  kv('Güvenlik katsayısı (tepe dahil)', f2(s.fos)); kv('En büyük yer değiştirme', fmm(s.maxU)); kv('Boy / sehim', s.maxU > 0 ? '1/' + f0(s.span / s.maxU) : '—');
  head('Kritik bölgeler');
  D.crit.forEach((c, i) => kv((i + 1) + '. ' + (D.grid.parts[c.partIdx] ? D.grid.parts[c.partIdx].name : '') + ' · X ' + f0(c.at[0]) + ' Y ' + f0(c.at[1]) + ' Z ' + f0(c.at[2]) + (c.nearBC ? ' (mesnet/yük yakını)' : ''), f0(c.vm) + ' MPa · %' + Math.round(c.util * 100), c.util >= 1 ? '#991b1b' : '#0f172a'));
  if (D.vib) {
    head('Titreşim');
    D.vib.modes.forEach((m, i) => { const r = D.vib.f ? F.resonance(m.f, D.vib.f, D.vib.zeta) : null; kv((i + 1) + '. doğal frekans', f1(m.f) + ' Hz' + (r ? ' · büyütme ×' + f1(r.daf) + (r.level === 'crit' ? ' REZONANS' : '') : ''), r && r.level === 'crit' ? '#991b1b' : '#0f172a'); });
    if (D.vib.f) kv('Uyarı frekansı', f1(D.vib.f) + ' Hz · sönüm %' + f1(D.vib.zeta * 100));
  }
  if (D.therm) { head('Sıcaklık'); kv('Çalışma sıcaklığı', f0(D.therm.T) + ' °C (referans 20 °C)'); if (D.therm.s) { kv('Isıl gerilme (en yüksek)', f1(D.therm.s.vmEx) + ' MPa'); kv('Isıl yer değiştirme', fmm(D.therm.s.maxU)); } for (const m of D.mats) if (D.therm.T > m.Tmax && !F.tempFactors(m.id, D.therm.T)) wrap('⚠ ' + m.name + ': önerilen üst sıcaklık ' + f0(m.Tmax) + ' °C aşıldı; dayanım verisi yok.', M, W - 2 * M, 20, '#991b1b'); }
  head('Yorulma ömrü (YAKLAŞIK)');
  const fa = D.life.fat;
  kv('Malzeme / gerilme', D.life.m.name + ' · ' + f0(fa.sa) + ' MPa genlik');
  kv('Tahmini dayanılan tekrar', fa.low ? '< 1000' : fN(fa.N));
  if (D.life.ly) kv('Kullanım ömrü (günde ' + f0(D.life.cpd) + ')', D.life.ly.inf ? 'yorulma sınırı altında' : fyr(D.life.ly.lo) + ' … ' + fyr(D.life.ly.hi));
  else wrap('Kullanım sıklığı girilmedi; süre olarak ömür iddia edilmedi.', M, W - 2 * M, 20, '#475569');
  head('İyileştirme önerileri');
  for (const a of D.advice) { wrap((a.sev === 'crit' ? '🔴 ' : a.sev === 'warn' ? '🟠 ' : '• ') + a.t, M, W - 2 * M, 22, '#0f172a', true); wrap('Neden: ' + a.why, M + 20, W - 2 * M - 20, 20, '#334155'); wrap('Öneri: ' + a.fix, M + 20, W - 2 * M - 20, 20, '#334155'); y += 6; }
  if (D.alts) { head('Alternatif tasarımlar (ayrı kopyalar)'); for (const a of D.alts) { kv(a.name, f2(a.sum.mass) + ' kg · ' + f0(a.sum.vmEx) + ' MPa · GK ' + f2(a.sum.fosEx) + ' · ' + fmm(a.sum.maxU)); } }
  head('Doğrulama ve sınırlamalar');
  wrap('Sayısal hesap (FEA) analitik çözümlerle doğrulandı:', M, W - 2 * M, 20, '#0f172a', true);
  for (const [k, v] of VALIDATION) kv(k, v);
  wrap('Yaklaşık / ampirik: yorulma (S-N), aşınma (Archard), yüksek sıcaklık dayanımı, rezonans büyütmesi, tipik malzeme değerleri. Hesaplanmayan: akma sonrası davranış, burkulma, temas ve cıvata ön yükü, kaynak dikişi, darbe, sıcaklık dağılımı. Parçalar birbirine tam bağlı kabul edildi.', M, W - 2 * M, 20, '#334155');
  y += 8; wrap('Bu rapor bir ön değerlendirmedir ve profesyonel mühendislik onayının yerine geçmez. İnsan güvenliğini etkileyen ya da yük taşıyan parçalar yetkili bir mühendise onaylatılmalıdır.', M, W - 2 * M, 20, '#991b1b', true);
  return pages;
}
