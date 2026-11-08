// Akıllı kesim optimizasyonu (1B kesim stoğu / 1D cutting stock). DOM gerektirmez; Node'da test edilir (tests/cutopt.test.mjs).
//
// Girdi parçaları: { key (profil grubu), label, len (mm), qty, profile?, material?, t? (et kalınlığı) }
// Ayarlar: { stock: 6000, kerf: 3, trim: 0 (uç düzeltme payı), minKeep: 300 (bu boydan uzun kalan stoğa döner),
//            useRemnants: true, remnants: [{ id, key, len, ... }], prices: { [key]: boy fiyatı }, stocks: { [key]: stok boyu } }
//
// Kesim modeli: her parçadan sonra bir testere kesimi (kerf) yapılır. Son parça boyun ucuna denk gelirse son kesime gerek kalmaz.
// Bu yüzden her parça (len + kerf) yer kaplar, boyun kapasitesi (stock − trim + kerf) olur: n parça sığar ⇔ Σ(len) + (n−1)·kerf ≤ stock − trim.
//
// Algoritma (grup başına):
//  1. Elde kalan artık profiller (stok) varsa önce onlar en iyi doldurulacak şekilde kullanılır (bedava malzeme).
//  2. Yeni boylar için birkaç yöntem çalışır ve en iyisi seçilir:
//     - FFD (First Fit Decreasing), BFD (Best Fit Decreasing)
//     - MBS (Minimum Bin Slack): her boy için kalan parçalardan boyu EN İYİ dolduran alt küme sınırlı sırt çantası (DP) ile bulunur
//     - MBS′: aynı, ama boy en uzun parçayı içermek zorunda
//     - Yerel iyileştirme: en boş boy boşaltılıp parçaları diğer boylara (gerekirse takaslarla) dağıtılmaya çalışılır
//  3. Teorik alt sınır (Σ(len+kerf) / kapasite, ve yarıdan uzun parçaların sayısı) hesaplanır; sonuç buna eşitse "en az boy" kanıtlanmış olur.
//  Karşılaştırma: önce boy sayısı, sonra artığın tek boyda toplanması (kullanılabilir uzun artık > çok sayıda kısa fire).

export const CUT_DEFAULTS = { stock: 6000, kerf: 3, trim: 0, minKeep: 300, useRemnants: true };

// Elle girişte seçilebilecek ek profil kesitleri (uygulamanın iskelet profillerine ek olarak). Yeni tür eklemek için listeye ekle.
export const EXTRA_PROFILES = [
  { id: 'x40403', name: 'Kutu 40×40×3', kind: 'rect', w: 40, h: 40, t: 3 },
  { id: 'x50502', name: 'Kutu 50×50×2', kind: 'rect', w: 50, h: 50, t: 2 },
  { id: 'x60402', name: 'Dikdörtgen 60×40×2', kind: 'rect', w: 60, h: 40, t: 2 },
  { id: 'x80402', name: 'Dikdörtgen 80×40×2', kind: 'rect', w: 80, h: 40, t: 2 },
  { id: 'xl404', name: 'L köşebent 40×40×4', kind: 'L', w: 40, h: 40, t: 4 },
  { id: 'xl505', name: 'L köşebent 50×50×5', kind: 'L', w: 50, h: 50, t: 5 },
  { id: 'xu80', name: 'U profil 80 (NPU)', kind: 'U', w: 80, h: 45, t: 6 },
  { id: 'xu100', name: 'U profil 100 (NPU)', kind: 'U', w: 100, h: 50, t: 6 },
  { id: 'xlama', name: 'Lama 40×5', kind: 'flat', w: 40, h: 5, t: 5 },
  { id: 'xmil20', name: 'Dolu mil Ø20', kind: 'bar', w: 20, h: 20, t: 10 },
];
// profil + malzeme birlikte grubu belirler (farklı kesit, et kalınlığı ya da malzeme asla aynı boydan kesilmez)
export const groupKey = (profile, material) => String(profile || 'Profil').trim() + ' · ' + String(material || 'Çelik').trim();

const r1 = (v) => Math.round(v * 10) / 10;

/* ---------- sığma kontrolü ---------- */
// Bir boya konulan parçalar için: kullanılan, testere kaybı, kalan (artık). fits=false ise sığmıyor.
export function barUsage(lens, stockLen, kerf, trim = 0) {
  const n = lens.length, sum = lens.reduce((s, v) => s + v, 0), avail = stockLen - trim;
  const left = avail - sum - n * kerf;                       // son kesim de yapılırsa kalan
  const fits = n === 0 || sum + (n - 1) * kerf <= avail + 1e-6;
  const kerfLoss = n ? n * kerf + Math.min(0, left) : 0;     // son parça uca denk geldiyse son kesim yok / kısmi
  return { fits, used: sum, kerfLoss: Math.max(0, kerfLoss), rest: Math.max(0, left), n };
}

