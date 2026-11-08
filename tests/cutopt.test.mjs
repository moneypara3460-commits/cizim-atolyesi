// Çalıştır: node tests/cutopt.test.mjs
import assert from 'node:assert/strict';
import { optimizeCuts, barUsage, groupKey, remnantChanges, cutPlanRows, pdfFromJpegs } from '../cutopt.js';

let fail = 0;
const t = (name, fn) => {
  try { fn(); console.log('ok   ', name); }
  catch (e) { fail++; console.log('FAIL ', name, '\n     ', e.message.split('\n')[0]); }
};
const K = groupKey('Kutu 40×40×2', 'Çelik');
const P = (len, qty, label, key = K) => ({ key, label, len, qty });
// her boy için: 6000'i asla aşmasın, parça sayısı korunsun
function check(res, pieces) {
  for (const g of res.groups) for (const b of g.bars) {
    const u = barUsage(b.cuts.map((c) => c.len), b.stockLen, res.settings.kerf, res.settings.trim);
    assert.ok(u.fits, 'boy aşıldı: ' + b.cuts.map((c) => c.len).join('+'));
    const total = b.used + b.kerfLoss + b.rest + b.trim;
    assert.ok(Math.abs(total - b.stockLen) < 0.11, 'denge tutmuyor ' + total + ' ≠ ' + b.stockLen);
  }
  const want = pieces.reduce((s, p) => s + p.qty, 0);
  const got = res.groups.reduce((s, g) => s + g.bars.reduce((x, b) => x + b.cuts.length, 0) + g.errors.reduce((x, e) => x + e.qty, 0), 0);
  assert.equal(got, want, 'parça sayısı tutmuyor');
}

