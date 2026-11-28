// Hazır G-kodu kontrolü (Güvenli Kesim): dışarıdan gelen 3 eksen freze programı (SolidCAM, Mastercam, Fusion, elle yazılmış)
// okunur, uygulamanın kendi programlarına uygulanan risk haritasından (cam.js riskMap) geçirilir.
// Okunan lehçe: ISO / Fanuc (Haas, Mitsubishi, Syntec, Mach3, LinuxCNC, GRBL ve Siemens'in ISO modu). G0 G1 G2 G3 (G17,
// I J / R), G90 G91, G20 G21, G81 G82 G83 G73 + G98 G99 + G80, G43 H, T / M6, S M3 M4 M5, F, G28 / G53 (makine sıfırı).
// Okunmayan her şey (makro değişkenleri, IF / GOTO, G68 dönme, G18 / G19 yayları, Siemens döngüleri, Heidenhain, Mazatrol)
// satır numarasıyla bildirilir; böyle programda sonuç "eksik kontrol" diye işaretlenir, temiz sayılmaz.
// Saf JS, DOM yok: Node testlerinde (tests/gcheck.test.mjs) aynen çalışır.
import { riskMap } from './cam.js?v=20261128a';

const NUM = /^[+-]?(\d+\.?\d*|\.\d+)$/;
// takım satırındaki açıklamadan çap tahmini: "D8", "DIA 8", "Ø8", "8MM", "8. FLAT"
export function guessDiameter(comment) {
  const c = String(comment || '').toUpperCase();
  const m = c.match(/(?:\bD(?:IA)?\.?\s*=?\s*|Ø\s*)(\d+(?:[.,]\d+)?)/) || c.match(/(\d+(?:[.,]\d+)?)\s*MM\b/) || c.match(/\b(\d+(?:\.\d*)?)\s*(?:FLAT|BALL|END\s*MILL|ENDMILL|DRILL|PARMAK|KURESEL|MATKAP)/);
  const d = m ? parseFloat(m[1].replace(',', '.')) : NaN;
  return d > 0 && d < 100 ? d : null;
}
export function guessType(comment) {
  const c = String(comment || '').toUpperCase();
  if (/BALL|KURESEL|KÜRESEL|BULL/.test(c)) return 'ball';
  if (/DRILL|MATKAP|SPOT|PUNTA/.test(c)) return 'drill';
  return 'flat';
}

