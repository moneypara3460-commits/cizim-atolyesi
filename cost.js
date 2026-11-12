// Akıllı Üretim Maliyeti — saf hesap modülü (3B kütüphanesi gerektirmez; Node'da test edilir: tests/cost.test.mjs)
//
// İLKE: Hiçbir FİYAT uydurulmaz. Malzeme kg fiyatı, profil boy fiyatı, işçilik ve makine saat ücretleri, ekstra giderler kullanıcıdan gelir;
// girilmeyen kalem "eksik" listesine düşer ve toplamın eksik olduğu açıkça belirtilir.
// Miktarlar ve süreler modelden hesaplanır:
//   - Hammadde: net kütle (gerçek 3B hacim × yoğunluk, Ağırlık modülü), ham kütle = stok (blok / çubuk / boru + işleme payı, sac açınımı + yerleşim
//     firesi, profillerde kesim optimizasyonuyla bulunan boy sayısı); fire = ham − net
//   - Süreler: testere kesim adedi, lazer kesim boyu / hız, büküm adedi, talaş hacmi / talaş kaldırma hızı (CNC, torna), delik adedi, kaynak planı
//     süresi, taşlama (kaynak boyu). Süre varsayımları (hız, dakika) görünür ve değiştirilebilir; bunlar fiyat değil süre varsayımıdır.
// Adet: hazırlık (setup) süreleri ve parti başı giderler SABİT, kalanlar adet başı DEĞİŞKEN; profiller her adet için yeniden optimize edilir.

import { optimizeCuts } from './cutopt.js?v=20261112u';

export const OPS = [
  { id: 'saw', name: 'Testere (profil kesim)', setupMin: 10 },
  { id: 'laser', name: 'Lazer kesim', setupMin: 15 },
  { id: 'bend', name: 'Büküm', setupMin: 15 },
  { id: 'weld', name: 'Kaynak', setupMin: 20 },
  { id: 'cnc', name: 'CNC freze', setupMin: 45 },
  { id: 'lathe', name: 'Torna', setupMin: 30 },
  { id: 'drill', name: 'Delme', setupMin: 10 },
  { id: 'grind', name: 'Taşlama', setupMin: 0 },
];
export const EXTRAS = [
  { id: 'elec', name: 'Elektrik', per: 'batch' }, { id: 'cons', name: 'Sarf malzemeleri', per: 'unit' }, { id: 'ship', name: 'Nakliye', per: 'batch' },
  { id: 'asm', name: 'Montaj', per: 'unit' }, { id: 'pack', name: 'Paketleme', per: 'unit' }, { id: 'other', name: 'Diğer giderler', per: 'batch' },
];
// süre varsayımları (fiyat DEĞİL): kullanıcı değiştirebilir
export const PARAMS = {
  allowance: 3,          // işleme payı, her yüzde (mm)
  sheetScrap: 15,        // sac yerleşim (nesting) firesi (%)
  sawMin: 3,             // profil başına testere kesim süresi (dk)
  pierceS: 2,            // lazer delme (pierce) süresi (sn)
  bendMin: 0.5,          // büküm başına süre (dk)
  holeMin: 0.5,          // delik başına yerleştirme süresi (dk) + derinlik / ilerleme
  drillFeed: 60,         // delme ilerlemesi (mm/dk)
  grindMinPerM: 5,       // kaynak temizliği / taşlama (dk / m dikiş)
  finishMin: 10,         // CNC parça başı bitirme / ölçü kontrol (dk)
  latheFactor: 1.5,      // tornada talaş kaldırma hızı CNC frezeye göre kat
  mrr: { metal: 8, paslanmaz: 5, aluminyum: 30, al6061: 30, pirinc: 20, bakir: 15, titanyum: 3, plastic: 40, wood: 60 }, // cm³/dk
  laserSpeed: [[1, 6000], [2, 4500], [3, 3500], [5, 2500], [8, 1500], [12, 900], [20, 500], [Infinity, 300]],          // kalınlık ≤ mm → mm/dk (çelik, tipik)
};
export const defaultCostConfig = () => ({
  qty: 1, prices: {}, scrapPrice: null, labour: null, manualH: 0,
  ops: Object.fromEntries(OPS.map((o) => [o.id, { on: null, rate: null, hours: null, setupMin: o.setupMin }])),
  extras: Object.fromEntries(EXTRAS.map((e) => [e.id, { amount: null, per: e.per }])),
  weldPrices: { wire: null, gas: null, electrode: null },
  params: structuredClone(PARAMS),
});
const num = (v) => (v === null || v === undefined || v === '' ? null : isFinite(Number(v)) ? Number(v) : null);
const pos = (v) => { const n = num(v); return n != null && n >= 0 ? n : null; };
const r2 = (v) => Math.round(v * 100) / 100;
const tr = (v) => String(r2(v)).replace('.', ',');   // metinlerde Türkçe ondalık

