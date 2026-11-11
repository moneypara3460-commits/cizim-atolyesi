// Çalıştır: node tests/tx-drawing.test.mjs
// Tekstil — Aşama 2: teknik moda çizimi (eğri geometrisi, çizim modeli, şablonlar, detaylar, SVG / PDF çıktısı).
import assert from 'node:assert/strict';
import * as C from '../tx/curve.js';
import * as D from '../tx/drawing.js';
import * as X from '../tx/export2d.js';
import * as M from '../tx/model.js';
import { openStore, memoryBackend } from '../tx/store.js';

let fail = 0;
const tests = [];
const t = (name, fn) => tests.push([name, fn]);
const near = (a, b, tol, m = '') => assert.ok(Math.abs(a - b) <= tol, `${m} ${a} ≉ ${b} (±${tol})`);
const allPts = (path) => path.segs.flatMap((s) => (s.t === 'L' ? [s.a, s.b] : [s.a, s.c1, s.c2, s.b]));

/* ---------- eğri ---------- */
t('1. Eğri uzunluğu: ikinci derece Bezier (parabol) kapalı formülle ±0,01 mm; düz kübik = kiriş', () => {
  // Q(t): P0 (0,0), P1 (50,100), P2 (100,0) → kübik: c1 = P0 + 2/3 (P1 - P0), c2 = P2 + 2/3 (P1 - P2)
  const P0 = [0, 0], P1 = [50, 100], P2 = [100, 0];
  const cb = C.cubic(P0, C.add(P0, C.mul(C.sub(P1, P0), 2 / 3)), C.add(P2, C.mul(C.sub(P1, P2), 2 / 3)), P2);
  const a = C.add(C.sub(P0, C.mul(P1, 2)), P2), b = C.mul(C.sub(P1, P0), 2);
  const A = 4 * (a[0] * a[0] + a[1] * a[1]), B = 4 * (a[0] * b[0] + a[1] * b[1]), Cc = b[0] * b[0] + b[1] * b[1];
  const F = (u) => { const Q = Math.sqrt(A * u * u + B * u + Cc); return ((2 * A * u + B) * Q) / (4 * A) + ((4 * A * Cc - B * B) / (8 * A ** 1.5)) * Math.log(Math.abs(2 * Math.sqrt(A) * Q + 2 * A * u + B)); };
  const exact = F(1) - F(0);
  near(C.segLength(cb), exact, 0.01, 'parabol'); near(C.segLength(cb), exact, 1e-6, 'parabol (sıkı)');
  near(C.segLength(C.cubic([0, 0], [10, 20], [20, 40], [30, 60])), Math.hypot(30, 60), 1e-9);
  near(C.pathLength(C.polyPath([[0, 0], [30, 40], [30, 100]])), 50 + 60, 1e-12);
});

t('2. Bezier çember: uzunluk 2πr ile ±%0,03, sınır kutusu ±r; düzleştirme sapması ≤ tolerans', () => {
  const c = C.circlePath([10, 20], 100);
  near(C.pathLength(c) / (2 * Math.PI * 100), 1, 3e-4);
  const b = C.bbox(c); near(b.x0, -90, 1e-9); near(b.x1, 110, 1e-9); near(b.y0, -80, 1e-9); near(b.y1, 120, 1e-9);
  const tol = 0.05, poly = C.flatten(c, tol);
  for (const s of c.segs) for (let i = 0; i <= 50; i++) {
    const p = C.point(s, i / 50); let d = Infinity;
    for (let j = 0; j < poly.length - 1; j++) d = Math.min(d, C.nearest({ segs: [C.line(poly[j], poly[j + 1])] }, p).d);
    assert.ok(d <= tol + 1e-9, 'sapma ' + d);
  }
});

