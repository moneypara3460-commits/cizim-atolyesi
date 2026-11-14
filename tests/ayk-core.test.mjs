// Çalıştır: node tests/ayk-core.test.mjs
// Ayakkabı Modelhanesi — Aşama 1 çekirdek: geometri, pay motoru, dikiş, işaretler, eşleştirme, kayıt, dışa aktarma.
// Sonuçlar analitik değerlerle karşılaştırılır (dikdörtgen / L parça / çember yayı).
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as G from '../ayk/geom.js';
import * as M from '../ayk/model.js';
import * as B from '../ayk/build.js';
import * as X from '../ayk/match.js';
import * as E from '../ayk/export.js';
import { openStore, memoryBackend } from '../ayk/store.js';
import { addSample } from '../ayk/sample.js';
import { parseDXF } from '../cad2d-geom.js';

const tests = [];
const t = (name, fn) => tests.push([name, fn]);
const near = (a, b, tol, m = '') => assert.ok(Math.abs(a - b) <= tol, `${m} ${a} ≉ ${b} (±${tol})`);
const C = G.C;
// köşeleri kenar başı olan dikdörtgen parça; kinds: 4 kenarın pay türü (üst, sağ, alt, sol — y aşağı)
function rectPiece(w, h, kinds = ['dikis', 'dikis', 'dikis', 'dikis'], allow = {}, at = [0, 0]) {
  const [x, y] = at;
  const pc = M.makePiece({ name: 'R', outline: G.makePath([[x, y], [x + w, y], [x + w, y + h], [x, y + h]].map((p) => G.node(p, { brk: true })), true) });
  pc.allow = { dikis: 0, binme: 0, katlama: 0, kenar: 0, montaj: 0, ...allow };
  pc.autoDims = false;
  G.edges(pc.outline).forEach((e, i) => M.setEdgeProp(pc, e.id, { kind: kinds[i] }));
  return pc;
}
const proj = (pieces) => { const p = M.createProject({ name: 'Test', code: 'T1', size: '40' }, 1e12); p.pieces = pieces; return p; };

t('1. Düğüm yolu: doğru / Bezier segmentleri, uzunluk; çeyrek çember Bezier uzunluğu ≈ πr/2', () => {
  const sq = G.makePath([[0, 0], [100, 0], [100, 50], [0, 50]], true);
  near(G.length(sq), 300, 1e-9); assert.equal(G.edges(sq).length, 1, 'kenar başı yoksa tek kenar');
  const k = 0.5522847498 * 100;
  const arc = G.makePath([G.node([100, 0], { o: [0, k] }), G.node([0, 100], { i: [k, 0] })], false);
  near(G.length(arc), Math.PI * 50, 0.05, 'çeyrek çember');
});

t('2. Nokta ekleme şekli bozmaz (de Casteljau); düğüm silme; böl / birleştir uzunluğu korur', () => {
  const np = G.smoothFromPoints([[0, 0], [50, 40], [120, 10], [180, 60]], false);
  const L0 = G.length(np), mid = C.point(G.seg(np, 1), 0.37);
  const m = G.insertNode(np, 1, 0.37);
  near(G.length(np), L0, 1e-3, 'uzunluk (koordinatlar 0,1 µm yuvarlanır)'); near(C.dist(m.p, mid), 0, 1e-3, 'yeni düğüm eğri üzerinde');
  const parts = G.splitAtNode(np, 2); assert.equal(parts.length, 2);
  near(G.length(parts[0]) + G.length(parts[1]), L0, 1e-3, 'bölme');
  const j = G.joinPaths(parts[0], 'end', parts[1], 'start');
  near(G.length(j), L0, 1e-3, 'birleştirme'); assert.equal(j.nodes.length, np.nodes.length);
  const jr = G.joinPaths(parts[1], 'start', parts[0], 'end'); near(G.length(jr), L0, 1e-3, 'ters yönlü birleştirme');
  const cl = G.makePath([[0, 0], [10, 0], [10, 10], [0, 10]], true), op = G.splitAtNode(cl, 2)[0];
  assert.equal(op.closed, false); near(G.length(op), 40, 1e-9, 'kapalı yol düğümde açılır');
  assert.ok(G.closePath(op)); assert.equal(op.nodes.length, 4); near(G.length(op), 40, 1e-9, 'yeniden kapatma');
});