/* ---------- hammadde: ham parça (stok) ---------- */
export function rawStock(part, P) {
  const a = Math.max(0, Number(P.allowance) || 0), s = part.stock || {};
  const rho = part.rho, kg = (mm3) => mm3 / 1e6 * rho;
  if (s.kind === 'block') { const [w, l, h] = s.dims; return { kg: kg((w + 2 * a) * (l + 2 * a) * (h + 2 * a)), shape: 'Blok ' + [w, l, h].map((v) => Math.round(v + 2 * a)).join('×'), proc: 'cnc' }; }
  if (s.kind === 'bar') { const D = s.D + 2 * a, H = s.H + 2 * a; return { kg: kg(Math.PI * D * D / 4 * H), shape: 'Çubuk Ø' + Math.round(D) + '×' + Math.round(H), proc: 'lathe' }; }
  if (s.kind === 'pipe') { const H = s.H + 2 * a; return { kg: part.kg * H / Math.max(s.H, 1e-6), shape: 'Boru Ø' + Math.round(s.D) + '/Ø' + Math.round(s.Di) + '×' + Math.round(H), proc: 'saw' }; }
  if (s.kind === 'sheet') { const v = s.flatL * s.W * s.T * (1 + (Number(P.sheetScrap) || 0) / 100); return { kg: kg(v), shape: 'Sac ' + Math.round(s.flatL) + '×' + Math.round(s.W) + '×' + s.T + ' (+%' + P.sheetScrap + ' yerleşim)', proc: 'laser' }; }
  if (s.kind === 'bbox') { const [w, l, h] = s.dims; return { kg: kg((w + 2 * a) * (l + 2 * a) * (h + 2 * a)), shape: 'Blok (dış ölçüden, tahmini) ' + [w, l, h].map((v) => Math.round(v + 2 * a)).join('×'), proc: 'cnc', estimate: true }; }
  return null;   // profil: kesim optimizasyonundan
}
const laserSpeed = (T, P) => { for (const [t, v] of P.laserSpeed) if (T <= t) return v; return 300; };
const mrrOf = (m, P) => (m && (P.mrr[m.id] || (m.kind === 'plastic' ? P.mrr.plastic : m.kind === 'wood' ? P.mrr.wood : P.mrr.metal))) || P.mrr.metal;

