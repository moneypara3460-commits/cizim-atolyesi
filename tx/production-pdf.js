// Üretim föyü PDF'i (A4 dikey, çok sayfa): başlık, renk, ölçü tablosu (kaynaklı), malzeme ve tüketim (varsayımlı),
// kesim planı, operasyon listesi, maliyet (bedene göre), sipariş ve malzeme ihtiyacı, doğrulanmamış / eksik kalemler.
import { pdfDoc, textWidth } from './pdf.js?v=20261112j';
import * as M from './model.js?v=20261112j';
import { OP_MACHINES, opsSummary } from './production.js?v=20261112j';
import { machineStatus } from './knit/machine.js?v=20261112j';
import { drapeVerdict } from './sim3d/drape.js?v=20261112j';

const n2 = (v, d = 2) => (v == null ? '—' : (Math.round(v * 10 ** d) / 10 ** d).toFixed(d).replace('.', ','));

export function productionPDF(p, productId, { date = new Date() } = {}) {
  const s = M.techpackSummary(p, productId), sh = M.productionSheet(p, productId), pr = sh.product, H = s.header, cur = pr.costing.currency || 'TL';
  const doc = pdfDoc(), W = 210, Hh = 297, X = 14, R = W - 14; let pg, y, pageNo = 0;
  const newPage = () => { pg = doc.page(W, Hh); pageNo++; y = Hh - 14; pg.text(X, 8, 7, `${H.project} · ${H.product}${H.modelCode ? ' · ' + H.modelCode : ''} · rev ${H.rev} · sayfa ${pageNo}`); };
  const need = (h) => { if (y - h < 16) newPage(); };
  const wrap = (str, size, width) => { const out = []; let line = ''; for (const w of String(str).split(/\s+/)) { const t = line ? line + ' ' + w : w; if (textWidth(t, size) > width && line) { out.push(line); line = w; } else line = t; } if (line) out.push(line); return out; };
  const para = (str, size = 8, indent = 0) => { for (const l of wrap(str, size, R - X - indent)) { need(size * 0.45); pg.text(X + indent, y, size, l); y -= size * 0.45; } y -= 1; };
  const head = (t) => { need(14); y -= 2; pg.fillRect(X, y - 1.5, R - X, 6, 0.9, 0.93, 0.97); pg.text(X + 1.5, y, 10, t); y -= 8; };
  const table = (cols, rows, size = 7.5) => {
    const tw = R - X, ws = cols.map((c) => c.w * tw), rh = size * 0.5;
    const row = (cells, bold) => { need(rh + 1); let x = X; cells.forEach((c, k) => { const t = String(c ?? ''), cut = (() => { let u = t; while (u.length > 1 && textWidth(u, size) > ws[k] - 1.5) u = u.slice(0, -1); return u === t ? t : u.slice(0, -1) + '…'; })(); pg.text(cols[k].right ? x + ws[k] - 1 - textWidth(cut, size) : x + 0.8, y, size, cut); x += ws[k]; }); if (bold) { pg.lineWidth(0.2); pg.line(X, y - 1.3, R, y - 1.3); } y -= rh + 0.6; };
    row(cols.map((c) => c.label), true); rows.forEach((r) => row(r)); y -= 2;
  };
  newPage();
  pg.text(X, y, 16, 'Üretim föyü'); y -= 8;
  table([{ label: '', w: 0.2 }, { label: '', w: 0.3 }, { label: '', w: 0.2 }, { label: '', w: 0.3 }], [
    ['Proje', H.project, 'Koleksiyon', H.collection || '—'], ['Ürün', H.product, 'Model kodu', H.modelCode || '—'], ['Dal / tür', `${H.branch} · ${H.type}`, 'Durum', H.status],
    ['Revizyon', H.rev, 'Tarih', date.toISOString().slice(0, 10)],
  ]);
  head('Renkler ve varyantlar');
  para(s.colors.map((c) => `${c.name}${c.code ? ' (' + c.code + ')' : ''}`).join(' · ') || 'Renk seçilmedi.');
  para(`Varyant (SKU) sayısı ${s.variants.length}: ` + s.variants.slice(0, 40).map((v) => v.sku).join(', ') + (s.variants.length > 40 ? ' …' : ''), 7);
  head('Ölçü tablosu (cm)');
  if (s.sizeTable) {
    para(`${s.sizeTable.name} · kaynak: ${s.sizeTable.source || 'YAZILMAMIŞ'}`, 7.5);
    const sz = s.sizeTable.sizes, w = 0.62 / Math.max(1, sz.length);
    table([{ label: 'Ölçü', w: 0.38 }, ...sz.map((z) => ({ label: z, w, right: true }))], Object.entries(s.sizeTable.measures).map(([k, row]) => [k, ...sz.map((z) => (row[z] == null ? '—' : n2(row[z] / 10, 1)))]));
  } else para('Ürüne beden tablosu bağlı değil (eksik).');
  head('Malzeme ve tüketim');
  table([{ label: 'Malzeme', w: 0.36 }, { label: 'Tür', w: 0.14 }, { label: 'Kullanım', w: 0.14 }, { label: 'Ürün başı (elle)', w: 0.18, right: true }, { label: 'Not', w: 0.18 }],
    s.materials.filter(Boolean).map((m) => [m.name, m.kind, m.role, m.qty == null ? '—' : `${n2(m.qty, 3)} ${m.unit}`, m.estimated.length ? 'tahmini değer' : '']));
  const zs = Object.keys(sh.consumption.sizes);
  if (zs.length) {
    table([{ label: 'Beden', w: 0.14 }, { label: 'Malzeme', w: 0.4 }, { label: 'Tüketim', w: 0.26, right: true }, { label: 'Kaynak', w: 0.2 }],
      zs.flatMap((z) => Object.values(sh.consumption.sizes[z]).map((c) => [z, c.name, c.qty == null ? '—' : `${n2(c.qty, 3)} ${c.unit}`, c.detail?.marker ? 'kesim planı' : 'hesap (tahmini)'])));
    para('Varsayımlar: ' + (sh.consumption.notes.join(' · ') || '—'), 7);
  }
  for (const e of sh.consumption.errors) para('EKSİK: ' + e, 7.5);
  const mk = (p.woven?.markers || []).filter((x) => x.product === productId);
  if (mk.length) { head('Kesim planı'); table([{ label: 'Beden', w: 0.15 }, { label: 'Serim', w: 0.25 }, { label: 'Boy', w: 0.2, right: true }, { label: 'Verim', w: 0.2, right: true }, { label: 'Kumaş', w: 0.2 }], mk.map((m) => [m.size || '—', m.mode === 'folded' ? 'katlı' : 'açık en', n2(m.length / 10, 1) + ' cm', '%' + n2(m.efficiency * 100, 1), p.library.materials.find((x) => x.id === m.fabric)?.name || '—'])); para('Kesimden önce operatör planı kontrol etmelidir.', 7); }
  head('Operasyon listesi (dikim / örgü sırası)');
  const os = opsSummary(pr.techpack.ops);
  if (pr.techpack.ops.length) {
    table([{ label: '#', w: 0.06, right: true }, { label: 'Operasyon', w: 0.46 }, { label: 'Makine', w: 0.3 }, { label: 'Süre (dk)', w: 0.18, right: true }],
      pr.techpack.ops.map((o, k) => [k + 1, o.name, OP_MACHINES[o.machine] || o.machine, o.smv == null ? 'EKSİK' : n2(o.smv) + (o.est ? ' (tahmini)' : '')]));
    para(`Toplam ${n2(os.total)} dk (SMV)${os.missing ? `, ${os.missing} operasyonun süresi eksik` : ''}${os.estimated ? '; şablon süreleri tahminidir, firma zaman etüdüyle değiştirilmeli' : ''}.`, 7.5);
    para('Makine başına: ' + Object.entries(os.byMachine).map(([k, v]) => `${OP_MACHINES[k] || k} ${n2(v)} dk`).join(' · '), 7);
  } else para('Operasyon listesi boş (eksik).');
  head(`Maliyet (bedene göre, ${cur})`);
  const c0 = pr.costing; para(`Girdiler: dakika ücreti ${c0.minuteRate ?? 'EKSİK'} · hat verimi %${c0.efficiency ?? 'EKSİK'} · genel gider %${c0.overheadPct ?? 'EKSİK'} · kâr %${c0.marginPct ?? 'EKSİK'}${c0.vatPct != null ? ' · KDV %' + c0.vatPct : ''}`, 7.5);
  const szs = Object.keys(sh.perSize), labels = sh.perSize[szs[0]].lines.map((l) => l.label), w2 = 0.6 / Math.max(1, szs.length);
  table([{ label: 'Kalem', w: 0.4 }, ...szs.map((z) => ({ label: z || '—', w: w2, right: true }))], labels.map((lb, k) => [lb, ...szs.map((z) => n2(sh.perSize[z].lines[k].value))]));
  const miss = [...new Set(szs.flatMap((z) => sh.perSize[z].missing))]; if (miss.length) para('Eksik girdiler (ilgili kalemler hesaplanmadı): ' + miss.join('; '), 7.5);
  if (szs.some((z) => sh.perSize[z].estimated)) para('Uyarı: maliyette tahmini değerler var (hesaplanan tüketim, şablon süreleri ya da tahmini malzeme kartı).', 7.5);
  head('Sipariş ve malzeme ihtiyacı');
  const ord = Object.entries(pr.order).filter(([, q]) => q > 0);
  para(ord.length ? 'Sipariş: ' + ord.map(([z, q]) => `${z} ${q}`).join(' · ') + ` (toplam ${sh.requirement.units})` + (c0.wastePct ? ` · fire %${c0.wastePct}` : ' · fire girilmedi (%0)') : 'Sipariş adedi girilmedi.', 7.5);
  if (sh.requirement.lines.length) table([{ label: 'Malzeme', w: 0.4 }, { label: 'Net', w: 0.2, right: true }, { label: 'Fire dahil', w: 0.2, right: true }, { label: 'Tutar', w: 0.2, right: true }], sh.requirement.lines.map((l) => [l.name, `${n2(l.net)} ${l.unit}`, `${n2(l.qty)} ${l.unit}`, l.cost == null ? 'EKSİK' : n2(l.cost)]));
  for (const e of sh.requirement.problems) para('EKSİK: ' + e, 7.5);
  // doğrulanmamış kalemler: triko makinesi, dökümlülük, ürün sorunları
  head('Doğrulanmamış ve açık kalemler');
  const open = [];
  for (const m of p.knit?.machines || []) { const st = machineStatus(m); if (!st.ready) open.push(`Makine ${m.name}: ${st.text}`); }
  for (const l of pr.materials) { const m = p.library.materials.find((x) => x.id === l.mat); const v = m && drapeVerdict(m); if (v && !v.verified) open.push(`${m.name} dökümlülük: ${v.text}`); }
  for (const x of s.issues) open.push(`${x.level === 'hata' ? 'HATA' : 'Uyarı'}: ${x.msg}`);
  if (open.length) for (const o of open) para('• ' + o, 7.5); else para('Açık kalem yok.');
  para('Bu föy bilgisayarla hesaplanmıştır; numune ve prova onayı olmadan seri üretime alınmamalıdır.', 7.5);
  return { bytes: doc.build(), pages: pageNo };
}
