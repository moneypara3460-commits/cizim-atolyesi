// CNC TORNA çalışma alanı (CNC sekmesi → Torna): makine, ham, parça profili, takım kütüphanesi, operasyonlar,
// takım yolu (2B X-Z ve 3B), malzeme kaldırma simülasyonu, G-kodu, hata / güvenlik uyarıları, OCCT doğrulaması.
// Hesap: lathe.js (saf). Simülasyon ve G-kodu aynı hareket listesini kullanır.
// api: { THREE, group, hideModel(on), fit(box), render(), toast(m), saveBlob(b, n), name(), parts() → parça listesi, occt(op, args) }
import * as L from './lathe.js?v=20261112t';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const nf = (v, d = 2) => (v == null || !isFinite(v) ? '—' : (Math.round(v * 10 ** d) / 10 ** d).toLocaleString('tr-TR', { maximumFractionDigits: d }));
const fsec = (s) => (s < 60 ? Math.round(s) + ' sn' : Math.floor(s / 60) + ' dk ' + Math.round(s % 60) + ' sn');
const KEY = 'cizim:lathe';
const clone = (o) => JSON.parse(JSON.stringify(o));
const OPC = [0x38bdf8, 0x22c55e, 0xf59e0b, 0xa78bfa, 0xf472b6, 0x2dd4bf, 0xfb7185, 0xfacc15, 0x60a5fa, 0x4ade80, 0xc084fc];

function load() { try { const o = JSON.parse(localStorage.getItem(KEY) || 'null'); if (o && o.stock && o.ops && o.tools) return { ...L.exampleJob(), ...o }; } catch (e) { /* */ } return { ...L.exampleJob(), res: 0.1, lineNumbers: false }; }

