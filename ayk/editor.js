// Ayakkabı Modelhanesi — 2B stampa editörü (tuval). Birim mm; ekran yakınlaşması ölçüleri değiştirmez.
// Bağlam (ctx): 'stampa' (yardımcı çizgiler) ya da bir parçanın kimliği. Yalnız etkin bağlamdaki geometri düzenlenir.
// Bütün değişiklikler api.begin() (geri al noktası) → değişiklik → api.changed() (otomatik kayıt) sırasıyla yapılır.
import * as G from './geom.js?v=20261114s';
import * as M from './model.js?v=20261114s';
import { pieceItems, sketchItems, netPolygon, edgeFrame, markPoint, itemsBox, measure, fmt, checkPiece } from './build.js?v=20261114s';

const { C } = G;
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pn = (s) => { const t = String(s ?? '').trim().replace(',', '.'); if (t === '') return null; const v = Number(t); return Number.isFinite(v) ? v : NaN; };
const f1 = (v) => fmt(v, 1), f2 = (v) => fmt(v, 2);

export const TOOLS = [
  { id: 'sec', label: 'Seç', tip: 'Noktaya dokun: seç / sürükle. Parçanın içinden sürükle: parçayı taşı. Boşlukta sürükle: kaydır.' },
  { id: 'cizgi', label: 'Çizgi', tip: 'Dokundukça köşe noktası eklenir. İlk noktaya dokununca kapanır; açık bırakmak için "Bitir".' },
  { id: 'egri', label: 'Eğri', tip: 'Dokundukça yumuşak (eğri) nokta eklenir; eğri noktalardan geçer.' },
  { id: 'bezier', label: 'Bezier', tip: 'Bas ve sürükle: noktayı koyar, sürükleme yönü tutamacı belirler. Sürüklemeden bırakırsan köşe olur.' },
  { id: 'serbest', label: 'Serbest', tip: 'Parmağınla / kalemle çiz; çizgi sadeleştirilip düzgün eğriye çevrilir.' },
  { id: 'nokta', label: '+Nokta', tip: 'Çizgiye dokun: o noktaya düğüm eklenir (şekil değişmez).' },
  { id: 'sil', label: '−Nokta', tip: 'Düğüme dokun: silinir.' },
  { id: 'bol', label: 'Böl', tip: 'Düğüme ya da çizgiye dokun: çizgi orada ikiye ayrılır (kapalı çizgi açılır). Parça sınırı bölünmez.' },
  { id: 'birlestir', label: 'Birleştir', tip: 'Açık bir çizginin ucuna, sonra diğer çizginin ucuna dokun. Aynı çizginin iki ucu: çizgi kapanır.' },
  { id: 'kenar', label: 'Kenar başı', tip: 'Parça sınırında düğüme dokun: kenar başı aç / kapat. Her kenarın pay türü ve dikişi ayrıdır.', piece: true },
  { id: 'centik', label: 'Çentik', tip: 'Parça kenarına dokun: çentik (eşleştirme işareti) eklenir.', piece: true },
  { id: 'binme', label: 'Binme nk.', tip: 'Binme noktası: kenara yakınsa kenara oturur, değilse serbest konum.', piece: true },
  { id: 'delik', label: 'Delik', tip: 'Delik işareti (çapı alttan).', piece: true },
  { id: 'aksesuar', label: 'Aksesuar', tip: 'Aksesuar işareti (toka, kuşgözü, etiket…).', piece: true },
  { id: 'referans', label: 'Referans', tip: 'Referans noktası.', piece: true },
  { id: 'olcu', label: 'Ölçü', tip: 'İki noktaya dokun: ölçü çizgisi.', piece: true },
  { id: 'yazi', label: 'Yazı', tip: 'Alttaki yazıyı gir, parçaya dokun.', piece: true },
];
const DRAW = new Set(['cizgi', 'egri', 'bezier', 'serbest']);