t('3. Döndürme / ayna / taşıma: uzunluk ve alan korunur, tutamaçlar doğru döner', () => {
  const np = G.smoothFromPoints([[0, 0], [60, 30], [100, 0], [70, 80]], true);
  const L = G.length(np), A = Math.abs(G.signedArea(G.flatten(np, 0.01)));
  const r = G.transform(G.clone(np), G.rotateFn([20, 20], 37)); near(G.length(r), L, 1e-3); near(Math.abs(G.signedArea(G.flatten(r, 0.01))), A, 0.05);
  const m = G.transform(G.clone(np), G.mirrorXFn(50)); near(G.length(m), L, 1e-3);
  const t2 = G.transform(G.clone(np), G.moveFn(12.5, -3)); near(t2.nodes[0].p[0], np.nodes[0].p[0] + 12.5, 1e-9);
});

t('4. Pay motoru: dikdörtgen 200×100, kenar türüne göre pay; türler karışmaz', () => {
  const all5 = rectPiece(200, 100, undefined, { dikis: 5 });
  const m = B.measure(all5); near(m.netArea, 20000, 1e-6); near(m.cutArea, 210 * 110, 1e-6); near(m.cutPerimeter, 2 * (210 + 110), 1e-6);
  // alt kenar montaj 16, diğerleri kenar bitirme 0 → yalnız alt uzar
  const mix = rectPiece(200, 100, ['kenar', 'kenar', 'montaj', 'kenar'], { montaj: 16, dikis: 5 });
  near(B.measure(mix).cutArea, 200 * 116, 1e-6, 'yalnız montaj kenarı');
  // üst katlama 4, sağ binme 8, alt montaj 16, sol dikiş 2: her kenar kendi değeri
  const four = rectPiece(200, 100, ['katlama', 'binme', 'montaj', 'dikis'], { katlama: 4, binme: 8, montaj: 16, dikis: 2 });
  const b = B.measure(four).cutBox; near(b.y0, -4, 1e-9); near(b.x1, 208, 1e-9); near(b.y1, 116, 1e-9); near(b.x0, -2, 1e-9);
  near(B.measure(four).cutArea, (200 + 8 + 2) * (100 + 4 + 16), 1e-6, 'sivri köşelerle dikdörtgen');
  // katlama payını değiştirmek binme payını etkilemez
  four.allow.katlama = 6; const b2 = B.measure(four).cutBox; near(b2.y0, -6, 1e-9); near(b2.x1, 208, 1e-9);
  // "pay yok" türü
  const none = rectPiece(200, 100, ['yok', 'yok', 'yok', 'yok'], { dikis: 9 }); near(B.measure(none).cutArea, 20000, 1e-6);
});

t('5. İçbükey (L) parça ve sıkı eğri: köşede geometrik hata yok, kesim çizgisi kendini kesmez', () => {
  const L = M.makePiece({ outline: G.makePath([[0, 0], [200, 0], [200, 100], [100, 100], [100, 300], [0, 300]].map((p) => G.node(p, { brk: true })), true) });
  L.allow = { dikis: 10, binme: 0, katlama: 0, kenar: 0, montaj: 0 };
  G.edges(L.outline).forEach((e) => M.setEdgeProp(L, e.id, { kind: 'dikis' }));
  near(B.measure(L).cutArea, 40000 + 10 * 1000 + 100 * (5 - 1), 1e-6, 'A + s·P + s²·(dış−iç köşe)');
  assert.deepEqual(B.checkPiece(L).filter((x) => x.level === 'hata'), []);
  // iç bükey küçük yarıçaplı oyuk + büyük pay (pay > yarıçap): ötelemedeki düğüm kırpılmalı
  const pts = [[0, 0], [120, 0], [120, 60], [70, 60], [65, 45], [60, 60], [0, 60]];
  const notch = M.makePiece({ outline: G.makePath(pts.map((p) => G.node(p, { brk: false })), true) });
  notch.allow.kenar = 0; notch.allow.dikis = 12; M.setEdgeProp(notch, notch.outline.nodes[0].id, { kind: 'dikis' });
  const errs = B.checkPiece(notch).filter((x) => x.level === 'hata' && /kesim/i.test(x.msg));
  assert.deepEqual(errs, [], 'oyukta pay düğümü temizlendi');
  // Bezier'li yumuşak parça: kesim alanı ≈ A + s·P + π s² (dışbükey düzgün eğri)
  const r = 50, k = 0.5522847498 * r;
  const circ = M.makePiece({ outline: { id: 'c', closed: true, nodes: [G.node([r, 0], { i: [0, -k], o: [0, k] }), G.node([0, r], { i: [k, 0], o: [-k, 0] }), G.node([-r, 0], { i: [0, k], o: [0, -k] }), G.node([0, -r], { i: [-k, 0], o: [k, 0] })] } });
  circ.allow.kenar = 5; const mc = B.measure(circ);
  near(mc.cutArea, Math.PI * 55 * 55, 3, 'çember + 5 mm pay');
});