export function createLatheUI(api) {
  let job = load();
  const S = { on: false, busy: null, R: null, issues: null, ev: null, time: null, code: null, cons: null, view: 'path', play: null, playing: false, speed: 4, occt: null, showScope: false, codeAll: false, err: null };
  const T = api.THREE;
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(job)); } catch (e) { /* */ } };
  const invalidate = () => { stopPlay(); S.R = null; S.issues = null; S.ev = null; S.code = null; S.cons = null; S.play = null; S.occt = null; S.final = null; drawStatic(); };
  const changed = () => { save(); invalidate(); };
  const M = () => L.LATHE_MACHINES[job.mk] || L.LATHE_MACHINES.fanuc2x;
  const hasErr = () => !!(S.issues && S.issues.some((x) => x.level === 'hata'));

  /* ---------- hesap ---------- */
  async function compute() {
    stopPlay(); S.err = null; S.busy = 'Takım yolları hesaplanıyor…'; api.render();
    await new Promise((r) => setTimeout(r, 20));
    try {
      const R = L.planLathe(job);
      if (!R.ok) { S.R = null; S.issues = R.issues; S.busy = null; drawStatic(); api.render(); return; }
      const sim = L.createSim(R, { res: job.res || 0.1 });
      // simülasyon dilimler hâlinde: sayfa donmaz
      while (!sim.done) { const t0 = performance.now(); while (!sim.done && performance.now() - t0 < 40) sim.step(8); S.busy = `Simülasyon: ${sim.st.i} / ${R.moves.length} hareket`; api.render(); await new Promise((r) => setTimeout(r, 0)); }
      const ev = L.evaluateSim(R, sim);
      const issues = [...R.issues, ...sim.events.map((e) => ({ level: e.level, where: `${(e.op ?? 0) + 1}. ${L.OP_NAMES_L[job.ops[e.op]?.type] || ''} (hareket ${e.move + 1})`, msg: e.msg }))];
      if (ev.gougeArea > 0) issues.push({ level: 'hata', where: 'Simülasyon', msg: `Parça profiline girildi (fazla kesim): kesit ${nf(ev.gougeArea)} mm², Z ${nf(ev.gougeZ[1])} … ${nf(ev.gougeZ[0])}` });
      if (ev.residualArea > 0) issues.push({ level: 'uyarı', where: 'Simülasyon', msg: `Hedef profil dışında malzeme kaldı: kesit ${nf(ev.residualArea)} mm², Z ${nf(ev.residualZ[1])} … ${nf(ev.residualZ[0])}` });
      S.R = R; S.final = sim; S.ev = ev; S.issues = issues; S.time = L.cycleTime(R);
      recode();
      S.view = 'path'; S.play = null;
    } catch (e) { S.R = null; S.err = 'Hesaplanamadı: ' + e.message; }
    S.busy = null; draw(); api.render();
  }
  function recode() {
    if (!S.R) return;
    try {
      const g = L.postLathe(S.R, { date: new Date().toLocaleDateString('tr-TR'), lineNumbers: !!job.lineNumbers });
      S.code = g.text;
      const b = L.parseLatheGcode(g.text, { radius: job.xMode === 'radius', homeR: M().xMax / 2, homeZ: M().zMax });
      const ctl = job.ops.some((o) => o.on !== false && o.comp === 'control' && (o.type === 'finish' || o.type === 'profile'));
      S.cons = ctl ? { skipped: true } : L.compareMoves(S.R.moves, b.moves, false);
    } catch (e) { S.code = null; S.cons = null; S.issues = [...(S.issues || []), { level: 'hata', where: 'G-kodu', msg: e.message }]; }
  }

  /* ---------- 3B ---------- */
  const G3 = { root: null, stock: null, path: null, tool: null, chuck: null, ghost: null };
  function clear3() { api.group.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); }); api.group.clear(); Object.assign(G3, { root: null, stock: null, path: null, tool: null, chuck: null, ghost: null }); }
  // dönel yüzey: profil [z, r] zinciri → sahne (x = z, y = r cosθ, z = r sinθ)
  function revolveGeo(chain, seg = 40) {
    const pos = [], idx = [], n = chain.length;
    for (let i = 0; i < n; i++) for (let k = 0; k < seg; k++) { const a = (k / seg) * Math.PI * 2; pos.push(chain[i][0], chain[i][1] * Math.cos(a), chain[i][1] * Math.sin(a)); }
    for (let i = 0; i < n - 1; i++) for (let k = 0; k < seg; k++) { const a = i * seg + k, b = i * seg + ((k + 1) % seg), c = a + seg, d = b + seg; idx.push(a, b, c, b, d, c); }
    const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals(); return g;
  }
  // kapalı kesit zinciri (dış önden arkaya, arka yüz, iç arkadan öne, ön yüz)
  function closedChain(outer, inner) {
    const o = simplify(outer), i = simplify(inner).reverse();
    return [[o[0][0], i[i.length - 1][1]], ...o, [o[o.length - 1][0], i[0][1]], ...i, [o[0][0], i[i.length - 1][1]]];
  }
  function simplify(pts, tol = 0.02) {
    if (pts.length < 3) return pts.slice();
    const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1; const st = [[0, pts.length - 1]];
    while (st.length) { const [a, b] = st.pop(); let m = 0, mi = -1; const A = pts[a], B = pts[b], dx = B[0] - A[0], dy = B[1] - A[1], l = Math.hypot(dx, dy) || 1; for (let k = a + 1; k < b; k++) { const d = Math.abs((pts[k][0] - A[0]) * dy - (pts[k][1] - A[1]) * dx) / l; if (d > m) { m = d; mi = k; } } if (m > tol) { keep[mi] = 1; st.push([a, mi], [mi, b]); } }
    return pts.filter((_, k) => keep[k]);
  }
  function stockChain(sim) { const p = L.simProfile(sim, 1); return closedChain(p.outer.slice().reverse(), p.inner.slice().reverse()); }
  function targetChain() {
    const Gm = L.partGeometry(job), od = L.samplePath(Gm.od, 0.3), id = Gm.id.length ? L.samplePath(Gm.id, 0.3) : [[0, 0], [-job.partLen, 0]];
    const zEnd = od[od.length - 1][0], inner = id.filter((p) => p[0] >= zEnd - 1e-9); if (inner[inner.length - 1][0] > zEnd + 1e-6) inner.push([zEnd, 0]);
    return [[od[0][0], inner[0][1]], ...od, [zEnd, inner[inner.length - 1][1]], ...inner.slice().reverse(), [od[0][0], inner[0][1]]];
  }
  function buildBase() {
    clear3(); api.hideModel(true);
    const root = new T.Group(); api.group.add(root); G3.root = root;
    const s = job.stock, ch = job.chuck || {}, zc = -s.stickout;
    // ayna gövdesi + 3 çene (dönüş görünsün)
    const spin = new T.Group(); root.add(spin); G3.chuck = spin;
    const body = new T.Mesh(new T.CylinderGeometry((ch.bodyD || 200) / 2, (ch.bodyD || 200) / 2, ch.bodyLen || 80, 48), new T.MeshStandardMaterial({ color: 0x475569, metalness: 0.4, roughness: 0.6 }));
    body.rotation.z = Math.PI / 2; body.position.x = zc - (ch.jawLen || 30) - (ch.bodyLen || 80) / 2; spin.add(body);
    for (let k = 0; k < 3; k++) { const a = (k * 2 * Math.PI) / 3, h = Math.max(4, (ch.jawD || 110) / 2 - s.d / 2), j = new T.Mesh(new T.BoxGeometry(ch.jawLen || 30, h, Math.min(30, s.d * 0.6)), new T.MeshStandardMaterial({ color: 0x64748b, metalness: 0.4, roughness: 0.5 })); const rm = s.d / 2 + h / 2; j.position.set(zc - (ch.jawLen || 30) / 2, rm * Math.cos(a), rm * Math.sin(a)); j.rotation.x = a; spin.add(j); }
    // eksen çizgisi
    const ax = new T.BufferGeometry().setFromPoints([new T.Vector3(zc - 120, 0, 0), new T.Vector3(s.face + 40, 0, 0)]);
    root.add(new T.Line(ax, new T.LineDashedMaterial({ color: 0x64748b, dashSize: 4, gapSize: 3 })).computeLineDistances());
    return root;
  }
  function setStock(chain, color = 0x94a3b8, opacity = 1) {
    if (G3.stock) { G3.chuck.remove(G3.stock); G3.stock.geometry.dispose(); G3.stock.material.dispose(); }
    G3.stock = new T.Mesh(revolveGeo(chain), new T.MeshStandardMaterial({ color, metalness: 0.35, roughness: 0.45, side: T.DoubleSide, transparent: opacity < 1, opacity }));
    G3.chuck.add(G3.stock);
  }
  function rawStockChain() { const s = job.stock, r = s.d / 2, rb = (s.bore || 0) / 2; return [[s.face, rb], [s.face, r], [s.face - s.len, r], [s.face - s.len, rb], [s.face, rb]]; }
  function drawPath(upTo = Infinity) {
    if (G3.path) { G3.root.remove(G3.path); G3.path.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); }); }
    const g = new T.Group(); G3.path = g; G3.root.add(g);
    if (!S.R) return;
    const rap = [], byOp = new Map(); let prev = S.R.moves[0].p;
    S.R.moves.forEach((m, i) => {
      if (i === 0 || i > upTo) { prev = m.p; return; }
      const a = prev, b = m.p, clampR = (p) => [p[0], Math.min(p[1], job.stock.d / 2 + 40)];
      if (m.g === 0) { const A = clampR(a), B = clampR(b); rap.push(A[0], A[1], 0, B[0], B[1], 0); }
      else { const arr = byOp.get(m.op) || byOp.set(m.op, []).get(m.op); if (m.g === 2 || m.g === 3) { const pts = L.sampleElem({ t: 'A', a, b, c: m.c, R: Math.hypot(a[0] - m.c[0], a[1] - m.c[1]), cw: m.cw }, 0.2); for (let k = 1; k < pts.length; k++) arr.push(pts[k - 1][0], pts[k - 1][1], 0, pts[k][0], pts[k][1], 0); } else arr.push(a[0], a[1], 0, b[0], b[1], 0); }
      prev = b;
    });
    const seg = (arr, mat) => { if (!arr.length) return; const ge = new T.BufferGeometry(); ge.setAttribute('position', new T.Float32BufferAttribute(arr, 3)); const l = new T.LineSegments(ge, mat); if (mat.isLineDashedMaterial) l.computeLineDistances(); g.add(l); };
    seg(rap, new T.LineDashedMaterial({ color: 0xef4444, dashSize: 2, gapSize: 2, transparent: true, opacity: 0.55 }));
    for (const [op, arr] of byOp) seg(arr, new T.LineBasicMaterial({ color: OPC[op % OPC.length] }));
  }
  function setTool(t, p) {
    if (G3.tool) { G3.root.remove(G3.tool); G3.tool.geometry.dispose(); G3.tool.material.dispose(); G3.tool = null; }
    if (!t || !p) return;
    const sh = L.toolShape(t, 6), shape = new T.Shape(); sh.forEach((q, k) => (k ? shape.lineTo(q[0], q[1]) : shape.moveTo(q[0], q[1])));
    if (['od', 'face', 'thread', 'groove', 'part'].includes(t.type)) { const hz = L.holderZone(t); const top = sh.reduce((m, q) => Math.max(m, q[1]), 0); shape.lineTo(hz.z1, top); shape.lineTo(hz.z1, top + 22); shape.lineTo(Math.min(hz.z0, sh[0][0]), top + 22); }
    const geo = new T.ExtrudeGeometry(shape, { depth: 4, bevelEnabled: false }); geo.translate(0, 0, -2);
    G3.tool = new T.Mesh(geo, new T.MeshStandardMaterial({ color: 0xfbbf24, metalness: 0.3, roughness: 0.5 })); G3.tool.position.set(p[0], Math.min(p[1], job.stock.d / 2 + 40), 0); G3.root.add(G3.tool);
  }
  function fitView() { const s = job.stock; api.fit(new T.Box3(new T.Vector3(-s.stickout - 20, -s.d / 2 - 15, -s.d / 2 - 15), new T.Vector3(s.face + 25, s.d / 2 + 25, s.d / 2 + 15))); }
  function drawStatic() { if (!S.on) return; try { buildBase(); setStock(rawStockChain(), 0x94a3b8, 0.35); try { const g = new T.Mesh(revolveGeo(targetChain()), new T.MeshStandardMaterial({ color: 0x5eead4, metalness: 0.2, roughness: 0.5, side: T.DoubleSide })); G3.chuck.add(g); G3.ghost = g; } catch (e) { /* profil geçersiz */ } } catch (e) { /* */ } }
  function draw() {
    if (!S.on) return;
    if (!S.R) { drawStatic(); return; }
    buildBase();
    if (S.view === 'path') { setStock(targetChain(), 0x5eead4, 1); drawPath(); setTool(null); }
    else if (S.view === 'final') { setStock(stockChain(S.final), 0x94a3b8, 1); setTool(null); }
    else if (S.view === 'sim' && S.play) { setStock(stockChain(S.play.sim), 0x94a3b8, 1); drawPath(S.play.sim.st.i); const m = S.R.moves[Math.max(0, S.play.sim.st.i - 1)]; setTool(job.tools.find((t) => t.id === m.tool), S.play.sim.st.prev); }
  }

  /* ---------- oynatma ---------- */
  let raf = 0, lastGeo = 0;
  function stopPlay() { S.playing = false; if (raf) { cancelAnimationFrame(raf); raf = 0; } }
  function startSim(from = 0) { if (!S.R) return; S.play = { sim: L.createSim(S.R, { res: job.res || 0.1 }) }; if (from > 0) S.play.sim.step(from); S.view = 'sim'; draw(); }
  function loop() {
    if (!S.playing || !S.play) { raf = 0; return; }
    const sim = S.play.sim; sim.step(S.speed);
    if (G3.chuck) G3.chuck.rotation.x += 0.35;
    const now = performance.now();
    if (now - lastGeo > 90 || sim.done) { lastGeo = now; setStock(stockChain(sim), 0x94a3b8, 1); drawPath(sim.st.i); }
    const m = S.R.moves[Math.max(0, sim.st.i - 1)]; setTool(job.tools.find((t) => t.id === m.tool), sim.st.prev); readout();
    if (sim.done) { S.playing = false; raf = 0; api.render(); return; }
    raf = requestAnimationFrame(loop);
  }
  function readoutText() {
    if (!S.R || !S.play) return '';
    const i = Math.max(0, S.play.sim.st.i - 1), m = S.R.moves[i], o = job.ops[m.op], rad = job.xMode === 'radius';
    return `<b>${i + 1} / ${S.R.moves.length}</b> · ${m.op >= 0 ? (m.op + 1) + '. ' + esc(L.OP_NAMES_L[o.type]) : 'referans'} · ${['G00 hızlı', 'G01', 'G02', 'G03'][m.g] || 'G32 diş'}<br><span style="font-family:monospace">X${nf((rad ? 1 : 2) * m.p[1], 3)} Z${nf(m.p[0], 3)}</span>`;
  }
  function readout() { const el = document.getElementById('lz-ro'); if (el) el.innerHTML = readoutText(); const sl = document.querySelector('[data-lz="pos"]'); if (sl) sl.value = S.play ? S.play.sim.st.i : 0; }

  /* ---------- 2B X-Z önizleme (profil, ham, ayna, takım yolu) ---------- */
  function svg2d() {
    const s = job.stock, Rs = s.d / 2, z0 = s.face - s.len, z1 = s.face + 12, W = 340, pad = 6, k = (W - 2 * pad) / (z1 - z0), H = (Rs + 14) * k + 2 * pad;
    const X = (z) => pad + (z - z0) * k, Y = (r) => H - pad - r * k, P = (p) => X(p[0]).toFixed(1) + ' ' + Y(p[1]).toFixed(1);
    let h = `<svg viewBox="0 0 ${W} ${H.toFixed(0)}" style="flex:1 0 100%;width:100%;background:#0b1220;border:1px solid #1e293b;border-radius:10px" id="lz-svg">`;
    h += `<rect x="${X(z0)}" y="${Y(Rs)}" width="${(s.len) * k}" height="${(Rs - (s.bore || 0) / 2) * k}" fill="#1e293b" stroke="#475569" stroke-width="0.6"/>`;
    h += `<rect x="${X(z0)}" y="${Y((job.chuck.jawD || 110) / 2)}" width="${Math.max(0, (-s.stickout - z0)) * k}" height="${Math.max(0, ((job.chuck.jawD || 110) / 2 - Rs)) * k}" fill="#7c3aed" opacity="0.5"/>`;
    h += `<line x1="${X(z0)}" y1="${Y(0)}" x2="${X(z1)}" y2="${Y(0)}" stroke="#64748b" stroke-dasharray="4 3" stroke-width="0.6"/><line x1="${X(0)}" y1="${Y(0) + 3}" x2="${X(0)}" y2="${Y(Rs + 10)}" stroke="#64748b" stroke-dasharray="2 3" stroke-width="0.5"/>`;
    try {
      const Gm = L.partGeometry(job), od = L.samplePath(Gm.od, 0.3), zEnd = od[od.length - 1][0], id = Gm.id.length ? L.samplePath(Gm.id, 0.3) : null;
      const poly = [[0, id ? id[0][1] : 0], ...od, [zEnd, id ? (L.radiusAt(Gm.id, zEnd, 'max') ?? 0) : 0], ...(id ? id.filter((p) => p[0] >= zEnd).reverse() : [])];
      h += `<path d="M${poly.map(P).join(' L')} Z" fill="#134e4a" stroke="#5eead4" stroke-width="1"/>`;
    } catch (e) { h += `<text x="8" y="14" fill="#f87171" font-size="9">Profil geçersiz</text>`; }
    if (S.R) {
      let d0 = '', prev = null; const paths = new Map();
      S.R.moves.forEach((m) => { const b = [m.p[0], Math.min(m.p[1], Rs + 12)]; if (prev) { if (m.g === 0) d0 += `M${P(prev)} L${P(b)} `; else { const cur = paths.get(m.op) || ''; let seg; if (m.g === 2 || m.g === 3) seg = L.sampleElem({ t: 'A', a: prev, b: m.p, c: m.c, R: Math.hypot(prev[0] - m.c[0], prev[1] - m.c[1]), cw: m.cw }, 0.3).map(P).join(' L'); else seg = P(prev) + ' L' + P(b); paths.set(m.op, cur + 'M' + seg + ' '); } } prev = b; });
      h += `<path d="${d0}" fill="none" stroke="#ef4444" stroke-width="0.35" stroke-dasharray="2 2" opacity="0.6"/>`;
      for (const [op, d] of paths) h += `<path d="${d}" fill="none" stroke="#${OPC[op % OPC.length].toString(16).padStart(6, '0')}" stroke-width="0.6"/>`;
    }
    h += `<text x="${X(0) + 2}" y="${Y(Rs + 10) + 7}" fill="#94a3b8" font-size="7">Z0</text><text x="${W - 30}" y="${Y(0) - 3}" fill="#94a3b8" font-size="7">eksen</text><text x="${X(z0) + 2}" y="${Y((job.chuck.jawD || 110) / 2) + 8}" fill="#c4b5fd" font-size="7">ayna</text>`;
    return h + '</svg>';
  }

  /* ---------- arayüz ---------- */
  const btn = (l, a, on, st = '') => `<button data-act="${a}"${on ? ' class="on"' : ''}${st ? ' style="' + st + '"' : ''}${S.busy ? ' disabled' : ''}>${l}</button>`;
  const num = (label, key, val, w = '1 1 30%') => `<label class="f" style="flex:${w}"><span>${label}</span><input type="number" step="any" inputmode="decimal" data-lz="${key}" value="${val ?? ''}"></label>`;
  const sel = (label, key, val, opts, w = '1 1 45%') => `<label class="f" style="flex:${w}"><span>${label}</span><select data-lz="${key}">${opts.map(([k, v]) => `<option value="${k}"${String(val) === String(k) ? ' selected' : ''}>${esc(v)}</option>`).join('')}</select></label>`;
  const txt = (label, key, val, w = '1 1 45%') => `<label class="f" style="flex:${w}"><span>${label}</span><input type="text" data-lz="${key}" value="${esc(val ?? '')}"></label>`;
  const note = (t) => `<div class="lbl" style="flex:1 0 100%">${t}</div>`;
  const card = (inner, bc = '#1e293b') => `<div style="flex:1 0 100%;background:#111a2e;border:1px solid ${bc};border-radius:12px;padding:10px">${inner}</div>`;
  const row = (k, v, col) => `<div style="display:flex;justify-content:space-between;gap:8px;padding:4px 0;border-top:1px solid #1e293b;font-size:14px"><span style="color:#94a3b8">${k}</span><b style="text-align:right${col ? ';color:' + col : ''}">${v}</b></div>`;
  const issue = (x) => `<div data-lz-issue="${x.level}" style="flex:1 0 100%;background:${x.level === 'hata' ? '#3b0d0d' : '#2a2108'};border-radius:10px;padding:8px 10px;font-size:13.5px">${x.level === 'hata' ? '🔴' : '🟠'} <b>${esc(x.where || '')}</b>: ${esc(x.msg)}</div>`;

  function profTable(key, pts) {
    let h = '';
    pts.forEach((p, i) => {
      h += `<div style="flex:1 0 100%;display:flex;gap:4px;align-items:flex-end">${num('Z', `${key}.${i}.z`, p.z, '1 1 22%')}${num('Çap Ø', `${key}.${i}.d`, +(p.r * 2).toFixed(4), '1 1 22%')}${num('Yay R', `${key}.${i}.R`, p.R || 0, '1 1 18%')}${p.R > 0 ? sel('Yön', `${key}.${i}.cw`, p.cw ? 1 : 0, [[1, 'G02 ↻'], [0, 'G03 ↺']], '1 1 20%') : '<span style="flex:1 1 20%"></span>'}<button data-act="lz-pd-${key}-${i}" style="flex:0 0 38px;padding:8px 0"${pts.length <= 2 ? ' disabled' : ''}>×</button></div>`;
    });
    return h + btn('+ Nokta', `lz-pa-${key}`, false, 'flex:1 1 30%');
  }
  function toolRow(t, i) {
    const k = `tool.${i}`;
    let h = `<div style="flex:1 0 100%;display:flex;flex-wrap:wrap;gap:6px;background:#111a2e;border:1px solid #1e293b;border-radius:12px;padding:8px">`;
    h += num('T (taret yeri)', `${k}.n`, t.n, '1 1 20%') + num('Ofset no', `${k}.off`, t.off, '1 1 20%') + sel('Tür', `${k}.type`, t.type, Object.entries(L.TOOL_TYPES_L), '1 1 50%') + txt('Ad', `${k}.name`, t.name, '1 1 100%');
    if (['od', 'id', 'face'].includes(t.type)) h += num('Uç yarıçapı', `${k}.rn`, t.rn) + num('Yaklaşma açısı °', `${k}.kr`, t.kr) + num('İz kenarı açısı °', `${k}.kr2`, t.kr2) + num('Kesme kenarı (mm)', `${k}.edge`, t.edge);
    if (t.type === 'id') h += num('En küçük delik Ø', `${k}.minBore`, t.minBore) + num('Bara Ø', `${k}.bar`, t.bar) + num('Erişim (mm)', `${k}.reach`, t.reach);
    if (['groove', 'part'].includes(t.type)) h += num('Genişlik (mm)', `${k}.w`, t.w) + num('Köşe yarıçapı', `${k}.rn`, t.rn) + num('Erişim / derinlik', `${k}.reach`, t.reach);
    if (t.type === 'thread') h += num('Uç açısı °', `${k}.ang`, t.ang) + num('Uç yarıçapı', `${k}.rn`, t.rn) + sel('Vida', `${k}.ext`, t.ext === false ? 0 : 1, [[1, 'Dış'], [0, 'İç']], '1 1 30%');
    if (t.type === 'drill') h += num('Çap Ø', `${k}.d`, t.d) + num('Uç açısı °', `${k}.ang`, t.ang) + num('Boy (mm)', `${k}.reach`, t.reach);
    h += sel('Yön', `${k}.hand`, t.hand, [['R', 'Sağ (R)'], ['L', 'Sol (L)'], ['N', 'Nötr']], '1 1 30%') + sel('İş mili', `${k}.spin`, t.spin, [['M03', 'M03'], ['M04', 'M04']], '1 1 30%');
    h += `<button data-act="lz-td-${i}" style="flex:0 0 auto"${job.tools.length <= 1 ? ' disabled' : ''}>Sil</button>`;
    h += `<div class="lbl" style="flex:1 0 100%">Sanal uç no (ofset sayfası): ${L.tipNumber(t)} · G-kodunda T${String(t.n).padStart(2, '0')}${String(t.off).padStart(2, '0')}${L.validateTool(t).length ? ' · <b style="color:#f87171">' + esc(L.validateTool(t).join('; ')) + '</b>' : ''}</div></div>`;
    return h;
  }
  function opRow(o, i) {
    const k = `op.${i}`, toolOpts = job.tools.map((t) => [t.id, `T${t.n} ${t.name || L.TOOL_TYPES_L[t.type]}`]);
    let h = `<div style="flex:1 0 100%;display:flex;flex-wrap:wrap;gap:6px;background:#111a2e;border:1px solid ${o.on === false ? '#1e293b' : '#334155'};border-left:4px solid #${OPC[i % OPC.length].toString(16).padStart(6, '0')};border-radius:12px;padding:8px;${o.on === false ? 'opacity:.55' : ''}">`;
    h += `<div style="flex:1 0 100%;display:flex;gap:6px;align-items:center"><b style="flex:1;font-size:14.5px">${i + 1}. ${esc(L.OP_NAMES_L[o.type])}</b>${btn(o.on === false ? 'Kapalı' : 'Açık', `lz-oo-${i}`, o.on !== false)}${btn('↑', `lz-ou-${i}`, false, i ? '' : 'visibility:hidden')}${btn('×', `lz-od-${i}`)}</div>`;
    if (o.on === false) return h + '</div>';
    h += sel('Takım', `${k}.tool`, o.tool, toolOpts, '1 1 100%');
    if (o.type === 'rough' || o.type === 'finish' || o.type === 'thread') h += sel('Taraf', `${k}.side`, o.side || 'od', [['od', 'Dış çap'], ['id', 'İç çap']], '1 1 30%');
    if (o.type === 'od_turn' || o.type === 'id_turn') h += num('Hedef çap Ø', `${k}.d`, o.d) + num('Bitiş Z', `${k}.z2`, o.z2);
    if (o.type === 'taper') h += num('Başlangıç Ø', `${k}.d1`, o.d1) + num('Başlangıç Z', `${k}.z1`, o.z1) + num('Bitiş Ø', `${k}.d2`, o.d2) + num('Bitiş Z', `${k}.z2`, o.z2);
    if (['face', 'rough', 'od_turn', 'id_turn', 'taper'].includes(o.type)) h += num('Talaş derinliği ap (mm)', `${k}.ap`, o.ap);
    if (o.type === 'rough' || o.type === 'profile') h += num('Finiş payı (mm)', `${k}.allow`, o.allow);
    if (o.type === 'profile') h += num('Paso sayısı', `${k}.passes`, o.passes);
    if (o.type === 'finish' || o.type === 'profile') h += sel('Uç yarıçapı telafisi', `${k}.comp`, o.comp || 'cam', [['cam', 'CAM hesaplar (G40)'], ['control', 'Kumanda (G41/G42)']], '1 1 60%');
    if (o.type === 'groove') h += num('Ön duvar Z', `${k}.z`, o.z) + num('Genişlik (mm)', `${k}.width`, o.width) + num('Dip çapı Ø', `${k}.bottomD`, o.bottomD) + num('Gagalama (mm)', `${k}.peck`, o.peck);
    if (o.type === 'part') h += num('Parça arka yüzü Z', `${k}.z`, o.z) + num('Bitiş çapı Ø', `${k}.endD`, o.endD) + num('Gagalama (mm)', `${k}.peck`, o.peck);
    if (o.type === 'drill') h += num('Delik çapı Ø', `${k}.d`, o.d) + num('Derinlik (tam çap)', `${k}.depth`, o.depth) + num('Gagalama (mm)', `${k}.peck`, o.peck) + num('Devir (d/dk)', `${k}.rpm`, o.rpm) + num('İlerleme (mm/dev)', `${k}.f`, o.f);
    if (o.type === 'thread') h += num('Diş çapı Ø (anma)', `${k}.d`, o.d) + num('Hatve (mm)', `${k}.pitch`, o.pitch) + num('Başlangıç Z', `${k}.z1`, o.z1) + num('Bitiş Z', `${k}.z2`, o.z2) + num('İlk paso (mm)', `${k}.first`, o.first) + num('En küçük paso', `${k}.min`, o.min) + num('Finiş payı', `${k}.fin`, o.fin) + num('Boş paso', `${k}.spring`, o.spring) + num('Devir (d/dk)', `${k}.rpm`, o.rpm) + sel('Çevrim', `${k}.method`, o.method || 'G76', [['G76', 'G76 çevrimi'], ['G32', 'G32 tek tek pasolar']], '1 1 45%');
    if (!['drill', 'thread'].includes(o.type)) h += num('İlerleme f (mm/dev)', `${k}.f`, o.f) + num('Kesme hızı Vc (m/dk)', `${k}.vc`, o.vc) + sel('Devir modu', `${k}.css`, o.css ? 1 : 0, [[1, 'G96 sabit kesme hızı'], [0, 'G97 sabit devir']], '1 1 45%') + (o.css ? '' : num('Devir (d/dk)', `${k}.rpm`, o.rpm));
    const R = S.R && S.R.ops.find((q) => q.idx === i);
    if (R) h += `<div class="lbl" style="flex:1 0 100%">${R.i1 - R.i0} hareket · ${R.notes.map(esc).join(' · ')}</div>`;
    return h + '</div>';
  }
  function modeBtn() { return btn('Torna', 'lz-on', S.on); }
  function html() {
    let h = '<div class="lbl h">🔩 CNC torna (2 eksen X / Z) — takım yolu, simülasyon, G-kodu</div>';
    if (S.busy) return h + card('⏳ ' + esc(S.busy));
    if (S.err) h += `<div style="flex:1 0 100%;background:#3b0d0d;border:1px solid #7f1d1d;border-radius:12px;padding:10px;font-size:14px">⚠ ${esc(S.err)}</div>`;
    const m = M(), no = Object.entries(m.caps).filter(([k, v]) => !v && L.CAP_NAMES[k]).map(([k]) => L.CAP_NAMES[k]);
    h += '<div class="lbl h">Makine</div>' + sel('Makine / kumanda', 'mk', job.mk, Object.entries(L.LATHE_MACHINES).map(([k, v]) => [k, v.name]), '1 1 100%');
    h += note(`En çok ${m.maxRpm} d/dk · X ${m.xMin} … ${m.xMax} (çap) · Z ${m.zMin} … ${m.zMax} · ${m.positions} taret yeri · ${m.turret} tip taret. <b>Bu sürümde yok:</b> ${no.join(', ')}, karşı iş mili.`);
    h += sel('X programlama', 'xMode', job.xMode || 'diameter', [['diameter', 'Çap (X = Ø)'], ['radius', 'Yarıçap (X = r)']], '1 1 45%') + sel('İşlenen malzeme', 'mat', job.mat, Object.entries(L.LATHE_CUT).map(([k, v]) => [k, v.name]), '1 1 45%');
    h += '<div class="lbl h">Ham malzeme ve bağlama</div>';
    h += num('Ham çap Ø', 'stock.d', job.stock.d) + num('Ham boy', 'stock.len', job.stock.len) + num('Ön yüz fazlası', 'stock.face', job.stock.face) + num('Boru iç çapı (0 = dolu)', 'stock.bore', job.stock.bore || 0) + num('Aynadan çıkış', 'stock.stickout', job.stock.stickout);
    h += num('Çene dış çapı Ø', 'chuck.jawD', job.chuck.jawD) + num('Çene boyu', 'chuck.jawLen', job.chuck.jawLen) + num('Ayna gövde Ø', 'chuck.bodyD', job.chuck.bodyD) + num('Güvenli mesafe', 'safe', job.safe ?? 2) + num('Geri çekilme', 'retract', job.retract ?? 1);
    h += '<div class="lbl h">Parça geometrisi (X-Z profili)</div>';
    h += btn('Örnek parça: kademeli mil M24', 'lz-ex', false, 'flex:1 1 48%') + btn('Modelden al (döndürme krokisi / silindir)', 'lz-imp', false, 'flex:1 1 48%');
    h += num('Parça boyu', 'partLen', job.partLen, '1 1 30%') + note('Z = 0 parçanın ön yüzü; aynaya doğru negatif. Noktalar önden arkaya sıralanır. Yay: önceki noktadan bu noktaya, yarıçap R.');
    h += svg2d();
    h += note('<b>Dış profil</b>') + profTable('od', job.od);
    h += note('<b>İç profil (delik)</b>' + (job.id && job.id.length ? '' : ' — yok')) + (job.id && job.id.length ? profTable('id', job.id) + btn('İç profili sil', 'lz-idx', false, 'flex:1 1 30%') : btn('+ İç profil ekle', 'lz-idn', false, 'flex:1 1 45%'));
    h += '<div class="lbl h">Takım kütüphanesi</div>' + job.tools.map(toolRow).join('') + btn('+ Takım', 'lz-tadd', false, 'flex:1 1 30%');
    h += '<div class="lbl h">Operasyonlar ve işleme parametreleri</div>' + job.ops.map(opRow).join('');
    h += `<label class="f" style="flex:1 1 100%"><span>Operasyon ekle</span><select data-lz="addop"><option value="">— seç —</option>${Object.entries(L.OP_NAMES_L).map(([k, v]) => `<option value="${k}">${esc(v)}</option>`).join('')}</select></label>`;
    h += sel('Simülasyon çözünürlüğü', 'res', job.res || 0.1, [[0.2, 'Hızlı (0,2 mm)'], [0.1, 'Normal (0,1 mm)'], [0.05, 'İnce (0,05 mm, yavaş)']], '1 1 100%');
    h += `<button data-act="lz-go" style="flex:1 0 100%;font-size:17px;font-weight:800;padding:14px;background:#16a34a;color:#fff;border-color:#16a34a">▶ TAKIM YOLLARINI HESAPLA VE DENETLE</button>`;
    // hata ve güvenlik uyarıları
    if (S.issues) {
      const er = S.issues.filter((x) => x.level === 'hata'), wr = S.issues.filter((x) => x.level !== 'hata');
      h += '<div class="lbl h">Hata ve güvenlik uyarıları</div>';
      h += card(`<b id="lz-sum" style="color:${er.length ? '#f87171' : wr.length ? '#fbbf24' : '#4ade80'}">${er.length ? '⛔ ' + er.length + ' hata' : '✅ Hata yok'}${wr.length ? ' · ' + wr.length + ' uyarı' : ''}</b>`, er.length ? '#7f1d1d' : '#1e293b');
      h += [...er, ...wr].slice(0, 40).map(issue).join('');
      h += btn((S.showScope ? '▾' : '▸') + ' Neler kontrol edildi, neler edilmedi', 'lz-scope', false, 'flex:1 0 100%;text-align:left');
      if (S.showScope) h += card('<b>Kontrol edilenler</b>' + L.CHECK_SCOPE.checked.map((x) => `<div style="font-size:13px;padding:2px 0">✔ ${esc(x)}</div>`).join('') + '<b style="display:block;margin-top:6px">Kontrol EDİLMEYENLER</b>' + L.CHECK_SCOPE.notChecked.map((x) => `<div style="font-size:13px;padding:2px 0;color:#fbbf24">✖ ${esc(x)}</div>`).join(''));
    }
    if (!S.R) return h;
    const tm = S.time, ev = S.ev;
    h += '<div class="lbl h">Sonuç</div>';
    h += card(row('Tahmini çevrim süresi', fsec(tm.total)) + row('Kesme / hızlı / takım değişimi', `${fsec(tm.cut)} / ${fsec(tm.rapid)} / ${fsec(tm.change)}`) + row('Hareket sayısı', S.R.moves.length) +
      row('Fazla kesim (parçaya girme)', ev.gougeArea > 0 ? nf(ev.gougeArea) + ' mm² kesit' : 'yok', ev.gougeArea > 0 ? '#ef4444' : '#22c55e') + row('Kalan malzeme', ev.residualArea > 0 ? nf(ev.residualArea) + ' mm² kesit' : 'yok', ev.residualArea > 0 ? '#eab308' : '#22c55e') + row('Denetim toleransı', '±' + nf(ev.tol) + ' mm (ızgara ' + nf(job.res || 0.1) + ' mm)'));
    h += '<div class="lbl h">Takım yolu ve 3B simülasyon</div>';
    h += `<div style="flex:1 0 100%;display:flex;gap:6px">${btn('Takım yolu', 'lz-v-path', S.view === 'path', 'flex:1')}${btn('İşlenmiş parça', 'lz-v-final', S.view === 'final', 'flex:1')}${btn(S.playing ? '⏸ Durdur' : '▶ Simülasyon', 'lz-play', S.view === 'sim', 'flex:1;font-weight:700')}</div>`;
    if (S.view === 'sim' && S.play) {
      h += `<div style="flex:1 0 100%;display:flex;gap:6px">${btn('⏮ Baştan', 'lz-rew', false, 'flex:1')}${btn('◀ Önceki op.', 'lz-opp', false, 'flex:1')}${btn('Sonraki op. ▶', 'lz-opn', false, 'flex:1')}</div>`;
      h += `<label class="f" style="flex:1 0 100%"><span>Konum (hareket)</span><input type="range" min="0" max="${S.R.moves.length}" step="1" data-lz="pos" value="${S.play.sim.st.i}"></label>`;
      h += sel('Hız', 'speed', S.speed, [[1, 'Yavaş (1 hareket / kare)'], [4, 'Normal (4)'], [12, 'Hızlı (12)'], [40, 'Çok hızlı (40)']], '1 1 100%');
      h += card(`<div id="lz-ro" style="font-size:13.5px">${readoutText()}</div>`);
    }
    h += note('Kesikli kırmızı: hızlı hareket (G00). Renkli çizgiler: operasyonlar. Simülasyon eksenel simetrik kesitte hesaplanır ve 3B\'de döndürülerek gösterilir; diş bölgesi helis olarak değil, işlenmiş bölge olarak işaretlenir.');
    // G-kodu
    h += '<div class="lbl h">G-kodu</div>';
    if (S.code) {
      const lines = S.code.split('\n'), er = hasErr();
      if (er) h += `<div style="flex:1 0 100%;background:#3b0d0d;border-radius:10px;padding:8px 10px;font-size:13.5px">⛔ Hata var: G-kodu indirme kapalı. Aşağıdaki metin yalnız önizlemedir, üretimde kullanma.</div>`;
      h += `<pre id="lz-code" style="flex:1 0 100%;max-height:${S.codeAll ? 520 : 240}px;overflow:auto;background:#0b1220;border:1px solid #1e293b;border-radius:10px;padding:8px;font-size:11.5px;line-height:1.35;margin:0">${esc((S.codeAll ? lines : lines.slice(0, 70)).join('\n'))}${!S.codeAll && lines.length > 70 ? '\n… (' + (lines.length - 70) + ' satır daha)' : ''}</pre>`;
      h += btn(S.codeAll ? 'Kısalt' : 'Tamamını göster (' + lines.length + ' satır)', 'lz-call', false, 'flex:1 1 45%') + btn((job.lineNumbers ? '☑' : '☐') + ' Satır numarası (N)', 'lz-ln', !!job.lineNumbers, 'flex:1 1 45%');
      h += btn('⬇ G-kodu (.nc)', 'lz-dl-nc', false, 'flex:1 1 45%;font-weight:700') + btn('⬇ G-kodu (.txt)', 'lz-dl-txt', false, 'flex:1 1 45%');
      if (S.cons) h += note(S.cons.skipped ? 'Kumanda telafisi (G41/G42) seçili operasyon var: G-kodu parça konturunu programlar, simülasyon kumandanın uygulayacağı ofseti hesaplar (bire bir geri okuma karşılaştırması yapılmaz).' : S.cons.ok ? `<span id="lz-cons">✅ G-kodu geri okundu: ${S.cons.count[1]} hareket simülasyonla aynı, en büyük sapma ${nf(S.cons.maxErr, 4)} mm.</span>` : `<span id="lz-cons" style="color:#f87171">⛔ G-kodu simülasyon yoluyla uyuşmuyor (${S.cons.count.join(' / ')} hareket, sapma ${nf(S.cons.maxErr, 3)} mm)</span>`);
    }
    h += btn('🧱 OCCT ile geometrik doğrulama', 'lz-occt', false, 'flex:1 0 100%');
    if (S.occt) h += S.occt.err ? issue({ level: 'hata', where: 'OCCT', msg: S.occt.err }) : card(row('Hedef parça hacmi (OCCT)', nf(S.occt.target, 0) + ' mm³') + row('Simülasyon sonucu hacmi', nf(S.occt.result, 0) + ' mm³') + row('Hedefe girme (hedef − sonuç)', nf(S.occt.gouge, 0) + ' mm³ · %' + nf((100 * S.occt.gouge) / S.occt.target, 2), S.occt.gouge / S.occt.target > 0.02 ? '#ef4444' : '#22c55e') + row('Kalan (sonuç − hedef)', nf(S.occt.residual, 0) + ' mm³ · %' + nf((100 * S.occt.residual) / S.occt.target, 2), S.occt.residual / S.occt.target > 0.02 ? '#eab308' : '#22c55e') + `<div class="lbl" id="lz-occt-ok">Katılar geçerli: ${S.occt.valid ? 'evet' : 'HAYIR'} · farklar ızgara çözünürlüğü (${nf(job.res || 0.1)} mm) mertebesindedir.</div>`);
    h += note('⚠ <b>Bu program hiçbir tezgâhta denenmedi.</b> Kumanda uyumu, takım ofsetleri, sanal uç numarası, ayna ve iş parçası bağlaması, iş mili yönü makinede doğrulanmalı. İlk çalıştırmayı kumanda simülasyonu ve tek blok ile, ilerleme düşük ayarda yap.');
    return h;
  }

  /* ---------- eylemler ---------- */
  function importModel() {
    const parts = (api.parts() || []).filter((p) => !p.hidden && p.op !== 'sub');
    const rv = parts.find((p) => p.type === 'sketch' && p.mode === 'revolve' && Array.isArray(p.pts) && p.pts.length >= 3), cy = parts.find((p) => p.type === 'cylinder' && p.d > 0 && p.h > 0);
    if (!rv && !cy) { api.toast('Modelde döndürme krokisi ya da silindir yok'); return; }
    let od, id = [], len;
    if (rv) {
      const P = rv.pts.map(([u, v]) => [Math.max(0, +u), +v]), n = P.length, top = P.reduce((b, p, i) => (p[1] > P[b][1] + 1e-9 || Math.abs(p[1] - P[b][1]) < 1e-9 && p[0] < P[b][0] ? i : b), 0), bot = P.reduce((b, p, i) => (p[1] < P[b][1] - 1e-9 || Math.abs(p[1] - P[b][1]) < 1e-9 && p[0] < P[b][0] ? i : b), 0);
      const walk = (dir) => { const o = []; for (let i = top; ; i = (i + dir + n) % n) { o.push(P[i]); if (i === bot) break; } return o; };
      const a = walk(1), b = walk(-1), avg = (c) => c.reduce((s, p) => s + p[0], 0) / c.length, [outer, inner] = avg(a) >= avg(b) ? [a, b] : [b, a], vmax = P[top][1];
      const toPts = (c) => c.map(([u, v]) => ({ z: +(v - vmax).toFixed(4), r: +u.toFixed(4) }));
      od = toPts(outer); len = vmax - P[bot][1];
      // üst ve alt yüzdeki eksene dönüş parçalarını at (alın ve arka yüz)
      while (od.length > 2 && Math.abs(od[0].z - od[1].z) < 1e-9 && od[0].r < od[1].r) od.shift();
      while (od.length > 2 && Math.abs(od[od.length - 1].z - od[od.length - 2].z) < 1e-9 && od[od.length - 1].r < od[od.length - 2].r) od.pop();
      if (inner.some((p) => p[0] > 1e-6)) { id = toPts(inner); while (id.length > 2 && Math.abs(id[0].z - id[1].z) < 1e-9 && id[0].r > id[1].r) id.shift(); }
    } else { od = [{ z: 0, r: cy.d / 2 }, { z: -cy.h, r: cy.d / 2 }]; len = cy.h; }
    const e = L.checkProfile(od, 'Dış profil'); if (e.length) { api.toast('Profil alınamadı: ' + e[0]); return; }
    const maxR = Math.max(...od.map((p) => p.r));
    job.od = od; job.id = id.length >= 2 && !L.checkProfile(id, 'İç profil').length ? id : []; job.partLen = +len.toFixed(3);
    job.stock = { d: Math.ceil(maxR * 2 + 4), len: Math.ceil(len + 45), face: 2, bore: 0, stickout: Math.ceil(len + 18) };
    job.ops = [{ type: 'face', on: true, tool: job.tools.find((t) => t.type === 'od')?.id, ...L.OP_DEFAULTS.face }, { type: 'rough', on: true, tool: job.tools.find((t) => t.type === 'od')?.id, ...L.OP_DEFAULTS.rough }, { type: 'finish', on: true, tool: (job.tools.filter((t) => t.type === 'od')[1] || job.tools.find((t) => t.type === 'od'))?.id, ...L.OP_DEFAULTS.finish }];
    job.name = api.name(); changed(); fitView(); api.toast(`Profil modelden alındı: ${od.length} nokta, boy ${nf(len)} mm. Operasyonlar: alın, kaba, finiş.`);
  }
  function act(a) {
    if (!a.startsWith('lz-')) return false;
    if (a === 'lz-on') { setOn(true); api.render(); return true; }
    if (S.busy) return true;
    let m;
    if (a === 'lz-go') { compute(); return true; }
    if (a === 'lz-ex') { const keep = { res: job.res, lineNumbers: job.lineNumbers }; job = { ...L.exampleJob(), ...keep }; changed(); fitView(); api.render(); return true; }
    if (a === 'lz-imp') { importModel(); api.render(); return true; }
    if ((m = a.match(/^lz-pa-(od|id)$/))) { const p = job[m[1]], l = p[p.length - 1]; p.push({ z: +(l.z - 5).toFixed(3), r: l.r }); changed(); api.render(); return true; }
    if ((m = a.match(/^lz-pd-(od|id)-(\d+)$/))) { job[m[1]].splice(+m[2], 1); changed(); api.render(); return true; }
    if (a === 'lz-idn') { job.id = [{ z: 0, r: 5 }, { z: -15, r: 5 }]; changed(); api.render(); return true; }
    if (a === 'lz-idx') { job.id = []; changed(); api.render(); return true; }
    if (a === 'lz-tadd') { const id = Math.max(0, ...job.tools.map((t) => t.id)) + 1, n = Math.max(0, ...job.tools.map((t) => t.n)) + 1; job.tools.push({ id, n, off: n, type: 'od', name: 'Yeni takım', rn: 0.4, kr: 93, kr2: 32, edge: 10, hand: 'R', spin: 'M03', hw: 25 }); changed(); api.render(); return true; }
    if ((m = a.match(/^lz-td-(\d+)$/))) { const t = job.tools.splice(+m[1], 1)[0]; for (const o of job.ops) if (o.tool === t.id) o.tool = job.tools[0].id; changed(); api.render(); return true; }
    if ((m = a.match(/^lz-oo-(\d+)$/))) { const o = job.ops[+m[1]]; o.on = o.on === false; changed(); api.render(); return true; }
    if ((m = a.match(/^lz-ou-(\d+)$/))) { const i = +m[1]; if (i > 0) [job.ops[i - 1], job.ops[i]] = [job.ops[i], job.ops[i - 1]]; changed(); api.render(); return true; }
    if ((m = a.match(/^lz-od-(\d+)$/))) { job.ops.splice(+m[1], 1); changed(); api.render(); return true; }
    if (a === 'lz-scope') { S.showScope = !S.showScope; api.render(); return true; }
    if (a === 'lz-v-path') { stopPlay(); S.view = 'path'; draw(); api.render(); return true; }
    if (a === 'lz-v-final') { stopPlay(); S.view = 'final'; draw(); api.render(); return true; }
    if (a === 'lz-play') { if (!S.R) return true; if (S.playing) stopPlay(); else { if (!S.play || S.play.sim.done || S.view !== 'sim') startSim(0); S.playing = true; raf = requestAnimationFrame(loop); } api.render(); return true; }
    if (a === 'lz-rew') { stopPlay(); startSim(0); api.render(); return true; }
    if (a === 'lz-opn' || a === 'lz-opp') { if (!S.play) return true; stopPlay(); const i = S.play.sim.st.i, ops = S.R.ops; let to; if (a === 'lz-opn') { const nx = ops.find((o) => o.i0 > i - 1 && o.i0 >= i); to = nx ? nx.i0 + 3 : S.R.moves.length; if (to <= i) { const k = ops.findIndex((o) => o.i0 + 3 > i); to = k >= 0 ? ops[k].i1 : S.R.moves.length; } } else { const pv = [...ops].reverse().find((o) => o.i0 + 3 < i); to = pv ? pv.i0 + 3 : 0; } startSim(Math.max(0, Math.min(S.R.moves.length, to))); readout(); api.render(); return true; }
    if (a === 'lz-call') { S.codeAll = !S.codeAll; api.render(); return true; }
    if (a === 'lz-ln') { job.lineNumbers = !job.lineNumbers; save(); recode(); api.render(); return true; }
    if (a === 'lz-dl-nc' || a === 'lz-dl-txt') {
      if (!S.code) return true;
      if (hasErr()) { api.toast('G-kodu engellendi: önce hataları düzelt'); return true; }
      const name = String(api.name() || 'torna').replace(/[^\w\-]+/g, '_').slice(0, 40) || 'torna';
      api.saveBlob(new Blob([S.code.replace(/\n/g, '\r\n')], { type: 'text/plain' }), name + '_torna.' + (a === 'lz-dl-nc' ? 'nc' : 'txt')); api.toast('G-kodu indirildi (makinede doğrulanmamış program)'); return true;
    }
    if (a === 'lz-occt') { occtVerify(); return true; }
    return true;
  }
  async function occtVerify() {
    if (!S.R || !S.final) { api.toast('Önce hesapla'); return; }
    S.busy = 'OCCT ile doğrulanıyor…'; api.render();
    try {
      const r = await api.occt('lathe-verify', verifyChains(job, S.final));
      S.occt = r;
    } catch (e) { S.occt = { err: e.message || String(e) }; }
    S.busy = null; draw(); api.render();
  }
  function input(el, type) {
    const k = el.dataset.lz, v = el.value, n = parseFloat(String(v).replace(',', '.'));
    if (k === 'pos') { if (type !== 'change' || !S.R) return; stopPlay(); startSim(Math.max(0, Math.min(S.R.moves.length, +v | 0))); readout(); api.render(); return; }
    if (k === 'speed') { S.speed = +v || 4; return; }
    if (type !== 'change') return;
    if (k === 'addop') { if (!L.OP_DEFAULTS[v]) return; const need = { od_turn: 'od', id_turn: 'id', face: 'od', rough: 'od', finish: 'od', groove: 'groove', part: 'part', drill: 'drill', taper: 'od', profile: 'od', thread: 'thread' }[v]; const t = job.tools.find((q) => q.type === need) || job.tools[0]; job.ops.push({ type: v, on: true, tool: t.id, ...clone(L.OP_DEFAULTS[v]) }); changed(); api.render(); return; }
    const p = k.split('.');
    if (k === 'mk' || k === 'mat' || k === 'xMode') job[k] = v;
    else if (k === 'res') job.res = n;
    else if (k === 'partLen' || k === 'safe' || k === 'retract') { if (Number.isFinite(n)) job[k] = n; }
    else if (p[0] === 'stock' || p[0] === 'chuck') { if (Number.isFinite(n)) job[p[0]][p[1]] = n; }
    else if (p[0] === 'od' || p[0] === 'id') { const q = job[p[0]][+p[1]]; if (!q) return; if (p[2] === 'cw') q.cw = v === '1'; else if (!Number.isFinite(n)) return; else if (p[2] === 'd') q.r = n / 2; else if (p[2] === 'R') { q.R = Math.max(0, n); if (!q.R) { delete q.R; delete q.cw; } } else q.z = n; }
    else if (p[0] === 'tool') { const t = job.tools[+p[1]]; if (!t) return; const f = p[2]; if (f === 'type') { t.type = v; Object.assign(t, { rn: t.rn ?? 0.4, kr: t.kr ?? 93, kr2: t.kr2 ?? 32, edge: t.edge ?? 10, w: t.w ?? 3, reach: t.reach ?? 20, d: t.d ?? 10, ang: t.ang ?? (v === 'drill' ? 118 : 60), minBore: t.minBore ?? 12, bar: t.bar ?? 10 }); if (v === 'thread' && t.ext == null) t.ext = true; } else if (f === 'name' || f === 'hand' || f === 'spin') t[f] = v; else if (f === 'ext') t.ext = v === '1'; else if (Number.isFinite(n)) t[f] = f === 'n' || f === 'off' ? Math.round(n) : n; }
    else if (p[0] === 'op') { const o = job.ops[+p[1]]; if (!o) return; const f = p[2]; if (f === 'tool') o.tool = +v; else if (f === 'side' || f === 'comp' || f === 'method') o[f] = v; else if (f === 'css') o.css = v === '1'; else if (Number.isFinite(n)) o[f] = n; }
    changed(); api.render();
  }
  function setOn(on) { if (on === S.on) return; S.on = on; if (on) { draw(); fitView(); } else { stopPlay(); clear3(); api.hideModel(false); } }
  return {
    html, modeBtn, act, input, setOn,
    get on() { return S.on; },
    leave() { stopPlay(); if (S.on) { clear3(); api.hideModel(false); } },
    enter() { if (S.on) { draw(); fitView(); } },
    getJob: () => clone(job), setJob(j) { job = { ...L.exampleJob(), ...clone(j) }; changed(); },
    state: () => ({ on: S.on, hasR: !!S.R, issues: S.issues, ev: S.ev, cons: S.cons, moves: S.R ? S.R.moves.length : 0, playI: S.play ? S.play.sim.st.i : 0, playing: S.playing, occt: S.occt, meshes: api.group.children.length }),
  };
}
// simülasyon sonucundan parça boyu aralığındaki kapalı kesit ([z, r], önden arkaya dış, sonra iç)
export function partChainFromSim(sim, partLen) {
  const p = L.simProfile(sim, 1), keep = (c) => c.filter((q) => q[0] >= -partLen - 1e-9 && q[0] <= 1e-9).reverse();
  const o = keep(p.outer), i = keep(p.inner);
  const dp = (pts, tol = 0.06) => { if (pts.length < 3) return pts; const k = new Uint8Array(pts.length); k[0] = k[pts.length - 1] = 1; const st = [[0, pts.length - 1]]; while (st.length) { const [a, b] = st.pop(); let m = 0, mi = -1; const A = pts[a], B = pts[b], dx = B[0] - A[0], dy = B[1] - A[1], l = Math.hypot(dx, dy) || 1; for (let q = a + 1; q < b; q++) { const d = Math.abs((pts[q][0] - A[0]) * dy - (pts[q][1] - A[1]) * dx) / l; if (d > m) { m = d; mi = q; } } if (m > tol) { k[mi] = 1; st.push([a, mi], [mi, b]); } } return pts.filter((_, q) => k[q]); };
  const O = dp(o), I = dp(i).reverse();
  const zF = 0, zB = -partLen;
  // uçları tam parça sınırlarına oturt
  const out = [[zF, I.length ? I[I.length - 1][1] : 0], [zF, O[0][1]], ...O, [zB, O[O.length - 1][1]], [zB, I.length ? I[0][1] : 0], ...I];
  // ardışık aynı noktaları at
  const res = []; for (const q of out) if (!res.length || Math.hypot(res[res.length - 1][0] - q[0], res[res.length - 1][1] - q[1]) > 1e-6) res.push(q);
  res.push(res[0].slice());
  return res;
}

