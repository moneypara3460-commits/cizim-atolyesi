// Akıllı Üretim Maliyeti — "Maliyet" sekmesi arayüzü.
// api: { model() → maliyet modeli, materials, render(), toast(m), name(), snapshot()? }
// Fiyatlar ve saat ücretleri atölyenin kendi verisidir: cihazda saklanır (cizim:cost), her projede kullanılır.
import { computeCost, qtyTable, suggestions, defaultCostConfig, OPS, EXTRAS, PARAMS, QTY_STEPS } from './cost.js?v=20261109j';
import { pdfFromJpegs } from './cutopt.js?v=20261109j';

const KEY = 'cizim:cost';
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
export const tl = (v) => (v == null || !isFinite(v) ? '—' : '₺' + Number(v).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
const f1 = (v) => (Math.round(v * 10) / 10).toLocaleString('tr-TR');
const f2 = (v) => (Math.round(v * 100) / 100).toLocaleString('tr-TR');
const hm = (min) => (min >= 60 ? Math.floor(min / 60) + ' sa ' + Math.round(min % 60) + ' dk' : f1(min) + ' dk');

function load() {
  const d = defaultCostConfig();
  try {
    const s = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (s && typeof s === 'object') {
      Object.assign(d, { qty: s.qty || 1, prices: s.prices || {}, scrapPrice: s.scrapPrice ?? null, labour: s.labour ?? null, manualH: s.manualH ?? 0, weldPrices: { ...d.weldPrices, ...(s.weldPrices || {}) } });
      for (const o of OPS) d.ops[o.id] = { ...d.ops[o.id], ...((s.ops || {})[o.id] || {}) };
      for (const e of EXTRAS) d.extras[e.id] = { ...d.extras[e.id], ...((s.extras || {})[e.id] || {}) };
      d.params = { ...d.params, ...(s.params || {}), mrr: { ...d.params.mrr, ...((s.params || {}).mrr || {}) }, laserSpeed: PARAMS.laserSpeed };
    }
  } catch (e) { /* bozuk kayıt: varsayılan */ }
  return d;
}

export function createCostUI(api) {
  const C = load();
  const S = { open: { mat: true, ops: true, ex: false, weld: false, opt: true, qty: true, par: false, alt: false } };
  const save = () => { try { const { params, ...rest } = C; const { laserSpeed, ...p2 } = params; localStorage.setItem(KEY, JSON.stringify({ ...rest, params: p2 })); } catch (e) { /* */ } };

  function html() {
    let M;
    try { M = api.model(); } catch (e) { return note('⚠ Model okunamadı: ' + esc(e.message)); }
    if (!M || !M.parts.length) return note('Önce bir model olmalı.');
    const Q = C.qty, c = computeCost(M, C, Q), sg = suggestions(M, C, Q, api.materials);
    let h = '<div class="lbl h">Akıllı Üretim Maliyeti</div>';
    // özet
    h += card(`<div style="font-size:13px;color:#94a3b8">${c.complete ? 'Genel üretim maliyeti' : 'Genel üretim maliyeti (EKSİK — fiyatı girilmeyen kalemler hariç)'} · ${Q} adet</div>` +
      `<div style="font-size:28px;font-weight:800;margin:2px 0">${tl(c.total)}</div><div style="font-size:15px;margin-bottom:6px">Birim: <b>${tl(c.unit)}</b> / adet</div>` +
      row('Hammadde (fire dahil)', tl(c.mat.cost) + (c.mat.complete ? '' : ' ⚠')) + (c.mat.scrapReturn ? row('  − Hurda geri satışı', '−' + tl(c.mat.scrapReturn)) : '') +
      row('  Fire maliyeti (hammaddenin içinde)', tl(c.mat.fireCost) + ' · ' + f1(c.mat.fireKg) + ' kg') +
      row('İşçilik', c.labour.cost != null ? tl(c.labour.cost) + ' · ' + f1(c.labour.hours) + ' sa' : (c.labour.hours ? '⚠ ücret yok · ' + f1(c.labour.hours) + ' sa' : '—')) +
      row('Makine', tl(c.machine.cost) + (c.machine.complete ? '' : ' ⚠')) + (c.weldCons ? row('Kaynak sarfı', tl(c.weldCons)) : '') + row('Ekstra giderler', tl(c.extras.cost)) +
      row('Sabit (parti) / değişken (adet başı)', tl(c.fixed) + ' / ' + tl(c.variableUnit)));
    if (c.missing.length) h += `<div style="flex:1 0 100%;background:#3a2506;border:1px solid #b45309;border-radius:10px;padding:8px 10px;font-size:13.5px;color:#fde68a;line-height:1.45"><b>Eksik bilgi (${c.missing.length}):</b> ${c.missing.map(esc).join(' · ')}<br>Fiyatlar uydurulmaz; eksik kalemler toplama katılmadı.</div>`;
    if (c.estimates.length) h += note('ℹ ' + c.estimates.map(esc).join(', ') + ': ham ölçü dış boyuttan tahmin edildi.');
    // adet
    h += '<div class="lbl h">Üretim adedi</div>' + QTY_STEPS.map((q) => btn(q + ' adet', 'cs-q-' + q, Q === q)).join('') + inp('Başka adet', 'qty', QTY_STEPS.includes(Q) ? '' : Q);
    // optimizasyon
    h += sec('opt', '💡 Akıllı maliyet optimizasyonu');
    if (S.open.opt) {
      if (sg.totalSaving > 0) h += card(row('Mevcut üretim maliyeti', tl(sg.base.total)) + row('Önerilerle (doğrulama gerektirmeyenler)', tl(sg.alt)) + row('Tahmini tasarruf', '<span style="color:#86efac">' + tl(sg.totalSaving) + ' (%' + Math.round(sg.totalSaving / Math.max(sg.base.total, 1e-9) * 100) + ')</span>'));
      if (!sg.items.length) h += note('Öneri bulunamadı.');
      for (const x of sg.items) {
        h += `<div style="flex:1 0 100%;background:#111a2e;border:1px solid #1e293b;border-left:5px solid ${x.saving > 0 ? (x.verify ? '#f59e0b' : '#22c55e') : '#475569'};border-radius:12px;padding:8px 10px">` +
          `<div style="font-weight:800;font-size:15px">${esc(x.title)}</div>` +
          (x.saving > 0 ? `<div style="font-size:14px;margin:4px 0">${x.perUnit ? 'Birim ' : ''}${tl(x.current)} → <b>${tl(x.alt)}</b> · <span style="color:#86efac">tasarruf ${tl(x.saving)}${x.perUnit ? ' / adet' : ''}</span>${x.verify ? ' · <span style="color:#fbbf24">doğrulama gerekir</span>' : ''}</div>` : '') +
          `<div style="font-size:13.5px;color:#cbd5e1;line-height:1.4">${esc(x.text)}</div></div>`;
      }
      h += note('Öneriler senin fiyatların ve modelden ölçülen miktarlarla hesaplanır (kural tabanlı, doğrulanabilir). Malzeme ve yöntem değişiklikleri dayanım, tolerans ve şartnameye göre ayrıca değerlendirilmelidir.');
    }
    // hammadde
    h += sec('mat', '🧱 Hammadde');
    if (S.open.mat) {
      const used = new Map();
      for (const r of c.mat.rows) used.set(r.matId, r.material);
      for (const p of M.profiles || []) used.set(p.matId, api.materials.find((m) => m.id === p.matId)?.name || p.matId);
      for (const [mid, name] of used) h += inp(esc(name) + ' (₺/kg)', 'price:' + mid, C.prices[mid] ?? '');
      h += inp('Hurda satış fiyatı (₺/kg, boş = yok)', 'scrapPrice', C.scrapPrice ?? '');
      for (const r of c.mat.rows) h += card(`<div style="display:flex;justify-content:space-between"><b>${esc(r.name)}</b><b>${r.cost != null ? tl(r.cost) : '⚠ fiyat yok'}</b></div><div style="font-size:12.5px;color:#94a3b8;margin-top:3px">${esc(r.material)} · ${esc(r.shape)} · ham ${f2(r.raw)} kg, net ${f2(r.net)} kg, fire ${f2(r.fire)} kg${r.estimate ? ' · tahmini' : ''}</div>`);
      for (const p of c.mat.profiles) h += card(`<div style="display:flex;justify-content:space-between"><b>${esc(p.name)}</b><b>${p.cost != null ? tl(p.cost) : '⚠ fiyat yok'}</b></div><div style="font-size:12.5px;color:#94a3b8;margin-top:3px">${p.bars} boy × ${f1(p.stock / 1000)} m (kesim optimizasyonu) · ham ${f2(p.raw)} kg, net ${f2(p.net)} kg · fire %${String(p.scrapPct).replace('.', ',')}${p.priceUnit === '₺/boy' ? ' · boy fiyatı kesim optimizasyonundan' : ''}</div>`);
      h += sec('alt', 'Alternatif malzeme fiyatları (öneriler için)');
      if (S.open.alt) { const kinds = new Set([...used.keys()].map((id) => (api.materials.find((m) => m.id === id) || {}).kind)); for (const m of api.materials.filter((x) => kinds.has(x.kind) && !used.has(x.id))) h += inp(esc(m.name) + ' (₺/kg)', 'price:' + m.id, C.prices[m.id] ?? ''); }
    }
    // işçilik ve makineler
    h += sec('ops', '⚙ İşçilik ve makineler');
    if (S.open.ops) {
      h += inp('İşçilik saat ücreti (₺/sa)', 'labour', C.labour ?? '') + inp('Ek el işçiliği (sa / adet)', 'manualH', C.manualH || '');
      for (const o of c.ops) {
        const cf = C.ops[o.id];
        h += `<div style="flex:1 0 100%;background:#111a2e;border:1px solid ${o.on ? '#0284c7' : '#1e293b'};border-radius:12px;padding:8px 10px">` +
          `<div style="display:flex;justify-content:space-between;align-items:center;gap:8px"><button data-act="cs-op-${o.id}" style="flex:0 0 auto;min-width:0;padding:7px 10px;font-size:13.5px${o.on ? ';background:#0284c7' : ''}">${o.on ? '◉' : '○'} ${esc(o.name)}</button><b>${o.on ? (o.cost != null ? tl(o.cost) : '⚠ ücret yok') : ''}</b></div>` +
          `<div style="font-size:12.5px;color:#94a3b8;margin:4px 0">${o.auto > 0 ? 'Modelden: ' + hm(o.auto) + ' / adet' + (o.why && o.why.length ? ' (' + esc(o.why.slice(0, 3).join(', ')) + (o.why.length > 3 ? '…' : '') + ')' : '') : 'Modelde bu işlem bulunmadı'}${o.on ? ' · toplam ' + hm(o.minTot) + (o.override ? ' (elle)' : '') : ''}</div>` +
          (o.on ? `<div style="display:flex;gap:6px;flex-wrap:wrap">${inpS('Saat ücreti ₺', 'op:' + o.id + ':rate', cf.rate ?? '')}${inpS('Süre sa/adet (boş = oto)', 'op:' + o.id + ':hours', cf.hours ?? '')}${inpS('Hazırlık dk/parti', 'op:' + o.id + ':setupMin', cf.setupMin ?? '')}</div>` : '') + '</div>';
      }
      h += note('Süreler modelden hesaplanan TAHMİNLERDİR (hızlar Varsayımlar bölümünde). Makine ücretine operatör dahil değilse işçilik ayrıca eklenir; dahilse işçilik ücretini 0 gir.');
    }
    // kaynak sarfı
    if (M.weld) {
      h += sec('weld', '🔥 Kaynak sarfı (Kaynak planından)');
      if (S.open.weld) h += note('Onaylı ' + M.weld.approvedN + ' kaynak: ' + (M.weld.wireKg ? f2(M.weld.wireKg) + ' kg tel, ' : '') + (M.weld.electrodes ? M.weld.electrodes + ' elektrot, ' : '') + (M.weld.gasL ? Math.round(M.weld.gasL) + ' L gaz, ' : '') + hm(M.weld.workMin) + ' / adet') +
        (M.weld.wireKg ? inp('Kaynak teli / TIG çubuğu (₺/kg)', 'wp:wire', C.weldPrices.wire ?? '') : '') + (M.weld.electrodes ? inp('Elektrot (₺/adet)', 'wp:electrode', C.weldPrices.electrode ?? '') : '') + (M.weld.gasL ? inp('Koruyucu gaz (₺/L)', 'wp:gas', C.weldPrices.gas ?? '') : '');
    }
    // ekstralar
    h += sec('ex', '➕ Ekstra giderler');
    if (S.open.ex) for (const e of c.extras.items) h += `<div style="flex:1 0 100%;display:flex;gap:6px;align-items:flex-end">${inpS(esc(e.name) + ' (₺)', 'ex:' + e.id + ':amount', C.extras[e.id].amount ?? '')}<button data-act="cs-per-${e.id}" style="flex:0 0 auto;min-width:0;padding:10px 8px;font-size:13px">${e.per === 'unit' ? 'adet başı' : 'parti başı'}</button></div>`;
    // adet karşılaştırma
    h += sec('qty', '📊 Adete göre maliyet');
    if (S.open.qty) {
      const tb = qtyTable(M, C, [...new Set([...QTY_STEPS, Q])].sort((a, b) => a - b));
      h += card(`<div style="display:grid;grid-template-columns:1fr 1.3fr 1.2fr 1.2fr;gap:4px;font-size:13px"><b>Adet</b><b>Toplam</b><b>Birim</b><b>Sabit/adet</b>` +
        tb.map((r) => `<span${r.q === Q ? ' style="color:#38bdf8;font-weight:800"' : ''}>${r.q}</span><span>${tl(r.total)}</span><b>${tl(r.unit)}</b><span>${tl(r.fixedUnit)}</span>`).join('') + '</div>');
    }
    // varsayımlar
    h += sec('par', '📏 Hesap varsayımları (süre / pay)');
    if (S.open.par) {
      const P = C.params;
      h += inp('İşleme payı (mm, her yüz)', 'param:allowance', P.allowance) + inp('Sac yerleşim firesi (%)', 'param:sheetScrap', P.sheetScrap) + inp('Profil kesim (dk / kesim)', 'param:sawMin', P.sawMin) +
        inp('Büküm (dk / büküm)', 'param:bendMin', P.bendMin) + inp('Delik (dk / delik)', 'param:holeMin', P.holeMin) + inp('Delme ilerlemesi (mm/dk)', 'param:drillFeed', P.drillFeed) +
        inp('CNC bitirme (dk / parça)', 'param:finishMin', P.finishMin) + inp('Taşlama (dk / m dikiş)', 'param:grindMinPerM', P.grindMinPerM) +
        inp('Talaş kaldırma çelik (cm³/dk)', 'mrr:metal', P.mrr.metal) + inp('Talaş kaldırma alüminyum (cm³/dk)', 'mrr:aluminyum', P.mrr.aluminyum) +
        note('Lazer hızları (çelik, tipik): ' + PARAMS.laserSpeed.slice(0, -1).map(([t, v]) => '≤' + t + ' mm: ' + v + ' mm/dk').join(', ') + '. Varsayımlar fiyat değildir; kendi atölyenin değerlerini girersen sonuç gerçeğe yaklaşır.');
    }
    h += '<div class="lbl h">Rapor</div>' + btn('📄 PDF maliyet raporu', 'cs-pdf');
    return h;
  }
  const btn = (l, a, on) => `<button data-act="${a}"${on ? ' class="on"' : ''}>${l}</button>`;
  const note = (t) => `<div class="lbl" style="flex:1 0 100%;font-size:13px;line-height:1.4">${t}</div>`;
  const card = (inner) => `<div style="flex:1 0 100%;background:#111a2e;border:1px solid #1e293b;border-radius:12px;padding:10px">${inner}</div>`;
  const row = (k, v) => `<div style="display:flex;justify-content:space-between;gap:8px;padding:4px 0;border-top:1px solid #1e293b;font-size:14px"><span style="color:#94a3b8">${k}</span><b style="text-align:right">${v}</b></div>`;
  const inp = (l, k, v) => `<label class="f"><span>${l}</span><input type="number" step="any" inputmode="decimal" data-cf="${k}" value="${esc(v)}"></label>`;
  const inpS = (l, k, v) => `<label class="f" style="flex:1 1 95px;min-width:95px"><span>${l}</span><input type="number" step="any" inputmode="decimal" data-cf="${k}" value="${esc(v)}"></label>`;
  const sec = (k, t) => `<button data-act="cs-sec-${k}" style="flex:1 0 100%;text-align:left;background:transparent;border-bottom:1px solid #1e293b;border-radius:0;font-size:14.5px;padding:10px 4px">${S.open[k] ? '▾' : '▸'} ${t}</button>`;

  function act(a) {
    if (a.startsWith('cs-q-')) { C.qty = +a.slice(5); save(); api.render(); return true; }
    if (a.startsWith('cs-sec-')) { const k = a.slice(7); S.open[k] = !S.open[k]; api.render(); return true; }
    if (a.startsWith('cs-op-')) {
      const id = a.slice(6), o = C.ops[id], M = api.model(), cur = computeCost(M, C, 1).ops.find((x) => x.id === id);
      o.on = !(cur && cur.on); save(); api.render(); return true;
    }
    if (a.startsWith('cs-per-')) { const e = C.extras[a.slice(7)]; e.per = e.per === 'unit' ? 'batch' : 'unit'; save(); api.render(); return true; }
    if (a === 'cs-pdf') { exportPDF(); return true; }
    return false;
  }
  function input(el, type) {
    if (type !== 'change') return;
    const k = el.dataset.cf, raw = String(el.value).trim(), v = raw === '' ? null : Number(raw.replace(',', '.'));
    if (v != null && !(isFinite(v) && v >= 0)) { api.toast('Geçerli bir sayı gir (0 ya da büyük)'); api.render(); return; }
    const [a, b, c] = k.split(':');
    if (a === 'qty') { if (v >= 1) C.qty = Math.round(v); }
    else if (a === 'price') { if (v == null) delete C.prices[b]; else C.prices[b] = v; }
    else if (a === 'scrapPrice' || a === 'labour' || a === 'manualH') C[a] = v;
    else if (a === 'op') C.ops[b][c] = v;
    else if (a === 'ex') C.extras[b].amount = v;
    else if (a === 'wp') C.weldPrices[b] = v;
    else if (a === 'param') { if (v != null) C.params[b] = v; }
    else if (a === 'mrr') { if (v > 0) C.params.mrr[b] = v; }
    save(); api.render();
  }
  async function exportPDF() {
    let M; try { M = api.model(); } catch (e) { api.toast('Model okunamadı'); return; }
    api.toast('PDF hazırlanıyor…');
    try {
      const Q = C.qty, c = computeCost(M, C, Q), sg = suggestions(M, C, Q, api.materials), tb = qtyTable(M, C, [...new Set([...QTY_STEPS, Q])].sort((a, b) => a - b));
      const pages = drawReport(c, sg, tb, C, api.name());
      const jp = [];
      for (const cv of pages) { const b = await new Promise((r) => cv.toBlob(r, 'image/jpeg', 0.9)); jp.push({ jpeg: new Uint8Array(await b.arrayBuffer()), w: cv.width, h: cv.height }); }
      const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([pdfFromJpegs(jp)], { type: 'application/pdf' }));
      a.download = String(api.name() || 'model').replace(/[^\w\-çğıöşüÇĞİÖŞÜ ]+/g, '_') + '-maliyet-raporu.pdf';
      document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 8000);
      api.toast('PDF maliyet raporu indirildi (' + pages.length + ' sayfa)');
    } catch (e) { api.toast('PDF oluşturulamadı: ' + e.message); }
  }
  return { html, act, input, get config() { return C; } };
}

