// Çalıştır: node tests/lathe.test.mjs
// CNC TORNA (lathe.js): koordinat ve çap / yarıçap modu, profil ve ofset geometrisi, 11 operasyonun takım yolu,
// malzeme kaldırma simülasyonu (analitik hacim ve çaplarla), çarpışma / sınır kontrolü, Fanuc G-kodu,
// simülasyon ↔ G-kodu tutarlılığı, hatalı parametreler. Yalnız dosya varlığı değil, hesap doğruluğu sınanır.
import assert from 'node:assert/strict';
import * as L from '../lathe.js';

let fail = 0;
const tests = [];
const t = (name, fn) => tests.push([name, fn]);
const near = (a, b, tol, m = '') => assert.ok(Math.abs(a - b) <= tol, `${m} ${a} ≉ ${b} (±${tol})`);
const D2R = Math.PI / 180;
const errs = (iss) => iss.filter((x) => x.level === 'hata');
const base = (over = {}) => ({ name: 'T', mk: 'fanuc2x', mat: 'celik', units: 'mm', xMode: 'diameter', stock: { d: 50, len: 100, face: 0, bore: 0, stickout: 70 }, chuck: { jawD: 110, jawLen: 30, bodyD: 200, bodyLen: 90 }, partLen: 40,
  od: [{ z: 0, r: 25 }, { z: -40, r: 25 }], id: [], safe: 2, retract: 1, tools: L.defaultLatheTools(), ops: [], ...over });
const home = (job) => ({ homeR: L.LATHE_MACHINES[job.mk].xMax / 2, homeZ: L.LATHE_MACHINES[job.mk].zMax });
// profilden analitik parça hacmi: ∫ π (ro² − ri²) dz (ızgaradan bağımsız, ince yamuk kuralı)
function partVolume(job) { const G = L.partGeometry(job); let v = 0; const h = 0.002; for (let z = -job.partLen + h / 2; z < 0; z += h) { const ro = L.radiusAt(G.odE, z, 'min'), ri = G.id.length ? (L.radiusAt(G.id, z, 'max') ?? 0) : 0; v += Math.PI * (ro * ro - ri * ri) * h; } return v; }
// noktanın çoklu çizgiye uzaklığı
function dPoly(p, pts) { let m = Infinity; for (let i = 1; i < pts.length; i++) { const a = pts[i - 1], b = pts[i], dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy, tt = L2 < 1e-18 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L2)); m = Math.min(m, Math.hypot(p[0] - a[0] - tt * dx, p[1] - a[1] - tt * dy)); } return m; }

t('1. Koordinatlar: sanal uç ↔ uç merkezi (dış: −rn, −rn; iç: −rn, +rn); alın tornalamada X = −2·rn; G-kodunda X çap', () => {
  const [od, , , , id] = L.defaultLatheTools(); assert.deepEqual(L.tipVec(od), [-0.8, -0.8]); assert.deepEqual(L.tipVec(id), [-0.4, 0.4]);
  assert.equal(L.tipNumber(od), 3); assert.equal(L.tipNumber(id), 2);
  const job = base({ stock: { d: 50, len: 100, face: 2, bore: 0, stickout: 70 }, ops: [{ type: 'face', on: true, tool: 1, ap: 1, f: 0.2, vc: 200, css: true }] });
  const R = L.planLathe(job); assert.deepEqual(errs(R.issues), []);
  const cuts = R.moves.filter((m) => m.g === 1 && Math.abs(m.p[1] + 0.8) < 1e-9); assert.equal(cuts.length, 2, '2 paso (2 mm / ap 1)');
  near(cuts[0].p[0], 1, 1e-9, '1. paso Z'); near(cuts[1].p[0], 0, 1e-9, '2. paso Z = 0');
  const g = L.postLathe(R).text; assert.match(g, /G01 X-1\.6 Z0\.0 F0\.2/); assert.match(g, /G00 X54\.0 Z1\.0/);
});

