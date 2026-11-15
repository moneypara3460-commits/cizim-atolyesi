// Çalıştır: node tests/ayk-aiparts.test.mjs
// Ayakkabı Modelhanesi — kesim matı fotoğrafından kalıp çizgisi ve yapay zekânın çıkardığı parçaları kalıba oturtma.
import assert from 'node:assert/strict';
import * as M from '../ayk/model.js';
import * as L from '../ayk/last.js';
import * as P from '../ayk/aiparts.js';
import { checkPiece, netPolygon } from '../ayk/build.js';
import { lastView } from './fixtures/kalip-siluet.mjs';

const tests = [];
const t = (name, fn) => tests.push([name, fn]);

// sentetik mat: koyu yeşil, açık ızgara (her px = 0.5 mm → 10 mm kare = 20 px), üstünde zeytin rengi elips kalıp
function matImage({ w = 700, h = 420, px = 20, ang = 0 } = {}) {
  const a = new Uint8ClampedArray(w * h * 4), c = Math.cos(ang), s = Math.sin(ang);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const o = (y * w + x) * 4, line = x % px < 2 || y % px < 2;
    let r = line ? 120 : 30, g = line ? 170 : 95, b = line ? 150 : 80;
    const dx = x - w / 2, dy = y - h / 2, u = c * dx + s * dy, v = -s * dx + c * dy;
    if ((u / 260) ** 2 + (v / 90) ** 2 < 1) { const sh = v > 40 ? 0.6 : 1; r = 170 * sh; g = 160 * sh; b = 70 * sh; }
    a[o] = r; a[o + 1] = g; a[o + 2] = b; a[o + 3] = 255;
  }
  return { a, w, h };
}

t('1. Kesim matı: ölçek ızgaradan bulunur, kalıp (gölgeli alt yarısıyla) ayrılır: boy 260 mm ±3', () => {
  const { a, w, h } = matImage();
  const r = L.analyzeMat(a, w, h);
  assert.ok(r.ok, r.error);
  assert.ok(Math.abs(r.rec.k - 2) < 0.05, 'k=' + r.rec.k);
  assert.ok(Math.abs(r.length - 260) < 3, 'boy ' + r.length);
  assert.ok(Math.abs(r.height - 90) < 3, 'yükseklik ' + r.height);
});
t('2. Kesim matı: eğik duran kalıp yataya çevrilir', () => {
  const { a, w, h } = matImage({ w: 760, h: 560, ang: 0.35 });
  const r = L.analyzeMat(a, w, h);
  assert.ok(r.ok, r.error);
  assert.ok(Math.abs(r.length - 260) < 5, 'boy ' + r.length);
  assert.ok(r.warnings.some((x) => /eğikti/.test(x)));
});
t('3. Mat yoksa (düz renk) anlaşılır hata', () => {
  const w = 300, h = 200, a = new Uint8ClampedArray(w * h * 4).fill(128);
  const r = L.analyzeMat(a, w, h);
  assert.equal(r.ok, false); assert.match(r.error, /kareli/);
});