/* ---------- sınırlı alt küme toplamı: kapasiteyi en iyi dolduran parça kümesi ---------- */
// types: [{ w (tam sayı birim), c (adet) }], cap: tam sayı. Dönüş: her türden kaç tane (dizi)
function bestFill(types, cap) {
  const take = new Array(types.length).fill(0);
  if (cap <= 0) return take;
  const from = new Int16Array(cap + 1).fill(-1);
  const reach = new Uint8Array(cap + 1); reach[0] = 1;
  const used = new Int32Array(cap + 1);
  let best = 0;
  for (let t = 0; t < types.length; t++) {
    const { w, c } = types[t];
    if (w > cap || c <= 0) continue;
    used.fill(0);
    for (let s = w; s <= cap; s++) {
      if (!reach[s] && reach[s - w] && used[s - w] < c) {
        reach[s] = 1; from[s] = t; used[s] = used[s - w] + 1;
        if (s > best) best = s;
      }
    }
    if (best === cap) break;
  }
  for (let s = best; s > 0;) { const t = from[s]; take[t]++; s -= types[t].w; }
  return take;
}

/* ---------- yöntemler (yeni boylar için) ---------- */
// items: [{ i, len, s (tam sayı birim: len+kerf) }] (azalan sıralı), C: kapasite birimi. Dönüş: boylar = [[item, ...], ...]
function ffd(items, C, best = false) {
  const bins = [];
  for (const it of items) {
    let pick = -1, pr = Infinity;
    for (let b = 0; b < bins.length; b++) {
      const r = C - bins[b].s;
      if (r >= it.s && (!best ? pick < 0 : r - it.s < pr)) { pick = b; pr = r - it.s; if (!best) break; }
    }
    if (pick < 0) { bins.push({ s: 0, items: [] }); pick = bins.length - 1; }
    bins[pick].s += it.s; bins[pick].items.push(it);
  }
  return bins.map((b) => b.items);
}
function typesOf(items) {
  const m = new Map();
  for (const it of items) { if (!m.has(it.s)) m.set(it.s, []); m.get(it.s).push(it); }
  return [...m.entries()].sort((a, b) => b[0] - a[0]).map(([w, list]) => ({ w, list }));
}
function mbs(items, C, forceLargest) {
  let rest = items.slice();
  const bins = [];
  while (rest.length) {
    const types = typesOf(rest);
    let fixed = [], cap = C;
    if (forceLargest) { const big = types[0].list[0]; fixed = [big]; cap -= big.s; }
    const tt = types.map((t) => ({ w: t.w, c: t.list.length - (fixed.length && fixed[0].s === t.w ? 1 : 0) }));
    const take = bestFill(tt, cap);
    const bin = fixed.slice();
    take.forEach((k, t) => { const pool = types[t].list.filter((it) => !bin.includes(it)); bin.push(...pool.slice(0, k)); });
    if (!bin.length) bin.push(rest[0]);                 // güvenlik: her turda en az bir parça
    const set = new Set(bin);
    rest = rest.filter((it) => !set.has(it));
    bins.push(bin);
  }
  return bins;
}
// en az dolu boyu boşaltmayı dene: parçalarını diğer boylara yerleştir (gerekirse 1-1 takasla)
function improve(bins, C, maxRounds = 200) {
  let B = bins.map((b) => b.slice());
  const sumOf = (b) => b.reduce((s, it) => s + it.s, 0);
  for (let round = 0; round < maxRounds && B.length > 1; round++) {
    const order = B.map((b, i) => [sumOf(b), i]).sort((a, b) => a[0] - b[0]);
    const vi = order[0][1], victim = B[vi].slice().sort((a, b) => b.s - a.s);
    const others = B.filter((_, i) => i !== vi).map((b) => b.slice());
    let ok = true;
    for (const it of victim) {
      // 1) doğrudan sığdır (en iyi uyan)
      let pick = -1, pr = Infinity;
      others.forEach((b, i) => { const r = C - sumOf(b) - it.s; if (r >= 0 && r < pr) { pr = r; pick = i; } });
      if (pick >= 0) { others[pick].push(it); continue; }
      // 2) takas: bir boydaki daha kısa parçayla yer değiştir, çıkan parça başka bir boya sığsın
      let done = false;
      for (let i = 0; i < others.length && !done; i++) {
        const free = C - sumOf(others[i]);
        for (let k = 0; k < others[i].length && !done; k++) {
          const o = others[i][k];
          if (o.s >= it.s || free + o.s < it.s) continue;
          for (let j = 0; j < others.length; j++) {
            if (j === i || C - sumOf(others[j]) < o.s) continue;
            others[i][k] = it; others[j].push(o); done = true; break;
          }
        }
      }
      if (!done) { ok = false; break; }
    }
    if (!ok) break;
    B = others;
  }
  return B;
}
// iki çözümü karşılaştır: az boy, sonra artığı tek boyda topla (kareler toplamı büyük = daha toplu)
function better(a, b, C) {
  if (!b) return true;
  if (a.length !== b.length) return a.length < b.length;
  const sq = (bins) => bins.reduce((s, bin) => { const r = C - bin.reduce((x, it) => x + it.s, 0); return s + r * r; }, 0);
  return sq(a) > sq(b);
}

