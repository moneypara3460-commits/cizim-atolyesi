// Hesap hattı (işçi ve yedek ana iş parçacığı aynı kodu kullanır): plan → çarpışma → simülasyon → kontrolcü uygunluğu.
// Arayüze yalnız düz veri (typed array) gider; G-kodu için sonuç "keep" içinde saklanır.
export function runPlan(job, L, prog = () => {}) {
  prog({ step: 'Takım yolu ve kinematik', f: 0.1 });
  const R = L.plan5(job);
  prog({ step: 'Çarpışma kontrolü', f: 0.45 });
  const safety = L.checkCollisions(R, job);
  prog({ step: 'Talaş kaldırma simülasyonu', f: 0.65 });
  const sim = L.simulate5(R, job);
  const risk = L.risk5 ? L.risk5(R, safety, job) : null;
  const n = R.cl.length, rn = (R.machine.rot || []).map((r) => r.name);
  const pts = new Float32Array(n * 3), dirs = new Float32Array(n * 3), kinds = new Uint8Array(n), tool = new Int32Array(n), flags = new Uint8Array(n), ax = new Float32Array(n * 6);
  for (let i = 0; i < n; i++) {
    const c = R.cl[i]; pts.set(c.p, i * 3); dirs.set(c.v, i * 3);
    kinds[i] = c.k === 'r' ? 0 : c.k === 'p' ? 2 : 1; tool[i] = c.tool;
    const a = R.ax[i]; if (a) { ax[i * 6] = a.X; ax[i * 6 + 1] = a.Y; ax[i * 6 + 2] = a.Z; ax[i * 6 + 3] = a.A || 0; ax[i * 6 + 4] = a.B || 0; ax[i * 6 + 5] = a.C || 0; }
  }
  for (const h of safety.hits) if (h.i < n) flags[h.i] |= h.k === 'limit' ? 2 : 1;
  const posts = {};
  for (const k of Object.keys(L.POSTS5)) posts[k] = L.canPost(R, k, safety);
  const grp = {};
  for (const h of safety.hits) { const key = h.comp + ' ↔ ' + h.obj; grp[key] = (grp[key] || 0) + 1; }
  const S = R.S;
  const out = {
    S: { T: S.T, stock: S.stock, fix: S.fix, bounds: S.bounds, t: S.t },
    pts, dirs, kinds, tool, flags, ax, rot: rn,
    passes: R.passes, ops: R.ops, warn: R.warn, simulMoves: R.simulMoves, limitN: R.limitViolations.length,
    limitFirst: R.limitViolations.slice(0, 5),
    stats: L.stats5(R, job.rapid || 5000),
    coll: { safe: safety.safe, n: safety.hits.length, groups: grp, first: safety.hits.slice(0, 8), coverage: safety.coverage },
    sim: { h: sim.h, removedVol: sim.removedVol, leftVol: sim.leftVol, gougeVol: sim.gougeVol, leftPct: sim.leftPct, points: sim.points, kinds: sim.kinds },
    posts, machine: R.machine,
    risk: risk ? { count: risk.count, lv: Uint8Array.from(risk.points, (r) => r.lvl), list: risk.points.map((r, i) => [i, r.lvl, r.why]).filter((x) => x[1] > 0).sort((a, b) => b[1] - a[1] || a[0] - b[0]).slice(0, 300) } : null,
  };
  prog({ step: 'Bitti', f: 1 });
  return { out, keep: { R, job, safety, risk }, transfer: [pts.buffer, dirs.buffer, kinds.buffer, tool.buffer, flags.buffer, ax.buffer, sim.points.buffer, sim.kinds.buffer] };
}

// G-kodu (işçi ve yedek aynı kod): args = { post, opt: { date, allowUnsafe, dryRun: { clear }, slowRisk, valuable, firstPass } }
// Kuru çalıştırmada yol dryShift5 ile kaydırılır, kinematik ve çarpışma yeniden denetlenir; güvenli değilse hata.
// Sonuç: { text, trace (her satırın CL indisi), lv (her satırın risk düzeyi), dry: { d } }
export function runGcode(keep, args, L) {
  if (!keep) throw new Error('Önce takım yolunu hesapla');
  const o = { ...(args.opt || {}) }, trace = [];
  let R = keep.R, safety = keep.safety;
  if (o.dryRun) {
    const D = L.dryShift5(keep.R, keep.job, o.dryRun.clear);
    if (!D.ok) throw new Error('Kuru çalıştırma programı verilemez: ' + D.why);
    R = D.R; safety = D.safety; o.dry = { d: D.d, clear: D.clear }; o.slow = null; o.firstPass = 0; o.valuable = false;
  } else if ((o.slowRisk || o.valuable) && keep.risk) o.slow = { risk: keep.risk, f: o.slowF || 0.5 };
  delete o.dryRun;
  const text = L.gcode5(R, keep.job, args.post, safety, { ...o, trace });
  const lv = trace.map((i) => (i == null || o.dry || !keep.risk ? 0 : keep.risk.points[i].lvl));
  return { text, trace, lv, dry: o.dry || null };
}
