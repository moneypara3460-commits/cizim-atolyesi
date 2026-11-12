// Üretim föyü ve maliyet (Aşama 10) — saf modül.
// Operasyon listesi (dikim / örgü sırası), işçilik süresi (SMV, dakika), maliyet kartı, sipariş ve malzeme ihtiyacı.
// Kural: eksik girdi varsa o kalem HESAPLANMAZ ve eksik olarak yazılır; şablon süreleri "tahmini" işaretlidir.

export const OP_MACHINES = {
  kesim: 'Kesim (pastal / masa)', duz: 'Düz dikiş makinesi (301)', overlok3: 'Overlok 3 iplik (504)', overlok4: 'Emniyetli overlok (516)',
  recme: 'Reçme (406 / 602)', ilik: 'İlik makinesi', dugme: 'Düğme makinesi', punteriz: 'Punteriz (bartack)', utu: 'Ütü / pres',
  el: 'El işi', orgu: 'Örgü makinesi (triko)', remaye: 'Remayöz / kapama (linking)', yikama: 'Yıkama / fikse', kontrol: 'Kalite kontrol', paket: 'Etiket / paketleme',
};
// Şablon süreler: genel sektör sıralamasına göre kaba değerler (dakika). Firma zaman etüdüyle DEĞİŞTİRİLMELİ; "tahmini" gelir.
export const OP_TEMPLATES = {
  gomlek: [
    ['Kesim (adet başına pay)', 'kesim', 1.2], ['Yaka ayağı + yaka hazırlama', 'duz', 2.4], ['Manşet hazırlama (2)', 'duz', 1.6], ['Cep hazırlama ve takma', 'duz', 1.1],
    ['Ön pat dikimi', 'duz', 1.0], ['Omuz çatma', 'overlok4', 0.6], ['Yaka takma', 'duz', 1.8], ['Kol takma (2)', 'overlok4', 1.6],
    ['Yan + kol altı çatma', 'overlok4', 1.4], ['Manşet takma (2)', 'duz', 1.8], ['Etek kıvırma', 'duz', 0.9], ['İlik açma (8)', 'ilik', 0.9],
    ['Düğme dikme (8)', 'dugme', 0.8], ['İplik temizleme + kontrol', 'kontrol', 1.0], ['Ütü', 'utu', 1.5], ['Katlama + paketleme', 'paket', 0.8],
  ],
  etek: [
    ['Kesim (adet başına pay)', 'kesim', 0.8], ['Pens dikimi (4)', 'duz', 0.8], ['Kenar overloğu', 'overlok3', 0.9], ['Gizli fermuar takma', 'duz', 1.6],
    ['Yan dikişler', 'duz', 1.0], ['Kemer hazırlama ve takma', 'duz', 1.8], ['Etek ucu', 'duz', 0.9], ['İlik + düğme', 'ilik', 0.4],
    ['Kontrol', 'kontrol', 0.6], ['Ütü', 'utu', 1.0], ['Paketleme', 'paket', 0.5],
  ],
  kazak: [
    ['Örgü: beden ön + arka (makine süresi, kişi başı payı)', 'orgu', 6.0], ['Örgü: kollar (2)', 'orgu', 4.0], ['Yıkama / fikse', 'yikama', 1.0],
    ['Omuz kapama', 'remaye', 2.0], ['Kol takma (remaye)', 'remaye', 4.0], ['Yan + kol altı kapama', 'remaye', 3.0], ['Yaka ribanası remaye', 'remaye', 3.5],
    ['İplik uçlarını gizleme', 'el', 2.0], ['Kontrol', 'kontrol', 1.0], ['Ütü / buhar', 'utu', 1.2], ['Etiket + paketleme', 'paket', 0.8],
  ],
};
OP_TEMPLATES.hirka = OP_TEMPLATES.kazak; OP_TEMPLATES.suveter = OP_TEMPLATES.kazak;

export function templateOps(type) {
  const t = OP_TEMPLATES[type]; if (!t) throw new Error('Bu ürün türü için operasyon şablonu yok; operasyonları elle ekle');
  return t.map(([name, machine, smv]) => ({ name, machine, smv, est: true }));
}
export function validateOps(ops) {
  const out = [];
  (ops || []).forEach((o, i) => {
    const w = `Operasyon ${i + 1}${o.name ? ' (' + o.name + ')' : ''}`;
    if (!String(o.name || '').trim()) out.push({ level: 'hata', msg: w + ': adı yok' });
    if (!OP_MACHINES[o.machine]) out.push({ level: 'hata', msg: w + ': makine türü bilinmiyor' });
    if (o.smv == null) out.push({ level: 'uyarı', msg: w + ': süre (dakika) girilmedi' });
    else if (!(o.smv > 0 && o.smv < 600)) out.push({ level: 'hata', msg: w + ': süre 0–600 dakika olmalı' });
  });
  return out;
}
export function opsSummary(ops) {
  const known = (ops || []).filter((o) => o.smv > 0), byMachine = {};
  for (const o of known) byMachine[o.machine] = (byMachine[o.machine] || 0) + o.smv;
  return { total: known.reduce((a, o) => a + o.smv, 0), missing: (ops || []).length - known.length, estimated: (ops || []).some((o) => o.est), byMachine, count: (ops || []).length };
}