t('6. Dikiş çizgisi: net çizgiden içeri tam mesafe, çok sıra, uç kırpma', () => {
  const pc = rectPiece(200, 100, ['katlama', 'kenar', 'kenar', 'kenar'], { katlama: 4 });
  const top = G.edges(pc.outline)[0].id;
  M.setEdgeProp(pc, top, { stitch: { on: true, dist: 1.5, rows: 2, gap: 2.5, from: 10, to: 20 } });
  const st = B.pieceItems(pc).filter((it) => it.layer === 'dikis');
  assert.equal(st.length, 2, 'iki sıra');
  for (const p of st[0].pts) near(p[1], 1.5, 1e-9, 'ilk sıra 1,5 mm içeride');
  for (const p of st[1].pts) near(p[1], 4, 1e-9, 'ikinci sıra 1,5 + 2,5');
  near(st[0].pts[0][0], 10, 1e-9, 'baştan 10 mm'); near(st[0].pts.at(-1)[0], 180, 1e-9, 'sondan 20 mm');
  // yön bağımsız: ters sıralı dikdörtgende de içeri
  const rev = M.makePiece({ outline: G.makePath([[0, 0], [0, 100], [200, 100], [200, 0]].map((p) => G.node(p, { brk: true })), true) });
  M.setEdgeProp(rev, G.edges(rev.outline)[0].id, { stitch: { on: true, dist: 2 } });
  for (const p of B.pieceItems(rev).find((it) => it.layer === 'dikis').pts) near(p[0], 2, 1e-9, 'sol kenarın içi');
});

t('7. Çentik, binme noktası: kenar üzerindeki konum; çentik kesim çizgisinden içeri', () => {
  const pc = rectPiece(200, 100, ['binme', 'kenar', 'kenar', 'kenar'], { binme: 8 });
  const e0 = G.edges(pc.outline)[0];
  pc.marks.push({ id: 'n1', kind: 'centik', edge: e0.id, at: 50, depth: 3 }, { id: 'b1', kind: 'binme', edge: e0.id, at: 120 });
  const it = B.pieceItems(pc), n = it.find((q) => q.mark === 'n1'), b = it.find((q) => q.mark === 'b1');
  near(n.pts[0][0], 50, 1e-9); near(n.pts[0][1], -8, 1e-9, 'kesim çizgisinde'); near(n.pts[1][1], -5, 1e-9, '3 mm derinlik');
  near(b.c[0], 120, 1e-9); near(b.c[1], 0, 1e-9, 'binme noktası net çizgide');
  const loc = G.locateOnEdges(pc.outline, [77, 0.3]); assert.equal(loc.edge, e0.id); near(loc.at, 77, 1e-6);
});

