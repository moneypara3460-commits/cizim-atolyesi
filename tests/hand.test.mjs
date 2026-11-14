// Çalıştır: node tests/hand.test.mjs
// Parmakla kontrol çekirdeği (hand/gestures.js). Girdi yapay 21 noktalı eldir (tests/hand-fixture.mjs): gerçek kamera sınanmaz.
import assert from 'node:assert/strict';
import { LM, validHand, handSize, pinchRatio, fingerState, gestureFeatures, Hysteresis, OneEuro, sensitivityBox, scaleBox, mapPoint, boxFromCorners, HandEngine, DEFAULTS, CONNECTIONS } from '../hand/gestures.js';
import { hand, POSE } from './hand-fixture.mjs';

let fail = 0;
const tests = [];
const t = (name, fn) => tests.push([name, fn]);
const near = (a, b, tol, m) => assert.ok(Math.abs(a - b) <= tol, `${m}: ${a} ≠ ${b} (±${tol})`);
const VIEW = { w: 1000, h: 800, aspect: 4 / 3, mirror: true };
// kareleri 30 fps ile motora ver; olayları topla
function run(eng, frames, t0 = 0, view = VIEW) {
  const ev = []; let t = t0, last = null;
  for (const f of frames) { last = eng.update(f, t, view); for (const e of last.events) ev.push({ ...e, t }); t += 33; }
  return { ev, last, t };
}
const rep = (f, n) => Array.from({ length: n }, () => f);
const types = (ev) => ev.map((e) => e.type).filter((x) => x !== 'move').join(',');

