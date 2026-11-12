// Kalıp editörü (dokuma / konfeksiyon). Tam ekran; bir ürün + beden grubunun parçalarını gösterir.
// Geometri tx/woven/pattern.js'te; burada yalnız etkileşim.
import * as C from '../curve.js?v=20261112u';
import { saveBlob } from '../download.js?v=20261112u';
import * as P from './pattern.js?v=20261112u';
import * as X from './pattern-export.js?v=20261112u';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const cm = (mm, d = 1) => (Math.round(mm * 10 ** d / 10) / 10 ** d).toFixed(d).replace('.', ',');
const pnum = (s) => { const t = String(s).trim().replace(',', '.'); const v = Number(t); return t === '' || !Number.isFinite(v) ? null : v; };
const TOOLS = [['sel', '☝ Seç'], ['notch', '⌃ Çıt'], ['dart', '◁ Pens'], ['mark', '⊕ İşaret'], ['split', '✂ Böl'], ['merge', '⊞ Birleştir'], ['new', '⬠ Yeni parça'], ['seam', '⇄ Dikiş eşle']];

export function openPatternEditor(project, { product = null, size = '', title = 'Kalıp', onChange, toast, meta = {} }) {
  const W = project.woven;
  const inGroup = (pc) => (pc.product ?? null) === product && (pc.size ?? '') === size;
  const group = () => W.pieces.filter(inGroup);
  const groupSeams = () => W.seams.filter((sm) => [...sm.a, ...sm.b].every((r) => group().some((pc) => pc.id === r.piece)) || [...sm.a, ...sm.b].some((r) => group().some((pc) => pc.id === r.piece)));
  const root = document.createElement('div');
  root.id = 'pkx';
  root.innerHTML = `<style>
    #pkx { position: fixed; inset: 0; z-index: 30; background: #0b1222; display: flex; flex-direction: column; }
    #pkx .bar { display: flex; gap: 5px; padding: 6px; overflow-x: auto; flex: none; align-items: center; }
    #pkx .bar button { flex: 0 0 auto; padding: 8px 10px; }
    #pkx .cv { flex: 1; position: relative; min-height: 120px; touch-action: none; }
    #pkx canvas { position: absolute; inset: 0; width: 100%; height: 100%; touch-action: none; }
    #pkx .pane { flex: none; max-height: 44vh; overflow-y: auto; padding: 6px 8px 10px; background: #0f172a; border-top: 1px solid #1e293b; }
    #pkx .st { position: absolute; left: 8px; top: 6px; right: 8px; font-size: 12px; color: #64748b; pointer-events: none; }
    #pkx .grp { display: flex; gap: 5px; flex-wrap: wrap; margin: 4px 0; align-items: flex-end; }
    #pkx .grp > button { flex: 0 1 auto; }
    #pkx label.f { flex: 1 1 90px; }
    #pkx h4 { margin: 8px 0 2px; font-size: 13px; color: #cbd5e1; }
    #pkx td input, #pkx td select { min-width: 60px; }
    #pkx tr.on td { background: #0c4a6e; }
  </style>
  <div class="bar"><button data-k="close">✕ Kapat</button><b style="flex:1 0 auto;padding:0 6px;font-size:14px">${esc(title)}</b><button data-k="nest">◫ Beden yuvası</button><button data-k="undo">↶</button><button data-k="redo">↷</button><button data-k="fit">Sığdır</button></div>
  <div class="bar">${TOOLS.map(([k, l]) => `<button data-k="tool" data-v="${k}">${l}</button>`).join('')}</div>
  <div class="cv"><canvas></canvas><div class="st"></div></div>
  <div class="pane"></div>`;
  document.body.appendChild(root);
  const cv = root.querySelector('canvas'), st = root.querySelector('.st'), pane = root.querySelector('.pane'), ctx = cv.getContext('2d');
  const S = { tool: 'sel', sel: null, edge: null, k: 1, ox: 0, oy: 0, dpr: 1, tmp: [], nextSmooth: false, notchKind: 'tek', markKind: 'delik', seamA: [], seamB: [], seamSide: 'a', mergeA: null, delArm: false };
  const undo = [], redo = [];
  const snap = () => JSON.stringify({ pieces: W.pieces, seams: W.seams });
  const push = () => { undo.push(snap()); if (undo.length > 60) undo.shift(); redo.length = 0; };
  const restoreFrom = (t) => { const o = JSON.parse(t); W.pieces = o.pieces; W.seams = o.seams; };
  const changed = () => { onChange && onChange(); draw(); };
  const cur = () => W.pieces.find((pc) => pc.id === S.sel && inGroup(pc));
  const replacePiece = (pc) => { const i = W.pieces.findIndex((q) => q.id === pc.id); W.pieces[i] = pc; };

  /* ---------- görünüm ---------- */
  function resize() { const r = cv.getBoundingClientRect(); S.dpr = window.devicePixelRatio || 1; cv.width = Math.max(1, r.width * S.dpr); cv.height = Math.max(1, r.height * S.dpr); draw(); }
  function fit() {
    const r = cv.getBoundingClientRect(), b = X.piecesBBox(group()) || { x0: 0, y0: 0, x1: 600, y1: 800 };
    S.k = Math.min((r.width - 30) / (b.x1 - b.x0 || 1), (r.height - 30) / (b.y1 - b.y0 || 1)); if (!(S.k > 0)) S.k = 1;
    S.ox = (b.x0 + b.x1) / 2 - r.width / 2 / S.k; S.oy = (b.y0 + b.y1) / 2 - r.height / 2 / S.k; draw();
  }
  const toW = (sx, sy) => [sx / S.k + S.ox, sy / S.k + S.oy];
  const toS = (p) => [(p[0] - S.ox) * S.k, (p[1] - S.oy) * S.k];
  function badSet() { const s = new Set(); for (const pc of group()) if (P.validatePiece(pc).some((x) => x.level === 'hata')) s.add(pc.id); return s; }
  function draw() {
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = '#f8fafc'; ctx.fillRect(0, 0, cv.width, cv.height);
    ctx.setTransform(S.dpr, 0, 0, S.dpr, 0, 0);
    const r = cv.getBoundingClientRect(), step = S.k * 10 >= 8 ? 10 : S.k * 50 >= 8 ? 50 : 100, [wx0, wy0] = toW(0, 0), [wx1, wy1] = toW(r.width, r.height);
    ctx.lineWidth = 1; ctx.strokeStyle = '#e2e8f0'; ctx.beginPath();
    for (let x = Math.floor(wx0 / step) * step; x <= wx1; x += step) { const s = toS([x, 0])[0]; ctx.moveTo(s, 0); ctx.lineTo(s, r.height); }
    for (let y = Math.floor(wy0 / step) * step; y <= wy1; y += step) { const s = toS([0, y])[1]; ctx.moveTo(0, s); ctx.lineTo(r.width, s); }
    ctx.stroke();
    // beden yuvası: aynı ürünün diğer bedenleri (aynı kökenden yayıldıkları için üst üste oturur)
    if (S.nest) {
      const others = W.pieces.filter((pc) => (pc.product ?? null) === product && (pc.size ?? '') !== size), sz = [...new Set(others.map((pc) => pc.size))];
      const cols = ['#ef4444', '#f59e0b', '#16a34a', '#8b5cf6', '#ec4899', '#0ea5e9', '#84cc16'];
      ctx.lineWidth = 1.2;
      for (const pc of others) { const pts = P.seamPolygon(pc, 0.5); ctx.strokeStyle = cols[sz.indexOf(pc.size) % cols.length]; ctx.beginPath(); pts.forEach((q, i) => (i ? ctx.lineTo(...toS(q)) : ctx.moveTo(...toS(q)))); ctx.closePath(); ctx.stroke(); }
      ctx.font = '12px Helvetica, Arial, sans-serif'; sz.forEach((z, i) => { ctx.fillStyle = cols[i % cols.length]; ctx.fillText(z, 10 + i * 34, r.height - 10); });
    }
    X.drawPiecesCanvas(ctx, group(), { k: S.k, ox: S.ox, oy: S.oy, sel: S.sel, selEdge: S.edge, issues: badSet() });
    // eşleşme seçimi vurgusu
    const hl = (refs, color) => { for (const r of refs) { const pc = W.pieces.find((q) => q.id === r.piece); if (!pc) continue; ctx.strokeStyle = color; ctx.lineWidth = 5; ctx.globalAlpha = 0.5; const e = pc.edges[r.edge]; ctx.beginPath(); ctx.moveTo(...toS(e.segs[0].a)); for (const s of e.segs) s.t === 'L' ? ctx.lineTo(...toS(s.b)) : ctx.bezierCurveTo(...toS(s.c1), ...toS(s.c2), ...toS(s.b)); ctx.stroke(); ctx.globalAlpha = 1; } };
    hl(S.seamA, '#f59e0b'); hl(S.seamB, '#a855f7'); if (S.mergeA) hl([S.mergeA], '#16a34a');
    if (S.tmp.length) {
      ctx.strokeStyle = '#0284c7'; ctx.lineWidth = 2; ctx.setLineDash([5, 4]); ctx.beginPath();
      S.tmp.forEach((q, i) => (i ? ctx.lineTo(...toS(q.p)) : ctx.moveTo(...toS(q.p)))); if (S.tool === 'new' && S.tmp.length > 2) ctx.closePath(); ctx.stroke(); ctx.setLineDash([]);
      for (const q of S.tmp) { ctx.fillStyle = q.smooth ? '#a855f7' : '#0284c7'; ctx.beginPath(); ctx.arc(...toS(q.p), 4.5, 0, 7); ctx.fill(); }
    }
    const hint = { sel: cur() ? (S.edge != null ? `Kenar: ${cur().edges[S.edge].name || S.edge + 1}` : cur().name + ' · sürükle: taşı') : 'Parçaya ya da kenarına dokun · sürükle: kaydır · iki parmak: yakınlaştır', notch: 'Dikiş hattına dokun: çıt eklenir', dart: ['Pens: ağzın 1. noktası (dikiş hattında)', 'Pens: ağzın 2. noktası (aynı kenarda)', 'Pens: ucu (parçanın içinde)'][S.tmp.length] || '', mark: 'Parçanın içine dokun', split: cur() ? (S.tmp.length ? 'Bölme çizgisinin 2. noktası' : 'Bölme çizgisinin 1. noktası (çizgi parçayı iki yerden kesmeli)') : 'Önce Seç ile bölünecek parçayı seç', merge: S.mergeA ? 'Diğer parçanın eşleşen kenarına dokun' : 'Birleşecek ilk kenara dokun', new: `Köşelere dokun (sonraki nokta: ${S.nextSmooth ? 'eğri' : 'köşe'}), sonra Bitir`, seam: S.seamSide === 'a' ? 'A tarafı kenarlarına dokun' : 'B tarafı kenarlarına dokun' }[S.tool];
    st.textContent = hint;
  }

  /* ---------- isabet ---------- */
  function hit(sx, sy, exclude = null) {
    const p = toW(sx, sy), tol = 14 / S.k;
    let best = null;
    const g = group().filter((pc) => pc.id !== exclude);
    // önce seçili parçanın kenarları
    const order = [...g.filter((pc) => pc.id === S.sel), ...g.filter((pc) => pc.id !== S.sel)];
    for (const pc of order) {
      const l = P.locate(pc, p);
      if (l && l.d <= tol && (!best || l.d < best.d - 1e-9)) best = { pc, edge: l.edge, at: l.at, d: l.d, p: l.p };
      if (best && pc.id === S.sel) break;
    }
    if (best) return best;
    for (const pc of [...g].reverse()) { try { if (P.insidePoly(P.cutPolygon(pc).pts, p)) return { pc, edge: null, p }; } catch (e) { /* */ } }
    return null;
  }

  /* ---------- panel ---------- */
  function seamRow(sm) {
    const r = P.seamCheck(W.pieces, sm), nm = (refs) => refs.map((x) => { const pc = W.pieces.find((q) => q.id === x.piece); return pc ? `${pc.name}: ${pc.edges[x.edge]?.name || 'kenar ' + (x.edge + 1)}${x.k ? ' ×' + x.k : ''}` : '⚠ silinmiş'; }).join(' + ');
    return `<tr><td>${r.missing ? '⛔' : r.ok ? '✅' : '⛔'}</td><td><b>${esc(sm.name)}</b><div class="small">${esc(nm(sm.a))} → ${esc(nm(sm.b))}</div><div class="small">${r.missing ? 'parça / kenar yok' : `${cm(r.A)} → ${cm(r.B)} cm · beklenen fark ${cm(sm.ease || 0)} · sapma ${cm(r.diff, 2)} cm`}</div></td><td><button class="danger" data-k="seam-del" data-v="${esc(sm.id)}">×</button></td></tr>`;
  }
  function renderPane() {
    root.querySelectorAll('[data-k="tool"]').forEach((b) => b.classList.toggle('on', b.dataset.v === S.tool));
    root.querySelector('[data-k="undo"]').disabled = !undo.length; root.querySelector('[data-k="redo"]').disabled = !redo.length;
    const pc = cur(); let h = '';
    if (S.tool === 'notch') h = `<div class="grp">${Object.entries(P.NOTCH_KINDS).map(([k, l]) => `<button data-k="nk" data-v="${k}" class="${S.notchKind === k ? 'on' : ''}">${l}</button>`).join('')}</div><div class="small">Çıt, dikiş hattındaki en yakın noktaya, kesim hattından içeri doğru konur. Konumu kenar seçilip cm ile düzeltilebilir.</div>`;
    else if (S.tool === 'mark') h = `<div class="grp">${Object.entries(P.MARK_KINDS).map(([k, l]) => `<button data-k="mk" data-v="${k}" class="${S.markKind === k ? 'on' : ''}">${l}</button>`).join('')}</div>`;
    else if (S.tool === 'dart' || S.tool === 'split') h = `<div class="grp"><button data-k="cancel">İptal</button></div>`;
    else if (S.tool === 'merge') h = `<div class="small">İki parçanın aynı boy ve biçimdeki kenarları birleştirilir (ör. roba + arka). İkinci parça taşınır / döndürülür; birleşim yeri iç çizgi olarak kalır.</div><div class="grp"><button data-k="cancel">İptal</button></div>`;
    else if (S.tool === 'new') h = `<div class="grp"><button class="ok" data-k="new-finish">✓ Bitir (${S.tmp.length} nokta)</button><button data-k="new-smooth">Sonraki nokta: ${S.nextSmooth ? '∿ eğri' : '⌐ köşe'}</button><button data-k="pop">⌫ Son nokta</button><button data-k="cancel">İptal</button></div>
      <div class="grp"><label class="f"><span>x (cm)</span><input id="pk-x" inputmode="decimal"></label><label class="f"><span>y (cm)</span><input id="pk-y" inputmode="decimal"></label><button data-k="new-pt">+ Nokta (sayıyla)</button></div>
      <div class="grp"><label class="f"><span>Parça adı</span><input id="pk-name" placeholder="ör. Roba"></label><label class="f"><span>Dikiş payı (cm)</span><input id="pk-allow" inputmode="decimal" value="1"></label></div>`;
    else if (S.tool === 'seam') h = `<div class="grp"><button data-k="side" data-v="a" class="${S.seamSide === 'a' ? 'on' : ''}">A tarafı (${S.seamA.length})</button><button data-k="side" data-v="b" class="${S.seamSide === 'b' ? 'on' : ''}">B tarafı (${S.seamB.length})</button><button data-k="cancel">Temizle</button></div>
      <div class="grp"><label class="f"><span>Ad</span><input id="pk-sname" placeholder="ör. Yan dikiş"></label><label class="f"><span>Beklenen fark B − A (cm)</span><input id="pk-ease" inputmode="decimal" value="0"></label><label class="f"><span>Tolerans (cm)</span><input id="pk-tol" inputmode="decimal" value="0,2"></label><button class="ok" data-k="seam-save">Kaydet</button></div>
      <div class="small">Dikilecek kenarları seç: A tarafı + beklenen fark = B tarafı. Bolluk (kol başı), pile, kruvaze payı "beklenen fark"tır. Pensli kenarda pens ağzı düşülür.</div>`;
    else if (pc && S.edge != null) {
      const e = pc.edges[S.edge], i = S.edge, ns = pc.notches.map((n, j) => [n, j]).filter(([n]) => n.edge === i);
      h = `<div class="grp"><button data-k="unedge">← ${esc(pc.name)}</button><b>Kenar ${i + 1}</b></div>
        <div class="grp"><label class="f"><span>Ad</span><input data-e="name" value="${esc(e.name)}"></label><label class="f"><span>Dikiş payı (cm)</span><input data-e="allow" inputmode="decimal" value="${cm(e.allow)}" ${pc.fold === i ? 'disabled' : ''}></label>
        <label class="f"><span>Sonundaki köşe</span><select data-e="corner">${Object.entries(P.CORNERS).map(([k, l]) => `<option value="${k}" ${k === e.corner ? 'selected' : ''}>${l}</option>`).join('')}</select></label></div>
        <div class="small">Uzunluk ${cm(P.edgeLength(e))} cm${P.seamLength(pc, i) !== P.edgeLength(e) ? ` · pens kapalı dikiş boyu ${cm(P.seamLength(pc, i))} cm` : ''}${pc.fold === i ? ' · KUMAŞ KATI (pay yok)' : ''}${P.isStraight(e) ? ' · düz' : ' · eğri'}</div>
        <h4>Çıtlar</h4>${ns.map(([n, j]) => `<div class="grp"><label class="f"><span>Kenar başından (cm)</span><input data-n="${j}" inputmode="decimal" value="${cm(n.at)}"></label><select data-nk="${j}">${Object.entries(P.NOTCH_KINDS).map(([k, l]) => `<option value="${k}" ${k === n.kind ? 'selected' : ''}>${l}</option>`).join('')}</select><button class="danger" data-k="notch-del" data-v="${j}">×</button></div>`).join('') || '<div class="small">Çıt yok.</div>'}
        <div class="grp"><button data-k="notch-mid">+ Ortaya çıt</button></div>`;
    } else if (pc) {
      const m = P.measure(pc), iss = P.validatePiece(pc);
      h = `<div class="grp"><label class="f"><span>Ad</span><input data-p="name" value="${esc(pc.name)}"></label><label class="f"><span>Kesim adedi</span><input data-p="qty" inputmode="numeric" value="${pc.qty}"></label>
        <label class="f"><span>Kumaş</span><select data-p="fabric">${Object.entries(P.FABRICS).map(([k, l]) => `<option value="${k}" ${k === pc.fabric ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
        <label class="f"><span>Kumaş katı kenarı</span><select data-p="fold"><option value="">— yok —</option>${pc.edges.map((e, i) => `<option value="${i}" ${pc.fold === i ? 'selected' : ''}>${i + 1}. ${esc(e.name || 'kenar')}</option>`).join('')}</select></label>
        <label class="small"><input type="checkbox" data-p="pair" ${pc.pair ? 'checked' : ''}> çift kes (biri ters)</label></div>
        <div class="grp"><label class="f" style="flex:3 1 200px"><span>Üretim notu</span><input data-p="notes" value="${esc(pc.notes)}"></label></div>
        <div class="grp"><button data-k="rot" data-v="-90">⟲ 90°</button><button data-k="rot" data-v="90">⟳ 90°</button><button data-k="rot" data-v="180">180°</button><button data-k="flip">⇋ Ters çevir</button><button data-k="grain">Düz boy ⟳ 90°</button>${pc.fold != null ? '<button data-k="unfold">Katı aç (tam parça)</button>' : ''}<button data-k="dup">Çoğalt</button><button class="danger" data-k="del">${S.delArm ? 'Emin misin?' : 'Sil'}</button></div>
        <div class="grp"><label class="f"><span>Bütün kenarlara pay (cm)</span><input id="pk-all" inputmode="decimal" value="1"></label><button data-k="allow-all">Uygula</button></div>
        <div class="small">Dikiş alanı ${cm(m.seamArea / 1e3, 2)} dm² · kesim alanı ${cm(m.cutArea / 1e3, 2)} dm² · dikiş hattı ${cm(m.seamPerimeter)} cm · kesim hattı ${cm(m.cutPerimeter)} cm</div>
        <h4>Kenarlar</h4><table>${pc.edges.map((e, i) => `<tr><td><button data-k="edge" data-v="${i}">${i + 1}. ${esc(e.name || 'kenar')}</button></td><td>${cm(P.edgeLength(e))} cm</td><td>${pc.fold === i ? 'kat' : 'pay ' + cm(e.allow)}</td></tr>`).join('')}</table>
        ${iss.length ? `<h4>Kontrol</h4>${iss.map((x) => `<div class="issue ${x.level}">${x.level === 'hata' ? '⛔' : '⚠'} ${esc(x.msg)}</div>`).join('')}` : '<div class="small">✅ Kontur kapalı, kendini kesmiyor; dikiş payı geçerli.</div>'}`;
    } else {
      const sms = groupSeams();
      h = `<h4>Dikiş eşleşmeleri (${sms.length})</h4>${sms.length ? `<table>${sms.map(seamRow).join('')}</table>` : '<div class="small">Yok. "Dikiş eşle" aracıyla ekle.</div>'}
        <h4>Çıktı</h4><div class="grp"><button data-k="pdf">⬇ PDF 1:1 (A4 döşemeli)</button><button data-k="pdf3">⬇ PDF 1:1 (A3)</button><button data-k="svg">⬇ SVG 1:1</button></div>
        <div class="small">PDF: kapakta 10 cm kontrol karesi ve sayfa haritası; sayfalar satır-sütun numaralı, çerçeveden kesilip birleştirilir. "%100 / gerçek boyut" yazdırın.</div>
        <div class="small">${group().length} parça. Kalıplar temel bloktur; seri üretimden önce prova ile doğrulanmalı.</div>`;
    }
    pane.innerHTML = h;
  }

  /* ---------- dokunma ---------- */
  function tap(sx, sy) {
    const h = hit(sx, sy), p = toW(sx, sy);
    switch (S.tool) {
      // ilk dokunuş parçayı, seçili parçanın kenarına ikinci dokunuş kenarı seçer
      case 'sel': { const prev = S.sel; S.sel = h ? h.pc.id : null; S.edge = h && h.edge != null && prev === h.pc.id ? h.edge : null; S.delArm = false; break; }
      case 'notch': if (!h || h.edge == null) { toast('Dikiş hattına dokun'); return; } push(); h.pc.notches.push({ edge: h.edge, at: h.at, kind: S.notchKind }); S.sel = h.pc.id; changed(); break;
      case 'mark': { const pc = h?.pc; if (!pc) { toast('Parçanın içine dokun'); return; } push(); pc.marks.push({ kind: S.markKind, p, label: '' }); S.sel = pc.id; changed(); break; }
      case 'dart':
        if (S.tmp.length < 2) {
          if (!h || h.edge == null) { toast('Dikiş hattına dokun'); return; }
          if (S.tmp.length === 1 && (h.pc.id !== S.tmp[0].pc || h.edge !== S.tmp[0].edge)) { toast('İkinci nokta aynı kenarda olmalı'); return; }
          S.tmp.push({ p: h.p, pc: h.pc.id, edge: h.edge }); break;
        } else {
          const pc = W.pieces.find((q) => q.id === S.tmp[0].pc);
          if (!P.insidePoly(P.seamPolygon(pc), p)) { toast('Pens ucu parçanın içinde olmalı'); return; }
          push(); pc.darts.push({ a: S.tmp[0].p, b: S.tmp[1].p, apex: p }); S.tmp = []; S.sel = pc.id; changed(); break;
        }
      case 'split': {
        const pc = cur(); if (!pc) { toast('Önce Seç ile parçayı seç'); return; }
        if (!S.tmp.length) { S.tmp.push({ p }); break; }
        try { const [a, b] = P.splitPiece(pc, S.tmp[0].p, p); push(); a.id = pc.id + 'a'; b.id = pc.id + 'b'; W.pieces.splice(W.pieces.indexOf(pc), 1, a, b); W.seams = W.seams.filter((sm) => ![...sm.a, ...sm.b].some((r) => r.piece === pc.id)); S.sel = a.id; S.tmp = []; changed(); toast('Parça ikiye bölündü; bu parçaya bağlı dikiş eşleşmeleri kaldırıldı'); }
        catch (er) { toast('⚠ ' + er.message); S.tmp = []; }
        break;
      }
      case 'merge': {
        if (!S.mergeA) { if (!h || h.edge == null) { toast('Kenara dokun'); return; } S.mergeA = { piece: h.pc.id, edge: h.edge }; break; }
        const h2 = hit(sx, sy, S.mergeA.piece);   // ortak kenarda ikinci parçayı bul
        if (!h2 || h2.edge == null) { toast('Diğer parçanın kenarına dokun'); return; }
        const A = W.pieces.find((q) => q.id === S.mergeA.piece), Bp = h2.pc;
        try { const M = P.mergePieces(A, S.mergeA.edge, Bp, h2.edge); push(); M.id = A.id; W.pieces.splice(W.pieces.indexOf(A), 1, M); W.pieces.splice(W.pieces.indexOf(Bp), 1); W.seams = W.seams.filter((sm) => ![...sm.a, ...sm.b].some((r) => r.piece === A.id || r.piece === Bp.id)); S.sel = M.id; changed(); toast('Birleştirildi: ' + M.name); }
        catch (er) { toast('⚠ ' + er.message); }
        S.mergeA = null; break;
      }
      case 'new': S.tmp.push({ p, smooth: S.nextSmooth }); break;
      case 'seam': {
        if (!h || h.edge == null) { toast('Kenara dokun'); return; }
        const arr = S.seamSide === 'a' ? S.seamA : S.seamB, i = arr.findIndex((r) => r.piece === h.pc.id && r.edge === h.edge);
        if (i >= 0) arr.splice(i, 1); else arr.push({ piece: h.pc.id, edge: h.edge });
        break;
      }
    }
    renderPane(); draw();
  }
  const ptrs = new Map(); let gest = null;
  const rel = (e) => { const r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  cv.addEventListener('pointerdown', (e) => {
    cv.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, rel(e));
    if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; gest = { kind: 'pinch', d0: Math.hypot(a[0] - b[0], a[1] - b[1]), k0: S.k, w: toW((a[0] + b[0]) / 2, (a[1] + b[1]) / 2) }; return; }
    const q = rel(e); let kind = 'pan';
    if (S.tool === 'sel' && cur()) { const h = hit(...q); if (h && h.pc.id === S.sel) kind = 'move'; }
    gest = { kind, s0: q, o0: [S.ox, S.oy], last: toW(...q), moved: false, pushed: false };
  });
  cv.addEventListener('pointermove', (e) => {
    if (!ptrs.has(e.pointerId)) return; const q = rel(e); ptrs.set(e.pointerId, q); if (!gest) return;
    if (gest.kind === 'pinch' && ptrs.size >= 2) { const [a, b] = [...ptrs.values()], d = Math.hypot(a[0] - b[0], a[1] - b[1]), c = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]; S.k = Math.min(100, Math.max(0.03, gest.k0 * d / (gest.d0 || 1))); S.ox = gest.w[0] - c[0] / S.k; S.oy = gest.w[1] - c[1] / S.k; draw(); return; }
    if (Math.hypot(q[0] - gest.s0[0], q[1] - gest.s0[1]) > 6) gest.moved = true; if (!gest.moved) return;
    if (gest.kind === 'pan') { S.ox = gest.o0[0] - (q[0] - gest.s0[0]) / S.k; S.oy = gest.o0[1] - (q[1] - gest.s0[1]) / S.k; draw(); }
    if (gest.kind === 'move') { if (!gest.pushed) { push(); gest.pushed = true; } const w = toW(...q), dx = w[0] - gest.last[0], dy = w[1] - gest.last[1]; replacePiece(P.translatePiece(cur(), dx, dy)); gest.last = w; draw(); }
  });
  cv.addEventListener('pointerup', (e) => { if (!ptrs.has(e.pointerId)) return; ptrs.delete(e.pointerId); if (gest && gest.kind === 'pinch') { if (!ptrs.size) gest = null; return; } if (gest && !gest.moved) tap(...rel(e)); else if (gest && gest.pushed) { changed(); renderPane(); } gest = null; });
  cv.addEventListener('pointercancel', (e) => { ptrs.delete(e.pointerId); gest = null; });
  cv.addEventListener('wheel', (e) => { e.preventDefault(); const q = rel(e), w = toW(...q); S.k = Math.min(100, Math.max(0.03, S.k * (e.deltaY < 0 ? 1.15 : 1 / 1.15))); S.ox = w[0] - q[0] / S.k; S.oy = w[1] - q[1] / S.k; draw(); }, { passive: false });

  /* ---------- düğmeler / alanlar ---------- */
  const dl = (blob, name) => saveBlob(blob, name);
  const fname = (ext) => (title).replace(/[^\wçğıöşüÇĞİÖŞÜ -]+/g, '_') + '.' + ext;
  root.addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-k]'); if (!b) return;
    const k = b.dataset.k, v = b.dataset.v, pc = cur();
    if (k !== 'del') S.delArm = false;
    try {
      switch (k) {
        case 'close': ro.disconnect(); root.remove(); onChange && onChange(true); return;
        case 'tool': S.tool = v; S.tmp = []; S.mergeA = null; if (v !== 'sel') S.edge = null; break;
        case 'fit': fit(); break;
        case 'nest': S.nest = !S.nest; root.querySelector('[data-k="nest"]').classList.toggle('on', S.nest); if (!W.pieces.some((pc) => (pc.product ?? null) === product && (pc.size ?? '') !== size)) toast('Bu ürünün başka bedeni yok: önce Kalıp sekmesinde "Bedenlere yay"'); break;
        case 'undo': if (undo.length) { redo.push(snap()); restoreFrom(undo.pop()); changed(); } break;
        case 'redo': if (redo.length) { undo.push(snap()); restoreFrom(redo.pop()); changed(); } break;
        case 'cancel': S.tmp = []; S.mergeA = null; S.seamA = []; S.seamB = []; break;
        case 'pop': S.tmp.pop(); break;
        case 'nk': S.notchKind = v; break;
        case 'mk': S.markKind = v; break;
        case 'edge': S.edge = +v; break;
        case 'unedge': S.edge = null; break;
        case 'new-smooth': S.nextSmooth = !S.nextSmooth; break;
        case 'new-pt': { const x = pnum(root.querySelector('#pk-x').value), y = pnum(root.querySelector('#pk-y').value); if (x == null || y == null) { toast('x ve y sayı olmalı (cm)'); return; } S.tmp.push({ p: [x * 10, y * 10], smooth: S.nextSmooth }); break; }
        case 'new-finish': {
          if (S.tmp.length < 3) { toast('En az 3 nokta'); return; }
          const al = pnum(root.querySelector('#pk-allow').value); if (al == null || al < 0) { toast('Dikiş payı geçersiz'); return; }
          push();
          const edges = P.edgesFromPoints(S.tmp, al * 10), xs = S.tmp.map((q) => q.p[0]), ys = S.tmp.map((q) => q.p[1]), cx = (Math.min(...xs) + Math.max(...xs)) / 2;
          const np = P.makePiece({ id: 'w' + Date.now().toString(36), name: root.querySelector('#pk-name').value.trim() || 'Parça', product, size, edges, grain: [[cx, Math.min(...ys) + (Math.max(...ys) - Math.min(...ys)) * 0.25], [cx, Math.min(...ys) + (Math.max(...ys) - Math.min(...ys)) * 0.75]] });
          W.pieces.push(np); S.tmp = []; S.tool = 'sel'; S.sel = np.id; changed(); break;
        }
        case 'side': S.seamSide = v; break;
        case 'seam-save': {
          if (!S.seamA.length || !S.seamB.length) { toast('A ve B tarafında en az birer kenar seç'); return; }
          const ease = pnum(root.querySelector('#pk-ease').value), tol = pnum(root.querySelector('#pk-tol').value);
          if (ease == null || tol == null || tol < 0) { toast('Fark ve tolerans sayı olmalı (cm)'); return; }
          push(); W.seams.push({ id: 'sm' + Date.now().toString(36), name: root.querySelector('#pk-sname').value.trim() || 'Dikiş', a: S.seamA, b: S.seamB, ease: ease * 10, tol: tol * 10 });
          S.seamA = []; S.seamB = []; S.tool = 'sel'; S.sel = null; changed(); break;
        }
        case 'seam-del': push(); W.seams = W.seams.filter((sm) => sm.id !== v); changed(); break;
        case 'rot': push(); replacePiece(P.rotatePiece(pc, +v)); changed(); break;
        case 'flip': push(); replacePiece(P.mirrorPiece(pc)); changed(); break;
        case 'grain': { push(); const g = pc.grain || [P.centroid(pc), C.add(P.centroid(pc), [0, 100])], m = C.mul(C.add(g[0], g[1]), 0.5), R = (q) => { const x = q[0] - m[0], y = q[1] - m[1]; return [m[0] - y, m[1] + x]; }; pc.grain = [R(g[0]), R(g[1])]; changed(); break; }
        case 'unfold': { push(); const M = P.unfoldPiece(pc, pc.fold); M.id = pc.id; M.qty = pc.qty; replacePiece(M); W.seams = W.seams.filter((sm) => ![...sm.a, ...sm.b].some((r) => r.piece === pc.id)); changed(); toast('Kat açıldı: tam parça; bu parçanın dikiş eşleşmeleri kaldırıldı'); break; }
        case 'dup': { push(); const d = P.translatePiece(pc, 40, 40); d.id = pc.id + 'k' + Date.now().toString(36).slice(-3); d.name = pc.name + ' (kopya)'; W.pieces.push(d); S.sel = d.id; changed(); break; }
        case 'del': if (!S.delArm) { S.delArm = true; break; } push(); W.pieces.splice(W.pieces.indexOf(pc), 1); W.seams = W.seams.filter((sm) => ![...sm.a, ...sm.b].some((r) => r.piece === pc.id)); S.sel = null; S.delArm = false; changed(); break;
        case 'allow-all': { const a = pnum(root.querySelector('#pk-all').value); if (a == null || a < 0 || a > 10) { toast('0–10 cm arası gir'); return; } push(); pc.edges.forEach((e) => { e.allow = a * 10; }); changed(); break; }
        case 'notch-mid': push(); pc.notches.push({ edge: S.edge, at: P.edgeLength(pc.edges[S.edge]) / 2, kind: 'tek' }); changed(); break;
        case 'notch-del': push(); pc.notches.splice(+v, 1); changed(); break;
        case 'pdf': case 'pdf3': {
          const r = X.toTiledPDF(group(), { paper: k === 'pdf3' ? [297, 420] : [210, 297], title, meta: { ...meta, date: new Date().toLocaleDateString('tr-TR') } });
          dl(new Blob([r.bytes], { type: 'application/pdf' }), fname('pdf')); toast(`${r.pages} sayfa (${r.grid[0]} satır × ${r.grid[1]} sütun, boşlar atlandı)`); return;
        }
        case 'svg': dl(new Blob([X.toSVG(group(), { title })], { type: 'image/svg+xml' }), fname('svg')); return;
        default: return;
      }
    } catch (er) { toast('⚠ ' + er.message); }
    renderPane(); draw();
  });
  root.addEventListener('change', (ev) => {
    const el = ev.target, pc = cur(); if (!pc) return;
    try {
      if (el.dataset.p) {
        const k = el.dataset.p; push();
        if (k === 'qty') { const v = pnum(el.value); if (!(Number.isInteger(v) && v >= 1)) { undo.pop(); toast('Adet en az 1 tam sayı'); renderPane(); return; } pc.qty = v; }
        else if (k === 'fold') pc.fold = el.value === '' ? null : +el.value;
        else if (k === 'pair') pc.pair = el.checked;
        else pc[k] = el.value;
      } else if (el.dataset.e) {
        const e = pc.edges[S.edge], k = el.dataset.e; push();
        if (k === 'allow') { const v = pnum(el.value); if (v == null || v < 0 || v > 10) { undo.pop(); toast('Pay 0–10 cm'); renderPane(); return; } e.allow = v * 10; }
        else e[k] = el.value;
      } else if (el.dataset.n !== undefined) {
        const v = pnum(el.value), n = pc.notches[+el.dataset.n], L = P.edgeLength(pc.edges[n.edge]);
        if (v == null || v * 10 < 0 || v * 10 > L) { toast(`0 – ${cm(L)} cm arası`); renderPane(); return; }
        push(); n.at = v * 10;
      } else if (el.dataset.nk !== undefined) { push(); pc.notches[+el.dataset.nk].kind = el.value; }
      else return;
      changed(); renderPane();
    } catch (er) { toast('⚠ ' + er.message); }
  });
  const ro = new ResizeObserver(() => resize()); ro.observe(cv);
  renderPane(); resize(); fit();
  root.api = { toScreen: (p) => { const r = cv.getBoundingClientRect(), q = toS(p); return [r.left + q[0], r.top + q[1]]; }, pieces: group };   // test ve hata ayıklama için
  return { root, state: S };
}
