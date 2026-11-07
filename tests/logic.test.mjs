// Çalıştır: node tests/logic.test.mjs
import assert from 'node:assert/strict';
import {
  parseVoice, normalize, History, toSTLBinary, newPart, heightOf,
  UNITS, toUnit, fromUnit, fmtNum, snap, dist3,
  circlePts, rectPts, bboxPts, polyArea, sketchFromDraw, sketchToDraw, sketchHeight, revolveProfile,
  chamferBoxPoints, cylinderProfile,
  eulerToQuat, quatMul, quatToEulerXYZ,
  duplicatePart, mirrorPart, linearArray, circularArray,
  VIEW_DIRS, sectionPlane, fovDistance, arcPoints, roundedRectPts, pickScale, scaleLabel, sheetLayout, jpegToPdf,
} from '../logic.js';

let fail = 0;
const t = (name, fn) => {
  try { fn(); console.log('ok   ', name); }
  catch (e) { fail++; console.log('FAIL ', name, '\n     ', e.message.split('\n')[0]); }
};
const one = (s) => parseVoice(s)[0];

t('sayı kelimeleri', () => {
  assert.equal(normalize('yirmi beş'), '25');
  assert.equal(normalize('yüz yirmi'), '120');
  assert.equal(normalize('iki yüz elli milimetre'), '250');
  assert.equal(normalize('bir silindir'), 'bir silindir');
  assert.equal(normalize('5 santim'), '50');
  assert.equal(normalize('2,5 cm'), '25');
});
t('silindir (sayı önde, -ında)', () => {
  const c = one('elli milimetre çapında yirmi milimetre yüksekliğinde silindir ekle');
  assert.deepEqual(c, { cmd: 'add', type: 'cylinder', op: 'add', dims: { d: 50, h: 20 } });
});
t('silindir (anahtar sözcük önde)', () => {
  const c = one('silindir yap çap 50 yükseklik 20');
  assert.deepEqual(c.dims, { d: 50, h: 20 });
});
t('kutu sıralı sayılar', () => {
  const c = one("kutu ekle 80'e 60'a 40");
  assert.deepEqual(c, { cmd: 'add', type: 'box', op: 'add', dims: { w: 80, l: 60, h: 40 } });
});
t('yuvarlak delik', () => {
  const c = one('10 milimetre delik aç');
  assert.deepEqual(c, { cmd: 'add', type: 'cylinder', op: 'sub', dims: { d: 10 } });
});
t('santim -> mm', () => {
  const c = one('5 santim çapında delik aç');
  assert.deepEqual(c.dims, { d: 50 });
});
t('kare delik', () => {
  const c = one('kare delik 8 milimetre');
  assert.deepEqual(c, { cmd: 'add', type: 'box', op: 'sub', dims: { w: 8, l: 8 } });
});
t('küre', () => {
  assert.deepEqual(one('küre ekle çap 30'), { cmd: 'add', type: 'sphere', op: 'add', dims: { d: 30 } });
});
t('boru', () => {
  const c = one('boru ekle dış çap 40 iç çap 30 yükseklik 20');
  assert.deepEqual(c.dims, { d: 40, di: 30, h: 20 });
  assert.equal(c.type, 'tube');
});
t('koni', () => {
  const c = one('koni ekle alt çap 40 üst çap 10 yükseklik 50');
  assert.deepEqual(c.dims, { d: 40, d2: 10, h: 50 });
});
t('geri al / yinele / sığdır / stl / kaydet / sil', () => {
  assert.equal(one('geri al').cmd, 'undo');
  assert.equal(one('yinele').cmd, 'redo');
  assert.equal(one('ekrana sığdır').cmd, 'fit');
  assert.equal(one('stl indir').cmd, 'export');
  assert.equal(one('kaydet').cmd, 'save');
  assert.equal(one('parçayı sil').cmd, 'delete');
});
t('silindir sözcüğü "sil" sayılmaz', () => {
  assert.equal(one('silindir ekle').cmd, 'add');
});
t('özellik değiştirme', () => {
  assert.deepEqual(one('yüksekliği 30 yap'), { cmd: 'set', key: 'h', value: 30 });
  assert.deepEqual(one('çapı elli yap'), { cmd: 'set', key: 'd', value: 50 });
  assert.deepEqual(one('iç çapı 25 yap'), { cmd: 'set', key: 'di', value: 25 });
  assert.deepEqual(one("x'i 10 yap"), { cmd: 'set', key: 'x', value: 10 });
});
t('döndürme', () => {
  assert.deepEqual(one('x ekseninde 45 derece döndür'), { cmd: 'rotate', axis: 'x', deg: 45 });
  assert.deepEqual(one('90 derece döndür'), { cmd: 'rotate', axis: 'y', deg: 90 });
});
t('kenar yuvarlama', () => {
  assert.deepEqual(one('kenarları 5 milimetre yuvarla'), { cmd: 'set', key: 'r', value: 5 });
});
t('anlaşılmayan', () => {
  assert.equal(one('bugün hava çok güzel').cmd, 'unknown');
});

