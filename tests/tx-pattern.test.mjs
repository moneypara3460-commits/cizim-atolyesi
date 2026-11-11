// Çalıştır: node tests/tx-pattern.test.mjs
// Tekstil — Aşama 3: dokuma / konfeksiyon kalıp sistemi. Referans kalıplarla analitik doğrulama.
import assert from 'node:assert/strict';
import * as C from '../tx/curve.js';
import * as P from '../tx/woven/pattern.js';
import * as B from '../tx/woven/blocks.js';
import * as X from '../tx/woven/pattern-export.js';
import * as M from '../tx/model.js';
import { openStore, memoryBackend } from '../tx/store.js';

let fail = 0;
const tests = [];
const t = (name, fn) => tests.push([name, fn]);
const near = (a, b, tol, m = '') => assert.ok(Math.abs(a - b) <= tol, `${m} ${a} ≉ ${b} (±${tol})`);
const errs = (pc) => P.validatePiece(pc).filter((x) => x.level === 'hata').map((x) => x.msg);
const poly = (pts, allow = 10, o = {}) => P.makePiece({ name: 'test', grain: [[pts[0][0] + 5, pts[0][1] + 5], [pts[0][0] + 5, pts[0][1] + 50]], ...o, edges: pts.map((p, i) => ({ segs: [C.line(p, pts[(i + 1) % pts.length])], allow, corner: o.corner || 'miter' })) });
const rect = (w, h, allow = 10, o = {}) => poly([[0, 0], [w, 0], [w, h], [0, h]], allow, o);

t('1. Dikdörtgen: kesim alanı (W+2s)(H+2s), çevre 2(W+H)+8s; köşe türleri (sivri = dik 90°de, pah = 4 üçgen eksik); yön bağımsız', () => {
  for (const corner of ['miter', 'square']) { const m = P.measure(rect(200, 300, 10, { corner })); near(m.seamArea, 60000, 1e-9); near(m.cutArea, 220 * 320, 1e-6); near(m.cutPerimeter, 2 * (220 + 320), 1e-6); }
  near(P.measure(rect(200, 300, 10, { corner: 'bevel' })).cutArea, 220 * 320 - 4 * 50, 1e-6);
  const rev = poly([[0, 0], [0, 300], [200, 300], [200, 0]]); near(P.measure(rev).cutArea, 220 * 320, 1e-6);
  const hem = rect(200, 300); hem.edges[2].allow = 40; near(P.measure(hem).cutArea, 220 * 350, 1e-6, 'etek payı 4 cm');
  const fold = rect(200, 300); fold.fold = 3; near(P.measure(fold).cutArea, 210 * 320, 1e-6, 'kat kenarına pay yok');
});

t('2. İçbükey (L) parça: kesim alanı = A + s·P + s²·(dış köşe − iç köşe) — iç köşe kırpılır', () => {
  const L = poly([[0, 0], [200, 0], [200, 100], [100, 100], [100, 300], [0, 300]]);
  const m = P.measure(L); near(m.seamArea, 40000, 1e-9); near(m.cutArea, 40000 + 10 * 1000 + 100 * (5 - 1), 1e-6);
  assert.deepEqual(errs(L), []);
  assert.equal(P.selfIntersections(P.cutPolygon(L).pts).length, 0);
});

t('3. Daire: kesim alanı π(r+s)² ve çevresi 2π(r+s) (±%0,05; Bezier çember yaklaşımı)', () => {
  const c = P.makePiece({ name: 'd', edges: [{ segs: C.circlePath([0, 0], 100).segs, allow: 15 }], grain: [[0, -50], [0, 50]] });
  const m = P.measure(c);
  near(m.cutArea / (Math.PI * 115 ** 2), 1, 5e-4); near(m.cutPerimeter / (2 * Math.PI * 115), 1, 5e-4); near(m.seamArea / (Math.PI * 1e4), 1, 5e-4);
  assert.deepEqual(errs(c), []);
});

t('4. Sivri köşede uzatma sınırı (6 × pay) aşılırsa dik köşeye geçer; pah köşesi sınırın içinde', () => {
  const tri = poly([[0, 0], [400, 0], [0, 40]], 10);   // ~5,7° sivri köşe
  const pts = P.cutPolygon(tri).pts, far = Math.max(...pts.filter((p) => p[0] > 300).map((p) => C.dist(p, [400, 0])));
  assert.ok(far <= 6 * 10 + 1e-6, 'uzatma ' + far);
  assert.deepEqual(errs(tri), []);
  const sq = P.measure(rect(100, 100, 10, { corner: 'square' })).cutArea, mi = P.measure(rect(100, 100, 10)).cutArea; near(sq, mi, 1e-9, '90°de dik = sivri');
});

