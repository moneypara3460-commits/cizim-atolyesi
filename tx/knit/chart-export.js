// Örgü şeması çizimi: tuval (editör / PNG) ve A4 PDF (semboller, renkler, sıra / ilmek numaraları, açıklama).
import * as K from './chart.js?v=20261112i';
import { pdfDoc } from '../pdf.js?v=20261112i';

const hex = (h) => { const m = /^#?([0-9a-f]{6})$/i.exec(h || ''); const v = m ? parseInt(m[1], 16) : 0xcccccc; return [(v >> 16 & 255) / 255, (v >> 8 & 255) / 255, (v & 255) / 255]; };
const dark = (h) => { const [r, g, b] = hex(h); return 0.3 * r + 0.59 * g + 0.11 * b < 0.5; };

// hücre (x, y) → ekranda sol üst: (ox + x·c, oy + (h − 1 − y)·c)  (1. sıra en altta)
export function drawChartCanvas(ctx, ch, { c, ox = 0, oy = 0, hl = null, rep = true, sel = null }) {
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (let y = 0; y < ch.h; y++) for (let x = 0; x < ch.w; x++) {
    const sx = ox + x * c, sy = oy + (ch.h - 1 - y) * c, code = K.get(ch, x, y), col = ch.palette[K.getC(ch, x, y)]?.hex || '#ccc';
    ctx.fillStyle = code === 'x' ? '#94a3b8' : col; ctx.fillRect(sx, sy, c, c);
    const S = K.STITCHES[code];
    if (!S?.cable && S?.sym && c >= 7) { ctx.fillStyle = dark(col) ? '#fff' : '#111'; ctx.font = `${Math.round(c * 0.75)}px Helvetica, Arial, sans-serif`; ctx.fillText(S.sym, sx + c / 2, sy + c / 2 + 1); }
  }
  // saç örgüleri ikinci geçişte (zemin boyaması üstüne binmesin)
  for (let y = 0; y < ch.h; y++) for (let x = 0; x < ch.w; x++) {
    const S = K.STITCHES[K.get(ch, x, y)]; if (!S?.cable) continue;
    const sx = ox + x * c, sy = oy + (ch.h - 1 - y) * c, w = S.cable * c, col = ch.palette[K.getC(ch, x, y)]?.hex || '#ccc';
    ctx.fillStyle = 'rgba(255,255,255,.35)'; ctx.fillRect(sx, sy, w, c);
    ctx.strokeStyle = dark(col) ? '#fff' : '#111'; ctx.lineWidth = Math.max(1.2, c / 7);
    // önde kalan kol kesintisiz, arkada kalan ortada kesik
    const front = S.dir === 'L' ? [[sx, sy + c], [sx + w, sy]] : [[sx, sy], [sx + w, sy + c]], back = S.dir === 'L' ? [[sx, sy], [sx + w, sy + c]] : [[sx, sy + c], [sx + w, sy]];
    const curve = ([a, b], gap) => { const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2; ctx.beginPath(); if (!gap) { ctx.moveTo(...a); ctx.bezierCurveTo(a[0] + w * 0.45, a[1], b[0] - w * 0.45, b[1], ...b); } else { ctx.moveTo(...a); ctx.quadraticCurveTo(a[0] + w * 0.3, a[1], mx - c * 0.35, my + (b[1] - a[1]) * -0.12); ctx.moveTo(mx + c * 0.35, my - (b[1] - a[1]) * -0.12); ctx.quadraticCurveTo(b[0] - w * 0.3, b[1], ...b); } ctx.stroke(); };
    curve(back, true); curve(front, false);
  }
  // ızgara
  ctx.strokeStyle = 'rgba(15,23,42,.35)'; ctx.lineWidth = 1; ctx.beginPath();
  if (c >= 4) { for (let x = 0; x <= ch.w; x++) { ctx.moveTo(ox + x * c, oy); ctx.lineTo(ox + x * c, oy + ch.h * c); } for (let y = 0; y <= ch.h; y++) { ctx.moveTo(ox, oy + y * c); ctx.lineTo(ox + ch.w * c, oy + y * c); } }
  ctx.stroke();
  // 10'luk kalın çizgiler (sayma kolaylığı)
  ctx.strokeStyle = 'rgba(15,23,42,.8)'; ctx.beginPath();
  for (let x = 0; x <= ch.w; x += 10) { const X = ox + (ch.w - x) * c; ctx.moveTo(X, oy); ctx.lineTo(X, oy + ch.h * c); }
  for (let y = 0; y <= ch.h; y += 10) { const Y = oy + (ch.h - y) * c; ctx.moveTo(ox, Y); ctx.lineTo(ox + ch.w * c, Y); }
  ctx.stroke();
  if (rep && ch.repeat) { const r = ch.repeat; ctx.strokeStyle = '#dc2626'; ctx.lineWidth = 2.5; ctx.strokeRect(ox + r.x * c, oy + (ch.h - r.y - r.h) * c, r.w * c, r.h * c); }
  if (hl != null) { ctx.strokeStyle = '#0284c7'; ctx.lineWidth = 2.5; ctx.strokeRect(ox, oy + (ch.h - 1 - hl) * c, ch.w * c, c); }
  if (sel) { ctx.strokeStyle = '#16a34a'; ctx.lineWidth = 2.5; ctx.setLineDash([5, 3]); ctx.strokeRect(ox + sel.x * c, oy + (ch.h - sel.y - sel.h) * c, sel.w * c, sel.h * c); ctx.setLineDash([]); }
  // numaralar: sıra sağda (1 altta), ilmek altta (1 sağda)
  if (c >= 6) {
    ctx.fillStyle = '#334155'; ctx.font = `${Math.min(12, c * 0.7)}px Helvetica, Arial, sans-serif`;
    for (let y = 0; y < ch.h; y++) if ((y + 1) % (c >= 12 ? 1 : 5) === 0 || y === 0) ctx.fillText(String(y + 1), ox + ch.w * c + c * 0.9, oy + (ch.h - 1 - y) * c + c / 2);
    for (let x = 0; x < ch.w; x++) { const n = ch.w - x; if (n % (c >= 12 ? 1 : 5) === 0 || n === 1) ctx.fillText(String(n), ox + x * c + c / 2, oy + ch.h * c + c * 0.7); }
  }
}

// A4 PDF: şema sığdığı kadar büyük hücreyle; sığmazsa birden çok sayfaya bölünür (sayfa başına satır / sütun aralığı yazılır)
export function chartPDF(ch, { title = '', meta = {} } = {}) {
  const doc = pdfDoc(), pw = 210, ph = 297, M = 12, legendH = 52, headH = 18;
  const availW = pw - 2 * M - 8, availH = ph - 2 * M - headH - legendH;
  const cell = Math.max(2.5, Math.min(6, availW / ch.w, availH / ch.h));
  const cols = Math.max(1, Math.floor(availW / cell)), rows = Math.max(1, Math.floor(availH / cell));
  const pages = [];
  for (let y0 = 0; y0 < ch.h; y0 += rows) for (let x0 = 0; x0 < ch.w; x0 += cols) pages.push([x0, y0]);
  pages.forEach(([x0, y0], pi) => {
    const pg = doc.page(pw, ph), w = Math.min(cols, ch.w - x0), h = Math.min(rows, ch.h - y0);
    pg.text(M, ph - M - 5, 12, title || ch.name);
    pg.text(M, ph - M - 11, 7, `${ch.w} ilmek × ${ch.h} sıra · bu sayfa: ilmek ${x0 + 1}–${x0 + w}, sıra ${y0 + 1}–${y0 + h} · sayfa ${pi + 1}/${pages.length}${meta.swatch ? ' · ' + meta.swatch : ''}`);
    const bx = M, by = M + legendH;   // şemanın sol alt köşesi (PDF y yukarı)
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const cx = x0 + x, cy = y0 + y, code = K.get(ch, cx, cy), col = ch.palette[K.getC(ch, cx, cy)]?.hex;
      const X = bx + x * cell, Y = by + y * cell;
      const [r, g, b] = code === 'x' ? [0.58, 0.64, 0.72] : hex(col);
      pg.fillRect(X, Y, cell, cell, r, g, b);
      const S = K.STITCHES[code];
      const ink = dark(col) ? 1 : 0;
      if (S?.cable) { pg.color(ink, ink, ink); pg.lineWidth(0.3); const W = Math.min(S.cable, w - x) * cell; pg.line(X, Y, X + W, Y + cell); pg.line(X, Y + cell, X + W, Y); if (S.dir === 'L') pg.circle(X + W / 2, Y + cell / 2, cell / 6, true); pg.color(0, 0, 0); }
      else if (S?.sym) { pg.color(ink, ink, ink); pg.text(X + cell / 2, Y + cell * 0.25, cell * 2.2, S.sym === '•' ? '·' : S.sym, 0, true); pg.color(0, 0, 0); }
    }
    pg.lineWidth(0.1); for (let x = 0; x <= w; x++) pg.line(bx + x * cell, by, bx + x * cell, by + h * cell); for (let y = 0; y <= h; y++) pg.line(bx, by + y * cell, bx + w * cell, by + y * cell);
    pg.lineWidth(0.35);
    for (let x = 0; x <= w; x++) if ((ch.w - (x0 + x)) % 10 === 0) pg.line(bx + x * cell, by, bx + x * cell, by + h * cell);
    for (let y = 0; y <= h; y++) if ((y0 + y) % 10 === 0) pg.line(bx, by + y * cell, bx + w * cell, by + y * cell);
    if (ch.repeat) { const r = ch.repeat, rx0 = Math.max(r.x, x0), rx1 = Math.min(r.x + r.w, x0 + w), ry0 = Math.max(r.y, y0), ry1 = Math.min(r.y + r.h, y0 + h); if (rx1 > rx0 && ry1 > ry0) { pg.color(0.86, 0.15, 0.15); pg.lineWidth(0.5); pg.rect(bx + (rx0 - x0) * cell, by + (ry0 - y0) * cell, (rx1 - rx0) * cell, (ry1 - ry0) * cell); pg.color(0, 0, 0); } }
    const fs = Math.min(6, cell * 2);
    for (let y = 0; y < h; y++) if ((y0 + y + 1) % 5 === 0 || y0 + y === 0) pg.text(bx + w * cell + 1.2, by + y * cell + cell * 0.2, fs, String(y0 + y + 1));
    for (let x = 0; x < w; x++) { const n = ch.w - (x0 + x); if (n % 5 === 0 || n === 1) pg.text(bx + x * cell + cell / 2, by - 3.5, fs, String(n), 0, true); }
    // açıklama
    const used = [...new Set(ch.st)].filter((c) => c !== 'c+');
    let ly = M + legendH - 10, lx = M;
    pg.text(M, M + legendH - 4, 8, 'Semboller (şema ön yüzden; 1. sıra altta, 1. ilmek sağda)');
    for (const c of used) { const S = K.STITCHES[c]; pg.rect(lx, ly - 1, 4, 4); if (S?.sym) pg.text(lx + 2, ly, 7, S.sym === '•' ? '·' : S.sym, 0, true); if (S?.cable) { pg.line(lx, ly - 1, lx + 4, ly + 3); pg.line(lx, ly + 3, lx + 4, ly - 1); } pg.text(lx + 6, ly, 7, S?.label || c); ly -= 5.5; if (ly < M + 4) { ly = M + legendH - 10; lx += 62; } }
    if (ch.palette.length > 1) ch.palette.forEach((p, i) => { const [r, g, b] = hex(p.hex); pg.fillRect(pw - M - 50, M + legendH - 10 - i * 5.5 - 1, 4, 4, r, g, b); pg.rect(pw - M - 50, M + legendH - 10 - i * 5.5 - 1, 4, 4); pg.text(pw - M - 44, M + legendH - 10 - i * 5.5, 7, p.name); });
    if (ch.repeat) pg.text(M, M + 2, 6.5, `Kırmızı çerçeve: desen tekrarı (${ch.repeat.w} ilmek × ${ch.repeat.h} sıra)`);
  });
  return { bytes: doc.build(), pages: pages.length, cell };
}