t('geçmiş: geri al / yinele', () => {
  const h = new History();
  h.push('A'); h.push('B');
  assert.equal(h.undo('C'), 'B');
  assert.equal(h.undo('B'), 'A');
  assert.equal(h.undo('A'), null);
  assert.equal(h.redo('A'), 'B');
  h.push('X');
  assert.equal(h.canRedo, false);
});
t('yeni parça konumları', () => {
  const base = { id: 1, type: 'box', h: 40, x: 5, y: 0, z: 7 };
  const add = newPart(2, 'box', 'add', base);
  assert.equal(add.y, 40); assert.equal(add.x, 5);
  const hole = newPart(3, 'cylinder', 'sub', base);
  assert.equal(hole.h, 42); assert.equal(hole.y, -1); assert.equal(hole.z, 7);
  assert.equal(heightOf({ type: 'sphere', d: 30 }), 30);
});
t('STL ikili biçim', () => {
  const tri = new Float32Array([0, 0, 0, 10, 0, 0, 0, 10, 0]);
  const b = toSTLBinary(tri, false);
  assert.equal(b.length, 84 + 50);
  const dv = new DataView(b.buffer);
  assert.equal(dv.getUint32(80, true), 1);
  assert.equal(dv.getFloat32(84 + 8, true), 1); // normal z = +1
  const z = toSTLBinary(tri, true); // Y-yukarı -> Z-yukarı
  const dz = new DataView(z.buffer);
  assert.equal(dz.getFloat32(84 + 4, true), -1); // normal artık -Y
});

const near = (a, b, e = 1e-3) => assert.ok(Math.abs(a - b) < e, `${a} ≈ ${b}`);