t('5. Sıkı içbükey eğri: pay > yarıçap olduğunda oluşan düğüm kırpılır; kesim hattı kendini kesmez', () => {
  const pc = P.makePiece({ name: 'oyuk', grain: [[150, 40], [150, 120]], edges: [
    { segs: [C.cubic([0, 0], [40, 0], [70, 40], [70, 0])], allow: 10 }, { segs: [C.line([70, 0], [300, 0])], allow: 10 }, { segs: [C.line([300, 0], [300, 200])], allow: 10 }, { segs: [C.line([300, 200], [0, 200])], allow: 10 }, { segs: [C.line([0, 200], [0, 0])], allow: 10 }] });
  const c = P.cutPolygon(pc).pts;
  assert.equal(P.selfIntersections(c).length, 0);
  assert.equal(P.removeLoops([[0, 0], [10, 0], [10, 10], [5, -5], [20, -5]]).length, 4, 'düğüm kırpma');
});

t('6. Doğrulama: açık kontur, kendini kesen dikiş hattı, kenar içi kırık (uyarı), eğri kat kenarı, NaN, adet 0, 15 cm pay yakalanır', () => {
  const gap = rect(100, 100); gap.edges[1].segs = [C.line([100, 2], [100, 100])];
  assert.ok(errs(gap).some((m) => /kapalı değil/.test(m)));
  const bow = poly([[0, 0], [100, 100], [100, 0], [0, 100]]); assert.ok(errs(bow).some((m) => /kendini kesiyor/.test(m)));
  const kink = rect(100, 100); kink.edges[0].segs = [C.line([0, 0], [50, 20]), C.line([50, 20], [100, 0])];
  assert.ok(P.validatePiece(kink).some((x) => x.level === 'uyarı' && /kırık/.test(x.msg)));
  const cf = P.makePiece({ name: 'c', edges: [{ segs: C.circlePath([0, 0], 50).segs, allow: 10 }], fold: 0, grain: [[0, -20], [0, 20]] }); assert.ok(errs(cf).some((m) => /düz olmalı/.test(m)));
  const nan = rect(100, 100); nan.edges[0].segs[0].b = [NaN, 0]; assert.ok(errs(nan).some((m) => /geçersiz geometri/.test(m)));
  const q = rect(100, 100); q.qty = 0; q.edges[0].allow = 150; const e = errs(q).join('\n'); assert.match(e, /adedi/); assert.match(e, /0–100 mm/);
  assert.ok(P.validatePiece(P.makePiece({ name: 'g', edges: rect(10, 10).edges })).some((x) => /Düz boy/.test(x.msg)));
});

t('7. Çıt: dikiş hattındaki noktadan dışa normal yönünde, kesim hattından içeri; kenar dışı çıt hatası; yön çevirmede konum korunur', () => {
  const r = rect(200, 300, 10); r.notches.push({ edge: 0, at: 50, kind: 'tek' });
  const [[a, b]] = P.notchGeom(r, r.notches[0]);
  near(a[0], 50, 1e-9); near(a[1], -10, 1e-9); near(b[1], -4, 1e-9);   // kesim hattı (y = -10) → 6 mm içeri
  assert.equal(P.notchGeom(r, { edge: 0, at: 50, kind: 'çift' }).length, 2);
  r.notches.push({ edge: 1, at: 400, kind: 'tek' }); assert.ok(errs(r).some((m) => /kenar dışında/.test(m)));
  r.notches.pop();
  const rv = P.reversePiece(r), n = rv.notches[0], p1 = P.pointAt(r, 0, 50).p, p2 = P.pointAt(rv, n.edge, n.at).p;
  near(C.dist(p1, p2), 0, 1e-9); near(P.measure(rv).cutArea, P.measure(r).cutArea, 1e-6);
});

t('8. Pens: ağız genişliği, pens kapalı dikiş boyu = kenar − ağız; uç dışarıda hata; bacak farkı uyarı', () => {
  const pc = P.makePiece({ name: 'bel', grain: [[50, 50], [50, 150]], edges: [{ segs: [C.line([0, 0], [90, 0]), C.line([90, 0], [110, 0]), C.line([110, 0], [200, 0])], allow: 10 }, ...rect(200, 200).edges.slice(1)], darts: [{ a: [90, 0], b: [110, 0], apex: [100, 100] }] });
  near(P.dartIntake(pc.darts[0]), 20, 1e-12); near(P.seamLength(pc, 0), 180, 1e-9); assert.deepEqual(errs(pc), []);
  pc.darts[0].apex = [100, 260]; assert.ok(errs(pc).some((m) => /ucu parça dışında/.test(m)));
  pc.darts[0].apex = [130, 100]; assert.ok(P.validatePiece(pc).some((x) => /bacak boyları farklı/.test(x.msg)));
});

