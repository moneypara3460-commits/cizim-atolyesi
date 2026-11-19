// Çalıştır: node tests/stdparca.test.mjs
// Standart parça kütüphanesi (stdparca.js): tablolar kaynaklarla, parça tarifleri geometriyle karşılaştırılır.
import assert from 'node:assert/strict';
import * as S from '../stdparca.js';
import * as D from '../delik.js';

let fail = 0;
const t = (name, fn) => {
  try { fn(); console.log('ok   ', name); }
  catch (e) { fail++; console.log('FAIL ', name, '\n     ', String(e.message || e).split('\n').slice(0, 4).join(' / ')); }
};
const near = (a, b, tol, m = '') => assert.ok(Math.abs(a - b) <= tol, `${m} ${a} ≉ ${b} (±${tol})`);
const PI = Math.PI;

t('1) kaynaklardaki örnek değerler', () => {
  assert.deepEqual(S.VIDA_4762.M6, [10, 6, 5, 3]);          // dk, k, s, t (Keller & Kalmbach M6)
  assert.deepEqual(S.VIDA_4762.M16, [24, 16, 14, 8]);
  assert.deepEqual(S.SOMUN_4032.M8, [13, 6.8]); assert.deepEqual(S.SOMUN_4032.M24, [36, 21.5]);
  assert.deepEqual(S.PUL_7089.M10, [10.5, 20, 2]); assert.deepEqual(S.PUL_7089.M20, [21, 37, 3]);
  assert.deepEqual(S.RULMAN[6204], [20, 47, 14]); assert.deepEqual(S.RULMAN[6304], [20, 52, 15]); assert.deepEqual(S.RULMAN[6000], [10, 26, 8]);
});

t('2) tablolar tutarlı: vida başı > gövde, k = d, lokma başın içinde; somun s > d; pul d1 > d, d2 > d1; rulman D > d', () => {
  for (const [m, [dk, k, s, tt]] of Object.entries(S.VIDA_4762)) {
    const d = parseFloat(m.slice(1));
    assert.equal(k, d, m + ' k = d');
    assert.ok(dk > d && s / Math.sqrt(3) * 2 < dk && tt < k, m);
  }
  for (const [m, [s, mm]] of Object.entries(S.SOMUN_4032)) { const d = parseFloat(m.slice(1)); assert.ok(s > d && mm > 0.3 * d && mm < d, m); }
  for (const [m, [d1, d2, h]] of Object.entries(S.PUL_7089)) { const d = parseFloat(m.slice(1)); assert.ok(d1 > d && d2 > d1 && h > 0, m); }
  // pul iç çapı ISO 273 ince serisinin aynısıdır (iki ayrı standart birbirini doğrular)
  for (const m of Object.keys(S.PUL_7089)) assert.equal(S.PUL_7089[m][0], D.GECIS[m][0], m + ' pul d1 = ISO 273 ince');
  for (const [no, [d, DD, B]] of Object.entries(S.RULMAN)) { assert.ok(DD > d && B > 0, no); assert.equal(d, { '00': 10, '01': 12, '02': 15, '03': 17 }[String(no).slice(2)] ?? 5 * +String(no).slice(2), no + ' delik kodu'); }
});

t('3) kademe ölçüsü vida başına uyar: kademe çapı > baş çapı, derinlik = baş yüksekliği', () => {
  for (const m of Object.keys(S.VIDA_4762)) {
    if (!D.KADEME[m]) continue;
    assert.ok(D.KADEME[m] > S.VIDA_4762[m][0], m + ' kademe Ø' + D.KADEME[m] + ' > baş Ø' + S.VIDA_4762[m][0]);
    const k = D.delikKesiti({ tur: 'kademe', olcu: m, boydan: true }, 100);
    assert.equal(k.kademe.der, S.VIDA_4762[m][1], m + ' kademe derinliği = k');
  }
});

// dönel profil hacmi (Pappus, çokgen): ∑ alan · 2π · ağırlık merkezi yarıçapı
function revolveVol(pts) {
  let A = 0, Cx = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x0, y0] = pts[i], [x1, y1] = pts[(i + 1) % pts.length], c = x0 * y1 - x1 * y0;
    A += c; Cx += (x0 + x1) * c;
  }
  A /= 2; Cx /= 6 * A;
  return Math.abs(2 * PI * Cx * A);
}
const polyArea = (P) => Math.abs(P.reduce((a, [x0, y0], i) => { const [x1, y1] = P[(i + 1) % P.length]; return a + x0 * y1 - x1 * y0; }, 0) / 2);
t('4) vida tarifi: gövde + baş profilinin hacmi, lokma altıgeni ve yerleri', () => {
  const tr = S.tarif({ tur: 'vida', olcu: 'M8', boy: 30 });
  const [body, sock] = tr.parcalar;
  assert.equal(tr.ad, 'ISO 4762 M8×30');
  near(revolveVol(body.pts), PI * 16 * 30 + PI * 6.5 * 6.5 * 8, 1e-6, 'gövde + baş');
  assert.equal(body.taban, -30);
  assert.ok(sock.yardimci && sock.op === 'sub' && sock.taban === 8 - 4, 'lokma başın üstünden 4 mm');
  near(polyArea(sock.pts), (Math.sqrt(3) / 2) * 36, 0.01, 'altıgen alanı s = 6');
  // karşılıklı kenarlar arası = s
  const ys = sock.pts.map((p) => p[1]); near(Math.max(...ys) - Math.min(...ys), 6, 0.002, 'anahtar ağzı');
  near(S.hacim({ tur: 'vida', olcu: 'M8', boy: 30 }), PI * 16 * 30 + PI * 42.25 * 8 - (Math.sqrt(3) / 2) * 36 * 4, 1e-6);
});

t('5) somun, pul, rulman tarifleri ve hacimleri', () => {
  const n = S.tarif({ tur: 'somun', olcu: 'M8' }).parcalar[0];
  assert.equal(n.h, 6.8); near(polyArea(n.pts), (Math.sqrt(3) / 2) * 169, 0.05);
  assert.equal(n.more.length, 1);
  const w = S.tarif({ tur: 'pul', olcu: 'M10' }).parcalar[0];
  assert.deepEqual([w.d, w.di, w.h], [20, 10.5, 2]);
  const b = S.tarif({ tur: 'rulman', olcu: '6204' });
  assert.deepEqual([b.parcalar[0].d, b.parcalar[0].di, b.parcalar[0].h], [47, 20, 14]);
  assert.ok(/sadeleştirilmiş/.test(b.yazi));
  near(S.hacim({ tur: 'pul', olcu: 'M10' }), (PI / 4) * (400 - 110.25) * 2, 1e-9);
});

t('6) geçersiz girdi varsayılana döner', () => {
  assert.deepEqual(S.normalize({ tur: 'x', olcu: 'M99', boy: 7 }), { tur: 'vida', olcu: 'M8', boy: 25 });
  assert.equal(S.normalize({ tur: 'rulman', olcu: 'M8' }).olcu, '6204');
});

console.log(fail ? `\n${fail} test başarısız` : '\nhepsi geçti');
process.exit(fail ? 1 : 0);