/* ---------- miktar ve süre (adet başı) ---------- */
export function quantities(model, cfg) {
  const P = { ...PARAMS, ...(cfg.params || {}) };
  const rows = [], times = Object.fromEntries(OPS.map((o) => [o.id, 0])), why = Object.fromEntries(OPS.map((o) => [o.id, []]));
  for (const part of model.parts || []) {
    if (!(part.kg > 0)) { rows.push({ ...part, raw: null, note: 'kendine ait hacmi yok' }); continue; }
    if (part.stock && part.stock.kind === 'profile') { rows.push({ ...part, raw: null, profile: true }); continue; }
    const r = rawStock(part, P);
    if (!r) { rows.push({ ...part, raw: null }); continue; }
    const rawKg = Math.max(r.kg, part.kg);
    rows.push({ ...part, raw: rawKg, shape: r.shape, estimate: !!r.estimate });
    const removalCm3 = (rawKg - part.kg) / part.rho * 1000;
    if (r.proc === 'cnc') { const t = removalCm3 / mrrOf(part.material, P) + P.finishMin; times.cnc += t; why.cnc.push(part.name + ': ' + tr(removalCm3) + ' cm³ talaş'); }
    if (r.proc === 'lathe') { const t = removalCm3 / (mrrOf(part.material, P) * P.latheFactor) + P.finishMin / 2; times.lathe += t; why.lathe.push(part.name + ': ' + tr(removalCm3) + ' cm³ talaş'); }
    if (r.proc === 'saw') { times.saw += 2 * P.sawMin; why.saw.push(part.name + ': 2 kesim'); }
  }
  for (const s of model.sheets || []) {
    const L = 2 * (s.flatL + s.W) + (s.holeLen || 0), v = laserSpeed(s.T, P);
    times.laser += L / v + (1 + (s.holes || 0)) * P.pierceS / 60; why.laser.push(s.name + ': ' + Math.round(L) + ' mm kesim, ' + v + ' mm/dk');
    if (s.bends) { times.bend += s.bends * P.bendMin; why.bend.push(s.name + ': ' + s.bends + ' büküm'); }
  }
  const cuts = (model.profiles || []).reduce((n, p) => n + p.qty, 0);
  if (cuts) { times.saw += cuts * P.sawMin; why.saw.push(cuts + ' profil kesimi'); }
  for (const h of model.holes || []) { times.drill += h.count * (P.holeMin + (h.depth || 0) / P.drillFeed); why.drill.push(h.count + ' × Ø' + tr(h.d) + ' delik'); }
  if (model.weld && model.weld.workMin > 0) { times.weld += model.weld.workMin; why.weld.push(model.weld.approvedN + ' onaylı kaynak (Kaynak sekmesi)'); }
  if (model.weld && model.weld.connLen > 0) { times.grind += model.weld.connLen / 1000 * P.grindMinPerM; why.grind.push(Math.round(model.weld.connLen) + ' mm dikiş temizliği'); }
  return { rows, times, why, P };
}