t('9. Bölme: alanlar korunur (dikdörtgen ve eğri parça); 1 / 3 kesişim reddedilir; çıtlar doğru parçada kalır', () => {
  const r = rect(200, 300); r.notches.push({ edge: 0, at: 30, kind: 'tek' }, { edge: 2, at: 30, kind: 'çift' });
  const [a, b] = P.splitPiece(r, [120, -50], [120, 400]);
  near(P.measure(a).seamArea + P.measure(b).seamArea, 60000, 1e-6);
  assert.deepEqual(errs(a), []); assert.deepEqual(errs(b), []);
  assert.equal(a.notches.length + b.notches.length, 2);
  const all = [a, b].flatMap((pc) => pc.notches.map((n) => P.pointAt(pc, n.edge, n.at).p));
  assert.ok(all.some((p) => C.dist(p, [30, 0]) < 1e-6) && all.some((p) => C.dist(p, [170, 300]) < 1e-6));
  assert.throws(() => P.splitPiece(r, [300, 0], [300, 10]), /tam iki noktada/);
  const c = P.makePiece({ name: 'd', edges: [{ segs: C.circlePath([0, 0], 100).segs, allow: 10 }] });
  const [c1, c2] = P.splitPiece(c, [-200, 30], [200, 30]);
  near((P.measure(c1).seamArea + P.measure(c2).seamArea) / P.measure(c).seamArea, 1, 1e-4);
});

t('10. Birleştirme: aynı boy kenarlarla iki parça tek parça olur (alan toplamı); boy farkı reddedilir; ters yönlü parça da birleşir', () => {
  const A = rect(100, 200), Bp = P.translatePiece(rect(150, 200), 500, 40);
  const Mg = P.mergePieces(A, 1, Bp, 3);
  near(P.measure(Mg).seamArea, 100 * 200 + 150 * 200, 1e-3); assert.equal(Mg.edges.length, 6); assert.deepEqual(errs(Mg), []);
  assert.ok(Mg.lines.some((l) => l.kind === 'birleşim'));
  assert.throws(() => P.mergePieces(A, 0, rect(100, 120), 1), /boyları farklı/);
  const Rv = poly([[0, 0], [0, 200], [80, 200], [80, 0]]);   // ters yönlü
  near(P.measure(P.mergePieces(A, 1, Rv, 0)).seamArea, 20000 + 16000, 1e-3);
});

t('11. Katı aç: arka beden (katlı) tam parçaya açılır — alan 2×, orta çizgiye simetrik, kat kenarı kalmaz', () => {
  const r = B.buildSet('gomlek', {}); const back = r.pieces.find((p) => p.name === 'Arka beden');
  const U = P.unfoldPiece(back, back.fold);
  near(P.measure(U).seamArea, 2 * P.measure(back).seamArea, 0.5);
  assert.equal(U.fold, null); assert.deepEqual(errs(U), []);
  const bb = P.bboxPts(P.seamPolygon(U)), cx = back.edges[back.fold].segs[0].a[0];
  near((bb.x0 + bb.x1) / 2, cx, 0.05);
  assert.throws(() => P.unfoldPiece(back, 2), /düz kenar/);
});

t('12. Gömlek ve etek temel blokları: bütün parçalar geçerli, bütün dikiş eşleşmeleri tutuyor; kol başı = kol oyuğu + bolluk (±0,01 mm)', () => {
  for (const set of ['gomlek', 'etek']) for (const prm of [{}, set === 'gomlek' ? { chest: 1120, capEase: 15 } : { waist: 900, hip: 1100 }]) {
    const r = B.buildSet(set, prm);
    for (const pc of r.pieces) assert.deepEqual(errs(pc), [], set + ' ' + pc.name);
    for (const sm of r.seams) { const c = P.seamCheck(r.pieces, sm); assert.ok(c.ok, `${set} ${sm.name}: sapma ${c.diff}`); }
  }
  const r = B.buildSet('gomlek', { chest: 1000, ease: 100 });
  const f = r.pieces.find((p) => p.name === 'Ön beden'), b = r.pieces.find((p) => p.name === 'Arka beden'), s = r.pieces.find((p) => p.name === 'Kol');
  near(P.edgeLength(s.edges[0]) - P.edgeLength(f.edges[2]) - P.edgeLength(b.edges[2]), 10, 0.01);
  const bb = P.bboxPts(P.seamPolygon(b)); near(bb.x1 - bb.x0, (1000 + 100) / 4, 1e-6, 'arka yarı genişlik = (göğüs + bolluk) / 4');
  const sk = B.buildSet('etek', { waist: 700 }), ks = sk.seams.find((x) => /kemer/.test(x.name));
  near(P.seamCheck(sk.pieces, ks).A, 700, 1e-6, 'pens kapalı bel toplamı = bel çevresi');
  assert.throws(() => B.buildSet('gomlek', { chest: -5 }), /geçersiz/); assert.throws(() => B.buildSet('ceket', {}), /Bilinmeyen/);
  assert.equal(B.defaultParams('etek', { 'Bel çevresi': 760 }).waist, 760);
});