t('3. Bölme ve uzunluk konumu: parçaların toplamı = bütün, uçlar sürekli; tAtLength ters fonksiyon', () => {
  const s = C.cubic([0, 0], [40, 90], [120, -60], [160, 30]), L = C.segLength(s);
  for (const f of [0.1, 0.37, 0.5, 0.92]) {
    const tt = C.tAtLength(s, f * L); near(C.segLength(s, 0, tt), f * L, 1e-7);
    const [a, b] = C.splitSeg(s, tt); near(C.segLength(a) + C.segLength(b), L, 1e-7); assert.deepEqual(a.b, b.a);
    near(C.dist(C.point(s, tt), a.b), 0, 1e-9);
  }
  const path = C.smoothPath([[0, 0], [50, 30], [100, 0], [150, 40]]), PL = C.pathLength(path);
  const [p1, p2] = C.splitAtLength(path, PL * 0.6); near(C.pathLength(p1), PL * 0.6, 1e-6); near(C.pathLength(p1) + C.pathLength(p2), PL, 1e-6);
});

t('4. Düzgün eğri (Catmull-Rom): bütün noktalardan geçer, birleşimlerde teğet sürekli (C1); kapalı eğri döner', () => {
  const pts = [[0, 0], [40, 60], [100, 70], [160, 20], [200, 50]];
  const p = C.smoothPath(pts);
  assert.equal(p.segs.length, 4);
  pts.forEach((q, i) => assert.deepEqual(i < 4 ? p.segs[i].a : p.segs[3].b, q));
  for (let i = 0; i < 3; i++) { const d1 = C.deriv(p.segs[i], 1), d2 = C.deriv(p.segs[i + 1], 0); near(d1[0], d2[0], 1e-9); near(d1[1], d2[1], 1e-9); }
  const cl = C.smoothPath(pts, true); assert.equal(cl.segs.length, 5); assert.deepEqual(cl.segs[4].b, pts[0]);
});

t('5. En yakın nokta: eğri normali boyunca 5 mm uzaktaki noktanın uzaklığı 5 mm (±1e-6)', () => {
  const s = C.cubic([0, 0], [30, 80], [90, 80], [120, 0]);
  for (const tt of [0.2, 0.5, 0.71]) {
    const p = C.point(s, tt), d = C.deriv(s, tt), n = C.mul([-d[1], d[0]], 1 / Math.hypot(...d));
    const r = C.nearest({ segs: [s] }, C.add(p, C.mul(n, 5))); near(r.d, 5, 1e-6); near(r.t, tt, 1e-5);
  }
});

/* ---------- çizim modeli ---------- */
t('6. Bütün şablonlar (13) kurulur, geçerlidir, koordinatlar sonludur; simetri tam (aynalı kopya x → -x, aynı y)', () => {
  assert.equal(Object.keys(D.TEMPLATES).length, 13);
  for (const k of Object.keys(D.TEMPLATES)) {
    const sk = D.createSketch({ name: k, branch: D.TEMPLATES[k].branch }); D.applyTemplate(sk, k, {});
    assert.deepEqual(D.validateSketch(sk).filter((x) => x.level === 'hata'), [], k);
    assert.ok(D.viewBBox(sk, 'front'), k + ' ön görünüş boş');
    let symN = 0;
    for (const v of ['front', 'back']) for (const L of sk.views[v].layers) for (const e of L.ents) {
      const ps = D.entityPaths(e);
      for (const s of ps) assert.ok(C.finitePath(s.path), k + ' ' + e.id);
      if (e.sym) { symN++; const h = ps.length / 2; for (let i = 0; i < h; i++) { const A = allPts(ps[i].path), B = allPts(ps[i + h].path); A.forEach((q, j) => { assert.ok(B[j][0] === -q[0] || (B[j][0] === 0 && q[0] === 0)); assert.equal(B[j][1], q[1]); }); } }
    }
    assert.ok(symN > 0, k + ' simetrik öğe yok');
  }
});