t('sesli: kopyala / ayna / görünüm / pah', () => {
  assert.deepEqual(one('kopyala'), { cmd: 'copy', count: 1 });
  assert.deepEqual(one('5 tane kopyala'), { cmd: 'copy', count: 5 });
  assert.deepEqual(one('aynala'), { cmd: 'mirror', axis: 'x' });
  assert.deepEqual(one('z ekseninde aynala'), { cmd: 'mirror', axis: 'z' });
  assert.deepEqual(one('üstten bak'), { cmd: 'view', view: 'top' });
  assert.deepEqual(one('önden göster'), { cmd: 'view', view: 'front' });
  assert.deepEqual(one('izometrik'), { cmd: 'view', view: 'iso' });
  assert.deepEqual(one('kenarlara 2 milimetre pah ver'), { cmd: 'set', key: 'c', value: 2 });
});
t('birimler ve yapışma', () => {
  near(toUnit(25.4, 'in'), 1); near(fromUnit(2, 'cm'), 20); assert.equal(UNITS.mm, 1);
  assert.equal(fmtNum(12.3456), '12.35'); assert.equal(fmtNum(-0), '0');
  assert.equal(snap(13, 5), 15); assert.equal(snap(12, 5), 10); assert.equal(snap(7.3, 0), 7.3);
  assert.equal(snap(-0.4, 5), 0); assert.ok(Object.is(snap(-0.4, 5), 0));
  near(dist3([0, 0, 0], [3, 4, 12]), 13);
});
t('kroki: çizimden parça ve geri', () => {
  const d = { mode: 'extrude', plane: 'top', pts: rectPts(10, 20, 50, 40), h: 15 };
  const p = sketchFromDraw(d);
  assert.equal(p.x, 30); assert.equal(p.z, 30); assert.equal(p.y, 0); assert.equal(p.h, 15);
  assert.deepEqual(bboxPts(p.pts), { minU: -20, maxU: 20, minV: -10, maxV: 10 });
  assert.deepEqual(sketchToDraw({ ...p }).pts, d.pts);
  assert.equal(sketchHeight(p), 15); assert.equal(heightOf(p), 15);

  const f = sketchFromDraw({ mode: 'extrude', plane: 'front', pts: rectPts(0, 5, 20, 25), h: 8 });
  assert.equal(f.y, 5); assert.equal(f.x, 10); assert.equal(sketchHeight(f), 20);
  assert.deepEqual(sketchToDraw(f).pts, rectPts(0, 5, 20, 25));

  const r = sketchFromDraw({ mode: 'revolve', plane: 'front', pts: [[0, 2], [10, 2], [10, 12], [0, 12]] });
  assert.equal(r.x, 0); assert.equal(r.y, 2); assert.equal(sketchHeight(r), 10);
});
t('kroki: daire ve döndürme profili', () => {
  const c = circlePts(0, 0, 10, 16);
  assert.equal(c.length, 16); near(Math.hypot(...c[3]), 10);
  const cw = [[0, 0], [0, 10], [10, 10], [10, 0]]; // saat yönü
  assert.ok(polyArea(cw) < 0);
  const prof = revolveProfile(cw);
  assert.ok(polyArea(prof.slice(0, -1)) > 0);
  assert.deepEqual(prof[0], prof[prof.length - 1]);
  assert.ok(prof.every(([r]) => r >= 0.01));
});
t('pah ve yuvarlama geometrisi', () => {
  const P = chamferBoxPoints(40, 30, 20, 4);
  assert.equal(P.length, 24);
  assert.ok(P.every(([x, y, z]) => Math.abs(x) <= 20 && Math.abs(z) <= 15 && y >= 0 && y <= 20));
  // sıfır pahta tam kutu köşeleri
  assert.ok(chamferBoxPoints(40, 30, 20, 0).some(([x, y, z]) => x === 20 && y === 20 && z === 15));
  // aşırı büyük pah kenarı aşmaz
  assert.ok(chamferBoxPoints(10, 10, 10, 99).every(([x]) => Math.abs(x) <= 5));
  const plain = cylinderProfile(10, 20, 0, 0);
  assert.deepEqual(plain, [[0, 0], [10, 0], [10, 20], [0, 20]]);
  const ch = cylinderProfile(10, 20, 2, 0);
  assert.deepEqual(ch, [[0, 0], [8, 0], [10, 2], [10, 18], [8, 20], [0, 20]]);
  const rd = cylinderProfile(10, 20, 0, 3);
  assert.deepEqual(rd[0], [0, 0]); assert.deepEqual(rd[rd.length - 1], [0, 20]);
  assert.ok(polyArea(rd) > 0);
  assert.ok(rd.every(([r, y]) => r <= 10 + 1e-9 && y >= -1e-9 && y <= 20 + 1e-9));
});
t('euler <-> kuaterniyon', () => {
  for (const [a, b, c] of [[30, 40, 50], [90, 0, 0], [0, 90, 0], [10, -70, 120], [0, 0, 0]]) {
    const q = eulerToQuat(a, b, c);
    const q2 = eulerToQuat(...quatToEulerXYZ(q));
    const dot = q[0] * q2[0] + q[1] * q2[1] + q[2] * q2[2] + q[3] * q2[3];
    near(Math.abs(dot), 1, 1e-6);
  }
  const q = quatMul(eulerToQuat(0, 90, 0), eulerToQuat(0, 0, 0));
  assert.deepEqual(quatToEulerXYZ(q), [0, 90, 0]);
});
t('kopya ve ayna', () => {
  const p = { id: 2, type: 'box', op: 'add', w: 10, l: 10, h: 10, x: 20, y: 0, z: 5, rx: 0, ry: 30, rz: 10, name: 'Ayak' };
  const c = duplicatePart(p, 9);
  assert.equal(c.id, 9); assert.equal(c.x, 30); assert.equal(c.z, 15); assert.equal(c.name, 'Ayak kopya');
  assert.equal(p.x, 20); // orijinal değişmez
  const m = mirrorPart(p, 10, 'x', 0);
  assert.equal(m.x, -20); assert.equal(m.ry, -30); assert.equal(m.rz, -10); assert.equal(m.z, 5);
  const mz = mirrorPart(p, 11, 'z', 0, 5);
  assert.equal(mz.z, 5); assert.equal(mz.ry, -30); assert.equal(mz.rz, 10);
  const sk = sketchFromDraw({ mode: 'extrude', plane: 'top', pts: [[0, 0], [20, 0], [0, 10]], h: 5 });
  const ms = mirrorPart({ id: 3, op: 'add', ...sk }, 12, 'x', 0);
  assert.deepEqual(ms.pts.map(([u]) => u), sk.pts.map(([u]) => -u));
});
t('doğrusal dizi', () => {
  const p = { id: 1, type: 'box', x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0, name: 'A' };
  const a = linearArray(p, 5, 3, 25, 0, 10);
  assert.equal(a.length, 3);
  assert.deepEqual(a.map((q) => q.x), [25, 50, 75]);
  assert.deepEqual(a.map((q) => q.z), [10, 20, 30]);
  assert.deepEqual(a.map((q) => q.id), [5, 6, 7]);
  assert.equal(a[2].name, 'A 4');
});
t('dairesel dizi', () => {
  const p = { id: 1, type: 'cylinder', x: 10, y: 0, z: 0, rx: 0, ry: 0, rz: 0 };
  const a = circularArray(p, 2, 4, 0, 0, 360);
  assert.equal(a.length, 3);
  near(a[0].x, 0); near(a[0].z, -10); assert.equal(a[0].ry, 90);
  near(a[1].x, -10); near(a[1].z, 0);
  near(a[2].x, 0); near(a[2].z, 10);
  // başka merkez
  const b = circularArray({ ...p, x: 20 }, 9, 2, 10, 0, 360);
  near(b[0].x, 0); near(b[0].z, 0);
  // kısmi yay: 3 adet 180°
  const c = circularArray(p, 2, 3, 0, 0, 180);
  near(c[1].x, -10); assert.equal(c[1].ry, 180);
  // dönmüş parçanın yönü birleşir: rx=90 sonra Y'de 90
  const d = circularArray({ ...p, rx: 90 }, 2, 4, 0, 0, 360)[0];
  const qa = eulerToQuat(d.rx, d.ry, d.rz);
  const qb = quatMul(eulerToQuat(0, 90, 0), eulerToQuat(90, 0, 0));
  near(Math.abs(qa[0] * qb[0] + qa[1] * qb[1] + qa[2] * qb[2] + qa[3] * qb[3]), 1, 1e-6);
});
t('görünüm yardımcıları', () => {
  assert.deepEqual(Object.keys(VIEW_DIRS).sort(), ['front', 'iso', 'side', 'top']);
  const s = sectionPlane('x', 10);
  assert.deepEqual(s, { normal: [-1, 0, 0], constant: 10 });
  // x=5 noktası kalmalı (normal·p+c >= 0), x=15 kesilmeli
  const keep = (pl, x) => pl.normal[0] * x + pl.constant >= 0;
  assert.ok(keep(s, 5)); assert.ok(!keep(s, 15));
  const f = sectionPlane('x', 10, true);
  assert.ok(!keep(f, 5)); assert.ok(keep(f, 15));
  assert.deepEqual(sectionPlane('y', 3).normal, [0, -1, 0]);
  near(fovDistance(100, 45, 45), 100);
  assert.ok(fovDistance(100, 45, 1.5) > 100 * 20);
});