// metni okur: { tools: Map(n → {n, comment}), ops: [{ tool: n, moves: [{k, x, y, z, f, line}] }], issues: [...], unsupported }
export function parseProgram(text) {
  const lines = String(text || '').replace(/\r/g, '').split('\n');
  const issues = [], ops = [], tools = new Map();
  const issue = (line, sev, t) => issues.push({ line, sev, t });
  let pos = [0, 0, null], abs = true, inch = false, mode = 0, feed = null, plane = 17, tool = null, pending = null, spindle = false, hComp = false;
  let cyc = null, retPlane = 98, initZ = null, unsupported = 0, cur = null, sawCut = false;
  const toolComment = new Map();
  // GRBL / router programlarında M6 yoktur: takım, açıklamadaki "T<n>" ile (genelde M0 duraklamasıyla) değiştirilir
  const noM6 = !/\bM0*6\b/i.test(String(text || '').replace(/\([^)]*\)/g, ''));
  const startOp = (line) => { cur = { tool, moves: [], line }; ops.push(cur); };
  const push = (m) => { if (!cur) startOp(m.line); cur.moves.push(m); };
  for (let li = 0; li < lines.length; li++) {
    const ln = li + 1;
    let raw = lines[li];
    if (/^\s*\//.test(raw)) { issue(ln, 'info', 'Blok atlama (/) satırı: kumandada "blok atla" açıksa çalışmaz; kontrolde çalışıyor sayıldı'); raw = raw.replace(/^\s*\//, ''); }
    const comments = []; raw = raw.replace(/\(([^)]*)\)/g, (_, c) => { comments.push(c); return ' '; });
    const semi = raw.indexOf(';'); if (semi >= 0) { comments.push(raw.slice(semi + 1)); raw = raw.slice(0, semi); }
    const s = raw.trim().toUpperCase();
    for (const c of comments) {
      const t = c.match(/\bT\s*(\d+)\b/i); if (!t) continue;
      if (!toolComment.has(+t[1])) toolComment.set(+t[1], c.trim());
      if (noM6 && +t[1] !== tool) { tool = +t[1]; if (!tools.has(tool)) tools.set(tool, { n: tool }); cur = null; sawCut = false; }
    }
    if (!s || s === '%' || /^O\d+/.test(s) || /^:\d+/.test(s)) continue;
    if (/[#\[]|\b(IF|GOTO|WHILE|DO|END|EQ|NE|GT|LT|SIN|COS)\b|=/.test(s)) { unsupported++; issue(ln, 'crit', 'Makro / değişken / koşul satırı okunamıyor: ' + s.slice(0, 40)); continue; }
    if (/\b(CYCLE\d+|POCKET\d*|SLOT\d*|HOLES\d*|TRANS|ROT|AROT|TRAORI|TCARR|MSG)\b/.test(s)) { unsupported++; issue(ln, 'crit', 'Siemens komutu okunamıyor: ' + s.slice(0, 40)); continue; }
    if (/^(L |LBL|TOOL CALL|CYCL|BLK FORM|BEGIN PGM|END PGM)/.test(s)) { unsupported++; issue(ln, 'crit', 'Heidenhain Klartext satırı: bu kontrol yalnız ISO G-kodu okur'); continue; }
    const words = [...s.matchAll(/([A-Z])\s*([+-]?(?:\d+\.?\d*|\.\d+))/g)].map((w) => [w[1], w[2]]);
    const rest = s.replace(/([A-Z])\s*([+-]?(?:\d+\.?\d*|\.\d+))/g, '').trim();
    if (rest) { unsupported++; issue(ln, 'crit', 'Okunamayan ifade: ' + rest.slice(0, 30)); continue; }
    const W = {}, G = [], M = [];
    for (const [k, v] of words) { if (!NUM.test(v)) continue; const n = parseFloat(v); if (k === 'G') G.push(n); else if (k === 'M') M.push(n); else W[k] = { n, s: v }; }
    const u = (k) => (W[k] ? W[k].n * (inch ? 25.4 : 1) : undefined);
    // tam sayı yazımı: Fanuc'ta ondalık noktasız "X10" çoğu kumandada 10 µm (ya da 10 mm) — ayara bağlı, tehlikeli belirsizlik
    for (const k of ['X', 'Y', 'Z', 'R', 'I', 'J', 'K', 'Q']) if (W[k] && !W[k].s.includes('.') && W[k].n !== 0) issue(ln, 'warn', k + W[k].s + ' ondalık noktasız: bazı Fanuc ayarlarında ' + W[k].s + ' µm okunur. Kontrolde mm sayıldı; kumandanın ayarını doğrula');
    let motion = null;
    for (const g of G) {
      if (g === 0 || g === 1 || g === 2 || g === 3) { motion = g; mode = g; if (cyc) cyc = null; }
      else if (g === 90) abs = true; else if (g === 91) abs = false;
      else if (g === 20) inch = true; else if (g === 21) inch = false;
      else if (g === 17) plane = 17; else if (g === 18 || g === 19) { plane = g; issue(ln, 'warn', 'G' + g + ' düzlemi: bu düzlemdeki yaylar kontrol edilemez'); }
      else if (g === 98 || g === 99) retPlane = g;
      else if (g === 81 || g === 82 || g === 83 || g === 73) { cyc = { g, R: null, Z: null, Q: null }; initZ = pos[2]; mode = 'c'; }
      else if (g === 80) { cyc = null; if (mode === 'c') mode = 0; }
      else if (g === 43 || g === 43.4) hComp = true; else if (g === 49) hComp = false;
      else if (g === 28 || g === 30 || g === 53) motion = 'home';
      else if (g === 68 || g === 68.2 || g === 51 || g === 51.1) { unsupported++; issue(ln, 'crit', 'G' + g + ' (koordinat dönme / ölçek / ayna) kontrol edilemez'); }
      else if (g === 41 || g === 42) issue(ln, 'warn', 'Takım yarıçap telafisi (G' + g + '): gerçek takım merkezi programdaki yoldan yarıçap kadar kayar; kontrol programdaki yolla yapıldı');
      else if ([4, 10, 15, 16, 40, 54, 55, 56, 57, 58, 59, 54.1, 61, 64, 94, 95, 97, 96, 5.1, 8, 69, 50, 50.1].includes(g)) { /* etkisiz ya da kontrolü değiştirmez */ }
      else issue(ln, 'warn', 'G' + g + ' tanınmadı, yok sayıldı');
    }
    if ('A' in W || 'B' in W || 'C' in W) { unsupported++; issue(ln, 'crit', 'Döner eksen (A / B / C): bu kontrol yalnız 3 eksen programı okur'); continue; }
    if (W.T) { pending = Math.round(W.T.n); if (!tools.has(pending)) tools.set(pending, { n: pending }); }
    for (const m of M) {
      if (m === 6) { if (pending != null) tool = pending; cur = null; hComp = false; sawCut = false; }
      else if (m === 3 || m === 4) spindle = true; else if (m === 5) spindle = false;
      else if (m === 30 || m === 2) { /* son */ }
    }
    if (W.F) feed = W.F.n * (inch ? 25.4 : 1);
    if (motion === 'home') { pos = [pos[0], pos[1], Infinity]; if (cur) cur.home = true; continue; }
    const hasXYZ = 'X' in W || 'Y' in W || 'Z' in W;
    const tgt = (k, i) => { const v = u(k); return v === undefined ? pos[i] : abs ? v : (pos[i] ?? 0) + v; };
    if (mode === 'c' && cyc) {
      if (W.R) cyc.R = u('R'); if (W.Z) cyc.Z = u('Z'); if (W.Q) cyc.Q = u('Q');
      if (!hasXYZ && !W.R) continue;
      if (!abs) { issue(ln, 'crit', 'G91 ile delme çevrimi kontrol edilemez'); unsupported++; continue; }
      const x = tgt('X', 0), y = tgt('Y', 1);
      if (cyc.R == null || cyc.Z == null) { issue(ln, 'crit', 'Delme çevriminde R ya da Z eksik'); continue; }
      if (!spindle) issue(ln, 'crit', 'İş mili dönmüyor (M3 / M4 yok) ama delme başlıyor');
      if (!(feed > 0)) issue(ln, 'crit', 'Delmede ilerleme (F) yok');
      if (tool == null) issue(ln, 'crit', 'Takım seçilmeden (T.. M6) delme');
      else if (!hComp) issue(ln, 'warn', 'Takım boyu telafisi (G43 H) olmadan delme: Fanuc tipi kumandada takım boyu hesaba katılmaz');
      const zTop = pos[2] == null || !isFinite(pos[2]) ? cyc.R : Math.max(pos[2], cyc.R);
      push({ k: 'r', x, y, z: zTop, line: ln }); push({ k: 'r', x, y, z: cyc.R, line: ln });
      push({ k: 'd', x, y, z: cyc.Z, r: cyc.R, q: cyc.Q || 0, f: feed, line: ln });
      pos = [x, y, retPlane === 98 && initZ != null && isFinite(initZ) ? initZ : cyc.R];
      sawCut = true;
      continue;
    }
    if (!hasXYZ && !(mode === 2 || mode === 3)) continue;
    if (!hasXYZ) continue;
    const x = tgt('X', 0), y = tgt('Y', 1), z = tgt('Z', 2);
    if (pos[2] === null && z === null) { issue(ln, 'warn', 'İlk harekette Z bilinmiyor: Z güvenli yükseklikte sayıldı'); }
    const from = [pos[0], pos[1], pos[2] == null || !isFinite(pos[2]) ? Infinity : pos[2]], to = [x, y, z == null ? from[2] : z];
    if (mode === 0) {
      // G0'da eksenler doğrusal gitmez (Fanuc tipi: her eksen kendi hızıyla, yol kırık). En kötü yol denenir:
      // iniyorsa önce Z iner sonra X-Y gider; çıkıyorsa önce X-Y gider sonra Z çıkar.
      const xy = Math.hypot(to[0] - (from[0] ?? to[0]), to[1] - (from[1] ?? to[1])) > 1e-6;
      if (!isFinite(from[2])) { push({ k: 'r', x: to[0], y: to[1], z: Infinity, line: ln }); push({ k: 'r', x: to[0], y: to[1], z: to[2], line: ln }); }
      else if (xy && to[2] < from[2] - 1e-6) { push({ k: 'r', x: from[0], y: from[1], z: to[2], line: ln }); push({ k: 'r', x: to[0], y: to[1], z: to[2], line: ln }); }
      else if (xy && to[2] > from[2] + 1e-6) { push({ k: 'r', x: to[0], y: to[1], z: from[2], line: ln }); push({ k: 'r', x: to[0], y: to[1], z: to[2], line: ln }); }
      else push({ k: 'r', x: to[0], y: to[1], z: to[2], line: ln });
    } else {
      if (tool == null) issue(ln, 'crit', 'Takım seçilmeden (T.. M6) kesme hareketi');
      if (!spindle) issue(ln, 'crit', 'İş mili dönmüyor (M3 / M4 yok) ama kesme hareketi var');
      if (!(feed > 0)) issue(ln, 'crit', 'Kesme hareketinde ilerleme (F) yok');
      if (!isFinite(from[2])) issue(ln, 'warn', 'Makine sıfırından sonra Z belirtilmeden kesme');
      if (tool != null && !hComp && !sawCut) issue(ln, 'warn', 'Takım boyu telafisi (G43 H) görünmüyor: Fanuc tipi kumandada takım boyu hesaba katılmaz (GRBL / router için normal)');
      if (mode === 1) push({ k: 'f', x: to[0], y: to[1], z: to[2], f: feed, line: ln });
      else {
        if (plane !== 17) { issue(ln, 'warn', 'G17 dışı düzlemde yay: düz çizgi sayıldı'); push({ k: 'f', x: to[0], y: to[1], z: to[2], f: feed, line: ln }); }
        else {
          const arc = arcPoints(from, to, mode === 2, W.I ? u('I') : null, W.J ? u('J') : null, W.R ? u('R') : null);
          if (arc.error) issue(ln, 'crit', arc.error);
          for (const p of arc.pts) push({ k: 'f', x: p[0], y: p[1], z: p[2], f: feed, line: ln });
        }
      }
      sawCut = true;
    }
    pos = to;
  }
  for (const [n, t] of tools) { const c = toolComment.get(n); t.comment = c || ''; t.d = guessDiameter(c); t.type = guessType(c); }
  if (noM6 && tools.size) issues.push({ line: 0, sev: 'info', t: 'Programda M6 yok (GRBL / router): takım değişimi açıklamalardaki T numarasından izlendi' });
  return { tools, ops: ops.filter((o) => o.moves.length), issues, unsupported, lines: lines.length };
}
// G2 / G3: merkez (I J artımsal) ya da yarıçap (R; negatif = büyük yay); 1° adımla doğrulara bölünür, Z doğrusal (helis)
function arcPoints(a, b, cw, I, J, R) {
  let cx, cy;
  const ax = a[0], ay = a[1], bx = b[0], by = b[1];
  if (I != null || J != null) { cx = ax + (I || 0); cy = ay + (J || 0); const r1 = Math.hypot(ax - cx, ay - cy), r2 = Math.hypot(bx - cx, by - cy); if (Math.abs(r1 - r2) > Math.max(0.01, r1 * 1e-3)) return { error: 'Yay başı ve sonu merkeze eşit uzak değil (' + r1.toFixed(3) + ' ≠ ' + r2.toFixed(3) + ' mm): kumanda alarm verir ya da yanlış yay çizer', pts: [b] }; }
  else if (R != null) {
    const dx = bx - ax, dy = by - ay, d = Math.hypot(dx, dy), r = Math.abs(R);
    if (d < 1e-9) return { error: 'R ile tam daire yazılamaz', pts: [b] };
    if (d > 2 * r + 1e-6) return { error: 'Yay yarıçapı (' + r + ') iki nokta arasına yetmiyor', pts: [b] };
    const h = Math.sqrt(Math.max(0, r * r - d * d / 4)), mx = ax + dx / 2, my = ay + dy / 2, nx = -dy / d, ny = dx / d;
    const sgn = (cw ? -1 : 1) * (R < 0 ? -1 : 1);
    cx = mx + sgn * h * nx; cy = my + sgn * h * ny;
  } else return { error: 'Yayda merkez (I J) ya da yarıçap (R) yok', pts: [b] };
  const r = Math.hypot(ax - cx, ay - cy), a0 = Math.atan2(ay - cy, ax - cx);
  let a1 = Math.atan2(by - cy, bx - cx), sw = a1 - a0;
  if (cw) { while (sw >= -1e-9) sw -= 2 * Math.PI; } else { while (sw <= 1e-9) sw += 2 * Math.PI; }
  if (Math.hypot(bx - ax, by - ay) > 1e-9 && Math.abs(Math.abs(sw) - 2 * Math.PI) < 1e-9) sw = cw ? sw + 2 * Math.PI : sw - 2 * Math.PI;
  const n = Math.max(2, Math.ceil(Math.abs(sw) / (Math.PI / 180))), pts = [];
  for (let i = 1; i <= n; i++) { const t = i / n, an = a0 + sw * t; pts.push(i === n ? [bx, by, b[2]] : [cx + r * Math.cos(an), cy + r * Math.sin(an), a[2] + (b[2] - a[2]) * t]); }
  return { pts };
}

// stok: program sıfırına göre { x0, x1, y0, y1, zTop, zBot }; tools: n → { d, type, flute }
export function checkProgram(text, stock, toolTable, opt = {}) {
  const P = parseProgram(text), issues = [...P.issues];
  const missing = [...P.tools.keys()].filter((n) => !(toolTable[n] && toolTable[n].d > 0));
  if (missing.length) return { parsed: P, issues, missing, risk: null };
  if (!(stock.x1 > stock.x0 && stock.y1 > stock.y0 && stock.zTop > stock.zBot)) return { parsed: P, issues: [...issues, { line: 0, sev: 'crit', t: 'Stok ölçüleri geçersiz' }], missing: [], risk: null };
  const maxD = Math.max(1, ...Object.values(toolTable).map((t) => t.d || 0)), res = opt.res || Math.max(0.25, Math.min(1, Math.max(stock.x1 - stock.x0, stock.y1 - stock.y0) / 300));
  const ox = stock.x0 - maxD, oy = stock.y0 - maxD, nx = Math.ceil((stock.x1 - stock.x0 + 2 * maxD) / res), ny = Math.ceil((stock.y1 - stock.y0 + 2 * maxD) / res);
  const safe = stock.zTop + 1000;   // makine sıfırı / bilinmeyen Z: stoğun çok üstü
  const R = { P: { G: { nx, ny, ox, oy, res }, stock }, ops: [], safe };
  for (const op of P.ops) {
    const t = toolTable[op.tool] || { d: maxD, type: 'flat', flute: Infinity };
    R.ops.push({ name: 'T' + op.tool, tool: { n: op.tool, d: t.d, type: t.type || 'flat', flute: t.flute > 0 ? t.flute : Infinity }, moves: op.moves.map((m) => ({ ...m, z: isFinite(m.z) ? m.z : safe })) });
  }
  const risk = riskMap(R);
  // tablaya / bağlama payının altına inme
  R.ops.forEach((op, oi) => op.moves.forEach((m, mi) => {
    const r = risk.ops[oi][mi], zLow = m.k === 'd' ? m.z : m.z;
    if (m.k !== 'r' && zLow < stock.zBot - 1e-6 && m.x > stock.x0 - op.tool.d / 2 && m.x < stock.x1 + op.tool.d / 2 && m.y > stock.y0 - op.tool.d / 2 && m.y < stock.y1 + op.tool.d / 2 && r.lvl < 2) { r.lvl = 2; r.why = 'Z ' + (zLow - stock.zBot).toFixed(2) + ' mm stok altına iniyor: tabla / mengene / altlık kesilir'; }
  }));
  // satır bazında en kötü risk
  const byLine = new Map();
  R.ops.forEach((op, oi) => op.moves.forEach((m, mi) => { const r = risk.ops[oi][mi]; if (!r.lvl) return; const e = byLine.get(m.line); if (!e || r.lvl > e.lvl) byLine.set(m.line, { lvl: r.lvl, why: r.why }); }));
  for (const i of issues) { const lvl = i.sev === 'crit' ? 2 : i.sev === 'warn' ? 1 : 0; if (!lvl) continue; const e = byLine.get(i.line); if (!e || lvl > e.lvl) byLine.set(i.line, { lvl, why: i.t }); }
  const lines = [...byLine.entries()].map(([line, v]) => ({ line, ...v })).sort((a, b) => b.lvl - a.lvl || a.line - b.line);
  const red = lines.filter((l) => l.lvl === 2).length, yellow = lines.filter((l) => l.lvl === 1).length;
  return { parsed: P, issues, missing: [], risk, lines, red, yellow, complete: P.unsupported === 0, moves: R.ops.reduce((s, o) => s + o.moves.length, 0) };
}