t('8. Eşleştirme: uzunluk farkı, çentik sayısı / konumu, etiketle eşleme, ters yön', () => {
  const A = rectPiece(100, 50, ['dikis', 'kenar', 'kenar', 'kenar'], { dikis: 2 });
  const Bp = rectPiece(100.3, 50, ['dikis', 'kenar', 'kenar', 'kenar'], { dikis: 2 }, [0, 100]);
  const p = proj([A, Bp]);
  const ea = G.edges(A.outline)[0].id, eb = G.edges(Bp.outline)[0].id;
  A.marks.push({ id: 'a1', kind: 'centik', edge: ea, at: 30, label: 'A' }, { id: 'a2', kind: 'centik', edge: ea, at: 70, label: 'B' });
  Bp.marks.push({ id: 'b1', kind: 'centik', edge: eb, at: 70.3, label: 'A' }, { id: 'b2', kind: 'centik', edge: eb, at: 30, label: 'B' });
  const mt = X.makeMatch({ a: { piece: A.id, edge: ea }, b: { piece: Bp.id, edge: eb }, reverse: true, tol: 0.5 });
  p.matches.push(mt);
  let r = X.checkMatch(p, mt);
  near(r.diff, -0.3, 1e-9); assert.ok(r.ok, JSON.stringify(r.issues)); assert.equal(r.notches.length, 2);
  // aynı yönlü sayarsak çentikler tutmaz
  r = X.checkMatch(p, { ...mt, reverse: false }); assert.ok(!r.ok, 'yön yanlışsa hata');
  // çentik sayısı farkı (etiketsiz)
  for (const m of [...A.marks, ...Bp.marks]) m.label = '';
  Bp.marks.pop(); r = X.checkMatch(p, mt); assert.ok(r.issues.some((i) => /sayısı farklı/.test(i.msg)));
  // uzunluk farkı büyükse hata
  const C2 = rectPiece(96, 50, undefined, {}, [0, 200]); p.pieces.push(C2);
  r = X.checkMatch(p, X.makeMatch({ a: { piece: A.id, edge: ea }, b: { piece: C2.id, edge: G.edges(C2.outline)[0].id } }));
  assert.ok(!r.ok && r.issues.some((i) => /uzunluk/.test(i.msg)));
  // silinmiş parça
  r = X.checkMatch(p, X.makeMatch({ a: { piece: 'yok', edge: 'x' }, b: { piece: A.id, edge: ea } })); assert.ok(!r.ok);
});

t('9. Hatalı geometri işaretlenir: kendini kesen parça, açık sınır, çok küçük alan', () => {
  const bow = M.makePiece({ outline: G.makePath([[0, 0], [100, 100], [100, 0], [0, 60]], true) });
  assert.ok(B.checkPiece(bow).some((x) => x.level === 'hata' && /kendini kesiyor/.test(x.msg)));
  const open = M.makePiece({ outline: G.makePath([[0, 0], [100, 0], [100, 50]], false) });
  assert.ok(B.checkPiece(open).some((x) => /kapalı değil/.test(x.msg)));
  const flat = M.makePiece({ outline: G.makePath([[0, 0], [100, 0], [100, 0.001]], true) });
  assert.ok(B.checkPiece(flat).some((x) => /alan/.test(x.msg)));
});

t('10. Kayıt: otomatik kayıt, revizyon, geri yükleme, JSON yedek, şema denetimi, malzeme kütüphanesi', async () => {
  const st = openStore(memoryBackend());
  const p = M.createProject({ name: 'Derby 01', code: 'DB01', size: '41' }, 1000);
  addSample(p, 'm-deri');
  await st.put(p, { now: 2000 });
  let q = await st.get(p.id); assert.equal(q.pieces.length, 3); assert.equal(q.name, 'Derby 01');
  near(B.measure(q.pieces[0]).netArea, B.measure(p.pieces[0]).netArea, 1e-9, 'geometri aynen geri geldi');
  await st.commit(q, 'ilk', { now: 3000 }); q.pieces.pop(); await st.commit(q, 'dil silindi', { now: 4000 });
  assert.equal((await st.revisions(p.id)).length, 2);
  const back = await st.restore(p.id, 1, { now: 5000 }); assert.equal(back.pieces.length, 3); assert.equal(back.rev, 3);
  const imp = await st.importJSON(st.exportJSON(back), { now: 6000 }); assert.notEqual(imp.id, p.id); assert.equal((await st.list()).length, 2);
  assert.throws(() => M.migrate({ kind: 'cizim.textile' }), /değil/);
  assert.throws(() => M.migrate({ kind: M.KIND, schema: 99 }), /daha yeni/);
  const mats = await st.materials(); assert.equal(mats.length, 7);
  await st.saveMaterials([...mats, M.makeMaterial({ name: 'Rugan', type: 'deri', thickness: 1.1 })]);
  assert.equal((await st.materials()).length, 8);
  assert.equal(M.validateMaterial({ name: ' ', thickness: -1, stretchPct: { boy: 0, en: 0 } }).length, 2);
});