t('7. Şablon ölçüleri: çizimdeki ölçü varlıkları parametrelere tam eşit; geçersiz parametre reddedilir', () => {
  const sk = D.createSketch({}); D.applyTemplate(sk, 'gomlek', { chestW: 545, length: 780 });
  const dims = sk.views.front.layers[0].ents.filter((e) => e.t === 'dim');
  near(D.dimGeom(dims.find((e) => e.label === 'Göğüs')).L, 545, 1e-9);
  near(D.dimGeom(dims.find((e) => e.label === 'Boy')).L, 780, 1e-9);
  assert.equal(D.dimText(dims.find((e) => e.label === 'Göğüs')), 'Göğüs 54,5 cm');
  const ps = D.createSketch({}); D.applyTemplate(ps, 'pantolon', { length: 1000 });
  near(D.dimGeom(ps.views.front.layers[0].ents.find((e) => e.label === 'Boy')).L, 1000, 1e-9);
  for (const bad of [0, -10, NaN, Infinity]) assert.throws(() => D.applyTemplate(D.createSketch({}), 'tisort', { chestW: bad }), /geçersiz/);
  assert.throws(() => D.applyTemplate(D.createSketch({}), 'gemi', {}), /Bilinmeyen/);
  // beden tablosundan öneri: göğüs çevresi 960 + 100 bolluk → 530 düz genişlik
  assert.equal(D.paramsFromSize('gomlek', { 'Göğüs çevresi': 960 }).chestW, 530);
  assert.equal(D.paramsFromSize('kazak', { 'Göğüs çevresi': 960 }).chestW, 510);
  assert.equal(D.paramsFromSize('pantolon', { 'Bel çevresi': 800, 'Kalça çevresi': 1000 }).waistW, 410);
});

t('8. Şablon yeniden uygulanınca yalnız "Şablon" katmanı değişir; kullanıcının çizdikleri ve katmanları kalır', () => {
  const sk = D.createSketch({}); D.applyTemplate(sk, 'tisort', {});
  const mine = D.addEnt(sk, 'front', { t: 'text', p: [0, 0], text: 'Not', size: 5 });   // katman belirtilmedi: şablon katmanına değil, Çizim'e gider
  assert.equal(D.findEnt(sk, 'front', mine.id).L.name, 'Çizim');
  D.addLayer(sk, 'front', 'Detaylar');
  D.applyTemplate(sk, 'tisort', { length: 750 });
  assert.equal(sk.views.front.layers.filter((l) => l.name === 'Şablon').length, 1);
  assert.ok(D.findEnt(sk, 'front', mine.id)); assert.equal(sk.views.front.layers.length, 3);
  assert.equal(sk.template.params.length, 750);
});

t('9. Hizalama, aynalama, döndürme, kaydırma', () => {
  const sk = D.createSketch({});
  const a = D.addEnt(sk, 'front', { t: 'path', path: C.polyPath([[10, 0], [30, 20]]) }), b = D.addEnt(sk, 'front', { t: 'detail', kind: 'dugme', p: [80, 50], rot: 0, k: 1 });
  D.align([a, b], 'left'); near(D.entBBox(a).x0, D.entBBox(b).x0, 1e-9);
  D.align([a, b], 'vmiddle'); near((D.entBBox(a).y0 + D.entBBox(a).y1) / 2, (D.entBBox(b).y0 + D.entBBox(b).y1) / 2, 1e-9);
  D.align([a], 'axis'); near(D.entBBox(a).x0 + D.entBBox(a).x1, 0, 1e-9);
  const m = D.mirroredCopy(b), bb = D.entBBox(b), mb = D.entBBox({ ...m, id: 'x' });
  near(mb.x0, -bb.x1, 1e-6); near(mb.x1, -bb.x0, 1e-6);
  const r = JSON.parse(JSON.stringify(a)); const before = D.entBBox(r);
  D.rotateEnt(r, 90); D.rotateEnt(r, 90); D.rotateEnt(r, 180); const after = D.entBBox(r);
  for (const k of ['x0', 'y0', 'x1', 'y1']) near(after[k], before[k], 1e-9);
  D.translateEnt(r, 5, -3); near(D.entBBox(r).x0, before.x0 + 5, 1e-9);
  const dim = { t: 'dim', a: [0, 0], b: [0, 100], off: 10 }; D.rotateEnt(dim, 37); near(D.dimGeom(dim).L, 100, 1e-9);
});