// yapay zekâ yanıtı örneği (sunucudan gelen biçim): x mm, y tabandan mm
function aiSample(view) {
  const info = P.lastInfo(view), Lm = info.L;
  const H = (x) => { const T = info.top; for (let i = 1; i < T.length; i++) if (x <= T[i][0]) { const f = (x - T[i - 1][0]) / (T[i][0] - T[i - 1][0] || 1); return T[i - 1][1] + f * (T[i][1] - T[i - 1][1]); } return T[T.length - 1][1]; };
  return M.makeAiParts({ model: 'spor', confidence: 'medium', pieces: [
    { name: 'Ön saya', layer: 0, poly: [[0.55 * Lm, H(0.55 * Lm)], [0.8 * Lm, H(0.8 * Lm)], [Lm - 2, H(Lm - 2)], [Lm - 2, 0], [0.55 * Lm, 0]] },
    { name: 'Yan saya', layer: 0, poly: [[0, 0], [0, 0.7 * H(1)], [0.3 * Lm, 0.6 * H(0.3 * Lm)], [0.56 * Lm, H(0.56 * Lm) - 12], [0.56 * Lm, 0]] },
    { name: 'Bağcık yeri', layer: 1, poly: [[0.35 * Lm, H(0.35 * Lm) - 10], [0.56 * Lm, H(0.56 * Lm) - 8], [0.58 * Lm, H(0.58 * Lm) - 25], [0.36 * Lm, H(0.36 * Lm) - 32]], holes: [[0.42 * Lm, H(0.42 * Lm) - 18], [0.5 * Lm, H(0.5 * Lm) - 16]], holeD: 5 },
    { name: 'Logo yeri', layer: 1, poly: [[0.3 * Lm, 15], [0.45 * Lm, 15], [0.45 * Lm, 35], [0.3 * Lm, 35]] },
  ] });
}
t('4. Parçalar kalıba oturur: kenar türleri, delikler, astar ve sertlikler; hiçbir parçada geometri hatası yok', () => {
  const p = M.createProject({ name: 'yz' }); p.last.views.yan = lastView();
  const r = P.generateAi(p, aiSample(p.last.views.yan));
  const names = r.pieces.map((pc) => pc.name);
  for (const n of ['Ön saya', 'Yan saya', 'Bağcık yeri', 'Logo yeri', 'Ön astar', 'Arka astar', 'Kontrfort (topuk sertliği)', 'Burun sertliği']) assert.ok(names.includes(n), n + ' yok: ' + names);
  const kinds = (n) => Object.values(r.pieces.find((pc) => pc.name === n).edges).map((e) => e.kind);
  assert.ok(kinds('Ön saya').includes('montaj') && kinds('Ön saya').includes('yok'), 'ön saya: ' + kinds('Ön saya'));
  assert.ok(kinds('Yan saya').includes('dikis') && kinds('Yan saya').includes('montaj'), 'yan saya: ' + kinds('Yan saya'));
  assert.ok(kinds('Bağcık yeri').includes('katlama'), 'bağcık yeri alttaki parçaya biner');
  const by = r.pieces.find((pc) => pc.name === 'Bağcık yeri');
  assert.equal(by.marks.filter((m) => m.kind === 'delik').length, 2);
  // hizalama: bağcık yerinin binen kenarında çentik, alttaki parçada aynı harfle işaret
  const cn = by.marks.filter((m) => m.kind === 'centik');
  assert.ok(cn.length >= 1 && cn.every((m) => m.label), 'bağcık yerinde çentik yok');
  const other = r.pieces.filter((pc) => pc !== by).flatMap((pc) => pc.marks).filter((m) => m.label === cn[0].label);
  assert.equal(other.length, 1, 'karşı parçada aynı harfli işaret');
  for (const pc of r.pieces) {
    const bad = checkPiece(pc).filter((x) => x.level === 'hata' || /kesiyor|geometri|dışında/.test(x.msg || ''));
    assert.equal(bad.length, 0, pc.name + ': ' + bad.map((x) => x.msg).join(', '));
    assert.ok(netPolygon(pc).length >= 3);
  }
});
t('5. İç yan fotoğrafı varsa tabana inen yan parçaların iç yan eşi çıkar; orta çizgili parçalar tek kalır', () => {
  const p = M.createProject({ name: 'yz' }); p.last.views.yan = lastView(); p.last.views.ic = lastView();
  const r = P.generateAi(p, aiSample(p.last.views.yan));
  const names = r.pieces.map((pc) => pc.name);
  assert.ok(names.includes('Yan saya (dış yan)') && names.includes('Yan saya (iç yan)'), names.join(', '));
  assert.ok(names.includes('Ön saya') && !names.includes('Ön saya (iç yan)'));
});
t('6. Kayıt: yapay zekâ parçaları güvenli biçime getirilir (sınırlar, yasak karakter)', () => {
  const a = M.makeAiParts({ pieces: [{ name: '<b>x</b>', kind: 'zz', layer: 99, poly: [[1, 2], [3, 'a'], [1e9, 4], [5, 6], [7, 8]] }], confidence: 'çok' });
  assert.equal(a.pieces[0].name, 'bx/b'); assert.equal(a.pieces[0].kind, 'ust'); assert.equal(a.pieces[0].layer, 9);
  assert.equal(a.pieces[0].poly.length, 4); assert.equal(a.confidence, 'low');
  assert.equal(M.makeAiParts({ pieces: [] }), null);
});

let fail = 0;
for (const [name, fn] of tests) {
  try { await fn(); console.log('ok   ' + name); }
  catch (e) { fail++; console.log('FAIL ' + name + '\n     ' + (e.stack || e).toString().split('\n').slice(0, 4).join('\n     ')); }
}
console.log(`\n${tests.length - fail}/${tests.length} geçti`);
process.exit(fail ? 1 : 0);
