// Çalıştır: node tests/ayk-last3d.test.mjs
// Ayakkabı Modelhanesi — 3D kalıp (STL / OBJ): okuma, birim, yön, sadeleştirme, saklama, görünüşler, numara denetimi.
import assert from 'node:assert/strict';
import * as M from '../ayk/model.js';
import * as T from '../ayk/last3d.js';
import * as AUTO from '../ayk/auto.js';
import { checkPiece } from '../ayk/build.js';
import { openStore, memoryBackend } from '../ayk/store.js';
import { run as workerRun } from '../ayk/last3d-worker.js';
import { lastMesh, transform, toSTLBinary, toSTLAscii, toOBJ, flipWinding } from './fixtures/kalip-3d.mjs';

const tests = [];
const t = (name, fn) => tests.push([name, fn]);
const base = lastMesh({ L: 265 });
const idx = (m) => ({ V: Float32Array.from(m.V.flat()), F: Uint32Array.from(m.F.flat()) });
const ref = T.dims(T.orient(idx(base)).mesh);   // yönlendirilmiş asıl ölçüler
const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} ≠ ${b} (±${tol})`);
// konç tepesi (asıl modelde en yüksek nokta) ve burun ucu (en ileri nokta): yönlendirmeden sonra nereye gittikleri
const topI = base.V.reduce((b, p, i) => (p[2] > base.V[b][2] ? i : b), 0), toeI = base.V.reduce((b, p, i) => (p[0] > base.V[b][0] ? i : b), 0);

t('1. STL: ikili (başı "solid" ile başlasa da), yazı biçimli; OBJ: dörtgen yüz, eksi sıra, v/vt/vn; bozuk dosyalar anlaşılır hatayla reddedilir', () => {
  const nT = base.F.length;
  const bin = T.parseSTL(toSTLBinary(base)), asc = T.parseSTL(new TextEncoder().encode(toSTLAscii(base)));
  assert.equal(bin.length, nT * 9); assert.equal(asc.length, nT * 9);
  for (let i = 0; i < bin.length; i += 997) near(asc[i], bin[i], 1e-3, 'yazı / ikili aynı');
  const obj = T.parseOBJ(toOBJ(base, { quads: true })), obj2 = T.parseOBJ(toOBJ(base));
  assert.equal(obj.length, nT * 9); assert.equal(obj2.length, nT * 9);
  assert.equal(T.parseMeshFile('k.OBJ', new TextEncoder().encode(toOBJ(base))).length, nT * 9);
  assert.equal(T.parseMeshFile('adsız', toSTLBinary(base)).length, nT * 9);
  assert.throws(() => T.parseSTL(new TextEncoder().encode('merhaba')), /STL dosyası okunamadı/);
  assert.throws(() => T.parseSTL(new TextEncoder().encode('solid x\nendsolid x')), /üçgen bulunamadı/);
  assert.throws(() => T.parseOBJ('v 0 0 0\nv 1 0 0\nf 1 2 9'), /geçersiz yüz/);
  assert.throws(() => T.parseOBJ('v 0 0 0'), /yüz \(f\) bulunamadı/);
  assert.throws(() => T.prepare(Float32Array.from([0, 0, 0, NaN, 0, 0, 0, 1, 0])), /geçersiz sayı/);
});

t('2. Birim: kalıp boyu 80–450 mm aralığına düşen birim; hem cm hem inç olabilen ölçüde numaradan beklenen boy seçer', () => {
  const P = T.parseSTL(toSTLBinary(base));
  assert.equal(T.guessUnit(P).unit, 'mm');
  assert.equal(T.guessUnit(P.map((c) => c / 10)).unit, 'cm');
  assert.equal(T.guessUnit(P.map((c) => c / 1000)).unit, 'm');
  const inch = P.map((c) => c / 25.4);   // 10,5: cm sayılırsa 105 mm, inç sayılırsa 267 mm
  assert.equal(T.guessUnit(inch).unit, 'cm');
  assert.equal(T.guessUnit(inch, 266.7).unit, 'in');
  assert.equal(T.guessUnit(P.map((c) => c / 10), 266.7).unit, 'cm');
  const g = T.guessUnit(P.map((c) => c * 100)); assert.equal(g.sure, false);
});

t('3. Yön: 12 farklı duruş ve ters (içe bakan) üçgen sırası → taban altta, konç yukarıda topuk tarafında, burun +x; iç yan tahmini doğru; ölçü değişmez', () => {
  for (const inv of [false, true]) for (const rot of [[0, 0, 0], [0.3, 1.2, -2.1], [2.5, -0.4, 0.9], [Math.PI, 0, 0], [Math.PI / 2, 0, Math.PI], [1, 2, 3]]) {
    let m = transform(base, { rot, move: [5, -6, 7] }); if (inv) m = flipWinding(m);
    const o = T.orient(idx(m)), P = (i) => [o.mesh.V[3 * i], o.mesh.V[3 * i + 1], o.mesh.V[3 * i + 2]], d = T.dims(o.mesh), tag = (inv ? 'ters ' : '') + rot.map((v) => v.toFixed(1));
    assert.ok(P(topI)[2] > 0.9 * d.height && P(topI)[0] < 0.25 * d.length, tag + ': konç ' + P(topI));
    assert.ok(P(toeI)[0] > d.length - 1, tag + ': burun ' + P(toeI));
    assert.equal(o.outer, 1, tag + ': burun −y yanına kaçık → dış yan +y');
    near(d.length, ref.length, 0.2, tag + ' boy'); near(d.width, ref.width, 0.2, tag + ' genişlik'); near(d.height, ref.height, 0.2, tag + ' yükseklik');
  }
  // ayna kalıp (sol ayak): dış yan tahmini ters döner
  const mir = { V: base.V.map(([x, y, z]) => [x, -y, z]), F: base.F.map(([a, b, c]) => [a, c, b]) };
  assert.equal(T.orient(idx(mir)).outer, -1);
});

t('4. Çevirme düğmeleri: burun/topuk ve taban/üst 180° döndürür (iki kez → ilk hâl), 90° dört kez → ilk hâl; ölçüler korunur', () => {
  const m = T.orient(idx(base)).mesh, d = T.dims(m);
  for (const fn of [T.flipToe, T.flipSole]) { const a = fn(m), b = fn(a); near(T.dims(a).length, d.length, 1e-3, 'boy'); for (let i = 0; i < m.V.length; i += 211) near(b.V[i], m.V[i], 1e-3, 'iki kez'); }
  const r1 = T.rot90(m); near(T.dims(r1).height, d.width, 1e-3, '90°: yükseklik = genişlik'); near(T.dims(r1).width, d.height, 1e-3, '90°');
  const r4 = T.rot90(T.rot90(T.rot90(r1)));
  for (let i = 0; i < m.V.length; i += 211) near(r4.V[i], m.V[i], 1e-3, '360°');
  const t1 = T.flipToe(m); assert.ok(t1.V[3 * topI + 0] > 0.75 * d.length, 'topuk sağa geçti');
});

t('5. Sadeleştirme: ~500 000 üçgenlik kalıp en çok 60 000 üçgene iner; ölçü sapması < 0,4 mm; kapalılık asıl yüzeyde denetlenir', () => {
  const big = lastMesh({ L: 265, nx: 500, nt: 500 });
  const P = T.parseSTL(toSTLBinary(transform(big, { rot: [0.4, 1, 2] })));
  const r = T.prepare(P), full = T.dims(T.orient(idx(big)).mesh);
  assert.ok(r.tris <= T.STORE_TRIS && r.inTris === big.F.length, r.tris + ' / ' + r.inTris);
  near(r.dims.length, full.length, 0.4, 'boy'); near(r.dims.width, full.width, 0.4, 'genişlik'); near(r.dims.height, full.height, 0.4, 'yükseklik');
  assert.ok(r.check.closed && r.check.open === 0, JSON.stringify(r.check));
  // açık yüzey: bir kapağı eksik dosya açık kenar sayısıyla bildirilir
  const open = { V: base.V, F: base.F.slice(0, base.F.length - 48) };
  const ro = T.prepare(T.parseSTL(toSTLBinary(open)));
  assert.equal(ro.check.open, 48);
});

t('6. Saklama: 16 bit nicemleme (hata < kutu / 65535), bozuk / şişirilmiş kayıt reddedilir; proje kaydında ve depoda korunur', async () => {
  const r = T.prepare(T.parseSTL(toSTLBinary(base))), e = T.encodeMesh(r.mesh), d = T.decodeMesh(e), b = T.box(r.mesh);
  let worst = 0; for (let i = 0; i < d.V.length; i++) worst = Math.max(worst, Math.abs(d.V[i] - r.mesh.V[i]));
  assert.ok(worst <= (b[3] - b[0]) / 65535 + 1e-4, 'nicemleme hatası ' + worst);
  assert.deepEqual([...d.F], [...r.mesh.F]);
  const ok = T.sanitizeStored({ ...e, name: '<b>k</b>.stl', unit: 'mm', outer: -1 });
  assert.ok(ok && ok.name === 'bk/b.stl' && ok.outer === -1);
  assert.equal(T.sanitizeStored({ ...e, n: e.n + 1 }), null, 'köşe sayısı tutmuyor');
  assert.equal(T.sanitizeStored({ ...e, pos: e.pos.slice(4) }), null, 'kısa veri');
  assert.equal(T.sanitizeStored({ ...e, idx: e.idx.replace(/A/, '*') }), null, 'base64 değil');
  assert.equal(T.sanitizeStored({ ...e, bb: [0, 0, 0, 1, 1] }), null);
  assert.equal(T.sanitizeStored({ ...e, n: 5e6 }), null, 'şişirilmiş');
  assert.equal(T.sanitizeStored('x'), null);
  // proje: migrate ve depo
  const p = M.createProject({ name: '3d', last: { mesh: { ...e, name: 'k.stl', unit: 'cm', inTris: 9000, outer: -1, open: 0 } } });
  assert.ok(p.last.mesh && p.last.mesh.unit === 'cm');
  const st = openStore(memoryBackend()); await st.commit(p, 'ilk');
  const back = await st.get(p.id);
  assert.equal(back.last.mesh.pos, e.pos); assert.equal(back.last.mesh.outer, -1);
  const imp = await st.importJSON(st.exportJSON(p)); assert.equal(imp.last.mesh.idx, e.idx, 'JSON yedeğinde de var');
  assert.equal(M.migrate({ ...p, last: { ...p.last, mesh: { ...e, pos: 'bozuk!' } } }).last.mesh, null, 'bozuk kayıt projeyi açtırır, kalıp düşer');
});

t('7. Görünüşler: dış yan, iç yan, alt, üst; boy / yükseklik / genişlik 3D ölçüyle ±0,15 mm; iç yan dış yanın aynası', () => {
  const r = T.prepare(T.parseSTL(toSTLBinary(transform(base, { rot: [1, 2, 3] })))), V = T.allViews(r.mesh, r.outer), d = r.dims;
  for (const id of ['yan', 'ic', 'alt', 'ust']) { near(V[id].length, d.length, 0.15, id + ' boy'); assert.ok(V[id].outline.closed && V[id].outline.nodes.length > 50); }
  near(V.yan.height, d.height, 0.15, 'yan yükseklik'); near(V.alt.height, d.width, 0.15, 'alt genişlik'); near(V.ust.height, d.width, 0.15, 'üst genişlik');
  // ayna: dış yanın x'i ters çevrilince iç yanla örtüşür (alan farkı küçük)
  const area = (v) => { const P = v.outline.nodes.map((n) => n.p); let a = 0; for (let i = 0; i < P.length; i++) { const p = P[i], q = P[(i + 1) % P.length]; a += p[0] * q[1] - q[0] * p[1]; } return Math.abs(a / 2); };
  near(area(V.yan), area(V.ic), area(V.yan) * 0.003, 'iç / dış yan alanı');
  const hi = (v, left) => { const P = v.outline.nodes.map((n) => n.p); return Math.min(...P.filter((p) => (left ? p[0] < 0.3 * v.length : p[0] > 0.7 * v.length)).map((p) => p[1])); };
  assert.ok((hi(V.yan, false) < hi(V.yan, true)) !== (hi(V.ic, false) < hi(V.ic, true)), 'dış yanda ve iç yanda konç ters tarafta');
  // resim kalıbı kaplıyor
  const v = V.yan, k = v.rec.k;
  let painted = 0; for (let i = 0; i < v.rec.rgba.length; i += 4) if (v.rec.rgba[i] < 230) painted++;
  near(painted / (k * k), area(v), area(v) * 0.03, 'resimdeki kalıp alanı');
});

t('8. Yanlış birimde (metre) görünüş görüntüsü büyümez; 3D görünüşten derby parçaları hatasız çıkar (topuk yönü doğru)', () => {
  const r = T.prepare(T.parseSTL(toSTLBinary(base)));
  const big = T.rescale(r.mesh, 1000), v = T.viewFromMesh(big, 'yan', 1);
  assert.ok(v.rec.w <= 3001 && v.rec.h <= 3001, v.rec.w + '×' + v.rec.h);
  const V = T.allViews(r.mesh, r.outer), p = M.createProject({ name: 'd' });
  for (const id of Object.keys(V)) p.last.views[id] = M.makeLastView({ img: 'data:image/png;base64,AAAA', k: V[id].rec.k, w: V[id].rec.w, h: V[id].rec.h, outline: V[id].outline, imgAt: V[id].imgAt, length: V[id].length, height: V[id].height, src: '3d' });
  assert.equal(p.last.views.yan.src, '3d');
  const o = AUTO.guessOrientation(p.last.views.yan), f = AUTO.lastFrame(p.last.views.yan, o.flipX, o.flipY);
  // topuk (x=0 tarafı) konç yüksekliğinde olmalı
  assert.ok(f.bot(0.15 * f.L) - f.top(0.15 * f.L) > f.bot(0.85 * f.L) - f.top(0.85 * f.L), 'topuk yönü');
  const g = AUTO.generate(p, { type: 'derby' });
  assert.deepEqual(g.pieces.map((q) => q.name), ['Ön saya', 'Yan saya', 'Dil']);
  const bad = g.pieces.flatMap((q) => checkPiece(q).filter((i) => i.level === 'hata').map((i) => q.name + ': ' + i.msg));
  assert.equal(bad.length, 0, bad.join(', '));
});

t('9. Numara denetimi: EU (Paris noktası), UK, US, Mondopoint; eşikler ve birim önerisi', () => {
  near(T.expectedLength('40', 'EU').mm, 266.667, 0.01, 'EU 40');
  near(T.expectedLength('41,5', 'EU').mm, 276.667, 0.01, 'EU 41,5');
  near(T.expectedLength('7', 'UK').mm, 270.933, 0.01, 'UK 7');
  near(T.expectedLength('8', 'US').mm, 270.933, 0.01, 'US 8 = UK 7');
  const mp = T.expectedLength('250', 'Mondopoint (mm)'); assert.ok(mp.lo === 263 && mp.hi === 267);
  assert.equal(T.expectedLength('', 'EU'), null); assert.equal(T.expectedLength('kırk', 'EU'), null);
  assert.equal(T.sizeCheck(268, '40', 'EU').level, 'ok');
  assert.equal(T.sizeCheck(280, '40', 'EU').level, 'uyari');
  assert.equal(T.sizeCheck(265, '250', 'Mondopoint (mm)').level, 'ok');
  const h = T.sizeCheck(2670, '40', 'EU', 'cm');
  assert.equal(h.level, 'hata'); assert.match(h.msg, /milimetre seçilirse uyar/);
  const h2 = T.sizeCheck(105.1, '40', 'EU', 'cm'); assert.match(h2.msg, /inç seçilirse uyar/);
});

t('10. Arka plan işi (işçi ve sayfa aynı kod): hazırlama ve yön düğmeleri', () => {
  const out = workerRun('prepare', { name: 'k.stl', bytes: toSTLBinary(transform(base, { rot: [2, 1, 0], scale: 0.1 })), expectedMm: 266.7 });
  assert.equal(out.meta.unit, 'cm'); near(out.dims.length, ref.length, 0.3, 'boy');
  assert.deepEqual(Object.keys(out.views), ['yan', 'ic', 'alt', 'ust']);
  const s = workerRun('views', { enc: out.enc, outer: out.meta.outer, act: 'side' });
  assert.equal(s.outer, -out.meta.outer); assert.equal(s.enc, out.enc);
  const u = workerRun('views', { enc: out.enc, outer: 1, act: 'unit', factor: 0.1 });
  near(u.enc.bb[3] - u.enc.bb[0], (out.enc.bb[3] - out.enc.bb[0]) / 10, 0.01, 'birim');
  assert.throws(() => workerRun('sil', {}), /bilinmeyen iş/);
});

let fail = 0;
for (const [name, fn] of tests) {
  try { await fn(); console.log('ok   ' + name); }
  catch (e) { fail++; console.log('FAIL ' + name + '\n     ' + (e.stack || e).toString().split('\n').slice(0, 4).join('\n     ')); }
}
console.log(`\n${tests.length - fail}/${tests.length} geçti`);
process.exit(fail ? 1 : 0);
