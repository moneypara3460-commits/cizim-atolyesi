// Çalıştır: node tests/tx-machine.test.mjs
// Tekstil — Aşama 8: triko makine profilleri, uyumluluk, operatör programı, delikli kart, knitout + yapısal benzetim.
import assert from 'node:assert/strict';
import * as CH from '../tx/knit/chart.js';
import * as S from '../tx/knit/shape.js';
import * as MC from '../tx/knit/machine.js';
import * as M from '../tx/model.js';

let fail = 0;
const tests = [];
const t = (name, fn) => tests.push([name, fn]);
const sw = { name: 'N', st10: 28, row10: 38, washed: true };
const vb = () => MC.fromTemplate('vbed-e7', 'v'), hd = () => MC.fromTemplate('hand-std', 'h');

t('1. Şablon profiller geçerli ama DOĞRULANMAMIŞ; doğrulama marka / model / not ister, sonra "kullanıcı doğrulaması" olur', () => {
  for (const tp of MC.MACHINE_TEMPLATES) { const m = MC.fromTemplate(tp.key); assert.deepEqual(MC.validateMachine(m), [], tp.key); const s = MC.machineStatus(m); assert.equal(s.ready, false); assert.match(s.text, /DOĞRULANMAMIŞ/); }
  const m = hd(); assert.throws(() => MC.verifyMachine(m, { note: 'numune örüldü' }), /marka ve model/);
  m.brand = 'Marka'; m.model = 'X1'; assert.throws(() => MC.verifyMachine(m, { note: '' }), /not/);
  MC.verifyMachine(m, { date: '2026-11-12', note: '28/38 numune örüldü, ölçü tuttu' }); const s = MC.machineStatus(m); assert.equal(s.ready, true); assert.match(s.text, /2026-11-12/); assert.deepEqual(m.estimated, []);
  m.needles = 180; assert.equal(MC.machineStatus(m).ready, false, 'değer değişince doğrulama düşer'); assert.match(MC.machineStatus(m).text, /değişti/); m.needles = 200; assert.equal(MC.machineStatus(m).ready, true);
  const bad = hd(); bad.patterning = 'knitout'; assert.ok(MC.validateMachine(bad).some((e) => /yalnız V yataklı/.test(e)));
});

