// Teknik çizim çıktıları: SVG (mm, 1:1), vektör PDF (seçilebilir ölçek, A4/A3), tuval (PNG için).
// Saf modül: tuval çizimi için bir CanvasRenderingContext2D verilir; başka DOM kullanılmaz.
import * as C from './curve.js?v=20261112d';
import * as D from './drawing.js?v=20261112d';
import { pdfDoc, textWidth } from './pdf.js?v=20261112d';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const SCALES = [1, 2, 2.5, 5, 10, 20];
const n3 = (v) => +v.toFixed(3);

// görünüşün çizilecek öğeleri (görünür katmanlar), sıralı
export function drawList(sk, view) {
  const out = [];
  for (const L of sk.views[view].layers) {
    if (!L.visible) continue;
    for (const e of L.ents) {
      for (const s of D.entityPaths(e)) out.push({ k: 'path', id: e.id, path: s.path, stroke: s.stroke, w: s.w ?? e.w ?? 0.35, fill: e.fill || null });
      if (e.t === 'point') out.push({ k: 'point', id: e.id, p: e.p });
      if (e.t === 'dim') out.push({ k: 'dim', id: e.id, g: D.dimGeom(e), e, text: D.dimText(e) });
      if (e.t === 'text') out.push({ k: 'text', id: e.id, p: e.p, text: e.text, size: e.size || 5, leader: e.leader });
    }
  }
  return out;
}
const ARROW = 2.5;
function dimParts(it) {
  const { A, B, n } = it.g, e = it.e, u = C.mul(C.sub(B, A), 1 / it.g.L);
  const ext = (p, q) => [C.add(p, C.mul(n, Math.sign(e.off || 0) * 1)), C.add(q, C.mul(n, Math.sign(e.off || 0) * 2))];
  const parts = [[A, B]];
  if (e.off) parts.push(ext(e.a, A), ext(e.b, B));
  const ar = (p, s) => { const b = C.add(p, C.mul(u, s * ARROW)); return [[p, C.add(b, C.mul(n, ARROW * 0.35))], [p, C.sub(b, C.mul(n, ARROW * 0.35))]]; };
  parts.push(...ar(A, 1), ...ar(B, -1));
  let ang = it.g.ang; if (ang > Math.PI / 2 || ang < -Math.PI / 2) ang += Math.PI;
  return { lines: parts, tp: C.add(it.g.mid, C.mul(n, -1.5)), ang };
}

/* ---------- SVG ---------- */
// 1 kullanıcı birimi = 1 mm; width / height mm cinsinden: yazdırıldığında 1:1 ölçek.
export function toSVG(sk, view, { margin = 15, title = true, meta = {} } = {}) {
  const b = D.viewBBox(sk, view) || { x0: -50, y0: -50, x1: 50, y1: 50 };
  const x0 = b.x0 - margin, y0 = b.y0 - margin - (title ? 12 : 0), w = b.x1 - b.x0 + 2 * margin, h = b.y1 - b.y0 + 2 * margin + (title ? 12 : 0);
  let s = `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="${n3(w)}mm" height="${n3(h)}mm" viewBox="${n3(x0)} ${n3(y0)} ${n3(w)} ${n3(h)}">\n`;
  s += `<title>${esc(sk.name)} — ${D.VIEWS[view]}</title>\n<g fill="none" stroke="#000" stroke-linecap="round" stroke-linejoin="round">\n`;
  for (const it of drawList(sk, view)) {
    if (it.k === 'path') { const da = D.DASH[it.stroke]; s += `<path d="${C.toSVGd(it.path)}" stroke-width="${it.w}"${da ? ` stroke-dasharray="${da.join(' ')}"` : ''}${it.fill ? ` fill="${esc(it.fill)}"` : ''}/>\n`; }
    if (it.k === 'point') s += `<circle cx="${n3(it.p[0])}" cy="${n3(it.p[1])}" r="0.8" fill="#000" stroke="none"/>\n`;
    if (it.k === 'dim') { const d = dimParts(it); s += `<g stroke="#1d4ed8" stroke-width="0.2">${d.lines.map(([p, q]) => `<line x1="${n3(p[0])}" y1="${n3(p[1])}" x2="${n3(q[0])}" y2="${n3(q[1])}"/>`).join('')}</g><text x="${n3(d.tp[0])}" y="${n3(d.tp[1])}" font-size="3.5" font-family="Helvetica, Arial, sans-serif" fill="#1d4ed8" stroke="none" text-anchor="middle" transform="rotate(${n3(d.ang * 180 / Math.PI)} ${n3(d.tp[0])} ${n3(d.tp[1])})">${esc(it.text)}</text>\n`; }
    if (it.k === 'text') { if (it.leader) s += `<line x1="${n3(it.p[0])}" y1="${n3(it.p[1])}" x2="${n3(it.leader[0])}" y2="${n3(it.leader[1])}" stroke-width="0.25"/><circle cx="${n3(it.leader[0])}" cy="${n3(it.leader[1])}" r="0.7" fill="#000" stroke="none"/>`; s += `<text x="${n3(it.p[0])}" y="${n3(it.p[1])}" font-size="${it.size}" font-family="Helvetica, Arial, sans-serif" fill="#000" stroke="none">${esc(it.text)}</text>\n`; }
  }
  s += '</g>\n';
  if (title) s += `<text x="${n3(x0 + 3)}" y="${n3(y0 + 8)}" font-size="5" font-family="Helvetica, Arial, sans-serif" fill="#000">${esc([sk.name, D.VIEWS[view], meta.product, meta.code].filter(Boolean).join(' · '))}</text>\n`;
  return s + '</svg>\n';
}

