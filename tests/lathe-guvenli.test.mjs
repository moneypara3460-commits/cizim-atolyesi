// Çalıştır: node tests/lathe-guvenli.test.mjs
// CNC torna Güvenli Kesim: risk haritası (simülasyondan, hareket başına), kuru çalıştırma (havada deneme), riskli satır ve
// ilk geçiş yavaşlatma, satır ↔ hareket izi. Kuru çalıştırmanın hiçbir yere değmediği simülasyonu yeniden koşarak sınanır.
import assert from 'node:assert/strict';
import * as L from '../lathe.js';

let fail = 0;
const t = (name, fn) => { try { fn(); console.log('ok   ', name); } catch (e) { fail++; console.log('FAIL ', name, '\n     ', String(e.message).split('\n')[0].slice(0, 300)); } };
const near = (a, b, tol, m = '') => assert.ok(Math.abs(a - b) <= tol, `${m} ${a} ≉ ${b}`);
const run = (job) => { const R = L.planLathe(job); assert.ok(R.ok, JSON.stringify(R.issues)); const sim = L.createSim(R, { res: 0.2 }); sim.step(); return { R, sim }; };
const job = L.exampleJob(), M = L.LATHE_MACHINES[job.mk];
const home = { homeR: M.xMax / 2, homeZ: M.zMax };

t('Örnek mil: risk haritasında kırmızı yok; her operasyonun ilk yaklaşması sarı (takım ofseti); satır izi programla aynı uzunlukta', () => {
  const { R, sim } = run(job), rk = L.latheRisk(R, sim);
  assert.equal(rk.count.red, 0, JSON.stringify(rk.moves.filter((r) => r.lvl === 2).slice(0, 2)));
  const tc = rk.moves.filter((r) => r.tc);
  assert.equal(tc.length, R.ops.length);
  for (const op of R.ops) assert.ok(rk.moves[op.i0 + 2].tc && /ofsetini/.test(rk.moves[op.i0 + 2].why));
  const trace = [], g = L.postLathe(R, { trace });
  assert.equal(trace.length, g.text.trimEnd().split('\n').length);
  // sarı işaretli her hareket en az bir satırda görünür
  for (const op of R.ops) assert.ok(trace.includes(op.i0 + 2), 'ilk yaklaşma satırı ' + op.idx);
});
t('Hızlı hareket malzemeye girerse o hareket kırmızı (simülasyonun çarpışma bulgusu satıra bağlanır)', () => {
  const { R } = run(job);
  // kaba talaş işleminde bir hızlı hareketi ham çapın içine (Ø30) çek
  const op = R.ops.find((o) => job.ops[o.idx].type === 'rough' && job.ops[o.idx].side === 'od');
  const k = R.moves.findIndex((m, i) => i > op.i0 + 3 && i < op.i1 && m.g === 0);
  const R2 = { ...R, moves: R.moves.map((m, i) => (i === k ? { ...m, p: [-30, 15] } : m)) };
  const sim = L.createSim(R2, { res: 0.2 }); sim.step();
  const rk = L.latheRisk(R2, sim);
  assert.equal(rk.moves[k].lvl, 2); assert.ok(/Hızlı harekette/.test(rk.moves[k].why), rk.moves[k].why);
});
t('Kuru çalıştırma: Z\'ler tam dz kadar kayar, X aynı; kaydırılmış yol simülasyonda hiçbir hücreye değmez, çarpışma yok', () => {
  const { R } = run(job), d = L.latheDryShift(R, 10);
  assert.ok(d.dz > 10 && d.clear === 10);
  const a = L.parseLatheGcode(L.postLathe(R).text, home).moves, b = L.parseLatheGcode(L.postLathe(R, { dryRun: { clear: 10 } }).text, home).moves;
  assert.equal(a.length, b.length);
  let n = 0;
  for (let i = 0; i < a.length; i++) {
    if (a[i].p[0] === home.homeZ && b[i].p[0] === home.homeZ) continue;   // G28 makine referansı kaymaz
    near(b[i].p[0] - a[i].p[0], d.dz, 1e-3, 'Z ' + i); near(b[i].p[1], a[i].p[1], 1e-9, 'X ' + i); n++;
  }
  assert.ok(n > 200);
  // kaydırılmış hareketlerle simülasyon: hiç malzeme kaldırılmaz, hata olayı yok
  const R2 = { ...R, moves: R.moves.map((m) => (m.home || !Number.isFinite(m.p[0]) ? m : { ...m, p: [m.p[0] + d.dz, m.p[1]], c: m.c ? [m.c[0] + d.dz, m.c[1]] : m.c })) };
  const sim = L.createSim(R2, { res: 0.2 }); sim.step();
  assert.equal(sim.st.removed, 0);
  assert.equal(sim.events.filter((e) => e.level === 'hata').length, 0, JSON.stringify(sim.events.slice(0, 2)));
  const txt = L.postLathe(R, { dryRun: { clear: 10 } }).text;
  assert.ok(/KURU CALISTIRMA/.test(txt) && !/M08/.test(txt) && /MAKINE Z STROGU ICINDE/.test(txt));
  // aşırı pay: makine Z stroğu aşılır, başlıkta yazar
  const big = L.latheDryShift(R, 2000); assert.ok(big.over > 0);
  assert.ok(/STROGUNU .* MM ASIYOR/.test(L.postLathe(R, { dryRun: { clear: 2000 } }).text));
});
t('İlk geçiş ve riskli satır yavaşlatma: ilk kesme geçişi %50, sonraki geçişler aynı; diş (G76 / G32) ilerlemesi hiç değişmez', () => {
  const { R, sim } = run(job), rk = L.latheRisk(R, sim);
  const base = L.postLathe(R).text.split('\n'), slow = L.postLathe(R, { firstPass: 0.5, slow: { risk: rk, f: 0.5 }, valuable: true }).text.split('\n');
  assert.equal(base.length + 1, slow.length);   // değerli parça başlık satırı
  const body = slow.filter((l) => !/DEGERLI/.test(l));
  let halved = 0, same = 0;
  for (let i = 0; i < base.length; i++) {
    const fa = /F([\d.]+)/.exec(base[i]), fb = /F([\d.]+)/.exec(body[i]);
    if (!fa) continue;
    if (/G76|G32/.test(base[i])) { assert.equal(fb[1], fa[1], 'diş ilerlemesi: ' + base[i]); continue; }
    if (Math.abs(+fb[1] - +fa[1] * 0.5) < 1e-6) halved++; else { assert.equal(+fb[1], +fa[1], base[i]); same++; }
  }
  assert.ok(halved > 5 && same > 5, halved + ' / ' + same);
  // kaba talaşın ilk kesmesi yarı ilerlemede, ikinci pasosu tam
  const op = R.ops.find((o) => job.ops[o.idx].type === 'rough' && job.ops[o.idx].side === 'od'), o = job.ops[op.idx];
  const trace = [], txt = L.postLathe(R, { firstPass: 0.5, trace }).text.split('\n');
  const cutLines = txt.map((l, i) => [l, trace[i]]).filter(([l, mi]) => mi != null && mi > op.i0 + 2 && mi < op.i1 && /^G01/.test(l));
  near(+/F([\d.]+)/.exec(cutLines[0][0])[1], o.f * 0.5, 1e-9);
  assert.ok(cutLines.some(([l]) => Math.abs(+/F([\d.]+)/.exec(l)[1] - o.f) < 1e-9));
});

console.log(fail ? `\n${fail} test BAŞARISIZ` : '\nTüm testler geçti');
process.exit(fail ? 1 : 0);