/* ---------- ana fonksiyon ---------- */
export function optimizeCuts(pieces, options = {}) {
  const o = { ...CUT_DEFAULTS, ...options };
  const kerf = Math.max(0, Number(o.kerf) || 0), trim = Math.max(0, Number(o.trim) || 0), minKeep = Math.max(0, Number(o.minKeep) || 0);
  const groups = new Map();
  for (const p of pieces || []) {
    const len = Number(p.len), qty = Math.round(Number(p.qty));
    if (!(len > 0) || !(qty > 0)) continue;
    const key = p.key || groupKey(p.profile, p.material);
    if (!groups.has(key)) groups.set(key, { key, profile: p.profile || key, material: p.material || '', t: p.t, list: [] });
    groups.get(key).list.push({ label: String(p.label || '').trim() || String(r1(len)), len, qty });
  }
  const out = [];
  for (const G of groups.values()) out.push(optimizeGroup(G, o, kerf, trim, minKeep));
  const tot = (k) => out.reduce((s, g) => s + g.stats[k], 0);
  return {
    groups: out,
    total: {
      pieces: tot('pieces'), bars: tot('bars'), buyLen: tot('buyLen'), cutLen: tot('cutLen'), kerfLoss: tot('kerfLoss'),
      keepLen: tot('keepLen'), scrapLen: tot('scrapLen'), cost: tot('cost'), remnantsUsed: tot('remnantsUsed'),
      priced: out.every((g) => g.stats.price > 0),
    },
    settings: { stock: o.stock, kerf, trim, minKeep },
  };
}

