// Çalıştır: node tests/cost.test.mjs
import assert from 'node:assert/strict';
import { computeCost, quantities, qtyTable, suggestions, rawStock, defaultCostConfig, PARAMS } from '../cost.js';
import { frameCalc, newPart, MATERIALS, matById, profileArea, PROFILES } from '../logic.js';
import { groupKey } from '../cutopt.js';

let fail = 0;
const tests = [];
const t = (name, fn) => tests.push([name, fn]);
const near = (a, b, tol, m = '') => assert.ok(Math.abs(a - b) <= tol, m + ' ' + a + ' ≠ ' + b);
const mat = (id) => { const m = matById(id); return { id: m.id, name: m.name, rho: m.rho, kind: m.kind, sy: m.sy }; };
// model: blok (çelik plaka 100×100×20), alüminyum mil Ø50×100, sac, masa iskeleti, 4 delik, kaynak planı
function model(opts = {}) {
  const steel = mat('celik'), alu = mat('al6061');
  const parts = [
    { id: 1, name: 'Plaka', type: 'box', material: steel, rho: steel.rho, kg: 100 * 100 * 20 / 1e6 * steel.rho, stock: { kind: 'block', dims: [100, 100, 20] } },
    { id: 2, name: 'Mil', type: 'cylinder', material: alu, rho: alu.rho, kg: Math.PI * 625 * 100 / 1e6 * alu.rho, stock: { kind: 'bar', D: 50, H: 100 } },
  ];
  const sheets = [];
  if (opts.sheet !== false) {
    parts.push({ id: 3, name: 'Kapak', type: 'sheet', material: steel, rho: steel.rho, kg: 300 * 200 * 2 / 1e6 * steel.rho, stock: { kind: 'sheet', flatL: 300, W: 200, T: 2 } });
    sheets.push({ id: 3, name: 'Kapak', T: 2, flatL: 300, W: 200, bends: 2 });
  }
  const profiles = [];
  if (opts.frame !== false) {
    const p = { ...newPart(9, 'frame', 'add', null), fr: 'table', fw: 1200, fd: 700, fh: 750, fs: 150, pf: 'k40' };
    const c = frameCalc(p), kgPerM = profileArea(PROFILES.k40) * steel.rho / 1000;
    parts.push({ id: 9, name: 'Şase', type: 'frame', material: steel, rho: steel.rho, kg: c.kg, stock: { kind: 'profile' } });
    for (const g of c.cut) profiles.push({ key: groupKey(PROFILES.k40.name, 'Çelik'), profile: PROFILES.k40.name, matName: 'Çelik', matId: 'celik', label: g.role, len: g.len, qty: g.qty, kgPerM });
  }
  return { parts, sheets, profiles, holes: opts.holes === false ? [] : [{ d: 8, depth: 20, count: 4 }], weld: opts.weld === false ? null : { approvedN: 8, workMin: 30, connLen: 2000, wireKg: 0.5, gasL: 100, electrodes: 0, alt: { name: 'Örtülü elektrot', workMin: 45 } }, cutCfg: { stock: 6000, kerf: 3, prices: {} } };
}
function fullCfg() {
  const c = defaultCostConfig();
  c.prices = { celik: 40, al6061: 160 };
  c.labour = 300; c.scrapPrice = 5;
  for (const [id, r] of Object.entries({ saw: 250, laser: 1500, bend: 600, weld: 400, cnc: 1200, lathe: 900, drill: 300, grind: 250 })) c.ops[id].rate = r;
  c.extras.ship.amount = 500; c.extras.pack.amount = 40; c.extras.elec.amount = 150;
  c.weldPrices = { wire: 90, gas: 0.6, electrode: 4 };
  return c;
}
// kalemlerin toplamı = genel maliyet (bağımsız yeniden toplama)
function sumCheck(c) {
  const ops = c.ops.filter((o) => o.on).reduce((s, o) => s + (o.cost || 0), 0);
  const ex = c.extras.items.reduce((s, e) => s + e.cost, 0);
  const total = c.mat.cost - c.mat.scrapReturn + ops + (c.labour.cost || 0) + ex + c.weldCons;
  near(c.total, total, 1e-6, 'toplam');
  near(c.unit * c.Q, c.total, 1e-6, 'birim × adet');
  near(c.fixed + c.variable, c.total, 1e-6, 'sabit + değişken');
}

