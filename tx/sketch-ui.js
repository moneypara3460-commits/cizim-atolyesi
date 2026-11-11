// Teknik moda çizimi editörü (tam ekran). Telefon önce: tek parmak kaydırır / seçer, iki parmak yakınlaştırır.
// Bütün geometri tx/drawing.js ve tx/curve.js'te; burada yalnız etkileşim ve gösterim.
import * as C from './curve.js?v=20261112c';
import * as D from './drawing.js?v=20261112c';
import * as X from './export2d.js?v=20261112c';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const cm = (mm) => (Math.round(mm) / 10).toString().replace('.', ',');
const pnum = (s) => { const t = String(s).trim().replace(',', '.'); const v = Number(t); return t === '' || !Number.isFinite(v) ? null : v; };
const TOOLS = [['sel', '☝ Seç'], ['line', '╱ Çizgi'], ['curve', '∿ Eğri'], ['point', '• Nokta'], ['dim', '↔ Ölçü'], ['text', 'T Yazı'], ['detail', '✦ Detay']];

export function openSketchEditor(sk, { onChange, toast, meta = {}, sizeTables = [], productType = null }) {
  const root = document.createElement('div');
  root.id = 'skx';
  root.innerHTML = `<style>
    #skx { position: fixed; inset: 0; z-index: 30; background: #0b1222; display: flex; flex-direction: column; }
    #skx .bar { display: flex; gap: 5px; padding: 6px; overflow-x: auto; flex: none; align-items: center; }
    #skx .bar button { flex: 0 0 auto; padding: 8px 10px; }
    #skx .cv { flex: 1; position: relative; min-height: 120px; touch-action: none; }
    #skx canvas { position: absolute; inset: 0; width: 100%; height: 100%; touch-action: none; }
    #skx .pane { flex: none; max-height: 42vh; overflow-y: auto; padding: 6px 8px 10px; background: #0f172a; border-top: 1px solid #1e293b; }
    #skx .st { position: absolute; left: 8px; top: 6px; font-size: 12px; color: #94a3b8; pointer-events: none; }
    #skx .grp { display: flex; gap: 5px; flex-wrap: wrap; margin: 4px 0; align-items: flex-end; }
    #skx .grp > button { flex: 0 1 auto; }
    #skx label.f { flex: 1 1 90px; }
    #skx h4 { margin: 8px 0 2px; font-size: 13px; color: #cbd5e1; }
  </style>
  <div class="bar"><button data-k="close">✕ Kapat</button><b style="flex:1 0 auto;padding:0 6px;font-size:14px">${esc(sk.name)}</b>
    ${Object.entries(D.VIEWS).map(([k, v]) => `<button data-k="view" data-v="${k}">${v}</button>`).join('')}
    <button data-k="undo">↶</button><button data-k="redo">↷</button><button data-k="fit">Sığdır</button></div>
  <div class="bar" id="skx-tools">${TOOLS.map(([k, l]) => `<button data-k="tool" data-v="${k}">${l}</button>`).join('')}
    <button data-k="tog" data-v="sym">⇋ Simetri</button><button data-k="tog" data-v="snap">⌖ Yakala</button><button data-k="tog" data-v="grid">▦ 5 mm</button><button data-k="tog" data-v="multi">⧉ Çoklu</button></div>
  <div class="cv"><canvas></canvas><div class="st"></div></div>
  <div class="pane"></div>`;
  document.body.appendChild(root);
  const cv = root.querySelector('canvas'), st = root.querySelector('.st'), pane = root.querySelector('.pane');
  const ctx = cv.getContext('2d');
  const S = { view: 'front', tool: 'sel', sym: false, snap: true, grid: false, multi: false, sel: new Set(), pts: [], k: 1, ox: 0, oy: 0, dpr: 1, detail: 'dugme', text: '', stroke: 'solid', layer: null, tplType: productType && D.TEMPLATES[productType] ? productType : null, paper: 'A4', scale: '' };
  const undo = [], redo = [];
  const snapshot = () => JSON.stringify(sk);
  const push = () => { undo.push(snapshot()); if (undo.length > 80) undo.shift(); redo.length = 0; };
  const restoreFrom = (txt) => { const o = JSON.parse(txt); for (const k of Object.keys(sk)) delete sk[k]; Object.assign(sk, o); };
  const changed = () => { onChange && onChange(); draw(); };
  const layers = () => sk.views[S.view].layers;
  // varsayılan: şablon dışındaki ilk açık katman (şablon yeniden uygulanınca kullanıcının çizdikleri silinmesin)
  const activeLayer = () => layers().find((l) => l.id === S.layer && l.visible && !l.locked) || layers().find((l) => l.visible && !l.locked && l.name !== 'Şablon') || layers().find((l) => l.visible && !l.locked);
  const selEnts = () => [...S.sel].map((id) => D.findEnt(sk, S.view, id)?.e).filter(Boolean);

  /* ---------- görünüm ---------- */
  function resize() { const r = cv.getBoundingClientRect(); S.dpr = window.devicePixelRatio || 1; cv.width = Math.max(1, r.width * S.dpr); cv.height = Math.max(1, r.height * S.dpr); draw(); }
  function fit() {
    const r = cv.getBoundingClientRect(), b = D.viewBBox(sk, S.view) || { x0: -300, y0: -100, x1: 300, y1: 800 };
    const w = b.x1 - b.x0 || 100, h = b.y1 - b.y0 || 100;
    S.k = Math.min((r.width - 30) / w, (r.height - 30) / h); if (!(S.k > 0)) S.k = 1;
    S.ox = (b.x0 + b.x1) / 2 - r.width / 2 / S.k; S.oy = (b.y0 + b.y1) / 2 - r.height / 2 / S.k; draw();
  }
  const toW = (sx, sy) => [sx / S.k + S.ox, sy / S.k + S.oy];
  const toS = (p) => [(p[0] - S.ox) * S.k, (p[1] - S.oy) * S.k];
  function draw() {
    const W = cv.width, H = cv.height;
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = '#f8fafc'; ctx.fillRect(0, 0, W, H);
    ctx.setTransform(S.dpr, 0, 0, S.dpr, 0, 0);
    // ızgara (10 mm; uzaklaştıkça 50 / 100 mm) ve orta eksen
    const r = cv.getBoundingClientRect(), step = S.k * 10 >= 8 ? 10 : S.k * 50 >= 8 ? 50 : 100;
    const [wx0, wy0] = toW(0, 0), [wx1, wy1] = toW(r.width, r.height);
    ctx.lineWidth = 1; ctx.strokeStyle = '#e2e8f0'; ctx.beginPath();
    for (let x = Math.floor(wx0 / step) * step; x <= wx1; x += step) { const s = toS([x, 0])[0]; ctx.moveTo(s, 0); ctx.lineTo(s, r.height); }
    for (let y = Math.floor(wy0 / step) * step; y <= wy1; y += step) { const s = toS([0, y])[1]; ctx.moveTo(0, s); ctx.lineTo(r.width, s); }
    ctx.stroke();
    ctx.strokeStyle = '#f59e0b'; ctx.setLineDash([6, 4]); ctx.beginPath(); const ax = toS([0, 0])[0]; ctx.moveTo(ax, 0); ctx.lineTo(ax, r.height); ctx.stroke(); ctx.setLineDash([]);
    X.drawCanvas(ctx, sk, S.view, { k: S.k, ox: S.ox, oy: S.oy, sel: S.sel });
    // yapım önizlemesi
    if (S.pts.length) {
      const pts = S.pts, path = S.tool === 'curve' ? C.smoothPath(pts) : C.polyPath(pts);
      ctx.strokeStyle = '#0284c7'; ctx.lineWidth = 2; ctx.setLineDash([5, 4]);
      for (const pp of S.sym && (S.tool === 'line' || S.tool === 'curve') ? [path, C.mirrorX(path)] : [path]) { if (!pp.segs.length) continue; ctx.beginPath(); ctx.moveTo(...toS(pp.segs[0].a)); for (const g of pp.segs) g.t === 'L' ? ctx.lineTo(...toS(g.b)) : ctx.bezierCurveTo(...toS(g.c1), ...toS(g.c2), ...toS(g.b)); ctx.stroke(); }
      ctx.setLineDash([]); ctx.fillStyle = '#0284c7'; for (const p of pts) { ctx.beginPath(); ctx.arc(...toS(p), 4, 0, 7); ctx.fill(); }
    }
    if (S.hover) { ctx.strokeStyle = S.hover.snapped ? '#16a34a' : '#64748b'; ctx.lineWidth = 1.5; const q = toS(S.hover.p); ctx.beginPath(); ctx.arc(q[0], q[1], 7, 0, 7); ctx.stroke(); }
    const hint = { sel: S.sel.size ? S.sel.size + ' seçili · sürükle: taşı' : 'Dokun: seç · sürükle: kaydır · iki parmak: yakınlaştır', line: 'Noktalara dokun, sonra Bitir', curve: 'Eğrinin geçeceği noktalara dokun, sonra Bitir', point: 'Nokta koymak için dokun', dim: S.pts.length ? 'İkinci noktaya dokun' : 'Ölçünün ilk noktasına dokun', text: S.text ? 'Yazıyı koymak için dokun' : 'Aşağıya yazıyı gir', detail: 'Detayı koymak için dokun' }[S.tool];
    st.textContent = `${D.VIEWS[S.view]} · ${hint}` + (S.hover ? ` · x ${cm(S.hover.p[0])} y ${cm(S.hover.p[1])} cm` : '');
  }

  /* ---------- panel ---------- */
  function renderPane() {
    root.querySelectorAll('[data-k="view"]').forEach((b) => b.classList.toggle('on', b.dataset.v === S.view));
    root.querySelectorAll('[data-k="tool"]').forEach((b) => b.classList.toggle('on', b.dataset.v === S.tool));
    root.querySelectorAll('[data-k="tog"]').forEach((b) => b.classList.toggle('on', !!S[b.dataset.v]));
    root.querySelector('[data-k="undo"]').disabled = !undo.length; root.querySelector('[data-k="redo"]').disabled = !redo.length;
    let h = '';
    const strokeSel = (v, key = 'stroke') => `<select data-p="${key}">${Object.entries(D.STROKES).map(([k, l]) => `<option value="${k}" ${k === v ? 'selected' : ''}>${l}</option>`).join('')}</select>`;
    if (S.tool === 'line' || S.tool === 'curve') {
      h += `<div class="grp"><button class="ok" data-k="finish">✓ Bitir (${S.pts.length} nokta)</button><button data-k="finish-closed">⬠ Kapalı bitir</button><button data-k="pop">⌫ Son nokta</button><button data-k="cancel">İptal</button>
        <label class="f"><span>Çizgi</span>${strokeSel(S.stroke, 'newstroke')}</label></div>
        <div class="grp"><label class="f"><span>x (cm)</span><input id="skx-x" inputmode="decimal"></label><label class="f"><span>y (cm)</span><input id="skx-y" inputmode="decimal"></label><button data-k="add-pt">+ Nokta (sayıyla)</button></div>`;
    } else if (S.tool === 'text') {
      h += `<div class="grp"><label class="f" style="flex:3 1 200px"><span>Yazı (sonra çizime dokun)</span><input id="skx-text" value="${esc(S.text)}" placeholder="ör. Çift dikiş 6 mm"></label></div>`;
    } else if (S.tool === 'detail') {
      const groups = {}; for (const [k, d] of Object.entries(D.DETAILS)) (groups[d.group] = groups[d.group] || []).push([k, d.label]);
      h += Object.entries(groups).map(([g, list]) => `<h4>${g}</h4><div class="grp">${list.map(([k, l]) => `<button data-k="pick-detail" data-v="${k}" class="${S.detail === k ? 'on' : ''}">${esc(l)}</button>`).join('')}</div>`).join('');
    } else if (S.tool === 'dim' || S.tool === 'point') {
      h += `<div class="small">${S.tool === 'dim' ? 'Ölçü iki nokta arasındaki gerçek uzunluğu cm olarak gösterir; yakalama açıkken köşelere oturur.' : 'Referans noktası.'}</div>`;
    } else if (S.sel.size) {
      const es = selEnts(), e = es[0];
      h += `<div class="grp"><button class="danger" data-k="del">Sil</button><button data-k="dup-mirror">⇋ Aynala (kopya)</button><button data-k="rot" data-v="-15">⟲ 15°</button><button data-k="rot" data-v="15">⟳ 15°</button>
        <label class="f"><span>Katman</span><select data-p="layer">${layers().map((l) => `<option value="${l.id}" ${D.findEnt(sk, S.view, e.id)?.L.id === l.id ? 'selected' : ''}>${esc(l.name)}</option>`).join('')}</select></label></div>
        <div class="grp"><label class="f"><span>Kaydır x (cm)</span><input id="skx-dx" inputmode="decimal" value="0"></label><label class="f"><span>y (cm)</span><input id="skx-dy" inputmode="decimal" value="0"></label><button data-k="move">Kaydır</button></div>
        <h4>Hizala ${es.length > 1 ? '(' + es.length + ' öğe)' : ''}</h4><div class="grp">${[['axis', 'Eksene ortala'], ['left', 'Sol'], ['hcenter', 'Yatay orta'], ['right', 'Sağ'], ['top', 'Üst'], ['vmiddle', 'Dikey orta'], ['bottom', 'Alt']].map(([k, l]) => `<button data-k="align" data-v="${k}" ${es.length < 2 && k !== 'axis' ? 'disabled' : ''}>${l}</button>`).join('')}</div>`;
      if (es.length === 1) {
        if (e.t === 'path' || e.t === 'detail') h += `<div class="grp">${e.t === 'path' ? `<label class="f"><span>Çizgi</span>${strokeSel(e.stroke)}</label>` : ''}<label class="f"><span>Kalınlık (mm)</span><input data-p="w" inputmode="decimal" value="${e.w ?? 0.35}"></label><label class="small"><input type="checkbox" data-p="sym" ${e.sym ? 'checked' : ''}> simetrik (eksene göre)</label></div>`;
        if (e.t === 'path') h += `<div class="small">Uzunluk: ${cm(C.pathLength(e.path))} cm${e.sym ? ' (her yarı)' : ''} · ${e.path.segs.length} parça${e.path.closed ? ' · kapalı' : ''}</div>`;
        if (e.t === 'detail') h += `<div class="grp"><label class="f"><span>Ölçek</span><input data-p="k" inputmode="decimal" value="${e.k}"></label><label class="f"><span>Açı (°)</span><input data-p="rot" inputmode="decimal" value="${e.rot || 0}"></label></div><div class="small">${esc(D.DETAILS[e.kind]?.label)}</div>`;
        if (e.t === 'dim') h += `<div class="grp"><label class="f"><span>Etiket</span><input data-p="label" value="${esc(e.label || '')}"></label><label class="f"><span>Kaydırma (mm)</span><input data-p="off" inputmode="decimal" value="${e.off || 0}"></label></div><div class="small">Ölçü: ${D.dimText(e)}</div>`;
        if (e.t === 'text') h += `<div class="grp"><label class="f" style="flex:3 1 200px"><span>Yazı</span><input data-p="text" value="${esc(e.text)}"></label><label class="f"><span>Boy (mm)</span><input data-p="size" inputmode="decimal" value="${e.size}"></label></div>`;
      }
    } else {
      // şablon
      const types = Object.entries(D.TEMPLATES).filter(([, t]) => t.branch === sk.branch);
      const tt = S.tplType && D.TEMPLATES[S.tplType] ? S.tplType : sk.template?.type || types[0][0];
      S.tplType = tt;
      const T = D.TEMPLATES[tt], cur = sk.template?.type === tt ? sk.template.params : null;
      h += `<h4>Şablon</h4><div class="grp"><label class="f"><span>Giysi</span><select id="skx-tpl">${types.map(([k, t]) => `<option value="${k}" ${k === tt ? 'selected' : ''}>${t.label}</option>`).join('')}</select></label>
        ${sizeTables.length ? `<label class="f"><span>Beden tablosundan öner</span><select id="skx-size"><option value="">—</option>${sizeTables.flatMap((t) => t.sizes.map((z) => `<option value="${esc(t.id)}|${esc(z)}">${esc(t.name)} · ${esc(z)}</option>`)).join('')}</select></label>` : ''}</div>
        <div class="grp">${Object.entries(T.params).map(([k, [lbl, v]]) => `<label class="f"><span>${esc(lbl)} (cm)</span><input data-tp="${k}" inputmode="decimal" value="${cm((cur && cur[k]) || v)}"></label>`).join('')}</div>
        <div class="grp"><button class="ok" data-k="apply-tpl">${sk.template ? 'Şablonu yeniden uygula' : 'Şablonu uygula'}</button></div>
        <div class="small">Şablon "Şablon" katmanına ön ve arka görünüş olarak çizilir; yeniden uygulamak yalnız bu katmanı değiştirir, kendi çizdiklerin kalır. Ölçüler düz serilmiş giysinin ölçüleridir.</div>`;
      // katmanlar
      h += `<h4>Katmanlar (${D.VIEWS[S.view]})</h4>` + layers().map((l) => `<div class="grp"><button data-k="lay-act" data-v="${l.id}" class="${activeLayer()?.id === l.id ? 'on' : ''}">${activeLayer()?.id === l.id ? '● ' : ''}${esc(l.name)} (${l.ents.length})</button>
        <button data-k="lay-vis" data-v="${l.id}">${l.visible ? '👁' : '🚫'}</button><button data-k="lay-lock" data-v="${l.id}">${l.locked ? '🔒' : '🔓'}</button><button data-k="lay-ren" data-v="${l.id}">✎</button>${layers().length > 1 ? `<button class="danger" data-k="lay-del" data-v="${l.id}">×</button>` : ''}</div>`).join('') + '<div class="grp"><button data-k="lay-add">+ Katman</button></div>';
      // çıktı
      h += `<h4>Çıktı</h4><div class="grp"><button data-k="png">⬇ PNG</button><button data-k="svg">⬇ SVG (1:1 mm)</button></div>
        <div class="grp"><label class="f"><span>Kağıt</span><select id="skx-paper">${['A4', 'A3'].map((p) => `<option ${p === S.paper ? 'selected' : ''}>${p}</option>`).join('')}</select></label>
        <label class="f"><span>Ölçek</span><select id="skx-scale"><option value="">Otomatik</option>${X.SCALES.map((s) => `<option value="${s}" ${String(s) === S.scale ? 'selected' : ''}>1:${s}</option>`).join('')}</select></label><button data-k="pdf">⬇ PDF föy sayfası</button></div>
        <div class="small">PDF: ön + arka (+ çizilmişse yan) görünüş, başlık bloğu, ölçek, 50 mm kontrol çubuğu ve ölçü tablosu. Yazdırırken "%100 / gerçek boyut" seç.</div>`;
      const mt = D.measureTable(sk);
      if (mt.length) h += `<h4>Ölçü tablosu (cm)</h4><table>${mt.map((r) => `<tr><td>${esc(r.name)}</td><td>${cm(r.mm)}</td><td class="small">${r.src}</td></tr>`).join('')}</table>`;
    }
    pane.innerHTML = h;
  }

  /* ---------- ekleme ---------- */
  function pick(sx, sy) {
    const p = toW(sx, sy), tol = 14 / S.k;
    if (S.snap) { const r = D.snap(sk, S.view, p, tol, S.grid ? 5 : 0); return r; }
    if (S.grid) return { p: [Math.round(p[0] / 5) * 5, Math.round(p[1] / 5) * 5], snapped: false };
    return { p, snapped: false };
  }
  function addEnt(ent) {
    const L = activeLayer(); if (!L) { toast('Görünür ve kilitsiz katman yok'); return null; }
    push(); const e = D.addEnt(sk, S.view, ent, L.id); changed(); return e;
  }
  function finish(closed) {
    const pts = S.pts;
    if (pts.length < (closed ? 3 : 2)) { toast(closed ? 'Kapalı yol için en az 3 nokta' : 'En az 2 nokta'); return; }
    const path = S.tool === 'curve' ? C.smoothPath(pts, closed) : C.polyPath(pts, closed);
    const e = addEnt({ t: 'path', path, stroke: S.stroke, w: S.stroke === 'solid' ? 0.5 : 0.3, sym: S.sym });
    S.pts = []; if (e) { S.sel = new Set([e.id]); } renderPane(); draw();
  }
  function tap(sx, sy) {
    const r = pick(sx, sy), p = r.p;
    switch (S.tool) {
      case 'sel': {
        const h = D.hitTest(sk, S.view, toW(sx, sy), 14 / S.k);
        if (!h) { if (!S.multi) S.sel.clear(); }
        else if (S.multi) { if (S.sel.has(h.id)) S.sel.delete(h.id); else S.sel.add(h.id); }
        else S.sel = new Set([h.id]);
        renderPane(); draw(); return;
      }
      case 'line': case 'curve': S.pts.push(p); renderPane(); draw(); return;
      case 'point': addEnt({ t: 'point', p }); return;
      case 'dim':
        if (!S.pts.length) { S.pts = [p]; draw(); renderPane(); return; }
        if (C.dist(S.pts[0], p) < 1e-6) { toast('İki nokta aynı'); return; }
        addEnt({ t: 'dim', a: S.pts[0], b: p, off: -10 }); S.pts = []; renderPane(); return;
      case 'text': {
        const t = (root.querySelector('#skx-text')?.value || S.text).trim();
        if (!t) { toast('Önce yazıyı gir'); return; }
        S.text = t; addEnt({ t: 'text', p, text: t, size: 6, leader: null }); return;
      }
      case 'detail': { const e = addEnt({ t: 'detail', kind: S.detail, p, rot: 0, k: 1, sym: S.sym, w: 0.35 }); if (e) S.sel = new Set([e.id]); return; }
    }
  }

  /* ---------- dokunma ---------- */
  const ptrs = new Map();
  let gest = null;
  const rel = (e) => { const r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  cv.addEventListener('pointerdown', (e) => {
    cv.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, rel(e));
    if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; gest = { kind: 'pinch', d0: Math.hypot(a[0] - b[0], a[1] - b[1]), k0: S.k, c: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], w: toW((a[0] + b[0]) / 2, (a[1] + b[1]) / 2) }; return; }
    const [sx, sy] = rel(e);
    let kind = 'pan';
    if (S.tool === 'sel' && S.sel.size) { const h = D.hitTest(sk, S.view, toW(sx, sy), 14 / S.k); if (h && S.sel.has(h.id)) kind = 'move'; }
    gest = { kind, s0: [sx, sy], o0: [S.ox, S.oy], last: toW(sx, sy), moved: false, pushed: false };
  });
  cv.addEventListener('pointermove', (e) => {
    const q = rel(e);
    if (!ptrs.has(e.pointerId)) { if (e.pointerType === 'mouse' && S.tool !== 'sel') { S.hover = pick(...q); draw(); } return; }
    ptrs.set(e.pointerId, q);
    if (!gest) return;
    if (gest.kind === 'pinch' && ptrs.size >= 2) {
      const [a, b] = [...ptrs.values()], d = Math.hypot(a[0] - b[0], a[1] - b[1]), c = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      S.k = Math.min(200, Math.max(0.05, gest.k0 * d / (gest.d0 || 1))); S.ox = gest.w[0] - c[0] / S.k; S.oy = gest.w[1] - c[1] / S.k; draw(); return;
    }
    if (Math.hypot(q[0] - gest.s0[0], q[1] - gest.s0[1]) > 6) gest.moved = true;
    if (!gest.moved) return;
    if (gest.kind === 'pan') { S.ox = gest.o0[0] - (q[0] - gest.s0[0]) / S.k; S.oy = gest.o0[1] - (q[1] - gest.s0[1]) / S.k; draw(); }
    if (gest.kind === 'move') {
      if (!gest.pushed) { push(); gest.pushed = true; }
      const w = toW(...q); let dx = w[0] - gest.last[0], dy = w[1] - gest.last[1];
      if (S.grid) { dx = Math.round(dx / 5) * 5; dy = Math.round(dy / 5) * 5; if (!dx && !dy) return; }
      for (const en of selEnts()) D.translateEnt(en, dx, dy);
      gest.last = [gest.last[0] + dx, gest.last[1] + dy]; draw();
    }
  });
  const up = (e) => {
    if (!ptrs.has(e.pointerId)) return;
    ptrs.delete(e.pointerId);
    if (gest && gest.kind === 'pinch') { if (!ptrs.size) gest = null; return; }
    if (gest && !gest.moved) { const q = rel(e); tap(q[0], q[1]); }
    else if (gest && gest.kind === 'move' && gest.pushed) { changed(); renderPane(); }
    gest = null;
  };
  cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', (e) => { ptrs.delete(e.pointerId); gest = null; });
  cv.addEventListener('wheel', (e) => { e.preventDefault(); const q = rel(e), w = toW(...q); S.k = Math.min(200, Math.max(0.05, S.k * (e.deltaY < 0 ? 1.15 : 1 / 1.15))); S.ox = w[0] - q[0] / S.k; S.oy = w[1] - q[1] / S.k; draw(); }, { passive: false });

  /* ---------- düğmeler ---------- */
  function download(blob, name) { const u = URL.createObjectURL(blob), a = document.createElement('a'); a.href = u; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(u), 5000); }
  const fname = (ext) => (sk.name + '-' + D.VIEWS[S.view]).replace(/[^\wçğıöşüÇĞİÖŞÜ -]+/g, '_') + '.' + ext;
  root.addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-k]'); if (!b) return;
    const k = b.dataset.k, v = b.dataset.v;
    try {
      switch (k) {
        case 'close': close(); return;
        case 'view': S.view = v; S.sel.clear(); S.pts = []; S.layer = null; fit(); break;
        case 'tool': S.tool = v; S.pts = []; if (v !== 'sel') S.sel.clear(); break;
        case 'tog': S[v] = !S[v]; break;
        case 'fit': fit(); break;
        case 'undo': if (undo.length) { redo.push(snapshot()); restoreFrom(undo.pop()); S.sel.clear(); changed(); } break;
        case 'redo': if (redo.length) { undo.push(snapshot()); restoreFrom(redo.pop()); S.sel.clear(); changed(); } break;
        case 'finish': finish(false); return;
        case 'finish-closed': finish(true); return;
        case 'pop': S.pts.pop(); break;
        case 'cancel': S.pts = []; break;
        case 'add-pt': { const x = pnum(root.querySelector('#skx-x').value), y = pnum(root.querySelector('#skx-y').value); if (x == null || y == null) { toast('x ve y sayı olmalı (cm)'); return; } S.pts.push([x * 10, y * 10]); break; }
        case 'pick-detail': S.detail = v; break;
        case 'del': push(); for (const id of S.sel) D.removeEnt(sk, S.view, id); S.sel.clear(); changed(); break;
        case 'dup-mirror': { push(); const L = activeLayer(); const nids = []; for (const e of selEnts()) nids.push(D.addEnt(sk, S.view, D.mirroredCopy(e), L?.id).id); S.sel = new Set(nids); changed(); break; }
        case 'rot': push(); for (const e of selEnts()) D.rotateEnt(e, +v); changed(); break;
        case 'move': { const dx = pnum(root.querySelector('#skx-dx').value), dy = pnum(root.querySelector('#skx-dy').value); if (dx == null || dy == null) { toast('Sayı gir (cm)'); return; } push(); for (const e of selEnts()) D.translateEnt(e, dx * 10, dy * 10); changed(); break; }
        case 'align': push(); D.align(selEnts(), v); changed(); break;
        case 'apply-tpl': {
          const T = D.TEMPLATES[S.tplType], o = {};
          for (const inp of root.querySelectorAll('[data-tp]')) { const x = pnum(inp.value); if (x == null || x <= 0) { toast(T.params[inp.dataset.tp][0] + ': geçerli bir cm değeri gir'); return; } o[inp.dataset.tp] = Math.round(x * 100) / 10; }
          push(); D.applyTemplate(sk, S.tplType, o); S.sel.clear(); S.view = 'front'; changed(); fit(); toast(T.label + ' şablonu uygulandı'); break;
        }
        case 'lay-act': S.layer = v; break;
        case 'lay-vis': { const L = layers().find((l) => l.id === v); push(); L.visible = !L.visible; S.sel.clear(); changed(); break; }
        case 'lay-lock': { const L = layers().find((l) => l.id === v); push(); L.locked = !L.locked; S.sel.clear(); changed(); break; }
        case 'lay-ren': { const L = layers().find((l) => l.id === v); const n = prompt('Katman adı', L.name); if (n && n.trim()) { push(); L.name = n.trim(); changed(); } break; }
        case 'lay-add': { push(); const L = D.addLayer(sk, S.view); S.layer = L.id; changed(); break; }
        case 'lay-del': { const L = layers().find((l) => l.id === v); if (L.ents.length && !b.dataset.armed) { b.dataset.armed = '1'; b.textContent = 'Emin misin? (' + L.ents.length + ' öğe)'; return; } push(); sk.views[S.view].layers = layers().filter((l) => l.id !== v); changed(); break; }
        case 'png': {
          const bb = D.viewBBox(sk, S.view); if (!bb) { toast('Görünüş boş'); return; }
          const m = 15, w = bb.x1 - bb.x0 + 2 * m, h = bb.y1 - bb.y0 + 2 * m, kk = Math.min(8, 2400 / Math.max(w, h));
          const c2 = document.createElement('canvas'); c2.width = Math.round(w * kk); c2.height = Math.round(h * kk);
          const g = c2.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c2.width, c2.height);
          X.drawCanvas(g, sk, S.view, { k: kk, ox: bb.x0 - m, oy: bb.y0 - m });
          c2.toBlob((bl) => download(bl, fname('png')), 'image/png'); return;
        }
        case 'svg': if (!D.viewBBox(sk, S.view)) { toast('Görünüş boş'); return; } download(new Blob([X.toSVG(sk, S.view, { meta })], { type: 'image/svg+xml' }), fname('svg')); return;
        case 'pdf': {
          const views = Object.keys(D.VIEWS).filter((vv) => D.viewBBox(sk, vv));
          if (!views.length) { toast('Çizim boş'); return; }
          S.paper = root.querySelector('#skx-paper').value; S.scale = root.querySelector('#skx-scale').value;
          const r = X.toPDF(sk, { views, paper: S.paper, scale: S.scale ? +S.scale : null, meta: { ...meta, date: new Date().toLocaleDateString('tr-TR') } });
          if (!r.fits) toast('Uyarı: 1:' + r.scale + ' ölçekte çizim sayfaya sığmıyor');
          download(new Blob([r.bytes], { type: 'application/pdf' }), (sk.name).replace(/[^\wçğıöşüÇĞİÖŞÜ -]+/g, '_') + '.pdf'); return;
        }
        default: return;
      }
    } catch (er) { toast('⚠ ' + er.message); }
    renderPane(); draw();
  });
  root.addEventListener('change', (ev) => {
    const el = ev.target;
    if (el.id === 'skx-tpl') { S.tplType = el.value; renderPane(); return; }
    if (el.id === 'skx-size' && el.value) {
      const [tid, z] = el.value.split('|'), t = sizeTables.find((x) => x.id === tid);
      const ms = Object.fromEntries(Object.entries(t.measures).map(([k, row]) => [k, row[z]]));
      const o = D.paramsFromSize(S.tplType, ms);
      for (const inp of root.querySelectorAll('[data-tp]')) inp.value = cm(o[inp.dataset.tp]);
      toast('Göğüs / bel / basen tablodan önerildi (bolluk payı eklendi); diğerleri şablon değeri. Kontrol et.'); return;
    }
    if (el.dataset.p === 'newstroke') { S.stroke = el.value; return; }
    if (el.id === 'skx-text') { S.text = el.value; return; }
    const p = el.dataset.p; if (!p) return;
    const es = selEnts(); if (!es.length) return;
    push();
    for (const e of es) {
      if (p === 'layer') { D.moveToLayer(sk, S.view, e.id, el.value); continue; }
      if (p === 'sym') e.sym = el.checked;
      else if (p === 'stroke') e.stroke = el.value;
      else if (['w', 'k', 'rot', 'off', 'size'].includes(p)) { const x = pnum(el.value); if (x == null || (p !== 'rot' && p !== 'off' && x <= 0)) { toast('Geçersiz sayı'); undo.pop(); renderPane(); return; } e[p] = x; }
      else if (p === 'label' || p === 'text') e[p] = el.value;
    }
    changed(); renderPane();
  });
  const ro = new ResizeObserver(() => resize()); ro.observe(cv);
  function close() { ro.disconnect(); root.remove(); onChange && onChange(true); }
  renderPane(); resize(); fit();
  return { root, state: S, close };
}