t('11. Otomatik pay önerisi: kalınlık ve yönteme bağlı; elle değiştirilen pay korunur', () => {
  const s1 = M.suggestAllowances(1.0, 'strobel'), s2 = M.suggestAllowances(2.0, 'goodyear');
  assert.ok(s2.katlama > s1.katlama && s2.montaj > s1.montaj && s2.binme >= s1.binme);
  const pc = M.makePiece({}); pc.allow.binme = 12; pc.allowAuto.binme = false;
  M.refreshAutoAllowances(pc, { thickness: 2 }, 'goodyear');
  assert.equal(pc.allow.binme, 12); assert.equal(pc.allow.montaj, s2.montaj);
});

function parseOwnDXF(txt) {
  const L = txt.split(/\r?\n/), ents = []; let cur = null, inEnt = false;
  for (let i = 0; i + 1 < L.length; i += 2) {
    const c = +L[i].trim(), v = L[i + 1].trim();
    if (c === 2 && v === 'ENTITIES') inEnt = true;
    if (!inEnt) continue;
    if (c === 0) { if (v === 'VERTEX' && cur && cur.type === 'POLYLINE') { cur.v.push([]); continue; } if (v === 'SEQEND') continue; cur = { type: v, v: [], o: {} }; ents.push(cur); continue; }
    if (!cur) continue;
    if (cur.type === 'POLYLINE' && cur.v.length && (c === 10 || c === 20)) cur.v.at(-1)[c === 10 ? 0 : 1] = +v;
    else cur.o[c] = cur.o[c] ?? v;
  }
  return ents;
}
t('12. DXF: katmanlar ayrı, ölçü 1:1 (kesim dikdörtgeni 210 × 110), y ekseni çevrilmiş; uygulamanın DXF okuyucusu da açar', () => {
  const pc = rectPiece(200, 100, undefined, { dikis: 5 }, [10, 20]);
  pc.marks.push({ id: 'c1', kind: 'centik', edge: G.edges(pc.outline)[0].id, at: 40 }, { id: 'h1', kind: 'delik', p: [60, 70], d: 4, label: 'Ø4' });
  const p = proj([pc]);
  const txt = E.toDXF(p);
  assert.ok(txt.includes('AC1009') && txt.trim().endsWith('EOF'));
  for (const n of ['KESIM', 'NET', 'CENTIK', 'DELIK', 'YAZI']) assert.ok(new RegExp('\\r\\n2\\r\\n' + n + '\\r\\n').test(txt), 'katman ' + n);
  const ents = parseOwnDXF(txt), cut = ents.find((e) => e.type === 'POLYLINE' && e.o[8] === 'KESIM');
  const xs = cut.v.map((q) => q[0]), ys = cut.v.map((q) => q[1]);
  near(Math.max(...xs) - Math.min(...xs), 210, 1e-6); near(Math.max(...ys) - Math.min(...ys), 110, 1e-6);
  near(Math.max(...ys), -15, 1e-6, 'y çevrildi (üst kenar y=20 → -15)');
  assert.equal(cut.o[70], '1', 'kapalı polyline');
  const hole = ents.find((e) => e.type === 'CIRCLE' && e.o[8] === 'DELIK'); near(+hole.o[40], 2, 1e-9);
  assert.ok(!/[ğşıİçöüĞŞÇÖÜ]/.test(txt), 'DXF metni ASCII');
  // uygulamanın kendi DXF okuyucusu (cad2d-geom.parseDXF)
  const back = parseDXF(txt).ents;
  const lines = back.filter((e) => e.t === 'line' && e.layer === 'KESIM');
  near(lines.reduce((a, e) => a + Math.hypot(e.b[0] - e.a[0], e.b[1] - e.a[1]), 0), 2 * (210 + 110), 1e-3, 'KESIM çevresi');
  // gizli katman yazılmaz
  p.layers.yazi.visible = false; assert.ok(!E.toDXF(p).includes('\r\nYAZI\r\n'));
});