t('örnek liste (1800×4, 1200×6, 750×8, 450×8), testere 3 mm', () => {
  const pcs = [P(1800, 4, 'A'), P(1200, 6, 'B'), P(750, 8, 'C'), P(450, 8, 'D')];
  const r = optimizeCuts(pcs, { kerf: 3 });
  check(r, pcs);
  const s = r.groups[0].stats;
  assert.equal(s.bars, 5); assert.equal(s.lowerBound, 5); assert.ok(s.optimal);
  assert.equal(s.cutLen, 24000); assert.equal(s.buyLen, 30000);
  assert.ok(Math.abs(s.cutLen + s.kerfLoss + s.keepLen + s.scrapLen - 30000) < 0.5);
});
t('tek çeşit profil: 26 × 900 mm → 6 parça/boy, 5 boy', () => {
  const pcs = [P(900, 26, 'Kuşak')];
  const r = optimizeCuts(pcs, { kerf: 3 });
  check(r, pcs);
  assert.equal(r.groups[0].stats.bars, 5);
  assert.equal(r.groups[0].bars[0].cuts.length, 6);
  // aynı düzendeki boylar yan yana gruplanır
  assert.equal(r.groups[0].patterns[0].count, 4);
});
t('testere payı 0: tam 6000 kombinasyonu (3000+2000+1000) fire sıfır', () => {
  const pcs = [P(3000, 2, 'X'), P(2000, 2, 'Y'), P(1000, 2, 'Z')];
  const r = optimizeCuts(pcs, { kerf: 0 });
  check(r, pcs);
  const s = r.groups[0].stats;
  assert.equal(s.bars, 2); assert.equal(s.scrapLen, 0); assert.equal(s.keepLen, 0); assert.equal(s.kerfLoss, 0);
});
t('testere payı 3: son parça uca denk gelirse son kesim yok (2×2998,5 sığar)', () => {
  assert.ok(barUsage([2998.5, 2998.5], 6000, 3).fits);
  assert.ok(!barUsage([2999, 2999], 6000, 3).fits);
  assert.equal(barUsage([3000, 3000], 6000, 0).rest, 0);
  const r = optimizeCuts([P(2998.5, 2, 'Y')], { kerf: 3 });
  assert.equal(r.groups[0].stats.bars, 1);
  assert.equal(r.groups[0].bars[0].kerfLoss, 3);
});
t('testere payı 3 ile tam 6000 kombinasyonu artık sığmaz → doğru boy sayısı', () => {
  const pcs = [P(3000, 2, 'X'), P(2000, 2, 'Y'), P(1000, 2, 'Z')];
  const r = optimizeCuts(pcs, { kerf: 3 });
  check(r, pcs);
  assert.equal(r.groups[0].stats.bars, 3);
});
t('6000 mm\'den uzun parça: hata listesine düşer, diğerleri kesilir', () => {
  const pcs = [P(6500, 1, 'Uzun'), P(1000, 3, 'K')];
  const r = optimizeCuts(pcs, { kerf: 3 });
  check(r, pcs);
  assert.equal(r.groups[0].errors.length, 1); assert.equal(r.groups[0].stats.bars, 1);
  // tam 6000 sığar, uç düzeltme varsa sığmaz
  assert.equal(optimizeCuts([P(6000, 1, 'T')], { kerf: 3 }).groups[0].stats.bars, 1);
  assert.equal(optimizeCuts([P(6000, 1, 'T')], { kerf: 3, trim: 5 }).groups[0].errors.length, 1);
});
t('farklı profiller ayrı optimize edilir', () => {
  const K2 = groupKey('Kutu 40×40×3', 'Çelik'), K3 = groupKey('Kutu 40×40×2', 'Paslanmaz');
  const pcs = [P(2900, 1, 'a'), P(2900, 1, 'b', K2), P(2900, 1, 'c', K3)];
  const r = optimizeCuts(pcs, { kerf: 3 });
  check(r, pcs);
  assert.equal(r.groups.length, 3);
  assert.equal(r.total.bars, 3);
});
t('elde kalan artık önce kullanılır, yeni boy sayısı düşer', () => {
  const pcs = [P(1000, 6, 'K')];
  const a = optimizeCuts(pcs, { kerf: 3 });
  assert.equal(a.groups[0].stats.bars, 2);
  const b = optimizeCuts(pcs, { kerf: 3, remnants: [{ id: 'r1', key: K, len: 1200 }, { id: 'r2', key: groupKey('Başka', 'Çelik'), len: 5000 }] });
  check(b, pcs);
  assert.equal(b.groups[0].stats.bars, 1); assert.equal(b.groups[0].stats.remnantsUsed, 1);
  assert.equal(b.groups[0].bars[0].src, 'remnant');
  const ch = remnantChanges(b);
  assert.deepEqual(ch.used, ['r1']);
  // kapalıysa kullanılmaz
  assert.equal(optimizeCuts(pcs, { kerf: 3, useRemnants: false, remnants: [{ id: 'r1', key: K, len: 1200 }] }).groups[0].stats.remnantsUsed, 0);
});
t('kalan profil: minimum saklama boyundan uzunsa stoğa, değilse fire', () => {
  const r = optimizeCuts([P(5000, 1, 'A'), P(5800, 1, 'B')], { kerf: 3, minKeep: 300 });
  const bars = r.groups[0].bars;
  const a = bars.find((b) => b.cuts[0].len === 5000), b = bars.find((x) => x.cuts[0].len === 5800);
  assert.equal(a.rest, 997); assert.equal(a.restKind, 'keep');
  assert.equal(b.rest, 197); assert.equal(b.restKind, 'scrap');
  const ch = remnantChanges(r);
  assert.equal(ch.add.length, 1); assert.equal(ch.add[0].len, 997);
});
t('maliyet ve fire yüzdesi', () => {
  const r = optimizeCuts([P(1500, 8, 'A')], { kerf: 3, prices: { [K]: 450 } });
  const s = r.groups[0].stats;
  assert.equal(s.bars, 3); assert.equal(s.cost, 1350);
  assert.ok(s.scrapPct >= 0 && s.scrapPct < 100);
});
t('zor karışım: alt sınıra ulaşır (FFD\'den iyi)', () => {
  // FFD burada 4 boy kullanır; en iyi 3 boy
  const pcs = [P(2500, 2, 'a'), P(2000, 2, 'b'), P(1500, 2, 'c'), P(1000, 4, 'd'), P(500, 2, 'e')];
  const r = optimizeCuts(pcs, { kerf: 0 });
  check(r, pcs);
  assert.equal(r.groups[0].stats.bars, r.groups[0].stats.lowerBound);
});
t('ondalıklı boylar (gönye uzun kenar 752,4 mm)', () => {
  const pcs = [P(752.4, 15, 'G'), P(1199.6, 4, 'H')];
  const r = optimizeCuts(pcs, { kerf: 3 });
  check(r, pcs);
  assert.ok(r.groups[0].stats.optimal);
});
t('büyük liste hızlı (300 parça)', () => {
  const pcs = [P(1234, 60, 'a'), P(987, 80, 'b'), P(456, 100, 'c'), P(2100, 40, 'd'), P(333, 20, 'e')];
  const t0 = Date.now(); const r = optimizeCuts(pcs, { kerf: 3 }); const dt = Date.now() - t0;
  check(r, pcs);
  assert.ok(dt < 3000, dt + ' ms');
  assert.ok(r.groups[0].stats.bars - r.groups[0].stats.lowerBound <= 1);
});
t('CSV satırları ve PDF yapısı', () => {
  const r = optimizeCuts([P(1800, 4, 'A'), P(450, 3, 'D')], { kerf: 3 });
  const rows = cutPlanRows(r);
  assert.equal(rows.filter((x) => x[5] === 'A').length, 4);
  const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);
  const pdf = new TextDecoder('latin1').decode(pdfFromJpegs([{ jpeg, w: 10, h: 14 }, { jpeg, w: 10, h: 14 }]));
  assert.ok(pdf.startsWith('%PDF-1.4')); assert.ok(pdf.includes('/Count 2')); assert.ok(pdf.trimEnd().endsWith('%%EOF'));
  const xref = +pdf.match(/startxref\n(\d+)/)[1];
  assert.ok(pdf.slice(xref).startsWith('xref'));
  const offs = [...pdf.slice(xref).matchAll(/(\d{10}) 00000 n/g)].map((m) => +m[1]);
  offs.forEach((o, i) => assert.ok(pdf.slice(o).startsWith((i + 1) + ' 0 obj'), 'nesne ' + (i + 1)));
});

console.log(fail ? `\n${fail} test BAŞARISIZ` : '\nTüm testler geçti');
process.exit(fail ? 1 : 0);
