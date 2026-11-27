// Çalıştır: node tests/gcheck.test.mjs — hazır G-kodu kontrolü (Güvenli Kesim)
import assert from 'node:assert/strict';
import * as GC from '../gcheck.js';
import * as C from '../cam.js';

const tests = [];
const t = (name, fn) => tests.push([name, fn]);
// stok: 100 × 60 × 30, sıfır üst ön-sol köşe (Z0 = üst yüz)
const STOCK = { x0: 0, x1: 100, y0: 0, y1: 60, zTop: 0, zBot: -30 };
const TT = { 1: { d: 10, type: 'flat', flute: 25 }, 2: { d: 6, type: 'drill', flute: 40 } };
const HEAD = '%\nO1000 (TEST)\nG21 G17 G40 G49 G80 G90\nT1 M6 (T1 D10 FLAT ENDMILL)\nS6000 M3\nG54 G0 X-10. Y30.\nG43 Z25. H1\n';
const TAIL = 'G0 Z25.\nM5\nG91 G28 Z0.\nG90\nM30\n%\n';
// dışarıdan yandan girip 2 mm derin bir yüzey geçişi (doğru program)
const GOOD = HEAD + 'G0 Z-2.\nG1 X110. F800\nG1 Y20.\nG1 X-10.\nG0 Z25.\nT2 M6 (T2 DRILL 6MM)\nS2000 M3\nG0 X50. Y30.\nG43 Z25. H2\nG98 G81 X50. Y30. Z-15. R2. F150\nX70.\nG80\n' + TAIL;

t('okuma: takımlar, açıklamadan çap tahmini, yaylar, delme çevrimi, G91 / G20', () => {
  const P = GC.parseProgram(GOOD);
  assert.deepEqual([...P.tools.keys()], [1, 2]);
  assert.equal(P.tools.get(1).d, 10); assert.equal(P.tools.get(2).d, 6); assert.equal(P.tools.get(2).type, 'drill');
  assert.equal(P.ops.length, 2); assert.equal(P.unsupported, 0);
  assert.equal(P.ops[1].moves.filter((m) => m.k === 'd').length, 2);
  const A = GC.parseProgram('G21 G90 G17\nT1 M6\nS1000 M3\nG0 X10. Y0. Z5.\nG1 Z-1. F100\nG2 X0. Y10. I-10. J0.\nG3 X-10. Y0. R10.\nG91 G1 X5. Y0.\nG90 G20 G1 X1.\n');
  const mv = A.ops[0].moves, end = mv[mv.length - 1];
  assert.ok(Math.abs(end.x - 25.4) < 1e-9, 'inç → mm');
  const arc = mv.filter((m) => m.line === 6);
  assert.ok(arc.length >= 89 && arc.every((m) => Math.abs(Math.hypot(m.x, m.y) - 10) < 1e-6), 'çeyrek daire');
  const arc2 = mv.filter((m) => m.line === 7);
  assert.ok(arc2.every((m) => Math.abs(Math.hypot(m.x, m.y) - 10) < 1e-6) && Math.abs(arc2[arc2.length - 1].x + 10) < 1e-9, 'R ile yay');
  assert.ok(mv.some((m) => m.line === 8 && Math.abs(m.x + 5) < 1e-9), 'G91 artımsal');
  assert.equal(GC.guessDiameter('T5 | 12. FLAT ENDMILL | H5'), 12); assert.equal(GC.guessDiameter('Ø8 PARMAK'), 8); assert.equal(GC.guessDiameter('DIA=4.5'), 4.5);
});

t('doğru program: kırmızı yok, eksiksiz okundu', () => {
  const r = GC.checkProgram(GOOD, STOCK, TT);
  assert.ok(r.complete && !r.missing.length);
  assert.equal(r.red, 0, JSON.stringify(r.lines.filter((l) => l.lvl === 2)));
});

t('hatalı programlar kırmızı: G0 ile malzemeye, tablaya inme, kısa takım, iş mili kapalı, F yok, bozuk yay', () => {
  const red = (body, re) => { const r = GC.checkProgram(HEAD + body + TAIL, STOCK, TT); const hit = r.lines.find((l) => l.lvl === 2 && re.test(l.why)); assert.ok(hit, re + ' bulunamadı: ' + JSON.stringify(r.lines.slice(0, 4))); return hit; };
  assert.equal(red('G0 X50. Y30.\nG0 Z-5.\n', /G0/).line, 9);
  red('G0 Z-2.\nG1 X50. F500\nG1 Z-35.\n', /stok altına/);
  red('G0 Z-2.\nG1 X110. F800\nG0 Z25.\nG0 X-10. Y30.\nG0 Z-28.\nG1 X110.\n', /kesme boyunu/);
  assert.ok(GC.checkProgram('G21 G90\nT1 M6\nG0 X-10. Y30. Z5.\nG1 Z-2. F100\nG1 X50.\n', STOCK, TT).lines.some((l) => l.lvl === 2 && /İş mili/.test(l.why)));
  assert.ok(GC.checkProgram('G21 G90\nT1 M6\nS1000 M3\nG0 X-10. Y30. Z5.\nG1 Z-2.\n', STOCK, TT).lines.some((l) => l.lvl === 2 && /ilerleme \(F\)/.test(l.why)));
  red('G0 Z-2.\nG1 X0. F500\nG2 X20. Y30. I5. J0.\n', /merkeze eşit uzak değil/);
});