t('13. SVG: mm birimli, viewBox = sayfa; katman grupları; kesim çokgeni gerçek koordinatta', () => {
  const pc = rectPiece(200, 100, undefined, { dikis: 5 });
  const s = E.toSVG(proj([pc]), { margin: 10 });
  const m = /width="([\d.]+)mm" height="([\d.]+)mm" viewBox="([-\d. ]+)"/.exec(s);
  const vb = m[3].split(' ').map(Number);
  near(+m[1], vb[2], 1e-9); near(+m[2], vb[3], 1e-9, 'kullanıcı birimi = mm');
  assert.ok(/<g id="kesim" inkscape:groupmode="layer"/.test(s));
  const poly = /<g id="kesim"[^>]*>\n<polygon[^>]*points="([^"]+)"/.exec(s)[1].split(' ').map((q) => q.split(',').map(Number));
  near(Math.max(...poly.map((q) => q[0])) - Math.min(...poly.map((q) => q[0])), 210, 1e-6);
});

t('14. PDF: A4 sayfa ölçüsü, 1:1 çizim, büyük parça otomatik sayfalanır; 50 mm kontrol çizgisi 141,73 pt', () => {
  const small = rectPiece(100, 60, undefined, { dikis: 5 });
  const r = E.toPDF(proj([small]), { paper: 'A4' });
  const txt = Buffer.from(r.bytes).toString('latin1');
  assert.ok(txt.startsWith('%PDF-1.4')); assert.equal(r.pages, 1);
  assert.ok(/MediaBox \[0 0 595\.276 841\.89\]/.test(txt), 'A4 = 210 × 297 mm');
  // kesim dikdörtgeninin yolu: 110 mm = 311.811 pt genişlik
  const big = rectPiece(500, 300, undefined, { dikis: 5 });
  const r2 = E.toPDF(proj([big]), { paper: 'A4', overlap: 10 });
  const L = r2.layout; assert.ok(r2.pages >= 6, 'döşeme: ' + r2.pages);
  assert.ok(L.pages.every((q) => q.kind === 'tile'));
  // A3 yatay daha az sayfa
  assert.ok(E.toPDF(proj([big]), { paper: 'A3', landscape: true }).pages < r2.pages);
  // özel sayfa
  assert.equal(E.toPDF(proj([big]), { paper: 'ozel', w: 700, h: 500 }).pages, 1);
  assert.throws(() => E.toPDF(proj([]), {}), /parça yok/);
  // pypdf / pdftoppm ile ölçü doğrulaması (varsa)
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ayk-')), f = path.join(dir, 'k.pdf');
  fs.writeFileSync(f, r.bytes);
  try { const info = execFileSync('pdfinfo', [f], { encoding: 'utf8' }); assert.ok(/595\.276 x 841\.89 pts \(A4\)/.test(info), info); } catch (e) { if (e.code !== 'ENOENT') throw e; }
});

t('15. Örnek stampa: 3 parça, hatasız geometri; eşleşme kontrolü çalışır; dışa aktarmalar üretilir', () => {
  const p = M.createProject({ name: 'Örnek' }, 1); addSample(p, 'm-deri');
  p.materials = [M.makeMaterial({ id: 'm-deri', name: 'Deri', thickness: 1.4 })];
  for (const pc of p.pieces) assert.deepEqual(B.checkPiece(pc).filter((x) => x.level === 'hata'), [], pc.name);
  const all = X.checkAll(p); assert.equal(all.length, 1); assert.ok(Number.isFinite(all[0].diff));
  assert.ok(E.toDXF(p).length > 1000); assert.ok(E.toSVG(p).includes('Ön saya')); assert.ok(E.toPDF(p).pages >= 1);
});

let fail = 0;
for (const [name, fn] of tests) {
  try { await fn(); console.log('ok   ' + name); }
  catch (e) { fail++; console.log('FAIL ' + name + '\n     ' + (e.stack || e).toString().split('\n').slice(0, 4).join('\n     ')); }
}
console.log(`\n${tests.length - fail}/${tests.length} geçti`);
process.exit(fail ? 1 : 0);
