// Çalıştır: node tests/ayk-kalip.test.mjs
// Ayakkabı Modelhanesi — kalıp fotoğrafından ölçülü kalıp çizgisi ve model resmi kayıtları.
// Sentetik fotoğraflar: perspektifli kâğıt üstünde bilinen ölçüde nesne; sonuç mm olarak karşılaştırılır.
import assert from 'node:assert/strict';
import * as L from '../ayk/last.js';
import * as M from '../ayk/model.js';
import * as G from '../ayk/geom.js';
import { lastItems } from '../ayk/build.js';
import { scene } from './fixtures/kalip-sahne.mjs';

const tests = [];
const t = (name, fn) => tests.push([name, fn]);
const near = (a, b, tol, m = '') => assert.ok(Math.abs(a - b) <= tol, `${m} ${a} ≉ ${b} (±${tol})`);

t('1. Koyu kalıp, beyaz A4, eğik çekim: boy ve yükseklik ±1 mm', () => {
  const s = scene({ rx: 130, ry: 50 });
  const r = L.analyzeLast(s.rgba, s.w, s.h, { paper: 'A4' });
  assert.equal(r.ok, true, r.error);
  near(r.length, 260, 1, 'boy'); near(r.height, 100, 1, 'yükseklik');
  assert.ok(r.outline.closed && r.outline.nodes.length >= 20 && r.outline.nodes.length < 400, 'sade kapalı çizgi: ' + r.outline.nodes.length);
  const b = G.bbox(r.outline); near(b.x0, 0, 0.01); near(b.y0, 0, 0.01);
  assert.deepEqual(r.warnings, []);
});

t('2. Beyaz kalıp, mavi kâğıt: renk farkıyla ayrılır', () => {
  const s = scene({ rx: 120, ry: 45, last: [236, 233, 226], paper: [110, 165, 230] });
  const r = L.analyzeLast(s.rgba, s.w, s.h, { paper: 'A4' });
  assert.equal(r.ok, true, r.error); near(r.length, 240, 1); near(r.height, 90, 1);
});

t('3. Dikey çekilmiş kâğıt (portre) ve A3: uzun kenar yatay alınır, ölçü doğru', () => {
  const s = scene({ portrait: true, paperMm: [420, 297], rx: 140, ry: 55, w: 900, h: 1200 });
  const r = L.analyzeLast(s.rgba, s.w, s.h, { paper: 'A3' });
  assert.equal(r.ok, true, r.error); near(r.length, 280, 1.5); near(r.height, 110, 1.5);
});

t('4. Kâğıt yoksa ve kâğıtta kalıp yoksa anlaşılır hata', () => {
  const w = 300, h = 200, flat = new Uint8ClampedArray(w * h * 4).fill(90);
  const a = L.analyzeLast(flat, w, h); assert.equal(a.ok, false); assert.match(a.error, /Kâğıt bulunamadı/);
  const s = scene({ rx: 0, ry: 0 });
  const b = L.analyzeLast(s.rgba, s.w, s.h); assert.equal(b.ok, false); assert.match(b.error, /kalıp bulunamadı/i);
});

t('5. Kâğıda sığmayan kalıp uyarı verir; yanlış kâğıt boyu seçimi uyarı verir', () => {
  const s = scene({ rx: 150, ry: 50 });
  const r = L.analyzeLast(s.rgba, s.w, s.h, { paper: 'A4' });
  assert.equal(r.ok, true); assert.ok(r.warnings.some((x) => /kenarına değiyor/.test(x)), r.warnings.join());
  const q = scene({ rx: 100, ry: 40, quad: [[100, 330], [1100, 330], [1100, 560], [100, 560]] });   // A4 seçili ama fotoğraftaki kâğıt çok uzun ve dar
  const r2 = L.analyzeLast(q.rgba, q.w, q.h, { paper: 'A4' });
  assert.ok(r2.ok && r2.warnings.some((x) => /oranı/.test(x)), r2.warnings?.join());
});