/* ---------- tuval (PNG) ---------- */
// ctx'e çizim: px/mm = k, dünya noktası (x,y) → ((x - ox)·k, (y - oy)·k)
export function drawCanvas(ctx, sk, view, { k, ox, oy, sel = new Set(), colors = {} }) {
  const col = { ink: '#000', dim: '#1d4ed8', sel: '#0ea5e9', ...colors };
  const T = (p) => [(p[0] - ox) * k, (p[1] - oy) * k];
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  for (const it of drawList(sk, view)) {
    const on = sel.has(it.id);
    if (it.k === 'path') {
      ctx.beginPath(); const s0 = T(it.path.segs[0].a); ctx.moveTo(...s0);
      for (const sg of it.path.segs) { if (sg.t === 'L') ctx.lineTo(...T(sg.b)); else ctx.bezierCurveTo(...T(sg.c1), ...T(sg.c2), ...T(sg.b)); }
      if (it.path.closed) ctx.closePath();
      ctx.setLineDash(D.DASH[it.stroke] ? D.DASH[it.stroke].map((v) => Math.max(1, v * k)) : []);
      ctx.lineWidth = Math.max(1, it.w * k); ctx.strokeStyle = on ? col.sel : col.ink; ctx.stroke();
      if (on) { ctx.setLineDash([]); ctx.lineWidth = Math.max(3, it.w * k + 2); ctx.globalAlpha = 0.25; ctx.stroke(); ctx.globalAlpha = 1; }
    }
    if (it.k === 'point') { ctx.setLineDash([]); ctx.fillStyle = on ? col.sel : col.ink; ctx.beginPath(); ctx.arc(...T(it.p), Math.max(2.5, 0.8 * k), 0, 7); ctx.fill(); }
    if (it.k === 'dim') {
      const d = dimParts(it); ctx.setLineDash([]); ctx.strokeStyle = on ? col.sel : col.dim; ctx.lineWidth = Math.max(1, 0.2 * k);
      ctx.beginPath(); for (const [p, q] of d.lines) { ctx.moveTo(...T(p)); ctx.lineTo(...T(q)); } ctx.stroke();
      ctx.save(); ctx.translate(...T(it.g.mid)); ctx.rotate(d.ang); ctx.fillStyle = on ? col.sel : col.dim; ctx.font = `${Math.max(10, 3.5 * k)}px Helvetica, Arial, sans-serif`; ctx.textAlign = 'center'; ctx.fillText(it.text, 0, -Math.max(3, 1 * k)); ctx.restore();
    }
    if (it.k === 'text') {
      ctx.setLineDash([]); ctx.fillStyle = ctx.strokeStyle = on ? col.sel : col.ink;
      if (it.leader) { ctx.lineWidth = Math.max(1, 0.25 * k); ctx.beginPath(); ctx.moveTo(...T(it.p)); ctx.lineTo(...T(it.leader)); ctx.stroke(); ctx.beginPath(); ctx.arc(...T(it.leader), Math.max(2, 0.7 * k), 0, 7); ctx.fill(); }
      ctx.font = `${Math.max(10, it.size * k)}px Helvetica, Arial, sans-serif`; ctx.textAlign = 'left'; ctx.fillText(it.text, ...T(it.p));
    }
  }
  ctx.setLineDash([]);
}

