// 📐 Analiz hesap hattı: ağ → çözüm → görüntülenecek düğüm alanları. İşçi (fem-worker.js) ve yedek ana iş parçacığı aynı kodu kullanır.
// Girdiler iç birimlerde (mm, N, MPa, °C, W). Çıktılar düz veri (typed array) + özet.
// a: { type, items: [{ id, name, tris, mat }], mats: [solverMat], target (eleman sayısı), setup, modes }
export function runFEM(F, X, a, prog = () => {}) {
  prog('Ağ oluşturuluyor', 0.05);
  let grid;
  try { grid = F.voxelize(a.items, { target: a.target }); } catch (e) { return { error: 'mesh', text: 'Ağ oluşturulamadı: ' + e.message }; }
  const fe = F.buildFE(grid), quads = F.surfaceQuads(fe, grid), mesh = X.meshInfo(grid, fe);
  if (!fe.ne) return { error: 'mesh', text: 'Ağ oluşturulamadı: model hiç eleman içermiyor.', mesh };
  const out = { mesh, view: { xyz: Float32Array.from(fe.xyz), nn: fe.nn, h: fe.h, quads: quads.quads }, transfer: [] };
  if (a.type === 'mesh') return out;   // yalnız ağ (önizleme / nokta seçimi için)
  const s = a.setup || {};
  const markLoads = (loads) => (loads || []).map((L) => {
    const ns = F.selectNodes(fe, L.sel); if (!ns.length) return null;
    const c = [0, 1, 2].map((k) => ns.reduce((t, n) => t + fe.xyz[n * 3 + k], 0) / ns.length);
    let dir = L.dir || [0, -1, 0];
    if (L.type === 'pressure') { const q = X.selQuads(fe, quads, L.sel); if (q.length) dir = q[0].n.map((v) => (L.p >= 0 ? -v : v)); }
    if (L.type === 'moment') { const m = Math.hypot(...L.M) || 1; dir = L.M.map((v) => v / m); }
    return { p: c, dir, kind: L.type || 'force' };
  }).filter(Boolean);
  const supNodes = (sels) => { const o = []; for (const sel of sels || []) o.push(...F.selectNodes(fe, sel)); return [...new Set(o)].slice(0, 20000); };
  const nodal = (ev) => F.nodalAvg(fe, ev);
  prog('Çözülüyor', 0.2);
  const pr = (it, r) => prog('Çözülüyor · adım ' + it + (isFinite(r) && r < 1 ? ' · hata ' + r.toExponential(1) : ''), 0.2 + Math.min(0.7, it / 200));
  if (a.type === 'static' || a.type === 'buckling') {
    let r;
    try { r = X.solveStatic2(fe, quads, a.mats, s, { onProgress: pr }); } catch (e) { return { ...out, error: 'input', text: e.message }; }
    if (r.error) return { ...out, error: r.error, text: r.text };
    const sum = X.stressSummary(fe, r, a.mats);
    const warn = [...mesh.warn, ...sum.warn];
    if (r.equilibriumErr > 1e-3) warn.push({ sev: 'warn', t: 'Denge hatası %' + (r.equilibriumErr * 100).toFixed(2) + ' (mesnet tepkisi ≠ uygulanan yük): sonuçlara güvenme.' });
    if (r.fallback) warn.push({ sev: 'info', t: 'Çok katmanlı ön koşullayıcı yakınsamadı; basit yöntemle yeniden çözüldü.' });
    const fosE = new Float32Array(fe.ne); for (let e = 0; e < fe.ne; e++) { const sy = a.mats[fe.elMat[e]].sy; fosE[e] = sy > 0 && r.vm[e] > 0 ? Math.min(sy / r.vm[e], 100) : 100; }
    const st = { u: r.u, vm: nodal(r.vm), fos: sum.fos != null ? nodal(fosE) : null, maxU: r.maxU, vmax: sum.vmax, vEx: sum.vEx, p995: sum.p995, fosEx: sum.fos, fosAll: sum.fosAll, reaction: r.reaction, applied: r.applied, eqErr: r.equilibriumErr, iters: r.iters, res: r.res, weightN: r.weightN };
    out.marks = { sup: supNodes(s.supports), loads: markLoads(s.loads) };
    if (a.type === 'static') {
      out.res = { ...st, warn };
      out.transfer.push(st.u.buffer, st.vm.buffer); if (st.fos) out.transfer.push(st.fos.buffer);
      return out;
    }
    prog('Burkulma özdeğerleri', 0.5);
    const bk = X.solveBuckling(fe, a.mats, s, r, { modes: a.modes || 3, onProgress: (it, l) => prog('Burkulma · yineleme ' + it + ' · λ₁ ≈ ' + (isFinite(l) ? l.toPrecision(4) : '?'), 0.5 + Math.min(0.45, it / 40)) });
    if (bk.error) return { ...out, error: bk.error, text: bk.text };
    out.res = { modes: bk.modes.map((m) => ({ lambda: m.lambda, phi: m.phi })), ref: { maxU: st.maxU, vmax: st.vmax }, warn: [...warn, ...(bk.modes.some((m) => m.lambda < 1) ? [{ sev: 'crit', t: 'λ₁ < 1: referans yük, doğrusal kritik yükün üstünde (ideal geometride bile burkulur).' }] : [])] };
    for (const m of out.res.modes) out.transfer.push(m.phi.buffer);
    return out;
  }
  if (a.type === 'modal') {
    const r = F.solveModal(fe, a.mats, { supports: s.supports || [] }, { modes: a.modes || 4, vectors: (a.modes || 4) + 4, onProgress: (it, l) => prog('Modal · yineleme ' + it, 0.2 + Math.min(0.7, it / 20)) });
    if (r.error) return { ...out, error: r.error, text: r.text };
    if (!r.converged) return { ...out, error: 'noconv', text: 'Özdeğerler yakınsamadı: sonuç gösterilmiyor. Daha az mod iste ya da mesnetleri kontrol et.' };
    out.res = { modes: r.modes.map((m) => ({ f: m.f, phi: m.phi, vm: nodal(m.vm) })), massKg: r.massKg, warn: [...mesh.warn] };
    out.marks = { sup: supNodes(s.supports), loads: [] };
    for (const m of out.res.modes) out.transfer.push(m.phi.buffer, m.vm.buffer);
    return out;
  }
  if (a.type === 'thermal' || a.type === 'thermalT') {
    const r = X.solveThermal(fe, quads, a.mats, { ...s, transient: a.type === 'thermalT' ? s.transient : null }, { onProgress: (st, f) => prog('Zaman adımı ' + st, 0.2 + 0.7 * f) });
    if (r.error) return { ...out, error: r.error, text: r.text };
    out.marks = { sup: supNodes((s.fixed || []).map((c) => c.sel)), loads: markLoads([...(s.flux || []).map((q) => ({ sel: q.sel, type: 'pressure', p: -1 })), ...(s.conv || []).map((q) => ({ sel: q.sel, type: 'pressure', p: 1 }))]) };
    if (a.type === 'thermal') {
      const qm = new Float32Array(fe.ne); for (let e = 0; e < fe.ne; e++) qm[e] = Math.hypot(r.q[e * 3], r.q[e * 3 + 1], r.q[e * 3 + 2]);
      out.res = { T: r.T, q: nodal(qm), tmin: r.tmin, tmax: r.tmax, heat: r.heat, iters: r.iters, warn: [...mesh.warn] };
      out.transfer.push(r.T.buffer, out.res.q.buffer);
    } else {
      out.res = { frames: r.frames, tmin: r.tmin, tmax: r.tmax, warn: [...mesh.warn, { sev: 'info', t: 'Zaman ayrıklaştırması geri Euler (1. mertebe): zaman adımı küçüldükçe sonuç değişiyorsa adımı küçült.' }] };
      for (const fr of r.frames) out.transfer.push(fr.T.buffer);
    }
    return out;
  }
  return { ...out, error: 'type', text: 'Bu analiz türü desteklenmiyor: ' + a.type };
}