t('21 nokta: geçerlilik denetimi (eksik nokta, NaN, boş)', () => {
  const h = hand();
  assert.equal(h.length, 21); assert.ok(validHand(h));
  assert.ok(!validHand(h.slice(0, 20))); assert.ok(!validHand(null)); assert.ok(!validHand([]));
  const bad = hand(); bad[8] = { x: NaN, y: 0.5 }; assert.ok(!validHand(bad));
  assert.equal(CONNECTIONS.length, 21); assert.ok(CONNECTIONS.every(([a, b]) => a >= 0 && a < 21 && b >= 0 && b < 21));
});
t('birleştirme oranı: el boyundan (kameraya uzaklıktan) ve en-boy oranından bağımsız', () => {
  for (const size of [0.08, 0.2, 0.45]) for (const aspect of [4 / 3, 16 / 9, 3 / 4]) {
    near(pinchRatio(hand({ size, pinch: 0.25, aspect }), LM.INDEX_TIP, aspect), 0.25, 1e-9, `oran s=${size} a=${aspect}`);
    near(handSize(hand({ size, aspect }), aspect), size * Math.hypot(0.9, 0.15), 1e-9, 'el boyu');
  }
});
t('parmak durumu: işaret / iki parmak / açık avuç / yumruk ayrılır', () => {
  const f = (p) => fingerState(hand(POSE[p]), 4 / 3);
  assert.deepEqual([f('point').index, f('point').middle, f('point').ring, f('point').pinky], [true, false, false, false]);
  assert.deepEqual([f('two').index, f('two').middle, f('two').ring, f('two').pinky], [true, true, false, false]);
  assert.deepEqual([f('palm').index, f('palm').middle, f('palm').ring, f('palm').pinky], [true, true, true, true]);
  assert.deepEqual([f('fist').index, f('fist').middle, f('fist').ring, f('fist').pinky], [false, false, false, false]);
});
t('özellik vektörü: 42 boyut; konum, ölçek ve aynalamadan sonra döndürmeden bağımsız', () => {
  const a = gestureFeatures(hand({ x: 0.3, y: 0.4, size: 0.15 }), 4 / 3), b = gestureFeatures(hand({ x: 0.7, y: 0.6, size: 0.3 }), 4 / 3);
  assert.equal(a.length, 42); for (let i = 0; i < 42; i++) near(a[i], b[i], 1e-9, 'öz ' + i);
  // 90° döndürülmüş el (kare görüntüde): aynı vektör
  const h = hand({ aspect: 1 }), rot = h.map((p) => ({ x: 0.5 - (p.y - 0.5), y: 0.5 + (p.x - 0.5) }));
  const c = gestureFeatures(h, 1), d = gestureFeatures(rot, 1); for (let i = 0; i < 42; i++) near(c[i], d[i], 1e-9, 'dönme ' + i);
});
t('histerezis: eşikler arasında gidip gelen değer durumu değiştirmez', () => {
  const h = new Hysteresis(0.28, 0.42);
  assert.equal(h.update(0.5), false); assert.equal(h.update(0.3), false); assert.equal(h.update(0.27), true);
  for (const v of [0.3, 0.41, 0.29, 0.4]) assert.equal(h.update(v), true);
  assert.equal(h.update(0.43), false); assert.equal(h.update(0.3), false);
  assert.throws(() => new Hysteresis(0.5, 0.4));
});
t('1€ süzgeci: duran elde titremeyi en az 3 kat azaltır, hızlı harekette 60 ms içinde yetişir', () => {
  const f = new OneEuro(DEFAULTS.minCutoff, DEFAULTS.beta); let seed = 7; const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648 - 0.5; };
  const raw = [], out = [];
  for (let i = 0; i < 200; i++) { const v = 500 + rnd() * 6; raw.push(v); out.push(f.filter(v, i * 33)); }
  const sd = (a) => { const m = a.reduce((x, y) => x + y) / a.length; return Math.sqrt(a.reduce((x, y) => x + (y - m) ** 2, 0) / a.length); };
  assert.ok(sd(out.slice(50)) * 3 < sd(raw.slice(50)), `titreme ${sd(raw.slice(50)).toFixed(2)} → ${sd(out.slice(50)).toFixed(2)}`);
  const g = new OneEuro(DEFAULTS.minCutoff, DEFAULTS.beta); let lag = 0;
  for (let i = 0; i < 60; i++) { const v = i * 40; lag = v - g.filter(v, i * 33); }   // 1200 px/sn sabit hız
  assert.ok(lag >= 0 && lag < 1200 * 0.06, 'gecikme px: ' + lag.toFixed(1));
});
t('eşleme: ön kamera aynalanır, kutu dışı kenara sıkışır, hassasiyet arttıkça kutu küçülür', () => {
  const b = sensitivityBox(5);
  near(mapPoint(0.5, 0.5, b, 1000, 800)[0], 500, 1e-9, 'orta x'); near(mapPoint(0.5, 0.5, b, 1000, 800)[1], 400, 1e-9, 'orta y');
  assert.ok(mapPoint(0.4, 0.5, b, 1000, 800, true)[0] > 500, 'aynalı: görüntüde sola giden el ekranda sağa gider');
  assert.ok(mapPoint(0.4, 0.5, b, 1000, 800, false)[0] < 500, 'aynasız (arka kamera)');
  assert.deepEqual(mapPoint(-1, 2, b, 1000, 800, false), [0, 800]);
  let prev = 2; for (let s = 1; s <= 10; s++) { const x = sensitivityBox(s), w = x.x1 - x.x0; assert.ok(w < prev && w >= 0.35 - 1e-9 && w <= 0.9 + 1e-9); prev = w; }
  const k = scaleBox({ x0: 0.2, y0: 0.3, x1: 0.6, y1: 0.5 }, 0.5); near(k.x0, 0.3, 1e-12, 'ölçek'); near(k.y1, 0.45, 1e-12, 'ölçek');
});
t('işaret parmağı: imleç parmağı izler; el sağa gidince imleç sağa, aşağı gidince aşağı gider', () => {
  const e = new HandEngine(); e.setSensitivity(5);
  const a = run(e, rep(hand({ x: 0.5, y: 0.5 }), 20));
  near(a.last.x, 500, 1, 'x'); near(a.last.y, 400, 1, 'y'); assert.equal(a.last.gesture, 'point'); assert.equal(a.last.down, false);
  const b = run(e, rep(hand({ x: 0.4, y: 0.6 }), 40), a.t);   // aynalı görüntüde x küçülür = kullanıcının eli sağa gitti
  assert.ok(b.last.x > 600 && b.last.y > 500, `${b.last.x}, ${b.last.y}`);
  assert.equal(types(a.ev.concat(b.ev)), '', 'basma olayı yok');
});
t('birleştir → çizim başlar, ayır → durur; çizim nişan alınan noktadan başlar (parmak bükülmesi kaydırmaz)', () => {
  const e = new HandEngine();
  const a = run(e, rep(hand({ x: 0.5, y: 0.5 }), 20)); const aim = [a.last.x, a.last.y];
  // parmaklar 5 karede kapanır (uç aşağı kayar), sonra el çizgi çizer, sonra parmaklar açılır
  const closing = [0.9, 0.6, 0.4, 0.2, 0.1].map((p) => hand({ x: 0.5, y: 0.5, pinch: p }));
  const stroke = Array.from({ length: 30 }, (_, i) => hand({ x: 0.5 - i * 0.004, y: 0.5 + i * 0.002, pinch: 0.1 }));
  const opening = rep(hand({ x: 0.5 - 0.116, y: 0.558, pinch: 1.2 }), 8);
  const b = run(e, [...closing, ...stroke, ...opening], a.t);
  assert.equal(types(b.ev), 'down,up');
  const down = b.ev.find((x) => x.type === 'down'), up = b.ev.find((x) => x.type === 'up');
  near(down.x, aim[0], 1.5, 'basma x'); near(down.y, aim[1], 1.5, 'basma y');
  assert.ok(up.x - down.x > 150 && up.y - down.y > 40, `çizgi sağ aşağı uzadı: ${(up.x - down.x).toFixed(0)}, ${(up.y - down.y).toFixed(0)}`);
  // çizgi kesintisiz: basılıyken ardışık noktalar arası sıçrama yok
  const pts = b.ev.filter((x) => x.t >= down.t && x.t <= up.t && x.type !== 'up');
  for (let i = 1; i < pts.length; i++) assert.ok(Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y) < 25, 'sıçrama ' + i);
  assert.ok(pts.length > 20, 'ara nokta sayısı ' + pts.length);
  assert.equal(b.last.down, false);
});
t('çizgi kopmaz: eşikte titreyen oran ve tek karelik açılma çizimi bitirmez', () => {
  const e = new HandEngine(); run(e, rep(hand(), 10));
  const wob = [0.1, 0.3, 0.41, 0.29, 0.4, 0.33, 0.6, 0.2, 0.39, 0.1, 0.9, 0.15, 0.3].map((p, i) => hand({ x: 0.5 - i * 0.005, pinch: p }));
  const r = run(e, [...rep(hand({ pinch: 0.1 }), 4), ...wob], 330);
  assert.equal(types(r.ev), 'down'); assert.equal(r.last.down, true);
  const end = run(e, rep(hand({ x: 0.44, pinch: 1.2 }), 6), r.t); assert.equal(types(end.ev), 'up');
});
t('dokunma: kısa birleştirmede el titrese de basma ve bırakma aynı noktadadır (düğme / parça seçimi)', () => {
  const e = new HandEngine(); const a = run(e, rep(hand({ x: 0.45, y: 0.45 }), 20));
  const jit = [0.001, -0.0015, 0.002, -0.001, 0.0005, 0.001].map((d) => hand({ x: 0.45 + d, y: 0.45 - d, pinch: 0.1 }));
  const r = run(e, [...jit, ...rep(hand({ x: 0.45, y: 0.45, pinch: 1.2 }), 6)], a.t);
  const d = r.ev.find((x) => x.type === 'down'), u = r.ev.find((x) => x.type === 'up');
  assert.ok(d && u); assert.equal(d.x, u.x); assert.equal(d.y, u.y); near(d.x, a.last.x, 1, 'nişan');
  assert.equal(r.ev.filter((x) => x.type === 'move' && x.t > d.t && x.t <= u.t).length, 0, 'basılıyken hareket olayı yok');
});
t('ani birleştirme (parmak ucu bir karede kayar): basma nişan noktasında, el dururken imleç hiç oynamaz, bırakınca da kaymaz', () => {
  const e = new HandEngine(); const a = run(e, rep(hand({ x: 0.5, y: 0.5 }), 20));
  const r = run(e, rep(hand({ x: 0.5, y: 0.5, pinch: 0.1 }), 30), a.t);
  const d = r.ev.find((x) => x.type === 'down'); near(d.x, a.last.x, 0.01, 'x'); near(d.y, a.last.y, 0.01, 'y');
  assert.equal(r.ev.filter((x) => x.type === 'move' && x.t > d.t).length, 0, 'basılıyken kayma yok');
  const u = run(e, rep(hand({ x: 0.5, y: 0.5 }), 30), r.t);
  assert.equal(types(u.ev), 'up'); near(u.last.x, a.last.x, 0.5, 'bırakınca x'); near(u.last.y, a.last.y, 0.5, 'bırakınca y');
});
t('açık avuç: çizim durur (bırakılır), imleç yerinde kalır; işaret parmağına dönünce imleç sıçramaz', () => {
  const e = new HandEngine(); const a = run(e, rep(hand({ x: 0.5, y: 0.5 }), 20));
  const p = run(e, Array.from({ length: 30 }, (_, i) => hand({ ...POSE.palm, x: 0.5 - i * 0.004, y: 0.5 })), a.t);
  assert.equal(p.last.gesture, 'palm'); assert.equal(p.last.paused, true); assert.equal(types(p.ev), '');
  const drift = Math.hypot(p.last.x - a.last.x, p.last.y - a.last.y);
  assert.ok(drift < 60, 'avuç tanınana kadarki kayma (≤ 160 ms): ' + drift.toFixed(1));
  const moved = p.ev.filter((x) => x.type === 'move' && x.t > a.t + 200); assert.equal(moved.length, 0, 'duraklatılmışken imleç oynamaz');
  const back = run(e, rep(hand({ x: 0.384, y: 0.5 }), 3), p.t);
  assert.ok(Math.hypot(back.ev[0].x - p.last.x, back.ev[0].y - p.last.y) < 12, 'dönüşte sıçrama yok');
  // çizerken avuç açılırsa: önce bırakma
  const e2 = new HandEngine(); run(e2, rep(hand(), 10)); const d = run(e2, rep(hand({ pinch: 0.1 }), 6), 330); assert.equal(d.last.down, true);
  const q = run(e2, rep(hand(POSE.palm), 12), d.t); assert.equal(types(q.ev), 'up'); assert.equal(q.last.gesture, 'palm');
});
t('el kısa süre kaybolursa çizim sürer; 300 ms geçerse bırakılır; el dönünce yeniden başlar', () => {
  const e = new HandEngine(); run(e, rep(hand(), 10)); const d = run(e, rep(hand({ pinch: 0.1 }), 6), 330);
  const gap = run(e, rep(null, 5), d.t);                    // 165 ms
  assert.equal(types(gap.ev), ''); assert.equal(gap.last.down, true);
  const on = run(e, rep(hand({ x: 0.48, pinch: 0.1 }), 4), gap.t); assert.equal(types(on.ev), ''); assert.equal(on.last.down, true);
  const lost = run(e, rep(null, 12), on.t);                 // 396 ms
  assert.equal(types(lost.ev), 'up'); assert.equal(lost.last.visible, false); assert.equal(lost.last.gesture, 'lost');
  const again = run(e, rep(hand({ pinch: 0.1 }), 5), lost.t); assert.equal(types(again.ev), 'down');
});
t('ani sıçrama süzülür: tek karelik yanlış konum imleci oynatmaz', () => {
  const e = new HandEngine(); const a = run(e, rep(hand({ x: 0.5, y: 0.5 }), 20));
  const r = run(e, [hand({ x: 0.2, y: 0.8 }), ...rep(hand({ x: 0.5, y: 0.5 }), 5)], a.t);
  assert.ok(Math.hypot(r.last.x - a.last.x, r.last.y - a.last.y) < 2);
  for (const m of r.ev) assert.ok(Math.hypot(m.x - a.last.x, m.y - a.last.y) < 2, 'sıçrama geçti');
  // el gerçekten oraya gittiyse (kalıcı) birkaç karede kabul edilir
  const go = run(e, rep(hand({ x: 0.3, y: 0.7 }), 15), r.t); assert.ok(go.last.x > a.last.x + 200 && go.last.y > a.last.y + 150);
});
t('iki parmak: dikey hareket kaydırma çentikleri üretir (yön doğru), basma olmaz, imleç durur', () => {
  const e = new HandEngine(); const a = run(e, rep(hand(), 10));
  const dn = run(e, Array.from({ length: 25 }, (_, i) => hand({ ...POSE.two, y: 0.4 + i * 0.01 })), a.t);
  const sc = dn.ev.filter((x) => x.type === 'scroll'); assert.ok(sc.length >= 4, 'çentik ' + sc.length); assert.ok(sc.every((s) => s.dir === 1));
  assert.equal(dn.last.gesture, 'two'); assert.ok(!dn.ev.some((x) => x.type === 'down'));
  const up = run(e, Array.from({ length: 25 }, (_, i) => hand({ ...POSE.two, y: 0.64 - i * 0.01 })), dn.t);
  assert.ok(up.ev.filter((x) => x.type === 'scroll').every((s) => s.dir === -1) && up.ev.some((x) => x.type === 'scroll'));
});
t('parmakla çizim kapalı: imleç gezer, birleştirme basmaz; çizerken kapatılırsa bırakılır', () => {
  const e = new HandEngine(); e.setDrawing(false); run(e, rep(hand(), 10));
  const r = run(e, Array.from({ length: 15 }, (_, i) => hand({ x: 0.5 - i * 0.005, pinch: 0.1 })), 330);
  assert.equal(types(r.ev), ''); assert.ok(r.ev.some((x) => x.type === 'move'));
  e.setDrawing(true); const d = run(e, rep(hand({ x: 0.43, pinch: 0.1 }), 4), r.t); assert.equal(types(d.ev), 'down');
  e.setDrawing(false); const u = run(e, rep(hand({ x: 0.43, pinch: 0.1 }), 2), d.t); assert.equal(types(u.ev), 'up');
});
t('sol el (aynalanmış noktalar) aynı şekilde çalışır', () => {
  const flip = (h) => h.map((p) => ({ x: 1 - p.x, y: p.y }));
  const e = new HandEngine(); const a = run(e, rep(flip(hand({ x: 0.5 })), 15)); near(a.last.x, 500, 1, 'orta');
  const r = run(e, [...rep(flip(hand({ pinch: 0.1 })), 5), ...Array.from({ length: 20 }, (_, i) => flip(hand({ x: 0.5 + i * 0.005, pinch: 0.1 }))), ...rep(flip(hand({ x: 0.6 })), 6)], a.t);
  assert.equal(types(r.ev), 'down,up'); assert.ok(r.last.x > 600, 'imleç sağa gitti: ' + r.last.x);
});
t('kalibrasyon: iki köşe ekranın köşelerine eşlenir; hassasiyet kutuyu merkezinden ölçekler; dar alan reddedilir', () => {
  const box = boxFromCorners([0.7, 0.3], [0.4, 0.6], true);
  near(box.x0, 0.3, 1e-12, 'x0'); near(box.x1, 0.6, 1e-12, 'x1');
  assert.equal(boxFromCorners([0.5, 0.5], [0.52, 0.9]), null);
  const e = new HandEngine(); e.setCalibration(box);
  const a = run(e, rep(hand({ x: 0.7, y: 0.3 }), 20)); near(a.last.x, 0, 1, 'sol üst x'); near(a.last.y, 0, 1, 'sol üst y');
  const b = run(e, rep(hand({ x: 0.4, y: 0.6 }), 60), a.t); near(b.last.x, 1000, 2, 'sağ alt x'); near(b.last.y, 800, 2, 'sağ alt y');
  e.setSensitivity(10); const k = e.box(); assert.ok(k.x1 - k.x0 < 0.3 - 1e-9); near((k.x0 + k.x1) / 2, 0.45, 1e-9, 'merkez');
  e.setCalibration(null); near(e.box().x0, sensitivityBox(10).x0, 1e-12, 'sıfırlama');
});
t('özel hareket eklenebilir: tutulunca bir kez tetiklenir, bırakıp yeniden yapınca yine tetiklenir', () => {
  const e = new HandEngine(); e.addGesture({ id: 'yumruk', label: 'Yumruk', holdMs: 300, test: ({ f }) => !f.index && !f.middle && !f.ring && !f.pinky });
  assert.throws(() => e.addGesture({ id: 'x' }));
  const a = run(e, rep(hand(POSE.fist), 30)); assert.equal(a.ev.filter((x) => x.type === 'gesture' && x.id === 'yumruk').length, 1);
  const b = run(e, [...rep(hand(), 5), ...rep(hand(POSE.fist), 15)], a.t); assert.equal(b.ev.filter((x) => x.type === 'gesture').length, 1);
  e.removeGesture('yumruk'); const c = run(e, [...rep(hand(), 5), ...rep(hand(POSE.fist), 15)], b.t); assert.equal(c.ev.filter((x) => x.type === 'gesture').length, 0);
});
t('sağlamlık: bozuk kare el yok sayılır, çıktı hep sonlu ve ekran içinde; aynı girdi aynı sonucu verir', () => {
  const frames = [];
  for (let i = 0; i < 300; i++) {
    const k = i % 37;
    if (k === 5) frames.push(null); else if (k === 9) { const h = hand(); h[3] = { x: Infinity, y: 0 }; frames.push(h); } else if (k === 13) frames.push(hand().slice(0, 7));
    else frames.push(hand({ x: 0.5 + 0.6 * Math.sin(i / 9), y: 0.5 + 0.6 * Math.cos(i / 7), pinch: i % 50 < 25 ? 0.1 : 1.2, fingers: [true, i % 90 > 60, i % 90 > 75, i % 90 > 75] }));
  }
  const a = run(new HandEngine(), frames), b = run(new HandEngine(), frames);
  assert.deepEqual(a.ev, b.ev);
  for (const x of a.ev) if ('x' in x) assert.ok(Number.isFinite(x.x) && Number.isFinite(x.y) && x.x >= 0 && x.x <= 1000 && x.y >= 0 && x.y <= 800, JSON.stringify(x));
  let down = 0; for (const x of a.ev) { if (x.type === 'down') { assert.equal(down, 0, 'çift basma'); down = 1; } if (x.type === 'up' || x.type === 'cancel') { assert.equal(down, 1, 'basmadan bırakma'); down = 0; } }
});

for (const [name, fn] of tests) {
  try { await fn(); console.log('ok   ', name); }
  catch (e) { fail++; console.log('FAIL ', name, '\n     ', e.message.split('\n')[0].slice(0, 600)); }
}
console.log(fail ? `\n${fail} test BAŞARISIZ` : '\nTüm testler geçti');
process.exit(fail ? 1 : 0);