t('fiyat yoksa uydurulmaz: eksik listesi, toplam eksik', () => {
  const c = computeCost(model(), defaultCostConfig(), 1);
  assert.equal(c.complete, false);
  for (const s of ['Malzeme kg fiyatı: ' + matById('celik').name, 'Malzeme kg fiyatı: ' + matById('al6061').name, 'İşçilik saat ücreti', 'Makine saat ücreti: CNC freze', 'Profil fiyatı (₺/kg ya da ₺/boy): ' + groupKey('Kutu 40×40×2', 'Çelik'), 'Kaynak teli fiyatı (₺/kg)'])
    assert.ok(c.missing.includes(s), 'eksik değil: ' + s + ' | ' + c.missing.join(' ; '));
  assert.equal(c.total, 0);
  assert.ok(c.mat.raw > c.mat.net);           // miktarlar fiyatsız da hesaplanır
});
t('hammadde: blok, çubuk, sac ham kütlesi ve fire', () => {
  const P = { ...PARAMS };
  const m = model();
  near(rawStock(m.parts[0], P).kg, 106 * 106 * 26 / 1e6 * 7.85, 1e-9, 'blok');
  near(rawStock(m.parts[1], P).kg, Math.PI * 28 * 28 * 106 / 1e6 * 2.70, 1e-9, 'çubuk');
  near(rawStock(m.parts[2], P).kg, 300 * 200 * 2 * 1.15 / 1e6 * 7.85, 1e-9, 'sac');
  const c = computeCost(m, fullCfg(), 1);
  const row = c.mat.rows.find((r) => r.name === 'Plaka');
  near(row.fire, row.raw - row.net, 1e-12);
  near(row.cost, row.raw * 40, 1e-9);
  near(c.mat.fireKg, c.mat.raw - c.mat.net, 1e-9);
});
t('süreler: lazer, büküm, delme, testere, kaynak, taşlama', () => {
  const q = quantities(model(), defaultCostConfig());
  near(q.times.laser, 1000 / 4500 + 2 / 60, 1e-9);
  near(q.times.bend, 1, 1e-9);
  near(q.times.drill, 4 * (0.5 + 20 / 60), 1e-9);
  near(q.times.weld, 30, 1e-9); near(q.times.grind, 10, 1e-9);
  const cuts = model().profiles.reduce((s, p) => s + p.qty, 0);
  near(q.times.saw, cuts * 3, 1e-9);
  assert.ok(q.times.cnc > 10 && q.times.lathe > 5);
});
t('tam fiyatlı hesap: kalemler toplamla tutuyor (1, 10, 50, 100 adet)', () => {
  for (const Q of [1, 10, 50, 100]) {
    const c = computeCost(model(), fullCfg(), Q);
    assert.equal(c.complete, true, c.missing.join(';'));
    sumCheck(c);
  }
});
t('adet: sabit giderler bölünür, birim maliyet azalır; profiller adetle yeniden optimize edilir', () => {
  const tbl = qtyTable(model(), fullCfg());
  for (let i = 1; i < tbl.length; i++) assert.ok(tbl[i].unit < tbl[i - 1].unit, tbl.map((x) => x.unit).join(' > '));
  // sabit gider tam olarak: hazırlık süreleri × (makine + işçilik) + parti başı ekstralar
  const c = computeCost(model(), fullCfg(), 10);
  const setup = c.ops.filter((o) => o.on).reduce((s, o) => s + o.setupMin / 60 * (o.rate + 300), 0);
  near(c.fixed, setup + 500 + 150, 1e-6);
  // profiller birlikte kesilince adet başına harcanan boy azalır (1 adet: 2 boy; 50 adette daha az)
  assert.ok(tbl[2].profileBarsPerUnit < tbl[0].profileBarsPerUnit, tbl.map((x) => x.profileBarsPerUnit).join(' / '));
});
t('profillerin ham kütlesi kesim planından: boy sayısı × 6 m', () => {
  const c = computeCost(model({ sheet: false }), fullCfg(), 1);
  const pr = c.mat.profiles[0];
  near(pr.raw, pr.bars * 6 * profileArea(PROFILES.k40) * 7.85 / 1000, 1e-9);
  near(pr.cost, pr.raw * 40, 1e-9);
  // ₺/boy girilirse o kullanılır
  const cfg = fullCfg(); const m = model({ sheet: false }); m.cutCfg.prices = { [m.profiles[0].key]: 650 };
  near(computeCost(m, cfg, 1).mat.profiles[0].cost, pr.bars * 650, 1e-9);
});
t('doğrusal model (profilsiz): toplam = sabit + birim değişken × adet', () => {
  const m = model({ frame: false });
  const a = computeCost(m, fullCfg(), 1), b = computeCost(m, fullCfg(), 37);
  near(b.fixed, a.fixed, 1e-9);
  near(b.total, a.fixed + a.variableUnit * 37, 1e-6);
});
t('hurda geri satışı maliyetten düşer, ekstra adet başı / parti başı', () => {
  const cfg = fullCfg(), c1 = computeCost(model(), cfg, 1);
  near(c1.mat.scrapReturn, c1.mat.fireKg * 5, 1e-9);
  cfg.extras.pack.per = 'batch';
  const c2 = computeCost(model(), cfg, 10), c3 = computeCost(model(), fullCfg(), 10);
  near(c3.extras.cost - c2.extras.cost, 40 * 10 - 40, 1e-9);
});
t('kaynak sarfı: tel + gaz miktarı × kullanıcı fiyatı', () => {
  const c = computeCost(model(), fullCfg(), 2);
  near(c.weldCons, 2 * (0.5 * 90 + 100 * 0.6), 1e-9);
});
t('makine kapatma ve süre elle girme', () => {
  const cfg = fullCfg(); cfg.ops.cnc.on = false; cfg.ops.lathe.hours = 0.5;
  const c = computeCost(model(), cfg, 1);
  assert.ok(!c.ops.find((o) => o.id === 'cnc').on);
  const l = c.ops.find((o) => o.id === 'lathe');
  near(l.runMin, 30, 1e-9); near(l.cost, (30 + 30) / 60 * 900, 1e-9);
  sumCheck(c);
});
t('öneri: daha ucuz ve dayanımlı malzeme (fiyat girilince), fiyatsız öneri uydurmaz', () => {
  const ms = MATERIALS.map((m) => ({ id: m.id, name: m.name, rho: m.rho, kind: m.kind, sy: m.sy }));
  const none = suggestions(model(), defaultCostConfig(), 1, ms);
  assert.ok(none.items.filter((s) => s.kind === 'material').every((s) => s.need && s.saving == null));
  const cfg = fullCfg(); cfg.prices.celik = 60; cfg.prices.aluminyum = 140; cfg.prices.paslanmaz = 200;
  const s = suggestions(model(), cfg, 1, ms);
  const alu = s.items.find((x) => x.title === matById('al6061').name + ' yerine ' + matById('aluminyum').name);
  assert.ok(alu && alu.saving > 0 && alu.verify, 'daha zayıf alüminyuma geçiş doğrulama istemeli');
  near(alu.saving, alu.current - alu.alt, 1e-9);
  assert.ok(!s.items.some((x) => x.title.includes('yerine ' + matById('paslanmaz').name)));   // daha pahalı → önerilmez
});
t('öneri: plaka bloktan CNC yerine lazer, mil için torna, kaynak yöntemi, talaş oranı, gereksiz parça', () => {
  const ms = MATERIALS.map((m) => ({ id: m.id, name: m.name, rho: m.rho, kind: m.kind, sy: m.sy }));
  const m = model();
  m.parts.push({ id: 20, name: 'Cepli gövde', type: 'box', material: mat('celik'), rho: 7.85, kg: 10, stock: { kind: 'block', dims: [200, 200, 200] } });
  m.parts.push({ id: 21, name: 'Gömülü pim', type: 'box', material: mat('celik'), rho: 7.85, kg: 0, stock: { kind: 'block', dims: [10, 10, 10] } });
  const s = suggestions(m, fullCfg(), 1, ms);
  const las = s.items.find((x) => x.title === 'Plaka: bloktan CNC yerine lazer kesim');
  assert.ok(las && las.saving > 0, JSON.stringify(s.items.map((x) => x.title)));
  assert.ok(s.items.some((x) => x.title === 'Mil: CNC freze yerine torna'));
  assert.ok(s.items.some((x) => x.title.startsWith('Cepli gövde: hammaddenin %') && x.saving > 0));
  assert.ok(s.items.some((x) => x.title === 'Gömülü pim: gereksiz parça olabilir'));
  assert.ok(!s.items.some((x) => x.title.startsWith('Kaynak yöntemi')));   // örtülü elektrot daha yavaş → önerilmez
  assert.ok(s.items.some((x) => x.kind === 'qty' && x.saving > 0));
  near(s.alt, s.base.total - s.totalSaving, 1e-9);
  assert.ok(s.totalSaving > 0 && s.totalSaving < s.base.total);
});

for (const [name, fn] of tests) {
  try { await fn(); console.log('ok   ', name); }
  catch (e) { fail++; console.log('FAIL ', name, '\n     ', e.message.split('\n')[0].slice(0, 500)); }
}
console.log(fail ? `\n${fail} test BAŞARISIZ` : '\nTüm testler geçti');
process.exit(fail ? 1 : 0);