t('yay: 3 noktadan', () => {
  // (0,0) -> (20,0), tepe (10,10): merkez (10,0), yarıçap 10 -> yarım daire üstte
  const a = arcPoints([0, 0], [10, 10], [20, 0]);
  assert.deepEqual(a[a.length - 1], [20, 0]);
  assert.ok(a.length >= 25);
  assert.ok(a.every(([x, y]) => Math.abs(Math.hypot(x - 10, y) - 10) < 1e-6 && y >= -1e-9));
  // ters yönde (tepe aşağıda)
  const b = arcPoints([0, 0], [10, -10], [20, 0]);
  assert.ok(b.every(([x, y]) => y <= 1e-9));
  // aynı doğru üzerindeki noktalar: düz çizgi
  assert.deepEqual(arcPoints([0, 0], [5, 0], [10, 0]), [[10, 0]]);
  // ince yay
  const c = arcPoints([0, 0], [10, 2], [20, 0]);
  assert.ok(c.every(([x, y]) => y >= -1e-9) && Math.max(...c.map((p) => p[1])) <= 2.0001);
});
t('yuvarlak köşeli dikdörtgen', () => {
  assert.deepEqual(roundedRectPts(0, 0, 40, 20, 0), rectPts(0, 0, 40, 20));
  const p = roundedRectPts(0, 0, 40, 20, 5);
  assert.ok(p.every(([x, y]) => x >= -1e-9 && x <= 40 + 1e-9 && y >= -1e-9 && y <= 20 + 1e-9));
  assert.ok(polyArea(p) < 40 * 20 && polyArea(p) > 0);
  assert.ok(Math.abs(polyArea(p) - (40 * 20 - (4 - Math.PI) * 25)) < 1.5);
  // hap: r büyükse kısa kenarın yarısına kısılır
  const s = roundedRectPts(0, 0, 40, 10, 99);
  assert.ok(s.every(([x, y]) => y >= -1e-9 && y <= 10 + 1e-9));
});

