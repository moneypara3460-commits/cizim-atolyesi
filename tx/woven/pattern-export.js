// Kalıp çizimi ve çıktıları: tuval (editör / PNG), SVG (1 birim = 1 mm), 1:1 A4 döşemeli PDF.
import * as C from '../curve.js?v=20261112e';
import * as P from './pattern.js?v=20261112e';
import { pdfDoc, textWidth } from '../pdf.js?v=20261112e';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const n3 = (v) => +v.toFixed(3);
const LINE_DASH = { katlama: [8, 2, 1, 2], 'orta çizgi': [8, 2, 1, 2], 'yerleşim': [3, 2], 'birleşim': [1, 1.5], 'dikiş': [2.5, 1.5] };
export const pieceLabel = (pc) => [pc.name, pc.size ? 'Beden ' + pc.size : '', `Kes: ${pc.qty}${pc.pair ? ' (çift: biri ters)' : ''}${pc.fold != null ? ' · katlı' : ''}`, P.FABRICS[pc.fabric] || pc.fabric].filter(Boolean);

// Parçanın çizilecek öğeleri (dünya koordinatı)
export function pieceDraw(pc) {
  const items = [];
  let cut = null;
  try { cut = P.cutPolygon(pc).pts; } catch (e) { cut = null; }
  if (cut && cut.length > 2) items.push({ k: 'poly', pts: cut, w: 0.5, dash: null, role: 'cut' });
  pc.edges.forEach((e, i) => items.push({ k: 'path', path: P.edgePath(e), w: 0.25, dash: pc.fold === i ? [8, 2, 1, 2] : [2, 1.5], role: 'seam', edge: i }));
  for (const nt of pc.notches) for (const [a, b] of P.notchGeom(pc, nt)) items.push({ k: 'line', a, b, w: 0.35 });
  for (const d of pc.darts) { items.push({ k: 'line', a: d.a, b: d.apex, w: 0.3 }, { k: 'line', a: d.b, b: d.apex, w: 0.3 }, { k: 'circle', c: d.apex, r: 1.2, w: 0.25 }); }
  for (const l of pc.lines) items.push({ k: 'path', path: l.path, w: 0.25, dash: LINE_DASH[l.kind] || [3, 2] });
  for (const m of pc.marks) {
    if (m.kind === 'düğme') items.push({ k: 'circle', c: m.p, r: 5, w: 0.25 }, { k: 'line', a: [m.p[0] - 2, m.p[1]], b: [m.p[0] + 2, m.p[1]], w: 0.25 }, { k: 'line', a: [m.p[0], m.p[1] - 2], b: [m.p[0], m.p[1] + 2], w: 0.25 });
    else if (m.kind === 'iliK') items.push({ k: 'line', a: [m.p[0] - 7, m.p[1]], b: [m.p[0] + 7, m.p[1]], w: 0.5 }, { k: 'line', a: [m.p[0] - 7, m.p[1] - 1.5], b: [m.p[0] - 7, m.p[1] + 1.5], w: 0.3 }, { k: 'line', a: [m.p[0] + 7, m.p[1] - 1.5], b: [m.p[0] + 7, m.p[1] + 1.5], w: 0.3 });
    else items.push({ k: 'circle', c: m.p, r: 1.5, w: 0.3 }, { k: 'line', a: [m.p[0] - 3, m.p[1] - 3], b: [m.p[0] + 3, m.p[1] + 3], w: 0.2 }, { k: 'line', a: [m.p[0] - 3, m.p[1] + 3], b: [m.p[0] + 3, m.p[1] - 3], w: 0.2 });
  }
  if (pc.grain) {
    const [a, b] = pc.grain, u = C.mul(C.sub(b, a), 1 / (C.dist(a, b) || 1)), n = [-u[1], u[0]];
    items.push({ k: 'line', a, b, w: 0.35 });
    for (const [p, s] of [[a, 1], [b, -1]]) { const q = C.add(p, C.mul(u, 6 * s)); items.push({ k: 'line', a: p, b: C.add(q, C.mul(n, 2.5)), w: 0.35 }, { k: 'line', a: p, b: C.sub(q, C.mul(n, 2.5)), w: 0.35 }); }
  }
  // etiket: parçanın içinde, düz boy çizgisinin yanında
  const c = pc.grain ? C.add(C.mul(C.add(pc.grain[0], pc.grain[1]), 0.5), [8, 0]) : P.centroid(pc);
  // küçük parçada etiket tek satır (üst üste binmesin)
  let small = false; try { const bb = P.bboxPts(P.seamPolygon(pc, 0.5)); small = bb.y1 - bb.y0 < 70; } catch (e) { /* */ }
  const lab = pieceLabel(pc);
  items.push({ k: 'label', p: small ? [P.centroid(pc)[0] - 30, P.centroid(pc)[1] + 2] : c, lines: small ? [lab.slice(0, 3).join(' · ')] : lab, ang: 0, size: small ? 4 : 6 });
  if (pc.fold != null && pc.edges[pc.fold]) { const e = pc.edges[pc.fold], m = C.mul(C.add(e.segs[0].a, e.segs.at(-1).b), 0.5); items.push({ k: 'text', p: m, text: 'KUMAŞ KATI', size: 4, ang: Math.atan2(e.segs.at(-1).b[1] - e.segs[0].a[1], e.segs.at(-1).b[0] - e.segs[0].a[0]) }); }
  return items;
}
export function piecesBBox(pieces) {
  let b = null;
  for (const pc of pieces) { let q; try { q = P.bboxPts(P.cutPolygon(pc).pts); } catch (e) { continue; } b = b ? { x0: Math.min(b.x0, q.x0), y0: Math.min(b.y0, q.y0), x1: Math.max(b.x1, q.x1), y1: Math.max(b.y1, q.y1) } : q; }
  return b;
}