export function createEditor(host, api) {
  host.innerHTML = `
  <div class="ed">
    <div class="ed-bar">
      <select class="ed-ctx" aria-label="Düzenlenen parça"></select>
      <button type="button" data-a="newpiece" class="ok" title="Yeni saya parçası: sınırını çiz">+ Parça</button>
      <span class="sp"></span>
      <button type="button" data-a="undo" title="Geri al (Ctrl+Z)">↶</button>
      <button type="button" data-a="redo" title="İleri al (Ctrl+Y)">↷</button>
      <button type="button" data-a="fit" title="Çalışma alanını ortala">⤢ Ortala</button>
      <button type="button" data-a="zin" title="Yakınlaştır">+</button>
      <button type="button" data-a="zout" title="Uzaklaştır">−</button>
      <button type="button" data-a="layers" title="Katmanlar">Katmanlar</button>
    </div>
    <div class="ed-main">
      <div class="ed-cv"><canvas tabindex="0" aria-label="Stampa çizim alanı"></canvas>
        <div class="ed-hud"></div><div class="ed-scale"></div><div class="ed-hint"></div>
        <div class="ed-layers" hidden></div>
      </div>
      <div class="ed-side"><div class="ed-insp"></div></div>
    </div>
    <div class="ed-opts"></div>
    <div class="ed-tools" role="toolbar" aria-label="Araçlar"></div>
  </div>`;
  const $ = (s) => host.querySelector(s);
  const cv = $('canvas'), ctx2 = cv.getContext('2d');
  const S = { ctx: 'stampa', tool: 'sec', sel: null, draft: null, view: { k: 2, cx: 150, cy: 100 }, lineKind: 'yardimci',
    mark: { label: '', d: 4, depth: 3, shape: 'I' }, text: '', dimA: null, joinA: null, cursor: null, cursorRaw: null, ptrs: new Map(), op: null, cache: new Map(), showLayers: false };
  const P = () => api.P();
  const piece = () => (S.ctx === 'stampa' ? null : P()?.pieces.find((q) => q.id === S.ctx) || null);

  /* ---------- görünüm ---------- */
  let W = 0, H = 0, dpr = 1;
  function resize() { const r = cv.getBoundingClientRect(); dpr = Math.min(3, window.devicePixelRatio || 1); W = Math.max(50, r.width); H = Math.max(50, r.height); cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); draw(); }
  const ro = new ResizeObserver(resize); ro.observe($('.ed-cv'));
  const toS = (p) => [W / 2 + (p[0] - S.view.cx) * S.view.k, H / 2 + (p[1] - S.view.cy) * S.view.k];
  const toW = (x, y) => [S.view.cx + (x - W / 2) / S.view.k, S.view.cy + (y - H / 2) / S.view.k];
  function zoomAt(f, sx = W / 2, sy = H / 2) { const before = toW(sx, sy); S.view.k = Math.min(200, Math.max(0.05, S.view.k * f)); const after = toW(sx, sy); S.view.cx += before[0] - after[0]; S.view.cy += before[1] - after[1]; saveView(); draw(); }
  function fit() {
    const p = P(); if (!p) return;
    if (W < 60 || H < 60) { const r = cv.getBoundingClientRect(); if (r.width > 0) { W = r.width; H = r.height; } }
    const items = [...sketchItems(p), ...p.pieces.flatMap((pc) => cachedItems(pc))];
    const b = itemsBox(items) || { x0: 0, y0: 0, x1: 300, y1: 200 };
    const bw = Math.max(20, b.x1 - b.x0), bh = Math.max(20, b.y1 - b.y0);
    S.view.k = Math.min(200, Math.max(0.05, Math.min((W - 40) / bw, (H - 40) / bh)));
    S.view.cx = (b.x0 + b.x1) / 2; S.view.cy = (b.y0 + b.y1) / 2; saveView(); draw();
  }
  let viewT; function saveView() { clearTimeout(viewT); viewT = setTimeout(() => { const p = P(); if (p) p.view = { ...S.view }; }, 300); }

  /* ---------- çizim listesi önbelleği ---------- */
  function cachedItems(pc) {
    const key = JSON.stringify([pc, P().materials.find((m) => m.id === pc.material)?.name || '']);
    const c = S.cache.get(pc.id);
    if (c && c.key === key) return c.items;
    let items; try { items = pieceItems(pc, P()); } catch (e) { items = []; }
    S.cache.set(pc.id, { key, items }); return items;
  }

  /* ---------- düzenlenebilir yollar ---------- */
  function refs() {
    const p = P(); if (!p) return [];
    if (S.ctx === 'stampa') return p.sketch.paths.map((np) => ({ kind: 'sketch', id: np.id }));
    const pc = piece(); if (!pc) return [];
    return [{ kind: 'outline', id: pc.outline.id, piece: pc.id }, ...pc.lines.map((l) => ({ kind: 'line', id: l.id, piece: pc.id }))];
  }
  function npOf(ref) {
    const p = P(); if (!ref || !p) return null;
    if (ref.kind === 'sketch') return p.sketch.paths.find((q) => q.id === ref.id) || null;
    const pc = p.pieces.find((q) => q.id === ref.piece); if (!pc) return null;
    if (ref.kind === 'outline') return pc.outline;
    return pc.lines.find((l) => l.id === ref.id)?.path || null;
  }
  const sameRef = (a, b) => a && b && a.kind === b.kind && a.id === b.id && a.piece === b.piece;
  const hitPx = (e) => (e && e.pointerType === 'touch' ? 22 : 12);

  /* ---------- yakalama ---------- */
  function snap(raw, { exclude = null, from = null } = {}) {
    const st = api.settings(), tolW = 12 / S.view.k;
    let best = null, d0 = tolW;
    if (st.snapNode) {
      const p = P();
      const cand = [];
      for (const np of p.sketch.paths) cand.push(np);
      for (const pc of p.pieces) { cand.push(pc.outline); for (const l of pc.lines) cand.push(l.path); }
      for (const np of cand) for (const n of np.nodes) { if (exclude && exclude.has(n)) continue; const d = C.dist(n.p, raw); if (d < d0) { d0 = d; best = { p: n.p.slice(), kind: 'nokta' }; } }
      if (S.draft) for (const n of S.draft.nodes) { const d = C.dist(n.p, raw); if (d < d0) { d0 = d; best = { p: n.p.slice(), kind: 'nokta' }; } }
    }
    if (best) return best;
    let p = raw.slice();
    if (from && st.snapAngle) {
      const d = C.sub(raw, from), L = Math.hypot(d[0], d[1]);
      if (L > 1e-6) { const a = Math.round(Math.atan2(d[1], d[0]) / (Math.PI / 12)) * (Math.PI / 12); p = [from[0] + Math.cos(a) * L, from[1] + Math.sin(a) * L]; }
    }
    if (st.snapGrid) { const g = st.grid || 5; if (from && st.snapAngle) { /* açı yakalamada uzunluk ızgaraya */ const d = C.sub(p, from), L = Math.round(Math.hypot(d[0], d[1]) / g) * g, a = Math.atan2(d[1], d[0]); p = [from[0] + Math.cos(a) * L, from[1] + Math.sin(a) * L]; } else p = [Math.round(p[0] / g) * g, Math.round(p[1] / g) * g]; return { p, kind: 'ızgara' }; }
    return { p, kind: null };
  }

  /* ---------- isabet testi ---------- */
  function hitHandle(sp, px) {
    if (!S.sel || (S.sel.t !== 'node' && S.sel.t !== 'handle')) return null;
    const np = npOf(S.sel.ref), n = np?.nodes[S.sel.idx]; if (!n) return null;
    for (const w of ['i', 'o']) if (n[w]) { const q = toS(C.add(n.p, n[w])); if (Math.hypot(q[0] - sp[0], q[1] - sp[1]) <= px) return { t: 'handle', ref: S.sel.ref, idx: S.sel.idx, which: w }; }
    return null;
  }
  function hitNode(sp, px, list = refs()) {
    let best = null;
    for (const ref of list) { const np = npOf(ref); if (!np) continue; np.nodes.forEach((n, i) => { const q = toS(n.p), d = Math.hypot(q[0] - sp[0], q[1] - sp[1]); if (d <= px && (!best || d < best.d)) best = { t: 'node', ref, idx: i, d }; }); }
    return best;
  }
  function hitSeg(wp, px, list = refs()) {
    let best = null;
    for (const ref of list) { const np = npOf(ref); if (!np || np.nodes.length < 2) continue; const r = G.nearestSeg(np, wp); if (r && r.d * S.view.k <= px && (!best || r.d < best.d)) best = { ref, ...r }; }
    return best;
  }
  function hitMark(wp, px) {
    const pc = piece(); if (!pc) return null;
    let best = null;
    for (const m of pc.marks) { const q = markPoint(pc, m); if (!q) continue; const d = C.dist(q, wp) * S.view.k; if (d <= px && (!best || d < best.d)) best = { t: 'mark', piece: pc.id, id: m.id, d }; }
    pc.dims.forEach((dm, i) => { for (const q of [dm.a, dm.b]) { const d = C.dist(q, wp) * S.view.k; if (d <= px && (!best || d < best.d)) best = { t: 'dim', piece: pc.id, idx: i, d }; } });
    pc.texts.forEach((tx, i) => { const d = C.dist(tx.p, wp) * S.view.k; if (d <= px * 1.5 && (!best || d < best.d)) best = { t: 'text', piece: pc.id, idx: i, d }; });
    return best;
  }
  function pieceAt(wp) {
    const p = P(); for (let i = p.pieces.length - 1; i >= 0; i--) { const pc = p.pieces[i], net = netPolygon(pc, 0.5); if (net.length > 2 && G.insidePoly(net, wp)) return pc; }
    return null;
  }

  /* ---------- değişiklik yardımcıları ---------- */
  const begin = (label) => api.begin(label);
  const changed = () => { api.changed(); refreshSide(); draw(); };
  function setCtx(id) {
    S.ctx = id; S.sel = null; S.draft = null; S.joinA = null; S.dimA = null;
    if (id === 'stampa' && TOOLS.find((t) => t.id === S.tool)?.piece) S.tool = 'sec';
    S.lineKind = id === 'stampa' ? 'yardimci' : (S.lineKind === 'yardimci' ? 'merkez' : S.lineKind);
    renderBar(); renderTools(); refreshSide(); draw(); api.onCtx?.(id);
  }
  function setTool(id) {
    if (S.draft && S.draft.nodes.length) finishDraft(false);
    if (S.tool !== id) S.mark.label = '';
    S.tool = id; S.joinA = null; S.dimA = null; renderTools(); refreshSide(); draw();
  }
  function hint(s) { $('.ed-hint').textContent = s || ''; $('.ed-hint').hidden = !s; }

  /* ---------- taslak (yeni çizgi) ---------- */
  function draftTarget() { const pc = piece(); if (!pc) return 'sketch'; return pc.outline.nodes.length < 3 && !pc.outline.closed ? 'outline' : 'line'; }
  function addDraftPoint(p, { smooth = false, handle = null } = {}) {
    if (!S.draft) S.draft = { nodes: [], target: draftTarget() };
    const n = G.node(p); n.smooth = smooth; S.draft.nodes.push(n);
    if (handle) { n.o = G.rp(handle); n.i = G.rp(C.mul(handle, -1)); }
    const tmp = { closed: false, nodes: S.draft.nodes };
    for (let i = 0; i < tmp.nodes.length; i++) if (tmp.nodes[i].smooth) G.autoSmooth(tmp, i);
    refreshSide(); draw();
  }
  function finishDraft(close) {
    const d = S.draft; S.draft = null;
    if (!d || d.nodes.length < 2) { refreshSide(); draw(); return; }
    const nodes = d.nodes.map((n) => ({ id: n.id, p: n.p, i: n.i, o: n.o, brk: false, smooth: n.smooth }));
    const np = { id: G.uid('p'), closed: false, nodes };
    if (close && nodes.length >= 3) { np.closed = true; nodes.forEach((n, i) => { if (n.smooth) G.autoSmooth(np, i); }); }
    if (!np.closed && nodes.length) { nodes[0].i = null; nodes.at(-1).o = null; }
    for (const n of nodes) delete n.smooth;
    const p = P();
    if (d.target === 'outline' && !np.closed) { api.toast('Parça sınırı kapalı olmalı: ilk noktaya dokun ya da "Kapat"'); S.draft = d; refreshSide(); draw(); return; }
    begin('çizim');
    if (d.target === 'sketch') { p.sketch.paths.push(np); S.sel = { t: 'path', ref: { kind: 'sketch', id: np.id } }; }
    else {
      const pc = piece(); if (!pc) return;
      if (d.target === 'outline') {
        nodes.forEach((n) => { n.brk = !n.i && !n.o; }); if (!nodes.some((n) => n.brk)) nodes[0].brk = true;
        pc.outline = np; M.pruneEdges(pc);
        S.sel = { t: 'path', ref: { kind: 'outline', id: np.id, piece: pc.id } };
        api.toast('Parça sınırı oluşturuldu. Kenar türlerini ve payları "Saya Parçaları"ndan ya da sağdaki panelden ayarla.');
      } else {
        const l = { id: G.uid('ln'), kind: S.lineKind, path: np }; pc.lines.push(l);
        S.sel = { t: 'path', ref: { kind: 'line', id: l.id, piece: pc.id } };
      }
    }
    changed();
  }
  // ölçüyle nokta: uzunluk + açı (0° sağ, 90° yukarı) ya da mutlak X, Y
  function numericPoint(L, A, X, Y) {
    const last = S.draft?.nodes.at(-1)?.p;
    let p;
    if (X !== null && Y !== null && Number.isFinite(X) && Number.isFinite(Y)) p = [X, Y];
    else if (last && Number.isFinite(L) && L > 0) { const a = (Number.isFinite(A) ? A : 0) * Math.PI / 180; p = [last[0] + L * Math.cos(a), last[1] - L * Math.sin(a)]; }
    else { api.toast(last ? 'Uzunluk (mm) gir' : 'İlk nokta için X ve Y gir'); return; }
    addDraftPoint(p, { smooth: S.tool === 'egri' });
  }

  /* ---------- işaretler ---------- */
  function placeMark(kind, wp) {
    const pc = piece(); if (!pc || !pc.outline.closed) { api.toast('Önce kapalı bir parça sınırı çiz'); return; }
    const loc = G.locateOnEdges(pc.outline, wp), near = loc && loc.d * S.view.k <= 24;
    const m = { id: G.uid('mk'), kind, label: S.mark.label || '' };
    if (kind === 'centik') { if (!near) { api.toast('Çentik parça kenarına konur: kenara daha yakın dokun'); return; } m.edge = loc.edge; m.at = +loc.at.toFixed(2); m.depth = S.mark.depth; m.shape = S.mark.shape; }
    else if (kind === 'binme' && near) { m.edge = loc.edge; m.at = +loc.at.toFixed(2); }
    else { m.p = G.rp(snap(wp).p); if (kind === 'delik' || kind === 'aksesuar') m.d = S.mark.d; if (kind === 'binme') m.d = 1.2; }
    begin('işaret'); pc.marks.push(m); S.sel = { t: 'mark', piece: pc.id, id: m.id }; changed();
  }

  /* ---------- işaretçi olayları ---------- */
  // tuval boyutu her olayda yeniden okunur: araç çubukları değişince yeniden boyutlanma gecikse de dokunuş kaymaz
  const evS = (e) => { const r = cv.getBoundingClientRect(); if (r.width > 0) { W = r.width; H = r.height; } return [e.clientX - r.left, e.clientY - r.top]; };
  cv.addEventListener('pointerdown', (e) => {
    if (!P()) return;
    cv.focus({ preventScroll: true });
    cv.setPointerCapture(e.pointerId);
    const sp = evS(e); S.ptrs.set(e.pointerId, sp);
    if (S.ptrs.size === 2) { // iki parmak: yakınlaştır / kaydır
      if (S.op?.kind === 'free') S.op = null;
      const [a, b] = [...S.ptrs.values()]; S.op = { kind: 'pinch', d: Math.hypot(a[0] - b[0], a[1] - b[1]), m: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], view: { ...S.view } }; return;
    }
    if (S.ptrs.size > 2) return;
    const wp = toW(...sp), px = hitPx(e);
    S.op = { kind: 'tap', sp0: sp, wp0: wp, moved: false, e };
    const t = S.tool;
    if (t === 'sec') {
      const h = hitHandle(sp, px) || hitNode(sp, px);
      if (h) { S.sel = h.t === 'handle' ? h : { t: 'node', ref: h.ref, idx: h.idx }; S.op = { kind: h.t === 'handle' ? 'handle' : 'node', sp0: sp, wp0: wp, started: false }; refreshSide(); draw(); return; }
      const mk = hitMark(wp, px);
      if (mk) { S.sel = mk.t === 'mark' ? { t: 'mark', piece: mk.piece, id: mk.id } : mk.t === 'dim' ? { t: 'dim', piece: mk.piece, idx: mk.idx } : { t: 'text', piece: mk.piece, idx: mk.idx }; S.op = { kind: 'mark', sp0: sp, wp0: wp, started: false }; refreshSide(); draw(); return; }
      const sg = hitSeg(wp, px);
      const pc = piece();
      if (sg) { S.sel = { t: 'path', ref: sg.ref }; S.op = { kind: sg.ref.kind === 'outline' ? 'movepiece' : 'movepath', sp0: sp, wp0: wp, started: false, last: wp }; refreshSide(); draw(); return; }
      if (pc && pc.outline.closed && G.insidePoly(netPolygon(pc, 0.5), wp)) { S.op = { kind: 'movepiece', sp0: sp, wp0: wp, started: false, last: wp }; return; }
      S.op = { kind: 'pan', sp0: sp, view: { ...S.view }, wp0: wp, tapSwitch: true };
      return;
    }
    if (t === 'bezier') { const sn = snap(wp, { from: S.draft?.nodes.at(-1)?.p }); S.op = { kind: 'bez', sp0: sp, p: sn.p, started: false }; addDraftPoint(sn.p); return; }
    if (t === 'serbest') { S.op = { kind: 'free', pts: [wp], sp0: sp }; return; }
    if (t === 'tasi') { S.op = { kind: piece() ? 'movepiece' : 'movepath', sp0: sp, wp0: wp, started: false, last: wp }; return; }
    S.op = { kind: 'tap', sp0: sp, wp0: wp, moved: false, px, view: { ...S.view } };
  });
  cv.addEventListener('pointermove', (e) => {
    const sp = evS(e);
    if (S.ptrs.has(e.pointerId)) S.ptrs.set(e.pointerId, sp);
    const wp = toW(...sp);
    S.cursorRaw = wp;
    S.cursor = DRAW.has(S.tool) || S.tool === 'olcu' ? snap(wp, { from: S.draft?.nodes.at(-1)?.p || S.dimA }) : null;
    const op = S.op;
    if (!op) { if (e.pointerType === 'mouse') { hud(wp); draw(); } return; }
    if (op.kind === 'pinch') {
      if (S.ptrs.size < 2) return;
      const [a, b] = [...S.ptrs.values()], d = Math.hypot(a[0] - b[0], a[1] - b[1]), m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      const k = Math.min(200, Math.max(0.05, op.view.k * d / Math.max(1, op.d)));
      const w0 = [op.view.cx + (op.m[0] - W / 2) / op.view.k, op.view.cy + (op.m[1] - H / 2) / op.view.k];
      S.view.k = k; S.view.cx = w0[0] - (m[0] - W / 2) / k; S.view.cy = w0[1] - (m[1] - H / 2) / k; saveView(); draw(); return;
    }
    const moved = Math.hypot(sp[0] - op.sp0[0], sp[1] - op.sp0[1]) > (e.pointerType === 'touch' ? 9 : 4);
    if (op.kind === 'tap' && moved) { op.kind = 'pan'; op.view = op.view || { ...S.view }; }
    if (op.kind === 'pan') { if (!moved && !op.panning) return; op.panning = true; op.tapSwitch = false; S.view.cx = op.view.cx - (sp[0] - op.sp0[0]) / S.view.k; S.view.cy = op.view.cy - (sp[1] - op.sp0[1]) / S.view.k; saveView(); draw(); return; }
    if (op.kind === 'free') { const q = op.pts.at(-1); if (C.dist(q, wp) * S.view.k > 2) op.pts.push(wp); draw(); return; }
    if (op.kind === 'bez') { if (!moved && !op.started) return; op.started = true; const n = S.draft.nodes.at(-1), h = C.sub(wp, op.p); n.o = G.rp(h); n.i = G.rp(C.mul(h, -1)); draw(); return; }
    if (!moved && !op.started) { hud(wp); return; }
    if (!op.started) { op.started = true; begin('sürükle'); }
    if (op.kind === 'node') {
      const np = npOf(S.sel.ref), n = np.nodes[S.sel.idx];
      const sn = snap(wp, { exclude: new Set([n]) });
      n.p = G.rp(sn.p); hud(n.p, sn.kind); S.cache.delete(S.sel.ref.piece); draw(); return;
    }
    if (op.kind === 'handle') {
      const np = npOf(S.sel.ref), n = np.nodes[S.sel.idx], w = S.sel.which, o = w === 'i' ? 'o' : 'i';
      const h = C.sub(wp, n.p); n[w] = G.rp(h);
      if (n[o] && !n.cusp) { const L = Math.hypot(...n[o]), m = Math.hypot(...h) || 1; n[o] = G.rp(C.mul(h, -L / m)); }
      hud(wp); S.cache.delete(S.sel.ref.piece); draw(); return;
    }
    if (op.kind === 'mark') {
      const pc = P().pieces.find((q) => q.id === S.sel.piece); if (!pc) return;
      if (S.sel.t === 'mark') { const m = pc.marks.find((q) => q.id === S.sel.id); if (!m) return; if (m.edge) { const loc = G.locateOnEdges(pc.outline, wp); if (loc && loc.edge === m.edge) m.at = +loc.at.toFixed(2); } else m.p = G.rp(snap(wp).p); }
      else if (S.sel.t === 'dim') { const d = pc.dims[S.sel.idx], sn = snap(wp).p; if (C.dist(d.a, op.wp0) <= C.dist(d.b, op.wp0)) d.a = G.rp(sn); else d.b = G.rp(sn); }
      else if (S.sel.t === 'text') pc.texts[S.sel.idx].p = G.rp(snap(wp).p);
      S.cache.delete(pc.id); draw(); return;
    }
    if (op.kind === 'movepiece' || op.kind === 'movepath') {
      const st = api.settings(); let d = C.sub(wp, op.wp0);
      if (st.snapGrid) { const g = st.grid || 5; d = [Math.round(d[0] / g) * g, Math.round(d[1] / g) * g]; }
      const step = C.sub(d, C.sub(op.last, op.wp0)); if (Math.hypot(...step) < 1e-9) return;
      op.last = C.add(op.wp0, d);
      if (op.kind === 'movepiece') { const pc = piece(); if (pc) { M.transformPiece(pc, G.moveFn(step[0], step[1])); S.cache.delete(pc.id); } }
      else { const np = S.sel?.t === 'path' ? npOf(S.sel.ref) : null; if (np) G.transform(np, G.moveFn(step[0], step[1])); }
      hud(wp, 'Δ ' + f1(d[0]) + ' ; ' + f1(d[1])); draw();
    }
  });
  const up = (e) => {
    S.ptrs.delete(e.pointerId);
    const op = S.op; if (!op) return;
    if (op.kind === 'pinch') { if (S.ptrs.size === 0) S.op = null; return; }
    S.op = null;
    const sp = evS(e), wp = toW(...sp);
    if (op.kind === 'free') {
      const pts = G.simplify(op.pts, Math.max(0.4, 2.5 / S.view.k));
      if (pts.length < 2) { draw(); return; }
      const closed = pts.length > 3 && C.dist(pts[0], pts.at(-1)) * S.view.k < 24;
      if (closed) pts.pop();
      S.draft = { nodes: G.smoothFromPoints(pts, closed).nodes.map((n) => ({ ...n, smooth: true })), target: draftTarget() };
      finishDraft(closed); return;
    }
    if (op.kind === 'bez') { refreshSide(); draw(); return; }
    if (op.kind === 'pan') {
      if (op.tapSwitch && !op.panning) { // boş yere dokunuş: başka parçaya geç ya da seçimi kaldır
        const pc = pieceAt(wp);
        if (pc && pc.id !== S.ctx) { setCtx(pc.id); api.toast(`#${pc.no} ${pc.name} düzenleniyor`); return; }
        S.sel = null; refreshSide(); draw();
      }
      return;
    }
    if (['node', 'handle', 'mark', 'movepiece', 'movepath'].includes(op.kind)) { if (op.started) { if (op.kind === 'node' && S.sel?.ref?.kind === 'outline') M.pruneEdges(piece()); changed(); } return; }
    if (op.kind === 'tap') tapAction(wp, sp, op.px || 12);
  };
  cv.addEventListener('pointerup', up);
  cv.addEventListener('pointercancel', (e) => { S.ptrs.delete(e.pointerId); if (S.op?.started) changed(); S.op = null; draw(); });
  cv.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse' && !S.op) { S.cursor = null; draw(); } });
  cv.addEventListener('wheel', (e) => { e.preventDefault(); const sp = evS(e); zoomAt(Math.exp(-e.deltaY * 0.0015), sp[0], sp[1]); }, { passive: false });

  function tapAction(wp, sp, px) {
    const t = S.tool;
    if (t === 'cizgi' || t === 'egri') {
      const from = S.draft?.nodes.at(-1)?.p;
      if (S.draft && S.draft.nodes.length >= 3) { const f = toS(S.draft.nodes[0].p); if (Math.hypot(f[0] - sp[0], f[1] - sp[1]) <= px) { finishDraft(true); return; } }
      addDraftPoint(snap(wp, { from }).p, { smooth: t === 'egri' }); return;
    }
    if (t === 'nokta') { const sg = hitSeg(wp, px); if (!sg) { api.toast('Bir çizgiye dokun'); return; } begin('nokta ekle'); const np = npOf(sg.ref); const n = G.insertNode(np, sg.k, sg.t); S.sel = { t: 'node', ref: sg.ref, idx: np.nodes.indexOf(n) }; changed(); return; }
    if (t === 'sil') {
      const h = hitNode(sp, px); if (!h) { api.toast('Bir düğüme dokun'); return; }
      const np = npOf(h.ref); begin('nokta sil');
      if (!G.removeNode(np, h.idx)) {
        if (h.ref.kind === 'outline') { api.undoLast(); api.toast('Parça sınırında en az 3 nokta kalmalı'); return; }
        removePath(h.ref); api.toast('Çizgi silindi'); changed(); return;
      }
      if (h.ref.kind === 'outline') { if (!np.nodes.some((n) => n.brk)) np.nodes[0].brk = true; M.pruneEdges(piece()); }
      S.sel = null; changed(); return;
    }
    if (t === 'bol') {
      let h = hitNode(sp, px), ref, idx;
      if (h) { ref = h.ref; idx = h.idx; }
      else { const sg = hitSeg(wp, px); if (!sg) { api.toast('Bir çizgiye ya da düğüme dokun'); return; } ref = sg.ref; }
      if (ref.kind === 'outline') { api.toast('Parça sınırı bölünemez (parça açık kalır). Yardımcı ya da iç çizgilerde kullan.'); return; }
      begin('böl');
      const np = npOf(ref);
      if (!h) { const sg = hitSeg(wp, px); const n = G.insertNode(np, sg.k, sg.t); idx = np.nodes.indexOf(n); }
      const parts = G.splitAtNode(np, idx);
      replacePath(ref, parts);
      S.sel = null; changed(); api.toast(parts.length === 2 ? 'Çizgi ikiye bölündü' : 'Kapalı çizgi açıldı'); return;
    }
    if (t === 'birlestir') {
      // ikinci dokunuşta önce başka çizgilerin uçları aranır (iki uç aynı noktada olabilir)
      const h = (S.joinA && hitNode(sp, px, refs().filter((r) => !sameRef(r, S.joinA.ref) && r.kind !== 'outline'))) || hitNode(sp, px); const np = h && npOf(h.ref);
      if (!h || np.closed || (h.idx !== 0 && h.idx !== np.nodes.length - 1) || h.ref.kind === 'outline') { api.toast('Açık bir çizginin ucuna dokun'); return; }
      const end = h.idx === 0 ? 'start' : 'end';
      if (!S.joinA) { S.joinA = { ref: h.ref, end }; hint('Şimdi birleşecek ikinci ucun üstüne dokun'); draw(); return; }
      const A = S.joinA; S.joinA = null; hint('');
      begin('birleştir');
      if (sameRef(A.ref, h.ref)) { if (A.end === end) { api.undoLast(); return; } G.closePath(np); changed(); api.toast('Çizgi kapatıldı'); return; }
      const j = G.joinPaths(npOf(A.ref), A.end, np, end);
      replacePath(A.ref, [j]); removePath(h.ref);
      S.sel = { t: 'path', ref: A.ref }; changed(); api.toast('Çizgiler birleştirildi'); return;
    }
    if (t === 'kenar') {
      const pc = piece(); const h = hitNode(sp, px, pc ? [{ kind: 'outline', id: pc.outline.id, piece: pc.id }] : []);
      if (!h) { api.toast('Parça sınırındaki bir düğüme dokun'); return; }
      begin('kenar başı'); const n = pc.outline.nodes[h.idx]; n.brk = !n.brk; if (!pc.outline.nodes.some((q) => q.brk)) pc.outline.nodes[0].brk = true; M.pruneEdges(pc);
      S.sel = { t: 'node', ref: h.ref, idx: h.idx }; changed(); return;
    }
    if (['centik', 'binme', 'delik', 'aksesuar', 'referans'].includes(t)) { placeMark(t, wp); return; }
    if (t === 'olcu') {
      const p = snap(wp, { from: S.dimA }).p;
      if (!S.dimA) { S.dimA = p; hint('Ölçünün ikinci noktasına dokun'); draw(); return; }
      const pc = piece(); begin('ölçü'); pc.dims.push({ a: G.rp(S.dimA), b: G.rp(p), off: 8 }); S.dimA = null; hint(''); S.sel = { t: 'dim', piece: pc.id, idx: pc.dims.length - 1 }; changed(); return;
    }
    if (t === 'yazi') { const s = S.text.trim(); if (!s) { api.toast('Önce alttaki kutuya yazıyı gir'); return; } const pc = piece(); begin('yazı'); pc.texts.push({ p: G.rp(snap(wp).p), s, h: 3 }); S.sel = { t: 'text', piece: pc.id, idx: pc.texts.length - 1 }; changed(); return; }
  }
  function replacePath(ref, parts) {
    const p = P();
    if (ref.kind === 'sketch') { const i = p.sketch.paths.findIndex((q) => q.id === ref.id); p.sketch.paths.splice(i, 1, ...parts); }
    else if (ref.kind === 'line') { const pc = p.pieces.find((q) => q.id === ref.piece), i = pc.lines.findIndex((l) => l.id === ref.id), kind = pc.lines[i].kind; pc.lines.splice(i, 1, ...parts.map((np, k) => ({ id: k ? G.uid('ln') : ref.id, kind, path: np }))); }
  }
  function removePath(ref) {
    const p = P();
    if (ref.kind === 'sketch') p.sketch.paths = p.sketch.paths.filter((q) => q.id !== ref.id);
    else if (ref.kind === 'line') { const pc = p.pieces.find((q) => q.id === ref.piece); pc.lines = pc.lines.filter((l) => l.id !== ref.id); }
  }

  /* ---------- klavye ---------- */
  cv.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? api.redo() : api.undo(); return; }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); api.redo(); return; }
    if (e.key === 'Escape') { if (S.draft) { S.draft = null; } S.sel = null; S.joinA = null; S.dimA = null; hint(''); refreshSide(); draw(); return; }
    if (e.key === 'Enter' && S.draft) { finishDraft(false); return; }
    if ((e.key === 'Delete' || e.key === 'Backspace') && S.sel) { e.preventDefault(); deleteSel(); }
  });
  function deleteSel() {
    const sel = S.sel; if (!sel) return;
    const pc = sel.piece ? P().pieces.find((q) => q.id === sel.piece) : piece();
    begin('sil');
    if (sel.t === 'node') { const np = npOf(sel.ref); if (!G.removeNode(np, sel.idx)) { if (sel.ref.kind === 'outline') { api.undoLast(); api.toast('Parça sınırında en az 3 nokta kalmalı'); return; } removePath(sel.ref); } else if (sel.ref.kind === 'outline') { if (!np.nodes.some((n) => n.brk)) np.nodes[0].brk = true; M.pruneEdges(piece()); } }
    else if (sel.t === 'path') { if (sel.ref.kind === 'outline') { api.undoLast(); api.toast('Parça sınırı silinemez; parçayı silmek için parça panelini kullan'); return; } removePath(sel.ref); }
    else if (sel.t === 'mark') pc.marks = pc.marks.filter((m) => m.id !== sel.id);
    else if (sel.t === 'dim') pc.dims.splice(sel.idx, 1);
    else if (sel.t === 'text') pc.texts.splice(sel.idx, 1);
    S.sel = null; changed();
  }

  /* ---------- çizim ---------- */
  function hud(wp, extra) {
    const el = $('.ed-hud'); if (!wp) { el.textContent = ''; return; }
    let s = `X ${f1(wp[0])}  Y ${f1(wp[1])} mm`;
    const last = S.draft?.nodes.at(-1)?.p || S.dimA;
    if (last && S.cursor) { const d = C.sub(S.cursor.p, last); s += `  ·  L ${f1(Math.hypot(...d))}  ∠ ${f1((-Math.atan2(d[1], d[0]) * 180 / Math.PI + 360) % 360)}°`; }
    if (extra) s += '  ·  ' + extra;
    el.textContent = s;
  }
  let raf = 0;
  function draw() { if (!raf) raf = requestAnimationFrame(() => { raf = 0; paint(); }); }
  function setStroke(lay, alpha = 1) {
    const L = M.LAYER[lay], u = P().layers[lay] || {};
    ctx2.strokeStyle = u.color || L.color; ctx2.fillStyle = u.color || L.color; ctx2.globalAlpha = alpha;
    ctx2.lineWidth = Math.max(1, Math.min(4, (u.width || L.width) / 0.25 * 1.4));
    const dash = (u.type && M.LINE_TYPES[u.type] ? M.LINE_TYPES[u.type].dash : L.dash).map((v) => Math.max(1.5, v * S.view.k));
    ctx2.setLineDash(dash);
  }
  function pathOnCanvas(path) {
    ctx2.beginPath();
    if (!path.segs.length) return;
    ctx2.moveTo(...toS(path.segs[0].a));
    for (const s of path.segs) { if (s.t === 'L') ctx2.lineTo(...toS(s.b)); else ctx2.bezierCurveTo(...toS(s.c1), ...toS(s.c2), ...toS(s.b)); }
    if (path.closed) ctx2.closePath();
  }
  function drawItems(items, alpha) {
    const p = P();
    for (const it of items) {
      if (p.layers[it.layer]?.visible === false) continue;
      setStroke(it.layer, alpha);
      if (it.t === 'path') { pathOnCanvas(it.path); ctx2.stroke(); }
      else if (it.t === 'poly') { ctx2.beginPath(); it.pts.forEach((q, i) => (i ? ctx2.lineTo(...toS(q)) : ctx2.moveTo(...toS(q)))); if (it.closed) ctx2.closePath(); ctx2.stroke(); }
      else if (it.t === 'circle') { ctx2.setLineDash([]); const c = toS(it.c); ctx2.beginPath(); ctx2.arc(c[0], c[1], Math.max(1.5, it.r * S.view.k), 0, Math.PI * 2); ctx2.stroke(); }
      else if (it.t === 'text') {
        const fs = it.h * 1.35 * S.view.k; if (fs < 5) continue;
        const q = toS(it.p); ctx2.save(); ctx2.translate(q[0], q[1]); if (it.ang) ctx2.rotate(it.ang);
        ctx2.font = `${Math.min(64, fs)}px system-ui, sans-serif`; ctx2.textAlign = it.align === 'c' ? 'center' : 'left'; ctx2.textBaseline = 'alphabetic'; ctx2.fillText(it.s, 0, 0); ctx2.restore();
      }
    }
    ctx2.globalAlpha = 1; ctx2.setLineDash([]);
  }
  function paint() {
    const p = P();
    ctx2.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx2.fillStyle = '#0b1324'; ctx2.fillRect(0, 0, W, H);
    if (!p) return;
    const st = api.settings();
    // ızgara: 1 mm'lik ızgara da gerçek ölçüdür; yoğunsa seyreltilir
    if (st.showGrid !== false) {
      let g = st.grid || 5; while (g * S.view.k < 7) g *= g === 1 ? 5 : g === 5 ? 2 : g === 2 ? 2.5 : 2;
      const [x0, y0] = toW(0, 0), [x1, y1] = toW(W, H), major = g * 10;
      ctx2.lineWidth = 1;
      for (const [step, col] of [[g, '#132039'], [major, '#1e2f52']]) {
        if (step * S.view.k < 4) continue;
        ctx2.strokeStyle = col; ctx2.beginPath();
        for (let x = Math.floor(x0 / step) * step; x <= x1; x += step) { const s = toS([x, 0])[0]; ctx2.moveTo(Math.round(s) + 0.5, 0); ctx2.lineTo(Math.round(s) + 0.5, H); }
        for (let y = Math.floor(y0 / step) * step; y <= y1; y += step) { const s = toS([0, y])[1]; ctx2.moveTo(0, Math.round(s) + 0.5); ctx2.lineTo(W, Math.round(s) + 0.5); }
        ctx2.stroke();
      }
      const o = toS([0, 0]); ctx2.strokeStyle = '#33507f'; ctx2.beginPath(); ctx2.moveTo(o[0], 0); ctx2.lineTo(o[0], H); ctx2.moveTo(0, o[1]); ctx2.lineTo(W, o[1]); ctx2.stroke();
    }
    const act = piece();
    drawItems(sketchItems(p), act ? 0.4 : 1);
    for (const pc of p.pieces) drawItems(cachedItems(pc), !act || pc.id === act.id ? 1 : 0.28);
    // etkin bağlam düzenleme katmanı
    const list = refs();
    for (const ref of list) {
      const np = npOf(ref); if (!np) continue;
      const selPath = S.sel && sameRef(S.sel.ref, ref);
      if (selPath) { ctx2.strokeStyle = '#38bdf8'; ctx2.lineWidth = 3; ctx2.setLineDash([]); pathOnCanvas(G.toCurve(np)); ctx2.stroke(); }
      if (!selPath && ref.kind === 'sketch' && list.length > 40) continue;
      np.nodes.forEach((n, i) => {
        const q = toS(n.p), sel = S.sel && (S.sel.t === 'node' || S.sel.t === 'handle') && sameRef(S.sel.ref, ref) && S.sel.idx === i;
        ctx2.setLineDash([]); ctx2.lineWidth = 1.5;
        ctx2.fillStyle = sel ? '#38bdf8' : '#0b1324'; ctx2.strokeStyle = n.brk && ref.kind === 'outline' ? '#f59e0b' : '#e2e8f0';
        ctx2.beginPath();
        if (n.brk && ref.kind === 'outline') { ctx2.moveTo(q[0], q[1] - 6); ctx2.lineTo(q[0] + 6, q[1]); ctx2.lineTo(q[0], q[1] + 6); ctx2.lineTo(q[0] - 6, q[1]); ctx2.closePath(); }
        else if (n.i || n.o) ctx2.arc(q[0], q[1], 4.5, 0, Math.PI * 2); else ctx2.rect(q[0] - 4, q[1] - 4, 8, 8);
        ctx2.fill(); ctx2.stroke();
        if (sel) for (const w of ['i', 'o']) if (n[w]) { const h = toS(C.add(n.p, n[w])); ctx2.strokeStyle = '#38bdf8'; ctx2.beginPath(); ctx2.moveTo(...q); ctx2.lineTo(...h); ctx2.stroke(); ctx2.beginPath(); ctx2.arc(h[0], h[1], 5, 0, Math.PI * 2); ctx2.fillStyle = S.sel.t === 'handle' && S.sel.which === w ? '#38bdf8' : '#0b1324'; ctx2.fill(); ctx2.stroke(); }
      });
    }
    // seçili işaret
    if (S.sel && (S.sel.t === 'mark' || S.sel.t === 'dim' || S.sel.t === 'text')) {
      const pc = p.pieces.find((q) => q.id === S.sel.piece);
      const pts = !pc ? [] : S.sel.t === 'mark' ? [markPoint(pc, pc.marks.find((m) => m.id === S.sel.id) || {})] : S.sel.t === 'dim' ? [pc.dims[S.sel.idx]?.a, pc.dims[S.sel.idx]?.b] : [pc.texts[S.sel.idx]?.p];
      ctx2.strokeStyle = '#38bdf8'; ctx2.lineWidth = 2; ctx2.setLineDash([]);
      for (const q0 of pts) if (q0) { const q = toS(q0); ctx2.beginPath(); ctx2.arc(q[0], q[1], 9, 0, Math.PI * 2); ctx2.stroke(); }
    }
    if (S.joinA) { const np = npOf(S.joinA.ref); const n = np && (S.joinA.end === 'start' ? np.nodes[0] : np.nodes.at(-1)); if (n) { const q = toS(n.p); ctx2.strokeStyle = '#22c55e'; ctx2.lineWidth = 2; ctx2.beginPath(); ctx2.arc(q[0], q[1], 10, 0, Math.PI * 2); ctx2.stroke(); } }
    // taslak
    if (S.draft && S.draft.nodes.length) {
      const np = { closed: false, nodes: S.draft.nodes };
      ctx2.strokeStyle = '#38bdf8'; ctx2.lineWidth = 2; ctx2.setLineDash([]);
      if (np.nodes.length > 1) { pathOnCanvas(G.toCurve(np)); ctx2.stroke(); }
      for (const n of np.nodes) { const q = toS(n.p); ctx2.fillStyle = '#38bdf8'; ctx2.fillRect(q[0] - 3, q[1] - 3, 6, 6); }
      if (S.cursor && S.tool !== 'bezier') { ctx2.setLineDash([5, 4]); ctx2.beginPath(); ctx2.moveTo(...toS(np.nodes.at(-1).p)); ctx2.lineTo(...toS(S.cursor.p)); ctx2.stroke(); ctx2.setLineDash([]); }
      if (np.nodes.length >= 3) { const f = toS(np.nodes[0].p); ctx2.strokeStyle = '#22c55e'; ctx2.beginPath(); ctx2.arc(f[0], f[1], 9, 0, Math.PI * 2); ctx2.stroke(); }
    }
    if (S.op?.kind === 'free' && S.op.pts.length > 1) { ctx2.strokeStyle = '#38bdf8'; ctx2.lineWidth = 2; ctx2.beginPath(); S.op.pts.forEach((q, i) => (i ? ctx2.lineTo(...toS(q)) : ctx2.moveTo(...toS(q)))); ctx2.stroke(); }
    if (S.dimA) { const a = toS(S.dimA); ctx2.strokeStyle = '#cbd5e1'; ctx2.setLineDash([4, 3]); ctx2.beginPath(); ctx2.moveTo(...a); if (S.cursor) ctx2.lineTo(...toS(S.cursor.p)); ctx2.stroke(); ctx2.setLineDash([]); }
    if (S.cursor && (DRAW.has(S.tool) || S.tool === 'olcu')) { const q = toS(S.cursor.p); ctx2.strokeStyle = S.cursor.kind === 'nokta' ? '#f59e0b' : '#94a3b8'; ctx2.lineWidth = 1; ctx2.beginPath(); ctx2.moveTo(q[0] - 8, q[1]); ctx2.lineTo(q[0] + 8, q[1]); ctx2.moveTo(q[0], q[1] - 8); ctx2.lineTo(q[0], q[1] + 8); ctx2.stroke(); }
    // ölçek çubuğu (gerçek mm)
    const nice = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000]; let L = nice.find((v) => v * S.view.k >= 60) || 1000;
    $('.ed-scale').innerHTML = `<i style="width:${Math.round(L * S.view.k)}px"></i><span>${L} mm</span>`;
  }

  /* ---------- üst çubuk, araçlar, seçenekler ---------- */
  function renderBar() {
    const p = P(); const sel = $('.ed-ctx');
    if (!p) { sel.innerHTML = ''; return; }
    sel.innerHTML = `<option value="stampa">Stampa (yardımcı çizim)</option>` + p.pieces.map((pc) => `<option value="${esc(pc.id)}">#${pc.no} ${esc(pc.name)}${pc.code ? ' · ' + esc(pc.code) : ''}${pc.outline.closed ? '' : ' (sınır yok)'}</option>`).join('');
    if (S.ctx !== 'stampa' && !p.pieces.some((q) => q.id === S.ctx)) S.ctx = 'stampa';
    sel.value = S.ctx;
    $('[data-a="undo"]').disabled = !api.canUndo(); $('[data-a="redo"]').disabled = !api.canRedo();
  }
  function renderTools() {
    const pc = piece();
    $('.ed-tools').innerHTML = TOOLS.filter((t) => !t.piece || pc).map((t) => `<button type="button" data-tool="${t.id}" class="${S.tool === t.id ? 'on' : ''}" title="${esc(t.tip)}">${esc(t.label)}</button>`).join('');
    hint(pc && !pc.outline.closed && DRAW.has(S.tool) ? 'Parça sınırını çiz: ilk noktaya dokununca sınır kapanır ve parça oluşur.' : '');
    renderOpts();
  }
  function renderOpts() {
    const t = S.tool, pc = piece(), el = $('.ed-opts');
    let h = '';
    if (DRAW.has(t)) {
      if (pc && pc.outline.closed) h += `<label>Çizgi türü <select data-o="lineKind">${Object.entries(M.LINE_KINDS).map(([k, v]) => `<option value="${k}"${S.lineKind === k ? ' selected' : ''}>${esc(v.name)}</option>`).join('')}</select></label>`;
      if (t !== 'serbest') h += `<span class="grp" title="Ölçüyle çizim: son noktadan uzunluk ve açı (0° sağ, 90° yukarı) ya da mutlak X, Y">
        <label>L <input data-o="L" inputmode="decimal" placeholder="mm" size="5"></label><label>∠ <input data-o="A" inputmode="decimal" placeholder="°" size="4"></label>
        <label>X <input data-o="X" inputmode="decimal" size="5"></label><label>Y <input data-o="Y" inputmode="decimal" size="5"></label>
        <button type="button" data-a="numadd">Nokta ekle</button></span>`;
      if (S.draft?.nodes.length) h += `<button type="button" data-a="finish">Bitir (açık)</button>${S.draft.nodes.length >= 3 ? '<button type="button" data-a="close" class="ok">Kapat</button>' : ''}<button type="button" data-a="cancel">İptal</button>`;
    }
    if (['centik', 'binme', 'delik', 'aksesuar', 'referans'].includes(t)) {
      h += `<label>Etiket <input data-o="label" value="${esc(S.mark.label)}" size="5" placeholder="A"></label>`;
      if (t === 'delik' || t === 'aksesuar') h += `<label>Çap (mm) <input data-o="d" inputmode="decimal" value="${f1(S.mark.d)}" size="4"></label>`;
      if (t === 'centik') h += `<label>Derinlik <input data-o="depth" inputmode="decimal" value="${f1(S.mark.depth)}" size="4"></label><label>Şekil <select data-o="shape"><option value="I"${S.mark.shape === 'I' ? ' selected' : ''}>Düz kesik</option><option value="V"${S.mark.shape === 'V' ? ' selected' : ''}>V çentik</option></select></label>`;
    }
    if (t === 'yazi') h += `<label class="wide">Yazı <input data-o="text" value="${esc(S.text)}" placeholder="Açıklama"></label>`;
    if (t === 'birlestir' && S.joinA) h += `<button type="button" data-a="cancel">Vazgeç</button>`;
    // çubuk hiç gizlenmez (gizlenip açılması tuvalin boyunu değiştirir); boşken aracın açıklaması yazılır
    el.innerHTML = h || `<span class="tip">${esc(TOOLS.find((x) => x.id === t)?.tip || '')}</span>`;
  }
  host.addEventListener('change', (e) => {
    const o = e.target.dataset.o; if (!o) return;
    if (o === 'lineKind') S.lineKind = e.target.value;
    if (o === 'label') S.mark.label = e.target.value.slice(0, 12);
    if (o === 'd') { const v = pn(e.target.value); if (v > 0) S.mark.d = v; }
    if (o === 'depth') { const v = pn(e.target.value); if (v > 0) S.mark.depth = v; }
    if (o === 'shape') S.mark.shape = e.target.value;
  });
  host.addEventListener('input', (e) => { if (e.target.dataset.o === 'text') S.text = e.target.value.slice(0, 120); if (e.target.dataset.o === 'label') S.mark.label = e.target.value.slice(0, 12); });
  host.addEventListener('keydown', (e) => { if (e.key === 'Enter' && ['L', 'A', 'X', 'Y'].includes(e.target.dataset.o)) { e.preventDefault(); host.querySelector('[data-a="numadd"]')?.click(); } });
  $('.ed-ctx').addEventListener('change', (e) => setCtx(e.target.value));

  /* ---------- yan panel (denetçi) ---------- */
  function refreshSide() { renderBar(); renderOpts(); renderInspector(); if (S.showLayers) renderLayers(); }
  function renderInspector() {
    const el = $('.ed-insp'), p = P(); if (!p) { el.innerHTML = ''; return; }
    const pc = piece(), sel = S.sel;
    let h = '';
    if (sel && (sel.t === 'node' || sel.t === 'handle')) {
      const np = npOf(sel.ref), n = np?.nodes[sel.idx];
      if (n) {
        const type = !n.i && !n.o ? 'kose' : n.cusp ? 'bezier' : 'yumusak';
        h += `<h4>Düğüm ${sel.idx + 1} / ${np.nodes.length}</h4>
        <div class="row2"><label>X (mm)<input data-i="nx" inputmode="decimal" value="${f2(n.p[0])}"></label><label>Y (mm)<input data-i="ny" inputmode="decimal" value="${f2(n.p[1])}"></label></div>
        <div class="seg">${[['kose', 'Köşe'], ['yumusak', 'Yumuşak'], ['bezier', 'Bezier (kırık)']].map(([k, v]) => `<button type="button" data-a="ntype" data-v="${k}" class="${type === k ? 'on' : ''}">${v}</button>`).join('')}</div>`;
        if (sel.ref.kind === 'outline') h += `<label class="chk"><input type="checkbox" data-i="brk"${n.brk ? ' checked' : ''}> Kenar başı (yeni kenar burada başlar)</label>`;
        h += `<div class="acts"><button type="button" data-a="delsel" class="danger">Düğümü sil</button></div>`;
      }
    } else if (sel && sel.t === 'path') {
      const np = npOf(sel.ref);
      if (np) {
        h += `<h4>${sel.ref.kind === 'sketch' ? 'Yardımcı çizgi' : sel.ref.kind === 'outline' ? 'Parça sınırı' : 'İç çizgi'}</h4><p class="m">${np.nodes.length} nokta · uzunluk ${f1(G.length(np))} mm · ${np.closed ? 'kapalı' : 'açık'}</p>`;
        if (sel.ref.kind === 'line') { const l = pc.lines.find((q) => q.id === sel.ref.id); h += `<label>Çizgi türü<select data-i="lkind">${Object.entries(M.LINE_KINDS).map(([k, v]) => `<option value="${k}"${l.kind === k ? ' selected' : ''}>${esc(v.name)}</option>`).join('')}</select></label>`; }
        h += '<div class="acts">';
        if (!np.closed && np.nodes.length >= 3 && sel.ref.kind !== 'outline') h += `<button type="button" data-a="closepath">Kapat</button>`;
        if (sel.ref.kind === 'sketch' && np.closed) h += `<button type="button" data-a="topiece" class="ok">Saya parçası yap</button>`;
        if (sel.ref.kind === 'sketch') h += `<button type="button" data-a="dupp">Kopyala</button>`;
        if (sel.ref.kind !== 'outline') h += `<button type="button" data-a="delsel" class="danger">Sil</button>`;
        h += '</div>';
      }
    } else if (sel && sel.t === 'mark' && pc) {
      const m = pc.marks.find((q) => q.id === sel.id);
      if (m) {
        h += `<h4>${esc(M.MARK_KINDS[m.kind]?.name || 'İşaret')}</h4><label>Etiket<input data-i="mlabel" value="${esc(m.label || '')}"></label>`;
        if (m.edge) { const f = edgeFrame(pc, m.edge, m.at); h += `<label>Kenar başından (mm)<input data-i="mat" inputmode="decimal" value="${f2(m.at || 0)}"></label><p class="m">Kenar uzunluğu ${f1(f?.len || 0)} mm</p>`; }
        else h += `<div class="row2"><label>X<input data-i="mx" inputmode="decimal" value="${f2(m.p[0])}"></label><label>Y<input data-i="my" inputmode="decimal" value="${f2(m.p[1])}"></label></div>`;
        if (m.kind === 'delik' || m.kind === 'aksesuar') h += `<label>Çap (mm)<input data-i="md" inputmode="decimal" value="${f1(m.d || 3)}"></label>`;
        if (m.kind === 'centik') h += `<label>Derinlik (mm)<input data-i="mdepth" inputmode="decimal" value="${f1(m.depth || 3)}"></label>`;
        h += `<div class="acts"><button type="button" data-a="delsel" class="danger">Sil</button></div>`;
      }
    } else if (sel && sel.t === 'dim' && pc) {
      const d = pc.dims[sel.idx];
      if (d) h += `<h4>Ölçü</h4><p class="m">${f2(C.dist(d.a, d.b))} mm</p><label>Öteleme (mm)<input data-i="doff" inputmode="decimal" value="${f1(d.off ?? 8)}"></label><label>Yazı (boş: ölçü)<input data-i="dtext" value="${esc(d.text || '')}"></label><div class="acts"><button type="button" data-a="delsel" class="danger">Sil</button></div>`;
    } else if (sel && sel.t === 'text' && pc) {
      const tx = pc.texts[sel.idx];
      if (tx) h += `<h4>Yazı</h4><label>Metin<input data-i="ttext" value="${esc(tx.s)}"></label><label>Yükseklik (mm)<input data-i="th" inputmode="decimal" value="${f1(tx.h || 3)}"></label><div class="acts"><button type="button" data-a="delsel" class="danger">Sil</button></div>`;
    }
    if (pc) {
      const m = pc.outline.closed ? measure(pc) : null, iss = pc.outline.closed ? checkPiece(pc) : [];
      h += `<h4 class="pc">#${pc.no} ${esc(pc.name)}</h4>`;
      if (m) h += `<p class="m">Net ${f1(m.width)} × ${f1(m.height)} mm · çevre ${f1(m.netPerimeter)} mm<br>Net alan ${f1(m.netArea / 100)} cm² · kesim ${f1(m.cutArea / 100)} cm²</p>`;
      else h += `<p class="m warn">Sınır henüz kapalı değil: çizim araçlarından biriyle sınırı çiz.</p>`;
      for (const x of iss.slice(0, 4)) h += `<p class="iss ${x.level === 'hata' ? 'bad' : ''}">${x.level === 'hata' ? 'Hata' : 'Uyarı'}: ${esc(x.msg)}</p>`;
      h += `<div class="row2"><label>Δx<input data-i="mvx" inputmode="decimal" placeholder="mm"></label><label>Δy<input data-i="mvy" inputmode="decimal" placeholder="mm"></label></div><div class="acts"><button type="button" data-a="move">Taşı</button></div>
      <div class="row2"><label>Açı (°, + saat yönü tersi)<input data-i="rot" inputmode="decimal" placeholder="15"></label><span class="acts"><button type="button" data-a="rotate">Döndür</button></span></div>
      <div class="acts"><button type="button" data-a="rot" data-v="90" title="Saat yönünün tersine">⟲ 90°</button><button type="button" data-a="rot" data-v="-90" title="Saat yönünde">⟳ 90°</button><button type="button" data-a="mirror" title="Dikey eksene göre ayna: sağ ↔ sol">Ayna (sağ/sol)</button></div>
      <div class="acts"><button type="button" data-a="copypc">Kopyala</button><button type="button" data-a="details">Pay ve kenarlar…</button><button type="button" data-a="delpc" class="danger">Parçayı sil</button></div>`;
    } else if (!sel) h += `<h4>Stampa</h4><p class="m">Yardımcı (stampa) çizgilerini burada çiz; kapalı bir çizgiyi seçip <b>Saya parçası yap</b> ile parçaya dönüştür ya da üstteki <b>+ Parça</b> ile doğrudan parça sınırı çiz.</p><p class="m">${p.sketch.paths.length} yardımcı çizgi · ${p.pieces.length} parça</p>`;
    el.innerHTML = h;
  }
  host.addEventListener('change', (e) => {
    const k = e.target.dataset.i; if (!k) return;
    const p = P(), pc = piece(), sel = S.sel, v = pn(e.target.value);
    const bad = () => { e.target.classList.add('bad'); api.toast('Geçerli bir sayı gir'); };
    if (['mvx', 'mvy', 'rot'].includes(k)) return;   // düğmeyle uygulanır
    if (k === 'nx' || k === 'ny') { if (!Number.isFinite(v)) return bad(); begin('düğüm'); const n = npOf(sel.ref).nodes[sel.idx]; n.p[k === 'nx' ? 0 : 1] = v; n.p = G.rp(n.p); changed(); return; }
    if (k === 'brk') { begin('kenar başı'); const n = npOf(sel.ref).nodes[sel.idx]; n.brk = e.target.checked; if (!pc.outline.nodes.some((q) => q.brk)) pc.outline.nodes[0].brk = true; M.pruneEdges(pc); changed(); return; }
    if (k === 'lkind') { begin('çizgi türü'); pc.lines.find((q) => q.id === sel.ref.id).kind = e.target.value; changed(); return; }
    const m = sel?.t === 'mark' ? pc?.marks.find((q) => q.id === sel.id) : null;
    if (m) {
      if (k === 'mlabel') { begin('etiket'); m.label = e.target.value.slice(0, 12); changed(); return; }
      if (!Number.isFinite(v)) return bad();
      begin('işaret');
      if (k === 'mat') m.at = Math.max(0, v); if (k === 'mx') m.p = [v, m.p[1]]; if (k === 'my') m.p = [m.p[0], v];
      if (k === 'md' && v > 0) m.d = v; if (k === 'mdepth' && v > 0) m.depth = v;
      changed(); return;
    }
    if (sel?.t === 'dim') { const d = pc.dims[sel.idx]; begin('ölçü'); if (k === 'doff' && Number.isFinite(v)) d.off = v; if (k === 'dtext') d.text = e.target.value.slice(0, 30) || undefined; changed(); return; }
    if (sel?.t === 'text') { const tx = pc.texts[sel.idx]; begin('yazı'); if (k === 'ttext') tx.s = e.target.value.slice(0, 120) || tx.s; if (k === 'th' && v > 0) tx.h = v; changed(); }
    void p;
  });
  host.addEventListener('click', (e) => {
    const tb = e.target.closest('[data-tool]'); if (tb) { setTool(tb.dataset.tool); return; }
    const b = e.target.closest('[data-a]'); if (!b || !host.contains(b)) return;
    const a = b.dataset.a, p = P(), pc = piece();
    if (a === 'undo') { api.undo(); return; } if (a === 'redo') { api.redo(); return; }
    if (a === 'fit') return fit(); if (a === 'zin') return zoomAt(1.4); if (a === 'zout') return zoomAt(1 / 1.4);
    if (a === 'layers') { S.showLayers = !S.showLayers; $('.ed-layers').hidden = !S.showLayers; if (S.showLayers) renderLayers(); return; }
    if (a === 'newpiece') {
      begin('yeni parça');
      const no = M.nextPieceNo(p), mat = p.material;
      const np = M.makePiece({ no, name: 'Parça ' + no, code: (p.code ? p.code + '-' : '') + String(no).padStart(2, '0'), side: p.side, material: mat, outline: { id: G.uid('p'), closed: false, nodes: [] } });
      const matObj = p.materials.find((m) => m.id === mat); M.refreshAutoAllowances(np, matObj, p.method);
      p.pieces.push(np); api.changed(); setCtx(np.id); setTool('cizgi'); api.toast('Yeni parça: sınırını çiz (ilk noktaya dokununca kapanır)'); return;
    }
    if (a === 'numadd') { const g = (o) => pn(host.querySelector(`[data-o="${o}"]`)?.value); numericPoint(g('L'), g('A'), g('X'), g('Y')); ['L', 'X', 'Y'].forEach((o) => { const i = host.querySelector(`[data-o="${o}"]`); if (i) i.value = ''; }); host.querySelector('[data-o="L"]')?.focus(); return; }
    if (a === 'finish') return finishDraft(false);
    if (a === 'close') return finishDraft(true);
    if (a === 'cancel') { S.draft = null; S.joinA = null; S.dimA = null; hint(''); refreshSide(); draw(); return; }
    if (a === 'delsel') return deleteSel();
    if (a === 'ntype') {
      const np = npOf(S.sel.ref), n = np.nodes[S.sel.idx]; begin('düğüm türü');
      if (b.dataset.v === 'kose') { G.makeCorner(np, S.sel.idx); delete n.cusp; }
      else if (b.dataset.v === 'yumusak') { G.autoSmooth(np, S.sel.idx); delete n.cusp; }
      else { if (!n.i && !n.o) G.autoSmooth(np, S.sel.idx); n.cusp = true; }
      changed(); return;
    }
    if (a === 'closepath') { begin('kapat'); G.closePath(npOf(S.sel.ref)); changed(); return; }
    if (a === 'dupp') { begin('kopyala'); const c = G.cloneNew(npOf(S.sel.ref)); G.transform(c, G.moveFn(10, 10)); p.sketch.paths.push(c); S.sel = { t: 'path', ref: { kind: 'sketch', id: c.id } }; changed(); return; }
    if (a === 'topiece') {
      const src = npOf(S.sel.ref); begin('parça yap');
      const no = M.nextPieceNo(p), np = G.cloneNew(src);
      np.nodes.forEach((n) => { n.brk = !n.i && !n.o; }); if (!np.nodes.some((n) => n.brk)) np.nodes[0].brk = true;
      const npc = M.makePiece({ no, name: 'Parça ' + no, code: (p.code ? p.code + '-' : '') + String(no).padStart(2, '0'), side: p.side, material: p.material, outline: np });
      M.refreshAutoAllowances(npc, p.materials.find((m) => m.id === p.material), p.method);
      p.pieces.push(npc); api.changed(); setCtx(npc.id); api.toast(`#${no} parça oluşturuldu; stampa çizgisi yerinde kaldı`); return;
    }
    if (!pc) return;
    const c = measure(pc)?.box, ctr = c ? [(c.x0 + c.x1) / 2, (c.y0 + c.y1) / 2] : [0, 0];
    if (a === 'move') { const dx = pn(host.querySelector('[data-i="mvx"]').value) || 0, dy = pn(host.querySelector('[data-i="mvy"]').value) || 0; if (!Number.isFinite(dx) || !Number.isFinite(dy)) return api.toast('Geçerli sayı gir'); begin('taşı'); M.transformPiece(pc, G.moveFn(dx, dy)); changed(); return; }
    if (a === 'rotate' || a === 'rot') { const deg = a === 'rot' ? +b.dataset.v : pn(host.querySelector('[data-i="rot"]').value); if (!Number.isFinite(deg)) return api.toast('Açı gir (°)'); begin('döndür'); M.transformPiece(pc, G.rotateFn(ctr, -deg)); if (Number.isFinite(pc.forming?.esneme?.yonDeg)) pc.forming.esneme.yonDeg = ((pc.forming.esneme.yonDeg + deg) % 360 + 360) % 360; changed(); return; }
    if (a === 'mirror') { begin('ayna'); M.mirrorPiece(pc, ctr[0]); changed(); api.toast('Aynalandı: ' + M.SIDES[pc.side]); return; }
    if (a === 'copypc') { begin('parça kopyala'); const cp = M.copyPiece(pc, M.nextPieceNo(p)); M.transformPiece(cp, G.moveFn((c ? c.x1 - c.x0 : 50) + 30, 0)); p.pieces.push(cp); api.changed(); setCtx(cp.id); api.toast('Kopya oluşturuldu: #' + cp.no); return; }
    if (a === 'details') { api.openPiece(pc.id); return; }
    if (a === 'delpc') {
      if (b.dataset.arm !== '1') { b.dataset.arm = '1'; b.textContent = 'Emin misin? Tekrar dokun'; setTimeout(() => { if (b.isConnected) { b.dataset.arm = ''; b.textContent = 'Parçayı sil'; } }, 3500); return; }
      begin('parça sil'); M.removePiece(p, pc.id); api.changed(); setCtx('stampa'); api.toast('Parça silindi (geri al ile dönebilirsin)'); return;
    }
  });

  /* ---------- katman paneli ---------- */
  function renderLayers() {
    const p = P(), el = $('.ed-layers'); if (!p) return;
    el.innerHTML = `<div class="hd"><b>Katmanlar</b><button type="button" data-a="layers">✕</button></div>` + M.LAYERS.map((L) => { const u = p.layers[L.id]; return `<label class="ly"><input type="checkbox" data-ly="${L.id}"${u.visible !== false ? ' checked' : ''}><i style="background:${esc(u.color || L.color)}"></i>${esc(L.name)}</label>`; }).join('') + `<p class="m">Renk, kalınlık ve çizgi türü: Ayarlar → Katmanlar</p>`;
  }
  host.addEventListener('change', (e) => { const id = e.target.dataset.ly; if (!id) return; begin('katman'); P().layers[id].visible = e.target.checked; api.changed(); draw(); });

  return {
    S, draw, fit, refresh() { S.cache.clear(); if (S.ctx !== 'stampa' && !P()?.pieces.some((q) => q.id === S.ctx)) S.ctx = 'stampa'; if (S.sel && S.sel.ref && !npOf(S.sel.ref)) S.sel = null; renderBar(); renderTools(); refreshSide(); draw(); },
    setCtx, setTool, resize,
    setView(v) { if (v && v.k > 0) { S.view = { ...v }; draw(); } else requestAnimationFrame(() => { resize(); fit(); }); },
    destroy() { ro.disconnect(); },
  };
}