// OCCT doğrulaması için kesitler ([r, y], y = z): hedef parça (doğrudaş noktalar atılmış) ve simülasyon sonucu.
// Sonuç uçları eksenel 0,02 mm uzatılır: hedefle çakışık düzlem yüzler Boolean işlemini bozmasın (etkisi < π·R²·0,04 mm³).
export function verifyChains(job, sim, pad = 0.02) {
  const G = L.partGeometry(job), Lp = job.partLen;
  const od = L.samplePath(G.od, 0.2), id = G.id.length ? L.samplePath(G.id, 0.2).filter((p) => p[0] >= -Lp - 1e-9) : [];
  let ch = [[0, id.length ? id[0][1] : 0], ...od];
  if (id.length) { const back = L.radiusAt(G.id, -Lp, 'max'); ch.push([-Lp, back ?? 0]); ch.push(...id.slice().reverse().filter((p) => p[1] > 1e-9 && p[0] > -Lp + 1e-9)); } else ch.push([-Lp, 0]);
  const simp = (P) => { const o = [P[0]]; for (let i = 1; i < P.length - 1; i++) { const a = o[o.length - 1], b = P[i], c = P[i + 1]; if (Math.hypot(b[0] - a[0], b[1] - a[1]) < 1e-9) continue; if (Math.abs((b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0])) > 1e-9) o.push(b); } o.push(P[P.length - 1]); return o; };
  ch = simp(ch); if (Math.hypot(ch[0][0] - ch[ch.length - 1][0], ch[0][1] - ch[ch.length - 1][1]) < 1e-9) ch.pop();
  const res = partChainFromSim(sim, Lp).slice(0, -1).map(([z, r]) => [z > -1e-9 ? z + pad : z < -Lp + 1e-9 ? z - pad : z, r]);
  return { target: ch.map(([z, r]) => [r, z]), result: res.map(([z, r]) => [r, z]), pad };
}
