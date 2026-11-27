// Ayakkabı Modelhanesi — dışa aktarma: PDF (1:1, sayfalama), SVG (mm), DXF (R12, katmanlı). Saf modül (DOM yok).
// Hepsi build.js çizim listesinden üretilir; yalnız görünür katmanlar yazılır.
import * as G from './geom.js?v=20261119c';
import { pdfDoc, textWidth } from '../tx/pdf.js?v=20261112u';
import { LAYER, LAYERS, LINE_TYPES, SIDES } from './model.js?v=20261127a';
import { pieceItems, sketchItems, itemsBox, measure, fmt } from './build.js?v=20261119c';

const { C } = G;
// baskı renkleri (beyaz kâğıt). Kullanıcı katman rengini değiştirdiyse onun rengi kullanılır.
export const PRINT = { kesim: '#000000', net: '#6b7280', dikis: '#0369a1', binme: '#c2410c', montaj: '#a21caf', binmeNok: '#c2410c', centik: '#dc2626', katlama: '#15803d', merkez: '#1d4ed8', referans: '#a16207', delik: '#6d28d9', olcu: '#374151', yazi: '#000000', yardimci: '#9ca3af' };
export function layerStyle(project, id) {
  const L = LAYER[id], u = project.layers[id] || {};
  const color = u.color && u.color.toLowerCase() !== L.color.toLowerCase() ? u.color : PRINT[id];
  const dash = u.type && LINE_TYPES[u.type] ? LINE_TYPES[u.type].dash : L.dash;
  return { color, width: Math.max(0.05, +u.width || L.width), dash, visible: u.visible !== false, name: L.name, dxf: L.dxf, aci: L.aci };
}
const hexRGB = (h) => { const m = /^#?([0-9a-f]{6})$/i.exec(h || ''); const v = m ? parseInt(m[1], 16) : 0; return [(v >> 16 & 255) / 255, (v >> 8 & 255) / 255, (v & 255) / 255]; };
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const n3 = (v) => +(+v).toFixed(3);
function itemsFor(project, { pieces = null, sketch = true } = {}) {
  const out = sketch ? sketchItems(project) : [];
  for (const pc of project.pieces) if (!pieces || pieces.includes(pc.id)) out.push(...pieceItems(pc, project));
  return out.filter((it) => project.layers[it.layer]?.visible !== false);
}

/* ================= SVG ================= */
export function toSVG(project, { pieces = null, sketch = true, margin = 10 } = {}) {
  const items = itemsFor(project, { pieces, sketch });
  const b = itemsBox(items) || { x0: 0, y0: 0, x1: 100, y1: 100 };
  const x0 = b.x0 - margin, y0 = b.y0 - margin, w = b.x1 - b.x0 + 2 * margin, h = b.y1 - b.y0 + 2 * margin;
  const byLayer = new Map(); for (const it of items) { if (!byLayer.has(it.layer)) byLayer.set(it.layer, []); byLayer.get(it.layer).push(it); }
  let s = `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape" width="${n3(w)}mm" height="${n3(h)}mm" viewBox="${n3(x0)} ${n3(y0)} ${n3(w)} ${n3(h)}">\n`;
  s += `<title>${esc(project.name)}${project.code ? ' · ' + esc(project.code) : ''}</title>\n<desc>Ayakkabı Modelhanesi · Çizim Atölyesi · birim mm · ölçek 1:1 · numara ${esc(project.size)}</desc>\n`;
  for (const L of LAYERS) {
    const arr = byLayer.get(L.id); if (!arr) continue;
    const st = layerStyle(project, L.id);
    s += `<g id="${L.id}" inkscape:groupmode="layer" inkscape:label="${esc(st.name)}" fill="none" stroke="${st.color}" stroke-width="${st.width}" stroke-linejoin="round" stroke-linecap="round"${st.dash.length ? ` stroke-dasharray="${st.dash.join(' ')}"` : ''}>\n`;
    for (const it of arr) {
      const pa = it.piece ? ` data-piece="${esc(it.piece)}"` : '';
      if (it.t === 'path') s += `<path${pa} d="${C.toSVGd(it.path)}"/>\n`;
      else if (it.t === 'poly') s += `<${it.closed ? 'polygon' : 'polyline'}${pa} points="${it.pts.map((p) => n3(p[0]) + ',' + n3(p[1])).join(' ')}"/>\n`;
      else if (it.t === 'circle') s += `<circle${pa} cx="${n3(it.c[0])}" cy="${n3(it.c[1])}" r="${n3(it.r)}"/>\n`;
      else if (it.t === 'text') s += `<text${pa} x="${n3(it.p[0])}" y="${n3(it.p[1])}" font-size="${n3(it.h * 1.35)}" font-family="Helvetica, Arial, sans-serif" fill="${st.color}" stroke="none"${it.align === 'c' ? ' text-anchor="middle"' : ''}${it.ang ? ` transform="rotate(${n3(it.ang * 180 / Math.PI)} ${n3(it.p[0])} ${n3(it.p[1])})"` : ''}>${esc(it.s)}</text>\n`;
    }
    s += '</g>\n';
  }
  return s + '</svg>\n';
}

/* ================= DXF (R12 / AC1009) ================= */
const TRMAP = { 'ç': 'c', 'Ç': 'C', 'ğ': 'g', 'Ğ': 'G', 'ı': 'i', 'İ': 'I', 'ö': 'o', 'Ö': 'O', 'ş': 's', 'Ş': 'S', 'ü': 'u', 'Ü': 'U', '×': 'x', '·': '-', '—': '-', '–': '-' };
export const ascii = (s) => String(s).replace(/[çÇğĞıİöÖşŞüÜ×·—–]/g, (c) => TRMAP[c]).normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^\x20-\x7e]/g, '?');
const DXF_LT = [['CONTINUOUS', 'Duz', []], ['DASHED', 'Kesik', [4, -2]], ['DASHDOT', 'Eksen', [8, -2, 0, -2]], ['DOT', 'Noktali', [0, -1.5]], ['HIDDEN', 'Kisa kesik', [2, -1.2]], ['PHANTOM', 'Cizgi-nokta', [5, -1.5, 1, -1.5]]];
function ltName(dash) {
  if (!dash.length) return 'CONTINUOUS';
  const k = dash.join(',');
  return { '4,2': 'DASHED', '8,2,2,2': 'DASHDOT', '0.6,1.4': 'DOT', '2,1.2': 'HIDDEN', '5,1.5,1,1.5': 'PHANTOM', '6,2,1,2': 'PHANTOM', '4,2,': 'DASHED' }[k] || 'DASHED';
}
export function toDXF(project, { pieces = null, sketch = true, tol = 0.02 } = {}) {
  const items = itemsFor(project, { pieces, sketch });
  const b = itemsBox(items) || { x0: 0, y0: 0, x1: 0, y1: 0 };
  const o = [];
  const w = (code, val) => o.push(String(code), String(val));
  const f = (v) => (Math.round(v * 1e4) / 1e4).toString();
  const Y = (y) => -y;      // y aşağı → DXF y yukarı
  w(0, 'SECTION'); w(2, 'HEADER');
  w(9, '$ACADVER'); w(1, 'AC1009');
  w(9, '$INSUNITS'); w(70, 4);
  w(9, '$MEASUREMENT'); w(70, 1);
  w(9, '$EXTMIN'); w(10, f(b.x0)); w(20, f(Y(b.y1))); w(30, 0);
  w(9, '$EXTMAX'); w(10, f(b.x1)); w(20, f(Y(b.y0))); w(30, 0);
  w(0, 'ENDSEC');
  w(0, 'SECTION'); w(2, 'TABLES');
  w(0, 'TABLE'); w(2, 'LTYPE'); w(70, DXF_LT.length);
  for (const [nm, desc, pat] of DXF_LT) { w(0, 'LTYPE'); w(2, nm); w(70, 0); w(3, desc); w(72, 65); w(73, pat.length); w(40, f(pat.reduce((a, v) => a + Math.abs(v), 0))); for (const v of pat) w(49, f(v)); }
  w(0, 'ENDTAB');
  const used = LAYERS.filter((L) => items.some((it) => it.layer === L.id));
  w(0, 'TABLE'); w(2, 'LAYER'); w(70, used.length + 1);
  w(0, 'LAYER'); w(2, '0'); w(70, 0); w(62, 7); w(6, 'CONTINUOUS');
  for (const L of used) { const st = layerStyle(project, L.id); w(0, 'LAYER'); w(2, L.dxf); w(70, 0); w(62, L.aci); w(6, ltName(st.dash)); }
  w(0, 'ENDTAB');
  w(0, 'ENDSEC');
  w(0, 'SECTION'); w(2, 'ENTITIES');
  const poly = (layer, pts, closed) => {
    if (pts.length < 2) return;
    if (pts.length === 2 && !closed) { w(0, 'LINE'); w(8, layer); w(10, f(pts[0][0])); w(20, f(Y(pts[0][1]))); w(30, 0); w(11, f(pts[1][0])); w(21, f(Y(pts[1][1]))); w(31, 0); return; }
    w(0, 'POLYLINE'); w(8, layer); w(66, 1); w(10, 0); w(20, 0); w(30, 0); w(70, closed ? 1 : 0);
    for (const p of pts) { w(0, 'VERTEX'); w(8, layer); w(10, f(p[0])); w(20, f(Y(p[1]))); w(30, 0); }
    w(0, 'SEQEND'); w(8, layer);
  };
  for (const it of items) {
    const layer = LAYER[it.layer].dxf;
    if (it.t === 'poly') poly(layer, it.pts, it.closed);
    else if (it.t === 'path') { const pts = C.flatten(it.path, tol); const cl = it.path.closed; if (cl && pts.length > 2 && C.dist(pts[0], pts.at(-1)) < 1e-9) pts.pop(); poly(layer, pts, cl); }
    else if (it.t === 'circle') { w(0, 'CIRCLE'); w(8, layer); w(10, f(it.c[0])); w(20, f(Y(it.c[1]))); w(30, 0); w(40, f(it.r)); }
    else if (it.t === 'text') {
      const deg = -(it.ang || 0) * 180 / Math.PI;
      w(0, 'TEXT'); w(8, layer); w(10, f(it.p[0])); w(20, f(Y(it.p[1]))); w(30, 0); w(40, f(it.h)); w(1, ascii(it.s));
      if (deg) w(50, f(deg));
      if (it.align === 'c') { w(72, 1); w(11, f(it.p[0])); w(21, f(Y(it.p[1]))); w(31, 0); }
    }
  }
  w(0, 'ENDSEC'); w(0, 'EOF');
  return o.join('\r\n') + '\r\n';
}