export function drawReport(c, sg, tb, C, title) {
  const W = 1240, H = 1754, M = 70, pages = [];
  let g, y;
  const newPage = () => { const cv = document.createElement('canvas'); cv.width = W; cv.height = H; g = cv.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, W, H); pages.push(cv); y = M; g.fillStyle = '#64748b'; g.font = '20px sans-serif'; g.textAlign = 'right'; g.fillText('Çizim Atölyesi · Maliyet raporu · sayfa ' + pages.length, W - M, H - 36); g.textAlign = 'left'; };
  const need = (h) => { if (y + h > H - 90) newPage(); };
  const font = (s, b) => { g.font = (b ? 'bold ' : '') + s + 'px sans-serif'; };
  const wrap = (txt, x, maxW, size, color = '#0f172a', bold = false) => { font(size, bold); g.fillStyle = color; const lh = size * 1.35; let line = ''; for (const w of String(txt).split(/\s+/)) { const t = line ? line + ' ' + w : w; if (g.measureText(t).width > maxW && line) { need(lh); g.fillText(line, x, y); y += lh; line = w; } else line = t; } if (line) { need(lh); g.fillText(line, x, y); y += lh; } };
  const kv = (k, v, bold = false, col = '#0f172a') => { need(38); font(23, bold); g.fillStyle = '#334155'; g.fillText(k, M, y); font(23, true); g.fillStyle = col; g.textAlign = 'right'; g.fillText(String(v), W - M, y); g.textAlign = 'left'; g.strokeStyle = '#e2e8f0'; g.beginPath(); g.moveTo(M, y + 11); g.lineTo(W - M, y + 11); g.stroke(); y += 36; };
  const head = (t) => { y += 16; need(70); font(30, true); g.fillStyle = '#0f172a'; g.fillText(t, M, y); y += 40; };
  newPage();
  font(46, true); g.fillStyle = '#0f172a'; g.fillText('ÜRETİM MALİYETİ RAPORU', M, y + 30); y += 70;
  font(24); g.fillStyle = '#475569'; g.fillText(title + ' · ' + c.Q + ' adet · ' + new Date().toLocaleString('tr-TR'), M, y); y += 46;
  if (!c.complete) wrap('EKSİK HESAP: fiyatı girilmeyen kalemler toplama katılmadı → ' + c.missing.join(' · '), M, W - 2 * M, 21, '#b45309', true);
  kv('Toplam hammadde maliyeti (fire dahil)', tl(c.mat.cost));
  if (c.mat.scrapReturn) kv('  Hurda geri satışı', '−' + tl(c.mat.scrapReturn));
  kv('  Fire maliyeti (hammaddenin içinde)', tl(c.mat.fireCost) + ' · ' + f1(c.mat.fireKg) + ' kg');
  kv('Toplam işçilik maliyeti', c.labour.cost != null ? tl(c.labour.cost) + ' · ' + f1(c.labour.hours) + ' sa' : '—');
  kv('Toplam makine maliyeti', tl(c.machine.cost));
  if (c.weldCons) kv('Kaynak sarfı', tl(c.weldCons));
  kv('Ekstra giderler', tl(c.extras.cost));
  kv('GENEL ÜRETİM MALİYETİ', tl(c.total), true, '#0369a1');
  kv('Birim maliyet', tl(c.unit) + ' / adet', true);
  kv('Sabit (parti) / değişken (adet başı)', tl(c.fixed) + ' / ' + tl(c.variableUnit));
  head('Hammadde');
  for (const r of c.mat.rows) kv(r.name + ' · ' + r.material + ' · ham ' + f2(r.raw) + ' / net ' + f2(r.net) + ' kg', r.cost != null ? tl(r.cost) + ' (' + tl(r.price) + '/kg)' : 'fiyat yok');
  for (const p of c.mat.profiles) kv(p.name + ' · ' + p.bars + ' boy · fire %' + String(p.scrapPct).replace('.', ','), p.cost != null ? tl(p.cost) + ' (' + tl(p.price) + ' ' + p.priceUnit.slice(1) + ')' : 'fiyat yok');
  head('İşlemler (makine + süre)');
  for (const o of c.ops.filter((x) => x.on)) kv(o.name + ' · hazırlık ' + f1(o.setupMin) + ' dk + ' + f1(o.runMin) + ' dk/adet' + (o.override ? ' (elle)' : ''), o.cost != null ? tl(o.cost) + ' (' + tl(o.rate) + '/sa)' : 'ücret yok');
  kv('İşçilik: ' + f1(c.labour.hours) + ' sa' + (c.labour.manualHours ? ' (el işçiliği ' + f1(c.labour.manualHours) + ' sa dahil)' : ''), c.labour.rate != null ? tl(c.labour.rate) + '/sa' : 'ücret yok');
  head('Ekstra giderler');
  for (const e of c.extras.items) kv(e.name + ' (' + (e.per === 'unit' ? 'adet başı' : 'parti başı') + ')', e.amount != null ? tl(e.cost) : 'girilmedi');
  head('Adete göre maliyet');
  for (const r of tb) kv(r.q + ' adet · toplam ' + tl(r.total) + (r.complete ? '' : ' (eksik)'), 'birim ' + tl(r.unit), r.q === c.Q);
  head('Maliyet optimizasyonu');
  if (sg.totalSaving > 0) { kv('Mevcut üretim maliyeti', tl(sg.base.total)); kv('Önerilerle (doğrulama gerektirmeyenler)', tl(sg.alt)); kv('Tahmini tasarruf', tl(sg.totalSaving), true, '#166534'); }
  for (const x of sg.items) { need(70); wrap('• ' + x.title + (x.saving > 0 ? ' — tasarruf ' + tl(x.saving) + (x.perUnit ? ' / adet' : '') + (x.verify ? ' (doğrulama gerekir)' : '') : ''), M, W - 2 * M, 22, '#0f172a', true); wrap(x.text, M + 24, W - 2 * M - 24, 20, '#475569'); y += 4; }
  head('Hesaplama varsayımları');
  const P = C.params;
  wrap('Kütle = gerçek 3B hacim × malzeme yoğunluğu (Ağırlık modülü). Ham parça: işleme payı ' + P.allowance + ' mm/yüz (blok, çubuk), sac açınımı + %' + P.sheetScrap + ' yerleşim firesi, profiller kesim optimizasyonu (stok boy, testere payı). Fire = ham − net.', M, W - 2 * M, 20, '#334155');
  wrap('Süreler: profil kesimi ' + P.sawMin + ' dk/kesim, büküm ' + P.bendMin + ' dk, delik ' + P.holeMin + ' dk + derinlik/' + P.drillFeed + ' mm/dk, CNC talaş kaldırma çelik ' + P.mrr.metal + ' / alüminyum ' + P.mrr.aluminyum + ' cm³/dk + ' + P.finishMin + ' dk bitirme, torna ×' + P.latheFactor + ', lazer kalınlığa göre tipik hız, taşlama ' + P.grindMinPerM + ' dk/m dikiş, kaynak süresi Kaynak planından. Hazırlık süreleri parti başına sabit giderdir.', M, W - 2 * M, 20, '#334155');
  wrap('Bütün fiyat ve ücretler kullanıcı tarafından girilmiştir; uygulama piyasa fiyatı kullanmaz. Değerler tahminidir; teklif vermeden önce tedarikçi fiyatları ve atölye süreleriyle doğrulanmalıdır.', M, W - 2 * M, 20, '#991b1b');
  return pages;
}
