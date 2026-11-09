// Akıllı Ağırlık ve Ağırlık Merkezi — "Ağırlık" sekmesi arayüzü.
// api: { compute() → analyzeWeight sonucu (önbellekli), materials, partMat(id), setMat(id, matId), setRho(id, v|null), focusPart(id),
//        show3D (get/set), showLift (get/set), render(), toast(m), name(), snapshot()? }
import { pdfFromJpegs } from './cutopt.js?v=20261109g';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
export const fkg = (kg) => (kg == null ? '—' : kg >= 1000 ? (kg / 1000).toLocaleString('tr-TR', { maximumFractionDigits: 3 }) + ' t' : kg >= 1 ? kg.toLocaleString('tr-TR', { maximumFractionDigits: 2 }) + ' kg' : (kg * 1000).toLocaleString('tr-TR', { maximumFractionDigits: 1 }) + ' g');
const f0 = (v) => Math.round(v).toLocaleString('tr-TR');
const f1 = (v) => (Math.round(v * 10) / 10).toLocaleString('tr-TR');
const STATUS = { ok: ['🟢', 'Dengede', '#22c55e'], care: ['🟡', 'Dikkat', '#eab308'], high: ['🟠', 'Yüksek devrilme riski', '#f97316'], tips: ['🔴', 'Devrilir', '#ef4444'], line: ['🔴', 'Kendi başına durmaz', '#ef4444'] };

