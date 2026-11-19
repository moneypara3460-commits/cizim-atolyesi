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
function matImage({ w = 700, h = 420, px = 20, ang = 0, off = 0 } = {}) {
  const a = new Uint8ClampedArray(w * h * 4), c = Math.cos(ang), s = Math.sin(ang);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const o = (y * w + x) * 4, line = x % px < 2 || y % px < 2;
    let r = line ? 120 : 30, g = line ? 170 : 95, b = line ? 150 : 80;
    const dx = x - w / 2 - off, dy = y - h / 2 - off, u = c * dx + s * dy, v = -s * dx + c * dy;
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

// dönüş açılarının toplamı (derece): pürüzsüz kapalı eğride ≈ 360, basamaklı/tırtıklı eğride çok daha büyük
const turning = (Q) => { let t = 0; for (let i = 0; i < Q.length; i++) { const a = Q[(i - 1 + Q.length) % Q.length], b = Q[i], c = Q[(i + 1) % Q.length]; const d = Math.atan2(c[1] - b[1], c[0] - b[0]) - Math.atan2(b[1] - a[1], b[0] - a[0]); t += Math.abs(Math.atan2(Math.sin(d), Math.cos(d))); } return t * 180 / Math.PI; };
t('7. Kalıp çizgisi yumuşatma: piksel basamağı (0,5 mm) ve ±0,6 mm kenar gürültüsü en az %70 azalır, boyut korunur; gerçek köşe yuvarlanmaz', () => {
  // 40 mm yarıçaplı çember: 0,5 mm ızgaraya yuvarlanmış + sahte gürültü (kenar tırtığı)
  const Q = [];
  for (let i = 0; i < 720; i++) { const a = (i / 720) * 2 * Math.PI, n = 0.6 * Math.sin(i * 1.7) * Math.sin(i * 0.31); Q.push([Math.round((40 + n) * Math.cos(a) * 2) / 2, Math.round((40 + n) * Math.sin(a) * 2) / 2]); }
  const S = L.smoothLoop(Q, 0.5, 2);
  const r0 = Q.map(([x, y]) => Math.hypot(x, y)), r = S.map(([x, y]) => Math.hypot(x, y)), mean = r.reduce((a, b) => a + b, 0) / r.length;
  assert.ok(Math.max(...r0) - Math.min(...r0) > 1.4, 'girdi tırtıklı olmalı');
  const in0 = Math.max(...r0) - Math.min(...r0), out = Math.max(...r) - Math.min(...r);
  assert.ok(out < 0.3 * in0 && out < 0.45, 'tırtık kaldı: girdi ' + in0.toFixed(2) + ' mm, çıktı ' + out.toFixed(2) + ' mm');
  assert.ok(Math.abs(mean - 40) < 0.1, 'boyut değişti: ' + mean.toFixed(3));
  // kare (40 mm, keskin köşeli): köşeler korunur, kenarlar düz kalır
  const sq = []; for (let i = 0; i < 160; i++) { const t = i / 40, e = Math.floor(t), f = (t - e) * 40; sq.push(e === 0 ? [f, 0] : e === 1 ? [40, f] : e === 2 ? [40 - f, 40] : [0, 40 - f]); }
  const K = L.smoothLoop(sq, 0.5, 2);
  for (const c of [[0, 0], [40, 0], [40, 40], [0, 40]]) { const d = Math.min(...K.map((q) => Math.hypot(q[0] - c[0], q[1] - c[1]))); assert.ok(d < 0.3, 'köşe yuvarlandı: ' + c + ' → ' + d.toFixed(2) + ' mm'); }
});
t('8. Kesim matı: kalıp çizgisi pürüzsüz; ızgara çizgisi kalıba yapışmaz, gölgeli yüzü ısırmaz (sapma < 1 mm, hep aynı yöne döner)', () => {
  for (const off of [0, 7]) {   // 0: ızgara çizgisi kalıbın tepesine teğet
    const { a, w, h } = matImage({ off });
    const r = L.analyzeMat(a, w, h);
    assert.ok(r.ok, r.error);
    const Q = r.outline.nodes.map((n) => n.p);
    assert.ok(turning(Q) < 380, off + ': çizgi tırtıklı, toplam dönüş ' + turning(Q).toFixed(0) + '°');
    const xs = Q.map((p) => p[0]), ys = Q.map((p) => p[1]), cx = (Math.min(...xs) + Math.max(...xs)) / 2, cy = (Math.min(...ys) + Math.max(...ys)) / 2;
    const dev = Q.map(([x, y]) => { const t = Math.atan2((y - cy) / 45, (x - cx) / 130); return Math.hypot(x - cx - 130 * Math.cos(t), y - cy - 45 * Math.sin(t)); });
    assert.ok(Math.max(...dev) < 1, off + ': elipsten sapma ' + Math.max(...dev).toFixed(2) + ' mm');
  }
});
t('9. Yapay zekâ çizgisi kalıp dışına taşsa bile parça kalıbın içinde kalır (iç yan dahil)', async () => {
  const { lastFrame, guessOrientation } = await import('../ayk/auto.js');
  const p = M.createProject({ name: 'yz' }); p.last.views.yan = lastView(); p.last.views.ic = lastView();
  const info = P.lastInfo(p.last.views.yan), Lm = info.L;
  const ai = M.makeAiParts({ model: 'taşan', confidence: 'low', pieces: [
    { name: 'Taşan arka', layer: 0, poly: [[-12, 0], [-12, 45], [0.45 * Lm, 50], [0.45 * Lm, 0]] },   // topuk arkasından taşar, orta çizgiye değmez → iç yan eşi de çıkar
    { name: 'Taşan burun', layer: 0, poly: [[0.6 * Lm, 0], [0.6 * Lm, 120], [Lm + 15, 90], [Lm + 15, 0]] },   // üst çizginin üstüne ve burun ucundan taşar
  ] });
  const r = P.generateAi(p, ai);
  for (const side of ['yan', 'ic']) {
    const v = p.last.views[side], o = guessOrientation(v), F = lastFrame(v, o.flipX, o.flipY), poly = F.poly.map(F.toV);
    const dEdge = (q) => { let d = Infinity; for (let i = 0; i < poly.length; i++) { const a = poly[i], b = poly[(i + 1) % poly.length], dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy || 1, t = Math.max(0, Math.min(1, ((q[0] - a[0]) * dx + (q[1] - a[1]) * dy) / l2)); d = Math.min(d, Math.hypot(a[0] + dx * t - q[0], a[1] + dy * t - q[1])); } return d; };
    const ps = r.pieces.filter((pc) => /^Taşan/.test(pc.name) && (side === 'ic') === / \(iç yan\)$/.test(pc.name));
    assert.ok(ps.length >= (side === 'yan' ? 2 : 1), side + ': ' + r.pieces.map((pc) => pc.name).join(', '));
    for (const pc of ps) {
      // 0,5 mm: düğümler arası eğri yumuşatmasının kalıp kenarındaki payı (çizgi kalınlığı mertebesi)
      const out = netPolygon(pc).filter((q) => !P.inside(poly, q) && dEdge(q) > 0.5);
      assert.equal(out.length, 0, pc.name + ': kalıp dışında ' + out.length + ' nokta, en uzak ' + Math.max(0, ...out.map(dEdge)).toFixed(2) + ' mm');
      const bad = checkPiece(pc).filter((x) => x.level === 'hata');
      assert.equal(bad.length, 0, pc.name + ': ' + bad.map((x) => x.msg).join(', '));
    }
  }
});

t('10. Eğik çekilmiş mat: kare boyu yere göre değişir, kalıbın yüzeyinde ince doku var — ölçek kalıbın yanından alınır (±4 %)', () => {
  // görüntüde aşağı indikçe kare büyür (s = 1,5 + 0,0035·y px/mm); kalıp 220 × 80 mm, tabanı matta
  const w = 1000, h = 800, s0 = 1.5, gk = 0.0035, sAt = (y) => s0 + gk * y, Yof = (y) => Math.log(sAt(y) / s0) / gk;
  const a = new Uint8ClampedArray(w * h * 4), cx = w / 2, yb = 520, Yb = Yof(yb);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const sy = sAt(y), X = (x - cx) / sy, Y = Yof(y), o = (y * w + x) * 4;
    const mx = ((X % 10) + 10) % 10, my = ((Y % 10) + 10) % 10, lw = 1.1 / sy;   // çizgi kalınlığı ~1,1 px
    const line = mx < lw * 1.6 || my < lw * 1.6;
    let r = line ? 120 : 30, g = line ? 170 : 95, b = line ? 150 : 80;
    // kalıp: alt kenarı yb satırında; görüntüde yan görünüş gibi dik durur → alt kenardaki ölçekle çizilir
    const sb = sAt(yb), u = (x - cx) / sb, v = (yb - y) / sb;
    if (v >= 0 && (u / 110) ** 2 + ((v - 40) / 40) ** 2 < 1) { const tex = (x % 7 < 1 || y % 7 < 1) ? 0.85 : 1; r = 170 * tex; g = 160 * tex; b = 70 * tex; }
    a[o] = r; a[o + 1] = g; a[o + 2] = b; a[o + 3] = 255;
  }
  const r = L.analyzeMat(a, w, h);
  assert.ok(r.ok, r.error);
  assert.ok(Math.abs(r.length - 220) / 220 < 0.04, 'boy ' + r.length.toFixed(1) + ' mm (220 beklenir)');
});

let fail = 0;
for (const [name, fn] of tests) {
  try { await fn(); console.log('ok   ' + name); }
  catch (e) { fail++; console.log('FAIL ' + name + '\n     ' + (e.stack || e).toString().split('\n').slice(0, 4).join('\n     ')); }
}
console.log(`\n${tests.length - fail}/${tests.length} geçti`);
process.exit(fail ? 1 : 0);