t('2. Uyumluluk: iğne sayısı, ribana plakası, ters ilmek tek plakada, renk > besleyici, kart tekrarı 24\'ün böleni, karışık kart modu, kaydırma sınırı', () => {
  const m = hd(), big = { kind: 'beden', castOn: 260, rows: 10, ribRows: 5 };
  const r = MC.checkCompat(m, { piece: big }); assert.ok(r.some((x) => x.level === 'hata' && /260 iğne/.test(x.msg))); assert.ok(r.some((x) => /ribana plakası/.test(x.msg)));
  const rib = CH.fromTemplate('rib11'); assert.ok(MC.checkCompat(m, { chart: rib }).some((x) => x.level === 'hata' && /tek plakada/.test(x.msg)));
  const j = CH.createChart({ w: 5, h: 2, palette: [{ name: 'A', hex: '#fff' }, { name: 'B', hex: '#000' }] }); CH.setColor(j, 1, 0, 1);
  assert.ok(MC.checkCompat(m, { chart: j }).some((x) => x.level === 'hata' && /24'nin böleni/.test(x.msg)), '5 genişlik');
  const j3 = CH.createChart({ w: 6, h: 1, palette: [{ name: 'A', hex: '#fff' }, { name: 'B', hex: '#000' }, { name: 'C', hex: '#f00' }] }); CH.setColor(j3, 1, 0, 1); CH.setColor(j3, 2, 0, 2);
  assert.ok(MC.checkCompat(m, { chart: j3 }).some((x) => x.level === 'hata' && /3 renk/.test(x.msg)));
  const mix = CH.createChart({ w: 4, h: 2, palette: [{ name: 'A', hex: '#fff' }, { name: 'B', hex: '#000' }] }); CH.setColor(mix, 0, 0, 1); CH.setStitch(mix, 1, 1, 't');
  assert.ok(MC.checkCompat(m, { chart: mix }).some((x) => x.level === 'hata' && /karışık/.test(x.msg)));
  const cb = CH.createChart({ w: 6, h: 1 }); CH.setStitch(cb, 0, 0, 'c6R'); const v = vb(); v.maxRack = 2;
  assert.ok(MC.checkCompat(v, { chart: cb }).some((x) => x.level === 'hata' && /3 iğne kaydırma/.test(x.msg)));
  assert.ok(MC.checkCompat(hd(), { swatch: { st10: 10 } }).some((x) => /örülemeyebilir/.test(x.msg)), 'gauge uyumsuz');
  assert.ok(!MC.checkCompat(hd(), { swatch: { st10: 28 } }).some((x) => /örülemeyebilir/.test(x.msg)), '28 / 10 cm 4,5 mm uygun');
});

t('3. Operatör programı: kolda her artırma sırası RC ile, toplam artırma = (pazu − manşet) / 2; doğrulanmamış başlık; hata varsa program yok', () => {
  const pc = S.computePiece('kol', { cuffW: 200, upperW: 380, length: 560, ribH: 60 }, sw, { rep: 1, ribRep: 2, edge: 1 });
  const r = MC.operatorProgram(hd(), { piece: pc, swatch: sw, name: 'Kol' }); assert.ok(r.ok);
  const inc = r.lines.filter((l) => /her iki yanda 1 iğne artır/.test(l)).length; assert.equal(inc, pc.perSide); assert.equal(inc, (pc.end - pc.castOn) / 2);
  assert.ok(r.lines.some((l) => /\*\*\* DOĞRULANMAMIŞ/.test(l))); assert.ok(r.lines.some((l) => new RegExp(`L${Math.floor(pc.castOn / 2)} – R${pc.castOn - Math.floor(pc.castOn / 2)}`).test(l)));
  for (const st of pc.steps) assert.ok(r.lines.some((l) => l.startsWith(`RC ${String(st).padStart(3, '0')}–${String(st).padStart(3, '0')}: her iki`)), 'RC ' + st);
  const b = S.computePiece('beden', { width: 520, length: 650, ribH: 60, armhole: 220, neckW: 180, neckD: 80 }, sw, {});
  const rb = MC.operatorProgram(hd(), { piece: b, swatch: sw, name: 'Ön' }); assert.ok(rb.lines.some((l) => new RegExp(`ortadaki ${b.neckSt} iğneyi`).test(l)));
  const m = hd(); m.needles = 50; assert.equal(MC.operatorProgram(m, { piece: b }).ok, false);
});

t('4. Delikli kart: jakarda delik = 2. renk; askıda boş = askı; 24 genişlikte tekrar döşenir; en az sıraya tamamlanır', () => {
  const ch = CH.createChart({ w: 4, h: 3, palette: [{ name: 'A', hex: '#fff' }, { name: 'B', hex: '#000' }] }); CH.setColor(ch, 1, 0, 1); CH.setColor(ch, 2, 2, 1);
  const c = MC.punchCard(hd(), ch); assert.equal(c.width, 24); assert.equal(c.rows, 36); assert.equal(c.mode, 'fairisle');
  for (let k = 0; k < 36; k++) for (let i = 0; i < 24; i++) assert.equal(c.cells[k][i], CH.getC(ch, i % 4, k % 3) === 1, `${k},${i}`);
  const tk = CH.createChart({ w: 2, h: 2 }); CH.setStitch(tk, 0, 1, 't'); const c2 = MC.punchCard(hd(), tk); assert.equal(c2.mode, 'tuck'); assert.equal(c2.cells[1][0], false); assert.equal(c2.cells[1][1], true); assert.equal(c2.cells[0][0], true);
  assert.throws(() => MC.punchCard(vb(), tk), /delikli kart yok/); assert.throws(() => MC.punchCard(hd(), CH.createChart({ w: 5, h: 1 })), /böleni/);
});

t('5. knitout: düz + ters + askı + saç örgüsü + 2 renk; yapısal benzetim hatasız; her sıra her iğnede şemadaki işlemi yapar', () => {
  const ch = CH.createChart({ w: 8, h: 6, palette: [{ name: 'A', hex: '#fff' }, { name: 'B', hex: '#000' }] });
  CH.setStitch(ch, 0, 0, 'p'); CH.setStitch(ch, 7, 0, 'p'); CH.setStitch(ch, 2, 2, 'c4R'); CH.setStitch(ch, 2, 4, 'c4L'); CH.setStitch(ch, 1, 3, 't'); CH.setStitch(ch, 6, 3, 'm'); CH.setColor(ch, 5, 1, 1); CH.setColor(ch, 6, 5, 1);
  const k = MC.knitout(vb(), ch, { width: 16, rows: 12 }); assert.ok(k.text.startsWith(';!knitout-2\n')); assert.match(k.text, /DOĞRULANMAMIŞ/);
  const s = MC.simulateKnitout(k.text, vb()); assert.deepEqual(s.errors, []); assert.ok(s.ok);
  assert.equal(s.rowsOut.length, 12);
  for (const rw of s.rowsOut) for (let x = 0; x < 16; x++) {
    const y = (rw.row - 1) % 6, st = CH.get(ch, x % 8, y), c = CH.getC(ch, x % 8, y), op = rw.ops.get(x + 1);
    if (st === 'm') { assert.equal(op, undefined, `sıra ${rw.row} iğne ${x + 1} atlama`); continue; }
    assert.ok(op, `sıra ${rw.row} iğne ${x + 1}`); assert.equal(op.op, st === 't' ? 'tuck' : 'knit'); assert.equal(op.bed, st === 'p' ? 'b' : 'f', `plaka ${rw.row}/${x + 1}`); assert.equal(op.car, String(c + 1), 'besleyici');
  }
  assert.match(k.text, /rack 2/); assert.match(k.text, /rack -2/);
});

t('5b. Bütün hazır desenler: knitout benzetimi temiz (ajur hariç: açık hata); baklava ve milano delikli karta çıkar', () => {
  for (const key of Object.keys(CH.TEMPLATES)) {
    const ch = CH.fromTemplate(key);
    if (key === 'ajur') { assert.throws(() => MC.knitout(vb(), ch), /desteklenmiyor/); continue; }
    const k = MC.knitout(vb(), ch, { width: ch.repeat ? ch.repeat.w * 2 : ch.w, rows: ch.h * 2 }), s = MC.simulateKnitout(k.text, vb());
    assert.deepEqual(s.errors, [], key);
  }
  assert.equal(MC.punchCard(hd(), CH.fromTemplate('baklava')).mode, 'fairisle'); assert.equal(MC.punchCard(hd(), CH.fromTemplate('milano')).mode, 'tuck');
});

t('6. knitout benzetimi bozuk programı yakalar: hizasız aktarma, boş iğnede örme, içeride olmayan besleyici, kaydırma sınırı, makine dışı iğne', () => {
  const m = vb(), base = ';!knitout-2\nin 1\ntuck - f2 1\ntuck - f1 1\nknit + f1 1\n; sıra 1\n';
  assert.ok(MC.simulateKnitout(base + 'rack 1\nxfer f1 b1\nout 1\n', m).errors.some((e) => /hizasız/.test(e)));
  assert.ok(MC.simulateKnitout(base + 'knit + f5 1\nout 1\n', m).errors.some((e) => /boş iğnede örme/.test(e)));
  assert.ok(MC.simulateKnitout(base + 'knit + f1 2\nout 1\n', m).errors.some((e) => /besleyici 2 içeride değil/.test(e)));
  assert.ok(MC.simulateKnitout(base + 'rack 9\nout 1\n', m).errors.some((e) => /sınır dışı/.test(e)));
  assert.ok(MC.simulateKnitout(base + 'knit + f999 1\nout 1\n', m).errors.some((e) => /makine dışında/.test(e)));
  assert.ok(MC.simulateKnitout(base, m).errors.some((e) => /içeride kalan/.test(e)));
  assert.ok(MC.simulateKnitout('in 1\n', m).errors.some((e) => /Başlık/.test(e)));
});

t('7. Desteklenmeyen: knitout delik / eksiltme ve kart makinesinde knitout reddedilir; panel saç örgüsünü kesemez; Stoll / Shima biçimi yok', () => {
  const ch = CH.createChart({ w: 4, h: 2 }); CH.setStitch(ch, 1, 0, 'yo'); assert.throws(() => MC.knitout(vb(), ch), /desteklenmiyor/);
  assert.throws(() => MC.knitout(hd(), CH.createChart({ w: 4, h: 2 })), /yalnız V yataklı/);
  const cb = CH.createChart({ w: 6, h: 1 }); CH.setStitch(cb, 2, 0, 'c4R'); assert.throws(() => MC.knitout(vb(), cb, { width: 5 }), /kesiyor/);
  assert.ok(!Object.keys(MC).some((k) => /stoll|shima|steiger|apex|m1plus/i.test(k)), 'kapalı biçim çıktısı yok');
});

t('8. Model: makine ekle / doğrula, doğrulama sekmesine profil durumu; JSON gidiş-dönüş', () => {
  const p = M.createProject({ name: 'T', type: 'knit' }); const m = M.addMachine(p, 'hand-std');
  assert.equal(p.knit.machines.length, 1); assert.ok(M.validate(p).some((x) => x.level === 'uyarı' && /DOĞRULANMAMIŞ/.test(x.msg)));
  m.needles = 3; assert.ok(M.validate(p).some((x) => x.level === 'hata' && /İğne sayısı/.test(x.msg))); m.needles = 200;
  m.brand = 'B'; m.model = 'M'; MC.verifyMachine(m, { note: 'numune tuttu, 28/38' }); assert.ok(!M.validate(p).some((x) => /DOĞRULANMAMIŞ/.test(x.msg)));
  const p2 = M.migrate(JSON.parse(JSON.stringify(p))); assert.equal(p2.knit.machines[0].verified.note, 'numune tuttu, 28/38');
  assert.throws(() => M.addMachine(M.createProject({ name: 'W', type: 'woven' }), 'hand-std'), /triko yok/);
});

for (const [name, fn] of tests) {
  try { await fn(); console.log('ok   ', name); }
  catch (e) { fail++; console.log('FAIL ', name, '\n     ', String(e.message).split('\n')[0]); }
}
console.log(fail ? `\n${fail} test başarısız` : '\nTüm testler geçti');
process.exit(fail ? 1 : 0);