export function createWeightUI(api) {
  const S = { sortBy: 'kg', open: false };

  function html() {
    let R;
    try { R = api.compute(); } catch (e) { return note('⚠ Ağırlık hesaplanamadı: ' + esc(e.message)); }
    if (!R || !R.parts.length) return note('Önce bir model olmalı (görünür katı parça yok).');
    const T = R.total, c = T.com;
    let h = '<div class="lbl h">Akıllı Ağırlık ve Ağırlık Merkezi</div>';
    h += card(`<div style="font-size:13px;color:#94a3b8">${R.estimate ? 'TAHMİNİ toplam ağırlık' : 'Toplam ağırlık'}</div>` +
      `<div style="font-size:30px;font-weight:800;margin:2px 0 4px">${fkg(T.kg)}</div>` +
      row('Ağırlık kuvveti', f1(T.N / 1000) + ' kN (' + f0(T.N) + ' N)') + row('Malzeme hacmi', f1(T.volume / 1000) + ' cm³') +
      (c ? row('Ağırlık merkezi X', f0(c[0]) + ' mm') + row('Ağırlık merkezi Y (yükseklik)', f0(c[1]) + ' mm') + row('Ağırlık merkezi Z', f0(c[2]) + ' mm') : row('Ağırlık merkezi', 'hesaplanamadı')) +
      (R.balance ? row('Zeminden yükseklik', f0(R.balance.comHeight) + ' mm') : ''));
    for (const n of R.notes) h += note((n.sev === 'warn' ? '⚠ ' : 'ℹ ') + esc(n.text));
    h += btn((api.show3D ? '◉' : '○') + ' 3B işaret her sekmede görünsün', 'wg-3d', api.show3D) + btn('📄 PDF ağırlık raporu', 'wg-pdf');
    // dağılımlar
    h += '<div class="lbl h">Malzemeye göre</div>' + card(R.byMat.map(([k, v]) => bar(k, v, T.kg)).join('') || note('—'));
    h += '<div class="lbl h">Türe göre</div>' + card(R.byCat.map(([k, v]) => bar(k, v, T.kg)).join(''));
    // denge
    const B = R.balance;
    h += '<div class="lbl h">Denge analizi</div>';
    if (B) {
      const st = STATUS[B.status] || STATUS.ok;
      h += card(`<div style="font-weight:800;font-size:16px;color:${st[2]}">${st[0]} ${st[1]}</div><div style="font-size:14px;margin:4px 0 6px">${esc(B.text)}</div>` +
        (B.hull.length >= 3 ? row('Destek alanı (taban)', f0(B.width[0]) + ' × ' + f0(B.width[1]) + ' mm') + row('Destek bölgesi (ayak)', B.feet.length) +
          row('Ağırlık merkezinin kenara uzaklığı', B.inside ? f0(B.margin) + ' mm' : 'dışarıda (' + f0(B.margin) + ' mm)') +
          (B.inside ? row('Devrilme açısı (en zayıf yön ' + esc(B.dir) + ')', f1(B.tipDeg) + '°') : '') : '') +
        B.issues.map((s) => `<div style="font-size:13.5px;color:#fde68a;margin-top:6px">⚠ ${esc(s)}</div>`).join(''));
      if (B.feet.length > 1 && B.feet.length <= 24) {
        h += card('<div style="font-size:13px;color:#94a3b8;margin-bottom:4px">Ayaklara düşen yük (rijit gövde, düz zemin)</div>' +
          B.feet.map((f, i) => row('Ayak ' + (i + 1) + ' · X ' + f0(f.c[0]) + ' / Z ' + f0(f.c[1]), fkg(f.kg) + ' · %' + Math.round(f.kg / T.kg * 100))).join(''));
      }
      h += note('Devrilme açısı: modelin en zayıf kenarı üzerinden kaç derece eğilince devrileceği (atan(kenar uzaklığı / ağırlık merkezi yüksekliği)). Statik hesaptır; titreşim, darbe, rüzgâr ve hareketli yükler dahil değildir.');
    }
    // kaldırma
    const L = R.lift;
    h += '<div class="lbl h">Taşıma ve kaldırma</div>';
    if (L) {
      h += card(row('Kaldırılacak ağırlık', fkg(L.kg) + ' (' + f1(L.N / 1000) + ' kN)') +
        row('Önerilen kaldırma noktası', L.points.length + ' adet · üst yüzde (Y ' + f0(L.points[0].y) + ')') +
        L.points.map((q, i) => row('Nokta ' + (i + 1) + ' · X ' + f0(q.x) + ' / Z ' + f0(q.z), fkg(q.kg))).join('') +
        L.legs.map((g) => row('Sapan bacağı (' + g.ang + '° yataydan)', 'en çok ' + fkg(Math.max(...g.legKg)) + ' · kanca ≥ ' + f0(g.hookHeight) + ' mm yukarıda')).join('') +
        row('Kanca, ağırlık merkezinin tam üstünde', 'X ' + f0(c[0]) + ' / Z ' + f0(c[2])) +
        L.notes.map((s) => `<div style="font-size:13.5px;color:#fde68a;margin-top:6px">⚠ ${esc(s)}</div>`).join(''));
      h += btn((api.showLift ? '◉' : '○') + ' Kaldırma noktalarını 3B göster', 'wg-lift', api.showLift);
      h += note('Sapan açısı küçüldükçe bacak kuvveti artar (60° → ×1,15, 45° → ×1,41, 30° → ×2). Sapan ve kaldırma ekipmanının çalışma yük sınırı (WLL) bu değerlerin üstünde olmalı.');
    }
    // parçalar
    h += '<div class="lbl h">Parçalar (' + R.parts.length + ')</div>' + btn('Sırala: ' + (S.sortBy === 'kg' ? 'ağırlık' : 'ad'), 'wg-sort');
    const list = R.parts.slice().sort((a, b) => (S.sortBy === 'kg' ? (b.kg || 0) - (a.kg || 0) : String(a.name).localeCompare(String(b.name), 'tr')));
    for (const p of list) {
      const cur = api.partMat(p.id);
      h += `<div style="flex:1 0 100%;background:#111a2e;border:1px solid #1e293b;border-radius:12px;padding:8px 10px">` +
        `<button data-act="wg-p-${p.id}" style="all:unset;display:flex;justify-content:space-between;width:100%;cursor:pointer;gap:8px"><b style="font-size:15px">${esc(p.name)}</b><b style="font-size:15px">${fkg(p.kg)}${T.kg && p.kg != null ? ' <span style="color:#94a3b8;font-weight:600">%' + Math.round(p.kg / T.kg * 100) + '</span>' : ''}</b></button>` +
        `<div style="font-size:12.5px;color:#94a3b8;margin:3px 0 6px">${esc(p.cat)} · ${f1(p.volume / 1000)} cm³ · ${p.rho != null ? f1(p.rho) + ' g/cm³' : 'yoğunluk yok'}${p.com ? ' · merkez ' + f0(p.com[0]) + ' / ' + f0(p.com[1]) + ' / ' + f0(p.com[2]) : ''}${p.exact ? '' : ' · <span style="color:#fbbf24">tahmini</span>'}</div>` +
        `<div style="display:flex;gap:6px;flex-wrap:wrap"><label class="f" style="flex:2 1 150px"><span>Malzeme${cur.src === 'varsayılan' ? ' (seçilmedi)' : ''}</span><select data-wg="mat" data-pid="${p.id}">` +
        api.materials.map((m) => `<option value="${m.id}"${m.id === cur.id ? ' selected' : ''}>${esc(m.name)} · ${String(m.rho).replace('.', ',')}</option>`).join('') + '</select></label>' +
        `<label class="f" style="flex:1 1 110px"><span>Özel yoğunluk g/cm³</span><input type="number" step="any" inputmode="decimal" data-wg="rho" data-pid="${p.id}" value="${cur.custom != null ? esc(cur.custom) : ''}" placeholder="boş = malzeme"></label></div></div>`;
    }
    h += note('Kütle = hacim × yoğunluk; hacim gerçek 3B geometriden (oyuklar düşülmüş, iç içe parçalar iki kez sayılmadan) hesaplanır. İç içe geçen bölge, sıralamada sonra gelen parçaya sayılır. Yoğunluklar oda sıcaklığındaki tipik değerlerdir; alaşıma göre birkaç % değişebilir.');
    return h;
  }
  const btn = (l, a, on) => `<button data-act="${a}"${on ? ' class="on"' : ''}>${l}</button>`;
  const note = (t) => `<div class="lbl" style="flex:1 0 100%;font-size:13px;line-height:1.4">${t}</div>`;
  const card = (inner) => `<div style="flex:1 0 100%;background:#111a2e;border:1px solid #1e293b;border-radius:12px;padding:10px">${inner}</div>`;
  const row = (k, v) => `<div style="display:flex;justify-content:space-between;gap:8px;padding:4px 0;border-top:1px solid #1e293b;font-size:14px"><span style="color:#94a3b8">${k}</span><b style="text-align:right">${v}</b></div>`;
  const bar = (k, v, tot) => `<div style="padding:4px 0;font-size:14px"><div style="display:flex;justify-content:space-between"><span>${esc(k)}</span><b>${fkg(v)} · %${tot ? Math.round(v / tot * 100) : 0}</b></div><div style="height:6px;background:#1e293b;border-radius:3px;margin-top:3px"><div style="height:100%;width:${tot ? Math.max(1, v / tot * 100) : 0}%;background:#38bdf8;border-radius:3px"></div></div></div>`;

  function act(a) {
    if (a === 'wg-3d') { api.show3D = !api.show3D; api.render(); return true; }
    if (a === 'wg-lift') { api.showLift = !api.showLift; api.render(); return true; }
    if (a === 'wg-sort') { S.sortBy = S.sortBy === 'kg' ? 'name' : 'kg'; api.render(); return true; }
    if (a === 'wg-pdf') { exportPDF(); return true; }
    const m = a.match(/^wg-p-(\d+)$/);
    if (m) { api.focusPart(+m[1]); return true; }
    return false;
  }
  function input(el, type) {
    const id = +el.dataset.pid, k = el.dataset.wg;
    if (k === 'mat') { api.setMat(id, el.value); return; }
    if (k === 'rho' && type === 'change') {
      const v = parseFloat(String(el.value).replace(',', '.'));
      if (el.value.trim() === '') api.setRho(id, null);
      else if (v > 0 && v < 30) api.setRho(id, v);
      else { api.toast('Yoğunluk 0 ile 30 g/cm³ arasında olmalı'); api.render(); }
    }
  }
  async function exportPDF() {
    let R;
    try { R = api.compute(); } catch (e) { api.toast('Hesap yapılamadı'); return; }
    if (!R || !R.parts.length) { api.toast('Model yok'); return; }
    api.toast('PDF hazırlanıyor…');
    try {
      let shot = null; try { shot = api.snapshot ? api.snapshot() : null; } catch (e) { shot = null; }
      const pages = drawReport(R, api.name(), shot);
      const jp = [];
      for (const c of pages) { const b = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.9)); jp.push({ jpeg: new Uint8Array(await b.arrayBuffer()), w: c.width, h: c.height }); }
      const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([pdfFromJpegs(jp)], { type: 'application/pdf' }));
      a.download = String(api.name() || 'model').replace(/[^\w\-çğıöşüÇĞİÖŞÜ ]+/g, '_') + '-agirlik-raporu.pdf';
      document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 8000);
      api.toast('PDF ağırlık raporu indirildi (' + pages.length + ' sayfa)');
    } catch (e) { api.toast('PDF oluşturulamadı: ' + e.message); }
  }
  return { html, act, input, get state() { return S; } };
}