// ağ yakınsama çalışması: aynı analiz üç ağda; izlenen büyüklükler ve değişim oranı
export function convStudy(F, X, a, prog = () => {}) {
  const targets = a.targets || [Math.round(a.target / 4), Math.round(a.target / 2), a.target];
  const metric = (r) => {
    if (a.type === 'static') return [['En büyük yer değiştirme', r.res.maxU, 'mm'], ['von Mises (%99,5 değeri)', r.res.p995, 'MPa'], ['En büyük von Mises', r.res.vmax, 'MPa']];
    if (a.type === 'modal') return [['1. frekans', r.res.modes[0] ? r.res.modes[0].f : NaN, 'Hz']];
    if (a.type === 'thermal') return [['En yüksek sıcaklık', r.res.tmax, '°C'], ['En düşük sıcaklık', r.res.tmin, '°C']];
    if (a.type === 'buckling') return [['λ₁', r.res.modes[0].lambda, '']];
    return [];
  };
  const rows = [];
  for (const [i, t] of targets.entries()) {
    prog('Ağ ' + (i + 1) + ' / ' + targets.length, i / targets.length);
    const r = runFEM(F, X, { ...a, target: t });
    if (r.error) return { error: r.error, text: 'Ağ ' + (i + 1) + ': ' + r.text };
    rows.push({ target: t, ne: r.mesh.ne, h: r.mesh.h, m: metric(r) });
  }
  const names = rows[0].m.map((x) => x[0]), out = names.map((nm, k) => {
    const vals = rows.map((r) => r.m[k][1]), ch = vals.slice(1).map((v, i) => Math.abs(v - vals[i]) / (Math.abs(v) || 1));
    const conv = ch[ch.length - 1] < 0.03, div = ch.length > 1 && ch[ch.length - 1] >= ch[ch.length - 2] * 0.9 && !conv;
    return { name: nm, unit: rows[0].m[k][2], vals, changes: ch, converged: conv, diverging: div };
  });
  return { rows: rows.map((r) => ({ ne: r.ne, h: r.h })), metrics: out };
}