/* ---------- maliyet (Q adet) ---------- */
export function computeCost(model, cfg, Q) {
  Q = Math.max(1, Math.round(Number(Q) || 1));
  const qn = quantities(model, cfg), P = qn.P;
  const missing = [], lines = [];
  const price = (mid) => pos(cfg.prices && cfg.prices[mid]);
  // 1) hammadde
  const mat = { net: 0, raw: 0, cost: 0, fireCost: 0, fireKg: 0, rows: [], profiles: [], complete: true };
  for (const r of qn.rows) {
    if (r.raw == null) continue;
    const pr = price(r.material.id), raw = r.raw * Q, net = r.kg * Q;
    const row = { name: r.name, material: r.material.name, matId: r.material.id, net, raw, fire: raw - net, shape: r.shape, estimate: r.estimate, price: pr, cost: pr != null ? raw * pr : null };
    mat.rows.push(row); mat.net += net; mat.raw += raw; mat.fireKg += raw - net;
    if (pr == null) { mat.complete = false; missing.push('Malzeme kg fiyatı: ' + r.material.name); }
    else { mat.cost += row.cost; mat.fireCost += (raw - net) * pr; }
  }
  // profiller: Q adet için birlikte optimize edilir (fire adetle düşer)
  if ((model.profiles || []).length) {
    const cut = model.cutCfg || {};
    const res = optimizeCuts(model.profiles.map((p) => ({ key: p.key, profile: p.profile, material: p.matName, label: p.label, len: p.len, qty: p.qty * Q })), { stock: cut.stock || 6000, kerf: cut.kerf ?? 3, trim: cut.trim || 0, minKeep: cut.minKeep ?? 300, useRemnants: false });
    for (const g of res.groups) {
      const p0 = model.profiles.find((p) => p.key === g.key), kgm = p0.kgPerM, s = g.stats;
      const raw = s.bars * g.stock / 1000 * kgm, net = s.cutLen / 1000 * kgm;
      const perBar = pos(cut.prices && cut.prices[g.key]), pk = price(p0.matId);
      const cost = perBar != null ? s.bars * perBar : pk != null ? raw * pk : null;
      const row = { name: g.key, bars: s.bars, stock: g.stock, net, raw, fire: raw - net, scrapPct: s.scrapPct, keepLen: s.keepLen, price: perBar != null ? perBar : pk, priceUnit: perBar != null ? '₺/boy' : '₺/kg', cost, errors: g.errors.length };
      mat.profiles.push(row); mat.net += net; mat.raw += raw; mat.fireKg += raw - net;
      if (cost == null) { mat.complete = false; missing.push('Profil fiyatı (₺/kg ya da ₺/boy): ' + g.key); }
      else { mat.cost += cost; mat.fireCost += raw > 0 ? cost * (raw - net) / raw : 0; }
      if (g.errors.length) missing.push(g.key + ': stok boyundan uzun parça var (kesim planında hata)');
    }
  }
  const scrapP = pos(cfg.scrapPrice);
  mat.scrapReturn = scrapP != null ? mat.fireKg * scrapP : 0;
  // 2) makine + 3) işçilik
  const ops = [], lab = { min: 0, setupMin: 0 };
  let machCost = 0, machComplete = true, machFixed = 0;
  for (const o of OPS) {
    const c = (cfg.ops && cfg.ops[o.id]) || {};
    const auto = qn.times[o.id];
    const on = c.on == null ? auto > 0 : !!c.on;
    if (!on) { ops.push({ ...o, on: false, auto }); continue; }
    const runMin = pos(c.hours) != null ? pos(c.hours) * 60 : auto;
    const setupMin = pos(c.setupMin) ?? o.setupMin;
    const minTot = setupMin + runMin * Q, rate = pos(c.rate);
    const cost = rate != null ? minTot / 60 * rate : null;
    if (rate == null) { machComplete = false; missing.push('Makine saat ücreti: ' + o.name); }
    else { machCost += cost; machFixed += setupMin / 60 * rate; }
    lab.min += minTot; lab.setupMin += setupMin;
    ops.push({ ...o, on: true, auto, runMin, setupMin, minTot, rate, cost, override: pos(c.hours) != null, why: qn.why[o.id] });
  }
  const manualMin = (pos(cfg.manualH) || 0) * 60 * Q;
  lab.min += manualMin;
  const lr = pos(cfg.labour);
  const labour = { hours: lab.min / 60, setupHours: lab.setupMin / 60, manualHours: manualMin / 60, rate: lr, cost: lr != null ? lab.min / 60 * lr : null, fixed: lr != null ? lab.setupMin / 60 * lr : 0 };
  if (lr == null && lab.min > 0) missing.push('İşçilik saat ücreti');
  // kaynak sarfı (kaynak planından miktar × kullanıcı fiyatı)
  let weldCons = 0;
  const wp = cfg.weldPrices || {}, W = model.weld;
  if (W) {
    if (W.wireKg > 0) { if (pos(wp.wire) != null) weldCons += W.wireKg * Q * pos(wp.wire); else missing.push('Kaynak teli fiyatı (₺/kg)'); }
    if (W.electrodes > 0) { if (pos(wp.electrode) != null) weldCons += W.electrodes * Q * pos(wp.electrode); else missing.push('Elektrot fiyatı (₺/adet)'); }
    if (W.gasL > 0) { if (pos(wp.gas) != null) weldCons += W.gasL * Q * pos(wp.gas); else missing.push('Koruyucu gaz fiyatı (₺/L)'); }
  }
  // 4) ekstralar
  const ex = [];
  let exCost = 0, exFixed = 0;
  for (const e of EXTRAS) {
    const c = (cfg.extras && cfg.extras[e.id]) || {};
    const a = pos(c.amount), per = c.per || e.per;
    if (a == null) { ex.push({ ...e, per, amount: null, cost: 0 }); continue; }
    const cost = per === 'unit' ? a * Q : a;
    exCost += cost; if (per !== 'unit') exFixed += a;
    ex.push({ ...e, per, amount: a, cost });
  }
  // toplamlar
  const matCost = mat.cost - mat.scrapReturn;
  const total = matCost + machCost + (labour.cost || 0) + exCost + weldCons;
  const fixed = machFixed + labour.fixed + exFixed;
  const complete = !missing.length;
  return {
    Q, mat: { ...mat, costNet: matCost }, ops, machine: { cost: machCost, complete: machComplete, fixed: machFixed }, labour, weldCons, extras: { items: ex, cost: exCost, fixed: exFixed },
    total, unit: total / Q, fixed, variable: total - fixed, variableUnit: (total - fixed) / Q, missing: [...new Set(missing)], complete,
    estimates: qn.rows.filter((r) => r.estimate).map((r) => r.name), P,
  };
}
export const QTY_STEPS = [1, 10, 50, 100];
export function qtyTable(model, cfg, steps = QTY_STEPS) { return steps.map((q) => { const c = computeCost(model, cfg, q); return { q, total: c.total, unit: c.unit, fixedUnit: c.fixed / q, variableUnit: c.variableUnit, complete: c.complete, fire: c.mat.fireKg / q, profileScrap: c.mat.profiles.map((p) => p.scrapPct), profileBarsPerUnit: c.mat.profiles.reduce((s, p) => s + p.bars, 0) / q }; }); }