function optimizeGroup(G, o, kerf, trim, minKeep) {
  const stock = Number((o.stocks || {})[G.key]) || Number(o.stock) || 6000;
  const price = Math.max(0, Number((o.prices || {})[G.key]) || 0);
  // tam sayı birim: bütün boylar tam mm ise 1 mm, değilse 0,1 mm
  const all = [stock, kerf, trim, ...G.list.map((x) => x.len), ...((o.remnants || []).filter((r) => r.key === G.key).map((r) => r.len))];
  const sc = all.every((v) => Math.abs(v - Math.round(v)) < 1e-9) ? 1 : 10;
  const U = (v) => Math.round(v * sc);
  const C = U(stock - trim + kerf);
  const errors = [];
  const items = [];
  let idx = 0;
  for (const x of G.list) {
    if (U(x.len) > U(stock - trim)) { errors.push({ label: x.label, len: x.len, qty: x.qty, msg: r1(x.len) + ' mm parça ' + r1(stock - trim) + ' mm kullanılabilir boydan uzun' + (trim ? ' (uç düzeltme dahil)' : '') + '; kaynakla eklenmeli ya da daha uzun stok gerekir' }); continue; }
    for (let k = 0; k < x.qty; k++) items.push({ i: idx++, label: x.label, len: x.len, s: U(x.len + kerf) });
  }
  items.sort((a, b) => b.s - a.s || a.label.localeCompare(b.label));

  // 1) elde kalan artıklar
  const remBars = [];
  let rest = items;
  if (o.useRemnants !== false) {
    const rems = (o.remnants || []).filter((r) => r.key === G.key && r.len > 0).slice().sort((a, b) => a.len - b.len);
    for (const r of rems) {
      if (!rest.length) break;
      const cap = U(r.len - trim + kerf);
      const types = typesOf(rest), take = bestFill(types.map((t) => ({ w: t.w, c: t.list.length })), cap);
      const bin = [];
      take.forEach((k, t) => bin.push(...types[t].list.slice(0, k)));
      if (!bin.length) continue;
      const set = new Set(bin);
      rest = rest.filter((it) => !set.has(it));
      remBars.push({ src: 'remnant', remId: r.id, stockLen: r.len, items: bin });
    }
  }

  // 2) yeni boylar: yöntemleri dene, en iyisini seç
  let best = null, method = '';
  if (rest.length) {
    const cands = [['FFD', ffd(rest, C)], ['BFD', ffd(rest, C, true)], ['MBS', mbs(rest, C, false)], ['MBS′', mbs(rest, C, true)]];
    for (const [m, sol] of cands) if (better(sol, best, C)) { best = sol; method = m; }
    const imp = improve(best, C);
    if (better(imp, best, C)) { best = imp; method += ' + iyileştirme'; }
  }
  const newBars = (best || []).map((items2) => ({ src: 'stock', stockLen: stock, items: items2 }));

  // alt sınır
  const S = rest.reduce((s, it) => s + it.s, 0);
  const lb = rest.length ? Math.max(Math.ceil(S / C - 1e-9), rest.filter((it) => it.s * 2 > C).length) : 0;

  // boyları rapora çevir
  const bars = [...remBars, ...newBars].map((b) => {
    const cuts = b.items.slice().sort((a, c) => c.len - a.len || a.label.localeCompare(c.label)).map((it) => ({ label: it.label, len: it.len }));
    const u = barUsage(cuts.map((c) => c.len), b.stockLen, kerf, trim);
    return { src: b.src, remId: b.remId, stockLen: b.stockLen, cuts, used: u.used, kerfLoss: u.kerfLoss, trim: cuts.length ? trim : 0, rest: r1(u.rest), restKind: u.rest >= minKeep && u.rest > 0 ? 'keep' : 'scrap', ok: u.fits };
  });
  // aynı kesim düzenine sahip boyları yan yana getir (operatör aynı ayarla art arda keser)
  const sig = (b) => b.src + '|' + b.stockLen + '|' + b.cuts.map((c) => c.label + ':' + c.len).join(',');
  const order = [];
  for (const b of bars) { const s = sig(b); let g = order.find((x) => x.sig === s); if (!g) { g = { sig: s, list: [] }; order.push(g); } g.list.push(b); }
  const sorted = [];
  for (const g of order.filter((x) => x.list[0].src === 'remnant')) sorted.push(...g.list);
  for (const g of order.filter((x) => x.list[0].src === 'stock').sort((a, b) => b.list.length - a.list.length || b.list[0].used - a.list[0].used)) sorted.push(...g.list);
  const patterns = [];
  sorted.forEach((b, i) => { b.no = i + 1; const s = sig(b); const last = patterns[patterns.length - 1]; if (last && last.sig === s) last.count++; else patterns.push({ sig: s, first: i, count: 1 }); });

  const newOnes = sorted.filter((b) => b.src === 'stock'), remOnes = sorted.filter((b) => b.src === 'remnant');
  const sum = (arr, f) => arr.reduce((s, b) => s + f(b), 0);
  const stats = {
    pieces: items.length,
    bars: newOnes.length,
    remnantsUsed: remOnes.length,
    buyLen: newOnes.length * stock,
    cutLen: r1(sum(sorted, (b) => b.used)),
    kerfLoss: r1(sum(sorted, (b) => b.kerfLoss)),
    trimLoss: r1(sum(sorted, (b) => b.trim)),
    keepLen: r1(sum(sorted, (b) => (b.restKind === 'keep' ? b.rest : 0))),
    scrapLen: r1(sum(sorted, (b) => (b.restKind === 'scrap' ? b.rest : 0) + b.trim)),
    price, cost: newOnes.length * price,
    lowerBound: lb, optimal: newOnes.length <= lb, method,
  };
  const material = stats.buyLen + sum(remOnes, (b) => b.stockLen);
  stats.scrapPct = material ? Math.round((stats.scrapLen + stats.kerfLoss) / material * 1000) / 10 : 0;
  stats.wastePctNoKeep = material ? Math.round((stats.scrapLen + stats.kerfLoss + stats.keepLen) / material * 1000) / 10 : 0;
  return { key: G.key, profile: G.profile, material: G.material, t: G.t, stock, bars: sorted, patterns, stats, errors };
}