/* ================= PDF (1:1, otomatik sayfalama) ================= */
export const PAPERS = { A4: [210, 297], A3: [297, 420] };
const TITLE_H = 16, CAP_H = 9, PAD = 4;
// Yerleşim: her parça kendi kutusuyla (pay + ölçü + yazı dahil) raf yöntemiyle sayfalara dizilir.
// Sayfaya sığmayan parça, bindirmeli (overlap) döşeme sayfalarına bölünür; her döşemede hizalama işaretleri vardır.
export function pdfLayout(project, { paper = 'A4', w = null, h = null, landscape = false, margin = 10, pieces = null, overlap = 10, onePerPage = false } = {}) {
  let [W, H] = paper === 'ozel' ? [+w || 210, +h || 297] : PAPERS[paper] || PAPERS.A4;
  if (landscape) [W, H] = [H, W];
  if (W < 80 || H < 80) throw new Error('Sayfa en az 80 × 80 mm olmalı');
  const pw = W - 2 * margin, ph = H - 2 * margin - TITLE_H;
  const blocks = [];
  for (const pc of project.pieces) {
    if (pieces && !pieces.includes(pc.id)) continue;
    const items = pieceItems(pc, project).filter((it) => project.layers[it.layer]?.visible !== false);
    const box = itemsBox(items); if (!box) continue;
    blocks.push({ pc, items, box: { x0: box.x0 - PAD, y0: box.y0 - PAD, x1: box.x1 + PAD, y1: box.y1 + PAD + CAP_H }, w: box.x1 - box.x0 + 2 * PAD, h: box.y1 - box.y0 + 2 * PAD + CAP_H });
  }
  const pages = [];
  let cur = null, x = 0, y = 0, rowH = 0;
  const newPage = () => { cur = { kind: 'set', place: [] }; pages.push(cur); x = 0; y = 0; rowH = 0; };
  for (const bl of blocks) {
    if (bl.w > pw || bl.h > ph) {
      // döşeme
      const sx = pw - overlap, sy = ph - overlap;
      const cols = Math.max(1, Math.ceil((bl.w - overlap) / sx)), rows = Math.max(1, Math.ceil((bl.h - overlap) / sy));
      for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) pages.push({ kind: 'tile', bl, r, c, rows, cols, win: { x0: bl.box.x0 + c * sx, y0: bl.box.y0 + r * sy, x1: bl.box.x0 + c * sx + pw, y1: bl.box.y0 + r * sy + ph }, sx, sy, ov: overlap });
      cur = null; continue;
    }
    if (!cur || onePerPage) newPage();
    if (x + bl.w > pw + 1e-9) { x = 0; y += rowH + 4; rowH = 0; }
    if (y + bl.h > ph + 1e-9) { newPage(); }
    cur.place.push({ bl, x, y }); x += bl.w + 4; rowH = Math.max(rowH, bl.h);
  }
  return { W, H, margin, pw, ph, pages };
}
export function toPDF(project, opts = {}) {
  const L = pdfLayout(project, opts), { W, H, margin } = L;
  if (!L.pages.length) throw new Error('Yazdırılacak kapalı parça yok');
  const doc = pdfDoc(), N = L.pages.length;
  const date = new Date(opts.now || Date.now()).toLocaleDateString('tr-TR');
  L.pages.forEach((pgDef, i) => {
    const pg = doc.page(W, H);
    // dünya (mm, y aşağı) → kâğıt (mm, y yukarı)
    const map = (ox, oy) => (p) => [margin + (p[0] - ox), H - margin - (p[1] - oy)];
    const draw = (items, f) => {
      for (const it of items) {
        const st = layerStyle(project, it.layer), [r, g, b] = hexRGB(st.color);
        pg.color(r, g, b); pg.lineWidth(st.width); pg.dash(st.dash);
        if (it.t === 'path') pg.path(it.path, f);
        else if (it.t === 'poly') pg.path({ closed: it.closed, segs: it.pts.slice(1).map((q, k) => C.line(it.pts[k], q)).concat(it.closed ? [C.line(it.pts.at(-1), it.pts[0])] : []) }, f);
        else if (it.t === 'circle') { const q = f(it.c); pg.dash([]); pg.circle(q[0], q[1], it.r); }
        else if (it.t === 'text') { pg.dash([]); const q = f(it.p); pg.text(q[0], q[1], it.h * 72 / 25.4 * 1.35, it.s, -(it.ang || 0), it.align === 'c'); }
      }
      pg.dash([]); pg.color(0, 0, 0);
    };
    const caption = (pc, x, y) => {
      const m = measure(pc);
      pg.color(0, 0, 0);
      pg.text(x, y, 8, `#${pc.no} ${pc.name}${pc.code ? ' (' + pc.code + ')' : ''} · ${SIDES[pc.side]} × ${pc.qty}`);
      if (m) pg.text(x, y - 3.6, 7, `Net ${fmt(m.width)} × ${fmt(m.height)} mm · net çevre ${fmt(m.netPerimeter)} mm · kesim alanı ${fmt(m.cutArea / 100, 1)} cm²`);
    };
    if (pgDef.kind === 'set') {
      for (const pl of pgDef.place) {
        const { bl } = pl, f = map(bl.box.x0 - pl.x, bl.box.y0 - pl.y);
        draw(bl.items, f);
        caption(bl.pc, margin + pl.x + PAD, H - margin - (pl.y + bl.h) + CAP_H - 3.2);
      }
    } else {
      const { bl, win, r, c, rows, cols, sx, sy } = pgDef, f = map(win.x0, win.y0);
      pg.save(); pg.clipRect(margin, margin + TITLE_H, W - 2 * margin, H - 2 * margin - TITLE_H);
      draw(bl.items, f);
      // hizalama: döşeme sınırları (kesik) ve kesişimlerde artı işaretleri (komşu sayfada da görünür)
      pg.color(0.4, 0.4, 0.4); pg.lineWidth(0.15); pg.dash([3, 2]);
      for (let k = 1; k < cols; k++) { const X = bl.box.x0 + k * sx; if (X >= win.x0 && X <= win.x1) pg.line(...f([X, win.y0]), ...f([X, win.y1])); }
      for (let k = 1; k < rows; k++) { const Yw = bl.box.y0 + k * sy; if (Yw >= win.y0 && Yw <= win.y1) pg.line(...f([win.x0, Yw]), ...f([win.x1, Yw])); }
      pg.dash([]); pg.lineWidth(0.25); pg.color(0, 0, 0);
      for (let a = 0; a <= cols; a++) for (let bb = 0; bb <= rows; bb++) {
        for (const X of [bl.box.x0 + a * sx, bl.box.x0 + a * sx + pgDef.ov]) for (const Yw of [bl.box.y0 + bb * sy, bl.box.y0 + bb * sy + pgDef.ov]) {
          if (X < win.x0 - 1e-6 || X > win.x1 + 1e-6 || Yw < win.y0 - 1e-6 || Yw > win.y1 + 1e-6) continue;
          const q = f([X, Yw]); pg.line(q[0] - 4, q[1], q[0] + 4, q[1]); pg.line(q[0], q[1] - 4, q[0], q[1] + 4); pg.circle(q[0], q[1], 1.6);
        }
      }
      pg.restore();
      pg.text(margin, H - margin + 2.5, 8, `Parça #${bl.pc.no} ${bl.pc.name} · döşeme ${r * cols + c + 1}/${rows * cols} (satır ${r + 1}, sütun ${c + 1}) · artı işaretlerini üst üste getirip yapıştırın`);
      if (r === rows - 1 && c === 0) caption(bl.pc, margin + 2, margin + TITLE_H + 6);
    }
    // başlık bloğu + ölçek kontrolü
    pg.lineWidth(0.25); pg.dash([]); pg.color(0, 0, 0);
    pg.rect(margin, margin, W - 2 * margin, TITLE_H - 2);
    pg.text(margin + 2, margin + TITLE_H - 7, 9, `${project.name}${project.code ? ' · ' + project.code : ''} · numara ${project.size} ${project.sizeSystem || ''}`.trim());
    pg.text(margin + 2, margin + 3.5, 7, `ÖLÇEK 1:1 · birim mm · sayfa ${i + 1}/${N} · ${date} · Çizim Atölyesi · Ayakkabı Modelhanesi`);
    // 50 mm kontrol çizgisi (cetvelle doğrulayın; yazıcıda "gerçek boyut / %100" seçili olmalı)
    const bx = W - margin - 56, by = margin + 5;
    pg.lineWidth(0.3); pg.line(bx, by, bx + 50, by);
    for (let k = 0; k <= 50; k += 10) pg.line(bx + k, by, bx + k, by + (k % 50 ? 1.5 : 3));
    pg.text(bx, by + 4.6, 6.5, 'Kontrol: 50 mm');
    pg.rect(bx + 38, by + 2.6, 10, 5);   // 10 × 5 mm kutu
  });
  return { bytes: doc.build(), pages: N, layout: L };
}
export { textWidth };