/* ---------- tuval ---------- */
export function drawPiecesCanvas(ctx, pieces, { k, ox, oy, sel = null, selEdge = null, issues = new Set(), colors = {} }) {
  const col = { ink: '#0f172a', cut: '#0f172a', seam: '#475569', sel: '#0284c7', bad: '#dc2626', fill: 'rgba(14,165,233,0.06)', ...colors };
  const T = (p) => [(p[0] - ox) * k, (p[1] - oy) * k];
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  for (const pc of pieces) {
    const on = sel === pc.id, bad = issues.has(pc.id);
    for (const it of pieceDraw(pc)) {
      const hot = on && selEdge === it.edge && it.role === 'seam';
      ctx.strokeStyle = hot ? col.sel : it.role === 'cut' ? (bad ? col.bad : on ? col.sel : col.cut) : it.role === 'seam' ? col.seam : col.ink;
      ctx.lineWidth = Math.max(hot ? 3 : 1, it.w * k * (hot ? 3 : 1));
      ctx.setLineDash(it.dash ? it.dash.map((v) => Math.max(2, v * k)) : []);
      if (it.k === 'poly') { ctx.beginPath(); it.pts.forEach((p, i) => (i ? ctx.lineTo(...T(p)) : ctx.moveTo(...T(p)))); ctx.closePath(); if (on) { ctx.fillStyle = col.fill; ctx.fill(); } ctx.stroke(); }
      if (it.k === 'path') { ctx.beginPath(); ctx.moveTo(...T(it.path.segs[0].a)); for (const s of it.path.segs) s.t === 'L' ? ctx.lineTo(...T(s.b)) : ctx.bezierCurveTo(...T(s.c1), ...T(s.c2), ...T(s.b)); ctx.stroke(); }
      if (it.k === 'line') { ctx.beginPath(); ctx.moveTo(...T(it.a)); ctx.lineTo(...T(it.b)); ctx.stroke(); }
      if (it.k === 'circle') { ctx.beginPath(); ctx.arc(...T(it.c), Math.max(2, it.r * k), 0, 7); ctx.stroke(); }
      if (it.k === 'label' || it.k === 'text') {
        ctx.setLineDash([]); ctx.fillStyle = on ? col.sel : col.ink;
        const fs = Math.max(9, Math.min(15, (it.size || 6) * k)); ctx.font = `${fs}px Helvetica, Arial, sans-serif`;
        ctx.save(); ctx.translate(...T(it.p)); ctx.rotate(it.ang || 0);
        if (it.k === 'text') { ctx.textAlign = 'center'; ctx.fillText(it.text, 0, -3); }
        else { ctx.textAlign = 'left'; it.lines.forEach((t, i) => ctx.fillText(t, 0, (i - it.lines.length / 2 + 1) * fs * 1.2)); }
        ctx.restore();
      }
    }
  }
  ctx.setLineDash([]);
}