/* ---------- artık stoğu ---------- */
// sonuçtan stoğa dönecek artıklar (minKeep'ten uzun olanlar) ve tükenen artıkların kimlikleri
export function remnantChanges(result) {
  const add = [], used = [];
  for (const g of result.groups) for (const b of g.bars) {
    if (b.src === 'remnant' && b.remId != null) used.push(b.remId);
    if (b.restKind === 'keep') add.push({ key: g.key, profile: g.profile, material: g.material, t: g.t, len: b.rest, from: 'Kesim planı · profil ' + b.no });
  }
  return { add, used };
}

/* ---------- CSV ---------- */
export function cutPlanRows(result, fmt = (v) => String(Math.round(v * 10) / 10).replace('.', ',')) {
  const rows = [['Grup', 'Profil no', 'Kaynak', 'Stok boyu (mm)', 'Kesim sırası', 'Parça', 'Boy (mm)', 'Kalan (mm)', 'Kalan durumu']];
  for (const g of result.groups) for (const b of g.bars) {
    b.cuts.forEach((c, i) => rows.push([g.key, b.no, b.src === 'remnant' ? 'Elde kalan artık' : 'Yeni boy', fmt(b.stockLen), i + 1, c.label, fmt(c.len), i === b.cuts.length - 1 ? fmt(b.rest) : '', i === b.cuts.length - 1 ? (b.restKind === 'keep' ? 'Stoğa' : 'Fire') : '']));
  }
  rows.push([]);
  rows.push(['Grup', 'Parça sayısı', 'Yeni boy', 'Kullanılan artık', 'Satın alınacak (mm)', 'Kesilen (mm)', 'Testere kaybı (mm)', 'Stoğa kalan (mm)', 'Fire (mm)', 'Fire %', 'Maliyet']);
  for (const g of result.groups) {
    const s = g.stats;
    rows.push([g.key, s.pieces, s.bars, s.remnantsUsed, fmt(s.buyLen), fmt(s.cutLen), fmt(s.kerfLoss), fmt(s.keepLen), fmt(s.scrapLen), fmt(s.scrapPct), s.price ? fmt(s.cost) : '']);
  }
  return rows;
}

/* ---------- PDF (JPEG sayfalardan) ---------- */
// pages: [{ jpeg: Uint8Array, w, h (piksel) }] → A4 dikey PDF (Uint8Array). Sayfa çizimleri tuvalde yapılır (Türkçe harfler sorunsuz).
export function pdfFromJpegs(pages) {
  const enc = new TextEncoder();
  const chunks = [], offs = [];
  let pos = 0;
  const put = (x) => { const b = typeof x === 'string' ? enc.encode(x) : x; chunks.push(b); pos += b.length; };
  const PW = 595.28, PH = 841.89;
  const n = pages.length, objs = 2 + n * 3;
  put('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n'.replace(/[\u0080-ÿ]/g, 'x'));
  const obj = (id, body) => { offs[id] = pos; put(id + ' 0 obj\n'); for (const b of [].concat(body)) put(b); put('\nendobj\n'); };
  obj(1, '<< /Type /Catalog /Pages 2 0 R >>');
  obj(2, '<< /Type /Pages /Kids [' + pages.map((_, i) => (3 + i * 3) + ' 0 R').join(' ') + '] /Count ' + n + ' >>');
  pages.forEach((p, i) => {
    const pid = 3 + i * 3, cid = pid + 1, iid = pid + 2;
    const k = Math.min(PW / p.w, PH / p.h), dw = p.w * k, dh = p.h * k, x = (PW - dw) / 2, y = PH - dh;
    const content = `q ${dw.toFixed(2)} 0 0 ${dh.toFixed(2)} ${x.toFixed(2)} ${y.toFixed(2)} cm /Im0 Do Q`;
    obj(pid, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PW} ${PH}] /Resources << /XObject << /Im0 ${iid} 0 R >> >> /Contents ${cid} 0 R >>`);
    obj(cid, ['<< /Length ' + content.length + ' >>\nstream\n', content, '\nendstream']);
    obj(iid, ['<< /Type /XObject /Subtype /Image /Width ' + p.w + ' /Height ' + p.h + ' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ' + p.jpeg.length + ' >>\nstream\n', p.jpeg, '\nendstream']);
  });
  const xref = pos;
  let x = 'xref\n0 ' + (objs + 1) + '\n0000000000 65535 f \n';
  for (let i = 1; i <= objs; i++) x += String(offs[i]).padStart(10, '0') + ' 00000 n \n';
  put(x + 'trailer\n<< /Size ' + (objs + 1) + ' /Root 1 0 R >>\nstartxref\n' + xref + '\n%%EOF\n');
  const outB = new Uint8Array(pos);
  let o = 0;
  for (const c of chunks) { outB.set(c, o); o += c.length; }
  return outB;
}