t('13. 1:1 döşemeli PDF: geçerli yapı; kapakta 100 mm kare; döşemede 120 × 170 mm kesim çizgisi kağıtta aynı boyda (pt); boş sayfalar atlanır', () => {
  const pc = P.translatePiece(rect(100, 150, 10), 20, 20);
  const r = X.toTiledPDF([pc, P.translatePiece(rect(50, 50), 600, 20)], { title: 'Test' });
  const txt = Buffer.from(r.bytes).toString('latin1'), PT = 72 / 25.4;
  const xref = +txt.match(/startxref\n(\d+)/)[1]; assert.equal(txt.slice(xref, xref + 4), 'xref');
  [...txt.slice(xref).matchAll(/^(\d{10}) 00000 n $/gm)].forEach((m, i) => assert.equal(txt.slice(+m[1], +m[1] + String(i + 1).length + 6), `${i + 1} 0 obj`));
  assert.ok(txt.includes(`${(100 * PT).toFixed(3).replace(/0+$/, '')} ${(100 * PT).toFixed(3).replace(/0+$/, '')} re S`), '10 cm kare');
  const polys = [...txt.matchAll(/([-\d.]+) ([-\d.]+) m ([-\d.]+) ([-\d.]+) l ([-\d.]+) ([-\d.]+) l ([-\d.]+) ([-\d.]+) l (?:[-\d.]+ [-\d.]+ l )?h S/g)].map((m) => [Math.hypot(m[3] - m[1], m[4] - m[2]), Math.hypot(m[5] - m[3], m[6] - m[4])]);
  assert.ok(polys.some(([a, b]) => Math.abs(Math.min(a, b) - 120 * PT) < 0.01 && Math.abs(Math.max(a, b) - 170 * PT) < 0.01), 'kesim dikdörtgeni 1:1');
  assert.equal(r.pages, r.tiles + 1); assert.ok(r.tiles < r.grid[0] * r.grid[1], 'boş sayfa atlandı');
  assert.ok(!/NaN|undefined/.test(txt));
  const svg = X.toSVG([pc]); assert.match(svg, /width="[\d.]+mm"/); assert.ok(!/NaN/.test(svg));
});

t('14. Projede kalıp: yalnız dokuma ürününe bağlanır; doğrulama dikiş eşleşmesi bozulunca hata verir; kayıt / JSON gidiş-dönüş', async () => {
  const p = M.createProject({ name: 'K', type: 'mixed' });
  const g = M.addProduct(p, { branch: 'woven', type: 'gomlek' }), kz = M.addProduct(p, { branch: 'knit', type: 'kazak' });
  assert.throws(() => M.addPatternSet(p, 'gomlek', {}, { product: kz.id }), /dokuma/);
  const r = M.addPatternSet(p, 'gomlek', {}, { product: g.id, size: 'M' });
  assert.equal(p.woven.pieces.length, 7); assert.equal(p.woven.seams.length, 7);
  assert.deepEqual(M.validate(p).filter((x) => x.level === 'hata'), []);
  const s = p.woven.pieces.find((x) => x.name === 'Kol'); s.edges[0].segs = C.mapPath({ segs: s.edges[0].segs }, (q) => [q[0] * 1.1, q[1]]).segs;
  s.edges[1].segs[0].a = s.edges[0].segs.at(-1).b; s.edges[3].segs[0].b = s.edges[0].segs[0].a;
  assert.ok(M.validate(p).some((x) => x.level === 'hata' && /Kol oyuğu ↔ kol başı.*tutmuyor/.test(x.where + ' ' + x.msg)));
  const kn = M.createProject({ name: 'T', type: 'knit' }); assert.throws(() => M.addPatternSet(kn, 'etek', {}), /dokuma kalıbı yok/);
  const S = openStore(memoryBackend()); await S.commit(p, 'kalıp');
  const q = await S.get(p.id); assert.deepEqual(q.woven, p.woven);
  assert.deepEqual(M.migrate({ kind: M.KIND, schema: 1, type: 'woven', id: 'x', name: 'Eski', woven: { pieces: [], markers: [] }, library: { colors: [], materials: [] }, sizeTables: [], collection: { products: [] }, sketches: [], revisions: [] }).woven.seams, []);
  void r;
});

for (const [name, fn] of tests) {
  try { await fn(); console.log('ok   ', name); }
  catch (e) { fail++; console.log('FAIL ', name, '\n     ', String(e.message).split('\n')[0]); }
}
console.log(fail ? `\n${fail} test başarısız` : '\nTüm testler geçti');
process.exit(fail ? 1 : 0);
