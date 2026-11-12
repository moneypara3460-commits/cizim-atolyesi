// Bağımlılıksız küçük vektör PDF yazıcı. Koordinatlar mm (içeride pt'ye çevrilir: 1 mm = 72 / 25,4 pt).
// Yazı tipi: PDF'in yerleşik Helvetica'sı; Türkçe harfler (ğ Ğ ş Ş ı İ) özel kodlamayla (Differences) eşlenir.
import * as C from './curve.js?v=20261112k';

export const PT = 72 / 25.4;
// WinAnsi dışındaki Türkçe glifler → kullanılmayan kodlar
const TR = { 'ğ': [0x80, 'gbreve'], 'Ğ': [0x81, 'Gbreve'], 'ş': [0x82, 'scedilla'], 'Ş': [0x83, 'Scedilla'], 'ı': [0x84, 'dotlessi'], 'İ': [0x85, 'Idotaccent'] };
// WinAnsi'de olan Latin-1 harfleri doğrudan; diğerleri '?'
function encode(s) {
  let out = '';
  for (const ch of String(s)) {
    let c;
    if (TR[ch]) c = TR[ch][0];
    else if (ch === '…') c = 0x86;
    else if (ch === '—' || ch === '–') c = 0x2d;
    else if (ch === '·') c = 0xb7;
    else { const k = ch.codePointAt(0); c = (k >= 32 && k < 127) || (k >= 0xa0 && k <= 0xff) ? k : 0x3f; }
    if (c === 0x28 || c === 0x29 || c === 0x5c) out += '\\' + String.fromCharCode(c);
    else if (c < 32 || c > 126) out += '\\' + c.toString(8).padStart(3, '0');
    else out += String.fromCharCode(c);
  }
  return out;
}
// Helvetica genişlikleri (1/1000 em) yaklaşık: ortalama ve dar / geniş harfler
const NARROW = new Set('iljtfrI.,:;\'!|ı ');
const WIDE = new Set('mwMWÖÜĞ@%');
// genişlik mm, boy pt
export function textWidth(s, sizePt) { let w = 0; for (const ch of String(s)) w += NARROW.has(ch) ? 0.28 : WIDE.has(ch) ? 0.83 : /[A-ZÇŞİ0-9]/.test(ch) ? 0.64 : 0.53; return w * sizePt * 25.4 / 72; }

const f2 = (v) => +(+v).toFixed(3);
export function pdfDoc() {
  const pages = [];
  return {
    page(wmm, hmm) {
      const ops = [];
      const P = (x, y) => f2(x * PT) + ' ' + f2(y * PT);
      const pg = {
        w: wmm, h: hmm, ops,
        save() { ops.push('q'); },
        restore() { ops.push('Q'); },
        clipRect(x, y, w, h) { ops.push(`${P(x, y)} ${f2(w * PT)} ${f2(h * PT)} re W n`); },
        lineWidth(mm) { ops.push(f2(mm * PT) + ' w'); },
        dash(arr) { ops.push(arr && arr.length ? '[' + arr.map((v) => f2(v * PT)).join(' ') + '] 0 d' : '[] 0 d'); },
        color(r, g, b) { ops.push(`${f2(r)} ${f2(g)} ${f2(b)} RG ${f2(r)} ${f2(g)} ${f2(b)} rg`); },
        line(x1, y1, x2, y2) { ops.push(P(x1, y1) + ' m ' + P(x2, y2) + ' l S'); },
        fillRect(x, y, w, h, r, g, b) { ops.push(`${f2(r)} ${f2(g)} ${f2(b)} rg ${P(x, y)} ${f2(w * PT)} ${f2(h * PT)} re f 0 0 0 rg`); },
        rect(x, y, w, h) { ops.push(`${P(x, y)} ${f2(w * PT)} ${f2(h * PT)} re S`); },
        circle(x, y, r, fill = false) { const p = C.circlePath([x, y], r); pg.path(p, (q) => q, fill); },
        // yol: f dünya → kağıt (mm)
        path(path, f = (q) => q, fill = false) {
          if (!path.segs.length) return;
          let s = P(...f(path.segs[0].a)) + ' m';
          for (const sg of path.segs) s += sg.t === 'L' ? ' ' + P(...f(sg.b)) + ' l' : ' ' + P(...f(sg.c1)) + ' ' + P(...f(sg.c2)) + ' ' + P(...f(sg.b)) + ' c';
          ops.push(s + (path.closed ? ' h' : '') + (fill ? ' f' : ' S'));
        },
        // x, y mm; size pt
        text(x, y, size, str, ang = 0, center = false) {
          const w = center ? textWidth(str, size) : 0;
          const c = Math.cos(ang), s = Math.sin(ang);
          const x0 = x - (w / 2) * c, y0 = y - (w / 2) * s;
          ops.push(`BT /F1 ${f2(size)} Tf ${f2(c)} ${f2(s)} ${f2(-s)} ${f2(c)} ${P(x0, y0)} Tm (${encode(str)}) Tj ET`);
        },
      };
      pages.push(pg); return pg;
    },
    build() {
      const objs = [];
      const add = (s) => { objs.push(s); return objs.length; };
      const diffs = '/Differences [128 /gbreve /Gbreve /scedilla /Scedilla /dotlessi /Idotaccent /ellipsis]';
      const font = add(`<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding << /Type /Encoding /BaseEncoding /WinAnsiEncoding ${diffs} >> >>`);
      const pagesId = objs.length + 1; objs.push(null);
      const kids = [];
      for (const pg of pages) {
        const stream = pg.ops.join('\n');
        const cs = add(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
        kids.push(add(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${f2(pg.w * PT)} ${f2(pg.h * PT)}] /Resources << /Font << /F1 ${font} 0 R >> >> /Contents ${cs} 0 R >>`));
      }
      objs[pagesId - 1] = `<< /Type /Pages /Kids [${kids.map((k) => k + ' 0 R').join(' ')}] /Count ${kids.length} >>`;
      const cat = add(`<< /Type /Catalog /Pages ${pagesId} 0 R >>`);
      const info = add('<< /Producer (Cizim Atolyesi) >>');
      let out = '%PDF-1.4\n%\xe2\xe3\xcf\xd3\n';
      const offs = [];
      objs.forEach((o, i) => { offs.push(out.length); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
      const xref = out.length;
      out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` + offs.map((o) => String(o).padStart(10, '0') + ' 00000 n \n').join('');
      out += `trailer\n<< /Size ${objs.length + 1} /Root ${cat} 0 R /Info ${info} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
      const bytes = new Uint8Array(out.length);
      for (let i = 0; i < out.length; i++) bytes[i] = out.charCodeAt(i) & 0xff;
      return bytes;
    },
  };
}