/* ---------- PDF ---------- */
export const PAPERS = { A4: [210, 297], A3: [297, 420] };
// En uygun standart ölçek: çizim (iki görünüş yan yana) çerçeveye sığsın
export function fitScale(wmm, hmm, availW, availH) { for (const s of SCALES) if (wmm / s <= availW && hmm / s <= availH) return s; return SCALES.at(-1); }
// Teknik föy sayfası: başlık bloğu, görünüşler (ortak ölçek), ölçü tablosu.
// scale = 1 → 1:1 (yalnız sığarsa). Çıktı: Uint8Array
export function toPDF(sk, { views = ['front', 'back'], paper = 'A4', landscape = true, scale = null, meta = {} } = {}) {
  let [pw, ph] = PAPERS[paper] || PAPERS.A4; if (landscape) [pw, ph] = [ph, pw];
  const doc = pdfDoc();
  const vs = views.filter((v) => D.viewBBox(sk, v));
  const bbs = vs.map((v) => D.viewBBox(sk, v));
  const gap = 25, M = 10, titleH = 22, tableW = 72;
  const totW = bbs.reduce((a, b) => a + (b.x1 - b.x0), 0) + gap * Math.max(0, bbs.length - 1), totH = Math.max(1, ...bbs.map((b) => b.y1 - b.y0));
  const availH = ph - 2 * M - titleH - 16;
  // ölçü tablosu yanda mı, ikinci sayfada mı: hangisi daha büyük ölçek veriyorsa
  const side = fitScale(totW, totH, pw - 2 * M - tableW - 10, availH), full = fitScale(totW, totH, pw - 2 * M - 8, availH);
  const tableOnSide = side <= full;
  const availW = tableOnSide ? pw - 2 * M - tableW - 10 : pw - 2 * M - 8;
  const sc = scale || (tableOnSide ? side : full);
  const fits = totW / sc <= availW + 1e-9 && totH / sc <= availH + 1e-9;
  const titleBlock = (pg, no, of) => {
    pg.color(0, 0, 0); pg.dash(null); pg.lineWidth(0.5); pg.rect(M, M, pw - 2 * M, ph - 2 * M); pg.rect(M, ph - M - titleH, pw - 2 * M, titleH);
    pg.text(M + 3, ph - M - 7, 11, [sk.name, meta.product].filter(Boolean).join(' · '));
    pg.text(M + 3, ph - M - 13, 7, [meta.project, meta.collection].filter(Boolean).join(' · ') || ' ');
    pg.text(M + 3, ph - M - 18.5, 7, `Model kodu: ${meta.code || '—'}    Dal: ${meta.branch || '—'}    Rev: ${meta.rev ?? '—'}    Tarih: ${meta.date || ''}`);
    const rx = pw - M - 66;
    pg.line(rx - 3, ph - M - titleH, rx - 3, ph - M);
    pg.text(rx, ph - M - 7, 11, `Ölçek 1:${sc}`);
    pg.text(rx, ph - M - 13, 7, `Kağıt ${paper} · birim mm, ölçüler cm · sayfa ${no}/${of}`);
    pg.text(rx, ph - M - 18.5, 6.5, fits ? '%100 (gerçek boyut) yazdırın' : 'UYARI: bu ölçekte sayfaya sığmıyor');
  };
  const pages = tableOnSide ? 1 : 2;
  const pg = doc.page(pw, ph);
  titleBlock(pg, 1, pages);
  // ölçek kontrol çubuğu: kağıtta 50 mm
  const bx = M + 4, by = M + 6;
  pg.lineWidth(0.4); pg.line(bx, by, bx + 50, by); for (const t of [0, 10, 20, 30, 40, 50]) pg.line(bx, by, bx, by), pg.line(bx + t, by, bx + t, by + (t % 50 ? 1.5 : 3));
  pg.text(bx + 53, by - 0.5, 6.5, `Kontrol çubuğu: kağıtta 50 mm = gerçekte ${D.fmtCm(50 * sc)} cm`);
  // görünüşler: çizim alanında ortalanır
  const areaTop = ph - M - titleH - 4, areaBot = M + 12, drawW = totW / sc, drawH = totH / sc;
  let cx = M + 4 + Math.max(0, (availW - drawW) / 2);
  const top = areaTop - 6 - Math.max(0, (areaTop - 6 - areaBot - drawH) / 2);
  vs.forEach((v, i) => {
    const b = bbs[i], wv = (b.x1 - b.x0) / sc;
    const f = (p) => [cx + (p[0] - b.x0) / sc, top - (p[1] - b.y0) / sc];   // dünya (y aşağı) → kağıt (y yukarı)
    pg.color(0, 0, 0); pg.dash(null); pg.text(cx, top + 4, 8, D.VIEWS[v] + ' görünüş');
    for (const it of drawList(sk, v)) {
      if (it.k === 'path') { pg.color(0, 0, 0); pg.lineWidth(Math.max(0.12, Math.min(0.5, it.w))); pg.dash(D.DASH[it.stroke] && D.DASH[it.stroke].map((v) => v * Math.min(1, 4 / sc))); pg.path(it.path, f); }
      if (it.k === 'point') { pg.dash(null); const q = f(it.p); pg.circle(q[0], q[1], 0.5, true); }
      if (it.k === 'dim') { const d = dimParts(it); pg.dash(null); pg.lineWidth(0.12); pg.color(0.11, 0.3, 0.85); for (const [p, q] of d.lines) pg.line(...f(p), ...f(q)); const m = f(it.g.mid), n = [-Math.sin(-d.ang), Math.cos(-d.ang)]; pg.text(m[0] + n[0] * 1, m[1] + n[1] * 1, 6, it.text, -d.ang, true); }
      if (it.k === 'text') { pg.color(0, 0, 0); pg.dash(null); if (it.leader) { pg.lineWidth(0.15); pg.line(...f(it.p), ...f(it.leader)); const l = f(it.leader); pg.circle(l[0], l[1], 0.4, true); } const q = f(it.p); pg.text(q[0], q[1], Math.max(5, it.size / sc * 72 / 25.4), it.text); }
    }
    cx += wv + gap / sc;
  });
  // ölçü tablosu
  const rows = D.measureTable(sk);
  let tx, ty, tpg = pg;
  if (tableOnSide) { tx = pw - M - tableW - 2; ty = ph - M - titleH - 8; pg.color(0, 0, 0); pg.dash(null); pg.lineWidth(0.3); pg.line(tx - 4, M, tx - 4, ph - M - titleH); }
  else { tpg = doc.page(pw, ph); titleBlock(tpg, 2, 2); tx = M + 6; ty = ph - M - titleH - 10; }
  const colW = tableOnSide ? tableW : 120;
  tpg.color(0, 0, 0); tpg.dash(null); tpg.text(tx, ty, 9, 'Ölçü tablosu (cm)'); ty -= 6; tpg.lineWidth(0.15);
  let col = 0;
  for (const r of rows) {
    let name = r.name; const maxW = colW - 16;
    if (textWidth(name, 6.5) > maxW) { while (name.length > 3 && textWidth(name + '…', 6.5) > maxW) name = name.slice(0, -1); name += '…'; }
    tpg.text(tx + col * (colW + 10), ty, 6.5, name); tpg.text(tx + col * (colW + 10) + colW - 12, ty, 6.5, D.fmtCm(r.mm)); tpg.line(tx + col * (colW + 10), ty - 1.3, tx + col * (colW + 10) + colW - 2, ty - 1.3);
    ty -= 4.4;
    if (ty < M + 14) { if (tableOnSide || col) break; col++; ty = ph - M - titleH - 16; }
  }
  return { bytes: doc.build(), scale: sc, fits, paper, size: [pw, ph], pages };
}