/* ---------- akıllı maliyet optimizasyonu (doğrulanabilir hesaplar) ---------- */
// materials: [{ id, name, rho, kind, sy }] (uygulamanın malzeme listesi)
export function suggestions(model, cfg, Q, materials) {
  Q = Math.max(1, Math.round(Number(Q) || 1));
  const base = computeCost(model, cfg, Q), out = [], P = base.P;
  const price = (mid) => pos(cfg.prices && cfg.prices[mid]);
  // 1) daha ucuz malzeme: aynı tür (metal / plastik / ahşap), fiyatı girilmiş malzemelerle; hacim aynı, kütle yoğunlukla değişir
  const byMat = new Map();
  for (const r of base.mat.rows) { if (!byMat.has(r.matId)) byMat.set(r.matId, { raw: 0, cost: 0, names: [] }); const g = byMat.get(r.matId); g.raw += r.raw; g.cost += r.cost || 0; g.names.push(r.name); }
  for (const [mid, g] of byMat) {
    const cur = materials.find((m) => m.id === mid), pc = price(mid);
    if (!cur) continue;
    const alts = materials.filter((m) => m.id !== mid && m.kind === cur.kind && price(m.id) != null);
    if (pc == null || !alts.length) {
      out.push({ kind: 'material', title: 'Malzeme alternatifi: ' + cur.name, text: pc == null ? 'Önce ' + cur.name + ' kg fiyatını gir.' : 'Karşılaştırmak için aynı türdeki başka malzemelerin (ör. ' + materials.filter((m) => m.id !== mid && m.kind === cur.kind).slice(0, 3).map((m) => m.name).join(', ') + ') kg fiyatını gir.', need: true });
      continue;
    }
    for (const m of alts) {
      const rawAlt = g.raw * m.rho / cur.rho, costAlt = rawAlt * price(m.id);
      if (costAlt >= g.cost - 0.005) continue;
      const weaker = (m.sy || 0) < (cur.sy || 0) * 0.95;
      out.push({ kind: 'material', group: 'm:' + mid, title: cur.name + ' yerine ' + m.name, current: g.cost, alt: costAlt, saving: g.cost - costAlt, verify: weaker,
        text: g.names.slice(0, 4).join(', ') + (g.names.length > 4 ? '…' : '') + ': aynı geometride ham kütle ' + tr(g.raw) + ' → ' + tr(rawAlt) + ' kg.' + (weaker ? ' DİKKAT: akma dayanımı düşük (' + cur.sy + ' → ' + m.sy + ' MPa); Dayanım sekmesinde kontrol et.' : ' Akma dayanımı eşit ya da yüksek (' + cur.sy + ' → ' + m.sy + ' MPa).') + ' İşlenebilirlik, korozyon ve kaynak uygunluğu ayrıca değerlendirilmeli.' });
    }
  }
  // 2) adet: birim maliyet nasıl düşer
  if (base.complete || base.total > 0) {
    const t = qtyTable(model, cfg, [...new Set([Q, ...QTY_STEPS])].sort((a, b) => a - b));
    const cur = t.find((x) => x.q === Q), better = t.filter((x) => x.q > Q && x.unit < cur.unit - 0.005);
    if (better.length) {
      const b = better[0];
      out.push({ kind: 'qty', title: b.q + ' adet üretimde birim maliyet düşer', current: cur.unit, alt: b.unit, saving: cur.unit - b.unit, perUnit: true,
        text: 'Sabit giderler (hazırlık, parti başı giderler) adede bölünür' + (cur.profileBarsPerUnit > 0 ? '; profiller birlikte kesilince adet başına ' + tr(cur.profileBarsPerUnit).toString().replace('.', ',') + ' boy yerine ' + tr(b.profileBarsPerUnit).toString().replace('.', ',') + ' boy profil harcanır' : '') + '.' });
    }
  }
  // 3) talaş oranı yüksek parçalar (gereksiz malzeme)
  for (const r of base.mat.rows) {
    if (!(r.raw > 0) || r.net <= 0) continue;
    const ratio = r.raw / r.net;
    if (ratio >= 3) {
      const near = r.net * 1.3, save = r.price != null ? (r.raw - near) * r.price : null;
      out.push({ kind: 'waste', group: 'w:' + r.name, title: r.name + ': hammaddenin %' + Math.round((1 - r.net / r.raw) * 100) + "'i talaş", current: r.price != null ? r.cost : null, alt: r.price != null ? near * r.price : null, saving: save, verify: false,
        text: 'Ham ' + tr(r.raw) + ' kg, bitmiş parça ' + tr(r.net) + ' kg (' + r.shape + '). Hazır profil / boru / yakın ölçülü hammadde (ör. ham kütle net × 1,3) ile malzeme ' + (save != null ? 've işleme süresi azalır.' : 'azalır (tasarrufu görmek için kg fiyatını gir).') });
    }
  }
  for (const p of model.parts || []) if (!(p.kg > 0)) out.push({ kind: 'waste', title: p.name + ': gereksiz parça olabilir', text: 'Bu parçanın kendine ait hacmi yok (tamamen başka parçaların içinde ya da oyukla silinmiş); üretim listesinden çıkarılabilir.' });
  // 4) fire: profil kesim
  for (const pr of base.mat.profiles) if (pr.scrapPct > 8) out.push({ kind: 'fire', title: pr.name + ': fire %' + String(pr.scrapPct).replace('.', ','), text: pr.bars + ' boydan kalan ' + Math.round(pr.keepLen) + ' mm stoğa döner. Fireyi azaltmak için: birden fazla işi birlikte kes (Kesim optimizasyonu), artık stoğu kullan, eleman boylarını stok boyunun katlarına yaklaştır.' });
  if ((model.sheets || []).length) out.push({ kind: 'fire', title: 'Sac yerleşim firesi %' + P.sheetScrap + ' varsayıldı', text: 'Sac parçaları aynı plakaya birlikte yerleştirmek (nesting) bu oranı düşürür; firmanın gerçek oranını Varsayımlar bölümünde gir.' });
  // 5) alternatif üretim yöntemleri (iki yöntemin de saat ücreti girilmişse hesaplanır)
  const rate = (id) => pos(cfg.ops && cfg.ops[id] && cfg.ops[id].rate), lr = pos(cfg.labour) || 0;
  for (const p of model.parts || []) {
    const s = p.stock || {};
    if (s.kind === 'block' && p.kg > 0) {
      const dims = s.dims.slice().sort((a, b) => a - b), T = dims[0];
      if (T <= 25) {
        // plaka gibi parça: bloktan CNC yerine lazer kesim + (gerekirse) delme
        const pr = price(p.material.id);
        const rawCnc = rawStock(p, P).kg, rem = (rawCnc - p.kg) / p.rho * 1000, tCnc = rem / mrrOf(p.material, P) + P.finishMin;
        const blank = (dims[1] + 10) * (dims[2] + 10) * T * (1 + P.sheetScrap / 100) / 1e6 * p.rho;
        const tLas = 2 * (dims[1] + dims[2]) / laserSpeed(T, P) + P.pierceS / 60;
        if (rate('cnc') != null && rate('laser') != null && pr != null) {
          const cA = rawCnc * pr + tCnc / 60 * (rate('cnc') + lr), cB = blank * pr + tLas / 60 * (rate('laser') + lr);
          if (cB < cA) out.push({ kind: 'method', group: 'p:' + p.id, title: p.name + ': bloktan CNC yerine lazer kesim', current: cA * Q, alt: cB * Q, saving: (cA - cB) * Q, text: T + ' mm kalınlıkta düz parça. CNC: ' + tr(rawCnc) + ' kg blok, ' + tr(tCnc) + ' dk; lazer: ' + tr(blank) + ' kg sac, ' + tr(tLas) + ' dk (adet başı). Yüzey toleransı ve cep / kademe varsa CNC gerekir.' });
        } else out.push({ kind: 'method', title: p.name + ': lazer kesim alternatifi', text: T + ' mm kalınlıkta düz parça; bloktan CNC yerine lazer kesim daha ucuz olabilir. Karşılaştırmak için CNC ve lazer saat ücretlerini ve malzeme fiyatını gir.', need: true });
      }
    }
    if (s.kind === 'bar' && p.kg > 0 && rate('cnc') != null && rate('lathe') != null) {
      const rem = (rawStock(p, P).kg - p.kg) / p.rho * 1000;
      const tC = rem / mrrOf(p.material, P) + P.finishMin, tL = rem / (mrrOf(p.material, P) * P.latheFactor) + P.finishMin / 2;
      const cC = tC / 60 * (rate('cnc') + lr), cL = tL / 60 * (rate('lathe') + lr);
      if (cL < cC) out.push({ kind: 'method', group: 'p:' + p.id, title: p.name + ': CNC freze yerine torna', current: cC * Q, alt: cL * Q, saving: (cC - cL) * Q, text: 'Dönel parça; tornada talaş kaldırma daha hızlı (' + tr(tC) + ' → ' + tr(tL) + ' dk / adet).' });
    }
  }
  if (model.weld && model.weld.alt && model.weld.workMin > 0) {
    const a = model.weld.alt, wr = rate('weld');
    if (wr != null) {
      const cur = model.weld.workMin / 60 * (wr + lr) * Q, alt = a.workMin / 60 * (wr + lr) * Q;
      if (alt < cur) out.push({ kind: 'method', group: 'weld', title: 'Kaynak yöntemi: ' + a.name, current: cur, alt, saving: cur - alt, verify: true, text: 'Tahmini kaynak süresi ' + tr(model.weld.workMin) + ' → ' + tr(a.workMin) + ' dk / adet (sarf fiyatı farkı hariç). Yöntem değişikliği kalite ve şartnameye uygun olmalı.' });
    }
  }
  out.sort((a, b) => (b.saving || 0) - (a.saving || 0));
  // toplam olası tasarruf: her kalem (grup) için en iyi öneri; adet önerisi ve doğrulama gerektirenler hariç
  const bestBy = new Map();
  for (const x of out) if (x.saving > 0 && x.kind !== 'qty' && !x.verify && x.group) { const b = bestBy.get(x.group); if (!b || x.saving > b.saving) bestBy.set(x.group, x); }
  const totalSaving = [...bestBy.values()].reduce((s, x) => s + x.saving, 0);
  return { items: out, base, totalSaving, alt: base.total - totalSaving };
}