t('10. İsabet ve yakalama: gizli / kilitli katman seçilmez; köşeye ve orta eksene yakalanır; ızgara 5 mm', () => {
  const sk = D.createSketch({});
  const e = D.addEnt(sk, 'front', { t: 'path', path: C.polyPath([[0, 0], [100, 0]]), sym: true });
  assert.equal(D.hitTest(sk, 'front', [50, 2], 3)?.id, e.id);
  assert.equal(D.hitTest(sk, 'front', [-60, 1], 3)?.id, e.id, 'aynalı kopya da seçilir');
  assert.equal(D.hitTest(sk, 'front', [50, 10], 3), null);
  sk.views.front.layers[0].locked = true; assert.equal(D.hitTest(sk, 'front', [50, 2], 3), null);
  sk.views.front.layers[0].locked = false; sk.views.front.layers[0].visible = false; assert.equal(D.hitTest(sk, 'front', [50, 2], 3), null);
  sk.views.front.layers[0].visible = true;
  assert.deepEqual(D.snap(sk, 'front', [98.5, 1], 3).p, [100, 0]);
  assert.deepEqual(D.snap(sk, 'front', [-98.5, 1], 3).p, [-100, 0]);
  assert.deepEqual(D.snap(sk, 'front', [1.2, 40], 3).p, [0, 40]);
  assert.deepEqual(D.snap(sk, 'front', [42.4, 57.6], 3, 5).p, [40, 60]);
  assert.throws(() => { sk.views.front.layers[0].locked = true; D.addEnt(sk, 'front', { t: 'point', p: [0, 0] }, 'L1'); }, /kilitli/);
});

t('11. Doğrulama: NaN koordinat, iki ucu aynı ölçü, bilinmeyen detay, yinelenen kimlik, geçersiz yazı boyu yakalanır', () => {
  const sk = D.createSketch({ name: 'b' }), L = sk.views.front.layers[0];
  L.ents.push({ id: 'e1', t: 'path', path: C.polyPath([[0, 0], [NaN, 5]]) }, { id: 'e2', t: 'dim', a: [1, 1], b: [1, 1] }, { id: 'e3', t: 'detail', kind: 'uçak', p: [0, 0], k: 1 }, { id: 'e3', t: 'text', p: [0, 0], text: 'x', size: 0 }, { id: 'e5', t: 'balon' });
  const m = D.validateSketch(sk).map((x) => x.msg).join('\n');
  for (const re of [/e1: geçersiz koordinat/, /e2: ölçünün iki ucu aynı/, /bilinmeyen detay uçak/, /e3: yinelenen kimlik/, /yazı boyu geçersiz/, /bilinmeyen varlık türü balon/]) assert.match(m, re);
  for (const k of Object.keys(D.DETAILS)) { const e = { t: 'detail', kind: k, p: [0, 0], k: 1, rot: 30 }; const ps = D.entityPaths(e); assert.ok(ps.length && ps.every((s) => C.finitePath(s.path) && s.path.segs.length), k); }
});

/* ---------- çıktılar ---------- */
t('12. SVG: 1 birim = 1 mm (width / height mm ve viewBox aynı boyutta); yol ve ölçü yazısı var; Türkçe karakter korunur', () => {
  const sk = D.createSketch({ name: 'Gömlek çizimi' }); D.applyTemplate(sk, 'gomlek', {});
  const s = X.toSVG(sk, 'front', { margin: 15 }), b = D.viewBBox(sk, 'front');
  const m = s.match(/width="([\d.]+)mm" height="([\d.]+)mm" viewBox="([-\d.]+) ([-\d.]+) ([\d.]+) ([\d.]+)"/);
  assert.ok(m); near(+m[1], +m[5], 1e-9); near(+m[2], +m[6], 1e-9); near(+m[1], b.x1 - b.x0 + 30, 1e-3);
  assert.match(s, /stroke-dasharray="2.5 1.5"/); assert.match(s, /Göğüs 53,0 cm/); assert.match(s, /Gömlek çizimi/);
  assert.ok(!/NaN|undefined/.test(s));
});