/* ---------- PDF ---------- */
export function drawReport(R, title, shot) {
  const W = 1240, H = 1754, M = 70, pages = [];
  let g, y;
  const newPage = () => { const c = document.createElement('canvas'); c.width = W; c.height = H; g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, W, H); pages.push(c); y = M; g.fillStyle = '#64748b'; g.font = '20px sans-serif'; g.textAlign = 'right'; g.fillText('Çizim Atölyesi · Ağırlık raporu · sayfa ' + pages.length, W - M, H - 36); g.textAlign = 'left'; };
  const need = (h) => { if (y + h > H - 90) newPage(); };
  const font = (s, b) => { g.font = (b ? 'bold ' : '') + s + 'px sans-serif'; };
  const wrap = (txt, x, maxW, size, color = '#0f172a', bold = false) => { font(size, bold); g.fillStyle = color; const lh = size * 1.35; let line = ''; for (const w of String(txt).split(/\s+/)) { const t = line ? line + ' ' + w : w; if (g.measureText(t).width > maxW && line) { need(lh); g.fillText(line, x, y); y += lh; line = w; } else line = t; } if (line) { need(lh); g.fillText(line, x, y); y += lh; } };
  const kv = (k, v, col = '#0f172a') => { need(40); font(24); g.fillStyle = '#334155'; g.fillText(k, M, y); font(24, true); g.fillStyle = col; g.textAlign = 'right'; g.fillText(String(v), W - M, y); g.textAlign = 'left'; g.strokeStyle = '#e2e8f0'; g.beginPath(); g.moveTo(M, y + 12); g.lineTo(W - M, y + 12); g.stroke(); y += 38; };
  const head = (t) => { y += 18; need(70); font(32, true); g.fillStyle = '#0f172a'; g.fillText(t, M, y); y += 42; };
  newPage();
  font(46, true); g.fillStyle = '#0f172a'; g.fillText('AĞIRLIK RAPORU', M, y + 30); y += 70;
  font(24); g.fillStyle = '#475569'; g.fillText(title + ' · ' + new Date().toLocaleString('tr-TR'), M, y); y += 50;
  const T = R.total, c = T.com;
  kv(R.estimate ? 'Toplam ağırlık (TAHMİNİ)' : 'Toplam ağırlık', fkg(T.kg));
  kv('Ağırlık kuvveti', f1(T.N / 1000) + ' kN');
  kv('Malzeme hacmi', f1(T.volume / 1000) + ' cm³');
  if (c) { kv('Ağırlık merkezi X', f0(c[0]) + ' mm'); kv('Ağırlık merkezi Y (yükseklik)', f0(c[1]) + ' mm'); kv('Ağırlık merkezi Z', f0(c[2]) + ' mm'); }
  for (const n of R.notes) wrap((n.sev === 'warn' ? '⚠ ' : 'Not: ') + n.text, M, W - 2 * M, 21, n.sev === 'warn' ? '#b45309' : '#475569');
  if (shot) { y += 14; const sw = W - 2 * M, sh = Math.min(500, sw * shot.height / shot.width); need(sh + 10); const k = Math.min(sw / shot.width, sh / shot.height); g.fillStyle = '#0b1220'; g.fillRect(M, y, sw, sh); g.drawImage(shot, M + (sw - shot.width * k) / 2, y + (sh - shot.height * k) / 2, shot.width * k, shot.height * k); y += sh + 12; }
  head('Malzeme listesi');
  for (const [k, v] of R.byMat) kv(k, fkg(v) + ' · %' + Math.round(v / T.kg * 100));
  head('Türe göre');
  for (const [k, v] of R.byCat) kv(k, fkg(v) + ' · %' + Math.round(v / T.kg * 100));
  head('Parça ağırlıkları');
  font(19, true); g.fillStyle = '#475569'; const cols = [M, M + 420, M + 690, M + 820, M + 960]; ['Parça', 'Malzeme', 'Hacim cm³', 'Ağırlık', 'Merkez X/Y/Z'].forEach((t, i) => g.fillText(t, cols[i], y)); y += 30;
  for (const p of R.parts.slice().sort((a, b) => (b.kg || 0) - (a.kg || 0))) {
    need(34); font(19); g.fillStyle = '#0f172a';
    g.fillText(String(p.name).slice(0, 34), cols[0], y);
    g.fillText(String(p.rhoSrc === 'özel' ? 'Özel ' + f1(p.rho) : p.material ? p.material.name : '—').slice(0, 22), cols[1], y);
    g.fillText(f1(p.volume / 1000), cols[2], y); g.fillText(fkg(p.kg) + (p.exact ? '' : ' *'), cols[3], y);
    g.fillText(p.com ? f0(p.com[0]) + ' / ' + f0(p.com[1]) + ' / ' + f0(p.com[2]) : '—', cols[4], y);
    y += 32;
  }
  if (R.parts.some((p) => !p.exact)) wrap('* tahmini: oyuk / çakışma düşülemedi', M, W - 2 * M, 18, '#b45309');
  const B = R.balance;
  if (B) {
    head('Denge analizi');
    const st = STATUS[B.status] || STATUS.ok;
    wrap(st[1] + ': ' + B.text, M, W - 2 * M, 24, st[2] === '#22c55e' ? '#166534' : '#b45309', true);
    if (B.hull.length >= 3) { kv('Destek alanı', f0(B.width[0]) + ' × ' + f0(B.width[1]) + ' mm · ' + B.feet.length + ' destek'); kv('Ağırlık merkezi zeminden', f0(B.comHeight) + ' mm'); kv('Kenara uzaklık', (B.inside ? '' : 'dışarıda ') + f0(B.margin) + ' mm'); if (B.inside) kv('Devrilme açısı (' + B.dir + ')', f1(B.tipDeg) + '°'); }
    for (const s of B.issues) wrap('⚠ ' + s, M, W - 2 * M, 21, '#b45309');
    if (B.feet.length > 1 && B.feet.length <= 24) B.feet.forEach((f, i) => kv('Ayak ' + (i + 1) + ' (X ' + f0(f.c[0]) + ' / Z ' + f0(f.c[1]) + ')', fkg(f.kg)));
  }
  const L = R.lift;
  if (L) {
    head('Taşıma ve kaldırma');
    kv('Kaldırılacak ağırlık', fkg(L.kg) + ' (' + f1(L.N / 1000) + ' kN)');
    L.points.forEach((q, i) => kv('Kaldırma noktası ' + (i + 1) + ' (X ' + f0(q.x) + ' / Y ' + f0(q.y) + ' / Z ' + f0(q.z) + ')', fkg(q.kg)));
    L.legs.forEach((lg) => kv('Sapan bacağı ' + lg.ang + '° · kanca yüksekliği ≥ ' + f0(lg.hookHeight) + ' mm', 'en çok ' + fkg(Math.max(...lg.legKg))));
    for (const s of L.notes) wrap('⚠ ' + s, M, W - 2 * M, 21, '#b45309');
  }
  y += 10; wrap('Bu rapor geometriden yapılan bir ön hesaptır. Yapısal dayanım, kaldırma ekipmanı ve kaldırma noktalarının uygunluğu mühendislik doğrulaması gerektirir.', M, W - 2 * M, 19, '#991b1b');
  return pages;
}