t('teknik resim: ölçek seçimi', () => {
  assert.equal(pickScale(1.3), 1);
  assert.equal(pickScale(0.37), 0.2);
  assert.equal(pickScale(3), 2);
  assert.equal(pickScale(1e-9), 0.001);
  assert.equal(scaleLabel(0.2), '1:5');
  assert.equal(scaleLabel(2), '2:1');
  assert.equal(scaleLabel(1), '1:1');
});
t('teknik resim: yerleşim sayfaya sığar, görünüşler çakışmaz', () => {
  for (const [W, H, D] of [[100, 50, 80], [20, 300, 20], [1000, 10, 400], [5, 5, 5]]) {
    const L = sheetLayout(W, H, D);
    const { area } = L;
    for (const k of ['front', 'side', 'top', 'iso']) {
      const b = L[k];
      assert.ok(b.x >= area.x - 1e-6 && b.y >= area.y - 1e-6, k + ' sol/üst taşma ' + [W, H, D]);
      assert.ok(b.x + b.w <= area.x + area.w + 1e-6 && b.y + b.h <= area.y + area.h + 1e-6, k + ' sağ/alt taşma ' + [W, H, D]);
    }
    const ov = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
    assert.ok(!ov(L.front, L.side) && !ov(L.front, L.top) && !ov(L.side, L.top) && !ov(L.top, L.iso) && !ov(L.side, L.iso));
    assert.ok(Math.abs(L.front.w - W * L.scale) < 1e-9 && Math.abs(L.side.w - D * L.scale) < 1e-9);
  }
});
t('PDF: JPEG gömülü, xref ofsetleri doğru', () => {
  const jpeg = new Uint8Array([0xff, 0xd8, 1, 2, 3, 4, 5, 0xff, 0xd9]);
  const pdf = jpegToPdf(jpeg, 100, 50);
  const str = Buffer.from(pdf).toString('latin1');
  assert.ok(str.startsWith('%PDF-1.4'));
  assert.ok(str.trimEnd().endsWith('%%EOF'));
  const sx = Number(/startxref\n(\d+)/.exec(str)[1]);
  assert.equal(str.slice(sx, sx + 4), 'xref');
  const entries = [...str.slice(sx).matchAll(/(\d{10}) 00000 n /g)].map((m) => Number(m[1]));
  assert.equal(entries.length, 5);
  entries.forEach((off, i) => assert.equal(str.slice(off, off + (i + 1 + ' 0 obj').length), (i + 1) + ' 0 obj'));
  assert.ok(str.includes('/Length 9'));
  assert.ok(Buffer.from(pdf).includes(Buffer.from(jpeg)));
});

console.log(fail ? `\n${fail} test BAŞARISIZ` : '\nTüm testler geçti');
process.exit(fail ? 1 : 0);