t('13. PDF: geçerli yapı (xref ofsetleri doğru), 1:1 ölçekte 100 mm çizgi kağıtta tam 100 mm (283,465 pt); 1:5 ölçekte 20 mm; Türkçe harfler kodlanır', () => {
  const sk = D.createSketch({ name: 'Ölçek testi' });
  D.addEnt(sk, 'front', { t: 'path', path: C.polyPath([[0, 0], [100, 0]]), w: 0.3 });
  D.addEnt(sk, 'front', { t: 'text', p: [0, 20], text: 'Dikiş ğüşıöçİĞŞ', size: 5 });
  for (const [scale, mm] of [[1, 100], [5, 20]]) {
    const r = X.toPDF(sk, { views: ['front'], scale, meta: { product: 'Kazak' } });
    const txt = Buffer.from(r.bytes).toString('latin1');
    assert.match(txt, /^%PDF-1\.4/); assert.match(txt, /%%EOF\n$/);
    const xref = +txt.match(/startxref\n(\d+)/)[1]; assert.equal(txt.slice(xref, xref + 4), 'xref');
    const offs = [...txt.slice(xref).matchAll(/^(\d{10}) 00000 n $/gm)].map((x) => +x[1]);
    offs.forEach((o, i) => assert.equal(txt.slice(o, o + String(i + 1).length + 6), `${i + 1} 0 obj`));
    const segs = [...txt.matchAll(/([-\d.]+) ([-\d.]+) m ([-\d.]+) ([-\d.]+) l S/g)].map((x) => Math.hypot(x[3] - x[1], x[4] - x[2]));
    assert.ok(segs.some((L) => Math.abs(L - mm * 72 / 25.4) < 0.01), `${mm} mm çizgi yok (1:${scale})`);
    assert.ok(segs.some((L) => Math.abs(L - 50 * 72 / 25.4) < 0.01), '50 mm kontrol çubuğu');
    assert.ok(txt.includes('(\\326l\\347ek 1:' + scale + ')'), 'ölçek yazısı (Ö, ç kodlu)');
    assert.match(txt, /\\200/); assert.match(txt, /\\202/); assert.match(txt, /\\204/); assert.match(txt, /\\205/);
    assert.match(txt, /\/Differences \[128 \/gbreve/);
    assert.equal(r.scale, scale); assert.equal(r.fits, true);
  }
  // otomatik ölçek: 1 m'lik pantolon A4 yatay 1:1'e sığmaz → standart ölçeklerden ilki
  const ps = D.createSketch({}); D.applyTemplate(ps, 'pantolon', {});
  const r2 = X.toPDF(ps, { views: ['front', 'back'] }); assert.ok([5, 10].includes(r2.scale) && r2.fits, 'ölçek ' + r2.scale);
  assert.equal(X.toPDF(ps, { views: ['front', 'back'], scale: 1 }).fits, false);
});

/* ---------- proje ile birlikte ---------- */
t('14. Projede çizim: ürüne bağlanır, dal ürünle aynı; kaydet / aç / JSON gidiş-dönüşte çizim aynen korunur; silinen ürün işaretlenir', async () => {
  const p = M.createProject({ name: 'Ç', type: 'mixed' });
  const k = M.addProduct(p, { branch: 'knit', type: 'kazak' });
  const sk = M.addSketch(p, { product: k.id }); assert.equal(sk.branch, 'knit'); assert.match(sk.name, /Kazak/);
  D.applyTemplate(sk, 'kazak', {});
  D.addEnt(sk, 'side', { t: 'path', path: C.smoothPath([[0, 0], [20, 30], [10, 60]]), stroke: 'stitch' });
  assert.deepEqual(M.validate(p).filter((x) => x.level === 'hata'), []);
  const S = openStore(memoryBackend()); await S.commit(p, 'çizim');
  const q = await S.get(p.id); assert.deepEqual(q.sketches, p.sketches);
  const r = await S.importJSON(S.exportJSON(p)); assert.deepEqual(r.sketches, p.sketches);
  // dal uyumsuz şablon uyarısı
  const w = M.addProduct(p, { branch: 'woven', type: 'gomlek' }), s2 = M.addSketch(p, { product: w.id }); D.applyTemplate(s2, 'kazak', {});
  assert.ok(M.validate(p).some((x) => x.level === 'uyarı' && /şablonu Triko/.test(x.msg)));
  p.collection.products = p.collection.products.filter((x) => x.id !== k.id);
  assert.ok(M.validate(p).some((x) => x.level === 'hata' && /ürün silinmiş/.test(x.msg)));
  assert.throws(() => M.addSketch(p, { product: 'p999' }), /bulunamadı/);
});

for (const [name, fn] of tests) {
  try { await fn(); console.log('ok   ', name); }
  catch (e) { fail++; console.log('FAIL ', name, '\n     ', String(e.message).split('\n')[0]); }
}
console.log(fail ? `\n${fail} test başarısız` : '\nTüm testler geçti');
process.exit(fail ? 1 : 0);
