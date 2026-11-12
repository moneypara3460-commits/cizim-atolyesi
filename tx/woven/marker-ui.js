// Kumaş yerleşimi (kesim planı) editörü. Otomatik yerleştirme + elle sürükleme / 180° çevirme; canlı verim ve kontrol.
import * as C from '../curve.js?v=20261112k';
import { saveBlob } from '../download.js?v=20261112k';
import * as P from './pattern.js?v=20261112k';
import * as MK from './marker.js?v=20261112k';
import { pdfDoc } from '../pdf.js?v=20261112k';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const n1 = (v, d = 1) => (Math.round(v * 10 ** d) / 10 ** d).toFixed(d).replace('.', ',');
const COLS = ['#bfdbfe', '#fde68a', '#bbf7d0', '#fbcfe8', '#ddd6fe', '#fed7aa', '#a5f3fc', '#e9d5ff', '#fecaca', '#d9f99d'];

export function markerSVG(pieces, m) {
  const ev = MK.evaluate(pieces, m), L = Math.max(ev.length, 10), W = m.width;
  let s = `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="${n1(L + 20, 3).replace(',', '.')}mm" height="${n1(W + 30, 3).replace(',', '.')}mm" viewBox="-10 -20 ${L + 20} ${W + 30}">\n`;
  s += `<rect x="0" y="0" width="${L}" height="${W}" fill="none" stroke="#888" stroke-width="0.5" stroke-dasharray="6 3"/>\n<text x="0" y="-6" font-size="8" font-family="Helvetica, Arial">Kesim planı · boy ${n1(L / 10)} cm · en ${n1(W / 10)} cm${m.mode === 'folded' ? ' (katlı, y = 0 kat)' : ''} · verim %${n1(ev.efficiency * 100)}</text>\n`;
  for (const q of ev.polys) { s += `<path d="M${q.pts.map((p) => p[0].toFixed(2) + ' ' + p[1].toFixed(2)).join(' L')} Z" fill="none" stroke="#000" stroke-width="0.5"/>\n`; const b = P.bboxPts(q.pts); s += `<text x="${((b.x0 + b.x1) / 2).toFixed(1)}" y="${((b.y0 + b.y1) / 2).toFixed(1)}" font-size="6" text-anchor="middle" font-family="Helvetica, Arial">${esc(q.it.pc.name)}${q.pl.rot ? ' ↻' : ''}${q.pl.flip ? ' (ters)' : ''}</text>\n`; }
  return s + '</svg>\n';
}
// Kesim planı PDF: A3 yatay, standart ölçekte (sığmazsa sayfalara bölünür), istatistik ve kısıtlar
export function markerPDF(pieces, m, { title = 'Kesim planı', meta = {} } = {}) {
  const ev = MK.evaluate(pieces, m), doc = pdfDoc(), pw = 420, ph = 297, M = 12;
  const L = Math.max(ev.length, 10), W = m.width;
  const sc = [5, 10, 20, 25, 50].find((k) => W / k <= ph - 2 * M - 80) || 50;
  const perPage = (pw - 2 * M) * sc, pages = Math.max(1, Math.ceil(L / perPage));
  for (let i = 0; i < pages; i++) {
    const pg = doc.page(pw, ph), x0 = i * perPage;
    pg.text(M, ph - M - 6, 12, `${title}${meta.product ? ' · ' + meta.product : ''}${meta.size ? ' · Beden ' + meta.size : ''}`);
    pg.text(M, ph - M - 13, 8, `Kumaş: ${meta.fabric || '—'} · serim: ${m.mode === 'folded' ? 'katlı (iki kat)' : 'açık en (tek kat)'} · boy ${n1(L / 10)} cm · verim %${n1(ev.efficiency * 100)} · fire %${n1(ev.waste * 100)} · ${ev.pieceCount} parça · ölçek 1:${sc} · sayfa ${i + 1}/${pages}`);
    const by = ph - M - 24 - W / sc, f = (p) => [M + (p[0] - x0) / sc, by + (W - p[1]) / sc];
    pg.save(); pg.clipRect(M, by - 1, pw - 2 * M, W / sc + 2);
    pg.dash([3, 1.5]); pg.lineWidth(0.2); pg.rect(M - x0 / sc, by, L / sc, W / sc); pg.dash(null);
    ev.polys.forEach((q) => { pg.lineWidth(0.25); pg.path(C.polyPath(q.pts, true), f); const b = P.bboxPts(q.pts), c = f([(b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2]); pg.text(c[0], c[1], 5, q.it.pc.name + (q.pl.rot ? ' (180°)' : '') + (q.pl.flip ? ' (ters)' : ''), 0, true); });
    pg.restore();
    if (m.mode === 'folded') pg.text(M, by - 4, 6, 'Alt kenar: kumaş katı (kat çizgisi)');
    let ty = by - 12; pg.text(M, ty, 8, 'Kısıtlar ve varsayımlar'); ty -= 5;
    for (const c of m.constraints || []) { pg.text(M, ty, 6.5, '• ' + c); ty -= 4; if (ty < M) break; }
    for (const is of ev.issues) { if (ty < M) break; pg.text(M, ty, 6.5, (is.level === 'hata' ? 'HATA: ' : 'Uyarı: ') + is.msg); ty -= 4; }
  }
  return { bytes: doc.build(), pages, scale: sc };
}

export function openMarkerEditor(project, { product = null, size = '', fabrics, initial = null, onSave, onChange, toast, meta = {} }) {
  const pieces = project.woven.pieces.filter((pc) => (pc.product ?? null) === product && (pc.size ?? '') === size && pc.fabric === 'ana');
  const root = document.createElement('div'); root.id = 'mkx';
  root.innerHTML = `<style>
    #mkx { position: fixed; inset: 0; z-index: 30; background: #0b1222; display: flex; flex-direction: column; }
    #mkx .bar { display: flex; gap: 5px; padding: 6px; overflow-x: auto; flex: none; align-items: flex-end; }
    #mkx .bar button { flex: 0 0 auto; padding: 8px 10px; }
    #mkx .bar label.f { flex: 0 0 auto; min-width: 90px; }
    #mkx .cv { flex: 1; position: relative; min-height: 120px; touch-action: none; }
    #mkx canvas { position: absolute; inset: 0; width: 100%; height: 100%; touch-action: none; }
    #mkx .pane { flex: none; max-height: 34vh; overflow-y: auto; padding: 6px 8px 10px; background: #0f172a; border-top: 1px solid #1e293b; }
    #mkx .st { position: absolute; left: 8px; top: 6px; right: 8px; font-size: 12.5px; color: #0f172a; pointer-events: none; font-weight: 600; }
  </style>
  <div class="bar"><button data-k="close">✕ Kapat</button><b style="flex:1 0 auto;padding:0 6px;font-size:14px">Kesim planı${meta.product ? ' · ' + esc(meta.product) : ''}${size ? ' · ' + esc(size) : ''}</b><button data-k="rot">↻ 180°</button><button class="ok" data-k="save">Kaydet</button></div>
  <div class="bar">
    <label class="f"><span>Kumaş</span><select id="mk-fab">${fabrics.map((f) => `<option value="${f.id}">${esc(f.name)}${f.props.width ? ` (${f.props.width / 10} cm)` : ' (en yok)'}</option>`).join('')}</select></label>
    <label class="f"><span>Serim</span><select id="mk-mode"><option value="single">Açık en, tek kat</option><option value="folded">Katlı, iki kat</option></select></label>
    <label class="f"><span>Kenar (mm)</span><input id="mk-sel" inputmode="numeric" value="10" style="width:70px"></label>
    <label class="f"><span>Aralık (mm)</span><input id="mk-gap" inputmode="numeric" value="2" style="width:70px"></label>
    <label class="f"><span>Izgara (mm)</span><select id="mk-res"><option>10</option><option selected>5</option><option>3</option></select></label>
    <label class="small"><input type="checkbox" id="mk-match"> desen eşleştir</label>
    <button class="on" data-k="auto">⚙ Otomatik yerleştir</button></div>
  <div class="cv"><canvas></canvas><div class="st"></div></div>
  <div class="pane"></div>`;
  document.body.appendChild(root);
  const cv = root.querySelector('canvas'), st = root.querySelector('.st'), pane = root.querySelector('.pane'), ctx = cv.getContext('2d');
  const S = { m: initial ? JSON.parse(JSON.stringify(initial)) : null, sel: null, k: 0.3, ox: -20, oy: -20, dpr: 1, ev: null };
  if (initial) { root.querySelector('#mk-fab').value = initial.fabric; root.querySelector('#mk-mode').value = initial.mode; root.querySelector('#mk-sel').value = initial.selvedge; root.querySelector('#mk-gap').value = initial.gap; root.querySelector('#mk-res').value = initial.res; root.querySelector('#mk-match').checked = !!initial.patternMatch; }
  const fab = () => fabrics.find((f) => f.id === root.querySelector('#mk-fab').value);
  const keyColor = new Map(); pieces.forEach((pc, i) => keyColor.set(pc.id, COLS[i % COLS.length]));

  function resize() { const r = cv.getBoundingClientRect(); S.dpr = window.devicePixelRatio || 1; cv.width = Math.max(1, r.width * S.dpr); cv.height = Math.max(1, r.height * S.dpr); draw(); }
  function fit() { if (!S.m) return draw(); const r = cv.getBoundingClientRect(), L = Math.max(S.ev?.length || 1000, 300); S.k = Math.min((r.width - 30) / L, (r.height - 50) / S.m.width); S.ox = -10 / S.k; S.oy = -30 / S.k; draw(); }
  const toS = (p) => [(p[0] - S.ox) * S.k, (p[1] - S.oy) * S.k];
  const toW = (x, y) => [x / S.k + S.ox, y / S.k + S.oy];
  function draw() {
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = '#f1f5f9'; ctx.fillRect(0, 0, cv.width, cv.height); ctx.setTransform(S.dpr, 0, 0, S.dpr, 0, 0);
    if (!S.m) { st.textContent = 'Kumaşı ve serimi seç, "Otomatik yerleştir"e dokun.'; return; }
    const ev = S.ev = MK.evaluate(pieces, S.m), L = Math.max(ev.length, 100);
    const a = toS([0, 0]), b = toS([L + 200, S.m.width]);
    ctx.fillStyle = '#fff'; ctx.fillRect(a[0], a[1], b[0] - a[0], b[1] - a[1]); ctx.strokeStyle = '#94a3b8'; ctx.setLineDash([6, 4]); ctx.strokeRect(a[0], a[1], b[0] - a[0], b[1] - a[1]); ctx.setLineDash([]);
    if (S.m.mode === 'folded') { ctx.strokeStyle = '#a855f7'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], a[1]); ctx.stroke(); }
    const e = toS([ev.length, 0]); ctx.strokeStyle = '#dc2626'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(e[0], a[1] - 8); ctx.lineTo(e[0], b[1] + 8); ctx.stroke();
    const bad = new Set(); for (const is of ev.issues) if (is.level === 'hata') for (const q of ev.polys) if (is.msg.includes(q.it.pc.name)) bad.add(q.pl.key);
    for (const q of ev.polys) {
      ctx.beginPath(); q.pts.forEach((p, i) => (i ? ctx.lineTo(...toS(p)) : ctx.moveTo(...toS(p)))); ctx.closePath();
      ctx.fillStyle = bad.has(q.pl.key) ? '#fecaca' : keyColor.get(q.it.src?.id || q.it.pc.id) || '#ddd'; ctx.fill();
      ctx.lineWidth = S.sel === q.pl.key ? 3 : 1; ctx.strokeStyle = S.sel === q.pl.key ? '#0284c7' : bad.has(q.pl.key) ? '#dc2626' : '#0f172a'; ctx.stroke();
      const bb = P.bboxPts(q.pts), c = toS([(bb.x0 + bb.x1) / 2, (bb.y0 + bb.y1) / 2]);
      if (S.k * (bb.x1 - bb.x0) > 40) { ctx.fillStyle = '#0f172a'; ctx.font = '11px Helvetica, Arial, sans-serif'; ctx.textAlign = 'center'; ctx.fillText(q.it.pc.name + (q.pl.rot ? ' ↻' : '') + (q.pl.flip ? ' ⇋' : ''), c[0], c[1]); }
    }
    const err = ev.issues.filter((x) => x.level === 'hata').length;
    st.textContent = `Boy ${n1(ev.length / 10)} cm · verim %${n1(ev.efficiency * 100)} · fire %${n1(ev.waste * 100)} · ${ev.pieceCount} parça${err ? ` · ⛔ ${err} hata` : ' · ✅'}`;
  }
  function renderPane() {
    if (!S.m) { pane.innerHTML = `<div class="small">${pieces.length} ana kumaş parçası. Astar / tela parçaları ayrı planlanır (bu ekranda yalnız ana kumaş).</div>`; return; }
    const ev = S.ev || MK.evaluate(pieces, S.m);
    pane.innerHTML = `${ev.issues.map((x) => `<div class="issue ${x.level}">${x.level === 'hata' ? '⛔' : '⚠'} ${esc(x.msg)}</div>`).join('') || '<div class="small">✅ Çakışma yok, bütün parçalar en içinde ve yerleşti.</div>'}
      <h4 style="margin:8px 0 2px;font-size:13px">Kısıtlar</h4>${(S.m.constraints || []).map((c) => `<div class="small">• ${esc(c)}</div>`).join('')}
      <div class="small">Parçayı sürükleyerek elle düzeltebilirsin; çakışan parça kırmızı görünür.</div>
      <h4 style="margin:8px 0 2px;font-size:13px">Çıktı</h4><div class="grp" style="display:flex;gap:5px;flex-wrap:wrap"><button data-k="pdf">⬇ Kesim planı PDF</button><button data-k="svg">⬇ SVG 1:1 (çizici)</button></div>`;
  }
  function auto() {
    const f = fab(); if (!f) { toast('Ürüne bağlı kumaş yok'); return; }
    try {
      const r = MK.makeMarker(pieces, f, { mode: root.querySelector('#mk-mode').value, selvedge: +root.querySelector('#mk-sel').value || 0, gap: +root.querySelector('#mk-gap').value || 0, res: +root.querySelector('#mk-res').value, patternMatch: root.querySelector('#mk-match').checked });
      S.m = { ...r.marker, fabric: f.id }; S.sel = null; S.ev = null; draw(); fit(); renderPane();
      toast(`${r.marker.ms} ms · boy ${n1(r.eval.length / 10)} cm · verim %${n1(r.eval.efficiency * 100)}${r.fails.length ? ' · yerleşmeyen: ' + r.fails.join(', ') : ''}`);
    } catch (e) { toast('⚠ ' + e.message); }
  }
  // sürükleme
  const ptrs = new Map(); let g = null;
  const rel = (e) => { const r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  const hit = (q) => { if (!S.ev) return null; const w = toW(...q); for (const p of [...S.ev.polys].reverse()) if (P.insidePoly(p.pts, w)) return p.pl.key; return null; };
  cv.addEventListener('pointerdown', (e) => {
    cv.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, rel(e));
    if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; g = { kind: 'pinch', d0: Math.hypot(a[0] - b[0], a[1] - b[1]), k0: S.k, w: toW((a[0] + b[0]) / 2, (a[1] + b[1]) / 2) }; return; }
    const q = rel(e), k = hit(q);
    g = { kind: k ? 'move' : 'pan', key: k, s0: q, o0: [S.ox, S.oy], last: toW(...q), moved: false };
    if (k) { S.sel = k; draw(); }
  });
  cv.addEventListener('pointermove', (e) => {
    if (!ptrs.has(e.pointerId) || !g) return; const q = rel(e); ptrs.set(e.pointerId, q);
    if (g.kind === 'pinch' && ptrs.size >= 2) { const [a, b] = [...ptrs.values()], d = Math.hypot(a[0] - b[0], a[1] - b[1]), c = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]; S.k = Math.max(0.02, Math.min(20, g.k0 * d / (g.d0 || 1))); S.ox = g.w[0] - c[0] / S.k; S.oy = g.w[1] - c[1] / S.k; draw(); return; }
    if (Math.hypot(q[0] - g.s0[0], q[1] - g.s0[1]) > 5) g.moved = true; if (!g.moved) return;
    if (g.kind === 'pan') { S.ox = g.o0[0] - (q[0] - g.s0[0]) / S.k; S.oy = g.o0[1] - (q[1] - g.s0[1]) / S.k; draw(); }
    if (g.kind === 'move') { const w = toW(...q), pl = S.m.placements.find((x) => x.key === g.key); pl.x = Math.max(0, pl.x + w[0] - g.last[0]); if (!pl.onFold) pl.y += w[1] - g.last[1]; g.last = w; draw(); }
  });
  cv.addEventListener('pointerup', (e) => { if (!ptrs.has(e.pointerId)) return; ptrs.delete(e.pointerId); if (g && g.kind === 'pinch') { if (!ptrs.size) g = null; return; } if (g && g.kind === 'move' && g.moved) { renderPane(); onChange && onChange(); } if (g && !g.moved && !g.key) { S.sel = null; draw(); } g = null; });
  cv.addEventListener('pointercancel', (e) => { ptrs.delete(e.pointerId); g = null; });
  cv.addEventListener('wheel', (e) => { e.preventDefault(); const q = rel(e), w = toW(...q); S.k = Math.max(0.02, Math.min(20, S.k * (e.deltaY < 0 ? 1.15 : 1 / 1.15))); S.ox = w[0] - q[0] / S.k; S.oy = w[1] - q[1] / S.k; draw(); }, { passive: false });
  const dl = (blob, name) => saveBlob(blob, name);
  const fname = (ext) => ('kesim-plani-' + (meta.product || '') + '-' + size).replace(/[^\wçğıöşüÇĞİÖŞÜ -]+/g, '_') + '.' + ext;
  root.addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-k]'); if (!b) return;
    switch (b.dataset.k) {
      case 'close': ro.disconnect(); root.remove(); onChange && onChange(true); return;
      case 'auto': auto(); return;
      case 'rot': { if (!S.m || !S.sel) { toast('Önce parçaya dokun'); return; } if (S.m.nap) { toast('Havlı / yönlü kumaşta parça çevrilemez'); return; } const pl = S.m.placements.find((x) => x.key === S.sel); pl.rot = pl.rot ? 0 : 180; draw(); renderPane(); return; }
      case 'save': { if (!S.m) { toast('Önce yerleştir'); return; } const ev2 = MK.evaluate(pieces, S.m); S.m.length = ev2.length; S.m.efficiency = ev2.efficiency; S.m.at = Date.now(); onSave({ ...S.m, product, size }); toast(`Kaydedildi${ev2.issues.some((x) => x.level === 'hata') ? ' (hatalı plan!)' : ''}`); return; }
      case 'pdf': { const r = markerPDF(pieces, S.m, { meta: { ...meta, size, fabric: fab()?.name } }); dl(new Blob([r.bytes], { type: 'application/pdf' }), fname('pdf')); return; }
      case 'svg': dl(new Blob([markerSVG(pieces, S.m)], { type: 'image/svg+xml' }), fname('svg')); return;
      default:
    }
  });
  const ro = new ResizeObserver(() => resize()); ro.observe(cv);
  resize(); if (S.m) fit(); renderPane();
  root.api = { evaluate: () => (S.m ? MK.evaluate(pieces, S.m) : null), marker: () => S.m, toScreen: (p) => { const r = cv.getBoundingClientRect(), q = toS(p); return [r.left + q[0], r.top + q[1]]; } };
  return { root };
}