/* ---------- SVG ---------- */
export function toSVG(pieces, { margin = 15, title = '' } = {}) {
  const b = piecesBBox(pieces) || { x0: 0, y0: 0, x1: 100, y1: 100 };
  const x0 = b.x0 - margin, y0 = b.y0 - margin - 10, w = b.x1 - b.x0 + 2 * margin, h = b.y1 - b.y0 + 2 * margin + 10;
  let s = `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="${n3(w)}mm" height="${n3(h)}mm" viewBox="${n3(x0)} ${n3(y0)} ${n3(w)} ${n3(h)}">\n<title>${esc(title)}</title>\n<g fill="none" stroke="#000" stroke-linecap="round" stroke-linejoin="round">\n`;
  for (const pc of pieces) {
    s += `<g id="${esc(pc.id)}">\n`;
    for (const it of pieceDraw(pc)) {
      const da = it.dash ? ` stroke-dasharray="${it.dash.join(' ')}"` : '';
      if (it.k === 'poly') s += `<path d="M${it.pts.map((p) => n3(p[0]) + ' ' + n3(p[1])).join(' L')} Z" stroke-width="${it.w}"/>\n`;
      if (it.k === 'path') s += `<path d="${C.toSVGd(it.path)}" stroke-width="${it.w}"${da}/>\n`;
      if (it.k === 'line') s += `<line x1="${n3(it.a[0])}" y1="${n3(it.a[1])}" x2="${n3(it.b[0])}" y2="${n3(it.b[1])}" stroke-width="${it.w}"/>\n`;
      if (it.k === 'circle') s += `<circle cx="${n3(it.c[0])}" cy="${n3(it.c[1])}" r="${it.r}" stroke-width="${it.w}"/>\n`;
      if (it.k === 'label') s += `<text transform="translate(${n3(it.p[0])} ${n3(it.p[1])}) rotate(${n3((it.ang || 0) * 180 / Math.PI)})" font-size="6" font-family="Helvetica, Arial, sans-serif" fill="#000" stroke="none">${it.lines.map((t, i) => `<tspan x="0" dy="${i ? 7.2 : -(it.lines.length / 2 - 1) * 7.2}">${esc(t)}</tspan>`).join('')}</text>\n`;
      if (it.k === 'text') s += `<text transform="translate(${n3(it.p[0])} ${n3(it.p[1])}) rotate(${n3(it.ang * 180 / Math.PI)})" font-size="4" font-family="Helvetica, Arial, sans-serif" fill="#000" stroke="none" text-anchor="middle" dy="-2">${esc(it.text)}</text>\n`;
    }
    s += '</g>\n';
  }
  return s + '</g>\n</svg>\n';
}