t('2. Çap / yarıçap modu: yarıçap modunda bütün X değerleri yarıya iner, geri okununca aynı yol', () => {
  const j1 = L.exampleJob(), j2 = { ...L.exampleJob(), xMode: 'radius' };
  const R1 = L.planLathe(j1), R2 = L.planLathe(j2), g1 = L.postLathe(R1).text, g2 = L.postLathe(R2).text;
  assert.match(g1, /\(X CAP PROGRAMLAMA\)/); assert.match(g2, /\(X YARICAP PROGRAMLAMA/);
  const xs = (g) => [...g.matchAll(/^G0[0123] X(-?[\d.]+)/gm)].map((m) => +m[1]); const a = xs(g1), b = xs(g2);
  assert.equal(a.length, b.length); assert.ok(a.length > 200); for (let i = 0; i < a.length; i++) near(b[i], a[i] / 2, 0.00051, 'X' + i);
  const p1 = L.parseLatheGcode(g1, home(j1)), p2 = L.parseLatheGcode(g2, { ...home(j2), radius: true });
  assert.ok(L.compareMoves(p1.moves, p2.moves, false).ok, 'iki mod aynı yolu verir'); assert.ok(L.compareMoves(R2.moves, p2.moves, false).ok);
  const Rr = L.planLathe({ ...L.exampleJob(), xMode: 'radius' }); Rr.job.mk = 'iso_basic'; assert.throws(() => L.postLathe(Rr), /yarıçap programlama yok/);
});

t('3. Profil geometrisi: yay merkezi ve yönü, r(z) analitik değerle; geriye dönen / negatif profil reddedilir', () => {
  const c = L.arcCenter([-62, 20], [-65, 23], 3, true); near(c[0], -62, 1e-9); near(c[1], 23, 1e-9);
  const c2 = L.arcCenter([-62, 20], [-65, 23], 3, false); near(c2[0], -65, 1e-9); near(c2[1], 20, 1e-9);
  const G = L.partGeometry(L.exampleJob());
  near(L.radiusAt(G.od, -47.5, 'max'), 15 + 5 * (7.5 / 15), 1e-9, 'koni');
  near(L.radiusAt(G.od, -63.5, 'max'), 23 - Math.sqrt(9 - 1.5 * 1.5), 1e-9, 'yay');
  near(L.radiusAt(G.od, -24, 'max'), 10.5, 1e-9, 'kanal dibi'); assert.equal(L.radiusAt(G.od, 5, 'max'), null);
  near(L.elemLength({ t: 'A', a: [-62, 20], b: [-65, 23], c: [-62, 23], R: 3, cw: true }), (Math.PI / 2) * 3, 1e-9);
  assert.ok(L.checkProfile([{ z: 0, r: 5 }, { z: -5, r: 5 }, { z: -3, r: 8 }], 'P').some((e) => /geri dönüş/.test(e)));
  assert.ok(L.checkProfile([{ z: 0, r: -1 }, { z: -5, r: 5 }], 'P').some((e) => /negatif/.test(e)));
  assert.ok(L.checkProfile([{ z: 1, r: 5 }, { z: -5, r: 5 }], 'P').some((e) => /Z = 0/.test(e)));
  assert.ok(L.checkProfile([{ z: 0, r: 5 }, { z: -10, r: 5, R: 2 }], 'P').some((e) => /yay yarıçapı/.test(e)));
});

t('4. Ofset (uç yarıçapı telafisi): her nokta profile tam d uzaklıkta; dış köşe yayı G03 (R = d), iç köşe kesişim; iç yay R − d', () => {
  const G = L.partGeometry(L.exampleJob());
  for (const d of [0.4, 0.8, 1.1]) {
    const off = L.offsetPath(G.odE, d, +1), prof = L.samplePath(G.odE, 0.01);
    for (const p of L.samplePath(off, 0.07)) near(dPoly(p, prof), d, 2e-3, `d=${d} (${p[0].toFixed(2)}, ${p[1].toFixed(2)})`);
    const corner = off.find((e) => e.corner); assert.equal(corner.cw, false, 'dış çapta köşe yayı saat yönü tersi'); near(corner.R, d, 1e-12);
    const fil = off.find((e) => e.t === 'A' && !e.corner && Math.abs(e.c[0] + 62) < 1e-9); near(fil.R, 3 - d, 1e-12, 'iç köşe yuvarlaması'); assert.equal(fil.cw, true);
  }
  const idOff = L.offsetPath(G.id.slice(0, 3), 0.4, -1); for (const p of L.samplePath(idOff, 0.07)) { near(dPoly(p, L.samplePath(G.id.slice(0, 3), 0.01)), 0.4, 2e-3); assert.ok(p[1] < L.radiusAt(G.id, Math.max(-20, Math.min(0, p[0])), 'max') + 1e-9, 'iç ofset eksene doğru'); }
  // takım ucu iç yaya sığmıyorsa (R < rn) komşularla kesiştirilir; köşe çok darsa açık hata
  const tight = L.profileElements([{ z: 0, r: 10 }, { z: -10, r: 10 }, { z: -10.5, r: 10.5, R: 0.5, cw: true }, { z: -20, r: 10.5 }]);
  assert.throws(() => L.offsetPath(tight, 0.8, +1), /çok dar/); assert.ok(L.offsetPath(tight, 0.4, +1).length >= 4, 'uç sığarsa ofset var');
});

t('5. Dış çap tornalama: Ø50 → Ø40, boy 30, ap 1,5: paso sayısı ve seviyeleri, simülasyon çapı ve kaldırılan hacim π(25² − 20²)·30', () => {
  const job = base({ od: [{ z: 0, r: 20 }, { z: -30, r: 20 }, { z: -30, r: 25 }, { z: -40, r: 25 }], ops: [{ type: 'od_turn', on: true, tool: 1, d: 40, z2: -30, ap: 1.5, f: 0.25, vc: 200, css: true }] });
  const r = L.runLathe(job, { res: 0.1 }); assert.deepEqual(errs(r.issues), []); assert.equal(r.ev.residualArea, 0);
  const mv = r.R.moves, lv = mv.filter((m, i) => m.g === 1 && Math.abs(m.p[1] - mv[i - 1].p[1]) < 1e-9 && mv[i - 1].p[0] - m.p[0] > 5).map((m) => +m.p[1].toFixed(4));
  assert.deepEqual(lv, [23.5, 22, 20.5, 20], 'kaba seviyeler 1,5 mm aralıklı, son paso Ø40 (sanal uç yarıçapı 20)');
  near(L.simRadiusAt(r.sim.SG, -15).outer, 20, 0.1, 'işlenmiş çap'); near(L.simRadiusAt(r.sim.SG, -35).outer, 25, 0.1, 'dokunulmamış');
  const v0 = Math.PI * 25 * 25 * 100, v1 = L.gridVolume(r.sim.SG), want = Math.PI * (625 - 400) * 30;
  near(v0 - v1, want, want * 0.02, 'kaldırılan hacim'); assert.equal(r.ev.gougeArea, 0);
  const g = L.postLathe(r.R).text; assert.match(g, /G01 X40\.0 Z-30\.0/);
});

t('6. İç çap tornalama: Ø20 delikli boru → Ø30, derinlik 20; delik yoksa açık hata', () => {
  const job = base({ stock: { d: 50, len: 100, face: 0, bore: 20, stickout: 70 }, ops: [{ type: 'id_turn', on: true, tool: 5, d: 30, z2: -20, ap: 1, f: 0.15, vc: 150, css: true }] });
  const r = L.runLathe(job, { res: 0.1 }); assert.deepEqual(errs(r.issues).filter((x) => !/Simülasyon/.test(x.where)), []);
  near(L.simRadiusAt(r.sim.SG, -10).inner, 15, 0.1, 'işlenmiş iç çap'); near(L.simRadiusAt(r.sim.SG, -25).inner, 10, 0.1, 'derinlikten sonrası');
  const want = Math.PI * (225 - 100) * 20, got = Math.PI * (625 - 100) * 100 - L.gridVolume(r.sim.SG); near(got, want, want * 0.03, 'hacim');
  const noHole = L.planLathe(base({ ops: job.ops })); assert.equal(noHole.ok, false); assert.ok(noHole.issues.some((x) => /önce delik/.test(x.msg)));
});

t('7. Alın tornalama: 2 mm fazla 1 mm pasolarla alınır; ön yüzde malzeme kalmaz, parça yüzü bozulmaz', () => {
  const job = base({ stock: { d: 50, len: 100, face: 2, bore: 0, stickout: 70 }, ops: [{ type: 'face', on: true, tool: 3, ap: 1, f: 0.2, vc: 200, css: true }] });
  const r = L.runLathe(job, { res: 0.05 }); assert.deepEqual(errs(r.issues), []);
  assert.equal(L.simRadiusAt(r.sim.SG, 0.2), null, 'Z > 0 boş'); near(L.simRadiusAt(r.sim.SG, -0.2).outer, 25, 0.06); near(L.simRadiusAt(r.sim.SG, -0.2).inner, 0, 1e-9);
  const want = Math.PI * 625 * 2; near(Math.PI * 625 * 100 - L.gridVolume(r.sim.SG), want, want * 0.03, 'alınan hacim');
});

t('8. Kanal açma: 4 mm kanal, 3 mm takım → 2 dalma (Z −26 ve −25); dip Ø21, duvarlar ±0,15; dar kanal ve erişim hatası', () => {
  const job = base({ partLen: 40, ops: [{ type: 'groove', on: true, tool: 4, z: -22, width: 4, bottomD: 40, peck: 1, f: 0.06, vc: 120, css: true }] });
  const r = L.runLathe(job, { res: 0.05 });
  const plunges = [...new Set(r.R.moves.filter((m) => m.g === 1 && Math.abs(m.p[1] - 20) < 1e-9).map((m) => +m.p[0].toFixed(4)))].sort(); assert.deepEqual(plunges, [-26, -25].sort());
  near(L.simRadiusAt(r.sim.SG, -24).outer, 20, 0.06, 'dip'); near(L.simRadiusAt(r.sim.SG, -21.8).outer, 25, 0.06, 'ön duvar önü'); near(L.simRadiusAt(r.sim.SG, -26.2).outer, 25, 0.06, 'arka duvar arkası');
  near(L.simRadiusAt(r.sim.SG, -22.2).outer, 20, 0.06); near(L.simRadiusAt(r.sim.SG, -25.8).outer, 20, 0.06);
  const pecks = r.R.moves.filter((m) => m.g === 1 && Math.abs(m.p[0] + 26) < 1e-9); assert.ok(pecks.length >= 5, 'gagalama: ' + pecks.length);
  const narrow = L.validateJob(base({ ops: [{ ...job.ops[0], width: 2 }] })); assert.ok(narrow.some((x) => /takım genişliğinden/.test(x.msg)));
  const deep = L.validateJob(base({ ops: [{ ...job.ops[0], bottomD: 20 }] })); assert.ok(deep.some((x) => /takım erişimi/.test(x.msg)));
});

t('9. Delik delme: Ø14 × 30; uç derinliği = 30 + 7/tan 59°; gagalama sayısı; delik çapı ve koni', () => {
  const job = base({ id: [{ z: 0, r: 7 }, { z: -30, r: 7 }, { z: -30 - 7 / Math.tan(59 * D2R), r: 0 }], ops: [{ type: 'drill', on: true, tool: 7, d: 14, depth: 30, peck: 8, f: 0.15, rpm: 900 }] });
  const r = L.runLathe(job, { res: 0.05 }); assert.deepEqual(errs(r.issues), []);
  const zEnd = -30 - 7 / Math.tan(59 * D2R), feeds = r.R.moves.filter((m) => m.g === 1);
  near(Math.min(...feeds.map((m) => m.p[0])), zEnd, 1e-9, 'uç Z'); assert.equal(feeds.length, Math.ceil(-zEnd / 8), 'gagalama');
  assert.ok(feeds.every((m) => m.p[1] === 0), 'eksen üzerinde');
  near(L.simRadiusAt(r.sim.SG, -15).inner, 7, 0.06, 'delik yarıçapı'); near(L.simRadiusAt(r.sim.SG, -32).inner, 7 - 2 * Math.tan(59 * D2R), 0.11, 'uç konisi'); near(L.simRadiusAt(r.sim.SG, -36).inner, 0, 1e-9);
  const g = L.postLathe(r.R).text; assert.match(g, /G97 S900 M03/); assert.ok(!/G96/.test(g), 'delmede sabit kesme hızı yok'); assert.match(g, /G01 X0\.0 Z-8\.0 F0\.15/);
  assert.ok(L.validateJob(base({ ops: [{ ...job.ops[0], d: 12 }] })).some((x) => /Matkap çapı/.test(x.msg)));
});

t('10. Konik tornalama: Ø30 (Z −10) → Ø40 (Z −30); son paso ofset doğrusunda, simülasyon çapı doğrusal', () => {
  const job = base({ od: [{ z: 0, r: 15 }, { z: -10, r: 15 }, { z: -30, r: 20 }, { z: -30, r: 25 }, { z: -40, r: 25 }], ops: [{ type: 'taper', on: true, tool: 1, d1: 30, z1: -10, d2: 40, z2: -30, ap: 1.5, f: 0.2, vc: 200, css: true }] });
  const r = L.runLathe(job, { res: 0.05 });
  // analitik: doğrunun normali n = (sin a, cos a), a = atan(5/20); uç merkezi = nokta + rn·n; sanal uç = merkez − (rn, rn)
  const a = Math.atan2(5, 20), n = [Math.sin(a), Math.cos(a)], rn = 0.8, P = (z, rr) => [z + rn * n[0] - rn, rr + rn * n[1] - rn];
  const s = P(-10, 15), e = [-30, 15 + 0.25 * (30 - rn - 10) + rn / Math.cos(a) - rn], fin = r.R.moves.filter((m) => m.g === 1);
  assert.ok(fin.some((m) => Math.hypot(m.p[0] - s[0], m.p[1] - s[1]) < 1e-6), 'koni başlangıcı'); assert.ok(fin.some((m) => Math.hypot(m.p[0] - e[0], m.p[1] - e[1]) < 1e-6), 'koni bitişi: uç merkezi omuz duvarından rn uzakta'); assert.equal(r.ev.gougeArea, 0, 'omuza girmez');
  for (const z of [-12, -20, -28]) near(L.simRadiusAt(r.sim.SG, z).outer, 15 + (5 * (-10 - z)) / 20, 0.1, 'koni çapı Z' + z);
});

t('11. Kaba paso: seviyeler ap aralıklı, hiçbir kaba hareket paya girmez; finiş: uç merkezi konturdan tam rn uzakta; G02 R2,6 ve G03 R0,4', () => {
  const job = L.exampleJob(), R = L.planLathe(job), G = L.partGeometry(job), prof = L.samplePath(G.odE, 0.01);
  const rough = R.ops.find((o) => o.type === 'rough' && job.ops[o.idx].side === 'od'), mv = R.moves.slice(rough.i0 + 3, rough.i1);
  const passes = mv.filter((m, i) => m.g === 1 && i > 0 && mv[i - 1].g === 0 && Math.abs(m.p[1] - mv[i - 1].p[1]) < 1e-9).map((m) => +m.p[1].toFixed(4));
  for (let i = 1; i < passes.length - 1; i++) near(passes[i - 1] - passes[i], 2, 1e-6, 'seviye aralığı = ap');
  assert.equal(passes[0], 23, 'ilk seviye: ham yarıçapı − ap'); assert.ok(passes.length >= 6);
  let prev = null; for (const m of R.moves.slice(rough.i0, rough.i1)) { if (prev && m.g === 1) for (let k = 0; k <= 10; k++) { const p = [prev[0] + ((m.p[0] - prev[0]) * k) / 10 + 0.8, prev[1] + ((m.p[1] - prev[1]) * k) / 10 + 0.8]; if (p[0] <= 0.8) assert.ok(dPoly(p, prof) >= 0.8 + 0.3 - 2e-3, `kaba hareket paya girdi (${p.map((v) => v.toFixed(2))}) ${dPoly(p, prof)}`); } prev = m.p; }
  const fin = R.ops.find((o) => o.type === 'finish' && job.ops[o.idx].side === 'od'), K = L.samplePath(fin.contour, 0.01);
  const cp = fin.compPasses[0]; prev = R.moves[cp.ia].p;
  for (let i = cp.ia + 1; i < cp.ib; i++) { const m = R.moves[i], pts = m.g === 1 ? [0.25, 0.5, 0.75, 1].map((k) => [prev[0] + (m.p[0] - prev[0]) * k, prev[1] + (m.p[1] - prev[1]) * k]) : L.sampleElem({ t: 'A', a: prev, b: m.p, c: m.c, R: m.R, cw: m.cw }, 0.05); for (const q of pts) near(dPoly([q[0] + 0.4, q[1] + 0.4], K), 0.4, 2e-3, 'finiş uç merkezi'); prev = m.p; }
  const g = L.postLathe(R).text; assert.match(g, /G02 X45\.2 Z-65\.0 R2\.6 F0\.1/, 'iç köşe yayı: G02, R = 3 − 0,4'); assert.match(g, /G03 X24\.0 Z-1\.4 R0\.4 F0\.1/, 'dış köşe: G03, R = rn');
  assert.ok(fin.notes.some((x) => /köprülendi: Z -22\.0…-26\.0/.test(x)), 'kanal bölgesi köprülenir'); assert.ok(fin.notes.some((x) => /Rt ≈ 3\.125 µm/.test(x)), 'Rt = f²/(8·rn)');
});

t('12. Takım yolu sınırları: makine X / Z sınırı, aynadan çıkış, dış takımla merkezi geçme', () => {
  const big = L.planLathe(base({ stock: { d: 318, len: 100, face: 0, bore: 0, stickout: 70 }, od: [{ z: 0, r: 155 }, { z: -40, r: 155 }], ops: [{ type: 'od_turn', on: true, tool: 1, d: 310, z2: -20, ap: 2, f: 0.25, vc: 200, css: true }] }));
  assert.ok(big.issues.some((x) => x.level === 'hata' && /X [\d.]+ makine sınırı/.test(x.msg)), 'X sınırı');
  const longZ = L.validateJob(base({ partLen: 75 })); assert.ok(longZ.some((x) => /aynadan çıkışı.*aşıyor/.test(x.msg)));
  const stick = L.validateJob(base({ stock: { d: 50, len: 100, face: 0, bore: 0, stickout: 99 } })); assert.ok(stick.some((x) => /ayna malzemeyi tutamaz/.test(x.msg)));
  const tall = L.validateJob(base({ stock: { d: 20, len: 200, face: 0, bore: 0, stickout: 150 }, od: [{ z: 0, r: 10 }, { z: -40, r: 10 }] })); assert.ok(tall.some((x) => x.level === 'uyarı' && /punta yok/.test(x.msg)));
  const R = L.planLathe(base({ ops: [{ type: 'part', on: true, tool: 8, z: -40, peck: 2, f: 0.05, vc: 100, css: true, endD: 0 }] }));
  assert.ok(Math.min(...R.moves.map((m) => m.p[1])) >= -0.2 - 1e-9, 'kesme merkezi en çok 0,2 geçer'); assert.deepEqual(errs(R.issues), []);
  const bigger = L.validateJob(base({ od: [{ z: 0, r: 30 }, { z: -40, r: 30 }] })); assert.ok(bigger.some((x) => /ham çaptan.*büyük/.test(x.msg)));
});

t('13. Çarpışma kontrolü: ayna çenesi, hızlı harekette malzeme, tutucu (bara dar delikte), kanal bıçağı erişimi; kapsam listesi', () => {
  // kanal aynaya çok yakın: takım çene bölgesine girer
  const j1 = base({ partLen: 60, stock: { d: 50, len: 100, face: 0, bore: 0, stickout: 66 }, od: [{ z: 0, r: 25 }, { z: -60, r: 25 }], ops: [{ type: 'groove', on: true, tool: 4, z: -62.5, width: 4, bottomD: 40, peck: 0, f: 0.06, vc: 120, css: true }] });
  const r1 = L.runLathe(j1, { res: 0.1 }); assert.ok(r1.issues.some((x) => x.level === 'hata' && /ayna çenesi/.test(x.msg)), 'ayna: ' + r1.issues.map((x) => x.msg).join(' | '));
  // bara (en küçük delik Ø12) Ø10 deliğe: bara gövdesi malzemeye çarpar
  const j2 = base({ id: [{ z: 0, r: 5.5 }, { z: -15, r: 5.5 }, { z: -15, r: 5 }, { z: -20, r: 5 }, { z: -20 - 5 / Math.tan(59 * D2R), r: 0 }], ops: [{ type: 'drill', on: true, tool: 7, d: 10, depth: 20, peck: 0, f: 0.12, rpm: 800 }, { type: 'id_turn', on: true, tool: 5, d: 11, z2: -15, ap: 0.5, f: 0.08, vc: 150, css: true }] });
  j2.tools.find((q) => q.id === 7).d = 10; j2.tools.find((q) => q.id === 5).bar = 11.5;
  const r2 = L.runLathe(j2, { res: 0.1 }); assert.ok(r2.issues.some((x) => x.level === 'hata' && /tutucu|çarpıyor/.test(x.msg)), 'bara: ' + r2.issues.map((x) => x.msg).join(' | '));
  // elle bozulmuş yol: hızlı hareket malzemenin içinden
  const R = L.planLathe(base({ ops: [{ type: 'od_turn', on: true, tool: 1, d: 40, z2: -30, ap: 1.5, f: 0.25, vc: 200, css: true }] }));
  const k = R.moves.findIndex((m) => m.g === 1); R.moves[k].g = 0; const sim = L.createSim(R, { res: 0.1 }); sim.step();
  assert.ok(sim.events.some((e) => e.kind === 'çarpışma' && /G00/.test(e.msg)), 'hızlı harekette çarpma');
  // yolu içeri kaydır: parça profiline girme (fazla kesim) yakalanır
  const R2 = L.planLathe(base({ od: [{ z: 0, r: 20 }, { z: -40, r: 20 }], ops: [{ type: 'od_turn', on: true, tool: 1, d: 40, z2: -30, ap: 1.5, f: 0.25, vc: 200, css: true }] }));
  for (const m of R2.moves) if (m.g === 1) m.p = [m.p[0], m.p[1] - 1]; const s2 = L.createSim(R2, { res: 0.1 }); s2.step(); const ev = L.evaluateSim(R2, s2);
  assert.ok(ev.gougeArea > 20, 'fazla kesim alanı ' + ev.gougeArea); near(ev.gougeArea, 30 * (1 - ev.tol), 6, '≈ 30 mm × (1 mm − tolerans)');
  assert.ok(L.CHECK_SCOPE.checked.length >= 6 && L.CHECK_SCOPE.notChecked.some((x) => /Punta/.test(x)) && L.CHECK_SCOPE.notChecked.some((x) => /Taretteki diğer takımlar/.test(x)));
});

t('14. G-kodu: güvenli başlangıç / bitiş, takım çağrısı, G50/G96/G97, M03/M08/M09/M30, yalnız izinli kodlar, ASCII', () => {
  const job = L.exampleJob(), R = L.planLathe(job), g = L.postLathe(R, { date: '12.11.2026' }).text, lines = g.trim().split('\n');
  assert.equal(lines[0], '%'); assert.match(lines[1], /^O2001 \(ORNEK KADEMELI MIL M24\)$/); assert.equal(lines.at(-1), '%'); assert.deepEqual(lines.slice(-5, -1), ['G28 U0.', 'G28 W0.', 'M05', 'M30']);
  const body = lines.filter((l) => !l.startsWith('(') && l !== '%' && !l.startsWith('O'));
  assert.equal(body[0], 'G21 G18 G40 G54 G99 G97'); assert.deepEqual(body.slice(1, 3), ['G28 U0.', 'G28 W0.']);
  for (const tc of ['T0101', 'T0707', 'T0202', 'T0404', 'T0505', 'T0606', 'T0808']) assert.ok(body.some((l) => l.startsWith(tc + ' (')), tc);
  const ti = body.findIndex((l) => l.startsWith('T0202')); assert.equal(body[ti - 1], 'G28 U0.', 'takım değişiminden önce X referans');
  assert.ok(g.includes('G50 S4000\nG96 S200 M03\nM08'), 'sabit kesme hızı + devir sınırı'); assert.match(g, /G97 S800 M03\nM08/);
  const codes = new Set([...body.join('\n').matchAll(/\b([GM]\d+)/g)].map((m) => m[1]));
  const allowed = new Set(['G00', 'G01', 'G02', 'G03', 'G18', 'G21', 'G28', 'G32', 'G40', 'G41', 'G42', 'G50', 'G54', 'G76', 'G96', 'G97', 'G99', 'M03', 'M04', 'M05', 'M08', 'M09', 'M30']);
  for (const c of codes) assert.ok(allowed.has(c), 'izinsiz kod ' + c);
  for (const c of ['G00', 'G01', 'G02', 'G03', 'G18', 'G21', 'G28', 'G40', 'G54', 'G76', 'G96', 'G97', 'G99', 'M03', 'M05', 'M08', 'M09', 'M30']) assert.ok(codes.has(c), 'eksik kod ' + c);
  assert.ok(/^[\x20-\x7e\n]*$/.test(g), 'yalnız ASCII'); assert.match(g, /\(DOGRULANMAMIS PROGRAM/); assert.match(g, /\(SIFIR: PARCA ON YUZU MERKEZI/);
  assert.equal((g.match(/^M08$/gm) || []).length, (g.match(/^M09$/gm) || []).length, 'M08 / M09 eşleşir');
  const nl = L.postLathe(R, { lineNumbers: true }).text; assert.match(nl, /^N10 G21 G18/m); assert.match(nl, /^N20 G28 U0\./m);
  assert.throws(() => L.postLathe(L.planLathe({ ...L.exampleJob(), units: 'inch' })), /İnç çıktı/);
});

t('15. Vida: ISO diş yüksekliği 0,61343·P; G76 paso derinlikleri Δd·√n, en küçük artış, finiş payı, boş paso; G76 satırları; G32 açılımı', () => {
  const o = L.exampleJob().ops.find((x) => x.type === 'thread'), T = L.threadPasses(o, { ang: 60, ext: true });
  near(T.k, 0.61343 * 1.5, 1e-12); near(T.rRoot, 12 - T.k, 1e-12);
  const d = T.depths; near(d[0], 0.25, 1e-12); near(d[1], 0.25 * Math.SQRT2, 1e-12); near(d[2], 0.25 * Math.sqrt(3), 1e-12);
  for (let i = 1; i < d.length - 3; i++) assert.ok(d[i] - d[i - 1] >= 0.05 - 1e-12, 'en küçük artış');
  near(d.at(-3), T.k - 0.05, 1e-12, 'finiş payı'); near(d.at(-2), T.k, 1e-12); near(d.at(-1), T.k, 1e-12, 'boş paso');
  const mins = L.threadPasses({ ...o, first: 0.02, min: 0.1 }, { ang: 60, ext: true }).depths; for (let i = 1; i < mins.length - 3; i++) near(mins[i] - mins[i - 1], 0.1, 1e-9, 'kelepçelenmiş artış');
  near(L.threadPasses({ ...o, side: 'id' }, { ang: 60, ext: false }).k, 0.54127 * 1.5, 1e-12, 'iç vida');
  const R = L.planLathe(L.exampleJob()), g = L.postLathe(R).text;
  assert.match(g, /G76 P020060 Q50 R0\.05\nG76 X22\.16 Z-20\.0 R0\. P920 Q250 F1\.5/); assert.ok(!/G32/.test(g));
  const j32 = L.exampleJob(); j32.ops.find((x) => x.type === 'thread').method = 'G32'; const R32 = L.planLathe(j32), g32 = L.postLathe(R32).text;
  assert.equal((g32.match(/^G32 Z-20\.0 F1\.5$/gm) || []).length, T.passes.length, 'her paso bir G32'); assert.ok(!/^G76/m.test(g32));
  assert.match(g32, new RegExp(`G00 X${(2 * (12 - 0.25)).toFixed(1)} Z3\\.0\\nG32 Z-20\\.0 F1\\.5`), 'ilk paso çapı = anma − 2·Δd');
  // G76 desteklemeyen kumanda: G32'ye çevrilir ve uyarır
  const ex0 = L.exampleJob(), jb = { ...ex0, mk: 'iso_basic', tools: ex0.tools.filter((q) => q.id === 6), ops: ex0.ops.filter((q) => q.type === 'thread') }, Rb = L.planLathe(jb); assert.ok(Rb.issues.some((x) => /G76 desteklemiyor/.test(x.msg))); const gb = L.postLathe(Rb).text; assert.ok(/^G32 /m.test(gb) && !/^G76/m.test(gb), 'G32 açılımı');
});

t('16. Simülasyon ↔ G-kodu: geri okunan program simülasyonun kullandığı hareket listesiyle aynı (G76 açılımı dahil), sapma ≤ 0,001 mm', () => {
  for (const mut of [(j) => j, (j) => { j.ops.find((x) => x.type === 'thread').method = 'G32'; return j; }, (j) => { j.xMode = 'radius'; return j; }, (j) => { j.lineNumbers = true; return j; }]) {
    const job = mut(L.exampleJob()), R = L.planLathe(job), g = L.postLathe(R, { lineNumbers: !!job.lineNumbers }).text, b = L.parseLatheGcode(g, { ...home(job), radius: job.xMode === 'radius' });
    const c = L.compareMoves(R.moves, b.moves, false); assert.ok(c.ok, JSON.stringify(c)); assert.ok(c.maxErr <= 0.001); assert.ok(c.count[0] > 400); assert.deepEqual(b.warn, []);
  }
  // bozulmuş G-kodu fark edilir
  const job = L.exampleJob(), R = L.planLathe(job), g = L.postLathe(R).text.replace('G01 X40.0 Z-62.4', 'G01 X40.0 Z-61.4');
  assert.equal(L.compareMoves(R.moves, L.parseLatheGcode(g, home(job)).moves, false).ok, false);
});

t('17. Kumanda telafisi (G41/G42): program parça konturunu yazar; kontur + rn ofseti simülasyon yoluna eşit; desteklemeyen kumandada hata', () => {
  const job = L.exampleJob(); job.ops.find((o) => o.type === 'finish' && o.side === 'od').comp = 'control'; job.ops.find((o) => o.type === 'finish' && o.side === 'id').comp = 'control';
  const R = L.planLathe(job), g = L.postLathe(R).text;
  assert.match(g, /G42 G01 X22\.0 Z0\.0 F0\.1\nG01 X24\.0 Z-1\.0\nG01 X24\.0 Z-22\.0\nG01 X24\.0 Z-26\.0\nG01 X28\.0 Z-26\.0\nG01 X30\.0 Z-27\.0\nG01 X30\.0 Z-40\.0\nG01 X40\.0 Z-55\.0\nG01 X40\.0 Z-62\.0\nG02 X46\.0 Z-65\.0 R3\.0\nG01 X46\.0 Z-80\.0/);
  assert.match(g, /G41 G01 X18\.0 Z0\.0 F0\.08\nG01 X16\.0 Z-1\.0\nG01 X16\.0 Z-20\.0/); assert.equal((g.match(/G4[12] /g) || []).length, 2); assert.equal((g.match(/^G40 G01/gm) || []).length, 2);
  // simülasyon yolu = kontur ofseti: CAM telafili işle aynı hareketler
  const R0 = L.planLathe(L.exampleJob()); assert.equal(R.moves.length, R0.moves.length); for (let i = 0; i < R.moves.length; i++) near(Math.hypot(R.moves[i].p[0] - R0.moves[i].p[0], R.moves[i].p[1] - R0.moves[i].p[1]), 0, 1e-12);
  const jb = { ...job, mk: 'iso_basic' }; assert.ok(L.validateJob(jb).some((x) => /G41\/G42\) desteklemiyor/.test(x.msg)));
});

t('18. Hatalı parametreler: her biri açık hata verir, takım yolu üretilmez', () => {
  const ex = () => L.exampleJob(), bad = (mut, re) => { const j = ex(); mut(j); const R = L.planLathe(j); assert.equal(R.ok, false, String(re)); assert.equal(R.moves.length, 0); assert.ok(R.issues.some((x) => x.level === 'hata' && re.test(x.msg)), re + ' ← ' + errs(R.issues).map((x) => x.msg).join(' | ')); };
  bad((j) => { j.ops[2].f = -0.1; }, /İlerleme.*pozitif/); bad((j) => { j.ops[2].ap = 0; }, /Talaş derinliği pozitif/); bad((j) => { j.ops[2].f = 3; }, /1 mm\/dev üstünde/);
  bad((j) => { j.ops[1].rpm = 9000; }, /makine en çok 4000/); bad((j) => { j.ops[2].tool = 99; }, /Takım seçilmedi/); bad((j) => { j.ops[2].tool = 4; }, /gerekli \(seçili: Kanal takımı\)/);
  bad((j) => { j.ops[7].z1 = -30; }, /Diş başlangıcı/); bad((j) => { j.ops[7].pitch = 0; }, /Hatve pozitif/); bad((j) => { j.stock.d = 40; }, /ham çaptan/); bad((j) => { j.stock.d = -5; }, /Ham malzeme çapı/);
  bad((j) => { j.tools[0].hand = 'L'; }, /Takım yönü sol/); bad((j) => { j.tools[0].rn = 9; }, /Uç yarıçapı 0–3/); bad((j) => { j.tools[1].n = 1; }, /Aynı taret yerinde/); bad((j) => { j.tools[0].n = 20; }, /12 taret yeri/);
  bad((j) => { j.od[5].z = -10; }, /geri dönüş/); bad((j) => { j.id[1].r = 12; }, /dış profile değiyor/); bad((j) => { j.ops[0].type = 'freze'; }, /türü bilinmiyor/); bad((j) => { j.mk = 'yok'; }, /Makine seçilmedi/);
  bad((j) => { j.ops[4].width = 1; }, /takım genişliğinden/); bad((j) => { j.ops[5].side = 'od'; }, /takım türü uymuyor/); bad((j) => { j.ops[7].rpm = 0; }, /sabit devir gerekli/);
  const w = L.validateJob({ ...ex(), ops: ex().ops.map((o, i) => (i === 2 ? { ...o, vc: 900 } : i === 3 ? { ...o, f: 0.6 } : o)) });
  assert.ok(w.some((x) => x.level === 'uyarı' && /Kesme hızı 900/.test(x.msg))); assert.ok(w.some((x) => x.level === 'uyarı' && /uç yarıçapına.*göre büyük/.test(x.msg)));
  for (const k of Object.keys(L.OP_NAMES_L)) assert.ok(L.OP_DEFAULTS[k], 'varsayılan: ' + k); assert.equal(Object.keys(L.OP_NAMES_L).length, 11);
});

t('19. Profil tornalama (kopya, G73 tipi): pasolar konturun ofsetleri; son paso finişle aynı; köprüleme iniş açısına bağlı', () => {
  const od = [{ z: 0, r: 15 }, { z: -10, r: 15 }, { z: -20, r: 11 }, { z: -30, r: 11 }, { z: -30, r: 20 }, { z: -40, r: 20 }];   // 21,8° iniş
  const job = base({ od, ops: [{ type: 'profile', on: true, tool: 2, passes: 4, allow: 0, f: 0.15, vc: 200, css: true }] });
  const r = L.runLathe(job, { res: 0.1 }); assert.deepEqual(errs(r.issues), []); assert.equal(r.ev.residualArea, 0, 'kalan yok');
  const op = r.R.ops[0]; assert.equal(op.compPasses.length, 4); assert.ok(!op.notes.some((x) => /köprülendi/.test(x)), 'VNMG (iz kenarı 52°) 21,8° inişi takip eder');
  for (const z of [-5, -15, -25, -35]) near(L.simRadiusAt(r.sim.SG, z).outer, L.radiusAt(L.partGeometry(job).od, z, 'max'), 0.17, 'Z' + z);
  // DNMG (iz kenarı 32° → en çok 30°) 45° inişi köprüler
  const steep = base({ od: [{ z: 0, r: 15 }, { z: -10, r: 15 }, { z: -14, r: 11 }, { z: -30, r: 11 }, { z: -30, r: 20 }, { z: -40, r: 20 }], ops: [{ type: 'finish', on: true, side: 'od', tool: 1, f: 0.15, vc: 200, css: true }] });
  const Rs = L.planLathe(steep); assert.ok(Rs.ops[0].notes.some((x) => /en çok 30\.0°.*köprülendi: Z -10\.0…-30\.0/.test(x)), Rs.ops[0].notes.join(' | '));
  const B = L.bridgeContour(L.partGeometry(steep).odE, +1, 30); assert.deepEqual(B.bridged.map((b) => b.map((v) => +v.toFixed(3))), [[-10, -30]]);
  assert.deepEqual(L.bridgeContour(L.partGeometry(steep).odE, +1, 50).bridged, [], '50° takım 45° inişi köprülemez');
});

t('20. Kesme ve ayırma: takım köşesi Z = arka yüz − genişlik; merkezde ilerleme yarıya iner; parça boyu korunur', () => {
  const job = base({ ops: [{ type: 'part', on: true, tool: 8, z: -40, peck: 2, f: 0.05, vc: 100, css: true, endD: 0 }] });
  const r = L.runLathe(job, { res: 0.05 }); assert.deepEqual(errs(r.issues), []);
  const cut = r.R.moves.filter((m) => m.g === 1); assert.ok(cut.every((m) => Math.abs(m.p[0] + 43) < 1e-9), 'Z −43');
  assert.ok(cut.filter((m) => m.p[1] < 3).every((m) => m.f === 0.025) && cut.filter((m) => m.p[1] >= 3).every((m) => m.f === 0.05));
  assert.equal(L.simRadiusAt(r.sim.SG, -41.5), null, 'kesim boşluğu'); near(L.simRadiusAt(r.sim.SG, -39.9).outer, 25, 0.06, 'parça arka yüzü'); near(L.simRadiusAt(r.sim.SG, -43.2).outer, 25, 0.06, 'kalan çubuk');
});

t('21. Örnek parça (kademeli mil M24): 9 operasyon hatasız; fazla kesim 0, kalan 0; kaldırılan hacim = ham − parça (analitik) ±%1,5; süre', () => {
  const job = L.exampleJob(), r = L.runLathe(job, { res: 0.1 });
  assert.deepEqual(errs(r.issues), [], errs(r.issues).map((x) => x.where + ': ' + x.msg).join(' | ')); assert.deepEqual(r.issues.filter((x) => x.level === 'uyarı'), []);
  assert.equal(r.R.ops.length, 9); for (const o of r.R.ops) assert.ok(o.i1 - o.i0 > 3, o.name);
  assert.equal(r.ev.gougeArea, 0); assert.equal(r.ev.residualArea, 0);
  const vp = partVolume(job), vs = L.gridVolume(r.sim.SG, -80, 0.01); near(vs, vp, vp * 0.015, 'simülasyon parça hacmi ↔ analitik');
  assert.ok(vp > 60000 && vp < 110000, 'parça hacmi ' + vp); assert.equal(L.gridVolume(r.sim.SG, 0.01, 10), 0, 'ön yüz önü boş');
  assert.ok(r.sim.threadZones.length >= 10); assert.ok(r.sim.SG.g.some((v) => v === 2), 'diş bölgesi işaretli');
  for (const [z, d] of [[-10, 24], [-24, 21], [-35, 30], [-47.5, 35], [-60, 40], [-75, 46]]) near(2 * L.simRadiusAt(r.sim.SG, z).outer, d, 0.25, 'dış çap Z' + z);
  near(2 * L.simRadiusAt(r.sim.SG, -10).inner, 16, 0.25, 'iç çap'); near(2 * L.simRadiusAt(r.sim.SG, -25).inner, 14, 0.25, 'matkap çapı');
  assert.ok(r.time.total > 60 && r.time.total < 900, 'süre ' + r.time.total); near(r.time.total, r.time.cut + r.time.rapid + r.time.change, 1e-9);
  // adım adım simülasyon tek seferde çalıştırmayla aynı sonucu verir
  const s2 = L.createSim(r.R, { res: 0.1 }); while (!s2.done) s2.step(7); assert.equal(Buffer.compare(Buffer.from(s2.SG.g), Buffer.from(r.sim.SG.g)), 0);
});

t('22. Makine yetenekleri: C / Y ekseni, canlı takım, punta hiçbir profilde yok (varmış gibi gösterilmez); takım doğrulama', () => {
  for (const m of Object.values(L.LATHE_MACHINES)) { assert.equal(m.caps.c, false); assert.equal(m.caps.y, false); assert.equal(m.caps.live, false); assert.equal(m.caps.tail, false); }
  for (const tl of L.defaultLatheTools()) assert.deepEqual(L.validateTool(tl), [], tl.name);
  assert.ok(L.validateTool({ id: 1, n: 0, off: 1, type: 'od', rn: 0.4, kr: 93, kr2: 32, edge: 10, hand: 'R', spin: 'M03' }).some((e) => /1–99/.test(e)));
  assert.ok(L.validateTool({ id: 1, n: 1, off: 1, type: 'groove', rn: 2, w: 3, reach: 5, hand: 'N', spin: 'M03' }).some((e) => /iki katından büyük/.test(e)));
  assert.ok(L.validateTool({ id: 1, n: 1, off: 1, type: 'id', rn: 0.4, kr: 93, kr2: 32, edge: 6, minBore: 8, bar: 10, reach: 30, hand: 'R', spin: 'M05' }).length === 2);
});

for (const [name, fn] of tests) {
  try { await fn(); console.log('ok   ', name); }
  catch (e) { fail++; console.log('FAIL ', name, '\n     ', String(e.message).split('\n')[0]); }
}
console.log(fail ? `\n${fail} test başarısız` : '\nTüm testler geçti');
process.exit(fail ? 1 : 0);