t('6. Hassasiyet ayarı çizgiyi bozmaz; bilinen boyla ölçek düzeltmesi tam boyu verir', () => {
  const s = scene({ rx: 130, ry: 50 });
  for (const sens of [-5, 0, 5]) { const r = L.analyzeLast(s.rgba, s.w, s.h, { sens }); assert.equal(r.ok, true); near(r.length, 260, 2, 'hassasiyet ' + sens); }
  const r = L.analyzeLast(s.rgba, s.w, s.h);
  const v = L.scaleView({ ...r, k: 3, scale: 1 }, 268 / r.length);
  near(v.length, 268, 1e-6); near(G.bbox(v.outline).x1, 268, 0.01); near(v.k, 3 * r.length / 268, 1e-9); assert.ok(v.scale > 1);
});

t('7. Proje kaydı: kalıp ve model resmi alanları; yalnız jpeg/png/webp kabul edilir, sınırlar uygulanır', () => {
  const s = scene({ rx: 130, ry: 50 });
  const r = L.analyzeLast(s.rgba, s.w, s.h);
  const img = 'data:image/jpeg;base64,AAAA';
  const v = M.makeLastView({ img, k: 3, w: r.rec.w, h: r.rec.h, outline: r.outline, imgAt: r.imgAt, length: r.length, height: r.height, sens: 99 });
  assert.equal(v.sens, 5, 'hassasiyet sınırı'); assert.equal(v.paper, 'A4');
  for (const bad of ['data:image/svg+xml;base64,PHN2Zz4=', 'javascript:alert(1)', 'data:text/html;base64,AAAA', 'data:image/png;base64,AA<script>']) {
    assert.equal(M.makeLastView({ img: bad, outline: r.outline }), null, bad);
    assert.equal(M.makeModelRef({ photos: [{ img: bad }] }).photos.length, 0, bad);
  }
  const many = M.makeModelRef({ photos: Array.from({ length: 9 }, () => ({ img })), note: 'x'.repeat(900) });
  assert.equal(many.photos.length, M.MAX_MODEL_PHOTOS); assert.equal(many.note.length, 500);
  const last = M.makeLast({ name: 'K-41', lengthMm: 9999, views: { yan: v, alt: { ...v, at: [0, 0] } } });
  assert.equal(last.lengthMm, null, 'saçma boy atılır');
  M.placeLastViews(last);
  const yb = last.views.yan.at[1] + last.views.yan.imgAt[1] + last.views.yan.h / last.views.yan.k, at = last.views.alt.at[1] + last.views.alt.imgAt[1];
  near(at - yb, 15, 1e-3, 'alt görünüşün fotoğrafı yanınkinin 15 mm altında');
});

t('8. Eski proje (kalıp alanı yok) açılır; kalıp çizgisi stampada referans katmanında, ölçüsüyle', () => {
  const p = M.migrate({ kind: M.KIND, name: 'Eski', pieces: [] });
  assert.deepEqual(p.last.views, { yan: null, alt: null }); assert.deepEqual(p.modelRef.photos, []);
  assert.deepEqual(lastItems(p), []);
  const s = scene({ rx: 130, ry: 50 }); const r = L.analyzeLast(s.rgba, s.w, s.h);
  p.last = M.makeLast({ views: { yan: { img: 'data:image/jpeg;base64,AAAA', k: 3, w: 10, h: 10, outline: r.outline, imgAt: r.imgAt, at: [5, 7], length: r.length, height: r.height } } });
  const it = lastItems(p);
  assert.equal(it.length, 2); assert.ok(it.every((x) => x.layer === 'referans'));
  assert.match(it[1].s, /Kalıp yan görünüşü · 2(59|60),\d × (99|100),\d mm/);
  const json = JSON.stringify(p); const back = M.migrate(json);
  assert.equal(back.last.views.yan.outline.nodes.length, r.outline.nodes.length, 'kayıt → açılış korunur');
});

let fail = 0;
for (const [name, fn] of tests) {
  try { await fn(); console.log('ok   ' + name); }
  catch (e) { fail++; console.log('FAIL ' + name + '\n     ' + (e.stack || e).toString().split('\n').slice(0, 4).join('\n     ')); }
}
console.log(`\n${tests.length - fail}/${tests.length} geçti`);
process.exit(fail ? 1 : 0);