// Maliyet kartı. c = { minuteRate (para / dk), efficiency (%), overheadPct, marginPct, vatPct }
// matCost: materialCost(...) sonucu (bedene göre). Dönüş: kalemler + eksikler; eksik kalemde toplam null.
export function costSheet({ matCost, ops, c = {} }) {
  const missing = [], s = opsSummary(ops), line = (label, v, note = '') => ({ label, value: v, note });
  if (!matCost) missing.push('malzeme maliyeti hesaplanamadı'); else if (!matCost.complete) missing.push('malzeme: ' + matCost.missing.join(', '));
  if (!s.count) missing.push('operasyon listesi boş');
  if (s.missing) missing.push(`${s.missing} operasyonun süresi yok`);
  if (!(c.minuteRate > 0)) missing.push('dakika ücreti (işçilik + makine, para / dk) girilmedi');
  if (!(c.efficiency > 0 && c.efficiency <= 100)) missing.push('hat verimi (%) girilmedi');
  const mat = matCost ? matCost.total : null;
  const labour = c.minuteRate > 0 && c.efficiency > 0 && s.count && !s.missing ? (s.total * c.minuteRate) / (c.efficiency / 100) : null;
  const direct = mat != null && labour != null ? mat + labour : null;
  if (c.overheadPct == null) missing.push('genel gider (%) girilmedi');
  const overhead = direct != null && c.overheadPct != null ? (direct * c.overheadPct) / 100 : null;
  const cost = direct != null && overhead != null ? direct + overhead : null;
  if (c.marginPct == null) missing.push('kâr payı (%) girilmedi');
  const price = cost != null && c.marginPct != null ? cost * (1 + c.marginPct / 100) : null;
  const vat = price != null && c.vatPct != null ? price * (1 + c.vatPct / 100) : null;
  return {
    lines: [
      line('Malzeme', mat, matCost && matCost.lines.some((x) => x.computed) ? 'hesaplanan tüketimden' : ''),
      line('İşçilik', labour, labour != null ? `${s.total.toFixed(2).replace('.', ',')} dk × ${c.minuteRate} / %${c.efficiency} verim${s.estimated ? ' · süreler tahmini' : ''}` : ''),
      line('Genel gider', overhead, c.overheadPct != null ? `%${c.overheadPct}` : ''), line('Birim maliyet', cost), line('Satış fiyatı (KDV hariç)', price, c.marginPct != null ? `kâr %${c.marginPct}` : ''),
      ...(c.vatPct != null ? [line('KDV dahil', vat, `KDV %${c.vatPct}`)] : []),
    ],
    mat, labour, overhead, cost, price, vat, smv: s.total, missing, complete: !missing.length, estimated: s.estimated || !!(matCost && matCost.lines.some((x) => x.estimated)),
  };
}

// Sipariş: { [beden]: adet }. consumption: productConsumption(...).sizes; extra: { [malzemeId]: ürün başı elle miktar }
// Dönüş: malzeme ihtiyaç listesi (fire dahil) ve bedeni hesaplanamayanlar
export function orderRequirement({ order = {}, consumption = {}, manual = {}, materials = [], wastePct = 0 }) {
  const need = new Map(), problems = [];
  const sizes = Object.entries(order).filter(([, q]) => q > 0);
  if (!sizes.length) return { lines: [], problems: ['sipariş adedi girilmedi'], total: 0, units: 0 };
  for (const m of materials) {
    let qty = 0, ok = true;
    for (const [z, q] of sizes) {
      const per = manual[m.id] ?? consumption[z]?.[m.id]?.qty ?? null;
      if (per == null) { ok = false; problems.push(`${m.name}: ${z} bedeni için tüketim yok`); continue; }
      qty += per * q;
    }
    const withWaste = qty * (1 + (wastePct || 0) / 100);
    need.set(m.id, { name: m.name, unit: m.priceUnit, qty: withWaste, net: qty, price: m.price, cost: m.price != null && ok ? withWaste * m.price : null, complete: ok });
  }
  const lines = [...need.values()];
  return { lines, problems, units: sizes.reduce((a, [, q]) => a + q, 0), total: lines.every((l) => l.cost != null) ? lines.reduce((a, l) => a + l.cost, 0) : null };
}