/* ---------- 1:1 A4 döşemeli PDF ---------- */
// Sayfa 1: kapak (açıklama, 10 cm kontrol karesi, sayfa yerleşim haritası, parça listesi). Sonra boş olmayan döşeme sayfaları.
export function toTiledPDF(pieces, { paper = [210, 297], margin = 10, title = 'Kalıp', meta = {} } = {}) {
  const [pw, ph] = paper, M = margin, tw = pw - 2 * M, th = ph - 2 * M - 8;   // alt 8 mm: sayfa etiketi
  const b = piecesBBox(pieces); if (!b) throw new Error('Kalıp parçası yok');
  const pad = 5, x0 = b.x0 - pad, y0 = b.y0 - pad, W = b.x1 - b.x0 + 2 * pad, H = b.y1 - b.y0 + 2 * pad;
  const cols = Math.ceil(W / tw), rows = Math.ceil(H / th);
  const cutBoxes = pieces.map((pc) => { try { return P.bboxPts(P.cutPolygon(pc).pts); } catch (e) { return null; } }).filter(Boolean);
  const used = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const tx0 = x0 + c * tw, ty0 = y0 + r * th;
    if (cutBoxes.some((q) => q.x1 >= tx0 && q.x0 <= tx0 + tw && q.y1 >= ty0 && q.y0 <= ty0 + th)) used.push([r, c]);
  }
  const doc = pdfDoc(), total = used.length + 1;
  // kapak
  const cv = doc.page(pw, ph);
  cv.text(M, ph - M - 6, 14, title);
  cv.text(M, ph - M - 13, 8, [meta.project, meta.product, meta.size ? 'Beden ' + meta.size : ''].filter(Boolean).join(' · ') || ' ');
  const lines = ['Gerçek boyut (1:1). Yazdırırken "%100 / gerçek boyut" seçin; "sayfaya sığdır" kapalı olmalı.', 'Önce aşağıdaki 10 × 10 cm kareyi cetvelle ölçün; tutmuyorsa yazıcı ölçeği yanlıştır.', `Sayfaları haritadaki gibi dizin (satır-sütun), çerçeve çizgilerinden kesip bantlayın. ${used.length} döşeme sayfası.`, 'Kalın çizgi: kesim hattı. Kesik çizgi: dikiş hattı. Çizgi-nokta: kumaş katı / katlama. Oklu çizgi: düz boy (kumaş yönü).'];
  lines.forEach((t, i) => cv.text(M, ph - M - 22 - i * 5, 7, t));
  cv.lineWidth(0.4); cv.rect(M, ph - M - 52 - 100, 100, 100); cv.text(M + 2, ph - M - 52 - 100 + 2, 7, '10 × 10 cm kontrol karesi');
  // harita
  const mx = M + 110, my = ph - M - 52, mw = pw - mx - M, mh = 100, ks = Math.min(mw / W, mh / H);
  const f = (p) => [mx + (p[0] - x0) * ks, my - (p[1] - y0) * ks];
  cv.lineWidth(0.15);
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) { const u = used.some(([a, d]) => a === r && d === c); const q = f([x0 + c * tw, y0 + r * th]); cv.color(u ? 0 : 0.75, u ? 0 : 0.75, u ? 0 : 0.75); cv.rect(q[0], q[1] - th * ks, tw * ks, th * ks); if (u) cv.text(q[0] + 1, q[1] - 4, 5, `${r + 1}-${c + 1}`); }
  cv.color(0, 0, 0); cv.lineWidth(0.25);
  for (const pc of pieces) { try { const pts = P.cutPolygon(pc).pts; cv.path(C.polyPath(pts, true), f); } catch (e) { /* */ } }
  let ly = ph - M - 165;
  cv.text(M, ly, 9, 'Parça listesi'); ly -= 6;
  for (const pc of pieces) { if (ly < M + 10) break; const m = P.measure(pc); cv.text(M, ly, 7, `${pieceLabel(pc).join(' · ')} — kesim alanı ${(m.cutArea / 1e4).toFixed(1)} dm²`); ly -= 4.6; }
  cv.text(M, M + 2, 6, `Sayfa 1 / ${total} · ${meta.date || ''}`);
  // döşemeler
  used.forEach(([r, c], i) => {
    const pg = doc.page(pw, ph), tx0 = x0 + c * tw, ty0 = y0 + r * th;
    const g = (p) => [M + (p[0] - tx0), ph - M - (p[1] - ty0)];   // 1 mm = 1 mm (ölçek 1:1)
    pg.save(); pg.clipRect(M, ph - M - th, tw, th);
    for (const pc of pieces) for (const it of pieceDraw(pc)) {
      if (it.w) { pg.lineWidth(it.w); pg.dash(it.dash); }
      if (it.k === 'poly') pg.path(C.polyPath(it.pts, true), g);
      if (it.k === 'path') pg.path(it.path, g);
      if (it.k === 'line') pg.line(...g(it.a), ...g(it.b));
      if (it.k === 'circle') pg.path(C.circlePath(it.c, it.r), g);
      if (it.k === 'label') { pg.dash(null); const q = g(it.p); it.lines.forEach((t, j) => pg.text(q[0] + Math.cos(-(it.ang || 0) - Math.PI / 2) * j * 5, q[1] + Math.sin(-(it.ang || 0) - Math.PI / 2) * j * 5, 10, t, -(it.ang || 0))); }
      if (it.k === 'text') { pg.dash(null); const q = g(it.p); pg.text(q[0], q[1] + 1.5, 9, it.text, -it.ang, true); }
    }
    pg.restore();
    // çerçeve, köşe işaretleri, komşu sayfa okları
    pg.dash(null); pg.lineWidth(0.2); pg.rect(M, ph - M - th, tw, th);
    for (const [x, y] of [[M, ph - M], [M + tw, ph - M], [M, ph - M - th], [M + tw, ph - M - th]]) { pg.line(x - 4, y, x + 4, y); pg.line(x, y - 4, x, y + 4); }
    pg.text(M, M + 2, 8, `Sayfa ${i + 2} / ${total} · Satır ${r + 1}, Sütun ${c + 1} · 1:1 · ${title}`);
    pg.text(M + tw / 2 - 6, ph - M + 2, 7, `↑ ${r > 0 ? r + '-' + (c + 1) : '—'}`.replace('↑', '^'));
    pg.text(M + tw - 22, M + 2, 7, `> ${c + 1 < cols ? (r + 1) + '-' + (c + 2) : '—'}`);
  });
  return { bytes: doc.build(), pages: total, tiles: used.length, grid: [rows, cols], tile: [tw, th] };
}
void textWidth;
