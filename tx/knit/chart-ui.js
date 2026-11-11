// Örgü şeması editörü (tam ekran). Fırça: dokun / sürükle ile ilmek ve renk boyar; "Kaydır" ile gezinilir; iki parmak yakınlaştırır.
import * as K from './chart.js?v=20261112e';
import { drawChartCanvas, chartPDF } from './chart-export.js?v=20261112e';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const PAL = ['k', 'p', 't', 'm', 'yo', 'k2t', 'ssk', 'c2R', 'c2L', 'c4R', 'c4L', 'c6R', 'c6L', 'x'];

export function openChartEditor(ch, { onChange, toast, meta = {} }) {
  const root = document.createElement('div');
  root.id = 'kcx';
  root.innerHTML = `<style>
    #kcx { position: fixed; inset: 0; z-index: 30; background: #0b1222; display: flex; flex-direction: column; }
    #kcx .bar { display: flex; gap: 5px; padding: 6px; overflow-x: auto; flex: none; align-items: center; }
    #kcx .bar button { flex: 0 0 auto; padding: 8px 10px; min-width: 40px; }
    #kcx .cv { flex: 1; position: relative; min-height: 120px; touch-action: none; }
    #kcx canvas { position: absolute; inset: 0; width: 100%; height: 100%; touch-action: none; }
    #kcx .pane { flex: none; max-height: 40vh; overflow-y: auto; padding: 6px 8px 10px; background: #0f172a; border-top: 1px solid #1e293b; }
    #kcx .st { position: absolute; left: 8px; top: 6px; right: 8px; font-size: 12px; color: #475569; pointer-events: none; }
    #kcx .grp { display: flex; gap: 5px; flex-wrap: wrap; margin: 4px 0; align-items: flex-end; }
    #kcx .grp > button { flex: 0 1 auto; }
    #kcx label.f { flex: 1 1 80px; }
    #kcx .sw { display: inline-block; width: 14px; height: 14px; border-radius: 3px; vertical-align: -2px; border: 1px solid #64748b; }
  </style>
  <div class="bar"><button data-k="close">✕ Kapat</button><b style="flex:1 0 auto;padding:0 6px;font-size:14px">${esc(ch.name)}</b><button data-k="undo">↶</button><button data-k="redo">↷</button><button data-k="fit">Sığdır</button></div>
  <div class="bar" id="kcx-tools"></div>
  <div class="bar" id="kcx-st"></div>
  <div class="cv"><canvas></canvas><div class="st"></div></div>
  <div class="pane"></div>`;
  document.body.appendChild(root);
  const cv = root.querySelector('canvas'), st = root.querySelector('.st'), pane = root.querySelector('.pane'), ctx = cv.getContext('2d');
  const S = { tool: 'paint', stitch: 'p', color: null, c: 16, ox: 10, oy: 10, dpr: 1, row: 0, sel: null, a: null };
  const undo = [], redo = [];
  const snap = () => JSON.stringify(ch);
  const push = () => { undo.push(snap()); if (undo.length > 100) undo.shift(); redo.length = 0; };
  const restoreFrom = (t) => { const o = JSON.parse(t); for (const k of Object.keys(ch)) delete ch[k]; Object.assign(ch, o); };
  const changed = () => { onChange && onChange(); draw(); renderPane(); };

  function bars() {
    root.querySelector('#kcx-tools').innerHTML = [['paint', '🖌 Boya'], ['rect', '▭ Alan doldur'], ['repeat', '⟲ Tekrar alanı'], ['row', '☰ Sıra bilgisi'], ['pan', '✋ Kaydır']].map(([k, l]) => `<button data-k="tool" data-v="${k}" class="${S.tool === k ? 'on' : ''}">${l}</button>`).join('');
    root.querySelector('#kcx-st').innerHTML = PAL.map((k) => { const s = K.STITCHES[k]; return `<button data-k="stitch" data-v="${k}" class="${S.color == null && S.stitch === k ? 'on' : ''}" title="${esc(s.label)}">${s.cable ? (s.dir === 'L' ? '⤬' : '⤫') + s.cable / 2 + '/' + s.cable / 2 + (s.dir === 'L' ? '←' : '→') : esc(s.sym || (k === 'x' ? '▒' : '□'))}</button>`; }).join('') +
      ch.palette.map((p, i) => `<button data-k="color" data-v="${i}" class="${S.color === i ? 'on' : ''}"><span class="sw" style="background:${p.hex}"></span></button>`).join('') + '<button data-k="add-color">+ Renk</button>';
  }
  function resize() { const r = cv.getBoundingClientRect(); S.dpr = window.devicePixelRatio || 1; cv.width = Math.max(1, r.width * S.dpr); cv.height = Math.max(1, r.height * S.dpr); draw(); }
  function fit() { const r = cv.getBoundingClientRect(); S.c = Math.max(3, Math.min(40, Math.floor(Math.min((r.width - 40) / ch.w, (r.height - 34) / ch.h)))); S.ox = Math.max(6, (r.width - 30 - ch.w * S.c) / 2); S.oy = 22; draw(); }
  function draw() {
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = '#f8fafc'; ctx.fillRect(0, 0, cv.width, cv.height);
    ctx.setTransform(S.dpr, 0, 0, S.dpr, 0, 0);
    drawChartCanvas(ctx, ch, { c: S.c, ox: S.ox, oy: S.oy, hl: S.tool === 'row' ? S.row : null, sel: S.sel });
    const s = K.rowStats(ch, Math.min(S.row, ch.h - 1));
    st.textContent = { paint: `Fırça: ${S.color != null ? 'renk ' + ch.palette[S.color].name : K.STITCHES[S.stitch].label} · dokun / sürükle`, rect: S.a ? 'Alanın ikinci köşesi' : 'Alanın ilk köşesi', repeat: S.a ? 'Tekrarın ikinci köşesi' : 'Tekrarın ilk köşesi', row: `Sıra ${S.row + 1}: ${s.live} ilmek, ${s.colors.length} renk${s.delta ? ', ilmek değişimi ' + (s.delta > 0 ? '+' : '') + s.delta : ''}`, pan: 'Sürükle: kaydır' }[S.tool];
  }
  const cellAt = (sx, sy) => { const x = Math.floor((sx - S.ox) / S.c), yy = Math.floor((sy - S.oy) / S.c), y = ch.h - 1 - yy; return x >= 0 && x < ch.w && y >= 0 && y < ch.h ? { x, y } : null; };
  function paint(cell) {
    if (!cell) return false;
    try {
      if (S.color != null) { if (K.getC(ch, cell.x, cell.y) === S.color) return false; K.setColor(ch, cell.x, cell.y, S.color); }
      else { if (K.get(ch, cell.x, cell.y) === S.stitch) return false; K.setStitch(ch, cell.x, cell.y, S.stitch); }
      return true;
    } catch (e) { toast('⚠ ' + e.message); return false; }
  }
  /* ---------- dokunma ---------- */
  const ptrs = new Map(); let g = null;
  const rel = (e) => { const r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  cv.addEventListener('pointerdown', (e) => {
    cv.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, rel(e));
    if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; g = { kind: 'pinch', d0: Math.hypot(a[0] - b[0], a[1] - b[1]), c0: S.c, m: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], o0: [S.ox, S.oy] }; return; }
    const q = rel(e);
    if (S.tool === 'paint') { push(); const ok = paint(cellAt(...q)); g = { kind: 'paint', any: ok }; draw(); return; }
    g = { kind: S.tool === 'pan' ? 'pan' : 'tap', s0: q, o0: [S.ox, S.oy], moved: false };
  });
  cv.addEventListener('pointermove', (e) => {
    if (!ptrs.has(e.pointerId) || !g) return; const q = rel(e); ptrs.set(e.pointerId, q);
    if (g.kind === 'pinch' && ptrs.size >= 2) { const [a, b] = [...ptrs.values()], d = Math.hypot(a[0] - b[0], a[1] - b[1]), k = Math.max(3, Math.min(48, g.c0 * d / (g.d0 || 1))); S.ox = g.m[0] - (g.m[0] - g.o0[0]) * k / g.c0; S.oy = g.m[1] - (g.m[1] - g.o0[1]) * k / g.c0; S.c = k; draw(); return; }
    if (g.kind === 'paint') { if (paint(cellAt(...q))) { g.any = true; draw(); } return; }
    if (Math.hypot(q[0] - g.s0[0], q[1] - g.s0[1]) > 6) g.moved = true;
    if (g.kind === 'pan' || (g.kind === 'tap' && g.moved)) { S.ox = g.o0[0] + q[0] - g.s0[0]; S.oy = g.o0[1] + q[1] - g.s0[1]; draw(); }
  });
  cv.addEventListener('pointerup', (e) => {
    if (!ptrs.has(e.pointerId)) return; ptrs.delete(e.pointerId);
    if (!g) return;
    if (g.kind === 'pinch') { if (!ptrs.size) g = null; return; }
    if (g.kind === 'paint') { if (g.any) changed(); else undo.pop(); g = null; return; }
    if (g.kind === 'tap' && !g.moved) {
      const cell = cellAt(...rel(e));
      if (cell && S.tool === 'row') { S.row = cell.y; draw(); renderPane(); }
      if (cell && (S.tool === 'rect' || S.tool === 'repeat')) {
        if (!S.a) { S.a = cell; S.sel = { x: cell.x, y: cell.y, w: 1, h: 1 }; draw(); }
        else {
          const r = { x: Math.min(S.a.x, cell.x), y: Math.min(S.a.y, cell.y), w: Math.abs(S.a.x - cell.x) + 1, h: Math.abs(S.a.y - cell.y) + 1 };
          push();
          if (S.tool === 'repeat') { ch.repeat = r; toast(`Tekrar: ${r.w} ilmek × ${r.h} sıra`); }
          else for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) { try { if (S.color != null) K.setColor(ch, x, y, S.color); else if (!(K.STITCHES[S.stitch].cable && (x - r.x) % K.STITCHES[S.stitch].cable)) K.setStitch(ch, x, y, S.stitch); } catch (er) { /* sığmayan çapraz atlanır */ } }
          S.a = null; S.sel = null; changed();
        }
      }
    }
    g = null;
  });
  cv.addEventListener('pointercancel', (e) => { ptrs.delete(e.pointerId); g = null; });
  cv.addEventListener('wheel', (e) => { e.preventDefault(); const q = rel(e), k = Math.max(3, Math.min(48, S.c * (e.deltaY < 0 ? 1.15 : 1 / 1.15))); S.ox = q[0] - (q[0] - S.ox) * k / S.c; S.oy = q[1] - (q[1] - S.oy) * k / S.c; S.c = k; draw(); }, { passive: false });

  /* ---------- panel ---------- */
  function renderPane() {
    root.querySelector('[data-k="undo"]').disabled = !undo.length; root.querySelector('[data-k="redo"]').disabled = !redo.length;
    bars();
    const iss = K.validateChart(ch), s = K.rowStats(ch, Math.min(S.row, ch.h - 1));
    pane.innerHTML = `<div class="grp"><label class="f"><span>Ad</span><input data-c="name" value="${esc(ch.name)}"></label><label class="f"><span>Genişlik (ilmek)</span><input data-c="w" inputmode="numeric" value="${ch.w}"></label><label class="f"><span>Yükseklik (sıra)</span><input data-c="h" inputmode="numeric" value="${ch.h}"></label></div>
      <div class="small">${ch.repeat ? `Tekrar: ${ch.repeat.w} ilmek × ${ch.repeat.h} sıra (kırmızı çerçeve)` : 'Tekrar alanı yok: bütün desen tekrar sayılır'} · ${ch.w * ch.h} hücre</div>
      ${S.tool === 'row' ? `<div class="small">Sıra ${S.row + 1}: ${Object.entries(s.counts).filter(([c]) => c !== 'c+').map(([c, n]) => `${n} ${esc(K.STITCHES[c]?.label || c)}`).join(', ')}${Object.keys(s.floats).length ? ' · en uzun atlama: ' + Object.entries(s.floats).map(([c, f]) => `${esc(ch.palette[c].name)} ${f}`).join(', ') : ''}</div>` : ''}
      ${S.color != null ? `<div class="grp"><label class="f"><span>Renk adı</span><input data-p="name" value="${esc(ch.palette[S.color].name)}"></label><label class="f" style="flex:0 0 70px"><span>Renk</span><input type="color" data-p="hex" value="${ch.palette[S.color].hex}"></label></div>` : ''}
      <h4 style="margin:8px 0 2px;font-size:13px">Kontrol</h4>${iss.length ? iss.slice(0, 30).map((x) => `<div class="issue ${x.level}">${x.level === 'hata' ? '⛔' : '⚠'} ${esc(x.msg)}</div>`).join('') + (iss.length > 30 ? `<div class="small">… ${iss.length - 30} daha</div>` : '') : '<div class="small">✅ Saç örgüleri tam, sıralarda ilmek sayısı dengeli, atlama iplikleri sınırda.</div>'}
      <h4 style="margin:8px 0 2px;font-size:13px">Çıktı</h4><div class="grp"><button data-k="pdf">⬇ PDF şema</button><button data-k="png">⬇ PNG</button><button data-k="csv">⬇ CSV</button><button data-k="txt">⬇ Yazılı talimat</button></div>
      <div class="small">Yazılı talimat gidiş-dönüş örgü içindir (çift sıralar arka yüzden, düz / ters yer değiştirir). Makine programı değildir: makineye özgü çıktı Aşama 8'de, yalnız doğrulanan makineler için.</div>`;
  }
  const dl = (blob, name) => { const u = URL.createObjectURL(blob), a = document.createElement('a'); a.href = u; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(u), 5000); };
  const fname = (ext) => ch.name.replace(/[^\wçğıöşüÇĞİÖŞÜ -]+/g, '_') + '.' + ext;
  root.addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-k]'); if (!b) return;
    const k = b.dataset.k, v = b.dataset.v;
    switch (k) {
      case 'close': ro.disconnect(); root.remove(); onChange && onChange(true); return;
      case 'tool': S.tool = v; S.a = null; S.sel = null; break;
      case 'stitch': S.stitch = v; S.color = null; if (S.tool !== 'rect') S.tool = 'paint'; break;
      case 'color': S.color = +v; if (S.tool !== 'rect') S.tool = 'paint'; break;
      case 'add-color': push(); ch.palette.push({ name: 'Renk ' + (ch.palette.length + 1), hex: '#' + Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, '0') }); S.color = ch.palette.length - 1; changed(); return;
      case 'fit': fit(); return;
      case 'undo': if (undo.length) { redo.push(snap()); restoreFrom(undo.pop()); changed(); } return;
      case 'redo': if (redo.length) { undo.push(snap()); restoreFrom(redo.pop()); changed(); } return;
      case 'pdf': { const r = chartPDF(ch, { meta }); dl(new Blob([r.bytes], { type: 'application/pdf' }), fname('pdf')); toast(r.pages + ' sayfa'); return; }
      case 'png': { const c2 = document.createElement('canvas'), cs = Math.max(8, Math.min(24, Math.floor(2400 / Math.max(ch.w, ch.h)))); c2.width = ch.w * cs + 3 * cs; c2.height = ch.h * cs + 3 * cs; const g2 = c2.getContext('2d'); g2.fillStyle = '#fff'; g2.fillRect(0, 0, c2.width, c2.height); drawChartCanvas(g2, ch, { c: cs, ox: cs, oy: cs }); c2.toBlob((bl) => dl(bl, fname('png')), 'image/png'); return; }
      case 'csv': dl(new Blob([K.toCSV(ch)], { type: 'text/csv' }), fname('csv')); return;
      case 'txt': dl(new Blob([K.instructions(ch).join('\n') + '\n'], { type: 'text/plain' }), fname('txt')); return;
      default: return;
    }
    renderPane(); draw();
  });
  root.addEventListener('change', (ev) => {
    const el = ev.target;
    if (el.dataset.c) {
      const k = el.dataset.c;
      if (k === 'name') { ch.name = el.value.trim() || ch.name; changed(); return; }
      const n = parseInt(el.value, 10), w = k === 'w' ? n : ch.w, h = k === 'h' ? n : ch.h;
      if (!(n >= 1 && n <= (k === 'w' ? 400 : 1000))) { toast(k === 'w' ? '1–400 ilmek' : '1–1000 sıra'); renderPane(); return; }
      push(); K.resize(ch, w, h); fit(); changed(); return;
    }
    if (el.dataset.p && S.color != null) { push(); ch.palette[S.color][el.dataset.p] = el.value; changed(); }
  });
  const ro = new ResizeObserver(() => resize()); ro.observe(cv);
  renderPane(); resize(); fit();
  root.api = { cell: (x, y) => { const r = cv.getBoundingClientRect(); return [r.left + S.ox + (x + 0.5) * S.c, r.top + S.oy + (ch.h - 1 - y + 0.5) * S.c]; } };
  return { root, state: S };
}