t('okunamayan satırlar: makro, Siemens döngüsü, döner eksen → eksik kontrol (temiz sayılmaz); ondalıksız sayı uyarısı', () => {
  for (const [body, re] of [['#100=5.\n', /Makro/], ['CYCLE81(10,0,2,-5)\n', /Siemens/], ['G0 A90.\n', /Döner eksen/], ['G68 X0 Y0 R45.\n', /G68/]]) {
    const r = GC.checkProgram(HEAD + body + TAIL, STOCK, TT);
    assert.equal(r.complete, false, body); assert.ok(r.lines.some((l) => l.lvl === 2 && re.test(l.why)), body);
  }
  const r = GC.checkProgram(HEAD + 'G0 X10 Y30.\n' + TAIL, STOCK, TT);
  assert.ok(r.lines.some((l) => l.lvl === 1 && /ondalık noktasız/.test(l.why)));
});

t('takım çapı bilinmiyorsa kontrol yapılmaz, eksik takımlar istenir', () => {
  const r = GC.checkProgram(GOOD, STOCK, { 1: TT[1] });
  assert.deepEqual(r.missing, [2]); assert.equal(r.risk, null);
});

t('uygulamanın kendi ürettiği program okununca kendi risk haritasıyla aynı kırmızı sayısını verir (0)', () => {
  function boxTris(min, max) { const [x0, y0, z0] = min, [x1, y1, z1] = max; const v = [[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0], [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]]; const f = [[0, 2, 1], [0, 3, 2], [4, 5, 6], [4, 6, 7], [0, 1, 5], [0, 5, 4], [3, 7, 6], [3, 6, 2], [0, 4, 7], [0, 7, 3], [1, 2, 6], [1, 6, 5]]; return f.flatMap((q) => q.flatMap((i) => v[i])); }
  const POCKET = Float32Array.from([...boxTris([0, 0, 0], [60, 10, 40]), ...boxTris([0, 10, 0], [15, 20, 40]), ...boxTris([45, 10, 0], [60, 20, 40]), ...boxTris([15, 10, 0], [45, 20, 10]), ...boxTris([15, 10, 30], [45, 20, 40])]);
  const TOOLS = [{ id: 1, n: 1, type: 'flat', d: 8, flutes: 3, flute: 40, rpm: 8000, feed: 1200, plunge: 300 }, { id: 3, n: 3, type: 'drill', d: 5, flutes: 2, flute: 50, rpm: 3000, feed: 200, plunge: 150 }];
  const job = { tris: POCKET, tools: TOOLS, stock: { side: 2, top: 1, bottom: 5 }, res: 0.5, holes: [{ x: 7, z: 20, d: 5, top: 20, bottom: -1 }], ops: [{ type: 'face', on: true, tool: 1 }, { type: 'rough', on: true, tool: 1 }, { type: 'walls', on: true, tool: 1 }, { type: 'drill', on: true, tool: 3 }], zero: 'corner' };
  const R = C.plan(job), st = R.P.stock, z0 = R.P.zero;
  for (const post of ['fanuc', 'mach3', 'grbl']) {
    const g = C.gcode(R, job, post), stock = { x0: st.x0 - z0[0], x1: st.x1 - z0[0], y0: st.y0 - z0[1], y1: st.y1 - z0[1], zTop: st.zTop - z0[2], zBot: st.zBot - z0[2] };
    const r = GC.checkProgram(g, stock, { 1: { d: 8, type: 'flat', flute: 40 }, 3: { d: 5, type: 'drill', flute: 50 } }, { res: 0.5 });
    assert.ok(r.complete, post + ' eksiksiz okunmalı'); assert.equal(r.red, 0, post + ': ' + JSON.stringify(r.lines.filter((l) => l.lvl === 2).slice(0, 3)));
  }
});

let fail = 0;
for (const [name, fn] of tests) {
  try { await fn(); console.log('ok   ', name); } catch (e) { fail++; console.log('FAIL ', name, '\n     ', String(e.message).split('\n')[0].slice(0, 400)); }
}
console.log(fail ? `\n${fail} test BAŞARISIZ` : '\nTüm testler geçti');
process.exit(fail ? 1 : 0);
